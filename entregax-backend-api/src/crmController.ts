import { Request, Response } from 'express';
import { pool } from './db';
import bcrypt from 'bcrypt';
import { generateBoxId } from './authController';
import { sendTemplate } from './whatsappService';
import { uploadToS3, isS3Configured, getSignedUrlForKey } from './s3Service';
import { stopSequenceByLeadKey, ensureSequenceSchema } from './waSequenceController';
import { createKitRequestFromClick, ensureWelcomeKitSchema } from './welcomeKitController';

// ============================================================================
// FUNCIONES ORIGINALES (APP Y CRM BÁSICO)
// ============================================================================

// 📱 APP: MANEJAR SOLICITUD DEL CLIENTE
export const requestAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    // Obtener userId del token JWT (el token usa 'userId' no 'id')
    const userId = (req as any).user?.userId || (req as any).user?.id || req.body.userId;
    const { advisorCodeInput } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
    }

    // CASO A: SI ESCRIBIÓ CÓDIGO (Vinculación Inmediata)
    if (advisorCodeInput && advisorCodeInput.trim() !== '') {
      const codeUpper = advisorCodeInput.trim().toUpperCase();
      // Normalizar código: agregar guión si no lo tiene (CHRI3225 -> CHRI-3225)
      const normalizedCode = codeUpper.includes('-') 
        ? codeUpper 
        : codeUpper.length >= 5 
          ? `${codeUpper.slice(0, 4)}-${codeUpper.slice(4)}`
          : codeUpper;
      
      console.log('🔍 Buscando asesor:', codeUpper, 'normalizado:', normalizedCode);
      
      // 1. Buscar al asesor por código o box_id (buscar ambos formatos)
      const advisorRes = await pool.query(
        `SELECT id, full_name FROM users 
         WHERE (referral_code = $1 OR referral_code = $2 OR box_id = $1 OR box_id = $2) 
         AND role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')`,
        [codeUpper, normalizedCode]
      );

      if (advisorRes.rows.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Código de Asesor no válido. Verifica el número e intenta de nuevo.' 
        });
      }

      const advisor = advisorRes.rows[0];

      // 2. Vincular al cliente con ese asesor (usar advisor_id en lugar de referred_by_id)
      await pool.query('UPDATE users SET advisor_id = $1 WHERE id = $2', [advisor.id, userId]);
      console.log('✅ Asesor', advisor.full_name, 'asignado a usuario', userId);

      return res.json({
        success: true,
        type: 'LINKED',
        advisorName: advisor.full_name,
        message: `¡Vinculado exitosamente con ${advisor.full_name}!`
      });
    }

    // CASO B: NO ESCRIBIÓ CÓDIGO (Solicitud al CRM)
    else {
      // 1. Verificar si ya tenía una solicitud pendiente para no duplicar
      const check = await pool.query(
        'SELECT id FROM crm_requests WHERE user_id = $1 AND status = $2',
        [userId, 'pending']
      );

      if (check.rows.length > 0) {
        return res.json({
          success: true,
          type: 'PENDING',
          message: 'Ya tienes una solicitud en proceso. Te contactaremos pronto.'
        });
      }

      // 2. Crear el Ticket en CRM
      await pool.query('INSERT INTO crm_requests (user_id) VALUES ($1)', [userId]);

      return res.json({
        success: true,
        type: 'REQUESTED',
        message: 'Solicitud enviada. Un asesor experto te contactará en un lapso de 24 a 48 horas.'
      });
    }
  } catch (error) {
    console.error('Error en requestAdvisor:', error);
    res.status(500).json({ success: false, error: 'Error al procesar solicitud' });
  }
};

// � APP: BUSCAR ASESOR POR CÓDIGO (Pre-validación antes de vincular)
export const lookupAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    const { code } = req.params;
    const codeStr = Array.isArray(code) ? code[0] : code as string;
    if (!codeStr || !codeStr.trim()) {
      return res.status(400).json({ success: false, error: 'Código requerido' });
    }

    const codeUpper = codeStr.trim().toUpperCase();
    // Normalizar: JUAN047 -> JUAN-047, CHRI3225 -> CHRI-3225
    const normalizedCode = codeUpper.includes('-') 
      ? codeUpper 
      : codeUpper.length >= 5 
        ? `${codeUpper.slice(0, 4)}-${codeUpper.slice(4)}`
        : codeUpper;

    const advisorRes = await pool.query(
      `SELECT id, full_name, role FROM users 
       WHERE (referral_code = $1 OR referral_code = $2 OR box_id = $1 OR box_id = $2) 
       AND role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')`,
      [codeUpper, normalizedCode]
    );

    if (advisorRes.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Código de Asesor no válido. Verifica el número e intenta de nuevo.' 
      });
    }

    const advisor = advisorRes.rows[0];
    return res.json({
      success: true,
      advisor: {
        id: advisor.id,
        name: advisor.full_name,
        role: advisor.role,
      }
    });
  } catch (error) {
    console.error('Error en lookupAdvisor:', error);
    res.status(500).json({ success: false, error: 'Error al buscar asesor' });
  }
};

// �🖥️ ADMIN: VER TODOS LOS LEADS (Para el CRM Web)
// Fusiona DOS fuentes en el mismo funnel (pending/assigned/contacted/converted):
//   1) crm_requests  → usuarios de la app que pidieron asesor.
//   2) legacy_clients → TODOS los clientes legacy (chartback + histórico).
//      Se mapea su chartback_status al funnel:
//        recovered                       → converted
//        no_answer/callback/retention    → contacted (muestra la respuesta del asesor)
//        recovery_advisor_id NOT NULL    → assigned (con asesor, aún no contactado)
//        (resto, sin asesor)             → pending (aún no reclamado)
//   Se excluye 'not_interested' (cliente perdido, no está en el funnel).
//   Se dedupe contra crm_requests para no duplicar cuando el legacy_client
//   ya reclamó su cuenta y ya está en el pipeline moderno.
// Consulta combinada de la Central de Leads. Todas las fuentes proyectan el
// MISMO set de columnas. Es SOLO LECTURA (no modifica nada). Se comparte entre
// el endpoint getCrmLeads y el asistente Cajito para que ambos vean lo mismo.
const LEADS_COMBINED_QUERY = `
      WITH combined AS (
        -- Fuente 1: CRM requests (usuarios app)
        SELECT
          r.id AS request_id,
          'crm'::text AS source,
          ('crm_' || r.id::text) AS lead_key,
          r.created_at,
          -- Solicitó asesor y aún no se asigna → "En espera" (separado de los legacy).
          CASE WHEN r.status = 'pending' THEN 'waiting' ELSE r.status END AS status,
          r.admin_notes,
          r.updated_at,
          u.id AS user_id,
          u.full_name,
          u.email,
          u.box_id,
          u.phone,
          a.full_name AS assigned_advisor_name,
          NULL::text AS chartback_status,
          NULL::text AS advisor_response,
          NULL::jsonb AS activity,
          NULL::timestamptz AS next_contact_at,
          true AS reclamado
        FROM crm_requests r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN users a ON r.assigned_advisor_id = a.id

        UNION ALL

        -- Fuente 2: Chartback / Reactivación (legacy_clients)
        SELECT
          NULL::int AS request_id,
          'chartback'::text AS source,
          ('lc_' || lc.id::text) AS lead_key,
          COALESCE(lc.chartback_i_since, lc.created_at) AS created_at,
          CASE
            WHEN LOWER(TRIM(COALESCE(lc.chartback_status, ''))) = 'recovered' THEN 'converted'
            WHEN LOWER(TRIM(COALESCE(lc.chartback_status, ''))) IN ('no_answer','callback','retention') THEN 'contacted'
            WHEN lc.recovery_advisor_id IS NOT NULL THEN 'assigned'
            -- Reclamado = ya existe un usuario en el sistema (match por Box ID).
            -- Al reclamar su número, el cliente sale de Prospectos Externos y
            -- pasa a CONVERTIDOS (recuperado).
            WHEN mu.id IS NOT NULL THEN 'converted'
            -- Sin reclamar: ya NO vive en CRM Leads; se muestra en Prospectos
            -- Externos (se filtra abajo con status='pending').
            ELSE 'pending'
          END AS status,
          lc.chartback_notes AS admin_notes,
          COALESCE(lc.next_contact_at, lc.chartback_i_since, lc.created_at) AS updated_at,
          COALESCE(lc.claimed_by_user_id, mu.id) AS user_id,
          -- Nombre: legacy; si viene vacío, el del usuario dado de alta (por Box ID).
          COALESCE(NULLIF(TRIM(lc.full_name), ''), mu.full_name) AS full_name,
          COALESCE(NULLIF(TRIM(lc.email), ''), mu.email) AS email,
          lc.box_id,
          -- Teléfono: SIEMPRE prioriza el del usuario dado de alta; si no, el de legacy.
          COALESCE(NULLIF(TRIM(mu.phone), ''), lc.phone) AS phone,
          -- Asesor: el de recuperación (recovery_advisor_id); si no, el asesor
          -- original del cliente legacy (campo texto lc.asesor).
          COALESCE(adv.full_name, NULLIF(TRIM(lc.asesor), '')) AS assigned_advisor_name,
          lc.chartback_status,
          lc.chartback_notes AS advisor_response,
          lc.chartback_activity AS activity,
          lc.next_contact_at,
          (mu.id IS NOT NULL) AS reclamado
        FROM legacy_clients lc
        LEFT JOIN users adv ON lc.recovery_advisor_id = adv.id
        LEFT JOIN LATERAL (
          SELECT u2.id, u2.full_name, u2.email, u2.phone
            FROM users u2
           WHERE lc.box_id IS NOT NULL AND UPPER(TRIM(u2.box_id)) = UPPER(TRIM(lc.box_id))
           ORDER BY u2.id ASC
           LIMIT 1
        ) mu ON true
        WHERE LOWER(TRIM(COALESCE(lc.chartback_status, ''))) <> 'not_interested'
          AND NOT EXISTS (
            SELECT 1 FROM crm_requests cr
             WHERE cr.user_id IS NOT NULL
               AND cr.user_id = lc.claimed_by_user_id
          )

        UNION ALL

        -- Fuente 3: Prospectos externos que se REGISTRARON → "Prospectados"
        SELECT
          NULL::int AS request_id,
          'prospect'::text AS source,
          ('pr_' || p.id::text) AS lead_key,
          u.created_at,
          'prospected'::text AS status,
          p.notes AS admin_notes,
          u.created_at AS updated_at,
          u.id AS user_id,
          u.full_name,
          u.email,
          u.box_id,
          u.phone,
          padv.full_name AS assigned_advisor_name,
          NULL::text AS chartback_status,
          NULL::text AS advisor_response,
          NULL::jsonb AS activity,
          NULL::timestamptz AS next_contact_at,
          true AS reclamado
        FROM prospects p
        JOIN users u ON p.converted_user_id = u.id
        LEFT JOIN users padv ON p.assigned_advisor_id = padv.id
      ),
      -- Blacklist resuelto a nivel PERSONA (user_id + Box ID), no solo el lead_key.
      -- Así, si un cliente aparece en varias fuentes (crm/legacy/prospecto), al
      -- ponerlo en blacklist desaparece de TODAS.
      bl AS (
        SELECT r.user_id AS uid, NULL::text AS box
          FROM lead_blacklist b JOIN crm_requests r ON ('crm_' || r.id::text) = b.lead_key
        UNION
        SELECT lc.claimed_by_user_id AS uid, UPPER(TRIM(lc.box_id)) AS box
          FROM lead_blacklist b JOIN legacy_clients lc ON ('lc_' || lc.id::text) = b.lead_key
        UNION
        SELECT p.converted_user_id AS uid, NULL::text AS box
          FROM lead_blacklist b JOIN prospects p ON ('pr_' || p.id::text) = b.lead_key
      )
      SELECT * FROM (
        SELECT DISTINCT ON (COALESCE(NULLIF(UPPER(TRIM(c.box_id)), ''), c.lead_key))
               c.*,
               COALESCE(gr.groups, '[]'::jsonb) AS groups,
               EXISTS (
                 SELECT 1 FROM welcome_kit_requests wk
                  WHERE wk.status <> 'cancelado'
                    AND ( wk.lead_key = c.lead_key
                       OR (c.user_id IS NOT NULL AND wk.user_id = c.user_id)
                       OR (NULLIF(TRIM(c.box_id),'') IS NOT NULL AND UPPER(TRIM(wk.box_id)) = UPPER(TRIM(c.box_id))) )
               ) AS has_kit
          FROM combined c
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(jsonb_build_object('id', lg.id, 'name', lg.name, 'color', lg.color) ORDER BY lg.name) AS groups
              FROM lead_group_members m
              JOIN lead_groups lg ON lg.id = m.group_id
             WHERE m.lead_key = c.lead_key
          ) gr ON true
         -- Los leads en blacklist desaparecen del funnel (por lead_key, por usuario y por Box ID).
         WHERE NOT EXISTS (SELECT 1 FROM lead_blacklist b WHERE b.lead_key = c.lead_key)
           AND NOT EXISTS (SELECT 1 FROM bl WHERE bl.uid IS NOT NULL AND bl.uid = c.user_id)
           AND NOT EXISTS (SELECT 1 FROM bl WHERE bl.box IS NOT NULL AND bl.box = UPPER(TRIM(c.box_id)))
         -- Deduplica por cliente (Box ID): si un usuario tiene varias solicitudes,
         -- se queda la fila MÁS avanzada en el funnel y, a igualdad, la más reciente.
         ORDER BY COALESCE(NULLIF(UPPER(TRIM(c.box_id)), ''), c.lead_key),
                  CASE c.status WHEN 'converted' THEN 4 WHEN 'contacted' THEN 3 WHEN 'assigned' THEN 2 ELSE 1 END DESC,
                  c.created_at DESC NULLS LAST
      ) dedup
      ORDER BY dedup.created_at DESC NULLS LAST
    `;

// Ejecuta la consulta combinada de leads (SOLO LECTURA) y aplica el mismo
// filtrado/estadísticas que la Central de Leads. Reutilizable por Cajito.
export async function fetchLeads(opts: { status?: any; search?: any }): Promise<{
  leads: any[]; stats: Record<string, number>; isSearch: boolean;
}> {
  const { status, search } = opts;
  const all = await pool.query(LEADS_COMBINED_QUERY);

  // Los "sin reclamar" (status='pending') ya NO viven en CRM Leads: se muestran
  // en Prospectos Externos. Aquí se excluyen por completo.
  const rows = all.rows.filter((r: any) => r.status !== 'pending');

  // Stats sobre TODAS las fuentes (funnel combinado, sin los sin-reclamar)
  const stats = { prospected: 0, waiting: 0, pending: 0, assigned: 0, contacted: 0, converted: 0 };
  for (const row of rows) {
    if (row.status && Object.prototype.hasOwnProperty.call(stats, row.status)) {
      stats[row.status as keyof typeof stats]++;
    }
  }

  // Búsqueda global: si viene `search`, busca en TODAS las listas (ignora la
  // pestaña) para poder llevar al usuario a donde esté. Cada lead conserva su
  // `status` (la lista donde vive), que la UI muestra en la columna Estado.
  const q = String(search || '').trim().toLowerCase();
  let leads;
  if (q) {
    const qDigits = q.replace(/\D/g, '');
    leads = rows.filter((r: any) => {
      const box = String(r.box_id || '').toLowerCase();
      const boxWithS = box.startsWith('s') ? box : ('s' + box);
      const name = String(r.full_name || '').toLowerCase();
      const email = String(r.email || '').toLowerCase();
      const adv = String(r.assigned_advisor_name || '').toLowerCase();
      const phone = String(r.phone || '').replace(/\D/g, '');
      return box.includes(q) || boxWithS.includes(q)
        || name.includes(q) || email.includes(q) || adv.includes(q)
        || (qDigits.length >= 4 && phone.includes(qDigits));
    });
  } else {
    leads = (status && status !== 'all')
      ? rows.filter((r: any) => r.status === status)
      : rows;
  }

  return { leads, stats, isSearch: !!q };
}

