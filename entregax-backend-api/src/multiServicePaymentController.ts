/**
 * Controlador de Pagos Multi-Servicio
 * Maneja pagos separados por RFC/Empresa
 */

import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';
import crypto from 'crypto';
import { AuthRequest } from './authController';
import { 
  ServiceType, 
  getOpenpayCredentials, 
  getServiceCompanyInfo, 
  getAllServices,
  getServiceFromReferenceType 
} from './services/openpayConfig';
import { createInvoice } from './fiscalController';
import { generateCommissionsForPackages } from './commissionService';

// ============ URLS BASE ============
const OPENPAY_SANDBOX_URL = 'https://sandbox-api.openpay.mx/v1';
const OPENPAY_PROD_URL = 'https://api.openpay.mx/v1';
const PAYPAL_SANDBOX_URL = 'https://api-m.sandbox.paypal.com';
const PAYPAL_PROD_URL = 'https://api-m.paypal.com';

// Generar referencia única para pago
const generatePaymentReference = (prefix: string = 'GW'): string => {
  const timestamp = (Date.now() % 10000).toString().padStart(4, '0');
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}${random}`;
};

// Obtener credenciales de PayPal desde la BD
interface PayPalCredentials {
  clientId: string;
  secret: string;
  isSandbox: boolean;
  empresaName: string;
}

const getPaypalCredentials = async (): Promise<PayPalCredentials> => {
  const query = await pool.query(`
    SELECT id, alias, paypal_client_id, paypal_secret, paypal_sandbox
    FROM fiscal_emitters
    WHERE paypal_configured = true
    AND paypal_client_id IS NOT NULL 
    AND paypal_client_id != ''
    LIMIT 1
  `);

  if (query.rows.length > 0) {
    const row = query.rows[0];
    console.log(`🔑 PayPal credentials from DB -> ${row.alias}`);
    return {
      clientId: row.paypal_client_id,
      secret: row.paypal_secret,
      isSandbox: row.paypal_sandbox !== false,
      empresaName: row.alias
    };
  }

  throw new Error('No hay credenciales de PayPal configuradas en ninguna empresa');
};

// Obtener Token de PayPal
const getPayPalToken = async (credentials: PayPalCredentials): Promise<string> => {
  const apiUrl = credentials.isSandbox ? PAYPAL_SANDBOX_URL : PAYPAL_PROD_URL;
  const auth = Buffer.from(`${credentials.clientId}:${credentials.secret}`).toString('base64');
  
  const response = await axios.post(
    `${apiUrl}/v1/oauth2/token`, 
    'grant_type=client_credentials', 
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  
  return response.data.access_token;
};

// Determinar tipo de servicio a partir de los paquetes
const getServiceTypeFromPackages = async (packageIds: number[]): Promise<ServiceType> => {
  const result = await pool.query(
    `SELECT service_type FROM packages WHERE id = ANY($1) AND service_type IS NOT NULL LIMIT 1`,
    [packageIds]
  );
  
  if (result.rows.length > 0) {
    const st = result.rows[0].service_type;
    const mapping: Record<string, ServiceType> = {
      // Valores reales en BD (mayúsculas)
      'POBOX_USA': 'po_box',
      'AIR_CHN_MX': 'aereo',
      'SEA_CHN_MX': 'maritimo',
      'AA_DHL': 'dhl_liberacion',
      // Valores legacy/alternativos
      'china_air': 'aereo',
      'china_sea': 'maritimo',
      'usa_pobox': 'po_box',
      'dhl': 'dhl_liberacion',
      'national': 'terrestre_nacional',
      'air': 'aereo',
      'sea': 'maritimo',
      'maritime': 'maritimo'
    };
    return mapping[st] || 'aereo';
  }
  return 'aereo'; // default
};

// ============================================
// OBTENER PAGOS PENDIENTES DEL USUARIO
// Agrupa por servicio para mostrar separados
// ============================================

export const getUserPendingPayments = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;

    // 1. Obtener facturas pendientes de payment_invoices
    const invoicesResult = await pool.query(`
      SELECT 
        si.id,
        si.service as service_type,
        sc.company_name,
        si.invoice_number,
        si.concept,
        si.amount,
        si.amount_paid,
        (si.amount - si.amount_paid) as balance_due,
        si.currency,
        si.status,
        si.reference_type,
        si.reference_id,
        si.due_date,
        si.created_at,
        'invoice' as source
      FROM payment_invoices si
      LEFT JOIN service_companies sc ON si.service = sc.service
      WHERE si.user_id = $1 
        AND si.status IN ('pending', 'partial')
      ORDER BY si.due_date ASC, si.created_at ASC
    `, [userId]);

    // 2. Obtener paquetes con saldo pendiente de packages (PO Box, etc)
    const packagesResult = await pool.query(`
      SELECT 
        p.id,
        p.service_type,
        'EntregaX' as company_name,
        p.tracking_internal as invoice_number,
        CONCAT('Paquete ', p.tracking_internal, ' - ', COALESCE(p.description, '')) as concept,
        COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0) as amount,
        0 as amount_paid,
        COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0) as balance_due,
        'MXN' as currency,
        'pending' as status,
        'package' as reference_type,
        p.id as reference_id,
        p.created_at as due_date,
        p.created_at,
        'package' as source
      FROM packages p
      WHERE p.user_id = $1 
        AND (p.payment_status IN ('pending', 'partial') OR p.payment_status IS NULL)
        AND COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0) > 0
      ORDER BY p.created_at ASC
    `, [userId]);

    // Combinar ambos resultados
    const allInvoices = [...invoicesResult.rows, ...packagesResult.rows];

    // Agrupar por tipo de servicio
    const grouped: Record<string, any> = {};
    let totalPending = 0;

    // Mapeo de service_type a nombres amigables
    const SERVICE_NAMES: Record<string, string> = {
      'POBOX_USA': 'PO Box USA',
      'po_box': 'PO Box USA',
      'AIR_CHN_MX': 'Aéreo China',
      'aereo': 'Aéreo',
      'SEA_CHN_MX': 'Marítimo China',
      'maritimo': 'Marítimo',
      'AA_DHL': 'Nacional DHL',
      'dhl_liberacion': 'DHL Liberación',
      'terrestre_nacional': 'Terrestre Nacional'
    };

    for (const invoice of allInvoices) {
      const serviceKey = invoice.service_type || 'otros';
      if (!grouped[serviceKey]) {
        grouped[serviceKey] = {
          service: serviceKey,
          serviceName: SERVICE_NAMES[serviceKey] || serviceKey,
          companyName: invoice.company_name || 'EntregaX',
          invoices: [],
          subtotal: 0
        };
      }
      grouped[serviceKey].invoices.push({
        ...invoice,
        balance_due: parseFloat(invoice.balance_due) || 0,
        amount: parseFloat(invoice.amount) || 0
      });
      grouped[serviceKey].subtotal += parseFloat(invoice.balance_due) || 0;
      totalPending += parseFloat(invoice.balance_due) || 0;
    }

    res.json({
      success: true,
      totalPending,
      byService: Object.values(grouped),
      invoices: allInvoices.map(inv => ({
        ...inv,
        balance_due: parseFloat(inv.balance_due) || 0,
        amount: parseFloat(inv.amount) || 0
      }))
    });
  } catch (error) {
    console.error('Error getting pending payments:', error);
    res.status(500).json({ error: 'Error obteniendo pagos pendientes' });
  }
};

// ============================================
// OBTENER CLABE PARA PAGAR UN SERVICIO ESPECÍFICO
// ============================================

export const getPaymentClabe = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { service, invoiceId } = req.body;

    // Si viene invoiceId, determinar el servicio de la factura
    let serviceType: ServiceType = service;
    let amount = 0;
    let invoiceInfo = null;

    if (invoiceId) {
      const invoiceRes = await pool.query(
        'SELECT service, amount, amount_paid, concept FROM payment_invoices WHERE id = $1 AND user_id = $2',
        [invoiceId, userId]
      );
      
      if (invoiceRes.rows.length === 0) {
        return res.status(404).json({ error: 'Factura no encontrada' });
      }
      
      invoiceInfo = invoiceRes.rows[0];
      serviceType = invoiceInfo.service;
      amount = parseFloat(invoiceInfo.amount) - parseFloat(invoiceInfo.amount_paid);
    }

    // Buscar si el usuario ya tiene perfil financiero para este servicio
    let profileRes = await pool.query(
      'SELECT virtual_clabe, openpay_customer_id FROM user_financial_profiles WHERE user_id = $1 AND service = $2',
      [userId, serviceType]
    );

    let clabe = profileRes.rows[0]?.virtual_clabe;
    let openpayCustomerId = profileRes.rows[0]?.openpay_customer_id;

    // Si no tiene CLABE para este servicio, crear una
    if (!clabe) {
      // Obtener datos del usuario
      const userRes = await pool.query(
        'SELECT full_name, email, phone FROM users WHERE id = $1',
        [userId]
      );
      const user = userRes.rows[0];

      // Obtener credenciales de Openpay para este servicio
      try {
        const credentials = await getOpenpayCredentials(serviceType);
        
        // TODO: Aquí iría la integración real con Openpay
        // const Openpay = require('openpay');
        // const openpay = new Openpay(credentials.merchantId, credentials.privateKey, credentials.isSandbox);
        // const customer = await openpay.customers.create({...});
        // clabe = customer.clabe;

        // Por ahora, generar CLABE simulada única por usuario+servicio
        const servicePrefix: Record<ServiceType, string> = {
          aereo: '64618010',
          maritimo: '64618020',
          terrestre_nacional: '64618030',
          dhl_liberacion: '64618040',
          po_box: '64618050'
        };
        
        clabe = servicePrefix[serviceType] + String(userId).padStart(10, '0');
        openpayCustomerId = `cus_${serviceType}_${userId}_${Date.now()}`;

        // Guardar el perfil financiero
        await pool.query(`
          INSERT INTO user_financial_profiles (user_id, service, virtual_clabe, openpay_customer_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, service) DO UPDATE SET 
            virtual_clabe = $3, 
            openpay_customer_id = $4,
            updated_at = NOW()
        `, [userId, serviceType, clabe, openpayCustomerId]);

      } catch (credError: any) {
        console.error('Error getting Openpay credentials:', credError.message);
        // Generar CLABE temporal si no hay credenciales
        clabe = '646180999' + String(userId).padStart(9, '0');
      }
    }

    // Obtener info de la empresa
    const companyInfo = await getServiceCompanyInfo(serviceType);

    res.json({
      success: true,
      service: serviceType,
      companyName: companyInfo.company_name,
      legalName: companyInfo.legal_name,
      rfc: companyInfo.rfc,
      paymentClabe: clabe,
      amount: amount || null,
      invoiceId: invoiceId || null,
      concept: invoiceInfo?.concept || null,
      instructions: `Transfiere ${amount ? `exactamente $${amount.toFixed(2)} MXN` : 'el monto de tu factura'} a esta CLABE STP. ` +
                   `El pago se acreditará a ${companyInfo.company_name} en aproximadamente 5 minutos.`,
      warning: `⚠️ Esta CLABE es exclusiva para servicios de ${companyInfo.company_name}. No la uses para pagar otros servicios.`
    });

  } catch (error) {
    console.error('Error getting payment CLABE:', error);
    res.status(500).json({ error: 'Error obteniendo datos de pago' });
  }
};

// ============================================
// WEBHOOK: Recibe notificaciones de pago de Openpay
// (Un webhook por cada cuenta/servicio)
// ============================================

export const openpayWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    const { service } = req.params; // El servicio viene en la URL del webhook
    const webhookData = req.body;

    console.log(`📥 Webhook Openpay [${service}]:`, JSON.stringify(webhookData));

    // Verificar el tipo de evento
    if (webhookData.type !== 'charge.succeeded' && webhookData.type !== 'spei.received') {
      return res.json({ received: true, processed: false, reason: 'Event type not handled' });
    }

    const transaction = webhookData.transaction || webhookData;
    const amount = parseFloat(transaction.amount);
    const clabeSource = transaction.payment_method?.clabe || transaction.clabe;

    // Buscar el usuario por la CLABE destino
    const profileRes = await pool.query(
      `SELECT ufp.user_id, ufp.service, u.full_name, u.email
       FROM user_financial_profiles ufp
       JOIN users u ON ufp.user_id = u.id
       WHERE ufp.virtual_clabe = $1 AND ufp.service = $2`,
      [transaction.destination_clabe || clabeSource, service]
    );

    if (profileRes.rows.length === 0) {
      console.warn('⚠️ Pago recibido pero no se encontró usuario:', transaction.destination_clabe);
      return res.json({ received: true, processed: false, reason: 'User not found' });
    }

    const userProfile = profileRes.rows[0];

    // Buscar facturas pendientes del usuario para este servicio
    const pendingInvoices = await pool.query(
      `SELECT id, amount, amount_paid, (amount - amount_paid) as balance_due
       FROM payment_invoices 
       WHERE user_id = $1 AND service = $2 AND status IN ('pending', 'partial')
       ORDER BY due_date ASC, created_at ASC`,
      [userProfile.user_id, service]
    );

    let remainingAmount = amount;
    const paidInvoices: number[] = [];

    // Aplicar el pago a las facturas en orden (FIFO)
    for (const invoice of pendingInvoices.rows) {
      if (remainingAmount <= 0) break;

      const balanceDue = parseFloat(invoice.balance_due);
      const paymentToApply = Math.min(remainingAmount, balanceDue);

      const newAmountPaid = parseFloat(invoice.amount_paid) + paymentToApply;
      const newStatus = newAmountPaid >= parseFloat(invoice.amount) ? 'paid' : 'partial';

      await pool.query(`
        UPDATE payment_invoices 
        SET amount_paid = $1, 
            status = $2, 
            paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END,
            payment_method = 'spei',
            openpay_transaction_id = $3,
            updated_at = NOW()
        WHERE id = $4
      `, [newAmountPaid, newStatus, transaction.id, invoice.id]);

      if (newStatus === 'paid') {
        paidInvoices.push(invoice.id);
      }

      remainingAmount -= paymentToApply;
    }

    // Si sobra dinero, agregarlo al balance del perfil
    if (remainingAmount > 0) {
      await pool.query(`
        UPDATE user_financial_profiles 
        SET balance = balance + $1, updated_at = NOW()
        WHERE user_id = $2 AND service = $3
      `, [remainingAmount, userProfile.user_id, service]);
    }

    // Registrar la transacción
    await pool.query(`
      INSERT INTO financial_transactions 
        (user_id, type, amount, description, reference_id, reference_type, metadata)
      VALUES 
        ($1, 'deposit_spei', $2, $3, $4, $5, $6)
    `, [
      userProfile.user_id,
      amount,
      `Pago SPEI recibido - ${String(service).toUpperCase()}`,
      transaction.id,
      `openpay_${service}`,
      JSON.stringify({ 
        service, 
        paidInvoices, 
        excessBalance: remainingAmount,
        openpayData: transaction 
      })
    ]);

    console.log(`✅ Pago procesado: $${amount} para usuario ${userProfile.user_id} (${service})`);

    res.json({ 
      received: true, 
      processed: true, 
      userId: userProfile.user_id,
      paidInvoices,
      excessBalance: remainingAmount
    });

  } catch (error) {
    console.error('Error processing Openpay webhook:', error);
    res.status(500).json({ error: 'Error processing webhook' });
  }
};

// ============================================
// OBTENER HISTORIAL DE PAGOS DEL USUARIO
// ============================================

export const getUserPaymentHistory = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { service, limit = 50 } = req.query;

    let query = `
      SELECT 
        ft.id,
        ft.type,
        ft.amount,
        ft.description,
        ft.reference_id,
        ft.reference_type,
        ft.metadata,
        ft.created_at,
        COALESCE(ft.metadata->>'service', 'general') as service
      FROM financial_transactions ft
      WHERE ft.user_id = $1
    `;
    const params: any[] = [userId];

    if (service) {
      query += ` AND ft.metadata->>'service' = $2`;
      params.push(service);
    }

    query += ` ORDER BY ft.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      transactions: result.rows
    });
  } catch (error) {
    console.error('Error getting payment history:', error);
    res.status(500).json({ error: 'Error obteniendo historial de pagos' });
  }
};

