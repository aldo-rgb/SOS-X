// ============================================
// CONTROLADOR DE COSTEO AIR WAYBILL
// Modal de costeo estilo marítimo para AWBs
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

// ============================================
// 1. LISTAR AWB COSTS (GET /api/awb-costs)
// ============================================
export const listAwbCosts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (status && status !== 'all') {
      whereClause += ` AND ac.status = $${paramIdx++}`;
      params.push(status as string);
    }

    if (search) {
      whereClause += ` AND (ac.awb_number ILIKE $${paramIdx} OR ac.carrier ILIKE $${paramIdx} OR ac.shipper_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM air_waybill_costs ac ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count);

    const dataQuery = `
      SELECT 
        ac.*,
        (SELECT COUNT(*) FROM packages p WHERE p.awb_cost_id = ac.id) as packages_s_count,
        (SELECT COUNT(*) FROM cajo_guides cg WHERE cg.mawb = ac.awb_number) as packages_cajo_count
      FROM air_waybill_costs ac
      ${whereClause}
      ORDER BY ac.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(Number(limit), Number(offset));

    const result = await pool.query(dataQuery, params);

    res.json({
      success: true,
      data: result.rows,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error: any) {
    console.error('✈️ [AWB-COST] Error listando:', error.message);
    res.status(500).json({ error: 'Error al listar costos AWB' });
  }
};

// ============================================
// 2. DETALLE AWB COST (GET /api/awb-costs/:id)
// ============================================
export const getAwbCostDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const costRes = await pool.query('SELECT * FROM air_waybill_costs WHERE id = $1', [id]);
    if (costRes.rows.length === 0) {
      res.status(404).json({ error: 'Registro de costeo no encontrado' });
      return;
    }

    const awbCost = costRes.rows[0];

    // Paquetes S vinculados
    const packagesS = await pool.query(`
      SELECT id, tracking_internal, weight, description, user_id, assigned_cost_mxn, status,
             child_no, international_tracking
      FROM packages 
      WHERE awb_cost_id = $1 OR international_tracking = $2
      ORDER BY tracking_internal
    `, [id, awbCost.awb_number]);

    // Guías CAJO vinculadas
    const cajoGuides = await pool.query(`
      SELECT * FROM cajo_guides 
      WHERE mawb = $1 
      ORDER BY cliente, guia_air
    `, [awbCost.awb_number]);

    // Draft info
    let draftInfo = null;
    if (awbCost.awb_draft_id) {
      const draftRes = await pool.query(`
        SELECT id, awb_number, from_email, subject, confidence, 
               awb_pdf_url, packing_list_excel_url, extracted_data,
               pieces as draft_pieces, gross_weight_kg as draft_weight
        FROM air_reception_drafts 
        WHERE id = $1
      `, [awbCost.awb_draft_id]);
      draftInfo = draftRes.rows[0] || null;
    }

    res.json({
      success: true,
      cost: awbCost,
      packagesS: packagesS.rows,
      cajoGuides: cajoGuides.rows,
      draftInfo,
    });
  } catch (error: any) {
    console.error('✈️ [AWB-COST] Error detalle:', error.message);
    res.status(500).json({ error: 'Error al obtener detalle de costeo' });
  }
};

