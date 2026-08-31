/**
 * COSTEO DE UNA GUÍA DHL — fuente única
 *
 * Dos columnas de `dhl_shipments` se leían mal desde varios lugares, y cada
 * error costó un ticket:
 *
 *   · `import_cost_mxn` NO es el flete: es flete + impuesto. Así lo escribe
 *     crossDhlTaxNote al cruzar la nota real, y así están los 694 envíos con
 *     impuesto que hay en la base — no hay ni uno con el flete limpio. Quien le
 *     suma `import_tax_mxn` cobra el impuesto dos veces (TKT-2026-2399).
 *
 *   · `total_cost_mxn` es ambiguo: en 216 guías NO trae la paquetería nacional
 *     y en 160 sí, conviviendo en el mismo periodo. Es imposible saber leyendo
 *     esa columna si ya está incluida, así que no sirve para decidir un cobro
 *     (TKT-2026-2342, TKT-2026-2365).
 *
 * La fórmula canónica es la que escribe crossDhlTaxNote:
 *     importación = (USD × TC) + impuesto        → lo que guarda import_cost_mxn
 *     cobro       = importación + paquetería nacional
 *
 * Cada vez que esto se arregló en el punto donde se reportó, el siguiente lugar
 * que leyera las columnas volvía a equivocarse. Por eso vive aquí y no repetido
 * en cada consulta.
 */

export interface FilaDhl {
  import_cost_usd?: number | string | null;
  exchange_rate?: number | string | null;
  import_cost_mxn?: number | string | null;
  import_tax_mxn?: number | string | null;
  national_cost_mxn?: number | string | null;
}

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Importación de la guía: flete convertido + impuesto.
 *
 * Se prefiere `import_cost_mxn` porque es lo que quedó guardado tras el último
 * cruce de nota. Solo si viene vacío se reconstruye desde las partes, que es el
 * ÚNICO caso donde sumar el impuesto es correcto.
 */
export function importacionMxn(g: FilaDhl): number {
  const guardado = num(g.import_cost_mxn);
  if (guardado > 0) return guardado;
  const flete = num(g.import_cost_usd) * num(g.exchange_rate);
  if (flete > 0) return Math.round((flete + num(g.import_tax_mxn)) * 100) / 100;
  return 0;
}

/** Lo que se le cobra al cliente por la guía: importación + paquetería nacional. */
export function cobroDhlMxn(g: FilaDhl): number {
  return Math.round((importacionMxn(g) + num(g.national_cost_mxn)) * 100) / 100;
}

/**
 * Igual que `cobroDhlMxn` pero en SQL, para las consultas que lo calculan en la
 * base. `alias` es el alias de la tabla dhl_shipments en la consulta.
 */
export function cobroDhlSql(alias = 'ds'): string {
  return `ROUND(
    (CASE WHEN COALESCE(${alias}.import_cost_mxn, 0) > 0
          THEN ${alias}.import_cost_mxn::numeric
          ELSE COALESCE(${alias}.import_cost_usd, 0)::numeric * COALESCE(${alias}.exchange_rate, 0)::numeric
               + COALESCE(${alias}.import_tax_mxn, 0)::numeric END)
    + COALESCE(${alias}.national_cost_mxn, 0)::numeric, 2)`;
}
