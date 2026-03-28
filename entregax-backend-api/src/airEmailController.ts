// ============================================
// AIR EMAIL CONTROLLER
// Panel Correos Entrantes - Aéreo
// Recepción de emails con AWB PDF + Packing List Excel
// Extracción con IA (GPT-4o Vision) + xlsx parsing
// ============================================

import { Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import * as XLSX from 'xlsx';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// ========== OpenAI Lazy Init (mismo patrón que maritimeAiController) ==========
let openaiInstance: OpenAI | null = null;
const getOpenAI = (): OpenAI => {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
    openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiInstance;
};
const openai = new Proxy({} as OpenAI, {
  get(_, prop) { return (getOpenAI() as any)[prop]; }
});

// ========== INTERFACES ==========
interface AuthRequest extends Request {
  user?: { userId: number; email: string; role: string };
}

interface ExtractedAwbData {
  shipperName: string | null;
  consignee: string | null;
  mawb: string | null;
  origin: string | null;
  destination: string | null;
  flightNumber: string | null;
  flightDate: string | null;
  pieces: number | null;
  grossWeightKg: number | null;
  totalCost: number | null;
  totalCostCurrency: string | null;
  carrier: string | null;
}

interface PackingListRow {
  fecha: string | null;
  guiaAir: string | null;
  cliente: string | null;
  noCaja: string | null;
  pesoKg: number | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  volumen: number | null;
  tipo: string | null;       // L I类, G I类, M类
  tipoNorm: string | null;   // Logo, Generico, Medical
  observa: string | null;
  noTarima: string | null;
  vuelo: string | null;
  guiaVuelo: string | null;
  paqueteria: string | null;
  guiaEntrega: string | null;
}

interface PackingListSummary {
  concepto: string;
  cajas: number;
  kg: number;
}

// ========== AI: EXTRACT AWB DATA FROM PDF IMAGE ==========
async function extractAwbFromImage(imageInput: string): Promise<{ data: ExtractedAwbData; confidence: string }> {
  console.log('✈️ [AIR-AI] Extrayendo datos de AWB con GPT-4o Vision...');

  const isBase64 = !imageInput.startsWith('http');
  const imageContent = isBase64
    ? { type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${imageInput}` } }
    : { type: 'image_url' as const, image_url: { url: imageInput } };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Eres un experto en logística aérea internacional que extrae datos de Air Waybills (AWB/Guías Aéreas).'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analiza esta Guía Aérea (Air Waybill / AWB).
Extrae la información en formato JSON:
{
  "shipperName": "nombre completo del remitente (Shipper's Name and Address)",
  "consignee": "nombre completo del consignatario/destinatario (Consignee's Name and Address)",
  "mawb": "número MAWB completo (ej: 272-75669230)",
  "origin": "código IATA del aeropuerto de origen (ej: HKG)",
  "destination": "código IATA del aeropuerto de destino (ej: NLU)",
  "flightNumber": "número de vuelo (ej: K4533)",
  "flightDate": "fecha del vuelo en formato YYYY-MM-DD",
  "pieces": número total de piezas/bultos (número entero),
  "grossWeightKg": peso bruto total en kg (número decimal),
  "totalCost": monto total de cargos (busca 'Total other Charges Due Carrier' o 'Total Prepaid' - el número mayor),
  "totalCostCurrency": "moneda de los cargos (HKD, USD, etc.)",
  "carrier": "nombre de la aerolínea/carrier (ej: KALITTA AIR)"
}

IMPORTANTE:
- El MAWB suele estar en la esquina superior izquierda y/o derecha
- El origen está en "Airport of Departure"
- El destino está en "Airport of Destination" 
- El vuelo y fecha están en "Flight/Date"
- Las piezas y peso están en la tabla central
- El costo total está en la parte inferior ("Total other Charges Due Carrier" o "Total Prepaid")

Si no puedes leer algún campo, ponlo como null.
Responde SOLO con el JSON.`
          },
          imageContent
        ]
      }
    ]
  });

  const content = response.choices[0]?.message?.content || '{}';
  let parsed: ExtractedAwbData;
  
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('✈️ [AIR-AI] Error parsing AWB response:', content);
    parsed = {
      shipperName: null, consignee: null, mawb: null, origin: null,
      destination: null, flightNumber: null, flightDate: null,
      pieces: null, grossWeightKg: null, totalCost: null,
      totalCostCurrency: null, carrier: null
    };
  }

  // Calcular confianza
  const criticalFields = [parsed.mawb, parsed.origin, parsed.destination, parsed.pieces, parsed.grossWeightKg];
  const filledCritical = criticalFields.filter(f => f !== null && f !== undefined).length;
  const confidence = filledCritical >= 4 ? 'high' : filledCritical >= 2 ? 'medium' : 'low';

  console.log(`✈️ [AIR-AI] AWB extraído: MAWB=${parsed.mawb}, ${parsed.origin}→${parsed.destination}, ${parsed.pieces} pcs, ${parsed.grossWeightKg}kg, confianza=${confidence}`);

  return { data: parsed, confidence };
}

// ========== AI: EXTRACT AWB DATA FROM PDF TEXT ==========
async function extractAwbFromText(pdfText: string): Promise<{ data: ExtractedAwbData; confidence: string }> {
  console.log('✈️ [AIR-AI] Extrayendo datos de AWB desde texto...');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Eres un experto en logística aérea que extrae datos de Air Waybills (AWB).'
      },
      {
        role: 'user',
        content: `Analiza este texto extraído de una Guía Aérea (Air Waybill / AWB).
Extrae la información en formato JSON:
{
  "shipperName": "nombre del remitente",
  "consignee": "nombre del consignatario",
  "mawb": "número MAWB (ej: 272-75669230)",
  "origin": "código IATA origen (ej: HKG)",
  "destination": "código IATA destino (ej: NLU)",
  "flightNumber": "número de vuelo",
  "flightDate": "fecha YYYY-MM-DD",
  "pieces": número de piezas,
  "grossWeightKg": peso bruto kg,
  "totalCost": monto total cargos,
  "totalCostCurrency": "moneda",
  "carrier": "aerolínea"
}

Si no puedes identificar algún campo, ponlo como null.
Responde SOLO con el JSON.

TEXTO DEL AWB:
${pdfText.substring(0, 5000)}`
      }
    ]
  });

  const content = response.choices[0]?.message?.content || '{}';
  let parsed: ExtractedAwbData;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {
      shipperName: null, consignee: null, mawb: null, origin: null,
      destination: null, flightNumber: null, flightDate: null,
      pieces: null, grossWeightKg: null, totalCost: null,
      totalCostCurrency: null, carrier: null
    };
  }

  const criticalFields = [parsed.mawb, parsed.origin, parsed.destination, parsed.pieces, parsed.grossWeightKg];
  const filledCritical = criticalFields.filter(f => f !== null && f !== undefined).length;
  const confidence = filledCritical >= 4 ? 'high' : filledCritical >= 2 ? 'medium' : 'low';

  return { data: parsed, confidence };
}

