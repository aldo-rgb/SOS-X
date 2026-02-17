// ============================================
// CONTROLADOR DE ÚLTIMA MILLA 🚚
// Gestión de envíos nacionales con Skydropx
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import * as skydropx from './services/skydropxService';

// =========================================
// GET /api/admin/last-mile/ready-to-dispatch
// Lista paquetes listos para generar guía nacional
// =========================================
export const getReadyToDispatch = async (req: Request, res: Response) => {
  try {
    const { service_type, status } = req.query;

    // Paquetes USA (packages) listos para última milla
    const usaPackages = await pool.query(`
      SELECT 
        p.id,
        'package' as reference_type,
        p.tracking_internal,
        p.description,
        p.weight,
        p.pkg_length as length_cm,
        p.pkg_width as width_cm,
        p.pkg_height as height_cm,
        p.status,
        p.national_tracking,
        p.national_carrier,
        p.national_label_url,
        p.dispatched_at,
        u.id as user_id,
        u.full_name as client_name,
        u.email as client_email,
        u.phone as client_phone,
        a.id as address_id,
        a.full_name as destination_name,
        a.street || ' ' || COALESCE(a.exterior_number, '') as destination_address,
        a.city as destination_city,
        a.state as destination_state,
        a.zip_code as destination_zip,
        a.phone as destination_phone,
        'air' as service_type
      FROM packages p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN addresses a ON p.assigned_address_id = a.id
      WHERE p.status IN ('in_warehouse', 'ready_for_dispatch', 'at_cedis')
        AND p.national_tracking IS NULL
        AND ($1::text IS NULL OR p.service_type = $1)
      ORDER BY p.created_at DESC
      LIMIT 100
    `, [service_type || null]);

    // Órdenes marítimas listas para última milla
    const maritimeOrders = await pool.query(`
      SELECT 
        mo.id,
        'maritime_order' as reference_type,
        mo.ordersn as tracking_internal,
        mo.goods_name as description,
        mo.weight,
        mo.volume,
        mo.status,
        mo.national_tracking,
        mo.national_carrier,
        mo.national_label_url,
        mo.dispatched_at,
        u.id as user_id,
        u.full_name as client_name,
        u.email as client_email,
        u.phone as client_phone,
        a.id as address_id,
        a.full_name as destination_name,
        a.street || ' ' || COALESCE(a.exterior_number, '') as destination_address,
        a.city as destination_city,
        a.state as destination_state,
        a.zip_code as destination_zip,
        a.phone as destination_phone,
        'maritime' as service_type
      FROM maritime_orders mo
      LEFT JOIN users u ON mo.user_id = u.id
      LEFT JOIN addresses a ON mo.delivery_address_id = a.id
      WHERE mo.status IN ('at_cedis', 'ready_for_dispatch', 'customs_cleared')
        AND mo.national_tracking IS NULL
        AND ($1::text IS NULL OR $1 = 'maritime')
      ORDER BY mo.created_at DESC
      LIMIT 100
    `, [service_type || null]);

    // China Receipts (aéreo) listos para última milla
    const chinaReceipts = await pool.query(`
      SELECT 
        cr.id,
        'china_receipt' as reference_type,
        cr.fno as tracking_internal,
        'Envío Aéreo TDI - ' || cr.total_qty || ' cajas' as description,
        cr.total_weight as weight,
        cr.total_cbm as volume,
        cr.status,
        cr.national_tracking,
        cr.national_carrier,
        cr.national_label_url,
        cr.dispatched_at,
        u.id as user_id,
        u.full_name as client_name,
        u.email as client_email,
        u.phone as client_phone,
        a.id as address_id,
        a.full_name as destination_name,
        a.street || ' ' || COALESCE(a.exterior_number, '') as destination_address,
        a.city as destination_city,
        a.state as destination_state,
        a.zip_code as destination_zip,
        a.phone as destination_phone,
        'china_air' as service_type
      FROM china_receipts cr
      LEFT JOIN users u ON cr.user_id = u.id
      LEFT JOIN addresses a ON cr.delivery_address_id = a.id
      WHERE cr.status IN ('at_cedis', 'ready_for_dispatch', 'arrived_mexico')
        AND cr.national_tracking IS NULL
        AND ($1::text IS NULL OR $1 = 'china_air')
      ORDER BY cr.created_at DESC
      LIMIT 100
    `, [service_type || null]);

    // Combinar todos
    const allItems = [
      ...usaPackages.rows,
      ...maritimeOrders.rows,
      ...chinaReceipts.rows
    ];

    res.json({
      success: true,
      count: allItems.length,
      items: allItems,
      summary: {
        usa_air: usaPackages.rowCount,
        maritime: maritimeOrders.rowCount,
        china_air: chinaReceipts.rowCount
      }
    });

  } catch (error: any) {
    console.error('[LAST-MILE] Error getting ready to dispatch:', error);
    res.status(500).json({ error: 'Error al obtener paquetes listos' });
  }
};

