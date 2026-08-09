/**
 * Migra las fotos de perfil de base64 (data-URI en users.profile_photo_url) a S3,
 * redimensionándolas a tamaño de avatar (400×400 JPEG) en el camino.
 *
 * Por qué: las fotos vivían como data-URI de hasta 8 MB dentro de la columna.
 * Como las listas de tareas reincrustan el avatar de cada involucrado en cada
 * tarea, /api/tasks/mine llegó a pesar 34 MB por carga y /api/tasks/assignable-users
 * 25 MB. Tras migrar, la columna guarda una URL corta de S3 y el middleware de
 * respuesta la firma (bucket privado) con caché.
 *
 * Uso:
 *   npx tsx scripts/migrate_profile_photos_to_s3.ts --dry-run   # solo reporta
 *   npx tsx scripts/migrate_profile_photos_to_s3.ts             # migra
 *
 * Es idempotente: los valores que ya son URL se saltan. Si la subida a S3 falla
 * para un usuario, se conserva su base64 y se sigue con el resto.
 */
import dotenv from 'dotenv';
dotenv.config();

import { pool } from '../src/db';
import { persistAvatarBase64ToS3, isS3Configured, AVATAR_SIZE, s3KeyFromUrl, headS3Object } from '../src/s3Service';

const DRY_RUN = process.argv.includes('--dry-run');
// --limit N procesa solo las N fotos más pesadas. Sirve para hacer el rollout
// escalonado: migras una, confirmas que se ve bien, y sigues con el resto.
const LIMIT = (() => {
  const a = process.argv.find(x => x.startsWith('--limit'));
  if (!a) return null;
  const n = parseInt(a.includes('=') ? a.split('=')[1]! : (process.argv[process.argv.indexOf(a) + 1] || ''));
  return Number.isFinite(n) && n > 0 ? n : null;
})();

const kb = (n: number) => `${Math.round(n / 1024)} KB`;

async function main(): Promise<void> {
  if (!isS3Configured()) {
    console.error('❌ S3 no está configurado (AWS_*). Aborto: sin S3 no se puede migrar.');
    process.exit(1);
  }

  const { rows } = await pool.query(
    `SELECT id, full_name, profile_photo_url
       FROM users
      WHERE profile_photo_url LIKE 'data:%'
      ORDER BY LENGTH(profile_photo_url) DESC
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}`);

  if (rows.length === 0) { console.log('✅ No hay fotos en base64. Nada que migrar.'); return; }
  if (LIMIT) console.log(`(--limit ${LIMIT}: solo las ${rows.length} más pesadas)`);

  const totalBytes = rows.reduce((s: number, r: any) => s + r.profile_photo_url.length, 0);
  console.log(`${rows.length} foto(s) en base64 · ${kb(totalBytes)} en total${DRY_RUN ? ' · DRY RUN' : ''}\n`);

  // Respaldo del base64 ANTES de tocar nada: al sobrescribir la columna el
  // original se pierde, y lo que queda en S3 va redimensionado a 400×400.
  // Con esta tabla la migración es reversible por completo.
  if (!DRY_RUN) {
    await pool.query(`CREATE TABLE IF NOT EXISTS users_profile_photo_backup (
       user_id INTEGER PRIMARY KEY, profile_photo_url TEXT, backed_up_at TIMESTAMPTZ DEFAULT NOW())`);
    const bk = await pool.query(
      `INSERT INTO users_profile_photo_backup (user_id, profile_photo_url)
       SELECT id, profile_photo_url FROM users WHERE profile_photo_url LIKE 'data:%'
       ON CONFLICT (user_id) DO NOTHING`);
    console.log(`🛟 Respaldo: ${bk.rowCount} foto(s) guardadas en users_profile_photo_backup`);
    console.log(`   Revertir: UPDATE users u SET profile_photo_url = b.profile_photo_url\n              FROM users_profile_photo_backup b WHERE b.user_id = u.id;\n`);
  }

  let ok = 0, failed = 0, freed = 0, imgAntes = 0, imgDespues = 0;
  for (const r of rows) {
    const before = r.profile_photo_url.length;
    const label = `#${r.id} ${r.full_name} (${kb(before)})`;
    if (DRY_RUN) { console.log(`  · ${label} → se redimensionaría a ${AVATAR_SIZE}×${AVATAR_SIZE} y subiría a S3`); continue; }
    try {
      const url = await persistAvatarBase64ToS3(r.profile_photo_url, `avatars/user-${r.id}`);
      if (!url || url.startsWith('data:')) { console.warn(`  ⚠️  ${label} → S3 no aceptó la imagen, se conserva base64`); failed++; continue; }

      // Verificamos que el objeto EXISTA en S3 antes de sobrescribir la columna.
      // Si no confirmamos primero, un fallo silencioso de subida dejaría al
      // usuario apuntando a una foto inexistente y sin su base64.
      const key = s3KeyFromUrl(url);
      const head = key ? await headS3Object(key).catch(() => null) : null;
      if (!head?.exists || !head.size) {
        console.warn(`  ⚠️  ${label} → no se pudo confirmar en S3, se conserva base64`); failed++; continue;
      }

      await pool.query('UPDATE users SET profile_photo_url = $1 WHERE id = $2', [url, r.id]);
      freed += before - url.length;
      imgAntes += before; imgDespues += head.size;
      ok++;
      console.log(`  ✅ ${label} → ${kb(head.size)} en S3`);
    } catch (e: any) {
      failed++;
      console.error(`  ❌ ${label} → ${e?.message || e} (se conserva base64)`);
    }
  }

  console.log(`\nMigradas: ${ok} · Fallidas: ${failed} · Payload liberado en la API: ${kb(freed)}`);
  if (imgAntes > 0) {
    console.log(`Imágenes: ${kb(imgAntes)} → ${kb(imgDespues)} (${(100 - (imgDespues / imgAntes) * 100).toFixed(1)}% menos) a ${AVATAR_SIZE}×${AVATAR_SIZE}`);
  }
  if (ok > 0) console.log('Nota: la columna liberada es espacio muerto hasta el próximo VACUUM.');
}

main()
  .catch((e) => { console.error('Error fatal:', e); process.exitCode = 1; })
  .finally(() => pool.end());
