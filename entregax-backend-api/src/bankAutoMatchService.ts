/**
 * BANK AUTO-AUTH SERVICE
 *
 * Después de que el cron de Syncfy (startSyncfyAutoSyncCron) sincroniza
 * transacciones bancarias y autoMatchTransaction las matchea contra órdenes
 * de pago pendientes, esta capa:
 *   1) Autoriza automáticamente cada match (mismo flujo que el endpoint manual
 *      POST /api/admin/finance/authorize-bank-payments).
 *   2) Envía notificaciones:
 *      - 1 notificación "Estado de cuenta actualizado" a todos los asesores,
 *        sub-asesores, directores, admins y super_admin (con resumen).
 *      - 1 notificación "Pago recibido" al cliente y a su asesor por cada
 *        orden auto-autorizada.
 */

import { pool } from './db';
import { expandDhlGroupIds } from './dhlGroup';
import { resolveCreditService, restoreServiceCredit } from './creditRestore';
import { resolveOrderService, classifyOrderIds } from './orderService';
import { createNotification, createCustomNotification } from './notificationController';

type AuthorizeResult = {
  ref: string;
  status: 'authorized' | 'already_paid' | 'error';
  amount?: number;
  bank_total?: number;
  surplus?: number;
  surplus_credited?: boolean;
  packages_count?: number;
  error?: string;
};

/**
 * Resuelve un "admin actor" para los registros financieros cuando la
 * autorización viene del cron. Usamos el user_id que conectó la credencial
 * de Syncfy para el emisor. Si no se encuentra, fallback a super_admin.
 */
const resolveCronActor = async (emitterId: number): Promise<{ id: number; name: string }> => {
  const r = await pool.query(
    `SELECT u.id, u.full_name, u.email
       FROM syncfy_credentials sc
       JOIN users u ON u.id = sc.user_id
      WHERE sc.emitter_id = $1 AND sc.is_active = TRUE
      ORDER BY sc.created_at DESC LIMIT 1`,
    [emitterId]
  ).catch(() => ({ rows: [] as any[] }));
  if (r.rows.length > 0) {
    return { id: Number(r.rows[0].id), name: `Sistema · ${r.rows[0].full_name || r.rows[0].email}` };
  }
  // Fallback: cualquier super_admin
  const sa = await pool.query(
    `SELECT id, full_name FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1`
  ).catch(() => ({ rows: [] as any[] }));
  if (sa.rows.length > 0) {
    return { id: Number(sa.rows[0].id), name: `Sistema · ${sa.rows[0].full_name || 'super_admin'}` };
  }
  return { id: 0, name: 'Sistema (auto-sync banco)' };
};

/**
 * Autoriza UN match (replica la lógica del endpoint manual). Usa transacción
 * a nivel de pg client. Si la orden ya está paid devuelve already_paid sin
 * tocar nada.
 */
