/**
 * Controlador de Créditos por Servicio
 * Gestiona líneas de crédito separadas por cada RFC/Servicio
 */

import { Request, Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import { ServiceType } from './services/openpayConfig';

// ============================================
// TIPOS
// ============================================

interface ServiceCredit {
  id: number;
  user_id: number;
  service: ServiceType;
  credit_limit: number;
  used_credit: number;
  available_credit: number;
  credit_days: number;
  is_blocked: boolean;
  approved_at: string | null;
  approved_by: number | null;
  notes: string | null;
  company_name?: string;
  pending_invoices?: number;
  overdue_amount?: number;
}

interface ClientWithServiceCredits {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
  company_name: string;
  service_credits: ServiceCredit[];
  total_credit_limit: number;
  total_used_credit: number;
  total_available_credit: number;
  has_any_blocked: boolean;
  has_overdue: boolean;
}

// ============================================
// OBTENER CRÉDITOS POR SERVICIO DE UN USUARIO
// ============================================

export const getUserServiceCredits = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.params.userId || req.user?.userId;

    // Obtener todos los créditos del usuario con info de la empresa
    const result = await pool.query(`
      SELECT 
        usc.*,
        sc.company_name,
        sc.legal_name,
        (usc.credit_limit - usc.used_credit) as available_credit,
        (SELECT COUNT(*) FROM payment_invoices pi 
         WHERE pi.user_id = usc.user_id AND pi.service = usc.service 
         AND pi.status IN ('pending', 'partial')) as pending_invoices,
        (SELECT COALESCE(SUM(pi.amount - pi.amount_paid), 0) 
         FROM payment_invoices pi 
         WHERE pi.user_id = usc.user_id AND pi.service = usc.service 
         AND pi.status IN ('pending', 'partial') 
         AND pi.due_date < CURRENT_DATE) as overdue_amount
      FROM user_service_credits usc
      JOIN service_companies sc ON usc.service = sc.service
      WHERE usc.user_id = $1
      ORDER BY sc.id
    `, [userId]);

    // Si no tiene créditos, devolver estructura vacía con todos los servicios
    if (result.rows.length === 0) {
      const servicesRes = await pool.query(`
        SELECT service, company_name, legal_name 
        FROM service_companies 
        WHERE is_active = TRUE 
        ORDER BY id
      `);
      
      const emptyCredits = servicesRes.rows.map(s => ({
        service: s.service,
        company_name: s.company_name,
        credit_limit: 0,
        used_credit: 0,
        available_credit: 0,
        credit_days: 15,
        is_blocked: false,
        pending_invoices: 0,
        overdue_amount: 0
      }));

      return res.json({
        success: true,
        userId,
        credits: emptyCredits,
        totals: {
          credit_limit: 0,
          used_credit: 0,
          available_credit: 0
        }
      });
    }

    // Calcular totales
    const totals = result.rows.reduce((acc, c) => ({
      credit_limit: acc.credit_limit + parseFloat(c.credit_limit || 0),
      used_credit: acc.used_credit + parseFloat(c.used_credit || 0),
      available_credit: acc.available_credit + parseFloat(c.available_credit || 0)
    }), { credit_limit: 0, used_credit: 0, available_credit: 0 });

    res.json({
      success: true,
      userId,
      credits: result.rows,
      totals
    });
  } catch (error) {
    console.error('Error getting user service credits:', error);
    res.status(500).json({ error: 'Error obteniendo créditos por servicio' });
  }
};

// ============================================
// ACTUALIZAR CRÉDITO DE UN SERVICIO ESPECÍFICO
// ============================================

export const updateServiceCredit = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { userId, service } = req.params;
    const { credit_limit, credit_days, is_blocked, notes } = req.body;
    const adminId = req.user?.userId;

    // Validar servicio
    const validServices = ['aereo', 'maritimo', 'terrestre_nacional', 'dhl_liberacion', 'po_box'];
    if (!service || !validServices.includes(service as string)) {
      return res.status(400).json({ error: 'Servicio no válido' });
    }

    // Upsert del crédito
    const result = await pool.query(`
      INSERT INTO user_service_credits (user_id, service, credit_limit, credit_days, is_blocked, notes, approved_by, approved_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id, service) DO UPDATE SET
        credit_limit = COALESCE($3, user_service_credits.credit_limit),
        credit_days = COALESCE($4, user_service_credits.credit_days),
        is_blocked = COALESCE($5, user_service_credits.is_blocked),
        notes = COALESCE($6, user_service_credits.notes),
        approved_by = $7,
        updated_at = NOW()
      RETURNING *
    `, [userId, service, credit_limit, credit_days, is_blocked, notes, adminId]);

    // Log de auditoría
    await pool.query(`
      INSERT INTO activity_logs (user_id, action, details, created_by)
      VALUES ($1, 'credit_updated', $2, $3)
    `, [
      userId,
      JSON.stringify({ 
        service, 
        credit_limit, 
        credit_days, 
        is_blocked,
        updated_by: adminId 
      }),
      adminId
    ]).catch(() => {}); // Ignorar si no existe la tabla

    res.json({
      success: true,
      message: `Crédito para ${service} actualizado`,
      credit: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating service credit:', error);
    res.status(500).json({ error: 'Error actualizando crédito' });
  }
};

