/**
 * Avisos programados: anunciar una mejora a la gente que de verdad la puede usar.
 *
 * Dos cosas que no son obvias:
 *
 * 1. La audiencia se guarda como CLAVE y se resuelve AL ENVIAR, no al
 *    programar. Si entre que se programa y la hora del aviso alguien recibe el
 *    permiso, le llega; y si se lo quitan, no. Anunciarle a una persona un
 *    botón que no puede ver es peor que no avisarle: la manda a buscar algo
 *    que no existe para ella.
 *
 * 2. Si a una persona le tocan tres mejoras, recibe UNA notificación con las
 *    tres adentro, no tres seguidas. Una ráfaga suena como metralleta y lo
 *    único que enseña es a ignorar los avisos.
 */

import { pool } from './db';

/**
 * Cada audiencia es una consulta que devuelve ids. Se define por PERMISO y no
 * por rol: el rol dice a qué se dedica alguien, el permiso dice qué puede
 * abrir, y para un aviso lo que importa es lo segundo.
 */
const AUDIENCIAS: Record<string, string> = {
  // Nota: los super_admin quedan fuera de los anuncios. Entran a todo por
  // nivel, así que si no se excluyen aparecen en casi toda audiencia — y
  // anunciarle a alguien la mejora que acaba de pedir es puro ruido.

  // Quien puede abrir Cargos por Validar (impuestos DHL).
  cargos_validar: `
    SELECT u.id FROM users u
     WHERE COALESCE(u.is_active,true) AND u.deleted_at IS NULL
       AND u.role <> 'super_admin'
       AND ( u.role IN ('admin','director')
             OR EXISTS (SELECT 1 FROM user_panel_permissions p
                         WHERE p.user_id = u.id AND p.panel_key = 'cs_cargos_validar' AND p.can_view) )`,

  // Contabilidad: a quien le toca el candado de mes de facturación.
  contabilidad: `
    SELECT u.id FROM users u
     WHERE COALESCE(u.is_active,true) AND u.deleted_at IS NULL
       AND u.role IN ('accountant','finanzas')`,

  // Quien puede usar el botón Investigar de los tickets. Es capacidad de
  // Cajito, que se da persona por persona.
  cajito_investigar: `
    SELECT u.id FROM users u
     WHERE COALESCE(u.is_active,true) AND u.deleted_at IS NULL
       AND u.role IN ('customer_service','soporte_tecnico','admin','director')
       AND EXISTS (SELECT 1 FROM cajito_user_capabilities c
                    WHERE c.user_id = u.id AND c.capability = 'cajito.access' AND c.granted)`,

  // Todos los asesores, incluidos los sub-asesores.
  asesores: `
    SELECT u.id FROM users u
     WHERE COALESCE(u.is_active,true) AND u.deleted_at IS NULL
       AND u.role IN ('advisor','sub_advisor')
       AND COALESCE(u.hide_from_commission_board, false) = false`,

  // Quien puede subir videos: los roles internos más quien tenga el panel
  // (así entran Gaona y Román, que son branch_manager).
  videos: `
    SELECT u.id FROM users u
     WHERE COALESCE(u.is_active,true) AND u.deleted_at IS NULL
       AND ( u.role IN ('customer_service','soporte_tecnico')
             OR EXISTS (SELECT 1 FROM user_panel_permissions p
                         WHERE p.user_id = u.id AND p.panel_key = 'videos_adjuntar' AND p.can_view) )`,
};

async function resolverAudiencia(clave: string): Promise<number[]> {
  const sql = AUDIENCIAS[clave];
  if (!sql) { console.warn(`[avisos] audiencia desconocida: ${clave}`); return []; }
  const r = await pool.query(sql);
  return r.rows.map((x: any) => Number(x.id)).filter(Boolean);
}

/**
 * Manda los avisos que ya tocan. Corre cada pocos minutos; es idempotente
 * porque marca enviado_at al terminar.
 */
