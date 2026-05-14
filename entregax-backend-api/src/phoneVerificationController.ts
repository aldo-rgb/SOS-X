/**
 * Phone Verification Controller — OTP de 6 dígitos por WhatsApp.
 *
 * Endpoints:
 *   POST /api/auth/phone/send-code      { phone }   → manda OTP por WhatsApp
 *   POST /api/auth/phone/verify-code    { phone, code } → valida y marca user.phone_verified
 *
 * Almacenamiento: en columnas users.phone_verification_code_hash + _expires_at +
 * _attempts. Hashedo con SHA-256, expiración 10 min, máx 5 intentos.
 *
 * Anti-abuso:
 *   - authRateLimit en index.ts
 *   - Si user no existe, respondemos 200 silencioso (no leak).
 *   - Para "send-code" cuando el usuario NO está autenticado, validamos por email
 *     opcional (flujo registro). Para usuarios ya autenticados (cambio de teléfono)
 *     se usa el JWT (req.user.userId).
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import { sendVerificationCodeWhatsapp, normalizePhone } from './whatsappService';
import type { AuthRequest } from './authController';

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

let columnsReady = false;
const ensurePhoneVerificationColumns = async (): Promise<void> => {
    if (columnsReady) return;
    try {
        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS phone_verification_code_hash VARCHAR(128),
            ADD COLUMN IF NOT EXISTS phone_verification_expires_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS phone_verification_attempts INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS phone_verification_sent_at TIMESTAMPTZ
        `);
        columnsReady = true;
    } catch (err) {
        console.error('[PHONE VERIFY] No se pudieron crear columnas:', err);
    }
};

const generateCode = (): string => {
    // 6 dígitos, 100000-999999
    return String(crypto.randomInt(100000, 1000000));
};

const hashCode = (code: string): string => {
    return crypto.createHash('sha256').update(code).digest('hex');
};

/**
 * POST /api/auth/phone/send-code
 * Body: { phone }
 *
 * Si el cliente está autenticado, actualizamos el phone del usuario actual.
 * Si NO está autenticado (flujo de registro), buscamos al usuario por phone
 * (debe existir ya tras /register o /legacy/claim).
 */
export const sendPhoneVerificationCode = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensurePhoneVerificationColumns();

        const { phone } = req.body as { phone?: string };
        const normalized = normalizePhone(phone || '');
        if (!normalized) {
            res.status(400).json({ error: 'Teléfono inválido' });
            return;
        }

        // Identificación: si hay JWT, usa userId; si no, busca por phone.
        let userId: number | null = req.user?.userId || null;

        if (userId) {
            // Actualizar phone del usuario autenticado (puede ser cambio)
            await pool.query(
                'UPDATE users SET phone = $1 WHERE id = $2',
                [normalized, userId]
            );
        } else {
            const byPhone = await pool.query(
                `SELECT id FROM users
                 WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
                 LIMIT 1`,
                [normalized]
            );
            if (byPhone.rows.length === 0) {
                // No filtrar existencia: respondemos 200 igual.
                res.json({ ok: true, message: 'Si el número está registrado, recibirás un código.' });
                return;
            }
            userId = byPhone.rows[0].id;
        }

        // Rate limit suave: si mandamos uno hace < 60s, rechaza.
        const last = await pool.query(
            'SELECT phone_verification_sent_at FROM users WHERE id = $1',
            [userId]
        );
        const sentAt = last.rows[0]?.phone_verification_sent_at as Date | null;
        if (sentAt && Date.now() - new Date(sentAt).getTime() < 60_000) {
            res.status(429).json({
                error: 'Espera unos segundos antes de pedir otro código.',
                retryAfterSeconds: Math.ceil((60_000 - (Date.now() - new Date(sentAt).getTime())) / 1000),
            });
            return;
        }

        const code = generateCode();
        const hashed = hashCode(code);
        const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

        await pool.query(
            `UPDATE users
             SET phone_verification_code_hash = $1,
                 phone_verification_expires_at = $2,
                 phone_verification_attempts = 0,
                 phone_verification_sent_at = NOW()
             WHERE id = $3`,
            [hashed, expiresAt, userId]
        );

        const result = await sendVerificationCodeWhatsapp({ phone: normalized, code });

        if (!result.ok && !result.skipped) {
            // Fallo de Meta → no exponemos detalle pero devolvemos 502.
            res.status(502).json({
                error: 'No se pudo enviar el código por WhatsApp. Intenta de nuevo o usa otro canal.',
                details: process.env.NODE_ENV !== 'production' ? result.error : undefined,
            });
            return;
        }

        res.json({
            ok: true,
            message: 'Código enviado por WhatsApp.',
            expiresInMinutes: CODE_TTL_MIN,
            // En desarrollo facilitamos el código para QA. NUNCA en prod.
            devCode: process.env.NODE_ENV !== 'production' && result.skipped ? code : undefined,
        });
    } catch (err: any) {
        console.error('[PHONE VERIFY] send-code error:', err);
        res.status(500).json({ error: 'Error al enviar el código' });
    }
};

