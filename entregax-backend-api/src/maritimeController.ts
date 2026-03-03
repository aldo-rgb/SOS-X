import { Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import fs from 'fs';
import path from 'path';
import { createNotification } from './notificationController';
import { uploadToS3, isS3Configured } from './s3Service';

// Función auxiliar para formatear moneda
const formatCurrency = (value: number): string => {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ========== CONTENEDORES ==========

// Listar todos los contenedores
export const getContainers = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { status, search } = req.query;
    
    let query = `
      SELECT c.*, 
        mr.code as route_code,
        mr.name as route_name,
        lc.box_id as client_box_id,
        lc.full_name as client_name,
        (SELECT COUNT(*) FROM maritime_orders mo WHERE mo.container_id = c.id) as shipment_count,
        cc.is_fully_costed,
        cc.calculated_release_cost
      FROM containers c
      LEFT JOIN container_costs cc ON cc.container_id = c.id
      LEFT JOIN maritime_routes mr ON mr.id = c.route_id
      LEFT JOIN legacy_clients lc ON lc.id = c.legacy_client_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (c.container_number ILIKE $${paramIndex} OR c.bl_number ILIKE $${paramIndex} OR c.consignee ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching containers:', error);
    res.status(500).json({ error: 'Error al obtener contenedores' });
  }
};

// Obtener detalle de un contenedor
export const getContainerDetail = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    // Contenedor
    const containerRes = await pool.query('SELECT * FROM containers WHERE id = $1', [id]);
    if (containerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Contenedor no encontrado' });
    }

    // Envíos del contenedor
    const shipmentsRes = await pool.query(`
      SELECT ms.*, u.full_name as client_name, u.box_id 
      FROM maritime_shipments ms
      LEFT JOIN users u ON u.id = ms.user_id
      WHERE ms.container_id = $1
      ORDER BY ms.created_at DESC
    `, [id]);

    // Costos
    const costsRes = await pool.query('SELECT * FROM container_costs WHERE container_id = $1', [id]);

    res.json({
      container: containerRes.rows[0],
      shipments: shipmentsRes.rows,
      costs: costsRes.rows[0] || null
    });
  } catch (error) {
    console.error('Error fetching container detail:', error);
    res.status(500).json({ error: 'Error al obtener detalle del contenedor' });
  }
};

// Crear contenedor
export const createContainer = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { containerNumber, blNumber, eta, notes, routeId } = req.body;

    // Obtener tipo de cambio actual y congelarlo
    const fxResult = await pool.query(`
      SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1
    `);
    const exchangeRate = fxResult.rows[0]?.rate || 20.50;

    // Si no viene routeId, asignar la ruta por defecto (CHN-MZN-MXC)
    let finalRouteId = routeId;
    if (!finalRouteId) {
      const defaultRouteResult = await pool.query(`
        SELECT id FROM maritime_routes 
        WHERE code = 'CHN-MZN-MXC' AND is_active = TRUE
        LIMIT 1
      `);
      finalRouteId = defaultRouteResult.rows[0]?.id || null;
    }

    const result = await pool.query(`
      INSERT INTO containers (container_number, bl_number, eta, notes, status, exchange_rate_usd_mxn, route_id)
      VALUES ($1, $2, $3, $4, 'consolidated', $5, $6)
      RETURNING *
    `, [containerNumber, blNumber, eta, notes, exchangeRate, finalRouteId]);

    // Crear registro de costos vacío
    await pool.query(`
      INSERT INTO container_costs (container_id) VALUES ($1)
    `, [result.rows[0].id]);

    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un contenedor con ese número' });
    }
    console.error('Error creating container:', error);
    res.status(500).json({ error: 'Error al crear contenedor' });
  }
};

// Actualizar contenedor
export const updateContainer = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { containerNumber, blNumber, eta, status, notes, routeId } = req.body;

    const result = await pool.query(`
      UPDATE containers 
      SET container_number = COALESCE($1, container_number),
          bl_number = COALESCE($2, bl_number),
          eta = COALESCE($3, eta),
          status = COALESCE($4, status),
          notes = COALESCE($5, notes),
          route_id = COALESCE($6, route_id),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [containerNumber, blNumber, eta, status, notes, routeId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contenedor no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating container:', error);
    res.status(500).json({ error: 'Error al actualizar contenedor' });
  }
};

// Actualizar estado del contenedor
export const updateContainerStatus = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['received_origin', 'consolidated', 'in_transit', 'arrived_port', 'customs_cleared', 'received_cedis'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    // Obtener datos del contenedor y sus envíos con usuarios
    const containerResult = await pool.query('SELECT * FROM containers WHERE id = $1', [id]);
    const container = containerResult.rows[0];

    // Obtener todos los usuarios con envíos en este contenedor
    const usersResult = await pool.query(`
      SELECT DISTINCT ms.user_id, ms.tracking 
      FROM maritime_shipments ms 
      WHERE ms.container_id = $1 AND ms.user_id IS NOT NULL
    `, [id]);

    // Actualizar contenedor
    await pool.query('UPDATE containers SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

    // Actualizar todos los envíos del contenedor
    await pool.query('UPDATE maritime_shipments SET status = $1, updated_at = NOW() WHERE container_id = $2', [status, id]);

    // Enviar notificaciones a todos los usuarios afectados
    const statusMessages: Record<string, string> = {
      'received_origin': '📦 Tu envío marítimo ha sido recibido en origen.',
      'consolidated': '📦 Tu envío marítimo ha sido consolidado en el contenedor.',
      'in_transit': '🚢 Tu envío marítimo está en tránsito hacia México.',
      'arrived_port': '⚓ Tu envío marítimo ha llegado al puerto en México.',
      'customs_cleared': '🛃 Tu envío marítimo ha sido liberado de aduana.',
      'received_cedis': '📦 Tu envío marítimo ha llegado a nuestro CEDIS y está listo para despacho.'
    };

    const notificationTypes: Record<string, 'PACKAGE_RECEIVED' | 'PACKAGE_IN_TRANSIT'> = {
      'received_origin': 'PACKAGE_RECEIVED',
      'consolidated': 'PACKAGE_RECEIVED',
      'in_transit': 'PACKAGE_IN_TRANSIT',
      'arrived_port': 'PACKAGE_IN_TRANSIT',
      'customs_cleared': 'PACKAGE_IN_TRANSIT',
      'received_cedis': 'PACKAGE_RECEIVED'
    };

    if (statusMessages[status]) {
      for (const shipment of usersResult.rows) {
        const notifType = notificationTypes[status] || 'PACKAGE_IN_TRANSIT';
        await createNotification(
          shipment.user_id,
          notifType,
          `${statusMessages[status]} Contenedor: ${container?.container_number || 'N/A'}`,
          { 
            containerId: id, 
            containerNumber: container?.container_number,
            tracking: shipment.tracking,
            status: status,
            service: 'Maritime'
          },
          '/maritime-dashboard'
        );
      }
    }

    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error updating container status:', error);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
};

// Eliminar contenedor
export const deleteContainer = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    // Verificar que no tenga envíos
    const shipmentsRes = await pool.query('SELECT COUNT(*) FROM maritime_shipments WHERE container_id = $1', [id]);
    if (parseInt(shipmentsRes.rows[0].count) > 0) {
      return res.status(400).json({ error: 'No se puede eliminar un contenedor con envíos asignados' });
    }

    // Eliminar costos
    await pool.query('DELETE FROM container_costs WHERE container_id = $1', [id]);
    
    // Eliminar contenedor
    await pool.query('DELETE FROM containers WHERE id = $1', [id]);

    res.json({ success: true, message: 'Contenedor eliminado' });
  } catch (error) {
    console.error('Error deleting container:', error);
    res.status(500).json({ error: 'Error al eliminar contenedor' });
  }
};

// ========== COSTOS DE CONTENEDOR ==========

// Obtener costos de un contenedor
export const getContainerCosts = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { containerId } = req.params;

    const result = await pool.query('SELECT * FROM container_costs WHERE container_id = $1', [containerId]);
    
    if (result.rows.length === 0) {
      // Crear registro si no existe
      const newCost = await pool.query('INSERT INTO container_costs (container_id) VALUES ($1) RETURNING *', [containerId]);
      return res.json(newCost.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching container costs:', error);
    res.status(500).json({ error: 'Error al obtener costos' });
  }
};

