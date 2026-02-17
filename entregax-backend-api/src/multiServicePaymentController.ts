/**
 * Controlador de Pagos Multi-Servicio
 * Maneja pagos separados por RFC/Empresa
 */

import { Request, Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import { 
  ServiceType, 
  getOpenpayCredentials, 
  getServiceCompanyInfo, 
  getAllServices,
  getServiceFromReferenceType 
} from './services/openpayConfig';

// ============================================
// OBTENER PAGOS PENDIENTES DEL USUARIO
// Agrupa por servicio para mostrar separados
// ============================================

export const getUserPendingPayments = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;

    // Obtener todas las facturas pendientes agrupadas por servicio
    const result = await pool.query(`
      SELECT 
        si.id,
        si.service,
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
        si.created_at
      FROM payment_invoices si
      JOIN service_companies sc ON si.service = sc.service
      WHERE si.user_id = $1 
        AND si.status IN ('pending', 'partial')
      ORDER BY si.due_date ASC, si.created_at ASC
    `, [userId]);

    // Agrupar por servicio
    const grouped: Record<string, any> = {};
    let totalPending = 0;

    for (const invoice of result.rows) {
      const service = invoice.service;
      if (!grouped[service]) {
        grouped[service] = {
          service,
          companyName: invoice.company_name,
          invoices: [],
          subtotal: 0
        };
      }
      grouped[service].invoices.push(invoice);
      grouped[service].subtotal += parseFloat(invoice.balance_due);
      totalPending += parseFloat(invoice.balance_due);
    }

    res.json({
      success: true,
      totalPending,
      byService: Object.values(grouped),
      invoices: result.rows
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
