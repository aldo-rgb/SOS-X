// ============================================
// CONTROLADOR DE CORREOS ENTRANTES (INBOUND EMAIL)
// Procesa correos de documentos@entregax.com (FCL) y consolidacion@entregax.com (LCL)
// Usa Mailgun Inbound Routes para recibir webhooks
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import OpenAI from 'openai';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Lazy initialization - only create OpenAI client when API key exists
let openaiInstance: OpenAI | null = null;
const getOpenAI = (): OpenAI => {
    if (!openaiInstance) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY no configurada');
        }
        openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiInstance;
};

// Proxy para mantener compatibilidad con código existente (openai.chat.completions.create)
const openai = new Proxy({} as OpenAI, {
    get(_, prop) {
        return getOpenAI()[prop as keyof OpenAI];
    }
});

// Secreto de Mailgun para verificar webhooks
const MAILGUN_SIGNING_KEY = process.env.MAILGUN_SIGNING_KEY || '';

// ========== TIPOS ==========

interface MailgunAttachment {
  url: string;
  'content-type': string;
  name: string;
  size: number;
}

interface MailgunWebhookBody {
  sender: string;
  from: string;
  subject: string;
  recipient: string;
  'body-plain'?: string;
  'body-html'?: string;
  attachments?: string; // JSON string de attachments
  'attachment-count'?: string;
  timestamp: string;
  token: string;
  signature: string;
}

// ========== UTILIDADES ==========

/**
 * Verificar firma de Mailgun (seguridad)
 */
const verifyMailgunSignature = (timestamp: string, token: string, signature: string): boolean => {
  if (!MAILGUN_SIGNING_KEY) {
    console.warn('⚠️ MAILGUN_SIGNING_KEY no configurado - modo desarrollo');
    return true; // En desarrollo permitimos sin verificar
  }
  
  const encodedToken = crypto
    .createHmac('sha256', MAILGUN_SIGNING_KEY)
    .update(timestamp + token)
    .digest('hex');
  
  return encodedToken === signature;
};

/**
 * Verificar que el remitente esté en whitelist
 */
const isWhitelistedSender = async (fromEmail: string): Promise<boolean> => {
  const result = await pool.query(`
    SELECT 1 FROM email_whitelist 
    WHERE is_active = TRUE 
    AND $1 ILIKE '%' || email_pattern
    LIMIT 1
  `, [fromEmail]);
  
  return result.rows.length > 0;
};

/**
 * Determinar el tipo de documento por el correo receptor
 * documentos@entregax.com = FCL (Full Container Load)
 * consolidacion@entregax.com = LCL (Less than Container Load)
 */
const getDocumentType = (recipient: string): 'FCL' | 'LCL' | 'LOG' | 'BL' | null => {
  const email = recipient.toLowerCase();
  if (email.includes('documentos@')) return 'FCL';
  if (email.includes('consolidacion@')) return 'LCL';
  // Mantener compatibilidad con correos anteriores
  if (email.includes('send@')) return 'FCL';
  if (email.includes('log@')) return 'LCL';
  return null;
};

/**
 * Extraer código de ruta del subject del correo
 * Busca patrones como CHN-LAX-ELP-MEX o similar
 */
const extractRouteFromSubject = async (subject: string): Promise<{ routeId: number | null; routeCode: string | null }> => {
  if (!subject) return { routeId: null, routeCode: null };
  
  // Buscar patrones de ruta (3+ segmentos separados por guiones, ej: CHN-LAX-ELP-MEX)
  const routePattern = /\b([A-Z]{2,4}(?:-[A-Z]{2,4}){2,})\b/gi;
  const matches = subject.match(routePattern);
  
  if (!matches || matches.length === 0) {
    console.log('📍 No se encontró patrón de ruta en subject:', subject);
    return { routeId: null, routeCode: null };
  }

  // Intentar hacer match con rutas existentes
  for (const routeCode of matches) {
    const result = await pool.query(
      'SELECT id, code FROM maritime_routes WHERE UPPER(code) = UPPER($1) AND is_active = TRUE LIMIT 1',
      [routeCode.toUpperCase()]
    );
    
    if (result.rows.length > 0) {
      console.log(`📍 Ruta encontrada: ${result.rows[0].code} (ID: ${result.rows[0].id})`);
      return { routeId: result.rows[0].id, routeCode: result.rows[0].code };
    }
  }

  console.log('📍 Código de ruta no registrado:', matches[0]);
  return { routeId: null, routeCode: matches[0]?.toUpperCase() || null };
};

/**
 * Extraer código de cliente del subject del correo (para FCL)
 * Busca patrones como S3117, S1234, etc. (código Sanky)
 * Formato esperado: [RUTA] - [CLIENTE] - BL [NÚMERO] - [NAVIERA]
 * Ejemplo: CHN-LZC-MEX - S3117 - BL SA26010033 - COSCO
 */
const extractClientFromSubject = async (subject: string): Promise<{ 
  clientCode: string | null; 
  clientId: number | null;
  clientName: string | null;
}> => {
  if (!subject) return { clientCode: null, clientId: null, clientName: null };
  
  // Buscar patrones de código de cliente: S seguido de números (S3117, S1234, etc.)
  // También buscar patrones como "S 3117" con espacio
  const clientPattern = /\bS\s?(\d{3,5})\b/gi;
  const matches = subject.match(clientPattern);
  
  if (!matches || matches.length === 0) {
    console.log('👤 No se encontró código de cliente en subject:', subject);
    return { clientCode: null, clientId: null, clientName: null };
  }

  // Normalizar el código (quitar espacios)
  const rawCode = matches[0].replace(/\s+/g, '').toUpperCase();
  console.log('👤 Código de cliente encontrado:', rawCode);

  // Buscar en legacy_clients
  const result = await pool.query(`
    SELECT id, codigo_cliente, nombre 
    FROM legacy_clients 
    WHERE UPPER(REPLACE(codigo_cliente, ' ', '')) = $1
    LIMIT 1
  `, [rawCode]);
  
  if (result.rows.length > 0) {
    console.log(`👤 Cliente encontrado: ${result.rows[0].nombre} (${result.rows[0].codigo_cliente})`);
    return { 
      clientCode: result.rows[0].codigo_cliente, 
      clientId: result.rows[0].id,
      clientName: result.rows[0].nombre
    };
  }

  // Si no se encuentra, devolver el código raw
  console.log('👤 Cliente no encontrado en BD, código:', rawCode);
  return { clientCode: rawCode, clientId: null, clientName: null };
};

/**
 * Interfaz para datos extraídos del SUMMARY Excel
 */
interface SummaryLogEntry {
  log: string;
  clientCode: string;
  clientName: string;
  legacyClientId: number | null; // ID en legacy_clients para relacionar
  tipo: string; // Genérico, Sensible, Logotipo
  hasBattery: boolean;
  hasLiquid: boolean;
  isPickup: boolean;
  boxes: number | null;
  weight: number | null;
  volume: number | null;
  description: string;
}

/**
 * Procesar archivo Excel SUMMARY para extraer LOGs
 * Formato detectado del Excel:
 * Columna A: Operador (LOGINPC, NANCY)
 * Columna B: Código LOG (LOG25CNMX01358, etc.)
 * Columna C: Tipo (B=Básico, S=Sensible, vacío=Genérico)
 * Columna D: Código Cliente (S105, S883, S191, etc.)
 * Columna E: Contacto/Email
 * Columna F: Descripción mercancía
 * Columna G: Packages/Cajas
 * Columna H: Valor
 * Columna I: Peso (KGS)
 * Columna J: Volumen (CBM)
 * Columna L: Marcas especiales (BATTERY)
 * Columna N: Almacén (AIR/SEA warehouse)
 * Columna O: Notas (PICK UP)
 */
