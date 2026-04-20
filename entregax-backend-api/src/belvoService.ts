// ============================================
// BELVO SERVICE
// API client + transaction processing + auto-matching
// ============================================

import axios, { AxiosInstance } from 'axios';
import { pool } from './db';
import crypto from 'crypto';

// --------------- CONFIG ---------------
const BELVO_SECRET_ID = process.env.BELVO_SECRET_ID || '';
const BELVO_SECRET_PASSWORD = process.env.BELVO_SECRET_PASSWORD || '';
const BELVO_ENV = process.env.BELVO_ENV || 'sandbox'; // 'sandbox' or 'production'
const BELVO_BASE_URL = BELVO_ENV === 'production'
  ? 'https://api.belvo.com'
  : 'https://sandbox.belvo.com';

// --------------- API CLIENT ---------------
function getClient(): AxiosInstance {
  if (!BELVO_SECRET_ID || !BELVO_SECRET_PASSWORD) {
    throw new Error('Belvo credentials not configured. Set BELVO_SECRET_ID and BELVO_SECRET_PASSWORD in .env');
  }
  return axios.create({
    baseURL: BELVO_BASE_URL,
    auth: {
      username: BELVO_SECRET_ID,
      password: BELVO_SECRET_PASSWORD,
    },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
}

// --------------- WIDGET ACCESS TOKEN ---------------
export async function createWidgetToken(options?: { link_id?: string; widget_branding?: any }): Promise<string> {
  const client = getClient();
  const payload: any = {
    id: BELVO_SECRET_ID,
    password: BELVO_SECRET_PASSWORD,
    ...(options?.link_id && { link_id: options.link_id }),
    ...(options?.widget_branding && { widget: options.widget_branding }),
  };
  const response = await client.post('/api/token/', payload);
  return response.data.access;
}

// --------------- LINK MANAGEMENT ---------------
export async function registerLink(
  emitterId: number,
  belvoLinkId: string,
  institution: string,
  institutionName: string,
  accessMode: string,
  createdBy: number
): Promise<any> {
  const result = await pool.query(`
    INSERT INTO belvo_links (emitter_id, belvo_link_id, institution, institution_name, access_mode, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (belvo_link_id) DO UPDATE SET
      emitter_id = EXCLUDED.emitter_id,
      institution = EXCLUDED.institution,
      institution_name = EXCLUDED.institution_name,
      status = 'valid',
      updated_at = NOW()
    RETURNING *
  `, [emitterId, belvoLinkId, institution, institutionName, accessMode || 'recurrent', createdBy]);

  // Update emitter with belvo status
  await pool.query(`
    UPDATE fiscal_emitters 
    SET belvo_connected = true, belvo_institution = $1, belvo_last_sync = NOW()
    WHERE id = $2
  `, [institutionName, emitterId]);

  return result.rows[0];
}

export async function getLinksForEmitter(emitterId: number): Promise<any[]> {
  const result = await pool.query(
    'SELECT * FROM belvo_links WHERE emitter_id = $1 ORDER BY created_at DESC',
    [emitterId]
  );
  return result.rows;
}

export async function getAllLinks(): Promise<any[]> {
  const result = await pool.query(`
    SELECT bl.*, fe.alias as emitter_alias, fe.rfc as emitter_rfc, fe.bank_name
    FROM belvo_links bl
    JOIN fiscal_emitters fe ON fe.id = bl.emitter_id
    ORDER BY bl.created_at DESC
  `);
  return result.rows;
}

export async function deleteLink(linkId: number): Promise<boolean> {
  const link = await pool.query('SELECT * FROM belvo_links WHERE id = $1', [linkId]);
  if (link.rows.length === 0) return false;

  const belvoLinkId = link.rows[0].belvo_link_id;
  const emitterId = link.rows[0].emitter_id;

  // Delete from Belvo API
  try {
    const client = getClient();
    await client.delete(`/api/links/${belvoLinkId}/`);
  } catch (err: any) {
    console.warn('⚠️ Could not delete Belvo link from API:', err.message);
  }

  // Delete from DB (cascades to transactions)
  await pool.query('DELETE FROM belvo_links WHERE id = $1', [linkId]);

  // Check if emitter still has other links
  const remaining = await pool.query('SELECT COUNT(*) FROM belvo_links WHERE emitter_id = $1', [emitterId]);
  if (parseInt(remaining.rows[0].count) === 0) {
    await pool.query('UPDATE fiscal_emitters SET belvo_connected = false, belvo_institution = NULL WHERE id = $1', [emitterId]);
  }

  return true;
}

// --------------- FETCH TRANSACTIONS ---------------
export async function fetchTransactions(
  belvoLinkId: string,
  dateFrom: string,
  dateTo: string
): Promise<any[]> {
  const client = getClient();
  const response = await client.post('/api/transactions/', {
    link: belvoLinkId,
    date_from: dateFrom,
    date_to: dateTo,
  });
  return response.data;
}

// --------------- PROCESS & STORE TRANSACTIONS ---------------
export async function processTransactions(
  dbLinkId: number,
  emitterId: number,
  transactions: any[]
): Promise<{ new_count: number; duplicate_count: number; matched_count: number }> {
  let newCount = 0;
  let duplicateCount = 0;
  let matchedCount = 0;

  for (const tx of transactions) {
    try {
      // Insert transaction (deduplicate by belvo_transaction_id)
      const result = await pool.query(`
        INSERT INTO belvo_transactions (
          belvo_link_id, belvo_transaction_id, emitter_id, account_id,
          value_date, accounting_date, amount, balance, currency,
          description, reference, type, category, subcategory,
          merchant_name, status, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (belvo_transaction_id) DO NOTHING
        RETURNING id
      `, [
        dbLinkId,
        tx.id,
        emitterId,
        tx.account?.id || tx.account_id || null,
        tx.value_date,
        tx.accounting_date || tx.value_date,
        Math.abs(tx.amount),
        tx.balance || null,
        tx.currency || 'MXN',
        tx.description || '',
        tx.reference || '',
        tx.type || (tx.amount >= 0 ? 'INFLOW' : 'OUTFLOW'),
        tx.category || null,
        tx.subcategory || null,
        tx.merchant?.name ?? null,
        tx.status || 'PROCESSED',
        JSON.stringify(tx),
      ]);

      if (result.rows.length > 0) {
        newCount++;
        const txId = result.rows[0].id;
        const txType = tx.type || (tx.amount >= 0 ? 'INFLOW' : 'OUTFLOW');

        // Also insert into bank_statement_entries for unified view
        const hashInput = `belvo|${tx.id}|${tx.value_date}|${tx.amount}`;
        const entryHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 64);

        await pool.query(`
          INSERT INTO bank_statement_entries (
            empresa_id, banco, fecha, concepto, referencia,
            cargo, abono, saldo, entry_hash, source, belvo_transaction_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'belvo', $10)
          ON CONFLICT (empresa_id, entry_hash) DO NOTHING
        `, [
          emitterId,
          extractBankName(tx),
          tx.value_date,
          tx.description ?? '',
          tx.reference ?? '',
          txType === 'OUTFLOW' ? Math.abs(tx.amount) : null,
          txType === 'INFLOW' ? Math.abs(tx.amount) : null,
          tx.balance || null,
          entryHash,
          txId,
        ]);

        // Auto-match INFLOW transactions
        if (txType === 'INFLOW' && Math.abs(tx.amount) > 0) {
          const matched = await autoMatchTransaction(txId, emitterId, Math.abs(tx.amount), tx.description ?? '', tx.reference ?? '');
          if (matched) matchedCount++;
        }
      } else {
        duplicateCount++;
      }
    } catch (err: any) {
      if (err.code === '23505') {
        duplicateCount++;
      } else {
        console.error('Error processing Belvo transaction:', err.message);
      }
    }
  }

  // Update emitter last sync
  await pool.query('UPDATE fiscal_emitters SET belvo_last_sync = NOW() WHERE id = $1', [emitterId]);

  return { new_count: newCount, duplicate_count: duplicateCount, matched_count: matchedCount };
}

// --------------- AUTO-MATCH LOGIC ---------------
async function autoMatchTransaction(
  txId: number,
  emitterId: number,
  amount: number,
  description: string,
  reference: string
): Promise<boolean> {
  // Extract potential payment references from description/reference
  // Common patterns: EP-XXXXXXXX, GL-XXXXXXXX, or Openpay transaction IDs
  const refPatterns = [
    /\b(EP-[A-F0-9]{8})\b/i,
    /\b(GL-[A-F0-9]{8})\b/i,
    /\b(tr_[a-zA-Z0-9]+)\b/,
  ];

  let extractedRef: string | null = null;
  const searchText = `${description} ${reference}`;
  for (const pattern of refPatterns) {
    const m = searchText.match(pattern);
    if (m && m[1]) {
      extractedRef = m[1];
      break;
    }
  }

  // Strategy 1: Match by payment reference in description
  if (extractedRef) {
    // Check pobox_payments
    const pobox = await pool.query(
      `SELECT id FROM pobox_payments WHERE payment_reference = $1 AND status IN ('pending', 'pending_payment')`,
      [extractedRef]
    );
    if (pobox.rows.length > 0) {
      await pool.query(
        `UPDATE belvo_transactions SET match_status = 'matched', matched_payment_id = $1, matched_at = NOW() WHERE id = $2`,
        [pobox.rows[0].id, txId]
      );
      return true;
    }

    // Check openpay_webhook_logs
    const webhook = await pool.query(
      `SELECT id FROM openpay_webhook_logs WHERE transaction_id = $1`,
      [extractedRef]
    );
    if (webhook.rows.length > 0) {
      await pool.query(
        `UPDATE belvo_transactions SET match_status = 'matched', matched_webhook_id = $1, matched_at = NOW() WHERE id = $2`,
        [webhook.rows[0].id, txId]
      );
      return true;
    }
  }

  // Strategy 2: Match by exact amount + recent pending payment (within 48h)
  const amountMatch = await pool.query(`
    SELECT pp.id, pp.payment_reference, pp.amount, pp.created_at
    FROM pobox_payments pp
    LEFT JOIN service_company_config scc ON scc.service_type = pp.metadata->>'service_type'
    WHERE pp.status IN ('pending', 'pending_payment')
      AND ABS(pp.amount - $1) < 0.01
      AND pp.created_at >= NOW() - INTERVAL '48 hours'
      AND (scc.emitter_id = $2 OR scc.emitter_id IS NULL)
    ORDER BY pp.created_at DESC
    LIMIT 1
  `, [amount, emitterId]);

  if (amountMatch.rows.length > 0) {
    await pool.query(
      `UPDATE belvo_transactions SET match_status = 'matched', matched_payment_id = $1, matched_at = NOW() WHERE id = $2`,
      [amountMatch.rows[0].id, txId]
    );
    return true;
  }

  return false;
}

// --------------- SYNC TRANSACTIONS FOR A LINK ---------------
export async function syncLinkTransactions(
  dbLinkId: number,
  daysBack: number = 7
): Promise<{ new_count: number; duplicate_count: number; matched_count: number }> {
  const link = await pool.query('SELECT * FROM belvo_links WHERE id = $1', [dbLinkId]);
  if (link.rows.length === 0) throw new Error('Link not found');

  const { belvo_link_id, emitter_id } = link.rows[0];

  const dateTo = new Date().toISOString().split('T')[0]!;
  const dateFrom = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0]!;

  const transactions = await fetchTransactions(belvo_link_id as string, dateFrom, dateTo);
  console.log(`🏦 Belvo: Fetched ${transactions.length} transactions for link ${dbLinkId} (${dateFrom} → ${dateTo})`);

  const result = await processTransactions(dbLinkId, emitter_id, transactions);

  // Update link last accessed
  await pool.query('UPDATE belvo_links SET last_accessed_at = NOW() WHERE id = $1', [dbLinkId]);

  return result;
}

