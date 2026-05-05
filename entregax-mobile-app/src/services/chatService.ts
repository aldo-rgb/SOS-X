// chatService.ts — Cliente de chat (REST + socket.io) para la app móvil.
import { API_URL } from './api';

let ioClient: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ioClient = require('socket.io-client').io;
} catch {
  // socket.io-client no instalado todavía — el chat funcionará en modo polling/REST.
}

export interface ChatConversation {
  id: number;
  type: 'direct' | 'group';
  title?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  branch_id?: number | null;
  auto_group_key?: string | null;
  is_archived: boolean;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  is_muted: boolean;
  last_read_message_id?: number | null;
  unread_count: number;
  other_user?: {
    id: number;
    full_name: string;
    email: string;
    role: string;
    profile_photo_url?: string | null;
  } | null;
}

export interface ChatAttachment {
  id: number;
  message_id: number;
  s3_key: string;
  url: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  duration_ms?: number;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name?: string;
  sender_photo?: string | null;
  sender_role?: string;
  body?: string | null;
  message_type: 'text' | 'image' | 'file' | 'audio' | 'video' | 'system';
  reply_to_id?: number | null;
  edited_at?: string | null;
  metadata?: any;
  created_at: string;
  attachments: ChatAttachment[];
}

async function request<T = any>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (!(init.body instanceof FormData) && init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as T;
}

export const fetchConversations = async (token: string): Promise<ChatConversation[]> => {
  const r = await request<{ conversations: ChatConversation[] }>('/api/chat/conversations', token);
  return r.conversations || [];
};

export const fetchMessages = async (
  token: string,
  conversationId: number,
  beforeId?: number,
  limit: number = 50
): Promise<ChatMessage[]> => {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (beforeId) qs.set('before_id', String(beforeId));
  const r = await request<{ messages: ChatMessage[] }>(
    `/api/chat/conversations/${conversationId}/messages?${qs.toString()}`,
    token
  );
  return r.messages || [];
};

export const sendMessage = async (
  token: string,
  conversationId: number,
  payload: { body?: string; reply_to_id?: number; files?: { uri: string; name: string; type: string }[] }
): Promise<ChatMessage> => {
  if (payload.files && payload.files.length > 0) {
    const form = new FormData();
    if (payload.body) form.append('body', payload.body);
    if (payload.reply_to_id) form.append('reply_to_id', String(payload.reply_to_id));
    payload.files.forEach((f) => {
      // @ts-ignore RN FormData
      form.append('files', { uri: f.uri, name: f.name, type: f.type });
    });
    const r = await request<{ message: ChatMessage }>(
      `/api/chat/conversations/${conversationId}/messages`,
      token,
      { method: 'POST', body: form as any }
    );
    return r.message;
  }
  const r = await request<{ message: ChatMessage }>(
    `/api/chat/conversations/${conversationId}/messages`,
    token,
    { method: 'POST', body: JSON.stringify({ body: payload.body, reply_to_id: payload.reply_to_id }) }
  );
  return r.message;
};

export const markRead = async (token: string, conversationId: number, messageId?: number) => {
  await request(`/api/chat/conversations/${conversationId}/read`, token, {
    method: 'POST',
    body: JSON.stringify(messageId ? { message_id: messageId } : {}),
  });
};

export const searchStaff = async (token: string, q: string = '') => {
  const r = await request<{ users: any[] }>(`/api/chat/staff/search?q=${encodeURIComponent(q)}`, token);
  return r.users || [];
};

export const createConversation = async (
  token: string,
  payload: { type: 'direct' | 'group'; title?: string; description?: string; participant_ids: number[] }
): Promise<{ conversation_id: number; reused: boolean }> => {
  return await request('/api/chat/conversations', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const registerPushToken = async (
  token: string,
  payload: { token: string; platform: 'ios' | 'android' | 'web'; device_id?: string; device_name?: string; app_version?: string }
) => {
  await request('/api/chat/push-tokens', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

// =================== Socket.IO ===================
let socket: any = null;
let connectedToken: string | null = null;

export const connectChatSocket = (token: string) => {
  if (!ioClient) return null;
  if (socket && connectedToken === token) return socket;
  if (socket) { try { socket.disconnect(); } catch {} }
  socket = ioClient(`${API_URL}/chat`, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });
  connectedToken = token;
  return socket;
};

export const disconnectChatSocket = () => {
  if (!socket) return;
  try { socket.disconnect(); } catch {}
  socket = null;
  connectedToken = null;
};

export const getChatSocket = () => socket;

export const onSocketEvent = (event: string, handler: (...args: any[]) => void) => {
  if (!socket) return () => {};
  socket.on(event, handler);
  return () => { if (socket) socket.off(event, handler); };
};

export const emitTyping = (conversationId: number, isTyping: boolean) => {
  if (!socket) return;
  socket.emit('typing', { conversation_id: conversationId, is_typing: isTyping });
};
