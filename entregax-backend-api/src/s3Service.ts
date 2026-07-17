/**
 * Servicio de AWS S3 para almacenamiento de archivos
 * Reemplaza el almacenamiento local efímero de Render
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configuración del cliente S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'entregax-uploads';

/**
 * Subir archivo a S3
 * @param buffer - Buffer del archivo
 * @param key - Ruta/nombre del archivo en S3 (ej: "costs/container_1_debit_note.pdf")
 * @param contentType - MIME type del archivo
 * @returns URL pública del archivo
 */
export const uploadToS3 = async (
  buffer: Buffer,
  key: string,
  contentType: string = 'application/pdf'
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // ACL público para acceso directo (o usar CloudFront)
    // ACL: 'public-read', // Descomentar si el bucket permite ACLs
  });

  await s3Client.send(command);

  // Generar URL pública
  // Opción 1: URL directa (requiere bucket público o políticas adecuadas)
  const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
  
  return publicUrl;
};

/**
 * Subir archivo a S3 con URL firmada (para buckets privados)
 * @param buffer - Buffer del archivo
 * @param key - Ruta/nombre del archivo en S3
 * @param contentType - MIME type del archivo
 * @param expiresIn - Tiempo de expiración de la URL en segundos (default: 1 hora)
 * @returns URL firmada del archivo
 */
export const uploadToS3WithSignedUrl = async (
  buffer: Buffer,
  key: string,
  contentType: string = 'application/pdf',
  expiresIn: number = 3600
): Promise<{ url: string; signedUrl: string }> => {
  // Subir archivo
  const putCommand = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(putCommand);

  // Generar URL firmada para acceso temporal
  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn });
  const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

  return { url, signedUrl };
};

/**
 * Obtener URL firmada para un archivo existente
 * @param key - Ruta del archivo en S3
 * @param expiresIn - Tiempo de expiración en segundos
 * @returns URL firmada
 */
export const getSignedUrlForKey = async (key: string, expiresIn: number = 3600): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Si la URL pertenece a nuestro bucket S3, la convierte en una URL firmada
 * temporal para acceso desde el navegador (útil cuando el bucket NO es público).
 * Si no es URL de S3 (data: o cualquier otra), la regresa intacta.
 */
export const signS3UrlIfNeeded = async (url: string | null | undefined, expiresIn: number = 3600): Promise<string | null> => {
  if (!url) return null;
  // No firmar data: URLs ni rutas locales
  if (!/^https?:\/\//i.test(url)) return url;
  // Solo procesar URLs de nuestro bucket
  const region = process.env.AWS_REGION || 'us-east-1';
  const patterns = [
    new RegExp(`^https?://${BUCKET_NAME}\\.s3\\.${region}\\.amazonaws\\.com/(.+)$`),
    new RegExp(`^https?://${BUCKET_NAME}\\.s3\\.amazonaws\\.com/(.+)$`),
    new RegExp(`^https?://s3\\.${region}\\.amazonaws\\.com/${BUCKET_NAME}/(.+)$`),
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m && m[1]) {
      const key = decodeURIComponent(m[1]);
      try {
        return await getSignedUrlForKey(key, expiresIn);
      } catch (err) {
        console.warn('[signS3UrlIfNeeded] could not sign', key, (err as Error).message);
        return url;
      }
    }
  }
  return url;
};

/**
 * Eliminar archivo de S3
 * @param key - Ruta del archivo a eliminar
 */
export const deleteFromS3 = async (key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
};

/**
 * Extraer la key de S3 desde una URL completa
 * @param url - URL completa de S3
 * @returns Key del archivo
 */
export const extractKeyFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    // Para URLs como https://bucket.s3.region.amazonaws.com/key
    if (urlObj.hostname.includes('s3')) {
      return urlObj.pathname.slice(1); // Remover el / inicial
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Generar URL firmada para descarga (GET) de un objeto privado
 */
export const getSignedDownloadUrl = async (key: string, expiresIn = 3600): Promise<string> => {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Descargar un objeto de S3 como Buffer (para streamear desde el backend
 * y evitar problemas de CORS al hacer fetch directo a S3 desde el navegador).
 */
export const getS3ObjectBuffer = async (key: string): Promise<Buffer> => {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  const resp: any = await s3Client.send(command);
  const stream = resp.Body;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

/**
 * Verificar si S3 está configurado
 */
export const isS3Configured = (): boolean => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  );
};

export { s3Client, BUCKET_NAME };

/**
 * Si `value` es un data URI base64 (data:image/...;base64,...) y S3 está
 * configurado, lo sube a S3 y devuelve la URL estática del objeto. Para
 * cualquier otro valor (URL http, null, vacío) lo devuelve intacto.
 * Idempotente y seguro: si S3 no está configurado deja el valor tal cual
 * (no rompe), y un valor ya migrado (URL) pasa sin cambios.
 */
export const persistBase64ToS3 = async (
  value: string | null | undefined,
  keyPrefix: string
): Promise<string | null | undefined> => {
  if (!value || typeof value !== 'string') return value;
  const m = value.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m || !m[2]) return value; // no es base64 → ya es URL o texto: dejar intacto
  if (!isS3Configured()) return value; // sin S3 no rompemos: conservar base64
  try {
    const mime = m[1] || 'image/jpeg';
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0) return value;
    const subtype = mime.split('/')[1] || 'jpg';
    const ext = (subtype.split('+')[0] || 'jpg').split(';')[0] || 'jpg';
    const rand = Math.random().toString(36).slice(2, 8);
    const key = `${keyPrefix}-${Date.now()}-${rand}.${ext}`;
    return await uploadToS3(buffer, key, mime);
  } catch (err: any) {
    console.error('[persistBase64ToS3] error, se conserva el valor original:', err?.message || err);
    return value; // ante cualquier fallo, no perder el dato
  }
};

/**
 * Verifica si un objeto existe en S3 (HEAD).
 */
export const headS3Object = async (key: string): Promise<{ exists: boolean; size?: number }> => {
  try {
    const r: any = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return { exists: true, size: Number(r?.ContentLength || 0) };
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') {
      return { exists: false };
    }
    console.warn('[headS3Object] error:', err?.message || err);
    return { exists: false };
  }
};
