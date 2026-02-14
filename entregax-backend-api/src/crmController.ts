import { Request, Response } from 'express';
import { pool } from './db';

// ============================================================================
// FUNCIONES ORIGINALES (APP Y CRM BÁSICO)
// ============================================================================

// 📱 APP: MANEJAR SOLICITUD DEL CLIENTE
export const requestAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, advisorCodeInput } = req.body;

    // CASO A: SI ESCRIBIÓ CÓDIGO (Vinculación Inmediata)
    if (advisorCodeInput && advisorCodeInput.trim() !== '') {
      // 1. Buscar al asesor por código o box_id
      const advisorRes = await pool.query(
        `SELECT id, full_name FROM users 
         WHERE (referral_code = $1 OR box_id = $1) 
         AND role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')`,
        [advisorCodeInput.trim().toUpperCase()]
      );

      if (advisorRes.rows.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Código de Asesor no válido. Verifica el número e intenta de nuevo.' 
        });
      }

      const advisor = advisorRes.rows[0];

      // 2. Vincular al cliente con ese asesor
      await pool.query('UPDATE users SET referred_by_id = $1 WHERE id = $2', [advisor.id, userId]);

      return res.json({
        success: true,
        type: 'LINKED',
        advisorName: advisor.full_name,
        message: `¡Vinculado exitosamente con ${advisor.full_name}!`
      });
    }

    // CASO B: NO ESCRIBIÓ CÓDIGO (Solicitud al CRM)
    else {
      // 1. Verificar si ya tenía una solicitud pendiente para no duplicar
      const check = await pool.query(
        'SELECT id FROM crm_requests WHERE user_id = $1 AND status = $2',
        [userId, 'pending']
      );

      if (check.rows.length > 0) {
        return res.json({
          success: true,
          type: 'PENDING',
          message: 'Ya tienes una solicitud en proceso. Te contactaremos pronto.'
        });
      }

      // 2. Crear el Ticket en CRM
      await pool.query('INSERT INTO crm_requests (user_id) VALUES ($1)', [userId]);

      return res.json({
        success: true,
        type: 'REQUESTED',
        message: 'Solicitud enviada. Un asesor experto te contactará en un lapso de 24 a 48 horas.'
      });
    }
  } catch (error) {
    console.error('Error en requestAdvisor:', error);
    res.status(500).json({ success: false, error: 'Error al procesar solicitud' });
  }
};