const authorizeOneMatch = async (
  syncfyTxId: number,
  poboxPaymentId: number,
  bankAmount: number,
  adminId: number,
  adminName: string
): Promise<AuthorizeResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT pp.*, u.full_name as cliente_nombre, u.id AS cliente_user_id
         FROM pobox_payments pp
         LEFT JOIN users u ON pp.user_id = u.id
        WHERE pp.id = $1`,
      [poboxPaymentId]
    );
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ref: '', status: 'error', error: 'Orden no encontrada' };
    }
    const order = orderRes.rows[0];
    const ref = String(order.payment_reference || '');

    if (order.status === 'paid') {
      await client.query('ROLLBACK');
      return { ref, status: 'already_paid' };
    }

    const orderAmount = parseFloat(order.amount) || 0;
    const bankTotal = bankAmount || 0;
    const surplus = Math.max(0, bankTotal - orderAmount);

    // 🔒 El depósito tiene que CUBRIR la orden. Antes solo se calculaba el
    // excedente y nunca el faltante, así que un depósito menor se autorizaba
    // igual: un abono de $1,477.94 liquidó una orden de $2,260.94 y dejó las
    // guías marcadas como pagadas. Un pago parcial no se auto-autoriza; queda
    // para revisión manual en Cobranza.
    const TOLERANCIA_MXN = 5; // redondeo de centavos del banco
    if (bankTotal < orderAmount - TOLERANCIA_MXN) {
      await client.query('ROLLBACK');
      const faltante = +(orderAmount - bankTotal).toFixed(2);
      console.warn(
        `[bankAutoMatch] Orden ${ref} NO auto-autorizada: el banco recibió $${bankTotal.toFixed(2)} ` +
        `de $${orderAmount.toFixed(2)} (faltan $${faltante.toFixed(2)}). Pago parcial → revisión manual.`
      );
      return {
        ref,
        status: 'error',
        amount: orderAmount,
        bank_total: bankTotal,
        error: `Pago parcial: se recibieron $${bankTotal.toFixed(2)} de $${orderAmount.toFixed(2)}. Faltan $${faltante.toFixed(2)}. Requiere autorización manual.`,
      };
    }

    // 1) Marcar la orden como pagada
    await client.query(
      `UPDATE pobox_payments SET
         status = 'paid',
         paid_at = CURRENT_TIMESTAMP,
         surplus_amount = $2,
         confirmation_notes = $3
       WHERE id = $1`,
      [order.id, surplus, `Autorizado AUTO desde estado de cuenta bancario por ${adminName}. Banco: $${bankTotal.toFixed(2)}, Orden: $${orderAmount.toFixed(2)}`]
    );

    // 2) Aplicar el pago a las guías del SERVICIO correcto. Los ids de package_ids
    //    COLISIONAN entre packages/dhl_shipments/maritime_orders; se resuelve por los
    //    package_uids de la orden de asesor (PKG-/DHL-/MAR-). Antes se aplicaba SIEMPRE
    //    a 'packages', por lo que un depósito de una orden DHL marcaba un PO Box ajeno
    //    (colisión) y dejaba la guía DHL sin pagar.
    let packageIds: number[] = [];
    try {
      const parsed = typeof order.package_ids === 'string' ? JSON.parse(order.package_ids) : order.package_ids;
      packageIds = (Array.isArray(parsed) ? parsed : []).map((x: any) => parseInt(String(x), 10)).filter((n: number) => Number.isFinite(n));
    } catch { packageIds = []; }

    let pkgIds: number[] = [];
    let dhlIds: number[] = [];
    let marIds: number[] = [];
    const apoRes = await client.query(
      `SELECT package_uids FROM advisor_payment_orders WHERE pobox_payment_id = $1 LIMIT 1`,
      [order.id]
    );
    const rawUids = apoRes.rows[0]?.package_uids;
    const uidArr: string[] = Array.isArray(rawUids) ? rawUids : (typeof rawUids === 'string' ? JSON.parse(rawUids) : []);
    if (uidArr.length > 0) {
      for (const uid of uidArr) {
        const [prefix, idStr] = String(uid).split('-');
        const numId = parseInt(idStr ?? '', 10);
        if (!Number.isFinite(numId)) continue;
        if (prefix === 'DHL') dhlIds.push(numId);
        else if (prefix === 'MAR') marIds.push(numId);
        else pkgIds.push(numId);
      }
    } else {
      // Sin orden de asesor no hay prefijos DHL-/MAR-/PKG- que clasifiquen los
      // ids. Tratarlos como packages aplicaba el pago a paquetes AÉREOS ajenos:
      // los ids de dhl_shipments COLISIONAN con los de packages, así que el
      // depósito de un cliente marcaba pagadas las guías de otro y las guías DHL
      // reales seguían pendientes (TKT-2026-2113). El servicio se resuelve desde
      // las fuentes autoritativas de la orden, nunca adivinando la tabla.
      // pobox_payments.service_type lo declara la propia orden (columna nueva);
      // para órdenes anteriores se cae a la orden de asesor y al log de Openpay.
      const svcOrden = await resolveOrderService(client, {
        poboxPaymentId: order.id,
        paymentReference: order.payment_reference,
      });
      if (svcOrden) {
        ({ pkgIds, dhlIds, marIds } = classifyOrderIds(svcOrden, packageIds));
      } else {
        // Servicio indeterminado: aplicar a packages sería apostar. Se aborta
        // para que un humano lo revise en vez de tocar la tabla equivocada.
        await client.query('ROLLBACK');
        console.error(
          `[bankAutoMatch] Orden ${ref} NO auto-autorizada: sin orden de asesor y sin service_type ` +
          `en openpay_webhook_logs no se puede saber a qué tabla aplicar el pago (los ids colisionan ` +
          `entre packages/dhl_shipments/maritime_orders). Requiere autorización manual.`
        );
        return {
          ref, status: 'error', amount: orderAmount, bank_total: bankTotal,
          error: 'No se pudo determinar el servicio de la orden (sin orden de asesor ni service_type). Requiere autorización manual.',
        };
      }
    }
    // DHL: marcar TODAS las cajas del envío (la orden solo referencia una).
    // Se expande aquí porque dhlIds se reutiliza más abajo para comisiones.
    if (dhlIds.length > 0) {
      dhlIds = await expandDhlGroupIds(client, dhlIds);
    }
    if (pkgIds.length > 0) {
      await client.query(
        `UPDATE packages SET client_paid = TRUE, client_paid_at = CURRENT_TIMESTAMP,
               saldo_pendiente = 0, payment_status = 'paid'
         WHERE id = ANY($1) OR master_id = ANY($1)`,
        [pkgIds]
      );
    }
    if (dhlIds.length > 0) {
      await client.query(
        `UPDATE dhl_shipments SET paid_at = CURRENT_TIMESTAMP, cost_payment_status = 'paid',
                monto_pagado = COALESCE(total_cost_mxn, saldo_pendiente, 0), saldo_pendiente = 0
         WHERE id = ANY($1::int[])`,
        [dhlIds]
      );
    }
    if (marIds.length > 0) {
      await client.query(
        `UPDATE maritime_orders SET payment_status = 'paid', client_paid_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])`,
        [marIds]
      );
    }
    // Sincronizar la orden de asesor a 'pagado'.
    await client.query(
      `UPDATE advisor_payment_orders SET status = 'pagado', updated_at = NOW() WHERE pobox_payment_id = $1 AND status <> 'cancelado'`,
      [order.id]
    );
    // ids REALES aplicados (para comisiones más abajo).
    const appliedIds: number[] = [...pkgIds, ...dhlIds, ...marIds];

    // 2b) 💳 Orden a CRÉDITO: RESTAURAR el crédito del servicio (used_credit).
    //     Antes esto SOLO lo hacía el flujo manual de confirmación de comprobante,
    //     así que los pagos auto-conciliados por Syncfy dejaban el crédito como
    //     "usado" y nunca se reintegraba al monedero de crédito del cliente.
    if (String(order.payment_method || '').toLowerCase() === 'credit') {
      await client.query(
        `UPDATE pobox_payments SET credit_settled = TRUE, credit_settled_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [order.id]
      );
      // El servicio se resuelve desde la orden, NO desde packages: en DHL los
      // package_ids apuntan a dhl_shipments y colisionan con packages.
      const svcKeyCredit = await resolveCreditService(client, {
        poboxPaymentId: order.id,
        paymentReference: order.payment_reference,
        packageIds,
      });
      await restoreServiceCredit(client, {
        userId: order.user_id,
        amount: orderAmount,
        service: svcKeyCredit,
        orderRef: order.payment_reference || order.id,
      });
      // Liberar comisiones retenidas de estas guías (el crédito ya se pagó).
      if (packageIds.length > 0) {
        await client.query(
          `UPDATE advisor_commissions
              SET awaiting_client_payment = FALSE, client_paid_at = NOW(), updated_at = NOW()
            WHERE shipment_type = 'PKG' AND shipment_id = ANY($1)
              AND COALESCE(awaiting_client_payment, FALSE) = TRUE`,
          [packageIds]
        );
      }
      console.log(`↩️ [auto-match] Crédito reintegrado: $${orderAmount} servicio=${svcKeyCredit || 'global'} usuario=${order.user_id}`);
    }

    // 3) Aprobar vouchers pendientes
    await client.query(
      `UPDATE payment_vouchers SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
       WHERE payment_order_id = $1 AND status IN ('pending_review', 'pending_confirm')`,
      [order.id, adminId]
    );

    // 4) Registros financieros (billetera_sucursal + movimientos_financieros + caja_chica_transacciones)
    const branchId = 6; // mismo valor que el endpoint manual
    const billeteraResult = await client.query(
      `SELECT id, saldo_actual FROM billeteras_sucursal
        WHERE sucursal_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
      [branchId]
    );

    if (billeteraResult.rows.length > 0) {
      const billetera = billeteraResult.rows[0];
      const saldoAnterior = parseFloat(billetera.saldo_actual) || 0;
      const nuevoSaldo = saldoAnterior + orderAmount;

      await client.query(`UPDATE billeteras_sucursal SET saldo_actual = $1 WHERE id = $2`, [nuevoSaldo, billetera.id]);

      await client.query(
        `INSERT INTO movimientos_financieros (
           sucursal_id, billetera_id, tipo_movimiento, monto, monto_antes, monto_despues,
           nota_descriptiva, referencia, usuario_id, usuario_nombre, status, created_at
         ) VALUES ($1, $2, 'ingreso', $3, $4, $5, $6, $7, $8, $9, 'confirmado', CURRENT_TIMESTAMP)`,
        [branchId, billetera.id, orderAmount, saldoAnterior, nuevoSaldo,
         `Auto-autorizado por sync bancario - ${packageIds.length} paquete(s)`,
         ref, adminId, adminName]
      );

      await client.query(
        `INSERT INTO caja_chica_transacciones (
           tipo, monto, concepto, cliente_id, admin_id, admin_name,
           saldo_despues_movimiento, categoria, notas, currency, service_type
         ) VALUES ('ingreso', $1, $2, $3, $4, $5, $6, 'cobro_guias', $7, 'MXN', 'POBOX_USA')`,
        [orderAmount,
         `Auto-autorizado sync bancario - ${packageIds.length} paquete(s) - ${order.cliente_nombre || 'Cliente'} - Ref: ${ref}`,
         order.user_id, adminId, adminName, nuevoSaldo,
         `Auto-autorizado por sync de Syncfy`]
      );
    }

    // 5) Acreditar excedente a wallet del cliente
    if (surplus > 0) {
      const serviceType = 'POBOX_USA';
      const walletRes = await client.query(
        `INSERT INTO billetera_servicio (user_id, service_type, saldo, currency)
         VALUES ($1, $2, $3, 'MXN')
         ON CONFLICT (user_id, service_type) DO UPDATE
           SET saldo = billetera_servicio.saldo + $3, updated_at = NOW()
         RETURNING *`,
        [order.user_id, serviceType, surplus]
      );

      await client.query(
        `INSERT INTO billetera_servicio_transacciones
           (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id, created_by)
         VALUES ($1, $2, $3, 'excedente', $4, 'MXN', $5, $6, $7)`,
        [walletRes.rows[0].id, order.user_id, serviceType, surplus,
         `Excedente AUTO de orden ${ref} (banco: $${bankTotal.toFixed(2)}, orden: $${orderAmount.toFixed(2)})`,
         order.id, adminId]
      );

      await client.query(`UPDATE pobox_payments SET surplus_credited = TRUE WHERE id = $1`, [order.id]);
    }

    // 6) Actualizar openpay_webhook_logs si existe
    await client.query(
      `UPDATE openpay_webhook_logs SET estatus_procesamiento = 'procesado', processed_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $1 AND estatus_procesamiento IN ('confirmed', 'pending_payment')`,
      [ref]
    );

    await client.query('COMMIT');

    // 7) Comisiones (fire-and-forget). La activación de GEX vive en index.ts
    //    como función privada; cuando se acceda al panel manual de
    //    autorización ya queda cubierto, así que aquí omitimos GEX para no
    //    duplicar lógica.
    if (appliedIds.length > 0) {
      try {
        const { generateCommissionsForPackages } = await import('./commissionService');
        // expectedUserId: el embarque debe ser del cliente de ESTA orden.
        // Sin eso, un id que colisiona entre packages y dhl_shipments resolvía
        // al embarque de otro cliente (ver commissionService).
        generateCommissionsForPackages(appliedIds, { expectedUserId: order.user_id }).catch((e: any) =>
          console.error('[bank-auto-auth] commissions error:', e?.message)
        );
      } catch (e: any) {
        console.warn('[bank-auto-auth] no se pudo importar commissions helpers:', e?.message);
      }
    }

    console.log(`✅ [Auto-AUTH] ${ref} — Orden: $${orderAmount} / Banco: $${bankTotal} / Excedente: $${surplus}`);

    return {
      ref,
      status: 'authorized',
      amount: orderAmount,
      bank_total: bankTotal,
      surplus,
      surplus_credited: surplus > 0,
      packages_count: packageIds.length,
    };
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`❌ [Auto-AUTH] error en pobox_payment ${poboxPaymentId}:`, err?.message);
    return { ref: '', status: 'error', error: err?.message || String(err) };
  } finally {
    client.release();
  }
};

/**
 * Mapea el emisor fiscal (razón social) al SERVICIO cuyos pagos concilia esa
 * cuenta bancaria. Así la notificación dice el servicio (PO Box, DHL/TDI…) en
 * vez del nombre de la empresa, que no le dice nada a operaciones.
 * Si se agrega un emisor/servicio nuevo, basta con una entrada aquí.
 */
const serviceLabelForEmitter = (businessName: string): string | null => {
  const n = (businessName || '').toUpperCase();
  if (n.includes('RODADA')) return 'PO Box';
  if (n.includes('URBAN')) return 'DHL, TDI Express y TDI Aéreo';
  return null;
};


/**
 * Función principal — la llama el cron tras `syncEmitter()` exitoso.
 *
 * 1) Busca syncfy_transactions con match_status='matched' del emisor cuyo
 *    pobox_payment todavía no esté pagado.
 * 2) Autoriza cada uno y dispara notificación al cliente + asesor.
 * 3) Envía notificación de "estado de cuenta actualizado" a staff con
 *    resumen agregado.
 */
export const autoAuthorizeAndNotifyAfterSync = async (
  emitterId: number,
  syncSummary: { new_count: number; duplicate_count: number; matched_count: number }
): Promise<{ authorized: number; already_paid: number; errors: number }> => {
  const actor = await resolveCronActor(emitterId);

  // Buscamos transacciones matched cuyo pobox_payment NO esté pagado aún.
  // Limitamos a las últimas 24h para no reabrir órdenes viejas si por error
  // matchearon algo antiguo. Esto cubre el flujo normal (sync corre cada
  // pocos minutos tras conectar).
  const pending = await pool.query(
    `SELECT st.id AS st_id, st.matched_payment_id AS pp_id, st.amount AS bank_amount,
            pp.user_id, pp.payment_reference, pp.amount AS order_amount
       FROM syncfy_transactions st
       JOIN pobox_payments pp ON pp.id = st.matched_payment_id
      WHERE st.emitter_id = $1
        AND st.match_status = 'matched'
        AND pp.status IN ('pending','pending_payment','vouchers_submitted','vouchers_partial')
        AND st.matched_at >= NOW() - INTERVAL '24 hours'`,
    [emitterId]
  ).catch((e) => {
    console.warn('[bank-auto-auth] consulta de pendientes fallo:', e?.message);
    return { rows: [] as any[] };
  });

  let authorized = 0;
  let already_paid = 0;
  let errors = 0;

  for (const row of pending.rows) {
    const result = await authorizeOneMatch(
      Number(row.st_id),
      Number(row.pp_id),
      Number(row.bank_amount) || 0,
      actor.id,
      actor.name
    );
    if (result.status === 'authorized') {
      authorized++;
      // Notificar cliente + asesor
      if (row.user_id) {
        // Mismo aviso que la aprobación manual y la autorización desde el panel:
        // WhatsApp + push al cliente y push al asesor. Antes esta ruta solo
        // dejaba una notificación in-app, así que un pago conciliado de
        // madrugada no le llegaba a nadie hasta que entraran al sistema.
        const { avisarPagoConfirmado } = await import('./voucherController');
        await avisarPagoConfirmado(Number(row.pp_id), {
          parcial: false,
          total: Number(result.amount) || Number(row.order_amount) || 0,
          abonado: Number(row.bank_amount) || 0,
          faltante: 0,
        }).catch((e: any) => console.warn('[bank-auto-auth] aviso de pago:', e?.message));
      }
    } else if (result.status === 'already_paid') {
      already_paid++;
    } else {
      errors++;
    }
  }

  // Ya no se manda el resumen "Pagos de X actualizados" a asesores y finanzas:
  // era ruido en cada corrida del cron, incluso cuando no autorizaba nada
  // ("0 coincidencias, 0 pagos"). Ahora cada pago conciliado avisa por sí solo
  // a su cliente y a su asesor, que es lo que de verdad importa.

  return { authorized, already_paid, errors };
};
