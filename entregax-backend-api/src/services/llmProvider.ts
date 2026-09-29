// ============================================================
// llmProvider.ts — Capa de abstracción para OpenAI/Anthropic
// ============================================================
// Interfaz común para que Cajito pueda usar cualquiera de los dos
// proveedores sin cambiar la lógica de tool-use. El proveedor se
// selecciona con `CAJITO_PROVIDER` (openai | anthropic) y el modelo
// con `CAJITO_MODEL`.
// ============================================================

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ------------ Tipos comunes -----------------------------------
export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: any; // JSON schema
}

export type LlmRole = 'user' | 'assistant';

export interface LlmTextContent {
  type: 'text';
  text: string;
}
export interface LlmToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}
export interface LlmToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string; // JSON o texto plano
}
// Archivos que la persona adjunta en el chat (tarea 569). `data` va en base64
// sin el prefijo data-URL.
export interface LlmImageContent {
  type: 'image';
  mediaType: string; // image/jpeg | image/png | image/gif | image/webp
  data: string;
}
export interface LlmDocumentContent {
  type: 'document';
  mediaType: 'application/pdf';
  data: string;
  name?: string;
}
export type LlmContentBlock =
  | LlmTextContent
  | LlmToolUseContent
  | LlmToolResultContent
  | LlmImageContent
  | LlmDocumentContent;

export interface LlmMessage {
  role: LlmRole;
  content: string | LlmContentBlock[];
}

export interface LlmCompletionRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  maxTokens?: number;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: any;
}

export interface LlmCompletionResponse {
  text: string; // texto libre (puede ser vacío si solo hay tool_use)
  toolCalls: LlmToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
  name: 'openai' | 'anthropic';
  model: string;
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

// ------------ Config helpers ---------------------------------
export function getProviderName(): 'openai' | 'anthropic' {
  const raw = String(process.env.CAJITO_PROVIDER || '').toLowerCase().trim();
  if (raw === 'anthropic' || raw === 'claude') return 'anthropic';
  return 'openai';
}

// Modelos Claude retirados → reemplazo vigente. Evita 404 aunque CAJITO_MODEL
// en el entorno siga apuntando a un id retirado (p.ej. claude-3-5-sonnet-latest,
// retirado el 28-oct-2025).
function remapRetiredClaude(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith('claude-3-5-sonnet') || m.startsWith('claude-3-sonnet') || m.startsWith('claude-3-7-sonnet')) return 'claude-sonnet-5';
  if (m.startsWith('claude-3-5-haiku') || m.startsWith('claude-3-haiku')) return 'claude-haiku-4-5';
  if (m.startsWith('claude-3-opus') || m === 'claude-3-opus-latest') return 'claude-opus-4-8';
  return model;
}

export function getModelName(): string {
  const provider = getProviderName();
  const explicit = (process.env.CAJITO_MODEL || '').trim();
  if (explicit) return remapRetiredClaude(explicit);
  return provider === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o-mini';
}

// ------------ OpenAI implementation --------------------------
class OpenAiProvider implements LlmProvider {
  name = 'openai' as const;
  model: string;
  private client: OpenAI | null = null;

  constructor(model: string) {
    this.model = model;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY no configurada');
      }
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const client = this.getClient();

