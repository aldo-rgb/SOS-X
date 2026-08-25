/**
 * Payment Voucher Controller
 * Handles uploading, confirming, and managing payment receipts (comprobantes de pago)
 * Supports OCR extraction via Google Cloud Vision API
 */

import { Request, Response } from 'express';
import { pool } from './db';
import { markDhlGroupPaid } from './dhlGroup';
import { resolveCreditService, restoreServiceCredit } from './creditRestore';
import { uploadToS3, getSignedUrlForKey } from './s3Service';
import { extractAmountFromReceipt, isOcrAvailable } from './ocrService';
import { normalizeServiceForCredit, generateInvoiceForPoboxPaymentByRef } from './poboxPaymentController';
// Resolvedor autoritativo del servicio de una orden (ver orderService.ts).
import { resolveOrderService } from './orderService';

interface AuthRequest extends Request {
  user?: { userId: number; email: string; role?: string; level?: number };
}

// ============================================================
// CLIENT ENDPOINTS
// ============================================================

/**
 * POST /api/payment/voucher/upload
 * Upload a payment receipt image/PDF with OCR amount extraction
 * Body (multipart): file, payment_order_id, service_type, payment_reference
 */
export const uploadVoucher = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No se envió archivo' });

    const { payment_order_id, service_type, payment_reference } = req.body;
    if (!payment_order_id || !service_type) {
      return res.status(400).json({ error: 'Faltan campos requeridos: payment_order_id, service_type' });
    }

    // Validate the payment order belongs to the user and is still pending
    const orderCheck = await pool.query(
      `SELECT id, user_id, amount, currency, status, voucher_total, payment_reference,
              payment_method, COALESCE(credit_settled, false) AS credit_settled
       FROM pobox_payments WHERE id = $1`,
      [payment_order_id]
    );
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Orden de pago no encontrada' });
    }
    const order = orderCheck.rows[0];
    if (order.user_id !== userId) {
      return res.status(403).json({ error: 'No tienes acceso a esta orden' });
    }
    // 💳 Órdenes a CRÉDITO no liquidadas: aunque estén 'completed', el cliente
    // sube su comprobante para pagar el crédito. Las reabrimos a 'pending_payment'
    // para que sigan el mismo pipeline (subir → confirmar → conciliar en Cobranza).
    const isUnsettledCredit = String(order.payment_method || '').toLowerCase() === 'credit'
      && order.credit_settled !== true;
    if (order.status === 'completed' && !isUnsettledCredit) {
      return res.status(400).json({ error: 'Esta orden ya fue pagada' });
    }
    if (isUnsettledCredit && order.status === 'completed') {
      await pool.query(
        `UPDATE pobox_payments SET status = 'pending_payment' WHERE id = $1`,
        [payment_order_id]
      );
      order.status = 'pending_payment';
    }

    // Determine file type
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'application/pdf': 'pdf',
    };
    const fileType = mimeToExt[file.mimetype] || 'jpg';
    const contentType = file.mimetype || 'image/jpeg';

    // Upload to S3
    const timestamp = Date.now();
    const s3Key = `vouchers/${userId}/${payment_order_id}/${timestamp}.${fileType}`;
    const fileUrl = await uploadToS3(file.buffer, s3Key, contentType);

    // OCR extraction (only for images, not PDFs)
    let ocrResult = {
      detected_amount: null as number | null,
      confidence: 0,
      raw_text: '',
      all_amounts: [] as number[],
      reference_found: null as string | null,
    };

    if (isOcrAvailable() && fileType !== 'pdf') {
      try {
        ocrResult = await extractAmountFromReceipt(
          file.buffer,
          payment_reference || order.payment_reference
        );
        console.log(`[VOUCHER] OCR result for order ${payment_order_id}: amount=${ocrResult.detected_amount}, confidence=${ocrResult.confidence}%`);
      } catch (ocrErr: any) {
        console.error('[VOUCHER] OCR failed, user will input manually:', ocrErr.message);
      }
    }

    // Save voucher record (status: pending_review, amount will be confirmed by user)
    const insertResult = await pool.query(
      `INSERT INTO payment_vouchers 
       (payment_order_id, user_id, service_type, file_url, file_key, file_type,
        detected_amount, declared_amount, currency, status, ocr_raw_text, ocr_confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_confirm', $10, $11)
       RETURNING *`,
      [
        payment_order_id, userId, service_type, fileUrl, s3Key, fileType,
        ocrResult.detected_amount,
        ocrResult.detected_amount || 0, // Will be updated on confirm
        order.currency || 'MXN',
        ocrResult.raw_text?.substring(0, 5000) || '',
        ocrResult.confidence,
      ]
    );

    const voucher = insertResult.rows[0];

    // Generate signed URL for the uploaded file
    const signedFileUrl = await getSignedUrlForKey(s3Key, 3600);

    // Calculate remaining
    const remaining = Number(order.amount) - Number(order.voucher_total || 0);

    return res.json({
      success: true,
      voucher: {
        id: voucher.id,
        file_url: signedFileUrl,
        file_type: fileType,
        status: 'pending_confirm',
        detected_amount: ocrResult.detected_amount,
        confidence: ocrResult.confidence,
        all_amounts: ocrResult.all_amounts,
        reference_found: ocrResult.reference_found,
      },
      order: {
        total: Number(order.amount),
        accumulated: Number(order.voucher_total || 0),
        remaining,
        currency: order.currency || 'MXN',
      },
    });
  } catch (error: any) {
    console.error('[VOUCHER] Upload error:', error);
    return res.status(500).json({ error: 'Error al subir comprobante' });
  }
};

