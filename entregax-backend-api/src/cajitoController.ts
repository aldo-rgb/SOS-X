// ============================================================
// CAJITO — Asistente IA · Chat + Tool-use + Auditoría
// ============================================================
// Alcance v1: SOLO LECTURA. Todas las conversaciones se persisten
// para auditoría (cajito_conversations + cajito_messages).
//
// Proveedor: seleccionable con CAJITO_PROVIDER (openai | anthropic).
// Modelo: CAJITO_MODEL (por defecto gpt-4o-mini o claude-sonnet-5
// según el proveedor). Ver services/llmProvider.ts.
//
// Cada herramienta requiere que el usuario tenga la capability
// correspondiente concedida en `cajito_user_capabilities`. El
// super_admin se trata como si tuviera todas las capacidades.
// ============================================================

import { Request, Response } from 'express';
import { pool } from './db';
import { fetchLeads } from './crmController';
import {
  getLlmProvider,
  getProviderName,
  getModelName,
  getFriendlyModelLabel,
  isProviderKeyConfigured,
  LlmMessage,
  LlmContentBlock,
} from './services/llmProvider';

interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

const MAX_TOKENS = parseInt(process.env.CAJITO_MAX_TOKENS || '2048', 10);
// 8 y no 5: revisar varios tickets encadena una consulta por cada uno y con 5
// se quedaba a medias. Más arriba no ayuda —el limite real es que no abra un
// hilo por ticket, ver la regla de FORMATO/eficiencia en el prompt.
const MAX_TOOL_ITERATIONS = 8;

