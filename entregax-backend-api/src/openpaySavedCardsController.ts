/**
 * Openpay – Tarjetas guardadas (Opción A: cobro a cliente existente)
 *
 * Endpoints:
 *   GET    /api/payments/openpay/public-key         → public_key + sandbox flag (para el SDK JS)
 *   GET    /api/payments/openpay/cards              → lista las tarjetas guardadas del usuario
 *   POST   /api/payments/openpay/cards              → guarda una tarjeta tokenizada (token_id desde Openpay.js)
 *   DELETE /api/payments/openpay/cards/:cardId      → elimina una tarjeta guardada
 *   POST   /api/payments/openpay/charge-saved-card  → cobra al cliente usando source_id (card_id guardado)
 *
 * Flujo:
 *   1. Frontend pide /public-key, carga Openpay.js, tokeniza la tarjeta nueva.
 *   2. Frontend manda { tokenId, deviceSessionId } a POST /cards → backend la guarda
 *      bajo el openpay_customer_id del usuario (si no existe, lo crea).
 *   3. Para cobrar, frontend manda { packageIds, total, cardId, deviceSessionId, ... }
 *      a /charge-saved-card → backend ejecuta charge con source_id, sin redirección.
 */

import { Response } from 'express';
import axios from 'axios';
import { pool } from './db';
import { AuthRequest } from './authController';
import { getOpenpayCredentials, ServiceType } from './services/openpayConfig';
import { createInvoice } from './fiscalController';

const OPENPAY_SANDBOX_URL = 'https://sandbox-api.openpay.mx/v1';
const OPENPAY_PROD_URL = 'https://api.openpay.mx/v1';

const baseUrl = (isSandbox: boolean) => (isSandbox ? OPENPAY_SANDBOX_URL : OPENPAY_PROD_URL);
const auth = (privateKey: string) => ({ auth: { username: privateKey, password: '' } });

/** Determina el ServiceType de un conjunto de paquetes (similar al usado en multiServicePaymentController). */
const getServiceTypeFromPackages = async (packageIds: number[]): Promise<ServiceType> => {
  if (!packageIds || packageIds.length === 0) return 'aereo';
  const result = await pool.query(
    `SELECT service_type FROM packages WHERE id = ANY($1) AND service_type IS NOT NULL LIMIT 1`,
    [packageIds]
  );
  if (result.rows.length > 0) {
    const st = String(result.rows[0].service_type).toUpperCase();
    const map: Record<string, ServiceType> = {
      POBOX_USA: 'po_box',
      AIR_CHN_MX: 'aereo',
      SEA_CHN_MX: 'maritimo',
      AA_DHL: 'dhl_liberacion',
      POBOX: 'po_box',
      AEREO: 'aereo',
      MARITIMO: 'maritimo',
      DHL: 'dhl_liberacion',
    };
    return map[st] || 'aereo';
  }
  return 'aereo';
};

/**
 * Garantiza un openpay_customer_id real para el usuario en el merchant del servicio dado.
 * Si no existe, crea el customer en Openpay y lo guarda en users.openpay_customer_id.
 * Nota: Actualmente almacenamos UN solo customer_id por usuario (en users). Si más adelante
 * se requiere uno por servicio/merchant, mover a user_financial_profiles.
 */
const ensureOpenpayCustomer = async (
  userId: number,
  serviceType: ServiceType
): Promise<{ customerId: string; merchantId: string; privateKey: string; publicKey: string; isSandbox: boolean }> => {
  const credentials = await getOpenpayCredentials(serviceType);
  const userRes = await pool.query(
    'SELECT id, full_name, email, phone, openpay_customer_id FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');
  const user = userRes.rows[0];

  let customerId: string | null = user.openpay_customer_id || null;

  // Validar que el customerId existe en este merchant. Si no, recrear.
  if (customerId) {
    try {
      await axios.get(
        `${baseUrl(credentials.isSandbox)}/${credentials.merchantId}/customers/${customerId}`,
        auth(credentials.privateKey)
      );
    } catch (err: any) {
      if (err.response?.status === 404) {
        console.warn(`⚠️ Customer ${customerId} no existe en merchant ${credentials.merchantId}. Recreando…`);
        customerId = null;
      } else if (err.response?.status === 401) {
        throw new Error('Credenciales OpenPay inválidas');
      }
      // Otros errores: seguimos asumiendo válido para no bloquear
    }
  }

  if (!customerId) {
    const customerData = {
      name: user.full_name?.split(' ')[0] || 'Cliente',
      last_name: user.full_name?.split(' ').slice(1).join(' ') || 'EntregaX',
      email: user.email || `cliente${user.id}@entregax.com`,
      phone_number: (user.phone || '').replace(/\D/g, '').slice(-10) || '0000000000',
      requires_account: false,
    };
    const createRes = await axios.post(
      `${baseUrl(credentials.isSandbox)}/${credentials.merchantId}/customers`,
      customerData,
      auth(credentials.privateKey)
    );
    customerId = createRes.data.id;
    await pool.query('UPDATE users SET openpay_customer_id = $1 WHERE id = $2', [customerId, userId]);
    console.log(`✅ Openpay customer creado: ${customerId} para user ${userId}`);
  }

  return {
    customerId: customerId!,
    merchantId: credentials.merchantId,
    privateKey: credentials.privateKey,
    publicKey: credentials.publicKey || '',
    isSandbox: credentials.isSandbox,
  };
};

