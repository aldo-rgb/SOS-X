/**
 * LEDGER DE APLICACIÓN DE ABONOS BANCARIOS
 *
 * Hasta ahora el estado de cuenta y las órdenes de pago vivían separados:
 * autorizar una orden la marcaba pagada pero NO dejaba ninguna marca sobre el
 * abono que la respaldó. Consecuencias:
 *   · en el estado de cuenta no había forma de saber qué movimientos ya se
 *     usaron y cuáles siguen libres;
 *   · el mismo depósito podía respaldar dos órdenes distintas sin que nada
 *     avisara — la puerta para el cliente que sube un comprobante sin
 *     referencia y lo cobra dos veces.
 *
 * Esto lo resuelve con una tabla puente en vez de una bandera, porque la
 * relación es de muchos a muchos: un depósito puede cubrir varias guías y una
 * orden puede recibir varios depósitos (los pagos parciales ya existen). Al
 * guardar el MONTO aplicado, el candado deja de ser una bandera y pasa a ser
 * aritmética: no se puede aplicar más de lo que entró al banco.
 *
 *     disponible(movimiento) = abono − Σ aplicaciones vigentes
 *
 * El ledger arranca vacío y solo se llena de aquí en adelante. Los movimientos
 * anteriores se ven como disponibles, que es lo honesto: nadie registró contra
 * qué se aplicaron.
 */

import { pool } from './db';
import type { PoolClient } from 'pg';

/** Redondeo a centavos: evita que 0.1 + 0.2 deje un residuo que bloquee un abono exacto. */
const cents = (n: any): number => Math.round((Number(n) || 0) * 100) / 100;

/** dd-mm-aaaa, sin pasar por toISOString: la fecha es naive y se recorrería. */
const fechaCorta = (d: any): string => {
  const f = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(f.getTime())) return String(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(f.getDate())}-${p(f.getMonth() + 1)}-${f.getFullYear()}`;
};

export type OrigenAplicacion =
  | 'estado_cuenta'      // autorización manual desde Dashboard Cobranza
  | 'auto_syncfy'        // auto-match del cron bancario
  | 'comprobante_manual' // aprobación de un comprobante subido por el cliente
  | 'override_admin';    // super_admin autorizó sin ligar movimiento

let schemaLista = false;

/**
 * Crea la tabla la primera vez. Idempotente: se puede llamar en cada request.
 *
 * `syncfy_transaction_id` se agrega a bank_statement_entries porque el
 * auto-match trabaja sobre syncfy_transactions y sin ese puente no había cómo
 * llegar a la fila del estado de cuenta que le corresponde.
 */
export async function ensureLedgerSchema(): Promise<void> {
  if (schemaLista) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bank_entry_applications (
      id                  SERIAL PRIMARY KEY,
      bank_entry_id       INTEGER NOT NULL REFERENCES bank_statement_entries(id) ON DELETE CASCADE,
      payment_order_id    INTEGER,
      payment_reference   VARCHAR(60),
      voucher_id          INTEGER,
      monto_aplicado      NUMERIC(14,2) NOT NULL CHECK (monto_aplicado > 0),
      origen              VARCHAR(30) NOT NULL,
      aplicado_por        INTEGER,
      aplicado_por_nombre VARCHAR(160),
      nota                TEXT,
      created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
      -- Revertir NO borra: se marca. Un pago revertido tiene que dejar rastro
      -- de que en su momento sí ocupó ese abono.
      reversed_at         TIMESTAMP,
      reversed_by         INTEGER,
      reversed_motivo     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bea_entry
      ON bank_entry_applications (bank_entry_id) WHERE reversed_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_bea_order
      ON bank_entry_applications (payment_order_id) WHERE reversed_at IS NULL;
    ALTER TABLE bank_statement_entries
      ADD COLUMN IF NOT EXISTS syncfy_transaction_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_bse_syncfy_tx
      ON bank_statement_entries (syncfy_transaction_id);
  `);
  schemaLista = true;
}

export type SaldoEntry = {
  entry_id: number;
  abono: number;
  aplicado: number;
  disponible: number;
  fecha: string | null;
  concepto: string | null;
  referencia: string | null;
};

/**
 * Cuánto queda libre de un movimiento.
 *
 * `bloquear` toma el candado de la fila (FOR UPDATE) para que dos
 * autorizaciones simultáneas no lean el mismo disponible y apliquen las dos:
 * sin eso el candado se puede burlar mandando las dos peticiones a la vez.
 * Solo se puede usar dentro de una transacción.
 */
