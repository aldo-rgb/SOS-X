/**
 * Red de seguridad: órdenes DHL pagadas cuya guía nunca se marcó pagada.
 *
 * La comisión del asesor nace cuando la GUÍA se marca pagada, no cuando se paga
 * la orden. Si esa marca falla al momento del cobro, nada la reintenta: la guía
 * se queda pendiente y el asesor sin comisión hasta que algo la destrabe por
 * accidente —normalmente el pago de una caja hermana del mismo embarque—.
 *
 * Pasó con la orden UW-33634467 de Jesús Campos: se pagó el 4 de septiembre y la
 * comisión salió el 10, cuando Yliana cobró la tercera caja de la misma guía y el
 * marcado por grupo arrastró a las otras dos (tarea 529). Revisando las 186
 * órdenes DHL pagadas, a 9 les pasó lo mismo; la peor esperó 93 días.
 *
 * Esto lo cierra: una pasada diaria que busca el rezago y lo aplica con las
 * MISMAS funciones del flujo normal —`markDhlGroupPaid` y
 * `generateCommissionsForPackages`—, no con SQL a mano. Así el resultado es
 * idéntico al de un cobro bien hecho.
 */
import { pool } from './db';
import { markDhlGroupPaid, expandDhlGroupIds } from './dhlGroup';
import { generateCommissionForShipment } from './commissionService';

export type Rezagada = {
  orden: string;
  ordenId: number;
  pagadaEl: Date;
  horas: number;
  guias: number[];
  monto: number;
  clienteBox: string;
};

/**
 * Órdenes DHL con pago confirmado cuyas guías siguen sin `paid_at`.
 *
 * `horasDeGracia` evita pelearse con el cobro que acaba de ocurrir: el marcado
 * normal pasa en segundos, así que una hora es de sobra para no pisarle.
 */
export async function buscarPagosRezagados(horasDeGracia = 1): Promise<Rezagada[]> {
  const r = await pool.query(
    `SELECT p.id, p.payment_reference, p.paid_at, p.amount::numeric AS monto, u.box_id,
            ARRAY(SELECT jsonb_array_elements_text(p.package_ids)::int) AS guias
       FROM pobox_payments p
       JOIN users u ON u.id = p.user_id
      WHERE p.status IN ('paid','completed')
        AND p.paid_at IS NOT NULL
        AND p.paid_at < NOW() - ($1 || ' hours')::interval
        AND (p.payment_reference LIKE 'UW-%' OR p.service_type = 'AA_DHL')
        AND jsonb_array_length(p.package_ids) > 0
        AND EXISTS (
              SELECT 1 FROM dhl_shipments d
               WHERE d.id = ANY(ARRAY(SELECT jsonb_array_elements_text(p.package_ids)::int))
                 AND d.paid_at IS NULL)
      ORDER BY p.paid_at`,
    [String(horasDeGracia)]
  );
  return r.rows.map((x: any) => ({
    orden: x.payment_reference,
    ordenId: Number(x.id),
    pagadaEl: new Date(x.paid_at),
    horas: (Date.now() - new Date(x.paid_at).getTime()) / 3600000,
    guias: (x.guias || []).map(Number),
    monto: Number(x.monto),
    clienteBox: x.box_id,
  }));
}

/**
 * Marca las guías rezagadas y genera las comisiones que faltaron.
 * `soloReportar` deja ver qué haría sin tocar nada.
 */
export async function destrabarPagosRezagados(
  opts: { soloReportar?: boolean; horasDeGracia?: number } = {}
): Promise<{ revisadas: number; destrabadas: Rezagada[] }> {
  const rezagadas = await buscarPagosRezagados(opts.horasDeGracia ?? 1);
  if (rezagadas.length === 0) return { revisadas: 0, destrabadas: [] };

  const hechas: Rezagada[] = [];
  for (const r of rezagadas) {
    const dias = (r.horas / 24).toFixed(1);
    if (opts.soloReportar) {
      console.log(`[DHL-REZAGO] ${r.orden} (${r.clienteBox}): guía(s) ${r.guias.join(', ')} ` +
        `sin marcar desde hace ${dias} días — no se toca (solo reporte)`);
      hechas.push(r);
      continue;
    }
    try {
      // `onlyUnpaid` para no pisar un pago previo de una caja hermana.
      const tocadas = await markDhlGroupPaid(pool, r.guias, { onlyUnpaid: true });

      // La comisión se pide como DHL explícitamente, NO con
      // `generateCommissionsForPackages`: esa prueba primero 'PKG' y los ids
      // COLISIONAN entre tablas. La guía 653 de S105 es, con el mismo id, un
      // envío aéreo de otra clienta y de otro asesor; al probar PKG primero
      // daba por buena esa y se saltaba la DHL, así que la caja quedaba marcada
      // pagada y el asesor seguía sin su comisión. Aquí ya sabemos que son
      // guías DHL —salieron de una orden UW-/AA_DHL—, así que no hay nada que
      // adivinar.
      const delGrupo = await expandDhlGroupIds(pool, r.guias).catch(() => r.guias);
      for (const guiaId of delGrupo) {
        await generateCommissionForShipment('DHL', guiaId);
      }
      console.warn(
        `[DHL-REZAGO] ${r.orden} (${r.clienteBox}): la orden se pagó hace ${dias} días y la guía ` +
        `seguía pendiente. Marcadas ${tocadas.length} caja(s) y generadas sus comisiones.`);
      hechas.push(r);
    } catch (e: any) {
      console.error(`[DHL-REZAGO] no pude destrabar ${r.orden}:`, e?.message);
    }
  }
  return { revisadas: rezagadas.length, destrabadas: hechas };
}

