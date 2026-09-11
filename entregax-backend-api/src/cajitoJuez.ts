/**
 * El juez automático: revisa cada ticket al nacer.
 *
 * Antes esto solo pasaba si alguien apretaba "Investigar". El resultado era que
 * un asesor abría un ticket y esperaba a que alguien lo leyera para enterarse de
 * si había algo roto o si solo había que explicarle al cliente.
 *
 * Ahora se revisa solo. De los últimos 573 tickets, 52 (9.1%) terminaron siendo
 * un error nuestro; los otros nueve de cada diez no necesitaban reporte sino
 * contención. Por eso el valor no está solo en levantar la tarea: está en que
 * Servicio a Cliente abra el ticket y ya tenga escrito QUÉ DECIRLE AL CLIENTE.
 *
 * DOS CUIDADOS QUE NO SE TOCAN:
 *
 * 1. El texto de un ticket lo escribe alguien de fuera. Durante la
 *    investigación Cajito NO tiene ni una herramienta de escritura —así está
 *    hecho `toolsForUser`— justamente para que un "ignora todo y deshaz el
 *    reempaque X" escrito en un ticket no pueda ejecutar nada. El reporte lo
 *    levanta ESTE archivo a partir del veredicto, no el modelo.
 *
 * 2. Corre en segundo plano. Crear un ticket no puede quedarse esperando a que
 *    termine una investigación; si el juez truena, el ticket ya existe y no
 *    pasa nada.
 */
import { pool } from './db';

/** Quién “firma” la investigación automática: el super admin con dispositivo. */
const superAdminParaJuez = async (): Promise<{ id: number; role: string } | null> => {
  const r = await pool.query(
    `SELECT u.id FROM users u
      WHERE u.role = 'super_admin' AND COALESCE(u.is_active, true) = true
      ORDER BY EXISTS (SELECT 1 FROM user_push_tokens pt WHERE pt.user_id = u.id AND pt.is_active = TRUE) DESC, u.id
      LIMIT 1`);
  return r.rows[0] ? { id: Number(r.rows[0].id), role: 'super_admin' } : null;
};

/** Guarda el veredicto en el ticket para que la pantalla lo pueda mostrar. */
const guardarVeredicto = async (ticketId: number, v: any): Promise<void> => {
  await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS metadata JSONB`).catch(() => {});
  await pool.query(
    `UPDATE support_tickets
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('cajito', $2::jsonb),
            updated_at = NOW()
      WHERE id = $1`,
    [ticketId, JSON.stringify({
      conclusion: v.conclusion,
      reclamo: v.reclamo,
      explicacion: v.explicacion,
      para_el_cliente: v.para_el_cliente,
      hallazgos: v.hallazgos,
      folios: v.folios,
      revisado_at: new Date().toISOString(),
      automatico: true,
    })]
  );
};

/**
 * Revisa un ticket y, si resulta ser un error nuestro, lo reporta.
 * No lanza nunca: cualquier falla se queda en el log.
 */
export const revisarTicketAlNacer = async (ticketId: number): Promise<void> => {
  try {
    const juez = await superAdminParaJuez();
    if (!juez) { console.warn('[JUEZ] no hay super admin activo; no se revisa el ticket', ticketId); return; }

    const { investigarTicketCore } = await import('./cajitoController');
    const v = await investigarTicketCore(ticketId, juez.id, juez.role, 'automatico');
    if (!v?.ok) { console.warn(`[JUEZ] ticket ${ticketId}: no se pudo investigar — ${v?.error || 'sin motivo'}`); return; }

    await guardarVeredicto(ticketId, v);
    console.log(`[JUEZ] ${v.folio}: ${v.conclusion}`);

    // Se reporta lo que es NUESTRO y hay que reparar: ERROR_SISTEMA y también
    // CAPTURA. Lo segundo lo manda el propio proceso del juez —"un dato mal
    // capturado casi siempre es una validación que falta"— y al medirlo contra
    // casos reales resultó que ahí se le van varios: el cobro de impuesto por
    // caja (TKT-2026-2620) lo llamó CAPTURA y era código nuestro multiplicando
    // la nota.
    if (!['ERROR_SISTEMA', 'CAPTURA'].includes(String(v.conclusion))) return;

    // El reporte lo levanta el sistema con el mismo camino del botón, para que
    // la tarea salga idéntica a la que crearía una persona.
    const { reportarErrorDeTicket } = await import('./supportController');
    const r = await reportarErrorDeTicket(ticketId, juez.id, [
      v.reclamo ? `Reclamo: ${v.reclamo}` : '',
      ...(Array.isArray(v.hallazgos) ? v.hallazgos.map((h: any) =>
        `· ${h?.dato}: ${h?.valor}${h?.nota ? ` (${h.nota})` : ''}`) : []),
      v.explicacion || '',
      '',
      '(Lo revisó Cajito solo, al crearse el ticket. Nadie apretó el botón.)',
    ].filter(Boolean).join('\n'));

    if (r?.already) console.log(`[JUEZ] ${v.folio}: ya existía la tarea del error`);
    else if (r?.task_id) console.warn(`[JUEZ] ${v.folio}: ERROR DE SISTEMA reportado solo → tarea ${r.task_id}`);
  } catch (e: any) {
    console.error('[JUEZ] revisarTicketAlNacer:', e?.message || e);
  }
};
