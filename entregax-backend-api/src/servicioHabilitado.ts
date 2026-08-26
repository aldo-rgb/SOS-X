/**
 * CANDADO DE SERVICIOS APAGADOS
 *
 * En Ajustes del Sistema hay un toggle "Pagos EntregaX" con un switch por
 * servicio (PO Box, Marítimo, Aéreo China, TDI Express, DHL Nacional). Hasta
 * ahora ese switch NO bloqueaba nada: `entregax_payments_enabled` se leía
 * únicamente en el endpoint que manda la configuración al frontend, y lo único
 * que hacía era deshabilitar el botón "Pagar" del cliente en app y web.
 *
 * Los asesores generan las órdenes desde SU panel, que es otro camino, así que
 * el switch no los tocaba: con Aéreo China apagado se crearon 27 órdenes por
 * $1,817,880.34, de las cuales 12 ya se cobraron ($965,605.03). Tres de ellas
 * después de apagarlo.
 *
 * Este módulo mueve la decisión al servidor, que es donde vale.
 */

import { pool } from './db';

/** service_type de la orden → llave del toggle en la configuración. */
const LLAVE_POR_SERVICIO: Record<string, string> = {
  POBOX_USA: 'pobox',
  usa_pobox: 'pobox',
  pobox: 'pobox',
  po_box: 'pobox',
  SEA_CHN_MX: 'maritimo',
  china_sea: 'maritimo',
  maritime: 'maritimo',
  maritimo: 'maritimo',
  fcl: 'maritimo',
  AIR_CHN_MX: 'aereo',
  china_air: 'aereo',
  aereo: 'aereo',
  TDI_EXPRESS: 'tdi_express',
  tdi_express: 'tdi_express',
  AA_DHL: 'dhl',
  mx_cedis: 'dhl',
  dhl: 'dhl',
  // multiServicePaymentController usa su propia llave para DHL ('po_box' ya
  // está mapeado arriba).
  dhl_liberacion: 'dhl',
};

const NOMBRE_BONITO: Record<string, string> = {
  pobox: 'PO Box USA',
  maritimo: 'Marítimo China',
  aereo: 'Aéreo China',
  tdi_express: 'TDI Express',
  dhl: 'DHL Nacional',
};

export type Veredicto = { permitido: true } | { permitido: false; motivo: string };

/**
 * ¿Se pueden cobrar órdenes de este servicio?
 *
 * Ante cualquier duda deja pasar: si la configuración no se puede leer o el
 * servicio no se reconoce, un candado que se cierra solo detendría cobros
 * legítimos, que es peor que dejar pasar uno que debía frenarse. El caso que
 * importa —el switch explícitamente apagado— sí se bloquea.
 */
export async function servicioPermiteCobro(serviceType?: string | null): Promise<Veredicto> {
  try {
    const r = await pool.query(
      `SELECT config_value FROM system_configurations
        WHERE config_key = 'entregax_payments_enabled' LIMIT 1`
    );
    const cfg = r.rows[0]?.config_value;
    if (!cfg) return { permitido: true };

    if (cfg.enabled === false) {
      return { permitido: false, motivo: 'Los pagos EntregaX están desactivados en Ajustes del Sistema.' };
    }

    const llave = LLAVE_POR_SERVICIO[String(serviceType || '')];
    if (!llave) return { permitido: true }; // servicio desconocido: no se adivina

    if (cfg.by_service && cfg.by_service[llave] === false) {
      return {
        permitido: false,
        motivo: `El servicio ${NOMBRE_BONITO[llave] || llave} tiene los pagos desactivados en Ajustes del Sistema. ` +
                `Actívalo ahí si quieres volver a generar y cobrar órdenes de este servicio.`,
      };
    }
    return { permitido: true };
  } catch (e: any) {
    console.warn('[servicioPermiteCobro] no se pudo leer la configuración, se deja pasar:', e?.message);
    return { permitido: true };
  }
}

/**
 * Atajo para las rutas: si el servicio está apagado responde 409 y devuelve
 * true, para que quien llama corte con `if (await bloqueadoPorServicio(...)) return;`.
 */
export async function bloqueadoPorServicio(
  res: any,
  serviceType?: string | null,
  contexto?: string
): Promise<boolean> {
  const v = await servicioPermiteCobro(serviceType);
  if (v.permitido) return false;
  console.warn(`[servicio-apagado] ${contexto || 'orden'} rechazada · service_type=${serviceType} · ${v.motivo}`);
  res.status(409).json({ error: 'servicio_desactivado', message: v.motivo, service_type: serviceType });
  return true;
}
