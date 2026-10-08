/**
 * FONDEO DE CARTERA GENERAL
 *
 * El monedero general (`users.wallet_balance`) sirve para cualquier servicio,
 * pero hasta ahora no había forma de meterle dinero: la CLABE virtual de
 * Openpay nunca se aprovisionó y el único camino era que un admin lo capturara
 * a mano. Este archivo le da al cliente una REFERENCIA FIJA —una sola, que no
 * cambia nunca— para depositar cuando quiera, y engancha esos depósitos al
 * conciliador que ya existe.
 *
 * NO hay orden de pago de por medio. Una orden existe porque alguien cobra algo
 * concreto —unas guías, un flete— y nace antes que el dinero. Un fondeo es al
 * revés: el cliente manda lo que quiere, cuando quiere, y lo único que hay que
 * saber es de quién es. Por eso la referencia es lo único que se conserva y el
 * abono entra directo al monedero.
 *
 * Cómo encaja con lo que ya había:
 *   · La referencia vive con el usuario (`wallet_funding_references`) y no
 *     cambia nunca. El cliente la ve siempre en su monedero, como si fuera su
 *     CLABE, y puede depositar diez veces con la misma.
 *   · Cada depósito acreditado queda en `wallet_funding_deposits`, que además
 *     es el candado contra el doble abono: un mismo movimiento bancario (o una
 *     misma transacción de Syncfy) no puede acreditarse dos veces.
 *   · La empresa a cuya cuenta deposita se configura como cualquier otro
 *     servicio, en Fiscal → Configuración de servicios (service_company_config).
 *
 * OJO: esto abona al monedero GENERAL. Es otra bolsa que el saldo a favor por
 * servicio de `billetera_servicio` (ver saldoFavorServicio.ts), que solo se
 * puede gastar en el servicio que lo generó.
 */
import { Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';

/** Clave del servicio en el catálogo de empresas (service_company_config). */
export const SERVICIO_CARTERA = 'CARTERA_GENERAL';

/**
 * Prefijo propio en vez de las iniciales de la empresa emisora.
 *
 * Las referencias de orden nacen con las iniciales de quien cobra (RO-, UW-…),
 * pero el fondeo no pertenece a ningún servicio: lo que lo identifica es que va
 * a la cartera. Un prefijo dedicado además hace la rama del conciliador
 * inequívoca —SAF- solo puede ser fondeo— y se lee solo en el estado de cuenta.
 */
export const PREFIJO_CARTERA = 'SAF';

/** ¿La referencia tiene forma de fondeo? Chequeo barato, sin tocar la base. */
export const esReferenciaDeFondeo = (ref: string): boolean =>
  String(ref || '').trim().toUpperCase().startsWith(`${PREFIJO_CARTERA}-`);

let schemaListo = false;

/** Crea la tabla de referencias y da de alta el servicio en el catálogo de empresas. */
export async function ensureFundingSchema(): Promise<void> {
  if (schemaListo) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_funding_references (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      reference VARCHAR(16) NOT NULL UNIQUE,
      habilitada BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`ALTER TABLE wallet_funding_references ADD COLUMN IF NOT EXISTS habilitada BOOLEAN DEFAULT FALSE`).catch(() => {});
  // Historial de fondeos y candado contra el doble abono. Los índices únicos
  // parciales son el candado real: el mismo movimiento del estado de cuenta, o
  // la misma transacción de Syncfy, no pueden acreditarse dos veces aunque el
  // contador vuelva a pegar el estado de cuenta o el cron reprocese el día.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_funding_deposits (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reference VARCHAR(16) NOT NULL,
      monto NUMERIC(12,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'MXN',
      origen VARCHAR(24) NOT NULL,
      bank_entry_id INTEGER,
      syncfy_tx_id INTEGER,
      saldo_despues NUMERIC(12,2),
      nota TEXT,
      caja_tx_id INTEGER,
      created_by INTEGER,
      created_by_nombre TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Instalaciones que ya crearon la tabla sin la columna.
  await pool.query(`ALTER TABLE wallet_funding_deposits ADD COLUMN IF NOT EXISTS caja_tx_id INTEGER`).catch(() => {});
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_wfd_bank_entry
                      ON wallet_funding_deposits (bank_entry_id) WHERE bank_entry_id IS NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_wfd_syncfy_tx
                      ON wallet_funding_deposits (syncfy_tx_id) WHERE syncfy_tx_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wfd_user ON wallet_funding_deposits (user_id, created_at DESC)`);
  // El renglón hace que la empresa aparezca sola en Fiscal → Configuración de
  // servicios, con el mismo selector del catálogo que usan los demás servicios.
  // Los ::varchar no son adorno: sin ellos Postgres intenta deducir el tipo de
  // $1 a la vez desde la lista del SELECT y desde la comparación del WHERE, y
  // responde "inconsistent types deduced for parameter $1". La función entera
  // reventaba por esto y el 500 se comía la referencia del cliente.
  await pool.query(`
    INSERT INTO service_company_config (service_type, service_name, emitter_id, is_active)
    SELECT $1::varchar, 'Fondeo de Cartera General', NULL::integer, TRUE
     WHERE NOT EXISTS (SELECT 1 FROM service_company_config WHERE service_type = $1::varchar)
  `, [SERVICIO_CARTERA]);
  schemaListo = true;
}

/** Datos bancarios de la empresa que tiene asignado el fondeo de cartera. */
export async function empresaDeCartera(): Promise<any | null> {
  const r = await pool.query(
    `SELECT fe.id AS empresa_id, fe.alias AS company_name, fe.business_name AS legal_name,
            fe.rfc, fe.bank_name, fe.bank_clabe, fe.bank_account
       FROM service_company_config scc
       JOIN fiscal_emitters fe ON fe.id = scc.emitter_id
      WHERE scc.service_type = $1 AND scc.is_active = TRUE`,
    [SERVICIO_CARTERA]
  );
  return r.rows[0] || null;
}

/**
 * Referencia fija del cliente. Se genera la primera vez que la pide y a partir
 * de ahí es siempre la misma: el cliente la guarda en su banco como
 * destinatario frecuente, así que cambiarla rompería sus transferencias
 * programadas.
 */
export async function obtenerOCrearReferencia(userId: number): Promise<string> {
  await ensureFundingSchema();
  const existente = await pool.query(
    `SELECT reference FROM wallet_funding_references WHERE user_id = $1`, [userId]);
  if (existente.rows.length > 0) return String(existente.rows[0].reference);

  // Se reintenta por si dos peticiones simultáneas sacan el mismo hex.
  for (let intento = 0; intento < 5; intento++) {
    const ref = `${PREFIJO_CARTERA}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const r = await pool.query(
      `INSERT INTO wallet_funding_references (user_id, reference)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET reference = wallet_funding_references.reference
       RETURNING reference`,
      [userId, ref]
    ).catch((e: any) => {
      if (String(e?.code) === '23505') return null; // choque de reference
      throw e;
    });
    if (r) return String(r.rows[0].reference);
  }
  throw new Error('No se pudo generar una referencia de fondeo única');
}

/** ¿Esta referencia bancaria es de fondeo de cartera? Devuelve el dueño. */
export async function buscarReferenciaFondeo(ref: string): Promise<{ userId: number; reference: string } | null> {
  const limpia = String(ref || '').trim().toUpperCase();
  if (!esReferenciaDeFondeo(limpia)) return null;
  await ensureFundingSchema();
  const r = await pool.query(
    `SELECT user_id, reference FROM wallet_funding_references WHERE reference = $1`, [limpia]);
  if (r.rows.length === 0) return null;
  return { userId: Number(r.rows[0].user_id), reference: String(r.rows[0].reference) };
}

/**
 * Acredita un depósito a la cartera general del cliente.
 *
 * Es todo el mecanismo: no hay orden que marcar pagada, ni guías, ni crédito
 * que restaurar, ni excedente que calcular —si el cliente manda de más, de más
 * se le abona—. Tampoco entra a caja chica como ingreso: el dinero del cliente
 * en su cartera es un pasivo, se vuelve venta cuando lo gasta en una orden.
 *
 * Idempotente por origen: si el movimiento bancario o la transacción de Syncfy
 * ya se acreditó, devuelve `duplicado` y no toca el saldo. Sin esto, volver a
 * pegar el estado de cuenta en Cobranza le regalaría el depósito otra vez.
 */
export async function acreditarFondeoCartera(
  db: any,
  datos: {
    userId: number;
    reference: string;
    monto: number;
    origen: 'estado_cuenta' | 'auto_syncfy' | 'manual';
    bankEntryId?: number | null;
    syncfyTxId?: number | null;
    actorId?: number | null;
    actorNombre?: string;
    nota?: string | null;
    /** Transacción de caja que respalda este fondeo, para poder revertirlo si se borra. */
    cajaTxId?: number | null;
  }
): Promise<{ nuevoSaldo: number; monto: number; duplicado: boolean; depositoId?: number }> {
  await ensureFundingSchema();
  const monto = Math.round((Number(datos.monto) || 0) * 100) / 100;
  if (!(monto > 0)) throw new Error('El monto del fondeo debe ser mayor a cero');
  if (!datos.userId) throw new Error('El fondeo no tiene cliente');

  const yaEsta = await db.query(
    `SELECT id FROM wallet_funding_deposits
      WHERE (bank_entry_id IS NOT NULL AND bank_entry_id = $1)
         OR (syncfy_tx_id IS NOT NULL AND syncfy_tx_id = $2)
      LIMIT 1`,
    [datos.bankEntryId ?? null, datos.syncfyTxId ?? null]
  );
  if (yaEsta.rows.length > 0) {
    const saldo = await db.query(`SELECT COALESCE(wallet_balance, 0) AS s FROM users WHERE id = $1`, [datos.userId]);
    return { nuevoSaldo: Number(saldo.rows[0]?.s) || 0, monto, duplicado: true, depositoId: Number(yaEsta.rows[0].id) };
  }

  const u = await db.query(
    `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1
      WHERE id = $2 RETURNING wallet_balance`,
    [monto, datos.userId]
  );
  if (u.rows.length === 0) throw new Error('Cliente no encontrado');
  const nuevoSaldo = Number(u.rows[0].wallet_balance) || 0;

  const dep = await db.query(
    `INSERT INTO wallet_funding_deposits
       (user_id, reference, monto, origen, bank_entry_id, syncfy_tx_id, caja_tx_id,
        saldo_despues, nota, created_by, created_by_nombre)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [datos.userId, datos.reference, monto, datos.origen,
     datos.bankEntryId ?? null, datos.syncfyTxId ?? null, datos.cajaTxId ?? null,
     nuevoSaldo, datos.nota ?? null, datos.actorId ?? null, datos.actorNombre ?? null]
  );

  // Mismo historial que ve el cliente para cualquier otro movimiento de su
  // monedero, para que el fondeo no viva en una tabla que nadie consulta.
  await db.query(
    `INSERT INTO financial_transactions
       (user_id, type, amount, balance_after, description, reference_id, reference_type, created_at)
     VALUES ($1, 'deposit_spei', $2, $3, $4, $5, 'wallet_funding', NOW())`,
    [datos.userId, monto, nuevoSaldo,
     `Fondeo de cartera general — referencia ${datos.reference}`, dep.rows[0].id]
  );

  console.log(`[CARTERA] +$${monto.toFixed(2)} a user ${datos.userId} (${datos.reference}, ${datos.origen}). Saldo: $${nuevoSaldo.toFixed(2)}`);
  return { nuevoSaldo, monto, duplicado: false, depositoId: Number(dep.rows[0].id) };
}

/**
 * Revierte el fondeo que respaldaba una transacción de caja.
 *
 * Existe por un descuadre que se cuela solo: si el cajero captura dos veces el
 * mismo efectivo, el super admin borra la transacción sobrante para cuadrar el
 * cajón — y sin esto la caja quedaba bien pero el cliente se quedaba con el
 * dinero abonado dos veces en su monedero.
 *
 * Si el cliente YA GASTÓ ese saldo, no se revierte: bajarlo dejaría el
 * monedero en negativo o le quitaría dinero que sí era suyo. En ese caso lanza
 * y quien borra tiene que decidir qué hacer, en vez de que el sistema elija
 * solo. `nuevoMonto` sirve para las correcciones de importe: revierte solo la
 * diferencia.
 */
export async function revertirFondeoDeCaja(
  db: any,
  cajaTxId: number,
  opts?: { nuevoMonto?: number; actorNombre?: string }
): Promise<{ revertido: number; nuevoSaldo: number } | null> {
  const d = await db.query(
    `SELECT id, user_id, reference, monto FROM wallet_funding_deposits
      WHERE caja_tx_id = $1 FOR UPDATE`,
    [cajaTxId]
  );
  if (d.rows.length === 0) return null; // no era un fondeo
  const dep = d.rows[0];

  const montoActual = Number(dep.monto) || 0;
  const destino = opts?.nuevoMonto != null ? Math.round(Number(opts.nuevoMonto) * 100) / 100 : 0;
  const aQuitar = Math.round((montoActual - destino) * 100) / 100;
  if (aQuitar === 0) return { revertido: 0, nuevoSaldo: 0 };

  const u = await db.query(
    `SELECT COALESCE(wallet_balance, 0) AS saldo FROM users WHERE id = $1 FOR UPDATE`,
    [dep.user_id]
  );
  const saldo = Number(u.rows[0]?.saldo) || 0;
  if (aQuitar > 0 && saldo < aQuitar) {
    throw new Error(
      `No se puede revertir: el cliente ya gastó ese saldo. Se le abonaron $${montoActual.toFixed(2)} ` +
      `y hoy solo le quedan $${saldo.toFixed(2)}. Ajusta primero con el equipo de finanzas.`
    );
  }

  const upd = await db.query(
    `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) - $1 WHERE id = $2 RETURNING wallet_balance`,
    [aQuitar, dep.user_id]
  );
  const nuevoSaldo = Number(upd.rows[0]?.wallet_balance) || 0;

  if (destino > 0) {
    await db.query(`UPDATE wallet_funding_deposits SET monto = $1 WHERE id = $2`, [destino, dep.id]);
  } else {
    await db.query(`DELETE FROM wallet_funding_deposits WHERE id = $1`, [dep.id]);
  }

  await db.query(
    `INSERT INTO financial_transactions
       (user_id, type, amount, balance_after, description, reference_id, reference_type, created_at)
     VALUES ($1, 'refund', $2, $3, $4, $5, 'wallet_funding', NOW())`,
    [dep.user_id, -aQuitar, nuevoSaldo,
     destino > 0
       ? `Corrección de fondeo ${dep.reference}: de $${montoActual.toFixed(2)} a $${destino.toFixed(2)}${opts?.actorNombre ? ` por ${opts.actorNombre}` : ''}`
       : `Reversa de fondeo ${dep.reference} (transacción de caja eliminada)${opts?.actorNombre ? ` por ${opts.actorNombre}` : ''}`,
     cajaTxId]
  );

  console.log(`[CARTERA] -$${aQuitar.toFixed(2)} a user ${dep.user_id} (${dep.reference}): reversa de caja #${cajaTxId}. Saldo: $${nuevoSaldo.toFixed(2)}`);
  return { revertido: aQuitar, nuevoSaldo };
}

/**
 * GET /api/wallet/funding-reference
 * La referencia fija del cliente y a dónde deposita. Sustituye al bloque de
 * CLABE virtual de Openpay, que sigue sin aprovisionarse.
 */
export const miReferenciaDeFondeo = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = Number(req.user?.userId || req.user?.id);
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    // El fondeo se prende cliente por cliente desde Control de Clientes. Sin
    // solicitarlo, el cliente no ve una CLABE y una referencia que no pidió y
    // no sabría para qué son. No se crea nada aquí: la referencia nace cuando
    // soporte se la habilita.
    await ensureFundingSchema();
    const fila = await pool.query(
      `SELECT reference, habilitada FROM wallet_funding_references WHERE user_id = $1`,
      [userId]
    );
    if (fila.rows.length === 0 || !fila.rows[0].habilitada) {
      return res.json({ success: true, habilitada: false, configurada: false, reference: null, banco: null });
    }

    const reference = String(fila.rows[0].reference);
    const empresa = await empresaDeCartera();

    res.json({
      habilitada: true,
      success: true,
      reference,
      // Sin empresa asignada la referencia existe pero no hay a dónde depositar:
      // el frontend muestra el aviso en vez de instrucciones a medias.
      configurada: !!empresa?.bank_clabe,
      banco: empresa ? {
        empresa: empresa.company_name || empresa.legal_name,
        beneficiario: empresa.legal_name,
        rfc: empresa.rfc,
        bank_name: empresa.bank_name,
        bank_clabe: empresa.bank_clabe,
        bank_account: empresa.bank_account,
      } : null,
      instrucciones: empresa?.bank_clabe
        ? `Transfiere por SPEI a la CLABE ${empresa.bank_clabe} usando ${reference} como concepto. El monto se abona a tu cartera general y lo puedes usar en cualquier servicio.`
        : null,
    });
  } catch (e: any) {
    console.error('[cartera] miReferenciaDeFondeo:', e);
    res.status(500).json({ error: 'No se pudo obtener tu referencia de fondeo' });
  }
};