export async function enviarAvisosPendientes(): Promise<{ avisos: number; personas: number }> {
  const due = await pool.query(
    `SELECT id, audiencia, titulo, mensaje, action_url
       FROM avisos_programados
      WHERE estado = 'programado' AND enviado_at IS NULL AND enviar_at <= NOW()
      ORDER BY enviar_at ASC, id ASC`);
  if (due.rows.length === 0) return { avisos: 0, personas: 0 };

  // Se juntan por persona ANTES de mandar nada: una notificación con todo lo
  // que le toca, no una por mejora.
  const porPersona = new Map<number, { titulo: string; mensaje: string; url: string | null }[]>();
  for (const a of due.rows) {
    const ids = await resolverAudiencia(a.audiencia);
    for (const uid of ids) {
      const lista = porPersona.get(uid) || [];
      lista.push({ titulo: a.titulo, mensaje: a.mensaje, url: a.action_url || null });
      porPersona.set(uid, lista);
    }
  }

  const { createCustomNotification } = await import('./notificationController');
  const { sendPushToUsers } = await import('./pushService');

  const destinatarios: number[] = [];
  for (const [uid, items] of porPersona.entries()) {
    const unaSola = items.length === 1;
    const titulo = unaSola ? items[0]!.titulo : `${items.length} mejoras nuevas para ti`;
    const cuerpo = unaSola
      ? items[0]!.mensaje
      : items.map((i, n) => `${n + 1}. ${i.titulo}: ${i.mensaje}`).join('\n\n');
    await createCustomNotification(
      uid, titulo, cuerpo, 'info', 'sparkles',
      { screen: 'Notifications', tipo: 'mejoras' },
      unaSola ? (items[0]!.url || undefined) : undefined
    ).catch(() => {});
    destinatarios.push(uid);
  }

  if (destinatarios.length > 0) {
    // El push lleva solo el encabezado: el detalle está en la notificación,
    // que sí se puede leer completa.
    await sendPushToUsers(destinatarios, {
      title: 'Novedades de EntregaX',
      body: 'Hay mejoras nuevas en las pantallas que usas. Ábrelas para verlas.',
      data: { screen: 'Notifications' },
      notificationType: 'mejoras_producto',
    }).catch(() => {});
  }

  await pool.query(
    `UPDATE avisos_programados SET enviado_at = NOW(), estado = 'enviado', enviados = $2 WHERE id = ANY($1::int[])`,
    [due.rows.map((a: any) => a.id), destinatarios.length]);

  await copiaASuperAdmins(due.rows, porPersona).catch((e) =>
    console.error('[avisos] no se pudo mandar la copia a super admins:', e?.message));

  console.log(`📣 [avisos] ${due.rows.length} aviso(s) enviados a ${destinatarios.length} persona(s)`);
  return { avisos: due.rows.length, personas: destinatarios.length };
}

/**
 * Copia para los super admins: qué se mandó, con el texto completo, y a quién.
 *
 * No van dentro de las audiencias —entran a todo por nivel y aparecerían en
 * casi todas— pero sí tienen que poder revisar qué salió a nombre de la
 * empresa. Y un aviso que se quedó SIN destinatarios es justo lo que hay que
 * ver: significa que nadie tiene el permiso de la mejora que se anunció.
 */
