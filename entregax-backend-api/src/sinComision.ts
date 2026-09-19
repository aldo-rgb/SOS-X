/**
 * Envíos que NO deben generar comisión.
 *
 * Nace de la sincronización con el sistema anterior: muchas guías viejas ya se
 * pagaron y se enviaron allá, y Soporte Técnico las va marcando en EntregaX para
 * que dejen de verse pendientes. El problema es que la comisión se dispara con
 * la bandera de pago —`payment_status = 'paid' OR client_paid = true` es la
 * condición exacta en `generateCommissionForShipment`—, así que marcarlas
 * generaría miles de comisiones por envíos que el asesor ya cobró (o que nunca
 * le tocaron) en el otro sistema.
 *
 * Por eso la marca NO puede vivir en "no llamar a la función al marcar": tiene
 * que quedar grabada en el envío. Si no, el día que alguien corra
 * `POST /api/admin/commissions/backfill` —que barre todo lo pagado sin
 * comisión— se generarían todas de golpe, meses después y sin que nadie
 * entienda de dónde salieron.
 *
 * El candado vive en `generateCommissionForShipment`, que es el embudo único de
 * las 19 rutas de pago y también del backfill.
 */
import { pool } from './db';

export type TipoEnvio = 'PKG' | 'MAR' | 'DHL' | 'GEX';

let tablaLista = false;

export async function asegurarTablaSinComision(): Promise<void> {
  if (tablaLista) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS envios_sin_comision (
      shipment_type TEXT NOT NULL,
      shipment_id   INTEGER NOT NULL,
      motivo        TEXT NOT NULL,
      marcado_por   INTEGER,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (shipment_type, shipment_id)
    )
  `);
  tablaLista = true;
}

/**
 * ¿Este envío quedó excluido de comisión?
 * Ante cualquier falla devuelve `false`: un error de base no debe dejar a un
 * asesor sin su comisión legítima. El riesgo de marcar de más es peor, pero se
 * cubre con la marca explícita, no negando comisiones por accidente.
 */
export async function envioSinComision(tipo: TipoEnvio, id: number): Promise<boolean> {
  try {
    await asegurarTablaSinComision();
    const r = await pool.query(
      `SELECT 1 FROM envios_sin_comision WHERE shipment_type = $1 AND shipment_id = $2 LIMIT 1`,
      [tipo, id]
    );
    return r.rows.length > 0;
  } catch (e: any) {
    console.error('[SIN-COMISION] no pude revisar la marca:', e?.message);
    return false;
  }
}

/**
 * Marca un envío como excluido de comisión. Idempotente: si ya estaba marcado
 * se respeta el motivo y el autor originales, que son los que explican el caso.
 */
export async function marcarSinComision(
  db: any,
  tipo: TipoEnvio,
  id: number,
  motivo: string,
  marcadoPor: number | null
): Promise<void> {
  await asegurarTablaSinComision();
  await db.query(
    `INSERT INTO envios_sin_comision (shipment_type, shipment_id, motivo, marcado_por)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (shipment_type, shipment_id) DO NOTHING`,
    [tipo, id, motivo, marcadoPor]
  );
}

export const MOTIVO_SISTEMA_ANTERIOR =
  'Sincronización con el sistema anterior: la guía ya se pagó y se envió allá.';
