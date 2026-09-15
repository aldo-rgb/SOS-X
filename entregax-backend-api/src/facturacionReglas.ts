// ============================================================
// Reglas para facturar el pago de una orden (tarea 581, Leonardo Reyna).
//
// 1) Una transferencia no se factura hasta que su depósito esté CONCILIADO con
//    el estado de cuenta. Antes se timbraba al aprobar el comprobante que subió
//    el cliente, y había 19 órdenes ($164,300) facturadas sin depósito en banco.
// 2) Solo se factura un pago del MES EN CURSO (hora de Monterrey). La fecha que
//    manda es la del depósito en el banco, no la de cuando se subió el pago.
// 3) Una factura por cada PAGO: si la orden se pagó en dos depósitos, salen dos
//    CFDI, cada uno por su monto y con su fecha.
//
// Efectivo, PayPal y tarjeta no pasan por el estado de cuenta: su fecha es la
// del pago registrado en el sistema.
// ============================================================
import { pool } from './db';

export type PagoPorFacturar = {
  bankEntryId: number | null;
  fecha: string;          // YYYY-MM-DD
  monto: number;
  voucherId: number | null;
};

export type EvaluacionFactura =
  | { ok: true; orden: OrdenFacturable; porFacturar: PagoPorFacturar[]; bloqueados: PagoPorFacturar[] }
  | { ok: false; espera?: boolean; mesCerrado?: boolean; motivo: string; orden?: OrdenFacturable };

export type OrdenFacturable = {
  id: number;
  referencia: string;
  metodo: string;
  monto: number;
  userId: number | null;
};

