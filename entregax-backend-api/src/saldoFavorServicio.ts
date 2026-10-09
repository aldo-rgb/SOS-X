/**
 * SALDO A FAVOR POR SERVICIO
 *
 * Cuando un cliente paga de más, el excedente se le abona en
 * `billetera_servicio`, separado POR SERVICIO: el sobrante de una orden DHL
 * solo se puede usar en DHL, el de PO Box en PO Box. Es la regla de negocio —
 * se aplica al mismo servicio del que se pagó la referencia.
 *
 * El problema que resuelve este archivo: esa tabla solo se escribía. Nadie la
 * leía y nadie podía gastarla, así que el cliente que pagaba de más veía su
 * excedente desaparecer —$132,044 acumulados de 18 clientes— y soporte no tenía
 * qué contestarle (TKT-2026-2440). Aquí se expone para consultarla y para
 * aplicarla a una orden pendiente del mismo servicio.
 *
 * OJO: es distinta de `billetera_digital` / `users.wallet_balance`, que es el
 * monedero de bonos por referidos y ya sale en la app. Son dos bolsas.
 */
import { Response } from 'express';
import { pool } from './db';
import { resolveOrderService } from './orderService';
import { markDhlGroupPaid } from './dhlGroup';

interface AuthRequest extends Request {
  user?: { userId?: number; id?: number; role?: string };
  body: any;
  params: any;
}

/** Nombre legible del servicio, para que el cliente entienda de qué es su saldo. */
const NOMBRE_SERVICIO: Record<string, string> = {
  POBOX_USA: 'PO Box USA',
  AA_DHL: 'DHL',
  AIR_CHN_MX: 'Aéreo China',
  TDI_EXPRESS: 'TDI Express',
  SEA_CHN_MX: 'Marítimo China',
  NACIONAL_MX: 'Nacional',
};
export const nombreServicio = (s: string) => NOMBRE_SERVICIO[s] || s;

/**
 * GET /api/saldo-favor
 * Saldos del cliente por servicio, con sus movimientos.
 */
export const misSaldosAFavor = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = Number(req.user?.userId || req.user?.id);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const saldos = await pool.query(
      `SELECT id, service_type, saldo::numeric(12,2) AS saldo, currency, updated_at
         FROM billetera_servicio
        WHERE user_id = $1 AND saldo > 0
        ORDER BY saldo DESC`,
      [userId]
    );
    const movs = await pool.query(
      `SELECT t.id, t.service_type, t.tipo, t.monto::numeric(12,2) AS monto, t.currency,
              t.concepto, t.created_at, p.payment_reference
         FROM billetera_servicio_transacciones t
         LEFT JOIN pobox_payments p ON p.id = t.payment_order_id
        WHERE t.user_id = $1
        ORDER BY t.id DESC LIMIT 50`,
      [userId]
    );

    res.json({
      success: true,
      total: +saldos.rows.reduce((s, r) => s + Number(r.saldo), 0).toFixed(2),
      saldos: saldos.rows.map(r => ({
        id: r.id,
        servicio: r.service_type,
        servicioNombre: nombreServicio(r.service_type),
        saldo: Number(r.saldo),
        currency: r.currency || 'MXN',
        actualizado: r.updated_at,
      })),
      movimientos: movs.rows.map(m => ({
        id: m.id,
        servicio: m.service_type,
        servicioNombre: nombreServicio(m.service_type),
        // 'excedente' suma, 'egreso' resta. Se manda ya resuelto para que la
        // app no tenga que conocer los nombres internos.
        entra: m.tipo === 'excedente',
        monto: Number(m.monto),
        concepto: m.concepto,
        orden: m.payment_reference || null,
        fecha: m.created_at,
      })),
    });
  } catch (e: any) {
    console.error('[saldo-favor] misSaldosAFavor:', e);
    res.status(500).json({ error: 'No se pudo cargar tu saldo a favor' });
  }
};

/**
 * GET /api/saldo-favor/para-orden/:orderId
 * Cuánto saldo puede aplicar el cliente a ESA orden. Devuelve 0 si el saldo que
 * tiene es de otro servicio: no se mezclan bolsas.
 */
export const saldoParaOrden = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = Number(req.user?.userId || req.user?.id);
    const orderId = parseInt(String(req.params.orderId));
    if (!userId || !orderId) return res.status(400).json({ error: 'Datos incompletos' });

    const o = await pool.query(
      `SELECT id, user_id, amount, status, payment_reference, currency
         FROM pobox_payments WHERE id = $1 AND user_id = $2`,
      [orderId, userId]
    );
    if (o.rows.length === 0) return res.status(404).json({ error: 'Orden no encontrada' });
    const orden = o.rows[0];

    const servicio = await resolveOrderService(pool, {
      poboxPaymentId: orden.id,
      paymentReference: orden.payment_reference,
    });
    if (!servicio) return res.json({ success: true, disponible: 0, aplicable: 0, motivo: 'servicio_indeterminado' });

    const w = await pool.query(
      `SELECT COALESCE(saldo, 0)::numeric(12,2) AS saldo FROM billetera_servicio
        WHERE user_id = $1 AND service_type = $2`,
      [userId, servicio]
    );
    const disponible = Number(w.rows[0]?.saldo || 0);
    // Nunca más de lo que vale la orden: aplicar de más la dejaría en negativo.
    const aplicable = +Math.min(disponible, Number(orden.amount) || 0).toFixed(2);
    res.json({
      success: true,
      servicio, servicioNombre: nombreServicio(servicio),
      disponible, aplicable,
      montoOrden: Number(orden.amount) || 0,
    });
  } catch (e: any) {
    console.error('[saldo-favor] saldoParaOrden:', e);
    res.status(500).json({ error: 'No se pudo calcular el saldo aplicable' });
  }
};

