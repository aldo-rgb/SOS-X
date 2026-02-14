// ============================================
// CONTROLADOR DE RECEPCIÓN CHINA (TDI Aéreo)
// Procesa datos del sistema externo chino
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// INTERFACES DEL JSON DE LA API CHINA
interface ChinaApiPayload {
    fno: string;           // "AIR2609..." - Identificador único del envío
    shippingMark: string;  // "S3019" - Código del cliente
    totalQty: number;      // Total de cajas
    totalWeight: number;   // Peso total en kg
    totalVolume: number;   // Volumen total
    totalCbm: number;      // CBM total
    file: string[];        // Array de URLs de fotos/evidencias
    data: ChinaPackageData[]; // Array de cajas individuales
}

interface ChinaPackageData {
    childNo: string;       // "AIR2609...-001" - ID único de la caja
    trajecotryName: string; // Nombre de la trayectoria (typo en API original)
    weight: number;
    long: number;          // Largo en cm
    width: number;         // Ancho en cm
    height: number;        // Alto en cm
    proName: string;       // Descripción del producto
    customsBno: string;    // Código aduanal
    singleVolume: number;
    singleCbm: number;
    billNo?: string | null; // Guía aérea internacional (puede venir después)
    etd?: string | null;    // Fecha estimada de salida
    eta?: string | null;    // Fecha estimada de llegada
}

// ============================================
// WEBHOOK: Recibir datos de China
// POST /api/china/receive
// ============================================
export const receiveFromChina = async (req: Request, res: Response): Promise<any> => {
    const client = await pool.connect();
    
    try {
        const payload: ChinaApiPayload = req.body;
        console.log("📦 Recibiendo FNO:", payload.fno, "- ShippingMark:", payload.shippingMark);

        await client.query('BEGIN');

        // 1. IDENTIFICAR CLIENTE por Shipping Mark
        // Buscamos si existe un usuario con ese box_id o algún campo de identificación
        const userCheck = await client.query(
            `SELECT id, full_name FROM users WHERE box_id = $1 OR box_id ILIKE $2`,
            [payload.shippingMark, `%${payload.shippingMark}%`]
        );
        
        const userId = userCheck.rows.length > 0 ? userCheck.rows[0].id : null;
        const userName = userCheck.rows.length > 0 ? userCheck.rows[0].full_name : 'Sin asignar';
        
        console.log(`  → Cliente identificado: ${userName} (ID: ${userId || 'N/A'})`);

        // 2. INSERTAR O ACTUALIZAR RECIBO CHINA (FNO)
        const receiptQuery = await client.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_volume, total_cbm, evidence_urls)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (fno) DO UPDATE SET
                total_qty = EXCLUDED.total_qty,
                total_weight = EXCLUDED.total_weight,
                total_volume = EXCLUDED.total_volume,
                total_cbm = EXCLUDED.total_cbm,
                evidence_urls = EXCLUDED.evidence_urls,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            payload.fno,
            userId,
            payload.shippingMark,
            payload.totalQty,
            payload.totalWeight,
            payload.totalVolume,
            payload.totalCbm,
            payload.file || []
        ]);

        const receiptId = receiptQuery.rows[0].id;
        console.log(`  → Recibo ID: ${receiptId}`);

        // 3. PROCESAR CAJAS INDIVIDUALES (data)
        let packagesCreated = 0;
        let packagesUpdated = 0;

        for (const item of payload.data) {
            // Verificar si la caja ya existe
            const existingPkg = await client.query(
                'SELECT id FROM packages WHERE child_no = $1',
                [item.childNo]
            );

            if (existingPkg.rows.length > 0) {
                // ACTUALIZAR caja existente (ej: cuando llega el billNo)
                await client.query(`
                    UPDATE packages SET
                        international_tracking = COALESCE($1, international_tracking),
                        weight = $2,
                        pro_name = $3,
                        customs_bno = $4,
                        etd = $5,
                        eta = $6,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE child_no = $7
                `, [
                    item.billNo || null,
                    item.weight,
                    item.proName,
                    item.customsBno,
                    item.etd || null,
                    item.eta || null,
                    item.childNo
                ]);
                packagesUpdated++;
            } else {
                // CREAR nueva caja
                const trackingInternal = `CN-${item.childNo.slice(-8)}`;
                const dimensions = `${item.long}x${item.width}x${item.height}`;
                
                await client.query(`
                    INSERT INTO packages 
                    (tracking_internal, child_no, china_receipt_id, user_id, 
                     weight, dimensions, long_cm, width_cm, height_cm,
                     description, pro_name, customs_bno, trajectory_name,
                     single_volume, single_cbm, international_tracking,
                     etd, eta, service_type, warehouse_location, status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                `, [
                    trackingInternal,
                    item.childNo,
                    receiptId,
                    userId,
                    item.weight,
                    dimensions,
                    item.long,
                    item.width,
                    item.height,
                    item.proName,
                    item.proName,
                    item.customsBno,
                    item.trajecotryName,
                    item.singleVolume,
                    item.singleCbm,
                    item.billNo || null,
                    item.etd || null,
                    item.eta || null,
                    'AIR_CHN_MX',
                    'china_air',
                    'received_china'
                ]);
                packagesCreated++;
            }
        }

        await client.query('COMMIT');

        console.log(`  ✅ FNO ${payload.fno}: ${packagesCreated} cajas creadas, ${packagesUpdated} actualizadas`);

        res.json({
            success: true,
            message: 'Datos de China procesados correctamente',
            data: {
                fno: payload.fno,
                receiptId,
                userId,
                packagesCreated,
                packagesUpdated
            }
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("❌ Error API China:", error);
        res.status(500).json({ 
            success: false, 
            error: 'Error procesando datos de China',
            details: error.message 
        });
    } finally {
        client.release();
    }
};