// ============================================
// 3. GUARDAR COSTOS AWB (PUT /api/awb-costs/:id)
// ============================================
export const saveAwbCosts = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const body = req.body;

    // Calcular totales
    const freightCost = parseFloat(body.freight_cost) || 0;
    const originHandling = parseFloat(body.origin_handling) || 0;
    const customsClearance = parseFloat(body.customs_clearance) || 0;
    const custodyFee = parseFloat(body.custody_fee) || 0;
    const aaExpenses = parseFloat(body.aa_expenses) || 0;
    const storageFee = parseFloat(body.storage_fee) || 0;
    const transportCost = parseFloat(body.transport_cost) || 0;
    const otherCost = parseFloat(body.other_cost) || 0;

    const calcTotalOrigin = freightCost + originHandling;
    const calcTotalRelease = customsClearance + custodyFee + aaExpenses + storageFee;
    const calcTotalLogistics = transportCost + otherCost;
    const calcGrandTotal = calcTotalOrigin + calcTotalRelease + calcTotalLogistics;

    const grossWeightKg = parseFloat(body.gross_weight_kg) || 0;
    const calcCostPerKg = grossWeightKg > 0 ? (calcGrandTotal / grossWeightKg) : 0;

    // Verificar completitud
    const isFullyCosted = (
      freightCost > 0 &&
      customsClearance > 0 &&
      grossWeightKg > 0
    );
    const status = isFullyCosted ? 'costed' : 'pending';

    const result = await client.query(`
      UPDATE air_waybill_costs SET
        freight_cost = $1,
        freight_cost_pdf = $2,
        origin_handling = $3,
        origin_handling_pdf = $4,
        customs_clearance = $5,
        customs_clearance_pdf = $6,
        custody_fee = $7,
        custody_fee_pdf = $8,
        aa_expenses = $9,
        aa_expenses_pdf = $10,
        storage_fee = $11,
        storage_fee_pdf = $12,
        transport_cost = $13,
        transport_cost_pdf = $14,
        other_cost = $15,
        other_cost_pdf = $16,
        other_cost_description = $17,
        calc_total_origin = $18,
        calc_total_release = $19,
        calc_total_logistics = $20,
        calc_grand_total = $21,
        calc_cost_per_kg = $22,
        is_fully_costed = $23,
        status = $24,
        notes = $25,
        gross_weight_kg = $26,
        updated_at = NOW()
      WHERE id = $27
      RETURNING *
    `, [
      freightCost, body.freight_cost_pdf || null,
      originHandling, body.origin_handling_pdf || null,
      customsClearance, body.customs_clearance_pdf || null,
      custodyFee, body.custody_fee_pdf || null,
      aaExpenses, body.aa_expenses_pdf || null,
      storageFee, body.storage_fee_pdf || null,
      transportCost, body.transport_cost_pdf || null,
      otherCost, body.other_cost_pdf || null,
      body.other_cost_description || null,
      calcTotalOrigin, calcTotalRelease, calcTotalLogistics,
      calcGrandTotal, calcCostPerKg,
      isFullyCosted, status,
      body.notes || null,
      grossWeightKg,
      id,
    ]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Registro no encontrado' });
      return;
    }

    // Si está completo, distribuir costos a paquetes
    let packagesUpdated = 0;
    if (isFullyCosted) {
      const awbNumber = result.rows[0].awb_number;
      const updateRes = await client.query(`
        UPDATE packages SET
          assigned_cost_mxn = weight * $1,
          updated_at = NOW()
        WHERE (awb_cost_id = $2 OR international_tracking = $3)
          AND weight IS NOT NULL AND weight > 0
      `, [calcCostPerKg, id, awbNumber]);
      packagesUpdated = updateRes.rowCount || 0;
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      cost: result.rows[0],
      packagesUpdated,
      calculations: {
        totalOrigin: calcTotalOrigin,
        totalRelease: calcTotalRelease,
        totalLogistics: calcTotalLogistics,
        grandTotal: calcGrandTotal,
        costPerKg: calcCostPerKg,
      },
      message: isFullyCosted
        ? `✅ Costos guardados y distribuidos (${packagesUpdated} paquetes)`
        : '💾 Avance guardado (pendiente de completar)',
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('✈️ [AWB-COST] Error guardando:', error.message);
    res.status(500).json({ error: 'Error al guardar costos' });
  } finally {
    client.release();
  }
};