export async function saldoDisponible(
  client: PoolClient | typeof pool,
  entryId: number,
  bloquear = false
): Promise<SaldoEntry | null> {
  const e = await client.query(
    `SELECT id, abono, fecha, concepto, referencia
       FROM bank_statement_entries
      WHERE id = $1
      ${bloquear ? 'FOR UPDATE' : ''}`,
    [entryId]
  );
  if (e.rows.length === 0) return null;
  const row = e.rows[0];

  const a = await client.query(
    `SELECT COALESCE(SUM(monto_aplicado), 0) AS aplicado
       FROM bank_entry_applications
      WHERE bank_entry_id = $1 AND reversed_at IS NULL`,
    [entryId]
  );

  const abono = cents(row.abono);
  const aplicado = cents(a.rows[0].aplicado);
  return {
    entry_id: entryId,
    abono,
    aplicado,
    disponible: cents(abono - aplicado),
    // El driver devuelve un Date, y String(Date) da "Tue Aug 25 2026..." — que
    // es lo que acababa saliendo en el mensaje de error al usuario.
    fecha: row.fecha ? fechaCorta(row.fecha) : null,
    concepto: row.concepto,
    referencia: row.referencia,
  };
}

export class AbonoAgotadoError extends Error {
  constructor(public saldo: SaldoEntry, public intento: number) {
    super(
      saldo.disponible <= 0
        ? `El movimiento del ${saldo.fecha} por $${saldo.abono.toFixed(2)} ya se aplicó completo a otra(s) orden(es).`
        : `Del movimiento del ${saldo.fecha} solo quedan $${saldo.disponible.toFixed(2)} disponibles y se intentan aplicar $${intento.toFixed(2)}.`
    );
    this.name = 'AbonoAgotadoError';
  }
}

/**
 * Aplica un abono a una orden. Truena si no alcanza — ese es el candado.
 *
 * Debe correr DENTRO de la transacción que marca la orden pagada, para que si
 * algo falla después no quede el abono ocupado por una orden que no se pagó.
 */
