// ============================================
// DASHBOARD - SERVICIO AL CLIENTE
// Panel principal para Customer Service
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Avatar,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Badge,
  Divider,
  Button,
} from '@mui/material';
import {
  Chat as ChatIcon,
  LocalShipping as ShippingIcon,
  AccessTime as AccessTimeIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Assignment as AssignmentIcon,
  FiberNew as NewIcon,
  VerifiedUser as VerifiedUserIcon,
  HourglassEmpty as HourglassEmptyIcon,
  CurrencyExchange as CurrencyExchangeIcon,
  TrendingUp as TrendingUpIcon,
  CloudOff as CloudOffIcon,
} from '@mui/icons-material';
import Stack from '@mui/material/Stack';
import api from '../services/api';

interface SupportStats {
  ai_handling: number;
  needs_human: number;
  waiting_client: number;
  resolved: number;
  today_new: number;
  today_resolved: number;
  employee_open: number;
  client_open: number;
  avg_resolution_time_min: number;
  departments: Array<{ id: number; name: string; color: string; open_count: number }>;
}

interface RecentTicket {
  id: number;
  ticket_folio: string;
  subject: string;
  status: string;
  priority: string | null;
  created_at: string;
  full_name?: string;
}

interface VerificationStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

interface Props {
  onNavigateToSupport?: () => void;
  onNavigateToVerifications?: () => void;
}

// Colores de marca
const BRAND = {
  orange: '#F05A28',
  orangeLight: '#FF7A45',
  red: '#C1272D',
  redLight: '#E53935',
  black: '#1A1A1A',
  blackLight: '#3D3D3D',
  darkOrange: '#BF360C',
  darkOrangeLight: '#E64A19',
};

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  caption: string;
  icon: React.ReactNode;
  gradient: string;
  badge?: number;
  onClick?: () => void;
}

function KpiCard({ title, value, caption, icon, gradient, badge, onClick }: KpiCardProps) {
  return (
    <Paper
      sx={{
        p: 3,
        background: gradient,
        color: 'white',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s',
        borderRadius: 3,
        minHeight: 140,
        display: 'flex',
        alignItems: 'stretch',
        '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 6 } : {},
      }}
      onClick={onClick}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 90 }}>
          <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 500, letterSpacing: 0.3 }}>
            {title}
          </Typography>
          <Typography variant="h3" fontWeight={800} sx={{ lineHeight: 1, my: 0.5 }}>
            {value}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.75 }}>
            {caption}
          </Typography>
        </Box>
        {badge !== undefined ? (
          <Badge badgeContent={badge} color="error">
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.18)', width: 52, height: 52 }}>
              {icon}
            </Avatar>
          </Badge>
        ) : (
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.18)', width: 52, height: 52 }}>
            {icon}
          </Avatar>
        )}
      </Box>
    </Paper>
  );
}

