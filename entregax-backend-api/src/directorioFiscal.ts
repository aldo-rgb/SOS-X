// ============================================
// DIRECTORIO FISCAL
//
// La libreta de razones sociales a las que se puede facturar. Resuelve tres
// casos que hoy obligaban a recapturar los datos cada vez (tarea 582):
//
//   1. El cliente pide la factura a nombre de OTRA razón social —la de su
//      empresa, la de un tercero—, distinta a la que tiene registrada.
//   2. Contabilidad necesita facturar algo que no pasó por el sistema y el
//      receptor no es ningún cliente.
//   3. Los datos fiscales de los clientes que YA están dados de alta tienen
//      que aparecer aquí mismo, sin volver a capturarlos.
//
// OJO, esto NO da de alta clientes: un registro del directorio es una razón
// social para facturar, no una cuenta de usuario.
//
// Vive sobre `client_fiscal_profiles`, que ya era multi-razón social por
// cliente y la usan las órdenes de pago del asesor. Lo único que le faltaba era
// poder guardar registros SIN cliente. Se reutiliza en vez de abrir una quinta
// tabla de datos fiscales: ya hay cuatro y no coinciden entre sí.
// ============================================

import { Response } from 'express';
import { pool, asegurarColumna } from './db';
import { AuthRequest } from './authController';

let listo = false;

export const ensureDirectorioFiscal = async (): Promise<void> => {
  if (listo) return;
  // Un registro del directorio puede no tener cliente (una factura suelta).
  await pool.query(`ALTER TABLE client_fiscal_profiles ALTER COLUMN user_id DROP NOT NULL`).catch(() => {});
  await asegurarColumna('client_fiscal_profiles', 'alias', 'VARCHAR(160)');
  await asegurarColumna('client_fiscal_profiles', 'notas', 'TEXT');
  await asegurarColumna('client_fiscal_profiles', 'activo', 'BOOLEAN NOT NULL DEFAULT TRUE');
  await asegurarColumna('client_fiscal_profiles', 'creado_por', 'INTEGER');
  await asegurarColumna('client_fiscal_profiles', 'updated_at', 'TIMESTAMP');
  // Sin cliente, el RFC es la llave: la unicidad por (user_id, rfc) no aplica
  // porque en Postgres dos NULL no chocan entre sí.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_dirfiscal_rfc_suelto
       ON client_fiscal_profiles (UPPER(TRIM(rfc))) WHERE user_id IS NULL`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dirfiscal_rfc ON client_fiscal_profiles (UPPER(TRIM(rfc)))`).catch(() => {});
  listo = true;
};

/**
 * Sube al directorio los datos fiscales que sólo viven en la ficha del cliente.
 *
 * 108 clientes tienen RFC en su ficha pero sólo 66 tenían perfil, así que el
 * directorio habría salido incompleto. Se copian tal cual, con los mismos
 * valores por omisión que ya aplicaba la lectura (601 y G03), para que ningún
 * cliente cambie de datos por haberlos subido aquí.
 */
export const subirFichasDeClientes = async (): Promise<number> => {
  await ensureDirectorioFiscal();
  const r = await pool.query(`
    INSERT INTO client_fiscal_profiles
      (user_id, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi, email, is_default)
    SELECT u.id,
           COALESCE(NULLIF(TRIM(u.fiscal_razon_social), ''), u.full_name),
           UPPER(TRIM(u.fiscal_rfc)),
           COALESCE(NULLIF(TRIM(u.fiscal_codigo_postal), ''), ''),
           COALESCE(NULLIF(TRIM(u.fiscal_regimen_fiscal), ''), '601'),
           COALESCE(NULLIF(TRIM(u.fiscal_uso_cfdi), ''), 'G03'),
           NULLIF(TRIM(COALESCE(u.fiscal_email, u.email)), ''),
           TRUE
      FROM users u
     WHERE COALESCE(TRIM(u.fiscal_rfc), '') <> ''
       AND NOT EXISTS (
             SELECT 1 FROM client_fiscal_profiles p
              WHERE p.user_id = u.id AND UPPER(TRIM(p.rfc)) = UPPER(TRIM(u.fiscal_rfc)))
    ON CONFLICT DO NOTHING`);
  return r.rowCount || 0;
};

