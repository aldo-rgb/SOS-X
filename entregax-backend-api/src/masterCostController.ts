// ============================================
// CONTROLADOR DE COSTEO - MASTER AIR WAYBILLS
// Panel de Costeo TDI Aéreo China
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// 1. BUSCAR GUÍA (GET /api/master-cost/:awb)
// ============================================
export const getMasterAwbData = async (req: Request, res: Response): Promise<void> => {
    try {
        const { awb } = req.params;

        // A. Buscar si ya existe la Master creada manualmente
        const masterRes = await pool.query(
            'SELECT * FROM master_air_waybills WHERE master_awb_number = $1',
            [awb]
        );
        const masterData = masterRes.rows[0] || null;

        // B. Buscar paquetes que tengan este "international_tracking" (billNo) 
        // traído por la API China y sumar sus pesos para pre-llenar la información
        const packagesRes = await pool.query(`
            SELECT 
                id, 
                tracking_internal, 
                weight, 
                international_tracking,
                description,
                user_id,
                assigned_cost_mxn,
                shipping_cost
            FROM packages 
            WHERE international_tracking = $1 OR international_tracking ILIKE $2
        `, [awb, `%${awb}%`]);

        const packages = packagesRes.rows;
        const calculatedWeight = packages.reduce((sum, p) => sum + Number(p.weight || 0), 0);
        const calculatedBoxes = packages.length;

        res.json({
            success: true,
            exists: !!masterData,
            data: masterData || {
                master_awb_number: awb,
                total_weight_kg: calculatedWeight,
                total_boxes: calculatedBoxes,
                airline: '',
                destination: 'México',
                creation_date: new Date().toISOString().split('T')[0],
                freight_price_per_kg: null,
                clearance_cost_base: null,
                custody_fee: null,
                aa_expenses_fee: null,
                additional_expenses: null,
            },
            linkedPackages: packages
        });
    } catch (error) {
        console.error('Error getMasterAwbData:', error);
        res.status(500).json({ error: 'Error al buscar la guía' });
    }
};

// ============================================
// 2. GUARDAR Y CALCULAR (POST /api/master-cost)
// ============================================
export const saveMasterCost = async (req: Request, res: Response): Promise<void> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const body = req.body;

        // --- LAS FÓRMULAS MATEMÁTICAS ---
        const totalKg = parseFloat(body.total_weight_kg) || 0;

        // Inputs
        const freightUnit = parseFloat(body.freight_price_per_kg) || 0;
        const clearanceUnitBase = parseFloat(body.clearance_cost_base) || 0;
        const custody = parseFloat(body.custody_fee) || 0;
        const aaExpenses = parseFloat(body.aa_expenses_fee) || 0;
        const additional = parseFloat(body.additional_expenses) || 0;

        // A. Costo de liberación total por kilo
        // Fórmula: ( (KG * CostoLibBase) + Custodia + AA + Adicionales ) / Total KG
        const liberationSubtotal = (totalKg * clearanceUnitBase) + custody + aaExpenses + additional;
        const calcClearanceTotalPerKg = totalKg > 0 ? (liberationSubtotal / totalKg) : 0;

        // B. Precio por kilo Total
        // Fórmula: Precio/kilo (origen) + Precio de liberacion total por kilo
        const calcFinalPricePerKg = freightUnit + calcClearanceTotalPerKg;

        // C. Total Automático
        // Fórmula: Cantidad de Kilos X Precio Final Por Kilo
        const calcGrandTotal = totalKg * calcFinalPricePerKg;

        // --- VALIDACIÓN DE COMPLETITUD ---
        // Verificamos si todos los campos obligatorios tienen valor > 0
        const isComplete = (
            freightUnit > 0 && 
            clearanceUnitBase > 0 && 
            totalKg > 0
        );
        const status = isComplete ? 'completed' : 'pending_cost';

        // --- UPSERT (INSERT O UPDATE) ---
        const query = `
            INSERT INTO master_air_waybills (
                master_awb_number, airline, creation_date, origin, destination,
                total_boxes, total_weight_kg,
                freight_price_per_kg, clearance_cost_base, custody_fee, aa_expenses_fee, additional_expenses,
                calc_clearance_total_per_kg, calc_final_price_per_kg, calc_grand_total,
                pdf_awb_url, pdf_aa_expenses_url, pdf_custody_url,
                is_fully_costed, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            ON CONFLICT (master_awb_number) DO UPDATE SET
                airline = EXCLUDED.airline,
                total_boxes = EXCLUDED.total_boxes,
                total_weight_kg = EXCLUDED.total_weight_kg,
                freight_price_per_kg = EXCLUDED.freight_price_per_kg,
                clearance_cost_base = EXCLUDED.clearance_cost_base,
                custody_fee = EXCLUDED.custody_fee,
                aa_expenses_fee = EXCLUDED.aa_expenses_fee,
                additional_expenses = EXCLUDED.additional_expenses,
                calc_clearance_total_per_kg = EXCLUDED.calc_clearance_total_per_kg,
                calc_final_price_per_kg = EXCLUDED.calc_final_price_per_kg,
                calc_grand_total = EXCLUDED.calc_grand_total,
                pdf_awb_url = EXCLUDED.pdf_awb_url,
                pdf_aa_expenses_url = EXCLUDED.pdf_aa_expenses_url,
                pdf_custody_url = EXCLUDED.pdf_custody_url,
                is_fully_costed = EXCLUDED.is_fully_costed,
                status = EXCLUDED.status
            RETURNING id;
        `;

        const values = [
            body.master_awb_number,
            body.airline || null,
            body.creation_date || new Date().toISOString().split('T')[0],
            'China',
            body.destination || 'México',
            body.total_boxes || 0,
            totalKg,
            freightUnit || null,
            clearanceUnitBase || null,
            custody || null,
            aaExpenses || null,
            additional || null,
            calcClearanceTotalPerKg,
            calcFinalPricePerKg,
            calcGrandTotal,
            body.pdf_awb_url || null,
            body.pdf_aa_expenses_url || null,
            body.pdf_custody_url || null,
            isComplete,
            status
        ];

        const resDb = await client.query(query, values);
        const masterId = resDb.rows[0].id;

        // --- DISTRIBUCIÓN DE COSTOS (Solo si está completo) ---
        // Aquí asignamos el costo a cada paquete individual
        let packagesUpdated = 0;
        if (isComplete) {
            const updateRes = await client.query(`
                UPDATE packages 
                SET 
                    assigned_cost_mxn = weight * $1,
                    master_awb_id = $2
                WHERE international_tracking = $3 OR international_tracking ILIKE $4
            `, [calcFinalPricePerKg, masterId, body.master_awb_number, `%${body.master_awb_number}%`]);
            packagesUpdated = updateRes.rowCount || 0;
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: isComplete
                ? `Costos guardados y DISTRIBUIDOS ✅ (${packagesUpdated} paquetes actualizados)`
                : 'Avance guardado (Pendiente de completar) 💾',
            masterId,
            isComplete,
            calculations: {
                clearanceTotalPerKg: calcClearanceTotalPerKg,
                finalPricePerKg: calcFinalPricePerKg,
                grandTotal: calcGrandTotal
            },
            packagesUpdated
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saveMasterCost:', error);
        res.status(500).json({ error: 'Error al guardar costos' });
    } finally {
        client.release();
    }
};