const processSummaryExcel = async (fileBuffer: Buffer): Promise<SummaryLogEntry[]> => {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    console.log('📊 Excel sheets:', workbook.SheetNames);
    
    const sheetName = workbook.SheetNames[0] || 'Sheet1';
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      console.log('⚠️ No se encontró worksheet en el Excel');
      return [];
    }
    
    // Convertir a JSON manteniendo headers
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    if (rawData.length < 2) {
      console.log('⚠️ Excel SUMMARY vacío o sin datos');
      return [];
    }

    console.log('📊 Procesando Excel SUMMARY:', { filas: rawData.length, columnas: rawData[0]?.length });
    console.log('📊 Primeras 5 filas del Excel:');
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      console.log(`  Fila ${i}:`, rawData[i]?.slice(0, 10));
    }
    
    const entries: SummaryLogEntry[] = [];
    const seenLogs = new Set<string>();
    
    // Detectar formato del Excel buscando patrones en las primeras filas
    let format = 'unknown';
    let logColIdx = -1;
    let typeColIdx = -1;
    let clientColIdx = -1;
    let contactColIdx = -1;
    let descColIdx = -1;
    let packagesColIdx = -1;
    let valueColIdx = -1;
    let weightColIdx = -1;
    let volumeColIdx = -1;
    
    // Buscar el formato detectando patrones
    for (let i = 0; i < Math.min(15, rawData.length); i++) {
      const row = rawData[i];
      if (!row || row.length < 3) continue;
      
      // Buscar si alguna celda tiene formato LOG
      for (let j = 0; j < Math.min(10, row.length); j++) {
        const cellVal = String(row[j] || '').toUpperCase().trim();
        
        // Detectar columna del LOG por patrón
        if (cellVal.match(/^LOG\d{2}[A-Z]{2,4}\d{4,}/i)) {
          logColIdx = j;
          format = 'direct';
          console.log(`📊 Formato detectado: LOG directo en columna ${j} (${cellVal})`);
          break;
        }
        
        // Detectar headers tradicionales
        if (cellVal === 'W/H NO.' || cellVal === 'W/H NO' || cellVal === 'WH NO') {
          logColIdx = j;
          format = 'headers';
          console.log(`📊 Formato detectado: Headers con W/H NO en columna ${j}`);
          break;
        }
      }
      
      if (format !== 'unknown') break;
    }
    
    // Configurar columnas según el formato detectado
    if (format === 'direct' && logColIdx >= 0) {
      // Formato: LOGINPC | LOG | B/S | Cliente | Contacto | Desc | Pkgs | Valor | Peso | Vol
      // Ajustar basado en la columna del LOG detectada
      // Si LOG está en columna 1 (B), entonces:
      typeColIdx = logColIdx + 1;     // C = Tipo
      clientColIdx = logColIdx + 2;   // D = Cliente  
      contactColIdx = logColIdx + 3;  // E = Contacto
      descColIdx = logColIdx + 4;     // F = Descripción
      packagesColIdx = logColIdx + 5; // G = Packages
      valueColIdx = logColIdx + 6;    // H = Valor
      weightColIdx = logColIdx + 7;   // I = Peso
      volumeColIdx = logColIdx + 8;   // J = Volumen
    } else if (format === 'headers' && logColIdx >= 0) {
      // Formato con headers: ITEM | BELONGS | W/H NO. | B | SHIPPING MARKS | FACTORY | COMMODITY | 退税 | PKGS | GROSS WEIGHT | CBM
      // W/H NO está en columna 2 (índice desde 0)
      typeColIdx = logColIdx + 1;       // Col 3: B (tipo S/B)
      clientColIdx = logColIdx + 2;     // Col 4: SHIPPING MARKS (código cliente)
      contactColIdx = logColIdx + 3;    // Col 5: FACTORY (contacto/email)
      descColIdx = logColIdx + 4;       // Col 6: COMMODITY (descripción)
      // Col 7: 退税(Y/N) - no nos interesa
      packagesColIdx = logColIdx + 6;   // Col 8: PKGS (cajas)
      weightColIdx = logColIdx + 7;     // Col 9: GROSS WEIGHT (peso)
      volumeColIdx = logColIdx + 8;     // Col 10: CBM (volumen)
    }
    
    console.log('📊 Configuración de columnas:', {
      format,
      logColIdx,
      typeColIdx,
      clientColIdx,
      contactColIdx,
      descColIdx,
      packagesColIdx,
      weightColIdx,
      volumeColIdx
    });
    
    // Procesar todas las filas buscando LOGs válidos
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length < 3) continue;
      
      // Buscar el LOG en la columna detectada o en cualquier columna
      let logValue = '';
      let logFoundCol = logColIdx;
      
      if (logColIdx >= 0 && row[logColIdx]) {
        logValue = String(row[logColIdx] || '').toUpperCase().trim();
      }
      
      // Si no encontramos LOG en la columna esperada, buscar en las primeras columnas
      if (!logValue.match(/^LOG\d{2}[A-Z]{2,4}\d{4,}/i)) {
        for (let j = 0; j < Math.min(5, row.length); j++) {
          const cellVal = String(row[j] || '').toUpperCase().trim();
          if (cellVal.match(/^LOG\d{2}[A-Z]{2,4}\d{4,}/i)) {
            logValue = cellVal;
            logFoundCol = j;
            break;
          }
        }
      }
      
      // Validar que sea un LOG válido (solo LOG, no LVS)
      if (!logValue.match(/^LOG\d{2}[A-Z]{2,4}\d{4,}/i)) {
        // Si es LVS, descartarlo silenciosamente
        const firstCells = row.slice(0, 5).map(c => String(c || '').toUpperCase().trim());
        if (firstCells.some(c => c.match(/^LVS/i))) {
          continue; // Descartar LVS
        }
        continue;
      }
      
      // Evitar duplicados
      if (seenLogs.has(logValue)) continue;
      seenLogs.add(logValue);
      
      // Usar los índices de columna configurados según el formato
      // typeColIdx, clientColIdx, etc. ya están configurados arriba según el formato detectado
      const tIdx = typeColIdx >= 0 ? typeColIdx : logFoundCol + 1;
      const cIdx = clientColIdx >= 0 ? clientColIdx : logFoundCol + 2;
      const ctIdx = contactColIdx >= 0 ? contactColIdx : logFoundCol + 3;
      const dIdx = descColIdx >= 0 ? descColIdx : logFoundCol + 4;
      const pIdx = packagesColIdx >= 0 ? packagesColIdx : logFoundCol + 5;
      const vIdx = valueColIdx >= 0 ? valueColIdx : logFoundCol + 6;
      const wIdx = weightColIdx >= 0 ? weightColIdx : logFoundCol + 7;
      const volIdx = volumeColIdx >= 0 ? volumeColIdx : logFoundCol + 8;
      
      // Debug: mostrar qué índices y valores se están usando
      console.log(`  📋 Fila ${i}: LOG=${logValue}, Indices: type=${tIdx}, pkgs=${pIdx}, vol=${volIdx}`);
      console.log(`     Fila completa: ${JSON.stringify(row)}`);
      console.log(`     Valor en posición tipo [${tIdx}]: "${row[tIdx]}" (tipo JS: ${typeof row[tIdx]})`);
      
      // Obtener valores
      const typeValue = tIdx < row.length ? String(row[tIdx] || '').toUpperCase().trim() : '';
      const clientCode = cIdx < row.length ? String(row[cIdx] || '').trim() : '';
      const contact = ctIdx < row.length ? String(row[ctIdx] || '').trim() : '';
      const description = dIdx < row.length ? String(row[dIdx] || '').trim() : '';
      const packages = pIdx < row.length ? parseFloat(String(row[pIdx] || '0').replace(/[^\d.]/g, '')) || null : null;
      const value = vIdx < row.length ? parseFloat(String(row[vIdx] || '0').replace(/[^\d.]/g, '')) || null : null;
      const weight = wIdx < row.length ? parseFloat(String(row[wIdx] || '0').replace(/[^\d.]/g, '')) || null : null;
      const volume = volIdx < row.length ? parseFloat(String(row[volIdx] || '0').replace(/[^\d.]/g, '')) || null : null;
      
      // Determinar tipo de mercancía
      // S = Sensible, B = Brand/Logotipo, vacío = Genérico
      let tipo = 'Genérico';
      if (typeValue === 'S' || typeValue.includes('SENS')) {
        tipo = 'Sensible';
      } else if (typeValue === 'B' || typeValue === 'BRAND' || typeValue.includes('LOGO')) {
        tipo = 'Logotipo'; // B = Brand/Marca con logo
      } else if (typeValue === 'L') {
        tipo = 'Logotipo';
      }
      
      // Buscar BATTERY, LIQUID y PICKUP en toda la fila (inglés, español, chino)
      let hasBattery = false;
      let hasLiquid = false;
      let isPickup = false;
      
      for (let col = 0; col < row.length; col++) {
        const cellVal = String(row[col] || '').trim();
        const cellUpper = cellVal.toUpperCase();
        
        // Batería: BATTERY, BATERIA, 带电, 带电池
        if (cellUpper === 'BATTERY' || cellUpper === 'BATERIA' || 
            cellVal === '带电' || cellVal === '带电池' || cellVal.includes('带电')) {
          hasBattery = true;
        }
        
        // Líquido: LIQUID, LIQUIDO, 液体
        if (cellUpper === 'LIQUID' || cellUpper === 'LIQUIDO' || 
            cellVal === '液体' || cellVal.includes('液体')) {
          hasLiquid = true;
        }
        
        // Pickup: PICK UP, PICKUP, 自提, 提货
        if (cellUpper === 'PICK UP' || cellUpper === 'PICKUP' || 
            cellVal === '自提' || cellVal === '提货' || cellVal.includes('自提')) {
          isPickup = true;
        }
      }

      const entry: SummaryLogEntry = {
        log: logValue,
        clientCode: clientCode,
        clientName: contact,
        legacyClientId: null,
        tipo,
        hasBattery,
        hasLiquid,
        isPickup,
        boxes: packages,
        weight: weight,
        volume: volume,
        description: description
      };

      entries.push(entry);
      console.log(`  ✅ LOG: ${logValue} | Cliente: ${clientCode} | Tipo: ${tipo} | Desc: ${description?.substring(0, 20)} | Pkgs: ${packages} | Peso: ${weight} | Vol: ${volume} | Battery: ${hasBattery} | Pickup: ${isPickup}`);
    }

    console.log(`✅ Procesados ${entries.length} LOGs del SUMMARY`);
    return entries;

  } catch (error) {
    console.error('❌ Error procesando Excel SUMMARY:', error);
    return [];
  }
};

/**
 * Buscar cliente por código en legacy_clients
 * Busca múltiples variantes: S3117, 3117, S3117G, S3117L, etc.
 */
const findClientByLogCode = async (logEntries: SummaryLogEntry[]): Promise<SummaryLogEntry[]> => {
  for (const entry of logEntries) {
    // Intentar extraer código de cliente del LOG o del campo clientCode
    let codeToSearch = entry.clientCode || '';
    
    if (!codeToSearch) continue;
    
    // Los códigos de cliente Sanky suelen ser S#### (S105, S883, S1509, etc.)
    // También pueden venir con sufijos como S3117G, S3117L
    
    // Limpiar el código - pero mantener la S si existe
    let cleanCode = codeToSearch.trim();
    const hasPrefix = cleanCode.toUpperCase().startsWith('S');
    cleanCode = cleanCode.replace(/^S\s*/i, '').trim(); // Quitar prefijo S
    cleanCode = cleanCode.replace(/[GL]$/i, '').trim(); // Quitar sufijo G o L
    cleanCode = cleanCode.replace(/\D/g, ''); // Solo números
    
    if (!cleanCode) continue;
    
    console.log(`🔍 Buscando cliente para código: ${codeToSearch} -> limpio: ${cleanCode}`);
    
    // Buscar en legacy_clients con múltiples variantes
    // La columna es box_id, no codigo_cliente
    try {
      const result = await pool.query(`
        SELECT id, box_id, full_name, email
        FROM legacy_clients 
        WHERE box_id ILIKE $1 
           OR box_id ILIKE $2 
           OR box_id ILIKE $3
           OR box_id ILIKE $4
           OR box_id ILIKE $5
           OR box_id ILIKE $6
           OR REPLACE(box_id, ' ', '') ILIKE $7
        LIMIT 1
      `, [
        cleanCode,           // Exacto: 105
        `S${cleanCode}`,     // Con prefijo: S105
        `S${cleanCode}%`,    // Con prefijo y sufijo: S105G, S105L
        `S ${cleanCode}`,    // Con espacio: S 105
        `S ${cleanCode}%`,   // Con espacio y sufijo
        `%${cleanCode}`,     // Terminando en: ...105
        `S${cleanCode}`      // Sin espacios
      ]);
      
      if (result.rows.length > 0) {
        const client = result.rows[0];
        entry.legacyClientId = client.id;
        entry.clientName = client.full_name;
        console.log(`✅ Cliente encontrado: ${client.full_name} (${client.box_id}) - ID: ${client.id}`);
      } else {
        console.log(`⚠️ Cliente no encontrado para código: ${codeToSearch} (limpio: ${cleanCode})`);
      }
    } catch (dbError: any) {
      // Si hay error de DB, continuar sin vincular
      console.log(`⚠️ Error buscando cliente (${dbError.message?.substring(0, 50)}), continuando sin vincular`);
    }
  }
  return logEntries;
};

/**
 * Extraer datos de LOG usando IA (sin Response)
 */
