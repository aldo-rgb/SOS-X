// ============================================
// PANEL DE BODEGA MARÍTIMO CHINA - CON IA
// Extracción automática de LOG (LCL) y BL (FCL)
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Tooltip,
  Badge,
  Checkbox,
  Autocomplete,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  DirectionsBoat as BoatIcon,
  LocalShipping as TruckIcon,
  Inventory as InventoryIcon,
  Person as PersonIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  SmartToy as AiIcon,
  Add as AddIcon,
  Visibility as ViewIcon,
  Search as SearchIcon,
  Description as DocIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Interfaces
interface LclShipment {
  id: number;
  log_number: string;
  user_id: number | null;
  client_name: string | null;
  client_box_id: string | null;
  client_code: string | null;
  brand_type: string | null;
  shipping_mark: string | null;
  box_count: number;
  weight_kg: number;
  volume_cbm: number;
  product_type: string | null;
  sanky_doc_url: string | null;
  packing_list_url: string | null;
  delivery_address: string | null;
  has_gex: boolean;
  is_ready_for_consolidation: boolean;
  status: string;
  container_id: number | null;
  container_number: string | null;
  created_at: string;
}

interface FclContainer {
  id: number;
  container_number: string;
  bl_number: string | null;
  type: string;
  eta: string | null;
  status: string;
  total_weight_kg: number;
  total_cbm: number;
  total_packages: number;
  client_user_id: number | null;
  client_name: string | null;
  client_box_id: string | null;
  packing_list_url: string | null;
  delivery_address: string | null;
  has_gex: boolean;
  shipment_count: number;
  is_fully_costed: boolean;
  created_at: string;
}

interface Stats {
  lcl: {
    total: number;
    inWarehouse: number;
    readyToConsolidate: number;
    pendingPackingList: number;
  };
  fcl: {
    total: number;
    inWarehouse: number;
    inTransit: number;
    arrived: number;
  };
}

interface ExtractedLogData {
  logNumber?: string;
  boxCount?: number;
  weightKg?: number;
  volumeCbm?: number;
  clientCodeRaw?: string;
  brandType?: string;
  productDescription?: string;
}

interface ExtractedBlData {
  blNumber?: string;
  containerNumber?: string;
  eta?: string;
  pol?: string;
  pod?: string;
  weightKg?: number;
  volumeCbm?: number;
  consignee?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error' | 'primary' }> = {
  received_origin: { label: '📦 En Bodega China', color: 'warning' },
  consolidated: { label: '📋 Consolidado', color: 'info' },
  in_transit: { label: '🚢 En Tránsito', color: 'primary' },
  arrived_port: { label: '⚓ En Puerto', color: 'info' },
  customs_cleared: { label: '✅ Despachado', color: 'success' },
  received_cedis: { label: '🏠 En CEDIS', color: 'success' },
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

export default function MaritimeWarehousePage() {
  useTranslation(); // Para futuras traducciones
  const token = localStorage.getItem('token');
  
  // Estado principal
  const [tabValue, setTabValue] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lclShipments, setLclShipments] = useState<LclShipment[]>([]);
  const [fclContainers, setFclContainers] = useState<FclContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [lclFilter, setLclFilter] = useState<'all' | 'pending' | 'ready'>('all');
  const [fclFilter, setFclFilter] = useState<'all' | 'warehouse' | 'transit'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modales
  const [uploadLogDialog, setUploadLogDialog] = useState(false);
  const [uploadBlDialog, setUploadBlDialog] = useState(false);
  const [createFclDialog, setCreateFclDialog] = useState(false);
  const [assignClientDialog, setAssignClientDialog] = useState<{ open: boolean; shipmentId: number | null }>({ open: false, shipmentId: null });
  const [consolidateDialog, setConsolidateDialog] = useState(false);
  
  // Estados de extracción IA
  const [extracting, setExtracting] = useState(false);
  const [extractedLogData, setExtractedLogData] = useState<ExtractedLogData | null>(null);
  const [extractedBlData, setExtractedBlData] = useState<ExtractedBlData | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>('');
  
