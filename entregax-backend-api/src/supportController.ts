/**
 * EntregaX Support Desk Controller
 * Sistema de soporte con IA (OpenAI) + escalamiento humano
 */

import { Request, Response } from 'express';
import { pool } from './db';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// ============================================================
// CONFIGURACIÓN DE MULTER PARA IMÁGENES DE SOPORTE
// ============================================================
const supportUploadsDir = path.join(__dirname, '..', 'uploads', 'support');
try {
  if (!fs.existsSync(supportUploadsDir)) {
    fs.mkdirSync(supportUploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('⚠️ No se pudo crear directorio de uploads de soporte:', e);
}

const supportStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, supportUploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `support-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const multerUpload = multer({
  storage: supportStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB por imagen
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(null, false); // Ignorar archivo no válido en vez de lanzar error
    }
  }
}).array('images', 10);

// Wrapper que maneja errores de multer sin crashear el request
export const uploadSupportImages = (req: Request, res: Response, next: Function) => {
  multerUpload(req, res, (err: any) => {
    if (err) {
      console.warn('⚠️ Error de multer (ignorando, continuando sin imágenes):', err.message || err);
      // Continuar sin archivos, no bloquear el ticket
    }
    next();
  });
};

// ============================================================
// CONFIGURACIÓN DE IA (OpenAI)
// ============================================================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Prompt del sistema - Personalidad HUMANA del agente
const SYSTEM_PROMPT = `
ACTÚA COMO: Javier, un experto en logística Senior de EntregaX con 8 años de experiencia.
CONTEXTO: Estás chateando por la app móvil con un cliente que necesita ayuda.

🔴 REGLAS DE ORO (MUY IMPORTANTES):
1. NUNCA digas que eres una IA, un bot, un asistente virtual o automático.
2. Habla siempre en primera persona ("Yo reviso", "Déjame ver", "Te ayudo").
3. Sé breve y casual, pero profesional. Como si escribieras por WhatsApp.
4. No uses listas con viñetas largas ni saludos robóticos.
5. Responde en español de México.
6. Si el cliente está muy enojado, frustrado o pide hablar con alguien más, di algo como "Entiendo, voy a escalar esto con mi supervisor" e incluye "[ESCALAR]" al final.

✅ EJEMPLO DE ESTILO CORRECTO:
Mal: "Hola, soy un asistente virtual. ¿En qué puedo ayudarte? Seleccione: 1. Rastreo 2. Facturación..."
Bien: "Claro, pásame tu número de guía y te digo dónde anda tu paquete 📦"

📦 CONOCIMIENTO DE ENTREGAX:
- Aéreo China → México: 7-12 días hábiles
- Marítimo China → México: 35-45 días
- Aéreo USA → México: 5-8 días hábiles
- Garantía Extendida (GEX): Seguro opcional para proteger cargas

💡 RESPUESTAS TÍPICAS:
- "¿Dónde está mi paquete?" → Pide el TRN y busca en sistema
- "¿Cuánto cuesta?" → Depende del peso volumétrico, ofrece cotizar
- "Necesito factura" → Se solicita en la app, sección Mi Perfil > Datos Fiscales
- "Mi paquete llegó roto" → Pide fotos, ofrece abrir reclamación

TONO: Amigable pero profesional. Como un colega que sabe mucho y quiere ayudar.
`;

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Genera un folio único para tickets
 */
async function generateTicketFolio(): Promise<string> {
  const result = await pool.query("SELECT nextval('ticket_sequence')");
  const num = result.rows[0].nextval;
  const year = new Date().getFullYear();
  return `TKT-${year}-${String(num).padStart(4, '0')}`;
}

/**
 * Busca información de un paquete por tracking
 */
async function checkPackageStatus(tracking: string): Promise<string> {
  const result = await pool.query(
    `SELECT p.*, u.full_name 
     FROM packages p 
     LEFT JOIN users u ON p.user_id = u.id 
     WHERE p.tracking_internal = $1 OR p.tracking_origin = $1
     LIMIT 1`,
    [tracking.toUpperCase()]
  );

  if (result.rows.length === 0) {
    return `No encontré ningún paquete con la guía "${tracking}". Verifica que el número sea correcto.`;
  }

  const pkg = result.rows[0];
  const statusLabels: Record<string, string> = {
    received: '📦 Recibido en bodega',
    in_transit: '🚚 En tránsito hacia México',
    processing: '📋 Procesando envío',
    shipped: '✈️ Vuelo confirmado',
    delivered: '✅ Entregado',
    pending: '⏳ Pendiente',
  };

  return `📦 **Paquete encontrado:**
- TRN: ${pkg.tracking_internal}
- Descripción: ${pkg.description || 'Sin descripción'}
- Estado: ${statusLabels[pkg.status] || pkg.status}
- Peso: ${pkg.weight_kg || 'Por confirmar'} kg
${pkg.has_gex ? '🛡️ Con Garantía Extendida' : ''}`;
}

/**
 * Llama a OpenAI para generar respuesta
 */
async function getAIResponse(userMessage: string, chatHistory: any[]): Promise<{ response: string; shouldEscalate: boolean }> {
  // Si no hay API key, usar respuesta de fallback
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY no configurada, usando respuesta de fallback');
    return {
      response: `Gracias por contactarnos. Tu mensaje ha sido recibido: "${userMessage.substring(0, 50)}..."\n\nUn agente te atenderá pronto. 🙏`,
      shouldEscalate: true
    };
  }

  try {
    // Detectar si hay tracking en el mensaje
    const trackingMatch = userMessage.match(/\b(US-[A-Z0-9]+|CN-[A-Z0-9]+|[A-Z]{2}\d{9}[A-Z]{2})\b/i);
    let contextInfo = '';
    
    if (trackingMatch) {
      contextInfo = await checkPackageStatus(trackingMatch[0]);
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...chatHistory.slice(-6).map((m: any) => ({
        role: m.sender_type === 'client' ? 'user' : 'assistant',
        content: m.message
      })),
      { 
        role: 'user', 
        content: contextInfo 
          ? `[CONTEXTO DEL SISTEMA: ${contextInfo}]\n\nMensaje del cliente: ${userMessage}`
          : userMessage 
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Más económico que gpt-4o
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const aiText = data.choices[0]?.message?.content || 'Lo siento, hubo un error procesando tu solicitud.';
    
    const shouldEscalate = aiText.includes('[ESCALAR]');
    const cleanResponse = aiText.replace('[ESCALAR]', '').trim();

    return { response: cleanResponse, shouldEscalate };
  } catch (error) {
    console.error('Error OpenAI:', error);
    return {
      response: 'Disculpa, estoy teniendo problemas técnicos. Un agente humano te atenderá en breve. 🙏',
      shouldEscalate: true
    };
  }
}

// ============================================================
// ENDPOINTS
// ============================================================

/**
 * POST /api/support/message
 * Enviar mensaje al chat de soporte (cliente)
 * Soporta multipart/form-data para adjuntar imágenes
 */
export const handleSupportMessage = async (req: Request, res: Response): Promise<any> => {
  try {
    // Obtener userId del JWT (el token contiene userId, no id)
    const userId = (req as any).user?.userId || req.body.userId;
    const message = req.body.message;
    const ticketId = req.body.ticketId;

    console.log(`🎫 [SUPPORT] userId=${userId}, message=${message?.substring(0, 50)}, hasFiles=${!!(req.files as any[])?.length}`);
    const category = req.body.category;
    const escalateDirectly = req.body.escalateDirectly === 'true' || req.body.escalateDirectly === true;
    
    // Obtener archivos si hay (de multer)
    const files = req.files as Express.Multer.File[] | undefined;

    if (!userId || !message) {
      return res.status(400).json({ error: 'userId y message son requeridos' });
    }

    let currentTicketId = ticketId;
    let ticketFolio = '';
    
    // Procesar URLs de imágenes adjuntas
    let imageUrls: string[] = [];
    if (files && files.length > 0) {
      const baseUrl = process.env.API_URL || 'http://localhost:3001';
      imageUrls = files.map(f => `${baseUrl}/uploads/support/${f.filename}`);
    }

    // A. CREAR NUEVO TICKET SI NO EXISTE
    if (!currentTicketId) {
      const folio = await generateTicketFolio();
      ticketFolio = folio;
      const subject = message.length > 50 ? message.substring(0, 47) + '...' : message;
      
      // Si escalateDirectly es true, crear directamente como escalated_human
      const initialStatus = escalateDirectly ? 'escalated_human' : 'open_ai';
      
      const newTicket = await pool.query(
        `INSERT INTO support_tickets (ticket_folio, user_id, category, subject, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, ticket_folio`,
        [folio, userId, category || 'other', subject, initialStatus]
      );
      currentTicketId = newTicket.rows[0].id;
      ticketFolio = newTicket.rows[0].ticket_folio;
      console.log(`🎫 Nuevo ticket creado: ${folio} (${initialStatus})${imageUrls.length > 0 ? ` con ${imageUrls.length} imágenes` : ''}`);
      
      // Si es escalado directo, guardar mensaje con imágenes y retornar inmediatamente
      if (escalateDirectly) {
        // Construir mensaje con referencias a imágenes
        let fullMessage = message;
        if (imageUrls.length > 0) {
          fullMessage += '\n\n📷 Imágenes adjuntas:\n' + imageUrls.map((url, i) => `[Imagen ${i+1}](${url})`).join('\n');
        }
        
        await pool.query(
          `INSERT INTO ticket_messages (ticket_id, sender_type, message, attachments) VALUES ($1, 'client', $2, $3)`,
          [currentTicketId, fullMessage, JSON.stringify(imageUrls)]
        );
        
        return res.json({
          status: 'escalated',
          ticketId: currentTicketId,
          ticketFolio: ticketFolio,
          message: '✅ Ticket creado. Un agente humano te atenderá pronto.',
          imagesUploaded: imageUrls.length
        });
      }
    } else {
      // Si es ticket existente y hay imágenes, guardarlas con el mensaje
      let fullMessage = message;
      if (imageUrls.length > 0) {
        fullMessage += '\n\n📷 Imágenes adjuntas:\n' + imageUrls.map((url, i) => `[Imagen ${i+1}](${url})`).join('\n');
      }
      
      await pool.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message, attachments) VALUES ($1, 'client', $2, $3)`,
        [currentTicketId, fullMessage, JSON.stringify(imageUrls)]
      );
    }

    // B. GUARDAR MENSAJE DEL CLIENTE
    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, message) VALUES ($1, 'client', $2)`,
      [currentTicketId, message]
    );

    // C. VERIFICAR ESTADO DEL TICKET
    const ticketCheck = await pool.query(
      'SELECT status, ticket_folio FROM support_tickets WHERE id = $1',
      [currentTicketId]
    );

    // Si ya está asignado a humano, no interviene la IA
    if (ticketCheck.rows[0].status === 'escalated_human') {
      await pool.query(
        "UPDATE support_tickets SET updated_at = NOW() WHERE id = $1",
        [currentTicketId]
      );
      return res.json({
        status: 'waiting_agent',
        ticketId: currentTicketId,
        ticketFolio: ticketCheck.rows[0].ticket_folio,
        message: 'Tu mensaje fue enviado. Un agente te responderá pronto.'
      });
    }

    // D. OBTENER HISTORIAL PARA CONTEXTO
    const history = await pool.query(
      `SELECT sender_type, message FROM ticket_messages 
       WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [currentTicketId]
    );

    // E. GENERAR RESPUESTA IA
    const { response: aiResponse, shouldEscalate } = await getAIResponse(
      message,
      history.rows.reverse()
    );

    // F. GUARDAR RESPUESTA DE LA IA
    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, message) VALUES ($1, 'ai', $2)`,
      [currentTicketId, aiResponse]
    );

    // G. MANEJAR ESCALAMIENTO
    if (shouldEscalate) {
      await pool.query(
        "UPDATE support_tickets SET status = 'escalated_human', updated_at = NOW() WHERE id = $1",
        [currentTicketId]
      );
      console.log(`⚠️ Ticket ${ticketCheck.rows[0].ticket_folio} escalado a humano`);
      
      return res.json({
        status: 'escalated',
        ticketId: currentTicketId,
        ticketFolio: ticketCheck.rows[0].ticket_folio,
        response: aiResponse,
        message: 'Un agente humano ha sido notificado y te contactará pronto.'
      });
    }

    // H. RESPUESTA NORMAL DE LA IA
    await pool.query(
      "UPDATE support_tickets SET updated_at = NOW() WHERE id = $1",
      [currentTicketId]
    );

    return res.json({
      status: 'ai_replied',
      ticketId: currentTicketId,
      ticketFolio: ticketCheck.rows[0].ticket_folio,
      response: aiResponse
    });

  } catch (error) {
    console.error('Error en soporte:', error);
    res.status(500).json({ error: 'Error procesando mensaje de soporte' });
  }
};

/**
 * GET /api/support/tickets
 * Obtener tickets del usuario (cliente)
 */
export const getMyTickets = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    
    const result = await pool.query(
      `SELECT id, ticket_folio, category, subject, status, priority, created_at, updated_at
       FROM support_tickets 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tickets:', error);
    res.status(500).json({ error: 'Error obteniendo tickets' });
  }
};

