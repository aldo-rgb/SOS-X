// ============================================
// GESTIÓN DE SUCURSALES (BRANCHES/CEDIS)
// Panel para crear, editar y asignar sucursales
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Autocomplete,
  Tabs,
  Tab,
  Avatar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warehouse as WarehouseIcon,
  PersonAdd as AssignIcon,
  Cancel as InactiveIcon,
  Refresh as RefreshIcon,
  LocationOn as LocationIcon,
  Wifi as WifiIcon,
  GpsFixed as GpsIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import api from '../services/api';
import BranchAssetsInventory from '../components/BranchAssetsInventory';

interface Branch {
  id: number;
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  allowed_services: string[];
  is_active: boolean;
  created_at: string;
  // Campos de Geocerca
  latitud: number | null;
  longitud: number | null;
  radio_geocerca_metros: number;
  wifi_ssid: string | null;
  wifi_validation_enabled: boolean;
  // Pagos
  recibe_pagos: boolean;
}

interface User {
  id: number;
  full_name: string;
  email: string;
  role: string;
  branch_id: number | null;
  branch_name: string | null;
  profile_picture?: string | null;
  avatar_url?: string | null;
}

// Roles excluidos de la asignación a sucursales (cuentas administrativas)
const NON_ASSIGNABLE_ROLES = ['super_admin', 'admin'];

// Helpers de avatar (iniciales + color determinístico por id)
const AVATAR_PALETTE = ['#ff6b00', '#2196f3', '#9c27b0', '#00bcd4', '#4caf50', '#ff9800', '#e91e63', '#3f51b5', '#009688'];
const getUserInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
const getAvatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

const AVAILABLE_SERVICES = [
  { value: 'po_box', label: 'PO Box USA' },
  { value: 'aereo', label: 'Aéreo China (TDI)' },
  { value: 'maritimo', label: 'Marítimo China' },
  { value: 'dhl_liberacion', label: 'DHL Liberación' },
  { value: 'nacional', label: 'Nacional México' },
  { value: 'ALL', label: 'Todos los servicios' },
];

// Paleta Enterprise (Light Mode — admin usa fondos blancos)
const FINTECH = {
  bg: '#ffffff',          // Fondo dominante blanco
  surface: '#ffffff',     // Tarjetas blancas
  surfaceAlt: '#f7f7f9',  // Hover / acentos suaves
  border: '#e5e7eb',      // Borde fino gris claro
  borderStrong: '#cbd5e1',
  textPrimary: '#0f172a', // Casi negro
  textSecondary: '#334155',
  textMuted: '#64748b',
  orange: '#F05A28',      // Acción principal corporativa
  orangeSoft: 'rgba(240,90,40,0.10)',
};

// Color-coding de servicios (tags refinados)
const SERVICE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  aereo:          { bg: 'rgba(56,139,253,0.12)',  color: '#7BB6FF', border: 'rgba(56,139,253,0.35)' },
  maritimo:       { bg: 'rgba(35,87,137,0.18)',   color: '#6FA8DC', border: 'rgba(35,87,137,0.5)'   },
  nacional:       { bg: 'rgba(46,160,67,0.12)',   color: '#7EE787', border: 'rgba(46,160,67,0.35)'  },
  po_box:         { bg: 'rgba(163,113,247,0.12)', color: '#C8A8FF', border: 'rgba(163,113,247,0.35)'},
  dhl_liberacion: { bg: 'rgba(248,81,73,0.12)',   color: '#FFA198', border: 'rgba(248,81,73,0.35)'  },
  ALL:            { bg: 'rgba(255,107,0,0.12)',   color: '#FFB070', border: 'rgba(255,107,0,0.35)'  },
};
const getServiceStyle = (svc: string) => SERVICE_STYLE[svc] || { bg: '#1f1f24', color: '#bdbdc4', border: '#33333a' };