// --- Tabla auto-create ------------------------------------------------------
let _tablesReady = false;
async function ensureChatTables() {
  if (_tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cajito_conversations (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title           TEXT,
      started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      model           TEXT,
      total_tokens_in  INTEGER NOT NULL DEFAULT 0,
      total_tokens_out INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cajito_conv_user ON cajito_conversations(user_id, last_activity_at DESC);

    CREATE TABLE IF NOT EXISTS cajito_messages (
      id              SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES cajito_conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,           -- 'user' | 'assistant' | 'tool' | 'system'
      content         TEXT,
      tool_name       TEXT,
      tool_args       JSONB,
      tool_result     JSONB,
      tokens_in       INTEGER,
      tokens_out      INTEGER,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cajito_msg_conv ON cajito_messages(conversation_id, created_at);

    -- Base de conocimiento curada (solo super_admin la edita). Cajito la
    -- consulta con el tool search_knowledge para responder "cómo/dónde hacer X".
    CREATE TABLE IF NOT EXISTS cajito_knowledge (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,             -- pregunta / tema
      content      TEXT NOT NULL,             -- respuesta / procedimiento
      tags         TEXT,                      -- palabras clave separadas por coma
      is_active    BOOLEAN NOT NULL DEFAULT TRUE,
      created_by   INTEGER REFERENCES users(id),
      updated_by   INTEGER REFERENCES users(id),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cajito_knowledge_active ON cajito_knowledge(is_active);

    -- Bitácora de lo que Cajito NO supo resolver. Es su lista de tareas para
    -- aprender: cada fila es una pregunta real que se quedó sin respuesta, y
    -- 'veces' dice cuántas personas la han hecho. Se enseña escribiendo la
    -- entrada de conocimiento que la contesta, y la fila queda ligada a ella.
    CREATE TABLE IF NOT EXISTS cajito_gaps (
      id              SERIAL PRIMARY KEY,
      folio           TEXT UNIQUE,            -- CJD-2026-0001, visible para todos
      conversation_id INTEGER REFERENCES cajito_conversations(id) ON DELETE SET NULL,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      pregunta        TEXT NOT NULL,
      pregunta_norm   TEXT NOT NULL,          -- para agrupar repeticiones
      motivo          TEXT NOT NULL,          -- sin_conocimiento | sin_permiso | no_pudo
      detalle         TEXT,
      tool_name       TEXT,
      respuesta       TEXT,                   -- lo que acabó contestando
      estado          TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | resuelta | descartada
      knowledge_id    INTEGER REFERENCES cajito_knowledge(id) ON DELETE SET NULL,
      veces           INTEGER NOT NULL DEFAULT 1,
      first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ,
      resolved_by     INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_cajito_gaps_estado ON cajito_gaps(estado, veces DESC, last_seen_at DESC);
    ALTER TABLE cajito_gaps ADD COLUMN IF NOT EXISTS folio TEXT;
    ALTER TABLE cajito_gaps ADD COLUMN IF NOT EXISTS task_id INTEGER;
    -- Una sola fila por pregunta+motivo mientras siga pendiente: lo que interesa
    -- es cuántas veces la preguntan, no tener mil filas iguales.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cajito_gaps_pendiente
      ON cajito_gaps(pregunta_norm, motivo) WHERE estado = 'pendiente';
  `);
  _tablesReady = true;
}

// --- Bitácora de lo que no supo ---------------------------------------------

/** Normaliza para agrupar: sin acentos, sin signos, minúsculas, espacios simples. */
function normalizarPregunta(p: string): string {
  return String(p || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * Registra una pregunta que Cajito no pudo resolver.
 *
 * Si esa misma pregunta ya está pendiente, no crea otra fila: suma una a
 * `veces`. Así la lista se ordena sola por lo que más falta hace enseñarle,
 * en vez de convertirse en un historial plano que nadie lee.
 */
async function registrarHueco(datos: {
  conversationId: number | null;
  userId: number;
  pregunta: string;
  motivo: 'sin_conocimiento' | 'sin_permiso' | 'no_pudo';
  detalle?: string | null;
  toolName?: string | null;
  respuesta?: string | null;
}): Promise<{ nueva: boolean; veces: number; folio: string; id: number } | null> {
  try {
    const norm = normalizarPregunta(datos.pregunta);
    if (!norm) return null;
    const r = await pool.query(
      `INSERT INTO cajito_gaps
         (conversation_id, user_id, pregunta, pregunta_norm, motivo, detalle, tool_name, respuesta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (pregunta_norm, motivo) WHERE estado = 'pendiente'
       DO UPDATE SET veces = cajito_gaps.veces + 1,
                     last_seen_at = NOW(),
                     conversation_id = EXCLUDED.conversation_id,
                     respuesta = COALESCE(EXCLUDED.respuesta, cajito_gaps.respuesta)
       RETURNING id, veces, folio`,
      [datos.conversationId, datos.userId, datos.pregunta.slice(0, 2000), norm,
       datos.motivo, datos.detalle ?? null, datos.toolName ?? null,
       (datos.respuesta || '').slice(0, 2000) || null]
    );
    const veces = Number(r.rows[0]?.veces) || 1;
    const id = Number(r.rows[0]?.id);
    let folio = r.rows[0]?.folio as string | null;
    // El folio se asigna con el id ya generado. Una duda repetida conserva el
    // suyo: quien vuelve a preguntar recibe el mismo número, que es lo que
    // permite darle seguimiento.
    if (!folio) {
      const f = await pool.query(
        `UPDATE cajito_gaps
            SET folio = 'CJD-' || to_char(first_seen_at, 'YYYY') || '-' || LPAD(id::text, 4, '0')
          WHERE id = $1 RETURNING folio`,
        [id]
      );
      folio = f.rows[0]?.folio || `CJD-${id}`;
    }
    return { nueva: veces === 1, veces, folio: String(folio), id };
  } catch (e: any) {
    // Nunca romper el chat por no poder anotar el hueco.
    console.warn('[CAJITO-GAP] no se pudo registrar:', e?.message);
    return null;
  }
}

/**
 * Avisa a los super admin que a Cajito le faltó saber algo.
 *
 * Solo en la PRIMERA aparición de esa duda: si se notificara cada repetición,
 * una pregunta popular llenaría las notificaciones y se dejarían de leer, que
 * es como se pierde justo la información que queremos aprovechar.
 */
async function avisarDudaASuperAdmins(
  gapId: number, pregunta: string, quien: number, folio: string, motivo: string
): Promise<void> {
  try {
    const admins = await pool.query(
      `SELECT u.id, EXISTS (SELECT 1 FROM user_push_tokens pt WHERE pt.user_id = u.id AND pt.is_active = TRUE) AS con_dispositivo
         FROM users u WHERE u.role = 'super_admin' AND COALESCE(u.is_active, TRUE) = TRUE
        ORDER BY con_dispositivo DESC, u.id`
    );
    if (admins.rows.length === 0) return;
    const autor = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [quien]);
    const nombre = autor.rows[0]?.full_name || 'Un usuario';
    const corta = pregunta.length > 120 ? pregunta.slice(0, 120) + '…' : pregunta;
    const responsableId = Number(admins.rows[0].id);

    // ── Tarea urgente, igual que un error de sistema reportado en ticket ──
    // Mismo tablero y misma prioridad: es lo que hace que la promesa de las 24
    // horas tenga a alguien detrás. El vencimiento se pone a 24h exactas, que
    // es lo que Cajito le prometió al usuario.
    const titulo = `Cajito · ${folio}`;
    const yaExiste = await pool.query(
      `SELECT id FROM tasks WHERE title = $1 AND status <> 'cancelled' LIMIT 1`, [titulo]);
    let taskId: number | null = yaExiste.rows[0] ? Number(yaExiste.rows[0].id) : null;

    if (!taskId) {
      const desc = [
        `🤖 Cajito no supo responder esta pregunta.`,
        ``,
        `Pregunta: "${pregunta}"`,
        `La hizo: ${nombre}`,
        `Motivo: ${motivo === 'sin_conocimiento' ? 'No está documentado en la base de conocimiento'
          : motivo === 'sin_permiso' ? 'Le faltó una capacidad para consultarlo'
          : 'No pudo resolverlo'}`,
        ``,
        `Se le prometió al usuario que lo aprendería en menos de 24 horas.`,
        `Para cerrarla: abre Cajito → ícono de dudas → "Enseñarle" en ${folio}.`,
      ].join('\n');

      const boardRes = await pool.query(
        `SELECT id FROM task_boards WHERE name = 'Error de Sistema' AND is_active = TRUE ORDER BY id LIMIT 1`);
      const { createAssignedTaskInternal } = await import('./tasksController');
      taskId = await createAssignedTaskInternal({
        creatorId: responsableId, assigneeId: responsableId,
        title: titulo, description: desc,
        eisenhower: 'fuego',
        dueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        notifyAssignee: false, // el aviso propio de abajo dice más
        ...(boardRes.rows[0]?.id ? { boardId: Number(boardRes.rows[0].id) } : {}),
      });
      if (taskId) {
        await pool.query(`UPDATE cajito_gaps SET task_id = $1 WHERE id = $2`, [taskId, gapId]);
        // Todos los super admin dentro: cualquiera puede enseñarle.
        for (const a of admins.rows) {
          await pool.query(
            `INSERT INTO task_participants (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [taskId, Number(a.id)]).catch(() => {});
        }
      }
    }

    const { createCustomNotification } = await import('./notificationController');
    for (const a of admins.rows) {
      await createCustomNotification(
        Number(a.id),
        `🤖 Cajito tiene una duda · ${folio}`,
        `${nombre} preguntó: "${corta}" y Cajito no supo responder. Se levantó tarea urgente con vencimiento en 24 h.`,
        'task', 'help',
        { screen: 'MyTasks', task_id: taskId },
        '/tareas'
      ).catch(() => {});
    }
  } catch (e: any) {
    console.warn('[CAJITO-GAP] no se pudo levantar la tarea:', e?.message);
  }
}

/** Frases con las que un modelo admite que no puede. Señal de respaldo. */
const FRASES_NO_PUDO = [
  'no tengo acceso', 'no tengo esa informacion', 'no tengo información',
  'no puedo ayudarte con', 'no cuento con', 'no dispongo de',
  'no tengo permiso', 'no tengo la capacidad', 'no esta documentado',
  'no está documentado', 'no encontre informacion', 'no encontré información',
  'no tengo información documentada', 'no puedo realizar', 'no puedo hacer',
];

// --- Capacidades del usuario ------------------------------------------------
async function getUserCapabilities(userId: number, role: string): Promise<Set<string>> {
  // super_admin tiene todas las capacidades (igual que el resto del sistema)
  if (role === 'super_admin') return new Set(['*']);
  const r = await pool.query(
    `SELECT capability FROM cajito_user_capabilities WHERE user_id = $1 AND granted = TRUE`,
    [userId]
  );
  return new Set(r.rows.map((x: any) => x.capability));
}
function hasCap(caps: Set<string>, key: string): boolean {
  return caps.has('*') || caps.has(key);
}

// --- Helpers de saneamiento (límites de filas, recorte de strings) ----------
const MAX_ROWS = 25;
function trimText(s: any, n = 400): any {
  if (typeof s !== 'string') return s;
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ============================================================
// HERRAMIENTAS (TOOLS) — SOLO LECTURA (v1)
// ============================================================
// REGLA DURA: cada tool DEBE tener readOnly: true. El dispatch
// del chat rechaza en runtime cualquier tool con readOnly !== true,
// y el compilador también lo exige por el tipo `ToolDef`.
// Esto aplica tanto para el proveedor OpenAI como Anthropic.
// ============================================================
type ToolCtx = { userId: number; role: string };
type ToolDef = {
  name: string;
  requiredCapability: string;
  description: string;
  parameters: any;
  readOnly: true; // ← invariante: si alguna vez lo cambias, revisa a fondo
  handler: (args: any, ctx: ToolCtx) => Promise<any>;
};

const TOOLS: ToolDef[] = [
  // -------------------- BASE DE CONOCIMIENTO --------------------
  {
    name: 'search_knowledge',
    requiredCapability: 'cajito.access',
    readOnly: true,
    description: 'Busca en la base de conocimiento curada de EntregaX (procedimientos, "cómo/dónde configuro X", políticas internas). ÚSALA SIEMPRE PRIMERO para preguntas de tipo cómo hacer algo, dónde está una función, o procedimientos internos, antes de responder. Si no hay resultados, dilo y NO inventes pasos.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Términos de búsqueda (tema/pregunta). Ej: "configurar correo xpay", "dar de alta empleado".' },
      },
      required: ['query'],
    },
    handler: async ({ query }) => {
      const q = String(query || '').trim();
      if (!q) return { results: [], note: 'Consulta vacía.' };
      const r = await pool.query(
        `SELECT id, title, content, tags
           FROM cajito_knowledge
          WHERE is_active = TRUE
            AND (title ILIKE $1 OR content ILIKE $1 OR COALESCE(tags,'') ILIKE $1)
          ORDER BY (title ILIKE $1) DESC, updated_at DESC
          LIMIT 5`,
        [`%${q}%`]
      );
      if (r.rows.length === 0) {
        return { results: [], note: 'No hay conocimiento registrado sobre esto. Dile al usuario que no tienes esa información documentada y NO inventes pasos.' };
      }
      return { results: r.rows.map((k: any) => ({ id: k.id, title: k.title, content: k.content, tags: k.tags || undefined })) };
    },
  },

  // -------------------- PAQUETES --------------------
  {
    name: 'lookup_package',
    requiredCapability: 'cajito.read.packages',
    readOnly: true,
    description: 'Busca un paquete por su número de GUÍA/tracking (US-…, TDX-…, AIR…, LOG…, JJD…, o tracking del transportista). Devuelve estado, peso, dimensiones, cliente y fechas. NO la uses para casilleros de cliente como "S2345"/"S96" — para eso usa search_clients.',
    parameters: {
      type: 'object',
      properties: {
        tracking: { type: 'string', description: 'Número de guía/tracking (TDX-…, US-…, AIR…, LOG…). NO es un casillero S####.' }
      },
      required: ['tracking']
    },
    handler: async ({ tracking }) => {
      const t = String(tracking || '').trim();
      if (!t) return { error: 'tracking vacío' };
      // Las guías se teclean o se leen del escáner, y llegan con basura: una
      // letra de más al final, espacios, el número pegado dos veces. La guía
      // aérea AIR2617931KKpOT-001L del TKT-2026-2226 existía, pero con la "L"
      // final no la encontraba y se concluyó que "no existe en el sistema".
      // Se normaliza AQUÍ y no con una instrucción al modelo: así funciona
      // siempre, venga de donde venga.
      const variantes = [t];
      const limpio = t.replace(/\s+/g, '');
      if (limpio !== t) variantes.push(limpio);
      // AIR…-001L → AIR…-001 (sufijo de 3 dígitos con una letra pegada)
      const sinLetraFinal = limpio.replace(/(-\d{3})[A-Za-z]$/, '$1');
      if (sinLetraFinal !== limpio) variantes.push(sinLetraFinal);
      const r = await pool.query(
        `SELECT p.id, p.tracking_internal, p.tracking_provider, p.status, p.service_type,
                p.weight,
                COALESCE(p.pkg_length, 0) AS length,
                COALESCE(p.pkg_width, 0)  AS width,
                COALESCE(p.pkg_height, 0) AS height,
                p.box_id, p.created_at, p.received_at, p.delivered_at,
                u.full_name AS client_name, u.email AS client_email
           FROM packages p
           LEFT JOIN users u ON p.user_id = u.id
          WHERE p.tracking_internal = ANY($1::text[])
             OR p.tracking_provider = ANY($1::text[])
             -- Último recurso: por prefijo, para cuando trae un sufijo que no
             -- reconocemos. Se limita a 5 para no devolver medio almacén.
             OR p.tracking_internal ILIKE $2
          ORDER BY (p.tracking_internal = ANY($1::text[])) DESC, p.created_at DESC
          LIMIT 5`,
        [variantes, `${sinLetraFinal}%`]
      );
      if (!r.rows.length) {
        return {
          found: false,
          probe: variantes,
          nota: 'No existe con ese número ni quitándole el sufijo. Antes de concluir que la guía no existe, considera que pudo capturarse con otro formato.',
        };
      }
      return { found: true, packages: r.rows };
    }
  },

  // -------------------- CLIENTES --------------------
  {
    name: 'search_clients',
    requiredCapability: 'cajito.read.clients',
    readOnly: true,
    description: 'Busca CLIENTES por número de casillero (box_id, p.ej. "S1", "S96", "S2345"), nombre o correo, y devuelve sus datos. ÚSALA siempre que pidan información/detalles de un cliente o cuando den un número que empieza con "S" seguido de dígitos (eso es un casillero de cliente, NO una guía).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Casillero (S2345), nombre o correo del cliente (mín 2 caracteres)' }
      },
      required: ['query']
    },
    handler: async ({ query }) => {
      const q = String(query || '').trim();
      if (q.length < 2) return { error: 'query muy corto (mín 2)' };
      const like = `%${q}%`;
      const r = await pool.query(
        `SELECT id, box_id, full_name, email, phone, created_at
           FROM users
          WHERE box_id ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1
          ORDER BY box_id NULLS LAST
          LIMIT $2`,
        [like, MAX_ROWS]
      );
      return { count: r.rows.length, clients: r.rows };
    }
  },

  // -------------------- INVENTARIO --------------------
  {
    name: 'package_status_counts',
    requiredCapability: 'cajito.read.warehouses',
    readOnly: true,
    description: 'Cuenta paquetes agrupados por estado (status). Útil para KPIs de almacén. Filtros opcionales: service_type, since (fecha ISO).',
    parameters: {
      type: 'object',
      properties: {
        service_type: { type: 'string', description: 'POBOX_USA, air, maritime, dhl, nacional' },
        since: { type: 'string', description: 'Fecha ISO desde la que contar (opcional)' }
      }
    },
    handler: async ({ service_type, since }) => {
      const wh: string[] = ['(p.is_master = true OR p.master_id IS NULL)'];
      const params: any[] = [];
      if (service_type) { params.push(service_type); wh.push(`p.service_type = $${params.length}`); }
      if (since) { params.push(since); wh.push(`p.created_at >= $${params.length}`); }
      const r = await pool.query(
        `SELECT COALESCE(p.status, 'unknown') AS status, COUNT(*)::int AS total
           FROM packages p
          WHERE ${wh.join(' AND ')}
          GROUP BY 1
          ORDER BY 2 DESC`,
        params
      );
      return { groups: r.rows };
    }
  },

  // -------------------- CONTENEDORES MARÍTIMOS --------------------
  {
    name: 'container_status_counts',
    requiredCapability: 'cajito.read.warehouses',
    readOnly: true,
    description: 'Cuenta contenedores marítimos agrupados por estado. Los estados son: received_origin, consolidated, in_transit (en camino / zarpó), arrived_port (llegó al puerto), customs_cleared (aduana liberada), in_transit_clientfinal (en camino al cliente final), delivered. Úsalo cuando el usuario pregunte por contenedores en camino, en aduana, entregados, etc.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtrar por un estado específico (opcional). Ej: in_transit, arrived_port, customs_cleared' }
      }
    },
    handler: async ({ status }) => {
      if (status) {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS total, status FROM containers WHERE status = $1 GROUP BY status`,
          [status]
        );
        return { status, total: r.rows[0]?.total ?? 0 };
      }
      const r = await pool.query(
        `SELECT COALESCE(status, 'unknown') AS status, COUNT(*)::int AS total
           FROM containers
          GROUP BY 1
          ORDER BY 2 DESC`
      );
      return { groups: r.rows };
    }
  },

  // -------------------- PAQUETES PENDIENTES (conteo rápido) --------------------
  {
    name: 'packages_pending_counts',
    requiredCapability: 'cajito.read.packages',
    readOnly: true,
    description: 'Conteo rápido de paquetes por servicio y estado pendiente. Úsalo cuando el usuario pregunte cuántas cajas/paquetes están pendientes de recibir, en tránsito, en almacén, o por entregar. service_type: POBOX_USA (Po Box), AIR_CHN_MX (aéreo China), SEA_CHN_MX (marítimo China), AA_DHL (DHL).',
    parameters: {
      type: 'object',
      properties: {
        service_type: { type: 'string', description: 'POBOX_USA, AIR_CHN_MX, SEA_CHN_MX, AA_DHL (opcional)' }
      }
    },
    handler: async ({ service_type }) => {
      const wh: string[] = ['(p.is_master = true OR p.master_id IS NULL)', "p.status NOT IN ('delivered', 'cancelled')"];
      const params: any[] = [];
      if (service_type) { params.push(service_type); wh.push(`p.service_type = $${params.length}`); }
      const r = await pool.query(
        `SELECT COALESCE(p.status, 'unknown') AS status, p.service_type, COUNT(*)::int AS total
           FROM packages p
          WHERE ${wh.join(' AND ')}
          GROUP BY 1, 2
          ORDER BY 3 DESC`,
        params
      );
      return { groups: r.rows };
    }
  },

  // -------------------- RUTAS --------------------
  {
    name: 'today_routes',
    requiredCapability: 'cajito.read.routes',
    readOnly: true,
    description: 'Lista rutas/asignaciones de hoy con chofer y vehículo. Devuelve hasta 25.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      // Las inspecciones diarias de chofer son la fuente más confiable de "rutas hoy".
      try {
        const r = await pool.query(
          `SELECT vi.id, vi.driver_id, u.full_name AS driver_name,
                  v.economic_number AS vehicle_number, v.license_plates,
                  vi.check_out_at, vi.check_in_at, vi.status
             FROM vehicle_inspections vi
             LEFT JOIN users u ON vi.driver_id = u.id
             LEFT JOIN vehicles v ON vi.vehicle_id = v.id
            WHERE vi.check_out_at::date = CURRENT_DATE
            ORDER BY vi.check_out_at DESC
            LIMIT $1`,
          [MAX_ROWS]
        );
        return { count: r.rows.length, routes: r.rows };
      } catch {
        return { count: 0, routes: [], note: 'sin datos disponibles' };
      }
    }
  },

  // -------------------- CHOFER --------------------
  {
    name: 'driver_status',
    requiredCapability: 'cajito.read.drivers',
    readOnly: true,
    description: 'Devuelve estado actual de un chofer: vehículo asignado, inspección abierta, paquetes cargados.',
    parameters: {
      type: 'object',
      properties: {
        driver_id: { type: 'integer', description: 'ID del chofer (users.id)' }
      },
      required: ['driver_id']
    },
    handler: async ({ driver_id }) => {
      const id = parseInt(driver_id, 10);
      if (!Number.isFinite(id)) return { error: 'driver_id inválido' };
      const driver = await pool.query(`SELECT id, full_name, email, phone FROM users WHERE id = $1`, [id]);
      if (!driver.rows.length) return { found: false };
      const inspection = await pool.query(
        `SELECT vi.id, vi.status, vi.check_out_at, vi.check_in_at,
                v.economic_number, v.license_plates
           FROM vehicle_inspections vi
           LEFT JOIN vehicles v ON vi.vehicle_id = v.id
          WHERE vi.driver_id = $1 AND vi.check_out_at::date = CURRENT_DATE
          ORDER BY vi.check_out_at DESC LIMIT 1`,
        [id]
      );
      const loaded = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM packages
          WHERE assigned_driver_id = $1 AND status NOT IN ('delivered', 'cancelled')`,
        [id]
      ).catch(() => ({ rows: [{ total: null }] }));
      return {
        driver: driver.rows[0],
        todayInspection: inspection.rows[0] || null,
        currentlyLoaded: loaded.rows[0]?.total ?? null
      };
    }
  },

  // -------------------- CENTRO DE SOPORTE: KPIs --------------------
  {
    name: 'support_tickets_stats',
    requiredCapability: 'cajito.read.support',
    readOnly: true,
    description: 'Estadísticas del Centro de Soporte: cuántos tickets hay por estado (open_ai=IA atendiendo, escalated_human=escalado a humano, waiting_client=esperando al cliente, resolved=resuelto, closed=cerrado), abiertos por cliente vs por empleado, nuevos y resueltos en las últimas 24h, y abiertos por departamento. Úsalo cuando pregunten cuántos tickets hay, cuántos abiertos/pendientes, o el estado general del soporte.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const stats = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE archived_at IS NULL)                                   AS total_activos,
          COUNT(*) FILTER (WHERE status = 'open_ai' AND archived_at IS NULL)            AS ia_atendiendo,
          COUNT(*) FILTER (WHERE status = 'escalated_human' AND archived_at IS NULL)    AS escalados_humano,
          COUNT(*) FILTER (WHERE status = 'waiting_client' AND archived_at IS NULL)     AS esperando_cliente,
          COUNT(*) FILTER (WHERE status = 'resolved')                                   AS resueltos,
          COUNT(*) FILTER (WHERE status = 'closed')                                     AS cerrados,
          COUNT(*) FILTER (WHERE creator_type = 'employee' AND status <> 'resolved' AND archived_at IS NULL)                    AS abiertos_empleado,
          COUNT(*) FILTER (WHERE COALESCE(creator_type,'client') <> 'employee' AND status <> 'resolved' AND archived_at IS NULL) AS abiertos_cliente,
          COUNT(*) FILTER (WHERE created_at  > NOW() - INTERVAL '24 hours')             AS nuevos_24h,
          COUNT(*) FILTER (WHERE resolved_at > NOW() - INTERVAL '24 hours')             AS resueltos_24h
        FROM support_tickets
      `).catch(() => ({ rows: [{}] }));
      const deps = await pool.query(`
        SELECT d.name AS departamento,
               COUNT(t.id) FILTER (WHERE t.status <> 'resolved' AND t.archived_at IS NULL) AS abiertos
        FROM support_departments d
        LEFT JOIN support_tickets t ON t.department_id = d.id
        GROUP BY d.id, d.name, d.sort_order
        ORDER BY d.sort_order
      `).catch(() => ({ rows: [] }));
      return { resumen: stats.rows[0] || {}, por_departamento: deps.rows };
    }
  },

  // -------------------- ÓRDENES DE PAGO --------------------
  // Sin esto Cajito podia ver las guias pero no el COBRO, que es de lo que
  // reclama la mitad de los tickets: "me cobraron flete", "esta orden no
  // corresponde", "pague y sigue pendiente". Investigo el TKT-2026-2403 y se
  // quedo a medias justo por esto.
  {
    name: 'lookup_payment_order',
    requiredCapability: 'cajito.read.payments',
    readOnly: true,
    description: 'Detalle de una ORDEN DE PAGO por su referencia (RO-, PP-, UW-, CEX-): monto, estatus, método de pago, si se pagó con crédito y si ya se liquidó, el cliente, y el DESGLOSE por caja — costo del servicio, flete nacional cobrado, paquetería, si la guía nacional la puso el cliente, y los cargos extra o descuentos aplicados. Úsalo SIEMPRE que el ticket hable de un cobro, de una orden, de flete, de un monto que no cuadra o de algo que ya se pagó.',
    parameters: {
      type: 'object',
      properties: { referencia: { type: 'string', description: 'Referencia de la orden, p.ej. RO-65105F71' } },
      required: ['referencia'],
    },
    handler: async ({ referencia }) => {
      const ref = String(referencia || '').trim().toUpperCase();
      if (!ref) return { error: 'Falta la referencia' };
      const o = await pool.query(
        `SELECT p.id, p.payment_reference, p.status, p.amount, p.currency, p.payment_method,
                COALESCE(p.credit_settled,false) AS credito_liquidado, p.paid_at, p.created_at,
                p.package_ids, p.concepto, u.box_id, u.full_name AS cliente
           FROM pobox_payments p LEFT JOIN users u ON u.id = p.user_id
          WHERE UPPER(p.payment_reference) = $1 LIMIT 1`, [ref]);
      if (o.rows.length === 0) return { encontrada: false, mensaje: `No existe ninguna orden con la referencia ${ref}.` };
      const ord = o.rows[0];

      const ids: number[] = Array.isArray(ord.package_ids) ? ord.package_ids.map(Number).filter(Number.isFinite) : [];
      let cajas: any[] = [];
      if (ids.length > 0) {
        const c = await pool.query(
          `SELECT p.id, p.tracking_internal, p.weight, p.is_master, p.master_id,
                  COALESCE(p.national_shipping_cost,0) AS flete_nacional,
                  p.national_carrier, p.national_tracking,
                  (p.national_label_url IS NOT NULL) AS guia_nacional_la_puso_el_cliente,
                  COALESCE(p.is_collect,false) AS flete_por_cobrar,
                  COALESCE(p.assigned_cost_mxn,0) AS costo_servicio
             FROM packages p
            WHERE p.id = ANY($1::int[]) OR p.master_id = ANY($1::int[])
            ORDER BY p.is_master DESC, p.id`, [ids]);
        cajas = c.rows;
      }

      // Cargos extra y descuentos aplicados a esas guias.
      const trks = cajas.map((x: any) => x.tracking_internal).filter(Boolean);
      let ajustes: any[] = [];
      if (trks.length > 0) {
        const a = await pool.query(
          `SELECT guia_tracking, tipo, monto, moneda, concepto, activo, estado_validacion
             FROM guias_ajustes_financieros WHERE guia_tracking = ANY($1::text[])`, [trks]);
        ajustes = a.rows;
      }

      const fleteTotal = cajas
        .filter((x: any) => x.is_master || cajas.every((y: any) => !y.is_master))
        .reduce((acc: number, x: any) => acc + (Number(x.flete_nacional) || 0), 0);
      const conGuiaPropia = cajas.filter((x: any) => !x.is_master && x.guia_nacional_la_puso_el_cliente).length;
      const hijas = cajas.filter((x: any) => !x.is_master).length;

      return {
        encontrada: true,
        orden: {
          referencia: ord.payment_reference, estatus: ord.status,
          monto: Number(ord.amount), moneda: ord.currency,
          metodo_pago: ord.payment_method, credito_liquidado: ord.credito_liquidado,
          pagada_el: ord.paid_at, creada_el: ord.created_at,
          cliente: ord.cliente, casillero: ord.box_id, concepto: ord.concepto,
        },
        cajas,
        ajustes,
        // Señal directa para el caso mas comun: se cobro flete aunque la guia
        // nacional la haya puesto el cliente.
        resumen_flete: {
          flete_cobrado: fleteTotal,
          cajas_totales: hijas,
          cajas_con_guia_del_cliente: conGuiaPropia,
          posible_flete_indebido: fleteTotal > 0 && hijas > 0 && conGuiaPropia === hijas,
        },
      };
    }
  },

  // -------------------- ESTATUS DE PAGO DE UNA GUÍA --------------------
  // Lo pidió Cajito al investigar el TKT-2026-2597: podía ver la guía y podía
  // ver una orden SI le daban la referencia, pero no podía ir de la guía a su
  // cobro. Justo lo que hace falta cuando el reclamo es "esta guía aparece
  // pagada aquí y no allá".
  {
    name: 'lookup_package_payment',
    requiredCapability: 'cajito.read.payments',
    readOnly: true,
    description: 'Estatus de PAGO de una guía a partir de su tracking, sin necesidad de la referencia de la orden. Devuelve todas las órdenes que la incluyen (pagadas, canceladas o pendientes), cuánto se cobró, con qué método, si fue crédito y si ya se liquidó. Úsalo cuando el ticket diga que una guía aparece pagada en una pantalla y no en otra, o pregunte si ya se pagó.',
    parameters: {
      type: 'object',
      properties: { tracking: { type: 'string', description: 'Guía, p.ej. US-7262886354 o JJD0146...' } },
      required: ['tracking'],
    },
    handler: async ({ tracking }) => {
      const tk = String(tracking || '').trim();
      if (!tk) return { error: 'Falta el tracking' };

      const pk = await pool.query(
        `SELECT p.id, p.tracking_internal, p.master_id, p.is_master, p.status,
                COALESCE(p.saldo_pendiente,0) AS saldo_pendiente,
                COALESCE(p.assigned_cost_mxn,0) AS costo, u.box_id, u.full_name AS cliente
           FROM packages p LEFT JOIN users u ON u.id = p.user_id
          WHERE UPPER(p.tracking_internal) = UPPER($1) LIMIT 1`, [tk]);
      const paquete = pk.rows[0] || null;

      // La guía puede estar en package_ids como ella misma o a través de su
      // master: se buscan las dos rutas, si no una caja hija parece sin cobrar.
      const ids = paquete ? [paquete.id, paquete.master_id].filter(Boolean) : [];
      let ordenes: any[] = [];
      if (ids.length > 0) {
        const o = await pool.query(
          `SELECT payment_reference, status, amount, payment_method,
                  COALESCE(credit_settled,false) AS credito_liquidado,
                  paid_at, created_at
             FROM pobox_payments
            WHERE package_ids ?| $1::text[] OR package_ids @> to_jsonb($2::int)
            ORDER BY created_at DESC`,
          [ids.map(String), Number(paquete?.id) || 0]);
        ordenes = o.rows;
      }
      // DHL guarda sus guías en otra tabla; se busca ahí también.
      const dhl = await pool.query(
        `SELECT id, inbound_tracking, secondary_tracking, paid_at, status, total_cost_mxn
           FROM dhl_shipments WHERE inbound_tracking = $1 OR secondary_tracking = $1 LIMIT 1`, [tk]);

      return {
        encontrada: !!paquete || dhl.rows.length > 0,
        paquete, guia_dhl: dhl.rows[0] || null,
        ordenes,
        resumen: {
          tiene_orden_pagada: ordenes.some((o: any) => ['paid', 'completed'].includes(String(o.status))),
          ordenes_canceladas: ordenes.filter((o: any) => o.status === 'cancelled').length,
          saldo_pendiente: Number(paquete?.saldo_pendiente || 0),
        },
      };
    }
  },

  // -------------------- SALDO A FAVOR Y CRÉDITO DEL CLIENTE --------------------
  // Lo pidió Cajito en el TKT-2026-2269: el asesor subió un comprobante MAYOR
  // al monto de la cotización y no veía reflejado el excedente. Sin poder ver
  // el saldo a favor no había forma de saber si el dinero se acreditó y no se
  // muestra, o si de plano no se acreditó.
  {
    name: 'lookup_client_balance',
    requiredCapability: 'cajito.read.payments',
    readOnly: true,
    description: 'Saldo a favor, cartera y crédito de un cliente, por casillero (S91) o por nombre. Devuelve el saldo disponible en su cartera, los saldos a favor por servicio, su línea de crédito y cuánto lleva usado, los excedentes pendientes de aplicar, y los últimos comprobantes con excedente. Úsalo cuando el ticket hable de saldo a favor, de un pago de más, de un excedente que no aparece, o de crédito.',
    parameters: {
      type: 'object',
      properties: { cliente: { type: 'string', description: 'Casillero (S91) o nombre del cliente' } },
      required: ['cliente'],
    },
    handler: async ({ cliente }) => {
      const q = String(cliente || '').trim();
      if (!q) return { error: 'Falta el cliente' };
      const u = await pool.query(
        `SELECT id, full_name, box_id, email, COALESCE(wallet_balance,0) AS cartera
           FROM users
          WHERE UPPER(box_id) = UPPER($1) OR full_name ILIKE $2
          ORDER BY (UPPER(box_id) = UPPER($1)) DESC LIMIT 1`, [q, `%${q}%`]);
      if (u.rows.length === 0) return { encontrado: false, mensaje: `No hallé al cliente "${q}".` };
      const c = u.rows[0];

      const creditos = await pool.query(
        `SELECT service, credit_limit, used_credit,
                (COALESCE(credit_limit,0) - COALESCE(used_credit,0)) AS disponible,
                credit_days, COALESCE(is_blocked,false) AS bloqueado
           FROM user_service_credits WHERE user_id = $1 ORDER BY service`, [c.id]);

      const pendientes = await pool.query(
        `SELECT monto, moneda, motivo, estado, created_at
           FROM saldo_a_favor_pendientes WHERE cliente_id = $1
          ORDER BY created_at DESC LIMIT 10`, [c.id]).catch(() => ({ rows: [] }));

      // Órdenes con excedente: es justo el caso de "pagué de más y no aparece".
      const excedentes = await pool.query(
        `SELECT payment_reference, amount, COALESCE(voucher_total,0) AS comprobantes,
                COALESCE(surplus_amount,0) AS excedente,
                COALESCE(surplus_credited,false) AS excedente_acreditado,
                status, paid_at
           FROM pobox_payments
          WHERE user_id = $1 AND COALESCE(surplus_amount,0) > 0
          ORDER BY created_at DESC LIMIT 10`, [c.id]).catch(() => ({ rows: [] }));

      return {
        encontrado: true,
        cliente: { nombre: c.full_name, casillero: c.box_id, cartera_disponible: Number(c.cartera) },
        credito_por_servicio: creditos.rows,
        saldos_a_favor_pendientes: pendientes.rows,
        ordenes_con_excedente: excedentes.rows,
        resumen: {
          // La señal del caso más común: hubo excedente y NO se acreditó.
          excedentes_sin_acreditar: excedentes.rows.filter((x: any) => !x.excedente_acreditado).length,
          monto_sin_acreditar: excedentes.rows
            .filter((x: any) => !x.excedente_acreditado)
            .reduce((a: number, x: any) => a + (Number(x.excedente) || 0), 0),
        },
      };
    }
  },

  // -------------------- MIS TAREAS --------------------
  // Cajito no podía decir ni cuántas tareas tenía uno: la pregunta más básica
  // del tablero quedaba fuera (CJD-2026-0003). El handler usa ctx.userId, así
  // que cada quien ve LO SUYO y nadie consulta el pendiente de otro.
  {
    name: 'my_tasks',
    requiredCapability: 'cajito.read.tasks',
    readOnly: true,
    description: 'Las tareas del usuario que pregunta: cuántas tiene abiertas, cuáles están vencidas, cuáles vencen hoy o esta semana, cómo se reparten en la matriz de Eisenhower (estrella=importante y urgente, planear=importante no urgente, delegar=urgente no importante, eliminar=ninguna) y el detalle de cada una. Úsalo SIEMPRE que pregunten por "mis tareas", "cuántas tareas tengo", "qué tengo pendiente", "qué se me venció" o pidan que analices su carga de trabajo.',
    parameters: {
      type: 'object',
      properties: {
        incluir_completadas: { type: 'boolean', description: 'Incluir también las ya terminadas (por defecto no)' },
      },
    },
    handler: async ({ incluir_completadas }, ctx) => {
      const soloAbiertas = incluir_completadas ? '' : `AND t.status <> 'done'`;
      const r = await pool.query(`
        SELECT t.id, t.title, t.status, t.eisenhower, t.priority,
               t.due_at, t.created_at, t.completed_at,
               c.full_name AS creada_por,
               (t.due_at IS NOT NULL AND t.due_at < NOW() AND t.status <> 'done') AS vencida,
               (t.due_at IS NOT NULL AND t.due_at::date = (NOW() AT TIME ZONE 'America/Monterrey')::date) AS vence_hoy
          FROM tasks t
          LEFT JOIN users c ON c.id = t.created_by
         WHERE t.assignee_id = $1 ${soloAbiertas}
         ORDER BY (t.due_at IS NULL), t.due_at ASC, t.priority DESC
         LIMIT 100`, [ctx.userId]);

      const filas = r.rows;
      const cuenta = (f: (x: any) => boolean) => filas.filter(f).length;
      return {
        resumen: {
          total: filas.length,
          abiertas: cuenta((t) => t.status !== 'done'),
          vencidas: cuenta((t) => t.vencida === true),
          vencen_hoy: cuenta((t) => t.vence_hoy === true),
          sin_fecha: cuenta((t) => !t.due_at && t.status !== 'done'),
          completadas: cuenta((t) => t.status === 'done'),
        },
        por_matriz: {
          estrella: cuenta((t) => t.eisenhower === 'estrella' && t.status !== 'done'),
          planear: cuenta((t) => t.eisenhower === 'planear' && t.status !== 'done'),
          delegar: cuenta((t) => t.eisenhower === 'delegar' && t.status !== 'done'),
          eliminar: cuenta((t) => t.eisenhower === 'eliminar' && t.status !== 'done'),
        },
        tareas: filas.map((t: any) => ({
          id: t.id, titulo: t.title, estado: t.status, matriz: t.eisenhower,
          vence: t.due_at, vencida: t.vencida, vence_hoy: t.vence_hoy,
          creada_por: t.creada_por,
        })),
      };
    }
  },

  // -------------------- CENTRO DE SOPORTE: buscar tickets --------------------
  {
    name: 'search_support_tickets',
    requiredCapability: 'cajito.read.support',
    readOnly: true,
    description: 'Busca/lista tickets del Centro de Soporte. Puedes filtrar por texto (query: folio del ticket, asunto, número de guía, o nombre/casillero/correo del cliente) y/o por status (open_ai, escalated_human, waiting_client, resolved, closed). Sin filtros devuelve los tickets activos más recientes. Devuelve folio, estado, asunto, categoría, cliente, departamento, nº de mensajes, último mensaje y fechas.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar: folio, asunto, guía, o nombre/casillero/correo del cliente (opcional)' },
        status: { type: 'string', description: 'Filtrar por estado: open_ai, escalated_human, waiting_client, resolved, closed (opcional)' },
        include_archived: { type: 'boolean', description: 'Incluir tickets archivados (por defecto false)' }
      }
    },
    handler: async ({ query, status, include_archived }) => {
      const wh: string[] = [];
      const params: any[] = [];
      if (!include_archived) wh.push('t.archived_at IS NULL');
      if (status) { params.push(String(status).trim()); wh.push(`t.status::text = $${params.length}`); }
      const q = String(query || '').trim();
      if (q) {
        params.push(`%${q}%`);
        const p = `$${params.length}`;
        wh.push(`(t.ticket_folio ILIKE ${p} OR t.subject ILIKE ${p} OR t.tracking_number ILIKE ${p}
                  OR u.full_name ILIKE ${p} OR u.email ILIKE ${p} OR u.box_id ILIKE ${p})`);
      }
      params.push(MAX_ROWS);
      const r = await pool.query(
        `SELECT t.ticket_folio, t.status, t.subject, t.category, t.tracking_number,
                t.creator_type, t.created_at, t.updated_at,
                u.full_name AS cliente, u.box_id AS casillero, u.email AS cliente_email,
                d.name AS departamento,
                (SELECT COUNT(*)::int FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS mensajes,
                (SELECT tm.message FROM ticket_messages tm WHERE tm.ticket_id = t.id ORDER BY tm.created_at DESC LIMIT 1) AS ultimo_mensaje
           FROM support_tickets t
           LEFT JOIN users u ON t.user_id = u.id
           LEFT JOIN support_departments d ON t.department_id = d.id
          ${wh.length ? 'WHERE ' + wh.join(' AND ') : ''}
          ORDER BY t.updated_at DESC NULLS LAST
          LIMIT $${params.length}`,
        params
      ).catch((e: any) => ({ rows: [], _err: String(e?.message || e) } as any));
      return { count: r.rows.length, tickets: r.rows };
    }
  },

  // -------------------- CENTRO DE SOPORTE: hilo de un ticket --------------------
  {
    name: 'get_ticket_thread',
    requiredCapability: 'cajito.read.support',
    readOnly: true,
    description: 'Devuelve el hilo COMPLETO de un ticket por su folio (p.ej. "TKT-2026-1708") o su id numérico: datos del ticket + todos los mensajes en orden (cliente, IA y agentes), incluyendo notas internas. Úsalo cuando pidan "de qué trata el ticket X", "muéstrame la conversación del ticket X" o el detalle/historial de un ticket.',
    parameters: {
      type: 'object',
      properties: {
        ticket: { type: 'string', description: 'Folio del ticket (TDX-…) o id numérico' }
      },
      required: ['ticket']
    },
    handler: async ({ ticket }) => {
      const key = String(ticket || '').trim();
      if (!key) return { error: 'ticket vacío' };
      const isNum = /^\d+$/.test(key);
      const head = await pool.query(
        `SELECT t.id, t.ticket_folio, t.status, t.ticket_status, t.subject, t.category, t.tracking_number,
                t.creator_type, t.created_at, t.updated_at, t.resolved_at,
                u.full_name AS cliente, u.box_id AS casillero, u.email AS cliente_email, u.phone AS cliente_telefono,
                d.name AS departamento, ag.full_name AS agente_asignado
           FROM support_tickets t
           LEFT JOIN users u  ON t.user_id = u.id
           LEFT JOIN support_departments d ON t.department_id = d.id
           LEFT JOIN users ag ON t.assigned_to = ag.id
          WHERE ${isNum ? 't.id = $1' : 't.ticket_folio ILIKE $1'}
          LIMIT 1`,
        [isNum ? Number(key) : key]
      );
      if (!head.rows.length) return { found: false };
      const t = head.rows[0];
      const msgs = await pool.query(
        `SELECT sender_type, message, COALESCE(is_internal, FALSE) AS is_internal, created_at
           FROM ticket_messages
          WHERE ticket_id = $1
          ORDER BY created_at ASC
          LIMIT 200`,
        [t.id]
      );
      return { found: true, ticket: t, mensajes: msgs.rows };
    }
  },

  // -------------------- CENTRO DE SOPORTE: desglose agregado (TODOS) --------------------
  {
    name: 'support_tickets_breakdown',
    requiredCapability: 'cajito.read.support',
    readOnly: true,
    description: 'Desglose AGREGADO (conteos) de tickets sobre TODA la base — no una muestra de 25. Agrupa por categoría, estado o departamento, con filtros opcionales de estado y archivado. Úsalo SIEMPRE que pidan "de TODOS los tickets resueltos/archivados", totales/porcentajes por categoría, o cualquier análisis global. NO uses search_support_tickets (que solo devuelve 25) para totales.',
    parameters: {
      type: 'object',
      properties: {
        group_by: { type: 'string', description: "Agrupar por: 'category' (default), 'status' o 'department'" },
        status: { type: 'string', description: 'Filtrar por estado: open_ai, escalated_human, waiting_client, resolved, closed (opcional)' },
        archived: { type: 'string', description: "'true' = solo archivados, 'false' = solo no archivados, 'all' = ambos (default 'all')" }
      }
    },
    handler: async ({ group_by, status, archived }) => {
      const wh: string[] = [];
      const params: any[] = [];
      if (status) { params.push(String(status).trim()); wh.push(`t.status::text = $${params.length}`); }
      const arch = String(archived || 'all').toLowerCase();
      if (arch === 'true') wh.push('t.archived_at IS NOT NULL');
      else if (arch === 'false') wh.push('t.archived_at IS NULL');
      const whereSql = wh.length ? 'WHERE ' + wh.join(' AND ') : '';
      const gbKey = String(group_by || 'category').toLowerCase();
      let sql: string;
      if (gbKey === 'department') {
        sql = `SELECT COALESCE(d.name, '(sin departamento)') AS grupo, COUNT(*)::int AS total
                 FROM support_tickets t LEFT JOIN support_departments d ON d.id = t.department_id
                 ${whereSql} GROUP BY 1 ORDER BY 2 DESC`;
      } else if (gbKey === 'status') {
        sql = `SELECT COALESCE(NULLIF(TRIM(t.status::text), ''), '(sin estado)') AS grupo, COUNT(*)::int AS total
                 FROM support_tickets t ${whereSql} GROUP BY 1 ORDER BY 2 DESC`;
      } else {
        sql = `SELECT COALESCE(NULLIF(TRIM(t.category::text), ''), '(sin categoría)') AS grupo, COUNT(*)::int AS total
                 FROM support_tickets t ${whereSql} GROUP BY 1 ORDER BY 2 DESC`;
      }
      const r = await pool.query(sql, params).catch((e: any) => ({ rows: [], _err: String(e?.message || e) } as any));
      const total = r.rows.reduce((s: number, x: any) => s + (x.total || 0), 0);
      return { agrupado_por: gbKey === 'department' ? 'department' : gbKey, total, grupos: r.rows };
    }
  },

  // -------------------- CENTRAL DE LEADS: KPIs --------------------
  {
    name: 'leads_stats',
    requiredCapability: 'cajito.read.leads',
    readOnly: true,
    description: 'Estadísticas de la Central de Leads (CRM/funnel de captación). Devuelve cuántos leads hay en cada etapa: prospected (prospectados, ya se registraron), waiting (en espera de asignación de asesor), assigned (con asesor asignado), contacted (contactados), converted (convertidos/recuperados). Úsalo cuando pregunten cuántos leads/prospectos hay, el estado del funnel, o cuántos convertidos.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const { stats } = await fetchLeads({});
      // Omitimos "pending" (esos son Prospectos Externos sin reclamar, fuera del funnel).
      const { pending: _omit, ...funnel } = stats as any;
      return { funnel };
    }
  },

  // -------------------- CENTRAL DE LEADS: buscar leads --------------------
  {
    name: 'search_leads',
    requiredCapability: 'cajito.read.leads',
    readOnly: true,
    description: 'Busca/lista leads de la Central de Leads (CRM). Con query busca en TODO el funnel por nombre, casillero (S####), teléfono, correo o asesor. Con status filtra por etapa: prospected, waiting, assigned, contacted, converted. Sin filtros devuelve los leads más recientes. Devuelve nombre, casillero, teléfono, correo, etapa, fuente y asesor asignado.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar: nombre, casillero (S####), teléfono, correo o asesor (opcional)' },
        status: { type: 'string', description: 'Filtrar por etapa: prospected, waiting, assigned, contacted, converted (opcional)' }
      }
    },
    handler: async ({ query, status }) => {
      const { leads } = await fetchLeads({ search: query, status });
      const trimmed = leads.slice(0, MAX_ROWS).map((r: any) => ({
        nombre: r.full_name,
        casillero: r.box_id,
        telefono: r.phone,
        correo: r.email,
        etapa: r.status,
        fuente: r.source,          // crm | chartback | prospect
        asesor: r.assigned_advisor_name,
        creado: r.created_at
      }));
      return { count: leads.length, mostrando: trimmed.length, leads: trimmed };
    }
  }
];

// --- System prompt ----------------------------------------------------------
function buildSystemPrompt(user: { userId: number; role: string; full_name?: string }, caps: Set<string>): string {
  const capList = caps.has('*') ? '(todas)' : Array.from(caps).filter(c => c.startsWith('cajito.read.')).join(', ') || '(ninguna de lectura)';
  return [
    'Eres Cajito, asistente IA operativo de EntregaX (paquetería).',
    'Responde SIEMPRE en español, con tono cordial y directo. Sin emojis salvo en saludos cortos.',
    'MODO ESTRICTO SOLO LECTURA: NO puedes escribir, crear, editar, eliminar, notificar, ni ejecutar acciones que modifiquen datos. Todas las herramientas disponibles son de consulta.',
    'Si el usuario pide una acción de escritura (modificar guías, aplicar descuentos, enviar mensajes, cambiar status, aprobar/rechazar, asignar, cancelar, condonar, etc.), NIÉGATE educadamente y dile que debe hacerlo desde el módulo correspondiente del panel administrativo. NO intentes invocar ninguna herramienta para ese fin.',
    'El sistema bloquea a nivel de runtime cualquier herramienta que no esté marcada como readOnly — así que aunque lo intentes, será rechazada.',
    'Cuando necesites datos del sistema, USA las herramientas disponibles. NO inventes trackings, montos ni nombres.',
    'CONOCIMIENTO / PROCEDIMIENTOS: para preguntas de "cómo hago X", "dónde configuro/encuentro Y", pasos o políticas internas, USA SIEMPRE PRIMERO la herramienta search_knowledge. Si devuelve resultados, responde basándote SOLO en ellos. Si NO hay resultados, di claramente que no tienes esa información documentada y NO inventes pasos ni rutas del panel.',
    'Si una herramienta devuelve resultados, formatea la respuesta de forma corta y útil (lista breve o tabla en texto). Cita IDs/trackings textuales.',
    // La burbuja del chat pinta TEXTO PLANO (whiteSpace: pre-wrap), no interpreta
    // markdown: los ** y los backticks salen literales y la respuesta se lee
    // llena de signos. Se pide texto plano en vez de agregarle un renderizador.
    'EFICIENCIA: no abras un hilo por cada ticket. Si te piden revisar varios, usa primero search_support_tickets, que ya trae estado, categoría y asunto de todos, y abre get_ticket_thread SOLO para los dos o tres que de verdad necesites leer a fondo. Encadenar una consulta por ticket agota tus intentos y te quedas sin poder responder.',
    'FORMATO: escribe en TEXTO PLANO. NADA de markdown: no uses ** para negritas, ni ` para código, ni # para títulos, ni tablas con |. Para enumerar usa un guion y un espacio al inicio del renglón, y separa bloques con un salto de línea. Si quieres resaltar una etiqueta, escríbela seguida de dos puntos (por ejemplo "Estado: escalado a humano"). La pantalla no interpreta esos signos y salen tal cual, llenando la respuesta de basura.',
    'Si el usuario te pregunta algo fuera de operaciones de paquetería, responde brevemente y vuelve al tema operativo.',
    // Un folio suelto, sin pregunta alrededor, es la forma más natural de
    // preguntar "¿qué pasó con esto?". Antes Cajito no sabía qué hacer con eso
    // y lo mandaba a la lista de dudas (CJD-2026-0001, "TKT-2026-2180").
    'FOLIO SUELTO: si el mensaje es sólo un código, sin pregunta alrededor, reconoce de qué es y actúa. TKT-AAAA-NNNN = ticket de soporte; UW-/RO-/PP- = orden de pago; CEX- = cargo extra; XP + dígitos = operación X-Pay; JJD… o 10 dígitos = guía DHL; TDX- = guía TDI Express; US-/S seguido de dígitos = casillero de cliente.',
    'Con un folio de TICKET (TKT-…), búscalo con search_support_tickets y, si hace falta el detalle, get_ticket_thread. Responde con su estatus, categoría, de qué trata y quién lo atiende. Añade siempre dónde abrirlo: Centro de Soporte → Tickets, buscando el folio.',
    'Si NO tienes la herramienta de tickets disponible (por permisos), NO te quedes callado ni digas sólo que no puedes: explica que eso es un folio de ticket y que puede consultarlo en Centro de Soporte → Tickets buscando el folio, o rastrear la guía en el módulo de rastreo. Dile también que puede pedir el permiso de tickets para Cajito si lo necesita seguido.',
    'Con cualquier otro folio, usa la herramienta que corresponda (lookup_package para guías) y di dónde verlo en el panel. Nunca respondas "no sé" a un código sin antes intentar identificarlo.',
    '',
    '=== MODELO DE DATOS ===',
    '"Paquetes" o "cajas": tabla packages. Servicios: POBOX_USA (Po Box USA), AIR_CHN_MX (aéreo China→México), SEA_CHN_MX (marítimo China→México), AA_DHL (DHL nacional).',
    'Estados de paquetes: pending (pendiente), received (recibido en almacén origen), in_transit (en tránsito), in_cedis (en CEDIS/almacén local), out_for_delivery (en ruta de entrega), delivered (entregado), cancelled (cancelado).',
    '"Contenedores": tabla containers, son los contenedores marítimos que agrupan envíos SEA_CHN_MX.',
    'Estados de contenedores: received_origin (recibido en China), consolidated (consolidado), in_transit (zarpó, en camino), arrived_port (llegó al puerto MX), customs_cleared (aduana liberada), in_transit_clientfinal (en camino al cliente final), delivered (entregado).',
    'Para preguntas sobre cajas/paquetes pendientes o en tránsito → usa packages_pending_counts o package_status_counts.',
    'Para preguntas sobre contenedores marítimos → usa container_status_counts.',
    '',
    '=== CENTRO DE SOPORTE (tickets) ===',
    'El Centro de Soporte maneja "tickets" (tabla support_tickets) con mensajes (ticket_messages) y departamentos (support_departments).',
    'Estados de ticket: open_ai (la IA lo está atendiendo), escalated_human (escalado a un agente humano), waiting_client (esperando respuesta del cliente), resolved (resuelto), closed (cerrado). Cada ticket tiene folio (p.ej. TKT-2026-1708), asunto, categoría, cliente, departamento y a veces un número de guía.',
    'Para "cuántos tickets hay / abiertos / pendientes / estado del soporte" → usa support_tickets_stats.',
    'Para buscar o listar tickets (por folio, asunto, guía, cliente o estado) → usa search_support_tickets.',
    'Para el detalle/conversación de un ticket concreto → usa get_ticket_thread con el folio o id.',
    'IMPORTANTE: search_support_tickets devuelve solo una MUESTRA (máx 25). Para "de TODOS", totales o % por categoría/estado/departamento sobre toda la base → usa support_tickets_breakdown (conteos exactos, sin muestra). Nunca infieras totales a partir de la muestra de 25.',
    '',
    '=== CENTRAL DE LEADS (CRM / captación) ===',
    'La Central de Leads es el funnel de captación de clientes. Etapas: prospected (prospectados, ya se registraron), waiting (en espera de asignación de asesor), assigned (con asesor asignado), contacted (contactados por el asesor), converted (convertidos/recuperados). Cada lead tiene nombre, casillero, teléfono, correo, asesor asignado y una fuente (crm=solicitó asesor en la app, chartback=reactivación de cliente legacy, prospect=prospecto externo registrado).',
    'Para "cuántos leads/prospectos hay / estado del funnel / cuántos convertidos" → usa leads_stats.',
    'Para buscar o listar leads (por nombre, casillero, teléfono, correo, asesor o etapa) → usa search_leads.',
    '',
    `Usuario actual: id=${user.userId}, rol=${user.role}${user.full_name ? `, nombre=${user.full_name}` : ''}.`,
    `Capacidades concedidas: ${capList}.`
  ].join('\n');
}

