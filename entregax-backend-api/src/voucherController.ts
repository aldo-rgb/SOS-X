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
/**
 * SALIDA PARA UN COMPROBANTE QUE LLEGA A UNA ORDEN YA PAGADA
 *
 * Pasa seguido (18 casos hasta ahora): el cliente transfiere y sube el
 * comprobante contra una referencia que ya se cobró — a veces porque se
 * equivocó de orden, a veces porque pagó de más. Antes recibía "Esta orden ya
 * fue pagada" y ahí terminaba: el dinero ya salió de su cuenta y no hay a dónde
 * mandarlo, así que el comprobante se perdía o alguien lo forzaba a mano.
 *
 * Ahora el comprobante SIEMPRE se guarda:
 *   · Si el cliente tiene otras órdenes pendientes, se las devolvemos en la
 *     respuesta para que elija a cuál aplicarlo.
 *   · Y en cualquier caso queda una solicitud de saldo a favor con el archivo
 *     adjunto, para que finanzas lo apruebe y el dinero regrese al cliente como
 *     saldo. La tabla y el flujo de aprobación ya existen.
 */
async function rutaParaPagoSobrante(
  req: AuthRequest, res: Response,
  opts: { userId: number; order: any; file: any; service_type: string }
): Promise<any> {
  const { userId, order, file, service_type } = opts;
  const ref = order.payment_reference || `orden ${order.id}`;
  try {
    const cliente = (await pool.query(
      `SELECT full_name, box_id FROM users WHERE id = $1`, [userId])).rows[0] || {};

    // Otras órdenes suyas que sí esperan pago.
    const pendientes = (await pool.query(
      `SELECT pp.payment_reference, pp.amount, pp.currency, pp.created_at
         FROM pobox_payments pp
        WHERE pp.user_id = $1 AND pp.id <> $2
          AND pp.status IN ('pending', 'pending_payment', 'vouchers_partial')
          AND pp.paid_at IS NULL
        ORDER BY pp.created_at DESC LIMIT 10`, [userId, order.id])).rows;

    // El archivo se guarda pase lo que pase: es la prueba del depósito.
    let proofUrl: string | null = null;
    let proofKey: string | null = null;
    try {
      const ext = (String(file.originalname || '').split('.').pop() || 'jpg').toLowerCase();
      proofKey = `cs/saldo-a-favor/${userId}_${Date.now()}.${ext}`;
      proofUrl = await uploadToS3(file.buffer, proofKey, file.mimetype || 'application/octet-stream');
    } catch (e: any) {
      console.warn('[VOUCHER] no se pudo guardar el comprobante sobrante:', e?.message);
    }

    // Una sola solicitud por orden: si el cliente reintenta, no se duplica.
    const motivo = `Comprobante subido a la orden ${ref}, que ya estaba pagada. Revisar si corresponde a otra orden o si es saldo a favor.`;
    const yaHay = await pool.query(
      `SELECT id FROM saldo_a_favor_pendientes
        WHERE cliente_id = $1 AND estado = 'pendiente' AND motivo LIKE $2 LIMIT 1`,
      [userId, `%${ref}%`]);
    let solicitudId: number | null = yaHay.rows[0]?.id || null;
    if (!solicitudId) {
      const ins = await pool.query(
        `INSERT INTO saldo_a_favor_pendientes
           (cliente_id, cliente_nombre, monto, moneda, motivo, proof_file_url, proof_file_key, solicitado_por, solicitado_nombre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [userId, cliente.full_name || null, 0, order.currency || 'MXN', motivo,
         proofUrl, proofKey, userId, cliente.full_name || null]);
      solicitudId = ins.rows[0]?.id || null;
      console.log(`[VOUCHER] ${ref} ya pagada · comprobante de ${cliente.box_id || userId} guardado como solicitud de saldo a favor #${solicitudId}`);
    }

    // Avisar a quien puede resolverlo.
    try {
      const { createCustomNotification } = await import('./notificationController');
      const admins = await pool.query(
        `SELECT id FROM users WHERE role IN ('super_admin','admin','director','accountant') AND COALESCE(is_active,true) = true`);
      for (const a of admins.rows) {
        await createCustomNotification(
          Number(a.id),
          '💸 Comprobante sobre una orden ya pagada',
          `${cliente.box_id || ''} ${cliente.full_name || ''} subió un comprobante a ${ref}, que ya estaba cobrada. Revísalo para aplicarlo a otra orden o dejarlo como saldo a favor.`,
          'payment', 'cash', { saldo_favor_id: solicitudId, payment_reference: ref }, '/cobranza');
      }
    } catch (e: any) { console.warn('[VOUCHER] aviso sobrante:', e?.message); }

    return res.status(409).json({
      error: 'orden_ya_pagada',
      message: pendientes.length > 0
        ? `La orden ${ref} ya está pagada, así que tu comprobante NO se perdió: lo guardamos y nuestro equipo lo revisará. Si el depósito era para otra de tus órdenes pendientes, elígela y vuelve a subirlo ahí.`
        : `La orden ${ref} ya está pagada. Guardamos tu comprobante y nuestro equipo lo revisará para abonarlo a tu saldo a favor.`,
      comprobante_guardado: true,
      solicitud_saldo_id: solicitudId,
      ordenes_pendientes: pendientes.map((p: any) => ({
        payment_reference: p.payment_reference,
        amount: Number(p.amount),
        currency: p.currency || 'MXN',
        created_at: p.created_at,
      })),
      service_type,
    });
  } catch (e: any) {
    console.error('[VOUCHER] rutaParaPagoSobrante:', e);
    return res.status(400).json({ error: 'Esta orden ya fue pagada' });
  }
}

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
      `SELECT pp.id, pp.user_id, pp.amount, pp.currency, pp.status, pp.voucher_total, pp.payment_reference,
              pp.payment_method, COALESCE(pp.credit_settled, false) AS credit_settled,
              pp.paid_at,
              EXISTS (SELECT 1 FROM openpay_webhook_logs o
                       WHERE o.transaction_id = pp.payment_reference
                         AND o.estatus_procesamiento = 'procesado') AS confirmada_en_sucursal
       FROM pobox_payments pp WHERE pp.id = $1`,
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
    // "Ya se pagó" no vive en un solo campo: al confirmar en sucursal se pone
    // paid_at y el log pasa a 'procesado', pero el status se queda en
    // 'vouchers_submitted'. Mirando solo el status se colaron 18 comprobantes
    // contra órdenes ya cobradas, que además ensuciaban la lista por aprobar.
    // Excepción: 'vouchers_partial' significa que lo depositado NO alcanza a
    // cubrir la orden, aunque ya se haya confirmado un primer abono. Ahí el
    // cliente TIENE que poder subir el comprobante que completa el pago.
    const cubiertaPorCompleto = order.status !== 'vouchers_partial';
    const yaPagada = order.status === 'completed'
      || (cubiertaPorCompleto && (!!order.paid_at || order.confirmada_en_sucursal === true));
    if (yaPagada && !isUnsettledCredit) {
      // No se rechaza a secas: el cliente ya transfirió y quedarse con un error
      // seco lo deja sin a dónde. Se le da salida al dinero.
      return await rutaParaPagoSobrante(req, res, { userId, order, file, service_type });
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
/**
 * @param sobranteExplicito Sobrante ya calculado por quien llama. Lo usan las
 *   rutas de conciliación bancaria, donde el excedente sale de lo que entró al
 *   banco y no de los comprobantes: esas órdenes pueden autorizarse sin ningún
 *   comprobante subido, y midiendo contra payment_vouchers daría cero y no se
 *   acreditaría nada.
 */
/**
 * Abona saldo a favor en la billetera del servicio.
 *
 * Es el mismo destino que usa el excedente de una orden (billetera_servicio +
 * su transacción), extraído para que otros caminos —como bajar el costo de una
 * guía al cambiarla a pick-up— acrediten el dinero en el MISMO lugar y no
 * aparezcan dos "saldos a favor" distintos según de dónde vino.
 */
export async function abonarBilleteraServicio(
  db: any,
  opts: { userId: number; serviceType: string; monto: number; currency?: string; concepto: string; createdBy?: number | null }
): Promise<number> {
  const monto = Math.round((Number(opts.monto) || 0) * 100) / 100;
  if (!(monto > 0) || !opts.userId || !opts.serviceType) return 0;
  const currency = opts.currency || 'MXN';
  const w = await db.query(
    `INSERT INTO billetera_servicio (user_id, service_type, saldo, currency)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, service_type) DO UPDATE SET
       saldo = billetera_servicio.saldo + $3, updated_at = NOW()
     RETURNING id`,
    [opts.userId, opts.serviceType, monto, currency]
  );
  await db.query(
    `INSERT INTO billetera_servicio_transacciones
       (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, created_by)
     VALUES ($1, $2, $3, 'excedente', $4, $5, $6, $7)`,
    [w.rows[0].id, opts.userId, opts.serviceType, monto, currency, opts.concepto, opts.createdBy ?? null]
  );
  console.log(`[SALDO A FAVOR] $${monto.toFixed(2)} ${currency} a user ${opts.userId} (${opts.serviceType}): ${opts.concepto}`);
  return monto;
}

export async function acreditarSobranteOrden(
  db: any,
  orderId: number,
  adminId?: number | null,
  sobranteExplicito?: number
): Promise<number> {
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
  const surplus = sobranteExplicito != null
    ? +Number(sobranteExplicito).toFixed(2)
    : +(Number(sumRes.rows[0].total) - Number(order.amount)).toFixed(2);
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
/**
 * LA GUARDA DE LA 377, en un solo lugar.
 *
 * `paid_at` y el log en 'procesado' significan DOS cosas distintas y el sistema
 * no las distinguia:
 *   1. "se cobro el dinero"  → la orden esta cerrada.
 *   2. "se solto la mercancia contra la linea de credito" → NO esta cobrada.
 *
 * La tarea 377 salio del caso 1: ordenes ya cobradas salian con boton
 * "Confirmar" y el modal decia "ya fue procesado" con el boton muerto. Se
 * arreglo excluyendo todo lo que tuviera paid_at o log 'procesado' — y eso se
 * llevo de paso el caso 2, que son las ordenes a credito que el cliente reabre
 * para liquidar. Resultado: 11 ordenes por ~$278,000 invisibles para el
 * contador durante semanas (TKT-2026-2439, tareas 472 y 479).
 *
 * El discriminador que faltaba: credito NO liquidado significa que el paid_at
 * viene de soltar mercancia, no de cobrar.
 *
 * Se usa como funcion y no como constante para que cada consulta pase su alias
 * de tabla; asi la regla vive una sola vez y no se puede escribir "casi igual"
 * en otro lado.
 */
export const ORDEN_YA_COBRADA = (alias = 'p') => `(
  (${alias}.paid_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM openpay_webhook_logs _l
                 WHERE _l.transaction_id = ${alias}.payment_reference
                   AND _l.estatus_procesamiento = 'procesado'))
  AND NOT (LOWER(COALESCE(${alias}.payment_method,'')) = 'credit'
           AND COALESCE(${alias}.credit_settled, false) = false)
)`;

export const getAdminPendingVouchers = async (req: AuthRequest, res: Response) => {
  try {
    const { service_type, page = 1, limit = 50, vista = 'pendientes' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // La cola mezclaba comprobantes de órdenes YA PAGADAS con los que sí
    // requieren revisión: 103 de 128 estaban sobre órdenes liquidadas por otra
    // vía —conciliación bancaria, efectivo, otro comprobante— y no había nada
    // que hacer con ellos. Ordenados del más viejo al más nuevo, esos quedaban
    // arriba para siempre y enterraban los 21 reales. La cola dejó de usarse
    // por acumulación, no por falta de tiempo.
    //
    // Por default se muestran solo los accionables. 'obsoletos' saca los otros
    // para poder cerrarlos, y 'todas' conserva el comportamiento anterior.
    const ORDEN_CERRADA = `(p.status = 'cancelled' OR ${ORDEN_YA_COBRADA('p')})`;
    let whereClause = `v.status = 'pending_review'`;
    if (vista === 'obsoletos') whereClause += ` AND ${ORDEN_CERRADA}`;
    else if (vista !== 'todas') whereClause += ` AND NOT ${ORDEN_CERRADA}`;

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

    // El conteo va con el MISMO join y los MISMOS parámetros que el listado.
    // Antes contaba sin unir a la orden —lo que ahora reventaría, porque el
    // filtro usa p.status— e interpolaba service_type directo en el SQL con un
    // .replace('$3'), que era una inyección esperando a alguien que escribiera
    // una comilla en la URL.
    const countParams: any[] = service_type ? [service_type] : [];
    const countWhere = whereClause.replace('$3', '$1');
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM payment_vouchers v
         JOIN pobox_payments p ON p.id = v.payment_order_id
        WHERE ${countWhere}`,
      countParams
    );

    // Cuántos quedaron fuera por estar sobre órdenes ya cerradas: sirve para
    // ofrecer la vista 'obsoletos' sin que el usuario tenga que adivinar.
    const obsoletosRes = await pool.query(
      `SELECT COUNT(*)::int n, COALESCE(SUM(v.declared_amount), 0)::numeric(12,2) monto
         FROM payment_vouchers v
         JOIN pobox_payments p ON p.id = v.payment_order_id
        WHERE v.status = 'pending_review' AND ${ORDEN_CERRADA}`
    ).catch(() => ({ rows: [{ n: 0, monto: 0 }] }));

    // La imagen vive en un bucket privado: sin firmar, la pantalla de
    // autorizacion muestra recuadros rotos y nadie puede verificar nada.
    // getOrderVouchers y getAdminOrderVouchers ya firmaban; esta lista no.
    const vouchersFirmados = await Promise.all(
      result.rows.map(async (v: any) => {
        if (v.file_key) {
          try { v.file_url = await getSignedUrlForKey(v.file_key); } catch { /* se deja la original */ }
        }
        return v;
      })
    );

    return res.json({
      vouchers: vouchersFirmados,
      total: parseInt(countRes.rows[0].count),
      page: Number(page),
      limit: Number(limit),
      vista,
      obsoletos: {
        count: Number(obsoletosRes.rows[0]?.n) || 0,
        amount: Number(obsoletosRes.rows[0]?.monto) || 0,
        nota: 'Comprobantes pendientes sobre órdenes ya pagadas o canceladas. No requieren acción; consúltalos con ?vista=obsoletos.',
      },
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
export const avisarPagoConfirmado = async (
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

    // Datos para depositar. No viven en la orden (bank_clabe viene NULL): salen
    // de la empresa emisora del servicio, igual que en el panel del asesor. Sin
    // esto el cliente sabía cuánto debe pero no a dónde mandarlo.
    let banco: { clabe?: string; nombre?: string; beneficiario?: string } = {};
    try {
      const svc = await resolveOrderService(pool, {
        poboxPaymentId: orderId,
        paymentReference: ref,
      });
      const b = await pool.query(
        `SELECT fe.bank_clabe, fe.bank_name, fe.business_name
           FROM service_company_config scc
           JOIN fiscal_emitters fe ON fe.id = scc.emitter_id
          WHERE scc.service_type = $1 AND scc.is_active = TRUE
          LIMIT 1`,
        [svc || 'POBOX_USA']
      );
      if (b.rows[0]) {
        banco = {
          clabe: b.rows[0].bank_clabe || undefined,
          nombre: b.rows[0].bank_name || undefined,
          beneficiario: b.rows[0].business_name || undefined,
        };
      }
    } catch { /* si no se resuelve, el aviso sale sin los datos bancarios */ }

    const instruccionDeposito = banco.clabe
      ? ` Deposita a ${banco.beneficiario || ''} · CLABE ${banco.clabe}${banco.nombre ? ` (${banco.nombre})` : ''} y usa la referencia ${ref}.`
      : ` Usa la referencia ${ref} al hacer el depósito.`;

    const tituloCliente = opts.parcial ? '⚠️ Tu pago quedó incompleto' : '✅ Pago confirmado';
    const textoCliente = opts.parcial
      ? `Recibimos ${money(opts.abonado)} de ${money(opts.total)} en la orden ${ref}. Faltan ${money(opts.faltante)} para liberar tu mercancía.${instruccionDeposito} Sube el comprobante en la MISMA orden ${ref}, no generes una nueva.`
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
        await sendPagoParcial(
          wa.phone, wa.nombre, ref,
          money(opts.abonado), money(opts.total), money(opts.faltante),
          banco.clabe || '', banco.beneficiario || ''
        );
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

    // 🔒 LIGAR EL COMPROBANTE AL MOVIMIENTO BANCARIO
    //
    // Aprobar un comprobante solo miraba la imagen. Un cliente que deposita sin
    // referencia podía mandar el MISMO comprobante en dos órdenes distintas y
    // las dos se aprobaban, porque nada registraba que ese depósito ya se había
    // ocupado. Ahora hay que decir cuál abono del estado de cuenta lo respalda,
    // y el ledger impide gastarlo dos veces.
    //
    // Solo el super admin puede aprobar sin ligarlo (queda anotado en el
    // comprobante), para no dejar trabada la operación cuando el movimiento
    // todavía no aparece en el estado de cuenta.
    const rolAdmin = String((req.user as any)?.role || '').toLowerCase();
    const esSuperAdmin = rolAdmin === 'super_admin';
    const bankEntryId = Number(req.body?.bank_entry_id) || null;
    const sinLigar = req.body?.aprobar_sin_ligar === true || req.body?.aprobar_sin_ligar === 'true';

    if (!bankEntryId && !(esSuperAdmin && sinLigar)) {
      return res.status(409).json({
        error: 'Falta ligar el movimiento bancario',
        message: esSuperAdmin
          ? 'Elige el abono del estado de cuenta que respalda este comprobante, o marca "aprobar sin ligar" para autorizarlo bajo tu responsabilidad.'
          : 'Elige el abono del estado de cuenta que respalda este comprobante. Si el depósito todavía no aparece en el estado de cuenta, solo un super admin puede aprobarlo sin ligarlo.',
        requires_bank_entry: true,
        puede_saltarse: esSuperAdmin,
      });
    }

    const client = await pool.connect();
    let result: any;
    try {
      await client.query('BEGIN');

      result = await client.query(
        `UPDATE payment_vouchers
         SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
         WHERE id = $2 AND status = 'pending_review'
         RETURNING *`,
        [adminId, id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Comprobante no encontrado o ya revisado' });
      }

      if (bankEntryId) {
        const { ensureLedgerSchema, aplicarAbono, AbonoAgotadoError } = await import('./bankEntryLedger');
        await ensureLedgerSchema();
        const v = result.rows[0];
        const adminNombre = (req.user as any)?.full_name || (req.user as any)?.email || 'Admin';
        try {
          await aplicarAbono(client, {
            bankEntryId,
            montoAplicado: Number(v.declared_amount) || 0,
            origen: 'comprobante_manual',
            paymentOrderId: v.payment_order_id,
            paymentReference: dup?.payment_reference || null,
            voucherId: Number(id),
            aplicadoPor: adminId ?? null,
            aplicadoPorNombre: adminNombre,
          });
        } catch (e: any) {
          await client.query('ROLLBACK');
          client.release();
          const agotado = e instanceof AbonoAgotadoError;
          return res.status(409).json({
            error: agotado ? 'Ese depósito ya fue usado' : 'No se pudo ligar el movimiento bancario',
            message: e?.message || 'El abono seleccionado no puede respaldar este comprobante.',
            abono_agotado: agotado,
          });
        }
      } else {
        // Sin respaldo bancario: se deja escrito quién lo autorizó así.
        const adminNombre = (req.user as any)?.full_name || (req.user as any)?.email || 'Admin';
        await client.query(
          `UPDATE payment_vouchers
              SET rejection_reason = COALESCE(rejection_reason, '') ||
                  '⚠️ Aprobado SIN ligar movimiento bancario (override de super admin: ' || $2 || ')'
            WHERE id = $1`,
          [id, adminNombre]
        );
      }

      await client.query('COMMIT');
    } catch (e: any) {
      await client.query('ROLLBACK');
      client.release();
      console.error('[VOUCHER] approve:', e);
      return res.status(500).json({ error: 'Error aprobando comprobante', detail: e?.message });
    }
    client.release();

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
        // Esta consulta tenía DOS defectos y ninguno se había notado porque el
        // primero tapaba al segundo:
        //
        //   1. `usa_pobox_packages` NO EXISTE. Nunca existió: la línea está rota
        //      desde que se escribió, así que aprobar un comprobante de una
        //      orden PO Box reventaba aquí —después de marcar la orden y ANTES
        //      de acreditar el excedente y liberar el crédito—. El cliente veía
        //      su carga como CRÉDITO aunque ya hubiera pagado (TKT-2026-2458).
        //      Las órdenes DHL no se veían afectadas: toman la otra rama.
        //
        //   2. Marcaba `costing_paid`, que significa "ya se le pagó AL
        //      PROVEEDOR", no "el cliente nos pagó". Con esa marca el paquete
        //      sale de la cola de lo que se le debe al proveedor. O sea que
        //      "arreglarlo" cambiando solo el nombre de la tabla habría dado de
        //      baja deuda con proveedores en cada pago de cliente. La tabla
        //      inexistente estuvo protegiendo ese pasivo por accidente.
        //
        // Se usa la forma canónica del resto del sistema (la misma que la
        // conciliación bancaria), que además cascadea a las cajas hijas — cosa
        // que la versión rota tampoco hacía.
        await pool.query(
          `UPDATE packages SET client_paid = TRUE, client_paid_at = CURRENT_TIMESTAMP,
                  saldo_pendiente = 0, payment_status = 'paid'
            WHERE id = ANY($1::int[]) OR master_id = ANY($1::int[])`,
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

    // 🔗 Órdenes que el MISMO depósito también cubre. Solo se intentan si la
    // orden del comprobante quedó cerrada: repartir un depósito que ni siquiera
    // alcanzó para la suya sería empezar por el final.
    const ordenesExtra: number[] = Array.isArray(req.body?.ordenes_extra)
      ? req.body.ordenes_extra.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];
    const extraResultado: any[] = [];
    if (allApproved && ordenesExtra.length > 0 && bankEntryId) {
      const nombreAdmin = (req.user as any)?.full_name || (req.user as any)?.email || 'Admin';
      for (const oid of ordenesExtra) {
        const r = await liquidarOrdenAdicional(oid, bankEntryId, adminId ?? null, nombreAdmin);
        extraResultado.push({ orden_id: oid, ...r });
      }
    } else if (ordenesExtra.length > 0 && !bankEntryId) {
      // Sin movimiento ligado no hay de dónde repartir: el libro de abonos es
      // justamente lo que impide gastar el mismo peso dos veces.
      extraResultado.push({ ok: false, motivo: 'Para cubrir otras órdenes hay que ligar el movimiento bancario.' });
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
      ordenes_extra: extraResultado,
    });
  } catch (error: any) {
    console.error('[VOUCHER-ADMIN] Approve error:', error);
    // El motivo viaja en la respuesta. Con el mensaje genérico, la aprobación
    // de comprobantes PO Box llevaba meses fallando por una tabla inexistente
    // y desde fuera solo se veía "Error al aprobar comprobante": imposible
    // saber si era permisos, el abono o un bug.
    return res.status(500).json({
      error: 'Error al aprobar comprobante',
      detalle: String(error?.message || error).slice(0, 300),
    });
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
      // El servicio se resuelve igual que al acreditar. Antes caía a
      // 'POBOX_USA' cuando la orden traía service_type nulo —lo normal en las
      // órdenes viejas—, así que podía descontar de una billetera distinta a la
      // que recibió el excedente y dejar saldo fantasma en la otra.
      const serviceType = (await resolveOrderService(dbClient, {
        poboxPaymentId: order.id,
        paymentReference: order.payment_reference,
      })) || order.service_type || 'POBOX_USA';
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

    // Rechazar un comprobante libera el abono que lo respaldaba: ese depósito
    // vuelve a quedar disponible en el estado de cuenta. Sin esto el dinero
    // real quedaría ocupado por un pago que se deshizo.
    try {
      const { revertirPorVoucher } = await import('./bankEntryLedger');
      const liberados = await revertirPorVoucher(
        dbClient, Number(id), `Comprobante rechazado por ${adminId ?? 'admin'}`, adminId ?? null
      );
      if (liberados) console.log(`[VOUCHER] rechazo ${id}: ${liberados} abono(s) liberados`);
    } catch (e: any) {
      console.error('[VOUCHER] liberar abono al rechazar:', e?.message);
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

/**
 * GET /api/admin/vouchers/:id/bank-candidates
 *
 * El cuello de botella para autorizar un comprobante no es decidir si la
 * imagen es buena: es encontrar cuál de los 4,000 movimientos del estado de
 * cuenta lo respalda. Sin esto, la persona tiene que abrir el estado de cuenta
 * en otra pestaña y buscar a ojo — que es exactamente por lo que la cola nunca
 * se trabajó.
 *
 * Devuelve solo movimientos con saldo disponible, ordenados por qué tan
 * probable es que sean el correcto: primero el importe exacto, luego los
 * cercanos en fecha, y al final lo que empate con la búsqueda libre.
 */
export const getVoucherBankCandidates = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const q = String(req.query.q || '').trim();

    const vRes = await pool.query(
      `SELECT v.declared_amount, v.created_at, u.box_id, u.full_name
         FROM payment_vouchers v
         JOIN users u ON u.id = v.user_id
        WHERE v.id = $1`,
      [id]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'Comprobante no encontrado' });
    const v = vRes.rows[0];
    const monto = Number(v.declared_amount) || 0;

    // La ventana arranca 60 días antes de que subieran el comprobante: los
    // clientes depositan y suben el papel semanas después. Hacia adelante casi
    // no pasa, así que basta con unos días.
    const params: any[] = [monto, v.created_at, v.box_id];
    let filtroTexto = '';
    if (q) {
      params.push(`%${q}%`);
      filtroTexto = ` OR be.concepto ILIKE $${params.length}
                      OR COALESCE(be.referencia,'') ILIKE $${params.length}`;
    }

    const result = await pool.query(
      `SELECT be.id, be.fecha, be.concepto, be.referencia, be.abono, be.banco
         FROM bank_statement_entries be
        WHERE be.abono > 0
          AND be.fecha BETWEEN ($2::timestamp - INTERVAL '60 days')::date
                           AND ($2::timestamp + INTERVAL '7 days')::date
          AND (
                ABS(be.abono - $1::numeric) < 0.01
             OR be.concepto ~ ('(^|[^0-9A-Za-z])' || $3 || '([^0-9]|$)')
             ${filtroTexto}
          )
        ORDER BY (ABS(be.abono - $1::numeric) < 0.01) DESC, be.fecha DESC
        LIMIT 60`,
      params
    );

    // Un movimiento ya ocupado no puede respaldar otro comprobante: se filtra
    // aquí en vez de dejar que el ledger lo rechace hasta el momento de
    // aprobar, cuando la persona ya perdió el tiempo eligiéndolo.
    const { estadoDeEntries } = await import('./bankEntryLedger');
    const estados = await estadoDeEntries(result.rows.map((r: any) => Number(r.id)));

    const candidatos = result.rows
      .map((r: any) => {
        const st = estados[Number(r.id)];
        const disponible = st ? st.disponible : Number(r.abono) || 0;
        const exacto = Math.abs(Number(r.abono) - monto) < 0.01;
        const citaCliente = new RegExp(`(^|[^0-9A-Za-z])${v.box_id}([^0-9]|$)`).test(r.concepto || '');
        return {
          ...r,
          disponible,
          alcanza: disponible + 0.01 >= monto,
          importe_exacto: exacto,
          cita_al_cliente: citaCliente,
          // Para que la pantalla explique por qué lo propone en vez de solo
          // listarlo: sin esto la persona no sabe en qué fijarse.
          razon: citaCliente && exacto
            ? 'El importe coincide exacto y el concepto menciona su número de cliente'
            : citaCliente ? 'El concepto menciona su número de cliente'
            : exacto ? 'El importe coincide exacto'
            : 'Coincide con tu búsqueda',
        };
      })
      .filter((c: any) => c.disponible > 0.009)
      .sort((a: any, b: any) =>
        (Number(b.cita_al_cliente) * 2 + Number(b.importe_exacto)) -
        (Number(a.cita_al_cliente) * 2 + Number(a.importe_exacto))
      );

    return res.json({
      voucher_id: Number(id),
      declared_amount: monto,
      cliente: { box_id: v.box_id, nombre: v.full_name },
      candidatos,
      // Decirlo explícitamente evita la lectura peligrosa: "no hay candidatos"
      // NO significa "el cliente no pagó".
      nota: candidatos.length === 0
        ? 'No hay movimientos con saldo libre que empaten. Puede que el depósito llegue con otro importe (pagos juntos), sin mencionar el número de cliente, o que el estado de cuenta de esos días no esté cargado. Busca por nombre o importe antes de concluir que no pagó.'
        : null,
    });
  } catch (error: any) {
    console.error('[VOUCHER-ADMIN] bank candidates error:', error);
    return res.status(500).json({ error: 'Error buscando movimientos bancarios', detalle: error.message });
  }
};

/**
 * Liquida una orden ADICIONAL con el mismo depósito de un comprobante.
 *
 * El caso: ALEX HUANG deposita $10,813.55 en una sola transferencia y sube el
 * comprobante en UNA de sus órdenes. Ese importe es la suma EXACTA de sus tres
 * órdenes abiertas. Aprobando solo la del comprobante se cerraba una, el
 * excedente se iba a saldo a favor o a deuda, y sus otras dos seguían a crédito
 * bloqueadas. El cliente hace lo correcto y el sistema lo deja a medias.
 *
 * El libro de abonos ya soporta que un movimiento respalde varias órdenes: lleva
 * el saldo disponible por movimiento, así que no hay riesgo de gastarlo dos
 * veces. Lo que faltaba era usarlo.
 *
 * Duplica a propósito los pasos de cierre de approveVoucher en vez de refactorizar
 * ese camino: acaba de validarse en producción con cuatro comprobantes reales y
 * no vale la pena moverlo para ahorrar treinta líneas.
 */
export async function liquidarOrdenAdicional(
  orderId: number,
  bankEntryId: number,
  adminId: number | null,
  adminNombre: string
): Promise<{ ok: boolean; motivo?: string; monto?: number; referencia?: string }> {
  const oRes = await pool.query(
    `SELECT id, user_id, amount, payment_reference, package_ids, payment_method,
            COALESCE(credit_settled, false) AS credit_settled, status
       FROM pobox_payments WHERE id = $1`,
    [orderId]
  );
  const o = oRes.rows[0];
  if (!o) return { ok: false, motivo: 'La orden no existe.' };

  // Una orden ya liquidada no se vuelve a cobrar. Sin esta guarda, dos clics
  // seguidos aplicarían el abono dos veces contra la misma orden.
  const yaLiquidada = String(o.payment_method || '').toLowerCase() === 'credit'
    ? o.credit_settled === true
    : ['paid', 'completed'].includes(String(o.status));
  if (yaLiquidada) {
    return { ok: false, motivo: `La orden ${o.payment_reference} ya estaba liquidada.`, referencia: o.payment_reference };
  }

  const monto = Number(o.amount) || 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reserva el dinero del mismo movimiento. Si ya no alcanza, truena aquí y
    // no se cierra nada: es la proteccion contra aplicar el mismo peso dos veces.
    const { ensureLedgerSchema, aplicarAbono } = await import('./bankEntryLedger');
    await ensureLedgerSchema();
    await aplicarAbono(client, {
      bankEntryId,
      montoAplicado: monto,
      origen: 'comprobante_manual',
      paymentOrderId: o.id,
      paymentReference: o.payment_reference,
      voucherId: null,
      aplicadoPor: adminId,
      aplicadoPorNombre: adminNombre,
      nota: 'Pago conjunto: el cliente cubrió varias órdenes con un solo depósito.',
    });

    await client.query(
      `UPDATE pobox_payments SET status = 'completed', paid_at = NOW() WHERE id = $1`,
      [o.id]
    );

    await client.query('COMMIT');
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    return { ok: false, motivo: e?.message || 'No se pudo aplicar el abono.', referencia: o.payment_reference };
  }
  client.release();

  // Fuera de la transacción, igual que en approveVoucher: marcar guías, liberar
  // crédito y comisiones. Si algo de esto falla, el pago YA quedó registrado y
  // se puede reintentar; al revés se perdería el abono.
  const rawPkgIds = o.package_ids;
  const packageIds: number[] = (typeof rawPkgIds === 'string' ? JSON.parse(rawPkgIds) : (rawPkgIds || []))
    .map((n: any) => Number(String(n).replace(/^[A-Za-z]+-/, '')))
    .filter((n: number) => Number.isFinite(n));

  // Colisión de id: en órdenes DHL package_ids apunta a dhl_shipments, no a
  // packages. Marcar la tabla equivocada deja la guía sin pagar.
  let esDhl = false;
  try {
    const svc = await pool.query(
      `SELECT service_type FROM openpay_webhook_logs
        WHERE transaction_id = $1 AND service_type IS NOT NULL ORDER BY id DESC LIMIT 1`,
      [o.payment_reference]
    );
    esDhl = String(svc.rows[0]?.service_type || '').toUpperCase() === 'AA_DHL';
  } catch { /* se asume no-DHL */ }

  try {
    if (packageIds.length > 0 && esDhl) {
      await markDhlGroupPaid(pool, packageIds, { onlyUnpaid: true });
    } else if (packageIds.length > 0) {
      await pool.query(
        `UPDATE packages SET client_paid = TRUE, client_paid_at = CURRENT_TIMESTAMP,
                saldo_pendiente = 0, payment_status = 'paid'
          WHERE id = ANY($1::int[]) OR master_id = ANY($1::int[])`,
        [packageIds]
      );
    }
  } catch (e: any) {
    console.error(`[VOUCHER] Orden ${o.payment_reference}: no se pudieron marcar las guías:`, e?.message || e);
  }

  if (String(o.payment_method || '').toLowerCase() === 'credit') {
    await pool.query(
      `UPDATE pobox_payments SET credit_settled = TRUE, credit_settled_at = NOW() WHERE id = $1`,
      [o.id]
    );
    const svcKey = esDhl
      ? 'dhl_liberacion'
      : await resolveCreditService(pool, {
          poboxPaymentId: o.id,
          paymentReference: o.payment_reference,
          packageIds,
        });
    await restoreServiceCredit(pool, {
      userId: o.user_id,
      amount: monto,
      service: svcKey,
      orderRef: o.payment_reference || o.id,
    });
    if (packageIds.length > 0) {
      await pool.query(
        `UPDATE advisor_commissions
            SET awaiting_client_payment = FALSE, client_paid_at = NOW(), updated_at = NOW()
          WHERE shipment_type = 'PKG' AND shipment_id = ANY($1)
            AND COALESCE(awaiting_client_payment, FALSE) = TRUE`,
        [packageIds]
      );
    }
  }

  generateInvoiceForPoboxPaymentByRef(String(o.payment_reference || '')).catch((e: any) =>
    console.error('[liquidarOrdenAdicional] factura:', e?.message || e)
  );

  console.log(`💰 [VOUCHER] Orden adicional ${o.payment_reference} liquidada con el abono #${bankEntryId} por $${monto.toFixed(2)}`);
  return { ok: true, monto, referencia: o.payment_reference };
}

/**
 * GET /api/admin/vouchers/:id/otras-ordenes
 *
 * Las demás órdenes abiertas del cliente, para el caso en que un solo depósito
 * cubre varias. Marca `cobertura_exacta` cuando el importe del comprobante
 * coincide al centavo con la suma de TODAS las abiertas: es la señal que hace
 * obvio lo que si no hay que descubrir a mano.
 */
export const getOtrasOrdenesDelCliente = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const vRes = await pool.query(
      `SELECT v.declared_amount, v.payment_order_id, v.user_id, u.box_id, u.full_name
         FROM payment_vouchers v JOIN users u ON u.id = v.user_id WHERE v.id = $1`,
      [id]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'Comprobante no encontrado' });
    const v = vRes.rows[0];
    const deposito = Number(v.declared_amount) || 0;

    const ordenRes = await pool.query(`SELECT amount FROM pobox_payments WHERE id = $1`, [v.payment_order_id]);
    const montoOrden = Number(ordenRes.rows[0]?.amount) || 0;

    // Solo tiene sentido preguntar cuando sobra dinero.
    if (deposito <= montoOrden + 0.01) {
      return res.json({ aplica: false, otras: [], sobrante: 0 });
    }

    const otras = await pool.query(
      `SELECT p.id, p.payment_reference, p.amount, p.status, p.payment_method, p.created_at
         FROM pobox_payments p
        WHERE p.user_id = $1
          AND p.id <> $2
          AND p.status NOT IN ('cancelled', 'expired', 'paid')
          AND (LOWER(COALESCE(p.payment_method,'')) <> 'credit'
               OR COALESCE(p.credit_settled, false) = false)
        ORDER BY p.created_at ASC`,
      [v.user_id, v.payment_order_id]
    );

    const sobrante = +(deposito - montoOrden).toFixed(2);
    const sumaOtras = otras.rows.reduce((t: number, r: any) => t + (Number(r.amount) || 0), 0);
    const coberturaExacta = Math.abs(deposito - (montoOrden + sumaOtras)) < 0.01 && otras.rows.length > 0;

    return res.json({
      aplica: true,
      cliente: { box_id: v.box_id, nombre: v.full_name },
      deposito,
      monto_orden: montoOrden,
      sobrante,
      cobertura_exacta: coberturaExacta,
      otras: otras.rows.map((r: any) => ({
        id: Number(r.id),
        payment_reference: r.payment_reference,
        amount: Number(r.amount),
        status: r.status,
        es_credito: String(r.payment_method || '').toLowerCase() === 'credit',
        alcanza: Number(r.amount) <= sobrante + 0.01,
      })),
      mensaje: coberturaExacta
        ? `Este depósito de $${deposito.toLocaleString('es-MX', { minimumFractionDigits: 2 })} cubre EXACTAMENTE las ${otras.rows.length + 1} órdenes abiertas de este cliente.`
        : null,
    });
  } catch (error: any) {
    console.error('[VOUCHER-ADMIN] otras-ordenes:', error);
    return res.status(500).json({ error: 'Error buscando otras órdenes', detalle: error.message });
  }
};
