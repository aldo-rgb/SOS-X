/**
 * Recordatorio mensual para capturar el precio del contenedor dedicado ELP.
 *
 * El precio se arma con el flete internacional y el costo de liberación del mes,
 * dos datos que solo conoce Atención a Cliente. Sin un empujón nadie los captura:
 * el número de `pricing_tiers` llevaba desde el 31 de julio sin tocarse y el
 * cotizador mostraba 27,000 cuando el real de octubre era 31,900 (tarea 671).
 *
 * Cinco días antes de que termine el mes se levanta UNA tarea con los datos que
 * faltan, para Ricardo Méndez (servicio a cliente) con Juan Segura involucrado.
 *
 * Si nadie captura, el precio anterior se sostiene —así lo pidió Dirección: es
 * preferible cotizar con el del mes pasado que dejar de cotizar— y la tarea se
 * queda abierta. Por eso el aviso no puede depender de que el cotizador falle:
 * el cotizador NO falla, sigue vendiendo al precio viejo. Esta tarea es la única
 * señal.
 */
import { pool } from './db';

/** Quién captura y quién vigila. */
export const RESPONSABLE_PRECIO_ELP = 71;   // Ricardo Mendez — servicio a cliente
export const VIGILA_PRECIO_ELP = 62;        // Juan Segura — admin

/** ¿Hoy faltan 5 días o menos para que termine el mes? */
export function faltanCincoDiasOMenos(hoy: Date = new Date()): boolean {
  const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return (finDeMes - hoy.getDate()) <= 5;
}

/** El mes que está por empezar, como 'YYYY-MM-01'. */
export function periodoSiguiente(hoy: Date = new Date()): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export async function recordarPrecioElp(hoy: Date = new Date()): Promise<{ creada: boolean; faltan: string[] }> {
  const { asegurarEsquemaTarifas } = await import('./elpTarifas');
  await asegurarEsquemaTarifas();

  const per = periodoSiguiente(hoy);
  const mesTexto = per.slice(0, 7);

  // Rutas ELP sin precio capturado para el mes que entra.
  const r = await pool.query(
    `SELECT r.id, r.code
       FROM maritime_routes r
      WHERE COALESCE(r.elp_enabled, false) = TRUE
        AND NOT EXISTS (SELECT 1 FROM elp_precios_mensuales p
                         WHERE p.route_id = r.id AND p.periodo = $1::date)
      ORDER BY r.code`, [per]);
  const faltan = r.rows.map((x: any) => String(x.code));
  if (!faltan.length) return { creada: false, faltan: [] };

  // Una sola tarea por mes: el cron corre a diario durante los últimos cinco
  // días y sin esto levantaría cinco tareas iguales.
  const titulo = `Capturar precio de contenedor dedicado ELP — ${mesTexto}`;
  const yaExiste = await pool.query(
    `SELECT id FROM tasks WHERE title = $1 AND status NOT IN ('cancelled') LIMIT 1`, [titulo]);
  if (yaExiste.rowCount) return { creada: false, faltan };

  const vigentes = await pool.query(
    `SELECT r.code, p.flete_usd, p.liberacion_usd, p.utilidad_usd,
            to_char(p.periodo,'YYYY-MM') AS mes
       FROM maritime_routes r
       JOIN LATERAL (SELECT * FROM elp_precios_mensuales pm
                      WHERE pm.route_id = r.id ORDER BY pm.periodo DESC LIMIT 1) p ON TRUE
      WHERE COALESCE(r.elp_enabled,false) = TRUE`);

  const actuales = vigentes.rows.map((x: any) =>
    `· ${x.code} (${x.mes}): flete ${Number(x.flete_usd).toLocaleString('en-US')} + liberación ` +
    `${Number(x.liberacion_usd).toLocaleString('en-US')} + utilidad ${Number(x.utilidad_usd).toLocaleString('en-US')} = ` +
    `${(Number(x.flete_usd)+Number(x.liberacion_usd)+Number(x.utilidad_usd)).toLocaleString('en-US')} USD`
  ).join('\n') || '· todavía no hay ningún precio capturado';

  const descripcion =
    `Falta el precio de ${mesTexto} para: ${faltan.join(', ')}.\n\n` +
    `Se capturan dos datos por ruta, en Administración → API ELP → Precios:\n` +
    `1. Flete internacional del mes.\n` +
    `2. Costo de liberación con entrega en CDMX.\n` +
    `La utilidad son 5,000 USD y se suma sola.\n\n` +
    `Precio vigente hoy:\n${actuales}\n\n` +
    `Si no se captura, el cotizador SIGUE VENDIENDO al precio anterior: no se ` +
    `detiene ni avisa al cliente. Por eso esta tarea es el único aviso.`;

  const board = await pool.query(
    `SELECT id FROM task_boards WHERE name ILIKE '%desarrollo%' OR name ILIKE '%sistema%' ORDER BY id LIMIT 1`);
  const boardId = board.rows[0]?.id || null;
  if (!boardId) { console.warn('[ELP-precio] no hay tablero donde crear la tarea'); return { creada: false, faltan }; }
  const col = await pool.query(
    `SELECT id FROM task_columns WHERE board_id=$1 ORDER BY sort_order LIMIT 1`, [boardId]);

  const ins = await pool.query(
    `INSERT INTO tasks (board_id, column_id, title, description, assignee_id, eisenhower,
                        created_by, requiere_confirmacion, due_at)
     VALUES ($1,$2,$3,$4,$5,'fuego',$6,TRUE,$7::date) RETURNING id`,
    [boardId, col.rows[0]?.id || null, titulo, descripcion,
     RESPONSABLE_PRECIO_ELP, VIGILA_PRECIO_ELP, per]);
  const taskId = ins.rows[0]?.id;
  if (!taskId) return { creada: false, faltan };

  for (const uid of [RESPONSABLE_PRECIO_ELP, VIGILA_PRECIO_ELP]) {
    await pool.query(`INSERT INTO task_participants (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [taskId, uid]).catch(() => {});
  }

  try {
    const { sendPushToUsers } = await import('./pushService');
    await sendPushToUsers([RESPONSABLE_PRECIO_ELP, VIGILA_PRECIO_ELP], {
      title: '💲 Falta el precio del contenedor dedicado',
      body: `Captura el flete y la liberación de ${mesTexto} para ${faltan.join(', ')}.`,
      data: { task_id: String(taskId) },
      notificationType: 'task_new',
    });
  } catch { /* el push es el extra; la tarea ya quedó */ }

  console.warn(`💲 [ELP-precio] tarea ${taskId}: falta el precio de ${mesTexto} para ${faltan.join(', ')}`);
  return { creada: true, faltan };
}
