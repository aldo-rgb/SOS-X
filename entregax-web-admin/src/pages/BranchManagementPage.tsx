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
} from '@mui/icons-material';
import api from '../services/api';

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

const MEXICAN_CITIES = [
  'Monterrey',
  'Ciudad de México',
  'Guadalajara',
  'Querétaro',
  'Tijuana',
  'León',
  'Puebla',
  'Mérida',
  'Cancún',
  'Aguascalientes',
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

  // Filtrar usuarios que no son clientes (solo empleados/admins)
  const employeeUsers = users.filter(u => 
    ['warehouse_ops', 'admin', 'super_admin', 'support', 'sales', 'driver'].includes(u.role)
  );

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
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap={2}>
            <WarehouseIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h5" fontWeight="bold">
                Gestión de Sucursales (CEDIS)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Crear sucursales y asignar empleados
              </Typography>
            </Box>
          </Box>
          <Box display="flex" gap={2}>
            <Button startIcon={<RefreshIcon />} onClick={loadData}>
              Refrescar
            </Button>
            <Button 
              variant="contained" 
              startIcon={<AddIcon />}
              onClick={() => handleOpenBranchDialog()}
            >
              Nueva Sucursal
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label={`Sucursales (${branches.length})`} />
          <Tab label={`Asignaciones (${employeeUsers.filter(u => u.branch_id).length})`} />
          <Tab label={`Sin Asignar (${unassignedUsers.length})`} />
        </Tabs>
      </Paper>

      {/* Tab 0: Lista de Sucursales */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {branches.map((branch) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={branch.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  borderLeft: 4,
                  borderColor: branch.is_active ? 'success.main' : 'grey.400'
                }}
              >
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h6" fontWeight="bold">
                        {branch.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Código: {branch.code} • {branch.city}
                      </Typography>
                    </Box>
                    <Box>
                      <IconButton size="small" onClick={() => handleOpenBranchDialog(branch)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteBranch(branch.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  
                  {/* Indicador de Geocerca */}
                  <Box mt={1} display="flex" gap={1} flexWrap="wrap">
                    {branch.latitud && branch.longitud ? (
                      <Chip 
                        icon={<LocationIcon />}
                        label={`📍 Geocerca: ${branch.radio_geocerca_metros || 100}m`}
                        size="small"
                        color="info"
                        variant="outlined"
                      />
                    ) : (
                      <Chip 
                        icon={<LocationIcon />}
                        label="⚠️ Sin geocerca"
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    )}
                    {branch.wifi_validation_enabled && branch.wifi_ssid && (
                      <Chip 
                        icon={<WifiIcon />}
                        label={`WiFi: ${branch.wifi_ssid}`}
                        size="small"
                        color="secondary"
                        variant="outlined"
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

                  <Box mt={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Chip 
                      icon={branch.is_active ? <ActiveIcon /> : <InactiveIcon />}
                      label={branch.is_active ? 'Activa' : 'Inactiva'}
                      color={branch.is_active ? 'success' : 'default'}
                      size="small"
                    />
                    <Button 
                      size="small" 
                      startIcon={<AssignIcon />}
                      onClick={() => {
                        setSelectedBranch(branch.id);
                        setOpenAssignDialog(true);
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
      <Dialog open={openBranchDialog} onClose={() => setOpenBranchDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
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
      <Dialog open={openAssignDialog} onClose={() => setOpenAssignDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
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
