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
ACTÚA COMO: Orlando, un experto en logística Senior de EntregaX con 8 años de experiencia.
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
 * GET /api/support/validate-tracking
 * Valida que un número de guía pertenezca al cliente autenticado
 */
export const validateTracking = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const tracking = (req.query.tracking as string || '').trim().toUpperCase();

    if (!tracking) {
      return res.status(400).json({ success: false, error: 'Número de guía requerido' });
    }

    // Obtener el box_id del usuario autenticado
    const userRes = await pool.query('SELECT box_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    const userBoxId = userRes.rows[0].box_id;

    // 1) Buscar en packages (Aéreo China/USA + PoBox)
    const pkgRes = await pool.query(
      `SELECT id, tracking_internal, child_no, box_id, user_id, description, status
       FROM packages 
       WHERE tracking_internal ILIKE $1 
          OR child_no ILIKE $1
          OR international_tracking ILIKE $1
       LIMIT 1`,
      [tracking]
    );

    if (pkgRes.rows.length > 0) {
      const pkg = pkgRes.rows[0];
      const belongsToUser =
        (pkg.box_id && pkg.box_id.toUpperCase() === (userBoxId || '').toUpperCase()) ||
        (pkg.user_id && pkg.user_id === userId);
      if (!belongsToUser) {
        return res.json({
          success: false,
          valid: false,
          error: `Guía no encontrada para tu número de cliente ${userBoxId}. Solo puedes crear tickets sobre tus propias guías.`,
        });
      }
      return res.json({
        success: true,
        valid: true,
        package: {
          tracking: pkg.tracking_internal,
          description: pkg.description,
          status: pkg.status,
          service: 'AEREO/POBOX',
        },
      });
    }

    // 2) Buscar en maritime_orders (Marítimo)
    const marRes = await pool.query(
      `SELECT id, ordersn, user_id, goods_name, summary_description, status, expresscom, ship_number, container_number, bl_number
       FROM maritime_orders
       WHERE ordersn ILIKE $1
          OR expresscom ILIKE $1
          OR ship_number ILIKE $1
          OR container_number ILIKE $1
          OR bl_number ILIKE $1
       LIMIT 1`,
      [tracking]
    );

    if (marRes.rows.length > 0) {
      const m = marRes.rows[0];
      if (m.user_id && m.user_id !== userId) {
        return res.json({
          success: false,
          valid: false,
          error: `Guía no encontrada para tu número de cliente ${userBoxId}. Solo puedes crear tickets sobre tus propias guías.`,
        });
      }
      return res.json({
        success: true,
        valid: true,
        package: {
          tracking: m.ordersn,
          description: m.summary_description || m.goods_name,
          status: m.status,
          service: 'MARITIMO',
        },
      });
    }

    // 3) Buscar en dhl_packages (DHL)
    const dhlRes = await pool.query(
      `SELECT id, tracking_number, user_id, description, status, client_name
       FROM dhl_packages
       WHERE tracking_number ILIKE $1
       LIMIT 1`,
      [tracking]
    );

    if (dhlRes.rows.length > 0) {
      const d = dhlRes.rows[0];
      if (d.user_id && d.user_id !== userId) {
        return res.json({
          success: false,
          valid: false,
          error: `Guía no encontrada para tu número de cliente ${userBoxId}. Solo puedes crear tickets sobre tus propias guías.`,
        });
      }
      return res.json({
        success: true,
        valid: true,
        package: {
          tracking: d.tracking_number,
          description: d.description || d.client_name,
          status: d.status,
          service: 'DHL',
        },
      });
    }

    return res.json({
      success: false,
      valid: false,
      error: `Guía "${tracking}" no encontrada. Verifica el número e intenta de nuevo.`,
    });
  } catch (error) {
    console.error('Error validando tracking:', error);
    return res.status(500).json({ success: false, error: 'Error al validar guía' });
  }
};

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
    const userId = (req as any).user?.userId;
    
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