// ============================================
// 3. LISTAR TODAS LAS GUÍAS (GET /api/master-cost)
// ============================================
export const listMasterAwbs = async (req: Request, res: Response): Promise<void> => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT 
                m.*,
                (SELECT COUNT(*) FROM packages p WHERE p.international_tracking = m.master_awb_number) as package_count
            FROM master_air_waybills m
        `;

        const params: (string | number)[] = [];
        if (status) {
            query += ' WHERE m.status = $1';
            params.push(status as string);
        }

        query += ' ORDER BY m.created_at DESC';
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Number(limit), Number(offset));

        const result = await pool.query(query, params);

        // Contar totales
        const countQuery = status
            ? 'SELECT COUNT(*) FROM master_air_waybills WHERE status = $1'
            : 'SELECT COUNT(*) FROM master_air_waybills';
        const countRes = await pool.query(countQuery, status ? [status] : []);

        res.json({
            success: true,
            data: result.rows,
            total: parseInt(countRes.rows[0].count),
            limit: Number(limit),
            offset: Number(offset)
        });
    } catch (error) {
        console.error('Error listMasterAwbs:', error);
        res.status(500).json({ error: 'Error al listar guías' });
    }
};

// ============================================
// 4. ELIMINAR GUÍA (DELETE /api/master-cost/:id)
// ============================================
export const deleteMasterAwb = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Primero quitar referencia de los paquetes
        await pool.query(
            'UPDATE packages SET master_awb_id = NULL, assigned_cost_mxn = NULL WHERE master_awb_id = $1',
            [id]
        );

        // Luego eliminar la guía
        await pool.query('DELETE FROM master_air_waybills WHERE id = $1', [id]);

        res.json({ success: true, message: 'Guía eliminada correctamente' });
    } catch (error) {
        console.error('Error deleteMasterAwb:', error);
        res.status(500).json({ error: 'Error al eliminar guía' });
    }
};

// ============================================
// 5. ESTADÍSTICAS (GET /api/master-cost/stats)
// Incluye guías de china_receipts
// ============================================
export const getMasterAwbStats = async (req: Request, res: Response): Promise<void> => {
    try {
        // Estadísticas de Master AWB (guías master creadas manualmente)
        const masterStats = await pool.query(`
            SELECT 
                COUNT(*) as total_guides,
                COUNT(*) FILTER (WHERE status = 'pending_cost') as pending_count,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
                COALESCE(SUM(calc_grand_total) FILTER (WHERE status = 'completed'), 0) as total_cost,
                COALESCE(SUM(total_weight_kg), 0) as total_weight
            FROM master_air_waybills
        `);

        // Estadísticas de china_receipts (guías TDI Aéreo China)
        const chinaStats = await pool.query(`
            SELECT 
                COUNT(*) as total_guides,
                COUNT(*) FILTER (WHERE status IN ('received_origin', 'pending_cost')) as pending_count,
                COUNT(*) FILTER (WHERE status NOT IN ('received_origin', 'pending_cost')) as completed_count,
                COALESCE(SUM(assigned_cost_mxn), 0) as total_cost,
                COALESCE(SUM(total_weight), 0) as total_weight
            FROM china_receipts
        `);

        // Combinar estadísticas
        const combinedStats = {
            total_guides: parseInt(masterStats.rows[0]?.total_guides || 0) + parseInt(chinaStats.rows[0]?.total_guides || 0),
            pending_count: parseInt(masterStats.rows[0]?.pending_count || 0) + parseInt(chinaStats.rows[0]?.pending_count || 0),
            completed_count: parseInt(masterStats.rows[0]?.completed_count || 0) + parseInt(chinaStats.rows[0]?.completed_count || 0),
            total_cost: parseFloat(masterStats.rows[0]?.total_cost || 0) + parseFloat(chinaStats.rows[0]?.total_cost || 0),
            total_weight: parseFloat(masterStats.rows[0]?.total_weight || 0) + parseFloat(chinaStats.rows[0]?.total_weight || 0)
        };

        res.json({
            success: true,
            stats: combinedStats
        });
    } catch (error) {
        console.error('Error getMasterAwbStats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

// ============================================
// 5.1 LISTAR GUÍAS TDI AÉREO (GET /api/master-cost/china-receipts)
// ============================================
export const getChinaReceiptsList = async (req: Request, res: Response): Promise<void> => {
    try {
        const { limit = 50, status } = req.query;
        
        let whereClause = '';
        const params: any[] = [limit];
        
        if (status && status !== 'all') {
            whereClause = 'WHERE cr.status = $2';
            params.push(status);
        }

        const result = await pool.query(`
            SELECT 
                cr.id,
                cr.fno as tracking,
                cr.shipping_mark,
                cr.total_qty as total_boxes,
                cr.total_weight as total_weight_kg,
                cr.total_cbm,
                cr.status,
                cr.assigned_cost_mxn,
                cr.created_at,
                cr.updated_at,
                u.full_name as client_name,
                u.box_id as client_box_id
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            ${whereClause}
            ORDER BY cr.created_at DESC
            LIMIT $1
        `, params);

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error getChinaReceiptsList:', error);
        res.status(500).json({ error: 'Error al obtener lista de guías' });
    }
};

// ============================================
// 6. REPORTE DE UTILIDAD (GET /api/master-cost/profit-report)
// ============================================
export const getProfitReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { startDate, endDate, limit = 100 } = req.query;

        let query = `
            SELECT 
                m.id,
                m.master_awb_number,
                m.creation_date,
                m.airline,
                m.total_boxes,
                m.total_weight_kg,
                m.calc_grand_total as costo_total_operativo,
                COALESCE(SUM(p.assigned_cost_mxn), 0) as venta_total,
                (COALESCE(SUM(p.assigned_cost_mxn), 0) - m.calc_grand_total) as utilidad_mxn,
                CASE WHEN m.calc_grand_total > 0 THEN 
                    ROUND(((COALESCE(SUM(p.assigned_cost_mxn), 0) - m.calc_grand_total) / m.calc_grand_total) * 100, 2)
                ELSE 0 END as margen_porcentaje,
                COUNT(p.id) as packages_linked
            FROM master_air_waybills m
            LEFT JOIN packages p ON p.international_tracking = m.master_awb_number
            WHERE m.status = 'completed'
        `;

        const params: (string | number)[] = [];
        if (startDate && endDate) {
            query += ` AND m.creation_date BETWEEN $1 AND $2`;
            params.push(startDate as string, endDate as string);
        }

        query += ' GROUP BY m.id ORDER BY m.creation_date DESC';
        query += ` LIMIT $${params.length + 1}`;
        params.push(Number(limit));

        const result = await pool.query(query, params);

        // Totales
        const totals = result.rows.reduce((acc, row) => {
            acc.totalCost += parseFloat(row.costo_total_operativo) || 0;
            acc.totalSales += parseFloat(row.venta_total) || 0;
            acc.totalProfit += parseFloat(row.utilidad_mxn) || 0;
            return acc;
        }, { totalCost: 0, totalSales: 0, totalProfit: 0 });

        res.json({
            success: true,
            data: result.rows,
            totals: {
                ...totals,
                avgMargin: totals.totalCost > 0 
                    ? ((totals.totalProfit / totals.totalCost) * 100).toFixed(2) 
                    : 0
            }
        });
    } catch (error) {
        console.error('Error getProfitReport:', error);
        res.status(500).json({ error: 'Error al generar reporte' });
    }
};
