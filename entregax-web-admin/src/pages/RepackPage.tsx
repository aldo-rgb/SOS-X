import { useEffect, useState, useRef, useCallback } from 'react';
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
  Stepper,
  Step,
  StepLabel,
  Grid,
} from '@mui/material';
import AllInboxIcon from '@mui/icons-material/AllInbox';
import RefreshIcon from '@mui/icons-material/Refresh';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import DeleteIcon from '@mui/icons-material/Delete';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PrintIcon from '@mui/icons-material/Print';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ChildPackage {
  id: number;
  tracking_internal: string;
  weight: number;
  description: string;
  status: string;
}

interface RepackInstruction {
  id: number;
  tracking_internal: string;
  tracking_provider: string;
  description: string;
  weight: number;
  box_id: string;
  client_name: string;
  pkg_length: number;
  pkg_width: number;
  pkg_height: number;
  status: string;
  repack_tracking: string;
  created_at: string;
  child_packages: ChildPackage[];
  child_trackings: string;
}

interface ScannedPackage {
  id: number;
  tracking: string;
  weight: number;
  boxId: string;
  description: string;
  dimensions: string;
}

interface PackageLabel {
  tracking: string;
  boxNumber: number;
  totalBoxes: number;
  clientName: string;
  clientBoxId: string;
  weight?: number;
  dimensions?: string;
  description?: string;
  destinationCity?: string;
  carrier?: string;
  isMaster?: boolean;
  masterTracking?: string;
  receivedAt?: string;
}

const WIZARD_STEPS = ['Escanear Guías Contenidas', 'Tomar Foto', 'Confirmar e Imprimir'];