export async function aplicarAbono(
  client: PoolClient,
  datos: {
    bankEntryId: number;
    montoAplicado: number;
    origen: OrigenAplicacion;
    paymentOrderId?: number | null;
    paymentReference?: string | null;
    voucherId?: number | null;
    aplicadoPor?: number | null;
    aplicadoPorNombre?: string | null;
    nota?: string | null;
  }
): Promise<{ id: number; disponible_restante: number }> {
  const monto = cents(datos.montoAplicado);
  if (monto <= 0) throw new Error('El monto a aplicar debe ser mayor a cero.');

  const saldo = await saldoDisponible(client, datos.bankEntryId, true);
  if (!saldo) throw new Error(`El movimiento bancario #${datos.bankEntryId} no existe.`);
  if (saldo.abono <= 0) throw new Error('Ese movimiento es un cargo, no un abono: no puede respaldar un pago.');
  // Tolerancia de un centavo por el redondeo del banco.
  if (monto > cents(saldo.disponible + 0.01)) throw new AbonoAgotadoError(saldo, monto);

  const r = await client.query(
    `INSERT INTO bank_entry_applications
       (bank_entry_id, payment_order_id, payment_reference, voucher_id,
        monto_aplicado, origen, aplicado_por, aplicado_por_nombre, nota)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      datos.bankEntryId,
      datos.paymentOrderId ?? null,
      datos.paymentReference ?? null,
      datos.voucherId ?? null,
      monto,
      datos.origen,
      datos.aplicadoPor ?? null,
      datos.aplicadoPorNombre ?? null,
      datos.nota ?? null,
    ]
  );
  return { id: Number(r.rows[0].id), disponible_restante: cents(saldo.disponible - monto) };
}

/**
 * Libera los abonos de una orden al revertirla, para que el dinero vuelva a
 * quedar disponible. Sin esto, revertir un pago dejaría el abono ocupado para
 * siempre y el dinero real quedaría inutilizable.
 */
export async function revertirPorOrden(
  client: PoolClient,
  paymentOrderId: number,
  motivo: string,
  userId?: number | null
): Promise<number> {
  const r = await client.query(
    `UPDATE bank_entry_applications
        SET reversed_at = NOW(), reversed_by = $2, reversed_motivo = $3
      WHERE payment_order_id = $1 AND reversed_at IS NULL
      RETURNING id`,
    [paymentOrderId, userId ?? null, motivo]
  );
  return r.rowCount || 0;
}

/**
 * Libera el abono que respaldaba un comprobante cuando éste se rechaza. Sin
 * esto, rechazar un comprobante ya aprobado dejaría el depósito ocupado por un
 * pago que se deshizo, y ese dinero real quedaría imposible de conciliar.
 */
export async function revertirPorVoucher(
  client: PoolClient,
  voucherId: number,
  motivo: string,
  userId?: number | null
): Promise<number> {
  const r = await client.query(
    `UPDATE bank_entry_applications
        SET reversed_at = NOW(), reversed_by = $2, reversed_motivo = $3
      WHERE voucher_id = $1 AND reversed_at IS NULL
      RETURNING id`,
    [voucherId, userId ?? null, motivo]
  );
  return r.rowCount || 0;
}

export type EstadoEntry = {
  entry_id: number;
  abono: number;
  aplicado: number;
  disponible: number;
  estado: 'libre' | 'parcial' | 'usado';
  ordenes: { referencia: string | null; monto: number; origen: string; fecha: string | null }[];
};

/**
 * Estado de conciliación de un conjunto de movimientos, para pintar el estado
 * de cuenta. Una sola consulta para toda la página: pedirlo por fila serían
 * cientos de viajes a la base.
 */
export async function estadoDeEntries(
  entryIds: number[],
  // Sin esto la función leería SIEMPRE del pool y no vería las aplicaciones de
  // la transacción en curso: devolvería "libre" un abono que se acaba de
  // ocupar. Quien la llame dentro de una transacción debe pasar su client.
  client?: PoolClient
): Promise<Record<number, EstadoEntry>> {
  if (!entryIds.length) return {};
  await ensureLedgerSchema();
  const db = client ?? pool;
  const r = await db.query(
    `SELECT b.id AS entry_id,
            COALESCE(b.abono, 0) AS abono,
            COALESCE(SUM(a.monto_aplicado), 0) AS aplicado,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'referencia', a.payment_reference,
                  'monto', a.monto_aplicado,
                  'origen', a.origen,
                  'fecha', TO_CHAR(a.created_at, 'DD-MM-YYYY')
                ) ORDER BY a.created_at
              ) FILTER (WHERE a.id IS NOT NULL),
              '[]'::json
            ) AS ordenes
       FROM bank_statement_entries b
       LEFT JOIN bank_entry_applications a
              ON a.bank_entry_id = b.id AND a.reversed_at IS NULL
      WHERE b.id = ANY($1::int[])
      GROUP BY b.id, b.abono`,
    [entryIds]
  );

  const out: Record<number, EstadoEntry> = {};
  for (const row of r.rows) {
    const abono = cents(row.abono);
    const aplicado = cents(row.aplicado);
    const disponible = cents(abono - aplicado);
    out[Number(row.entry_id)] = {
      entry_id: Number(row.entry_id),
      abono,
      aplicado,
      disponible,
      // Un centavo de holgura: un abono aplicado al 99.99% está usado, no parcial.
      estado: aplicado <= 0 ? 'libre' : disponible <= 0.01 ? 'usado' : 'parcial',
      ordenes: Array.isArray(row.ordenes) ? row.ordenes : [],
    };
  }
  return out;
}

/**
 * Traduce una transacción de Syncfy a su fila del estado de cuenta.
 *
 * El auto-match trabaja sobre syncfy_transactions, pero el ledger vive sobre
 * bank_statement_entries. Las transacciones nuevas ya guardan el puente
 * directo; para las que se insertaron antes de que existiera la columna se cae
 * a emparejar por empresa + fecha + monto, que es lo que las hace únicas en la
 * práctica. Si el emparejamiento es ambiguo devuelve null en vez de adivinar:
 * más vale no registrar la aplicación que registrarla contra el movimiento
 * equivocado.
 */
export async function entryDeSyncfyTx(syncfyTxId: number): Promise<number | null> {
  await ensureLedgerSchema();
  const directo = await pool.query(
    `SELECT id FROM bank_statement_entries WHERE syncfy_transaction_id = $1 LIMIT 1`,
    [syncfyTxId]
  );
  if (directo.rows.length) return Number(directo.rows[0].id);

  const tx = await pool.query(
    `SELECT emitter_id, value_date, accounting_date, amount FROM syncfy_transactions WHERE id = $1`,
    [syncfyTxId]
  );
  if (!tx.rows.length) return null;
  const t = tx.rows[0];
  const fecha = t.value_date || t.accounting_date;
  if (!fecha) return null;

  const cand = await pool.query(
    `SELECT id FROM bank_statement_entries
      WHERE empresa_id = $1
        AND fecha = $2::date
        AND abono IS NOT NULL
        AND ABS(CAST(abono AS numeric) - $3::numeric) < 0.01
        AND syncfy_transaction_id IS NULL`,
    [t.emitter_id, fecha, Math.abs(Number(t.amount) || 0)]
  );
  if (cand.rowCount !== 1) return null;

  const entryId = Number(cand.rows[0].id);
  // Se deja el puente escrito para no repetir la búsqueda difusa.
  await pool.query(
    `UPDATE bank_statement_entries SET syncfy_transaction_id = $1 WHERE id = $2`,
    [syncfyTxId, entryId]
  );
  return entryId;
}