export const getCrmLeads = async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, search } = req.query;
    await ensureGroupsSchema();
    await ensureWelcomeKitSchema();
    // Los prospectos que ya se registraron pasan a "Prospectados".
    await reconcileRegisteredProspects();

    const { leads, stats, isSearch } = await fetchLeads({ status, search });
    res.json({ success: true, leads, stats, isSearch });
  } catch (error) {
    console.error('Error en getCrmLeads:', error);
    res.status(500).json({ success: false, error: 'Error al obtener leads' });
  }
};

// 🖥️ ADMIN: ALTAS DE USUARIOS (nuevos registros) — semana (reinicia lunes) y mes
// (reinicia el día 1), en hora de México. Widgets principales de Central de Leads.
export const getRegistrationStats = async (_req: Request, res: Response): Promise<any> => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey' >= date_trunc('week',  now() AT TIME ZONE 'America/Monterrey')) AS week,
        COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey' >= date_trunc('month', now() AT TIME ZONE 'America/Monterrey')) AS month,
        COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey' >= date_trunc('year',  now() AT TIME ZONE 'America/Monterrey')) AS year,
        COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey' >= date_trunc('day',   now() AT TIME ZONE 'America/Monterrey')) AS today
      FROM users
      WHERE role = 'client' AND deleted_at IS NULL
        AND created_at <= now()
    `);
    const row = r.rows[0] || {};
    // Contenedores dados de alta este mes calendario (reinicia el día 1).
    // Clasificación (misma que el panel Costeo Marítimo):
    //   FCL = contenedor con cliente dueño (legacy_client_id) o sin week_number.
    //   LCL = sin cliente y con week_number → agrupado por semana; "weeks" =
    //         cantidad de semanas (week_number) distintas.
    // (NO usar containers.type: es el tipo de despacho aduanal 单清/双清.)
    let fclMonth = 0, lclMonth = 0;
    try {
      const c = await pool.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE legacy_client_id IS NOT NULL OR week_number IS NULL OR TRIM(week_number) = ''
          ) AS fcl,
          COUNT(DISTINCT week_number) FILTER (
            WHERE legacy_client_id IS NULL AND week_number IS NOT NULL AND TRIM(week_number) <> ''
          ) AS lcl_weeks
        FROM containers
        WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey' >= date_trunc('month', now() AT TIME ZONE 'America/Monterrey')
          AND created_at <= now()
      `);
      fclMonth = Number(c.rows[0]?.fcl) || 0;
      lclMonth = Number(c.rows[0]?.lcl_weeks) || 0;
    } catch (e) { /* tabla containers puede no existir en algún entorno */ }

    // AWBs (China aéreo) y kilos de la SEMANA — reinicia el DOMINGO.
    // date_trunc('week') empieza en lunes; se corre 1 día para que sea domingo.
    let awbWeek = 0, kgWeek = 0;
    try {
      const a = await pool.query(`
        SELECT COUNT(*) AS awbs, COALESCE(SUM(total_weight), 0) AS kilos
        FROM china_receipts
        WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey'
              >= (date_trunc('week', (now() AT TIME ZONE 'America/Monterrey') + interval '1 day') - interval '1 day')
          AND created_at <= now()
      `);
      awbWeek = Number(a.rows[0]?.awbs) || 0;
      kgWeek = Math.round((Number(a.rows[0]?.kilos) || 0) * 100) / 100;
    } catch (e) { /* tabla china_receipts puede no existir en algún entorno */ }

    // X-Pay de la SEMANA (reinicia lunes). Solo operaciones realmente enviadas
    // (excluye canceladas/error/pendientes). El conteo excluye MXN (solo
    // internacionales USD/RMB) y el monto USD suma únicamente las operaciones USD.
    let xpayOpsWeek = 0, xpayUsdWeek = 0;
    try {
      const x = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE op_divisa_destino <> 'MXN')                                      AS ops,
          COALESCE(SUM(op_monto) FILTER (WHERE op_divisa_destino = 'USD'), 0)                      AS usd
        FROM entangled_payment_requests
        WHERE estatus_global NOT IN ('cancelado','error_envio','rechazado','pendiente')
          AND created_at <= now()
          AND created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey'
              >= date_trunc('week', now() AT TIME ZONE 'America/Monterrey')
      `);
      xpayOpsWeek = Number(x.rows[0]?.ops) || 0;
      xpayUsdWeek = Math.round((Number(x.rows[0]?.usd) || 0) * 100) / 100;
    } catch (e) { /* tabla entangled_payment_requests puede no existir en algún entorno */ }

    res.json({
      success: true,
      week: Number(row.week) || 0, month: Number(row.month) || 0, year: Number(row.year) || 0, today: Number(row.today) || 0,
      fcl_month: fclMonth, lcl_month: lclMonth,
      awb_week: awbWeek, kg_week: kgWeek,
      xpay_ops_week: xpayOpsWeek, xpay_usd_week: xpayUsdWeek,
    });
  } catch (error) {
    console.error('Error en getRegistrationStats:', error);
    res.status(500).json({ success: false, error: 'Error al obtener altas' });
  }
};

// 📈 ADMIN: SERIE TEMPORAL para las gráficas de los widgets (altas/fcl/lcl/awb/kg/
// interesados). granularity: day (7 días) | week (~2 meses) | month (12 meses).
// Devuelve buckets contiguos (rellena con 0) en hora de México, orden viejo→nuevo.
export const getWidgetSeries = async (req: Request, res: Response): Promise<any> => {
  try {
    const metric = String(req.query.metric || 'altas').toLowerCase();
    const granRaw = String(req.query.granularity || 'day').toLowerCase();
    const trunc = granRaw === 'month' ? 'month' : granRaw === 'week' ? 'week' : 'day';
    const periods = Math.min(Math.max(parseInt(String(req.query.periods || '7'), 10) || 7, 1), 36);

    // Whitelist de métricas → tabla / columna fecha / expresión de valor / filtro.
    const M: Record<string, { table: string; dateCol: string; val: string; where: string }> = {
      altas:      { table: 'users',          dateCol: 'created_at', val: 'COUNT(*)',                     where: "role = 'client' AND deleted_at IS NULL" },
      awb:        { table: 'china_receipts', dateCol: 'created_at', val: 'COUNT(*)',                     where: 'TRUE' },
      kg:         { table: 'china_receipts', dateCol: 'created_at', val: 'COALESCE(SUM(total_weight),0)', where: 'TRUE' },
      fcl:        { table: 'containers',     dateCol: 'created_at', val: "COUNT(*) FILTER (WHERE legacy_client_id IS NOT NULL OR week_number IS NULL OR TRIM(week_number) = '')", where: 'TRUE' },
      lcl:        { table: 'containers',     dateCol: 'created_at', val: "COUNT(DISTINCT week_number) FILTER (WHERE legacy_client_id IS NULL AND week_number IS NOT NULL AND TRIM(week_number) <> '')", where: 'TRUE' },
      interested: { table: 'prospects',      dateCol: 'updated_at', val: 'COUNT(*)',                     where: "status = 'interested'" },
      xpay_ops:   { table: 'entangled_payment_requests', dateCol: 'created_at', val: 'COUNT(*)',                          where: "op_divisa_destino <> 'MXN' AND estatus_global NOT IN ('cancelado','error_envio','rechazado','pendiente')" },
      xpay_usd:   { table: 'entangled_payment_requests', dateCol: 'created_at', val: 'COALESCE(SUM(op_monto),0)',         where: "op_divisa_destino = 'USD' AND estatus_global NOT IN ('cancelado','error_envio','rechazado','pendiente')" },
    };
    const cfg = M[metric];
    if (!cfg) return res.status(400).json({ success: false, error: 'Métrica inválida' });

    const sql = `
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('${trunc}', (now() AT TIME ZONE 'America/Monterrey')) - interval '${periods - 1} ${trunc}',
          date_trunc('${trunc}', (now() AT TIME ZONE 'America/Monterrey')),
          interval '1 ${trunc}'
        )::date AS bucket
      ),
      data AS (
        SELECT date_trunc('${trunc}', (${cfg.dateCol} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey'))::date AS bucket,
               ${cfg.val} AS value
        FROM ${cfg.table}
        WHERE ${cfg.where}
          AND ${cfg.dateCol} <= now()
          AND (${cfg.dateCol} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey')
              >= date_trunc('${trunc}', (now() AT TIME ZONE 'America/Monterrey')) - interval '${periods - 1} ${trunc}'
        GROUP BY 1
      )
      SELECT b.bucket, COALESCE(d.value, 0)::numeric AS value
      FROM buckets b LEFT JOIN data d ON d.bucket = b.bucket
      ORDER BY b.bucket ASC
    `;
    const r = await pool.query(sql);
    const series = r.rows.map((x: any) => ({ bucket: x.bucket, value: Number(x.value) || 0 }));
    res.json({ success: true, metric, granularity: trunc, periods, series });
  } catch (error: any) {
    console.error('Error en getWidgetSeries:', error);
    res.status(500).json({ success: false, error: 'Error al obtener la serie' });
  }
};

// 📋 ADMIN: LISTA DE ALTAS de un periodo (para el detalle al hacer click en los
// widgets). Devuelve nombre, teléfono, box id, fecha/hora de alta y asesor
// asignado (si tiene). Solo clientes, mismo criterio que getRegistrationStats.
export const getRegistrationList = async (req: Request, res: Response): Promise<any> => {
  try {
    const period = String(req.query.period || 'week');
    const trunc: Record<string, string> = { today: 'day', week: 'week', month: 'month', year: 'year' };
    const unit = trunc[period] || 'week';
    const r = await pool.query(`
      SELECT
        u.id, u.full_name, u.phone, u.box_id, u.created_at,
        a.full_name AS advisor_name
      FROM users u
      LEFT JOIN users a ON u.advisor_id = a.id
      WHERE u.role = 'client' AND u.deleted_at IS NULL
        AND u.created_at <= now()
        AND u.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey' >= date_trunc('${unit}', now() AT TIME ZONE 'America/Monterrey')
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, period, count: r.rows.length, items: r.rows });
  } catch (error) {
    console.error('Error en getRegistrationList:', error);
    res.status(500).json({ success: false, error: 'Error al obtener lista de altas' });
  }
};

// 🖥️ ADMIN: OBTENER LISTA DE ASESORES DISPONIBLES
export const getAvailableAdvisors = async (req: Request, res: Response): Promise<any> => {
  try {
    const advisors = await pool.query(`
      SELECT id, full_name, email, referral_code, box_id, phone
      FROM users
      WHERE role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')
        AND COALESCE(is_active, TRUE) = TRUE
        AND deleted_at IS NULL
        AND COALESCE(is_blocked, FALSE) = FALSE
      ORDER BY full_name
    `);
    
    res.json({ success: true, advisors: advisors.rows });
  } catch (error) {
    console.error('Error en getAvailableAdvisors:', error);
    res.status(500).json({ success: false, error: 'Error al obtener asesores' });
  }
};

// 🖥️ ADMIN: ASIGNAR ASESOR MANUALMENTE
export const assignAdvisorManually = async (req: Request, res: Response): Promise<any> => {
  try {
    const { requestId, userId, advisorId, notes } = req.body;

    // 1. Actualizar usuario (Asignarle el asesor)
    await pool.query('UPDATE users SET referred_by_id = $1 WHERE id = $2', [advisorId, userId]);

    // 2. Actualizar el ticket del CRM
    await pool.query(
      `UPDATE crm_requests 
       SET status = 'assigned', 
           assigned_advisor_id = $1, 
           admin_notes = $2,
           updated_at = NOW() 
       WHERE id = $3`,
      [advisorId, notes || null, requestId]
    );

    // Obtener nombre del asesor
    const advisorRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [advisorId]);
    
    res.json({ 
      success: true,
      message: `Lead asignado a ${advisorRes.rows[0]?.full_name || 'asesor'}` 
    });
  } catch (error) {
    console.error('Error en assignAdvisorManually:', error);
    res.status(500).json({ success: false, error: 'Error al asignar' });
  }
};

// 🖥️ ADMIN: ACTUALIZAR ESTADO DEL LEAD
export const updateLeadStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const { requestId, status, notes } = req.body;

    await pool.query(
      `UPDATE crm_requests 
       SET status = $1, 
           admin_notes = COALESCE($2, admin_notes),
           updated_at = NOW() 
       WHERE id = $3`,
      [status, notes, requestId]
    );

    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error en updateLeadStatus:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar estado' });
  }
};

// ============================================================================
// 📣 ENVÍO MASIVO DE WHATSAPP A LEADS (plantillas predefinidas de Meta)
// ============================================================================
// Nombres de plantilla configurables por env para calzar con lo aprobado en Meta.
const WA_TPL_INVITE = process.env.WHATSAPP_INVITE_TEMPLATE || 'invitacion_registro_entregax';
const WA_TPL_XPAY = process.env.WHATSAPP_XPAY_WEEKLY_TEMPLATE || 'xpay_tc';           // TC + comisión
const WA_TPL_XPAY_TC = process.env.WHATSAPP_XPAY_TC_TEMPLATE || 'xpay_solo_tc';       // solo TC
const WA_TPL_TARIFAS = process.env.WHATSAPP_TARIFAS_TEMPLATE || 'tarifas_maritimo_aereo';

// Lee los valores vigentes de la BD para prellenar las plantillas 2 y 3.
async function getCurrentBulkValues(): Promise<{ tc: number | null; comision: number | null; cbm: number | null; kg: number | null }> {
  const out = { tc: null as number | null, comision: null as number | null, cbm: null as number | null, kg: null as number | null };
  // TC X-Pay (proveedor default activo). Efectivo = base + override (el override
  // es un ajuste que se SUMA, no un reemplazo). Redondeado a 2 decimales.
  try {
    const r = await pool.query(`SELECT (tipo_cambio_usd + COALESCE(override_tipo_cambio_usd, 0)) AS tc FROM entangled_providers WHERE is_active = true ORDER BY is_default DESC, sort_order, id LIMIT 1`);
    if (r.rows[0]?.tc != null) out.tc = Math.round(Number(r.rows[0].tc) * 100) / 100;
  } catch { /* tabla opcional */ }
  // Comisión X-Pay (sin factura como base)
  try {
    const r = await pool.query(`SELECT comision_pago_sin_factura FROM entangled_service_config WHERE id = 1`);
    if (r.rows[0]?.comision_pago_sin_factura != null) out.comision = Number(r.rows[0].comision_pago_sin_factura);
  } catch { /* tabla opcional */ }
  // Costo marítimo por CBM — tarifa de MAYOR volumen (20+ m³) de categoría
  // 'Generico', la más competitiva (el tier no-flat de menor precio = $649).
  try {
    const r = await pool.query(`
      SELECT pt.price FROM pricing_tiers pt
      JOIN pricing_categories pc ON pt.category_id = pc.id
      WHERE pc.name = 'Generico' AND pt.is_active = true AND COALESCE(pt.is_flat_fee, false) = false
      ORDER BY pt.price ASC LIMIT 1
    `);
    if (r.rows[0]?.price != null) out.cbm = Number(r.rows[0].price);
  } catch { /* tabla opcional */ }
  // Costo aéreo por kg — MISMA fuente que el widget: air_routes.cost_per_kg_usd + 8
  // (markup fijo) de la primera ruta activa no-express.
  try {
    const r = await pool.query(`SELECT cost_per_kg_usd FROM air_routes WHERE is_active = true AND code <> 'TDI-EXPRES' ORDER BY id ASC LIMIT 1`);
    const base = Number(r.rows[0]?.cost_per_kg_usd) || 0;
    out.kg = base > 0 ? Math.round((base + 8) * 100) / 100 : 8;
  } catch { /* tabla opcional */ }
  return out;
}

