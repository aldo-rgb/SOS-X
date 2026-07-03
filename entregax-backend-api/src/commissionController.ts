import { Request, Response } from 'express';
import { pool } from './db';
import { generateBoxId } from './authController';

// ============================================
// SISTEMA DE COMISIONES Y REFERIDOS
// ============================================

// 1. ADMIN: Obtener tabla de comisiones
export const getCommissionRates = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query('SELECT * FROM commission_rates ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting commission rates:', error);
        res.status(500).json({ error: 'Error al obtener tarifas de comisión' });
    }
};

// 2. ADMIN: Actualizar un porcentaje y override
export const updateCommissionRate = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, percentage, leader_override, fixed_fee } = req.body;
        
        if (percentage < 0 || percentage > 100) {
            return res.status(400).json({ error: 'El porcentaje debe estar entre 0 y 100' });
        }
        
        if (leader_override !== undefined && (leader_override < 0 || leader_override > 100)) {
            return res.status(400).json({ error: 'El override debe estar entre 0 y 100' });
        }
        
        const result = await pool.query(
            'UPDATE commission_rates SET percentage = $1, leader_override = $2, fixed_fee = COALESCE($3, fixed_fee), updated_at = NOW() WHERE id = $4 RETURNING *',
            [percentage, leader_override || 0, fixed_fee, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tarifa no encontrada' });
        }
        
        res.json({ message: 'Tarifa actualizada correctamente', rate: result.rows[0] });
    } catch (error) {
        console.error('Error updating commission rate:', error);
        res.status(500).json({ error: 'Error al actualizar tarifa' });
    }
};

// 2b. ADMIN: Crear nuevo tipo de servicio
export const createServiceType = async (req: Request, res: Response): Promise<any> => {
    try {
        const { service_type, label, percentage, leader_override } = req.body;
        
        if (!service_type || !label) {
            return res.status(400).json({ error: 'service_type y label son requeridos' });
        }
        
        // Verificar que no exista
        const existing = await pool.query(
            'SELECT id FROM commission_rates WHERE service_type = $1',
            [service_type]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Ya existe un servicio con ese código' });
        }
        
        const result = await pool.query(
            `INSERT INTO commission_rates (service_type, label, percentage, leader_override, updated_at) 
             VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
            [service_type, label, percentage || 0, leader_override || 10]
        );
        
        res.status(201).json({ 
            message: 'Tipo de servicio creado correctamente', 
            serviceType: result.rows[0] 
        });
    } catch (error) {
        console.error('Error creating service type:', error);
        res.status(500).json({ error: 'Error al crear tipo de servicio' });
    }
};

// 2c. ADMIN: Eliminar tipo de servicio
export const deleteServiceType = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        
        // Verificar que no tenga consolidaciones asociadas
        const inUse = await pool.query(
            'SELECT COUNT(*) as count FROM consolidations WHERE service_type = (SELECT service_type FROM commission_rates WHERE id = $1)',
            [id]
        );
        
        if (parseInt(inUse.rows[0].count) > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar: hay consolidaciones usando este tipo de servicio' 
            });
        }
        
        const result = await pool.query(
            'DELETE FROM commission_rates WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tipo de servicio no encontrado' });
        }
        
        res.json({ message: 'Tipo de servicio eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting service type:', error);
        res.status(500).json({ error: 'Error al eliminar tipo de servicio' });
    }
};

// 3. UTILIDAD: Generar código de referido al registrarse
export const generateReferralCode = (name: string): string => {
    // Ejemplo: "Aldo Navarro" -> "ALDO-4921"
    const cleanName = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const prefix = cleanName.substring(0, 4).padEnd(4, 'X');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${random}`;
};

// 4. Validar código de referido
export const validateReferralCode = async (req: Request, res: Response): Promise<any> => {
    try {
        const code = req.params.code as string;
        
        if (!code) {
            return res.status(400).json({ valid: false, message: 'Código requerido' });
        }
        
        const codeUpper = code.toUpperCase();
        // Normalizar código: agregar guión si no lo tiene (CHRI3225 -> CHRI-3225)
        const normalizedCode = codeUpper.includes('-') 
            ? codeUpper 
            : codeUpper.length >= 5 
                ? `${codeUpper.slice(0, 4)}-${codeUpper.slice(4)}`
                : codeUpper;
        
        // Buscar por código exacto o normalizado
        const result = await pool.query(
            'SELECT id, full_name, role, phone, profile_photo_url FROM users WHERE referral_code = $1 OR referral_code = $2',
            [codeUpper, normalizedCode]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ valid: false, message: 'Código de referido no encontrado' });
        }
        
        const advisor = result.rows[0];
        res.json({
            valid: true,
            advisor: {
                name: advisor.full_name,
                role: advisor.role,
                phone: advisor.phone,
                photoUrl: advisor.profile_photo_url
            },
            // Agregar campos adicionales para compatibilidad
            success: true,
            data: {
                referidor: advisor.full_name,
                isAdvisor: advisor.role === 'advisor',
                phone: advisor.phone,
                photoUrl: advisor.profile_photo_url
            }
        });
    } catch (error) {
        console.error('Error validating referral code:', error);
        res.status(500).json({ error: 'Error al validar código' });
    }
};

