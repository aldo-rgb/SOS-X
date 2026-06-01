// ============================================================
// SYNCFY (Paybook) SERVICE
// Reemplazo de Belvo. Multi-empresa.
// Cada fiscal_emitter tiene su propio id_user de Syncfy.
//
// API ref (Paybook v1):
//   - Base: https://syncfy.com/api/v1
//   - Auth header: Authorization: Token token=<API_KEY>
//   - Users:        POST /users        body: { id_external, name }
//   - Sessions:     POST /sessions     body: { id_user }
//                   -> devuelve token de sesión para el widget
//   - Credentials:  GET  /credentials?id_user=...
//                   DELETE /credentials/:id_credential
//   - Accounts:     GET  /accounts?id_user=...    (header: Authorization: Token token=<session_token>)
//   - Transactions: GET  /transactions?id_user=...&dt_refresh_from=<unix>
//
// NOTA: si tu doc de Syncfy difiere en algún path o nombre de
//       campo, ajusta SYNCFY_PATHS / parseo. La arquitectura
//       (BD, controladores, frontend) no cambia.
// ============================================================

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { pool } from './db';

// --------------- CONFIG ---------------
const SYNCFY_API_KEY        = process.env.SYNCFY_API_KEY || '';
const SYNCFY_API_SECRET     = process.env.SYNCFY_API_SECRET || ''; // opcional, según plan
const SYNCFY_ENV            = process.env.SYNCFY_ENV || 'sandbox'; // 'sandbox' | 'production'
const SYNCFY_WEBHOOK_SECRET = process.env.SYNCFY_WEBHOOK_SECRET || '';

// Syncfy/Paybook usa el mismo host para sandbox y producción;
// el ambiente se determina por la API key, no por el dominio.
// Permite override por env (SYNCFY_BASE_URL o SYNCFY_API_URL).
const SYNCFY_BASE_URL = process.env.SYNCFY_BASE_URL
  || process.env.SYNCFY_API_URL
  || 'https://api.syncfy.com/v1';

// Permite usar endpoint dedicado del widget si Syncfy lo provee.
const SYNCFY_WIDGET_BASE = process.env.SYNCFY_WIDGET_BASE
  || 'https://connect.syncfy.com'; // CDN del Connect Widget

export const SYNCFY_PATHS = {
  users:          '/users',
  sessions:       '/sessions',
  credentials:    '/credentials',
  accounts:       '/accounts',
  transactions:   '/transactions',
  catalogues:     '/catalogues/sites',
};

// --------------- API CLIENT ---------------
// Syncfy/Paybook NO usa header Bearer/Token. Acepta la API key como
// query string ?api_key=<key>. Los session tokens se mandan como ?token=<token>.
function getAppClient(): AxiosInstance {
  if (!SYNCFY_API_KEY) {
    throw new Error('Syncfy credentials not configured. Set SYNCFY_API_KEY in env');
  }
  return axios.create({
    baseURL: SYNCFY_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    params: { api_key: SYNCFY_API_KEY },
    timeout: 30000,
  });
}

function getSessionClient(sessionToken: string): AxiosInstance {
  return axios.create({
    baseURL: SYNCFY_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    params: { token: sessionToken },
    timeout: 45000,
  });
}

// --------------- USER MANAGEMENT (por empresa) ---------------
/** Crea (o reutiliza) un Syncfy user para el fiscal_emitter. */
export async function ensureUserForEmitter(emitterId: number, createdBy?: number): Promise<{ id_user: string; created: boolean }> {
  const existing = await pool.query('SELECT id_user FROM syncfy_users WHERE emitter_id = $1', [emitterId]);
  if (existing.rows.length > 0) {
    return { id_user: existing.rows[0].id_user, created: false };
  }

  const externalId = `entregax-emitter-${emitterId}`;
  const emitter = await pool.query('SELECT alias, rfc FROM fiscal_emitters WHERE id = $1', [emitterId]);
  if (emitter.rows.length === 0) throw new Error('Emitter no encontrado');

  const client = getAppClient();
  const resp = await client.post(SYNCFY_PATHS.users, {
    id_external: externalId,
    name: emitter.rows[0].alias || emitter.rows[0].rfc || externalId,
  });

  // Syncfy típicamente responde { response: { id_user: '...' } } o { id_user: '...' }
  const idUser: string = resp.data?.response?.id_user || resp.data?.id_user || resp.data?.response?.[0]?.id_user;
  if (!idUser) throw new Error(`Syncfy /users no devolvió id_user. Respuesta: ${JSON.stringify(resp.data).slice(0, 200)}`);

  await pool.query(
    `INSERT INTO syncfy_users (emitter_id, id_user, external_id, env, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (emitter_id) DO UPDATE SET id_user = EXCLUDED.id_user, updated_at = NOW()`,
    [emitterId, idUser, externalId, SYNCFY_ENV, createdBy || null]
  );
  await pool.query('UPDATE fiscal_emitters SET syncfy_user_id = $1, syncfy_env = $2 WHERE id = $3',
    [idUser, SYNCFY_ENV, emitterId]);

  return { id_user: idUser, created: true };
}

