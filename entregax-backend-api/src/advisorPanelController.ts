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
        COUNT(DISTINCT CASE WHEN u.is_verified = true THEN u.id END) as verified_clients,
        COUNT(DISTINCT CASE WHEN u.verification_status = 'unverified' THEN u.id END) as pending_verification
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
        COUNT(CASE WHEN COALESCE(p.saldo_pendiente, 0) > 0 THEN 1 END) as awaiting_payment,
        COUNT(CASE WHEN p.assigned_address_id IS NULL AND (p.destination_address IS NULL OR p.destination_address = 'Pendiente de asignar') THEN 1 END) as missing_instructions
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE u.role = 'client'
        AND (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND p.status IN ('in_transit', 'received_china', 'received', 'customs', 'ready_pickup')
    `, [advisorId]);

    // Comisiones del mes actual
    // Por ahora calculamos basado en paquetes pagados de sus clientes
    const commissionsRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN COALESCE(p.saldo_pendiente, 0) = 0 AND COALESCE(p.monto_pagado, 0) > 0 AND p.updated_at >= date_trunc('month', NOW()) THEN COALESCE(p.assigned_cost_mxn, 0) END), 0) as month_volume_mxn,
        COUNT(CASE WHEN COALESCE(p.saldo_pendiente, 0) = 0 AND COALESCE(p.monto_pagado, 0) > 0 AND p.updated_at >= date_trunc('month', NOW()) THEN 1 END) as month_paid_count
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
      whereClause += ` AND u.is_verified = true`;
    } else if (status === 'pending') {
      whereClause += ` AND u.verification_status = 'unverified' AND u.is_verified = false`;
    } else if (status === 'unverified') {
      whereClause += ` AND u.is_verified = false`;
    }

    const clientsRes = await pool.query(`
      SELECT 
        u.id, u.full_name, u.email, u.phone, u.box_id, 
        u.is_verified, u.verification_status,
        u.created_at, u.recovery_status,
        -- Último envío (de las 3 tablas)
        GREATEST(
          (SELECT MAX(p.created_at) FROM packages p WHERE p.user_id = u.id),
          (SELECT MAX(mo.created_at) FROM maritime_orders mo WHERE mo.user_id = u.id),
          (SELECT MAX(ds.created_at) FROM dhl_shipments ds WHERE ds.user_id = u.id)
        ) as last_shipment_at,
        -- Total embarques (packages + maritime_orders + dhl_shipments)
        (
          (SELECT COUNT(*) FROM packages p WHERE p.user_id = u.id) +
          (SELECT COUNT(*) FROM maritime_orders mo WHERE mo.user_id = u.id) +
          (SELECT COUNT(*) FROM dhl_shipments ds WHERE ds.user_id = u.id)
        ) as total_packages,
        -- En tránsito (las 3 tablas)
        (
          (SELECT COUNT(*) FROM packages p WHERE p.user_id = u.id AND p.status IN ('in_transit', 'received_china', 'received', 'customs')) +
          (SELECT COUNT(*) FROM maritime_orders mo WHERE mo.user_id = u.id AND mo.status IN ('in_transit', 'received_china', 'received', 'customs', 'consolidated', 'at_port')) +
          (SELECT COUNT(*) FROM dhl_shipments ds WHERE ds.user_id = u.id AND ds.status IN ('in_transit', 'received_mty', 'inspected', 'dispatched'))
        ) as in_transit_count,
        -- Pendientes de pago (count)
        (
          (SELECT COUNT(*) FROM packages p WHERE p.user_id = u.id AND COALESCE(p.saldo_pendiente, 0) > 0) +
          (SELECT COUNT(*) FROM maritime_orders mo WHERE mo.user_id = u.id AND COALESCE(mo.saldo_pendiente, 0) > 0) +
          (SELECT COUNT(*) FROM dhl_shipments ds WHERE ds.user_id = u.id AND COALESCE(ds.saldo_pendiente, 0) > 0)
        ) as pending_payment_count,
        -- Suma total pendiente de pago (MXN)
        (
          COALESCE((SELECT SUM(COALESCE(p.saldo_pendiente, 0)) FROM packages p WHERE p.user_id = u.id AND COALESCE(p.saldo_pendiente, 0) > 0), 0) +
          COALESCE((SELECT SUM(COALESCE(mo.saldo_pendiente, 0)) FROM maritime_orders mo WHERE mo.user_id = u.id AND COALESCE(mo.saldo_pendiente, 0) > 0), 0) +
          COALESCE((SELECT SUM(COALESCE(ds.saldo_pendiente, 0)) FROM dhl_shipments ds WHERE ds.user_id = u.id AND COALESCE(ds.saldo_pendiente, 0) > 0), 0)
        ) as pending_payment_total,
        -- Sin instrucciones (excluye entregados)
        (
          (SELECT COUNT(*) FROM packages p WHERE p.user_id = u.id AND p.master_id IS NULL AND p.status::text != 'delivered' AND p.assigned_address_id IS NULL AND (p.destination_address IS NULL OR p.destination_address = 'Pendiente de asignar')) +
          (SELECT COUNT(*) FROM maritime_orders mo WHERE mo.user_id = u.id AND mo.status != 'delivered' AND mo.delivery_address_id IS NULL) +
          (SELECT COUNT(*) FROM dhl_shipments ds WHERE ds.user_id = u.id AND ds.status != 'delivered' AND ds.delivery_address_id IS NULL)
        ) as missing_instructions_count
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
        identityVerified: c.is_verified,
        verificationStatus: c.verification_status,
        createdAt: c.created_at,
        recoveryStatus: c.recovery_status,
        advisorNotes: null,
        lastShipmentAt: c.last_shipment_at,
        totalPackages: parseInt(c.total_packages) || 0,
        inTransitCount: parseInt(c.in_transit_count) || 0,
        pendingPaymentCount: parseInt(c.pending_payment_count) || 0,
        pendingPaymentTotal: parseFloat(c.pending_payment_total) || 0,
        missingInstructionsCount: parseInt(c.missing_instructions_count) || 0,
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

    // advisor_notes column pending migration
    // await pool.query(`UPDATE users SET advisor_notes = $1 WHERE id = $2`, [note, clientId]);

    res.json({ success: true, message: 'Nota guardada (funcionalidad en desarrollo)' });
  } catch (error) {
    console.error('Error saving advisor note:', error);
    res.status(500).json({ error: 'Error al guardar nota' });
  }
};