// ========== EXCEL: PARSE PACKING LIST ==========
function parsePackingListExcel(buffer: Buffer): { rows: PackingListRow[]; summary: PackingListSummary[]; totalCajas: number; totalKg: number } {
  console.log('✈️ [AIR-EXCEL] Parseando Packing List Excel...');

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], summary: [], totalCajas: 0, totalKg: 0 };
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], summary: [], totalCajas: 0, totalKg: 0 };
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const rows: PackingListRow[] = [];
  const summary: PackingListSummary[] = [];
  let totalCajas = 0;
  let totalKg = 0;
  let headerRowIdx = -1;

  // Buscar fila de encabezados
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    const row = rawData[i];
    if (!row) continue;
    const rowStr = row.map((c: any) => String(c || '').toLowerCase()).join('|');
    if (rowStr.includes('fecha') || rowStr.includes('guia') || rowStr.includes('cliente')) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.warn('✈️ [AIR-EXCEL] No se encontró fila de encabezados, usando fila 0');
    headerRowIdx = 0;
  }

  // Mapear columnas por nombre
  const headers = rawData[headerRowIdx] || [];
  console.log('✈️ [AIR-EXCEL] Headers encontrados:', headers.map((h: any, i: number) => `[${i}]="${String(h || '').trim()}"`).join(', '));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colMap: { [key: string]: number } = {};

  // Safe cell accessor: returns cell value or undefined if column not mapped
  const cell = (row: any[], key: string): any => {
    const idx = colMap[key];
    return idx !== undefined ? row[idx] : undefined;
  };
  
  headers.forEach((h: any, idx: number) => {
    const name = String(h || '').toLowerCase().trim();
    if (name.includes('fecha')) colMap.fecha = idx;
    else if ((name.includes('guia') || name.includes('运单') || name.includes('guide') || name.includes('hawb') || name.includes('tracking')) && !name.includes('vuelo') && !name.includes('entrega') && !name.includes('enetrega') && !name.includes('flight')) {
      if (colMap.guiaAir === undefined) colMap.guiaAir = idx; // Solo la primera coincidencia
    }
    else if (name.includes('cliente') || name.includes('客户') || name.includes('customer')) colMap.cliente = idx;
    else if (name.includes('caja') || name.includes('no.')) colMap.noCaja = idx;
    else if (name.includes('peso')) colMap.pesoKg = idx;
    else if (name === 'l' || name.includes('largo') || name.includes('long')) colMap.largo = idx;
    else if (name === 'w' || name.includes('ancho') || name.includes('width')) colMap.ancho = idx;
    else if (name === 'h' || name.includes('alto') || name.includes('height')) colMap.alto = idx;
    else if (name.includes('volumen') || name.includes('vol')) colMap.volumen = idx;
    else if (name.includes('tipo')) colMap.tipo = idx;
    else if (name.includes('observ') || name.includes('produc')) colMap.observa = idx;
    else if (name.includes('tarima')) colMap.noTarima = idx;
    else if (name.includes('vuelo') && name.includes('guia')) colMap.guiaVuelo = idx;
    else if (name.includes('vuelo')) colMap.vuelo = idx;
    else if (name.includes('paquet')) colMap.paqueteria = idx;
    else if (name.includes('entrega') && name.includes('guia')) colMap.guiaEntrega = idx;
  });

  // Si no encontró "NO. Caja" pero hay columna D, asignar
  if (colMap.noCaja === undefined && colMap.guiaAir !== undefined) {
    // La columna D suele ser NO. Caja
    colMap.noCaja = (colMap.guiaAir || 1) + 2;
  }

  // Si guia de vuelo no se mapeó, buscar "guia de vuelo" como header combinado
  if (colMap.guiaVuelo === undefined) {
    headers.forEach((h: any, idx: number) => {
      const name = String(h || '').toLowerCase().trim();
      if (name.includes('guia') && name.includes('vuelo')) colMap.guiaVuelo = idx;
      if (name.includes('guia') && name.includes('entrega')) colMap.guiaEntrega = idx;
    });
  }

  // Fallback: si no se mapeó guiaAir por header, buscar en las primeras filas de datos
  // columnas que contengan valores tipo "AIR...", "MEX...", "HKG..." etc.
  if (colMap.guiaAir === undefined) {
    console.log('✈️ [AIR-EXCEL] guiaAir no mapeada por header, buscando por contenido...');
    for (let i = headerRowIdx + 1; i < Math.min(rawData.length, headerRowIdx + 6); i++) {
      const row = rawData[i];
      if (!row) continue;
      for (let j = 0; j < row.length; j++) {
        const val = String(row[j] || '').trim();
        if (/^AIR\w{5,}/i.test(val)) {
          colMap.guiaAir = j;
          console.log(`✈️ [AIR-EXCEL] guiaAir detectada en columna ${j} por contenido "${val}"`);
          break;
        }
      }
      if (colMap.guiaAir !== undefined) break;
    }
  }

  // Último fallback: si hay columna 'fecha' en 0 y guiaAir sigue sin mapear, asumir columna 1
  if (colMap.guiaAir === undefined && colMap.fecha === 0 && headers.length > 1) {
    colMap.guiaAir = 1;
    console.log('✈️ [AIR-EXCEL] guiaAir asignada a columna 1 (fallback: siguiente a fecha)');
  }

  console.log('✈️ [AIR-EXCEL] Column mapping:', colMap);

  let inSummary = false;

  // Procesar filas de datos
  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.every((c: any) => c === null || c === undefined || String(c).trim() === '')) continue;

    const firstCell = String(row[0] || '').trim().toUpperCase();

    // Detectar sección de resumen (TOTAL, nombres de operadores, categorías)
    if (firstCell === 'TOTAL' || inSummary) {
      inSummary = true;
      const concepto = String(row[0] || '').trim();
      if (!concepto) continue;

      // Buscar cajas y kg en las celdas siguientes
      let cajas = 0;
      let kg = 0;
      for (let j = 1; j < row.length; j++) {
        const val = parseFloat(String(row[j] || '0'));
        const nextLabel = String(row[j + 1] || '').toUpperCase();
        if (nextLabel === 'CAJAS' || nextLabel === 'CAJA') {
          cajas = val || 0;
          j++;
        } else if (nextLabel === 'KG') {
          kg = val || 0;
          j++;
        }
      }

      if (firstCell === 'TOTAL') {
        totalCajas = cajas;
        totalKg = kg;
      }

      summary.push({ concepto, cajas, kg });
      continue;
    }

    // Normalizar tipo
    const rawTipo = String(cell(row, 'tipo') || '').trim();
    let tipoNorm = 'Generico';
    if (rawTipo.startsWith('L') || rawTipo.includes('L I')) tipoNorm = 'Logo';
    else if (rawTipo.startsWith('G') || rawTipo.includes('G I')) tipoNorm = 'Generico';
    else if (rawTipo.startsWith('M') || rawTipo.includes('M类') || rawTipo.includes('M ')) tipoNorm = 'Medical';

    // Parsear fecha
    let fechaStr: string | null = null;
    const rawFecha = cell(row, 'fecha');
    if (rawFecha instanceof Date) {
      fechaStr = rawFecha.toISOString();
    } else if (rawFecha) {
      fechaStr = String(rawFecha).trim();
    }

    // Solo procesar filas que tengan guía AIR o cliente
    const rawGuiaAir = cell(row, 'guiaAir') ? String(cell(row, 'guiaAir')).trim() : null;
    const guiaAir = rawGuiaAir && /^AIR/i.test(rawGuiaAir) ? rawGuiaAir : null;
    const cliente = cell(row, 'cliente') ? String(cell(row, 'cliente')).trim() : null;

    if (!guiaAir && !cliente) continue;

    rows.push({
      fecha: fechaStr,
      guiaAir: guiaAir,
      cliente: cliente,
      noCaja: cell(row, 'noCaja') ? String(cell(row, 'noCaja')).trim() : null,
      pesoKg: parseFloat(String(cell(row, 'pesoKg') || '0')) || null,
      largo: parseFloat(String(cell(row, 'largo') || '0')) || null,
      ancho: parseFloat(String(cell(row, 'ancho') || '0')) || null,
      alto: parseFloat(String(cell(row, 'alto') || '0')) || null,
      volumen: parseFloat(String(cell(row, 'volumen') || '0')) || null,
      tipo: rawTipo,
      tipoNorm,
      observa: cell(row, 'observa') ? String(cell(row, 'observa')).trim() : null,
      noTarima: cell(row, 'noTarima') ? String(cell(row, 'noTarima')).trim() : null,
      vuelo: cell(row, 'vuelo') ? String(cell(row, 'vuelo')).trim() : null,
      guiaVuelo: cell(row, 'guiaVuelo') ? String(cell(row, 'guiaVuelo')).trim() : null,
      paqueteria: cell(row, 'paqueteria') ? String(cell(row, 'paqueteria')).trim() : null,
      guiaEntrega: cell(row, 'guiaEntrega') ? String(cell(row, 'guiaEntrega')).trim() : null,
    });
  }

  console.log(`✈️ [AIR-EXCEL] Parseado: ${rows.length} filas de paquetes, ${summary.length} líneas de resumen, TOTAL: ${totalCajas} cajas, ${totalKg} kg`);

  return { rows, summary, totalCajas, totalKg };
}

// ========== UPLOAD MANUAL (AWB PDF + Packing List Excel) ==========
export async function uploadManualAirShipment(req: AuthRequest, res: Response) {
  try {
    console.log('✈️ [AIR-UPLOAD] Inicio de upload manual aéreo');
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const awbFile = files?.awb?.[0];
    const packingListFile = files?.packingList?.[0];

    if (!awbFile) {
      return res.status(400).json({ error: 'Se requiere el PDF del AWB (guía aérea)' });
    }

    // Campos opcionales del form
    const routeId = req.body.route_id ? parseInt(req.body.route_id) : null;
    const reference = req.body.reference?.trim() || null;
    console.log(`✈️ [AIR-UPLOAD] route_id=${routeId}, reference=${reference}`);

    // 1. Subir archivos a S3
    let awbUrl = '';
    let packingListUrl = '';
    
    try {
      const { uploadToS3, isS3Configured } = await import('./s3Service');

      if (isS3Configured()) {
        const timestamp = Date.now();
        awbUrl = await uploadToS3(
          awbFile.buffer,
          `air-emails/awb_${timestamp}.pdf`,
          awbFile.mimetype
        );
        console.log(`✈️ [AIR-UPLOAD] AWB subido a S3: ${awbUrl.substring(0, 60)}...`);

        if (packingListFile) {
          packingListUrl = await uploadToS3(
            packingListFile.buffer,
            `air-emails/packing_${timestamp}.xlsx`,
            packingListFile.mimetype
          );
          console.log(`✈️ [AIR-UPLOAD] Packing List subido a S3`);
        }
      } else {
        console.warn('✈️ [AIR-UPLOAD] S3 no configurado, guardando referencia local');
        awbUrl = `local://awb_${Date.now()}`;
        if (packingListFile) packingListUrl = `local://packing_${Date.now()}`;
      }
    } catch (s3Err: any) {
      console.error('✈️ [AIR-UPLOAD] Error S3:', s3Err.message);
      awbUrl = `upload-error://awb`;
    }

    // 2. Extraer datos del AWB con IA
    let awbData: ExtractedAwbData = {
      shipperName: null, consignee: null, mawb: null, origin: null,
      destination: null, flightNumber: null, flightDate: null,
      pieces: null, grossWeightKg: null, totalCost: null,
      totalCostCurrency: null, carrier: null
    };
    let confidence = 'low';

    try {
      // Intentar extracción por texto primero
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdfData = new Uint8Array(awbFile.buffer);
      const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
      let fullText = '';
      
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
      }

      if (fullText.trim().length > 100) {
        console.log(`✈️ [AIR-UPLOAD] Texto PDF extraído (${fullText.length} chars), intentando extracción por texto...`);
        const textResult = await extractAwbFromText(fullText);
        awbData = textResult.data;
        confidence = textResult.confidence;
      }

      // Si confianza baja o sin MAWB, intentar con imagen
      if (confidence === 'low' || !awbData.mawb) {
        console.log('✈️ [AIR-UPLOAD] Intentando extracción por imagen (Vision)...');
        const base64 = awbFile.buffer.toString('base64');
        const imageResult = await extractAwbFromImage(base64);
        
        // Usar resultado de imagen si es mejor
        if (imageResult.confidence !== 'low' || !awbData.mawb) {
          awbData = imageResult.data;
          confidence = imageResult.confidence;
        }
      }
    } catch (aiErr: any) {
      console.error('✈️ [AIR-UPLOAD] Error en extracción IA:', aiErr.message);
    }

    // 3. Parsear Excel del Packing List
    let packingRows: PackingListRow[] = [];
    let packingSummary: PackingListSummary[] = [];
    let excelTotalCajas = 0;
    let excelTotalKg = 0;

    if (packingListFile) {
      try {
        const parsed = parsePackingListExcel(packingListFile.buffer);
        packingRows = parsed.rows;
        packingSummary = parsed.summary;
        excelTotalCajas = parsed.totalCajas;
        excelTotalKg = parsed.totalKg;
      } catch (excelErr: any) {
        console.error('✈️ [AIR-UPLOAD] Error parseando Excel:', excelErr.message);
      }
    }

    // 4. Consolidar extracted_data
    const extractedData = {
      awb: awbData,
      packingList: {
        rows: packingRows,
        summary: packingSummary,
        totalCajas: excelTotalCajas,
        totalKg: excelTotalKg,
        totalRows: packingRows.length,
      },
      // Clientes únicos detectados en el Excel
      clientesDetectados: [...new Set(packingRows.map(r => r.cliente).filter(Boolean))],
      // Guía de vuelo del Excel (debería coincidir con MAWB)
      guiaVueloExcel: packingRows.find(r => r.guiaVuelo)?.guiaVuelo || null,
    };

    // 5. Crear borrador en DB
    const result = await pool.query(`
      INSERT INTO air_reception_drafts (
        from_email, from_name, subject, document_type,
        extracted_data, confidence,
        awb_number, shipper_name, consignee, carrier,
        origin_airport, destination_airport,
        flight_number, flight_date, pieces, gross_weight_kg,
        total_cost_amount, total_cost_currency,
        awb_pdf_url, awb_pdf_filename,
        packing_list_excel_url, packing_list_excel_filename,
        route_id, reference,
        status
      ) VALUES (
        $1, $2, $3, 'AIR',
        $4, $5,
        $6, $7, $8, $9,
        $10, $11,
        $12, $13, $14, $15,
        $16, $17,
        $18, $19,
        $20, $21,
        $22, $23,
        'draft'
      ) RETURNING id
    `, [
      'upload-manual', 'Upload Manual', `AWB ${awbData.mawb || 'Manual'} - Upload Manual`,
      JSON.stringify(extractedData), confidence,
      awbData.mawb, awbData.shipperName, awbData.consignee, awbData.carrier,
      awbData.origin, awbData.destination,
      awbData.flightNumber, awbData.flightDate, awbData.pieces || excelTotalCajas, awbData.grossWeightKg || excelTotalKg,
      awbData.totalCost, awbData.totalCostCurrency,
      awbUrl, awbFile.originalname,
      packingListUrl || null, packingListFile?.originalname || null,
      routeId, reference,
    ]);

    const draftId = result.rows[0].id;
    console.log(`✈️ [AIR-UPLOAD] Borrador #${draftId} creado, MAWB: ${awbData.mawb}, ${packingRows.length} paquetes, confianza: ${confidence}`);

    res.json({
      success: true,
      draftId,
      awb: awbData,
      packingListRows: packingRows.length,
      summary: packingSummary,
      confidence,
      message: `Borrador creado exitosamente. MAWB: ${awbData.mawb || 'No detectado'}, ${packingRows.length} paquetes del Excel.`
    });

  } catch (error: any) {
    console.error('✈️ [AIR-UPLOAD] Error:', error.message);
    res.status(500).json({ error: 'Error procesando upload aéreo', details: error.message });
  }
}

