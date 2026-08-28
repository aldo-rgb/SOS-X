/**
 * CORTES DE COMISIONES (viernes → jueves)
 *
 * El pago a asesores se hacía juntando el reporte a mano: quién ganó qué en la
 * semana, cuánto le toca dispersar al líder a sus subasesores, y después marcar
 * una por una las comisiones como pagadas. Aquí eso es un corte: se calcula el
 * periodo, se revisa, se acepta, y con eso quedan las comisiones liquidadas, el
 * histórico guardado y cada asesor notificado con su detalle.
 *
 * Reglas que respeta el corte:
 *  · Solo entra lo COBRABLE. Una comisión en crédito —el cliente pagó su envío
 *    con su línea y aún no abona— no se le puede pagar al asesor todavía, y una
 *    comisión sin orden de pago detrás no tiene con qué cobrarse.
 *  · El líder recibe lo suyo MÁS el override de sus subasesores, porque él es
 *    quien dispersa; su detalle trae desglosado cuánto le toca a cada sub para
 *    que sepa qué repartir.
 *  · Si a alguien le toca $0 no se le notifica: un push de "te tocan cero" solo
 *    hace ruido.
 */
import { Request, Response } from 'express';
import { pool } from './db';
import { AEREO_PAID_ORDER_SQL, XPAY_COMPLETED_SQL, GEX_PAID_SQL } from './commissionController';

/** Una comisión es cobrable si hay una orden PAGADA que la respalde. */
const CON_ORDEN_PAGADA = `(
    EXISTS (SELECT 1 FROM pobox_payments pp_o
             WHERE ac.shipment_type = 'PKG'
               AND pp_o.status IN ('completed','paid')
               AND (pp_o.package_ids @> to_jsonb(ac.shipment_id)
                    OR pp_o.id = (SELECT p2.pobox_payment_id FROM packages p2 WHERE p2.id = ac.shipment_id)
                    OR pp_o.payment_reference = NULLIF((SELECT p3.payment_reference FROM packages p3 WHERE p3.id = ac.shipment_id), '')))
    OR EXISTS (SELECT 1 FROM pobox_payments pp_d
                WHERE ac.shipment_type = 'DHL'
                  AND (pp_d.payment_reference LIKE 'UW-%' OR pp_d.service_type = 'AA_DHL')
                  AND pp_d.status IN ('completed','paid')
                  AND pp_d.package_ids @> to_jsonb(ac.shipment_id))
    -- Una orden DHL que cubre varias cajas guarda UN SOLO id en package_ids; el
    -- amarre del resto del grupo es el sello de pago, idéntico al de la orden.
    OR EXISTS (SELECT 1 FROM pobox_payments pp_g
                 JOIN dhl_shipments d_g ON d_g.id = ac.shipment_id
                WHERE ac.shipment_type = 'DHL'
                  AND pp_g.payment_reference LIKE 'UW-%'
                  AND pp_g.status IN ('completed','paid')
                  AND pp_g.user_id = d_g.user_id
                  AND d_g.paid_at IS NOT NULL
                  AND ABS(EXTRACT(EPOCH FROM (pp_g.paid_at - d_g.paid_at))) < 5)
    OR EXISTS (SELECT 1 FROM advisor_payment_orders apo_o
                WHERE apo_o.status = 'pagado'
                  AND (apo_o.package_uids ? ('PKG-' || ac.shipment_id::text)
                       OR (ac.tracking IS NOT NULL AND apo_o.trackings ? ac.tracking)))
    OR EXISTS (SELECT 1 FROM entangled_payment_requests epr_o
                WHERE ac.shipment_type = 'XPAY' AND epr_o.id = ac.shipment_id
                  AND epr_o.estatus_global = 'completado')
    OR EXISTS (SELECT 1 FROM warranties w_o
                WHERE ac.shipment_type = 'GEX' AND w_o.id = ac.shipment_id
                  AND NULLIF(w_o.gex_folio, '') IS NOT NULL AND w_o.status = 'active')
)`;

/** Lo que entra a un corte: pendiente, cobrable y con orden pagada. */
const ELEGIBLE = `
      ac.status = 'pending'
  AND COALESCE(ac.awaiting_client_payment, FALSE) = FALSE
  AND COALESCE(ac.penalized, false) = false
  AND ${CON_ORDEN_PAGADA}
  AND ${AEREO_PAID_ORDER_SQL}
  AND ${XPAY_COMPLETED_SQL}
  AND ${GEX_PAID_SQL}`;