// ============================================
// OBTENER BALANCE POR SERVICIO
// ============================================

export const getUserBalancesByService = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;

    const result = await pool.query(`
      SELECT 
        ufp.service,
        sc.company_name,
        ufp.virtual_clabe,
        ufp.balance,
        (SELECT COUNT(*) FROM payment_invoices si WHERE si.user_id = ufp.user_id AND si.service = ufp.service AND si.status = 'pending') as pending_invoices,
        (SELECT COALESCE(SUM(amount - amount_paid), 0) FROM payment_invoices si WHERE si.user_id = ufp.user_id AND si.service = ufp.service AND si.status IN ('pending', 'partial')) as total_pending
      FROM user_financial_profiles ufp
      JOIN service_companies sc ON ufp.service = sc.service
      WHERE ufp.user_id = $1
      ORDER BY sc.id
    `, [userId]);

    // Calcular totales
    let totalBalance = 0;
    let totalPending = 0;
    
    result.rows.forEach((row: any) => {
      totalBalance += parseFloat(row.balance || 0);
      totalPending += parseFloat(row.total_pending || 0);
    });

    res.json({
      success: true,
      totalBalance,
      totalPending,
      byService: result.rows
    });
  } catch (error) {
    console.error('Error getting balances by service:', error);
    res.status(500).json({ error: 'Error obteniendo balances' });
  }
};

