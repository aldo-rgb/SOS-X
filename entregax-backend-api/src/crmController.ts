import { Request, Response } from 'express';
import { pool } from './db';
import bcrypt from 'bcrypt';
import { generateBoxId } from './authController';

// ============================================================================
// FUNCIONES ORIGINALES (APP Y CRM BÁSICO)
// ============================================================================

// 📱 APP: MANEJAR SOLICITUD DEL CLIENTE
export const requestAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    // Obtener userId del token JWT (el token usa 'userId' no 'id')
    const userId = (req as any).user?.userId || (req as any).user?.id || req.body.userId;
    const { advisorCodeInput } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
    }

    // CASO A: SI ESCRIBIÓ CÓDIGO (Vinculación Inmediata)
    if (advisorCodeInput && advisorCodeInput.trim() !== '') {
      const codeUpper = advisorCodeInput.trim().toUpperCase();
      // Normalizar código: agregar guión si no lo tiene (CHRI3225 -> CHRI-3225)
      const normalizedCode = codeUpper.includes('-') 
        ? codeUpper 
        : codeUpper.length >= 5 
          ? `${codeUpper.slice(0, 4)}-${codeUpper.slice(4)}`
          : codeUpper;
      
      console.log('🔍 Buscando asesor:', codeUpper, 'normalizado:', normalizedCode);
      
      // 1. Buscar al asesor por código o box_id (buscar ambos formatos)
      const advisorRes = await pool.query(
        `SELECT id, full_name FROM users 
         WHERE (referral_code = $1 OR referral_code = $2 OR box_id = $1 OR box_id = $2) 
         AND role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')`,
        [codeUpper, normalizedCode]
      );

      if (advisorRes.rows.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Código de Asesor no válido. Verifica el número e intenta de nuevo.' 
        });
      }

      const advisor = advisorRes.rows[0];

      // 2. Vincular al cliente con ese asesor (usar advisor_id en lugar de referred_by_id)
      await pool.query('UPDATE users SET advisor_id = $1 WHERE id = $2', [advisor.id, userId]);
      console.log('✅ Asesor', advisor.full_name, 'asignado a usuario', userId);

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

// � APP: BUSCAR ASESOR POR CÓDIGO (Pre-validación antes de vincular)
export const lookupAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    const { code } = req.params;
    const codeStr = Array.isArray(code) ? code[0] : code as string;
    if (!codeStr || !codeStr.trim()) {
      return res.status(400).json({ success: false, error: 'Código requerido' });
    }

    const codeUpper = codeStr.trim().toUpperCase();
    // Normalizar: JUAN047 -> JUAN-047, CHRI3225 -> CHRI-3225
    const normalizedCode = codeUpper.includes('-') 
      ? codeUpper 
      : codeUpper.length >= 5 
        ? `${codeUpper.slice(0, 4)}-${codeUpper.slice(4)}`
        : codeUpper;

    const advisorRes = await pool.query(
      `SELECT id, full_name, role FROM users 
       WHERE (referral_code = $1 OR referral_code = $2 OR box_id = $1 OR box_id = $2) 
       AND role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')`,
      [codeUpper, normalizedCode]
    );

    if (advisorRes.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Código de Asesor no válido. Verifica el número e intenta de nuevo.' 
      });
    }

    const advisor = advisorRes.rows[0];
    return res.json({
      success: true,
      advisor: {
        id: advisor.id,
        name: advisor.full_name,
        role: advisor.role,
      }
    });
  } catch (error) {
    console.error('Error en lookupAdvisor:', error);
    res.status(500).json({ success: false, error: 'Error al buscar asesor' });
  }
};

