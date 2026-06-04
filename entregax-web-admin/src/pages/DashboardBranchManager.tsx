// ============================================
// DASHBOARD - GERENTE DE SUCURSAL
// Panel principal para Branch Manager
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardActionArea,
  CircularProgress,
  Chip,

  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
  Stack,
  Divider,
  Badge,
} from '@mui/material';
import {
  Inventory2Outlined as InventoryIcon,
  WarningAmberOutlined as WarningIcon,
  CheckCircleOutlineOutlined as CheckCircleIcon,
  DirectionsBoatOutlined as DirectionsBoatIcon,
  FlightTakeoffOutlined as FlightTakeoffIcon,
  StorefrontOutlined as StoreIcon,
  LocalShippingOutlined as LocalShippingIcon,
  Close as CloseIcon,
  ArrowForwardRounded as ArrowForwardIcon,
  TimerOutlined as TimerIcon,
  TuneOutlined as TuneIcon,
  PrintOutlined as PrintIcon,
  HeadsetMicOutlined as HeadsetIcon,
  VerifiedUserOutlined as VerifiedUserIcon,
  GavelOutlined as GavelIcon,
  AllInboxOutlined as AllInboxIcon,
  AttachFile as AttachFileIcon,
  PictureAsPdf as PdfIcon,
  Send as SendIcon,
  CurrencyExchange as CurrencyExchangeIcon,
  TrendingUpOutlined as TrendingUpIcon,
  CloudOffOutlined as CloudOffIcon,
} from '@mui/icons-material';
import api from '../services/api';
import DelayedPackagesPage from './DelayedPackagesPage';

interface BranchStats {
  sucursal: {
    nombre: string;
    codigo: string;
    allowed_services?: string[];
  };
  paquetes: {
    en_bodega: number;
    en_transito: number;
    en_espera_cajas?: number;
    en_transito_pobox?: number;
    en_transito_transfer_cdmx?: number;
    en_espera_maritimo?: number;
    en_espera_aereo?: number;
    entregados_hoy: number;
    pendientes_cobro: number;
  };
  financiero: {
    ingresos_hoy: number;
    ingresos_mes: number;
    saldo_caja: number;
    cuentas_por_cobrar: number;
  };
  operaciones: {
    recepciones_hoy: number;
    despachos_hoy: number;
    consolidaciones_pendientes: number;
  };
  equipo: {
    empleados_activos: number;
    en_turno: number;
  };
  totales_historicos?: {
    usa: number;
    tdi: number;
    dhl: number;
    tdi_express: number;
    maritimo: number;
    contenedores: number;
  };
}

interface QuickAction {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  action: 'operations' | 'service_tickets' | 'relabeling' | 'branch_inventory';
}

