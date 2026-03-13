/**
 * fiscalController.ts
 * 
 * Controlador para manejo de datos fiscales y facturación CFDI 4.0
 * Integración con Facturapi
 */

import { Request, Response } from 'express';
import { pool } from './db';

// Interfaz extendida de Request con usuario autenticado
interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
    role: string;
    id?: number;
    name?: string;
  };
}

// ============================================
// OBTENER DATOS FISCALES DEL USUARIO
// ============================================
export const getFiscalData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const result = await pool.query(`
      SELECT 
        fiscal_razon_social,
        fiscal_rfc,
        fiscal_codigo_postal,
        fiscal_regimen_fiscal,
        fiscal_uso_cfdi
      FROM users
      WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const fiscalData = result.rows[0];
    
    // Verificar si tiene datos fiscales completos
    const hasCompleteData = fiscalData.fiscal_razon_social && 
                           fiscalData.fiscal_rfc && 
                           fiscalData.fiscal_codigo_postal &&
                           fiscalData.fiscal_regimen_fiscal;

    res.json({
      success: true,
      hasCompleteData,
      fiscal: {
        razon_social: fiscalData.fiscal_razon_social || '',
        rfc: fiscalData.fiscal_rfc || '',
        codigo_postal: fiscalData.fiscal_codigo_postal || '',
        regimen_fiscal: fiscalData.fiscal_regimen_fiscal || '',
        uso_cfdi: fiscalData.fiscal_uso_cfdi || 'G03'
      }
    });
  } catch (error: any) {
    console.error('Error obteniendo datos fiscales:', error);
    res.status(500).json({ error: 'Error al obtener datos fiscales', details: error.message });
  }
};

// ============================================
// GUARDAR/ACTUALIZAR DATOS FISCALES
// ============================================
export const updateFiscalData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi } = req.body;

    // Validaciones básicas
    if (!razon_social || !rfc || !codigo_postal || !regimen_fiscal) {
      res.status(400).json({ 
        error: 'Datos incompletos',
        message: 'Se requiere: razón social, RFC, código postal y régimen fiscal'
      });
      return;
    }

    // Validar formato RFC (persona física: 13 caracteres, persona moral: 12)
    const rfcUpperCase = rfc.toUpperCase().trim();
    if (rfcUpperCase.length !== 12 && rfcUpperCase.length !== 13) {
      res.status(400).json({ 
        error: 'RFC inválido',
        message: 'El RFC debe tener 12 caracteres (persona moral) o 13 caracteres (persona física)'
      });
      return;
    }

    // Validar código postal (5 dígitos)
    const cpTrimmed = codigo_postal.trim();
    if (!/^\d{5}$/.test(cpTrimmed)) {
      res.status(400).json({ 
        error: 'Código postal inválido',
        message: 'El código postal debe tener 5 dígitos'
      });
      return;
    }

    // Actualizar datos fiscales del usuario
    await pool.query(`
      UPDATE users SET
        fiscal_razon_social = $1,
        fiscal_rfc = $2,
        fiscal_codigo_postal = $3,
        fiscal_regimen_fiscal = $4,
        fiscal_uso_cfdi = $5
      WHERE id = $6
    `, [
      razon_social.trim(),
      rfcUpperCase,
      cpTrimmed,
      regimen_fiscal,
      uso_cfdi || 'G03',
      userId
    ]);

    res.json({
      success: true,
      message: 'Datos fiscales actualizados correctamente'
    });
  } catch (error: any) {
    console.error('Error actualizando datos fiscales:', error);
    res.status(500).json({ error: 'Error al actualizar datos fiscales', details: error.message });
  }
};

// ============================================
// OBTENER CATÁLOGO DE REGÍMENES FISCALES
// ============================================
export const getRegimenesFiscales = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT clave, descripcion, persona_fisica, persona_moral
      FROM sat_regimen_fiscal
      ORDER BY clave
    `);

    res.json({
      success: true,
      regimenes: result.rows
    });
  } catch (error: any) {
    console.error('Error obteniendo regímenes fiscales:', error);
    res.status(500).json({ error: 'Error al obtener catálogo', details: error.message });
  }
};

// ============================================
// OBTENER CATÁLOGO DE USOS CFDI
// ============================================
export const getUsosCFDI = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT clave, descripcion, persona_fisica, persona_moral
      FROM sat_uso_cfdi
      ORDER BY clave
    `);

    res.json({
      success: true,
      usos: result.rows
    });
  } catch (error: any) {
    console.error('Error obteniendo usos CFDI:', error);
    res.status(500).json({ error: 'Error al obtener catálogo', details: error.message });
  }
};

// ============================================
// OBTENER HISTORIAL DE FACTURAS DEL USUARIO
// ============================================
export const getFacturasUsuario = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const result = await pool.query(`
      SELECT 
        id,
        facturapi_id,
        uuid_sat,
        receptor_rfc,
        receptor_razon_social,
        subtotal,
        total,
        currency,
        folio,
        serie,
        pdf_url,
        xml_url,
        status,
        created_at
      FROM facturas_emitidas
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    res.json({
      success: true,
      facturas: result.rows
    });
  } catch (error: any) {
    console.error('Error obteniendo facturas:', error);
    res.status(500).json({ error: 'Error al obtener facturas', details: error.message });
  }
};