let esquemaListo = false;
async function ensureEsquema(): Promise<void> {
  if (esquemaListo) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commission_cuts (
      id            SERIAL PRIMARY KEY,
      period_start  DATE NOT NULL,
      period_end    DATE NOT NULL,
      total_mxn     NUMERIC(12,2) NOT NULL DEFAULT 0,
      advisor_count INTEGER NOT NULL DEFAULT 0,
      created_by    INTEGER REFERENCES users(id),
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commission_cut_lines (
      id           SERIAL PRIMARY KEY,
      cut_id       INTEGER NOT NULL REFERENCES commission_cuts(id) ON DELETE CASCADE,
      advisor_id   INTEGER NOT NULL,
      advisor_name TEXT,
      own_mxn      NUMERIC(12,2) NOT NULL DEFAULT 0,
      override_mxn NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_mxn    NUMERIC(12,2) NOT NULL DEFAULT 0,
      guides_count INTEGER NOT NULL DEFAULT 0,
      detalle      JSONB DEFAULT '[]'::jsonb,
      subs         JSONB DEFAULT '[]'::jsonb,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cut_lines_advisor ON commission_cut_lines(advisor_id)`);
  // Qué comisión entró en qué corte: sin esto no se puede reconstruir un corte
  // viejo ni evitar que una comisión caiga en dos.
  await pool.query(`ALTER TABLE advisor_commissions ADD COLUMN IF NOT EXISTS cut_id INTEGER`);
  esquemaListo = true;
}

/**
 * Periodo por defecto: el último viernes→jueves YA CERRADO. Si hoy es viernes,
 * el corte que toca es el de los siete días que acaban ayer jueves.
 */
export function periodoPorDefecto(hoy = new Date()): { from: string; to: string } {
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  // 0=domingo … 4=jueves. Se retrocede al jueves más reciente ya pasado.
  const dia = d.getUTCDay();
  const restar = ((dia - 4) + 7) % 7 || 7;   // nunca 0: el jueves de hoy aún no cierra
  const jueves = new Date(d); jueves.setUTCDate(d.getUTCDate() - restar);
  const viernes = new Date(jueves); viernes.setUTCDate(jueves.getUTCDate() - 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(viernes), to: iso(jueves) };
}

const rangoValido = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/** Calcula el corte del periodo: una línea por asesor, con su detalle. */
async function calcularCorte(from: string, to: string) {
  const filas = await pool.query(
    `SELECT ac.id, ac.advisor_id, ac.advisor_name, ac.leader_id, ac.leader_name,
            ac.service_type, ac.tracking, ac.client_name, cu.box_id AS client_box,
            ac.payment_amount_mxn, ac.commission_rate_pct, ac.commission_amount_mxn,
            COALESCE(ac.leader_override_amount, 0) AS leader_override_amount,
            ac.created_at
       FROM advisor_commissions ac
       LEFT JOIN users cu ON cu.id = ac.client_id
      WHERE ${ELEGIBLE}
        AND (ac.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey')::date BETWEEN $1::date AND $2::date
      ORDER BY ac.advisor_name, ac.created_at`,
    [from, to]
  );

  type Linea = {
    advisorId: number; advisorName: string; leaderId: number | null;
    own: number; override: number; guides: number;
    detalle: any[]; subs: Record<number, { name: string; monto: number; guias: number }>;
  };
  const porAsesor = new Map<number, Linea>();
  const nuevo = (id: number, nombre: string, leaderId: number | null): Linea => ({
    advisorId: id, advisorName: nombre, leaderId, own: 0, override: 0, guides: 0, detalle: [], subs: {},
  });

  for (const r of filas.rows) {
    const aid = Number(r.advisor_id);
    if (!porAsesor.has(aid)) porAsesor.set(aid, nuevo(aid, r.advisor_name || '—', r.leader_id ? Number(r.leader_id) : null));
    const l = porAsesor.get(aid)!;
    const monto = Number(r.commission_amount_mxn) || 0;
    l.own += monto;
    l.guides += 1;
    l.detalle.push({
      id: r.id,
      fecha: r.created_at,
      servicio: r.service_type,
      tracking: r.tracking,
      cliente: r.client_name,
      clienteBox: r.client_box,
      montoBase: Number(r.payment_amount_mxn) || 0,
      tasa: Number(r.commission_rate_pct) || 0,
      comision: monto,
      tipo: 'propia',
    });

    // Override del líder: lo cobra él porque es quien dispersa.
    const ov = Number(r.leader_override_amount) || 0;
    const lid = r.leader_id ? Number(r.leader_id) : null;
    if (lid && ov > 0) {
      if (!porAsesor.has(lid)) porAsesor.set(lid, nuevo(lid, r.leader_name || '—', null));
      const jefe = porAsesor.get(lid)!;
      jefe.override += ov;
      jefe.detalle.push({
        id: r.id,
        fecha: r.created_at,
        servicio: r.service_type,
        tracking: r.tracking,
        cliente: r.client_name,
        clienteBox: r.client_box,
        montoBase: Number(r.payment_amount_mxn) || 0,
        tasa: 0,
        comision: ov,
        tipo: 'override',
        subAsesor: r.advisor_name,
      });
      const s = jefe.subs[aid] || { name: r.advisor_name || '—', monto: 0, guias: 0 };
      s.monto += monto;   // lo que ese sub genera de lo SUYO (lo que el líder le dispersa)
      s.guias += 1;
      jefe.subs[aid] = s;
    }
  }

  const lineas = [...porAsesor.values()]
    .map(l => ({
      advisorId: l.advisorId,
      advisorName: l.advisorName,
      own: +l.own.toFixed(2),
      override: +l.override.toFixed(2),
      total: +(l.own + l.override).toFixed(2),
      guides: l.guides,
      detalle: l.detalle,
      subs: Object.entries(l.subs).map(([id, s]) => ({ subId: Number(id), name: s.name, monto: +s.monto.toFixed(2), guias: s.guias })),
    }))
    .filter(l => l.total > 0.005)
    .sort((a, b) => b.total - a.total);

  return {
    from, to,
    lineas,
    total: +lineas.reduce((s, l) => s + l.total, 0).toFixed(2),
    comisiones: filas.rows.length,
    ids: filas.rows.map((r: any) => Number(r.id)),
  };
}

/** GET /api/admin/commissions/cut/preview?from=&to= — lo que se va a pagar. */
export const previewCorte = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureEsquema();
    const def = periodoPorDefecto();
    const from = rangoValido(req.query.from) ? String(req.query.from) : def.from;
    const to = rangoValido(req.query.to) ? String(req.query.to) : def.to;
    const corte = await calcularCorte(from, to);
    res.json({ success: true, ...corte, ids: undefined });
  } catch (e: any) {
    console.error('[cortes] preview:', e);
    res.status(500).json({ error: 'No se pudo calcular el corte' });
  }
};

/** POST /api/admin/commissions/cut — cierra el corte y notifica. */
export const cerrarCorte = async (req: Request, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    await ensureEsquema();
    const uid = (req as any).user?.userId || null;
    const def = periodoPorDefecto();
    const from = rangoValido(req.body?.from) ? String(req.body.from) : def.from;
    const to = rangoValido(req.body?.to) ? String(req.body.to) : def.to;

    const corte = await calcularCorte(from, to);
    if (corte.lineas.length === 0) {
      return res.status(400).json({ error: 'No hay comisiones cobrables en ese periodo' });
    }

    await client.query('BEGIN');
    const cab = await client.query(
      `INSERT INTO commission_cuts (period_start, period_end, total_mxn, advisor_count, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [from, to, corte.total, corte.lineas.length, uid]
    );
    const cutId = Number(cab.rows[0].id);

    for (const l of corte.lineas) {
      await client.query(
        `INSERT INTO commission_cut_lines (cut_id, advisor_id, advisor_name, own_mxn, override_mxn, total_mxn, guides_count, detalle, subs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
        [cutId, l.advisorId, l.advisorName, l.own, l.override, l.total, l.guides,
         JSON.stringify(l.detalle), JSON.stringify(l.subs)]
      );
    }

    // Marcar pagadas SOLO las comisiones que entraron en este corte.
    await client.query(
      `UPDATE advisor_commissions
          SET status = 'paid', paid_to_advisor_at = NOW(), paid_by_admin_id = $2, cut_id = $3
        WHERE id = ANY($1::int[])`,
      [corte.ids, uid, cutId]
    );
    await client.query('COMMIT');

    // Aviso a cada asesor. Si le toca $0 no entra siquiera en las líneas.
    const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const periodoTxt = `${from} al ${to}`;
    for (const l of corte.lineas) {
      const cuerpo = l.override > 0
        ? `Te tocan ${fmt(l.total)} del corte ${periodoTxt}: ${fmt(l.own)} de tus ${l.guides} guías y ${fmt(l.override)} de override por tus subasesores. Entra a Mis Comisiones › Historial para ver el detalle y descargar el PDF.`
        : `Te tocan ${fmt(l.total)} del corte ${periodoTxt} por ${l.guides} guías. Entra a Mis Comisiones › Historial para ver el detalle y descargar el PDF.`;
      try {
        const { createCustomNotification } = await import('./notificationController');
        await createCustomNotification(
          l.advisorId, `💰 Corte de comisiones · ${fmt(l.total)}`, cuerpo,
          'payment', 'cash-check', { type: 'commission_cut', cut_id: String(cutId), screen: 'AdvisorCommissions' }, '/comisiones'
        );
      } catch (e: any) { console.warn('[cortes] in-app:', e?.message); }
      try {
        const { sendPushToUsers } = await import('./pushService');
        await sendPushToUsers([l.advisorId], {
          title: `💰 Corte de comisiones · ${fmt(l.total)}`,
          body: cuerpo,
          data: { type: 'commission_cut', cut_id: String(cutId), screen: 'AdvisorCommissions' },
        });
      } catch (e: any) { console.warn('[cortes] push:', e?.message); }
    }

    res.json({ success: true, cutId, total: corte.total, advisors: corte.lineas.length, comisiones: corte.ids.length });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[cortes] cerrar:', e);
    res.status(500).json({ error: 'No se pudo cerrar el corte' });
  } finally {
    client.release();
  }
};

const SERVICIOS: Record<string, string> = {
  pobox_usa_mx: 'PO Box USA', aereo_china_mx: 'Aéreo China', maritimo_china_mx: 'Marítimo',
  nacional_mx: 'Nacional', liberacion_aa_dhl: 'DHL', gex_warranty: 'GEX', xpay: 'X-Pay',
  tdi_express: 'TDI Express',
};
const fechaCorta = (v: any) => { try { return new Date(v).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };

/** Excel del corte: una pestaña de resumen y una por asesor. */
export const excelCorte = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureEsquema();
    const cutId = parseInt(String(req.params.id));
    let cab: any, lineas: any[];

    if (cutId) {
      const c = await pool.query(`SELECT * FROM commission_cuts WHERE id = $1`, [cutId]);
      if (c.rows.length === 0) return res.status(404).json({ error: 'Corte no encontrado' });
      cab = c.rows[0];
      lineas = (await pool.query(
        `SELECT * FROM commission_cut_lines WHERE cut_id = $1 ORDER BY total_mxn DESC`, [cutId])).rows
        .map(r => ({ advisorName: r.advisor_name, own: Number(r.own_mxn), override: Number(r.override_mxn),
                     total: Number(r.total_mxn), guides: r.guides_count, detalle: r.detalle || [], subs: r.subs || [] }));
    } else {
      // Vista previa: aún no existe el corte, se calcula al vuelo.
      const def = periodoPorDefecto();
      const from = rangoValido(req.query.from) ? String(req.query.from) : def.from;
      const to = rangoValido(req.query.to) ? String(req.query.to) : def.to;
      const prev = await calcularCorte(from, to);
      cab = { period_start: from, period_end: to, total_mxn: prev.total };
      lineas = prev.lineas;
    }

    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // Resumen: lo que se le paga a cada quien.
    const resumen = [
      ['CORTE DE COMISIONES'],
      ['Periodo', `${fechaCorta(cab.period_start)} al ${fechaCorta(cab.period_end)}`],
      ['Asesores a pagar', lineas.length],
      ['Total del corte', Number(cab.total_mxn)],
      [],
      ['Asesor', 'Guías', 'Comisión propia', 'Override de subasesores', 'TOTAL A PAGAR'],
      ...lineas.map(l => [l.advisorName, l.guides, l.own, l.override, l.total]),
      [],
      ['', '', '', 'TOTAL', Number(cab.total_mxn)],
    ];
    const wsR = XLSX.utils.aoa_to_sheet(resumen);
    wsR['!cols'] = [{ wch: 32 }, { wch: 8 }, { wch: 16 }, { wch: 24 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsR, 'Resumen');

    // Una pestaña por asesor. El nombre de pestaña de Excel no admite más de 31
    // caracteres ni : \ / ? * [ ], y no puede repetirse.
    const usados = new Set<string>();
    for (const l of lineas) {
      let nombre = String(l.advisorName || 'Asesor').replace(/[:\\/?*[\]]/g, ' ').slice(0, 28).trim() || 'Asesor';
      let n = nombre, i = 2;
      while (usados.has(n.toLowerCase())) { n = `${nombre.slice(0, 25)} ${i++}`; }
      usados.add(n.toLowerCase());

      const filas: any[][] = [
        [`CORTE DE COMISIONES · ${l.advisorName}`],
        ['Periodo', `${fechaCorta(cab.period_start)} al ${fechaCorta(cab.period_end)}`],
        [],
        ['Comisión propia', l.own],
        ['Override de subasesores', l.override],
        ['TOTAL A PAGAR', l.total],
        [],
      ];
      if ((l.subs || []).length > 0) {
        filas.push(['LO QUE DEBES DISPERSAR A TUS SUBASESORES']);
        filas.push(['Subasesor', 'Guías', 'Le corresponde']);
        for (const s of l.subs) filas.push([s.name, s.guias, s.monto]);
        filas.push([]);
      }
      filas.push(['DETALLE GUÍA POR GUÍA']);
      filas.push(['Fecha', 'Servicio', 'Tracking', 'Cliente', 'N° Cliente', 'Monto base', 'Tasa %', 'Comisión', 'Concepto']);
      for (const d of l.detalle) {
        filas.push([
          fechaCorta(d.fecha), SERVICIOS[d.servicio] || d.servicio || '', d.tracking || '',
          d.cliente || '', d.clienteBox || '', d.montoBase, d.tasa,
          d.comision, d.tipo === 'override' ? `Override de ${d.subAsesor || 'subasesor'}` : 'Comisión propia',
        ]);
      }
      const ws = XLSX.utils.aoa_to_sheet(filas);
      ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 26 }];
      XLSX.utils.book_append_sheet(wb, ws, n);
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const archivo = `corte-comisiones-${cab.period_start}-a-${cab.period_end}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
    res.send(buf);
  } catch (e: any) {
    console.error('[cortes] excel:', e);
    res.status(500).json({ error: 'No se pudo generar el Excel' });
  }
};

/** GET /api/admin/commissions/cuts — histórico para el panel. */
export const listarCortes = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureEsquema();
    const r = await pool.query(
      `SELECT c.id, c.period_start, c.period_end, c.total_mxn, c.advisor_count, c.created_at,
              u.full_name AS created_by_name
         FROM commission_cuts c LEFT JOIN users u ON u.id = c.created_by
        ORDER BY c.id DESC LIMIT 60`);
    res.json({ success: true, cortes: r.rows });
  } catch (e: any) {
    console.error('[cortes] listar:', e);
    res.status(500).json({ error: 'No se pudieron cargar los cortes' });
  }
};

/** GET /api/advisor/commission-cuts — los cortes que ha recibido el asesor. */
export const misCortes = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureEsquema();
    const uid = (req as any).user?.userId;
    const r = await pool.query(
      `SELECT l.id, l.cut_id, l.own_mxn, l.override_mxn, l.total_mxn, l.guides_count,
              l.detalle, l.subs, c.period_start, c.period_end, c.created_at
         FROM commission_cut_lines l JOIN commission_cuts c ON c.id = l.cut_id
        WHERE l.advisor_id = $1
        ORDER BY c.id DESC LIMIT 40`, [uid]);
    res.json({
      success: true,
      cortes: r.rows.map(x => ({
        id: x.id, cutId: x.cut_id,
        desde: x.period_start, hasta: x.period_end, fecha: x.created_at,
        propia: Number(x.own_mxn), override: Number(x.override_mxn), total: Number(x.total_mxn),
        guias: x.guides_count, detalle: x.detalle || [], subs: x.subs || [],
      })),
    });
  } catch (e: any) {
    console.error('[cortes] misCortes:', e);
    res.status(500).json({ error: 'No se pudieron cargar tus cortes' });
  }
};