// --- Build tools array (proveedor-agnóstico) según capacidades del usuario --
function toolsForUser(caps: Set<string>) {
  return TOOLS
    .filter(t => hasCap(caps, t.requiredCapability))
    .map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
}

// --- Persistir mensajes ------------------------------------------------------
async function saveMessage(conversationId: number, opts: {
  role: string; content?: string | null;
  toolName?: string | null; toolArgs?: any; toolResult?: any;
  tokensIn?: number; tokensOut?: number;
}) {
  await pool.query(
    `INSERT INTO cajito_messages (conversation_id, role, content, tool_name, tool_args, tool_result, tokens_in, tokens_out)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      conversationId,
      opts.role,
      opts.content ?? null,
      opts.toolName ?? null,
      opts.toolArgs ? JSON.stringify(opts.toolArgs) : null,
      opts.toolResult ? JSON.stringify(opts.toolResult) : null,
      opts.tokensIn ?? null,
      opts.tokensOut ?? null
    ]
  );
}

// ============================================================
// POST /api/cajito/chat
// Body: { conversationId?: number, message: string }
// Resp: { conversationId, reply, toolCalls: [{name,args,resultPreview}] }
// ============================================================
/**
 * INVESTIGAR UN TICKET.
 *
 * Encoda el proceso que sigue un humano al revisar un ticket: leer el hilo,
 * sacar los folios que menciona, buscarlos en el sistema, comparar lo que dice
 * el ticket contra lo que dicen los datos, y concluir si es error nuestro,
 * captura faltante o algo que ya está bien.
 *
 * Cajito NO corrige nada: investiga y reporta. La corrección es de quien tenga
 * permiso, y por eso este endpoint solo lee.
 *
 * Si no supo investigarlo, se registra como duda para enseñarle y se le dice al
 * usuario que vuelva en 24 horas — es la misma promesa que ya hace el chat.
 */
export const investigarTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticketId = Number(req.params.id);
    const userId = req.user?.userId || (req.user as any)?.id;
    if (!Number.isFinite(ticketId)) { res.status(400).json({ error: 'ticket inválido' }); return; }

    const caps = await getUserCapabilities(userId, String(req.user?.role || ''));
    if (!hasCap(caps, 'cajito.access')) { res.status(403).json({ error: 'Sin acceso a Cajito' }); return; }

    const t = await pool.query(
      `SELECT t.id, t.ticket_folio, t.status, t.category, t.subject, t.creator_type,
              u.box_id, u.full_name AS cliente
         FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = $1`, [ticketId]);
    const tk = t.rows[0];
    if (!tk) { res.status(404).json({ error: 'Ticket no encontrado' }); return; }

    const msgs = await pool.query(
      `SELECT sender_type, message, created_at, attachments, attachment_url FROM ticket_messages
        WHERE ticket_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 40`, [ticketId]);
    // Los adjuntos importan: en el TKT-2026-2597 el asesor decía haber anexado
    // capturas y Cajito no las veía, así que no podía saber si existían. No
    // puede LEER una imagen, pero saber que está y cómo se llama le permite
    // decir "el asesor sí adjuntó evidencia" en vez de darla por ausente.
    const hilo = msgs.rows
      .map((m: any) => {
        const adj = [
          ...(Array.isArray(m.attachments) ? m.attachments : []),
          ...(m.attachment_url ? [{ name: String(m.attachment_url).split('/').pop() }] : []),
        ];
        const nota = adj.length
          ? ` [adjuntó ${adj.length} archivo(s): ${adj.map((a: any) => a?.name || a?.filename || 'archivo').join(', ')}]`
          : '';
        return `[${m.sender_type}] ${String(m.message || '').slice(0, 800)}${nota}`;
      })
      .join('\n');

    // El proceso, escrito como instrucción. Es el mismo que sigue una persona.
    const sistema = [
      'Eres Cajito investigando un ticket de soporte de EntregaX. Responde SIEMPRE en español y en TEXTO PLANO (sin ** ni backticks).',
      'NO PUEDES CORREGIR NADA. Solo investigas y reportas: la corrección la hace una persona. No prometas arreglar ni digas que ya lo arreglaste.',
      '',
      'SIGUE ESTE PROCESO, EN ORDEN:',
      '1. Lee el hilo completo y di en una línea qué se está reclamando.',
      '2. Saca TODOS los folios y códigos que menciona: guías (US-, TDX-, JJD, 10 dígitos), órdenes (UW-, RO-, PP-, CEX-), operaciones X-Pay (XP), casilleros.',
      '3. Búscalos con tus herramientas. No te quedes con lo que dice el ticket: compáralo contra lo que dicen los datos.',
      '4. Di si lo que reclama el usuario CUADRA o NO con el sistema, y con qué números.',
      '5. Concluye en una de estas CINCO:',
      '   (a) ERROR_SISTEMA — el sistema hizo algo mal y hay que repararlo.',
      '   (b) CAPTURA — un dato quedó mal y hay que corregirlo.',
      '   (c) ACOMPANAR — no hay nada roto que reparar: el caso está en curso o depende de un tercero (aduana, la paquetería, el proveedor) y lo que hace falta es que Servicio a Cliente CONTENGA al cliente: hablarle, explicarle en qué va y darle seguimiento. Una guía detenida en aduana desde hace semanas es esto, no un error de código.',
      '   (d) CORRECTO — el sistema está bien y sólo hay que explicárselo.',
      '   (e) NO_PUDE — no alcanzo a determinarlo.',
      'No confundas (a) con (c): que algo lleve semanas sin resolverse NO lo vuelve un error del sistema. Pregúntate si hay algo que reparar en el software; si no lo hay, es acompañamiento.',
      'Cuando concluyas ACOMPANAR, di en la explicación QUÉ debería decirle Servicio a Cliente al cliente, en dos o tres líneas, con los datos que encontraste.',
      'OJO con (b): SIEMPRE que haga falta corregir un dato hay que levantarlo con nosotros. No es "culpa de quien capturó" ni algo que se arregla y ya: si el dato quedó mal, hay que revisar CÓMO permitió el sistema que quedara así y repararlo de raíz. Un dato mal capturado casi siempre es una validación que falta.',
      'Por eso, cuando concluyas (b), incluye en la explicación qué habría que revisar para que no vuelva a pasar — qué pantalla o qué paso lo dejó entrar.',
      '',
      'REGLAS:',
      '- Cita SIEMPRE los números que encontraste. Sin cifras concretas la conclusión no sirve.',
      '- Si te falta una herramienta o un dato para concluir, dilo claramente con la frase "NO PUDE INVESTIGAR" y explica qué te faltó. Es mejor eso que inventar.',
      '- No propongas tocar la base de datos ni dar de alta nada: eso lo decide una persona.',
      '- En el hilo verás cuándo alguien adjuntó archivos. NO puedes abrirlos, pero SÍ debes tomarlos en cuenta: si el asesor anexó evidencia, dilo, y no concluyas que no la mandó.',
      '',
      '',
      'RESPONDE SOLO CON UN JSON, sin texto antes ni después, sin markdown. Este formato exacto:',
      '{',
      '  "reclamo": "una línea: qué se está reclamando",',
      '  "folios": ["RO-65105F71", "US-1563322842", "S20"],',
      '  "hallazgos": [{"dato": "Flete nacional cobrado", "valor": "$2,675.00", "cuadra": false, "nota": "las 5 cajas traen guía del cliente"}],',
      '  "conclusion": "ERROR_SISTEMA|CAPTURA|ACOMPANAR|CORRECTO|NO_PUDE",',
      '  "explicacion": "dos o tres líneas, en claro, sin repetir los hallazgos",',
      '  "falto": "sólo si conclusion es NO_PUDE: qué herramienta o dato te faltó"',
      '}',
      'En "hallazgos" pon SOLO lo que verificaste contra el sistema, con su cifra. `cuadra` es true si el dato coincide con lo que dice el ticket y false si no.',
      'Sé BREVE: la pantalla ya le da formato. Nada de introducciones ni de repetir lo que ya dijiste.',
      '',
      'HABLAS CON UNA PERSONA, NO CON UN PROGRAMADOR:',
      '- NADA de nombres de columnas ni de campos. Nunca escribas cosas como "credito_liquidado=false", "is_master", "national_shipping_cost" o "status=paid". Dilo en español: "pagada con crédito, todavía sin liquidar".',
      '- "dato" es una etiqueta corta (2 a 5 palabras). "valor" es la CIFRA o el dato concreto, corto. El contexto va en "nota".',
      '- Ejemplo bueno: dato "Flete nacional cobrado", valor "$2,675.00", nota "las 5 cajas traen guía del propio cliente".',
      '- Ejemplo malo: valor "$6,098.15 MXN, pagada con crédito, credito_liquidado=false, cliente S20 Jorge Chavez Gastelum".',
      '',
      'SI ES FALLA NUESTRA, DILO EN DINERO. No basta con "hay una inconsistencia": di qué le está pasando al cliente. Si se cobró algo que no debía, escribe cuánto se le está cobrando de más. Esa es la frase que hace que alguien actúe.',
    ].join('\n');

    // Quién escribe importa: un ticket levantado por un EMPLEADO lo escribe el
    // asesor a nombre de su cliente, aunque los mensajes vengan marcados como
    // 'client'. Sin decírselo, Cajito reportaba como inconsistencia que el
    // nombre del casillero no fuera el de quien escribe — y no lo es.
    // 'employee' y 'advisor': los dos son personal nuestro escribiendo a nombre
    // del cliente. Solo 'client' es el cliente de verdad.
    const loLevantoEmpleado = ['employee', 'advisor'].includes(String(tk.creator_type || ''));
    const contexto = [
      `Ticket ${tk.ticket_folio} · estado ${tk.status} · categoría ${tk.category}`,
      loLevantoEmpleado
        ? `QUIÉN LO LEVANTÓ: un ASESOR de EntregaX, a nombre de su cliente. Los mensajes marcados como "client" en el hilo los escribió el ASESOR, no el dueño del casillero. Que el nombre de quien escribe no coincida con el titular del casillero es NORMAL: NO lo reportes como hallazgo ni como algo que aclarar.`
        : `QUIÉN LO LEVANTÓ: el propio cliente.`,
      `Casillero del que se habla: ${tk.box_id || 'sin casillero'} · titular: ${tk.cliente || '—'}`,
      '',
      'Hilo:',
      hilo || '(sin mensajes)',
    ].join('\n');

    const tools = toolsForUser(caps);
    const provider = getLlmProvider();
    const messages: LlmMessage[] = [{ role: 'user', content: contexto }];

    let texto = '';
    for (let iter = 0; iter < 8; iter++) {
      const c = await provider.complete({ system: sistema, messages, ...(tools.length ? { tools } : {}), maxTokens: MAX_TOKENS });
      if (c.toolCalls.length > 0) {
        const bloques: LlmContentBlock[] = [];
        if (c.text) bloques.push({ type: 'text', text: c.text });
        for (const tc of c.toolCalls) bloques.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        messages.push({ role: 'assistant', content: bloques });
        const results: LlmContentBlock[] = [];
        for (const tc of c.toolCalls) {
          const def = TOOLS.find(x => x.name === tc.name);
          let r: any;
          try {
            r = def && hasCap(caps, def.requiredCapability)
              ? await def.handler(tc.input || {}, { userId: Number(userId) || 0, role: String(req.user?.role || '') })
              : { error: 'Sin permiso o herramienta desconocida' };
          } catch (e: any) { r = { error: e?.message || 'falló la consulta' }; }
          results.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(r).slice(0, 6000) });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      texto = c.text || '';
      break;
    }
    // Cierre forzado: si se acabaron las vueltas pidiendo datos, que conteste
    // con lo que reunió en vez de devolver vacío.
    if (!texto) {
      const c = await provider.complete({
        system: sistema + '\n\nYA NO PUEDES USAR HERRAMIENTAS. Concluye con lo que reuniste.',
        messages, maxTokens: MAX_TOKENS,
      });
      texto = c.text || '';
    }

    // Se pide JSON, pero el modelo a veces lo envuelve en texto o en un bloque
    // de código: se rescata el objeto en vez de tirar toda la investigación.
    let datos: any = null;
    try {
      const bruto = String(texto || '');
      const ini = bruto.indexOf('{');
      const fin = bruto.lastIndexOf('}');
      if (ini >= 0 && fin > ini) datos = JSON.parse(bruto.slice(ini, fin + 1));
    } catch { datos = null; }

    const conclusion = String(datos?.conclusion || 'NO_PUDE').toUpperCase();
    const pudo = conclusion !== 'NO_PUDE';
    // Si no vino JSON, se devuelve el texto crudo para no perder el trabajo.
    const hallazgo = datos ? '' : String(texto || '').trim();

    // No supo: se registra como duda para enseñarle, igual que en el chat, y se
    // devuelve el folio CJD para poder decírselo a quien preguntó. Sin el
    // número, "quedó registrado" suena a promesa vacía y nadie puede darle
    // seguimiento.
    let folioDuda: string | null = null;
    if (!pudo) {
      const hueco = await registrarHueco({
        conversationId: null, userId: Number(userId) || 0,
        pregunta: `Investigar ticket ${tk.ticket_folio}`,
        motivo: 'no_pudo',
        detalle: String(datos?.falto || datos?.explicacion || hallazgo || '').slice(0, 1000),
      }).catch(() => null);
      folioDuda = hueco?.folio || null;
      // La TAREA se crea aquí, no dentro de registrarHueco: esa función solo
      // guarda la fila. Sin esta llamada la duda quedaba registrada pero nadie
      // se enteraba —pasó con CJD-2026-0004 y 0005, que no generaron tarea— y
      // la promesa de las 24 horas no tenía a nadie detrás.
      if (hueco?.nueva) {
        avisarDudaASuperAdmins(
          hueco.id, `Investigar ticket ${tk.ticket_folio}`, Number(userId) || 0, hueco.folio, 'no_pudo'
        ).catch(() => {});
      }
    }

    res.json({
      ok: true,
      folio: tk.ticket_folio,
      conclusion,
      pudo,
      es_error_sistema: conclusion === 'ERROR_SISTEMA',
      reclamo: datos?.reclamo || '',
      folios: Array.isArray(datos?.folios) ? datos.folios : [],
      hallazgos: Array.isArray(datos?.hallazgos) ? datos.hallazgos : [],
      explicacion: datos?.explicacion || '',
      falto: datos?.falto || '',
      folio_duda: folioDuda,
      hallazgo,   // sólo si el modelo no devolvió JSON
    });
  } catch (e: any) {
    console.error('[cajito] investigarTicket:', e);
    res.status(500).json({ error: 'No se pudo investigar el ticket' });
  }
};

export const chat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId || !role) { res.status(401).json({ error: 'No autenticado' }); return; }

    // Toggle global
    const tg = await pool.query(
      `SELECT config_value FROM system_configurations WHERE config_key = 'cajito_enabled' LIMIT 1`
    );
    const enabled = tg.rows[0]?.config_value?.enabled === true;
    if (!enabled) { res.status(403).json({ error: 'Cajito está deshabilitado' }); return; }

    const caps = await getUserCapabilities(userId, role);
    if (!hasCap(caps, 'cajito.access')) {
      res.status(403).json({ error: 'No tienes acceso a Cajito. Pide a un administrador que te conceda la capacidad cajito.access.' });
      return;
    }

    const message: string = (req.body?.message || '').toString().trim();
    if (!message) { res.status(400).json({ error: 'Mensaje vacío' }); return; }
    if (message.length > 4000) { res.status(400).json({ error: 'Mensaje demasiado largo (máx 4000)' }); return; }

    let conversationId: number | null = parseInt(req.body?.conversationId, 10);
    if (!Number.isFinite(conversationId) || conversationId! <= 0) conversationId = null;

    // Validar propietario si reusa conversación
    if (conversationId) {
      const own = await pool.query(
        `SELECT user_id FROM cajito_conversations WHERE id = $1`, [conversationId]
      );
      if (!own.rows.length || own.rows[0].user_id !== userId) {
        res.status(403).json({ error: 'Conversación no encontrada o no autorizada' }); return;
      }
    } else {
      const created = await pool.query(
        `INSERT INTO cajito_conversations (user_id, title, model) VALUES ($1, $2, $3) RETURNING id`,
        [userId, trimText(message, 80), getModelName()]
      );
      conversationId = created.rows[0].id;
    }

    // Cargar usuario (para system prompt)
    const u = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [userId]);
    let systemPrompt = buildSystemPrompt({ userId, role, full_name: u.rows[0]?.full_name }, caps);

    // Inyectar los TEMAS documentados en la base de conocimiento. Así el modelo
    // sabe con certeza qué SÍ está documentado y deja de inventar procedimientos
    // de temas que NO existen en la base.
    try {
      const kb = await pool.query(`SELECT title FROM cajito_knowledge WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT 200`);
      if (kb.rows.length > 0) {
        systemPrompt += '\n\n=== TEMAS EN TU BASE DE CONOCIMIENTO (procedimientos documentados) ===\n'
          + kb.rows.map((k: any) => `- ${k.title}`).join('\n')
          + '\n\nPara preguntas de "cómo/dónde hago X" o procedimientos: si el tema coincide con uno de arriba, LLAMA a search_knowledge y responde SOLO con lo que devuelva. Si el tema NO está en esta lista, di textualmente que no tienes ese procedimiento documentado y que un administrador debe registrarlo — NUNCA inventes pasos, rutas del panel ni nombres de botones.';
      } else {
        systemPrompt += '\n\n=== BASE DE CONOCIMIENTO VACÍA ===\nNo hay procedimientos documentados. Para preguntas de "cómo/dónde hago X" di que no tienes esa información documentada y NO inventes pasos, rutas del panel ni nombres de botones.';
      }
    } catch { /* si falla, seguimos sin la inyección */ }

    // Cargar historial reciente (últimos 20 mensajes user/assistant) para contexto
    const hist = await pool.query(
      `SELECT role, content, tool_name, tool_args, tool_result
         FROM cajito_messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [conversationId]
    );
    const historyMsgs = hist.rows.reverse()
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content || '' }));

    // Guardar el mensaje del usuario
    await saveMessage(conversationId!, { role: 'user', content: message });

    // Construir mensajes en formato proveedor-agnóstico
    const messages: LlmMessage[] = [
      ...historyMsgs.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content as string })),
      { role: 'user' as const, content: message },
    ];

    const tools = toolsForUser(caps);
    const provider = getLlmProvider();

    const toolCallsLog: { name: string; args: any; resultPreview: any }[] = [];
    let finalReply = '';
    // Señales de "no supe" recogidas durante las llamadas a herramientas.
    const senales: { motivo: string; detalle?: string; tool?: string }[] = [];
    let usoHerramientas = false;
    let totalIn = 0, totalOut = 0;

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const completion = await provider.complete({
        system: systemPrompt,
        messages,
        ...(tools.length ? { tools } : {}),
        maxTokens: MAX_TOKENS,
      });

      totalIn += completion.usage.inputTokens;
      totalOut += completion.usage.outputTokens;

      // ¿El modelo pidió herramientas?
      if (completion.toolCalls.length > 0) {
        // Append assistant turn (texto + tool_use blocks) — formato común
        const assistantBlocks: LlmContentBlock[] = [];
        if (completion.text) assistantBlocks.push({ type: 'text', text: completion.text });
        for (const tc of completion.toolCalls) {
          assistantBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        messages.push({ role: 'assistant', content: assistantBlocks });

        // Ejecutar cada tool y appendear resultados como user/tool_result
        const toolResultBlocks: LlmContentBlock[] = [];
        usoHerramientas = true;
        for (const tc of completion.toolCalls) {
          const toolDef = TOOLS.find(t => t.name === tc.name);
          const parsedArgs = tc.input || {};

          let result: any;
          if (!toolDef) {
            result = { error: `Herramienta desconocida: ${tc.name}` };
          } else if (toolDef.readOnly !== true) {
            // Guard duro: nunca ejecutar tools de escritura. Si alguien
            // llega a agregar un tool sin readOnly:true, se bloquea aquí.
            result = { error: `Herramienta rechazada: '${tc.name}' no es de solo-lectura. Cajito está restringido a lectura.` };
          } else if (!hasCap(caps, toolDef.requiredCapability)) {
            result = { error: `Sin capacidad ${toolDef.requiredCapability}` };
          } else {
            try {
              result = await toolDef.handler(parsedArgs, { userId, role });
            } catch (err: any) {
              result = { error: String(err?.message || err) };
            }
          }

          // ¿Esta llamada dejó ver un hueco? Se anota la señal y al final del
          // turno se registra una sola: interesa la pregunta que quedó sin
          // resolver, no cada tropiezo intermedio.
          if (tc.name === 'search_knowledge' && Array.isArray(result?.results) && result.results.length === 0) {
            // La más precisa de todas: preguntaron un procedimiento y la base
            // de conocimiento no tenía nada.
            senales.push({ motivo: 'sin_conocimiento', detalle: String(parsedArgs?.query || ''), tool: tc.name });
          } else if (typeof result?.error === 'string' && result.error.startsWith('Sin capacidad')) {
            senales.push({ motivo: 'sin_permiso', detalle: result.error, tool: tc.name });
          }

          // Persistir auditoría de tool-call
          await saveMessage(conversationId!, {
            role: 'tool',
            content: null,
            toolName: tc.name,
            toolArgs: parsedArgs,
            toolResult: result,
          });
          toolCallsLog.push({
            name: tc.name,
            args: parsedArgs,
            resultPreview: typeof result === 'object' ? Object.keys(result).slice(0, 5) : result,
          });

          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify(result).slice(0, 8000), // cap por seguridad
          });
        }
        messages.push({ role: 'user', content: toolResultBlocks });
        continue; // siguiente iteración
      }

      // No hubo tool-calls → respuesta final
      finalReply = completion.text || '';
      break;
    }

    // 🔚 Cierre forzado. Si en la última vuelta el modelo TODAVÍA pedía
    // herramientas, el ciclo salía sin texto y el usuario veía "(Cajito no
    // generó respuesta)": se tiraba todo lo ya consultado. Pasa al revisar
    // tickets, donde encadena un get_ticket_thread por cada uno y se le acaban
    // las vueltas. Ahora se le pide UNA respuesta final SIN herramientas, para
    // que conteste con lo que alcanzó a reunir.
    if (!finalReply && usoHerramientas) {
      try {
        const cierre = await provider.complete({
          system: systemPrompt +
            '\n\nYA NO PUEDES USAR HERRAMIENTAS. Responde AHORA con la información que ya reuniste. ' +
            'Si te faltó revisar algo, dilo en una línea al final ("no alcancé a revisar X") en vez de callarlo. ' +
            'No pidas más datos ni prometas seguir buscando.',
          messages,
          maxTokens: MAX_TOKENS,
        });
        totalIn += cierre.usage.inputTokens;
        totalOut += cierre.usage.outputTokens;
        finalReply = cierre.text || '';
      } catch (e: any) {
        console.warn('[cajito] cierre forzado:', e?.message);
      }
    }

    if (!finalReply) {
      finalReply = usoHerramientas
        ? 'Reuní la información pero no alcancé a resumirla. Vuelve a preguntarme acotando un poco —por ejemplo, un solo folio o un rango de fechas— y te respondo.'
        : 'No pude responder eso. Intenta preguntarlo de otra forma o con más detalle.';
    }

    // ── Bitácora de aprendizaje ──
    // La señal más fiable es que search_knowledge no encontró nada: alguien
    // preguntó un procedimiento y no está documentado. Si no hubo señal de
    // herramienta, se mira si la propia respuesta admite que no pudo — eso
    // cubre las preguntas que el modelo ni siquiera intentó resolver.
    const senalPrincipal = senales.find(x => x.motivo === 'sin_conocimiento') || senales[0];
    let hueco: { nueva: boolean; veces: number; folio: string; id: number } | null = null;
    if (senalPrincipal) {
      hueco = await registrarHueco({
        conversationId, userId, pregunta: message,
        motivo: senalPrincipal.motivo as any,
        detalle: senalPrincipal.detalle ?? null, toolName: senalPrincipal.tool ?? null,
        respuesta: finalReply,
      });
    } else {
      const respLower = finalReply.toLowerCase();
      if (FRASES_NO_PUDO.some(f => respLower.includes(f))) {
        hueco = await registrarHueco({
          conversationId, userId, pregunta: message, motivo: 'no_pudo',
          detalle: usoHerramientas ? 'Consultó datos pero no resolvió' : 'No consultó ninguna herramienta',
          respuesta: finalReply,
        });
      }
    }

    if (hueco) {
      // Se le dice al usuario, con folio, que su duda quedó anotada. Sin esto
      // la conversación termina en "no sé" y la persona no tiene forma de
      // saber que alguien la va a atender ni con qué referencia preguntar.
      finalReply += `\n\n---\n📌 **Duda registrada · ${hueco.folio}**\n` +
        `Ya guardé lo que no te pude resolver y avisé al equipo. Lo aprendo antes de 24 horas: ` +
        `vuelve a preguntármelo y ya voy a saber contestarte.` +
        (hueco.veces > 1 ? ` (Es la ${hueco.veces}ª vez que me preguntan esto.)` : '');

      // El aviso al super admin va SOLO la primera vez. Notificar cada
      // repetición convertiría una pregunta popular en spam y se dejarían de
      // leer justo las notificaciones que queremos que se lean.
      if (hueco.nueva) {
        avisarDudaASuperAdmins(
          hueco.id, message, userId, hueco.folio,
          senalPrincipal ? senalPrincipal.motivo : 'no_pudo'
        ).catch(() => {});
      }
    }

    // Guardar respuesta final
    await saveMessage(conversationId!, {
      role: 'assistant',
      content: finalReply,
      tokensIn: totalIn,
      tokensOut: totalOut,
    });
    await pool.query(
      `UPDATE cajito_conversations
          SET last_activity_at = NOW(),
              total_tokens_in = total_tokens_in + $1,
              total_tokens_out = total_tokens_out + $2
        WHERE id = $3`,
      [totalIn, totalOut, conversationId]
    );

    res.json({
      conversationId,
      reply: finalReply,
      toolCalls: toolCallsLog,
      tokensIn: totalIn,
      tokensOut: totalOut,
    });
  } catch (err: any) {
    console.error('[CAJITO-CHAT]', err?.message, err?.stack);
    res.status(500).json({ error: err?.message || 'Error en Cajito' });
  }
};

