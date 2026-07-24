// notificationSoundsController.ts
// Sistema de tonos por tipo de notificación push. El admin (Super Admin) asigna,
// para cada tipo de notificación, un TONO. Dos capas:
//   1) Segundo plano (app cerrada): el SO reproduce un sonido EMPAQUETADO en el
//      build nativo (channelId en Android / filename .wav en iOS). Los tonos
//      disponibles aquí (BUNDLED_SOUNDS) salen del build.
//   2) Primer plano / web: la app/dashboard puede reproducir CUALQUIER mp3 subido
//      (custom_sound_url) de inmediato, sin build.
import { Request, Response } from 'express';
import { pool } from './db';
import { uploadToS3, getSignedUrlForKey, isS3Configured } from './s3Service';

// ─── Catálogo de TIPOS de notificación (todas las push del sistema) ───
// key = identificador estable que viaja en el push (payload.notificationType).
export const NOTIFICATION_TYPES: Array<{ key: string; label: string; description: string; group: string }> = [
  { key: 'package_received',   label: '📦 Paquete recibido',            description: 'Al recibir un paquete del cliente (PO Box, China aéreo, DHL, TDI, Marítimo).', group: 'Operación' },
  { key: 'package_unassigned', label: '📦 Guía sin identificar',        description: 'Guía recibida sin cliente asignado.', group: 'Operación' },
  { key: 'package_delivered',  label: '🎉 Paquete entregado',           description: 'Cuando el repartidor confirma la entrega.', group: 'Operación' },
  { key: 'repack_request',     label: '📦 Solicitud de reempaque',      description: 'El cliente pide reempaque/consolidación.', group: 'Operación' },
  { key: 'new_client_alta',    label: '🔔 Nueva alta de cliente',       description: 'Cada vez que se registra un cliente nuevo (avisa a Super Admin).', group: 'Ventas' },
  { key: 'referral_bonus',     label: '💸 Bono de referido',            description: 'Se libera el bono de $500 por referido.', group: 'Ventas' },
  { key: 'ticket_agent_reply', label: '🎧 Respuesta en tu ticket',      description: 'El agente responde el ticket (avisa al cliente).', group: 'Soporte' },
  { key: 'ticket_client_reply',label: '💬 Respuesta del cliente',       description: 'El cliente responde el ticket (avisa al agente).', group: 'Soporte' },
  { key: 'client_claim',       label: '🆘 Reclamación de número',       description: 'Cliente reclama su número de casillero.', group: 'Soporte' },
  { key: 'internal_chat',      label: '💬 Chat interno',                description: 'Mensajes del chat interno (Monitoreo/Repartidores/Operaciones/Dirección).', group: 'Interno' },
  { key: 'rate_change',        label: '💱 Nuevo precio de tarifa',      description: 'Cambio de precio de tarifas (aéreo).', group: 'Interno' },
  { key: 'dhl_product_change', label: '📦 Tipo de producto DHL',        description: 'Se actualiza el tipo de producto de una guía DHL.', group: 'Interno' },
  { key: 'maritime_consolidated', label: '🚢 Mercancía consolidada',    description: 'Carga consolidada para envío marítimo (LCL).', group: 'Operación' },
];

// ─── Tonos EMPAQUETADOS en el build nativo (para segundo plano) ───
// file = archivo .wav en assets/sounds; channel = canal Android creado en pushClient.
// 'default' = tono del sistema. Al agregar tonos nuevos hay que empaquetarlos + build.
export const BUNDLED_SOUNDS: Array<{ key: string; label: string; file: string | null; channel: string }> = [
  { key: 'default', label: 'Predeterminado (sistema)', file: null, channel: 'default' },
  { key: 'gong',    label: 'Gong',                      file: 'gong.wav', channel: 'altas' },
];