// --------------- SYNC ALL LINKS ---------------
export async function syncAllLinks(daysBack: number = 3): Promise<any[]> {
  const links = await pool.query("SELECT * FROM belvo_links WHERE status = 'valid'");
  const results: any[] = [];

  for (const link of links.rows) {
    try {
      const result = await syncLinkTransactions(link.id, daysBack);
      results.push({ link_id: link.id, emitter_id: link.emitter_id, institution: link.institution_name, ...result });
    } catch (err: any) {
      console.error(`❌ Belvo sync error for link ${link.id}:`, err.message);
      results.push({ link_id: link.id, emitter_id: link.emitter_id, institution: link.institution_name, error: err.message });
    }
  }

  return results;
}

// --------------- WEBHOOK PROCESSING ---------------
export async function processWebhookEvent(payload: any): Promise<any> {
  const { webhook_id, webhook_type, webhook_code, link_id, data } = payload;

  // Log the event
  const logResult = await pool.query(`
    INSERT INTO belvo_webhook_events (webhook_id, webhook_type, event_code, link_id, data)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [webhook_id, webhook_type, webhook_code, link_id, JSON.stringify(payload)]);

  const eventId = logResult.rows[0].id;

  try {
    if (webhook_type === 'TRANSACTIONS') {
      // Find our DB link for this Belvo link
      const dbLink = await pool.query(
        'SELECT * FROM belvo_links WHERE belvo_link_id = $1',
        [link_id || '']
      );

      if (dbLink.rows.length === 0) {
        console.warn(`⚠️ Belvo webhook: Unknown link_id ${link_id}`);
        await pool.query('UPDATE belvo_webhook_events SET processed = true, error = $1 WHERE id = $2',
          ['Unknown link_id', eventId]);
        return { processed: false, reason: 'Unknown link' };
      }

      const { id: dbLinkId, emitter_id } = dbLink.rows[0];

      if (webhook_code === 'transactions_created' || webhook_code === 'historical_update') {
        // Fetch the new transactions
        const transactions = data?.transactions || [];
        
        if (transactions.length > 0) {
          // Transactions are included in webhook payload
          const result = await processTransactions(dbLinkId, emitter_id, transactions);
          await pool.query('UPDATE belvo_webhook_events SET processed = true, processed_at = NOW() WHERE id = $1', [eventId]);
          console.log(`🏦 Belvo webhook: Processed ${result.new_count} new transactions for emitter ${emitter_id}`);
          return { processed: true, ...result };
        } else {
          // Need to fetch transactions from API (webhook only has IDs)
          const daysBack = webhook_code === 'historical_update' ? 30 : 3;
          const result = await syncLinkTransactions(dbLinkId, daysBack);
          await pool.query('UPDATE belvo_webhook_events SET processed = true, processed_at = NOW() WHERE id = $1', [eventId]);
          return { processed: true, ...result };
        }
      }
    }

    if (webhook_type === 'LINKS') {
      if (webhook_code === 'link_status_update') {
        const newStatus = data?.status || 'unknown';
        await pool.query(
          'UPDATE belvo_links SET status = $1, updated_at = NOW() WHERE belvo_link_id = $2',
          [newStatus, link_id]
        );
        await pool.query('UPDATE belvo_webhook_events SET processed = true, processed_at = NOW() WHERE id = $1', [eventId]);
        return { processed: true, status_updated: newStatus };
      }
    }

    await pool.query('UPDATE belvo_webhook_events SET processed = true, processed_at = NOW() WHERE id = $1', [eventId]);
    return { processed: true, skipped: true };

  } catch (err: any) {
    await pool.query('UPDATE belvo_webhook_events SET processed = true, error = $1, processed_at = NOW() WHERE id = $2',
      [err.message, eventId]);
    throw err;
  }
}

// --------------- GET TRANSACTIONS ---------------
export async function getTransactions(filters: {
  emitter_id?: number;
  match_status?: string;
  date_from?: string;
  date_to?: string;
  type?: string;
  limit?: number;
}): Promise<any[]> {
  let query = `
    SELECT bt.*, bl.institution_name, fe.alias as emitter_alias,
           pp.payment_reference as matched_reference, pp.amount as matched_amount,
           u.full_name as matched_client
    FROM belvo_transactions bt
    JOIN belvo_links bl ON bl.id = bt.belvo_link_id
    JOIN fiscal_emitters fe ON fe.id = bt.emitter_id
    LEFT JOIN pobox_payments pp ON pp.id = bt.matched_payment_id
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters.emitter_id) {
    params.push(filters.emitter_id);
    query += ` AND bt.emitter_id = $${params.length}`;
  }
  if (filters.match_status) {
    params.push(filters.match_status);
    query += ` AND bt.match_status = $${params.length}`;
  }
  if (filters.date_from) {
    params.push(filters.date_from);
    query += ` AND bt.value_date >= $${params.length}`;
  }
  if (filters.date_to) {
    params.push(filters.date_to);
    query += ` AND bt.value_date <= $${params.length}`;
  }
  if (filters.type) {
    params.push(filters.type);
    query += ` AND bt.type = $${params.length}`;
  }

  query += ' ORDER BY bt.value_date DESC, bt.id DESC';
  params.push(filters.limit || 200);
  query += ` LIMIT $${params.length}`;

  const result = await pool.query(query, params);
  return result.rows;
}

