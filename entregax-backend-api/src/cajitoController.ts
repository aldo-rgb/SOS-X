// ============================================================
// CAJITO — Asistente IA (OpenAI) · Chat + Tool-use + Auditoría
// ============================================================
// Alcance v1: SOLO LECTURA. Todas las conversaciones se persisten
// para auditoría (cajito_conversations + cajito_messages).
//
// Proveedor: OpenAI (gpt-4o-mini por defecto). Para cambiar:
//   CAJITO_MODEL=gpt-4o
//
// Cada herramienta requiere que el usuario tenga la capability
// correspondiente concedida en `cajito_user_capabilities`. El
// super_admin se trata como si tuviera todas las capacidades.
// ============================================================

import { Request, Response } from 'express';
import OpenAI from 'openai';
import { pool } from './db';

interface AuthRequest extends Request {
  user?: { userId: number; role: string };
}

// --- OpenAI client (lazy) ---------------------------------------------------
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no configurada');
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

const MODEL = process.env.CAJITO_MODEL || 'gpt-4o-mini';
const MAX_TOKENS = parseInt(process.env.CAJITO_MAX_TOKENS || '2048', 10);
const MAX_TOOL_ITERATIONS = 5;

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
  `);
  _tablesReady = true;
}

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
// HERRAMIENTAS (TOOLS) — solo lectura, v1
// ============================================================
type ToolCtx = { userId: number; role: string };
type ToolDef = {
  name: string;
  requiredCapability: string;
  description: string;
  parameters: any;
  handler: (args: any, ctx: ToolCtx) => Promise<any>;
};

const TOOLS: ToolDef[] = [
  // -------------------- PAQUETES --------------------
  {
    name: 'lookup_package',
    requiredCapability: 'cajito.read.packages',
    description: 'Busca un paquete por tracking interno o tracking del transportista. Devuelve estado, peso, dimensiones, cliente y fechas clave.',
    parameters: {
      type: 'object',
      properties: {
        tracking: { type: 'string', description: 'Tracking interno (TDX-…, US-…) o tracking externo' }
      },
      required: ['tracking']
    },
    handler: async ({ tracking }) => {
      const t = String(tracking || '').trim();
      if (!t) return { error: 'tracking vacío' };
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
          WHERE p.tracking_internal = $1
             OR p.tracking_provider = $1
          ORDER BY p.created_at DESC
          LIMIT 5`,
        [t]
      );
      if (!r.rows.length) return { found: false };
      return { found: true, packages: r.rows };
    }
  },

  // -------------------- CLIENTES --------------------
  {
    name: 'search_clients',
    requiredCapability: 'cajito.read.clients',
    description: 'Busca clientes por casillero (box_id), nombre o correo. Devuelve hasta 25 coincidencias.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar (mín 2 caracteres)' }
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
  }
];

// --- System prompt ----------------------------------------------------------
function buildSystemPrompt(user: { userId: number; role: string; full_name?: string }, caps: Set<string>): string {
  const capList = caps.has('*') ? '(todas)' : Array.from(caps).filter(c => c.startsWith('cajito.read.')).join(', ') || '(ninguna de lectura)';
  return [
    'Eres Cajito, asistente IA operativo de EntregaX (paquetería).',
    'Responde SIEMPRE en español, con tono cordial y directo. Sin emojis salvo en saludos cortos.',
    'Tu alcance ACTUAL es SOLO LECTURA: puedes consultar paquetes, clientes, rutas, choferes e inventarios. NO puedes modificar nada.',
    'Si te piden una acción de escritura (modificar, enviar mensajes, cambiar status, aplicar descuentos), responde que esa función aún no está habilitada y sugiere el módulo del panel donde hacerlo.',
    'Cuando necesites datos del sistema, USA las herramientas disponibles. NO inventes trackings, montos ni nombres.',
    'Si una herramienta devuelve resultados, formatea la respuesta de forma corta y útil (lista breve o tabla en texto). Cita IDs/trackings textuales.',
    'Si el usuario te pregunta algo fuera de operaciones de paquetería, responde brevemente y vuelve al tema operativo.',
    '',
    '=== MODELO DE DATOS ===',
    '"Paquetes" o "cajas": tabla packages. Servicios: POBOX_USA (Po Box USA), AIR_CHN_MX (aéreo China→México), SEA_CHN_MX (marítimo China→México), AA_DHL (DHL nacional).',
    'Estados de paquetes: pending (pendiente), received (recibido en almacén origen), in_transit (en tránsito), in_cedis (en CEDIS/almacén local), out_for_delivery (en ruta de entrega), delivered (entregado), cancelled (cancelado).',
    '"Contenedores": tabla containers, son los contenedores marítimos que agrupan envíos SEA_CHN_MX.',
    'Estados de contenedores: received_origin (recibido en China), consolidated (consolidado), in_transit (zarpó, en camino), arrived_port (llegó al puerto MX), customs_cleared (aduana liberada), in_transit_clientfinal (en camino al cliente final), delivered (entregado).',
    'Para preguntas sobre cajas/paquetes pendientes o en tránsito → usa packages_pending_counts o package_status_counts.',
    'Para preguntas sobre contenedores marítimos → usa container_status_counts.',
    '',
    `Usuario actual: id=${user.userId}, rol=${user.role}${user.full_name ? `, nombre=${user.full_name}` : ''}.`,
    `Capacidades concedidas: ${capList}.`
  ].join('\n');
}