// 5. ADMIN: Obtener lista de referidos por asesor
export const getReferralsByAdvisor = async (req: Request, res: Response): Promise<any> => {
    try {
        const { advisorId } = req.params;
        
        const result = await pool.query(`
            SELECT 
                u.id, 
                u.full_name, 
                u.email, 
                u.box_id,
                u.created_at,
                COUNT(DISTINCT p.id) as total_packages,
                COALESCE(SUM(CASE WHEN p.status = 'delivered' THEN 1 ELSE 0 END), 0) as delivered_packages
            FROM users u
            LEFT JOIN packages p ON u.id = p.user_id
            WHERE u.referred_by_id = $1
            GROUP BY u.id, u.full_name, u.email, u.box_id, u.created_at
            ORDER BY u.created_at DESC
        `, [advisorId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting referrals:', error);
        res.status(500).json({ error: 'Error al obtener referidos' });
    }
};

// 6. ADMIN: Obtener estadísticas de comisiones
export const getCommissionStats = async (req: Request, res: Response): Promise<any> => {
    try {
        // Total de asesores con clientes asignados
        const advisorsResult = await pool.query(`
            SELECT COUNT(DISTINCT advisor_id) as total_advisors
            FROM users
            WHERE advisor_id IS NOT NULL
        `);

        // Total de clientes asignados a asesores
        const referredResult = await pool.query(`
            SELECT COUNT(*) as total_referred
            FROM users
            WHERE advisor_id IS NOT NULL
        `);

        // Top asesores por clientes asignados
        const topAdvisors = await pool.query(`
            SELECT
                a.id,
                a.full_name,
                a.referral_code,
                COUNT(r.id) as referral_count
            FROM users a
            JOIN users r ON r.advisor_id = a.id
            GROUP BY a.id, a.full_name, a.referral_code
            ORDER BY referral_count DESC
            LIMIT 5
        `);
        
        // Estadísticas GEX
        const gexStats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'active') as active_policies,
                COALESCE(SUM(advisor_commission) FILTER (WHERE status = 'active'), 0) as total_gex_commissions,
                COALESCE(SUM(total_cost_mxn) FILTER (WHERE status = 'active'), 0) as total_gex_revenue
            FROM warranties
        `);
        
        // Top asesores GEX
        const topGexAdvisors = await pool.query(`
            SELECT 
                a.id,
                a.full_name,
                a.referral_code,
                COUNT(w.id) as policies_sold,
                COALESCE(SUM(w.advisor_commission), 0) as total_commission
            FROM users a
            JOIN warranties w ON w.advisor_id = a.id AND w.status = 'active'
            GROUP BY a.id, a.full_name, a.referral_code
            ORDER BY policies_sold DESC
            LIMIT 5
        `);
        
        res.json({
            totalAdvisors: parseInt(advisorsResult.rows[0].total_advisors) || 0,
            totalReferred: parseInt(referredResult.rows[0].total_referred) || 0,
            topAdvisors: topAdvisors.rows,
            gex: {
                activePolicies: parseInt(gexStats.rows[0]?.active_policies) || 0,
                totalCommissions: parseFloat(gexStats.rows[0]?.total_gex_commissions) || 0,
                totalRevenue: parseFloat(gexStats.rows[0]?.total_gex_revenue) || 0,
                topAdvisors: topGexAdvisors.rows
            }
        });
    } catch (error) {
        console.error('Error getting commission stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

// 7. Obtener mi código de referido (para el usuario logueado)
export const getMyReferralCode = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;
        
        const result = await pool.query(
            'SELECT referral_code, full_name FROM users WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        let referralCode = result.rows[0].referral_code;
        
        // Si no tiene código, generarlo
        if (!referralCode) {
            referralCode = generateReferralCode(result.rows[0].full_name);
            await pool.query(
                'UPDATE users SET referral_code = $1 WHERE id = $2',
                [referralCode, userId]
            );
        }
        
        res.json({ referralCode });
    } catch (error) {
        console.error('Error getting referral code:', error);
        res.status(500).json({ error: 'Error al obtener código de referido' });
    }
};

// ============================================
// SISTEMA DE ASESORES Y JERARQUÍA
// ============================================

// 8. ADMIN: Obtener lista de asesores con jerarquía
export const getAdvisors = async (req: Request, res: Response): Promise<any> => {
    try {
        // ?only_active_with_clients=true → solo asesores activos (no bloqueados) y con al menos un cliente.
        const onlyActiveWithClients = req.query.only_active_with_clients === 'true';
        const extraConds = onlyActiveWithClients
            ? `AND COALESCE(u.is_active, true) = true
               AND COALESCE(u.is_blocked, false) = false
               AND (SELECT COUNT(*) FROM users r WHERE r.advisor_id = u.id) > 0`
            : '';
        const result = await pool.query(`
            SELECT
                u.id,
                u.full_name,
                u.email,
                u.referral_code,
                u.role,
                u.profile_photo_url,
                u.referred_by_id as leader_id,
                l.full_name as leader_name,
                u.created_at,
                u.can_recovery,
                COALESCE(u.is_active, true) as is_active,
                COALESCE(
                    (SELECT COUNT(*) FROM users r WHERE r.advisor_id = u.id),
                    0
                )::int as referral_count
            FROM users u
            LEFT JOIN users l ON u.referred_by_id = l.id
            WHERE u.role IN ('asesor', 'asesor_lider', 'advisor', 'sub_advisor')
            ${extraConds}
            ORDER BY
                CASE WHEN u.role IN ('asesor_lider', 'sub_advisor') THEN 0 ELSE 1 END,
                u.created_at DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Error getting advisors:', error);
        res.status(500).json({ error: 'Error al obtener asesores' });
    }
};

// 9. ADMIN: Crear nuevo asesor
export const createAdvisor = async (req: Request, res: Response): Promise<any> => {
    try {
        const { full_name, email, phone, password, role, leader_id } = req.body;
        
        console.log('Creating advisor:', { full_name, email, phone, role, leader_id });
        
        if (!full_name || !email || !password) {
            return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
        }
        
        // Verificar que el email no existe
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }
        
        // Mapear roles del frontend a roles del backend
        // asesor_lider = Asesor Principal (recibe override) = 'advisor'
        // asesor = Subasesor (reporta a un líder) = 'sub_advisor'
        const roleMap: { [key: string]: string } = {
            'asesor': 'sub_advisor',
            'asesor_lider': 'advisor',
            'advisor': 'advisor',
            'sub_advisor': 'sub_advisor'
        };
        
        const mappedRole = roleMap[role] || 'sub_advisor';
        
        // Generar código de referido
        const referralCode = generateReferralCode(full_name);
        
        const boxId = await generateBoxId();
        
        // Hash de contraseña
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Crear usuario con teléfono
        const result = await pool.query(`
            INSERT INTO users (full_name, email, phone, password, role, referral_code, referred_by_id, box_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING id, full_name, email, phone, role, referral_code, box_id
        `, [full_name, email.toLowerCase(), phone || null, hashedPassword, mappedRole, referralCode, leader_id || null, boxId]);
        
        console.log('Advisor created:', result.rows[0]);
        
        res.status(201).json({ 
            message: 'Asesor creado exitosamente',
            advisor: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating advisor:', error);
        res.status(500).json({ error: 'Error al crear asesor: ' + (error as Error).message });
    }
};

// 10. Calcular comisiones multinivel para un pago
export const calculateCommissions = async (
    userId: number, 
    serviceType: string, 
    paymentAmount: number
): Promise<{ advisorCommission: number; leaderCommission: number; advisorId: number | null; leaderId: number | null }> => {
    try {
        // Obtener porcentajes de comisión para el tipo de servicio
        const rateResult = await pool.query(
            'SELECT percentage, leader_override FROM commission_rates WHERE service_type = $1',
            [serviceType]
        );
        
        if (rateResult.rows.length === 0) {
            return { advisorCommission: 0, leaderCommission: 0, advisorId: null, leaderId: null };
        }
        
        const { percentage, leader_override } = rateResult.rows[0];
        
        // Obtener el asesor que refirió al cliente
        const userResult = await pool.query(
            'SELECT referred_by_id FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0 || !userResult.rows[0].referred_by_id) {
            return { advisorCommission: 0, leaderCommission: 0, advisorId: null, leaderId: null };
        }
        
        const advisorId = userResult.rows[0].referred_by_id;
        
        // Calcular comisión del asesor
        const advisorCommission = (paymentAmount * percentage) / 100;
        
        // Verificar si el asesor tiene un líder
        const advisorResult = await pool.query(
            'SELECT referred_by_id FROM users WHERE id = $1 AND referred_by_id IS NOT NULL',
            [advisorId]
        );
        
        let leaderCommission = 0;
        let leaderId = null;
        
        if (advisorResult.rows.length > 0 && advisorResult.rows[0].referred_by_id) {
            leaderId = advisorResult.rows[0].referred_by_id;
            // El líder recibe el override sobre el monto del pago
            leaderCommission = (paymentAmount * (leader_override || 0)) / 100;
        }
        
        return { advisorCommission, leaderCommission, advisorId, leaderId };
    } catch (error) {
        console.error('Error calculating commissions:', error);
        return { advisorCommission: 0, leaderCommission: 0, advisorId: null, leaderId: null };
    }
};

// ============================================
// ADMIN: GESTIÓN DE COMISIONES GENERADAS
// ============================================

// 11. ADMIN: Listar comisiones generadas (con filtros)
export const getAdvisorCommissionsList = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            advisor_id, service_type, status,
            from_date, to_date, client_box, tracking,
            page = '1', limit = '50'
        } = req.query;

        const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        if (advisor_id) {
            conditions.push(`ac.advisor_id = $${paramIdx++}`);
            params.push(parseInt(advisor_id as string));
        }
        if (service_type) {
            conditions.push(`ac.service_type = $${paramIdx++}`);
            params.push(service_type);
        }
        if (status) {
            conditions.push(`ac.status = $${paramIdx++}`);
            params.push(status);
        }
        if (from_date) {
            conditions.push(`ac.created_at >= $${paramIdx++}`);
            params.push(from_date);
        }
        if (to_date) {
            conditions.push(`ac.created_at <= $${paramIdx++}::date + interval '1 day'`);
            params.push(to_date);
        }
        if (client_box) {
            // Filtro por número de cliente (box_id), sin necesidad del JOIN en count/summary.
            conditions.push(`ac.client_id IN (SELECT id FROM users WHERE box_id ILIKE $${paramIdx++})`);
            params.push(`%${(client_box as string).trim()}%`);
        }
        if (tracking) {
            conditions.push(`ac.tracking ILIKE $${paramIdx++}`);
            params.push(`%${(tracking as string).trim()}%`);
        }

        // 🧾 Regla: en PO Box solo aparecen comisiones cuya GUÍA tiene una ORDEN DE
        // PAGO registrada y PAGADA. Las guías marcadas como pagadas sin orden real
        // (p.ej. "Marcar pagado" masivo) no deben aparecer para cobro de comisiones.
        // 💳 Además, un pago a CRÉDITO NO genera comisión hasta que el cliente paga
        // la orden (credit_settled=true); una orden a crédito NO liquidada no cuenta.
        // Por ahora solo PO Box tiene órdenes de pago, así que el filtro aplica solo
        // a ese servicio; los demás (aéreo/marítimo/DHL/GEX/xpay) pasan sin filtrar.
        // "Orden pagada válida" = status completed/paid Y (no es crédito, o el crédito
        // ya fue liquidado).
        const PAID_ORDER = `pp_x.status IN ('completed','paid') AND (LOWER(COALESCE(pp_x.payment_method,'')) <> 'credit' OR COALESCE(pp_x.credit_settled,false) = true)`;
        conditions.push(`(
            ac.service_type <> 'pobox_usa_mx'
            OR EXISTS (SELECT 1 FROM pobox_payments pp_x WHERE pp_x.package_ids @> to_jsonb(ac.shipment_id) AND ${PAID_ORDER})
            OR EXISTS (SELECT 1 FROM pobox_payments pp_x JOIN packages pk ON pk.pobox_payment_id = pp_x.id WHERE pk.id = ac.shipment_id AND ${PAID_ORDER})
            OR EXISTS (SELECT 1 FROM pobox_payments pp_x JOIN packages pk2 ON NULLIF(pk2.payment_reference,'') = pp_x.payment_reference WHERE pk2.id = ac.shipment_id AND ${PAID_ORDER})
        )`);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Total count
        const countRes = await pool.query(
            `SELECT COUNT(*) as total FROM advisor_commissions ac ${whereClause}`, 
            params
        );

        // Paginated list
        const dataRes = await pool.query(`
            SELECT 
                ac.id, ac.advisor_id, ac.advisor_name, ac.leader_id, ac.leader_name,
                ac.shipment_type, ac.shipment_id, ac.service_type, ac.tracking,
                ac.client_id, ac.client_name, cu.box_id AS client_box,
                ac.payment_amount_mxn, ac.commission_rate_pct, ac.commission_amount_mxn,
                ac.leader_override_pct, ac.leader_override_amount,
                ac.gex_commission_mxn, ac.status, ac.paid_to_advisor_at,
                COALESCE(ac.awaiting_client_payment, FALSE) AS awaiting_client_payment,
                COALESCE(ac.client_collected_amount, 0) AS client_collected_amount,
                ac.client_paid_at,
                ac.paid_by_admin_id, ac.payment_notes, ac.created_at,
                -- Orden de pago de la guía (RO-/PP-...). Para PKG buscamos la MEJOR
                -- orden vinculada (por package_ids, pobox_payment_id o payment_reference)
                -- prefiriendo la PAGADA sobre la cancelada/pendiente — así si el cliente
                -- pagó con otro método a la mera hora (ej. PayPal PP-) se muestra esa,
                -- no una RO- cancelada. Exponemos también el status de la orden.
                COALESCE(bo.payment_reference,
                    (CASE ac.shipment_type WHEN 'DHL' THEN (SELECT d.payment_reference FROM dhl_shipments d WHERE d.id = ac.shipment_id) ELSE NULL END)
                ) AS payment_order,
                bo.status AS payment_order_status
            FROM advisor_commissions ac
            LEFT JOIN users cu ON cu.id = ac.client_id
            LEFT JOIN LATERAL (
                SELECT pp.payment_reference, pp.status
                  FROM pobox_payments pp
                 WHERE ac.shipment_type = 'PKG' AND (
                        pp.package_ids @> to_jsonb(ac.shipment_id)
                        OR pp.id = (SELECT p2.pobox_payment_id FROM packages p2 WHERE p2.id = ac.shipment_id)
                        OR pp.payment_reference = NULLIF((SELECT p3.payment_reference FROM packages p3 WHERE p3.id = ac.shipment_id), '')
                     )
                 ORDER BY (CASE WHEN pp.status IN ('completed','paid') THEN 0 WHEN pp.status = 'cancelled' THEN 2 ELSE 1 END),
                          pp.paid_at DESC NULLS LAST, pp.id DESC
                 LIMIT 1
            ) bo ON TRUE
            ${whereClause}
            ORDER BY ac.created_at DESC
            LIMIT $${paramIdx++} OFFSET $${paramIdx++}
        `, [...params, parseInt(limit as string), offset]);

        // Resumen de totales filtrados
        const summaryRes = await pool.query(`
            SELECT 
                COUNT(*) as total_count,
                COALESCE(SUM(ac.commission_amount_mxn), 0) as total_commission,
                COALESCE(SUM(ac.commission_amount_mxn) FILTER (WHERE ac.status = 'pending' AND COALESCE(ac.awaiting_client_payment, FALSE) = FALSE), 0) as pending_total,
                COALESCE(SUM(ac.commission_amount_mxn) FILTER (WHERE ac.status = 'paid'), 0) as paid_total,
                COALESCE(SUM(ac.commission_amount_mxn) FILTER (WHERE COALESCE(ac.awaiting_client_payment, FALSE) = TRUE), 0) as credit_hold_total,
                COALESCE(SUM(ac.leader_override_amount), 0) as total_leader_override,
                COUNT(DISTINCT ac.advisor_id) as advisor_count
            FROM advisor_commissions ac
            ${whereClause}
        `, params);

        const summary = summaryRes.rows[0] || {};

        res.json({
            data: dataRes.rows.map(r => ({
                id: r.id,
                advisorId: r.advisor_id,
                advisorName: r.advisor_name,
                leaderId: r.leader_id,
                leaderName: r.leader_name,
                shipmentType: r.shipment_type,
                shipmentId: r.shipment_id,
                serviceType: r.service_type,
                tracking: r.tracking,
                clientId: r.client_id,
                clientName: r.client_name,
                clientBox: r.client_box || null,
                paymentAmount: parseFloat(r.payment_amount_mxn) || 0,
                commissionRate: parseFloat(r.commission_rate_pct) || 0,
                commissionAmount: parseFloat(r.commission_amount_mxn) || 0,
                leaderOverridePct: parseFloat(r.leader_override_pct) || 0,
                leaderOverrideAmount: parseFloat(r.leader_override_amount) || 0,
                gexCommission: parseFloat(r.gex_commission_mxn) || 0,
                status: r.status,
                awaitingClientPayment: r.awaiting_client_payment === true,
                clientCollectedAmount: parseFloat(r.client_collected_amount) || 0,
                clientPaidAt: r.client_paid_at,
                paidAt: r.paid_to_advisor_at,
                paidByAdminId: r.paid_by_admin_id,
                paymentNotes: r.payment_notes,
                createdAt: r.created_at,
                paymentOrder: r.payment_order || null,
                paymentOrderStatus: r.payment_order_status || null,
            })),
            summary: {
                totalCount: parseInt(summary.total_count) || 0,
                totalCommission: parseFloat(summary.total_commission) || 0,
                pendingTotal: parseFloat(summary.pending_total) || 0,
                paidTotal: parseFloat(summary.paid_total) || 0,
                creditHoldTotal: parseFloat(summary.credit_hold_total) || 0,
                totalLeaderOverride: parseFloat(summary.total_leader_override) || 0,
                advisorCount: parseInt(summary.advisor_count) || 0,
            },
            total: parseInt(countRes.rows[0]?.total) || 0,
            page: parseInt(page as string),
            limit: parseInt(limit as string),
        });
    } catch (error) {
        console.error('Error listing advisor commissions:', error);
        res.status(500).json({ error: 'Error al listar comisiones' });
    }
};