/**
 * POST /api/auth/phone/verify-code
 * Body: { phone, code }
 */
export const verifyPhoneCode = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await ensurePhoneVerificationColumns();

        const { phone, code } = req.body as { phone?: string; code?: string };
        if (!code || !/^\d{4,8}$/.test(String(code))) {
            res.status(400).json({ error: 'Código inválido' });
            return;
        }

        const normalized = normalizePhone(phone || '');
        if (!normalized) {
            res.status(400).json({ error: 'Teléfono inválido' });
            return;
        }

        let userRow: any = null;
        if (req.user?.userId) {
            const r = await pool.query(
                `SELECT id, phone, phone_verification_code_hash, phone_verification_expires_at, phone_verification_attempts
                 FROM users WHERE id = $1 LIMIT 1`,
                [req.user.userId]
            );
            userRow = r.rows[0];
        } else {
            const r = await pool.query(
                `SELECT id, phone, phone_verification_code_hash, phone_verification_expires_at, phone_verification_attempts
                 FROM users
                 WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
                 LIMIT 1`,
                [normalized]
            );
            userRow = r.rows[0];
        }

        if (!userRow) {
            res.status(400).json({ error: 'No hay código pendiente para ese teléfono.' });
            return;
        }

        if (!userRow.phone_verification_code_hash || !userRow.phone_verification_expires_at) {
            res.status(400).json({ error: 'No hay código pendiente. Solicita uno nuevo.' });
            return;
        }

        if (new Date(userRow.phone_verification_expires_at).getTime() < Date.now()) {
            res.status(400).json({ error: 'El código expiró. Solicita uno nuevo.' });
            return;
        }

        if ((userRow.phone_verification_attempts || 0) >= MAX_ATTEMPTS) {
            res.status(429).json({ error: 'Demasiados intentos. Solicita un nuevo código.' });
            return;
        }

        const incoming = hashCode(String(code));
        if (incoming !== userRow.phone_verification_code_hash) {
            await pool.query(
                'UPDATE users SET phone_verification_attempts = COALESCE(phone_verification_attempts,0) + 1 WHERE id = $1',
                [userRow.id]
            );
            res.status(400).json({ error: 'Código incorrecto.' });
            return;
        }

        // ✅ Verificado: limpiar columnas + marcar phone_verified
        await pool.query(
            `UPDATE users
             SET phone_verified = TRUE,
                 phone_verification_code_hash = NULL,
                 phone_verification_expires_at = NULL,
                 phone_verification_attempts = 0
             WHERE id = $1`,
            [userRow.id]
        );

        res.json({ ok: true, message: 'Teléfono verificado correctamente.' });
    } catch (err: any) {
        console.error('[PHONE VERIFY] verify-code error:', err);
        res.status(500).json({ error: 'Error al verificar el código' });
    }
};

/**
 * GET /api/auth/phone/status — diagnóstico
 */
export const phoneVerificationStatus = (_req: Request, res: Response): void => {
    const enabled = !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
    res.json({
        whatsappEnabled: enabled,
        codeTtlMinutes: CODE_TTL_MIN,
        maxAttempts: MAX_ATTEMPTS,
    });
};
