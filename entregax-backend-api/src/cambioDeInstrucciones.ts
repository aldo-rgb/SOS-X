/**
 * Cambiar el destino cuando la etiqueta ya se imprimió.
 *
 * Cuando CEDIS imprime la etiqueta, el domicilio ya se le mandó a la
 * paquetería: está en la guía física y en el sistema del carrier. Cambiarlo
 * después en EntregaX solo cambia lo que ve nuestra pantalla — la caja sigue
 * su camino al domicilio viejo, y el cliente, que ve la dirección nueva en su
 * app, da por hecho que se corrigió. Así llegó el TKT-2026-3600: "por
 * cuestiones de sistema no cambió la dirección a Paquete Express y la carga le
 * llegó a otro domicilio" (tarea 1030).
 *
 * Son dos puertas distintas y las dos llevan al mismo lugar:
 *   1. Reasignar instrucciones sobre la guía.
 *   2. EDITAR la dirección guardada que esa guía ya está usando. Esta es la
 *      más silenciosa: no se toca el envío, se le cambia el piso debajo.
 *
 * Medido: 33 guías tienen hoy un CP en la etiqueta distinto al CP de la
 * dirección que traen asignada, 29 de ellas todavía sin entregar.
 *
 * El candado aplica a quien NO puede arreglar la guía —cliente y asesor—. El
 * personal interno sigue pudiendo cambiarla, porque es justo lo que hace al
 * atender el ticket: reetiquetar.
 */
import { pool } from './db';

export const LEYENDA_TICKET =
  'Esta guía ya tiene la etiqueta impresa: el domicilio ya viajó a la paquetería, '
  + 'así que cambiarlo aquí no cambia a dónde llega la caja. '
  + 'Si necesitas otro destino, levanta un ticket con Servicio a Cliente para que CEDIS la reetiquete.';

/** Quien no puede reetiquetar, tampoco debe poder cambiar el destino después. */
export const ROLES_QUE_NO_CAMBIAN = new Set(['client', 'advisor', 'sub_advisor']);

export const noPuedeCambiarTrasEtiqueta = (rol: any): boolean =>
  ROLES_QUE_NO_CAMBIAN.has(String(rol || '').toLowerCase());

type TablaEnvio = 'packages' | 'dhl_shipments' | 'maritime_orders';

/** La guía ya etiquetada, si lo está. `null` si todavía se puede cambiar. */
export async function envioYaEtiquetado(
  tabla: TablaEnvio,
  id: number
): Promise<{ guia: string | null; carrier: string | null } | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const col = tabla === 'packages' ? 'tracking_internal' : 'inbound_tracking';
  const guiaCol = tabla === 'maritime_orders' ? 'ordersn' : col;
  try {
    const r = await pool.query(
      `SELECT ${guiaCol} AS guia, national_carrier, national_tracking, national_label_url, status::text AS status
         FROM ${tabla} WHERE id = $1`,
      [id]
    );
    if (r.rows.length === 0) return null;
    const x = r.rows[0];
    // Entregado o devuelto: ya no hay nada que proteger.
    if (['delivered', 'returned_to_warehouse', 'cancelled'].includes(String(x.status || ''))) return null;
    // La etiqueta impresa es la señal; la guía nacional ya generada también
    // cuenta, porque esa es la que el carrier tiene cargada.
    if (!x.national_label_url && !x.national_tracking) return null;
    return { guia: x.guia || null, carrier: x.national_carrier || null };
  } catch (e: any) {
    // Ante una falla de base no se bloquea: dejar a un cliente sin poder dar
    // instrucciones es peor que el riesgo que esto cubre.
    console.error('[instrucciones] no pude revisar la etiqueta:', e?.message);
    return null;
  }
}

/**
 * Los envíos ya etiquetados que están usando esta dirección.
 *
 * Solo los de los últimos 30 días. Una guía etiquetada hace meses que nunca se
 * marcó entregada es dato viejo, no una caja en camino: dejarla contar aquí le
 * congelaría al cliente esa dirección para siempre por un estatus que nadie
 * cerró. Con el corte, el candado cubre lo que de verdad está viajando.
 */
export async function enviosEtiquetadosConEstaDireccion(
  addressId: number,
  userId: number
): Promise<Array<{ guia: string; carrier: string | null }>> {
  if (!Number.isFinite(addressId) || addressId <= 0) return [];
  try {
    const r = await pool.query(
      `SELECT tracking_internal AS guia, national_carrier
         FROM packages
        WHERE user_id = $2
          AND COALESCE(assigned_address_id, delivery_address_id) = $1
          AND (national_label_url IS NOT NULL OR national_tracking IS NOT NULL)
          AND status::text NOT IN ('delivered','returned_to_warehouse')
          AND COALESCE(national_label_at, updated_at) > NOW() - INTERVAL '30 days'
        UNION ALL
       SELECT inbound_tracking AS guia, national_carrier
         FROM dhl_shipments
        WHERE user_id = $2 AND delivery_address_id = $1
          AND (national_label_url IS NOT NULL OR national_tracking IS NOT NULL)
          AND status NOT IN ('delivered','returned_to_warehouse')
          AND updated_at > NOW() - INTERVAL '30 days'
        LIMIT 20`,
      [addressId, userId]
    );
    return r.rows.map((x: any) => ({ guia: String(x.guia || ''), carrier: x.national_carrier || null }));
  } catch (e: any) {
    console.error('[instrucciones] no pude revisar la direccion:', e?.message);
    return [];
  }
}

/** Los campos que de verdad mueven la caja. El teléfono o la referencia, no. */
export const CAMPOS_DE_DESTINO: Array<{ body: string; col: string; label: string }> = [
  { body: 'street', col: 'street', label: 'la calle' },
  { body: 'exterior_number', col: 'exterior_number', label: 'el número exterior' },
  { body: 'colony', col: 'neighborhood', label: 'la colonia' },
  { body: 'city', col: 'city', label: 'la ciudad' },
  { body: 'state', col: 'state', label: 'el estado' },
  { body: 'zip_code', col: 'zip_code', label: 'el código postal' },
];
