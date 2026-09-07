#!/usr/bin/env node
/**
 * Repara documentos de verificacion guardados como HEIC con nombre .jpeg.
 *
 * La app mandaba las fotos de iPhone etiquetadas como image/jpeg, asi que se
 * guardaban con ese nombre y ese content-type teniendo bytes HEIC adentro.
 * Resultado: la pantalla de revision mostraba los tres documentos rotos y
 * OpenAI respondia 400 "unsupported image".
 *
 * NO destruye nada: sube una copia convertida con llave nueva y apunta la base
 * a esa. El HEIC original se queda en S3 por si hiciera falta.
 *
 *   node scripts/reparar-heic-verificacion.js 801          → repara ese usuario
 *   node scripts/reparar-heic-verificacion.js 801 --dry    → solo dice que haria
 */
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const { getS3ObjectBuffer, uploadToS3, s3KeyFromUrl } = require('../dist/s3Service');
const { normalizarImagen, formatoReal } = require('../dist/imagenNormalizar');

const CAMPOS = ['ine_front_url', 'ine_back_url', 'selfie_url'];
const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const dry = process.argv.includes('--dry');

if (ids.length === 0) { console.error('Uso: node scripts/reparar-heic-verificacion.js <userId> [...] [--dry]'); process.exit(1); }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  for (const id of ids) {
    const r = await pool.query(
      `SELECT id, box_id, full_name, ${CAMPOS.join(', ')} FROM users WHERE id = $1`, [id]);
    const u = r.rows[0];
    if (!u) { console.log(`#${id}: no existe`); continue; }
    console.log(`\n=== ${u.box_id} · ${u.full_name} (#${u.id}) ===`);

    for (const campo of CAMPOS) {
      const url = u[campo];
      if (!url) { console.log(`  ${campo}: vacio`); continue; }
      const key = s3KeyFromUrl(url);
      if (!key) { console.log(`  ${campo}: no es de nuestro bucket, se deja`); continue; }
      let buf;
      try { buf = await getS3ObjectBuffer(key); }
      catch (e) { console.log(`  ${campo}: no se pudo bajar (${e.message})`); continue; }

      const real = formatoReal(buf);
      if (real !== 'heic') { console.log(`  ${campo}: ya es ${real || 'formato desconocido'}, no se toca`); continue; }

      const norm = await normalizarImagen(buf, 'doc.heic', 'image/heic');
      if (!norm.convertida) { console.log(`  ${campo}: NO se pudo convertir, se deja como estaba`); continue; }

      const nuevaKey = key.replace(/\.[^./]+$/, '') + '-conv.jpg';
      if (dry) {
        console.log(`  ${campo}: [dry] convertiria ${buf.length}B → ${norm.buffer.length}B en ${nuevaKey}`);
        continue;
      }
      const nuevaUrl = await uploadToS3(norm.buffer, nuevaKey, 'image/jpeg');
      await pool.query(`UPDATE users SET ${campo} = $1 WHERE id = $2`, [nuevaUrl, id]);
      console.log(`  ${campo}: reparado (${(buf.length / 1024).toFixed(0)}KB HEIC → ${(norm.buffer.length / 1024).toFixed(0)}KB JPEG)`);
    }
  }
  await pool.end();
  console.log('\nListo. El HEIC original sigue en S3; solo cambio a donde apunta la base.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