/** "YYYY-MM" del mes en curso en Monterrey. */
export const mesActualMty = (d: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit' }).format(d);

const fechaLegible = (ymd: string): string => {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};

export const ensureColumnasFactura = async (): Promise<void> => {
  await pool.query(`ALTER TABLE facturas_emitidas
      ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(40),
      ADD COLUMN IF NOT EXISTS fecha_pago DATE,
      ADD COLUMN IF NOT EXISTS bank_entry_id INTEGER`).catch(() => {});
};

/** Depósitos del banco aplicados a la orden (sin los revertidos). */
export const depositosDeOrden = async (ordenId: number, referencia: string): Promise<PagoPorFacturar[]> => {
  const r = await pool.query(
    `SELECT a.bank_entry_id, TO_CHAR(b.fecha, 'YYYY-MM-DD') AS fecha,
            SUM(a.monto_aplicado)::numeric AS monto, MIN(a.voucher_id) AS voucher_id
       FROM bank_entry_applications a
       JOIN bank_statement_entries b ON b.id = a.bank_entry_id
      WHERE a.reversed_at IS NULL
        AND (a.payment_order_id = $1 OR a.payment_reference = $2)
      GROUP BY a.bank_entry_id, b.fecha
      ORDER BY b.fecha, a.bank_entry_id`,
    [ordenId, referencia]
  );
  return r.rows.map((x: any) => ({
    bankEntryId: Number(x.bank_entry_id), fecha: String(x.fecha),
    monto: Math.round(Number(x.monto) * 100) / 100, voucherId: x.voucher_id ? Number(x.voucher_id) : null,
  }));
};

/** ¿Qué pagos de esta orden se pueden facturar AHORA? */
export const evaluarFacturable = async (ordenId: number): Promise<EvaluacionFactura> => {
  await ensureColumnasFactura();
  const o = await pool.query(
    `SELECT id, payment_reference, payment_method, amount, user_id, status,
            TO_CHAR(paid_at AT TIME ZONE 'America/Monterrey', 'YYYY-MM-DD') AS pagado,
            TO_CHAR(credit_settled_at AT TIME ZONE 'America/Monterrey', 'YYYY-MM-DD') AS liquidado
       FROM pobox_payments WHERE id = $1`, [ordenId]);
  const row = o.rows[0];
  if (!row) return { ok: false, motivo: 'Orden no encontrada' };
  const orden: OrdenFacturable = {
    id: Number(row.id), referencia: String(row.payment_reference || row.id),
    metodo: String(row.payment_method || '').toLowerCase(), monto: Number(row.amount) || 0,
    userId: row.user_id ? Number(row.user_id) : null,
  };
  if (!['completed', 'paid'].includes(String(row.status))) {
    return { ok: false, espera: true, motivo: 'La orden todavía no está pagada', orden };
  }

  const depositos = await depositosDeOrden(orden.id, orden.referencia);
  let candidatos: PagoPorFacturar[];

  if (orden.metodo === 'transferencia' || (orden.metodo === 'credit' && depositos.length > 0)) {
    if (depositos.length === 0) {
      return { ok: false, espera: true, orden,
        motivo: 'La transferencia todavía no está conciliada con el estado de cuenta: se factura cuando aparezca el depósito.' };
    }
    candidatos = depositos;
  } else {
    const fecha = orden.metodo === 'credit' ? row.liquidado : row.pagado;
    if (!fecha) {
      return { ok: false, espera: true, orden,
        motivo: orden.metodo === 'credit' ? 'El crédito todavía no se liquida.' : 'El pago no tiene fecha registrada.' };
    }
    candidatos = [{ bankEntryId: null, fecha, monto: orden.monto, voucherId: null }];
  }

  // Quitar los pagos que ya tienen factura vigente.
  const yaFacturados = await pool.query(
    `SELECT bank_entry_id FROM facturas_emitidas
      WHERE (payment_reference = $1 OR payment_id = $1 OR payment_id = $2)
        AND COALESCE(status, 'valid') <> 'canceled' AND canceled_at IS NULL`,
    [orden.referencia, String(orden.id)]);
  const entradasFacturadas = new Set(yaFacturados.rows.map((x: any) => x.bank_entry_id).filter(Boolean).map(Number));
  const hayFacturaSinDeposito = yaFacturados.rows.some((x: any) => !x.bank_entry_id);
  const pendientes = candidatos.filter(c => c.bankEntryId
    ? !entradasFacturadas.has(c.bankEntryId)
    : !hayFacturaSinDeposito);

  if (pendientes.length === 0) {
    return { ok: false, orden, motivo: 'Todos los pagos de esta orden ya están facturados.' };
  }

  const mes = mesActualMty();
  const porFacturar = pendientes.filter(p => p.fecha.slice(0, 7) === mes);
  const bloqueados = pendientes.filter(p => p.fecha.slice(0, 7) !== mes);

  if (porFacturar.length === 0) {
    const f = bloqueados.map(b => fechaLegible(b.fecha)).join(', ');
    return { ok: false, mesCerrado: true, orden,
      motivo: `El pago es de un mes anterior (${f}): ya no se puede facturar.` };
  }
  return { ok: true, orden, porFacturar, bloqueados };
};

/** Marca la orden como facturada cuando la suma facturada cubre su monto. */
export const actualizarEstadoFacturada = async (ordenId: number, referencia: string, monto: number, ultimoUuid?: string | null): Promise<boolean> => {
  const s = await pool.query(
    `SELECT COALESCE(SUM(total), 0)::numeric AS facturado FROM facturas_emitidas
      WHERE (payment_reference = $1 OR payment_id = $1 OR payment_id = $2)
        AND COALESCE(status, 'valid') <> 'canceled' AND canceled_at IS NULL`,
    [referencia, String(ordenId)]);
  const completa = Number(s.rows[0]?.facturado || 0) >= monto - 1;
  await pool.query(
    `UPDATE pobox_payments SET facturada = $1, factura_uuid = COALESCE($2, factura_uuid),
            factura_created_at = CASE WHEN $1 THEN COALESCE(factura_created_at, NOW()) ELSE factura_created_at END,
            factura_error = NULL
      WHERE id = $3`,
    [completa, ultimoUuid || null, ordenId]);
  return completa;
};
