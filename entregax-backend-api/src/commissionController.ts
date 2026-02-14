import { Request, Response } from 'express';
import { pool } from './db';

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
        
        const result = await pool.query(
            'SELECT id, full_name, role FROM users WHERE referral_code = $1',
            [code.toUpperCase()]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ valid: false, message: 'Código de referido no encontrado' });
        }
        
        const advisor = result.rows[0];
        res.json({
            valid: true,
            advisor: {
                name: advisor.full_name,
                role: advisor.role
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
        // Total de asesores con referidos
        const advisorsResult = await pool.query(`
            SELECT COUNT(DISTINCT referred_by_id) as total_advisors
            FROM users 
            WHERE referred_by_id IS NOT NULL
        `);
        
        // Total de clientes referidos
        const referredResult = await pool.query(`
            SELECT COUNT(*) as total_referred
            FROM users 
            WHERE referred_by_id IS NOT NULL
        `);
        
        // Top asesores
        const topAdvisors = await pool.query(`
            SELECT 
                a.id,
                a.full_name,
                a.referral_code,
                COUNT(r.id) as referral_count
            FROM users a
            JOIN users r ON r.referred_by_id = a.id
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
        const result = await pool.query(`
            SELECT 
                u.id, 
                u.full_name, 
                u.email, 
                u.referral_code,
                u.role,
                u.referred_by_id as leader_id,
                l.full_name as leader_name,
                u.created_at,
                COALESCE(
                    (SELECT COUNT(*) FROM users r WHERE r.referred_by_id = u.id),
                    0
                )::int as referral_count
            FROM users u
            LEFT JOIN users l ON u.referred_by_id = l.id
            WHERE u.role IN ('asesor', 'asesor_lider', 'advisor', 'sub_advisor')
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
        const { full_name, email, password, role, leader_id } = req.body;
        
        console.log('Creating advisor:', { full_name, email, role, leader_id });
        
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
        
        // Generar box_id para el asesor
        const prefix = 'ETX';
        const random = Math.floor(1000 + Math.random() * 9000);
        const boxId = `${prefix}-${random}`;
        
        // Hash de contraseña
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Crear usuario
        const result = await pool.query(`
            INSERT INTO users (full_name, email, password, role, referral_code, referred_by_id, box_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING id, full_name, email, role, referral_code, box_id
        `, [full_name, email.toLowerCase(), hashedPassword, mappedRole, referralCode, leader_id || null, boxId]);
        
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
