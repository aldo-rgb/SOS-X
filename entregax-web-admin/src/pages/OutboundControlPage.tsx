import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { 
  Box, 
  Typography, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Chip, 
  Button, 
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogContent,
  DialogActions,
  DialogTitle,
  TextField,
  Snackbar,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InventoryIcon from '@mui/icons-material/Inventory';
import BusinessIcon from '@mui/icons-material/Business';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Package {
  id: number;
  tracking_internal: string;
  tracking_provider: string;
  description: string;
  weight: number;
  box_id: string;
  client_name: string;
  total_boxes: number;
  status: string;
}

interface ScannedPackage {
  id: number;
  tracking: string;
  weight: number;
  boxId: string;
  description: string;
}

interface Supplier {
  id: number;
  name: string;
  active: boolean;
}

export default function OutboundControlPage() {
  const { i18n } = useTranslation();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Wizard de Salida
  const [wizardOpen, setWizardOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scannedPackages, setScannedPackages] = useState<ScannedPackage[]>([]);
  const [processing, setProcessing] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  
  // Selección de proveedor
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  
  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    loadPackages();
    loadSuppliers();
  }, []);

  // Cargar proveedores
  const loadSuppliers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/suppliers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuppliers((res.data.suppliers || []).filter((s: Supplier) => s.active));
    } catch (error) {
      console.error('Error cargando proveedores:', error);
    }
  };

  // Cargar paquetes US listos para salida
  const loadPackages = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/packages/outbound-ready`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPackages(res.data.packages || []);
    } catch (error) {
      console.error('Error al cargar paquetes:', error);
      // Fallback: usar endpoint existente
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/packages`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Filtrar solo paquetes US listos para salida
        const usPackages = (res.data.packages || []).filter((p: any) => 
          p.tracking_internal?.startsWith('US-') && 
          !p.tracking_internal?.startsWith('US-REPACK-') &&
          p.status === 'in_transit'
        );
        setPackages(usPackages);
      } catch (e) {
        console.error('Error en fallback:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  // Abrir wizard de salida
  const openWizard = () => {
    setWizardOpen(true);
    setScannedPackages([]);
    setScanInput('');
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  // Cerrar wizard
  const closeWizard = () => {
    setWizardOpen(false);
    setScannedPackages([]);
    setScanInput('');
  };

  // Manejar escaneo de guía
  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !scanInput.trim()) return;
    
    const tracking = scanInput.trim().toUpperCase();
    
    // Verificar si ya está escaneado
    if (scannedPackages.some(p => p.tracking === tracking)) {
      setSnackbar({ 
        open: true, 
        message: `⚠️ La guía ${tracking} ya fue escaneada`, 
        severity: 'warning' 
      });
      setScanInput('');
      return;
    }

    // Buscar el paquete en la lista
    const pkg = packages.find(p => 
      p.tracking_internal?.toUpperCase() === tracking || 
      p.tracking_provider?.toUpperCase() === tracking
    );

    if (pkg) {
      setScannedPackages(prev => [...prev, {
        id: pkg.id,
        tracking: pkg.tracking_internal,
        weight: pkg.weight || 0,
        boxId: pkg.box_id,
        description: pkg.description || ''
      }]);
      setSnackbar({ 
        open: true, 
        message: `✅ Guía ${tracking} agregada`, 
        severity: 'success' 
      });
    } else {
      setSnackbar({ 
        open: true, 
        message: `❌ Guía ${tracking} no encontrada o no está lista para salida (podría ser parte de un reempaque o una master)`, 
        severity: 'error' 
      });
    }
    
    setScanInput('');
    scanInputRef.current?.focus();
  };

  // Remover paquete escaneado
  const removeScannedPackage = (tracking: string) => {
    setScannedPackages(prev => prev.filter(p => p.tracking !== tracking));
  };

  // Crear consolidación con las guías escaneadas
  const handleCreateConsolidation = () => {
    if (scannedPackages.length === 0) {
      setSnackbar({ 
        open: true, 
        message: 'Escanea al menos una guía', 
        severity: 'warning' 
      });
      return;
    }
    // Abrir diálogo de selección de proveedor
    setSelectedSupplierId('');
    setSupplierDialogOpen(true);
  };

  // Confirmar y crear consolidación con proveedor seleccionado
  const createConsolidation = async () => {
    if (!selectedSupplierId) {
      setSnackbar({ 
        open: true, 
        message: 'Selecciona un proveedor de salida', 
        severity: 'warning' 
      });
      return;
    }

    setProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const totalWeight = (scannedPackages || []).reduce((sum, p) => sum + (parseFloat(String(p.weight)) || 0), 0);
      
      const res = await axios.post(`${API_URL}/api/packages/create-outbound`, {
        packageIds: scannedPackages.map(p => p.id),
        totalWeight,
        supplierId: selectedSupplierId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const consolidationId = res.data.consolidationId || res.data.id;
      const supplierName = suppliers.find(s => s.id === selectedSupplierId)?.name || 'Proveedor';
      
      setSnackbar({ 
        open: true, 
        message: `✅ Consolidación #${consolidationId} creada - ${scannedPackages.length} guías asignadas a ${supplierName}`, 
        severity: 'success' 
      });
      
      setSupplierDialogOpen(false);
      closeWizard();
      loadPackages(); // Recargar lista
    } catch (error: unknown) {
      console.error('Error al crear consolidación:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setSnackbar({ 
        open: true, 
        message: axiosError.response?.data?.error || 'Error al crear la consolidación', 
        severity: 'error' 
      });
    } finally {
      setProcessing(false);
    }
  };

  // Calcular peso total escaneado
  const totalScannedWeight = (scannedPackages || []).reduce((sum, p) => sum + (parseFloat(String(p.weight)) || 0), 0);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} color="text.primary">
            <FlightTakeoffIcon sx={{ mr: 1, verticalAlign: 'bottom', color: '#F05A28' }} />
            {i18n.language === 'es' ? 'Control de Salidas' : 'Outbound Control'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {i18n.language === 'es' 
              ? 'Paquetes US listos para salida. Escanea las guías al cargar la camioneta.' 
              : 'US packages ready for dispatch. Scan trackings when loading the truck.'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={i18n.language === 'es' ? 'Actualizar' : 'Refresh'}>
            <IconButton onClick={loadPackages} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<QrCodeScannerIcon />}
            onClick={openWizard}
            sx={{ 
              bgcolor: '#F05A28', 
              '&:hover': { bgcolor: '#D94A20' },
              fontWeight: 600
            }}
          >
            {i18n.language === 'es' ? 'Nueva Salida' : 'New Dispatch'}
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(240, 90, 40, 0.05)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="warning.main">
            {(packages || []).length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' ? 'Paquetes Listos' : 'Ready Packages'}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(33, 150, 243, 0.05)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="info.main">
            {Number((packages || []).reduce((sum, p) => sum + (parseFloat(String(p.weight)) || 0), 0)).toFixed(1)} kg
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' ? 'Peso Total' : 'Total Weight'}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(16, 185, 129, 0.05)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="success.main">
            {new Set((packages || []).map(p => p.box_id)).size}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' ? 'Clientes' : 'Customers'}
          </Typography>
        </Paper>
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: '#F05A28' }} />
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#1a1a2e' }}>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>TRACKING</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>CLIENTE</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>DESCRIPCIÓN</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }} align="center">CAJAS</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>PESO</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id} hover>
                  <TableCell>
                    <Typography fontWeight={600} color="primary">
                      {pkg.tracking_internal}
                    </Typography>
                    {pkg.tracking_provider && (
                      <Typography variant="caption" color="text.secondary">
                        {pkg.tracking_provider}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={pkg.box_id} 
                      size="small" 
                      sx={{ fontWeight: 600, bgcolor: '#f5f5f5' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pkg.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      icon={<InventoryIcon sx={{ fontSize: 16 }} />}
                      label={pkg.total_boxes || 1} 
                      size="small" 
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={500}>
                      {pkg.weight ? `${pkg.weight} kg` : '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}

              {(packages || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                    <LocalShippingIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                    <Typography color="text.secondary">
                      {i18n.language === 'es' 
                        ? 'No hay paquetes listos para salida' 
                        : 'No packages ready for dispatch'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ===== WIZARD DE SALIDA ===== */}
      <Dialog 
        open={wizardOpen} 
        onClose={!processing ? closeWizard : undefined}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, overflow: 'hidden' }
        }}
      >
        {/* Header */}
        <Box sx={{ 
          bgcolor: '#F05A28', 
          color: 'white', 
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <QrCodeScannerIcon sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {i18n.language === 'es' ? 'Nueva Salida de Paquetes' : 'New Package Dispatch'}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {i18n.language === 'es' 
                ? 'Escanea las guías US al cargar la camioneta' 
                : 'Scan US trackings when loading the truck'}
            </Typography>
          </Box>
        </Box>

        <DialogContent sx={{ p: 3 }}>
          {/* Campo de escaneo */}
          <TextField
            inputRef={scanInputRef}
            fullWidth
            placeholder={i18n.language === 'es' ? 'Escanear guía US...' : 'Scan US tracking...'}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            autoFocus
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: <QrCodeScannerIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              sx: { fontSize: '1.2rem' }
            }}
          />

          {/* Resumen */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h4" fontWeight={700} color="primary">
                  {scannedPackages.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {i18n.language === 'es' ? 'Guías Escaneadas' : 'Scanned Trackings'}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h4" fontWeight={700} color="info.main">
                  {Number(totalScannedWeight || 0).toFixed(1)} kg
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {i18n.language === 'es' ? 'Peso Total' : 'Total Weight'}
                </Typography>
              </CardContent>
            </Card>
          </Box>

          {/* Lista de guías escaneadas */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            {i18n.language === 'es' ? 'Guías en esta salida:' : 'Trackings in this dispatch:'}
          </Typography>
          
          <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
            {scannedPackages.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <QrCodeScannerIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">
                  {i18n.language === 'es' 
                    ? 'Escanea una guía para agregarla' 
                    : 'Scan a tracking to add it'}
                </Typography>
              </Box>
            ) : (
              <List dense>
                {scannedPackages.map((pkg, index) => (
                  <Box key={pkg.tracking}>
                    {index > 0 && <Divider />}
                    <ListItem>
                      <ListItemText
                        primary={
                          <Typography fontWeight={600} color="primary">
                            {pkg.tracking}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="body2" color="text.secondary">
                            {pkg.boxId} • {pkg.weight} kg • {pkg.description || 'Sin descripción'}
                          </Typography>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton 
                          edge="end" 
                          size="small"
                          onClick={() => removeScannedPackage(pkg.tracking)}
                          sx={{ color: 'error.main' }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  </Box>
                ))}
              </List>
            )}
          </Paper>
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={closeWizard} disabled={processing}>
            {i18n.language === 'es' ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateConsolidation}
            disabled={scannedPackages.length === 0 || processing}
            startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
            sx={{ 
              bgcolor: '#F05A28', 
              '&:hover': { bgcolor: '#D94A20' },
              minWidth: 180
            }}
          >
            {processing 
              ? (i18n.language === 'es' ? 'Creando...' : 'Creating...') 
              : (i18n.language === 'es' ? 'Crear Consolidación' : 'Create Consolidation')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de selección de proveedor */}
      <Dialog 
        open={supplierDialogOpen} 
        onClose={() => setSupplierDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#1976d2', color: 'white' }}>
          <BusinessIcon />
          {i18n.language === 'es' ? 'Seleccionar Proveedor de Salida' : 'Select Outbound Supplier'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3, pb: 2, mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {i18n.language === 'es' 
              ? `Se asignarán ${scannedPackages.length} paquetes al proveedor seleccionado y cambiarán a estado "En Tránsito".`
              : `${scannedPackages.length} packages will be assigned to the selected supplier and changed to "In Transit" status.`}
          </Typography>
          <FormControl fullWidth>
            <InputLabel>{i18n.language === 'es' ? 'Proveedor' : 'Supplier'}</InputLabel>
            <Select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value as number)}
              label={i18n.language === 'es' ? 'Proveedor' : 'Supplier'}
            >
              {suppliers.map((supplier) => (
                <MenuItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {suppliers.length === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {i18n.language === 'es' 
                ? 'No hay proveedores activos. Registra uno en el módulo de Proveedores.'
                : 'No active suppliers. Register one in the Suppliers module.'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSupplierDialogOpen(false)} disabled={processing}>
            {i18n.language === 'es' ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            onClick={createConsolidation}
            disabled={!selectedSupplierId || processing}
            startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
            sx={{ 
              bgcolor: '#4CAF50', 
              '&:hover': { bgcolor: '#45a049' }
            }}
          >
            {processing 
              ? (i18n.language === 'es' ? 'Procesando...' : 'Processing...')
              : (i18n.language === 'es' ? 'Confirmar y Crear' : 'Confirm & Create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={3000} 
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
