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

const esHeic = (fileName: string, contentType?: string | null): boolean => {
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
  if (!buffer?.length || !esHeic(fileName, contentType)) return original;

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
