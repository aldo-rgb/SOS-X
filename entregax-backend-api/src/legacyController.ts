import { Request, Response } from 'express';
import { pool } from './db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { sendWelcomeWhatsapp } from './whatsappService';

const JWT_SECRET = process.env.JWT_SECRET || 'EntregaX_SuperSecretKey_2026';

// Configurar multer para subir archivos
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

export const uploadMiddleware = upload.single('file');

/**
 * Parsear una línea TSV/CSV manejando comillas correctamente
 * Detecta automáticamente si es tab o comma separated
 */
function parseLine(line: string, delimiter: string = '\t'): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            // Quitar comillas externas si existen
            let val = current.trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            result.push(val);
            current = '';
        } else {
            current += char;
        }
    }
    // Último campo
    let val = current.trim();
    if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
    }
    result.push(val);
    return result;
}

/**
 * Importar clientes desde archivo legacy (TSV o CSV)
 * POST /api/legacy/import
 * Formato del archivo antiguo separado por tabs:
 * Columna 3: Nombre, Columna 7: Email, Columna 10: Box ID, Última: Fecha
 */
export const importLegacyClients = async (req: Request, res: Response): Promise<any> => {
    try {
        const file = (req as any).file as Express.Multer.File | undefined;
        
        if (!file) {
            return res.status(400).json({ error: 'No se proporcionó archivo' });
        }

        const filePath = file.path;
        const fileName = (file.originalname || '').toLowerCase();
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.xlsm');

        let lineas: string[] = [];
        let excelRows: string[][] = [];

        if (isExcel) {
            // Parsear Excel: array de arrays (cada fila es un array de strings)
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
                fs.unlinkSync(filePath);
                return res.status(400).json({ error: 'El archivo Excel no contiene hojas' });
            }
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) {
                fs.unlinkSync(filePath);
                return res.status(400).json({ error: 'No se pudo leer la hoja del Excel' });
            }
            const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
            excelRows = (raw as any[][])
                .map((row) => row.map((c) => (c === null || c === undefined ? '' : String(c).trim())))
                .filter((row) => row.some((c) => c && c.length > 0));
        } else {
            const data = fs.readFileSync(filePath, 'utf8');
            lineas = data.split('\n').filter(l => l.trim());
        }

        let importados = 0;
        let errores = 0;
        let duplicados = 0;
        const errorList: string[] = [];

        // Detectar delimitador (tab o coma) — solo aplica a TXT/CSV
        const firstLine = lineas[0] || '';
        const delimiter = firstLine.includes('\t') ? '\t' : ',';

        // Detectar si tiene header y el formato del archivo
        const firstRow: string[] = isExcel
            ? (excelRows[0] || [])
            : parseLine(firstLine, delimiter);
        const firstRowJoined = firstRow.join(' ').toLowerCase();
        const hasHeader = firstRowJoined.includes('casillero') ||
                          firstRowJoined.includes('box_id') ||
                          firstRowJoined.includes('nombre') ||
                          firstRowJoined.includes('email') ||
                          firstRowJoined.includes('correo');

        // Detectar índices automáticamente basándose en header o formato
        let boxIdIndex = 0;
        let fullNameIndex = 1;
        let emailIndex = 2;
        let dateIndex = -1;

        if (hasHeader) {
            // Buscar índices por nombre de columna
            const headerLower = firstRow.map(h => h.toLowerCase().trim());
            const boxIdx = headerLower.findIndex(h => h.includes('casillero') || h.includes('box_id') || h === 'box');
            const nameIdx = headerLower.findIndex(h => h.includes('nombre') || h.includes('name'));
            const emailIdx = headerLower.findIndex(h => h.includes('correo') || h.includes('email') || h.includes('mail'));
            const dateIdx = headerLower.findIndex(h => h.includes('fecha') || h.includes('date') || h.includes('alta'));

            if (boxIdx !== -1) boxIdIndex = boxIdx;
            if (nameIdx !== -1) fullNameIndex = nameIdx;
            if (emailIdx !== -1) emailIndex = emailIdx;
            if (dateIdx !== -1) dateIndex = dateIdx;
        } else if (!isExcel && firstRow.length > 10) {
            // Formato legacy antiguo con muchas columnas (TSV del sistema viejo)
            boxIdIndex = 14;
            fullNameIndex = 3;
            emailIndex = 7;
            dateIndex = -1;
        } else {
            // Formato Excel del nuevo Acta de Clientes (sin header):
            // A=Casillero, B=Nombre, C=Correo (col D = teléfono se ignora)
            boxIdIndex = 0;
            fullNameIndex = 1;
            emailIndex = 2;
            dateIndex = -1;
        }

        // Índice de inicio (saltar header si existe)
        const startIndex = hasHeader ? 1 : 0;
        const totalRows = isExcel ? excelRows.length : lineas.length;

        for (let i = startIndex; i < totalRows; i++) {
            const campos: string[] = isExcel
                ? (excelRows[i] || [])
                : parseLine(lineas[i] || '', delimiter);
            if (!campos || campos.length === 0) continue;

            try {
                // Extraer campos según índices detectados
                const boxId = campos[boxIdIndex] || '';
                const fullName = campos[fullNameIndex] || '';
                const email = campos[emailIndex] || '';

                // Buscar fecha - primero en índice detectado, luego en última columna
                let registrationDate: string | null = null;

                if (dateIndex >= 0) {
                    const fechaCampo = campos[dateIndex] as string | undefined;
                    if (fechaCampo && fechaCampo.match(/^\d{4}-\d{2}-\d{2}/)) {
                        registrationDate = fechaCampo.split(' ')[0] || null;
                    }
                }

                if (!registrationDate) {
                    for (let j = campos.length - 1; j >= 0; j--) {
                        const campo = campos[j];
                        if (campo && campo.match(/^\d{4}-\d{2}-\d{2}/)) {
                            registrationDate = campo.split(' ')[0] || null;
                            break;
                        }
                    }
                }

                // Validar campos mínimos
                if (!boxId || boxId === '\\N' || boxId === 'N' || boxId === '') {
                    errores++;
                    continue;
                }
                if (!/^(S|RT)\d+/i.test(boxId.trim())) {
                    // saltar filas que no son clientes (ej. encabezados, separadores)
                    errores++;
                    continue;
                }

                // Limpiar email y nombre
                const cleanEmail = email && email !== '\\N' && email !== '' ? email.toLowerCase().trim() : null;
                const cleanName = fullName && fullName !== '\\N' && fullName !== '' ? fullName.trim() : null;
                const cleanBoxId = boxId.trim().toUpperCase();

                // Insertar en la BD (sin teléfono - solo box_id, nombre, email, fecha)
                const result = await pool.query(`
                    INSERT INTO legacy_clients (box_id, full_name, email, registration_date)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (box_id) DO UPDATE SET
                        full_name = COALESCE(EXCLUDED.full_name, legacy_clients.full_name),
                        email = COALESCE(EXCLUDED.email, legacy_clients.email)
                    WHERE legacy_clients.is_claimed = FALSE
                    RETURNING (xmax = 0) AS inserted
                `, [cleanBoxId, cleanName, cleanEmail, registrationDate]);

                if (result.rowCount && result.rowCount > 0) {
                    if ((result.rows[0] as any)?.inserted) {
                        importados++;
                    } else {
                        duplicados++;
                    }
                } else {
                    duplicados++;
                }

            } catch (error: any) {
                errores++;
                if (errorList.length < 10) {
                    const sample = isExcel
                        ? (excelRows[i] || []).join(' | ')
                        : (lineas[i] || '').substring(0, 100);
                    errorList.push(`Fila con error: ${sample}... (${error?.message || 'error desconocido'})`);
                }
            }
        }

        // Eliminar archivo temporal
        try { fs.unlinkSync(filePath); } catch {}

        res.json({
            success: true,
            message: 'Importación completada',
            stats: {
                importados,
                duplicados,
                errores,
                total: totalRows - startIndex
            },
            erroresEjemplo: errorList
        });

    } catch (error: any) {
        console.error('Error en importación:', error);
        res.status(500).json({ error: 'Error al importar archivo', details: error.message });
    }
};

