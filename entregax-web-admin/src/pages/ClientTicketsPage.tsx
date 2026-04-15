import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Avatar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import api from '../services/api';

const ORANGE = '#F05A28';

interface Ticket {
  id: number;
  ticket_folio: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

interface TicketMessage {
  id: number;
  sender_type: string;
  message: string;
  attachment_url?: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: 'warning' | 'info' | 'success' | 'error' | 'default'; icon: React.ReactNode }> = {
  open_ai: { label: 'En atención IA', color: 'info', icon: <SmartToyIcon sx={{ fontSize: 16 }} /> },
  escalated_human: { label: 'Atención Humana', color: 'warning', icon: <SupportAgentIcon sx={{ fontSize: 16 }} /> },
  resolved: { label: 'Resuelto', color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
  closed: { label: 'Cerrado', color: 'default', icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
};

const categoryLabels: Record<string, string> = {
  tracking: '📦 Rastreo',
  delay: '⏰ Retraso',
  warranty: '🛡️ Garantía',
  compensation: '💰 Compensación',
  systemError: '⚙️ Error del Sistema',
  other: '📝 Otro',
};

interface ClientTicketsPageProps {
  onBack: () => void;
}

export default function ClientTicketsPage({ onBack }: ClientTicketsPageProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const response = await api.get('/support/tickets');
      setTickets(response.data || []);
    } catch (error) {
      console.error('Error cargando tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (ticketId: number) => {
    setMessagesLoading(true);
    try {
      const response = await api.get(`/support/ticket/${ticketId}/messages`);
      setMessages(response.data || []);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    setSending(true);
    try {
      const resp = await api.post(`/support/ticket/${selectedTicket.id}/message`, {
        message: newMessage.trim(),
      });
      setNewMessage('');
      await loadMessages(selectedTicket.id);
      // Si el ticket fue reabierto, actualizar estado local
      if (resp.data?.reopened || selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') {
        setSelectedTicket({ ...selectedTicket, status: 'waiting_agent' });
        setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, status: 'waiting_agent' } : t));
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
    } finally {
      setSending(false);
    }
  };

  const openTicketChat = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    loadMessages(ticket.id);
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const pendingTickets = tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed');
  const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed');

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: isMobile ? 2 : 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <IconButton onClick={onBack} sx={{ bgcolor: '#f5f5f5' }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight="bold">
            🎫 Mis Tickets de Soporte
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Revisa el estado de tus solicitudes de soporte
          </Typography>
        </Box>
        <IconButton onClick={loadTickets} sx={{ bgcolor: '#f5f5f5' }}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: ORANGE }} />
        </Box>
      ) : tickets.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <ChatBubbleOutlineIcon sx={{ fontSize: 64, color: '#ccc', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" fontWeight="bold">
            No tienes tickets de soporte
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Cuando crees un ticket desde el Centro de Ayuda, aparecerá aquí.
          </Typography>
          <Button
            variant="outlined"
            onClick={onBack}
            sx={{ mt: 3, color: ORANGE, borderColor: ORANGE, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Volver al Dashboard
          </Button>
        </Paper>
      ) : (
        <>
          {/* Tickets pendientes */}
          {pendingTickets.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="overline" sx={{ color: ORANGE, fontWeight: 700, letterSpacing: 1.5, mb: 1.5, display: 'block' }}>
                Pendientes ({pendingTickets.length})
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {pendingTickets.map((ticket) => {
                  const statusInfo = statusConfig[ticket.status] || statusConfig.open_ai;
                  return (
                    <Paper
                      key={ticket.id}
                      onClick={() => openTicketChat(ticket)}
                      sx={{
                        p: 2,
                        borderRadius: 2.5,
                        cursor: 'pointer',
                        border: '1px solid #e0e0e0',
                        transition: 'all 0.2s',
                        '&:hover': { borderColor: ORANGE, boxShadow: `0 2px 12px ${ORANGE}20`, transform: 'translateY(-1px)' },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
                            {ticket.ticket_folio}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                            {categoryLabels[ticket.category] || ticket.category}
                          </Typography>
                        </Box>
                        <Chip
                          icon={statusInfo.icon as React.ReactElement}
                          label={statusInfo.label}
                          color={statusInfo.color}
                          size="small"
                          sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                        />
                      </Box>
                      {ticket.subject && (
                        <Typography variant="body2" sx={{ color: '#555', mb: 1, lineHeight: 1.4 }} noWrap>
                          {ticket.subject}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AccessTimeIcon sx={{ fontSize: 14, color: '#999' }} />
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(ticket.updated_at)}
                        </Typography>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Tickets resueltos */}
          {resolvedTickets.length > 0 && (
            <Box>
              <Typography variant="overline" sx={{ color: '#4CAF50', fontWeight: 700, letterSpacing: 1.5, mb: 1.5, display: 'block' }}>
                Resueltos ({resolvedTickets.length})
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {resolvedTickets.map((ticket) => {
                  const statusInfo = statusConfig[ticket.status] || statusConfig.resolved;
                  return (
                    <Paper
                      key={ticket.id}
                      onClick={() => openTicketChat(ticket)}
                      sx={{
                        p: 2,
                        borderRadius: 2.5,
                        cursor: 'pointer',
                        border: '1px solid #e8e8e8',
                        bgcolor: '#fafafa',
                        transition: 'all 0.2s',
                        '&:hover': { borderColor: '#ccc', transform: 'translateY(-1px)' },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
                            {ticket.ticket_folio}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {categoryLabels[ticket.category] || ticket.category}
                          </Typography>
                        </Box>
                        <Chip
                          icon={statusInfo.icon as React.ReactElement}
                          label={statusInfo.label}
                          color={statusInfo.color}
                          size="small"
                          sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AccessTimeIcon sx={{ fontSize: 14, color: '#999' }} />
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(ticket.resolved_at || ticket.updated_at)}
                        </Typography>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            </Box>
          )}
        </>
      )}

      {/* Dialog: Chat del ticket */}
      <Dialog
        open={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { height: isMobile ? '90vh' : '70vh', maxHeight: 600, display: 'flex', flexDirection: 'column', borderRadius: 3 },
        }}
      >
        {selectedTicket && (
          <>
            {/* Header del chat */}
            <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', p: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
              <SupportAgentIcon />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {selectedTicket.ticket_folio}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {categoryLabels[selectedTicket.category] || selectedTicket.category}
                </Typography>
              </Box>
              <IconButton onClick={() => setSelectedTicket(null)} sx={{ color: 'white' }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>

            {/* Mensajes */}
            <DialogContent sx={{ flex: 1, overflow: 'auto', p: 2, bgcolor: '#f9f9f9' }}>
              {messagesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={28} sx={{ color: ORANGE }} />
                </Box>
              ) : messages.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No hay mensajes aún
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {messages.map((msg) => {
                    const isUser = msg.sender_type === 'user' || msg.sender_type === 'client';
                    const isAI = msg.sender_type === 'ai' || msg.sender_type === 'bot';
                    return (
                      <Box
                        key={msg.id}
                        sx={{
                          display: 'flex',
                          justifyContent: isUser ? 'flex-end' : 'flex-start',
                          gap: 1,
                        }}
                      >
                        {!isUser && (
                          <Avatar sx={{ width: 30, height: 30, bgcolor: isAI ? '#2196F3' : ORANGE, fontSize: 14 }}>
                            {isAI ? '🤖' : '👤'}
                          </Avatar>
                        )}
                        <Box
                          sx={{
                            maxWidth: '75%',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: isUser ? ORANGE : 'white',
                            color: isUser ? 'white' : 'text.primary',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          }}
                        >
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {msg.message}
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', mt: 0.5, textAlign: 'right' }}>
                            {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </DialogContent>

            {/* Input para enviar mensaje */}
            <Box sx={{ p: 1.5, borderTop: '1px solid #e0e0e0', display: 'flex', gap: 1, bgcolor: 'white', flexShrink: 0 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Escribe un mensaje..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                disabled={sending}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <IconButton
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sending}
                sx={{ bgcolor: ORANGE, color: 'white', '&:hover': { bgcolor: '#d94d1f' }, '&.Mui-disabled': { bgcolor: '#ccc' } }}
              >
                {sending ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <SendIcon />}
              </IconButton>
            </Box>
          </>
        )}
      </Dialog>
    </Box>
  );
}
