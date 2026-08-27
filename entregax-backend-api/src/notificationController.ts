/**
 * notificationController.ts
 * Controlador para el sistema de notificaciones
 */

import { Request, Response } from 'express';
import { pool } from './db';

// Tipos de notificación con sus iconos
export const NOTIFICATION_TYPES = {
  VERIFICATION_APPROVED: { type: 'success', icon: 'check-circle', title: '¡Verificación Aprobada!' },
  VERIFICATION_REJECTED: { type: 'error', icon: 'alert-circle', title: 'Verificación Rechazada' },
  PACKAGE_RECEIVED: { type: 'info', icon: 'package-variant', title: 'Paquete Recibido' },
  PACKAGE_IN_TRANSIT: { type: 'info', icon: 'truck-delivery', title: 'Paquete en Tránsito' },
  PACKAGE_DELIVERED: { type: 'success', icon: 'check-all', title: '¡Paquete Entregado!' },
  CONSOLIDATION_READY: { type: 'info', icon: 'package-variant-closed', title: 'Consolidación Lista' },
  PAYMENT_RECEIVED: { type: 'success', icon: 'cash-check', title: 'Pago Recibido' },
  ADVISOR_ASSIGNED: { type: 'info', icon: 'account-tie', title: 'Asesor Asignado' },
  GEX_ACTIVATED: { type: 'success', icon: 'shield-check', title: 'Garantía GEX Activada' },
  PROMO: { type: 'promo', icon: 'tag', title: 'Promoción Especial' },
  SYSTEM: { type: 'info', icon: 'bell', title: 'Aviso del Sistema' },
};

// Auto-migración silenciosa de las columnas de acuse.
//
// `is_read` solo decía SI, no CUÁNDO ni CÓMO. Para saber quién lee de verdad
// sus notificaciones hace falta distinguir a quien abre una por una de quien
// entra y aplasta "leer todo": las dos dejan is_read = true y hasta ahora
// parecían lo mismo. read_at guarda el momento del primer acuse (no se
// sobrescribe) y read_source guarda por qué botón pasó.
let _archivedColumnEnsured = false;
const ensureArchivedColumn = async () => {
  if (_archivedColumnEnsured) return;
  try {
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`);
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP`);
    await pool.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_source VARCHAR(20)`);
    // El panel de RH consulta por usuario y fecha de acuse.
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications (user_id, read_at)`);
    _archivedColumnEnsured = true;
  } catch (e) {
    console.warn('No se pudo asegurar columnas de acuse en notifications:', e);
  }
};

/**
 * Fragmento SQL del acuse. Se pone read_at solo si estaba vacío: si alguien ya
 * había leído la notificación y después la archiva, el dato que interesa es
 * cuándo la leyó, no cuándo la barrió.
 */
const ACUSE = (fuente: string) =>
  `is_read = true,
   read_at = COALESCE(read_at, NOW()),
   read_source = COALESCE(read_source, '${fuente}')`;

