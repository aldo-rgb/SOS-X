/**
 * Credenciales y remitente de Paquete Express, según la sucursal que despacha.
 *
 * Todo el sistema mandaba las guías con UN solo remitente, fijo en la bodega de
 * Monterrey: Revolución Sur 3866 B8, colonia Torremolinos, CP 64410. Salieran de
 * donde salieran. Eso es lo que Román vio impreso en una guía que despachó desde
 * CDMX ("las guías salen con cuenta de Mty y deben de salir con cuenta de
 * CDMX").
 *
 * Y no era solo el papel. El tarifario de Paquete Express cobra por BANDAS DE
 * KILÓMETROS —0-400, 401-800, 801-1200…—, así que declarar Monterrey como origen
 * cuando la caja sale de CDMX mete la cotización en la banda equivocada. Ése es
 * el "las tarifas que asigna el sistema son erróneas" del mismo reporte: un solo
 * dato mal puesto, dos síntomas.
 *
 * Las cuentas son dos y comparten número de cliente (27736250, URBAN WOD CF SA
 * DE CV): cambia el usuario con el que se entra, no a quién se le factura.
 *
 * Si una sucursal no tiene configuración propia se usa la de Monterrey, que es
 * como funcionaba hasta hoy. Así, mientras no existan las variables de CDMX,
 * nada cambia de comportamiento.
 */
import { pool } from './db';

export type Remitente = {
  zip: string; city: string; state: string; mun: string; col: string;
  street: string; num: string; phone: string; name: string; email: string;
};

export type CredencialesPqtx = {
  user: string; password: string; billClientId: string;
  quoteUser: string; quotePassword: string; quoteToken: string;
  sucursal: string;
};

/** Lee una variable por sucursal y cae a la general (que hoy es la de MTY). */
function v(sucursal: string, sufijo: string, porDefecto: string): string {
  return process.env[`PQTX_${sucursal}_${sufijo}`]
      || process.env[`PQTX_${sufijo}`]
      || porDefecto;
}

/**
 * Datos del remitente de una sucursal.
 *
 * Los valores por defecto son los de Monterrey, que es lo que había. El CP
 * 64410 sale de la dirección registrada en gestión de sucursales (Jacaranda 112,
 * Col Del Prado, CP 64410).
 */
/** Los datos que forman un domicilio y no se pueden mezclar entre sucursales. */
const CAMPOS_DOMICILIO = ['ORIGIN_ZIP', 'ORIGIN_CITY', 'ORIGIN_STATE', 'ORIGIN_MUN',
                          'ORIGIN_COL', 'ORIGIN_STREET', 'ORIGIN_NUM'] as const;

/** El remitente de MTY, que es el que había y sigue siendo el respaldo. */
const REMITENTE_MTY: Remitente = {
  zip: '64410', city: 'MONTERREY', state: 'NUEVO LEON', mun: 'MONTERREY',
  col: 'TORREMOLINOS', street: 'REVOLUCION SUR', num: '3866 B8',
  phone: '8120029375', name: 'ENTREGAX', email: 'operaciones@entregax.com',
};