    // Convertir mensajes comunes a formato OpenAI
    const oaiMessages: any[] = [{ role: 'system', content: req.system }];
    for (const m of req.messages) {
      if (typeof m.content === 'string') {
        oaiMessages.push({ role: m.role, content: m.content });
        continue;
      }
      // content: LlmContentBlock[]
      if (m.role === 'assistant') {
        const textParts = m.content.filter((b) => b.type === 'text') as LlmTextContent[];
        const toolUses = m.content.filter((b) => b.type === 'tool_use') as LlmToolUseContent[];
        const msg: any = {
          role: 'assistant',
          content: textParts.map((p) => p.text).join('\n') || null,
        };
        if (toolUses.length) {
          msg.tool_calls = toolUses.map((tu) => ({
            id: tu.id,
            type: 'function',
            function: { name: tu.name, arguments: JSON.stringify(tu.input || {}) },
          }));
        }
        oaiMessages.push(msg);
      } else {
        // role === 'user' — puede contener tool_result blocks
        const toolResults = m.content.filter((b) => b.type === 'tool_result') as LlmToolResultContent[];
        if (toolResults.length) {
          for (const tr of toolResults) {
            oaiMessages.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id,
              content: tr.content,
            });
          }
          // Imágenes que regresó una herramienta (ver_imagenes_ticket): OpenAI no
          // las acepta dentro de un mensaje 'tool', van en uno de usuario aparte.
          const imagenes = m.content.filter((b) => b.type === 'image') as LlmImageContent[];
          if (imagenes.length) {
            oaiMessages.push({
              role: 'user',
              content: imagenes.map((b) => ({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.data}` } })),
            });
          }
        } else {
          const partes: any[] = [];
          for (const b of m.content) {
            if (b.type === 'text') partes.push({ type: 'text', text: b.text });
            else if (b.type === 'image') partes.push({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.data}` } });
            // Los modelos de OpenAI que usamos no leen PDF: se le avisa en texto.
            else if (b.type === 'document') partes.push({ type: 'text', text: `[Adjuntó el PDF "${b.name || 'documento'}", pero este modelo no puede leer PDF.]` });
          }
          const soloTexto = partes.every((p) => p.type === 'text');
          oaiMessages.push({ role: 'user', content: soloTexto ? partes.map((p) => p.text).join('\n') : partes });
        }
      }
    }

    const oaiTools = (req.tools || []).map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const completion = await client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens || 2048,
      messages: oaiMessages,
      ...(oaiTools.length ? { tools: oaiTools, tool_choice: 'auto' as const } : {}),
    });

    const choice = completion.choices?.[0];
    const msg = choice?.message;
    const toolCalls: LlmToolCall[] = [];
    if (msg?.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue;
        let input: any = {};
        try { input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { /* keep {} */ }
        toolCalls.push({ id: tc.id, name: tc.function.name, input });
      }
    }

    const stopMap: Record<string, LlmCompletionResponse['stopReason']> = {
      stop: 'end_turn',
      length: 'max_tokens',
      tool_calls: 'tool_use',
    };
    const stopReason = stopMap[choice?.finish_reason || ''] || 'other';

    return {
      text: msg?.content || '',
      toolCalls,
      stopReason,
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
      },
    };
  }
}

// ------------ Anthropic implementation -----------------------
class AnthropicProvider implements LlmProvider {
  name = 'anthropic' as const;
  model: string;
  private client: Anthropic | null = null;

  constructor(model: string) {
    this.model = model;
  }

  private getClient(): Anthropic {
    if (!this.client) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY no configurada');
      }
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const client = this.getClient();

    // Convertir mensajes al formato Anthropic
    // - system va como parámetro top-level
    // - messages solo user/assistant
    // - tool calls dentro de content: [{ type: 'tool_use', ... }]
    // - tool results dentro de user content: [{ type: 'tool_result', ... }]
    const antMessages: Anthropic.MessageParam[] = [];
    for (const m of req.messages) {
      if (typeof m.content === 'string') {
        antMessages.push({ role: m.role, content: m.content });
        continue;
      }
      const blocks: any[] = m.content.map((b) => {
        if (b.type === 'text') return { type: 'text', text: b.text };
        if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
        if (b.type === 'image') return { type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.data } };
        if (b.type === 'document') {
          return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.data }, ...(b.name ? { title: b.name } : {}) };
        }
        // tool_result
        return { type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content };
      });
      antMessages.push({ role: m.role, content: blocks });
    }

    const antTools: Anthropic.Tool[] = (req.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as any,
    }));

    const response = await client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens || 2048,
      system: req.system,
      messages: antMessages,
      // Sonnet 5 corre thinking adaptivo por defecto; Cajito es un asistente de
      // soporte rápido (solo lectura + tools), así que lo deshabilitamos para
      // conservar la latencia/costo del modelo previo y no truncar max_tokens.
      thinking: { type: 'disabled' },
      ...(antTools.length ? { tools: antTools } : {}),
    });

    let text = '';
    const toolCalls: LlmToolCall[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        text += (text ? '\n' : '') + block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    const stopMap: Record<string, LlmCompletionResponse['stopReason']> = {
      end_turn: 'end_turn',
      tool_use: 'tool_use',
      max_tokens: 'max_tokens',
    };
    const stopReason = stopMap[response.stop_reason || ''] || 'other';

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
    };
  }
}