// ========== MAILGUN WEBHOOK: RECEIVE INBOUND AIR EMAIL ==========
export async function handleInboundAirEmail(req: Request, res: Response) {
  try {
    console.log('✈️ [AIR-WEBHOOK] Email aéreo recibido');

    const from = req.body.from || req.body.sender || '';
    const subject = req.body.subject || '';
    const fromName = from.replace(/<.*>/, '').trim();
    const fromEmail = (from.match(/<(.+)>/) || ['', from])[1].toLowerCase();

    // Log para diagnóstico
    await pool.query(
      `INSERT INTO air_email_inbound_logs (from_email, subject, raw_headers) VALUES ($1, $2, $3)`,
      [fromEmail, subject, JSON.stringify({ from, subject, timestamp: new Date().toISOString() })]
    );

    // Verificar whitelist
    const whitelistCheck = await pool.query(
      `SELECT id FROM air_email_whitelist WHERE is_active = true AND $1 ILIKE '%' || email_pattern`,
      [fromEmail]
    );

    if (whitelistCheck.rows.length === 0) {
      console.log(`✈️ [AIR-WEBHOOK] Email ${fromEmail} no está en whitelist, ignorando`);
      return res.status(200).json({ status: 'ignored', reason: 'not_whitelisted' });
    }

    // Procesar adjuntos (Mailgun los envía como archivos)
    // Similar al marítimo, el procesamiento real se haría con los attachments del webhook
    // Por ahora creamos el draft con los datos del email

    const result = await pool.query(`
      INSERT INTO air_reception_drafts (
        from_email, from_name, subject, document_type,
        extracted_data, confidence, status,
        email_message_id
      ) VALUES ($1, $2, $3, 'AIR', $4, 'low', 'draft', $5)
      RETURNING id
    `, [
      fromEmail, fromName, subject,
      JSON.stringify({ source: 'email_webhook', pending_extraction: true }),
      req.body['Message-Id'] || null
    ]);

    console.log(`✈️ [AIR-WEBHOOK] Borrador #${result.rows[0].id} creado desde email`);
    res.status(200).json({ status: 'processed', draftId: result.rows[0].id });

  } catch (error: any) {
    console.error('✈️ [AIR-WEBHOOK] Error:', error.message);
    res.status(200).json({ status: 'error', message: error.message });
  }
}

// ========== GET AIR DRAFTS ==========
export async function getAirDrafts(req: AuthRequest, res: Response) {
  try {
    const { status } = req.query;
    let query = `
      SELECT id, from_email, from_name, subject, document_type,
             confidence, awb_number, shipper_name, consignee, carrier,
             origin_airport, destination_airport,
             flight_number, flight_date, pieces, gross_weight_kg,
             total_cost_amount, total_cost_currency,
             status, rejection_reason, reviewed_by, reviewed_at,
             created_at, updated_at,
             awb_pdf_url IS NOT NULL as has_awb_pdf,
             packing_list_excel_url IS NOT NULL as has_packing_list,
             extracted_data->'packingList'->>'totalRows' as packing_rows_count,
             extracted_data->'packingList'->>'totalCajas' as total_cajas,
             extracted_data->'packingList'->>'totalKg' as total_kg,
             COALESCE(jsonb_array_length(extracted_data->'clientesDetectados'), 0) as clientes_count
      FROM air_reception_drafts
    `;

    const params: any[] = [];
    if (status && status !== 'all') {
      query += ` WHERE status = $1`;
      params.push(status);
    }
    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (error: any) {
    console.error('✈️ [AIR-DRAFTS] Error:', error.message);
    res.status(500).json({ error: 'Error obteniendo borradores aéreos' });
  }
}

// ========== GET AIR DRAFT BY ID ==========
export async function getAirDraftById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT d.*, u.full_name as reviewer_name
      FROM air_reception_drafts d
      LEFT JOIN users u ON d.reviewed_by = u.id
      WHERE d.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const draft = result.rows[0];
    
    // Si el AWB está aprobado, obtener los precios guardados de los paquetes
    if (draft.status === 'approved' && draft.awb_number) {
      const packagesRes = await pool.query(`
        SELECT 
          child_no as "guiaAir",
          box_id as cliente,
          air_tariff_type as "tariffType",
          air_price_per_kg as "pricePerKg",
          air_sale_price as "salePrice",
          air_is_custom_tariff as "isCustomTariff",
          weight as "pesoKg"
        FROM packages
        WHERE international_tracking = $1
        ORDER BY child_no
      `, [draft.awb_number]);
      
      // Crear un mapa de precios por guía
      const priceMap: { [key: string]: any } = {};
      for (const pkg of packagesRes.rows) {
        if (pkg.guiaAir) {
          priceMap[pkg.guiaAir] = {
            tariffType: pkg.tariffType,
            pricePerKg: parseFloat(pkg.pricePerKg) || 0,
            salePrice: parseFloat(pkg.salePrice) || 0,
            isCustomTariff: pkg.isCustomTariff || false,
          };
        }
      }
      
      // Enriquecer las filas del packing list con los precios
      if (draft.extracted_data?.packingList?.rows) {
        draft.extracted_data.packingList.rows = draft.extracted_data.packingList.rows.map((row: any) => {
          const guia = row.guiaAir || row.noCaja;
          if (guia && priceMap[guia]) {
            return { ...row, ...priceMap[guia] };
          }
          return row;
        });
      }
      
      // Agregar totales
      const totalSalePrice = packagesRes.rows.reduce((sum, p) => sum + (parseFloat(p.salePrice) || 0), 0);
      draft.totalSalePrice = totalSalePrice;
    }

    res.json(draft);

  } catch (error: any) {
    console.error('✈️ [AIR-DRAFT-DETAIL] Error:', error.message);
    res.status(500).json({ error: 'Error obteniendo detalle del borrador' });
  }
}

