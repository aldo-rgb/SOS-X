/**
 * RECOSTEO DE GUÍAS AÉREAS: corregir las medidas y volver a sacar el precio.
 *
 * Por qué existe. El precio de una guía aérea se congela cuando se cotiza y
 * nunca se vuelve a mirar. Eso está bien mientras el dato con el que se coteó
 * sea bueno, pero el peso cobrable sale de las medidas que DECLARA China, y esas
 * llegan mal de las dos maneras:
 *
 *  - de menos: un lote de 34 cajas se coteó sobre el peso neto teniendo el
 *    volumétrico mayor, 383.78 kg de diferencia, $7,061.55 USD sin cobrar
 *    (tarea 1108); y antes, cinco cajas de otro cliente igual (tareas 1092,
 *    1104).
 *  - de más: en el TKT-2026-3722 el volumétrico declarado era de 280 kg contra
 *    182 kg reales al medirlas en CDMX.
 *
 * Hasta ahora no había por dónde arreglarlo. La pantalla de Gestión Aérea
 * enseña las medidas pero no las deja tocar, y cancelar la orden de pago no
 * recostea nada: vuelve a leer el mismo `air_sale_price` viejo. La operación
 * terminaba parchando con un cargo extra a mano —"Corrección de costos",
 * $19,015.98 sobre una de las 34 guías— que cubría el 14% del hueco real.
 * De ahí la petición de la operación en la 1108: una herramienta para esto.
 *
 * LA TARIFA NO SE VUELVE A RESOLVER. Se recostea con la que la guía YA tiene
 * congelada, no con la del tarifario de hoy. El costo de la ruta China-México
 * se movió cinco veces en un mes (9.40 → 9.80 → 9.50 → 9.40 → 11.50 → 11.90 →
 * 12.50) y con él la tarifa Logo, de $18.40 a $21.50 por kilo. Resolver la
 * tarifa otra vez le subiría el 17% a un cliente que ya tenía su precio, lo que
 * no es corregir una medida: es cambiarle el trato. Aquí se corrige SOLO el
 * peso con el que se multiplica.
 *
 * Y nunca toca una guía pagada. El candado va dentro del UPDATE, no solo en la
 * lectura: entre que se arma la vista previa y se aplica, alguien pudo cobrar.
 */

import type { Request, Response } from 'express';
import { pool } from './db';

/** El divisor del aéreo. TDI usa el suyo (5000) y no pasa por aquí. */
export const DIVISOR_AEREO = 6000;

const num = (v: any): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

const redondea = (n: number): number => Math.round(n * 100) / 100;

