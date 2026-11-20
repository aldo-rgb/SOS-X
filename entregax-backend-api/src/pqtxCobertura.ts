/**
 * Cobertura de Paquete Express: cuándo creerle a su cotizadora y cuándo no.
 *
 * Un cliente de Apatzingán vio "Zona Fuera de Cobertura" para su CP y se quedó
 * sin su paquetería de siempre —que en aéreo va incluida en el flete— y con una
 * opción de pago de $400 como única salida. Al revisarlo al día siguiente, ese
 * CP cotizaba bien desde los dos CEDIS, con y sin colonia, con sus 26 cajas
 * reales y con cajas sin medidas: cobertura a domicilio en los seis casos. Y
 * tenemos una guía real emitida a ese mismo domicilio en septiembre
 * (TKT-2026-3750, tarea 1087).
 *
 * O sea: la cotizadora contestó "nada" un momento y el sistema convirtió esa
 * respuesta en un veredicto sobre el código postal. Cotizar y entregar son dos
 * preguntas distintas, y la primera no debería decidir la segunda cuando ya
 * tenemos la prueba de la segunda.
 *
 * Aquí viven las dos cosas que faltaban: la prueba (nuestras propias guías) y el
 * registro de lo que contesta la cotizadora, que no existía en ninguna parte.
 */

import { pool } from './db';

export interface AntecedenteDeEntrega {
  /** ¿Tenemos razones para no creerle el "sin cobertura"? */
  hayAntecedente: boolean;
  /** Qué lo respalda, para escribirlo en la bitácora y en el log. */
  motivo: string | null;
}

/**
 * ¿Ya le hemos entregado a ese código postal?
 *
 * Dos pruebas, en orden de peso:
 *
 * 1. Una guía nuestra emitida a ese CP. Es la prueba más fuerte y la da el
 *    sistema solo: `pqtx_shipments.dest_zip_code` es el CP que viajó impreso en
 *    la guía, y cuando el envío es Ocurre ahí va el CP de la SUCURSAL, no el del
 *    cliente — así que una fila con el CP del cliente significa domicilio. Hay
 *    229 CP con guía real.
 *
 * 2. La lista que se mantiene a mano (`pqtx_cp_entrega_a_domicilio`), de la
 *    tarea 858. Existía desde entonces pero se consultaba en UN solo lugar: al
 *    generar la guía. No al cotizar, que es donde el cliente se queda trabado,
 *    así que meter un CP en la lista no desbloqueaba su pantalla.
 */
export async function yaEntregamosEn(cp: string | null | undefined): Promise<AntecedenteDeEntrega> {
  const zip = String(cp || '').trim();
  if (!/^\d{5}$/.test(zip)) return { hayAntecedente: false, motivo: null };

  try {
    const guia = await pool.query(
      `SELECT tracking_number, created_at::date AS fecha
         FROM pqtx_shipments
        WHERE dest_zip_code = $1 AND COALESCE(status, '') <> 'cancelled'
        ORDER BY created_at DESC LIMIT 1`,
      [zip],
    );
    if (guia.rows[0]) {
      return {
        hayAntecedente: true,
        motivo: `ya le generamos guía a ese CP (${guia.rows[0].tracking_number}, ${guia.rows[0].fecha})`,
      };
    }
  } catch (e: any) {
    console.warn('[pqtx-cobertura] no pude revisar las guías emitidas:', e?.message);
  }

  try {
    const cfg = await pool.query(
      `SELECT config_value FROM system_configurations
        WHERE config_key = 'pqtx_cp_entrega_a_domicilio' AND COALESCE(is_active, TRUE) LIMIT 1`,
    );
    const zips: string[] = Array.isArray(cfg.rows[0]?.config_value?.zips)
      ? cfg.rows[0].config_value.zips.map((z: any) => String(z).trim())
      : [];
    if (zips.includes(zip)) {
      return { hayAntecedente: true, motivo: 'el CP está en la lista verificada a mano' };
    }
  } catch (e: any) {
    console.warn('[pqtx-cobertura] no pude leer la lista de CP verificados:', e?.message);
  }

  return { hayAntecedente: false, motivo: null };
}

export interface CotizacionRegistrada {
  destZip?: string | null;
  colony?: string | null;
  originZip?: string | null;
  sucursal?: string | null;
  packageCount?: number | null;
  weight?: number | null;
  dims?: string | null;
  veredicto: 'domicilio' | 'ocurre' | 'sin_cobertura' | 'sin_cobertura_con_antecedente' | 'error';
  motivo?: string | null;
  costoPqtx?: number | null;
  precioCliente?: number | null;
  userId?: number | null;
  packageId?: number | null;
  ms?: number | null;
}

/**
 * Deja constancia de qué se preguntó y qué se contestó.
 *
 * Nunca lanza ni bloquea: una cotización no puede fallar porque su bitácora
 * falle. Tampoco se espera el resultado desde quien cotiza.
 */
export function registrarCotizacion(d: CotizacionRegistrada): void {
  pool.query(
    `INSERT INTO pqtx_quote_logs
       (dest_zip, colony, origin_zip, sucursal, package_count, weight, dims,
        veredicto, motivo, costo_pqtx, precio_cliente, user_id, package_id, ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      d.destZip || null, d.colony || null, d.originZip || null, d.sucursal || null,
      d.packageCount ?? null, d.weight ?? null, d.dims || null,
      d.veredicto, d.motivo || null,
      d.costoPqtx ?? null, d.precioCliente ?? null,
      d.userId ?? null, d.packageId ?? null, d.ms ?? null,
    ],
  ).catch((e: any) => console.warn('[pqtx-cobertura] no pude registrar la cotización:', e?.message));
}