// ========== APPROVE AIR DRAFT ==========
// Lógica:
//   - Clientes con prefijo "S" → packages (Gestión Aérea)
//   - Clientes sin prefijo "S" → cajo_guides (Gestión Cajo)
//   - Crea línea en air_waybill_costs (Costeo AWB)
//   - Si la guía ya existe → actualiza; si no → crea
//   - CALCULA Y GUARDA el precio de venta basado en tarifas (personalizadas o generales)
export async function approveAirDraft(req: AuthRequest, res: Response) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const userId = req.user?.userId;
    const { editedAwb, editedPackingList } = req.body;

    // Obtener draft actual
    const draftRes = await client.query('SELECT * FROM air_reception_drafts WHERE id = $1', [id]);
    if (draftRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const draft = draftRes.rows[0];
    if (draft.status !== 'draft' && draft.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Borrador ya está en estado: ${draft.status}` });
    }

    // Actualizar extracted_data con ediciones del admin
    let extractedData = draft.extracted_data || {};
    if (editedAwb) {
      extractedData.awb = { ...extractedData.awb, ...editedAwb };
    }
    if (editedPackingList) {
      extractedData.packingList = { ...extractedData.packingList, ...editedPackingList };
    }

    // Actualizar AWB fields si fueron editados
    const awb = editedAwb || extractedData.awb || {};
    const mawb = awb.mawb || draft.awb_number || '';

    // === VALIDAR QUE NO EXISTA UN AWB YA APROBADO CON ESTE MAWB ===
    if (mawb) {
      const existingAwb = await client.query(
        'SELECT id FROM air_waybill_costs WHERE awb_number = $1', [mawb]
      );
      if (existingAwb.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ 
          error: `El MAWB ${mawb} ya fue aprobado anteriormente (costeo #${existingAwb.rows[0].id}). No se puede aprobar dos veces.` 
        });
      }
    }

    // === OBTENER RUTA AÉREA PARA PRECIO ===
    // Intentar encontrar la ruta por destino (MEX, GDL, etc.)
    const destAirport = awb.destination || draft.destination_airport || 'MEX';
    const routeRes = await client.query(`
      SELECT id, code, name FROM air_routes 
      WHERE UPPER(destination_airport) = UPPER($1) AND is_active = true
      LIMIT 1
    `, [destAirport]);
    
    const airRouteId = routeRes.rows.length > 0 ? routeRes.rows[0].id : null;
    console.log(`✈️ [AIR-APPROVE] Ruta encontrada: ${routeRes.rows[0]?.name || 'NINGUNA'} (ID: ${airRouteId})`);

    // 1. Actualizar el draft como aprobado
    await client.query(`
      UPDATE air_reception_drafts SET
        status = 'approved',
        reviewed_by = $1,
        reviewed_at = NOW(),
        updated_at = NOW(),
        extracted_data = $2,
        awb_number = COALESCE($3, awb_number),
        shipper_name = COALESCE($4, shipper_name),
        consignee = COALESCE($5, consignee),
        carrier = COALESCE($6, carrier),
        origin_airport = COALESCE($7, origin_airport),
        destination_airport = COALESCE($8, destination_airport),
        flight_number = COALESCE($9, flight_number),
        flight_date = COALESCE($10, flight_date),
        pieces = COALESCE($11, pieces),
        gross_weight_kg = COALESCE($12, gross_weight_kg),
        total_cost_amount = COALESCE($13, total_cost_amount),
        total_cost_currency = COALESCE($14, total_cost_currency)
      WHERE id = $15
    `, [
      userId,
      JSON.stringify(extractedData),
      awb.mawb, awb.shipperName, awb.consignee, awb.carrier,
      awb.origin, awb.destination,
      awb.flightNumber, awb.flightDate, awb.pieces, awb.grossWeightKg,
      awb.totalCost, awb.totalCostCurrency,
      id
    ]);

    // 2. Procesar packing list rows → separar S vs no-S
    const rows = editedPackingList?.rows || extractedData?.packingList?.rows || [];
    let countS = 0;
    let countCajo = 0;

    // === FUNCIÓN HELPER PARA OBTENER PRECIO POR CLIENTE ===
    async function getClientPrice(clienteId: string, tariffType: string, targetUserId: number | null): Promise<{pricePerKg: number, isCustom: boolean}> {
      if (!airRouteId) {
        return { pricePerKg: 0, isCustom: false };
      }
      
      // 1. Buscar tarifa personalizada del cliente en air_client_tariffs
      // Primero por user_id si existe
      if (targetUserId) {
        const customRes = await client.query(`
          SELECT price_per_kg FROM air_client_tariffs 
          WHERE user_id = $1 AND route_id = $2 AND tariff_type = $3 AND is_active = true
          LIMIT 1
        `, [targetUserId, airRouteId, tariffType]);
        
        if (customRes.rows.length > 0) {
          return { pricePerKg: parseFloat(customRes.rows[0].price_per_kg), isCustom: true };
        }
      }
      
      // 2. Buscar por legacy_client_id si no encontramos por user_id
      const legacyRes = await client.query(`
        SELECT lc.id FROM legacy_clients lc WHERE UPPER(lc.box_id) = UPPER($1) LIMIT 1
      `, [clienteId]);
      
      if (legacyRes.rows.length > 0) {
        const legacyId = legacyRes.rows[0].id;
        const customLegacyRes = await client.query(`
          SELECT price_per_kg FROM air_client_tariffs 
          WHERE legacy_client_id = $1 AND route_id = $2 AND tariff_type = $3 AND is_active = true
          LIMIT 1
        `, [legacyId, airRouteId, tariffType]);
        
        if (customLegacyRes.rows.length > 0) {
          return { pricePerKg: parseFloat(customLegacyRes.rows[0].price_per_kg), isCustom: true };
        }
      }
      
      // 3. Si no hay tarifa personalizada, usar tarifa general
      const generalRes = await client.query(`
        SELECT price_per_kg FROM air_tariffs 
        WHERE route_id = $1 AND tariff_type = $2 AND is_active = true
        LIMIT 1
      `, [airRouteId, tariffType]);
      
      if (generalRes.rows.length > 0) {
        return { pricePerKg: parseFloat(generalRes.rows[0].price_per_kg), isCustom: false };
      }
      
      return { pricePerKg: 0, isCustom: false };
    }

    for (const row of rows) {
      const clienteId = (row.cliente || '').trim().toUpperCase();
      const guiaAir = row.guiaAir || row.noCaja || null;
      const isClienteS = clienteId.startsWith('S');

      if (isClienteS) {
        // ===== CLIENTE S → Gestión Aérea (packages table) =====
        // Buscar usuario por box_id
        let targetUserId: number | null = null;
        if (clienteId) {
          const userRes = await client.query(
            'SELECT id FROM users WHERE UPPER(box_id) = $1 LIMIT 1',
            [clienteId]
          );
          if (userRes.rows.length > 0) {
            targetUserId = userRes.rows[0].id;
          }
        }

        // Generar tracking_internal si no tiene guiaAir
        const trackingInternal = guiaAir || `AIR-${mawb}-${clienteId}-${Date.now()}`;

        // === CALCULAR PRECIO DE VENTA ===
        // Determinar tipo de tarifa basado en el tipo de producto
        const tipoNorm = (row.tipoNorm || row.tipo || 'G').toUpperCase().charAt(0);
        const tariffType = ['L', 'G', 'S', 'F'].includes(tipoNorm) ? tipoNorm : 'G';
        
        const { pricePerKg, isCustom } = await getClientPrice(clienteId, tariffType, targetUserId);
        const weight = parseFloat(row.pesoKg) || 0;
        const salePrice = weight * pricePerKg;

        console.log(`  → ${guiaAir}: ${clienteId} | ${weight}kg × $${pricePerKg}/kg = $${salePrice.toFixed(2)} (${isCustom ? 'CUSTOM' : 'GENERAL'})`);

        // Buscar si ya existe una guía con el mismo child_no (puede haber llegado vía API con tracking diferente)
        const existingByChildNo = await client.query(
          'SELECT id, tracking_internal, air_sale_price FROM packages WHERE child_no = $1 LIMIT 1',
          [guiaAir]
        );

        if (existingByChildNo.rows.length > 0) {
          // Ya existe → actualizar el registro existente con la info del correo + status in_transit
          // IMPORTANTE: Si ya tiene precio asignado, NO lo sobrescribimos
          const existingPkg = existingByChildNo.rows[0];
          const hasExistingPrice = existingPkg.air_sale_price !== null && parseFloat(existingPkg.air_sale_price) > 0;
          
          if (hasExistingPrice) {
            // El paquete ya llegó por API y tiene precio → NO sobrescribir precio
            await client.query(`
              UPDATE packages SET
                user_id = COALESCE($2, user_id),
                box_id = COALESCE($3, box_id),
                description = COALESCE($4, description),
                weight = COALESCE($5, weight),
                pkg_length = COALESCE($6, pkg_length),
                pkg_width = COALESCE($7, pkg_width),
                pkg_height = COALESCE($8, pkg_height),
                single_volume = COALESCE($9, single_volume),
                international_tracking = COALESCE($10, international_tracking),
                status = 'in_transit',
                carrier = COALESCE($11, carrier),
                air_source = 'extraction',
                updated_at = NOW()
              WHERE id = $1
            `, [
              existingPkg.id,
              targetUserId,
              clienteId || null,
              row.observa || row.tipo || null,
              row.pesoKg || null,
              row.largo || null,
              row.ancho || null,
              row.alto || null,
              row.volumen || null,
              mawb,
              awb.carrier || draft.carrier || null,
            ]);
          } else {
            // No tiene precio → asignar precio ahora
            await client.query(`
              UPDATE packages SET
                user_id = COALESCE($2, user_id),
                box_id = COALESCE($3, box_id),
                description = COALESCE($4, description),
                weight = COALESCE($5, weight),
                pkg_length = COALESCE($6, pkg_length),
                pkg_width = COALESCE($7, pkg_width),
                pkg_height = COALESCE($8, pkg_height),
                single_volume = COALESCE($9, single_volume),
                international_tracking = COALESCE($10, international_tracking),
                status = 'in_transit',
                carrier = COALESCE($11, carrier),
                air_source = 'extraction',
                air_route_id = $12,
                air_tariff_type = $13,
                air_price_per_kg = $14,
                air_sale_price = $15,
                air_is_custom_tariff = $16,
                air_price_assigned_at = NOW(),
                air_price_assigned_by = $17,
                updated_at = NOW()
              WHERE id = $1
            `, [
              existingPkg.id,
              targetUserId,
              clienteId || null,
              row.observa || row.tipo || null,
              row.pesoKg || null,
              row.largo || null,
              row.ancho || null,
              row.alto || null,
              row.volumen || null,
              mawb,
              awb.carrier || draft.carrier || null,
              airRouteId,
              tariffType,
              pricePerKg > 0 ? pricePerKg : null,
              salePrice > 0 ? salePrice : null,
              isCustom,
              userId,
            ]);
          }
        } else {
          // No existe → insertar nuevo registro CON PRECIO
          await client.query(`
            INSERT INTO packages (
              tracking_internal, user_id, box_id, description, weight,
              pkg_length, pkg_width, pkg_height, single_volume,
              international_tracking, status, carrier,
              child_no, air_source,
              air_route_id, air_tariff_type, air_price_per_kg, air_sale_price,
              air_is_custom_tariff, air_price_assigned_at, air_price_assigned_by,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'extraction',
                      $14, $15, $16, $17, $18, NOW(), $19, NOW(), NOW())
            ON CONFLICT (tracking_internal) DO UPDATE SET
              user_id = COALESCE(EXCLUDED.user_id, packages.user_id),
              box_id = COALESCE(EXCLUDED.box_id, packages.box_id),
              description = COALESCE(EXCLUDED.description, packages.description),
              weight = COALESCE(EXCLUDED.weight, packages.weight),
              pkg_length = COALESCE(EXCLUDED.pkg_length, packages.pkg_length),
              pkg_width = COALESCE(EXCLUDED.pkg_width, packages.pkg_width),
              pkg_height = COALESCE(EXCLUDED.pkg_height, packages.pkg_height),
              single_volume = COALESCE(EXCLUDED.single_volume, packages.single_volume),
              international_tracking = COALESCE(EXCLUDED.international_tracking, packages.international_tracking),
              status = 'in_transit',
              air_source = 'extraction',
              air_route_id = COALESCE(packages.air_route_id, EXCLUDED.air_route_id),
              air_tariff_type = COALESCE(packages.air_tariff_type, EXCLUDED.air_tariff_type),
              air_price_per_kg = COALESCE(packages.air_price_per_kg, EXCLUDED.air_price_per_kg),
              air_sale_price = COALESCE(packages.air_sale_price, EXCLUDED.air_sale_price),
              air_is_custom_tariff = COALESCE(packages.air_is_custom_tariff, EXCLUDED.air_is_custom_tariff),
              air_price_assigned_at = COALESCE(packages.air_price_assigned_at, EXCLUDED.air_price_assigned_at),
              air_price_assigned_by = COALESCE(packages.air_price_assigned_by, EXCLUDED.air_price_assigned_by),
              updated_at = NOW()
          `, [
            trackingInternal,
            targetUserId,
            clienteId || null,
            row.observa || row.tipo || 'Paquete Aéreo',
            row.pesoKg || null,
            row.largo || null,
            row.ancho || null,
            row.alto || null,
            row.volumen || null,
            mawb,
            'in_transit',
            awb.carrier || draft.carrier || 'Air',
            guiaAir,
            airRouteId,
            tariffType,
            pricePerKg > 0 ? pricePerKg : null,
            salePrice > 0 ? salePrice : null,
            isCustom,
            userId,
          ]);
        }

        countS++;
      } else {
        // ===== CLIENTE NO-S → Gestión Cajo (cajo_guides table) =====
        // UPSERT: si existe la guía (llegó vía API) → actualizar info + status a in_transit
        // Si no existe → crear con status in_transit
        await client.query(`
          INSERT INTO cajo_guides (
            guia_air, cliente, no_caja, peso_kg,
            largo, ancho, alto, volumen,
            tipo, observaciones, vuelo, guia_vuelo,
            mawb, awb_draft_id, paqueteria, guia_entrega,
            no_tarima, fecha_registro, status,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_DATE, 'in_transit', NOW(), NOW())
          ON CONFLICT (guia_air, cliente) WHERE guia_air IS NOT NULL AND cliente IS NOT NULL
          DO UPDATE SET
            no_caja = COALESCE(EXCLUDED.no_caja, cajo_guides.no_caja),
            peso_kg = COALESCE(EXCLUDED.peso_kg, cajo_guides.peso_kg),
            largo = COALESCE(EXCLUDED.largo, cajo_guides.largo),
            ancho = COALESCE(EXCLUDED.ancho, cajo_guides.ancho),
            alto = COALESCE(EXCLUDED.alto, cajo_guides.alto),
            volumen = COALESCE(EXCLUDED.volumen, cajo_guides.volumen),
            tipo = COALESCE(EXCLUDED.tipo, cajo_guides.tipo),
            observaciones = COALESCE(EXCLUDED.observaciones, cajo_guides.observaciones),
            vuelo = COALESCE(EXCLUDED.vuelo, cajo_guides.vuelo),
            guia_vuelo = COALESCE(EXCLUDED.guia_vuelo, cajo_guides.guia_vuelo),
            mawb = COALESCE(EXCLUDED.mawb, cajo_guides.mawb),
            awb_draft_id = COALESCE(EXCLUDED.awb_draft_id, cajo_guides.awb_draft_id),
            status = 'in_transit',
            updated_at = NOW()
        `, [
          guiaAir,
          row.cliente || null,
          row.noCaja || null,
          row.pesoKg || null,
          row.largo || null,
          row.ancho || null,
          row.alto || null,
          row.volumen || null,
          row.tipoNorm || row.tipo || 'Generico',
          row.observa || null,
          row.vuelo || null,
          row.guiaVuelo || null,
          mawb,
          parseInt(String(id)),
          row.paqueteria || null,
          row.guiaEntrega || null,
          row.noTarima || null,
        ]);

        countCajo++;
      }
    }

    // 3. Obtener tipo de cambio TDI vigente para guardar en el costeo
    const tcRes = await client.query(`
      SELECT COALESCE(tipo_cambio_final, COALESCE(tipo_cambio_manual, ultimo_tc_api, 17.77) + COALESCE(sobreprecio, 0)) as tc_final
      FROM exchange_rate_config WHERE servicio = 'tdi' AND estado = true LIMIT 1
    `);
    const exchangeRate = tcRes.rows.length > 0 ? parseFloat(tcRes.rows[0].tc_final) : 18.37;

    // 4. Crear/actualizar línea en air_waybill_costs (Costeo AWB)
    await client.query(`
      INSERT INTO air_waybill_costs (
        awb_number, awb_draft_id,
        shipper_name, consignee, carrier,
        origin_airport, destination_airport,
        flight_number, flight_date,
        pieces, gross_weight_kg,
        total_cost_amount, total_cost_currency,
        awb_pdf_url, packing_list_url,
        total_packages_s, total_packages_cajo,
        exchange_rate,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending', NOW(), NOW())
      ON CONFLICT (awb_number) DO UPDATE SET
        awb_draft_id = COALESCE(EXCLUDED.awb_draft_id, air_waybill_costs.awb_draft_id),
        shipper_name = COALESCE(EXCLUDED.shipper_name, air_waybill_costs.shipper_name),
        consignee = COALESCE(EXCLUDED.consignee, air_waybill_costs.consignee),
        carrier = COALESCE(EXCLUDED.carrier, air_waybill_costs.carrier),
        origin_airport = COALESCE(EXCLUDED.origin_airport, air_waybill_costs.origin_airport),
        destination_airport = COALESCE(EXCLUDED.destination_airport, air_waybill_costs.destination_airport),
        flight_number = COALESCE(EXCLUDED.flight_number, air_waybill_costs.flight_number),
        flight_date = COALESCE(EXCLUDED.flight_date, air_waybill_costs.flight_date),
        pieces = COALESCE(EXCLUDED.pieces, air_waybill_costs.pieces),
        gross_weight_kg = COALESCE(EXCLUDED.gross_weight_kg, air_waybill_costs.gross_weight_kg),
        total_cost_amount = COALESCE(EXCLUDED.total_cost_amount, air_waybill_costs.total_cost_amount),
        total_cost_currency = COALESCE(EXCLUDED.total_cost_currency, air_waybill_costs.total_cost_currency),
        awb_pdf_url = COALESCE(EXCLUDED.awb_pdf_url, air_waybill_costs.awb_pdf_url),
        packing_list_url = COALESCE(EXCLUDED.packing_list_url, air_waybill_costs.packing_list_url),
        total_packages_s = EXCLUDED.total_packages_s,
        total_packages_cajo = EXCLUDED.total_packages_cajo,
        exchange_rate = COALESCE(EXCLUDED.exchange_rate, air_waybill_costs.exchange_rate),
        updated_at = NOW()
    `, [
      mawb,
      parseInt(String(id)),
      awb.shipperName || draft.shipper_name || null,
      awb.consignee || draft.consignee || null,
      awb.carrier || draft.carrier || null,
      awb.origin || draft.origin_airport || null,
      awb.destination || draft.destination_airport || null,
      awb.flightNumber || draft.flight_number || null,
      awb.flightDate || draft.flight_date || null,
      parseInt(awb.pieces) || draft.pieces || null,
      parseFloat(awb.grossWeightKg) || draft.gross_weight_kg || null,
      parseFloat(awb.totalCost) || draft.total_cost_amount || null,
      awb.totalCostCurrency || draft.total_cost_currency || 'HKD',
      draft.awb_pdf_url || null,
      draft.packing_list_excel_url || null,
      countS,
      countCajo,
      exchangeRate,
    ]);

    // 4. Vincular paquetes S al awb_cost_id
    if (countS > 0) {
      await client.query(`
        UPDATE packages SET awb_cost_id = (
          SELECT id FROM air_waybill_costs WHERE awb_number = $1 LIMIT 1
        )
        WHERE international_tracking = $1 AND awb_cost_id IS NULL
      `, [mawb]);
    }

    await client.query('COMMIT');

    console.log(`✈️ [AIR-APPROVE] Borrador #${id} aprobado por usuario ${userId}`);
    console.log(`  → ${countS} paquetes S → Gestión Aérea`);
    console.log(`  → ${countCajo} paquetes no-S → Gestión Cajo`);
    console.log(`  → Línea de costeo AWB creada para ${mawb}`);

    res.json({
      success: true,
      message: `Aprobado: ${countS} guías → Gestión Aérea, ${countCajo} guías → Gestión Cajo`,
      packagesS: countS,
      packagesCajo: countCajo,
      awbCostCreated: true,
      mawb,
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('✈️ [AIR-APPROVE] Error:', error.message);
    res.status(500).json({ error: 'Error aprobando borrador', details: error.message });
  } finally {
    client.release();
  }
}