// GET /api/cajito/conversations — mis conversaciones (más recientes primero)
export const getMyConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'No autenticado' }); return; }
    const r = await pool.query(
      `SELECT id, title, started_at, last_activity_at, total_tokens_in, total_tokens_out, model
         FROM cajito_conversations
        WHERE user_id = $1
        ORDER BY last_activity_at DESC
        LIMIT 50`,
      [userId]
    );
    res.json({ conversations: r.rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error' });
  }
};

// GET /api/cajito/conversations/:id — mensajes de una conversación
export const getConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId) { res.status(401).json({ error: 'No autenticado' }); return; }
    const id = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'id inválido' }); return; }

    const own = await pool.query(`SELECT user_id, title, started_at FROM cajito_conversations WHERE id = $1`, [id]);
    if (!own.rows.length) { res.status(404).json({ error: 'No encontrada' }); return; }
    if (own.rows[0].user_id !== userId && role !== 'super_admin') {
      res.status(403).json({ error: 'No autorizada' }); return;
    }

    const msgs = await pool.query(
      `SELECT id, role, content, tool_name, tool_args, tool_result, created_at
         FROM cajito_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC`,
      [id]
    );
    res.json({ conversation: own.rows[0], messages: msgs.rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error' });
  }
};

// GET /api/admin/cajito/audit — auditoría completa (solo super_admin)
//   Filtros opcionales: ?userId=&since=&until=&limit=
export const getAudit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const role = req.user?.role;
    if (role !== 'super_admin') { res.status(403).json({ error: 'Solo super_admin' }); return; }
    const params: any[] = [];
    const wh: string[] = [];
    if (req.query.userId) { params.push(parseInt(req.query.userId as string, 10)); wh.push(`c.user_id = $${params.length}`); }
    if (req.query.since)  { params.push(req.query.since);  wh.push(`m.created_at >= $${params.length}`); }
    if (req.query.until)  { params.push(req.query.until);  wh.push(`m.created_at <= $${params.length}`); }
    const limit = Math.min(parseInt(((req.query.limit as string) || '200'), 10) || 200, 1000);
    params.push(limit);
    const r = await pool.query(
      `SELECT m.id, m.conversation_id, m.role, m.content, m.tool_name, m.tool_args, m.tool_result,
              m.tokens_in, m.tokens_out, m.created_at,
              c.user_id, u.full_name AS user_name, c.title
         FROM cajito_messages m
         JOIN cajito_conversations c ON m.conversation_id = c.id
         LEFT JOIN users u ON c.user_id = u.id
        ${wh.length ? 'WHERE ' + wh.join(' AND ') : ''}
        ORDER BY m.created_at DESC
        LIMIT $${params.length}`,
      params
    );
    res.json({ count: r.rows.length, messages: r.rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error' });
  }
};