// ============================================================================
// PLANTILLAS DE ENVÍO MASIVO (administrables desde la UI)
// ============================================================================
// variables JSONB = campos MANUALES en orden: [{ label, defaultKey? }]. El nombre
// del cliente es SIEMPRE la primera variable ({{1}}) y se llena solo; los campos
// manuales son {{2}}, {{3}}, ... El preview usa [Nombre] y {1},{2}... como marcadores.
let bulkTemplatesReady = false;
async function ensureBulkTemplatesSchema(): Promise<void> {
  if (bulkTemplatesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bulk_wa_templates (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      template_name TEXT NOT NULL,
      language_code TEXT DEFAULT 'es_MX',
      variables JSONB DEFAULT '[]'::jsonb,
      preview TEXT,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // URL pública de la imagen del encabezado (si la plantilla tiene header IMAGEN).
  await pool.query(`ALTER TABLE bulk_wa_templates ADD COLUMN IF NOT EXISTS header_image_url TEXT`).catch(() => {});
  // Key en S3 de la imagen subida desde la UI (bucket privado → se firma al enviar).
  await pool.query(`ALTER TABLE bulk_wa_templates ADD COLUMN IF NOT EXISTS header_image_key TEXT`).catch(() => {});
  // Usar la API de Marketing (MM Lite) en vez de la Cloud API para esta plantilla.
  await pool.query(`ALTER TABLE bulk_wa_templates ADD COLUMN IF NOT EXISTS use_mm_lite BOOLEAN DEFAULT false`).catch(() => {});
  // Si la plantilla incluye el nombre del cliente como {{1}}. Las plantillas SIN
  // variables (ninguna) deben tener uses_name=false para no mandar parámetros de más.
  await pool.query(`ALTER TABLE bulk_wa_templates ADD COLUMN IF NOT EXISTS uses_name BOOLEAN DEFAULT true`).catch(() => {});
  // URL destino del botón de acción (rastreo de clics). Si está seteada, la plantilla
  // tiene un botón de URL DINÁMICA en Meta (https://api.entregax.app/r/{{1}}) y al enviar
  // se genera un token por destinatario para saber quién hizo clic.
  await pool.query(`ALTER TABLE bulk_wa_templates ADD COLUMN IF NOT EXISTS link_dest TEXT`).catch(() => {});
  // Seed inicial (solo si la tabla está vacía) con las 4 plantillas actuales.
  const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM bulk_wa_templates`);
  if ((cnt.rows[0]?.n || 0) === 0) {
    const seed = [
      { label: '📲 Invitación a registrarse en la app', name: WA_TPL_INVITE, vars: [],
        preview: '¡Hola [Nombre]! 👋 Te damos la bienvenida a EntregaX Paquetería.\nRegístrate y obtén tu casillero para importar desde China 🇨🇳 y USA 🇺🇸 con las mejores tarifas. 📦' },
      { label: '💱 TC + comisión X-Pay (semanal)', name: WA_TPL_XPAY,
        vars: [{ label: 'Tipo de cambio (MXN/USD)', defaultKey: 'tc' }, { label: 'Comisión X-Pay (%)', defaultKey: 'comision' }],
        preview: '💱 EntregaX X-Pay — Tipo de cambio de la semana\nHola [Nombre]:\n• TC: ${1} MXN/USD\n• Comisión X-Pay: {2}%' },
      { label: '💱 Solo tipo de cambio X-Pay', name: WA_TPL_XPAY_TC,
        vars: [{ label: 'Tipo de cambio (MXN/USD)', defaultKey: 'tc' }],
        preview: '💱 EntregaX X-Pay — Tipo de cambio\nHola [Nombre]:\n• Tipo de cambio: ${1} MXN / USD' },
      { label: '📦 Tarifas marítimo/aéreo (CBM y kg)', name: WA_TPL_TARIFAS,
        vars: [{ label: 'Marítimo (USD/m³ CBM)', defaultKey: 'cbm' }, { label: 'Aéreo (USD/kg)', defaultKey: 'kg' }],
        preview: '📦 EntregaX — Tarifas de importación vigentes\nHola [Nombre]:\n🚢 Marítimo: ${1} USD/m³ (CBM)\n✈️ Aéreo: ${2} USD/kg' },
    ];
    for (let i = 0; i < seed.length; i++) {
      const s = seed[i];
      if (!s) continue;
      await pool.query(
        `INSERT INTO bulk_wa_templates (label, template_name, language_code, variables, preview, sort_order)
         VALUES ($1, $2, 'es_MX', $3::jsonb, $4, $5)`,
        [s.label, s.name, JSON.stringify(s.vars), s.preview, i]
      );
    }
  }
  bulkTemplatesReady = true;
}

// ============================================================================
// 🔗 RASTREO DE CLICS EN BOTONES DE URL (WhatsApp)
// ============================================================================
// Cada envío con botón de URL dinámica genera un token por destinatario. La
// plantilla en Meta apunta a https://api.entregax.app/r/{{1}} y {{1}} = token.
// Al hacer clic, /r/:token registra el clic y redirige al destino real.
let clickLinksReady = false;
async function ensureClickLinksSchema(): Promise<void> {
  if (clickLinksReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_click_links (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      lead_key TEXT NOT NULL,
      template_id INTEGER,
      destination TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      first_click_at TIMESTAMPTZ,
      last_click_at TIMESTAMPTZ,
      click_count INTEGER DEFAULT 0
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wa_click_links_lead ON wa_click_links(lead_key);`).catch(() => {});
  clickLinksReady = true;
}

// GET /r/:token → registra el clic y redirige al destino real.
export const trackClickRedirect = async (req: Request, res: Response): Promise<any> => {
  const fallback = (process.env.WEB_BASE_URL || 'https://www.entregax.app').replace(/\/$/, '');
  try {
    await ensureClickLinksSchema();
    const token = String(req.params.token || '').trim();
    if (!token) return res.redirect(302, fallback);
    const r = await pool.query(
      `UPDATE wa_click_links
          SET click_count = click_count + 1,
              last_click_at = NOW(),
              first_click_at = COALESCE(first_click_at, NOW())
        WHERE token = $1
      RETURNING lead_key, destination, name, phone`,
      [token]
    );
    const row = r.rows[0];
    if (!row) return res.redirect(302, fallback);
    // El clic saca al lead de la secuencia automatizada (interactuó).
    if (row.lead_key) await stopSequenceByLeadKey(String(row.lead_key), 'clicked');
    // Reflejar el clic en el prospecto: cualquier funnel pasa 'new'/'contacting' → 'interested'.
    // NO se toca si ya está 'converted'/'lost' (no se degrada ni se reactiva).
    if (String(row.lead_key || '').startsWith('pr_')) {
      const pid = parseInt(String(row.lead_key).slice(3), 10);
      if (pid) {
        await pool.query(
          `UPDATE prospects SET status = 'interested', updated_at = NOW()
            WHERE id = $1 AND status IN ('new', 'contacting')`,
          [pid]
        ).catch(() => {});
      }
    }
    // Si el clic fue en "Reclamar Regalo" (destino del kit) → crear solicitud de kit.
    if (/\/kit(\/|\?|#|$)/i.test(String(row.destination || ''))) {
      await createKitRequestFromClick(String(row.lead_key || ''), row.name || null, row.phone || null);
    }
    return res.redirect(302, row.destination || fallback);
  } catch (e) {
    console.warn('[CRM] trackClickRedirect:', (e as Error).message);
    return res.redirect(302, fallback);
  }
};

// GET /api/admin/crm/bulk-templates → plantillas + valores vigentes para prellenar
export const getBulkTemplates = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureBulkTemplatesSchema();
    const r = await pool.query(`SELECT id, label, template_name, language_code, variables, preview, header_image_url, header_image_key, use_mm_lite, uses_name, link_dest FROM bulk_wa_templates WHERE is_active = true ORDER BY sort_order ASC, id ASC`);
    // Si la imagen fue subida a S3 (bucket privado), firmar una URL para la vista previa en la UI.
    const templates = await Promise.all(r.rows.map(async (t: any) => {
      let displayUrl = t.header_image_url || null;
      if (t.header_image_key) {
        try { displayUrl = await getSignedUrlForKey(t.header_image_key, 6 * 3600); } catch { /* ignore */ }
      }
      return { ...t, header_image_display: displayUrl };
    }));
    const values = await getCurrentBulkValues();
    res.json({ success: true, templates, values });
  } catch (error) {
    console.error('Error en getBulkTemplates:', error);
    res.status(500).json({ success: false, error: 'Error al obtener plantillas' });
  }
};

// POST /api/admin/crm/bulk-templates { label, template_name, language_code?, variables?, preview? }
export const createBulkTemplate = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureBulkTemplatesSchema();
    const { label, template_name, language_code, variables, preview, header_image_url, header_image_key, use_mm_lite, uses_name, link_dest } = req.body || {};
    if (!String(label || '').trim() || !String(template_name || '').trim()) {
      return res.status(400).json({ success: false, error: 'Falta la etiqueta o el nombre de la plantilla' });
    }
    const vars = Array.isArray(variables) ? variables : [];
    const maxSort = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM bulk_wa_templates`);
    const r = await pool.query(
      `INSERT INTO bulk_wa_templates (label, template_name, language_code, variables, preview, header_image_url, header_image_key, use_mm_lite, uses_name, link_dest, sort_order)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [String(label).trim(), String(template_name).trim(), String(language_code || 'es_MX'), JSON.stringify(vars), preview || null, (String(header_image_url || '').trim() || null), (String(header_image_key || '').trim() || null), !!use_mm_lite, uses_name !== false, (String(link_dest || '').trim() || null), maxSort.rows[0].n]
    );
    res.json({ success: true, id: r.rows[0].id });
  } catch (error) {
    console.error('Error en createBulkTemplate:', error);
    res.status(500).json({ success: false, error: 'Error al crear plantilla' });
  }
};

// PUT /api/admin/crm/bulk-templates/:id
export const updateBulkTemplate = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureBulkTemplatesSchema();
    const id = parseInt(String(req.params.id), 10);
    const { label, template_name, language_code, variables, preview, header_image_url, header_image_key, use_mm_lite, uses_name, link_dest } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    if (!String(label || '').trim() || !String(template_name || '').trim()) {
      return res.status(400).json({ success: false, error: 'Falta la etiqueta o el nombre de la plantilla' });
    }
    const vars = Array.isArray(variables) ? variables : [];
    await pool.query(
      `UPDATE bulk_wa_templates SET label = $1, template_name = $2, language_code = $3, variables = $4::jsonb, preview = $5, header_image_url = $6, header_image_key = $7, use_mm_lite = $8, uses_name = $9, link_dest = $10 WHERE id = $11`,
      [String(label).trim(), String(template_name).trim(), String(language_code || 'es_MX'), JSON.stringify(vars), preview || null, (String(header_image_url || '').trim() || null), (String(header_image_key || '').trim() || null), !!use_mm_lite, uses_name !== false, (String(link_dest || '').trim() || null), id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error en updateBulkTemplate:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar plantilla' });
  }
};

// DELETE /api/admin/crm/bulk-templates/:id
export const deleteBulkTemplate = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureBulkTemplatesSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    await pool.query(`DELETE FROM bulk_wa_templates WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error en deleteBulkTemplate:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar plantilla' });
  }
};

// POST /api/admin/crm/bulk-templates/upload-image  (multipart, field "file")
// Sube la imagen del encabezado a S3 y devuelve { key, url } para prellenar el editor.
// La imagen se guarda como key; al enviar se firma una URL fresca que Meta descarga.
export const uploadBulkTemplateImage = async (req: Request, res: Response): Promise<any> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !file.buffer) {
      return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen' });
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (mime !== 'image/jpeg' && mime !== 'image/png') {
      return res.status(400).json({ success: false, error: 'La imagen debe ser JPG o PNG' });
    }
    if (!isS3Configured()) {
      return res.status(500).json({ success: false, error: 'Almacenamiento de imágenes no configurado (S3)' });
    }
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const key = `bulk-wa-templates/header-${Date.now()}.${ext}`;
    await uploadToS3(file.buffer, key, mime);
    // URL firmada para vista previa inmediata en la UI.
    let url: string | null = null;
    try { url = await getSignedUrlForKey(key, 6 * 3600); } catch { /* ignore */ }
    return res.json({ success: true, key, url });
  } catch (error: any) {
    console.error('Error en uploadBulkTemplateImage:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error al subir imagen' });
  }
};

// GET /api/admin/crm/bulk-whatsapp/defaults → valores vigentes para prellenar el form
export const getBulkWhatsappDefaults = async (_req: Request, res: Response): Promise<any> => {
  try {
    const values = await getCurrentBulkValues();
    res.json({ success: true, values });
  } catch (error) {
    console.error('Error en getBulkWhatsappDefaults:', error);
    res.status(500).json({ success: false, error: 'Error al obtener valores vigentes' });
  }
};

// POST /api/admin/crm/bulk-whatsapp
// Body: { messageType: 'invite'|'xpay'|'tarifas', leadKeys: string[], values?: {tc,comision,cbm,kg} }
export const bulkWhatsapp = async (req: Request, res: Response): Promise<any> => {
  try {
    const { templateId, leadKeys, advisorIds, varValues } = req.body || {};
    const isAdvisors = Array.isArray(advisorIds) && advisorIds.length > 0;
    if (!isAdvisors && (!Array.isArray(leadKeys) || leadKeys.length === 0)) {
      return res.status(400).json({ success: false, error: 'Selecciona al menos un destinatario' });
    }
    const recipientCount = isAdvisors ? advisorIds.length : leadKeys.length;
    if (recipientCount > 500) {
      return res.status(400).json({ success: false, error: 'Máximo 500 destinatarios por envío' });
    }

    // Cargar la plantilla seleccionada (administrable desde la UI).
    await ensureBulkTemplatesSchema();
    const tplRes = await pool.query(`SELECT id, template_name, language_code, variables, header_image_url, header_image_key, use_mm_lite, uses_name, link_dest FROM bulk_wa_templates WHERE id = $1`, [parseInt(String(templateId), 10) || 0]);
    if (!tplRes.rows[0]) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
    const tpl = tplRes.rows[0];
    // Resolver la imagen del encabezado: si se subió a S3 (bucket privado), firmar una
    // URL fresca (Meta la descarga al momento de enviar). Si no, usar la URL pública manual.
    let headerImageUrl: string | undefined;
    if (tpl.header_image_key) {
      try { headerImageUrl = await getSignedUrlForKey(tpl.header_image_key, 6 * 3600); }
      catch (e) { console.warn('[CRM] no se pudo firmar imagen de plantilla:', (e as Error).message); }
    }
    if (!headerImageUrl) headerImageUrl = tpl.header_image_url || undefined;
    const tplVars: Array<{ label?: string }> = Array.isArray(tpl.variables) ? tpl.variables : [];
    const vals: string[] = Array.isArray(varValues) ? varValues.map((v: any) => String(v ?? '').trim()) : [];
    // Todos los campos manuales de la plantilla deben tener valor.
    for (let i = 0; i < tplVars.length; i++) {
      if (!vals[i]) return res.status(400).json({ success: false, error: `Falta el valor de "${tplVars[i]?.label || `campo ${i + 1}`}"` });
    }

    // Resolver nombre + teléfono de los destinatarios.
    const rowsRes = isAdvisors
      ? await pool.query(
          `SELECT ('adv_' || u.id::text) AS lead_key, u.full_name, u.phone
             FROM users u
            WHERE u.id = ANY($1::int[])
              AND u.role IN ('advisor','asesor','asesor_lider','sub_advisor')`,
          [advisorIds.map((x: any) => parseInt(String(x), 10)).filter((n: number) => Number.isFinite(n))]
        )
      : await pool.query(
      `SELECT ('crm_' || r.id::text) AS lead_key, u.full_name, u.phone
         FROM crm_requests r JOIN users u ON r.user_id = u.id
        WHERE ('crm_' || r.id::text) = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM lead_blacklist bl WHERE bl.lead_key = ('crm_' || r.id::text))
       UNION ALL
       SELECT ('lc_' || lc.id::text) AS lead_key,
              COALESCE(NULLIF(TRIM(lc.full_name), ''), mu.full_name) AS full_name,
              COALESCE(NULLIF(TRIM(mu.phone), ''), lc.phone) AS phone
         FROM legacy_clients lc
         LEFT JOIN LATERAL (
           SELECT u2.full_name, u2.phone FROM users u2
            WHERE lc.box_id IS NOT NULL AND UPPER(TRIM(u2.box_id)) = UPPER(TRIM(lc.box_id))
            ORDER BY u2.id ASC LIMIT 1
         ) mu ON true
        WHERE ('lc_' || lc.id::text) = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM lead_blacklist bl WHERE bl.lead_key = ('lc_' || lc.id::text))
       UNION ALL
       SELECT ('pr_' || p.id::text) AS lead_key,
              COALESCE(NULLIF(TRIM(p.full_name), ''), '') AS full_name,
              p.whatsapp AS phone
         FROM prospects p
        WHERE ('pr_' || p.id::text) = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM lead_blacklist bl WHERE bl.lead_key = ('pr_' || p.id::text))`,
      [leadKeys]
    );

    const template = tpl.template_name;
    const langCode = tpl.language_code || 'es_MX';
    const seenPhones = new Set<string>();
    const results = { total: rowsRes.rows.length, sent: 0, skipped: 0, failed: 0, details: [] as any[] };

    // Rastreo de clics: si la plantilla tiene destino de botón, generamos un token
    // por destinatario y armamos la URL de redirect (botón de URL dinámica en Meta).
    const linkDest = String(tpl.link_dest || '').trim();
    const trackClicks = !!linkDest;
    if (trackClicks) await ensureClickLinksSchema();
    const { randomBytes } = await import('crypto');

    // 1) Pre-filtrar (rápido, sin red): descartar sin teléfono y duplicados.
    const usesName = tpl.uses_name !== false;
    const toSend: any[] = [];
    for (const row of rowsRes.rows) {
      const phone = row.phone;
      if (!phone || String(phone).trim() === '') {
        results.skipped++;
        results.details.push({ lead_key: row.lead_key, name: row.full_name, status: 'skipped', reason: 'Sin teléfono' });
        continue;
      }
      const compact = String(phone).replace(/\D/g, '');
      if (seenPhones.has(compact)) {
        results.skipped++;
        results.details.push({ lead_key: row.lead_key, name: row.full_name, status: 'skipped', reason: 'Teléfono duplicado' });
        continue;
      }
      seenPhones.add(compact);
      toSend.push(row);
    }

    // Envío de UN destinatario (token de rastreo + plantilla).
    const sendOne = async (row: any) => {
      const nombre = String(row.full_name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
      const phone = row.phone;
      const parameters = usesName
        ? [nombre, ...vals.slice(0, tplVars.length)]
        : vals.slice(0, tplVars.length);
      let urlButtonParam: string | undefined;
      if (trackClicks) {
        try {
          const token = randomBytes(9).toString('base64url');
          await pool.query(
            `INSERT INTO wa_click_links (token, lead_key, template_id, destination, name, phone)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [token, row.lead_key, tpl.id, linkDest, row.full_name || null, String(phone)]
          );
          urlButtonParam = token;
        } catch (e) { console.warn('[CRM] no se pudo crear token de rastreo:', (e as Error).message); }
      }
      try {
        const r = await sendTemplate({ to: phone, template, languageCode: langCode, parameters, ...(headerImageUrl ? { headerImageUrl } : {}), ...(urlButtonParam ? { urlButtonParam } : {}), useMarketingApi: !!tpl.use_mm_lite });
        if (r.ok) {
          results.sent++;
          results.details.push({ lead_key: row.lead_key, name: row.full_name, status: 'sent' });
        } else if (r.skipped) {
          results.skipped++;
          results.details.push({ lead_key: row.lead_key, name: row.full_name, status: 'skipped', reason: 'WhatsApp no configurado' });
        } else {
          results.failed++;
          results.details.push({ lead_key: row.lead_key, name: row.full_name, status: 'failed', reason: r.error || 'Error' });
        }
      } catch (e: any) {
        results.failed++;
        results.details.push({ lead_key: row.lead_key, name: row.full_name, status: 'failed', reason: e?.message || 'Error' });
      }
    };

    // 2) Enviar en paralelo con concurrencia acotada. El envío secuencial de
    //    cientos de mensajes tardaba >60s y el gateway cortaba la conexión
    //    (se veía como error de CORS en el navegador). En lotes de 8 cabe bien.
    const CONCURRENCY = 8;
    for (let i = 0; i < toSend.length; i += CONCURRENCY) {
      await Promise.all(toSend.slice(i, i + CONCURRENCY).map(sendOne));
    }

    // Motivo del primer fallo (para diagnosticar desde la UI, ej. imagen faltante).
    const firstError = results.details.find((d: any) => d.status === 'failed')?.reason || null;
    console.log(`[CRM] Envío masivo WhatsApp "${template}": ${results.sent} enviados, ${results.skipped} omitidos, ${results.failed} fallidos (de ${recipientCount} seleccionados)${firstError ? ' | 1er error: ' + firstError : ''}`);
    res.json({ success: true, template, firstError, ...results });
  } catch (error: any) {
    console.error('Error en bulkWhatsapp:', error);
    res.status(500).json({ success: false, error: error.message || 'Error al enviar' });
  }
};

