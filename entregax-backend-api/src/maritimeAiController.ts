// ============================================
// CONTROLADOR MARÍTIMO CON IA
// Extracción automática de LOG (LCL) y BL (FCL) con OpenAI Vision
// ============================================

import { Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import OpenAI from 'openai';

// Lazy initialization - only create OpenAI client when API key exists
let openaiInstance: OpenAI | null = null;
const getOpenAI = (): OpenAI => {
    if (!openaiInstance) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY no configurada');
        }
        openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiInstance;
};

// Proxy para mantener compatibilidad con código existente (openai.chat.completions.create)
const openai = new Proxy({} as OpenAI, {
    get(_, prop) {
        return getOpenAI()[prop as keyof OpenAI];
    }
});

// ========== 1. EXTRACCIÓN IA ==========

/**
 * Extraer datos de un LOG de Sanky (LCL - Carga Suelta)
 * La IA lee el documento y extrae: logNumber, boxCount, weightKg, volumeCbm, clientCode, brandType
 */
export const extractLogDataLcl = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { fileUrl, fileBase64 } = req.body;

    if (!fileUrl && !fileBase64) {
      return res.status(400).json({ error: 'Se requiere fileUrl o fileBase64' });
    }

    const prompt = `Analiza este documento de recepción marítima (LOG de Sanky).
Extrae la información en formato JSON con estos campos:
{
  "logNumber": "número del LOG (ej: L-12345)",
  "boxCount": número de cajas/bultos,
  "weightKg": peso en kilogramos,
  "volumeCbm": volumen en metros cúbicos,
  "clientCodeRaw": "código del cliente con sufijo (ej: S3117L o S3117G)",
  "brandType": "Logo" si termina en L, "Generico" si termina en G,
  "productDescription": "descripción breve del producto"
}

Si no puedes leer algún campo, ponlo como null.
Responde SOLO con el JSON, sin explicaciones.`;

    const imageContent = fileBase64 
      ? { type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${fileBase64}` } }
      : { type: "image_url" as const, image_url: { url: fileUrl } };

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Eres un asistente experto en logística marítima que extrae datos de documentos." },
        { role: "user", content: [{ type: "text", text: prompt }, imageContent] }
      ],
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const extractedData = JSON.parse(content);

    res.json({ 
      success: true, 
      extractedData,
      confidence: extractedData.logNumber ? 'high' : 'low'
    });
  } catch (error: any) {
    console.error('Error OCR LOG:', error);
    res.status(500).json({ 
      error: 'Error al procesar documento con IA',
      details: error.message 
    });
  }
};

/**
 * Extraer datos de un Bill of Lading (BL) para FCL
 * La IA lee el BL y extrae: blNumber, containerNumber, eta, weightKg, volumeCbm
 */
export const extractBlDataFcl = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { fileUrl, fileBase64 } = req.body;

    if (!fileUrl && !fileBase64) {
      return res.status(400).json({ error: 'Se requiere fileUrl o fileBase64' });
    }

    const prompt = `Analiza este Bill of Lading (BL) de embarque marítimo.
Extrae la información en formato JSON:
{
  "blNumber": "número del BL (ej: MSCUXXXXXXX)",
  "containerNumber": "número del contenedor (ej: MSKU1234567)",
  "eta": "fecha estimada de llegada en formato YYYY-MM-DD",
  "pol": "puerto de origen",
  "pod": "puerto de destino",
  "weightKg": peso total en kg,
  "volumeCbm": volumen en m³,
  "consignee": "nombre del consignatario/cliente"
}

Si no puedes leer algún campo, ponlo como null.
Responde SOLO con el JSON.`;

    const imageContent = fileBase64 
      ? { type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${fileBase64}` } }
      : { type: "image_url" as const, image_url: { url: fileUrl } };

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Eres un experto en comercio internacional que extrae datos de Bills of Lading." },
        { role: "user", content: [{ type: "text", text: prompt }, imageContent] }
      ],
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const extractedData = JSON.parse(content);

    res.json({ 
      success: true, 
      extractedData,
      confidence: extractedData.blNumber ? 'high' : 'low'
    });
  } catch (error: any) {
    console.error('Error OCR BL:', error);
    res.status(500).json({ 
      error: 'Error al procesar BL con IA',
      details: error.message 
    });
  }
};

