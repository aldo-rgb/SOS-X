import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// MÓDULO DE PAGOS A PROVEEDORES
// Motor de cálculo financiero Multi-Proveedor
// ============================================

// CONFIGURACIÓN DEFAULT
const DEFAULT_CLIENT_FEE = 6.00; // 6%
const DEFAULT_FIXED_FEE = 25.00; // $25 USD por operación
const DEFAULT_FX_RATE = 20.00; // Fallback

// ========== TIPO DE CAMBIO ==========

// Obtener tipo de cambio actual
export const getCurrentExchangeRate = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(
            'SELECT rate, created_at FROM exchange_rates ORDER BY created_at DESC LIMIT 1'
        );
        
        if (result.rows.length === 0) {
            return res.json({ rate: DEFAULT_FX_RATE, updatedAt: null, isDefault: true });
        }

        res.json({
            rate: parseFloat(result.rows[0].rate),
            updatedAt: result.rows[0].created_at,
            isDefault: false
        });
    } catch (error) {
        console.error('Error getting exchange rate:', error);
        res.status(500).json({ error: 'Error al obtener tipo de cambio' });
    }
};

// Actualizar tipo de cambio (Admin)
export const updateExchangeRate = async (req: Request, res: Response): Promise<any> => {
    try {
        const { rate } = req.body;
        const adminId = (req as any).user?.id;

        if (!rate || rate <= 0) {
            return res.status(400).json({ error: 'Tipo de cambio inválido' });
        }

        const result = await pool.query(
            'INSERT INTO exchange_rates (rate, set_by_admin_id) VALUES ($1, $2) RETURNING *',
            [rate, adminId]
        );

        console.log(`💱 Tipo de cambio actualizado: $${rate} MXN por admin ${adminId}`);

        res.json({ 
            message: 'Tipo de cambio actualizado',
            rate: parseFloat(result.rows[0].rate),
            updatedAt: result.rows[0].created_at
        });
    } catch (error) {
        console.error('Error updating exchange rate:', error);
        res.status(500).json({ error: 'Error al actualizar tipo de cambio' });
    }
};

// Historial de tipos de cambio
export const getExchangeRateHistory = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(
            `SELECT er.*, u.full_name as admin_name 
             FROM exchange_rates er
             LEFT JOIN users u ON er.set_by_admin_id = u.id
             ORDER BY er.created_at DESC
             LIMIT 30`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting exchange rate history:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
};

// ========== PROVEEDORES DE PAGO ==========

// Obtener todos los proveedores
export const getPaymentProviders = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(
            'SELECT * FROM payment_providers ORDER BY name ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting providers:', error);
        res.status(500).json({ error: 'Error al obtener proveedores' });
    }
};

// Crear proveedor
export const createPaymentProvider = async (req: Request, res: Response): Promise<any> => {
    try {
        const { name, base_cost_percent, fixed_fee } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nombre es requerido' });
        }

        const result = await pool.query(
            `INSERT INTO payment_providers (name, base_cost_percent, fixed_fee)
             VALUES ($1, $2, $3) RETURNING *`,
            [name, base_cost_percent || 0, fixed_fee || 0]
        );

        res.status(201).json({ message: 'Proveedor creado', provider: result.rows[0] });
    } catch (error) {
        console.error('Error creating provider:', error);
        res.status(500).json({ error: 'Error al crear proveedor' });
    }
};

// Actualizar proveedor
export const updatePaymentProvider = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id, name, base_cost_percent, fixed_fee, is_active } = req.body;

        const result = await pool.query(
            `UPDATE payment_providers 
             SET name = $1, base_cost_percent = $2, fixed_fee = $3, is_active = $4
             WHERE id = $5 RETURNING *`,
            [name, base_cost_percent, fixed_fee, is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proveedor no encontrado' });
        }

        res.json({ message: 'Proveedor actualizado', provider: result.rows[0] });
    } catch (error) {
        console.error('Error updating provider:', error);
        res.status(500).json({ error: 'Error al actualizar proveedor' });
    }
};

// ========== CONFIGURACIÓN POR CLIENTE ==========