// ============================================
// 4. ESTADÍSTICAS AWB COSTS (GET /api/awb-costs/stats)
// ============================================
export const getAwbCostStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'costed') as costed,
        COALESCE(SUM(calc_grand_total) FILTER (WHERE is_fully_costed = true), 0) as total_cost,
        COALESCE(SUM(gross_weight_kg), 0) as total_weight,
        COALESCE(SUM(pieces), 0) as total_pieces,
        COALESCE(SUM(total_packages_s), 0) as total_s_packages,
        COALESCE(SUM(total_packages_cajo), 0) as total_cajo_packages
      FROM air_waybill_costs
    `);

    res.json({ success: true, stats: result.rows[0] });
  } catch (error: any) {
    console.error('✈️ [AWB-COST] Error stats:', error.message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// ============================================
// 5. UTILIDADES / PROFIT (GET /api/awb-costs/:id/profit)
// ============================================
export const getAwbCostProfit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const costRes = await pool.query('SELECT * FROM air_waybill_costs WHERE id = $1', [id]);
    if (costRes.rows.length === 0) {
      res.status(404).json({ error: 'No encontrado' });
      return;
    }

    const awbCost = costRes.rows[0];

    // Ingresos de paquetes S (usando air_sale_price para aéreo)
    const revenueS = await pool.query(`
      SELECT 
        COALESCE(SUM(air_sale_price), 0) as revenue_s,
        COUNT(*) as count_s
      FROM packages 
      WHERE (awb_cost_id = $1 OR international_tracking = $2)
        AND air_sale_price IS NOT NULL
    `, [id, awbCost.awb_number]);

    // También contar paquetes que aún no tienen precio asignado
    const pendingPrice = await pool.query(`
      SELECT COUNT(*) as count
      FROM packages 
      WHERE (awb_cost_id = $1 OR international_tracking = $2)
        AND (air_sale_price IS NULL OR air_sale_price = 0)
    `, [id, awbCost.awb_number]);

    // TODO: Ingresos de CAJO (si aplica) 
    const totalRevenue = parseFloat(revenueS.rows[0].revenue_s) || 0;
    const totalCost = parseFloat(awbCost.calc_grand_total) || 0;
    const profit = totalRevenue - totalCost;
    const margin = totalCost > 0 ? ((profit / totalCost) * 100) : 0;

    res.json({
      success: true,
      profit: {
        totalCost,
        totalRevenue,
        profit,
        margin: margin.toFixed(2),
        packagesS: parseInt(revenueS.rows[0].count_s),
        packagesPendingPrice: parseInt(pendingPrice.rows[0].count),
        breakdown: {
          origin: parseFloat(awbCost.calc_total_origin) || 0,
          release: parseFloat(awbCost.calc_total_release) || 0,
          logistics: parseFloat(awbCost.calc_total_logistics) || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('✈️ [AWB-COST] Error profit:', error.message);
    res.status(500).json({ error: 'Error al calcular utilidades' });
  }
};

// ============================================
// 6. ELIMINAR AWB COST (DELETE /api/awb-costs/:id)
// ============================================
export const deleteAwbCost = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Desvincular paquetes
    await pool.query('UPDATE packages SET awb_cost_id = NULL WHERE awb_cost_id = $1', [id]);

    const result = await pool.query('DELETE FROM air_waybill_costs WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No encontrado' });
      return;
    }

    res.json({ success: true, message: 'Registro de costeo eliminado' });
  } catch (error: any) {
    console.error('✈️ [AWB-COST] Error eliminando:', error.message);
    res.status(500).json({ error: 'Error al eliminar' });
  }
};

// ============================================
// 7. SUBIR DOCUMENTO AWB COST (POST /api/awb-costs/:id/upload-document)
// ============================================
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(__dirname, '..', 'uploads', 'awb-costs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `awb_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    cb(null, name);
  },
});

export const uploadAwbDocument = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF, JPG, JPEG, PNG'));
    }
  },
}).single('file');

export const handleAwbDocumentUpload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { field } = req.body;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No se recibió archivo' });
      return;
    }

    if (!field) {
      res.status(400).json({ error: 'Campo no especificado' });
      return;
    }

    const url = `/uploads/awb-costs/${file.filename}`;

    // Actualizar el campo correspondiente en la BD
    const allowedFields = [
      'freight_cost_pdf', 'origin_handling_pdf', 
      'customs_clearance_pdf', 'custody_fee_pdf', 'aa_expenses_pdf', 'storage_fee_pdf',
      'transport_cost_pdf', 'other_cost_pdf'
    ];

    if (!allowedFields.includes(field)) {
      res.status(400).json({ error: 'Campo no permitido' });
      return;
    }

    await pool.query(
      `UPDATE air_waybill_costs SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
      [url, id]
    );

    console.log(`✈️ [AWB-COST] Documento subido: ${field} = ${url}`);

    res.json({ success: true, url, message: 'Documento subido correctamente' });
  } catch (error: any) {
    console.error('✈️ [AWB-COST] Error subiendo documento:', error.message);
    res.status(500).json({ error: 'Error al subir documento' });
  }
};