/**
 * POST /api/payment/voucher/confirm
 * User confirms or corrects the OCR-detected amount
 * Body: { voucher_id, declared_amount }
 */
export const confirmVoucherAmount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { voucher_id, declared_amount } = req.body;
    if (!voucher_id || declared_amount === undefined) {
      return res.status(400).json({ error: 'Faltan campos: voucher_id, declared_amount' });
    }

    const amount = parseFloat(declared_amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    // Validate voucher belongs to user
    const voucherCheck = await pool.query(
      `SELECT v.*, p.amount as order_amount, p.voucher_total, p.currency, p.status as order_status
       FROM payment_vouchers v
       JOIN pobox_payments p ON p.id = v.payment_order_id
       WHERE v.id = $1 AND v.user_id = $2`,
      [voucher_id, userId]
    );
    if (voucherCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }
    const voucher = voucherCheck.rows[0];
    if (voucher.status !== 'pending_confirm') {
      return res.status(400).json({ error: 'Este comprobante ya fue confirmado' });
    }

    // 🔁 DUPLICADO: el mismo pago suele entrar dos veces —el cliente lo sube por
    // la app y su asesor lo sube desde el panel con la imagen que le mandaron por
    // WhatsApp—. El sistema los sumaba como pagos distintos, inflaba
    // voucher_total al doble y generaba saldo a favor por dinero que nunca entró
    // (4 casos, $47,541). Se marca el comprobante repetido para que nadie lo
    // apruebe sin verlo; NO se bloquea la subida, porque dos pagos idénticos
    // legítimos son posibles.
    const dupRes = await pool.query(
      `SELECT id FROM payment_vouchers
        WHERE payment_order_id = $1 AND id <> $2
          AND status <> 'rejected'
          AND ABS(COALESCE(declared_amount,0) - $3::numeric) < 0.01
        ORDER BY id LIMIT 1`,
      [voucher.payment_order_id, voucher_id, amount]
    );
    const duplicadoDe: number | null = dupRes.rows[0]?.id ?? null;
    if (duplicadoDe) {
      console.warn(`[VOUCHER] posible duplicado: comprobante ${voucher_id} repite el monto $${amount} del ${duplicadoDe} en la orden ${voucher.payment_order_id}`);
    }

    // Update voucher with confirmed amount
    await pool.query(
      `UPDATE payment_vouchers SET declared_amount = $1, status = 'pending_review', updated_at = NOW(),
           duplicate_of_voucher_id = $3
       WHERE id = $2`,
      [amount, voucher_id, duplicadoDe]
    );

    // Update order accumulated total
    const newTotal = Number(voucher.voucher_total || 0) + amount;
    const orderTotal = Number(voucher.order_amount);
    const coversTotal = newTotal >= orderTotal;
    const newStatus = coversTotal ? 'vouchers_submitted' : 'vouchers_partial';
    await pool.query(
      `UPDATE pobox_payments 
       SET voucher_total = $1, voucher_count = COALESCE(voucher_count, 0) + 1,
           status = CASE WHEN status IN ('pending_payment', 'vouchers_partial') THEN $3 ELSE status END
       WHERE id = $2`,
      [newTotal, voucher.payment_order_id, newStatus]
    );

    const remaining = orderTotal - newTotal;
    const isComplete = remaining <= 0;
    // Si ya cubre el total, el sobrante se acredita AQUÍ. Antes solo se
    // devolvía en el JSON y el abono dependía de que el cliente diera un paso
    // más ("completar pago") que en la práctica no siempre ocurre, porque la
    // orden ya cambió de estado. El helper es idempotente.
    let surplus = 0;
    if (isComplete) {
      try {
        surplus = await acreditarSobranteOrden(pool, voucher.payment_order_id);
      } catch (e: any) {
        console.error('[VOUCHER] no se pudo acreditar el sobrante:', e.message);
        surplus = Math.abs(remaining);
      }
    }

    return res.json({
      success: true,
      voucher_id,
      declared_amount: amount,
      possible_duplicate: !!duplicadoDe,
      duplicate_warning: duplicadoDe
        ? 'Ya hay otro comprobante por este mismo monto en la orden. Si es el mismo pago, no lo subas de nuevo: quedará en revisión para que finanzas confirme si son dos pagos distintos.'
        : undefined,
      order: {
        total: orderTotal,
        accumulated: newTotal,
        remaining: Math.max(0, remaining),
        surplus,
        is_complete: isComplete,
        currency: voucher.currency || 'MXN',
      },
    });
  } catch (error: any) {
    console.error('[VOUCHER] Confirm error:', error);
    return res.status(500).json({ error: 'Error al confirmar monto' });
  }
};

/**
 * Acredita a la billetera de servicio el sobrante de una orden (lo pagado por
 * encima del monto). IDEMPOTENTE: recalcula el sobrante real desde los
 * comprobantes no rechazados y no hace nada si ya se acreditó.
 *
 * Existe porque el sobrante se acreditaba en dos lugares con reglas distintas y
 * se colaba por un tercero: confirmVoucherAmount adelanta la orden a
 * 'vouchers_submitted' cuando el monto cubre el total pero NO acreditaba nada
 * (solo devolvía el sobrante en el JSON), y completeVoucherPayment —el único
 * que sí acreditaba— quedaba fuera del camino. Resultado: el cliente pagaba de
 * más y no le aparecía saldo a favor. Además completeVoucherPayment no marcaba
 * surplus_credited, así que al aprobar el comprobante se podía acreditar dos
 * veces el mismo excedente.
 *
 * Devuelve el monto acreditado (0 si no había sobrante o ya estaba acreditado).
 */