const extractLogDataFromUrl = async (pdfUrl: string): Promise<any> => {
  const prompt = `Analiza este documento de recepción marítima (LOG de Sanky).
Extrae la información en formato JSON con estos campos:
{
  "logNumber": "número del LOG (ej: L-12345)",
  "boxCount": número de cajas/bultos,
  "weightKg": peso en kilogramos,
  "volumeCbm": volumen en metros cúbicos,
  "clientCodeRaw": "código del cliente con sufijo (ej: S3117L o S3117G)",
  "brandType": "Logo" si termina en L, "Generico" si termina en G,
  "productDescription": "descripción breve del producto"
}

Si no puedes leer algún campo, ponlo como null.
Responde SOLO con el JSON, sin explicaciones.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Eres un asistente experto en logística marítima que extrae datos de documentos." },
      { role: "user", content: [
        { type: "text", text: prompt }, 
        { type: "image_url", image_url: { url: pdfUrl } }
      ] }
    ],
    max_tokens: 500,
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0]?.message?.content || '{}');
};

/**
 * Convertir PDF a imagen usando Puppeteer (mejor calidad)
 * Genera múltiples páginas si es necesario
 */
const convertPdfToImage = async (pdfData: string | Buffer): Promise<string> => {
  let browser = null;
  let tempPdfPath = '';
  
  try {
    let pdfBuffer: Buffer;
    
    if (typeof pdfData === 'string') {
      if (pdfData.startsWith('data:')) {
        const commaIndex = pdfData.indexOf(',');
        const base64Data = commaIndex > -1 ? pdfData.substring(commaIndex + 1) : pdfData;
        pdfBuffer = Buffer.from(base64Data, 'base64');
      } else {
        pdfBuffer = Buffer.from(pdfData, 'base64');
      }
    } else {
      pdfBuffer = pdfData;
    }
    
    console.log('📄 PDF Buffer size:', pdfBuffer.length, 'bytes');
    
    // Guardar PDF temporalmente
    tempPdfPath = path.join(os.tmpdir(), `bl_${Date.now()}.pdf`);
    fs.writeFileSync(tempPdfPath, pdfBuffer);
    console.log('📄 PDF guardado en:', tempPdfPath);
    
    // Iniciar Puppeteer con Chrome del sistema
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--allow-file-access-from-files',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Configurar viewport grande para alta resolución
    await page.setViewport({ 
      width: 1700,
      height: 2200,
      deviceScaleFactor: 2
    });
    
    // Navegar al PDF
    console.log('📄 Navegando al PDF...');
    await page.goto(`file://${tempPdfPath}`, { 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    // Esperar a que el contenido esté listo (Chrome PDF viewer)
    console.log('⏳ Esperando renderizado del PDF...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Intentar múltiples capturas hasta obtener una buena
    let screenshotBuffer: Buffer | null = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`📸 Intento de captura ${attempts}/${maxAttempts}...`);
      
      // Capturar screenshot
      const buffer = await page.screenshot({ 
        type: 'png',
        fullPage: true,
        encoding: 'binary'
      });
      
      const size = Buffer.from(buffer).length;
      console.log(`   Tamaño captura: ${size} bytes`);
      
      // Si la captura es mayor a 500KB, probablemente es buena
      if (size > 500000) {
        screenshotBuffer = Buffer.from(buffer);
        console.log('✅ Captura exitosa con contenido');
        break;
      }
      
      // Si es muy pequeña, esperar más y reintentar
      if (attempts < maxAttempts) {
        console.log('⏳ Imagen pequeña, esperando más...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Si ninguna captura fue buena, usar la última
    if (!screenshotBuffer) {
      console.warn('⚠️ No se obtuvo captura grande, usando última disponible');
      const buffer = await page.screenshot({ 
        type: 'png',
        fullPage: true,
        encoding: 'binary'
      });
      screenshotBuffer = Buffer.from(buffer);
    }
    
    const pngBase64 = screenshotBuffer.toString('base64');
    console.log('✅ PNG generado con Puppeteer, tamaño base64:', pngBase64.length, 'caracteres');
    
    return `data:image/png;base64,${pngBase64}`;
    
  } catch (error) {
    console.error('❌ Error convirtiendo PDF con Puppeteer:', error);
    throw error;
  } finally {
    // Cleanup
    if (browser) {
      await browser.close();
    }
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }
  }
};

/**
 * Extraer datos de BL usando IA (sin Response)
 */
const extractBlDataFromUrl = async (pdfUrl: string): Promise<any> => {
  let imageUrl = pdfUrl;
  
  // Si es un PDF, convertirlo a imagen primero
  if (pdfUrl.includes('application/pdf') || pdfUrl.includes('.pdf')) {
    console.log('📄 Convirtiendo PDF a imagen para análisis con IA...');
    try {
      imageUrl = await convertPdfToImage(pdfUrl);
      console.log('✅ PDF convertido a imagen exitosamente, longitud:', imageUrl.length);
    } catch (convError) {
      console.error('❌ Error convirtiendo PDF:', convError);
      throw convError;
    }
  } else {
    console.log('📸 No es PDF, usando directamente como imagen');
  }
  
  const prompt = `Eres un experto en Bills of Lading marítimos. Extrae los datos de este documento con MÁXIMA PRECISIÓN.

ESTRUCTURA TÍPICA DE UN BL (de arriba a abajo, izquierda a derecha):

PARTE SUPERIOR IZQUIERDA:
- Shipper: Primera sección, empresa que envía (ej: "SMART ASIA INTL CO., LIMITED")
- Consignee: Segunda sección, JUSTO DEBAJO del Shipper. Es el DESTINATARIO FINAL, 
  generalmente incluye nombre de empresa/persona + RFC + dirección en México
  ⚠️ SOLO EXTRAER: Nombre y RFC (sin la dirección)
  Ejemplo: "URBAN WOD CF, RFC: UWC220711HX0" (NO incluir la calle ni resto de dirección)
  ⚠️ NO CONFUNDIR con "Shipping Agent" que aparece más abajo en el documento
- Notify Party: Tercera sección, debajo del Consignee

PARTE SUPERIOR DERECHA:
- B/L No.: Número del BL (ej: 024G506094)
- S/O No.: Número de booking (ej: LZC60110024)

PARTE CENTRAL:
- Vessel/Voyage: Buque y número de viaje (ej: "SHUN FENG 31 / 260126000000")
- Port of Loading: Puerto origen (ej: "NANSHA NEW PORT, CHINA")
- Port of Discharge: Puerto destino (ej: "LAZARO CARDENAS, MEXICO")

PARTE INFERIOR:
- Container No.: Formato XXXX1234567 (ej: WHSU6463903)
- Packages/Weight/Volume: Datos de carga
- Laden on Board: Fecha de embarque

⚠️ IMPORTANTE - NO CONFUNDIR:
- El "SHIPPING AGENT REFERENCES" (ej: WAN HAI LINES MEXICO, S.A. DE C.V...) NO es el Consignee
- El Consignee es el DESTINATARIO que está en la parte superior izquierda, bajo "Shipper"
- Busca el campo etiquetado específicamente como "Consignee"

EXTRAE Y DEVUELVE ESTE JSON:
{
  "blNumber": "B/L No. exacto",
  "soNumber": "S/O No. exacto",
  "containerNumber": "Solo 11 caracteres (4 letras + 7 números)",
  "shipper": "Datos del Shipper (parte superior izquierda)",
  "consignee": "SOLO Nombre + RFC del Consignee (SIN dirección, ej: 'EMPRESA XYZ, RFC: ABC123456XY0')",
  "notifyParty": "Notify party",
  "vesselName": "Nombre del buque",
  "voyageNumber": "Número de viaje",
  "portOfLoading": "Puerto de carga",
  "portOfDischarge": "Puerto de descarga",
  "placeOfDelivery": "Lugar de entrega",
  "eta": "Fecha ETA YYYY-MM-DD o null",
  "ladenOnBoard": "Fecha embarque YYYY-MM-DD",
  "packages": número de bultos (integer),
  "weightKg": peso en kg (número sin comas),
  "volumeCbm": volumen CBM (número decimal),
  "goodsDescription": "Descripción mercancía",
  "carrier": "Línea naviera (del logo: WAN HAI, COSCO, etc.)"
}

Responde SOLO con JSON válido, sin explicaciones.`;

  console.log('📤 Enviando imagen a OpenAI GPT-4o Vision...');
  console.log('📤 Tamaño de imagen enviada:', imageUrl.length, 'caracteres');

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { 
        role: "system", 
        content: "Eres un experto en documentos de comercio internacional marítimo, especialmente Bills of Lading (BL). SIEMPRE respondes con JSON válido sin markdown. Extraes datos con precisión máxima, especialmente B/L Number, S/O Number, Container Number, peso y volumen." 
      },
      { 
        role: "user", 
        content: [
          { type: "text", text: prompt }, 
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
        ] 
      }
    ],
    max_tokens: 2500,
    temperature: 0.1,  // Baja temperatura para más precisión
  });

  const rawContent = response.choices[0]?.message?.content || '{}';
  console.log('🤖 OpenAI respuesta BL completa:');
  console.log(rawContent);
  
  // Limpiar el contenido - a veces viene con ```json
  let cleanContent = rawContent;
  if (cleanContent.includes('```json')) {
    cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  }
  if (cleanContent.includes('```')) {
    cleanContent = cleanContent.replace(/```\n?/g, '');
  }
  
  try {
    const parsed = JSON.parse(cleanContent.trim());
    console.log('📊 ========== DATOS EXTRAÍDOS DEL BL ==========');
    console.log('   B/L Number:', parsed.blNumber);
    console.log('   S/O Number:', parsed.soNumber);
    console.log('   Container:', parsed.containerNumber);
    console.log('   Consignee:', parsed.consignee?.substring(0, 60));
    console.log('   Shipper:', parsed.shipper?.substring(0, 60));
    console.log('   Vessel:', parsed.vesselName);
    console.log('   POL:', parsed.portOfLoading);
    console.log('   POD:', parsed.portOfDischarge);
    console.log('   Weight:', parsed.weightKg, 'kg');
    console.log('   Volume:', parsed.volumeCbm, 'CBM');
    console.log('   Packages:', parsed.packages);
    console.log('   Carrier:', parsed.carrier);
    console.log('📊 =============================================');
    return parsed;
  } catch (parseError) {
    console.error('❌ Error parseando JSON:', parseError);
    console.error('❌ Contenido limpio:', cleanContent);
    return {};
  }
};

/**
 * Clasificar tipo de documento PDF (BL o TELEX RELEASE) usando IA
 */
const classifyDocumentType = async (pdfUrl: string): Promise<'BL' | 'TELEX' | 'UNKNOWN'> => {
  let imageUrl = pdfUrl;
  
  // Si es un PDF, convertirlo a imagen primero
  if (pdfUrl.includes('application/pdf') || pdfUrl.includes('.pdf')) {
    try {
      imageUrl = await convertPdfToImage(pdfUrl);
    } catch {
      return 'UNKNOWN';
    }
  }
  
  const prompt = `Analiza este documento PDF de comercio marítimo.
Determina qué tipo de documento es y responde SOLO con uno de estos valores en formato JSON:
{
  "type": "BL" si es un Bill of Lading/Conocimiento de Embarque,
  "type": "TELEX" si es un Telex Release/Liberación Electrónica,
  "type": "UNKNOWN" si no puedes determinarlo
}

Pistas para identificar:
- BL (Bill of Lading): Tiene datos del embarque, contenedor, puertos, pesos, consignatario
- TELEX RELEASE: Es más corto, menciona "telex release", "release", autorización de liberación

Responde SOLO con el JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Eres un experto en documentos de comercio internacional marítimo." },
        { role: "user", content: [
          { type: "text", text: prompt }, 
          { type: "image_url", image_url: { url: imageUrl } }
        ] }
      ],
      max_tokens: 100,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    return result.type || 'UNKNOWN';
  } catch (error) {
    console.error('Error clasificando documento:', error);
    return 'UNKNOWN';
  }
};