/**
 * Sincronizar clientes legacy desde el sistema EntregaX viejo (sistemaentregax.com)
 * POST /api/legacy/sync-external
 *
 * Consume el endpoint público: https://sistemaentregax.com/api/customers/list-customers-admin
 * Estructura esperada: { status: 'success', data: [{ suite, nombre, correo, telefono, asesor, token }] }
 * Hace upsert sobre legacy_clients (suite -> box_id, nombre -> full_name, correo -> email).
 * No sobreescribe registros que ya fueron reclamados (is_claimed = TRUE).
 */
export const syncExternalLegacyClients = async (_req: Request, res: Response): Promise<any> => {
    const EXTERNAL_URL = 'https://sistemaentregax.com/api/customers/list-customers-admin';
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        let response: any;
        try {
            response = await (globalThis as any).fetch(EXTERNAL_URL, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal as any
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return res.status(502).json({
                error: 'No se pudo consultar el sistema EntregaX externo',
                status: response.status
            });
        }

        const payload: any = await response.json();
        const rows: any[] = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);

        if (rows.length === 0) {
            return res.json({
                success: true,
                message: 'El sistema externo no devolvió clientes',
                stats: { total: 0, importados: 0, actualizados: 0, omitidos: 0, errores: 0 }
            });
        }

        let importados = 0;
        let actualizados = 0;
        let omitidos = 0;
        let errores = 0;
        const errorList: string[] = [];

        for (const row of rows) {
            try {
                const rawBoxId = (row?.suite ?? '').toString().trim().toUpperCase();
                if (!rawBoxId || !/^(S|RT)\d+/i.test(rawBoxId)) {
                    omitidos++;
                    continue;
                }
                const fullName = row?.nombre ? String(row.nombre).trim() : null;
                const email = row?.correo ? String(row.correo).toLowerCase().trim() : null;
                const asesor = row?.asesor ? String(row.asesor).trim() : null;
                const phone = row?.telefono ? String(row.telefono).trim() : null;
                const lastSend = row?.last_send || null;
                const lastSendMaritimo = row?.last_send_maritimo || null;

                // Upsert: nombre/correo solo para no reclamados; asesor, phone y last_send siempre
                const result = await pool.query(`
                    INSERT INTO legacy_clients (box_id, full_name, email, registration_date, asesor, phone, last_send, last_send_maritimo)
                    VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)
                    ON CONFLICT (box_id) DO UPDATE SET
                        full_name = CASE WHEN legacy_clients.is_claimed = FALSE
                            THEN COALESCE(EXCLUDED.full_name, legacy_clients.full_name)
                            ELSE legacy_clients.full_name END,
                        email = CASE WHEN legacy_clients.is_claimed = FALSE
                            THEN COALESCE(EXCLUDED.email, legacy_clients.email)
                            ELSE legacy_clients.email END,
                        asesor = COALESCE(EXCLUDED.asesor, legacy_clients.asesor),
                        phone = COALESCE(EXCLUDED.phone, legacy_clients.phone),
                        last_send = EXCLUDED.last_send,
                        last_send_maritimo = EXCLUDED.last_send_maritimo,
                        -- Si tenía chartback activo y ahora se le asigna asesor → recuperado
                        chartback = CASE
                            WHEN legacy_clients.chartback = true AND EXCLUDED.asesor IS NOT NULL
                            THEN false
                            ELSE legacy_clients.chartback END,
                        chartback_status = CASE
                            WHEN legacy_clients.chartback = true AND EXCLUDED.asesor IS NOT NULL
                            THEN 'recovered'
                            ELSE legacy_clients.chartback_status END
                    RETURNING (xmax = 0) AS inserted
                `, [rawBoxId, fullName, email, asesor, phone,
                    lastSend ? JSON.stringify(lastSend) : null,
                    lastSendMaritimo ? JSON.stringify(lastSendMaritimo) : null]);

                if (result.rowCount && result.rowCount > 0) {
                    if ((result.rows[0] as any)?.inserted) {
                        importados++;
                    } else {
                        actualizados++;
                    }
                } else {
                    // Conflicto pero ya estaba reclamado -> no se tocó
                    omitidos++;
                }
            } catch (rowErr: any) {
                errores++;
                if (errorList.length < 10) {
                    errorList.push(`${row?.suite || '?'}: ${rowErr?.message || 'error'}`);
                }
            }
        }

        return res.json({
            success: true,
            message: 'Sincronización completada',
            stats: {
                total: rows.length,
                importados,
                actualizados,
                omitidos,
                errores
            },
            erroresEjemplo: errorList
        });
    } catch (error: any) {
        console.error('Error sincronizando clientes legacy externos:', error);
        return res.status(500).json({
            error: 'Error al sincronizar clientes desde el sistema externo',
            details: error?.message || String(error)
        });
    }
};

/**
 * GET /api/external/customers
 * Endpoint público (API key) para que el sistema EX consulte nuestros clientes.
 * Devuelve el mismo formato que sistemaentregax.com/api/customers/list-customers-admin:
 *   { data: [{ suite, nombre, correo, telefono, created_at }] }
 *
 * Query params opcionales:
 *   ?since=YYYY-MM-DD  → solo clientes creados/actualizados desde esa fecha
 *   ?page=1&limit=500  → paginación (default limit 1000)
 */
