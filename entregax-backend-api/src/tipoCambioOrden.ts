/**
 * El tipo de cambio de una orden de pago.
 *
 * Una cotizacion en aereo se arma en dolares y se cobra en pesos, pero el tipo
 * de cambio que hizo esa conversion no se guardaba en ningun lado: las 3,584
 * guias aereas de los ultimos 90 dias tienen `registered_exchange_rate` vacio,
 * y la orden no tenia columna. El PDF lo leia de `exchange_rate_config`, que es
 * el VIGENTE, no el de la cotizacion: el 19-nov las ordenes salieron a 18.93 y
 * al dia siguiente, con la configuracion en 19.23, el mismo folio reimpreso
 * decia 19.23 sobre el mismo total en pesos. El cliente tenia el documento con
 * un numero y el sistema le ensenaba otro (tarea 1086).
 *
 * Se sella al crear la orden, en `pobox_payments`, que es el renglon que
 * comparten la orden del asesor y la del cliente. Nunca bloquea un cobro: si
 * algo falla queda el aviso en el log y la orden sigue su camino, y el detalle
 * entonces deriva el TC del propio monto, como hacia antes.
 */

type Db = { query: (sql: string, params?: any[]) => Promise<any> };

/** De que renglon de `exchange_rate_config` cuelga cada servicio. */
const TC_POR_SERVICIO: Record<string, string> = {
  AIR_CHN_MX: 'tdi',
  TDI_EXPRESS: 'tdi',
  tdi_express: 'tdi',
  POBOX_USA: 'pobox_usa',
  SEA_CHN_MX: 'maritimo',
  AA_DHL: 'dhl_monterrey',
};

/** El tipo de cambio vigente del servicio, o 0 si no hay ninguno capturado. */
export async function tcVigenteDelServicio(db: Db, servicio: string | null | undefined): Promise<number> {
  const fila = TC_POR_SERVICIO[String(servicio || '')] || 'pobox_usa';
  try {
    const r = await db.query(
      `SELECT tipo_cambio_final FROM exchange_rate_config
        WHERE servicio = $1 AND estado = true LIMIT 1`,
      [fila],
    );
    return parseFloat(r.rows[0]?.tipo_cambio_final) || 0;
  } catch (e: any) {
    console.warn('[tc-orden] no pude leer el tipo de cambio de', fila, '-', e?.message);
    return 0;
  }
}

/**
 * El tipo de cambio que traen pactado las guias de la orden, cuando todas
 * traen el mismo. 0 si ninguna lo trae, o si no coinciden entre ellas.
 */
async function tcAcordadoDeLasGuias(db: Db, poboxPaymentId: number): Promise<number> {
  try {
    const r = await db.query(
      `SELECT COUNT(DISTINCT p.registered_exchange_rate) AS distintos,
              MIN(p.registered_exchange_rate)::numeric AS tc,
              COUNT(*) FILTER (WHERE COALESCE(p.registered_exchange_rate, 0) = 0) AS sin_tc
         FROM pobox_payments o
         JOIN packages p ON o.package_ids @> to_jsonb(ARRAY[p.id])
        WHERE o.id = $1`,
      [poboxPaymentId],
    );
    const f = r.rows[0] || {};
    if (Number(f.distintos) !== 1 || Number(f.sin_tc) > 0) return 0;
    return parseFloat(f.tc) || 0;
  } catch (e: any) {
    console.warn('[tc-orden] no pude leer el TC pactado de las guias:', e?.message);
    return 0;
  }
}

/**
 * Deja escrito en la orden el tipo de cambio con el que se cotizo.
 * No lanza: una orden sin TC sellado se sigue pudiendo pagar.
 */
export async function sellarTcDeLaOrden(
  db: Db,
  poboxPaymentId: number | null | undefined,
  servicio: string | null | undefined,
): Promise<number> {
  if (!poboxPaymentId) return 0;
  try {
    // 🤝 El tipo de cambio pactado con el cliente manda sobre el vigente.
    //
    // Hay guias que traen el suyo escrito (`registered_exchange_rate`): es el
    // que se le cotizo al cliente, normalmente junto con una tarifa acordada.
    // Sellar el vigente encima le cambiaba el numero al cliente aunque el
    // importe en pesos fuera el correcto: "el tipo de cambio sigue sin
    // reflejarse con el solicitado" (tarea 1070). Solo aplica cuando TODAS las
    // guias de la orden traen el MISMO: con dos distintos no hay un tipo de
    // cambio de la orden que decir, y entonces manda el vigente.
    const tc = (await tcAcordadoDeLasGuias(db, poboxPaymentId))
      || (await tcVigenteDelServicio(db, servicio));
    if (!(tc > 0)) return 0;
    await db.query(
      `UPDATE pobox_payments SET tipo_cambio_usd = $2 WHERE id = $1 AND tipo_cambio_usd IS NULL`,
      [poboxPaymentId, tc],
    );
    return tc;
  } catch (e: any) {
    console.warn('[tc-orden] no pude sellar el TC de la orden', poboxPaymentId, '-', e?.message);
    return 0;
  }
}
