// ============================================================================
// 🔀 REGLAS DE RESPUESTA DE WHATSAPP (botón entrante → acción)
// ============================================================================
// Permite configurar, desde el CRM, qué pasa cuando un lead toca un botón de
// respuesta rápida en una plantilla de WhatsApp. Ej:
//   - "Dame más información" → enviar otra plantilla (Plantilla 2).
//   - "No, gracias"          → mandar el lead a la lista negra (lead_blacklist).
//
// El match es por el TÍTULO del botón (lo que Meta manda en button.text /
// interactive.button_reply.title), normalizado (trim + minúsculas).
// El webhook (whatsappWebhookController) llama applyReplyRule() al recibir una
// respuesta. La definición del botón vive en la plantilla aprobada de Meta;
// aquí solo se define la ACCIÓN.
// ============================================================================

import { Request, Response } from 'express';
import { pool } from './db';
import { sendTemplate } from './whatsappService';
import { getSignedUrlForKey } from './s3Service';

let _schemaReady = false;
export async function ensureReplyRulesSchema(): Promise<void> {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_reply_rules (
      id SERIAL PRIMARY KEY,
      button_text TEXT NOT NULL,               -- título del botón (como lo manda Meta)
      action TEXT NOT NULL DEFAULT 'send_template',  -- 'send_template' | 'blacklist'
      template_id INTEGER REFERENCES bulk_wa_templates(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  // Dedup de mensajes entrantes ya procesados (Meta reintenta el webhook).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_processed_messages (
      msg_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  _schemaReady = true;
}

// Normaliza para comparar botones: sin tildes, minúsculas, espacios colapsados.
// Así "México" ≡ "Mexico", "  Dame  más " ≡ "dame mas", etc.
const norm = (s: any): string => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();
const normPhone = (p: any): string => { const d = String(p ?? '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };

// ─── Idempotencia: ¿ya procesamos este message id? ──────────────────────────
export async function alreadyProcessed(msgId: string): Promise<boolean> {
  if (!msgId) return false;
  await ensureReplyRulesSchema();
  const r = await pool.query(
    `INSERT INTO wa_processed_messages (msg_id) VALUES ($1) ON CONFLICT (msg_id) DO NOTHING RETURNING msg_id`,
    [String(msgId)]
  ).catch(() => ({ rows: [] as any[] }));
  // Si NO devolvió fila, es porque ya existía → ya se procesó.
  return r.rows.length === 0;
}

// Resuelve el nombre del lead por teléfono (para personalizar {{1}}).
async function resolveNameByPhone(phone: string): Promise<string> {
  const last10 = normPhone(phone);
  if (!last10) return 'Cliente';
  const r = await pool.query(
    `SELECT name FROM (
       SELECT u.full_name AS name, u.phone FROM crm_requests r JOIN users u ON r.user_id=u.id
       UNION ALL
       SELECT lc.name, lc.phone FROM legacy_clients lc
       UNION ALL
       SELECT p.full_name, p.whatsapp FROM prospects p
     ) x
     WHERE right(regexp_replace(COALESCE(x.phone,''), '\\D', '', 'g'), 10) = $1
       AND COALESCE(x.name,'') <> ''
     LIMIT 1`,
    [last10]
  ).catch(() => ({ rows: [] as any[] }));
  return String(r.rows[0]?.name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
}

// Envía una plantilla bulk_wa_templates a un teléfono suelto (respuesta a botón).
async function sendTemplateToPhone(phone: string, templateId: number): Promise<boolean> {
  const tplRes = await pool.query(
    `SELECT id, template_name, language_code, header_image_url, header_image_key, use_mm_lite, uses_name
       FROM bulk_wa_templates WHERE id = $1 AND is_active = true`,
    [templateId]
  );
  const tpl = tplRes.rows[0];
  if (!tpl) return false;
  let headerImageUrl: string | undefined;
  if (tpl.header_image_key) { try { headerImageUrl = await getSignedUrlForKey(tpl.header_image_key, 6 * 3600); } catch { /* ignore */ } }
  if (!headerImageUrl) headerImageUrl = tpl.header_image_url || undefined;
  const usesName = tpl.uses_name !== false;
  const parameters = usesName ? [await resolveNameByPhone(phone)] : [];
  const r = await sendTemplate({
    to: phone,
    template: tpl.template_name,
    languageCode: tpl.language_code || 'es_MX',
    parameters,
    ...(headerImageUrl ? { headerImageUrl } : {}),
    useMarketingApi: !!tpl.use_mm_lite,
  });
  return !!r.ok;
}

/**
 * Aplica la regla de respuesta que coincida con el botón tocado.
 * Devuelve la acción ejecutada o null si no hubo regla.
 * blacklistFn: callback para mandar a lista negra (lo provee el webhook, que ya
 * sabe resolver el lead_key por teléfono).
 */
export async function applyReplyRule(
  phone: string,
  buttonText: string,
  blacklistFn: () => Promise<void>
): Promise<{ action: string; template_id?: number } | null> {
  await ensureReplyRulesSchema();
  const key = norm(buttonText);
  if (!key) return null;
  // Traer reglas activas y comparar con normalización (tildes/espacios) en JS,
  // porque el match en SQL no ignora acentos.
  const r = await pool.query(
    `SELECT id, action, template_id, button_text FROM wa_reply_rules WHERE is_active = true ORDER BY id DESC`
  );
  const rule = r.rows.find((x: any) => norm(x.button_text) === key);
  if (!rule) return null;
  if (rule.action === 'blacklist') {
    await blacklistFn();
    return { action: 'blacklist' };
  }
  if (rule.action === 'send_template' && rule.template_id) {
    await sendTemplateToPhone(phone, rule.template_id).catch((e) => console.warn('[WA-REPLY] envío plantilla:', e?.message));
    return { action: 'send_template', template_id: rule.template_id };
  }
  return null;
}

// ─── Prueba: enviar una plantilla a un número y devolver el resultado real ──
// POST /api/admin/crm/wa-test-send  { template_id, phone }
export const testSendTemplate = async (req: Request, res: Response): Promise<any> => {
  try {
    const { template_id, phone } = req.body || {};
    if (!template_id || !String(phone || '').trim()) return res.status(400).json({ error: 'Falta plantilla o número' });
    const tplRes = await pool.query(
      `SELECT template_name, language_code, header_image_url, header_image_key, use_mm_lite, uses_name
         FROM bulk_wa_templates WHERE id = $1`,
      [parseInt(String(template_id), 10)]
    );
    const tpl = tplRes.rows[0];
    if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    let headerImageUrl: string | undefined;
    if (tpl.header_image_key) { try { headerImageUrl = await getSignedUrlForKey(tpl.header_image_key, 6 * 3600); } catch { /* */ } }
    if (!headerImageUrl) headerImageUrl = tpl.header_image_url || undefined;
    const parameters = tpl.uses_name !== false ? ['Prueba'] : [];
    const r = await sendTemplate({
      to: String(phone).trim(),
      template: tpl.template_name,
      languageCode: tpl.language_code || 'es_MX',
      parameters,
      ...(headerImageUrl ? { headerImageUrl } : {}),
      useMarketingApi: !!tpl.use_mm_lite,
    });
    if (r.ok) return res.json({ ok: true, template: tpl.template_name, message_id: (r as any).messageId });
    return res.json({ ok: false, template: tpl.template_name, error: (r as any).error || 'Falló el envío' });
  } catch (e: any) {
    console.error('[wa-test-send]', e.message);
    return res.status(500).json({ error: e.message });
  }
};

// GET /api/admin/crm/wa-templates-status → estado de aprobación en Meta
export const listMetaTemplates = async (_req: Request, res: Response): Promise<any> => {
  try {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const ver = process.env.WHATSAPP_API_VERSION || 'v23.0';
    const waba = process.env.WHATSAPP_WABA_ID || '1311055820410416';
    if (!token) return res.status(500).json({ error: 'Sin credenciales de WhatsApp en el servidor' });
    const r = await fetch(`https://graph.facebook.com/${ver}/${waba}/message_templates?fields=name,status,language,category&limit=250`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d: any = await r.json();
    if (!r.ok) return res.status(502).json({ error: d?.error?.message || 'Error consultando Meta' });
    const templates = (d.data || []).map((t: any) => ({ name: t.name, status: t.status, language: t.language, category: t.category }));
    return res.json({ templates });
  } catch (e: any) {
    console.error('[wa-templates-status]', e.message);
    return res.status(500).json({ error: e.message });
  }
};

// ─── CRUD para la UI ────────────────────────────────────────────────────────
export const getReplyRules = async (_req: Request, res: Response): Promise<any> => {
  try {
    await ensureReplyRulesSchema();
    const r = await pool.query(
      `SELECT rr.id, rr.button_text, rr.action, rr.template_id, rr.is_active, rr.created_at,
              t.label AS template_label, t.template_name
         FROM wa_reply_rules rr
         LEFT JOIN bulk_wa_templates t ON t.id = rr.template_id
        ORDER BY rr.id ASC`
    );
    res.json({ success: true, rules: r.rows });
  } catch (error) {
    console.error('Error en getReplyRules:', error);
    res.status(500).json({ success: false, error: 'Error al obtener reglas de respuesta' });
  }
};

export const createReplyRule = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureReplyRulesSchema();
    const { button_text, action, template_id } = req.body || {};
    if (!String(button_text || '').trim()) return res.status(400).json({ success: false, error: 'Falta el texto del botón' });
    const act = action === 'blacklist' ? 'blacklist' : 'send_template';
    if (act === 'send_template' && !template_id) return res.status(400).json({ success: false, error: 'Elige la plantilla a enviar' });
    const r = await pool.query(
      `INSERT INTO wa_reply_rules (button_text, action, template_id) VALUES ($1, $2, $3) RETURNING id`,
      [String(button_text).trim(), act, act === 'send_template' ? parseInt(String(template_id), 10) : null]
    );
    res.json({ success: true, id: r.rows[0].id });
  } catch (error) {
    console.error('Error en createReplyRule:', error);
    res.status(500).json({ success: false, error: 'Error al crear la regla' });
  }
};

export const updateReplyRule = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureReplyRulesSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    const { button_text, action, template_id, is_active } = req.body || {};
    const act = action === 'blacklist' ? 'blacklist' : 'send_template';
    if (act === 'send_template' && !template_id) return res.status(400).json({ success: false, error: 'Elige la plantilla a enviar' });
    await pool.query(
      `UPDATE wa_reply_rules SET button_text = $1, action = $2, template_id = $3, is_active = $4 WHERE id = $5`,
      [String(button_text || '').trim(), act, act === 'send_template' ? parseInt(String(template_id), 10) : null, is_active !== false, id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error en updateReplyRule:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar la regla' });
  }
};

export const deleteReplyRule = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureReplyRulesSchema();
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ success: false, error: 'id inválido' });
    await pool.query(`DELETE FROM wa_reply_rules WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error en deleteReplyRule:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar la regla' });
  }
};