/**
 * GET /api/support/ticket/:id/messages
 * Obtener mensajes de un ticket (cliente)
 */
export const getTicketMessages = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT id, sender_type, message, attachment_url, created_at
       FROM ticket_messages 
       WHERE ticket_id = $1 
       ORDER BY created_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
};

// ============================================================
// ENDPOINTS ADMIN (Panel de Soporte)
// ============================================================

/**
 * GET /api/admin/support/tickets
 * Obtener todos los tickets para el tablero Kanban
 */
export const getAdminTickets = async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, limit = 50 } = req.query;

    let query = `
      SELECT t.*, u.full_name, u.email, u.phone,
             (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count,
             (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM support_tickets t
      LEFT JOIN users u ON t.user_id = u.id
    `;

    const params: any[] = [];
    if (status) {
      query += ` WHERE t.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY 
      CASE t.status 
        WHEN 'escalated_human' THEN 1 
        WHEN 'open_ai' THEN 2 
        WHEN 'waiting_client' THEN 3 
        ELSE 4 
      END,
      t.updated_at DESC
      LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tickets admin:', error);
    res.status(500).json({ error: 'Error obteniendo tickets' });
  }
};

/**
 * GET /api/admin/support/stats
 * Estadísticas del soporte
 */
export const getSupportStats = async (req: Request, res: Response): Promise<any> => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'open_ai') as ai_handling,
        COUNT(*) FILTER (WHERE status = 'escalated_human') as needs_human,
        COUNT(*) FILTER (WHERE status = 'waiting_client') as waiting_client,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today_new,
        COUNT(*) FILTER (WHERE resolved_at > NOW() - INTERVAL '24 hours') as today_resolved
      FROM support_tickets
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
};

/**
 * POST /api/admin/support/ticket/:id/reply
 * Responder como agente humano
 */
export const adminReplyTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const agentId = (req as any).user?.id;

    if (!message) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    // Guardar mensaje del agente
    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, message) VALUES ($1, 'agent', $2)`,
      [id, message]
    );

    // Actualizar ticket: asignar agente y cambiar estado
    await pool.query(
      `UPDATE support_tickets 
       SET assigned_agent_id = $1, status = 'waiting_client', updated_at = NOW() 
       WHERE id = $2`,
      [agentId, id]
    );

    res.json({ success: true, message: 'Respuesta enviada' });
  } catch (error) {
    console.error('Error respondiendo ticket:', error);
    res.status(500).json({ error: 'Error enviando respuesta' });
  }
};

/**
 * PUT /api/admin/support/ticket/:id/resolve
 * Marcar ticket como resuelto
 */
export const resolveTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE support_tickets 
       SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true, message: 'Ticket resuelto' });
  } catch (error) {
    console.error('Error resolviendo ticket:', error);
    res.status(500).json({ error: 'Error resolviendo ticket' });
  }
};

/**
 * PUT /api/admin/support/ticket/:id/assign
 * Asignar ticket a un agente
 */
export const assignTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    await pool.query(
      `UPDATE support_tickets 
       SET assigned_agent_id = $1, status = 'escalated_human', updated_at = NOW() 
       WHERE id = $2`,
      [agentId, id]
    );

    res.json({ success: true, message: 'Ticket asignado' });
  } catch (error) {
    console.error('Error asignando ticket:', error);
    res.status(500).json({ error: 'Error asignando ticket' });
  }
};