/**
 * POST /api/admin/finance/asignar-deposito
 * Body: { bank_entry_id, user_id, nota? }
 *
 * Abona a la cartera de un cliente un depósito que entró SIN referencia.
 *
 * Hasta hoy no había cómo. La conciliación amarra de dos maneras —por nuestra
 * referencia, o por monto EXACTO contra una orden— y un depósito sin referencia
 * cuyo monto no cuadra al centavo se quedaba en "sin conciliar" para siempre.
 * Le pasó a S20 el 28-sep con dos depósitos: 36,087.00 contra una orden de
 * 36,087.50, cincuenta centavos de diferencia. Leonardo Reyna lo pidió en las
 * tareas 760 y 791, y yo había contestado que bastaba la conciliación normal.
 * No bastaba.
 *
 * El dinero va a la CARTERA del cliente, no contra una orden. Dos razones: el
 * depósito casi nunca coincide con una orden —si coincidiera, el conciliador
 * por monto ya lo habría amarrado solo—, y desde la cartera el cliente paga lo
 * que sea, con la maquinaria que ya existe y ya aplica el excedente a la deuda.
 * Asignar directo a una orden duplicaría ese camino.
 *
 * Los candados, todos sobre cosas que ya pasaron antes en este sistema:
 *  · Tiene que ser un ABONO. Asignar un cargo le regalaría saldo al cliente.
 *  · Un movimiento se asigna UNA vez. La guarda vive en dos lados:
 *    `acreditarFondeoCartera` es idempotente por bank_entry_id, y aquí se mira
 *    `bank_entry_applications`. Volver a pegar el estado de cuenta no vuelve a
 *    abonar.
 *  · Queda escrito QUIÉN lo asignó, con nota, en las dos tablas. Mover dinero
 *    a mano sin saber quién fue no es una opción.
 */