export async function acreditarSobranteOrden(db: any, orderId: number, adminId?: number | null): Promise<number> {
  const oRes = await db.query(
    `SELECT id, user_id, amount, currency, service_type, payment_reference,
            COALESCE(surplus_credited, false) AS surplus_credited
       FROM pobox_payments WHERE id = $1`,
    [orderId]
  );
  const order = oRes.rows[0];
  if (!order || order.surplus_credited) return 0;

  // El sobrante se mide contra los comprobantes vivos, no contra voucher_total,
  // que puede quedar obsoleto si se eliminó un comprobante duplicado.
  const sumRes = await db.query(
    `SELECT COALESCE(SUM(declared_amount), 0) AS total
       FROM payment_vouchers WHERE payment_order_id = $1 AND status <> 'rejected'`,
    [orderId]
  );
  const surplus = +(Number(sumRes.rows[0].total) - Number(order.amount)).toFixed(2);
  if (!(surplus > 0)) return 0;

  // Servicio REAL de la orden. No se usa order.service_type a secas porque en
  // las órdenes viejas viene NULL: resolveOrderService lo deduce de la propia
  // orden, del asesor o del cobro, nunca de packages (ahí los ids colisionan).
  const servicioOrden = await resolveOrderService(db, {
    poboxPaymentId: orderId,
    paymentReference: order.payment_reference,
  });
  if (!servicioOrden) {
    console.error(
      `🚨 [VOUCHER] Sobrante de $${surplus.toFixed(2)} en la orden ${order.payment_reference} ` +
      `(user ${order.user_id}) NO acreditado: no se pudo determinar a qué servicio pertenece. Requiere revisión.`
    );
    return 0;
  }
  const serviceType = servicioOrden;

  // ── REGLA: si el cliente DEBE, el sobrante abona a la deuda ──
  // Y abona a la deuda DEL MISMO SERVICIO por el que se pagó la referencia,
  // no a cualquiera. Un cliente con crédito vivo que paga de más no genera
  // saldo a favor: está abonando. Decisión de Aldo.
  const CREDITO_POR_SERVICIO: Record<string, string> = {
    POBOX_USA: 'po_box',
    AA_DHL: 'dhl_liberacion',
    AIR_CHN_MX: 'aereo',
    TDI_EXPRESS: 'aereo',
    SEA_CHN_MX: 'maritimo',
  };
  const servicioCredito = CREDITO_POR_SERVICIO[servicioOrden] || null;
  const deudaRes = servicioCredito
    ? await db.query(
        `SELECT COALESCE(used_credit, 0)::numeric AS used_credit
           FROM user_service_credits
          WHERE user_id = $1 AND service = $2`,
        [order.user_id, servicioCredito]
      )
    : { rows: [] as any[] };
  const servicioDeuda = Number(deudaRes.rows[0]?.used_credit || 0) > 0 ? servicioCredito : null;
  const deudas = servicioDeuda
    ? [{ service: servicioDeuda, used_credit: String(deudaRes.rows[0].used_credit) }]
    : [];

  let abonadoADeuda = 0;
  if (servicioDeuda) {
    const deuda = Number(deudas.find((d) => d.service === servicioDeuda)?.used_credit || 0);
    abonadoADeuda = Math.min(surplus, deuda);
    await db.query(
      `UPDATE user_service_credits
          SET used_credit = GREATEST(0, COALESCE(used_credit, 0) - $1), updated_at = NOW()
        WHERE user_id = $2 AND service = $3`,
      [abonadoADeuda, order.user_id, servicioDeuda]
    );
    await db.query(
      `UPDATE users SET used_credit = GREATEST(0, COALESCE(used_credit, 0) - $1) WHERE id = $2`,
      [abonadoADeuda, order.user_id]
    );
    console.log(
      `[VOUCHER] Sobrante abonado a deuda: $${abonadoADeuda.toFixed(2)} al crédito ${servicioDeuda} ` +
      `de user ${order.user_id} (orden ${order.payment_reference})`
    );
  }

  const paraMonedero = +(surplus - abonadoADeuda).toFixed(2);
  if (!(paraMonedero > 0)) {
    // Todo el sobrante se fue a la deuda: no hay saldo a favor que crear.
    await db.query(
      `UPDATE pobox_payments SET surplus_amount = $1, surplus_credited = TRUE WHERE id = $2`,
      [surplus, orderId]
    );
    return surplus;
  }

  const walletRes = await db.query(
    `INSERT INTO billetera_servicio (user_id, service_type, saldo, currency)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, service_type) DO UPDATE SET
       saldo = billetera_servicio.saldo + $3, updated_at = NOW()
     RETURNING id`,
    [order.user_id, serviceType, paraMonedero, order.currency || 'MXN']
  );
  await db.query(
    `INSERT INTO billetera_servicio_transacciones
       (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id, created_by)
     VALUES ($1, $2, $3, 'excedente', $4, $5, $6, $7, $8)`,
    [walletRes.rows[0].id, order.user_id, serviceType, paraMonedero, order.currency || 'MXN',
     abonadoADeuda > 0
       ? `Excedente de pago orden ${order.payment_reference} (tras abonar $${abonadoADeuda.toFixed(2)} a la deuda)`
       : `Excedente de pago orden ${order.payment_reference}`,
     orderId, adminId ?? null]
  );
  await db.query(
    `UPDATE pobox_payments SET surplus_amount = $1, surplus_credited = TRUE WHERE id = $2`,
    [surplus, orderId]
  );
  console.log(`[VOUCHER] Saldo a favor acreditado: $${surplus.toFixed(2)} orden ${order.payment_reference} (user ${order.user_id})`);
  return surplus;
}