// ─── 3. EMBARQUES DE MIS CLIENTES ───
// Combina packages (AIR_CHN_MX, POBOX_USA), maritime_orders (SEA_CHN_MX) y dhl_shipments (AA_DHL)
export const getAdvisorShipments = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const { filter, search, clientId, page = '1', limit = '50' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // ── Build dynamic WHERE parts (applied to each sub-query) ──
    const buildFilterSQL = (statusCol: string, saldoCol: string, _montoCol: string, missingInstrSQL: string, extraInTransit: string[] = []) => {
      const inTransitStatuses = ["'in_transit'", "'received_china'", "'received'", "'customs'", ...extraInTransit];
      if (filter === 'awaiting_payment') return ` AND COALESCE(${saldoCol}, 0) > 0`;
      if (filter === 'in_transit') return ` AND ${statusCol} IN (${inTransitStatuses.join(',')})`;
      if (filter === 'ready_pickup') return ` AND ${statusCol} = 'ready_pickup'`;
      if (filter === 'delivered') return ` AND ${statusCol} = 'delivered'`;
      if (filter === 'missing_instructions') return ` AND (${missingInstrSQL}) AND ${statusCol} != 'delivered'`;
      return '';
    };

    // ── UNION sub-queries ──
    // 1) packages (AIR_CHN_MX, POBOX_USA) — exclude children (master_id IS NOT NULL)
    const pkgSelect = `
      SELECT 
        'PKG-' || p.id::text as uid,
        p.id, p.tracking_internal as tracking, p.international_tracking, p.child_no,
        p.status::text as status, p.service_type,
        COALESCE(p.assigned_cost_mxn, p.saldo_pendiente, p.air_sale_price, p.pobox_venta_usd, 0) as monto,
        CASE WHEN COALESCE(p.saldo_pendiente, p.air_sale_price, p.pobox_venta_usd, 0) = 0 AND COALESCE(p.monto_pagado, 0) > 0 THEN true ELSE false END as client_paid,
        p.updated_at as paid_at,
        p.created_at,
        u.id as client_id, u.full_name as client_name, u.box_id as client_box_id, u.phone as client_phone,
        CASE WHEN p.assigned_address_id IS NOT NULL OR (p.destination_address IS NOT NULL AND p.destination_address != 'Pendiente de asignar') THEN true ELSE false END as has_instructions,
        COALESCE(p.is_master, false) as is_master,
        (SELECT COUNT(*) FROM packages c WHERE c.master_id = p.id)::int as children_count,
        COALESCE(p.has_gex, false) as has_gex,
        COALESCE(p.weight, 0) as weight,
        COALESCE(p.pkg_length, 0) as length_cm,
        COALESCE(p.pkg_width, 0) as width_cm,
        COALESCE(p.pkg_height, 0) as height_cm,
        p.description as description
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND u.role = 'client' AND p.master_id IS NULL
    `;

    // 2) maritime_orders (SEA_CHN_MX)
    const marSelect = `
      SELECT 
        'MAR-' || mo.id::text as uid,
        mo.id, mo.ordersn as tracking, mo.ship_number as international_tracking, mo.bl_number as child_no,
        mo.status, 'SEA_CHN_MX' as service_type,
        COALESCE(mo.assigned_cost_mxn, mo.saldo_pendiente, 0) as monto,
        CASE WHEN COALESCE(mo.saldo_pendiente, 0) = 0 AND COALESCE(mo.monto_pagado, 0) > 0 THEN true ELSE false END as client_paid,
        mo.paid_at as paid_at,
        mo.created_at,
        u.id as client_id, u.full_name as client_name, u.box_id as client_box_id, u.phone as client_phone,
        CASE WHEN mo.delivery_address_id IS NOT NULL THEN true ELSE false END as has_instructions,
        false as is_master,
        0 as children_count,
        COALESCE(mo.has_gex, false) as has_gex,
        COALESCE(mo.weight, 0) as weight,
        0 as length_cm,
        0 as width_cm,
        0 as height_cm,
        mo.goods_name as description
      FROM maritime_orders mo
      JOIN users u ON mo.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND u.role = 'client'
    `;

    // 3) dhl_shipments (AA_DHL)
    const dhlSelect = `
      SELECT 
        'DHL-' || ds.id::text as uid,
        ds.id, ds.inbound_tracking as tracking, ds.national_tracking as international_tracking, ds.box_id as child_no,
        ds.status, 'AA_DHL' as service_type,
        COALESCE(ds.total_cost_mxn, ds.saldo_pendiente, ds.import_cost_mxn, 0) as monto,
        CASE WHEN COALESCE(ds.saldo_pendiente, ds.import_cost_mxn, 0) = 0 AND COALESCE(ds.monto_pagado, 0) > 0 THEN true ELSE false END as client_paid,
        ds.paid_at as paid_at,
        ds.created_at,
        u.id as client_id, u.full_name as client_name, u.box_id as client_box_id, u.phone as client_phone,
        CASE WHEN ds.delivery_address_id IS NOT NULL THEN true ELSE false END as has_instructions,
        false as is_master,
        0 as children_count,
        COALESCE(ds.has_gex, false) as has_gex,
        COALESCE(ds.weight_kg, 0) as weight,
        COALESCE(ds.length_cm, 0) as length_cm,
        COALESCE(ds.width_cm, 0) as width_cm,
        COALESCE(ds.height_cm, 0) as height_cm,
        ds.description as description
      FROM dhl_shipments ds
      JOIN users u ON ds.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND u.role = 'client'
    `;

    // Dynamic filters per sub-query
    let pkgWhere = buildFilterSQL('p.status', 'p.saldo_pendiente', 'p.monto_pagado', "p.assigned_address_id IS NULL AND (p.destination_address IS NULL OR p.destination_address = 'Pendiente de asignar')");
    let marWhere = buildFilterSQL('mo.status', 'mo.saldo_pendiente', 'mo.monto_pagado', 'mo.delivery_address_id IS NULL');
    let dhlWhere = buildFilterSQL('ds.status', 'ds.saldo_pendiente', 'ds.monto_pagado', 'ds.delivery_address_id IS NULL', ["'received_mty'"]);

    // Client filter
    const params: any[] = [advisorId];
    let paramIdx = 2;

    if (clientId) {
      pkgWhere += ` AND p.user_id = $${paramIdx}`;
      marWhere += ` AND mo.user_id = $${paramIdx}`;
      dhlWhere += ` AND ds.user_id = $${paramIdx}`;
      params.push(parseInt(clientId));
      paramIdx++;
    }

    // Search filter
    if (search) {
      const searchParam = `$${paramIdx}`;
      pkgWhere += ` AND (p.tracking_internal ILIKE ${searchParam} OR p.international_tracking ILIKE ${searchParam} OR u.full_name ILIKE ${searchParam} OR u.box_id ILIKE ${searchParam})`;
      marWhere += ` AND (mo.ordersn ILIKE ${searchParam} OR mo.ship_number ILIKE ${searchParam} OR u.full_name ILIKE ${searchParam} OR u.box_id ILIKE ${searchParam})`;
      dhlWhere += ` AND (ds.inbound_tracking ILIKE ${searchParam} OR ds.national_tracking ILIKE ${searchParam} OR u.full_name ILIKE ${searchParam} OR u.box_id ILIKE ${searchParam})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    // Service type filter (optional)
    const { serviceType } = req.query as any;
    let unionParts: string[] = [];
    if (!serviceType || serviceType === 'all') {
      unionParts = [
        `${pkgSelect} ${pkgWhere}`,
        `${marSelect} ${marWhere}`,
        `${dhlSelect} ${dhlWhere}`,
      ];
    } else if (serviceType === 'SEA_CHN_MX') {
      unionParts = [`${marSelect} ${marWhere}`];
    } else if (serviceType === 'AA_DHL') {
      unionParts = [`${dhlSelect} ${dhlWhere}`];
    } else {
      // AIR_CHN_MX, POBOX_USA, etc.
      pkgWhere += ` AND p.service_type = $${paramIdx}`;
      params.push(serviceType);
      paramIdx++;
      unionParts = [`${pkgSelect} ${pkgWhere}`];
    }

    const unionQuery = unionParts.join(' UNION ALL ');

    // Main data query with pagination
    const dataSQL = `
      SELECT * FROM (${unionQuery}) combined
      ORDER BY created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    const shipmentsRes = await pool.query(dataSQL, [...params, parseInt(limit), offset]);

    // Count query
    const countSQL = `SELECT COUNT(*) as total FROM (${unionQuery}) combined`;
    const countRes = await pool.query(countSQL, params);

    // ── Summary stats (always across ALL types, no filter applied) ──
    const statsSQL = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status IN ('in_transit','received_china','received','customs','received_mty') THEN 1 END) as in_transit,
        COUNT(CASE WHEN COALESCE(monto, 0) > 0 AND client_paid = false THEN 1 END) as awaiting_payment,
        COUNT(CASE WHEN has_instructions = false AND status != 'delivered' THEN 1 END) as missing_instructions,
        COUNT(CASE WHEN status = 'ready_pickup' THEN 1 END) as ready_pickup,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered
      FROM (
        ${pkgSelect}
        UNION ALL
        ${marSelect}
        UNION ALL
        ${dhlSelect}
      ) all_shipments
    `;
    const statsRes = await pool.query(statsSQL, [advisorId]);

    res.json({
      shipments: shipmentsRes.rows.map(s => ({
        id: s.id,
        uid: s.uid,
        tracking: s.tracking,
        internationalTracking: s.international_tracking,
        childNo: s.child_no,
        status: s.status,
        serviceType: s.service_type,
        amount: parseFloat(s.monto) || 0,
        clientPaid: s.client_paid,
        paidAt: s.paid_at,
        hasInstructions: s.has_instructions,
        isMaster: s.is_master,
        childrenCount: parseInt(s.children_count) || 0,
        hasGex: s.has_gex,
        createdAt: s.created_at,
        clientId: s.client_id,
        clientName: s.client_name,
        clientBoxId: s.client_box_id,
        clientPhone: s.client_phone,
        weight: parseFloat(s.weight) || 0,
        lengthCm: parseFloat(s.length_cm) || 0,
        widthCm: parseFloat(s.width_cm) || 0,
        heightCm: parseFloat(s.height_cm) || 0,
        description: s.description || '',
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

    // ─── Tasas de comisión por tipo de servicio ───
    const ratesRes = await pool.query(`
      SELECT service_type, label, percentage, leader_override, fixed_fee, is_gex
      FROM commission_rates ORDER BY id
    `);

    // ─── Resumen por tipo de servicio (de advisor_commissions) ───
    const byServiceRes = await pool.query(`
      SELECT 
        ac.service_type,
        COUNT(*) as total_count,
        SUM(ac.payment_amount_mxn) as total_volume,
        SUM(ac.commission_amount_mxn) as total_commission,
        SUM(ac.leader_override_amount) as total_leader_override,
        SUM(ac.gex_commission_mxn) as total_gex,
        COUNT(*) FILTER (WHERE ac.status = 'pending') as pending_count,
        SUM(ac.commission_amount_mxn) FILTER (WHERE ac.status = 'pending') as pending_commission,
        COUNT(*) FILTER (WHERE ac.status = 'paid') as paid_count,
        SUM(ac.commission_amount_mxn) FILTER (WHERE ac.status = 'paid') as paid_commission
      FROM advisor_commissions ac
      WHERE ac.advisor_id = $1
      GROUP BY ac.service_type
    `, [advisorId]);

    // ─── Resumen mensual (últimos 6 meses) ───
    const monthlyRes = await pool.query(`
      SELECT 
        to_char(ac.created_at, 'YYYY-MM') as month,
        COUNT(*) as count,
        SUM(ac.payment_amount_mxn) as volume,
        SUM(ac.commission_amount_mxn) as commission,
        COUNT(*) FILTER (WHERE ac.status = 'pending') as pending_count,
        SUM(ac.commission_amount_mxn) FILTER (WHERE ac.status = 'pending') as pending_amount,
        COUNT(*) FILTER (WHERE ac.status = 'paid') as paid_count,
        SUM(ac.commission_amount_mxn) FILTER (WHERE ac.status = 'paid') as paid_amount
      FROM advisor_commissions ac
      WHERE ac.advisor_id = $1
        AND ac.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY to_char(ac.created_at, 'YYYY-MM')
      ORDER BY month DESC
    `, [advisorId]);

    // ─── Totales generales ───
    const totalsRes = await pool.query(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(commission_amount_mxn), 0) as total_commission,
        COALESCE(SUM(commission_amount_mxn) FILTER (WHERE status = 'pending'), 0) as pending_commission,
        COALESCE(SUM(commission_amount_mxn) FILTER (WHERE status = 'paid'), 0) as paid_commission,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count
      FROM advisor_commissions
      WHERE advisor_id = $1
    `, [advisorId]);

    // ─── Últimas 20 comisiones (detalle) ───
    const recentRes = await pool.query(`
      SELECT 
        ac.id, ac.shipment_type, ac.service_type, ac.tracking,
        ac.client_name, ac.payment_amount_mxn, ac.commission_rate_pct,
        ac.commission_amount_mxn, ac.gex_commission_mxn,
        ac.status, ac.paid_to_advisor_at, ac.created_at
      FROM advisor_commissions ac
      WHERE ac.advisor_id = $1
      ORDER BY ac.created_at DESC
      LIMIT 20
    `, [advisorId]);

    // ─── Tasa de conversión ───
    const conversionRes = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_referred,
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM packages p WHERE p.user_id = u.id
        ) THEN u.id END) as with_shipments
      FROM users u
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND u.role = 'client'
    `, [advisorId]);

    const totals = totalsRes.rows[0] || {};

    res.json({
      rates: ratesRes.rows.map(r => ({
        serviceType: r.service_type,
        label: r.label,
        percentage: parseFloat(r.percentage) || 0,
        leaderOverride: parseFloat(r.leader_override) || 0,
        fixedFee: parseFloat(r.fixed_fee) || 0,
        isGex: r.is_gex || false,
      })),
      byService: byServiceRes.rows.map(s => ({
        serviceType: s.service_type,
        totalCount: parseInt(s.total_count) || 0,
        totalVolume: parseFloat(s.total_volume) || 0,
        totalCommission: parseFloat(s.total_commission) || 0,
        totalLeaderOverride: parseFloat(s.total_leader_override) || 0,
        totalGex: parseFloat(s.total_gex) || 0,
        pendingCount: parseInt(s.pending_count) || 0,
        pendingCommission: parseFloat(s.pending_commission) || 0,
        paidCount: parseInt(s.paid_count) || 0,
        paidCommission: parseFloat(s.paid_commission) || 0,
      })),
      monthly: monthlyRes.rows.map(m => ({
        month: m.month,
        count: parseInt(m.count) || 0,
        volume: parseFloat(m.volume) || 0,
        commission: parseFloat(m.commission) || 0,
        pendingCount: parseInt(m.pending_count) || 0,
        pendingAmount: parseFloat(m.pending_amount) || 0,
        paidCount: parseInt(m.paid_count) || 0,
        paidAmount: parseFloat(m.paid_amount) || 0,
      })),
      totals: {
        totalCount: parseInt(totals.total_count) || 0,
        totalCommission: parseFloat(totals.total_commission) || 0,
        pendingCommission: parseFloat(totals.pending_commission) || 0,
        paidCommission: parseFloat(totals.paid_commission) || 0,
        pendingCount: parseInt(totals.pending_count) || 0,
        paidCount: parseInt(totals.paid_count) || 0,
      },
      recent: recentRes.rows.map(r => ({
        id: r.id,
        shipmentType: r.shipment_type,
        serviceType: r.service_type,
        tracking: r.tracking,
        clientName: r.client_name,
        paymentAmount: parseFloat(r.payment_amount_mxn) || 0,
        commissionRate: parseFloat(r.commission_rate_pct) || 0,
        commissionAmount: parseFloat(r.commission_amount_mxn) || 0,
        gexCommission: parseFloat(r.gex_commission_mxn) || 0,
        status: r.status,
        paidAt: r.paid_to_advisor_at,
        createdAt: r.created_at,
      })),
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

// ─── 5. OBTENER GUÍAS HIJAS DE UN REPACK ───
export const getRepackChildren = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const masterId = parseInt(req.params.id as string);
    if (!masterId) return res.status(400).json({ error: 'ID de repack inválido' });

    // Verify the master package belongs to one of the advisor's clients
    const verifyRes = await pool.query(`
      SELECT p.id FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1 AND p.is_master = true AND (u.advisor_id = $2 OR u.referred_by_id = $2) AND u.role = 'client'
    `, [masterId, advisorId]);

    if (verifyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Repack no encontrado' });
    }

    const childrenRes = await pool.query(`
      SELECT 
        p.id, p.tracking_internal as tracking, p.international_tracking,
        p.status::text as status, p.service_type,
        COALESCE(p.assigned_cost_mxn, p.saldo_pendiente, p.air_sale_price, p.pobox_venta_usd, 0) as monto,
        CASE WHEN COALESCE(p.saldo_pendiente, p.air_sale_price, p.pobox_venta_usd, 0) = 0 AND COALESCE(p.monto_pagado, 0) > 0 THEN true ELSE false END as client_paid,
        p.weight, p.description,
        p.created_at
      FROM packages p
      WHERE p.master_id = $1
      ORDER BY p.id ASC
    `, [masterId]);

    res.json({
      children: childrenRes.rows.map(c => ({
        id: c.id,
        tracking: c.tracking,
        internationalTracking: c.international_tracking,
        status: c.status,
        serviceType: c.service_type,
        amount: parseFloat(c.monto) || 0,
        clientPaid: c.client_paid,
        weight: c.weight ? parseFloat(c.weight) : null,
        description: c.description,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching repack children:', error);
    res.status(500).json({ error: 'Error al obtener guías del repack' });
  }
};

// ─── 6. VER CARTERA DEL CLIENTE (para asesor) ───
export const getClientWallet = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const { clientId } = req.params;

    // Verificar que el cliente pertenece al asesor
    const clientCheck = await pool.query(
      `SELECT id, full_name, email, box_id, 
              COALESCE(wallet_balance, 0) as wallet_balance, 
              COALESCE(has_credit, false) as has_credit, 
              COALESCE(credit_limit, 0) as credit_limit, 
              COALESCE(used_credit, 0) as used_credit 
       FROM users WHERE id = $1 AND (advisor_id = $2 OR referred_by_id = $2) AND role = 'client'`,
      [clientId, advisorId]
    );
    if (clientCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Cliente no pertenece a este asesor' });
    }
    const client = clientCheck.rows[0];

    // Obtener saldos por servicio - usar columnas que sabemos que existen
    // PO Box USA y Aéreo China - usar total_mxn si saldo_pendiente no existe
    let saldoPobox = 0;
    let saldoAereo = 0;
    try {
      const packagesStats = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN service_type = 'POBOX_USA' AND pagado = false THEN COALESCE(total_mxn, 0) ELSE 0 END), 0) as saldo_pobox,
          COALESCE(SUM(CASE WHEN service_type = 'AIR_CHN_MX' AND pagado = false THEN COALESCE(total_mxn, 0) ELSE 0 END), 0) as saldo_aereo
        FROM packages
        WHERE user_id = $1 AND (is_master = true OR master_id IS NULL)
      `, [clientId]);
      saldoPobox = parseFloat(packagesStats.rows[0]?.saldo_pobox) || 0;
      saldoAereo = parseFloat(packagesStats.rows[0]?.saldo_aereo) || 0;
    } catch (e) {
      console.log('Packages query fallback');
    }

    // Marítimo China
    let saldoMaritimo = 0;
    try {
      const maritimeStats = await pool.query(`
        SELECT COALESCE(SUM(CASE WHEN pagado = false THEN COALESCE(total_mxn, 0) ELSE 0 END), 0) as saldo_pendiente
        FROM maritime_orders WHERE user_id = $1
      `, [clientId]);
      saldoMaritimo = parseFloat(maritimeStats.rows[0]?.saldo_pendiente) || 0;
    } catch (e) {
      console.log('Maritime query fallback');
    }

    // DHL Nacional
    let saldoDhl = 0;
    try {
      const dhlStats = await pool.query(`
        SELECT COALESCE(SUM(CASE WHEN pagado = false THEN COALESCE(total_mxn, 0) ELSE 0 END), 0) as saldo_pendiente
        FROM dhl_shipments WHERE user_id = $1
      `, [clientId]);
      saldoDhl = parseFloat(dhlStats.rows[0]?.saldo_pendiente) || 0;
    } catch (e) {
      console.log('DHL query fallback');
    }

    // Contenedores FCL
    let saldoContenedores = 0;
    try {
      const containerStats = await pool.query(`
        SELECT COALESCE(SUM(CASE WHEN client_paid = false THEN COALESCE(monto, 0) ELSE 0 END), 0) as saldo_pendiente
        FROM container_shipments WHERE user_id = $1
      `, [clientId]);
      saldoContenedores = parseFloat(containerStats.rows[0]?.saldo_pendiente) || 0;
    } catch (e) {
      console.log('Containers query fallback');
    }

    // Cotizaciones pendientes de pago
    let cotizacionesCount = 0;
    let cotizacionesTotal = 0;
    try {
      const quotationsRes = await pool.query(`
        SELECT COUNT(*) as count, COALESCE(SUM(total_usd), 0) as total
        FROM quotations 
        WHERE user_id = $1 AND status = 'pending_payment'
      `, [clientId]);
      cotizacionesCount = parseInt(quotationsRes.rows[0]?.count) || 0;
      cotizacionesTotal = parseFloat(quotationsRes.rows[0]?.total) || 0;
    } catch (e) {
      console.log('Quotations query fallback');
    }
    
    const totalPendiente = saldoPobox + saldoAereo + saldoMaritimo + saldoDhl + saldoContenedores;

    res.json({
      cliente: {
        id: client.id,
        nombre: client.full_name,
        email: client.email,
        casillero: client.box_id,
      },
      cartera: {
        total_pendiente: totalPendiente,
        moneda: 'MXN',
        saldo_por_servicio: [
          { servicio: 'PO Box USA', monto: saldoPobox, moneda: 'MXN', icono: '📦' },
          { servicio: 'Aéreo China', monto: saldoAereo, moneda: 'MXN', icono: '✈️' },
          { servicio: 'Marítimo China', monto: saldoMaritimo, moneda: 'MXN', icono: '🚢' },
          { servicio: 'Liberación MTY', monto: saldoDhl, moneda: 'MXN', icono: '📮' },
          { servicio: 'Contenedores FCL', monto: saldoContenedores, moneda: 'MXN', icono: '🏗️' },
        ].filter(s => s.monto > 0),
        cotizaciones_pendientes: {
          count: cotizacionesCount,
          total: cotizacionesTotal,
        },
        saldo_favor: parseFloat(client.wallet_balance) || 0,
        credito_disponible: client.has_credit 
          ? (parseFloat(client.credit_limit) - parseFloat(client.used_credit)) 
          : 0,
      }
    });
  } catch (error) {
    console.error('Error fetching client wallet:', error);
    res.status(500).json({ error: 'Error al obtener cartera del cliente' });
  }
};

