/**
 * Diagnóstico de drafts marítimos con PDF corrupto.
 * Busca por referencia o ID y reporta:
 *   - Tamaño del pdf_url (data URL)
 *   - Si los magic bytes son válidos (%PDF-)
 *   - Filename y document_type
 *
 * Uso:
 *   node diagnose_maritime_draft.js LAG26-0054
 *   node diagnose_maritime_draft.js 123
 */
require('dotenv').config();
const { Pool } = require('pg');

const search = process.argv[2];
if (!search) {
  console.error('Uso: node diagnose_maritime_draft.js <referencia o id>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const isNumeric = /^\d+$/.test(search);
  const q = isNumeric
    ? `SELECT id, document_type, status, confidence, pdf_url, summary_excel_url,
              extracted_data->>'reference' AS reference,
              extracted_data->>'blNumber' AS bl_number,
              created_at
         FROM maritime_reception_drafts WHERE id = $1`
    : `SELECT id, document_type, status, confidence, pdf_url, summary_excel_url,
              extracted_data->>'reference' AS reference,
              extracted_data->>'blNumber' AS bl_number,
              created_at
         FROM maritime_reception_drafts
        WHERE extracted_data->>'reference' ILIKE $1
        ORDER BY created_at DESC LIMIT 5`;

  const params = isNumeric ? [search] : [`%${search}%`];
  const r = await pool.query(q, params);

  if (r.rows.length === 0) {
    console.log('⚠️  No se encontró ningún draft.');
    await pool.end();
    return;
  }

  for (const d of r.rows) {
    console.log('\n' + '='.repeat(60));
    console.log(`📄 Draft #${d.id}`);
    console.log(`   Tipo:        ${d.document_type}`);
    console.log(`   Status:      ${d.status}`);
    console.log(`   Confianza:   ${d.confidence}`);
    console.log(`   Referencia:  ${d.reference || '-'}`);
    console.log(`   BL Number:   ${d.bl_number || '-'}`);
    console.log(`   Creado:      ${d.created_at}`);

    // Diagnóstico PDF
    if (!d.pdf_url) {
      console.log(`   📎 PDF:       ❌ NO HAY pdf_url`);
    } else {
      const url = d.pdf_url;
      console.log(`   📎 PDF:       ${url.length} chars`);
      console.log(`      Preview:   ${url.substring(0, 60)}...`);
      const m = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) {
        console.log(`      ❌ NO es un data URL válido`);
      } else {
        const mime = m[1];
        const buf = Buffer.from(m[2], 'base64');
        const header = buf.subarray(0, 5).toString('latin1');
        const ok = header.startsWith('%PDF-');
        console.log(`      MIME:      ${mime}`);
        console.log(`      Bytes:     ${buf.length}`);
        console.log(`      Header:    "${header}"  →  ${ok ? '✅ PDF válido' : '❌ CORRUPTO'}`);
        if (!ok) {
          console.log(`      Hex(0-16): ${buf.subarray(0, 16).toString('hex')}`);
          console.log(`      Hint: probablemente se subió como text/utf-8 en vez de binario.`);
        }
      }
    }

    // Excel
    if (d.summary_excel_url) {
      const url = d.summary_excel_url;
      const m = url.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        const buf = Buffer.from(m[2], 'base64');
        // XLSX = ZIP, magic bytes PK\x03\x04
        const ok = buf[0] === 0x50 && buf[1] === 0x4b;
        console.log(`   📊 Excel:     ${buf.length} bytes  →  ${ok ? '✅ XLSX válido' : '❌ CORRUPTO'}`);
      }
    }
  }

  console.log('\n');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