let schemaReady = false;
export const ensureNotificationSoundSchema = async (): Promise<void> => {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_sound_config (
      notification_type TEXT PRIMARY KEY,
      sound_key TEXT NOT NULL DEFAULT 'default',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      custom_sound_url TEXT,
      custom_sound_key TEXT,
      custom_sound_filename TEXT,
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE notification_sound_config ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE`).catch(() => {});
  // Seed: por defecto la alta de cliente usa Gong (no pisa si ya hay config).
  await pool.query(
    `INSERT INTO notification_sound_config (notification_type, sound_key) VALUES ('new_client_alta', 'gong')
     ON CONFLICT (notification_type) DO NOTHING`
  ).catch(() => {});
  schemaReady = true;
};

// Resuelve el tono para un tipo (usado por pushService y por la app en primer plano).
// Devuelve el filename iOS + channel Android para segundo plano, y la url custom para primer plano.
export interface ResolvedSound { soundKey: string; iosSound: string; androidChannel: string; customUrl: string | null; enabled: boolean; }
const soundCache = new Map<string, { v: ResolvedSound; exp: number }>();
export const resolveSoundForType = async (type: string | undefined | null): Promise<ResolvedSound | null> => {
  if (!type) return null;
  const cached = soundCache.get(type);
  if (cached && cached.exp > Date.now()) return cached.v;
  try {
    await ensureNotificationSoundSchema();
    const r = await pool.query(`SELECT sound_key, custom_sound_url, enabled FROM notification_sound_config WHERE notification_type = $1`, [type]);
    const row = r.rows[0];
    const soundKey = row?.sound_key || 'default';
    const bundled = BUNDLED_SOUNDS.find(b => b.key === soundKey) || BUNDLED_SOUNDS[0];
    const v: ResolvedSound = {
      soundKey,
      iosSound: bundled?.file || 'default',
      androidChannel: bundled?.channel || 'default',
      customUrl: row?.custom_sound_url || null,
      enabled: row ? row.enabled !== false : true,
    };
    soundCache.set(type, { v, exp: Date.now() + 30_000 });
    return v;
  } catch { return null; }
};
const clearSoundCache = () => soundCache.clear();

// GET /api/admin/notification-sounds  → catálogo de tipos + config + tonos disponibles
export const getNotificationSounds = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureNotificationSoundSchema();
    const cfg = await pool.query(`SELECT notification_type, sound_key, enabled, custom_sound_url, custom_sound_filename, updated_at FROM notification_sound_config`);
    const byType: Record<string, any> = {};
    for (const row of cfg.rows) byType[row.notification_type] = row;
    const types = NOTIFICATION_TYPES.map(t => ({
      ...t,
      soundKey: byType[t.key]?.sound_key || 'default',
      enabled: byType[t.key] ? byType[t.key].enabled !== false : true,
      customSoundUrl: byType[t.key]?.custom_sound_url || null,
      customSoundFilename: byType[t.key]?.custom_sound_filename || null,
      updatedAt: byType[t.key]?.updated_at || null,
    }));
    res.json({ success: true, types, bundledSounds: BUNDLED_SOUNDS.map(({ key, label }) => ({ key, label })) });
  } catch (e: any) {
    console.error('getNotificationSounds:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

// PUT /api/admin/notification-sounds/:type  { soundKey }  → asignar tono empaquetado
export const setNotificationSound = async (req: Request, res: Response): Promise<any> => {
  try {
    const { type } = req.params;
    const { soundKey } = req.body || {};
    if (!NOTIFICATION_TYPES.find(t => t.key === type)) return res.status(400).json({ success: false, error: 'Tipo de notificación inválido' });
    if (!BUNDLED_SOUNDS.find(b => b.key === soundKey)) return res.status(400).json({ success: false, error: 'Tono no válido' });
    await ensureNotificationSoundSchema();
    await pool.query(
      `INSERT INTO notification_sound_config (notification_type, sound_key, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (notification_type) DO UPDATE SET sound_key = $2, updated_by = $3, updated_at = NOW()`,
      [type, soundKey, (req as any).user?.id || null]
    );
    clearSoundCache();
    res.json({ success: true });
  } catch (e: any) {
    console.error('setNotificationSound:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

// PUT /api/admin/notification-sounds/:type/enabled  { enabled }  → prender/apagar
export const setNotificationEnabled = async (req: Request, res: Response): Promise<any> => {
  try {
    const { type } = req.params;
    const { enabled } = req.body || {};
    if (!NOTIFICATION_TYPES.find(t => t.key === type)) return res.status(400).json({ success: false, error: 'Tipo de notificación inválido' });
    await ensureNotificationSoundSchema();
    await pool.query(
      `INSERT INTO notification_sound_config (notification_type, enabled, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (notification_type) DO UPDATE SET enabled = $2, updated_by = $3, updated_at = NOW()`,
      [type, enabled !== false, (req as any).user?.id || null]
    );
    clearSoundCache();
    res.json({ success: true });
  } catch (e: any) {
    console.error('setNotificationEnabled:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

// POST /api/admin/notification-sounds/:type/custom  (multipart: file=mp3)
// Sube un MP3 a S3 y lo asigna como sonido custom (suena en primer plano/web).
export const uploadNotificationSound = async (req: Request, res: Response): Promise<any> => {
  try {
    const { type } = req.params;
    if (!NOTIFICATION_TYPES.find(t => t.key === type)) return res.status(400).json({ success: false, error: 'Tipo de notificación inválido' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ success: false, error: 'Falta el archivo de audio' });
    if (!/audio\/(mpeg|mp3|wav|x-wav|ogg)/i.test(file.mimetype) && !/\.(mp3|wav|ogg)$/i.test(file.originalname || '')) {
      return res.status(400).json({ success: false, error: 'El archivo debe ser mp3, wav u ogg' });
    }
    if (!isS3Configured()) return res.status(500).json({ success: false, error: 'S3 no configurado' });
    await ensureNotificationSoundSchema();
    const ext = (file.originalname?.split('.').pop() || 'mp3').toLowerCase();
    const key = `notification-sounds/${type}_${Date.now()}.${ext}`;
    await uploadToS3(file.buffer, key, file.mimetype || 'audio/mpeg');
    // URL firmada larga (bucket privado) para reproducir desde web/app.
    const url = await getSignedUrlForKey(key, 60 * 60 * 24 * 365);
    await pool.query(
      `INSERT INTO notification_sound_config (notification_type, custom_sound_url, custom_sound_key, custom_sound_filename, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (notification_type) DO UPDATE SET custom_sound_url = $2, custom_sound_key = $3, custom_sound_filename = $4, updated_by = $5, updated_at = NOW()`,
      [type, url, key, file.originalname || `sound.${ext}`, (req as any).user?.id || null]
    );
    clearSoundCache();
    res.json({ success: true, customSoundUrl: url, customSoundFilename: file.originalname });
  } catch (e: any) {
    console.error('uploadNotificationSound:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

// DELETE /api/admin/notification-sounds/:type/custom  → quitar el mp3 custom
export const removeNotificationSound = async (req: Request, res: Response): Promise<any> => {
  try {
    const { type } = req.params;
    await ensureNotificationSoundSchema();
    await pool.query(
      `UPDATE notification_sound_config SET custom_sound_url = NULL, custom_sound_key = NULL, custom_sound_filename = NULL, updated_at = NOW() WHERE notification_type = $1`,
      [type]
    );
    clearSoundCache();
    res.json({ success: true });
  } catch (e: any) {
    console.error('removeNotificationSound:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};

// GET /api/notification-sounds/config  → config pública (para la app: reproducir en primer plano)
export const getNotificationSoundsPublic = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureNotificationSoundSchema();
    const cfg = await pool.query(`SELECT notification_type, sound_key, enabled, custom_sound_url FROM notification_sound_config`);
    const map: Record<string, { soundKey: string; enabled: boolean; customUrl: string | null }> = {};
    for (const row of cfg.rows) map[row.notification_type] = { soundKey: row.sound_key, enabled: row.enabled !== false, customUrl: row.custom_sound_url };
    res.json({ success: true, config: map });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
};
