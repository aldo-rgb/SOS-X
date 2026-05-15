/**
 * Caja Chica Sucursales (Petty Cash) Controller
 *
 * Flujo:
 *  1) Caja CC fondea una sucursal (movimiento `fund` que entra al wallet de la sucursal)
 *     - Se registra también como `egreso` en `caja_chica_transacciones` para reflejar la salida de Caja CC
 *  2) La sucursal entrega un anticipo a un chofer (vale digital `advance`)
 *     - Sale de wallet sucursal y queda pending_acceptance en wallet chofer
 *     - El chofer "Acepta y Firma" desde la app -> el anticipo entra a su wallet
 *  3) Chofer registra gastos con foto + GPS desde la app
 *  4) Finanzas o branch_manager aprueba/rechaza desde la web
 *  5) Al cerrar ruta se realiza el arqueo
 *
 * Roles permitidos para administrar wallets / aprobar:
 *  - super_admin, admin, director, branch_manager, accountant (finanzas)
 */
import { Request, Response } from 'express';
import { pool } from './db';
import crypto from 'crypto';
import { signS3UrlIfNeeded } from './s3Service';

/**
 * Firma las URLs de evidencia de un movimiento para que el navegador pueda
 * mostrarlas (el bucket S3 es privado y las URLs directas devuelven 403).
 */
const signMovementUrls = async <T extends Record<string, any>>(m: T): Promise<T> => ({
  ...m,
  evidence_url: await signS3UrlIfNeeded(m.evidence_url),
  odometer_photo_url: await signS3UrlIfNeeded(m.odometer_photo_url),
  xml_url: await signS3UrlIfNeeded(m.xml_url)
});

const JWT_SIGNATURE_SECRET = process.env.JWT_SECRET || 'EntregaX_SuperSecretKey_2026';

