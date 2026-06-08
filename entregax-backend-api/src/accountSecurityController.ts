/**
 * accountSecurityController.ts
 * Cambio de correo, 2FA y notificaciones de seguridad de cuenta.
 *
 * Reglas de negocio:
 *  - Cambiar email requiere teléfono verificado + contraseña + cooldown 30d
 *  - Cambiar teléfono requiere contraseña + cooldown 30d
 *  - No se pueden cambiar email y teléfono en la misma ventana de 30 días
 *  - Si 2FA está activo, cualquier cambio sensible también requiere código 2FA
 *  - 2FA funciona vía SMS/WhatsApp con código de 6 dígitos, expira en 10 min
 */

import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from './db';
import { sendEmail } from './emailService';
import { sendTemplate } from './whatsappService';

const COOLDOWN_DAYS = 30;
const CODE_EXPIRY_MIN = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

const getUser = async (userId: number) => {
  const r = await pool.query(
    `SELECT id, email, phone, phone_verified, password,
            two_factor_enabled, full_name,
            last_email_changed_at, last_phone_changed_at
       FROM users WHERE id = $1`,
    [userId]
  );
  return r.rows[0] ?? null;
};

const userId = (req: Request): number => (req as any).user?.userId ?? (req as any).user?.id;

const daysSince = (d: Date | string | null): number | null => {
  if (!d) return null;
  return (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
};

/** Genera y guarda código 2FA de 6 dígitos, devuelve el código */
const generate2FACode = async (uid: number): Promise<string> => {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MIN * 60 * 1000);
  // Invalida códigos anteriores para este usuario
  await pool.query(
    `UPDATE two_factor_codes SET used = true WHERE user_id = $1 AND used = false`,
    [uid]
  );
  await pool.query(
    `INSERT INTO two_factor_codes (user_id, code, expires_at, used) VALUES ($1, $2, $3, false)`,
    [uid, code, expiresAt]
  );
  return code;
};

const verify2FACode = async (uid: number, code: string): Promise<boolean> => {
  const r = await pool.query(
    `SELECT id FROM two_factor_codes
      WHERE user_id = $1 AND code = $2 AND expires_at > NOW() AND used = false`,
    [uid, code]
  );
  if (r.rows.length === 0) return false;
  await pool.query(`UPDATE two_factor_codes SET used = true WHERE id = $1`, [r.rows[0].id]);
  return true;
};

// ── Notificaciones de seguridad ────────────────────────────────────────────────

const sendSecurityEmail = async (
  toEmail: string,
  subject: string,
  html: string
) => {
  await sendEmail(toEmail, subject, html).catch(e =>
    console.warn('[accountSecurity] email error:', e?.message)
  );
};

const sendSecurityWhatsApp = async (
  phone: string,
  templateName: string,
  params: string[]
) => {
  await sendTemplate({ to: phone, template: templateName, parameters: params }).catch(e =>
    console.warn('[accountSecurity] WA error:', e?.message)
  );
};

// ── ENDPOINT: Enviar código 2FA al teléfono ───────────────────────────────────
/**
 * POST /api/auth/2fa/send-code
 * Genera y envía un código de 6 dígitos por WhatsApp.
 * No requiere 2FA activo — sirve para activarlo por primera vez.
 */