// 12. ADMIN: Marcar comisiones como pagadas (batch)
export const markCommissionsAsPaid = async (req: Request, res: Response): Promise<any> => {
    try {
        const { commission_ids, notes } = req.body;
        const adminId = (req as any).user?.userId || (req as any).user?.id;

        if (!commission_ids || !Array.isArray(commission_ids) || commission_ids.length === 0) {
            return res.status(400).json({ error: 'commission_ids es requerido (array de IDs)' });
        }

        const result = await pool.query(`
            UPDATE advisor_commissions 
            SET status = 'paid', 
                paid_to_advisor_at = NOW(), 
                paid_by_admin_id = $1,
                payment_notes = COALESCE($2, payment_notes),
                updated_at = NOW()
            WHERE id = ANY($3) AND status = 'pending'
              AND COALESCE(awaiting_client_payment, FALSE) = FALSE
            RETURNING id, advisor_name, commission_amount_mxn
        `, [adminId, notes || null, commission_ids]);

        const totalPaid = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.commission_amount_mxn), 0);

        res.json({
            message: `${result.rows.length} comisiones marcadas como pagadas`,
            paidCount: result.rows.length,
            totalPaid: totalPaid,
            details: result.rows,
        });
    } catch (error) {
        console.error('Error marking commissions as paid:', error);
        res.status(500).json({ error: 'Error al marcar comisiones como pagadas' });
    }
};

