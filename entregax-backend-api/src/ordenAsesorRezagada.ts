/**
 * Red de seguridad: órdenes de asesor que se quedaron en "pendiente" aunque el
 * cliente ya pagó.
 *
 * `advisor_payment_orders.status` NO es un estado propio: es el espejo del
 * cobro. El mapa `fromPobox` del controlador lo dice —completed y paid se
 * traducen a 'pagado'— y el listado del panel lo deriva en vivo. Pero la
 * columna guardada solo la escriben ALGUNAS de las rutas de cobro.
 *
 * Medido el 29-sep-2026 sobre las órdenes con el cobro ya confirmado:
 *
 *   crédito    137 de 139 se quedaron en "pendiente"
 *   PayPal      15 de  16
 *   monedero     4 de   4
 *   efectivo   129 de 347  (las de comprobante; las demás sí sincronizan)
 *   transferencia 0 de   9
 *
 * O sea: aprobar un comprobante, pagar con crédito, con monedero o por PayPal
 * marca el cobro como pagado y deja la orden del asesor atrás. Y como en esas
 * mismas rutas tampoco se llama a `generateCommissionsForPackages`, el asesor
 * se queda sin comisión. Eso es lo que reportó Oscar Aldana en el
 * TKT-2026-2926: su guía US-6453175594 se pagó con comprobante el 24-sep, la
 * orden seguía en "pendiente" y la comisión nunca nació.
 *
 * Se arregla aquí y no en cada ruta a propósito: son cuatro o más caminos y
 * cada vez que se agrega uno nuevo se vuelve a olvidar. Este barrido los cubre
 * a todos, incluidos los que no existen todavía, y usa las MISMAS funciones del
 * flujo normal para que el resultado sea idéntico al de un cobro bien hecho.
 */
import { pool } from './db';
import { generateCommissionsForPackages } from './commissionService';

/**
 * Desde cuándo actúa el barrido.
 *
 * Hacia atrás hay 285 órdenes desincronizadas por $1.76M. NO se tocan solas:
 * marcarlas dispara comisiones y eso es dinero que alguien tiene que decidir
 * pagar, no una corrección técnica. Se levantan a mano cuando dirección lo
 * autorice; el barrido solo se hace cargo de que no vuelva a pasar.
 */
export const ORDENES_VIGILADAS_DESDE = '2026-09-29';

export type OrdenRezagada = {
  ordenId: number;
  folio: string;
  referencia: string;
  asesorId: number | null;
  clienteId: number | null;
  clienteBox: string;
  monto: number;
  paquetes: number[];
  horas: number;
};

/**
 * Órdenes cuyo cobro está confirmado pero que siguen sin marcarse pagadas.
 *
 * `horasDeGracia` evita pelearse con el cobro que acaba de pasar: la ruta que
 * sí sincroniza lo hace en el mismo segundo, así que una hora es de sobra.
 */
export async function buscarOrdenesRezagadas(horasDeGracia = 1): Promise<OrdenRezagada[]> {
  const r = await pool.query(
    `SELECT apo.id, apo.folio, COALESCE(apo.payment_reference, pp.payment_reference) AS referencia,
            apo.advisor_id, apo.client_id, COALESCE(apo.client_box_id, '') AS client_box_id,
            apo.total_mxn, pp.package_ids, pp.user_id AS cliente_pp,
            EXTRACT(EPOCH FROM (NOW() - pp.paid_at)) / 3600 AS horas
       FROM advisor_payment_orders apo
       JOIN pobox_payments pp ON pp.id = apo.pobox_payment_id
      WHERE pp.status IN ('completed', 'paid')
        AND apo.status NOT IN ('pagado', 'cancelado')
        AND pp.paid_at IS NOT NULL
        AND pp.paid_at < NOW() - ($1 || ' hours')::interval
        AND pp.paid_at >= $2::date
      ORDER BY pp.paid_at`,
    [String(horasDeGracia), ORDENES_VIGILADAS_DESDE]
  );

  return r.rows.map((f: any) => {
    const crudo = typeof f.package_ids === 'string' ? JSON.parse(f.package_ids) : (f.package_ids || []);
    const paquetes: number[] = (crudo as any[])
      .map((n: any) => Number(String(n).replace(/^[A-Za-z]+-/, '')))
      .filter((n: number) => Number.isFinite(n));
    return {
      ordenId: Number(f.id),
      folio: String(f.folio || ''),
      referencia: String(f.referencia || ''),
      asesorId: f.advisor_id != null ? Number(f.advisor_id) : null,
      // Nunca 0: Number(null) daría 0 y eso NO es "sin cliente", es un cliente
      // que no existe — el candado quedaría puesto pero apuntando a nadie y la
      // comisión no se generaría en silencio. Mejor null y el aviso explícito.
      clienteId: Number(f.client_id ?? f.cliente_pp) || null,
      clienteBox: String(f.client_box_id || ''),
      monto: Number(f.total_mxn) || 0,
      paquetes,
      horas: Number(f.horas) || 0,
    };
  });
}

