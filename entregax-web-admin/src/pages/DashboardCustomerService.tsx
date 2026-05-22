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
} from '@mui/icons-material';
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
    const [statsRes, ticketsRes, verifRes] = await Promise.allSettled([
      api.get('/admin/support/stats'),
      api.get('/admin/support/tickets', { params: { limit: 5, status: undefined } }),
      api.get('/admin/verifications/stats'),
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