/**
 * POST /api/saldo-favor/aplicar { orderId, monto? }
 * Aplica el saldo a favor del MISMO servicio a una orden pendiente: baja el
 * monto de la orden y descuenta de la bolsa. Sin monto, aplica todo lo que
 * alcance.
 */
export const aplicarSaldoAFavor = async (req: any, res: Response): Promise<any> => {
  const client = await pool.connect();
  try {
    const userId = Number(req.user?.userId || req.user?.id);
    const orderId = parseInt(String(req.body?.orderId));
    if (!userId || !orderId) return res.status(400).json({ error: 'Datos incompletos' });

    await client.query('BEGIN');
    const o = await client.query(
      `SELECT id, user_id, amount, status, payment_reference, currency, package_ids,
              COALESCE(wallet_applied, 0) AS wallet_applied
         FROM pobox_payments WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, userId]
    );
    if (o.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Orden no encontrada' }); }
    const orden = o.rows[0];

    // Solo sobre órdenes que todavía se van a pagar. Sobre una pagada sería
    // regalar dinero, y sobre una con comprobante el cliente ya calculó el
    // depósito con el monto anterior.
    const ABIERTAS = ['pending_payment', 'pending', 'generated'];
    if (!ABIERTAS.includes(String(orden.status))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `No se puede aplicar saldo a una orden en estado ${orden.status}` });
    }
    const comp = await client.query(
      `SELECT COUNT(*)::int n FROM payment_vouchers WHERE payment_order_id = $1 AND status <> 'rejected'`,
      [orderId]);
    if (Number(comp.rows[0]?.n) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Esta orden ya tiene un comprobante',
        message: 'Ya subiste un comprobante calculado con el monto actual. Pide a soporte que ajuste la orden.',
      });
    }

    const servicio = await resolveOrderService(client, {
      poboxPaymentId: orden.id,
      paymentReference: orden.payment_reference,
    });
    if (!servicio) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No se pudo determinar el servicio de la orden' });
    }

    const w = await client.query(
      `SELECT id, COALESCE(saldo, 0)::numeric(12,2) AS saldo FROM billetera_servicio
        WHERE user_id = $1 AND service_type = $2 FOR UPDATE`,
      [userId, servicio]);
    const disponible = Number(w.rows[0]?.saldo || 0);
    if (!(disponible > 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `No tienes saldo a favor de ${nombreServicio(servicio)}`,
        message: 'El saldo a favor solo se puede usar en el mismo servicio del que se generó.',
      });
    }

    const pedido = Number(req.body?.monto) > 0 ? +Number(req.body.monto).toFixed(2) : disponible;
    const aplicar = +Math.min(pedido, disponible, Number(orden.amount) || 0).toFixed(2);
    if (!(aplicar > 0)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Nada que aplicar' }); }

    await client.query(
      `UPDATE billetera_servicio SET saldo = saldo - $1, updated_at = NOW() WHERE id = $2`,
      [aplicar, w.rows[0].id]);
    await client.query(
      `INSERT INTO billetera_servicio_transacciones
         (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id, created_by)
       VALUES ($1, $2, $3, 'egreso', $4, $5, $6, $7, $8)`,
      [w.rows[0].id, userId, servicio, aplicar, orden.currency || 'MXN',
       `Saldo a favor aplicado a la orden ${orden.payment_reference}`, orderId, userId]);
    // Se apunta en metadata de qué bolsa salió. Comparte la columna
    // wallet_applied con el monedero general, y sin esta marca al revertir se
    // devolvía a users.wallet_balance: el dinero saltaba de la billetera del
    // servicio a la general y se volvía gastable en cualquier otro servicio,
    // que es justo lo que la regla del saldo por servicio impide.
    const upd = await client.query(
      `UPDATE pobox_payments
          SET amount = GREATEST(0, COALESCE(amount, 0) - $1),
              wallet_applied = COALESCE(wallet_applied, 0) + $1,
              wallet_applied_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'saldo_servicio_aplicado',
                jsonb_build_object(
                  'servicio', $3::text,
                  'monto', (COALESCE((metadata->'saldo_servicio_aplicado'->>'monto')::numeric, 0) + $1)
                ))
        WHERE id = $2
        RETURNING amount`,
      [aplicar, orderId, servicio]);

    // Si el saldo cubrió TODA la orden, hay que cerrarla aquí mismo.
    //
    // Antes esto solo bajaba el monto a cero y se quedaba ahí: la orden seguía
    // en "pendiente" y las guías sin pagar, aunque no restara un peso por
    // cobrar. El monedero general sí lo cierra —mismo caso, otro archivo—, así
    // que el resultado dependía de cuál de las dos bolsas usara el cliente.
    //
    // Lo reportó Jaqueline Minero por el cliente S342 (TKT-2026-2985): se
    // aplicaron $8,697 a las 21:28, la cotización siguió apareciendo pendiente
    // y alguien de cobranza la cerró a mano dos horas después. Sin eso se
    // queda colgada para siempre, porque ya no hay nada que conciliar.
    const restante = Number(upd.rows[0]?.amount ?? 0);
    const quedoCubierta = restante <= 0.009;
    if (quedoCubierta) {
      await client.query(
        `UPDATE pobox_payments
            SET status = 'completed', paid_at = NOW(), payment_method = 'wallet'
          WHERE id = $1`, [orderId]);

      // Las guías. Un envío DHL vive en dhl_shipments y su id se repite con el
      // de packages, así que la tabla se decide por el servicio de la orden y
      // no por el número: preguntar por el id en la tabla equivocada le marca
      // pagada la caja de otro cliente.
      const ids: number[] = (() => {
        try {
          const raw = typeof orden.package_ids === 'string' ? JSON.parse(orden.package_ids) : orden.package_ids;
          return Array.isArray(raw) ? raw.map(Number).filter(Boolean) : [];
        } catch { return []; }
      })();
      if (ids.length > 0) {
        if (String(servicio).toUpperCase() === 'AA_DHL') {
          await markDhlGroupPaid(client, ids, { onlyUnpaid: true });
        } else {
          await client.query(
            `UPDATE packages
                SET payment_status = 'paid', client_paid = TRUE,
                    monto_pagado = COALESCE(assigned_cost_mxn, 0), saldo_pendiente = 0,
                    client_paid_at = COALESCE(client_paid_at, NOW())
              WHERE id = ANY($1) OR master_id = ANY($1)`, [ids]);
        }
      }

      // Queda el rastro del cobro, igual que cualquier otro pago. Sin esto, una
      // orden liquidada con saldo no aparece en la conciliación y parece que
      // nunca se pagó.
      // payload_json es NOT NULL. El mismo INSERT existe en el monedero general
      // sin esa columna, envuelto en un try/catch, y por eso llevaba fallando
      // en silencio desde siempre: 10 órdenes pagadas con monedero y CERO
      // rastros en la bitácora. Un catch que se traga el error convierte un
      // bug en un hueco invisible.
      await client.query(
        `INSERT INTO openpay_webhook_logs
           (transaction_id, monto_recibido, monto_neto, concepto, fecha_pago,
            estatus_procesamiento, user_id, tipo_pago, service_type, payload_json)
         VALUES ($1, $2, $2, $3, NOW(), 'procesado', $4, 'wallet', $5, $6::jsonb)`,
        [`WALLET-${orden.payment_reference}`, aplicar,
         `Saldo a favor de ${nombreServicio(servicio)} aplicado a ${orden.payment_reference}`,
         userId, servicio,
         JSON.stringify({ origen: 'billetera_servicio', servicio, pobox_payment_id: orderId, packageIds: ids })]);
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      aplicado: aplicar,
      nuevoMonto: restante,
      ordenLiquidada: quedoCubierta,
      saldoRestante: +(disponible - aplicar).toFixed(2),
      servicio, servicioNombre: nombreServicio(servicio),
    });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[saldo-favor] aplicar:', e);
    res.status(500).json({ error: 'No se pudo aplicar el saldo a favor' });
  } finally {
    client.release();
  }
};

/**
 * GET /api/admin/saldo-favor — panel: quién tiene saldo a favor y de qué
 * servicio. Sin esto, contabilidad no tiene forma de ver el pasivo.
 */
export const saldosAFavorAdmin = async (_req: any, res: Response): Promise<any> => {
  try {
    const r = await pool.query(
      `SELECT b.id, b.user_id, u.box_id, u.full_name, u.email,
              b.service_type, b.saldo::numeric(12,2) AS saldo, b.currency, b.updated_at
         FROM billetera_servicio b JOIN users u ON u.id = b.user_id
        WHERE b.saldo > 0
        ORDER BY b.saldo DESC`);
    res.json({
      success: true,
      total: +r.rows.reduce((s, x) => s + Number(x.saldo), 0).toFixed(2),
      saldos: r.rows.map(x => ({
        id: x.id, userId: x.user_id, boxId: x.box_id, cliente: x.full_name, email: x.email,
        servicio: x.service_type, servicioNombre: nombreServicio(x.service_type),
        saldo: Number(x.saldo), currency: x.currency || 'MXN', actualizado: x.updated_at,
      })),
    });
  } catch (e: any) {
    console.error('[saldo-favor] admin:', e);
    res.status(500).json({ error: 'No se pudieron cargar los saldos a favor' });
  }
};