// ========== REJECT AIR DRAFT ==========
export async function rejectAirDraft(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { reason } = req.body;

    const result = await pool.query(`
      UPDATE air_reception_drafts SET
        status = 'rejected',
        rejection_reason = $1,
        reviewed_by = $2,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = $3 AND status = 'draft'
      RETURNING id
    `, [reason || 'Sin razón especificada', userId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado o ya procesado' });
    }

    console.log(`✈️ [AIR-REJECT] Borrador #${id} rechazado`);
    res.json({ success: true, message: 'Borrador rechazado' });

  } catch (error: any) {
    console.error('✈️ [AIR-REJECT] Error:', error.message);
    res.status(500).json({ error: 'Error rechazando borrador' });
  }
}

// ========== RE-EXTRACT AIR DRAFT DATA ==========
export async function reextractAirDraft(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    const draftRes = await pool.query('SELECT * FROM air_reception_drafts WHERE id = $1', [id]);
    if (draftRes.rows.length === 0) return res.status(404).json({ error: 'Borrador no encontrado' });

    const draft = draftRes.rows[0];

    if (!draft.awb_pdf_url) {
      return res.status(400).json({ error: 'No hay PDF de AWB para re-extraer' });
    }

    // Descargar PDF de S3 y re-extraer
    let awbData: ExtractedAwbData | null = null;
    let confidence = 'low';

    try {
      // Descargar PDF desde S3 usando URL firmada
      const { getSignedUrlForKey } = await import('./s3Service');
      const urlObj = new URL(draft.awb_pdf_url);
      const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
      const signedUrl = await getSignedUrlForKey(key, 3600);
      const axios = require('axios');
      const dlResponse = await axios.get(signedUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(dlResponse.data);

      // Intentar texto primero
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdfData = new Uint8Array(buffer);
      const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
      let fullText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
      }

      if (fullText.trim().length > 100) {
        const textResult = await extractAwbFromText(fullText);
        awbData = textResult.data;
        confidence = textResult.confidence;
      }

      // Fallback a imagen
      if (!awbData?.mawb || confidence === 'low') {
        const base64 = buffer.toString('base64');
        const imgResult = await extractAwbFromImage(base64);
        if (imgResult.confidence !== 'low' || !awbData?.mawb) {
          awbData = imgResult.data;
          confidence = imgResult.confidence;
        }
      }
    } catch (err: any) {
      console.error('✈️ [AIR-REEXTRACT] Error:', err.message);
      return res.status(500).json({ error: 'Error re-extrayendo datos', details: err.message });
    }

    if (!awbData) {
      return res.status(500).json({ error: 'No se pudo extraer datos del AWB' });
    }

    // Actualizar draft
    let extractedData = draft.extracted_data || {};
    extractedData.awb = awbData;

    // Re-parsear Packing List Excel si existe
    if (draft.packing_list_excel_url) {
      try {
        console.log('✈️ [AIR-REEXTRACT] Re-parseando Packing List Excel...');
        const { getSignedUrlForKey } = await import('./s3Service');
        const excelUrlObj = new URL(draft.packing_list_excel_url);
        const excelKey = excelUrlObj.pathname.startsWith('/') ? excelUrlObj.pathname.slice(1) : excelUrlObj.pathname;
        const excelSignedUrl = await getSignedUrlForKey(excelKey, 3600);
        const axiosExcel = require('axios');
        const excelRes = await axiosExcel.get(excelSignedUrl, { responseType: 'arraybuffer' });
        const excelBuffer = Buffer.from(excelRes.data);

        const parsed = parsePackingListExcel(excelBuffer);
        extractedData.packingList = {
          rows: parsed.rows,
          summary: parsed.summary,
          totalCajas: parsed.totalCajas,
          totalKg: parsed.totalKg,
          totalRows: parsed.rows.length,
        };
        extractedData.clientesDetectados = [...new Set(parsed.rows.map((r: PackingListRow) => r.cliente).filter(Boolean))];
        extractedData.guiaVueloExcel = parsed.rows.find((r: PackingListRow) => r.guiaVuelo)?.guiaVuelo || null;
        console.log(`✈️ [AIR-REEXTRACT] Packing List re-parseado: ${parsed.rows.length} filas`);
      } catch (excelErr: any) {
        console.error('✈️ [AIR-REEXTRACT] Error re-parseando Excel:', excelErr.message);
      }
    }

    await pool.query(`
      UPDATE air_reception_drafts SET
        extracted_data = $1, confidence = $2,
        awb_number = $3, shipper_name = $4, consignee = $5, carrier = $6,
        origin_airport = $7, destination_airport = $8,
        flight_number = $9, flight_date = $10,
        pieces = $11, gross_weight_kg = $12,
        total_cost_amount = $13, total_cost_currency = $14,
        updated_at = NOW()
      WHERE id = $15
    `, [
      JSON.stringify(extractedData), confidence,
      awbData.mawb, awbData.shipperName, awbData.consignee, awbData.carrier,
      awbData.origin, awbData.destination,
      awbData.flightNumber, awbData.flightDate,
      awbData.pieces, awbData.grossWeightKg,
      awbData.totalCost, awbData.totalCostCurrency,
      id
    ]);

    res.json({
      success: true,
      awb: awbData,
      confidence,
      message: `Re-extracción completada. MAWB: ${awbData.mawb || 'No detectado'}, confianza: ${confidence}`
    });

  } catch (error: any) {
    console.error('✈️ [AIR-REEXTRACT] Error:', error.message);
    res.status(500).json({ error: 'Error en re-extracción' });
  }
}

