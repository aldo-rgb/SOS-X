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
  Menu,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  Checkbox,
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
import BlockIcon from '@mui/icons-material/Block';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import ImageIcon from '@mui/icons-material/Image';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';

// ============ INTERFACES ============

// CRM Lead (usuario registrado)
interface Lead {
  request_id: number | null;
  created_at: string;
  status: string;
  admin_notes: string | null;
  updated_at: string | null;
  user_id: number | null;
  full_name: string;
  email: string;
  box_id: string;
  phone: string | null;
  assigned_advisor_name: string | null;
  // Origen del lead: 'crm' (usuario app) | 'chartback' (reactivación legacy_clients)
  source?: 'crm' | 'chartback';
  lead_key?: string;
  // Solo chartback: sub-estatus de reactivación + respuesta/actividad del asesor
  chartback_status?: string | null;
  advisor_response?: string | null;
  activity?: Array<{ ts?: string; type?: string; advisor?: string; note?: string; callback_at?: string }> | null;
  next_contact_at?: string | null;
  // Reclamado = ya existe un usuario en el sistema (match por Box ID)
  reclamado?: boolean;
  // Grupos a los que pertenece el lead
  groups?: Array<{ id: number; name: string; color: string }>;
  // Kit de bienvenida
  has_kit?: boolean;
}

// Grupo de leads
interface LeadGroup {
  id: number;
  name: string;
  color: string;
  description?: string | null;
  member_count: number;
}

// Plantilla de envío masivo (administrable)
interface BulkTemplateVar { label: string; defaultKey?: string }
interface BulkTemplate {
  id: number;
  label: string;
  template_name: string;
  language_code: string;
  variables: BulkTemplateVar[];
  preview: string | null;
  header_image_url?: string | null;
  header_image_key?: string | null;
  header_image_display?: string | null;
  use_mm_lite?: boolean;
  uses_name?: boolean;
  link_dest?: string | null;
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
  // Rastreo de clics en botones de WhatsApp
  link_clicks?: number | null;
  last_click_at?: string | null;
  // Secuencia automática
  seq_status?: string | null;
  seq_step?: number | null;
  seq_next_send_at?: string | null;
  seq_reason?: string | null;
  seq_last_sent?: string | null;
  // Kit de bienvenida
  has_kit?: boolean;
  // Origen: 'prospect' (tabla prospects) o 'legacy' (cliente de reactivación sin reclamar)
  source?: string;
  lead_key?: string;
  box_id?: string | null;
}

interface WaSequence {
  id: number;
  name: string;
  active: boolean;
  steps: { day_offset: number; template_id: number | null }[];
  stats?: { active: number; completed: number; responded: number; stopped: number } | null;
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
  phone?: string;
}