async function copiaASuperAdmins(
  avisos: any[],
  porPersona: Map<number, { titulo: string; mensaje: string; url: string | null }[]>
): Promise<void> {
  const admins = (await pool.query(
    `SELECT id FROM users
      WHERE role = 'super_admin' AND COALESCE(is_active,true) AND deleted_at IS NULL`
  )).rows.map((x: any) => Number(x.id));
  if (admins.length === 0) return;

  // Quién recibió cada aviso, por título (es la clave con la que se agrupó).
  const nombres = new Map<number, string>();
  if (porPersona.size > 0) {
    const r = await pool.query(
      `SELECT id, full_name FROM users WHERE id = ANY($1::int[])`,
      [[...porPersona.keys()]]);
    r.rows.forEach((u: any) => nombres.set(Number(u.id), String(u.full_name || `#${u.id}`)));
  }
  const recibieron = (titulo: string): string[] => {
    const out: string[] = [];
    for (const [uid, items] of porPersona.entries()) {
      if (items.some((i) => i.titulo === titulo)) out.push(nombres.get(uid) || `#${uid}`);
    }
    return out.sort();
  };

  const cuerpo = textoCopia(
    avisos.map((a: any) => ({ titulo: a.titulo, mensaje: a.mensaje, recibieron: recibieron(a.titulo) })),
    porPersona.size);

  const { createCustomNotification } = await import('./notificationController');
  const { sendPushToUsers } = await import('./pushService');
  for (const uid of admins) {
    await createCustomNotification(
      uid, `Copia: se enviaron ${avisos.length} avisos de mejoras`, cuerpo,
      'info', 'clipboard-check', { screen: 'Notifications', tipo: 'mejoras_copia' }
    ).catch(() => {});
  }
  await sendPushToUsers(admins, {
    title: 'Copia de los avisos enviados',
    body: `${avisos.length} avisos salieron a ${porPersona.size} personas. Ábrelo para ver qué y a quién.`,
    data: { screen: 'Notifications' },
    notificationType: 'mejoras_producto',
  }).catch(() => {});
}

/**
 * El texto de la copia. Aparte del envío para poder verlo ANTES de la hora:
 * un aviso mal redactado o dirigido a nadie se corrige antes, no después.
 */
export function textoCopia(
  avisos: { titulo: string; mensaje: string; recibieron: string[] }[],
  totalPersonas: number
): string {
  const bloques = avisos.map((a, n) => {
    const quien = a.recibieron.length
      ? `Le llega a ${a.recibieron.length}: ${a.recibieron.join(', ')}`
      : 'NO le llega a nadie: no hay quien tenga ese permiso.';
    return `${n + 1}. ${a.titulo}\n   ${quien}\n   Texto: ${a.mensaje}`;
  });
  // join ya mete la línea en blanco entre bloques; un '' extra la duplicaba.
  return [
    `Se enviaron ${avisos.length} aviso(s) a ${totalPersonas} persona(s). Esto es lo que salió:`,
    ...bloques,
  ].join('\n\n');
}

/** Para revisar antes de la hora a quién le va a llegar y qué. */
export async function previsualizarAvisos(): Promise<any> {
  const r = await pool.query(
    `SELECT id, audiencia, titulo, mensaje, enviar_at, enviado_at, enviados
       FROM avisos_programados ORDER BY enviar_at ASC, id ASC`);
  const out: any[] = [];
  for (const a of r.rows) {
    const ids = a.enviado_at ? [] : await resolverAudiencia(a.audiencia);
    const gente = ids.length
      ? (await pool.query(`SELECT id, full_name, role FROM users WHERE id = ANY($1::int[]) ORDER BY role, full_name`, [ids])).rows
      : [];
    out.push({ ...a, destinatarios: gente });
  }
  // La copia exacta que le va a llegar al super admin, para poder corregir el
  // texto o los destinatarios antes de la hora y no despues.
  const pendientes = out.filter((a) => !a.enviado_at);
  const personas = new Set<number>();
  pendientes.forEach((a) => a.destinatarios.forEach((u: any) => personas.add(Number(u.id))));
  const copia = pendientes.length
    ? textoCopia(
        pendientes.map((a) => ({
          titulo: a.titulo,
          mensaje: a.mensaje,
          recibieron: a.destinatarios.map((u: any) => String(u.full_name)).sort(),
        })),
        personas.size)
    : null;
  return { avisos: out, copia_para_super_admin: copia };
}

// ============================================================
// LO QUE CAJITO PUEDE HACER CON LOS AVISOS
// ============================================================
// La regla, y es la que sostiene todo lo demás:
//
//   CAJITO PROPONE. NUNCA ENVÍA.
//
// Cajito crea siempre en 'borrador', y un borrador no sale jamás — el cron
// solo mira los 'programado'. Pasar de borrador a programado exige que un
// super admin lo autorice, y aun entonces queda una ventana por delante para
// cancelarlo. Importa porque Cajito lee texto escrito por clientes (mensajes
// de tickets): si alguien mete instrucciones ahí y Cajito pudiera enviar, ese
// texto llegaría a cientos de personas a nombre de la empresa.

