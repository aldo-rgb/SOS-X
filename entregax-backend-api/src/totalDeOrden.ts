/**
 * Cuanto cobra una orden de pago, calculado en el servidor.
 *
 * El total llegaba armado por el navegador: por cada guia sumaba su importe
 * mas sus cargos extra. Pero el importe que el panel enseña ya ES el saldo de
 * la guia, y el saldo ya trae dentro esos cargos —la formula es base + cargos
 * − descuentos—, asi que todo ajuste se cobraba DOS VECES. Medido el
 * 20-nov-2026: una orden de diez guias con diez ajustes cobraba $86,841.51
 * cuando le tocaban $78,874.73, exactamente los $7,966.80 de sus ajustes
 * repetidos; y los descuentos tambien se contaban doble, restando de mas
 * (tarea 1096).
 *
 * El otro lado del mismo problema: borrar o corregir un cargo no cambiaba la
 * orden ya creada, porque el monto se congelo al crearla. Por eso esto vive
 * aparte: lo usan la creacion de la orden y el alta/baja de ajustes.
 *
 * La cuenta canonica, por guia:
 *
 *     base (sin ajustes) + ajustes activos + flete nacional + GEX
 *
 * `base` es la MISMA cadena que usa actualizarSaldoGuia para el saldo, para
 * que la orden y la guia no digan cosas distintas. El flete nacional solo se
 * suma donde se cobra aparte: en aereo, TDI y DHL ya va dentro del flete.
 */

type Db = { query: (sql: string, params?: any[]) => Promise<any> };

export interface TotalDeOrden {
  total: number;
  base: number;
  ajustes: number;
  flete: number;
  gex: number;
  guias: number;
}

/** Servicios donde la entrega nacional ya va dentro del precio del flete. */
const FLETE_INCLUYE_ENTREGA = ['AIR_CHN_MX', 'TDI_EXPRESS', 'AA_DHL'];

/**
 * @returns null cuando la orden trae guias que no viven en `packages`
 *          (maritimas y DHL viajan con ids desplazados y se cobran con otra
 *          cuenta): ahi no hay un total canonico que ofrecer.
 */
