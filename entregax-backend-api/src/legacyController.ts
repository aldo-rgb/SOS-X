import { Request, Response } from 'express';
import { pool } from './db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';

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
        const data = fs.readFileSync(filePath, 'utf8');
        const lineas = data.split('\n').filter(l => l.trim());

        let importados = 0;
        let errores = 0;
        let duplicados = 0;
        const errorList: string[] = [];

        // Detectar delimitador (tab o coma)
        const firstLine = lineas[0] || '';
        const delimiter = firstLine.includes('\t') ? '\t' : ',';
        
        // Detectar si tiene header y el formato del archivo
        const firstCampos = parseLine(firstLine, delimiter);
        const hasHeader = firstLine.toLowerCase().includes('casillero') || 
                          firstLine.toLowerCase().includes('box_id') ||
                          firstLine.toLowerCase().includes('nombre') ||
                          firstLine.toLowerCase().includes('email');
        
        // Detectar índices automáticamente basándose en header o formato
        let boxIdIndex = 0;
        let fullNameIndex = 1;
        let emailIndex = 2;
        let dateIndex = 3;
        
        if (hasHeader) {
            // Buscar índices por nombre de columna
            const headerLower = firstCampos.map(h => h.toLowerCase().trim());
            const boxIdx = headerLower.findIndex(h => h.includes('casillero') || h.includes('box_id') || h === 'box');
            const nameIdx = headerLower.findIndex(h => h.includes('nombre') || h.includes('name'));
            const emailIdx = headerLower.findIndex(h => h.includes('correo') || h.includes('email') || h.includes('mail'));
            const dateIdx = headerLower.findIndex(h => h.includes('fecha') || h.includes('date') || h.includes('alta'));
            
            if (boxIdx !== -1) boxIdIndex = boxIdx;
            if (nameIdx !== -1) fullNameIndex = nameIdx;
            if (emailIdx !== -1) emailIndex = emailIdx;
            if (dateIdx !== -1) dateIndex = dateIdx;
        } else if (firstCampos.length > 10) {
            // Formato legacy antiguo con muchas columnas (TSV del sistema viejo)
            // Columna 4 (índice 3): Nombre completo
            // Columna 8 (índice 7): Email  
            // Columna 15 (índice 14): Box ID (S1, S2, etc.)
            // Última columna: Fecha
            boxIdIndex = 14;
            fullNameIndex = 3;
            emailIndex = 7;
            dateIndex = -1; // Buscar en última columna
        }
        
        // Índice de inicio (saltar header si existe)
        const startIndex = hasHeader ? 1 : 0;

        for (let i = startIndex; i < lineas.length; i++) {
            const linea = lineas[i];
            if (!linea || !linea.trim()) continue;

            const campos = parseLine(linea, delimiter);

            try {
                // Extraer campos según índices detectados
                const boxId = campos[boxIdIndex] || '';
                const fullName = campos[fullNameIndex] || '';
                const email = campos[emailIndex] || '';
                
                // Buscar fecha - primero en índice detectado, luego en última columna
                let registrationDate: string | null = null;
                
                // Si tenemos índice de fecha detectado, usarlo primero
                if (dateIndex >= 0) {
                    const fechaCampo = campos[dateIndex] as string | undefined;
                    if (fechaCampo && fechaCampo.match(/^\d{4}-\d{2}-\d{2}/)) {
                        registrationDate = fechaCampo.split(' ')[0] || null;
                    }
                }
                
                // Si no encontró, buscar en cualquier columna (formato legacy)
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

                // Limpiar email y nombre
                const cleanEmail = email && email !== '\\N' && email !== '' ? email.toLowerCase().trim() : null;
                const cleanName = fullName && fullName !== '\\N' && fullName !== '' ? fullName.trim() : null;
                const cleanBoxId = boxId.trim().toUpperCase();

                // Insertar en la BD
                const result = await pool.query(`
                    INSERT INTO legacy_clients (box_id, full_name, email, registration_date)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (box_id) DO NOTHING
                    RETURNING id
                `, [cleanBoxId, cleanName, cleanEmail, registrationDate]);

                if (result.rowCount && result.rowCount > 0) {
                    importados++;
                } else {
                    duplicados++;
                }

            } catch (error: any) {
                errores++;
                if (errorList.length < 10) {
                    errorList.push(`Línea con error: ${linea?.substring(0, 100) || 'desconocida'}...`);
                }
            }
        }

        // Eliminar archivo temporal
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            message: 'Importación completada',
            stats: {
                importados,
                duplicados,
                errores,
                total: lineas.filter(l => l.trim()).length
            },
            erroresEjemplo: errorList
        });

    } catch (error: any) {
        console.error('Error en importación:', error);
        res.status(500).json({ error: 'Error al importar archivo', details: error.message });
    }
};

/**
 * Obtener lista de clientes legacy
 * GET /api/legacy/clients
 */