// ========== 2. GUARDAR RECEPCIONES ==========

/**
 * Guardar recepción LCL (LOG de Sanky)
 * - Inicia en estado 'received_origin' (Bodega China)
 * - is_ready_for_consolidation = FALSE hasta que el cliente suba el Packing List
 */
export const saveLclReception = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { 
      logNumber, 
      boxCount, 
      weightKg, 
      volumeCbm, 
      clientCodeRaw, 
      brandType,
      productDescription,
      fileUrl,
      notes
    } = req.body;

    if (!logNumber) {
      return res.status(400).json({ error: 'Se requiere el número de LOG' });
    }

    // Buscar cliente por código (sin el sufijo L o G)
    const baseCode = clientCodeRaw?.replace(/[LG]$/i, '').trim();
    let userId = null;
    let shippingMark = baseCode;

    if (baseCode) {
      const userRes = await pool.query(
        'SELECT id, box_id FROM users WHERE box_id = $1 OR shipping_mark = $1',
        [baseCode]
      );
      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
        shippingMark = userRes.rows[0].box_id || baseCode;
      }
    }

    // Verificar si ya existe el LOG
    const existingLog = await pool.query(
      'SELECT id FROM maritime_shipments WHERE log_number = $1',
      [logNumber]
    );

    if (existingLog.rows.length > 0) {
      return res.status(400).json({ error: `El LOG ${logNumber} ya existe` });
    }

    // Crear el registro LCL
    const result = await pool.query(`
      INSERT INTO maritime_shipments 
      (log_number, user_id, shipping_mark, client_code, brand_type, box_count, 
       weight_kg, volume_cbm, product_type, sanky_doc_url, status, 
       is_ready_for_consolidation, received_at_origin)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'received_origin', FALSE, NOW())
      RETURNING *
    `, [
      logNumber, 
      userId, 
      shippingMark, 
      clientCodeRaw, 
      brandType,
      boxCount || 0, 
      weightKg || 0, 
      volumeCbm || 0, 
      productDescription || notes,
      fileUrl
    ]);

    // Si hay cliente asignado, crear notificación
    if (userId) {
      await pool.query(`
        INSERT INTO notifications (user_id, title, message, type, icon, data)
        VALUES ($1, $2, $3, 'warning', 'ship', $4)
      `, [
        userId,
        '📦 Nueva mercancía en China',
        `Recibimos tu LOG ${logNumber}. Sube tu Packing List para continuar el proceso.`,
        JSON.stringify({ logNumber, shipmentId: result.rows[0].id })
      ]);
    }

    res.json({ 
      success: true,
      message: userId 
        ? 'LOG creado. Esperando que el cliente suba el Packing List.' 
        : 'LOG creado SIN cliente asignado. Asigna manualmente.',
      shipment: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error saving LCL:', error);
    res.status(500).json({ error: 'Error al guardar LOG', details: error.message });
  }
};

/**
 * Crear o actualizar contenedor FCL con BL
 * - Si el contenedor ya existe en bodega, lo actualiza y pasa a 'in_transit'
 * - Si no existe, lo crea directamente en 'in_transit'
 */