/** Minutos mínimos entre autorizar y que salga. La ventana para arrepentirse. */
const VENTANA_MINIMA_MIN = 5;

export const AUDIENCIAS_DISPONIBLES = Object.keys(AUDIENCIAS);

/** Cuántas personas tiene una audiencia hoy, con nombres. Para poder decidir. */
export async function aQuienLeLlega(clave: string): Promise<{ total: number; nombres: string[] }> {
  const ids = await resolverAudiencia(clave);
  if (ids.length === 0) return { total: 0, nombres: [] };
  const r = await pool.query(
    `SELECT full_name FROM users WHERE id = ANY($1::int[]) ORDER BY full_name`, [ids]);
  return { total: ids.length, nombres: r.rows.map((x: any) => String(x.full_name)) };
}

/** Cajito propone. Nace como borrador, sin hora: así no puede salir. */
export async function proponerAviso(
  audiencia: string, titulo: string, mensaje: string, userId: number, actionUrl?: string | null
): Promise<any> {
  if (!AUDIENCIAS[audiencia]) {
    return { error: `Audiencia desconocida. Las que existen: ${AUDIENCIAS_DISPONIBLES.join(', ')}` };
  }
  if (!titulo?.trim() || !mensaje?.trim()) return { error: 'Falta el título o el mensaje' };
  const r = await pool.query(
    `INSERT INTO avisos_programados (audiencia, titulo, mensaje, action_url, estado, propuesto_por_cajito, creado_por)
     VALUES ($1,$2,$3,$4,'borrador',TRUE,$5) RETURNING id`,
    [audiencia, titulo.trim(), mensaje.trim(), actionUrl || null, userId]);
  const dest = await aQuienLeLlega(audiencia);
  return {
    id: r.rows[0].id, estado: 'borrador', audiencia,
    le_llegaria_a: dest.total, nombres: dest.nombres,
    nota: 'Es un BORRADOR: no sale hasta que el super admin lo autorice.',
  };
}

