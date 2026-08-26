/**
 * Limpieza de lo que escupe el lector de códigos de barras.
 *
 * El escáner se comporta como un teclado y manda los códigos de tecla del
 * layout de Estados Unidos, pero las máquinas de CEDIS están en Latinoamérica.
 * La tecla que en US produce el GUION es, en el layout latino, la del
 * APÓSTROFE. Por eso una guía "IAH-472-96408771-00" llega escrita
 * "IAH'472'96408771'00": no es basura, es el guion mal traducido.
 *
 * La primera versión de esta limpieza borraba el símbolo. Quitaba el apóstrofe
 * —que era lo que se veía feo— pero se llevaba el guion con él, y el código
 * quedaba pegado. Juan Segura lo reportó así en la tarea 309: "ahora se pone
 * pero falta el guion".
 *
 * Ahora se TRADUCE en vez de borrarse:
 *
 *   · Entre dos alfanuméricos → guion. Es la posición donde el escáner lo puso
 *     y donde el código lo necesita.
 *   · Al principio, al final o suelto → se borra. Ahí no hay guion que
 *     recuperar; es una tecla muerta que quedó colgada.
 *
 * Los acentuados normales (á, é, ñ) son un solo codepoint y no se tocan, así
 * que buscar clientes por nombre sigue funcionando. Se verificó que ningún
 * cliente ni casillero lleva apóstrofe en su nombre, así que traducirlo a guion
 * no rompe esas búsquedas.
 */

/** Símbolos que el layout latino pone donde el escáner quiso un guion. */
const SIMBOLO_SUELTO = '[´`¨^~ˊˋ˘˜́̀̈̂̃\'"’‘]';

const ENTRE_ALFANUMERICOS = new RegExp(`(?<=[A-Za-z0-9])${SIMBOLO_SUELTO}+(?=[A-Za-z0-9])`, 'g');
const RESTANTES = new RegExp(SIMBOLO_SUELTO, 'g');

export const limpiarEscaneo = (texto: string): string =>
  String(texto ?? '')
    .replace(ENTRE_ALFANUMERICOS, '-')   // el guion que el layout convirtió
    .replace(RESTANTES, '')              // lo que quedó suelto, sí sobra
    .trim();
