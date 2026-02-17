import { Request, Response } from 'express';
import axios from 'axios';
import { pool } from './db';
import OpenAI from 'openai';

// ============================================================
// FACEBOOK MESSENGER INTEGRATION - EntregaX AI Sales Agent
// ============================================================

// Lazy initialization - only create OpenAI client when API key exists
let openaiInstance: OpenAI | null = null;
const getOpenAI = (): OpenAI => {
    if (!openaiInstance) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY no configurada');
        }
        openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiInstance;
};

// Proxy para mantener compatibilidad con código existente (openai.chat.completions.create)
const openai = new Proxy({} as OpenAI, {
    get(_, prop) {
        return getOpenAI()[prop as keyof OpenAI];
    }
});
const FB_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

// SYSTEM PROMPT: Personalidad del Asesor Digital EntregaX
const SALES_PROMPT = `
Eres el Asesor Digital de EntregaX, una empresa especializada en importaciones desde China y USA hacia México.

**TU PERSONALIDAD:**
- Tono: Casual, experto, amigable pero profesional
- Respuestas: Breves y directas (estilo chat de Messenger)
- NUNCA digas "soy un bot" o "soy una IA". Di "Soy el asistente digital de EntregaX"

**SERVICIOS QUE OFRECEMOS:**
1. **Envío Aéreo China → México**: $6.50 USD/kg (mínimo 21 kg), tiempos 10-15 días
2. **Envío Marítimo China → México**: Desde $90 USD/CBM, tiempos 35-45 días
3. **Envío USA → México**: Precios variables según peso y destino
4. **Seguro de Carga (Póliza GEX)**: 5% del valor declarado + $625 MXN fijo

**CÓMO FUNCIONA (resumido):**
1. Te damos una dirección en China/USA para que tu proveedor envíe ahí
2. Recibimos tu mercancía en nuestro almacén
3. Consolidamos y enviamos a México
4. Hacemos el proceso de aduana
5. Te entregamos en tu domicilio

**REGLAS DE RESPUESTA:**
- Si preguntan precios específicos, da los rangos generales mencionados arriba
- Si quieren cotización exacta, pide: qué producto, peso estimado, y desde dónde (China/USA)
- Si preguntan por rastreo de un paquete, pide el número de tracking o su Box ID (ej: S1234)
- Si el usuario muestra INTERÉS REAL de compra (quiere cotizar formal, dar datos, hablar con alguien), responde amablemente y agrega al final exactamente: [HUMANO_REQUERIDO]
- Si el usuario tiene un problema, queja o urgencia, agrega: [HUMANO_REQUERIDO]
- Si preguntan algo fuera de logística (temas personales, otros servicios), indica amablemente que solo manejamos importaciones

**FRASES ÚTILES:**
- "¡Claro! Te ayudo con eso 🚀"
- "En un momento te paso con un asesor que te dará todos los detalles"
- "¿Desde qué país quieres importar, China o USA?"
`;

// ============================================================
// WEBHOOK: VERIFICACIÓN (Requerido por Meta al configurar)
// ============================================================
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
    console.log('✅ Facebook Webhook verificado');
    res.status(200).send(challenge);
  } else {
    console.warn('⚠️ Facebook Webhook verificación fallida');
    res.sendStatus(403);
  }
};

// ============================================================
// WEBHOOK: RECIBIR MENSAJES DE FACEBOOK
// ============================================================
export const handleFacebookMessage = async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Verificar que es un evento de página
    if (body.object !== 'page') {
      return res.sendStatus(404);
    }

    // Responder inmediatamente a Facebook (evitar timeout)
    res.status(200).send('EVENT_RECEIVED');

    // Procesar cada evento
    for (const entry of body.entry) {
      const webhookEvent = entry.messaging?.[0];
      if (!webhookEvent) continue;

      const senderPsid = webhookEvent.sender.id;

      // Solo procesar mensajes de texto
      if (webhookEvent.message?.text) {
        const userMessage = webhookEvent.message.text;
        console.log(`📩 FB Message from ${senderPsid}: ${userMessage.substring(0, 50)}...`);

        await processMessage(senderPsid, userMessage);
      }
    }
  } catch (error) {
    console.error('❌ Error FB Webhook:', error);
    // No enviar error, ya respondimos 200
  }
};