// �🖥️ ADMIN: VER TODOS LOS LEADS (Para el CRM Web)
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

    // Filtro por asesor (acepta cualquiera de los dos campos historicos)
    if (advisorId) {
      whereConditions.push(`(u.advisor_id = $${paramIndex} OR u.referred_by_id = $${paramIndex})`);
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
        u.is_active,
        u.referred_by_id,
        COALESCE(u.advisor_id, u.referred_by_id) as advisor_id,
        u.first_transaction_date,
        COALESCE(u.last_transaction_date, (SELECT MAX(p.created_at) FROM packages p WHERE p.user_id = u.id)) as last_transaction_date,
        u.last_transaction_ref,
        u.last_transaction_amount,
        u.recovery_status,
        u.recovery_deadline,
        advisor.full_name as advisor_name,
        advisor.box_id as advisor_box_id,
        leader.full_name as team_leader_name,
        (SELECT COUNT(*) FROM packages WHERE user_id = u.id) as total_shipments,
        (SELECT COALESCE(SUM(assigned_cost_mxn), 0) FROM packages WHERE user_id = u.id) as total_spent,
        CASE
          WHEN COALESCE(u.last_transaction_date, (SELECT MAX(p.created_at) FROM packages p WHERE p.user_id = u.id)) < NOW() - INTERVAL '90 days' THEN 'red'
          WHEN (SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0 THEN 'yellow'
          WHEN u.created_at > NOW() - INTERVAL '30 days' AND (SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0 THEN 'orange'
          ELSE 'white'
        END as row_color,
        EXTRACT(DAY FROM NOW() - COALESCE(u.last_transaction_date, (SELECT MAX(p.created_at) FROM packages p WHERE p.user_id = u.id))) as days_inactive
      FROM users u
      LEFT JOIN users advisor ON COALESCE(u.advisor_id, u.referred_by_id) = advisor.id
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
      whereConditions.push(`(u.advisor_id = $${paramIndex} OR u.referred_by_id = $${paramIndex})`);
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
        (SELECT COALESCE(SUM(assigned_cost_mxn), 0) FROM packages WHERE user_id = u.id) as "Total Gastado MXN",
        advisor.full_name as "Asesor",
        u.recovery_status as "Estado Recuperación",
        EXTRACT(DAY FROM NOW() - u.last_transaction_date)::INTEGER as "Días Inactivo"
      FROM users u
      LEFT JOIN users advisor ON COALESCE(u.advisor_id, u.referred_by_id) = advisor.id
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

    const boxId = await generateBoxId();

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

    // Filtros a nivel PAQUETE (fecha siempre; servicio/estatus opcionales).
    const params: any[] = [startDate || '2020-01-01', endDate || new Date().toISOString()];
    let i = 3;
    // Solo guías master/individuales (master_id IS NULL): las hijas de una
    // consolidación duplican el ingreso (el master ya suma el total).
    const pkgConds = ['p.created_at BETWEEN $1 AND $2', 'p.master_id IS NULL'];
    if (serviceType) { pkgConds.push(`p.service_type = $${i++}`); params.push(serviceType); }
    if (status) { pkgConds.push(`p.status = $${i++}`); params.push(status); }
    const pkgWhere = `WHERE ${pkgConds.join(' AND ')}`;

    // Filtros a nivel ASESOR (team leader / asesor específico).
    const advConds = [`a.role IN ('advisor','sub_advisor')`];
    if (teamLeaderId) { advConds.push(`a.team_leader_id = $${i++}`); params.push(teamLeaderId); }
    if (advisorId) { advConds.push(`a.id = $${i++}`); params.push(advisorId); }
    const advWhere = `WHERE ${advConds.join(' AND ')}`;
    const noAdvFilter = !teamLeaderId && !advisorId;

    // Venta por paquete: el costo asignado si existe, si no el precio de venta
    // PO Box. (assigned_cost_mxn solo está en una fracción de los paquetes.)
    const REVENUE_EXPR = `COALESCE(NULLIF(p.assigned_cost_mxn, 0), p.pobox_service_cost, 0)`;

    // CTE de paquetes atribuidos al asesor (por advisor_id y, si no, referred_by_id).
    const pkgCte = `
      WITH pkg AS (
        SELECT COALESCE(client.advisor_id, client.referred_by_id) AS advisor_id,
               p.service_type, p.status, p.consolidation_id,
               ${REVENUE_EXPR}::numeric AS revenue
        FROM packages p
        JOIN users client ON p.user_id = client.id
        ${pkgWhere}
      )`;

    // Una fila por asesor (TODOS los asesores). LEFT JOIN a pkg → 0 si no vendió.
    // COUNT(pkg.advisor_id) ignora la fila nula del LEFT JOIN → 0 correcto.
    const query = `
      ${pkgCte}
      SELECT
        a.id AS advisor_id, a.full_name AS advisor_name,
        a.team_leader_id, leader.full_name AS team_leader_name,
        COUNT(pkg.advisor_id)::int AS total_shipments,
        COALESCE(SUM(pkg.revenue), 0)::numeric AS total_revenue,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.service_type IN ('AIR_CHN_MX','china_air','aereo'))::int AS air_shipments,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.service_type IN ('china_sea','SEA_CHN_MX','maritime','fcl'))::int AS sea_shipments,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.service_type = 'POBOX_USA')::int AS pobox_shipments,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.consolidation_id IS NOT NULL)::int AS consolidation_shipments,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.status = 'delivered')::int AS completed_shipments,
        (SELECT COUNT(*)::int FROM warranties w WHERE w.advisor_id = a.id AND w.created_at BETWEEN $1 AND $2) AS gex_shipments,
        (SELECT COUNT(*)::int FROM entangled_payment_requests epr WHERE epr.advisor_id = a.id AND epr.created_at BETWEEN $1 AND $2 AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')) AS xpay_count,
        (SELECT COALESCE(SUM(usc.used_credit), 0)::numeric FROM user_service_credits usc JOIN users c ON c.id = usc.user_id WHERE COALESCE(c.advisor_id, c.referred_by_id) = a.id) AS credit_outstanding,
        COALESCE(COALESCE(SUM(pkg.revenue), 0) / NULLIF(COUNT(pkg.advisor_id), 0), 0)::numeric AS avg_revenue_per_shipment
      FROM users a
      LEFT JOIN users leader ON a.team_leader_id = leader.id
      LEFT JOIN pkg ON pkg.advisor_id = a.id
      ${advWhere}
      GROUP BY a.id, a.full_name, a.team_leader_id, leader.full_name
      ORDER BY total_shipments DESC, total_revenue DESC
    `;
    const result = await pool.query(query, params);
    const data: any[] = result.rows;

    // Fila "Sin Asesor" (paquetes sin asesor atribuido). Solo cuando no se filtra
    // por asesor/team leader.
    if (noAdvFilter) {
      const sa = await pool.query(`
        ${pkgCte}
        SELECT
          COUNT(*)::int AS total_shipments,
          COALESCE(SUM(revenue), 0)::numeric AS total_revenue,
          COUNT(*) FILTER (WHERE service_type IN ('AIR_CHN_MX','china_air','aereo'))::int AS air_shipments,
          COUNT(*) FILTER (WHERE service_type IN ('china_sea','SEA_CHN_MX','maritime','fcl'))::int AS sea_shipments,
          COUNT(*) FILTER (WHERE service_type = 'POBOX_USA')::int AS pobox_shipments,
          COUNT(*) FILTER (WHERE consolidation_id IS NOT NULL)::int AS consolidation_shipments,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS completed_shipments,
          (SELECT COUNT(*)::int FROM warranties w WHERE w.advisor_id IS NULL AND w.created_at BETWEEN $1 AND $2) AS gex_shipments,
          (SELECT COUNT(*)::int FROM entangled_payment_requests epr WHERE epr.advisor_id IS NULL AND epr.created_at BETWEEN $1 AND $2 AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')) AS xpay_count,
          (SELECT COALESCE(SUM(usc.used_credit), 0)::numeric FROM user_service_credits usc JOIN users c ON c.id = usc.user_id WHERE COALESCE(c.advisor_id, c.referred_by_id) IS NULL) AS credit_outstanding,
          COALESCE(SUM(revenue), 0) / NULLIF(COUNT(*), 0) AS avg_revenue_per_shipment
        FROM pkg WHERE advisor_id IS NULL
      `, params);
      const row = sa.rows[0];
      if (row && Number(row.total_shipments) > 0) {
        data.push({ advisor_id: null, advisor_name: 'Sin Asesor', team_leader_id: null, team_leader_name: null, ...row });
      }
    }

    // Totales (calculados en JS para respetar todos los filtros).
    const shipments = data.reduce((s, r) => s + Number(r.total_shipments || 0), 0);
    const revenue = data.reduce((s, r) => s + parseFloat(r.total_revenue || '0'), 0);
    const advisors = result.rows.filter((r: any) => Number(r.total_shipments) > 0).length;

    // Desglose por servicio (acotado a los asesores filtrados si aplica).
    const svcWhere = noAdvFilter ? '' : `WHERE pkg.advisor_id IN (SELECT a.id FROM users a ${advWhere})`;
    const serviceResult = await pool.query(`
      ${pkgCte}
      SELECT pkg.service_type, COUNT(*)::int AS count, COALESCE(SUM(pkg.revenue), 0)::numeric AS revenue
      FROM pkg
      ${svcWhere}
      GROUP BY pkg.service_type
      ORDER BY count DESC
    `, params);

    res.json({
      success: true,
      data,
      totals: { shipments, revenue: revenue.toFixed(2), advisors },
      serviceStats: serviceResult.rows,
      filters: { startDate, endDate, teamLeaderId, advisorId, serviceType, status }
    });
  } catch (error: any) {
    console.error('Error getSalesReport:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Detalle de ventas de UN asesor, desglosado por servicio (para el modal al dar
 * click en un asesor del reporte). Muestra envíos, completados, ingreso (venta),
 * costo proveedor y margen (ingreso económico a la empresa) por servicio.
 * GET /api/admin/crm/reports/sales/advisor/:advisorId
 */
export const getSalesReportByAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    const { advisorId } = req.params;
    const { startDate, endDate } = req.query;
    const isSinAsesor = advisorId === 'null' || advisorId === 'sin-asesor';

    const params: any[] = [startDate || '2020-01-01', endDate || new Date().toISOString()];
    let advFilter = `COALESCE(client.advisor_id, client.referred_by_id) IS NULL`;
    if (!isSinAsesor) {
      params.push(Number(advisorId));
      advFilter = `COALESCE(client.advisor_id, client.referred_by_id) = $3`;
    }

    const REVENUE_EXPR = `COALESCE(NULLIF(p.assigned_cost_mxn, 0), p.pobox_service_cost, 0)`;
    const COST_EXPR = `COALESCE(p.pobox_provider_cost_mxn, 0)`;

    const q = `
      WITH pkg AS (
        SELECT p.service_type, p.status,
               ${REVENUE_EXPR}::numeric AS revenue,
               ${COST_EXPR}::numeric AS provider_cost,
               COALESCE((SELECT ac.commission_amount_mxn FROM advisor_commissions ac
                          WHERE ac.shipment_type = 'PKG' AND ac.shipment_id = p.id
                          ORDER BY ac.id DESC LIMIT 1), 0)::numeric AS commission
        FROM packages p
        JOIN users client ON p.user_id = client.id
        WHERE p.created_at BETWEEN $1 AND $2 AND ${advFilter}
          AND p.master_id IS NULL
      )
      SELECT
        service_type,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS completed,
        COALESCE(SUM(revenue), 0)::numeric AS revenue,
        COALESCE(SUM(provider_cost), 0)::numeric AS provider_cost,
        COALESCE(SUM(commission), 0)::numeric AS commission,
        COALESCE(SUM(revenue) - SUM(provider_cost), 0)::numeric AS margin
      FROM pkg
      GROUP BY service_type
      ORDER BY count DESC
    `;
    const result = await pool.query(q, params);

    let advisorName = 'Sin Asesor';
    if (!isSinAsesor) {
      const a = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [Number(advisorId)]);
      advisorName = a.rows[0]?.full_name || `Asesor #${advisorId}`;
    }

    const services = [...result.rows];

    // GEX (garantías): ingreso = total cobrado; costo = comisión pagada al asesor.
    const gexFilter = isSinAsesor ? 'w.advisor_id IS NULL' : 'w.advisor_id = $3';
    const gex = await pool.query(`
      SELECT COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE w.status = 'active')::int AS completed,
             COALESCE(SUM(w.total_cost_mxn), 0)::numeric AS revenue,
             COALESCE(SUM(w.advisor_commission), 0)::numeric AS provider_cost,
             COALESCE(SUM(w.advisor_commission), 0)::numeric AS commission,
             COALESCE(SUM(w.total_cost_mxn) - SUM(w.advisor_commission), 0)::numeric AS margin
      FROM warranties w
      WHERE ${gexFilter} AND w.created_at BETWEEN $1 AND $2
    `, params);
    if (Number(gex.rows[0].count) > 0) services.push({ service_type: 'GEX (Garantía)', ...gex.rows[0] });

    // X-Pay (modelo "solo comisión"): todo en pesos.
    //  - INGRESO = comisión cobrada al cliente = monto(USD) × TC_cliente × comisión_cliente%
    //  - COSTO PROVEEDOR = comisión que nos cobra ENTANGLED = monto(USD) × TC_compra × comisión_ENTANGLED%
    //  - GANANCIA = INGRESO − COSTO. NO incluye el monto al proveedor ni el margen de TC.
    // Las comisiones en pesos no se guardan; se calculan del monto y los %.
    const xpayFilter = isSinAsesor ? 'epr.advisor_id IS NULL' : 'epr.advisor_id = $3';
    const XPAY_BASE_C = `COALESCE(epr.op_monto, 0) * COALESCE(epr.tc_cliente_final, epr.tc_aplicado_usd, 0)`;
    const XPAY_REVENUE = `${XPAY_BASE_C} * COALESCE(epr.comision_cliente_final_porcentaje, 0) / 100`;
    const XPAY_COST = `${XPAY_BASE_C} * COALESCE(epr.comision_cobrada_porcentaje, 0) / 100`;
    // Comisión del asesor en X-Pay = parte del asesor (cliente − entangled − entregax).
    const XPAY_DEFAULT_EGX = `(SELECT COALESCE(override_porcentaje_compra,0) FROM entangled_providers WHERE is_active=true AND is_default=true ORDER BY id ASC LIMIT 1)`;
    const XPAY_PCT_EGX = `LEAST(COALESCE(NULLIF(epr.comision_entregax,0), ${XPAY_DEFAULT_EGX}, 0), GREATEST(0, COALESCE(epr.comision_cliente_final_porcentaje,0) - COALESCE(epr.comision_cobrada_porcentaje,0)))`;
    const XPAY_ASESOR = `${XPAY_BASE_C} * GREATEST(0, COALESCE(epr.comision_cliente_final_porcentaje,0) - COALESCE(epr.comision_cobrada_porcentaje,0) - ${XPAY_PCT_EGX}) / 100`;
    const xpay = await pool.query(`
      SELECT COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE epr.estatus_global = 'completado')::int AS completed,
             COALESCE(SUM(${XPAY_REVENUE}), 0)::numeric AS revenue,
             COALESCE(SUM(${XPAY_COST}), 0)::numeric AS provider_cost,
             COALESCE(SUM(${XPAY_ASESOR}), 0)::numeric AS commission,
             COALESCE(SUM(${XPAY_REVENUE} - ${XPAY_COST}), 0)::numeric AS margin
      FROM entangled_payment_requests epr
      WHERE ${xpayFilter} AND epr.created_at BETWEEN $1 AND $2
        AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')
    `, params);
    if (Number(xpay.rows[0].count) > 0) services.push({ service_type: 'X-Pay', ...xpay.rows[0] });

    // Envíos/completados = solo paquetes; ingreso/costo/ganancia = todo (incl. GEX y X-Pay).
    const totals = {
      shipments: result.rows.reduce((s, r) => s + Number(r.count || 0), 0),
      completed: result.rows.reduce((s, r) => s + Number(r.completed || 0), 0),
      revenue: services.reduce((s, r) => s + parseFloat(r.revenue || '0'), 0).toFixed(2),
      provider_cost: services.reduce((s, r) => s + parseFloat(r.provider_cost || '0'), 0).toFixed(2),
      commission: services.reduce((s, r) => s + parseFloat(r.commission || '0'), 0).toFixed(2),
      margin: services.reduce((s, r) => s + parseFloat(r.margin || '0'), 0).toFixed(2),
    };

    res.json({ success: true, advisor: { id: isSinAsesor ? null : Number(advisorId), name: advisorName }, services, totals });
  } catch (error: any) {
    console.error('Error getSalesReportByAdvisor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Detalle (lista) de un servicio de un asesor: guías + orden de pago (paquetes),
 * garantías (GEX) u operaciones X-Pay. Para el drill-down del modal.
 * GET /api/admin/crm/reports/sales/advisor/:advisorId/items?service=...
 */
export const getSalesReportServiceItems = async (req: Request, res: Response): Promise<any> => {
  try {
    const { advisorId } = req.params;
    const { service, startDate, endDate } = req.query as Record<string, string>;
    const isSinAsesor = advisorId === 'null' || advisorId === 'sin-asesor';
    const svc = String(service || '');
    const start = startDate || '2020-01-01';
    const end = endDate || new Date().toISOString();

    // ── GEX (garantías) ──────────────────────────────────────────────
    if (svc.toUpperCase().startsWith('GEX')) {
      const p: any[] = [start, end];
      let f = 'w.advisor_id IS NULL';
      if (!isSinAsesor) { p.push(Number(advisorId)); f = 'w.advisor_id = $3'; }
      const r = await pool.query(`
        SELECT w.gex_folio, w.status, w.description, w.route, w.created_at,
               COALESCE(w.total_cost_mxn,0)::numeric AS revenue,
               COALESCE(w.advisor_commission,0)::numeric AS provider_cost,
               (COALESCE(w.total_cost_mxn,0) - COALESCE(w.advisor_commission,0))::numeric AS margin
        FROM warranties w
        WHERE ${f} AND w.created_at BETWEEN $1 AND $2
        ORDER BY w.created_at DESC`, p);
      return res.json({ success: true, kind: 'gex', items: r.rows });
    }

    // ── X-Pay (pagos a proveedor) ────────────────────────────────────
    if (svc.replace(/[-\s]/g, '').toUpperCase() === 'XPAY') {
      const p: any[] = [start, end];
      let f = 'epr.advisor_id IS NULL';
      if (!isSinAsesor) { p.push(Number(advisorId)); f = 'epr.advisor_id = $3'; }
      // Desglose de la comisión cobrada al cliente (todo sobre la misma base = monto × TC cliente):
      //  - Cliente paga   = comision_cliente_final_porcentaje (p.ej. 6%)
      //  - Entangled cobra= comision_cobrada_porcentaje (p.ej. 3.5%)
      //  - Entregax gana  = comision_entregax (incremento configurado del proveedor, p.ej. 1%);
      //                     para operaciones viejas sin el dato, cae al override del proveedor default.
      //  - Asesor gana    = lo que sobra (cliente − entangled − entregax)
      const DEFAULT_EGX = `(SELECT COALESCE(override_porcentaje_compra,0) FROM entangled_providers WHERE is_active=true AND is_default=true ORDER BY id ASC LIMIT 1)`;
      const BASE_C = `COALESCE(epr.op_monto,0) * COALESCE(epr.tc_cliente_final, epr.tc_aplicado_usd, 0)`;
      const PCT_CLI = `COALESCE(epr.comision_cliente_final_porcentaje,0)`;
      const PCT_ENT = `COALESCE(epr.comision_cobrada_porcentaje,0)`;
      const PCT_EGX = `LEAST(COALESCE(NULLIF(epr.comision_entregax,0), ${DEFAULT_EGX}, 0), GREATEST(0, ${PCT_CLI} - ${PCT_ENT}))`;
      const PCT_ASE = `GREATEST(0, ${PCT_CLI} - ${PCT_ENT} - ${PCT_EGX})`;
      const r = await pool.query(`
        SELECT COALESCE(epr.referencia_pago, 'XP'||LPAD(epr.id::text,6,'0')) AS referencia,
               epr.op_beneficiario_nombre AS beneficiario,
               epr.op_monto, epr.op_divisa_destino AS divisa,
               epr.estatus_global AS status, epr.created_at,
               ${PCT_CLI}::numeric AS pct_cliente,
               ${PCT_ENT}::numeric AS pct_entangled,
               ${PCT_EGX}::numeric AS pct_entregax,
               ${PCT_ASE}::numeric AS pct_asesor,
               (${BASE_C} * ${PCT_CLI}/100)::numeric AS revenue,
               (${BASE_C} * ${PCT_ENT}/100)::numeric AS provider_cost,
               (${BASE_C} * ${PCT_EGX}/100)::numeric AS entregax_amount,
               (${BASE_C} * ${PCT_ASE}/100)::numeric AS asesor_amount,
               (${BASE_C} * (${PCT_CLI} - ${PCT_ENT})/100)::numeric AS margin
        FROM entangled_payment_requests epr
        WHERE ${f} AND epr.created_at BETWEEN $1 AND $2
          AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')
        ORDER BY epr.created_at DESC`, p);
      return res.json({ success: true, kind: 'xpay', items: r.rows });
    }

    // ── Paquetes (servicio de paquetería): guías + orden de pago ─────
    const p: any[] = [start, end];
    let advCond = 'COALESCE(client.advisor_id, client.referred_by_id) IS NULL';
    if (!isSinAsesor) { p.push(Number(advisorId)); advCond = 'COALESCE(client.advisor_id, client.referred_by_id) = $3'; }
    p.push(svc);
    const svcIdx = p.length;
    const REVENUE_EXPR = `COALESCE(NULLIF(p.assigned_cost_mxn, 0), p.pobox_service_cost, 0)`;
    const r = await pool.query(`
      SELECT p.tracking_internal AS tracking, p.tracking_provider AS origin_tracking,
             p.status, p.created_at,
             ${REVENUE_EXPR}::numeric AS revenue,
             po.payment_reference AS payment_ref,
             po.pay_status AS payment_status,
             po.paid_with_credit AS paid_with_credit,
             COALESCE((SELECT ac.commission_amount_mxn FROM advisor_commissions ac
                        WHERE ac.shipment_type = 'PKG' AND ac.shipment_id = p.id
                        ORDER BY ac.id DESC LIMIT 1), 0)::numeric AS commission,
             (SELECT ac.commission_rate_pct FROM advisor_commissions ac
                WHERE ac.shipment_type = 'PKG' AND ac.shipment_id = p.id
                ORDER BY ac.id DESC LIMIT 1) AS commission_rate
      FROM packages p
      JOIN users client ON p.user_id = client.id
      LEFT JOIN LATERAL (
        SELECT o.payment_reference, o.pay_status, o.paid_with_credit
        FROM (
           SELECT payment_reference, status AS pay_status, created_at, package_ids AS ids,
                  (LOWER(COALESCE(payment_method,'')) = 'credit' OR COALESCE(credit_applied,0) > 0) AS paid_with_credit
             FROM pobox_payments WHERE COALESCE(status,'') <> 'cancelled'
           UNION ALL
           SELECT payment_reference, status AS pay_status, created_at, package_uids AS ids,
                  false AS paid_with_credit FROM advisor_payment_orders
        ) o
        WHERE o.payment_reference IS NOT NULL AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(o.ids,'[]'::jsonb)) e
          WHERE e = p.id::text OR e = 'PKG-'||p.id::text
        )
        -- Una misma referencia puede existir en ambas tablas (la solicitud del
        -- asesor 'pendiente' y el pago real en pobox 'completed'). Preferimos el
        -- estado más pagado para que un pago con crédito no se vea pendiente.
        ORDER BY (CASE LOWER(COALESCE(o.pay_status,''))
                    WHEN 'paid' THEN 0 WHEN 'completed' THEN 0 WHEN 'pagado' THEN 0
                    WHEN 'vouchers_submitted' THEN 1 WHEN 'vouchers_partial' THEN 1
                    WHEN 'pending' THEN 2 WHEN 'pendiente' THEN 2 WHEN 'pending_payment' THEN 2
                    ELSE 3 END) ASC,
                 o.paid_with_credit DESC,
                 o.created_at DESC
        LIMIT 1
      ) po ON true
      WHERE p.created_at BETWEEN $1 AND $2 AND ${advCond} AND p.service_type = $${svcIdx}
        AND p.master_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT 1000`, p);
    return res.json({ success: true, kind: 'package', items: r.rows });
  } catch (error: any) {
    console.error('Error getSalesReportServiceItems:', error);
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
        COALESCE(SUM(assigned_cost_mxn), 0) as revenue_month
      FROM packages
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `);

    // Top asesores del mes
    const topAdvisors = await pool.query(`
      SELECT 
        advisor.full_name,
        COUNT(p.id) as shipments,
        SUM(COALESCE(p.assigned_cost_mxn, 0)) as revenue
      FROM packages p
      JOIN users client ON p.user_id = client.id
      JOIN users advisor ON advisor.id = COALESCE(client.advisor_id, client.referred_by_id)
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
        u.box_id,
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
 * PATCH /api/admin/crm/clients/:id/advisor
 * Cambiar asesor asignado de un cliente
 */
export const changeClientAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { advisorId } = req.body;
    if (!id) return res.status(400).json({ error: 'ID de cliente requerido' });
    // Mantener ambas columnas sincronizadas (advisor_id es la canonica en el panel
    // de gestion de usuarios; referred_by_id es la usada por el CRM historico).
    await pool.query(
      `UPDATE users SET advisor_id = $1, referred_by_id = $1 WHERE id = $2 AND role = 'client'`,
      [advisorId || null, id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/admin/crm/clients/:id/reset-password
 * Resetea contraseña a "Entregax123" y fuerza cambio en próximo login
 */
export const resetClientPassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const hashed = await bcrypt.hash('Entregax123', 10);
    await pool.query(
      `UPDATE users SET password = $1, must_change_password = true WHERE id = $2`,
      [hashed, id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PATCH /api/admin/crm/clients/:id/toggle-active
 * Activa o desactiva un cliente (toggle de users.is_active).
 */
export const toggleClientActive = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const cur = await pool.query(`SELECT is_active FROM users WHERE id = $1 AND role = 'client'`, [id]);
    if (cur.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const newState = !cur.rows[0].is_active;
    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [newState, id]);
    res.json({ success: true, is_active: newState });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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