/** Elimina el registro local de usuario Syncfy para un emitter (para recrearlo en otro ambiente). */
export async function deleteLocalUserForEmitter(emitterId: number): Promise<void> {
  await pool.query('DELETE FROM syncfy_users WHERE emitter_id = $1', [emitterId]);
  await pool.query('UPDATE fiscal_emitters SET syncfy_user_id = NULL, syncfy_connected = FALSE WHERE id = $1', [emitterId]);
}

// --------------- SESSION TOKEN (para Widget) -----------------
/** Crea un session token efímero para abrir el Connect Widget. */
export async function createSessionToken(idUser: string): Promise<string> {
  const client = getAppClient();
  const resp = await client.post(SYNCFY_PATHS.sessions, { id_user: idUser });
  const token: string = resp.data?.response?.token
    || resp.data?.token
    || resp.data?.response?.id_session;
  if (!token) throw new Error(`Syncfy /sessions no devolvió token. Respuesta: ${JSON.stringify(resp.data).slice(0, 200)}`);
  return token;
}

// --------------- LIST CREDENTIALS (banks conectados) ---------
export async function listSyncfyCredentialsRemote(idUser: string): Promise<any[]> {
  const client = getAppClient();
  const resp = await client.get(`${SYNCFY_PATHS.credentials}?id_user=${encodeURIComponent(idUser)}`);
  return resp.data?.response || resp.data || [];
}

/** Sincroniza la tabla local syncfy_credentials con lo que reporta Syncfy. */
export async function refreshCredentialsForEmitter(emitterId: number, createdBy?: number): Promise<any[]> {
  const idUser = (await pool.query('SELECT id_user FROM syncfy_users WHERE emitter_id = $1', [emitterId])).rows[0]?.id_user;
  if (!idUser) return [];

  const remote = await listSyncfyCredentialsRemote(idUser);
  console.log(`[Syncfy] refreshCredentials emitter=${emitterId}: ${remote.length} credenciales remotas`);
  for (const cred of remote) {
    const idCredential: string = cred.id_credential || cred.id;
    const idSite: string       = cred.id_site || cred.site?.id_site;
    const siteName: string     = cred.site?.name || cred.name || cred.institution || '';
    console.log(`[Syncfy]  cred id=${idCredential} site=${JSON.stringify(cred.site)} siteName="${siteName}"`);
    // Solo ignorar si no hay id de credencial ni institución (basura completa)
    if (!idCredential) continue;
    // Credenciales sin institución conocida: insertar como "Banco" genérico (evita pérdida de credentials reales)
    const displayName = siteName || 'Banco';
    const institution: string  = bankCodeFromName(displayName);
    const status: string       = (cred.status || 'active').toString().toLowerCase();
    const twofa: boolean       = !!(cred.twofa || cred.is_twofa);

    await pool.query(`
      INSERT INTO syncfy_credentials
        (emitter_id, syncfy_user_id, id_credential, id_site, institution, institution_name,
         status, twofa_required, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
      ON CONFLICT (id_credential) DO UPDATE SET
        status              = EXCLUDED.status,
        institution_name    = CASE WHEN EXCLUDED.institution_name != '' THEN EXCLUDED.institution_name ELSE syncfy_credentials.institution_name END,
        institution         = EXCLUDED.institution,
        twofa_required      = EXCLUDED.twofa_required,
        is_active           = TRUE,  -- reactivar si el usuario reconecta el mismo banco
        updated_at          = NOW()
    `, [emitterId, idUser, idCredential, idSite || null, institution, displayName, status, twofa, createdBy || null]);
  }

  // Marca emisor como conectado si hay al menos una credencial activa
  const active = await pool.query(
    'SELECT COUNT(*)::int AS n, MIN(institution_name) AS inst FROM syncfy_credentials WHERE emitter_id=$1 AND is_active=TRUE AND status=$2',
    [emitterId, 'active']
  );
  if (active.rows[0].n > 0) {
    await pool.query('UPDATE fiscal_emitters SET syncfy_connected=TRUE, syncfy_institution=$1 WHERE id=$2',
      [active.rows[0].inst, emitterId]);
  } else {
    await pool.query('UPDATE fiscal_emitters SET syncfy_connected=FALSE WHERE id=$1', [emitterId]);
  }

  return (await pool.query(
    'SELECT * FROM syncfy_credentials WHERE emitter_id=$1 AND is_active=TRUE ORDER BY id DESC',
    [emitterId]
  )).rows;
}