export default function DashboardBranchManager() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<BranchStats | null>(null);
  const [userName, setUserName] = useState('');
  const [delayedCount, setDelayedCount] = useState<number>(0);
  const [delayedAirCount, setDelayedAirCount] = useState<number>(0);
  const [delayedSeaCount, setDelayedSeaCount] = useState<number>(0);
  const [partialReceptions, setPartialReceptions] = useState<{
    total: number;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    pobox: { count: number; items: any[] };
    air: { count: number; items: any[] };
    sea: { count: number; items: any[] };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }>({ total: 0, pobox: { count: 0, items: [] }, air: { count: 0, items: [] }, sea: { count: 0, items: [] } });
  const [partialOpen, setPartialOpen] = useState(false);
  const [delayedOpen, setDelayedOpen] = useState(false);
  const [delayedService, setDelayedService] = useState<'pobox' | 'air' | 'sea'>('pobox');
  const [userRole, setUserRole] = useState<string>('');
  const [pendingVerifications, setPendingVerifications] = useState<number>(0);

  // Tipos de cambio del sistema (monitor de APIs) — solo admin/super_admin/director
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [systemRates, setSystemRates] = useState<{
    entangled: any | null;
    pobox: any | null;
    tdi_air: any | null;
    stale_hours_threshold: number;
  } | null>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Abandonos listos para proceso (firmados por cliente)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [abandonoCount, setAbandonoCount] = useState<number>(0);
  const [abandonoItems, setAbandonoItems] = useState<any[]>([]);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [abandonoOpen, setAbandonoOpen] = useState(false);

  // Tickets de soporte de la sucursal
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [branchTickets, setBranchTickets] = useState<any[]>([]);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [branchSupportDept, setBranchSupportDept] = useState<string>('');
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);

  // Crear ticket de soporte (operaciones)
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [newTicketCategory, setNewTicketCategory] = useState<string>('systemError');
  const [newTicketDescription, setNewTicketDescription] = useState('');
  const [newTicketFiles, setNewTicketFiles] = useState<File[]>([]);
  const [newTicketSubmitting, setNewTicketSubmitting] = useState(false);
  const [newTicketSuccessFolio, setNewTicketSuccessFolio] = useState('');

  const OPS_TICKET_CATEGORIES = [
    { key: 'systemError', label: 'Error del Sistema' },
    { key: 'billing',     label: 'Comisiones / Pagos' },
    { key: 'tracking',    label: 'Ajustes a un paquete' },
    { key: 'clientIssue', label: 'Problema con Cliente' },
    { key: 'other',       label: 'Otro' },
  ];

  const handleSubmitOpsTicket = async () => {
    if (!newTicketCategory || !newTicketDescription.trim()) return;
    setNewTicketSubmitting(true);
    try {
      const form = new FormData();
      form.append('message', newTicketDescription.trim());
      form.append('category', newTicketCategory);
      form.append('escalateDirectly', 'true');
      newTicketFiles.forEach((f, i) => {
        form.append('images', f, f.name || `attach_${i}`);
      });
      const res = await api.post('/support/message', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setNewTicketSuccessFolio(res.data?.ticketFolio || res.data?.folio || '');
      setNewTicketCategory('systemError');
      setNewTicketDescription('');
      setNewTicketFiles([]);
    } catch {
      alert('Error al crear ticket. Intenta de nuevo.');
    } finally {
      setNewTicketSubmitting(false);
    }
  };

  const getCedisDeptName = (code: string, name: string): string => {
    const c = code.toUpperCase();
    const n = name.toUpperCase();
    if (c === 'MTY' || n.includes('MTY') || n.includes('MONTERREY')) return 'CEDIS MTY';
    if (c === 'CDMX' || n.includes('CDMX') || n.includes('CIUDAD DE MEXICO')) return 'CEDIS CDMX';
    if (c === 'TX' || c === 'USA' || n.includes('HIDALGO') || n.includes(' TX') || n.includes('USA')) return 'CEDIS USA';
    return '';
  };

  const loadBranchTickets = async (branchCode: string, branchName: string) => {
    const deptName = getCedisDeptName(branchCode, branchName);
    if (!deptName) return;
    setBranchSupportDept(deptName);
    try {
      const deptsRes = await api.get('/support/departments');
      const dept = (deptsRes.data || []).find((d: any) => d.name === deptName);
      if (!dept) return;
      const res = await api.get(`/admin/support/tickets?limit=50&department_id=${dept.id}`);
      const open = (res.data || []).filter((t: any) => t.status !== 'resolved' && t.status !== 'closed');
      setBranchTickets(open);
    } catch {
      // silencioso: usuario sin acceso o sin tickets
    }
  };

  useEffect(() => {
    loadData();
    loadDelayedCount();
    loadPendingVerifications();
    loadAbandonosListos();
    loadSystemRates();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Gerente');
      setUserRole(String(parsed.role || '').toLowerCase());
    }
    const iv = setInterval(() => {
      loadDelayedCount();
      loadPendingVerifications();
      if (stats?.sucursal) loadBranchTickets(stats.sucursal.codigo, stats.sucursal.nombre);
      loadAbandonosListos();
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  // Widget "Recepción Parcial" solo visible para roles globales (no gerente sucursal)
  const canSeePartialReceptions = ['super_admin', 'admin', 'director', 'customer_service'].includes(userRole);

  // Widget "Verificaciones Pendientes" solo para Director / Admin / Super Admin
  const canSeeVerifications = ['super_admin', 'admin', 'director'].includes(userRole);

  const loadDelayedCount = async () => {
    try {
      const [resPobox, resAir, resSea, resPartial] = await Promise.all([
        api.get('/admin/customer-service/delayed-packages?service=pobox'),
        api.get('/admin/customer-service/delayed-packages?service=air'),
        api.get('/admin/customer-service/delayed-packages?service=sea'),
        api.get('/admin/customer-service/partial-receptions').catch(() => ({ data: null })),
      ]);
      setDelayedCount((resPobox.data?.packages || []).length);
      setDelayedAirCount((resAir.data?.packages || []).length);
      // Marítimo: priorizar el total de cajas perdidas (logs incompletos)
      const seaSummary = resSea.data?.summary;
      const seaBoxes = Number(seaSummary?.total_missing_boxes || 0);
      setDelayedSeaCount(seaBoxes > 0 ? seaBoxes : (resSea.data?.packages || []).length);
      if (resPartial.data?.success) {
        const partial = {
          total: resPartial.data.total || 0,
          pobox: resPartial.data.pobox || { count: 0, items: [] },
          air: resPartial.data.air || { count: 0, items: [] },
          sea: resPartial.data.sea || { count: 0, items: [] },
        };
        setPartialReceptions(partial);

        // Sumar a los contadores de retraso los faltantes de las recepciones parciales
        // (una guía con recepción parcial cuenta como guía con retraso).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sumMissing = (items: any[]) =>
          items.reduce((acc, it) => acc + (Number(it.missing) || 0), 0);
        const airPartialMissing = sumMissing(partial.air.items);
        const seaPartialMissing = sumMissing(partial.sea.items);
        const poboxPartialMissing = sumMissing(partial.pobox.items);
        setDelayedAirCount((prev) => prev + airPartialMissing);
        setDelayedSeaCount((prev) => prev + seaPartialMissing);
        setDelayedCount((prev) => prev + poboxPartialMissing);
      }
    } catch (err) {
      console.error('Error loading delayed counts:', err);
    }
  };

  const loadPendingVerifications = async () => {
    try {
      const res = await api.get('/admin/verifications/stats');
      const pending = Number(res.data?.pending || 0);
      setPendingVerifications(pending);
    } catch (err) {
      // Silenciar: usuarios sin nivel DIRECTOR no tienen acceso
      console.debug('No se pudieron cargar verificaciones pendientes:', err);
    }
  };

  const loadSystemRates = async () => {
    try {
      const res = await api.get('/dashboard/system-rates');
      if (res.data) setSystemRates(res.data);
    } catch (err) {
      // Silenciar: roles sin nivel DIRECTOR no tienen acceso
      console.debug('No se pudieron cargar system rates:', err);
    }
  };

  const loadAbandonosListos = async () => {
    try {
      const res = await api.get('/cs/abandono/listos-proceso');
      if (res.data?.success) {
        setAbandonoCount(Number(res.data.count || 0));
        setAbandonoItems(res.data.items || []);
      }
    } catch (err) {
      console.debug('No se pudieron cargar abandonos listos:', err);
    }
  };

  const openVerifications = () => {
    window.dispatchEvent(
      new CustomEvent('branch-manager-quick-nav', { detail: { action: 'verifications' } })
    );
  };

  const openDelayedModal = (svc: 'pobox' | 'air' | 'sea') => {
    setDelayedService(svc);
    setDelayedOpen(true);
  };

  const hasService = (code: string) => {
    const list = stats?.sucursal?.allowed_services || [];
    if (!Array.isArray(list) || list.length === 0) return false;
    return list.includes('ALL') || list.includes(code);
  };

  // CEDIS (MTY o CDMX) recibe paquetería aérea y marítima de China,
  // por lo que siempre debe ver los widgets de retrasos y parciales.
  const sucursalCodigo = (stats?.sucursal?.codigo || '').toUpperCase();
  const isCedis = sucursalCodigo === 'MTY' || sucursalCodigo === 'CDMX' || sucursalCodigo.includes('CEDIS');
  const isHidalgo = sucursalCodigo.includes('HID') || (stats?.sucursal?.nombre || '').toUpperCase().includes('HIDALGO');
  // MTY tiene un layout dedicado: sólo PoBox + Transfer CDMX en operaciones
  // y sólo Retraso PoBox en alertas. Ocultamos el resto.
  const isMty = sucursalCodigo === 'MTY' || (stats?.sucursal?.nombre || '').toUpperCase().includes('MONTERREY');

  // Para Hidalgo y MTY: no mostrar widgets de aéreo/marítimo en operaciones
  const showAirWidgetOps = !isHidalgo && !isMty && (hasService('AIR_CHN_MX') || isCedis);
  const showSeaWidgetOps = !isHidalgo && !isMty && (hasService('SEA_CHN_MX') || hasService('FCL_CHN_MX') || isCedis);

  // En alertas: para MTY sólo PoBox; resto de sucursales según servicios
  const showAirWidget = !isMty && (hasService('AIR_CHN_MX') || isCedis);
  const showSeaWidget = !isMty && (hasService('SEA_CHN_MX') || hasService('FCL_CHN_MX') || isCedis);
  // POBox sólo aplica a sucursales con servicio POBOX_USA (ej. CEDIS MTY).
  // CEDIS CDMX NO opera POBox, no debe ver el widget.
  const showPoboxWidget = isMty || hasService('POBOX_USA');
  // Abandono: ocultar en MTY (sólo PoBox en alertas)
  const showAbandono = !isMty;

  const loadData = async () => {
    setLoading(true);
    try {
      // Cargar estadísticas del dashboard de gerente
      const response = await api.get('/dashboard/branch-manager');
      if (response.data) {
        setStats(response.data);
        loadBranchTickets(response.data.sucursal?.codigo || '', response.data.sucursal?.nombre || '');
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Evitar datos ficticios en dashboard
      setStats({
        sucursal: { nombre: 'CEDIS MTY', codigo: 'MTY', allowed_services: [] },
        paquetes: { en_bodega: 0, en_transito: 0, en_espera_cajas: 0, en_transito_pobox: 0, en_transito_transfer_cdmx: 0, en_espera_maritimo: 0, en_espera_aereo: 0, entregados_hoy: 0, pendientes_cobro: 0 },
        financiero: { ingresos_hoy: 0, ingresos_mes: 0, saldo_caja: 0, cuentas_por_cobrar: 0 },
        operaciones: { recepciones_hoy: 0, despachos_hoy: 0, consolidaciones_pendientes: 0 },
        equipo: { empleados_activos: 0, en_turno: 0 },
      });
    } finally {
      setLoading(false);
    }
  };

  const quickActions: QuickAction[] = [
    {
      title: 'Operaciones',
      description: 'Ir al panel de operaciones',
      icon: <TuneIcon sx={{ fontSize: 28 }} />,
      color: '#F05A28',
      action: 'operations',
    },
    {
      title: 'Etiquetado',
      description: 'Abrir módulo de reetiquetado',
      icon: <PrintIcon sx={{ fontSize: 28 }} />,
      color: '#F05A28',
      action: 'relabeling',
    },
    {
      title: 'Tráfico Sucursal',
      description: 'Tráfico e inventario de tu sucursal',
      icon: <StoreIcon sx={{ fontSize: 28 }} />,
      color: '#F05A28',
      action: 'branch_inventory',
    },
    {
      title: 'Soporte Técnico',
      description: 'Servicio al cliente y tickets',
      icon: <HeadsetIcon sx={{ fontSize: 28 }} />,
      color: '#F05A28',
      action: 'service_tickets',
    },
  ];

  const handleQuickAction = (action: QuickAction['action']) => {
    if (action === 'service_tickets') {
      setNewTicketSuccessFolio('');
      setCreateTicketOpen(true);
      return;
    }
    window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', { detail: { action } }));
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // ====== Helpers de diseño minimalista ======
  type KpiTone = 'neutral' | 'warning' | 'danger' | 'success' | 'info';

  // Todas las barras de acento usan naranja corporativo (línea única).
  const ORANGE = '#F05A28';
  const ICON_BLACK = '#0F172A';

  const KpiCard = (props: {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    sub?: string;
    tone?: KpiTone;
    badge?: number;
    onClick?: () => void;
    accentBar?: string;
    category?: 'ops' | 'finance' | 'alert';
  }) => {
    const { icon, label, value, sub, tone = 'neutral', badge, onClick, category = 'ops' } = props;
    // Línea siempre naranja, sin importar tone/accentBar entrante
    void tone;
    const accent = ORANGE;
    const isAlert = category === 'alert';
    return (
      <Paper
        onClick={onClick}
        elevation={0}
        sx={{
          position: 'relative',
          p: 2.25,
          height: '100%',
          bgcolor: '#fff',
          borderRadius: 2,
          border: '1px solid #E5E7EB',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'box-shadow .18s ease, transform .18s ease, border-color .18s ease',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          '&:hover': onClick
            ? {
                boxShadow: '0 6px 18px rgba(15,23,42,0.08)',
                transform: 'translateY(-1px)',
                borderColor: '#F05A28',
              }
            : {},
          // barra de acento superior (sutil)
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            bgcolor: accent,
            opacity: isAlert ? 1 : 0.9,
          },
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{ color: '#64748B', fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.7rem' }}
            >
              {label}
            </Typography>
            <Typography
              sx={{
                color: '#0F172A',
                fontWeight: 700,
                fontSize: '2rem',
                lineHeight: 1.1,
                mt: 0.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
            {sub && (
              <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.5 }}>
                {sub}
              </Typography>
            )}
          </Box>
          <Box sx={{ position: 'relative', flexShrink: 0 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#F1F5F9',
                color: ICON_BLACK,
              }}
            >
              {icon}
            </Box>
            {badge !== undefined && badge > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  px: 0.5,
                  borderRadius: '9px',
                  bgcolor: '#DC2626',
                  color: '#fff',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {badge}
              </Box>
            )}
          </Box>
        </Stack>
        {onClick && (
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1.25, color: accent }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Ver detalles
            </Typography>
            <ArrowForwardIcon sx={{ fontSize: 14 }} />
          </Stack>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#F8FAFC', minHeight: '100%' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', letterSpacing: -0.5 }}>
          Buenos días, <Box component="span" sx={{ color: '#F05A28' }}>{userName}</Box> 👋
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mt: 1 }}>
          <Chip
            icon={<StoreIcon sx={{ fontSize: 16 }} />}
            label={stats?.sucursal.nombre || 'Mi Sucursal'}
            size="small"
            sx={{
              bgcolor: '#fff',
              border: '1px solid #E5E7EB',
              color: '#0F172A',
              fontWeight: 600,
              '& .MuiChip-icon': { color: '#F05A28' },
            }}
          />
          <Typography variant="body2" sx={{ color: '#64748B' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
        </Stack>
      </Box>

      {/* Alertas importantes */}
      {stats && stats.paquetes.pendientes_cobro > 20 && (
        <Alert
          severity="warning"
          icon={<WarningIcon />}
          sx={{
            mb: 3,
            border: '1px solid #FCD34D',
            bgcolor: '#FFFBEB',
            color: '#92400E',
            borderRadius: 2,
            '& .MuiAlert-icon': { color: '#F59E0B' },
          }}
        >
          <strong>Atención:</strong> Tienes {stats.paquetes.pendientes_cobro} paquetes pendientes de cobro
        </Alert>
      )}

      {/* === Sección: Tipos de cambio y costos (monitor de APIs) === */}
      {systemRates && ['super_admin', 'admin', 'director'].includes(userRole) && (
        <>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Box sx={{ width: 4, height: 18, bgcolor: '#F05A28', borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', letterSpacing: 0.2, textTransform: 'uppercase' }}>
              Tipos de cambio y costos
            </Typography>
            <Divider sx={{ flex: 1, ml: 1, borderColor: '#E5E7EB' }} />
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600 }}>
              Monitor de APIs · sin cambios &gt; {systemRates.stale_hours_threshold}h
            </Typography>
          </Stack>

          <Grid container spacing={2} sx={{ mb: 4 }}>
            {(() => {
              const fmtAgo = (h: number | null): string => {
                if (h === null || h === undefined) return 'sin datos';
                if (h < 1) return `hace ${Math.max(1, Math.round(h * 60))} min`;
                if (h < 24) return `hace ${Math.round(h)} h`;
                const d = Math.round(h / 24);
                return `hace ${d} día${d === 1 ? '' : 's'}`;
              };
              const fmtDate = (d: string | null | undefined) =>
                d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';
              const RateCard = (props: {
                title: string;
                main: string;
                secondary?: string;
                updatedAt: string | null | undefined;
                hoursSince: number | null;
                stale: boolean;
                icon: React.ReactNode;
                staleLabel?: string;
              }) => {
                const { title, main, secondary, updatedAt, hoursSince, stale, icon, staleLabel } = props;
                const borderColor = stale ? '#FCA5A5' : '#E5E7EB';
                const accent = stale ? '#DC2626' : '#F05A28';
                return (
                  <Paper
                    elevation={0}
                    sx={{
                      position: 'relative',
                      p: 2.25,
                      height: '100%',
                      bgcolor: '#fff',
                      borderRadius: 2,
                      border: `1px solid ${borderColor}`,
                      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                        bgcolor: accent,
                      },
                    }}
                  >
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                          {title}
                        </Typography>
                        <Typography sx={{ color: '#0F172A', fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.15, mt: 0.5 }}>
                          {main}
                        </Typography>
                        {secondary && (
                          <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.25 }}>
                            {secondary}
                          </Typography>
                        )}
                      </Box>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: stale ? '#FEE2E2' : '#F1F5F9',
                          color: stale ? '#DC2626' : '#0F172A',
                          flexShrink: 0,
                        }}
                      >
                        {stale ? <CloudOffIcon sx={{ fontSize: 22 }} /> : icon}
                      </Box>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.25, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={stale ? (staleLabel ?? 'Sin cambios · revisar API') : `Actualizado ${fmtAgo(hoursSince)}`}
                        sx={{
                          height: 22,
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          bgcolor: stale ? '#FEE2E2' : '#ECFDF5',
                          color: stale ? '#B91C1C' : '#047857',
                        }}
                      />
                      <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                        {fmtDate(updatedAt)}
                      </Typography>
                    </Stack>
                  </Paper>
                );
              };

              const ent = systemRates.entangled;
              const pob = systemRates.pobox;
              const tdi = systemRates.tdi_air;

              return (
                <>
                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    {ent ? (
                      <RateCard
                        title="Tipo de cambio · ENTANGLED"
                        main={`$${Number(ent.tipo_cambio_usd).toFixed(4)} MXN / USD`}
                        secondary={`${ent.provider || ent.code || 'Proveedor'} · RMB ${Number(ent.tipo_cambio_rmb).toFixed(4)}`}
                        updatedAt={ent.updated_at}
                        hoursSince={ent.hours_since_update}
                        stale={ent.stale}
                        icon={<CurrencyExchangeIcon sx={{ fontSize: 22 }} />}
                      />
                    ) : (
                      <RateCard
                        title="Tipo de cambio · ENTANGLED"
                        main="Sin proveedor activo"
                        updatedAt={null}
                        hoursSince={null}
                        stale={true}
                        icon={<CurrencyExchangeIcon sx={{ fontSize: 22 }} />}
                      />
                    )}
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    {pob ? (
                      <RateCard
                        title="Tipo de cambio · PO Box USA"
                        main={`$${Number(pob.tipo_cambio_final).toFixed(4)} MXN / USD`}
                        secondary={
                          pob.ultimo_tc_api !== null
                            ? `API base $${Number(pob.ultimo_tc_api).toFixed(4)} · sobreprecio ${pob.sobreprecio ?? 0}`
                            : 'Sin lectura previa del API'
                        }
                        updatedAt={pob.updated_at}
                        hoursSince={pob.hours_since_update}
                        stale={pob.stale}
                        icon={<CurrencyExchangeIcon sx={{ fontSize: 22 }} />}
                      />
                    ) : (
                      <RateCard
                        title="Tipo de cambio · PO Box USA"
                        main="Sin configurar"
                        updatedAt={null}
                        hoursSince={null}
                        stale={true}
                        icon={<CurrencyExchangeIcon sx={{ fontSize: 22 }} />}
                      />
                    )}
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    {tdi ? (
                      <RateCard
                        title="Precio Genérico / kg · TDI Aéreo"
                        main={`$${Number(tdi.price_generic_usd ?? (Number(tdi.cost_per_kg_usd) + 8)).toFixed(2)} USD / kg`}
                        secondary={(() => {
                          // Alias amigables para aeropuertos conocidos
                          const AIRPORT_ALIAS: Record<string, string> = {
                            NLU: 'AIFA',
                            MEX: 'AICM',
                          };
                          const aliasOf = (code?: string | null) =>
                            code ? (AIRPORT_ALIAS[String(code).toUpperCase()] || String(code).toUpperCase()) : '';
                          const orig = tdi.origin_city || aliasOf(tdi.origin_airport);
                          const dest = tdi.destination_city || aliasOf(tdi.destination_airport);
                          const route = (orig && dest) ? `${orig} → ${dest}` : (tdi.route_name || tdi.route_code || 'Ruta activa');
                          const oa = aliasOf(tdi.origin_airport);
                          const da = aliasOf(tdi.destination_airport);
                          const airports = [oa, da].filter(Boolean).join('–');
                          const routeStr = airports ? `${route} (${airports})` : route;
                          const fx = tdi.tipo_cambio_final !== null && tdi.tipo_cambio_final !== undefined
                            ? ` · TC $${Number(tdi.tipo_cambio_final).toFixed(4)} MXN`
                            : '';
                          return `${routeStr} · costo $${Number(tdi.cost_per_kg_usd).toFixed(2)}${fx}`;
                        })()}
                        updatedAt={tdi.updated_at}
                        hoursSince={tdi.hours_since_update}
                        stale={tdi.hours_since_update !== null && tdi.hours_since_update !== undefined && tdi.hours_since_update >= 168}
                        staleLabel="Actualizar"
                        icon={<TrendingUpIcon sx={{ fontSize: 22 }} />}
                      />
                    ) : (
                      <RateCard
                        title="Precio Genérico / kg · TDI Aéreo"
                        main="Sin ruta activa"
                        updatedAt={null}
                        hoursSince={null}
                        stale={true}
                        staleLabel="Actualizar"
                        icon={<TrendingUpIcon sx={{ fontSize: 22 }} />}
                      />
                    )}
                  </Grid>
                </>
              );
            })()}
          </Grid>
        </>
      )}

      {/* === Sección: Operaciones === */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Box sx={{ width: 4, height: 18, bgcolor: '#F05A28', borderRadius: 1 }} />
        <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', letterSpacing: 0.2, textTransform: 'uppercase' }}>
          Operaciones
        </Typography>
        <Divider sx={{ flex: 1, ml: 1, borderColor: '#E5E7EB' }} />
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <KpiCard
            icon={<InventoryIcon sx={{ fontSize: 22 }} />}
            label={`En Bodega · ${stats?.sucursal.nombre || 'Mi sucursal'}`}
            value={stats?.paquetes.en_bodega ?? 0}
            sub="paquetes asignados a tu sucursal"
            tone="info"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <KpiCard
            icon={<CheckCircleIcon sx={{ fontSize: 22 }} />}
            label="Entregas Hoy"
            value={stats?.paquetes.entregados_hoy ?? 0}
            sub={`completadas · ${stats?.sucursal.nombre || ''}`}
            tone="success"
          />
        </Grid>

        {stats?.sucursal.codigo === 'MTY' && (
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
            <KpiCard
              icon={<LocalShippingIcon sx={{ fontSize: 22 }} />}
              label="En tránsito a MTY · PoBox"
              value={stats?.paquetes.en_transito_pobox ?? 0}
              sub="cruce USA → MTY"
              tone="info"
            />
          </Grid>
        )}

        {stats?.sucursal.codigo === 'MTY' && (
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
            <KpiCard
              icon={<LocalShippingIcon sx={{ fontSize: 22 }} />}
              label="En tránsito a MTY · Transfer CEDIS CDMX"
              value={stats?.paquetes.en_transito_transfer_cdmx ?? 0}
              sub="marítimo / aéreo desde CDMX"
              tone="info"
            />
          </Grid>
        )}

        {showSeaWidgetOps && (
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
            <KpiCard
              icon={<DirectionsBoatIcon sx={{ fontSize: 22 }} />}
              label="En espera Marítimo"
              value={stats?.paquetes.en_espera_maritimo ?? 0}
              sub="cajas LCL en aduana"
              tone="info"
              accentBar="#0E7490"
            />
          </Grid>
        )}

        {showAirWidgetOps && (
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
            <KpiCard
              icon={<FlightTakeoffIcon sx={{ fontSize: 22 }} />}
              label="Aéreo en tránsito"
              value={stats?.paquetes.en_espera_aereo ?? 0}
              sub="guías AIR en camino"
              tone="info"
              accentBar="#7C3AED"
            />
          </Grid>
        )}

        {isHidalgo && (
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
            <KpiCard
              icon={<WarningIcon sx={{ fontSize: 22 }} />}
              label="Pérdidas PO Box"
              value={delayedCount}
              sub={delayedCount === 0 ? 'sin pérdidas' : delayedCount === 1 ? 'paquete perdido' : 'paquetes perdidos'}
              tone={delayedCount > 0 ? 'danger' : 'neutral'}
              category="alert"
              badge={delayedCount > 0 ? delayedCount : undefined}
              onClick={() => openDelayedModal('pobox')}
            />
          </Grid>
        )}
      </Grid>

      {/* === Sección: Alertas (retrasos / parciales) === */}
      {(showPoboxWidget || showAirWidget || showSeaWidget || abandonoCount > 0 || (canSeePartialReceptions && partialReceptions.total > 0)) && (        <>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Box sx={{ width: 4, height: 18, bgcolor: '#F05A28', borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', letterSpacing: 0.2, textTransform: 'uppercase' }}>
              Alertas y Retrasos
            </Typography>
            <Divider sx={{ flex: 1, ml: 1, borderColor: '#E5E7EB' }} />
          </Stack>

          <Grid container spacing={2} sx={{ mb: 4 }}>
            {showPoboxWidget && (
              <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
                <KpiCard
                  icon={<TimerIcon sx={{ fontSize: 22 }} />}
                  label="Retraso PO Box"
                  value={delayedCount}
                  sub={delayedCount === 0 ? 'sin retrasos' : delayedCount === 1 ? 'paquete retrasado' : 'paquetes retrasados'}
                  tone={delayedCount > 0 ? 'danger' : 'neutral'}
                  category="alert"
                  badge={delayedCount > 0 ? delayedCount : undefined}
                  onClick={() => openDelayedModal('pobox')}
                />
              </Grid>
            )}

            {showAirWidget && (
              <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
                <KpiCard
                  icon={<FlightTakeoffIcon sx={{ fontSize: 22 }} />}
                  label="Retraso Aéreo"
                  value={delayedAirCount}
                  sub={delayedAirCount === 0 ? 'sin retrasos' : delayedAirCount === 1 ? 'guía retrasada' : 'guías retrasadas'}
                  tone={delayedAirCount > 0 ? 'danger' : 'neutral'}
                  category="alert"
                  badge={delayedAirCount > 0 ? delayedAirCount : undefined}
                  onClick={() => openDelayedModal('air')}
                />
              </Grid>
            )}

            {showSeaWidget && (
              <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
                <KpiCard
                  icon={<DirectionsBoatIcon sx={{ fontSize: 22 }} />}
                  label="Retraso Marítimo"
                  value={delayedSeaCount}
                  sub={delayedSeaCount === 0 ? 'sin retrasos' : delayedSeaCount === 1 ? 'guía retrasada' : 'guías retrasadas'}
                  tone={delayedSeaCount > 0 ? 'danger' : 'neutral'}
                  category="alert"
                  badge={delayedSeaCount > 0 ? delayedSeaCount : undefined}
                  onClick={() => openDelayedModal('sea')}
                />
              </Grid>
            )}

            {/* Abandonos firmados listos para proceso */}
            {showAbandono && (
              <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
                <KpiCard
                  icon={<GavelIcon sx={{ fontSize: 22 }} />}
                  label="Abandono"
                  value={abandonoCount}
                  sub={abandonoCount === 0 ? 'sin pendientes' : abandonoCount === 1 ? 'guía lista para proceso' : 'guías listas para proceso'}
                  tone={abandonoCount > 0 ? 'danger' : 'neutral'}
                  category="alert"
                  badge={abandonoCount > 0 ? abandonoCount : undefined}
                  onClick={() => setAbandonoOpen(true)}
                />
              </Grid>
            )}

            {canSeePartialReceptions && !isMty && partialReceptions.total > 0 && (
              <Grid size={{ xs: 12, sm: 6, md: 3, lg: 4 }}>
                <Paper
                  onClick={() => setPartialOpen(true)}
                  elevation={0}
                  sx={{
                    position: 'relative',
                    p: 2.25,
                    height: '100%',
                    bgcolor: '#fff',
                    borderRadius: 2,
                    border: '1px solid #FED7AA',
                    cursor: 'pointer',
                    transition: 'box-shadow .18s, transform .18s, border-color .18s',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                    '&:hover': {
                      boxShadow: '0 6px 18px rgba(15,23,42,0.08)',
                      transform: 'translateY(-1px)',
                      borderColor: '#F05A28',
                    },
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 3,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                      bgcolor: '#F05A28',
                    },
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                        Recepción Parcial
                      </Typography>
                      <Typography sx={{ color: '#0F172A', fontWeight: 700, fontSize: '2rem', lineHeight: 1.1, mt: 0.5 }}>
                        {partialReceptions.total}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.5 }}>
                        {partialReceptions.total === 1 ? 'guía pendiente' : 'guías pendientes'}
                      </Typography>
                    </Box>
                    <Badge
                      badgeContent={partialReceptions.total}
                      color="warning"
                      sx={{
                        '& .MuiBadge-badge': { bgcolor: '#F59E0B', color: '#fff', fontWeight: 700 },
                      }}
                    >
                      <Box sx={{ width: 38, height: 38, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F1F5F9', color: '#0F172A' }}>
                        <WarningIcon sx={{ fontSize: 22 }} />
                      </Box>
                    </Badge>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.5 }}>
                    {partialReceptions.air.count > 0 && (
                      <Chip size="small" icon={<FlightTakeoffIcon sx={{ fontSize: 12 }} />} label={`${partialReceptions.air.count} aéreo`}
                        sx={{ bgcolor: '#EEF2FF', color: '#4338CA', height: 22, fontWeight: 600, fontSize: '0.7rem' }} />
                    )}
                    {partialReceptions.sea.count > 0 && (
                      <Chip size="small" icon={<DirectionsBoatIcon sx={{ fontSize: 12 }} />} label={`${partialReceptions.sea.count} marítimo`}
                        sx={{ bgcolor: '#ECFEFF', color: '#0E7490', height: 22, fontWeight: 600, fontSize: '0.7rem' }} />
                    )}
                    {partialReceptions.pobox.count > 0 && (
                      <Chip size="small" icon={<LocalShippingIcon sx={{ fontSize: 12 }} />} label={`${partialReceptions.pobox.count} pobox`}
                        sx={{ bgcolor: '#FEF2F2', color: '#B91C1C', height: 22, fontWeight: 600, fontSize: '0.7rem' }} />
                    )}
                  </Stack>
                </Paper>
              </Grid>
            )}

            {canSeeVerifications && (
              <Grid size={{ xs: 12, sm: 6, md: 3, lg: 3 }}>
                <Paper
                  onClick={openVerifications}
                  elevation={0}
                  sx={{
                    position: 'relative',
                    p: 2.25,
                    height: '100%',
                    bgcolor: '#fff',
                    borderRadius: 2,
                    border: pendingVerifications > 0 ? '1px solid #FCA5A5' : '1px solid #E2E8F0',
                    cursor: 'pointer',
                    transition: 'box-shadow .18s, transform .18s, border-color .18s',
                    boxShadow: pendingVerifications > 0
                      ? '0 4px 14px rgba(220,38,38,0.15)'
                      : '0 1px 2px rgba(15,23,42,0.04)',
                    animation: pendingVerifications > 0 ? 'pulseAlert 2s ease-in-out infinite' : 'none',
                    '@keyframes pulseAlert': {
                      '0%, 100%': { boxShadow: '0 4px 14px rgba(220,38,38,0.15)' },
                      '50%': { boxShadow: '0 4px 22px rgba(220,38,38,0.32)' },
                    },
                    '&:hover': {
                      boxShadow: '0 6px 20px rgba(15,23,42,0.10)',
                      transform: 'translateY(-1px)',
                      borderColor: pendingVerifications > 0 ? '#DC2626' : '#94A3B8',
                    },
                    '&::before': pendingVerifications > 0 ? {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 3,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                      bgcolor: '#DC2626',
                    } : {},
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: pendingVerifications > 0 ? '#B91C1C' : '#64748B',
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          textTransform: 'uppercase',
                          fontSize: '0.7rem',
                        }}
                      >
                        Verificaciones Pendientes
                      </Typography>
                      <Typography
                        sx={{
                          color: pendingVerifications > 0 ? '#DC2626' : '#0F172A',
                          fontWeight: 700,
                          fontSize: '2rem',
                          lineHeight: 1.1,
                          mt: 0.5,
                        }}
                      >
                        {pendingVerifications}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.5 }}>
                        {pendingVerifications === 0
                          ? 'sin pendientes'
                          : pendingVerifications === 1
                          ? 'usuario por revisar'
                          : 'usuarios por revisar'}
                      </Typography>
                    </Box>
                    <Badge
                      badgeContent={pendingVerifications}
                      color="error"
                      invisible={pendingVerifications === 0}
                      sx={{ '& .MuiBadge-badge': { fontWeight: 700 } }}
                    >
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: pendingVerifications > 0 ? '#FEE2E2' : '#F1F5F9',
                          color: pendingVerifications > 0 ? '#DC2626' : '#0F172A',
                        }}
                      >
                        <VerifiedUserIcon sx={{ fontSize: 22 }} />
                      </Box>
                    </Badge>
                  </Stack>
                  {pendingVerifications > 0 && (
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.25 }}>
                      <ArrowForwardIcon sx={{ fontSize: 14, color: '#DC2626' }} />
                      <Typography variant="caption" sx={{ color: '#DC2626', fontWeight: 600 }}>
                        Revisar ahora
                      </Typography>
                    </Stack>
                  )}
                </Paper>
              </Grid>
            )}
          </Grid>
        </>
      )}

      {/* === Sección: Guías Registradas (totales históricos) === */}
      {stats?.totales_historicos && ['director', 'admin', 'super_admin'].includes(userRole) && (
        <>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, mt: 1 }}>
            <Box sx={{ width: 4, height: 18, bgcolor: '#F05A28', borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', letterSpacing: 0.2, textTransform: 'uppercase' }}>
              Guías Registradas
            </Typography>
            <Divider sx={{ flex: 1, ml: 1, borderColor: '#E5E7EB' }} />
            <Typography variant="caption" sx={{ color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Total{' '}
              <Box component="span" sx={{ color: '#0F172A', fontWeight: 700 }}>
                {(
                  (stats.totales_historicos.usa || 0) +
                  (stats.totales_historicos.tdi || 0) +
                  (stats.totales_historicos.dhl || 0) +
                  (stats.totales_historicos.tdi_express || 0) +
                  (stats.totales_historicos.maritimo || 0)
                ).toLocaleString()}
              </Box>{' '}
              guías · {(stats.totales_historicos.contenedores || 0).toLocaleString()} contenedores
            </Typography>
          </Stack>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Paper elevation={0} sx={{
                p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #E5E7EB',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                borderTop: '3px solid #F05A28',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <LocalShippingIcon sx={{ fontSize: 16, color: '#F05A28' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: '0.68rem' }}>
                    USA
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {(stats.totales_historicos.usa || 0).toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>PO Box USA</Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Paper elevation={0} sx={{
                p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #E5E7EB',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                borderTop: '3px solid #7C3AED',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <FlightTakeoffIcon sx={{ fontSize: 16, color: '#7C3AED' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: '0.68rem' }}>
                    TDI
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {(stats.totales_historicos.tdi || 0).toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>Aéreo China</Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Paper elevation={0} sx={{
                p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #E5E7EB',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                borderTop: '3px solid #DC2626',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <LocalShippingIcon sx={{ fontSize: 16, color: '#DC2626' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: '0.68rem' }}>
                    DHL
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {(stats.totales_historicos.dhl || 0).toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>DHL / AA DHL</Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Paper elevation={0} sx={{
                p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #E5E7EB',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                borderTop: '3px solid #0EA5E9',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <FlightTakeoffIcon sx={{ fontSize: 16, color: '#0EA5E9' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: '0.68rem' }}>
                    TDI Express
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {(stats.totales_historicos.tdi_express || 0).toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>TDX Express</Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Paper elevation={0} sx={{
                p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #E5E7EB',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                borderTop: '3px solid #0E7490',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <DirectionsBoatIcon sx={{ fontSize: 16, color: '#0E7490' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: '0.68rem' }}>
                    Marítimo
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {(stats.totales_historicos.maritimo || 0).toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>LOGs registrados</Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Paper elevation={0} sx={{
                p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #E5E7EB',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                borderTop: '3px solid #059669',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <AllInboxIcon sx={{ fontSize: 16, color: '#059669' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: '0.68rem' }}>
                    Contenedores
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1.6rem', color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {(stats.totales_historicos.contenedores || 0).toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#94A3B8' }}>FCL / LCL</Typography>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {/* Modal: Abandonos Listos para Proceso */}
      <Dialog
        open={abandonoOpen}
        onClose={() => setAbandonoOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #991B1B 0%, #DC2626 100%)', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GavelIcon />
            <Typography variant="h6" fontWeight={700}>
              Abandonos · {abandonoCount} listo{abandonoCount === 1 ? '' : 's'} para proceso
            </Typography>
          </Box>
          <IconButton onClick={() => setAbandonoOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Estas guías ya fueron firmadas por el cliente y están listas para que operaciones disponga físicamente de la mercancía.
          </Alert>
          {abandonoItems.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              No hay guías firmadas pendientes de proceso.
            </Typography>
          ) : (
            abandonoItems.map((it) => (
              <Paper key={`abandono-${it.id}`} sx={{ p: 1.75, mb: 1, borderLeft: '4px solid #DC2626' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography fontWeight={700} sx={{ color: '#0F172A' }}>
                      {it.guia_tracking}
                      <Chip
                        size="small"
                        label={it.servicio}
                        sx={{ ml: 1, height: 20, fontSize: '0.7rem', bgcolor: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}
                      />
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#475569', mt: 0.25 }}>
                      {it.cliente_nombre || 'Sin cliente'}
                      {it.cliente_box ? ` · ${it.cliente_box}` : ''}
                      {it.cliente_email ? ` · ${it.cliente_email}` : ''}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.25 }}>
                      {it.dias_en_almacen} días en almacén
                      {it.firma_fecha ? ` · firmado ${new Date(it.firma_fecha).toLocaleDateString('es-MX')}` : ''}
                      {it.saldo_pendiente ? ` · saldo condonado $${Number(it.saldo_pendiente).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : ''}
                    </Typography>
                  </Box>
                  <Chip size="small" label="Firmado" sx={{ bgcolor: '#DC2626', color: '#fff', fontWeight: 700 }} />
                </Box>
              </Paper>
            ))
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Recepciones Parciales */}      <Dialog
        open={partialOpen}
        onClose={() => setPartialOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #E65100 0%, #FB8C00 100%)', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon />
            <Typography variant="h6" fontWeight={700}>
              Recepciones Parciales · {partialReceptions.total} pendiente{partialReceptions.total === 1 ? '' : 's'}
            </Typography>
          </Box>
          <IconButton onClick={() => setPartialOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {partialReceptions.total === 0 && (
            <Typography color="text.secondary" sx={{ p: 2 }}>No hay recepciones parciales pendientes.</Typography>
          )}

          {partialReceptions.air.count > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: '#5E35B1' }}>
                <FlightTakeoffIcon /> Aéreo · {partialReceptions.air.count} AWB
              </Typography>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {partialReceptions.air.items.map((it: any) => (
                <Paper key={`air-${it.id}`} sx={{ p: 1.5, mb: 1, borderLeft: '4px solid #5E35B1' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={600}>{it.awb_number}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(Number(it.total) - Number(it.missing))}/{it.total} recibidos · {it.missing} faltante(s)
                        {it.flight_date ? ` · vuelo ${new Date(it.flight_date).toLocaleDateString()}` : ''}
                      </Typography>
                    </Box>
                    <Chip size="small" label="parcial" color="warning" />
                  </Box>
                </Paper>
              ))}
            </Box>
          )}

          {partialReceptions.sea.count > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: '#00695C' }}>
                <DirectionsBoatIcon /> Marítimo · {partialReceptions.sea.count} contenedor(es)
              </Typography>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {partialReceptions.sea.items.map((it: any) => (
                <Paper key={`sea-${it.id}`} sx={{ p: 1.5, mb: 1, borderLeft: '4px solid #00695C' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={600}>{it.master_tracking || it.container_number || it.bl_number}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(Number(it.total) - Number(it.missing))}/{it.total} órdenes recibidas · {it.missing} faltante(s)
                      </Typography>
                    </Box>
                    <Chip size="small" label="parcial" color="warning" />
                  </Box>
                </Paper>
              ))}
            </Box>
          )}

          {partialReceptions.pobox.count > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: '#C62828' }}>
                <LocalShippingIcon /> PO Box · {partialReceptions.pobox.count} consolidación(es)
              </Typography>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {partialReceptions.pobox.items.map((it: any) => (
                <Paper key={`pobox-${it.id}`} sx={{ p: 1.5, mb: 1, borderLeft: '4px solid #C62828' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={600}>{it.master_tracking || `Consolidación #${it.id}`}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(Number(it.total) - Number(it.missing))}/{it.total} paquetes recibidos · {it.missing} faltante(s)
                      </Typography>
                    </Box>
                    <Chip size="small" label="parcial" color="warning" />
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Detalle de Guías con Retraso */}
      <Dialog
        open={delayedOpen}
        onClose={() => setDelayedOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, minHeight: '70vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#F05A28', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalShippingIcon />
            <Typography variant="h6" fontWeight={700}>
              Guías con Retraso{delayedService === 'air' ? ' · Aéreo' : delayedService === 'sea' ? ' · Marítimo' : ' · PO Box'}
            </Typography>
          </Box>
          <IconButton onClick={() => setDelayedOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <DelayedPackagesPage hideActions service={delayedService} />
        </DialogContent>
      </Dialog>

      {/* === Sección: Soporte de Sucursal === */}
      {branchSupportDept && (
        <>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, mt: 1 }}>
            <Box sx={{ width: 4, height: 18, bgcolor: '#2196F3', borderRadius: 1 }} />
            <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', letterSpacing: 0.2, textTransform: 'uppercase' }}>
              Soporte — {branchSupportDept}
            </Typography>
            <Divider sx={{ flex: 1, ml: 1, borderColor: '#E5E7EB' }} />
          </Stack>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Paper
                onClick={() => window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', { detail: { action: 'service_tickets' } }))}
                elevation={0}
                sx={{
                  p: 2.25,
                  bgcolor: branchTickets.length > 0 ? '#EFF6FF' : '#fff',
                  border: branchTickets.length > 0 ? '1px solid #93C5FD' : '1px solid #E5E7EB',
                  borderRadius: 2,
                  cursor: 'pointer',
                  transition: 'box-shadow .18s, transform .18s',
                  boxShadow: branchTickets.length > 0 ? '0 4px 14px rgba(33,150,243,0.12)' : '0 1px 2px rgba(15,23,42,0.04)',
                  '&:hover': { boxShadow: '0 6px 18px rgba(33,150,243,0.18)', transform: 'translateY(-1px)' },
                  animation: branchTickets.length > 0 ? 'pulseBlue 2.5s ease-in-out infinite' : 'none',
                  '@keyframes pulseBlue': {
                    '0%,100%': { boxShadow: '0 4px 14px rgba(33,150,243,0.12)' },
                    '50%': { boxShadow: '0 4px 22px rgba(33,150,243,0.28)' },
                  },
                }}
              >
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                      Tickets Abiertos
                    </Typography>
                    <Typography sx={{ color: branchTickets.length > 0 ? '#1D4ED8' : '#0F172A', fontWeight: 700, fontSize: '2rem', lineHeight: 1.1, mt: 0.5 }}>
                      {branchTickets.length}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.5 }}>
                      {branchTickets.length === 0 ? 'sin tickets pendientes' : branchTickets.length === 1 ? 'ticket pendiente' : 'tickets pendientes'}
                    </Typography>
                  </Box>
                  <Badge badgeContent={branchTickets.length} color="primary" invisible={branchTickets.length === 0}
                    sx={{ '& .MuiBadge-badge': { fontWeight: 700 } }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: branchTickets.length > 0 ? '#DBEAFE' : '#F1F5F9', color: branchTickets.length > 0 ? '#1D4ED8' : '#0F172A' }}>
                      <HeadsetIcon sx={{ fontSize: 22 }} />
                    </Box>
                  </Badge>
                </Stack>
                {branchTickets.length > 0 && (
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.25 }}>
                    <ArrowForwardIcon sx={{ fontSize: 14, color: '#2563EB' }} />
                    <Typography variant="caption" sx={{ color: '#2563EB', fontWeight: 600 }}>Ver tickets</Typography>
                  </Stack>
                )}
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {/* Modal: Tickets de soporte de la sucursal */}
      <Dialog open={ticketDialogOpen} onClose={() => setTicketDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HeadsetIcon />
            <Typography variant="h6" fontWeight={700}>
              Tickets — {branchSupportDept} · {branchTickets.length} abierto{branchTickets.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
          <IconButton onClick={() => setTicketDialogOpen(false)} sx={{ color: 'white' }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          {branchTickets.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>No hay tickets pendientes.</Typography>
          ) : (
            branchTickets.map((t: any) => (
              <Paper
                key={t.id}
                elevation={0}
                onClick={() => {
                  setTicketDialogOpen(false);
                  window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', { detail: { action: 'service_tickets' } }));
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('open-support-ticket', { detail: { ticketId: t.id } }));
                  }, 300);
                }}
                sx={{ p: 2, mb: 1.5, border: '1px solid #E5E7EB', borderRadius: 2, cursor: 'pointer',
                  borderLeft: `4px solid ${t.category === 'urgent' ? '#DC2626' : '#2563EB'}`,
                  '&:hover': { bgcolor: '#F8FAFF', borderColor: '#2563EB' },
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>{t.subject}</Typography>
                    <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.25 }}>
                      {t.ticket_folio} · {t.full_name}{t.client_box_id ? ` · #${t.client_box_id}` : ''}{t.phone ? ` · ${t.phone}` : ''}
                    </Typography>
                    {t.last_message_preview && (
                      <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.25, fontStyle: 'italic' }}>
                        "{t.last_message_preview}"
                      </Typography>
                    )}
                  </Box>
                  <Chip size="small" label={t.category || 'general'} sx={{ bgcolor: '#EFF6FF', color: '#1D4ED8', fontWeight: 600, fontSize: 11 }} />
                </Stack>
              </Paper>
            ))
          )}
        </DialogContent>
      </Dialog>

      {/* Accesos Rápidos */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Box sx={{ width: 4, height: 18, bgcolor: '#F05A28', borderRadius: 1 }} />
        <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem', letterSpacing: 0.2, textTransform: 'uppercase' }}>
          Accesos Rápidos
        </Typography>
        <Divider sx={{ flex: 1, ml: 1, borderColor: '#E5E7EB' }} />
      </Stack>
      <Grid container spacing={2}>
        {quickActions.map((action, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={index}>
            <Card
              elevation={0}
              sx={{
                height: '100%',
                bgcolor: '#fff',
                borderRadius: 2,
                border: '1px solid #E5E7EB',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                transition: 'box-shadow .18s ease, transform .18s ease, border-color .18s ease',
                '&:hover': {
                  boxShadow: '0 6px 18px rgba(15,23,42,0.08)',
                  transform: 'translateY(-1px)',
                  borderColor: '#F05A28',
                },
              }}
            >
              <CardActionArea onClick={() => handleQuickAction(action.action)} sx={{ p: 2.25, height: '100%' }}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: `${action.color}14`,
                      color: action.color,
                      flexShrink: 0,
                    }}
                  >
                    {action.icon}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 700, color: '#0F172A', fontSize: '0.95rem' }}>
                      {action.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.25 }}>
                      {action.description}
                    </Typography>
                  </Box>
                  <ArrowForwardIcon sx={{ color: '#CBD5E1', fontSize: 18 }} />
                </Stack>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Dialog: Crear Ticket de Soporte */}
      <Dialog
        open={createTicketOpen}
        onClose={() => setCreateTicketOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
          <HeadsetIcon sx={{ color: '#F05A28' }} />
          Nuevo Ticket de Soporte
          <IconButton
            onClick={() => setCreateTicketOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {newTicketSuccessFolio ? (
            <Alert severity="success" sx={{ my: 1 }}>
              Ticket <strong>{newTicketSuccessFolio}</strong> creado. Un agente te atenderá pronto.
            </Alert>
          ) : (
            <>
              <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
                Describe tu problema. Un agente del equipo de soporte lo atenderá.
              </Alert>

              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Categoría *</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {OPS_TICKET_CATEGORIES.map(cat => (
                  <Chip
                    key={cat.key}
                    label={cat.label}
                    onClick={() => setNewTicketCategory(cat.key)}
                    variant={newTicketCategory === cat.key ? 'filled' : 'outlined'}
                    sx={{
                      bgcolor: newTicketCategory === cat.key ? '#F05A28' : undefined,
                      color: newTicketCategory === cat.key ? '#fff' : undefined,
                      borderColor: newTicketCategory === cat.key ? '#F05A28' : undefined,
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  />
                ))}
              </Box>

              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Descripción del problema *</Typography>
              <TextField
                fullWidth
                multiline
                minRows={4}
                placeholder="Describe detalladamente qué ocurrió, cuándo y qué estabas haciendo..."
                value={newTicketDescription}
                onChange={(e) => setNewTicketDescription(e.target.value)}
                sx={{ mb: 2 }}
              />

              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Adjuntos (fotos o PDF)</Typography>
              <Button
                component="label"
                variant="outlined"
                startIcon={<AttachFileIcon />}
                sx={{ mb: 1, borderColor: '#F05A28', color: '#F05A28' }}
              >
                Adjuntar archivos
                <input
                  type="file"
                  hidden
                  multiple
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    if (e.target.files) setNewTicketFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    e.target.value = '';
                  }}
                />
              </Button>
              {newTicketFiles.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  {newTicketFiles.map((f, i) => (
                    <Box
                      key={i}
                      sx={{
                        display: 'inline-flex', alignItems: 'center', gap: 0.5,
                        bgcolor: '#f5f5f5', borderRadius: 1, border: '1px solid #ddd',
                        p: 0.5, pr: 1,
                      }}
                    >
                      {f.type === 'application/pdf'
                        ? <PdfIcon sx={{ color: '#e53935', fontSize: 24 }} />
                        : <Box component="img" src={URL.createObjectURL(f)} sx={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 0.5 }} />
                      }
                      <Typography variant="caption" sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </Typography>
                      <IconButton size="small" onClick={() => setNewTicketFiles(prev => prev.filter((_, j) => j !== i))} sx={{ p: 0.2 }}>
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {newTicketSuccessFolio ? (
            <Button variant="contained" onClick={() => setCreateTicketOpen(false)} sx={{ bgcolor: '#F05A28' }}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button onClick={() => setCreateTicketOpen(false)}>Cancelar</Button>
              <Button
                variant="contained"
                startIcon={<SendIcon />}
                disabled={!newTicketCategory || !newTicketDescription.trim() || newTicketSubmitting}
                onClick={handleSubmitOpsTicket}
                sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D14A20' } }}
              >
                {newTicketSubmitting ? 'Enviando...' : 'Enviar Ticket'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