// ─── 7. VER EQUIPO (para asesor líder) ───
export const getAdvisorTeam = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    // Verificar que es un asesor líder
    const advisorCheck = await pool.query(
      `SELECT id, role, referral_code FROM users WHERE id = $1`,
      [advisorId]
    );
    
    if (advisorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const advisor = advisorCheck.rows[0];
    const isLeader = ['asesor_lider', 'admin', 'super_admin', 'director'].includes(advisor.role);
    
    if (!isLeader) {
      return res.status(403).json({ error: 'Solo asesores líderes pueden ver el equipo' });
    }

    // Buscar sub-asesores (los que fueron referidos por este asesor líder y son asesores)
    const teamRes = await pool.query(`
      SELECT 
        u.id,
        u.full_name as name,
        u.email,
        u.phone,
        u.referral_code,
        u.role,
        u.created_at,
        CASE WHEN u.is_verified = true THEN 'active' ELSE 'inactive' END as status,
        (SELECT COUNT(*) FROM users c WHERE (c.advisor_id = u.id OR c.referred_by_id = u.id) AND c.role = 'client') as total_clients,
        (SELECT COUNT(*) FROM users c WHERE (c.advisor_id = u.id OR c.referred_by_id = u.id) AND c.role = 'client' 
         AND c.created_at >= date_trunc('month', NOW())) as monthly_clients,
        COALESCE((
          SELECT SUM(COALESCE(p.monto_pagado, p.assigned_cost_mxn, 0))
          FROM packages p 
          JOIN users c ON p.user_id = c.id 
          WHERE (c.advisor_id = u.id OR c.referred_by_id = u.id) AND c.role = 'client'
            AND COALESCE(p.saldo_pendiente, 0) = 0 
            AND COALESCE(p.monto_pagado, 0) > 0
        ), 0) as total_revenue,
        COALESCE((
          SELECT SUM(COALESCE(p.monto_pagado, p.assigned_cost_mxn, 0))
          FROM packages p 
          JOIN users c ON p.user_id = c.id 
          WHERE (c.advisor_id = u.id OR c.referred_by_id = u.id) AND c.role = 'client'
            AND COALESCE(p.saldo_pendiente, 0) = 0 
            AND COALESCE(p.monto_pagado, 0) > 0
            AND p.updated_at >= date_trunc('month', NOW())
        ), 0) as monthly_revenue
      FROM users u
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND u.role IN ('advisor', 'asesor', 'sub_advisor')
      ORDER BY total_clients DESC, u.created_at DESC
    `, [advisorId]);

    // Calcular mi comisión del equipo (% de lo que generan mis sub-asesores)
    // Por defecto: 5% de las comisiones de los sub-asesores
    const teamCommission = teamRes.rows.reduce((sum, member) => {
      return sum + (parseFloat(member.total_revenue) * 0.05);
    }, 0);

    res.json({
      team: teamRes.rows.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        referral_code: m.referral_code,
        total_clients: parseInt(m.total_clients) || 0,
        monthly_clients: parseInt(m.monthly_clients) || 0,
        total_revenue: parseFloat(m.total_revenue) || 0,
        monthly_revenue: parseFloat(m.monthly_revenue) || 0,
        status: m.status,
        created_at: m.created_at,
      })),
      my_commission: teamCommission,
    });
  } catch (error) {
    console.error('Error fetching advisor team:', error);
    res.status(500).json({ error: 'Error al obtener equipo' });
  }
};