// ============================================
// ACTUALIZAR TODOS LOS CRÉDITOS DE UN USUARIO
// ============================================

export const updateAllServiceCredits = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;
    const { credits } = req.body; // Array de { service, credit_limit, credit_days, is_blocked, notes }
    const adminId = req.user?.userId;

    if (!Array.isArray(credits)) {
      return res.status(400).json({ error: 'Se requiere un array de créditos' });
    }

    const results = [];
    
    for (const credit of credits) {
      if (!credit.service) continue;
      
      const result = await pool.query(`
        INSERT INTO user_service_credits (user_id, service, credit_limit, credit_days, is_blocked, notes, approved_by, approved_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (user_id, service) DO UPDATE SET
          credit_limit = COALESCE($3, user_service_credits.credit_limit),
          credit_days = COALESCE($4, user_service_credits.credit_days),
          is_blocked = COALESCE($5, user_service_credits.is_blocked),
          notes = COALESCE($6, user_service_credits.notes),
          approved_by = $7,
          updated_at = NOW()
        RETURNING *
      `, [userId, credit.service, credit.credit_limit, credit.credit_days, credit.is_blocked, credit.notes, adminId]);

      results.push(result.rows[0]);
    }

    res.json({
      success: true,
      message: 'Créditos actualizados',
      credits: results
    });
  } catch (error) {
    console.error('Error updating all service credits:', error);
    res.status(500).json({ error: 'Error actualizando créditos' });
  }
};

// ============================================
// LISTAR CLIENTES CON SUS CRÉDITOS POR SERVICIO
// ============================================

export const getClientsWithServiceCredits = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { service, hasCredit, isBlocked, search } = req.query;

    // Base query para clientes
    let clientQuery = `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.box_id,
        u.company_name,
        u.phone
      FROM users u
      WHERE u.role IN ('client', 'cliente')
    `;

    const params: any[] = [];

    // Filtro por búsqueda
    if (search) {
      params.push(`%${search}%`);
      clientQuery += ` AND (
        u.full_name ILIKE $${params.length} OR 
        u.email ILIKE $${params.length} OR 
        u.box_id ILIKE $${params.length} OR
        u.company_name ILIKE $${params.length}
      )`;
    }

    clientQuery += ' ORDER BY u.full_name';

    const clientsRes = await pool.query(clientQuery, params);

    // Para cada cliente, obtener sus créditos por servicio
    const clientsWithCredits: ClientWithServiceCredits[] = [];

    for (const client of clientsRes.rows) {
      // Obtener créditos del cliente
      const creditsRes = await pool.query(`
        SELECT 
          usc.*,
          sc.company_name as service_company_name,
          (usc.credit_limit - usc.used_credit) as available_credit,
          (SELECT COUNT(*) FROM payment_invoices pi 
           WHERE pi.user_id = usc.user_id AND pi.service = usc.service 
           AND pi.status IN ('pending', 'partial')) as pending_invoices,
          (SELECT COALESCE(SUM(pi.amount - pi.amount_paid), 0) 
           FROM payment_invoices pi 
           WHERE pi.user_id = usc.user_id AND pi.service = usc.service 
           AND pi.status IN ('pending', 'partial') 
           AND pi.due_date < CURRENT_DATE) as overdue_amount
        FROM user_service_credits usc
        JOIN service_companies sc ON usc.service = sc.service
        WHERE usc.user_id = $1
        ORDER BY sc.id
      `, [client.id]);

      // Si hay filtro de servicio, verificar
      if (service && service !== 'all') {
        const hasServiceCredit = creditsRes.rows.some(
          c => c.service === service && parseFloat(c.credit_limit) > 0
        );
        if (!hasServiceCredit) continue;
      }

      // Si hay filtro de tiene crédito
      if (hasCredit === 'true') {
        const hasAnyCredit = creditsRes.rows.some(c => parseFloat(c.credit_limit) > 0);
        if (!hasAnyCredit) continue;
      }

      // Si hay filtro de bloqueado
      if (isBlocked === 'true') {
        const anyBlocked = creditsRes.rows.some(c => c.is_blocked || parseFloat(c.overdue_amount) > 0);
        if (!anyBlocked) continue;
      }

      // Calcular totales
      const totals = creditsRes.rows.reduce((acc, c) => ({
        credit_limit: acc.credit_limit + parseFloat(c.credit_limit || 0),
        used_credit: acc.used_credit + parseFloat(c.used_credit || 0),
        available_credit: acc.available_credit + parseFloat(c.available_credit || 0)
      }), { credit_limit: 0, used_credit: 0, available_credit: 0 });

      clientsWithCredits.push({
        ...client,
        service_credits: creditsRes.rows,
        total_credit_limit: totals.credit_limit,
        total_used_credit: totals.used_credit,
        total_available_credit: totals.available_credit,
        has_any_blocked: creditsRes.rows.some(c => c.is_blocked),
        has_overdue: creditsRes.rows.some(c => parseFloat(c.overdue_amount) > 0)
      });
    }

    // Calcular estadísticas globales
    const statsRes = await pool.query(`
      SELECT 
        service,
        COUNT(*) as clients_with_credit,
        SUM(credit_limit) as total_limit,
        SUM(used_credit) as total_used,
        SUM(credit_limit - used_credit) as total_available,
        COUNT(*) FILTER (WHERE is_blocked = TRUE) as blocked_count
      FROM user_service_credits
      WHERE credit_limit > 0
      GROUP BY service
      ORDER BY service
    `);

    res.json({
      success: true,
      clients: clientsWithCredits,
      stats: statsRes.rows,
      totalClients: clientsWithCredits.length
    });
  } catch (error) {
    console.error('Error getting clients with service credits:', error);
    res.status(500).json({ error: 'Error obteniendo clientes con créditos' });
  }
};

