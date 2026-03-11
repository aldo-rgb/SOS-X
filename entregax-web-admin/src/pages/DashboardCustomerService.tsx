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
} from '@mui/icons-material';
import api from '../services/api';

interface ServiceStats {
  tickets: {
    abiertos: number;
    en_progreso: number;
    resueltos_hoy: number;
    tiempo_promedio_min: number;
  };
  clientes: {
    atendidos_hoy: number;
    nuevos_hoy: number;
    satisfaccion: number;
  };
  paquetes: {
    consultas_tracking: number;
    reclamos_pendientes: number;
    entregas_demoradas: number;
  };
}

interface RecentTicket {
  id: number;
  cliente: string;
  asunto: string;
  prioridad: 'alta' | 'media' | 'baja';
  tiempo: string;
  canal: 'chat' | 'email' | 'phone' | 'whatsapp';
}

export default function DashboardCustomerService() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ServiceStats | null>(null);
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
      const response = await api.get('/dashboard/customer-service');
      if (response.data) {
        setStats(response.data.stats);
        setRecentTickets(response.data.tickets || []);
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Datos de ejemplo
      setStats({
        tickets: { abiertos: 12, en_progreso: 5, resueltos_hoy: 18, tiempo_promedio_min: 8 },
        clientes: { atendidos_hoy: 34, nuevos_hoy: 7, satisfaccion: 94 },
        paquetes: { consultas_tracking: 45, reclamos_pendientes: 3, entregas_demoradas: 8 },
      });
      setRecentTickets([
        { id: 1, cliente: 'María García', asunto: 'Consulta de tracking', prioridad: 'media', tiempo: 'hace 5 min', canal: 'whatsapp' },
        { id: 2, cliente: 'Juan Pérez', asunto: 'Paquete no recibido', prioridad: 'alta', tiempo: 'hace 12 min', canal: 'phone' },
        { id: 3, cliente: 'Ana López', asunto: 'Cambio de dirección', prioridad: 'baja', tiempo: 'hace 20 min', canal: 'email' },
        { id: 4, cliente: 'Carlos Ruiz', asunto: 'Problema con cobro', prioridad: 'alta', tiempo: 'hace 25 min', canal: 'chat' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getChannelIcon = (canal: string) => {
    switch (canal) {
      case 'whatsapp': return <WhatsAppIcon sx={{ color: '#25D366' }} />;
      case 'phone': return <PhoneIcon sx={{ color: '#2196F3' }} />;
      case 'email': return <EmailIcon sx={{ color: '#F44336' }} />;
      case 'chat': return <ChatIcon sx={{ color: '#9C27B0' }} />;
      default: return <ChatIcon />;
    }
  };

  const getPriorityColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'error';
      case 'media': return 'warning';
      case 'baja': return 'success';
      default: return 'default';
    }
  };

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
          ¡Hola, <span style={{ color: '#F05A28' }}>{userName}</span>! 💬
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Panel de Servicio al Cliente - {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Typography>
      </Box>

      {/* KPIs Principales */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Tickets Abiertos */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Tickets Abiertos</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.tickets.abiertos || 0}</Typography>
              </Box>
              <Badge badgeContent={stats?.tickets.en_progreso || 0} color="error">
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
                <Typography variant="h3" fontWeight="bold">{stats?.tickets.resueltos_hoy || 0}</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <CheckCircleIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* Tiempo Promedio */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #2196F3 0%, #64B5F6 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Tiempo Promedio</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.tickets.tiempo_promedio_min || 0}<small>min</small></Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <AccessTimeIcon />
              </Avatar>
            </Box>
          </Paper>
        </Grid>

        {/* Satisfacción */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 3, background: 'linear-gradient(135deg, #9C27B0 0%, #BA68C8 100%)', color: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Satisfacción</Typography>
                <Typography variant="h3" fontWeight="bold">{stats?.clientes.satisfaccion || 0}%</Typography>
              </Box>
              <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)' }}>
                <TrendingUpIcon />
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
                📨 Tickets Recientes
              </Typography>
              <Button size="small" variant="outlined">Ver todos</Button>
            </Box>
            
            <List>
              {recentTickets.map((ticket, index) => (
                <Box key={ticket.id}>
                  <ListItem 
                    sx={{ 
                      py: 2,
                      '&:hover': { bgcolor: 'action.hover', borderRadius: 2 }
                    }}
                    secondaryAction={
                      <Chip 
                        label={ticket.prioridad.toUpperCase()} 
                        color={getPriorityColor(ticket.prioridad) as 'error' | 'warning' | 'info' | 'default'}
                        size="small"
                      />
                    }
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: 'grey.200' }}>
                        {getChannelIcon(ticket.canal)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2" fontWeight="bold">{ticket.cliente}</Typography>
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2" color="text.secondary">{ticket.asunto}</Typography>
                          <Typography variant="caption" color="text.secondary">{ticket.tiempo}</Typography>
                        </>
                      }
                    />
                  </ListItem>
                  {index < recentTickets.length - 1 && <Divider variant="inset" component="li" />}
                </Box>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Panel Lateral */}
        <Grid size={{ xs: 12, md: 5 }}>
          {/* Acciones Rápidas */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              ⚡ Acciones Rápidas
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
                  <CardActionArea>
                    <AssignmentIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
                    <Typography variant="body2" fontWeight="bold">Nuevo Ticket</Typography>
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
              ⚠️ Atención Requerida
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ p: 2, bgcolor: 'error.light', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <WarningIcon color="error" />
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" color="error.dark">
                    {stats?.paquetes.reclamos_pendientes || 0} Reclamos Pendientes
                  </Typography>
                  <Typography variant="caption" color="error.dark">Requieren atención urgente</Typography>
                </Box>
              </Box>
              <Box sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <ShippingIcon color="warning" />
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" color="warning.dark">
                    {stats?.paquetes.entregas_demoradas || 0} Entregas Demoradas
                  </Typography>
                  <Typography variant="caption" color="warning.dark">Clientes esperando actualización</Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Estadísticas del Día */}
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              📊 Mi Rendimiento Hoy
            </Typography>
            <Grid container spacing={3}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color="primary.main">
                    {stats?.clientes.atendidos_hoy || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Clientes Atendidos</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color="success.main">
                    {stats?.tickets.resueltos_hoy || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Tickets Resueltos</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color="info.main">
                    {stats?.paquetes.consultas_tracking || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Consultas Tracking</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color="secondary.main">
                    {stats?.clientes.nuevos_hoy || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Clientes Nuevos</Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