// GET /api/cajito/health — diagnóstico simple (super_admin/admin)
// GET /api/cajito/my-access
// Indica si el usuario actual tiene acceso a Cajito (capacidad cajito.access),
// para que el frontend decida si mostrar el botón flotante — independientemente
// del rol. super_admin siempre tiene acceso.
export const getMyAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId || !role) { res.status(401).json({ error: 'No autenticado' }); return; }
    const caps = await getUserCapabilities(userId, role);
    res.json({ access: hasCap(caps, 'cajito.access'), capabilities: Array.from(caps) });
  } catch (e: any) {
    console.error('getMyAccess:', e);
    res.json({ access: false, capabilities: [] });
  }
};

export const getHealth = async (req: AuthRequest, res: Response): Promise<void> => {
  const role = req.user?.role;
  if (role !== 'super_admin' && role !== 'admin') { res.status(403).json({ error: 'No autorizado' }); return; }
  const hasKey = isProviderKeyConfigured();
  const tg = await pool.query(
    `SELECT config_value FROM system_configurations WHERE config_key = 'cajito_enabled' LIMIT 1`
  ).catch(() => ({ rows: [] as any[] }));
  const enabled = tg.rows[0]?.config_value?.enabled === true;
  res.json({
    enabled,
    apiKeyConfigured: hasKey,
    provider: getProviderName(),
    model: getModelName(),
    modelLabel: getFriendlyModelLabel(),
    toolCount: TOOLS.length,
    readOnly: TOOLS.every(t => t.readOnly === true),
    ready: hasKey && enabled,
  });
};