// 13. ADMIN: Resumen de comisiones por asesor
export const getCommissionsByAdvisor = async (req: Request, res: Response): Promise<any> => {
    try {
        const { from_date, to_date, service_type } = req.query;
        // Filtros a NIVEL DE FILA de comisión (fecha, servicio, orden pagada).
        // El filtro de usuario (activo/oculto/líder actual) se aplica al final,
        // sobre el asesor mostrado, NO sobre las filas de sus subasesores.
        const rowConds: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        if (from_date) {
            rowConds.push(`ac.created_at >= $${paramIdx++}`);
            params.push(from_date);
        }
        if (to_date) {
            rowConds.push(`ac.created_at <= $${paramIdx++}::date + interval '1 day'`);
            params.push(to_date);
        }
        if (service_type) {
            rowConds.push(`ac.service_type = $${paramIdx++}`);
            params.push(service_type);
        }

        // 🧾 Misma regla que el ledger (getAdvisorCommissionsList): en PO Box solo
        // cuentan comisiones cuya guía tiene una ORDEN DE PAGO registrada y PAGADA
        // (y si es crédito, ya liquidada). Así los montos del board General cuadran
        // con "Comisiones Generadas".
        const PAID_ORDER = `pp_x.status IN ('completed','paid') AND (LOWER(COALESCE(pp_x.payment_method,'')) <> 'credit' OR COALESCE(pp_x.credit_settled,false) = true)`;
        rowConds.push(`(
            ac.service_type <> 'pobox_usa_mx'
            OR EXISTS (SELECT 1 FROM pobox_payments pp_x WHERE pp_x.package_ids @> to_jsonb(ac.shipment_id) AND ${PAID_ORDER})
            OR EXISTS (SELECT 1 FROM pobox_payments pp_x JOIN packages pk ON pk.pobox_payment_id = pp_x.id WHERE pk.id = ac.shipment_id AND ${PAID_ORDER})
            OR EXISTS (SELECT 1 FROM pobox_payments pp_x JOIN packages pk2 ON NULLIF(pk2.payment_reference,'') = pp_x.payment_reference WHERE pk2.id = ac.shipment_id AND ${PAID_ORDER})
        )`);

        const rowWhere = rowConds.length > 0 ? `WHERE ${rowConds.join(' AND ')}` : '';

        // own  = comisión PROPIA del asesor (por sus propias guías, agrupada por advisor_id)
        // ov   = OVERRIDE que gana como LÍDER por las guías de sus subasesores (por leader_id)
        // Se combinan: "comisión por pagar" del líder = propia + override de subs.
        const result = await pool.query(`
            WITH filtered AS (
                SELECT ac.advisor_id, ac.advisor_name, ac.leader_id,
                       ac.commission_amount_mxn, COALESCE(ac.leader_override_amount, 0) AS leader_override_amount,
                       ac.payment_amount_mxn, ac.status, ac.created_at
                  FROM advisor_commissions ac
                  ${rowWhere}
            ),
            own AS (
                SELECT advisor_id,
                       COUNT(*) AS total_count,
                       COALESCE(SUM(payment_amount_mxn), 0) AS total_volume,
                       COALESCE(SUM(commission_amount_mxn), 0) AS own_total,
                       COALESCE(SUM(commission_amount_mxn) FILTER (WHERE status = 'pending'), 0) AS own_pending,
                       COALESCE(SUM(commission_amount_mxn) FILTER (WHERE status = 'paid'), 0) AS own_paid,
                       COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
                       COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
                       MAX(created_at) AS last_commission_at
                  FROM filtered GROUP BY advisor_id
            ),
            ov AS (
                SELECT leader_id AS advisor_id,
                       COALESCE(SUM(leader_override_amount), 0) AS ov_total,
                       COALESCE(SUM(leader_override_amount) FILTER (WHERE status = 'pending'), 0) AS ov_pending,
                       COALESCE(SUM(leader_override_amount) FILTER (WHERE status = 'paid'), 0) AS ov_paid,
                       COUNT(DISTINCT advisor_id) AS sub_count
                  FROM filtered
                 WHERE leader_id IS NOT NULL AND leader_override_amount > 0
                 GROUP BY leader_id
            ),
            ids AS (
                SELECT advisor_id FROM own
                UNION
                SELECT advisor_id FROM ov
            )
            SELECT
                i.advisor_id,
                u.full_name AS advisor_name,
                u.profile_photo_url,
                u.referral_code,
                u.referred_by_id AS leader_id,
                l.full_name AS leader_name,
                COALESCE(o.total_count, 0) AS total_count,
                COALESCE(o.total_volume, 0) AS total_volume,
                COALESCE(o.own_total, 0) AS own_total,
                COALESCE(o.own_pending, 0) AS own_pending,
                COALESCE(o.own_paid, 0) AS own_paid,
                COALESCE(o.pending_count, 0) AS pending_count,
                COALESCE(o.paid_count, 0) AS paid_count,
                o.last_commission_at,
                COALESCE(v.ov_total, 0) AS ov_total,
                COALESCE(v.ov_pending, 0) AS ov_pending,
                COALESCE(v.ov_paid, 0) AS ov_paid,
                COALESCE(v.sub_count, 0) AS sub_count
            FROM ids i
            JOIN users u ON u.id = i.advisor_id
            LEFT JOIN users l ON l.id = u.referred_by_id
            LEFT JOIN own o ON o.advisor_id = i.advisor_id
            LEFT JOIN ov  v ON v.advisor_id = i.advisor_id
            WHERE COALESCE(u.is_active, true) = true
              AND COALESCE(u.hide_from_commission_board, false) = false
            ORDER BY (COALESCE(o.own_total, 0) + COALESCE(v.ov_total, 0)) DESC
        `, params);

        res.json(result.rows.map(r => {
            const ownTotal = parseFloat(r.own_total) || 0;
            const ownPending = parseFloat(r.own_pending) || 0;
            const ownPaid = parseFloat(r.own_paid) || 0;
            const ovTotal = parseFloat(r.ov_total) || 0;
            const ovPending = parseFloat(r.ov_pending) || 0;
            const ovPaid = parseFloat(r.ov_paid) || 0;
            return {
                advisorId: r.advisor_id,
                advisorName: r.advisor_name,
                leaderName: r.leader_name || null,
                leaderId: r.leader_id || null,
                photoUrl: r.profile_photo_url || null,
                referralCode: r.referral_code || null,
                totalCount: parseInt(r.total_count) || 0,
                totalVolume: parseFloat(r.total_volume) || 0,
                // Combinados (propia + override de subasesores) — lo que se le paga
                totalCommission: ownTotal + ovTotal,
                pendingCommission: ownPending + ovPending,
                paidCommission: ownPaid + ovPaid,
                // Desglose
                ownTotal, ownPending, ownPaid,
                overrideTotal: ovTotal,
                overridePending: ovPending,
                overridePaid: ovPaid,
                subCount: parseInt(r.sub_count) || 0,
                pendingCount: parseInt(r.pending_count) || 0,
                paidCount: parseInt(r.paid_count) || 0,
                lastCommissionAt: r.last_commission_at,
            };
        }));
    } catch (error) {
        console.error('Error getting commissions by advisor:', error);
        res.status(500).json({ error: 'Error al obtener comisiones por asesor' });
    }
};