// ========== SERVE AWB PDF ==========
export async function serveAirAwbPdf(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const draft = await pool.query('SELECT awb_pdf_url, awb_pdf_filename FROM air_reception_drafts WHERE id = $1', [id]);

    if (draft.rows.length === 0 || !draft.rows[0].awb_pdf_url) {
      return res.status(404).json({ error: 'PDF no encontrado' });
    }

    const url = draft.rows[0].awb_pdf_url;

    if (url.startsWith('http')) {
      try {
        // Si es S3, generar URL firmada
        if (url.includes('s3.') && url.includes('amazonaws.com')) {
          const { getSignedUrlForKey } = await import('./s3Service');
          const urlObj = new URL(url);
          const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
          const signedUrl = await getSignedUrlForKey(key, 3600);
          const axios = require('axios');
          const response = await axios.get(signedUrl, { responseType: 'arraybuffer' });
          res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${draft.rows[0].awb_pdf_filename || 'awb.pdf'}"`,
          });
          return res.send(Buffer.from(response.data));
        }
        // Redirect for other URLs
        return res.redirect(url);
      } catch {
        return res.redirect(url);
      }
    }

    res.status(404).json({ error: 'Archivo no disponible' });

  } catch (error: any) {
    res.status(500).json({ error: 'Error sirviendo PDF' });
  }
}

// ========== SERVE PACKING LIST EXCEL ==========
export async function serveAirExcel(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const draft = await pool.query('SELECT packing_list_excel_url, packing_list_excel_filename FROM air_reception_drafts WHERE id = $1', [id]);

    if (draft.rows.length === 0 || !draft.rows[0].packing_list_excel_url) {
      return res.status(404).json({ error: 'Excel no encontrado' });
    }

    const url = draft.rows[0].packing_list_excel_url;

    if (url.startsWith('http')) {
      try {
        if (url.includes('s3.') && url.includes('amazonaws.com')) {
          const { getSignedUrlForKey } = await import('./s3Service');
          const urlObj = new URL(url);
          const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
          const signedUrl = await getSignedUrlForKey(key, 3600);
          const axios = require('axios');
          const response = await axios.get(signedUrl, { responseType: 'arraybuffer' });
          res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${draft.rows[0].packing_list_excel_filename || 'packing_list.xlsx'}"`,
          });
          return res.send(Buffer.from(response.data));
        }
        return res.redirect(url);
      } catch {
        return res.redirect(url);
      }
    }

    res.status(404).json({ error: 'Archivo no disponible' });

  } catch (error: any) {
    res.status(500).json({ error: 'Error sirviendo Excel' });
  }
}

// ========== AIR EMAIL STATS ==========
export async function getAirEmailStats(req: AuthRequest, res: Response) {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'draft') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
        SUM(CASE WHEN status = 'approved' THEN COALESCE(pieces, 0) ELSE 0 END) as total_pieces_approved,
        SUM(CASE WHEN status = 'approved' THEN COALESCE(gross_weight_kg, 0) ELSE 0 END) as total_kg_approved
      FROM air_reception_drafts
    `);

    res.json(stats.rows[0]);

  } catch (error: any) {
    console.error('✈️ [AIR-STATS] Error:', error.message);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
}

// ========== AIR WHITELIST CRUD ==========
export async function getAirWhitelist(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query('SELECT * FROM air_email_whitelist ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Error obteniendo whitelist' });
  }
}

export async function addToAirWhitelist(req: AuthRequest, res: Response) {
  try {
    const { email_pattern, description } = req.body;
    if (!email_pattern) return res.status(400).json({ error: 'email_pattern requerido' });

    const result = await pool.query(
      'INSERT INTO air_email_whitelist (email_pattern, description) VALUES ($1, $2) RETURNING *',
      [email_pattern, description || '']
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: 'Error agregando a whitelist' });
  }
}

export async function removeFromAirWhitelist(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM air_email_whitelist WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error eliminando de whitelist' });
  }
}

// ============================================
// AIR ROUTES CRUD
// Gestión de rutas aéreas de carga China
// ============================================

// ========== GET AIR ROUTES ==========
export async function getAirRoutes(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(`
      SELECT ar.*,
        (SELECT COUNT(*) FROM air_reception_drafts ard WHERE ard.route_id = ar.id) as drafts_count,
        (SELECT COUNT(*) FROM air_reception_drafts ard WHERE ard.route_id = ar.id AND ard.status = 'approved') as approved_count
      FROM air_routes ar
      ORDER BY ar.is_active DESC, ar.code ASC
    `);

    res.json({ success: true, routes: result.rows });
  } catch (error: any) {
    console.error('✈️ [AIR-ROUTES] Error obteniendo rutas:', error.message);
    res.status(500).json({ error: 'Error obteniendo rutas aéreas' });
  }
}

// ========== CREATE AIR ROUTE ==========
export async function createAirRoute(req: AuthRequest, res: Response) {
  try {
    const { code, name, origin_airport, origin_city, destination_airport, destination_city, carrier, flight_prefix, estimated_days, cost_per_kg_usd, email, notes } = req.body;

    if (!code || !origin_airport || !destination_airport) {
      return res.status(400).json({ error: 'Código, aeropuerto origen y aeropuerto destino son requeridos' });
    }

    // Verificar código único
    const existing = await pool.query('SELECT id FROM air_routes WHERE UPPER(code) = UPPER($1)', [code]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `Ya existe una ruta con código "${code.toUpperCase()}"` });
    }

    const result = await pool.query(`
      INSERT INTO air_routes (code, name, origin_airport, origin_city, destination_airport, destination_city, carrier, flight_prefix, estimated_days, cost_per_kg_usd, email, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      code.toUpperCase(),
      name || code.toUpperCase(),
      origin_airport.toUpperCase(),
      origin_city || '',
      destination_airport.toUpperCase(),
      destination_city || '',
      carrier || '',
      flight_prefix || '',
      estimated_days || 5,
      cost_per_kg_usd || null,
      email || null,
      notes || '',
    ]);

    console.log(`✈️ [AIR-ROUTES] Ruta creada: ${code.toUpperCase()}`);
    res.json({ success: true, route: result.rows[0] });
  } catch (error: any) {
    console.error('✈️ [AIR-ROUTES] Error creando ruta:', error.message);
    res.status(500).json({ error: 'Error creando ruta aérea' });
  }
}

