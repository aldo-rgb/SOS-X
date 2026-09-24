// ============================================
// MÓDULO TCG — el tramo mexicano del contenedor
//
// TCG es el transportista que recoge la carga del otro lado y la baja hasta el
// destino. Sus tres movimientos ya tenían lugar reservado en la línea de tiempo
// (containerTimeline: pasos 8, 9, 11 y 12, marcados "Manual (TCG)"), pero no
// había por dónde capturarlos: dependían del sistema de ellos, que es de un
// tercero, y nadie aquí los veía (tarea 654).
//
// Las tres etapas van en cascada y cada una solo deja escoger de lo que cumplió
// la anterior. Esa es toda la regla:
//
//   CRUCE      ← solo contenedores que el almacén de El Paso marcó como
//                shipped (paso 6, que entra solo por correo). Se confirma
//                cuando la carga llegó a la yarda de Ciudad Juárez.
//   TRÁNSITO   ← solo los que ya tienen Cruce Finalizado.
//   ENTREGA    ← solo los que ya van en tránsito.
//
// La fecha y hora NO se capturan: las pone el sistema al momento de la acción,
// que es lo que pidió Juan. Lo que sí se captura es la caja seca y el sello,
// y vienen precargados del correo del almacén.
// ============================================

import { Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';
import { ensureLineaTiempo, registrarPaso, aplicarEstatusDelPaso } from './containerTimeline';

/** Qué paso de la línea de tiempo escribe cada etapa, y cuál exige antes. */
const ETAPAS = {
  cruce: {
    requiere: 6,            // salida del almacén de El Paso (correo)
    escribe: [8],           // llegada a patio Ciudad Juárez = "Cruce Finalizado"
    yaHecho: 8,
    etiqueta: 'Cruce finalizado',
  },
  transito: {
    requiere: 8,
    // Salir del patio y arrancar a destino son el mismo momento: se registran
    // los dos para no dejar un hueco en la línea de tiempo.
    escribe: [9, 11],
    yaHecho: 11,
    etiqueta: 'En tránsito a destino final',
  },
  entrega: {
    requiere: 11,
    escribe: [12],
    yaHecho: 12,
    etiqueta: 'Entrega finalizada',
  },
} as const;

type Etapa = keyof typeof ETAPAS;

const esEtapa = (v: any): v is Etapa => v === 'cruce' || v === 'transito' || v === 'entrega';

/**
 * GET /api/maritime/tcg/contenedores?etapa=cruce|transito|entrega
 *
 * La lista de la que puede escoger TCG en esa etapa. Trae la dirección de
 * entrega porque es lo que necesitan para bajarla (tarea 647): sin eso el
 * módulo les dice qué mover pero no a dónde.
 */
export const listarContenedoresTcg = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureLineaTiempo();
    const etapa = String(req.query.etapa || 'cruce');
    if (!esEtapa(etapa)) return res.status(400).json({ error: 'Etapa inválida' });
    const cfg = ETAPAS[etapa];

    const r = await pool.query(
      `SELECT c.id, c.container_number AS contenedor, c.bl_number AS bl, c.week_number AS semana,
              c.reference_code AS referencia, c.status AS estado,
              to_char(c.eta, 'YYYY-MM-DD') AS eta,
              c.caja_seca, c.sello,
              lc.full_name AS cliente,
              (SELECT COUNT(*) FROM maritime_orders mo WHERE mo.container_id = c.id) AS ordenes,
              prev.ocurrio_at AS paso_previo_at,
              da.recipient_name AS entrega_nombre, da.phone AS entrega_telefono,
              da.street AS entrega_calle, da.exterior_number AS entrega_numero,
              da.interior_number AS entrega_interior, da.neighborhood AS entrega_colonia,
              da.city AS entrega_ciudad, da.state AS entrega_estado, da.zip_code AS entrega_cp,
              (c.delivery_address_id IS NULL) AS sin_direccion
         FROM containers c
         LEFT JOIN legacy_clients lc ON lc.id = c.legacy_client_id
         LEFT JOIN addresses da ON da.id = c.delivery_address_id
         JOIN container_timeline_events prev
           ON prev.container_id = c.id AND prev.paso = $1
        WHERE c.elp_notified_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM container_timeline_events hecho
                           WHERE hecho.container_id = c.id AND hecho.paso = $2)
        ORDER BY prev.ocurrio_at ASC`,
      [cfg.requiere, cfg.yaHecho]);

    res.json({
      etapa,
      etiqueta: cfg.etiqueta,
      total: r.rowCount,
      contenedores: r.rows.map((x: any) => ({
        ...x,
        ordenes: Number(x.ordenes) || 0,
        entrega_completa: [x.entrega_nombre, x.entrega_calle, x.entrega_numero,
          x.entrega_interior ? `Int. ${x.entrega_interior}` : null, x.entrega_colonia,
          x.entrega_ciudad, x.entrega_estado, x.entrega_cp].filter(Boolean).join(', ') || null,
      })),
    });
  } catch (e: any) {
    console.error('[TCG] listar:', e?.message);
    res.status(500).json({ error: 'No se pudieron cargar los contenedores' });
  }
};

