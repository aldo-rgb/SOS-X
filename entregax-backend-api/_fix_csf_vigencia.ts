/**
 * Constancias guardadas SIN vigencia (valid_until = NULL).
 *
 * Dos caminos —verificación de cliente y "guardar constancia" al crear un
 * envío— insertaban la fila sin issued_at/valid_until. Una vigencia nula se
 * evalúa como NO vigente, así que esos clientes quedaban bloqueados en el paso
 * fiscal de XPAY web aunque su constancia estuviera ahí y fuera reciente.
 * El origen ya quedó corregido; esto repara las filas existentes.
 *
 * La fecha se LEE del PDF con el mismo extractor del flujo dedicado. Si no se
 * puede leer, la fila se deja intacta: no se inventa una vigencia.
 *
 * Dry-run por defecto. --apply para escribir.
 *
 * Aplicado el 2026-08-21 sobre 56 filas: 46 con fecha leída (4 vigentes,
 * 42 realmente vencidas) y 10 ilegibles que se dejaron sin cambio.
 */
require('dotenv').config();
import { Pool } from 'pg';
import { extractIssueDateFromText } from './src/fiscalConstanciaController';

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const MESES_VIGENCIA = 3;

const bajarPdf = async (url: string): Promise<Buffer | null> => {
  try {
    if (url.startsWith('data:')) {
      const raw = url.split(',')[1] || '';
      return Buffer.from(raw, 'base64');
    }
    if (/^https?:\/\//.test(url)) {
      const { signS3UrlIfNeeded } = await import('./src/s3Service');
      const firmada = await signS3UrlIfNeeded(url, 600).catch(() => url);
      const r = await fetch(firmada || url);
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    }
    const fs = await import('fs');
    const path = await import('path');
    const p = path.join(process.cwd(), url.replace(/^\//, ''));
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  } catch {
    return null;
  }
};

(async () => {
  const { rows } = await pool.query(
    `SELECT d.id, d.user_id, u.box_id, u.full_name, d.file_url, d.created_at::date AS subida
       FROM user_saved_documents d JOIN users u ON u.id = d.user_id
      WHERE d.document_type = 'constancia_fiscal' AND d.valid_until IS NULL
      ORDER BY d.created_at DESC`
  );
  console.log(`constancias sin vigencia: ${rows.length}\n`);
  let ok = 0, vigentes = 0, vencidas = 0, ilegibles = 0;
  const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;

  for (const r of rows) {
    const buf = await bajarPdf(String(r.file_url || ''));
    let emision: Date | null = null;
    if (buf) {
      try {
        emision = extractIssueDateFromText((await pdfParse(buf)).text || '');
      } catch {
        emision = null;
      }
    }
    if (!emision) {
      ilegibles++;
      console.log(`  ${String(r.box_id).padEnd(7)} ${String(r.full_name).slice(0, 28).padEnd(28)} → ilegible, se deja igual`);
      continue;
    }
    const vence = new Date(emision.getTime());
    vence.setUTCMonth(vence.getUTCMonth() + MESES_VIGENCIA);
    const estado = vence >= new Date() ? 'VIGENTE' : 'vencida';
    if (estado === 'VIGENTE') vigentes++; else vencidas++;
    ok++;
    console.log(
      `  ${String(r.box_id).padEnd(7)} ${String(r.full_name).slice(0, 28).padEnd(28)} ` +
      `emitida ${emision.toISOString().slice(0, 10)} → vence ${vence.toISOString().slice(0, 10)}  ${estado}`
    );
    if (APPLY) {
      await pool.query(
        `UPDATE user_saved_documents SET issued_at = $2, valid_until = $3, updated_at = NOW()
          WHERE id = $1 AND valid_until IS NULL`,
        [r.id, emision, vence]
      );
    }
  }
  console.log(`\nfecha leída: ${ok}  (vigentes ${vigentes}, vencidas ${vencidas})`);
  console.log(`ilegibles (sin cambio): ${ilegibles}`);
  console.log(APPLY ? '\nAPLICADO.' : '\nDRY-RUN (sin cambios). Usa --apply para escribir.');
  await pool.end();
})();