// =========================================
// POST /api/admin/last-mile/quote
// Cotizar envío nacional
// =========================================
export const quoteShipment = async (req: Request, res: Response) => {
  try {
    const { reference_type, reference_id, weight, length, width, height } = req.body;

    // Obtener dirección destino
    let destinationAddress;
    
    if (reference_type === 'package') {
      const result = await pool.query(`
        SELECT a.* FROM addresses a
        JOIN packages p ON p.assigned_address_id = a.id
        WHERE p.id = $1
      `, [reference_id]);
      destinationAddress = result.rows[0];
    } else if (reference_type === 'maritime_order') {
      const result = await pool.query(`
        SELECT a.* FROM addresses a
        JOIN maritime_orders mo ON mo.delivery_address_id = a.id
        WHERE mo.id = $1
      `, [reference_id]);
      destinationAddress = result.rows[0];
    } else if (reference_type === 'china_receipt') {
      const result = await pool.query(`
        SELECT a.* FROM addresses a
        JOIN china_receipts cr ON cr.delivery_address_id = a.id
        WHERE cr.id = $1
      `, [reference_id]);
      destinationAddress = result.rows[0];
    }

    if (!destinationAddress) {
      return res.status(400).json({ 
        error: 'No se encontró dirección de destino',
        message: 'El paquete no tiene una dirección asignada'
      });
    }

    // Crear shipment en Skydropx para obtener cotizaciones
    const addressTo = {
      name: destinationAddress.full_name || 'Cliente',
      address1: `${destinationAddress.street} ${destinationAddress.exterior_number || ''}`,
      address2: destinationAddress.interior_number ? `Int. ${destinationAddress.interior_number}` : '',
      city: destinationAddress.city,
      province: destinationAddress.state,
      zip: destinationAddress.zip_code,
      country: 'MX',
      phone: destinationAddress.phone || '0000000000',
      email: destinationAddress.email || 'cliente@entregax.com'
    };

    const parcel = {
      weight: weight || 1,
      length: length || 30,
      width: width || 30,
      height: height || 30
    };

    const result = await skydropx.createShipment(addressTo, parcel);

    if (!result.success) {
      return res.status(400).json({ 
        error: 'Error al cotizar',
        message: result.error 
      });
    }

    // Obtener carriers activos
    const carriersResult = await pool.query(`
      SELECT code, name, tracking_url_template, logo_url
      FROM national_carriers WHERE is_active = TRUE
      ORDER BY priority
    `);
    const carriers = carriersResult.rows;

    // Enriquecer rates con info de carriers
    const enrichedRates = result.rates?.map(rate => {
      const carrier = carriers.find(c => c.code.toLowerCase() === rate.provider.toLowerCase());
      return {
        ...rate,
        carrierName: carrier?.name || rate.provider,
        carrierLogo: carrier?.logo_url,
        trackingUrlTemplate: carrier?.tracking_url_template
      };
    });

    res.json({
      success: true,
      shipmentId: result.shipmentId,
      rates: enrichedRates,
      destination: {
        name: addressTo.name,
        city: addressTo.city,
        state: addressTo.province,
        zip: addressTo.zip
      },
      isSandbox: skydropx.isSandbox()
    });

  } catch (error: any) {
    console.error('[LAST-MILE] Error quoting:', error);
    res.status(500).json({ error: 'Error al cotizar envío' });
  }
};