  // Para consolidación
  const [selectedShipments, setSelectedShipments] = useState<number[]>([]);
  const [newContainerNumber, setNewContainerNumber] = useState('');
  
  // Para asignar cliente
  const [assignBoxId, setAssignBoxId] = useState('');
  
  // Para crear FCL
  const [newFclNumber, setNewFclNumber] = useState('');
  const [newFclClientId, setNewFclClientId] = useState<number | null>(null);
  
  // Clientes para autocomplete
  const [clients, setClients] = useState<Array<{ id: number; full_name: string; box_id: string }>>([]);

  // Cargar datos
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, lclRes, fclRes] = await Promise.all([
        fetch(`${API_URL}/api/maritime-ai/stats`, { headers }),
        fetch(`${API_URL}/api/maritime-ai/lcl?search=${searchTerm}`, { headers }),
        fetch(`${API_URL}/api/maritime-ai/fcl?search=${searchTerm}`, { headers }),
      ]);
      
      if (statsRes.ok) setStats(await statsRes.json());
      if (lclRes.ok) setLclShipments(await lclRes.json());
      if (fclRes.ok) setFclContainers(await fclRes.json());
      
      setError(null);
    } catch (e) {
      setError('Error al cargar datos');
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [token, searchTerm]);

  // Cargar clientes para autocomplete
  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/gex/clients?search=`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClients(data);
      }
    } catch {
      console.error('Error fetching clients');
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    fetchClients();
  }, [fetchData, fetchClients]);

  // Subir archivo y convertir a base64
  const handleFileUpload = (file: File) => {
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setUploadedFileUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  // Extraer datos de LOG con IA
  const extractLogData = async () => {
    if (!uploadedFileUrl) return;
    
    setExtracting(true);
    try {
      const res = await fetch(`${API_URL}/api/maritime-ai/extract-log`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileBase64: uploadedFileUrl })
      });
      
      const data = await res.json();
      if (data.success) {
        setExtractedLogData(data.extractedData);
      } else {
        setError(data.error || 'Error al extraer datos');
      }
    } catch {
      setError('Error de conexión con IA');
    } finally {
      setExtracting(false);
    }
  };

  // Extraer datos de BL con IA
  const extractBlData = async () => {
    if (!uploadedFileUrl) return;
    
    setExtracting(true);
    try {
      const res = await fetch(`${API_URL}/api/maritime-ai/extract-bl`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileBase64: uploadedFileUrl })
      });
      
      const data = await res.json();
      if (data.success) {
        setExtractedBlData(data.extractedData);
      } else {
        setError(data.error || 'Error al extraer datos del BL');
      }
    } catch {
      setError('Error de conexión con IA');
    } finally {
      setExtracting(false);
    }
  };

  // Guardar LOG (LCL)
  const saveLogReception = async () => {
    if (!extractedLogData) return;
    
    try {
      const res = await fetch(`${API_URL}/api/maritime-ai/lcl`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          logNumber: extractedLogData.logNumber,
          boxCount: extractedLogData.boxCount,
          weightKg: extractedLogData.weightKg,
          volumeCbm: extractedLogData.volumeCbm,
          clientCodeRaw: extractedLogData.clientCodeRaw,
          brandType: extractedLogData.brandType,
          productDescription: extractedLogData.productDescription,
          fileUrl: `data:image/jpeg;base64,${uploadedFileUrl}`
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setUploadLogDialog(false);
        setExtractedLogData(null);
        setUploadedFile(null);
        setUploadedFileUrl('');
        fetchData();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Error al guardar LOG');
    }
  };

  // Guardar BL (FCL)
  const saveBlReception = async () => {
    if (!extractedBlData) return;
    
    try {
      const res = await fetch(`${API_URL}/api/maritime-ai/fcl/bl`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          containerNumber: extractedBlData.containerNumber,
          blNumber: extractedBlData.blNumber,
          eta: extractedBlData.eta,
          weightKg: extractedBlData.weightKg,
          volumeCbm: extractedBlData.volumeCbm,
          fileUrl: `data:image/jpeg;base64,${uploadedFileUrl}`
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setUploadBlDialog(false);
        setExtractedBlData(null);
        setUploadedFile(null);
        setUploadedFileUrl('');
        fetchData();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Error al guardar BL');
    }
  };

  // Crear contenedor FCL vacío
  const createFclInWarehouse = async () => {
    if (!newFclNumber) return;
    
    try {
      const res = await fetch(`${API_URL}/api/maritime-ai/fcl/warehouse`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          containerNumber: newFclNumber,
          clientUserId: newFclClientId
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setCreateFclDialog(false);
        setNewFclNumber('');
        setNewFclClientId(null);
        fetchData();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Error al crear contenedor');
    }
  };

  // Asignar cliente a LCL
  const assignClient = async () => {
    if (!assignClientDialog.shipmentId || !assignBoxId) return;
    
    try {
      const res = await fetch(`${API_URL}/api/maritime-ai/lcl/${assignClientDialog.shipmentId}/assign-client`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ boxId: assignBoxId })
      });
      
      const data = await res.json();
      if (data.success) {
        setAssignClientDialog({ open: false, shipmentId: null });
        setAssignBoxId('');
        fetchData();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Error al asignar cliente');
    }
  };

  // Consolidar LCL en contenedor
  const consolidateShipments = async () => {
    if (selectedShipments.length === 0) return;
    
    try {
      const res = await fetch(`${API_URL}/api/maritime-ai/consolidate`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shipmentIds: selectedShipments,
          containerNumber: newContainerNumber || undefined,
          createNew: true
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setConsolidateDialog(false);
        setSelectedShipments([]);
        setNewContainerNumber('');
        fetchData();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Error al consolidar');
    }
  };

  // Filtrar LCL
  const filteredLcl = lclShipments.filter(s => {
    if (lclFilter === 'pending') return !s.is_ready_for_consolidation && s.status === 'received_origin';
    if (lclFilter === 'ready') return s.is_ready_for_consolidation && !s.container_id;
    return true;
  });

  // Filtrar FCL
  const filteredFcl = fclContainers.filter(c => {
    if (fclFilter === 'warehouse') return c.status === 'received_origin';
    if (fclFilter === 'transit') return c.status === 'in_transit';
    return true;
  });

  // Shipments listos para consolidar
  const readyForConsolidation = lclShipments.filter(s => s.is_ready_for_consolidation && !s.container_id);

  if (loading && !stats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" display="flex" alignItems="center" gap={1}>
            <BoatIcon color="primary" sx={{ fontSize: 40 }} />
            🇨🇳 Panel Bodega Marítimo China
          </Typography>
          <Typography color="text.secondary">
            Gestión inteligente con extracción automática de documentos
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="contained"
            color="warning"
            startIcon={<UploadIcon />}
            onClick={() => setUploadLogDialog(true)}
          >
            Subir LOG (LCL)
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<UploadIcon />}
            onClick={() => setUploadBlDialog(true)}
          >
            Subir BL (FCL)
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setCreateFclDialog(true)}
          >
            Crear FCL Vacío
          </Button>
          <IconButton onClick={fetchData}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Estadísticas */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: 'warning.light' }}>
            <CardContent>
              <Typography variant="h3" fontWeight="bold">{stats?.lcl.pendingPackingList || 0}</Typography>
              <Typography variant="subtitle1">🔴 LCL Esperando PL</Typography>
              <Typography variant="caption" color="text.secondary">Cliente debe subir Packing List</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: 'success.light' }}>
            <CardContent>
              <Typography variant="h3" fontWeight="bold">{stats?.lcl.readyToConsolidate || 0}</Typography>
              <Typography variant="subtitle1">🟢 LCL Listos</Typography>
              <Typography variant="caption" color="text.secondary">Listos para consolidar</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: 'info.light' }}>
            <CardContent>
              <Typography variant="h3" fontWeight="bold">{stats?.fcl.inWarehouse || 0}</Typography>
              <Typography variant="subtitle1">📦 FCL En Bodega</Typography>
              <Typography variant="caption" color="text.secondary">Esperando BL</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ bgcolor: 'primary.light' }}>
            <CardContent>
              <Typography variant="h3" fontWeight="bold">{stats?.fcl.inTransit || 0}</Typography>
              <Typography variant="subtitle1">🚢 FCL En Tránsito</Typography>
              <Typography variant="caption" color="text.secondary">Con BL cargado</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab 
            label={
              <Badge badgeContent={stats?.lcl.total || 0} color="warning">
                <Box display="flex" alignItems="center" gap={1}>
                  <TruckIcon /> LCL (Carga Suelta)
                </Box>
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={stats?.fcl.total || 0} color="primary">
                <Box display="flex" alignItems="center" gap={1}>
                  <BoatIcon /> FCL (Dedicados)
                </Box>
              </Badge>
            } 
          />
        </Tabs>
      </Paper>

      {/* Barra de búsqueda y filtros */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" gap={2} alignItems="center">
          <TextField
            size="small"
            placeholder="Buscar LOG, contenedor, cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> }}
            sx={{ minWidth: 300 }}
          />
          
          {tabValue === 0 && (
            <>
              <Chip 
                label="Todos" 
                onClick={() => setLclFilter('all')}
                color={lclFilter === 'all' ? 'primary' : 'default'}
              />
              <Chip 
                label="🔴 Esperando PL" 
                onClick={() => setLclFilter('pending')}
                color={lclFilter === 'pending' ? 'warning' : 'default'}
              />
              <Chip 
                label="🟢 Listos" 
                onClick={() => setLclFilter('ready')}
                color={lclFilter === 'ready' ? 'success' : 'default'}
              />
              
              {readyForConsolidation.length > 0 && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<InventoryIcon />}
                  onClick={() => setConsolidateDialog(true)}
                  sx={{ ml: 'auto' }}
                >
                  Consolidar ({readyForConsolidation.length})
                </Button>
              )}
            </>
          )}
          
          {tabValue === 1 && (
            <>
              <Chip 
                label="Todos" 
                onClick={() => setFclFilter('all')}
                color={fclFilter === 'all' ? 'primary' : 'default'}
              />
              <Chip 
                label="📦 En Bodega" 
                onClick={() => setFclFilter('warehouse')}
                color={fclFilter === 'warehouse' ? 'warning' : 'default'}
              />
              <Chip 
                label="🚢 En Tránsito" 
                onClick={() => setFclFilter('transit')}
                color={fclFilter === 'transit' ? 'primary' : 'default'}
              />
            </>
          )}
        </Box>
      </Paper>

      {/* Tab LCL */}
      <TabPanel value={tabValue} index={0}>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selectedShipments.length > 0 && selectedShipments.length < readyForConsolidation.length}
                    checked={selectedShipments.length === readyForConsolidation.length && readyForConsolidation.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedShipments(readyForConsolidation.map(s => s.id));
                      } else {
                        setSelectedShipments([]);
                      }
                    }}
                  />
                </TableCell>
                <TableCell>LOG #</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="center">Cajas</TableCell>
                <TableCell align="center">Peso (kg)</TableCell>
                <TableCell align="center">CBM</TableCell>
                <TableCell>PL</TableCell>
                <TableCell>GEX</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLcl.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No hay envíos LCL</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLcl.map((shipment) => (
                  <TableRow 
                    key={shipment.id}
                    sx={{ 
                      bgcolor: !shipment.is_ready_for_consolidation ? 'warning.50' : 
                               shipment.container_id ? 'grey.100' : 'success.50'
                    }}
                  >
                    <TableCell padding="checkbox">
                      {shipment.is_ready_for_consolidation && !shipment.container_id && (
                        <Checkbox
                          checked={selectedShipments.includes(shipment.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedShipments([...selectedShipments, shipment.id]);
                            } else {
                              setSelectedShipments(selectedShipments.filter(id => id !== shipment.id));
                            }
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="bold">{shipment.log_number}</Typography>
                    </TableCell>
                    <TableCell>
                      {shipment.client_name ? (
                        <Box>
                          <Typography variant="body2">{shipment.client_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {shipment.client_box_id || shipment.shipping_mark}
                          </Typography>
                        </Box>
                      ) : (
                        <Chip 
                          label="Sin asignar" 
                          size="small" 
                          color="error"
                          onClick={() => setAssignClientDialog({ open: true, shipmentId: shipment.id })}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={shipment.brand_type || '-'} 
                        size="small" 
                        color={shipment.brand_type === 'Logo' ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="center">{shipment.box_count}</TableCell>
                    <TableCell align="center">{Number(shipment.weight_kg).toFixed(1)}</TableCell>
                    <TableCell align="center">{Number(shipment.volume_cbm).toFixed(3)}</TableCell>
                    <TableCell>
                      {shipment.packing_list_url ? (
                        <Tooltip title="Ver Packing List">
                          <IconButton size="small" color="success">
                            <CheckIcon />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Chip label="⏳ Pendiente" size="small" color="warning" />
                      )}
                    </TableCell>
                    <TableCell>
                      {shipment.has_gex ? (
                        <Chip label="✓ GEX" size="small" color="success" />
                      ) : (
                        <Typography variant="caption" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={STATUS_CONFIG[shipment.status]?.label || shipment.status}
                        size="small"
                        color={STATUS_CONFIG[shipment.status]?.color || 'default'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" gap={0.5}>
                        {shipment.sanky_doc_url && (
                          <Tooltip title="Ver documento">
                            <IconButton size="small" onClick={() => window.open(shipment.sanky_doc_url!, '_blank')}>
                              <DocIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!shipment.user_id && (
                          <Tooltip title="Asignar cliente">
                            <IconButton 
                              size="small" 
                              color="warning"
                              onClick={() => setAssignClientDialog({ open: true, shipmentId: shipment.id })}
                            >
                              <PersonIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Tab FCL */}
      <TabPanel value={tabValue} index={1}>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>Contenedor</TableCell>
                <TableCell>BL</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>ETA</TableCell>
                <TableCell align="center">Peso (kg)</TableCell>
                <TableCell align="center">CBM</TableCell>
                <TableCell>PL</TableCell>
                <TableCell>GEX</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="center">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredFcl.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No hay contenedores FCL</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredFcl.map((container) => (
                  <TableRow 
                    key={container.id}
                    sx={{ 
                      bgcolor: container.status === 'received_origin' ? 'warning.50' : 
                               container.status === 'in_transit' ? 'info.50' : 'inherit'
                    }}
                  >
                    <TableCell>
                      <Typography fontWeight="bold">{container.container_number}</Typography>
                    </TableCell>
                    <TableCell>
                      {container.bl_number ? (
                        <Typography variant="body2">{container.bl_number}</Typography>
                      ) : (
                        <Chip label="⏳ Sin BL" size="small" color="warning" />
                      )}
                    </TableCell>
                    <TableCell>
                      {container.client_name ? (
                        <Box>
                          <Typography variant="body2">{container.client_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {container.client_box_id}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {container.eta ? new Date(container.eta).toLocaleDateString('es-MX') : '-'}
                    </TableCell>
                    <TableCell align="center">{Number(container.total_weight_kg || 0).toFixed(0)}</TableCell>
                    <TableCell align="center">{Number(container.total_cbm || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      {container.packing_list_url ? (
                        <Chip label="✓" size="small" color="success" />
                      ) : (
                        <Chip label="⏳" size="small" color="warning" />
                      )}
                    </TableCell>
                    <TableCell>
                      {container.has_gex ? (
                        <Chip label="✓ GEX" size="small" color="success" />
                      ) : (
                        <Typography variant="caption" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={STATUS_CONFIG[container.status]?.label || container.status}
                        size="small"
                        color={STATUS_CONFIG[container.status]?.color || 'default'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver detalle">
                        <IconButton size="small">
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Dialog: Subir LOG con IA */}
      <Dialog open={uploadLogDialog} onClose={() => setUploadLogDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <AiIcon color="primary" />
            Subir LOG de Sanky (LCL)
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            La IA extraerá automáticamente: Número de LOG, cajas, peso, volumen y código del cliente.
          </Alert>
          
          {!extractedLogData ? (
            <Box>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }}
                id="log-file-input"
              />
              <label htmlFor="log-file-input">
                <Button
                  variant="outlined"
                  component="span"
                  fullWidth
                  sx={{ height: 150, border: '2px dashed', flexDirection: 'column' }}
                >
                  <UploadIcon sx={{ fontSize: 48, mb: 1 }} />
                  {uploadedFile ? uploadedFile.name : 'Clic para seleccionar documento LOG'}
                </Button>
              </label>
              
              {uploadedFile && (
                <Box mt={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    onClick={extractLogData}
                    disabled={extracting}
                    startIcon={extracting ? <CircularProgress size={20} /> : <AiIcon />}
                  >
                    {extracting ? 'Analizando con IA...' : 'Extraer Datos con IA'}
                  </Button>
                </Box>
              )}
            </Box>
          ) : (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                ✓ Datos extraídos correctamente. Verifica y ajusta si es necesario.
              </Alert>
              
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Número de LOG"
                    value={extractedLogData.logNumber || ''}
                    onChange={(e) => setExtractedLogData({ ...extractedLogData, logNumber: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Código Cliente"
                    value={extractedLogData.clientCodeRaw || ''}
                    onChange={(e) => setExtractedLogData({ ...extractedLogData, clientCodeRaw: e.target.value })}
                    helperText="Ej: S3117L (Logo) o S3117G (Genérico)"
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Cajas"
                    value={extractedLogData.boxCount || ''}
                    onChange={(e) => setExtractedLogData({ ...extractedLogData, boxCount: parseInt(e.target.value) })}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Peso (kg)"
                    value={extractedLogData.weightKg || ''}
                    onChange={(e) => setExtractedLogData({ ...extractedLogData, weightKg: parseFloat(e.target.value) })}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Volumen (CBM)"
                    value={extractedLogData.volumeCbm || ''}
                    onChange={(e) => setExtractedLogData({ ...extractedLogData, volumeCbm: parseFloat(e.target.value) })}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    label="Tipo"
                    value={extractedLogData.brandType || ''}
                    onChange={(e) => setExtractedLogData({ ...extractedLogData, brandType: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="Descripción del Producto"
                    value={extractedLogData.productDescription || ''}
                    onChange={(e) => setExtractedLogData({ ...extractedLogData, productDescription: e.target.value })}
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setUploadLogDialog(false);
            setExtractedLogData(null);
            setUploadedFile(null);
          }}>
            Cancelar
          </Button>
          {extractedLogData && (
            <Button variant="contained" color="success" onClick={saveLogReception}>
              Guardar LOG
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialog: Subir BL con IA */}
      <Dialog open={uploadBlDialog} onClose={() => setUploadBlDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <AiIcon color="primary" />
            Subir Bill of Lading (FCL)
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            La IA extraerá: Número de BL, contenedor, ETA, peso y volumen. 
            El contenedor pasará automáticamente a "En Tránsito".
          </Alert>
          
          {!extractedBlData ? (
            <Box>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }}
                id="bl-file-input"
              />
              <label htmlFor="bl-file-input">
                <Button
                  variant="outlined"
                  component="span"
                  fullWidth
                  sx={{ height: 150, border: '2px dashed', flexDirection: 'column' }}
                >
                  <UploadIcon sx={{ fontSize: 48, mb: 1 }} />
                  {uploadedFile ? uploadedFile.name : 'Clic para seleccionar BL'}
                </Button>
              </label>
              
              {uploadedFile && (
                <Box mt={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    onClick={extractBlData}
                    disabled={extracting}
                    startIcon={extracting ? <CircularProgress size={20} /> : <AiIcon />}
                  >
                    {extracting ? 'Analizando BL...' : 'Extraer Datos del BL'}
                  </Button>
                </Box>
              )}
            </Box>
          ) : (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                ✓ Datos del BL extraídos. Verifica y ajusta si es necesario.
              </Alert>
              
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Número de BL"
                    value={extractedBlData.blNumber || ''}
                    onChange={(e) => setExtractedBlData({ ...extractedBlData, blNumber: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Número de Contenedor"
                    value={extractedBlData.containerNumber || ''}
                    onChange={(e) => setExtractedBlData({ ...extractedBlData, containerNumber: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    type="date"
                    label="ETA"
                    InputLabelProps={{ shrink: true }}
                    value={extractedBlData.eta || ''}
                    onChange={(e) => setExtractedBlData({ ...extractedBlData, eta: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Peso (kg)"
                    value={extractedBlData.weightKg || ''}
                    onChange={(e) => setExtractedBlData({ ...extractedBlData, weightKg: parseFloat(e.target.value) })}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Volumen (CBM)"
                    value={extractedBlData.volumeCbm || ''}
                    onChange={(e) => setExtractedBlData({ ...extractedBlData, volumeCbm: parseFloat(e.target.value) })}
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setUploadBlDialog(false);
            setExtractedBlData(null);
            setUploadedFile(null);
          }}>
            Cancelar
          </Button>
          {extractedBlData && (
            <Button variant="contained" color="success" onClick={saveBlReception}>
              Guardar y Poner en Tránsito
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialog: Crear FCL Vacío */}
      <Dialog open={createFclDialog} onClose={() => setCreateFclDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crear Contenedor FCL en Bodega</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Crea el contenedor ahora. Cuando llegue el BL, súbelo para pasarlo a "En Tránsito".
          </Alert>
          
          <TextField
            fullWidth
            label="Número de Contenedor"
            value={newFclNumber}
            onChange={(e) => setNewFclNumber(e.target.value)}
            placeholder="Ej: MSKU1234567"
            sx={{ mb: 2, mt: 1 }}
          />
          
          <Autocomplete
            options={clients}
            getOptionLabel={(option) => `${option.full_name} (${option.box_id})`}
            onChange={(_, value) => setNewFclClientId(value?.id || null)}
            renderInput={(params) => (
              <TextField {...params} label="Cliente (opcional)" />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFclDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={createFclInWarehouse}
            disabled={!newFclNumber}
          >
            Crear en Bodega
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Asignar Cliente */}
      <Dialog open={assignClientDialog.open} onClose={() => setAssignClientDialog({ open: false, shipmentId: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Asignar Cliente al LOG</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="BOX ID del Cliente"
            value={assignBoxId}
            onChange={(e) => setAssignBoxId(e.target.value)}
            placeholder="Ej: S3117"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignClientDialog({ open: false, shipmentId: null })}>Cancelar</Button>
          <Button variant="contained" onClick={assignClient} disabled={!assignBoxId}>
            Asignar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Consolidar */}
      <Dialog open={consolidateDialog} onClose={() => setConsolidateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Consolidar Envíos en Contenedor</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Se consolidarán {selectedShipments.length} envíos listos.
          </Alert>
          
          <TextField
            fullWidth
            label="Número de Contenedor (opcional)"
            value={newContainerNumber}
            onChange={(e) => setNewContainerNumber(e.target.value)}
            placeholder="Si está vacío, se generará automáticamente"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConsolidateDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            color="success" 
            onClick={consolidateShipments}
            disabled={selectedShipments.length === 0}
          >
            Consolidar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
