/**
 * De qué se compone el importe de una guía en una cotización.
 *
 * La cotización enseñaba el total en pesos de cada guía y nada más. Para saber
 * de dónde salía —cuántos dólares, a qué precio por kilo, sobre qué peso y con
 * qué tipo de cambio— había que entrar a la guía una por una, y en el PDF que
 * recibe el cliente simplemente no estaba (tarea 1086).
 *
 * Vive aparte porque lo usan dos caminos distintos con los mismos numeros: el
 * detalle de la orden del asesor y el historial del cliente. Si la cuenta se
 * escribiera dos veces, los dos documentos del mismo cobro acabarian diciendo
 * cosas distintas.
 */

/** Divisor del peso volumétrico en el aéreo China→MX. */
const DIVISOR_VOLUMETRICO_AEREO = 6000;

const num = (v: any): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export interface DesgloseDeGuia {
  peso_real: number;
  peso_volumetrico: number;
  peso_cobrable: number;
  costo_usd: number;
  precio_por_kg_usd: number;
  /**
   * El peso sobre el que de verdad se cobró, cuando NO es el cobrable.
   * 0 cuando coinciden, que es lo que debe pasar de ahora en adelante.
   */
  peso_cobrado: number;
  tipo_tarifa: string | null;
  tc: number;
}

/**
 * @param g   Fila de `packages`. Acepta las tres formas en que las medidas
 *            viven en el esquema: `pkg_*` (extracción), `long_cm/width_cm/
 *            height_cm` (API de China) y `length_cm/...` (ya aliasado).
 * @param tc  Tipo de cambio de la orden. 0 si todavía no se conoce; entonces la
 *            columna sale en blanco, que es mejor que un número inventado.
 *
 * Deliberadamente NO se deriva el tipo de cambio del importe de la propia guía:
 * ese importe ya trae dentro los cargos y descuentos por guía, así que pesos
 * entre dólares no da un tipo de cambio. En el lote de la tarea 1081 esa cuenta
 * daba 23.21 y 29.34 sobre una cotización hecha a 18.40.
 */
export function desgloseDeGuia(g: any, tc: number, mxnCobrado = 0): DesgloseDeGuia {
  const peso = num(g?.weight);
  const largo = num(g?.pkg_length) || num(g?.long_cm) || num(g?.length_cm);
  const ancho = num(g?.pkg_width) || num(g?.width_cm);
  const alto = num(g?.pkg_height) || num(g?.height_cm);
  const esAereo = /AIR|TDI/i.test(String(g?.service_type || ''));

  // El volumétrico sólo manda en aéreo. En PO Box se cobra por nivel y por
  // caja, no por kilo, así que ahí no hay volumétrico que enseñar.
  const volGuardado = num(g?.single_volume);
  const volumetrico = !esAereo
    ? 0
    : (volGuardado > 0 ? volGuardado : (largo * ancho * alto) / DIVISOR_VOLUMETRICO_AEREO);

  const cobrable = num(g?.air_chargeable_weight) || (volumetrico > peso ? volumetrico : peso);

  // Los dólares del renglón son los que SE ESTÁN COBRANDO, no los que se
  // guardaron al capturar.
  //
  // Sobre la guía viven también los cargos y descuentos que registra Servicio a
  // Cliente —el más común, "Corrección de pesos y medidas", en dólares—, y el
  // total del renglón ya los trae. La columna de dólares no: enseñaba
  // `air_sale_price` pelón, así que una guía cobrada en $9,242.32 decía
  // $334.08 USD, y ni multiplicando por el tipo de cambio daba el total. Juan
  // lo leyó como un error y tenía razón (1086).
  //
  // Con el total en pesos y el tipo de cambio de la orden, los dólares salen de
  // la división: es la misma cuenta que hace el cliente al revisar su
  // cotización, y así el renglón siempre cuadra con lo que cobra.
  const usdGuardado = num(g?.air_sale_price) || num(g?.pobox_venta_usd);
  const usd = tc > 0 && mxnCobrado > 0 ? +(mxnCobrado / tc).toFixed(2) : usdGuardado;

  // El precio por kilo que se imprime es LA TARIFA, no una división.
  //
  // Primero se imprimía el derivado —dólares entre peso cobrable— para que el
  // renglón multiplicara exacto. Juan lo leyó como un error y tenía razón: en
  // esa columna la casa lee la tarifa, y una guía con tarifa de $17.40 salía
  // diciendo $12.71 porque se cobró sobre el peso real y no sobre el cobrable
  // (1086).
  //
  // Con la tarifa impresa, una guía vieja no multiplica: $17.40 × 27.11 kg no
  // da los $344.52 que se le cobraron. Eso NO se esconde: se dice en la letra
  // chica, con el peso sobre el que de verdad se cobró. Hacia adelante el aéreo
  // ya cobra por el cobrable, así que esa aclaración desaparece sola.
  const porKgTarifa = num(g?.air_price_per_kg);
  const porKg = porKgTarifa > 0
    ? porKgTarifa
    : (cobrable > 0 && usd > 0 ? usd / cobrable : 0);
  // ¿Sobre qué peso salió el cobro? Si la tarifa por kilo no explica el precio
  // con el peso cobrable, el peso que sí lo explica es este.
  const cuadraConCobrable = porKgTarifa <= 0 || Math.abs(porKgTarifa * cobrable - usd) < 0.5;
  const kgQueExplicaElCobro = porKgTarifa > 0 && usd > 0 ? usd / porKgTarifa : 0;
  // La aclaración es para UN caso: la guía se cobró sobre el peso real teniendo
  // volumétrico mayor. Si el renglón no cuadra por otra razón —un cargo o un
  // descuento sobre la guía— el peso no tiene nada que ver y decir "cobrado
  // sobre 23.4 kg" sería inventar; eso se explica en los renglones de la orden.
  const seCobroSobreElReal = kgQueExplicaElCobro > 0
    && Math.abs(kgQueExplicaElCobro - peso) < 0.15;
  const pesoCobrado = !cuadraConCobrable && seCobroSobreElReal
    ? +kgQueExplicaElCobro.toFixed(2)
    : 0;

  return {
    peso_real: peso,
    peso_volumetrico: +volumetrico.toFixed(2),
    peso_cobrable: +cobrable.toFixed(2),
    costo_usd: +usd.toFixed(2),
    precio_por_kg_usd: esAereo ? +porKg.toFixed(2) : 0,
    // Start Up es precio plano: no hay tarifa por kilo que cuadrar, así que
    // tampoco hay nada que aclarar.
    peso_cobrado: String(g?.air_tariff_type || '') === 'SU' ? 0 : pesoCobrado,
    tipo_tarifa: g?.air_tariff_type || null,
    tc: tc > 0 ? +tc.toFixed(4) : 0,
  };
}

/** Las columnas de `packages` que el desglose necesita, para los SELECT. */
export const COLUMNAS_DEL_DESGLOSE = `
  air_sale_price, air_price_per_kg, air_chargeable_weight, air_tariff_type,
  single_volume, pobox_venta_usd, registered_exchange_rate,
  service_type::text AS service_type`;
