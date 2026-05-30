/**
 * advisorQuoteController.ts
 * Generación de cotizaciones formales por parte de Asesores.
 * - Listado de cotizaciones generadas
 * - Generación de PDF profesional (Letter, branded)
 * - Almacenamiento en S3/local
 * - Vigencia: 7 días por defecto
 */
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from './db';
import { isS3Configured, uploadToS3WithSignedUrl, signS3UrlIfNeeded, headS3Object, getSignedUrlForKey } from './s3Service';

const supportUploadsDir = path.join(process.cwd(), 'uploads', 'support');
if (!fs.existsSync(supportUploadsDir)) fs.mkdirSync(supportUploadsDir, { recursive: true });
const quotesUploadsDir = path.join(process.cwd(), 'uploads', 'quotes');
if (!fs.existsSync(quotesUploadsDir)) fs.mkdirSync(quotesUploadsDir, { recursive: true });

/**
 * Carga el logo monocromático de EntregaX (slot `entregax_monochrome`) desde brand_assets
 * y lo devuelve como data URI (base64) para embebido directo en el HTML del PDF.
 * Devuelve null si no hay logo activo o si la descarga falla.
 */
let _cachedMonoLogo: { dataUri: string | null; ts: number } = { dataUri: null, ts: 0 };
const getEntregaxMonoLogoDataUri = async (): Promise<string | null> => {
  // Cache 10 min para no golpear DB+S3 en cada PDF
  if (_cachedMonoLogo.dataUri && Date.now() - _cachedMonoLogo.ts < 10 * 60 * 1000) {
    return _cachedMonoLogo.dataUri;
  }
  try {
    const r = await pool.query(
      `SELECT url, mime_type FROM brand_assets
       WHERE slot = 'entregax_monochrome' AND is_active = TRUE
       ORDER BY id DESC LIMIT 1`
    );
    if (!r.rows.length) return null;
    const { url, mime_type } = r.rows[0];
    if (!url) return null;

    let buf: Buffer | null = null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // S3 (firmar si es necesario) o URL pública
      const signed = (await signS3UrlIfNeeded(url, 60 * 5)) || url;
      const resp = await fetch(signed);
      if (!resp.ok) return null;
      buf = Buffer.from(await resp.arrayBuffer());
    } else if (url.startsWith('/uploads/')) {
      // Local fallback
      const localPath = path.join(process.cwd(), url.replace(/^\//, ''));
      if (fs.existsSync(localPath)) buf = fs.readFileSync(localPath);
    }
    if (!buf) return null;
    const mime = mime_type || 'image/png';
    const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
    _cachedMonoLogo = { dataUri, ts: Date.now() };
    return dataUri;
  } catch (e) {
    console.warn('[advisorQuote] No se pudo cargar logo monocromático:', (e as any)?.message);
    return null;
  }
};

let _quotesTableEnsured = false;
const ensureAdvisorQuotesTable = async () => {
  if (_quotesTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS advisor_formal_quotes (
        id SERIAL PRIMARY KEY,
        folio VARCHAR(40) UNIQUE NOT NULL,
        advisor_id INT NOT NULL REFERENCES users(id),
        client_id INT REFERENCES users(id),
        client_name VARCHAR(200),
        client_box_id VARCHAR(40),
        client_email VARCHAR(200),
        client_phone VARCHAR(40),
        servicio VARCHAR(40) NOT NULL,
        subservicio VARCHAR(40),
        categoria VARCHAR(60),
        details JSONB,
        gex_enabled BOOLEAN DEFAULT FALSE,
        gex_valor_declarado_mxn NUMERIC(14,2),
        gex_prima_mxn NUMERIC(14,2),
        precio_usd NUMERIC(14,2),
        precio_mxn NUMERIC(14,2),
        tipo_cambio NUMERIC(10,4),
        total_mxn NUMERIC(14,2),
        valid_until TIMESTAMP,
        pdf_url TEXT,
        ticket_id INT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    _quotesTableEnsured = true;
  } catch (e) {
    console.error('Error ensureAdvisorQuotesTable:', e);
  }
};

const folioGen = (): string => {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `COT-${y}${m}-${rand}`;
};

const fmtMxn = (n: number): string =>
  '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUsd = (n: number): string =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const serviceLabel = (servicio: string, subservicio?: string): string => {
  switch (servicio) {
    case 'maritimo':
      return subservicio === 'fcl_40' ? 'Marítimo China — FCL 40 pies' : 'Marítimo China (por volumen)';
    case 'aereo':
      return subservicio === 'tdi_express' ? 'Aéreo Express China' : 'Aéreo China';
    case 'pobox': return 'PO Box USA';
    case 'dhl': return 'DHL Nacional';
    default: return servicio.toUpperCase();
  }
};

/**
 * GET /api/advisor/formal-quotes
 * Lista las cotizaciones formales generadas por el asesor (o asignadas a él).
 */
export const listAdvisorFormalQuotes = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureAdvisorQuotesTable();
    const advisorId = (req as any).user?.userId;
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });
    const r = await pool.query(
      `SELECT q.id, q.folio, q.client_id, q.client_name, q.client_box_id, q.servicio, q.subservicio,
              q.categoria, q.gex_enabled, q.precio_usd, q.precio_mxn, q.total_mxn, q.tipo_cambio,
              q.valid_until, q.pdf_url, q.ticket_id, q.created_at,
              t.ticket_folio AS ticket_folio
       FROM advisor_formal_quotes q
       LEFT JOIN support_tickets t ON t.id = q.ticket_id
       WHERE q.advisor_id = $1
       ORDER BY q.created_at DESC
       LIMIT 200`,
      [advisorId]
    );
    // Firmar URLs S3 (bucket privado) — vigencia 7 días
    const rows = await Promise.all((r.rows || []).map(async (q: any) => {
      if (q.pdf_url) {
        try { q.pdf_url = await signS3UrlIfNeeded(q.pdf_url, 60 * 60 * 24 * 7); } catch { /* keep original */ }
      }
      return q;
    }));
    res.json(rows);
  } catch (e: any) {
    console.error('listAdvisorFormalQuotes:', e);
    res.status(500).json({ error: 'Error al listar cotizaciones' });
  }
};