/**
 * Buscar cliente por código (S3117, S3117L, S3117G)
 */
const findClientByCode = async (clientCode: string): Promise<number | null> => {
  if (!clientCode) return null;
  
  // Extraer número base sin sufijo (S3117L -> S3117)
  const baseCode = clientCode.replace(/[LG]$/i, '');
  
  const result = await pool.query(`
    SELECT id FROM users 
    WHERE box_id = $1 OR box_id ILIKE $2
    LIMIT 1
  `, [clientCode, baseCode + '%']);
  
  return result.rows.length > 0 ? result.rows[0].id : null;
};

// ========== WEBHOOK PRINCIPAL ==========

/**
 * WEBHOOK: Recibe correos de Mailgun
 * POST /api/webhooks/email/inbound
 * 
 * Este endpoint es llamado automáticamente por Mailgun cuando llega
 * un correo a billoflading@entregax.com o log@entregax.com
 */
export const handleInboundEmail = async (req: Request, res: Response): Promise<any> => {
  try {
    const body = req.body as MailgunWebhookBody;
    
    console.log('📧 Correo entrante recibido:', {
      from: body.from || body.sender,
      to: body.recipient,
      subject: body.subject,
      attachments: body['attachment-count']
    });

    // 1. VERIFICAR FIRMA DE MAILGUN (Seguridad)
    if (!verifyMailgunSignature(body.timestamp, body.token, body.signature)) {
      console.error('❌ Firma de Mailgun inválida');
      return res.status(403).json({ error: 'Firma inválida' });
    }

    // 2. VERIFICAR REMITENTE EN WHITELIST
    const fromEmail = body.from || body.sender;
    const isAllowed = await isWhitelistedSender(fromEmail);
    
    if (!isAllowed) {
      console.warn('⚠️ Remitente no autorizado:', fromEmail);
      // Guardamos log pero no procesamos
      await pool.query(`
        INSERT INTO email_inbound_logs (email_type, from_email, subject, status, raw_payload)
        VALUES ('unknown', $1, $2, 'rejected', $3)
      `, [fromEmail, body.subject, JSON.stringify(body)]);
      
      return res.status(403).json({ error: 'Remitente no autorizado' });
    }

    // 3. DETERMINAR TIPO DE DOCUMENTO
    const documentType = getDocumentType(body.recipient);
    if (!documentType) {
      console.warn('⚠️ Destinatario no reconocido:', body.recipient);
      return res.status(400).json({ error: 'Destinatario no válido' });
    }

    // 4. GUARDAR LOG DEL EMAIL
    const emailLogResult = await pool.query(`
      INSERT INTO email_inbound_logs (email_type, from_email, subject, status, raw_payload)
      VALUES ($1, $2, $3, 'processing', $4)
      RETURNING id
    `, [documentType.toLowerCase(), fromEmail, body.subject, JSON.stringify(body)]);
    
    const emailLogId = emailLogResult.rows[0].id;

    // 5. PROCESAR ADJUNTOS
    let attachments: MailgunAttachment[] = [];
    try {
      if (body.attachments) {
        attachments = JSON.parse(body.attachments);
      }
    } catch {
      console.warn('⚠️ No se pudieron parsear adjuntos');
    }

    if (attachments.length === 0) {
      await pool.query(
        'UPDATE email_inbound_logs SET status = $1 WHERE id = $2',
        ['no_attachment', emailLogId]
      );
      return res.status(400).json({ error: 'No hay archivos adjuntos' });
    }

    // 6. SEPARAR ADJUNTOS POR TIPO
    // PDFs e imágenes para BL y TELEX
    const pdfAttachments = attachments.filter(att => {
      const contentType = att['content-type'].toLowerCase();
      return contentType.includes('pdf') || contentType.includes('image');
    });
    
    // Excel para SUMMARY/Packing List
    const excelAttachments = attachments.filter(att => {
      const contentType = att['content-type'].toLowerCase();
      const name = att.name.toLowerCase();
      return contentType.includes('spreadsheet') || 
             contentType.includes('excel') || 
             name.endsWith('.xlsx') || 
             name.endsWith('.xls');
    });

    console.log(`📎 Adjuntos: ${pdfAttachments.length} PDFs/imágenes, ${excelAttachments.length} Excel`);

    if (pdfAttachments.length === 0) {
      await pool.query(
        'UPDATE email_inbound_logs SET status = $1 WHERE id = $2',
        ['no_valid_attachment', emailLogId]
      );
      return res.status(400).json({ error: 'No hay archivos PDF válidos' });
    }

    try {
      if (documentType === 'LOG' || documentType === 'LCL') {
        // Para LCL: procesar BL, TELEX y SUMMARY Excel
        // Para LCL: procesar BL, TELEX y SUMMARY Excel
        let blPdfUrl: string | null = null;
        let blPdfFilename: string | null = null;
        let telexPdfUrl: string | null = null;
        let telexPdfFilename: string | null = null;
        let summaryExcelUrl: string | null = null;
        let summaryExcelFilename: string | null = null;
        let extractedData: any = {};
        let confidence = 'low';

        console.log(`📄 Procesando LCL: ${pdfAttachments.length} PDFs, ${excelAttachments.length} Excel`);

        // Clasificar PDFs (BL vs TELEX)
        for (const attachment of pdfAttachments) {
          const docType = await classifyDocumentType(attachment.url);
          console.log(`  → ${attachment.name}: ${docType}`);

          if (docType === 'BL') {
            blPdfUrl = attachment.url;
            blPdfFilename = attachment.name;
            extractedData = await extractBlDataFromUrl(attachment.url);
            confidence = extractedData.blNumber ? 'high' : 'medium';
          } else if (docType === 'TELEX') {
            telexPdfUrl = attachment.url;
            telexPdfFilename = attachment.name;
          } else {
            if (!blPdfUrl) {
              blPdfUrl = attachment.url;
              blPdfFilename = attachment.name;
              extractedData = await extractBlDataFromUrl(attachment.url);
              confidence = extractedData.blNumber ? 'high' : 'medium';
            } else if (!telexPdfUrl) {
              telexPdfUrl = attachment.url;
              telexPdfFilename = attachment.name;
            }
          }
        }

        // Procesar Excel SUMMARY (si existe)
        if (excelAttachments.length > 0) {
          const summaryAttachment = excelAttachments.find(a => 
            a.name.toLowerCase().includes('summary')
          ) || excelAttachments[0];
          
          if (summaryAttachment) {
            summaryExcelUrl = summaryAttachment.url;
            summaryExcelFilename = summaryAttachment.name;
            console.log(`📊 Excel SUMMARY encontrado: ${summaryAttachment.name}`);
            
            // Guardar referencia al Excel para procesamiento posterior
            extractedData.summary_excel_url = summaryExcelUrl;
            extractedData.summary_excel_filename = summaryExcelFilename;
          }
        }

        // Extraer ruta del subject
        const { routeId, routeCode } = await extractRouteFromSubject(body.subject);
        if (routeCode) {
          extractedData.route_code = routeCode;
          extractedData.route_id = routeId;
        }

        extractedData.bl_document_pdf = blPdfUrl;
        extractedData.telex_release_pdf = telexPdfUrl;
        extractedData.shipment_type = 'LCL';

        // Crear borrador para LCL
        await pool.query(`
          INSERT INTO maritime_reception_drafts 
          (email_log_id, document_type, extracted_data, confidence, 
           pdf_url, pdf_filename, telex_pdf_url, telex_pdf_filename, 
           summary_excel_url, summary_excel_filename,
           detected_client_code, matched_user_id, route_id, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft')
        `, [
          emailLogId,
          'LCL',
          JSON.stringify(extractedData),
          confidence,
          blPdfUrl,
          blPdfFilename,
          telexPdfUrl,
          telexPdfFilename,
          summaryExcelUrl,
          summaryExcelFilename,
          null,
          null,
          routeId
        ]);

        console.log(`✅ Borrador LCL creado:`, {
          blNumber: extractedData.blNumber,
          containerNumber: extractedData.containerNumber,
          routeCode,
          hasBL: !!blPdfUrl,
          hasTELEX: !!telexPdfUrl,
          hasSUMMARY: !!summaryExcelUrl,
          confidence
        });

      } else if (documentType === 'FCL' || documentType === 'BL') {
        // Para FCL: Clasificar PDFs (BL vs TELEX) y procesar Packing List
        let blPdfUrl: string | null = null;
        let blPdfFilename: string | null = null;
        let telexPdfUrl: string | null = null;
        let telexPdfFilename: string | null = null;
        let packingListUrl: string | null = null;
        let packingListFilename: string | null = null;
        let extractedData: any = {};
        let confidence = 'low';

        console.log(`📄 Procesando FCL: ${pdfAttachments.length} PDFs, ${excelAttachments.length} Excel`);

        for (const attachment of pdfAttachments) {
          const docType = await classifyDocumentType(attachment.url);
          console.log(`  → ${attachment.name}: ${docType}`);

          if (docType === 'BL') {
            blPdfUrl = attachment.url;
            blPdfFilename = attachment.name;
            extractedData = await extractBlDataFromUrl(attachment.url);
            confidence = extractedData.blNumber ? 'high' : 'medium';
          } else if (docType === 'TELEX') {
            telexPdfUrl = attachment.url;
            telexPdfFilename = attachment.name;
          } else {
            if (!blPdfUrl) {
              blPdfUrl = attachment.url;
              blPdfFilename = attachment.name;
              extractedData = await extractBlDataFromUrl(attachment.url);
              confidence = extractedData.blNumber ? 'high' : 'medium';
            } else if (!telexPdfUrl) {
              telexPdfUrl = attachment.url;
              telexPdfFilename = attachment.name;
            }
          }
        }

        // Procesar Packing List Excel (si existe)
        if (excelAttachments.length > 0) {
          const packingAttachment = excelAttachments[0];
          if (packingAttachment) {
            packingListUrl = packingAttachment.url;
            packingListFilename = packingAttachment.name;
            extractedData.packing_list_url = packingListUrl;
            extractedData.packing_list_filename = packingListFilename;
            console.log(`📊 Packing List encontrado: ${packingAttachment.name}`);
          }
        }

        // Si solo hay un PDF, asumir que es BL
        if (!blPdfUrl && pdfAttachments.length > 0) {
          const firstAttachment = pdfAttachments[0]!;
          blPdfUrl = firstAttachment.url;
          blPdfFilename = firstAttachment.name;
          extractedData = await extractBlDataFromUrl(blPdfUrl);
          confidence = extractedData.blNumber ? 'high' : 'low';
        }

        // Extraer ruta del subject del correo
        const { routeId, routeCode } = await extractRouteFromSubject(body.subject);
        if (routeCode) {
          extractedData.route_code = routeCode;
          extractedData.route_id = routeId;
        }

        // Agregar URLs de documentos a los datos extraídos
        extractedData.bl_document_pdf = blPdfUrl;
        extractedData.telex_release_pdf = telexPdfUrl;
        extractedData.shipment_type = 'FCL';

        // Crear UN solo borrador con todos los documentos
        await pool.query(`
          INSERT INTO maritime_reception_drafts 
          (email_log_id, document_type, extracted_data, confidence, 
           pdf_url, pdf_filename, telex_pdf_url, telex_pdf_filename, 
           detected_client_code, matched_user_id, route_id, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
        `, [
          emailLogId,
          'FCL',
          JSON.stringify(extractedData),
          confidence,
          blPdfUrl,
          blPdfFilename,
          telexPdfUrl,
          telexPdfFilename,
          null,
          null,
          routeId
        ]);

        console.log(`✅ Borrador FCL creado:`, {
          blNumber: extractedData.blNumber,
          containerNumber: extractedData.containerNumber,
          routeCode: routeCode,
          hasBL: !!blPdfUrl,
          hasTELEX: !!telexPdfUrl,
          hasPackingList: !!packingListUrl,
          confidence
        });
      }

      // 8. ACTUALIZAR ESTADO
      await pool.query(
        'UPDATE email_inbound_logs SET status = $1, processed_at = NOW() WHERE id = $2',
        ['processed', emailLogId]
      );

      res.status(200).json({ 
        success: true, 
        message: 'Correo procesado y borrador creado',
        emailLogId 
      });

    } catch (error: any) {
      console.error('Error procesando adjuntos:', error.message);
      await pool.query(
        'UPDATE email_inbound_logs SET status = $1, error_message = $2 WHERE id = $3',
        ['error', error.message, emailLogId]
      );
      res.status(500).json({ error: 'Error procesando documentos', details: error.message });
    }

  } catch (error: any) {
    console.error('❌ Error procesando correo entrante:', error);
    res.status(500).json({ error: 'Error interno', details: error.message });
  }
};