// Actualizar costos de contenedor (Guardar progreso o finalizar)
export const updateContainerCosts = async (req: AuthRequest, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { containerId } = req.params;
    const { costs, debitNoteExtraction, deleteFields } = req.body;

    // Si hay campos para eliminar explícitamente (borrar PDFs)
    const fieldsToDelete: string[] = deleteFields || [];

    // Cálculos matemáticos
    const ant1 = parseFloat(costs.advance_1_amount || 0);
    const ant2 = parseFloat(costs.advance_2_amount || 0);
    const ant3 = parseFloat(costs.advance_3_amount || 0);
    const ant4 = parseFloat(costs.advance_4_amount || 0);
    const calculatedAA = ant1 + ant2 + ant3 + ant4;

    const debit = parseFloat(costs.debit_note_amount || 0);
    const demu = parseFloat(costs.demurrage_amount || 0);
    const stor = parseFloat(costs.storage_amount || 0);
    const maneu = parseFloat(costs.maneuvers_amount || 0);
    const cust = parseFloat(costs.custody_amount || 0);
    const transp = parseFloat(costs.transport_amount || 0);
    const other = parseFloat(costs.other_amount || 0);

    // Liberación Total
    const calculatedRelease = calculatedAA + debit + demu + stor + maneu + cust + transp + other;

    // Validar si está completo (al menos debit note y un anticipo)
    const isComplete = debit > 0 && calculatedAA > 0;

    // Datos de extracción de nota de débito (si se proporcionan)
    const debitNoteUsd = debitNoteExtraction?.total_usd || costs.debit_note_usd || null;
    const debitNoteExchangeRate = debitNoteExtraction?.exchange_rate || costs.debit_note_exchange_rate || null;
    const debitNoteFeePercent = debitNoteExtraction?.fee_percent ?? costs.debit_note_fee_percent ?? 4.00;
    const debitNoteFeeAmount = debitNoteExtraction?.fee_amount || costs.debit_note_fee_amount || null;
    const debitNoteLineItems = debitNoteExtraction?.line_items || costs.debit_note_line_items || null;
    const debitNoteInvoiceNumber = debitNoteExtraction?.invoice_number || costs.debit_note_invoice_number || null;
    const debitNoteBlNumber = debitNoteExtraction?.bl_number || costs.debit_note_bl_number || null;
    const debitNoteContainerNumber = debitNoteExtraction?.container_number || costs.debit_note_container_number || null;

    // Upsert costos
    await client.query(`
      INSERT INTO container_costs (
        container_id,
        debit_note_amount, debit_note_pdf,
        debit_note_usd, debit_note_exchange_rate, debit_note_fee_percent, debit_note_fee_amount,
        debit_note_line_items, debit_note_invoice_number, debit_note_bl_number, debit_note_container_number,
        debit_note_extracted_at,
        demurrage_amount, demurrage_pdf,
        storage_amount, storage_pdf,
        maneuvers_amount, maneuvers_pdf,
        custody_amount, custody_pdf,
        advance_1_amount, advance_1_pdf,
        advance_2_amount, advance_2_pdf,
        advance_3_amount, advance_3_pdf,
        advance_4_amount, advance_4_pdf,
        transport_amount, transport_pdf,
        other_amount, other_pdf, other_description,
        telex_release_pdf, bl_document_pdf,
        calculated_aa_cost, calculated_release_cost,
        is_fully_costed, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, NOW())
      ON CONFLICT (container_id) DO UPDATE SET
        debit_note_amount = EXCLUDED.debit_note_amount,
        debit_note_pdf = COALESCE(EXCLUDED.debit_note_pdf, container_costs.debit_note_pdf),
        debit_note_usd = COALESCE(EXCLUDED.debit_note_usd, container_costs.debit_note_usd),
        debit_note_exchange_rate = COALESCE(EXCLUDED.debit_note_exchange_rate, container_costs.debit_note_exchange_rate),
        debit_note_fee_percent = COALESCE(EXCLUDED.debit_note_fee_percent, container_costs.debit_note_fee_percent),
        debit_note_fee_amount = COALESCE(EXCLUDED.debit_note_fee_amount, container_costs.debit_note_fee_amount),
        debit_note_line_items = COALESCE(EXCLUDED.debit_note_line_items, container_costs.debit_note_line_items),
        debit_note_invoice_number = COALESCE(EXCLUDED.debit_note_invoice_number, container_costs.debit_note_invoice_number),
        debit_note_bl_number = COALESCE(EXCLUDED.debit_note_bl_number, container_costs.debit_note_bl_number),
        debit_note_container_number = COALESCE(EXCLUDED.debit_note_container_number, container_costs.debit_note_container_number),
        debit_note_extracted_at = COALESCE(EXCLUDED.debit_note_extracted_at, container_costs.debit_note_extracted_at),
        demurrage_amount = EXCLUDED.demurrage_amount,
        demurrage_pdf = COALESCE(EXCLUDED.demurrage_pdf, container_costs.demurrage_pdf),
        storage_amount = EXCLUDED.storage_amount,
        storage_pdf = COALESCE(EXCLUDED.storage_pdf, container_costs.storage_pdf),
        maneuvers_amount = EXCLUDED.maneuvers_amount,
        maneuvers_pdf = COALESCE(EXCLUDED.maneuvers_pdf, container_costs.maneuvers_pdf),
        custody_amount = EXCLUDED.custody_amount,
        custody_pdf = COALESCE(EXCLUDED.custody_pdf, container_costs.custody_pdf),
        advance_1_amount = EXCLUDED.advance_1_amount,
        advance_1_pdf = COALESCE(EXCLUDED.advance_1_pdf, container_costs.advance_1_pdf),
        advance_2_amount = EXCLUDED.advance_2_amount,
        advance_2_pdf = COALESCE(EXCLUDED.advance_2_pdf, container_costs.advance_2_pdf),
        advance_3_amount = EXCLUDED.advance_3_amount,
        advance_3_pdf = COALESCE(EXCLUDED.advance_3_pdf, container_costs.advance_3_pdf),
        advance_4_amount = EXCLUDED.advance_4_amount,
        advance_4_pdf = COALESCE(EXCLUDED.advance_4_pdf, container_costs.advance_4_pdf),
        transport_amount = EXCLUDED.transport_amount,
        transport_pdf = COALESCE(EXCLUDED.transport_pdf, container_costs.transport_pdf),
        other_amount = EXCLUDED.other_amount,
        other_pdf = COALESCE(EXCLUDED.other_pdf, container_costs.other_pdf),
        other_description = EXCLUDED.other_description,
        telex_release_pdf = COALESCE(EXCLUDED.telex_release_pdf, container_costs.telex_release_pdf),
        bl_document_pdf = COALESCE(EXCLUDED.bl_document_pdf, container_costs.bl_document_pdf),
        calculated_aa_cost = EXCLUDED.calculated_aa_cost,
        calculated_release_cost = EXCLUDED.calculated_release_cost,
        is_fully_costed = EXCLUDED.is_fully_costed,
        updated_at = NOW()
    `, [
      containerId,
      debit, costs.debit_note_pdf || null,
      debitNoteUsd, debitNoteExchangeRate, debitNoteFeePercent, debitNoteFeeAmount,
      debitNoteLineItems ? JSON.stringify(debitNoteLineItems) : null,
      debitNoteInvoiceNumber, debitNoteBlNumber, debitNoteContainerNumber,
      debitNoteExtraction ? new Date() : null,
      demu, costs.demurrage_pdf || null,
      stor, costs.storage_pdf || null,
      maneu, costs.maneuvers_pdf || null,
      cust, costs.custody_pdf || null,
      ant1, costs.advance_1_pdf || null,
      ant2, costs.advance_2_pdf || null,
      ant3, costs.advance_3_pdf || null,
      ant4, costs.advance_4_pdf || null,
      transp, costs.transport_pdf || null,
      other, costs.other_pdf || null, costs.other_description || null,
      costs.telex_release_pdf || null, costs.bl_document_pdf || null,
      calculatedAA, calculatedRelease,
      isComplete
    ]);

    // Si hay campos para eliminar (borrar PDFs), hacerlo explícitamente
    if (fieldsToDelete.length > 0) {
      const validFields = [
        'debit_note_pdf', 'demurrage_pdf', 'storage_pdf', 'maneuvers_pdf', 
        'custody_pdf', 'advance_1_pdf', 'advance_2_pdf', 'advance_3_pdf', 
        'advance_4_pdf', 'transport_pdf', 'other_pdf', 'telex_release_pdf', 
        'bl_document_pdf',
        // También los datos de extracción de debit note si se borra el PDF
        'debit_note_usd', 'debit_note_exchange_rate', 'debit_note_fee_percent',
        'debit_note_fee_amount', 'debit_note_line_items', 'debit_note_invoice_number',
        'debit_note_bl_number', 'debit_note_container_number', 'debit_note_extracted_at'
      ];
      
      const fieldsToNull = fieldsToDelete.filter((f: string) => validFields.includes(f));
      
      if (fieldsToNull.length > 0) {
        const setClause = fieldsToNull.map((f: string) => `${f} = NULL`).join(', ');
        await client.query(
          `UPDATE container_costs SET ${setClause}, updated_at = NOW() WHERE container_id = $1`,
          [containerId]
        );
        console.log(`[updateContainerCosts] Campos eliminados: ${fieldsToNull.join(', ')} para container ${containerId}`);
      }
    }

    // Actualizar costo final en contenedor si está completo
    if (isComplete) {
      await client.query(
        'UPDATE containers SET final_cost_mxn = $1, updated_at = NOW() WHERE id = $2',
        [calculatedRelease, containerId]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: isComplete ? 'Costos finalizados ✅' : 'Progreso guardado 💾',
      totals: { aa: calculatedAA, release: calculatedRelease },
      isComplete
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating container costs:', error);
    res.status(500).json({ error: 'Error al guardar costos' });
  } finally {
    client.release();
  }
};

// ========== ENVÍOS MARÍTIMOS (Recepciones) ==========

// Listar envíos marítimos
export const getMaritimeShipments = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { status, containerId, unassigned, search } = req.query;

    let query = `
      SELECT ms.*, 
        u.full_name as client_name, u.box_id,
        c.container_number
      FROM maritime_shipments ms
      LEFT JOIN users u ON u.id = ms.user_id
      LEFT JOIN containers c ON c.id = ms.container_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND ms.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (containerId) {
      query += ` AND ms.container_id = $${paramIndex}`;
      params.push(containerId);
      paramIndex++;
    }

    if (unassigned === 'true') {
      query += ` AND ms.container_id IS NULL`;
    }

    if (search) {
      query += ` AND (ms.lock_number ILIKE $${paramIndex} OR ms.shipping_mark ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY ms.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching maritime shipments:', error);
    res.status(500).json({ error: 'Error al obtener envíos marítimos' });
  }
};

