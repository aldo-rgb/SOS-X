// ============================================================================
// HISTORIAL DE ÓRDENES DE PAGO — SOLO CONSULTA
// ----------------------------------------------------------------------------
// Devuelve una vista unificada, de solo lectura, de las órdenes de pago que
// viven distribuidas en varias tablas (pobox_payments, advisor_payment_orders,
// entangled_payment_requests, warranties). NO modifica nada.
//
// Servicios soportados:
//   POBOX_USA   → pobox_payments (packages con service_type POBOX_USA)
//                 + advisor_payment_orders con service_type_cfg='POBOX_USA'
//   MARITIMO    → pobox_payments cuyos package_ids referencian maritime_orders
//   AA_DHL      → pobox_payments cuyos package_ids referencian dhl_shipments
//                 + advisor_payment_orders con service_type_cfg='AA_DHL'
//   AIR_CHN_MX  → pobox_payments cuyo primer package.service_type es AIR_CHN_MX
//                 + advisor_payment_orders con service_type_cfg='AIR_CHN_MX'
//   TDI_EXPRESS → pobox_payments cuyo primer package.service_type es TDI_EXPRESS
//   XPAY        → entangled_payment_requests
//   GEX         → warranties
// ============================================================================
import { Request, Response } from 'express';
import { pool } from './db';

type ServiceKey =
  | 'ALL'
  | 'POBOX_USA'
  | 'MARITIMO'
  | 'AA_DHL'
  | 'AIR_CHN_MX'
  | 'TDI_EXPRESS'
  | 'XPAY'
  | 'GEX';

interface PaymentOrderRow {
  source: 'pobox_payments' | 'advisor_payment_orders' | 'entangled' | 'warranty';
  service: ServiceKey;
  service_label: string;
  id: number;
  folio: string | null;
  reference: string | null;
  client_id: number | null;
  client_name: string | null;
  client_box_id: string | null;
  amount: number;
  currency: string;
  status: string;
  status_label: string;
  created_at: string | Date;
  paid_at: string | Date | null;
  items_count: number;
}

const SERVICE_LABELS: Record<Exclude<ServiceKey, 'ALL'>, string> = {
  POBOX_USA:   'PO Box USA',
  MARITIMO:    'Marítimo China',
  AA_DHL:      'DHL Monterrey',
  AIR_CHN_MX:  'TDI Aéreo',
  TDI_EXPRESS: 'TDI Express',
  XPAY:        'X-Pay',
  GEX:         'GEX',
};

// Status → etiqueta en español legible. Se aplica sobre el status crudo de
// cada tabla; si no hay match se devuelve el crudo.
const STATUS_ES: Record<string, string> = {
  // pobox_payments
  pending:   'Pendiente',
  paid:      'Pagado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  cancelado: 'Cancelado',
  canceled:  'Cancelado',
  expired:   'Expirado',
  expirado:  'Expirado',
  refunded:  'Reembolsado',
  // advisor_payment_orders
  pendiente: 'Pendiente',
  pagado:    'Pagado',
  parcial:   'Pago parcial',
  // entangled_payment_requests estatus_global
  en_proceso: 'En proceso',
  completado: 'Completado',
  rechazado:  'Rechazado',
  error_envio: 'Error de envío',
  // warranties
  draft:     'Borrador',
  generated: 'Emitida',
  active:    'Activa',
  rejected:  'Rechazada',
};

const labelStatus = (s: string | null | undefined) => {
  if (!s) return '—';
  return STATUS_ES[String(s).toLowerCase()] || s;
};

const VALID_SERVICES: ServiceKey[] = [
  'ALL', 'POBOX_USA', 'MARITIMO', 'AA_DHL', 'AIR_CHN_MX', 'TDI_EXPRESS', 'XPAY', 'GEX',
];

