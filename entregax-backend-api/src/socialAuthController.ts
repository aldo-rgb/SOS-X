/**
 * Social Auth Controller — Sign in with Google / Sign in with Apple.
 *
 * Endpoints (registrados en index.ts):
 *   POST /api/auth/google  { idToken }      → verifica con Google y emite JWT
 *   POST /api/auth/apple   { idToken, fullName? } → verifica con Apple y emite JWT
 *
 * Feature flags (si faltan, los endpoints responden 503):
 *   GOOGLE_OAUTH_CLIENT_IDS  (CSV de client_ids permitidos: web,ios,android)
 *   APPLE_AUDIENCES          (CSV: services id de web + bundle id de iOS)
 *
 * Estrategia upsert:
 *   1) Buscar usuario por google_sub / apple_sub (vínculo previo)
 *   2) Si no existe, buscar por email (case-insensitive) y vincular el sub
 *   3) Si tampoco existe, crear usuario nuevo (role=client) con box_id,
 *      referral_code, password aleatoria hasheada (no se usará).
 *
 * Respuesta: mismo shape que loginUser para que el frontend lo consuma igual.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { pool } from './db';
import { generateReferralCode } from './commissionController';
import { ROLE_PERMISSIONS } from './authController';
import { sendWelcomeWhatsapp } from './whatsappService';

// ============================================================
// Helpers compartidos
// ============================================================

let socialColumnsReady = false;
const ensureSocialColumns = async (): Promise<void> => {
    if (socialColumnsReady) return;
    try {
        await pool.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255),
            ADD COLUMN IF NOT EXISTS apple_sub VARCHAR(255),
            ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20)
        `);
        // Índices únicos parciales (sólo cuando la columna no es NULL)
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uniq
            ON users (google_sub) WHERE google_sub IS NOT NULL
        `);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS users_apple_sub_uniq
            ON users (apple_sub) WHERE apple_sub IS NOT NULL
        `);
        socialColumnsReady = true;
    } catch (err) {
        console.error('[SOCIAL AUTH] No se pudieron crear columnas social_*:', err);
    }
};

const generateBoxId = async (): Promise<string> => {
    try {
        const result = await pool.query(
            "SELECT MAX(CAST(SUBSTRING(box_id FROM 2) AS INTEGER)) as max_num FROM users WHERE box_id ~ '^S[0-9]+$'"
        );
        if (result.rows.length > 0 && result.rows[0].max_num !== null) {
            return `S${result.rows[0].max_num + 1}`;
        }
        return 'S4000';
    } catch (error) {
        console.error('[SOCIAL AUTH] Error generando box_id:', error);
        const fallback = await pool.query("SELECT COUNT(*) as total FROM users WHERE box_id LIKE 'S%'");
        return `S${4000 + parseInt(fallback.rows[0].total)}`;
    }
};

const signJwt = (userId: number, email: string, role: string): string => {
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    return jwt.sign({ userId, email, role }, secret, { expiresIn: '7d' });
};

const setAuthCookie = (res: Response, token: string): void => {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
    });
};

const buildLoginResponse = (user: any, token: string, message: string) => {
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    const isAdmin = ['super_admin', 'admin', 'branch_manager', 'director'].includes(user.role);
    const isStaff = ['advisor', 'sub_advisor', 'counter_staff', 'warehouse_ops', 'customer_service', 'repartidor', 'accountant', 'abogado', 'operaciones', 'monitoreo'].includes(user.role);

    return {
        message,
        user: {
            id: user.id,
            name: user.full_name,
            email: user.email,
            boxId: user.box_id,
            role: user.role,
            phone: user.phone,
            rfc: user.rfc || null,
            isVerified: user.is_verified || false,
            verificationStatus: user.verification_status || 'not_started',
            isEmployeeOnboarded: user.is_employee_onboarded || false,
            privacyAcceptedAt: user.privacy_accepted_at || null,
            profilePhotoUrl: user.profile_photo_url && user.profile_photo_url.length > 10000
                ? null
                : (user.profile_photo_url || null),
            walletBalance: parseFloat(user.wallet_balance) || 0,
            virtualClabe: user.virtual_clabe || null,
            hasCredit: user.has_credit || false,
            creditLimit: parseFloat(user.credit_limit) || 0,
            usedCredit: parseFloat(user.used_credit) || 0,
            isCreditBlocked: user.is_credit_blocked || false,
        },
        access: {
            token,
            expiresIn: '7 días',
            permissions,
            isAdmin,
            isStaff,
            canAccessWebAdmin: isAdmin || isStaff,
            canAccessMobileApp: true,
            mustChangePassword: false,
            canDocumentPackages: user.is_verified === true,
        },
    };
};

/**
 * Upsert por (provider, sub, email). Si crea, marca auth_provider y is_verified=email_verified.
 * @returns row de users
 */