// ============================================
// CREAR FACTURA CON FACTURAPI
// (Llamado desde webhook de Openpay cuando el pago es exitoso)
// ============================================

// Mapeo de ServiceType a service_type en service_company_config
const SERVICE_TYPE_MAP_FISCAL: Record<string, string> = {
  po_box: 'POBOX_USA',
  aereo: 'AIR_CHN_MX',
  maritimo: 'SEA_CHN_MX',
  terrestre: 'NATIONAL',
  dhl: 'AA_DHL'
};

export const createInvoice = async (
  paymentData: {
    paymentId: string;
    paymentType: 'openpay' | 'pobox' | 'paypal';
    userId: number;
    amount: number;
    currency: string;
    paymentMethod: string; // 'card', 'spei', 'paypal'
    description: string;
    packageIds?: number[];
    serviceType?: string; // 'po_box', 'aereo', 'maritimo', etc.
  }
): Promise<{ success: boolean; uuid?: string; pdfUrl?: string; xmlUrl?: string; error?: string }> => {
  try {
    // 1. Obtener datos fiscales del usuario
    const userResult = await pool.query(`
      SELECT 
        fiscal_razon_social,
        fiscal_rfc,
        fiscal_codigo_postal,
        fiscal_regimen_fiscal,
        fiscal_uso_cfdi,
        email
      FROM users
      WHERE id = $1
    `, [paymentData.userId]);

    if (userResult.rows.length === 0) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    const fiscalData = userResult.rows[0];

    // Verificar datos fiscales completos
    if (!fiscalData.fiscal_razon_social || !fiscalData.fiscal_rfc || !fiscalData.fiscal_codigo_postal || !fiscalData.fiscal_regimen_fiscal) {
      return { success: false, error: 'Datos fiscales incompletos' };
    }

    // 2. Obtener API key de Facturapi desde fiscal_emitters
    // Buscar por tipo de servicio o usar el emisor activo por defecto
    const serviceType = SERVICE_TYPE_MAP_FISCAL[paymentData.serviceType || 'po_box'] || 'POBOX_USA';
    
    let apiKey: string | null = null;
    let emitterAlias: string | null = null;

    // Primero intentar por servicio específico
    const configByService = await pool.query(`
      SELECT fe.api_key, fe.alias, fe.is_sandbox
      FROM service_company_config scc
      JOIN fiscal_emitters fe ON scc.emitter_id = fe.id
      WHERE scc.service_type = $1 AND scc.is_active = TRUE AND fe.is_active = TRUE
    `, [serviceType]);

    if (configByService.rows.length > 0 && configByService.rows[0].api_key) {
      apiKey = configByService.rows[0].api_key;
      emitterAlias = configByService.rows[0].alias;
      console.log(`🔑 Facturapi API key from service config (${serviceType}) -> ${emitterAlias}`);
    } else {
      // Fallback: buscar emisor activo por defecto
      const defaultEmitter = await pool.query(`
        SELECT api_key, alias, is_sandbox
        FROM fiscal_emitters 
        WHERE is_active = TRUE AND api_key IS NOT NULL
        ORDER BY id LIMIT 1
      `);

      if (defaultEmitter.rows.length > 0) {
        apiKey = defaultEmitter.rows[0].api_key;
        emitterAlias = defaultEmitter.rows[0].alias;
        console.log(`🔑 Facturapi API key from default emitter -> ${emitterAlias}`);
      }
    }

    if (!apiKey) {
      return { success: false, error: 'API key de Facturapi no configurada para este servicio' };
    }

    // 3. Mapear método de pago a clave SAT
    let paymentForm: string;
    switch (paymentData.paymentMethod) {
      case 'card':
        paymentForm = '04'; // Tarjeta de crédito
        break;
      case 'spei':
        paymentForm = '03'; // Transferencia electrónica
        break;
      case 'paypal':
        paymentForm = '31'; // Intermediario pagos (como PayPal)
        break;
      default:
        paymentForm = '99'; // Por definir
    }

    // 4. Construir payload para Facturapi
    const invoiceData = {
      customer: {
        legal_name: fiscalData.fiscal_razon_social,
        tax_id: fiscalData.fiscal_rfc,
        tax_system: fiscalData.fiscal_regimen_fiscal,
        zip: fiscalData.fiscal_codigo_postal,
        email: fiscalData.email
      },
      items: [{
        product: {
          description: paymentData.description || `Servicio de Logística - ${paymentData.packageIds?.length || 1} paquete(s)`,
          product_key: '78101800', // Clave SAT: Servicios de envío, embalaje y entrega
          price: paymentData.amount
        },
        quantity: 1
      }],
      use: fiscalData.fiscal_uso_cfdi || 'G03',
      payment_form: paymentForm,
      payment_method: 'PUE', // Pago en una sola exhibición
      currency: paymentData.currency || 'MXN'
    };

    // 5. Llamar a Facturapi
    const facturapiResponse = await fetch('https://www.facturapi.io/v2/invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(invoiceData)
    });

    if (!facturapiResponse.ok) {
      const errorData = await facturapiResponse.json() as { message?: string };
      console.error('❌ Error Facturapi:', errorData);
      return { success: false, error: errorData.message || 'Error al crear factura' };
    }

    const factura = await facturapiResponse.json() as {
      id: string;
      uuid: string;
      subtotal: number;
      total: number;
      currency: string;
      folio_number: string;
      series: string;
    };

    // 6. Guardar factura en base de datos
    await pool.query(`
      INSERT INTO facturas_emitidas (
        facturapi_id, uuid_sat, user_id, payment_id, payment_type,
        receptor_rfc, receptor_razon_social, receptor_codigo_postal,
        receptor_regimen_fiscal, receptor_uso_cfdi,
        subtotal, total, currency, payment_form,
        folio, serie, pdf_url, xml_url, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, 'valid'
      )
    `, [
      factura.id,
      factura.uuid,
      paymentData.userId,
      paymentData.paymentId,
      paymentData.paymentType,
      fiscalData.fiscal_rfc,
      fiscalData.fiscal_razon_social,
      fiscalData.fiscal_codigo_postal,
      fiscalData.fiscal_regimen_fiscal,
      fiscalData.fiscal_uso_cfdi,
      factura.subtotal,
      factura.total,
      factura.currency,
      paymentForm,
      factura.folio_number,
      factura.series,
      `https://www.facturapi.io/v2/invoices/${factura.id}/pdf`,
      `https://www.facturapi.io/v2/invoices/${factura.id}/xml`,
    ]);

    console.log(`✅ Factura creada: ${factura.uuid} por ${emitterAlias}`);

    return { 
      success: true, 
      uuid: factura.uuid,
      pdfUrl: `https://www.facturapi.io/v2/invoices/${factura.id}/pdf`,
      xmlUrl: `https://www.facturapi.io/v2/invoices/${factura.id}/xml`
    };

  } catch (error: any) {
    console.error('❌ Error creando factura:', error);
    return { success: false, error: error.message };
  }
};

