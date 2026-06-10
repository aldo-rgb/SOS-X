import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { pool } from './db';

// ─── helpers ───────────────────────────────────────────────────────────────
const genRef = (prefix = 'EX'): string => {
  const ts = (Date.now() % 10000).toString().padStart(4, '0');
  const rnd = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${ts}${rnd}`;
};

// Normalize pobox_payments status → advisor display status
const fromPobox: Record<string, string> = {
  pending:            'pendiente',
  pending_payment:    'pendiente',
  vouchers_submitted: 'en_proceso',
  vouchers_partial:   'en_proceso',
  completed:          'pagado',
  paid:               'pagado',
  cancelled:          'cancelado',
  expired:            'cancelado',
};

// Normalize advisor status → pobox_payments status
const toPobox: Record<string, string> = {
  pendiente:  'pending_payment',
  en_proceso: 'vouchers_submitted',
  pagado:     'completed',
  cancelado:  'cancelled',
};

const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advisor_payment_orders (
      id                SERIAL PRIMARY KEY,
      folio             TEXT NOT NULL UNIQUE,
      advisor_id        INTEGER NOT NULL,
      client_id         INTEGER,
      client_name       TEXT,
      client_box_id     TEXT,
      package_uids      JSONB  DEFAULT '[]',
      trackings         JSONB  DEFAULT '[]',
      notes             TEXT,
      total_mxn         NUMERIC(12,2),
      status            TEXT   DEFAULT 'pendiente',
      pobox_payment_id  INTEGER,
      payment_reference TEXT,
      service_type_cfg  TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Safe migrations for existing tables
  await pool.query(`ALTER TABLE advisor_payment_orders ADD COLUMN IF NOT EXISTS pobox_payment_id INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE advisor_payment_orders ADD COLUMN IF NOT EXISTS payment_reference TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE advisor_payment_orders ADD COLUMN IF NOT EXISTS service_type_cfg TEXT`).catch(() => {});
};

const advisorId = (req: Request): number | null => (req as any).user?.userId ?? null;

// ─── LIST ───────────────────────────────────────────────────────────────────
// Returns both advisor-created orders AND client self-generated orders for
// clients linked to this advisor (union view).
export const listAdvisorPaymentOrders = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureTable();
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });

    const r = await pool.query(`
      SELECT
        apo.id,
        apo.folio,
        'advisor' AS created_by,
        apo.client_id,
        apo.client_name,
        apo.client_box_id,
        apo.package_uids,
        apo.trackings,
        apo.notes,
        apo.total_mxn,
        COALESCE(
          CASE ${Object.entries(fromPobox).map(([k,v]) => `WHEN pp.status='${k}' THEN '${v}'`).join(' ')}
               ELSE pp.status
          END,
          apo.status
        ) AS status,
        COALESCE(apo.payment_reference, pp.payment_reference) AS payment_reference,
        apo.pobox_payment_id,
        pp.bank_clabe,
        pp.bank_name,
        pp.beneficiario,
        apo.created_at
      FROM advisor_payment_orders apo
      LEFT JOIN LATERAL (
        SELECT p2.status, p2.payment_reference,
               fe.bank_clabe, fe.bank_name, fe.business_name AS beneficiario
        FROM pobox_payments p2
        LEFT JOIN service_company_config scc ON scc.service_type = COALESCE(apo.service_type_cfg,'POBOX_USA') AND scc.is_active = TRUE
        LEFT JOIN fiscal_emitters fe ON fe.id = scc.emitter_id
        WHERE p2.id = apo.pobox_payment_id
        LIMIT 1
      ) pp ON TRUE
      WHERE apo.advisor_id = $1

      UNION ALL

      SELECT
        pp.id,
        NULL AS folio,
        'client' AS created_by,
        pp.user_id AS client_id,
        u.full_name AS client_name,
        u.box_id AS client_box_id,
        COALESCE(pp.package_ids, '[]'::jsonb) AS package_uids,
        (
          SELECT COALESCE(jsonb_agg(tr.val), '[]'::jsonb)
          FROM (
            SELECT COALESCE(p.tracking_internal, p.id::text) AS val
              FROM packages p
             WHERE p.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
            UNION ALL
            SELECT COALESCE(ds.secondary_tracking, ds.inbound_tracking) AS val
              FROM dhl_shipments ds
             WHERE ds.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
            UNION ALL
            SELECT mo.ordersn AS val
              FROM maritime_orders mo
             WHERE mo.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
          ) tr WHERE tr.val IS NOT NULL
        ) AS trackings,
        NULL AS notes,
        pp.amount AS total_mxn,
        CASE pp.status
          ${Object.entries(fromPobox).map(([k,v]) => `WHEN '${k}' THEN '${v}'`).join(' ')}
          ELSE pp.status
        END AS status,
        pp.payment_reference,
        pp.id AS pobox_payment_id,
        NULL AS bank_clabe,
        NULL AS bank_name,
        NULL AS beneficiario,
        pp.created_at
      FROM pobox_payments pp
      JOIN users u ON u.id = pp.user_id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND pp.status NOT IN ('expired')
        AND pp.id NOT IN (
          SELECT pobox_payment_id
          FROM advisor_payment_orders
          WHERE pobox_payment_id IS NOT NULL AND advisor_id = $1
        )

      ORDER BY created_at DESC
      LIMIT 300
    `, [aid]);

    return res.json(r.rows);
  } catch (e: any) {
    console.error('[payment-orders] list:', e);
    return res.status(500).json({ error: 'Error al listar órdenes' });
  }
};

// ─── CREATE ─────────────────────────────────────────────────────────────────
// Creates a real pobox_payments cash record so the client can see the order
// in "Mis Cuentas por Pagar" in the mobile app.
export const createAdvisorPaymentOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureTable();
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });

    const { client_id, client_name, client_box_id, package_uids, trackings, notes, total_mxn } = req.body;
    if (!package_uids?.length) return res.status(400).json({ error: 'Selecciona al menos una guía' });
    if (!client_id) return res.status(400).json({ error: 'Se requiere el ID del cliente' });
    if (!total_mxn || Number(total_mxn) <= 0) return res.status(400).json({ error: 'El monto total debe ser mayor a 0' });

    // ── 1. Parse UIDs → numeric DB IDs per table ──────────────────────────
    const pkgIds: number[] = [];
    const marIds: number[] = [];
    const dhlIds: number[] = [];

    for (const uid of package_uids as string[]) {
      const parts = String(uid).split('-');
      const prefix = parts[0];
      const numId = parseInt(parts[1] ?? '');
      if (isNaN(numId)) continue;
      if (prefix === 'PKG')       pkgIds.push(numId);
      else if (prefix === 'MAR')  marIds.push(numId);
      else if (prefix === 'DHL')  dhlIds.push(numId);
    }

    // All real numeric IDs for pobox_payments.package_ids
    const allPackageIds = [...pkgIds, ...marIds, ...dhlIds];
    if (allPackageIds.length === 0) return res.status(400).json({ error: 'No se encontraron IDs válidos en las guías seleccionadas' });

    // ── 2. Determine dominant service type from actual packages ────────────
    const counts = { maritime: 0, dhl: 0, air: 0, pobox: 0 };
    counts.dhl = dhlIds.length;
    counts.maritime = marIds.length;

    if (pkgIds.length > 0) {
      const pkgSvcRes = await pool.query(
        `SELECT service_type FROM packages WHERE id = ANY($1)`, [pkgIds]
      );
      for (const p of pkgSvcRes.rows) {
        const st = String(p.service_type || '');
        if (st === 'SEA_CHN_MX') counts.maritime++;
        else if (st === 'AA_DHL') counts.dhl++;
        else if (st === 'AIR_CHN_MX' || st.toLowerCase().includes('tdi')) counts.air++;
        else counts.pobox++;
      }
    }

    const dominant = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) || 'pobox';
    const serviceTypeForConfig =
      dominant === 'maritime' ? 'SEA_CHN_MX' :
      dominant === 'dhl'      ? 'AA_DHL'      :
      dominant === 'air'      ? 'AIR_CHN_MX'  :
                                'POBOX_USA';

    // ── 3. Get company bank info ───────────────────────────────────────────
    let companyInfo: any = null;
    let empresaId: number | null = null;
    try {
      const cRes = await pool.query(
        `SELECT fe.id AS empresa_id, fe.alias AS company_name,
                fe.business_name AS legal_name,
                fe.bank_name, fe.bank_clabe, fe.bank_account
         FROM service_company_config scc
         JOIN fiscal_emitters fe ON fe.id = scc.emitter_id
         WHERE scc.service_type = $1 AND scc.is_active = TRUE
         LIMIT 1`,
        [serviceTypeForConfig]
      );
      if (cRes.rows.length > 0) { companyInfo = cRes.rows[0]; empresaId = companyInfo.empresa_id; }
    } catch { /* use defaults */ }

    if (!companyInfo?.bank_clabe) {
      companyInfo = {
        empresa_id: null, company_name: 'EntregaX', legal_name: 'ENTREGAX S.A. DE C.V.',
        bank_name: 'BBVA México', bank_clabe: '012580001234567890', bank_account: '1234567890',
      };
    }

    // ── 4. Generate payment reference ────────────────────────────────────
    const words = (companyInfo.company_name || 'EX').trim().split(/\s+/)
      .filter((w: string) => !['sa','de','cv','s.a.','c.v.'].includes(w.toLowerCase()));
    const prefix = words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : (words[0] || 'EX').substring(0, 2).toUpperCase();
    const paymentRef = genRef(prefix);

    // ── 5. Create pobox_payments record (same format as client cash flow) ─
    const ppRes = await pool.query(`
      INSERT INTO pobox_payments (user_id, package_ids, amount, currency, payment_method, payment_reference, status, created_at)
      VALUES ($1, $2, $3, 'MXN', 'cash', $4, 'pending_payment', CURRENT_TIMESTAMP)
      RETURNING id
    `, [client_id, JSON.stringify(allPackageIds), Number(total_mxn), paymentRef]);

    const poboxPaymentId = ppRes.rows[0].id;

    // ── 6. Log to openpay_webhook_logs for cobranza dashboard ─────────────
    const trackingStr = (trackings || []).join(', ') || package_uids.join(', ');
    try {
      await pool.query(`
        INSERT INTO openpay_webhook_logs (
          transaction_id, empresa_id, user_id, monto_recibido, monto_neto,
          concepto, fecha_pago, estatus_procesamiento, service_type,
          payment_method, payload_json, branch_id
        ) VALUES ($1,$2,$3,$4,$4,$5,CURRENT_TIMESTAMP,'pending_payment',$8,'cash',$6,$7)
      `, [
        paymentRef, empresaId, client_id, Number(total_mxn),
        `Orden asesor - ${allPackageIds.length} guía(s): ${trackingStr}`,
        JSON.stringify({ packageIds: allPackageIds, pobox_payment_id: poboxPaymentId, trackings: trackings || [] }),
        null,
        serviceTypeForConfig,
      ]);
    } catch { /* non-critical */ }

    // ── 7. Create advisor_payment_orders record linked to pobox_payment ───
    const folio = `OP-${aid}-${Date.now()}`;
    const apoRes = await pool.query(`
      INSERT INTO advisor_payment_orders
        (folio, advisor_id, client_id, client_name, client_box_id,
         package_uids, trackings, notes, total_mxn, status,
         pobox_payment_id, payment_reference, service_type_cfg)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendiente',$10,$11,$12)
      RETURNING *
    `, [
      folio, aid, client_id, client_name || null, client_box_id || null,
      JSON.stringify(package_uids), JSON.stringify(trackings || []),
      notes || null, Number(total_mxn),
      poboxPaymentId, paymentRef, serviceTypeForConfig,
    ]);

    // ── 8. Get branch info ────────────────────────────────────────────────
    let branchInfo: any = { name: 'CEDIS Monterrey', address: 'Monterrey, N.L.', phone: '', business_hours: '' };
    try {
      const bRes = await pool.query(`SELECT name, address, phone, business_hours FROM branches WHERE is_active = TRUE ORDER BY id LIMIT 1`);
      if (bRes.rows.length > 0) branchInfo = bRes.rows[0];
    } catch { /* ignore */ }

    return res.status(201).json({
      ...apoRes.rows[0],
      pobox_payment_id: poboxPaymentId,
      payment_reference: paymentRef,
      bank_info: {
        banco: companyInfo.bank_name,
        clabe: companyInfo.bank_clabe,
        cuenta: companyInfo.bank_account || companyInfo.bank_clabe?.slice(-10),
        beneficiario: companyInfo.legal_name,
        concepto: paymentRef,
      },
      branch_info: {
        nombre: branchInfo.name,
        direccion: branchInfo.address,
        telefono: branchInfo.phone,
        horario: branchInfo.business_hours,
      },
    });
  } catch (e: any) {
    console.error('[payment-orders] create:', e);
    return res.status(500).json({ error: 'Error al crear orden' });
  }
};

// ─── UPDATE STATUS ──────────────────────────────────────────────────────────
// Syncs status to the linked pobox_payments record so the client's view is
// consistent.
export const updateAdvisorPaymentOrderStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pendiente', 'en_proceso', 'pagado', 'cancelado'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado inválido' });

    // Fetch current order to check if transition is allowed
    const current = await pool.query(
      `SELECT id, status, pobox_payment_id, payment_reference FROM advisor_payment_orders WHERE id=$1 AND advisor_id=$2`,
      [id, aid]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });

    const currentStatus = current.rows[0].status;
    // Prevent cancelling already-approved orders
    if (status === 'cancelado' && currentStatus === 'pagado') {
      return res.status(400).json({ error: 'No se puede cancelar una orden ya pagada/aprobada.' });
    }

    const r = await pool.query(
      `UPDATE advisor_payment_orders SET status=$1, updated_at=NOW()
       WHERE id=$2 AND advisor_id=$3 RETURNING *`,
      [status, id, aid]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });

    const poboxPaymentId = r.rows[0].pobox_payment_id;
    const paymentReference = r.rows[0].payment_reference;
    const poboxStatus = toPobox[status];

    // Sync to pobox_payments if linked
    if (poboxPaymentId && poboxStatus) {
      await pool.query(
        `UPDATE pobox_payments SET status=$1 WHERE id=$2`,
        [poboxStatus, poboxPaymentId]
      ).catch(() => {});
    }

    // When cancelling, also remove from cobranza dashboard
    if (status === 'cancelado' && paymentReference) {
      await pool.query(
        `UPDATE openpay_webhook_logs SET estatus_procesamiento='cancelled'
         WHERE transaction_id=$1 AND estatus_procesamiento='pending_payment'`,
        [paymentReference]
      ).catch(() => {});
    }

    return res.json(r.rows[0]);
  } catch (e: any) {
    console.error('[payment-orders] update:', e);
    return res.status(500).json({ error: 'Error al actualizar orden' });
  }
};

// ─── DELETE ─────────────────────────────────────────────────────────────────
export const deleteAdvisorPaymentOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });
    const { id } = req.params;
    // Pre-check to give better error if already paid
    const check = await pool.query(
      `SELECT status FROM advisor_payment_orders WHERE id=$1 AND advisor_id=$2`,
      [id, aid]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    if (check.rows[0].status === 'pagado') {
      return res.status(400).json({ error: 'No se puede cancelar una orden ya pagada/aprobada.' });
    }

    const r = await pool.query(
      `UPDATE advisor_payment_orders SET status='cancelado', updated_at=NOW()
       WHERE id=$1 AND advisor_id=$2 AND status='pendiente'
       RETURNING id, pobox_payment_id, payment_reference`,
      [id, aid]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Orden no encontrada o no cancelable' });

    // Cancel linked pobox_payments and remove from cobranza dashboard
    const { pobox_payment_id: poboxPaymentId, payment_reference: paymentRef } = r.rows[0];
    if (poboxPaymentId) {
      await pool.query(
        `UPDATE pobox_payments SET status='cancelled' WHERE id=$1 AND status IN ('pending','pending_payment')`,
        [poboxPaymentId]
      ).catch(() => {});
    }
    if (paymentRef) {
      await pool.query(
        `UPDATE openpay_webhook_logs SET estatus_procesamiento='cancelled'
         WHERE transaction_id=$1 AND estatus_procesamiento='pending_payment'`,
        [paymentRef]
      ).catch(() => {});
    }

    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[payment-orders] delete:', e);
    return res.status(500).json({ error: 'Error al eliminar orden' });
  }
};
