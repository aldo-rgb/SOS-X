/**
 * UnifiedLeadsPage.tsx
 * 
 * Módulo CRM Unificado - Central de Leads
 * Combina dos fuentes de leads en una sola interfaz:
 * 
 * Tab 1: CRM Leads (Usuarios Registrados)
 *   - Clientes existentes que solicitaron asesor desde la app
 *   - Datos: crm_requests + users
 *   - Ya tienen cuenta, casillero (box_id)
 * 
 * Tab 2: Prospectos Externos
 *   - Personas no registradas, capturadas manualmente (FB, IG, etc.)
 *   - Datos: prospects
 *   - Pueden convertirse en clientes
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  Card,
  CardContent,
  Avatar,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  type SelectChangeEvent,
  Divider,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailIcon from '@mui/icons-material/Email';
import EventIcon from '@mui/icons-material/Event';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import PhoneIcon from '@mui/icons-material/Phone';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import FacebookIcon from '@mui/icons-material/Facebook';
import ChatIcon from '@mui/icons-material/Chat';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';

const API_URL = 'http://localhost:3001/api';

// ============ INTERFACES ============

// CRM Lead (usuario registrado)
interface Lead {
  request_id: number;
  created_at: string;
  status: string;
  admin_notes: string | null;
  updated_at: string | null;
  user_id: number;
  full_name: string;
  email: string;
  box_id: string;
  phone: string | null;
  assigned_advisor_name: string | null;
}

// Prospecto externo
interface Prospect {
  id: number;
  full_name: string;
  whatsapp: string;
  email: string;
  acquisition_channel: string;
  assigned_advisor_id: number | null;
  status: string;
  notes: string;
  follow_up_date: string | null;
  created_by_id: number;
  converted_user_id: number | null;
  created_at: string;
  advisor_name: string | null;
  created_by_name: string;
  follow_up_today: boolean;
  follow_up_overdue: boolean;
  // Campos de Facebook
  facebook_psid: string | null;
  last_interaction_fb: string | null;
  is_ai_active: boolean;
}

// Mensaje de chat de Facebook
interface FBChatMessage {
  id: number;
  sender_type: 'user' | 'ai' | 'human';
  message: string;
  created_at: string;
}

interface Advisor {
  id: number;
  full_name: string;
  email: string;
  referral_code?: string;
  box_id?: string;
}

interface LeadStats {
  pending: number;
  assigned: number;
  contacted: number;
  converted: number;
}

interface ProspectStats {
  new_count: number;
  contacting_count: number;
  interested_count: number;
  converted_count: number;
  lost_count: number;
  follow_up_today: number;
}

// ============ CONSTANTS ============

const getLeadStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'warning';
    case 'assigned': return 'info';
    case 'contacted': return 'primary';
    case 'converted': return 'success';
    default: return 'default';
  }
};

// ============ COMPONENT ============

export default function UnifiedLeadsPage() {
  const { t } = useTranslation();

  // Función para obtener label traducida de canal
  const getChannelLabel = (channel: string) => {
    switch (channel) {
      case 'FACEBOOK': return t('facebook.channels.facebook');
      case 'FB': return 'Facebook';
      case 'IG': return t('facebook.channels.instagram');
      case 'WA': return t('facebook.channels.whatsapp');
      case 'WEB': return t('facebook.channels.web');
      case 'REF': return t('facebook.channels.referral');
      case 'OTHER': return t('facebook.channels.other');
      default: return channel;
    }
  };

  // Obtener lista de canales traducidos
  const CHANNELS = [
    { value: 'FACEBOOK', label: t('facebook.channels.facebook'), icon: 'facebook' },
    { value: 'FB', label: 'Facebook', icon: 'facebook' },
    { value: 'IG', label: t('facebook.channels.instagram'), icon: 'instagram' },
    { value: 'WA', label: t('facebook.channels.whatsapp'), icon: 'whatsapp' },
    { value: 'WEB', label: t('facebook.channels.web'), icon: 'web' },
    { value: 'REF', label: t('facebook.channels.referral'), icon: 'referral' },
    { value: 'OTHER', label: t('facebook.channels.other'), icon: 'other' },
  ];

  // Obtener lista de estados de prospecto traducidos
  const PROSPECT_STATUSES = [
    { value: 'new', label: t('leads.new'), color: 'info' as const },
    { value: 'contacting', label: t('leads.contacting'), color: 'warning' as const },
    { value: 'interested', label: t('leads.interested'), color: 'primary' as const },
    { value: 'converted', label: t('leads.converted'), color: 'success' as const },
    { value: 'lost', label: t('leads.lost'), color: 'error' as const },
  ];

  const getProspectStatusInfo = (status: string) => {
    return PROSPECT_STATUSES.find(s => s.value === status) || { value: status, label: status, color: 'default' as const };
  };

  // Función para obtener label traducida de status
  const getLeadStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t('leads.pending');
      case 'assigned': return t('leads.assigned');
      case 'contacted': return t('leads.contacted');
      case 'converted': return t('leads.converted');
      default: return status;
    }
  };

  // @ts-ignore - keeping for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getProspectStatusLabel = (status: string) => {
    switch (status) {
      case 'new': return t('leads.new');
      case 'contacting': return t('leads.contacting');
      case 'interested': return t('leads.interested');
      case 'converted': return t('leads.converted');
      case 'lost': return t('leads.lost');
      default: return status;
    }
  };

  // Tab principal
  const [mainTab, setMainTab] = useState<'leads' | 'prospects'>('leads');
  
  // Estados comunes
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // ============ CRM LEADS STATE ============
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadStats, setLeadStats] = useState<LeadStats>({ pending: 0, assigned: 0, contacted: 0, converted: 0 });
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadTabValue, setLeadTabValue] = useState('pending');
  
  // Modal asignación lead
  const [openLeadModal, setOpenLeadModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadNotes, setLeadNotes] = useState('');
  const [assigningLead, setAssigningLead] = useState(false);

  // ============ PROSPECTS STATE ============
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectsLoading, setProspectsLoading] = useState(true);
  const [prospectStats, setProspectStats] = useState<ProspectStats | null>(null);

  // Filtros prospectos
  const [prospectStatusFilter, setProspectStatusFilter] = useState('all');
  const [prospectAdvisorFilter, setProspectAdvisorFilter] = useState('');
  const [prospectChannelFilter, setProspectChannelFilter] = useState('');
  const [prospectSearch, setProspectSearch] = useState('');
  const [prospectPage, setProspectPage] = useState(0);
  const [prospectRowsPerPage, setProspectRowsPerPage] = useState(25);
  const [prospectTotalCount, setProspectTotalCount] = useState(0);

  // Diálogos prospectos
  const [prospectFormOpen, setProspectFormOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [prospectFormData, setProspectFormData] = useState({
    full_name: '',
    whatsapp: '',
    email: '',
    acquisition_channel: '',
    assigned_advisor_id: '',
    notes: '',
    follow_up_date: '',
    status: 'new',
  });
  const [savingProspect, setSavingProspect] = useState(false);

  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertingProspect, setConvertingProspect] = useState<Prospect | null>(null);
  const [convertPassword, setConvertPassword] = useState('');
  const [converting, setConverting] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProspect, setDeletingProspect] = useState<Prospect | null>(null);

  // ============ FACEBOOK CHAT STATE ============
  const [fbChatOpen, setFbChatOpen] = useState(false);
  const [fbChatProspect, setFbChatProspect] = useState<Prospect | null>(null);
  const [fbChatMessages, setFbChatMessages] = useState<FBChatMessage[]>([]);
  const [fbChatLoading, setFbChatLoading] = useState(false);
  const [fbNewMessage, setFbNewMessage] = useState('');
  const [fbSendingMessage, setFbSendingMessage] = useState(false);
  const [fbTogglingAI, setFbTogglingAI] = useState(false);

  const getToken = () => localStorage.getItem('token') || '';

  // ============ DATA FETCHING ============

  // Cargar asesores
  const fetchAdvisors = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/crm/advisors`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.data.success) {
        setAdvisors(res.data.advisors || []);
      }
    } catch {
      console.error('Error fetching advisors');
    }
  };

  // Cargar CRM Leads
  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/crm/leads?status=${leadTabValue}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.data.success) {
        setLeads(res.data.leads || []);
        setLeadStats(res.data.stats || { pending: 0, assigned: 0, contacted: 0, converted: 0 });
      }
    } catch {
      console.error('Error fetching leads');
    } finally {
      setLeadsLoading(false);
    }
  }, [leadTabValue]);

  // Cargar Prospectos
  const fetchProspects = useCallback(async () => {
    setProspectsLoading(true);
    try {
      const params = new URLSearchParams();
      if (prospectStatusFilter !== 'all') params.append('status', prospectStatusFilter);
      if (prospectAdvisorFilter) params.append('advisorId', prospectAdvisorFilter);
      if (prospectChannelFilter) params.append('channel', prospectChannelFilter);
      if (prospectSearch) params.append('search', prospectSearch);
      params.append('page', String(prospectPage + 1));
      params.append('limit', String(prospectRowsPerPage));

      const res = await axios.get(`${API_URL}/admin/crm/prospects?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      setProspects(res.data.data || []);
      setProspectStats(res.data.stats || null);
      setProspectTotalCount(res.data.pagination?.total || 0);
    } catch {
      setSnackbar({ open: true, message: t('leads.errorLoadingProspects'), severity: 'error' });
    } finally {
      setProspectsLoading(false);
    }
  }, [prospectStatusFilter, prospectAdvisorFilter, prospectChannelFilter, prospectSearch, prospectPage, prospectRowsPerPage]);

  // Effects
  useEffect(() => {
    fetchAdvisors();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mainTab === 'leads') {
      fetchLeads();
    } else {
      fetchProspects();
    }
  }, [mainTab, fetchLeads, fetchProspects]);

  // ============ CRM LEADS HANDLERS ============

  const handleAssignLead = async (advisorId: number) => {
    if (!selectedLead) return;
    setAssigningLead(true);

    try {
      await axios.post(
        `${API_URL}/admin/crm/assign`,
        {
          requestId: selectedLead.request_id,
          userId: selectedLead.user_id,
          advisorId: advisorId,
          notes: leadNotes,
        },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );

      setOpenLeadModal(false);
      setLeadNotes('');
      setSnackbar({ open: true, message: t('leads.advisorAssigned'), severity: 'success' });
      fetchLeads();
    } catch {
      setSnackbar({ open: true, message: t('leads.errorAssigning'), severity: 'error' });
    } finally {
      setAssigningLead(false);
    }
  };

  const handleUpdateLeadStatus = async (lead: Lead, newStatus: string) => {
    try {
      await axios.put(
        `${API_URL}/admin/crm/leads/${lead.request_id}/status`,
        { requestId: lead.request_id, status: newStatus },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      fetchLeads();
    } catch {
      setSnackbar({ open: true, message: t('leads.errorUpdatingStatus'), severity: 'error' });
    }
  };

  // ============ PROSPECTS HANDLERS ============

  const handleOpenProspectForm = (prospect?: Prospect) => {
    if (prospect) {
      setEditingProspect(prospect);
      setProspectFormData({
        full_name: prospect.full_name,
        whatsapp: prospect.whatsapp || '',
        email: prospect.email || '',
        acquisition_channel: prospect.acquisition_channel || '',
        assigned_advisor_id: prospect.assigned_advisor_id ? String(prospect.assigned_advisor_id) : '',
        notes: prospect.notes || '',
        follow_up_date: prospect.follow_up_date ? prospect.follow_up_date.split('T')[0] : '',
        status: prospect.status,
      });
    } else {
      setEditingProspect(null);
      setProspectFormData({
        full_name: '',
        whatsapp: '',
        email: '',
        acquisition_channel: '',
        assigned_advisor_id: '',
        notes: '',
        follow_up_date: '',
        status: 'new',
      });
    }
    setProspectFormOpen(true);
  };

  const handleSaveProspect = async () => {
    if (!prospectFormData.full_name) {
      setSnackbar({ open: true, message: t('leads.nameRequired'), severity: 'error' });
      return;
    }

    setSavingProspect(true);
    try {
      if (editingProspect) {
        await axios.put(`${API_URL}/admin/crm/prospects/${editingProspect.id}`, {
          ...prospectFormData,
          assigned_advisor_id: prospectFormData.assigned_advisor_id || null,
          follow_up_date: prospectFormData.follow_up_date || null,
        }, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        setSnackbar({ open: true, message: t('leads.prospectUpdated'), severity: 'success' });
      } else {
        await axios.post(`${API_URL}/admin/crm/prospects`, {
          ...prospectFormData,
          assigned_advisor_id: prospectFormData.assigned_advisor_id || null,
          follow_up_date: prospectFormData.follow_up_date || null,
        }, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        setSnackbar({ open: true, message: t('leads.prospectCreated'), severity: 'success' });
      }
      setProspectFormOpen(false);
      fetchProspects();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || t('leads.errorSaving'), 
        severity: 'error' 
      });
    } finally {
      setSavingProspect(false);
    }
  };

  const handleOpenConvert = (prospect: Prospect) => {
    setConvertingProspect(prospect);
    setConvertPassword('EntregaX2026!');
    setConvertDialogOpen(true);
  };

  const handleConvert = async () => {
    if (!convertingProspect) return;

    setConverting(true);
    try {
      const res = await axios.post(`${API_URL}/admin/crm/prospects/${convertingProspect.id}/convert`, {
        password: convertPassword,
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      setSnackbar({ 
        open: true, 
        message: `${t('leads.prospectConverted')} ${res.data.data?.box_id}`, 
        severity: 'success' 
      });
      setConvertDialogOpen(false);
      fetchProspects();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || t('leads.errorConverting'), 
        severity: 'error' 
      });
    } finally {
      setConverting(false);
    }
  };

  const handleDeleteProspect = async () => {
    if (!deletingProspect) return;

    try {
      await axios.delete(`${API_URL}/admin/crm/prospects/${deletingProspect.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSnackbar({ open: true, message: t('leads.prospectDeleted'), severity: 'success' });
      setDeleteDialogOpen(false);
      fetchProspects();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || t('leads.errorDeleting'), 
        severity: 'error' 
      });
    }
  };

  const handleQuickProspectStatusChange = async (prospect: Prospect, newStatus: string) => {
    try {
      await axios.put(`${API_URL}/admin/crm/prospects/${prospect.id}`, {
        ...prospect,
        status: newStatus,
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      fetchProspects();
    } catch {
      setSnackbar({ open: true, message: t('leads.errorUpdatingStatus'), severity: 'error' });
    }
  };

  // ============ FACEBOOK CHAT FUNCTIONS ============

  // Abrir modal de chat de Facebook
  const handleOpenFBChat = async (prospect: Prospect) => {
    setFbChatProspect(prospect);
    setFbChatOpen(true);
    setFbChatLoading(true);
    setFbChatMessages([]);
    setFbNewMessage('');

    try {
      const res = await axios.get(`${API_URL}/admin/facebook/chat/${prospect.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setFbChatMessages(res.data || []);
    } catch (err) {
      console.error('Error loading FB chat:', err);
      setSnackbar({ open: true, message: t('facebook.errorLoadingChat'), severity: 'error' });
    } finally {
      setFbChatLoading(false);
    }
  };

  // Enviar mensaje manual desde el panel
  const handleSendFBMessage = async () => {
    if (!fbChatProspect || !fbNewMessage.trim()) return;

    setFbSendingMessage(true);
    try {
      await axios.post(`${API_URL}/admin/facebook/send/${fbChatProspect.id}`, {
        message: fbNewMessage.trim()
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      // Agregar mensaje al historial local
      setFbChatMessages(prev => [...prev, {
        id: Date.now(),
        sender_type: 'human',
        message: fbNewMessage.trim(),
        created_at: new Date().toISOString()
      }]);
      setFbNewMessage('');
      setSnackbar({ open: true, message: t('facebook.messageSent'), severity: 'success' });
    } catch (err) {
      console.error('Error sending FB message:', err);
      setSnackbar({ open: true, message: t('facebook.errorSendingMessage'), severity: 'error' });
    } finally {
      setFbSendingMessage(false);
    }
  };

  // Activar/Desactivar IA para el prospecto
  const handleToggleFBAI = async (prospect: Prospect, newState: boolean) => {
    setFbTogglingAI(true);
    try {
      await axios.post(`${API_URL}/admin/facebook/toggle-ai/${prospect.id}`, {
        active: newState
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      // Actualizar estado local
      if (fbChatProspect?.id === prospect.id) {
        setFbChatProspect({ ...prospect, is_ai_active: newState });
      }
      fetchProspects();
      setSnackbar({ 
        open: true, 
        message: newState ? t('leads.aiReactivated') : t('leads.tookControl'), 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Error toggling AI:', err);
      setSnackbar({ open: true, message: t('facebook.errorTogglingAI'), severity: 'error' });
    } finally {
      setFbTogglingAI(false);
    }
  };

  // Obtener el color del sender
  const getFBSenderColor = (senderType: string) => {
    switch (senderType) {
      case 'user': return '#1877F2'; // Azul Facebook
      case 'ai': return '#9C27B0';   // Morado para IA
      case 'human': return '#2E7D32'; // Verde para humano
      default: return '#666';
    }
  };

  const getFBSenderLabel = (senderType: string) => {
    switch (senderType) {
      case 'user': return t('facebook.senderLabels.user');
      case 'ai': return t('facebook.senderLabels.ai');
      case 'human': return t('facebook.senderLabels.human');
      default: return senderType;
    }
  };

  // ============ UTILITY FUNCTIONS ============

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-MX');
  };

  const formatDateTime = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const diffHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Hace menos de 1 hora';
    if (diffHours < 24) return `Hace ${diffHours} horas`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Hace 1 día';
    return `Hace ${diffDays} días`;
  };

  // ============ STATS TOTALS ============
  const totalLeads = leadStats.pending + leadStats.assigned + leadStats.contacted + leadStats.converted;
  const totalProspects = prospectStats 
    ? prospectStats.new_count + prospectStats.contacting_count + prospectStats.interested_count + prospectStats.converted_count + prospectStats.lost_count 
    : 0;

  // ============ RENDER ============

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WhatshotIcon color="error" /> {t('leads.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('leads.subtitle')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {mainTab === 'prospects' && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenProspectForm()}
              sx={{ background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)' }}
            >
              {t('leads.newProspect')}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => mainTab === 'leads' ? fetchLeads() : fetchProspects()}
          >
            {t('common.refresh')}
          </Button>
        </Box>
      </Box>

      {/* Main Tabs - Leads vs Prospectos */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={mainTab}
          onChange={(_, v) => setMainTab(v)}
          indicatorColor="primary"
          textColor="primary"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            value="leads" 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonSearchIcon fontSize="small" />
                {t('leads.crmLeads')} ({totalLeads})
              </Box>
            }
          />
          <Tab 
            value="prospects" 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonAddIcon fontSize="small" />
                {t('leads.externalProspects')} ({totalProspects})
              </Box>
            }
          />
        </Tabs>

        {/* Explicación del tab */}
        <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)' }}>
          {mainTab === 'leads' ? (
            <Alert severity="info" icon={<PersonSearchIcon />}>
              <strong>{t('leads.crmLeads')}:</strong> {t('leads.crmLeadsDescription')}
            </Alert>
          ) : (
            <Alert severity="info" icon={<PersonAddIcon />}>
              <strong>{t('leads.externalProspects')}:</strong> {t('leads.crmLeadsDescription')}
            </Alert>
          )}
        </Box>
      </Paper>

      {/* ============ CRM LEADS TAB ============ */}
      {mainTab === 'leads' && (
        <Box>
          {/* Lead Stats */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fff3e0', borderLeft: '4px solid #ff9800' }}>
              <Typography variant="h4" fontWeight={700} color="#e65100">{leadStats.pending}</Typography>
              <Typography variant="body2" color="text.secondary">{t('leads.pending')} 🔥</Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#e3f2fd', borderLeft: '4px solid #2196f3' }}>
              <Typography variant="h4" fontWeight={700} color="#1565c0">{leadStats.assigned}</Typography>
              <Typography variant="body2" color="text.secondary">{t('leads.assigned')}</Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fce4ec', borderLeft: '4px solid #e91e63' }}>
              <Typography variant="h4" fontWeight={700} color="#c2185b">{leadStats.contacted}</Typography>
              <Typography variant="body2" color="text.secondary">{t('leads.contacted')}</Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#e8f5e9', borderLeft: '4px solid #4caf50' }}>
              <Typography variant="h4" fontWeight={700} color="#2e7d32">{leadStats.converted}</Typography>
              <Typography variant="body2" color="text.secondary">{t('leads.converted')} ✅</Typography>
            </Paper>
          </Box>

          {/* Lead Sub-tabs */}
          <Paper sx={{ mb: 2 }}>
            <Tabs
              value={leadTabValue}
              onChange={(_, v) => setLeadTabValue(v)}
              indicatorColor="primary"
              textColor="primary"
            >
              <Tab value="pending" label={`${t('leads.pending')} (${leadStats.pending})`} />
              <Tab value="assigned" label={`${t('leads.assigned')} (${leadStats.assigned})`} />
              <Tab value="contacted" label={`${t('leads.contacted')} (${leadStats.contacted})`} />
              <Tab value="converted" label={`${t('leads.converted')} (${leadStats.converted})`} />
              <Tab value="all" label={t('leads.all')} />
            </Tabs>
          </Paper>

          {/* Alert */}
          {leadTabValue === 'pending' && leadStats.pending > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              ⚡ {t('leads.pending')}: <strong>{leadStats.pending}</strong>
            </Alert>
          )}

          {/* Leads Table */}
          {leadsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('leads.requestDate')}</TableCell>
                    <TableCell>{t('leads.client')}</TableCell>
                    <TableCell>{t('leads.boxId')}</TableCell>
                    <TableCell>{t('leads.contact')}</TableCell>
                    <TableCell>{t('leads.state')}</TableCell>
                    <TableCell>{t('leads.assignedAdvisor')}</TableCell>
                    <TableCell align="right">{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.request_id} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">{formatDateTime(lead.created_at)}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AccessTimeIcon sx={{ fontSize: 12 }} />
                            {getTimeAgo(lead.created_at)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body1" fontWeight={600}>{lead.full_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={lead.box_id} size="small" variant="outlined" color="primary" />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <EmailIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="body2">{lead.email}</Typography>
                          </Box>
                          {lead.phone && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                              <Typography variant="body2">{lead.phone}</Typography>
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getLeadStatusLabel(lead.status)}
                          color={getLeadStatusColor(lead.status) as 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {lead.assigned_advisor_name || (
                          <Typography variant="body2" color="text.secondary" fontStyle="italic">
                            {t('leads.unassigned')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {lead.status === 'pending' && (
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<PersonAddIcon />}
                            onClick={() => {
                              setSelectedLead(lead);
                              setOpenLeadModal(true);
                            }}
                            sx={{ bgcolor: '#111' }}
                          >
                            {t('leads.assign')}
                          </Button>
                        )}
                        {lead.status === 'assigned' && (
                          <Tooltip title="Marcar como contactado">
                            <IconButton
                              color="primary"
                              onClick={() => handleUpdateLeadStatus(lead, 'contacted')}
                            >
                              <PhoneIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {lead.status === 'contacted' && (
                          <Tooltip title="Marcar como convertido">
                            <IconButton
                              color="success"
                              onClick={() => handleUpdateLeadStatus(lead, 'converted')}
                            >
                              <CheckCircleIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {leads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                        <Typography variant="body1" color="text.secondary">
                          {leadTabValue === 'pending'
                            ? `${t('leads.noRequests')} 🎉`
                            : t('leads.noRequests')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      {/* ============ PROSPECTS TAB ============ */}
      {mainTab === 'prospects' && (
        <Box>
          {/* Prospect Stats */}
          {prospectStats && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: 'info.light', color: 'info.contrastText' }}>
                  <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={700}>{prospectStats.new_count}</Typography>
                    <Typography variant="caption">Nuevos</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                  <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={700}>{prospectStats.contacting_count}</Typography>
                    <Typography variant="caption">Contactando</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                  <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={700}>{prospectStats.interested_count}</Typography>
                    <Typography variant="caption">Interesados</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
                  <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={700}>{prospectStats.converted_count}</Typography>
                    <Typography variant="caption">Convertidos</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
                  <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={700}>{prospectStats.lost_count}</Typography>
                    <Typography variant="caption">{t('leads.lost')}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <Card sx={{ bgcolor: 'secondary.light', color: 'secondary.contrastText' }}>
                  <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" fontWeight={700}>{prospectStats.follow_up_today}</Typography>
                    <Typography variant="caption">📅 {t('leads.today')}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Filters */}
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder={t('leads.searchPlaceholder')}
                value={prospectSearch}
                onChange={(e) => setProspectSearch(e.target.value)}
                sx={{ minWidth: 280 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t('leads.statusLabel')}</InputLabel>
                <Select
                  value={prospectStatusFilter}
                  label={t('leads.statusLabel')}
                  onChange={(e: SelectChangeEvent) => { setProspectStatusFilter(e.target.value); setProspectPage(0); }}
                >
                  <MenuItem value="all">{t('common.all')}</MenuItem>
                  {PROSPECT_STATUSES.map(s => (
                    <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>{t('leads.channelLabel')}</InputLabel>
                <Select
                  value={prospectChannelFilter}
                  label={t('leads.channelLabel')}
                  onChange={(e: SelectChangeEvent) => { setProspectChannelFilter(e.target.value); setProspectPage(0); }}
                >
                  <MenuItem value="">{t('common.all')}</MenuItem>
                  {CHANNELS.map(c => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>{t('leads.advisorLabel')}</InputLabel>
                <Select
                  value={prospectAdvisorFilter}
                  label={t('leads.advisorLabel')}
                  onChange={(e: SelectChangeEvent) => { setProspectAdvisorFilter(e.target.value); setProspectPage(0); }}
                >
                  <MenuItem value="">{t('common.all')}</MenuItem>
                  {advisors.map(a => (
                    <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Paper>

          {/* Prospects Table */}
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.03)' }}>
                    <TableCell><strong>{t('leads.prospect')}</strong></TableCell>
                    <TableCell><strong>{t('leads.contact')}</strong></TableCell>
                    <TableCell><strong>{t('leads.channelLabel')}</strong></TableCell>
                    <TableCell><strong>{t('leads.advisorLabel')}</strong></TableCell>
                    <TableCell><strong>{t('leads.followUp')}</strong></TableCell>
                    <TableCell><strong>{t('leads.statusLabel')}</strong></TableCell>
                    <TableCell align="center"><strong>{t('common.actions')}</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {prospectsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={40} />
                      </TableCell>
                    </TableRow>
                  ) : prospects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">{t('leads.noProspectsToShow')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    prospects.map((prospect) => (
                      <TableRow 
                        key={prospect.id}
                        sx={{
                          bgcolor: prospect.follow_up_today ? 'rgba(255, 193, 7, 0.1)' : 
                                   prospect.follow_up_overdue ? 'rgba(211, 47, 47, 0.05)' : 'transparent',
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' }
                        }}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main' }}>
                              {prospect.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </Avatar>
                            <Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2" fontWeight={500}>{prospect.full_name}</Typography>
                                {prospect.follow_up_today && <EventIcon fontSize="small" color="warning" />}
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(prospect.created_at)}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {prospect.whatsapp && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <WhatsAppIcon fontSize="small" sx={{ color: '#25D366' }} />
                                <Typography variant="caption">{prospect.whatsapp}</Typography>
                              </Box>
                            )}
                            {prospect.email && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <EmailIcon fontSize="small" color="action" />
                                <Typography variant="caption">{prospect.email}</Typography>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {/* Icono de Facebook si es de ese canal */}
                            {(prospect.acquisition_channel === 'FACEBOOK' || prospect.facebook_psid) && (
                              <FacebookIcon fontSize="small" sx={{ color: '#1877F2' }} />
                            )}
                            <Chip 
                              label={getChannelLabel(prospect.acquisition_channel)} 
                              size="small" 
                              variant="outlined"
                              sx={{
                                borderColor: prospect.acquisition_channel === 'FACEBOOK' ? '#1877F2' : undefined,
                                color: prospect.acquisition_channel === 'FACEBOOK' ? '#1877F2' : undefined,
                              }}
                            />
                            {/* Indicador de IA activa/inactiva para Facebook */}
                            {prospect.facebook_psid && (
                              <Tooltip title={prospect.is_ai_active ? 'IA activa' : 'Control humano'}>
                                {prospect.is_ai_active ? (
                                  <SmartToyIcon fontSize="small" sx={{ color: '#9C27B0' }} />
                                ) : (
                                  <PersonIcon fontSize="small" sx={{ color: '#2E7D32' }} />
                                )}
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{prospect.advisor_name || '-'}</Typography>
                        </TableCell>
                        <TableCell>
                          {prospect.follow_up_date ? (
                            <Chip
                              icon={<EventIcon />}
                              label={formatDate(prospect.follow_up_date)}
                              size="small"
                              color={prospect.follow_up_today ? 'warning' : prospect.follow_up_overdue ? 'error' : 'default'}
                            />
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" variant="standard" sx={{ minWidth: 100 }}>
                            <Select
                              value={prospect.status}
                              onChange={(e) => handleQuickProspectStatusChange(prospect, e.target.value)}
                              disableUnderline
                              renderValue={(value) => (
                                <Chip 
                                  label={getProspectStatusInfo(value).label} 
                                  size="small" 
                                  color={getProspectStatusInfo(value).color}
                                />
                              )}
                            >
                              {PROSPECT_STATUSES.map(s => (
                                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            {/* Botón Ver Chat de Facebook */}
                            {prospect.facebook_psid && (
                              <Tooltip title="Ver Chat de Facebook">
                                <IconButton 
                                  size="small" 
                                  sx={{ color: '#1877F2' }}
                                  onClick={() => handleOpenFBChat(prospect)}
                                >
                                  <ChatIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {prospect.status !== 'converted' && prospect.status !== 'lost' && (
                              <Tooltip title="Convertir a Cliente">
                                <IconButton size="small" color="success" onClick={() => handleOpenConvert(prospect)}>
                                  <PersonAddIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Editar">
                              <IconButton size="small" onClick={() => handleOpenProspectForm(prospect)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar">
                              <IconButton 
                                size="small" 
                                color="error"
                                onClick={() => { setDeletingProspect(prospect); setDeleteDialogOpen(true); }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={prospectTotalCount}
              page={prospectPage}
              onPageChange={(_, p) => setProspectPage(p)}
              rowsPerPage={prospectRowsPerPage}
              onRowsPerPageChange={(e) => { setProspectRowsPerPage(parseInt(e.target.value, 10)); setProspectPage(0); }}
              rowsPerPageOptions={[10, 25, 50, 100]}
              labelRowsPerPage="Filas por página"
            />
          </Paper>
        </Box>
      )}

      {/* ============ DIALOGS ============ */}

      {/* Lead Assignment Modal */}
      <Dialog open={openLeadModal} onClose={() => setOpenLeadModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('leads.assignAdvisorTo')} <strong>{selectedLead?.full_name}</strong>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('leads.selectAdvisorMessage')}
          </Typography>

          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {advisors.map((advisor) => (
              <ListItem
                key={advisor.id}
                onClick={() => handleAssignLead(advisor.id)}
                sx={{
                  border: '1px solid #eee',
                  borderRadius: 2,
                  mb: 1,
                  cursor: assigningLead ? 'not-allowed' : 'pointer',
                  opacity: assigningLead ? 0.5 : 1,
                  '&:hover': { bgcolor: '#f5f5f5' },
                }}
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: '#F05A28' }}>
                    {advisor.full_name.charAt(0)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={advisor.full_name}
                  secondary={
                    <>
                      <Typography variant="caption" component="span">
                        {advisor.email}
                      </Typography>
                      <br />
                      {advisor.box_id && <Chip label={advisor.box_id} size="small" sx={{ mt: 0.5 }} />}
                    </>
                  }
                />
              </ListItem>
            ))}
            {advisors.length === 0 && (
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 3 }}>
                No hay asesores disponibles
              </Typography>
            )}
          </List>

          <Divider sx={{ my: 2 }} />

          <TextField
            label={t('leads.notesOptional')}
            placeholder={t('leads.notesPlaceholder')}
            multiline
            rows={2}
            fullWidth
            value={leadNotes}
            onChange={(e) => setLeadNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenLeadModal(false)} disabled={assigningLead}>
            {t('common.cancel')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Prospect Form Dialog */}
      <Dialog open={prospectFormOpen} onClose={() => setProspectFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingProspect ? t('leads.editProspect') : t('leads.newProspect')}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label={t('leads.fullName')}
              value={prospectFormData.full_name}
              onChange={(e) => setProspectFormData({ ...prospectFormData, full_name: e.target.value })}
              required
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('leads.whatsapp')}
                value={prospectFormData.whatsapp}
                onChange={(e) => setProspectFormData({ ...prospectFormData, whatsapp: e.target.value })}
                fullWidth
                placeholder="+52 123 456 7890"
              />
              <TextField
                label={t('leads.email')}
                type="email"
                value={prospectFormData.email}
                onChange={(e) => setProspectFormData({ ...prospectFormData, email: e.target.value })}
                fullWidth
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>{t('leads.channel')}</InputLabel>
                <Select
                  value={prospectFormData.acquisition_channel}
                  label={t('leads.channel')}
                  onChange={(e) => setProspectFormData({ ...prospectFormData, acquisition_channel: e.target.value })}
                >
                  {CHANNELS.map(c => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>{t('leads.assignAdvisor')}</InputLabel>
                <Select
                  value={prospectFormData.assigned_advisor_id}
                  label={t('leads.assignAdvisor')}
                  onChange={(e) => setProspectFormData({ ...prospectFormData, assigned_advisor_id: e.target.value })}
                >
                  <MenuItem value="">{t('leads.unassigned')}</MenuItem>
                  {advisors.map(a => (
                    <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('leads.followUpDate')}
                type="date"
                value={prospectFormData.follow_up_date}
                onChange={(e) => setProspectFormData({ ...prospectFormData, follow_up_date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              {editingProspect && (
                <FormControl fullWidth>
                  <InputLabel>{t('leads.statusLabel')}</InputLabel>
                  <Select
                    value={prospectFormData.status}
                    label={t('leads.statusLabel')}
                    onChange={(e) => setProspectFormData({ ...prospectFormData, status: e.target.value })}
                  >
                    {PROSPECT_STATUSES.map(s => (
                      <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
            <TextField
              label={t('common.notes')}
              value={prospectFormData.notes}
              onChange={(e) => setProspectFormData({ ...prospectFormData, notes: e.target.value })}
              multiline
              rows={3}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProspectFormOpen(false)}>{t('common.cancel')}</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveProspect}
            disabled={savingProspect}
          >
            {savingProspect ? <CircularProgress size={20} /> : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Convert Dialog */}
      <Dialog open={convertDialogOpen} onClose={() => setConvertDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {t('leads.convertToClient')}
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('leads.willCreateAccount')} <strong>{convertingProspect?.full_name}</strong>
          </Alert>
          <TextField
            label={t('leads.temporaryPassword')}
            value={convertPassword}
            onChange={(e) => setConvertPassword(e.target.value)}
            fullWidth
            helperText={t('leads.passwordHelper')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConvertDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button 
            variant="contained" 
            color="success"
            onClick={handleConvert}
            disabled={converting}
            startIcon={converting ? <CircularProgress size={16} /> : <PersonAddIcon />}
          >
            {t('leads.createClient')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('leads.confirmDelete')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('leads.deleteConfirmMessage')} <strong>{deletingProspect?.full_name}</strong>? {t('leads.actionCannotBeUndone')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error" onClick={handleDeleteProspect}>
            {t('common.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============ FACEBOOK CHAT MODAL ============ */}
      <Dialog 
        open={fbChatOpen} 
        onClose={() => setFbChatOpen(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{ sx: { height: '80vh', display: 'flex', flexDirection: 'column' } }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          bgcolor: '#1877F2',
          color: 'white',
          py: 1.5
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FacebookIcon />
            <Typography variant="h6">
              Chat con {fbChatProspect?.full_name}
            </Typography>
            {fbChatProspect?.is_ai_active ? (
              <Chip 
                icon={<SmartToyIcon />} 
                label="IA Activa" 
                size="small" 
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
              />
            ) : (
              <Chip 
                icon={<PersonIcon />} 
                label="Control Humano" 
                size="small" 
                sx={{ bgcolor: 'rgba(46,125,50,0.8)', color: 'white' }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {/* Botón Tomar Control / Reactivar IA */}
            <Button
              variant="contained"
              size="small"
              color={fbChatProspect?.is_ai_active ? 'warning' : 'success'}
              disabled={fbTogglingAI}
              onClick={() => fbChatProspect && handleToggleFBAI(fbChatProspect, !fbChatProspect.is_ai_active)}
              startIcon={fbChatProspect?.is_ai_active ? <PersonIcon /> : <SmartToyIcon />}
              sx={{ 
                bgcolor: fbChatProspect?.is_ai_active ? '#FFA726' : '#66BB6A',
                '&:hover': { 
                  bgcolor: fbChatProspect?.is_ai_active ? '#FF9800' : '#4CAF50' 
                }
              }}
            >
              {fbTogglingAI ? (
                <CircularProgress size={16} color="inherit" />
              ) : fbChatProspect?.is_ai_active ? (
                'Tomar Control'
              ) : (
                'Reactivar IA'
              )}
            </Button>
            <IconButton onClick={() => setFbChatOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ 
          flex: 1, 
          overflow: 'auto', 
          bgcolor: '#f0f2f5', 
          p: 2,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {fbChatLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <CircularProgress />
            </Box>
          ) : fbChatMessages.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, flexDirection: 'column', gap: 1 }}>
              <ChatIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
              <Typography color="text.secondary">No hay mensajes aún</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {fbChatMessages.map((msg) => (
                <Box
                  key={msg.id}
                  sx={{
                    display: 'flex',
                    justifyContent: msg.sender_type === 'user' ? 'flex-start' : 'flex-end',
                    mb: 0.5
                  }}
                >
                  <Box
                    sx={{
                      maxWidth: '70%',
                      bgcolor: msg.sender_type === 'user' ? 'white' : getFBSenderColor(msg.sender_type),
                      color: msg.sender_type === 'user' ? 'text.primary' : 'white',
                      borderRadius: 2,
                      p: 1.5,
                      boxShadow: 1
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      {msg.sender_type === 'user' && <FacebookIcon sx={{ fontSize: 14, color: '#1877F2' }} />}
                      {msg.sender_type === 'ai' && <SmartToyIcon sx={{ fontSize: 14 }} />}
                      {msg.sender_type === 'human' && <PersonIcon sx={{ fontSize: 14 }} />}
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {getFBSenderLabel(msg.sender_type)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {msg.message}
                    </Typography>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        display: 'block', 
                        mt: 0.5, 
                        opacity: 0.7,
                        textAlign: 'right'
                      }}
                    >
                      {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>

        {/* Input para enviar mensaje manual */}
        <Box sx={{ p: 2, bgcolor: 'white', borderTop: '1px solid #e0e0e0' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder={fbChatProspect?.is_ai_active 
                ? "La IA está respondiendo. Toma el control para enviar mensajes manuales." 
                : "Escribe un mensaje..."}
              value={fbNewMessage}
              onChange={(e) => setFbNewMessage(e.target.value)}
              disabled={fbChatProspect?.is_ai_active || fbSendingMessage}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendFBMessage();
                }
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3
                }
              }}
            />
            <Button
              variant="contained"
              disabled={fbChatProspect?.is_ai_active || !fbNewMessage.trim() || fbSendingMessage}
              onClick={handleSendFBMessage}
              sx={{ 
                borderRadius: 3, 
                minWidth: 100,
                bgcolor: '#1877F2',
                '&:hover': { bgcolor: '#166FE5' }
              }}
            >
              {fbSendingMessage ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            </Button>
          </Box>
          {fbChatProspect?.is_ai_active && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              💡 Para enviar mensajes manuales, primero debes "Tomar Control" desactivando la IA.
            </Typography>
          )}
        </Box>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
