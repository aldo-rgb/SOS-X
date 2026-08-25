/**
 * Corrección puntual de la tarea 297.
 *
 * Deja consistentes los tickets que quedaron con `ticket_status = 'finalizado'`
 * aunque su `status` ya no es 'resolved' — se reabrieron antes del arreglo, así
 * que están abiertos pero en el tablero se pintan como cerrados.
 *
 * Solo toca tickets VIVOS (sin archivar, status <> 'resolved'). No reabre nada
 * que de verdad esté cerrado.
 *
 * Uso:  npx ts-node scripts/reabrir_tickets_297.ts          → simulacro
 *       npx ts-node scripts/reabrir_tickets_297.ts --apply  → aplica
 */
require('dotenv').config();
import { Pool } from 'pg';

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CANDIDATOS = `
  SELECT t.id, t.ticket_folio, t.status, t.ticket_status, t.resolved_at,
         t.resolution_time_minutes, u.full_name AS cliente,
         (SELECT sender_type || ' · ' || to_char(created_at, 'DD-Mon HH24:MI')
            FROM ticket_messages
           WHERE ticket_id = t.id AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1) AS ultimo_mensaje
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.user_id
   WHERE t.archived_at IS NULL
     AND t.status <> 'resolved'
     AND t.ticket_status = 'finalizado'
   ORDER BY t.id`;

(async () => {
  const antes = (await pool.query(CANDIDATOS)).rows;
  console.log(`${APPLY ? 'APLICANDO' : 'SIMULACRO'} — ${antes.length} ticket(s) por corregir\n`);
  for (const t of antes) {
    console.log(`  ${t.ticket_folio}  ${t.cliente || '—'}`);
    console.log(`     status ${t.status} · ticket_status ${t.ticket_status} → en_progreso`);
    console.log(`     ultimo mensaje: ${t.ultimo_mensaje || '—'}\n`);
  }
  if (!antes.length) { await pool.end(); return; }

  if (!APPLY) {
    console.log('Sin cambios. Corre con --apply para aplicar.');
    await pool.end();
    return;
  }

  const r = await pool.query(`
    UPDATE support_tickets
       SET ticket_status = 'en_progreso',
           resolved_at = NULL,
           resolution_time_minutes = NULL,
           updated_at = NOW()
     WHERE archived_at IS NULL
       AND status <> 'resolved'
       AND ticket_status = 'finalizado'
     RETURNING ticket_folio, status, ticket_status`);
  console.log(`Corregidos: ${r.rowCount}`);
  r.rows.forEach((x: any) => console.log(`  ${x.ticket_folio} → ${x.status} / ${x.ticket_status}`));

  const quedan = (await pool.query(CANDIDATOS)).rowCount;
  console.log(`\nVerificacion: quedan ${quedan} inconsistentes (debe ser 0)`);
  await pool.end();
})();
