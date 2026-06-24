/**
 * Constancia de Situación Fiscal (CSF) — gestión per-cliente.
 *
 * Flujo:
 *  1) Cliente sube su CSF en la pestaña de Facturas (PDF/JPG/PNG).
 *  2) Si es PDF intentamos extraer la "Fecha de emisión" de la constancia.
 *  3) Validamos que no sea > 3 meses de antigüedad. Si lo es, rechazamos.
 *  4) Guardamos en user_saved_documents con issued_at + valid_until (= +3 meses).
 *  5) Cuando se va a facturar, primero consultamos vigencia.
 */

import { Request, Response } from 'express';
import { pool } from './db';

// Multer guarda el archivo en memoria (Buffer)
type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const MONTHS_VALID = 3;
const MAX_AGE_MS = MONTHS_VALID * 30 * 24 * 60 * 60 * 1000; // ~3 meses

// Garantiza que user_saved_documents tenga las columnas issued_at / valid_until.
let _csfColsEnsured = false;
const ensureCsfColumns = async () => {
  if (_csfColsEnsured) return;
  try {
    await pool.query(`
      ALTER TABLE user_saved_documents
        ADD COLUMN IF NOT EXISTS issued_at DATE,
        ADD COLUMN IF NOT EXISTS valid_until DATE
    `);
    _csfColsEnsured = true;
  } catch (e) {
    console.warn('[CSF] No se pudieron asegurar columnas:', (e as any)?.message);
  }
};

// Meses en español (incluye variantes con acento y sin acento, mayúscula y minúscula).
const SPANISH_MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
  octubre: 10, noviembre: 11, diciembre: 12,
};

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Intenta extraer la fecha de emisión del texto de la CSF.
 * Reconoce formatos comunes del SAT:
 *   "Lugar y fecha de emisión: CIUDAD DE MEXICO, A 06 DE JUNIO DE 2026"
 *   "Fecha de emisión: 06/06/2026"
 *   "06-JUN-2026"
 *   "2026-06-06"
 * Devuelve Date o null.
 */