// Obtener configuración de un cliente
export const getClientPaymentSettings = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId } = req.params;

        const result = await pool.query(
            `SELECT cps.*, pp.name as provider_name, pp.base_cost_percent as provider_cost
             FROM client_payment_settings cps
             LEFT JOIN payment_providers pp ON cps.assigned_provider_id = pp.id
             WHERE cps.user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.json({ 
                user_id: parseInt(userId as string),
                advisor_commission_percent: null,
                advisor_profit_share: 0,
                assigned_provider_id: null,
                isDefault: true
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error getting client settings:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
};

// Guardar/actualizar configuración de cliente
export const saveClientPaymentSettings = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, advisor_commission_percent, advisor_profit_share, assigned_provider_id } = req.body;

        const result = await pool.query(
            `INSERT INTO client_payment_settings (user_id, advisor_commission_percent, advisor_profit_share, assigned_provider_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO UPDATE SET
                advisor_commission_percent = $2,
                advisor_profit_share = $3,
                assigned_provider_id = $4
             RETURNING *`,
            [userId, advisor_commission_percent, advisor_profit_share || 0, assigned_provider_id]
        );

        res.json({ message: 'Configuración guardada', settings: result.rows[0] });
    } catch (error) {
        console.error('Error saving client settings:', error);
        res.status(500).json({ error: 'Error al guardar configuración' });
    }
};

// ========== COTIZADOR (La Calculadora) ==========

export const quotePayment = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, amountUsd } = req.body;

        if (!amountUsd || amountUsd <= 0) {
            return res.status(400).json({ error: 'Monto inválido' });
        }

        // A. Obtener Tipo de Cambio Actual
        const fxQuery = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
        const fxRate = fxQuery.rows.length > 0 ? parseFloat(fxQuery.rows[0].rate) : DEFAULT_FX_RATE;

        // B. Obtener Configuración del Cliente y Proveedor
        const settingsQuery = await pool.query(`
            SELECT 
                cps.advisor_commission_percent, 
                cps.advisor_profit_share,
                pp.base_cost_percent as provider_cost_percent,
                pp.fixed_fee as provider_fixed_fee,
                pp.name as provider_name
            FROM client_payment_settings cps
            LEFT JOIN payment_providers pp ON cps.assigned_provider_id = pp.id
            WHERE cps.user_id = $1
        `, [userId]);

        const settings = settingsQuery.rows[0] || {};
        
        // C. DEFINIR VARIABLES DE CÁLCULO
        const clientFeePercent = settings.advisor_commission_percent 
            ? parseFloat(settings.advisor_commission_percent) 
            : DEFAULT_CLIENT_FEE;
        const providerCostPercent = settings.provider_cost_percent 
            ? parseFloat(settings.provider_cost_percent) 
            : 2.0;
        const providerFixedFee = settings.provider_fixed_fee 
            ? parseFloat(settings.provider_fixed_fee) 
            : 0;
        
        // D. MATEMÁTICA FINANCIERA
        // 1. Lo que paga el cliente
        const feeAmount = amountUsd * (clientFeePercent / 100);
        const fixedFee = DEFAULT_FIXED_FEE;
        const totalUsdToPay = amountUsd + feeAmount + fixedFee;
        const totalMxnToPay = totalUsdToPay * fxRate;

        // 2. Desglose de Utilidad (El Pastel)
        const totalRevenue = feeAmount + fixedFee; 
        
        // Costo del Proveedor
        const providerCostAmount = (amountUsd * (providerCostPercent / 100)) + providerFixedFee;

        // Utilidad Bruta (Spread)
        const grossProfit = totalRevenue - providerCostAmount;

        // Reparto Asesor vs Plataforma
        const sharePercent = settings.advisor_profit_share 
            ? parseFloat(settings.advisor_profit_share) 
            : 0;
        const advisorProfit = grossProfit * (sharePercent / 100);
        const platformProfit = grossProfit - advisorProfit;

        res.json({
            quote: {
                amountUsd: parseFloat(amountUsd),
                fxRate,
                breakdown: {
                    percentCharged: clientFeePercent,
                    commission: Math.round(feeAmount * 100) / 100,
                    fixedFee: fixedFee,
                    totalUsd: Math.round(totalUsdToPay * 100) / 100,
                    totalMxn: Math.round(totalMxnToPay * 100) / 100
                },
                provider: settings.provider_name || 'Default',
                // Stats internos (solo para admin/debug)
                internalStats: {
                    providerCost: Math.round(providerCostAmount * 100) / 100,
                    grossProfit: Math.round(grossProfit * 100) / 100,
                    advisorProfit: Math.round(advisorProfit * 100) / 100,
                    platformProfit: Math.round(platformProfit * 100) / 100
                }
            }
        });

    } catch (error) {
        console.error('Error quoting payment:', error);
        res.status(500).json({ error: 'Error al cotizar' });
    }
};

// ========== CREAR SOLICITUD DE PAGO ==========

export const createSupplierPayment = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;
        const { amountUsd, notes } = req.body;

        if (!amountUsd || amountUsd <= 0) {
            return res.status(400).json({ error: 'Monto inválido' });
        }

        // Obtener tipo de cambio
        const fxQuery = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
        const fxRate = fxQuery.rows.length > 0 ? parseFloat(fxQuery.rows[0].rate) : DEFAULT_FX_RATE;

        // Obtener configuración
        const settingsQuery = await pool.query(`
            SELECT 
                cps.advisor_commission_percent, 
                cps.advisor_profit_share,
                cps.assigned_provider_id,
                pp.base_cost_percent,
                pp.fixed_fee as provider_fixed
            FROM client_payment_settings cps
            LEFT JOIN payment_providers pp ON cps.assigned_provider_id = pp.id
            WHERE cps.user_id = $1
        `, [userId]);

        const settings = settingsQuery.rows[0] || {};

        // Calcular montos
        const clientFeePercent = settings.advisor_commission_percent 
            ? parseFloat(settings.advisor_commission_percent) 
            : DEFAULT_CLIENT_FEE;
        const providerCostPercent = settings.base_cost_percent 
            ? parseFloat(settings.base_cost_percent) 
            : 2.0;
        const providerFixed = settings.provider_fixed ? parseFloat(settings.provider_fixed) : 0;

        const feeAmount = amountUsd * (clientFeePercent / 100);
        const fixedFee = DEFAULT_FIXED_FEE;
        const totalUsd = amountUsd + feeAmount + fixedFee;
        const totalMxn = totalUsd * fxRate;

        const providerCost = (amountUsd * (providerCostPercent / 100)) + providerFixed;
        const grossProfit = (feeAmount + fixedFee) - providerCost;
        
        const sharePercent = settings.advisor_profit_share ? parseFloat(settings.advisor_profit_share) : 0;
        const advisorProfit = grossProfit * (sharePercent / 100);
        const platformProfit = grossProfit - advisorProfit;

        // Insertar solicitud
        const result = await pool.query(
            `INSERT INTO supplier_payments 
             (user_id, amount_usd, exchange_rate, client_fee_percent, fixed_fee_charged,
              total_usd, total_mxn, provider_cost, platform_profit, advisor_profit,
              provider_id, notes, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
             RETURNING *`,
            [
                userId, amountUsd, fxRate, clientFeePercent, fixedFee,
                totalUsd, totalMxn, providerCost, platformProfit, advisorProfit,
                settings.assigned_provider_id, notes
            ]
        );

        console.log(`💰 Nueva solicitud de pago #${result.rows[0].id} - $${amountUsd} USD`);

        res.status(201).json({
            message: 'Solicitud de pago creada',
            payment: result.rows[0]
        });

    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({ error: 'Error al crear solicitud' });
    }
};

// ========== GESTIÓN DE SOLICITUDES ==========

// Obtener mis solicitudes (cliente)
export const getMySupplierPayments = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;

        const result = await pool.query(
            `SELECT sp.*, pp.name as provider_name
             FROM supplier_payments sp
             LEFT JOIN payment_providers pp ON sp.provider_id = pp.id
             WHERE sp.user_id = $1
             ORDER BY sp.created_at DESC`,
            [userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error getting payments:', error);
        res.status(500).json({ error: 'Error al obtener solicitudes' });
    }
};

// Admin: Obtener todas las solicitudes
export const getAllSupplierPayments = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status } = req.query;

        let query = `
            SELECT sp.*, pp.name as provider_name, u.full_name as client_name, u.email as client_email
            FROM supplier_payments sp
            LEFT JOIN payment_providers pp ON sp.provider_id = pp.id
            LEFT JOIN users u ON sp.user_id = u.id
        `;

        const params: any[] = [];
        if (status && status !== 'all') {
            query += ' WHERE sp.status = $1';
            params.push(status);
        }

        query += ' ORDER BY sp.created_at DESC LIMIT 100';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting all payments:', error);
        res.status(500).json({ error: 'Error al obtener solicitudes' });
    }
};

// Admin: Actualizar estado de solicitud
export const updateSupplierPaymentStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { paymentId, status, proofUrl } = req.body;

        const validStatuses = ['pending', 'processing', 'paid', 'completed', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }

        const result = await pool.query(
            `UPDATE supplier_payments 
             SET status = $1, proof_url = COALESCE($2, proof_url), updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 RETURNING *`,
            [status, proofUrl, paymentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada' });
        }

        console.log(`📝 Pago #${paymentId} actualizado a: ${status}`);

        res.json({ message: 'Estado actualizado', payment: result.rows[0] });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
};

// Stats para dashboard
export const getSupplierPaymentStats = async (req: Request, res: Response): Promise<any> => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'processing') as processing,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
                COALESCE(SUM(amount_usd) FILTER (WHERE status = 'completed'), 0) as total_usd_completed,
                COALESCE(SUM(platform_profit) FILTER (WHERE status = 'completed'), 0) as total_platform_profit,
                COALESCE(SUM(advisor_profit) FILTER (WHERE status = 'completed'), 0) as total_advisor_profit
            FROM supplier_payments
            WHERE created_at >= NOW() - INTERVAL '30 days'
        `);

        res.json(stats.rows[0]);
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};