/** Corregir un aviso. Solo mientras no se haya enviado. */
export async function editarAviso(
  id: number, campos: { titulo?: string; mensaje?: string; audiencia?: string; action_url?: string | null }
): Promise<any> {
  const a = (await pool.query(`SELECT id, estado FROM avisos_programados WHERE id = $1`, [id])).rows[0];
  if (!a) return { error: 'No existe ese aviso' };
  if (a.estado === 'enviado') return { error: 'Ese aviso ya salió; no se puede cambiar lo que la gente ya leyó.' };
  if (campos.audiencia && !AUDIENCIAS[campos.audiencia]) {
    return { error: `Audiencia desconocida. Las que existen: ${AUDIENCIAS_DISPONIBLES.join(', ')}` };
  }
  const sets: string[] = []; const params: any[] = [];
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue;
    params.push(typeof v === 'string' ? v.trim() : v);
    sets.push(`${k} = $${params.length}`);
  }
  if (sets.length === 0) return { error: 'No hay nada que cambiar' };
  params.push(id);
  await pool.query(`UPDATE avisos_programados SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  const r = (await pool.query(
    `SELECT id, audiencia, titulo, mensaje, estado FROM avisos_programados WHERE id = $1`, [id])).rows[0];
  const dest = await aQuienLeLlega(r.audiencia);
  return { ...r, le_llegaria_a: dest.total, nombres: dest.nombres };
}

/**
 * Autorizar. Es el ÚNICO paso que puede hacer que un aviso salga, y por eso
 * exige super admin. Deja siempre una ventana por delante: si la orden vino de
 * un texto envenenado, hay tiempo de cancelarla antes de que llegue a nadie.
 */
export async function autorizarAviso(
  id: number, userId: number, role: string, minutos?: number
): Promise<any> {
  if (role !== 'super_admin') {
    return { error: 'Solo un super admin puede autorizar el envío de un aviso.' };
  }
  const a = (await pool.query(
    `SELECT id, estado, audiencia, titulo FROM avisos_programados WHERE id = $1`, [id])).rows[0];
  if (!a) return { error: 'No existe ese aviso' };
  if (a.estado === 'enviado') return { error: 'Ese aviso ya salió.' };
  const espera = Math.max(VENTANA_MINIMA_MIN, Number(minutos) || 0);
  await pool.query(
    `UPDATE avisos_programados
        SET estado = 'programado', enviar_at = NOW() + ($2 || ' minutes')::interval,
            autorizado_por = $3, autorizado_at = NOW(), cancelado_at = NULL, cancelado_por = NULL
      WHERE id = $1`,
    [id, String(espera), userId]);
  const dest = await aQuienLeLlega(a.audiencia);
  return {
    id, estado: 'programado', sale_en_minutos: espera,
    le_llega_a: dest.total, nombres: dest.nombres,
    nota: `Queda ${espera} min de margen: se puede cancelar antes de que salga.`,
  };
}

/** Cancelar. Sirve tanto para un borrador como para uno ya autorizado. */
export async function cancelarAviso(id: number, userId: number, role: string): Promise<any> {
  if (role !== 'super_admin') return { error: 'Solo un super admin puede cancelar un aviso.' };
  const a = (await pool.query(`SELECT id, estado FROM avisos_programados WHERE id = $1`, [id])).rows[0];
  if (!a) return { error: 'No existe ese aviso' };
  if (a.estado === 'enviado') return { error: 'Ese aviso ya salió; cancelarlo no lo des-envía.' };
  await pool.query(
    `UPDATE avisos_programados SET estado = 'cancelado', cancelado_at = NOW(), cancelado_por = $2 WHERE id = $1`,
    [id, userId]);
  return { id, estado: 'cancelado' };
}

/** Los avisos que existen, con a quién le llegarían hoy. */
export async function listarAvisos(incluirEnviados = false): Promise<any[]> {
  const r = await pool.query(
    `SELECT id, audiencia, titulo, mensaje, estado, propuesto_por_cajito,
            to_char(enviar_at AT TIME ZONE 'America/Monterrey','DD Mon HH12:MI AM') AS sale_mty,
            enviado_at, enviados
       FROM avisos_programados
      ${incluirEnviados ? '' : "WHERE estado <> 'enviado'"}
      ORDER BY COALESCE(enviar_at, creado_at) ASC, id ASC`);
  const out: any[] = [];
  for (const a of r.rows) {
    const dest = a.estado === 'enviado' ? { total: a.enviados || 0, nombres: [] } : await aQuienLeLlega(a.audiencia);
    out.push({ ...a, le_llega_a: dest.total, nombres: dest.nombres });
  }
  return out;
}

/** Mandarle el aviso SOLO a quien lo pide, para que lo vea como lo verán ellos. */
export async function enviarPreview(id: number, userId: number): Promise<any> {
  const a = (await pool.query(
    `SELECT titulo, mensaje, audiencia FROM avisos_programados WHERE id = $1`, [id])).rows[0];
  if (!a) return { error: 'No existe ese aviso' };
  const dest = await aQuienLeLlega(a.audiencia);
  const { createCustomNotification } = await import('./notificationController');
  await createCustomNotification(
    userId, `VISTA PREVIA · ${a.titulo}`,
    `${a.mensaje}\n\n— Así lo verían las ${dest.total} persona(s) de "${a.audiencia}". Todavía NO se ha enviado.`,
    'info', 'eye', { screen: 'Notifications', tipo: 'aviso_preview', aviso_id: id }
  ).catch(() => {});
  return { enviado_a_ti: true, le_llegaria_a: dest.total };
}

/** Los cambios del sistema, para poder contar qué se hizo. */
export function listarCambios(desde?: string, hasta?: string, area?: string): any[] {
  let todos: any[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    todos = require('./data/cambios.json');
  } catch { return []; }
  const d = desde || '0000-01-01';
  const h = hasta || '9999-12-31';
  const a = area ? String(area).toLowerCase() : null;
  return todos.filter((c: any) =>
    c.fecha >= d && c.fecha <= h && (!a || String(c.area).toLowerCase().includes(a))
  );
}