// ------------ Respaldo cuando se acaba la cuota ---------------
// El 28-sep ZAIA le pidió a Cajito la dirección aérea de S1 y lo que volvió no
// fue una respuesta sino un 429 de Anthropic: "your organization has crossed
// its monthly API usage threshold… You will regain access on 2026-10-01".
// Cajito quedó mudo tres días por una razón que no tiene nada que ver con lo
// que le preguntaron.
//
// El proyecto ya hablaba los dos idiomas —OpenAI y Anthropic— pero el
// proveedor se elegía a mano con CAJITO_PROVIDER y nadie estaba viendo el
// tablero a las 8 de la noche. Ahora, si el de casa se queda sin cuota, la
// pregunta se va sola al otro y el usuario ni se entera.
//
// Qué cuenta como "sin cuota": 429 (tope de gasto o de ritmo), 402, saldo
// agotado y la falta de llave. Un error de programación —un modelo que no
// existe, un mensaje mal armado— NO cae aquí: ese hay que verlo, no taparlo
// cambiando de proveedor.
const SIN_CUOTA = /rate.?limit|insufficient.?quota|enforced.?spend.?limit|credit balance|exceeded your current quota|billing/i;

export function esFaltaDeCuota(e: any): boolean {
  const status = Number(e?.status ?? e?.statusCode ?? 0);
  if (status === 429 || status === 402) return true;
  const txt = [e?.error?.type, e?.error?.message, e?.message, e?.code].filter(Boolean).join(' ');
  return SIN_CUOTA.test(txt);
}

function llaveDe(name: 'openai' | 'anthropic'): boolean {
  return name === 'anthropic' ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY;
}

function modeloPorDefecto(name: 'openai' | 'anthropic'): string {
  const explicito = (process.env.CAJITO_MODEL_RESPALDO || '').trim();
  if (explicito) return name === 'anthropic' ? remapRetiredClaude(explicito) : explicito;
  return name === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o-mini';
}

// Mientras el de casa esté castigado, las preguntas se van directo al respaldo
// en vez de gastar una llamada fallida —y su latencia— cada vez.
const CASTIGO_MS = 10 * 60 * 1000;
let castigadoHasta = 0;
let ultimoMotivo = '';

/** Sólo para pruebas: deja el castigo en cero entre casos. */
export function _limpiarCastigo(): void { castigadoHasta = 0; ultimoMotivo = ''; }

export class ProveedorConRespaldo implements LlmProvider {
  name: 'openai' | 'anthropic';
  model: string;
  private principal: LlmProvider;
  private respaldo: LlmProvider | null;

