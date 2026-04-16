/**
 * Payment Voucher Controller
 * Handles uploading, confirming, and managing payment receipts (comprobantes de pago)
 * Supports OCR extraction via Google Cloud Vision API
 */

import { Request, Response } from 'express';
import { pool } from './db';
import { uploadToS3 } from './s3Service';
import { extractAmountFromReceipt, isOcrAvailable } from './ocrService';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role?: string; level?: number };
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
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No se envió archivo' });

    const { payment_order_id, service_type, payment_reference } = req.body;
    if (!payment_order_id || !service_type) {
      return res.status(400).json({ error: 'Faltan campos requeridos: payment_order_id, service_type' });
    }

    // Validate the payment order belongs to the user and is still pending
    const orderCheck = await pool.query(
      `SELECT id, user_id, amount, currency, status, voucher_total, payment_reference
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
    if (order.status === 'completed') {
      return res.status(400).json({ error: 'Esta orden ya fue pagada' });
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

    // Calculate remaining
    const remaining = Number(order.amount) - Number(order.voucher_total || 0);

    return res.json({
      success: true,
      voucher: {
        id: voucher.id,
        file_url: fileUrl,
        file_type: fileType,
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
    const userId = req.user?.id;
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

    // Update voucher with confirmed amount
    await pool.query(
      `UPDATE payment_vouchers SET declared_amount = $1, status = 'pending_review', updated_at = NOW()
       WHERE id = $2`,
      [amount, voucher_id]
    );

    // Update order accumulated total
    const newTotal = Number(voucher.voucher_total || 0) + amount;
    await pool.query(
      `UPDATE pobox_payments 
       SET voucher_total = $1, voucher_count = COALESCE(voucher_count, 0) + 1,
           status = CASE WHEN status = 'pending_payment' THEN 'vouchers_submitted' ELSE status END
       WHERE id = $2`,
      [newTotal, voucher.payment_order_id]
    );

    const orderTotal = Number(voucher.order_amount);
    const remaining = orderTotal - newTotal;
    const isComplete = remaining <= 0;
    const surplus = isComplete ? Math.abs(remaining) : 0;

    return res.json({
      success: true,
      voucher_id,
      declared_amount: amount,
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
 * POST /api/payment/voucher/complete
 * Client finalizes payment — marks order as vouchers_submitted
 * If surplus exists, credits service wallet
 * Body: { payment_order_id }
 */
export const completeVoucherPayment = async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
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
       SET status = 'vouchers_submitted', surplus_amount = $1, updated_at = NOW()
       WHERE id = $2`,
      [surplus, payment_order_id]
    );

    // If surplus, credit to service wallet
    let walletCredited = false;
    if (surplus > 0) {
      // Get or create service wallet
      const serviceType = order.service_type || 'POBOX_USA';
      const walletRes = await client.query(
        `INSERT INTO billetera_servicio (user_id, service_type, saldo, currency)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, service_type) DO UPDATE SET 
           saldo = billetera_servicio.saldo + $3, updated_at = NOW()
         RETURNING *`,
        [userId, serviceType, surplus, order.currency || 'MXN']
      );

      // Log transaction
      await client.query(
        `INSERT INTO billetera_servicio_transacciones 
         (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id)
         VALUES ($1, $2, $3, 'excedente', $4, $5, $6, $7)`,
        [
          walletRes.rows[0].id, userId, serviceType, surplus, order.currency || 'MXN',
          `Excedente de pago orden ${order.payment_reference}`,
          payment_order_id,
        ]
      );
      walletCredited = true;
    }

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
    return res.status(500).json({ error: 'Error al completar pago' });
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
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });

    const { orderId } = req.params;

    const result = await pool.query(
      `SELECT v.id, v.file_url, v.file_type, v.detected_amount, v.declared_amount,
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

    return res.json({
      vouchers: result.rows,
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
    const userId = req.user?.id;
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
              u.name as user_name, u.email as user_email, u.pobox_code,
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
      `SELECT v.*, u.name as user_name, u.email as user_email
       FROM payment_vouchers v
       JOIN users u ON u.id = v.user_id
       WHERE v.payment_order_id = $1
       ORDER BY v.created_at ASC`,
      [orderId]
    );

    const order = await pool.query(
      `SELECT p.*, u.name as user_name, u.email as user_email, u.pobox_code
       FROM pobox_payments p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [orderId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    return res.json({
      order: order.rows[0],
      vouchers: vouchers.rows,
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
export const approveVoucher = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user?.id;
    const { id } = req.params;

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

    if (allApproved) {
      // Mark order as completed
      await pool.query(
        `UPDATE pobox_payments SET status = 'completed', paid_at = NOW() WHERE id = $1`,
        [voucher.payment_order_id]
      );

      // Mark packages as paid
      const orderRes = await pool.query(
        `SELECT package_ids FROM pobox_payments WHERE id = $1`,
        [voucher.payment_order_id]
      );
      const packageIds = orderRes.rows[0]?.package_ids || [];
      if (packageIds.length > 0) {
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
      if (Number(o.surplus_amount) > 0 && !o.surplus_credited) {
        const serviceType = o.service_type || 'POBOX_USA';
        const walletRes = await pool.query(
          `INSERT INTO billetera_servicio (user_id, service_type, saldo, currency)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, service_type) DO UPDATE SET saldo = billetera_servicio.saldo + $3, updated_at = NOW()
           RETURNING *`,
          [o.user_id, serviceType, Number(o.surplus_amount), o.currency || 'MXN']
        );
        await pool.query(
          `INSERT INTO billetera_servicio_transacciones 
           (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id, created_by)
           VALUES ($1, $2, $3, 'excedente', $4, $5, $6, $7, $8)`,
          [walletRes.rows[0].id, o.user_id, serviceType, Number(o.surplus_amount), o.currency || 'MXN',
           `Excedente aprobado de orden ${o.payment_reference}`, voucher.payment_order_id, adminId]
        );
        await pool.query(
          `UPDATE pobox_payments SET surplus_credited = TRUE WHERE id = $1`,
          [voucher.payment_order_id]
        );
      }
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
    const adminId = req.user?.id;
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
    const userId = req.user?.id;
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
