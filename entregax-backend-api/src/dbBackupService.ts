import * as zlib from 'zlib';
import { spawn } from 'child_process';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Bucket DEDICADO a respaldos, aparte del de subidas.
 *
 * Antes vivían en `entregax-uploads`, junto a las fotos de entrega y los INE,
 * y ese bucket no tiene versionado: si la llave de la app se filtraba o alguien
 * se equivocaba con un borrado masivo, se iban los respaldos sin vuelta atrás.
 * `entregax-db-backups` tiene versionado activo, cifrado y acceso público
 * bloqueado, así que un borrado se puede deshacer.
 *
 * Queda pendiente lo que no se puede hacer desde aquí: darle credenciales
 * propias. Hoy escribe con la misma llave de la app; separarlas requiere crear
 * un usuario de IAM con permiso solo sobre este bucket.
 */
const BUCKET = process.env.AWS_S3_BACKUP_BUCKET || 'entregax-db-backups';

/** Carpeta y forma del nombre de un respaldo: entregax_2026-08-29.sql.gz */
const PREFIJO_BACKUPS = 'db-backups/';
const NOMBRE_BACKUP = /^db-backups\/entregax_\d{4}-\d{2}-\d{2}\.sql\.gz$/;

/** Cuántos respaldos se conservan. Los más viejos se borran tras subir el nuevo. */
const RESPALDOS_A_CONSERVAR = 30;

/**
 * Borra los respaldos que sobran, dejando los RESPALDOS_A_CONSERVAR más
 * recientes. Sin esto los 190 MB diarios se acumulaban para siempre.
 *
 * Va en código y no como regla de ciclo de vida de S3 a propósito: este bucket
 * guarda TAMBIÉN las fotos de entrega y los INE, y no tiene versionado. Una
 * lifecycle rule con el filtro mal escrito se llevaría esas imágenes sin vuelta
 * atrás. Aquí cada llave tiene que calzar con el nombre exacto de un respaldo
 * antes de borrarse; cualquier otra cosa se ignora aunque esté en la carpeta.
 */
async function limpiarRespaldosViejos(): Promise<void> {
  const todos: { Key: string; LastModified?: Date }[] = [];
  let token: string | undefined;
  do {
    const r: any = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: PREFIJO_BACKUPS, ContinuationToken: token,
    }));
    for (const o of r.Contents || []) {
      if (o.Key && NOMBRE_BACKUP.test(o.Key)) todos.push({ Key: o.Key, LastModified: o.LastModified });
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);

  // Por nombre, no por fecha de subida: la fecha va en la llave y no depende de
  // a qué hora acabó de subirse el archivo.
  todos.sort((a, b) => b.Key.localeCompare(a.Key));
  const sobran = todos.slice(RESPALDOS_A_CONSERVAR);
  if (sobran.length === 0) {
    console.log(`[BACKUP] Retención: ${todos.length}/${RESPALDOS_A_CONSERVAR} respaldos, nada que borrar`);
    return;
  }

  // S3 borra hasta 1000 por llamada; con un respaldo al día nunca se llega,
  // pero se trocea por si alguna vez se acumulan.
  for (let i = 0; i < sobran.length; i += 1000) {
    const lote = sobran.slice(i, i + 1000);
    await s3Client.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: lote.map((o) => ({ Key: o.Key })), Quiet: true },
    }));
  }
  console.log(
    `[BACKUP] 🧹 Retención: se conservan ${RESPALDOS_A_CONSERVAR}, borrados ${sobran.length} ` +
    `(del ${sobran[sobran.length - 1]!.Key.replace(PREFIJO_BACKUPS, '')} al ${sobran[0]!.Key.replace(PREFIJO_BACKUPS, '')})`
  );
}

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

  // La limpieza va DESPUÉS de que el respaldo nuevo quedó arriba: si la subida
  // falla, no se borra nada. Y si la limpieza falla, el respaldo del día ya
  // está a salvo — por eso no tumba la función.
  try {
    await limpiarRespaldosViejos();
  } catch (e: any) {
    console.error('[BACKUP] ⚠️ No se pudieron borrar los respaldos viejos:', e?.message);
  }
};