// --------------------------------------------------------
// Helpers
// --------------------------------------------------------
const getUserId = (req: Request): number | null => {
  const raw = (req as any).user?.userId ?? (req as any).user?.id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const getUserRole = (req: Request): string =>
  String((req as any).user?.role || '').toLowerCase();

const ALL_BRANCHES_ROLES = new Set(['super_admin', 'admin', 'director', 'accountant']);

const resolveBranchScope = async (
  req: Request
): Promise<{ allBranches: boolean; branchId: number | null }> => {
  const role = getUserRole(req);
  if (ALL_BRANCHES_ROLES.has(role)) return { allBranches: true, branchId: null };
  const uid = getUserId(req);
  if (!uid) return { allBranches: false, branchId: null };
  const r = await pool.query('SELECT branch_id FROM users WHERE id = $1', [uid]);
  const raw = r.rows[0]?.branch_id;
  const branchId = raw == null ? null : Number(raw);
  return {
    allBranches: false,
    branchId: Number.isFinite(branchId as number) ? (branchId as number) : null
  };
};

const ensureBranchWallet = async (branchId: number, client = pool): Promise<number> => {
  const existing = await client.query(
    `SELECT id FROM petty_cash_wallets WHERE owner_type='branch' AND owner_id=$1`,
    [branchId]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id as number;
  const ins = await client.query(
    `INSERT INTO petty_cash_wallets (owner_type, owner_id, branch_id, balance_mxn)
     VALUES ('branch', $1, $1, 0) RETURNING id`,
    [branchId]
  );
  return ins.rows[0].id as number;
};

const ensureDriverWallet = async (
  driverUserId: number,
  branchId: number | null,
  client: any = pool
): Promise<number> => {
  const existing = await client.query(
    `SELECT id FROM petty_cash_wallets WHERE owner_type='driver' AND owner_id=$1`,
    [driverUserId]
  );
  if (existing.rows[0]?.id) {
    // Mantener branch_id actualizado si cambió la sucursal del chofer
    if (branchId !== null) {
      await client.query(
        `UPDATE petty_cash_wallets SET branch_id=$2, updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND (branch_id IS DISTINCT FROM $2)`,
        [existing.rows[0].id, branchId]
      );
    }
    return existing.rows[0].id as number;
  }
  const ins = await client.query(
    `INSERT INTO petty_cash_wallets (owner_type, owner_id, branch_id, balance_mxn)
     VALUES ('driver', $1, $2, 0) RETURNING id`,
    [driverUserId, branchId]
  );
  return ins.rows[0].id as number;
};

const computeSignatureHash = (advanceId: number, driverId: number, amount: number): string => {
  const payload = `${advanceId}|${driverId}|${amount}|${Date.now()}`;
  return crypto.createHmac('sha256', JWT_SIGNATURE_SECRET).update(payload).digest('hex');
};

// Categorías canónicas
export const EXPENSE_CATEGORIES = [
  { key: 'caseta',            label: 'Casetas',              icon: '🛣️' },
  { key: 'combustible',       label: 'Combustible',          icon: '⛽' },
  { key: 'mecanica',          label: 'Mecánica/Talacha',     icon: '🛠️' },
  { key: 'alimentos',         label: 'Alimentos',            icon: '🍔' },
  { key: 'hospedaje',         label: 'Hospedaje',            icon: '🏨' },
  { key: 'estacionamiento',   label: 'Estacionamiento',      icon: '🅿️' },
  { key: 'papeleria',         label: 'Papelería',            icon: '📎' },
  { key: 'mensajeria',        label: 'Mensajería',           icon: '📦' },
  { key: 'lavado',            label: 'Lavado de unidad',     icon: '🚿' },
  { key: 'refacciones',       label: 'Refacciones',          icon: '🔩' },
  { key: 'hidratacion',       label: 'Hielo / Agua',         icon: '💧' },
  { key: 'peaje_internacional', label: 'Peaje internacional', icon: '🛂' },
  { key: 'otros',             label: 'Otros',                icon: '📝' }
];

// =====================================================================
// CATÁLOGOS
// =====================================================================
export const getCategories = async (_req: Request, res: Response): Promise<any> => {
  return res.json({ categories: EXPENSE_CATEGORIES });
};

// =====================================================================
// WALLETS
// =====================================================================

/**
 * GET /api/admin/petty-cash/wallets
 * Lista wallets de sucursales y choferes (con filtro por tipo y sucursal).
 */
export const listWallets = async (req: Request, res: Response): Promise<any> => {
  try {
    const { owner_type, branch_id } = req.query;
    const scope = await resolveBranchScope(req);

    const where: string[] = [];
    const params: any[] = [];

    if (owner_type && (owner_type === 'branch' || owner_type === 'driver')) {
      params.push(owner_type);
      where.push(`w.owner_type = $${params.length}`);
    }
    if (!scope.allBranches) {
      if (!scope.branchId) {
        return res.json({ wallets: [] });
      }
      params.push(scope.branchId);
      where.push(`w.branch_id = $${params.length}`);
    } else if (branch_id) {
      params.push(Number(branch_id));
      where.push(`w.branch_id = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const r = await pool.query(`
      SELECT
        w.id,
        w.owner_type,
        w.owner_id,
        w.branch_id,
        b.name AS branch_name,
        CASE
          WHEN w.owner_type = 'branch' THEN COALESCE(b.name, 'Sucursal ' || w.owner_id)
          WHEN w.owner_type = 'driver' THEN COALESCE(u.full_name, 'Chofer ' || w.owner_id)
        END AS owner_name,
        u.phone AS owner_phone,
        u.email AS owner_email,
        w.balance_mxn,
        w.pending_to_verify_mxn,
        w.credit_limit_mxn,
        w.status,
        w.updated_at,
        (
          SELECT COUNT(*) FROM petty_cash_movements m
          WHERE m.wallet_id = w.id AND m.status = 'pending' AND m.movement_type = 'expense'
        ) AS pending_expenses_count
      FROM petty_cash_wallets w
      LEFT JOIN branches b ON b.id = w.branch_id
      LEFT JOIN users u ON (w.owner_type = 'driver' AND u.id = w.owner_id)
      ${whereSql}
      ORDER BY w.owner_type, owner_name
    `, params);

    return res.json({ wallets: r.rows });
  } catch (err: any) {
    console.error('listWallets error', err);
    return res.status(500).json({ error: 'Error al listar wallets', details: err.message });
  }
};

/**
 * GET /api/admin/petty-cash/wallets/:id
 * Detalle + movimientos recientes
 */
export const getWalletDetail = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

    const wr = await pool.query(`
      SELECT
        w.*,
        b.name AS branch_name,
        u.full_name AS driver_name,
        u.phone AS driver_phone,
        u.email AS driver_email
      FROM petty_cash_wallets w
      LEFT JOIN branches b ON b.id = w.branch_id
      LEFT JOIN users u ON (w.owner_type='driver' AND u.id = w.owner_id)
      WHERE w.id = $1
    `, [id]);
    if (!wr.rows[0]) return res.status(404).json({ error: 'Wallet no encontrada' });
    const wallet = wr.rows[0];

    // Restricción por sucursal
    const scope = await resolveBranchScope(req);
    if (!scope.allBranches && wallet.branch_id !== scope.branchId) {
      return res.status(403).json({ error: 'Fuera de tu alcance' });
    }

    // Para una wallet de sucursal el estado de cuenta incluye:
    //  - sus propios movimientos (fondeos + anticipos a choferes)
    //  - los gastos registrados por los choferes de esa sucursal
    // Para una wallet de chofer: solo sus propios movimientos.
    const isBranch = wallet.owner_type === 'branch';
    const movs = await pool.query(`
      SELECT m.*,
        u.full_name  AS created_by_name,
        ur.full_name AS reviewed_by_name,
        drv.full_name AS driver_name,
        a.status AS advance_status
      FROM petty_cash_movements m
      LEFT JOIN users u  ON u.id  = m.created_by
      LEFT JOIN users ur ON ur.id = m.reviewed_by
      LEFT JOIN petty_cash_wallets w2 ON w2.id = m.wallet_id
      LEFT JOIN users drv ON (w2.owner_type = 'driver' AND drv.id = w2.owner_id)
      LEFT JOIN petty_cash_advances a ON a.id = m.advance_id
      WHERE ${isBranch
        ? `(m.wallet_id = $1 OR (m.branch_id = $2 AND m.movement_type = 'expense'))`
        : `m.wallet_id = $1`}
      ORDER BY m.created_at DESC
      LIMIT 300
    `, isBranch ? [id, wallet.branch_id] : [id]);

    const movements = await Promise.all(movs.rows.map(signMovementUrls));
    return res.json({ wallet, movements });
  } catch (err: any) {
    console.error('getWalletDetail error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// FONDEO DESDE CAJA CC -> SUCURSAL
// =====================================================================
/**
 * POST /api/admin/petty-cash/fund-branch
 * Body: { branch_id, amount_mxn, concept? }
 * Sólo super_admin / admin / director / accountant
 */
export const fundBranch = async (req: Request, res: Response): Promise<any> => {
  const role = getUserRole(req);
  if (!ALL_BRANCHES_ROLES.has(role)) {
    return res.status(403).json({ error: 'Sin permisos para fondear sucursales' });
  }
  const adminId = getUserId(req);
  const { branch_id, amount_mxn, concept } = req.body || {};
  const branchId = Number(branch_id);
  const amount = Number(amount_mxn);
  if (!Number.isFinite(branchId) || branchId <= 0) {
    return res.status(400).json({ error: 'branch_id inválido' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount_mxn inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar sucursal
    const br = await client.query('SELECT id, name FROM branches WHERE id = $1', [branchId]);
    if (!br.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    const walletId = await ensureBranchWallet(branchId, client as any);

    // Datos admin para caja_chica_transacciones
    const adminRow = await client.query('SELECT full_name FROM users WHERE id = $1', [adminId]);
    const adminName = adminRow.rows[0]?.full_name || 'Admin';

    // Saldo actual Caja CC
    const saldoRes = await client.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END), 0) AS saldo
      FROM caja_chica_transacciones
    `);
    const saldoActual = Number(saldoRes.rows[0]?.saldo || 0);
    const nuevoSaldo = saldoActual - amount;

    // 1. Registrar egreso en caja_chica_transacciones
    const ccIns = await client.query(`
      INSERT INTO caja_chica_transacciones (
        tipo, monto, concepto, admin_id, admin_name,
        saldo_despues_movimiento, categoria, notas, currency, branch_id
      ) VALUES (
        'egreso', $1, $2, $3, $4, $5, 'fondeo_caja_chica_sucursal', $6, 'MXN', $7
      ) RETURNING id
    `, [
      amount,
      `Fondeo Caja Chica Sucursal ${br.rows[0].name} [PCASH-FUND-${Date.now()}]`,
      adminId,
      adminName,
      nuevoSaldo,
      concept || `Fondo asignado a sucursal ${br.rows[0].name}`,
      branchId
    ]);
    const ccTxId = ccIns.rows[0].id as number;

    // 2. Crear movement `fund` en petty cash
    const pcm = await client.query(`
      INSERT INTO petty_cash_movements (
        wallet_id, movement_type, amount_mxn, status, concept,
        branch_id, created_by, reviewed_by, reviewed_at, caja_chica_transaccion_id
      ) VALUES ($1, 'fund', $2, 'approved', $3, $4, $5, $5, CURRENT_TIMESTAMP, $6)
      RETURNING id
    `, [walletId, amount, concept || null, branchId, adminId, ccTxId]);

    // 3. Actualizar saldo de la wallet
    await client.query(`
      UPDATE petty_cash_wallets
      SET balance_mxn = balance_mxn + $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [walletId, amount]);

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Sucursal ${br.rows[0].name} fondeada con $${amount.toFixed(2)}`,
      wallet_id: walletId,
      movement_id: pcm.rows[0].id,
      caja_chica_transaccion_id: ccTxId
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('fundBranch error', err);
    return res.status(500).json({ error: 'Error al fondear sucursal', details: err.message });
  } finally {
    client.release();
  }
};

// =====================================================================
// ANTICIPO SUCURSAL -> CHOFER (vale digital)
// =====================================================================
/**
 * POST /api/admin/petty-cash/advance-driver
 * Body: { driver_user_id, amount_mxn, route_purpose? }
 * branch_manager: usa su propia sucursal
 * roles globales: deben especificar branch_id (de la sucursal de la que sale el dinero)
 */
export const advanceDriver = async (req: Request, res: Response): Promise<any> => {
  const adminId = getUserId(req);
  if (!adminId) return res.status(401).json({ error: 'No autenticado' });

  const { driver_user_id, amount_mxn, route_purpose, branch_id: bodyBranchId } = req.body || {};
  const driverId = Number(driver_user_id);
  const amount = Number(amount_mxn);
  if (!Number.isFinite(driverId) || driverId <= 0) {
    return res.status(400).json({ error: 'driver_user_id inválido' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount_mxn inválido' });
  }

  const scope = await resolveBranchScope(req);
  let sourceBranchId: number | null = null;
  if (!scope.allBranches) {
    if (!scope.branchId) return res.status(403).json({ error: 'No tienes sucursal asignada' });
    sourceBranchId = scope.branchId;
  } else {
    sourceBranchId = Number(bodyBranchId) || null;
    if (!sourceBranchId) {
      // Tomar la sucursal del chofer
      const dr = await pool.query('SELECT branch_id FROM users WHERE id=$1', [driverId]);
      sourceBranchId = dr.rows[0]?.branch_id || null;
    }
    if (!sourceBranchId) {
      return res.status(400).json({ error: 'No se pudo determinar la sucursal de origen' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar chofer
    const dr = await client.query(
      `SELECT id, full_name, role, branch_id FROM users WHERE id = $1`,
      [driverId]
    );
    if (!dr.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Chofer no encontrado' });
    }
    const driverRole = String(dr.rows[0].role || '').toLowerCase();
    if (!['repartidor', 'monitoreo', 'operaciones', 'warehouse_ops'].includes(driverRole)) {
      // Aceptamos otros roles operativos como destinatarios
      // (no bloqueamos pero advertimos)
    }

    // Wallets
    const sourceWalletId = await ensureBranchWallet(sourceBranchId, client as any);
    const driverWalletId = await ensureDriverWallet(driverId, sourceBranchId, client as any);

    // Verificar saldo de la sucursal
    const swr = await client.query(`SELECT balance_mxn FROM petty_cash_wallets WHERE id = $1 FOR UPDATE`, [sourceWalletId]);
    const sourceBalance = Number(swr.rows[0]?.balance_mxn || 0);
    if (sourceBalance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Saldo insuficiente en la sucursal',
        balance: sourceBalance,
        requested: amount
      });
    }

    // Crear advance (pendiente de aceptación)
    const adv = await client.query(`
      INSERT INTO petty_cash_advances (
        source_wallet_id, driver_wallet_id, driver_user_id, branch_id,
        amount_mxn, status, issued_by, route_purpose
      ) VALUES ($1, $2, $3, $4, $5, 'pending_acceptance', $6, $7)
      RETURNING id
    `, [sourceWalletId, driverWalletId, driverId, sourceBranchId, amount, adminId, route_purpose || null]);
    const advanceId = adv.rows[0].id as number;

    // Movement de salida en sucursal (approved, ya descuenta)
    const outflow = await client.query(`
      INSERT INTO petty_cash_movements (
        wallet_id, movement_type, amount_mxn, status, concept,
        branch_id, created_by, reviewed_by, reviewed_at, advance_id
      ) VALUES ($1, 'advance', $2, 'approved', $3, $4, $5, $5, CURRENT_TIMESTAMP, $6)
      RETURNING id
    `, [sourceWalletId, amount, `Anticipo a ${dr.rows[0].full_name}`, sourceBranchId, adminId, advanceId]);

    // Descontar de wallet sucursal
    await client.query(`
      UPDATE petty_cash_wallets
      SET balance_mxn = balance_mxn - $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [sourceWalletId, amount]);

    // Movement de entrada en chofer (pending hasta que firme)
    const inflow = await client.query(`
      INSERT INTO petty_cash_movements (
        wallet_id, movement_type, amount_mxn, status, concept,
        branch_id, created_by, advance_id
      ) VALUES ($1, 'advance', $2, 'pending', $3, $4, $5, $6)
      RETURNING id
    `, [driverWalletId, amount, `Anticipo recibido (pendiente firma)`, sourceBranchId, adminId, advanceId]);

    await client.query(`
      UPDATE petty_cash_advances
      SET outflow_movement_id = $2, inflow_movement_id = $3
      WHERE id = $1
    `, [advanceId, outflow.rows[0].id, inflow.rows[0].id]);

    await client.query('COMMIT');

    // TODO: enviar push notification al chofer
    return res.json({
      success: true,
      message: `Vale digital creado por $${amount.toFixed(2)}. El chofer debe aceptar y firmar.`,
      advance_id: advanceId,
      driver_wallet_id: driverWalletId,
      source_wallet_id: sourceWalletId
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('advanceDriver error', err);
    return res.status(500).json({ error: 'Error al anticipar al chofer', details: err.message });
  } finally {
    client.release();
  }
};

// =====================================================================
// CHOFER ACEPTA Y FIRMA EL ANTICIPO  (mobile)
// =====================================================================
/**
 * POST /api/petty-cash/advances/:id/accept
 * Body: { lat?, lng?, device_info? }
 * Solo el dueño del wallet (chofer) puede aceptar.
 */
export const acceptAdvance = async (req: Request, res: Response): Promise<any> => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

  const { lat, lng, device_info } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const adv = await client.query(
      `SELECT * FROM petty_cash_advances WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!adv.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Anticipo no encontrado' });
    }
    const a = adv.rows[0];
    if (a.driver_user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No eres el destinatario de este anticipo' });
    }
    if (a.status !== 'pending_acceptance') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Anticipo en estado ${a.status}, no se puede aceptar` });
    }

    const sig = computeSignatureHash(id, userId, Number(a.amount_mxn));

    await client.query(`
      UPDATE petty_cash_advances
      SET status='accepted', accepted_at=CURRENT_TIMESTAMP,
          accepted_lat=$2, accepted_lng=$3, device_info=$4, signature_hash=$5
      WHERE id=$1
    `, [id, lat || null, lng || null, device_info || null, sig]);

    // Aprobar el movement de entrada y sumar al wallet chofer
    if (a.inflow_movement_id) {
      await client.query(`
        UPDATE petty_cash_movements
        SET status='approved', reviewed_by=$2, reviewed_at=CURRENT_TIMESTAMP,
            concept='Anticipo aceptado y firmado'
        WHERE id=$1
      `, [a.inflow_movement_id, userId]);
    }
    await client.query(`
      UPDATE petty_cash_wallets
      SET balance_mxn = balance_mxn + $2,
          pending_to_verify_mxn = pending_to_verify_mxn + $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [a.driver_wallet_id, Number(a.amount_mxn)]);

    await client.query('COMMIT');
    return res.json({ success: true, signature: sig, accepted_at: new Date().toISOString() });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('acceptAdvance error', err);
    return res.status(500).json({ error: 'Error al aceptar anticipo', details: err.message });
  } finally {
    client.release();
  }
};

/**
 * GET /api/petty-cash/my-advances
 * Lista anticipos pendientes / aceptados del usuario en sesión (chofer)
 */
export const listMyAdvances = async (req: Request, res: Response): Promise<any> => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const r = await pool.query(`
      SELECT a.*,
        b.name AS branch_name,
        iss.full_name AS issued_by_name
      FROM petty_cash_advances a
      LEFT JOIN branches b ON b.id = a.branch_id
      LEFT JOIN users iss ON iss.id = a.issued_by
      WHERE a.driver_user_id = $1
      ORDER BY a.issued_at DESC
      LIMIT 50
    `, [userId]);
    return res.json({ advances: r.rows });
  } catch (err: any) {
    console.error('listMyAdvances error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// CHOFER REGISTRA GASTO  (mobile)
// =====================================================================
/**
 * POST /api/petty-cash/expenses
 * Multipart con campos: category, amount_mxn, concept?, gps_lat?, gps_lng?, gps_accuracy_m?,
 * odometer_km?, advance_id? + files: evidence (foto ticket), odometer_photo (opcional), xml (opcional)
 *
 * Para no acoplar multer aquí, los handlers de upload se inyectan desde index.ts.
 * Esta función espera (req as any).uploadedFiles = { evidence_url, odometer_photo_url, xml_url }
 */
export const registerExpense = async (req: Request, res: Response): Promise<any> => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const {
    category,
    amount_mxn,
    concept,
    gps_lat,
    gps_lng,
    gps_accuracy_m,
    odometer_km,
    advance_id,
    vehicle_id
  } = req.body || {};

  const amount = Number(amount_mxn);
  if (!category || typeof category !== 'string') {
    return res.status(400).json({ error: 'category requerida' });
  }
  const validCategories = EXPENSE_CATEGORIES.map(c => c.key);
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: 'Categoría no válida' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount_mxn inválido' });
  }

  const uploaded = (req as any).uploadedFiles || {};
  const evidenceUrl = uploaded.evidence_url || null;
  const odometerPhotoUrl = uploaded.odometer_photo_url || null;
  const xmlUrl = uploaded.xml_url || null;

  if (!evidenceUrl) {
    return res.status(400).json({ error: 'Foto del ticket requerida' });
  }

  // Wallet del chofer
  const ur = await pool.query('SELECT branch_id FROM users WHERE id = $1', [userId]);
  const branchId = ur.rows[0]?.branch_id || null;
  const walletId = await ensureDriverWallet(userId, branchId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const m = await client.query(`
      INSERT INTO petty_cash_movements (
        wallet_id, movement_type, category, amount_mxn, status, concept,
        evidence_url, xml_url, odometer_photo_url, odometer_km,
        gps_lat, gps_lng, gps_accuracy_m, vehicle_id, advance_id,
        branch_id, created_by
      ) VALUES ($1, 'expense', $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, created_at
    `, [
      walletId, category, amount, concept || null,
      evidenceUrl, xmlUrl, odometerPhotoUrl,
      odometer_km ? Number(odometer_km) : null,
      gps_lat ? Number(gps_lat) : null,
      gps_lng ? Number(gps_lng) : null,
      gps_accuracy_m ? Number(gps_accuracy_m) : null,
      vehicle_id ? Number(vehicle_id) : null,
      advance_id ? Number(advance_id) : null,
      branchId, userId
    ]);
    await client.query('COMMIT');
    return res.json({ success: true, movement_id: m.rows[0].id, created_at: m.rows[0].created_at });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('registerExpense error', err);
    return res.status(500).json({ error: 'Error al registrar gasto', details: err.message });
  } finally {
    client.release();
  }
};

/**
 * GET /api/petty-cash/my-wallet
 * Devuelve saldo + últimos movimientos del chofer
 */
export const getMyWallet = async (req: Request, res: Response): Promise<any> => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const ur = await pool.query('SELECT branch_id FROM users WHERE id = $1', [userId]);
    const branchId = ur.rows[0]?.branch_id || null;
    const walletId = await ensureDriverWallet(userId, branchId);
    const w = await pool.query(`
      SELECT w.*, b.name AS branch_name
      FROM petty_cash_wallets w
      LEFT JOIN branches b ON b.id = w.branch_id
      WHERE w.id = $1
    `, [walletId]);
    const movs = await pool.query(`
      SELECT * FROM petty_cash_movements
      WHERE wallet_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [walletId]);
    const pendingAdv = await pool.query(`
      SELECT * FROM petty_cash_advances
      WHERE driver_user_id = $1 AND status = 'pending_acceptance'
      ORDER BY issued_at DESC
    `, [userId]);
    return res.json({
      wallet: w.rows[0] || null,
      movements: await Promise.all(movs.rows.map(signMovementUrls)),
      pending_advances: pendingAdv.rows
    });
  } catch (err: any) {
    console.error('getMyWallet error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

// =====================================================================
// APROBACIONES (Finanzas / branch_manager)
// =====================================================================
/**
 * GET /api/admin/petty-cash/pending
 * Lista gastos pendientes de aprobación con filtro por sucursal automático.
 */
export const listPendingExpenses = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await resolveBranchScope(req);
    const where: string[] = [`m.status = 'pending'`, `m.movement_type = 'expense'`];
    const params: any[] = [];
    if (!scope.allBranches) {
      if (!scope.branchId) return res.json({ movements: [] });
      params.push(scope.branchId);
      where.push(`m.branch_id = $${params.length}`);
    }
    const r = await pool.query(`
      SELECT m.*,
        u.full_name AS driver_name,
        u.phone AS driver_phone,
        b.name AS branch_name,
        w.owner_type AS wallet_owner_type
      FROM petty_cash_movements m
      LEFT JOIN petty_cash_wallets w ON w.id = m.wallet_id
      LEFT JOIN users u ON u.id = m.created_by
      LEFT JOIN branches b ON b.id = m.branch_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.created_at ASC
    `, params);
    const movements = await Promise.all(r.rows.map(signMovementUrls));
    return res.json({ movements });
  } catch (err: any) {
    console.error('listPendingExpenses error', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

/**
 * POST /api/admin/petty-cash/movements/:id/approve
 */
export const approveExpense = async (req: Request, res: Response): Promise<any> => {
  const reviewerId = getUserId(req);
  if (!reviewerId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mr = await client.query(`SELECT * FROM petty_cash_movements WHERE id=$1 FOR UPDATE`, [id]);
    if (!mr.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }
    const m = mr.rows[0];
    if (m.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Movimiento en estado ${m.status}` });
    }
    if (m.movement_type !== 'expense') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Solo se aprueban gastos' });
    }
    await client.query(`
      UPDATE petty_cash_movements
      SET status='approved', reviewed_by=$2, reviewed_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `, [id, reviewerId]);
    // Descontar del wallet chofer (balance) y del pending_to_verify
    await client.query(`
      UPDATE petty_cash_wallets
      SET balance_mxn = balance_mxn - $2,
          pending_to_verify_mxn = GREATEST(pending_to_verify_mxn - $2, 0),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [m.wallet_id, Number(m.amount_mxn)]);
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('approveExpense error', err);
    return res.status(500).json({ error: 'Error al aprobar', details: err.message });
  } finally {
    client.release();
  }
};

/**
 * POST /api/admin/petty-cash/movements/:id/reject
 * Body: { reason }
 */
export const rejectExpense = async (req: Request, res: Response): Promise<any> => {
  const reviewerId = getUserId(req);
  if (!reviewerId) return res.status(401).json({ error: 'No autenticado' });
  const id = Number(req.params.id);
  const { reason } = req.body || {};
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });
  if (!reason || String(reason).trim().length < 3) {
    return res.status(400).json({ error: 'Motivo de rechazo requerido' });
  }

  const r = await pool.query(`
    UPDATE petty_cash_movements
    SET status='rejected', reviewed_by=$2, reviewed_at=CURRENT_TIMESTAMP, rejection_reason=$3
    WHERE id=$1 AND status='pending' AND movement_type='expense'
    RETURNING id
  `, [id, reviewerId, String(reason).trim()]);
  if (!r.rows[0]) return res.status(400).json({ error: 'No se pudo rechazar (revisa estado)' });
  return res.json({ success: true });
};

// =====================================================================
// ARQUEO / CIERRE DE RUTA
// =====================================================================
/**
 * POST /api/admin/petty-cash/route-settle
 * Body: { driver_user_id, cash_returned_mxn, notes? }
 *
 * Cierra todos los advances 'accepted' del chofer y reinicia su wallet.
 */
export const closeRouteSettlement = async (req: Request, res: Response): Promise<any> => {
  const adminId = getUserId(req);
  if (!adminId) return res.status(401).json({ error: 'No autenticado' });

  const { driver_user_id, cash_returned_mxn, notes } = req.body || {};
  const driverId = Number(driver_user_id);
  const cashReturned = Number(cash_returned_mxn) || 0;
  if (!Number.isFinite(driverId)) return res.status(400).json({ error: 'driver_user_id inválido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ur = await client.query('SELECT branch_id, full_name FROM users WHERE id=$1', [driverId]);
    if (!ur.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Chofer no encontrado' });
    }
    const branchId = ur.rows[0].branch_id || null;
    const driverWalletId = await ensureDriverWallet(driverId, branchId, client as any);

    // Calcular totales desde advances accepted aún no liquidados
    const advRes = await client.query(`
      SELECT COALESCE(SUM(amount_mxn), 0) AS total_funded
      FROM petty_cash_advances
      WHERE driver_user_id = $1 AND status = 'accepted'
    `, [driverId]);
    const totalFunded = Number(advRes.rows[0].total_funded || 0);

    const expRes = await client.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status='approved' THEN amount_mxn ELSE 0 END), 0) AS approved,
        COALESCE(SUM(CASE WHEN status='pending'  THEN amount_mxn ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status='rejected' THEN amount_mxn ELSE 0 END), 0) AS rejected
      FROM petty_cash_movements
      WHERE wallet_id = $1 AND movement_type='expense'
        AND route_settlement_id IS NULL
        AND created_at >= (
          SELECT COALESCE(MIN(issued_at), '1970-01-01'::timestamp)
          FROM petty_cash_advances
          WHERE driver_user_id = $2 AND status='accepted'
        )
    `, [driverWalletId, driverId]);
    const approved = Number(expRes.rows[0].approved);
    const pending = Number(expRes.rows[0].pending);
    const rejected = Number(expRes.rows[0].rejected);

    // balance: lo que sobra que debe devolver el chofer
    // total_funded - approved - cash_returned = balance ; si > 0 -> chofer aún debe; si < 0 -> caja debe
    const expectedReturn = totalFunded - approved;
    const balance = expectedReturn - cashReturned;

    const settle = await client.query(`
      INSERT INTO petty_cash_route_settlements (
        driver_wallet_id, driver_user_id, branch_id,
        total_funded, total_approved_expenses, total_pending_expenses, total_rejected_expenses,
        cash_returned, balance, status, closed_at, closed_by, opened_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'closed', CURRENT_TIMESTAMP, $10, $10, $11)
      RETURNING id
    `, [driverWalletId, driverId, branchId,
        totalFunded, approved, pending, rejected,
        cashReturned, balance, adminId, notes || null]);
    const settlementId = settle.rows[0].id;

    // Marcar advances como settled
    await client.query(`
      UPDATE petty_cash_advances
      SET status='settled', settlement_id=$2
      WHERE driver_user_id=$1 AND status='accepted'
    `, [driverId, settlementId]);

    // Marcar movements del chofer (advance accepted + expense approved/rejected) como settled
    await client.query(`
      UPDATE petty_cash_movements
      SET route_settlement_id=$2, status='settled'
      WHERE wallet_id=$1 AND route_settlement_id IS NULL
        AND status IN ('approved','rejected')
        AND movement_type IN ('advance','expense')
    `, [driverWalletId, settlementId]);

    // Si hubo cash_returned, registrar como ingreso a la sucursal
    if (cashReturned > 0 && branchId) {
      const branchWalletId = await ensureBranchWallet(branchId, client as any);
      await client.query(`
        INSERT INTO petty_cash_movements (
          wallet_id, movement_type, amount_mxn, status, concept,
          branch_id, created_by, reviewed_by, reviewed_at, route_settlement_id
        ) VALUES ($1, 'return', $2, 'approved', $3, $4, $5, $5, CURRENT_TIMESTAMP, $6)
      `, [branchWalletId, cashReturned, `Devolución corte de ruta - ${ur.rows[0].full_name}`, branchId, adminId, settlementId]);
      await client.query(`
        UPDATE petty_cash_wallets
        SET balance_mxn = balance_mxn + $2, updated_at=CURRENT_TIMESTAMP
        WHERE id=$1
      `, [branchWalletId, cashReturned]);
    }

    // Resetear pending_to_verify del chofer
    await client.query(`
      UPDATE petty_cash_wallets
      SET balance_mxn = GREATEST(balance_mxn - $2, 0),
          pending_to_verify_mxn = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [driverWalletId, totalFunded - approved]);

    await client.query('COMMIT');
    return res.json({
      success: true,
      settlement_id: settlementId,
      summary: {
        total_funded: totalFunded,
        approved_expenses: approved,
        pending_expenses: pending,
        rejected_expenses: rejected,
        cash_returned: cashReturned,
        balance
      }
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('closeRouteSettlement error', err);
    return res.status(500).json({ error: 'Error al cerrar ruta', details: err.message });
  } finally {
    client.release();
  }
};

/**
 * GET /api/admin/petty-cash/settlements
 */
export const listSettlements = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await resolveBranchScope(req);
    const where: string[] = [];
    const params: any[] = [];
    if (!scope.allBranches) {
      if (!scope.branchId) return res.json({ settlements: [] });
      params.push(scope.branchId);
      where.push(`s.branch_id = $${params.length}`);
    }
    const r = await pool.query(`
      SELECT s.*, u.full_name AS driver_name, b.name AS branch_name,
        ub.full_name AS closed_by_name
      FROM petty_cash_route_settlements s
      LEFT JOIN users u ON u.id = s.driver_user_id
      LEFT JOIN branches b ON b.id = s.branch_id
      LEFT JOIN users ub ON ub.id = s.closed_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY s.opened_at DESC
      LIMIT 200
    `, params);
    return res.json({ settlements: r.rows });
  } catch (err: any) {
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

/**
 * GET /api/admin/petty-cash/drivers
 * Lista choferes asignables (rol repartidor/monitoreo/operaciones), por sucursal del usuario.
 */
export const listAssignableDrivers = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await resolveBranchScope(req);
    const where: string[] = [
      `LOWER(role) IN ('repartidor','monitoreo','operaciones','warehouse_ops','counter_staff')`,
      `(is_blocked IS NULL OR is_blocked = FALSE)`
    ];
    const params: any[] = [];
    if (!scope.allBranches) {
      if (!scope.branchId) return res.json({ drivers: [] });
      params.push(scope.branchId);
      where.push(`branch_id = $${params.length}`);
    }
    const r = await pool.query(`
      SELECT id, full_name, role, branch_id, phone, email
      FROM users
      WHERE ${where.join(' AND ')}
      ORDER BY full_name
    `, params);
    return res.json({ drivers: r.rows });
  } catch (err: any) {
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

/**
 * GET /api/admin/petty-cash/branches
 * Lista sucursales con balance actual (atajo para modal de fondeo).
 */
export const listBranchesWithBalance = async (_req: Request, res: Response): Promise<any> => {
  try {
    const r = await pool.query(`
      SELECT b.id, b.name, b.code,
        COALESCE(w.balance_mxn, 0) AS balance_mxn,
        w.id AS wallet_id
      FROM branches b
      LEFT JOIN petty_cash_wallets w ON w.owner_type='branch' AND w.owner_id = b.id
      ORDER BY b.name
    `);
    return res.json({ branches: r.rows });
  } catch (err: any) {
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};

/**
 * GET /api/admin/petty-cash/stats
 */
export const getPettyCashStats = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await resolveBranchScope(req);
    const filt = scope.allBranches ? '' : `AND w.branch_id = ${scope.branchId || 0}`;
    const totalBranches = await pool.query(`
      SELECT COALESCE(SUM(balance_mxn), 0) AS total
      FROM petty_cash_wallets w
      WHERE owner_type='branch' ${filt}
    `);
    const totalDrivers = await pool.query(`
      SELECT COALESCE(SUM(balance_mxn), 0) AS total,
             COALESCE(SUM(pending_to_verify_mxn), 0) AS pending
      FROM petty_cash_wallets w
      WHERE owner_type='driver' ${filt}
    `);
    const pendApr = await pool.query(`
      SELECT COUNT(*) AS c, COALESCE(SUM(amount_mxn), 0) AS total
      FROM petty_cash_movements m
      WHERE status='pending' AND movement_type='expense'
        ${scope.allBranches ? '' : `AND branch_id = ${scope.branchId || 0}`}
    `);
    return res.json({
      branches_balance: Number(totalBranches.rows[0].total),
      drivers_balance: Number(totalDrivers.rows[0].total),
      drivers_pending_to_verify: Number(totalDrivers.rows[0].pending),
      pending_approvals_count: Number(pendApr.rows[0].c),
      pending_approvals_total: Number(pendApr.rows[0].total)
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};
