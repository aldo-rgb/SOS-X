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
                p.weight, p.length, p.width, p.height,
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