// ============================================================
// LÓGICA PRINCIPAL DE PROCESAMIENTO
// ============================================================
async function processMessage(senderPsid: string, userMessage: string) {
  try {
    // 1. BUSCAR O CREAR PROSPECTO
    let prospectResult = await pool.query(
      'SELECT * FROM prospects WHERE facebook_psid = $1',
      [senderPsid]
    );

    let prospectId: number;
    let isAiActive = true;

    if (prospectResult.rows.length === 0) {
      // Nuevo prospecto: obtener nombre de Facebook
      const fullName = await getFacebookUserName(senderPsid);

      const insertResult = await pool.query(`
        INSERT INTO prospects (full_name, acquisition_channel, facebook_psid, status, is_ai_active)
        VALUES ($1, 'FACEBOOK', $2, 'new', true)
        RETURNING id
      `, [fullName, senderPsid]);

      prospectId = insertResult.rows[0].id;
      console.log(`🆕 Nuevo prospecto de Facebook: ${fullName} (ID: ${prospectId})`);
    } else {
      prospectId = prospectResult.rows[0].id;
      isAiActive = prospectResult.rows[0].is_ai_active !== false;
    }

    // 2. GUARDAR MENSAJE DEL USUARIO EN HISTORIAL
    await pool.query(`
      INSERT INTO fb_chat_history (prospect_id, facebook_psid, sender_type, message)
      VALUES ($1, $2, 'user', $3)
    `, [prospectId, senderPsid, userMessage]);

    // Actualizar última interacción
    await pool.query(
      'UPDATE prospects SET last_interaction_fb = NOW() WHERE id = $1',
      [prospectId]
    );

    // 3. SI LA IA ESTÁ DESACTIVADA, NO RESPONDER AUTOMÁTICAMENTE
    if (!isAiActive) {
      console.log(`⏸️ IA desactivada para prospecto ${prospectId}, esperando respuesta humana`);
      return;
    }

    // 4. OBTENER CONTEXTO DE CONVERSACIÓN (últimos 10 mensajes)
    const historyResult = await pool.query(`
      SELECT sender_type, message FROM fb_chat_history
      WHERE prospect_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [prospectId]);

    const conversationHistory = historyResult.rows.reverse().map(msg => ({
      role: msg.sender_type === 'user' ? 'user' as const : 'assistant' as const,
      content: msg.message
    }));

    // 5. CONSULTAR A LA IA CON CONTEXTO
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SALES_PROMPT },
        ...conversationHistory
      ],
      max_tokens: 300,
      temperature: 0.7
    });

    let aiReply = completion.choices[0]?.message?.content || 'Dame un momento, por favor...';

    // 6. DETECTAR SI REQUIERE HUMANO
    const requiresHuman = aiReply.includes('[HUMANO_REQUERIDO]');
    if (requiresHuman) {
      aiReply = aiReply.replace('[HUMANO_REQUERIDO]', '').trim();

      // Actualizar estado en CRM
      await pool.query(`
        UPDATE prospects 
        SET status = 'contacting', notes = COALESCE(notes, '') || ' [FB] Solicitó asesor humano. '
        WHERE id = $1
      `, [prospectId]);

      console.log(`🔔 Prospecto ${prospectId} requiere atención humana`);
      
      // TODO: Aquí podrías enviar notificación push/email al asesor
    }

    // 7. GUARDAR RESPUESTA DE LA IA EN HISTORIAL
    await pool.query(`
      INSERT INTO fb_chat_history (prospect_id, facebook_psid, sender_type, message)
      VALUES ($1, $2, 'ai', $3)
    `, [prospectId, senderPsid, aiReply]);

    // 8. ENVIAR RESPUESTA A FACEBOOK
    await sendFacebookMessage(senderPsid, aiReply);

  } catch (error) {
    console.error('❌ Error procesando mensaje:', error);
    // Intentar enviar mensaje de error genérico
    try {
      await sendFacebookMessage(senderPsid, 
        'Disculpa, tuve un pequeño problema técnico. ¿Podrías repetir tu mensaje? 🙏'
      );
    } catch (e) {
      console.error('❌ Error enviando mensaje de error:', e);
    }
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

// Obtener nombre del usuario de Facebook
async function getFacebookUserName(psid: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${psid}?fields=first_name,last_name&access_token=${FB_TOKEN}`
    );
    return `${response.data.first_name || ''} ${response.data.last_name || ''}`.trim() || 'Usuario FB';
  } catch (error) {
    console.error('Error obteniendo nombre de FB:', error);
    return 'Usuario Facebook';
  }
}