// ============================================================
// GET /api/cajito/client-lookup?q=<box_id|email|name>
// Devuelve ficha consolidada del cliente:
//   - datos básicos + asesor + casillero
//   - paquetes activos (en tránsito / por entregar)
//   - paquetes recientes entregados (últimos 25)
//   - órdenes de pago (pendientes y pagadas, últimas 50)
//   - últimos movimientos (de paquetes activos)
// Solo lectura. Pensado para el panel "Rastrear" de Cajito.
// ============================================================
export const clientLookup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = String((req.query.q ?? req.query.query ?? '') as string).trim();
    if (!q || q.length < 2) {
      res.status(400).json({ error: 'query muy corto (mín 2)' });
      return;
    }

    // Solicitante (para acotar por asesor). isAdvisorReq → solo sus clientes.
    const reqRole = String((req.user as any)?.role || '').toLowerCase();
    const reqUserId = (req.user as any)?.userId || (req.user as any)?.id;
    const isAdvisorReq = ['advisor', 'sub_advisor'].includes(reqRole);
    const ownedByAdvisor = (row: any): boolean =>
      Number(row?.advisor_id) === Number(reqUserId) || Number(row?.referred_by_id) === Number(reqUserId);

    // --- 1) Resolver al cliente ---------------------------------------
    // Prioridad: box_id exacto > id numérico > email exacto > búsqueda parcial
    const isBoxIdLike = /^[A-Za-z]{0,4}-?\d{1,}$/.test(q);
    const isNumeric = /^\d+$/.test(q);
    const isEmail = /@/.test(q);

    let client: any = null;
    if (isBoxIdLike) {
      const r = await pool.query(
        `SELECT id, full_name, email, phone, box_id, role, advisor_id, referred_by_id, created_at,
                is_verified, verification_status
           FROM users
          WHERE UPPER(TRIM(box_id)) = UPPER(TRIM($1))
          LIMIT 1`,
        [q]
      );
      client = r.rows[0] || null;
    }
    if (!client && isNumeric) {
      const r = await pool.query(
        `SELECT id, full_name, email, phone, box_id, role, advisor_id, referred_by_id, created_at,
                is_verified, verification_status
           FROM users WHERE id = $1 LIMIT 1`,
        [parseInt(q, 10)]
      );
      client = r.rows[0] || null;
    }
    if (!client && isEmail) {
      const r = await pool.query(
        `SELECT id, full_name, email, phone, box_id, role, advisor_id, referred_by_id, created_at,
                is_verified, verification_status
           FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [q]
      );
      client = r.rows[0] || null;
    }
    if (!client) {
      // Búsqueda parcial: si hay UNA sola coincidencia, la devolvemos como cliente; si hay varias, devolvemos sugerencias.
      const like = `%${q}%`;
      const r = await pool.query(
        `SELECT id, full_name, email, phone, box_id, role, advisor_id, referred_by_id, created_at,
                is_verified, verification_status
           FROM users
          WHERE box_id ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1
          ORDER BY (UPPER(box_id) = UPPER($2)) DESC, box_id NULLS LAST
          LIMIT 10`,
        [like, q]
      );
      // Asesor: solo sus clientes entre las coincidencias.
      const rows = isAdvisorReq ? r.rows.filter(ownedByAdvisor) : r.rows;
      if (rows.length === 1) {
        client = rows[0];
      } else if (rows.length > 1) {
        res.json({
          success: true,
          multiple: true,
          query: q,
          suggestions: rows.map(u => ({
            id: u.id,
            box_id: u.box_id,
            full_name: u.full_name,
            email: u.email,
            source: 'users'
          }))
        });
        return;
      }
    }

    // --- 1b) Fallback a legacy_clients (clientes no migrados) -----------
    let isLegacy = false;
    if (!client) {
      // Exacto por box_id en legacy
      if (isBoxIdLike) {
        const r = await pool.query(
          `SELECT lc.id, lc.box_id, lc.full_name, lc.email, lc.phone,
                  lc.asesor, lc.recovery_advisor_id, lc.claimed_by_user_id, lc.is_claimed, lc.created_at
             FROM legacy_clients lc
            WHERE UPPER(TRIM(lc.box_id)) = UPPER(TRIM($1))
            LIMIT 1`,
          [q]
        );
        if (r.rows[0]) {
          client = { ...r.rows[0], role: 'legacy' };
          isLegacy = true;
        }
      }
      if (!client && isEmail) {
        const r = await pool.query(
          `SELECT lc.id, lc.box_id, lc.full_name, lc.email, lc.phone,
                  lc.asesor, lc.recovery_advisor_id, lc.claimed_by_user_id, lc.is_claimed, lc.created_at
             FROM legacy_clients lc
            WHERE LOWER(lc.email) = LOWER($1)
            LIMIT 1`,
          [q]
        );
        if (r.rows[0]) { client = { ...r.rows[0], role: 'legacy' }; isLegacy = true; }
      }
      if (!client) {
        // Parcial en legacy
        const like = `%${q}%`;
        const r = await pool.query(
          `SELECT lc.id, lc.box_id, lc.full_name, lc.email
             FROM legacy_clients lc
            WHERE lc.box_id ILIKE $1 OR lc.full_name ILIKE $1 OR lc.email ILIKE $1
            ORDER BY (UPPER(lc.box_id) = UPPER($2)) DESC, lc.box_id NULLS LAST
            LIMIT 10`,
          [like, q]
        );
        if (r.rows.length === 1) {
          client = { ...r.rows[0], role: 'legacy' };
          isLegacy = true;
          // hidratar campos restantes
          const full = await pool.query(
            `SELECT lc.id, lc.box_id, lc.full_name, lc.email, lc.phone,
                    lc.asesor, lc.recovery_advisor_id, lc.claimed_by_user_id, lc.is_claimed, lc.created_at
               FROM legacy_clients lc WHERE lc.id = $1 LIMIT 1`,
            [r.rows[0].id]
          );
          if (full.rows[0]) client = { ...full.rows[0], role: 'legacy' };
        } else if (r.rows.length > 1) {
          res.json({
            success: true,
            multiple: true,
            query: q,
            suggestions: r.rows.map(u => ({
              id: u.id,
              box_id: u.box_id,
              full_name: u.full_name,
              email: u.email,
              source: 'legacy_clients'
            }))
          });
          return;
        }
      }
    }

    if (!client) {
      res.status(404).json({ error: 'Cliente no encontrado', query: q });
      return;
    }

    // 🔒 Acotamiento por ASESOR: un asesor solo puede consultar SUS clientes
    // (asignados por advisor_id / referred_by_id / recovery_advisor_id).
    if (isAdvisorReq) {
      const clientAdvisor = client.advisor_id || client.referred_by_id || client.recovery_advisor_id;
      if (Number(clientAdvisor) !== Number(reqUserId)) {
        res.status(404).json({ error: 'Cliente no encontrado', query: q });
        return;
      }
    }

    // --- 2) Datos del asesor (si existe) ------------------------------
    let advisor: any = null;
    const advisorId = client.advisor_id || client.referred_by_id || client.recovery_advisor_id;
    if (advisorId) {
      const r = await pool.query(
        `SELECT id, full_name, email, box_id, role FROM users WHERE id = $1 LIMIT 1`,
        [advisorId]
      );
      advisor = r.rows[0] || null;
    }
    if (!advisor && isLegacy && client.asesor) {
      // Asesor textual del legacy
      advisor = { id: null, full_name: client.asesor, email: null, box_id: null, role: 'legacy' };
    }

    // --- 3) Paquetes del cliente --------------------------------------
    // Buscamos por user_id O por box_id (legacy / sin user_id).
    // OJO: para legacy_clients el id NO corresponde a users.id, así que pasamos NULL.
    const ACTIVE_STATUSES = ['pending', 'received', 'received_china', 'in_transit', 'in_cedis', 'at_port', 'customs', 'customs_cleared', 'consolidated', 'shipped', 'ready_pickup', 'out_for_delivery'];
    const usersIdForPackages = isLegacy ? (client.claimed_by_user_id || null) : client.id;
    const pkgRes = await pool.query(
      `SELECT p.id, p.tracking_internal, p.tracking_provider, p.status, p.service_type,
              p.weight,
              COALESCE(p.pkg_length, 0) AS length,
              COALESCE(p.pkg_width, 0)  AS width,
              COALESCE(p.pkg_height, 0) AS height,
              p.box_id, p.created_at, p.received_at, p.delivered_at,
              p.assigned_cost_mxn, p.saldo_pendiente, p.client_paid,
              p.master_id, p.is_master,
              p.national_carrier, p.national_tracking, p.national_label_url,
              cr.fno AS air_guide
         FROM packages p
         LEFT JOIN china_receipts cr ON cr.id = p.china_receipt_id
        WHERE (($1::int IS NOT NULL AND p.user_id = $1::int)
               OR ($2::text IS NOT NULL AND UPPER(TRIM(p.box_id)) = UPPER(TRIM($2::text))))
          AND (p.is_master = true OR p.master_id IS NULL)
        ORDER BY p.created_at DESC
        LIMIT 200`,
      [usersIdForPackages, client.box_id]
    );

    // --- 3b) Órdenes MARÍTIMAS del cliente -----------------------------
    // Se ligan por user_id O por shipping_mark (casillero). Muchas vienen con
    // user_id NULL y sólo shipping_mark, por eso antes Cajito no las encontraba.
    let maritimeRows: any[] = [];
    try {
      const mRes = await pool.query(
        `SELECT mo.id, mo.ordersn AS tracking_internal, mo.ship_number AS tracking_provider,
                mo.status, 'maritime' AS service_type, mo.weight,
                0 AS length, 0 AS width, 0 AS height,
                mo.shipping_mark AS box_id, mo.created_at, mo.received_at, mo.delivered_at,
                mo.assigned_cost_mxn, mo.saldo_pendiente,
                (mo.payment_status = 'paid') AS client_paid,
                NULL::int AS master_id, false AS is_master,
                mo.national_carrier, mo.national_tracking, mo.national_label_url,
                mo.last_tracking_status, mo.last_tracking_detail, mo.last_tracking_date,
                mo.current_location, mo.ship_number,
                c.eta AS container_eta, c.week_number AS container_week
           FROM maritime_orders mo
           LEFT JOIN containers c ON c.id = mo.container_id
          WHERE (($1::int IS NOT NULL AND mo.user_id = $1::int)
                 OR ($2::text IS NOT NULL AND UPPER(TRIM(mo.shipping_mark)) = UPPER(TRIM($2::text))))
          ORDER BY mo.created_at DESC
          LIMIT 200`,
        [usersIdForPackages, client.box_id]
      );
      maritimeRows = mRes.rows;
    } catch (e) {
      maritimeRows = [];
    }

    const allPackages = [...pkgRes.rows, ...maritimeRows];
    const activePackages = allPackages.filter(p => ACTIVE_STATUSES.includes((p.status || '').toLowerCase()));
    const deliveredPackages = allPackages
      .filter(p => ['delivered', 'cancelled', 'lost'].includes((p.status || '').toLowerCase()))
      .slice(0, 25);

    // --- 4) Órdenes de pago (pobox_payments + advisor_payment_orders) ---
    // Para clientes legacy no migrados (claimed_by_user_id NULL) no hay órdenes
    // ya que se generan contra users.id.
    let paymentOrders: any[] = [];
    const userIdForOrders = isLegacy ? (client.claimed_by_user_id || null) : client.id;
    if (userIdForOrders) {
      try {
        const poboxRes = await pool.query(
          `SELECT pp.id, pp.payment_reference, pp.status, pp.amount, pp.payment_method,
                  pp.package_ids, pp.created_at, pp.paid_at, pp.expires_at,
                  pp.facturada, pp.requiere_factura,
                  'client' AS source
             FROM pobox_payments pp
            WHERE pp.user_id = $1
            ORDER BY pp.created_at DESC
            LIMIT 50`,
          [userIdForOrders]
        );
        paymentOrders = poboxRes.rows;
      } catch (e) {
        paymentOrders = [];
      }

      try {
        const apoRes = await pool.query(
          `SELECT apo.id, apo.folio AS payment_reference, apo.status,
                  apo.total_mxn AS amount, apo.package_uids AS package_ids,
                  apo.created_at, NULL::timestamptz AS paid_at, NULL::timestamptz AS expires_at,
                  NULL::boolean AS facturada, NULL::boolean AS requiere_factura,
                  'advisor' AS source
             FROM advisor_payment_orders apo
            WHERE apo.client_id = $1
            ORDER BY apo.created_at DESC
            LIMIT 50`,
          [userIdForOrders]
        );
        paymentOrders = paymentOrders.concat(apoRes.rows);
      } catch (e) {
        // tabla puede no existir
      }
    }

    paymentOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    paymentOrders = paymentOrders.slice(0, 50);

    // --- 5) Movimientos recientes (de los paquetes activos) -----------
    let movements: any[] = [];
    try {
      // Solo ids de packages (package_history no aplica a marítimos).
      const activeIds = activePackages.filter(p => p.service_type !== 'maritime').map(p => p.id);
      if (activeIds.length > 0) {
        const mvRes = await pool.query(
          `SELECT ph.id, ph.package_id, ph.status,
                  COALESCE(ph.notes, ph.description) AS description,
                  b.name AS branch_name,
                  ph.created_at,
                  u.full_name AS created_by_name,
                  p.tracking_internal
             FROM package_history ph
             LEFT JOIN users u ON u.id = ph.created_by
             LEFT JOIN branches b ON b.id = ph.branch_id
             LEFT JOIN packages p ON p.id = ph.package_id
            WHERE ph.package_id = ANY($1::int[])
            ORDER BY ph.created_at DESC
            LIMIT 30`,
          [activeIds]
        );
        movements = mvRes.rows;
      }
    } catch (e) {
      movements = [];
    }

    // --- 6) Resumen rápido --------------------------------------------
    const totalSaldo = activePackages.reduce((acc, p) => acc + (Number(p.saldo_pendiente) || 0), 0);
    const totalPaymentsPending = paymentOrders
      .filter(p => ['pending', 'pending_payment', 'pendiente'].includes(String(p.status).toLowerCase()))
      .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    res.json({
      success: true,
      query: q,
      client: {
        id: client.id,
        full_name: client.full_name,
        email: client.email,
        phone: client.phone,
        box_id: client.box_id,
        role: client.role,
        created_at: client.created_at,
        is_legacy: isLegacy,
        claimed_by_user_id: client.claimed_by_user_id || null,
        // Estado de verificación — se muestra como badge en el rastreo de
        // Cajito para que el agente sepa si el cliente ya está verificado.
        // Legacy no verificados por definición (todavía no reclamados).
        is_verified: isLegacy ? false : !!client.is_verified,
        verification_status: isLegacy ? 'legacy' : (client.verification_status || 'unverified'),
      },
      advisor,
      summary: {
        active_packages: activePackages.length,
        delivered_packages: deliveredPackages.length,
        total_packages: allPackages.length,
        pending_payment_orders: paymentOrders.filter(p => ['pending', 'pending_payment', 'pendiente'].includes(String(p.status).toLowerCase())).length,
        total_payment_orders: paymentOrders.length,
        balance_pending_mxn: totalSaldo,
        payment_orders_pending_mxn: totalPaymentsPending,
      },
      activePackages,
      deliveredPackages,
      paymentOrders,
      movements,
    });
  } catch (err: any) {
    console.error('[cajito/client-lookup] error:', err);
    res.status(500).json({ error: err?.message || 'Error en lookup de cliente' });
  }
};

// ============================================================
// GET /api/cajito/ticket-lookup?q=<TKT-folio>
// Rastreo de un ticket de soporte por folio. Devuelve la ficha del
// ticket (asunto, estado, cliente, número de cliente capturado por el
// asesor) y sus últimos mensajes. Solo lectura. Para el panel "Rastrear".
// Los asesores solo ven sus propios tickets (creados o asignados).
// ============================================================
export const ticketLookup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = String((req.query.q ?? req.query.query ?? '') as string).trim();
    if (!q || q.length < 3) {
      res.status(400).json({ error: 'query muy corto (mín 3)' });
      return;
    }

    const reqRole = String((req.user as any)?.role || '').toLowerCase();
    const reqUserId = (req.user as any)?.userId || (req.user as any)?.id;
    const isAdvisorReq = ['advisor', 'sub_advisor'].includes(reqRole);

    // Buscar por folio exacto (TKT-…); si no, por folio parcial.
    const tRes = await pool.query(
      `SELECT t.id, t.ticket_folio, t.category, t.subject, t.status, t.priority,
              t.created_at, t.updated_at, t.user_id, t.assigned_to, t.assigned_agent_id,
              u.full_name AS client_name, u.box_id AS client_box_id,
              u.email AS client_email, u.phone AS client_phone,
              adv.full_name AS advisor_name,
              d.name AS department_name, d.color AS department_color,
              NULLIF(TRIM(BOTH E' \t\r\n•-' FROM (
                SELECT substring(tm.message FROM 'N.mero de cliente:[[:space:]]*([^' || chr(10) || chr(13) || ']+)')
                FROM ticket_messages tm WHERE tm.ticket_id = t.id ORDER BY tm.created_at ASC LIMIT 1
              )), '') AS client_number
         FROM support_tickets t
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN users adv ON adv.id = COALESCE(t.assigned_to, t.assigned_agent_id)
         LEFT JOIN support_departments d ON d.id = t.department_id
        WHERE UPPER(TRIM(t.ticket_folio)) = UPPER(TRIM($1))
           OR UPPER(t.ticket_folio) LIKE UPPER('%' || $1 || '%')
        ORDER BY (UPPER(TRIM(t.ticket_folio)) = UPPER(TRIM($1))) DESC, t.created_at DESC
        LIMIT 1`,
      [q]
    );

    const ticket = tRes.rows[0];
    if (!ticket) {
      res.status(404).json({ success: false, error: 'No se encontró un ticket con ese folio' });
      return;
    }

    // Acceso de asesor: solo sus tickets (creados o asignados).
    if (isAdvisorReq) {
      const owns = Number(ticket.user_id) === Number(reqUserId)
        || Number(ticket.assigned_to) === Number(reqUserId)
        || Number(ticket.assigned_agent_id) === Number(reqUserId);
      if (!owns) {
        res.status(404).json({ success: false, error: 'No se encontró un ticket con ese folio' });
        return;
      }
    }

    const msgs = await pool.query(
      `SELECT sender_type, message, created_at
         FROM ticket_messages
        WHERE ticket_id = $1 AND COALESCE(is_internal, FALSE) = FALSE
        ORDER BY created_at ASC
        LIMIT 50`,
      [ticket.id]
    );

    res.json({ success: true, ticket: { ...ticket, messages: msgs.rows } });
  } catch (err: any) {
    console.error('[cajito/ticket-lookup] error:', err);
    res.status(500).json({ error: err?.message || 'Error en lookup de ticket' });
  }
};

// ============================================================
// BASE DE CONOCIMIENTO (curada, solo super_admin) — CRUD
// ============================================================
export const listKnowledge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const q = String(req.query?.q || '').trim();
    const includeInactive = String(req.query?.all || '') === 'true';
    const conds: string[] = []; const params: any[] = []; let i = 1;
    if (!includeInactive) conds.push('is_active = TRUE');
    if (q) { conds.push(`(title ILIKE $${i} OR content ILIKE $${i} OR COALESCE(tags,'') ILIKE $${i})`); params.push(`%${q}%`); i++; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT k.id, k.title, k.content, k.tags, k.is_active, k.created_at, k.updated_at,
              cu.full_name AS created_by_name, uu.full_name AS updated_by_name
         FROM cajito_knowledge k
         LEFT JOIN users cu ON cu.id = k.created_by
         LEFT JOIN users uu ON uu.id = k.updated_by
         ${where}
        ORDER BY k.updated_at DESC LIMIT 500`, params);
    res.json({ items: r.rows });
  } catch (err: any) {
    console.error('[cajito/knowledge:list]', err); res.status(500).json({ error: 'Error al listar conocimiento' });
  }
};