// ============================================
// GET: Listar recepciones de China
// GET /api/china/receipts
// ============================================
export const getChinaReceipts = async (req: Request, res: Response): Promise<any> => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT 
                cr.*,
                u.full_name as client_name,
                u.box_id as client_box_id,
                (SELECT COUNT(*) FROM packages WHERE china_receipt_id = cr.id) as package_count
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
        `;
        const params: any[] = [];
        
        if (status) {
            query += ` WHERE cr.status = $1`;
            params.push(status);
        }

        query += ` ORDER BY cr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            receipts: result.rows,
            total: result.rowCount
        });

    } catch (error: any) {
        console.error("Error obteniendo recepciones China:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// POST: Crear recepción manual
// POST /api/china/receipts
// ============================================
export const createChinaReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const { fno, shipping_mark, total_qty, total_weight, total_cbm, notes } = req.body;

        if (!fno || !shipping_mark) {
            return res.status(400).json({ 
                success: false, 
                error: 'FNO y Shipping Mark son requeridos' 
            });
        }

        // Verificar si ya existe
        const existing = await pool.query('SELECT id FROM china_receipts WHERE fno = $1', [fno]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ 
                success: false, 
                error: 'Ya existe una recepción con ese FNO' 
            });
        }

        // Buscar cliente por shipping_mark (box_id)
        const clientResult = await pool.query(
            'SELECT id FROM users WHERE box_id ILIKE $1 LIMIT 1',
            [shipping_mark]
        );
        const userId = clientResult.rows.length > 0 ? clientResult.rows[0].id : null;

        // Insertar recepción
        const result = await pool.query(`
            INSERT INTO china_receipts 
            (fno, user_id, shipping_mark, total_qty, total_weight, total_cbm, notes, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'received_origin')
            RETURNING *
        `, [fno, userId, shipping_mark, total_qty || 1, total_weight || 0, total_cbm || 0, notes || 'Captura manual']);

        console.log(`✅ Recepción manual creada: ${fno} por usuario admin`);

        res.status(201).json({
            success: true,
            receipt: result.rows[0],
            message: 'Recepción creada exitosamente'
        });

    } catch (error: any) {
        console.error("Error creando recepción China:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Detalle de un recibo con sus cajas
// GET /api/china/receipts/:id
// ============================================
export const getChinaReceiptDetail = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // Obtener el recibo
        const receiptResult = await pool.query(`
            SELECT 
                cr.*,
                u.full_name as client_name,
                u.email as client_email,
                u.box_id as client_box_id
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            WHERE cr.id = $1
        `, [id]);

        if (receiptResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Recibo no encontrado' });
        }

        // Obtener las cajas
        const packagesResult = await pool.query(`
            SELECT 
                id, tracking_internal, child_no, weight, dimensions,
                pro_name, customs_bno, trajectory_name,
                single_volume, single_cbm, international_tracking,
                etd, eta, status, created_at
            FROM packages 
            WHERE china_receipt_id = $1
            ORDER BY child_no
        `, [id]);

        res.json({
            success: true,
            receipt: receiptResult.rows[0],
            packages: packagesResult.rows
        });

    } catch (error: any) {
        console.error("Error obteniendo detalle:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// PUT: Actualizar estado de recibo
// PUT /api/china/receipts/:id/status
// ============================================
export const updateChinaReceiptStatus = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { status, notes, internationalTracking } = req.body;

        await pool.query(`
            UPDATE china_receipts SET
                status = COALESCE($1, status),
                notes = COALESCE($2, notes),
                international_tracking = COALESCE($3, international_tracking),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [status, notes, internationalTracking, id]);

        // Si el status cambia, actualizar también las cajas
        if (status) {
            const packageStatus = status === 'in_transit' ? 'in_transit_international' : status;
            await pool.query(`
                UPDATE packages SET status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE china_receipt_id = $2
            `, [packageStatus, id]);
        }

        res.json({ success: true, message: 'Recibo actualizado' });

    } catch (error: any) {
        console.error("Error actualizando recibo:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// POST: Asignar cliente a recibo huérfano
// POST /api/china/receipts/:id/assign
// ============================================
export const assignClientToReceipt = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        // Actualizar recibo
        await pool.query(`
            UPDATE china_receipts SET user_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [userId, id]);

        // Actualizar cajas
        await pool.query(`
            UPDATE packages SET user_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE china_receipt_id = $2
        `, [userId, id]);

        res.json({ success: true, message: 'Cliente asignado correctamente' });

    } catch (error: any) {
        console.error("Error asignando cliente:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================
// GET: Estadísticas del panel China
// GET /api/china/stats
// ============================================
export const getChinaStats = async (req: Request, res: Response): Promise<any> => {
    try {
        // Recepciones por estado
        const statusStats = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM china_receipts 
            GROUP BY status
        `);

        // Total cajas hoy
        const todayPackages = await pool.query(`
            SELECT COUNT(*) as count 
            FROM packages 
            WHERE warehouse_location = 'china_air' 
            AND DATE(created_at) = CURRENT_DATE
        `);

        // Recepciones sin asignar
        const unassigned = await pool.query(`
            SELECT COUNT(*) as count 
            FROM china_receipts 
            WHERE user_id IS NULL
        `);

        // Pendientes de guía aérea
        const pendingBillNo = await pool.query(`
            SELECT COUNT(*) as count 
            FROM china_receipts 
            WHERE international_tracking IS NULL 
            AND status = 'received_origin'
        `);

        res.json({
            success: true,
            stats: {
                byStatus: statusStats.rows,
                todayPackages: parseInt(todayPackages.rows[0].count),
                unassignedReceipts: parseInt(unassigned.rows[0].count),
                pendingBillNo: parseInt(pendingBillNo.rows[0].count)
            }
        });

    } catch (error: any) {
        console.error("Error obteniendo stats:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