// =========================================
// POST /api/admin/last-mile/dispatch
// Generar guía y despachar
// =========================================
export const dispatchShipment = async (req: Request, res: Response) => {
  try {
    const { reference_type, reference_id, rate_id, carrier, shipment_id } = req.body;
    const userId = (req as any).user?.userId;

    if (!reference_type || !reference_id || !rate_id) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    // Obtener datos del paquete y usuario
    let packageData: any = null;
    let userData: any = null;
    let addressData: any = null;

    if (reference_type === 'package') {
      const result = await pool.query(`
        SELECT p.*, u.id as uid, u.full_name, u.email, u.phone,
               a.full_name as dest_name, a.street, a.exterior_number, a.interior_number,
               a.city, a.state, a.zip_code, a.phone as dest_phone
        FROM packages p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN addresses a ON p.assigned_address_id = a.id
        WHERE p.id = $1
      `, [reference_id]);
      packageData = result.rows[0];
      userData = { id: packageData?.uid, full_name: packageData?.full_name, email: packageData?.email };
      addressData = packageData;
    } else if (reference_type === 'maritime_order') {
      const result = await pool.query(`
        SELECT mo.*, u.id as uid, u.full_name, u.email, u.phone,
               a.full_name as dest_name, a.street, a.exterior_number, a.interior_number,
               a.city, a.state, a.zip_code, a.phone as dest_phone
        FROM maritime_orders mo
        LEFT JOIN users u ON mo.user_id = u.id
        LEFT JOIN addresses a ON mo.delivery_address_id = a.id
        WHERE mo.id = $1
      `, [reference_id]);
      packageData = result.rows[0];
      userData = { id: packageData?.uid, full_name: packageData?.full_name, email: packageData?.email };
      addressData = packageData;
    } else if (reference_type === 'china_receipt') {
      const result = await pool.query(`
        SELECT cr.*, u.id as uid, u.full_name, u.email, u.phone,
               a.full_name as dest_name, a.street, a.exterior_number, a.interior_number,
               a.city, a.state, a.zip_code, a.phone as dest_phone
        FROM china_receipts cr
        LEFT JOIN users u ON cr.user_id = u.id
        LEFT JOIN addresses a ON cr.delivery_address_id = a.id
        WHERE cr.id = $1
      `, [reference_id]);
      packageData = result.rows[0];
      userData = { id: packageData?.uid, full_name: packageData?.full_name, email: packageData?.email };
      addressData = packageData;
    }

    if (!packageData) {
      return res.status(404).json({ error: 'Paquete no encontrado' });
    }

    // Generar etiqueta en Skydropx
    const labelResult = await skydropx.createLabel(rate_id, 'pdf');

    if (!labelResult.success) {
      return res.status(400).json({ 
        error: 'Error al generar etiqueta',
        message: labelResult.error 
      });
    }

    const { trackingNumber, labelUrl, labelId } = labelResult;

    // Actualizar la tabla correspondiente
    const now = new Date();
    
    if (reference_type === 'package') {
      await pool.query(`
        UPDATE packages 
        SET national_tracking = $1, 
            national_carrier = $2, 
            national_label_url = $3,
            status = 'dispatched_national',
            dispatched_at = $4,
            updated_at = $4
        WHERE id = $5
      `, [trackingNumber, carrier, labelUrl, now, reference_id]);
    } else if (reference_type === 'maritime_order') {
      await pool.query(`
        UPDATE maritime_orders 
        SET national_tracking = $1, 
            national_carrier = $2, 
            national_label_url = $3,
            status = 'dispatched_national',
            dispatched_at = $4,
            updated_at = $4
        WHERE id = $5
      `, [trackingNumber, carrier, labelUrl, now, reference_id]);
    } else if (reference_type === 'china_receipt') {
      await pool.query(`
        UPDATE china_receipts 
        SET national_tracking = $1, 
            national_carrier = $2, 
            national_label_url = $3,
            status = 'dispatched_national',
            dispatched_at = $4,
            updated_at = $4
        WHERE id = $5
      `, [trackingNumber, carrier, labelUrl, now, reference_id]);
    }

    // Guardar en historial national_shipments
    const cedisAddress = skydropx.getCedisAddress();
    await pool.query(`
      INSERT INTO national_shipments (
        reference_type, reference_id, user_id, carrier, tracking_number, label_url,
        origin_name, origin_address, origin_city, origin_state, origin_zip, origin_phone,
        destination_name, destination_address, destination_city, destination_state, destination_zip, destination_phone,
        weight, skydropx_shipment_id, skydropx_label_id, skydropx_rate_id,
        status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'label_generated', $23)
    `, [
      reference_type, reference_id, userData?.id, carrier, trackingNumber, labelUrl,
      cedisAddress.name, cedisAddress.address1, cedisAddress.city, cedisAddress.province, cedisAddress.zip, cedisAddress.phone,
      addressData?.dest_name, `${addressData?.street} ${addressData?.exterior_number || ''}`, 
      addressData?.city, addressData?.state, addressData?.zip_code, addressData?.dest_phone,
      packageData?.weight || 1, shipment_id, labelId, rate_id,
      userId
    ]);

    // Crear notificación para el cliente
    if (userData?.id) {
      await pool.query(`
        INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type)
        VALUES ($1, $2, $3, 'shipment', $4, $5)
      `, [
        userData.id,
        '📦 ¡Tu paquete va en camino!',
        `Tu envío ha sido despachado con ${carrier}. Guía: ${trackingNumber}`,
        reference_id,
        reference_type
      ]);
    }

    // Obtener URL de rastreo
    const carrierInfo = await pool.query(
      'SELECT tracking_url_template FROM national_carriers WHERE code = $1',
      [carrier.toLowerCase()]
    );
    const trackingUrl = carrierInfo.rows[0]?.tracking_url_template?.replace('{tracking}', trackingNumber);

    console.log('[LAST-MILE] ✅ Dispatched:', reference_type, reference_id, '->', trackingNumber);

    res.json({
      success: true,
      message: '¡Guía Nacional Generada!',
      trackingNumber,
      labelUrl,
      trackingUrl,
      carrier,
      isSandbox: skydropx.isSandbox()
    });

  } catch (error: any) {
    console.error('[LAST-MILE] Error dispatching:', error);
    res.status(500).json({ error: 'Error al generar guía' });
  }
};