export const createKnowledge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const uid = req.user?.userId;
    const { title, content, tags } = req.body || {};
    if (!String(title || '').trim() || !String(content || '').trim()) {
      res.status(400).json({ error: 'Título y contenido son obligatorios' }); return;
    }
    const r = await pool.query(
      `INSERT INTO cajito_knowledge (title, content, tags, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$4) RETURNING *`,
      [String(title).trim(), String(content).trim(), (tags && String(tags).trim()) || null, uid]);
    res.json({ item: r.rows[0] });
  } catch (err: any) {
    console.error('[cajito/knowledge:create]', err); res.status(500).json({ error: 'Error al guardar conocimiento' });
  }
};

export const updateKnowledge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const uid = req.user?.userId;
    const id = parseInt(String(req.params.id));
    const b = req.body || {};
    const sets: string[] = []; const params: any[] = []; let i = 1;
    if (b.title !== undefined && String(b.title).trim()) { sets.push(`title = $${i++}`); params.push(String(b.title).trim()); }
    if (b.content !== undefined && String(b.content).trim()) { sets.push(`content = $${i++}`); params.push(String(b.content).trim()); }
    if (b.tags !== undefined) { sets.push(`tags = $${i++}`); params.push((b.tags && String(b.tags).trim()) || null); }
    if (b.is_active !== undefined) { sets.push(`is_active = $${i++}`); params.push(!!b.is_active); }
    if (sets.length === 0) { res.status(400).json({ error: 'Nada que actualizar' }); return; }
    sets.push(`updated_by = $${i++}`); params.push(uid);
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const r = await pool.query(`UPDATE cajito_knowledge SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (r.rows.length === 0) { res.status(404).json({ error: 'No encontrado' }); return; }
    res.json({ item: r.rows[0] });
  } catch (err: any) {
    console.error('[cajito/knowledge:update]', err); res.status(500).json({ error: 'Error al actualizar conocimiento' });
  }
};

export const deleteKnowledge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const id = parseInt(String(req.params.id));
    await pool.query(`UPDATE cajito_knowledge SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[cajito/knowledge:delete]', err); res.status(500).json({ error: 'Error al eliminar conocimiento' });
  }
};