/**
 * POST /api/support/ticket/:id/message
 * Cliente envía un mensaje a su propio ticket
 */
export const clientReplyTicket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = (req as any).user?.userId;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    // Verificar que el ticket pertenece al cliente
    const ticketCheck = await pool.query(
      `SELECT id, status FROM support_tickets WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    // Guardar mensaje del cliente
    await pool.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, message) VALUES ($1, 'client', $2)`,
      [id, message.trim()]
    );

    // Si el ticket estaba resuelto/cerrado, reabrirlo automáticamente
    const ticket = ticketCheck.rows[0];
    const reopened = ticket.status === 'resolved' || ticket.status === 'closed';

    // Actualizar estado del ticket a waiting_agent (reabrir si estaba cerrado)
    await pool.query(
      `UPDATE support_tickets SET status = 'waiting_agent', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ success: true, message: reopened ? 'Ticket reabierto con nuevo mensaje' : 'Mensaje enviado', reopened });
  } catch (error) {
    console.error('Error enviando mensaje de cliente:', error);
    res.status(500).json({ error: 'Error enviando mensaje' });
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
    const agentId = (req as any).user?.userId;

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

// ============================================================
// 🆘 RECLAMACIÓN PÚBLICA DE NÚMERO DE CLIENTE (sin login)
// ============================================================
// Permite a un visitante levantar un ticket cuando alguien más
// activó su número de cliente. Sube su INE, correo y teléfono.

const claimsUploadsDir = path.join(__dirname, '..', 'uploads', 'support', 'claims');
try {
  if (!fs.existsSync(claimsUploadsDir)) {
    fs.mkdirSync(claimsUploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('⚠️ No se pudo crear directorio de claims:', e);
}

const claimsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, claimsUploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `claim-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const claimsMulter = multer({
  storage: claimsStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) cb(null, true);
    else cb(null, false);
  }
}).fields([
  { name: 'ine_front', maxCount: 1 },
  { name: 'ine_back', maxCount: 1 }
]);

export const uploadBoxIdClaimFiles = (req: Request, res: Response, next: Function) => {
  claimsMulter(req, res, (err: any) => {
    if (err) {
      console.warn('⚠️ Error multer claims (continuando):', err.message || err);
    }
    next();
  });
};