export const getLegacyClients = async (req: Request, res: Response): Promise<any> => {
    try {
        const { page = 1, limit = 50, search, claimed } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const limitNum = Number(limit);

        let baseQuery = '';
        let countQuery = '';
        let queryParams: any[] = [];
        
        if (search && String(search).trim() !== '') {
            const searchText = String(search).trim();
            const words = searchText.split(/\s+/).filter(w => w.length > 0);
            
            if (words.length === 1) {
                // Una sola palabra - búsqueda simple
                const searchPattern = `%${words[0]}%`;
                
                countQuery = `
                    SELECT COUNT(*) FROM legacy_clients 
                    WHERE box_id ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1
                `;
                
                // Ordenar priorizando coincidencias exactas en box_id
                baseQuery = `
                    SELECT lc.*, u.full_name as claimed_by_name
                    FROM legacy_clients lc
                    LEFT JOIN users u ON u.id = lc.claimed_by_user_id
                    WHERE lc.box_id ILIKE $1 OR lc.full_name ILIKE $1 OR lc.email ILIKE $1
                    ORDER BY 
                        CASE WHEN lc.box_id ILIKE $4 THEN 0 ELSE 1 END,
                        LENGTH(lc.box_id),
                        lc.box_id
                    LIMIT $2 OFFSET $3
                `;
                queryParams = [searchPattern, limitNum, offset, words[0]];
                
                const countResult = await pool.query(countQuery, [searchPattern]);
                const total = parseInt(countResult.rows[0].count);
                const result = await pool.query(baseQuery, queryParams);
                
                return res.json({
                    clients: result.rows,
                    pagination: { page: Number(page), limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
                });
            } else {
                // Múltiples palabras - todas deben estar en el nombre
                const conditions = words.map((_, i) => `full_name ILIKE $${i + 1}`).join(' AND ');
                const patterns = words.map(w => `%${w}%`);
                
                countQuery = `SELECT COUNT(*) FROM legacy_clients WHERE ${conditions}`;
                
                const paramOffset = words.length;
                baseQuery = `
                    SELECT lc.*, u.full_name as claimed_by_name
                    FROM legacy_clients lc
                    LEFT JOIN users u ON u.id = lc.claimed_by_user_id
                    WHERE ${conditions}
                    ORDER BY lc.created_at DESC
                    LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}
                `;
                
                const countResult = await pool.query(countQuery, patterns);
                const total = parseInt(countResult.rows[0].count);
                const result = await pool.query(baseQuery, [...patterns, limitNum, offset]);
                
                return res.json({
                    clients: result.rows,
                    pagination: { page: Number(page), limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
                });
            }
        } else {
            // Sin búsqueda - traer todos
            countQuery = `SELECT COUNT(*) FROM legacy_clients`;
            baseQuery = `
                SELECT lc.*, u.full_name as claimed_by_name
                FROM legacy_clients lc
                LEFT JOIN users u ON u.id = lc.claimed_by_user_id
                ORDER BY lc.created_at DESC
                LIMIT $1 OFFSET $2
            `;
            
            const countResult = await pool.query(countQuery);
            const total = parseInt(countResult.rows[0].count);
            const result = await pool.query(baseQuery, [limitNum, offset]);
            
            return res.json({
                clients: result.rows,
                pagination: { page: Number(page), limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
            });
        }
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
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_claimed = true) as claimed,
                COUNT(*) FILTER (WHERE is_claimed = false) as pending
            FROM legacy_clients
        `);

        res.json(result.rows[0]);

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
        const { boxId, email, newPassword, phone, fullName } = req.body;

        // Validaciones básicas
        if (!boxId || !email || !newPassword) {
            return res.status(400).json({ 
                error: 'Se requiere número de casillero, correo y contraseña' 
            });
        }

        await client.query('BEGIN');

        // 1. Buscar en la base de datos legacy
        const legacyCheck = await client.query(
            'SELECT id, box_id, full_name, email, is_claimed FROM legacy_clients WHERE box_id = $1',
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

        // 2. Verificar que no haya sido reclamado
        if (legacyUser.is_claimed) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Este casillero ya fue registrado. Si eres el dueño legítimo, contacta a soporte.',
                code: 'ALREADY_CLAIMED'
            });
        }

        // 3. Validar identidad - El correo o nombre debe coincidir
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

        // 4. Verificar que el email no esté en uso por otro usuario
        const emailExists = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase().trim()]
        );

        if (emailExists.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Este correo ya está registrado en el sistema.',
                code: 'EMAIL_EXISTS'
            });
        }

        // 5. Crear el usuario oficial
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const finalName = fullName || legacyUser.full_name;
        const finalEmail = email.toLowerCase().trim();

        // Generar código de referido único
        const myReferralCode = `EX${Date.now().toString(36).toUpperCase()}`;

        const newUser = await client.query(`
            INSERT INTO users (
                full_name, email, password, role, box_id, phone, 
                referral_code, verification_status, created_at
            )
            VALUES ($1, $2, $3, 'client', $4, $5, $6, 'verified', NOW())
            RETURNING id, full_name, email, role, box_id
        `, [finalName, finalEmail, hashedPassword, boxId.toUpperCase(), phone || null, myReferralCode]);

        const newUserId = newUser.rows[0].id;

        // 6. Marcar como reclamado
        await client.query(`
            UPDATE legacy_clients 
            SET is_claimed = TRUE, 
                claimed_by_user_id = $1, 
                claimed_at = NOW()
            WHERE box_id = $2
        `, [newUserId, boxId.toUpperCase()]);

        await client.query('COMMIT');

        // 7. Generar JWT
        const token = jwt.sign(
            { 
                userId: newUserId, 
                email: finalEmail, 
                role: 'client',
                boxId: boxId.toUpperCase()
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: '¡Bienvenido de vuelta! Tu casillero ha sido vinculado exitosamente.',
            token,
            user: newUser.rows[0]
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
            `SELECT box_id, full_name, is_claimed, 
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
        
        res.json({
            exists: true,
            isClaimed: client.is_claimed,
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
            `SELECT id, box_id, full_name, email, is_claimed, registration_date
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

        // Verificar si ya fue reclamado
        if (client.is_claimed) {
            return res.status(400).json({ 
                exists: true,
                isClaimed: true,
                error: 'Este número de cliente ya fue registrado. Si eres el dueño, contacta soporte.' 
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