export const send2FACode = async (req: Request, res: Response): Promise<any> => {
  const uid = userId(req);
  if (!uid) return res.status(401).json({ error: 'No autorizado' });

  const user = await getUser(uid);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (!user.phone || !user.phone_verified) {
    return res.status(400).json({ error: 'Debes tener un teléfono verificado para usar 2FA' });
  }

  try {
    const code = await generate2FACode(uid);
    const r = await sendTemplate({
      to: user.phone,
      template: process.env.WHATSAPP_OTP_TEMPLATE || 'autenticacion_entregax',
      parameters: [code],
    });
    if (!r.ok && !r.skipped) {
      console.error('[2FA send-code] WhatsApp error:', r.error);
      return res.status(502).json({ error: 'No se pudo enviar el código por WhatsApp' });
    }
    return res.json({ ok: true, expiresInMinutes: CODE_EXPIRY_MIN });
  } catch (err: any) {
    console.error('[2FA send-code]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── ENDPOINT: Activar / Desactivar 2FA ────────────────────────────────────────
/**
 * POST /api/auth/2fa/toggle
 * body: { action: 'enable'|'disable', password, code }
 * - enable: requiere contraseña + código enviado al teléfono
 * - disable: requiere contraseña + código enviado al teléfono
 */
export const toggle2FA = async (req: Request, res: Response): Promise<any> => {
  const uid = userId(req);
  if (!uid) return res.status(401).json({ error: 'No autorizado' });

  const { action, password, code } = req.body as {
    action: 'enable' | 'disable';
    password: string;
    code: string;
  };

  if (!['enable', 'disable'].includes(action)) {
    return res.status(400).json({ error: 'action debe ser enable o disable' });
  }
  if (!password || !code) {
    return res.status(400).json({ error: 'Se requieren password y code' });
  }

  const user = await getUser(uid);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Verificar contraseña
  const validPwd = await bcrypt.compare(password, user.password);
  if (!validPwd) return res.status(401).json({ error: 'Contraseña incorrecta' });

  // Verificar código 2FA enviado
  const validCode = await verify2FACode(uid, code);
  if (!validCode) return res.status(401).json({ error: 'Código incorrecto o expirado' });

  const newValue = action === 'enable';
  if (user.two_factor_enabled === newValue) {
    return res.json({ ok: true, two_factor_enabled: newValue, message: `2FA ya estaba ${newValue ? 'activo' : 'inactivo'}` });
  }

  await pool.query(`UPDATE users SET two_factor_enabled = $1 WHERE id = $2`, [newValue, uid]);

  // Notificación por email
  const actionLabel = newValue ? 'activada' : 'desactivada';
  const subject = `Autenticación 2FA ${actionLabel} — EntregaX`;
  const html = `<p>Hola ${user.full_name},</p>
<p>La autenticación en dos pasos fue <strong>${actionLabel}</strong> en tu cuenta el ${new Date().toLocaleString('es-MX')}.</p>
<p>Si no realizaste este cambio, contacta a soporte inmediatamente.</p>`;
  sendSecurityEmail(user.email, subject, html);

  return res.json({ ok: true, two_factor_enabled: newValue });
};

// ── ENDPOINT: Cambiar correo electrónico ──────────────────────────────────────
/**
 * POST /api/auth/change-email
 * body: { newEmail, password, twoFactorCode? }
 * Reglas:
 *  - Teléfono debe estar verificado
 *  - Contraseña obligatoria
 *  - 2FA si está activo
 *  - Cooldown: 30 días desde último cambio de email
 *  - Cooldown cruzado: 30 días desde último cambio de teléfono
 *  - Notificación email (nuevo y anterior) + WhatsApp
 */
export const changeEmail = async (req: Request, res: Response): Promise<any> => {
  const uid = userId(req);
  if (!uid) return res.status(401).json({ error: 'No autorizado' });

  const { newEmail, password, twoFactorCode } = req.body as {
    newEmail: string;
    password: string;
    twoFactorCode?: string;
  };

  if (!newEmail || !password) {
    return res.status(400).json({ error: 'newEmail y password son requeridos' });
  }
  const emailNorm = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: 'Correo electrónico inválido' });
  }

  const user = await getUser(uid);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Requiere teléfono verificado
  if (!user.phone || !user.phone_verified) {
    return res.status(400).json({
      error: 'Debes tener un número de teléfono verificado para cambiar tu correo',
      requiresPhone: true,
    });
  }

  // Verificar contraseña
  const validPwd = await bcrypt.compare(password, user.password);
  if (!validPwd) return res.status(401).json({ error: 'Contraseña incorrecta' });

  // Verificar 2FA si está activo
  if (user.two_factor_enabled) {
    if (!twoFactorCode) return res.status(400).json({ error: 'Código 2FA requerido', requires2FA: true });
    const valid2FA = await verify2FACode(uid, twoFactorCode);
    if (!valid2FA) return res.status(401).json({ error: 'Código 2FA incorrecto o expirado' });
  }

  // Cooldown: mismo correo
  if (emailNorm === user.email.toLowerCase()) {
    return res.status(400).json({ error: 'El nuevo correo es igual al actual' });
  }

  // Cooldown 30 días desde último cambio de email
  const daysSinceEmail = daysSince(user.last_email_changed_at);
  if (daysSinceEmail !== null && daysSinceEmail < COOLDOWN_DAYS) {
    const remaining = Math.ceil(COOLDOWN_DAYS - daysSinceEmail);
    return res.status(429).json({
      error: `Debes esperar ${remaining} día(s) más para volver a cambiar tu correo`,
      cooldownDays: remaining,
    });
  }

  // Cooldown cruzado: si cambió teléfono recientemente no puede cambiar email
  const daysSincePhone = daysSince(user.last_phone_changed_at);
  if (daysSincePhone !== null && daysSincePhone < COOLDOWN_DAYS) {
    const remaining = Math.ceil(COOLDOWN_DAYS - daysSincePhone);
    return res.status(429).json({
      error: `Cambiaste tu teléfono hace poco. Debes esperar ${remaining} día(s) para cambiar el correo`,
      cooldownDays: remaining,
    });
  }

  // Verificar que el nuevo email no esté en uso
  const exists = await pool.query(`SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2`, [emailNorm, uid]);
  if (exists.rows.length > 0) {
    return res.status(409).json({ error: 'Este correo ya está registrado en otra cuenta' });
  }

  const oldEmail = user.email;
  await pool.query(
    `UPDATE users SET email = $1, last_email_changed_at = NOW() WHERE id = $2`,
    [emailNorm, uid]
  );

  const fechaStr = new Date().toLocaleString('es-MX');

  // Notificación al correo ANTERIOR
  sendSecurityEmail(
    oldEmail,
    '⚠️ Tu correo fue cambiado — EntregaX',
    `<p>Hola ${user.full_name},</p>
     <p>Tu correo electrónico fue actualizado el <strong>${fechaStr}</strong>.</p>
     <p>Nuevo correo: <strong>${emailNorm}</strong></p>
     <p>Si no realizaste este cambio, contacta a soporte inmediatamente.</p>`
  );

  // Notificación al correo NUEVO
  sendSecurityEmail(
    emailNorm,
    '✅ Correo actualizado — EntregaX',
    `<p>Hola ${user.full_name},</p>
     <p>Tu correo electrónico en EntregaX fue actualizado el <strong>${fechaStr}</strong>.</p>
     <p>Ahora puedes iniciar sesión con: <strong>${emailNorm}</strong></p>`
  );

  // Notificación WhatsApp al teléfono
  sendSecurityWhatsApp(user.phone, 'security_email_changed', [emailNorm, fechaStr]);

  return res.json({ ok: true, email: emailNorm });
};

// ── ENDPOINT: Notificar cambio de teléfono (se llama después del cambio exitoso) ──
export const notifyPhoneChanged = async (
  userId: number,
  newPhone: string,
  oldEmail: string,
  fullName: string
): Promise<void> => {
  const fechaStr = new Date().toLocaleString('es-MX');
  // Email de alerta
  sendSecurityEmail(
    oldEmail,
    '⚠️ Tu teléfono fue cambiado — EntregaX',
    `<p>Hola ${fullName},</p>
     <p>Tu número de teléfono fue actualizado el <strong>${fechaStr}</strong>.</p>
     <p>Nuevo teléfono: <strong>${newPhone}</strong></p>
     <p>Si no realizaste este cambio, contacta a soporte inmediatamente.</p>`
  );
  // WA al nuevo teléfono
  sendSecurityWhatsApp(newPhone, 'security_phone_changed', [newPhone, fechaStr]);
  // Guardar timestamp
  await pool.query(`UPDATE users SET last_phone_changed_at = NOW() WHERE id = $1`, [userId]);
};