/** Pone al día las órdenes rezagadas y genera las comisiones que faltaron. */
export async function destrabarOrdenesDeAsesor(): Promise<{ ordenes: number; comisiones: number }> {
  let ordenes = 0;
  let comisiones = 0;
  try {
    const pendientes = await buscarOrdenesRezagadas();
    if (pendientes.length === 0) return { ordenes: 0, comisiones: 0 };

    console.log(`🔁 [OrdenAsesorRezagada] ${pendientes.length} orden(es) con el cobro confirmado y sin marcar.`);
    for (const o of pendientes) {
      try {
        // El espejo del cobro. Se excluye 'cancelado' por si alguien la canceló
        // entre la consulta y este momento.
        const upd = await pool.query(
          `UPDATE advisor_payment_orders SET status = 'pagado', updated_at = NOW()
            WHERE id = $1 AND status NOT IN ('pagado', 'cancelado')`, [o.ordenId]);
        if (upd.rowCount) {
          ordenes++;
          console.log(`   ✅ ${o.folio} (${o.referencia}) $${o.monto.toFixed(2)} · ${o.clienteBox} · llevaba ${o.horas.toFixed(1)}h`);
        }

        // La comisión se genera por la vía normal. `expectedUserId` es el
        // candado contra la colisión de ids entre packages y dhl_shipments:
        // sin él, un id que existe en las dos tablas resuelve al primero que
        // conteste y la comisión se le acredita al asesor equivocado.
        //
        // No es teoría. De las 6 órdenes que este barrido tomó en su primera
        // corrida, 23 de sus 24 ids existían en las DOS tablas, y en los 23 la
        // fila de `packages` era de OTRO cliente. Sin el candado, cada una de
        // esas comisiones se habría ido al asesor equivocado.
        //
        // Por eso, si no se sabe de quién es la orden, NO se genera: el candado
        // se apaga con null y prefiero una comisión tarde que una mal pagada.
        if (o.clienteId == null) {
          console.warn(`   ⚠️ ${o.folio}: sin cliente identificable, no genero comisiones.`);
        } else if (o.paquetes.length > 0) {
          const antes = await contarComisiones(o.paquetes);
          await generateCommissionsForPackages(o.paquetes, { expectedUserId: o.clienteId });
          const despues = await contarComisiones(o.paquetes);
          const nuevas = despues - antes;
          if (nuevas > 0) {
            comisiones += nuevas;
            console.log(`      💰 ${nuevas} comisión(es) generada(s)`);
          }
        }
      } catch (e: any) {
        console.warn(`   ⚠️ ${o.folio}: ${e?.message}`);
      }
    }
  } catch (e: any) {
    console.error('[OrdenAsesorRezagada] falló la pasada:', e?.message);
  }
  return { ordenes, comisiones };
}

async function contarComisiones(paquetes: number[]): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM advisor_commissions
      WHERE shipment_type = 'PKG' AND shipment_id = ANY($1::int[])`, [paquetes]);
  return Number(r.rows[0]?.n) || 0;
}
