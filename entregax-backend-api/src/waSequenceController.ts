// ============================================================================
// 🔄 SECUENCIAS AUTOMÁTICAS DE WHATSAPP (cadencia Día 1 / 3 / 7)
// ============================================================================
// Inscribe prospectos en una secuencia de mensajes. Un cron envía cada paso
// cuando llega su fecha (offset de días desde la inscripción). El lead SALE de la
// secuencia si responde (webhook) o hace clic en un botón (/r/:token).
//
//   wa_sequences            — definición: nombre + steps [{day_offset, template_id}]
//   wa_sequence_enrollments — inscripción de un lead: paso actual, próximo envío, estado
// ============================================================================

import { Request, Response } from 'express';
import { pool } from './db';
import { sendTemplate } from './whatsappService';
import { getSignedUrlForKey } from './s3Service';

let seqReady = false;
export async function ensureSequenceSchema(): Promise<void> {
  if (seqReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_sequences (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      steps JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_sequence_enrollments (
      id SERIAL PRIMARY KEY,
      sequence_id INTEGER NOT NULL REFERENCES wa_sequences(id) ON DELETE CASCADE,
      lead_key TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      status TEXT DEFAULT 'active',        -- active | completed | responded | stopped
      current_step INTEGER DEFAULT 0,
      enrolled_at TIMESTAMPTZ DEFAULT NOW(),
      next_send_at TIMESTAMPTZ,
      last_sent_at TIMESTAMPTZ,
      stopped_reason TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (sequence_id, lead_key)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wse_due ON wa_sequence_enrollments(status, next_send_at);`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wse_lead ON wa_sequence_enrollments(lead_key);`).catch(() => {});
  // Secuencia por defecto: funnel de 3 mensajes (Día 1 / 3 / 7 → offsets 0/2/6).
  const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM wa_sequences`);
  if ((cnt.rows[0]?.n || 0) === 0) {
    await pool.query(
      `INSERT INTO wa_sequences (name, steps) VALUES ($1, $2::jsonb)`,
      ['Funnel prospectos fríos (3 mensajes)', JSON.stringify([
        { day_offset: 0, template_id: null }, // Día 1 — Gancho
        { day_offset: 2, template_id: null }, // Día 3 — Valor
        { day_offset: 6, template_id: null }, // Día 7 — Oferta
      ])]
    );
  }
  seqReady = true;
}

const normPhone = (p: any): string => { const d = String(p ?? '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };

// GET /api/admin/crm/sequences → lista + stats de inscripciones
export const getSequences = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureSequenceSchema();
    const seqs = await pool.query(`SELECT id, name, active, steps FROM wa_sequences ORDER BY id ASC`);
    const stats = await pool.query(`
      SELECT sequence_id,
             COUNT(*) FILTER (WHERE status='active')    AS active,
             COUNT(*) FILTER (WHERE status='completed') AS completed,
             COUNT(*) FILTER (WHERE status='responded') AS responded,
             COUNT(*) FILTER (WHERE status='stopped')   AS stopped
        FROM wa_sequence_enrollments GROUP BY sequence_id`);
    const byId: Record<number, any> = {};
    for (const s of stats.rows) byId[s.sequence_id] = s;
    res.json({ success: true, sequences: seqs.rows.map((s: any) => ({ ...s, stats: byId[s.id] || null })) });
  } catch (error: any) {
    console.error('Error getSequences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /api/admin/crm/sequences/:id → configurar pasos (plantilla por día) y nombre/activo
export const updateSequence = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSequenceSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    const { name, active, steps } = req.body || {};
    const cleanSteps = Array.isArray(steps) ? steps.map((s: any) => ({
      day_offset: Math.max(0, parseInt(String(s?.day_offset ?? 0), 10) || 0),
      template_id: s?.template_id ? (parseInt(String(s.template_id), 10) || null) : null,
    })) : [];
    await pool.query(
      `UPDATE wa_sequences SET name = COALESCE($1, name), active = COALESCE($2, active), steps = $3::jsonb WHERE id = $4`,
      [name ?? null, typeof active === 'boolean' ? active : null, JSON.stringify(cleanSteps), id]
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updateSequence:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/admin/crm/sequences/:id/enroll { leadKeys } → inscribe leads (1er envío = ahora)
export const enrollInSequence = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSequenceSchema();
    const sequenceId = parseInt(String(req.params.id), 10);
    const { leadKeys } = req.body || {};
    if (!sequenceId) return res.status(400).json({ success: false, error: 'secuencia inválida' });
    if (!Array.isArray(leadKeys) || leadKeys.length === 0) return res.status(400).json({ success: false, error: 'Selecciona al menos un lead' });

    // Resolver nombre + teléfono (mismas fuentes que el envío masivo), excluyendo blacklist.
    const rowsRes = await pool.query(
      `SELECT ('crm_' || r.id::text) AS lead_key, u.full_name, u.phone
         FROM crm_requests r JOIN users u ON r.user_id = u.id
        WHERE ('crm_' || r.id::text) = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM lead_blacklist bl WHERE bl.lead_key = ('crm_' || r.id::text))
       UNION ALL
       SELECT ('lc_' || lc.id::text), COALESCE(NULLIF(TRIM(lc.full_name),''), mu.full_name),
              COALESCE(NULLIF(TRIM(mu.phone),''), lc.phone)
         FROM legacy_clients lc
         LEFT JOIN LATERAL (SELECT u2.full_name, u2.phone FROM users u2 WHERE lc.box_id IS NOT NULL AND UPPER(TRIM(u2.box_id))=UPPER(TRIM(lc.box_id)) ORDER BY u2.id ASC LIMIT 1) mu ON true
        WHERE ('lc_' || lc.id::text) = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM lead_blacklist bl WHERE bl.lead_key = ('lc_' || lc.id::text))
       UNION ALL
       SELECT ('pr_' || p.id::text), COALESCE(NULLIF(TRIM(p.full_name),''),''), p.whatsapp
         FROM prospects p
        WHERE ('pr_' || p.id::text) = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM lead_blacklist bl WHERE bl.lead_key = ('pr_' || p.id::text))`,
      [leadKeys]
    );
    let enrolled = 0, skipped = 0;
    for (const row of rowsRes.rows) {
      if (!row.phone || String(row.phone).trim() === '') { skipped++; continue; }
      const r = await pool.query(
        `INSERT INTO wa_sequence_enrollments (sequence_id, lead_key, name, phone, status, current_step, next_send_at)
         VALUES ($1, $2, $3, $4, 'active', 0, NOW())
         ON CONFLICT (sequence_id, lead_key) DO UPDATE
           SET status='active', current_step=0, next_send_at=NOW(), stopped_reason=NULL, enrolled_at=NOW(), updated_at=NOW()
         RETURNING id`,
        [sequenceId, row.lead_key, row.full_name || null, String(row.phone)]
      );
      if (r.rows[0]) enrolled++;
    }
    console.log(`[SEQ] Inscritos ${enrolled} en secuencia ${sequenceId} (${skipped} sin teléfono)`);
    res.json({ success: true, enrolled, skipped });
  } catch (error: any) {
    console.error('Error enrollInSequence:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/admin/crm/sequences/unenroll { leadKeys } → detener secuencia
export const unenrollFromSequence = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureSequenceSchema();
    const { leadKeys } = req.body || {};
    if (!Array.isArray(leadKeys) || leadKeys.length === 0) return res.status(400).json({ success: false, error: 'Selecciona al menos un lead' });
    const r = await pool.query(
      `UPDATE wa_sequence_enrollments SET status='stopped', stopped_reason='manual', updated_at=NOW()
        WHERE lead_key = ANY($1::text[]) AND status='active'`,
      [leadKeys]
    );
    res.json({ success: true, stopped: r.rowCount });
  } catch (error: any) {
    console.error('Error unenrollFromSequence:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── Horario configurable de la secuencia ────────────────────────────────────
// hour/minute en hora de Monterrey (UTC-6, sin DST). days = arreglo de días
// hábiles con convención JS (0=Dom, 1=Lun … 6=Sáb). Default: 12:06, Lun-Vie.
const MTY_OFFSET_MS = 6 * 3600 * 1000;
export interface SequenceSchedule { hour: number; minute: number; days: number[]; }
export const DEFAULT_SEQUENCE_SCHEDULE: SequenceSchedule = { hour: 12, minute: 6, days: [1, 2, 3, 4, 5] };

export const getSequenceSchedule = async (): Promise<SequenceSchedule> => {
  try {
    const r = await pool.query(`SELECT config_value FROM system_configurations WHERE config_key = 'wa_sequence_schedule' AND is_active = TRUE`);
    const v = r.rows[0]?.config_value;
    if (!v) return DEFAULT_SEQUENCE_SCHEDULE;
    const hour = Number.isInteger(v.hour) && v.hour >= 0 && v.hour <= 23 ? v.hour : DEFAULT_SEQUENCE_SCHEDULE.hour;
    const minute = Number.isInteger(v.minute) && v.minute >= 0 && v.minute <= 59 ? v.minute : DEFAULT_SEQUENCE_SCHEDULE.minute;
    const days = Array.isArray(v.days) ? v.days.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) : DEFAULT_SEQUENCE_SCHEDULE.days;
    return { hour, minute, days };
  } catch { return DEFAULT_SEQUENCE_SCHEDULE; }
};

// Próximo timestamp UTC de envío según la config (o null si no hay días hábiles).
export const computeNextSendUtc = (sch: SequenceSchedule): Date | null => {
  if (!sch.days.length) return null;
  const now = new Date();
  // "cand" representa la hora de pared MTY en campos UTC. El UTC real = cand + 6h.
  const mtyNow = new Date(now.getTime() - MTY_OFFSET_MS);
  const cand = new Date(Date.UTC(mtyNow.getUTCFullYear(), mtyNow.getUTCMonth(), mtyNow.getUTCDate(), sch.hour, sch.minute, 0, 0));
  const realUtc = () => new Date(cand.getTime() + MTY_OFFSET_MS);
  let guard = 0;
  while ((realUtc() <= now || !sch.days.includes(cand.getUTCDay())) && guard < 30) {
    cand.setUTCDate(cand.getUTCDate() + 1);
    guard++;
  }
  return guard >= 30 ? null : realUtc();
};

// GET /api/admin/crm/sequence/schedule → config vigente.
export const getSequenceScheduleConfig = async (_req: Request, res: Response): Promise<any> => {
  try {
    const sch = await getSequenceSchedule();
    res.json({ success: true, ...sch });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/admin/crm/sequence/schedule { hour, minute, days } → guarda config.
export const saveSequenceScheduleConfig = async (req: Request, res: Response): Promise<any> => {
  try {
    const { hour, minute, days } = req.body || {};
    const h = Number(hour), m = Number(minute);
    if (!Number.isInteger(h) || h < 0 || h > 23) return res.status(400).json({ success: false, error: 'Hora inválida (0-23)' });
    if (!Number.isInteger(m) || m < 0 || m > 59) return res.status(400).json({ success: false, error: 'Minuto inválido (0-59)' });
    const cleanDays = Array.isArray(days) ? [...new Set(days.map((d: any) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('wa_sequence_schedule', $1::jsonb, 'Horario y días hábiles de la secuencia automática', TRUE)
       ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify({ hour: h, minute: m, days: cleanDays })]
    );
    res.json({ success: true, hour: h, minute: m, days: cleanDays });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/admin/crm/sequence/next-send → próximo envío (según config) + a cuántos
// usuarios activos les toca en esa corrida.
export const getSequenceNextSend = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureSequenceSchema();
    const sch = await getSequenceSchedule();
    const next = computeNextSendUtc(sch);
    let dueCount = 0;
    if (next) {
      const dueRes = await pool.query(
        `SELECT COUNT(*)::int AS due
           FROM wa_sequence_enrollments
          WHERE status = 'active' AND next_send_at IS NOT NULL AND next_send_at <= $1`,
        [next.toISOString()]
      );
      dueCount = dueRes.rows[0]?.due || 0;
    }
    // dueNowCount = lo que YA venció (next_send_at <= ahora) — es exactamente lo
    // que "Enviar ahora" mandaría en este instante (distinto de dueCount, que
    // mira hasta la próxima corrida programada e incluye lo que aún no vence).
    const dueNowRes = await pool.query(
      `SELECT COUNT(*)::int AS due
         FROM wa_sequence_enrollments
        WHERE status = 'active' AND next_send_at IS NOT NULL AND next_send_at <= NOW()`
    );
    const dueNowCount = dueNowRes.rows[0]?.due || 0;
    // Estado de la cola de mensajes (para el widget en Prospectos Externos):
    //  - en_cola      = activos ya vencidos (next_send_at <= NOW) -> salen en la próxima tanda
    //  - programados  = activos con envío futuro (aún no les toca)
    //  - total_activos= todos los que siguen en secuencia
    //  - enviados_hoy = mensajes que ya salieron hoy (last_sent_at en fecha MTY)
    //  - drain_activo = hay un drenado corriendo en este proceso (in-memory)
    const qStats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='active' AND next_send_at IS NOT NULL AND next_send_at <= NOW())::int AS en_cola,
         COUNT(*) FILTER (WHERE status='active' AND next_send_at IS NOT NULL AND next_send_at >  NOW())::int AS programados,
         COUNT(*) FILTER (WHERE status='active')::int AS total_activos,
         COUNT(*) FILTER (WHERE (last_sent_at AT TIME ZONE 'America/Monterrey')::date = (NOW() AT TIME ZONE 'America/Monterrey')::date)::int AS enviados_hoy
       FROM wa_sequence_enrollments`
    );
    const st = qStats.rows[0] || {};
    let drainActivo = false;
    try {
      const { isSequenceDrainInProgress } = await import('./cronJobs');
      drainActivo = isSequenceDrainInProgress();
    } catch { /* no-op */ }
    // Desglose de la cola por paso (current_step+1 = número de mensaje que toca)
    const qPorPaso = await pool.query(
      `SELECT current_step + 1 AS paso, COUNT(*)::int AS en_cola
         FROM wa_sequence_enrollments
        WHERE status='active' AND next_send_at IS NOT NULL AND next_send_at <= NOW()
        GROUP BY 1 ORDER BY 1`
    );
    res.json({
      success: true,
      nextSendAt: next ? next.toISOString() : null,
      dueCount,
      dueNowCount,
      schedule: sch,
      queue: {
        en_cola: st.en_cola || 0,
        programados: st.programados || 0,
        total_activos: st.total_activos || 0,
        enviados_hoy: st.enviados_hoy || 0,
        drain_activo: drainActivo,
        por_paso: qPorPaso.rows,
        // Tope diario (reserva para notificaciones de operación)
        tope_diario: SEQUENCE_DAILY_LIMIT,
        restante_hoy: Math.max(0, SEQUENCE_DAILY_LIMIT - (st.enviados_hoy || 0)),
      },
    });
  } catch (error: any) {
    console.error('Error getSequenceNextSend:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Detener secuencias activas de un lead (por lead_key) — usado al hacer clic.
export const stopSequenceByLeadKey = async (leadKey: string, reason: string): Promise<void> => {
  try {
    await pool.query(
      `UPDATE wa_sequence_enrollments SET status='responded', stopped_reason=$2, updated_at=NOW()
        WHERE lead_key = $1 AND status='active'`,
      [leadKey, reason]
    );
  } catch (e) { console.warn('[SEQ] stopSequenceByLeadKey:', (e as Error).message); }
};

// Detener secuencias activas por teléfono (últimos 10 dígitos) — usado por el webhook.
export const stopSequenceByPhone = async (phone: string, reason: string): Promise<number> => {
  try {
    await ensureSequenceSchema();
    const last10 = normPhone(phone);
    if (!last10) return 0;
    const r = await pool.query(
      `UPDATE wa_sequence_enrollments SET status='responded', stopped_reason=$2, updated_at=NOW()
        WHERE status='active' AND right(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 10) = $1`,
      [last10, reason]
    );
    return r.rowCount || 0;
  } catch (e) { console.warn('[SEQ] stopSequenceByPhone:', (e as Error).message); return 0; }
};

// Enviar un paso a un inscrito (reutiliza plantilla + imagen + rastreo de clics).
async function sendStep(enr: any, step: any): Promise<boolean> {
  const tplRes = await pool.query(
    `SELECT id, template_name, language_code, variables, header_image_url, header_image_key, use_mm_lite, uses_name, link_dest
       FROM bulk_wa_templates WHERE id = $1`,
    [step.template_id]
  );
  const tpl = tplRes.rows[0];
  if (!tpl) return false;
  // Imagen de encabezado (firmar si viene de S3).
  let headerImageUrl: string | undefined;
  if (tpl.header_image_key) { try { headerImageUrl = await getSignedUrlForKey(tpl.header_image_key, 6 * 3600); } catch { /* ignore */ } }
  if (!headerImageUrl) headerImageUrl = tpl.header_image_url || undefined;
  const nombre = String(enr.name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
  const usesName = tpl.uses_name !== false;
  const parameters = usesName ? [nombre] : [];
  // Token de rastreo si la plantilla tiene botón de URL.
  let urlButtonParam: string | undefined;
  const linkDest = String(tpl.link_dest || '').trim();
  if (linkDest) {
    try {
      const { randomBytes } = await import('crypto');
      const token = randomBytes(9).toString('base64url');
      await pool.query(
        `INSERT INTO wa_click_links (token, lead_key, template_id, destination, name, phone) VALUES ($1,$2,$3,$4,$5,$6)`,
        [token, enr.lead_key, tpl.id, linkDest, enr.name || null, String(enr.phone)]
      );
      urlButtonParam = token;
    } catch (e) { console.warn('[SEQ] token rastreo:', (e as Error).message); }
  }
  const r = await sendTemplate({
    to: enr.phone,
    template: tpl.template_name,
    languageCode: tpl.language_code || 'es_MX',
    parameters,
    ...(headerImageUrl ? { headerImageUrl } : {}),
    ...(urlButtonParam ? { urlButtonParam } : {}),
    useMarketingApi: !!tpl.use_mm_lite,
  });
  return !!r.ok;
}

// Procesa las inscripciones cuyo próximo envío ya venció (llamado por el cron).
export const SEQUENCE_BATCH_LIMIT = 200;
// Tope diario de envíos de la secuencia (marketing). El tier de WhatsApp es de
// conversaciones iniciadas por la empresa en 24h (hoy: 10,000) y esa MISMA bolsa
// la usan las notificaciones operativas (paquete recibido/en tránsito/entregado,
// confirmaciones X-Pay, etc.). Reservamos 3,000 para operación → la secuencia
// nunca manda más de 7,000/día; lo que sobre espera al día siguiente.
export const SEQUENCE_DAILY_LIMIT = 7000;
// Envíos de la secuencia realizados HOY (fecha Monterrey). Sirve para respetar el
// tope diario y para el widget de estado de la cola.
export const countSequenceSentToday = async (): Promise<number> => {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM wa_sequence_enrollments
      WHERE (last_sent_at AT TIME ZONE 'America/Monterrey')::date = (NOW() AT TIME ZONE 'America/Monterrey')::date`
  );
  return r.rows[0]?.n || 0;
};
// ¿Hay mensajes de secuencia ya vencidos esperando salir? Se usa para la
// auto-recuperación del drenado tras un redeploy: el estado real vive en la BD
// (next_send_at <= NOW), así que basta con revisar esto para saber si hay que
// reanudar, sin depender de la cadena en memoria (setTimeout) que muere al reiniciar.
export const hasDueSequenceBacklog = async (): Promise<boolean> => {
  const r = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM wa_sequence_enrollments
        WHERE status='active' AND next_send_at IS NOT NULL AND next_send_at <= NOW()
     ) AS has`
  );
  return !!r.rows[0]?.has;
};
export const processDueSequenceSteps = async (): Promise<{ sent: number; advanced: number; processed: number }> => {
  await ensureSequenceSchema();
  let sent = 0, advanced = 0;
  // Respetar el tope diario: reservamos capacidad del tier de WhatsApp para las
  // notificaciones operativas. Si ya llegamos al tope, no mandamos nada más hoy.
  const sentToday = await countSequenceSentToday();
  const remainingToday = SEQUENCE_DAILY_LIMIT - sentToday;
  if (remainingToday <= 0) {
    console.log(`[SEQ] Tope diario alcanzado (${sentToday}/${SEQUENCE_DAILY_LIMIT}); se reserva capacidad para notificaciones de operación. Reanuda mañana.`);
    return { sent: 0, advanced: 0, processed: 0 };
  }
  // El lote no puede exceder ni el tamaño de tanda ni lo que queda del tope diario.
  const batchLimit = Math.min(SEQUENCE_BATCH_LIMIT, remainingToday);
  const due = await pool.query(
    `SELECT e.*, s.steps, s.active AS seq_active
       FROM wa_sequence_enrollments e
       JOIN wa_sequences s ON s.id = e.sequence_id
      WHERE e.status = 'active' AND e.next_send_at IS NOT NULL AND e.next_send_at <= NOW()
      ORDER BY e.next_send_at ASC
      LIMIT ${batchLimit}`
  );
  for (const enr of due.rows) {
    const steps: any[] = Array.isArray(enr.steps) ? enr.steps : [];
    const idx = enr.current_step || 0;
    const step = steps[idx];
    // Secuencia inactiva o paso inexistente → completar.
    if (!enr.seq_active || !step) {
      await pool.query(`UPDATE wa_sequence_enrollments SET status='completed', updated_at=NOW() WHERE id=$1`, [enr.id]).catch(() => {});
      continue;
    }
    // Elegibilidad: NO enviar si está en blacklist, o si el prospecto está
    // convertido (se registró) o perdido → se detiene la secuencia.
    const elig = await pool.query(
      `SELECT
         EXISTS(SELECT 1 FROM lead_blacklist WHERE lead_key = $1) AS blacklisted,
         CASE WHEN $1 LIKE 'pr_%' THEN (
           SELECT (pr.converted_user_id IS NOT NULL OR pr.status IN ('lost','converted'))
             FROM prospects pr WHERE pr.id = NULLIF(split_part($1,'_',2),'')::int
         ) ELSE false END AS out_of_funnel`,
      [enr.lead_key]
    );
    const e0 = elig.rows[0] || {};
    if (e0.blacklisted || e0.out_of_funnel) {
      await pool.query(`UPDATE wa_sequence_enrollments SET status='stopped', stopped_reason=$2, updated_at=NOW() WHERE id=$1`, [enr.id, e0.blacklisted ? 'blacklist' : 'out_of_funnel']).catch(() => {});
      continue;
    }
    // Enviar si el paso tiene plantilla configurada.
    if (step.template_id) {
      try { if (await sendStep(enr, step)) sent++; } catch (e) { console.warn('[SEQ] sendStep:', (e as Error).message); }
    }
    // Avanzar al siguiente paso (o completar).
    const nextIdx = idx + 1;
    if (nextIdx < steps.length) {
      const nextOffset = Math.max(0, parseInt(String(steps[nextIdx]?.day_offset ?? 0), 10) || 0);
      await pool.query(
        `UPDATE wa_sequence_enrollments
            SET current_step=$2, last_sent_at=NOW(),
                next_send_at = enrolled_at + ($3 || ' days')::interval, updated_at=NOW()
          WHERE id=$1`,
        [enr.id, nextIdx, String(nextOffset)]
      ).catch(() => {});
      advanced++;
    } else {
      await pool.query(`UPDATE wa_sequence_enrollments SET status='completed', last_sent_at=NOW(), updated_at=NOW() WHERE id=$1`, [enr.id]).catch(() => {});
    }
  }
  if (sent || advanced) console.log(`[SEQ] Cron: ${sent} mensajes enviados, ${advanced} avanzados (lote de ${due.rows.length})`);
  return { sent, advanced, processed: due.rows.length };
};