// ========== UPDATE AIR ROUTE ==========
export async function updateAirRoute(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { code, name, origin_airport, origin_city, destination_airport, destination_city, carrier, flight_prefix, estimated_days, cost_per_kg_usd, email, notes, is_active } = req.body;

    const result = await pool.query(`
      UPDATE air_routes SET
        code = COALESCE($1, code),
        name = COALESCE($2, name),
        origin_airport = COALESCE($3, origin_airport),
        origin_city = COALESCE($4, origin_city),
        destination_airport = COALESCE($5, destination_airport),
        destination_city = COALESCE($6, destination_city),
        carrier = COALESCE($7, carrier),
        flight_prefix = COALESCE($8, flight_prefix),
        estimated_days = COALESCE($9, estimated_days),
        cost_per_kg_usd = $10,
        email = $11,
        notes = COALESCE($12, notes),
        is_active = COALESCE($13, is_active),
        updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `, [
      code ? code.toUpperCase() : null,
      name || null,
      origin_airport ? origin_airport.toUpperCase() : null,
      origin_city !== undefined ? origin_city : null,
      destination_airport ? destination_airport.toUpperCase() : null,
      destination_city !== undefined ? destination_city : null,
      carrier !== undefined ? carrier : null,
      flight_prefix !== undefined ? flight_prefix : null,
      estimated_days || null,
      cost_per_kg_usd !== undefined && cost_per_kg_usd !== '' ? cost_per_kg_usd : null,
      email !== undefined ? (email || null) : null,
      notes !== undefined ? notes : null,
      is_active !== undefined ? is_active : null,
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    console.log(`✈️ [AIR-ROUTES] Ruta actualizada: ${result.rows[0].code}`);
    res.json({ success: true, route: result.rows[0] });
  } catch (error: any) {
    console.error('✈️ [AIR-ROUTES] Error actualizando ruta:', error.message);
    res.status(500).json({ error: 'Error actualizando ruta aérea' });
  }
}

// ========== DELETE AIR ROUTE ==========
export async function deleteAirRoute(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    // Verificar si hay borradores asociados
    const draftsCheck = await pool.query('SELECT COUNT(*) as count FROM air_reception_drafts WHERE route_id = $1', [id]);
    if (parseInt(draftsCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: hay ${draftsCheck.rows[0].count} borradores asociados a esta ruta`,
      });
    }

    const result = await pool.query('DELETE FROM air_routes WHERE id = $1 RETURNING code', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    console.log(`✈️ [AIR-ROUTES] Ruta eliminada: ${result.rows[0].code}`);
    res.json({ success: true, message: `Ruta ${result.rows[0].code} eliminada` });
  } catch (error: any) {
    console.error('✈️ [AIR-ROUTES] Error eliminando ruta:', error.message);
    res.status(500).json({ error: 'Error eliminando ruta aérea' });
  }
}

// ========== GET AIR TARIFFS (all routes with their 4 tariff types) ==========
export async function getAirTariffs(req: AuthRequest, res: Response) {
  try {
    // Get all active routes with cost_per_kg_usd
    const routesResult = await pool.query(`
      SELECT id, code, name, origin_airport, origin_city, destination_airport, destination_city,
             cost_per_kg_usd, is_active
      FROM air_routes
      ORDER BY is_active DESC, code ASC
    `);

    // Get all tariffs
    const tariffsResult = await pool.query(`
      SELECT id, route_id, tariff_type, price_per_kg, is_active
      FROM air_tariffs
      ORDER BY route_id, tariff_type
    `);

    // Build a map of tariffs by route_id
    const tariffMap: Record<number, Record<string, { id: number; price_per_kg: number; is_active: boolean }>> = {};
    for (const t of tariffsResult.rows) {
      if (!tariffMap[t.route_id]) tariffMap[t.route_id] = {};
      const routeMap = tariffMap[t.route_id];
      if (routeMap) {
        routeMap[t.tariff_type] = {
          id: t.id,
          price_per_kg: parseFloat(t.price_per_kg),
          is_active: t.is_active,
        };
      }
    }

    // Build response with routes + their tariffs
    const routes = routesResult.rows.map((r: any) => ({
      ...r,
      cost_per_kg_usd: r.cost_per_kg_usd ? parseFloat(r.cost_per_kg_usd) : null,
      tariffs: {
        L: tariffMap[r.id]?.L || { id: null, price_per_kg: 0, is_active: false },
        G: tariffMap[r.id]?.G || { id: null, price_per_kg: 0, is_active: false },
        S: tariffMap[r.id]?.S || { id: null, price_per_kg: 0, is_active: false },
        F: tariffMap[r.id]?.F || { id: null, price_per_kg: 0, is_active: false },
      },
    }));

    res.json({ success: true, routes });
  } catch (error: any) {
    console.error('✈️ [AIR-TARIFFS] Error:', error.message);
    res.status(500).json({ error: 'Error obteniendo tarifas aéreas' });
  }
}

// ========== GET ROUTE PRICE HISTORY ==========
export async function getRoutePriceHistory(req: AuthRequest, res: Response) {
  try {
    const { routeId } = req.params;

    const result = await pool.query(`
      SELECT 
        h.id,
        h.cost_per_kg_usd,
        h.changed_at,
        h.notes,
        u.full_name as changed_by_name
      FROM air_route_price_history h
      LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.route_id = $1
      ORDER BY h.changed_at DESC
      LIMIT 50
    `, [routeId]);

    res.json({ success: true, history: result.rows });
  } catch (error: any) {
    console.error('✈️ [AIR-TARIFFS] Error obteniendo historial:', error.message);
    res.status(500).json({ error: 'Error obteniendo historial de precios' });
  }
}

// ========== SAVE AIR TARIFFS (bulk upsert for a route) ==========
export async function saveAirTariffs(req: AuthRequest, res: Response) {
  try {
    const { route_id, tariffs, cost_per_kg_usd } = req.body;
    const userId = req.user?.userId;

    if (!route_id) {
      return res.status(400).json({ error: 'route_id es requerido' });
    }

    // Update route's cost_per_kg_usd if provided
    if (cost_per_kg_usd !== undefined) {
      // Obtener el precio anterior para comparar
      const prevResult = await pool.query(
        'SELECT cost_per_kg_usd FROM air_routes WHERE id = $1',
        [route_id]
      );
      const prevPrice = prevResult.rows[0]?.cost_per_kg_usd;
      const newPrice = parseFloat(cost_per_kg_usd);

      // Actualizar el precio
      await pool.query(
        'UPDATE air_routes SET cost_per_kg_usd = $1, updated_at = NOW() WHERE id = $2',
        [newPrice, route_id]
      );

      // Guardar en historial si el precio cambió
      if (prevPrice !== newPrice) {
        await pool.query(
          `INSERT INTO air_route_price_history (route_id, cost_per_kg_usd, changed_by, changed_at, notes)
           VALUES ($1, $2, $3, NOW(), $4)`,
          [route_id, newPrice, userId, `Cambio de $${prevPrice || 0} a $${newPrice}`]
        );
      }
    }

    // Upsert each tariff type (price 0 => is_active = false)
    if (tariffs && typeof tariffs === 'object') {
      for (const type of ['L', 'G', 'S', 'F']) {
        if (tariffs[type] !== undefined) {
          const price = parseFloat(tariffs[type]) || 0;
          const isActive = price > 0;
          await pool.query(`
            INSERT INTO air_tariffs (route_id, tariff_type, price_per_kg, is_active, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (route_id, tariff_type)
            DO UPDATE SET price_per_kg = $3, is_active = $4, updated_at = NOW()
          `, [route_id, type, price, isActive]);
        }
      }
    }

    console.log(`✈️ [AIR-TARIFFS] Tarifas actualizadas para ruta #${route_id}`);
    res.json({ success: true, message: 'Tarifas guardadas' });
  } catch (error: any) {
    console.error('✈️ [AIR-TARIFFS] Error guardando:', error.message);
    res.status(500).json({ error: 'Error guardando tarifas aéreas' });
  }
}

// ========== GET AIR COST BRACKETS (supplier cost tiers for a route) ==========
export async function getAirCostBrackets(req: AuthRequest, res: Response) {
  try {
    const routeId = parseInt(req.params.routeId as string);
    if (!routeId) {
      return res.status(400).json({ error: 'routeId es requerido' });
    }

    // Get route info
    const routeResult = await pool.query(
      'SELECT id, code, name, origin_airport, destination_airport FROM air_routes WHERE id = $1',
      [routeId]
    );
    if (routeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    // Get all brackets for this route
    const bracketsResult = await pool.query(
      `SELECT id, tariff_type, min_kg, cost_per_kg
       FROM air_cost_brackets
       WHERE route_id = $1
       ORDER BY tariff_type, min_kg ASC`,
      [routeId]
    );

    // Group by tariff_type
    const brackets: Record<string, { min_kg: number; cost_per_kg: number }[]> = {
      L: [], G: [], S: [], F: []
    };
    for (const row of bracketsResult.rows) {
      const typeBrackets = brackets[row.tariff_type];
      if (typeBrackets) {
        typeBrackets.push({
          min_kg: parseFloat(row.min_kg),
          cost_per_kg: parseFloat(row.cost_per_kg),
        });
      }
    }

    res.json({
      success: true,
      route: routeResult.rows[0],
      brackets,
    });
  } catch (error: any) {
    console.error('✈️ [AIR-COST-BRACKETS] Error:', error.message);
    res.status(500).json({ error: 'Error obteniendo brackets de costo' });
  }
}

// ========== SAVE AIR COST BRACKETS (replace all brackets for a route) ==========
export async function saveAirCostBrackets(req: AuthRequest, res: Response) {
  try {
    const routeId = parseInt(req.params.routeId as string);
    if (!routeId) {
      return res.status(400).json({ error: 'routeId es requerido' });
    }

    const { brackets } = req.body;
    // brackets = { L: [{min_kg, cost_per_kg}, ...], G: [...], S: [...], F: [...] }

    if (!brackets || typeof brackets !== 'object') {
      return res.status(400).json({ error: 'brackets es requerido' });
    }

    // Delete existing brackets for this route, then insert new ones
    await pool.query('DELETE FROM air_cost_brackets WHERE route_id = $1', [routeId]);

    let inserted = 0;
    for (const type of ['L', 'G', 'S', 'F']) {
      const typeBrackets = brackets[type];
      if (Array.isArray(typeBrackets)) {
        for (const b of typeBrackets) {
          const minKg = parseFloat(b.min_kg);
          const costPerKg = parseFloat(b.cost_per_kg);
          if (minKg > 0 && costPerKg > 0) {
            await pool.query(
              `INSERT INTO air_cost_brackets (route_id, tariff_type, min_kg, cost_per_kg, updated_at)
               VALUES ($1, $2, $3, $4, NOW())`,
              [routeId, type, minKg, costPerKg]
            );
            inserted++;
          }
        }
      }
    }

    console.log(`✈️ [AIR-COST-BRACKETS] ${inserted} brackets guardados para ruta #${routeId}`);
    res.json({ success: true, message: `${inserted} brackets guardados`, count: inserted });
  } catch (error: any) {
    console.error('✈️ [AIR-COST-BRACKETS] Error guardando:', error.message);
    res.status(500).json({ error: 'Error guardando brackets de costo' });
  }
}

// ============================================
// TARIFAS PERSONALIZADAS POR CLIENTE
// ============================================

// GET: Buscar clientes para asignar tarifas
export async function searchClientsForTariffs(req: AuthRequest, res: Response) {
  try {
    const { search } = req.query;
    if (!search || String(search).length < 2) {
      return res.json({ success: true, clients: [] });
    }

    const searchTerm = `%${search}%`;

    // Buscar en users y legacy_clients
    const result = await pool.query(`
      SELECT 
        'user' as source,
        id,
        full_name as name,
        box_id,
        email
      FROM users
      WHERE (UPPER(full_name) LIKE UPPER($1) OR UPPER(box_id) LIKE UPPER($1) OR UPPER(email) LIKE UPPER($1))
        AND box_id IS NOT NULL
        AND box_id LIKE 'S%'
      UNION ALL
      SELECT 
        'legacy' as source,
        id,
        full_name as name,
        box_id,
        email
      FROM legacy_clients
      WHERE UPPER(full_name) LIKE UPPER($1) OR UPPER(box_id) LIKE UPPER($1) OR UPPER(email) LIKE UPPER($1)
      ORDER BY name
      LIMIT 20
    `, [searchTerm]);

    res.json({ success: true, clients: result.rows });
  } catch (error: any) {
    console.error('✈️ [AIR-CLIENT-TARIFFS] Error buscando clientes:', error.message);
    res.status(500).json({ error: 'Error buscando clientes' });
  }
}

// GET: Obtener todas las tarifas personalizadas de un cliente
export async function getClientTariffs(req: AuthRequest, res: Response) {
  try {
    const { userId, legacyId } = req.query;

    let whereClause = '';
    let params: any[] = [];

    if (userId) {
      whereClause = 'act.user_id = $1';
      params = [parseInt(String(userId))];
    } else if (legacyId) {
      whereClause = 'act.legacy_client_id = $1';
      params = [parseInt(String(legacyId))];
    } else {
      return res.status(400).json({ error: 'userId o legacyId es requerido' });
    }

    const result = await pool.query(`
      SELECT 
        act.id,
        act.route_id,
        act.tariff_type,
        act.price_per_kg,
        act.is_active,
        act.notes,
        act.created_at,
        ar.code as route_code,
        ar.name as route_name,
        ar.origin_airport,
        ar.destination_airport,
        at.price_per_kg as default_price
      FROM air_client_tariffs act
      JOIN air_routes ar ON ar.id = act.route_id
      LEFT JOIN air_tariffs at ON at.route_id = act.route_id AND at.tariff_type = act.tariff_type
      WHERE ${whereClause}
      ORDER BY ar.code, act.tariff_type
    `, params);

    res.json({ success: true, tariffs: result.rows });
  } catch (error: any) {
    console.error('✈️ [AIR-CLIENT-TARIFFS] Error obteniendo tarifas:', error.message);
    res.status(500).json({ error: 'Error obteniendo tarifas del cliente' });
  }
}

// GET: Obtener todos los clientes con tarifas personalizadas
export async function getClientsWithCustomTariffs(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(`
      SELECT DISTINCT
        COALESCE(u.id, 0) as user_id,
        COALESCE(lc.id, 0) as legacy_client_id,
        COALESCE(u.full_name, lc.full_name) as name,
        COALESCE(u.box_id, lc.box_id) as box_id,
        COALESCE(u.email, lc.email) as email,
        CASE WHEN u.id IS NOT NULL THEN 'user' ELSE 'legacy' END as source,
        COUNT(*) as tariffs_count,
        STRING_AGG(DISTINCT ar.code, ', ') as routes
      FROM air_client_tariffs act
      LEFT JOIN users u ON act.user_id = u.id
      LEFT JOIN legacy_clients lc ON act.legacy_client_id = lc.id
      LEFT JOIN air_routes ar ON ar.id = act.route_id
      GROUP BY u.id, lc.id, u.full_name, lc.full_name, u.box_id, lc.box_id, u.email, lc.email
      ORDER BY name
    `);

    res.json({ success: true, clients: result.rows });
  } catch (error: any) {
    console.error('✈️ [AIR-CLIENT-TARIFFS] Error:', error.message);
    res.status(500).json({ error: 'Error obteniendo clientes con tarifas' });
  }
}

// POST: Guardar/actualizar tarifa personalizada para cliente
export async function saveClientTariff(req: AuthRequest, res: Response) {
  try {
    const { user_id, legacy_client_id, route_id, tariff_type, price_per_kg, notes } = req.body;
    const createdBy = (req as any).user?.userId;

    if (!route_id || !tariff_type || price_per_kg === undefined) {
      return res.status(400).json({ error: 'route_id, tariff_type y price_per_kg son requeridos' });
    }

    if (!user_id && !legacy_client_id) {
      return res.status(400).json({ error: 'user_id o legacy_client_id es requerido' });
    }

    if (!['L', 'G', 'S', 'F'].includes(tariff_type)) {
      return res.status(400).json({ error: 'tariff_type debe ser L, G, S o F' });
    }

    const price = parseFloat(price_per_kg);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'price_per_kg debe ser un número válido' });
    }

    // Upsert
    if (user_id) {
      await pool.query(`
        INSERT INTO air_client_tariffs (user_id, route_id, tariff_type, price_per_kg, notes, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id, route_id, tariff_type)
        DO UPDATE SET price_per_kg = $4, notes = $5, updated_at = NOW()
      `, [user_id, route_id, tariff_type, price, notes || null, createdBy]);
    } else {
      await pool.query(`
        INSERT INTO air_client_tariffs (legacy_client_id, route_id, tariff_type, price_per_kg, notes, created_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (legacy_client_id, route_id, tariff_type)
        DO UPDATE SET price_per_kg = $4, notes = $5, updated_at = NOW()
      `, [legacy_client_id, route_id, tariff_type, price, notes || null, createdBy]);
    }

    console.log(`✈️ [AIR-CLIENT-TARIFFS] Tarifa ${tariff_type} guardada para cliente ${user_id || legacy_client_id}, ruta ${route_id}`);
    res.json({ success: true, message: 'Tarifa personalizada guardada' });
  } catch (error: any) {
    console.error('✈️ [AIR-CLIENT-TARIFFS] Error guardando:', error.message);
    res.status(500).json({ error: 'Error guardando tarifa personalizada' });
  }
}

