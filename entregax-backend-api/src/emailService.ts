/**
 * emailService.ts — Envío de correos transaccionales vía AWS SES.
 *
 * Reusa las mismas credenciales AWS que ya tenemos para S3 (variables
 * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION). Envía con SES v2
 * (SendEmailCommand) usando un FROM verificado en la consola de SES.
 *
 * Variables de entorno requeridas:
 *   - EMAIL_FROM      → ej. "EntregaX <noreply@entregax.com>"
 *                       el dominio o address debe estar verificado en SES
 *   - WEB_BASE_URL    → ej. "https://entregax.app"
 *                       sirve para construir links de reset
 *
 * Si las creds no están listas, las funciones loguean un warning y
 * regresan { ok: false } sin tirar el flujo (el endpoint /forgot-password
 * sigue respondiendo OK al cliente — buena práctica para no filtrar si un
 * email existe).
 */

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const isEmailConfigured = (): boolean => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.EMAIL_FROM
  );
};

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<SendEmailResult> => {
  if (!isEmailConfigured()) {
    console.warn('⚠️  Email no configurado (faltan AWS_* o EMAIL_FROM). Skip envío a:', to);
    return { ok: false, error: 'email_not_configured' };
  }

  try {
    const cmd = new SendEmailCommand({
      FromEmailAddress: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text || stripHtml(html), Charset: 'UTF-8' },
          },
        },
      },
    });
    const result = await ses.send(cmd);
    console.log(`📧 SES sent to=${to} msgId=${result.MessageId}`);
    return result.MessageId
      ? { ok: true, messageId: result.MessageId }
      : { ok: true };
  } catch (err: any) {
    console.error('❌ SES sendEmail error:', err?.message || err);
    return { ok: false, error: err?.message || 'unknown_error' };
  }
};

const stripHtml = (html: string): string =>
  html
    .replace(/<style[^>]*>.*?<\/style>/gis, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ============================================
// Helpers de templates
// ============================================

export const sendPasswordResetEmail = async (
  to: string,
  recipientName: string,
  token: string
): Promise<SendEmailResult> => {
  const baseUrl = (process.env.WEB_BASE_URL || 'https://entregax.app').replace(/\/$/, '');
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  // Logo público servido desde /public del web admin. Versión "Paquetería"
  // (logo nuevo con la marca completa).
  const logoUrl = `${baseUrl}/logo-paqeteria.png`;

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Restablecer contraseña</title>
    </head>
    <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
              <tr>
                <td style="background:#111;padding:20px 32px;text-align:left;">
                  <img src="${logoUrl}"
                       alt="EntregaX"
                       width="160"
                       style="display:inline-block;height:auto;max-width:160px;border:0;outline:none;text-decoration:none;" />
                </td>
              </tr>
              <tr>
                <td style="padding:32px;color:#222;">
                  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111;">Restablecer contraseña</h1>
                  <p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#333;">
                    Hola ${escapeHtml(recipientName || 'cliente')},
                  </p>
                  <p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#333;">
                    Recibimos una solicitud para restablecer la contraseña de tu cuenta.
                    Si fuiste tú, haz clic en el botón. El link es válido por <strong>1 hora</strong>.
                  </p>
                  <p style="margin:24px 0;text-align:center;">
                    <a href="${resetUrl}"
                       style="display:inline-block;background:#F05A28;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:8px;font-size:15px;">
                      Restablecer mi contraseña
                    </a>
                  </p>
                  <p style="margin:0 0 8px;font-size:13px;color:#666;">
                    Si el botón no funciona, copia y pega este link en tu navegador:
                  </p>
                  <p style="margin:0 0 24px;font-size:12px;color:#666;word-break:break-all;">
                    <a href="${resetUrl}" style="color:#F05A28;">${resetUrl}</a>
                  </p>
                  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
                  <p style="margin:0;font-size:12px;line-height:18px;color:#888;">
                    Si tú no pediste este cambio, ignora este correo — tu contraseña actual seguirá siendo válida.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#fafafa;padding:16px 32px;text-align:center;font-size:11px;color:#999;">
                  © ${new Date().getFullYear()} EntregaX — Paquetería Internacional
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hola ${recipientName || 'cliente'},

Recibimos una solicitud para restablecer la contraseña de tu cuenta de EntregaX.
El link es válido por 1 hora:

${resetUrl}

Si tú no pediste este cambio, ignora este correo.

— EntregaX Paquetería Internacional`;

  return sendEmail(to, 'Restablece tu contraseña — EntregaX', html, text);
};

const escapeHtml = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
