/**
 * Limpieza de lo que escupe el lector de códigos de barras.
 *
 * El escáner se comporta como teclado, y con la distribución latinoamericana
 * algunas de sus pulsaciones caen en TECLAS MUERTAS: el resultado es un acento
 * suelto (´) pegado al texto. En CEDIS lo venían borrando a mano en cada
 * entrada — lo reportó Juan Segura en la tarea 309, tanto en la entrada de
 * PO Box como en el módulo de asignación de cliente.
 *
 * Se quitan SOLO los diacríticos sueltos y las comillas: los caracteres
 * acentuados normales (á, é, ñ) son un único codepoint y quedan intactos, así
 * que buscar clientes por nombre sigue funcionando.
 */
const DIACRITICOS_SUELTOS = /[´`¨^~ˊˋ˘˜́̀̈̂̃'"’‘`]/g;

export const limpiarEscaneo = (texto: string): string =>
  String(texto ?? '').replace(DIACRITICOS_SUELTOS, '').trim();