// Crear envío marítimo (Recepción de Hoja Sanky)
export const createMaritimeShipment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { lockNumber, shippingMark, boxCount, weightKg, volumeCbm, productType, sankyDocUrl, notes } = req.body;

    // Buscar usuario por shipping mark (box_id)
    let userId = null;
    if (shippingMark) {
      const userRes = await pool.query('SELECT id FROM users WHERE box_id = $1', [shippingMark]);
      userId = userRes.rows[0]?.id || null;
    }

    const result = await pool.query(`
      INSERT INTO maritime_shipments 
      (lock_number, user_id, shipping_mark, box_count, weight_kg, volume_cbm, product_type, sanky_doc_url, notes, status, received_at_origin)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'received_origin', NOW())
      RETURNING *
    `, [lockNumber, userId, shippingMark, boxCount, weightKg, volumeCbm, productType, sankyDocUrl, notes]);

    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un envío con ese número de lock' });
    }
    console.error('Error creating maritime shipment:', error);
    res.status(500).json({ error: 'Error al crear envío marítimo' });
  }
};

// Actualizar envío marítimo
export const updateMaritimeShipment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { shippingMark, boxCount, weightKg, volumeCbm, productType, sankyDocUrl, notes, status } = req.body;

    // Si actualizan shipping mark, buscar usuario
    let userId = null;
    if (shippingMark) {
      const userRes = await pool.query('SELECT id FROM users WHERE box_id = $1', [shippingMark]);
      userId = userRes.rows[0]?.id || null;
    }

    const result = await pool.query(`
      UPDATE maritime_shipments 
      SET user_id = COALESCE($1, user_id),
          shipping_mark = COALESCE($2, shipping_mark),
          box_count = COALESCE($3, box_count),
          weight_kg = COALESCE($4, weight_kg),
          volume_cbm = COALESCE($5, volume_cbm),
          product_type = COALESCE($6, product_type),
          sanky_doc_url = COALESCE($7, sanky_doc_url),
          notes = COALESCE($8, notes),
          status = COALESCE($9, status),
          updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [userId, shippingMark, boxCount, weightKg, volumeCbm, productType, sankyDocUrl, notes, status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating maritime shipment:', error);
    res.status(500).json({ error: 'Error al actualizar envío' });
  }
};

// Asignar envío a contenedor
export const assignShipmentToContainer = async (req: AuthRequest, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { shipmentId, containerId } = req.body;

    // Actualizar envío
    await client.query(`
      UPDATE maritime_shipments 
      SET container_id = $1, status = 'consolidated', updated_at = NOW()
      WHERE id = $2
    `, [containerId, shipmentId]);

    // Recalcular totales del contenedor
    const totals = await client.query(`
      SELECT 
        COALESCE(SUM(weight_kg), 0) as total_weight,
        COALESCE(SUM(volume_cbm), 0) as total_cbm,
        COUNT(*) as total_packages
      FROM maritime_shipments 
      WHERE container_id = $1
    `, [containerId]);

    await client.query(`
      UPDATE containers 
      SET total_weight_kg = $1, total_cbm = $2, total_packages = $3, updated_at = NOW()
      WHERE id = $4
    `, [totals.rows[0].total_weight, totals.rows[0].total_cbm, totals.rows[0].total_packages, containerId]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Envío asignado al contenedor' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning shipment:', error);
    res.status(500).json({ error: 'Error al asignar envío' });
  } finally {
    client.release();
  }
};

// Asignar cliente a envío
export const assignClientToShipment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { boxId } = req.body;

    // Buscar usuario
    const userRes = await pool.query('SELECT id FROM users WHERE box_id = $1', [boxId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado con ese Box ID' });
    }

    await pool.query(`
      UPDATE maritime_shipments 
      SET user_id = $1, shipping_mark = $2, updated_at = NOW()
      WHERE id = $3
    `, [userRes.rows[0].id, boxId, id]);

    res.json({ success: true, message: 'Cliente asignado' });
  } catch (error) {
    console.error('Error assigning client:', error);
    res.status(500).json({ error: 'Error al asignar cliente' });
  }
};

// Eliminar envío marítimo
export const deleteMaritimeShipment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM maritime_shipments WHERE id = $1', [id]);
    res.json({ success: true, message: 'Envío eliminado' });
  } catch (error) {
    console.error('Error deleting maritime shipment:', error);
    res.status(500).json({ error: 'Error al eliminar envío' });
  }
};

// ========== ESTADÍSTICAS ==========

export const getMaritimeStats = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    // Contenedores por estado
    const containersRes = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM containers 
      GROUP BY status
    `);

    // Envíos por estado
    const shipmentsRes = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM maritime_shipments 
      GROUP BY status
    `);

    // Totales
    const totalsRes = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM containers) as total_containers,
        (SELECT COUNT(*) FROM containers WHERE status = 'in_transit') as in_transit_containers,
        (SELECT COUNT(*) FROM maritime_shipments) as total_shipments,
        (SELECT COUNT(*) FROM maritime_shipments WHERE container_id IS NULL) as unassigned_shipments,
        (SELECT COUNT(*) FROM container_costs WHERE is_fully_costed = true) as costed_containers
    `);

    // Costos totales de contenedores finalizados
    const costTotalsRes = await pool.query(`
      SELECT 
        COALESCE(SUM(calculated_release_cost), 0) as total_costs
      FROM container_costs 
      WHERE is_fully_costed = true
    `);

    res.json({
      containersByStatus: containersRes.rows,
      shipmentsByStatus: shipmentsRes.rows,
      totals: totalsRes.rows[0],
      totalCosts: costTotalsRes.rows[0].total_costs
    });
  } catch (error) {
    console.error('Error fetching maritime stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// Recepción en CEDIS (Marcar como recibido)
export const receiveAtCedis = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    await pool.query(`
      UPDATE maritime_shipments 
      SET status = 'received_cedis', received_at_cedis = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({ success: true, message: 'Envío marcado como recibido en CEDIS' });
  } catch (error) {
    console.error('Error marking as received:', error);
    res.status(500).json({ error: 'Error al marcar como recibido' });
  }
};

// ========== UPLOAD DE ARCHIVOS PDF PARA COSTOS ==========

// Campos válidos para subir archivos PDF
const VALID_PDF_FIELDS = [
  'debit_note_pdf',
  'demurrage_pdf',
  'storage_pdf',
  'maneuvers_pdf',
  'custody_pdf',
  'advance_1_pdf',
  'advance_2_pdf',
  'advance_3_pdf',
  'advance_4_pdf',
  'transport_pdf',
  'other_pdf',
  'telex_release_pdf',
  'bl_document_pdf'
];

// ========== EXTRACCIÓN DE DATOS DE NOTA DE DÉBITO (PDF con IA) ==========

interface DebitNoteExtraction {
  total_usd: number;
  total_mxn: number;
  exchange_rate: number;
  line_items: { description: string; amount_usd: number }[];
  invoice_number?: string;
  invoice_date?: string;
  vessel_name?: string;
  container_number?: string;
  bl_number?: string;
  eta?: string;
  demurrage_usd?: number;
  storage_usd?: number;
  thc_usd?: number;
  doc_fee_usd?: number;
  other_charges_usd?: number;
}

/**
 * Extraer datos de un PDF de Nota de Débito usando OpenAI Vision
 * POST /api/maritime/containers/extract-debit-note
 */
export const extractDebitNoteFromPdf = async (req: AuthRequest, res: Response): Promise<any> => {
  console.log('🎯 extractDebitNoteFromPdf INICIO');
  console.log('📦 Body:', req.body);
  console.log('📎 File:', (req as any).file ? 'Presente' : 'No presente');
  
  try {
    let file = (req as any).file as Express.Multer.File | undefined;
    const { containerId, pdfUrl } = req.body;
    
    console.log('🔍 containerId:', containerId, 'pdfUrl:', pdfUrl ? 'presente' : 'no');

    if (!containerId) {
      return res.status(400).json({ error: 'Container ID requerido' });
    }

    // Si no hay archivo pero hay URL, intentar descargar el PDF
    if (!file && pdfUrl) {
      console.log(`📥 Descargando PDF desde URL: ${pdfUrl}`);
      try {
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          console.error('❌ Error descargando PDF desde S3:', pdfResponse.status);
          return res.status(400).json({ error: 'No se pudo acceder al PDF guardado. Por favor sube el archivo nuevamente.' });
        }
        const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
        file = {
          buffer: pdfBuffer,
          mimetype: 'application/pdf',
          originalname: 'debit_note.pdf',
          size: pdfBuffer.length
        } as Express.Multer.File;
        console.log(`✅ PDF descargado: ${pdfBuffer.length} bytes`);
      } catch (downloadError: any) {
        console.error('❌ Error descargando PDF:', downloadError.message);
        return res.status(400).json({ error: 'Error al descargar el PDF. Sube el archivo nuevamente.' });
      }
    }

    if (!file) {
      return res.status(400).json({ error: 'No se proporcionó archivo PDF' });
    }

    // Verificar que OpenAI está configurado
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API no configurada. Contacta al administrador.' });
    }

    // Obtener datos del contenedor
    const containerRes = await pool.query(
      'SELECT container_number, exchange_rate_usd_mxn FROM containers WHERE id = $1',
      [containerId]
    );
    
    if (containerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Contenedor no encontrado' });
    }

    const containerNumber = containerRes.rows[0].container_number;
    let exchangeRate = parseFloat(containerRes.rows[0].exchange_rate_usd_mxn) || 20.50;
    
    // Si no hay tipo de cambio en el contenedor, obtener el general
    if (!containerRes.rows[0].exchange_rate_usd_mxn) {
      const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
      if (fxRes.rows.length > 0) {
        exchangeRate = parseFloat(fxRes.rows[0].rate);
      }
    }

    console.log(`📄 Procesando PDF para contenedor ${containerNumber}...`);

    // Convertir PDF a imagen usando pdftoppm (poppler-utils) para renderizar fuentes correctamente
    let base64Image: string;
    try {
      const { execSync } = await import('child_process');
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      
      // Crear archivo temporal para el PDF
      const tempDir = os.tmpdir();
      const tempPdfPath = path.join(tempDir, `debit_note_${Date.now()}.pdf`);
      const tempPngPath = path.join(tempDir, `debit_note_${Date.now()}`);
      
      // Escribir el buffer del PDF a un archivo temporal
      fs.writeFileSync(tempPdfPath, file.buffer);
      console.log('📄 PDF guardado temporalmente en:', tempPdfPath);
      
      // Usar pdftoppm para convertir PDF a PNG (renderiza fuentes correctamente)
      const pdftoppmCmd = `pdftoppm -png -r 200 -singlefile "${tempPdfPath}" "${tempPngPath}"`;
      console.log('🔧 Ejecutando:', pdftoppmCmd);
      execSync(pdftoppmCmd);
      
      // Leer la imagen PNG generada
      const pngFilePath = `${tempPngPath}.png`;
      if (!fs.existsSync(pngFilePath)) {
        throw new Error('pdftoppm no generó archivo PNG');
      }
      
      const imageBuffer = fs.readFileSync(pngFilePath);
      base64Image = imageBuffer.toString('base64');
      
      console.log('✅ PDF convertido a imagen correctamente con pdftoppm');
      console.log('🖼️ Base64 length:', base64Image.length);
      
      // Limpiar archivos temporales
      try {
        fs.unlinkSync(tempPdfPath);
        fs.unlinkSync(pngFilePath);
      } catch (cleanupErr) {
        console.warn('⚠️ No se pudieron limpiar archivos temporales');
      }
    } catch (pdfError: any) {
      console.error('❌ Error convirtiendo PDF:', pdfError.message);
      return res.status(400).json({ 
        error: 'Error al procesar el archivo PDF. Asegúrate de que sea un PDF válido.',
        details: pdfError.message 
      });
    }

    console.log('🤖 Enviando imagen a OpenAI Vision para extracción...');

    // Llamar a OpenAI Vision API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract all data from this shipping debit note document.
                
Return a JSON object with these fields:
- container_number: the container number (look for "CNT No:" field, format like WHSU6463903)
- bl_number: the BL number if present
- invoice_number: Job No or Inv No
- eta: the ETA date (look for "ETA:" field, return in format YYYY-MM-DD)
- total_usd: the total amount from "Balance" or "Total" row (should be around 4000)
- line_items: array of objects with "description" and "amount_usd" for each charge in the Debit column

Return ONLY the JSON, no markdown or explanation.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('❌ Error OpenAI:', errorText);
      return res.status(500).json({ error: 'Error al procesar imagen con IA', details: errorText });
    }

    const openaiData: any = await openaiResponse.json();
    console.log('🔍 OpenAI RAW response:', JSON.stringify(openaiData, null, 2));
    const aiContent = openaiData.choices?.[0]?.message?.content || '';

    console.log('📊 Respuesta de OpenAI (aiContent):', aiContent);
    console.log('📊 Tipo de aiContent:', typeof aiContent);
    console.log('📊 Longitud de aiContent:', aiContent.length);

    // Parsear el JSON de la respuesta
    let extractedData: Partial<DebitNoteExtraction>;
    try {
      // Limpiar el contenido por si viene con markdown
      let cleanJson = aiContent
        .replace(/```json\n?/gi, '')
        .replace(/```\n?/g, '')
        .replace(/^\s*[\r\n]/gm, '')
        .trim();
      
      // Intentar encontrar el JSON si hay texto antes o después
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }
      
      extractedData = JSON.parse(cleanJson);
    } catch (parseError: any) {
      console.error('❌ Error parseando JSON de OpenAI:', parseError.message);
      console.error('Contenido recibido:', aiContent);
      return res.status(500).json({ 
        error: 'No se pudo interpretar los datos del PDF. Intenta con otro archivo.',
        raw_response: aiContent.substring(0, 500)
      });
    }

    // Validar que el número de contenedor coincida (solo advertencia, no bloquea)
    const extractedContainer = extractedData.container_number?.toUpperCase().replace(/\s/g, '') || '';
    const expectedContainer = containerNumber.toUpperCase().replace(/\s/g, '');
    let containerWarning = '';
    
    // Solo advertir si se extrajo un número de contenedor válido que no coincide
    if (extractedContainer && extractedContainer !== 'UNKNOWN' && extractedContainer !== 'NULL' && extractedContainer.length > 5) {
      if (!extractedContainer.includes(expectedContainer) && !expectedContainer.includes(extractedContainer)) {
        console.warn(`⚠️ Contenedor no coincide: PDF=${extractedContainer}, Esperado=${expectedContainer}`);
        containerWarning = `Nota: El contenedor extraído (${extractedContainer}) no coincide con ${expectedContainer}. Verifica que sea el archivo correcto.`;
        // Ya no bloqueamos, solo advertimos
      }
    } else {
      console.log('⚠️ No se pudo extraer número de contenedor del PDF, usando el del sistema');
    }
    
    // Usar el contenedor del sistema si no se extrajo correctamente
    if (!extractedContainer || extractedContainer === 'UNKNOWN' || extractedContainer === 'NULL') {
      extractedData.container_number = containerNumber;
    }

    // Calcular el total en USD
    let totalUsd = extractedData.total_usd || 0;
    if (!totalUsd && extractedData.line_items && extractedData.line_items.length > 0) {
      totalUsd = extractedData.line_items.reduce((sum, item) => sum + (item.amount_usd || 0), 0);
    }

    // Convertir a MXN usando el tipo de cambio
    const totalMxn = Math.round(totalUsd * exchangeRate * 100) / 100;

    // Preparar respuesta con la conversión
    const result: DebitNoteExtraction = {
      ...extractedData as DebitNoteExtraction,
      total_usd: Math.round(totalUsd * 100) / 100,
      total_mxn: totalMxn,
      exchange_rate: exchangeRate,
      line_items: extractedData.line_items || []
    };

    // También calcular THC en MXN si existe
    const thcMxn = result.thc_usd ? Math.round(result.thc_usd * exchangeRate * 100) / 100 : null;

    // Actualizar ETA en el contenedor si se extrajo
    if (extractedData.eta) {
      try {
        const etaDate = new Date(extractedData.eta);
        if (!isNaN(etaDate.getTime())) {
          await pool.query(
            'UPDATE containers SET eta = $1, updated_at = NOW() WHERE id = $2',
            [etaDate, containerId]
          );
          console.log(`📅 ETA actualizado en contenedor: ${extractedData.eta}`);
        }
      } catch (etaError) {
        console.warn('⚠️ No se pudo actualizar ETA:', etaError);
      }
    }

    console.log(`✅ Extracción completada: $${totalUsd.toFixed(2)} USD → $${totalMxn.toFixed(2)} MXN (TC: ${exchangeRate})`);

    res.json({
      success: true,
      extraction: result,
      conversion: {
        total_usd: result.total_usd,
        exchange_rate: exchangeRate,
        total_mxn: totalMxn,
        thc_mxn: thcMxn
      },
      validated_container: containerNumber,
      extracted_eta: extractedData.eta || null,
      warning: containerWarning || undefined,
      message: `✅ Contenedor ${containerNumber}. ${result.line_items.length} conceptos extraídos. Total: $${totalUsd.toFixed(2)} USD = $${formatCurrency(totalMxn)} MXN${containerWarning ? ' ⚠️' : ''}${extractedData.eta ? ` ETA: ${extractedData.eta}` : ''}`
    });

  } catch (error: any) {
    console.error('Error extrayendo datos de nota de débito:', error);
    res.status(500).json({ error: 'Error al procesar PDF', details: error.message });
  }
};

// Subir archivo PDF para un campo de costo específico
export const uploadCostPdf = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    const { containerId, fieldName } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No se proporcionó archivo' });
    }

    if (!containerId) {
      return res.status(400).json({ error: 'Container ID requerido' });
    }

    if (!fieldName || !VALID_PDF_FIELDS.includes(fieldName)) {
      return res.status(400).json({ error: 'Campo inválido para archivo PDF' });
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.pdf';
    const filename = `container_${containerId}_${fieldName}_${timestamp}${ext}`;
    
    let publicUrl: string;

    // Usar S3 si está configurado, sino almacenamiento local
    if (isS3Configured()) {
      console.log('☁️ Subiendo archivo a AWS S3...');
      const s3Key = `costs/${filename}`;
      const contentType = file.mimetype || 'application/pdf';
      publicUrl = await uploadToS3(file.buffer, s3Key, contentType);
      console.log(`✅ Archivo subido a S3: ${publicUrl}`);
    } else {
      console.log('💾 Usando almacenamiento local (S3 no configurado)');
      // Crear directorio de uploads si no existe
      const uploadsDir = path.join(__dirname, '..', 'uploads', 'costs');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, file.buffer);

      // Generar URL pública (relativa al servidor)
      const baseUrl = process.env.API_URL || 'http://localhost:3001';
      publicUrl = `${baseUrl}/uploads/costs/${filename}`;
    }

    // Actualizar la base de datos con la URL del archivo
    await pool.query(`
      INSERT INTO container_costs (container_id, ${fieldName})
      VALUES ($1, $2)
      ON CONFLICT (container_id) DO UPDATE SET
        ${fieldName} = EXCLUDED.${fieldName},
        updated_at = NOW()
    `, [containerId, publicUrl]);

    console.log(`📎 Archivo subido: ${filename} para contenedor ${containerId}`);

    res.json({ 
      success: true, 
      url: publicUrl,
      filename: filename,
      field: fieldName
    });
  } catch (error: any) {
    console.error('Error subiendo archivo PDF:', error);
    res.status(500).json({ error: 'Error al subir archivo: ' + error.message });
  }
};

// Descargar PDF desde S3 (proxy para evitar CORS/permisos)
export const downloadPdf = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL requerida' });
    }

    console.log(`📥 Descargando PDF desde: ${url}`);

    // Si es URL de S3, generar URL firmada o descargar directamente
    if (url.includes('s3.') || url.includes('amazonaws.com')) {
      // Extraer la key de S3 de la URL
      const urlObj = new URL(url);
      const s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
      
      // Verificar si tenemos credenciales de S3
      if (isS3Configured()) {
        const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
        
        const s3Client = new S3Client({
          region: process.env.AWS_REGION || 'us-east-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
          }
        });

        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key
        });

        const response = await s3Client.send(command);
        
        // Convertir stream a buffer
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
        return res.send(buffer);
      }
    }

    // Fallback: intentar descargar con fetch
    const pdfResponse = await fetch(url);
    if (!pdfResponse.ok) {
      return res.status(404).json({ error: 'PDF no encontrado' });
    }

    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    res.send(buffer);

  } catch (error: any) {
    console.error('Error descargando PDF:', error);
    res.status(500).json({ error: 'Error al descargar PDF: ' + error.message });
  }
};

// ========== TARIFAS MARÍTIMAS ==========

// Obtener todas las tarifas
export const getMaritimeRates = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT * FROM maritime_rates 
      ORDER BY is_active DESC, rate_name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching maritime rates:', error);
    res.status(500).json({ error: 'Error al obtener tarifas' });
  }
};

// Obtener tarifa activa (para cálculos)
export const getActiveMaritimeRate = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT * FROM maritime_rates 
      WHERE is_active = true 
      ORDER BY id ASC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay tarifa activa configurada' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching active rate:', error);
    res.status(500).json({ error: 'Error al obtener tarifa activa' });
  }
};

// Crear tarifa
export const createMaritimeRate = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { rateName, costPerCbm, costPerKg, minCbm, minCharge, appliesTo, notes } = req.body;
    
    if (!rateName || !costPerCbm) {
      return res.status(400).json({ error: 'Nombre y costo por CBM son requeridos' });
    }
    
    const result = await pool.query(`
      INSERT INTO maritime_rates (rate_name, cost_per_cbm, cost_per_kg, min_cbm, min_charge, applies_to, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [rateName, costPerCbm, costPerKg || 0, minCbm || 0, minCharge || 0, appliesTo || 'all', notes || null]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating maritime rate:', error);
    res.status(500).json({ error: 'Error al crear tarifa' });
  }
};

// Actualizar tarifa
export const updateMaritimeRate = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { rateName, costPerCbm, costPerKg, minCbm, minCharge, appliesTo, isActive, notes } = req.body;
    
    const result = await pool.query(`
      UPDATE maritime_rates SET
        rate_name = COALESCE($1, rate_name),
        cost_per_cbm = COALESCE($2, cost_per_cbm),
        cost_per_kg = COALESCE($3, cost_per_kg),
        min_cbm = COALESCE($4, min_cbm),
        min_charge = COALESCE($5, min_charge),
        applies_to = COALESCE($6, applies_to),
        is_active = COALESCE($7, is_active),
        notes = COALESCE($8, notes),
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [rateName, costPerCbm, costPerKg, minCbm, minCharge, appliesTo, isActive, notes, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarifa no encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating maritime rate:', error);
    res.status(500).json({ error: 'Error al actualizar tarifa' });
  }
};

// Eliminar tarifa
export const deleteMaritimeRate = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM maritime_rates WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarifa no encontrada' });
    }
    
    res.json({ message: 'Tarifa eliminada', id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting maritime rate:', error);
    res.status(500).json({ error: 'Error al eliminar tarifa' });
  }
};

// ========== UTILIDADES POR CONTENEDOR ==========

// Obtener desglose de utilidades de un contenedor
export const getContainerProfitBreakdown = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { containerId } = req.params;

    // Obtener datos del contenedor y sus costos
    const containerRes = await pool.query(`
      SELECT c.*, 
        c.exchange_rate_usd_mxn,
        c.collected_amount_usd,
        cc.calculated_release_cost as total_cost,
        cc.debit_note_amount, cc.demurrage_amount, cc.storage_amount,
        cc.maneuvers_amount, cc.custody_amount, cc.transport_amount,
        cc.advance_1_amount, cc.advance_2_amount, cc.advance_3_amount, cc.advance_4_amount,
        cc.other_amount, cc.calculated_aa_cost, cc.is_fully_costed,
        mr.fcl_price_usd as route_fcl_price
      FROM containers c
      LEFT JOIN container_costs cc ON cc.container_id = c.id
      LEFT JOIN maritime_routes mr ON mr.id = c.route_id
      WHERE c.id = $1
    `, [containerId]);

    // Obtener anticipos asignados desde tabla anticipo_referencias
    const anticiposRes = await pool.query(`
      SELECT COALESCE(SUM(ar.monto), 0) as total_anticipos
      FROM anticipo_referencias ar
      WHERE ar.container_id = $1
    `, [containerId]);
    const totalAnticiposFromTable = parseFloat(anticiposRes.rows[0]?.total_anticipos) || 0;

    if (containerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Contenedor no encontrado' });
    }

    const container = containerRes.rows[0];
    
    // Tipo de cambio congelado del contenedor (o fallback a valor actual)
    const exchangeRate = parseFloat(container.exchange_rate_usd_mxn) || 20.50;

    // Obtener LOGs del contenedor desde maritime_orders
    const shipmentsRes = await pool.query(`
      SELECT 
        mo.id,
        mo.ordersn as log_number,
        mo.bl_client_name as client_name,
        mo.bl_client_code as client_code,
        mo.summary_boxes as box_count,
        mo.summary_weight as weight_kg,
        mo.summary_volume as volume_cbm,
        mo.summary_description as description,
        mo.brand_type,
        mo.has_battery,
        mo.has_liquid,
        mo.is_pickup,
        mo.status,
        u.full_name as user_name,
        u.box_id,
        u.email
      FROM maritime_orders mo
      LEFT JOIN users u ON u.id = mo.user_id
      WHERE mo.container_id = $1
      ORDER BY mo.ordersn ASC
    `, [containerId]);
    
    // ========== DETECTAR SI ES FCL (sin LOGs) ==========
    const isFCL = shipmentsRes.rows.length === 0;
    
    if (isFCL) {
      // ========== LÓGICA FCL ==========
      const totalCbm = parseFloat(container.total_cbm) || 0;
      const totalKg = parseFloat(container.total_weight_kg) || 0;
      const totalPackages = parseInt(container.total_packages) || 1;
      
      // Buscar tarifa FCL del cliente si existe client_user_id
      let fclPriceUsd = 0;
      let fclCurrency = 'USD';
      let clientName = container.consignee || 'Cliente FCL';
      let priceSource = 'Sin tarifa configurada';
      
      // Buscar legacy_client_id asociado al usuario del contenedor
      let legacyClientId: number | null = container.legacy_client_id || null;
      
      // Si hay legacy_client_id directo, obtener nombre
      if (legacyClientId) {
        const legacyRes = await pool.query(
          'SELECT full_name FROM legacy_clients WHERE id = $1',
          [legacyClientId]
        );
        if (legacyRes.rows.length > 0) {
          clientName = legacyRes.rows[0].full_name;
        }
      }
      // Si no hay legacy_client_id pero hay client_user_id, buscar su legacy_client
      else if (container.client_user_id) {
        // Buscar el box_id del usuario
        const userRes = await pool.query(
          'SELECT box_id FROM users WHERE id = $1',
          [container.client_user_id]
        );
        if (userRes.rows.length > 0 && userRes.rows[0].box_id) {
          // Buscar el legacy_client con ese box_id
          const legacyRes = await pool.query(
            'SELECT id, full_name FROM legacy_clients WHERE box_id = $1',
            [userRes.rows[0].box_id]
          );
          if (legacyRes.rows.length > 0) {
            legacyClientId = legacyRes.rows[0].id;
            clientName = legacyRes.rows[0].full_name;
          }
        }
      }
      
      // Si no hay client_user_id, intentar buscar por consignee en legacy_clients
      if (!legacyClientId && container.consignee) {
        // Extraer el nombre de la empresa del consignee (antes de la coma o RFC)
        const companySearch = container.consignee.split(',')[0].trim().split(' RFC')[0].trim();
        const clientSearch = await pool.query(`
          SELECT id, full_name FROM legacy_clients 
          WHERE full_name ILIKE $1
          LIMIT 1
        `, [`%${companySearch}%`]);
        
        if (clientSearch.rows.length > 0) {
          legacyClientId = clientSearch.rows[0].id;
          clientName = clientSearch.rows[0].full_name;
        }
      }
      
      // Buscar tarifa personalizada del cliente para esta ruta
      if (legacyClientId && container.route_id) {
        const clientRateRes = await pool.query(`
          SELECT custom_price_usd, currency, is_wholesale
          FROM fcl_client_rates
          WHERE legacy_client_id = $1 AND route_id = $2
        `, [legacyClientId, container.route_id]);
        
        if (clientRateRes.rows.length > 0) {
          const rate = clientRateRes.rows[0];
          fclPriceUsd = parseFloat(rate.custom_price_usd) || 0;
          fclCurrency = rate.currency || 'USD';
          priceSource = rate.is_wholesale 
            ? `Tarifa Mayorista Cliente (${fclCurrency})` 
            : `Tarifa Cliente (${fclCurrency})`;
        }
      }
      
      // Si no hay tarifa de cliente, usar tarifa base de la ruta
      if (fclPriceUsd === 0 && container.route_fcl_price) {
        fclPriceUsd = parseFloat(container.route_fcl_price) || 0;
        fclCurrency = 'USD';
        priceSource = 'Tarifa Base Ruta (USD)';
      }
      
      // Calcular venta según moneda
      let totalEstimatedRevenueUsd = 0;
      let totalEstimatedRevenueMxn = 0;
      
      if (fclCurrency === 'USD') {
        totalEstimatedRevenueUsd = fclPriceUsd;
        totalEstimatedRevenueMxn = fclPriceUsd * exchangeRate;
      } else {
        // Si está en MXN, el precio ya está en pesos
        totalEstimatedRevenueMxn = fclPriceUsd; // En este caso fclPriceUsd es realmente MXN
        totalEstimatedRevenueUsd = fclPriceUsd / exchangeRate;
      }
      
      // Calcular costos
      const debitNote = parseFloat(container.debit_note_amount) || 0;
      const demurrage = parseFloat(container.demurrage_amount) || 0;
      const storage = parseFloat(container.storage_amount) || 0;
      const maneuvers = parseFloat(container.maneuvers_amount) || 0;
      const custody = parseFloat(container.custody_amount) || 0;
      const transport = parseFloat(container.transport_amount) || 0;
      const other = parseFloat(container.other_amount) || 0;
      const totalCost = debitNote + demurrage + storage + totalAnticiposFromTable + maneuvers + custody + transport + other;
      
      // Utilidad
      const estimatedProfit = totalEstimatedRevenueMxn - totalCost;
      const profitMargin = totalEstimatedRevenueMxn > 0 ? ((estimatedProfit / totalEstimatedRevenueMxn) * 100) : 0;
      
      // Cobranza
      const collectedAmountUsd = parseFloat(container.collected_amount_usd) || 0;
      const collectionPercentage = totalEstimatedRevenueUsd > 0 
        ? Math.min((collectedAmountUsd / totalEstimatedRevenueUsd) * 100, 100) 
        : 0;
      
      // Crear "embarque" virtual para FCL (el contenedor mismo)
      const fclShipment = {
        id: container.id,
        log_number: `FCL-${container.container_number}`,
        client_name: clientName,
        box_id: null,
        box_count: totalPackages,
        weight_kg: totalKg,
        volume_cbm: totalCbm,
        cbm: totalCbm,
        kg: totalKg,
        description: container.goods_description || 'Contenedor Completo (FCL)',
        brand_type: 'FCL',
        status: container.status,
        estimated_charge: fclCurrency === 'USD' ? fclPriceUsd : (fclPriceUsd / exchangeRate),
        charge_type: 'FCL',
        applied_category: 'Full Container Load',
        applied_rate: fclPriceUsd,
        price_breakdown: fclPriceUsd > 0 
          ? `Tarifa FCL: ${fclCurrency === 'USD' ? '$' : ''}${fclPriceUsd.toFixed(2)} ${fclCurrency}`
          : 'Sin tarifa configurada'
      };

      return res.json({
        container: {
          id: container.id,
          container_number: container.container_number,
          bl_number: container.bl_number,
          status: container.status,
          is_fully_costed: container.is_fully_costed,
          exchange_rate: exchangeRate,
          is_fcl: true
        },
        costs: {
          naviera: { debit_note: debitNote, demurrage: demurrage, storage: storage },
          aduana: { customs_aa: totalAnticiposFromTable },
          logistica: { maneuvers, custody, transport, advances: totalAnticiposFromTable, other },
          total: totalCost
        },
        shipments: [fclShipment],
        summary: {
          total_shipments: 1,
          total_cbm: Math.round(totalCbm * 1000) / 1000,
          total_kg: Math.round(totalKg * 100) / 100,
          total_cost_mxn: Math.round(totalCost * 100) / 100,
          total_estimated_revenue_usd: Math.round(totalEstimatedRevenueUsd * 100) / 100,
          total_estimated_revenue_mxn: Math.round(totalEstimatedRevenueMxn * 100) / 100,
          exchange_rate: exchangeRate,
          estimated_profit_mxn: Math.round(estimatedProfit * 100) / 100,
          profit_margin_percent: Math.round(profitMargin * 100) / 100,
          collected_amount_usd: Math.round(collectedAmountUsd * 100) / 100,
          collection_percentage: Math.round(collectionPercentage * 100) / 100,
          rate_used: priceSource,
          pricing_currency: fclCurrency,
          pricing_note: fclCurrency === 'USD' 
            ? `Cobros en USD × TC ${exchangeRate} = MXN. Costos en MXN.`
            : `Cobros en MXN. Costos en MXN.`
        }
      });
    }
    
    // ========== LÓGICA LCL (código existente) ==========

    // Obtener todas las categorías y tiers para el cálculo
    const categoriesRes = await pool.query(`
      SELECT id, name, surcharge_per_cbm FROM pricing_categories WHERE is_active = TRUE
    `);
    const categories = categoriesRes.rows;
    
    const tiersRes = await pool.query(`
      SELECT pt.*, pc.name as category_name 
      FROM pricing_tiers pt
      JOIN pricing_categories pc ON pt.category_id = pc.id
      WHERE pt.is_active = TRUE
      ORDER BY pt.category_id, pt.min_cbm
    `);
    const allTiers = tiersRes.rows;

    // Función helper para mapear brand_type a nombre de categoría
    const mapBrandTypeToCategory = (brandType: string | null): string => {
      switch (brandType?.toLowerCase()) {
        case 'generic': return 'Generico';
        case 'sensitive': return 'Sensible';
        case 'logo': return 'Logotipo';
        case 'startup': return 'StartUp';
        default: return 'Generico';
      }
    };

    // Función para calcular el precio según categoría y CBM
    const calculatePriceForShipment = (cbm: number, weightKg: number, brandType: string | null): {
      estimatedCharge: number;
      chargeType: string;
      appliedCategory: string;
      appliedRate: number;
      breakdown: string;
    } => {
      // 1. Determinar categoría original
      let originalCategory = mapBrandTypeToCategory(brandType);
      let appliedCategory = originalCategory;
      
      // 2. Calcular CBM cobrable (físico vs volumétrico)
      const volumetricCbm = weightKg / 600; // Factor marítimo
      let chargeableCbm = Math.max(cbm, volumetricCbm);
      
      // 3. Reglas especiales de CBM
      if (chargeableCbm <= 0.75) {
        // Tarifa StartUp para envíos pequeños
        appliedCategory = 'StartUp';
      } else if (chargeableCbm >= 0.76 && chargeableCbm < 1) {
        // Redondear a 1 CBM
        chargeableCbm = 1;
      }
      
      // 4. Buscar categoría en la BD
      // Para Logotipo, usamos Genérico como base + surcharge
      const baseCategoryName = appliedCategory === 'Logotipo' ? 'Generico' : appliedCategory;
      const category = categories.find(c => c.name === baseCategoryName);
      
      if (!category) {
        // Fallback a tarifa genérica
        return {
          estimatedCharge: chargeableCbm * 899, // Tarifa base
          chargeType: 'CBM',
          appliedCategory: 'Generico (fallback)',
          appliedRate: 899,
          breakdown: `${chargeableCbm.toFixed(2)} m³ × $899 = $${(chargeableCbm * 899).toFixed(2)}`
        };
      }
      
      // 5. Buscar tier correcto para el CBM
      const categoryTiers = allTiers.filter(t => t.category_id === category.id);
      let tier = categoryTiers.find(t => 
        chargeableCbm >= parseFloat(t.min_cbm) && chargeableCbm <= parseFloat(t.max_cbm)
      );
      
      // Si no encuentra tier, usar el último (mayor volumen)
      if (!tier && categoryTiers.length > 0) {
        tier = categoryTiers[categoryTiers.length - 1];
      }
      
      if (!tier) {
        return {
          estimatedCharge: chargeableCbm * 899,
          chargeType: 'CBM',
          appliedCategory: appliedCategory + ' (sin tier)',
          appliedRate: 899,
          breakdown: `${chargeableCbm.toFixed(2)} m³ × $899 = $${(chargeableCbm * 899).toFixed(2)}`
        };
      }
      
      // 6. Calcular precio final
      let estimatedCharge = 0;
      let breakdown = '';
      const tierPrice = parseFloat(tier.price);
      
      // Surcharge para Logotipo
      const logoSurcharge = originalCategory === 'Logotipo' ? 100 : 0;
      
      if (tier.is_flat_fee) {
        // Tarifa plana (StartUp)
        estimatedCharge = tierPrice;
        breakdown = `Tarifa plana ${appliedCategory}: $${tierPrice.toFixed(2)}`;
      } else {
        // Tarifa por CBM
        const rateWithSurcharge = tierPrice + logoSurcharge;
        estimatedCharge = chargeableCbm * rateWithSurcharge;
        
        if (logoSurcharge > 0) {
          breakdown = `${chargeableCbm.toFixed(2)} m³ × ($${tierPrice} + $${logoSurcharge} logo) = $${estimatedCharge.toFixed(2)}`;
        } else {
          breakdown = `${chargeableCbm.toFixed(2)} m³ × $${tierPrice}/m³ = $${estimatedCharge.toFixed(2)}`;
        }
      }
      
      return {
        estimatedCharge: Math.round(estimatedCharge * 100) / 100,
        chargeType: tier.is_flat_fee ? 'PLANA' : 'CBM',
        appliedCategory,
        appliedRate: tierPrice + logoSurcharge,
        breakdown
      };
    };

    // Calcular cobro estimado por cada shipment usando el motor de tarifas
    const shipmentsWithCharges = shipmentsRes.rows.map((shipment: any) => {
      const cbm = parseFloat(shipment.volume_cbm) || 0;
      const kg = parseFloat(shipment.weight_kg) || 0;
      
      const priceCalc = calculatePriceForShipment(cbm, kg, shipment.brand_type);

      // Priorizar datos del usuario si está asignado, sino usar datos del BL
      const clientName = shipment.user_name || shipment.client_name || 'Sin asignar';
      const clientCode = shipment.box_id || shipment.client_code || null;

      return {
        ...shipment,
        cbm,
        kg,
        client_name: clientName,
        box_id: clientCode,
        estimated_charge: priceCalc.estimatedCharge,
        charge_type: priceCalc.chargeType,
        applied_category: priceCalc.appliedCategory,
        applied_rate: priceCalc.appliedRate,
        price_breakdown: priceCalc.breakdown
      };
    });

    // Calcular totales
    const totalCbm = shipmentsWithCharges.reduce((sum: number, s: any) => sum + s.cbm, 0);
    const totalKg = shipmentsWithCharges.reduce((sum: number, s: any) => sum + s.kg, 0);
    // Cobros están en USD
    const totalEstimatedRevenueUsd = shipmentsWithCharges.reduce((sum: number, s: any) => sum + s.estimated_charge, 0);
    // Convertir a MXN usando tipo de cambio congelado
    const totalEstimatedRevenueMxn = totalEstimatedRevenueUsd * exchangeRate;
    
    // Calcular costo total real sumando todos los componentes
    // Incluir anticipos desde tabla anticipo_referencias (no desde campos legacy advance_*_amount)
    const debitNote = parseFloat(container.debit_note_amount) || 0;
    const demurrage = parseFloat(container.demurrage_amount) || 0;
    const storage = parseFloat(container.storage_amount) || 0;
    const maneuvers = parseFloat(container.maneuvers_amount) || 0;
    const custody = parseFloat(container.custody_amount) || 0;
    const transport = parseFloat(container.transport_amount) || 0;
    const other = parseFloat(container.other_amount) || 0;
    
    // Costo total = Naviera (debit+demurrage+storage) + Anticipos + Logística (maniobras+custodia+transporte+otros)
    const totalCost = debitNote + demurrage + storage + totalAnticiposFromTable + maneuvers + custody + transport + other;
    // Utilidad en MXN
    const estimatedProfit = totalEstimatedRevenueMxn - totalCost;
    const profitMargin = totalEstimatedRevenueMxn > 0 ? ((estimatedProfit / totalEstimatedRevenueMxn) * 100) : 0;
    
    // Monto cobrado y porcentaje de cobranza
    const collectedAmountUsd = parseFloat(container.collected_amount_usd) || 0;
    const collectionPercentage = totalEstimatedRevenueUsd > 0 
      ? Math.min((collectedAmountUsd / totalEstimatedRevenueUsd) * 100, 100) 
      : 0;

    res.json({
      container: {
        id: container.id,
        container_number: container.container_number,
        bl_number: container.bl_number,
        status: container.status,
        is_fully_costed: container.is_fully_costed,
        exchange_rate: exchangeRate
      },
      costs: {
        naviera: {
          debit_note: debitNote,
          demurrage: demurrage,
          storage: storage
        },
        aduana: {
          customs_aa: totalAnticiposFromTable  // Usar anticipos de tabla real
        },
        logistica: {
          maneuvers: maneuvers,
          custody: custody,
          transport: transport,
          advances: totalAnticiposFromTable,  // Usar anticipos de tabla real
          other: other
        },
        total: totalCost
      },
      shipments: shipmentsWithCharges,
      summary: {
        total_shipments: shipmentsWithCharges.length,
        total_cbm: Math.round(totalCbm * 1000) / 1000,
        total_kg: Math.round(totalKg * 100) / 100,
        // Costos en MXN
        total_cost_mxn: Math.round(totalCost * 100) / 100,
        // Venta estimada en USD y MXN
        total_estimated_revenue_usd: Math.round(totalEstimatedRevenueUsd * 100) / 100,
        total_estimated_revenue_mxn: Math.round(totalEstimatedRevenueMxn * 100) / 100,
        // Tipo de cambio usado
        exchange_rate: exchangeRate,
        // Utilidad en MXN
        estimated_profit_mxn: Math.round(estimatedProfit * 100) / 100,
        profit_margin_percent: Math.round(profitMargin * 100) / 100,
        // Cobranza
        collected_amount_usd: Math.round(collectedAmountUsd * 100) / 100,
        collection_percentage: Math.round(collectionPercentage * 100) / 100,
        rate_used: 'Motor de Tarifas por Categoría',
        pricing_note: `Cobros en USD × TC ${exchangeRate} = MXN. Costos en MXN.`
      }
    });
  } catch (error) {
    console.error('Error getting container profit breakdown:', error);
    res.status(500).json({ error: 'Error al obtener desglose de utilidades' });
  }
};

// Calcular costo estimado de un paquete marítimo
export const calculateShipmentCost = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { volume, weight } = req.body;
    
    if (!volume && !weight) {
      return res.status(400).json({ error: 'Se requiere volumen o peso' });
    }
    
    // Obtener tarifa activa
    const rateResult = await pool.query(`
      SELECT * FROM maritime_rates WHERE is_active = true ORDER BY id ASC LIMIT 1
    `);
    
    if (rateResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay tarifa activa configurada' });
    }
    
    const rate = rateResult.rows[0];
    const cbm = parseFloat(volume) || 0;
    const kg = parseFloat(weight) || 0;
    
    // Calcular costo por CBM
    let costByCbm = cbm * parseFloat(rate.cost_per_cbm);
    
    // Aplicar mínimo de CBM si es necesario
    if (cbm < parseFloat(rate.min_cbm)) {
      costByCbm = parseFloat(rate.min_cbm) * parseFloat(rate.cost_per_cbm);
    }
    
    // Calcular costo por peso (si aplica)
    const costByWeight = kg * parseFloat(rate.cost_per_kg);
    
    // El costo final es el mayor entre CBM y peso
    let estimatedCost = Math.max(costByCbm, costByWeight);
    
    // Aplicar cargo mínimo si es necesario
    if (estimatedCost < parseFloat(rate.min_charge)) {
      estimatedCost = parseFloat(rate.min_charge);
    }
    
    res.json({
      volume: cbm,
      weight: kg,
      costPerCbm: parseFloat(rate.cost_per_cbm),
      costPerKg: parseFloat(rate.cost_per_kg),
      costByCbm,
      costByWeight,
      minCharge: parseFloat(rate.min_charge),
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      currency: 'MXN',
      rateName: rate.rate_name
    });
  } catch (error) {
    console.error('Error calculating shipment cost:', error);
    res.status(500).json({ error: 'Error al calcular costo' });
  }
};
