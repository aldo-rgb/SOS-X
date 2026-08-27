/**
 * VIGILANCIA DE TICKETS ATRASADOS
 *
 * Dos avisos y una tarea, todos los días a las 11:00 (Monterrey):
 *
 *  1. Resumen a dirección: cuántos tickets llevan más de 3 días hábiles sin
 *     resolver. Va a super_admin, admin y dirección siempre; a Atención a
 *     Cliente y Soporte Técnico solo cuando el atraso es de SU departamento —
 *     avisarle a alguien de un rezago que no puede tocar es ruido.
 *
 *  2. Escalamiento a los cuatro días: el equipo recibe el folio concreto y se
 *     le dice que administración ya está enterada.
 *
 *  3. Una tarea urgente e importante por cada ticket escalado, con los datos
 *     del ticket y con admin y super_admin involucrados. Es el mismo camino que
 *     usan los errores de sistema, pero rotulado como lo que es: un retraso.
 *
 * Cada ticket se escala UNA sola vez (support_tickets.retraso_notified_at).
 */
import { pool } from './db';

const DIAS_AVISO = 3;      // más de 3 días hábiles → entra al resumen
const DIAS_ESCALA = 4;     // más de 4 → se escala y se levanta tarea

/** Días hábiles transcurridos (sábado y domingo no cuentan). Mismo criterio que el tablero de soporte. */
export function diasHabilesDesde(fecha: Date | string): number {
  const inicio = new Date(fecha);
  if (isNaN(inicio.getTime())) return 0;
  inicio.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let n = 0;
  const cur = new Date(inicio);
  while (cur < hoy) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

async function ensureSchema(): Promise<void> {
  await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS retraso_notified_at TIMESTAMP`).catch(() => {});
  await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS retraso_task_id INTEGER`).catch(() => {});
}

export interface TicketAtrasado {
  id: number; folio: string; asunto: string; dias: number;
  departamento: string; department_id: number | null;
  cliente: string | null; escalado: boolean;
}

/** Tickets abiertos con más de `minDias` días hábiles desde que se crearon. */
export async function ticketsAtrasados(minDias: number): Promise<TicketAtrasado[]> {
  await ensureSchema();
  const r = await pool.query(`
    SELECT t.id, t.ticket_folio, t.subject, t.created_at, t.department_id,
           COALESCE(d.name, 'Sin departamento') AS dept,
           u.full_name AS cliente,
           t.retraso_notified_at
      FROM support_tickets t
      LEFT JOIN support_departments d ON d.id = t.department_id
      LEFT JOIN users u ON u.id = t.user_id
     WHERE t.archived_at IS NULL
       AND t.status <> 'resolved'
       AND COALESCE(t.ticket_status, 'nuevo') <> 'finalizado'`);
  return r.rows
    .map((x: any) => ({
      id: Number(x.id),
      folio: x.ticket_folio || `#${x.id}`,
      asunto: String(x.subject || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      dias: diasHabilesDesde(x.created_at),
      departamento: x.dept,
      department_id: x.department_id != null ? Number(x.department_id) : null,
      cliente: x.cliente || null,
      escalado: !!x.retraso_notified_at,
    }))
    .filter(t => t.dias > minDias)
    .sort((a, b) => b.dias - a.dias);
}

/** Usuarios activos de un conjunto de roles. */
async function usuariosPorRol(roles: string[]): Promise<number[]> {
  if (!roles.length) return [];
  const r = await pool.query(
    `SELECT id FROM users WHERE role = ANY($1::text[]) AND COALESCE(is_active, true) = true`, [roles]);
  return r.rows.map((x: any) => Number(x.id));
}

/** Aviso in-app (siempre) + push (topado a horario laboral, salvo administración). */
async function avisar(userIds: number[], titulo: string, cuerpo: string, data: any, ruta: string): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    const { createCustomNotification } = await import('./notificationController');
    for (const uid of ids) {
      await createCustomNotification(uid, titulo, cuerpo, 'ticket', 'alert-circle', data, ruta);
    }
  } catch (e: any) { console.warn('[atrasos] in-app:', e?.message); }
  try {
    const { sendPushToUsers, filterRecipientsForPush } = await import('./pushService');
    const pushIds = await filterRecipientsForPush(ids, true);
    if (pushIds.length) await sendPushToUsers(pushIds, { title: titulo, body: cuerpo, data });
  } catch (e: any) { console.warn('[atrasos] push:', e?.message); }
}