export const saveFclWithBl = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const {
      containerNumber,
      blNumber,
      eta,
      weightKg,
      volumeCbm,
      fileUrl,
      clientUserId,
      notes
    } = req.body;

    if (!containerNumber && !blNumber) {
      return res.status(400).json({ error: 'Se requiere containerNumber o blNumber' });
    }

    // UPSERT: Si existe el contenedor, actualizamos. Si no, creamos.
    const result = await pool.query(`
      INSERT INTO containers 
      (container_number, bl_number, type, eta, total_weight_kg, total_cbm, 
       origin_evidence_url, client_user_id, notes, status)
      VALUES ($1, $2, 'FCL', $3, $4, $5, $6, $7, $8, 'in_transit')
      ON CONFLICT (container_number) DO UPDATE SET
        bl_number = COALESCE(EXCLUDED.bl_number, containers.bl_number),
        eta = COALESCE(EXCLUDED.eta, containers.eta),
        total_weight_kg = COALESCE(EXCLUDED.total_weight_kg, containers.total_weight_kg),
        total_cbm = COALESCE(EXCLUDED.total_cbm, containers.total_cbm),
        origin_evidence_url = COALESCE(EXCLUDED.origin_evidence_url, containers.origin_evidence_url),
        status = 'in_transit',
        updated_at = NOW()
      RETURNING *
    `, [
      containerNumber,
      blNumber,
      eta,
      weightKg || 0,
      volumeCbm || 0,
      fileUrl,
      clientUserId,
      notes
    ]);

    const container = result.rows[0];

    // Crear registro de costos si no existe
    await pool.query(`
      INSERT INTO container_costs (container_id) VALUES ($1)
      ON CONFLICT (container_id) DO NOTHING
    `, [container.id]);

    // Notificar al cliente si está asignado
    if (clientUserId) {
      await pool.query(`
        INSERT INTO notifications (user_id, title, message, type, icon, data)
        VALUES ($1, $2, $3, 'info', 'ship', $4)
      `, [
        clientUserId,
        '🚢 BL Cargado - Contenedor en Tránsito',
        `Tu contenedor ${containerNumber} ya tiene BL y está en camino. ETA: ${eta || 'Por confirmar'}`,
        JSON.stringify({ containerId: container.id, containerNumber })
      ]);
    }

    res.json({
      success: true,
      message: 'BL cargado. Contenedor en tránsito y listo para costeo.',
      container
    });
  } catch (error: any) {
    console.error('Error saving FCL:', error);
    res.status(500).json({ error: 'Error al guardar contenedor FCL', details: error.message });
  }
};

/**
 * Crear contenedor FCL vacío (sin BL aún) - En Bodega
 */
export const createFclInWarehouse = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { containerNumber, clientUserId, notes } = req.body;

    if (!containerNumber) {
      return res.status(400).json({ error: 'Se requiere containerNumber' });
    }

    const result = await pool.query(`
      INSERT INTO containers 
      (container_number, type, client_user_id, notes, status)
      VALUES ($1, 'FCL', $2, $3, 'received_origin')
      RETURNING *
    `, [containerNumber, clientUserId, notes]);

    // Crear registro de costos
    await pool.query(`
      INSERT INTO container_costs (container_id) VALUES ($1)
    `, [result.rows[0].id]);

    // Notificar al cliente
    if (clientUserId) {
      await pool.query(`
        INSERT INTO notifications (user_id, title, message, type, icon, data)
        VALUES ($1, $2, $3, 'info', 'inventory', $4)
      `, [
        clientUserId,
        '📦 Contenedor en Bodega China',
        `Tu contenedor ${containerNumber} está en bodega. Sube tu Packing List mientras esperamos el BL.`,
        JSON.stringify({ containerId: result.rows[0].id, containerNumber })
      ]);
    }

    res.json({
      success: true,
      message: 'Contenedor creado en bodega. Esperando BL para iniciar tránsito.',
      container: result.rows[0]
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un contenedor con ese número' });
    }
    console.error('Error creating FCL:', error);
    res.status(500).json({ error: 'Error al crear contenedor', details: error.message });
  }
};

// ========== 3. ACCIONES DEL CLIENTE ==========

/**
 * Cliente sube Packing List para LCL
 * Esto desbloquea el envío para consolidación
 */
export const uploadPackingListLcl = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { shipmentId } = req.params;
    const { packingListUrl, deliveryAddress, hasGex } = req.body;
    const userId = req.user?.userId;

    if (!packingListUrl) {
      return res.status(400).json({ error: 'Se requiere el archivo de Packing List' });
    }

    if (!deliveryAddress) {
      return res.status(400).json({ error: 'Se requiere la dirección de entrega' });
    }

    // Verificar que el envío pertenece al usuario
    const shipmentRes = await pool.query(
      'SELECT * FROM maritime_shipments WHERE id = $1 AND user_id = $2',
      [shipmentId, userId]
    );

    if (shipmentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Envío no encontrado o no autorizado' });
    }

    // Actualizar con PL y marcar como listo
    const result = await pool.query(`
      UPDATE maritime_shipments SET
        packing_list_url = $1,
        delivery_address = $2,
        has_gex = $3,
        is_ready_for_consolidation = TRUE,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [packingListUrl, deliveryAddress, hasGex || false, shipmentId]);

    res.json({
      success: true,
      message: '¡Packing List recibido! Tu mercancía está lista para consolidación.',
      shipment: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error uploading PL LCL:', error);
    res.status(500).json({ error: 'Error al procesar Packing List' });
  }
};

/**
 * Cliente sube Packing List para FCL
 */
export const uploadPackingListFcl = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { containerId } = req.params;
    const { packingListUrl, deliveryAddress, hasGex } = req.body;
    const userId = req.user?.userId;

    if (!packingListUrl) {
      return res.status(400).json({ error: 'Se requiere el archivo de Packing List' });
    }

    // Verificar que el contenedor pertenece al usuario
    const containerRes = await pool.query(
      'SELECT * FROM containers WHERE id = $1 AND client_user_id = $2',
      [containerId, userId]
    );

    if (containerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Contenedor no encontrado o no autorizado' });
    }

    // Actualizar con PL
    const result = await pool.query(`
      UPDATE containers SET
        packing_list_url = $1,
        delivery_address = $2,
        has_gex = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [packingListUrl, deliveryAddress, hasGex || false, containerId]);

    res.json({
      success: true,
      message: 'Packing List recibido para tu contenedor.',
      container: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error uploading PL FCL:', error);
    res.status(500).json({ error: 'Error al procesar Packing List' });
  }
};

