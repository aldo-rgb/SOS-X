/**
 * Aviso a Dirección cada vez que se da de alta un contenedor.
 *
 * Los contenedores no nacen en un solo lugar: hay SIETE rutas que insertan en
 * `containers` —el correo entrante (dos caminos), la lectura con IA (tres), la
 * sincronización de MJ Customer y la captura manual del panel marítimo—. Colgar
 * el aviso de cada una es la forma segura de que la octava que se agregue nazca
 * sin avisar, que es exactamente como se perdieron las comisiones de la tarea
 * 708.
 *
 * Por eso el aviso se manda desde aquí, mirando la tabla: cualquier alta, venga
 * de donde venga, queda cubierta. La marca `aviso_admin_at` garantiza que cada
 * contenedor se avise UNA sola vez aunque la pasada se repita.
 *
 * Ritmo: ~47 contenedores al mes, o sea uno y medio al día. No es un canal que
 * vaya a saturar a nadie.
 */
import { pool } from './db';
import { sendPushToRole } from './pushService';

/** A quién le llega. */
export const ROLES_AVISO_CONTENEDOR = ['super_admin', 'admin', 'director'];

/**
 * Desde cuándo se avisa.
 *
 * Hay 413 contenedores viejos en la tabla. Sin este corte, la primera pasada
 * mandaría 413 notificaciones de golpe a las tres personas.
 *
 * OJO al comparar: `containers.created_at` es `timestamp without time zone` y
 * guarda hora LOCAL de México, no UTC. Un contenedor dado de alta a las 23:17
 * del 29 se guarda como '2026-09-29 23:17', aunque en UTC ya sea día 30. Por
 * eso el corte se compara contra la fecha tal cual y no contra NOW() en UTC:
 * hacerlo al revés adelanta el corte seis horas y deja fuera, en silencio, todo
 * lo que entre entre las 18:00 y la medianoche.
 */
export const CONTENEDORES_AVISADOS_DESDE = '2026-09-30';

let columnaLista = false;
async function asegurarColumna(): Promise<void> {
  if (columnaLista) return;
  await pool.query(`ALTER TABLE containers ADD COLUMN IF NOT EXISTS aviso_admin_at TIMESTAMP`);
  columnaLista = true;
}

export async function avisarContenedoresNuevos(): Promise<{ avisados: number }> {
  let avisados = 0;
  try {
    await asegurarColumna();

    const r = await pool.query(
      `SELECT c.id, c.container_number, c.bl_number, c.status,
              c.reference_code, r.code AS route_code, c.week_number
         FROM containers c
         LEFT JOIN maritime_routes r ON r.id = c.route_id
        WHERE c.aviso_admin_at IS NULL
          AND c.created_at >= $1::date
        ORDER BY c.created_at
        LIMIT 20`,
      [CONTENEDORES_AVISADOS_DESDE]
    ).catch(async () => pool.query(
      // Si no existe `maritime_routes`, el aviso igual debe salir: la ruta es
      // un dato bonito, no el motivo de la notificación.
      `SELECT c.id, c.container_number, c.bl_number, c.status,
              c.reference_code, NULL AS route_code, c.week_number
         FROM containers c
        WHERE c.aviso_admin_at IS NULL AND c.created_at >= $1::date
        ORDER BY c.created_at LIMIT 20`,
      [CONTENEDORES_AVISADOS_DESDE]
    ));

    for (const c of r.rows) {
      // Se marca ANTES de mandar. Si el push falla, se pierde un aviso; si se
      // marcara después y el proceso muriera a media pasada, el mismo
      // contenedor se avisaría en cada corrida para siempre. Molesta más un
      // aviso repetido cada dos minutos que uno perdido.
      const marca = await pool.query(
        `UPDATE containers SET aviso_admin_at = NOW()
          WHERE id = $1 AND aviso_admin_at IS NULL RETURNING id`, [c.id]);
      if (!marca.rowCount) continue;   // otra pasada se le adelantó

      const detalle = [
        c.bl_number ? `BL ${c.bl_number}` : null,
        c.reference_code ? `Ref ${c.reference_code}` : null,
        c.route_code ? `Ruta ${c.route_code}` : null,
        c.week_number ? `Week ${c.week_number}` : null,
      ].filter(Boolean).join(' · ');

      try {
        await sendPushToRole(ROLES_AVISO_CONTENEDOR, {
          title: '🚢 Contenedor dado de alta',
          body: `${c.container_number || 'Sin número'}${detalle ? ` — ${detalle}` : ''}`,
          data: { tipo: 'container_new', container_id: String(c.id),
                  container_number: String(c.container_number || '') },
          notificationType: 'container_new',
        });
        avisados++;
        console.log(`🚢 [AvisoContenedor] ${c.container_number} avisado a ${ROLES_AVISO_CONTENEDOR.join(', ')}`);
      } catch (e: any) {
        console.warn(`[AvisoContenedor] ${c.container_number}: ${e?.message}`);
      }
    }
  } catch (e: any) {
    console.error('[AvisoContenedor] falló la pasada:', e?.message);
  }
  return { avisados };
}