/** GET /api/advisor/commission-cuts/:cutId/pdf — comprobante del corte. */
export const pdfMiCorte = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureEsquema();
    const uid = (req as any).user?.userId;
    const cutId = parseInt(String(req.params.cutId));
    const r = await pool.query(
      `SELECT l.*, c.period_start, c.period_end, c.created_at, u.full_name AS asesor
         FROM commission_cut_lines l
         JOIN commission_cuts c ON c.id = l.cut_id
         LEFT JOIN users u ON u.id = l.advisor_id
        WHERE l.cut_id = $1 AND l.advisor_id = $2`, [cutId, uid]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Corte no encontrado' });
    const l = r.rows[0];

    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
    const NARANJA = rgb(0.94, 0.35, 0.16);
    const GRIS = rgb(0.42, 0.45, 0.5);

    let page = doc.addPage([595, 842]);   // A4
    let y = 790;
    const M = 45;
    const nuevaPagina = () => { page = doc.addPage([595, 842]); y = 790; };
    const linea = (txt: string, opts: { x?: number; size?: number; bold?: boolean; color?: any } = {}) => {
      if (y < 60) nuevaPagina();
      page.drawText(txt, { x: opts.x ?? M, y, size: opts.size ?? 10, font: opts.bold ? negrita : normal, color: opts.color ?? rgb(0.1, 0.1, 0.1) });
    };
    const mx = (n: number) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    linea('COMPROBANTE DE CORTE DE COMISIONES', { size: 16, bold: true, color: NARANJA }); y -= 24;
    linea(String(l.asesor || l.advisor_name || ''), { size: 12, bold: true }); y -= 16;
    linea(`Periodo: ${fechaCorta(l.period_start)} al ${fechaCorta(l.period_end)}`, { size: 10, color: GRIS }); y -= 14;
    linea(`Corte #${cutId} · generado el ${fechaCorta(l.created_at)}`, { size: 10, color: GRIS }); y -= 26;

    linea('Comisión propia', { bold: true }); linea(mx(l.own_mxn), { x: 440 }); y -= 16;
    linea('Override de subasesores', { bold: true }); linea(mx(l.override_mxn), { x: 440 }); y -= 16;
    linea('TOTAL A PAGAR', { bold: true, size: 12, color: NARANJA });
    linea(mx(l.total_mxn), { x: 440, bold: true, size: 12, color: NARANJA }); y -= 28;

    const subs: any[] = Array.isArray(l.subs) ? l.subs : [];
    if (subs.length > 0) {
      linea('LO QUE DEBES DISPERSAR A TUS SUBASESORES', { bold: true, size: 10 }); y -= 16;
      for (const s of subs) {
        linea(`${s.name} · ${s.guias} guías`, { size: 9, color: GRIS });
        linea(mx(s.monto), { x: 440, size: 9 }); y -= 13;
      }
      y -= 12;
    }

    linea('DETALLE GUÍA POR GUÍA', { bold: true, size: 10 }); y -= 15;
    linea('Fecha', { size: 8, bold: true, color: GRIS });
    linea('Servicio', { x: 105, size: 8, bold: true, color: GRIS });
    linea('Tracking', { x: 180, size: 8, bold: true, color: GRIS });
    linea('Cliente', { x: 330, size: 8, bold: true, color: GRIS });
    linea('Comisión', { x: 480, size: 8, bold: true, color: GRIS });
    y -= 12;
    const detalle: any[] = Array.isArray(l.detalle) ? l.detalle : [];
    for (const d of detalle) {
      linea(fechaCorta(d.fecha), { size: 8 });
      linea(String(SERVICIOS[d.servicio] || d.servicio || '').slice(0, 14), { x: 105, size: 8 });
      linea(String(d.tracking || '').slice(0, 26), { x: 180, size: 8 });
      linea(String(d.clienteBox || d.cliente || '').slice(0, 22), { x: 330, size: 8 });
      linea(mx(d.comision), { x: 480, size: 8 });
      y -= 11;
    }

    const bytes = await doc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="corte-${cutId}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (e: any) {
    console.error('[cortes] pdf:', e);
    res.status(500).json({ error: 'No se pudo generar el PDF' });
  }
};
