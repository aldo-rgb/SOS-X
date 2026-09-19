import { useCallback, useRef, useState } from 'react';

/**
 * Soltar archivos encima de una zona para adjuntarlos.
 *
 * Antes sólo se podía adjuntar abriendo el explorador y buscando el archivo a
 * mano; venía pedido de varios compañeros (tarea 516). El gancho no sabe nada
 * de cómo se sube: recibe los archivos y quien lo usa reutiliza el mismo
 * manejador que ya tenía su botón de "Adjuntar".
 *
 * Uso:
 *   const { arrastrando, props } = useSoltarArchivos(archivos => subir(archivos));
 *   <Box {...props} sx={{ outline: arrastrando ? '2px dashed #F05A28' : 'none' }}>
 *
 * El navegador abre el archivo en su propia pestaña si se suelta fuera de una
 * zona que lo capture, así que `props` corta el arrastre en cuanto entra.
 */
export function useSoltarArchivos(
  recibir: (archivos: File[]) => void,
  opciones?: { desactivado?: boolean; soloUno?: boolean }
) {
  const [arrastrando, setArrastrando] = useState(false);
  // dragenter/dragleave se disparan también al pasar sobre los hijos de la
  // zona. Sin llevar la cuenta, el resaltado parpadea al mover el cursor.
  const profundidad = useRef(0);
  const desactivado = !!opciones?.desactivado;

  /**
   * ¿Este arrastre trae archivos?
   *
   * Parece trivial y no lo es: Safari **no siempre anuncia `Files`** en
   * `dataTransfer.types` mientras se arrastra (solo lo expone al soltar), así
   * que preguntarlo a secas daba `false` y no se prevenía nada. Resultado: el
   * borde naranja nunca aparecía y, al soltar sobre el campo de comentario,
   * Safari hacía lo suyo y escribía la RUTA del archivo como texto. Así lo
   * reportó Juan en la tarea 516, y el comentario que dejó era literalmente
   * `/Users/…/Captura de pantalla….png`.
   *
   * Por eso se acepta cualquier seña de archivo —los tipos de Safari incluidos—
   * y la confirmación de verdad se hace al soltar, donde `files` sí viene.
   */
  const traeArchivos = (e: React.DragEvent) => {
    const dt = e.dataTransfer;
    if (!dt) return false;
    const tipos = Array.from(dt.types || []);
    if (tipos.includes('Files')) return true;
    // Safari/macOS: identificadores UTI en vez de 'Files'.
    if (tipos.some(t => t === 'public.file-url' || t.startsWith('dyn.'))) return true;
    if (dt.items && Array.from(dt.items).some(i => i.kind === 'file')) return true;
    // Sin tipos declarados tampoco se puede descartar: se trata como archivo y
    // al soltar se verifica. Arrastrar texto SÍ declara 'text/plain'.
    return tipos.length === 0;
  };

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (desactivado || !traeArchivos(e)) return;
    e.preventDefault();
    profundidad.current += 1;
    setArrastrando(true);
  }, [desactivado]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (desactivado || !traeArchivos(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, [desactivado]);

  const onDragLeave = useCallback(() => {
    if (desactivado) return;
    profundidad.current = Math.max(0, profundidad.current - 1);
    if (profundidad.current === 0) setArrastrando(false);
  }, [desactivado]);

  const onDrop = useCallback((e: React.DragEvent) => {
    if (desactivado) return;
    profundidad.current = 0;
    setArrastrando(false);
    // Se leen los archivos ANTES de prevenir nada. Como arriba se acepta el
    // arrastre con poca información, aquí puede llegar un arrastre de texto: si
    // se previniera de todos modos, pegar texto arrastrado dejaría de funcionar.
    const archivos = Array.from(e.dataTransfer?.files || []);
    if (!archivos.length) return;
    e.preventDefault();
    e.stopPropagation();
    recibir(opciones?.soloUno ? archivos.slice(0, 1) : archivos);
  }, [desactivado, recibir, opciones?.soloUno]);

  return {
    arrastrando,
    props: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}

/** Borde punteado mientras se arrastra encima. Para no repetirlo en cada pantalla. */
export const estiloZonaSoltar = (arrastrando: boolean) => arrastrando
  ? { outline: '2px dashed #F05A28', outlineOffset: 2, bgcolor: 'rgba(240,90,40,0.06)', borderRadius: 1.5 }
  : {};

export default useSoltarArchivos;