// Asegurar tabla de claims (idempotente)
let _claimsTableEnsured = false;
const ensureClaimsTable = async () => {
  if (_claimsTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS box_id_claims (
        id SERIAL PRIMARY KEY,
        folio VARCHAR(32) UNIQUE NOT NULL,
        claimed_box_id VARCHAR(64) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(64) NOT NULL,
        message TEXT,
        ine_front_url TEXT,
        ine_back_url TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        resolved_by_user_id INTEGER,
        resolved_at TIMESTAMP,
        ip_address VARCHAR(64),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_box_id_claims_status ON box_id_claims(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_box_id_claims_box ON box_id_claims(claimed_box_id)`);
    _claimsTableEnsured = true;
  } catch (e) {
    console.error('Error asegurando tabla box_id_claims:', e);
  }
};

const generateClaimFolio = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CLM-${ts}-${rand}`;
};

// 🌐 PÚBLICO: Levantar reclamación de box_id (sin auth)
export const submitBoxIdClaim = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureClaimsTable();

    const {
      box_id,
      full_name,
      email,
      phone,
      message
    } = req.body || {};

    // Validaciones básicas
    if (!box_id || String(box_id).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Número de cliente requerido' });
    }
    if (!full_name || String(full_name).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Nombre completo requerido' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
    }
    if (!phone || String(phone).trim().length < 7) {
      return res.status(400).json({ success: false, error: 'Teléfono requerido' });
    }

    const files = (req as any).files || {};
    const ineFrontFile = files.ine_front?.[0];
    const ineBackFile = files.ine_back?.[0];

    if (!ineFrontFile) {
      return res.status(400).json({ success: false, error: 'Foto de INE (frente) requerida' });
    }

    const apiBase = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const ineFrontUrl = `${apiBase}/uploads/support/claims/${ineFrontFile.filename}`;
    const ineBackUrl = ineBackFile ? `${apiBase}/uploads/support/claims/${ineBackFile.filename}` : null;

    const folio = generateClaimFolio();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const ua = req.headers['user-agent'] || '';

    const inserted = await pool.query(
      `INSERT INTO box_id_claims
         (folio, claimed_box_id, full_name, email, phone, message,
          ine_front_url, ine_back_url, status, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
       RETURNING id, folio, created_at`,
      [
        folio,
        String(box_id).trim().toUpperCase(),
        String(full_name).trim(),
        String(email).trim().toLowerCase(),
        String(phone).trim(),
        message ? String(message).trim().slice(0, 2000) : null,
        ineFrontUrl,
        ineBackUrl,
        ip.slice(0, 60),
        String(ua).slice(0, 500)
      ]
    );

    const claim = inserted.rows[0];

    // Notificar a todo Servicio a Cliente + Admins
    try {
      const { createCustomNotification } = await import('./notificationController');
      const staff = await pool.query(
        `SELECT id FROM users
          WHERE role IN ('customer_service','admin','super_admin')
            AND (status IS NULL OR status = 'active')`
      );
      const title = '🆘 Reclamación de número de cliente';
      const msg = `${claim.folio}: ${full_name} reclama el número ${String(box_id).toUpperCase()}`;
      const actionUrl = `/admin/support/box-id-claims/${claim.id}`;
      await Promise.all(
        staff.rows.map((s: any) =>
          createCustomNotification(
            s.id,
            title,
            msg,
            'warning',
            'shield-alert',
            { claimId: claim.id, folio: claim.folio, boxId: String(box_id).toUpperCase() },
            actionUrl
          )
        )
      );
    } catch (notifErr) {
      console.warn('No se pudo notificar a staff sobre claim:', notifErr);
    }

    return res.json({
      success: true,
      folio: claim.folio,
      claimId: claim.id,
      message: 'Tu reclamación fue registrada. Servicio a cliente la revisará y te contactará a tu correo.'
    });
  } catch (error: any) {
    console.error('Error en submitBoxIdClaim:', error);
    return res.status(500).json({ success: false, error: 'Error al registrar la reclamación' });
  }
};

// 👮 ADMIN: Listar claims
export const getBoxIdClaims = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureClaimsTable();
    const { status } = req.query;
    let q = `SELECT * FROM box_id_claims`;
    const params: any[] = [];
    if (status && typeof status === 'string') {
      params.push(status);
      q += ` WHERE status = $1`;
    }
    q += ` ORDER BY created_at DESC LIMIT 200`;
    const r = await pool.query(q, params);
    return res.json({ success: true, claims: r.rows });
  } catch (error) {
    console.error('Error getBoxIdClaims:', error);
    return res.status(500).json({ success: false, error: 'Error al obtener reclamaciones' });
  }
};

// 👮 ADMIN: Resolver claim
export const resolveBoxIdClaim = async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureClaimsTable();
    const { id } = req.params;
    const { status, admin_notes } = req.body || {};
    const userId = (req as any).user?.userId;
    const allowed = ['pending', 'in_review', 'resolved', 'rejected'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado inválido' });
    }
    const isFinal = status === 'resolved' || status === 'rejected';
    await pool.query(
      `UPDATE box_id_claims
          SET status = $1,
              admin_notes = COALESCE($2, admin_notes),
              resolved_by_user_id = CASE WHEN $3::boolean THEN $4 ELSE resolved_by_user_id END,
              resolved_at = CASE WHEN $3::boolean THEN NOW() ELSE resolved_at END
        WHERE id = $5`,
      [status, admin_notes || null, isFinal, userId, id]
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Error resolveBoxIdClaim:', error);
    return res.status(500).json({ success: false, error: 'Error al actualizar reclamación' });
  }
};