// ============================================================================
// 👥 GRUPOS DE LEADS (para segmentar y automatizar mensajes por grupo)
// ============================================================================
// Un lead se identifica por lead_key ('crm_<id>' | 'lc_<id>'), la misma llave que
// devuelve getCrmLeads. La membresía vive en lead_group_members con ON DELETE
// CASCADE sobre el grupo: al borrar un grupo, los leads NO se borran, solo pierden
// la membresía.
let groupsSchemaReady = false;
async function ensureGroupsSchema(): Promise<void> {
  if (groupsSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#1976d2',
      description TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES lead_groups(id) ON DELETE CASCADE,
      lead_key TEXT NOT NULL,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (group_id, lead_key)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lgm_lead_key ON lead_group_members(lead_key);`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_blacklist (
      id SERIAL PRIMARY KEY,
      lead_key TEXT NOT NULL UNIQUE,
      reason TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  groupsSchemaReady = true;
}

// GET /api/admin/crm/groups → grupos + conteo de miembros
export const getLeadGroups = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureGroupsSchema();
    const r = await pool.query(`
      SELECT g.id, g.name, g.color, g.description, g.created_at,
             COUNT(m.id)::int AS member_count
        FROM lead_groups g
        LEFT JOIN lead_group_members m ON m.group_id = g.id
       GROUP BY g.id
       ORDER BY g.name ASC
    `);
    res.json({ success: true, groups: r.rows });
  } catch (error: any) {
    console.error('Error en getLeadGroups:', error);
    res.status(500).json({ success: false, error: 'Error al obtener grupos' });
  }
};

// POST /api/admin/crm/groups { name, color? }
export const createLeadGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureGroupsSchema();
    const name = String(req.body?.name || '').trim();
    const color = String(req.body?.color || '#1976d2').trim() || '#1976d2';
    if (!name) return res.status(400).json({ success: false, error: 'El nombre del grupo es obligatorio' });
    const createdBy = (req as any).user?.userId || (req as any).user?.id || null;
    const r = await pool.query(
      `INSERT INTO lead_groups (name, color, created_by) VALUES ($1, $2, $3) RETURNING id, name, color, description, created_at`,
      [name, color, createdBy]
    );
    res.json({ success: true, group: { ...r.rows[0], member_count: 0 } });
  } catch (error: any) {
    console.error('Error en createLeadGroup:', error);
    res.status(500).json({ success: false, error: 'Error al crear grupo' });
  }
};

// DELETE /api/admin/crm/groups/:id → borra el grupo (membresías en cascada; leads intactos)
export const deleteLeadGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureGroupsSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    await pool.query(`DELETE FROM lead_groups WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error en deleteLeadGroup:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar grupo' });
  }
};

// POST /api/admin/crm/groups/:id/members { leadKeys: string[] }
export const addLeadsToGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureGroupsSchema();
    const groupId = parseInt(String(req.params.id), 10);
    const leadKeys: string[] = Array.isArray(req.body?.leadKeys) ? req.body.leadKeys.filter((k: any) => typeof k === 'string') : [];
    if (!groupId) return res.status(400).json({ success: false, error: 'grupo inválido' });
    if (leadKeys.length === 0) return res.status(400).json({ success: false, error: 'Selecciona al menos un lead' });
    const grp = await pool.query(`SELECT id FROM lead_groups WHERE id = $1`, [groupId]);
    if (grp.rows.length === 0) return res.status(404).json({ success: false, error: 'Grupo no encontrado' });
    // Insertar en bloque, ignorando duplicados
    await pool.query(
      `INSERT INTO lead_group_members (group_id, lead_key)
       SELECT $1, UNNEST($2::text[])
       ON CONFLICT (group_id, lead_key) DO NOTHING`,
      [groupId, leadKeys]
    );
    res.json({ success: true, added: leadKeys.length });
  } catch (error: any) {
    console.error('Error en addLeadsToGroup:', error);
    res.status(500).json({ success: false, error: 'Error al asignar al grupo' });
  }
};

// DELETE /api/admin/crm/groups/:id/members { leadKeys: string[] }
export const removeLeadsFromGroup = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureGroupsSchema();
    const groupId = parseInt(String(req.params.id), 10);
    const leadKeys: string[] = Array.isArray(req.body?.leadKeys) ? req.body.leadKeys.filter((k: any) => typeof k === 'string') : [];
    if (!groupId) return res.status(400).json({ success: false, error: 'grupo inválido' });
    if (leadKeys.length === 0) return res.status(400).json({ success: false, error: 'Selecciona al menos un lead' });
    await pool.query(
      `DELETE FROM lead_group_members WHERE group_id = $1 AND lead_key = ANY($2::text[])`,
      [groupId, leadKeys]
    );
    res.json({ success: true, removed: leadKeys.length });
  } catch (error: any) {
    console.error('Error en removeLeadsFromGroup:', error);
    res.status(500).json({ success: false, error: 'Error al quitar del grupo' });
  }
};

// ============================================================================
// 🚫 BLACK LIST (no reciben mensajes masivos y desaparecen del funnel)
// ============================================================================

// GET /api/admin/crm/blacklist → leads en blacklist con su info resuelta
export const getBlacklist = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureGroupsSchema();
    const r = await pool.query(`
      SELECT b.lead_key, b.reason, b.created_at,
             'crm'::text AS source, u.full_name, u.email, u.box_id, u.phone
        FROM lead_blacklist b
        JOIN crm_requests r ON ('crm_' || r.id::text) = b.lead_key
        JOIN users u ON u.id = r.user_id
      UNION ALL
      SELECT b.lead_key, b.reason, b.created_at,
             'chartback'::text AS source,
             COALESCE(NULLIF(TRIM(lc.full_name), ''), mu.full_name) AS full_name,
             COALESCE(NULLIF(TRIM(lc.email), ''), mu.email) AS email,
             lc.box_id,
             COALESCE(NULLIF(TRIM(mu.phone), ''), lc.phone) AS phone
        FROM lead_blacklist b
        JOIN legacy_clients lc ON ('lc_' || lc.id::text) = b.lead_key
        LEFT JOIN LATERAL (
          SELECT u2.full_name, u2.email, u2.phone FROM users u2
           WHERE lc.box_id IS NOT NULL AND UPPER(TRIM(u2.box_id)) = UPPER(TRIM(lc.box_id))
           ORDER BY u2.id ASC LIMIT 1
        ) mu ON true
      UNION ALL
      SELECT b.lead_key, b.reason, b.created_at,
             'prospect'::text AS source,
             p.full_name, p.email, NULL::text AS box_id, p.whatsapp AS phone
        FROM lead_blacklist b
        JOIN prospects p ON ('pr_' || p.id::text) = b.lead_key
      ORDER BY created_at DESC
    `);
    res.json({ success: true, blacklist: r.rows, count: r.rows.length });
  } catch (error: any) {
    console.error('Error en getBlacklist:', error);
    res.status(500).json({ success: false, error: 'Error al obtener blacklist' });
  }
};

// POST /api/admin/crm/blacklist { leadKeys: string[], reason? }
export const addToBlacklist = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureGroupsSchema();
    const leadKeys: string[] = Array.isArray(req.body?.leadKeys) ? req.body.leadKeys.filter((k: any) => typeof k === 'string') : [];
    const reason = req.body?.reason ? String(req.body.reason) : null;
    if (leadKeys.length === 0) return res.status(400).json({ success: false, error: 'Selecciona al menos un lead' });
    const createdBy = (req as any).user?.userId || (req as any).user?.id || null;
    await pool.query(
      `INSERT INTO lead_blacklist (lead_key, reason, created_by)
       SELECT UNNEST($1::text[]), $2, $3
       ON CONFLICT (lead_key) DO NOTHING`,
      [leadKeys, reason, createdBy]
    );
    res.json({ success: true, added: leadKeys.length });
  } catch (error: any) {
    console.error('Error en addToBlacklist:', error);
    res.status(500).json({ success: false, error: 'Error al agregar a blacklist' });
  }
};

// DELETE /api/admin/crm/blacklist { leadKeys: string[] }
export const removeFromBlacklist = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureGroupsSchema();
    const leadKeys: string[] = Array.isArray(req.body?.leadKeys) ? req.body.leadKeys.filter((k: any) => typeof k === 'string') : [];
    if (leadKeys.length === 0) return res.status(400).json({ success: false, error: 'Selecciona al menos un lead' });
    await pool.query(`DELETE FROM lead_blacklist WHERE lead_key = ANY($1::text[])`, [leadKeys]);
    res.json({ success: true, removed: leadKeys.length });
  } catch (error: any) {
    console.error('Error en removeFromBlacklist:', error);
    res.status(500).json({ success: false, error: 'Error al quitar de blacklist' });
  }
};

// Helper: extrae el id numérico de un lead_key ('crm_123' | 'lc_45')
const leadKeyId = (leadKey: string): number | null => {
  const m = String(leadKey || '').match(/^(crm|lc)_(\d+)$/);
  return m && m[2] ? parseInt(m[2], 10) : null;
};

// POST /api/admin/crm/leads/phone { leadKey, phone } → agrega/edita el teléfono
export const updateLeadPhone = async (req: Request, res: Response): Promise<any> => {
  try {
    const { leadKey, phone } = req.body || {};
    const p = String(phone || '').trim();
    const id = leadKeyId(String(leadKey || ''));
    if (!id || !p) return res.status(400).json({ success: false, error: 'Falta lead o teléfono' });
    if (String(leadKey).startsWith('crm_')) {
      await pool.query(`UPDATE users SET phone = $1 WHERE id = (SELECT user_id FROM crm_requests WHERE id = $2)`, [p, id]);
    } else {
      // Legacy: guarda en legacy_clients y, si tiene usuario vinculado por Box ID
      // sin teléfono, también en ese usuario (para que priorice el correcto).
      await pool.query(`UPDATE legacy_clients SET phone = $1 WHERE id = $2`, [p, id]);
      await pool.query(
        `UPDATE users u SET phone = $1
           FROM legacy_clients lc
          WHERE lc.id = $2
            AND lc.box_id IS NOT NULL
            AND UPPER(TRIM(u.box_id)) = UPPER(TRIM(lc.box_id))
            AND COALESCE(NULLIF(TRIM(u.phone), ''), '') = ''`,
        [p, id]
      );
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error en updateLeadPhone:', error);
    res.status(500).json({ success: false, error: 'Error al guardar el teléfono' });
  }
};

// POST /api/admin/crm/leads/assign-advisor { leadKey, advisorId }
export const assignLeadAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    const { leadKey, advisorId } = req.body || {};
    const id = leadKeyId(String(leadKey || ''));
    const advId = parseInt(String(advisorId), 10);
    if (!id || !advId) return res.status(400).json({ success: false, error: 'Falta lead o asesor' });
    if (String(leadKey).startsWith('crm_')) {
      await pool.query(`UPDATE users SET referred_by_id = $1 WHERE id = (SELECT user_id FROM crm_requests WHERE id = $2)`, [advId, id]);
      await pool.query(`UPDATE crm_requests SET status = 'assigned', assigned_advisor_id = $1, updated_at = NOW() WHERE id = $2`, [advId, id]);
    } else {
      // Legacy → asesor de recuperación (recovery_advisor_id)
      await pool.query(`UPDATE legacy_clients SET recovery_advisor_id = $1 WHERE id = $2`, [advId, id]);
    }
    const adv = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [advId]);
    res.json({ success: true, advisorName: adv.rows[0]?.full_name || null });
  } catch (error: any) {
    console.error('Error en assignLeadAdvisor:', error);
    res.status(500).json({ success: false, error: 'Error al asignar asesor' });
  }
};

