import { useState, useEffect, useCallback } from 'react';
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
  TextField,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Tooltip,
  Divider,
  // LinearProgress, // No se usa actualmente
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Skeleton,
} from '@mui/material';
import {
  DirectionsCar as CarIcon,
  LocalShipping as TruckIcon,
  TwoWheeler as MotoIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Build as BuildIcon,
  Description as DocumentIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  // Edit as EditIcon, // No se usa actualmente
  // Delete as DeleteIcon, // No se usa actualmente
  Person as PersonIcon,
  Speed as SpeedIcon,
  // CalendarMonth as CalendarIcon, // No se usa actualmente
  AttachMoney as MoneyIcon,
  Notifications as AlertIcon,
  // PhotoCamera as CameraIcon, // No se usa actualmente
  Assignment as InspectionIcon,
  Timeline as TimelineIcon,
  // LocalGasStation as FuelIcon, // No se usa actualmente
} from '@mui/icons-material';

interface Vehicle {
  id: number;
  economic_number: string;
  vehicle_type: string;
  brand: string;
  model: string;
  year: number;
  vin_number: string;
  license_plates: string;
  color: string;
  fuel_type: string;
  current_mileage: number;
  status: string;
  assigned_driver_id: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  photo_url: string | null;
  health_status: string;
  health_issues: string[];
  expired_docs: number;
  expiring_soon_docs: number;
  next_service_km: number | null;
}

interface VehicleDocument {
  id: number;
  vehicle_id: number;
  document_type: string;
  provider_name: string;
  policy_number: string;
  issue_date: string;
  expiration_date: string;
  cost: number;
  file_url: string;
}

interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  service_type: string;
  description: string;
  service_date: string;
  mileage_at_service: number;
  cost: number;
  workshop_name: string;
  next_service_mileage: number | null;
  created_by_name: string;
}

interface Inspection {
  id: number;
  vehicle_id: number;
  driver_id: number;
  inspection_type: string;
  inspection_date: string;
  reported_mileage: number;
  is_cabin_clean: boolean;
  has_new_damage: boolean;
  damage_notes: string;
  manager_review_status: string;
  economic_number: string;
  driver_name: string;
}

interface FleetAlert {
  id: number;
  vehicle_id: number;
  alert_type: string;
  alert_level: string;
  title: string;
  description: string;
  due_date: string;
  economic_number: string;
}

interface DashboardData {
  vehicles: { active: number; in_shop: number; out_of_service: number; total: number };
  expiring_documents: VehicleDocument[];
  expired_documents: VehicleDocument[];
  need_service: Vehicle[];
  alerts: { critical: number; warning: number; total: number };
  today_inspections: { total: number; with_damage: number; dirty_cabin: number; pending_review: number };
  monthly_expenses: { maintenance: number };
}

interface Driver {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: string;
}

// Helpers
const getVehicleIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'camioneta':
    case 'van':
      return <CarIcon />;
    case 'tráiler':
    case 'trailer':
    case 'tractocamión':
      return <TruckIcon />;
    case 'motocicleta':
    case 'moto':
      return <MotoIcon />;
    default:
      return <CarIcon />;
  }
};

const getStatusColor = (status: string): "success" | "warning" | "error" | "default" => {
  switch (status) {
    case 'active': return 'success';
    case 'in_shop': return 'warning';
    case 'out_of_service': return 'error';
    default: return 'default';
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'active': return 'Activo';
    case 'in_shop': return 'En Taller';
    case 'out_of_service': return 'Fuera de Servicio';
    default: return status;
  }
};

const getHealthColor = (health: string): string => {
  switch (health) {
    case 'green': return '#4CAF50';
    case 'yellow': return '#FF9800';
    case 'red': return '#F44336';
    default: return '#9E9E9E';
  }
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX');
};