interface LeadStats {
  prospected: number;
  waiting: number;
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
    case 'prospected': return 'secondary';
    case 'waiting': return 'warning';
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
      case 'UPS': return 'UPS';
      case 'DHL': return 'DHL';
      case 'FEDEX': return 'FedEx';
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
    { value: 'UPS', label: 'UPS', icon: 'other' },
    { value: 'DHL', label: 'DHL', icon: 'other' },
    { value: 'FEDEX', label: 'FedEx', icon: 'other' },
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
      case 'prospected': return 'Prospectado';
      case 'waiting': return 'En espera';
      case 'pending': return t('leads.pending');
      case 'assigned': return t('leads.assigned');
      case 'contacted': return t('leads.contacted');
      case 'converted': return t('leads.converted');
      default: return status;
    }
  };

  // Sub-estatus de reactivación (chartback) → etiqueta legible en español.
  const getChartbackSubLabel = (s?: string | null): string => {
    switch (String(s || '').toLowerCase().trim()) {
      case 'pending': return 'Sin reclamar';
      case 'chartback_i': return 'Chartback I';
      case 'no_answer': return 'No contestó';
      case 'callback': return 'Callback agendado';
      case 'retention': return 'En retención';
      case 'recovered': return 'Recuperado ✅';
      case 'not_interested': return 'No interesado';
      default: return String(s || '');
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
  // Altas de usuarios (registros): semana (reinicia lunes) y mes (reinicia el 1).
  const [regStats, setRegStats] = useState<{ week: number; month: number; year: number; today: number }>({ week: 0, month: 0, year: 0, today: 0 });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // ============ CRM LEADS STATE ============
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadStats, setLeadStats] = useState<LeadStats>({ prospected: 0, waiting: 0, pending: 0, assigned: 0, contacted: 0, converted: 0 });
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadTabValue, setLeadTabValue] = useState('prospected');
  
  // Modal asignación lead
  const [openLeadModal, setOpenLeadModal] = useState(false);
  const [selectedLead] = useState<Lead | null>(null);
  const [leadNotes, setLeadNotes] = useState('');
  const [assigningLead, setAssigningLead] = useState(false);

  // ============ ENVÍO MASIVO WHATSAPP ============
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<Set<string>>(new Set());
  // Selección de PROSPECTOS externos para envío masivo (lead_key = 'pr_<id>').
  const [selectedProspectKeys, setSelectedProspectKeys] = useState<Set<string>>(new Set());
  const [selectedAdvisorIds, setSelectedAdvisorIds] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTemplates, setBulkTemplates] = useState<BulkTemplate[]>([]);
  const [bulkDefaults, setBulkDefaults] = useState<Record<string, any>>({});
  const [bulkTemplateId, setBulkTemplateId] = useState<number | ''>('');
  const [bulkVarValues, setBulkVarValues] = useState<string[]>([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ sent: number; skipped: number; failed: number; total: number; firstError?: string | null } | null>(null);
  // Administración de plantillas
  const [tplManagerOpen, setTplManagerOpen] = useState(false);
  const [tplEditing, setTplEditing] = useState<BulkTemplate | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [uploadingTplImage, setUploadingTplImage] = useState(false);

  // ============ GRUPOS DE LEADS ============
  const [groups, setGroups] = useState<LeadGroup[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = useState<number | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [blacklist, setBlacklist] = useState<Lead[]>([]);
  const [blacklistView, setBlacklistView] = useState(false);
  const [noPhoneFilter, setNoPhoneFilter] = useState(false);
  // Diálogo agregar teléfono
  const [phoneDialogLead, setPhoneDialogLead] = useState<Lead | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  // Menú asignar asesor
  const [advisorMenuAnchor, setAdvisorMenuAnchor] = useState<null | HTMLElement>(null);
  const [advisorMenuLead, setAdvisorMenuLead] = useState<Lead | null>(null);
  // Diálogo de confirmación reutilizable (blacklist, borrar grupo, etc.)
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; confirmLabel: string; danger: boolean; onConfirm: () => void }>({ open: false, title: '', message: '', confirmLabel: 'Aceptar', danger: false, onConfirm: () => {} });
  const askConfirm = (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void }) => {
    setConfirmDialog({ open: true, title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel || 'Aceptar', danger: !!opts.danger, onConfirm: opts.onConfirm });
  };
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#1976d2');
  const [savingGroup, setSavingGroup] = useState(false);

  // Clave única de cada lead (para selección). El backend la devuelve como lead_key.
  const leadKeyOf = (l: Lead): string => l.lead_key || `crm_${l.request_id}`;

  // Leads visibles = blacklist (si está activa) o pestaña actual, filtrados por
  // grupo activo y por búsqueda (número de cliente / nombre / asesor asignado).
  const displayedLeads = (() => {
    let list = blacklistView
      ? blacklist
      : (activeGroupFilter
          ? leads.filter(l => (l.groups || []).some(g => g.id === activeGroupFilter))
          : leads);
    if (noPhoneFilter) {
      list = list.filter(l => String(l.phone || '').trim() === '');
    }
    const q = leadSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(l =>
        String(l.box_id || '').toLowerCase().includes(q) ||
        String(l.full_name || '').toLowerCase().includes(q) ||
        String(l.assigned_advisor_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  })();

  // Pestaña "Asesores" activa (envío por asesor en vez de por lead).
  const advisorsMode = mainTab === 'leads' && leadTabValue === 'advisors';
  const bulkRecipientCount = advisorsMode
    ? selectedAdvisorIds.size
    : (mainTab === 'prospects' ? selectedProspectKeys : selectedLeadKeys).size;

  // Asesores filtrados por el buscador (para la pestaña "Asesores").
  const filteredAdvisors = (() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return advisors;
    return advisors.filter(a =>
      (a.full_name || '').toLowerCase().includes(q) ||
      (a.email || '').toLowerCase().includes(q) ||
      (a.referral_code || '').toLowerCase().includes(q) ||
      (a.box_id || '').toLowerCase().includes(q)
    );
  })();

  const fetchGroups = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/crm/groups`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setGroups(res.data?.groups || []);
    } catch { /* silencioso */ }
  }, []);

  const createGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setSavingGroup(true);
    try {
      await axios.post(`${API_URL}/admin/crm/groups`, { name, color: newGroupColor }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setNewGroupOpen(false); setNewGroupName(''); setNewGroupColor('#1976d2');
      await fetchGroups();
      setSnackbar({ open: true, message: `Grupo "${name}" creado`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al crear grupo', severity: 'error' });
    } finally { setSavingGroup(false); }
  };

  const deleteGroup = (g: LeadGroup) => {
    askConfirm({
      title: `Eliminar grupo "${g.name}"`,
      message: `Los ${g.member_count} usuario(s) NO se borran, solo quedan sin este grupo.`,
      confirmLabel: 'Eliminar grupo',
      danger: true,
      onConfirm: async () => {
        try {
          await axios.delete(`${API_URL}/admin/crm/groups/${g.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
          if (activeGroupFilter === g.id) setActiveGroupFilter(null);
          await fetchGroups();
          await fetchLeads();
          setSnackbar({ open: true, message: `Grupo "${g.name}" eliminado`, severity: 'success' });
        } catch (e: any) {
          setSnackbar({ open: true, message: e.response?.data?.error || 'Error al eliminar grupo', severity: 'error' });
        }
      },
    });
  };

  const assignSelectedToGroup = async (groupId: number) => {
    const leadKeys = Array.from(selectedLeadKeys);
    if (leadKeys.length === 0) return;
    try {
      await axios.post(`${API_URL}/admin/crm/groups/${groupId}/members`, { leadKeys }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setSelectedLeadKeys(new Set());
      await fetchGroups();
      await fetchLeads();
      const gName = groups.find(g => g.id === groupId)?.name || 'grupo';
      setSnackbar({ open: true, message: `${leadKeys.length} lead(s) agregados a "${gName}"`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al asignar al grupo', severity: 'error' });
    }
  };

  const removeLeadFromGroup = async (groupId: number, leadKey: string) => {
    try {
      await axios.delete(`${API_URL}/admin/crm/groups/${groupId}/members`, { headers: { Authorization: `Bearer ${getToken()}` }, data: { leadKeys: [leadKey] } });
      await fetchGroups();
      await fetchLeads();
    } catch { /* silencioso */ }
  };

  // ============ BLACK LIST ============
  const fetchBlacklist = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/crm/blacklist`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setBlacklist(res.data?.blacklist || []);
    } catch { /* silencioso */ }
  }, []);

  const blacklistSelected = () => {
    const leadKeys = Array.from(selectedLeadKeys);
    if (leadKeys.length === 0) return;
    askConfirm({
      title: 'Poner en Black List',
      message: `¿Poner ${leadKeys.length} lead(s) en la black list? No recibirán mensajes masivos y desaparecerán del funnel.`,
      confirmLabel: 'Sí, poner en blacklist',
      danger: true,
      onConfirm: async () => {
        try {
          await axios.post(`${API_URL}/admin/crm/blacklist`, { leadKeys }, { headers: { Authorization: `Bearer ${getToken()}` } });
          setSelectedLeadKeys(new Set());
          await fetchLeads();
          await fetchBlacklist();
          setSnackbar({ open: true, message: `${leadKeys.length} lead(s) en blacklist`, severity: 'success' });
        } catch (e: any) {
          setSnackbar({ open: true, message: e.response?.data?.error || 'Error al agregar a blacklist', severity: 'error' });
        }
      },
    });
  };

  const unBlacklist = async (leadKey: string) => {
    try {
      await axios.delete(`${API_URL}/admin/crm/blacklist`, { headers: { Authorization: `Bearer ${getToken()}` }, data: { leadKeys: [leadKey] } });
      await fetchBlacklist();
      await fetchLeads();
      setSnackbar({ open: true, message: 'Quitado de blacklist', severity: 'success' });
    } catch { /* silencioso */ }
  };

  // ============ ACCIONES POR LEAD: teléfono / asesor ============
  const openPhoneDialog = (lead: Lead) => { setPhoneDialogLead(lead); setPhoneInput(lead.phone || ''); };
  const savePhone = async () => {
    if (!phoneDialogLead) return;
    const phone = phoneInput.trim();
    if (!phone) return;
    setSavingPhone(true);
    try {
      await axios.post(`${API_URL}/admin/crm/leads/phone`, { leadKey: leadKeyOf(phoneDialogLead), phone }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setPhoneDialogLead(null); setPhoneInput('');
      await fetchLeads();
      setSnackbar({ open: true, message: 'Teléfono guardado', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al guardar teléfono', severity: 'error' });
    } finally { setSavingPhone(false); }
  };

  const assignAdvisorToLead = async (advisorId: number) => {
    const lead = advisorMenuLead;
    setAdvisorMenuAnchor(null); setAdvisorMenuLead(null);
    if (!lead) return;
    try {
      const res = await axios.post(`${API_URL}/admin/crm/leads/assign-advisor`, { leadKey: leadKeyOf(lead), advisorId }, { headers: { Authorization: `Bearer ${getToken()}` } });
      await fetchLeads();
      setSnackbar({ open: true, message: `Asesor asignado: ${res.data?.advisorName || ''}`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al asignar asesor', severity: 'error' });
    }
  };

  const toggleLeadSelected = (key: string) => {
    setSelectedLeadKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleKeys = displayedLeads.map(leadKeyOf);
    const allSelected = visibleKeys.length > 0 && visibleKeys.every(k => selectedLeadKeys.has(k));
    setSelectedLeadKeys(prev => {
      const next = new Set(prev);
      if (allSelected) visibleKeys.forEach(k => next.delete(k));
      else visibleKeys.forEach(k => next.add(k));
      return next;
    });
  };

  // ===== Selección de PROSPECTOS externos (mismo sistema, key 'pr_<id>') =====
  const prospectKeyOf = (p: Prospect): string => p.lead_key || `pr_${p.id}`;
  const toggleProspectSelected = (key: string) => {
    setSelectedProspectKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleSelectAllProspects = () => {
    const visibleKeys = prospects.map(prospectKeyOf);
    const allSelected = visibleKeys.length > 0 && visibleKeys.every(k => selectedProspectKeys.has(k));
    setSelectedProspectKeys(prev => {
      const next = new Set(prev);
      if (allSelected) visibleKeys.forEach(k => next.delete(k));
      else visibleKeys.forEach(k => next.add(k));
      return next;
    });
  };

  // Valores prellenados de una plantilla: cada campo manual toma su defaultKey de
  // los valores vigentes (tc/comision/cbm/kg) o queda vacío.
  const varValuesForTemplate = (tpl: BulkTemplate | undefined, defaults: Record<string, any>): string[] =>
    (tpl?.variables || []).map(v => (v.defaultKey && defaults[v.defaultKey] != null ? String(defaults[v.defaultKey]) : ''));

  const loadBulkTemplates = async (): Promise<{ tpls: BulkTemplate[]; defs: Record<string, any> }> => {
    const res = await axios.get(`${API_URL}/admin/crm/bulk-templates`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const tpls: BulkTemplate[] = res.data?.templates || [];
    const defs = res.data?.values || {};
    setBulkTemplates(tpls);
    setBulkDefaults(defs);
    return { tpls, defs };
  };

  // Abrir diálogo de envío masivo: carga plantillas + valores vigentes.
  const openBulkDialog = async () => {
    setBulkResults(null);
    setBulkOpen(true);
    try {
      const { tpls, defs } = await loadBulkTemplates();
      const first = tpls[0];
      setBulkTemplateId(first ? first.id : '');
      setBulkVarValues(varValuesForTemplate(first, defs));
    } catch { /* si falla, quedan vacíos */ }
  };

  const selectBulkTemplate = (id: number) => {
    setBulkTemplateId(id);
    setBulkResults(null);
    const tpl = bulkTemplates.find(t => t.id === id);
    setBulkVarValues(varValuesForTemplate(tpl, bulkDefaults));
  };

  const sendBulkWhatsapp = async () => {
    // Pestaña "Asesores": se envía a los asesores seleccionados (por su teléfono).
    const leadKeys = Array.from(mainTab === 'prospects' ? selectedProspectKeys : selectedLeadKeys);
    const advisorIds = Array.from(selectedAdvisorIds);
    if (!bulkTemplateId) return;
    if (advisorsMode ? advisorIds.length === 0 : leadKeys.length === 0) return;
    setBulkSending(true);
    setBulkResults(null);
    try {
      const res = await axios.post(`${API_URL}/admin/crm/bulk-whatsapp`, {
        templateId: bulkTemplateId,
        ...(advisorsMode ? { advisorIds } : { leadKeys }),
        varValues: bulkVarValues,
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = res.data || {};
      setBulkResults({ sent: d.sent || 0, skipped: d.skipped || 0, failed: d.failed || 0, total: d.total || 0, firstError: d.firstError || null });
      setSnackbar({ open: true, message: `WhatsApp: ${d.sent || 0} enviados, ${d.skipped || 0} omitidos, ${d.failed || 0} fallidos`, severity: (d.failed > 0 ? 'error' : 'success') });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al enviar', severity: 'error' });
    } finally {
      setBulkSending(false);
    }
  };

  // ============ ADMINISTRAR PLANTILLAS ============
  const saveTemplate = async (tpl: BulkTemplate) => {
    if (!tpl.label.trim() || !tpl.template_name.trim()) {
      setSnackbar({ open: true, message: 'Falta la etiqueta o el nombre de la plantilla', severity: 'error' });
      return;
    }
    setSavingTpl(true);
    try {
      const payload = { label: tpl.label.trim(), template_name: tpl.template_name.trim(), language_code: tpl.language_code || 'es_MX', variables: tpl.variables || [], preview: tpl.preview, header_image_url: tpl.header_image_url || null, header_image_key: tpl.header_image_key || null, use_mm_lite: !!tpl.use_mm_lite, uses_name: tpl.uses_name !== false, link_dest: tpl.link_dest || null };
      if (tpl.id) await axios.put(`${API_URL}/admin/crm/bulk-templates/${tpl.id}`, payload, { headers: { Authorization: `Bearer ${getToken()}` } });
      else await axios.post(`${API_URL}/admin/crm/bulk-templates`, payload, { headers: { Authorization: `Bearer ${getToken()}` } });
      setTplEditing(null);
      await loadBulkTemplates();
      setSnackbar({ open: true, message: 'Plantilla guardada', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al guardar', severity: 'error' });
    } finally { setSavingTpl(false); }
  };

  // Sube la imagen del encabezado a S3 y guarda la key en el editor de la plantilla.
  const uploadTemplateImage = async (file: File) => {
    if (!tplEditing) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      setSnackbar({ open: true, message: 'La imagen debe ser JPG o PNG', severity: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'La imagen no debe pesar más de 5 MB', severity: 'error' });
      return;
    }
    setUploadingTplImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/admin/crm/bulk-templates/upload-image`, fd, {
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'multipart/form-data' },
      });
      // Al subir una imagen, se usa la key de S3 (se limpia la URL manual para evitar ambigüedad).
      setTplEditing(prev => prev ? { ...prev, header_image_key: res.data.key, header_image_display: res.data.url, header_image_url: '' } : prev);
      setSnackbar({ open: true, message: 'Imagen subida', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al subir la imagen', severity: 'error' });
    } finally { setUploadingTplImage(false); }
  };

  const deleteTemplate = (tpl: BulkTemplate) => {
    askConfirm({
      title: `Eliminar plantilla "${tpl.label}"`,
      message: 'Se quita de las opciones de envío masivo. No borra la plantilla en Meta.',
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: async () => {
        try {
          await axios.delete(`${API_URL}/admin/crm/bulk-templates/${tpl.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
          await loadBulkTemplates();
          setSnackbar({ open: true, message: 'Plantilla eliminada', severity: 'success' });
        } catch (e: any) {
          setSnackbar({ open: true, message: e.response?.data?.error || 'Error al eliminar', severity: 'error' });
        }
      },
    });
  };

  // ============ PROSPECTS STATE ============
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectsLoading, setProspectsLoading] = useState(true);
  const [prospectStats, setProspectStats] = useState<ProspectStats | null>(null);
  const [uploadingProspects, setUploadingProspects] = useState(false);
  const [markingKitId, setMarkingKitId] = useState<string | null>(null);
  // Secuencias automáticas
  const [sequences, setSequences] = useState<WaSequence[]>([]);
  const [seqDialogOpen, setSeqDialogOpen] = useState(false);
  const [seqEditing, setSeqEditing] = useState<WaSequence | null>(null);
  const [seqSaving, setSeqSaving] = useState(false);

  // Contador regresivo al próximo envío de la secuencia + a cuántos usuarios.
  const [seqNextSend, setSeqNextSend] = useState<{ nextSendAt: string; dueCount: number } | null>(null);
  const [seqCountdown, setSeqCountdown] = useState('');
  useEffect(() => {
    const fetchNext = async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/crm/sequence/next-send`, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (res.data?.success) setSeqNextSend({ nextSendAt: res.data.nextSendAt, dueCount: res.data.dueCount || 0 });
      } catch { /* ignore */ }
    };
    fetchNext();
    const refetch = setInterval(fetchNext, 60_000); // refresca conteo/ventana cada min
    return () => clearInterval(refetch);
  }, []);
  useEffect(() => {
    if (!seqNextSend?.nextSendAt) { setSeqCountdown(''); return; }
    const tick = () => {
      const diff = new Date(seqNextSend.nextSendAt).getTime() - Date.now();
      if (diff <= 0) { setSeqCountdown('enviando…'); return; }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setSeqCountdown(d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [seqNextSend?.nextSendAt]);

  // Filtros prospectos
  const [prospectStatusFilter, setProspectStatusFilter] = useState('all');
  const [prospectSeqFilter, setProspectSeqFilter] = useState('all');
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

  // Altas de usuarios (semana/mes).
  const fetchRegStats = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/crm/registration-stats`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.data.success) {
        setRegStats({ week: res.data.week || 0, month: res.data.month || 0, year: res.data.year || 0, today: res.data.today || 0 });
      }
    } catch {
      console.error('Error fetching registration stats');
    }
  };

  // Cargar CRM Leads
  const fetchLeads = useCallback(async () => {
    // La pestaña "Asesores" muestra la lista de asesores, no leads.
    if (leadTabValue === 'advisors') return;
    setLeadsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/crm/leads?status=${leadTabValue}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.data.success) {
        setLeads(res.data.leads || []);
        setLeadStats(res.data.stats || { prospected: 0, waiting: 0, pending: 0, assigned: 0, contacted: 0, converted: 0 });
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
      if (prospectSeqFilter !== 'all') params.append('seq', prospectSeqFilter);
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
  }, [prospectStatusFilter, prospectAdvisorFilter, prospectChannelFilter, prospectSeqFilter, prospectSearch, prospectPage, prospectRowsPerPage]);

  // ===== Secuencias automáticas =====
  const fetchSequences = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/crm/sequences`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setSequences(res.data?.sequences || []);
    } catch { /* silencioso */ }
  }, []);

  const openSequenceConfig = async () => {
    await fetchSequences();
    await loadBulkTemplates().catch(() => {});
    setSeqDialogOpen(true);
  };
  // Cuando ya cargaron las secuencias y se abrió el diálogo, preparar la 1ª para editar.
  useEffect(() => {
    if (seqDialogOpen && !seqEditing && sequences.length > 0) setSeqEditing({ ...sequences[0], steps: sequences[0].steps.map(s => ({ ...s })) });
  }, [seqDialogOpen, sequences, seqEditing]);

  const saveSequence = async () => {
    if (!seqEditing) return;
    setSeqSaving(true);
    try {
      await axios.put(`${API_URL}/admin/crm/sequences/${seqEditing.id}`, { name: seqEditing.name, active: seqEditing.active, steps: seqEditing.steps }, { headers: { Authorization: `Bearer ${getToken()}` } });
      await fetchSequences();
      setSnackbar({ open: true, message: 'Secuencia guardada', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al guardar la secuencia', severity: 'error' });
    } finally { setSeqSaving(false); }
  };

  const enrollSelectedInSequence = async () => {
    if (!seqEditing) return;
    const leadKeys = Array.from(selectedProspectKeys);
    if (leadKeys.length === 0) { setSnackbar({ open: true, message: 'Marca prospectos primero', severity: 'error' }); return; }
    setSeqSaving(true);
    try {
      const res = await axios.post(`${API_URL}/admin/crm/sequences/${seqEditing.id}/enroll`, { leadKeys }, { headers: { Authorization: `Bearer ${getToken()}` } });
      const { enrolled = 0, skipped = 0 } = res.data || {};
      setSnackbar({ open: true, message: `🔄 ${enrolled} inscritos en la secuencia${skipped ? ` · ${skipped} sin teléfono` : ''}`, severity: 'success' });
      setSeqDialogOpen(false); setSeqEditing(null);
      fetchProspects();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al inscribir', severity: 'error' });
    } finally { setSeqSaving(false); }
  };

  // Marcar un prospecto para el Kit de Bienvenida (aparece en la lista del Kit).
  const markProspectKit = async (prospect: Prospect) => {
    setMarkingKitId(`pr_${prospect.id}`);
    try {
      await axios.post(`${API_URL}/admin/welcome-kit`, {
        lead_key: `pr_${prospect.id}`,
        full_name: prospect.full_name,
        phone: prospect.whatsapp,
        email: prospect.email,
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setSnackbar({ open: true, message: `🎁 ${prospect.full_name} agregado a la lista del Kit`, severity: 'success' });
      fetchProspects();
    } catch (e: any) {
      const msg = e.response?.status === 409 ? 'Ya está en la lista del Kit' : (e.response?.data?.error || 'Error al marcar kit');
      setSnackbar({ open: true, message: msg, severity: e.response?.status === 409 ? 'success' : 'error' });
    } finally { setMarkingKitId(null); }
  };

  // Marcar un lead del CRM para el Kit de Bienvenida.
  const markLeadKit = async (lead: Lead) => {
    const lk = leadKeyOf(lead);
    setMarkingKitId(lk);
    try {
      await axios.post(`${API_URL}/admin/welcome-kit`, {
        lead_key: lk,
        user_id: lead.user_id || undefined,
        full_name: lead.full_name,
        phone: lead.phone,
        email: lead.email,
        box_id: lead.box_id,
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setSnackbar({ open: true, message: `🎁 ${lead.full_name} agregado a la lista del Kit`, severity: 'success' });
      fetchLeads();
    } catch (e: any) {
      const msg = e.response?.status === 409 ? 'Ya está en la lista del Kit' : (e.response?.data?.error || 'Error al marcar kit');
      setSnackbar({ open: true, message: msg, severity: e.response?.status === 409 ? 'success' : 'error' });
    } finally { setMarkingKitId(null); }
  };

  // Descargar la plantilla de Excel para carga masiva de prospectos
  const downloadProspectTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nombre completo', 'Telefono', 'Email', 'Canal'],
      ['Juan Pérez', '5512345678', 'juan@correo.com', 'Facebook'],
      ['María López', '5598765432', 'maria@correo.com', 'Web'],
      ['', '', '', ''],
    ]);
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 26 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prospectos');
    // Hoja de ayuda con los canales válidos
    const help = XLSX.utils.aoa_to_sheet([
      ['CANALES VÁLIDOS (columna "Canal")'],
      ['Facebook'], ['Instagram'], ['WhatsApp'], ['Web'], ['Referido'], ['UPS'], ['DHL'], ['FedEx'], ['Otro'],
      [''],
      ['Notas:'],
      ['• Solo "Nombre completo" es obligatorio.'],
      ['• La fecha de seguimiento se pone automática (día de la carga).'],
      ['• Todos se cargan sin asesor y sin notas.'],
    ]);
    help['!cols'] = [{ wch: 50 }];
    XLSX.utils.book_append_sheet(wb, help, 'Instrucciones');
    XLSX.writeFile(wb, 'plantilla_prospectos.xlsx');
  };

  // Subir Excel y crear prospectos masivamente
  const handleUploadProspectsExcel = async (file: File) => {
    setUploadingProspects(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0] as string];
      if (!sheet) { setSnackbar({ open: true, message: 'El archivo no tiene hojas', severity: 'error' }); return; }
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: false });
      const norm = (s: any) => String(s || '').trim().toLowerCase();
      const rows = json.map((obj) => {
        const get = (...keys: string[]) => {
          for (const k of Object.keys(obj)) { if (keys.includes(norm(k))) return obj[k]; }
          return '';
        };
        return {
          full_name: String(get('nombre completo', 'nombre', 'nombre_completo', 'name')).trim(),
          whatsapp: String(get('telefono', 'teléfono', 'whatsapp', 'celular', 'phone', 'tel')).trim(),
          email: String(get('email', 'correo', 'e-mail', 'correo electronico', 'correo electrónico')).trim(),
          acquisition_channel: String(get('canal', 'canal de adquisicion', 'canal de adquisición', 'channel')).trim(),
        };
      }).filter((r) => r.full_name);

      if (rows.length === 0) {
        setSnackbar({ open: true, message: 'No se encontraron filas con "Nombre completo". Usa la plantilla.', severity: 'error' });
        return;
      }
      const res = await axios.post(`${API_URL}/admin/crm/prospects/bulk`, { rows }, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const { inserted = 0, skippedDuplicate = 0, skippedNoName = 0 } = res.data || {};
      const parts: string[] = [];
      if (skippedDuplicate) parts.push(`${skippedDuplicate} duplicados (tel/correo ya existe)`);
      if (skippedNoName) parts.push(`${skippedNoName} sin nombre`);
      const detail = parts.length ? ` · omitidos: ${parts.join(', ')}` : '';
      setSnackbar({ open: true, message: `✅ ${inserted} prospectos importados${detail}`, severity: inserted > 0 ? 'success' : 'error' });
      setProspectPage(0);
      fetchProspects();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al importar el Excel', severity: 'error' });
    } finally {
      setUploadingProspects(false);
    }
  };

  // Effects
  useEffect(() => {
    fetchAdvisors();
    fetchRegStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mainTab === 'leads') {
      fetchLeads();
      fetchGroups();
      fetchBlacklist();
    } else {
      fetchProspects();
    }
  }, [mainTab, fetchLeads, fetchProspects, fetchGroups, fetchBlacklist]);

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
  const totalLeads = leadStats.prospected + leadStats.waiting + leadStats.pending + leadStats.assigned + leadStats.contacted + leadStats.converted;
  const totalProspects = prospectStats
    ? Number(prospectStats.new_count) + Number(prospectStats.contacting_count) + Number(prospectStats.interested_count) + Number(prospectStats.converted_count) + Number(prospectStats.lost_count)
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
            <>
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={downloadProspectTemplate}
              >
                Descargar plantilla
              </Button>
              <Button
                component="label"
                variant="outlined"
                startIcon={<UploadFileIcon />}
                disabled={uploadingProspects}
              >
                {uploadingProspects ? 'Importando…' : 'Subir Excel'}
                <input
                  type="file"
                  hidden
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadProspectsExcel(f); (e.target as HTMLInputElement).value = ''; }}
                />
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenProspectForm()}
                sx={{ background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)' }}
              >
                {t('leads.newProspect')}
              </Button>
            </>
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

      {/* 📈 Widgets principales: altas de usuarios (semana / mes / año) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2, mb: 3 }}>
        <Paper sx={{ p: 3, borderRadius: 3, color: '#fff', background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ fontSize: 40, lineHeight: 1 }}>🗓️</Box>
          <Box>
            <Typography variant="h3" fontWeight={800} lineHeight={1}>{regStats.week}</Typography>
            <Typography variant="subtitle1" fontWeight={600}>Altas esta semana</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>Nuevos usuarios · reinicia cada lunes</Typography>
          </Box>
        </Paper>
        <Paper sx={{ p: 3, borderRadius: 3, color: '#fff', background: 'linear-gradient(135deg, #0097A7 0%, #00BFA5 100%)', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ fontSize: 40, lineHeight: 1 }}>📅</Box>
          <Box>
            <Typography variant="h3" fontWeight={800} lineHeight={1}>{regStats.month}</Typography>
            <Typography variant="subtitle1" fontWeight={600}>Altas este mes</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>Nuevos usuarios · reinicia el día 1</Typography>
          </Box>
        </Paper>
        <Paper sx={{ p: 3, borderRadius: 3, color: '#fff', background: 'linear-gradient(135deg, #6A1B9A 0%, #8E24AA 100%)', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ fontSize: 40, lineHeight: 1 }}>🎯</Box>
          <Box>
            <Typography variant="h3" fontWeight={800} lineHeight={1}>{regStats.year}</Typography>
            <Typography variant="subtitle1" fontWeight={600}>Altas este año</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>Nuevos usuarios · reinicia el 1 de enero</Typography>
          </Box>
        </Paper>
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
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, mb: 3 }}>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#f3e5f5', borderLeft: '4px solid #9c27b0' }}>
              <Typography variant="h4" fontWeight={700} color="#7b1fa2">{leadStats.prospected}</Typography>
              <Typography variant="body2" color="text.secondary">Prospectados 🌱</Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#fffde7', borderLeft: '4px solid #fbc02d' }}>
              <Typography variant="h4" fontWeight={700} color="#f57f17">{leadStats.waiting}</Typography>
              <Typography variant="body2" color="text.secondary">En espera ⏳</Typography>
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
              <Tab value="prospected" label={`Prospectados (${leadStats.prospected})`} />
              <Tab value="waiting" label={`En espera (${leadStats.waiting})`} />
              <Tab value="assigned" label={`${t('leads.assigned')} (${leadStats.assigned})`} />
              <Tab value="contacted" label={`${t('leads.contacted')} (${leadStats.contacted})`} />
              <Tab value="converted" label={`${t('leads.converted')} (${leadStats.converted})`} />
              <Tab value="advisors" label={`Asesores (${advisors.length})`} />
              <Tab value="all" label={t('leads.all')} />
            </Tabs>
          </Paper>

          {/* Barra de GRUPOS: filtrar, crear y eliminar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" fontWeight={700} sx={{ mr: 0.5 }}>👥 Grupos:</Typography>
            <Chip
              label={`Todos (${leads.length})`}
              size="small"
              color={activeGroupFilter === null && !blacklistView ? 'primary' : 'default'}
              variant={activeGroupFilter === null && !blacklistView ? 'filled' : 'outlined'}
              onClick={() => { setBlacklistView(false); setActiveGroupFilter(null); }}
            />
            {groups.map(g => (
              <Chip
                key={g.id}
                label={`${g.name} (${g.member_count})`}
                size="small"
                onClick={() => { setBlacklistView(false); setActiveGroupFilter(activeGroupFilter === g.id ? null : g.id); }}
                onDelete={() => deleteGroup(g)}
                sx={{
                  bgcolor: !blacklistView && activeGroupFilter === g.id ? g.color : 'transparent',
                  color: !blacklistView && activeGroupFilter === g.id ? '#fff' : g.color,
                  border: `1px solid ${g.color}`,
                  '& .MuiChip-deleteIcon': { color: !blacklistView && activeGroupFilter === g.id ? '#fff' : g.color },
                }}
              />
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={() => setNewGroupOpen(true)} sx={{ ml: 0.5 }}>
              Nuevo grupo
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Chip
              label="📵 Sin teléfono"
              size="small"
              onClick={() => setNoPhoneFilter(v => !v)}
              color={noPhoneFilter ? 'warning' : 'default'}
              variant={noPhoneFilter ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700 }}
            />
            <Chip
              label={`🚫 Blacklist (${blacklist.length})`}
              size="small"
              onClick={() => { setBlacklistView(v => !v); setActiveGroupFilter(null); }}
              color={blacklistView ? 'error' : 'default'}
              variant={blacklistView ? 'filled' : 'outlined'}
              sx={{ borderColor: '#d32f2f', color: blacklistView ? '#fff' : '#d32f2f', fontWeight: 700 }}
            />
          </Box>

          {/* Barra de acciones: envío masivo por WhatsApp + asignar a grupo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<WhatsAppIcon />}
              disabled={leadTabValue === 'advisors' ? selectedAdvisorIds.size === 0 : selectedLeadKeys.size === 0}
              onClick={openBulkDialog}
              sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' } }}
            >
              Enviar WhatsApp ({leadTabValue === 'advisors' ? selectedAdvisorIds.size : selectedLeadKeys.size})
            </Button>
            {selectedLeadKeys.size > 0 && groups.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <InputLabel id="assign-grp-label">Asignar a grupo</InputLabel>
                <Select
                  labelId="assign-grp-label"
                  label="Asignar a grupo"
                  value=""
                  onChange={(e) => assignSelectedToGroup(Number(e.target.value))}
                >
                  {groups.map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {selectedLeadKeys.size > 0 && !blacklistView && (
              <Button size="small" variant="outlined" color="error" startIcon={<BlockIcon />} onClick={blacklistSelected}>
                Blacklist
              </Button>
            )}
            {selectedLeadKeys.size > 0 && (
              <Button size="small" color="inherit" onClick={() => setSelectedLeadKeys(new Set())}>
                Limpiar selección
              </Button>
            )}
            <Typography variant="caption" color="text.secondary">
              {blacklistView
                ? 'Estos leads están en blacklist: no reciben masivos ni aparecen en el funnel.'
                : 'Marca leads con los checkboxes para WhatsApp, grupo o blacklist.'}
            </Typography>
          </Box>

          {/* Buscador */}
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar por número de cliente, nombre o asesor asignado…"
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: leadSearch ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setLeadSearch('')}>✕</IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          {leadSearch.trim() && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {displayedLeads.length} resultado(s) para “{leadSearch.trim()}”
            </Typography>
          )}

          {/* Tabla de Asesores */}
          {leadTabValue === 'advisors' ? (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={filteredAdvisors.length > 0 && filteredAdvisors.every(a => selectedAdvisorIds.has(a.id))}
                        indeterminate={filteredAdvisors.some(a => selectedAdvisorIds.has(a.id)) && !filteredAdvisors.every(a => selectedAdvisorIds.has(a.id))}
                        onChange={(e) => {
                          setSelectedAdvisorIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) filteredAdvisors.forEach(a => next.add(a.id));
                            else filteredAdvisors.forEach(a => next.delete(a.id));
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>Asesor</TableCell>
                    <TableCell>Correo</TableCell>
                    <TableCell>Código de referido</TableCell>
                    <TableCell>Teléfono</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAdvisors
                    .map((a) => (
                      <TableRow key={a.id} hover selected={selectedAdvisorIds.has(a.id)}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={selectedAdvisorIds.has(a.id)}
                            onChange={() => setSelectedAdvisorIds(prev => {
                              const next = new Set(prev);
                              if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                              return next;
                            })}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar sx={{ bgcolor: '#F05A28', width: 32, height: 32, fontSize: 14 }}>
                              {(a.full_name || '?').charAt(0)}
                            </Avatar>
                            <Typography variant="body2" fontWeight={600}>{a.full_name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Typography variant="caption">{a.email || '—'}</Typography></TableCell>
                        <TableCell>{a.referral_code ? <Chip label={a.referral_code} size="small" color="primary" variant="outlined" /> : '—'}</TableCell>
                        <TableCell><Typography variant="caption">{a.phone || '—'}</Typography></TableCell>
                      </TableRow>
                    ))}
                  {filteredAdvisors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No hay asesores.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          ) : leadsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={displayedLeads.length > 0 && displayedLeads.every(l => selectedLeadKeys.has(leadKeyOf(l)))}
                        indeterminate={displayedLeads.some(l => selectedLeadKeys.has(leadKeyOf(l))) && !displayedLeads.every(l => selectedLeadKeys.has(leadKeyOf(l)))}
                        onChange={toggleSelectAllVisible}
                      />
                    </TableCell>
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
                  {displayedLeads.map((lead) => (
                    <TableRow key={lead.lead_key || String(lead.request_id)} hover selected={selectedLeadKeys.has(leadKeyOf(lead))}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selectedLeadKeys.has(leadKeyOf(lead))}
                          onChange={() => toggleLeadSelected(leadKeyOf(lead))}
                        />
                      </TableCell>
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
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {lead.source === 'chartback' && (
                            <Chip
                              label="🔁 Reactivación"
                              size="small"
                              color="warning"
                              variant="outlined"
                              sx={{ height: 18, fontSize: 10 }}
                            />
                          )}
                          {(lead.groups || []).map(g => (
                            <Chip
                              key={g.id}
                              label={g.name}
                              size="small"
                              onDelete={() => removeLeadFromGroup(g.id, leadKeyOf(lead))}
                              sx={{ height: 18, fontSize: 10, bgcolor: g.color, color: '#fff', '& .MuiChip-deleteIcon': { color: '#fff', fontSize: 13 } }}
                            />
                          ))}
                        </Box>
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
                        {blacklistView ? (
                          <Chip icon={<BlockIcon />} label="Blacklist" color="error" size="small" />
                        ) : (
                        <Chip
                          label={getLeadStatusLabel(lead.status)}
                          color={getLeadStatusColor(lead.status) as 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'}
                          size="small"
                        />
                        )}
                        {!blacklistView && lead.source === 'chartback' && (() => {
                          const st = String(lead.chartback_status || '').toLowerCase().trim();
                          const meaningful = ['recovered', 'no_answer', 'callback', 'retention', 'not_interested'].includes(st);
                          // Si tiene actividad de reactivación real, muestra ese sub-estatus;
                          // si no, muestra si está reclamado (tiene usuario) o no.
                          const label = meaningful
                            ? getChartbackSubLabel(lead.chartback_status)
                            : (lead.reclamado ? 'Reclamado ✅' : 'Sin reclamar');
                          return (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                              {label}
                            </Typography>
                          );
                        })()}
                        {lead.source === 'chartback' && lead.advisor_response && (
                          <Tooltip
                            arrow
                            title={
                              <Box sx={{ maxWidth: 320 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                  Respuesta del asesor
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mb: (lead.activity && lead.activity.length > 0) ? 1 : 0 }}>
                                  {lead.advisor_response}
                                </Typography>
                                {Array.isArray(lead.activity) && lead.activity.length > 0 && (
                                  <>
                                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                      Historial
                                    </Typography>
                                    {lead.activity.slice(-6).map((a, i) => (
                                      <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                                        • {getChartbackSubLabel(a.type)}{a.note ? `: ${a.note}` : ''}{a.advisor ? ` — ${a.advisor}` : ''}
                                      </Typography>
                                    ))}
                                  </>
                                )}
                              </Box>
                            }
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                overflow: 'hidden', mt: 0.5, fontStyle: 'italic', color: 'text.primary',
                                maxWidth: 260, cursor: 'help',
                              }}
                            >
                              💬 {lead.advisor_response}
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        {lead.assigned_advisor_name || (
                          <Typography variant="body2" color="text.secondary" fontStyle="italic">
                            {t('leads.unassigned')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {blacklistView ? (
                          <Button size="small" variant="outlined" color="inherit" onClick={() => unBlacklist(leadKeyOf(lead))}>
                            Quitar
                          </Button>
                        ) : (
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            {!String(lead.phone || '').trim() && (
                              <Tooltip title="Agregar teléfono">
                                <IconButton size="small" color="warning" onClick={() => openPhoneDialog(lead)}>
                                  <PhoneIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Asignar / cambiar asesor">
                              <IconButton size="small" color="primary" onClick={(e) => { setAdvisorMenuAnchor(e.currentTarget); setAdvisorMenuLead(lead); }}>
                                <PersonAddIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={lead.has_kit ? 'Ya está en la lista del Kit' : 'Marcar para Kit de Bienvenida'}>
                              <span>
                                <IconButton size="small" sx={{ color: lead.has_kit ? '#F59E0B' : undefined }} disabled={lead.has_kit || markingKitId === leadKeyOf(lead)} onClick={() => markLeadKit(lead)}>
                                  <CardGiftcardIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {displayedLeads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
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
                  <MenuItem value="legacy">Reactivación (sin reclamar)</MenuItem>
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
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Secuencia</InputLabel>
                <Select
                  value={prospectSeqFilter}
                  label="Secuencia"
                  onChange={(e: SelectChangeEvent) => { setProspectSeqFilter(e.target.value); setProspectPage(0); }}
                >
                  <MenuItem value="all">{t('common.all')}</MenuItem>
                  <MenuItem value="enrolled">Inscritos</MenuItem>
                  <MenuItem value="not_enrolled">No inscritos</MenuItem>
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

          {/* Envío masivo de WhatsApp a prospectos seleccionados */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<WhatsAppIcon />}
              disabled={selectedProspectKeys.size === 0}
              onClick={openBulkDialog}
              sx={{ background: 'linear-gradient(90deg, #128C7E 0%, #25D366 100%)' }}
            >
              Enviar WhatsApp ({selectedProspectKeys.size})
            </Button>
            <Button
              variant="outlined"
              startIcon={<AutorenewIcon />}
              onClick={openSequenceConfig}
              sx={{ borderColor: '#7b1fa2', color: '#7b1fa2' }}
            >
              Secuencia automática{selectedProspectKeys.size > 0 ? ` (${selectedProspectKeys.size})` : ''}
            </Button>
            {seqNextSend && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderRadius: 2, bgcolor: 'rgba(123,31,162,0.08)', border: '1px solid rgba(123,31,162,0.25)' }}>
                <AccessTimeIcon sx={{ fontSize: 18, color: '#7b1fa2' }} />
                <Box sx={{ lineHeight: 1.1 }}>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>Próximo envío en</Typography>
                  <Typography variant="body2" fontWeight={800} sx={{ fontFamily: 'monospace', color: '#7b1fa2' }}>{seqCountdown || '—'}</Typography>
                </Box>
                <Chip size="small" label={`${seqNextSend.dueCount} usuario${seqNextSend.dueCount === 1 ? '' : 's'}`} sx={{ ml: 0.5, bgcolor: '#7b1fa2', color: '#fff', fontWeight: 700 }} />
              </Box>
            )}
            <Typography variant="body2" color="text.secondary">
              Marca prospectos para enviar WhatsApp o inscribirlos en la secuencia Día 1/3/7.
            </Typography>
          </Box>

          {/* Prospects Table */}
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.03)' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={prospects.length > 0 && prospects.every(p => selectedProspectKeys.has(prospectKeyOf(p)))}
                        indeterminate={prospects.some(p => selectedProspectKeys.has(prospectKeyOf(p))) && !prospects.every(p => selectedProspectKeys.has(prospectKeyOf(p)))}
                        onChange={toggleSelectAllProspects}
                      />
                    </TableCell>
                    <TableCell><strong>{t('leads.prospect')}</strong></TableCell>
                    <TableCell><strong>{t('leads.contact')}</strong></TableCell>
                    <TableCell><strong>{t('leads.channelLabel')}</strong></TableCell>
                    <TableCell><strong>{t('leads.advisorLabel')}</strong></TableCell>
                    <TableCell><strong>{t('leads.followUp')}</strong></TableCell>
                    <TableCell><strong>Secuencia</strong></TableCell>
                    <TableCell><strong>{t('leads.statusLabel')}</strong></TableCell>
                    <TableCell align="center"><strong>{t('common.actions')}</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {prospectsLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={40} />
                      </TableCell>
                    </TableRow>
                  ) : prospects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">{t('leads.noProspectsToShow')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    prospects.map((prospect) => {
                      const isLegacy = prospect.source === 'legacy';
                      return (
                      <TableRow
                        key={prospectKeyOf(prospect)}
                        sx={{
                          bgcolor: prospect.follow_up_today ? 'rgba(255, 193, 7, 0.1)' : 
                                   prospect.follow_up_overdue ? 'rgba(211, 47, 47, 0.05)' : 'transparent',
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' }
                        }}
                        selected={selectedProspectKeys.has(prospectKeyOf(prospect))}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={selectedProspectKeys.has(prospectKeyOf(prospect))}
                            onChange={() => toggleProspectSelected(prospectKeyOf(prospect))}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main' }}>
                              {prospect.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </Avatar>
                            <Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2" fontWeight={500}>{prospect.full_name}</Typography>
                                {prospect.follow_up_today && <EventIcon fontSize="small" color="warning" />}
                                {!!(prospect.link_clicks && prospect.link_clicks > 0) && (
                                  <Tooltip title={`Hizo clic en el botón de WhatsApp${prospect.last_click_at ? ` · ${formatDate(prospect.last_click_at)}` : ''}${prospect.link_clicks > 1 ? ` · ${prospect.link_clicks} clics` : ''}`}>
                                    <Chip size="small" color="success" variant="outlined" label={`🔗 Clic${prospect.link_clicks > 1 ? ` ×${prospect.link_clicks}` : ''}`} sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }} />
                                  </Tooltip>
                                )}
                                {prospect.seq_status === 'active' && (
                                  <Tooltip title={`En secuencia · paso ${(prospect.seq_step ?? 0) + 1}${prospect.seq_next_send_at ? ` · próximo ${formatDate(prospect.seq_next_send_at)}` : ''}`}>
                                    <Chip size="small" variant="outlined" label={`🔄 Paso ${(prospect.seq_step ?? 0) + 1}`} sx={{ height: 20, borderColor: '#7b1fa2', color: '#7b1fa2', '& .MuiChip-label': { px: 0.75, fontSize: 11 } }} />
                                  </Tooltip>
                                )}
                                {prospect.has_kit && (
                                  <Tooltip title="En la lista del Kit de Bienvenida">
                                    <Chip size="small" variant="outlined" label="🎁 Kit" sx={{ height: 20, borderColor: '#F59E0B', color: '#B45309', '& .MuiChip-label': { px: 0.75, fontSize: 11 } }} />
                                  </Tooltip>
                                )}
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
                          {(() => {
                            const DAYS = ['Día 1', 'Día 3', 'Día 7'];
                            const st = prospect.seq_status;
                            const step = prospect.seq_step ?? 0;
                            const reason = prospect.seq_reason;
                            if (!st) return <Typography variant="caption" color="text.secondary">—</Typography>;
                            if (st === 'responded' && reason === 'clicked') {
                              const day = DAYS[Math.max(0, step - 1)] || `paso ${step}`;
                              return <Chip size="small" color="success" label={`🔗 Clic · ${day}`} sx={{ height: 22 }} />;
                            }
                            if (st === 'responded') return <Chip size="small" color="info" label="💬 Respondió" sx={{ height: 22 }} />;
                            if (st === 'completed') return <Chip size="small" color="secondary" variant="outlined" label="✅ Terminada" sx={{ height: 22 }} />;
                            if (st === 'stopped') return <Chip size="small" variant="outlined" label="⏸️ Detenida" sx={{ height: 22 }} />;
                            if (st === 'active') {
                              const sentLabel = step >= 1 ? DAYS[step - 1] : null;
                              const nextLabel = DAYS[step] || null;
                              const label = sentLabel ? `📨 ${sentLabel} enviado` : '⏳ Programada';
                              const tip = nextLabel ? `Próximo: ${nextLabel}${prospect.seq_next_send_at ? ` · ${formatDate(prospect.seq_next_send_at)}` : ''}` : 'Secuencia en curso';
                              return (
                                <Tooltip title={tip}>
                                  <Chip size="small" color="warning" variant="outlined" label={label} sx={{ height: 22 }} />
                                </Tooltip>
                              );
                            }
                            return <Typography variant="caption" color="text.secondary">—</Typography>;
                          })()}
                        </TableCell>
                        <TableCell>
                          {isLegacy ? (
                            <Chip label="Reactivación (sin reclamar)" size="small" color="warning" variant="outlined" />
                          ) : (
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
                          )}
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
                            {isLegacy ? (
                              prospect.box_id ? <Chip label={prospect.box_id} size="small" variant="outlined" /> : null
                            ) : (
                              <>
                                {prospect.status !== 'converted' && prospect.status !== 'lost' && (
                                  <Tooltip title="Convertir a Cliente">
                                    <IconButton size="small" color="success" onClick={() => handleOpenConvert(prospect)}>
                                      <PersonAddIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title={prospect.has_kit ? 'Ya está en la lista del Kit' : 'Marcar para Kit de Bienvenida'}>
                                  <span>
                                    <IconButton size="small" sx={{ color: prospect.has_kit ? '#F59E0B' : undefined }} disabled={prospect.has_kit || markingKitId === `pr_${prospect.id}`} onClick={() => markProspectKit(prospect)}>
                                      <CardGiftcardIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
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
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                      );
                    })
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
              rowsPerPageOptions={[10, 25, 50, 100, 250, 500]}
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

      {/* Bulk WhatsApp Dialog */}
      {/* Diálogo de confirmación reutilizable */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog(s => ({ ...s, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: confirmDialog.danger ? 'error.main' : 'inherit' }}>
          {confirmDialog.danger && <BlockIcon color="error" />}
          {confirmDialog.title}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">{confirmDialog.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(s => ({ ...s, open: false }))}>Cancelar</Button>
          <Button
            variant="contained"
            color={confirmDialog.danger ? 'error' : 'primary'}
            onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(s => ({ ...s, open: false })); }}
          >
            {confirmDialog.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Agregar teléfono Dialog */}
      <Dialog open={!!phoneDialogLead} onClose={() => !savingPhone && setPhoneDialogLead(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PhoneIcon fontSize="small" /> Teléfono de {phoneDialogLead?.full_name || 'cliente'}
        </DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            fullWidth
            label="Teléfono (WhatsApp)"
            placeholder="Ej. 528112345678 o 8112345678"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            size="small"
            disabled={savingPhone}
            onKeyDown={(e) => { if (e.key === 'Enter') savePhone(); }}
            helperText="Si son 10 dígitos se le antepone 52 (México) al enviar."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhoneDialogLead(null)} disabled={savingPhone}>Cancelar</Button>
          <Button variant="contained" onClick={savePhone} disabled={savingPhone || !phoneInput.trim()}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Menú asignar asesor */}
      <Menu
        anchorEl={advisorMenuAnchor}
        open={!!advisorMenuAnchor}
        onClose={() => { setAdvisorMenuAnchor(null); setAdvisorMenuLead(null); }}
        PaperProps={{ style: { maxHeight: 360 } }}
      >
        <MenuItem disabled sx={{ fontWeight: 700, opacity: 1 }}>Asignar asesor a {advisorMenuLead?.full_name || ''}</MenuItem>
        <Divider />
        {advisors.length === 0 && <MenuItem disabled>No hay asesores</MenuItem>}
        {advisors.map(a => (
          <MenuItem key={a.id} onClick={() => assignAdvisorToLead(a.id)}>{a.full_name}</MenuItem>
        ))}
      </Menu>

      {/* Nuevo grupo Dialog */}
      <Dialog open={newGroupOpen} onClose={() => !savingGroup && setNewGroupOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>👥 Nuevo grupo</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            fullWidth
            label="Nombre del grupo"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            size="small"
            sx={{ mb: 2 }}
            disabled={savingGroup}
            onKeyDown={(e) => { if (e.key === 'Enter') createGroup(); }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">Color:</Typography>
            <input
              type="color"
              value={newGroupColor}
              onChange={(e) => setNewGroupColor(e.target.value)}
              style={{ width: 44, height: 30, border: 'none', background: 'none', cursor: 'pointer' }}
              disabled={savingGroup}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewGroupOpen(false)} disabled={savingGroup}>Cancelar</Button>
          <Button variant="contained" onClick={createGroup} disabled={savingGroup || !newGroupName.trim()}>Crear</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkOpen} onClose={() => !bulkSending && setBulkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WhatsAppIcon sx={{ color: '#25D366' }} /> Enviar WhatsApp masivo
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Se enviará a <strong>{(mainTab === 'prospects' ? selectedProspectKeys : selectedLeadKeys).size}</strong> {mainTab === 'prospects' ? 'prospecto(s)' : 'lead(s)'} seleccionado(s). Se omiten los que no tengan teléfono y los teléfonos duplicados.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FormControl fullWidth>
              <InputLabel id="bulk-tpl-label">Plantilla</InputLabel>
              <Select
                labelId="bulk-tpl-label"
                label="Plantilla"
                value={bulkTemplateId}
                onChange={(e) => selectBulkTemplate(Number(e.target.value))}
                disabled={bulkSending}
              >
                {bulkTemplates.map(t => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
              </Select>
            </FormControl>
            <Button size="small" startIcon={<EditIcon />} onClick={() => setTplManagerOpen(true)} disabled={bulkSending} sx={{ whiteSpace: 'nowrap' }}>
              Administrar
            </Button>
          </Box>

          {/* Campos manuales de la plantilla seleccionada */}
          {(() => {
            const tpl = bulkTemplates.find(t => t.id === bulkTemplateId);
            if (!tpl || (tpl.variables || []).length === 0) return null;
            return (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                {tpl.variables.map((v, i) => (
                  <TextField
                    key={i}
                    label={v.label}
                    value={bulkVarValues[i] ?? ''}
                    onChange={(e) => setBulkVarValues(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                    size="small"
                    sx={{ flex: '1 1 45%' }}
                    disabled={bulkSending}
                  />
                ))}
              </Box>
            );
          })()}

          {/* Vista previa del mensaje */}
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f0f7f0', borderColor: '#25D366' }}>
            <Typography variant="caption" color="text.secondary">Vista previa</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
              {(() => {
                const tpl = bulkTemplates.find(t => t.id === bulkTemplateId);
                let p = tpl?.preview || '';
                (bulkVarValues || []).forEach((val, i) => { p = p.split(`{${i + 1}}`).join(val || '—'); });
                return p || '(sin vista previa)';
              })()}
            </Typography>
          </Paper>

          {bulkResults && (
            <Alert severity={bulkResults.failed > 0 ? 'warning' : 'success'} sx={{ mt: 2 }}>
              Enviados: {bulkResults.sent} · Omitidos: {bulkResults.skipped} · Fallidos: {bulkResults.failed} (de {bulkResults.total})
              {bulkResults.failed > 0 && bulkResults.firstError && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                  Motivo: {bulkResults.firstError}
                </Typography>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkOpen(false)} disabled={bulkSending}>
            {bulkResults ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            variant="contained"
            startIcon={bulkSending ? <CircularProgress size={16} color="inherit" /> : (bulkResults ? <CheckCircleIcon /> : <WhatsAppIcon />)}
            onClick={sendBulkWhatsapp}
            disabled={bulkSending || bulkRecipientCount === 0 || !!bulkResults || !bulkTemplateId}
            sx={{ bgcolor: bulkResults ? '#9e9e9e' : '#25D366', '&:hover': { bgcolor: bulkResults ? '#9e9e9e' : '#1da851' } }}
          >
            {bulkSending ? 'Enviando…' : (bulkResults ? 'Enviado ✓' : `Enviar (${bulkRecipientCount})`)}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Secuencia automática Dialog */}
      <Dialog open={seqDialogOpen} onClose={() => { if (!seqSaving) { setSeqDialogOpen(false); setSeqEditing(null); } }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutorenewIcon sx={{ color: '#7b1fa2' }} /> Secuencia automática (Día 1 / 3 / 7)
        </DialogTitle>
        <DialogContent dividers>
          {seqEditing ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Configura qué plantilla se envía en cada paso. Los envíos salen a las <strong>12:06 PM (Lun-Vie)</strong>: si inscribes antes de esa hora, el Día 1 sale ese mismo día; si inscribes después (o en fin de semana), sale el siguiente día hábil. Si el prospecto <strong>responde</strong> o <strong>hace clic</strong> en un botón, sale automáticamente de la secuencia.
              </Typography>
              <TextField label="Nombre de la secuencia" value={seqEditing.name} onChange={e => setSeqEditing({ ...seqEditing, name: e.target.value })} size="small" fullWidth disabled={seqSaving} />
              {seqEditing.steps.map((step, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', bgcolor: 'rgba(123,31,162,0.06)', p: 1, borderRadius: 1 }}>
                  <Chip size="small" label={`Día ${step.day_offset + 1}`} sx={{ bgcolor: '#7b1fa2', color: '#fff', fontWeight: 700 }} />
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>Plantilla del paso {i + 1}</InputLabel>
                    <Select
                      label={`Plantilla del paso ${i + 1}`}
                      value={step.template_id ?? ''}
                      onChange={e => { const steps = [...seqEditing.steps]; steps[i] = { ...steps[i], template_id: e.target.value ? Number(e.target.value) : null }; setSeqEditing({ ...seqEditing, steps }); }}
                      disabled={seqSaving}
                    >
                      <MenuItem value="">— sin enviar —</MenuItem>
                      {bulkTemplates.map(t => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Día"
                    type="number"
                    value={step.day_offset + 1}
                    onChange={e => { const d = Math.max(1, Number(e.target.value) || 1); const steps = [...seqEditing.steps]; steps[i] = { ...steps[i], day_offset: d - 1 }; setSeqEditing({ ...seqEditing, steps }); }}
                    size="small" sx={{ width: 80 }} disabled={seqSaving}
                  />
                </Box>
              ))}
              {seqEditing.stats && (
                <Typography variant="caption" color="text.secondary">
                  Activos: {seqEditing.stats.active} · Completados: {seqEditing.stats.completed} · Respondieron: {seqEditing.stats.responded} · Detenidos: {seqEditing.stats.stopped}
                </Typography>
              )}
              <Alert severity="info" sx={{ py: 0 }}>
                Para usar botones que se puedan rastrear, configura en cada plantilla su "URL destino" y en Meta un botón de URL dinámica.
              </Alert>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={30} /></Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSeqDialogOpen(false); setSeqEditing(null); }} disabled={seqSaving}>Cerrar</Button>
          <Button onClick={saveSequence} disabled={seqSaving || !seqEditing}>Guardar configuración</Button>
          <Button
            variant="contained"
            startIcon={<AutorenewIcon />}
            onClick={enrollSelectedInSequence}
            disabled={seqSaving || !seqEditing || selectedProspectKeys.size === 0}
            sx={{ bgcolor: '#7b1fa2', '&:hover': { bgcolor: '#6a1b9a' } }}
          >
            Inscribir {selectedProspectKeys.size} seleccionado(s)
          </Button>
        </DialogActions>
      </Dialog>

      {/* Administrar plantillas Dialog */}
      <Dialog open={tplManagerOpen} onClose={() => { if (!savingTpl) { setTplManagerOpen(false); setTplEditing(null); } }} maxWidth="sm" fullWidth>
        <DialogTitle>🗂️ Administrar plantillas</DialogTitle>
        <DialogContent dividers>
          {!tplEditing ? (
            <>
              <List dense>
                {bulkTemplates.map(t => (
                  <ListItem
                    key={t.id}
                    secondaryAction={
                      <Box>
                        <IconButton size="small" onClick={() => setTplEditing({ ...t, variables: (t.variables || []).map(v => ({ ...v })) })}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => deleteTemplate(t)}><DeleteIcon fontSize="small" /></IconButton>
                      </Box>
                    }
                  >
                    <ListItemText primary={t.label} secondary={`Meta: ${t.template_name} · ${(t.variables || []).length} variable(s)`} />
                  </ListItem>
                ))}
                {bulkTemplates.length === 0 && <ListItem><ListItemText secondary="No hay plantillas." /></ListItem>}
              </List>
              <Button startIcon={<AddIcon />} onClick={() => setTplEditing({ id: 0, label: '', template_name: '', language_code: 'es_MX', variables: [], preview: '', header_image_url: '', use_mm_lite: false, uses_name: true, link_dest: '' })}>
                Nueva plantilla
              </Button>
            </>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField label="Etiqueta (nombre visible en el selector)" value={tplEditing.label} onChange={e => setTplEditing({ ...tplEditing, label: e.target.value })} size="small" fullWidth disabled={savingTpl} />
              <TextField label="Nombre de la plantilla en Meta" value={tplEditing.template_name} onChange={e => setTplEditing({ ...tplEditing, template_name: e.target.value })} size="small" fullWidth disabled={savingTpl} helperText="Debe coincidir EXACTAMENTE con el nombre aprobado en WhatsApp Manager." />
              <TextField label="Idioma" value={tplEditing.language_code} onChange={e => setTplEditing({ ...tplEditing, language_code: e.target.value })} size="small" fullWidth disabled={savingTpl} helperText="Ej. es_MX, es, en" />
              {/* Imagen del encabezado (upload directo a S3) */}
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>🖼️ Imagen del encabezado (opcional)</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Solo si la plantilla tiene encabezado de <b>IMAGEN</b> en Meta. Sube el mismo banner aprobado (JPG/PNG, máx. 5 MB). Se envía en cada mensaje.
                </Typography>
                {(tplEditing.header_image_display || tplEditing.header_image_url) && (
                  <Box sx={{ mb: 1 }}>
                    <img src={tplEditing.header_image_display || tplEditing.header_image_url || ''} alt="Encabezado" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 6, display: 'block' }} />
                  </Box>
                )}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button component="label" size="small" variant="outlined" startIcon={<ImageIcon />} disabled={savingTpl || uploadingTplImage}>
                    {uploadingTplImage ? 'Subiendo…' : ((tplEditing.header_image_key || tplEditing.header_image_url) ? 'Cambiar imagen' : 'Subir imagen')}
                    <input type="file" hidden accept="image/jpeg,image/png" onChange={e => { const f = e.target.files?.[0]; if (f) uploadTemplateImage(f); (e.target as HTMLInputElement).value = ''; }} />
                  </Button>
                  {(tplEditing.header_image_key || tplEditing.header_image_url) && (
                    <Button size="small" color="error" onClick={() => setTplEditing({ ...tplEditing, header_image_key: null, header_image_url: '', header_image_display: null })} disabled={savingTpl || uploadingTplImage}>Quitar</Button>
                  )}
                </Box>
                <TextField label="…o pega una URL pública (avanzado)" value={tplEditing.header_image_url || ''} onChange={e => setTplEditing({ ...tplEditing, header_image_url: e.target.value, header_image_key: e.target.value ? null : tplEditing.header_image_key, header_image_display: e.target.value || null })} size="small" fullWidth disabled={savingTpl || uploadingTplImage || !!tplEditing.header_image_key} sx={{ mt: 1 }} helperText={tplEditing.header_image_key ? 'Usando la imagen subida. Pulsa "Quitar" para pegar una URL manual.' : 'URL HTTPS directa a un archivo JPG/PNG.'} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, bgcolor: '#f3f0ff', p: 1, borderRadius: 1 }}>
                <Checkbox size="small" checked={!!tplEditing.use_mm_lite} onChange={e => setTplEditing({ ...tplEditing, use_mm_lite: e.target.checked })} disabled={savingTpl} sx={{ p: 0.5 }} />
                <Box>
                  <Typography variant="body2" fontWeight={600}>Usar API de Marketing (MM Lite) ✨</Typography>
                  <Typography variant="caption" color="text.secondary">Envía por el endpoint de marketing de Meta (hasta ~9% más de entregas). Actívalo solo para plantillas de MARKETING y después de completar el onboarding de MM Lite en Meta. Las de UTILITY déjalo apagado.</Typography>
                </Box>
              </Box>
              {/* Rastreo de clics en el botón de URL */}
              <Box sx={{ bgcolor: '#e3f2fd', p: 1.5, borderRadius: 1 }}>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>🔗 Rastreo de clics (botón de URL)</Typography>
                <TextField
                  label="URL destino del botón (para rastrear clics)"
                  value={tplEditing.link_dest || ''}
                  onChange={e => setTplEditing({ ...tplEditing, link_dest: e.target.value })}
                  size="small" fullWidth disabled={savingTpl}
                  placeholder="https://entregax.app/descargar-app"
                  helperText='Si lo llenas, cada envío genera un enlace único por persona para saber quién hizo clic. REQUIERE que el botón de tu plantilla en Meta sea de "URL dinámica" con la URL: https://api.entregax.app/r/{{1}}'
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, bgcolor: '#e8f5e9', p: 1, borderRadius: 1 }}>
                <Checkbox size="small" checked={tplEditing.uses_name !== false} onChange={e => setTplEditing({ ...tplEditing, uses_name: e.target.checked })} disabled={savingTpl} sx={{ p: 0.5 }} />
                <Box>
                  <Typography variant="body2" fontWeight={600}>Incluir el nombre del cliente como {'{{1}}'}</Typography>
                  <Typography variant="caption" color="text.secondary">Actívalo si tu plantilla en Meta empieza con {'{{1}}'} (el nombre). <b>Desactívalo si la plantilla NO tiene variables</b> (texto fijo), o Meta rechaza el envío con "Number of parameters does not match".</Typography>
                </Box>
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>Variables manuales {tplEditing.uses_name !== false ? '(van después del nombre)' : '(la plantilla NO usa nombre)'}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {tplEditing.uses_name !== false
                    ? <>El nombre del cliente es siempre {'{{1}}'}. Estas son {'{{2}}'}, {'{{3}}'}… en orden.</>
                    : <>Sin nombre. Estas variables son {'{{1}}'}, {'{{2}}'}… en orden. Si no agregas ninguna, la plantilla se envía sin parámetros.</>}
                </Typography>
                {(tplEditing.variables || []).map((v, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField label={`Var {${i + (tplEditing.uses_name !== false ? 2 : 1)}} — etiqueta`} value={v.label} onChange={e => { const vs = [...tplEditing.variables]; vs[i] = { ...vs[i], label: e.target.value }; setTplEditing({ ...tplEditing, variables: vs }); }} size="small" sx={{ flex: 2 }} disabled={savingTpl} />
                    <FormControl size="small" sx={{ flex: 1, minWidth: 130 }}>
                      <InputLabel>Prellenar con</InputLabel>
                      <Select label="Prellenar con" value={v.defaultKey || ''} onChange={e => { const vs = [...tplEditing.variables]; vs[i] = { ...vs[i], defaultKey: (e.target.value as string) || undefined }; setTplEditing({ ...tplEditing, variables: vs }); }} disabled={savingTpl}>
                        <MenuItem value="">— ninguno —</MenuItem>
                        <MenuItem value="tc">TC vigente</MenuItem>
                        <MenuItem value="comision">Comisión</MenuItem>
                        <MenuItem value="cbm">Costo CBM</MenuItem>
                        <MenuItem value="kg">Costo kg</MenuItem>
                      </Select>
                    </FormControl>
                    <IconButton size="small" color="error" onClick={() => { const vs = tplEditing.variables.filter((_, j) => j !== i); setTplEditing({ ...tplEditing, variables: vs }); }} disabled={savingTpl}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={() => setTplEditing({ ...tplEditing, variables: [...(tplEditing.variables || []), { label: '' }] })} disabled={savingTpl}>Agregar variable</Button>
              </Box>
              <TextField label="Vista previa (texto de referencia)" value={tplEditing.preview || ''} onChange={e => setTplEditing({ ...tplEditing, preview: e.target.value })} size="small" fullWidth multiline minRows={3} disabled={savingTpl} helperText="Usa [Nombre] y {1}, {2}… donde van las variables. Solo es referencia visual (el texto real vive en Meta)." />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {tplEditing ? (
            <>
              <Button onClick={() => setTplEditing(null)} disabled={savingTpl}>Volver</Button>
              <Button variant="contained" onClick={() => saveTemplate(tplEditing)} disabled={savingTpl || !tplEditing.label.trim() || !tplEditing.template_name.trim()}>Guardar</Button>
            </>
          ) : (
            <Button onClick={() => setTplManagerOpen(false)}>Cerrar</Button>
          )}
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
