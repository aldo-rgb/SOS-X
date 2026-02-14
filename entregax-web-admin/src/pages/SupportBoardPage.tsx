/**
 * SupportBoardPage.tsx
 * Panel de Soporte al Cliente tipo Kanban
 * Integra IA (automático) + Agentes Humanos
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Button,
  Paper,
  Avatar,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Badge,
  Divider,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import {
  SmartToy as AIIcon,
  SupportAgent as AgentIcon,
  CheckCircle as ResolvedIcon,
  Send as SendIcon,
  Refresh as RefreshIcon,
  AccessTime as TimeIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  LocalShipping as TrackingIcon,
  Receipt as BillingIcon,
  Help as HelpIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

const ORANGE = '#F05A28';
const BLACK = '#111';
const API_URL = 'http://localhost:3001/api';

interface SupportTicket {
  id: number;
  ticket_folio: string;
  user_id: number;
  full_name: string;
  email: string;
  phone?: string;
  category: string;
  subject: string;
  status: 'open_ai' | 'waiting_client' | 'escalated_human' | 'resolved';
  priority: string;
  sentiment?: string;
  message_count: number;
  last_message?: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: number;
  sender_type: 'client' | 'ai' | 'agent';
  message: string;
  attachment_url?: string;
  created_at: string;
}

interface SupportStats {
  ai_handling: number;
  needs_human: number;
  waiting_client: number;
  resolved: number;
  today_new: number;
  today_resolved: number;
}

const categoryIcons: Record<string, React.ReactElement> = {
  tracking: <TrackingIcon fontSize="small" />,
  billing: <BillingIcon fontSize="small" />,
  damage: <WarningIcon fontSize="small" />,
  quote: <HelpIcon fontSize="small" />,
  missing: <WarningIcon fontSize="small" />,
  other: <HelpIcon fontSize="small" />,
};

export default function SupportBoardPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const token = localStorage.getItem('token');

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/support/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error('Error API tickets:', res.status);
        setTickets([]);
        return;
      }
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando tickets:', error);
      setTickets([]);
    }
  }, [token]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/support/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error('Error API stats:', res.status);
        setStats({ ai_handling: 0, needs_human: 0, waiting_client: 0, resolved: 0, today_new: 0, today_resolved: 0 });
        return;
      }
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Error cargando stats:', error);
      setStats({ ai_handling: 0, needs_human: 0, waiting_client: 0, resolved: 0, today_new: 0, today_resolved: 0 });
    }
  }, [token]);

  const loadMessages = async (ticketId: number) => {
    try {
      const res = await fetch(`${API_URL}/support/ticket/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(data);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadTickets(), loadStats()]);
      setLoading(false);
    };
    loadData();

    // Auto-refresh cada 30 segundos
    const interval = setInterval(() => {
      loadTickets();
      loadStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadTickets, loadStats]);

  const handleOpenTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setDialogOpen(true);
    await loadMessages(ticket.id);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;

    setSending(true);
    try {
      await fetch(`${API_URL}/admin/support/ticket/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: replyText }),
      });

      setReplyText('');
      await loadMessages(selectedTicket.id);
      await loadTickets();
    } catch (error) {
      console.error('Error enviando respuesta:', error);
    } finally {
      setSending(false);
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;

    try {
      await fetch(`${API_URL}/admin/support/ticket/${selectedTicket.id}/resolve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });

      setDialogOpen(false);
      setSelectedTicket(null);
      await loadTickets();
      await loadStats();
    } catch (error) {
      console.error('Error resolviendo ticket:', error);
    }
  };

  const getTicketsByStatus = (status: string) => {
    let filtered = tickets.filter((t) => t.status === status);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.ticket_folio.toLowerCase().includes(q) ||
          t.full_name?.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return t('support.now');
    if (diffMins < 60) return t('support.minutesAgo', { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('support.hoursAgo', { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t('support.daysAgo', { count: diffDays });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f5f5f5' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            🎧 {t('support.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('support.subtitle')}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder={t('support.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ width: 250 }}
          />
          <IconButton onClick={() => { loadTickets(); loadStats(); }}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center', bgcolor: '#E3F2FD' }}>
            <AIIcon sx={{ color: '#1976d2', fontSize: 32 }} />
            <Typography variant="h4" fontWeight="bold">{stats.ai_handling}</Typography>
            <Typography variant="body2" color="text.secondary">{t('support.aiHandling')}</Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center', bgcolor: '#FFF3E0', borderTop: `4px solid ${ORANGE}` }}>
            <AgentIcon sx={{ color: ORANGE, fontSize: 32 }} />
            <Typography variant="h4" fontWeight="bold" color={ORANGE}>{stats.needs_human}</Typography>
            <Typography variant="body2" color="text.secondary">{t('support.needsHuman')}</Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center', bgcolor: '#FFF8E1' }}>
            <TimeIcon sx={{ color: '#f9a825', fontSize: 32 }} />
            <Typography variant="h4" fontWeight="bold">{stats.waiting_client}</Typography>
            <Typography variant="body2" color="text.secondary">{t('support.waitingClient')}</Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center', bgcolor: '#E8F5E9' }}>
            <ResolvedIcon sx={{ color: '#4caf50', fontSize: 32 }} />
            <Typography variant="h4" fontWeight="bold">{stats.resolved}</Typography>
            <Typography variant="body2" color="text.secondary">{t('support.resolved')}</Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">{t('support.today')}</Typography>
            <Typography variant="h5" fontWeight="bold" color="primary">+{stats.today_new}</Typography>
            <Typography variant="caption" color="text.secondary">{t('support.newTickets')}</Typography>
          </Paper>
        </Box>
      )}

      {/* Kanban Board */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden' }}>
        {/* Columna 1: IA Gestionando */}
        <Paper sx={{ flex: 1, p: 2, bgcolor: '#E3F2FD', overflow: 'auto', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AIIcon color="primary" />
            <Typography variant="h6" fontWeight="bold">
              {t('support.aiHandling')} 🤖
            </Typography>
            <Badge badgeContent={getTicketsByStatus('open_ai').length} color="primary" sx={{ ml: 'auto' }} />
          </Box>
          {getTicketsByStatus('open_ai').map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} onClick={() => handleOpenTicket(ticket)} formatTime={formatTimeAgo} t={t} />
          ))}
          {getTicketsByStatus('open_ai').length === 0 && (
            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
              {t('support.aiHandlingAll')}
            </Typography>
          )}
        </Paper>

        {/* Columna 2: Requiere Humano */}
        <Paper sx={{ flex: 1, p: 2, bgcolor: '#FFF3E0', borderTop: `4px solid ${ORANGE}`, overflow: 'auto', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AgentIcon sx={{ color: ORANGE }} />
            <Typography variant="h6" fontWeight="bold">
              {t('support.humanAttention')} ⚠️
            </Typography>
            <Badge badgeContent={getTicketsByStatus('escalated_human').length} color="warning" sx={{ ml: 'auto' }} />
          </Box>
          {getTicketsByStatus('escalated_human').map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} onClick={() => handleOpenTicket(ticket)} formatTime={formatTimeAgo} isUrgent t={t} />
          ))}
          {getTicketsByStatus('escalated_human').length === 0 && (
            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
              {t('support.noPendingTickets')}
            </Typography>
          )}
        </Paper>

        {/* Columna 3: Esperando Cliente */}
        <Paper sx={{ flex: 1, p: 2, bgcolor: '#FFF8E1', overflow: 'auto', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TimeIcon sx={{ color: '#f9a825' }} />
            <Typography variant="h6" fontWeight="bold">
              {t('support.waitingClientColumn')} ⏳
            </Typography>
            <Badge badgeContent={getTicketsByStatus('waiting_client').length} color="default" sx={{ ml: 'auto' }} />
          </Box>
          {getTicketsByStatus('waiting_client').map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} onClick={() => handleOpenTicket(ticket)} formatTime={formatTimeAgo} t={t} />
          ))}
        </Paper>

        {/* Columna 4: Resueltos */}
        <Paper sx={{ flex: 1, p: 2, bgcolor: '#E8F5E9', overflow: 'auto', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <ResolvedIcon sx={{ color: '#4caf50' }} />
            <Typography variant="h6" fontWeight="bold">
              {t('support.resolvedColumn')} ✅
            </Typography>
            <Badge badgeContent={getTicketsByStatus('resolved').length} color="success" sx={{ ml: 'auto' }} />
          </Box>
          {getTicketsByStatus('resolved').slice(0, 10).map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} onClick={() => handleOpenTicket(ticket)} formatTime={formatTimeAgo} isResolved t={t} />
          ))}
        </Paper>
      </Box>

      {/* Dialog: Detalle del Ticket */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        {selectedTicket && (
          <>
            <DialogTitle sx={{ bgcolor: BLACK, color: 'white' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h6">{selectedTicket.ticket_folio}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    {selectedTicket.full_name} • {selectedTicket.email}
                  </Typography>
                </Box>
                <Chip
                  label={t(`support.categories.${selectedTicket.category}`) || selectedTicket.category}
                  size="small"
                  sx={{ bgcolor: 'white', color: BLACK }}
                />
              </Box>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
              {/* Mensajes */}
              <Box sx={{ p: 2, maxHeight: 400, overflow: 'auto', bgcolor: '#f9f9f9' }}>
                {messages.map((msg) => (
                  <Box
                    key={msg.id}
                    sx={{
                      display: 'flex',
                      justifyContent: msg.sender_type === 'client' ? 'flex-start' : 'flex-end',
                      mb: 2,
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: '70%',
                        p: 2,
                        borderRadius: 2,
                        bgcolor:
                          msg.sender_type === 'client'
                            ? 'white'
                            : msg.sender_type === 'ai'
                            ? '#E3F2FD'
                            : '#E8F5E9',
                        border: '1px solid #ddd',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        {msg.sender_type === 'client' && <PersonIcon fontSize="small" color="action" />}
                        {msg.sender_type === 'ai' && <AIIcon fontSize="small" color="primary" />}
                        {msg.sender_type === 'agent' && <AgentIcon fontSize="small" sx={{ color: '#4caf50' }} />}
                        <Typography variant="caption" color="text.secondary">
                          {msg.sender_type === 'client' ? t('support.client') : msg.sender_type === 'ai' ? t('support.ai') : t('support.agent')} •{' '}
                          {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {msg.message}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>

              <Divider />

              {/* Campo de respuesta */}
              {selectedTicket.status !== 'resolved' && (
                <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    multiline
                    maxRows={3}
                    placeholder={t('support.writeReply')}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                  />
                  <IconButton onClick={handleSendReply} disabled={sending || !replyText.trim()}>
                    {sending ? <CircularProgress size={24} /> : <SendIcon sx={{ color: ORANGE }} />}
                  </IconButton>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>{t('support.close')}</Button>
              {selectedTicket.status !== 'resolved' && (
                <Button variant="contained" color="success" onClick={handleResolveTicket} startIcon={<ResolvedIcon />}>
                  {t('support.markResolved')}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

// Componente de Tarjeta de Ticket
function TicketCard({
  ticket,
  onClick,
  formatTime,
  isUrgent = false,
  isResolved = false,
  t,
}: {
  ticket: SupportTicket;
  onClick: () => void;
  formatTime: (d: string) => string;
  isUrgent?: boolean;
  isResolved?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  return (
    <Card
      sx={{
        mb: 2,
        cursor: 'pointer',
        borderLeft: isUrgent ? `4px solid ${ORANGE}` : 'none',
        opacity: isResolved ? 0.7 : 1,
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        },
      }}
      onClick={onClick}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Typography variant="caption" color="text.secondary">
            {ticket.ticket_folio}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatTime(ticket.updated_at)}
          </Typography>
        </Box>

        <Typography variant="subtitle2" fontWeight="bold" sx={{ my: 0.5, lineHeight: 1.3 }}>
          {ticket.subject}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Avatar sx={{ width: 24, height: 24, fontSize: 12, bgcolor: ORANGE }}>
            {ticket.full_name?.charAt(0) || '?'}
          </Avatar>
          <Typography variant="body2" color="text.secondary" noWrap>
            {ticket.full_name}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            icon={ticket.category in categoryIcons ? categoryIcons[ticket.category] : <HelpIcon fontSize="small" />}
            label={t(`support.categories.${ticket.category}`) ?? ticket.category}
            size="small"
            variant="outlined"
          />
          <Chip label={`${ticket.message_count} ${t('support.messages')}`} size="small" variant="outlined" />
        </Box>

        {ticket.last_message && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              mt: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            "{ticket.last_message}"
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