// ========== API ADMIN: GESTIÓN DE BORRADORES ==========

/**
 * GET /api/admin/maritime/drafts
 * Listar todos los borradores pendientes de revisión
 */
export const getDrafts = async (req: Request, res: Response): Promise<any> => {
  try {
    const { status = 'draft', type } = req.query;

    let query = `
      SELECT d.*, 
        e.from_email, e.subject, e.received_at,
        u.full_name as matched_client_name, u.box_id as matched_box_id
      FROM maritime_reception_drafts d
      LEFT JOIN email_inbound_logs e ON e.id = d.email_log_id
      LEFT JOIN users u ON u.id = d.matched_user_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (status && status !== 'all') {
      query += ` AND d.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (type) {
      query += ` AND d.document_type = $${idx}`;
      params.push(type);
      idx++;
    }

    query += ' ORDER BY d.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({ error: 'Error al obtener borradores' });
  }
};

/**
 * GET /api/admin/maritime/drafts/:id
 * Detalle de un borrador
 */
export const getDraftDetail = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT d.*, 
        e.from_email, e.subject, e.received_at, e.raw_payload,
        u.full_name as matched_client_name, u.box_id as matched_box_id, u.email as matched_email
      FROM maritime_reception_drafts d
      LEFT JOIN email_inbound_logs e ON e.id = d.email_log_id
      LEFT JOIN users u ON u.id = d.matched_user_id
      WHERE d.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching draft detail:', error);
    res.status(500).json({ error: 'Error al obtener detalle del borrador' });
  }
};

/**
 * POST /api/admin/maritime/drafts/:id/approve
 * Aprobar borrador y crear recepción real
 */