// ============================================
// LISTAR SERVICIOS DISPONIBLES
// ============================================

export const listAvailableServices = async (req: Request, res: Response): Promise<any> => {
  try {
    const services = await getAllServices();
    res.json({
      success: true,
      services
    });
  } catch (error) {
    console.error('Error listing services:', error);
    res.status(500).json({ error: 'Error listando servicios' });
  }
};

// ============================================
// CREAR FACTURA/INVOICE PARA UN SERVICIO
// (Para uso interno o admin)
// ============================================

export const createServiceInvoice = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { 
      userId, 
      service, 
      amount, 
      concept, 
      referenceType, 
      referenceId, 
      dueDate,
      notes 
    } = req.body;

    // Generar número de factura
    const countRes = await pool.query('SELECT COUNT(*) FROM payment_invoices');
    const invoiceNumber = `INV-${service.toUpperCase().slice(0, 3)}-${String(parseInt(countRes.rows[0].count) + 1).padStart(6, '0')}`;

    const result = await pool.query(`
      INSERT INTO payment_invoices 
        (user_id, service, invoice_number, concept, amount, reference_type, reference_id, due_date, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [userId, service, invoiceNumber, concept, amount, referenceType, referenceId, dueDate || null, notes]);

    res.json({
      success: true,
      invoice: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating service invoice:', error);
    res.status(500).json({ error: 'Error creando factura' });
  }
};

// ============================================
// ADMIN: OBTENER RESUMEN POR SERVICIO
// ============================================

export const getAdminServiceSummary = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT 
        sc.service,
        sc.company_name,
        sc.rfc,
        (SELECT COUNT(DISTINCT user_id) FROM user_financial_profiles WHERE service = sc.service) as total_users,
        (SELECT COUNT(*) FROM payment_invoices WHERE service = sc.service AND status = 'pending') as pending_invoices,
        (SELECT COALESCE(SUM(amount - amount_paid), 0) FROM payment_invoices WHERE service = sc.service AND status IN ('pending', 'partial')) as total_pending,
        (SELECT COALESCE(SUM(amount), 0) FROM payment_invoices WHERE service = sc.service AND status = 'paid' AND paid_at >= DATE_TRUNC('month', CURRENT_DATE)) as collected_this_month
      FROM service_companies sc
      WHERE sc.is_active = TRUE
      ORDER BY sc.id
    `);

    res.json({
      success: true,
      services: result.rows
    });
  } catch (error) {
    console.error('Error getting admin service summary:', error);
    res.status(500).json({ error: 'Error obteniendo resumen' });
  }
};

// ============================================
// PAYMENT GATEWAY INTEGRATIONS
// OpenPay y PayPal para pagos de paquetes
// ============================================

export const processOpenPayCard = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { packageIds, paymentMethod, total: rawTotal, currency, company, returnUrl, cancelUrl, invoiceRequired, invoiceData, paymentOrderId, paymentReference } = req.body;
    // Redondear a 2 decimales para evitar errores de precisión (flotantes JS)
    const total = Math.round(Number(rawTotal || 0) * 100) / 100;

    console.log('📦 Processing OpenPay card payment:', {
      userId,
      packageIds,
      total,
      currency,
      company,
      invoiceRequired,
      paymentOrderId,
      paymentReference
    });

    // Validar datos requeridos
    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere al menos un paquete para procesar el pago' 
      });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El monto del pago debe ser mayor a 0' 
      });
    }

    // Verificar que los paquetes existen y pertenecen al usuario
    const packagesCheck = await pool.query(
      `SELECT id, tracking_internal, status, service_type FROM packages WHERE id = ANY($1) AND user_id = $2`,
      [packageIds, userId]
    );

    if (packagesCheck.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No se encontraron paquetes válidos' });
    }

    // Si el pago viene desde una orden PO Box, marcar método de pago desde el inicio
    // para que el dashboard no muestre "Efectivo" mientras completa el callback.
    try {
      if (paymentOrderId) {
        await pool.query(
          `UPDATE pobox_payments
           SET payment_method = 'card',
               requiere_factura = $1
           WHERE id = $2 AND user_id = $3`,
          [!!invoiceRequired, Number(paymentOrderId), userId]
        );
      } else if (paymentReference) {
        await pool.query(
          `UPDATE pobox_payments
           SET payment_method = 'card',
               requiere_factura = $1
           WHERE payment_reference = $2 AND user_id = $3`,
          [!!invoiceRequired, String(paymentReference), userId]
        );
      }
      // Sincronizar también openpay_webhook_logs para que el dashboard refleje 'tarjeta'
      const refForLog = String(paymentReference || '').trim();
      if (refForLog) {
        await pool.query(
          `UPDATE openpay_webhook_logs
             SET payment_method = 'card', tipo_pago = 'tarjeta'
           WHERE transaction_id = $1
             AND estatus_procesamiento = 'pending_payment'`,
          [refForLog]
        );
      }
    } catch (preUpdErr: any) {
      console.warn('⚠️ No se pudo pre-actualizar método PO Box (OpenPay):', preUpdErr?.message || preUpdErr);
    }

    // Obtener datos del usuario
    const userResult = await pool.query(
      'SELECT id, full_name, email, phone FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];

    // Determinar tipo de servicio y obtener credenciales OpenPay
    const serviceType = await getServiceTypeFromPackages(packageIds);
    let credentials;
    try {
      credentials = await getOpenpayCredentials(serviceType);
    } catch (credError: any) {
      console.error('❌ Error obteniendo credenciales OpenPay:', credError.message);
      // Fallback: registrar como pendiente si no hay credenciales
      const paymentId = `openpay_pending_${Date.now()}`;
      return res.json({
        success: true,
        paymentId,
        requiresRedirection: false,
        status: 'pending',
        message: '📋 OpenPay no está configurado para este servicio. Tu solicitud ha sido registrada y un administrador la procesará.'
      });
    }

    const paymentRef = generatePaymentReference('OP');
    const openpayBaseUrl = credentials.isSandbox ? OPENPAY_SANDBOX_URL : OPENPAY_PROD_URL;
    const openpayUrl = `${openpayBaseUrl}/${credentials.merchantId}/charges`;

    // Registrar pago pendiente en financial_transactions
    try {
      await pool.query(`
        INSERT INTO financial_transactions 
        (user_id, type, amount, description, reference_id, reference_type, metadata, created_at)
        VALUES ($1, 'payment', $2, $3, $4, 'openpay_card', $5, NOW())
      `, [
        userId, total, 
        `Pago con tarjeta - ${packageIds.length} paquete(s)`,
        paymentRef,
        JSON.stringify({ packageIds, currency: currency || 'MXN', serviceType, invoiceRequired, invoiceData, paymentOrderId, paymentReference })
      ]);
    } catch (txErr: any) {
      console.log('Note: financial_transactions insert:', txErr.message);
    }

    // Crear cargo con redireccionamiento en OpenPay
    const packageCount = packageIds.length;
    const cleanDescription = `Pago EntregaX ${packageCount} ${packageCount === 1 ? 'paquete' : 'paquetes'}`;
    
    const callbackBaseUrl = process.env.API_URL || 'https://api.entregax.app';
    const chargeData = {
      method: 'card',
      amount: total,
      currency: currency || 'MXN',
      description: cleanDescription,
      order_id: paymentRef,
      confirm: false,
      send_email: false,
      redirect_url: `${callbackBaseUrl}/api/payments/openpay/callback?paymentRef=${paymentRef}&userId=${userId}&packageIds=${packageIds.join(',')}&amount=${total}&invoiceRequired=${invoiceRequired || false}&paymentOrderId=${paymentOrderId || ''}&paymentReference=${encodeURIComponent(String(paymentReference || ''))}&successRedirect=${encodeURIComponent(String(returnUrl || ''))}&cancelRedirect=${encodeURIComponent(String(cancelUrl || ''))}`,
      customer: {
        name: user.full_name?.split(' ')[0] || 'Cliente',
        last_name: user.full_name?.split(' ').slice(1).join(' ') || 'EntregaX',
        email: user.email || `cliente${userId}@entregax.com`,
        phone_number: user.phone?.replace(/\D/g, '').slice(-10) || '0000000000'
      }
    };

    console.log('💳 Creating OpenPay charge:', { url: openpayUrl, order_id: paymentRef, amount: total });

    const openpayResponse = await axios.post(openpayUrl, chargeData, {
      auth: {
        username: credentials.privateKey,
        password: ''
      }
    });

    // La URL de pago viene en payment_method.url
    const paymentUrl = openpayResponse.data.payment_method?.url;
    
    if (!paymentUrl) {
      console.error('❌ OpenPay no devolvió URL de pago:', openpayResponse.data);
      return res.status(500).json({ 
        success: false,
        error: 'OpenPay no devolvió URL de pago'
      });
    }

    console.log(`✅ OpenPay cargo creado: ${openpayResponse.data.id} - $${total} ${currency || 'MXN'}`);
    console.log(`🔗 Payment URL: ${paymentUrl}`);

    // Guardar charge_id de OpenPay en la orden para poder verificarlo después.
    try {
      const openpayChargeId = openpayResponse.data.id;
      if (paymentOrderId) {
        await pool.query(
          `UPDATE pobox_payments SET external_transaction_id = $1, external_order_id = $2 WHERE id = $3 AND user_id = $4`,
          [openpayChargeId, paymentRef, Number(paymentOrderId), userId]
        );
      } else if (paymentReference) {
        await pool.query(
          `UPDATE pobox_payments SET external_transaction_id = $1, external_order_id = $2 WHERE payment_reference = $3 AND user_id = $4`,
          [openpayChargeId, paymentRef, String(paymentReference), userId]
        );
      }
    } catch (saveErr: any) {
      console.warn('⚠️ No se pudo guardar external_transaction_id OpenPay:', saveErr?.message);
    }

    res.json({
      success: true,
      paymentId: openpayResponse.data.id,
      reference: paymentRef,
      requiresRedirection: true,
      paymentUrl: paymentUrl,
      amount: total,
      currency: currency || 'MXN'
    });

  } catch (error: any) {
    console.error('❌ Error processing OpenPay card payment:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.description || 'Error procesando pago con tarjeta'
    });
  }
};