// ─── 8. TICKETS DE CLIENTES DEL ASESOR ───
export const getAdvisorClientTickets = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const { status, client_id } = req.query;

    let query = `
      SELECT 
        t.id,
        t.ticket_folio,
        t.category,
        t.subject,
        t.status,
        t.priority,
        t.sentiment,
        t.created_at,
        t.updated_at,
        t.resolved_at,
        u.id as client_id,
        u.full_name as client_name,
        u.email as client_email,
        u.box_id as client_box_id,
        (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count,
        (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT sender_type FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_sender
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
    `;
    const params: any[] = [advisorId];

    if (status && status !== 'all') {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    if (client_id) {
      params.push(client_id);
      query += ` AND t.user_id = $${params.length}`;
    }

    query += ` ORDER BY 
      CASE t.status 
        WHEN 'escalated_human' THEN 1 
        WHEN 'open_ai' THEN 2 
        WHEN 'waiting_client' THEN 3 
        ELSE 4 
      END,
      t.updated_at DESC
      LIMIT 100`;

    const result = await pool.query(query, params);

    // Stats
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'open_ai') as open_ai,
        COUNT(*) FILTER (WHERE t.status = 'escalated_human') as escalated,
        COUNT(*) FILTER (WHERE t.status = 'waiting_client') as waiting,
        COUNT(*) FILTER (WHERE t.status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE t.created_at >= NOW() - INTERVAL '7 days') as last_7_days
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
    `, [advisorId]);

    res.json({
      success: true,
      tickets: result.rows,
      stats: statsRes.rows[0],
    });
  } catch (error) {
    console.error('Error fetching advisor client tickets:', error);
    res.status(500).json({ error: 'Error al obtener tickets de clientes' });
  }
};

// ─── 9. DETALLE DE TICKET CON MENSAJES (para asesor) ───
export const getAdvisorTicketDetail = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    if (!advisorId) return res.status(401).json({ error: 'No autenticado' });

    const { ticketId } = req.params;

    // Verificar que el ticket pertenece a un cliente del asesor
    const ticketRes = await pool.query(`
      SELECT 
        t.*,
        u.full_name as client_name,
        u.email as client_email,
        u.box_id as client_box_id,
        u.phone as client_phone
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = $1 AND (u.advisor_id = $2 OR u.referred_by_id = $2)
    `, [ticketId, advisorId]);

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket no encontrado o no pertenece a tus clientes' });
    }

    const ticket = ticketRes.rows[0];

    // Obtener mensajes
    const messagesRes = await pool.query(`
      SELECT id, sender_type, message, attachment_url, attachments, created_at
      FROM ticket_messages
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `, [ticketId]);

    res.json({
      success: true,
      ticket,
      messages: messagesRes.rows,
    });
  } catch (error) {
    console.error('Error fetching ticket detail:', error);
    res.status(500).json({ error: 'Error al obtener detalle del ticket' });
  }
};

// ─── 9. NOTIFICACIONES DEL ASESOR (movimientos de sus clientes) ───
export const getAdvisorNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);
    const { limit = 50, offset = 0, unreadOnly } = req.query;

    // Obtener notificaciones propias del asesor
    let ownQuery = `
      SELECT id, title, message, type, icon, is_read, action_url, data, created_at,
             'own' as source
      FROM notifications
      WHERE user_id = $1
    `;
    if (unreadOnly === 'true') {
      ownQuery += ' AND is_read = false';
    }

    // Obtener actividad reciente de los clientes del asesor
    // 1. Paquetes recibidos/en tránsito/entregados de sus clientes
    const clientActivityQuery = `
      SELECT 
        'client_package' as source,
        p.id,
        CASE 
          WHEN p.status = 'received' THEN '📦 Paquete Recibido'
          WHEN p.status = 'received_china' THEN '📦 Recibido en China'
          WHEN p.status = 'processing' THEN '⚙️ En Proceso'
          WHEN p.status = 'reempacado' THEN '📋 Reempacado'
          WHEN p.status = 'in_transit' THEN '🚚 Paquete en Tránsito'
          WHEN p.status = 'delivered' THEN '✅ Paquete Entregado'
          WHEN p.status = 'customs' THEN '🛃 En Aduana'
          WHEN p.status = 'ready_pickup' THEN '📍 Listo para Recoger'
          ELSE '📦 Actualización de Paquete'
        END as title,
        CONCAT(u.full_name, ' - ', COALESCE(p.tracking_internal, 'Sin tracking'), ' (', p.status, ')') as message,
        'info' as type,
        'package-variant' as icon,
        false as is_read,
        NULL as action_url,
        json_build_object('client_id', u.id, 'package_id', p.id, 'tracking', p.tracking_internal) as data,
        COALESCE(p.updated_at, p.created_at) as created_at
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND COALESCE(p.updated_at, p.created_at) >= NOW() - INTERVAL '30 days'
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC
      LIMIT 30
    `;

    // 2. Pagos recientes de sus clientes
    const clientPaymentsQuery = `
      SELECT 
        'client_payment' as source,
        pay.id,
        '💰 Pago Registrado' as title,
        CONCAT(u.full_name, ' - $', ROUND(pay.amount::numeric, 2), ' ', COALESCE(pay.currency, 'MXN')) as message,
        'success' as type,
        'cash-check' as icon,
        false as is_read,
        NULL as action_url,
        json_build_object('client_id', u.id, 'payment_id', pay.id) as data,
        pay.created_at
      FROM payment_invoices pay
      JOIN users u ON pay.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND pay.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY pay.created_at DESC
      LIMIT 20
    `;

    // 3. Nuevos clientes registrados
    const newClientsQuery = `
      SELECT 
        'new_client' as source,
        u.id,
        '🎉 Nuevo Cliente Referido' as title,
        CONCAT(u.full_name, ' se registró con tu código') as message,
        'success' as type,
        'account-plus' as icon,
        false as is_read,
        NULL as action_url,
        json_build_object('client_id', u.id) as data,
        u.created_at
      FROM users u
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND u.role = 'client'
        AND u.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY u.created_at DESC
      LIMIT 10
    `;

    // 4. Tickets de soporte de sus clientes
    const clientTicketsQuery = `
      SELECT 
        'client_ticket' as source,
        t.id,
        CASE 
          WHEN t.status = 'escalated_human' THEN '🚨 Ticket Escalado'
          WHEN t.status = 'resolved' THEN '✅ Ticket Resuelto'
          ELSE '🎫 Ticket de Soporte'
        END as title,
        CONCAT(u.full_name, ' - ', COALESCE(t.subject, t.category::text)) as message,
        CASE WHEN t.status = 'escalated_human' THEN 'error' ELSE 'info' END as type,
        'headset' as icon,
        false as is_read,
        NULL as action_url,
        json_build_object('client_id', u.id, 'ticket_id', t.id) as data,
        COALESCE(t.updated_at, t.created_at) as created_at
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND COALESCE(t.updated_at, t.created_at) >= NOW() - INTERVAL '30 days'
      ORDER BY COALESCE(t.updated_at, t.created_at) DESC
      LIMIT 10
    `;

    // 5. Clientes pendientes de verificación (persistente - no expira)
    const pendingVerificationQuery = `
      SELECT 
        'pending_verification' as source,
        u.id,
        '⚠️ Cliente Pendiente de Verificación' as title,
        CONCAT(u.full_name, ' aún no ha completado su verificación') as message,
        'warning' as type,
        'alert-circle' as icon,
        false as is_read,
        NULL as action_url,
        json_build_object('client_id', u.id) as data,
        u.created_at
      FROM users u
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1)
        AND u.role = 'client'
        AND (u.verification_status = 'unverified' OR u.verification_status IS NULL)
        AND u.is_verified = false
      ORDER BY u.created_at DESC
    `;

    // 6. Verificación propia del asesor
    const ownVerificationQuery = `
      SELECT 
        'own_verification' as source,
        u.id,
        '🔴 Tu Verificación está Pendiente' as title,
        'Completa tu verificación de identidad para operar al 100%' as message,
        'error' as type,
        'alert-circle' as icon,
        false as is_read,
        NULL as action_url,
        json_build_object('action', 'verify_self') as data,
        u.created_at
      FROM users u
      WHERE u.id = $1
        AND (u.verification_status = 'unverified' OR u.verification_status IS NULL)
        AND u.is_verified = false
    `;

    const [ownRes, packagesRes, paymentsRes, clientsRes, ticketsRes, pendingVerifRes, ownVerifRes] = await Promise.all([
      pool.query(ownQuery, [advisorId]),
      pool.query(clientActivityQuery, [advisorId]),
      pool.query(clientPaymentsQuery, [advisorId]),
      pool.query(newClientsQuery, [advisorId]),
      pool.query(clientTicketsQuery, [advisorId]),
      pool.query(pendingVerificationQuery, [advisorId]),
      pool.query(ownVerificationQuery, [advisorId]),
    ]);

    // Combinar todas las notificaciones y ordenar por fecha
    const allNotifications = [
      ...ownVerifRes.rows,  // Prioridad: verificación propia arriba
      ...ownRes.rows.map(n => ({ ...n, source: 'own' })),
      ...packagesRes.rows,
      ...paymentsRes.rows,
      ...clientsRes.rows,
      ...ticketsRes.rows,
      ...pendingVerifRes.rows,
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(Number(offset), Number(offset) + Number(limit));

    // Contar no leídas propias
    const unreadCount = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [advisorId]
    );

    // Contar actividad reciente (últimos 7 días) de clientes
    const recentActivity = await pool.query(`
      SELECT COUNT(*) as count FROM (
        SELECT p.id FROM packages p 
        JOIN users u ON p.user_id = u.id
        WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND COALESCE(p.updated_at, p.created_at) >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT pay.id FROM payment_invoices pay
        JOIN users u ON pay.user_id = u.id
        WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND pay.created_at >= NOW() - INTERVAL '7 days'
      ) activity
    `, [advisorId]);

    const pendingVerifCount = pendingVerifRes.rows.length;
    const ownVerifPending = ownVerifRes.rows.length > 0 ? 1 : 0;
    const totalUnread = parseInt(unreadCount.rows[0].count) + parseInt(recentActivity.rows[0].count) + pendingVerifCount + ownVerifPending;

    res.json({
      success: true,
      notifications: allNotifications,
      unreadCount: totalUnread,
      ownUnread: parseInt(unreadCount.rows[0].count),
      clientActivity: parseInt(recentActivity.rows[0].count),
      pendingVerification: pendingVerifCount,
      ownVerificationPending: ownVerifPending > 0,
    });
  } catch (error) {
    console.error('Error fetching advisor notifications:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

// Obtener conteo de no leídas para el asesor
export const getAdvisorUnreadCount = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisorId = getAdvisorId(req);

    // Notificaciones propias no leídas
    const ownUnread = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [advisorId]
    );

    // Actividad reciente de clientes (últimos 3 días como "nuevas")
    const clientActivity = await pool.query(`
      SELECT COUNT(*) as count FROM (
        SELECT p.id FROM packages p 
        JOIN users u ON p.user_id = u.id
        WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND COALESCE(p.updated_at, p.created_at) >= NOW() - INTERVAL '3 days'
        UNION ALL
        Select pay.id FROM payment_invoices pay
        JOIN users u ON pay.user_id = u.id
        WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND pay.created_at >= NOW() - INTERVAL '3 days'
        UNION ALL
        SELECT u.id FROM users u
        WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) AND u.role = 'client' AND u.created_at >= NOW() - INTERVAL '3 days'
      ) activity
    `, [advisorId]);

    // Clientes pendientes de verificación (SIEMPRE se cuentan hasta que se verifiquen)
    const pendingVerification = await pool.query(`
      SELECT COUNT(*) as count FROM users u
      WHERE (u.advisor_id = $1 OR u.referred_by_id = $1) 
        AND u.role = 'client' 
        AND (u.verification_status = 'unverified' OR u.verification_status IS NULL)
        AND u.is_verified = false
    `, [advisorId]);

    // Verificación propia del asesor pendiente
    const ownVerification = await pool.query(`
      SELECT 1 FROM users WHERE id = $1 
        AND (verification_status = 'unverified' OR verification_status IS NULL)
        AND is_verified = false
    `, [advisorId]);

    const pendingCount = parseInt(pendingVerification.rows[0].count) || 0;
    const ownVerifPending = ownVerification.rows.length > 0 ? 1 : 0;
    const total = parseInt(ownUnread.rows[0].count) + parseInt(clientActivity.rows[0].count) + pendingCount + ownVerifPending;

    res.json({
      success: true,
      count: total,
      ownUnread: parseInt(ownUnread.rows[0].count),
      clientActivity: parseInt(clientActivity.rows[0].count),
      pendingVerification: pendingCount,
      ownVerificationPending: ownVerifPending > 0,
    });
  } catch (error) {
    console.error('Error fetching advisor unread count:', error);
    res.status(500).json({ success: false, count: 0 });
  }
};