/** Lo que la operación corrige de una guía: lo que midió CEDIS. */
export interface MedidaCorregida {
  tracking: string;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface RenglonRecosteo {
  id: number;
  tracking: string;
  cliente: string | null;
  casillero: string | null;
  estado: string | null;
  /** Lo que la guía tiene hoy guardado. */
  actual: {
    peso: number;
    largo: number | null;
    ancho: number | null;
    alto: number | null;
    volumetrico: number;
    pesoCobrable: number | null;
    porKg: number;
    tipo: string | null;
    usd: number;
  };
  /** Lo que queda si se aplica. */
  nuevo: {
    peso: number;
    largo: number | null;
    ancho: number | null;
    alto: number | null;
    volumetrico: number;
    pesoCobrable: number;
    porKg: number;
    tipo: string | null;
    usd: number;
    /** De dónde salió el precio por kilo. */
    origenTarifa: string;
  };
  difUsd: number;
  /** Lo que manda el cobro: 'neto' o 'volumetrico'. */
  manda: 'neto' | 'volumetrico' | 'empate';
  /** Si viene lleno, esta guía NO se puede recostear. */
  bloqueo: string | null;
  /** Órdenes de pago abiertas que ya incluyen esta guía. */
  ordenesAbiertas: string[];
}

/**
 * Arma el recosteo de una lista de guías, sin escribir nada.
 *
 * @param trackings Guías a revisar. Acepta el tracking interno o el child_no.
 * @param correcciones Medidas nuevas por guía. Lo que no venga se queda igual.
 */
export async function calcularRecosteo(
  db: { query: (sql: string, params?: any[]) => Promise<any> },
  trackings: string[],
  correcciones: MedidaCorregida[] = [],
): Promise<RenglonRecosteo[]> {
  const limpios = Array.from(
    new Set(trackings.map((t) => String(t || '').trim()).filter(Boolean)),
  );
  if (limpios.length === 0) return [];

  const g = await db.query(
    `SELECT p.id, p.tracking_internal, p.child_no, p.user_id, p.box_id,
            p.weight, p.pkg_length, p.pkg_width, p.pkg_height, p.single_volume,
            p.air_route_id, p.air_tariff_type, p.air_price_per_kg, p.air_sale_price,
            p.air_chargeable_weight, p.air_is_custom_tariff,
            p.status::text AS estado, p.payment_status::text AS pago,
            COALESCE(p.monto_pagado, 0) AS pagado, COALESCE(p.client_paid, false) AS client_paid,
            u.full_name AS cliente
       FROM packages p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.tracking_internal = ANY($1::text[]) OR p.child_no = ANY($1::text[])
      ORDER BY COALESCE(p.child_no, p.tracking_internal)`,
    [limpios],
  );

  // Las órdenes de pago todavía abiertas que ya incluyen alguna de estas guías:
  // recostear no las vuelve a calcular, hay que cancelarlas y regenerarlas.
  const ordenes = await db.query(
    `SELECT apo.payment_reference, apo.folio, apo.trackings
       FROM advisor_payment_orders apo
      WHERE apo.status NOT IN ('cancelado', 'pagado')
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(apo.trackings) t(v)
           WHERE t.v = ANY($1::text[]))`,
    [limpios],
  );

  const porTracking = new Map<string, MedidaCorregida>();
  for (const c of correcciones) {
    const k = String(c?.tracking || '').trim();
    if (k) porTracking.set(k, c);
  }

  const filas: RenglonRecosteo[] = [];

  for (const r of g.rows) {
    const tracking = String(r.child_no || r.tracking_internal);
    const c: Partial<MedidaCorregida> =
      porTracking.get(tracking) || porTracking.get(String(r.tracking_internal)) || {};

    // --- lo que hay hoy ---
    const pesoViejo = num(r.weight);
    const largoViejo = r.pkg_length == null ? null : num(r.pkg_length);
    const anchoViejo = r.pkg_width == null ? null : num(r.pkg_width);
    const altoViejo = r.pkg_height == null ? null : num(r.pkg_height);
    const volViejo = num(r.single_volume)
      || (num(r.pkg_length) * num(r.pkg_width) * num(r.pkg_height)) / DIVISOR_AEREO;

    // --- lo que queda con la corrección ---
    const peso = c.weight != null && num(c.weight) > 0 ? num(c.weight) : pesoViejo;
    const largo = c.length != null && num(c.length) > 0 ? num(c.length) : largoViejo;
    const ancho = c.width != null && num(c.width) > 0 ? num(c.width) : anchoViejo;
    const alto = c.height != null && num(c.height) > 0 ? num(c.height) : altoViejo;

    // Si las tres medidas están, el volumétrico sale de ellas —así una medición
    // de CEDIS pisa el volumen que declaró China—. Si no, se queda el guardado.
    const tocaronMedidas = c.length != null || c.width != null || c.height != null;
    const volDeMedidas = (num(largo) * num(ancho) * num(alto)) / DIVISOR_AEREO;
    const volumetrico = tocaronMedidas && volDeMedidas > 0
      ? redondea(volDeMedidas)
      : redondea(volViejo);

    const pesoCobrable = redondea(Math.max(peso, volumetrico > 0 ? volumetrico : 0));

    // --- la tarifa: la que la guía YA trae, no la de hoy ---
    const tipo = r.air_tariff_type ? String(r.air_tariff_type) : null;
    const porKgCongelado = num(r.air_price_per_kg);
    let porKg = porKgCongelado;
    let origenTarifa = 'tarifa congelada de la guía';
    let usdNuevo = redondea(pesoCobrable * porKg);

    if (tipo === 'SU') {
      // El Start Up es precio PLANO por tramo de peso REAL: el volumétrico no
      // entra. Solo se mueve si la medición cambió el peso, y entonces hay que
      // volver a leer el tramo.
      const tramo = await db.query(
        `SELECT price_usd FROM air_startup_tiers
          WHERE route_id = $1 AND is_active = true
            AND $2::numeric >= min_weight AND $2::numeric <= max_weight
          LIMIT 1`,
        [r.air_route_id, peso],
      );
      const plano = num(tramo.rows[0]?.price_usd);
      if (plano > 0) {
        usdNuevo = redondea(plano);
        porKg = peso > 0 ? redondea(plano / peso) : 0;
        origenTarifa = 'Start Up, tramo por peso real';
      } else {
        origenTarifa = 'Start Up sin tramo para este peso: no se recostea';
        usdNuevo = num(r.air_sale_price);
      }
    } else if (!(porKgCongelado > 0)) {
      // Guía sin tarifa congelada: nunca se coteó. Aquí sí se resuelve, porque
      // no hay trato anterior que respetar.
      const { resolverTarifaDeCliente } = await import('./tarifaDeCliente');
      const acuerdo = await resolverTarifaDeCliente(db, {
        userId: r.user_id, boxId: r.box_id, routeId: r.air_route_id, tipoSugerido: tipo || 'G',
      });
      porKg = acuerdo.pricePerKg;
      origenTarifa = 'sin tarifa congelada → ' + acuerdo.origen;
      usdNuevo = redondea(pesoCobrable * porKg);
    }

    // --- candados ---
    let bloqueo: string | null = null;
    if (num(r.pagado) > 0) bloqueo = 'ya tiene pago aplicado';
    else if (r.client_paid === true) bloqueo = 'marcada como pagada por el cliente';
    else if (String(r.pago || '') === 'paid') bloqueo = 'su estado de pago es pagado';
    else if (!(porKg > 0)) bloqueo = 'no tiene tarifa con la que recostear';
    else if (!(peso > 0) && !(volumetrico > 0)) bloqueo = 'no tiene peso ni medidas';

    const abiertas = ordenes.rows
      .filter((o: any) => {
        const lista: string[] = Array.isArray(o.trackings) ? o.trackings : [];
        return lista.includes(tracking) || lista.includes(String(r.tracking_internal));
      })
      .map((o: any) => String(o.payment_reference || o.folio));

    const usdActual = num(r.air_sale_price);

    filas.push({
      id: r.id,
      tracking,
      cliente: r.cliente || null,
      casillero: r.box_id || null,
      estado: r.estado || null,
      actual: {
        peso: pesoViejo,
        largo: largoViejo, ancho: anchoViejo, alto: altoViejo,
        volumetrico: redondea(volViejo),
        pesoCobrable: r.air_chargeable_weight == null ? null : num(r.air_chargeable_weight),
        porKg: porKgCongelado,
        tipo,
        usd: usdActual,
      },
      nuevo: {
        peso, largo, ancho, alto,
        volumetrico, pesoCobrable, porKg, tipo,
        usd: usdNuevo,
        origenTarifa,
      },
      difUsd: redondea(usdNuevo - usdActual),
      manda: volumetrico > peso ? 'volumetrico' : (peso > volumetrico ? 'neto' : 'empate'),
      bloqueo,
      ordenesAbiertas: Array.from(new Set(abiertas)),
    });
  }

  return filas;
}

/** Las guías de un lote: todas las hijas que comparten el prefijo del master. */
async function trackingsDelLote(lote: string): Promise<string[]> {
  const base = String(lote || '').trim().replace(/-\d+$/, '');
  if (!base) return [];
  const r = await pool.query(
    `SELECT COALESCE(child_no, tracking_internal) AS t
       FROM packages
      WHERE tracking_internal LIKE $1 || '-%' OR child_no LIKE $1 || '-%'
      ORDER BY 1`,
    [base],
  );
  return r.rows.map((x: any) => String(x.t));
}

/**
 * GET/POST vista previa. No escribe nada, así que la puede ver cualquiera que
 * entre a la pantalla.
 *
 * Body: { trackings?: string[], lote?: string, correcciones?: MedidaCorregida[] }
 */
export const previewRecosteoAereo = async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as any;
    let trackings: string[] = Array.isArray(body.trackings) ? body.trackings.map(String) : [];
    if (trackings.length === 0 && body.lote) trackings = await trackingsDelLote(String(body.lote));
    if (trackings.length === 0) {
      return res.status(400).json({ error: 'Dime qué guías revisar: manda trackings o un lote.' });
    }
    if (trackings.length > 500) {
      return res.status(400).json({ error: 'Son demasiadas guías de una vez (máximo 500).' });
    }