export const listCustomersForExternalSync = async (req: Request, res: Response): Promise<any> => {
    // 1. Verificar flag de habilitación y obtener API key desde DB
    try {
        const cfgRows = await pool.query(
            `SELECT config_key, config_value FROM system_configurations
             WHERE config_key IN ('external_sync_enabled', 'external_sync_api_key') AND is_active = TRUE`
        );
        const byKey: Record<string, any> = {};
        cfgRows.rows.forEach((row: any) => { byKey[row.config_key] = row.config_value; });

        const syncEnabled = byKey['external_sync_enabled'] !== undefined
            ? byKey['external_sync_enabled']?.enabled !== false
            : true; // fallback: activo si nunca se ha configurado

        if (!syncEnabled) {
            return res.status(503).json({ success: false, error: 'La sincronización externa está desactivada.' });
        }

        const dbKey = byKey['external_sync_api_key']?.key || null;
        const expectedKey = dbKey || process.env.EXTERNAL_SYNC_API_KEY || null;
        const apiKey = req.headers['x-api-key'] || req.query.api_key;

        if (!expectedKey || apiKey !== expectedKey) {
            return res.status(401).json({ success: false, error: 'API Key inválida o no autorizada.' });
        }
    } catch (_e) {
        return res.status(500).json({ success: false, error: 'Error interno al validar acceso.' });
    }

    try {
        const since = req.query.since ? String(req.query.since) : null;
        const limit = Math.min(Number(req.query.limit) || 1000, 5000);
        const page = Math.max(Number(req.query.page) || 1, 1);
        const offset = (page - 1) * limit;

        const conditions: string[] = ["role = 'client'", "box_id IS NOT NULL"];
        const params: any[] = [];

        if (since) {
            params.push(since);
            conditions.push(`created_at >= $${params.length}`);
        }

        params.push(limit, offset);
        const where = conditions.join(' AND ');

        const result = await pool.query(`
            SELECT
                box_id   AS suite,
                full_name AS nombre,
                email    AS correo,
                phone    AS telefono,
                created_at
            FROM users
            WHERE ${where}
            ORDER BY created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        const countResult = await pool.query(
            `SELECT COUNT(*) AS total FROM users WHERE ${where}`,
            params.slice(0, params.length - 2)
        );

        return res.json({
            success: true,
            total: Number(countResult.rows[0].total),
            page,
            limit,
            data: result.rows
        });
    } catch (error: any) {
        console.error('Error en listCustomersForExternalSync:', error);
        return res.status(500).json({ error: 'Error al obtener clientes', details: error?.message });
    }
};

/**
 * Obtener lista de clientes legacy
 * GET /api/legacy/clients
 */
export const getLegacyClients = async (req: Request, res: Response): Promise<any> => {
    try {
        const { page = 1, limit = 50, search, claimed, asesor, chartback, recovered, retention, hideRecovered, lastSendFrom, lastSendTo, withShipment } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const limitNum = Number(limit);

        const conditions: string[] = [];
        const params: any[] = [];

        // Filtro texto (casillero, nombre, correo) — incluye datos del usuario reclamado si el legacy está borrado
        if (search && String(search).trim() !== '') {
            const words = String(search).trim().split(/\s+/).filter(w => w.length > 0);
            for (const w of words) {
                params.push(`%${w}%`);
                const p = params.length;
                conditions.push(
                    `(lc.box_id ILIKE $${p}
                      OR COALESCE(lc.full_name, u_s.full_name) ILIKE $${p}
                      OR COALESCE(lc.email, u_s.email) ILIKE $${p})`
                );
            }
        }

        // Filtro claimed
        if (claimed === 'true') {
            conditions.push(`lc.is_claimed = TRUE`);
        }

        // Filtro asesor
        if (asesor && String(asesor).trim() !== '') {
            params.push(String(asesor).trim());
            conditions.push(`lc.asesor = $${params.length}`);
        }

        // Filtro chartback (excluye recuperados aunque haya inconsistencias de formato)
        if (chartback === 'true') {
            conditions.push(`lc.chartback = TRUE AND LOWER(TRIM(COALESCE(lc.chartback_status, ''))) <> 'recovered'`);
        }

        // Filtro recuperados
        if (recovered === 'true') {
            conditions.push(`LOWER(TRIM(COALESCE(lc.chartback_status, ''))) = 'recovered'`);
        }

        // Filtro retención
        if (retention === 'true') {
            conditions.push(`LOWER(TRIM(COALESCE(lc.chartback_status, ''))) = 'retention'`);
        }

        // Ocultar recuperados
        if (hideRecovered === 'true') {
            conditions.push(`LOWER(TRIM(COALESCE(lc.chartback_status, ''))) <> 'recovered'`);
        }

        // Solo con carga recibida (tiene al menos un envío registrado)
        if (withShipment === 'true') {
            conditions.push(`(lc.last_send IS NOT NULL OR lc.last_send_maritimo IS NOT NULL)`);
        }

        // Filtro por fecha de último envío (aéreo o marítimo)
        if ((lastSendFrom && String(lastSendFrom).trim() !== '') || (lastSendTo && String(lastSendTo).trim() !== '')) {
            // Las fechas legacy están en texto 'D/M/YYYY' o 'DD/MM/YYYY'.
            // Las convertimos a 'YYYY-MM-DD' con SPLIT_PART + LPAD para poder compararlas
            // directamente como texto con los parámetros ISO del frontend (YYYY-MM-DD).
            const toIso = (field: string) => `
                CASE WHEN ${field} ~ '^[0-9]+/[0-9]+/[0-9]{4}$' THEN
                    LPAD(SPLIT_PART(${field}, '/', 3), 4, '0') || '-' ||
                    LPAD(SPLIT_PART(${field}, '/', 2), 2, '0') || '-' ||
                    LPAD(SPLIT_PART(${field}, '/', 1), 2, '0')
                ELSE NULL END`;

            const latestDateExpr = `GREATEST(
                ${toIso(`lc.last_send->>'Fecha de ingreso'`)},
                ${toIso(`lc.last_send->>'Fecha de salida'`)},
                ${toIso(`lc.last_send_maritimo->>'Fecha de ingreso'`)},
                ${toIso(`lc.last_send_maritimo->>'Fecha de salida'`)}
            )`;

            // Solo clientes con al menos un envío registrado
            conditions.push(`(lc.last_send IS NOT NULL OR lc.last_send_maritimo IS NOT NULL)`);
            conditions.push(`${latestDateExpr} IS NOT NULL`);

            if (lastSendFrom && String(lastSendFrom).trim() !== '') {
                params.push(String(lastSendFrom).trim()); // YYYY-MM-DD
                conditions.push(`${latestDateExpr} >= $${params.length}`);
            }
            if (lastSendTo && String(lastSendTo).trim() !== '') {
                params.push(String(lastSendTo).trim()); // YYYY-MM-DD
                conditions.push(`${latestDateExpr} <= $${params.length}`);
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const joinClause = `FROM legacy_clients lc
             LEFT JOIN users u_s ON u_s.id = lc.claimed_by_user_id`;

        const countResult = await pool.query(
            `SELECT COUNT(*) ${joinClause} ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        const dataParams = [...params, limitNum, offset];
        const result = await pool.query(
            `SELECT lc.*,
                    COALESCE(lc.full_name, u_s.full_name) as full_name,
                    COALESCE(lc.email, u_s.email) as email,
                    u_s.full_name as claimed_by_name,
                    COALESCE(adv.full_name, rec_adv.full_name) as asesor_entregax
             ${joinClause}
             LEFT JOIN users adv ON adv.id = u_s.advisor_id
             LEFT JOIN users rec_adv ON rec_adv.id = lc.recovery_advisor_id
             ${whereClause}
             ORDER BY lc.created_at DESC
             LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
            dataParams
        );

        // Lista de asesores únicos para el dropdown (solo cuando no hay filtro de asesor activo)
        let asesores: string[] = [];
        if (!asesor) {
            const asesorRes = await pool.query(
                `SELECT DISTINCT asesor FROM legacy_clients WHERE asesor IS NOT NULL AND asesor <> '' ORDER BY asesor`
            );
            asesores = asesorRes.rows.map((r: any) => r.asesor);
        }

        return res.json({
            clients: result.rows,
            pagination: { page: Number(page), limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
            asesores,
        });
    } catch (error: any) {
        console.error('Error obteniendo clientes legacy:', error.message);
        res.status(500).json({ error: 'Error al obtener clientes', details: error.message });
    }
};

/**
 * Estadísticas de migración
 * GET /api/legacy/stats
 */
export const getLegacyStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const [totalsRes, asesorRes] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_claimed = true) as claimed,
                    COUNT(*) FILTER (WHERE is_claimed = false) as pending
                FROM legacy_clients
            `),
            pool.query(`
                SELECT
                    COALESCE(asesor, 'Sin Asesor') as asesor,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_claimed = true) as reclamados,
                    COUNT(*) FILTER (WHERE is_claimed = false) as pendientes
                FROM legacy_clients
                GROUP BY COALESCE(asesor, 'Sin Asesor')
                ORDER BY COUNT(*) DESC
            `)
        ]);

        const chartbackRes = await pool.query(
            `SELECT COUNT(*) FILTER (WHERE chartback = true) as chartback_count FROM legacy_clients`
        );

        res.json({
            ...totalsRes.rows[0],
            chartback_count: parseInt(chartbackRes.rows[0].chartback_count || '0'),
            por_asesor: asesorRes.rows,
        });

    } catch (error: any) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

/**
 * Reclamar cuenta legacy (usado en el registro de la app)
 * POST /api/legacy/claim
 */