// ========== 4. LISTADOS Y ESTADÍSTICAS ==========

/**
 * Obtener todos los envíos LCL (para panel admin)
 */
export const getLclShipments = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { status, ready, search } = req.query;

    let query = `
      SELECT ms.*, 
        u.full_name as client_name, 
        u.box_id as client_box_id,
        u.email as client_email,
        c.container_number
      FROM maritime_shipments ms
      LEFT JOIN users u ON u.id = ms.user_id
      LEFT JOIN containers c ON c.id = ms.container_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (status && status !== 'all') {
      query += ` AND ms.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (ready === 'true') {
      query += ` AND ms.is_ready_for_consolidation = TRUE`;
    } else if (ready === 'false') {
      query += ` AND ms.is_ready_for_consolidation = FALSE`;
    }

    if (search) {
      query += ` AND (ms.log_number ILIKE $${idx} OR ms.client_code ILIKE $${idx} OR ms.shipping_mark ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY ms.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching LCL shipments:', error);
    res.status(500).json({ error: 'Error al obtener envíos LCL' });
  }
};

/**
 * Obtener contenedores FCL (para panel admin)
 */
export const getFclContainers = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { status, search } = req.query;

    let query = `
      SELECT c.*,
        u.full_name as client_name,
        u.box_id as client_box_id,
        cc.is_fully_costed,
        cc.calculated_release_cost,
        (SELECT COUNT(*) FROM maritime_shipments ms WHERE ms.container_id = c.id) as shipment_count
      FROM containers c
      LEFT JOIN users u ON u.id = c.client_user_id
      LEFT JOIN container_costs cc ON cc.container_id = c.id
      WHERE c.type = 'FCL'
    `;
    const params: any[] = [];
    let idx = 1;

    if (status && status !== 'all') {
      query += ` AND c.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (search) {
      query += ` AND (c.container_number ILIKE $${idx} OR c.bl_number ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching FCL containers:', error);
    res.status(500).json({ error: 'Error al obtener contenedores FCL' });
  }
};

/**
 * Estadísticas del panel marítimo
 */
export const getMaritimeAiStats = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    // LCL Stats
    const lclTotal = await pool.query('SELECT COUNT(*) FROM maritime_shipments');
    const lclInWarehouse = await pool.query("SELECT COUNT(*) FROM maritime_shipments WHERE status = 'received_origin'");
    const lclReadyToConsolidate = await pool.query("SELECT COUNT(*) FROM maritime_shipments WHERE is_ready_for_consolidation = TRUE AND container_id IS NULL");
    const lclPendingPL = await pool.query("SELECT COUNT(*) FROM maritime_shipments WHERE is_ready_for_consolidation = FALSE AND status = 'received_origin'");

    // FCL Stats
    const fclTotal = await pool.query("SELECT COUNT(*) FROM containers WHERE type = 'FCL'");
    const fclInWarehouse = await pool.query("SELECT COUNT(*) FROM containers WHERE type = 'FCL' AND status = 'received_origin'");
    const fclInTransit = await pool.query("SELECT COUNT(*) FROM containers WHERE type = 'FCL' AND status = 'in_transit'");
    const fclArrived = await pool.query("SELECT COUNT(*) FROM containers WHERE type = 'FCL' AND status IN ('arrived_port', 'customs_cleared', 'received_cedis')");

    res.json({
      lcl: {
        total: parseInt(lclTotal.rows[0].count),
        inWarehouse: parseInt(lclInWarehouse.rows[0].count),
        readyToConsolidate: parseInt(lclReadyToConsolidate.rows[0].count),
        pendingPackingList: parseInt(lclPendingPL.rows[0].count)
      },
      fcl: {
        total: parseInt(fclTotal.rows[0].count),
        inWarehouse: parseInt(fclInWarehouse.rows[0].count),
        inTransit: parseInt(fclInTransit.rows[0].count),
        arrived: parseInt(fclArrived.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Error fetching maritime stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

/**
 * Asignar cliente a un envío LCL manualmente
 */
export const assignClientToLcl = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { shipmentId } = req.params;
    const { userId, boxId } = req.body;

    let targetUserId = userId;

    // Si se proporciona boxId en lugar de userId, buscar el usuario
    if (boxId && !userId) {
      const userRes = await pool.query('SELECT id FROM users WHERE box_id = $1', [boxId]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: `No se encontró usuario con BOX ID: ${boxId}` });
      }
      targetUserId = userRes.rows[0].id;
    }

    const result = await pool.query(`
      UPDATE maritime_shipments SET 
        user_id = $1, 
        shipping_mark = COALESCE((SELECT box_id FROM users WHERE id = $1), shipping_mark),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [targetUserId, shipmentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }

    // Notificar al cliente
    await pool.query(`
      INSERT INTO notifications (user_id, title, message, type, icon)
      VALUES ($1, $2, $3, 'info', 'ship')
    `, [
      targetUserId,
      '📦 Mercancía asignada',
      `Se te ha asignado el LOG ${result.rows[0].log_number}. Sube tu Packing List para continuar.`
    ]);

    res.json({ success: true, shipment: result.rows[0] });
  } catch (error) {
    console.error('Error assigning client:', error);
    res.status(500).json({ error: 'Error al asignar cliente' });
  }
};