    const filas = await calcularRecosteo(pool, trackings, body.correcciones || []);
    if (filas.length === 0) {
      return res.status(404).json({ error: 'No encontré ninguna de esas guías.' });
    }

    const recosteables = filas.filter((f) => !f.bloqueo);
    const resumen = {
      guias: filas.length,
      recosteables: recosteables.length,
      bloqueadas: filas.length - recosteables.length,
      cambian: recosteables.filter((f) => Math.abs(f.difUsd) >= 0.01).length,
      suben: recosteables.filter((f) => f.difUsd >= 0.01).length,
      bajan: recosteables.filter((f) => f.difUsd <= -0.01).length,
      usdActual: redondea(recosteables.reduce((a, f) => a + f.actual.usd, 0)),
      usdNuevo: redondea(recosteables.reduce((a, f) => a + f.nuevo.usd, 0)),
      difUsd: redondea(recosteables.reduce((a, f) => a + f.difUsd, 0)),
      ordenesAbiertas: Array.from(new Set(filas.flatMap((f) => f.ordenesAbiertas))),
    };

    return res.json({ success: true, resumen, filas });
  } catch (e: any) {
    console.error('[recosteo-aereo preview]', e?.message);
    return res.status(500).json({ error: 'No pude armar la vista previa del recosteo.' });
  }
};

/**
 * Aplica el recosteo. Escribe medidas, peso cobrable y precio, y vuelve a sacar
 * el saldo de cada guía.
 *
 * Body: { trackings?: string[], lote?: string, correcciones?: MedidaCorregida[],
 *         motivo: string }
 */
