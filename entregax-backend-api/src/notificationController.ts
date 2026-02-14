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

// 📱 APP: Obtener mis notificaciones
export const getMyNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId;
    const { limit = 50, offset = 0, unreadOnly } = req.query;

    let query = `
      SELECT id, title, message, type, icon, is_read, action_url, data, created_at
      FROM notifications
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (unreadOnly === 'true') {
      query += ' AND is_read = false';
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Contar no leídas
    const unreadCount = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
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

    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );

    res.json({ success: true, message: 'Notificación marcada como leída' });
  } catch (error) {
    console.error('Error en markAsRead:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar notificación' });
  }
};

// 📱 APP: Marcar todas como leídas
export const markAllAsRead = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId;

    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false RETURNING id',
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
    const userId = (req as any).user?.userId;

    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
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