export async function deleteCredential(dbCredentialId: number): Promise<boolean> {
  const r = await pool.query('SELECT * FROM syncfy_credentials WHERE id=$1', [dbCredentialId]);
  if (r.rows.length === 0) return false;
  const cred = r.rows[0];

  try {
    const client = getAppClient();
    await client.delete(`${SYNCFY_PATHS.credentials}/${encodeURIComponent(cred.id_credential)}`);
  } catch (e: any) {
    console.warn('⚠️ Syncfy: no se pudo borrar la credencial remota:', e.message);
  }

  // Soft-delete: marcar como inactivo para que no reaparezca al re-sincronizar con Syncfy
  await pool.query('UPDATE syncfy_credentials SET is_active=FALSE, updated_at=NOW() WHERE id=$1', [dbCredentialId]);

  // Recalcula flag de emisor
  const remaining = await pool.query(
    'SELECT COUNT(*)::int AS n FROM syncfy_credentials WHERE emitter_id=$1 AND is_active=TRUE',
    [cred.emitter_id]
  );
  if (remaining.rows[0].n === 0) {
    await pool.query('UPDATE fiscal_emitters SET syncfy_connected=FALSE, syncfy_institution=NULL WHERE id=$1', [cred.emitter_id]);
  }
  return true;
}

// --------------- FETCH TRANSACTIONS --------------------------
export async function fetchTransactionsRemote(idUser: string, daysBack: number): Promise<any[]> {
  // dt_transaction_from filtra por fecha real de la transacción bancaria.
  // dt_refresh_from filtra por cuándo Syncfy actualizó el registro internamente —
  // si los datos se cargaron hace >daysBack días, devolvería 0 aunque las transacciones sean recientes.
  const sinceUnix = Math.floor((Date.now() - daysBack * 86400000) / 1000);

  const sessionToken = await createSessionToken(idUser);
  const client = getSessionClient(sessionToken);

  const resp = await client.get(
    `${SYNCFY_PATHS.transactions}?id_user=${encodeURIComponent(idUser)}&dt_transaction_from=${sinceUnix}`
  );
  return resp.data?.response || resp.data || [];
}

