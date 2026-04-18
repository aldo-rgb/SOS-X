// ============================================
// BELVO CONTROLLER
// Admin endpoints + Webhook receiver
// ============================================

import { Request, Response } from 'express';
import * as belvoService from './belvoService';

// --------------- WIDGET TOKEN ---------------
// POST /api/admin/belvo/widget-token
export async function getWidgetToken(req: Request, res: Response): Promise<any> {
  try {
    if (!belvoService.isBelvoConfigured()) {
      return res.status(503).json({ error: 'Belvo no está configurado. Agrega BELVO_SECRET_ID y BELVO_SECRET_PASSWORD en .env' });
    }
    const { link_id } = req.body || {};
    const token = await belvoService.createWidgetToken({ link_id });
    res.json({ success: true, access: token, environment: belvoService.getBelvoEnv() });
  } catch (error: any) {
    console.error('Error getting Belvo widget token:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error obteniendo token de widget', details: error.response?.data || error.message });
  }
}

// --------------- REGISTER LINK ---------------
// POST /api/admin/belvo/links
export async function registerLink(req: Request, res: Response): Promise<any> {
  try {
    const { emitter_id, link_id, institution, institution_name, access_mode } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!emitter_id || !link_id || !institution) {
      return res.status(400).json({ error: 'Faltan campos requeridos: emitter_id, link_id, institution' });
    }

    const link = await belvoService.registerLink(
      emitter_id, link_id, institution, institution_name || institution, access_mode || 'recurrent', userId
    );

    console.log(`🏦 Belvo link registrado: ${institution_name} → Empresa ${emitter_id}`);
    res.json({ success: true, link });
  } catch (error: any) {
    console.error('Error registering Belvo link:', error.message);
    res.status(500).json({ error: 'Error registrando link de Belvo', details: error.message });
  }
}

// --------------- GET LINKS ---------------
// GET /api/admin/belvo/links
export async function getLinks(req: Request, res: Response): Promise<any> {
  try {
    const emitter_id = req.query.emitter_id as string | undefined;
    const links = emitter_id
      ? await belvoService.getLinksForEmitter(Number(emitter_id))
      : await belvoService.getAllLinks();
    res.json({ success: true, links });
  } catch (error: any) {
    console.error('Error getting Belvo links:', error.message);
    res.status(500).json({ error: 'Error obteniendo links', details: error.message });
  }
}

// --------------- DELETE LINK ---------------
// DELETE /api/admin/belvo/links/:id
export async function deleteLinkHandler(req: Request, res: Response): Promise<any> {
  try {
    const linkId = parseInt(String(req.params.id));
    const deleted = await belvoService.deleteLink(linkId);
    if (!deleted) return res.status(404).json({ error: 'Link no encontrado' });
    res.json({ success: true, message: 'Link eliminado' });
  } catch (error: any) {
    console.error('Error deleting Belvo link:', error.message);
    res.status(500).json({ error: 'Error eliminando link', details: error.message });
  }
}

// --------------- SYNC TRANSACTIONS ---------------
// POST /api/admin/belvo/sync
export async function syncTransactions(req: Request, res: Response): Promise<any> {
  try {
    if (!belvoService.isBelvoConfigured()) {
      return res.status(503).json({ error: 'Belvo no está configurado' });
    }
    const { link_id, days_back } = req.body;
    
    if (link_id) {
      const result = await belvoService.syncLinkTransactions(link_id, days_back || 7);
      res.json({ success: true, ...result });
    } else {
      const results = await belvoService.syncAllLinks(days_back || 3);
      res.json({ success: true, results });
    }
  } catch (error: any) {
    console.error('Error syncing Belvo transactions:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error sincronizando transacciones', details: error.response?.data || error.message });
  }
}

// --------------- GET TRANSACTIONS ---------------
// GET /api/admin/belvo/transactions
export async function getTransactions(req: Request, res: Response): Promise<any> {
  try {
    const transactions = await belvoService.getTransactions({
      ...(req.query.emitter_id ? { emitter_id: Number(req.query.emitter_id) } : {}),
      ...(req.query.match_status ? { match_status: req.query.match_status as string } : {}),
      ...(req.query.date_from ? { date_from: req.query.date_from as string } : {}),
      ...(req.query.date_to ? { date_to: req.query.date_to as string } : {}),
      ...(req.query.type ? { type: req.query.type as string } : {}),
      ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
    });
    res.json({ success: true, transactions, count: transactions.length });
  } catch (error: any) {
    console.error('Error getting Belvo transactions:', error.message);
    res.status(500).json({ error: 'Error obteniendo transacciones', details: error.message });
  }
}

// --------------- STATS ---------------
// GET /api/admin/belvo/stats
export async function getStats(req: Request, res: Response): Promise<any> {
  try {
    const emitterId = req.query.emitter_id ? Number(req.query.emitter_id) : undefined;
    const stats = await belvoService.getStats(emitterId);
    res.json({
      success: true,
      configured: belvoService.isBelvoConfigured(),
      environment: belvoService.getBelvoEnv(),
      ...stats,
    });
  } catch (error: any) {
    console.error('Error getting Belvo stats:', error.message);
    res.status(500).json({ error: 'Error obteniendo estadísticas', details: error.message });
  }
}

// --------------- MANUAL MATCH ---------------
// POST /api/admin/belvo/match
export async function manualMatch(req: Request, res: Response): Promise<any> {
  try {
    const { transaction_id, payment_id } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!transaction_id || !payment_id) {
      return res.status(400).json({ error: 'Faltan transaction_id y payment_id' });
    }

    const matched = await belvoService.manualMatch(transaction_id, payment_id, userId);
    if (!matched) return res.status(400).json({ error: 'Transacción ya matched o no encontrada' });
    res.json({ success: true, message: 'Transacción conciliada manualmente' });
  } catch (error: any) {
    console.error('Error manual matching:', error.message);
    res.status(500).json({ error: 'Error conciliando transacción', details: error.message });
  }
}

// --------------- IGNORE TRANSACTION ---------------
// POST /api/admin/belvo/ignore
export async function ignoreTransaction(req: Request, res: Response): Promise<any> {
  try {
    const { transaction_id } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;
    if (!transaction_id) return res.status(400).json({ error: 'Falta transaction_id' });

    const ignored = await belvoService.ignoreTransaction(transaction_id, userId);
    if (!ignored) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json({ success: true, message: 'Transacción ignorada' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error ignorando transacción', details: error.message });
  }
}

// --------------- WEBHOOK (NO AUTH) ---------------
// POST /api/webhooks/belvo
export async function webhookHandler(req: Request, res: Response): Promise<any> {
  try {
    console.log('🏦 Belvo webhook received:', JSON.stringify(req.body).substring(0, 200));
    
    const result = await belvoService.processWebhookEvent(req.body);
    
    // Belvo expects 200 OK quickly
    res.status(200).json({ received: true, ...result });
  } catch (error: any) {
    console.error('Error processing Belvo webhook:', error.message);
    // Still return 200 to prevent Belvo from retrying
    res.status(200).json({ received: true, error: error.message });
  }
}