// 📱 APP: Obtener mis notificaciones
export const getMyNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureArchivedColumn();
    const userId = (req as any).user?.userId;
    const { limit = 50, offset = 0, unreadOnly, includeArchived } = req.query;

    let query = `
      SELECT id, title, message, type, icon, is_read, action_url, data, created_at, archived_at,
             read_at, read_source
      FROM notifications
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (includeArchived !== 'true') {
      query += ' AND archived_at IS NULL';
    }

    if (unreadOnly === 'true') {
      query += ' AND is_read = false';
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Contar no leídas (excluyendo archivadas)
    const unreadCount = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false AND archived_at IS NULL',
      [userId]
    );

    res.json({
      success: true,
      notifications: result.rows,
      unreadCount: parseInt(unreadCount.rows[0].count)
    });
  } catch (error) {
    console.error('Error en getMyNotifications:', error);
    res.status(500).json({ success: false, error: 'Error al obtener notificaciones' });
  }
};

// 📱 APP: Marcar notificación como leída
export const markAsRead = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId;
    const { notificationId } = req.params;

    await ensureArchivedColumn();
    // 'manual' = el usuario tocó la palomita de ESA notificación. Es el único
    // acuse que de verdad significa "la leí".
    const r = await pool.query(
      `UPDATE notifications SET ${ACUSE('manual')} WHERE id = $1 AND user_id = $2 RETURNING read_at`,
      [notificationId, userId]
    );

    res.json({ success: true, message: 'Notificación marcada como leída', read_at: r.rows[0]?.read_at || null });
  } catch (error) {
    console.error('Error en markAsRead:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar notificación' });
  }
};

// 📱 APP: Marcar todas como leídas
export const markAllAsRead = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId;

    await ensureArchivedColumn();
    const result = await pool.query(
      `UPDATE notifications SET ${ACUSE('leer_todo')} WHERE user_id = $1 AND is_read = false RETURNING id`,
      [userId]
    );

    res.json({ 
      success: true, 
      message: `${result.rowCount} notificaciones marcadas como leídas` 
    });
  } catch (error) {
    console.error('Error en markAllAsRead:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar notificaciones' });
  }
};

// 📱 APP: Obtener conteo de no leídas
export const getUnreadCount = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureArchivedColumn();
    const userId = (req as any).user?.userId;

    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false AND archived_at IS NULL',
      [userId]
    );

    res.json({ 
      success: true, 
      unreadCount: parseInt(result.rows[0].count) 
    });
  } catch (error) {
    console.error('Error en getUnreadCount:', error);
    res.status(500).json({ success: false, error: 'Error al obtener conteo' });
  }
};

// 📱 APP: Archivar una notificación
export const archiveNotification = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureArchivedColumn();
    const userId = (req as any).user?.userId;
    const { notificationId } = req.params;

    const result = await pool.query(
      `UPDATE notifications
       SET archived_at = NOW(), ${ACUSE('archivar')}
       WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
       RETURNING id`,
      [notificationId, userId]
    );

    res.json({ success: true, archived: result.rowCount ?? 0 });
  } catch (error) {
    console.error('Error en archiveNotification:', error);
    res.status(500).json({ success: false, error: 'Error al archivar notificación' });
  }
};

// 📱 APP: Archivar todas las notificaciones del usuario
export const archiveAllNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureArchivedColumn();
    const userId = (req as any).user?.userId;

    const result = await pool.query(
      `UPDATE notifications
       SET archived_at = NOW(), ${ACUSE('archivar_todo')}
       WHERE user_id = $1 AND archived_at IS NULL
       RETURNING id`,
      [userId]
    );

    res.json({
      success: true,
      archived: result.rowCount ?? 0,
      message: `${result.rowCount ?? 0} notificaciones archivadas`,
    });
  } catch (error) {
    console.error('Error en archiveAllNotifications:', error);
    res.status(500).json({ success: false, error: 'Error al archivar notificaciones' });
  }
};

// 📱 APP: Archivar un conjunto de notificaciones
export const archiveBulkNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureArchivedColumn();
    const userId = (req as any).user?.userId;
    const { ids } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids[] es requerido' });
    }

    const numericIds = ids
      .map((v: any) => parseInt(v, 10))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    if (numericIds.length === 0) {
      return res.json({ success: true, archived: 0 });
    }

    const result = await pool.query(
      `UPDATE notifications
       SET archived_at = NOW(), ${ACUSE('archivar_lote')}
       WHERE user_id = $1 AND archived_at IS NULL AND id = ANY($2::int[])
       RETURNING id`,
      [userId, numericIds]
    );

    res.json({
      success: true,
      archived: result.rowCount ?? 0,
      message: `${result.rowCount ?? 0} notificaciones archivadas`,
    });
  } catch (error) {
    console.error('Error en archiveBulkNotifications:', error);
    res.status(500).json({ success: false, error: 'Error al archivar notificaciones' });
  }
};

// 🔧 HELPER: Crear notificación (uso interno)
export const createNotification = async (
  userId: number,
  notificationType: keyof typeof NOTIFICATION_TYPES,
  message: string,
  data?: object,
  actionUrl?: string
): Promise<number | null> => {
  try {
    const notifConfig = NOTIFICATION_TYPES[notificationType];
    
    const result = await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, icon, action_url, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [userId, notifConfig.title, message, notifConfig.type, notifConfig.icon, actionUrl, data ? JSON.stringify(data) : null]
    );

    console.log(`📬 Notificación creada para usuario ${userId}: ${notifConfig.title}`);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error creando notificación:', error);
    return null;
  }
};

// 🔧 HELPER: Crear notificación personalizada
export const createCustomNotification = async (
  userId: number,
  title: string,
  message: string,
  type: string = 'info',
  icon: string = 'bell',
  data?: object,
  actionUrl?: string
): Promise<number | null> => {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, icon, action_url, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [userId, title, message, type, icon, actionUrl, data ? JSON.stringify(data) : null]
    );

    console.log(`📬 Notificación personalizada creada para usuario ${userId}: ${title}`);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error creando notificación personalizada:', error);
    return null;
  }
};

// 🖥️ ADMIN: Enviar notificación a un usuario
export const sendNotificationToUser = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, title, message, type, icon } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ success: false, error: 'userId, title y message son requeridos' });
    }

    const notifId = await createCustomNotification(
      userId,
      title,
      message,
      type || 'info',
      icon || 'bell'
    );

    res.json({ 
      success: true, 
      message: 'Notificación enviada',
      notificationId: notifId
    });
  } catch (error) {
    console.error('Error en sendNotificationToUser:', error);
    res.status(500).json({ success: false, error: 'Error al enviar notificación' });
  }
};

// 🖥️ ADMIN: Enviar notificación masiva
export const sendBroadcastNotification = async (req: Request, res: Response): Promise<any> => {
  try {
    const { title, message, type, icon, userFilter } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'title y message son requeridos' });
    }

    // Obtener usuarios según filtro
    let userQuery = 'SELECT id FROM users WHERE role = $1';
    const params: any[] = ['client'];

    if (userFilter === 'verified') {
      userQuery += ' AND is_verified = true';
    } else if (userFilter === 'unverified') {
      userQuery += ' AND is_verified = false';
    }

    const users = await pool.query(userQuery, params);

    let successCount = 0;
    for (const user of users.rows) {
      const result = await createCustomNotification(
        user.id,
        title,
        message,
        type || 'info',
        icon || 'bell'
      );
      if (result) successCount++;
    }

    res.json({ 
      success: true, 
      message: `Notificación enviada a ${successCount} usuarios`,
      totalUsers: users.rows.length,
      successCount
    });
  } catch (error) {
    console.error('Error en sendBroadcastNotification:', error);
    res.status(500).json({ success: false, error: 'Error al enviar notificaciones' });
  }
};
