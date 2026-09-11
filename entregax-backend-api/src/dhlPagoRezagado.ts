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