// --------------- PROCESS & STORE -----------------------------
export async function processTransactions(
  emitterId: number,
  transactions: any[]
): Promise<{ new_count: number; duplicate_count: number; matched_count: number }> {
  let newCount = 0;
  let dupCount = 0;
  let matchedCount = 0;

  // map id_credential remoto -> id local
  const credMap = await pool.query(
    'SELECT id, id_credential FROM syncfy_credentials WHERE emitter_id=$1',
    [emitterId]
  );
  const credByRemote: Record<string, number> = {};
  for (const c of credMap.rows) credByRemote[c.id_credential] = c.id;

  for (const tx of transactions) {
    try {
      const idTx: string       = tx.id_transaction || tx.id;
      const idCredential: string = tx.id_credential || tx.credential?.id_credential;
      const idAccount: string  = tx.id_account || tx.account?.id_account;
      const amountRaw          = Number(tx.amount ?? 0);
      const isCharge: boolean  = !!tx.is_charge || amountRaw < 0;
      const amount             = Math.abs(amountRaw);
      const type: string       = isCharge ? 'OUTFLOW' : 'INFLOW';
      const dtTx               = tx.dt_transaction || tx.value_date || tx.dt_refresh;
      const dtIso              = typeof dtTx === 'number'
        ? new Date(dtTx * 1000).toISOString().slice(0, 10)
        : (typeof dtTx === 'string' ? dtTx.slice(0, 10) : new Date().toISOString().slice(0, 10));

      const dbCredId = credByRemote[idCredential];
      if (!dbCredId) {
        // Credencial nueva no registrada: refresca y reintenta
        await refreshCredentialsForEmitter(emitterId);
        const refreshed = await pool.query('SELECT id FROM syncfy_credentials WHERE id_credential=$1', [idCredential]);
        if (refreshed.rows.length === 0) {
          console.warn(`⚠️ Syncfy tx ${idTx}: credencial ${idCredential} desconocida, se omite.`);
          continue;
        }
        credByRemote[idCredential] = refreshed.rows[0].id;
      }

      const insertRes = await pool.query(`
        INSERT INTO syncfy_transactions (
          emitter_id, syncfy_credential_id, id_transaction, id_account,
          value_date, accounting_date, amount, currency,
          description, reference, type, category, subcategory,
          merchant_name, status, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id_transaction) DO NOTHING
        RETURNING id
      `, [
        emitterId,
        credByRemote[idCredential],
        idTx,
        idAccount || null,
        dtIso,
        amount,
        tx.currency || 'MXN',
        tx.description || tx.reference || '',
        tx.reference || '',
        type,
        tx.category || null,
        tx.subcategory || null,
        tx.merchant?.name || null,
        tx.status || 'PROCESSED',
        JSON.stringify(tx),
      ]);

      if (insertRes.rows.length === 0) {
        dupCount++;
        continue;
      }
      newCount++;
      const localTxId: number = insertRes.rows[0].id;

      // Inserta en bank_statement_entries (vista unificada)
      const hashInput = `syncfy|${idTx}|${dtIso}|${amount}`;
      const entryHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 64);
      try {
        await pool.query(`
          INSERT INTO bank_statement_entries
            (empresa_id, banco, fecha, concepto, referencia, cargo, abono, saldo, entry_hash, source)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'syncfy')
          ON CONFLICT (empresa_id, entry_hash) DO NOTHING
        `, [
          emitterId,
          bankCodeFromName(tx.site?.name || ''),
          dtIso,
          tx.description || '',
          tx.reference || '',
          type === 'OUTFLOW' ? amount : null,
          type === 'INFLOW'  ? amount : null,
          tx.balance ?? null,
          entryHash,
        ]);
      } catch (e: any) {
        // bank_statement_entries puede no tener todas las columnas; log y sigue
        if (!/column .* does not exist/i.test(e.message)) {
          console.warn('bank_statement_entries insert error:', e.message);
        }
      }

      // Auto-match para INFLOW
      if (type === 'INFLOW' && amount > 0) {
        const ok = await autoMatchTransaction(localTxId, emitterId, amount, tx.description || '', tx.reference || '');
        if (ok) matchedCount++;
      }
    } catch (err: any) {
      console.error('Syncfy processTransactions error:', err.message);
    }
  }

  await pool.query('UPDATE fiscal_emitters SET syncfy_last_sync = NOW() WHERE id = $1', [emitterId]);
  return { new_count: newCount, duplicate_count: dupCount, matched_count: matchedCount };
}

// --------------- AUTO MATCH (mismo motor que Belvo) ----------
async function autoMatchTransaction(
  txId: number, emitterId: number, amount: number, description: string, reference: string
): Promise<boolean> {
  const refPatterns = [
    /\b(EP-[A-F0-9]{8})\b/i,
    /\b(GL-[A-F0-9]{8})\b/i,
    /\b(tr_[a-zA-Z0-9]+)\b/,
  ];
  let extractedRef: string | null = null;
  const searchText = `${description} ${reference}`;
  for (const p of refPatterns) {
    const m = searchText.match(p);
    if (m && m[1]) { extractedRef = m[1]; break; }
  }

  if (extractedRef) {
    const pobox = await pool.query(
      `SELECT id FROM pobox_payments WHERE payment_reference = $1 AND status IN ('pending','pending_payment')`,
      [extractedRef]
    );
    if (pobox.rows.length > 0) {
      await pool.query(
        `UPDATE syncfy_transactions SET match_status='matched', matched_payment_id=$1, matched_at=NOW() WHERE id=$2`,
        [pobox.rows[0].id, txId]
      );
      return true;
    }
  }

  const amountMatch = await pool.query(`
    SELECT pp.id FROM pobox_payments pp
    LEFT JOIN service_company_config scc ON scc.service_type = pp.metadata->>'service_type'
    WHERE pp.status IN ('pending','pending_payment')
      AND ABS(pp.amount - $1) < 0.01
      AND pp.created_at >= NOW() - INTERVAL '48 hours'
      AND (scc.emitter_id = $2 OR scc.emitter_id IS NULL)
    ORDER BY pp.created_at DESC LIMIT 1
  `, [amount, emitterId]);

  if (amountMatch.rows.length > 0) {
    await pool.query(
      `UPDATE syncfy_transactions SET match_status='matched', matched_payment_id=$1, matched_at=NOW() WHERE id=$2`,
      [amountMatch.rows[0].id, txId]
    );
    return true;
  }
  return false;
}