/**
 * POST /api/payment/voucher/complete
 * Client finalizes payment — marks order as vouchers_submitted
 * If surplus exists, credits service wallet
 * Body: { payment_order_id }
 */
export const completeVoucherPayment = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { payment_order_id } = req.body;
    if (!payment_order_id) return res.status(400).json({ error: 'Falta payment_order_id' });

    await client.query('BEGIN');

    // Get order with lock
    const orderRes = await client.query(
      `SELECT * FROM pobox_payments WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [payment_order_id, userId]
    );
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Orden no encontrada' });
    }
    const order = orderRes.rows[0];

    if (order.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Esta orden ya fue completada' });
    }

    // Check all vouchers are confirmed (not pending_confirm)
    const pendingConfirm = await client.query(
      `SELECT COUNT(*) FROM payment_vouchers WHERE payment_order_id = $1 AND status = 'pending_confirm'`,
      [payment_order_id]
    );
    if (parseInt(pendingConfirm.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Aún hay comprobantes sin confirmar monto' });
    }

    const accumulated = Number(order.voucher_total || 0);
    const total = Number(order.amount);

    if (accumulated < total) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'El monto acumulado no cubre el total',
        accumulated,
        total,
        remaining: total - accumulated,
      });
    }

    // Calculate surplus
    const surplus = accumulated - total;

    // Update order status
    await client.query(
      `UPDATE pobox_payments
       SET status = 'vouchers_submitted', surplus_amount = $1
       WHERE id = $2`,
      [surplus, payment_order_id]
    );

    // Acreditación por el helper idempotente: antes este bloque abonaba sin
    // marcar surplus_credited, así que al aprobar el comprobante después se
    // abonaba el MISMO excedente por segunda vez.
    const acreditado = await acreditarSobranteOrden(client, payment_order_id);
    const walletCredited = acreditado > 0;

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: surplus > 0
        ? `¡Pago completado! Se abonaron $${surplus.toFixed(2)} como saldo a favor.`
        : '¡Pago completado! Pendiente de conciliación por el equipo de finanzas.',
      order: {
        id: payment_order_id,
        status: 'vouchers_submitted',
        total,
        accumulated,
        surplus,
        wallet_credited: walletCredited,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[VOUCHER] Complete error:', error);
    return res.status(500).json({ error: 'Error al completar pago', details: error?.message });
  } finally {
    client.release();
  }
};

/**
 * GET /api/payment/voucher/:orderId
 * Get all vouchers for a payment order (client view)
 */
export const getOrderVouchers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { orderId } = req.params;

    const result = await pool.query(
      `SELECT v.id, v.file_url, v.file_key, v.file_type, v.detected_amount, v.declared_amount,
              v.currency, v.status, v.ocr_confidence, v.created_at,
              v.rejection_reason
       FROM payment_vouchers v
       WHERE v.payment_order_id = $1 AND v.user_id = $2
       ORDER BY v.created_at ASC`,
      [orderId, userId]
    );

    // Get order summary
    const orderRes = await pool.query(
      `SELECT amount, currency, voucher_total, voucher_count, surplus_amount, status
       FROM pobox_payments WHERE id = $1 AND user_id = $2`,
      [orderId, userId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }
    const order = orderRes.rows[0];

    // Generate signed URLs for each voucher
    const vouchersWithSignedUrls = await Promise.all(
      result.rows.map(async (v: any) => {
        if (v.file_key) {
          try {
            v.file_url = await getSignedUrlForKey(v.file_key, 3600);
          } catch (e) { /* keep original */ }
        }
        return v;
      })
    );

    return res.json({
      vouchers: vouchersWithSignedUrls,
      order: {
        total: Number(order.amount),
        accumulated: Number(order.voucher_total || 0),
        remaining: Math.max(0, Number(order.amount) - Number(order.voucher_total || 0)),
        voucher_count: order.voucher_count || 0,
        surplus: Number(order.surplus_amount || 0),
        status: order.status,
        currency: order.currency || 'MXN',
      },
    });
  } catch (error: any) {
    console.error('[VOUCHER] Get vouchers error:', error);
    return res.status(500).json({ error: 'Error al obtener comprobantes' });
  }
};

/**
 * DELETE /api/payment/voucher/:voucherId
 * Client deletes a voucher that hasn't been reviewed yet
 */
export const deleteVoucher = async (req: AuthRequest, res: Response) => {
  const dbClient = await pool.connect();
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { voucherId } = req.params;

    await dbClient.query('BEGIN');

    const voucherRes = await dbClient.query(
      `SELECT v.*, p.voucher_total, p.voucher_count FROM payment_vouchers v
       JOIN pobox_payments p ON p.id = v.payment_order_id
       WHERE v.id = $1 AND v.user_id = $2 FOR UPDATE`,
      [voucherId, userId]
    );
    if (voucherRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }
    const voucher = voucherRes.rows[0];
    if (voucher.status === 'approved') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'No se puede eliminar un comprobante aprobado' });
    }

    // Subtract from order totals if it was confirmed
    if (voucher.status === 'pending_review') {
      await dbClient.query(
        `UPDATE pobox_payments SET 
         voucher_total = GREATEST(0, COALESCE(voucher_total, 0) - $1),
         voucher_count = GREATEST(0, COALESCE(voucher_count, 0) - 1)
         WHERE id = $2`,
        [voucher.declared_amount, voucher.payment_order_id]
      );
    }

    await dbClient.query('DELETE FROM payment_vouchers WHERE id = $1', [voucherId]);

    await dbClient.query('COMMIT');
    return res.json({ success: true, message: 'Comprobante eliminado' });
  } catch (error: any) {
    await dbClient.query('ROLLBACK');
    console.error('[VOUCHER] Delete error:', error);
    return res.status(500).json({ error: 'Error al eliminar comprobante' });
  } finally {
    dbClient.release();
  }
};

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

/**
 * GET /api/admin/vouchers/pending
 * List all vouchers pending review (for conciliation panel)
 */
export const getAdminPendingVouchers = async (req: AuthRequest, res: Response) => {
  try {
    const { service_type, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = `v.status = 'pending_review'`;
    const params: any[] = [Number(limit), offset];

    if (service_type) {
      whereClause += ` AND v.service_type = $3`;
      params.push(service_type);
    }

    const result = await pool.query(
      `SELECT v.*, 
              -- Las columnas se llaman full_name y box_id: con u.name / u.pobox_code
              -- esta consulta tronaba y el endpoint devolvia 500, asi que la cola
              -- de comprobantes por revisar era INVISIBLE. Ver getAdminOrderVouchers,
              -- que si usaba los nombres correctos.
              u.full_name as user_name, u.email as user_email, u.box_id as pobox_code,
              p.payment_reference, p.amount as order_amount, p.currency as order_currency,
              p.voucher_total, p.voucher_count, p.status as order_status
       FROM payment_vouchers v
       JOIN users u ON u.id = v.user_id
       JOIN pobox_payments p ON p.id = v.payment_order_id
       WHERE ${whereClause}
       ORDER BY v.created_at ASC
       LIMIT $1 OFFSET $2`,
      params
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM payment_vouchers v WHERE ${whereClause.replace('$3', `'${service_type}'`)}`,
    );

    return res.json({
      vouchers: result.rows,
      total: parseInt(countRes.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error: any) {
    console.error('[VOUCHER-ADMIN] Pending list error:', error);
    return res.status(500).json({ error: 'Error al obtener comprobantes pendientes' });
  }
};

/**
 * GET /api/admin/vouchers/order/:orderId
 * Get all vouchers for a specific order (admin view with full details)
 */
export const getAdminOrderVouchers = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;

    const vouchers = await pool.query(
      `SELECT v.*, v.file_key, u.full_name as user_name, u.email as user_email
       FROM payment_vouchers v
       JOIN users u ON u.id = v.user_id
       WHERE v.payment_order_id = $1
       ORDER BY v.created_at ASC`,
      [orderId]
    );

    const order = await pool.query(
      `SELECT p.*, u.full_name as user_name, u.email as user_email, u.box_id as pobox_code
       FROM pobox_payments p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [orderId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    // Generate signed URLs for voucher images
    const vouchersWithUrls = await Promise.all(
      vouchers.rows.map(async (v: any) => {
        if (v.file_key) {
          try {
            v.file_url = await getSignedUrlForKey(v.file_key);
          } catch (e) { /* keep original url */ }
        }
        return v;
      })
    );

    return res.json({
      order: order.rows[0],
      vouchers: vouchersWithUrls,
    });
  } catch (error: any) {
    console.error('[VOUCHER-ADMIN] Order vouchers error:', error);
    return res.status(500).json({ error: 'Error al obtener detalles' });
  }
};

/**
 * POST /api/admin/voucher/approve/:id
 * Admin approves a voucher after bank conciliation
 */
/**
 * Avisos al confirmar un pago. Antes no salía nada: el cliente se enteraba
 * entrando al panel, y el asesor ni eso.
 *
 * · Pago cubierto  → WhatsApp + push al cliente, push al asesor
 * · Pago parcial   → push a los dos, y WhatsApp al cliente con el faltante y
 *                    cómo cubrirlo
 *
 * Nada de esto bloquea la aprobación: si un envío falla se registra y sigue.
 */
const avisarPagoConfirmado = async (
  orderId: number,
  opts: { parcial: boolean; total: number; abonado: number; faltante: number }
): Promise<void> => {
  try {
    const r = await pool.query(
      `SELECT pp.payment_reference, pp.user_id, u.full_name, u.box_id,
              COALESCE(u.advisor_id, u.referred_by_id) AS asesor_id
         FROM pobox_payments pp JOIN users u ON u.id = pp.user_id
        WHERE pp.id = $1`, [orderId]);
    const o = r.rows[0];
    if (!o) return;

    const money = (v: number) =>
      `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const ref = o.payment_reference;

    const tituloCliente = opts.parcial ? '⚠️ Tu pago quedó incompleto' : '✅ Pago confirmado';
    const textoCliente = opts.parcial
      ? `Recibimos ${money(opts.abonado)} de ${money(opts.total)} en la orden ${ref}. Faltan ${money(opts.faltante)} para liberar tu mercancía: súbelos como un nuevo comprobante en la MISMA orden.`
      : `Tu pago de ${money(opts.total)} en la orden ${ref} quedó confirmado.`;

    const { createCustomNotification } = require('./notificationController');
    const { sendPushToUsers } = await import('./pushService');

    // Cliente: in-app + push
    await createCustomNotification(o.user_id, tituloCliente, textoCliente, opts.parcial ? 'warning' : 'success',
      'cash', { payment_reference: ref, remaining: opts.faltante }, '/dashboard').catch(() => {});

    // Asesor: solo push/in-app, sin WhatsApp
    if (o.asesor_id) {
      await createCustomNotification(
        o.asesor_id,
        opts.parcial ? '⚠️ Pago parcial de tu cliente' : '✅ Pago confirmado de tu cliente',
        opts.parcial
          ? `${o.box_id} ${o.full_name}: la orden ${ref} quedó incompleta. Faltan ${money(opts.faltante)}.`
          : `${o.box_id} ${o.full_name} liquidó la orden ${ref} por ${money(opts.total)}.`,
        opts.parcial ? 'warning' : 'success', 'cash',
        { payment_reference: ref, remaining: opts.faltante }, '/dashboard'
      ).catch(() => {});
    }

    const destinos = [Number(o.user_id), ...(o.asesor_id ? [Number(o.asesor_id)] : [])];
    await sendPushToUsers(destinos, {
      title: tituloCliente,
      body: textoCliente,
      data: { screen: 'Payments', payment_reference: String(ref), remaining: String(opts.faltante) },
      notificationType: 'payment',
    }).catch(() => {});

    // WhatsApp SOLO al cliente.
    const { sendPagoConfirmado, sendPagoParcial, telefonoParaWhatsApp } = await import('./whatsappService');
    const wa = await telefonoParaWhatsApp(Number(o.user_id));
    if (wa) {
      if (opts.parcial) {
        await sendPagoParcial(wa.phone, wa.nombre, ref, money(opts.abonado), money(opts.total), money(opts.faltante));
      } else {
        await sendPagoConfirmado(wa.phone, wa.nombre, ref, money(opts.total));
      }
    }
  } catch (e: any) {
    console.error('[VOUCHER] no se pudieron enviar los avisos de pago:', e?.message);
  }
};

