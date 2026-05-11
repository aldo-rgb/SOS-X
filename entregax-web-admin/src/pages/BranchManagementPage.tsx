// ============================================
// GESTIÓN DE SUCURSALES (BRANCHES/CEDIS)
// Panel para crear, editar y asignar sucursales
// ============================================

import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
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
  Card,
  CardContent,
  Autocomplete,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warehouse as WarehouseIcon,
  PersonAdd as AssignIcon,
  CheckCircle as ActiveIcon,
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
}

const AVAILABLE_SERVICES = [
  { value: 'po_box', label: 'PO Box USA' },
  { value: 'aereo', label: 'Aéreo China (TDI)' },
  { value: 'maritimo', label: 'Marítimo China' },
  { value: 'dhl_liberacion', label: 'DHL Liberación' },
  { value: 'nacional', label: 'Nacional México' },
  { value: 'ALL', label: 'Todos los servicios' },
];

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

  // Usuarios sin sucursal asignada
  const unassignedUsers = employeeUsers.filter(u => !u.branch_id);

  // Usuarios por sucursal
  const getUsersByBranch = (branchId: number) => 
    employeeUsers.filter(u => u.branch_id === branchId);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header Corporativo */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid rgba(240,90,40,0.18)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}
      >
        <Box
          sx={{
            background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)',
            color: '#fff',
            p: { xs: 2.5, md: 3 },
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
              }}
            >
              <WarehouseIcon sx={{ fontSize: 30, color: '#fff' }} />
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: 0.3 }}>
                Gestión de Sucursales
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Administra CEDIS, mostradores y asignación de empleados
              </Typography>
            </Box>
          </Box>
          <Box display="flex" gap={1.5} flexWrap="wrap">
            <Button
              startIcon={<RefreshIcon />}
              onClick={loadData}
              sx={{
                color: '#fff',
                borderColor: 'rgba(255,255,255,0.5)',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: '#fff' },
              }}
              variant="outlined"
            >
              Refrescar
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenBranchDialog()}
              sx={{
                bgcolor: '#fff',
                color: '#C1272D',
                fontWeight: 700,
                textTransform: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                '&:hover': { bgcolor: '#FFF3EE' },
              }}
            >
              Nueva Sucursal
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Tabs Corporativos */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          borderRadius: 2,
          border: '1px solid #EEE',
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 1,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 52,
              color: 'text.secondary',
              '&.Mui-selected': { color: '#F05A28' },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#F05A28',
              height: 3,
              borderRadius: 2,
            },
          }}
        >
          <Tab label={`Sucursales (${branches.length})`} />
          <Tab label={`Asignaciones (${employeeUsers.filter(u => u.branch_id).length})`} />
          <Tab label={`Sin Asignar (${unassignedUsers.length})`} />
          <Tab label="Inventario de Activos" />
        </Tabs>
      </Paper>

      {/* Tab 0: Lista de Sucursales */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {branches.map((branch) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={branch.id}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  position: 'relative',
                  borderRadius: 2,
                  border: '1px solid #EEE',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 6px 20px rgba(240,90,40,0.12)',
                    borderColor: 'rgba(240,90,40,0.35)',
                    transform: 'translateY(-2px)',
                  },
                  '&::before': {
                    content: '\"\"',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: branch.is_active
                      ? 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)'
                      : '#CFCFCF',
                  },
                }}
              >
                <CardContent sx={{ pt: 2.5 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h6" fontWeight={800} sx={{ color: '#222' }}>
                        {branch.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Código: <strong style={{ color: '#F05A28' }}>{branch.code}</strong> • {branch.city}
                      </Typography>
                    </Box>
                    <Box>
                      <IconButton
                        size="small"
                        onClick={() => handleOpenBranchDialog(branch)}
                        sx={{ color: 'text.secondary', '&:hover': { color: '#F05A28', bgcolor: 'rgba(240,90,40,0.08)' } }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteBranch(branch.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  
                  {/* Indicador de Geocerca */}
                  <Box mt={1.5} display="flex" gap={1} flexWrap="wrap">
                    {branch.latitud && branch.longitud ? (
                      <Chip
                        icon={<LocationIcon />}
                        label={`Geocerca: ${branch.radio_geocerca_metros || 100}m`}
                        size="small"
                        sx={{
                          bgcolor: 'rgba(33,150,243,0.1)',
                          color: '#1976D2',
                          fontWeight: 600,
                          '& .MuiChip-icon': { color: '#1976D2' },
                        }}
                      />
                    ) : (
                      <Chip
                        icon={<LocationIcon />}
                        label="Sin geocerca"
                        size="small"
                        sx={{
                          bgcolor: 'rgba(240,90,40,0.1)',
                          color: '#F05A28',
                          fontWeight: 600,
                          '& .MuiChip-icon': { color: '#F05A28' },
                        }}
                      />
                    )}
                    {branch.wifi_validation_enabled && branch.wifi_ssid && (
                      <Chip
                        icon={<WifiIcon />}
                        label={`WiFi: ${branch.wifi_ssid}`}
                        size="small"
                        sx={{
                          bgcolor: 'rgba(193,39,45,0.08)',
                          color: '#C1272D',
                          fontWeight: 600,
                          '& .MuiChip-icon': { color: '#C1272D' },
                        }}
                      />
                    )}
                  </Box>
                  
                  <Box mt={2}>
                    <Typography variant="caption" color="text.secondary">Servicios:</Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                      {branch.allowed_services?.map((svc) => (
                        <Chip 
                          key={svc} 
                          label={AVAILABLE_SERVICES.find(s => s.value === svc)?.label || svc}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>

                  <Box mt={2}>
                    <Typography variant="caption" color="text.secondary">
                      Empleados: {getUsersByBranch(branch.id).length}
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                      {getUsersByBranch(branch.id).slice(0, 3).map((user) => (
                        <Chip 
                          key={user.id}
                          label={user.full_name}
                          size="small"
                          onDelete={() => handleRemoveUserFromBranch(user.id)}
                        />
                      ))}
                      {getUsersByBranch(branch.id).length > 3 && (
                        <Chip label={`+${getUsersByBranch(branch.id).length - 3} más`} size="small" />
                      )}
                    </Box>
                  </Box>

                  <Box mt={2} pt={2} sx={{ borderTop: '1px dashed #EEE' }} display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        icon={branch.is_active ? <ActiveIcon /> : <InactiveIcon />}
                        label={branch.is_active ? 'Activa' : 'Inactiva'}
                        color={branch.is_active ? 'success' : 'default'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        icon={<PaymentIcon />}
                        label={branch.recibe_pagos ? 'Recibe Pagos' : 'Sin Pagos'}
                        size="small"
                        onClick={() => handleToggleRecibePagos(branch)}
                        sx={{
                          cursor: 'pointer',
                          fontWeight: 600,
                          bgcolor: branch.recibe_pagos ? 'rgba(240,90,40,0.1)' : 'grey.200',
                          color: branch.recibe_pagos ? '#F05A28' : 'text.secondary',
                          '& .MuiChip-icon': { color: 'inherit' },
                          '&:hover': {
                            bgcolor: branch.recibe_pagos ? 'rgba(240,90,40,0.18)' : 'grey.300',
                          },
                        }}
                      />
                    </Box>
                    <Button
                      size="small"
                      startIcon={<AssignIcon />}
                      onClick={() => {
                        setSelectedBranch(branch.id);
                        setOpenAssignDialog(true);
                      }}
                      sx={{
                        color: '#F05A28',
                        textTransform: 'none',
                        fontWeight: 700,
                        '&:hover': { bgcolor: 'rgba(240,90,40,0.08)' },
                      }}
                    >
                      Asignar
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}

          {branches.length === 0 && (
            <Grid size={{ xs: 12 }}>
              <Alert severity="info">
                No hay sucursales creadas. Haz clic en "Nueva Sucursal" para crear la primera.
              </Alert>
            </Grid>
          )}
        </Grid>
      )}

      {/* Tab 1: Asignaciones actuales */}
      {tabValue === 1 && (
        <TableContainer component={Paper}>
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
                <TableRow key={user.id}>
                  <TableCell>
                    <Typography fontWeight="medium">{user.full_name}</Typography>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip label={user.role} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      icon={<WarehouseIcon />}
                      label={user.branch_name || 'N/A'}
                      color="primary"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button 
                      size="small" 
                      color="warning"
                      onClick={() => handleRemoveUserFromBranch(user.id)}
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
        <TableContainer component={Paper}>
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
                <TableRow key={user.id}>
                  <TableCell>
                    <Typography fontWeight="medium">{user.full_name}</Typography>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip label={user.role} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <Select
                        value=""
                        displayEmpty
                        onChange={(e) => {
                          setSelectedUser(user);
                          setSelectedBranch(Number(e.target.value));
                          // Auto-asignar
                          api.post('/admin/assign-branch', {
                            userId: user.id,
                            branchId: Number(e.target.value),
                          }).then(() => {
                            setSnackbar({ open: true, message: 'Asignado exitosamente', severity: 'success' });
                            loadData();
                          });
                        }}
                      >
                        <MenuItem value="" disabled>Seleccionar...</MenuItem>
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
                    <Typography color="text.secondary" py={2}>
                      Todos los empleados tienen sucursal asignada ✅
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
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)',
            color: '#fff',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <WarehouseIcon sx={{ color: '#fff' }} />
          {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            {/* --- INFORMACIÓN BÁSICA --- */}
            <Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>
              📋 Información Básica
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
            <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
              <Typography variant="subtitle2" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocationIcon fontSize="small" />
                📍 Geocerca para Check-in de Asistencia
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
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
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #ccc' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
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
              <Alert severity="info" sx={{ mt: 2 }} icon={<LocationIcon />}>
                <Typography variant="caption">
                  <strong>💡 Tip:</strong> Para obtener las coordenadas, abre Google Maps, haz clic derecho en la ubicación 
                  exacta de tu sucursal y selecciona "¿Qué hay aquí?". Las coordenadas aparecerán en la parte inferior.
                </Typography>
              </Alert>
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
        <DialogActions>
          <Button onClick={() => setOpenBranchDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveBranch}
            disabled={!branchForm.name || !branchForm.code}
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
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
      >
        <DialogTitle
          sx={{
            background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)',
            color: '#fff',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <AssignIcon sx={{ color: '#fff' }} />
          Asignar Empleado a Sucursal
        </DialogTitle>
        <DialogContent>
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
              <Alert severity="info" sx={{ mt: 2 }}>
                Se asignará a: <strong>{branches.find(b => b.id === selectedBranch)?.name}</strong>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAssignDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleAssignUser}
            disabled={!selectedUser}
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