  constructor(principal: LlmProvider, respaldo: LlmProvider | null) {
    this.principal = principal;
    this.respaldo = respaldo;
    this.name = principal.name;
    this.model = principal.model;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    // Sin llave no hay nada que intentar: se va derecho al respaldo en vez de
    // gastar una llamada que ya sabemos que truena.
    const castigado = Date.now() < castigadoHasta || !llaveDe(this.principal.name);
    if (!castigado) {
      try {
        const r = await this.principal.complete(req);
        // Contestó: se levanta el castigo aunque no hubiera vencido.
        castigadoHasta = 0;
        ultimoMotivo = '';
        return r;
      } catch (e: any) {
        if (!this.respaldo || !esFaltaDeCuota(e)) throw e;
        castigadoHasta = Date.now() + CASTIGO_MS;
        ultimoMotivo = String(e?.error?.message || e?.message || 'sin cuota').slice(0, 300);
        console.warn(`[cajito] ${this.principal.name} sin cuota → paso a ${this.respaldo.name}. Motivo: ${ultimoMotivo}`);
      }
    } else if (this.respaldo) {
      console.log(`[cajito] ${this.principal.name} sigue castigado ${Math.ceil((castigadoHasta - Date.now()) / 1000)}s, voy directo a ${this.respaldo.name}`);
    }

    if (!this.respaldo) throw new Error('No hay proveedor de respaldo configurado.');
    try {
      return await this.respaldo.complete(req);
    } catch (e: any) {
      // Si el respaldo también está sin cuota, el mensaje tiene que decir que
      // fallaron los dos: si no, alguien va a ir a recargar la cuenta
      // equivocada.
      if (esFaltaDeCuota(e)) {
        throw new Error(
          `Los dos proveedores están sin cuota. ${this.principal.name}: ${ultimoMotivo || 'sin cuota'}. ` +
          `${this.respaldo.name}: ${String(e?.error?.message || e?.message || '').slice(0, 300)}`
        );
      }
      throw e;
    }
  }
}

/** Qué proveedor está contestando ahora mismo, para mostrarlo en la interfaz. */
export function proveedorActivo(): { nombre: 'openai' | 'anthropic'; de_respaldo: boolean; motivo: string } {
  const principal = getProviderName();
  const enRespaldo = Date.now() < castigadoHasta;
  const otro: 'openai' | 'anthropic' = principal === 'anthropic' ? 'openai' : 'anthropic';
  return {
    nombre: enRespaldo && llaveDe(otro) ? otro : principal,
    de_respaldo: enRespaldo && llaveDe(otro),
    motivo: enRespaldo ? ultimoMotivo : '',
  };
}

// ------------ Factory ----------------------------------------
let cached: LlmProvider | null = null;
export function getLlmProvider(): LlmProvider {
  const name = getProviderName();
  const model = getModelName();
  if (cached && cached.name === name && cached.model === model) return cached;
  const principal = name === 'anthropic' ? new AnthropicProvider(model) : new OpenAiProvider(model);
  const otro: 'openai' | 'anthropic' = name === 'anthropic' ? 'openai' : 'anthropic';
  const respaldo = llaveDe(otro)
    ? (otro === 'anthropic'
        ? new AnthropicProvider(modeloPorDefecto('anthropic'))
        : new OpenAiProvider(modeloPorDefecto('openai')))
    : null;
  cached = new ProveedorConRespaldo(principal, respaldo);
  return cached;
}

// Modelos "amigables" para mostrar en la UI (chip)
export function getFriendlyModelLabel(): string {
  // Si está contestando el respaldo, el chip tiene que decirlo: si no, alguien
  // ve "Claude" en pantalla mientras en realidad contesta GPT y no entiende
  // por qué cambió el tono de las respuestas.
  const activo = proveedorActivo();
  if (activo.de_respaldo) {
    const m = modeloPorDefecto(activo.nombre);
    return `${etiquetaDe(activo.nombre, m)} (respaldo)`;
  }
  return etiquetaDe(getProviderName(), getModelName());
}

function etiquetaDe(provider: 'openai' | 'anthropic', model: string): string {
  if (provider === 'anthropic') {
    if (/opus/i.test(model)) return 'Claude Opus';
    if (/3-7-sonnet|3\.7-sonnet/i.test(model)) return 'Claude 3.7 Sonnet';
    if (/3-5-sonnet|3\.5-sonnet/i.test(model)) return 'Claude 3.5 Sonnet';
    if (/haiku/i.test(model)) return 'Claude Haiku';
    return `Claude (${model})`;
  }
  if (/gpt-4o-mini/i.test(model)) return 'GPT-4o mini';
  if (/gpt-4o/i.test(model)) return 'GPT-4o';
  if (/gpt-4/i.test(model)) return 'GPT-4';
  return model;
}

export function isProviderKeyConfigured(): boolean {
  // Basta con que UNO de los dos tenga llave: si el de casa no la tiene, el
  // respaldo contesta igual y no tiene caso apagar a Cajito.
  return llaveDe('openai') || llaveDe('anthropic');
}