export const approveVoucher = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user?.userId;
    const { id } = req.params;
    // El admin puede aprobar un posible duplicado si verificó en el banco que
    // sí son dos pagos distintos; tiene que decirlo explícitamente.
    const confirmarDuplicado = req.body?.confirm_duplicate === true || req.body?.confirm_duplicate === 'true';

    // 🔁 Freno al duplicado: aprobarlo suma el mismo pago dos veces al total de
    // la orden y acredita saldo a favor que nunca entró al banco.
    const dupCheck = await pool.query(
      `SELECT v.duplicate_of_voucher_id, v.declared_amount, o.payment_reference
         FROM payment_vouchers v
         JOIN pobox_payments o ON o.id = v.payment_order_id
        WHERE v.id = $1`,
      [id]
    );
    const dup = dupCheck.rows[0];
    if (dup?.duplicate_of_voucher_id && !confirmarDuplicado) {
      return res.status(409).json({
        error: 'Posible comprobante duplicado',
        message: `Este comprobante repite el monto $${Number(dup.declared_amount).toFixed(2)} del comprobante #${dup.duplicate_of_voucher_id} en la orden ${dup.payment_reference}. ` +
          `Suele pasar cuando el cliente sube su comprobante y el asesor sube el mismo. Verifica en el estado de cuenta si son DOS pagos distintos: ` +
          `si es el mismo, recházalo; si de verdad son dos, vuelve a aprobar confirmando el duplicado.`,
        duplicate_of_voucher_id: dup.duplicate_of_voucher_id,
        requires_confirmation: true,
      });
    }

    const result = await pool.query(
      `UPDATE payment_vouchers 
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2 AND status = 'pending_review'
       RETURNING *`,
      [adminId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comprobante no encontrado o ya revisado' });
    }

    // Check if ALL vouchers for this order are approved
    const voucher = result.rows[0];
    const allVouchers = await pool.query(
      `SELECT status FROM payment_vouchers WHERE payment_order_id = $1`,
      [voucher.payment_order_id]
    );
    const allApproved = allVouchers.rows.every((v: any) => v.status === 'approved');

    // 🔒 Aprobar los comprobantes NO significa que la orden esté cubierta: el
    // cliente puede subir un comprobante por menos del total (pago parcial, o
    // el pago de una sola caja de un envío multipieza). Antes bastaba con que
    // todos estuvieran aprobados para marcar la orden pagada, así que un
    // depósito de $1,796 liquidaba una orden de $35,211 y dejaba las guías
    // como pagadas. Se exige que la suma aprobada cubra el monto.
    const cubiertoRes = await pool.query(
      `SELECT COALESCE(SUM(v.declared_amount), 0) AS aprobado, p.amount AS total
         FROM pobox_payments p
         LEFT JOIN payment_vouchers v
           ON v.payment_order_id = p.id AND v.status = 'approved'
        WHERE p.id = $1
        GROUP BY p.amount`,
      [voucher.payment_order_id]
    );
    const totalAprobado = Number(cubiertoRes.rows[0]?.aprobado || 0);
    const totalOrden = Number(cubiertoRes.rows[0]?.total || 0);
    // Tolerancia por redondeo de centavos al capturar el depósito.
    const TOLERANCIA_MXN = 5;
    const cubierta = totalAprobado >= totalOrden - TOLERANCIA_MXN;

    if (allApproved && !cubierta) {
      const faltante = +(totalOrden - totalAprobado).toFixed(2);
      console.warn(
        `[VOUCHER] Orden ${voucher.payment_order_id}: comprobantes aprobados por $${totalAprobado.toFixed(2)} ` +
        `de $${totalOrden.toFixed(2)} — PAGO PARCIAL, la orden NO se marca pagada. Faltan $${faltante.toFixed(2)}.`
      );
      await avisarPagoConfirmado(voucher.payment_order_id, {
        parcial: true, total: totalOrden, abonado: totalAprobado, faltante,
      });
      return res.json({
        success: true,
        voucher_id: voucher.id,
        order_completed: false,
        partial_payment: true,
        approved_total: totalAprobado,
        order_total: totalOrden,
        remaining: faltante,
        message: `Comprobante aprobado. La orden sigue PENDIENTE: van $${totalAprobado.toFixed(2)} de $${totalOrden.toFixed(2)}, faltan $${faltante.toFixed(2)}.`,
      });
    }

    if (allApproved) {
      // Mark order as completed
      await pool.query(
        `UPDATE pobox_payments SET status = 'completed', paid_at = NOW() WHERE id = $1`,
        [voucher.payment_order_id]
      );

      // Mark packages as paid
      const orderRes = await pool.query(
        `SELECT package_ids, payment_reference FROM pobox_payments WHERE id = $1`,
        [voucher.payment_order_id]
      );
      const rawPkgIds = orderRes.rows[0]?.package_ids;
      const packageIds: number[] = (typeof rawPkgIds === 'string' ? JSON.parse(rawPkgIds) : (rawPkgIds || []))
        .map((n: any) => Number(String(n).replace(/^[A-Za-z]+-/, '')))
        .filter((n: number) => Number.isFinite(n));
      // 🔧 COLISIÓN DE ID: en órdenes DHL, package_ids apunta a dhl_shipments
      // (no a usa_pobox_packages/packages). Marcar la tabla equivocada dejaba la
      // guía DHL SIN pagar. El service_type autoritativo vive en openpay_webhook_logs.
      let isDhlOrder = false;
      try {
        const svc = await pool.query(
          `SELECT service_type FROM openpay_webhook_logs
            WHERE transaction_id = $1 AND service_type IS NOT NULL
            ORDER BY id DESC LIMIT 1`,
          [orderRes.rows[0]?.payment_reference]
        );
        isDhlOrder = String(svc.rows[0]?.service_type || '').toUpperCase() === 'AA_DHL';
      } catch { /* ignore */ }
      if (packageIds.length > 0 && isDhlOrder) {
        await markDhlGroupPaid(pool, packageIds, { onlyUnpaid: true });
      } else if (packageIds.length > 0) {
        await pool.query(
          `UPDATE usa_pobox_packages SET payment_status = 'paid', costing_paid = TRUE, costing_paid_at = NOW()
           WHERE id = ANY($1::int[])`,
          [packageIds]
        );
      }

      // Credit surplus to wallet if not already credited
      const order = await pool.query(
        `SELECT * FROM pobox_payments WHERE id = $1`, [voucher.payment_order_id]
      );
      const o = order.rows[0];
      // El sobrante se acredita con el helper idempotente: recalcula desde los
      // comprobantes vivos y no vuelve a abonar si ya se acreditó al confirmar
      // el monto o al completar el pago.
      await acreditarSobranteOrden(pool, voucher.payment_order_id, adminId);

      // 💳 Orden a CRÉDITO: al aprobar todos los comprobantes, liquidar el crédito
      // (pasa a Historial) y RESTAURAR el crédito del cliente. El crédito vive en
      // user_service_credits (por servicio); si no hay fila, cae al global.
      if (String(o.payment_method || '').toLowerCase() === 'credit') {
        await pool.query(
          `UPDATE pobox_payments SET credit_settled = TRUE, credit_settled_at = NOW() WHERE id = $1`,
          [voucher.payment_order_id]
        );
        const montoCredito = Number(o.amount) || 0;
        let pkgIdsCredit: number[] = [];
        try {
          const raw = typeof o.package_ids === 'string' ? JSON.parse(o.package_ids) : o.package_ids;
          pkgIdsCredit = (Array.isArray(raw) ? raw : []).map((n: any) => Number(n)).filter(Boolean);
        } catch { pkgIdsCredit = []; }
        // El servicio autoritativo ya se resolvió arriba (isDhlOrder). Para DHL,
        // derivar desde packages daría un servicio AÉREO por la colisión de id.
        const svcKeyCredit = isDhlOrder
          ? 'dhl_liberacion'
          : await resolveCreditService(pool, {
              poboxPaymentId: o.id,
              paymentReference: o.payment_reference,
              packageIds: pkgIdsCredit,
            });
        await restoreServiceCredit(pool, {
          userId: o.user_id,
          amount: montoCredito,
          service: svcKeyCredit,
          orderRef: o.payment_reference || o.id,
        });
        // 💸 Liberar comisiones retenidas de estas guías (el crédito ya se pagó).
        if (pkgIdsCredit.length > 0) {
          await pool.query(
            `UPDATE advisor_commissions
                SET awaiting_client_payment = FALSE, client_paid_at = NOW(), updated_at = NOW()
              WHERE shipment_type = 'PKG' AND shipment_id = ANY($1)
                AND COALESCE(awaiting_client_payment, FALSE) = TRUE`,
            [pkgIdsCredit]
          );
        }
      }

      // 🧾 Factura SOLO si el cliente la solicitó (requiere_factura). Para crédito
      // se factura hasta que se paga con dinero, nunca antes. La función interna
      // valida requiere_factura/facturada, así que es seguro llamarla siempre.
      generateInvoiceForPoboxPaymentByRef(String(o.payment_reference || '')).catch((e: any) =>
        console.error('[approveVoucher] factura:', e?.message || e)
      );
    }

    // Pago cubierto: WhatsApp + push al cliente, push al asesor.
    if (allApproved) {
      await avisarPagoConfirmado(voucher.payment_order_id, {
        parcial: false, total: totalOrden, abonado: totalAprobado, faltante: 0,
      });
    }

    return res.json({
      success: true,
      voucher: result.rows[0],
      all_approved: allApproved,
      order_completed: allApproved,
    });
  } catch (error: any) {
    console.error('[VOUCHER-ADMIN] Approve error:', error);
    return res.status(500).json({ error: 'Error al aprobar comprobante' });
  }
};