// --------------- SYNC -----------------------------------------
export async function syncEmitter(emitterId: number, daysBack: number = 7): Promise<any> {
  const idUser = (await pool.query('SELECT id_user FROM syncfy_users WHERE emitter_id=$1', [emitterId])).rows[0]?.id_user;
  if (!idUser) throw new Error('Esta empresa no tiene usuario Syncfy. Conecta un banco primero.');

  const credCount = (await pool.query(
    'SELECT COUNT(*)::int AS n FROM syncfy_credentials WHERE emitter_id=$1 AND is_active=TRUE',
    [emitterId]
  )).rows[0].n;
  if (credCount === 0) throw new Error('Esta empresa no tiene bancos conectados en Syncfy.');

  const txs = await fetchTransactionsRemote(idUser, daysBack);
  console.log(`🏦 Syncfy: ${txs.length} tx recibidas para emitter ${emitterId} (${daysBack}d)`);
  const result = await processTransactions(emitterId, txs);

  await pool.query(
    'UPDATE syncfy_credentials SET last_sync_at=NOW() WHERE emitter_id=$1 AND is_active=TRUE',
    [emitterId]
  );
  return result;
}

export async function syncAllEmitters(daysBack: number = 3): Promise<any[]> {
  const rows = (await pool.query(`
    SELECT DISTINCT su.emitter_id
    FROM syncfy_users su
    JOIN syncfy_credentials sc ON sc.emitter_id = su.emitter_id AND sc.is_active=TRUE
  `)).rows;
  const results: any[] = [];
  for (const r of rows) {
    try {
      const res = await syncEmitter(r.emitter_id, daysBack);
      results.push({ emitter_id: r.emitter_id, ...res });
    } catch (e: any) {
      results.push({ emitter_id: r.emitter_id, error: e.message });
    }
  }
  return results;
}

// --------------- WEBHOOK -------------------------------------
const SYNCFY_WEBHOOK_TOKEN = process.env.SYNCFY_WEBHOOK_TOKEN || '';

export function verifyWebhookSignature(rawBody: string, signature?: string): boolean {
  if (!SYNCFY_WEBHOOK_SECRET) return true; // si no se configuró firma, aceptamos
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', SYNCFY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch { return false; }
}

/**
 * Valida auth del webhook: acepta firma HMAC (si SYNCFY_WEBHOOK_SECRET está set)
 * O bien token simple por header X-Webhook-Token (si SYNCFY_WEBHOOK_TOKEN está set).
 * Si ninguno está configurado, acepta el webhook (seguridad por URL única).
 */
export function verifyWebhookAuth(rawBody: string, signature?: string, tokenHeader?: string): boolean {
  // Si viene token en cabecera y tenemos token configurado, validar por token
  if (SYNCFY_WEBHOOK_TOKEN && tokenHeader) {
    try {
      const a = Buffer.from(tokenHeader);
      const b = Buffer.from(SYNCFY_WEBHOOK_TOKEN);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    } catch { /* continúa */ }
  }
  // Si viene firma HMAC y tenemos secret, validar firma
  if (SYNCFY_WEBHOOK_SECRET && signature) {
    if (verifyWebhookSignature(rawBody, signature)) return true;
  }
  // Si ninguna credencial está configurada, aceptar (URL única es suficiente)
  if (!SYNCFY_WEBHOOK_TOKEN && !SYNCFY_WEBHOOK_SECRET) return true;
  // Syncfy no siempre envía headers de auth → si el request no trajo ningún header de auth, aceptar
  if (!signature && !tokenHeader) return true;
  // Hay credenciales configuradas y vino un header de auth que no coincidió
  return false;
}