export const claimLegacyAccount = async (req: Request, res: Response): Promise<any> => {
    const client = await pool.connect();
    
    try {
        const { boxId, email, newPassword, phone, fullName, referralCodeInput } = req.body;

        // Validaciones básicas
        if (!boxId || !email || !newPassword) {
            return res.status(400).json({ 
                error: 'Se requiere número de casillero, correo y contraseña' 
            });
        }

        // Tel\u00e9fono ahora es obligatorio (verificaci\u00f3n WhatsApp)
        if (!phone || String(phone).replace(/\D/g, '').length < 10) {
            return res.status(400).json({
                error: 'El n\u00famero de WhatsApp es obligatorio (con c\u00f3digo de pa\u00eds).',
                code: 'PHONE_REQUIRED'
            });
        }

        await client.query('BEGIN');

        // 1. Buscar en la base de datos legacy
        const legacyCheck = await client.query(
            'SELECT id, box_id, full_name, email, is_claimed, chartback, chartback_activity FROM legacy_clients WHERE box_id = $1',
            [boxId.toUpperCase().trim()]
        );

        if (legacyCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: 'Número de casillero no encontrado. Verifica que sea correcto o contacta a soporte.',
                code: 'BOX_NOT_FOUND'
            });
        }

        const legacyUser = legacyCheck.rows[0];

        // 2. Verificar que no haya sido reclamado (chartback clients can always re-activate)
        if (legacyUser.is_claimed && !legacyUser.chartback) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Este casillero ya fue registrado. Si eres el dueño legítimo, contacta a soporte.',
                code: 'ALREADY_CLAIMED'
            });
        }

        const isChartbackReactivation = !!(legacyUser.is_claimed && legacyUser.chartback);

        // 3. Validar identidad - omitir para chartback re-activaciones (email/nombre ya fueron limpiados al primer claim)
        if (!isChartbackReactivation) {
            const emailMatch = legacyUser.email &&
                legacyUser.email.toLowerCase() === email.toLowerCase().trim();

            const nameMatch = legacyUser.full_name && fullName &&
                legacyUser.full_name.toLowerCase().includes(fullName.toLowerCase().trim().split(' ')[0]);

            if (!emailMatch && !nameMatch) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    error: 'Los datos proporcionados no coinciden con el casillero. Verifica tu información.',
                    code: 'DATA_MISMATCH'
                });
            }
        }

        // 4. Buscar usuario existente
        let existingUserId: number | null = null;

        if (isChartbackReactivation) {
            // El cliente ya tiene cuenta — buscar por box_id (email fue limpiado en legacy_clients)
            const byBox = await client.query(
                'SELECT id FROM users WHERE UPPER(TRIM(box_id)) = $1 ORDER BY created_at DESC LIMIT 1',
                [boxId.toUpperCase().trim()]
            );
            if (byBox.rows.length > 0) {
                existingUserId = byBox.rows[0].id;
            }
            // Verificar que el nuevo correo no esté tomado por otro usuario
            const emailConflict = await client.query(
                'SELECT id FROM users WHERE email = $1 AND UPPER(TRIM(box_id)) != $2',
                [email.toLowerCase().trim(), boxId.toUpperCase().trim()]
            );
            if (emailConflict.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: 'Este correo ya está registrado en el sistema.',
                    code: 'EMAIL_EXISTS'
                });
            }
        } else {
            const emailExists = await client.query(
                'SELECT id, box_id FROM users WHERE email = $1',
                [email.toLowerCase().trim()]
            );
            if (emailExists.rows.length > 0) {
                const existingUser = emailExists.rows[0];
                const sameBox = existingUser.box_id?.toUpperCase() === boxId.toUpperCase();
                if (sameBox) {
                    existingUserId = existingUser.id;
                } else {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        error: 'Este correo ya está registrado en el sistema.',
                        code: 'EMAIL_EXISTS'
                    });
                }
            }
        }

        // 5. Crear o actualizar el usuario oficial
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const finalName = fullName || legacyUser.full_name;
        const finalEmail = email.toLowerCase().trim();

        let newUserId: number;

        if (existingUserId) {
            // Actualizar cuenta existente (mismo cliente, reclama de nuevo)
            // Chartback re-activations keep their existing verification status
            if (isChartbackReactivation) {
                await client.query(`
                    UPDATE users
                    SET password = $1,
                        phone = COALESCE($2, phone),
                        full_name = COALESCE($3, full_name),
                        email = $5
                    WHERE id = $4
                `, [hashedPassword, phone || null, finalName, existingUserId, finalEmail]);
            } else {
                await client.query(`
                    UPDATE users
                    SET password = $1,
                        phone = COALESCE($2, phone),
                        full_name = COALESCE($3, full_name),
                        email = $5,
                        verification_status = 'not_started',
                        is_verified = FALSE
                    WHERE id = $4
                `, [hashedPassword, phone || null, finalName, existingUserId, finalEmail]);
            }
            newUserId = existingUserId;
        } else {
            // Generar código de referido único
            const myReferralCode = `EX${Date.now().toString(36).toUpperCase()}`;

            const newUser = await client.query(`
                INSERT INTO users (
                    full_name, email, password, role, box_id, phone,
                    referral_code, verification_status, is_verified, created_at
                )
                VALUES ($1, $2, $3, 'client', $4, $5, $6, 'not_started', FALSE, NOW())
                RETURNING id, full_name, email, role, box_id
            `, [finalName, finalEmail, hashedPassword, boxId.toUpperCase(), phone || null, myReferralCode]);

            newUserId = newUser.rows[0].id;
        }

        // 6. Marcar como reclamado y LIMPIAR datos sensibles del legacy.
        await client.query(`
            UPDATE legacy_clients
            SET is_claimed = TRUE,
                claimed_by_user_id = $1,
                claimed_at = NOW(),
                email = NULL,
                full_name = NULL
                ${isChartbackReactivation ? ", chartback_status = 'recovered', chartback = FALSE" : ''}
            WHERE box_id = $2
        `, [newUserId, boxId.toUpperCase()]);

        // 6.1 Auto-reclamar paquetes huérfanos (user_id NULL + mismo box_id).
        const claimedPkgs = await client.query(`
            UPDATE packages
            SET user_id = $1, updated_at = NOW()
            WHERE user_id IS NULL
              AND UPPER(TRIM(box_id)) = $2
            RETURNING id, service_type
        `, [newUserId, boxId.toUpperCase().trim()]);
        if (claimedPkgs.rowCount && claimedPkgs.rowCount > 0) {
            const byService: Record<string, number> = {};
            claimedPkgs.rows.forEach((p: any) => {
                const svc = p.service_type || 'unknown';
                byService[svc] = (byService[svc] || 0) + 1;
            });
            console.log(`[LEGACY-CLAIM] ✅ ${claimedPkgs.rowCount} paquetes reclamados para ${boxId.toUpperCase()} (user ${newUserId}):`, byService);
        }

        // 6.2 Auto-reclamar órdenes marítimas huérfanas (user_id NULL + mismo shipping_mark).
        const claimedMaritime = await client.query(`
            UPDATE maritime_orders
            SET user_id = $1, updated_at = NOW()
            WHERE user_id IS NULL
              AND UPPER(TRIM(shipping_mark)) = $2
            RETURNING id
        `, [newUserId, boxId.toUpperCase().trim()]);
        if (claimedMaritime.rowCount && claimedMaritime.rowCount > 0) {
            console.log(`[LEGACY-CLAIM] ✅ ${claimedMaritime.rowCount} órdenes marítimas reclamadas para ${boxId.toUpperCase()} (user ${newUserId})`);
        }

        // 7. Procesar código de referido (asesor o amigo)
        let hasAdvisor = false;
        let referredBy = null;
        
        console.log('🔍 Procesando referralCodeInput:', referralCodeInput);
        
        if (referralCodeInput) {
            const codeUpper = referralCodeInput.trim().toUpperCase();
            // Normalizar código: agregar guión si no lo tiene (CHRI3225 -> CHRI-3225)
            const codeToCheck = codeUpper.includes('-') 
                ? codeUpper 
                : codeUpper.length >= 5 
                    ? `${codeUpper.slice(0, 4)}-${codeUpper.slice(4)}`
                    : codeUpper;
            console.log('🔍 Código a verificar (normalizado):', codeToCheck, 'Original:', codeUpper);
            
            // Buscar si es un código de asesor (buscar ambos formatos)
            const advisorCheck = await client.query(`
                SELECT id, full_name FROM users 
                WHERE (referral_code = $1 OR referral_code = $2) AND role = 'advisor'
            `, [codeUpper, codeToCheck]);
            
            console.log('🔍 Asesor encontrado:', advisorCheck.rows);
            
            if (advisorCheck.rows.length > 0) {
                // Asignar asesor
                await client.query(`
                    UPDATE users SET advisor_id = $1 WHERE id = $2
                `, [advisorCheck.rows[0].id, newUserId]);
                hasAdvisor = true;
                console.log('✅ Asesor asignado:', advisorCheck.rows[0].full_name);
            } else {
                // Buscar si es código de amigo (buscar ambos formatos)
                const friendCheck = await client.query(`
                    SELECT id, full_name FROM users 
                    WHERE (referral_code = $1 OR referral_code = $2) AND role = 'client'
                `, [codeUpper, codeToCheck]);
                
                if (friendCheck.rows.length > 0) {
                    // Registrar en tabla de referidos
                    await client.query(`
                        UPDATE users SET referred_by_id = $1 WHERE id = $2
                    `, [friendCheck.rows[0].id, newUserId]);
                    
                    await client.query(`
                        INSERT INTO referidos (referidor_id, referido_id, bonus_mxn, is_paid, created_at)
                        VALUES ($1, $2, 500, false, NOW())
                    `, [friendCheck.rows[0].id, newUserId]);
                    
                    referredBy = friendCheck.rows[0].full_name;
                }
            }
        }

        await client.query('COMMIT');

        // 7.5 Mensaje de bienvenida por WhatsApp (no bloqueante)
        if (phone) {
            sendWelcomeWhatsapp({
                phone,
                fullName: finalName,
                boxId: boxId.toUpperCase(),
            }).catch(err => console.error('[LEGACY CLAIM] WhatsApp bienvenida falló:', err));
        }

        // 8. Generar JWT
        const token = jwt.sign(
            {
                userId: newUserId,
                email: finalEmail,
                role: 'client',
                boxId: boxId.toUpperCase(),
                isLegacy: true
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: '¡Bienvenido de vuelta! Tu casillero ha sido vinculado exitosamente.',
            token,
            user: {
                id: newUserId,
                full_name: finalName,
                email: finalEmail,
                role: 'client',
                box_id: boxId.toUpperCase(),
                phone: phone || null,
                phoneVerified: false,
                hasAdvisor,
                referredBy,
                isLegacy: true
            }
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error reclamando cuenta:', error.message, error.stack);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    } finally {
        client.release();
    }
};

