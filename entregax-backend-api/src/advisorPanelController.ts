// ============================================
// ADVISOR PANEL CONTROLLER
// Endpoints exclusivos para el panel del asesor
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// ─── Helper: obtener userId del asesor desde JWT ───
function getAdvisorId(req: Request): number | null {
  return (req as any).user?.userId || (req as any).user?.id || null;
}

// ─── 1. DASHBOARD STATS ───
export const getAdvisorDashboard = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    // Obtener info del asesor
    const advisorRes = await pool.query(
      `SELECT id, full_name, email, referral_code, box_id, role, created_at 
       FROM users WHERE id = $1`, [advisorId]
    );
    if (advisorRes.rows.length === 0) return res.status(404).json({ error: 'Asesor no encontrado' });
    const advisor = advisorRes.rows[0];

    // Contar clientes (via advisor_id OR referred_by_id)
    const clientsRes = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_clients,
        COUNT(DISTINCT CASE WHEN u.created_at >= NOW() - INTERVAL '7 days' THEN u.id END) as new_clients_7d,
        COUNT(DISTINCT CASE WHEN u.created_at >= NOW() - INTERVAL '30 days' THEN u.id END) as new_clients_30d,
        COUNT(DISTINCT CASE WHEN u.identity_verified = true THEN u.id END) as verified_clients,
        COUNT(DISTINCT CASE WHEN u.verification_status = 'pending_review' THEN u.id END) as pending_verification
      FROM users u
      WHERE u.role = 'client'
        AND (u.advisor_id = $1 OR u.referred_by_id = $1)
    `, [advisorId]);
    const clientStats = clientsRes.rows[0];

    // Clientes activos (con paquetes en últimos 30 días)
    const activeRes = await pool.query(`
      SELECT COUNT(DISTINCT p.user_id) as active_clients
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE u.role = 'client'
        AND (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND p.created_at >= NOW() - INTERVAL '30 days'
    `, [advisorId]);

    // Clientes dormidos (sin paquetes en 30+ días)
    const dormantRes = await pool.query(`
      SELECT COUNT(*) as dormant_clients
      FROM users u
      WHERE u.role = 'client'
        AND (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND NOT EXISTS (
          SELECT 1 FROM packages p 
          WHERE p.user_id = u.id 
          AND p.created_at >= NOW() - INTERVAL '30 days'
        )
        AND u.created_at < NOW() - INTERVAL '7 days'
    `, [advisorId]);

    // Embarques en tránsito de sus clientes
    const shipmentsRes = await pool.query(`
      SELECT 
        COUNT(*) as total_in_transit,
        COUNT(CASE WHEN p.client_paid = false AND p.monto > 0 THEN 1 END) as awaiting_payment,
        COUNT(CASE WHEN p.delivery_instructions IS NULL OR p.delivery_instructions = '' THEN 1 END) as missing_instructions
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE u.role = 'client'
        AND (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND p.status IN ('in_transit', 'china_warehouse', 'usa_warehouse', 'mx_warehouse', 'ready_pickup')
    `, [advisorId]);

    // Comisiones del mes actual
    // Por ahora calculamos basado en paquetes pagados de sus clientes
    const commissionsRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN p.client_paid = true AND p.paid_at >= date_trunc('month', NOW()) THEN p.monto END), 0) as month_volume_mxn,
        COUNT(CASE WHEN p.client_paid = true AND p.paid_at >= date_trunc('month', NOW()) THEN 1 END) as month_paid_count
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE u.role = 'client'
        AND (u.advisor_id = $1 OR u.referred_by_id = $1)
    `, [advisorId]);

    // Registros mensuales (últimos 6 meses)
    const monthlyRes = await pool.query(`
      SELECT 
        to_char(u.created_at, 'YYYY-MM') as month,
        COUNT(*) as new_clients
      FROM users u
      WHERE u.role = 'client'
        AND (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND u.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY to_char(u.created_at, 'YYYY-MM')
      ORDER BY month
    `, [advisorId]);

    // Sub-asesores (si es asesor líder)
    const subAdvisorsRes = await pool.query(`
      SELECT COUNT(*) as sub_advisors
      FROM users WHERE team_leader_id = $1 AND role IN ('sub_advisor', 'asesor')
    `, [advisorId]);

    res.json({
      advisor: {
        id: advisor.id,
        fullName: advisor.full_name,
        email: advisor.email,
        referralCode: advisor.referral_code,
        boxId: advisor.box_id,
        role: advisor.role,
        joinedAt: advisor.created_at,
      },
      clients: {
        total: parseInt(clientStats.total_clients) || 0,
        new7d: parseInt(clientStats.new_clients_7d) || 0,
        new30d: parseInt(clientStats.new_clients_30d) || 0,
        verified: parseInt(clientStats.verified_clients) || 0,
        pendingVerification: parseInt(clientStats.pending_verification) || 0,
        active: parseInt(activeRes.rows[0]?.active_clients) || 0,
        dormant: parseInt(dormantRes.rows[0]?.dormant_clients) || 0,
      },
      shipments: {
        inTransit: parseInt(shipmentsRes.rows[0]?.total_in_transit) || 0,
        awaitingPayment: parseInt(shipmentsRes.rows[0]?.awaiting_payment) || 0,
        missingInstructions: parseInt(shipmentsRes.rows[0]?.missing_instructions) || 0,
      },
      commissions: {
        monthVolumeMxn: parseFloat(commissionsRes.rows[0]?.month_volume_mxn) || 0,
        monthPaidCount: parseInt(commissionsRes.rows[0]?.month_paid_count) || 0,
      },
      monthlyRegistrations: monthlyRes.rows,
      subAdvisors: parseInt(subAdvisorsRes.rows[0]?.sub_advisors) || 0,
    });
  } catch (error) {
    console.error('Error fetching advisor dashboard:', error);
    res.status(500).json({ error: 'Error al obtener dashboard del asesor' });
  }
};

