// ============================================
// PREALERTAS DE GUÍAS DHL CON PROCESO ESPECIAL
//
// Hay guías que no siguen el camino normal: se tramitan con pedimento
// individual o pasan por una agencia externa, y su costo real no sale de
// ninguna tarifa — lo determina quien hizo el trámite.
//
// El problema que resuelve (tarea 573): al capturarse en CEDIS, el sistema le
// pone a la guía un costo automático de tarifa y le avisa al cliente. En una
// guía así ese número está mal —una salió en $11,000 de DHL y se le cotizó al
// cliente $32,047.90— y el cliente lo ve antes de que nadie lo corrija.
//
// Cómo funciona: antes de que llegue la guía se levanta una prealerta con su
// número. Cuando CEDIS la captura, la guía SÍ entra al sistema (para que la
// caja no quede sin registro en bodega) pero queda RETENIDA: sin costo, sin
// aviso al cliente y fuera de lo que el cliente ve. Operaciones le asigna el
// costo real y ahí se libera.
// ============================================

import { Request, Response } from 'express';
import { pool, asegurarColumna } from './db';
import { createNotification } from './notificationController';

let listo = false;

export const ensureSchemaPrealertas = async (): Promise<void> => {
  if (listo) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dhl_prealertas (
      id             SERIAL PRIMARY KEY,
      tracking       VARCHAR(60) NOT NULL,
      motivo         VARCHAR(40) NOT NULL DEFAULT 'agencia_externa',
      nota           TEXT,
      creada_por     INTEGER,
      created_at     TIMESTAMP DEFAULT NOW(),
      estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      shipment_id    INTEGER,
      llego_at       TIMESTAMP,
      costo_mxn      NUMERIC(12,2),
      liberada_por   INTEGER,
      liberada_at    TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dhl_prealerta_tracking ON dhl_prealertas(UPPER(tracking));`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dhl_prealerta_estado ON dhl_prealertas(estado);`);

  // La marca vive en la guía para que cualquier consulta pueda excluirla sin
  // tener que cruzar con la prealerta.
  await asegurarColumna('dhl_shipments', 'costo_retenido', 'BOOLEAN NOT NULL DEFAULT FALSE');
  listo = true;
};

export const MOTIVOS: Record<string, string> = {
  agencia_externa: 'Agencia externa',
  pedimento_individual: 'Pedimento individual',
  otro: 'Otro proceso especial',
};

const etiquetaMotivo = (m: string) => MOTIVOS[String(m)] || MOTIVOS.otro!;

/** La prealerta pendiente de una guía, buscando por cualquiera de sus dos números. */
export const prealertaPendienteDe = async (trackings: (string | null | undefined)[]): Promise<any | null> => {
  await ensureSchemaPrealertas();
  const codigos = trackings.map(t => String(t || '').trim()).filter(t => t.length >= 4);
  if (!codigos.length) return null;
  const r = await pool.query(
    `SELECT * FROM dhl_prealertas
      WHERE estado = 'pendiente' AND UPPER(tracking) = ANY($1::text[])
      ORDER BY id DESC LIMIT 1`,
    [codigos.map(c => c.toUpperCase())]
  );
  return r.rows[0] || null;
};

/** Texto para la pantalla de CEDIS al escanear. */
export const avisoDePrealerta = (p: any): string =>
  `Proceso especial: ${etiquetaMotivo(p.motivo)}. `
  + (p.costo_mxn != null
      ? 'Ya tiene su costo asignado: captúrala normal y sigue su curso.'
      : 'Captúrala normal; queda retenida sin costo hasta que operaciones le asigne el suyo.')
  + (p.nota ? ` Nota: ${p.nota}` : '');

// ============================================
// HTTP
// ============================================