export const approveDraft = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { modifiedData, editedData, userId } = req.body; // userId del admin que aprueba
    
    // 1. Obtener borrador
    const draftRes = await pool.query(
      'SELECT * FROM maritime_reception_drafts WHERE id = $1',
      [id]
    );

    if (draftRes.rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const draft = draftRes.rows[0];
    
    if (draft.status !== 'draft') {
      return res.status(400).json({ error: 'Este borrador ya fue procesado' });
    }

    // Usar datos editados si se proporcionaron
    // editedData contiene { logs: [...], bl: {...} }
    let finalData = modifiedData || draft.extracted_data;
    
    // Si hay datos editados del frontend, fusionarlos
    if (editedData) {
      // Actualizar logs con los datos editados
      if (editedData.logs && editedData.logs.length > 0) {
        finalData.logs = editedData.logs;
      }
      
      // Actualizar datos del BL con los editados
      if (editedData.bl) {
        finalData = {
          ...finalData,
          blNumber: editedData.bl.blNumber || finalData.blNumber,
          soNumber: editedData.bl.soNumber || finalData.soNumber,
          shipper: editedData.bl.shipper || finalData.shipper,
          consignee: editedData.bl.consignee || finalData.consignee,
          vesselName: editedData.bl.vesselName || finalData.vesselName,
          voyageNumber: editedData.bl.voyageNumber || finalData.voyageNumber,
          containerNumber: editedData.bl.containerNumber || finalData.containerNumber,
          portOfLoading: editedData.bl.portOfLoading || finalData.portOfLoading,
          portOfDischarge: editedData.bl.portOfDischarge || finalData.portOfDischarge,
          packages: editedData.bl.packages || finalData.packages,
          weightKg: editedData.bl.weightKg || finalData.weightKg,
          volumeCbm: editedData.bl.volumeCbm || finalData.volumeCbm
        };
      }
      
      console.log('📝 Usando datos editados del frontend');
    }
    
    const clientUserId = draft.matched_user_id;

    // 2. Crear registro real según tipo
    if (draft.document_type === 'LOG') {
      // Crear maritime_shipment (LCL individual - desde Sanky)
      await pool.query(`
        INSERT INTO maritime_shipments 
        (user_id, log_number, box_count, weight_kg, volume_cbm, 
         brand_type, description, status, pdf_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'received_origin', $8)
      `, [
        clientUserId,
        finalData.logNumber,
        finalData.boxCount,
        finalData.weightKg,
        finalData.volumeCbm,
        finalData.brandType,
        finalData.productDescription,
        draft.pdf_url
      ]);

      // Notificar al cliente si existe
      if (clientUserId) {
        await pool.query(`
          INSERT INTO notifications (user_id, title, message, type, icon, data)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          clientUserId,
          '📦 Mercancía recibida en China',
          `Tu carga ${finalData.logNumber || ''} ha sido recibida en bodega China. ${finalData.boxCount || 0} cajas, ${finalData.weightKg || 0}kg.`,
          'success',
          'ship',
          JSON.stringify({ logNumber: finalData.logNumber, type: 'LOG' })
        ]);
      }

    } else if (draft.document_type === 'LCL') {
      // ============ LCL: Crear contenedor + LOGs del SUMMARY ============
      console.log('📦 Procesando aprobación LCL...');
      
      // 2a. Crear o actualizar contenedor con datos del BL
      const containerRes = await pool.query(`
        INSERT INTO containers 
        (container_number, bl_number, eta, status, notes, consignee, shipper, 
         vessel, pol, pod, route_id,
         vessel_name, voyage_number, port_of_loading, port_of_discharge, so_number,
         total_weight_kg, total_cbm, total_packages, carrier, laden_on_board)
        VALUES ($1, $2, $3, 'consolidated', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (container_number) DO UPDATE SET
          bl_number = COALESCE(EXCLUDED.bl_number, containers.bl_number),
          eta = COALESCE(EXCLUDED.eta, containers.eta),
          consignee = COALESCE(EXCLUDED.consignee, containers.consignee),
          shipper = COALESCE(EXCLUDED.shipper, containers.shipper),
          vessel = COALESCE(EXCLUDED.vessel, containers.vessel),
          pol = COALESCE(EXCLUDED.pol, containers.pol),
          pod = COALESCE(EXCLUDED.pod, containers.pod),
          route_id = COALESCE(EXCLUDED.route_id, containers.route_id),
          vessel_name = COALESCE(EXCLUDED.vessel_name, containers.vessel_name),
          voyage_number = COALESCE(EXCLUDED.voyage_number, containers.voyage_number),
          port_of_loading = COALESCE(EXCLUDED.port_of_loading, containers.port_of_loading),
          port_of_discharge = COALESCE(EXCLUDED.port_of_discharge, containers.port_of_discharge),
          so_number = COALESCE(EXCLUDED.so_number, containers.so_number),
          total_weight_kg = COALESCE(EXCLUDED.total_weight_kg, containers.total_weight_kg),
          total_cbm = COALESCE(EXCLUDED.total_cbm, containers.total_cbm),
          total_packages = COALESCE(EXCLUDED.total_packages, containers.total_packages),
          carrier = COALESCE(EXCLUDED.carrier, containers.carrier),
          laden_on_board = COALESCE(EXCLUDED.laden_on_board, containers.laden_on_board),
          updated_at = NOW()
        RETURNING id
      `, [
        finalData.containerNumber || `LCL-${Date.now()}`,
        finalData.blNumber,
        finalData.eta,
        `Vessel: ${finalData.vesselName || 'N/A'}, Voyage: ${finalData.voyageNumber || 'N/A'}`,
        finalData.consignee,
        finalData.shipper,
        finalData.vesselName,
        finalData.portOfLoading,
        finalData.portOfDischarge,
        draft.route_id,
        // Campos adicionales para el frontend
        finalData.vesselName,
        finalData.voyageNumber,
        finalData.portOfLoading,
        finalData.portOfDischarge,
        finalData.soNumber,
        finalData.weightKg ? parseFloat(finalData.weightKg) : null,
        finalData.volumeCbm ? parseFloat(finalData.volumeCbm) : null,
        finalData.packages ? parseInt(finalData.packages) : null,
        finalData.carrier || null,
        finalData.ladenOnBoard || null
      ]);

      const containerId = containerRes.rows[0].id;
      console.log(`✅ Contenedor creado/actualizado: ID=${containerId}, Container=${finalData.containerNumber}`);

      // Obtener el route_id del contenedor (puede haber sido heredado de un registro anterior)
      const containerRouteRes = await pool.query('SELECT route_id FROM containers WHERE id = $1', [containerId]);
      const containerRouteId = containerRouteRes.rows[0]?.route_id || draft.route_id || null;
      console.log(`📍 Ruta del contenedor: ${containerRouteId}`);

      // 2b. Crear registro de costos con documentos del BL y datos de peso/volumen
      const blDocumentPdf = draft.pdf_url;
      const telexReleasePdf = draft.telex_pdf_url;
      const totalWeightKg = finalData.weightKg || null;
      const totalVolumeCbm = finalData.volumeCbm || null;
      const totalPackages = finalData.packages || null;

      await pool.query(`
        INSERT INTO container_costs (
          container_id, 
          bl_document_pdf, 
          telex_release_pdf,
          total_weight_kg,
          total_volume_cbm,
          total_packages
        ) 
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (container_id) DO UPDATE SET
          bl_document_pdf = COALESCE(EXCLUDED.bl_document_pdf, container_costs.bl_document_pdf),
          telex_release_pdf = COALESCE(EXCLUDED.telex_release_pdf, container_costs.telex_release_pdf),
          total_weight_kg = COALESCE(EXCLUDED.total_weight_kg, container_costs.total_weight_kg),
          total_volume_cbm = COALESCE(EXCLUDED.total_volume_cbm, container_costs.total_volume_cbm),
          total_packages = COALESCE(EXCLUDED.total_packages, container_costs.total_packages),
          updated_at = NOW()
      `, [
        containerId, 
        blDocumentPdf, 
        telexReleasePdf,
        totalWeightKg,
        totalVolumeCbm,
        totalPackages
      ]);
      console.log(`✅ Costos de contenedor creados: BL=${!!blDocumentPdf}, Telex=${!!telexReleasePdf}, Weight=${totalWeightKg}kg, Vol=${totalVolumeCbm}cbm, Pkg=${totalPackages}`);

      // 2c. Actualizar maritime_orders existentes o crear nuevos con info del SUMMARY
      // Los LOGs llegan al sistema vía API de China (maritime_orders)
      // Aquí complementamos con la información del SUMMARY (tipo, contenedor, batería, etc.)
      const logs = finalData.logs || [];
      let logsUpdated = 0;
      let logsCreated = 0;
      let logsSkipped = 0;
      const clientsNotified = new Set<number>();

      console.log(`📋 Procesando ${logs.length} LOGs del SUMMARY...`);

      for (const log of logs) {
        try {
          // DEBUG: Mostrar datos especiales recibidos
          console.log(`  📦 LOG ${log.log}: hasBattery=${log.hasBattery}, hasLiquid=${log.hasLiquid}, isPickup=${log.isPickup}, tipo=${log.tipo}`);
          
          // Determinar brand_type basado en tipo
          let brandType = 'generic';
          if (log.tipo === 'Sensible') brandType = 'sensitive';
          else if (log.tipo === 'Logotipo') brandType = 'logo';

          // Buscar user_id basado en legacyClientId (si se editó el cliente)
          // legacy_clients tiene box_id que corresponde al shipping_mark
          let newUserId = null;
          let newShippingMark = log.clientCode || null;
          
          if (log.legacyClientId) {
            // Buscar el box_id del legacy_client y luego el user vinculado
            const legacyRes = await pool.query(
              'SELECT box_id FROM legacy_clients WHERE id = $1',
              [log.legacyClientId]
            );
            if (legacyRes.rows.length > 0) {
              newShippingMark = legacyRes.rows[0].box_id;
              // Buscar usuario que tenga ese box_id
              const userRes = await pool.query(
                'SELECT id FROM users WHERE box_id = $1',
                [newShippingMark]
              );
              newUserId = userRes.rows[0]?.id || null;
            }
          }

          // Verificar si el LOG ya existe en maritime_orders
          const existingLog = await pool.query(
            'SELECT id, user_id FROM maritime_orders WHERE ordersn = $1',
            [log.log]
          );

          if (existingLog.rows.length > 0) {
            // El LOG ya existe - ACTUALIZAR con info del SUMMARY (incluyendo cliente y ruta)
            const existingUserId = existingLog.rows[0].user_id;
            const finalUserId = newUserId || existingUserId;
            
            await pool.query(`
              UPDATE maritime_orders SET
                container_id = $1,
                brand_type = $2,
                has_battery = $3,
                has_liquid = $4,
                is_pickup = $5,
                summary_boxes = $6,
                summary_weight = $7,
                summary_volume = $8,
                summary_description = $9,
                user_id = COALESCE($10, user_id),
                route_id = $11,
                bl_client_name = $12,
                bl_client_code = $13,
                updated_at = NOW()
              WHERE ordersn = $14
            `, [
              containerId,
              brandType,
              log.hasBattery || false,
              log.hasLiquid || false,
              log.isPickup || false,
              log.boxes,
              log.weight,
              log.volume,
              log.description,
              newUserId,
              containerRouteId,
              log.clientName || null,
              log.clientCode || null,
              log.log
            ]);
            
            logsUpdated++;
            console.log(`  ✅ LOG actualizado: ${log.log} → container_id=${containerId}, tipo=${brandType}, bl_client=${log.clientName}(${log.clientCode}), route_id=${containerRouteId}`);

            // Notificar al cliente si tiene usuario
            const notifyUserId = finalUserId;
            if (notifyUserId && !clientsNotified.has(notifyUserId)) {
              await pool.query(`
                INSERT INTO notifications (user_id, title, message, type, icon, data)
                VALUES ($1, $2, $3, $4, $5, $6)
              `, [
                notifyUserId,
                '🚢 Mercancía consolidada',
                `Tu carga ${log.log} ha sido consolidada para envío marítimo. ${log.boxes || 0} cajas, ${log.volume || 0} CBM.`,
                'success',
                'ship',
                JSON.stringify({ logNumber: log.log, containerId, type: 'LCL' })
              ]);
              clientsNotified.add(existingUserId);
            }

          } else {
            // El LOG NO existe - CREAR registro completo con info del SUMMARY
            // El SUMMARY es la fuente oficial, crear el LOG con toda la información
            console.log(`  📝 LOG ${log.log} no existe - CREANDO con datos del SUMMARY...`);
            
            // Buscar usuario por legacyClientId o por clientCode
            let shipmentUserId = null;
            
            if (log.legacyClientId) {
              const userRes = await pool.query(
                'SELECT id FROM users WHERE legacy_client_id = $1',
                [log.legacyClientId]
              );
              shipmentUserId = userRes.rows[0]?.id || null;
            }

            // Buscar dirección predeterminada para servicio marítimo
            let defaultAddressId: number | null = null;
            if (shipmentUserId) {
              const addressResult = await pool.query(
                `SELECT id FROM addresses 
                 WHERE user_id = $1 
                 AND (default_for_service LIKE '%maritime%' OR default_for_service LIKE '%all%')
                 ORDER BY id ASC LIMIT 1`,
                [shipmentUserId]
              );
              if (addressResult.rows.length > 0) {
                defaultAddressId = addressResult.rows[0].id;
                console.log(`    → Dirección predeterminada asignada automáticamente: ID ${defaultAddressId}`);
              }
            }

            // Crear el LOG completo con toda la información del SUMMARY
            // NOTA: shipping_mark se deja NULL porque solo viene de la API de China
            // weight y volume se llenan con datos del Summary ya que no hay datos de API
            await pool.query(`
              INSERT INTO maritime_orders 
              (ordersn, user_id, shipping_mark, container_id, brand_type, 
               has_battery, has_liquid, is_pickup,
               weight, volume,
               summary_boxes, summary_weight, summary_volume, summary_description,
               bl_client_name, bl_client_code, route_id,
               delivery_address_id, instructions_assigned_at,
               sync_source, status, created_at, updated_at)
              VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'summary', 'pending_api', NOW(), NOW())
            `, [
              log.log,
              shipmentUserId,
              // shipping_mark = NULL (solo viene de API, no del Summary)
              containerId,
              brandType,
              log.hasBattery || false,
              log.hasLiquid || false,
              log.isPickup || false,
              log.weight || 0,    // weight de Summary (usado si no hay datos de API)
              log.volume || 0,    // volume de Summary (usado si no hay datos de API)
              log.boxes,
              log.weight,
              log.volume,
              log.description,
              log.clientName || null,  // nombre completo del cliente
              log.clientCode || null,  // código del cliente (S105, S883)
              containerRouteId,  // ruta del contenedor
              defaultAddressId,  // dirección predeterminada si existe
              defaultAddressId ? new Date() : null  // timestamp de asignación automática
            ]);
            
            logsCreated++;
            console.log(`  📝 LOG pre-creado: ${log.log} → esperando sincronización API`);
          }

        } catch (logError: any) {
          console.error(`⚠️ Error al procesar LOG ${log.log}:`, logError.message);
          logsSkipped++;
        }
      }

      console.log(`✅ LOGs procesados: ${logsUpdated} actualizados, ${logsCreated} pre-creados, ${logsSkipped} omitidos, ${clientsNotified.size} clientes notificados`);

    } else if (draft.document_type === 'BL' || draft.document_type === 'FCL') {
      // ============ FCL: Solo crear contenedor ============
      const containerRes = await pool.query(`
        INSERT INTO containers 
        (container_number, bl_number, eta, status, notes, consignee, shipper, vessel, pol, pod,
         vessel_name, voyage_number, port_of_loading, port_of_discharge, so_number,
         total_weight_kg, total_cbm, total_packages, carrier, laden_on_board)
        VALUES ($1, $2, $3, 'in_transit', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (container_number) DO UPDATE SET
          bl_number = EXCLUDED.bl_number,
          eta = EXCLUDED.eta,
          consignee = COALESCE(EXCLUDED.consignee, containers.consignee),
          shipper = COALESCE(EXCLUDED.shipper, containers.shipper),
          vessel = COALESCE(EXCLUDED.vessel, containers.vessel),
          pol = COALESCE(EXCLUDED.pol, containers.pol),
          pod = COALESCE(EXCLUDED.pod, containers.pod),
          vessel_name = COALESCE(EXCLUDED.vessel_name, containers.vessel_name),
          voyage_number = COALESCE(EXCLUDED.voyage_number, containers.voyage_number),
          port_of_loading = COALESCE(EXCLUDED.port_of_loading, containers.port_of_loading),
          port_of_discharge = COALESCE(EXCLUDED.port_of_discharge, containers.port_of_discharge),
          so_number = COALESCE(EXCLUDED.so_number, containers.so_number),
          total_weight_kg = COALESCE(EXCLUDED.total_weight_kg, containers.total_weight_kg),
          total_cbm = COALESCE(EXCLUDED.total_cbm, containers.total_cbm),
          total_packages = COALESCE(EXCLUDED.total_packages, containers.total_packages),
          carrier = COALESCE(EXCLUDED.carrier, containers.carrier),
          laden_on_board = COALESCE(EXCLUDED.laden_on_board, containers.laden_on_board),
          updated_at = NOW()
        RETURNING id
      `, [
        finalData.containerNumber,
        finalData.blNumber,
        finalData.eta,
        `POL: ${finalData.portOfLoading || 'N/A'}, POD: ${finalData.portOfDischarge || 'N/A'}`,
        finalData.consignee,
        finalData.shipper,
        finalData.vesselName,
        finalData.portOfLoading,
        finalData.portOfDischarge,
        // Campos adicionales para el frontend
        finalData.vesselName,
        finalData.voyageNumber,
        finalData.portOfLoading,
        finalData.portOfDischarge,
        finalData.soNumber,
        finalData.weightKg ? parseFloat(finalData.weightKg) : null,
        finalData.volumeCbm ? parseFloat(finalData.volumeCbm) : null,
        finalData.packages ? parseInt(finalData.packages) : null,
        finalData.carrier || null,
        finalData.ladenOnBoard || null
      ]);

      // Crear o actualizar costos con los documentos oficiales (BL y TELEX) y datos de peso/volumen
      if (containerRes.rows.length > 0) {
        const containerId = containerRes.rows[0].id;
        
        const blDocumentPdf = finalData.bl_document_pdf || draft.pdf_url;
        const telexReleasePdf = finalData.telex_release_pdf || draft.telex_pdf_url;
        const totalWeightKg = finalData.weightKg || null;
        const totalVolumeCbm = finalData.volumeCbm || null;
        const totalPackages = finalData.packages || null;

        await pool.query(`
          INSERT INTO container_costs (
            container_id, 
            bl_document_pdf, 
            telex_release_pdf,
            total_weight_kg,
            total_volume_cbm,
            total_packages
          ) 
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (container_id) DO UPDATE SET
            bl_document_pdf = COALESCE(EXCLUDED.bl_document_pdf, container_costs.bl_document_pdf),
            telex_release_pdf = COALESCE(EXCLUDED.telex_release_pdf, container_costs.telex_release_pdf),
            total_weight_kg = COALESCE(EXCLUDED.total_weight_kg, container_costs.total_weight_kg),
            total_volume_cbm = COALESCE(EXCLUDED.total_volume_cbm, container_costs.total_volume_cbm),
            total_packages = COALESCE(EXCLUDED.total_packages, container_costs.total_packages),
            updated_at = NOW()
        `, [containerId, blDocumentPdf, telexReleasePdf, totalWeightKg, totalVolumeCbm, totalPackages]);

        console.log(`📄 Documentos guardados para contenedor FCL ${finalData.containerNumber}: Weight=${totalWeightKg}kg, Vol=${totalVolumeCbm}cbm`);
      }
    }

    // 3. Marcar borrador como aprobado
    await pool.query(`
      UPDATE maritime_reception_drafts 
      SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [userId, id]);

    res.json({ 
      success: true, 
      message: `${draft.document_type} aprobado y registrado correctamente`,
      documentType: draft.document_type
    });

  } catch (error: any) {
    console.error('Error aprobando borrador:', error);
    res.status(500).json({ error: 'Error al aprobar', details: error.message });
  }
};

/**
 * POST /api/admin/maritime/drafts/:id/reject
 * Rechazar borrador
 */
export const rejectDraft = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { reason, userId } = req.body;

    await pool.query(`
      UPDATE maritime_reception_drafts 
      SET status = 'rejected', rejection_reason = $1, reviewed_by = $2, reviewed_at = NOW()
      WHERE id = $3
    `, [reason || 'Sin especificar', userId, id]);

    res.json({ success: true, message: 'Borrador rechazado' });
  } catch (error) {
    console.error('Error rechazando borrador:', error);
    res.status(500).json({ error: 'Error al rechazar borrador' });
  }
};

