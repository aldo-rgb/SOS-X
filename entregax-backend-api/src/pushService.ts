// pushService.ts — Envío de Firebase Cloud Messaging (FCM) directo a tokens.
// Si firebase-admin no está instalado o no hay credenciales, los envíos
// se hacen no-op (solo log) para no romper la API.
import { pool } from './db';

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
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  await ensureInitialized();
  if (!firebaseAdmin) return;

  // Recoger tokens activos
  const r = await pool.query(
    `SELECT id, token, platform FROM user_push_tokens
      WHERE user_id = ANY($1::int[]) AND is_active = TRUE`,
    [userIds]
  );
  const tokens: { id: number; token: string }[] = r.rows;
  if (tokens.length === 0) return;

  const message = {
    notification: { title: payload.title, body: payload.body },
    data: payload.data || {},
    tokens: tokens.map((t) => t.token),
    android: {
      priority: 'high' as const,
      notification: { sound: 'default', channelId: 'chat' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  try {
    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
    // Desactivar tokens inválidos
    if (response?.responses) {
      const invalid: string[] = [];
      response.responses.forEach((res: any, idx: number) => {
        if (!res.success) {
          const code = res.error?.code || '';
          if (
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-registration-token') ||
            code.includes('invalid-argument')
          ) {
            const t = tokens[idx];
            if (t) invalid.push(t.token);
          }
        }
      });
      if (invalid.length > 0) {
        await pool.query(
          `UPDATE user_push_tokens SET is_active = FALSE WHERE token = ANY($1::text[])`,
          [invalid]
        );
      }
    }
  } catch (err: any) {
    console.error('[push] error enviando FCM:', err.message);
  }
}
