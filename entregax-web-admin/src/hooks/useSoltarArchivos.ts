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

  const traeArchivos = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes('Files');

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
    if (desactivado || !traeArchivos(e)) return;
    e.preventDefault();
    profundidad.current = 0;
    setArrastrando(false);
    const archivos = Array.from(e.dataTransfer?.files || []);
    if (!archivos.length) return;
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