// Enviar mensaje a Facebook Messenger
async function sendFacebookMessage(recipientPsid: string, message: string): Promise<void> {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${FB_TOKEN}`,
      {
        recipient: { id: recipientPsid },
        message: { text: message }
      }
    );
    console.log(`📤 Mensaje enviado a ${recipientPsid}`);
  } catch (error: any) {
    console.error('❌ Error enviando a FB:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================================
// ENDPOINTS ADMIN (Para el panel CRM)
// ============================================================

// Obtener historial de chat de un prospecto
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { prospectId } = req.params;

    const result = await pool.query(`
      SELECT id, sender_type, message, created_at
      FROM fb_chat_history
      WHERE prospect_id = $1
      ORDER BY created_at ASC
    `, [prospectId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

// Activar/Desactivar IA para un prospecto (Tomar Control)
export const toggleAI = async (req: Request, res: Response) => {
  try {
    const { prospectId } = req.params;
    const { active } = req.body; // true = IA activa, false = humano toma control

    await pool.query(
      'UPDATE prospects SET is_ai_active = $1 WHERE id = $2',
      [active, prospectId]
    );

    const status = active ? 'IA reactivada' : 'Humano tomó control';
    console.log(`🔄 Prospecto ${prospectId}: ${status}`);

    res.json({ success: true, message: status });
  } catch (error) {
    console.error('Error cambiando estado IA:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
};

// Enviar mensaje manual desde el panel (como humano)
export const sendManualMessage = async (req: Request, res: Response) => {
  try {
    const { prospectId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'El mensaje es requerido' });
    }

    // Obtener PSID del prospecto
    const prospectResult = await pool.query(
      'SELECT facebook_psid FROM prospects WHERE id = $1',
      [prospectId]
    );

    if (prospectResult.rows.length === 0 || !prospectResult.rows[0].facebook_psid) {
      return res.status(404).json({ error: 'Prospecto no tiene Facebook vinculado' });
    }

    const psid = prospectResult.rows[0].facebook_psid;

    // Guardar en historial como mensaje humano
    await pool.query(`
      INSERT INTO fb_chat_history (prospect_id, facebook_psid, sender_type, message)
      VALUES ($1, $2, 'human', $3)
    `, [prospectId, psid, message]);

    // Enviar a Facebook
    await sendFacebookMessage(psid, message);

    // Actualizar última interacción
    await pool.query(
      'UPDATE prospects SET last_interaction_fb = NOW() WHERE id = $1',
      [prospectId]
    );

    res.json({ success: true, message: 'Mensaje enviado' });
  } catch (error) {
    console.error('Error enviando mensaje manual:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
};

// ============================================================
// FUNCIÓN PARA TESTING (simular mensaje sin FB real)
// ============================================================
export const simulateMessage = async (req: Request, res: Response) => {
  try {
    const { psid, message, name } = req.body;

    if (!psid || !message) {
      return res.status(400).json({ error: 'psid y message son requeridos' });
    }

    // Buscar o crear prospecto de prueba
    let prospect = await pool.query('SELECT * FROM prospects WHERE facebook_psid = $1', [psid]);

    if (prospect.rows.length === 0) {
      await pool.query(`
        INSERT INTO prospects (full_name, acquisition_channel, facebook_psid, status, is_ai_active)
        VALUES ($1, 'FACEBOOK', $2, 'new', true)
      `, [name || 'Test User', psid]);
    }

    // Simular el procesamiento (sin enviar a FB real)
    const prospectResult = await pool.query('SELECT * FROM prospects WHERE facebook_psid = $1', [psid]);
    const prospectId = prospectResult.rows[0].id;

    // Guardar mensaje
    await pool.query(`
      INSERT INTO fb_chat_history (prospect_id, facebook_psid, sender_type, message)
      VALUES ($1, $2, 'user', $3)
    `, [prospectId, psid, message]);

    // Generar respuesta IA
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SALES_PROMPT },
        { role: 'user', content: message }
      ],
      max_tokens: 300
    });

    let aiReply = completion.choices[0]?.message?.content || 'Error generando respuesta';
    const requiresHuman = aiReply.includes('[HUMANO_REQUERIDO]');
    aiReply = aiReply.replace('[HUMANO_REQUERIDO]', '').trim();

    // Guardar respuesta
    await pool.query(`
      INSERT INTO fb_chat_history (prospect_id, facebook_psid, sender_type, message)
      VALUES ($1, $2, 'ai', $3)
    `, [prospectId, psid, aiReply]);

    if (requiresHuman) {
      await pool.query(`UPDATE prospects SET status = 'contacting' WHERE id = $1`, [prospectId]);
    }

    res.json({
      success: true,
      prospectId,
      aiReply,
      requiresHuman
    });
  } catch (error: any) {
    console.error('Error simulando:', error);
    res.status(500).json({ error: error.message });
  }
};
