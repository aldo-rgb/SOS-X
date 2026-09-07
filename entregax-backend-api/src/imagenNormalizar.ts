/**
 * NORMALIZACIÓN DE IMÁGENES SUBIDAS
 *
 * Las fotos que salen de un iPhone son .heic (HEVC). Ningún navegador las
 * pinta —ni Chrome ni Firefox— así que una foto de evidencia subida desde un
 * iPhone se veía rota en la web, y Grupo Rino tampoco podía mostrarla aunque el
 * archivo les llegara completo.
 *
 * Aquí se convierten a JPEG al momento de subirlas. También se reescalan: una
 * foto de iPhone son 24 megapíxeles (4284×5712) y para una evidencia de gotera
 * o de un paquete no aporta nada, solo pesa.
 *
 * Ante cualquier falla se devuelve el archivo original tal cual: perder la
 * evidencia por no poder convertirla sería peor que guardarla en un formato
 * incómodo.
 */
import sharp from 'sharp';

/** Lado largo máximo. Suficiente para leer una etiqueta o ver un daño. */
const LADO_MAX = 2400;
const CALIDAD_JPEG = 82;

export interface ImagenNormalizada {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  convertida: boolean;
}

/**
 * Qué es el archivo DE VERDAD, mirando sus primeros bytes.
 *
 * Hace falta porque el nombre y el content-type mienten. La app mandaba las
 * fotos de INE y selfie como "data:image/jpeg" con bytes HEIC adentro: se
 * guardaban como .jpeg, el navegador no las pintaba y OpenAI las rechazaba con
 * "unsupported image", sin que nada avisara que el problema era el formato.
 * Los bytes no mienten.
 */
export const formatoReal = (buffer: Buffer): string | null => {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b.slice(1, 4).toString('latin1') === 'PNG') return 'png';
  if (b.slice(0, 3).toString('latin1') === 'GIF') return 'gif';
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.slice(0, 4).toString('latin1') === '%PDF') return 'pdf';
  // HEIC/HEIF: contenedor ISO-BMFF. La marca 'ftyp' va en el byte 4 y la
  // variante justo después (heic, heix, mif1, msf1…).
  if (b.slice(4, 8).toString('latin1') === 'ftyp') {
    const marca = b.slice(8, 12).toString('latin1').toLowerCase();
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(marca)) return 'heic';
    return 'video'; // mp4/mov: mismo contenedor, otra cosa
  }
  return null;
};

/** Los que un navegador sí pinta y la IA sí acepta. */
export const FORMATOS_QUE_SE_VEN = ['jpeg', 'png', 'gif', 'webp'];

const esHeic = (fileName: string, contentType?: string | null, buffer?: Buffer): boolean => {
  // Primero los bytes: es lo único que no miente.
  if (buffer && formatoReal(buffer) === 'heic') return true;
  const n = String(fileName || '').toLowerCase();
  const t = String(contentType || '').toLowerCase();
  return n.endsWith('.heic') || n.endsWith('.heif') || t.includes('heic') || t.includes('heif');
};

export async function normalizarImagen(
  buffer: Buffer,
  fileName: string,
  contentType?: string | null
): Promise<ImagenNormalizada> {
  const original: ImagenNormalizada = {
    buffer, fileName,
    contentType: contentType || 'application/octet-stream',
    convertida: false,
  };
  if (!buffer?.length || !esHeic(fileName, contentType, buffer)) return original;

  try {
    // sharp no decodifica HEVC (su libheif viene sin el plugin), así que la
    // decodificación la hace heic-convert (libheif en wasm) y el reescalado
    // sigue siendo de sharp.
    const heicConvert = require('heic-convert');
    const jpegCrudo: ArrayBuffer = await heicConvert({
      buffer, format: 'JPEG', quality: CALIDAD_JPEG / 100,
    });
    let salida = Buffer.from(jpegCrudo);

    try {
      const meta = await sharp(salida).metadata();
      if ((meta.width || 0) > LADO_MAX || (meta.height || 0) > LADO_MAX) {
        salida = await sharp(salida)
          .resize({ width: LADO_MAX, height: LADO_MAX, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: CALIDAD_JPEG })
          .toBuffer();
      }
    } catch { /* si el reescalado falla, el JPEG completo sirve igual */ }

    const nombre = String(fileName || 'foto').replace(/\.(heic|heif)$/i, '') + '.jpg';
    console.log(`[imagen] HEIC convertido: ${fileName} ${buffer.length}B → ${nombre} ${salida.length}B`);
    return { buffer: salida, fileName: nombre, contentType: 'image/jpeg', convertida: true };
  } catch (e: any) {
    console.warn(`[imagen] no se pudo convertir ${fileName}, se guarda como llegó:`, e?.message);
    return original;
  }
}

/**
 * Normaliza una imagen que llega como data-URL (`data:image/...;base64,...`).
 *
 * Es el camino por el que entran INE y selfie desde la app. Se decide por los
 * BYTES, no por lo que diga el data-URL: la app mandaba HEIC etiquetado como
 * image/jpeg, y creerle significaba guardar un archivo que ningún navegador
 * pinta y que OpenAI rechaza.
 *
 * Devuelve un data-URL con el tipo correcto. Si no puede convertir, devuelve el
 * original: perder el documento por no poder convertirlo sería peor.
 */
export async function normalizarDataUrl(
  dataUrl: string | null | undefined,
  etiqueta = 'imagen'
): Promise<{ dataUrl: string | null | undefined; convertida: boolean; formatoOriginal: string | null }> {
  if (!dataUrl || typeof dataUrl !== 'string') return { dataUrl, convertida: false, formatoOriginal: null };
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m || !m[2]) return { dataUrl, convertida: false, formatoOriginal: null };

  let buffer: Buffer;
  try { buffer = Buffer.from(m[2], 'base64'); } catch { return { dataUrl, convertida: false, formatoOriginal: null }; }
  const real = formatoReal(buffer);

  // Ya es un formato que se ve: no se toca. Convertir de más solo degrada.
  if (!real || FORMATOS_QUE_SE_VEN.includes(real)) {
    return { dataUrl, convertida: false, formatoOriginal: real };
  }
  if (real !== 'heic') {
    console.warn(`[imagen] ${etiqueta}: formato "${real}" que no se puede mostrar y no se sabe convertir`);
    return { dataUrl, convertida: false, formatoOriginal: real };
  }

  const norm = await normalizarImagen(buffer, `${etiqueta}.heic`, 'image/heic');
  if (!norm.convertida) {
    console.warn(`[imagen] ${etiqueta}: era HEIC y no se pudo convertir; se guarda como llegó`);
    return { dataUrl, convertida: false, formatoOriginal: 'heic' };
  }
  console.log(`[imagen] ${etiqueta}: HEIC → JPEG (${buffer.length}B → ${norm.buffer.length}B)`);
  return {
    dataUrl: `data:image/jpeg;base64,${norm.buffer.toString('base64')}`,
    convertida: true,
    formatoOriginal: 'heic',
  };
}
