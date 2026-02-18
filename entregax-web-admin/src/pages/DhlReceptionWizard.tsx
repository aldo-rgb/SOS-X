// ============================================
// WIZARD DE RECEPCIÓN DHL 📦
// Flujo paso a paso para rol Bodega
// Paso 1: Cliente (Box ID)
// Paso 2: Escanear tracking
// Paso 3: Clasificar (Standard / High Value)
// Paso 4: Peso (Báscula IoT)
// Paso 5: Medidas (IA con foto)
// ============================================

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogContent,
  Paper,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Fade,
  Slide,
  IconButton,
  Avatar,
} from '@mui/material';
import {
  QrCodeScanner as ScanIcon,
  Checkroom as ClothingIcon,
  Build as PartsIcon,
  Scale as ScaleIcon,
  CameraAlt as CameraIcon,
  CheckCircle as CheckIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Usb as UsbIcon,
  Person as PersonIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// DHL Colors
const DHL_RED = '#D40511';
const DHL_YELLOW = '#FFCC00';

interface DhlReceptionWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ClientInfo {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
}

// Wizard Steps - Ahora con Cliente primero
const STEPS = ['Cliente', 'Escanear', 'Clasificar', 'Peso', 'Medidas'];

export default function DhlReceptionWizard({ open, onClose, onSuccess }: DhlReceptionWizardProps) {
  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Client data - NUEVO PASO 1
  const [clientSearch, setClientSearch] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [searchingClient, setSearchingClient] = useState(false);

  // Form data
  const [tracking, setTracking] = useState('');
  const [productType, setProductType] = useState<'standard' | 'high_value' | null>(null);
  const [weight, setWeight] = useState<number>(0);
  const [dimensions, setDimensions] = useState({ length: 0, width: 0, height: 0 });
  
  // Hardware state
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleReading, setScaleReading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [processingAI, setProcessingAI] = useState(false);

  // Refs
  const clientInputRef = useRef<HTMLInputElement>(null);
  const trackingInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serialPortRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ===== STEP 0: BUSCAR CLIENTE =====
  useEffect(() => {
    if (open && activeStep === 0) {
      // Auto-focus en el campo de cliente
      setTimeout(() => {
        clientInputRef.current?.focus();
      }, 300);
    }
  }, [open, activeStep]);

  const searchClient = async () => {
    if (!clientSearch.trim()) return;
    
    setSearchingClient(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/admin/users/search?q=${encodeURIComponent(clientSearch)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data && response.data.length > 0) {
        // Encontrar por box_id exacto o tomar el primero
        const exactMatch = response.data.find(
          (u: ClientInfo) => u.box_id?.toUpperCase() === clientSearch.toUpperCase()
        );
        const client = exactMatch || response.data[0];
        setClientInfo(client);
        
        // Auto-avanzar al siguiente paso
        setTimeout(() => {
          setActiveStep(1);
        }, 500);
      } else {
        setError('Cliente no encontrado. Proporcione ID o Box ID válido');
      }
    } catch (err) {
      console.error('Error buscando cliente:', err);
      setError('Cliente no encontrado. Proporcione ID o Box ID válido');
    } finally {
      setSearchingClient(false);
    }
  };

  const handleClientKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchClient();
    }
  };

  // ===== STEP 1: SCANNER =====
  useEffect(() => {
    if (open && activeStep === 1) {
      // Auto-focus en el campo de tracking
      setTimeout(() => {
        trackingInputRef.current?.focus();
      }, 300);
    }
  }, [open, activeStep]);

  const handleTrackingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setTracking(value);
    
    // Auto-avance cuando el tracking tiene formato válido (ej: 10 dígitos)
    if (value.length >= 10 && /^[A-Z0-9]+$/.test(value)) {
      setTimeout(() => {
        setActiveStep(2); // Ahora paso 2 es clasificar
      }, 500);
    }
  };

  const handleTrackingKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tracking.length >= 5) {
      setActiveStep(2); // Ahora paso 2 es clasificar
    }
  };

  // ===== STEP 2: CLASSIFICATION =====
  const handleSelectProductType = (type: 'standard' | 'high_value') => {
    setProductType(type);
    setTimeout(() => {
      setActiveStep(3); // Ahora paso 3 es peso
      // Iniciar conexión con báscula
      connectScale();
    }, 300);
  };

  // ===== STEP 3: SCALE (IoT) =====
  const connectScale = async () => {
    // Web Serial API para báscula USB
    if ('serial' in navigator) {
      try {
        setScaleReading(true);
        
        // Solicitar puerto serial
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const port = await (navigator as any).serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        serialPortRef.current = port;
        setScaleConnected(true);

        // Leer datos de la báscula
        const reader = port.readable?.getReader();
        if (reader) {
          readScaleData(reader);
        }
      } catch (err) {
        console.error('Error conectando báscula:', err);
        setScaleConnected(false);
        setScaleReading(false);
        // Permitir entrada manual si no hay báscula
      }
    } else {
      console.log('Web Serial API no disponible');
      setScaleReading(false);
    }
  };

  const readScaleData = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Buscar patrón de peso (ej: "ST,GS,  0.523 kg")
        const match = buffer.match(/(\d+\.?\d*)\s*(kg|g|lb)/i);
        if (match) {
          let weightValue = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          
          // Convertir a kg si es necesario
          if (unit === 'g') weightValue /= 1000;
          if (unit === 'lb') weightValue *= 0.453592;
          
          setWeight(Math.round(weightValue * 100) / 100);
          
          // Si el peso es estable (> 0.1 kg), auto-avanzar
          if (weightValue > 0.1) {
            setTimeout(() => {
              setActiveStep(4); // Ahora paso 4 es medidas
              initCamera();
            }, 1500);
          }
          
          buffer = '';
        }
      }
    } catch (err) {
      console.error('Error leyendo báscula:', err);
    }
  };

  const handleManualWeight = () => {
    if (weight > 0) {
      setActiveStep(4); // Ahora paso 4 es medidas
      initCamera();
    }
  };

  // ===== STEP 4: CAMERA & AI MEASUREMENTS =====
  const initCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Error iniciando cámara:', err);
      setError('No se pudo acceder a la cámara');
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Capturar frame del video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    setPhotoTaken(true);
    setProcessingAI(true);

    // Convertir a base64
    const imageData = canvas.toDataURL('image/jpeg', 0.9);

    try {
      // Enviar al backend para procesamiento con IA
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/admin/dhl/measure-box`,
        { image: imageData },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setDimensions({
          length: response.data.length_cm,
          width: response.data.width_cm,
          height: response.data.height_cm || 20 // Default si solo hay 2D
        });
      }
    } catch (err) {
      console.error('Error procesando imagen:', err);
      setError('Error al medir la caja. Intenta de nuevo o ingresa manualmente.');
    } finally {
      setProcessingAI(false);
    }
  };

  const handleManualDimensions = (field: 'length' | 'width' | 'height', value: number) => {
    setDimensions(prev => ({ ...prev, [field]: value }));
  };

  // ===== SUBMIT =====
  const handleSubmit = async () => {
    if (!clientInfo || !tracking || !productType || weight <= 0) {
      setError('Faltan datos requeridos');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/admin/dhl/receive`,
        {
          user_id: clientInfo.id,
          box_id: clientInfo.box_id,
          inbound_tracking: tracking,
          product_type: productType,
          weight_kg: weight,
          length_cm: dimensions.length || 30,
          width_cm: dimensions.width || 20,
          height_cm: dimensions.height || 15,
          description: productType === 'standard' ? 'Accesorios/Mixto' : 'Sensible'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess(true);
      
      // Limpiar y preparar para siguiente paquete
      setTimeout(() => {
        resetWizard();
        onSuccess();
      }, 2000);

    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Error al registrar paquete');
    } finally {
      setLoading(false);
    }
  };

  // ===== CLEANUP =====
  const resetWizard = () => {
    setActiveStep(0);
    setClientSearch('');
    setClientInfo(null);
    setTracking('');
    setProductType(null);
    setWeight(0);
    setDimensions({ length: 0, width: 0, height: 0 });
    setPhotoTaken(false);
    setProcessingAI(false);
    setSuccess(false);
    setError(null);
    
    // Detener cámara
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleClose = () => {
    // Cerrar puerto serial
    if (serialPortRef.current) {
      serialPortRef.current.close();
      serialPortRef.current = null;
    }
    
    resetWizard();
    onClose();
  };

  // ===== RENDER STEPS =====
  const renderStep = () => {
    switch (activeStep) {
      // PASO 0: CLIENTE
      case 0:
        return (
          <Fade in={activeStep === 0}>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <PersonIcon sx={{ fontSize: 100, color: DHL_RED, mb: 3 }} />
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Número de Cliente
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                Ingresa el Box ID o número de cliente
              </Typography>
              
              <TextField
                inputRef={clientInputRef}
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value.toUpperCase())}
                onKeyPress={handleClientKeyPress}
                placeholder="Ej: S1, A25, 54"
                variant="outlined"
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: searchingClient ? (
                    <InputAdornment position="end">
                      <CircularProgress size={20} />
                    </InputAdornment>
                  ) : null,
                  sx: { 
                    fontSize: '1.5rem', 
                    fontFamily: 'monospace',
                    '& input': { textAlign: 'center' }
                  }
                }}
                sx={{ 
                  width: '100%', 
                  maxWidth: 400,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    bgcolor: '#f5f5f5'
                  }
                }}
              />
              
              {/* Cliente encontrado */}
              {clientInfo && (
                <Paper 
                  sx={{ 
                    mt: 3, 
                    p: 2, 
                    maxWidth: 400, 
                    mx: 'auto',
                    bgcolor: '#e8f5e9',
                    border: '2px solid #4caf50',
                    borderRadius: 3 
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: DHL_RED }}>
                      {clientInfo.full_name?.charAt(0) || 'C'}
                    </Avatar>
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography fontWeight="bold">{clientInfo.full_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Box ID: {clientInfo.box_id} | {clientInfo.email}
                      </Typography>
                    </Box>
                    <CheckIcon sx={{ color: '#4caf50', ml: 'auto' }} />
                  </Box>
                </Paper>
              )}
              
              <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={searchingClient ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                  onClick={searchClient}
                  disabled={!clientSearch.trim() || searchingClient}
                  sx={{ bgcolor: DHL_RED, '&:hover': { bgcolor: '#a00410' } }}
                >
                  Buscar Cliente
                </Button>
                
                {clientInfo && (
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => setActiveStep(1)}
                    sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
                  >
                    Continuar →
                  </Button>
                )}
              </Box>
            </Box>
          </Fade>
        );

      // PASO 1: ESCANEAR TRACKING
      case 1:
        return (
          <Fade in={activeStep === 1}>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <ScanIcon sx={{ fontSize: 100, color: DHL_RED, mb: 3 }} />
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Escanea el Tracking DHL
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                Usa la pistola escáner o escribe el número manualmente
              </Typography>
              
              <TextField
                inputRef={trackingInputRef}
                value={tracking}
                onChange={handleTrackingChange}
                onKeyPress={handleTrackingKeyPress}
                placeholder="Ej: 1234567890"
                variant="outlined"
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <ScanIcon color="action" />
                    </InputAdornment>
                  ),
                  sx: { 
                    fontSize: '1.5rem', 
                    fontFamily: 'monospace',
                    '& input': { textAlign: 'center' }
                  }
                }}
                sx={{ 
                  width: '100%', 
                  maxWidth: 400,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    bgcolor: '#f5f5f5'
                  }
                }}
              />
              
              {tracking.length >= 5 && (
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => setActiveStep(2)}
                  sx={{ mt: 3, bgcolor: DHL_RED, '&:hover': { bgcolor: '#a00410' } }}
                >
                  Continuar
                </Button>
              )}
            </Box>
          </Fade>
        );

      // PASO 2: CLASIFICAR
      case 2:
        return (
          <Fade in={activeStep === 2}>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Tipo de Producto
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                Selecciona la categoría del contenido
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                {/* STANDARD */}
                <Paper
                  onClick={() => handleSelectProductType('standard')}
                  sx={{
                    p: 4,
                    cursor: 'pointer',
                    borderRadius: 4,
                    width: 220,
                    textAlign: 'center',
                    transition: 'all 0.3s',
                    border: productType === 'standard' ? `4px solid ${DHL_RED}` : '4px solid transparent',
                    bgcolor: productType === 'standard' ? '#fff5f5' : '#f5f5f5',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: 6
                    }
                  }}
                >
                  <ClothingIcon sx={{ fontSize: 80, color: DHL_RED, mb: 2 }} />
                  <Typography variant="h5" fontWeight="bold">
                    Standard
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Accesorios / Mixto
                  </Typography>
                </Paper>

                {/* HIGH VALUE */}
                <Paper
                  onClick={() => handleSelectProductType('high_value')}
                  sx={{
                    p: 4,
                    cursor: 'pointer',
                    borderRadius: 4,
                    width: 220,
                    textAlign: 'center',
                    transition: 'all 0.3s',
                    border: productType === 'high_value' ? `4px solid ${DHL_YELLOW}` : '4px solid transparent',
                    bgcolor: productType === 'high_value' ? '#fffef5' : '#f5f5f5',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: 6
                    }
                  }}
                >
                  <PartsIcon sx={{ fontSize: 80, color: '#ff9800', mb: 2 }} />
                  <Typography variant="h5" fontWeight="bold">
                    High Value
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Sensible
                  </Typography>
                </Paper>
              </Box>
            </Box>
          </Fade>
        );

      // PASO 3: PESO
      case 3:
        return (
          <Fade in={activeStep === 3}>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <ScaleIcon sx={{ fontSize: 100, color: DHL_RED, mb: 3 }} />
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Peso del Paquete
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                Coloca la caja en la báscula
              </Typography>

              {/* Estado de conexión */}
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
                {scaleConnected ? (
                  <Alert severity="success" icon={<UsbIcon />}>
                    Báscula conectada
                  </Alert>
                ) : scaleReading ? (
                  <Alert severity="info" icon={<CircularProgress size={20} />}>
                    Buscando báscula...
                  </Alert>
                ) : (
                  <Button
                    variant="outlined"
                    startIcon={<UsbIcon />}
                    onClick={connectScale}
                  >
                    Conectar Báscula USB
                  </Button>
                )}
              </Box>

              {/* Display de peso */}
              <Paper
                sx={{
                  p: 4,
                  maxWidth: 300,
                  mx: 'auto',
                  borderRadius: 4,
                  bgcolor: '#111',
                  color: '#0f0',
                  fontFamily: 'monospace'
                }}
              >
                <Typography variant="h2" fontWeight="bold">
                  {weight.toFixed(2)}
                </Typography>
                <Typography variant="h6">kg</Typography>
              </Paper>

              {/* Entrada manual */}
              <Box sx={{ mt: 4 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  O ingresa el peso manualmente:
                </Typography>
                <TextField
                  type="number"
                  value={weight || ''}
                  onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                  }}
                  sx={{ width: 150 }}
                />
                <Button
                  variant="contained"
                  onClick={handleManualWeight}
                  disabled={weight <= 0}
                  sx={{ ml: 2, bgcolor: DHL_RED }}
                >
                  Continuar
                </Button>
              </Box>
            </Box>
          </Fade>
        );

      // PASO 4: MEDIDAS
      case 4:
        return (
          <Fade in={activeStep === 4}>
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Medidas del Paquete
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                {!photoTaken 
                  ? 'Coloca la caja sobre el área verde y toma la foto'
                  : 'Verifica o ajusta las medidas'
                }
              </Typography>

              {/* Área de cámara */}
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 600,
                  mx: 'auto',
                  aspectRatio: '16/9',
                  bgcolor: '#000',
                  borderRadius: 3,
                  overflow: 'hidden',
                  mb: 3
                }}
              >
                {/* Video de cámara */}
                <video
                  ref={videoRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: photoTaken ? 'none' : 'block'
                  }}
                  playsInline
                  muted
                />
                
                {/* Canvas para captura */}
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: photoTaken ? 'block' : 'none'
                  }}
                />

                {/* Overlay con guía verde */}
                {!photoTaken && cameraActive && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '60%',
                      height: '60%',
                      border: '4px dashed #4caf50',
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Typography 
                      sx={{ 
                        color: '#4caf50', 
                        bgcolor: 'rgba(0,0,0,0.5)', 
                        px: 2, 
                        py: 1, 
                        borderRadius: 2 
                      }}
                    >
                      📦 Centra la caja aquí
                    </Typography>
                  </Box>
                )}

                {/* Loading IA */}
                {processingAI && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      bgcolor: 'rgba(0,0,0,0.7)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <CircularProgress size={60} sx={{ color: '#4caf50', mb: 2 }} />
                    <Typography color="white">
                      Calculando medidas con IA...
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Botones de cámara */}
              {!photoTaken ? (
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<CameraIcon />}
                  onClick={capturePhoto}
                  disabled={!cameraActive || processingAI}
                  sx={{ bgcolor: DHL_RED, '&:hover': { bgcolor: '#a00410' } }}
                >
                  Tomar Foto
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={() => setPhotoTaken(false)}
                  sx={{ mr: 2 }}
                >
                  Volver a Tomar
                </Button>
              )}

              {/* Campos de medidas */}
              <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                <TextField
                  label="Largo"
                  type="number"
                  value={dimensions.length || ''}
                  onChange={(e) => handleManualDimensions('length', parseFloat(e.target.value) || 0)}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                  sx={{ width: 120 }}
                />
                <TextField
                  label="Ancho"
                  type="number"
                  value={dimensions.width || ''}
                  onChange={(e) => handleManualDimensions('width', parseFloat(e.target.value) || 0)}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                  sx={{ width: 120 }}
                />
                <TextField
                  label="Alto"
                  type="number"
                  value={dimensions.height || ''}
                  onChange={(e) => handleManualDimensions('height', parseFloat(e.target.value) || 0)}
                  InputProps={{ endAdornment: <InputAdornment position="end">cm</InputAdornment> }}
                  sx={{ width: 120 }}
                />
              </Box>

              {/* Botón de guardar */}
              <Button
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
                onClick={handleSubmit}
                disabled={loading}
                sx={{ 
                  mt: 4, 
                  bgcolor: '#4caf50', 
                  '&:hover': { bgcolor: '#388e3c' },
                  px: 6,
                  py: 1.5
                }}
              >
                {loading ? 'Guardando...' : 'Guardar Paquete'}
              </Button>
            </Box>
          </Fade>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 4, overflow: 'hidden' }
      }}
    >
      {/* Header */}
      <Box 
        sx={{ 
          bgcolor: DHL_RED, 
          color: 'white', 
          p: 2, 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ScanIcon sx={{ fontSize: 32 }} />
          <Typography variant="h5" fontWeight="bold">
            Recepción Rápida DHL
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Stepper */}
      <Box sx={{ px: 4, pt: 3 }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {STEPS.map((label, index) => (
            <Step key={label} completed={index < activeStep}>
              <StepLabel
                sx={{
                  '& .MuiStepLabel-label': {
                    fontWeight: index === activeStep ? 'bold' : 'normal'
                  }
                }}
              >
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <DialogContent sx={{ minHeight: 400 }}>
        {/* Success Message */}
        {success && (
          <Slide direction="up" in={success}>
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CheckIcon sx={{ fontSize: 100, color: '#4caf50', mb: 2 }} />
              <Typography variant="h4" fontWeight="bold" color="#4caf50">
                ¡Paquete Guardado!
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Tracking: {tracking}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Preparando siguiente paquete...
              </Typography>
            </Box>
          </Slide>
        )}

        {/* Error Message */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Step Content */}
        {!success && renderStep()}

        {/* Resumen flotante */}
        {activeStep > 0 && !success && (
          <Paper
            sx={{
              position: 'fixed',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              p: 2,
              bgcolor: '#111',
              color: 'white',
              borderRadius: 3,
              display: 'flex',
              gap: 3,
              alignItems: 'center',
              zIndex: 1000
            }}
          >
            {clientInfo && (
              <Box>
                <Typography variant="caption" color="grey.500">Cliente</Typography>
                <Typography fontWeight="bold">
                  📦 {clientInfo.box_id}
                </Typography>
              </Box>
            )}
            {tracking && (
              <Box>
                <Typography variant="caption" color="grey.500">Tracking</Typography>
                <Typography fontFamily="monospace" fontWeight="bold">{tracking}</Typography>
              </Box>
            )}
            {productType && (
              <Box>
                <Typography variant="caption" color="grey.500">Tipo</Typography>
                <Typography fontWeight="bold">
                  {productType === 'standard' ? '👕 Standard' : '⚙️ High Value'}
                </Typography>
              </Box>
            )}
            {weight > 0 && (
              <Box>
                <Typography variant="caption" color="grey.500">Peso</Typography>
                <Typography fontWeight="bold">{weight} kg</Typography>
              </Box>
            )}
          </Paper>
        )}
      </DialogContent>
    </Dialog>
  );
}