export function remitenteDe(sucursal: string): Remitente {
  const s = (sucursal || 'MTY').toUpperCase();
  if (s === 'MTY') return { ...REMITENTE_MTY };

  // El domicilio es TODO O NADA. Con la variable por variable cayendo al
  // respaldo, una sucursal configurada a medias imprimía un domicilio
  // Frankenstein: el CP de CDMX con la calle de Monterrey. Eso es peor que no
  // configurarla, porque parece correcto y manda al chofer a una dirección que
  // no existe.
  const propias = CAMPOS_DOMICILIO.map(c => process.env[`PQTX_${s}_${c}`]);
  const completas = propias.every(x => !!String(x || '').trim());
  if (!completas) {
    const faltan = CAMPOS_DOMICILIO.filter((_, i) => !String(propias[i] || '').trim());
    if (propias.some(x => !!String(x || '').trim())) {
      console.warn(`[PQTX] ${s} tiene el domicilio incompleto, se usa el de MTY. Faltan: ${faltan.map(f => `PQTX_${s}_${f}`).join(', ')}`);
    }
    return { ...REMITENTE_MTY };
  }

  return {
    zip:    String(process.env[`PQTX_${s}_ORIGIN_ZIP`]),
    city:   String(process.env[`PQTX_${s}_ORIGIN_CITY`]),
    state:  String(process.env[`PQTX_${s}_ORIGIN_STATE`]),
    mun:    String(process.env[`PQTX_${s}_ORIGIN_MUN`]),
    col:    String(process.env[`PQTX_${s}_ORIGIN_COL`]),
    street: String(process.env[`PQTX_${s}_ORIGIN_STREET`]),
    num:    String(process.env[`PQTX_${s}_ORIGIN_NUM`]),
    // Teléfono, nombre y correo sí pueden compartirse: no forman parte del
    // domicilio y que el contacto sea el mismo no manda a nadie a otro lado.
    phone:  v(s, 'ORIGIN_PHONE', REMITENTE_MTY.phone),
    name:   v(s, 'ORIGIN_NAME',  REMITENTE_MTY.name),
    email:  v(s, 'ORIGIN_EMAIL', REMITENTE_MTY.email),
  };
}

/**
 * Credenciales de una sucursal.
 *
 * Las de cotización caen a las generales a propósito: no sabemos todavía si
 * CDMX necesita usuario propio para cotizar. El día que se sepa, se agregan
 * PQTX_CDMX_QUOTE_USER/PASSWORD/TOKEN y las toma sin tocar código.
 *
 * La contraseña se manda TAL CUAL se guarda, sin procesar. La de Monterrey está
 * en base64, así que la de cualquier otra sucursal tiene que registrarse en el
 * mismo formato o el login falla con un error que no explica por qué.
 */
export function credencialesDe(sucursal: string): CredencialesPqtx {
  const s = (sucursal || 'MTY').toUpperCase();
  return {
    sucursal: s,
    user:          v(s, 'USER',           'WSQURBANWOD'),
    password:      v(s, 'PASSWORD',       'UWEyNzczNjI1MCQ='),
    // Las dos cuentas facturan al mismo cliente: cambia con quién se entra, no
    // a quién se le cobra.
    billClientId:  v(s, 'BILL_CLIENT_ID', '27736250'),
    quoteUser:     v(s, 'QUOTE_USER',     'WSQURBANWOD'),
    quotePassword: v(s, 'QUOTE_PASSWORD', '1234'),
    quoteToken:    v(s, 'QUOTE_TOKEN',    '4DB7391907B749C5E063350AA8C0215D'),
  };
}

/**
 * Sucursal que despacha, a partir de quien está operando.
 *
 * Se mira el `branch_id` del usuario, igual que el resto del sistema. Si no
 * tiene sucursal asignada se usa MTY, que es el comportamiento de siempre:
 * preferible seguir como hasta hoy que inventarle un origen.
 */
export async function sucursalDelOperador(userId?: number | null): Promise<string> {
  if (!userId) return 'MTY';
  try {
    const r = await pool.query(
      `SELECT b.code FROM users u JOIN branches b ON b.id = u.branch_id WHERE u.id = $1`, [userId]);
    const code = String(r.rows[0]?.code || '').toUpperCase().trim();
    if (!code) return 'MTY';
    // 'CC' (Centro CC) es mostrador en Monterrey: despacha con la cuenta de MTY.
    if (code === 'CC') return 'MTY';
    return code;
  } catch {
    return 'MTY';
  }
}

/** Para dejar en el log qué cuenta y qué origen se usaron, que es lo primero que se pregunta cuando una guía sale mal. */
export function describirOrigen(sucursal: string): string {
  const r = remitenteDe(sucursal);
  const c = credencialesDe(sucursal);
  return `${sucursal}: usuario ${c.user}, origen CP ${r.zip} (${r.city})`;
}
