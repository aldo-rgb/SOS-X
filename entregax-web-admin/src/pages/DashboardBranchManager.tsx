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

  useEffect(() => {
    loadData();
    loadDelayedCount();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Gerente');
      setUserRole(String(parsed.role || '').toLowerCase());
    }
    const iv = setInterval(loadDelayedCount, 60000);
    return () => clearInterval(iv);
  }, []);

  // Widget "Recepción Parcial" solo visible para roles globales (no gerente sucursal)
  const canSeePartialReceptions = ['super_admin', 'admin', 'director', 'customer_service'].includes(userRole);

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
  const showAirWidget = hasService('AIR_CHN_MX') || isCedis;
  const showSeaWidget = hasService('SEA_CHN_MX') || hasService('FCL_CHN_MX') || isCedis;
  // POBox sólo aplica a sucursales con servicio POBOX_USA (ej. CEDIS MTY).
  // CEDIS CDMX NO opera POBox, no debe ver el widget.
  const showPoboxWidget = hasService('POBOX_USA');

  const loadData = async () => {
    setLoading(true);
    try {
      // Cargar estadísticas del dashboard de gerente
      const response = await api.get('/dashboard/branch-manager');
      if (response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Evitar datos ficticios en dashboard
      setStats({
        sucursal: { nombre: 'CEDIS MTY', codigo: 'MTY', allowed_services: [] },
        paquetes: { en_bodega: 0, en_transito: 0, en_espera_cajas: 0, en_espera_maritimo: 0, en_espera_aereo: 0, entregados_hoy: 0, pendientes_cobro: 0 },
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
            label="En Bodega"
            value={stats?.paquetes.en_bodega ?? 0}
            sub="paquetes"
            tone="info"
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <KpiCard
            icon={<CheckCircleIcon sx={{ fontSize: 22 }} />}
            label="Entregas Hoy"
            value={stats?.paquetes.entregados_hoy ?? 0}
            sub="completadas"
            tone="success"
          />
        </Grid>

        {stats?.sucursal.codigo === 'MTY' && (
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
            <KpiCard
              icon={<LocalShippingIcon sx={{ fontSize: 22 }} />}
              label="En tránsito a MTY"
              value={stats?.paquetes.en_espera_cajas ?? stats?.paquetes.en_transito ?? 0}
              sub="cajas en camino"
              tone="info"
            />
          </Grid>
        )}

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

        <Grid size={{ xs: 12, sm: 6, md: 3, lg: 2 }}>
          <KpiCard
            icon={<FlightTakeoffIcon sx={{ fontSize: 22 }} />}
            label="En espera Aéreo"
            value={stats?.paquetes.en_espera_aereo ?? 0}
            sub="cajas aéreas"
            tone="info"
            accentBar="#7C3AED"
          />
        </Grid>
      </Grid>

      {/* === Sección: Alertas (retrasos / parciales) === */}
      {(showPoboxWidget || showAirWidget || showSeaWidget || (canSeePartialReceptions && partialReceptions.total > 0)) && (        <>
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

            {canSeePartialReceptions && partialReceptions.total > 0 && (
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
          </Grid>
        </>
      )}


      {/* Modal: Recepciones Parciales */}
      <Dialog
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
    </Box>
  );
}
