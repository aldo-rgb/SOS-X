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
      WHERE enviado_at IS NULL AND enviar_at <= NOW()
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
    `UPDATE avisos_programados SET enviado_at = NOW(), enviados = $2 WHERE id = ANY($1::int[])`,
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
