/**
 * Bitácora de la línea de crédito.
 *
 * `user_service_credits.used_credit` se movía con UPDATEs pelones: sin renglón,
 * sin concepto y sin quién. Cuando a un cliente le sobraron $10,000 de deuda no
 * hubo forma de contestar de dónde salieron — no porque no se buscara, sino
 * porque el evento no dejó huella en ninguna tabla (tarea 522).
 *
 * Aquí queda el renglón. Es un REGISTRO, no el movimiento: quien mueve el
 * crédito sigue siendo cada flujo con su propio UPDATE, y esta función se llama
 * justo después. Por eso nunca tumba una operación de dinero — si la anotación
 * falla, se pierde el renglón y se grita en el log, jamás el abono.
 */
import { Pool, PoolClient } from 'pg';
import { pool } from './db';

type Db = Pool | PoolClient;

export type MovimientoCredito =
  /** Se creó una orden pagada a crédito. */
  | 'consumo_orden'
  /** Se aplicó crédito a una orden que ya existía. */
  | 'credito_aplicado'
  /** Compra a crédito directa (factura), sin orden de pago. */
  | 'compra_credito'
  /** El cliente abonó a su línea desde el monedero. */
  | 'liquidacion'
  /** Pagó de más y el sobrante bajó su deuda. */
  | 'excedente'
  /** La orden se liquidó y se le devuelve el cupo. */
  | 'restauracion'
  /** Se canceló la orden o se revirtió el crédito aplicado. */
  | 'reverso'
  /** Corrección autorizada a mano. Siempre con el motivo en el concepto. */
  | 'ajuste';

let listaTabla = false;

/** Crea la tabla la primera vez. Idempotente y barata después. */
async function asegurarTabla(db: Db): Promise<void> {
  if (listaTabla) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS credito_movimientos (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      service       VARCHAR(40) NOT NULL,
      movimiento    VARCHAR(30) NOT NULL,
      -- Con signo: positivo consume cupo (sube la deuda), negativo lo devuelve.
      monto         NUMERIC(14,2) NOT NULL,
      usado_antes   NUMERIC(14,2),
      usado_despues NUMERIC(14,2),
      concepto      TEXT,
      orden_ref     VARCHAR(60),
      orden_id      INTEGER,
      actor_id      INTEGER,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_credito_mov_user
       ON credito_movimientos (user_id, service, id DESC)`);
  listaTabla = true;
}

/**
 * Anota un movimiento de crédito. Se llama DESPUÉS del UPDATE que lo aplicó:
 * lee el `used_credit` que quedó y deduce el anterior con el propio monto, así
 * el renglón queda cuadrado sin volver a tocar el saldo.
 *
 * `monto` va con signo: + consume cupo, − lo devuelve.
 */
export async function anotarMovimientoCredito(
  db: Db,
  opts: {
    userId: number;
    servicio: string | null | undefined;
    monto: number;
    movimiento: MovimientoCredito;
    concepto?: string | null;
    ordenRef?: string | null;
    ordenId?: number | null;
    actorId?: number | null;
  }
): Promise<void> {
  const { userId, servicio, monto, movimiento } = opts;
  // Sin servicio no hay línea que explicar, y un monto en cero no es un
  // movimiento. Se ignora en silencio para no ensuciar la bitácora.
  if (!userId || !servicio || !Number.isFinite(monto) || Math.abs(monto) < 0.005) return;

  try {
    await asegurarTabla(db);
    const r = await db.query(
      `SELECT COALESCE(used_credit, 0)::numeric AS usado
         FROM user_service_credits WHERE user_id = $1 AND service = $2`,
      [userId, servicio]
    );
    const despues = r.rows[0] ? Number(r.rows[0].usado) : null;
    const antes = despues == null ? null : +(despues - monto).toFixed(2);

    await db.query(
      `INSERT INTO credito_movimientos
         (user_id, service, movimiento, monto, usado_antes, usado_despues,
          concepto, orden_ref, orden_id, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, servicio, movimiento, +monto.toFixed(2), antes, despues,
       opts.concepto ?? null, opts.ordenRef ?? null, opts.ordenId ?? null, opts.actorId ?? null]
    );
  } catch (e: any) {
    // Nunca tumba la operación: el dinero ya se movió, lo que se pierde es el
    // renglón. Se grita para que se vea en vez de desaparecer.
    console.error(
      `🚨 [CREDITO] no pude anotar el movimiento (user ${userId}, ${servicio}, ` +
      `${monto > 0 ? '+' : ''}${monto}, ${movimiento}):`, e?.message
    );
  }
}

/**
 * Estado de cuenta de una línea de crédito: los movimientos y si la deuda que
 * marca `user_service_credits` cuadra con la suma de la bitácora.
 *
 * El descuadre solo abarca lo que ya quedó anotado — los movimientos anteriores
 * a la bitácora no existen, así que el arranque siempre trae una diferencia.
 */
export async function estadoDeCuentaCredito(
  userId: number, servicio: string
): Promise<{
  usado_actual: number;
  suma_movimientos: number;
  movimientos: any[];
}> {
  await asegurarTabla(pool);
  const [linea, movs] = await Promise.all([
    pool.query(
      `SELECT COALESCE(used_credit,0)::numeric AS usado
         FROM user_service_credits WHERE user_id = $1 AND service = $2`,
      [userId, servicio]),
    pool.query(
      `SELECT id, movimiento, monto, usado_antes, usado_despues, concepto,
              orden_ref, orden_id, actor_id, created_at
         FROM credito_movimientos
        WHERE user_id = $1 AND service = $2
        ORDER BY id DESC LIMIT 200`,
      [userId, servicio]),
  ]);
  const suma = movs.rows.reduce((n: number, m: any) => n + Number(m.monto), 0);
  return {
    usado_actual: Number(linea.rows[0]?.usado || 0),
    suma_movimientos: +suma.toFixed(2),
    movimientos: movs.rows,
  };
}