export async function processWebhookEvent(payload: any): Promise<any> {
  const eventId      = payload.event_id || payload.id || payload.notification_id || null;
  const eventType    = payload.event || payload.type || payload.notification_type || 'unknown';
  const idUser       = payload.id_user || payload.data?.id_user || null;
  const idCredential = payload.id_credential || payload.data?.id_credential || null;

  const logRes = await pool.query(`
    INSERT INTO syncfy_webhook_events (event_id, event_type, id_user, id_credential, payload)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [eventId, eventType, idUser, idCredential, JSON.stringify(payload)]);
  const localId = logRes.rows[0].id;

  try {
    // Si es evento de tx/refresh y conocemos el id_user → sincronizamos
    if (idUser && /transactions|credentials|refresh/i.test(eventType)) {
      const emitter = await pool.query('SELECT emitter_id FROM syncfy_users WHERE id_user=$1', [idUser]);
      if (emitter.rows.length > 0) {
        const emitterId = emitter.rows[0].emitter_id;
        await refreshCredentialsForEmitter(emitterId);
        const result = await syncEmitter(emitterId, 3);
        await pool.query('UPDATE syncfy_webhook_events SET processed=TRUE, processed_at=NOW() WHERE id=$1', [localId]);
        return { processed: true, ...result };
      }
    }
    await pool.query('UPDATE syncfy_webhook_events SET processed=TRUE, processed_at=NOW() WHERE id=$1', [localId]);
    return { processed: true, skipped: true };
  } catch (e: any) {
    await pool.query('UPDATE syncfy_webhook_events SET processed=TRUE, error=$1, processed_at=NOW() WHERE id=$2',
      [e.message, localId]);
    throw e;
  }
}

// --------------- STATS / READ --------------------------------
export async function getStats(emitterId?: number): Promise<any> {
  const where = emitterId ? 'WHERE st.emitter_id = $1' : '';
  const params: any[] = emitterId ? [emitterId] : [];
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE st.type='INFLOW')  AS total_inflows,
      COUNT(*) FILTER (WHERE st.type='OUTFLOW') AS total_outflows,
      COALESCE(SUM(st.amount) FILTER (WHERE st.type='INFLOW'),0)  AS sum_inflows,
      COALESCE(SUM(st.amount) FILTER (WHERE st.type='OUTFLOW'),0) AS sum_outflows,
      COUNT(*) FILTER (WHERE st.match_status='matched')   AS matched_count,
      COUNT(*) FILTER (WHERE st.match_status='pending')   AS pending_count,
      COUNT(*) FILTER (WHERE st.match_status='unmatched') AS unmatched_count,
      (SELECT COUNT(*) FROM syncfy_credentials sc2 ${emitterId ? 'WHERE sc2.emitter_id=$1 AND sc2.is_active=TRUE' : 'WHERE sc2.is_active=TRUE'}) AS active_credentials
    FROM syncfy_transactions st
    ${where}
  `, params);
  return result.rows[0];
}

// --------------- MANUAL MATCH ---------------------------------
export async function manualMatch(transactionId: number, paymentId: number, matchedBy: number): Promise<boolean> {
  const r = await pool.query(`
    UPDATE syncfy_transactions
       SET match_status='matched', matched_payment_id=$1, matched_at=NOW(), matched_by=$2
     WHERE id=$3 AND match_status<>'matched'
     RETURNING id
  `, [paymentId, matchedBy, transactionId]);
  return (r.rowCount ?? 0) > 0;
}

export async function ignoreTransaction(transactionId: number, userId: number): Promise<boolean> {
  const r = await pool.query(`
    UPDATE syncfy_transactions SET match_status='ignored', matched_by=$1, matched_at=NOW()
     WHERE id=$2 RETURNING id
  `, [userId, transactionId]);
  return (r.rowCount ?? 0) > 0;
}

// --------------- HELPERS --------------------------------------
function bankCodeFromName(name: string): string {
  const n = (name || '').toLowerCase();
  if (/banregio/.test(n)) return 'banregio';
  if (/bbva|bancomer/.test(n)) return 'bbva';
  if (/santander/.test(n)) return 'santander';
  if (/banorte/.test(n)) return 'banorte';
  if (/hsbc/.test(n)) return 'hsbc';
  if (/scotiabank/.test(n)) return 'scotiabank';
  if (/banamex|citi/.test(n)) return 'citibanamex';
  if (/afirme/.test(n)) return 'afirme';
  if (/bajio/.test(n)) return 'bajio';
  return n || 'unknown';
}

export function isSyncfyConfigured(): boolean {
  return !!SYNCFY_API_KEY;
}
export function getSyncfyEnv(): string {
  return SYNCFY_ENV;
}
export function getSyncfyWidgetBase(): string {
  return SYNCFY_WIDGET_BASE;
}