/**
 * Verificar si un casillero existe en legacy (para validación en frontend)
 * GET /api/legacy/verify/:boxId
 */
export const verifyLegacyBox = async (req: Request, res: Response): Promise<any> => {
    try {
        const boxId = req.params.boxId as string;

        if (!boxId) {
            return res.status(400).json({ error: 'Box ID requerido' });
        }

        const result = await pool.query(
            `SELECT box_id, full_name, is_claimed, chartback,
                    CASE WHEN email IS NOT NULL THEN
                        CONCAT(LEFT(email, 2), '***@', SPLIT_PART(email, '@', 2))
                    ELSE NULL END as email_hint
             FROM legacy_clients
             WHERE box_id = $1`,
            [boxId.toUpperCase()]
        );

        if (result.rows.length === 0) {
            return res.json({ exists: false });
        }

        const client = result.rows[0];
        // Chartback clients are allowed to re-activate even if already claimed
        const effectivelyClaimed = client.is_claimed && !client.chartback;

        res.json({
            exists: true,
            isClaimed: effectivelyClaimed,
            isChartback: !!client.chartback,
            nameHint: client.full_name ?
                client.full_name.split(' ')[0] + ' ***' : null,
            emailHint: client.email_hint
        });

    } catch (error: any) {
        console.error('Error verificando casillero:', error);
        res.status(500).json({ error: 'Error al verificar' });
    }
};

/**
 * Verificar nombre de cliente existente
 * POST /api/legacy/verify-name
 * Body: { boxId: string, fullName: string }
 * Retorna los datos del cliente si el nombre coincide
 */

// Función para normalizar texto (quitar acentos, minúsculas)
const normalizeText = (text: string): string => {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9\s]/g, '') // Solo letras, números y espacios
        .trim();
};

export const verifyLegacyName = async (req: Request, res: Response): Promise<any> => {
    try {
        const { boxId, fullName } = req.body;

        if (!boxId || !fullName) {
            return res.status(400).json({ error: 'Número de cliente y nombre son requeridos' });
        }

        const result = await pool.query(
            `SELECT id, box_id, full_name, email, is_claimed, chartback, registration_date
             FROM legacy_clients
             WHERE box_id = $1`,
            [boxId.toUpperCase().trim()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                exists: false,
                error: 'No encontramos este número de cliente'
            });
        }

        const client = result.rows[0];

        // Chartback clients can always re-activate even if already claimed
        if (client.is_claimed && !client.chartback) {
            return res.status(400).json({
                exists: true,
                isClaimed: true,
                error: 'Este número de cliente ya fue registrado. Si eres el dueño, contacta soporte.'
            });
        }

        // Chartback re-activation: email/name were cleared on first claim — fetch from users table
        if (client.is_claimed && client.chartback) {
            const userRow = await pool.query(
                'SELECT full_name, email, phone FROM users WHERE UPPER(TRIM(box_id)) = $1 LIMIT 1',
                [boxId.toUpperCase().trim()]
            );
            const userData = userRow.rows[0];
            return res.json({
                exists: true,
                nameMatch: true,
                isClaimed: false,
                clientData: {
                    boxId: client.box_id,
                    fullName: userData?.full_name || '',
                    email: userData?.email || '',
                    phone: userData?.phone || '',
                    registrationDate: client.registration_date
                }
            });
        }

        // Normalizar nombres para comparación flexible
        const inputNormalized = normalizeText(fullName);
        const storedNormalized = normalizeText(client.full_name || '');
        
        // Separar en palabras
        const inputWords = inputNormalized.split(/\s+/).filter(w => w.length > 1);
        const storedWords = storedNormalized.split(/\s+/).filter(w => w.length > 1);
        
        // Contar cuántas palabras del input coinciden con las almacenadas
        let matchCount = 0;
        for (const inputWord of inputWords) {
            for (const storedWord of storedWords) {
                // Coincidencia exacta o una contiene a la otra
                if (inputWord === storedWord || 
                    storedWord.includes(inputWord) || 
                    inputWord.includes(storedWord)) {
                    matchCount++;
                    break;
                }
            }
        }
        
        // Requiere al menos 2 palabras que coincidan, o el primer nombre
        const firstNameMatches = inputWords[0] === storedWords[0] || 
                                 (storedWords[0] && inputWords[0] && 
                                  (storedWords[0].includes(inputWords[0]) || inputWords[0].includes(storedWords[0])));
        
        const nameMatches = matchCount >= 2 || (matchCount >= 1 && firstNameMatches);

        if (!nameMatches) {
            return res.status(403).json({ 
                exists: true,
                nameMatch: false,
                error: 'El nombre no coincide con nuestros registros'
            });
        }

        // Retornar datos del cliente para que actualice/confirme
        res.json({
            exists: true,
            nameMatch: true,
            isClaimed: false,
            clientData: {
                boxId: client.box_id,
                fullName: client.full_name,
                email: client.email || '',
                registrationDate: client.registration_date
            }
        });

    } catch (error: any) {
        console.error('Error verificando nombre:', error.message, error.stack);
        res.status(500).json({ error: 'Error al verificar', details: error.message });
    }
};

