/**
 * Detectar que una dirección es "Ocurre" (el cliente recoge en sucursal) aunque
 * nadie haya encendido el interruptor.
 *
 * Por qué existe: la gente escribe la petición en el campo de referencias
 * —"OCURRE PAQUETEXPRESS", "Sucursal ocurre", "Servicio: Ocurre Paquetexpress /
 * Sucursal: LMM01"— y el interruptor `addresses.is_ocurre` se queda apagado.
 * La guía sale entonces como entrega a domicilio y la paquetería la manda a la
 * sucursal que cubra el código postal, que no tiene por qué ser la que el
 * cliente pidió. Así reclamó José Pablo Laurean (S2638) en el TKT-2026-2777:
 * su texto decía LMM01 y la guía terminó en LMM03.
 *
 * La señal es **la palabra "ocurre" escrita en la dirección**, y nada más. Lo
 * decidió Aldo: "sucursal" a secas no basta, porque se usa para mil cosas
 * ("Sucursal 03", "Paquetexpress sucursal Leon2") y no dice que el cliente vaya
 * a recoger. Mandar un paquete a sucursal por una coincidencia de palabras
 * sería peor que no detectarlo.
 *
 * Al medirlo había 11 direcciones con el interruptor apagado y el texto
 * pidiéndolo; con esta regla se encienden 9, entre ellas la del reclamo. Ni una
 * sola usaba "ocurre" como el verbo común, pero igual se descartan esas frases.
 */

const SIN_ACENTOS = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Frases donde "ocurre" es el verbo, no el servicio. */
const ES_EL_VERBO = /\b(si|cuando|lo que|algo|que)\s+ocurre\b|\bocurre\s+(algo|un|una|que)\b/;

/**
 * ¿La dirección trae escrita la palabra "ocurre"?
 * Se miran las referencias y la calle, que es donde la gente la escribe.
 */
export function pideOcurre(...textos: (string | null | undefined)[]): boolean {
  const t = SIN_ACENTOS(textos.filter(Boolean).join(' '));
  if (!t.trim()) return false;
  return /\bocurre\b/.test(t) && !ES_EL_VERBO.test(t);
}

/**
 * Enciende el interruptor si el texto lo pide y estaba apagado.
 * Devuelve true si la dirección debe tratarse como Ocurre (ya lo era o se acaba
 * de encender). Idempotente y silencioso ante fallas: si no se puede escribir,
 * igual se devuelve el veredicto para que la guía salga bien.
 */
export async function encenderOcurreSiElTextoLoPide(
  db: any,
  addressId: number | null | undefined,
  esOcurreActual: boolean | null | undefined,
  ...textos: (string | null | undefined)[]
): Promise<boolean> {
  if (esOcurreActual === true) return true;
  if (!pideOcurre(...textos)) return false;
  if (addressId) {
    try {
      await db.query(
        `UPDATE addresses SET is_ocurre = TRUE WHERE id = $1 AND COALESCE(is_ocurre, FALSE) = FALSE`,
        [addressId]
      );
      console.log(`[OCURRE] Dirección ${addressId}: el texto pedía sucursal y el interruptor estaba apagado; se encendió.`);
    } catch (e: any) {
      console.error('[OCURRE] no pude encender el interruptor:', e?.message);
    }
  }
  return true;
}