const normaliza = (b: any) => ({
  razon_social: String(b?.razon_social || '').trim(),
  rfc: String(b?.rfc || '').trim().toUpperCase(),
  codigo_postal: String(b?.codigo_postal ?? b?.cp ?? '').trim(),
  regimen_fiscal: String(b?.regimen_fiscal || '').trim(),
  uso_cfdi: String(b?.uso_cfdi || '').trim() || null,
  email: String(b?.email || '').trim() || null,
  alias: String(b?.alias || '').trim() || null,
  notas: String(b?.notas || '').trim() || null,
  user_id: b?.user_id != null && String(b.user_id).trim() !== '' ? Number(b.user_id) : null,
});

const revisa = (d: ReturnType<typeof normaliza>): string | null => {
  if (!d.razon_social) return 'Falta la razón social.';
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(d.rfc)) return 'El RFC no tiene un formato válido.';
  if (!/^\d{5}$/.test(d.codigo_postal)) return 'El código postal debe ser de 5 dígitos.';
  if (!d.regimen_fiscal) return 'Falta el régimen fiscal.';
  if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return 'El correo no es válido.';
  return null;
};

/** Si el registro es el predeterminado del cliente, su ficha tiene que seguirlo. */
const espejarEnFicha = async (id: number): Promise<boolean> => {
  const p = (await pool.query(
    `SELECT user_id, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi, is_default
       FROM client_fiscal_profiles WHERE id = $1`, [id])).rows[0];
  if (!p || !p.user_id || !p.is_default) return false;
  await pool.query(
    `UPDATE users SET fiscal_razon_social=$1, fiscal_rfc=$2, fiscal_codigo_postal=$3,
            fiscal_regimen_fiscal=$4, fiscal_uso_cfdi=$5 WHERE id=$6`,
    [p.razon_social, p.rfc, p.codigo_postal, p.regimen_fiscal, p.uso_cfdi, p.user_id]);
  return true;
};

// ============================================
// GET /api/accounting/directorio-fiscal?buscar=
// ============================================
export const listarDirectorioFiscal = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureDirectorioFiscal();
    await subirFichasDeClientes();
    const buscar = String(req.query?.buscar || '').trim();
    const params: any[] = [];
    let filtro = '';
    if (buscar) {
      params.push(`%${buscar}%`);
      filtro = `AND (p.rfc ILIKE $1 OR p.razon_social ILIKE $1 OR COALESCE(p.alias,'') ILIKE $1
                     OR COALESCE(u.full_name,'') ILIKE $1 OR COALESCE(u.box_id,'') ILIKE $1)`;
    }
    const r = await pool.query(
      `SELECT p.id, p.user_id, p.razon_social, p.rfc, p.codigo_postal, p.regimen_fiscal,
              p.uso_cfdi, p.email, p.is_default, p.alias, p.notas, p.created_at, p.updated_at,
              u.full_name AS cliente_nombre, u.box_id AS cliente_casillero
         FROM client_fiscal_profiles p
         LEFT JOIN users u ON u.id = p.user_id
        WHERE COALESCE(p.activo, TRUE) = TRUE ${filtro}
        ORDER BY (p.user_id IS NULL), COALESCE(u.full_name, p.razon_social), p.is_default DESC NULLS LAST, p.id
        LIMIT 500`, params);
    res.json({ registros: r.rows, total: r.rowCount });
  } catch (e: any) {
    console.error('[directorio-fiscal] listar:', e?.message);
    res.status(500).json({ error: 'No se pudo cargar el directorio fiscal' });
  }
};

