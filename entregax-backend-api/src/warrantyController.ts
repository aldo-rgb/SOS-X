import { Request, Response } from 'express';
import { pool } from './db';

interface AuthRequest extends Request {
    user?: { userId: number; role: string };
}

// ============ OBTENER TIPO DE CAMBIO ACTUAL ============
export const getExchangeRate = async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(
            'SELECT rate, created_at FROM exchange_rates ORDER BY created_at DESC LIMIT 1'
        );
        
        if (result.rows.length === 0) {
            res.json({ rate: 20.50, source: 'default' });
            return;
        }
        
        res.json({ 
            rate: parseFloat(result.rows[0].rate), 
            updatedAt: result.rows[0].created_at 
        });
    } catch (error) {
        console.error('Error getting exchange rate:', error);
        res.status(500).json({ error: 'Error al obtener tipo de cambio' });
    }
};

// ============ ACTUALIZAR TIPO DE CAMBIO ============
export const updateExchangeRate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { rate } = req.body;
        
        if (!rate || rate <= 0) {
            res.status(400).json({ error: 'Tipo de cambio inválido' });
            return;
        }
        
        await pool.query(
            'INSERT INTO exchange_rates (rate, source) VALUES ($1, $2)',
            [rate, 'manual']
        );
        
        res.json({ message: 'Tipo de cambio actualizado', rate });
    } catch (error) {
        console.error('Error updating exchange rate:', error);
        res.status(500).json({ error: 'Error al actualizar tipo de cambio' });
    }
};

// ============ OBTENER TARIFAS GEX ============
export const getGexRates = async (): Promise<{ variablePercent: number; fixedFee: number }> => {
    try {
        const result = await pool.query(
            "SELECT percentage, fixed_fee FROM commission_rates WHERE service_type = 'gex_warranty' LIMIT 1"
        );
        if (result.rows.length > 0) {
            return {
                variablePercent: parseFloat(result.rows[0].percentage) / 100, // Convertir a decimal
                fixedFee: parseFloat(result.rows[0].fixed_fee) || 325.00
            };
        }
        // Valores por defecto si no existe
        return { variablePercent: 0.05, fixedFee: 325.00 };
    } catch {
        return { variablePercent: 0.05, fixedFee: 325.00 };
    }
};

// ============ COTIZAR PÓLIZA (SIN GUARDAR) ============
export const quoteWarranty = async (req: Request, res: Response): Promise<void> => {
    try {
        const { invoiceValueUsd } = req.body;
        
        if (!invoiceValueUsd || invoiceValueUsd <= 0) {
            res.status(400).json({ error: 'Valor de factura inválido' });
            return;
        }
        
        // Obtener tipo de cambio actual
        const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
        const fxRate = parseFloat(fxRes.rows[0]?.rate || '20.50');
        
        // Obtener tarifas GEX de la BD
        const gexRates = await getGexRates();
        
        // Cálculos con tarifas configurables
        const insuredValueMxn = invoiceValueUsd * fxRate;
        const variableFee = insuredValueMxn * gexRates.variablePercent;
        const fixedFee = 625.00; // Costo fijo para el cliente
        const totalCost = variableFee + fixedFee;
        
        res.json({
            invoiceValueUsd,
            exchangeRate: fxRate,
            insuredValueMxn: Math.round(insuredValueMxn * 100) / 100,
            variableFeeMxn: Math.round(variableFee * 100) / 100,
            fixedFeeMxn: fixedFee,
            totalCostMxn: Math.round(totalCost * 100) / 100,
            advisorCommission: gexRates.fixedFee // Comisión del asesor configurable
        });
    } catch (error) {
        console.error('Error quoting warranty:', error);
        res.status(500).json({ error: 'Error al cotizar' });
    }
};