/** POST /api/admin/dhl/prealertas — levantar la prealerta antes de que llegue. */
export const crearPrealerta = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchemaPrealertas();
    const tracking = String(req.body?.tracking || '').trim();
    const motivo = String(req.body?.motivo || 'agencia_externa');
    const nota = String(req.body?.nota || '').trim() || null;
    // El costo puede venir desde el principio: si ya se sabe, la guía no se
    // retiene y sigue su curso normal cuando llegue.
    const costoInicial = req.body?.costo_mxn != null && String(req.body.costo_mxn).trim() !== ''
      ? Number(req.body.costo_mxn) : null;
    if (costoInicial !== null && (!Number.isFinite(costoInicial) || costoInicial <= 0)) {
      return res.status(400).json({ error: 'El costo debe ser un monto en pesos mayor a cero' });
    }
    if (tracking.length < 4) return res.status(400).json({ error: 'Escribe el número de guía' });
    if (!MOTIVOS[motivo]) return res.status(400).json({ error: 'Motivo no válido' });

    const ya = await prealertaPendienteDe([tracking]);
    if (ya) return res.status(409).json({ error: `Esa guía ya tiene una prealerta abierta (${etiquetaMotivo(ya.motivo)}).` });

    // Si la guía ya está capturada, se retiene en el momento: llegó antes que
    // el aviso y su costo automático ya está puesto.
    const guia = await pool.query(
      `SELECT id FROM dhl_shipments WHERE UPPER(inbound_tracking) = UPPER($1) OR UPPER(secondary_tracking) = UPPER($1) LIMIT 1`,
      [tracking]
    );
    const yaCapturada = guia.rows[0] || null;

    const r = await pool.query(
      `INSERT INTO dhl_prealertas (tracking, motivo, nota, creada_por, shipment_id, llego_at, costo_mxn)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tracking, motivo, nota, (req as any).user?.userId || null, yaCapturada?.id || null, yaCapturada ? new Date() : null, costoInicial]
    );
    if (yaCapturada) {
      await pool.query(`UPDATE dhl_shipments SET costo_retenido = TRUE, updated_at = NOW() WHERE id = $1`, [yaCapturada.id]);
    }
    res.json({
      prealerta: r.rows[0],
      aviso: yaCapturada
        ? 'Esa guía ya estaba capturada: se retuvo su costo para que el cliente no lo vea hasta que le asignes el real.'
        : null,
    });
  } catch (e: any) {
    console.error('[dhl-prealerta] crear:', e?.message);
    res.status(500).json({ error: 'No se pudo levantar la prealerta' });
  }
};

/** GET /api/admin/dhl/prealertas?estado=pendiente */
export const listarPrealertas = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchemaPrealertas();
    const estado = String(req.query?.estado || 'pendiente');
    const r = await pool.query(
      `SELECT p.*, u.full_name AS creada_por_nombre, l.full_name AS liberada_por_nombre,
              d.inbound_tracking, d.secondary_tracking, d.box_id, d.weight_kg,
              d.status AS estado_guia, c.full_name AS cliente
         FROM dhl_prealertas p
         LEFT JOIN users u ON u.id = p.creada_por
         LEFT JOIN users l ON l.id = p.liberada_por
         LEFT JOIN dhl_shipments d ON d.id = p.shipment_id
         LEFT JOIN users c ON c.id = d.user_id
        WHERE ($1 = 'todas' OR p.estado = $1)
        ORDER BY (p.llego_at IS NOT NULL) DESC, p.id DESC
        LIMIT 200`,
      [estado]
    );
    res.json({
      prealertas: r.rows.map(p => ({ ...p, motivo_label: etiquetaMotivo(p.motivo) })),
      motivos: MOTIVOS,
    });
  } catch (e: any) {
    console.error('[dhl-prealerta] listar:', e?.message);
    res.status(500).json({ error: 'No se pudieron cargar las prealertas' });
  }
};

/**
 * PUT /api/admin/dhl/prealertas/:id/costo — asignar el costo real y liberar.
 *
 * El monto que se captura es lo que se le va a cobrar al cliente por la
 * importación, en pesos e impuesto incluido: es el mismo criterio con el que
 * el sistema llena `import_cost_mxn` en una guía normal.
 */
export const asignarCostoPrealerta = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchemaPrealertas();
    const id = parseInt(String(req.params.id || ''), 10);
    const costo = Number(req.body?.costo_mxn);
    if (!Number.isFinite(costo) || costo <= 0) {
      return res.status(400).json({ error: 'Escribe el costo en pesos, mayor a cero' });
    }
    const r = await pool.query(`SELECT * FROM dhl_prealertas WHERE id = $1`, [id]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: 'Prealerta no encontrada' });
    if (p.estado !== 'pendiente') return res.status(400).json({ error: 'Esa prealerta ya se liberó' });

    // La guía todavía no llega: se guarda el costo y ya. Cuando CEDIS la
    // capture entrará con ese número y seguirá su curso normal, sin retención.
    if (!p.shipment_id) {
      await pool.query(`UPDATE dhl_prealertas SET costo_mxn = $2 WHERE id = $1`, [id, costo]);
      return res.json({
        success: true, costo_mxn: costo, tracking: p.tracking,
        aviso: 'La guía todavía no llega. Cuando se capture entrará con este costo y seguirá su proceso normal.',
      });
    }

    const g = await pool.query(`SELECT * FROM dhl_shipments WHERE id = $1`, [p.shipment_id]);
    const guia = g.rows[0];
    if (!guia) return res.status(404).json({ error: 'La guía ya no existe' });

    const tc = Number(guia.exchange_rate) || 0;
    const nacional = Number(guia.national_cost_mxn) || 0;
    await pool.query(
      `UPDATE dhl_shipments
          SET import_cost_mxn = $2,
              import_cost_usd = CASE WHEN $3::numeric > 0 THEN ROUND($2::numeric / $3::numeric, 2) ELSE import_cost_usd END,
              total_cost_mxn  = $2::numeric + $4::numeric,
              saldo_pendiente = GREATEST(0, ($2::numeric + $4::numeric) - COALESCE(monto_pagado, 0)),
              costo_retenido  = FALSE,
              updated_at      = NOW()
        WHERE id = $1`,
      [guia.id, costo, tc, nacional]
    );
    await pool.query(
      `UPDATE dhl_prealertas
          SET estado = 'liberada', costo_mxn = $2, liberada_por = $3, liberada_at = NOW()
        WHERE id = $1`,
      [id, costo, (req as any).user?.userId || null]
    );

    // El aviso al cliente se guardó para este momento: al llegar la guía no se
    // le dijo nada, porque habría visto un costo que no era.
    const guiaTxt = guia.secondary_tracking || guia.inbound_tracking;
    if (guia.user_id) {
      await createNotification(
        guia.user_id,
        'PACKAGE_RECEIVED',
        `📦 Tu paquete DHL con guía ${guiaTxt} llegó a nuestro CEDIS en Monterrey y ya tiene su costo listo.`,
        { tracking: guiaTxt, shipmentId: guia.id, service: 'DHL' },
        '/dhl-dashboard'
      ).catch(() => {});
    }
    res.json({ success: true, costo_mxn: costo, tracking: guiaTxt });
  } catch (e: any) {
    console.error('[dhl-prealerta] asignar costo:', e?.message);
    res.status(500).json({ error: 'No se pudo asignar el costo' });
  }
};

/** DELETE /api/admin/dhl/prealertas/:id — cancelar una que se levantó por error. */
export const cancelarPrealerta = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSchemaPrealertas();
    const id = parseInt(String(req.params.id || ''), 10);
    const r = await pool.query(`SELECT * FROM dhl_prealertas WHERE id = $1`, [id]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: 'Prealerta no encontrada' });
    if (p.estado !== 'pendiente') return res.status(400).json({ error: 'Esa prealerta ya se liberó' });
    await pool.query(`UPDATE dhl_prealertas SET estado = 'cancelada' WHERE id = $1`, [id]);
    // Si ya había retenido una guía, se suelta: sin prealerta no hay motivo.
    if (p.shipment_id) {
      await pool.query(`UPDATE dhl_shipments SET costo_retenido = FALSE, updated_at = NOW() WHERE id = $1`, [p.shipment_id]);
    }
    res.json({ success: true });
  } catch (e: any) {
    console.error('[dhl-prealerta] cancelar:', e?.message);
    res.status(500).json({ error: 'No se pudo cancelar' });
  }
};