/**
 * Clientes chartback del asesor actual
 * GET /api/advisor/legacy/chartback
 */
export const getAdvisorChartbackClients = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.userId;
        // Solo muestra clientes asignados a este asesor, listos para contactar
        const result = await pool.query(
            `SELECT id, box_id, full_name, email, phone, chartback_status, next_contact_at,
                    chartback_notes, chartback_activity, asesor
             FROM legacy_clients
             WHERE chartback = true
               AND chartback_status != 'recovered'
               AND recovery_advisor_id = $1
               AND (next_contact_at IS NULL OR next_contact_at <= NOW())
             ORDER BY full_name ASC`,
            [userId]
        );
        return res.json({ clients: result.rows, total: result.rowCount });
    } catch (error: any) {
        console.error('Error obteniendo chartback del asesor:', error);
        res.status(500).json({ error: 'Error al obtener clientes chartback' });
    }
};

/**
 * Carga en tránsito de un cliente chartback (para asesores)
 * GET /api/advisor/legacy/chartback/:boxId/cargo
 */
export const getAdvisorChartbackClientCargo = async (req: Request, res: Response): Promise<any> => {
    const rawBoxId = req.params.boxId;
    const boxId = String(Array.isArray(rawBoxId) ? rawBoxId[0] : rawBoxId).toUpperCase().trim();
    if (!boxId) return res.status(400).json({ error: 'boxId requerido' });
    const advisorId = (req as any).user?.userId;
    try {
        const localResult = await pool.query(
            `SELECT box_id, full_name, email, phone, asesor,
                    last_send, last_send_maritimo, chartback_status,
                    chartback_activity, chartback_notes, next_contact_at
             FROM legacy_clients
             WHERE UPPER(TRIM(box_id)) = $1
               AND recovery_advisor_id = $2
             LIMIT 1`,
            [boxId, advisorId]
        );
        const localClient = localResult.rows[0] || null;
        if (!localClient) return res.status(404).json({ error: 'Cliente no encontrado o no asignado a ti' });

        let livePending: any = null;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 10000);
            try {
                const r = await (globalThis as any).fetch(
                    'https://sistemaentregax.com/api/customers/list-customers-admin',
                    { headers: { Accept: 'application/json' }, signal: ctrl.signal as any }
                );
                if (r.ok) {
                    const payload = await r.json();
                    const rows: any[] = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
                    const norm = boxId.replace(/\s/g, '');
                    const match = rows.find((row: any) =>
                        (row?.suite ?? '').toString().trim().toUpperCase().replace(/\s/g, '') === norm
                    );
                    if (match) livePending = match.pending || null;
                }
            } finally { clearTimeout(t); }
        } catch { /* timeout */ }

        return res.json({ box_id: boxId, local_client: localClient, live_pending: livePending });
    } catch (error: any) {
        console.error('Error cargo advisor:', error);
        return res.status(500).json({ error: 'Error al consultar carga' });
    }
};

/**
 * Historial general de movimientos chartback del asesor
 * GET /api/advisor/legacy/chartback/history
 */
export const getAdvisorChartbackHistory = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.userId;
        const result = await pool.query(
            `SELECT
                lc.id, lc.box_id,
                COALESCE(lc.full_name, u.full_name, lc.box_id) AS full_name,
                lc.chartback_status,
                act.value AS activity
             FROM legacy_clients lc
             LEFT JOIN users u ON u.id = lc.claimed_by_user_id
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(lc.chartback_activity, '[]'::jsonb)) AS act(value)
             WHERE lc.recovery_advisor_id = $1
             ORDER BY (act.value->>'ts') DESC
             LIMIT 150`,
            [userId]
        );
        return res.json({ history: result.rows });
    } catch (error: any) {
        console.error('Error historial chartback:', error);
        return res.status(500).json({ error: 'Error al obtener historial' });
    }
};

/**
 * Asignar asesor de recuperación a clientes chartback (admin)
 * PATCH /api/admin/legacy/chartback/assign
 * body: { ids: number[], advisor_id: number | null }
 */
export const assignChartbackAdvisor = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ids, advisor_id } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids requerido' });
        }
        const advisorIdVal = advisor_id != null ? Number(advisor_id) : null;
        const placeholders = ids.map((_: any, i: number) => `$${i + 2}`).join(',');
        await pool.query(
            `UPDATE legacy_clients SET recovery_advisor_id = $1
             WHERE id IN (${placeholders}) AND chartback = true`,
            [advisorIdVal, ...ids]
        );
        return res.json({ success: true, updated: ids.length });
    } catch (error: any) {
        console.error('Error asignando asesor chartback:', error);
        res.status(500).json({ error: 'Error al asignar asesor' });
    }
};

/**
 * Obtener todos los clientes chartback para el admin (con info del asesor asignado)
 * GET /api/admin/legacy/chartback
 */
export const getAdminChartbackClients = async (req: Request, res: Response): Promise<any> => {
    try {
        const { search, advisor_id, recovered } = req.query;
        // Si recovered=true mostramos solo recuperados; si no, solo activos
        const baseCondition = recovered === 'true'
            ? `LOWER(TRIM(COALESCE(lc.chartback_status, ''))) = 'recovered'`
            : 'lc.chartback = true';
        const conditions: string[] = [baseCondition];
        const params: any[] = [];

        if (search && String(search).trim()) {
            params.push(`%${String(search).trim()}%`);
            conditions.push(`(lc.box_id ILIKE $${params.length} OR lc.full_name ILIKE $${params.length} OR lc.email ILIKE $${params.length})`);
        }
        if (advisor_id && String(advisor_id) !== 'all') {
            const advisorIdNum = Number(advisor_id);
            if (advisorIdNum === -1 || String(advisor_id) === 'none' || String(advisor_id) === 'null') {
                conditions.push(`lc.recovery_advisor_id IS NULL`);
            } else {
                params.push(advisorIdNum);
                conditions.push(`lc.recovery_advisor_id = $${params.length}`);
            }
        }

        const where = `WHERE ${conditions.join(' AND ')}`;
        const result = await pool.query(
            `SELECT lc.id, lc.box_id, lc.full_name, lc.email, lc.phone,
                    lc.chartback_status, lc.next_contact_at, lc.asesor,
                    lc.recovery_advisor_id, lc.chartback_i_since,
                    adv.full_name as recovery_advisor_name
             FROM legacy_clients lc
             LEFT JOIN users adv ON adv.id = lc.recovery_advisor_id
             ${where}
             ORDER BY lc.chartback_i_since DESC NULLS LAST, lc.full_name ASC`,
            params
        );
        return res.json({ clients: result.rows, total: result.rowCount });
    } catch (error: any) {
        console.error('Error obteniendo chartback admin:', error);
        res.status(500).json({ error: 'Error al obtener clientes chartback' });
    }
};

/**
 * Cargo en tránsito de un cliente chartback
 * GET /api/admin/legacy/chartback/:boxId/cargo
 * Consulta nuestro sistema + sistemaentregax.com
 */