// ============================================
// RESUMEN DE CRÉDITOS POR SERVICIO (DASHBOARD)
// ============================================

export const getServiceCreditsSummary = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT 
        sc.service,
        sc.company_name,
        sc.legal_name,
        sc.rfc,
        COALESCE(credits.clients_count, 0) as clients_with_credit,
        COALESCE(credits.total_limit, 0) as total_credit_limit,
        COALESCE(credits.total_used, 0) as total_credit_used,
        COALESCE(credits.total_available, 0) as total_credit_available,
        COALESCE(credits.blocked_count, 0) as blocked_clients,
        COALESCE(invoices.pending_count, 0) as pending_invoices,
        COALESCE(invoices.pending_amount, 0) as pending_amount,
        COALESCE(invoices.overdue_amount, 0) as overdue_amount
      FROM service_companies sc
      LEFT JOIN (
        SELECT 
          service,
          COUNT(*) as clients_count,
          SUM(credit_limit) as total_limit,
          SUM(used_credit) as total_used,
          SUM(credit_limit - used_credit) as total_available,
          COUNT(*) FILTER (WHERE is_blocked = TRUE) as blocked_count
        FROM user_service_credits
        WHERE credit_limit > 0
        GROUP BY service
      ) credits ON sc.service = credits.service
      LEFT JOIN (
        SELECT 
          service,
          COUNT(*) as pending_count,
          SUM(amount - amount_paid) as pending_amount,
          SUM(CASE WHEN due_date < CURRENT_DATE THEN amount - amount_paid ELSE 0 END) as overdue_amount
        FROM payment_invoices
        WHERE status IN ('pending', 'partial')
        GROUP BY service
      ) invoices ON sc.service = invoices.service
      WHERE sc.is_active = TRUE
      ORDER BY sc.id
    `);

    // Totales generales
    const totals = result.rows.reduce((acc, s) => ({
      total_credit_limit: acc.total_credit_limit + parseFloat(s.total_credit_limit || 0),
      total_credit_used: acc.total_credit_used + parseFloat(s.total_credit_used || 0),
      total_credit_available: acc.total_credit_available + parseFloat(s.total_credit_available || 0),
      pending_amount: acc.pending_amount + parseFloat(s.pending_amount || 0),
      overdue_amount: acc.overdue_amount + parseFloat(s.overdue_amount || 0),
      clients_with_credit: acc.clients_with_credit + parseInt(s.clients_with_credit || 0)
    }), {
      total_credit_limit: 0,
      total_credit_used: 0,
      total_credit_available: 0,
      pending_amount: 0,
      overdue_amount: 0,
      clients_with_credit: 0
    });

    res.json({
      success: true,
      services: result.rows,
      totals
    });
  } catch (error) {
    console.error('Error getting service credits summary:', error);
    res.status(500).json({ error: 'Error obteniendo resumen de créditos' });
  }
};

// ============================================
// VERIFICAR CRÉDITO DISPONIBLE PARA UN SERVICIO
// (Usado antes de permitir una compra a crédito)
// ============================================

export const checkCreditAvailability = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { service, amount } = req.body;

    if (!service || !amount) {
      return res.status(400).json({ error: 'Se requiere servicio y monto' });
    }

    const creditRes = await pool.query(`
      SELECT 
        credit_limit,
        used_credit,
        (credit_limit - used_credit) as available_credit,
        is_blocked,
        credit_days
      FROM user_service_credits
      WHERE user_id = $1 AND service = $2
    `, [userId, service]);

    if (creditRes.rows.length === 0) {
      return res.json({
        success: true,
        canUseCredit: false,
        reason: 'No tienes línea de crédito para este servicio',
        available: 0
      });
    }

    const credit = creditRes.rows[0];

    if (credit.is_blocked) {
      return res.json({
        success: true,
        canUseCredit: false,
        reason: 'Tu línea de crédito está bloqueada para este servicio',
        available: 0
      });
    }

    // Verificar si hay pagos vencidos
    const overdueRes = await pool.query(`
      SELECT COUNT(*) as overdue_count
      FROM payment_invoices
      WHERE user_id = $1 AND service = $2 
        AND status IN ('pending', 'partial')
        AND due_date < CURRENT_DATE
    `, [userId, service]);

    if (parseInt(overdueRes.rows[0].overdue_count) > 0) {
      return res.json({
        success: true,
        canUseCredit: false,
        reason: 'Tienes pagos vencidos en este servicio. Liquídalos para usar crédito.',
        available: parseFloat(credit.available_credit)
      });
    }

    const available = parseFloat(credit.available_credit);
    const requested = parseFloat(amount);

    res.json({
      success: true,
      canUseCredit: available >= requested,
      reason: available >= requested 
        ? 'Crédito disponible' 
        : `Crédito insuficiente. Disponible: $${available.toFixed(2)}`,
      available,
      requested,
      creditDays: credit.credit_days
    });
  } catch (error) {
    console.error('Error checking credit availability:', error);
    res.status(500).json({ error: 'Error verificando crédito' });
  }
};

// ============================================
// USAR CRÉDITO (Crear factura a crédito)
// ============================================

export const useServiceCredit = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { service, amount, concept, reference_type, reference_id } = req.body;

    // Verificar disponibilidad
    const creditRes = await pool.query(`
      SELECT credit_limit, used_credit, credit_days, is_blocked
      FROM user_service_credits
      WHERE user_id = $1 AND service = $2
    `, [userId, service]);

    if (creditRes.rows.length === 0) {
      return res.status(400).json({ error: 'No tienes línea de crédito para este servicio' });
    }

    const credit = creditRes.rows[0];
    const available = parseFloat(credit.credit_limit) - parseFloat(credit.used_credit);

    if (credit.is_blocked) {
      return res.status(400).json({ error: 'Tu línea de crédito está bloqueada' });
    }

    if (available < parseFloat(amount)) {
      return res.status(400).json({ error: `Crédito insuficiente. Disponible: $${available.toFixed(2)}` });
    }

    // Calcular fecha de vencimiento
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + credit.credit_days);

    // Generar número de factura
    const countRes = await pool.query('SELECT COUNT(*) FROM payment_invoices WHERE service = $1', [service]);
    const servicePrefix = service.substring(0, 3).toUpperCase();
    const invoiceNumber = `CR-${servicePrefix}-${String(parseInt(countRes.rows[0].count) + 1).padStart(6, '0')}`;

    // Crear la factura a crédito
    const invoiceRes = await pool.query(`
      INSERT INTO payment_invoices (
        user_id, service, invoice_number, concept, amount, currency, 
        due_date, status, reference_type, reference_id, is_credit
      )
      VALUES ($1, $2, $3, $4, $5, 'MXN', $6, 'pending', $7, $8, TRUE)
      RETURNING *
    `, [userId, service, invoiceNumber, concept, amount, dueDate, reference_type, reference_id]);

    // Actualizar crédito usado
    await pool.query(`
      UPDATE user_service_credits 
      SET used_credit = used_credit + $1, updated_at = NOW()
      WHERE user_id = $2 AND service = $3
    `, [amount, userId, service]);

    res.json({
      success: true,
      message: 'Compra a crédito realizada',
      invoice: invoiceRes.rows[0],
      dueDate: dueDate.toISOString().split('T')[0],
      newUsedCredit: parseFloat(credit.used_credit) + parseFloat(amount),
      newAvailable: available - parseFloat(amount)
    });
  } catch (error) {
    console.error('Error using service credit:', error);
    res.status(500).json({ error: 'Error al usar crédito' });
  }
};

export default {
  getUserServiceCredits,
  updateServiceCredit,
  updateAllServiceCredits,
  getClientsWithServiceCredits,
  getServiceCreditsSummary,
  checkCreditAvailability,
  useServiceCredit
};
