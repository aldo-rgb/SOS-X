/**
 * Abrir un documento HTML para imprimirlo o guardarlo como PDF.
 *
 * El patrón que había en todas las pantallas era este:
 *
 *   const w = window.open('', '_blank');
 *   if (w) { w.document.write(html); ... }
 *
 * Y ahí está el problema: cuando el navegador BLOQUEA la ventana emergente,
 * `window.open` devuelve null, el `if` no entra y no pasa absolutamente nada.
 * Ni error, ni aviso. El cliente le da clic al botón de descargar y su pantalla
 * se queda igual, así que reporta "no descarga nada" — que es justo lo que
 * levantó Sankie Guo en el TKT-2026-2880, después de meses de que sí le
 * funcionaba. Chrome empieza a bloquear emergentes de un sitio por su cuenta,
 * así que esto se rompe solo, sin que nadie cambie nada.
 *
 * Aquí se resuelve en dos pasos:
 *
 *  1. Se intenta la ventana nueva, que es la mejor experiencia: el navegador
 *     usa el <title> del documento como nombre del archivo al guardarlo.
 *  2. Si viene bloqueada, se imprime desde un iframe oculto en la misma
 *     página. A los iframes no les aplica el bloqueador de emergentes, así que
 *     esta vía funciona aunque la primera falle.
 *
 * Solo si las dos fallan se avisa, y el aviso dice qué hacer.
 */
export function imprimirDocumento(
  html: string,
  opts: { onError?: (msg: string) => void } = {}
): void {
  const aviso = opts.onError || ((m: string) => window.alert(m));

  // ── 1. Ventana nueva ────────────────────────────────────────────────
  try {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      const img = win.document.querySelector('img');
      const imprimir = () => { try { win.print(); } catch { /* el usuario cerró la ventana */ } };
      if (img && !img.complete) {
        img.onload = imprimir;
        // Si la imagen nunca carga, no dejamos la ventana en blanco para siempre.
        img.onerror = imprimir;
        setTimeout(imprimir, 3000);
      } else {
        setTimeout(imprimir, 400);
      }
      return;
    }
  } catch { /* cae al iframe */ }

  // ── 2. Iframe oculto ────────────────────────────────────────────────
  try {
    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.position = 'fixed';
    marco.style.right = '0';
    marco.style.bottom = '0';
    marco.style.width = '0';
    marco.style.height = '0';
    marco.style.border = '0';
    document.body.appendChild(marco);

    const doc = marco.contentWindow?.document;
    if (!doc) throw new Error('sin documento');
    doc.open();
    doc.write(html);
    doc.close();

    const lanzar = () => {
      try { marco.contentWindow?.focus(); marco.contentWindow?.print(); }
      catch { aviso('No se pudo abrir el documento. Permite las ventanas emergentes de este sitio e inténtalo otra vez.'); }
      // Se quita después de imprimir: si se borra de inmediato, el diálogo de
      // impresión se queda sin contenido.
      setTimeout(() => { try { marco.remove(); } catch { /* ya no está */ } }, 60_000);
    };

    const img = doc.querySelector('img');
    if (img && !img.complete) {
      img.onload = lanzar;
      img.onerror = lanzar;
      setTimeout(lanzar, 3000);
    } else {
      setTimeout(lanzar, 400);
    }
    return;
  } catch { /* cae al aviso */ }

  aviso('No se pudo abrir el documento. Permite las ventanas emergentes de este sitio e inténtalo otra vez.');
}
