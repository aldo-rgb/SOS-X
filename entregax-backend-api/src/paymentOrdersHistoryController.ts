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
import { isS3Configured, listS3Keys } from './s3Service';
import { asegurarEsquemaCorrecciones } from './xpayCorrecciones';

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
  /** Solo X-Pay: el proveedor con el que se opero. */
  provider_name?: string | null;
  /** Solo X-Pay: deducido, cuando no hay dato guardado. */
  provider_inferred?: string | null;
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
  has_pdf: boolean;
  /**
   * Solo X-Pay: los tres documentos de la operacion. Existen desde siempre y
   * el panel de administracion ya los enseña, pero esta pantalla —la que abre
   * servicio a cliente— no los tenia, asi que para ver un comprobante habia
   * que pedirle a alguien con acceso a Administracion que lo buscara. Son URL
   * publicas de Cloudinary, no hay que firmarlas.
   */
  comprobante_proveedor_url?: string | null;
  factura_url?: string | null;
  comprobante_cliente_url?: string | null;
  /**
   * Solo X-Pay: lo que enseña "Ver detalles". Es a proposito el detalle
   * OPERATIVO —quien recibe, en que banco, en que etapa va, con que fechas—
   * y no lleva los porcentajes de costo, la comision del asesor ni la
   * utilidad: eso vive en el panel de administracion, que pide nivel
   * direccion, y esta pantalla la abre servicio a cliente.
   */
  xpay_detail?: Record<string, unknown>;
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
    // Las columnas de correccion se leen abajo: tienen que existir aunque
    // nadie haya marcado todavia una orden (tarea 874).
    await asegurarEsquemaCorrecciones();
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
            -- Fuente autoritativa: si el cobro nació de una orden de asesor,
            -- su service_type_cfg manda. Evita colisiones de ID entre tablas
            -- (p.ej. un package_id que existe tanto en dhl_shipments como en
            -- maritime_orders y se etiquetaba mal).
            WHEN (
              SELECT apo.service_type_cfg FROM advisor_payment_orders apo
               WHERE apo.pobox_payment_id = pp.id
                 AND apo.service_type_cfg IS NOT NULL
               ORDER BY apo.id DESC LIMIT 1
            ) IS NOT NULL THEN (
              SELECT apo.service_type_cfg FROM advisor_payment_orders apo
               WHERE apo.pobox_payment_id = pp.id
                 AND apo.service_type_cfg IS NOT NULL
               ORDER BY apo.id DESC LIMIT 1
            )
            -- Los ids de package_ids COLISIONAN entre las tres tablas: el 325 de
            -- una orden DHL existe también como maritime_orders y como packages,
            -- casi siempre de OTRO cliente. Sin exigir el mismo user_id, la
            -- primera rama que encontraba un id ganaba y el cobro se etiquetaba
            -- mal: 84 órdenes ($1.4M) salían como Marítimo siendo DHL o PO Box,
            -- y desaparecían del filtro DHL del panel. Es la misma guarda que ya
            -- usa dhlGroup.ts para no propagar entre clientes.
            WHEN EXISTS (
              SELECT 1 FROM maritime_orders mo
               WHERE mo.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
                 AND mo.user_id IS NOT DISTINCT FROM pp.user_id
            ) THEN 'MARITIMO'
            WHEN EXISTS (
              SELECT 1 FROM dhl_shipments ds
               WHERE ds.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
                 AND ds.user_id IS NOT DISTINCT FROM pp.user_id
            ) THEN 'AA_DHL'
            ELSE (
              SELECT COALESCE(p.service_type, 'POBOX_USA')
                FROM packages p
               WHERE p.id = ANY(SELECT jsonb_array_elements_text(COALESCE(pp.package_ids,'[]'))::int)
                 AND p.user_id IS NOT DISTINCT FROM pp.user_id
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
        u.box_id AS client_box_id,
        -- Con quien se opero. La columna "Origen" de esta pantalla mostraba el
        -- nombre interno de la tabla —"entangled"—, que ademas es la marca del
        -- proveedor y no debe circular. Aqui sale el proveedor de verdad.
        -- Por donde se fue la operacion: las HIBRIDAS las opera Sankie, que es
        -- gente de BTX, no otro proveedor. El dato que lo dice es es_hibrida,
        -- que ellos mandan en el payload y nosotros ya guardamos.
        -- Antes se intento con el evento "solicitada" y salio mal: ese evento
        -- es una ETAPA (aprobada y en proceso de pago) y lo recibe cualquier
        -- operacion, hibrida o no. De las 147, 57 no hibridas lo tenian y se
        -- estaban marcando como Sankie sin serlo.
        -- Las anteriores a julio traen es_hibrida en NULL —el campo no existia—
        -- y por eso salen sin carril; no significa que no lo hayan tenido.
        CASE WHEN r.es_hibrida IS TRUE THEN 'BTX vía Sankie' ELSE pr.name END AS provider_name,
        -- Respaldo para lo creado antes de que se guardara el proveedor: se
        -- deduce del porcentaje cobrado contra el tarifario. Es flojo (solo
        -- mira proveedores activos), por eso va marcado aparte.
        prov.provider_name AS provider_inferred,
        -- Los documentos de la operacion: el comprobante del pago al
        -- proveedor, la factura y el comprobante que subio el cliente.
        r.comprobante_proveedor_url,
        r.factura_url,
        COALESCE(r.url_comprobante_cliente, r.op_comprobante_cliente_url) AS comprobante_cliente_url,
        -- Detalle operativo para "Ver detalles" (sin cifras de margen).
        r.entangled_transaccion_id,
        r.referencia_proveedor,
        r.servicio,
        r.subservicio,
        r.es_hibrida,
        r.es_pesos,
        r.estatus_factura,
        r.estatus_proveedor,
        r.comprobante_subido_at,
        r.proveedor_pagado_at,
        r.factura_emitida_at,
        COALESCE(NULLIF(r.op_beneficiario_nombre, ''), r.sup_nombre_beneficiario) AS beneficiario_nombre,
        r.sup_banco_nombre AS beneficiario_banco,
        r.sup_numero_cuenta AS beneficiario_cuenta,
        r.sup_swift_bic AS beneficiario_swift,
        r.proveedor_moneda_enviada,
        r.proveedor_monto_enviado,
        r.monto_mxn_total,
        r.tc_cliente_final,
        r.cf_razon_social,
        r.cf_rfc,
        r.error_message,
        a.full_name AS advisor_name,
        -- EN CORRECCION: la marca que le habilita al asesor arreglar los datos
        -- bancarios de una orden que el cliente YA pago, sin cancelarla. Se
        -- pone desde esta misma pantalla (tarea 874).
        r.correccion_abierta,
        r.correccion_numero,
        r.correccion_motivo,
        r.correccion_abierta_at,
        marc.full_name AS correccion_marcada_por
      FROM entangled_payment_requests r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN users a ON a.id = r.advisor_id
      LEFT JOIN users marc ON marc.id = r.correccion_abierta_por
      LEFT JOIN entangled_providers pr ON pr.id = r.provider_id
      LEFT JOIN LATERAL (
        SELECT ep.name AS provider_name
          FROM entangled_providers ep,
               jsonb_array_elements(COALESCE(ep.tarifas, '[]'::jsonb)) tf
         WHERE ep.is_active = true
           AND r.comision_cobrada_porcentaje IS NOT NULL
           AND tf->>'servicio_codigo' = r.servicio
           AND NULLIF(
                 CASE
                   WHEN (r.raw_response->>'es_pesos') = 'true'  THEN tf->>'comision_pesos_porcentaje'
                   WHEN (r.raw_response->>'es_hibrida') = 'true' THEN tf->>'comision_hibrida_porcentaje'
                   ELSE tf->>'comision_normal_porcentaje'
                 END, 'inactivo')::numeric = r.comision_cobrada_porcentaje
         LIMIT 1
      ) prov ON true
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
    // Las órdenes de asesor (OP-…) son un registro interno: cada una ya genera
    // su cobro en pobox_payments, que sí se muestra. Mostrarlas aquí duplicaba
    // cada orden (folio OP-… y su referencia) y causaba confusión, así que se
    // omiten del historial. Su cobro sigue apareciendo vía pobox_payments.
    const shouldRunApo   = false;
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
        has_pdf: false,
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
        has_pdf: false,
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
        provider_name: r.provider_name || null,
        provider_inferred: r.provider_inferred || null,
        comprobante_proveedor_url: r.comprobante_proveedor_url || null,
        factura_url: r.factura_url || null,
        comprobante_cliente_url: r.comprobante_cliente_url || null,
        xpay_detail: {
          transaccion_id: r.entangled_transaccion_id || null,
          referencia_proveedor: r.referencia_proveedor || null,
          servicio: r.servicio || null,
          subservicio: r.subservicio || null,
          es_hibrida: r.es_hibrida === true,
          es_pesos: r.es_pesos === true,
          estatus_factura: r.estatus_factura || null,
          estatus_proveedor: r.estatus_proveedor || null,
          comprobante_subido_at: r.comprobante_subido_at || null,
          proveedor_pagado_at: r.proveedor_pagado_at || null,
          factura_emitida_at: r.factura_emitida_at || null,
          beneficiario_nombre: r.beneficiario_nombre || null,
          beneficiario_banco: r.beneficiario_banco || null,
          beneficiario_cuenta: r.beneficiario_cuenta || null,
          beneficiario_swift: r.beneficiario_swift || null,
          proveedor_moneda_enviada: r.proveedor_moneda_enviada || null,
          proveedor_monto_enviado: r.proveedor_monto_enviado != null ? Number(r.proveedor_monto_enviado) : null,
          monto_mxn_total: r.monto_mxn_total != null ? Number(r.monto_mxn_total) : null,
          tc_cliente_final: r.tc_cliente_final != null ? Number(r.tc_cliente_final) : null,
          cf_razon_social: r.cf_razon_social || null,
          cf_rfc: r.cf_rfc || null,
          error_message: r.error_message || null,
          advisor_name: r.advisor_name || null,
          correccion_abierta: r.correccion_abierta === true,
          correccion_numero: Number(r.correccion_numero) || 0,
          correccion_motivo: r.correccion_motivo || null,
          correccion_abierta_at: r.correccion_abierta_at || null,
          correccion_marcada_por: r.correccion_marcada_por || null,
          comprobante_pagado: !!r.comprobante_subido_at,
        },
        has_pdf: false,
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
        has_pdf: false,
      });
    }

    // ¿Qué órdenes tienen PDF guardado? Se resuelve con UNA sola operación de
    // listado en S3 (prefijo de cotizaciones) en vez de un HEAD por fila. El
    // botón de PDF en el frontend solo se muestra si has_pdf === true.
    try {
      if (isS3Configured() && normalized.length > 0) {
        const keys = await listS3Keys('payment-orders/cotizacion-');
        const pdfRefs = new Set<string>();
        for (const k of keys) {
          const m = k.match(/payment-orders\/cotizacion-(.+)\.pdf$/);
          if (m && m[1]) pdfRefs.add(m[1]);
        }
        const safeRefOf = (ref: string | null): string =>
          String(ref || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
        for (const r of normalized) {
          const candidate = safeRefOf(r.reference || r.folio);
          r.has_pdf = !!candidate && pdfRefs.has(candidate);
        }
      }
    } catch (e: any) {
      console.warn('[payment-orders-history] no se pudo verificar PDFs en S3:', e?.message || e);
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