export async function totalCanonicoDeOrden(
  db: Db,
  packageIds: number[],
  paymentReference: string | null,
  tcDeLaOrden: number,
): Promise<TotalDeOrden | null> {
  const ids = (packageIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return null;
  // Ids fuera de `packages` (maritimo +100000, DHL +300000) o guias que ya no
  // existen: la cuenta de abajo no les aplica.
  const existen = await db.query(`SELECT COUNT(*)::int AS n FROM packages WHERE id = ANY($1::int[])`, [ids]);
  if (Number(existen.rows[0]?.n) !== ids.length) return null;

  const tc = Number(tcDeLaOrden) > 0 ? Number(tcDeLaOrden) : 0;
  const r = await db.query(
    `WITH g AS (
       SELECT p.id, p.tracking_internal, p.service_type::text AS svc,
         COALESCE(
           NULLIF(p.assigned_cost_mxn, 0),
           NULLIF(p.pobox_service_cost, 0),
           NULLIF(p.air_sale_price, 0) * COALESCE(NULLIF(p.registered_exchange_rate, 0), NULLIF($2::numeric, 0), 1),
           NULLIF(p.pobox_venta_usd, 0) * COALESCE(NULLIF(p.registered_exchange_rate, 0), NULLIF($2::numeric, 0), 1),
           0)::numeric AS base,
         COALESCE(p.national_shipping_cost, 0)::numeric AS flete,
         COALESCE(p.gex_total_cost, 0)::numeric AS gex
       FROM packages p WHERE p.id = ANY($1::int[])
     )
     SELECT
       (SELECT COALESCE(SUM(base),0) FROM g) AS base,
       (SELECT COALESCE(SUM(CASE WHEN svc = ANY($3::text[]) THEN 0 ELSE flete END),0) FROM g) AS flete,
       (SELECT COALESCE(SUM(CASE WHEN svc = 'AA_DHL' THEN 0 ELSE gex END),0) FROM g) AS gex,
       (SELECT COUNT(*) FROM g) AS guias`,
    [ids, tc, FLETE_INCLUYE_ENTREGA],
  ).catch(() => null);
  if (!r) return null;

  const trk = await db.query(
    `SELECT COALESCE(SUM(
              CASE WHEN aj.tipo = 'descuento' THEN -1 ELSE 1 END
              * aj.monto
              * CASE WHEN UPPER(COALESCE(aj.moneda,'MXN')) = 'USD' AND $3::numeric > 0
                     THEN $3::numeric ELSE 1 END), 0)::numeric AS ajustes
       FROM guias_ajustes_financieros aj
      WHERE aj.activo = TRUE
        AND (aj.payment_reference IS NULL OR aj.payment_reference = $2)
        AND aj.guia_tracking IN (
          SELECT p.tracking_internal FROM packages p
           WHERE p.id = ANY($1::int[]) OR p.master_id = ANY($1::int[]))`,
    [ids, paymentReference, tc],
  );

  const f = r.rows[0] || {};
  const base = Number(f.base) || 0;
  const flete = Number(f.flete) || 0;
  const gex = Number(f.gex) || 0;
  const ajustes = Number(trk.rows[0]?.ajustes) || 0;
  const redondear = (n: number) => Math.round(n * 100) / 100;
  return {
    base: redondear(base), ajustes: redondear(ajustes), flete: redondear(flete), gex: redondear(gex),
    guias: Number(f.guias) || 0,
    total: redondear(base + ajustes + flete + gex),
  };
}

/** Estados en los que una orden todavia se puede corregir: nadie la ha pagado. */
const ORDENES_ABIERTAS = ['pending', 'pending_payment', 'vouchers_submitted', 'vouchers_partial'];

/**
 * Mueve lo que cobran las ordenes ABIERTAS donde vive esta guia, por la
 * diferencia de un ajuste que se acaba de dar de alta o de baja.
 *
 * El monto se congelaba al crear la orden, asi que borrar o corregir un cargo
 * extra no cambiaba nada: "si se eliminan los cargos extras o modifican se
 * seguiran cobrando" (tarea 1096).
 *
 * Se suma la DIFERENCIA en vez de rehacer el total: una orden abierta puede
 * traer un total pactado a mano, y recalcularla entera se lo borraria. Medido
 * el 21-nov-2026: de 17 ordenes abiertas cuyo total no coincide con la cuenta
 * canonica, 15 difieren por otras razones que no hay que tocar.
 *
 * Las pagadas y las canceladas no se mueven: un cargo sobre una guia ya pagada
 * se cobra por su propia orden CEX.
 *
 * @param deltaMxn Positivo si la orden debe cobrar mas, negativo si menos.
 */
export async function aplicarDeltaDeAjusteEnOrdenesAbiertas(
  db: Db,
  tracking: string,
  deltaMxn: number,
): Promise<Array<{ referencia: string; antes: number; despues: number }>> {
  const cambios: Array<{ referencia: string; antes: number; despues: number }> = [];
  const delta = Math.round((Number(deltaMxn) || 0) * 100) / 100;
  if (!(Math.abs(delta) > 0.009) || !tracking) return cambios;
  try {
    const ordenes = await db.query(
      `SELECT o.id, o.payment_reference, o.amount::numeric AS amount
         FROM pobox_payments o
        WHERE o.status::text = ANY($2::text[])
          AND EXISTS (
            SELECT 1 FROM packages p
             WHERE p.tracking_internal = $1
               AND o.package_ids @> to_jsonb(ARRAY[COALESCE(p.master_id, p.id)]))`,
      [tracking, ORDENES_ABIERTAS],
    );
    for (const o of ordenes.rows) {
      const antes = Number(o.amount) || 0;
      const despues = Math.max(0, Math.round((antes + delta) * 100) / 100);
      await db.query(`UPDATE pobox_payments SET amount = $2 WHERE id = $1`, [o.id, despues]);
      // El panel del asesor y el tablero de Cobranza leen su propia copia del
      // monto; si no se mueve, la orden dice una cosa y el tablero otra.
      await db.query(
        `UPDATE advisor_payment_orders SET total_mxn = $2, updated_at = NOW()
          WHERE (pobox_payment_id = $1 OR payment_reference = $3)
            AND status NOT IN ('cancelado', 'pagado')`,
        [o.id, despues, o.payment_reference],
      ).catch(() => undefined);
      await db.query(
        `UPDATE openpay_webhook_logs SET monto_recibido = $2, monto_neto = $2
          WHERE transaction_id = $1 AND estatus_procesamiento = 'pending_payment'`,
        [o.payment_reference, despues],
      ).catch(() => undefined);
      console.log('[orden] ' + o.payment_reference + ': ' + antes.toFixed(2) + ' -> '
        + despues.toFixed(2) + ' por un ajuste de ' + tracking);
      cambios.push({ referencia: String(o.payment_reference), antes, despues });
    }
  } catch (e: any) {
    console.warn('[orden] no pude mover las ordenes abiertas de', tracking, '-', e?.message);
  }
  return cambios;
}

/**
 * La entrega local de una orden: "$99 por caja, gratis desde 3".
 *
 * El precio lo trae el catalogo (`price_per_package` y `free_from_qty`), pero
 * el umbral se evaluaba al asignar las instrucciones, y ahi todavia no existe
 * la cotizacion. Cada camino contaba algo distinto: el panel del asesor
 * contaba las cajas PENDIENTES del cliente —asi que a un cliente con
 * inventario guardado nunca se le cobraba, aunque la entrega llevara una sola
 * caja— y la app contaba las cajas de esa guia, que en PO Box siempre es una,
 * asi que siempre cobraba. Medido el 21-nov-2026 sobre 30 dias: de 266 guias
 * con entrega local, 23 salieron gratis debiendo cobrar y 14 cobraron
 * debiendo salir gratis (tarea 1073, TKT-2026-3734).
 *
 * El umbral es de la ENTREGA, y la entrega es la cotizacion: tres cajas en la
 * misma nota viajan juntas. Asi que se decide aqui, con las cajas que trae la
 * orden, y da igual quien haya asignado las instrucciones.
 *
 * Las "por cobrar" no entran: esas las paga el cliente al transportista.
 */
export interface FleteLocal {
  total: number;
  porGuia: Map<number, number>;
}

export async function fleteLocalDeLaOrden(db: Db, packageIds: number[]): Promise<FleteLocal> {
  const vacio: FleteLocal = { total: 0, porGuia: new Map() };
  const ids = (packageIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return vacio;
  try {
    const r = await db.query(
      `SELECT p.id,
              LOWER(COALESCE(NULLIF(p.national_carrier, ''), '')) AS carrier,
              -- REPACK es UNA caja fisica: total_boxes ahi cuenta las guias
              -- consolidadas, no las cajas.
              CASE WHEN UPPER(COALESCE(p.tracking_internal, '')) LIKE 'US-REPACK-%'
                   THEN 1 ELSE GREATEST(COALESCE(p.total_boxes, 1), 1) END AS cajas,
              c.price_per_package::numeric AS por_caja,
              c.free_from_qty::int AS gratis_desde
         FROM packages p
         LEFT JOIN carrier_service_options c
           ON REPLACE(REPLACE(LOWER(c.carrier_key), '_', ''), ' ', '')
            = REPLACE(REPLACE(LOWER(COALESCE(p.national_carrier, '')), '_', ''), ' ', '')
          AND c.is_active = TRUE
          AND COALESCE(c.allows_collect, false) = false
          AND c.price_per_package IS NOT NULL
        WHERE p.id = ANY($1::int[])
          AND COALESCE(p.is_collect, false) = false`,
      [ids],
    );

    // Las cajas se cuentan POR PAQUETERIA: una orden puede mezclarlas.
    const cajasPorCarrier = new Map<string, number>();
    for (const f of r.rows) {
      if (!(Number(f.por_caja) >= 0) || !f.carrier) continue;
      cajasPorCarrier.set(f.carrier, (cajasPorCarrier.get(f.carrier) || 0) + (Number(f.cajas) || 1));
    }

    const porGuia = new Map<number, number>();
    let total = 0;
    for (const f of r.rows) {
      const porCaja = Number(f.por_caja);
      if (!(porCaja >= 0) || !f.carrier) continue;
      const gratisDesde = Number(f.gratis_desde) || 0;
      const cajasDeLaOrden = cajasPorCarrier.get(f.carrier) || 0;
      const gratis = gratisDesde > 0 && cajasDeLaOrden >= gratisDesde;
      const importe = gratis ? 0 : Math.round(porCaja * (Number(f.cajas) || 1) * 100) / 100;
      porGuia.set(Number(f.id), importe);
      total += importe;
    }
    return { total: Math.round(total * 100) / 100, porGuia };
  } catch (e: any) {
    console.warn('[flete local] no pude calcular la entrega local de la orden:', e?.message);
    return vacio;
  }
}

/**
 * Deja escrito en cada guia lo que le toca de entrega local segun ESTA orden.
 * Se llama al crearla, para que la guia y la nota digan lo mismo.
 */
export async function sellarFleteLocalDeLaOrden(db: Db, packageIds: number[]): Promise<FleteLocal> {
  const flete = await fleteLocalDeLaOrden(db, packageIds);
  for (const [id, importe] of flete.porGuia) {
    try {
      await db.query(
        `UPDATE packages SET national_shipping_cost = $2, updated_at = NOW()
          WHERE id = $1 AND COALESCE(national_shipping_cost, 0) <> $2
            AND COALESCE(client_paid, false) = false
            AND COALESCE(payment_status::text, '') <> 'paid'`,
        [id, importe],
      );
    } catch (e: any) {
      console.warn('[flete local] no pude escribir la entrega local de la guia', id, '-', e?.message);
    }
  }
  return flete;
}
