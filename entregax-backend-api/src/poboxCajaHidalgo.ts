/**
 * CAJA CHICA DE MOSTRADOR HIDALGO TX (PO Box)
 *
 * El módulo "Control de Caja Chica" del panel PO Box leía
 * `caja_chica_transacciones`, que es la caja general de la empresa: ahí salían
 * egresos de millones que no tienen nada que ver con la operación de Hidalgo.
 *
 * La caja que corresponde ya existe: la billetera de sucursal
 * (`petty_cash_wallets` con owner_type='branch') asignada a Mostrador Hidalgo
 * TX. Aquí se expone esa billetera —saldo, movimientos y totales del día— para
 * el personal de la sucursal, sin darles acceso al panel de tesorería completo.
 */
import { Request, Response } from 'express';
import { pool } from './db';

const CODIGO_SUCURSAL = 'HGO';

/** Billetera de la sucursal de Hidalgo. Devuelve null si no está dada de alta. */
async function billeteraHidalgo(): Promise<any | null> {
  const r = await pool.query(
    `SELECT w.id, w.balance_mxn, w.currency, w.branch_id, b.name AS sucursal, b.code
       FROM petty_cash_wallets w
       JOIN branches b ON b.id = w.branch_id
      WHERE w.owner_type = 'branch' AND b.code = $1
      LIMIT 1`, [CODIGO_SUCURSAL]);
  return r.rows[0] || null;
}

/**
 * GET /api/pobox/caja-hidalgo
 * Saldo, totales del día y últimos movimientos de la caja de Hidalgo TX.
 */
export const cajaHidalgo = async (req: Request, res: Response): Promise<any> => {
  try {
    const w = await billeteraHidalgo();
    if (!w) {
      return res.status(404).json({
        error: 'La sucursal Mostrador Hidalgo TX no tiene caja chica dada de alta.',
      });
    }
    const limite = Math.min(200, Math.max(10, parseInt(String(req.query.limit || '50')) || 50));

    const movs = await pool.query(`
      SELECT m.id, m.movement_type, m.category, m.amount_mxn, m.currency, m.concept,
             m.status, m.created_at, m.evidence_url, m.pieces,
             u.full_name AS registrado_por
        FROM petty_cash_movements m
        LEFT JOIN users u ON u.id = m.created_by
       WHERE m.wallet_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`, [w.id, limite]);

    // Totales del día. 'fund' e 'income' entran a la caja; 'expense' sale.
    // Los rechazados no cuentan: nunca movieron dinero.
    const hoy = await pool.query(`
      SELECT COALESCE(currency, 'MXN') AS moneda,
             COALESCE(SUM(CASE WHEN movement_type IN ('fund','income') THEN amount_mxn ELSE 0 END), 0) AS ingresos,
             COALESCE(SUM(CASE WHEN movement_type = 'expense' THEN amount_mxn ELSE 0 END), 0) AS egresos,
             COUNT(*)::int AS movimientos
        FROM petty_cash_movements
       WHERE wallet_id = $1
         AND COALESCE(status, 'approved') <> 'rejected'
         AND (created_at AT TIME ZONE 'America/Monterrey')::date = (NOW() AT TIME ZONE 'America/Monterrey')::date
       GROUP BY 1`, [w.id]);

    const porMoneda: Record<string, any> = {};
    for (const f of hoy.rows) {
      porMoneda[f.moneda] = {
        ingresos: Number(f.ingresos) || 0,
        egresos: Number(f.egresos) || 0,
        movimientos: Number(f.movimientos) || 0,
      };
    }

    res.json({
      caja: {
        wallet_id: w.id,
        sucursal: w.sucursal,
        codigo: w.code,
        // Hidalgo TX opera en DÓLARES: la columna se llama balance_mxn por
        // herencia, pero la moneda real es la de la sucursal.
        saldo: Number(w.balance_mxn) || 0,
        moneda: w.currency || 'MXN',
      },
      hoy: {
        MXN: porMoneda.MXN || { ingresos: 0, egresos: 0, movimientos: 0 },
        USD: porMoneda.USD || { ingresos: 0, egresos: 0, movimientos: 0 },
      },
      movimientos: movs.rows.map((m: any) => ({
        id: m.id,
        tipo: m.movement_type,
        categoria: m.category,
        monto: Number(m.amount_mxn) || 0,
        // Los movimientos viejos quedaron con el default 'MXN' aunque la caja
        // sea de dólares; se muestra la moneda de la caja para no leer 60
        // dólares de gasolina como 60 pesos.
        moneda: w.currency || m.currency || 'MXN',
        concepto: m.concept,
        estado: m.status,
        registrado_por: m.registrado_por,
        fecha: m.created_at,
        evidencia: m.evidence_url,
      })),
    });
  } catch (e: any) {
    console.error('[caja-hidalgo]', e);
    res.status(500).json({ error: 'No se pudo cargar la caja de Hidalgo' });
  }
};

/**
 * Registra en la caja de Hidalgo el efectivo cobrado en el mostrador.
 *
 * Se llama desde el cobro de "Cobrar y Entregar": sin esto el billete entraba
 * al cajón pero la caja de la sucursal no se enteraba, y el corte no cuadraba.
 * No revienta la operación si falla — el cobro ya quedó registrado en el
 * historial de la orden — pero deja el error con el monto para poder repararlo.
 */
export async function registrarCobroEnCajaHidalgo(opts: {
  monto: number; moneda?: string; concepto: string; referencia?: string | null; creadoPor?: number | null;
}): Promise<number | null> {
  try {
    const monto = Math.round((Number(opts.monto) || 0) * 100) / 100;
    if (!(monto > 0)) return null;
    const w = await billeteraHidalgo();
    if (!w) {
      console.error(`🚨 [caja-hidalgo] No hay billetera para ${CODIGO_SUCURSAL}: $${monto} sin registrar`);
      return null;
    }
    const moneda = String(opts.moneda || 'MXN').toUpperCase() === 'USD' ? 'USD' : 'MXN';
    const r = await pool.query(`
      INSERT INTO petty_cash_movements
        (wallet_id, movement_type, category, amount_mxn, currency, concept, status, branch_id, created_by, reviewed_at)
      VALUES ($1, 'income', 'cobro_mostrador', $2, $3, $4, 'approved', $5, $6, NOW())
      RETURNING id`,
      [w.id, monto, moneda, opts.concepto, w.branch_id, opts.creadoPor ?? null]);
    // El saldo de la billetera está en la moneda de la sucursal — Hidalgo TX
    // opera en DÓLARES. Solo se suma cuando el efectivo entró en esa misma
    // moneda; un cobro en la otra queda registrado como movimiento pero no
    // altera un saldo que está en otra divisa.
    const monedaCaja = String(w.currency || 'MXN').toUpperCase();
    if (moneda === monedaCaja) {
      await pool.query(
        `UPDATE petty_cash_wallets SET balance_mxn = COALESCE(balance_mxn,0) + $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [w.id, monto]);
    }
    console.log(`💵 [caja-hidalgo] Ingreso de $${monto} ${moneda} registrado (${opts.referencia || 's/ref'})`);
    return r.rows[0]?.id || null;
  } catch (e: any) {
    console.error(`🚨 [caja-hidalgo] No se pudo registrar el cobro de $${opts.monto}:`, e?.message);
    return null;
  }
}
