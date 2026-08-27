/**
 * DATOS FISCALES DEL CLIENTE · fuente única
 *
 * Los datos fiscales de un cliente vivían en cuatro almacenes que competían
 * entre sí: `users.fiscal_*`, `client_fiscal_profiles`,
 * `entangled_fiscal_profiles` (solo XPAY) y `users.rfc`. XPAY leía el suyo y
 * solo caía a `users.fiscal_*` si estaba vacío; en cuanto guardaba una vez, se
 * quedaba con una copia congelada que nunca volvía a sincronizar. El resultado
 * eran 14 clientes que existían únicamente dentro de XPAY, invisibles para
 * facturación, PO Box y pricing.
 *
 * La fuente de verdad es `client_fiscal_profiles`: es la única multi-perfil con
 * `is_default`, que es lo que el negocio necesita —un cliente factura a más de
 * una razón social—. `users.fiscal_*` se conserva como caché del predeterminado
 * porque siete archivos lo leen; se actualiza sola en cada guardado.
 *
 * Aquí viven la lectura, el guardado y la validación, para que web, app y
 * backend no puedan volver a exigir cosas distintas.
 */
import { pool } from './db';

export interface DatosFiscales {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  cp: string;
  uso_cfdi: string;
  email?: string | null;
}

// Persona moral: 3 letras + fecha + homoclave (12). Persona física: 4 letras (13).
const RFC_RE = /^([A-ZÑ&]{3}|[A-ZÑ&]{4})[0-9]{6}[A-Z0-9]{3}$/;

export const normalizarRfc = (v: any): string =>
  String(v || '').toUpperCase().replace(/[\s-]/g, '').trim();

/**
 * Valida lo que exige el SAT y lo que exige el proveedor de facturación, en un
 * solo lugar. Antes web pedía unos campos, la app otros y el backend otros: el
 * mismo cliente pasaba en una pantalla y tronaba con 400 en la siguiente.
 * Devuelve el motivo, o null si está bien.
 */
