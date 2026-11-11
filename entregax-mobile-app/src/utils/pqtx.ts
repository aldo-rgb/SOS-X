// Guía CORTA de Paquete Express (PQTX) para MOSTRAR al cliente.
// El national_tracking se guarda como folio (14) + sufijo de caja/pieza (6):
//   'MTY01WE6018254001001' → se muestra 'MTY01WE6018254'.
// Solo para presentación; no cambia el valor operativo (etiqueta física).
/**
 * Dos codigos encimados en un solo campo.
 *
 * El lector mete la guia del courier en el mismo renglon donde ya iba la
 * nuestra, o lee dos veces la misma etiqueta, y el campo termina con las dos
 * pegadas: "US-5700997849MTY01WE6652560001001" o
 * "MTY01WE6804365001001MTY01WE6804365001001". El enlace de rastreo que se arma
 * con eso lleva al cliente a una pagina que no existe (tarea 850, la reporto
 * Juan Segura). Hay 9 guias con la nuestra pegada adelante y 113 con el codigo
 * del courier repetido.
 *
 * Esto NO corrige el dato guardado: corrige lo que se ensena y a donde lleva el
 * enlace, que es lo que el cliente sufre hoy. Lo que impide que entren nuevas
 * es el candado del escaneo, en el servidor.
 *
 * Se recorta solo cuando lo que queda es un codigo de verdad (8 o mas
 * caracteres). Asi la "L" del tipo de tarifa de una guia aerea no se confunde
 * con una guia de courier.
 */
export const limpiarGuiaPegada = (valor?: string | null): string => {
  const t = String(valor || '').trim();
  if (!t) return '';

  // 1. El mismo codigo dos veces, pegado.
  const mitad = Math.floor(t.length / 2);
  if (t.length % 2 === 0 && t.slice(0, mitad) === t.slice(mitad)) return t.slice(0, mitad);

  // 2. Nuestra guia interna pegada adelante.
  const m = t.match(/^(?:US-REPACK-\d+|US-\d{10}(?:-\d{1,4})?|(?:AIR|CN|TDX|LOG)[A-Za-z0-9]*-\d{1,4})(.+)$/i);
  if (m && m[1] && m[1].trim().length >= 8) return m[1].trim();

  return t;
};

export const shortPqtxGuide = (t?: string | null): string => {
  if (!t) return '';
  const limpio = limpiarGuiaPegada(t);
  const m = limpio.match(/^(MTY\d{2}[A-Z]{2}\d{7})\d{6}$/i);
  return m && m[1] ? m[1].toUpperCase() : limpio;
};
