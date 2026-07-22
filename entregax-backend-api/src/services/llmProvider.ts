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
export type LlmContentBlock =
  | LlmTextContent
  | LlmToolUseContent
  | LlmToolResultContent;

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

export function getModelName(): string {
  const provider = getProviderName();
  const explicit = (process.env.CAJITO_MODEL || '').trim();
  if (explicit) return explicit;
  return provider === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-4o-mini';
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
        } else {
          const textParts = m.content.filter((b) => b.type === 'text') as LlmTextContent[];
          oaiMessages.push({ role: 'user', content: textParts.map((p) => p.text).join('\n') });
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

// ------------ Factory ----------------------------------------
let cached: LlmProvider | null = null;
export function getLlmProvider(): LlmProvider {
  const name = getProviderName();
  const model = getModelName();
  if (cached && cached.name === name && cached.model === model) return cached;
  cached = name === 'anthropic' ? new AnthropicProvider(model) : new OpenAiProvider(model);
  return cached;
}

// Modelos "amigables" para mostrar en la UI (chip)
export function getFriendlyModelLabel(): string {
  const provider = getProviderName();
  const model = getModelName();
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
  const provider = getProviderName();
  if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  return !!process.env.OPENAI_API_KEY;
}
