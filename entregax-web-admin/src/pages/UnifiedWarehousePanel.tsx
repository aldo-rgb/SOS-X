import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Alert,
  Chip,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stepper,
  Step,
  StepLabel,
  AlertTitle,
} from '@mui/material';
import {
  Login as IngresoIcon,
  Logout as SalidaIcon,
  QrCodeScanner as ScannerIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon,
  Warehouse as WarehouseIcon,
  Person as PersonIcon,
  Store as StoreIcon,
  Lock as LockIcon,
  LocalShipping as DhlIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import api from '../services/api';
import DhlReceptionWizard from './DhlReceptionWizard';

// Tipos de guía permitidos
type TrackingType = 'DHL' | 'AIR' | 'LOG' | 'US' | 'INVALID';

// Función para detectar el tipo de guía
const detectTrackingType = (tracking: string): TrackingType => {
  const trimmed = tracking.trim().toUpperCase();
  
  // DHL: 10 dígitos numéricos
  if (/^\d{10}$/.test(trimmed)) {
    return 'DHL';
  }
  
  // AIR: Empieza con AIR- o AIR
  if (/^AIR[-_]?\d+/i.test(trimmed) || /^AIR\d+/i.test(trimmed)) {
    return 'AIR';
  }
  
  // LOG: Empieza con LOG- o LOG
  if (/^LOG[-_]?\d+/i.test(trimmed) || /^LOG\d+/i.test(trimmed)) {
    return 'LOG';
  }
  
  // US: Empieza con US- o US
  if (/^US[-_]?\d+/i.test(trimmed) || /^US\d+/i.test(trimmed)) {
    return 'US';
  }
  
  // También aceptar TRK (tracking interno)
  if (/^TRK[-_]?\d+/i.test(trimmed)) {
    return 'AIR'; // Tratar como AIR para procesamiento
  }
  
  return 'INVALID';
};

type ScanMode = 'INGRESO' | 'SALIDA' | null;

interface BranchInfo {
  branch_id: number;
  branch_code: string;
  branch_name: string;
  worker_name: string;
  is_admin_mode?: boolean;
  can_select_branch?: boolean;
}

interface Branch {
  id: number;
  name: string;
  code: string;
}

interface ScanResult {
  success: boolean;
  message: string;
  package_id?: number;
  tracking_number?: string;
  client_name?: string;
  service_type?: string;
  previous_branch?: string;
  next_branch?: string;
  scan_type?: string;
  warning?: string;
  // Nuevos campos para impresión de etiqueta
  labelUrl?: string;
  nationalTracking?: string;
  nationalCarrier?: string;
}

interface ScanHistoryItem {
  id: number;
  tracking_number: string;
  scan_type: string;
  scanned_at: string;
  client_name: string;
  service_type: string;
  notes: string | null;
}

interface DailyStats {
  total_ingresos: number;
  total_salidas: number;
  by_service: Array<{
    service_type: string;
    ingresos: number;
    salidas: number;
  }>;
}

const UnifiedWarehousePanel: React.FC = () => {
  const [mode, setMode] = useState<ScanMode>(null);
  const [barcode, setBarcode] = useState('');
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  // Estados para validación de guías DHL y supervisor
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [supervisorPin, setSupervisorPin] = useState('');
  const [supervisorError, setSupervisorError] = useState('');
  const [pendingDhlTracking, setPendingDhlTracking] = useState('');
  const [showDhlWizard, setShowDhlWizard] = useState(false);
  const [dhlWizardStep, setDhlWizardStep] = useState(0);
  const [dhlPackageData, setDhlPackageData] = useState<{
    tracking: string;
    weight?: number;
    pieces?: number;
    clientName?: string;
    clientPhone?: string;
    description?: string;
  } | null>(null);
  const [validatingSupervisor, setValidatingSupervisor] = useState(false);
  // Estado para impresión automática de etiquetas
  const [pdfToPrint, setPdfToPrint] = useState<string | null>(null);
  // Estado para selector de sucursales (admins)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{open: boolean; message: string; severity: 'success' | 'error' | 'warning'}>({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Estado para escaneo por lotes - tipo actual del lote (AIR, LOG o US)
  const [batchTrackingType, setBatchTrackingType] = useState<TrackingType | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar info del empleado y su sucursal
  useEffect(() => {
    console.log('🔷 UnifiedWarehousePanel MOUNTED');
    loadBranchInfo();
    loadDailyStats();
    loadBranches();
    return () => {
      console.log('🔶 UnifiedWarehousePanel UNMOUNTED');
    };
  }, []);

  // Recargar cuando cambie la sucursal seleccionada
  useEffect(() => {
    if (selectedBranchId) {
      loadBranchInfo(selectedBranchId);
      loadDailyStats(selectedBranchId);
    }
  }, [selectedBranchId]);

  // Auto-focus en el input cuando se selecciona modo
  useEffect(() => {
    if (mode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  const loadBranches = async () => {
    try {
      const res = await api.get('/admin/branches');
      setBranches(res.data.branches || []);
    } catch (err) {
      console.error('Error loading branches:', err);
    }
  };

  const loadBranchInfo = async (branchId?: number) => {
    try {
      const url = branchId ? `/warehouse/branch-info?branch_id=${branchId}` : '/warehouse/branch-info';
      const res = await api.get(url);
      setBranchInfo(res.data);
      if (res.data.branch_id && !selectedBranchId) {
        setSelectedBranchId(res.data.branch_id);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading branch info:', err);
      setLoading(false);
      const error = err as { response?: { data?: { error?: string } } };
      setSnackbar({
        open: true,
        message: error.response?.data?.error || 'Error al cargar información de sucursal',
        severity: 'error'
      });
    }
  };

  const loadDailyStats = async (branchId?: number) => {
    try {
      const url = branchId ? `/warehouse/daily-stats?branch_id=${branchId}` : '/warehouse/daily-stats';
      const res = await api.get(url);
      setDailyStats(res.data);
    } catch (err) {
      console.error('Error loading daily stats:', err);
    }
  };

  const loadScanHistory = async () => {
    try {
      const url = selectedBranchId 
        ? `/warehouse/scan-history?limit=50&branch_id=${selectedBranchId}` 
        : '/warehouse/scan-history?limit=50';
      const res = await api.get(url);
      setScanHistory(res.data.history || []);
      setShowHistory(true);
    } catch (err) {
      console.error('Error loading scan history:', err);
    }
  };

  const handleScan = async () => {
    if (!barcode.trim() || !mode) return;
    
    // 🔍 VALIDAR TIPO DE GUÍA
    const trackingType = detectTrackingType(barcode.trim());
    
    // Si es tipo inválido, rechazar inmediatamente
    if (trackingType === 'INVALID') {
      setLastResult({
        success: false,
        message: '❌ Guía no válida. Solo se aceptan: DHL (10 dígitos), AIR-XXXX, LOG-XXXX, US-XXXX'
      });
      playSound('error');
      return;
    }
    
    // Si es DHL, pedir clave de supervisor
    if (trackingType === 'DHL') {
      setPendingDhlTracking(barcode.trim());
      setShowSupervisorModal(true);
      setSupervisorPin('');
      setSupervisorError('');
      return;
    }
    
    // 🚫 VALIDAR QUE NO SE MEZCLEN TIPOS (LOG, AIR, US)
    if (batchTrackingType && batchTrackingType !== trackingType) {
      setLastResult({
        success: false,
        message: `❌ No puedes mezclar guías de diferente tipo. Ya tienes guías ${batchTrackingType} escaneadas. Primero ingresa las guías actuales o cancela el lote.`
      });
      playSound('error');
      setBarcode('');
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    
    // Si es el primer escaneo del lote, establecer el tipo
    if (!batchTrackingType) {
      setBatchTrackingType(trackingType);
    }
    
    // Para AIR, LOG, US - procesar directamente
    await processTracking(barcode.trim(), trackingType);
  };
  
  // Procesar guía después de validación
  const processTracking = async (tracking: string, trackingType: TrackingType) => {
    setScanning(true);
    setLastResult(null);
    setPdfToPrint(null);
    
    try {
      const res = await api.post('/warehouse/scan', {
        barcode: tracking,
        scanType: mode, // Corregido: era scan_type
        branch_id: selectedBranchId,
        tracking_type: trackingType // Enviar tipo de guía al backend
      });
      
      // Mapear respuesta del backend
      const result: ScanResult = {
        success: res.data.success,
        message: res.data.message,
        package_id: res.data.package?.id,
        tracking_number: res.data.package?.tracking,
        client_name: res.data.package?.clientName,
        service_type: res.data.package?.serviceType,
        labelUrl: res.data.labelUrl,
        nationalTracking: res.data.nationalTracking,
        nationalCarrier: res.data.nationalCarrier
      };
      
      setLastResult(result);
      setBarcode('');
      loadDailyStats(); // Refrescar estadísticas
      
      // Feedback sonoro
      if (result.success) {
        playSound('success');
        
        // 🖨️ AUTO-IMPRESIÓN: Si hay etiqueta, activar iframe de impresión
        if (result.labelUrl) {
          console.log('🖨️ Activando impresión de etiqueta:', result.labelUrl);
          setPdfToPrint(result.labelUrl);
        }
      } else {
        playSound('error');
      }
      
      // Auto-focus para siguiente escaneo
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      const errorMessage = error.response?.data?.error || 'Error al procesar escaneo';
      setLastResult({
        success: false,
        message: errorMessage
      });
      playSound('error');
    } finally {
      setScanning(false);
    }
  };

  // Validar clave de supervisor para DHL
  const handleSupervisorValidation = async () => {
    if (!supervisorPin.trim()) {
      setSupervisorError('Ingresa la clave del supervisor');
      return;
    }
    
    setValidatingSupervisor(true);
    setSupervisorError('');
    
    try {
      // Validar PIN del supervisor
      const res = await api.post('/warehouse/validate-supervisor', {
        pin: supervisorPin,
        branch_id: selectedBranchId
      });
      
      if (res.data.valid) {
        // Cerrar modal y abrir DhlReceptionWizard completo
        setShowSupervisorModal(false);
        setSupervisorPin('');
        setShowDhlWizard(true);
        // Guardar info del supervisor que autorizó
        console.log(`✅ Autorizado por: ${res.data.supervisor?.name}`);
      } else {
        setSupervisorError('Clave de supervisor incorrecta');
        playSound('error');
      }
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setSupervisorError(error.response?.data?.error || 'Error al validar supervisor');
      playSound('error');
    } finally {
      setValidatingSupervisor(false);
    }
  };
  
  // Procesar recepción DHL después del wizard
  const handleDhlReception = async () => {
    if (!dhlPackageData) return;
    
    setScanning(true);
    
    try {
      const res = await api.post('/warehouse/dhl-reception', {
        tracking: dhlPackageData.tracking,
        weight: dhlPackageData.weight,
        pieces: dhlPackageData.pieces,
        client_name: dhlPackageData.clientName,
        client_phone: dhlPackageData.clientPhone,
        description: dhlPackageData.description,
        branch_id: selectedBranchId,
        scan_type: mode
      });
      
      setLastResult({
        success: res.data.success,
        message: res.data.message,
        tracking_number: dhlPackageData.tracking,
        client_name: dhlPackageData.clientName,
        service_type: 'DHL Express'
      });
      
      if (res.data.success) {
        playSound('success');
        setShowDhlWizard(false);
        setDhlPackageData(null);
        setBarcode('');
        loadDailyStats();
      } else {
        playSound('error');
      }
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setLastResult({
        success: false,
        message: error.response?.data?.error || 'Error al procesar recepción DHL'
      });
      playSound('error');
    } finally {
      setScanning(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan();
    }
  };

  const playSound = (type: 'success' | 'error') => {
    // Sonido simple usando Web Audio API
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      if (type === 'success') {
        oscillator.frequency.value = 800;
        gainNode.gain.value = 0.3;
      } else {
        oscillator.frequency.value = 300;
        gainNode.gain.value = 0.4;
      }
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch {
      // Ignorar si no hay soporte de audio
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!branchInfo) {
    return (
      <Box p={4}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="h6">No tienes sucursal asignada</Typography>
          <Typography>
            Contacta a tu administrador para que te asigne una sucursal de trabajo.
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* Header con info del empleado y sucursal */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2, 
          mb: 3, 
          bgcolor: 'primary.main', 
          color: 'white',
          borderRadius: 2
        }}
      >
        <Grid container alignItems="center" spacing={2}>
          <Grid>
            <WarehouseIcon sx={{ fontSize: 48 }} />
          </Grid>
          <Grid size="grow">
            <Typography variant="h5" fontWeight="bold">
              CEDIS {branchInfo.branch_name}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <PersonIcon sx={{ fontSize: 16 }} />
              <Typography variant="body1" component="span">
                {branchInfo.worker_name} • Código: {branchInfo.branch_code}
              </Typography>
              {branchInfo.is_admin_mode && (
                <Chip 
                  label="Modo Admin" 
                  size="small" 
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} 
                />
              )}
            </Box>
          </Grid>
          
          {/* Selector de sucursales para admins */}
          {branchInfo.can_select_branch && branches.length > 0 && (
            <Grid>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel sx={{ color: 'white' }}>
                  <StoreIcon sx={{ mr: 1, fontSize: 16, verticalAlign: 'middle' }} />
                  Sucursal
                </InputLabel>
                <Select
                  value={selectedBranchId || ''}
                  label="Sucursal"
                  onChange={(e) => setSelectedBranchId(e.target.value as number)}
                  sx={{ 
                    color: 'white', 
                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'white' },
                    '.MuiSvgIcon-root': { color: 'white' }
                  }}
                >
                  {branches.map((branch) => (
                    <MenuItem key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}
          
          <Grid>
            <IconButton color="inherit" onClick={() => loadDailyStats(selectedBranchId || undefined)} title="Refrescar">
              <RefreshIcon />
            </IconButton>
            <IconButton color="inherit" onClick={loadScanHistory} title="Ver historial">
              <HistoryIcon />
            </IconButton>
          </Grid>
        </Grid>
      </Paper>

      {/* Selector de Modo */}
      {!mode && (
        <Box>
          <Typography variant="h6" textAlign="center" color="text.secondary" mb={3}>
            Selecciona el tipo de operación
          </Typography>
          <Grid container spacing={4} justifyContent="center">
            <Grid size={{ xs: 12, sm: 6, md: 5 }}>
              <Button
                fullWidth
                variant="contained"
                color="success"
                onClick={() => setMode('INGRESO')}
                sx={{ 
                  py: 8, 
                  borderRadius: 3,
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  boxShadow: 4,
                  '&:hover': { transform: 'scale(1.02)', boxShadow: 6 },
                  transition: 'all 0.2s'
                }}
              >
                <Box textAlign="center">
                  <IngresoIcon sx={{ fontSize: 80, mb: 1 }} />
                  <br />
                  INGRESO
                  <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                    Paquetes que llegan a bodega
                  </Typography>
                </Box>
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 5 }}>
              <Button
                fullWidth
                variant="contained"
                color="warning"
                onClick={() => setMode('SALIDA')}
                sx={{ 
                  py: 8, 
                  borderRadius: 3,
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  boxShadow: 4,
                  '&:hover': { transform: 'scale(1.02)', boxShadow: 6 },
                  transition: 'all 0.2s'
                }}
              >
                <Box textAlign="center">
                  <SalidaIcon sx={{ fontSize: 80, mb: 1 }} />
                  <br />
                  SALIDA
                  <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                    Paquetes que salen de bodega
                  </Typography>
                </Box>
              </Button>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Panel de Escaneo */}
      {mode && (
        <Box>
          {/* Indicador de modo activo */}
          <Paper 
            elevation={3}
            sx={{ 
              p: 3, 
              mb: 3, 
              bgcolor: mode === 'INGRESO' ? 'success.main' : 'warning.main',
              color: 'white',
              borderRadius: 2,
              textAlign: 'center'
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="center" gap={2}>
              {mode === 'INGRESO' ? (
                <IngresoIcon sx={{ fontSize: 40 }} />
              ) : (
                <SalidaIcon sx={{ fontSize: 40 }} />
              )}
              <Typography variant="h4" fontWeight="bold">
                MODO {mode}
              </Typography>
              <Button 
                variant="outlined" 
                color="inherit"
                onClick={() => {
                  setMode(null);
                  setLastResult(null);
                  setBatchTrackingType(null); // Resetear tipo de lote
                }}
                sx={{ ml: 2 }}
              >
                Cambiar
              </Button>
            </Box>
          </Paper>

          {/* Input de escaneo */}
          <Paper sx={{ p: 3, mb: 3 }}>
            {/* Indicador de tipo de guía activo */}
            {batchTrackingType && (
              <Alert 
                severity="info" 
                sx={{ mb: 2 }}
                action={
                  <Button 
                    color="inherit" 
                    size="small"
                    onClick={() => {
                      setBatchTrackingType(null);
                      setSnackbar({
                        open: true,
                        message: 'Lote reiniciado. Ahora puedes escanear cualquier tipo de guía.',
                        severity: 'success'
                      });
                    }}
                  >
                    Cambiar Tipo
                  </Button>
                }
              >
                <AlertTitle>Modo de escaneo: {batchTrackingType}</AlertTitle>
                Solo puedes escanear guías tipo <strong>{batchTrackingType}</strong>. Para escanear otro tipo, haz clic en "Cambiar Tipo".
              </Alert>
            )}
            
            <Box display="flex" gap={2} alignItems="center">
              <ScannerIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
              <TextField
                inputRef={inputRef}
                fullWidth
                variant="outlined"
                placeholder="Escanea o escribe el código de barras..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={scanning}
                autoFocus
                sx={{
                  '& .MuiInputBase-input': {
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    letterSpacing: 2
                  }
                }}
              />
              <Button
                variant="contained"
                size="large"
                onClick={handleScan}
                disabled={!barcode.trim() || scanning}
                sx={{ px: 4, py: 2 }}
              >
                {scanning ? <CircularProgress size={24} color="inherit" /> : 'PROCESAR'}
              </Button>
            </Box>
          </Paper>

          {/* Resultado del último escaneo */}
          {lastResult && (
            <Paper 
              elevation={4}
              sx={{ 
                p: 3, 
                mb: 3,
                bgcolor: lastResult.success ? 'success.light' : 'error.light',
                borderLeft: 6,
                borderColor: lastResult.success ? 'success.main' : 'error.main'
              }}
            >
              <Box display="flex" alignItems="flex-start" gap={2}>
                {lastResult.success ? (
                  <SuccessIcon sx={{ fontSize: 48, color: 'success.main' }} />
                ) : (
                  <ErrorIcon sx={{ fontSize: 48, color: 'error.main' }} />
                )}
                <Box flex={1}>
                  <Typography variant="h5" fontWeight="bold" gutterBottom>
                    {lastResult.message}
                  </Typography>
                  
                  {lastResult.success && (
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 6, md: 3 }}>
                        <Typography variant="caption" color="text.secondary">Tracking</Typography>
                        <Typography variant="body1" fontWeight="bold">
                          {lastResult.tracking_number}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 6, md: 3 }}>
                        <Typography variant="caption" color="text.secondary">Cliente</Typography>
                        <Typography variant="body1">
                          {lastResult.client_name}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 6, md: 3 }}>
                        <Typography variant="caption" color="text.secondary">Servicio</Typography>
                        <Typography variant="body1">
                          {lastResult.service_type}
                        </Typography>
                      </Grid>
                      {/* Mostrar info de guía nacional si existe */}
                      {lastResult.nationalTracking && (
                        <Grid size={{ xs: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">Guía Nacional</Typography>
                          <Typography variant="body1" fontWeight="bold" color="primary">
                            {lastResult.nationalCarrier?.toUpperCase()} - {lastResult.nationalTracking}
                          </Typography>
                        </Grid>
                      )}
                      {lastResult.previous_branch && !lastResult.nationalTracking && (
                        <Grid size={{ xs: 6, md: 3 }}>
                          <Typography variant="caption" color="text.secondary">
                            {mode === 'INGRESO' ? 'Venía de' : 'Va hacia'}
                          </Typography>
                          <Typography variant="body1">
                            {mode === 'INGRESO' ? lastResult.previous_branch : lastResult.next_branch || 'Cliente final'}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  )}

                  {/* Mostrar botón para reimprimir etiqueta si existe */}
                  {lastResult.success && lastResult.labelUrl && (
                    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Alert severity="success" sx={{ flex: 1 }}>
                        🖨️ Etiqueta enviada a impresora
                      </Alert>
                      <Button 
                        variant="outlined" 
                        size="small"
                        onClick={() => window.open(lastResult.labelUrl, '_blank')}
                      >
                        Reimprimir
                      </Button>
                    </Box>
                  )}

                  {lastResult.warning && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      {lastResult.warning}
                    </Alert>
                  )}
                </Box>
              </Box>
            </Paper>
          )}

          {/* Instrucciones */}
          <Alert severity="info" icon={<ScannerIcon />}>
            <Typography variant="body2">
              <strong>Tip:</strong> Enfoca el escáner en el código de barras. 
              El sistema detecta automáticamente si es un tracking interno (TRN, US, LOG, AIR) 
              o externo (DHL, FedEx, UPS, etc.)
            </Typography>
          </Alert>
        </Box>
      )}

      {/* Dialog de historial */}
      <Dialog 
        open={showHistory} 
        onClose={() => setShowHistory(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <HistoryIcon />
            Historial de Escaneos - Hoy
          </Box>
        </DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Hora</TableCell>
                  <TableCell>Tracking</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Servicio</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scanHistory.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell>{formatTime(scan.scanned_at)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {scan.tracking_number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={scan.scan_type}
                        size="small"
                        color={scan.scan_type === 'INGRESO' ? 'success' : 'warning'}
                      />
                    </TableCell>
                    <TableCell>{scan.client_name}</TableCell>
                    <TableCell>{scan.service_type}</TableCell>
                  </TableRow>
                ))}
                {scanHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary" py={2}>
                        No hay escaneos registrados hoy
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHistory(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para notificaciones */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* 🖨️ IFRAME OCULTO PARA IMPRESIÓN TÉRMICA AUTOMÁTICA */}
      {pdfToPrint && (
        <iframe 
          src={pdfToPrint} 
          style={{ display: 'none' }} 
          title="Etiqueta Skydropx"
          onLoad={(e) => {
            // Cuando el PDF termina de cargar, dispara la ventana de impresión automáticamente
            try {
              const iframe = e.target as HTMLIFrameElement;
              if (iframe.contentWindow) {
                iframe.contentWindow.print();
              }
            } catch (printError) {
              console.warn('No se pudo imprimir automáticamente:', printError);
              // Fallback: abrir en nueva ventana
              window.open(pdfToPrint, '_blank');
            }
          }}
        />
      )}

      {/* 🔐 MODAL CLAVE DE SUPERVISOR */}
      <Dialog 
        open={showSupervisorModal} 
        onClose={() => {
          setShowSupervisorModal(false);
          setPendingDhlTracking('');
          setSupervisorPin('');
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <LockIcon />
            Autorización Requerida
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <AlertTitle>Guía DHL Detectada</AlertTitle>
            Las guías DHL requieren autorización de un supervisor para ser procesadas.
          </Alert>
          
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Guía: <strong>{pendingDhlTracking}</strong>
          </Typography>
          
          <TextField
            fullWidth
            label="Clave de Supervisor"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={supervisorPin}
            onChange={(e) => setSupervisorPin(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSupervisorValidation()}
            error={!!supervisorError}
            helperText={supervisorError}
            sx={{ mt: 2 }}
            autoFocus
            InputProps={{
              startAdornment: <LockIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              sx: { 
                '-webkit-text-security': 'disc',
                'input': { '-webkit-text-security': 'disc' }
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={() => {
              setShowSupervisorModal(false);
              setPendingDhlTracking('');
            }}
          >
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSupervisorValidation}
            disabled={validatingSupervisor || !supervisorPin.trim()}
            startIcon={validatingSupervisor ? <CircularProgress size={20} /> : <LockIcon />}
          >
            {validatingSupervisor ? 'Validando...' : 'Autorizar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 📦 WIZARD RECEPCIÓN RÁPIDA DHL - Componente completo */}
      <DhlReceptionWizard
        open={showDhlWizard}
        onClose={() => {
          setShowDhlWizard(false);
          setBarcode('');
          setPendingDhlTracking('');
        }}
        onSuccess={() => {
          setShowDhlWizard(false);
          setBarcode('');
          setPendingDhlTracking('');
          loadDailyStats();
          playSound('success');
          setSnackbar({
            open: true,
            message: '✅ Paquete DHL recibido correctamente',
            severity: 'success'
          });
        }}
      />
    </Box>
  );
};

export default UnifiedWarehousePanel;