// --------------- STATS ---------------
export async function getStats(emitterId?: number): Promise<any> {
  const where = emitterId ? 'WHERE bt.emitter_id = $1' : '';
  const params = emitterId ? [emitterId] : [];

  const result = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE bt.type = 'INFLOW') as total_inflows,
      COUNT(*) FILTER (WHERE bt.type = 'OUTFLOW') as total_outflows,
      COALESCE(SUM(bt.amount) FILTER (WHERE bt.type = 'INFLOW'), 0) as sum_inflows,
      COALESCE(SUM(bt.amount) FILTER (WHERE bt.type = 'OUTFLOW'), 0) as sum_outflows,
      COUNT(*) FILTER (WHERE bt.match_status = 'matched') as matched_count,
      COUNT(*) FILTER (WHERE bt.match_status = 'pending' AND bt.type = 'INFLOW') as pending_count,
      COUNT(*) FILTER (WHERE bt.match_status = 'unmatched') as unmatched_count,
      (SELECT COUNT(*) FROM belvo_links bl2 ${emitterId ? 'WHERE bl2.emitter_id = $1' : ''}) as active_links
    FROM belvo_transactions bt
    ${where}
  `, params);

  return result.rows[0];
}

// --------------- MANUAL MATCH ---------------
export async function manualMatch(
  transactionId: number,
  paymentId: number,
  matchedBy: number
): Promise<boolean> {
  const result = await pool.query(`
    UPDATE belvo_transactions 
    SET match_status = 'matched', matched_payment_id = $1, matched_at = NOW(), matched_by = $2
    WHERE id = $3 AND match_status != 'matched'
    RETURNING id
  `, [paymentId, matchedBy, transactionId]);
  return (result.rowCount ?? 0) > 0;
}

export async function ignoreTransaction(transactionId: number, userId: number): Promise<boolean> {
  const result = await pool.query(`
    UPDATE belvo_transactions 
    SET match_status = 'ignored', matched_by = $1, matched_at = NOW()
    WHERE id = $2
    RETURNING id
  `, [userId, transactionId]);
  return (result.rowCount ?? 0) > 0;
}

// --------------- HELPERS ---------------
function extractBankName(tx: any): string {
  const institution = tx.account?.institution?.name || tx.institution || '';
  if (/banregio/i.test(institution)) return 'banregio';
  if (/bbva/i.test(institution)) return 'bbva';
  if (/santander/i.test(institution)) return 'santander';
  if (/banorte/i.test(institution)) return 'banorte';
  if (/hsbc/i.test(institution)) return 'hsbc';
  if (/scotiabank/i.test(institution)) return 'scotiabank';
  if (/citibanamex/i.test(institution)) return 'citibanamex';
  return institution.toLowerCase() || 'unknown';
}

// --------------- BELVO AVAILABILITY CHECK ---------------
export function isBelvoConfigured(): boolean {
  return !!(BELVO_SECRET_ID && BELVO_SECRET_PASSWORD);
}

export function getBelvoEnv(): string {
  return BELVO_ENV;
}