export const getChartbackClientCargo = async (req: Request, res: Response): Promise<any> => {
    const rawBoxId = req.params.boxId;
    const pick = Array.isArray(rawBoxId) ? (rawBoxId[0] ?? '') : (rawBoxId ?? '');
    const boxId = String(pick).toUpperCase().trim();
    if (!boxId) return res.status(400).json({ error: 'boxId requerido' });

    try {
        // 1. Datos locales ya sincronizados de sistemaentregax.com
        const localResult = await pool.query(
            `SELECT box_id, full_name, email, phone, asesor,
                    last_send, last_send_maritimo, chartback_status, next_contact_at,
                    chartback_activity, chartback_notes
             FROM legacy_clients WHERE UPPER(TRIM(box_id)) = $1 LIMIT 1`,
            [boxId]
        );
        const localClient = localResult.rows[0] || null;

        // 2. Paquetes en nuestro sistema: por usuario registrado + por box_id directo en packages
        const ourPkgsResult = await pool.query(
            `SELECT p.id, p.tracking_number, p.status, p.carrier, p.created_at,
                    p.weight_kg, p.description, p.service_type,
                    p.box_id as pkg_box_id, u.box_id as user_box_id
             FROM packages p
             JOIN users u ON p.user_id = u.id
             WHERE UPPER(TRIM(u.box_id)) = $1
             UNION
             SELECT p.id, p.tracking_number, p.status, p.carrier, p.created_at,
                    p.weight_kg, p.description, p.service_type,
                    p.box_id as pkg_box_id, NULL as user_box_id
             FROM packages p
             WHERE UPPER(TRIM(p.box_id)) = $1
               AND (p.user_id IS NULL OR p.user_id NOT IN (
                 SELECT id FROM users WHERE UPPER(TRIM(box_id)) = $1
               ))
             ORDER BY created_at DESC LIMIT 50`,
            [boxId]
        ).catch(() => ({ rows: [] as any[] }));

        // 3. Intentar obtener pendientes EN VIVO desde sistemaentregax.com
        let livePending: any = null;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 12000);
            try {
                const r = await (globalThis as any).fetch(
                    'https://sistemaentregax.com/api/customers/list-customers-admin',
                    { headers: { 'Accept': 'application/json' }, signal: ctrl.signal as any }
                );
                if (r.ok) {
                    const payload = await r.json();
                    const rows: any[] = Array.isArray(payload?.data) ? payload.data
                        : (Array.isArray(payload) ? payload : []);
                    // Buscar por suite exacto (case-insensitive, sin espacios)
                    const normalizedBoxId = boxId.replace(/\s/g, '');
                    const match = rows.find((row: any) => {
                        const suite = (row?.suite ?? '').toString().trim().toUpperCase().replace(/\s/g, '');
                        return suite === normalizedBoxId;
                    });
                    if (match) livePending = match.pending || null;
                }
            } finally {
                clearTimeout(t);
            }
        } catch { /* timeout o error de red — usar solo datos locales */ }

        return res.json({
            box_id: boxId,
            local_client: localClient,
            live_pending: livePending,
            our_packages: (ourPkgsResult as any).rows || [],
        });
    } catch (error: any) {
        console.error('Error cargo chartback:', error);
        return res.status(500).json({ error: 'Error al consultar carga' });
    }
};

/**
 * Acción CRM sobre un cliente chartback
 * POST /api/advisor/legacy/chartback/:id/action
 * body: { action: 'no_answer'|'callback'|'recovered'|'retention'|'whatsapp'|'call_note', callback_at?, notes? }
 */
export const chartbackAction = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { action, callback_at, notes } = req.body;
        const userId = (req as any).user?.userId;

        const userRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [userId]);
        const advisorName = userRes.rows[0]?.full_name || 'Asesor';

        const now = new Date().toISOString();
        const entry: Record<string, any> = { ts: now, advisor: advisorName, advisor_id: userId };

        let next_contact_at: string | null = null;
        let chartback_status: string | null = null;

        if (action === 'no_answer') {
            next_contact_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            chartback_status = 'no_answer';
            entry.type = 'no_answer';
            if (notes) entry.note = notes;
        } else if (action === 'callback') {
            if (!callback_at) return res.status(400).json({ error: 'callback_at requerido' });
            next_contact_at = new Date(callback_at).toISOString();
            chartback_status = 'callback';
            entry.type = 'callback';
            entry.callback_at = next_contact_at;
            if (notes) entry.note = notes;
        } else if (action === 'recovered') {
            entry.type = 'recovered';
            if (notes) entry.note = notes;
            await pool.query(
                `UPDATE legacy_clients
                 SET chartback = false, chartback_status = 'recovered', next_contact_at = NULL,
                     recovery_advisor_id = $1,
                     chartback_activity = COALESCE(chartback_activity, '[]'::jsonb) || $2::jsonb
                 WHERE id = $3`,
                [userId, JSON.stringify(entry), id]
            );
            return res.json({ success: true, action: 'recovered' });
        } else if (action === 'retention') {
            if (!notes || !String(notes).trim()) {
                return res.status(400).json({ error: 'notes requerido para retención' });
            }
            entry.type = 'retention';
            entry.note = String(notes).trim();
            await pool.query(
                `UPDATE legacy_clients
                 SET chartback = true, chartback_status = 'retention', next_contact_at = NULL,
                     chartback_notes = $1,
                     recovery_advisor_id = $2,
                     chartback_activity = COALESCE(chartback_activity, '[]'::jsonb) || $3::jsonb
                 WHERE id = $4`,
                [String(notes).trim(), userId, JSON.stringify(entry), id]
            );
            return res.json({ success: true, action: 'retention' });
        } else if (action === 'not_interested') {
            // Cliente declinó el servicio: sale del chartback activo, pero queda
            // marcado para histórico/seguimiento. No requiere notas obligatorias.
            entry.type = 'not_interested';
            if (notes) entry.note = String(notes).trim();
            await pool.query(
                `UPDATE legacy_clients
                 SET chartback = false, chartback_status = 'not_interested', next_contact_at = NULL,
                     chartback_notes = COALESCE($1, chartback_notes),
                     recovery_advisor_id = $2,
                     chartback_activity = COALESCE(chartback_activity, '[]'::jsonb) || $3::jsonb
                 WHERE id = $4`,
                [notes ? String(notes).trim() : null, userId, JSON.stringify(entry), id]
            );
            return res.json({ success: true, action: 'not_interested' });
        } else if (action === 'whatsapp') {
            // Solo registra actividad, no cambia estado
            entry.type = 'whatsapp';
            if (notes) entry.note = notes;
            await pool.query(
                `UPDATE legacy_clients
                 SET chartback_activity = COALESCE(chartback_activity, '[]'::jsonb) || $1::jsonb
                 WHERE id = $2`,
                [JSON.stringify(entry), id]
            );
            return res.json({ success: true, action: 'whatsapp' });
        } else if (action === 'call_note') {
            // Registra nota de llamada sin cambiar estado
            entry.type = 'call_note';
            entry.note = notes || '';
            await pool.query(
                `UPDATE legacy_clients
                 SET chartback_activity = COALESCE(chartback_activity, '[]'::jsonb) || $1::jsonb,
                     chartback_notes = $2
                 WHERE id = $3`,
                [JSON.stringify(entry), notes || null, id]
            );
            return res.json({ success: true, action: 'call_note' });
        } else {
            return res.status(400).json({ error: 'action inválido' });
        }

        await pool.query(
            `UPDATE legacy_clients
             SET chartback_status = $1, next_contact_at = $2,
                 chartback_notes = COALESCE($3, chartback_notes),
                 chartback_activity = COALESCE(chartback_activity, '[]'::jsonb) || $4::jsonb
             WHERE id = $5`,
            [chartback_status, next_contact_at, notes || null, JSON.stringify(entry), id]
        );

        return res.json({ success: true, action, next_contact_at });
    } catch (error: any) {
        console.error('Error en chartback action:', error);
        res.status(500).json({ error: 'Error al registrar acción' });
    }
};

/**
 * Admin: marcar cliente chartback como recuperado
 * PATCH /api/admin/legacy/chartback/:id/recover
 */
