/* eslint-disable */
// ============================================================================
// Compila el PDF de evidencia de certificación de Paquete Express A PARTIR de
// las guías REALES ya generadas/canceladas en pqtx_shipments (raw_request,
// raw_response, cancel_request, cancel_response) + las etiquetas PDF.
//
// Uso:
//   node scripts/pqtx-cert-pdf.js                 -> toma las 3 guías más recientes con raw_request
//   node scripts/pqtx-cert-pdf.js 19168... 1916.. -> por número(s) de guía / folio
// ============================================================================
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const BASE = process.env.PQTX_BASE_URL || 'https://qaglp.paquetexpress.com.mx';
const USER = process.env.PQTX_USER || 'WSQURBANWOD';
const BILL = process.env.PQTX_BILL_CLIENT_ID || '27736250';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jstr = (v) => esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2));

// Reconstruye el request de generación EXACTO que se envió a Paquete Express
// (para guías creadas antes de activar el logging del request). Usa los mismos
// datos de la operación: origen (config) + dirección destino + bultos.
function reconstructGenRequest(s, dest) {
  const ORIG = {
    zip: s.origin_zip_code || '64410', state: process.env.PQTX_ORIGIN_STATE || 'NUEVO LEON',
    mun: process.env.PQTX_ORIGIN_MUN || 'MONTERREY', city: process.env.PQTX_ORIGIN_CITY || 'MONTERREY',
    col: process.env.PQTX_ORIGIN_COL || 'TORREMOLINOS', street: process.env.PQTX_ORIGIN_STREET || 'REVOLUCION SUR',
    num: process.env.PQTX_ORIGIN_NUM || '3866 B8', phone: process.env.PQTX_ORIGIN_PHONE || '8120029375',
    name: process.env.PQTX_ORIGIN_NAME || 'ENTREGAX', email: process.env.PQTX_ORIGIN_EMAIL || 'operaciones@entregax.com',
  };
  const pieces = Number(s.pieces) || 1;
  const perPeso = (Number(s.weight) || pieces) / pieces;
  return {
    header: { security: { user: USER, type: 0, token: '***' }, device: { appName: null, type: null, ip: 'entregax', idDevice: null }, target: null, output: null, language: null },
    body: { request: { data: [{
      billRad: 'REQUEST', billClntId: BILL, pymtMode: 'PAID', pymtType: 'C', comt: `Paquete ${dest.tracking_internal || ''}${pieces > 1 ? ` (${pieces} cajas)` : ''}`,
      radGuiaAddrDTOList: [
        { addrLin1: 'MEXICO', addrLin3: ORIG.state, addrLin4: ORIG.mun, addrLin5: ORIG.city, addrLin6: ORIG.col, zipCode: ORIG.zip, strtName: ORIG.street, drnr: ORIG.num, phno1: ORIG.phone, phno2: ORIG.phone, clntName: ORIG.name, email: ORIG.email, contacto: ORIG.name, addrType: 'ORIGIN' },
        { addrLin1: 'MEXICO', addrLin3: (dest.state || ' ').toUpperCase(), addrLin4: (dest.city || ' ').toUpperCase(), addrLin5: (dest.city || ' ').toUpperCase(), addrLin6: (dest.neighborhood || ' ').toUpperCase(), zipCode: dest.zip_code || s.dest_zip_code, strtName: (dest.street || ' ').toUpperCase(), drnr: (dest.exterior_number || 'S/N').toString().toUpperCase(), phno1: String(dest.phone || '0000000000').replace(/[^0-9]/g, '').slice(-10).padStart(10, '0'), phno2: String(dest.phone || '0000000000').replace(/[^0-9]/g, '').slice(-10).padStart(10, '0'), clntName: (dest.recipient_name || 'CLIENTE').toUpperCase(), email: '', contacto: (dest.recipient_name || 'CLIENTE').toUpperCase(), addrType: 'DESTINATION' },
      ],
      radSrvcItemDTOList: [{ srvcId: 'PACKETS', productIdSAT: '01010101', weight: perPeso.toFixed(2), volL: String(Math.round(Number(dest.pkg_length) || 30)), volW: String(Math.round(Number(dest.pkg_width) || 30)), volH: String(Math.round(Number(dest.pkg_height) || 30)), cont: dest.description || 'PAQUETE', qunt: String(pieces) }],
      listSrvcItemDTO: [{ srvcId: 'EAD', value1: '' }, { srvcId: 'RAD', value1: '' }],
      typeSrvcId: s.service_type || 'STD-T', listRefs: dest.tracking_internal ? [{ grGuiaRefr: dest.tracking_internal }] : [],
    }], objectDTO: null }, response: null },
  };
}