// ============================================================
// GET /api/payments/openpay/public-key?service=aereo
// ============================================================
export const getOpenpayPublicKey = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const service = (req.query.service as ServiceType) || 'aereo';
    const credentials = await getOpenpayCredentials(service);
    return res.json({
      success: true,
      merchantId: credentials.merchantId,
      publicKey: credentials.publicKey,
      sandbox: credentials.isSandbox,
    });
  } catch (error: any) {
    console.error('Error getOpenpayPublicKey:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================
// GET /api/payments/openpay/cards?service=aereo
// ============================================================
export const listSavedCards = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
    const service = ((req.query.service as ServiceType) || 'aereo') as ServiceType;

    let ctx;
    try {
      ctx = await ensureOpenpayCustomer(userId, service);
    } catch (e: any) {
      // Si aún no se pudo crear/asegurar el customer, devolvemos lista vacía
      // para que el cliente pueda añadir una tarjeta nueva sin ver "Error interno".
      console.warn('⚠️ listSavedCards: ensureOpenpayCustomer falló, devolviendo lista vacía:', e?.response?.data || e?.message || e);
      return res.json({ success: true, cards: [], customerPending: true });
    }

    const r = await axios.get(
      `${baseUrl(ctx.isSandbox)}/${ctx.merchantId}/customers/${ctx.customerId}/cards?limit=20`,
      auth(ctx.privateKey)
    );

    const cards = (r.data || []).map((c: any) => ({
      id: c.id,
      brand: c.brand,
      cardNumber: c.card_number, // últimos 4
      holderName: c.holder_name,
      expirationMonth: c.expiration_month,
      expirationYear: c.expiration_year,
      pointsCard: c.points_card,
      type: c.type,
      bank: c.bank_name,
      allowsCharges: c.allows_charges,
      allowsPayouts: c.allows_payouts,
      creationDate: c.creation_date,
    }));

    return res.json({ success: true, cards });
  } catch (error: any) {
    // Cualquier otro error: log completo en backend, lista vacía al cliente
    // para no bloquear el flujo de "pagar con tarjeta nueva".
    console.error('❌ listSavedCards:', error.response?.data || error.message);
    return res.json({
      success: true,
      cards: [],
      warning: error.response?.data?.description || error.message || 'No se pudieron listar tarjetas guardadas',
    });
  }
};

// ============================================================
// POST /api/payments/openpay/cards
// body: { tokenId, deviceSessionId, service?, holderName? }
// ============================================================
export const saveCardFromToken = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
    const { tokenId, deviceSessionId, service, holderName } = req.body || {};
    if (!tokenId) return res.status(400).json({ success: false, error: 'tokenId requerido' });

    const ctx = await ensureOpenpayCustomer(userId, (service as ServiceType) || 'aereo');

    const cardData: any = {
      token_id: tokenId,
      device_session_id: deviceSessionId,
    };
    if (holderName) cardData.holder_name = holderName;

    const r = await axios.post(
      `${baseUrl(ctx.isSandbox)}/${ctx.merchantId}/customers/${ctx.customerId}/cards`,
      cardData,
      auth(ctx.privateKey)
    );

    const c = r.data;
    return res.json({
      success: true,
      card: {
        id: c.id,
        brand: c.brand,
        cardNumber: c.card_number,
        holderName: c.holder_name,
        expirationMonth: c.expiration_month,
        expirationYear: c.expiration_year,
        bank: c.bank_name,
      },
    });
  } catch (error: any) {
    console.error('❌ saveCardFromToken:', error.response?.data || error.message);
    return res.status(400).json({
      success: false,
      error: error.response?.data?.description || error.message,
    });
  }
};

// ============================================================
// DELETE /api/payments/openpay/cards/:cardId?service=aereo
// ============================================================
export const deleteSavedCard = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });
    const { cardId } = req.params;
    const service = ((req.query.service as ServiceType) || 'aereo') as ServiceType;
    if (!cardId) return res.status(400).json({ success: false, error: 'cardId requerido' });

    const ctx = await ensureOpenpayCustomer(userId, service);
    await axios.delete(
      `${baseUrl(ctx.isSandbox)}/${ctx.merchantId}/customers/${ctx.customerId}/cards/${cardId}`,
      auth(ctx.privateKey)
    );

    return res.json({ success: true });
  } catch (error: any) {
    console.error('❌ deleteSavedCard:', error.response?.data || error.message);
    return res.status(400).json({
      success: false,
      error: error.response?.data?.description || error.message,
    });
  }
};