// --- Build tools array for OpenAI based on user capabilities ----------------
function toolsForUser(caps: Set<string>) {
  return TOOLS
    .filter(t => hasCap(caps, t.requiredCapability))
    .map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
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
        [userId, trimText(message, 80), MODEL]
      );
      conversationId = created.rows[0].id;
    }

    // Cargar usuario (para system prompt)
    const u = await pool.query(`SELECT full_name FROM users WHERE id = $1`, [userId]);
    const systemPrompt = buildSystemPrompt({ userId, role, full_name: u.rows[0]?.full_name }, caps);

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

    // Construir mensajes para OpenAI
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...historyMsgs,
      { role: 'user', content: message }
    ];

    const tools = toolsForUser(caps);
    const openai = getOpenAI();

    const toolCallsLog: { name: string; args: any; resultPreview: any }[] = [];
    let finalReply = '';
    let totalIn = 0, totalOut = 0;

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages,
        ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}),
      });

      totalIn += completion.usage?.prompt_tokens || 0;
      totalOut += completion.usage?.completion_tokens || 0;

      const choice = completion.choices[0];
      if (!choice) break;
      const msg = choice.message;

      // ¿El modelo pidió herramientas?
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Append assistant tool-call message
        messages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.tool_calls,
        });

        for (const tc of msg.tool_calls) {
          if (tc.type !== 'function') continue;
          const toolDef = TOOLS.find(t => t.name === tc.function.name);
          let parsedArgs: any = {};
          try { parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { parsedArgs = {}; }

          let result: any;
          if (!toolDef) {
            result = { error: `Herramienta desconocida: ${tc.function.name}` };
          } else if (!hasCap(caps, toolDef.requiredCapability)) {
            result = { error: `Sin capacidad ${toolDef.requiredCapability}` };
          } else {
            try {
              result = await toolDef.handler(parsedArgs, { userId, role });
            } catch (err: any) {
              result = { error: String(err?.message || err) };
            }
          }

          // Persistir auditoría de tool-call
          await saveMessage(conversationId!, {
            role: 'tool',
            content: null,
            toolName: tc.function.name,
            toolArgs: parsedArgs,
            toolResult: result,
          });
          toolCallsLog.push({
            name: tc.function.name,
            args: parsedArgs,
            resultPreview: typeof result === 'object' ? Object.keys(result).slice(0, 5) : result,
          });

          // Append como tool message
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result).slice(0, 8000), // cap por seguridad
          });
        }
        continue; // siguiente iteración
      }

      // No hubo tool-calls → respuesta final
      finalReply = msg.content || '';
      break;
    }

    if (!finalReply) finalReply = '(Cajito no generó respuesta)';

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
export const getHealth = async (req: AuthRequest, res: Response): Promise<void> => {
  const role = req.user?.role;
  if (role !== 'super_admin' && role !== 'admin') { res.status(403).json({ error: 'No autorizado' }); return; }
  const hasKey = !!process.env.OPENAI_API_KEY;
  const tg = await pool.query(
    `SELECT config_value FROM system_configurations WHERE config_key = 'cajito_enabled' LIMIT 1`
  ).catch(() => ({ rows: [] as any[] }));
  const enabled = tg.rows[0]?.config_value?.enabled === true;
  res.json({
    enabled,
    apiKeyConfigured: hasKey,
    model: MODEL,
    toolCount: TOOLS.length,
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

    // --- 1) Resolver al cliente ---------------------------------------
    // Prioridad: box_id exacto > id numérico > email exacto > búsqueda parcial
    const isBoxIdLike = /^[A-Za-z]{0,4}-?\d{1,}$/.test(q);
    const isNumeric = /^\d+$/.test(q);
    const isEmail = /@/.test(q);

    let client: any = null;
    if (isBoxIdLike) {
      const r = await pool.query(
        `SELECT id, full_name, email, phone, box_id, role, advisor_id, referred_by_id, created_at
           FROM users
          WHERE UPPER(TRIM(box_id)) = UPPER(TRIM($1))
          LIMIT 1`,
        [q]
      );
      client = r.rows[0] || null;
    }
    if (!client && isNumeric) {
      const r = await pool.query(
        `SELECT id, full_name, email, phone, box_id, role, advisor_id, referred_by_id, created_at
           FROM users WHERE id = $1 LIMIT 1`,
        [parseInt(q, 10)]
      );
      client = r.rows[0] || null;
    }
    if (!client && isEmail) {
      const r = await pool.query(
        `SELECT id, full_name, email, phone, box_id, role, advisor_id, referred_by_id, created_at
           FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [q]
      );
      client = r.rows[0] || null;
    }
    if (!client) {
      // Búsqueda parcial: si hay UNA sola coincidencia, la devolvemos como cliente; si hay varias, devolvemos sugerencias.
      const like = `%${q}%`;
      const r = await pool.query(
        `SELECT id, full_name, email, phone, box_id, role, advisor_id, referred_by_id, created_at
           FROM users
          WHERE box_id ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1
          ORDER BY (UPPER(box_id) = UPPER($2)) DESC, box_id NULLS LAST
          LIMIT 10`,
        [like, q]
      );
      if (r.rows.length === 1) {
        client = r.rows[0];
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
              p.box_id, p.created_at, p.received_at, p.delivered_at, p.shipped_at,
              p.assigned_cost_mxn, p.saldo_pendiente, p.client_paid,
              p.master_id, p.is_master,
              p.national_carrier, p.national_tracking, p.national_label_url
         FROM packages p
        WHERE (($1::int IS NOT NULL AND p.user_id = $1::int)
               OR ($2 IS NOT NULL AND UPPER(TRIM(p.box_id)) = UPPER(TRIM($2))))
          AND (p.is_master = true OR p.master_id IS NULL)
        ORDER BY p.created_at DESC
        LIMIT 200`,
      [usersIdForPackages, client.box_id]
    );

    const allPackages = pkgRes.rows;
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
      const activeIds = activePackages.map(p => p.id);
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