/** Departamento → roles que lo atienden. Mismo mapa que el ruteo de tickets. */
const ROLES_POR_DEPTO: Record<string, string[]> = {
  'Atención a Cliente': ['customer_service'],
  'Cotizaciones': ['customer_service'],
  'Soporte Técnico': ['soporte_tecnico'],
};

/**
 * 1) Resumen diario de tickets con más de 3 días sin resolver.
 */
export async function resumenDiarioTicketsAtrasados(): Promise<{ total: number; avisados: number }> {
  const atrasados = await ticketsAtrasados(DIAS_AVISO);
  if (atrasados.length === 0) {
    console.log('[atrasos] resumen diario: no hay tickets con más de 3 días hábiles.');
    return { total: 0, avisados: 0 };
  }

  const porDepto = new Map<string, number>();
  for (const t of atrasados) porDepto.set(t.departamento, (porDepto.get(t.departamento) || 0) + 1);
  const desglose = [...porDepto.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${d}: ${n}`)
    .join(' · ');
  const elMasViejo = atrasados[0]!;

  // Dirección ve el panorama completo.
  const mando = await usuariosPorRol(['super_admin', 'admin', 'director']);
  const titulo = `⏰ ${atrasados.length} ticket${atrasados.length === 1 ? '' : 's'} con más de ${DIAS_AVISO} días sin resolver`;
  const cuerpo = `El equipo de Servicio a Cliente tiene ${atrasados.length} ticket${atrasados.length === 1 ? '' : 's'} con más de ${DIAS_AVISO} días sin resolver. ${desglose}. El más viejo lleva ${elMasViejo.dias} días (${elMasViejo.folio}).`;
  await avisar(mando, titulo, cuerpo, { type: 'tickets_atrasados', total: atrasados.length }, '/support');

  // Atención a Cliente y Soporte Técnico: solo si el rezago es suyo.
  let avisados = mando.length;
  for (const [depto, roles] of Object.entries(ROLES_POR_DEPTO)) {
    const n = porDepto.get(depto) || 0;
    if (n === 0) continue;
    const equipo = (await usuariosPorRol(roles)).filter(id => !mando.includes(id));
    if (!equipo.length) continue;
    const viejoDelDepto = atrasados.find(t => t.departamento === depto)!;
    await avisar(
      equipo,
      `⏰ ${n} ticket${n === 1 ? '' : 's'} de ${depto} con más de ${DIAS_AVISO} días`,
      `${depto} tiene ${n} ticket${n === 1 ? '' : 's'} con más de ${DIAS_AVISO} días sin resolver. El más viejo lleva ${viejoDelDepto.dias} días (${viejoDelDepto.folio}).`,
      { type: 'tickets_atrasados', department: depto, total: n },
      '/support'
    );
    avisados += equipo.length;
  }
  console.log(`[atrasos] resumen diario: ${atrasados.length} tickets · ${desglose} · avisados ${avisados} usuarios`);
  return { total: atrasados.length, avisados };
}

/**
 * 3) Tarea de retraso: urgente e importante, con admin y super_admin dentro.
 * Devuelve el id de la tarea (o null si no se pudo crear).
 */
async function levantarTareaDeRetraso(t: TicketAtrasado): Promise<number | null> {
  const titulo = `Retraso ${t.folio}`;
  const yaExiste = await pool.query(`SELECT id FROM tasks WHERE title = $1 AND status <> 'cancelled' LIMIT 1`, [titulo]);
  if (yaExiste.rows[0]) return Number(yaExiste.rows[0].id);

  // Responsable: un super_admin, preferentemente con dispositivo para que el
  // aviso llegue de verdad (mismo criterio que los errores de sistema).
  const sa = await pool.query(
    `SELECT u.id, EXISTS (SELECT 1 FROM user_push_tokens pt WHERE pt.user_id = u.id AND pt.is_active = TRUE) AS con_dispositivo
       FROM users u WHERE u.role = 'super_admin' AND COALESCE(u.is_active, true) = true
      ORDER BY con_dispositivo DESC, u.id`);
  const superAdminId = Number(sa.rows[0]?.id || 0);
  if (!superAdminId) { console.warn('[atrasos] no hay super_admin activo para asignar la tarea'); return null; }

  const desc = [
    `⏰ Reporte de retraso · ticket ${t.folio}`,
    `Lleva ${t.dias} días hábiles sin resolverse.`,
    `Departamento: ${t.departamento}`,
    t.cliente ? `Cliente: ${t.cliente}` : '',
    t.asunto ? `Asunto: ${t.asunto}` : '',
  ].filter(Boolean).join('\n');

  const boardRes = await pool.query(
    `SELECT id FROM task_boards WHERE name = 'Error de Sistema' AND is_active = TRUE ORDER BY id LIMIT 1`);
  const { createAssignedTaskInternal } = await import('./tasksController');
  const taskId = await createAssignedTaskInternal({
    creatorId: superAdminId, assigneeId: superAdminId, title: titulo, description: desc,
    eisenhower: 'fuego',            // urgente e importante
    notifyAssignee: false,          // se avisa a todos abajo, sin duplicar
    ...(boardRes.rows[0]?.id ? { boardId: Number(boardRes.rows[0].id) } : {}),
  });
  if (!taskId) return null;

  // Involucrar a administración completa.
  const mando = await usuariosPorRol(['super_admin', 'admin']);
  for (const uid of mando) {
    await pool.query(
      `INSERT INTO task_participants (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [taskId, uid]
    ).catch(() => {});
  }
  await avisar(
    mando,
    `⏰ Retraso · ${t.folio}`,
    `${t.folio} lleva ${t.dias} días hábiles sin resolverse (${t.departamento}). Se levantó la tarea "${titulo}".`,
    { type: 'ticket_retraso', screen: 'MyTasks', task_id: String(taskId), ticket_id: String(t.id) },
    '/tareas'
  );

  // Nota interna en el ticket, para que quede el rastro del escalamiento.
  await pool.query(
    `INSERT INTO ticket_messages (ticket_id, sender_type, message, is_internal) VALUES ($1, 'agent', $2, TRUE)`,
    [t.id, `⏰ Retraso detectado (${t.dias} días hábiles) → tarea "${titulo}" creada y administración notificada.`]
  ).catch(() => {});

  return taskId;
}