/**
 * POST /api/admin/voucher/reject/:id
 * Admin rejects a voucher (fake receipt, wrong amount, etc.)
 * Body: { reason }
 */
export const rejectVoucher = async (req: AuthRequest, res: Response) => {
  const dbClient = await pool.connect();
  try {
    const adminId = req.user?.userId;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ error: 'Debe proporcionar un motivo de rechazo' });

    await dbClient.query('BEGIN');

    const result = await dbClient.query(
      `UPDATE payment_vouchers 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
       WHERE id = $3 AND status = 'pending_review'
       RETURNING *`,
      [adminId, reason, id]
    );

    if (result.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Comprobante no encontrado o ya revisado' });
    }

    const voucher = result.rows[0];

    // Subtract rejected amount from order totals
    await dbClient.query(
      `UPDATE pobox_payments SET 
       voucher_total = GREATEST(0, COALESCE(voucher_total, 0) - $1),
       voucher_count = GREATEST(0, COALESCE(voucher_count, 0) - 1)
       WHERE id = $2`,
      [voucher.declared_amount, voucher.payment_order_id]
    );

    // Revert surplus if it was credited
    const orderRes = await dbClient.query(
      `SELECT * FROM pobox_payments WHERE id = $1`, [voucher.payment_order_id]
    );
    const order = orderRes.rows[0];
    if (order.surplus_credited && Number(order.surplus_amount) > 0) {
      const serviceType = order.service_type || 'POBOX_USA';
      // Debit from wallet
      await dbClient.query(
        `UPDATE billetera_servicio SET saldo = GREATEST(0, saldo - $1), updated_at = NOW()
         WHERE user_id = $2 AND service_type = $3`,
        [Number(order.surplus_amount), order.user_id, serviceType]
      );
      // Log reversal
      const walletRes = await dbClient.query(
        `SELECT id FROM billetera_servicio WHERE user_id = $1 AND service_type = $2`,
        [order.user_id, serviceType]
      );
      if (walletRes.rows.length > 0) {
        await dbClient.query(
          `INSERT INTO billetera_servicio_transacciones 
           (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id, created_by)
           VALUES ($1, $2, $3, 'egreso', $4, $5, $6, $7, $8)`,
          [walletRes.rows[0].id, order.user_id, serviceType, Number(order.surplus_amount), order.currency || 'MXN',
           `Reversión por rechazo de comprobante en orden ${order.payment_reference}`, voucher.payment_order_id, adminId]
        );
      }
      await dbClient.query(
        `UPDATE pobox_payments SET surplus_credited = FALSE, surplus_amount = 0, status = 'vouchers_submitted' WHERE id = $1`,
        [voucher.payment_order_id]
      );
    }

    // Check if order should go back to pending
    const remainingVouchers = await dbClient.query(
      `SELECT COUNT(*) FROM payment_vouchers 
       WHERE payment_order_id = $1 AND status IN ('pending_review', 'approved')`,
      [voucher.payment_order_id]
    );
    if (parseInt(remainingVouchers.rows[0].count) === 0) {
      await dbClient.query(
        `UPDATE pobox_payments SET status = 'pending_payment' WHERE id = $1`,
        [voucher.payment_order_id]
      );
    }

    await dbClient.query('COMMIT');

    return res.json({
      success: true,
      voucher: result.rows[0],
      message: 'Comprobante rechazado',
    });
  } catch (error: any) {
    await dbClient.query('ROLLBACK');
    console.error('[VOUCHER-ADMIN] Reject error:', error);
    return res.status(500).json({ error: 'Error al rechazar comprobante' });
  } finally {
    dbClient.release();
  }
};

/**
 * GET /api/admin/vouchers/stats
 * Get summary stats for conciliation dashboard
 */
export const getVoucherStats = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending_review') as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COALESCE(SUM(declared_amount) FILTER (WHERE status = 'pending_review'), 0) as pending_amount,
        COALESCE(SUM(declared_amount) FILTER (WHERE status = 'approved'), 0) as approved_amount,
        COUNT(DISTINCT payment_order_id) FILTER (WHERE status = 'pending_review') as orders_pending
      FROM payment_vouchers
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);

    return res.json(result.rows[0]);
  } catch (error: any) {
    console.error('[VOUCHER-ADMIN] Stats error:', error);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

/**
 * GET /api/payment/wallet/service
 * Get service wallet balances for the current user
 */
export const getServiceWalletBalances = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const result = await pool.query(
      `SELECT service_type, saldo, currency, updated_at
       FROM billetera_servicio WHERE user_id = $1 ORDER BY service_type`,
      [userId]
    );

    return res.json({ wallets: result.rows });
  } catch (error: any) {
    console.error('[WALLET] Service balances error:', error);
    return res.status(500).json({ error: 'Error al obtener saldos' });
  }
};
