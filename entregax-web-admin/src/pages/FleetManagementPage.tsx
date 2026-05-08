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
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Speed as SpeedIcon,
  // CalendarMonth as CalendarIcon, // No se usa actualmente
  AttachMoney as MoneyIcon,
  Notifications as AlertIcon,
  // PhotoCamera as CameraIcon, // No se usa actualmente
  Assignment as InspectionIcon,
  Timeline as TimelineIcon,
  Close as CloseIcon,
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
    case 'sedán':
    case 'sedan':
    case 'camioneta':
    case 'van':
      return <CarIcon />;
    case 'tráiler':
    case 'trailer':
    case 'tractocamión':
    case 'camión 3.5 ton':
    case 'camion 3.5 ton':
    case 'montacargas':
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
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
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
    current_mileage: 0,
    branch_id: '' as number | '',
    photo_front_url: '',
    photo_back_url: '',
    photo_left_url: '',
    photo_right_url: ''
  });
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  
  const [newDocument, setNewDocument] = useState({
    document_type: 'Seguro',
    provider_name: '',
    policy_number: '',
    issue_date: '',
    expiration_date: '',
    cost: 0,
    file_url: ''
  });
  const [uploadingDocFile, setUploadingDocFile] = useState(false);
  const [uploadingVehiclePhoto, setUploadingVehiclePhoto] = useState<string>(''); // 'front'|'back'|'left'|'right' or ''
  const [uploadingMaintenancePhoto, setUploadingMaintenancePhoto] = useState(false);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  
  const [newMaintenance, setNewMaintenance] = useState({
    service_type: 'Preventivo',
    description: '',
    service_date: new Date().toISOString().split('T')[0],
    mileage_at_service: 0,
    cost: 0,
    workshop_name: '',
    next_service_mileage: 0,
    invoice_photo_url: ''
  });

  // Lightbox para ver fotos del vehículo en modal (no abrir nueva pestaña)
  const [photoLightbox, setPhotoLightbox] = useState<{ url: string; label: string } | null>(null);
  // Visor de archivos de documentos (PDF / imagen) en modal
  const [documentViewer, setDocumentViewer] = useState<{ url: string; label: string } | null>(null);

  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [assignBranchOpen, setAssignBranchOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<number | ''>('');
  const [deleteVehicleOpen, setDeleteVehicleOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState(false);

  // Rol del usuario actual (para mostrar botón eliminar solo a super_admin)
  const currentUserRole = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? (JSON.parse(raw).role || '').toLowerCase() : '';
    } catch {
      return '';
    }
  })();
  const isSuperAdmin = currentUserRole === 'super_admin';
  // Edición de vehículos: sólo admin y super_admin
  const canEditVehicle = ['super_admin', 'admin'].includes(currentUserRole);
  // Roles que pueden ver el detalle (👁) de la unidad pero NO editar/eliminar
  const canViewVehicle = isSuperAdmin
    || currentUserRole === 'branch_manager'
    || currentUserRole === 'counter_staff';

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

  const loadBranches = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/branches`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = res.data;
      const list = Array.isArray(data) ? data : (Array.isArray(data?.branches) ? data.branches : []);
      setBranches(list);
    } catch (error) {
      console.error('Error cargando sucursales:', error);
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
      loadBranches();
    };
    loadAll();
  }, [loadVehicles, loadDashboard, loadInspections, loadAlerts, loadDrivers, loadBranches]);

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

  // Crear o actualizar vehículo
  const handleCreateVehicle = async () => {
    try {
      if (editingVehicleId) {
        await axios.put(`${API_URL}/api/admin/fleet/vehicles/${editingVehicleId}`, newVehicle, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      } else {
        await axios.post(`${API_URL}/api/admin/fleet/vehicles`, newVehicle, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      }
      setAddVehicleOpen(false);
      setEditingVehicleId(null);
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
        current_mileage: 0,
        branch_id: '',
        photo_front_url: '',
        photo_back_url: '',
        photo_left_url: '',
        photo_right_url: ''
      });
      loadVehicles();
      loadDashboard();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al guardar vehículo');
    }
  };

  const handleEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicleId(vehicle.id);
    setNewVehicle({
      economic_number: vehicle.economic_number || '',
      vehicle_type: vehicle.vehicle_type || 'Camioneta',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      year: vehicle.year || new Date().getFullYear(),
      license_plates: vehicle.license_plates || '',
      vin_number: (vehicle as any).vin_number || '',
      color: (vehicle as any).color || '',
      fuel_type: (vehicle as any).fuel_type || 'Gasolina',
      current_mileage: vehicle.current_mileage || 0,
      branch_id: (vehicle as any).branch_id ?? '',
      photo_front_url: (vehicle as any).photo_front_url || '',
      photo_back_url: (vehicle as any).photo_back_url || '',
      photo_left_url: (vehicle as any).photo_left_url || '',
      photo_right_url: (vehicle as any).photo_right_url || ''
    });
    setAddVehicleOpen(true);
  };

  // Crear o actualizar documento
  const handleCreateDocument = async () => {
    if (!selectedVehicle) return;
    // Sanitiza el payload: campos opcionales vacíos van como null para que la BD no falle
    const blankToNull = (v: string | undefined | null) => (v && String(v).trim().length > 0 ? v : null);
    const numOrNull = (v: number | string | undefined | null) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const payload = {
      document_type: newDocument.document_type,
      provider_name: blankToNull(newDocument.provider_name),
      policy_number: blankToNull(newDocument.policy_number),
      issue_date: blankToNull(newDocument.issue_date),
      expiration_date: blankToNull(newDocument.expiration_date),
      cost: numOrNull(newDocument.cost),
      file_url: blankToNull(newDocument.file_url),
    };
    try {
      if (editingDocId) {
        await axios.put(`${API_URL}/api/admin/fleet/documents/${editingDocId}`, payload, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      } else {
        await axios.post(`${API_URL}/api/admin/fleet/vehicles/${selectedVehicle.id}/documents`, payload, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
      }
      setAddDocOpen(false);
      setEditingDocId(null);
      setNewDocument({
        document_type: 'Seguro',
        provider_name: '',
        policy_number: '',
        issue_date: '',
        expiration_date: '',
        cost: 0,
        file_url: ''
      });
      loadVehicleDetail(selectedVehicle.id);
      loadVehicles();
      loadDashboard();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al guardar documento');
    }
  };

  // Iniciar edición de un documento
  const handleEditDocument = (doc: VehicleDocument) => {
    setEditingDocId(doc.id);
    setNewDocument({
      document_type: doc.document_type || 'Seguro',
      provider_name: doc.provider_name || '',
      policy_number: doc.policy_number || '',
      issue_date: doc.issue_date ? String(doc.issue_date).split('T')[0] : '',
      expiration_date: doc.expiration_date ? String(doc.expiration_date).split('T')[0] : '',
      cost: Number(doc.cost) || 0,
      file_url: doc.file_url || ''
    });
    setAddDocOpen(true);
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
        next_service_mileage: 0,
        invoice_photo_url: ''
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
  // Descarga TODOS los archivos del vehículo (4 fotos + N documentos legales) en un .zip
  const [downloadingZip, setDownloadingZip] = useState(false);
  const handleDownloadAllFiles = async () => {
    if (!selectedVehicle || !vehicleDetailData) return;
    setDownloadingZip(true);
    try {
      const JSZipMod = (await import('jszip')).default;
      const zip = new JSZipMod();
      const econ = selectedVehicle.economic_number || `vehicle-${selectedVehicle.id}`;

      // Helpers
      const slug = (s: string) => String(s || '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
      const guessExt = (url: string, fallback = 'bin'): string => {
        const m = String(url).split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
        return m ? m[1].toLowerCase() : fallback;
      };
      const fetchAsBlob = async (url: string): Promise<Blob | null> => {
        try {
          const r = await fetch(url, { mode: 'cors' });
          if (!r.ok) return null;
          return await r.blob();
        } catch {
          return null;
        }
      };

      const failed: string[] = [];

      // 1) Fotos del vehículo (4 lados)
      const photoSides: { side: string; url?: string }[] = [
        { side: 'frente', url: vehicleDetailData?.vehicle?.photo_front_url },
        { side: 'atras', url: vehicleDetailData?.vehicle?.photo_back_url },
        { side: 'lado_izquierdo', url: vehicleDetailData?.vehicle?.photo_left_url },
        { side: 'lado_derecho', url: vehicleDetailData?.vehicle?.photo_right_url },
      ];
      const fotosFolder = zip.folder('fotos');
      for (const { side, url } of photoSides) {
        if (!url || !fotosFolder) continue;
        const blob = await fetchAsBlob(url);
        if (blob) {
          fotosFolder.file(`${side}.${guessExt(url, 'jpg')}`, blob);
        } else {
          failed.push(`Foto ${side}`);
        }
      }

      // 2) Documentos legales
      const docsFolder = zip.folder('documentos');
      for (const doc of (vehicleDetailData.documents || []) as VehicleDocument[]) {
        if (!doc.file_url || !docsFolder) continue;
        const blob = await fetchAsBlob(doc.file_url);
        if (blob) {
          const name = `${slug(doc.document_type)}${doc.policy_number ? `_${slug(doc.policy_number)}` : ''}.${guessExt(doc.file_url, 'pdf')}`;
          docsFolder.file(name, blob);
        } else {
          failed.push(doc.document_type);
        }
      }

      if (failed.length > 0) {
        zip.file('README.txt', `Estos archivos no se pudieron descargar (revisa permisos S3/CORS):\n- ${failed.join('\n- ')}\n`);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      // Trigger descarga
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `${slug(econ)}_documentos.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      alert((err instanceof Error ? err.message : null) || 'Error al generar el archivo .zip');
    } finally {
      setDownloadingZip(false);
    }
  };

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
          {canViewVehicle && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setAddVehicleOpen(true)}
            >
              Nueva Unidad
            </Button>
          )}
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
                <TableCell>Ubicación</TableCell>
                <TableCell align="right">Kilometraje</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Conductor</TableCell>
                <TableCell>Documentación</TableCell>
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
                    <TableCell><Skeleton width={100} /></TableCell>
                    <TableCell><Skeleton width={60} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={70} height={24} /></TableCell>
                    <TableCell><Skeleton width={100} /></TableCell>
                    <TableCell><Skeleton variant="rounded" width={90} height={24} /></TableCell>
                    <TableCell><Skeleton width={60} /></TableCell>
                    <TableCell><Skeleton variant="circular" width={30} height={30} /></TableCell>
                  </TableRow>
                ))
              ) : vehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
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
                  <TableCell>
                    {(vehicle as any).branch_name ? (
                      <Chip label={(vehicle as any).branch_name} size="small" variant="outlined" />
                    ) : (
                      <Typography variant="caption" color="text.secondary">Sin asignar</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={500}>
                      {vehicle.current_mileage?.toLocaleString()} {vehicle.vehicle_type === 'Montacargas' ? 'hrs' : 'km'}
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
                    {(vehicle as any).documents_complete ? (
                      <Chip label="Completo" color="success" size="small" />
                    ) : (
                      <Tooltip
                        title={
                          ((vehicle as any).missing_required_docs || []).length > 0
                            ? `Faltan: ${((vehicle as any).missing_required_docs || []).join(', ')}`
                            : 'Documentación incompleta'
                        }
                      >
                        <Chip label="Incompleto" color="error" size="small" />
                      </Tooltip>
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
                    {canViewVehicle ? (
                      <>
                        <Tooltip title="Ver detalle">
                          <IconButton size="small" onClick={() => handleViewVehicle(vehicle)}>
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        {canEditVehicle && (
                          <Tooltip title="Editar">
                            <IconButton size="small" color="primary" onClick={() => handleEditVehicle(vehicle)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isSuperAdmin && (
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                setVehicleToDelete(vehicle);
                                setDeleteVehicleOpen(true);
                              }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </>
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
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
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5">{selectedVehicle?.economic_number}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedVehicle?.brand} {selectedVehicle?.model} {selectedVehicle?.year} | {selectedVehicle?.license_plates}
              </Typography>
            </Box>
            {vehicleDetailData && (
              <Tooltip title="Descarga las 4 fotos + todos los documentos legales en un .zip">
                <span>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleDownloadAllFiles}
                    disabled={downloadingZip}
                    startIcon={downloadingZip ? <CircularProgress size={14} /> : <DocumentIcon />}
                  >
                    {downloadingZip ? 'Generando…' : 'Descargar documentos'}
                  </Button>
                </span>
              </Tooltip>
            )}
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
                      <Typography variant="h5">
                        {vehicleDetailData.vehicle.current_mileage?.toLocaleString()}
                        <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                          {vehicleDetailData.vehicle.vehicle_type === 'Montacargas' ? 'hrs' : 'km'}
                        </Typography>
                      </Typography>
                      <Typography variant="caption">
                        {vehicleDetailData.vehicle.vehicle_type === 'Montacargas' ? 'Horas de Uso' : 'Kilometraje'}
                      </Typography>
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
                  startIcon={<TruckIcon />}
                  onClick={() => {
                    setSelectedBranchId(vehicleDetailData.vehicle.branch_id || '');
                    setAssignBranchOpen(true);
                  }}
                >
                  {vehicleDetailData.vehicle.branch_id ? 'Cambiar Ubicación' : 'Asignar Ubicación'}
                </Button>
                <Button 
                  variant="outlined" 
                  startIcon={<DocumentIcon />}
                  onClick={() => {
                    setEditingDocId(null);
                    const allTypes = ['Seguro', 'Tenencia', 'Tarjeta Circulación', 'Factura', 'Constancia', 'Verificación', 'Permiso SCT'];
                    const used = new Set<string>((vehicleDetailData?.documents || []).map((d: VehicleDocument) => d.document_type));
                    const firstAvailable = allTypes.find((t) => !used.has(t)) || 'Otro';
                    setNewDocument({
                      document_type: firstAvailable,
                      provider_name: '',
                      policy_number: '',
                      issue_date: '',
                      expiration_date: '',
                      cost: 0,
                      file_url: ''
                    });
                    setAddDocOpen(true);
                  }}
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

              {/* Fotos del vehículo (4 lados) - con upload directo */}
              {(() => {
                const v: any = vehicleDetailData.vehicle;
                const sides = [
                  { side: 'front' as const, label: 'Frente', url: v.photo_front_url, field: 'photo_front_url' },
                  { side: 'back' as const, label: 'Atrás', url: v.photo_back_url, field: 'photo_back_url' },
                  { side: 'left' as const, label: 'Lado Izquierdo', url: v.photo_left_url, field: 'photo_left_url' },
                  { side: 'right' as const, label: 'Lado Derecho', url: v.photo_right_url, field: 'photo_right_url' },
                ];
                const handleDetailPhotoUpload = async (file: File, side: string, field: string) => {
                  if (!selectedVehicle) return;
                  try {
                    setUploadingVehiclePhoto(`detail-${side}`);
                    const formData = new FormData();
                    formData.append('file', file);
                    const res = await axios.post(`${API_URL}/api/uploads/evidence`, formData, {
                      headers: {
                        Authorization: `Bearer ${getToken()}`,
                        'Content-Type': 'multipart/form-data',
                      },
                    });
                    await axios.put(
                      `${API_URL}/api/admin/fleet/vehicles/${selectedVehicle.id}`,
                      { [field]: res.data.url },
                      { headers: { Authorization: `Bearer ${getToken()}` } }
                    );
                    loadVehicleDetail(selectedVehicle.id);
                    loadVehicles();
                  } catch (err: any) {
                    alert(err.response?.data?.message || err.response?.data?.error || 'Error al subir foto');
                  } finally {
                    setUploadingVehiclePhoto('');
                  }
                };
                return (
                  <>
                    <Typography variant="h6" sx={{ mb: 1 }}>📸 Fotos de la Unidad</Typography>
                    <Grid container spacing={1} sx={{ mb: 2 }}>
                      {sides.map(({ side, label, url, field }) => {
                        const isUploading = uploadingVehiclePhoto === `detail-${side}`;
                        return (
                          <Grid key={side} size={{ xs: 6, sm: 3 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                              {url ? (
                                <Box
                                  onClick={() => setPhotoLightbox({ url, label })}
                                  sx={{ display: 'block', cursor: 'pointer', width: '100%', position: 'relative',
                                    '&:hover .xpay-zoom-icon': { opacity: 1 } }}
                                >
                                  <Box
                                    component="img"
                                    src={url}
                                    alt={label}
                                    sx={{ width: '100%', height: 320, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd' }}
                                  />
                                  <Box className="xpay-zoom-icon" sx={{
                                    position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.55)',
                                    color: '#fff', borderRadius: '50%', width: 32, height: 32,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 16, opacity: 0, transition: 'opacity 0.2s',
                                  }}>🔍</Box>
                                </Box>
                              ) : (
                                <Box
                                  sx={{
                                    width: '100%',
                                    height: 320,
                                    borderRadius: 1,
                                    border: '1px dashed #bbb',
                                    bgcolor: '#fafafa',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'text.secondary',
                                    fontSize: 48,
                                  }}
                                >
                                  📷
                                </Box>
                              )}
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {label}
                              </Typography>
                              <Button
                                fullWidth
                                size="small"
                                variant={url ? 'outlined' : 'contained'}
                                component="label"
                                disabled={isUploading}
                              >
                                {isUploading ? 'Subiendo...' : url ? 'Reemplazar' : 'Subir'}
                                <input
                                  type="file"
                                  hidden
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleDetailPhotoUpload(file, side, field);
                                    e.target.value = '';
                                  }}
                                />
                              </Button>
                            </Box>
                          </Grid>
                        );
                      })}
                    </Grid>
                    <Divider sx={{ my: 2 }} />
                  </>
                );
              })()}

              {/* Documentos Obligatorios - Checklist */}
              {(() => {
                const required = ['Tenencia', 'Tarjeta Circulación', 'Seguro', 'Factura', 'Constancia'];
                const now = new Date();
                // Documento sin fecha de vencimiento => "no caduca", se considera válido
                const isValid = (d: VehicleDocument) => {
                  if (!d.expiration_date) return true;
                  const exp = new Date(d.expiration_date);
                  return Number.isFinite(exp.getTime()) && exp >= now;
                };
                const isExpired = (d: VehicleDocument) => {
                  if (!d.expiration_date) return false; // sin fecha = no caduca
                  const exp = new Date(d.expiration_date);
                  return Number.isFinite(exp.getTime()) && exp < now;
                };
                const status = required.map((reqType) => {
                  const matches = vehicleDetailData.documents.filter(
                    (d: VehicleDocument) => d.document_type === reqType
                  );
                  const valid = matches.find(isValid);
                  const expired = matches.find(isExpired);
                  if (valid) return { type: reqType, state: 'ok' as const, doc: valid };
                  if (expired) return { type: reqType, state: 'expired' as const, doc: expired };
                  return { type: reqType, state: 'missing' as const, doc: null };
                });
                const missingCount = status.filter((s) => s.state !== 'ok').length;
                return (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      ✅ Documentos Obligatorios
                      {missingCount > 0 ? (
                        <Chip
                          label={`${missingCount} pendiente${missingCount > 1 ? 's' : ''}`}
                          color="error"
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      ) : (
                        <Chip label="Completo" color="success" size="small" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                    <Grid container spacing={1}>
                      {status.map((s) => (
                        <Grid size={{ xs: 12, sm: 6, md: 'auto' }} sx={{ flex: { md: '1 1 0' }, minWidth: { md: 0 }, display: 'flex' }} key={s.type}>
                          <Card
                            variant="outlined"
                            sx={{
                              borderColor:
                                s.state === 'ok'
                                  ? 'success.main'
                                  : s.state === 'expired'
                                  ? 'error.main'
                                  : 'warning.main',
                              borderWidth: 2,
                              width: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                            }}
                          >
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 }, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="body2" fontWeight={700}>
                                  {s.type}
                                </Typography>
                                {s.state === 'ok' && <Chip label="✓ Vigente" color="success" size="small" />}
                                {s.state === 'expired' && <Chip label="VENCIDO" color="error" size="small" />}
                                {s.state === 'missing' && <Chip label="FALTANTE" color="warning" size="small" />}
                              </Box>
                              {s.doc ? (
                                <Typography variant="caption" color="text.secondary">
                                  Vence: {formatDate(s.doc.expiration_date)}
                                </Typography>
                              ) : (
                                <Typography variant="caption" color="text.secondary">
                                  No registrado
                                </Typography>
                              )}
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                );
              })()}

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
                        <TableCell align="center">Archivo</TableCell>
                        <TableCell align="center">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {vehicleDetailData.documents.map((doc: VehicleDocument) => {
                        // Sin fecha => "no caduca" (vigente)
                        const hasExpiration = !!doc.expiration_date;
                        const expDate = hasExpiration ? new Date(doc.expiration_date) : null;
                        const isExpired = !!(expDate && Number.isFinite(expDate.getTime()) && expDate < new Date());
                        const isExpiringSoon = !!(expDate && Number.isFinite(expDate.getTime()) && !isExpired && expDate < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
                        return (
                          <TableRow key={doc.id}>
                            <TableCell>{doc.document_type}</TableCell>
                            <TableCell>{doc.provider_name || '—'}</TableCell>
                            <TableCell>{doc.policy_number || '—'}</TableCell>
                            <TableCell>{hasExpiration ? formatDate(doc.expiration_date) : 'Sin Vigencia'}</TableCell>
                            <TableCell align="right">{formatCurrency(doc.cost || 0)}</TableCell>
                            <TableCell>
                              {!hasExpiration ? (
                                <Chip label="Sin Vigencia" color="info" size="small" />
                              ) : isExpired ? (
                                <Chip label="VENCIDO" color="error" size="small" />
                              ) : isExpiringSoon ? (
                                <Chip label="Por vencer" color="warning" size="small" />
                              ) : (
                                <Chip label="Vigente" color="success" size="small" />
                              )}
                            </TableCell>
                            <TableCell align="center">
                              {doc.file_url ? (
                                <Button
                                  size="small"
                                  onClick={() => setDocumentViewer({ url: doc.file_url, label: doc.document_type })}
                                  startIcon={<DocumentIcon fontSize="small" />}
                                >
                                  Ver
                                </Button>
                              ) : (doc as any).file_restricted ? (
                                <Chip
                                  label="🔒 Acceso restringido"
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  title="Solo super admin, admin y director pueden ver este archivo"
                                />
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            <TableCell align="center">
                              <Button
                                size="small"
                                color="primary"
                                variant="outlined"
                                startIcon={<EditIcon fontSize="small" />}
                                onClick={() => handleEditDocument(doc)}
                              >
                                Renovar
                              </Button>
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

      {/* Dialog: Agregar / Editar Vehículo */}
      <Dialog open={addVehicleOpen} onClose={() => { setAddVehicleOpen(false); setEditingVehicleId(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingVehicleId ? 'Editar Unidad' : 'Nueva Unidad'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Número Económico"
                value={newVehicle.economic_number}
                onChange={(e) => setNewVehicle({ ...newVehicle, economic_number: e.target.value })}
                placeholder={editingVehicleId ? 'Ej: X-001' : '🔢 Auto (X-001, X-002…)'}
                helperText={editingVehicleId ? '' : 'Déjalo vacío para asignar automáticamente'}
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
                  <MenuItem value="Sedán">Sedán</MenuItem>
                  <MenuItem value="Camioneta">Camioneta</MenuItem>
                  <MenuItem value="Van">Van</MenuItem>
                  <MenuItem value="Camión 3.5 Ton">Camión 3.5 Ton</MenuItem>
                  <MenuItem value="Tráiler">Tráiler</MenuItem>
                  <MenuItem value="Tractocamión">Tractocamión</MenuItem>
                  <MenuItem value="Montacargas">Montacargas</MenuItem>
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
                label={newVehicle.vehicle_type === 'Montacargas' ? 'Horas de Uso (HRS)' : 'Kilometraje Actual'}
                type="number"
                value={newVehicle.current_mileage}
                onChange={(e) => setNewVehicle({ ...newVehicle, current_mileage: parseInt(e.target.value) })}
                InputProps={newVehicle.vehicle_type === 'Montacargas' ? { endAdornment: <Typography sx={{ color: 'text.secondary', ml: 1 }}>hrs</Typography> } : undefined}
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
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth>
                <InputLabel>Ubicación (Sucursal)</InputLabel>
                <Select
                  value={newVehicle.branch_id}
                  label="Ubicación (Sucursal)"
                  onChange={(e) => {
                    const val = String(e.target.value);
                    setNewVehicle({ ...newVehicle, branch_id: val === '' ? '' : Number(val) });
                  }}
                >
                  <MenuItem value=""><em>Sin asignar</em></MenuItem>
                  {branches.map((b) => (
                    <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {/* Fotos del vehículo (4 lados) */}
            {(['front', 'back', 'left', 'right'] as const).map((side) => {
              const labels: Record<typeof side, string> = {
                front: 'Foto Frente',
                back: 'Foto Atrás',
                left: 'Foto Lado Izquierdo',
                right: 'Foto Lado Derecho',
              } as any;
              const fieldKey = `photo_${side}_url` as 'photo_front_url' | 'photo_back_url' | 'photo_left_url' | 'photo_right_url';
              const currentUrl = (newVehicle as any)[fieldKey] as string;
              const isUploading = uploadingVehiclePhoto === side;
              return (
                <Grid key={side} size={{ xs: 12, sm: 6 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    component="label"
                    size="small"
                    disabled={isUploading}
                    startIcon={<DocumentIcon />}
                  >
                    {isUploading ? `Subiendo ${labels[side]}...` : currentUrl ? `Reemplazar ${labels[side]}` : labels[side]}
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setUploadingVehiclePhoto(side);
                          const formData = new FormData();
                          formData.append('file', file);
                          const res = await axios.post(`${API_URL}/api/uploads/evidence`, formData, {
                            headers: {
                              Authorization: `Bearer ${getToken()}`,
                              'Content-Type': 'multipart/form-data'
                            }
                          });
                          setNewVehicle((prev) => ({ ...prev, [fieldKey]: res.data.url }));
                        } catch (err: any) {
                          alert(err.response?.data?.message || 'Error al subir foto');
                        } finally {
                          setUploadingVehiclePhoto('');
                          e.target.value = '';
                        }
                      }}
                    />
                  </Button>
                  {currentUrl && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        component="img"
                        src={currentUrl}
                        alt={labels[side]}
                        sx={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd' }}
                      />
                      <Chip
                        label={`✓ ${labels[side]}`}
                        color="success"
                        size="small"
                        onDelete={() => setNewVehicle({ ...newVehicle, [fieldKey]: '' })}
                      />
                    </Box>
                  )}
                </Grid>
              );
            })}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddVehicleOpen(false); setEditingVehicleId(null); }}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateVehicle}>{editingVehicleId ? 'Actualizar' : 'Guardar'}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Agregar Documento */}
      <Dialog open={addDocOpen} onClose={() => { setAddDocOpen(false); setEditingDocId(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingDocId ? 'Editar Documento' : 'Agregar Documento'} - {selectedVehicle?.economic_number}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Documento</InputLabel>
                <Select
                  value={newDocument.document_type}
                  label="Tipo de Documento"
                  onChange={(e) => {
                    const newType = e.target.value;
                    // Para "Tenencia": vencimiento automático al 31 de diciembre del año en curso
                    let expirationDate = newDocument.expiration_date;
                    if (newType === 'Tenencia') {
                      const yyyy = new Date().getFullYear();
                      expirationDate = `${yyyy}-12-31`;
                    }
                    setNewDocument({ ...newDocument, document_type: newType, expiration_date: expirationDate });
                  }}
                >
                  {(() => {
                    const allTypes = [
                      { value: 'Seguro', label: 'Seguro' },
                      { value: 'Tenencia', label: 'Tenencia' },
                      { value: 'Tarjeta Circulación', label: 'Tarjeta de Circulación' },
                      { value: 'Factura', label: 'Factura' },
                      { value: 'Constancia', label: 'Constancia' },
                      { value: 'Verificación', label: 'Verificación Vehicular' },
                      { value: 'Permiso SCT', label: 'Permiso SCT' },
                      { value: 'Otro', label: 'Otro' },
                    ];
                    // Tipos ya usados (excepto el que se está editando)
                    const usedTypes = new Set<string>(
                      (vehicleDetailData?.documents || [])
                        .filter((d: VehicleDocument) => d.id !== editingDocId)
                        .map((d: VehicleDocument) => d.document_type)
                    );
                    // "Otro" siempre disponible
                    return allTypes
                      .filter((t) => t.value === 'Otro' || !usedTypes.has(t.value))
                      .map((t) => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                      ));
                  })()}
                </Select>
              </FormControl>
            </Grid>
            {/* Reglas por tipo de documento:
                - Tarjeta Circulación: vencimiento + archivo (obligatorio)
                - Factura: proveedor + folio + emisión + costo + archivo (sin vencimiento)
                - Tenencia: costo + vencimiento auto Dec-31 + archivo (obligatorio)
                - Constancia: sólo archivo (obligatorio)
                - Verificación: folio + emisión + vencimiento + costo + archivo (obligatorio, sin proveedor, sin "opcional")
                - Permiso SCT: emisión + vencimiento + costo + archivo (obligatorio, sin proveedor ni folio)
                - Resto (Seguro, Otro): todos los campos
            */}
            {(() => {
              const t = newDocument.document_type;
              const isTarjeta = t === 'Tarjeta Circulación';
              const isFactura = t === 'Factura';
              const isTenencia = t === 'Tenencia';
              const isConstancia = t === 'Constancia';
              const isVerificacion = t === 'Verificación';
              const isPermisoSCT = t === 'Permiso SCT';
              // Visibilidad de cada campo
              const showProveedor = !isTarjeta && !isTenencia && !isConstancia && !isVerificacion && !isPermisoSCT;
              const showFolio = !isTarjeta && !isTenencia && !isConstancia && !isPermisoSCT;
              const showEmision = !isTarjeta && !isTenencia && !isConstancia;
              const showVencimiento = !isFactura && !isConstancia;
              const showCosto = !isTarjeta && !isConstancia;
              // Para Verificación, labels sin "(opcional)"
              const lbl = (base: string) => (isVerificacion ? base : `${base} (opcional)`);
              return (
                <>
                  {showProveedor && (
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        fullWidth
                        label="Proveedor"
                        value={newDocument.provider_name}
                        onChange={(e) => setNewDocument({ ...newDocument, provider_name: e.target.value })}
                        placeholder="Ej: Quálitas, GNP"
                      />
                    </Grid>
                  )}
                  {showFolio && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        label="Número / Folio"
                        value={newDocument.policy_number}
                        onChange={(e) => setNewDocument({ ...newDocument, policy_number: e.target.value })}
                      />
                    </Grid>
                  )}
                  {showEmision && (
                    <Grid size={{ xs: showVencimiento ? 6 : 12 }}>
                      <TextField
                        fullWidth
                        label={lbl('Fecha de Emisión')}
                        type="date"
                        value={newDocument.issue_date}
                        onChange={(e) => setNewDocument({ ...newDocument, issue_date: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                  )}
                  {showVencimiento && (
                    <Grid size={{ xs: showEmision ? 6 : 12 }}>
                      <TextField
                        fullWidth
                        label={isTenencia ? 'Vencimiento (auto: 31 dic)' : lbl('Fecha de Vencimiento')}
                        type="date"
                        value={newDocument.expiration_date}
                        onChange={(e) => setNewDocument({ ...newDocument, expiration_date: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                  )}
                  {showCosto && (
                    <Grid size={{ xs: 6 }}>
                      <TextField
                        fullWidth
                        label={lbl('Costo')}
                        type="number"
                        value={newDocument.cost}
                        onChange={(e) => setNewDocument({ ...newDocument, cost: parseFloat(e.target.value) })}
                        InputProps={{ startAdornment: '$' }}
                      />
                    </Grid>
                  )}
                </>
              );
            })()}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ border: '1px dashed', borderColor: ['Tarjeta Circulación', 'Tenencia', 'Constancia', 'Verificación', 'Permiso SCT'].includes(newDocument.document_type) && !newDocument.file_url ? 'warning.main' : 'divider', borderRadius: 1, p: 2 }}>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  📎 Archivo del Documento (PDF o Imagen){['Tarjeta Circulación', 'Tenencia', 'Constancia', 'Verificación', 'Permiso SCT'].includes(newDocument.document_type) && ' *'}
                </Typography>
                <Button
                  variant="outlined"
                  component="label"
                  size="small"
                  disabled={uploadingDocFile}
                  startIcon={<DocumentIcon />}
                >
                  {uploadingDocFile ? 'Subiendo...' : newDocument.file_url ? 'Reemplazar archivo' : 'Seleccionar archivo'}
                  <input
                    type="file"
                    hidden
                    accept="image/*,application/pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setUploadingDocFile(true);
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await axios.post(`${API_URL}/api/uploads/evidence`, formData, {
                          headers: {
                            Authorization: `Bearer ${getToken()}`,
                            'Content-Type': 'multipart/form-data'
                          }
                        });
                        setNewDocument((prev) => ({ ...prev, file_url: res.data.url }));
                      } catch (err: any) {
                        alert(err.response?.data?.message || 'Error al subir archivo');
                      } finally {
                        setUploadingDocFile(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </Button>
                {newDocument.file_url && (
                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label="✓ Archivo subido"
                      color="success"
                      size="small"
                      onDelete={() => setNewDocument({ ...newDocument, file_url: '' })}
                    />
                    <Button
                      size="small"
                      href={newDocument.file_url}
                      target="_blank"
                      rel="noopener"
                    >
                      Ver
                    </Button>
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Formatos: PDF, JPG, PNG. Máx 10 MB.
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddDocOpen(false); setEditingDocId(null); }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreateDocument}
            disabled={['Tarjeta Circulación', 'Tenencia', 'Constancia', 'Verificación', 'Permiso SCT'].includes(newDocument.document_type) && !newDocument.file_url}
          >
            Guardar
          </Button>
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
            {/* Invoice Photo */}
            <Grid size={{ xs: 12 }}>
              <Button
                variant="contained"
                component="label"
                size="small"
                disabled={uploadingMaintenancePhoto}
                startIcon={<DocumentIcon />}
              >
                {uploadingMaintenancePhoto ? 'Subiendo Foto...' : newMaintenance.invoice_photo_url ? 'Reemplazar Foto' : 'Foto Nota/Factura'}
                <input
                  type="file"
                  hidden
                  accept="image/*,application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setUploadingMaintenancePhoto(true);
                      const formData = new FormData();
                      formData.append('file', file);
                      const res = await axios.post(`${API_URL}/api/uploads/evidence`, formData, {
                        headers: {
                          Authorization: `Bearer ${getToken()}`,
                          'Content-Type': 'multipart/form-data'
                        }
                      });
                      setNewMaintenance((prev) => ({ ...prev, invoice_photo_url: res.data.url }));
                    } catch (err: any) {
                      alert(err.response?.data?.message || 'Error al subir foto');
                    } finally {
                      setUploadingMaintenancePhoto(false);
                      e.target.value = '';
                    }
                  }}
                />
              </Button>
              {newMaintenance.invoice_photo_url && (
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label="✓ Foto subida"
                    color="success"
                    size="small"
                    onDelete={() => setNewMaintenance({ ...newMaintenance, invoice_photo_url: '' })}
                  />
                </Box>
              )}
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

      {/* Dialog: Cambiar Ubicación */}
      <Dialog open={assignBranchOpen} onClose={() => setAssignBranchOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ubicación del Vehículo - {selectedVehicle?.economic_number}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Sucursal</InputLabel>
            <Select
              value={selectedBranchId}
              label="Sucursal"
              onChange={(e) => {
                const v = String(e.target.value);
                setSelectedBranchId(v === '' ? '' : Number(v));
              }}
            >
              <MenuItem value=""><em>Sin asignar</em></MenuItem>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignBranchOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!selectedVehicle) return;
              try {
                await axios.put(
                  `${API_URL}/api/admin/fleet/vehicles/${selectedVehicle.id}`,
                  { branch_id: selectedBranchId === '' ? null : selectedBranchId },
                  { headers: { Authorization: `Bearer ${getToken()}` } }
                );
                setAssignBranchOpen(false);
                loadVehicles();
                loadVehicleDetail(selectedVehicle.id);
              } catch (err: any) {
                alert(err.response?.data?.error || 'Error al actualizar ubicación');
              }
            }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Eliminar Vehículo */}
      <Dialog
        open={deleteVehicleOpen}
        onClose={() => !deletingVehicle && setDeleteVehicleOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="error" />
          Eliminar Unidad
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'error.50',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <DeleteIcon sx={{ fontSize: 36, color: 'error.main' }} />
            </Box>
            <Typography variant="h6" gutterBottom>
              ¿Eliminar <strong>{vehicleToDelete?.economic_number}</strong>?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {vehicleToDelete?.brand} {vehicleToDelete?.model} • {vehicleToDelete?.license_plates}
            </Typography>
            <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }}>
              Esta acción eliminará permanentemente el vehículo, sus documentos, mantenimientos, alertas e inspecciones. <strong>No se puede deshacer.</strong>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteVehicleOpen(false)} disabled={deletingVehicle}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deletingVehicle}
            startIcon={<DeleteIcon />}
            onClick={async () => {
              if (!vehicleToDelete) return;
              try {
                setDeletingVehicle(true);
                await axios.delete(`${API_URL}/api/admin/fleet/vehicles/${vehicleToDelete.id}`, {
                  headers: { Authorization: `Bearer ${getToken()}` }
                });
                setDeleteVehicleOpen(false);
                setVehicleToDelete(null);
                loadVehicles();
                loadDashboard();
              } catch (err: any) {
                alert(err.response?.data?.error || 'Error al eliminar vehículo');
              } finally {
                setDeletingVehicle(false);
              }
            }}
          >
            {deletingVehicle ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lightbox: foto del vehículo en grande */}
      <Dialog
        open={!!photoLightbox}
        onClose={() => setPhotoLightbox(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'rgba(0,0,0,0.92)', boxShadow: 'none' } }}
      >
        <DialogContent sx={{ p: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
          <IconButton
            onClick={() => setPhotoLightbox(null)}
            sx={{ position: 'absolute', top: 12, right: 12, bgcolor: 'rgba(255,255,255,0.12)', color: '#fff',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }, zIndex: 2 }}
          >
            <CloseIcon />
          </IconButton>
          {photoLightbox && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <Box
                component="img"
                src={photoLightbox.url}
                alt={photoLightbox.label}
                sx={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 1 }}
              />
              <Typography sx={{ color: '#fff', mt: 1.5, fontSize: '0.95rem', letterSpacing: 0.4 }}>
                {photoLightbox.label}
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Visor de archivos de documentos (PDF / imagen) */}
      <Dialog
        open={!!documentViewer}
        onClose={() => setDocumentViewer(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { bgcolor: '#0a0a0a', boxShadow: 'none', height: '90vh' } }}
      >
        <DialogTitle sx={{ bgcolor: '#0a0a0a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
          <span>{documentViewer?.label || 'Documento'}</span>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              href={documentViewer?.url || '#'}
              target="_blank"
              rel="noopener"
              variant="outlined"
              sx={{ color: '#fff', borderColor: '#666', '&:hover': { borderColor: '#fff' } }}
            >
              Abrir en pestaña
            </Button>
            <IconButton onClick={() => setDocumentViewer(null)} sx={{ color: '#fff' }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {documentViewer && (() => {
            const url = documentViewer.url;
            const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url);
            if (isImage) {
              return (
                <Box
                  component="img"
                  src={url}
                  alt={documentViewer.label}
                  sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              );
            }
            // PDF u otros formatos: usar iframe
            return (
              <Box
                component="iframe"
                src={url}
                title={documentViewer.label}
                sx={{ width: '100%', height: '100%', border: 0, bgcolor: '#fff' }}
              />
            );
          })()}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