// 📱 APP: CREAR LEAD DESDE CHAT DE SOPORTE (Solicitud de llamada)
export const createLeadFromSupport = async (req: Request, res: Response): Promise<any> => {
  try {
    const { user_id, source, notes } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, error: 'user_id requerido' });
    }

    // Verificar si ya tiene una solicitud pendiente
    const existing = await pool.query(
      'SELECT id FROM crm_requests WHERE user_id = $1 AND status = $2',
      [user_id, 'pending']
    );

    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Ya tienes una solicitud pendiente',
        requestId: existing.rows[0].id
      });
    }

    // Crear nuevo lead
    const result = await pool.query(
      `INSERT INTO crm_requests (user_id, admin_notes) VALUES ($1, $2) RETURNING id`,
      [user_id, `[${source || 'app'}] ${notes || 'Solicitud de contacto'}`]
    );

    res.json({
      success: true,
      message: 'Solicitud creada exitosamente',
      requestId: result.rows[0].id
    });
  } catch (error) {
    console.error('Error en createLeadFromSupport:', error);
    res.status(500).json({ success: false, error: 'Error al crear solicitud' });
  }
};

// ============================================================================
// MÓDULO 1: CONTROL DE CLIENTES (Tablero Principal con Colores)
// ============================================================================

/**
 * Obtener clientes con métricas de actividad y colores
 * GET /api/admin/crm/clients
 */
