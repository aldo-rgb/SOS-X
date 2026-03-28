// ============================================
// CONTROLADOR DE COSTEO AIR WAYBILL
// Modal de costeo estilo marítimo para AWBs
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import { getSignedUrlForKey, extractKeyFromUrl, isS3Configured } from './s3Service';

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
        ar.code as route_code,
        (SELECT COUNT(*) FROM packages p WHERE p.awb_cost_id = ac.id) as packages_s_count,
        (SELECT COUNT(*) FROM cajo_guides cg WHERE cg.mawb = ac.awb_number) as packages_cajo_count
      FROM air_waybill_costs ac
      LEFT JOIN air_routes ar ON ar.id = ac.route_id
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

    const costRes = await pool.query(`
      SELECT ac.*, ar.code as route_code 
      FROM air_waybill_costs ac
      LEFT JOIN air_routes ar ON ar.id = ac.route_id
      WHERE ac.id = $1
    `, [id]);
    if (costRes.rows.length === 0) {
      res.status(404).json({ error: 'Registro de costeo no encontrado' });
      return;
    }

    const awbCost = costRes.rows[0];

    // Paquetes S vinculados
    const packagesS = await pool.query(`
      SELECT p.id, p.tracking_internal, p.weight, p.description, p.user_id, p.assigned_cost_mxn, p.status,
             p.child_no, p.international_tracking,
             p.air_sale_price, p.air_price_per_kg, p.air_tariff_type, COALESCE(p.cajo_tariff_type, 'L') as cajo_tariff_type,
             u.box_id as user_box_id, u.full_name as user_name
      FROM packages p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.awb_cost_id = $1 OR p.international_tracking = $2
      ORDER BY p.tracking_internal
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

    // Otros gastos múltiples
    const otherCostsRes = await pool.query(`
      SELECT id, description, amount, created_at
      FROM air_waybill_other_costs
      WHERE awb_cost_id = $1
      ORDER BY created_at
    `, [id]);

    // Generar presigned URLs para documentos S3
    if (isS3Configured()) {
      try {
        if (awbCost.awb_pdf_url) {
          const key = extractKeyFromUrl(awbCost.awb_pdf_url);
          if (key) {
            awbCost.awb_pdf_url = await getSignedUrlForKey(key, 3600);
          }
        }
        if (awbCost.packing_list_url) {
          const key = extractKeyFromUrl(awbCost.packing_list_url);
          if (key) {
            awbCost.packing_list_url = await getSignedUrlForKey(key, 3600);
          }
        }
      } catch (err: any) {
        console.error('✈️ [AWB-COST] Error generando presigned URLs:', err.message);
      }
    }

    res.json({
      success: true,
      cost: awbCost,
      packagesS: packagesS.rows,
      cajoGuides: cajoGuides.rows,
      draftInfo,
      otherCosts: otherCostsRes.rows,
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

    // Peso bruto
    const grossWeightKg = parseFloat(body.gross_weight_kg) || 0;

    // Costo por kg en origen (MXN) - campo simplificado
    const originCostPerKg = parseFloat(body.origin_cost_per_kg) || 0;

    // Calcular totales
    // Gastos de Origen = costo_por_kg * peso_bruto
    const calcTotalOrigin = originCostPerKg * grossWeightKg;

    // Mantener campos legacy por compatibilidad (ya no se usan en UI)
    const freightCost = calcTotalOrigin; // Se guarda el total calculado en freight_cost
    const originHandling = 0; // Ya no se usa

    const customsClearance = parseFloat(body.customs_clearance) || 0;
    const custodyFee = parseFloat(body.custody_fee) || 0;
    const aaExpenses = parseFloat(body.aa_expenses) || 0;
    const storageFee = parseFloat(body.storage_fee) || 0;
    const transportCost = parseFloat(body.transport_cost) || 0;
    const otherCost = parseFloat(body.other_cost) || 0;

    // Sumar otros gastos múltiples de la lista
    const otherCostsTotal = Array.isArray(body.otherCosts)
      ? body.otherCosts.reduce((sum: number, oc: any) => sum + (parseFloat(oc.amount) || 0), 0)
      : 0;

    const calcTotalRelease = customsClearance + custodyFee + aaExpenses + storageFee;
    const calcTotalLogistics = transportCost + otherCost + otherCostsTotal;
    const calcGrandTotal = calcTotalOrigin + calcTotalRelease + calcTotalLogistics;

    const calcCostPerKg = grossWeightKg > 0 ? (calcGrandTotal / grossWeightKg) : 0;

    // Verificar completitud (ahora usa origin_cost_per_kg en lugar de freight_cost)
    const isFullyCosted = (
      originCostPerKg > 0 &&
      customsClearance > 0 &&
      grossWeightKg > 0
    );
    const status = isFullyCosted ? 'costed' : 'pending';

    const result = await client.query(`
      UPDATE air_waybill_costs SET
        origin_cost_per_kg = $1,
        freight_cost = $2,
        freight_cost_pdf = $3,
        origin_handling = $4,
        origin_handling_pdf = $5,
        customs_clearance = $6,
        customs_clearance_pdf = $7,
        custody_fee = $8,
        custody_fee_pdf = $9,
        aa_expenses = $10,
        aa_expenses_pdf = $11,
        storage_fee = $12,
        storage_fee_pdf = $13,
        transport_cost = $14,
        transport_cost_pdf = $15,
        other_cost = $16,
        other_cost_pdf = $17,
        other_cost_description = $18,
        calc_total_origin = $19,
        calc_total_release = $20,
        calc_total_logistics = $21,
        calc_grand_total = $22,
        calc_cost_per_kg = $23,
        is_fully_costed = $24,
        status = $25,
        notes = $26,
        gross_weight_kg = $27,
        updated_at = NOW()
      WHERE id = $28
      RETURNING *
    `, [
      originCostPerKg,
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

    // Guardar otros gastos múltiples
    if (body.otherCosts && Array.isArray(body.otherCosts)) {
      // Eliminar los existentes
      await client.query('DELETE FROM air_waybill_other_costs WHERE awb_cost_id = $1', [id]);
      
      // Insertar los nuevos
      for (const oc of body.otherCosts) {
        if (oc.description && oc.amount > 0) {
          await client.query(`
            INSERT INTO air_waybill_other_costs (awb_cost_id, description, amount)
            VALUES ($1, $2, $3)
          `, [id, oc.description, oc.amount]);
        }
      }
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

    // Ingresos de paquetes S (usando air_sale_price para aéreo - valor en USD)
    const revenueS = await pool.query(`
      SELECT 
        COALESCE(SUM(air_sale_price), 0) as revenue_usd,
        COALESCE(SUM(weight), 0) as weight_s,
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

    // Tipo de cambio guardado en la guía
    const exchangeRate = parseFloat(awbCost.exchange_rate) || 18.37;
    
    // Ingresos: air_sale_price está en USD, convertir a MXN
    const totalRevenueUSD = parseFloat(revenueS.rows[0].revenue_usd) || 0;
    const totalRevenueMXN = totalRevenueUSD * exchangeRate;
    const weightS = parseFloat(revenueS.rows[0].weight_s) || 0;
    
    const totalCost = parseFloat(awbCost.calc_grand_total) || 0;
    const profit = totalRevenueMXN - totalCost;
    const margin = totalCost > 0 ? ((profit / totalCost) * 100) : 0;

    res.json({
      success: true,
      profit: {
        totalCost,
        totalRevenueUSD,
        totalRevenueMXN,
        totalRevenue: totalRevenueMXN, // backward compat
        exchangeRate,
        weightS,
        profit,
        margin: margin.toFixed(2),
        packagesS: parseInt(revenueS.rows[0].count_s),
        packagesPendingPrice: parseInt(pendingPrice.rows[0].count),
        breakdown: {
          origin: parseFloat(awbCost.calc_total_origin) || 0,
          release: parseFloat(awbCost.customs_clearance) || 0,
          custodyAndRelease: (parseFloat(awbCost.custody_fee) || 0) + (parseFloat(awbCost.aa_expenses) || 0) + (parseFloat(awbCost.storage_fee) || 0),
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
// 6.5 CALCULAR GASTOS DE LIBERACIÓN AUTOMÁTICOS (GET /api/awb-costs/:id/calc-release-costs)
// ============================================
export const calcReleaseCosts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Obtener AWB
    const costRes = await pool.query('SELECT * FROM air_waybill_costs WHERE id = $1', [id]);
    if (costRes.rows.length === 0) {
      res.status(404).json({ error: 'Registro de costeo no encontrado' });
      return;
    }
    const awbCost = costRes.rows[0];

    // Obtener paquetes S vinculados con sus pesos (tipo se asume Logo por defecto)
    const packagesS = await pool.query(`
      SELECT p.id, p.tracking_internal, p.weight, COALESCE(p.cajo_tariff_type, 'L') as tariff_type
      FROM packages p
      WHERE p.awb_cost_id = $1 OR p.international_tracking = $2
    `, [id, awbCost.awb_number]);

    // Obtener guías CAJO vinculadas
    const cajoGuides = await pool.query(`
      SELECT id, guia_air, cliente, peso_kg, tipo
      FROM cajo_guides 
      WHERE mawb = $1
    `, [awbCost.awb_number]);

    // Obtener overfee CAJO de la configuración
    const overfeeRes = await pool.query(`
      SELECT value FROM system_config WHERE key = 'cajo_overfee_per_kg'
    `);
    const cajoOverfeePerKg = overfeeRes.rows.length > 0 ? parseFloat(overfeeRes.rows[0].value) : 0;

    // Calcular peso total del AWB
    const pesoS = packagesS.rows.reduce((sum: number, p: any) => sum + (parseFloat(p.weight) || 0), 0);
    const pesoCajo = cajoGuides.rows.reduce((sum: number, g: any) => sum + (parseFloat(g.peso_kg) || 0), 0);
    // Para buscar el bracket de tarifa, usar el peso bruto declarado del AWB (gross_weight_kg)
    const pesoBrutoAwb = parseFloat(awbCost.gross_weight_kg) || 0;
    const pesoTotalAwb = pesoS + pesoCajo;

    // Clasificar paquetes S por tipo (Logo o Genérico)
    let pesoLogo = 0;
    let pesoGenerico = 0;
    for (const pkg of packagesS.rows) {
      const tipo = (pkg.tariff_type || 'G').toUpperCase();
      const peso = parseFloat(pkg.weight) || 0;
      if (tipo === 'L' || tipo === 'LOGO') {
        pesoLogo += peso;
      } else {
        pesoGenerico += peso;
      }
    }

    // Determinar el tipo predominante para obtener la tarifa del proveedor
    // El peso BRUTO del AWB (declarado) determina el bracket, NO la suma de pesos individuales
    const tipoPredominante = pesoLogo > pesoGenerico ? 'L' : 'G';

    // Obtener la ruta aérea (asumimos AIFA = HKG -> MEX, route_id = 1)
    // Por ahora buscamos la ruta activa o la primera
    const routeRes = await pool.query(`
      SELECT id FROM air_routes WHERE is_active = true ORDER BY id ASC LIMIT 1
    `);
    const routeId = routeRes.rows.length > 0 ? routeRes.rows[0].id : 1;

    // Obtener los brackets de costo del proveedor para este tipo y buscar el aplicable por peso BRUTO del AWB
    const bracketsRes = await pool.query(`
      SELECT min_kg, cost_per_kg
      FROM air_cost_brackets
      WHERE route_id = $1 AND tariff_type = $2
      ORDER BY min_kg DESC
    `, [routeId, tipoPredominante]);

    let costPerKgProveedor = 0;
    for (const bracket of bracketsRes.rows) {
      if (pesoBrutoAwb >= parseFloat(bracket.min_kg)) {
        costPerKgProveedor = parseFloat(bracket.cost_per_kg);
        break;
      }
    }

    // Si no hay bracket, usar el primero (el más bajo)
    if (costPerKgProveedor === 0 && bracketsRes.rows.length > 0) {
      costPerKgProveedor = parseFloat(bracketsRes.rows[bracketsRes.rows.length - 1].cost_per_kg);
    }

    // === CÁLCULO DE GASTOS DE LIBERACIÓN ===
    // Gastos de liberación para paquetes S: peso_S * tarifa_proveedor (MXN)
    const gastosLiberacionS = pesoS * costPerKgProveedor;

    // Gastos de liberación para CAJO: peso_CAJO * (tarifa_proveedor + overfee) (MXN)
    const gastosLiberacionCajo = pesoCajo * (costPerKgProveedor + cajoOverfeePerKg);

    // Total gastos de liberación
    const gastosLiberacionTotal = gastosLiberacionS + gastosLiberacionCajo;

    // Costo por kg calculado
    const calcCostoLiberacionPerKg = pesoTotalAwb > 0 ? (gastosLiberacionTotal / pesoTotalAwb) : 0;

    console.log(`✈️ [AWB-COST] Cálculo automático AWB ${awbCost.awb_number}:
      - Peso S: ${pesoS.toFixed(2)} kg (Logo: ${pesoLogo.toFixed(2)}, Gen: ${pesoGenerico.toFixed(2)})
      - Peso CAJO: ${pesoCajo.toFixed(2)} kg
      - Peso Bruto AWB (para bracket): ${pesoBrutoAwb.toFixed(2)} kg
      - Peso Total paquetes: ${pesoTotalAwb.toFixed(2)} kg
      - Tipo predominante: ${tipoPredominante}
      - Tarifa proveedor: $${costPerKgProveedor.toFixed(2)} MXN/kg (bracket por ${pesoBrutoAwb.toFixed(0)} kg)
      - Overfee CAJO: $${cajoOverfeePerKg.toFixed(2)} MXN/kg
      - Liberación S: $${gastosLiberacionS.toFixed(2)} MXN
      - Liberación CAJO: $${gastosLiberacionCajo.toFixed(2)} MXN
      - Total Liberación: $${gastosLiberacionTotal.toFixed(2)} MXN`);

    res.json({
      success: true,
      calculation: {
        // Pesos
        peso_s: pesoS,
        peso_s_logo: pesoLogo,
        peso_s_generico: pesoGenerico,
        peso_cajo: pesoCajo,
        peso_total: pesoTotalAwb,
        peso_bruto_awb: pesoBrutoAwb,
        
        // Configuración usada
        tipo_predominante: tipoPredominante,
        tarifa_proveedor_per_kg: costPerKgProveedor,
        overfee_cajo_per_kg: cajoOverfeePerKg,
        route_id: routeId,
        
        // Cálculos
        gastos_liberacion_s: gastosLiberacionS,
        gastos_liberacion_cajo: gastosLiberacionCajo,
        gastos_liberacion_total: gastosLiberacionTotal,
        costo_liberacion_per_kg: calcCostoLiberacionPerKg,
        
        // Conteos
        count_packages_s: packagesS.rows.length,
        count_cajo_guides: cajoGuides.rows.length,
      },
    });
  } catch (error: any) {
    console.error('✈️ [AWB-COST] Error calculando gastos de liberación:', error.message);
    res.status(500).json({ error: 'Error al calcular gastos de liberación' });
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
