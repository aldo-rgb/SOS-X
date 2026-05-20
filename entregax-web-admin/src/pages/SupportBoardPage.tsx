/**
 * SupportBoardPage.tsx
 * Panel de Soporte al Cliente tipo Kanban con ruteo por departamentos
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Alert,
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
  OpenInNew as OpenInNewIcon,
  AttachFile as AttachFileIcon,
  AutoFixHigh as AIIcon,
  Undo as UndoIcon,
  Close as CloseIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import PackageDetailDialog from './PackageDetailDialog';

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
  tracking_number?: string;
  client_box_id?: string;
  message_count: number;
  last_message?: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: number;
  sender_type: 'client' | 'ai' | 'agent';
  sender_name?: string;
  message: string;
  attachment_url?: string;
  attachments?: string[] | string | null;
  created_at: string;
  is_internal?: boolean;
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
  clientIssue: <AgentIcon fontSize="small" />,
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
  clientIssue: 'Problema con Cliente',
  other: 'Otro',
};

function ProtectedImage({ s3Url, alt, sx }: { s3Url: string; alt: string; sx: object }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    setSrc(null);
    setFailed(false);
    const key = s3Url.includes('.amazonaws.com/') ? s3Url.split('.amazonaws.com/')[1] : null;
    if (!key) { setSrc(s3Url); return; }
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/admin/support/image-sign?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error('sign failed'); return r.json(); })
      .then((data: { signedUrl?: string }) => {
        if (data.signedUrl) setSrc(data.signedUrl);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [s3Url]);

  if (failed) return (
    <Box sx={{ width: 100, height: 100, bgcolor: '#fff3e0', borderRadius: 1, border: '1px solid #ffcc80', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
      <span style={{ fontSize: 24 }}>🖼️</span>
      <Typography variant="caption" color="warning.main">Sin acceso</Typography>
    </Box>
  );

  if (!src) return (
    <Box sx={{ width: 100, height: 100, bgcolor: '#f5f5f5', borderRadius: 1, border: '1px solid #ddd', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
      <span style={{ fontSize: 24 }}>🖼️</span>
      <Typography variant="caption" color="text.secondary">Cargando...</Typography>
    </Box>
  );

  return (
    <>
      <Box component="img" src={src} alt={alt} sx={{ ...sx as object, cursor: 'zoom-in' }} onClick={() => setLightbox(true)} />
      <Dialog open={lightbox} onClose={() => setLightbox(false)} maxWidth="xl" PaperProps={{ sx: { bgcolor: 'transparent', boxShadow: 'none' } }}>
        <Box onClick={() => setLightbox(false)} sx={{ cursor: 'zoom-out', p: 1 }}>
          <Box component="img" src={src} alt={alt} sx={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 2, display: 'block' }} />
        </Box>
      </Dialog>
    </>
  );
}

export default function SupportBoardPage() {
  useTranslation();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDept, setTransferDept] = useState<number | ''>('');
  const [transferNote, setTransferNote] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<number | 'all'>('all');
  const [creatorFilter, setCreatorFilter] = useState<'all' | 'client' | 'employee'>('all');
  const [packageDetailTracking, setPackageDetailTracking] = useState<string | null>(null);

  // Adjuntos
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // IA Mejorar
  const [enhancing, setEnhancing] = useState(false);
  const [originalText, setOriginalText] = useState<string | null>(null);

  // Traducción bajo demanda — caché en memoria: msgId → translated text
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [translatingId, setTranslatingId] = useState<number | null>(null);
  const [showTranslated, setShowTranslated] = useState<Record<number, boolean>>({});

  const token = localStorage.getItem('token');
  const currentUserRole: string = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').role || ''; } catch { return ''; }
  })();
  const defaultDeptSet = useRef(false);

  // Reglas de visibilidad por nombre de departamento
  const DEPT_ALLOWED_ROLES: Record<string, string[]> = {
    'Dirección':         ['super_admin', 'admin', 'director'],
    'Contabilidad':      ['super_admin', 'admin', 'accountant'],
    'Soporte Técnico':   ['super_admin', 'admin', 'customer_service', 'counter_staff'],
    'Atención a Cliente':['super_admin', 'admin', 'customer_service', 'counter_staff'],
  };

  const canSeeDept = (deptName: string): boolean => {
    const allowed = DEPT_ALLOWED_ROLES[deptName];
    if (!allowed) return true; // departamentos sin regla → todos los ven
    return allowed.includes(currentUserRole);
  };

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

  const loadMessages = async (ticketId: number) => {
    try {
      const res = await fetch(`${API_URL}/admin/support/ticket/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadTickets(), loadStats(), loadDepartments()]);
      setLoading(false);
    };
    init();
    const interval = setInterval(() => { loadTickets(); loadStats(); }, 30000);
    return () => clearInterval(interval);
  }, [loadTickets, loadStats, loadDepartments]);

  // Preseleccionar "Atención a Cliente" para agentes de atención al cliente
  useEffect(() => {
    if (defaultDeptSet.current || departments.length === 0) return;
    if (['customer_service', 'counter_staff'].includes(currentUserRole)) {
      const atencion = departments.find(d => d.name === 'Atención a Cliente');
      if (atencion) { setDeptFilter(atencion.id); defaultDeptSet.current = true; }
    }
  }, [departments, currentUserRole]);

  const handleOpenTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setDialogOpen(true);
    await loadMessages(ticket.id);
  };

  const handleSendReply = async () => {
    if ((!replyText.trim() && attachedFiles.length === 0) || !selectedTicket) return;
    const text = replyText.trim();
    const ticketId = selectedTicket.id;
    const tempId = Date.now();
    setMessages(prev => [...prev, { id: tempId, sender_type: 'agent', message: text, is_internal: false, created_at: new Date().toISOString() }]);
    setReplyText('');
    setAttachedFiles([]);
    setOriginalText(null);
    setSending(true);
    try {
      const body = new FormData();
      body.append('message', text);
      attachedFiles.forEach(f => body.append('images', f));
      const res = await fetch(`${API_URL}/admin/support/ticket/${ticketId}/reply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setReplyText(text);
        return;
      }
      await loadMessages(ticketId);
      await loadTickets();
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setReplyText(text);
    } finally { setSending(false); }
  };

  const handleAIEnhance = async () => {
    if (!replyText.trim()) return;
    setEnhancing(true);
    setOriginalText(replyText);
    try {
      const res = await fetch(`${API_URL}/support/ai-enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: replyText }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.improved) setReplyText(data.improved);
      }
    } catch { /* silencioso */ }
    finally { setEnhancing(false); }
  };

  const handleTranslate = async (msgId: number, text: string) => {
    // Si ya hay traducción cacheada, solo alternar visibilidad
    if (translations[msgId]) {
      setShowTranslated(prev => ({ ...prev, [msgId]: !prev[msgId] }));
      return;
    }
    setTranslatingId(msgId);
    try {
      const res = await fetch(`${API_URL}/support/ai-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, targetLang: 'es' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.translated) {
          setTranslations(prev => ({ ...prev, [msgId]: data.translated }));
          setShowTranslated(prev => ({ ...prev, [msgId]: true }));
        }
      }
    } catch { /* silencioso */ }
    finally { setTranslatingId(null); }
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

  const handleTransferToAtencion = async () => {
    if (!selectedTicket) return;
    const atencionDept = departments.find(d => d.name === 'Atención a Cliente');
    if (!atencionDept) return;
    await fetch(`${API_URL}/admin/support/ticket/${selectedTicket.id}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department_id: atencionDept.id,
        note: 'Ticket enviado a Atención a Cliente para dar seguimiento al cliente.',
      }),
    });
    setDialogOpen(false);
    setSelectedTicket(null);
    await loadTickets();
    await loadStats();
  };

  const handleTransfer = async () => {
    if (!selectedTicket || !transferDept) return;
    setTransferring(true);
    try {
      await fetch(`${API_URL}/admin/support/ticket/${selectedTicket.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          department_id: transferDept || undefined,
          note: transferNote || undefined,
        }),
      });
      setTransferOpen(false);
      setTransferDept('');
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
          {departments.filter(d => canSeeDept(d.name)).map((d) => {
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
          <Tab label="Todos" value="all" />
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
      <Box sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'auto', minHeight: 0 }}>
        {deptFilter === 'all' ? (
          // Vista por departamento: una columna por cada departamento visible
          departments.map((dept) => {
            const applySearch = (list: SupportTicket[]) => {
              if (!searchQuery) return list;
              const q = searchQuery.toLowerCase();
              return list.filter(t =>
                t.ticket_folio.toLowerCase().includes(q) ||
                t.full_name?.toLowerCase().includes(q) ||
                t.subject?.toLowerCase().includes(q)
              );
            };
            const col = applySearch(tickets.filter(t => t.department_id === dept.id));
            const urgent = col.filter(t => t.status === 'escalated_human').length;
            return (
              <Paper key={dept.id} sx={{ flex: '0 0 280px', p: 2, bgcolor: '#fafafa', overflow: 'auto', borderRadius: 2, borderTop: `4px solid ${dept.color || '#999'}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: dept.color || '#999', flexShrink: 0 }} />
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ flex: 1 }}>{dept.name}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    {urgent > 0 && (
                      <Box sx={{ bgcolor: ORANGE, color: '#fff', borderRadius: 10, px: 0.8, fontSize: 11, fontWeight: 700, lineHeight: '18px' }}>
                        {urgent} ⚠️
                      </Box>
                    )}
                    <Box sx={{ bgcolor: '#e0e0e0', borderRadius: 10, px: 0.8, fontSize: 11, fontWeight: 600, lineHeight: '18px' }}>
                      {col.length}
                    </Box>
                  </Box>
                </Box>
                {col.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>Sin tickets</Typography>
                ) : (
                  col.slice(0, 20).map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onClick={() => handleOpenTicket(ticket)}
                      formatTime={formatTimeAgo}
                      isUrgent={ticket.status === 'escalated_human'}
                      isResolved={ticket.status === 'resolved'}
                    />
                  ))
                )}
              </Paper>
            );
          })
        ) : (
          // Vista kanban por status (cuando hay un departamento seleccionado)
          [
            { status: 'escalated_human', label: 'Requieren Atención ⚠️', bg: '#FFF3E0', accent: ORANGE, urgent: true },
            { status: 'open_ai',         label: 'Asesor Virtual',        bg: '#E3F2FD', accent: '#2196F3', urgent: false },
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
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>Sin tickets</Typography>
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
          })
        )}
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
                  {/* Datos del ticket */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
                    {selectedTicket.client_box_id && (
                      <Box>
                        <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          No. Cliente
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
                          {selectedTicket.client_box_id}
                        </Typography>
                      </Box>
                    )}
                    {selectedTicket.tracking_number && (
                      <Box>
                        <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Guía reportada
                        </Typography>
                        <Box
                          onClick={() => setPackageDetailTracking(selectedTicket.tracking_number!)}
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', '&:hover': { opacity: 0.75 } }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', textDecoration: 'underline dotted' }}>
                            {selectedTicket.tracking_number}
                          </Typography>
                          <OpenInNewIcon sx={{ fontSize: 13, opacity: 0.8 }} />
                        </Box>
                      </Box>
                    )}
                    {selectedTicket.assigned_agent_name && (
                      <Box>
                        <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Asesor asignado
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
                          {selectedTicket.assigned_agent_name}
                        </Typography>
                      </Box>
                    )}
                  </Box>
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
                        bgcolor: msg.is_internal
                          ? '#FFF8E1'
                          : msg.sender_type === 'client' ? 'white' : msg.sender_type === 'ai' ? '#E3F2FD' : '#E8F5E9',
                        border: msg.is_internal ? '1.5px dashed #F9A825' : '1px solid #ddd',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        {msg.sender_type === 'client' && <PersonIcon fontSize="small" color="action" />}
                        {msg.sender_type === 'agent' && <AgentIcon fontSize="small" sx={{ color: msg.is_internal ? '#F9A825' : '#4caf50' }} />}
                        <Typography variant="caption" color="text.secondary">
                          {msg.sender_type === 'client' ? 'Cliente' : msg.sender_type === 'ai' ? 'IA' : (msg.sender_name || 'Agente')} ·{' '}
                          {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        {msg.is_internal && (
                          <Chip label="🔒 Interno" size="small" sx={{ fontSize: 10, height: 18, bgcolor: '#FFF8E1', color: '#F57F17', border: '1px solid #F9A825' }} />
                        )}
                      </Box>
                      {/* Texto: limpiar markdown viejo de imágenes y mostrar original o traducción */}
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {(showTranslated[msg.id] && translations[msg.id]
                          ? translations[msg.id]
                          : msg.message
                        ).replace(/\n*📷 Imágenes adjuntas:[\s\S]*$/, '').trim()}
                      </Typography>
                      {showTranslated[msg.id] && translations[msg.id] && (
                        <Typography variant="caption" sx={{ color: '#9C27B0', fontStyle: 'italic', display: 'block', mt: 0.3 }}>
                          🌐 Traducido al español · <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setShowTranslated(prev => ({ ...prev, [msg.id]: false }))}>ver original</span>
                        </Typography>
                      )}
                      {(() => {
                        let urls: string[] = [];
                        if (Array.isArray(msg.attachments)) urls = msg.attachments as string[];
                        else if (typeof msg.attachments === 'string') {
                          try { const p = JSON.parse(msg.attachments); if (Array.isArray(p)) urls = p; } catch { /* ignore */ }
                        }
                        if (urls.length === 0 && msg.attachment_url) urls = [msg.attachment_url];
                        // Extraer URLs del formato markdown legado: [Imagen N](url)
                        if (urls.length === 0 && msg.message?.includes('Imágenes adjuntas:')) {
                          const matches = msg.message.matchAll(/\[Imagen \d+\]\((https?:\/\/[^)]+)\)/g);
                          for (const m of matches) urls.push(m[1]);
                        }
                        if (urls.length === 0) return null;
                        return (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                            {urls.map((u, i) => {
                              const isPdf = u.toLowerCase().endsWith('.pdf') || u.includes('/pdf') || u.includes('application/pdf');
                              return isPdf ? (
                                <a key={i} href={u} target="_blank" rel="noreferrer"
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#fce4ec', borderRadius: 6, border: '1px solid #ef9a9a', textDecoration: 'none', color: '#c62828' }}>
                                  <PdfIcon sx={{ fontSize: 20 }} />
                                  <Typography variant="caption" fontWeight={600}>Ver PDF</Typography>
                                </a>
                              ) : (
                                <ProtectedImage key={i} s3Url={u} alt={`adj-${i}`}
                                  sx={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd', cursor: 'pointer' }}
                                />
                              );
                            })}
                          </Box>
                        );
                      })()}
                      {/* Botón traducir — solo si el mensaje tiene texto */}
                      {msg.message && !showTranslated[msg.id] && (
                        <Box
                          component="span"
                          onClick={() => translatingId !== msg.id && handleTranslate(msg.id, msg.message)}
                          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, mt: 0.8, cursor: 'pointer', color: '#9C27B0', opacity: 0.7, fontSize: 11, '&:hover': { opacity: 1 } }}
                        >
                          {translatingId === msg.id
                            ? <CircularProgress size={10} sx={{ color: '#9C27B0' }} />
                            : <Typography variant="caption" sx={{ fontSize: 11 }}>A/文</Typography>
                          }
                          <Typography variant="caption" sx={{ fontSize: 11 }}>
                            {translatingId === msg.id ? 'Traduciendo...' : 'Traducir'}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                ))}
                <div ref={messagesEndRef} />
              </Box>

              <Divider />

              {selectedTicket.status !== 'resolved' && (
                <Box sx={{ px: 2, pt: 1 }}>
                  {selectedTicket.department_name && selectedTicket.department_name !== 'Atención a Cliente' && (
                    <Alert severity="warning" icon={false} sx={{ mb: 1, py: 0.5, fontSize: 12 }}>
                      🔒 Respuesta interna — el cliente <strong>NO verá</strong> este mensaje. Solo lo ve Atención a Cliente.
                    </Alert>
                  )}
                </Box>
              )}
              {selectedTicket.status !== 'resolved' && (
                <Box sx={{ px: 2, pb: 2 }}>
                  {/* Previews de adjuntos */}
                  {attachedFiles.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                      {attachedFiles.map((f, i) => (
                        <Box key={i} sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', bgcolor: '#f5f5f5', borderRadius: 1, border: '1px solid #ddd', p: 0.5, pr: 1, gap: 0.5 }}>
                          {f.type === 'application/pdf'
                            ? <PdfIcon sx={{ color: '#e53935', fontSize: 28 }} />
                            : <Box component="img" src={URL.createObjectURL(f)} sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 0.5 }} />
                          }
                          <Typography variant="caption" sx={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</Typography>
                          <IconButton size="small" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} sx={{ p: 0.2 }}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                  )}

                  {/* Barra de herramientas IA + adjunto */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Tooltip title="Adjuntar imagen o PDF">
                      <IconButton size="small" onClick={() => fileInputRef.current?.click()} sx={{ color: '#666' }}>
                        <AttachFileIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        if (e.target.files) setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                        e.target.value = '';
                      }}
                    />
                    <Tooltip title="Mejorar redacción con IA">
                      <span>
                        <IconButton
                          size="small"
                          disabled={enhancing || !replyText.trim()}
                          onClick={handleAIEnhance}
                          sx={{ color: '#7B1FA2', '&:hover': { bgcolor: 'rgba(123,31,162,0.08)' } }}
                        >
                          {enhancing ? <CircularProgress size={16} sx={{ color: '#7B1FA2' }} /> : <AIIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                    {originalText !== null && (
                      <Tooltip title="Deshacer mejora IA">
                        <IconButton size="small" onClick={() => { setReplyText(originalText); setOriginalText(null); }} sx={{ color: ORANGE }}>
                          <UndoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {originalText !== null && (
                      <Typography variant="caption" sx={{ color: '#7B1FA2', fontStyle: 'italic', ml: 0.5 }}>✨ Mejorado por IA</Typography>
                    )}
                  </Box>

                  {/* Campo de texto + enviar */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      fullWidth multiline maxRows={4}
                      placeholder={selectedTicket.department_name && selectedTicket.department_name !== 'Atención a Cliente'
                        ? '🔒 Mensaje interno (solo para Atención a Cliente)...'
                        : 'Escribe una respuesta...'}
                      value={replyText}
                      onChange={(e) => { setReplyText(e.target.value); if (originalText !== null) setOriginalText(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                      slotProps={{ htmlInput: { spellCheck: true, lang: 'es' } }}
                      sx={{ '& .MuiOutlinedInput-root': originalText !== null ? { borderColor: '#7B1FA2' } : {} }}
                    />
                    <IconButton onClick={handleSendReply} disabled={sending || (!replyText.trim() && attachedFiles.length === 0)}>
                      {sending ? <CircularProgress size={24} /> : <SendIcon sx={{ color: ORANGE }} />}
                    </IconButton>
                  </Box>
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
              {selectedTicket.status !== 'resolved' && selectedTicket.department_name !== 'Atención a Cliente' && (
                <Button
                  variant="outlined"
                  onClick={handleTransferToAtencion}
                  startIcon={<TransferIcon />}
                  sx={{ borderColor: ORANGE, color: ORANGE, '&:hover': { borderColor: ORANGE, bgcolor: '#FFF3EE' } }}
                >
                  Concluir y Transferir a Atn a Cliente
                </Button>
              )}
              {selectedTicket.status !== 'resolved' && ['customer_service', 'counter_staff'].includes(currentUserRole) && (
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
            disabled={transferring || !transferDept}
            sx={{ bgcolor: '#9C27B0', '&:hover': { bgcolor: '#7B1FA2' } }}
            startIcon={transferring ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <TransferIcon />}
          >
            Transferir
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detalle de Guía */}
      <PackageDetailDialog
        tracking={packageDetailTracking}
        onClose={() => setPackageDetailTracking(null)}
      />
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
            icon={ticket.category in categoryIcons ? categoryIcons[ticket.category] : <HelpIcon fontSize="small" />}
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
