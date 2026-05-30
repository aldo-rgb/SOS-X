// ============================================================
// SYNCFY CONTROLLER
// Endpoints admin para integración Syncfy (reemplazo de Belvo).
// Multi-empresa: cada fiscal_emitter tiene su propio id_user.
// ============================================================

import { Request, Response } from 'express';
import * as syncfy from './syncfyService';
import { pool } from './db';

// --------------- WIDGET / SESSION TOKEN ---------------
// POST /api/admin/syncfy/widget-token  body: { emitter_id }
export async function getWidgetToken(req: Request, res: Response): Promise<any> {
  try {
    if (!syncfy.isSyncfyConfigured()) {
      return res.status(503).json({ error: 'Syncfy no está configurado. Agrega SYNCFY_API_KEY en .env' });
    }
    const { emitter_id } = req.body || {};
    if (!emitter_id) return res.status(400).json({ error: 'Falta emitter_id' });
    const userId = (req as any).user?.userId || (req as any).user?.id;

    const { id_user } = await syncfy.ensureUserForEmitter(Number(emitter_id), userId);
    const token = await syncfy.createSessionToken(id_user);

    res.json({
      success: true,
      token,
      id_user,
      environment: syncfy.getSyncfyEnv(),
      widget_base: syncfy.getSyncfyWidgetBase(),
    });
  } catch (e: any) {
    console.error('Syncfy widget-token error:', e.response?.data || e.message);
    res.status(500).json({ error: 'Error obteniendo token de widget', details: e.response?.data || e.message });
  }
}

// --------------- LIST CREDENTIALS ---------------
// GET /api/admin/syncfy/links?emitter_id=
export async function getLinks(req: Request, res: Response): Promise<any> {
  try {
    const emitterId = req.query.emitter_id ? Number(req.query.emitter_id) : null;
    if (emitterId) {
      const rows = await syncfy.refreshCredentialsForEmitter(emitterId);
      return res.json({ success: true, links: rows });
    }
    const all = await pool.query(`
      SELECT sc.*, fe.alias AS emitter_alias, fe.rfc AS emitter_rfc
      FROM syncfy_credentials sc
      JOIN fiscal_emitters fe ON fe.id = sc.emitter_id
      ORDER BY sc.id DESC
    `);
    res.json({ success: true, links: all.rows });
  } catch (e: any) {
    console.error('Syncfy getLinks error:', e.message);
    res.status(500).json({ error: 'Error listando credenciales', details: e.message });
  }
}

// --------------- REGISTER LINK (post-widget) ---------------
// POST /api/admin/syncfy/links  body: { emitter_id, id_credential }
// El widget de Syncfy crea la credencial server-side; este endpoint
// solo sincroniza nuestro mirror local.
export async function registerLink(req: Request, res: Response): Promise<any> {
  try {
    const { emitter_id } = req.body || {};
    if (!emitter_id) return res.status(400).json({ error: 'Falta emitter_id' });
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const rows = await syncfy.refreshCredentialsForEmitter(Number(emitter_id), userId);
    res.json({ success: true, links: rows });
  } catch (e: any) {
    console.error('Syncfy registerLink error:', e.message);
    res.status(500).json({ error: 'Error registrando credencial', details: e.message });
  }
}

// --------------- DELETE LINK ---------------
// DELETE /api/admin/syncfy/links/:id
export async function deleteLinkHandler(req: Request, res: Response): Promise<any> {
  try {
    const id = parseInt(String(req.params.id), 10);
    const ok = await syncfy.deleteCredential(id);
    if (!ok) return res.status(404).json({ error: 'Credencial no encontrada' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Error eliminando credencial', details: e.message });
  }
}

// --------------- SYNC ---------------
// POST /api/admin/syncfy/sync  body: { emitter_id?, days_back? }
export async function syncTransactions(req: Request, res: Response): Promise<any> {
  try {
    if (!syncfy.isSyncfyConfigured()) {
      return res.status(503).json({ error: 'Syncfy no está configurado' });
    }
    const { emitter_id, days_back } = req.body || {};
    if (emitter_id) {
      const r = await syncfy.syncEmitter(Number(emitter_id), Number(days_back) || 7);
      return res.json({ success: true, ...r });
    }
    const results = await syncfy.syncAllEmitters(Number(days_back) || 3);
    res.json({ success: true, results });
  } catch (e: any) {
    console.error('Syncfy sync error:', e.response?.data || e.message);
    res.status(500).json({ error: 'Error sincronizando', details: e.response?.data || e.message });
  }
}

// --------------- STATS ---------------
// GET /api/admin/syncfy/stats?emitter_id=
export async function getStats(req: Request, res: Response): Promise<any> {
  try {
    const emitterId = req.query.emitter_id ? Number(req.query.emitter_id) : undefined;
    const stats = await syncfy.getStats(emitterId);
    res.json({
      success: true,
      configured: syncfy.isSyncfyConfigured(),
      environment: syncfy.getSyncfyEnv(),
      ...stats,
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Error obteniendo stats', details: e.message });
  }
}

// --------------- MANUAL MATCH / IGNORE ---------------
export async function manualMatch(req: Request, res: Response): Promise<any> {
  try {
    const { transaction_id, payment_id } = req.body || {};
    const userId = (req as any).user?.userId || (req as any).user?.id;
    if (!transaction_id || !payment_id) return res.status(400).json({ error: 'Faltan ids' });
    const ok = await syncfy.manualMatch(Number(transaction_id), Number(payment_id), userId);
    if (!ok) return res.status(400).json({ error: 'Transacción ya conciliada o no encontrada' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Error conciliando', details: e.message });
  }
}

export async function ignoreTransaction(req: Request, res: Response): Promise<any> {
  try {
    const { transaction_id } = req.body || {};
    const userId = (req as any).user?.userId || (req as any).user?.id;
    if (!transaction_id) return res.status(400).json({ error: 'Falta transaction_id' });
    const ok = await syncfy.ignoreTransaction(Number(transaction_id), userId);
    if (!ok) return res.status(404).json({ error: 'No encontrada' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Error', details: e.message });
  }
}

// --------------- WEBHOOK (NO AUTH) ---------------
// POST /api/webhooks/syncfy
export async function webhookHandler(req: Request, res: Response): Promise<any> {
  try {
    const signature = (req.headers['x-syncfy-signature'] || req.headers['x-paybook-signature']) as string | undefined;
    const rawBody = JSON.stringify(req.body);

    if (!syncfy.verifyWebhookSignature(rawBody, signature)) {
      console.warn('⚠️ Syncfy webhook: firma inválida');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    console.log('🏦 Syncfy webhook:', String(rawBody).slice(0, 200));
    const result = await syncfy.processWebhookEvent(req.body);
    res.status(200).json({ received: true, ...result });
  } catch (e: any) {
    console.error('Syncfy webhook error:', e.message);
    res.status(200).json({ received: true, error: e.message });
  }
}