export default function BranchManagementPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  
  // Estados para dialogs
  const [openBranchDialog, setOpenBranchDialog] = useState(false);
  const [openAssignDialog, setOpenAssignDialog] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  
  // Estados para formulario de sucursal
  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    city: '',
    address: '',
    phone: '',
    allowed_services: [] as string[],
    is_active: true,
    // Campos de geocerca
    latitud: '' as string | number,
    longitud: '' as string | number,
    radio_geocerca_metros: 100,
    wifi_ssid: '',
    wifi_validation_enabled: false,
    // Pagos
    recibe_pagos: true,
  });
  
  // Estados para asignación
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [branchesRes, usersRes] = await Promise.all([
        api.get('/admin/branches'),
        api.get('/admin/users?include_branch=true'),
      ]);
      setBranches(branchesRes.data.branches || branchesRes.data || []);
      setUsers(usersRes.data.users || usersRes.data || []);
    } catch (err) {
      console.error('Error loading data:', err);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBranchDialog = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setBranchForm({
        name: branch.name,
        code: branch.code,
        city: branch.city,
        address: branch.address || '',
        phone: branch.phone || '',
        allowed_services: branch.allowed_services || [],
        is_active: branch.is_active,
        // Geocerca
        latitud: branch.latitud || '',
        longitud: branch.longitud || '',
        radio_geocerca_metros: branch.radio_geocerca_metros || 100,
        wifi_ssid: branch.wifi_ssid || '',
        wifi_validation_enabled: branch.wifi_validation_enabled || false,
        // Pagos
        recibe_pagos: branch.recibe_pagos !== false,
      });
    } else {
      setEditingBranch(null);
      setBranchForm({
        name: '',
        code: '',
        city: '',
        address: '',
        phone: '',
        allowed_services: [],
        is_active: true,
        // Geocerca defaults
        latitud: '',
        longitud: '',
        radio_geocerca_metros: 100,
        wifi_ssid: '',
        wifi_validation_enabled: false,
        // Pagos
        recibe_pagos: true,
      });
    }
    setOpenBranchDialog(true);
  };

  const handleSaveBranch = async () => {
    try {
      // Preparar datos con conversión de tipos para geocerca
      const dataToSend = {
        ...branchForm,
        latitud: branchForm.latitud !== '' ? parseFloat(String(branchForm.latitud)) : null,
        longitud: branchForm.longitud !== '' ? parseFloat(String(branchForm.longitud)) : null,
        radio_geocerca_metros: branchForm.radio_geocerca_metros || 100,
        wifi_ssid: branchForm.wifi_ssid || null,
      };
      
      if (editingBranch) {
        await api.put(`/admin/branches/${editingBranch.id}`, dataToSend);
        setSnackbar({ open: true, message: 'Sucursal actualizada exitosamente', severity: 'success' });
      } else {
        await api.post('/admin/branches', dataToSend);
        setSnackbar({ open: true, message: 'Sucursal creada exitosamente', severity: 'success' });
      }
      setOpenBranchDialog(false);
      loadData();
    } catch (err) {
      console.error('Error saving branch:', err);
      setSnackbar({ open: true, message: 'Error al guardar sucursal', severity: 'error' });
    }
  };

  const handleDeleteBranch = async (branchId: number) => {
    if (!confirm('¿Estás seguro de eliminar esta sucursal? Los empleados asignados quedarán sin sucursal.')) {
      return;
    }
    try {
      await api.delete(`/admin/branches/${branchId}`);
      setSnackbar({ open: true, message: 'Sucursal eliminada', severity: 'success' });
      loadData();
    } catch (err) {
      console.error('Error deleting branch:', err);
      setSnackbar({ open: true, message: 'Error al eliminar sucursal', severity: 'error' });
    }
  };

  const handleAssignUser = async () => {
    if (!selectedUser || selectedBranch === null) return;
    
    try {
      await api.post('/admin/assign-branch', {
        userId: selectedUser.id,
        branchId: selectedBranch,
      });
      setSnackbar({ 
        open: true, 
        message: `${selectedUser.full_name} asignado exitosamente`, 
        severity: 'success' 
      });
      setOpenAssignDialog(false);
      setSelectedUser(null);
      setSelectedBranch(null);
      loadData();
    } catch (err) {
      console.error('Error assigning user:', err);
      setSnackbar({ open: true, message: 'Error al asignar empleado', severity: 'error' });
    }
  };

  const handleRemoveUserFromBranch = async (userId: number) => {
    try {
      await api.post('/admin/assign-branch', {
        userId,
        branchId: null, // Remover asignación
      });
      setSnackbar({ open: true, message: 'Empleado removido de sucursal', severity: 'success' });
      loadData();
    } catch (err) {
      console.error('Error removing user:', err);
      setSnackbar({ open: true, message: 'Error al remover empleado', severity: 'error' });
    }
  };

  // Toggle rápido de recibe_pagos
  const handleToggleRecibePagos = async (branch: Branch) => {
    try {
      await api.put(`/admin/branches/${branch.id}`, {
        recibe_pagos: !branch.recibe_pagos,
      });
      setSnackbar({ 
        open: true, 
        message: branch.recibe_pagos 
          ? `${branch.name}: Pagos desactivados` 
          : `${branch.name}: Pagos activados`, 
        severity: 'success' 
      });
      loadData();
    } catch (err) {
      console.error('Error toggling recibe_pagos:', err);
      setSnackbar({ open: true, message: 'Error al actualizar configuración de pagos', severity: 'error' });
    }
  };

  // Filtrar usuarios que no son clientes (solo empleados/admins)
  // Incluye todos los roles internos: gerentes de sucursal, operaciones, mostrador, repartidores, etc.
  const EMPLOYEE_ROLES = [
    'super_admin', 'admin', 'director',
    'branch_manager',       // Gerente de Sucursal
    'warehouse_ops',        // Operaciones / Bodega
    'operations',           // Operaciones (alias)
    'counter_staff',        // Mostrador
    'customer_service', 'support',
    'sales',
    'driver', 'repartidor',
    'manager',
    'monitoreo',            // Monitoreo (observación)
    'abogado',              // Abogado
    'accountant', 'contador', // Contador
    // Asesores NO van en gestión de sucursales — no están adscritos
    // a una CEDIS, atienden cartera de clientes propios. Se administran
    // desde el panel de asesores. (Cliente lo solicitó explícitamente.)
    // 'advisor', 'asesor', 'asesor_lider', 'sub_advisor',
  ];
  const employeeUsers = users.filter(u => EMPLOYEE_ROLES.includes(u.role));

  // Usuarios sin sucursal asignada (excluyendo cuentas super_admin/admin
  // que no deben asignarse a una sucursal específica)
  const unassignedUsers = employeeUsers.filter(
    u => !u.branch_id && !NON_ASSIGNABLE_ROLES.includes(u.role)
  );

  // Usuarios por sucursal
  const getUsersByBranch = (branchId: number) => 
    employeeUsers.filter(u => u.branch_id === branchId);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px" sx={{ bgcolor: FINTECH.bg }}>
        <CircularProgress sx={{ color: FINTECH.orange }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        bgcolor: FINTECH.bg,
        color: FINTECH.textPrimary,
        py: { xs: 1, md: 2 },
        fontFeatureSettings: '"ss01","cv11"',
      }}
    >
      {/* Header minimalista fintech */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          mb: 4,
          pb: 3,
          borderBottom: `1px solid ${FINTECH.border}`,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              color: FINTECH.orange,
              textTransform: 'uppercase',
              mb: 0.5,
            }}
          >
            EntregaX · Operations
          </Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 700, color: FINTECH.textPrimary, letterSpacing: -0.5 }}>
            Gestión de Sucursales
          </Typography>
          <Typography sx={{ fontSize: 14, color: FINTECH.textSecondary, mt: 0.5 }}>
            Administra CEDIS, mostradores y asignación de empleados desde un solo lugar.
          </Typography>
        </Box>
        <Box display="flex" gap={1.5} flexWrap="wrap">
          <Button
            startIcon={<RefreshIcon sx={{ fontSize: 18 }} />}
            onClick={loadData}
            sx={{
              color: FINTECH.textSecondary,
              borderColor: FINTECH.border,
              border: `1px solid ${FINTECH.border}`,
              bgcolor: FINTECH.surface,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 13,
              px: 2,
              height: 38,
              borderRadius: 1.5,
              '&:hover': { bgcolor: FINTECH.surfaceAlt, borderColor: FINTECH.borderStrong },
            }}
          >
            Refrescar
          </Button>
          <Button
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => handleOpenBranchDialog()}
            sx={{
              bgcolor: FINTECH.orange,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              textTransform: 'none',
              px: 2.5,
              height: 38,
              borderRadius: 1.5,
              boxShadow: '0 4px 14px rgba(255,107,0,0.35)',
              '&:hover': { bgcolor: '#ff7d20', boxShadow: '0 6px 18px rgba(255,107,0,0.45)' },
            }}
          >
            Nueva Sucursal
          </Button>
        </Box>
      </Box>

      {/* Tabs Fintech */}
      <Box
        sx={{
          mb: 3.5,
          borderBottom: `1px solid ${FINTECH.border}`,
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 42,
            '& .MuiTab-root': {
              textTransform: 'uppercase',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: 1.5,
              minHeight: 42,
              px: 2.5,
              color: FINTECH.textMuted,
              '&.Mui-selected': { color: FINTECH.textPrimary },
              '&:hover': { color: FINTECH.textSecondary },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: FINTECH.orange,
              height: 2,
            },
          }}
        >
          <Tab label={`SUCURSALES · ${branches.length}`} />
          <Tab label={`ASIGNACIONES · ${employeeUsers.filter(u => u.branch_id).length}`} />
          <Tab label={`SIN ASIGNAR · ${unassignedUsers.length}`} />
          <Tab label="INVENTARIO DE ACTIVOS" />
        </Tabs>
      </Box>

      {/* Tab 0: Lista de Sucursales */}
      {tabValue === 0 && (
        <Grid container spacing={2.5}>
          {branches.map((branch) => {
            const branchUsers = getUsersByBranch(branch.id);
            const visibleUsers = branchUsers.slice(0, 3);
            const extraUsers = branchUsers.length - visibleUsers.length;
            return (
              <Grid size={{ xs: 12, md: 6, lg: 4 }} key={branch.id}>
                <Box
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: FINTECH.surface,
                    border: `1px solid ${FINTECH.border}`,
                    borderRadius: 2,
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'border-color .15s ease, transform .15s ease, box-shadow .15s ease',
                    '&:hover': {
                      borderColor: FINTECH.borderStrong,
                      transform: 'translateY(-2px)',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                    },
                  }}
                >
                  {/* ─── Encabezado ─── */}
                  <Box sx={{ p: 2.5, pb: 2 }}>
                    <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          sx={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 1.5,
                            color: FINTECH.textMuted,
                            textTransform: 'uppercase',
                            display: 'flex',
                            gap: 0.75,
                            alignItems: 'center',
                          }}
                        >
                          CÓDIGO
                          <Box component="span" sx={{ color: FINTECH.orange, fontWeight: 800, letterSpacing: 1.5 }}>
                            {branch.code}
                          </Box>
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: FINTECH.textPrimary,
                            mt: 0.5,
                            lineHeight: 1.2,
                            letterSpacing: -0.3,
                          }}
                        >
                          {branch.name}
                        </Typography>
                      </Box>
                      <Box display="flex" gap={0.25}>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenBranchDialog(branch)}
                          sx={{
                            color: FINTECH.textMuted,
                            width: 30,
                            height: 30,
                            '&:hover': { color: FINTECH.textPrimary, bgcolor: FINTECH.surfaceAlt },
                          }}
                        >
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteBranch(branch.id)}
                          sx={{
                            color: FINTECH.textMuted,
                            width: 30,
                            height: 30,
                            '&:hover': { color: '#d32f2f', bgcolor: 'rgba(211,47,47,0.08)' },
                          }}
                        >
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                    </Box>

                    {/* Metadatos: city · wifi · geocerca */}
                    <Box
                      sx={{
                        mt: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap',
                        fontSize: 12,
                        color: FINTECH.textSecondary,
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <LocationIcon sx={{ fontSize: 14, color: FINTECH.textMuted }} />
                        <Box component="span">{branch.city || '—'}</Box>
                      </Box>
                      {branch.wifi_validation_enabled && branch.wifi_ssid && (
                        <>
                          <Box component="span" sx={{ color: FINTECH.border }}>|</Box>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <WifiIcon sx={{ fontSize: 14, color: FINTECH.textMuted }} />
                            <Box component="span">WiFi: {branch.wifi_ssid}</Box>
                          </Box>
                        </>
                      )}
                      <Box component="span" sx={{ color: FINTECH.border }}>|</Box>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <GpsIcon sx={{ fontSize: 14, color: branch.latitud && branch.longitud ? FINTECH.orange : FINTECH.textMuted }} />
                        <Box component="span">
                          {branch.latitud && branch.longitud
                            ? `Geocerca: ${branch.radio_geocerca_metros || 100}m`
                            : 'Sin geocerca'}
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ height: '1px', bgcolor: FINTECH.border }} />

                  {/* ─── Servicios ─── */}
                  <Box sx={{ px: 2.5, py: 2 }}>
                    <Typography
                      sx={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 1.5,
                        color: FINTECH.textMuted,
                        textTransform: 'uppercase',
                        mb: 1,
                      }}
                    >
                      Servicios
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.75}>
                      {(branch.allowed_services?.length ? branch.allowed_services : ['—']).map((svc) => {
                        const style = getServiceStyle(svc);
                        return (
                          <Box
                            key={svc}
                            sx={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              px: 1.25,
                              py: 0.4,
                              borderRadius: 0.75,
                              bgcolor: style.bg,
                              color: style.color,
                              border: `1px solid ${style.border}`,
                              letterSpacing: 0.2,
                            }}
                          >
                            {AVAILABLE_SERVICES.find(s => s.value === svc)?.label || svc}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>

                  <Box sx={{ height: '1px', bgcolor: FINTECH.border }} />

                  {/* ─── Empleados ─── */}
                  <Box sx={{ px: 2.5, py: 2, flex: 1 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                      <Typography
                        sx={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 1.5,
                          color: FINTECH.textMuted,
                          textTransform: 'uppercase',
                        }}
                      >
                        Empleados · {branchUsers.length}
                      </Typography>
                    </Box>
                    {branchUsers.length === 0 ? (
                      <Typography sx={{ fontSize: 12.5, color: FINTECH.textMuted, fontStyle: 'italic' }}>
                        Sin empleados asignados
                      </Typography>
                    ) : (
                      <Box display="flex" flexDirection="column" gap={0.75}>
                        {visibleUsers.map((u) => (
                          <Box
                            key={u.id}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 1,
                              fontSize: 13,
                              color: FINTECH.textSecondary,
                              py: 0.25,
                              '&:hover .remove-btn': { opacity: 1 },
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                              <Avatar
                                src={u.profile_picture || u.avatar_url || undefined}
                                sx={{
                                  width: 24,
                                  height: 24,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  bgcolor: getAvatarColor(u.id),
                                  color: '#fff',
                                  border: `1px solid ${FINTECH.border}`,
                                  flexShrink: 0,
                                }}
                              >
                                {getUserInitials(u.full_name)}
                              </Avatar>
                              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {u.full_name}
                              </Box>
                            </Box>
                            <IconButton
                              className="remove-btn"
                              size="small"
                              onClick={() => handleRemoveUserFromBranch(u.id)}
                              sx={{
                                opacity: 0,
                                transition: 'opacity .15s ease',
                                width: 20,
                                height: 20,
                                color: FINTECH.textMuted,
                                '&:hover': { color: '#d32f2f' },
                              }}
                            >
                              <InactiveIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Box>
                        ))}
                        {extraUsers > 0 && (
                          <Box
                            sx={{
                              fontSize: 12.5,
                              color: FINTECH.textMuted,
                              mt: 0.5,
                              display: 'flex',
                              gap: 1,
                              alignItems: 'center',
                            }}
                          >
                            <Box component="span">y +{extraUsers} colaboradores más</Box>
                            <Box
                              component="span"
                              onClick={() => setTabValue(1)}
                              sx={{
                                color: FINTECH.orange,
                                cursor: 'pointer',
                                fontWeight: 600,
                                '&:hover': { textDecoration: 'underline' },
                              }}
                            >
                              Ver todos →
                            </Box>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>

                  {/* ─── Barra inferior: Status + Acciones ─── */}
                  <Box
                    sx={{
                      borderTop: `1px solid ${FINTECH.border}`,
                      bgcolor: FINTECH.surfaceAlt,
                      px: 2.5,
                      py: 1.5,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Box display="flex" gap={0.75} alignItems="center" flexWrap="wrap">
                      <Box
                        sx={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                          px: 1,
                          py: 0.3,
                          borderRadius: 10,
                          bgcolor: branch.is_active ? 'rgba(46,160,67,0.15)' : 'rgba(138,138,147,0.15)',
                          color: branch.is_active ? '#7EE787' : FINTECH.textMuted,
                          border: `1px solid ${branch.is_active ? 'rgba(46,160,67,0.35)' : FINTECH.border}`,
                        }}
                      >
                        {branch.is_active ? '● Activa' : '○ Inactiva'}
                      </Box>
                      <Box
                        onClick={() => handleToggleRecibePagos(branch)}
                        sx={{
                          cursor: 'pointer',
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                          px: 1,
                          py: 0.3,
                          borderRadius: 10,
                          bgcolor: branch.recibe_pagos ? 'rgba(248,81,73,0.12)' : 'rgba(138,138,147,0.12)',
                          color: branch.recibe_pagos ? '#FFA198' : FINTECH.textMuted,
                          border: `1px solid ${branch.recibe_pagos ? 'rgba(248,81,73,0.32)' : FINTECH.border}`,
                          transition: 'background .15s ease',
                          '&:hover': {
                            bgcolor: branch.recibe_pagos ? 'rgba(248,81,73,0.2)' : 'rgba(138,138,147,0.2)',
                          },
                        }}
                      >
                        {branch.recibe_pagos ? 'Recibe Pagos' : 'Sin Pagos'}
                      </Box>
                    </Box>
                    <Button
                      size="small"
                      onClick={() => {
                        setSelectedBranch(branch.id);
                        setOpenAssignDialog(true);
                      }}
                      startIcon={<AssignIcon sx={{ fontSize: 16 }} />}
                      sx={{
                        bgcolor: FINTECH.orange,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'none',
                        px: 1.75,
                        height: 30,
                        borderRadius: 1,
                        boxShadow: 'none',
                        '&:hover': { bgcolor: '#ff7d20', boxShadow: '0 4px 12px rgba(255,107,0,0.35)' },
                      }}
                    >
                      Asignar
                    </Button>
                  </Box>
                </Box>
              </Grid>
            );
          })}

          {branches.length === 0 && (
            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  p: 4,
                  textAlign: 'center',
                  bgcolor: FINTECH.surface,
                  border: `1px dashed ${FINTECH.border}`,
                  borderRadius: 2,
                  color: FINTECH.textSecondary,
                }}
              >
                No hay sucursales creadas. Haz clic en "Nueva Sucursal" para crear la primera.
              </Box>
            </Grid>
          )}
        </Grid>
      )}

      {/* Tab 1: Asignaciones actuales */}
      {tabValue === 1 && (
        <TableContainer
          sx={{
            bgcolor: FINTECH.surface,
            border: `1px solid ${FINTECH.border}`,
            borderRadius: 2,
            '& .MuiTableCell-root': { borderColor: FINTECH.border, color: FINTECH.textSecondary, fontSize: 13 },
            '& .MuiTableCell-head': { color: FINTECH.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', bgcolor: FINTECH.surfaceAlt },
          }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Empleado</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>Sucursal Asignada</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employeeUsers.filter(u => u.branch_id).map((user) => (
                <TableRow key={user.id} sx={{ '&:hover': { bgcolor: FINTECH.surfaceAlt } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        src={user.profile_picture || user.avatar_url || undefined}
                        sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: getAvatarColor(user.id), color: '#fff', border: `1px solid ${FINTECH.border}` }}
                      >
                        {getUserInitials(user.full_name)}
                      </Avatar>
                      <Typography sx={{ fontWeight: 600, color: FINTECH.textPrimary }}>{user.full_name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'inline-block', fontSize: 11, fontWeight: 600, px: 1, py: 0.3, borderRadius: 0.75, bgcolor: FINTECH.surfaceAlt, color: FINTECH.textSecondary, border: `1px solid ${FINTECH.border}` }}>
                      {user.role}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, fontWeight: 600, px: 1, py: 0.3, borderRadius: 0.75, bgcolor: FINTECH.orangeSoft, color: FINTECH.orange, border: `1px solid rgba(255,107,0,0.3)` }}>
                      <WarehouseIcon sx={{ fontSize: 13 }} /> {user.branch_name || 'N/A'}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      onClick={() => handleRemoveUserFromBranch(user.id)}
                      sx={{ color: '#d32f2f', textTransform: 'none', fontSize: 12, fontWeight: 600, '&:hover': { bgcolor: 'rgba(211,47,47,0.08)' } }}
                    >
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 2: Sin asignar */}
      {tabValue === 2 && (
        <TableContainer
          sx={{
            bgcolor: FINTECH.surface,
            border: `1px solid ${FINTECH.border}`,
            borderRadius: 2,
            '& .MuiTableCell-root': { borderColor: FINTECH.border, color: FINTECH.textSecondary, fontSize: 13 },
            '& .MuiTableCell-head': { color: FINTECH.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', bgcolor: FINTECH.surfaceAlt },
          }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Empleado</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell align="right">Asignar a</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {unassignedUsers.map((user) => (
                <TableRow key={user.id} sx={{ '&:hover': { bgcolor: FINTECH.surfaceAlt } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        src={user.profile_picture || user.avatar_url || undefined}
                        sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: getAvatarColor(user.id), color: '#fff', border: `1px solid ${FINTECH.border}` }}
                      >
                        {getUserInitials(user.full_name)}
                      </Avatar>
                      <Typography sx={{ fontWeight: 600, color: FINTECH.textPrimary }}>{user.full_name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'inline-block', fontSize: 11, fontWeight: 600, px: 1, py: 0.3, borderRadius: 0.75, bgcolor: FINTECH.surfaceAlt, color: FINTECH.textSecondary, border: `1px solid ${FINTECH.border}` }}>
                      {user.role}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <FormControl
                      size="small"
                      sx={{
                        minWidth: 180,
                        '& .MuiOutlinedInput-root': {
                          color: FINTECH.textPrimary,
                          bgcolor: FINTECH.surfaceAlt,
                          fontSize: 13,
                          '& fieldset': { borderColor: FINTECH.border },
                          '&:hover fieldset': { borderColor: FINTECH.borderStrong },
                          '&.Mui-focused fieldset': { borderColor: FINTECH.orange },
                        },
                        '& .MuiSvgIcon-root': { color: FINTECH.textMuted },
                      }}
                    >
                      <Select
                        value=""
                        displayEmpty
                        onChange={(e) => {
                          setSelectedUser(user);
                          setSelectedBranch(Number(e.target.value));
                          api.post('/admin/assign-branch', {
                            userId: user.id,
                            branchId: Number(e.target.value),
                          }).then(() => {
                            setSnackbar({ open: true, message: 'Asignado exitosamente', severity: 'success' });
                            loadData();
                          });
                        }}
                      >
                        <MenuItem value="" disabled>Seleccionar sucursal…</MenuItem>
                        {branches.filter(b => b.is_active).map((branch) => (
                          <MenuItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                </TableRow>
              ))}
              {unassignedUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography sx={{ color: FINTECH.textMuted, py: 2 }}>
                      Todos los empleados tienen sucursal asignada ✓
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialog: Crear/Editar Sucursal */}
      <Dialog
        open={openBranchDialog}
        onClose={() => setOpenBranchDialog(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: FINTECH.surface,
            color: FINTECH.textPrimary,
            border: `1px solid ${FINTECH.border}`,
          },
        }}
      >
        <DialogTitle
          sx={{
            bgcolor: FINTECH.bg,
            color: FINTECH.textPrimary,
            fontWeight: 700,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: `1px solid ${FINTECH.border}`,
          }}
        >
          <Box sx={{ width: 4, height: 22, bgcolor: FINTECH.orange, borderRadius: 0.5 }} />
          {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
        </DialogTitle>
        <DialogContent
          sx={{
            bgcolor: FINTECH.surface,
            pt: 3,
            '& .MuiInputBase-root': { color: FINTECH.textPrimary, bgcolor: FINTECH.surfaceAlt },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: FINTECH.border },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: FINTECH.borderStrong },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: FINTECH.orange },
            '& .MuiInputLabel-root': { color: FINTECH.textMuted },
            '& .MuiInputLabel-root.Mui-focused': { color: FINTECH.orange },
            '& .MuiFormHelperText-root': { color: FINTECH.textMuted },
            '& .MuiSvgIcon-root': { color: FINTECH.textMuted },
            '& .MuiSwitch-track': { bgcolor: FINTECH.borderStrong },
            '& .MuiFormControlLabel-label': { color: FINTECH.textSecondary },
            '& .MuiTypography-root': { color: 'inherit' },
          }}
        >
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            {/* --- INFORMACIÓN BÁSICA --- */}
            <Typography variant="subtitle2" sx={{ mt: 1, color: FINTECH.orange, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 }}>
              Información Básica
            </Typography>
            
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 8 }}>
                <TextField
                  label="Nombre de la Sucursal"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder="Ej: CEDIS Monterrey"
                  fullWidth
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  label="Código"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                  placeholder="Ej: MTY"
                  fullWidth
                  required
                  inputProps={{ maxLength: 10 }}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Ciudad"
                  value={branchForm.city}
                  onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                  placeholder="Ej: Monterrey, Hidalgo TX, etc."
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Teléfono"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  placeholder="81 1234 5678"
                  fullWidth
                />
              </Grid>
            </Grid>

            <TextField
              label="Dirección"
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
              placeholder="Dirección completa"
              fullWidth
              multiline
              rows={2}
            />

            <FormControl fullWidth>
              <InputLabel>Servicios Permitidos</InputLabel>
              <Select
                multiple
                value={branchForm.allowed_services}
                onChange={(e) => setBranchForm({ 
                  ...branchForm, 
                  allowed_services: e.target.value as string[] 
                })}
                renderValue={(selected) => (
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {(selected as string[]).map((value) => (
                      <Chip 
                        key={value} 
                        label={AVAILABLE_SERVICES.find(s => s.value === value)?.label || value}
                        size="small"
                      />
                    ))}
                  </Box>
                )}
              >
                {AVAILABLE_SERVICES.map((svc) => (
                  <MenuItem key={svc.value} value={svc.value}>
                    {svc.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* --- GEOCERCA (GEOFENCE) --- */}
            <Box sx={{ mt: 2, p: 2, bgcolor: FINTECH.bg, border: `1px solid ${FINTECH.border}`, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: FINTECH.orange, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 11 }}>
                <LocationIcon fontSize="small" />
                Geocerca para Check-in de Asistencia
              </Typography>
              <Typography variant="caption" sx={{ mb: 2, mt: 0.5, display: 'block', color: FINTECH.textMuted }}>
                Configura las coordenadas de la sucursal para validar que los empleados estén físicamente en el lugar al registrar su entrada.
              </Typography>
              
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Latitud"
                    type="number"
                    value={branchForm.latitud}
                    onChange={(e) => setBranchForm({ ...branchForm, latitud: e.target.value })}
                    placeholder="Ej: 25.686614"
                    fullWidth
                    InputProps={{
                      startAdornment: <GpsIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                    }}
                    inputProps={{ step: '0.000001' }}
                    helperText="Coordenada Norte/Sur"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Longitud"
                    type="number"
                    value={branchForm.longitud}
                    onChange={(e) => setBranchForm({ ...branchForm, longitud: e.target.value })}
                    placeholder="Ej: -100.316112"
                    fullWidth
                    InputProps={{
                      startAdornment: <GpsIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                    }}
                    inputProps={{ step: '0.000001' }}
                    helperText="Coordenada Este/Oeste"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Radio de Tolerancia"
                    type="number"
                    value={branchForm.radio_geocerca_metros}
                    onChange={(e) => setBranchForm({ ...branchForm, radio_geocerca_metros: parseInt(e.target.value) || 100 })}
                    fullWidth
                    InputProps={{
                      endAdornment: <Typography variant="caption" sx={{ ml: 1 }}>metros</Typography>,
                    }}
                    inputProps={{ min: 20, max: 500 }}
                    helperText="Recomendado: 50-100m"
                  />
                </Grid>
              </Grid>

              {/* Validación por WiFi (Plan B) */}
              <Box sx={{ mt: 2, pt: 2, borderTop: `1px dashed ${FINTECH.border}` }}>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: FINTECH.textMuted }}>
                  <WifiIcon fontSize="small" />
                  Validación alternativa por WiFi
                </Typography>
                <Grid container spacing={2} alignItems="center">
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Nombre de Red WiFi (SSID)"
                      value={branchForm.wifi_ssid}
                      onChange={(e) => setBranchForm({ ...branchForm, wifi_ssid: e.target.value })}
                      placeholder="Ej: EntregaX-Oficina"
                      fullWidth
                      size="small"
                      helperText="Si el GPS falla, valida por conexión WiFi"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={branchForm.wifi_validation_enabled}
                          onChange={(e) => setBranchForm({ ...branchForm, wifi_validation_enabled: e.target.checked })}
                        />
                      }
                      label="Habilitar validación WiFi"
                    />
                  </Grid>
                </Grid>
              </Box>
              
              {/* Tip de ayuda */}
              <Box sx={{ mt: 2, p: 1.5, borderRadius: 1, bgcolor: 'rgba(56,139,253,0.08)', border: '1px solid rgba(56,139,253,0.25)', display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <LocationIcon sx={{ fontSize: 16, color: '#7BB6FF', mt: 0.2 }} />
                <Typography variant="caption" sx={{ color: FINTECH.textSecondary, lineHeight: 1.5 }}>
                  <strong style={{ color: '#7BB6FF' }}>Tip:</strong> Para obtener las coordenadas, abre Google Maps, haz clic derecho en la ubicación
                  exacta de tu sucursal y selecciona “¿Qué hay aquí?”. Las coordenadas aparecerán en la parte inferior.
                </Typography>
              </Box>
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={branchForm.is_active}
                  onChange={(e) => setBranchForm({ ...branchForm, is_active: e.target.checked })}
                />
              }
              label="Sucursal Activa"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={branchForm.recibe_pagos}
                  onChange={(e) => setBranchForm({ ...branchForm, recibe_pagos: e.target.checked })}
                  color="info"
                />
              }
              label={
                <Box display="flex" alignItems="center" gap={1}>
                  <PaymentIcon fontSize="small" />
                  Recibe Pagos de Clientes
                </Box>
              }
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ bgcolor: FINTECH.surface, borderTop: `1px solid ${FINTECH.border}`, px: 3, py: 2 }}>
          <Button
            onClick={() => setOpenBranchDialog(false)}
            sx={{ color: FINTECH.textSecondary, textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: FINTECH.surfaceAlt } }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSaveBranch}
            disabled={!branchForm.name || !branchForm.code}
            sx={{
              bgcolor: FINTECH.orange,
              color: '#fff',
              fontWeight: 700,
              textTransform: 'none',
              px: 2.5,
              '&:hover': { bgcolor: '#ff7d20' },
              '&.Mui-disabled': { bgcolor: FINTECH.surfaceAlt, color: FINTECH.textMuted },
            }}
          >
            {editingBranch ? 'Guardar Cambios' : 'Crear Sucursal'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Asignar Empleado */}
      <Dialog
        open={openAssignDialog}
        onClose={() => setOpenAssignDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: FINTECH.surface,
            color: FINTECH.textPrimary,
            border: `1px solid ${FINTECH.border}`,
          },
        }}
      >
        <DialogTitle
          sx={{
            bgcolor: FINTECH.bg,
            color: FINTECH.textPrimary,
            fontWeight: 700,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: `1px solid ${FINTECH.border}`,
          }}
        >
          <Box sx={{ width: 4, height: 22, bgcolor: FINTECH.orange, borderRadius: 0.5 }} />
          Asignar Empleado a Sucursal
        </DialogTitle>
        <DialogContent
          sx={{
            bgcolor: FINTECH.surface,
            pt: 3,
            '& .MuiInputBase-root': { color: FINTECH.textPrimary, bgcolor: FINTECH.surfaceAlt },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: FINTECH.border },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: FINTECH.borderStrong },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: FINTECH.orange },
            '& .MuiInputLabel-root': { color: FINTECH.textMuted },
            '& .MuiInputLabel-root.Mui-focused': { color: FINTECH.orange },
            '& .MuiSvgIcon-root': { color: FINTECH.textMuted },
          }}
        >
          <Box mt={2}>
            <Autocomplete
              options={unassignedUsers}
              getOptionLabel={(option) => `${option.full_name} (${option.email})`}
              value={selectedUser}
              onChange={(_, value) => setSelectedUser(value)}
              renderInput={(params) => (
                <TextField {...params} label="Seleccionar Empleado" placeholder="Buscar..." />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box>
                    <Typography>{option.full_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.email} • {option.role}
                    </Typography>
                  </Box>
                </li>
              )}
            />

            {selectedBranch && (
              <Box sx={{ mt: 2, p: 1.5, borderRadius: 1, bgcolor: FINTECH.orangeSoft, border: `1px solid rgba(255,107,0,0.3)`, color: FINTECH.textSecondary, fontSize: 13 }}>
                Se asignará a: <strong style={{ color: FINTECH.orange }}>{branches.find(b => b.id === selectedBranch)?.name}</strong>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ bgcolor: FINTECH.surface, borderTop: `1px solid ${FINTECH.border}`, px: 3, py: 2 }}>
          <Button
            onClick={() => setOpenAssignDialog(false)}
            sx={{ color: FINTECH.textSecondary, textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: FINTECH.surfaceAlt } }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleAssignUser}
            disabled={!selectedUser}
            sx={{
              bgcolor: FINTECH.orange,
              color: '#fff',
              fontWeight: 700,
              textTransform: 'none',
              px: 2.5,
              '&:hover': { bgcolor: '#ff7d20' },
              '&.Mui-disabled': { bgcolor: FINTECH.surfaceAlt, color: FINTECH.textMuted },
            }}
          >
            Asignar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tab 3: Inventario de activos por sucursal */}
      {tabValue === 3 && (
        <BranchAssetsInventory branches={branches} users={users} />
      )}

      {/* Snackbar */}
      {snackbar.open && (
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          sx={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999 }}
        >
          {snackbar.message}
        </Alert>
      )}
    </Box>
  );
}
