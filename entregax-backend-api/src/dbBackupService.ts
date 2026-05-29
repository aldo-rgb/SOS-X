import * as zlib from 'zlib';
import { spawn } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || 'entregax-uploads';

/**
 * Ejecuta pg_dump COMPLETO (schema + datos + enums + vistas + triggers + funciones + indices + FKs)
 * y sube el resultado comprimido a S3. Coincide con el workflow de GitHub Actions y el script local.
 */
export const runDatabaseBackup = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL no definida');

  console.log('[BACKUP] Iniciando pg_dump completo...');

  const sqlBuffer: Buffer = await new Promise((resolve, reject) => {
    const proc = spawn('pg_dump', [
      databaseUrl,
      '--no-owner',
      '--no-acl',
      '--quote-all-identifiers',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on('data', (c) => out.push(c));
    proc.stderr.on('data', (c) => err.push(c));
    proc.on('error', (e) => reject(new Error(`pg_dump no se pudo ejecutar: ${e.message}. ¿Está instalado postgresql-client-17?`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`pg_dump falló (exit ${code}): ${Buffer.concat(err).toString('utf8')}`));
      }
      resolve(Buffer.concat(out));
    });
  });

  if (sqlBuffer.length < 100 * 1024) {
    throw new Error(`Dump demasiado pequeño (${sqlBuffer.length} bytes) — abortando subida`);
  }

  // Validación mínima: debe contener al menos varias CREATE TABLE
  const head = sqlBuffer.slice(0, Math.min(sqlBuffer.length, 5 * 1024 * 1024)).toString('utf8');
  const tableCount = (head.match(/^CREATE TABLE /gm) || []).length;
  if (tableCount < 5) {
    throw new Error(`Dump sospechoso: solo ${tableCount} tablas detectadas en primeros 5MB`);
  }

  console.log(`[BACKUP] pg_dump OK: ${(sqlBuffer.length / 1024 / 1024).toFixed(1)} MB sin comprimir`);

  const compressed: Buffer = await new Promise((resolve, reject) => {
    zlib.gzip(sqlBuffer, { level: 6 }, (e, r) => (e ? reject(e) : resolve(r)));
  });

  console.log(`[BACKUP] Comprimido: ${(compressed.length / 1024 / 1024).toFixed(1)} MB`);

  const date = new Date().toISOString().substring(0, 10);
  const key = `db-backups/entregax_${date}.sql.gz`;

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: compressed,
    ContentType: 'application/gzip',
  }));

  console.log(`[BACKUP] ✅ Subido a S3: s3://${BUCKET}/${key} (${(compressed.length / 1024 / 1024).toFixed(1)} MB)`);
};
