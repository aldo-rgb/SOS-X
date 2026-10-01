/**
 * ¿Esta paquetería cobra flete nacional, y cuánto?
 *
 * La regla vivía copiada en tres lugares —el panel del cliente en la web, el
 * cálculo del saldo que ve la app, y el alta de instrucciones— y cada copia
 * adivinaba leyendo la clave de la paquetería:
 *
 *     if (!clave.includes('local')) cobrar $400
 *
 * Eso se rompió con 'entregax_pobox', que se llama "Entregax Local" y es
 * nuestra entrega local, pero cuya CLAVE no dice "local". A cada guía se le
 * sumaban $400 de Paquete Express que nadie iba a cobrar: la orden de Oscar
 * Cortez (S186) pedía $1,852.08 por dos guías que valían $1,153.22
 * (TKT-2026-2955).
 *
 * Aquí queda la regla una sola vez, y `revisarCatalogoDeFletes` la contrasta
 * contra el catálogo real al arrancar. Así, el día que alguien dé de alta una
 * paquetería nueva con su propia tarifa, se entera por el log y no por un
 * cliente que reclama un cobro que no le toca.
 */
import { pool } from './db';

/**
 * Lo que se cobra cuando hay paquetería nacional de verdad y todavía no hay
 * cotización. Es el piso de Paquete Express, no un precio de lista.
 */
export const FLETE_FALLBACK_MXN = 400;

/**
 * Paqueterías que NO cobran flete aparte: las nuestras y las que el cliente
 * paga directo al transportista o recoge él mismo.
 *
 * El prefijo `entregax` es a propósito: cubre las que existen y las que se den
 * de alta después, sin depender de que alguien se acuerde de volver aquí.
 */
export function paqueteriaSinFlete(clave: string | null | undefined): boolean {
  const k = String(clave || '').trim().toLowerCase();
  if (!k) return true;
  if (k.startsWith('entregax')) return true;
  if (k.includes('local') || k.includes('pickup') || k.includes('pick up')) return true;
  return ['bodega', 'rack', 'piso', 'tarima'].includes(k);
}

/**
 * Revisa el catálogo al arrancar y avisa de las paqueterías que tienen su
 * propia tarifa configurada y aun así recibirían el fallback de $400.
 *
 * Es el caso exacto que se nos coló: `entregax_pobox` tenía $99 por caja y
 * gratis desde 3 bien capturados, y el código los ignoraba porque su clave no
 * parecía local. Nunca lanza: un aviso de configuración no puede impedir que el
 * servidor levante.
 */
export async function revisarCatalogoDeFletes(): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT carrier_key, name, price_label, price_per_package, free_from_qty
         FROM carrier_service_options
        WHERE COALESCE(is_active, true) = true`);

    for (const c of r.rows) {
      if (paqueteriaSinFlete(c.carrier_key)) continue;

      // Tarifa propia: precio por caja capturado, o una etiqueta con número
      // ("$99"). "API" y "Por cobrar" no son tarifa.
      //
      // El `!= null` no es adorno: sin él, Number(null) da 0 y el aviso marcaba
      // las 12 paqueterías que NO tienen tarifa. Un aviso que grita de más se
      // deja de leer el primer día.
      const crudo = String(c.price_label || '').replace(/[^0-9.]/g, '');
      const suya = c.price_per_package != null && Number.isFinite(Number(c.price_per_package))
        ? Number(c.price_per_package)
        : (crudo !== '' ? parseFloat(crudo) : null);
      if (suya === null) continue;

      // Si su tarifa ES el fallback, da lo mismo y no hay nada que avisar.
      if (Math.abs(suya - FLETE_FALLBACK_MXN) < 0.01) continue;

      // Y solo importa si hay guías vivas que se cobrarían mal. Una paquetería
      // mal configurada sin guías pendientes no le cuesta un peso a nadie, y
      // avisarla cada arranque solo entrena a la gente a ignorar el aviso.
      const vivas = await pool.query(
        `SELECT COUNT(*)::int AS n FROM packages
          WHERE LOWER(COALESCE(national_carrier,'')) = $1
            AND COALESCE(national_shipping_cost, 0) = 0
            AND COALESCE(client_paid, false) = false
            AND status <> 'delivered'`, [String(c.carrier_key).toLowerCase()]);
      const n = Number(vivas.rows[0]?.n || 0);
      if (n === 0) continue;

      console.warn(
        `[flete] "${String(c.name || '').trim()}" (${c.carrier_key}) cobra $${suya} en el catálogo, ` +
        `pero a ${n} guía(s) sin cotizar se les está poniendo el fallback de $${FLETE_FALLBACK_MXN}. ` +
        `Son $${((FLETE_FALLBACK_MXN - suya) * n).toFixed(2)} de diferencia. ` +
        `Si es paquetería nuestra, agrégala en paqueteriaSinFlete (fleteNacional.ts); ` +
        `si no, deja el flete grabado en la guía al asignar instrucciones.`);
    }
  } catch (e: any) {
    console.warn('[flete] no se pudo revisar el catálogo:', e?.message);
  }
}
