import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
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
  Chip,
  Avatar,
  IconButton,
  Button,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Tooltip,
  Divider,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
} from '@mui/material';
import {
  People as PeopleIcon,
  AccessTime as ClockIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Badge as BadgeIcon,
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  LocalShipping as TruckIcon,
  Map as MapIcon,
  CalendarMonth as CalendarIcon,
  TrendingUp as TrendingUpIcon,
  Person as PersonIcon,
  FamilyRestroom as FamilyIcon,
  Checkroom as CheckroomIcon,
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';

// Roles disponibles para empleados
const EMPLOYEE_ROLES = [
  { value: 'repartidor', label: 'Repartidor', color: 'warning' as const },
  { value: 'warehouse_ops', label: 'Bodega', color: 'success' as const },
  { value: 'counter_staff', label: 'Mostrador', color: 'info' as const },
  { value: 'customer_service', label: 'Servicio a Cliente', color: 'primary' as const },
  { value: 'branch_manager', label: 'Operaciones', color: 'secondary' as const },
];

interface Employee {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  box_id: string;
  is_employee_onboarded: boolean;
  pants_size: string;
  shirt_size: string;
  emergency_contact: string;
  marital_status: string;
  spouse_name: string;
  children_count: number;
  hire_date: string;
  employee_number: string;
  check_in_time: string | null;
  check_out_time: string | null;
  attendance_status: string | null;
  check_in_address: string | null;
  privacy_accepted_at: string | null;
  // Documentos
  profile_photo_url?: string;
  ine_front_url?: string;
  ine_back_url?: string;
  driver_license_front_url?: string;
  driver_license_back_url?: string;
  driver_license_expiry?: string;
  // Campos adicionales para estadísticas
  days_present?: number;
  days_late?: number;
  days_absent?: number;
}

interface AttendanceStats {
  summary: {
    total_employees: number;
    total_present: number;
    total_late: number;
    total_absent: number;
    avg_hours_worked: number;
  };
  byRole: Array<{
    role: string;
    employees: number;
    present: number;
    late: number;
  }>;
  period: { month: number; year: number };
}

interface DriverLocation {
  user_id: number;
  full_name: string;
  phone: string;
  lat: number;
  lng: number;
  speed: number;
  battery_level: number;
  recorded_at: string;
}

// Traducir rol
const translateRole = (role: string): string => {
  const translations: Record<string, string> = {
    warehouse_ops: 'Bodega',
    counter_staff: 'Mostrador',
    repartidor: 'Repartidor',
    customer_service: 'Servicio Cliente',
    branch_manager: 'Operaciones',
    admin: 'Admin',
    super_admin: 'Super Admin',
  };
  return translations[role] || role;
};

// Color por rol
const getRoleColor = (role: string): "error" | "warning" | "info" | "success" | "default" | "primary" | "secondary" => {
  const colors: Record<string, "error" | "warning" | "info" | "success" | "default" | "primary" | "secondary"> = {
    repartidor: 'warning',
    warehouse_ops: 'success',
    counter_staff: 'info',
    customer_service: 'primary',
    branch_manager: 'secondary',
    admin: 'error',
    super_admin: 'error',
  };
  return colors[role] || 'default';
};

// Iniciales
const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

export default function HRManagementPage() {
  const { t: _t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<Employee | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Estado para crear/editar empleado
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'repartidor'
  });
  
  // Estado para mostrar contraseña temporal
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ name: string; password: string } | null>(null);
  
  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const getToken = () => localStorage.getItem('token') || '';

  // Cargar empleados
  const loadEmployees = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/hr/employees`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setEmployees(res.data);
    } catch (error) {
      console.error('Error cargando empleados:', error);
    }
  };

  // Cargar estadísticas
  const loadStats = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/hr/attendance/stats`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setStats(res.data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  // Cargar ubicación de choferes
  const loadDrivers = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/hr/drivers/live`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setDrivers(res.data);
    } catch (error) {
      console.error('Error cargando choferes:', error);
    }
  };

  // Cargar detalle de empleado
  const loadEmployeeDetail = async (id: number) => {
    setLoadingDetail(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/hr/employees/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setDetailData(res.data);
    } catch (error) {
      console.error('Error cargando detalle:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Abrir diálogo para crear nuevo empleado
  const handleOpenCreateDialog = () => {
    setEditMode(false);
    setNewEmployee({
      fullName: '',
      email: '',
      phone: '',
      role: 'repartidor'
    });
    setCreateDialogOpen(true);
  };

  // Abrir diálogo para editar empleado
  const handleOpenEditDialog = (employee: Employee) => {
    setEditMode(true);
    setSelectedEmployee(employee);
    setNewEmployee({
      fullName: employee.full_name,
      email: employee.email,
      phone: employee.phone || '',
      role: employee.role
    });
    setCreateDialogOpen(true);
  };

  // Guardar empleado (crear o editar)
  const handleSaveEmployee = async () => {
    if (!newEmployee.fullName || !newEmployee.email || !newEmployee.role) {
      setSnackbar({ open: true, message: 'Nombre, email y rol son requeridos', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      if (editMode && selectedEmployee) {
        // Actualizar empleado existente
        await axios.put(
          `${API_URL}/api/admin/hr/employees/${selectedEmployee.id}`,
          newEmployee,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        setSnackbar({ open: true, message: 'Empleado actualizado exitosamente', severity: 'success' });
      } else {
        // Crear nuevo empleado
        const response = await axios.post(
          `${API_URL}/api/admin/hr/employees`,
          newEmployee,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        // Mostrar contraseña temporal
        setTempPasswordInfo({
          name: response.data.employee.fullName,
          password: response.data.employee.tempPassword
        });
        setShowTempPassword(true);
        setSnackbar({ open: true, message: 'Empleado creado exitosamente', severity: 'success' });
      }
      setCreateDialogOpen(false);
      loadEmployees();
    } catch (error: any) {
      console.error('Error guardando empleado:', error);
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al guardar empleado', 
        severity: 'error' 
      });
    } finally {
      setSaving(false);
    }
  };

  // Eliminar empleado
  const handleDeleteEmployee = async (employee: Employee) => {
    if (!confirm(`¿Estás seguro de dar de baja a ${employee.full_name}?`)) return;

    try {
      await axios.delete(
        `${API_URL}/api/admin/hr/employees/${employee.id}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: `${employee.full_name} dado de baja`, severity: 'success' });
      loadEmployees();
    } catch (error: any) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al eliminar empleado', 
        severity: 'error' 
      });
    }
  };

  // Copiar contraseña al portapapeles
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSnackbar({ open: true, message: 'Contraseña copiada al portapapeles', severity: 'info' });
  };

  // Carga inicial
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadEmployees(), loadStats(), loadDrivers()]);
      setLoading(false);
    };
    loadAll();
    
    // Actualizar choferes cada 30 segundos
    const interval = setInterval(loadDrivers, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ver detalle de empleado
  const handleViewEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setDetailOpen(true);
    loadEmployeeDetail(employee.id);
  };

  // Contadores rápidos
  const checkedInToday = employees.filter(e => e.check_in_time).length;
  const notCheckedIn = employees.filter(e => !e.check_in_time).length;
  const lateToday = employees.filter(e => e.attendance_status === 'late').length;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" color="text.primary">
            👥 Recursos Humanos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestión de personal, asistencias y rastreo de flotilla
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={handleOpenCreateDialog}
            sx={{ 
              bgcolor: '#F05A28',
              '&:hover': { bgcolor: '#d14d22' }
            }}
          >
            Agregar Empleado
          </Button>
          <Tooltip title="Actualizar">
            <IconButton onClick={() => { loadEmployees(); loadStats(); loadDrivers(); }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{checkedInToday}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Entrada registrada</Typography>
                </Box>
                <CheckCircleIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{notCheckedIn}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Sin checar</Typography>
                </Box>
                <CancelIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #FF9800 0%, #f57c00 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{lateToday}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Retardos hoy</Typography>
                </Box>
                <WarningIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #2196F3 0%, #1976d2 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{drivers.length}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Choferes en ruta</Typography>
                </Box>
                <TruckIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<PeopleIcon />} label="Personal" iconPosition="start" />
        <Tab icon={<ClockIcon />} label="Asistencias" iconPosition="start" />
        <Tab icon={<MapIcon />} label="Rastreo en Vivo" iconPosition="start" />
        <Tab icon={<TrendingUpIcon />} label="Estadísticas" iconPosition="start" />
      </Tabs>

      {/* TAB 0: Lista de Personal */}
      {tab === 0 && (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: '#F05A28' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Empleado</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Rol</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Tallas (P/C)</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Contacto Emergencia</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Checador Hoy</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: getRoleColor(emp.role) === 'default' ? '#666' : undefined }}>
                        {getInitials(emp.full_name)}
                      </Avatar>
                      <Box>
                        <Typography fontWeight="bold">{emp.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{emp.phone || emp.email}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={translateRole(emp.role)} 
                      size="small" 
                      color={getRoleColor(emp.role)}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {emp.is_employee_onboarded ? (
                      <Typography>{emp.pants_size || '-'} / {emp.shirt_size || '-'}</Typography>
                    ) : (
                      <Chip label="Sin alta" size="small" color="warning" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>{emp.emergency_contact || <Typography color="text.secondary">No registrado</Typography>}</TableCell>
                  <TableCell>
                    {emp.check_in_time ? (
                      <Box>
                        <Typography color={emp.attendance_status === 'late' ? 'warning.main' : 'success.main'} fontWeight="bold">
                          Entrada: {new Date(emp.check_in_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          {emp.attendance_status === 'late' && ' ⚠️'}
                        </Typography>
                        {emp.check_out_time && (
                          <Typography variant="caption" color="text.secondary">
                            Salida: {new Date(emp.check_out_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Chip label="Sin checar" color="error" size="small" />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                      <Tooltip title="Ver Expediente">
                        <IconButton size="small" onClick={() => handleViewEmployee(emp)}>
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton size="small" color="primary" onClick={() => handleOpenEditDialog(emp)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Dar de Baja">
                        <IconButton size="small" color="error" onClick={() => handleDeleteEmployee(emp)}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <PeopleIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                      <Typography color="text.secondary" gutterBottom>No hay empleados registrados</Typography>
                      <Button
                        variant="outlined"
                        startIcon={<PersonAddIcon />}
                        onClick={handleOpenCreateDialog}
                        sx={{ mt: 1 }}
                      >
                        Agregar Primer Empleado
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* TAB 1: Asistencias del día */}
      {tab === 1 && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                ✅ Ya checaron entrada
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <List>
                {employees.filter(e => e.check_in_time).map(emp => (
                  <ListItem key={emp.id} divider>
                    <ListItemIcon>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'success.main' }}>
                        {getInitials(emp.full_name)}
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText 
                      primary={emp.full_name}
                      secondary={
                        <Box>
                          <Typography variant="caption" component="span">
                            {translateRole(emp.role)} • 
                          </Typography>
                          <Typography variant="caption" component="span" color="success.main" fontWeight="bold">
                            {' '}{new Date(emp.check_in_time!).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                          {emp.attendance_status === 'late' && (
                            <Chip label="Retardo" size="small" color="warning" sx={{ ml: 1 }} />
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
                {employees.filter(e => e.check_in_time).length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    Nadie ha checado entrada aún
                  </Typography>
                )}
              </List>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom color="error">
                ❌ Pendientes de checar
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <List>
                {employees.filter(e => !e.check_in_time).map(emp => (
                  <ListItem key={emp.id} divider>
                    <ListItemIcon>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'error.main' }}>
                        {getInitials(emp.full_name)}
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText 
                      primary={emp.full_name}
                      secondary={translateRole(emp.role)}
                    />
                  </ListItem>
                ))}
                {employees.filter(e => !e.check_in_time).length === 0 && (
                  <Typography color="success.main" sx={{ py: 2, textAlign: 'center' }}>
                    🎉 ¡Todos han checado entrada!
                  </Typography>
                )}
              </List>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* TAB 2: Rastreo en Vivo */}
      {tab === 2 && (
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" fontWeight="bold">
              🚚 Choferes en Ruta (Tiempo Real)
            </Typography>
            <Button 
              variant="outlined" 
              startIcon={<RefreshIcon />}
              onClick={loadDrivers}
              size="small"
            >
              Actualizar
            </Button>
          </Box>
          
          {drivers.length === 0 ? (
            <Alert severity="info">
              No hay choferes activos en los últimos 15 minutos
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Chofer</TableCell>
                    <TableCell>Teléfono</TableCell>
                    <TableCell>Ubicación</TableCell>
                    <TableCell>Velocidad</TableCell>
                    <TableCell>Batería</TableCell>
                    <TableCell>Última Actualización</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {drivers.map(driver => (
                    <TableRow key={driver.user_id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ bgcolor: 'warning.main', width: 32, height: 32 }}>
                            <TruckIcon fontSize="small" />
                          </Avatar>
                          {driver.full_name}
                        </Box>
                      </TableCell>
                      <TableCell>{driver.phone}</TableCell>
                      <TableCell>
                        <Tooltip title={`${driver.lat}, ${driver.lng}`}>
                          <Chip 
                            icon={<LocationIcon />}
                            label="Ver Mapa"
                            size="small"
                            clickable
                            onClick={() => window.open(`https://www.google.com/maps?q=${driver.lat},${driver.lng}`, '_blank')}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell>{driver.speed ? `${driver.speed} km/h` : '-'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={driver.battery_level || 0}
                            sx={{ width: 60, height: 8, borderRadius: 4 }}
                            color={driver.battery_level && driver.battery_level < 20 ? 'error' : 'success'}
                          />
                          <Typography variant="caption">{driver.battery_level || 0}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {new Date(driver.recorded_at).toLocaleTimeString('es-MX')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* TAB 3: Estadísticas */}
      {tab === 3 && stats && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 3, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>Promedio Horas Trabajadas</Typography>
              <Typography variant="h2" fontWeight="bold" color="primary">
                {stats.summary.avg_hours_worked || 0}h
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Este mes ({stats.period.month}/{stats.period.year})
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 3, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>Asistencias Perfectas</Typography>
              <Typography variant="h2" fontWeight="bold" color="success.main">
                {stats.summary.total_present || 0}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 3, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>Retardos del Mes</Typography>
              <Typography variant="h2" fontWeight="bold" color="warning.main">
                {stats.summary.total_late || 0}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Asistencia por Departamento
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Departamento</TableCell>
                      <TableCell align="center">Empleados</TableCell>
                      <TableCell align="center">Asistencias</TableCell>
                      <TableCell align="center">Retardos</TableCell>
                      <TableCell align="center">% Puntualidad</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stats.byRole.map(dept => (
                      <TableRow key={dept.role} hover>
                        <TableCell>
                          <Chip label={translateRole(dept.role)} color={getRoleColor(dept.role)} size="small" />
                        </TableCell>
                        <TableCell align="center">{dept.employees}</TableCell>
                        <TableCell align="center">{dept.present}</TableCell>
                        <TableCell align="center">{dept.late}</TableCell>
                        <TableCell align="center">
                          <Typography 
                            color={dept.present + dept.late > 0 
                              ? (dept.present / (dept.present + dept.late)) * 100 >= 90 
                                ? 'success.main' 
                                : 'warning.main'
                              : 'text.secondary'
                            }
                            fontWeight="bold"
                          >
                            {dept.present + dept.late > 0 
                              ? Math.round((dept.present / (dept.present + dept.late)) * 100)
                              : 0
                            }%
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Diálogo de Expediente */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main' }}>
              {selectedEmployee ? getInitials(selectedEmployee.full_name) : ''}
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight="bold">{selectedEmployee?.full_name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedEmployee && translateRole(selectedEmployee.role)}
                {detailData?.employee_number && ` • #${detailData.employee_number}`}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDetail ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : detailData ? (
            <Grid container spacing={3}>
              {/* Datos de Contacto */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  <PersonIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Datos de Contacto
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EmailIcon fontSize="small" color="action" />
                      <Typography>{detailData.email}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PhoneIcon fontSize="small" color="action" />
                      <Typography>{detailData.phone || 'No registrado'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WarningIcon fontSize="small" color="warning" />
                      <Typography variant="body2">
                        <strong>Emergencia:</strong> {detailData.emergency_contact || 'No registrado'}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>

              {/* Datos Familiares */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  <FamilyIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Datos Familiares
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography><strong>Estado Civil:</strong> {detailData.marital_status || 'No registrado'}</Typography>
                  {detailData.marital_status === 'Casado' && (
                    <Typography><strong>Cónyuge:</strong> {detailData.spouse_name || 'No registrado'}</Typography>
                  )}
                  <Typography><strong>Hijos:</strong> {detailData.children_count || 0}</Typography>
                </Paper>
              </Grid>

              {/* Uniforme */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  <CheckroomIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Tallas de Uniforme
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography><strong>Pantalón:</strong> {detailData.pants_size || 'No registrado'}</Typography>
                  <Typography><strong>Camiseta:</strong> {detailData.shirt_size || 'No registrado'}</Typography>
                </Paper>
              </Grid>

              {/* Documentos del Empleado */}
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  <BadgeIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Documentos del Expediente
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Grid container spacing={2}>
                    {/* Foto de Perfil */}
                    <Grid size={{ xs: 6, md: 2 }}>
                      <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                        Foto de Perfil
                      </Typography>
                      {detailData.profile_photo_url ? (
                        <Box
                          component="img"
                          src={detailData.profile_photo_url}
                          alt="Foto de perfil"
                          sx={{
                            width: 100,
                            height: 100,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid #4CAF50',
                            cursor: 'pointer',
                          }}
                          onClick={() => window.open(detailData.profile_photo_url, '_blank')}
                        />
                      ) : (
                        <Box sx={{ 
                          width: 100, 
                          height: 100, 
                          borderRadius: '50%', 
                          bgcolor: '#f5f5f5', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          border: '2px dashed #ccc'
                        }}>
                          <Typography variant="caption" color="text.secondary">Sin foto</Typography>
                        </Box>
                      )}
                    </Grid>

                    {/* INE Frente */}
                    <Grid size={{ xs: 6, md: 2.5 }}>
                      <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                        INE Frente
                      </Typography>
                      {detailData.ine_front_url ? (
                        <Box
                          component="img"
                          src={detailData.ine_front_url}
                          alt="INE Frente"
                          sx={{
                            width: '100%',
                            height: 80,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: '2px solid #4CAF50',
                            cursor: 'pointer',
                          }}
                          onClick={() => window.open(detailData.ine_front_url, '_blank')}
                        />
                      ) : (
                        <Chip label="No cargada" size="small" color="error" variant="outlined" />
                      )}
                    </Grid>

                    {/* INE Vuelta */}
                    <Grid size={{ xs: 6, md: 2.5 }}>
                      <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                        INE Vuelta
                      </Typography>
                      {detailData.ine_back_url ? (
                        <Box
                          component="img"
                          src={detailData.ine_back_url}
                          alt="INE Vuelta"
                          sx={{
                            width: '100%',
                            height: 80,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: '2px solid #4CAF50',
                            cursor: 'pointer',
                          }}
                          onClick={() => window.open(detailData.ine_back_url, '_blank')}
                        />
                      ) : (
                        <Chip label="No cargada" size="small" color="error" variant="outlined" />
                      )}
                    </Grid>

                    {/* Licencia de Conducir (solo para repartidores) */}
                    {detailData.role === 'repartidor' && (
                      <>
                        <Grid size={{ xs: 6, md: 2.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                            Licencia Frente
                          </Typography>
                          {detailData.driver_license_front_url ? (
                            <Box
                              component="img"
                              src={detailData.driver_license_front_url}
                              alt="Licencia Frente"
                              sx={{
                                width: '100%',
                                height: 80,
                                objectFit: 'cover',
                                borderRadius: 1,
                                border: '2px solid #4CAF50',
                                cursor: 'pointer',
                              }}
                              onClick={() => window.open(detailData.driver_license_front_url, '_blank')}
                            />
                          ) : (
                            <Chip label="No cargada" size="small" color="error" variant="outlined" />
                          )}
                        </Grid>

                        <Grid size={{ xs: 6, md: 2.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                            Licencia Vuelta
                          </Typography>
                          {detailData.driver_license_back_url ? (
                            <Box
                              component="img"
                              src={detailData.driver_license_back_url}
                              alt="Licencia Vuelta"
                              sx={{
                                width: '100%',
                                height: 80,
                                objectFit: 'cover',
                                borderRadius: 1,
                                border: '2px solid #4CAF50',
                                cursor: 'pointer',
                              }}
                              onClick={() => window.open(detailData.driver_license_back_url, '_blank')}
                            />
                          ) : (
                            <Chip label="No cargada" size="small" color="error" variant="outlined" />
                          )}
                          {detailData.driver_license_expiry && (
                            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                              Vence: {new Date(detailData.driver_license_expiry).toLocaleDateString('es-MX')}
                            </Typography>
                          )}
                        </Grid>
                      </>
                    )}
                  </Grid>

                  {/* Indicador de documentos completos */}
                  <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    {detailData.profile_photo_url && detailData.ine_front_url && detailData.ine_back_url ? (
                      <Chip 
                        icon={<CheckCircleIcon />} 
                        label="Documentos básicos completos" 
                        color="success" 
                        size="small" 
                      />
                    ) : (
                      <Chip 
                        icon={<WarningIcon />} 
                        label="Documentos incompletos" 
                        color="warning" 
                        size="small" 
                      />
                    )}
                    {detailData.role === 'repartidor' && (
                      detailData.driver_license_front_url && detailData.driver_license_back_url ? (
                        <Chip 
                          icon={<CheckCircleIcon />} 
                          label="Licencia completa" 
                          color="success" 
                          size="small" 
                        />
                      ) : (
                        <Chip 
                          icon={<WarningIcon />} 
                          label="Licencia faltante" 
                          color="error" 
                          size="small" 
                        />
                      )
                    )}
                  </Box>
                </Paper>
              </Grid>

              {/* Estadísticas de Asistencia */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  <CalendarIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Asistencia (Total)
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Chip label={`${detailData.days_present || 0} asistencias`} color="success" />
                    <Chip label={`${detailData.days_late || 0} retardos`} color="warning" />
                    <Chip label={`${detailData.days_absent || 0} faltas`} color="error" />
                  </Box>
                </Paper>
              </Grid>

              {/* Fecha de Alta */}
              <Grid size={{ xs: 12 }}>
                <Alert severity="info" icon={<BadgeIcon />}>
                  <strong>Fecha de Alta:</strong> {detailData.hire_date 
                    ? new Date(detailData.hire_date).toLocaleDateString('es-MX', { dateStyle: 'long' })
                    : 'No registrada'
                  }
                  {detailData.privacy_accepted_at && (
                    <span> • Aviso de privacidad aceptado el {new Date(detailData.privacy_accepted_at).toLocaleDateString('es-MX')}</span>
                  )}
                </Alert>
              </Grid>
            </Grid>
          ) : (
            <Alert severity="error">Error al cargar datos del empleado</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo Crear/Editar Empleado */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#F05A28', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon />
            {editMode ? 'Editar Empleado' : 'Nuevo Empleado'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Nombre Completo"
                value={newEmployee.fullName}
                onChange={(e) => setNewEmployee({ ...newEmployee, fullName: e.target.value })}
                required
                placeholder="Ej: Juan Pérez López"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                required
                disabled={editMode}
                placeholder="empleado@empresa.com"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Teléfono / WhatsApp"
                value={newEmployee.phone}
                onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                placeholder="81 1234 5678"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth required>
                <InputLabel>Rol / Puesto</InputLabel>
                <Select
                  value={newEmployee.role}
                  label="Rol / Puesto"
                  onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                >
                  {EMPLOYEE_ROLES.map((role) => (
                    <MenuItem key={role.value} value={role.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={role.label} color={role.color} size="small" variant="outlined" />
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          
          {!editMode && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Se generará una contraseña temporal. El empleado completará sus datos personales (contacto de emergencia, tallas de uniforme) cuando inicie sesión en la app móvil.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSaveEmployee}
            disabled={saving}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d14d22' } }}
          >
            {saving ? <CircularProgress size={24} /> : (editMode ? 'Guardar Cambios' : 'Crear Empleado')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo Contraseña Temporal */}
      <Dialog open={showTempPassword} onClose={() => setShowTempPassword(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: '#4CAF50', color: 'white' }}>
          ✅ Empleado Creado
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body1" gutterBottom>
            <strong>{tempPasswordInfo?.name}</strong> ha sido dado de alta.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Contraseña temporal:
          </Typography>
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 2, 
              bgcolor: '#f5f5f5', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 1
            }}
          >
            <Typography variant="h5" fontFamily="monospace" fontWeight="bold">
              {tempPasswordInfo?.password}
            </Typography>
            <IconButton 
              size="small" 
              onClick={() => copyToClipboard(tempPasswordInfo?.password || '')}
              sx={{ ml: 1 }}
            >
              <CopyIcon />
            </IconButton>
          </Paper>
          <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
            El empleado deberá cambiar esta contraseña en su primer inicio de sesión.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            variant="contained" 
            onClick={() => setShowTempPassword(false)}
            fullWidth
          >
            Entendido
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