// ---------------------------------------------------------------------------
// GET /api/admin/payment-orders-history
// ---------------------------------------------------------------------------
// Query params:
//   service     : ALL | POBOX_USA | MARITIMO | AA_DHL | AIR_CHN_MX | TDI_EXPRESS | XPAY | GEX
//   date_from   : YYYY-MM-DD (default últimos 90 días)
//   date_to     : YYYY-MM-DD (default hoy)
//   search      : string (busca por folio/referencia/nombre/box_id)
//   status      : all | pending | paid | cancelled | ... (opcional)
//   limit       : número (default 200)
export const getPaymentOrdersHistory = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const rawService = String(req.query.service || 'ALL').toUpperCase();
    const service = (VALID_SERVICES.includes(rawService as ServiceKey)
      ? (rawService as ServiceKey)
      : 'ALL');
    const today = new Date();
    const defaultFrom = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    const dateFrom = req.query.date_from
      ? new Date(`${req.query.date_from}T00:00:00-06:00`)
      : defaultFrom;
    const dateTo = req.query.date_to
      ? new Date(`${req.query.date_to}T23:59:59.999-06:00`)
      : today;
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all').toLowerCase();
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 200, 20),
      1000
    );

    // ------------------------------------------------------------------
    // 1) pobox_payments — normaliza el "servicio" a partir de los items
    //    contenidos en package_ids (packages, dhl_shipments, maritime_orders).
    // ------------------------------------------------------------------
    const poboxSql = `
      WITH resolved AS (
        SELECT
          pp.id,
          pp.user_id,
          pp.amount,
          pp.currency,
          pp.status,
          pp.payment_reference,
          pp.created_at,
          pp.paid_at,
          COALESCE(jsonb_array_length(pp.package_ids), 0) AS items_count,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM maritime_orders mo
               WHERE mo.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
            ) THEN 'MARITIMO'
            WHEN EXISTS (
              SELECT 1 FROM dhl_shipments ds
               WHERE ds.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
            ) THEN 'AA_DHL'
            ELSE (
              SELECT COALESCE(p.service_type, 'POBOX_USA')
                FROM packages p
               WHERE p.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
               ORDER BY p.id ASC LIMIT 1
            )
          END AS svc_raw
        FROM pobox_payments pp
      )
      SELECT
        r.id, r.amount, r.currency, r.status, r.payment_reference,
        r.created_at, r.paid_at, r.items_count,
        r.user_id,
        u.full_name AS client_name,
        u.box_id AS client_box_id,
        CASE
          WHEN r.svc_raw IN ('POBOX_USA','MARITIMO','AA_DHL','AIR_CHN_MX','TDI_EXPRESS') THEN r.svc_raw
          WHEN r.svc_raw IS NULL OR r.svc_raw = '' THEN 'POBOX_USA'
          ELSE 'POBOX_USA'
        END AS service
        FROM resolved r
        LEFT JOIN users u ON u.id = r.user_id
       WHERE r.created_at >= $1 AND r.created_at <= $2
         AND ($3 = 'ALL' OR
              (CASE
                 WHEN r.svc_raw IN ('POBOX_USA','MARITIMO','AA_DHL','AIR_CHN_MX','TDI_EXPRESS') THEN r.svc_raw
                 ELSE 'POBOX_USA'
               END) = $3)
         AND ($4::text IS NULL OR
              UPPER(COALESCE(r.payment_reference,'')) LIKE UPPER($4) OR
              UPPER(COALESCE(u.full_name,'')) LIKE UPPER($4) OR
              UPPER(COALESCE(u.box_id,'')) LIKE UPPER($4))
       ORDER BY r.created_at DESC
       LIMIT $5
    `;
    const poboxParams: any[] = [
      dateFrom,
      dateTo,
      service === 'XPAY' || service === 'GEX' ? '__none__' : service, // si es XPay/GEX no queremos filas de pobox
      search ? `%${search}%` : null,
      limit,
    ];

    // ------------------------------------------------------------------
    // 2) advisor_payment_orders — service_type_cfg como servicio.
    // ------------------------------------------------------------------
    const apoSql = `
      SELECT
        apo.id,
        apo.folio,
        apo.payment_reference,
        apo.total_mxn AS amount,
        'MXN' AS currency,
        COALESCE(pp.status, apo.status) AS status,
        apo.created_at,
        pp.paid_at,
        COALESCE(jsonb_array_length(apo.package_uids), 0) AS items_count,
        apo.client_id,
        apo.client_name,
        apo.client_box_id,
        COALESCE(apo.service_type_cfg, 'POBOX_USA') AS service
      FROM advisor_payment_orders apo
      LEFT JOIN pobox_payments pp ON pp.id = apo.pobox_payment_id
      WHERE apo.created_at >= $1 AND apo.created_at <= $2
        AND ($3 = 'ALL' OR COALESCE(apo.service_type_cfg,'POBOX_USA') = $3)
        AND ($4::text IS NULL OR
             UPPER(COALESCE(apo.folio,'')) LIKE UPPER($4) OR
             UPPER(COALESCE(apo.payment_reference,'')) LIKE UPPER($4) OR
             UPPER(COALESCE(apo.client_name,'')) LIKE UPPER($4) OR
             UPPER(COALESCE(apo.client_box_id,'')) LIKE UPPER($4))
      ORDER BY apo.created_at DESC
      LIMIT $5
    `;
    const apoParams: any[] = [
      dateFrom,
      dateTo,
      service === 'XPAY' || service === 'GEX' || service === 'MARITIMO' || service === 'TDI_EXPRESS'
        ? '__none__'
        : service,
      search ? `%${search}%` : null,
      limit,
    ];

    // ------------------------------------------------------------------
    // 3) entangled_payment_requests — XPay
    // ------------------------------------------------------------------
    const xpaySql = `
      SELECT
        r.id,
        r.referencia_pago AS payment_reference,
        r.op_monto AS amount,
        r.op_divisa_destino AS currency,
        r.estatus_global AS status,
        r.created_at,
        r.comprobante_subido_at AS paid_at,
        1 AS items_count,
        r.user_id AS client_id,
        u.full_name AS client_name,
        u.box_id AS client_box_id
      FROM entangled_payment_requests r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.created_at >= $1 AND r.created_at <= $2
        AND ($3::text IS NULL OR
             UPPER(COALESCE(r.referencia_pago,'')) LIKE UPPER($3) OR
             UPPER(COALESCE(r.cf_razon_social,'')) LIKE UPPER($3) OR
             UPPER(COALESCE(u.full_name,'')) LIKE UPPER($3) OR
             UPPER(COALESCE(u.box_id,'')) LIKE UPPER($3))
      ORDER BY r.created_at DESC
      LIMIT $4
    `;
    const xpayParams: any[] = [
      dateFrom,
      dateTo,
      search ? `%${search}%` : null,
      limit,
    ];

    // ------------------------------------------------------------------
    // 4) warranties — GEX. Como "folio" usamos gex_folio y total_cost_mxn como monto.
    // ------------------------------------------------------------------
    const gexSql = `
      SELECT
        w.id,
        w.gex_folio AS folio,
        w.total_cost_mxn AS amount,
        'MXN' AS currency,
        w.status,
        w.created_at,
        w.paid_at,
        w.box_count AS items_count,
        w.user_id AS client_id,
        u.full_name AS client_name,
        u.box_id AS client_box_id
      FROM warranties w
      LEFT JOIN users u ON u.id = w.user_id
      WHERE w.created_at >= $1 AND w.created_at <= $2
        AND ($3::text IS NULL OR
             UPPER(COALESCE(w.gex_folio,'')) LIKE UPPER($3) OR
             UPPER(COALESCE(u.full_name,'')) LIKE UPPER($3) OR
             UPPER(COALESCE(u.box_id,'')) LIKE UPPER($3))
      ORDER BY w.created_at DESC
      LIMIT $4
    `;
    const gexParams: any[] = [
      dateFrom,
      dateTo,
      search ? `%${search}%` : null,
      limit,
    ];

    // Ejecuta solo las queries relevantes según el filtro de servicio.
    const shouldRunPobox = service === 'ALL' || ['POBOX_USA','MARITIMO','AA_DHL','AIR_CHN_MX','TDI_EXPRESS'].includes(service);
    const shouldRunApo   = service === 'ALL' || ['POBOX_USA','AA_DHL','AIR_CHN_MX'].includes(service);
    const shouldRunXpay  = service === 'ALL' || service === 'XPAY';
    const shouldRunGex   = service === 'ALL' || service === 'GEX';

    const [poboxRes, apoRes, xpayRes, gexRes] = await Promise.all([
      shouldRunPobox ? pool.query(poboxSql, poboxParams) : Promise.resolve({ rows: [] as any[] }),
      shouldRunApo   ? pool.query(apoSql,   apoParams)   : Promise.resolve({ rows: [] as any[] }),
      shouldRunXpay  ? pool.query(xpaySql,  xpayParams)  : Promise.resolve({ rows: [] as any[] }),
      shouldRunGex   ? pool.query(gexSql,   gexParams)   : Promise.resolve({ rows: [] as any[] }),
    ]);

    // Normalizar filas al schema común.
    const normalized: PaymentOrderRow[] = [];

    for (const r of poboxRes.rows) {
      const svc = r.service as Exclude<ServiceKey, 'ALL'>;
      normalized.push({
        source: 'pobox_payments',
        service: svc,
        service_label: SERVICE_LABELS[svc] || svc,
        id: Number(r.id),
        folio: null,
        reference: r.payment_reference || null,
        client_id: r.user_id ? Number(r.user_id) : null,
        client_name: r.client_name || null,
        client_box_id: r.client_box_id || null,
        amount: Number(r.amount) || 0,
        currency: r.currency || 'MXN',
        status: r.status || 'pending',
        status_label: labelStatus(r.status),
        created_at: r.created_at,
        paid_at: r.paid_at,
        items_count: Number(r.items_count) || 0,
      });
    }

    for (const r of apoRes.rows) {
      const svc = String(r.service || 'POBOX_USA') as Exclude<ServiceKey, 'ALL'>;
      normalized.push({
        source: 'advisor_payment_orders',
        service: svc,
        service_label: SERVICE_LABELS[svc] || svc,
        id: Number(r.id),
        folio: r.folio || null,
        reference: r.payment_reference || null,
        client_id: r.client_id ? Number(r.client_id) : null,
        client_name: r.client_name || null,
        client_box_id: r.client_box_id || null,
        amount: Number(r.amount) || 0,
        currency: r.currency || 'MXN',
        status: r.status || 'pendiente',
        status_label: labelStatus(r.status),
        created_at: r.created_at,
        paid_at: r.paid_at || null,
        items_count: Number(r.items_count) || 0,
      });
    }

    for (const r of xpayRes.rows) {
      normalized.push({
        source: 'entangled',
        service: 'XPAY',
        service_label: SERVICE_LABELS.XPAY,
        id: Number(r.id),
        folio: null,
        reference: r.payment_reference || null,
        client_id: r.client_id ? Number(r.client_id) : null,
        client_name: r.client_name || null,
        client_box_id: r.client_box_id || null,
        amount: Number(r.amount) || 0,
        currency: r.currency || 'USD',
        status: r.status || 'pendiente',
        status_label: labelStatus(r.status),
        created_at: r.created_at,
        paid_at: r.paid_at || null,
        items_count: Number(r.items_count) || 1,
      });
    }

    for (const r of gexRes.rows) {
      normalized.push({
        source: 'warranty',
        service: 'GEX',
        service_label: SERVICE_LABELS.GEX,
        id: Number(r.id),
        folio: r.folio || null,
        reference: null,
        client_id: r.client_id ? Number(r.client_id) : null,
        client_name: r.client_name || null,
        client_box_id: r.client_box_id || null,
        amount: Number(r.amount) || 0,
        currency: r.currency || 'MXN',
        status: r.status || 'draft',
        status_label: labelStatus(r.status),
        created_at: r.created_at,
        paid_at: r.paid_at || null,
        items_count: Number(r.items_count) || 0,
      });
    }

    // Filtro adicional por status (aplicado en JS para permitir aliases entre tablas).
    const filtered = status === 'all'
      ? normalized
      : normalized.filter((r) => {
          const s = String(r.status).toLowerCase();
          if (status === 'paid')      return ['paid','pagado','completed','completado','active'].includes(s);
          if (status === 'pending')   return ['pending','pendiente','en_proceso','generated','draft'].includes(s);
          if (status === 'cancelled') return ['cancelled','cancelado','canceled','expired','expirado','rejected','rechazado','error_envio'].includes(s);
          return s === status;
        });

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Resumen por servicio (siempre sobre el resultado normalizado antes del filtro de status).
    const summary: Record<string, { count: number; total_mxn: number; total_usd: number }> = {};
    for (const r of normalized) {
      const key = r.service;
      if (!summary[key]) summary[key] = { count: 0, total_mxn: 0, total_usd: 0 };
      summary[key].count += 1;
      if (r.currency === 'USD' || r.currency === 'RMB') {
        summary[key].total_usd += r.amount;
      } else {
        summary[key].total_mxn += r.amount;
      }
    }

    res.json({
      success: true,
      filters: {
        service,
        date_from: dateFrom,
        date_to: dateTo,
        search,
        status,
        limit,
      },
      totals: {
        rows: filtered.length,
        total_mxn: filtered
          .filter(r => r.currency !== 'USD' && r.currency !== 'RMB')
          .reduce((s, r) => s + r.amount, 0),
        total_usd: filtered
          .filter(r => r.currency === 'USD' || r.currency === 'RMB')
          .reduce((s, r) => s + r.amount, 0),
      },
      summary,
      rows: filtered,
    });
  } catch (err: any) {
    console.error('[payment-orders-history] error:', err);
    res.status(500).json({ success: false, error: err.message || 'Error al obtener historial de órdenes' });
  }
};