// ─── 2. MIS CLIENTES ───
export const getAdvisorClients = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const { search, status, page = '1', limit = '50' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = `u.role = 'client' AND (u.advisor_id = $1 OR u.referred_by_id = $1)`;
    const params: any[] = [advisorId];
    let paramIdx = 2;

    if (search) {
      whereClause += ` AND (u.full_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx} OR u.box_id ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (status === 'verified') {
      whereClause += ` AND u.identity_verified = true`;
    } else if (status === 'pending') {
      whereClause += ` AND u.verification_status = 'pending_review'`;
    } else if (status === 'unverified') {
      whereClause += ` AND u.identity_verified = false AND u.verification_status != 'pending_review'`;
    }

    const clientsRes = await pool.query(`
      SELECT 
        u.id, u.full_name, u.email, u.phone, u.box_id, 
        u.identity_verified, u.verification_status,
        u.created_at, u.recovery_status,
        u.advisor_notes,
        -- Último paquete
        (SELECT MAX(p.created_at) FROM packages p WHERE p.user_id = u.id) as last_shipment_at,
        -- Total paquetes
        (SELECT COUNT(*) FROM packages p WHERE p.user_id = u.id) as total_packages,
        -- Paquetes en tránsito
        (SELECT COUNT(*) FROM packages p WHERE p.user_id = u.id AND p.status IN ('in_transit', 'china_warehouse', 'usa_warehouse')) as in_transit_count,
        -- Pendientes de pago
        (SELECT COUNT(*) FROM packages p WHERE p.user_id = u.id AND p.client_paid = false AND p.monto > 0) as pending_payment_count
      FROM users u
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, parseInt(limit), offset]);

    // Total count for pagination
    const countRes = await pool.query(
      `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`, params
    );

    // Classify each client's activity
    const clients = clientsRes.rows.map(c => {
      const daysSinceCreation = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceLastShipment = c.last_shipment_at 
        ? Math.floor((Date.now() - new Date(c.last_shipment_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      let activityStatus: 'new' | 'active' | 'dormant' = 'dormant';
      if (daysSinceCreation <= 7) activityStatus = 'new';
      else if (daysSinceLastShipment !== null && daysSinceLastShipment <= 30) activityStatus = 'active';

      return {
        id: c.id,
        fullName: c.full_name,
        email: c.email,
        phone: c.phone,
        boxId: c.box_id,
        identityVerified: c.identity_verified,
        verificationStatus: c.verification_status,
        createdAt: c.created_at,
        recoveryStatus: c.recovery_status,
        advisorNotes: c.advisor_notes,
        lastShipmentAt: c.last_shipment_at,
        totalPackages: parseInt(c.total_packages) || 0,
        inTransitCount: parseInt(c.in_transit_count) || 0,
        pendingPaymentCount: parseInt(c.pending_payment_count) || 0,
        activityStatus,
        daysSinceLastShipment,
      };
    });

    res.json({
      clients,
      total: parseInt(countRes.rows[0]?.total) || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Error fetching advisor clients:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
};

// ─── 2b. GUARDAR NOTA PRIVADA DEL ASESOR ───
export const saveAdvisorNote = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const { clientId } = req.params;
    const { note } = req.body;

    // Verificar que el cliente pertenece al asesor
    const check = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND (advisor_id = $2 OR referred_by_id = $2)`,
      [clientId, advisorId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: 'Cliente no pertenece a este asesor' });

    await pool.query(
      `UPDATE users SET advisor_notes = $1 WHERE id = $2`,
      [note, clientId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving advisor note:', error);
    res.status(500).json({ error: 'Error al guardar nota' });
  }
};

// ─── 3. EMBARQUES DE MIS CLIENTES ───
export const getAdvisorShipments = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const { filter, search, page = '1', limit = '50' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = `(u.advisor_id = $1 OR u.referred_by_id = $1) AND u.role = 'client'`;
    const params: any[] = [advisorId];
    let paramIdx = 2;

    // Filters
    if (filter === 'awaiting_payment') {
      whereClause += ` AND p.client_paid = false AND p.monto > 0`;
    } else if (filter === 'missing_instructions') {
      whereClause += ` AND (p.delivery_instructions IS NULL OR p.delivery_instructions = '')`;
    } else if (filter === 'in_transit') {
      whereClause += ` AND p.status IN ('in_transit', 'china_warehouse', 'usa_warehouse')`;
    } else if (filter === 'ready_pickup') {
      whereClause += ` AND p.status = 'ready_pickup'`;
    } else if (filter === 'delivered') {
      whereClause += ` AND p.status = 'delivered'`;
    }

    if (search) {
      whereClause += ` AND (p.tracking_internal ILIKE $${paramIdx} OR p.international_tracking ILIKE $${paramIdx} OR u.full_name ILIKE $${paramIdx} OR u.box_id ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const shipmentsRes = await pool.query(`
      SELECT 
        p.id, p.tracking_internal, p.international_tracking, p.child_no,
        p.status, p.service_type, p.monto, p.client_paid, p.paid_at,
        p.delivery_instructions, p.created_at,
        u.id as client_id, u.full_name as client_name, u.box_id as client_box_id, u.phone as client_phone
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, parseInt(limit), offset]);

    const countRes = await pool.query(`
      SELECT COUNT(*) as total
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE ${whereClause}
    `, params);

    // Summary stats
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN p.status IN ('in_transit', 'china_warehouse', 'usa_warehouse', 'mx_warehouse') THEN 1 END) as in_transit,
        COUNT(CASE WHEN p.client_paid = false AND p.monto > 0 THEN 1 END) as awaiting_payment,
        COUNT(CASE WHEN p.delivery_instructions IS NULL OR p.delivery_instructions = '' THEN 1 END) as missing_instructions,
        COUNT(CASE WHEN p.status = 'ready_pickup' THEN 1 END) as ready_pickup,
        COUNT(CASE WHEN p.status = 'delivered' THEN 1 END) as delivered
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND u.role = 'client'
    `, [advisorId]);

    res.json({
      shipments: shipmentsRes.rows.map(s => ({
        id: s.id,
        tracking: s.tracking_internal,
        internationalTracking: s.international_tracking,
        childNo: s.child_no,
        status: s.status,
        serviceType: s.service_type,
        amount: parseFloat(s.monto) || 0,
        clientPaid: s.client_paid,
        paidAt: s.paid_at,
        deliveryInstructions: s.delivery_instructions,
        createdAt: s.created_at,
        clientName: s.client_name,
        clientBoxId: s.client_box_id,
        clientPhone: s.client_phone,
      })),
      stats: {
        total: parseInt(statsRes.rows[0]?.total) || 0,
        inTransit: parseInt(statsRes.rows[0]?.in_transit) || 0,
        awaitingPayment: parseInt(statsRes.rows[0]?.awaiting_payment) || 0,
        missingInstructions: parseInt(statsRes.rows[0]?.missing_instructions) || 0,
        readyPickup: parseInt(statsRes.rows[0]?.ready_pickup) || 0,
        delivered: parseInt(statsRes.rows[0]?.delivered) || 0,
      },
      total: parseInt(countRes.rows[0]?.total) || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error('Error fetching advisor shipments:', error);
    res.status(500).json({ error: 'Error al obtener embarques' });
  }
};

// ─── 4. MIS COMISIONES ───
export const getAdvisorCommissions = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    // Obtener la tasa de comisión del asesor
    const rateRes = await pool.query(`
      SELECT percentage, leader_override, fixed_fee, is_gex
      FROM commission_rates 
      WHERE user_id = $1
    `, [advisorId]);
    const commissionRate = rateRes.rows[0] || { percentage: 0, leader_override: 0, fixed_fee: 0 };

    // Paquetes pagados de sus clientes (últimos 3 meses)
    const paidRes = await pool.query(`
      SELECT 
        to_char(p.paid_at, 'YYYY-MM') as month,
        COUNT(*) as paid_count,
        SUM(p.monto) as total_volume,
        SUM(p.monto * $2 / 100) as estimated_commission
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) 
        AND u.role = 'client'
        AND p.client_paid = true
        AND p.paid_at >= NOW() - INTERVAL '3 months'
        AND p.paid_at IS NOT NULL
      GROUP BY to_char(p.paid_at, 'YYYY-MM')
      ORDER BY month DESC
    `, [advisorId, parseFloat(commissionRate.percentage) || 0]);

    // Pendiente (en tránsito, pagado pero no entregado)
    const pendingRes = await pool.query(`
      SELECT 
        COUNT(*) as pending_count,
        COALESCE(SUM(p.monto), 0) as pending_volume,
        COALESCE(SUM(p.monto * $2 / 100), 0) as pending_commission
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND u.role = 'client'
        AND p.client_paid = true
        AND p.status NOT IN ('delivered', 'cancelled')
    `, [advisorId, parseFloat(commissionRate.percentage) || 0]);

    // Liberado (entregado)
    const releasedRes = await pool.query(`
      SELECT 
        COUNT(*) as released_count,
        COALESCE(SUM(p.monto), 0) as released_volume,
        COALESCE(SUM(p.monto * $2 / 100), 0) as released_commission
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND u.role = 'client'
        AND p.client_paid = true
        AND p.status = 'delivered'
        AND p.paid_at >= NOW() - INTERVAL '3 months'
    `, [advisorId, parseFloat(commissionRate.percentage) || 0]);

    // Tasa de conversión
    const conversionRes = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_referred,
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM packages p WHERE p.user_id = u.id
        ) THEN u.id END) as with_shipments
      FROM users u
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND u.role = 'client'
    `, [advisorId]);

    res.json({
      rate: {
        percentage: parseFloat(commissionRate.percentage) || 0,
        leaderOverride: parseFloat(commissionRate.leader_override) || 0,
        fixedFee: parseFloat(commissionRate.fixed_fee) || 0,
      },
      monthly: paidRes.rows.map(m => ({
        month: m.month,
        paidCount: parseInt(m.paid_count) || 0,
        totalVolume: parseFloat(m.total_volume) || 0,
        estimatedCommission: parseFloat(m.estimated_commission) || 0,
      })),
      pending: {
        count: parseInt(pendingRes.rows[0]?.pending_count) || 0,
        volume: parseFloat(pendingRes.rows[0]?.pending_volume) || 0,
        commission: parseFloat(pendingRes.rows[0]?.pending_commission) || 0,
      },
      released: {
        count: parseInt(releasedRes.rows[0]?.released_count) || 0,
        volume: parseFloat(releasedRes.rows[0]?.released_volume) || 0,
        commission: parseFloat(releasedRes.rows[0]?.released_commission) || 0,
      },
      conversion: {
        totalReferred: parseInt(conversionRes.rows[0]?.total_referred) || 0,
        withShipments: parseInt(conversionRes.rows[0]?.with_shipments) || 0,
        rate: conversionRes.rows[0]?.total_referred > 0
          ? ((parseInt(conversionRes.rows[0]?.with_shipments) / parseInt(conversionRes.rows[0]?.total_referred)) * 100).toFixed(1)
          : '0.0',
      },
    });
  } catch (error) {
    console.error('Error fetching advisor commissions:', error);
    res.status(500).json({ error: 'Error al obtener comisiones' });
  }
};
