/**
 * SupportBoardPage.tsx
 * Panel de Soporte al Cliente tipo Kanban con ruteo por departamentos
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Tooltip,
} from '@mui/material';
import {
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
  SwapHoriz as TransferIcon,
  Badge as BadgeIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';

const ORANGE = '#F05A28';
const BLACK = '#111';
const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

interface Department {
  id: number;
  name: string;
  color: string;
  icon: string;
  is_default_for_clients: boolean;
  open_count?: number;
}

interface Agent {
  id: number;
  full_name: string;
  email: string;
  role: string;
}

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
  creator_type?: 'client' | 'employee';
  department_id?: number;
  department_name?: string;
  department_color?: string;
  assigned_to?: number;
  assigned_agent_name?: string;
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
  attachments?: string[] | string | null;
  created_at: string;
}

interface SupportStats {
  ai_handling: number;
  needs_human: number;
  waiting_client: number;
  resolved: number;
  today_new: number;
  today_resolved: number;
  employee_open?: number;
  client_open?: number;
  departments?: Array<{ id: number; name: string; color: string; open_count: number }>;
}

const categoryIcons: Record<string, React.ReactElement> = {
  tracking: <TrackingIcon fontSize="small" />,
  delay: <TimeIcon fontSize="small" />,
  warranty: <AgentIcon fontSize="small" />,
  compensation: <BillingIcon fontSize="small" />,
  systemError: <WarningIcon fontSize="small" />,
  billing: <BillingIcon fontSize="small" />,
  damage: <WarningIcon fontSize="small" />,
  quote: <HelpIcon fontSize="small" />,
  missing: <WarningIcon fontSize="small" />,
  other: <HelpIcon fontSize="small" />,
  accounting: <BillingIcon fontSize="small" />,
};

const categoryLabels: Record<string, string> = {
  tracking: 'Rastreo',
  delay: 'Retraso',
  warranty: 'Garantía',
  compensation: 'Compensación',
  systemError: 'Error Sistema',
  billing: 'Comisiones/Pagos',
  damage: 'Daño',
  quote: 'Cotización',
  missing: 'Perdido',
  accounting: 'Contabilidad',
  other: 'Otro',
};

export default function SupportBoardPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDept, setTransferDept] = useState<number | ''>('');
  const [transferAgent, setTransferAgent] = useState<number | ''>('');
  const [transferNote, setTransferNote] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all');
  const [creatorFilter, setCreatorFilter] = useState<'all' | 'client' | 'employee'>('all');

  const token = localStorage.getItem('token');

  const loadTickets = useCallback(async () => {
    try {
      let url = `${API_URL}/admin/support/tickets?limit=200`;
      if (deptFilter !== 'all') url += `&department_id=${deptFilter}`;
      if (creatorFilter !== 'all') url += `&creator_type=${creatorFilter}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setTickets([]); return; }
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch { setTickets([]); }
  }, [token, deptFilter, creatorFilter]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/support/stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      setStats(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/support/departments`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      setDepartments(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/support/agents`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      setAgents(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  const loadMessages = async (ticketId: number) => {
    try {
      const res = await fetch(`${API_URL}/support/ticket/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadTickets(), loadStats(), loadDepartments(), loadAgents()]);
      setLoading(false);
    };
    init();
    const interval = setInterval(() => { loadTickets(); loadStats(); }, 30000);
    return () => clearInterval(interval);
  }, [loadTickets, loadStats, loadDepartments, loadAgents]);

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: replyText }),
      });
      setReplyText('');
      await loadMessages(selectedTicket.id);
      await loadTickets();
    } finally { setSending(false); }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;
    await fetch(`${API_URL}/admin/support/ticket/${selectedTicket.id}/resolve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    setDialogOpen(false);
    setSelectedTicket(null);
    await loadTickets();
    await loadStats();
  };

  const handleTransfer = async () => {
    if (!selectedTicket || (!transferDept && !transferAgent)) return;
    setTransferring(true);
    try {
      await fetch(`${API_URL}/admin/support/ticket/${selectedTicket.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          department_id: transferDept || undefined,
          assigned_to: transferAgent || undefined,
          note: transferNote || undefined,
        }),
      });
      setTransferOpen(false);
      setTransferDept('');
      setTransferAgent('');
      setTransferNote('');
      await loadTickets();
      await loadMessages(selectedTicket.id);
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    } finally { setTransferring(false); }
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
    const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMins < 1) return 'ahora';
    if (diffMins < 60) return `hace ${diffMins}m`;
    const h = Math.floor(diffMins / 60);
    if (h < 24) return `hace ${h}h`;
    return `hace ${Math.floor(h / 24)}d`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  const deptCounts = stats?.departments || [];

  return (
    <Box sx={{ p: 3, height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f5f5f5', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            🎧 Soporte y Atención al Cliente
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Ruteo por departamentos · {tickets.length} tickets activos
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Buscar folio, cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ width: 220 }}
          />
          <IconButton onClick={() => { loadTickets(); loadStats(); }}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Stats */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <Paper sx={{ p: 1.5, flex: '1 1 120px', textAlign: 'center', bgcolor: '#FFF3E0', borderTop: `3px solid ${ORANGE}` }}>
            <Typography variant="h5" fontWeight="bold" color={ORANGE}>{stats.needs_human}</Typography>
            <Typography variant="caption" color="text.secondary">Requieren atención</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, flex: '1 1 120px', textAlign: 'center', bgcolor: '#E3F2FD' }}>
            <Typography variant="h5" fontWeight="bold">{stats.ai_handling}</Typography>
            <Typography variant="caption" color="text.secondary">Con IA</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, flex: '1 1 120px', textAlign: 'center', bgcolor: '#FFF8E1' }}>
            <Typography variant="h5" fontWeight="bold">{stats.waiting_client}</Typography>
            <Typography variant="caption" color="text.secondary">Esperando cliente</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, flex: '1 1 120px', textAlign: 'center', bgcolor: '#E8F5E9' }}>
            <Typography variant="h5" fontWeight="bold" color="#4caf50">{stats.resolved}</Typography>
            <Typography variant="caption" color="text.secondary">Resueltos</Typography>
          </Paper>
          <Paper sx={{ p: 1.5, flex: '1 1 120px', textAlign: 'center' }}>
            <Typography variant="h5" fontWeight="bold" color="primary">+{stats.today_new}</Typography>
            <Typography variant="caption" color="text.secondary">Nuevos hoy</Typography>
          </Paper>
          {stats.employee_open !== undefined && (
            <Paper sx={{ p: 1.5, flex: '1 1 120px', textAlign: 'center', bgcolor: '#F3E5F5' }}>
              <Typography variant="h5" fontWeight="bold" color="#9C27B0">{stats.employee_open}</Typography>
              <Typography variant="caption" color="text.secondary">De asesores</Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* Filters Row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Department tabs */}
        <Tabs
          value={deptFilter}
          onChange={(_, v) => setDeptFilter(v)}
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0, textTransform: 'none', fontSize: 13 } }}
        >
          <Tab label="Todos" value="all" />
          {departments.map((d) => {
            const cnt = deptCounts.find((x) => x.id === d.id)?.open_count;
            return (
              <Tab
                key={d.id}
                value={d.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: d.color }} />
                    {d.name}
                    {cnt !== undefined && cnt > 0 && (
                      <Box sx={{ bgcolor: d.color, color: '#fff', borderRadius: 10, px: 0.8, py: 0, fontSize: 11, fontWeight: 700, lineHeight: '18px' }}>
                        {cnt}
                      </Box>
                    )}
                  </Box>
                }
              />
            );
          })}
        </Tabs>

        {/* Creator type filter */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {(['all', 'client', 'employee'] as const).map((ct) => (
            <Chip
              key={ct}
              label={ct === 'all' ? 'Todos' : ct === 'client' ? '👤 Clientes' : '🧑‍💼 Asesores'}
              onClick={() => setCreatorFilter(ct)}
              variant={creatorFilter === ct ? 'filled' : 'outlined'}
              size="small"
              sx={{ cursor: 'pointer', ...(creatorFilter === ct && { bgcolor: BLACK, color: '#fff' }) }}
            />
          ))}
        </Box>
      </Box>

      {/* Kanban */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {[
          { status: 'escalated_human', label: 'Requieren Atención ⚠️', bg: '#FFF3E0', accent: ORANGE, urgent: true },
          { status: 'open_ai',         label: 'Con IA 🤖',             bg: '#E3F2FD', accent: '#2196F3', urgent: false },
          { status: 'waiting_client',  label: 'Esperando Cliente ⏳',  bg: '#FFF8E1', accent: '#f9a825', urgent: false },
          { status: 'resolved',        label: 'Resueltos ✅',          bg: '#E8F5E9', accent: '#4caf50', urgent: false },
        ].map(({ status, label, bg, accent, urgent }) => {
          const col = getTicketsByStatus(status);
          return (
            <Paper key={status} sx={{ flex: 1, p: 2, bgcolor: bg, overflow: 'auto', borderRadius: 2, borderTop: urgent ? `4px solid ${accent}` : undefined }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ flex: 1 }}>{label}</Typography>
                <Badge badgeContent={col.length} color={urgent ? 'warning' : 'default'} />
              </Box>
              {col.length === 0 && (
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                  Sin tickets
                </Typography>
              )}
              {(status === 'resolved' ? col.slice(0, 15) : col).map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => handleOpenTicket(ticket)}
                  formatTime={formatTimeAgo}
                  isUrgent={urgent}
                  isResolved={status === 'resolved'}
                />
              ))}
            </Paper>
          );
        })}
      </Box>

      {/* Dialog: Detalle del Ticket */}
      <Dialog open={dialogOpen} onClose={() => { setDialogOpen(false); setSelectedTicket(null); }} maxWidth="md" fullWidth>
        {selectedTicket && (
          <>
            <DialogTitle sx={{ bgcolor: BLACK, color: 'white', pb: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="h6">{selectedTicket.ticket_folio}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    {selectedTicket.full_name} · {selectedTicket.email}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                  {selectedTicket.department_name && (
                    <Chip
                      label={selectedTicket.department_name}
                      size="small"
                      sx={{ bgcolor: selectedTicket.department_color || '#666', color: '#fff', fontWeight: 600 }}
                    />
                  )}
                  <Chip
                    label={selectedTicket.creator_type === 'employee' ? '🧑‍💼 Asesor' : '👤 Cliente'}
                    size="small"
                    sx={{ bgcolor: selectedTicket.creator_type === 'employee' ? '#9C27B0' : '#2196F3', color: '#fff' }}
                  />
                  <Chip
                    label={categoryLabels[selectedTicket.category] || selectedTicket.category}
                    size="small"
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }}
                  />
                </Box>
              </Box>
              {selectedTicket.assigned_agent_name && (
                <Typography variant="caption" sx={{ opacity: 0.7, mt: 0.5, display: 'block' }}>
                  Asignado a: {selectedTicket.assigned_agent_name}
                </Typography>
              )}
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
              <Box sx={{ p: 2, maxHeight: 380, overflow: 'auto', bgcolor: '#f9f9f9' }}>
                {messages.map((msg) => (
                  <Box
                    key={msg.id}
                    sx={{ display: 'flex', justifyContent: msg.sender_type === 'client' ? 'flex-start' : 'flex-end', mb: 2 }}
                  >
                    <Box
                      sx={{
                        maxWidth: '72%', p: 2, borderRadius: 2,
                        bgcolor: msg.sender_type === 'client' ? 'white' : msg.sender_type === 'ai' ? '#E3F2FD' : '#E8F5E9',
                        border: '1px solid #ddd',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        {msg.sender_type === 'client' && <PersonIcon fontSize="small" color="action" />}
                        {msg.sender_type === 'agent' && <AgentIcon fontSize="small" sx={{ color: '#4caf50' }} />}
                        <Typography variant="caption" color="text.secondary">
                          {msg.sender_type === 'client' ? 'Cliente' : msg.sender_type === 'ai' ? 'IA' : 'Agente'} ·{' '}
                          {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {msg.message}
                      </Typography>
                      {(() => {
                        let urls: string[] = [];
                        if (Array.isArray(msg.attachments)) urls = msg.attachments as string[];
                        else if (typeof msg.attachments === 'string') {
                          try { const p = JSON.parse(msg.attachments); if (Array.isArray(p)) urls = p; } catch { /* ignore */ }
                        }
                        if (urls.length === 0 && msg.message) {
                          const re = /(https?:\/\/[^\s)\]]+\.(?:png|jpe?g|gif|webp))/gi;
                          urls = msg.message.match(re) || [];
                        }
                        if (urls.length === 0 && msg.attachment_url) urls = [msg.attachment_url];
                        if (urls.length === 0) return null;
                        return (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                            {urls.map((u, i) => (
                              <a key={i} href={u} target="_blank" rel="noreferrer">
                                <Box component="img" src={u} alt={`adj-${i}`}
                                  sx={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd' }} />
                              </a>
                            ))}
                          </Box>
                        );
                      })()}
                    </Box>
                  </Box>
                ))}
              </Box>

              <Divider />

              {selectedTicket.status !== 'resolved' && (
                <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth multiline maxRows={3}
                    placeholder="Escribe una respuesta..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                  />
                  <IconButton onClick={handleSendReply} disabled={sending || !replyText.trim()}>
                    {sending ? <CircularProgress size={24} /> : <SendIcon sx={{ color: ORANGE }} />}
                  </IconButton>
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button onClick={() => { setDialogOpen(false); setSelectedTicket(null); }}>Cerrar</Button>
                {selectedTicket.status !== 'resolved' && (
                  <Tooltip title="Transferir a departamento o agente">
                    <Button
                      variant="outlined"
                      startIcon={<TransferIcon />}
                      onClick={() => setTransferOpen(true)}
                      sx={{ borderColor: '#9C27B0', color: '#9C27B0' }}
                    >
                      Transferir
                    </Button>
                  </Tooltip>
                )}
              </Box>
              {selectedTicket.status !== 'resolved' && (
                <Button variant="contained" color="success" onClick={handleResolveTicket} startIcon={<ResolvedIcon />}>
                  Marcar Resuelto
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={transferOpen} onClose={() => setTransferOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#9C27B0', color: '#fff' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TransferIcon />
            Transferir Ticket {selectedTicket?.ticket_folio}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Selecciona el departamento y/o agente destino. Se guardará una nota de la transferencia.
          </Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Departamento</InputLabel>
            <Select
              value={transferDept}
              label="Departamento"
              onChange={(e) => setTransferDept(e.target.value as number)}
            >
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: d.color }} />
                    {d.name}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Asignar a agente (opcional)</InputLabel>
            <Select
              value={transferAgent}
              label="Asignar a agente (opcional)"
              onChange={(e) => setTransferAgent(e.target.value as number)}
            >
              <MenuItem value="">Sin asignar</MenuItem>
              {agents.map((a) => (
                <MenuItem key={a.id} value={a.id}>{a.full_name} — {a.role}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth multiline rows={2}
            label="Nota de transferencia (opcional)"
            value={transferNote}
            onChange={(e) => setTransferNote(e.target.value)}
            placeholder="Ej: Cliente con problema de pago, escalar a contabilidad..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleTransfer}
            disabled={transferring || (!transferDept && !transferAgent)}
            sx={{ bgcolor: '#9C27B0', '&:hover': { bgcolor: '#7B1FA2' } }}
            startIcon={transferring ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <TransferIcon />}
          >
            Transferir
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function TicketCard({
  ticket,
  onClick,
  formatTime,
  isUrgent = false,
  isResolved = false,
}: {
  ticket: SupportTicket;
  onClick: () => void;
  formatTime: (d: string) => string;
  isUrgent?: boolean;
  isResolved?: boolean;
}) {
  return (
    <Card
      sx={{
        mb: 1.5,
        cursor: 'pointer',
        borderLeft: isUrgent ? `4px solid ${ORANGE}` : '4px solid transparent',
        opacity: isResolved ? 0.7 : 1,
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
      }}
      onClick={onClick}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {/* Row 1: folio + time */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {ticket.ticket_folio}
          </Typography>
          <Typography variant="caption" color="text.secondary">{formatTime(ticket.updated_at)}</Typography>
        </Box>

        {/* Subject */}
        <Typography variant="subtitle2" fontWeight="bold" sx={{ lineHeight: 1.3, mb: 0.75 }} noWrap>
          {ticket.subject}
        </Typography>

        {/* Client name */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Avatar sx={{ width: 22, height: 22, fontSize: 11, bgcolor: ORANGE }}>
            {ticket.full_name?.charAt(0) || '?'}
          </Avatar>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>
            {ticket.full_name}
          </Typography>
        </Box>

        {/* Badges row */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {/* Creator type */}
          <Chip
            label={ticket.creator_type === 'employee' ? '🧑‍💼 Asesor' : '👤 Cliente'}
            size="small"
            sx={{
              height: 20, fontSize: 11,
              bgcolor: ticket.creator_type === 'employee' ? '#F3E5F5' : '#E3F2FD',
              color: ticket.creator_type === 'employee' ? '#9C27B0' : '#1565C0',
              fontWeight: 600,
            }}
          />
          {/* Department */}
          {ticket.department_name && (
            <Chip
              label={ticket.department_name}
              size="small"
              sx={{
                height: 20, fontSize: 11,
                bgcolor: (ticket.department_color || '#666') + '22',
                color: ticket.department_color || '#666',
                fontWeight: 600,
              }}
            />
          )}
          {/* Category */}
          <Chip
            icon={ticket.category in categoryIcons ? React.cloneElement(categoryIcons[ticket.category], { style: { fontSize: 12 } }) : <HelpIcon style={{ fontSize: 12 }} />}
            label={categoryLabels[ticket.category] || ticket.category}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 11, '& .MuiChip-icon': { fontSize: 12 } }}
          />
          {/* Message count */}
          <Chip label={`${ticket.message_count} msgs`} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
        </Box>

        {/* Assigned agent */}
        {ticket.assigned_agent_name && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            → {ticket.assigned_agent_name}
          </Typography>
        )}

        {/* Last message preview */}
        {ticket.last_message && (
          <Typography variant="caption" color="text.secondary"
            sx={{ display: 'block', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
            "{ticket.last_message}"
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