// 14. ADMIN: Backfill - generar comisiones faltantes para pagos históricos
export const runCommissionBackfill = async (req: Request, res: Response): Promise<any> => {
    try {
        const { backfillCommissions } = require('./commissionService');
        const { limit = 500 } = req.query;
        const result = await backfillCommissions(parseInt(limit as string));
        res.json({
            message: 'Backfill completado',
            generated: result.generated,
            skipped: result.skipped,
        });
    } catch (error) {
        console.error('Error running commission backfill:', error);
        res.status(500).json({ error: 'Error al ejecutar backfill' });
    }
};

// ADMIN: Toggle can_recovery flag on advisor
export const toggleAdvisorRecovery = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { can_recovery } = req.body;
        if (typeof can_recovery !== 'boolean') {
            return res.status(400).json({ error: 'can_recovery debe ser boolean' });
        }
        const result = await pool.query(
            `UPDATE users SET can_recovery = $1
             WHERE id = $2 AND role IN ('asesor', 'asesor_lider', 'advisor', 'sub_advisor')
             RETURNING id, full_name, can_recovery`,
            [can_recovery, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Asesor no encontrado' });
        }
        res.json({ ok: true, advisor: result.rows[0] });
    } catch (error) {
        console.error('Error toggling advisor recovery:', error);
        res.status(500).json({ error: 'Error al actualizar permiso' });
    }
};

// Activar / desactivar un asesor (is_active)
export const toggleAdvisorActive = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active debe ser boolean' });
        }
        const result = await pool.query(
            `UPDATE users SET is_active = $1
             WHERE id = $2 AND role IN ('asesor', 'asesor_lider', 'advisor', 'sub_advisor')
             RETURNING id, full_name, is_active`,
            [is_active, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Asesor no encontrado' });
        }
        res.json({ ok: true, advisor: result.rows[0] });
    } catch (error) {
        console.error('Error toggling advisor active:', error);
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
};