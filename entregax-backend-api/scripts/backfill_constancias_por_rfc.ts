/**
 * Asigna a cada razon social la constancia que le corresponde, leyendo el RFC
 * impreso DENTRO de cada PDF que ya esta en el almacen (tarea 879).
 *
 * No deduce por fechas. El RFC viene en el documento.
 *
 * Corre en seco por defecto. Para aplicar:  npx tsx scripts/backfill_constancias_por_rfc.ts --aplicar
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { pool } from '../src/db';
import { getS3ObjectBuffer } from '../src/s3Service';
import { rfcsDeTexto, ensureConstanciaRazonSocial } from '../src/fiscalConstanciaController';
import { extractIssueDateFromText } from '../src/fiscalConstanciaController';

const APLICAR = process.argv.includes('--aplicar');
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1',
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID || '', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '' } });
const BUCKET = process.env.AWS_S3_BUCKET || 'entregax-uploads';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addM = (d: Date, m: number) => { const x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + m); return x; };

(async () => {
  if (APLICAR) await ensureConstanciaRazonSocial();

  const perfiles = await pool.query(
    `SELECT id, user_id, rfc, razon_social FROM client_fiscal_profiles WHERE COALESCE(rfc,'') <> ''`);
  const porCliente = new Map<number, any[]>();
  for (const p of perfiles.rows) {
    if (!porCliente.has(p.user_id)) porCliente.set(p.user_id, []);
    porCliente.get(p.user_id)!.push({ ...p, rfcN: String(p.rfc).toUpperCase().replace(/[^A-Z0-9Ñ&]/g, '') });
  }

  let token: string | undefined; const archivos: any[] = [];
  do {
    const r: any = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'fiscal/constancias/', ContinuationToken: token, MaxKeys: 1000 }));
    archivos.push(...(r.Contents || [])); token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  // El mas nuevo gana si dos archivos son de la misma razon social.
  archivos.sort((a, b) => a.LastModified - b.LastModified);
  console.log(`${archivos.length} archivos en el almacen, ${perfiles.rows.length} razones sociales con RFC\n`);

  const plan = new Map<number, any>();
  let ilegibles = 0, sinPerfil = 0;
  for (const o of archivos) {
    const cid = Number(o.Key.split('/')[2]);
    const mios = porCliente.get(cid);
    if (!mios?.length) { sinPerfil++; continue; }
    let rfcs: string[] = [], emision: Date | null = null;
    try {
      const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
      const texto = (await pdfParse(await getS3ObjectBuffer(o.Key))).text || '';
      rfcs = rfcsDeTexto(texto); emision = extractIssueDateFromText(texto);
    } catch { ilegibles++; continue; }
    if (!rfcs.length) { ilegibles++; continue; }
    const match = mios.find(p => rfcs.includes(p.rfcN));
    if (!match) { sinPerfil++; continue; }
    plan.set(match.id, { ...match, key: o.Key, emision, cuando: o.LastModified });
  }

  console.log(`PLAN: ${plan.size} razones sociales quedarian con su constancia`);
  console.log(`      ${ilegibles} archivos sin RFC legible, ${sinPerfil} sin razon social que empate\n`);
  const url = (k: string) => `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${k}`;
  for (const v of [...plan.values()].sort((a, b) => a.user_id - b.user_id)) {
    console.log(`  cliente ${String(v.user_id).padEnd(4)} ${String(v.rfc).padEnd(14)} ${String(v.razon_social).slice(0,30).padEnd(31)} <- ${v.key.split('/').pop()}`);
    if (APLICAR) {
      const em = v.emision || v.cuando;
      await pool.query(
        `UPDATE client_fiscal_profiles
            SET constancia_url=$1, constancia_filename=$2, constancia_subida_at=$3,
                constancia_issued_at=$4, constancia_valid_until=$5
          WHERE id=$6 AND constancia_url IS NULL`,
        [url(v.key), v.key.split('/').pop(), v.cuando, iso(em), iso(addM(em, 3)), v.id]);
    }
  }
  console.log(APLICAR ? '\nAPLICADO.' : '\n(en seco — nada se escribio. Usa --aplicar)');
  await pool.end();
})();