// =========================================
// GET /api/admin/last-mile/dispatched
// Lista envíos ya despachados
// =========================================
export const getDispatched = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await pool.query(`
      SELECT 
        ns.*,
        u.full_name as client_name,
        u.email as client_email,
        nc.name as carrier_name,
        nc.tracking_url_template
      FROM national_shipments ns
      LEFT JOIN users u ON ns.user_id = u.id
      LEFT JOIN national_carriers nc ON LOWER(ns.carrier) = nc.code
      ORDER BY ns.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await pool.query('SELECT COUNT(*) FROM national_shipments');
    const total = parseInt(countResult.rows[0].count);

    // Enriquecer con URL de rastreo
    const items = result.rows.map(item => ({
      ...item,
      tracking_url: item.tracking_url_template?.replace('{tracking}', item.tracking_number)
    }));

    res.json({
      success: true,
      items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error: any) {
    console.error('[LAST-MILE] Error getting dispatched:', error);
    res.status(500).json({ error: 'Error al obtener envíos despachados' });
  }
};

// =========================================
// GET /api/admin/last-mile/carriers
// Lista carriers disponibles
// =========================================
export const getCarriers = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM national_carriers 
      WHERE is_active = TRUE 
      ORDER BY priority
    `);

    res.json({
      success: true,
      carriers: result.rows,
      skydropxConfigured: skydropx.isConfigured(),
      isSandbox: skydropx.isSandbox()
    });

  } catch (error: any) {
    console.error('[LAST-MILE] Error getting carriers:', error);
    res.status(500).json({ error: 'Error al obtener carriers' });
  }
};

// =========================================
// GET /api/admin/last-mile/stats
// Estadísticas de última milla
// =========================================
export const getStats = async (req: Request, res: Response) => {
  try {
    // Envíos de hoy
    const todayResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN carrier = 'estafeta' THEN 1 END) as estafeta,
        COUNT(CASE WHEN carrier = 'paquetexpress' THEN 1 END) as paquetexpress,
        COUNT(CASE WHEN carrier = 'fedex' THEN 1 END) as fedex,
        COUNT(CASE WHEN carrier = 'dhl' THEN 1 END) as dhl
      FROM national_shipments
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    // Pendientes por despachar
    const pendingPackages = await pool.query(`
      SELECT COUNT(*) FROM packages 
      WHERE status IN ('in_warehouse', 'ready_for_dispatch', 'at_cedis')
        AND national_tracking IS NULL
    `);
    const pendingMaritime = await pool.query(`
      SELECT COUNT(*) FROM maritime_orders 
      WHERE status IN ('at_cedis', 'ready_for_dispatch', 'customs_cleared')
        AND national_tracking IS NULL
    `);
    const pendingChina = await pool.query(`
      SELECT COUNT(*) FROM china_receipts 
      WHERE status IN ('at_cedis', 'ready_for_dispatch', 'arrived_mexico')
        AND national_tracking IS NULL
    `);

    // Últimos 7 días
    const weekResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM national_shipments
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    res.json({
      success: true,
      today: todayResult.rows[0],
      pending: {
        total: parseInt(pendingPackages.rows[0].count) + 
               parseInt(pendingMaritime.rows[0].count) + 
               parseInt(pendingChina.rows[0].count),
        packages: parseInt(pendingPackages.rows[0].count),
        maritime: parseInt(pendingMaritime.rows[0].count),
        china_air: parseInt(pendingChina.rows[0].count)
      },
      weekTrend: weekResult.rows
    });

  } catch (error: any) {
    console.error('[LAST-MILE] Error getting stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// =========================================
// POST /api/admin/last-mile/print-label/:id
// Reimprime una etiqueta
// =========================================
export const reprintLabel = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT label_url, tracking_number, carrier FROM national_shipments WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Envío no encontrado' });
    }

    const { label_url, tracking_number, carrier } = result.rows[0];

    res.json({
      success: true,
      labelUrl: label_url,
      trackingNumber: tracking_number,
      carrier
    });

  } catch (error: any) {
    console.error('[LAST-MILE] Error reprinting:', error);
    res.status(500).json({ error: 'Error al reimprimir etiqueta' });
  }
};
