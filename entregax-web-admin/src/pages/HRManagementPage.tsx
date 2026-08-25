import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import ConfirmDialog from '../components/ConfirmDialog';
import EmployeeProfilePage from './EmployeeProfilePage';
import VacationQuintaDialog from '../components/VacationQuintaDialog';
import OrgChartTab from './OrgChartTab';
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
  Skeleton,
  Switch,
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
  BeachAccess as BeachAccessIcon,
  AccountTree as AccountTreeIcon,
  PhoneAndroid as PhoneAndroidIcon,
} from '@mui/icons-material';

// Roles disponibles para empleados
const EMPLOYEE_ROLES = [
  { value: 'repartidor', label: 'Repartidor', color: 'warning' as const, superAdminOnly: false },
  { value: 'warehouse_ops', label: 'Bodega', color: 'success' as const, superAdminOnly: false },
  { value: 'counter_staff', label: 'Mostrador', color: 'info' as const, superAdminOnly: false },
  { value: 'customer_service', label: 'Servicio a Cliente', color: 'primary' as const, superAdminOnly: false },
  { value: 'soporte_tecnico', label: 'Soporte Técnico', color: 'info' as const, superAdminOnly: false },
  { value: 'branch_manager', label: 'Operaciones', color: 'secondary' as const, superAdminOnly: false },
  { value: 'monitoreo', label: 'Monitoreo', color: 'default' as const, superAdminOnly: false },
  { value: 'abogado', label: 'Abogado', color: 'secondary' as const, superAdminOnly: false },
  { value: 'accountant', label: 'Contador', color: 'default' as const, superAdminOnly: false },
  // Asesor y sub-asesor faltaban en la lista, así que no se podía asignar el
  // puesto desde aquí aunque el sistema sí reconoce esos roles en todos lados.
  // OJO con sub-asesor: la comisión se parte 50/50 con su líder, y el líder
  // sale de users.advisor_id / referred_by_id — hay que asignarlo aparte o se
  // queda con el 100%.
  { value: 'advisor', label: 'Asesor', color: 'primary' as const, superAdminOnly: false },
  { value: 'sub_advisor', label: 'Sub-Asesor', color: 'primary' as const, superAdminOnly: false },
  { value: 'director', label: 'Director', color: 'secondary' as const, superAdminOnly: true },
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
  // Salida registrada fuera de la zona de trabajo → marcada para revisión de RH
  check_out_outside_geofence?: boolean;
  check_out_geofence_distance_m?: number | null;
  check_out_geofence_reason?: string | null;
  privacy_accepted_at: string | null;
  is_active?: boolean;
  is_blocked?: boolean;
  attendance_enabled?: boolean;
  // Candado de geocerca por usuario: true exige, false exenta, null = regla del rol
  geofence_required?: boolean | null;
  branch_id?: number | null;
  branch_name?: string | null;
  block_reason?: string | null;
  blocked_at?: string | null;
  deleted_at?: string | null;
  // Documentos
  profile_photo_url?: string;
  has_photo?: boolean;
  ine_front_url?: string;
  ine_back_url?: string;
  driver_license_front_url?: string;
  driver_license_back_url?: string;
  driver_license_expiry?: string;
  // Campos adicionales para estadísticas
  days_present?: number;
  days_late?: number;
  days_absent?: number;
  // Completitud de expediente (calculado backend)
  expediente_completo?: boolean;
  expediente_faltantes?: string[];
  expediente_imss_aplica?: boolean;
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
    operaciones: 'Operaciones',
    monitoreo: 'Monitoreo',
    abogado: 'Abogado',
    accountant: 'Contador',
    contador: 'Contador',
    advisor: 'Asesor',
    asesor: 'Asesor',
    sub_advisor: 'Sub-Asesor',
    sub_asesor: 'Sub-Asesor',
    director: 'Director',
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
    operaciones: 'secondary',
    monitoreo: 'default',
    abogado: 'secondary',
    accountant: 'default',
    contador: 'default',
    advisor: 'primary',
    asesor: 'primary',
    sub_advisor: 'primary',
    sub_asesor: 'primary',
    director: 'error',
    admin: 'error',
    super_admin: 'error',
  };
  return colors[role] || 'default';
};