export function validarDatosFiscales(d: Partial<DatosFiscales>): string | null {
  const rfc = normalizarRfc(d.rfc);
  if (!rfc) return 'Falta el RFC.';
  // El caso real: un RFC de persona física guardado con 12 caracteres pasaba
  // el guardado y lo rechazaba el proveedor hasta el momento de operar.
  if (!RFC_RE.test(rfc)) {
    return `El RFC "${rfc}" no tiene un formato válido (12 caracteres para empresa, 13 para persona física).`;
  }
  if (!String(d.razon_social || '').trim()) return 'Falta la razón social.';
  // Se captura el RFC en el campo del nombre más seguido de lo que parece.
  if (normalizarRfc(d.razon_social) === rfc) return 'La razón social trae el RFC; escribe el nombre o la denominación social.';
  const cp = String(d.cp || '').trim();
  if (!/^[0-9]{5}$/.test(cp)) return 'El código postal debe ser de 5 dígitos.';
  if (!String(d.regimen_fiscal || '').trim()) return 'Falta el régimen fiscal.';
  if (!String(d.uso_cfdi || '').trim()) return 'Falta el uso de CFDI.';
  const email = String(d.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'El correo fiscal no es válido.';
  return null;
}

/**
 * Perfil fiscal vigente de un cliente. Orden de búsqueda:
 *   1. su perfil predeterminado en client_fiscal_profiles (la fuente)
 *   2. la caché de users.fiscal_* (clientes viejos que nunca pasaron por el alta)
 *   3. entangled_fiscal_profiles, solo por si quedara alguno sin migrar
 */
export async function leerPerfilFiscal(userId: number): Promise<(DatosFiscales & { _source: string; updated_at: any }) | null> {
  const c = (await pool.query(
    `SELECT razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi, email
       FROM client_fiscal_profiles
      WHERE user_id = $1
      ORDER BY is_default DESC NULLS LAST, id
      LIMIT 1`, [userId])).rows[0];
  if (c) {
    const correo = c.email
      || (await pool.query(`SELECT email FROM users WHERE id = $1`, [userId])).rows[0]?.email
      || '';
    return {
      rfc: c.rfc || '', razon_social: c.razon_social || '',
      regimen_fiscal: c.regimen_fiscal || '', cp: c.codigo_postal || '',
      uso_cfdi: c.uso_cfdi || '', email: correo,
      _source: 'client_fiscal_profiles', updated_at: null,
    };
  }

  const u = (await pool.query(
    `SELECT fiscal_rfc, fiscal_razon_social, fiscal_regimen_fiscal,
            fiscal_codigo_postal, fiscal_uso_cfdi, email
       FROM users WHERE id = $1`, [userId])).rows[0];
  if (u && (u.fiscal_rfc || u.fiscal_razon_social)) {
    return {
      rfc: u.fiscal_rfc || '', razon_social: u.fiscal_razon_social || '',
      // 601/G03 es el default histórico de la web; se conserva para no cambiar
      // lo que ya se le factura a un cliente viejo.
      regimen_fiscal: u.fiscal_regimen_fiscal || '601',
      cp: u.fiscal_codigo_postal || '', uso_cfdi: u.fiscal_uso_cfdi || 'G03',
      email: u.email || '', _source: 'users', updated_at: null,
    };
  }

  const e = (await pool.query(
    `SELECT rfc, razon_social, regimen_fiscal, cp, uso_cfdi, email, updated_at
       FROM entangled_fiscal_profiles WHERE user_id = $1`, [userId])).rows[0];
  if (e) return { ...e, _source: 'entangled_fiscal_profiles' };
  return null;
}

/**
 * Guarda el perfil en la fuente de verdad y refresca la caché de users.
 * Idempotente por (user_id, rfc): volver a guardar la misma razón social
 * actualiza la que ya existe en vez de duplicarla.
 */
export async function guardarPerfilFiscal(userId: number, d: DatosFiscales): Promise<any> {
  const rfc = normalizarRfc(d.rfc);
  const razon = String(d.razon_social).trim();
  const cp = String(d.cp).trim();
  const regimen = String(d.regimen_fiscal).trim();
  const uso = String(d.uso_cfdi || 'G03').trim();
  const email = String(d.email || '').trim() || null;

  const yaTiene = (await pool.query(
    `SELECT COUNT(*)::int n FROM client_fiscal_profiles WHERE user_id = $1`, [userId])).rows[0].n;
  // El primer perfil de un cliente es su predeterminado; si ya eligió uno, no
  // se le cambia por guardar otra razón social.
  const esDefault = yaTiene === 0;

  const r = await pool.query(
    `INSERT INTO client_fiscal_profiles
       (user_id, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi, email, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, UPPER(TRIM(rfc))) DO UPDATE SET
       razon_social = EXCLUDED.razon_social,
       codigo_postal = EXCLUDED.codigo_postal,
       regimen_fiscal = EXCLUDED.regimen_fiscal,
       uso_cfdi = EXCLUDED.uso_cfdi,
       email = COALESCE(EXCLUDED.email, client_fiscal_profiles.email)
     RETURNING id, razon_social, rfc, codigo_postal, regimen_fiscal, uso_cfdi, email, is_default`,
    [userId, razon, rfc, cp, regimen, uso, email, esDefault]);

  const perfil = r.rows[0];
  if (perfil?.is_default) {
    await pool.query(
      `UPDATE users SET fiscal_razon_social=$1, fiscal_rfc=$2, fiscal_codigo_postal=$3,
              fiscal_regimen_fiscal=$4, fiscal_uso_cfdi=$5 WHERE id=$6`,
      [razon, rfc, cp, regimen, uso, userId]);
  }
  return {
    rfc: perfil.rfc, razon_social: perfil.razon_social, regimen_fiscal: perfil.regimen_fiscal,
    cp: perfil.codigo_postal, uso_cfdi: perfil.uso_cfdi, email: perfil.email,
    is_default: perfil.is_default, _source: 'client_fiscal_profiles',
  };
}
