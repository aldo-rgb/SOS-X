// ============================================================
// Resumen diario de tareas completadas (6 pm, Monterrey).
//
// Aldo recibía una notificación por cada tarea que alguien completaba: las
// suyas que le confirmaban, las tarjetas de "Atender prospecto", las de otros
// donde solo estaba involucrado. Eran ruido y le quitaban el enfoque.
//
// Regla:
//   - Uno por uno SIGUE llegando el aviso de una tarea que él ENCARGÓ a otra
//     persona ("Entregar decodificador de TV en IZZI"): eso es lo que espera.
//   - Todo lo demás (tareas que él hizo y otro confirmó, donde solo está
//     involucrado, tarjetas de prospecto) se guarda y sale en UN resumen a las
//     6 pm: cuántas se completaron y cuáles.
//
// Solo aplica a quien está en CORREOS_RESUMEN. Los avisos de "confirma para
// cerrarla" no pasan por aquí: piden una acción y siguen llegando al momento.
// De lunes a viernes; lo del fin de semana sale en el resumen del lunes.
// ============================================================
import cron from 'node-cron';
import { pool } from './db';

const CORREOS_RESUMEN = ['aldo@entregax.com'];

let esquemaListo = false;
const ensureSchema = async (): Promise<void> => {
  if (esquemaListo) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_completadas_resumen (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      task_id     INTEGER NOT NULL,
      linea       TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      enviado_at  TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_task_completadas_resumen_pend
      ON task_completadas_resumen(user_id, task_id) WHERE enviado_at IS NULL;`);
  esquemaListo = true;
};

/**
 * Si este aviso de "completada" va al resumen, lo guarda y devuelve true (el
 * que llama ya no manda la notificación). Si debe llegar uno por uno, false.
 * Ante cualquier error devuelve false: mejor un aviso de más que uno perdido.
 */
export async function guardarCompletadaEnResumen(userId: number, taskId: number, linea: string): Promise<boolean> {
  try {
    if (!userId || !taskId) return false;
    const r = await pool.query(
      `SELECT t.created_by, t.assignee_id, t.linked_type, u.email
         FROM tasks t, users u
        WHERE t.id = $1 AND u.id = $2`, [taskId, userId]);
    const x = r.rows[0];
    if (!x || !CORREOS_RESUMEN.includes(String(x.email || '').toLowerCase())) return false;
    const laEncargo = Number(x.created_by) === Number(userId)
      && Number(x.assignee_id) !== Number(userId)
      && String(x.linked_type || '') !== 'lead';
    if (laEncargo) return false;
    await ensureSchema();
    await pool.query(
      `INSERT INTO task_completadas_resumen (user_id, task_id, linea) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, task_id) WHERE enviado_at IS NULL DO NOTHING`,
      [userId, taskId, String(linea || '').replace(/^✅\s*/, '').slice(0, 300)]);
    return true;
  } catch (e: any) {
    console.warn('[resumen completadas] no se pudo guardar:', e?.message);
    return false;
  }
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export async function enviarResumenCompletadas(): Promise<void> {
  try {
    await ensureSchema();
    const r = await pool.query(
      `SELECT user_id, COUNT(*)::int AS n, MIN(created_at) AS desde,
              ARRAY_AGG(linea ORDER BY created_at) AS lineas, ARRAY_AGG(id) AS ids
         FROM task_completadas_resumen
        WHERE enviado_at IS NULL
        GROUP BY user_id`);
    const hoyMty = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date());
    for (const g of r.rows) {
      const n = Number(g.n);
      const desdeMty = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date(g.desde));
      const cuando = desdeMty === hoyMty ? 'hoy'
        : `desde el ${DIAS[new Date(`${desdeMty}T12:00:00`).getDay()]}`;
      const titulo = `✅ ${n} ${n === 1 ? 'tarea completada' : 'tareas completadas'} ${cuando}`;
      const lineas: string[] = g.lineas || [];
      const cuerpo = lineas.slice(0, 8).map(l => `• ${l}`).join('\n')
        + (lineas.length > 8 ? `\n…y ${lineas.length - 8} más` : '');

      const { createCustomNotification } = await import('./notificationController');
      await createCustomNotification(Number(g.user_id), titulo, cuerpo, 'info', 'checkbox', { screen: 'MyTasks', resumen: true }, '/tareas');
      try {
        const { sendPushToUsers } = await import('./pushService');
        await sendPushToUsers([Number(g.user_id)], {
          title: titulo, body: lineas.slice(0, 3).join(' · '),
          data: { screen: 'MyTasks' }, notificationType: 'task_completed',
        });
      } catch { /* el aviso en la app ya quedó */ }

      await pool.query(`UPDATE task_completadas_resumen SET enviado_at = NOW() WHERE id = ANY($1::int[])`, [g.ids]);
      console.log(`✅ [CRON] Resumen de completadas a ${g.user_id}: ${n}`);
    }
  } catch (e: any) {
    console.error('❌ [CRON] Resumen de completadas:', e?.message);
  }
}

export const startResumenCompletadasCron = () => {
  cron.schedule('0 18 * * 1-5', enviarResumenCompletadas, { timezone: 'America/Monterrey' });
  console.log('📅 [CRON] Resumen de tareas completadas: L-V 6:00 pm (MTY)');
};