// 🖥️ ADMIN: VER TODOS LOS LEADS (Para el CRM Web)
export const getCrmLeads = async (req: Request, res: Response): Promise<any> => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT 
        r.id as request_id,
        r.created_at,
        r.status,
        r.admin_notes,
        r.updated_at,
        u.id as user_id,
        u.full_name,
        u.email,
        u.box_id,
        u.phone,
        a.full_name as assigned_advisor_name
      FROM crm_requests r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN users a ON r.assigned_advisor_id = a.id
    `;
    
    const params: any[] = [];
    if (status && status !== 'all') {
      query += ' WHERE r.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY r.created_at DESC';

    const leads = await pool.query(query, params);
    
    // Contar por estado
    const statsRes = await pool.query(`
      SELECT status, COUNT(*) as count FROM crm_requests GROUP BY status
    `);
    const stats = {
      pending: 0,
      assigned: 0,
      contacted: 0,
      converted: 0
    };
    statsRes.rows.forEach((row: any) => {
      stats[row.status as keyof typeof stats] = parseInt(row.count);
    });

    res.json({ 
      success: true,
      leads: leads.rows,
      stats
    });
  } catch (error) {
    console.error('Error en getCrmLeads:', error);
    res.status(500).json({ success: false, error: 'Error al obtener leads' });
  }
};

// 🖥️ ADMIN: OBTENER LISTA DE ASESORES DISPONIBLES
export const getAvailableAdvisors = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisors = await pool.query(`
      SELECT id, full_name, email, referral_code, box_id
      FROM users 
      WHERE role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')
      ORDER BY full_name
    `);
    
    res.json({ success: true, advisors: advisors.rows });
  } catch (error) {
    console.error('Error en getAvailableAdvisors:', error);
    res.status(500).json({ success: false, error: 'Error al obtener asesores' });
  }
};

// 🖥️ ADMIN: ASIGNAR ASESOR MANUALMENTE
export const assignAdvisorManually = async (req: Request, res: Response): Promise<any> => {
  try {
    const { requestId, userId, advisorId, notes } = req.body;

    // 1. Actualizar usuario (Asignarle el asesor)
    await pool.query('UPDATE users SET referred_by_id = $1 WHERE id = $2', [advisorId, userId]);

    // 2. Actualizar el ticket del CRM
    await pool.query(
      `UPDATE crm_requests 
       SET status = 'assigned', 
           assigned_advisor_id = $1, 
           admin_notes = $2,
           updated_at = NOW() 
       WHERE id = $3`,
      [advisorId, notes || null, requestId]
    );

    // Obtener nombre del asesor
    const advisorRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [advisorId]);
    
    res.json({ 
      success: true,
      message: `Lead asignado a ${advisorRes.rows[0]?.full_name || 'asesor'}` 
    });
  } catch (error) {
    console.error('Error en assignAdvisorManually:', error);
    res.status(500).json({ success: false, error: 'Error al asignar' });
  }
};

// 🖥️ ADMIN: ACTUALIZAR ESTADO DEL LEAD
export const updateLeadStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const { requestId, status, notes } = req.body;

    await pool.query(
      `UPDATE crm_requests 
       SET status = $1, 
           admin_notes = COALESCE($2, admin_notes),
           updated_at = NOW() 
       WHERE id = $3`,
      [status, notes, requestId]
    );

    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error en updateLeadStatus:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar estado' });
  }
};

// 📱 APP: CREAR LEAD DESDE CHAT DE SOPORTE (Solicitud de llamada)
export const createLeadFromSupport = async (req: Request, res: Response): Promise<any> => {
  try {
    const { user_id, source, notes } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, error: 'user_id requerido' });
    }

    // Verificar si ya tiene una solicitud pendiente
    const existing = await pool.query(
      'SELECT id FROM crm_requests WHERE user_id = $1 AND status = $2',
      [user_id, 'pending']
    );

    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Ya tienes una solicitud pendiente',
        requestId: existing.rows[0].id
      });
    }

    // Crear nuevo lead
    const result = await pool.query(
      `INSERT INTO crm_requests (user_id, admin_notes) VALUES ($1, $2) RETURNING id`,
      [user_id, `[${source || 'app'}] ${notes || 'Solicitud de contacto'}`]
    );

    res.json({
      success: true,
      message: 'Solicitud creada exitosamente',
      requestId: result.rows[0].id
    });
  } catch (error) {
    console.error('Error en createLeadFromSupport:', error);
    res.status(500).json({ success: false, error: 'Error al crear solicitud' });
  }
};

// ============================================================================
// MÓDULO 1: CONTROL DE CLIENTES (Tablero Principal con Colores)
// ============================================================================

/**
 * Obtener clientes con métricas de actividad y colores
 * GET /api/admin/crm/clients
 */
export const getCRMClients = async (req: Request, res: Response): Promise<any> => {
  try {
    const { filter, advisorId, search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereConditions = ["u.role = 'client'"];
    const params: any[] = [];
    let paramIndex = 1;

    // Filtros por estado de actividad
    if (filter === 'inactive_90') {
      whereConditions.push(`u.last_transaction_date < NOW() - INTERVAL '90 days'`);
    } else if (filter === 'never_shipped') {
      whereConditions.push(`(SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0`);
    } else if (filter === 'new_no_ship') {
      whereConditions.push(`u.created_at > NOW() - INTERVAL '30 days'`);
      whereConditions.push(`(SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0`);
    } else if (filter === 'in_recovery') {
      whereConditions.push(`u.recovery_status = 'in_recovery'`);
    } else if (filter === 'churned') {
      whereConditions.push(`u.recovery_status = 'churned'`);
    } else if (filter === 'active') {
      whereConditions.push(`u.recovery_status = 'active'`);
      whereConditions.push(`u.last_transaction_date >= NOW() - INTERVAL '90 days'`);
    }

    // Filtro por asesor
    if (advisorId) {
      whereConditions.push(`u.referred_by_id = $${paramIndex}`);
      params.push(advisorId);
      paramIndex++;
    }

    // Búsqueda
    if (search) {
      whereConditions.push(`(u.full_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.box_id ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query principal con métricas calculadas
    const query = `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.box_id,
        u.created_at,
        u.is_verified,
        u.referred_by_id,
        u.first_transaction_date,
        u.last_transaction_date,
        u.last_transaction_ref,
        u.last_transaction_amount,
        u.recovery_status,
        u.recovery_deadline,
        advisor.full_name as advisor_name,
        leader.full_name as team_leader_name,
        (SELECT COUNT(*) FROM packages WHERE user_id = u.id) as total_shipments,
        (SELECT COALESCE(SUM(shipping_cost), 0) FROM packages WHERE user_id = u.id) as total_spent,
        CASE 
          WHEN u.last_transaction_date < NOW() - INTERVAL '90 days' THEN 'red'
          WHEN (SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0 THEN 'yellow'
          WHEN u.created_at > NOW() - INTERVAL '30 days' AND (SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0 THEN 'orange'
          ELSE 'white'
        END as row_color,
        EXTRACT(DAY FROM NOW() - u.last_transaction_date) as days_inactive
      FROM users u
      LEFT JOIN users advisor ON u.referred_by_id = advisor.id
      LEFT JOIN users leader ON advisor.team_leader_id = leader.id
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN u.recovery_status = 'in_recovery' THEN 1
          WHEN u.last_transaction_date < NOW() - INTERVAL '90 days' THEN 2
          ELSE 3
        END,
        u.last_transaction_date DESC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // Conteo total para paginación
    const countQuery = `SELECT COUNT(*) FROM users u ${whereClause}`;
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    // Estadísticas rápidas
    const statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE recovery_status = 'in_recovery') as in_recovery,
        COUNT(*) FILTER (WHERE recovery_status = 'churned') as churned,
        COUNT(*) FILTER (WHERE last_transaction_date < NOW() - INTERVAL '90 days') as inactive_90,
        COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM packages WHERE user_id = users.id) = 0) as never_shipped
      FROM users WHERE role = 'client'
    `;
    const statsResult = await pool.query(statsQuery);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      },
      stats: statsResult.rows[0]
    });
  } catch (error: any) {
    console.error('Error getCRMClients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Exportar clientes a Excel (JSON para frontend)
 * GET /api/admin/crm/clients/export
 */
export const exportCRMClients = async (req: Request, res: Response): Promise<any> => {
  try {
    const { filter, advisorId } = req.query;

    let whereConditions = ["u.role = 'client'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter === 'inactive_90') {
      whereConditions.push(`u.last_transaction_date < NOW() - INTERVAL '90 days'`);
    } else if (filter === 'in_recovery') {
      whereConditions.push(`u.recovery_status = 'in_recovery'`);
    }

    if (advisorId) {
      whereConditions.push(`u.referred_by_id = $${paramIndex}`);
      params.push(advisorId);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        u.full_name as "Nombre",
        u.box_id as "No. Cliente",
        u.email as "Email",
        u.phone as "Teléfono",
        TO_CHAR(u.created_at, 'DD/MM/YYYY') as "Fecha Alta",
        TO_CHAR(u.first_transaction_date, 'DD/MM/YYYY') as "Primera Transacción",
        TO_CHAR(u.last_transaction_date, 'DD/MM/YYYY') as "Última Transacción",
        u.last_transaction_ref as "Ref Última Transacción",
        u.last_transaction_amount as "Monto Última Transacción",
        (SELECT COUNT(*) FROM packages WHERE user_id = u.id) as "Total Envíos",
        (SELECT COALESCE(SUM(shipping_cost), 0) FROM packages WHERE user_id = u.id) as "Total Gastado MXN",
        advisor.full_name as "Asesor",
        u.recovery_status as "Estado Recuperación",
        EXTRACT(DAY FROM NOW() - u.last_transaction_date)::INTEGER as "Días Inactivo"
      FROM users u
      LEFT JOIN users advisor ON u.referred_by_id = advisor.id
      ${whereClause}
      ORDER BY u.last_transaction_date DESC NULLS LAST
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      filename: `clientes_crm_${new Date().toISOString().split('T')[0]}.xlsx`
    });
  } catch (error: any) {
    console.error('Error exportCRMClients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// MÓDULO 2: RECUPERACIÓN Y SOSTENIMIENTO
// ============================================================================

/**
 * Obtener promociones de recuperación activas
 * GET /api/admin/crm/promotions
 */
export const getRecoveryPromotions = async (_req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT * FROM recovery_promotions 
      ORDER BY is_active DESC, created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Crear/Editar promoción de recuperación
 * POST /api/admin/crm/promotions
 */
export const saveRecoveryPromotion = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id, title, description, discount_percent, is_active, valid_until } = req.body;

    if (id) {
      await pool.query(`
        UPDATE recovery_promotions 
        SET title = $1, description = $2, discount_percent = $3, is_active = $4, valid_until = $5
        WHERE id = $6
      `, [title, description, discount_percent, is_active, valid_until, id]);
    } else {
      await pool.query(`
        INSERT INTO recovery_promotions (title, description, discount_percent, is_active, valid_until)
        VALUES ($1, $2, $3, $4, $5)
      `, [title, description, discount_percent, is_active, valid_until]);
    }

    res.json({ success: true, message: 'Promoción guardada' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Ejecutar acción de recuperación en un cliente
 * POST /api/admin/crm/recovery/action
 */
export const executeRecoveryAction = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, action, notes, newAdvisorId, promotionId } = req.body;
    const adminId = (req as any).user?.id;

    // Validar que el cliente existe
    const clientResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    switch (action) {
      case 'recovered':
        // Verificar si hubo venta real en los últimos 30 días
        const recentSale = await pool.query(`
          SELECT id FROM packages 
          WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 1
        `, [userId]);

        if (recentSale.rows.length === 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'No se detecta venta reciente. El cliente debe tener al menos un envío en los últimos 30 días.' 
          });
        }

        await pool.query(`
          UPDATE users 
          SET recovery_status = 'active', recovery_deadline = NULL
          WHERE id = $1
        `, [userId]);
        break;

      case 'recovered_reassigned':
        // Reasignar a nuevo asesor y resetear
        await pool.query(`
          UPDATE users 
          SET recovery_status = 'active', 
              recovery_deadline = NULL,
              referred_by_id = $2
          WHERE id = $1
        `, [userId, newAdvisorId]);
        break;

      case 'prorroga':
        // Prórroga de 6 meses - Relación sana, no molestar
        await pool.query(`
          UPDATE users 
          SET recovery_status = 'active', 
              recovery_deadline = NOW() + INTERVAL '6 months'
          WHERE id = $1
        `, [userId]);
        break;

      case 'baja_definitiva':
        // Marcar como inactivo permanente
        await pool.query(`
          UPDATE users 
          SET recovery_status = 'churned', 
              is_active = FALSE
          WHERE id = $1
        `, [userId]);
        break;

      default:
        return res.status(400).json({ success: false, error: 'Acción no válida' });
    }

    // Registrar en historial
    await pool.query(`
      INSERT INTO recovery_history (user_id, advisor_id, action, notes, promotion_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, adminId, action, notes, promotionId || null]);

    res.json({ success: true, message: 'Acción ejecutada correctamente' });
  } catch (error: any) {
    console.error('Error executeRecoveryAction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Obtener historial de recuperación de un cliente
 * GET /api/admin/crm/recovery/history/:userId
 */
export const getRecoveryHistory = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT 
        rh.*,
        advisor.full_name as advisor_name,
        promo.title as promotion_title
      FROM recovery_history rh
      LEFT JOIN users advisor ON rh.advisor_id = advisor.id
      LEFT JOIN recovery_promotions promo ON rh.promotion_id = promo.id
      WHERE rh.user_id = $1
      ORDER BY rh.created_at DESC
    `, [userId]);

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Cron Job: Detectar clientes en riesgo (llamar diariamente)
 * POST /api/admin/crm/recovery/detect
 */
export const detectAtRiskClients = async (_req: Request, res: Response): Promise<any> => {
  try {
    // 1. Detectar 90 días (Alerta - entran a recuperación)
    const alertResult = await pool.query(`
      UPDATE users 
      SET recovery_status = 'in_recovery',
          recovery_deadline = NOW() + INTERVAL '15 days'
      WHERE role = 'client'
        AND recovery_status = 'active'
        AND last_transaction_date < NOW() - INTERVAL '90 days'
        AND last_transaction_date >= NOW() - INTERVAL '91 days'
      RETURNING id, full_name, referred_by_id
    `);

    // 2. Detectar 105 días (Castigo - quitar asesor)
    const punishResult = await pool.query(`
      UPDATE users 
      SET recovery_status = 'churned',
          referred_by_id = NULL
      WHERE role = 'client'
        AND recovery_status = 'in_recovery'
        AND recovery_deadline < NOW()
      RETURNING id, full_name
    `);

    res.json({
      success: true,
      message: 'Detección completada',
      data: {
        enteredRecovery: alertResult.rows.length,
        churned: punishResult.rows.length,
        alertedClients: alertResult.rows,
        churnedClients: punishResult.rows
      }
    });
  } catch (error: any) {
    console.error('Error detectAtRiskClients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// MÓDULO 3: PROSPECTOS (CRM Leads Mejorado)
// ============================================================================

/**
 * Obtener todos los prospectos
 * GET /api/admin/crm/prospects
 */
export const getProspects = async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, advisorId, channel, search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      whereConditions.push(`p.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (advisorId) {
      whereConditions.push(`p.assigned_advisor_id = $${paramIndex}`);
      params.push(advisorId);
      paramIndex++;
    }

    if (channel) {
      whereConditions.push(`p.acquisition_channel = $${paramIndex}`);
      params.push(channel);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(p.full_name ILIKE $${paramIndex} OR p.email ILIKE $${paramIndex} OR p.whatsapp ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.*,
        advisor.full_name as advisor_name,
        creator.full_name as created_by_name,
        CASE 
          WHEN p.follow_up_date::date = CURRENT_DATE THEN true 
          ELSE false 
        END as follow_up_today,
        CASE 
          WHEN p.follow_up_date < NOW() THEN true 
          ELSE false 
        END as follow_up_overdue
      FROM prospects p
      LEFT JOIN users advisor ON p.assigned_advisor_id = advisor.id
      LEFT JOIN users creator ON p.created_by_id = creator.id
      ${whereClause}
      ORDER BY 
        CASE WHEN p.follow_up_date::date = CURRENT_DATE THEN 0 ELSE 1 END,
        p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // Conteo
    const countQuery = `SELECT COUNT(*) FROM prospects p ${whereClause}`;
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    // Stats por estado
    const statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'contacting') as contacting_count,
        COUNT(*) FILTER (WHERE status = 'interested') as interested_count,
        COUNT(*) FILTER (WHERE status = 'converted') as converted_count,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_count,
        COUNT(*) FILTER (WHERE follow_up_date::date = CURRENT_DATE) as follow_up_today
      FROM prospects
    `;
    const statsResult = await pool.query(statsQuery);

    res.json({
      success: true,
      data: result.rows,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
      stats: statsResult.rows[0]
    });
  } catch (error: any) {
    console.error('Error getProspects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Crear nuevo prospecto
 * POST /api/admin/crm/prospects
 */
export const createProspect = async (req: Request, res: Response): Promise<any> => {
  try {
    const { full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, notes, follow_up_date } = req.body;
    const createdById = (req as any).user?.id;

    const result = await pool.query(`
      INSERT INTO prospects (full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, notes, follow_up_date, created_by_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, notes, follow_up_date, createdById]);

    res.json({ success: true, data: result.rows[0], message: 'Prospecto creado' });
  } catch (error: any) {
    console.error('Error createProspect:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Actualizar prospecto
 * PUT /api/admin/crm/prospects/:id
 */
export const updateProspect = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, status, notes, follow_up_date } = req.body;

    await pool.query(`
      UPDATE prospects 
      SET full_name = $1, whatsapp = $2, email = $3, acquisition_channel = $4, 
          assigned_advisor_id = $5, status = $6, notes = $7, follow_up_date = $8,
          updated_at = NOW()
      WHERE id = $9
    `, [full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, status, notes, follow_up_date, id]);

    res.json({ success: true, message: 'Prospecto actualizado' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Convertir prospecto a cliente
 * POST /api/admin/crm/prospects/:id/convert
 */
export const convertProspectToClient = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    // Obtener prospecto
    const prospectResult = await pool.query('SELECT * FROM prospects WHERE id = $1', [id]);
    if (prospectResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Prospecto no encontrado' });
    }

    const prospect = prospectResult.rows[0];

    // Verificar si el email ya existe
    if (prospect.email) {
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [prospect.email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Ya existe un cliente con este email' });
      }
    }

    // Generar box_id
    const boxPrefix = 'ETX';
    const boxSeq = await pool.query("SELECT COALESCE(MAX(CAST(SUBSTRING(box_id FROM 5) AS INTEGER)), 0) + 1 as next FROM users WHERE box_id LIKE 'ETX-%'");
    const boxId = `${boxPrefix}-${String(boxSeq.rows[0].next).padStart(4, '0')}`;

    // Crear usuario
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password || 'EntregaX2026!', 10);

    const newUser = await pool.query(`
      INSERT INTO users (full_name, email, phone, password, role, box_id, referred_by_id, is_verified)
      VALUES ($1, $2, $3, $4, 'client', $5, $6, false)
      RETURNING id, full_name, email, box_id
    `, [prospect.full_name, prospect.email, prospect.whatsapp, hashedPassword, boxId, prospect.assigned_advisor_id]);

    // Actualizar prospecto como convertido
    await pool.query(`
      UPDATE prospects 
      SET status = 'converted', converted_user_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [newUser.rows[0].id, id]);

    res.json({ 
      success: true, 
      message: 'Prospecto convertido a cliente exitosamente',
      data: newUser.rows[0]
    });
  } catch (error: any) {
    console.error('Error convertProspectToClient:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Eliminar prospecto
 * DELETE /api/admin/crm/prospects/:id
 */
export const deleteProspect = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM prospects WHERE id = $1', [id]);
    res.json({ success: true, message: 'Prospecto eliminado' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// MÓDULO 4: REPORTES HISTÓRICOS
// ============================================================================

/**
 * Reporte de ventas por jerarquía
 * GET /api/admin/crm/reports/sales
 */
export const getSalesReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const { startDate, endDate, teamLeaderId, advisorId, serviceType, status } = req.query;

    let whereConditions = ['p.created_at BETWEEN $1 AND $2'];
    const params: any[] = [startDate || '2020-01-01', endDate || new Date().toISOString()];
    let paramIndex = 3;

    if (teamLeaderId) {
      whereConditions.push(`leader.id = $${paramIndex}`);
      params.push(teamLeaderId);
      paramIndex++;
    }

    if (advisorId) {
      whereConditions.push(`advisor.id = $${paramIndex}`);
      params.push(advisorId);
      paramIndex++;
    }

    if (serviceType) {
      whereConditions.push(`p.service_type = $${paramIndex}`);
      params.push(serviceType);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`p.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const query = `
      SELECT 
        COALESCE(leader.full_name, 'Sin Líder') as team_leader,
        COALESCE(advisor.full_name, 'Sin Asesor') as advisor_name,
        p.service_type,
        p.status,
        COUNT(p.id) as total_shipments,
        SUM(p.weight) as total_weight,
        SUM(COALESCE(p.shipping_cost, 0)) as total_sales_mxn
      FROM packages p
      JOIN users client ON p.user_id = client.id
      LEFT JOIN users advisor ON client.referred_by_id = advisor.id
      LEFT JOIN users leader ON advisor.team_leader_id = leader.id
      ${whereClause}
      GROUP BY leader.full_name, advisor.full_name, p.service_type, p.status
      ORDER BY total_sales_mxn DESC
    `;

    const result = await pool.query(query, params);

    // Totales generales
    const totalsQuery = `
      SELECT 
        COUNT(DISTINCT p.id) as total_shipments,
        COUNT(DISTINCT p.user_id) as total_clients,
        SUM(COALESCE(p.shipping_cost, 0)) as total_revenue
      FROM packages p
      JOIN users client ON p.user_id = client.id
      LEFT JOIN users advisor ON client.referred_by_id = advisor.id
      LEFT JOIN users leader ON advisor.team_leader_id = leader.id
      ${whereClause}
    `;
    const totalsResult = await pool.query(totalsQuery, params);

    res.json({
      success: true,
      data: result.rows,
      totals: totalsResult.rows[0],
      filters: { startDate, endDate, teamLeaderId, advisorId, serviceType, status }
    });
  } catch (error: any) {
    console.error('Error getSalesReport:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Reporte de clientes perdidos (churn)
 * GET /api/admin/crm/reports/churn
 */
export const getChurnReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const { startDate, endDate } = req.query;

    let whereConditions = ["u.recovery_status = 'churned'", "u.role = 'client'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      whereConditions.push(`u.last_transaction_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      whereConditions.push(`u.last_transaction_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const query = `
      SELECT 
        COALESCE(advisor.full_name, 'Sin Asesor') as advisor_name,
        COUNT(DISTINCT u.id) as total_churned,
        ARRAY_AGG(DISTINCT u.full_name) as client_names
      FROM users u
      LEFT JOIN users advisor ON u.referred_by_id = advisor.id
      ${whereClause}
      GROUP BY advisor.full_name
      ORDER BY total_churned DESC
    `;

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Dashboard resumen CRM
 * GET /api/admin/crm/dashboard
 */
export const getCRMDashboard = async (_req: Request, res: Response): Promise<any> => {
  try {
    // Métricas de clientes
    const clientsStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE role = 'client') as total_clients,
        COUNT(*) FILTER (WHERE role = 'client' AND recovery_status = 'active') as active_clients,
        COUNT(*) FILTER (WHERE role = 'client' AND recovery_status = 'in_recovery') as in_recovery,
        COUNT(*) FILTER (WHERE role = 'client' AND recovery_status = 'churned') as churned,
        COUNT(*) FILTER (WHERE role = 'client' AND last_transaction_date < NOW() - INTERVAL '90 days') as inactive_90
      FROM users
    `);

    // Métricas de prospectos
    const prospectsStats = await pool.query(`
      SELECT 
        COUNT(*) as total_prospects,
        COUNT(*) FILTER (WHERE status = 'new') as new_prospects,
        COUNT(*) FILTER (WHERE status = 'contacting') as contacting,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COUNT(*) FILTER (WHERE follow_up_date::date = CURRENT_DATE) as follow_up_today
      FROM prospects
    `);

    // Ventas del mes
    const salesStats = await pool.query(`
      SELECT 
        COUNT(*) as shipments_month,
        COALESCE(SUM(shipping_cost), 0) as revenue_month
      FROM packages
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `);

    // Top asesores del mes
    const topAdvisors = await pool.query(`
      SELECT 
        advisor.full_name,
        COUNT(p.id) as shipments,
        SUM(COALESCE(p.shipping_cost, 0)) as revenue
      FROM packages p
      JOIN users client ON p.user_id = client.id
      JOIN users advisor ON client.referred_by_id = advisor.id
      WHERE p.created_at >= DATE_TRUNC('month', NOW())
      GROUP BY advisor.id, advisor.full_name
      ORDER BY revenue DESC
      LIMIT 5
    `);

    // Leads del CRM original
    const leadsStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
        COUNT(*) FILTER (WHERE status = 'converted') as converted
      FROM crm_requests
    `);

    res.json({
      success: true,
      data: {
        clients: clientsStats.rows[0],
        prospects: prospectsStats.rows[0],
        sales: salesStats.rows[0],
        topAdvisors: topAdvisors.rows,
        leads: leadsStats.rows[0]
      }
    });
  } catch (error: any) {
    console.error('Error getCRMDashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Obtener asesores para dropdowns (mejorado)
 * GET /api/admin/crm/advisors-list
 */
export const getAdvisorsForCRM = async (_req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, 
        u.full_name, 
        u.email, 
        u.role, 
        u.team_leader_id,
        leader.full_name as team_leader_name,
        (SELECT COUNT(*) FROM users WHERE referred_by_id = u.id) as total_clients
      FROM users u
      LEFT JOIN users leader ON u.team_leader_id = leader.id
      WHERE u.role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')
      ORDER BY u.full_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Obtener team leaders para dropdowns
 * GET /api/admin/crm/team-leaders
 */
export const getTeamLeaders = async (_req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT 
        u.id, 
        u.full_name
      FROM users u
      WHERE u.role = 'asesor_lider' OR EXISTS (SELECT 1 FROM users WHERE team_leader_id = u.id)
      ORDER BY u.full_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Actualizar métricas de transacción de un cliente (helper para otros módulos)
 */
export const updateClientTransactionMetrics = async (userId: number, transactionRef: string, amount: number) => {
  try {
    await pool.query(`
      UPDATE users 
      SET 
        first_transaction_date = CASE WHEN first_transaction_date IS NULL THEN NOW() ELSE first_transaction_date END,
        last_transaction_date = NOW(),
        last_transaction_ref = $2,
        last_transaction_amount = $3,
        recovery_status = 'active',
        recovery_deadline = NULL
      WHERE id = $1
    `, [userId, transactionRef, amount]);

    return { success: true };
  } catch (error: any) {
    console.error('Error updateClientTransactionMetrics:', error);
    return { success: false, error: error.message };
  }
};