// ============================================
// POST /api/accounting/directorio-fiscal
// ============================================
export const crearEnDirectorioFiscal = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureDirectorioFiscal();
    const d = normaliza(req.body);
    const mal = revisa(d);
    if (mal) return res.status(400).json({ error: mal });

    const repetido = await pool.query(
      `SELECT id FROM client_fiscal_profiles
        WHERE UPPER(TRIM(rfc)) = $1 AND user_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [d.rfc, d.user_id]);
    if (repetido.rowCount) {
      return res.status(409).json({ error: 'Ese RFC ya está en el directorio para ese cliente.', id: repetido.rows[0].id });
    }
    // El primero de un cliente es su predeterminado; si ya tiene, no se le
    // cambia por agregarle otra razón social.
    let esDefault = false;
    if (d.user_id) {
      const n = (await pool.query(`SELECT COUNT(*)::int n FROM client_fiscal_profiles WHERE user_id = $1`, [d.user_id])).rows[0].n;
      esDefault = n === 0;
    }
    const r = await pool.query(
      `INSERT INTO client_fiscal_profiles
         (user_id, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi, email,
          is_default, alias, notas, creado_por, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING id`,
      [d.user_id, d.razon_social, d.rfc, d.codigo_postal, d.regimen_fiscal, d.uso_cfdi, d.email,
       esDefault, d.alias, d.notas, req.user?.userId || null]);
    const id = r.rows[0].id;
    const espejo = await espejarEnFicha(id);
    res.json({ id, is_default: esDefault, ficha_actualizada: espejo });
  } catch (e: any) {
    console.error('[directorio-fiscal] crear:', e?.message);
    res.status(500).json({ error: 'No se pudo guardar en el directorio' });
  }
};

// ============================================
// PUT /api/accounting/directorio-fiscal/:id
// ============================================
export const actualizarEnDirectorioFiscal = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureDirectorioFiscal();
    const id = parseInt(String(req.params.id || ''), 10);
    const actual = (await pool.query(`SELECT * FROM client_fiscal_profiles WHERE id = $1`, [id])).rows[0];
    if (!actual) return res.status(404).json({ error: 'Registro no encontrado' });

    const d = normaliza({ ...actual, cp: actual.codigo_postal, ...req.body, user_id: actual.user_id });
    const mal = revisa(d);
    if (mal) return res.status(400).json({ error: mal });

    await pool.query(
      `UPDATE client_fiscal_profiles
          SET razon_social=$2, rfc=$3, codigo_postal=$4, regimen_fiscal=$5,
              uso_cfdi=$6, email=$7, alias=$8, notas=$9, updated_at=NOW()
        WHERE id=$1`,
      [id, d.razon_social, d.rfc, d.codigo_postal, d.regimen_fiscal, d.uso_cfdi, d.email, d.alias, d.notas]);
    // Si es el predeterminado del cliente, su ficha cambia con él: es lo que ve
    // en su portal y lo que usan las órdenes de pago del asesor. La pantalla lo
    // advierte antes de guardar.
    const espejo = await espejarEnFicha(id);
    res.json({ ok: true, ficha_actualizada: espejo });
  } catch (e: any) {
    console.error('[directorio-fiscal] actualizar:', e?.message);
    res.status(500).json({ error: 'No se pudo actualizar' });
  }
};

// ============================================
// DELETE /api/accounting/directorio-fiscal/:id — se oculta, no se borra:
// puede estar detrás de una factura ya timbrada.
// ============================================
export const quitarDeDirectorioFiscal = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureDirectorioFiscal();
    const id = parseInt(String(req.params.id || ''), 10);
    const p = (await pool.query(`SELECT user_id, is_default FROM client_fiscal_profiles WHERE id = $1`, [id])).rows[0];
    if (!p) return res.status(404).json({ error: 'Registro no encontrado' });
    if (p.user_id && p.is_default) {
      return res.status(409).json({
        error: 'Esa es la razón social principal de un cliente: no se puede quitar del directorio. Cámbiala desde su ficha.',
      });
    }
    await pool.query(`UPDATE client_fiscal_profiles SET activo = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[directorio-fiscal] quitar:', e?.message);
    res.status(500).json({ error: 'No se pudo quitar' });
  }
};