export default function FleetManagementPage() {
  const [tab, setTab] = useState(0);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleDetailOpen, setVehicleDetailOpen] = useState(false);
  const [vehicleDetailData, setVehicleDetailData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [addMaintenanceOpen, setAddMaintenanceOpen] = useState(false);
  const [assignDriverOpen, setAssignDriverOpen] = useState(false);

  // Forms
  const [newVehicle, setNewVehicle] = useState({
    economic_number: '',
    vehicle_type: 'Camioneta',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    license_plates: '',
    vin_number: '',
    color: '',
    fuel_type: 'Gasolina',
    current_mileage: 0
  });
  
  const [newDocument, setNewDocument] = useState({
    document_type: 'Seguro',
    provider_name: '',
    policy_number: '',
    issue_date: '',
    expiration_date: '',
    cost: 0
  });
  
  const [newMaintenance, setNewMaintenance] = useState({
    service_type: 'Preventivo',
    description: '',
    service_date: new Date().toISOString().split('T')[0],
    mileage_at_service: 0,
    cost: 0,
    workshop_name: '',
    next_service_mileage: 0
  });

  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const getToken = () => localStorage.getItem('token') || '';

  // Cargar datos
  const loadVehicles = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/fleet/vehicles`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setVehicles(res.data);
    } catch (error) {
      console.error('Error cargando vehículos:', error);
    }
  }, [API_URL]);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/fleet/dashboard`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setDashboard(res.data);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    }
  }, [API_URL]);

  const loadInspections = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/fleet/inspections?flagged_only=true`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setInspections(res.data);
    } catch (error) {
      console.error('Error cargando inspecciones:', error);
    }
  }, [API_URL]);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/fleet/alerts`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setAlerts(res.data);
    } catch (error) {
      console.error('Error cargando alertas:', error);
    }
  }, [API_URL]);

  const loadDrivers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/fleet/drivers`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setDrivers(res.data);
    } catch (error) {
      console.error('Error cargando conductores:', error);
    }
  }, [API_URL]);

  useEffect(() => {
    const loadAll = async () => {
      // Cargar vehículos primero y mostrar UI
      loadVehicles().finally(() => setLoading(false));
      // Cargar el resto en paralelo sin bloquear
      loadDashboard();
      loadInspections();
      loadAlerts();
      loadDrivers();
    };
    loadAll();
  }, [loadVehicles, loadDashboard, loadInspections, loadAlerts, loadDrivers]);

  // Cargar detalle de vehículo
  const loadVehicleDetail = async (vehicleId: number) => {
    setLoadingDetail(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/fleet/vehicles/${vehicleId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setVehicleDetailData(res.data);
    } catch (error) {
      console.error('Error cargando detalle:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleViewVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setVehicleDetailOpen(true);
    loadVehicleDetail(vehicle.id);
  };

  // Crear vehículo
  const handleCreateVehicle = async () => {
    try {
      await axios.post(`${API_URL}/api/admin/fleet/vehicles`, newVehicle, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setAddVehicleOpen(false);
      setNewVehicle({
        economic_number: '',
        vehicle_type: 'Camioneta',
        brand: '',
        model: '',
        year: new Date().getFullYear(),
        license_plates: '',
        vin_number: '',
        color: '',
        fuel_type: 'Gasolina',
        current_mileage: 0
      });
      loadVehicles();
      loadDashboard();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al crear vehículo');
    }
  };

  // Crear documento
  const handleCreateDocument = async () => {
    if (!selectedVehicle) return;
    try {
      await axios.post(`${API_URL}/api/admin/fleet/vehicles/${selectedVehicle.id}/documents`, newDocument, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setAddDocOpen(false);
      setNewDocument({
        document_type: 'Seguro',
        provider_name: '',
        policy_number: '',
        issue_date: '',
        expiration_date: '',
        cost: 0
      });
      loadVehicleDetail(selectedVehicle.id);
      loadDashboard();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al crear documento');
    }
  };

  // Crear mantenimiento
  const handleCreateMaintenance = async () => {
    if (!selectedVehicle) return;
    try {
      await axios.post(`${API_URL}/api/admin/fleet/vehicles/${selectedVehicle.id}/maintenance`, newMaintenance, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setAddMaintenanceOpen(false);
      setNewMaintenance({
        service_type: 'Preventivo',
        description: '',
        service_date: new Date().toISOString().split('T')[0],
        mileage_at_service: 0,
        cost: 0,
        workshop_name: '',
        next_service_mileage: 0
      });
      loadVehicleDetail(selectedVehicle.id);
      loadVehicles();
      loadDashboard();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al registrar mantenimiento');
    }
  };

  // Asignar conductor
  const handleAssignDriver = async () => {
    if (!selectedVehicle) return;
    try {
      await axios.post(`${API_URL}/api/admin/fleet/vehicles/${selectedVehicle.id}/assign-driver`, 
        { driver_id: selectedDriverId },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setAssignDriverOpen(false);
      setSelectedDriverId(null);
      loadVehicles();
      loadVehicleDetail(selectedVehicle.id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al asignar conductor');
    }
  };

  // Resolver alerta
  const handleResolveAlert = async (alertId: number) => {
    try {
      await axios.put(`${API_URL}/api/admin/fleet/alerts/${alertId}/resolve`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      loadAlerts();
      loadDashboard();
    } catch (error) {
      console.error('Error resolviendo alerta:', error);
    }
  };

  // Revisar inspección
  const handleReviewInspection = async (inspectionId: number, status: string) => {
    try {
      await axios.put(`${API_URL}/api/admin/fleet/inspections/${inspectionId}/review`, 
        { status },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      loadInspections();
      loadDashboard();
    } catch (error) {
      console.error('Error revisando inspección:', error);
    }
  };

  // Skeleton para KPI cards (disponible para uso futuro)
  const _KpiSkeleton = () => (
    <Card>
      <CardContent sx={{ textAlign: 'center', py: 2 }}>
        <Skeleton variant="text" width={60} height={50} sx={{ mx: 'auto' }} />
        <Skeleton variant="text" width={80} sx={{ mx: 'auto' }} />
      </CardContent>
    </Card>
  );
  void _KpiSkeleton; // Evitar warning de unused

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>🚛 Gestión de Flotilla</Typography>
          <Typography variant="body2" color="text.secondary">
            Control de vehículos, documentos, mantenimiento e inspecciones
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddVehicleOpen(true)}
          >
            Nueva Unidad
          </Button>
          <IconButton onClick={() => { loadVehicles(); loadDashboard(); loadAlerts(); }}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#E8F5E9' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h3" fontWeight={700} color="success.main">
                {dashboard ? dashboard.vehicles.active : <Skeleton width={40} sx={{ mx: 'auto' }} />}
              </Typography>
              <Typography variant="body2" color="text.secondary">Activas</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#FFF3E0' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h3" fontWeight={700} color="warning.main">
                {dashboard ? dashboard.vehicles.in_shop : <Skeleton width={40} sx={{ mx: 'auto' }} />}
              </Typography>
              <Typography variant="body2" color="text.secondary">En Taller</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#FFEBEE' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h3" fontWeight={700} color="error.main">
                {dashboard ? dashboard.alerts.critical : <Skeleton width={40} sx={{ mx: 'auto' }} />}
              </Typography>
              <Typography variant="body2" color="text.secondary">Alertas Críticas</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <Card sx={{ bgcolor: '#E3F2FD' }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h3" fontWeight={700} color="info.main">
                {dashboard ? dashboard.today_inspections.total : <Skeleton width={40} sx={{ mx: 'auto' }} />}
              </Typography>
              <Typography variant="body2" color="text.secondary">Inspecciones Hoy</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
            <Card sx={{ bgcolor: '#F3E5F5' }}>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h3" fontWeight={700} color="secondary.main">
                  {dashboard ? dashboard.expired_documents.length : <Skeleton width={40} sx={{ mx: 'auto' }} />}
                </Typography>
                <Typography variant="body2" color="text.secondary">Docs Vencidos</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h5" fontWeight={700}>
                  {dashboard ? formatCurrency(dashboard.monthly_expenses.maintenance) : <Skeleton width={80} sx={{ mx: 'auto' }} />}
                </Typography>
                <Typography variant="body2" color="text.secondary">Gastos Mes</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<CarIcon />} label="Vehículos" />
          <Tab icon={<AlertIcon />} label={`Alertas (${alerts.length})`} />
          <Tab icon={<InspectionIcon />} label={`Inspecciones (${inspections.length})`} />
          <Tab icon={<TimelineIcon />} label="Documentos por Vencer" />
        </Tabs>
      </Paper>

      {/* Tab 0: Vehículos */}
      {tab === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>Unidad</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Marca / Modelo</TableCell>
                <TableCell>Placas</TableCell>
                <TableCell align="right">Kilometraje</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Conductor</TableCell>
                <TableCell>Salud</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Skeleton variant="circular" width={40} height={40} />
                        <Skeleton width={60} />
                      </Box>
                    </TableCell>
                    <TableCell><Skeleton width={80} /></TableCell>
                    <TableCell><Skeleton width={120} /></TableCell>
                    <TableCell><Skeleton width={80} /></TableCell>
                    <TableCell><Skeleton width={60} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={70} height={24} /></TableCell>
                    <TableCell><Skeleton width={100} /></TableCell>
                    <TableCell><Skeleton width={60} /></TableCell>
                    <TableCell><Skeleton variant="circular" width={30} height={30} /></TableCell>
                  </TableRow>
                ))
              ) : vehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No hay vehículos registrados</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                vehicles.map((vehicle) => (
                <TableRow key={vehicle.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ bgcolor: getHealthColor(vehicle.health_status) }}>
                        {getVehicleIcon(vehicle.vehicle_type)}
                      </Avatar>
                      <Typography fontWeight={600}>{vehicle.economic_number}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{vehicle.vehicle_type}</TableCell>
                  <TableCell>
                    {vehicle.brand} {vehicle.model} {vehicle.year}
                  </TableCell>
                  <TableCell>{vehicle.license_plates}</TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={500}>
                      {vehicle.current_mileage?.toLocaleString()} km
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={getStatusLabel(vehicle.status)} 
                      color={getStatusColor(vehicle.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {vehicle.driver_name ? (
                      <Box>
                        <Typography variant="body2">{vehicle.driver_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {vehicle.driver_phone}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">Sin asignar</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {vehicle.health_issues.length > 0 ? (
                      <Tooltip title={vehicle.health_issues.join(', ')}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box 
                            sx={{ 
                              width: 12, 
                              height: 12, 
                              borderRadius: '50%', 
                              bgcolor: getHealthColor(vehicle.health_status) 
                            }} 
                          />
                          <Typography variant="caption">
                            {vehicle.health_issues.length} alerta(s)
                          </Typography>
                        </Box>
                      </Tooltip>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CheckCircleIcon sx={{ color: '#4CAF50', fontSize: 18 }} />
                        <Typography variant="caption" color="success.main">OK</Typography>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" onClick={() => handleViewVehicle(vehicle)}>
                      <ViewIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 1: Alertas */}
      {tab === 1 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>Nivel</TableCell>
                <TableCell>Unidad</TableCell>
                <TableCell>Alerta</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Fecha Límite</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Box sx={{ py: 4 }}>
                      <CheckCircleIcon sx={{ fontSize: 48, color: '#4CAF50', mb: 1 }} />
                      <Typography>¡Sin alertas pendientes!</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert) => (
                  <TableRow key={alert.id} hover sx={{ bgcolor: alert.alert_level === 'critical' ? '#FFEBEE' : 'inherit' }}>
                    <TableCell>
                      {alert.alert_level === 'critical' ? (
                        <Chip label="CRÍTICO" color="error" size="small" />
                      ) : (
                        <Chip label="Advertencia" color="warning" size="small" />
                      )}
                    </TableCell>
                    <TableCell>{alert.economic_number}</TableCell>
                    <TableCell>
                      <Typography fontWeight={600}>{alert.title}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{alert.description}</Typography>
                    </TableCell>
                    <TableCell>{formatDate(alert.due_date)}</TableCell>
                    <TableCell align="center">
                      <Button 
                        size="small" 
                        variant="outlined"
                        onClick={() => handleResolveAlert(alert.id)}
                      >
                        Resolver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 2: Inspecciones Flaggeadas */}
      {tab === 2 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>Fecha/Hora</TableCell>
                <TableCell>Unidad</TableCell>
                <TableCell>Conductor</TableCell>
                <TableCell align="right">Kilometraje</TableCell>
                <TableCell>Problemas</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {inspections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Box sx={{ py: 4 }}>
                      <CheckCircleIcon sx={{ fontSize: 48, color: '#4CAF50', mb: 1 }} />
                      <Typography>Sin inspecciones con problemas</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                inspections.map((insp) => (
                  <TableRow key={insp.id} hover>
                    <TableCell>
                      {new Date(insp.inspection_date).toLocaleString('es-MX')}
                    </TableCell>
                    <TableCell>{insp.economic_number}</TableCell>
                    <TableCell>{insp.driver_name}</TableCell>
                    <TableCell align="right">{insp.reported_mileage?.toLocaleString()} km</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {insp.has_new_damage && (
                          <Chip label="Daño Nuevo" color="error" size="small" />
                        )}
                        {!insp.is_cabin_clean && (
                          <Chip label="Cabina Sucia" color="warning" size="small" />
                        )}
                      </Box>
                      {insp.damage_notes && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {insp.damage_notes}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={insp.manager_review_status === 'pending' ? 'Pendiente' : 
                               insp.manager_review_status === 'reviewed' ? 'Revisado' : 'Flaggeado'}
                        color={insp.manager_review_status === 'pending' ? 'warning' : 
                               insp.manager_review_status === 'reviewed' ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Button 
                        size="small" 
                        variant="outlined"
                        color="success"
                        onClick={() => handleReviewInspection(insp.id, 'reviewed')}
                        disabled={insp.manager_review_status === 'reviewed'}
                      >
                        Aprobar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 3: Documentos por Vencer */}
      {tab === 3 && dashboard && (
        <Box>
          {dashboard.expired_documents.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              ⚠️ Tienes {dashboard.expired_documents.length} documento(s) vencido(s). ¡Renueva urgente!
            </Alert>
          )}
          
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="error">
                  🔴 Documentos Vencidos
                </Typography>
                <List>
                  {dashboard.expired_documents.length === 0 ? (
                    <ListItem>
                      <ListItemText primary="Sin documentos vencidos" />
                    </ListItem>
                  ) : (
                    dashboard.expired_documents.map((doc: any) => (
                      <ListItem key={doc.id}>
                        <ListItemIcon>
                          <CancelIcon color="error" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={`${doc.document_type} - ${doc.economic_number}`}
                          secondary={`Venció: ${formatDate(doc.expiration_date)} | ${doc.provider_name || 'N/A'}`}
                        />
                      </ListItem>
                    ))
                  )}
                </List>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom color="warning.main">
                  🟡 Por Vencer (30 días)
                </Typography>
                <List>
                  {dashboard.expiring_documents.length === 0 ? (
                    <ListItem>
                      <ListItemText primary="Sin documentos próximos a vencer" />
                    </ListItem>
                  ) : (
                    dashboard.expiring_documents.map((doc: any) => (
                      <ListItem key={doc.id}>
                        <ListItemIcon>
                          <WarningIcon color="warning" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={`${doc.document_type} - ${doc.economic_number}`}
                          secondary={`Vence: ${formatDate(doc.expiration_date)} | ${doc.provider_name || 'N/A'}`}
                        />
                      </ListItem>
                    ))
                  )}
                </List>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Dialog: Detalle de Vehículo */}
      <Dialog open={vehicleDetailOpen} onClose={() => setVehicleDetailOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: selectedVehicle ? getHealthColor(selectedVehicle.health_status) : '#ccc', width: 56, height: 56 }}>
              {selectedVehicle && getVehicleIcon(selectedVehicle.vehicle_type)}
            </Avatar>
            <Box>
              <Typography variant="h5">{selectedVehicle?.economic_number}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedVehicle?.brand} {selectedVehicle?.model} {selectedVehicle?.year} | {selectedVehicle?.license_plates}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDetail ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : vehicleDetailData && (
            <Box>
              {/* Info General */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <SpeedIcon color="primary" />
                      <Typography variant="h5">{vehicleDetailData.vehicle.current_mileage?.toLocaleString()}</Typography>
                      <Typography variant="caption">Kilometraje</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <MoneyIcon color="error" />
                      <Typography variant="h5">{formatCurrency(vehicleDetailData.expenses.maintenance)}</Typography>
                      <Typography variant="caption">Gasto Total Mantenimiento</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <BuildIcon color="warning" />
                      <Typography variant="h5">{vehicleDetailData.expenses.services_count}</Typography>
                      <Typography variant="caption">Servicios Realizados</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <PersonIcon color="info" />
                      <Typography variant="body1" fontWeight={600}>
                        {vehicleDetailData.vehicle.driver_name || 'Sin asignar'}
                      </Typography>
                      <Typography variant="caption">Conductor Actual</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Acciones Rápidas */}
              <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                <Button 
                  variant="outlined" 
                  startIcon={<PersonIcon />}
                  onClick={() => setAssignDriverOpen(true)}
                >
                  {vehicleDetailData.vehicle.driver_name ? 'Cambiar Conductor' : 'Asignar Conductor'}
                </Button>
                <Button 
                  variant="outlined" 
                  startIcon={<DocumentIcon />}
                  onClick={() => setAddDocOpen(true)}
                >
                  Agregar Documento
                </Button>
                <Button 
                  variant="outlined" 
                  startIcon={<BuildIcon />}
                  onClick={() => {
                    setNewMaintenance({ ...newMaintenance, mileage_at_service: vehicleDetailData.vehicle.current_mileage });
                    setAddMaintenanceOpen(true);
                  }}
                >
                  Registrar Servicio
                </Button>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Documentos */}
              <Typography variant="h6" gutterBottom>📄 Documentos Legales</Typography>
              {vehicleDetailData.documents.length === 0 ? (
                <Alert severity="info">Sin documentos registrados</Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tipo</TableCell>
                        <TableCell>Proveedor</TableCell>
                        <TableCell>Número</TableCell>
                        <TableCell>Vencimiento</TableCell>
                        <TableCell align="right">Costo</TableCell>
                        <TableCell>Estado</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {vehicleDetailData.documents.map((doc: VehicleDocument) => {
                        const isExpired = new Date(doc.expiration_date) < new Date();
                        const isExpiringSoon = !isExpired && new Date(doc.expiration_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                        return (
                          <TableRow key={doc.id}>
                            <TableCell>{doc.document_type}</TableCell>
                            <TableCell>{doc.provider_name || '—'}</TableCell>
                            <TableCell>{doc.policy_number || '—'}</TableCell>
                            <TableCell>{formatDate(doc.expiration_date)}</TableCell>
                            <TableCell align="right">{formatCurrency(doc.cost || 0)}</TableCell>
                            <TableCell>
                              {isExpired ? (
                                <Chip label="VENCIDO" color="error" size="small" />
                              ) : isExpiringSoon ? (
                                <Chip label="Por vencer" color="warning" size="small" />
                              ) : (
                                <Chip label="Vigente" color="success" size="small" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Historial de Mantenimiento */}
              <Typography variant="h6" gutterBottom>🔧 Historial de Mantenimiento</Typography>
              {vehicleDetailData.maintenance.length === 0 ? (
                <Alert severity="info">Sin servicios registrados</Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fecha</TableCell>
                        <TableCell>Tipo</TableCell>
                        <TableCell>Descripción</TableCell>
                        <TableCell align="right">Kilometraje</TableCell>
                        <TableCell align="right">Costo</TableCell>
                        <TableCell>Taller</TableCell>
                        <TableCell>Próx. Servicio</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {vehicleDetailData.maintenance.map((m: MaintenanceRecord) => (
                        <TableRow key={m.id}>
                          <TableCell>{formatDate(m.service_date)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={m.service_type} 
                              size="small"
                              color={m.service_type === 'Preventivo' ? 'success' : m.service_type === 'Correctivo' ? 'error' : 'default'}
                            />
                          </TableCell>
                          <TableCell>{m.description}</TableCell>
                          <TableCell align="right">{m.mileage_at_service?.toLocaleString()} km</TableCell>
                          <TableCell align="right">{formatCurrency(m.cost || 0)}</TableCell>
                          <TableCell>{m.workshop_name || '—'}</TableCell>
                          <TableCell>
                            {m.next_service_mileage ? `${m.next_service_mileage.toLocaleString()} km` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Alertas Activas */}
              {vehicleDetailData.alerts.length > 0 && (
                <>
                  <Typography variant="h6" gutterBottom color="error">⚠️ Alertas Activas</Typography>
                  <List>
                    {vehicleDetailData.alerts.map((alert: FleetAlert) => (
                      <ListItem key={alert.id}>
                        <ListItemIcon>
                          <WarningIcon color={alert.alert_level === 'critical' ? 'error' : 'warning'} />
                        </ListItemIcon>
                        <ListItemText 
                          primary={alert.title}
                          secondary={alert.description}
                        />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVehicleDetailOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Agregar Vehículo */}
      <Dialog open={addVehicleOpen} onClose={() => setAddVehicleOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nueva Unidad</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Número Económico"
                value={newVehicle.economic_number}
                onChange={(e) => setNewVehicle({ ...newVehicle, economic_number: e.target.value })}
                placeholder="Ej: Unidad-06"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select
                  value={newVehicle.vehicle_type}
                  label="Tipo"
                  onChange={(e) => setNewVehicle({ ...newVehicle, vehicle_type: e.target.value })}
                >
                  <MenuItem value="Camioneta">Camioneta</MenuItem>
                  <MenuItem value="Van">Van</MenuItem>
                  <MenuItem value="Tráiler">Tráiler</MenuItem>
                  <MenuItem value="Tractocamión">Tractocamión</MenuItem>
                  <MenuItem value="Motocicleta">Motocicleta</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Marca"
                value={newVehicle.brand}
                onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Modelo"
                value={newVehicle.model}
                onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Año"
                type="number"
                value={newVehicle.year}
                onChange={(e) => setNewVehicle({ ...newVehicle, year: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Placas"
                value={newVehicle.license_plates}
                onChange={(e) => setNewVehicle({ ...newVehicle, license_plates: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Número de Serie (VIN)"
                value={newVehicle.vin_number}
                onChange={(e) => setNewVehicle({ ...newVehicle, vin_number: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Kilometraje Actual"
                type="number"
                value={newVehicle.current_mileage}
                onChange={(e) => setNewVehicle({ ...newVehicle, current_mileage: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Combustible</InputLabel>
                <Select
                  value={newVehicle.fuel_type}
                  label="Combustible"
                  onChange={(e) => setNewVehicle({ ...newVehicle, fuel_type: e.target.value })}
                >
                  <MenuItem value="Gasolina">Gasolina</MenuItem>
                  <MenuItem value="Diésel">Diésel</MenuItem>
                  <MenuItem value="Gas LP">Gas LP</MenuItem>
                  <MenuItem value="Híbrido">Híbrido</MenuItem>
                  <MenuItem value="Eléctrico">Eléctrico</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddVehicleOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateVehicle}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Agregar Documento */}
      <Dialog open={addDocOpen} onClose={() => setAddDocOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Agregar Documento - {selectedVehicle?.economic_number}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Documento</InputLabel>
                <Select
                  value={newDocument.document_type}
                  label="Tipo de Documento"
                  onChange={(e) => setNewDocument({ ...newDocument, document_type: e.target.value })}
                >
                  <MenuItem value="Seguro">Seguro</MenuItem>
                  <MenuItem value="Tenencia">Tenencia</MenuItem>
                  <MenuItem value="Tarjeta Circulación">Tarjeta de Circulación</MenuItem>
                  <MenuItem value="Verificación">Verificación Vehicular</MenuItem>
                  <MenuItem value="Permiso SCT">Permiso SCT</MenuItem>
                  <MenuItem value="Otro">Otro</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Proveedor"
                value={newDocument.provider_name}
                onChange={(e) => setNewDocument({ ...newDocument, provider_name: e.target.value })}
                placeholder="Ej: Quálitas, GNP"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Número de Póliza/Folio"
                value={newDocument.policy_number}
                onChange={(e) => setNewDocument({ ...newDocument, policy_number: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Fecha de Emisión"
                type="date"
                value={newDocument.issue_date}
                onChange={(e) => setNewDocument({ ...newDocument, issue_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Fecha de Vencimiento"
                type="date"
                value={newDocument.expiration_date}
                onChange={(e) => setNewDocument({ ...newDocument, expiration_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Costo"
                type="number"
                value={newDocument.cost}
                onChange={(e) => setNewDocument({ ...newDocument, cost: parseFloat(e.target.value) })}
                InputProps={{ startAdornment: '$' }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDocOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateDocument}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Registrar Mantenimiento */}
      <Dialog open={addMaintenanceOpen} onClose={() => setAddMaintenanceOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Registrar Servicio - {selectedVehicle?.economic_number}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Servicio</InputLabel>
                <Select
                  value={newMaintenance.service_type}
                  label="Tipo de Servicio"
                  onChange={(e) => setNewMaintenance({ ...newMaintenance, service_type: e.target.value })}
                >
                  <MenuItem value="Preventivo">Preventivo</MenuItem>
                  <MenuItem value="Correctivo">Correctivo</MenuItem>
                  <MenuItem value="Llantas">Llantas</MenuItem>
                  <MenuItem value="Frenos">Frenos</MenuItem>
                  <MenuItem value="Afinación">Afinación</MenuItem>
                  <MenuItem value="Hojalatería">Hojalatería</MenuItem>
                  <MenuItem value="Otro">Otro</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Fecha de Servicio"
                type="date"
                value={newMaintenance.service_date}
                onChange={(e) => setNewMaintenance({ ...newMaintenance, service_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Descripción del Trabajo"
                value={newMaintenance.description}
                onChange={(e) => setNewMaintenance({ ...newMaintenance, description: e.target.value })}
                placeholder="Ej: Cambio de aceite, filtros y revisión general"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Kilometraje al Servicio"
                type="number"
                value={newMaintenance.mileage_at_service}
                onChange={(e) => setNewMaintenance({ ...newMaintenance, mileage_at_service: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Costo Total"
                type="number"
                value={newMaintenance.cost}
                onChange={(e) => setNewMaintenance({ ...newMaintenance, cost: parseFloat(e.target.value) })}
                InputProps={{ startAdornment: '$' }}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Taller / Mecánico"
                value={newMaintenance.workshop_name}
                onChange={(e) => setNewMaintenance({ ...newMaintenance, workshop_name: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Próximo Servicio (km)"
                type="number"
                value={newMaintenance.next_service_mileage}
                onChange={(e) => setNewMaintenance({ ...newMaintenance, next_service_mileage: parseInt(e.target.value) })}
                placeholder="Ej: 50000"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddMaintenanceOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateMaintenance}>Registrar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Asignar Conductor */}
      <Dialog open={assignDriverOpen} onClose={() => setAssignDriverOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Asignar Conductor - {selectedVehicle?.economic_number}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Seleccionar Conductor</InputLabel>
            <Select
              value={selectedDriverId || ''}
              label="Seleccionar Conductor"
              onChange={(e) => setSelectedDriverId(e.target.value as number)}
            >
              <MenuItem value="">
                <em>Sin asignar</em>
              </MenuItem>
              {drivers.map((driver) => (
                <MenuItem key={driver.id} value={driver.id}>
                  {driver.full_name} ({driver.role})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDriverOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleAssignDriver}>Asignar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