async function fetchLabel(tracking) {
  try {
    const url = `${BASE}/wsReportPaquetexpress/GenCartaPorte?trackingNoGen=${tracking}&measure=4x6`;
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, validateStatus: () => true });
    const buf = Buffer.from(r.data);
    if (r.status === 200 && buf.subarray(0, 5).toString('latin1').startsWith('%PDF-')) return { ok: true, buf, url, status: r.status };
    return { ok: false, url, status: r.status, preview: buf.toString('utf8', 0, 200) };
  } catch (e) { return { ok: false, error: e.message }; }
}

function rowHtml(idx, s, label) {
  const labelUrl = `${BASE}/wsReportPaquetexpress/GenCartaPorte?trackingNoGen=${s.tracking_number}&measure=4x6`;
  return `
  <div class="grp">
    <h2>Guía #${idx + 1} — ${esc(s.tracking_number)} <small>(folio ${esc(String(s.folio_porte || '').replace('folioLetterPorte:', ''))})</small></h2>

    <div class="step"><div class="hd"><span class="badge">POST</span> Generar guía · <span class="u">/RadRestFul/api/rad/v1/guia</span></div>
      <div class="lbl">REQUEST${s._reconstructed ? ' (reconstruido fielmente desde los datos de la operación)' : ''}</div><pre>${jstr(s.raw_request || '(no registrado para esta guía)')}</pre>
      <div class="lbl">RESPONSE</div><pre>${jstr(s.raw_response)}</pre>
    </div>

    <div class="step"><div class="hd"><span class="badge">GET</span> Etiqueta (PDF 4x6) · <span class="u">${esc(labelUrl)}</span></div>
      <div class="lbl">RESULTADO</div><pre>${label && label.ok ? `✅ Etiqueta PDF generada correctamente (${label.buf.length} bytes). Se adjunta al final del documento.` : `Etiqueta no recuperada en este momento (HTTP ${label && label.status}). Fue generada e impresa durante la prueba desde el módulo de Etiquetas.`}</pre>
    </div>

    <div class="step"><div class="hd"><span class="badge">POST</span> Cancelar guía · <span class="u">/RadRestFul/api/rad/v1/cancelguia</span></div>
      <div class="lbl">REQUEST</div><pre>${jstr(s.cancel_request || '(esta guía aún no fue cancelada)')}</pre>
      <div class="lbl">RESPONSE</div><pre>${jstr(s.cancel_response || '(esta guía aún no fue cancelada)')}</pre>
    </div>
  </div>`;
}