/**
 * Consolidar envíos LCL en un contenedor
 */
export const consolidateLclToContainer = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { shipmentIds, containerNumber, createNew } = req.body;

    if (!shipmentIds || shipmentIds.length === 0) {
      return res.status(400).json({ error: 'Se requieren envíos para consolidar' });
    }

    let containerId: number;

    if (createNew) {
      // Crear contenedor LCL
      const containerRes = await pool.query(`
        INSERT INTO containers (container_number, type, status)
        VALUES ($1, 'LCL', 'consolidated')
        RETURNING id
      `, [containerNumber || `LCL-${Date.now()}`]);
      containerId = containerRes.rows[0].id;

      // Crear registro de costos
      await pool.query('INSERT INTO container_costs (container_id) VALUES ($1)', [containerId]);
    } else {
      // Buscar contenedor existente
      const containerRes = await pool.query(
        'SELECT id FROM containers WHERE container_number = $1',
        [containerNumber]
      );
      if (containerRes.rows.length === 0) {
        return res.status(404).json({ error: 'Contenedor no encontrado' });
      }
      containerId = containerRes.rows[0].id;
    }

    // Asignar envíos al contenedor
    await pool.query(`
      UPDATE maritime_shipments SET 
        container_id = $1, 
        status = 'consolidated',
        updated_at = NOW()
      WHERE id = ANY($2) AND is_ready_for_consolidation = TRUE
    `, [containerId, shipmentIds]);

    // Actualizar totales del contenedor
    await pool.query(`
      UPDATE containers SET
        total_packages = (SELECT COALESCE(SUM(box_count), 0) FROM maritime_shipments WHERE container_id = $1),
        total_weight_kg = (SELECT COALESCE(SUM(weight_kg), 0) FROM maritime_shipments WHERE container_id = $1),
        total_cbm = (SELECT COALESCE(SUM(volume_cbm), 0) FROM maritime_shipments WHERE container_id = $1),
        updated_at = NOW()
      WHERE id = $1
    `, [containerId]);

    res.json({ 
      success: true, 
      message: `${shipmentIds.length} envíos consolidados en contenedor`,
      containerId 
    });
  } catch (error) {
    console.error('Error consolidating:', error);
    res.status(500).json({ error: 'Error al consolidar' });
  }
};