/**
 * 2) + 3) Escalamiento de los tickets con más de 4 días: avisa al equipo que
 * los atiende y levanta la tarea. Cada ticket se escala una sola vez.
 */
export async function escalarTicketsMuyAtrasados(): Promise<{ escalados: number }> {
  const pendientes = (await ticketsAtrasados(DIAS_ESCALA)).filter(t => !t.escalado);
  if (pendientes.length === 0) {
    console.log('[atrasos] escalamiento: nada nuevo con más de 4 días.');
    return { escalados: 0 };
  }

  let escalados = 0;
  for (const t of pendientes) {
    const taskId = await levantarTareaDeRetraso(t);
    await pool.query(
      `UPDATE support_tickets SET retraso_notified_at = NOW(), retraso_task_id = $2 WHERE id = $1`,
      [t.id, taskId]
    ).catch(() => {});
    escalados++;
  }

  // Aviso a Servicio a Cliente y Soporte Técnico. Va UN solo mensaje con los
  // folios: diez push seguidos se ignoran, uno con la lista se lee.
  const equipoRoles = [...new Set(Object.values(ROLES_POR_DEPTO).flat())];
  const equipo = await usuariosPorRol(equipoRoles);
  if (equipo.length) {
    const folios = pendientes.map(x => x.folio);
    const titulo = folios.length === 1
      ? `⏰ ${folios[0]} lleva más de ${DIAS_ESCALA} días`
      : `⏰ ${folios.length} tickets llevan más de ${DIAS_ESCALA} días`;
    const cuerpo = folios.length === 1
      ? `El ${folios[0]} tiene más de ${DIAS_ESCALA} días sin ser resuelto. Ya se notificó a administración para buscar una pronta solución.`
      : `${folios.slice(0, 3).join(', ')}${folios.length > 3 ? ` y ${folios.length - 3} más` : ''} tienen más de ${DIAS_ESCALA} días sin ser resueltos. Ya se notificó a administración para buscar una pronta solución.`;
    await avisar(equipo, titulo, cuerpo, { type: 'ticket_retraso', total: folios.length }, '/support');
  }

  console.log(`[atrasos] escalados ${escalados} ticket(s) con más de ${DIAS_ESCALA} días hábiles.`);
  return { escalados };
}

/** Corrida diaria completa (la llama el cron de las 11:00). */
export async function revisarTicketsAtrasados(): Promise<void> {
  try {
    await ensureSchema();
    await escalarTicketsMuyAtrasados();
    await resumenDiarioTicketsAtrasados();
  } catch (e: any) {
    console.error('[atrasos] revisarTicketsAtrasados:', e?.message || e);
  }
}
