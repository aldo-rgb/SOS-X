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
  Card,
  CardActionArea,
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
  Email as EmailIcon,
  Phone as PhoneIcon,
  WhatsApp as WhatsAppIcon,
  Person as PersonIcon,
  LocalShipping as ShippingIcon,
  Search as SearchIcon,
  AccessTime as AccessTimeIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  Assignment as AssignmentIcon,
  FiberNew as NewIcon,
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

interface Props {
  onNavigateToSupport?: () => void;
}

export default function DashboardCustomerService({ onNavigateToSupport }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
  const [userName, setUserName] = useState('');

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
    try {
      const [statsRes, ticketsRes] = await Promise.all([
        api.get('/admin/support/stats'),
        api.get('/admin/support/tickets', { params: { limit: 5 } }),
      ]);
      setStats(statsRes.data);
      setRecentTickets(ticketsRes.data?.tickets || ticketsRes.data || []);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      setStats(null);
    } finally {
      setLoading(false);
    }
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
      escalated_human: 'Humano',
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

  const totalOpen = (stats?.client_open ?? 0) + (stats?.employee_open ?? 0);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700}>
          ¡Hola, <span style={{ color: '#F05A28' }}>{userName}</span>!
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Panel de Servicio al Cliente - {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Typography>
      </Box>

      {/* KPIs Principales */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Tickets Abiertos */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper
            sx={{
              p: 3,
              background: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)',
              color: 'white',
              cursor: onNavigateToSupport ? 'pointer' : 'default',
              transition: 'transform 0.15s',
              '&:hover': onNavigateToSupport ? { transform: 'scale(1.02)' } : {},
            }}
            onClick={onNavigateToSupport}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Tickets Abiertos</Typography>
                <Typography variant="h3" fontWeight="bold">{totalOpen}</Typography>
                {onNavigateToSupport && (
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>Click para ver todos</Typography>
                )}
              </Box>
              <Badge badgeContent={stats?.needs_human ?? 0} color="error">
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                  <AssignmentIcon />
                </Avatar>
              </Badge>
            </Box>
          </Paper>
        </Grid>

        {/* Resueltos Hoy */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #4CAF50 0%, #81C784 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Resueltos Hoy</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.today_resolved ?? 0}</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <CheckCircleIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* Tiempo Promedio de Resolución */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #2196F3 0%, #64B5F6 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Tiempo Promedio</Typography>
                <Typography variant="h3" fontWeight="bold">
                  {stats?.avg_resolution_time_min ?? 0}<small>min</small>
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>Resolución hoy</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <AccessTimeIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* Tickets Nuevos Hoy */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #9C27B0 0%, #BA68C8 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Tickets Nuevos</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.today_new ?? 0}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>Últimas 24 horas</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <NewIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Tickets Recientes */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight="bold">
                Tickets Recientes
              </Typography>
              {onNavigateToSupport && (
                <Button size="small" variant="outlined" onClick={onNavigateToSupport}>Ver todos</Button>
              )}
            </Box>

            {recentTickets.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No hay tickets recientes
              </Typography>
            ) : (
              <List>
                {recentTickets.map((ticket, index) => (
                  <Box key={ticket.id}>
                    <ListItem
                      sx={{
                        py: 2,
                        '&:hover': { bgcolor: 'action.hover', borderRadius: 2 },
                      }}
                      secondaryAction={
                        <Chip
                          label={getStatusLabel(ticket.status)}
                          color={getStatusColor(ticket.status)}
                          size="small"
                        />
                      }
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'grey.200', color: 'text.secondary', fontSize: 12 }}>
                          <ChatIcon />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" fontWeight="bold">
                              {ticket.full_name || ticket.ticket_folio}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography variant="body2" color="text.secondary">{ticket.subject}</Typography>
                            <Typography variant="caption" color="text.secondary">{formatTimeAgo(ticket.created_at)}</Typography>
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
          {/* Acciones Rápidas */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Acciones Rápidas
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Card sx={{ textAlign: 'center', p: 2 }}>
                  <CardActionArea>
                    <SearchIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                    <Typography variant="body2" fontWeight="bold">Buscar Paquete</Typography>
                  </CardActionArea>
                </Card>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Card sx={{ textAlign: 'center', p: 2 }}>
                  <CardActionArea>
                    <PersonIcon sx={{ fontSize: 40, color: 'secondary.main', mb: 1 }} />
                    <Typography variant="body2" fontWeight="bold">Buscar Cliente</Typography>
                  </CardActionArea>
                </Card>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Card sx={{ textAlign: 'center', p: 2 }}>
                  <CardActionArea onClick={onNavigateToSupport}>
                    <AssignmentIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
                    <Typography variant="body2" fontWeight="bold">Ver Tickets</Typography>
                  </CardActionArea>
                </Card>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Card sx={{ textAlign: 'center', p: 2 }}>
                  <CardActionArea>
                    <WhatsAppIcon sx={{ fontSize: 40, color: '#25D366', mb: 1 }} />
                    <Typography variant="body2" fontWeight="bold">WhatsApp</Typography>
                  </CardActionArea>
                </Card>
              </Grid>
            </Grid>
          </Paper>

          {/* Alertas */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Atención Requerida
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'error.light',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  cursor: onNavigateToSupport ? 'pointer' : 'default',
                }}
                onClick={onNavigateToSupport}
              >
                <WarningIcon color="error" />
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" color="error.dark">
                    {stats?.needs_human ?? 0} Tickets requieren humano
                  </Typography>
                  <Typography variant="caption" color="error.dark">Escalados, requieren atención</Typography>
                </Box>
              </Box>
              <Box sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <ShippingIcon color="warning" />
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" color="warning.dark">
                    {stats?.waiting_client ?? 0} Esperando respuesta del cliente
                  </Typography>
                  <Typography variant="caption" color="warning.dark">Clientes pendientes de contestar</Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Estadísticas del Día */}
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              Resumen del Día
            </Typography>
            <Grid container spacing={3}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color="primary.main">
                    {totalOpen}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Tickets Abiertos</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color="success.main">
                    {stats?.today_resolved ?? 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Resueltos Hoy</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color="info.main">
                    {stats?.client_open ?? 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">De Clientes</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color="secondary.main">
                    {stats?.employee_open ?? 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">De Empleados</Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