// POST: Guardar múltiples tarifas para un cliente (bulk)
export async function saveClientTariffsBulk(req: AuthRequest, res: Response): Promise<any> {
  try {
    const { user_id, legacy_client_id, tariffs } = req.body;
    const createdBy = (req as any).user?.userId;

    if (!user_id && !legacy_client_id) {
      return res.status(400).json({ error: 'user_id o legacy_client_id es requerido' });
    }

    if (!Array.isArray(tariffs) || tariffs.length === 0) {
      return res.status(400).json({ error: 'tariffs debe ser un array con al menos un elemento' });
    }

    let saved = 0;
    for (const t of tariffs) {
      const { route_id, tariff_type, price_per_kg, notes } = t;
      if (!route_id || !tariff_type || price_per_kg === undefined) continue;
      if (!['L', 'G', 'S', 'F'].includes(tariff_type)) continue;

      const price = parseFloat(price_per_kg);
      if (isNaN(price) || price < 0) continue;

      if (user_id) {
        await pool.query(`
          INSERT INTO air_client_tariffs (user_id, route_id, tariff_type, price_per_kg, notes, created_by, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (user_id, route_id, tariff_type)
          DO UPDATE SET price_per_kg = $4, notes = $5, updated_at = NOW()
        `, [user_id, route_id, tariff_type, price, notes || null, createdBy]);
      } else {
        await pool.query(`
          INSERT INTO air_client_tariffs (legacy_client_id, route_id, tariff_type, price_per_kg, notes, created_by, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (legacy_client_id, route_id, tariff_type)
          DO UPDATE SET price_per_kg = $4, notes = $5, updated_at = NOW()
        `, [legacy_client_id, route_id, tariff_type, price, notes || null, createdBy]);
      }
      saved++;
    }

    console.log(`✈️ [AIR-CLIENT-TARIFFS] ${saved} tarifas guardadas para cliente ${user_id || legacy_client_id}`);
    res.json({ success: true, message: `${saved} tarifas guardadas`, count: saved });
  } catch (error: any) {
    console.error('✈️ [AIR-CLIENT-TARIFFS] Error guardando bulk:', error.message);
    res.status(500).json({ error: 'Error guardando tarifas' });
  }
}

// DELETE: Eliminar tarifa personalizada
export async function deleteClientTariff(req: AuthRequest, res: Response): Promise<any> {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) {
      return res.status(400).json({ error: 'ID es requerido' });
    }

    await pool.query('DELETE FROM air_client_tariffs WHERE id = $1', [id]);
    
    console.log(`✈️ [AIR-CLIENT-TARIFFS] Tarifa #${id} eliminada`);
    res.json({ success: true, message: 'Tarifa eliminada' });
  } catch (error: any) {
    console.error('✈️ [AIR-CLIENT-TARIFFS] Error eliminando:', error.message);
    res.status(500).json({ error: 'Error eliminando tarifa' });
  }
}