// ============ CREAR PÓLIZA (GENERAR FOLIO) ============
export const createWarranty = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { 
            userId, 
            boxCount, 
            volume, 
            invoiceValueUsd, 
            route, 
            description,
            plImageUrl, 
            invoiceImageUrl 
        } = req.body;
        
        const advisorId = req.user?.userId;
        
        if (!userId || !invoiceValueUsd) {
            res.status(400).json({ error: 'Faltan datos requeridos' });
            return;
        }
        
        // Obtener tipo de cambio actual
        const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
        const fxRate = parseFloat(fxRes.rows[0]?.rate || '20.50');
        
        // Obtener tarifas GEX de la BD
        const gexRates = await getGexRates();
        
        // Cálculos con tarifas configurables
        const insuredValueMxn = invoiceValueUsd * fxRate;
        const variableFee = insuredValueMxn * gexRates.variablePercent;
        const fixedFee = 625.00;
        const totalCost = variableFee + fixedFee;
        
        // Obtener siguiente folio GEX
        const seqRes = await pool.query("SELECT nextval('gex_sequence')");
        const nextNum = seqRes.rows[0].nextval;
        const gexFolio = `GEX-${String(nextNum).padStart(4, '0')}`;
        
        // Guardar en BD con comisión configurable
        const newPolicy = await pool.query(
            `INSERT INTO warranties 
            (gex_folio, user_id, advisor_id, box_count, volume, invoice_value_usd, route, description,
             pl_image_url, invoice_image_url, exchange_rate_used, insured_value_mxn, 
             variable_fee_mxn, fixed_fee_mxn, total_cost_mxn, advisor_commission, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'generated') 
             RETURNING *`,
            [gexFolio, userId, advisorId, boxCount, volume, invoiceValueUsd, route, description,
             plImageUrl, invoiceImageUrl, fxRate, insuredValueMxn, variableFee, fixedFee, totalCost, gexRates.fixedFee]
        );
        
        res.status(201).json({ 
            message: 'Póliza Generada', 
            policy: newPolicy.rows[0],
            paymentInfo: {
                totalToPay: totalCost,
                currency: 'MXN'
            }
        });
    } catch (error) {
        console.error('Error creating warranty:', error);
        res.status(500).json({ error: 'Error al generar póliza' });
    }
};

// ============ OBTENER TODAS LAS PÓLIZAS ============
export const getWarranties = async (req: Request, res: Response): Promise<void> => {
    try {
        const { status, advisorId, startDate, endDate } = req.query;
        
        let query = `
            SELECT 
                w.*,
                u.full_name as client_name,
                u.email as client_email,
                u.box_id as client_box_id,
                a.full_name as advisor_name
            FROM warranties w
            LEFT JOIN users u ON w.user_id = u.id
            LEFT JOIN users a ON w.advisor_id = a.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;
        
        if (status) {
            query += ` AND w.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (advisorId) {
            query += ` AND w.advisor_id = $${paramIndex}`;
            params.push(advisorId);
            paramIndex++;
        }
        
        if (startDate) {
            query += ` AND w.created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }
        
        if (endDate) {
            query += ` AND w.created_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }
        
        query += ' ORDER BY w.created_at DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting warranties:', error);
        res.status(500).json({ error: 'Error al obtener pólizas' });
    }
};

// ============ OBTENER PÓLIZA POR ID ============
export const getWarrantyById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                w.*,
                u.full_name as client_name,
                u.email as client_email,
                u.box_id as client_box_id,
                u.phone as client_phone,
                a.full_name as advisor_name,
                a.email as advisor_email
            FROM warranties w
            LEFT JOIN users u ON w.user_id = u.id
            LEFT JOIN users a ON w.advisor_id = a.id
            WHERE w.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Póliza no encontrada' });
            return;
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error getting warranty:', error);
        res.status(500).json({ error: 'Error al obtener póliza' });
    }
};