export const adminMarkRecovered = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { notes } = (req.body || {}) as { notes?: string };
        const userId = (req as any).user?.userId;

        // Obtener nombre del admin/usuario que ejecuta la acción
        const userRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [userId]);
        const actorName = userRes.rows[0]?.full_name || 'Admin';

        // Obtener asesor de recovery asignado al cliente para guardarlo como `asesor`
        const clientRes = await pool.query(
            `SELECT lc.recovery_advisor_id, adv.full_name AS recovery_advisor_name
             FROM legacy_clients lc
             LEFT JOIN users adv ON adv.id = lc.recovery_advisor_id
             WHERE lc.id = $1`,
            [id]
        );
        if (clientRes.rowCount === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        const recoveryAdvisorName: string | null = clientRes.rows[0]?.recovery_advisor_name || null;

        const entry = {
            ts: new Date().toISOString(),
            type: 'recovered',
            advisor: recoveryAdvisorName || actorName,
            advisor_id: clientRes.rows[0]?.recovery_advisor_id || userId,
            marked_by: actorName,
            marked_by_id: userId,
            ...(notes ? { note: notes } : {}),
        };

        // Si hay asesor de recovery, lo copiamos a la columna `asesor` (visible en la lista principal)
        const result = await pool.query(
            `UPDATE legacy_clients
             SET chartback = false,
                 chartback_status = 'recovered',
                 next_contact_at = NULL,
                 asesor = COALESCE($3, asesor),
                 chartback_activity = COALESCE(chartback_activity, '[]'::jsonb) || $1::jsonb
             WHERE id = $2
             RETURNING box_id, asesor`,
            [JSON.stringify(entry), id, recoveryAdvisorName]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        return res.json({ success: true, box_id: result.rows[0].box_id, asesor: result.rows[0].asesor });
    } catch (error: any) {
        console.error('Error marcando como recuperado:', {
            message: error?.message,
            code: error?.code,
            detail: error?.detail,
            stack: error?.stack,
        });
        res.status(500).json({
            error: error?.message || 'Error al marcar como recuperado',
            code: error?.code,
        });
    }
};

/**
 * Marcar/desmarcar chartback en bulk
 * POST /api/legacy/clients/chartback
 * body: { ids: number[], chartback: boolean }
 */
export const setChartback = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ids, chartback } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids requerido' });
        }
        const placeholders = ids.map((_: any, i: number) => `$${i + 2}`).join(',');
        // Al marcar chartback=true: limpiar asesor y reiniciar estado CRM
        // Al quitar chartback: marcar como recovered
        const extraFields = chartback
            ? `, asesor = NULL, chartback_status = 'pending', next_contact_at = NULL, recovery_advisor_id = NULL, chartback_i_since = NULL`
            : `, chartback_status = 'recovered'`;
        await pool.query(
            `UPDATE legacy_clients SET chartback = $1${extraFields} WHERE id IN (${placeholders})`,
            [!!chartback, ...ids]
        );
        // Al marcar chartback=true, también desasignar asesor en tabla users
        if (chartback) {
            const userPlaceholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
            await pool.query(
                `UPDATE users SET advisor_id = NULL
                 WHERE UPPER(TRIM(box_id)) IN (
                     SELECT UPPER(TRIM(box_id)) FROM legacy_clients WHERE id IN (${userPlaceholders})
                 )`,
                [...ids]
            );
        }
        return res.json({ success: true, updated: ids.length });
    } catch (error: any) {
        console.error('Error actualizando chartback:', error);
        res.status(500).json({ error: 'Error al actualizar chartback' });
    }
};

/**
 * Marcar clientes como Chartback I (primera ronda con el mismo asesor)
 * POST /api/legacy/clients/chartback-i
 * El asesor original del cliente se mantiene y se busca su recovery_advisor_id por nombre.
 * Después de 30 días un cron los promueve automáticamente a Chartback Público (status=pending).
 */
export const setChartbackI = async (req: Request, res: Response): Promise<any> => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids requerido' });
        }
        const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
        // Marcar como Chartback I y vincular recovery_advisor al mismo asesor por nombre
        await pool.query(`
            UPDATE legacy_clients lc
            SET
                chartback = TRUE,
                chartback_status = 'chartback_i',
                chartback_i_since = NOW(),
                next_contact_at = NULL,
                recovery_advisor_id = (
                    SELECT u.id FROM users u
                    WHERE LOWER(TRIM(u.full_name)) = LOWER(TRIM(lc.asesor))
                      AND u.role IN ('advisor','asesor','asesor_lider','sub_advisor','branch_manager','counter_staff')
                    LIMIT 1
                )
            WHERE lc.id IN (${placeholders})
        `, ids);
        return res.json({ success: true, updated: ids.length });
    } catch (error: any) {
        console.error('Error marcando Chartback I:', error);
        res.status(500).json({ error: 'Error al marcar Chartback I' });
    }
};

/**
 * Eliminar cliente legacy (admin)
 * DELETE /api/legacy/clients/:id
 */
export const deleteLegacyClient = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM legacy_clients WHERE id = $1 AND is_claimed = false RETURNING id',
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ 
                error: 'Cliente no encontrado o ya fue reclamado' 
            });
        }

        res.json({ success: true, message: 'Cliente eliminado' });

    } catch (error: any) {
        console.error('Error eliminando cliente:', error);
        res.status(500).json({ error: 'Error al eliminar' });
    }
};

/**
 * Obtener datos completos del cliente desde sistemaentregax.com (incluye INE)
 * GET /api/legacy/clients/:boxId/external
 * Proxy al endpoint público: sistemaentregax.com/api/customers/getCustomer/:boxId
 */
const DEFAULT_INE_URL = 'https://sistemaentregax.com/public/imgsistema/default-imagen.jpg';
const isDefaultIne = (url: string | null | undefined) =>
    !url || url.includes('default-imagen');

export const getLegacyClientExternalData = async (req: Request, res: Response): Promise<any> => {
    const rawBoxId = req.params.boxId;
    const pick = Array.isArray(rawBoxId) ? (rawBoxId[0] ?? '') : (rawBoxId ?? '');
    const boxId = String(pick).trim();
    if (!boxId) return res.status(400).json({ error: 'boxId requerido' });

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
        const url = `https://sistemaentregax.com/api/customers/getCustomer/${encodeURIComponent(boxId.toLowerCase())}`;
        const r = await (globalThis as any).fetch(url, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'EntregaX-Admin/1.0' },
            signal: ctrl.signal as any,
        });
        if (!r.ok) {
            return res.status(r.status).json({ error: `Sistema externo respondió ${r.status}` });
        }
        const payload = await r.json();
        // El sistema externo devuelve { status: 'error', message: '...' } con HTTP 200
        if (payload?.status === 'error') {
            return res.status(404).json({ error: payload?.message || 'Cliente no encontrado en sistema externo' });
        }
        const data = payload?.data || payload;
        // Filtrar imágenes default (sin INE real)
        if (isDefaultIne(data.ladoa)) data.ladoa = null;
        if (isDefaultIne(data.ladob)) data.ladob = null;
        return res.json({ status: 'success', data });
    } catch (error: any) {
        console.error('Error consultando cliente externo:', error?.message);
        return res.status(502).json({ error: 'No se pudo consultar el sistema externo' });
    } finally {
        clearTimeout(t);
    }
};

/**
 * Proxy para imágenes INE de sistemaentregax.com (evita bloqueo CORS/hotlink)
 * GET /api/legacy/ine-proxy?url=<encoded_url>
 */
export const proxyIneImage = async (req: Request, res: Response): Promise<any> => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !rawUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'URL inválida' });
    }
    // Solo permitir imágenes del sistema externo
    if (!rawUrl.includes('sistemaentregax.com')) {
        return res.status(403).json({ error: 'URL no permitida' });
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
        const r = await (globalThis as any).fetch(rawUrl, {
            headers: { 'User-Agent': 'EntregaX-Admin/1.0', 'Referer': 'https://sistemaentregax.com' },
            signal: ctrl.signal as any,
        });
        if (!r.ok) return res.status(r.status).send('');
        const contentType = r.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const buf = await r.arrayBuffer();
        return res.send(Buffer.from(buf));
    } catch (error: any) {
        return res.status(502).send('');
    } finally {
        clearTimeout(t);
    }
};