// ============================================================
// POST /api/payments/openpay/charge-saved-card
// body: {
//   packageIds: number[], total: number, currency?: 'MXN',
//   cardId: string, deviceSessionId: string, cvv2?: string,
//   invoiceRequired?: boolean, invoiceData?: any,
//   paymentOrderId?: number, paymentReference?: string
// }
// ============================================================
export const chargeSavedCard = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

    const {
      packageIds = [],
      total,
      currency = 'MXN',
      cardId,
      deviceSessionId,
      cvv2,
      invoiceRequired = false,
      invoiceData = null,
      paymentOrderId = null,
      paymentReference = null,
    } = req.body || {};

    if (!cardId) return res.status(400).json({ success: false, error: 'cardId requerido' });
    if (!deviceSessionId) return res.status(400).json({ success: false, error: 'deviceSessionId requerido' });
    if (!total || total <= 0) return res.status(400).json({ success: false, error: 'total inválido' });

    const serviceType = await getServiceTypeFromPackages(packageIds);
    const ctx = await ensureOpenpayCustomer(userId, serviceType);

    const orderId = `OPSC-${Date.now()}-${userId}`;
    const description = `Pago EntregaX ${packageIds.length} ${packageIds.length === 1 ? 'paquete' : 'paquetes'}`;

    const chargeData: any = {
      source_id: cardId,
      method: 'card',
      amount: Number(total),
      currency,
      description,
      order_id: orderId,
      device_session_id: deviceSessionId,
      use_card_points: 'NONE',
    };
    if (cvv2) chargeData.cvv2 = String(cvv2);

    // Cobro server-to-server al cliente con source_id (no requiere redirect)
    const r = await axios.post(
      `${baseUrl(ctx.isSandbox)}/${ctx.merchantId}/customers/${ctx.customerId}/charges`,
      chargeData,
      auth(ctx.privateKey)
    );

    const charge = r.data;
    const isCompleted = charge.status === 'completed';

    // Registrar transacción
    try {
      await pool.query(
        `INSERT INTO financial_transactions
         (user_id, type, amount, description, reference_id, reference_type, metadata, status, created_at)
         VALUES ($1, 'payment', $2, $3, $4, 'openpay_card_saved', $5, $6, NOW())`,
        [
          userId,
          total,
          description,
          orderId,
          JSON.stringify({
            packageIds,
            currency,
            serviceType,
            cardId,
            chargeId: charge.id,
            invoiceRequired,
            invoiceData,
            paymentOrderId,
            paymentReference,
          }),
          isCompleted ? 'completed' : (charge.status || 'pending'),
        ]
      );
    } catch (txErr: any) {
      console.warn('financial_transactions insert:', txErr.message);
    }

    if (isCompleted && Array.isArray(packageIds) && packageIds.length > 0) {
      try {
        await pool.query(
          `UPDATE packages SET payment_status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = ANY($1)`,
          [packageIds]
        );
      } catch (e: any) {
        console.warn('UPDATE packages payment_status:', e.message);
      }

      // Marcar pobox_payments si aplica
      try {
        if (paymentOrderId) {
          await pool.query(
            `UPDATE pobox_payments
                SET payment_method = 'openpay_card_saved',
                    status = 'paid',
                    paid_at = NOW(),
                    requiere_factura = $1
              WHERE id = $2 AND user_id = $3`,
            [!!invoiceRequired, Number(paymentOrderId), userId]
          );
        } else if (paymentReference) {
          await pool.query(
            `UPDATE pobox_payments
                SET payment_method = 'openpay_card_saved',
                    status = 'paid',
                    paid_at = NOW(),
                    requiere_factura = $1
              WHERE payment_reference = $2 AND user_id = $3`,
            [!!invoiceRequired, String(paymentReference), userId]
          );
        }
      } catch (e: any) {
        console.warn('UPDATE pobox_payments:', e.message);
      }

      // Generar factura si se solicitó
      if (invoiceRequired) {
        try {
          await createInvoice({
            paymentId: charge.id,
            paymentType: 'openpay',
            userId,
            amount: total,
            currency,
            paymentMethod: 'card',
            description,
            packageIds,
            serviceType,
          });
        } catch (e: any) {
          console.warn('createInvoice:', e.message);
        }
      }
    }

    return res.json({
      success: true,
      status: charge.status,
      completed: isCompleted,
      chargeId: charge.id,
      orderId,
      authorization: charge.authorization || null,
      amount: Number(charge.amount),
      currency: charge.currency,
      paymentMethod: 'openpay_card_saved',
    });
  } catch (error: any) {
    console.error('❌ chargeSavedCard:', error.response?.data || error.message);
    return res.status(400).json({
      success: false,
      error: error.response?.data?.description || error.message,
      details: error.response?.data || null,
    });
  }
};