export const aplicarRecosteoAereo = async (req: Request, res: Response) => {
  const quien = Number((req as any).user?.userId || (req as any).user?.id) || null;
  try {
    const body = (req.body || {}) as any;
    const motivo = String(body.motivo || '').trim();
    if (motivo.length < 5) {
      return res.status(400).json({ error: 'Escribe el motivo del recosteo (de dónde salió la medida).' });
    }

    let trackings: string[] = Array.isArray(body.trackings) ? body.trackings.map(String) : [];
    if (trackings.length === 0 && body.lote) trackings = await trackingsDelLote(String(body.lote));
    if (trackings.length === 0) {
      return res.status(400).json({ error: 'Dime qué guías recostear: manda trackings o un lote.' });
    }
    if (trackings.length > 500) {
      return res.status(400).json({ error: 'Son demasiadas guías de una vez (máximo 500).' });
    }

    const filas = await calcularRecosteo(pool, trackings, body.correcciones || []);
    const aplicables = filas.filter((f) => !f.bloqueo && Math.abs(f.difUsd) >= 0.01);
    if (aplicables.length === 0) {
      return res.json({
        success: true, aplicadas: 0, filas,
        mensaje: 'No había nada que cambiar: o ya están bien, o están bloqueadas.',
      });
    }

    const { actualizarSaldoGuia } = await import('./customerServiceController');
    const hechas: Array<{ tracking: string; usdAntes: number; usdDespues: number }> = [];
    const fallidas: Array<{ tracking: string; razon: string }> = [];

    for (const f of aplicables) {
      try {
        // El candado de pago va TAMBIÉN en el UPDATE: entre la vista previa y
        // este momento alguien pudo haber cobrado la guía.
        const upd = await pool.query(
          `UPDATE packages SET
             weight = $2,
             pkg_length = COALESCE($3, pkg_length),
             pkg_width = COALESCE($4, pkg_width),
             pkg_height = COALESCE($5, pkg_height),
             single_volume = $6,
             air_chargeable_weight = $7,
             air_price_per_kg = $8,
             air_sale_price = $9,
             air_price_assigned_at = NOW(),
             air_price_assigned_by = $10,
             updated_at = NOW()
           WHERE id = $1
             AND COALESCE(monto_pagado, 0) = 0
             AND COALESCE(client_paid, false) = false
             AND COALESCE(payment_status::text, '') <> 'paid'
           RETURNING id`,
          [
            f.id, f.nuevo.peso, f.nuevo.largo, f.nuevo.ancho, f.nuevo.alto,
            f.nuevo.volumetrico > 0 ? f.nuevo.volumetrico : null,
            f.nuevo.pesoCobrable, f.nuevo.porKg, f.nuevo.usd, quien,
          ],
        );
        if (!upd.rowCount) {
          fallidas.push({ tracking: f.tracking, razon: 'se cobró mientras se revisaba' });
          continue;
        }

        await actualizarSaldoGuia(f.tracking, 'package');

        // Bitácora: el antes y el después quedan escritos en la guía.
        await pool.query(
          `INSERT INTO package_history (package_id, status, notes, created_by, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            f.id, f.estado || 'recosteo',
            `Recosteo aéreo: ${f.actual.peso}kg real / ${f.actual.volumetrico}kg vol → cobrable `
            + `${f.nuevo.pesoCobrable}kg × $${f.nuevo.porKg}/kg = $${f.nuevo.usd} USD `
            + `(antes $${f.actual.usd}). ${motivo}`,
            quien,
          ],
        );

        hechas.push({ tracking: f.tracking, usdAntes: f.actual.usd, usdDespues: f.nuevo.usd });
      } catch (err: any) {
        console.error('[recosteo-aereo] ' + f.tracking + ':', err?.message);
        fallidas.push({ tracking: f.tracking, razon: err?.message || 'error al escribir' });
      }
    }

    const ordenes = Array.from(new Set(filas.flatMap((f) => f.ordenesAbiertas)));

    return res.json({
      success: true,
      aplicadas: hechas.length,
      fallidas,
      difUsd: redondea(hechas.reduce((a, h) => a + (h.usdDespues - h.usdAntes), 0)),
      hechas,
      ordenesAbiertas: ordenes,
      // Recostear NO recalcula una orden ya armada: la orden lee el precio de la
      // guía cuando se genera y se queda con él.
      aviso: ordenes.length > 0
        ? 'Hay orden de pago abierta con estas guías (' + ordenes.join(', ')
          + '). Cancélala y genérala otra vez para que tome el precio nuevo.'
        : null,
    });
  } catch (e: any) {
    console.error('[recosteo-aereo aplicar]', e?.message);
    return res.status(500).json({ error: 'No pude aplicar el recosteo.' });
  }
};
