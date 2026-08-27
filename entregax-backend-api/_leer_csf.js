/** Lee el RFC y la razón social de una constancia guardada en S3. */
require('dotenv').config();
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const pdf = require('pdf-parse');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
});
const RFC_RE = /\b([A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3})\b/g;
(async () => {
  const uid = Number(process.argv[2]);
  const d = (await pool.query(
    `SELECT file_url, original_filename FROM user_saved_documents
      WHERE user_id = $1 AND document_type = 'constancia_fiscal' ORDER BY id DESC LIMIT 1`, [uid])).rows[0];
  if (!d) { console.log('sin constancia'); return pool.end(); }
  const u = new URL(d.file_url);
  const Bucket = u.hostname.split('.')[0];
  const Key = decodeURIComponent(u.pathname.slice(1));
  const obj = await s3.send(new GetObjectCommand({ Bucket, Key }));
  const buf = Buffer.concat(await obj.Body.toArray());
  const texto = (await pdf(buf)).text;
  console.log('archivo:', d.original_filename);
  console.log('RFC encontrados:', [...new Set(texto.match(RFC_RE) || [])].join(', ') || '(ninguno)');
  const linea = texto.split('\n').filter(l => /RFC|Denominaci|Raz[oó]n|Nombre|Apellido/i.test(l)).slice(0, 14);
  console.log('--- líneas relevantes ---'); console.log(linea.join('\n'));
  await pool.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