export default function RepackPage() {
  const { i18n } = useTranslation();
  const [instructions, setInstructions] = useState<RepackInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Wizard de Reempaque
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [masterPackage, setMasterPackage] = useState<RepackInstruction | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [scannedPackages, setScannedPackages] = useState<ScannedPackage[]>([]);
  const [repackPhoto, setRepackPhoto] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    loadRepackInstructions();
  }, []);

  // Cargar instrucciones de reempaque pendientes
  const loadRepackInstructions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      console.log('🔍 Cargando instrucciones de reempaque...');
      console.log('🔑 Token disponible:', !!token);
      
      const res = await axios.get(`${API_URL}/api/packages/repack-instructions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('✅ Respuesta:', res.data);
      setInstructions(res.data.instructions || []);
    } catch (error: any) {
      console.error('❌ Error al cargar instrucciones:', error?.response?.status, error?.response?.data || error);
      
      // Fallback: buscar paquetes con tracking US-REPACK que estén en status 'received' o 'pending_repack'
      try {
        const token = localStorage.getItem('token');
        console.log('🔄 Intentando fallback con /api/packages...');
        const res = await axios.get(`${API_URL}/api/packages`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        interface FallbackPackage {
          id: number;
          tracking_internal?: string;
          tracking_provider?: string;
          description?: string;
          weight?: number;
          status?: string;
          pkg_length?: number;
          pkg_width?: number;
          pkg_height?: number;
          created_at?: string;
          box_id?: string;
          client?: { boxId?: string; name?: string };
        }
        const repackPkgs = (res.data.packages || []).filter((p: FallbackPackage) => 
          p.tracking_internal?.startsWith('US-REPACK') && 
          p.status && ['received', 'pending_repack', 'quoted'].includes(p.status)
        );
        console.log('📦 Paquetes de reempaque encontrados:', repackPkgs.length);
        setInstructions(repackPkgs.map((p: FallbackPackage) => ({
          id: p.id || 0,
          tracking_internal: p.tracking_internal || '',
          tracking_provider: p.tracking_provider || '',
          description: p.description || '',
          weight: p.weight || 0,
          box_id: p.client?.boxId || p.box_id || '',
          client_name: p.client?.name || '',
          pkg_length: p.pkg_length || 0,
          pkg_width: p.pkg_width || 0,
          pkg_height: p.pkg_height || 0,
          status: p.status || '',
          repack_tracking: p.tracking_internal || '',
          created_at: p.created_at || '',
          child_packages: [],
          child_trackings: ''
        })));
      } catch (e: any) {
        console.error('❌ Error en fallback:', e?.response?.status, e?.response?.data || e);
        setInstructions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Abrir wizard de reempaque
  const openWizard = () => {
    setWizardOpen(true);
    setActiveStep(0);
    setMasterPackage(null);
    setScannedPackages([]);
    setRepackPhoto(null);
    setScanInput('');
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  // Cerrar wizard
  const closeWizard = () => {
    stopCamera();
    setWizardOpen(false);
    setActiveStep(0);
    setMasterPackage(null);
    setScannedPackages([]);
    setRepackPhoto(null);
    setScanInput('');
  };

  // Manejar escaneo de paquetes contenidos - detecta automáticamente el master
  const handleScanPackage = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !scanInput.trim()) return;
    
    const tracking = scanInput.trim().toUpperCase();
    
    // No permitir escanear guías US-REPACK directamente
    if (tracking.startsWith('US-REPACK')) {
      setSnackbar({ 
        open: true, 
        message: '❌ Escanea las guías contenidas, no la guía de reempaque', 
        severity: 'error' 
      });
      setScanInput('');
      return;
    }
    
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

    // Buscar en las instrucciones locales (child_packages)
    let foundInInstruction: RepackInstruction | null = null;
    let foundChild: ChildPackage | undefined;
    
    for (const instruction of instructions) {
      foundChild = instruction.child_packages?.find(cp => cp.tracking_internal === tracking);
      if (foundChild) {
        foundInInstruction = instruction;
        break;
      }
    }

    if (foundInInstruction && foundChild) {
      // Si aún no tenemos master, lo detectamos automáticamente
      if (!masterPackage) {
        setMasterPackage(foundInInstruction);
        setSnackbar({ 
          open: true, 
          message: `✅ Detectado reempaque ${foundInInstruction.tracking_internal} para cliente ${foundInInstruction.box_id}`, 
          severity: 'success' 
        });
      } else if (foundInInstruction.id !== masterPackage.id) {
        // Pertenece a otro reempaque
        setSnackbar({ 
          open: true, 
          message: `❌ Este paquete pertenece al reempaque ${foundInInstruction.tracking_internal}, no a ${masterPackage.tracking_internal}`, 
          severity: 'error' 
        });
        setScanInput('');
        return;
      }

      // Agregar el paquete escaneado
      setScannedPackages(prev => [...prev, {
        id: foundChild!.id,
        tracking: foundChild!.tracking_internal,
        weight: Number(foundChild!.weight) || 0,
        boxId: foundInInstruction!.box_id,
        description: foundChild!.description || '',
        dimensions: ''
      }]);
      
      // Verificar si ya se escanearon todos los paquetes del reempaque
      const totalChildren = foundInInstruction.child_packages?.length || 0;
      const scannedCount = scannedPackages.length + 1;
      
      if (scannedCount >= totalChildren) {
        setSnackbar({ 
          open: true, 
          message: `✅ ${tracking} agregado. ¡Todos los paquetes escaneados! (${scannedCount}/${totalChildren})`, 
          severity: 'success' 
        });
      } else {
        setSnackbar({ 
          open: true, 
          message: `✅ ${tracking} agregado (${scannedCount}/${totalChildren})`, 
          severity: 'success' 
        });
      }
    } else {
      setSnackbar({ 
        open: true, 
        message: `❌ La guía ${tracking} no pertenece a ningún reempaque pendiente`, 
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

  // Ir al paso de foto
  const goToPhotoStep = () => {
    if (!masterPackage) {
      setSnackbar({ 
        open: true, 
        message: 'Debes escanear al menos un paquete para detectar el reempaque', 
        severity: 'warning' 
      });
      return;
    }
    const totalExpected = masterPackage.child_packages?.length || 0;
    if (scannedPackages.length < totalExpected) {
      setSnackbar({ 
        open: true, 
        message: `Faltan paquetes por escanear (${scannedPackages.length}/${totalExpected})`, 
        severity: 'warning' 
      });
      return;
    }
    setActiveStep(1);
    startCamera();
  };

  // Iniciar cámara
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error al iniciar cámara:', error);
      setSnackbar({ open: true, message: 'Error al acceder a la cámara', severity: 'error' });
    }
  }, []);

  // Detener cámara
  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  // Tomar foto
  const takePhoto = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setRepackPhoto(imageData);
      stopCamera();
      setActiveStep(2);
    }
  };

  // Volver a tomar foto
  const retakePhoto = () => {
    setRepackPhoto(null);
    setActiveStep(1);
    startCamera();
  };

  // Finalizar reempaque e imprimir etiqueta
  const finalizeRepack = async () => {
    if (!masterPackage || scannedPackages.length < 1) return;

    setProcessing(true);
    try {
      const token = localStorage.getItem('token');
      
      // Cambiar status a 'reempacado' - el paquete ya fue procesado y desaparece de pendientes
      // El status cambia a 'in_transit' cuando se procesa en Control de Salidas
      await axios.patch(`${API_URL}/api/packages/${masterPackage.id}/status`, {
        status: 'reempacado',
        notes: `Reempaque completado con ${scannedPackages.length} paquetes: ${scannedPackages.map(p => p.tracking).join(', ')}`
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Imprimir etiqueta
      printRepackLabel();

      setSnackbar({ 
        open: true, 
        message: `✅ Reempaque ${masterPackage.tracking_internal} completado con ${scannedPackages.length} paquetes - Permanece en bodega`, 
        severity: 'success' 
      });
      
      closeWizard();
      loadRepackInstructions();
    } catch (error) {
      console.error('Error al finalizar reempaque:', error);
      setSnackbar({ 
        open: true, 
        message: 'Error al procesar el reempaque', 
        severity: 'error' 
      });
    } finally {
      setProcessing(false);
    }
  };

  // Imprimir etiqueta de reempaque
  const printRepackLabel = () => {
    if (!masterPackage) return;

    const totalWeight = scannedPackages.reduce((sum, p) => sum + (p.weight || 0), 0);
    const label: PackageLabel = {
      tracking: masterPackage.tracking_internal,
      boxNumber: 1,
      totalBoxes: 1,
      clientName: masterPackage.client_name,
      clientBoxId: masterPackage.box_id,
      weight: totalWeight,
      dimensions: masterPackage.pkg_length && masterPackage.pkg_width && masterPackage.pkg_height
        ? `${masterPackage.pkg_length}x${masterPackage.pkg_width}x${masterPackage.pkg_height} cm`
        : '',
      description: `Reempaque de ${scannedPackages.length} paquetes`,
      isMaster: true,
      receivedAt: new Date().toISOString()
    };

    const printWindow = window.open('', '_blank', 'width=450,height=650');
    if (!printWindow) {
      setSnackbar({ open: true, message: 'No se pudo abrir ventana de impresión', severity: 'error' });
      return;
    }

    const formatDate = (dateStr?: string): string => {
      if (!dateStr) return new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).toUpperCase();
    };

    const receivedDate = formatDate(label.receivedAt);
    const packagesInfo = scannedPackages.map(p => p.tracking).join(' + ');

    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Etiqueta Reempaque - ${label.tracking}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; }
        .label { 
          width: 4in; 
          height: 6in; 
          padding: 0.25in; 
          border: 2px solid #000; 
          display: flex; 
          flex-direction: column; 
          margin: 0 auto; 
          position: relative;
        }
        .header { 
          display: flex; 
          justify-content: flex-end; 
          align-items: center; 
          margin-bottom: 4px;
        }
        .date-badge { 
          background: #111; 
          color: white; 
          padding: 4px 10px; 
          font-size: 12px; 
          font-weight: bold; 
          border-radius: 4px;
        }
        .repack-badge { 
          background: #9C27B0; 
          color: white; 
          text-align: center; 
          padding: 8px; 
          font-weight: bold; 
          font-size: 16px;
          margin-bottom: 8px; 
          border-radius: 4px;
        }
        .tracking-main { text-align: center; margin: 4px 0; }
        .tracking-code { font-size: 24px; font-weight: 900; letter-spacing: 1px; }
        .box-indicator { 
          color: #333;
          font-weight: 600;
          display: inline-block; 
          padding: 2px 8px; 
          font-size: 12px; 
          margin-top: 2px;
        }
        .qr-section { text-align: center; margin: 6px 0; }
        .qr-section img, .qr-section canvas, .qr-section svg { width: 140px !important; height: 140px !important; }
        .barcode-section { text-align: center; margin: 4px 0; }
        .barcode-section svg { width: 85%; height: 65px; }
        .divider { border-top: 2px dashed #ccc; margin: 6px 0; }
        .client-info { text-align: center; margin: 4px 0; }
        .client-box { 
          font-size: 64px; 
          font-weight: 900; 
          color: #F05A28;
          letter-spacing: 3px;
        }
        .details { display: flex; gap: 15px; justify-content: center; font-size: 16px; font-weight: 600; margin: 4px 0; }
        .detail-item { background: #f5f5f5; padding: 3px 10px; border-radius: 4px; }
        .packages-list { 
          font-size: 10px; 
          color: #666; 
          text-align: center; 
          margin: 5px 0;
          padding: 5px;
          background: #f9f9f9;
          border-radius: 4px;
        }
        .footer { font-size: 8px; text-align: center; color: #999; margin-top: auto; padding-top: 3px; }
        @media print { 
          @page { size: 4in 6in; margin: 0; }
          body { margin: 0; }
          .label { border: none; }
        }
      </style>
      </head><body>
      <div class="label">
        <div class="header">
          <div class="date-badge">${receivedDate}</div>
        </div>
        
        <div class="repack-badge">📦 REEMPAQUE - ${scannedPackages.length} PAQUETES</div>
        
        <div class="tracking-main">
          <div class="tracking-code">${label.tracking}</div>
          <div class="box-indicator">${scannedPackages.length} paquetes consolidados</div>
        </div>
        
        <div class="qr-section">
          <div id="qr"></div>
        </div>
        <div class="barcode-section">
          <svg id="barcode"></svg>
        </div>
        
        <div class="divider"></div>
        
        <div class="client-info">
          <div class="client-box">📦 ${label.clientBoxId}</div>
        </div>
        
        <div class="details">
          ${label.weight ? `<span class="detail-item">⚖️ ${totalWeight.toFixed(1)} kg</span>` : ''}
          ${label.dimensions ? `<span class="detail-item">📐 ${label.dimensions}</span>` : ''}
        </div>
        
        <div class="packages-list">
          <strong>Contiene:</strong> ${packagesInfo}
        </div>
        
        <div class="footer">
          <small>Impreso: ${new Date().toLocaleString('es-MX')} | Escanea el QR para rastrear</small>
        </div>
      </div>
      
      <script>
        // Generar código de barras
        try {
          JsBarcode("#barcode", "${label.tracking}", {
            format: "CODE128",
            width: 2.2,
            height: 70,
            displayValue: false,
            margin: 0
          });
        } catch(e) { console.error('Error barcode:', e); }
        
        // Generar QR
        try {
          var qr = qrcode(0, 'M');
          qr.addData('${label.tracking}');
          qr.make();
          document.getElementById('qr').innerHTML = qr.createImgTag(4, 0);
        } catch(e) { console.error('Error QR:', e); }
        
        // Imprimir automáticamente
        setTimeout(function() { window.print(); }, 500);
      </script>
      </body></html>
    `);
    printWindow.document.close();
  };

  // Calcular peso total escaneado
  const totalScannedWeight = scannedPackages.reduce((sum, p) => sum + (p.weight || 0), 0);

  // Renderizar contenido según el paso del wizard
  const renderWizardStep = () => {
    switch (activeStep) {
      case 0: // Escanear guías contenidas
        return (
          <Box sx={{ p: 3 }}>
            {!masterPackage ? (
              <>
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                  <AllInboxIcon sx={{ fontSize: 64, color: '#9C27B0', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Escanea las guías contenidas
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    El sistema detectará automáticamente el reempaque
                  </Typography>
                </Box>
              </>
            ) : (
              <Paper sx={{ p: 2, mb: 2, bgcolor: '#f3e5f5' }}>
                <Typography variant="subtitle2" color="text.secondary">Reempaque Detectado:</Typography>
                <Typography variant="h6" fontWeight={700} color="secondary">
                  {masterPackage.tracking_internal}
                </Typography>
                <Typography variant="body2">
                  Cliente: <strong>{masterPackage.box_id}</strong> - {masterPackage.client_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Guías esperadas: {masterPackage.child_packages?.length || 0}
                </Typography>
              </Paper>
            )}
            
            <TextField
              inputRef={scanInputRef}
              fullWidth
              placeholder="Escanear guía contenida (ej: US-XY1E7114)..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleScanPackage}
              autoFocus
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: <QrCodeScannerIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />

            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography variant="h4" fontWeight={700} color="secondary">
                    {scannedPackages.length}{masterPackage ? `/${masterPackage.child_packages?.length || 0}` : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Paquetes Escaneados
                  </Typography>
                </CardContent>
              </Card>
              <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography variant="h4" fontWeight={700} color="info.main">
                    {totalScannedWeight.toFixed(1)} kg
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Peso Total
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
              {scannedPackages.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    Escanea los paquetes contenidos en el reempaque
                  </Typography>
                </Box>
              ) : (
                <List dense>
                  {scannedPackages.map((pkg, index) => (
                    <Box key={pkg.tracking}>
                      {index > 0 && <Divider />}
                      <ListItem>
                        <ListItemText
                          primary={<Typography fontWeight={600}>{pkg.tracking}</Typography>}
                          secondary={`${pkg.weight} kg • ${pkg.description || 'Sin descripción'}`}
                        />
                        <ListItemSecondaryAction>
                          <IconButton size="small" onClick={() => removeScannedPackage(pkg.tracking)} color="error">
                            <DeleteIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    </Box>
                  ))}
                </List>
              )}
            </Paper>

            <Box sx={{ mt: 2, textAlign: 'right' }}>
              <Button
                variant="contained"
                endIcon={<ArrowForwardIcon />}
                onClick={goToPhotoStep}
                disabled={!masterPackage || scannedPackages.length < (masterPackage?.child_packages?.length || 1)}
                sx={{ bgcolor: '#9C27B0', '&:hover': { bgcolor: '#7B1FA2' } }}
              >
                Siguiente: Tomar Foto
              </Button>
            </Box>
          </Box>
        );
      
      case 1: // Tomar foto
        return (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              📷 Fotografía del Reempaque
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Toma una foto de todos los paquetes dentro de la caja de reempaque
            </Typography>
            
            <Box sx={{ 
              width: '100%', 
              maxWidth: 400, 
              mx: 'auto', 
              aspectRatio: '4/3', 
              bgcolor: '#000', 
              borderRadius: 2,
              overflow: 'hidden',
              mb: 2
            }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Box>
            
            <Button
              variant="contained"
              size="large"
              startIcon={<CameraAltIcon />}
              onClick={takePhoto}
              sx={{ bgcolor: '#9C27B0', '&:hover': { bgcolor: '#7B1FA2' } }}
            >
              Tomar Foto
            </Button>
          </Box>
        );
      
      case 2: // Confirmar e imprimir
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom textAlign="center">
              ✅ Confirmar Reempaque
            </Typography>
            
            {repackPhoto && (
              <Box sx={{ 
                width: '100%', 
                maxWidth: 300, 
                mx: 'auto', 
                mb: 2,
                borderRadius: 2,
                overflow: 'hidden',
                border: '2px solid #9C27B0'
              }}>
                <img src={repackPhoto} alt="Reempaque" style={{ width: '100%', display: 'block' }} />
              </Box>
            )}
            
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#f9f9f9' }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2" color="text.secondary">Guía Reempaque:</Typography>
                  <Typography fontWeight={700} color="secondary">{masterPackage?.tracking_internal}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2" color="text.secondary">Cliente:</Typography>
                  <Typography fontWeight={700}>{masterPackage?.box_id}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2" color="text.secondary">Paquetes:</Typography>
                  <Typography fontWeight={700}>{scannedPackages.length}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="body2" color="text.secondary">Peso Total:</Typography>
                  <Typography fontWeight={700}>{totalScannedWeight.toFixed(1)} kg</Typography>
                </Grid>
              </Grid>
            </Paper>
            
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Paquetes incluidos:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              {scannedPackages.map(pkg => (
                <Chip key={pkg.tracking} label={pkg.tracking} size="small" />
              ))}
            </Box>
            
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={retakePhoto} startIcon={<CameraAltIcon />}>
                Retomar Foto
              </Button>
              <Button
                variant="contained"
                fullWidth
                onClick={finalizeRepack}
                disabled={processing}
                startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <PrintIcon />}
                sx={{ bgcolor: '#9C27B0', '&:hover': { bgcolor: '#7B1FA2' } }}
              >
                {processing ? 'Procesando...' : 'Finalizar e Imprimir Etiqueta'}
              </Button>
            </Box>
          </Box>
        );
      
      default:
        return null;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} color="text.primary">
            <AllInboxIcon sx={{ mr: 1, verticalAlign: 'bottom', color: '#9C27B0' }} />
            {i18n.language === 'es' ? 'Reempaque' : 'Repack'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {i18n.language === 'es' 
              ? 'Instrucciones de reempaque pendientes. Consolida múltiples paquetes en una sola caja.' 
              : 'Pending repack instructions. Consolidate multiple packages into one box.'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={i18n.language === 'es' ? 'Actualizar' : 'Refresh'}>
            <IconButton onClick={loadRepackInstructions} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AllInboxIcon />}
            onClick={openWizard}
            sx={{ 
              bgcolor: '#9C27B0', 
              '&:hover': { bgcolor: '#7B1FA2' },
              fontWeight: 600
            }}
          >
            {i18n.language === 'es' ? 'Crear Reempaque' : 'Create Repack'}
          </Button>
        </Box>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(156, 39, 176, 0.05)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="secondary">
            {instructions.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' ? 'Pendientes' : 'Pending'}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(33, 150, 243, 0.05)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="info.main">
            {(instructions.reduce((sum, p) => sum + (Number(p.weight) || 0), 0)).toFixed(1)} kg
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' ? 'Peso Total' : 'Total Weight'}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(16, 185, 129, 0.05)', borderRadius: 2 }}>
          <Typography variant="h4" fontWeight={700} color="success.main">
            {new Set(instructions.map(p => p.box_id)).size}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' ? 'Clientes' : 'Customers'}
          </Typography>
        </Paper>
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: '#9C27B0' }} />
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#1a1a2e' }}>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>GUÍA REEMPAQUE</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>CLIENTE</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>GUÍAS CONTENIDAS</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>DIMENSIONES</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>PESO</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>ESTADO</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {instructions.map((inst) => (
                <TableRow key={inst.id} hover>
                  <TableCell>
                    <Typography fontWeight={600} color="secondary">
                      {inst.tracking_internal}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {inst.child_packages?.length || 0} paquetes
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={inst.box_id} 
                      size="small" 
                      sx={{ fontWeight: 600, bgcolor: '#f5f5f5' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 300 }}>
                      {inst.child_packages && inst.child_packages.length > 0 ? (
                        inst.child_packages.map((child) => (
                          <Chip
                            key={child.id}
                            label={child.tracking_internal}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        ))
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {inst.tracking_provider || '-'}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {inst.pkg_length && inst.pkg_width && inst.pkg_height 
                      ? `${inst.pkg_length}x${inst.pkg_width}x${inst.pkg_height} cm`
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={500}>
                      {inst.weight ? `${inst.weight} kg` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={inst.status === 'received' ? 'Pendiente' : inst.status}
                      size="small"
                      color="warning"
                    />
                  </TableCell>
                </TableRow>
              ))}

              {instructions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                    <AllInboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                    <Typography color="text.secondary">
                      {i18n.language === 'es' 
                        ? 'No hay instrucciones de reempaque pendientes' 
                        : 'No pending repack instructions'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ===== WIZARD DE REEMPAQUE ===== */}
      <Dialog 
        open={wizardOpen} 
        onClose={!processing ? closeWizard : undefined}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3, overflow: 'hidden' }
        }}
      >
        <Box sx={{ 
          bgcolor: '#9C27B0', 
          color: 'white', 
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <AllInboxIcon sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {i18n.language === 'es' ? 'Procesar Reempaque' : 'Process Repack'}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {WIZARD_STEPS[activeStep]}
            </Typography>
          </Box>
        </Box>

        <Stepper activeStep={activeStep} sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          {WIZARD_STEPS.map((label, index) => (
            <Step key={label}>
              <StepLabel>{index + 1}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <DialogContent sx={{ p: 0 }}>
          {renderWizardStep()}
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
          <Button onClick={closeWizard} disabled={processing}>
            {i18n.language === 'es' ? 'Cancelar' : 'Cancel'}
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