export default function DashboardCustomerService({ onNavigateToSupport, onNavigateToVerifications }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
  const [userName, setUserName] = useState('');
  const [verificationStats, setVerificationStats] = useState<VerificationStats | null>(null);
  const [systemRates, setSystemRates] = useState<{
    entangled: any | null;
    pobox: any | null;
    tdi_air: any | null;
    tdi_express: any | null;
    stale_hours_threshold: number;
  } | null>(null);

  useEffect(() => {
    loadData();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Agente');
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [statsRes, ticketsRes, verifRes, ratesRes] = await Promise.allSettled([
      api.get('/admin/support/stats'),
      api.get('/admin/support/tickets', { params: { limit: 5, status: undefined } }),
      api.get('/admin/verifications/stats'),
      api.get('/dashboard/system-rates'),
    ]);

    if (statsRes.status === 'fulfilled') {
      const raw = statsRes.value.data || {};
      setStats({
        ai_handling: parseInt(raw.ai_handling) || 0,
        needs_human: parseInt(raw.needs_human) || 0,
        waiting_client: parseInt(raw.waiting_client) || 0,
        resolved: parseInt(raw.resolved) || 0,
        today_new: parseInt(raw.today_new) || 0,
        today_resolved: parseInt(raw.today_resolved) || 0,
        employee_open: parseInt(raw.employee_open) || 0,
        client_open: parseInt(raw.client_open) || 0,
        avg_resolution_time_min: parseInt(raw.avg_resolution_time_min) || 0,
        departments: raw.departments || [],
      });
    }

    if (ticketsRes.status === 'fulfilled') {
      const data = ticketsRes.value.data;
      setRecentTickets(Array.isArray(data) ? data : (data?.tickets || []));
    }

    if (verifRes.status === 'fulfilled') {
      const raw = verifRes.value.data || {};
      setVerificationStats({
        pending: parseInt(raw.pending) || 0,
        approved: parseInt(raw.approved) || 0,
        rejected: parseInt(raw.rejected) || 0,
        total: parseInt(raw.total) || 0,
      });
    }

    if (ratesRes.status === 'fulfilled') {
      setSystemRates(ratesRes.value.data);
    }

    setLoading(false);
  };

  const getStatusColor = (status: string): 'default' | 'warning' | 'info' | 'error' | 'success' => {
    switch (status) {
      case 'resolved': return 'success';
      case 'escalated_human': return 'error';
      case 'waiting_client': return 'warning';
      case 'open_ai': return 'info';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      open_ai: 'IA',
      escalated_human: 'Personal',
      waiting_client: 'Esperando',
      waiting_agent: 'En espera',
      resolved: 'Resuelto',
      closed: 'Cerrado',
    };
    return map[status] || status;
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  };

  const totalOpen = (stats?.ai_handling ?? 0) + (stats?.needs_human ?? 0) + (stats?.waiting_client ?? 0);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: BRAND.orange }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700}>
          ¡Hola, <span style={{ color: BRAND.orange }}>{userName}</span>!
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Panel de Servicio al Cliente — {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Typography>
      </Box>

      {/* Tipos de Cambio y Costos */}
      {systemRates && (
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
                hasOverride?: boolean;
              }) => {
                const { title, main, secondary, updatedAt, hoursSince, stale, icon, staleLabel, hasOverride } = props;
                const borderColor = stale ? '#FCA5A5' : '#E5E7EB';
                const accent = stale ? '#DC2626' : '#F05A28';
                return (
                  <Paper elevation={0} sx={{ position: 'relative', p: 2.25, height: '100%', bgcolor: '#fff', borderRadius: 2, border: `1px solid ${borderColor}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 8, borderTopRightRadius: 8, bgcolor: accent } }}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.7rem' }}>{title}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.5 }}>
                          <Typography sx={{ color: '#0F172A', fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.15 }}>{main}</Typography>
                          {hasOverride && <Box sx={{ px: 0.6, py: 0.15, borderRadius: 1, bgcolor: '#FFF7ED', border: '1px solid #FDBA74', fontSize: '0.65rem', fontWeight: 800, color: '#C2410C', letterSpacing: 0.5, flexShrink: 0 }}>OV</Box>}
                        </Box>
                        {secondary && <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.25 }}>{secondary}</Typography>}
                      </Box>
                      <Box sx={{ width: 38, height: 38, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: stale ? '#FEE2E2' : '#F1F5F9', color: stale ? '#DC2626' : '#0F172A', flexShrink: 0 }}>
                        {stale ? <CloudOffIcon sx={{ fontSize: 22 }} /> : icon}
                      </Box>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.25, flexWrap: 'wrap' }}>
                      <Chip size="small" label={stale ? (staleLabel ?? 'Sin cambios · revisar API') : `Actualizado ${fmtAgo(hoursSince)}`} sx={{ height: 22, fontWeight: 700, fontSize: '0.7rem', bgcolor: stale ? '#FEE2E2' : '#ECFDF5', color: stale ? '#B91C1C' : '#047857' }} />
                      <Typography variant="caption" sx={{ color: '#94A3B8' }}>{fmtDate(updatedAt)}</Typography>
                    </Stack>
                  </Paper>
                );
              };

              const ent = systemRates.entangled;
              const pob = systemRates.pobox;
              const tdi = systemRates.tdi_air;
              const tdiExp = systemRates.tdi_express;
              const AIRPORT_ALIAS: Record<string, string> = { NLU: 'AIFA', MEX: 'AICM' };
              const aliasOf = (code?: string | null) => code ? (AIRPORT_ALIAS[String(code).toUpperCase()] || String(code).toUpperCase()) : '';

              return (
                <>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    {ent ? (
                      <RateCard title="Tipo de cambio · Envío de Dinero" main={`$${Number(ent.tipo_cambio_usd).toFixed(4)} MXN / USD`} updatedAt={ent.updated_at} hoursSince={ent.hours_since_update} stale={ent.stale} icon={<CurrencyExchangeIcon sx={{ fontSize: 22 }} />} hasOverride={!!(ent.has_override_usd || ent.has_override_rmb)} />
                    ) : (
                      <RateCard title="Tipo de cambio · Envío de Dinero" main="Sin proveedor activo" updatedAt={null} hoursSince={null} stale={true} icon={<CurrencyExchangeIcon sx={{ fontSize: 22 }} />} />
                    )}
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    {pob ? (
                      <RateCard title="Tipo de cambio · EntregaX" main={`$${Number(pob.tipo_cambio_final).toFixed(4)} MXN / USD`} updatedAt={pob.updated_at} hoursSince={pob.hours_since_update} stale={pob.stale} icon={<CurrencyExchangeIcon sx={{ fontSize: 22 }} />} />
                    ) : (
                      <RateCard title="Tipo de cambio · EntregaX" main="Sin configurar" updatedAt={null} hoursSince={null} stale={true} icon={<CurrencyExchangeIcon sx={{ fontSize: 22 }} />} />
                    )}
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    {tdi ? (
                      <RateCard
                        title="Precio Genérico / kg · TDI Aéreo"
                        main={`$${Number(tdi.price_generic_usd ?? (Number(tdi.cost_per_kg_usd) + 8)).toFixed(2)} USD / kg`}
                        secondary={(() => { const orig = tdi.origin_city || aliasOf(tdi.origin_airport); const dest = tdi.destination_city || aliasOf(tdi.destination_airport); const route = (orig && dest) ? `${orig} → ${dest}` : (tdi.route_name || 'Ruta activa'); const airports = [aliasOf(tdi.origin_airport), aliasOf(tdi.destination_airport)].filter(Boolean).join('–'); return airports ? `${route} (${airports})` : route; })()}
                        updatedAt={tdi.updated_at} hoursSince={tdi.hours_since_update}
                        stale={tdi.hours_since_update != null && tdi.hours_since_update >= 168}
                        staleLabel="Actualizar" icon={<TrendingUpIcon sx={{ fontSize: 22 }} />}
                      />
                    ) : (
                      <RateCard title="Precio Genérico / kg · TDI Aéreo" main="Sin ruta activa" updatedAt={null} hoursSince={null} stale={true} staleLabel="Actualizar" icon={<TrendingUpIcon sx={{ fontSize: 22 }} />} />
                    )}
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    {tdiExp ? (
                      <RateCard
                        title="Precio Genérico / kg · TDI Express"
                        main={`$${Number(tdiExp.price_generic_usd ?? (Number(tdiExp.cost_per_kg_usd) + 8)).toFixed(2)} USD / kg`}
                        secondary={(() => { const orig = tdiExp.origin_city || aliasOf(tdiExp.origin_airport); const dest = tdiExp.destination_city || aliasOf(tdiExp.destination_airport); const route = (orig && dest) ? `${orig} → ${dest}` : (tdiExp.route_name || 'Ruta Express'); const airports = [aliasOf(tdiExp.origin_airport), aliasOf(tdiExp.destination_airport)].filter(Boolean).join('–'); return airports ? `${route} (${airports})` : route; })()}
                        updatedAt={tdiExp.updated_at} hoursSince={tdiExp.hours_since_update}
                        stale={tdiExp.hours_since_update != null && tdiExp.hours_since_update >= 168}
                        staleLabel="Actualizar" icon={<TrendingUpIcon sx={{ fontSize: 22 }} />}
                      />
                    ) : (
                      <RateCard title="Precio Genérico / kg · TDI Express" main="Sin ruta activa" updatedAt={null} hoursSince={null} stale={true} staleLabel="Actualizar" icon={<TrendingUpIcon sx={{ fontSize: 22 }} />} />
                    )}
                  </Grid>
                </>
              );
            })()}
          </Grid>
        </>
      )}

      {/* KPIs */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Tickets Abiertos"
            value={totalOpen}
            caption={onNavigateToSupport ? 'Click para ver todos' : ' '}
            icon={<AssignmentIcon />}
            gradient={`linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.orangeLight} 100%)`}
            badge={stats?.needs_human ?? 0}
            onClick={onNavigateToSupport}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Resueltos Hoy"
            value={stats?.today_resolved ?? 0}
            caption="Tickets cerrados hoy"
            icon={<CheckCircleIcon />}
            gradient={`linear-gradient(135deg, ${BRAND.red} 0%, ${BRAND.redLight} 100%)`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Tiempo Promedio"
            value={<>{stats?.avg_resolution_time_min ?? 0}<small style={{ fontSize: '0.45em', fontWeight: 600 }}>min</small></>}
            caption="Resolución hoy"
            icon={<AccessTimeIcon />}
            gradient={`linear-gradient(135deg, ${BRAND.black} 0%, ${BRAND.blackLight} 100%)`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            title="Tickets Nuevos"
            value={stats?.today_new ?? 0}
            caption="Últimas 24 horas"
            icon={<NewIcon />}
            gradient={`linear-gradient(135deg, ${BRAND.darkOrange} 0%, ${BRAND.darkOrangeLight} 100%)`}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Tickets Recientes */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3, height: '100%', borderRadius: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>
                Tickets Recientes
              </Typography>
              {onNavigateToSupport && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onNavigateToSupport}
                  sx={{ borderColor: BRAND.orange, color: BRAND.orange, '&:hover': { borderColor: BRAND.red, color: BRAND.red } }}
                >
                  Ver todos
                </Button>
              )}
            </Box>

            {recentTickets.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No hay tickets recientes
              </Typography>
            ) : (
              <List disablePadding>
                {recentTickets.map((ticket, index) => (
                  <Box key={ticket.id}>
                    <ListItem
                      sx={{ py: 1.5, '&:hover': { bgcolor: 'action.hover', borderRadius: 2 } }}
                      secondaryAction={
                        <Chip
                          label={getStatusLabel(ticket.status)}
                          color={getStatusColor(ticket.status)}
                          size="small"
                        />
                      }
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'rgba(240,90,40,0.12)', color: BRAND.orange }}>
                          <ChatIcon fontSize="small" />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography variant="subtitle2" fontWeight={700}>
                            {ticket.full_name || ticket.ticket_folio}
                          </Typography>
                        }
                        secondary={
                          <>
                            <Typography variant="body2" color="text.secondary" noWrap>{ticket.subject}</Typography>
                            <Typography variant="caption" color="text.disabled">{formatTimeAgo(ticket.created_at)}</Typography>
                          </>
                        }
                      />
                    </ListItem>
                    {index < recentTickets.length - 1 && <Divider variant="inset" component="li" />}
                  </Box>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Panel Lateral */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Atención Requerida
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'rgba(193,39,45,0.08)',
                  border: '1px solid rgba(193,39,45,0.25)',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  cursor: onNavigateToSupport ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  '&:hover': onNavigateToSupport ? { bgcolor: 'rgba(193,39,45,0.14)' } : {},
                }}
                onClick={onNavigateToSupport}
              >
                <WarningIcon sx={{ color: BRAND.red }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND.red }}>
                    {stats?.needs_human ?? 0} Tickets requieren atención
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Escalados, sin respuesta de agente</Typography>
                </Box>
              </Box>

              <Box
                sx={{
                  p: 2,
                  bgcolor: 'rgba(240,90,40,0.08)',
                  border: '1px solid rgba(240,90,40,0.25)',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <ShippingIcon sx={{ color: BRAND.orange }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ color: BRAND.orange }}>
                    {stats?.waiting_client ?? 0} Esperando respuesta del cliente
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Clientes pendientes de contestar</Typography>
                </Box>
              </Box>

              <Box
                sx={{
                  p: 2,
                  bgcolor: verificationStats && verificationStats.pending > 0
                    ? 'rgba(33,150,243,0.08)'
                    : 'rgba(76,175,80,0.06)',
                  border: verificationStats && verificationStats.pending > 0
                    ? '1px solid rgba(33,150,243,0.35)'
                    : '1px solid rgba(76,175,80,0.25)',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  cursor: onNavigateToVerifications ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  '&:hover': onNavigateToVerifications
                    ? { bgcolor: verificationStats && verificationStats.pending > 0 ? 'rgba(33,150,243,0.14)' : 'rgba(76,175,80,0.12)' }
                    : {},
                }}
                onClick={onNavigateToVerifications}
              >
                {verificationStats && verificationStats.pending > 0
                  ? <HourglassEmptyIcon sx={{ color: '#1976D2' }} />
                  : <VerifiedUserIcon sx={{ color: '#388E3C' }} />
                }
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="subtitle2"
                    fontWeight={700}
                    sx={{ color: verificationStats && verificationStats.pending > 0 ? '#1976D2' : '#388E3C' }}
                  >
                    {verificationStats?.pending ?? 0} Verificaciones de identidad pendientes
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {onNavigateToVerifications ? 'Click para revisar' : 'Identidades por aprobar'}
                  </Typography>
                </Box>
                {verificationStats && verificationStats.pending > 0 && (
                  <Box
                    sx={{
                      bgcolor: '#1976D2',
                      color: 'white',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                      flexShrink: 0,
                    }}
                  >
                    {verificationStats.pending}
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Resumen del Día */}
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Resumen del Día
            </Typography>
            <Grid container spacing={3}>
              {[
                { value: totalOpen, label: 'Tickets Abiertos', color: BRAND.orange },
                { value: stats?.today_resolved ?? 0, label: 'Resueltos Hoy', color: BRAND.red },
                { value: stats?.client_open ?? 0, label: 'De Clientes', color: BRAND.black },
                { value: stats?.employee_open ?? 0, label: 'De Empleados', color: BRAND.darkOrange },
              ].map((item) => (
                <Grid key={item.label} size={{ xs: 6, md: 3 }}>
                  <Box
                    sx={{
                      textAlign: 'center',
                      p: 2,
                      borderRadius: 2,
                      bgcolor: `${item.color}0D`,
                      border: `1px solid ${item.color}33`,
                    }}
                  >
                    <Typography variant="h3" fontWeight={800} sx={{ color: item.color }}>
                      {item.value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {item.label}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
