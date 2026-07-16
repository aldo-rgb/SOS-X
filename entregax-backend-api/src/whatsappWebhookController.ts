// ============================================================================
// 📩 WEBHOOK ENTRANTE DE WHATSAPP (Cloud API)
// ============================================================================
// Recibe mensajes entrantes y estatuses del número de WhatsApp Business.
// Usos:
//   - Si el cliente RESPONDE (texto o botón) → sale de la secuencia automatizada.
//   - Si escribe STOP/BAJA → se agrega a la blacklist (no más mensajes masivos).
//
// Configurar en Meta (WhatsApp → Configuración → Webhooks):
//   Callback URL: https://api.entregax.app/api/webhooks/whatsapp
//   Verify token: WHATSAPP_WEBHOOK_VERIFY_TOKEN
//   Campos suscritos: messages
// ============================================================================

import { Request, Response } from 'express';
import { pool } from './db';
import { stopSequenceByPhone } from './waSequenceController';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.FB_VERIFY_TOKEN || '';

const STOP_WORDS = ['stop', 'baja', 'no', 'cancelar', 'unsubscribe', 'dar de baja', 'no gracias', 'eliminar'];

const normPhone = (p: any): string => { const d = String(p ?? '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };

// GET /api/webhooks/whatsapp → verificación de Meta
export const verifyWhatsappWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
    console.log('[WA-WEBHOOK] Verificado ✓');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// Resuelve el lead_key (crm/lc/pr) que coincide con un teléfono (últimos 10 dígitos).
async function resolveLeadKeyByPhone(phone: string): Promise<string | null> {
  const last10 = normPhone(phone);
  if (!last10) return null;
  const r = await pool.query(
    `SELECT lead_key FROM (
       SELECT ('crm_' || r.id::text) AS lead_key, u.phone FROM crm_requests r JOIN users u ON r.user_id=u.id
       UNION ALL
       SELECT ('lc_' || lc.id::text), lc.phone FROM legacy_clients lc
       UNION ALL
       SELECT ('pr_' || p.id::text), p.whatsapp FROM prospects p
     ) x
     WHERE right(regexp_replace(COALESCE(x.phone,''), '\\D', '', 'g'), 10) = $1
     LIMIT 1`,
    [last10]
  );
  return r.rows[0]?.lead_key || null;
}

let logReady = false;
async function ensureLog(): Promise<void> {
  if (logReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS wa_webhook_log (id SERIAL PRIMARY KEY, payload JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
  logReady = true;
}

// POST /api/webhooks/whatsapp → eventos entrantes
export const handleWhatsappWebhook = async (req: Request, res: Response): Promise<any> => {
  // Responder 200 rápido (Meta reintenta si no).
  res.sendStatus(200);
  try {
    const body = req.body;
    // LOG TEMPORAL: registrar TODO lo que llega para diagnóstico.
    try { await ensureLog(); await pool.query(`INSERT INTO wa_webhook_log (payload) VALUES ($1::jsonb)`, [JSON.stringify(body || {})]); } catch { /* ignore */ }
    if (!body || body.object !== 'whatsapp_business_account') return;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const messages = value.messages || [];
        for (const msg of messages) {
          const from: string = msg.from || '';
          if (!from) continue;
          // Texto o payload del botón.
          let text = '';
          if (msg.type === 'text') text = msg.text?.body || '';
          else if (msg.type === 'button') text = msg.button?.text || msg.button?.payload || '';
          else if (msg.type === 'interactive') text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
          const norm = text.trim().toLowerCase();

          // Cualquier respuesta saca al lead de la secuencia automatizada.
          const stopped = await stopSequenceByPhone(from, 'responded');
          if (stopped) console.log(`[WA-WEBHOOK] ${from} respondió → secuencia detenida (${stopped})`);

          // STOP / baja → blacklist.
          if (STOP_WORDS.includes(norm)) {
            const leadKey = await resolveLeadKeyByPhone(from);
            if (leadKey) {
              await pool.query(
                `INSERT INTO lead_blacklist (lead_key, reason) VALUES ($1, 'opt_out (STOP por WhatsApp)')
                 ON CONFLICT (lead_key) DO NOTHING`,
                [leadKey]
              ).catch(() => {});
              // Si es prospecto, marcarlo como perdido.
              if (leadKey.startsWith('pr_')) {
                const pid = parseInt(leadKey.slice(3), 10);
                if (pid) await pool.query(`UPDATE prospects SET status='lost', updated_at=NOW() WHERE id=$1`, [pid]).catch(() => {});
              }
              console.log(`[WA-WEBHOOK] ${from} pidió STOP → blacklist (${leadKey})`);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[WA-WEBHOOK] error:', (e as Error).message);
  }
};