// ============================================================
// Segunda red: guías YA marcadas pagadas a las que nunca les salió comisión.
//
// La de arriba cubre el caso de la guía que se quedó sin marcar. Este es el
// otro: la guía sí quedó pagada, pero la comisión nunca nació. Pasa porque
// todas las rutas piden la generación sin esperarla y sin reintento
// —`generateCommissionsForPackages(ids).catch(...)`—, así que un fallo se
// registra en consola y la comisión se pierde para siempre.
//
// Al medirlo: de 924 guías DHL pagadas, 53 se quedaron sin comisión, de ocho
// asesores distintos y por $21,755.96 (tarea 684, lo reportó Angel Quiroz por
// cuatro guías de S85 que pagó el 18 de septiembre).
//
// La fecha de corte NO es un detalle: sin ella este barrido generaría esas 53
// solo, y eso es dinero de ocho personas que decide Aldo, no un cron. Las de
// antes se quedan como estaban hasta que él diga.
const COMISIONES_VIGILADAS_DESDE = '2026-09-26';

export type GuiaSinComision = {
  guiaId: number;
  guia: string;
  clienteBox: string;
  asesor: string;
  monto: number;
  pagadaEl: Date;
  horas: number;
};

/**
 * Guías DHL pagadas, sin saldo y con asesor, a las que les falta la comisión.
 *
 * `horasDeGracia` evita pelearse con el cobro que acaba de pasar: la generación
 * normal ocurre en segundos, pero es asíncrona, así que se le dan dos horas
 * antes de considerarla perdida.
 */
export async function buscarGuiasSinComision(horasDeGracia = 2): Promise<GuiaSinComision[]> {
  const r = await pool.query(
    `SELECT ds.id, ds.secondary_tracking, ds.inbound_tracking, ds.monto_pagado::numeric AS monto,
            ds.paid_at, u.box_id, COALESCE(a.full_name, '') AS asesor
       FROM dhl_shipments ds
       JOIN users u ON u.id = ds.user_id
       LEFT JOIN users a ON a.id = COALESCE(u.advisor_id, u.referred_by_id)
      WHERE ds.paid_at IS NOT NULL
        AND ds.paid_at >= $1::date
        AND ds.paid_at < NOW() - ($2 || ' hours')::interval
        AND COALESCE(ds.saldo_pendiente, 0) <= 0.01
        AND COALESCE(ds.monto_pagado, 0) > 0
        AND u.role = 'client'
        AND COALESCE(u.advisor_id, u.referred_by_id) IS NOT NULL
        AND NOT EXISTS (
              SELECT 1 FROM advisor_commissions ac
               WHERE ac.shipment_type = 'DHL' AND ac.shipment_id = ds.id)
      ORDER BY ds.paid_at
      LIMIT 200`,
    [COMISIONES_VIGILADAS_DESDE, String(horasDeGracia)]
  );
  return r.rows.map((x: any) => ({
    guiaId: Number(x.id),
    guia: x.secondary_tracking || x.inbound_tracking || String(x.id),
    clienteBox: x.box_id,
    asesor: x.asesor,
    monto: Number(x.monto),
    pagadaEl: new Date(x.paid_at),
    horas: (Date.now() - new Date(x.paid_at).getTime()) / 3600000,
  }));
}

/**
 * Genera las comisiones que faltaron. `soloReportar` deja ver qué haría.
 *
 * Se pide como DHL explícitamente, igual que arriba y por lo mismo: los ids
 * colisionan entre tablas y probar 'PKG' primero se queda con la guía
 * equivocada.
 */
export async function destrabarComisionesFaltantes(
  opts: { soloReportar?: boolean; horasDeGracia?: number } = {}
): Promise<{ revisadas: number; generadas: GuiaSinComision[] }> {
  const faltantes = await buscarGuiasSinComision(opts.horasDeGracia ?? 2);
  if (faltantes.length === 0) return { revisadas: 0, generadas: [] };

  const hechas: GuiaSinComision[] = [];
  for (const f of faltantes) {
    const dias = (f.horas / 24).toFixed(1);
    if (opts.soloReportar) {
      console.log(`[DHL-COMISION] guía ${f.guia} (${f.clienteBox}, ${f.asesor}): pagada hace ${dias} días ` +
        `y sin comisión — no se toca (solo reporte)`);
      hechas.push(f);
      continue;
    }
    try {
      const ok = await generateCommissionForShipment('DHL', f.guiaId);
      if (ok) {
        console.warn(`[DHL-COMISION] guía ${f.guia} (${f.clienteBox}): pagada hace ${dias} días sin comisión. ` +
          `Generada para ${f.asesor || 'su asesor'} sobre $${f.monto.toFixed(2)}.`);
        hechas.push(f);
      }
    } catch (e: any) {
      console.error(`[DHL-COMISION] no pude generar la comisión de la guía ${f.guia}:`, e?.message);
    }
  }
  return { revisadas: faltantes.length, generadas: hechas };
}
