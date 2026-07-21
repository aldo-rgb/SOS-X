// ============================================
// Reconcile: enlaza envíos "huérfanos" a su cliente por box_id / shipping_mark.
//
// Un envío puede recibirse (DHL, aéreo, marítimo, packages) con el box_id del
// cliente pero sin user_id — típicamente cuando llega ANTES de que el cliente se
// registre, o DESPUÉS de que ya se registró (la recepción no lo enlaza). En
// ambos casos el envío aparece "Sin alta" y el cliente no lo ve en su app.
//
// box_id es único por cliente, así que el match exacto (UPPER/TRIM) es seguro.
// Idempotente: solo toca filas con user_id IS NULL.
// ============================================
import { pool } from './db';

export async function reconcileOrphanShipments(boxId?: string): Promise<Record<string, number>> {
  // Si se pasa boxId, limita el reconcile a ese casillero (p.ej. al registrarse).
  const filter = boxId ? 'AND UPPER(TRIM(u.box_id)) = UPPER(TRIM($1))' : '';
  const args = boxId ? [boxId] : [];
  const counts: Record<string, number> = {};

  const run = async (label: string, sql: string) => {
    try {
      const r = await pool.query(sql, args);
      counts[label] = r.rowCount || 0;
    } catch (e) {
      console.warn(`[BOX-LINK] ${label}:`, (e as Error).message);
      counts[label] = 0;
    }
  };

  await run('dhl_shipments', `
    UPDATE dhl_shipments s SET user_id = u.id, updated_at = NOW()
    FROM users u
    WHERE s.user_id IS NULL AND u.role = 'client' AND TRIM(COALESCE(s.box_id,'')) <> ''
      AND UPPER(TRIM(s.box_id)) = UPPER(TRIM(u.box_id)) ${filter}
  `);
  await run('china_receipts', `
    UPDATE china_receipts c SET user_id = u.id, updated_at = NOW()
    FROM users u
    WHERE c.user_id IS NULL AND u.role = 'client' AND TRIM(COALESCE(c.shipping_mark,'')) <> ''
      AND UPPER(TRIM(c.shipping_mark)) = UPPER(TRIM(u.box_id)) ${filter}
  `);
  await run('maritime_orders', `
    UPDATE maritime_orders m SET user_id = u.id, updated_at = NOW()
    FROM users u
    WHERE m.user_id IS NULL AND u.role = 'client' AND TRIM(COALESCE(m.shipping_mark,'')) <> ''
      AND UPPER(TRIM(m.shipping_mark)) = UPPER(TRIM(u.box_id)) ${filter}
  `);
  await run('packages_by_box', `
    UPDATE packages p SET user_id = u.id, updated_at = NOW()
    FROM users u
    WHERE p.user_id IS NULL AND u.role = 'client' AND TRIM(COALESCE(p.box_id,'')) <> ''
      AND UPPER(TRIM(p.box_id)) = UPPER(TRIM(u.box_id)) ${filter}
  `);
  // Paquetes aéreos ligados a un receipt ya enlazado (no traen box_id propio).
  await run('packages_via_receipt', `
    UPDATE packages p SET user_id = c.user_id, updated_at = NOW()
    FROM china_receipts c
    WHERE p.user_id IS NULL AND p.china_receipt_id = c.id AND c.user_id IS NOT NULL
  `);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > 0) console.log('[BOX-LINK] Envíos enlazados por box_id:', counts);
  return counts;
}