// ============================================================
// BITÁCORA DE DUDAS — consultar y enseñar (solo super_admin)
// ============================================================

/** GET /api/cajito/gaps?estado=pendiente — lo que Cajito no supo resolver. */
export const listGaps = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const estado = String(req.query.estado || 'pendiente');
    const validos = ['pendiente', 'resuelta', 'descartada', 'todas'];
    if (!validos.includes(estado)) { res.status(400).json({ error: 'Estado inválido' }); return; }

    const r = await pool.query(
      `SELECT g.id, g.folio, g.pregunta, g.motivo, g.detalle, g.tool_name, g.respuesta,
              g.estado, g.veces, g.first_seen_at, g.last_seen_at, g.resolved_at,
              g.knowledge_id, k.title AS knowledge_title,
              u.full_name AS pregunto, r.full_name AS resolvio
         FROM cajito_gaps g
         LEFT JOIN users u ON u.id = g.user_id
         LEFT JOIN users r ON r.id = g.resolved_by
         LEFT JOIN cajito_knowledge k ON k.id = g.knowledge_id
        ${estado === 'todas' ? '' : 'WHERE g.estado = $1'}
        -- Primero lo que más gente ha preguntado: es lo que más urge enseñarle.
        ORDER BY g.estado = 'pendiente' DESC, g.veces DESC, g.last_seen_at DESC
        LIMIT 200`,
      estado === 'todas' ? [] : [estado]
    );

    const resumen = await pool.query(
      `SELECT estado, COUNT(*)::int n, COALESCE(SUM(veces),0)::int preguntas
         FROM cajito_gaps GROUP BY estado`
    );

    res.json({
      success: true,
      gaps: r.rows,
      resumen: resumen.rows.reduce((acc: any, x: any) => {
        acc[x.estado] = { dudas: x.n, preguntas: x.preguntas }; return acc;
      }, {}),
    });
  } catch (err: any) {
    console.error('[CAJITO-GAPS]', err?.message);
    res.status(500).json({ error: err?.message || 'Error al listar dudas' });
  }
};

/** PATCH /api/cajito/gaps/:id — descartar o reabrir una duda. */
export const updateGap = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureChatTables();
    const id = parseInt(String(req.params.id), 10);
    const estado = String(req.body?.estado || '');
    if (!id || !['pendiente', 'descartada'].includes(estado)) {
      res.status(400).json({ error: 'Estado inválido (pendiente | descartada)' });
      return;
    }
    const r = await pool.query(
      `UPDATE cajito_gaps
          SET estado = $1,
              resolved_at = CASE WHEN $1 = 'pendiente' THEN NULL ELSE NOW() END,
              resolved_by = CASE WHEN $1 = 'pendiente' THEN NULL ELSE $2 END
        WHERE id = $3 RETURNING id, folio, estado, task_id`,
      [estado, req.user?.userId ?? null, id]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Duda no encontrada' }); return; }

    // Descartar una duda también cierra su tarea: si no, el tablero se llena de
    // urgentes que ya nadie va a trabajar.
    const tid = Number(r.rows[0]?.task_id) || 0;
    if (tid && estado === 'descartada') {
      await pool.query(
        `UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status <> 'cancelled'`, [tid]).catch(() => {});
    }
    res.json({ success: true, gap: r.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al actualizar la duda' });
  }
};

/**
 * POST /api/cajito/gaps/:id/ensenar { title, content, tags }
 * Le enseña la respuesta: crea la entrada de conocimiento y marca la duda como
 * resuelta, dejándolas ligadas. Es el cierre del ciclo — a partir de aquí
 * search_knowledge ya encuentra algo cuando se lo vuelvan a preguntar.
 */
export const teachGap = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await ensureChatTables();
    const id = parseInt(String(req.params.id), 10);
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const tags = String(req.body?.tags || '').trim() || null;
    if (!id || !title || !content) {
      res.status(400).json({ error: 'Se requieren título y contenido' });
      return;
    }

    await client.query('BEGIN');
    const g = await client.query(`SELECT id, folio, pregunta, task_id FROM cajito_gaps WHERE id = $1 FOR UPDATE`, [id]);
    if (g.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Duda no encontrada' });
      return;
    }

    const k = await client.query(
      `INSERT INTO cajito_knowledge (title, content, tags, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4) RETURNING id, title`,
      [title, content, tags, req.user?.userId ?? null]
    );

    await client.query(
      `UPDATE cajito_gaps
          SET estado = 'resuelta', knowledge_id = $1, resolved_at = NOW(), resolved_by = $2
        WHERE id = $3`,
      [k.rows[0].id, req.user?.userId ?? null, id]
    );

    // Cierra la tarea urgente que se levantó por esta duda. Si no, quedaría
    // abierta y venciendo aunque el trabajo ya esté hecho, y el recordatorio
    // diario de urgentes seguiría contándola.
    const taskId = Number(g.rows[0]?.task_id) || 0;
    if (taskId) {
      await client.query(
        `UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status <> 'cancelled'`,
        [taskId]
      );
    }
    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Duda ${g.rows[0].folio} resuelta. Cajito ya sabe responderla.`,
      knowledge: k.rows[0],
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[CAJITO-TEACH]', err?.message);
    res.status(500).json({ error: err?.message || 'Error al enseñar la respuesta' });
  } finally {
    client.release();
  }
};