// ============ ACTIVAR PÓLIZA (REGISTRAR PAGO) ============
export const activateWarranty = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { paymentProofUrl, signedContractUrl } = req.body;
        
        const result = await pool.query(
            `UPDATE warranties 
             SET status = 'active', 
                 payment_proof_url = COALESCE($1, payment_proof_url), 
                 signed_contract_url = COALESCE($2, signed_contract_url), 
                 paid_at = NOW(),
                 activated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [paymentProofUrl, signedContractUrl, id]
        );
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Póliza no encontrada' });
            return;
        }
        
        res.json({ 
            message: '¡Póliza Activada!', 
            policy: result.rows[0] 
        });
    } catch (error) {
        console.error('Error activating warranty:', error);
        res.status(500).json({ error: 'Error al activar póliza' });
    }
};

// ============ RECHAZAR PÓLIZA ============
export const rejectWarranty = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const result = await pool.query(
            `UPDATE warranties 
             SET status = 'rejected', 
                 rejection_reason = $1
             WHERE id = $2
             RETURNING *`,
            [reason, id]
        );
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Póliza no encontrada' });
            return;
        }
        
        res.json({ message: 'Póliza rechazada', policy: result.rows[0] });
    } catch (error) {
        console.error('Error rejecting warranty:', error);
        res.status(500).json({ error: 'Error al rechazar póliza' });
    }
};

// ============ SUBIR DOCUMENTOS A PÓLIZA ============
export const uploadWarrantyDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { documentType, documentUrl } = req.body;
        
        const validTypes = ['pl_image_url', 'invoice_image_url', 'signed_contract_url', 'payment_proof_url'];
        if (!validTypes.includes(documentType)) {
            res.status(400).json({ error: 'Tipo de documento inválido' });
            return;
        }
        
        const result = await pool.query(
            `UPDATE warranties SET ${documentType} = $1 WHERE id = $2 RETURNING *`,
            [documentUrl, id]
        );
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Póliza no encontrada' });
            return;
        }
        
        res.json({ message: 'Documento subido', policy: result.rows[0] });
    } catch (error) {
        console.error('Error uploading document:', error);
        res.status(500).json({ error: 'Error al subir documento' });
    }
};

// ============ RANKING DE ASESORES ============
export const getAdvisorRanking = async (req: Request, res: Response): Promise<void> => {
    try {
        const { startDate, endDate } = req.query;
        
        const ranking = await pool.query(`
            SELECT 
                a.id as advisor_id,
                a.full_name as advisor_name,
                a.email as advisor_email,
                a.referral_code,
                COUNT(w.id) as policies_sold,
                COALESCE(SUM(w.advisor_commission), 0) as total_commission,
                COALESCE(SUM(w.total_cost_mxn), 0) as total_revenue
            FROM users a
            LEFT JOIN warranties w ON w.advisor_id = a.id 
                AND w.status = 'active'
                AND w.created_at BETWEEN $1 AND $2
            WHERE a.role IN ('advisor', 'sub_advisor', 'asesor', 'asesor_lider')
            GROUP BY a.id, a.full_name, a.email, a.referral_code
            ORDER BY policies_sold DESC, total_commission DESC
        `, [startDate || '2020-01-01', endDate || '2030-12-31']);
        
        res.json(ranking.rows);
    } catch (error) {
        console.error('Error getting ranking:', error);
        res.status(500).json({ error: 'Error al obtener ranking' });
    }
};

// ============ REPORTE DE COBRANZA ============
export const getRevenueReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { startDate, endDate, groupBy } = req.query;
        
        // Reporte diario por defecto
        let dateFormat = 'YYYY-MM-DD';
        if (groupBy === 'month') dateFormat = 'YYYY-MM';
        if (groupBy === 'year') dateFormat = 'YYYY';
        
        const report = await pool.query(`
            SELECT 
                TO_CHAR(w.paid_at, $1) as period,
                COUNT(w.id) as policies_count,
                SUM(w.total_cost_mxn) as total_revenue,
                SUM(w.advisor_commission) as total_commissions,
                SUM(w.total_cost_mxn - w.advisor_commission) as net_revenue
            FROM warranties w
            WHERE w.status = 'active'
            AND w.paid_at BETWEEN $2 AND $3
            GROUP BY TO_CHAR(w.paid_at, $1)
            ORDER BY period DESC
        `, [dateFormat, startDate || '2020-01-01', endDate || '2030-12-31']);
        
        // Totales
        const totals = await pool.query(`
            SELECT 
                COUNT(w.id) as total_policies,
                COALESCE(SUM(w.total_cost_mxn), 0) as total_revenue,
                COALESCE(SUM(w.advisor_commission), 0) as total_commissions
            FROM warranties w
            WHERE w.status = 'active'
            AND w.paid_at BETWEEN $1 AND $2
        `, [startDate || '2020-01-01', endDate || '2030-12-31']);
        
        res.json({
            periods: report.rows,
            totals: totals.rows[0]
        });
    } catch (error) {
        console.error('Error getting revenue report:', error);
        res.status(500).json({ error: 'Error al obtener reporte' });
    }
};

// ============ ESTADÍSTICAS GENERALES GEX ============
export const getWarrantyStats = async (_req: Request, res: Response): Promise<void> => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
                COUNT(*) FILTER (WHERE status = 'generated') as generated_count,
                COUNT(*) FILTER (WHERE status = 'active') as active_count,
                COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
                COUNT(*) as total_count,
                COALESCE(SUM(total_cost_mxn) FILTER (WHERE status = 'active'), 0) as total_revenue,
                COALESCE(SUM(advisor_commission) FILTER (WHERE status = 'active'), 0) as total_commissions
            FROM warranties
        `);
        
        // Últimas 5 pólizas
        const recent = await pool.query(`
            SELECT 
                w.gex_folio, w.status, w.total_cost_mxn, w.created_at,
                u.full_name as client_name
            FROM warranties w
            LEFT JOIN users u ON w.user_id = u.id
            ORDER BY w.created_at DESC
            LIMIT 5
        `);
        
        res.json({
            stats: stats.rows[0],
            recentPolicies: recent.rows
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

// ============ BUSCAR CLIENTES PARA SELECT ============
export const searchClients = async (req: Request, res: Response): Promise<void> => {
    try {
        const { query } = req.query;
        
        const result = await pool.query(`
            SELECT id, full_name, email, box_id, phone
            FROM users
            WHERE role = 'cliente' OR role = 'user'
            AND (
                full_name ILIKE $1 
                OR email ILIKE $1 
                OR box_id ILIKE $1
            )
            ORDER BY full_name
            LIMIT 20
        `, [`%${query || ''}%`]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error searching clients:', error);
        res.status(500).json({ error: 'Error al buscar clientes' });
    }
};

// ============ CREAR PÓLIZA POR USUARIO (SELF-SERVICE) ============
export const createWarrantyByUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { 
            packageId,
            serviceType,
            boxCount, 
            weight, 
            invoiceValueUSD, 
            route, 
            description,
            signature,
            paymentOption
        } = req.body;
        
        if (!invoiceValueUSD || invoiceValueUSD <= 0) {
            res.status(400).json({ error: 'Valor de factura inválido' });
            return;
        }
        
        if (!description) {
            res.status(400).json({ error: 'Descripción requerida' });
            return;
        }
        
        if (!signature) {
            res.status(400).json({ error: 'Firma requerida' });
            return;
        }
        
        // Obtener el advisor del usuario (referred_by_id)
        const userRes = await pool.query('SELECT referred_by_id FROM users WHERE id = $1', [userId]);
        const advisorId = userRes.rows[0]?.referred_by_id || null;
        
        // Obtener tipo de cambio actual
        const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
        const fxRate = parseFloat(fxRes.rows[0]?.rate || '20.50');
        
        // Obtener tarifas GEX de la BD
        const gexRates = await getGexRates();
        
        // Cálculos con tarifas configurables
        const insuredValueMxn = invoiceValueUSD * fxRate;
        const variableFee = insuredValueMxn * gexRates.variablePercent;
        const fixedFee = 625.00;
        const totalCost = variableFee + fixedFee;
        
        // Obtener siguiente folio GEX
        const seqRes = await pool.query("SELECT nextval('gex_sequence')");
        const nextNum = seqRes.rows[0].nextval;
        const gexFolio = `GEX-${new Date().getFullYear()}-${String(nextNum).padStart(5, '0')}`;
        
        // Estado inicial según opción de pago
        const initialStatus = paymentOption === 'now' ? 'pending_payment' : 'generated';
        
        // Guardar en BD con comisión configurable
        const newPolicy = await pool.query(
            `INSERT INTO warranties 
            (gex_folio, user_id, advisor_id, box_count, volume, invoice_value_usd, route, description,
             signed_contract_url, exchange_rate_used, insured_value_mxn, 
             variable_fee_mxn, fixed_fee_mxn, total_cost_mxn, advisor_commission, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
             RETURNING *`,
            [gexFolio, userId, advisorId, boxCount, weight, invoiceValueUSD, route, description,
             signature, fxRate, insuredValueMxn, variableFee, fixedFee, totalCost, gexRates.fixedFee, initialStatus]
        );
        
        // Si tiene packageId, actualizar el paquete/orden para indicar que tiene GEX
        if (packageId) {
            // Determinar tipo de servicio
            const isMaritimeOrder = serviceType === 'SEA_CHN_MX' || route?.includes('Marítimo');
            const isChinaAirOrder = serviceType === 'china_air' || route?.includes('Aéreo');
            
            if (isChinaAirOrder) {
                // Actualizar china_receipts (TDI Aéreo China)
                await pool.query(
                    'UPDATE china_receipts SET has_gex = true, gex_folio = $1 WHERE id = $2',
                    [gexFolio, packageId]
                );
                console.log(`✈️🇨🇳 China receipt ${packageId} actualizado con GEX: ${gexFolio}`);
            } else if (isMaritimeOrder) {
                // Actualizar maritime_orders
                await pool.query(
                    'UPDATE maritime_orders SET has_gex = true, gex_folio = $1 WHERE id = $2',
                    [gexFolio, packageId]
                );
                console.log(`📦 Maritime order ${packageId} actualizada con GEX: ${gexFolio}`);
            } else {
                // Actualizar packages (USA)
                await pool.query(
                    'UPDATE packages SET has_gex = true, gex_folio = $1 WHERE id = $2',
                    [gexFolio, packageId]
                );
                console.log(`📦 Package ${packageId} actualizado con GEX: ${gexFolio}`);
            }
        }
        
        res.status(201).json({ 
            success: true,
            message: 'Garantía Extendida contratada exitosamente', 
            warranty: {
                id: newPolicy.rows[0].id,
                folio: gexFolio,
                invoiceValueUSD,
                insuredValueMXN: Math.round(insuredValueMxn * 100) / 100,
                totalCost: Math.round(totalCost * 100) / 100,
                status: initialStatus,
                paymentOption
            }
        });
    } catch (error) {
        console.error('Error creating warranty by user:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        res.status(500).json({ error: 'Error al generar póliza', details: errorMessage });
    }
};