// Iniciales
const getInitials = (name: string): string => {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

// Avatar del empleado: muestra la foto de perfil si existe (cargándola bajo
// demanda para no inflar el listado); si no, las iniciales.
const PHOTO_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const photoCache = new Map<number, string>();
function EmployeeAvatar({ emp, size = 40 }: { emp: Employee; size?: number }) {
  const [src, setSrc] = useState<string | undefined>(emp.profile_photo_url || photoCache.get(emp.id) || undefined);
  useEffect(() => {
    let alive = true;
    if (emp.profile_photo_url) { setSrc(emp.profile_photo_url); return; }
    if (!emp.has_photo) { setSrc(undefined); return; }
    if (photoCache.has(emp.id)) { setSrc(photoCache.get(emp.id)); return; }
    axios.get(`${PHOTO_API_URL}/api/admin/hr/employees/${emp.id}/photo`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
      .then(r => { const p = r.data?.photo; if (p && alive) { photoCache.set(emp.id, p); setSrc(p); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [emp.id, emp.has_photo, emp.profile_photo_url]);
  return (
    <Avatar src={src} sx={{ width: size, height: size, bgcolor: getRoleColor(emp.role) === 'default' ? '#666' : undefined }}>
      {getInitials(emp.full_name)}
    </Avatar>
  );
}

export default function HRManagementPage() {
  const { t: _t } = useTranslation();
  const isSuperAdmin = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').role === 'super_admin'; } catch { return false; }
  })();
  const canShowInactive = (() => {
    try { const r = JSON.parse(localStorage.getItem('user') || '{}').role || ''; return r === 'super_admin' || r === 'admin'; } catch { return false; }
  })();
  const [tab, setTab] = useState(0);
  const [viewProfileId, setViewProfileId] = useState<number | null>(null);
  const [vacQuintaEmp, setVacQuintaEmp] = useState<Employee | null>(null);
  // Línea telefónica (RRHH) + equipo asignado desde Inventario de Activos
  const [phoneEmp, setPhoneEmp] = useState<Employee | null>(null);
  const [phoneForm, setPhoneForm] = useState({ asset_id: '', phone_number: '', line_holder: '', balance_due_date: '', notes: '' });
  const [phoneAssets, setPhoneAssets] = useState<Array<{ id: number; sku: string; brand: string | null; model: string | null; serial_number: string | null; status: string; assigned_to_user_id: number | null }>>([]);
  const [phoneSaving, setPhoneSaving] = useState(false);
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
    role: 'repartidor',
    branchId: '' as string,
  });
  const [branchesList, setBranchesList] = useState<Array<{ id: number; name: string }>>([]);

  // Estado para mostrar contraseña temporal
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ name: string; email: string; password: string } | null>(null);
  const [searchEmployee, setSearchEmployee] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [filterIncompleto, setFilterIncompleto] = useState(false);
  const [filterRole, setFilterRole] = useState('');
  const [filterBranch, setFilterBranch] = useState<string>(''); // '' = todas, 'none' = sin sucursal, o branch_id
  
  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  // Confirmación de baja de empleado
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; employee: Employee | null; loading: boolean }>({
    open: false,
    employee: null,
    loading: false,
  });

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const getToken = () => localStorage.getItem('token') || '';

  // Cargar empleados
  const loadEmployees = async () => {
    try {
      const includeInactive = showInactive;
      const res = await axios.get(`${API_URL}/api/admin/hr/employees`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        params: includeInactive ? { include_inactive: 'true' } : {},
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

  // Abrir detalle de empleado desde evento externo (ej. notificación "Repartidor Bloqueado")
  useEffect(() => {
    const handler = (e: Event) => {
      const employeeId = (e as CustomEvent).detail?.employeeId;
      if (!employeeId) return;
      setDetailOpen(true);
      loadEmployeeDetail(employeeId);
    };
    window.addEventListener('open-hr-employee', handler);
    return () => window.removeEventListener('open-hr-employee', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abrir diálogo para crear nuevo empleado
  const handleOpenCreateDialog = () => {
    setEditMode(false);
    setNewEmployee({
      fullName: '',
      email: '',
      phone: '',
      role: 'repartidor',
      branchId: '',
    });
    setCreateDialogOpen(true);
  };

  // Línea/equipo: abrir modal cargando lo existente + equipos disponibles del inventario
  const openPhoneDialog = async (employee: Employee) => {
    setPhoneEmp(employee);
    setPhoneForm({ asset_id: '', phone_number: '', line_holder: '', balance_due_date: '', notes: '' });
    setPhoneAssets([]);
    const auth = { headers: { Authorization: `Bearer ${getToken()}` } };
    try {
      const [ar, pr] = await Promise.all([
        axios.get(`${API_URL}/api/admin/hr/phone-assets?employee_id=${employee.id}`, auth),
        axios.get(`${API_URL}/api/admin/hr/employees/${employee.id}/phone`, auth),
      ]);
      setPhoneAssets(ar.data?.assets || []);
      const p = pr.data?.phone;
      if (p) setPhoneForm({
        asset_id: p.asset_id ? String(p.asset_id) : '',
        phone_number: p.phone_number || '',
        line_holder: p.line_holder || '',
        balance_due_date: p.balance_due_date ? String(p.balance_due_date).slice(0, 10) : '',
        notes: p.notes || '',
      });
    } catch { /* sin registro previo */ }
  };
  const savePhone = async () => {
    if (!phoneEmp) return;
    setPhoneSaving(true);
    try {
      await axios.put(`${API_URL}/api/admin/hr/employees/${phoneEmp.id}/phone`,
        { ...phoneForm, asset_id: phoneForm.asset_id ? Number(phoneForm.asset_id) : null },
        { headers: { Authorization: `Bearer ${getToken()}` } });
      setPhoneEmp(null);
    } catch (e: any) { alert(e?.response?.data?.error || 'No se pudo guardar'); }
    finally { setPhoneSaving(false); }
  };

  // Abrir diálogo para editar empleado
  const handleOpenEditDialog = (employee: Employee) => {
    setEditMode(true);
    setSelectedEmployee(employee);
    setNewEmployee({
      fullName: employee.full_name,
      email: employee.email,
      phone: employee.phone || '',
      role: employee.role,
      branchId: employee.branch_id ? String(employee.branch_id) : '',
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
        // Mostrar credenciales (usuario + contraseña) para compartir.
        setTempPasswordInfo({
          name: response.data.employee.fullName,
          email: response.data.employee.email || newEmployee.email,
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

// Eliminar empleado (abre diálogo de confirmación corporativo)
  const handleDeleteEmployee = (employee: Employee) => {
    setConfirmDelete({ open: true, employee, loading: false });
  };

  const performDeleteEmployee = async () => {
    const employee = confirmDelete.employee;
    if (!employee) return;
    setConfirmDelete(s => ({ ...s, loading: true }));
    try {
      await axios.delete(
        `${API_URL}/api/admin/hr/employees/${employee.id}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: `${employee.full_name} dado de baja correctamente`, severity: 'success' });
      setConfirmDelete({ open: false, employee: null, loading: false });
      loadEmployees();
    } catch (error: unknown) {
      setConfirmDelete(s => ({ ...s, loading: false }));
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al eliminar empleado';
      setSnackbar({
        open: true,
        message: msg,
        severity: 'error'
      });
    }
  };

  // Copiar contraseña al portapapeles
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSnackbar({ open: true, message: 'Contraseña copiada al portapapeles', severity: 'info' });
  };

  // Reactivar empleado
  const handleReactivateEmployee = async (employee: Employee) => {
    if (!window.confirm(`¿Reactivar a ${employee.full_name}? Volverá a aparecer en la lista activa.`)) return;
    try {
      await axios.post(
        `${API_URL}/api/admin/hr/employees/${employee.id}/reactivate`,
        {},
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: `${employee.full_name} reactivado correctamente`, severity: 'success' });
      loadEmployees();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al reactivar empleado';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  // Candado de geocerca por empleado. El backend resuelve null = regla del rol,
  // así que aquí solo alternamos entre exigir (true) y volver al rol (null).
  const handleToggleGeofence = async (employee: Employee, required: boolean) => {
    const next: boolean | null = required ? true : null;
    const prevValue = employee.geofence_required ?? null;
    setEmployees(prev => prev.map(e => e.id === employee.id ? { ...e, geofence_required: next } : e));
    try {
      await axios.put(
        `${API_URL}/api/admin/hr/employees/${employee.id}/geofence-required`,
        { required: next },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({
        open: true,
        message: required
          ? `Geocerca obligatoria para ${employee.full_name}`
          : `${employee.full_name} vuelve a la regla de su rol`,
        severity: 'success',
      });
    } catch (error: unknown) {
      setEmployees(prev => prev.map(e => e.id === employee.id ? { ...e, geofence_required: prevValue } : e));
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al actualizar el candado de geocerca';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  // Activar / desactivar el checador de asistencia de un empleado
  const handleToggleAttendance = async (employee: Employee, enabled: boolean) => {
    // Optimista: refleja el cambio de inmediato.
    setEmployees(prev => prev.map(e => e.id === employee.id ? { ...e, attendance_enabled: enabled } : e));
    try {
      await axios.put(
        `${API_URL}/api/admin/hr/employees/${employee.id}/attendance-enabled`,
        { enabled },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: `Checador ${enabled ? 'activado' : 'desactivado'} para ${employee.full_name}`, severity: 'success' });
    } catch (error: unknown) {
      // Revertir si falla.
      setEmployees(prev => prev.map(e => e.id === employee.id ? { ...e, attendance_enabled: !enabled } : e));
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al actualizar el checador';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  // Sucursales (para el selector al crear empleado).
  useEffect(() => {
    axios.get(`${API_URL}/api/admin/branches`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => setBranchesList((Array.isArray(r.data) ? r.data : r.data?.branches || []).map((b: any) => ({ id: b.id, name: b.name }))))
      // Antes el error se tragaba en silencio: el selector quedaba vacío con solo
      // "Sin sucursal" y parecía que no había sucursales, no que faltara permiso.
      .catch((error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        setSnackbar({
          open: true,
          message: status === 403
            ? 'Tu rol no tiene permiso para leer las sucursales, por eso el selector está vacío.'
            : 'No se pudieron cargar las sucursales.',
          severity: 'error',
        });
      });
  }, []);

  // Carga inicial
  useEffect(() => {
    const loadAll = async () => {
      // NO bloquear la UI - cargar en paralelo
      loadEmployees().finally(() => setLoading(false));
      loadStats();
      loadDrivers();
    };
    loadAll();
    
    // Actualizar choferes cada 60 segundos (era 30, muy frecuente)
    const interval = setInterval(loadDrivers, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recargar lista cuando cambia el toggle "Mostrar inactivos"
  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  // Ver detalle de empleado (legacy — ahora abrimos EmployeeProfilePage)
  const _handleViewEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setDetailOpen(true);
    loadEmployeeDetail(employee.id);
  };
  void _handleViewEmployee;

  // Contadores rápidos
  const checkedInToday = employees.filter(e => e.check_in_time).length;
  const notCheckedIn = employees.filter(e => !e.check_in_time).length;
  const lateToday = employees.filter(e => e.attendance_status === 'late').length;
  const activeEmployees = employees.filter(e => e.is_active !== false && !e.is_blocked).length;

  // Skeleton para las tarjetas de stats (disponible para uso futuro)
  const _StatCardSkeleton = () => (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ textAlign: 'center', py: 3 }}>
        <Skeleton variant="circular" width={48} height={48} sx={{ mx: 'auto', mb: 1 }} />
        <Skeleton variant="text" width={40} height={40} sx={{ mx: 'auto' }} />
        <Skeleton variant="text" width={80} sx={{ mx: 'auto' }} />
      </CardContent>
    </Card>
  );
  void _StatCardSkeleton;

  // Skeleton para filas de tabla (disponible para uso futuro)
  const _TableRowSkeleton = () => (
    <TableRow>
      <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box>
          <Skeleton variant="text" width={120} />
          <Skeleton variant="text" width={80} height={16} />
        </Box>
      </Box></TableCell>
      <TableCell><Skeleton variant="rounded" width={80} height={24} /></TableCell>
      <TableCell><Skeleton variant="text" width={60} /></TableCell>
      <TableCell><Skeleton variant="text" width={100} /></TableCell>
      <TableCell><Skeleton variant="rounded" width={80} height={24} /></TableCell>
      <TableCell><Skeleton variant="text" width={60} /></TableCell>
    </TableRow>
  );
  void _TableRowSkeleton;

  // Si hay un empleado seleccionado para ver su expediente completo, renderizamos esa página
  if (viewProfileId !== null) {
    return <EmployeeProfilePage employeeId={viewProfileId} onBack={() => setViewProfileId(null)} />;
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
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #5E35B1 0%, #7E57C2 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">
                    {loading ? <Skeleton width={50} sx={{ bgcolor: 'rgba(255,255,255,0.3)' }} /> : activeEmployees}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Empleados activos</Typography>
                </Box>
                <PeopleIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">
                    {loading ? <Skeleton width={50} sx={{ bgcolor: 'rgba(255,255,255,0.3)' }} /> : checkedInToday}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Entrada registrada</Typography>
                </Box>
                <CheckCircleIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">
                    {loading ? <Skeleton width={50} sx={{ bgcolor: 'rgba(255,255,255,0.3)' }} /> : notCheckedIn}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Sin checar</Typography>
                </Box>
                <CancelIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #FF9800 0%, #f57c00 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">
                    {loading ? <Skeleton width={50} sx={{ bgcolor: 'rgba(255,255,255,0.3)' }} /> : lateToday}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Retardos hoy</Typography>
                </Box>
                <WarningIcon sx={{ fontSize: 48, opacity: 0.8 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <Card sx={{ background: 'linear-gradient(135deg, #2196F3 0%, #1976d2 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">
                    {loading ? <Skeleton width={50} sx={{ bgcolor: 'rgba(255,255,255,0.3)' }} /> : drivers.length}
                  </Typography>
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
        <Tab icon={<AccountTreeIcon />} label="Organigrama" iconPosition="start" />
      </Tabs>

      {/* TAB 0: Lista de Personal */}
      {tab === 0 && (
        <>
        <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Buscar por nombre, email, teléfono, rol o # empleado..."
            value={searchEmployee}
            onChange={(e) => setSearchEmployee(e.target.value)}
            sx={{ maxWidth: 400 }}
          />
          {/* Filtro por rol */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Filtrar por rol</InputLabel>
            <Select
              value={filterRole}
              label="Filtrar por rol"
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <MenuItem value="">Todos los roles</MenuItem>
              {EMPLOYEE_ROLES.filter(r => !r.superAdminOnly || isSuperAdmin).map(r => (
                <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {/* Filtro por sucursal */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Filtrar por sucursal</InputLabel>
            <Select value={filterBranch} label="Filtrar por sucursal" onChange={(e) => setFilterBranch(e.target.value)}>
              <MenuItem value="">Todas las sucursales</MenuItem>
              {Array.from(new Map(employees.filter(e => e.branch_id).map(e => [e.branch_id, e.branch_name])).entries())
                .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
                .map(([id, name]) => (
                  <MenuItem key={id} value={String(id)}>
                    {name} · {employees.filter(e => e.branch_id === id).length}
                  </MenuItem>
                ))}
              <MenuItem value="none">Sin sucursal</MenuItem>
            </Select>
          </FormControl>
          {/* Filtro incompletos */}
          <Button
            size="small"
            variant={filterIncompleto ? 'contained' : 'outlined'}
            color={filterIncompleto ? 'warning' : 'inherit'}
            onClick={() => setFilterIncompleto(v => !v)}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
            startIcon={<WarningIcon sx={{ fontSize: 16 }} />}
          >
            {filterIncompleto ? '✓ Solo incompletos' : 'Solo incompletos'}
          </Button>
          {canShowInactive && (
            <Button
              size="small"
              variant={showInactive ? 'contained' : 'outlined'}
              color={showInactive ? 'warning' : 'inherit'}
              onClick={() => setShowInactive(v => !v)}
              sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
            >
              {showInactive ? '✓ Mostrando inactivos' : 'Mostrar inactivos'}
            </Button>
          )}
          <Typography variant="body2" color="text.secondary">
            {(() => {
              const q = searchEmployee.trim().toLowerCase();
              let list = q
                ? employees.filter(e =>
                    [e.full_name, e.email, e.phone, e.role, e.employee_number, translateRole(e.role)]
                      .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
                  )
                : [...employees];
              if (filterRole) list = list.filter(e => e.role === filterRole);
              if (filterBranch) list = list.filter(e => filterBranch === 'none' ? !e.branch_id : String(e.branch_id) === filterBranch);
              if (filterIncompleto) list = list.filter(e => !e.expediente_completo);
              return `${list.length}${list.length !== employees.length ? ` de ${employees.length}` : ''} empleados`;
            })()}
          </Typography>
        </Box>
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: '#F05A28' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Empleado</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Rol</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Sucursal</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Tallas (P/C)</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Contacto Emergencia</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Expediente</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Checador</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Geocerca</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                // Mostrar skeletons mientras carga
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Skeleton variant="circular" width={40} height={40} />
                        <Box>
                          <Skeleton variant="text" width={120} />
                          <Skeleton variant="text" width={80} height={16} />
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell><Skeleton variant="rounded" width={80} height={24} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={90} height={24} /></TableCell>
                    <TableCell><Skeleton variant="text" width={60} /></TableCell>
                    <TableCell><Skeleton variant="text" width={100} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={80} height={24} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={80} height={24} /></TableCell>
                    <TableCell><Skeleton variant="text" width={60} /></TableCell>
                  </TableRow>
                ))
              ) : (() => {
                const q = searchEmployee.trim().toLowerCase();
                let filteredEmployees = q
                  ? employees.filter(e =>
                      [e.full_name, e.email, e.phone, e.role, e.employee_number, translateRole(e.role)]
                        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
                    )
                  : [...employees];
                if (filterRole) filteredEmployees = filteredEmployees.filter(e => e.role === filterRole);
                if (filterBranch) filteredEmployees = filteredEmployees.filter(e => filterBranch === 'none' ? !e.branch_id : String(e.branch_id) === filterBranch);
                if (filterIncompleto) filteredEmployees = filteredEmployees.filter(e => !e.expediente_completo);
                if (filteredEmployees.length === 0) {
                  return (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          {employees.length === 0 ? 'No hay empleados registrados' : 'Sin coincidencias para la búsqueda'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                }
                return filteredEmployees.map((emp) => (
                <TableRow key={emp.id} hover sx={emp.is_active === false || emp.is_blocked ? { opacity: 0.55, bgcolor: '#fafafa' } : undefined}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <EmployeeAvatar emp={emp} />
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight="bold">{emp.full_name}</Typography>
                          {(emp.is_active === false || emp.is_blocked) && (
                            <Chip label="DADO DE BAJA" size="small" color="error" sx={{ fontSize: 10, height: 20 }} />
                          )}
                        </Box>
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
                    {emp.branch_name ? (
                      <Chip label={emp.branch_name} size="small" icon={<BadgeIcon sx={{ fontSize: 14 }} />}
                        sx={{ bgcolor: '#FFF3EC', color: '#D6521C', fontWeight: 600, border: '1px solid #F0B79A' }} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">Sin sucursal</Typography>
                    )}
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
                    {emp.expediente_completo ? (
                      <Chip
                        label="Completo"
                        size="small"
                        color="success"
                        icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                        sx={{ fontWeight: 600 }}
                      />
                    ) : (
                      <Tooltip
                        title={
                          (emp.expediente_faltantes && emp.expediente_faltantes.length > 0)
                            ? <Box sx={{ p: 0.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                                  Faltantes:
                                </Typography>
                                {emp.expediente_faltantes.map((f, i) => (
                                  <Typography key={i} variant="caption" sx={{ display: 'block' }}>• {f}</Typography>
                                ))}
                              </Box>
                            : 'Expediente incompleto'
                        }
                        arrow
                      >
                        <Chip
                          label={`Incompleto${emp.expediente_faltantes ? ` (${emp.expediente_faltantes.length})` : ''}`}
                          size="small"
                          color="warning"
                          variant="outlined"
                          icon={<WarningIcon sx={{ fontSize: 16 }} />}
                          sx={{ fontWeight: 600, cursor: 'help' }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={emp.attendance_enabled ? 'Checador activo — ve "Checar Asistencia" en la app' : 'Checador apagado'}>
                      <Switch
                        size="small"
                        color="success"
                        checked={emp.attendance_enabled === true}
                        onChange={(e) => handleToggleAttendance(emp, e.target.checked)}
                        disabled={emp.is_active === false || emp.is_blocked}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip
                      title={
                        emp.geofence_required === true
                          ? 'Geocerca obligatoria (candado individual): debe estar en su sucursal para checar'
                          : 'Sigue la regla de su rol (mostrador y bodega la tienen). Actívalo para exigirla a esta persona.'
                      }
                    >
                      <Switch
                        size="small"
                        color="warning"
                        checked={emp.geofence_required === true}
                        onChange={(e) => handleToggleGeofence(emp, e.target.checked)}
                        disabled={emp.is_active === false || emp.is_blocked}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                      <Tooltip title="Ver Expediente">
                        <IconButton size="small" onClick={() => setViewProfileId(emp.id)}>
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton size="small" color="primary" onClick={() => handleOpenEditDialog(emp)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Equipo / Línea telefónica">
                        <IconButton size="small" sx={{ color: '#6d28d9' }} onClick={() => openPhoneDialog(emp)}>
                          <PhoneAndroidIcon />
                        </IconButton>
                      </Tooltip>
                      {!['advisor', 'asesor', 'asesor_lider', 'sub_advisor', 'sub_asesor'].includes(emp.role) && (
                        <Tooltip title="Vacaciones y Quinta">
                          <IconButton size="small" sx={{ color: '#0ea5e9' }} onClick={() => setVacQuintaEmp(emp)}>
                            <BeachAccessIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {(emp.is_active === false || emp.is_blocked) ? (
                        <Tooltip title="Reactivar empleado">
                          <IconButton size="small" sx={{ color: '#16a34a' }} onClick={() => handleReactivateEmployee(emp)}>
                            <CheckCircleIcon />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Dar de Baja">
                          <IconButton size="small" color="error" onClick={() => handleDeleteEmployee(emp)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ));
              })()}
            </TableBody>
          </Table>
        </TableContainer>
        </>
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
                          {emp.check_out_outside_geofence && (
                            <Tooltip title={emp.check_out_geofence_reason || 'Salida marcada para revisión'}>
                              <Chip
                                label={
                                  emp.check_out_geofence_distance_m != null
                                    ? `Salida fuera de zona · ${
                                        emp.check_out_geofence_distance_m >= 1000
                                          ? `${(emp.check_out_geofence_distance_m / 1000).toFixed(1)} km`
                                          : `${emp.check_out_geofence_distance_m} m`
                                      }`
                                    : 'Salida fuera de zona'
                                }
                                size="small"
                                color="error"
                                variant="outlined"
                                sx={{ ml: 1 }}
                              />
                            </Tooltip>
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

      {/* TAB 4: Organigrama */}
      {tab === 4 && <OrgChartTab />}

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
                  {EMPLOYEE_ROLES.filter(r => !r.superAdminOnly || isSuperAdmin).map((role) => (
                    <MenuItem key={role.value} value={role.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={role.label} color={role.color} size="small" variant="outlined" />
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={12}>
              <FormControl fullWidth>
                <InputLabel>Sucursal</InputLabel>
                <Select
                  value={newEmployee.branchId}
                  label="Sucursal"
                  onChange={(e) => setNewEmployee({ ...newEmployee, branchId: String(e.target.value) })}
                >
                  <MenuItem value="">Sin sucursal</MenuItem>
                  {branchesList.map((b) => (
                    <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {!editMode && (
            <Alert severity="info" sx={{ mt: 2 }}>
              La contraseña por defecto es <b>Entregax123.4</b>. El empleado completará sus datos personales (contacto de emergencia, tallas de uniforme) cuando inicie sesión en la app móvil.
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
        <DialogContent sx={{ py: 3 }}>
          <Typography variant="body1" gutterBottom sx={{ textAlign: 'center' }}>
            <strong>{tempPasswordInfo?.name}</strong> ha sido dado de alta.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, textAlign: 'center' }}>
            Comparte sus credenciales de acceso:
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f7f7f9' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Usuario</Typography>
              <Typography fontFamily="monospace" fontWeight="bold">{tempPasswordInfo?.email}</Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Contraseña</Typography>
              <Typography fontFamily="monospace" fontWeight="bold">{tempPasswordInfo?.password}</Typography>
            </Box>
          </Paper>
          <Button
            fullWidth
            variant="contained"
            startIcon={<CopyIcon />}
            onClick={() => copyToClipboard(`User: ${tempPasswordInfo?.email || ''}\nPass: ${tempPasswordInfo?.password || ''}`)}
            sx={{ mt: 2, bgcolor: '#D6521C', '&:hover': { bgcolor: '#B23F12' } }}
          >
            Compartir usuario (copiar)
          </Button>
          <Alert severity="info" sx={{ mt: 2, textAlign: 'left' }}>
            Se copia al portapapeles como <b>User / Pass</b>, listo para pegar en WhatsApp o correo.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTempPassword(false)} fullWidth>Entendido</Button>
        </DialogActions>
      </Dialog>

      {/* Equipo / Línea telefónica de la empresa */}
      <Dialog open={!!phoneEmp} onClose={() => !phoneSaving && setPhoneEmp(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800 }}>
          <PhoneAndroidIcon sx={{ color: '#6d28d9' }} /> Línea / Equipo telefónico
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Asigna a <strong>{phoneEmp?.full_name}</strong> un equipo del <strong>Inventario de Activos</strong> (categoría Telefonía) y captura los datos de la línea.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField select size="small" fullWidth label="Equipo asignado (del inventario)"
              value={phoneForm.asset_id} onChange={e => setPhoneForm({ ...phoneForm, asset_id: e.target.value })}
              helperText={phoneAssets.length === 0 ? 'No hay equipos de Telefonía disponibles. Da de alta uno en Inventario de Activos.' : 'Marca y modelo vienen del inventario'}>
              <MenuItem value="">— Sin equipo —</MenuItem>
              {phoneAssets.map(a => (
                <MenuItem key={a.id} value={String(a.id)}>
                  {[a.brand, a.model].filter(Boolean).join(' ') || a.sku}
                  {a.serial_number ? ` · S/N ${a.serial_number}` : ''} · {a.sku}
                  {a.assigned_to_user_id ? ' (actual)' : ''}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Número de teléfono" size="small" fullWidth placeholder="Ej. 81 1234 5678"
              value={phoneForm.phone_number} onChange={e => setPhoneForm({ ...phoneForm, phone_number: e.target.value })} />
            <TextField label="Línea registrada a nombre de" size="small" fullWidth placeholder="Nombre del titular de la línea"
              value={phoneForm.line_holder} onChange={e => setPhoneForm({ ...phoneForm, line_holder: e.target.value })} />
            <TextField label="Vencimiento de saldo" type="date" size="small" fullWidth
              InputLabelProps={{ shrink: true }} helperText="Para recargar el saldo a tiempo"
              value={phoneForm.balance_due_date} onChange={e => setPhoneForm({ ...phoneForm, balance_due_date: e.target.value })} />
            <TextField label="Notas (opcional)" size="small" fullWidth multiline rows={2}
              value={phoneForm.notes} onChange={e => setPhoneForm({ ...phoneForm, notes: e.target.value })} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPhoneEmp(null)} disabled={phoneSaving}>Cancelar</Button>
          <Button variant="contained" onClick={savePhone} disabled={phoneSaving}
            sx={{ bgcolor: '#6d28d9', '&:hover': { bgcolor: '#5b21b6' } }}>
            {phoneSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmación: dar de baja empleado */}
      <ConfirmDialog
        open={confirmDelete.open}
        onClose={() => !confirmDelete.loading && setConfirmDelete({ open: false, employee: null, loading: false })}
        onConfirm={performDeleteEmployee}
        title="¿Dar de baja a este empleado?"
        message={
          <>
            Estás a punto de dar de baja a <strong>{confirmDelete.employee?.full_name}</strong>.{' '}
            La cuenta quedará desactivada y no podrá iniciar sesión. Esta acción puede revertirse posteriormente desde administración.
          </>
        }
        confirmText="Sí, dar de baja"
        cancelText="Cancelar"
        severity="danger"
        loading={confirmDelete.loading}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4500}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{
            minWidth: 320,
            borderRadius: 2,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
            alignItems: 'center',
            '& .MuiAlert-icon': { fontSize: 22 },
            ...(snackbar.severity === 'success' && { bgcolor: '#16a34a' }),
            ...(snackbar.severity === 'error'   && { bgcolor: '#dc2626' }),
            ...(snackbar.severity === 'info'    && { bgcolor: '#0284c7' }),
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <VacationQuintaDialog
        open={!!vacQuintaEmp}
        employeeId={vacQuintaEmp?.id ?? null}
        employeeName={vacQuintaEmp?.full_name}
        onClose={() => setVacQuintaEmp(null)}
        onChange={() => loadEmployees()}
      />
    </Box>
  );
}