const upsertSocialUser = async (params: {
    provider: 'google' | 'apple';
    sub: string;
    email: string;
    fullName: string;
    emailVerified: boolean;
}) => {
    const { provider, sub, email, fullName, emailVerified } = params;
    const subColumn = provider === 'google' ? 'google_sub' : 'apple_sub';
    const normalizedEmail = email.toLowerCase().trim();

    // 1) Match por sub
    const bySub = await pool.query(
        `SELECT * FROM users WHERE ${subColumn} = $1 LIMIT 1`,
        [sub]
    );
    if (bySub.rows.length > 0) {
        return { user: bySub.rows[0], created: false };
    }

    // 2) Match por email → linkear sub al usuario existente
    const byEmail = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [normalizedEmail]
    );
    if (byEmail.rows.length > 0) {
        const existing = byEmail.rows[0];
        const updated = await pool.query(
            `UPDATE users SET ${subColumn} = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
            [sub, existing.id]
        );
        return { user: updated.rows[0], created: false };
    }

    // 3) Crear usuario nuevo (cliente). Password aleatoria hasheada (no se usará).
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const hashed = await bcrypt.hash(randomPassword, 10);
    const newBoxId = await generateBoxId();
    const referralCode = generateReferralCode(fullName || normalizedEmail);

    const inserted = await pool.query(
        `INSERT INTO users (
            full_name, email, password, box_id,
            referral_code, must_change_password,
            ${subColumn}, auth_provider, is_verified
         ) VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8)
         RETURNING *`,
        [
            fullName || normalizedEmail.split('@')[0],
            email,
            hashed,
            newBoxId,
            referralCode,
            sub,
            provider,
            emailVerified === true,
        ]
    );

    return { user: inserted.rows[0], created: true };
};

// ============================================================
// GOOGLE
// ============================================================

const getGoogleAudiences = (): string[] => {
    const csv = process.env.GOOGLE_OAUTH_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '';
    return csv.split(',').map(s => s.trim()).filter(Boolean);
};

const googleClient = new OAuth2Client();

export const googleAuth = async (req: Request, res: Response): Promise<void> => {
    try {
        const audiences = getGoogleAudiences();
        if (audiences.length === 0) {
            res.status(503).json({
                error: 'Google Sign-In no está configurado en el servidor.',
                errorCode: 'GOOGLE_OAUTH_DISABLED',
            });
            return;
        }

        const { idToken } = req.body as { idToken?: string };
        if (!idToken || typeof idToken !== 'string') {
            res.status(400).json({ error: 'idToken requerido' });
            return;
        }

        // Verificar firma + audience contra cualquiera de los client_ids configurados
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: audiences,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub || !payload.email) {
            res.status(401).json({ error: 'Token de Google inválido' });
            return;
        }

        await ensureSocialColumns();

        const { user, created } = await upsertSocialUser({
            provider: 'google',
            sub: payload.sub,
            email: payload.email,
            fullName: payload.name || '',
            emailVerified: payload.email_verified === true,
        });

        const token = signJwt(user.id, user.email, user.role);
        setAuthCookie(res, token);

        const message = created
            ? `¡Bienvenido a EntregaX! Tu casillero es ${user.box_id}.`
            : `¡Bienvenido de vuelta, ${(user.full_name || '').split(' ')[0]}!`;

        if (created && user.phone) {
            sendWelcomeWhatsapp({ phone: user.phone, fullName: user.full_name, boxId: user.box_id })
                .catch(err => console.error('[GOOGLE AUTH] WhatsApp bienvenida falló:', err));
        }

        res.status(created ? 201 : 200).json(buildLoginResponse(user, token, message));
    } catch (err: any) {
        console.error('[SOCIAL AUTH] Google error:', err?.message || err);
        res.status(401).json({
            error: 'No se pudo validar el token de Google',
            details: process.env.NODE_ENV !== 'production' ? String(err?.message || err) : undefined,
        });
    }
};

// ============================================================
// APPLE
// ============================================================

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

const getAppleAudiences = (): string[] => {
    const csv = process.env.APPLE_AUDIENCES || process.env.APPLE_CLIENT_ID || '';
    return csv.split(',').map(s => s.trim()).filter(Boolean);
};

export const appleAuth = async (req: Request, res: Response): Promise<void> => {
    try {
        const audiences = getAppleAudiences();
        if (audiences.length === 0) {
            res.status(503).json({
                error: 'Sign in with Apple no está configurado en el servidor.',
                errorCode: 'APPLE_OAUTH_DISABLED',
            });
            return;
        }

        const { idToken, fullName } = req.body as { idToken?: string; fullName?: string };
        if (!idToken || typeof idToken !== 'string') {
            res.status(400).json({ error: 'idToken requerido' });
            return;
        }

        // Verificar firma con JWKS + issuer + audience
        const { payload } = await jwtVerify(idToken, appleJwks, {
            issuer: 'https://appleid.apple.com',
            audience: audiences,
        });

        const sub = String(payload.sub || '');
        const email = String(payload.email || '');
        if (!sub) {
            res.status(401).json({ error: 'Token de Apple inválido (sin sub)' });
            return;
        }

        // Apple sólo envía email/nombre el primer login. Si no hay email,
        // intentamos recuperarlo de un usuario previo vinculado por apple_sub.
        let effectiveEmail = email;
        if (!effectiveEmail) {
            const prev = await pool.query(
                'SELECT email FROM users WHERE apple_sub = $1 LIMIT 1',
                [sub]
            );
            if (prev.rows.length > 0) {
                effectiveEmail = prev.rows[0].email;
            } else {
                res.status(400).json({
                    error: 'Apple no devolvió email. Inicia sesión de nuevo permitiendo compartir tu correo o regístrate con Google/correo.',
                    errorCode: 'APPLE_EMAIL_MISSING',
                });
                return;
            }
        }

        await ensureSocialColumns();

        const { user, created } = await upsertSocialUser({
            provider: 'apple',
            sub,
            email: effectiveEmail,
            fullName: fullName || '',
            emailVerified: payload.email_verified === true || payload.email_verified === 'true',
        });

        const token = signJwt(user.id, user.email, user.role);
        setAuthCookie(res, token);

        const message = created
            ? `¡Bienvenido a EntregaX! Tu casillero es ${user.box_id}.`
            : `¡Bienvenido de vuelta, ${(user.full_name || '').split(' ')[0]}!`;

        if (created && user.phone) {
            sendWelcomeWhatsapp({ phone: user.phone, fullName: user.full_name, boxId: user.box_id })
                .catch(err => console.error('[APPLE AUTH] WhatsApp bienvenida falló:', err));
        }

        res.status(created ? 201 : 200).json(buildLoginResponse(user, token, message));
    } catch (err: any) {
        console.error('[SOCIAL AUTH] Apple error:', err?.message || err);
        res.status(401).json({
            error: 'No se pudo validar el token de Apple',
            details: process.env.NODE_ENV !== 'production' ? String(err?.message || err) : undefined,
        });
    }
};

// ============================================================
// Diagnóstico (solo lectura — útil para verificar que el deploy
// ya tiene las variables de entorno configuradas)
// ============================================================

export const socialAuthStatus = async (_req: Request, res: Response): Promise<void> => {
    res.json({
        google: {
            enabled: getGoogleAudiences().length > 0,
            audiencesCount: getGoogleAudiences().length,
        },
        apple: {
            enabled: getAppleAudiences().length > 0,
            audiencesCount: getAppleAudiences().length,
        },
    });
};
