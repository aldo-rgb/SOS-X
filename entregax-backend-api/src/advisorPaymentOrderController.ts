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

    // ── 1b. Check for duplicate active orders containing any of these UIDs ─
    const dupCheckRes = await pool.query(`
      SELECT COALESCE(apo.payment_reference, apo.folio) as ref
      FROM advisor_payment_orders apo
      WHERE apo.status NOT IN ('cancelado', 'pagado')
        AND apo.client_id = $1
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(apo.package_uids) uid
          WHERE uid = ANY($2)
        )
      LIMIT 5
    `, [client_id, package_uids as string[]]);

    if (dupCheckRes.rows.length > 0) {
      const existingRefs = [...new Set(dupCheckRes.rows.map((r: any) => r.ref))].join(', ');
      return res.status(409).json({
        error: 'Algunas guías ya tienen una orden de pago activa',
        message: `Las guías seleccionadas ya están incluidas en órdenes activas (${existingRefs}). Cancela o paga esa orden primero.`,
        existing_refs: dupCheckRes.rows.map((r: any) => r.ref),
      });
    }

    // Also check pobox_payments (client-originated orders)
    if (allPackageIds.length > 0) {
      const dupPoboxRes = await pool.query(`
        SELECT pp.payment_reference, pkg_id::int as pid
        FROM pobox_payments pp,
             jsonb_array_elements(pp.package_ids) AS pkg_id
        WHERE pp.user_id = $1
          AND pp.status NOT IN ('cancelled', 'expired', 'paid', 'completed')
          AND pkg_id::int = ANY($2)
        LIMIT 5
      `, [client_id, allPackageIds]);

      if (dupPoboxRes.rows.length > 0) {
        const existingRefs = [...new Set(dupPoboxRes.rows.map((r: any) => r.payment_reference))].join(', ');
        return res.status(409).json({
          error: 'Algunas guías ya tienen una orden de pago activa',
          message: `Las guías seleccionadas ya están incluidas en órdenes activas (${existingRefs}). Cancela o paga esa orden primero.`,
          existing_refs: dupPoboxRes.rows.map((r: any) => r.payment_reference),
        });
      }
    }

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
      return res.status(500).json({ error: `No hay cuenta bancaria configurada para el servicio ${serviceTypeForConfig}. Configura la empresa emisora en Comisiones → Servicios antes de crear órdenes de pago.` });
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
      `SELECT id, status, pobox_payment_id, payment_reference, package_uids FROM advisor_payment_orders WHERE id=$1 AND advisor_id=$2`,
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

    // When marked pagado: update individual guide payment status in each table
    if (status === 'pagado') {
      try {
        const rawUids = current.rows[0].package_uids;
        const uids: string[] = Array.isArray(rawUids)
          ? rawUids
          : (typeof rawUids === 'string' ? JSON.parse(rawUids) : []);

        const pkgIds: number[] = [];
        const marIds: number[] = [];
        const dhlIds: number[] = [];

        for (const uid of uids) {
          const parts = String(uid).split('-');
          const prefix = parts[0];
          const numId = parseInt(parts[1] ?? '');
          if (isNaN(numId)) continue;
          if (prefix === 'PKG')      pkgIds.push(numId);
          else if (prefix === 'MAR') marIds.push(numId);
          else if (prefix === 'DHL') dhlIds.push(numId);
        }

        if (pkgIds.length > 0) {
          await pool.query(
            `UPDATE packages SET client_paid=TRUE, client_paid_at=CURRENT_TIMESTAMP, saldo_pendiente=0, payment_status='paid' WHERE id=ANY($1)`,
            [pkgIds]
          ).catch(() => {});
        }
        if (dhlIds.length > 0) {
          await pool.query(
            `UPDATE dhl_shipments SET paid_at=CURRENT_TIMESTAMP, cost_payment_status='paid', monto_pagado=COALESCE(total_cost_mxn, saldo_pendiente, 0), saldo_pendiente=0 WHERE id=ANY($1) AND paid_at IS NULL`,
            [dhlIds]
          ).catch(() => {});
        }
        if (marIds.length > 0) {
          await pool.query(
            `UPDATE maritime_orders SET payment_status='paid', client_paid_at=CURRENT_TIMESTAMP WHERE id=ANY($1)`,
            [marIds]
          ).catch(() => {});
        }
      } catch { /* non-critical */ }
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

// ─── DETAIL (con desglose por guía hija) ────────────────────────────────────
// Devuelve la orden + items por package: master con sus hijos (N1/N2/N3 USD + MXN)
export const getAdvisorPaymentOrderDetail = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureTable();
    const aid = advisorId(req);
    if (!aid) return res.status(401).json({ error: 'No autenticado' });
    const { id } = req.params;
    // Desambigua colisiones de id entre advisor_payment_orders y pobox_payments
    const source = req.query.source === 'client' || req.query.source === 'advisor'
      ? String(req.query.source) : null;

    // Obtener la orden (apo o pobox_payments) — reusamos la lógica del list filtrando por id
    const orderRes = await pool.query(`
      SELECT * FROM (
        SELECT
          apo.id, apo.folio, 'advisor' AS created_by,
          apo.client_id, apo.client_name, apo.client_box_id,
          apo.package_uids, apo.trackings, apo.notes, apo.total_mxn,
          apo.status, apo.payment_reference, apo.pobox_payment_id,
          apo.created_at, apo.advisor_id
        FROM advisor_payment_orders apo
        WHERE apo.id = $1 AND apo.advisor_id = $2
        UNION ALL
        SELECT
          pp.id, NULL AS folio, 'client' AS created_by,
          pp.user_id AS client_id, u.full_name AS client_name, u.box_id AS client_box_id,
          COALESCE(pp.package_ids, '[]'::jsonb) AS package_uids,
          '[]'::jsonb AS trackings,
          NULL AS notes, pp.amount AS total_mxn, pp.status, pp.payment_reference,
          pp.id AS pobox_payment_id, pp.created_at, $2::int AS advisor_id
        FROM pobox_payments pp
        JOIN users u ON u.id = pp.user_id
        WHERE pp.id = $1 AND (u.advisor_id = $2 OR u.referred_by_id = $2)
      ) o
      WHERE ($3::text IS NULL OR o.created_by = $3)
      LIMIT 1
    `, [id, aid, source]);

    if (orderRes.rowCount === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }
    const order = orderRes.rows[0];

    // Extraer IDs de packages desde package_uids (PKG-XX, MAR-XX, DHL-XX, o int)
    const uids: any[] = Array.isArray(order.package_uids) ? order.package_uids : [];
    const pkgIds: number[] = [];
    const marIds: number[] = [];
    const dhlIds: number[] = [];
    for (const u of uids) {
      const s = String(u);
      if (s.startsWith('PKG-')) pkgIds.push(parseInt(s.slice(4)));
      else if (s.startsWith('MAR-')) marIds.push(parseInt(s.slice(4)));
      else if (s.startsWith('DHL-')) dhlIds.push(parseInt(s.slice(4)));
      else if (/^\d+$/.test(s)) pkgIds.push(parseInt(s));
    }

    // Para packages: traer master + hijos con desglose POBOX (n_level, USD, MXN)
    const items: any[] = [];
    if (pkgIds.length > 0) {
      const pkgRes = await pool.query(`
        SELECT
          p.id, p.tracking_internal, p.is_master, p.master_id, p.child_no,
          p.weight, p.pkg_length, p.pkg_width, p.pkg_height,
          p.long_cm, p.width_cm, p.height_cm, p.description,
          p.pobox_tarifa_nivel, p.pobox_venta_usd, p.pobox_service_cost,
          p.assigned_cost_mxn, p.saldo_pendiente, p.monto_pagado,
          p.air_sale_price, p.registered_exchange_rate,
          p.service_type::text AS service_type,
          p.box_number, p.total_boxes
        FROM packages p
        WHERE p.id = ANY($1::int[])
           OR p.master_id = ANY($1::int[])
        ORDER BY p.master_id NULLS FIRST, p.id
      `, [pkgIds]);

      // Agrupar por master
      const masters = pkgRes.rows.filter((r: any) => pkgIds.includes(r.id));
      for (const m of masters) {
        const children = pkgRes.rows.filter((r: any) => r.master_id === m.id);
        const tc = parseFloat(m.registered_exchange_rate) || (children.find((c: any) => c.registered_exchange_rate) as any)?.registered_exchange_rate || 18.5;
        items.push({
          id: m.id,
          tracking: m.tracking_internal,
          service_type: m.service_type,
          description: m.description,
          weight: parseFloat(m.weight) || 0,
          lengthCm: parseFloat(m.pkg_length) || parseFloat(m.long_cm) || 0,
          widthCm: parseFloat(m.pkg_width) || parseFloat(m.width_cm) || 0,
          heightCm: parseFloat(m.pkg_height) || parseFloat(m.height_cm) || 0,
          is_master: m.is_master,
          total_boxes: m.total_boxes || (children.length || 1),
          tipo: 'POBOX',
          venta_usd: parseFloat(m.pobox_venta_usd) || children.reduce((s: number, c: any) => s + (parseFloat(c.pobox_venta_usd) || 0), 0),
          venta_mxn: parseFloat(m.pobox_service_cost) || parseFloat(m.assigned_cost_mxn) || parseFloat(m.saldo_pendiente) || 0,
          exchange_rate: parseFloat(tc) || 18.5,
          children: children.map((c: any) => ({
            id: c.id,
            tracking: c.tracking_internal,
            child_no: c.child_no,
            n_level: c.pobox_tarifa_nivel ? `N${c.pobox_tarifa_nivel}` : null,
            venta_usd: parseFloat(c.pobox_venta_usd) || 0,
            venta_mxn: parseFloat(c.pobox_service_cost) || parseFloat(c.assigned_cost_mxn) || 0,
            weight: parseFloat(c.weight) || 0,
            lengthCm: parseFloat(c.pkg_length) || parseFloat(c.long_cm) || 0,
            widthCm: parseFloat(c.pkg_width) || parseFloat(c.width_cm) || 0,
            heightCm: parseFloat(c.pkg_height) || parseFloat(c.height_cm) || 0,
            description: c.description,
          })),
        });
      }
    }

    if (marIds.length > 0) {
      const marRes = await pool.query(`
        SELECT mo.id, mo.ordersn AS tracking, mo.bl_number, mo.goods_name AS description,
               mo.weight, mo.cbm, mo.assigned_cost_mxn, mo.saldo_pendiente, mo.monto_pagado
        FROM maritime_orders mo WHERE mo.id = ANY($1::int[])
      `, [marIds]);
      for (const m of marRes.rows) {
        items.push({
          id: m.id, tracking: m.tracking, service_type: 'SEA_CHN_MX',
          description: m.description, weight: parseFloat(m.weight) || 0,
          tipo: 'MARITIMO', cbm: parseFloat(m.cbm) || 0,
          venta_mxn: parseFloat(m.assigned_cost_mxn) || parseFloat(m.saldo_pendiente) || 0,
          children: [],
        });
      }
    }

    if (dhlIds.length > 0) {
      const dhlRes = await pool.query(`
        SELECT ds.id, ds.inbound_tracking AS tracking, ds.secondary_tracking,
               ds.description, ds.weight_kg AS weight,
               ds.total_cost_mxn, ds.saldo_pendiente, ds.monto_pagado
        FROM dhl_shipments ds WHERE ds.id = ANY($1::int[])
      `, [dhlIds]);
      for (const d of dhlRes.rows) {
        items.push({
          id: d.id, tracking: d.secondary_tracking || d.tracking, service_type: 'AA_DHL',
          description: d.description, weight: parseFloat(d.weight) || 0,
          tipo: 'DHL',
          venta_mxn: parseFloat(d.total_cost_mxn) || parseFloat(d.saldo_pendiente) || 0,
          children: [],
        });
      }
    }

    // Desglose de costos para la cotización/PDF (mismo criterio que el historial
    // del cliente): Paquetería y GEX desde las guías PO Box top-level; Cargos Extra
    // por tracking (master + hijas); PO Box como remanente para reconciliar el TOTAL.
    const cost_breakdown = { pobox: 0, paqueteria: 0, gex: 0, extra: 0 };
    try {
      if (pkgIds.length > 0) {
        const topRes = await pool.query(`
          SELECT COALESCE(national_shipping_cost, 0) AS ship,
                 COALESCE(gex_total_cost, 0) AS gex
          FROM packages WHERE id = ANY($1::int[])
        `, [pkgIds]);
        for (const r of topRes.rows) {
          cost_breakdown.paqueteria += Number(r.ship) || 0;
          cost_breakdown.gex += Number(r.gex) || 0;
        }
        const trkRes = await pool.query(`
          SELECT tracking_internal FROM packages
          WHERE id = ANY($1::int[]) OR master_id = ANY($1::int[])
        `, [pkgIds]);
        const trks = trkRes.rows.map((r: any) => r.tracking_internal).filter(Boolean).map(String);
        if (trks.length > 0) {
          const ch = await pool.query(
            `SELECT tipo, monto FROM guias_ajustes_financieros
             WHERE activo = true AND guia_tracking = ANY($1::text[])`,
            [trks]
          );
          for (const c of ch.rows) {
            cost_breakdown.extra += (c.tipo === 'descuento' ? -1 : 1) * (Number(c.monto) || 0);
          }
        }
      }
      cost_breakdown.pobox = (Number(order.total_mxn) || 0)
        - cost_breakdown.paqueteria - cost_breakdown.gex - cost_breakdown.extra;
    } catch (e) {
      console.error('[payment-orders] detail cost_breakdown:', e);
    }

    return res.json({ order, items, cost_breakdown });
  } catch (e: any) {
    console.error('[payment-orders] detail:', e);
    return res.status(500).json({ error: 'Error al obtener detalle de orden' });
  }
};
