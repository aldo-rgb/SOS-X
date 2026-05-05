// chatSocket.ts — Servidor Socket.IO para el chat interno.
// Se monta sobre el mismo http server de Express en index.ts.
// Auth: JWT en handshake.auth.token. Usuarios se unen automáticamente a las
// salas `conversation:{id}` de las conversaciones donde son participantes.
import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { pool } from './db';
import { setChatSocketEmitter } from './chatController';

let ioInstance: any = null;

export async function attachChatSocket(httpServer: HttpServer): Promise<void> {
  let SocketServer: any;
  try {
    // Lazy import — si socket.io no está instalado se omite sin romper la API.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    SocketServer = require('socket.io').Server;
  } catch {
    console.warn('[socket] socket.io no instalado — chat en tiempo real deshabilitado');
    return;
  }

  const io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
    pingInterval: 25000,
    pingTimeout: 60000,
  });
  ioInstance = io;

  const chatNs = io.of('/chat');

  // Auth middleware
  chatNs.use((socket: any, next: any) => {
    try {
      const token = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('no_token'));
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      socket.data.userId = decoded.userId;
      socket.data.role = decoded.role;
      socket.data.email = decoded.email;
      next();
    } catch (err) {
      next(new Error('invalid_token'));
    }
  });

  chatNs.on('connection', async (socket: any) => {
    const userId = socket.data.userId;
    if (!userId) return socket.disconnect(true);

    // Sala personal para señales tipo "presence"
    socket.join(`user:${userId}`);

    // Unir a las salas de cada conversación donde es participante
    try {
      const r = await pool.query(
        `SELECT conversation_id FROM chat_participants
          WHERE user_id = $1 AND left_at IS NULL`,
        [userId]
      );
      for (const row of r.rows) {
        socket.join(`conversation:${row.conversation_id}`);
      }
    } catch (err: any) {
      console.error('[socket] error cargando salas:', err.message);
    }

    // Eventos cliente → servidor
    socket.on('typing', (payload: any) => {
      if (!payload?.conversation_id) return;
      socket.to(`conversation:${payload.conversation_id}`).emit('typing', {
        conversation_id: payload.conversation_id,
        user_id: userId,
        is_typing: !!payload.is_typing,
      });
    });

    socket.on('join_conversation', (conversationId: number) => {
      if (!conversationId) return;
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId: number) => {
      if (!conversationId) return;
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('disconnect', () => {
      // Nada por ahora — presence simple basado en sala personal
    });
  });

  // Inyectar emitter en chatController para que sendMessage / markAsRead
  // puedan emitir eventos sin necesidad de import circular.
  setChatSocketEmitter((event: string, payload: any, room: string) => {
    chatNs.to(room).emit(event, payload);
  });

  console.log('[socket] /chat namespace listo');
}

export function getChatIo() {
  return ioInstance;
}
