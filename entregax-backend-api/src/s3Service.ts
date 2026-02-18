/**
 * Servicio de AWS S3 para almacenamiento de archivos
 * Reemplaza el almacenamiento local efímero de Render
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
