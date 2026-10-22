/**
 * Le pone contexto a los titulos de las tareas que ya nacieron de un ticket
 * (tarea 873): quien lo reporto y de que va, ademas del folio.
 *
 * Usa el MISMO ayudante que el backend para que un titulo viejo y uno nuevo se
 * vean igual.
 *
 * En seco por defecto. Para aplicar: npx tsx scripts/backfill_titulos_tareas_ticket.ts --aplicar
 */
import { pool } from '../src/db';
import { tituloDeTareaDeTicket } from '../src/supportController';

const APLICAR = process.argv.includes('--aplicar');

(async () => {
  const r = await pool.query(`
    SELECT t.id, t.title, t.status, s.subject, s.category, u.full_name AS reportante,
           (SELECT m.message FROM ticket_messages m
             WHERE m.ticket_id = s.id AND COALESCE(m.sender_type,'') <> 'agent'
             ORDER BY m.id LIMIT 1) AS primer_texto
      FROM tasks t
      JOIN support_tickets s
        ON s.ticket_folio = substring(t.title from 'TKT-[0-9]{4}-[0-9]+')
      LEFT JOIN users u ON u.id = s.user_id
     WHERE t.title ~ 'TKT-[0-9]{4}-[0-9]+'
       AND t.status <> 'cancelled'
       -- Solo los titulos que el backend construye con contexto. El de
       -- "Retraso" se deja igual A PROPOSITO: su flujo busca la tarea por
       -- titulo exacto en otros dos lugares y renombrarla la dejaria huerfana.
       --
       -- 'TKT-%' cubre las de error ya renombradas, que arrancan con el folio;
       -- 'Error localizado %' las que todavia traigan el prefijo viejo. Asi el
       -- script se puede volver a correr sin dejar fuera a las que ya toco.
       AND (t.title LIKE 'TKT-%'
         OR t.title LIKE 'Error localizado %'
         OR t.title LIKE 'Consulta a Juan Carlos %'
         OR t.title LIKE 'Ticket de servicio con inconformidad reportado %')
     ORDER BY t.id`);

  console.log(`${r.rows.length} tareas con titulo sin contexto\n`);
  let n = 0;
  for (const x of r.rows) {
    // El titulo se recorta a su base y se vuelve a armar. La base de las
    // tareas de error ya NO lleva el prefijo "Error localizado": es el folio
    // solo, porque todas decian lo mismo y gastaba el espacio util (tarea
    // 873). Las otras dos conservan su etiqueta, que si distingue el flujo.
    const primero = String(x.title).split(' · ')[0].trim();
    const base = primero.replace(/^Error localizado\s+/i, '');
    const nuevo = tituloDeTareaDeTicket(base, {
      texto: x.primer_texto || x.subject, category: x.category, reportante: x.reportante,
    });
    if (nuevo === base) continue;
    n++;
    console.log(`#${String(x.id).padEnd(4)} ${nuevo}`);
    if (APLICAR) await pool.query(`UPDATE tasks SET title = $1, updated_at = NOW() WHERE id = $2`, [nuevo, x.id]);
  }
  console.log(`\n${n} titulos ${APLICAR ? 'actualizados' : 'cambiarian'}`);
  console.log(APLICAR ? 'APLICADO.' : '(en seco — usa --aplicar)');
  await pool.end();
})();
