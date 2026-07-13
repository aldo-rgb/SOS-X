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

    // 2) Marcar paquetes como pagados
    let packageIds: number[] = [];
    try {
      const parsed = typeof order.package_ids === 'string' ? JSON.parse(order.package_ids) : order.package_ids;
      packageIds = Array.isArray(parsed) ? parsed : [];
    } catch { packageIds = []; }

    if (packageIds.length > 0) {
      await client.query(
        `UPDATE packages SET client_paid = TRUE, client_paid_at = CURRENT_TIMESTAMP,
               saldo_pendiente = 0, payment_status = 'paid'
         WHERE id = ANY($1)`,
        [packageIds]
      );
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
    if (packageIds.length > 0) {
      try {
        const { generateCommissionsForPackages } = await import('./commissionService');
        generateCommissionsForPackages(packageIds).catch((e: any) =>
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
 * Notifica al cliente dueño de la orden y al asesor asignado.
 */
const notifyClientAndAdvisorOfPayment = async (
  userId: number,
  ref: string,
  amount: number,
  packagesCount: number
) => {
  const fmt = `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  const data = { ref, amount, packages_count: packagesCount, source: 'bank_auto_auth' };

  // Cliente
  try {
    await createNotification(
      userId,
      'PAYMENT_RECEIVED',
      `Detectamos tu pago de ${fmt} (ref ${ref}) en el estado de cuenta bancario y marcamos tu orden como pagada.`,
      data
    );
  } catch (e: any) {
    console.warn(`[bank-auto-auth] notif cliente ${userId} fallo:`, e?.message);
  }

  // Asesor / referrer (si existe)
  try {
    const r = await pool.query(
      `SELECT COALESCE(advisor_id, referred_by_id) AS adv FROM users WHERE id = $1`,
      [userId]
    );
    const adv = r.rows[0]?.adv ? Number(r.rows[0].adv) : null;
    if (adv && adv !== userId) {
      await createNotification(
        adv,
        'PAYMENT_RECEIVED',
        `Pago recibido de un cliente: ${fmt} (ref ${ref}). Orden auto-autorizada desde el banco.`,
        data
      );
    }
  } catch (e: any) {
    console.warn(`[bank-auto-auth] notif asesor del cliente ${userId} fallo:`, e?.message);
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
 * Notifica a todos los asesores, sub-asesores, directores, admins y super_admin
 * que el estado de cuenta se actualizó.
 */
const notifyStatementSynced = async (emitterId: number, summary: {
  newTransactions: number;
  matchedTransactions: number;
  authorized: number;
  alreadyPaid: number;
}) => {
  try {
    // Conciliación bancaria = cuentas MX (RODADA/URBAN, BBVA México). NO aplica a
    // mostradores en USA (Hidalgo TX, code HGO): sus usuarios no deben recibir
    // estas notificaciones de pagos.
    const recipients = await pool.query(
      `SELECT u.id FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
        WHERE u.role IN ('advisor','sub_advisor','director','admin','super_admin','branch_manager')
          AND COALESCE(u.is_active, true) = true
          AND UPPER(COALESCE(b.code, '')) <> 'HGO'`
    );
    const emitter = await pool.query(
      `SELECT business_name, bank_name FROM fiscal_emitters WHERE id = $1`,
      [emitterId]
    ).catch(() => ({ rows: [] as any[] }));
    const empresa = emitter.rows[0]?.business_name || `Emisor #${emitterId}`;
    const shortName = String(empresa).trim().split(/\s+/)[0] || empresa;

    // Traducir la razón social (emisor) al SERVICIO que cobra, para que
    // operaciones vea el servicio y no el nombre de la empresa (RODADA/URBAN).
    const serviceLabel = serviceLabelForEmitter(empresa);
    const title = serviceLabel
      ? `Pagos de ${serviceLabel} actualizados`
      : `Cuenta ${shortName} sincronizada.`;
    const message = `${summary.newTransactions} movimientos, ${summary.matchedTransactions} coincidencias, ${summary.authorized} pago(s) auto-autorizado(s).`;
    const data = { emitter_id: emitterId, ...summary, source: 'syncfy_auto_sync' };

    for (const r of recipients.rows) {
      try {
        await createCustomNotification(Number(r.id), title, message, 'info', 'bell', data, '/admin/dashboard-cobranza');
      } catch (e: any) {
        // continuar con los demás
        console.warn(`[bank-auto-auth] notif estado de cuenta user ${r.id} fallo:`, e?.message);
      }
    }
    console.log(`📬 [Auto-AUTH] Notificación 'estado de cuenta' enviada a ${recipients.rowCount} usuarios`);
  } catch (e: any) {
    console.warn('[bank-auto-auth] notifyStatementSynced fallo:', e?.message);
  }
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
        await notifyClientAndAdvisorOfPayment(
          Number(row.user_id),
          result.ref || String(row.payment_reference || ''),
          Number(result.amount) || Number(row.order_amount) || 0,
          Number(result.packages_count) || 0
        );
      }
    } else if (result.status === 'already_paid') {
      already_paid++;
    } else {
      errors++;
    }
  }

  // Notificación masiva siempre que el cron corra (aunque no haya nuevas
  // autorizaciones — confirma que la sync se ejecutó).
  await notifyStatementSynced(emitterId, {
    newTransactions: syncSummary.new_count,
    matchedTransactions: syncSummary.matched_count,
    authorized,
    alreadyPaid: already_paid,
  });

  return { authorized, already_paid, errors };
};