/**
 * PUT /api/admin/maritime/drafts/:id/match-client
 * Asignar cliente manualmente a un borrador
 */
export const matchClientToDraft = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    await pool.query(`
      UPDATE maritime_reception_drafts 
      SET matched_user_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [userId, id]);

    res.json({ success: true, message: 'Cliente asignado al borrador' });
  } catch (error) {
    console.error('Error asignando cliente:', error);
    res.status(500).json({ error: 'Error al asignar cliente' });
  }
};

// ========== GESTIÓN DE WHITELIST ==========

/**
 * GET /api/admin/email/whitelist
 */
export const getWhitelist = async (_req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(
      'SELECT * FROM email_whitelist ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching whitelist:', error);
    res.status(500).json({ error: 'Error al obtener whitelist' });
  }
};

/**
 * POST /api/admin/email/whitelist
 */
export const addToWhitelist = async (req: Request, res: Response): Promise<any> => {
  try {
    const { emailPattern, description } = req.body;

    const result = await pool.query(`
      INSERT INTO email_whitelist (email_pattern, description)
      VALUES ($1, $2)
      RETURNING *
    `, [emailPattern, description]);

    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Este patrón ya existe' });
    }
    res.status(500).json({ error: 'Error al agregar a whitelist' });
  }
};

/**
 * DELETE /api/admin/email/whitelist/:id
 */
export const removeFromWhitelist = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM email_whitelist WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar de whitelist' });
  }
};

// ========== ESTADÍSTICAS ==========

/**
 * GET /api/admin/email/stats
 */
export const getEmailStats = async (_req: Request, res: Response): Promise<any> => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM email_inbound_logs WHERE created_at > NOW() - INTERVAL '24 hours') as emails_today,
        (SELECT COUNT(*) FROM maritime_reception_drafts WHERE status = 'draft') as pending_drafts,
        (SELECT COUNT(*) FROM maritime_reception_drafts WHERE status = 'approved') as approved_total,
        (SELECT COUNT(*) FROM maritime_reception_drafts WHERE status = 'rejected') as rejected_total
    `);

    const byType = await pool.query(`
      SELECT document_type, status, COUNT(*) as count
      FROM maritime_reception_drafts
      GROUP BY document_type, status
    `);

    res.json({
      summary: stats.rows[0],
      byType: byType.rows
    });
  } catch (error) {
    console.error('Error fetching email stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

/**
 * POST /api/admin/maritime/upload-manual
 * Subir archivos manualmente (FCL o LCL)
 * Requiere multipart/form-data con archivos
 */
export const uploadManualShipment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { shipmentType, subject, routeId } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    
    if (!files) {
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }

    console.log('📤 Upload manual:', { shipmentType, subject, routeId, files: Object.keys(files) });

    // Obtener archivos
    const blFile = files['bl']?.[0];
    const telexFile = files['telex']?.[0];
    const packingFile = files['packingList']?.[0];
    const summaryFile = files['summary']?.[0];

    if (!blFile) {
      return res.status(400).json({ error: 'Se requiere el archivo BL' });
    }

    // Crear registro en email_inbound_logs (simular recepción de correo)
    const emailLogResult = await pool.query(`
      INSERT INTO email_inbound_logs (email_type, from_email, subject, status, raw_payload)
      VALUES ($1, $2, $3, 'processing', $4)
      RETURNING id
    `, [
      shipmentType?.toLowerCase() || 'manual',
      'manual-upload@entregax.com',
      subject || `Manual Upload - ${new Date().toISOString()}`,
      JSON.stringify({ manual: true, shipmentType, uploadedAt: new Date() })
    ]);
    
    const emailLogId = emailLogResult.rows[0].id;

    // Por ahora guardamos los archivos en memoria/base64
    // En producción deberías subirlos a S3/Cloudinary
    const blBase64 = blFile.buffer.toString('base64');
    const blDataUrl = `data:${blFile.mimetype};base64,${blBase64}`;
    
    let telexDataUrl: string | null = null;
    if (telexFile) {
      const telexBase64 = telexFile.buffer.toString('base64');
      telexDataUrl = `data:${telexFile.mimetype};base64,${telexBase64}`;
    }

    // Extraer datos del BL usando IA
    let extractedData: any = {};
    let confidence = 'medium';
    
    try {
      console.log('🔍 ============ INICIANDO EXTRACCIÓN BL ============');
      console.log('🔍 mimetype:', blFile.mimetype);
      console.log('🔍 tamaño:', blFile.size, 'bytes');
      console.log('🔍 dataUrl prefix:', blDataUrl.substring(0, 50));
      
      extractedData = await extractBlDataFromUrl(blDataUrl);
      
      console.log('✅ ============ EXTRACCIÓN COMPLETADA ============');
      console.log('✅ blNumber:', extractedData.blNumber);
      console.log('✅ shipper:', extractedData.shipper?.substring(0, 50));
      console.log('✅ consignee:', extractedData.consignee?.substring(0, 50));
      console.log('✅ containerNumber:', extractedData.containerNumber);
      console.log('✅ Todas las keys:', Object.keys(extractedData));
      
      confidence = extractedData.blNumber ? 'high' : 'low';
    } catch (e: any) {
      console.error('❌ ============ ERROR EXTRACCIÓN BL ============');
      console.error('❌ Mensaje:', e.message);
      console.error('❌ Stack:', e.stack);
    }

    // Usar routeId del request si viene, sino extraer del subject
    let finalRouteId = routeId ? parseInt(routeId) : null;
    let finalRouteCode: string | null = null;
    
    if (finalRouteId) {
      // Obtener código de la ruta
      const routeRes = await pool.query('SELECT code FROM maritime_routes WHERE id = $1', [finalRouteId]);
      if (routeRes.rows.length > 0) {
        finalRouteCode = routeRes.rows[0].code;
        extractedData.route_code = finalRouteCode;
        extractedData.route_id = finalRouteId;
        console.log('📍 Ruta desde selector:', finalRouteCode);
      }
    } else {
      // Extraer ruta del subject
      const routeExtracted = await extractRouteFromSubject(subject || '');
      if (routeExtracted.routeCode) {
        finalRouteId = routeExtracted.routeId;
        finalRouteCode = routeExtracted.routeCode;
        extractedData.route_code = finalRouteCode;
        extractedData.route_id = finalRouteId;
      }
    }

    // Para FCL: Extraer código de cliente del subject
    let detectedClientCode: string | null = null;
    let matchedUserId: number | null = null;
    
    if (shipmentType === 'FCL') {
      const clientInfo = await extractClientFromSubject(subject || '');
      if (clientInfo.clientCode) {
        detectedClientCode = clientInfo.clientCode;
        matchedUserId = clientInfo.clientId;
        extractedData.detected_client_code = clientInfo.clientCode;
        extractedData.client_name = clientInfo.clientName;
        extractedData.client_id = clientInfo.clientId;
        
        if (clientInfo.clientId) {
          confidence = 'high'; // Si encontramos el cliente, alta confianza
        }
      }
    }

    // Agregar info de archivos
    extractedData.shipment_type = shipmentType;
    extractedData.bl_filename = blFile.originalname;
    if (telexFile) extractedData.telex_filename = telexFile.originalname;
    if (packingFile) extractedData.packing_list_filename = packingFile.originalname;
    if (summaryFile) extractedData.summary_filename = summaryFile.originalname;

    // Preparar URLs de archivos
    let summaryExcelUrl: string | null = null;
    let summaryExcelFilename: string | null = null;
    
    if (summaryFile) {
      const summaryBase64 = summaryFile.buffer.toString('base64');
      summaryExcelUrl = `data:${summaryFile.mimetype};base64,${summaryBase64}`;
      summaryExcelFilename = summaryFile.originalname;
      extractedData.summary_excel_url = summaryExcelUrl;
      extractedData.summary_excel_filename = summaryExcelFilename;
    }

    // Para LCL: Procesar Excel SUMMARY para extraer LOGs
    console.log('📊 Verificando condiciones para procesar SUMMARY:', {
      shipmentType,
      hasSummaryFile: !!summaryFile,
      summaryFileName: summaryFile?.originalname
    });
    
    if (shipmentType === 'LCL' && summaryFile) {
      try {
        console.log('📊 Procesando SUMMARY Excel para LCL...');
        console.log('📊 Tamaño del archivo:', summaryFile.buffer.length, 'bytes');
        let logEntries = await processSummaryExcel(summaryFile.buffer);
        
        // Buscar clientes asociados a cada LOG en legacy_clients
        logEntries = await findClientByLogCode(logEntries);
        
        // Agregar a extractedData
        extractedData.logs = logEntries;
        extractedData.totalLogs = logEntries.length;
        
        // Contar clientes vinculados a legacy
        const linkedClients = logEntries.filter(l => l.legacyClientId !== null).length;
        const pendingClients = logEntries.filter(l => l.legacyClientId === null && l.clientCode).length;
        
        // Resumen de tipos de mercancía
        extractedData.summary = {
          totalLogs: logEntries.length,
          linkedToLegacy: linkedClients,
          pendingLink: pendingClients,
          byType: {
            generico: logEntries.filter(l => l.tipo === 'Genérico').length,
            sensible: logEntries.filter(l => l.tipo === 'Sensible').length,
            logotipo: logEntries.filter(l => l.tipo === 'Logotipo').length
          },
          withBattery: logEntries.filter(l => l.hasBattery).length,
          withLiquid: logEntries.filter(l => l.hasLiquid).length,
          forPickup: logEntries.filter(l => l.isPickup).length
        };
        
        console.log(`✅ LOGs procesados: ${logEntries.length} total, ${linkedClients} vinculados a Legacy, ${pendingClients} pendientes`);
        confidence = logEntries.length > 0 ? 'high' : 'low';
      } catch (e) {
        console.error('⚠️ Error procesando SUMMARY Excel:', e);
      }
    }

    // Crear borrador
    await pool.query(`
      INSERT INTO maritime_reception_drafts 
      (email_log_id, document_type, extracted_data, confidence, 
       pdf_url, pdf_filename, telex_pdf_url, telex_pdf_filename, 
       summary_excel_url, summary_excel_filename,
       detected_client_code, matched_user_id, route_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft')
    `, [
      emailLogId,
      shipmentType || 'MANUAL',
      JSON.stringify(extractedData),
      confidence,
      blDataUrl,
      blFile.originalname,
      telexDataUrl,
      telexFile?.originalname || null,
      summaryExcelUrl,
      summaryExcelFilename,
      detectedClientCode,
      matchedUserId,
      finalRouteId
    ]);

    // Actualizar estado del log
    await pool.query(
      'UPDATE email_inbound_logs SET status = $1, processed_at = NOW() WHERE id = $2',
      ['processed', emailLogId]
    );

    console.log(`✅ Upload manual ${shipmentType} procesado:`, {
      blNumber: extractedData.blNumber,
      containerNumber: extractedData.containerNumber,
      routeCode: finalRouteCode,
      confidence
    });

    res.json({ 
      success: true, 
      message: `Documentos ${shipmentType} subidos correctamente`,
      emailLogId,
      extractedData
    });

  } catch (error: any) {
    console.error('Error en upload manual:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/admin/email/draft/:id/reextract
 * Re-extraer datos del BL y SUMMARY Excel usando IA
 */
export const reExtractDraftData = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    // Obtener el draft actual con todos los datos necesarios
    const draftResult = await pool.query(`
      SELECT id, pdf_url, document_type, status, summary_excel_url, extracted_data
      FROM maritime_reception_drafts
      WHERE id = $1
    `, [id]);
    
    if (draftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Draft no encontrado' });
    }
    
    const draft = draftResult.rows[0];
    
    if (!draft.pdf_url) {
      return res.status(400).json({ error: 'No hay PDF disponible para extraer datos' });
    }
    
    console.log('🔄 ============ RE-EXTRACCIÓN BL + SUMMARY ============');
    console.log('🔄 Draft ID:', id);
    console.log('🔄 Document Type:', draft.document_type);
    console.log('🔄 PDF URL length:', draft.pdf_url?.length);
    console.log('🔄 Summary Excel URL:', draft.summary_excel_url ? 'Disponible' : 'No disponible');
    
    // Re-extraer datos del BL
    // Preservar datos existentes por si la extracción falla
    let extractedData: any = draft.extracted_data || {};
    let confidence = 'medium';
    
    try {
      const newBlData = await extractBlDataFromUrl(draft.pdf_url);
      
      // Solo actualizar si obtuvimos datos válidos
      if (newBlData && newBlData.blNumber) {
        // Merge: nuevos datos del BL + preservar logs existentes si hay
        const existingLogs = extractedData.logs;
        const existingSummary = extractedData.summary;
        
        extractedData = { ...extractedData, ...newBlData };
        
        // Preservar logs si existían
        if (existingLogs) extractedData.logs = existingLogs;
        if (existingSummary) extractedData.summary = existingSummary;
        
        console.log('✅ Re-extracción BL exitosa:');
        console.log('   blNumber:', extractedData.blNumber);
        console.log('   shipper:', extractedData.shipper?.substring(0, 50));
        console.log('   containerNumber:', extractedData.containerNumber);
        
        confidence = 'high';
      } else {
        console.log('⚠️ Extracción BL no obtuvo datos válidos, preservando existentes');
        confidence = extractedData.blNumber ? 'medium' : 'low';
      }
    } catch (e: any) {
      console.error('⚠️ Error en re-extracción BL:', e.message);
      console.log('📋 Preservando datos BL existentes');
      // No fallar, continuar con datos existentes
    }
    
    // Para LCL: También procesar el SUMMARY Excel si existe
    const summaryExcelUrl = draft.summary_excel_url || draft.extracted_data?.summary_excel_url;
    
    if (draft.document_type === 'LCL' && summaryExcelUrl) {
      try {
        console.log('📊 Procesando SUMMARY Excel...');
        
        // Extraer el buffer del data URL
        const matches = summaryExcelUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');
          
          console.log('📊 Buffer size:', buffer.length, 'bytes');
          
          // Procesar el Excel
          let logEntries = await processSummaryExcel(buffer);
          
          // Buscar clientes asociados
          logEntries = await findClientByLogCode(logEntries);
          
          // Agregar LOGs a extractedData
          extractedData.logs = logEntries;
          extractedData.totalLogs = logEntries.length;
          
          // Contar clientes vinculados
          const linkedClients = logEntries.filter(l => l.legacyClientId !== null).length;
          const pendingClients = logEntries.filter(l => l.legacyClientId === null && l.clientCode).length;
          
          // Resumen
          extractedData.summary = {
            totalLogs: logEntries.length,
            linkedToLegacy: linkedClients,
            pendingLink: pendingClients,
            byType: {
              generico: logEntries.filter(l => l.tipo === 'Genérico').length,
              sensible: logEntries.filter(l => l.tipo === 'Sensible').length,
              logotipo: logEntries.filter(l => l.tipo === 'Logotipo').length
            },
            withBattery: logEntries.filter(l => l.hasBattery).length,
            withLiquid: logEntries.filter(l => l.hasLiquid).length,
            forPickup: logEntries.filter(l => l.isPickup).length
          };
          
          // Preservar referencias al Excel
          extractedData.summary_excel_url = summaryExcelUrl;
          extractedData.summary_excel_filename = draft.extracted_data?.summary_excel_filename;
          
          console.log(`✅ LOGs procesados: ${logEntries.length} total, ${linkedClients} vinculados`);
          
          if (logEntries.length > 0) {
            confidence = 'high';
          }
        }
      } catch (e: any) {
        console.error('⚠️ Error procesando SUMMARY Excel:', e.message);
        // No fallar, solo registrar el error
      }
    }
    
    // Actualizar el draft con los nuevos datos
    await pool.query(`
      UPDATE maritime_reception_drafts
      SET extracted_data = $1,
          confidence = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [JSON.stringify(extractedData), confidence, id]);
    
    // Obtener el draft actualizado
    const updatedResult = await pool.query(`
      SELECT 
        d.*,
        u.full_name as matched_client_name,
        u.box_id as matched_box_id
      FROM maritime_reception_drafts d
      LEFT JOIN users u ON d.matched_user_id = u.id
      WHERE d.id = $1
    `, [id]);
    
    res.json({
      success: true,
      message: 'Datos extraídos exitosamente',
      draft: updatedResult.rows[0]
    });
    
  } catch (error: any) {
    console.error('Error en re-extracción:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/admin/email/draft/:id/pdf/:type
 * Servir PDF de un draft (bl o telex)
 * Chrome tiene límites con data URLs largos, así que servimos el archivo directamente
 */
export const serveDraftPdf = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const type = req.params.type as string;
    
    if (!type || !['bl', 'telex'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de documento inválido' });
    }

    const column = type === 'bl' ? 'pdf_url' : 'telex_pdf_url';
    const filenameColumn = type === 'bl' ? 'pdf_filename' : 'telex_pdf_filename';
    
    const result = await pool.query(
      `SELECT ${column} as data_url, ${filenameColumn} as filename FROM maritime_reception_drafts WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const { data_url, filename } = result.rows[0];
    
    if (!data_url) {
      return res.status(404).json({ error: 'PDF no disponible' });
    }

    // Parsear data URL: data:application/pdf;base64,XXXX
    const matches = data_url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(500).json({ error: 'Formato de PDF inválido' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Enviar como PDF
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename || 'document.pdf'}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch (error: any) {
    console.error('Error sirviendo PDF:', error);
    res.status(500).json({ error: 'Error al obtener PDF' });
  }
};

/**
 * GET /api/admin/email/draft/:id/excel
 * Servir Excel SUMMARY de un draft LCL
 */
export const serveDraftExcel = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT summary_excel_url, summary_excel_filename, extracted_data FROM maritime_reception_drafts WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    let data_url = result.rows[0].summary_excel_url;
    let filename = result.rows[0].summary_excel_filename;
    
    // Si no está en las columnas dedicadas, buscar en extracted_data
    if (!data_url && result.rows[0].extracted_data) {
      const extractedData = result.rows[0].extracted_data;
      data_url = extractedData.summary_excel_url;
      filename = extractedData.summary_excel_filename;
    }
    
    if (!data_url) {
      return res.status(404).json({ error: 'Excel SUMMARY no disponible' });
    }

    // Parsear data URL: data:application/vnd...;base64,XXXX
    const matches = data_url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(500).json({ error: 'Formato de Excel inválido' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Enviar como Excel
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'summary.xlsx'}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch (error: any) {
    console.error('Error sirviendo Excel:', error);
    res.status(500).json({ error: 'Error al obtener Excel' });
  }
};
