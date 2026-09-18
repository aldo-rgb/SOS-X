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

const PREFIJO_SUGERENCIA = '🤖 Cajito sugiere';

/** Nota interna con la duda y las dos salidas. Una sola por ticket. */
const sugerirEnTicket = async (ticketId: number, v: any): Promise<void> => {
  const ya = await pool.query(
    `SELECT 1 FROM ticket_messages WHERE ticket_id = $1 AND is_internal = TRUE AND message LIKE $2 LIMIT 1`,
    [ticketId, `${PREFIJO_SUGERENCIA}%`]);
  if (ya.rows.length) return;
  const entendi = String(v.reclamo || '').trim();
  const paraJuanCarlos = v.escalar_a === 'juan_carlos';
  const paraSistemas = v.escalar_a === 'sistema';
  const motivo = paraSistemas
    ? `esto es un cambio en el sistema, le toca a Sistemas${v.motivo_escalar ? ` (${String(v.motivo_escalar).trim()})` : ''}.`
    : paraJuanCarlos
    ? `esto es para Juan Carlos: piden un mejor precio a cambio de comprar más${v.motivo_escalar ? ` (${String(v.motivo_escalar).trim()})` : ''}.`
    : v.conclusion === 'DECISION'
      ? 'esto no se resuelve en el sistema: lo tiene que decidir una persona.'
      : `no alcancé a resolverlo${v.falto ? ` — ${String(v.falto).trim()}` : '.'}`;
  const texto = [
    `${PREFIJO_SUGERENCIA}: ${motivo}`,
    entendi ? `Lo que entendí: ${entendi}` : '',
    paraSistemas
      ? 'Si están de acuerdo, usen «Reportar error» en este ticket: le llega a Sistemas para evaluarlo.'
      : paraJuanCarlos
      ? 'Si están de acuerdo, usen «Escalar a Juan Carlos» en este ticket.'
      : 'Ustedes deciden: si lo pueden resolver aquí, respondan al cliente; si no, usen «Escalar a Juan Carlos» en este ticket.',
  ].filter(Boolean).join('\n\n');
  await pool.query(
    `INSERT INTO ticket_messages (ticket_id, sender_type, message, is_internal) VALUES ($1, 'agent', $2, TRUE)`,
    [ticketId, texto]);
};

/**
 * Lo que es de OPERACIÓN no es de desarrollo.
 *
 * Una guía que llegó a la bodega y nadie capturó no la arregla un programador:
 * la captura quien recibe. Antes eso salía como ERROR_SISTEMA y aterrizaba en
 * el tablero de errores, urgente, en la bandeja de Aldo (TKT-2026-2734). Ahora
 * queda como nota en el ticket, con el CEDIS que parece tocarle; quien asigna
 * es Servicio a Cliente, no Cajito.
 */
const CEDIS_POR_TEXTO: Array<[RegExp, string]> = [
  [/\b(usa|hidalgo|laredo|mcallen|texas)\b/i, 'HGO'],
  [/\b(mty|monterrey)\b/i, 'MTY'],
  [/\b(cdmx|mexico|méxico)\b/i, 'CDMX'],
  [/\b(gdl|guadalajara)\b/i, 'GDL'],
];

const responsableDeOperacion = async (ticketId: number): Promise<{ id: number; nombre: string; cedis: string } | null> => {
  const m = await pool.query(
    `SELECT string_agg(message, ' ') AS texto FROM ticket_messages WHERE ticket_id = $1 AND COALESCE(is_internal, false) = false`,
    [ticketId]);
  const texto = String(m.rows[0]?.texto || '');
  const cedis = CEDIS_POR_TEXTO.find(([re]) => re.test(texto))?.[1];
  if (!cedis) return null;
  const r = await pool.query(
    `SELECT u.id, u.full_name FROM users u
       JOIN branches b ON b.id = u.branch_id
      WHERE UPPER(b.code) = $1 AND u.role = 'branch_manager'
        AND COALESCE(u.is_active, true) AND u.deleted_at IS NULL
      ORDER BY u.id LIMIT 1`, [cedis]);
  const u = r.rows[0];
  return u ? { id: Number(u.id), nombre: String(u.full_name), cedis } : null;
};