export const asignarDepositoACliente = async (req: any, res: Response): Promise<any> => {
  const cx = await pool.connect();
  try {
    const bankEntryId = parseInt(String(req.body?.bank_entry_id ?? ''), 10);
    const userId = parseInt(String(req.body?.user_id ?? ''), 10);
    const nota = String(req.body?.nota || '').trim().slice(0, 500) || null;
    if (!Number.isFinite(bankEntryId) || bankEntryId <= 0) return res.status(400).json({ error: 'Falta el movimiento bancario.' });
    if (!Number.isFinite(userId) || userId <= 0) return res.status(400).json({ error: 'Falta el cliente al que se le abona.' });

    await cx.query('BEGIN');

    const mv = await cx.query(
      `SELECT id, fecha, concepto, referencia, abono, cargo, numero_cuenta
         FROM bank_statement_entries WHERE id = $1 FOR UPDATE`, [bankEntryId]);
    if (mv.rows.length === 0) { await cx.query('ROLLBACK'); return res.status(404).json({ error: 'No encontré ese movimiento bancario.' }); }
    const m = mv.rows[0];
    const monto = Number(m.abono) || 0;
    if (!(monto > 0)) {
      await cx.query('ROLLBACK');
      return res.status(400).json({ error: 'Ese movimiento es un cargo, no un depósito. Solo se pueden asignar abonos.' });
    }

    const yaAplicado = await cx.query(
      `SELECT id, payment_reference, aplicado_por_nombre, created_at
         FROM bank_entry_applications
        WHERE bank_entry_id = $1 AND reversed_at IS NULL LIMIT 1`, [bankEntryId]);
    if (yaAplicado.rows.length > 0) {
      await cx.query('ROLLBACK');
      const y = yaAplicado.rows[0];
      return res.status(409).json({
        error: 'Ese depósito ya estaba aplicado; no se puede asignar dos veces.',
        aplicado: { referencia: y.payment_reference, por: y.aplicado_por_nombre, cuando: y.created_at },
      });
    }

    const u = await cx.query(
      `SELECT id, full_name, box_id FROM users
        WHERE id = $1 AND COALESCE(is_active, true) = true AND deleted_at IS NULL`, [userId]);
    if (u.rows.length === 0) { await cx.query('ROLLBACK'); return res.status(404).json({ error: 'No encontré a ese cliente, o su cuenta está inactiva.' }); }
    const cliente = u.rows[0];

    // La referencia de cartera del cliente, para que el abono quede con la
    // misma etiqueta que tendría si él la hubiera puesto en la transferencia.
    const referencia = await obtenerOCrearReferencia(cliente.id);

    const actorId = Number(req.user?.userId || req.user?.id) || null;
    const actorNombre = String(req.user?.full_name || req.user?.nombre || '').trim() || null;

    const r = await acreditarFondeoCartera(cx, {
      userId: cliente.id,
      reference: referencia,
      monto,
      origen: 'manual',
      bankEntryId,
      actorId,
      ...(actorNombre ? { actorNombre } : {}),
      nota: nota || `Depósito sin referencia del ${new Date(m.fecha).toLocaleDateString('es-MX')}, asignado a mano.`,
    });
    if (r.duplicado) {
      await cx.query('ROLLBACK');
      return res.status(409).json({ error: 'Ese depósito ya se le había abonado a un cliente.' });
    }

    // Que el movimiento deje de aparecer como "sin conciliar".
    await cx.query(
      `INSERT INTO bank_entry_applications
         (bank_entry_id, payment_reference, monto_aplicado, origen, aplicado_por, aplicado_por_nombre, nota, created_at)
       VALUES ($1, $2, $3, 'asignacion_manual', $4, $5, $6, NOW())`,
      [bankEntryId, referencia, monto, actorId, actorNombre, nota]);

    await cx.query('COMMIT');
    res.json({
      success: true,
      cliente: { id: cliente.id, nombre: cliente.full_name, casillero: cliente.box_id },
      monto, referencia,
      nuevo_saldo: r.nuevoSaldo,
      mensaje: `Se abonaron $${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} a la cartera de ${cliente.full_name}`
             + ` (${cliente.box_id}). Su saldo queda en $${r.nuevoSaldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.`,
    });
  } catch (e: any) {
    await cx.query('ROLLBACK').catch(() => {});
    console.error('[fondeo] asignarDepositoACliente:', e?.message);
    res.status(500).json({ error: e?.message || 'No se pudo asignar el depósito.' });
  } finally {
    cx.release();
  }
};