export const extractIssueDateFromText = (rawText: string): Date | null => {
  if (!rawText) return null;
  const text = stripAccents(rawText).toLowerCase().replace(/\s+/g, ' ');

  // Patrón 1: "06 de junio de 2026" / "6 de jun 2026"
  const m1 = text.match(/(\d{1,2})\s+de?\s+([a-z]{3,12})\s+de?\s+(\d{4})/i);
  if (m1) {
    const day = parseInt(m1[1], 10);
    const monKey = m1[2].toLowerCase();
    const month = SPANISH_MONTHS[monKey] || SPANISH_MONTHS[monKey.slice(0, 4)] || SPANISH_MONTHS[monKey.slice(0, 3) + monKey.slice(3)] || 0;
    const year = parseInt(m1[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  // Patrón 2: "06/06/2026" o "06-06-2026"
  const m2 = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m2) {
    const day = parseInt(m2[1], 10);
    const month = parseInt(m2[2], 10);
    const year = parseInt(m2[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  // Patrón 3: "2026-06-06"
  const m3 = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m3) {
    const year = parseInt(m3[1], 10);
    const month = parseInt(m3[2], 10);
    const day = parseInt(m3[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  return null;
};

/**
 * Intenta parsear un PDF con pdf-parse y extraer la fecha de emisión.
 * Devuelve null si no logra extraer o si no es PDF.
 */
export const tryExtractIssueDateFromPdf = async (file: UploadedFile): Promise<Date | null> => {
  if (!file?.buffer || file.buffer.length === 0) return null;
  const mime = String(file.mimetype || '').toLowerCase();
  if (!mime.includes('pdf')) return null;
  try {
    const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(file.buffer);
    return extractIssueDateFromText(parsed.text || '');
  } catch (e) {
    console.warn('[CSF] pdf-parse falló:', (e as any)?.message);
    return null;
  }
};

const addMonths = (d: Date, months: number) => {
  const dd = new Date(d.getTime());
  dd.setUTCMonth(dd.getUTCMonth() + months);
  return dd;
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * POST /api/fiscal/constancia
 * multipart fields:
 *   - constancia (File): el archivo PDF/JPG/PNG
 *   - issued_at (string, opcional): YYYY-MM-DD. Requerido si NO se pudo
 *     extraer la fecha del PDF.
 */
export const uploadConstancia = async (req: Request, res: Response): Promise<any> => {
  const userId = (req as any).user?.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  return _upsertConstancia(userId, req, res);
};

/**
 * POST /api/advisor/clients/:clientId/constancia
 * Mismo flujo que uploadConstancia pero el asesor sube en nombre de un
 * cliente. El asesor debe ser dueño del cliente (advisor_id o referred_by_id).
 */
export const uploadConstanciaForClient = async (req: Request, res: Response): Promise<any> => {
  const advisorIdNum = (req as any).user?.userId;
  if (!advisorIdNum) return res.status(401).json({ error: 'No autenticado' });
  const role = String((req as any).user?.role || '').toLowerCase();
  const clientId = Number(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'clientId inválido' });
  // Staff con rol elevado puede subir por cualquier cliente; asesores solo
  // por sus clientes asignados.
  const elevatedRoles = ['super_admin', 'admin', 'director', 'branch_manager'];
  if (!elevatedRoles.includes(role)) {
    const owns = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND (advisor_id = $2 OR referred_by_id = $2) LIMIT 1`,
      [clientId, advisorIdNum]
    );
    if (owns.rows.length === 0) return res.status(403).json({ error: 'Cliente fuera de tu alcance' });
  }
  return _upsertConstancia(clientId, req, res);
};

/**
 * GET /api/advisor/clients/:clientId/constancia
 */
export const getClientConstanciaStatus = async (req: Request, res: Response): Promise<any> => {
  const advisorIdNum = (req as any).user?.userId;
  if (!advisorIdNum) return res.status(401).json({ error: 'No autenticado' });
  const role = String((req as any).user?.role || '').toLowerCase();
  const clientId = Number(req.params.clientId);
  if (!clientId) return res.status(400).json({ error: 'clientId inválido' });
  const elevatedRoles = ['super_admin', 'admin', 'director', 'branch_manager'];
  if (!elevatedRoles.includes(role)) {
    const owns = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND (advisor_id = $2 OR referred_by_id = $2) LIMIT 1`,
      [clientId, advisorIdNum]
    );
    if (owns.rows.length === 0) return res.status(403).json({ error: 'Cliente fuera de tu alcance' });
  }
  return _readConstanciaStatus(clientId, res);
};

/**
 * Implementación interna del upload — usada por uploadConstancia (self)
 * y uploadConstanciaForClient (asesor en nombre del cliente).
 */
const _upsertConstancia = async (userId: number, req: Request, res: Response): Promise<any> => {
  try {
    await ensureCsfColumns();

    const file: UploadedFile | undefined = (req as any).file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }
    const mime = String(file.mimetype || '').toLowerCase();
    const isAccepted = mime.includes('pdf') || mime.startsWith('image/');
    if (!isAccepted) {
      return res.status(400).json({ error: 'Formato no soportado. Sube PDF, JPG o PNG.' });
    }

    // 1) Intentar extraer la fecha del PDF
    let issuedAt: Date | null = await tryExtractIssueDateFromPdf(file);
    let detectionMethod: 'pdf_parse' | 'manual' = issuedAt ? 'pdf_parse' : 'manual';

    // 2) Fallback manual si no se logró
    if (!issuedAt) {
      const manualIso = String((req as any).body?.issued_at || '').slice(0, 10);
      if (manualIso && /^\d{4}-\d{2}-\d{2}$/.test(manualIso)) {
        const parsed = new Date(`${manualIso}T00:00:00.000Z`);
        if (!isNaN(parsed.getTime())) issuedAt = parsed;
      }
    }

    if (!issuedAt) {
      // No se pudo determinar la fecha → pedir input manual
      return res.status(422).json({
        error: 'no_issue_date',
        message: 'No pudimos leer automáticamente la fecha de emisión del PDF. Por favor indícala manualmente.',
        needs_manual_date: true,
      });
    }

    // 3) Validar vigencia: no más de 3 meses
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (issuedAt.getTime() > today.getTime()) {
      return res.status(400).json({
        error: 'future_date',
        message: 'La fecha de emisión no puede ser futura.',
      });
    }
    const ageMs = today.getTime() - issuedAt.getTime();
    if (ageMs > MAX_AGE_MS) {
      return res.status(400).json({
        error: 'expired',
        message: `Tu constancia tiene más de ${MONTHS_VALID} meses de antigüedad. Descarga una más reciente desde el portal SAT.`,
        issued_at: isoDate(issuedAt),
        detection_method: detectionMethod,
      });
    }

    // 4) Calcular valid_until = issued_at + 3 meses
    const validUntil = addMonths(issuedAt, MONTHS_VALID);

    // 5) Subir el archivo (a S3 si configurado; si no, data URL)
    const ext = (file.originalname.split('.').pop() || 'pdf').toLowerCase();
    const key = `fiscal/constancias/${userId}/${Date.now()}.${ext}`;
    const { uploadToS3, isS3Configured } = await import('./s3Service');
    let fileUrl: string;
    if (isS3Configured()) {
      fileUrl = await uploadToS3(file.buffer, key, file.mimetype || 'application/pdf');
    } else {
      fileUrl = `data:${file.mimetype || 'application/pdf'};base64,${file.buffer.toString('base64')}`;
    }

    // 6) Upsert en user_saved_documents
    await pool.query(
      `INSERT INTO user_saved_documents
         (user_id, document_type, file_url, original_filename, issued_at, valid_until, updated_at)
       VALUES ($1, 'constancia_fiscal', $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, document_type) DO UPDATE SET
         file_url = EXCLUDED.file_url,
         original_filename = EXCLUDED.original_filename,
         issued_at = EXCLUDED.issued_at,
         valid_until = EXCLUDED.valid_until,
         updated_at = NOW()`,
      [userId, fileUrl, file.originalname || 'constancia', isoDate(issuedAt), isoDate(validUntil)]
    );

    return res.json({
      ok: true,
      file_url: fileUrl,
      original_filename: file.originalname,
      issued_at: isoDate(issuedAt),
      valid_until: isoDate(validUntil),
      is_valid: true,
      detection_method: detectionMethod,
    });
  } catch (err: any) {
    console.error('[CSF] _upsertConstancia error:', err);
    return res.status(500).json({ error: 'Error al subir la constancia', details: err?.message });
  }
};

/**
 * GET /api/fiscal/constancia
 * Devuelve estado actual de la constancia del cliente con flag is_valid.
 */
export const getConstanciaStatus = async (req: Request, res: Response): Promise<any> => {
  const userId = (req as any).user?.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  return _readConstanciaStatus(userId, res);
};

const _readConstanciaStatus = async (userId: number, res: Response): Promise<any> => {
  try {
    await ensureCsfColumns();
    const r = await pool.query(
      `SELECT file_url, original_filename, issued_at, valid_until, updated_at
         FROM user_saved_documents
        WHERE user_id = $1 AND document_type = 'constancia_fiscal'
        LIMIT 1`,
      [userId]
    );
    if (r.rows.length === 0) {
      return res.json({ exists: false });
    }
    const row = r.rows[0];
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const validUntilDate = row.valid_until ? new Date(`${isoDate(new Date(row.valid_until))}T00:00:00.000Z`) : null;
    const isValid = !!(validUntilDate && validUntilDate.getTime() >= today.getTime());
    const daysToExpire = validUntilDate
      ? Math.ceil((validUntilDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    return res.json({
      exists: true,
      file_url: row.file_url,
      original_filename: row.original_filename,
      issued_at: row.issued_at ? isoDate(new Date(row.issued_at)) : null,
      valid_until: row.valid_until ? isoDate(new Date(row.valid_until)) : null,
      is_valid: isValid,
      days_to_expire: daysToExpire,
      updated_at: row.updated_at,
    });
  } catch (err: any) {
    console.error('[CSF] _readConstanciaStatus error:', err);
    return res.status(500).json({ error: 'Error al consultar constancia', details: err?.message });
  }
};