const notaDeOperacion = async (ticketId: number, v: any): Promise<void> => {
  const t = (await pool.query(`SELECT ticket_folio FROM support_tickets WHERE id = $1`, [ticketId])).rows[0];
  const folio = t?.ticket_folio || `ticket ${ticketId}`;
  const ya = await pool.query(
    `SELECT 1 FROM ticket_messages WHERE ticket_id = $1 AND is_internal = TRUE AND message LIKE '📦 Cajito%' LIMIT 1`,
    [ticketId]);
  if (ya.rows.length) return;

  const quien = await responsableDeOperacion(ticketId);
  const texto = [
    // El encabezado era una afirmación tajante ("esto NO es un error del sistema")
    // y quien lo leía dejaba de buscar. Cuando se equivoca, manda a todos por el
    // camino falso (TKT-2026-2767). Ahora dice de quién es la lectura.
    '📦 Cajito: por lo que alcanzo a ver, aquí no hay nada roto que reparar; falta que alguien haga o registre algo. Si al revisarlo resulta que sí es del sistema, repórtenlo.',
    v.reclamo ? `Lo que reportan: ${v.reclamo}` : '',
    v.explicacion || '',
    quien
      ? `Por lo que dice el ticket, le toca al CEDIS ${quien.cedis} (${quien.nombre}). Ustedes deciden a quién se lo asignan y le levantan la tarea desde el tablero.`
      : 'No alcancé a identificar a qué CEDIS o área le toca: ustedes deciden a quién asignárselo y le levantan la tarea.',
  ].filter(Boolean).join('\n\n');

  await pool.query(
    `INSERT INTO ticket_messages (ticket_id, sender_type, message, is_internal) VALUES ($1, 'agent', $2, TRUE)`,
    [ticketId, texto]).catch(() => {});
  console.warn(`[JUEZ] ${folio}: OPERACION → nota para Servicio a Cliente${quien ? ` (sugerido: ${quien.cedis})` : ''}`);
};

