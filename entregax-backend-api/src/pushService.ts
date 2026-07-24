// pushService.ts — Envío de push notifications.
// Soporta dos rutas:
//   1) Expo Push Service (tokens ExponentPushToken[...]) → https://exp.host/--/api/v2/push/send
//   2) FCM directo vía firebase-admin (tokens nativos FCM/APNs) si hay FIREBASE_* env vars
import { pool } from './db';
import https from 'https';

let firebaseAdmin: any = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      // Lazy import para que el backend siga funcionando si la dependencia
      // no está aún instalada.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require('firebase-admin');
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        console.warn('[push] FIREBASE_* env vars missing — push notifications deshabilitadas');
        return;
      }

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      }
      firebaseAdmin = admin;
      initialized = true;
      console.log('[push] firebase-admin inicializado');
    } catch (err: any) {
      console.warn('[push] firebase-admin no disponible:', err.message);
    }
  })();
  return initPromise;
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  // Sonido custom (ej. 'gong.wav'). Requiere que el archivo esté empaquetado en
  // el build nativo de la app; si no existe en el dispositivo, cae a 'default'.
  sound?: string;
  // Canal de Android (ej. 'altas'). Si no existe en el dispositivo, cae al default.
  channelId?: string;
  // Tipo de notificación (ver NOTIFICATION_TYPES). Si se pasa, el tono/canal y el
  // on/off se resuelven desde la config del panel de Ajustes del Sistema.
  notificationType?: string;
}

function isExpoToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[/.test(token);
}

async function sendExpoPush(
  tokens: { id: number; token: string }[],
  payload: PushPayload
): Promise<string[]> {
  // Devuelve lista de tokens inválidos a desactivar
  const invalid: string[] = [];
  if (tokens.length === 0) return invalid;

  // Expo recomienda batches de 100
  const messages = tokens.map((t) => ({
    to: t.token,
    sound: payload.sound || 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    priority: 'high',
    channelId: payload.channelId || 'chat',
  }));

  const chunks: any[][] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

  for (const chunk of chunks) {
    try {
      const body = JSON.stringify(chunk);
      const resp = await new Promise<{ status: number; data: any }>((resolve, reject) => {
        const req = https.request(
          {
            method: 'POST',
            hostname: 'exp.host',
            path: '/--/api/v2/push/send',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Content-Length': Buffer.byteLength(body),
              ...(process.env.EXPO_ACCESS_TOKEN
                ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
                : {}),
            },
          },
          (r) => {
            const bufs: Buffer[] = [];
            r.on('data', (d) => bufs.push(d));
            r.on('end', () => {
              const text = Buffer.concat(bufs).toString('utf8');
              try {
                resolve({ status: r.statusCode || 0, data: JSON.parse(text) });
              } catch {
                resolve({ status: r.statusCode || 0, data: text });
              }
            });
          }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      if (resp.status >= 400) {
        console.warn('[push][expo] status', resp.status, resp.data);
        continue;
      }
      const tickets: any[] = resp.data?.data || [];
      tickets.forEach((ticket, idx) => {
        if (ticket?.status === 'error') {
          const code = ticket?.details?.error || '';
          if (code === 'DeviceNotRegistered' || code === 'InvalidCredentials') {
            invalid.push(chunk[idx].to);
          }
          console.warn('[push][expo] error ticket:', ticket);
        }
      });
    } catch (e: any) {
      console.error('[push][expo] excepción:', e.message);
    }
  }

  return invalid;
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  // Resolver tono / on-off desde la config del panel (Ajustes del Sistema).
  if (payload.notificationType) {
    try {
      const { resolveSoundForType } = await import('./notificationSoundsController');
      const resolved = await resolveSoundForType(payload.notificationType);
      if (resolved) {
        if (!resolved.enabled) return; // notificación APAGADA → no se envía
        if (!payload.sound) payload.sound = resolved.iosSound;
        if (!payload.channelId) payload.channelId = resolved.androidChannel;
        // La url del mp3 custom viaja en data para que la app la reproduzca en primer plano.
        if (resolved.customUrl) payload.data = { ...(payload.data || {}), _customSoundUrl: resolved.customUrl };
      }
    } catch { /* si falla, se envía con el sonido por defecto */ }
  }

  // Recoger tokens activos
  const r = await pool.query(
    `SELECT id, token, platform FROM user_push_tokens
      WHERE user_id = ANY($1::int[]) AND is_active = TRUE`,
    [userIds]
  );
  const allTokens: { id: number; token: string; platform: string }[] = r.rows;
  if (allTokens.length === 0) return;

  const expoTokens = allTokens.filter((t) => isExpoToken(t.token));
  const nativeTokens = allTokens.filter((t) => !isExpoToken(t.token));

  const invalidAll: string[] = [];

  // 1) Enviar Expo tokens
  if (expoTokens.length > 0) {
    const inv = await sendExpoPush(expoTokens, payload);
    invalidAll.push(...inv);
  }

  // 2) Enviar tokens nativos FCM/APNs (si tenemos firebase-admin)
  if (nativeTokens.length > 0) {
    await ensureInitialized();
    if (firebaseAdmin) {
      const message = {
        notification: { title: payload.title, body: payload.body },
        data: payload.data || {},
        tokens: nativeTokens.map((t) => t.token),
        android: {
          priority: 'high' as const,
          notification: { sound: payload.sound || 'default', channelId: payload.channelId || 'chat' },
        },
        apns: {
          payload: { aps: { sound: payload.sound || 'default', badge: 1 } },
        },
      };
      try {
        const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
        if (response?.responses) {
          response.responses.forEach((res: any, idx: number) => {
            if (!res.success) {
              const code = res.error?.code || '';
              if (
                code.includes('registration-token-not-registered') ||
                code.includes('invalid-registration-token') ||
                code.includes('invalid-argument')
              ) {
                const t = nativeTokens[idx];
                if (t) invalidAll.push(t.token);
              }
            }
          });
        }
      } catch (err: any) {
        console.error('[push][fcm] error enviando:', err.message);
      }
    }
  }

  // Desactivar tokens inválidos
  if (invalidAll.length > 0) {
    await pool.query(
      `UPDATE user_push_tokens SET is_active = FALSE WHERE token = ANY($1::text[])`,
      [invalidAll]
    );
  }
}

// Notifica a los SUPER ADMINS de una nueva alta de cliente con push + sonido Gong.
// Fire-and-forget seguro: se auto-captura, nunca bloquea ni rompe el registro.
// Llamar desde CADA vía de alta (self-registro, social Google/Apple, legacy).
export async function notifyNewClientAlta(user: {
  id: number;
  full_name?: string | null;
  box_id?: string | null;
}): Promise<void> {
  try {
    await sendPushToRole(['super_admin'], {
      title: '🔔 Nueva alta de cliente',
      body: `${user.full_name || 'Nuevo cliente'} se acaba de registrar`,
      data: { type: 'nueva_alta', userId: String(user.id), boxId: String(user.box_id || '') },
      notificationType: 'new_client_alta', // tono/on-off desde el panel de Ajustes
    });
  } catch (e) {
    console.error('[ALTA] push a super_admin falló:', (e as Error).message);
  }
}

export async function sendPushToRole(roles: string[], payload: PushPayload): Promise<void> {
  if (!roles.length) return;
  const r = await pool.query(
    `SELECT id FROM users WHERE role = ANY($1::text[]) AND id IN (SELECT user_id FROM user_push_tokens WHERE is_active = TRUE)`,
    [roles]
  );
  if (r.rows.length === 0) return;
  await sendPushToUsers(r.rows.map((row: any) => row.id), payload);
}