const buildQuoteHtml = (q: any): string => {
  const total = Number(q.total_mxn || q.precio_mxn || 0);
  const fxRate = Number(q.tipo_cambio || 0);
  const validUntil = q.valid_until ? new Date(q.valid_until) : null;
  const created = new Date(q.created_at || Date.now());
  const fmt = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const d = q.details || {};

  const rows: { label: string; value: string }[] = [
    { label: 'Servicio', value: serviceLabel(q.servicio, q.subservicio) },
  ];
  if (q.categoria) rows.push({ label: 'Categoría de mercancía', value: q.categoria });
  if (d.descripcion) rows.push({ label: 'Descripción', value: d.descripcion });
  if (d.largo || d.ancho || d.alto) rows.push({ label: 'Dimensiones (cm)', value: `${d.largo || '—'} × ${d.ancho || '—'} × ${d.alto || '—'}` });
  if (d.peso) rows.push({ label: 'Peso real', value: `${d.peso} kg` });
  if (d.peso_cobrable) rows.push({ label: 'Peso cobrable', value: `${d.peso_cobrable} kg` });
  if (d.cbm) rows.push({ label: 'CBM', value: `${d.cbm} m³` });
  if (d.cantidad) rows.push({ label: 'Cantidad', value: String(d.cantidad) });
  if (d.tiempo_estimado) rows.push({ label: 'Tiempo de tránsito estimado', value: d.tiempo_estimado });

  const gexBlock = q.gex_enabled ? `
    <tr class="line">
      <td>Garantía Extendida (GEX) — valor declarado ${fmtMxn(Number(q.gex_valor_declarado_mxn || 0))}</td>
      <td class="right">${fmtMxn(Number(q.gex_prima_mxn || 0))}</td>
    </tr>` : '';

  const subtotal = Number(q.precio_mxn || 0);
  const gexAmount = q.gex_enabled ? Number(q.gex_prima_mxn || 0) : 0;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Cotización ${q.folio}</title>
<style>
  * { box-sizing: border-box; font-family: 'Helvetica', 'Arial', sans-serif; }
  body { margin: 0; color: #1A1A1A; font-size: 12px; }
  .header { background: linear-gradient(135deg, #F05A28 0%, #C44114 100%); color: #fff; padding: 24px 28px; position: relative; overflow: hidden; }
  .header h1 { margin: 0; font-size: 26px; letter-spacing: 1px; position: relative; z-index: 2; }
  .header .brand { font-size: 11px; letter-spacing: 4px; opacity: 0.9; margin-bottom: 4px; text-transform: uppercase; position: relative; z-index: 2; }
  .header .folio { float: right; text-align: right; position: relative; z-index: 2; }
  .header .folio .num { font-size: 18px; font-weight: 700; }
  .header .folio .date { font-size: 10px; opacity: 0.9; }
  .header .watermark { position: absolute; right: -40px; top: 50%; transform: translateY(-50%); height: 180px; opacity: 0.08; z-index: 1; pointer-events: none; }
  .section { padding: 12px 28px; }
  .section h2 { font-size: 13px; color: #F05A28; margin: 0 0 8px 0; border-bottom: 1px solid #F05A28; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 1px; }
  .grid { display: flex; gap: 24px; }
  .grid > div { flex: 1; }
  .grid p { margin: 2px 0; font-size: 11px; }
  .grid p strong { color: #555; min-width: 90px; display: inline-block; }
  .kv-grid { display: flex; gap: 18px; }
  .kv-grid > div { flex: 1; }
  .kv-row { display: flex; justify-content: space-between; align-items: baseline; padding: 5px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
  .kv-row:nth-child(odd) { background: #FAFAFA; }
  .kv-row .k { font-weight: 700; color: #555; }
  .kv-row .v { color: #1A1A1A; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table thead th { background: #1A1A1A; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
  table tbody td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
  table tbody td.right { text-align: right; }
  .line td { background: #FFF7F2; }
  .total-row td { font-weight: 700; font-size: 13px; background: #F05A28; color: #fff; }
  .terms { background: #F8F8F8; padding: 14px 18px; border-left: 4px solid #F05A28; font-size: 10px; color: #555; line-height: 1.6; }
  .terms strong { color: #F05A28; }
  .validity { background: #FFF3E0; border: 2px solid #FF9800; padding: 10px 14px; margin-top: 10px; border-radius: 6px; text-align: center; font-size: 12px; color: #E65100; font-weight: 600; }
  .footer { background: #1A1A1A; color: #fff; text-align: center; padding: 12px; font-size: 10px; margin-top: 18px; }
  .footer a { color: #F05A28; text-decoration: none; }
  .badge { display: inline-block; background: #FF9800; color: #fff; padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
</style></head><body>
<div class="header">
  ${q.logo_data_uri ? `<img class="watermark" src="${q.logo_data_uri}" alt="EntregaX" />` : ''}
  <div class="folio">
    <div class="num">${q.folio}</div>
    <div class="date">Emitida: ${fmt(created)}</div>
  </div>
  <div class="brand">EntregaX · Paquetería Internacional</div>
  <h1>Cotización</h1>
</div>

<div class="section">
  <h2>Información del Cliente</h2>
  <div class="grid">
    <div>
      <p><strong>Cliente:</strong> ${q.client_name || '—'}</p>
      ${q.client_box_id ? `<p><strong>No. Cliente:</strong> ${q.client_box_id}</p>` : ''}
      ${q.client_email ? `<p><strong>Email:</strong> ${q.client_email}</p>` : ''}
      ${q.client_phone ? `<p><strong>Teléfono:</strong> ${q.client_phone}</p>` : ''}
    </div>
    <div>
      <p><strong>Asesor:</strong> ${q.advisor_name || '—'}</p>
      ${q.advisor_email ? `<p><strong>Email asesor:</strong> ${q.advisor_email}</p>` : ''}
      ${q.advisor_phone ? `<p><strong>Teléfono asesor:</strong> ${q.advisor_phone}</p>` : ''}
    </div>
  </div>
</div>

<div class="section">
  <h2>Detalles del Servicio</h2>
  <div class="kv-grid">
    <div>
      ${rows.slice(0, Math.ceil(rows.length / 2)).map(r => `<div class="kv-row"><span class="k">${r.label}</span><span class="v">${r.value}</span></div>`).join('')}
    </div>
    <div>
      ${rows.slice(Math.ceil(rows.length / 2)).map(r => `<div class="kv-row"><span class="k">${r.label}</span><span class="v">${r.value}</span></div>`).join('')}
    </div>
  </div>
</div>

<div class="section">
  <h2>Desglose de Precio</h2>
  ${(() => {
    // Unidad de medida según el servicio para mostrar precio unitario
    let unitQty = 0;
    let unitLabel = '';
    if (q.servicio === 'maritimo' && q.subservicio !== 'fcl_40') {
      unitQty = Number(d.cbm || 0);
      unitLabel = 'm³';
    } else if (q.servicio === 'aereo' || q.servicio === 'dhl' || q.servicio === 'pobox') {
      unitQty = Number(d.peso_cobrable || d.peso || 0);
      unitLabel = 'kg';
    } else if (q.servicio === 'maritimo' && q.subservicio === 'fcl_40') {
      unitQty = Number(d.cantidad || 1);
      unitLabel = 'contenedor';
    }
    if (!unitQty || !unitLabel || subtotal <= 0) return '';
    const mxnPerUnit = subtotal / unitQty;
    const usdPerUnit = q.precio_usd ? Number(q.precio_usd) / unitQty : 0;
    return `<p style="margin: 0 0 6px 0; font-size: 11px; color: #555;">
      <strong>Tarifa unitaria:</strong> ${fmtMxn(mxnPerUnit)} MXN${usdPerUnit ? ` <span style="color:#888">(${fmtUsd(usdPerUnit)} USD)</span>` : ''} por ${unitLabel} · ${unitQty} ${unitLabel}${unitQty !== 1 ? 's' : ''} × ${fmtMxn(mxnPerUnit)} = ${fmtMxn(subtotal)}
    </p>`;
  })()}
  <table>
    <thead><tr><th>Concepto</th><th class="right">Importe</th></tr></thead>
    <tbody>
      <tr><td>${serviceLabel(q.servicio, q.subservicio)}${q.precio_usd ? ` <span style="color:#888">(${fmtUsd(Number(q.precio_usd))} USD)</span>` : ''}</td><td class="right">${fmtMxn(subtotal)}</td></tr>
      ${gexBlock}
      <tr class="total-row"><td>TOTAL MXN</td><td class="right">${fmtMxn(subtotal + gexAmount)}</td></tr>
    </tbody>
  </table>
  ${fxRate ? `<p style="text-align:right; font-size:10px; color:#888; margin-top:6px;">Tipo de cambio aplicado: ${fxRate.toFixed(4)} MXN/USD</p>` : ''}
</div>

${validUntil ? `<div class="section" style="padding-top:0">
  <div class="validity">
    ⏳ Vigencia de esta cotización: <strong>hasta el ${fmt(validUntil)}</strong> · 7 días naturales a partir de su emisión
  </div>
</div>` : ''}

${(q.servicio === 'maritimo' && q.subservicio !== 'fcl_40' && Array.isArray(q.maritime_tiers) && q.maritime_tiers.length) ? `<div class="section" style="padding-top:0">
  <h2>🚢 Tabla de Precios Marítimo China · Genérico (por CBM)</h2>
  <p style="margin: 0 0 8px 0; font-size: 10px; color: #666;">Precios escalonados por metro cúbico. A mayor volumen, menor tarifa unitaria.</p>
  <table>
    <thead><tr><th>Rango CBM</th><th class="right">Precio USD/CBM</th></tr></thead>
    <tbody>
      ${q.maritime_tiers.map((t: any) => {
        const min = Number(t.min_cbm || 0).toFixed(2);
        const maxNum = t.max_cbm == null ? null : Number(t.max_cbm);
        // Tratar valores "centinela" (>= 9999) como infinito visual
        const max = (maxNum == null || maxNum >= 9999) ? '∞' : maxNum.toFixed(2);
        const price = fmtUsd(Number(t.price || 0));
        const rangeLabel = t.is_flat_fee
          ? `Tarifa plana (≤ ${max} m³)`
          : `${min} – ${max} m³`;
        return `<tr><td>${rangeLabel}</td><td class="right" style="color:#F05A28; font-weight:700;">${price}</td></tr>`;
      }).join('')}
    </tbody>
  </table>
</div>` : ''}

<div class="section">
  <div class="terms">
    <strong>Términos y condiciones:</strong><br/>
    1. Esta cotización tiene una vigencia de <strong>7 días naturales</strong> a partir de su fecha de emisión.<br/>
    2. Los precios están sujetos al tipo de cambio del día de pago, fluctuaciones de combustibles y/o ajustes aduanales.<br/>
    3. La <strong>Garantía Extendida (GEX)</strong>, cuando es contratada, cubre la mercancía declarada hasta el monto indicado contra extravío total durante el tránsito internacional. Quedan excluidos faltantes, daños por mal embalaje, mercancía prohibida o sin declarar.<br/>
    4. Es responsabilidad del cliente entregar la mercancía debidamente etiquetada con su Numero de Cliente Idetificable y empacada según las recomendaciones de EntregaX.<br/>
  </div>
</div>

<div class="footer">
  EntregaX · Paquetería Internacional · <a href="https://www.entregax.com">www.entregax.com</a><br/>
  Documento generado automáticamente · No requiere firma para validez fiscal (la factura se emite por separado)
</div>
</body></html>`;
};

/**
 * POST /api/advisor/formal-quotes
 * Body: { clientId?, clientName?, clientBoxId?, clientEmail?, clientPhone?,
 *         servicio, subservicio?, categoria?, details?:{},
 *         precio_usd, precio_mxn, tipo_cambio,
 *         gex_enabled?, gex_valor_declarado_mxn?, gex_prima_mxn?,
 *         validityDays? (default 7), ticketId? }
 */
export const createAdvisorFormalQuote = async (req: Request, res: Response): Promise<any> => {
  let browser: any = null;
  try {
    await ensureAdvisorQuotesTable();
    const advisorId = (req as any).user?.userId;
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const {
      clientId, clientName, clientBoxId, clientEmail, clientPhone,
      servicio, subservicio, categoria,
      details = {},
      precio_usd, precio_mxn, tipo_cambio,
      gex_enabled = false, gex_valor_declarado_mxn, gex_prima_mxn,
      validityDays = 7,
      ticketId,
    } = req.body || {};

    if (!servicio) return res.status(400).json({ error: 'servicio es requerido' });
    if (!precio_mxn) return res.status(400).json({ error: 'precio_mxn es requerido' });

    // Datos del asesor
    const aRow = await pool.query(
      `SELECT id, full_name, email, phone FROM users WHERE id = $1`,
      [advisorId]
    );
    const advisor = aRow.rows[0] || {};

    // Datos del cliente: si se pasa clientId, traerlos
    let resolvedClient: any = {
      id: clientId || null,
      name: clientName || '',
      boxId: clientBoxId || '',
      email: clientEmail || '',
      phone: clientPhone || '',
    };
    if (clientId) {
      const cRow = await pool.query(
        `SELECT id, full_name, email, phone, box_id FROM users WHERE id = $1`,
        [clientId]
      );
      if (cRow.rows[0]) {
        resolvedClient = {
          id: cRow.rows[0].id,
          name: cRow.rows[0].full_name,
          boxId: cRow.rows[0].box_id,
          email: cRow.rows[0].email,
          phone: cRow.rows[0].phone,
        };
      }
    }

    const folio = folioGen();
    const validUntil = new Date(Date.now() + (parseInt(validityDays) || 7) * 24 * 60 * 60 * 1000);
    const gexAmount = gex_enabled ? Number(gex_prima_mxn || 0) : 0;
    const totalMxn = Number(precio_mxn || 0) + gexAmount;

    // Insert preliminar (sin pdf_url)
    const ins = await pool.query(
      `INSERT INTO advisor_formal_quotes
        (folio, advisor_id, client_id, client_name, client_box_id, client_email, client_phone,
         servicio, subservicio, categoria, details,
         gex_enabled, gex_valor_declarado_mxn, gex_prima_mxn,
         precio_usd, precio_mxn, tipo_cambio, total_mxn, valid_until, ticket_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id, created_at`,
      [
        folio, advisorId, resolvedClient.id, resolvedClient.name, resolvedClient.boxId,
        resolvedClient.email, resolvedClient.phone,
        servicio, subservicio || null, categoria || null,
        JSON.stringify(details),
        !!gex_enabled, gex_valor_declarado_mxn || null, gex_prima_mxn || null,
        precio_usd || null, precio_mxn, tipo_cambio || null, totalMxn, validUntil, ticketId || null,
      ]
    );
    const quoteId = ins.rows[0].id;
    const createdAt = ins.rows[0].created_at;

    // Generar HTML + PDF
    const monoLogoDataUri = await getEntregaxMonoLogoDataUri();

    // Cargar tabla de precios Genérico solo para cotizaciones marítimas (no FCL)
    let maritimeTiers: any[] = [];
    if (servicio === 'maritimo' && subservicio !== 'fcl_40') {
      try {
        const tiersRes = await pool.query(
          `SELECT pt.min_cbm, pt.max_cbm, pt.price, pt.is_flat_fee, pt.notes
           FROM pricing_tiers pt
           JOIN pricing_categories pc ON pt.category_id = pc.id
           WHERE pc.name = 'Generico' AND pt.is_active = TRUE
           ORDER BY pt.min_cbm ASC`
        );
        maritimeTiers = tiersRes.rows || [];
      } catch (e) {
        console.warn('[advisorQuote] No se pudieron cargar tarifas marítimas Genérico:', (e as any)?.message);
      }
    }

    const html = buildQuoteHtml({
      folio,
      created_at: createdAt,
      valid_until: validUntil,
      client_name: resolvedClient.name,
      client_box_id: resolvedClient.boxId,
      client_email: resolvedClient.email,
      client_phone: resolvedClient.phone,
      advisor_name: advisor.full_name,
      advisor_email: advisor.email,
      advisor_phone: advisor.phone,
      servicio, subservicio, categoria, details,
      gex_enabled, gex_valor_declarado_mxn, gex_prima_mxn,
      precio_usd, precio_mxn, tipo_cambio, total_mxn: totalMxn,
      logo_data_uri: monoLogoDataUri,
      maritime_tiers: maritimeTiers,
    });

    const puppeteer = require('puppeteer');
    const isProduction = process.env.NODE_ENV === 'production';
    const launchOptions: any = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    if (isProduction) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
    } else if (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')) {
      launchOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer: Buffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    await browser.close();
    browser = null;

    if (!pdfBuffer || pdfBuffer.length < 1024) {
      console.error('[advisorQuote] PDF buffer inválido/vacío:', pdfBuffer?.length);
      throw new Error('PDF generado vacío o corrupto');
    }
    console.log(`[advisorQuote] PDF generado folio=${folio} bytes=${pdfBuffer.length}`);

    const filename = `cotizacion-${folio}.pdf`;
    // Siempre guardar copia local como respaldo (Railway tiene volumen efímero pero sirve mientras el contenedor vive)
    const localPath = path.join(quotesUploadsDir, filename);
    try { fs.writeFileSync(localPath, pdfBuffer); } catch (e) { console.warn('[advisorQuote] no se pudo escribir copia local:', (e as any)?.message); }
    const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const localUrl = `${baseUrl}/uploads/quotes/${filename}`;

    let pdfUrl = localUrl;
    if (isS3Configured()) {
      const s3Key = `quotes/${filename}`;
      try {
        const { signedUrl } = await uploadToS3WithSignedUrl(pdfBuffer, s3Key, 'application/pdf', 60 * 60 * 24 * 7);
        // Verificar que el objeto realmente quedó en S3 antes de devolver la URL
        const head = await headS3Object(s3Key);
        if (!head.exists || (head.size || 0) < 1024) {
          console.error(`[advisorQuote] S3 PUT aparentemente ok pero HEAD falló key=${s3Key} exists=${head.exists} size=${head.size}`);
          pdfUrl = localUrl; // fallback
        } else {
          console.log(`[advisorQuote] S3 PUT verificado key=${s3Key} size=${head.size}`);
          pdfUrl = signedUrl;
        }
      } catch (s3Err: any) {
        console.error('[advisorQuote] Error subiendo a S3, usando fallback local:', s3Err?.message || s3Err);
        pdfUrl = localUrl;
      }
    }

    await pool.query(`UPDATE advisor_formal_quotes SET pdf_url = $1 WHERE id = $2`, [pdfUrl, quoteId]);

    // Si se asocia a un ticket, agrega un mensaje interno + adjunto
    if (ticketId) {
      try {
        await pool.query(
          `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message, attachments)
           VALUES ($1, 'agent', $2, $3, $4)`,
          [
            ticketId, advisorId,
            `📎 *Cotización formal generada* — Folio ${folio}\nTotal: ${fmtMxn(totalMxn)} MXN\nVigencia: 7 días (hasta ${validUntil.toLocaleDateString('es-MX')})`,
            JSON.stringify([pdfUrl]),
          ]
        );
        await pool.query(`UPDATE support_tickets SET updated_at = NOW(), status = 'waiting_client' WHERE id = $1`, [ticketId]);
      } catch (e) { console.error('Quote ticket message err:', e); }
    }

    res.json({ ok: true, folio, quoteId, pdfUrl, validUntil, totalMxn });
  } catch (e: any) {
    console.error('createAdvisorFormalQuote:', e);
    res.status(500).json({ error: e?.message || 'Error generando cotización' });
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
};

/**
 * GET /api/advisor/formal-quotes/:id/pdf
 * Devuelve una URL fresca al PDF (re-firma la URL S3 si aún existe, o sirve la copia local).
 * Si ?redirect=1 → 302 directo al PDF. Si no, devuelve JSON { pdfUrl }.
 */
export const getAdvisorFormalQuotePdfUrl = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = (req as any).user?.userId;
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ error: 'id inválido' });

    const r = await pool.query(
      `SELECT id, advisor_id, folio, pdf_url FROM advisor_formal_quotes WHERE id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Cotización no encontrada' });
    const q = r.rows[0];
    // Permitir asesor dueño o roles admin/super_admin/director
    const role = (req as any).user?.role || '';
    if (q.advisor_id !== advisorId && !['admin', 'super_admin', 'director'].includes(role)) {
      return res.status(403).json({ error: 'Sin permiso' });
    }

    const filename = `cotizacion-${q.folio}.pdf`;
    const localPath = path.join(quotesUploadsDir, filename);
    const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const localUrl = `${baseUrl}/uploads/quotes/${filename}`;

    let freshUrl: string | null = null;
    // 1) Intentar re-firmar la URL S3 si está en S3
    if (q.pdf_url && /amazonaws\.com/.test(q.pdf_url)) {
      const s3Key = `quotes/${filename}`;
      const head = await headS3Object(s3Key);
      if (head.exists) {
        freshUrl = await getSignedUrlForKey(s3Key, 60 * 60 * 24 * 7);
      }
    }
    // 2) Fallback a copia local
    if (!freshUrl && fs.existsSync(localPath)) {
      freshUrl = localUrl;
    }
    // 3) Si nada, error claro
    if (!freshUrl) {
      return res.status(404).json({ error: 'El PDF ya no está disponible. Regenera la cotización.' });
    }

    if (String(req.query.redirect || '') === '1') return res.redirect(302, freshUrl);
    return res.json({ pdfUrl: freshUrl });
  } catch (e: any) {
    console.error('getAdvisorFormalQuotePdfUrl:', e);
    res.status(500).json({ error: 'Error obteniendo URL del PDF' });
  }
};