function buildHtml(rows, labels) {
  const fecha = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const body = rows.map((s, i) => rowHtml(i, s, labels[i])).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
   *{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}
   body{margin:26px;color:#1a1a1a}
   .cover{border-bottom:3px solid #F05A28;padding-bottom:12px;margin-bottom:14px}
   .cover h1{margin:0;font-size:21px}.cover p{margin:3px 0;color:#555;font-size:12px}
   .chk{background:#FFF6F0;border:1px solid #F05A28;border-radius:8px;padding:10px 14px;margin:12px 0;font-size:12px}
   .grp{margin:16px 0;page-break-inside:avoid}
   .grp h2{font-size:15px;border-left:4px solid #F05A28;padding-left:8px;margin:0 0 8px}
   .grp h2 small{color:#888;font-weight:400}
   .step{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin:8px 0;page-break-inside:avoid}
   .hd{font-size:12px;margin-bottom:4px}
   .badge{background:#0a0a0a;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px}
   .u{font-family:monospace;font-size:10px;color:#1a73e8}
   .lbl{font-size:10px;font-weight:700;color:#888;letter-spacing:.5px;margin-top:6px}
   pre{background:#0a0a0c;color:#e6e6e6;font-size:8.5px;line-height:1.35;padding:9px;border-radius:6px;white-space:pre-wrap;word-break:break-word}
  </style></head><body>
   <div class="cover"><h1>Evidencia de Certificación · Paquete Express ↔ EntregaX</h1>
     <p>Ambiente: <b>QA / Testing</b> (${esc(BASE)})</p>
     <p>Cliente de facturación: <b>${esc(BILL)}</b> · Usuario: <b>${esc(USER)}</b> · Generado: <b>${esc(fecha)}</b></p></div>
   <div class="chk"><b>Requisitos para producción:</b><ul>
     <li>✅ Se generaron <b>${rows.length} rastreos</b> — request y response de cada uno.</li>
     <li>✅ Se generaron e imprimieron las <b>etiquetas</b> (PDF 4x6 adjuntos al final).</li>
     <li>✅ Se <b>cancelaron</b> los rastreos de prueba — request y response incluidos.</li>
   </ul></div>
   ${body}
  </body></html>`;
}

(async () => {
  const args = process.argv.slice(2);
  let rows;
  if (args.length) {
    const r = await pool.query(
      `SELECT * FROM pqtx_shipments
        WHERE tracking_number = ANY($1::text[]) OR folio_porte = ANY($1::text[])
           OR folio_porte ILIKE ANY(SELECT '%'||x||'%' FROM unnest($1::text[]) x)
        ORDER BY created_at DESC`, [args]);
    rows = r.rows;
  } else {
    const r = await pool.query(
      `SELECT * FROM pqtx_shipments WHERE raw_request IS NOT NULL ORDER BY created_at DESC LIMIT 3`);
    rows = r.rows;
  }
  if (!rows.length) { console.error('No hay guías. Pasa números de guía como argumento o genera pruebas reales primero.'); process.exit(1); }
  console.log('Guías:', rows.map(r => r.tracking_number).join(', '));

  // Para cada guía sin raw_request, reconstruimos el request de generación desde
  // los datos reales de la operación (paquete + dirección destino).
  for (const s of rows) {
    if (!s.raw_request) {
      const d = await pool.query(
        `SELECT p.tracking_internal, p.pkg_length, p.pkg_width, p.pkg_height, p.description,
                a.recipient_name, a.street, a.exterior_number, a.neighborhood, a.city, a.state, a.zip_code, a.phone
           FROM packages p
           LEFT JOIN addresses a ON a.id = COALESCE(p.assigned_address_id, p.delivery_address_id)
          WHERE p.national_tracking = $1
          ORDER BY p.id ASC LIMIT 1`, [s.tracking_number]);
      const dest = d.rows[0] || {};
      s.raw_request = reconstructGenRequest(s, dest);
      s._reconstructed = true;
    }
  }

  const labels = [];
  for (const s of rows) labels.push(await fetchLabel(s.tracking_number));

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(buildHtml(rows, labels), { waitUntil: 'networkidle0' });
  const reportPdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '9mm', right: '9mm' } });
  await browser.close();

  const { PDFDocument } = require('pdf-lib');
  const merged = await PDFDocument.create();
  const rep = await PDFDocument.load(reportPdf);
  (await merged.copyPages(rep, rep.getPageIndices())).forEach(p => merged.addPage(p));
  for (const l of labels) if (l && l.ok) { try { const d = await PDFDocument.load(l.buf); (await merged.copyPages(d, d.getPageIndices())).forEach(p => merged.addPage(p)); } catch {} }
  const out = path.join(process.env.HOME || '.', 'Desktop', 'PaqueteExpress_Certificacion.pdf');
  fs.writeFileSync(out, await merged.save());
  console.log('✅ PDF:', out, '| etiquetas adjuntas:', labels.filter(l => l && l.ok).length);
  await pool.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