/** Guarda el veredicto en el ticket para que la pantalla lo pueda mostrar. */
const guardarVeredicto = async (ticketId: number, v: any): Promise<void> => {
  await pool.query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS metadata JSONB`).catch(() => {});
  await pool.query(
    `UPDATE support_tickets
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('cajito', $2::jsonb),
            updated_at = NOW()
      WHERE id = $1`,
    // Se guarda COMPLETA, con todo lo que pinta el diálogo de Investigar: desde
    // que el botón muestra esta misma investigación en vez de hacer otra, lo
    // que no quede aquí no lo ve nadie.
    [ticketId, JSON.stringify({
      conclusion: v.conclusion,
      pudo: v.pudo,
      es_error_sistema: v.es_error_sistema,
      reclamo: v.reclamo,
      explicacion: v.explicacion,
      para_el_cliente: v.para_el_cliente,
      hallazgos: v.hallazgos,
      folios: v.folios,
      falto: v.falto,
      folio_duda: v.folio_duda,
      hallazgo: v.hallazgo,
      escalar_a: v.escalar_a,
      motivo_escalar: v.motivo_escalar,
      origen: v.origen,
      revisado_at: new Date().toISOString(),
      automatico: v.origen === 'automatico',
    })]
  );
};

/**
 * Investigaciones en curso, por ticket. Si dos personas aprietan Investigar a la
 * vez —o una aprieta mientras el juez del alta todavía corre—, comparten la
 * MISMA investigación en vez de lanzar dos que además podrían concluir distinto.
 */
const enCurso = new Map<number, Promise<any | null>>();

/**
 * Revisa un ticket y, si resulta ser un error nuestro, lo reporta. Devuelve el
 * veredicto guardado, o null si no se pudo.
 * No lanza nunca: cualquier falla se queda en el log.
 */
export const revisarTicketAlNacer = (
  ticketId: number,
  origen: 'automatico' | 'boton' = 'automatico'
): Promise<any | null> => {
  const ya = enCurso.get(ticketId);
  if (ya) return ya;
  const p = revisar(ticketId, origen).finally(() => enCurso.delete(ticketId));
  enCurso.set(ticketId, p);
  return p;
};

const revisar = async (ticketId: number, origen: 'automatico' | 'boton'): Promise<any | null> => {
  try {
    const juez = await superAdminParaJuez();
    if (!juez) { console.warn('[JUEZ] no hay super admin activo; no se revisa el ticket', ticketId); return null; }

    const { investigarTicketCore } = await import('./cajitoController');
    const v = await investigarTicketCore(ticketId, juez.id, juez.role, origen);
    if (!v?.ok) { console.warn(`[JUEZ] ticket ${ticketId}: no se pudo investigar — ${v?.error || 'sin motivo'}`); return null; }

    await guardarVeredicto(ticketId, v);
    console.log(`[JUEZ] ${v.folio}: ${v.conclusion} (${origen})`);

    // Cuando tiene DUDA —no pudo, o lo que piden lo decide una persona— no se
    // abre nada para Cajito ni para Aldo: se sugiere en el chat del ticket, como
    // nota interna, y Servicio a Cliente decide si lo resuelve o lo escala a
    // Juan Carlos con el botón del ticket (Aldo, 11-sep-2026, a raíz del
    // TKT-2026-2673: una negociación de precio que Cajito "no pudo" y terminó
    // como tarea urgente de Aldo).
    if (['NO_PUDE', 'DECISION'].includes(String(v.conclusion))) {
      await sugerirEnTicket(ticketId, v).catch((e) => console.error('[JUEZ] sugerencia:', e?.message));
    }

    // Se reporta lo que es NUESTRO y hay que reparar: ERROR_SISTEMA y también
    // CAPTURA. Lo segundo lo manda el propio proceso del juez —"un dato mal
    // capturado casi siempre es una validación que falta"— y al medirlo contra
    // casos reales resultó que ahí se le van varios: el cobro de impuesto por
    // caja (TKT-2026-2620) lo llamó CAPTURA y era código nuestro multiplicando
    // la nota.
    if (String(v.conclusion) === 'OPERACION') {
      // No se asigna solo: Servicio a Cliente decide a quién se lo manda.
      await notaDeOperacion(ticketId, v).catch((e) => console.error('[JUEZ] nota de operación:', e?.message));
    }

    if (['ERROR_SISTEMA', 'CAPTURA'].includes(String(v.conclusion))) {
      // El reporte lo levanta el sistema con el mismo camino del botón, para que
      // la tarea salga idéntica a la que crearía una persona.
      const { reportarErrorDeTicket } = await import('./supportController');
      const r = await reportarErrorDeTicket(ticketId, juez.id, [
        v.reclamo ? `Reclamo: ${v.reclamo}` : '',
        ...(Array.isArray(v.hallazgos) ? v.hallazgos.map((h: any) =>
          `· ${h?.dato}: ${h?.valor}${h?.nota ? ` (${h.nota})` : ''}`) : []),
        v.explicacion || '',
        '',
        origen === 'automatico'
          ? '(Lo revisó Cajito solo, al crearse el ticket. Nadie apretó el botón.)'
          : '(Lo investigó Cajito la primera vez que alguien apretó Investigar en este ticket.)',
      ].filter(Boolean).join('\n'));

      if (r?.already) console.log(`[JUEZ] ${v.folio}: ya existía la tarea del error`);
      else if (r?.task_id) console.warn(`[JUEZ] ${v.folio}: ERROR DE SISTEMA reportado solo → tarea ${r.task_id}`);
    }

    const g = await pool.query(`SELECT metadata->'cajito' AS c FROM support_tickets WHERE id = $1`, [ticketId]);
    return g.rows[0]?.c || null;
  } catch (e: any) {
    console.error('[JUEZ] revisarTicketAlNacer:', e?.message || e);
    return null;
  }
};

/**
 * Lo que ve quien aprieta Investigar: la investigación que YA se hizo.
 *
 * Aldo, 11-sep-2026: "cuando aprieten deben ver la investigación que se hizo,
 * no hacer una nueva". Tres razones que lo sostienen:
 *  · Una sola verdad por ticket. El mismo ticket investigado dos veces llegó a
 *    dar veredictos distintos; con dos versiones nadie sabe a cuál creerle.
 *  · Todos ven la misma investigación completa. Antes corría con los permisos
 *    de quien apretaba, y a Servicio a Cliente —sin permisos de consulta—
 *    Cajito le salía a ciegas justo en los tickets que son su trabajo.
 *  · No se paga un modelo por repetir lo que ya está escrito.
 *
 * Si el ticket no tiene investigación (los anteriores al juez, o si el juez
 * falló), se hace UNA vez, por el mismo camino del juez, y queda guardada.
 */
export const investigacionDelTicket = async (ticketId: number): Promise<any | null> => {
  const r = await pool.query(`SELECT metadata->'cajito' AS c FROM support_tickets WHERE id = $1`, [ticketId]);
  if (r.rows.length === 0) return null;
  const guardada = r.rows[0]?.c;
  if (guardada?.conclusion) return { ...guardada, guardada: true };
  const nueva = await revisarTicketAlNacer(ticketId, 'boton');
  return nueva ? { ...nueva, guardada: false } : null;
};