export const getCRMClients = async (req: Request, res: Response): Promise<any> => {
  try {
    const { filter, advisorId, search, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereConditions = ["u.role = 'client'"];
    const params: any[] = [];
    let paramIndex = 1;

    // Filtros por estado de actividad
    if (filter === 'inactive_90') {
      whereConditions.push(`u.last_transaction_date < NOW() - INTERVAL '90 days'`);
    } else if (filter === 'never_shipped') {
      whereConditions.push(`(SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0`);
    } else if (filter === 'new_no_ship') {
      whereConditions.push(`u.created_at > NOW() - INTERVAL '30 days'`);
      whereConditions.push(`(SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0`);
    } else if (filter === 'in_recovery') {
      whereConditions.push(`u.recovery_status = 'in_recovery'`);
    } else if (filter === 'churned') {
      whereConditions.push(`u.recovery_status = 'churned'`);
    } else if (filter === 'active') {
      whereConditions.push(`u.recovery_status = 'active'`);
      whereConditions.push(`u.last_transaction_date >= NOW() - INTERVAL '90 days'`);
    }

    // Filtro por asesor (acepta cualquiera de los dos campos historicos)
    if (advisorId) {
      whereConditions.push(`(u.advisor_id = $${paramIndex} OR u.referred_by_id = $${paramIndex})`);
      params.push(advisorId);
      paramIndex++;
    }

    // Búsqueda
    if (search) {
      whereConditions.push(`(u.full_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.box_id ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query principal con métricas calculadas
    const query = `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.box_id,
        u.created_at,
        u.is_verified,
        u.is_active,
        COALESCE(u.is_broker, false) as is_broker,
        u.referred_by_id,
        COALESCE(u.advisor_id, u.referred_by_id) as advisor_id,
        u.first_transaction_date,
        COALESCE(u.last_transaction_date, (SELECT MAX(p.created_at) FROM packages p WHERE p.user_id = u.id)) as last_transaction_date,
        u.last_transaction_ref,
        u.last_transaction_amount,
        u.recovery_status,
        u.recovery_deadline,
        advisor.full_name as advisor_name,
        advisor.box_id as advisor_box_id,
        leader.full_name as team_leader_name,
        (SELECT COUNT(*) FROM packages WHERE user_id = u.id) as total_shipments,
        (SELECT COALESCE(SUM(assigned_cost_mxn), 0) FROM packages WHERE user_id = u.id) as total_spent,
        CASE
          WHEN COALESCE(u.last_transaction_date, (SELECT MAX(p.created_at) FROM packages p WHERE p.user_id = u.id)) < NOW() - INTERVAL '90 days' THEN 'red'
          WHEN (SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0 THEN 'yellow'
          WHEN u.created_at > NOW() - INTERVAL '30 days' AND (SELECT COUNT(*) FROM packages WHERE user_id = u.id) = 0 THEN 'orange'
          ELSE 'white'
        END as row_color,
        EXTRACT(DAY FROM NOW() - COALESCE(u.last_transaction_date, (SELECT MAX(p.created_at) FROM packages p WHERE p.user_id = u.id))) as days_inactive
      FROM users u
      LEFT JOIN users advisor ON COALESCE(u.advisor_id, u.referred_by_id) = advisor.id
      LEFT JOIN users leader ON advisor.team_leader_id = leader.id
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN u.recovery_status = 'in_recovery' THEN 1
          WHEN u.last_transaction_date < NOW() - INTERVAL '90 days' THEN 2
          ELSE 3
        END,
        u.last_transaction_date DESC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // Conteo total para paginación
    const countQuery = `SELECT COUNT(*) FROM users u ${whereClause}`;
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    // Estadísticas rápidas
    const statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE recovery_status = 'in_recovery') as in_recovery,
        COUNT(*) FILTER (WHERE recovery_status = 'churned') as churned,
        COUNT(*) FILTER (WHERE last_transaction_date < NOW() - INTERVAL '90 days') as inactive_90,
        COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM packages WHERE user_id = users.id) = 0) as never_shipped
      FROM users WHERE role = 'client'
    `;
    const statsResult = await pool.query(statsQuery);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      },
      stats: statsResult.rows[0]
    });
  } catch (error: any) {
    console.error('Error getCRMClients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Exportar clientes a Excel (JSON para frontend)
 * GET /api/admin/crm/clients/export
 */
export const exportCRMClients = async (req: Request, res: Response): Promise<any> => {
  try {
    const { filter, advisorId } = req.query;

    let whereConditions = ["u.role = 'client'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter === 'inactive_90') {
      whereConditions.push(`u.last_transaction_date < NOW() - INTERVAL '90 days'`);
    } else if (filter === 'in_recovery') {
      whereConditions.push(`u.recovery_status = 'in_recovery'`);
    }

    if (advisorId) {
      whereConditions.push(`(u.advisor_id = $${paramIndex} OR u.referred_by_id = $${paramIndex})`);
      params.push(advisorId);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        u.full_name as "Nombre",
        u.box_id as "No. Cliente",
        u.email as "Email",
        u.phone as "Teléfono",
        TO_CHAR(u.created_at, 'DD/MM/YYYY') as "Fecha Alta",
        TO_CHAR(u.first_transaction_date, 'DD/MM/YYYY') as "Primera Transacción",
        TO_CHAR(u.last_transaction_date, 'DD/MM/YYYY') as "Última Transacción",
        u.last_transaction_ref as "Ref Última Transacción",
        u.last_transaction_amount as "Monto Última Transacción",
        (SELECT COUNT(*) FROM packages WHERE user_id = u.id) as "Total Envíos",
        (SELECT COALESCE(SUM(assigned_cost_mxn), 0) FROM packages WHERE user_id = u.id) as "Total Gastado MXN",
        advisor.full_name as "Asesor",
        u.recovery_status as "Estado Recuperación",
        EXTRACT(DAY FROM NOW() - u.last_transaction_date)::INTEGER as "Días Inactivo"
      FROM users u
      LEFT JOIN users advisor ON COALESCE(u.advisor_id, u.referred_by_id) = advisor.id
      ${whereClause}
      ORDER BY u.last_transaction_date DESC NULLS LAST
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      filename: `clientes_crm_${new Date().toISOString().split('T')[0]}.xlsx`
    });
  } catch (error: any) {
    console.error('Error exportCRMClients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// MÓDULO 2: RECUPERACIÓN Y SOSTENIMIENTO
// ============================================================================

/**
 * Obtener promociones de recuperación activas
 * GET /api/admin/crm/promotions
 */
export const getRecoveryPromotions = async (_req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT * FROM recovery_promotions 
      ORDER BY is_active DESC, created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Crear/Editar promoción de recuperación
 * POST /api/admin/crm/promotions
 */
export const saveRecoveryPromotion = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id, title, description, discount_percent, is_active, valid_until } = req.body;

    if (id) {
      await pool.query(`
        UPDATE recovery_promotions 
        SET title = $1, description = $2, discount_percent = $3, is_active = $4, valid_until = $5
        WHERE id = $6
      `, [title, description, discount_percent, is_active, valid_until, id]);
    } else {
      await pool.query(`
        INSERT INTO recovery_promotions (title, description, discount_percent, is_active, valid_until)
        VALUES ($1, $2, $3, $4, $5)
      `, [title, description, discount_percent, is_active, valid_until]);
    }

    res.json({ success: true, message: 'Promoción guardada' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Ejecutar acción de recuperación en un cliente
 * POST /api/admin/crm/recovery/action
 */
export const executeRecoveryAction = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, action, notes, newAdvisorId, promotionId } = req.body;
    const adminId = (req as any).user?.id;

    // Validar que el cliente existe
    const clientResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (clientResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    switch (action) {
      case 'recovered':
        // Verificar si hubo venta real en los últimos 30 días
        const recentSale = await pool.query(`
          SELECT id FROM packages 
          WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 1
        `, [userId]);

        if (recentSale.rows.length === 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'No se detecta venta reciente. El cliente debe tener al menos un envío en los últimos 30 días.' 
          });
        }

        await pool.query(`
          UPDATE users 
          SET recovery_status = 'active', recovery_deadline = NULL
          WHERE id = $1
        `, [userId]);
        break;

      case 'recovered_reassigned':
        // Reasignar a nuevo asesor y resetear
        await pool.query(`
          UPDATE users 
          SET recovery_status = 'active', 
              recovery_deadline = NULL,
              referred_by_id = $2
          WHERE id = $1
        `, [userId, newAdvisorId]);
        break;

      case 'prorroga':
        // Prórroga de 6 meses - Relación sana, no molestar
        await pool.query(`
          UPDATE users 
          SET recovery_status = 'active', 
              recovery_deadline = NOW() + INTERVAL '6 months'
          WHERE id = $1
        `, [userId]);
        break;

      case 'baja_definitiva':
        // Marcar como inactivo permanente
        await pool.query(`
          UPDATE users 
          SET recovery_status = 'churned', 
              is_active = FALSE
          WHERE id = $1
        `, [userId]);
        break;

      default:
        return res.status(400).json({ success: false, error: 'Acción no válida' });
    }

    // Registrar en historial
    await pool.query(`
      INSERT INTO recovery_history (user_id, advisor_id, action, notes, promotion_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, adminId, action, notes, promotionId || null]);

    res.json({ success: true, message: 'Acción ejecutada correctamente' });
  } catch (error: any) {
    console.error('Error executeRecoveryAction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Obtener historial de recuperación de un cliente
 * GET /api/admin/crm/recovery/history/:userId
 */
export const getRecoveryHistory = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT 
        rh.*,
        advisor.full_name as advisor_name,
        promo.title as promotion_title
      FROM recovery_history rh
      LEFT JOIN users advisor ON rh.advisor_id = advisor.id
      LEFT JOIN recovery_promotions promo ON rh.promotion_id = promo.id
      WHERE rh.user_id = $1
      ORDER BY rh.created_at DESC
    `, [userId]);

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Cron Job: Detectar clientes en riesgo (llamar diariamente)
 * POST /api/admin/crm/recovery/detect
 */
export const detectAtRiskClients = async (_req: Request, res: Response): Promise<any> => {
  try {
    // 1. Detectar 90 días (Alerta - entran a recuperación)
    const alertResult = await pool.query(`
      UPDATE users 
      SET recovery_status = 'in_recovery',
          recovery_deadline = NOW() + INTERVAL '15 days'
      WHERE role = 'client'
        AND recovery_status = 'active'
        AND last_transaction_date < NOW() - INTERVAL '90 days'
        AND last_transaction_date >= NOW() - INTERVAL '91 days'
      RETURNING id, full_name, referred_by_id
    `);

    // 2. Detectar 105 días (Castigo - quitar asesor)
    const punishResult = await pool.query(`
      UPDATE users 
      SET recovery_status = 'churned',
          referred_by_id = NULL
      WHERE role = 'client'
        AND recovery_status = 'in_recovery'
        AND recovery_deadline < NOW()
      RETURNING id, full_name
    `);

    res.json({
      success: true,
      message: 'Detección completada',
      data: {
        enteredRecovery: alertResult.rows.length,
        churned: punishResult.rows.length,
        alertedClients: alertResult.rows,
        churnedClients: punishResult.rows
      }
    });
  } catch (error: any) {
    console.error('Error detectAtRiskClients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// MÓDULO 3: PROSPECTOS (CRM Leads Mejorado)
// ============================================================================

/**
 * Reconciliar prospectos que ya se registraron como usuarios.
 * Si un prospecto (no convertido) coincide por teléfono (últimos 10 dígitos) o
 * correo con un usuario real, se marca 'converted' y se enlaza converted_user_id.
 * Así desaparece del pipeline activo (Nuevos/Contactando/Interesados) al registrarse.
 * Se ejecuta al cargar la lista (idempotente). Se hace en 2 UPDATEs (hash join eficiente).
 */
const reconcileRegisteredProspects = async (): Promise<void> => {
  try {
    // Por teléfono (normalizado a últimos 10 dígitos, ambos lados con ≥10 dígitos).
    await pool.query(`
      UPDATE prospects p
         SET status = 'converted', converted_user_id = u.id, updated_at = NOW()
        FROM users u
       WHERE p.status <> 'converted'
         AND length(regexp_replace(COALESCE(p.whatsapp, ''), '\\D', '', 'g')) >= 10
         AND length(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g')) >= 10
         AND right(regexp_replace(p.whatsapp, '\\D', '', 'g'), 10) = right(regexp_replace(u.phone, '\\D', '', 'g'), 10)
    `);
    // Por correo (minúsculas, sin espacios).
    await pool.query(`
      UPDATE prospects p
         SET status = 'converted', converted_user_id = u.id, updated_at = NOW()
        FROM users u
       WHERE p.status <> 'converted'
         AND NULLIF(lower(trim(p.email)), '') IS NOT NULL
         AND lower(trim(p.email)) = lower(trim(u.email))
    `);
    // Al convertirse (registrarse), sale del funnel: se detiene su secuencia activa.
    await pool.query(`
      UPDATE wa_sequence_enrollments e
         SET status = 'stopped', stopped_reason = 'converted', updated_at = NOW()
        FROM prospects p
       WHERE e.status = 'active'
         AND e.lead_key = ('pr_' || p.id::text)
         AND p.converted_user_id IS NOT NULL
    `).catch(() => {});
  } catch (e) {
    console.warn('[CRM] reconcileRegisteredProspects:', (e as Error).message);
  }
};

/**
 * Obtener todos los prospectos
 * GET /api/admin/crm/prospects
 */
export const getProspects = async (req: Request, res: Response): Promise<any> => {
  try {
    // Marcar como convertidos los prospectos que ya se registraron como usuarios.
    await reconcileRegisteredProspects();
    await ensureClickLinksSchema();
    await ensureSequenceSchema();
    await ensureWelcomeKitSchema();
    const { status, advisorId, channel, search, seq, clicked, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Los prospectos que se registran se marcan 'converted' (reconcile) pero NO
    // desaparecen de aquí: siguen visibles para seguir manipulando su info,
    // y además aparecen en CRM Leads → "Prospectados".
    let whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      if (status === 'legacy') {
        // Filtro especial: solo clientes de reactivación "sin reclamar" (legacy).
        whereConditions.push(`b.source = 'legacy'`);
      } else {
        whereConditions.push(`b.status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }
    }

    if (advisorId) {
      whereConditions.push(`b.assigned_advisor_id = $${paramIndex}`);
      params.push(advisorId);
      paramIndex++;
    }

    if (channel) {
      whereConditions.push(`b.acquisition_channel = $${paramIndex}`);
      params.push(channel);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(b.full_name ILIKE $${paramIndex} OR b.email ILIKE $${paramIndex} OR b.whatsapp ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filtro por inscripción en la secuencia automática (EXISTS para que sirva
    // también en el countQuery, que no une el enrollment).
    if (seq === 'enrolled') {
      whereConditions.push(`EXISTS (SELECT 1 FROM wa_sequence_enrollments en WHERE en.lead_key = b.lead_key)`);
    } else if (seq === 'not_enrolled') {
      whereConditions.push(`NOT EXISTS (SELECT 1 FROM wa_sequence_enrollments en WHERE en.lead_key = b.lead_key)`);
    } else if (typeof seq === 'string' && /^step_[123]$/.test(seq)) {
      // Filtro por paso de la secuencia (current_step 0/1/2 = Paso 1/2/3).
      const stepIdx = parseInt(seq.slice(5), 10) - 1;
      whereConditions.push(`EXISTS (SELECT 1 FROM wa_sequence_enrollments en WHERE en.lead_key = b.lead_key AND en.current_step = $${paramIndex})`);
      params.push(stepIdx);
      paramIndex++;
    }

    // Filtro por clic en el botón de WhatsApp (EXISTS sobre wa_click_links con
    // al menos un clic registrado). Sirve también para el countQuery.
    if (clicked === 'yes') {
      whereConditions.push(`EXISTS (SELECT 1 FROM wa_click_links wl WHERE wl.lead_key = b.lead_key AND wl.click_count > 0)`);
    } else if (clicked === 'no') {
      whereConditions.push(`NOT EXISTS (SELECT 1 FROM wa_click_links wl WHERE wl.lead_key = b.lead_key AND wl.click_count > 0)`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // CTE base: prospectos externos + clientes legacy "sin reclamar" (reactivación
    // sin asesor de recuperación y sin usuario registrado por Box ID). En cuanto el
    // cliente reclama su número (se registra un usuario con ese Box ID) deja de
    // cumplir la condición → sale de aquí solo y pasa a Convertidos en CRM Leads.
    const baseCTE = `
      base AS (
        SELECT
          p.id, 'prospect'::text AS source, ('pr_' || p.id::text) AS lead_key,
          p.full_name, p.whatsapp, p.email, p.acquisition_channel,
          p.assigned_advisor_id, p.status, p.notes, p.follow_up_date,
          p.created_by_id, p.converted_user_id, p.created_at,
          p.facebook_psid, p.last_interaction_fb, p.is_ai_active,
          NULL::text AS legacy_asesor, NULL::text AS box_id
        FROM prospects p
        WHERE NOT EXISTS (SELECT 1 FROM lead_blacklist bl WHERE bl.lead_key = ('pr_' || p.id::text))
        UNION ALL
        SELECT
          lc.id, 'legacy'::text AS source, ('lc_' || lc.id::text) AS lead_key,
          COALESCE(NULLIF(TRIM(lc.full_name), ''), '(sin nombre)') AS full_name,
          lc.phone AS whatsapp, lc.email, 'reactivacion'::text AS acquisition_channel,
          NULL::int AS assigned_advisor_id,
          -- Si el cliente de reactivación hizo clic en la secuencia (cualquier
          -- paso) → 'interested'; si no, sigue como 'new' (Reactivación sin reclamar).
          CASE WHEN EXISTS (
            SELECT 1 FROM wa_click_links wl
             WHERE wl.lead_key = ('lc_' || lc.id::text) AND wl.click_count > 0
          ) THEN 'interested'::text ELSE 'new'::text END AS status,
          lc.chartback_notes AS notes, NULL::timestamptz AS follow_up_date,
          NULL::int AS created_by_id, NULL::int AS converted_user_id,
          COALESCE(lc.chartback_i_since, lc.created_at) AS created_at,
          NULL::text AS facebook_psid, NULL::timestamptz AS last_interaction_fb,
          FALSE AS is_ai_active,
          NULLIF(TRIM(lc.asesor), '') AS legacy_asesor, lc.box_id
        FROM legacy_clients lc
        LEFT JOIN LATERAL (
          SELECT u2.id FROM users u2
           WHERE lc.box_id IS NOT NULL AND UPPER(TRIM(u2.box_id)) = UPPER(TRIM(lc.box_id))
           ORDER BY u2.id ASC LIMIT 1
        ) mu ON true
        WHERE LOWER(TRIM(COALESCE(lc.chartback_status, ''))) <> 'not_interested'
          AND LOWER(TRIM(COALESCE(lc.chartback_status, ''))) <> 'recovered'
          AND LOWER(TRIM(COALESCE(lc.chartback_status, ''))) NOT IN ('no_answer','callback','retention')
          AND lc.recovery_advisor_id IS NULL
          AND mu.id IS NULL
          AND NOT EXISTS (SELECT 1 FROM crm_requests cr WHERE cr.user_id IS NOT NULL AND cr.user_id = lc.claimed_by_user_id)
          AND NOT EXISTS (SELECT 1 FROM lead_blacklist bl WHERE bl.lead_key = ('lc_' || lc.id::text))
      )
    `;

    const query = `
      WITH ${baseCTE}
      SELECT
        b.*,
        COALESCE(advisor.full_name, b.legacy_asesor) as advisor_name,
        creator.full_name as created_by_name,
        cl.clicks AS link_clicks,
        cl.last_click_at AS last_click_at,
        se.status AS seq_status,
        se.current_step AS seq_step,
        se.next_send_at AS seq_next_send_at,
        se.stopped_reason AS seq_reason,
        se.last_sent_at AS seq_last_sent,
        EXISTS(SELECT 1 FROM welcome_kit_requests wk WHERE wk.lead_key = b.lead_key AND wk.status <> 'cancelado') AS has_kit,
        CASE WHEN b.follow_up_date::date = CURRENT_DATE THEN true ELSE false END as follow_up_today,
        CASE WHEN b.follow_up_date < NOW() THEN true ELSE false END as follow_up_overdue
      FROM base b
      LEFT JOIN users advisor ON b.assigned_advisor_id = advisor.id
      LEFT JOIN users creator ON b.created_by_id = creator.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(click_count), 0)::int AS clicks, MAX(last_click_at) AS last_click_at
          FROM wa_click_links wl
         WHERE wl.lead_key = b.lead_key AND wl.click_count > 0
      ) cl ON true
      LEFT JOIN LATERAL (
        SELECT status, current_step, next_send_at, stopped_reason, last_sent_at
          FROM wa_sequence_enrollments en
         WHERE en.lead_key = b.lead_key
         ORDER BY en.updated_at DESC LIMIT 1
      ) se ON true
      ${whereClause}
      ORDER BY
        CASE WHEN b.follow_up_date::date = CURRENT_DATE THEN 0 ELSE 1 END,
        b.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // Conteo
    const countQuery = `WITH ${baseCTE} SELECT COUNT(*) FROM base b ${whereClause}`;
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    // Stats por estado (sobre prospectos + legacy sin-reclamar)
    const statsQuery = `
      WITH ${baseCTE}
      SELECT
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'contacting') as contacting_count,
        COUNT(*) FILTER (WHERE status = 'interested') as interested_count,
        COUNT(*) FILTER (WHERE status = 'converted') as converted_count,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_count,
        COUNT(*) FILTER (WHERE follow_up_date::date = CURRENT_DATE) as follow_up_today
      FROM base
    `;
    const statsResult = await pool.query(statsQuery);

    res.json({
      success: true,
      data: result.rows,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
      stats: statsResult.rows[0]
    });
  } catch (error: any) {
    console.error('Error getProspects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Crear nuevo prospecto
 * POST /api/admin/crm/prospects
 */
export const createProspect = async (req: Request, res: Response): Promise<any> => {
  try {
    const { full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, notes, follow_up_date } = req.body;
    const createdById = (req as any).user?.id;

    const result = await pool.query(`
      INSERT INTO prospects (full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, notes, follow_up_date, created_by_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, notes, follow_up_date, createdById]);

    res.json({ success: true, data: result.rows[0], message: 'Prospecto creado' });
  } catch (error: any) {
    console.error('Error createProspect:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Actualizar prospecto
 * PUT /api/admin/crm/prospects/:id
 */
export const updateProspect = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, status, notes, follow_up_date } = req.body;

    await pool.query(`
      UPDATE prospects 
      SET full_name = $1, whatsapp = $2, email = $3, acquisition_channel = $4, 
          assigned_advisor_id = $5, status = $6, notes = $7, follow_up_date = $8,
          updated_at = NOW()
      WHERE id = $9
    `, [full_name, whatsapp, email, acquisition_channel, assigned_advisor_id, status, notes, follow_up_date, id]);

    res.json({ success: true, message: 'Prospecto actualizado' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Convertir prospecto a cliente
 * POST /api/admin/crm/prospects/:id/convert
 */
export const convertProspectToClient = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    // Obtener prospecto
    const prospectResult = await pool.query('SELECT * FROM prospects WHERE id = $1', [id]);
    if (prospectResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Prospecto no encontrado' });
    }

    const prospect = prospectResult.rows[0];

    // Verificar si el email ya existe
    if (prospect.email) {
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [prospect.email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Ya existe un cliente con este email' });
      }
    }

    const boxId = await generateBoxId();

    // Crear usuario
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password || 'EntregaX2026!', 10);

    const newUser = await pool.query(`
      INSERT INTO users (full_name, email, phone, password, role, box_id, referred_by_id, is_verified)
      VALUES ($1, $2, $3, $4, 'client', $5, $6, false)
      RETURNING id, full_name, email, box_id
    `, [prospect.full_name, prospect.email, prospect.whatsapp, hashedPassword, boxId, prospect.assigned_advisor_id]);

    // Actualizar prospecto como convertido
    await pool.query(`
      UPDATE prospects 
      SET status = 'converted', converted_user_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [newUser.rows[0].id, id]);

    res.json({ 
      success: true, 
      message: 'Prospecto convertido a cliente exitosamente',
      data: newUser.rows[0]
    });
  } catch (error: any) {
    console.error('Error convertProspectToClient:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Eliminar prospecto
 * DELETE /api/admin/crm/prospects/:id
 */
export const deleteProspect = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM prospects WHERE id = $1', [id]);
    res.json({ success: true, message: 'Prospecto eliminado' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Carga masiva de prospectos desde Excel
 * POST /api/admin/crm/prospects/bulk
 * Body: { rows: [{ full_name, whatsapp, email, acquisition_channel }] }
 * Reglas: fecha de seguimiento = hoy, sin asesor, sin notas, status 'new'.
 */
const normalizeProspectChannel = (raw: any): string => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'OTHER';
  if (['facebook', 'fb', 'face'].includes(s)) return 'FACEBOOK';
  if (['instagram', 'ig', 'insta'].includes(s)) return 'IG';
  if (['whatsapp', 'wa', 'wsp', 'whats', 'wpp'].includes(s)) return 'WA';
  if (['web', 'pagina web', 'página web', 'sitio web', 'website', 'page', 'landing'].includes(s)) return 'WEB';
  if (['referido', 'referral', 'ref', 'recomendacion', 'recomendación', 'recomendado'].includes(s)) return 'REF';
  if (['ups'].includes(s)) return 'UPS';
  if (['dhl'].includes(s)) return 'DHL';
  if (['fedex', 'fed ex', 'federal express'].includes(s)) return 'FEDEX';
  if (['otro', 'other', 'otros'].includes(s)) return 'OTHER';
  const up = s.toUpperCase();
  return ['FACEBOOK', 'FB', 'IG', 'WA', 'WEB', 'REF', 'UPS', 'DHL', 'FEDEX', 'OTHER'].includes(up) ? up : 'OTHER';
};

export const bulkCreateProspects = async (req: Request, res: Response): Promise<any> => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibieron filas para importar' });
    }
    if (rows.length > 20000) {
      return res.status(400).json({ success: false, error: 'Máximo 20,000 filas por carga' });
    }
    const createdById = (req as any).user?.id || null;

    // Normalizadores para comparar duplicados.
    const normPhone = (p: any): string => { const d = String(p ?? '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
    const normEmail = (e: any): string => String(e ?? '').trim().toLowerCase();

    // Lista de omitidos (con motivo) para mostrarla al usuario en un modal.
    const skippedList: Array<{ full_name: string; whatsapp: string | null; email: string | null; motivo: string }> = [];
    const SKIPPED_LIST_CAP = 2000;
    const pushSkipped = (item: { full_name: string; whatsapp: string | null; email: string | null; motivo: string }) => {
      if (skippedList.length < SKIPPED_LIST_CAP) skippedList.push(item);
    };

    // Limpiar/normalizar. Se omiten filas sin nombre.
    const clean: Array<{ full_name: string; whatsapp: string | null; email: string | null; channel: string }> = [];
    let skippedNoName = 0;
    for (const r of rows) {
      const full_name = String(r?.full_name ?? r?.nombre ?? '').trim();
      if (!full_name) {
        skippedNoName++;
        pushSkipped({
          full_name: '(sin nombre)',
          whatsapp: String(r?.whatsapp ?? r?.telefono ?? r?.phone ?? '').trim() || null,
          email: String(r?.email ?? r?.correo ?? '').trim() || null,
          motivo: 'Sin nombre',
        });
        continue;
      }
      const whatsappRaw = String(r?.whatsapp ?? r?.telefono ?? r?.phone ?? '').trim();
      // Solo cuenta como teléfono si tiene al menos 10 dígitos; placeholders como
      // "sin telefono" / "n/a" quedan en null (no cuentan para dedup).
      const whatsapp = whatsappRaw.replace(/\D/g, '').length >= 10 ? whatsappRaw : null;
      const emailRaw = String(r?.email ?? r?.correo ?? '').trim();
      // Solo cuenta como correo si parece uno (tiene "@"). Así "sin correo",
      // "N/A", "-" y similares NO se tratan como correo real y dejan de colapsar
      // toda la carga por "duplicado de correo".
      const email = emailRaw.includes('@') ? emailRaw : null;
      const channel = normalizeProspectChannel(r?.acquisition_channel ?? r?.canal);
      clean.push({ full_name, whatsapp, email, channel });
    }

    if (clean.length === 0) {
      return res.status(400).json({ success: false, error: 'Ninguna fila tiene "Nombre completo"' });
    }

    // Cargar teléfonos existentes (users + legacy_clients + prospects previos).
    // El funnel es 100% por teléfono → el dedup es SOLO por teléfono. El correo
    // NUNCA descarta una fila (un prospecto sin correo es válido y se agrega igual).
    const existingPhones = new Set<string>();
    const existingRes = await pool.query(`
      SELECT phone FROM users
      UNION ALL
      SELECT phone FROM legacy_clients
      UNION ALL
      SELECT whatsapp AS phone FROM prospects
    `);
    for (const row of existingRes.rows) {
      const np = normPhone(row.phone);
      if (np) existingPhones.add(np);
    }

    // Filtrar: se omite la fila SOLO si su teléfono ya existe (en BD o dentro del
    // mismo Excel). Las filas sin teléfono se agregan igual (no deduplican).
    const toInsert: typeof clean = [];
    let skippedDuplicate = 0;
    const seenPhones = new Set<string>();
    for (const c of clean) {
      const np = normPhone(c.whatsapp);
      if (np && existingPhones.has(np)) {
        skippedDuplicate++;
        pushSkipped({ full_name: c.full_name, whatsapp: c.whatsapp, email: c.email, motivo: 'Teléfono ya existe en el sistema' });
        continue;
      }
      if (np && seenPhones.has(np)) {
        skippedDuplicate++;
        pushSkipped({ full_name: c.full_name, whatsapp: c.whatsapp, email: c.email, motivo: 'Teléfono repetido en el archivo' });
        continue;
      }
      if (np) seenPhones.add(np);
      toInsert.push(c);
    }

    // Insert por lotes de 500 (fecha = hoy, sin asesor, sin notas, status 'new').
    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const slice = toInsert.slice(i, i + CHUNK);
      const valuesSql: string[] = [];
      const params: any[] = [];
      let p = 1;
      for (const c of slice) {
        valuesSql.push(`($${p++}, $${p++}, $${p++}, $${p++}, 'new', $${p++}, CURRENT_DATE)`);
        params.push(c.full_name, c.whatsapp, c.email, c.channel, createdById);
      }
      await pool.query(
        `INSERT INTO prospects (full_name, whatsapp, email, acquisition_channel, status, created_by_id, follow_up_date)
         VALUES ${valuesSql.join(', ')}`,
        params
      );
      inserted += slice.length;
    }

    const skipped = skippedNoName + skippedDuplicate;
    console.log(`[CRM] Carga masiva de prospectos: ${inserted} importados, ${skippedDuplicate} duplicados, ${skippedNoName} sin nombre (de ${rows.length} filas)`);
    res.json({
      success: true, inserted, skipped, skippedDuplicate, skippedNoName, total: rows.length,
      message: `${inserted} prospectos importados`,
      skipped_list: skippedList,
      skipped_list_truncated: skipped > skippedList.length,
    });
  } catch (error: any) {
    console.error('Error bulkCreateProspects:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// MÓDULO 4: REPORTES HISTÓRICOS
// ============================================================================

/**
 * Reporte de ventas por jerarquía
 * GET /api/admin/crm/reports/sales
 */
export const getSalesReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const { startDate, endDate, teamLeaderId, advisorId, serviceType, status } = req.query;

    // Filtros a nivel PAQUETE (fecha siempre; servicio/estatus opcionales).
    const params: any[] = [startDate || '2020-01-01', endDate || new Date().toISOString()];
    let i = 3;
    // Solo guías master/individuales (master_id IS NULL): las hijas de una
    // consolidación duplican el ingreso (el master ya suma el total).
    const pkgConds = ['p.created_at BETWEEN $1 AND $2', 'p.master_id IS NULL'];
    if (serviceType) { pkgConds.push(`p.service_type = $${i++}`); params.push(serviceType); }
    if (status) { pkgConds.push(`p.status = $${i++}`); params.push(status); }
    const pkgWhere = `WHERE ${pkgConds.join(' AND ')}`;

    // Filtros a nivel ASESOR (team leader / asesor específico).
    const advConds = [`a.role IN ('advisor','sub_advisor')`];
    if (teamLeaderId) { advConds.push(`a.team_leader_id = $${i++}`); params.push(teamLeaderId); }
    if (advisorId) { advConds.push(`a.id = $${i++}`); params.push(advisorId); }
    const advWhere = `WHERE ${advConds.join(' AND ')}`;
    const noAdvFilter = !teamLeaderId && !advisorId;

    // Venta por paquete: el costo asignado si existe, si no el precio de venta
    // PO Box. (assigned_cost_mxn solo está en una fracción de los paquetes.)
    const REVENUE_EXPR = `COALESCE(NULLIF(p.assigned_cost_mxn, 0), p.pobox_service_cost, 0)`;

    // CTE de paquetes atribuidos al asesor (por advisor_id y, si no, referred_by_id).
    const pkgCte = `
      WITH pkg AS (
        SELECT COALESCE(client.advisor_id, client.referred_by_id) AS advisor_id,
               p.service_type, p.status, p.consolidation_id,
               ${REVENUE_EXPR}::numeric AS revenue
        FROM packages p
        JOIN users client ON p.user_id = client.id
        ${pkgWhere}
      )`;

    // Una fila por asesor (TODOS los asesores). LEFT JOIN a pkg → 0 si no vendió.
    // COUNT(pkg.advisor_id) ignora la fila nula del LEFT JOIN → 0 correcto.
    const query = `
      ${pkgCte}
      SELECT
        a.id AS advisor_id, a.full_name AS advisor_name,
        a.team_leader_id, leader.full_name AS team_leader_name,
        COUNT(pkg.advisor_id)::int AS total_shipments,
        COALESCE(SUM(pkg.revenue), 0)::numeric AS total_revenue,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.service_type IN ('AIR_CHN_MX','china_air','aereo'))::int AS air_shipments,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.service_type IN ('china_sea','SEA_CHN_MX','maritime','fcl'))::int AS sea_shipments,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.service_type = 'POBOX_USA')::int AS pobox_shipments,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.consolidation_id IS NOT NULL)::int AS consolidation_shipments,
        COUNT(pkg.advisor_id) FILTER (WHERE pkg.status = 'delivered')::int AS completed_shipments,
        (SELECT COUNT(*)::int FROM warranties w WHERE w.advisor_id = a.id AND w.created_at BETWEEN $1 AND $2) AS gex_shipments,
        (SELECT COUNT(*)::int FROM entangled_payment_requests epr WHERE epr.advisor_id = a.id AND epr.created_at BETWEEN $1 AND $2 AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')) AS xpay_count,
        (SELECT COALESCE(SUM(usc.used_credit), 0)::numeric FROM user_service_credits usc JOIN users c ON c.id = usc.user_id WHERE COALESCE(c.advisor_id, c.referred_by_id) = a.id) AS credit_outstanding,
        COALESCE(COALESCE(SUM(pkg.revenue), 0) / NULLIF(COUNT(pkg.advisor_id), 0), 0)::numeric AS avg_revenue_per_shipment
      FROM users a
      LEFT JOIN users leader ON a.team_leader_id = leader.id
      LEFT JOIN pkg ON pkg.advisor_id = a.id
      ${advWhere}
      GROUP BY a.id, a.full_name, a.team_leader_id, leader.full_name
      ORDER BY total_shipments DESC, total_revenue DESC
    `;
    const result = await pool.query(query, params);
    const data: any[] = result.rows;

    // Fila "Sin Asesor" (paquetes sin asesor atribuido). Solo cuando no se filtra
    // por asesor/team leader.
    if (noAdvFilter) {
      const sa = await pool.query(`
        ${pkgCte}
        SELECT
          COUNT(*)::int AS total_shipments,
          COALESCE(SUM(revenue), 0)::numeric AS total_revenue,
          COUNT(*) FILTER (WHERE service_type IN ('AIR_CHN_MX','china_air','aereo'))::int AS air_shipments,
          COUNT(*) FILTER (WHERE service_type IN ('china_sea','SEA_CHN_MX','maritime','fcl'))::int AS sea_shipments,
          COUNT(*) FILTER (WHERE service_type = 'POBOX_USA')::int AS pobox_shipments,
          COUNT(*) FILTER (WHERE consolidation_id IS NOT NULL)::int AS consolidation_shipments,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS completed_shipments,
          (SELECT COUNT(*)::int FROM warranties w WHERE w.advisor_id IS NULL AND w.created_at BETWEEN $1 AND $2) AS gex_shipments,
          (SELECT COUNT(*)::int FROM entangled_payment_requests epr WHERE epr.advisor_id IS NULL AND epr.created_at BETWEEN $1 AND $2 AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')) AS xpay_count,
          (SELECT COALESCE(SUM(usc.used_credit), 0)::numeric FROM user_service_credits usc JOIN users c ON c.id = usc.user_id WHERE COALESCE(c.advisor_id, c.referred_by_id) IS NULL) AS credit_outstanding,
          COALESCE(SUM(revenue), 0) / NULLIF(COUNT(*), 0) AS avg_revenue_per_shipment
        FROM pkg WHERE advisor_id IS NULL
      `, params);
      const row = sa.rows[0];
      if (row && Number(row.total_shipments) > 0) {
        data.push({ advisor_id: null, advisor_name: 'Sin Asesor', team_leader_id: null, team_leader_name: null, ...row });
      }
    }

    // Totales (calculados en JS para respetar todos los filtros).
    const shipments = data.reduce((s, r) => s + Number(r.total_shipments || 0), 0);
    const revenue = data.reduce((s, r) => s + parseFloat(r.total_revenue || '0'), 0);
    const advisors = result.rows.filter((r: any) => Number(r.total_shipments) > 0).length;

    // Desglose por servicio (acotado a los asesores filtrados si aplica).
    const svcWhere = noAdvFilter ? '' : `WHERE pkg.advisor_id IN (SELECT a.id FROM users a ${advWhere})`;
    const serviceResult = await pool.query(`
      ${pkgCte}
      SELECT pkg.service_type, COUNT(*)::int AS count, COALESCE(SUM(pkg.revenue), 0)::numeric AS revenue
      FROM pkg
      ${svcWhere}
      GROUP BY pkg.service_type
      ORDER BY count DESC
    `, params);

    res.json({
      success: true,
      data,
      totals: { shipments, revenue: revenue.toFixed(2), advisors },
      serviceStats: serviceResult.rows,
      filters: { startDate, endDate, teamLeaderId, advisorId, serviceType, status }
    });
  } catch (error: any) {
    console.error('Error getSalesReport:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Detalle de ventas de UN asesor, desglosado por servicio (para el modal al dar
 * click en un asesor del reporte). Muestra envíos, completados, ingreso (venta),
 * costo proveedor y margen (ingreso económico a la empresa) por servicio.
 * GET /api/admin/crm/reports/sales/advisor/:advisorId
 */
export const getSalesReportByAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    const { advisorId } = req.params;
    const { startDate, endDate } = req.query;
    const isSinAsesor = advisorId === 'null' || advisorId === 'sin-asesor';

    const params: any[] = [startDate || '2020-01-01', endDate || new Date().toISOString()];
    let advFilter = `COALESCE(client.advisor_id, client.referred_by_id) IS NULL`;
    if (!isSinAsesor) {
      params.push(Number(advisorId));
      advFilter = `COALESCE(client.advisor_id, client.referred_by_id) = $3`;
    }

    const REVENUE_EXPR = `COALESCE(NULLIF(p.assigned_cost_mxn, 0), p.pobox_service_cost, 0)`;
    const COST_EXPR = `COALESCE(p.pobox_provider_cost_mxn, 0)`;

    const q = `
      WITH pkg AS (
        SELECT p.service_type, p.status,
               ${REVENUE_EXPR}::numeric AS revenue,
               ${COST_EXPR}::numeric AS provider_cost,
               (CASE WHEN ${isSinAsesor ? 'TRUE' : 'FALSE'} THEN 0
                     ELSE ${REVENUE_EXPR} * COALESCE(cr.percentage, 0) / 100 END)::numeric AS commission
        FROM packages p
        JOIN users client ON p.user_id = client.id
        LEFT JOIN commission_rates cr ON cr.service_type = (CASE
          WHEN UPPER(p.service_type) IN ('POBOX_USA','USA','POBOX') THEN 'pobox_usa_mx'
          WHEN UPPER(p.service_type) IN ('AIR_CHN_MX','AIR_CHINA','AEREO') THEN 'aereo_china_mx'
          WHEN UPPER(p.service_type) IN ('SEA_CHN_MX','SEA_CHINA','MARITIME','FCL') THEN 'maritimo_china_mx'
          WHEN UPPER(p.service_type) IN ('AA_DHL','DHL') THEN 'liberacion_aa_dhl'
          WHEN UPPER(p.service_type) IN ('NACIONAL') THEN 'nacional_mx'
          ELSE 'pobox_usa_mx' END)
        WHERE p.created_at BETWEEN $1 AND $2 AND ${advFilter}
          AND p.master_id IS NULL
      )
      SELECT
        service_type,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS completed,
        COALESCE(SUM(revenue), 0)::numeric AS revenue,
        COALESCE(SUM(provider_cost), 0)::numeric AS provider_cost,
        COALESCE(SUM(commission), 0)::numeric AS commission,
        COALESCE(SUM(revenue) - SUM(provider_cost) - SUM(commission), 0)::numeric AS margin
      FROM pkg
      GROUP BY service_type
      ORDER BY count DESC
    `;
    const result = await pool.query(q, params);

    let advisorName = 'Sin Asesor';
    if (!isSinAsesor) {
      const a = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [Number(advisorId)]);
      advisorName = a.rows[0]?.full_name || `Asesor #${advisorId}`;
    }

    const services = [...result.rows];

    // GEX (garantías): ingreso = total cobrado; costo = comisión pagada al asesor.
    const gexFilter = isSinAsesor ? 'w.advisor_id IS NULL' : 'w.advisor_id = $3';
    const gex = await pool.query(`
      SELECT COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE w.status = 'active')::int AS completed,
             COALESCE(SUM(w.total_cost_mxn), 0)::numeric AS revenue,
             0::numeric AS provider_cost,
             COALESCE(SUM(w.advisor_commission), 0)::numeric AS commission,
             COALESCE(SUM(w.total_cost_mxn) - SUM(w.advisor_commission), 0)::numeric AS margin
      FROM warranties w
      WHERE ${gexFilter} AND w.created_at BETWEEN $1 AND $2
    `, params);
    if (Number(gex.rows[0].count) > 0) services.push({ service_type: 'GEX (Garantía)', ...gex.rows[0] });

    // X-Pay (modelo "solo comisión"): todo en pesos.
    //  - INGRESO = comisión cobrada al cliente = monto(USD) × TC_cliente × comisión_cliente%
    //  - COSTO PROVEEDOR = comisión que nos cobra ENTANGLED = monto(USD) × TC_compra × comisión_ENTANGLED%
    //  - GANANCIA = INGRESO − COSTO. NO incluye el monto al proveedor ni el margen de TC.
    // Las comisiones en pesos no se guardan; se calculan del monto y los %.
    const xpayFilter = isSinAsesor ? 'epr.advisor_id IS NULL' : 'epr.advisor_id = $3';
    const XPAY_BASE_C = `COALESCE(epr.op_monto, 0) * COALESCE(epr.tc_cliente_final, epr.tc_aplicado_usd, 0)`;
    const XPAY_REVENUE = `${XPAY_BASE_C} * COALESCE(epr.comision_cliente_final_porcentaje, 0) / 100`;
    const XPAY_COST = `${XPAY_BASE_C} * COALESCE(epr.comision_cobrada_porcentaje, 0) / 100`;
    // Comisión del asesor en X-Pay = parte del asesor (cliente − entangled − entregax).
    const XPAY_DEFAULT_EGX = `(SELECT COALESCE(override_porcentaje_compra,0) FROM entangled_providers WHERE is_active=true AND is_default=true ORDER BY id ASC LIMIT 1)`;
    const XPAY_PCT_EGX = `LEAST(COALESCE(NULLIF(epr.comision_entregax,0), ${XPAY_DEFAULT_EGX}, 0), GREATEST(0, COALESCE(epr.comision_cliente_final_porcentaje,0) - COALESCE(epr.comision_cobrada_porcentaje,0)))`;
    const XPAY_ASESOR = `${XPAY_BASE_C} * GREATEST(0, COALESCE(epr.comision_cliente_final_porcentaje,0) - COALESCE(epr.comision_cobrada_porcentaje,0) - ${XPAY_PCT_EGX}) / 100`;
    const xpay = await pool.query(`
      SELECT COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE epr.estatus_global = 'completado')::int AS completed,
             COALESCE(SUM(${XPAY_REVENUE}), 0)::numeric AS revenue,
             COALESCE(SUM(${XPAY_COST}), 0)::numeric AS provider_cost,
             COALESCE(SUM(${XPAY_ASESOR}), 0)::numeric AS commission,
             COALESCE(SUM(${XPAY_REVENUE} - ${XPAY_COST} - ${XPAY_ASESOR}), 0)::numeric AS margin
      FROM entangled_payment_requests epr
      WHERE ${xpayFilter} AND epr.created_at BETWEEN $1 AND $2
        AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')
    `, params);
    if (Number(xpay.rows[0].count) > 0) services.push({ service_type: 'X-Pay', ...xpay.rows[0] });

    // Envíos/completados = solo paquetes; ingreso/costo/ganancia = todo (incl. GEX y X-Pay).
    const totals = {
      shipments: result.rows.reduce((s, r) => s + Number(r.count || 0), 0),
      completed: result.rows.reduce((s, r) => s + Number(r.completed || 0), 0),
      revenue: services.reduce((s, r) => s + parseFloat(r.revenue || '0'), 0).toFixed(2),
      provider_cost: services.reduce((s, r) => s + parseFloat(r.provider_cost || '0'), 0).toFixed(2),
      commission: services.reduce((s, r) => s + parseFloat(r.commission || '0'), 0).toFixed(2),
      margin: services.reduce((s, r) => s + parseFloat(r.margin || '0'), 0).toFixed(2),
    };

    res.json({ success: true, advisor: { id: isSinAsesor ? null : Number(advisorId), name: advisorName }, services, totals });
  } catch (error: any) {
    console.error('Error getSalesReportByAdvisor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Detalle (lista) de un servicio de un asesor: guías + orden de pago (paquetes),
 * garantías (GEX) u operaciones X-Pay. Para el drill-down del modal.
 * GET /api/admin/crm/reports/sales/advisor/:advisorId/items?service=...
 */
export const getSalesReportServiceItems = async (req: Request, res: Response): Promise<any> => {
  try {
    const { advisorId } = req.params;
    const { service, startDate, endDate } = req.query as Record<string, string>;
    const isSinAsesor = advisorId === 'null' || advisorId === 'sin-asesor';
    const svc = String(service || '');
    const start = startDate || '2020-01-01';
    const end = endDate || new Date().toISOString();

    // ── GEX (garantías) ──────────────────────────────────────────────
    if (svc.toUpperCase().startsWith('GEX')) {
      const p: any[] = [start, end];
      let f = 'w.advisor_id IS NULL';
      if (!isSinAsesor) { p.push(Number(advisorId)); f = 'w.advisor_id = $3'; }
      const r = await pool.query(`
        SELECT w.gex_folio, w.status, w.description, w.route, w.created_at,
               COALESCE(w.total_cost_mxn,0)::numeric AS revenue,
               COALESCE(w.advisor_commission,0)::numeric AS provider_cost,
               (COALESCE(w.total_cost_mxn,0) - COALESCE(w.advisor_commission,0))::numeric AS margin
        FROM warranties w
        WHERE ${f} AND w.created_at BETWEEN $1 AND $2
        ORDER BY w.created_at DESC`, p);
      return res.json({ success: true, kind: 'gex', items: r.rows });
    }

    // ── X-Pay (pagos a proveedor) ────────────────────────────────────
    if (svc.replace(/[-\s]/g, '').toUpperCase() === 'XPAY') {
      const p: any[] = [start, end];
      let f = 'epr.advisor_id IS NULL';
      if (!isSinAsesor) { p.push(Number(advisorId)); f = 'epr.advisor_id = $3'; }
      // Desglose de la comisión cobrada al cliente (todo sobre la misma base = monto × TC cliente):
      //  - Cliente paga   = comision_cliente_final_porcentaje (p.ej. 6%)
      //  - Entangled cobra= comision_cobrada_porcentaje (p.ej. 3.5%)
      //  - Entregax gana  = comision_entregax (incremento configurado del proveedor, p.ej. 1%);
      //                     para operaciones viejas sin el dato, cae al override del proveedor default.
      //  - Asesor gana    = lo que sobra (cliente − entangled − entregax)
      const DEFAULT_EGX = `(SELECT COALESCE(override_porcentaje_compra,0) FROM entangled_providers WHERE is_active=true AND is_default=true ORDER BY id ASC LIMIT 1)`;
      const BASE_C = `COALESCE(epr.op_monto,0) * COALESCE(epr.tc_cliente_final, epr.tc_aplicado_usd, 0)`;
      const PCT_CLI = `COALESCE(epr.comision_cliente_final_porcentaje,0)`;
      const PCT_ENT = `COALESCE(epr.comision_cobrada_porcentaje,0)`;
      const PCT_EGX = `LEAST(COALESCE(NULLIF(epr.comision_entregax,0), ${DEFAULT_EGX}, 0), GREATEST(0, ${PCT_CLI} - ${PCT_ENT}))`;
      const PCT_ASE = `GREATEST(0, ${PCT_CLI} - ${PCT_ENT} - ${PCT_EGX})`;
      const r = await pool.query(`
        SELECT COALESCE(epr.referencia_pago, 'XP'||LPAD(epr.id::text,6,'0')) AS referencia,
               epr.op_beneficiario_nombre AS beneficiario,
               epr.op_monto, epr.op_divisa_destino AS divisa,
               epr.estatus_global AS status, epr.created_at,
               ${PCT_CLI}::numeric AS pct_cliente,
               ${PCT_ENT}::numeric AS pct_entangled,
               ${PCT_EGX}::numeric AS pct_entregax,
               ${PCT_ASE}::numeric AS pct_asesor,
               (${BASE_C} * ${PCT_CLI}/100)::numeric AS revenue,
               (${BASE_C} * ${PCT_ENT}/100)::numeric AS provider_cost,
               (${BASE_C} * ${PCT_EGX}/100)::numeric AS entregax_amount,
               (${BASE_C} * ${PCT_ASE}/100)::numeric AS asesor_amount,
               (${BASE_C} * (${PCT_CLI} - ${PCT_ENT})/100)::numeric AS margin
        FROM entangled_payment_requests epr
        WHERE ${f} AND epr.created_at BETWEEN $1 AND $2
          AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')
        ORDER BY epr.created_at DESC`, p);
      return res.json({ success: true, kind: 'xpay', items: r.rows });
    }

    // ── Paquetes (servicio de paquetería): guías + orden de pago ─────
    const p: any[] = [start, end];
    let advCond = 'COALESCE(client.advisor_id, client.referred_by_id) IS NULL';
    if (!isSinAsesor) { p.push(Number(advisorId)); advCond = 'COALESCE(client.advisor_id, client.referred_by_id) = $3'; }
    p.push(svc);
    const svcIdx = p.length;
    const REVENUE_EXPR = `COALESCE(NULLIF(p.assigned_cost_mxn, 0), p.pobox_service_cost, 0)`;
    const r = await pool.query(`
      SELECT p.tracking_internal AS tracking, p.tracking_provider AS origin_tracking,
             p.status, p.created_at,
             ${REVENUE_EXPR}::numeric AS revenue,
             po.payment_reference AS payment_ref,
             po.pay_status AS payment_status,
             po.paid_with_credit AS paid_with_credit,
             -- Comisión del asesor = ingreso por guía × tasa del servicio
             -- (consistente con el ingreso mostrado). 0 si la guía no tiene asesor.
             (CASE WHEN ${isSinAsesor ? 'TRUE' : 'FALSE'} THEN 0
                   ELSE ${REVENUE_EXPR} * COALESCE(cr.percentage, 0) / 100 END)::numeric AS commission,
             cr.percentage AS commission_rate
      FROM packages p
      JOIN users client ON p.user_id = client.id
      LEFT JOIN commission_rates cr ON cr.service_type = (CASE
        WHEN UPPER(p.service_type) IN ('POBOX_USA','USA','POBOX') THEN 'pobox_usa_mx'
        WHEN UPPER(p.service_type) IN ('AIR_CHN_MX','AIR_CHINA','AEREO') THEN 'aereo_china_mx'
        WHEN UPPER(p.service_type) IN ('SEA_CHN_MX','SEA_CHINA','MARITIME','FCL') THEN 'maritimo_china_mx'
        WHEN UPPER(p.service_type) IN ('AA_DHL','DHL') THEN 'liberacion_aa_dhl'
        WHEN UPPER(p.service_type) IN ('NACIONAL') THEN 'nacional_mx'
        ELSE 'pobox_usa_mx' END)
      LEFT JOIN LATERAL (
        SELECT o.payment_reference, o.pay_status, o.paid_with_credit
        FROM (
           SELECT payment_reference, status AS pay_status, created_at, package_ids AS ids,
                  (LOWER(COALESCE(payment_method,'')) = 'credit' OR COALESCE(credit_applied,0) > 0) AS paid_with_credit
             FROM pobox_payments WHERE COALESCE(status,'') <> 'cancelled'
           UNION ALL
           SELECT payment_reference, status AS pay_status, created_at, package_uids AS ids,
                  false AS paid_with_credit FROM advisor_payment_orders
        ) o
        WHERE o.payment_reference IS NOT NULL AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(o.ids,'[]'::jsonb)) e
          WHERE e = p.id::text OR e = 'PKG-'||p.id::text
        )
        -- Una misma referencia puede existir en ambas tablas (la solicitud del
        -- asesor 'pendiente' y el pago real en pobox 'completed'). Preferimos el
        -- estado más pagado para que un pago con crédito no se vea pendiente.
        ORDER BY (CASE LOWER(COALESCE(o.pay_status,''))
                    WHEN 'paid' THEN 0 WHEN 'completed' THEN 0 WHEN 'pagado' THEN 0
                    WHEN 'vouchers_submitted' THEN 1 WHEN 'vouchers_partial' THEN 1
                    WHEN 'pending' THEN 2 WHEN 'pendiente' THEN 2 WHEN 'pending_payment' THEN 2
                    ELSE 3 END) ASC,
                 o.paid_with_credit DESC,
                 o.created_at DESC
        LIMIT 1
      ) po ON true
      WHERE p.created_at BETWEEN $1 AND $2 AND ${advCond} AND p.service_type = $${svcIdx}
        AND p.master_id IS NULL
      ORDER BY p.created_at DESC
      LIMIT 1000`, p);
    return res.json({ success: true, kind: 'package', items: r.rows });
  } catch (error: any) {
    console.error('Error getSalesReportServiceItems:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Reporte de clientes perdidos (churn)
 * GET /api/admin/crm/reports/churn
 */
export const getChurnReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const { startDate, endDate } = req.query;

    let whereConditions = ["u.recovery_status = 'churned'", "u.role = 'client'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      whereConditions.push(`u.last_transaction_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      whereConditions.push(`u.last_transaction_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const query = `
      SELECT 
        COALESCE(advisor.full_name, 'Sin Asesor') as advisor_name,
        COUNT(DISTINCT u.id) as total_churned,
        ARRAY_AGG(DISTINCT u.full_name) as client_names
      FROM users u
      LEFT JOIN users advisor ON u.referred_by_id = advisor.id
      ${whereClause}
      GROUP BY advisor.full_name
      ORDER BY total_churned DESC
    `;

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Dashboard resumen CRM
 * GET /api/admin/crm/dashboard
 */
export const getCRMDashboard = async (_req: Request, res: Response): Promise<any> => {
  try {
    // Métricas de clientes
    const clientsStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE role = 'client') as total_clients,
        COUNT(*) FILTER (WHERE role = 'client' AND recovery_status = 'active') as active_clients,
        COUNT(*) FILTER (WHERE role = 'client' AND recovery_status = 'in_recovery') as in_recovery,
        COUNT(*) FILTER (WHERE role = 'client' AND recovery_status = 'churned') as churned,
        COUNT(*) FILTER (WHERE role = 'client' AND last_transaction_date < NOW() - INTERVAL '90 days') as inactive_90
      FROM users
    `);

    // Métricas de prospectos
    const prospectsStats = await pool.query(`
      SELECT 
        COUNT(*) as total_prospects,
        COUNT(*) FILTER (WHERE status = 'new') as new_prospects,
        COUNT(*) FILTER (WHERE status = 'contacting') as contacting,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COUNT(*) FILTER (WHERE follow_up_date::date = CURRENT_DATE) as follow_up_today
      FROM prospects
    `);

    // Ventas del mes
    const salesStats = await pool.query(`
      SELECT 
        COUNT(*) as shipments_month,
        COALESCE(SUM(assigned_cost_mxn), 0) as revenue_month
      FROM packages
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `);

    // Top asesores del mes
    const topAdvisors = await pool.query(`
      SELECT 
        advisor.full_name,
        COUNT(p.id) as shipments,
        SUM(COALESCE(p.assigned_cost_mxn, 0)) as revenue
      FROM packages p
      JOIN users client ON p.user_id = client.id
      JOIN users advisor ON advisor.id = COALESCE(client.advisor_id, client.referred_by_id)
      WHERE p.created_at >= DATE_TRUNC('month', NOW())
      GROUP BY advisor.id, advisor.full_name
      ORDER BY revenue DESC
      LIMIT 5
    `);

    // Leads del CRM original
    const leadsStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
        COUNT(*) FILTER (WHERE status = 'converted') as converted
      FROM crm_requests
    `);

    res.json({
      success: true,
      data: {
        clients: clientsStats.rows[0],
        prospects: prospectsStats.rows[0],
        sales: salesStats.rows[0],
        topAdvisors: topAdvisors.rows,
        leads: leadsStats.rows[0]
      }
    });
  } catch (error: any) {
    console.error('Error getCRMDashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Obtener asesores para dropdowns (mejorado)
 * GET /api/admin/crm/advisors-list
 */
export const getAdvisorsForCRM = async (_req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.box_id,
        u.role,
        u.team_leader_id,
        leader.full_name as team_leader_name,
        (SELECT COUNT(*) FROM users WHERE referred_by_id = u.id) as total_clients
      FROM users u
      LEFT JOIN users leader ON u.team_leader_id = leader.id
      WHERE u.role IN ('advisor', 'asesor', 'asesor_lider', 'sub_advisor')
      ORDER BY u.full_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Obtener team leaders para dropdowns
 * GET /api/admin/crm/team-leaders
 */
export const getTeamLeaders = async (_req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT 
        u.id, 
        u.full_name
      FROM users u
      WHERE u.role = 'asesor_lider' OR EXISTS (SELECT 1 FROM users WHERE team_leader_id = u.id)
      ORDER BY u.full_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PATCH /api/admin/crm/clients/:id/advisor
 * Cambiar asesor asignado de un cliente
 */
export const changeClientAdvisor = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { advisorId } = req.body;
    if (!id) return res.status(400).json({ error: 'ID de cliente requerido' });
    // Mantener ambas columnas sincronizadas (advisor_id es la canonica en el panel
    // de gestion de usuarios; referred_by_id es la usada por el CRM historico).
    await pool.query(
      `UPDATE users SET advisor_id = $1, referred_by_id = $1 WHERE id = $2 AND role = 'client'`,
      [advisorId || null, id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/admin/crm/clients/:id/reset-password
 * Resetea contraseña a "Entregax123" y fuerza cambio en próximo login
 */
export const resetClientPassword = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const hashed = await bcrypt.hash('Entregax123', 10);
    await pool.query(
      `UPDATE users SET password = $1, must_change_password = true WHERE id = $2`,
      [hashed, id]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PATCH /api/admin/crm/clients/:id/toggle-active
 * Activa o desactiva un cliente (toggle de users.is_active).
 */
export const toggleClientActive = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const cur = await pool.query(`SELECT is_active FROM users WHERE id = $1 AND role = 'client'`, [id]);
    if (cur.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const newState = !cur.rows[0].is_active;
    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [newState, id]);
    res.json({ success: true, is_active: newState });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PATCH /api/admin/crm/clients/:id/toggle-broker
 * Marca/desmarca un cliente como BROKER (users.is_broker). Un broker recibe en
 * PO Box "Recepción en serie" todas sus cajas como paquetes INDIVIDUALES (sin
 * guías hijas / sin esquema master-hijas).
 */
export const toggleClientBroker = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_broker BOOLEAN DEFAULT false`).catch(() => {});
    const cur = await pool.query(`SELECT is_broker FROM users WHERE id = $1 AND role = 'client'`, [id]);
    if (cur.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const newState = !cur.rows[0].is_broker;
    await pool.query(`UPDATE users SET is_broker = $1 WHERE id = $2`, [newState, id]);
    res.json({ success: true, is_broker: newState });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Actualizar métricas de transacción de un cliente (helper para otros módulos)
 */
export const updateClientTransactionMetrics = async (userId: number, transactionRef: string, amount: number) => {
  try {
    await pool.query(`
      UPDATE users 
      SET 
        first_transaction_date = CASE WHEN first_transaction_date IS NULL THEN NOW() ELSE first_transaction_date END,
        last_transaction_date = NOW(),
        last_transaction_ref = $2,
        last_transaction_amount = $3,
        recovery_status = 'active',
        recovery_deadline = NULL
      WHERE id = $1
    `, [userId, transactionRef, amount]);

    return { success: true };
  } catch (error: any) {
    console.error('Error updateClientTransactionMetrics:', error);
    return { success: false, error: error.message };
  }
};