/**
 * POST /api/maritime/tcg/:id/avanzar  { etapa, caja_seca?, sello?, nota? }
 *
 * Marca la etapa. La fecha y hora las pone el sistema.
 */
export const avanzarEtapaTcg = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureLineaTiempo();
    const id = parseInt(String(req.params.id), 10);
    const etapa = String(req.body?.etapa || '');
    if (!id) return res.status(400).json({ error: 'Contenedor inválido' });
    if (!esEtapa(etapa)) return res.status(400).json({ error: 'Etapa inválida' });
    const cfg = ETAPAS[etapa];

    const c = (await pool.query(
      `SELECT id, container_number, elp_notified_at FROM containers WHERE id = $1`, [id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Contenedor no encontrado' });
    if (!c.elp_notified_at) {
      return res.status(400).json({ error: 'Este contenedor no va por ELP; el módulo TCG solo opera los de ELP.' });
    }

    // La cascada se valida aquí y no solo en la pantalla: es lo que impide que
    // una entrega se marque antes que su cruce.
    const previo = await pool.query(
      `SELECT 1 FROM container_timeline_events WHERE container_id = $1 AND paso = $2`, [id, cfg.requiere]);
    if (!previo.rowCount) {
      const falta = cfg.requiere === 6 ? 'que el almacén de El Paso lo marque como shipped'
        : cfg.requiere === 8 ? 'el cruce finalizado' : 'el tránsito a destino final';
      return res.status(400).json({ error: `Todavía le falta ${falta}.` });
    }
    const yaEsta = await pool.query(
      `SELECT to_char(ocurrio_at, 'YYYY-MM-DD HH24:MI') AS cuando
         FROM container_timeline_events WHERE container_id = $1 AND paso = $2`, [id, cfg.yaHecho]);
    if (yaEsta.rowCount) {
      return res.status(409).json({ error: `Ya estaba marcado como ${cfg.etiqueta} desde el ${yaEsta.rows[0].cuando}.` });
    }

    // Caja y sello: vienen del correo, pero TCG puede corregirlos al confirmar.
    if (etapa === 'cruce') {
      const caja = String(req.body?.caja_seca || '').trim() || null;
      const sello = String(req.body?.sello || '').trim() || null;
      if (caja || sello) {
        await pool.query(
          `UPDATE containers SET caja_seca = COALESCE($2, caja_seca),
                                 sello = COALESCE($3, sello), updated_at = NOW()
            WHERE id = $1`, [id, caja, sello]);
      }
    }

    const nota = String(req.body?.nota || '').trim();
    const ahora = new Date();
    const uid = Number((req as any).user?.userId) || null;
    for (const paso of cfg.escribe) {
      await registrarPaso({
        containerId: id, paso, ocurrioAt: ahora, origen: 'tcg',
        detalle: nota || cfg.etiqueta, creadoPor: uid,
      });
      await aplicarEstatusDelPaso(id, paso, `${cfg.etiqueta} (TCG)`)
        .catch((e: any) => console.warn('[TCG] estatus:', e?.message));
    }

    console.log(`🚚 [TCG] ${c.container_number} → ${cfg.etiqueta} por usuario ${uid}`);
    res.json({ success: true, contenedor: c.container_number, etapa, etiqueta: cfg.etiqueta, registrado_at: ahora });
  } catch (e: any) {
    console.error('[TCG] avanzar:', e?.message);
    res.status(500).json({ error: 'No se pudo registrar el movimiento' });
  }
};

/** GET /api/maritime/tcg/resumen — cuántos hay en cada etapa. */
export const resumenTcg = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    await ensureLineaTiempo();
    const cuenta = async (requiere: number, yaHecho: number) => {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM containers c
           JOIN container_timeline_events prev ON prev.container_id = c.id AND prev.paso = $1
          WHERE c.elp_notified_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM container_timeline_events h
                             WHERE h.container_id = c.id AND h.paso = $2)`, [requiere, yaHecho]);
      return r.rows[0]?.n || 0;
    };
    res.json({
      cruce: await cuenta(ETAPAS.cruce.requiere, ETAPAS.cruce.yaHecho),
      transito: await cuenta(ETAPAS.transito.requiere, ETAPAS.transito.yaHecho),
      entrega: await cuenta(ETAPAS.entrega.requiere, ETAPAS.entrega.yaHecho),
    });
  } catch (e: any) {
    console.error('[TCG] resumen:', e?.message);
    res.status(500).json({ error: 'No se pudo cargar el resumen' });
  }
};