// ============================================
// ENDPOINT: Verificar y procesar factura pendiente
// (Para reintentos en caso de fallas)
// ============================================
export const retryPendingInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId, paymentType } = req.body;
    const userId = req.user?.userId || req.user?.id;

    if (!paymentId || !paymentType) {
      res.status(400).json({ error: 'Se requiere paymentId y paymentType' });
      return;
    }

    // Verificar si ya existe factura para este pago
    const existingInvoice = await pool.query(
      'SELECT uuid_sat FROM facturas_emitidas WHERE payment_id = $1',
      [paymentId]
    );

    if (existingInvoice.rows.length > 0) {
      res.json({
        success: true,
        message: 'La factura ya fue emitida anteriormente',
        uuid: existingInvoice.rows[0].uuid_sat
      });
      return;
    }

    // Obtener datos del pago según el tipo
    let paymentData: any = null;
    
    if (paymentType === 'openpay') {
      const result = await pool.query(`
        SELECT transaction_id, user_id, monto_recibido, concepto
        FROM openpay_webhook_logs
        WHERE transaction_id = $1 AND user_id = $2 AND requiere_factura = TRUE
      `, [paymentId, userId]);
      
      if (result.rows.length > 0) {
        paymentData = {
          paymentId,
          paymentType: 'openpay',
          userId,
          amount: parseFloat(result.rows[0].monto_recibido),
          currency: 'MXN',
          paymentMethod: 'card',
          description: result.rows[0].concepto
        };
      }
    }

    if (!paymentData) {
      res.status(404).json({ error: 'No se encontró el pago o no requiere factura' });
      return;
    }

    // Intentar crear la factura
    const invoiceResult = await createInvoice(paymentData);

    if (invoiceResult.success) {
      res.json({
        success: true,
        message: 'Factura creada exitosamente',
        uuid: invoiceResult.uuid
      });
    } else {
      res.status(500).json({
        success: false,
        error: invoiceResult.error
      });
    }

  } catch (error: any) {
    console.error('Error en retry invoice:', error);
    res.status(500).json({ error: 'Error al procesar factura', details: error.message });
  }
};