export const createPayPalPayment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { packageIds, paymentMethod, total, currency, company, returnUrl, cancelUrl, invoiceRequired, invoiceData, paymentOrderId, paymentReference } = req.body;

    console.log('📦 Creating PayPal payment:', {
      userId,
      packageIds,
      total,
      currency,
      company,
      invoiceRequired,
      paymentOrderId,
      paymentReference
    });

    // Validar datos requeridos
    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere al menos un paquete para procesar el pago' 
      });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El monto del pago debe ser mayor a 0' 
      });
    }

    // Si el pago viene desde una orden PO Box, marcar método de pago desde el inicio
    // para evitar que en dashboard aparezca como "Efectivo".
    try {
      if (paymentOrderId) {
        await pool.query(
          `UPDATE pobox_payments
           SET payment_method = 'paypal',
               requiere_factura = $1
           WHERE id = $2 AND user_id = $3`,
          [!!invoiceRequired, Number(paymentOrderId), userId]
        );
      } else if (paymentReference) {
        await pool.query(
          `UPDATE pobox_payments
           SET payment_method = 'paypal',
               requiere_factura = $1
           WHERE payment_reference = $2 AND user_id = $3`,
          [!!invoiceRequired, String(paymentReference), userId]
        );
      }
      // Sincronizar también openpay_webhook_logs (dashboard cobranza) si existía como 'cash'.
      const refForLog = String(paymentReference || '').trim();
      if (refForLog) {
        await pool.query(
          `UPDATE openpay_webhook_logs
             SET payment_method = 'paypal', tipo_pago = 'paypal'
           WHERE transaction_id = $1
             AND estatus_procesamiento = 'pending_payment'`,
          [refForLog]
        );
      }
    } catch (preUpdErr: any) {
      console.warn('⚠️ No se pudo pre-actualizar método PO Box (PayPal):', preUpdErr?.message || preUpdErr);
    }

    // Obtener credenciales de PayPal desde la BD
    let credentials: PayPalCredentials;
    try {
      credentials = await getPaypalCredentials();
    } catch (credError: any) {
      console.error('❌ Error obteniendo credenciales PayPal:', credError.message);
      const paymentId = `paypal_pending_${Date.now()}`;
      return res.json({
        success: true,
        paymentId,
        status: 'pending',
        message: '📋 PayPal no está configurado. Tu solicitud ha sido registrada y un administrador la procesará.'
      });
    }

    const paymentRef = generatePaymentReference('PP');

    // Registrar pago pendiente en financial_transactions
    try {
      await pool.query(`
        INSERT INTO financial_transactions 
        (user_id, type, amount, description, reference_id, reference_type, metadata, created_at)
        VALUES ($1, 'payment', $2, $3, $4, 'paypal', $5, NOW())
      `, [
        userId, total,
        `Pago con PayPal - ${packageIds.length} paquete(s)`,
        paymentRef,
        JSON.stringify({ packageIds, currency: currency || 'MXN', invoiceRequired, invoiceData, paymentOrderId, paymentReference })
      ]);
    } catch (txErr: any) {
      console.log('Note: financial_transactions insert:', txErr.message);
    }

    // Obtener token de PayPal
    const token = await getPayPalToken(credentials);
    const paypalApiUrl = credentials.isSandbox ? PAYPAL_SANDBOX_URL : PAYPAL_PROD_URL;

    const callbackBaseUrl = process.env.API_URL || 'https://api.entregax.app';

    // Crear orden en PayPal
    const order = await axios.post(
      `${paypalApiUrl}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: paymentRef,
          amount: { 
            currency_code: currency || 'MXN', 
            value: total.toFixed(2)
          },
          description: `EntregaX - ${packageIds.length} paquete(s)`
        }],
        application_context: {
          brand_name: 'EntregaX',
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          return_url: `${callbackBaseUrl}/api/payments/paypal/callback?paymentRef=${paymentRef}&userId=${userId}&packageIds=${packageIds.join(',')}&amount=${total}&invoiceRequired=${invoiceRequired || false}&paymentOrderId=${paymentOrderId || ''}&paymentReference=${encodeURIComponent(String(paymentReference || ''))}&successRedirect=${encodeURIComponent(String(returnUrl || ''))}&cancelRedirect=${encodeURIComponent(String(cancelUrl || ''))}`,
          cancel_url: String(cancelUrl || `${process.env.FRONTEND_URL || 'https://entregax.app'}/payment/cancel`)
        }
      },
      {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Obtener URL de aprobación
    const approveLink = order.data.links.find((link: any) => link.rel === 'approve')?.href;

    if (!approveLink) {
      console.error('❌ PayPal no devolvió URL de aprobación:', order.data);
      return res.status(500).json({ 
        success: false,
        error: 'PayPal no devolvió URL de aprobación'
      });
    }

    console.log(`✅ PayPal orden creada: ${order.data.id} - $${total} ${currency || 'MXN'}`);
    console.log(`🔗 Approval URL: ${approveLink}`);

    res.json({
      success: true,
      paymentId: order.data.id,
      orderId: order.data.id,
      reference: paymentRef,
      approvalUrl: approveLink,
      amount: total,
      currency: currency || 'MXN'
    });

  } catch (error: any) {
    console.error('❌ Error creating PayPal payment:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || 'Error creando pago con PayPal'
    });
  }
};

export const createBranchPayment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { packageIds, paymentMethod, total, currency, company, invoiceRequired, invoiceData } = req.body;

    console.log('📦 Creating branch payment reference:', {
      userId,
      packageIds,
      total,
      currency,
      company,
      invoiceRequired
    });

    // Validar datos requeridos
    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere al menos un paquete para generar referencia' 
      });
    }

    if (!total || total <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El monto del pago debe ser mayor a 0' 
      });
    }

    // Generar referencia única para pago en sucursal
    const paymentReference = `ENT${Date.now().toString().slice(-8)}`;

    const mockPaymentResponse: any = {
      success: true,
      paymentId: paymentReference,
      reference: paymentReference,
      barcode: paymentReference,
      status: 'pending',
      message: 'Referencia generada exitosamente',
      instructions: 'Presenta esta referencia en cualquier sucursal EntregaX para procesar tu pago'
    };

    // Para pagos en sucursal, la factura se genera cuando el cajero confirma el pago
    // NO marcar como pagado hasta que se confirme en sucursal
    if (invoiceRequired && invoiceData) {
      console.log('📄 Invoice will be generated when branch payment is confirmed:', paymentReference);
      mockPaymentResponse.invoiceWillBeGenerated = true;
      mockPaymentResponse.invoiceMessage = 'La factura será generada al confirmar el pago en sucursal';
    }

    console.log('🏪 Branch payment reference created:', paymentReference);

    res.json(mockPaymentResponse);

  } catch (error) {
    console.error('❌ Error creating branch payment:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error generando referencia de pago' 
    });
  }
};

// ============================================
// CONFIRMAR PAGO Y MARCAR PAQUETES COMO PAGADOS
// Se llama desde webhooks o callbacks de las pasarelas
// ============================================

export const confirmPaymentAndUpdatePackages = async (
  paymentId: string, 
  packageIds: number[], 
  amount: number,
  paymentType: 'openpay' | 'paypal' | 'branch',
  userId: number
): Promise<{ success: boolean; error?: string; invoiceData?: any }> => {
  try {
    console.log('💰 Confirming payment and updating packages:', { paymentId, packageIds, amount, paymentType, userId });

    // 1. Marcar paquetes como pagados
    const updateResult = await pool.query(`
      UPDATE packages 
      SET 
        payment_status = 'paid',
        paid_at = NOW(),
        payment_method = $1,
        payment_reference = $2,
        paid_amount = $3
      WHERE id = ANY($4) AND user_id = $5
      RETURNING id, tracking_number
    `, [paymentType, paymentId, amount, packageIds, userId]);

    if (updateResult.rows.length === 0) {
      return { success: false, error: 'No se encontraron paquetes para actualizar' };
    }

    console.log('✅ Packages marked as paid:', updateResult.rows.map(r => r.tracking_number));

    // 2. Registrar transacción de pago
    await pool.query(`
      INSERT INTO payment_transactions 
      (user_id, payment_id, payment_type, amount, currency, status, package_ids, created_at)
      VALUES ($1, $2, $3, $4, 'MXN', 'completed', $5, NOW())
    `, [userId, paymentId, paymentType, amount, packageIds]);

    return { success: true };

  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    return { success: false, error: 'Error confirmando pago' };
  }
};

// ============================================
// ENDPOINT DE PRUEBA: CONFIRMAR PAGO MANUALMENTE
// Para testing hasta implementar webhooks reales
// ============================================

export const testConfirmPayment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { paymentId, packageIds, amount, paymentType } = req.body;

    console.log('🧪 TEST: Confirming payment manually:', { paymentId, packageIds, amount, paymentType });

    const result = await confirmPaymentAndUpdatePackages(
      paymentId,
      packageIds,
      amount,
      paymentType,
      userId!
    );

    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Pago confirmado y paquetes actualizados',
        updatedPackages: packageIds.length
      });
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('❌ Error in test confirm payment:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error confirmando pago de prueba' 
    });
  }
};

// ============================================
// OPENPAY CALLBACK - Redirige al usuario después del pago
// ============================================
export const handleOpenpayPaymentCallback = async (req: Request, res: Response): Promise<any> => {
  try {
    const { paymentRef, userId, packageIds, amount, invoiceRequired, paymentOrderId, paymentReference, successRedirect, cancelRedirect, id: transactionId } = req.query;

    console.log(`📱 Callback OpenPay General - paymentRef: ${paymentRef}, transactionId: ${transactionId}`);

    const frontendUrl = process.env.FRONTEND_URL || 'https://entregax.app';
    const fallbackSuccess = `${frontendUrl}/?paymentSuccess=true&ref=${paymentRef || 'unknown'}`;
    const fallbackError = `${frontendUrl}/?paymentError=true`;
    const normalizeRedirect = (value: any, fallback: string): string => {
      const candidate = String(value || '').trim();
      if (!candidate) return fallback;
      if (candidate.startsWith('entregax://') || candidate.startsWith('exp://') || candidate.startsWith('https://entregax.app')) {
        return candidate;
      }
      return fallback;
    };

    // Verificar si ya fue procesado por el webhook
    // Intentar capturar el pago basándonos en los query params
    if (paymentRef && userId && packageIds && amount) {
      const pkgIds = (packageIds as string).split(',').map(Number).filter(n => !isNaN(n));
      const parsedAmount = parseFloat(amount as string);
      const parsedUserId = parseInt(userId as string);

      if (pkgIds.length > 0 && parsedAmount > 0 && parsedUserId > 0) {
        // Verificar si los paquetes ya están pagados
        const checkResult = await pool.query(
          `SELECT id, payment_status FROM packages WHERE id = ANY($1) AND user_id = $2`,
          [pkgIds, parsedUserId]
        );

        const alreadyPaid = checkResult.rows.every(r => r.payment_status === 'paid');

        if (!alreadyPaid) {
          // Marcar como pagados (OpenPay redirige después de pago exitoso)
          await pool.query(`
            UPDATE packages SET 
              payment_status = 'paid',
              monto_pagado = COALESCE(monto_pagado, 0) + $1,
              saldo_pendiente = 0,
              costing_paid = TRUE,
              client_paid = TRUE,
              costing_paid_at = CURRENT_TIMESTAMP,
              payment_reference = $2
            WHERE id = ANY($3) AND user_id = $4
          `, [parsedAmount, paymentRef, pkgIds, parsedUserId]);

          // Registrar en logs de cobranza
          try {
            // Si ya existe pending_payment para este paymentReference (creado en cash flow), actualizarlo.
            const refForLog = String(paymentReference || paymentRef || '');
            const upd = refForLog
              ? await pool.query(
                  `UPDATE openpay_webhook_logs
                     SET estatus_procesamiento = 'procesado',
                         payment_method = 'card',
                         tipo_pago = 'tarjeta',
                         monto_recibido = $1,
                         monto_neto = $2,
                         concepto = $3,
                         fecha_pago = CURRENT_TIMESTAMP
                   WHERE transaction_id = $4
                     AND estatus_procesamiento = 'pending_payment'
                   RETURNING id`,
                  [parsedAmount, parsedAmount * 0.9664, `Pago tarjeta - ${pkgIds.length} paquete(s)`, refForLog]
                )
              : { rowCount: 0 } as any;

            if (!upd.rowCount) {
              await pool.query(`
                INSERT INTO openpay_webhook_logs (
                  transaction_id, monto_recibido, monto_neto, concepto,
                  fecha_pago, estatus_procesamiento, user_id, tipo_pago, payment_method
                ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'procesado', $5, 'tarjeta', 'card')
              `, [
                transactionId || paymentRef,
                parsedAmount,
                parsedAmount * 0.9664, // ~3.36% comisión OpenPay tarjeta
                `Pago tarjeta - ${pkgIds.length} paquete(s)`,
                parsedUserId
              ]);
            }
          } catch (logErr: any) {
            console.log('Note: webhook_logs insert:', logErr.message);
          }

          // Si este pago viene de una orden PO Box, marcarla como pagada
          try {
            const requiresInvoice = String(invoiceRequired) === 'true';
            if (paymentOrderId) {
              await pool.query(
                `UPDATE pobox_payments
                 SET status = 'completed',
                     paid_at = CURRENT_TIMESTAMP,
                     payment_method = 'card',
                     requiere_factura = $1
                 WHERE id = $2 AND user_id = $3`,
                [requiresInvoice, Number(paymentOrderId), parsedUserId]
              );
            } else if (paymentReference) {
              await pool.query(
                `UPDATE pobox_payments
                 SET status = 'completed',
                     paid_at = CURRENT_TIMESTAMP,
                     payment_method = 'card',
                     requiere_factura = $1
                 WHERE payment_reference = $2 AND user_id = $3`,
                [requiresInvoice, String(paymentReference), parsedUserId]
              );
            }
          } catch (ordErr: any) {
            console.error('⚠️ No se pudo actualizar pobox_payments (OpenPay callback):', ordErr.message);
          }

          // Generar comisiones
          generateCommissionsForPackages(pkgIds).catch(err =>
            console.error('Error generando comisiones (OpenPay callback):', err)
          );

          console.log(`✅ OpenPay callback: ${pkgIds.length} paquetes marcados como pagados`);

          // 🧾 Facturación automática si el cliente la solicitó
          if (String(invoiceRequired) === 'true') {
            try {
              const existing = await pool.query(
                `SELECT uuid_sat FROM facturas_emitidas WHERE payment_id = $1 LIMIT 1`,
                [paymentRef]
              );
              if (existing.rows.length === 0) {
                const svcType = await getServiceTypeFromPackages(pkgIds);
                const invoiceResult = await createInvoice({
                  paymentId: String(paymentRef),
                  paymentType: 'openpay',
                  userId: parsedUserId,
                  amount: parsedAmount,
                  currency: 'MXN',
                  paymentMethod: 'card',
                  description: `Servicio de Logística - ${pkgIds.length} paquete(s)`,
                  packageIds: pkgIds,
                  serviceType: svcType,
                });
                if (invoiceResult.success) {
                  console.log(`🧾 Factura OpenPay emitida: ${invoiceResult.uuid}`);
                  if (paymentOrderId) {
                    await pool.query(
                      `UPDATE pobox_payments
                       SET facturada = TRUE,
                           factura_uuid = $1,
                           factura_created_at = CURRENT_TIMESTAMP,
                           factura_error = NULL
                       WHERE id = $2 AND user_id = $3`,
                      [invoiceResult.uuid, Number(paymentOrderId), parsedUserId]
                    );
                  } else if (paymentReference) {
                    await pool.query(
                      `UPDATE pobox_payments
                       SET facturada = TRUE,
                           factura_uuid = $1,
                           factura_created_at = CURRENT_TIMESTAMP,
                           factura_error = NULL
                       WHERE payment_reference = $2 AND user_id = $3`,
                      [invoiceResult.uuid, String(paymentReference), parsedUserId]
                    );
                  }
                } else {
                  console.error(`⚠️ No se pudo emitir factura OpenPay: ${invoiceResult.error}`);
                  if (paymentOrderId) {
                    await pool.query(
                      `UPDATE pobox_payments SET factura_error = $1 WHERE id = $2 AND user_id = $3`,
                      [invoiceResult.error || 'unknown', Number(paymentOrderId), parsedUserId]
                    );
                  } else if (paymentReference) {
                    await pool.query(
                      `UPDATE pobox_payments SET factura_error = $1 WHERE payment_reference = $2 AND user_id = $3`,
                      [invoiceResult.error || 'unknown', String(paymentReference), parsedUserId]
                    );
                  }
                }
              } else {
                console.log(`🧾 Factura ya existente para paymentRef=${paymentRef}`);
              }
            } catch (invErr: any) {
              console.error('❌ Error emitiendo factura OpenPay callback:', invErr.message);
            }
          }
        }
      }
    }

    // Redirigir a la app móvil (si viene deep link), si no al frontend web.
    res.redirect(normalizeRedirect(successRedirect, fallbackSuccess));

  } catch (error) {
    console.error('❌ Error en callback OpenPay:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'https://entregax.app';
    const cancelRedirect = (req.query as any)?.cancelRedirect;
    const fallbackError = `${frontendUrl}/?paymentError=true`;
    const candidate = String(cancelRedirect || '').trim();
    if (candidate && (candidate.startsWith('entregax://') || candidate.startsWith('exp://') || candidate.startsWith('https://entregax.app'))) {
      return res.redirect(candidate);
    }
    res.redirect(fallbackError);
  }
};

// ============================================
// VERIFICAR ESTADO DE CARGO OPENPAY (poll desde la app móvil)
// La app llama esto al cerrar el WebView para no depender del redirect.
// POST /api/payments/openpay/verify { paymentReference?, paymentOrderId? }
// ============================================
export const verifyOpenpayCharge = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    const { paymentReference, paymentOrderId } = req.body;

    if (!paymentReference && !paymentOrderId) {
      return res.status(400).json({ success: false, error: 'paymentReference o paymentOrderId es requerido' });
    }

    // Obtener la orden con el charge_id de OpenPay
    let orderRow;
    if (paymentOrderId) {
      const r = await pool.query(
        `SELECT * FROM pobox_payments WHERE id = $1 AND user_id = $2`,
        [Number(paymentOrderId), userId]
      );
      orderRow = r.rows[0];
    } else {
      const r = await pool.query(
        `SELECT * FROM pobox_payments WHERE payment_reference = $1 AND user_id = $2`,
        [String(paymentReference), userId]
      );
      orderRow = r.rows[0];
    }

    if (!orderRow) {
      return res.status(404).json({ success: false, error: 'Orden no encontrada' });
    }

    // Si ya está marcada como completada, regresar el estado actual
    if (orderRow.status === 'completed' || orderRow.status === 'paid') {
      return res.json({ success: true, status: orderRow.status, alreadyProcessed: true });
    }

    const chargeId = orderRow.external_transaction_id;
    if (!chargeId) {
      return res.json({ success: false, status: orderRow.status, error: 'Esta orden no tiene cargo de OpenPay asociado' });
    }

    // Consultar OpenPay para verificar el estado real del cargo
    const serviceType = await getServiceTypeFromPackages(orderRow.package_ids || []);
    const credentials = await getOpenpayCredentials(serviceType);
    const baseUrl = credentials.isSandbox ? OPENPAY_SANDBOX_URL : OPENPAY_PROD_URL;
    const chargeUrl = `${baseUrl}/${credentials.merchantId}/charges/${chargeId}`;

    const opRes = await axios.get(chargeUrl, {
      auth: { username: credentials.privateKey, password: '' }
    });

    const chargeStatus = opRes.data?.status; // completed | in_progress | failed | charge_pending | cancelled
    console.log(`🔍 verifyOpenpayCharge ${chargeId}: ${chargeStatus}`);

    if (chargeStatus !== 'completed') {
      return res.json({ success: false, status: chargeStatus, message: 'Pago aún no confirmado por OpenPay' });
    }

    // Marcar orden como completada y paquetes como pagados
    const amount = parseFloat(orderRow.amount);
    const pkgIds: number[] = Array.isArray(orderRow.package_ids) ? orderRow.package_ids : JSON.parse(orderRow.package_ids || '[]');
    const requireInvoice = !!orderRow.requiere_factura;
    const ref = orderRow.payment_reference;

    await pool.query(
      `UPDATE pobox_payments SET status = 'completed', paid_at = CURRENT_TIMESTAMP, payment_method = 'card' WHERE id = $1`,
      [orderRow.id]
    );

    await pool.query(
      `UPDATE packages SET payment_status = 'paid', monto_pagado = COALESCE(monto_pagado, 0) + $1, saldo_pendiente = 0,
                            costing_paid = TRUE, client_paid = TRUE, costing_paid_at = CURRENT_TIMESTAMP, payment_reference = $2
       WHERE (id = ANY($3) OR master_id = ANY($3)) AND user_id = $4`,
      [amount, ref, pkgIds, userId]
    );

    // Actualizar webhook log
    await pool.query(
      `UPDATE openpay_webhook_logs
         SET estatus_procesamiento = 'procesado', payment_method = 'card', tipo_pago = 'tarjeta', fecha_pago = CURRENT_TIMESTAMP
       WHERE transaction_id = $1`,
      [ref]
    );

    // Generar comisiones (no bloqueante)
    generateCommissionsForPackages(pkgIds).catch(err => console.error('Comisiones (verify):', err));

    return res.json({
      success: true,
      status: 'completed',
      paymentReference: ref,
      requiresInvoice: requireInvoice
    });
  } catch (error: any) {
    console.error('❌ verifyOpenpayCharge:', error?.response?.data || error?.message);
    return res.status(500).json({ success: false, error: error?.response?.data?.description || error?.message || 'Error verificando cargo' });
  }
};

// ============================================
// OPENPAY WEBHOOK - Recibe notificaciones de OpenPay
// ============================================
export const handleOpenpayPaymentWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    const event = req.body;

    console.log('📬 Webhook OpenPay General recibido:', event.type);

    if (event.type === 'charge.succeeded') {
      const orderId = event.transaction?.order_id;
      const transactionId = event.transaction?.id;
      const amount = parseFloat(event.transaction?.amount || 0);

      if (orderId) {
        // Buscar la transacción financiera por referencia
        const txResult = await pool.query(
          `SELECT id, user_id, metadata FROM financial_transactions WHERE reference_id = $1`,
          [orderId]
        );

        if (txResult.rows.length > 0) {
          const tx = txResult.rows[0];
          const metadata = tx.metadata || {};
          const packageIds = metadata.packageIds || [];
          const userId = tx.user_id;

          if (packageIds.length > 0 && userId) {
            // Verificar que no estén ya pagados
            const checkResult = await pool.query(
              `SELECT id, payment_status FROM packages WHERE id = ANY($1) AND payment_status != 'paid'`,
              [packageIds]
            );

            if (checkResult.rows.length > 0) {
              await pool.query(`
                UPDATE packages SET 
                  payment_status = 'paid',
                  monto_pagado = COALESCE(monto_pagado, 0) + $1,
                  saldo_pendiente = 0,
                  costing_paid = TRUE,
                  client_paid = TRUE,
                  costing_paid_at = CURRENT_TIMESTAMP,
                  payment_reference = $2
                WHERE id = ANY($3) AND user_id = $4
              `, [amount, orderId, packageIds, userId]);

              // Registrar en logs de cobranza
              const montoNeto = amount * 0.9664;
              try {
                await pool.query(`
                  INSERT INTO openpay_webhook_logs (
                    transaction_id, monto_recibido, monto_neto, concepto,
                    fecha_pago, estatus_procesamiento, user_id, tipo_pago, payment_method
                  ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, 'procesado', $5, 'tarjeta', 'card')
                `, [transactionId, amount, montoNeto, `Pago tarjeta webhook - ${packageIds.length} paquete(s)`, userId]);
              } catch (logErr: any) {
                console.log('Note: webhook_logs insert:', logErr.message);
              }

              // Si viene asociado a orden PO Box, marcarla como pagada
              try {
                const paymentOrderId = metadata.paymentOrderId;
                const paymentReference = metadata.paymentReference;
                const requiresInvoice = metadata.invoiceRequired === true || metadata.invoiceRequired === 'true';
                if (paymentOrderId) {
                  await pool.query(
                    `UPDATE pobox_payments
                     SET status = 'completed',
                         paid_at = CURRENT_TIMESTAMP,
                         payment_method = 'card',
                         requiere_factura = $1
                     WHERE id = $2 AND user_id = $3`,
                    [requiresInvoice, Number(paymentOrderId), userId]
                  );
                } else if (paymentReference) {
                  await pool.query(
                    `UPDATE pobox_payments
                     SET status = 'completed',
                         paid_at = CURRENT_TIMESTAMP,
                         payment_method = 'card',
                         requiere_factura = $1
                     WHERE payment_reference = $2 AND user_id = $3`,
                    [requiresInvoice, String(paymentReference), userId]
                  );
                }
              } catch (ordErr: any) {
                console.error('⚠️ No se pudo actualizar pobox_payments (OpenPay webhook):', ordErr.message);
              }

              // Generar comisiones
              generateCommissionsForPackages(packageIds).catch(err =>
                console.error('Error generando comisiones (OpenPay webhook):', err)
              );

              console.log(`✅ OpenPay webhook: ${checkResult.rows.length} paquetes marcados como pagados`);

              // 🧾 Facturación automática si el cliente la solicitó (persistido en metadata)
              if (metadata.invoiceRequired === true || metadata.invoiceRequired === 'true') {
                try {
                  const existing = await pool.query(
                    `SELECT uuid_sat FROM facturas_emitidas WHERE payment_id = $1 LIMIT 1`,
                    [orderId]
                  );
                  if (existing.rows.length === 0) {
                    const svcType = metadata.serviceType || await getServiceTypeFromPackages(packageIds);
                    const invoiceResult = await createInvoice({
                      paymentId: String(orderId),
                      paymentType: 'openpay',
                      userId: userId,
                      amount: amount,
                      currency: metadata.currency || 'MXN',
                      paymentMethod: 'card',
                      description: `Servicio de Logística - ${packageIds.length} paquete(s)`,
                      packageIds: packageIds,
                      serviceType: svcType,
                    });
                    if (invoiceResult.success) {
                      console.log(`🧾 Factura OpenPay (webhook) emitida: ${invoiceResult.uuid}`);
                      if (metadata.paymentOrderId) {
                        await pool.query(
                          `UPDATE pobox_payments
                           SET facturada = TRUE,
                               factura_uuid = $1,
                               factura_created_at = CURRENT_TIMESTAMP,
                               factura_error = NULL
                           WHERE id = $2 AND user_id = $3`,
                          [invoiceResult.uuid, Number(metadata.paymentOrderId), userId]
                        );
                      } else if (metadata.paymentReference) {
                        await pool.query(
                          `UPDATE pobox_payments
                           SET facturada = TRUE,
                               factura_uuid = $1,
                               factura_created_at = CURRENT_TIMESTAMP,
                               factura_error = NULL
                           WHERE payment_reference = $2 AND user_id = $3`,
                          [invoiceResult.uuid, String(metadata.paymentReference), userId]
                        );
                      }
                    } else {
                      console.error(`⚠️ No se pudo emitir factura OpenPay webhook: ${invoiceResult.error}`);
                      if (metadata.paymentOrderId) {
                        await pool.query(
                          `UPDATE pobox_payments SET factura_error = $1 WHERE id = $2 AND user_id = $3`,
                          [invoiceResult.error || 'unknown', Number(metadata.paymentOrderId), userId]
                        );
                      } else if (metadata.paymentReference) {
                        await pool.query(
                          `UPDATE pobox_payments SET factura_error = $1 WHERE payment_reference = $2 AND user_id = $3`,
                          [invoiceResult.error || 'unknown', String(metadata.paymentReference), userId]
                        );
                      }
                    }
                  }
                } catch (invErr: any) {
                  console.error('❌ Error emitiendo factura OpenPay webhook:', invErr.message);
                }
              }
            }
          }
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error procesando webhook OpenPay:', error);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
};

// ============================================
// PAYPAL CALLBACK - Redirige y captura el pago después de aprobación
// ============================================
export const handlePayPalPaymentCallback = async (req: Request, res: Response): Promise<any> => {
  try {
    const { paymentRef, userId, packageIds, amount, invoiceRequired, paymentOrderId, paymentReference, successRedirect, cancelRedirect, token: paypalOrderId, PayerID } = req.query;

    console.log(`📱 Callback PayPal General - paymentRef: ${paymentRef}, orderId: ${paypalOrderId}`);

    const frontendUrl = process.env.FRONTEND_URL || 'https://entregax.app';
    const fallbackSuccess = `${frontendUrl}/?paymentSuccess=true&ref=${paymentRef || paypalOrderId}`;
    const fallbackError = `${frontendUrl}/?paymentError=true`;
    const normalizeRedirect = (value: any, fallback: string): string => {
      const candidate = String(value || '').trim();
      if (!candidate) return fallback;
      if (candidate.startsWith('entregax://') || candidate.startsWith('exp://') || candidate.startsWith('https://entregax.app')) {
        return candidate;
      }
      return fallback;
    };

    if (!paypalOrderId) {
      console.error('❌ PayPal callback sin orderId');
      return res.redirect(normalizeRedirect(cancelRedirect, `${frontendUrl}/payment/error`));
    }

    // Capturar el pago en PayPal
    let credentials: PayPalCredentials;
    try {
      credentials = await getPaypalCredentials();
    } catch (credError: any) {
      console.error('❌ Error obteniendo credenciales PayPal para captura:', credError.message);
      return res.redirect(normalizeRedirect(cancelRedirect, `${frontendUrl}/payment/error`));
    }

    const paypalToken = await getPayPalToken(credentials);
    const paypalApiUrl = credentials.isSandbox ? PAYPAL_SANDBOX_URL : PAYPAL_PROD_URL;

    const capture = await axios.post(
      `${paypalApiUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
      {},
      {
        headers: { 
          'Authorization': `Bearer ${paypalToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`💰 PayPal captura: ${capture.data.status}`);

    if (capture.data.status === 'COMPLETED') {
      const captureDetails = capture.data.purchase_units[0]?.payments?.captures[0];
      const pkgIds = packageIds ? (packageIds as string).split(',').map(Number).filter(n => !isNaN(n)) : [];
      const parsedAmount = parseFloat(amount as string) || parseFloat(captureDetails?.amount?.value || '0');
      const parsedUserId = parseInt(userId as string) || 0;

      if (pkgIds.length > 0 && parsedUserId > 0) {
        // Marcar paquetes como pagados
        await pool.query(`
          UPDATE packages SET 
            payment_status = 'paid',
            monto_pagado = COALESCE(monto_pagado, 0) + $1,
            saldo_pendiente = 0,
            costing_paid = TRUE,
            client_paid = TRUE,
            costing_paid_at = CURRENT_TIMESTAMP,
            payment_reference = $2
          WHERE id = ANY($3) AND user_id = $4
        `, [parsedAmount, paymentRef || paypalOrderId, pkgIds, parsedUserId]);

        // Registrar en logs de cobranza
        try {
          const refForLog = String(paymentReference || paymentRef || '');
          const upd = refForLog
            ? await pool.query(
                `UPDATE openpay_webhook_logs
                   SET estatus_procesamiento = 'procesado',
                       payment_method = 'paypal',
                       tipo_pago = 'paypal',
                       monto_recibido = $1,
                       monto_neto = $1,
                       concepto = $2,
                       fecha_pago = CURRENT_TIMESTAMP
                 WHERE transaction_id = $3
                   AND estatus_procesamiento = 'pending_payment'
                 RETURNING id`,
                [parsedAmount, `Pago PayPal - ${pkgIds.length} paquete(s)`, refForLog]
              )
            : { rowCount: 0 } as any;

          if (!upd.rowCount) {
            await pool.query(`
              INSERT INTO openpay_webhook_logs (
                transaction_id, monto_recibido, monto_neto, concepto,
                fecha_pago, estatus_procesamiento, user_id, tipo_pago, payment_method
              ) VALUES ($1, $2, $2, $3, CURRENT_TIMESTAMP, 'procesado', $4, 'paypal', 'paypal')
            `, [
              captureDetails?.id || paypalOrderId,
              parsedAmount,
              `Pago PayPal - ${pkgIds.length} paquete(s)`,
              parsedUserId
            ]);
          }
        } catch (logErr: any) {
          console.log('Note: webhook_logs insert:', logErr.message);
        }

        // Si este pago viene de una orden PO Box, marcarla como pagada
        try {
          const requiresInvoice = String(invoiceRequired) === 'true';
          if (paymentOrderId) {
            await pool.query(
              `UPDATE pobox_payments
               SET status = 'completed',
                   paid_at = CURRENT_TIMESTAMP,
                   payment_method = 'paypal',
                   requiere_factura = $1
               WHERE id = $2 AND user_id = $3`,
              [requiresInvoice, Number(paymentOrderId), parsedUserId]
            );
          } else if (paymentReference) {
            await pool.query(
              `UPDATE pobox_payments
               SET status = 'completed',
                   paid_at = CURRENT_TIMESTAMP,
                   payment_method = 'paypal',
                   requiere_factura = $1
               WHERE payment_reference = $2 AND user_id = $3`,
              [requiresInvoice, String(paymentReference), parsedUserId]
            );
          }
        } catch (ordErr: any) {
          console.error('⚠️ No se pudo actualizar pobox_payments (PayPal callback):', ordErr.message);
        }

        // Generar comisiones
        generateCommissionsForPackages(pkgIds).catch(err =>
          console.error('Error generando comisiones (PayPal callback):', err)
        );

        console.log(`✅ PayPal callback: ${pkgIds.length} paquetes marcados como pagados`);

        // 🧾 Facturación automática si el cliente la solicitó
        if (String(invoiceRequired) === 'true') {
          try {
            const payId = String(paymentRef || paypalOrderId);
            const existing = await pool.query(
              `SELECT uuid_sat FROM facturas_emitidas WHERE payment_id = $1 LIMIT 1`,
              [payId]
            );
            if (existing.rows.length === 0) {
              const svcType = await getServiceTypeFromPackages(pkgIds);
              const invoiceResult = await createInvoice({
                paymentId: payId,
                paymentType: 'paypal',
                userId: parsedUserId,
                amount: parsedAmount,
                currency: captureDetails?.amount?.currency_code || 'USD',
                paymentMethod: 'paypal',
                description: `Servicio de Logística - ${pkgIds.length} paquete(s)`,
                packageIds: pkgIds,
                serviceType: svcType,
              });
              if (invoiceResult.success) {
                console.log(`🧾 Factura PayPal emitida: ${invoiceResult.uuid}`);
                if (paymentOrderId) {
                  await pool.query(
                    `UPDATE pobox_payments
                     SET facturada = TRUE,
                         factura_uuid = $1,
                         factura_created_at = CURRENT_TIMESTAMP,
                         factura_error = NULL
                     WHERE id = $2 AND user_id = $3`,
                    [invoiceResult.uuid, Number(paymentOrderId), parsedUserId]
                  );
                } else if (paymentReference) {
                  await pool.query(
                    `UPDATE pobox_payments
                     SET facturada = TRUE,
                         factura_uuid = $1,
                         factura_created_at = CURRENT_TIMESTAMP,
                         factura_error = NULL
                     WHERE payment_reference = $2 AND user_id = $3`,
                    [invoiceResult.uuid, String(paymentReference), parsedUserId]
                  );
                }
              } else {
                console.error(`⚠️ No se pudo emitir factura PayPal: ${invoiceResult.error}`);
                if (paymentOrderId) {
                  await pool.query(
                    `UPDATE pobox_payments SET factura_error = $1 WHERE id = $2 AND user_id = $3`,
                    [invoiceResult.error || 'unknown', Number(paymentOrderId), parsedUserId]
                  );
                } else if (paymentReference) {
                  await pool.query(
                    `UPDATE pobox_payments SET factura_error = $1 WHERE payment_reference = $2 AND user_id = $3`,
                    [invoiceResult.error || 'unknown', String(paymentReference), parsedUserId]
                  );
                }
              }
            }
          } catch (invErr: any) {
            console.error('❌ Error emitiendo factura PayPal callback:', invErr.message);
          }
        }
      }

      return res.redirect(normalizeRedirect(successRedirect, fallbackSuccess));
    } else {
      console.error('❌ PayPal captura no completada:', capture.data.status);
      return res.redirect(normalizeRedirect(cancelRedirect, `${frontendUrl}/?paymentError=true&status=${capture.data.status}`));
    }

  } catch (error: any) {
    console.error('❌ Error en callback PayPal:', error.response?.data || error.message);
    const frontendUrl = process.env.FRONTEND_URL || 'https://entregax.app';
    const cancelRedirect = (req.query as any)?.cancelRedirect;
    const candidate = String(cancelRedirect || '').trim();
    if (candidate && (candidate.startsWith('entregax://') || candidate.startsWith('exp://') || candidate.startsWith('https://entregax.app'))) {
      return res.redirect(candidate);
    }
    res.redirect(`${frontendUrl}/?paymentError=true`);
  }
};