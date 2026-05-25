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
  DialogTitle,
  DialogActions,
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
  Inventory2 as ClothingIcon,
  VerifiedUser as PartsIcon,
  Scale as ScaleIcon,
  CameraAlt as CameraIcon,
  CheckCircle as CheckIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Usb as UsbIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  Lock as LockIcon,
  Warning as WarningIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import axios from 'axios';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// DHL Colors
const DHL_RED = '#D40511';
const DHL_YELLOW = '#FFCC00';

// Códigos QR/barcode para etiquetas de clasificación (escaneables con pistola)
const SCAN_CODE_STANDARD = 'DHL-GENERAL';
const SCAN_CODE_HIGH_VALUE = 'DHL-ESPECIFICA';

// Genera PDF 4×6 con dos etiquetas de clasificación (una por hoja)
function printClassifyLabels() {
  const doc = new jsPDF({ unit: 'in', format: [4, 6], orientation: 'portrait' });

  const labels: { code: string; title: string; subtitle: string; color: string }[] = [
    { code: SCAN_CODE_STANDARD,   title: 'General',   subtitle: 'Carga General',   color: '#D40511' },
    { code: SCAN_CODE_HIGH_VALUE, title: 'Específica', subtitle: 'Carga Específica', color: '#ff9800' },
  ];

  labels.forEach((lbl, idx) => {
    if (idx > 0) doc.addPage([4, 6]);

    // Borde superior de color
    doc.setFillColor(lbl.color);
    doc.rect(0, 0, 4, 0.35, 'F');

    // Título
    doc.setTextColor(lbl.color);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text(lbl.title, 2, 1.1, { align: 'center' });

    // Subtítulo
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.text(lbl.subtitle, 2, 1.5, { align: 'center' });

    // Código de texto (referencia visual)
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(9);
    doc.text(lbl.code, 2, 1.8, { align: 'center' });

    // QR Code via canvas
    try {
      const qrCanvas = document.createElement('canvas');
      qrCanvas.width = 200;
      qrCanvas.height = 200;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const QRCodeLib = (window as any).QRCode;
      if (QRCodeLib) {
        new QRCodeLib(qrCanvas, { text: lbl.code, width: 200, height: 200, correctLevel: QRCodeLib.CorrectLevel.M });
      }
      const qrDataUrl = qrCanvas.toDataURL('image/png');
      if (qrDataUrl.length > 100) {
        doc.addImage(qrDataUrl, 'PNG', 1.2, 2.0, 1.6, 1.6);
      }
    } catch { /* skip QR if library unavailable */ }

    // Código de barras via JsBarcode + canvas
    try {
      const barcodeCanvas = document.createElement('canvas');
      JsBarcode(barcodeCanvas, lbl.code, {
        format: 'CODE128',
        width: 2.5,
        height: 60,
        displayValue: false,
        margin: 0,
      });
      const barDataUrl = barcodeCanvas.toDataURL('image/png');
      doc.addImage(barDataUrl, 'PNG', 0.3, 3.85, 3.4, 0.7);
    } catch { /* skip barcode if error */ }

    // Texto del código de barras
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(lbl.code, 2, 4.75, { align: 'center' });

    // Footer
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('EntregaX · DHL Reception', 2, 5.75, { align: 'center' });
  });

  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

interface DhlReceptionWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  supervisorName?: string;
}

interface ClientInfo {
  id: number;
  full_name: string;
  email: string;
  box_id: string;
}

// Wizard Steps - Ahora con Cliente primero
const STEPS = ['Cliente', 'Escanear', 'Clasificar', 'Peso', 'Medidas'];

export default function DhlReceptionWizard({ open, onClose, onSuccess, supervisorName }: DhlReceptionWizardProps) {
  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Client data - NUEVO PASO 1
  const [clientSearch, setClientSearch] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [searchingClient, setSearchingClient] = useState(false);

  // Form data — tracking = LARGA/JJD (única, requerida), tracking2 = CORTA/master (puede repetir, requerida)
  const [tracking, setTracking] = useState('');
  const [tracking2, setTracking2] = useState('');
  const [trackingWarning, setTrackingWarning] = useState<string | null>(null);
  const [tracking2Warning, setTracking2Warning] = useState<string | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [productType, setProductType] = useState<'standard' | 'high_value' | null>(null);
  const [weight, setWeight] = useState<number>(0);
  const [dimensions, setDimensions] = useState({ length: 0, width: 0, height: 0 });
  
  // Hardware state
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleReading, setScaleReading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [processingAI, setProcessingAI] = useState(false);

  // 🔐 Estado para cierre protegido con PIN
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closePin, setClosePin] = useState('');
  const [closePinError, setClosePinError] = useState('');
  const [validatingClosePin, setValidatingClosePin] = useState(false);

  // Refs
  const clientInputRef = useRef<HTMLInputElement>(null);
  const trackingInputRef = useRef<HTMLInputElement>(null);
  const tracking2InputRef = useRef<HTMLInputElement>(null);
  const classifyScanRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serialPortRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Audio feedback (beeps generados con Web Audio API, sin assets)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioCtxRef = useRef<any>(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  };
  const playTone = (freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.15) => {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gainNode.gain.value = gain;
      osc.connect(gainNode).connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      // Fade out para evitar click
      gainNode.gain.setValueAtTime(gain, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      osc.stop(now + durationMs / 1000);
    } catch { /* sin audio */ }
  };
  const playSuccessBeep = () => {
    playTone(880, 90, 'sine', 0.18);
    setTimeout(() => playTone(1320, 120, 'sine', 0.18), 90);
  };
  const playErrorBeep = () => {
    playTone(220, 180, 'square', 0.2);
    setTimeout(() => playTone(180, 220, 'square', 0.2), 180);
  };

  // Debounce + dedupe de validacion del scanner
  const lastEvalTrackingRef = useRef<string>('');
  const lastEvalTracking2Ref = useRef<string>('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trackingEvalTimerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tracking2EvalTimerRef = useRef<any>(null);

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

  const normalizeTracking = (raw: string) =>
    raw.toUpperCase().replace(/¿/g, '+').replace(/\?/g, '+');

  // Detecta código de referencia interna DHL (2LMX64000+48000001)
  const is2LMXCode = (value: string) => /^[A-Z0-9]{3,}\+\d+$/i.test(value.trim());
  // Detecta guía corta/master: numérica o < 15 caracteres (no es JJD larga)
  const isShortCode = (value: string) => value.trim().length > 0 && (value.trim().length < 14 || /^\d+$/.test(value.trim()));
  // Detecta guía JJD larga
  const isJJDCode = (value: string) => /^JJD\d{15,}/i.test(value.trim()) || value.trim().length >= 18;

  // Verificar duplicado de guía larga contra la API
  const checkDuplicateLarga = async (value: string) => {
    if (value.length < 10) return;
    setCheckingDuplicate(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/admin/dhl/shipments`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: value, limit: 5 },
      });
      const rows: { inbound_tracking: string; secondary_tracking?: string }[] = res.data || [];
      const dup = rows.find(
        (r) => r.inbound_tracking?.toUpperCase() === value.toUpperCase()
          || r.secondary_tracking?.toUpperCase() === value.toUpperCase()
      );
      if (dup) {
        setTrackingWarning(`⚠️ Esta guía JJD ya fue recibida en el sistema.`);
        playErrorBeep();
        setTimeout(() => {
          setTracking('');
          setTrackingWarning(null);
          lastEvalTrackingRef.current = '';
          trackingInputRef.current?.focus();
        }, 1400);
      }
    } catch { /* ignorar */ } finally {
      setCheckingDuplicate(false);
    }
  };

  // Campo 1: LARGA (JJD) — debe ser larga, única, no 2LMX, no corta
  const handleTrackingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = normalizeTracking(e.target.value);
    setTracking(value);
    setTrackingWarning(null);

    // Debounce: evaluar 220ms despues del ultimo cambio (scanner inyecta chars muy rapido)
    if (trackingEvalTimerRef.current) clearTimeout(trackingEvalTimerRef.current);
    trackingEvalTimerRef.current = setTimeout(() => {
      if (!value || value === lastEvalTrackingRef.current) return;
      lastEvalTrackingRef.current = value;

      if (is2LMXCode(value)) {
        setTrackingWarning('Código de referencia interna DHL. Escanea el código JJD largo del paquete (Ej: JJD014600012610001490).');
        playErrorBeep();
        // Limpiar para esperar la guia correcta
        setTimeout(() => {
          setTracking('');
          setTrackingWarning(null);
          lastEvalTrackingRef.current = '';
          trackingInputRef.current?.focus();
        }, 1100);
        return;
      }
      if (value.length >= 5 && isShortCode(value)) {
        setTrackingWarning('Esta parece la guía CORTA (master). Escanea primero la guía LARGA (JJD) del paquete físico.');
        playErrorBeep();
        setTimeout(() => {
          setTracking('');
          setTrackingWarning(null);
          lastEvalTrackingRef.current = '';
          trackingInputRef.current?.focus();
        }, 1100);
        return;
      }
      if (isJJDCode(value) && value.length >= 14) {
        playSuccessBeep();
        checkDuplicateLarga(value);
        setTimeout(() => tracking2InputRef.current?.focus(), 200);
      }
    }, 220);
  };

  const handleTrackingKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tracking.trim().length >= 5 && !trackingWarning) {
      tracking2InputRef.current?.focus();
    }
  };

  // Campo 2: CORTA (master) — puede repetir, no debe ser JJD larga
  const handleTracking2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = normalizeTracking(e.target.value);
    setTracking2(value);
    setTracking2Warning(null);

    if (tracking2EvalTimerRef.current) clearTimeout(tracking2EvalTimerRef.current);
    tracking2EvalTimerRef.current = setTimeout(() => {
      if (!value || value === lastEvalTracking2Ref.current) return;
      lastEvalTracking2Ref.current = value;

      if (is2LMXCode(value)) {
        setTracking2Warning('Código de referencia interna. Ingresa el número corto master (Ej: 9650623485).');
        playErrorBeep();
        setTimeout(() => {
          setTracking2('');
          setTracking2Warning(null);
          lastEvalTracking2Ref.current = '';
          tracking2InputRef.current?.focus();
        }, 1100);
        return;
      }
      if (value.length > 15 && isJJDCode(value)) {
        setTracking2Warning('Parece una guía JJD larga. La guía corta es el número master (Ej: 9650623485).');
        playErrorBeep();
        setTimeout(() => {
          setTracking2('');
          setTracking2Warning(null);
          lastEvalTracking2Ref.current = '';
          tracking2InputRef.current?.focus();
        }, 1100);
        return;
      }
      if (value.length >= 6) {
        playSuccessBeep();
        // No auto-advance — user must click Continuar after reviewing both fields
      }
    }, 220);
  };

  const handleTracking2KeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tracking.trim().length >= 5 && tracking2.trim().length >= 4 && !trackingWarning && !tracking2Warning) {
      setActiveStep(2);
    }
  };

  // ===== STEP 2: CLASSIFICATION =====
  const handleSelectProductType = (type: 'standard' | 'high_value') => {
    setProductType(type);
    playSuccessBeep();
    setTimeout(() => {
      setActiveStep(3);
    }, 300);
  };

  const handleClassifyScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim().toUpperCase();
    if (raw === SCAN_CODE_STANDARD) {
      e.target.value = '';
      handleSelectProductType('standard');
    } else if (raw === SCAN_CODE_HIGH_VALUE) {
      e.target.value = '';
      handleSelectProductType('high_value');
    }
    // any other scan: ignore and keep waiting
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
              setActiveStep(4); // Ahora paso 4 es medidas — NO iniciar cámara
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
      setActiveStep(4); // Ahora paso 4 es medidas — NO iniciar cámara automáticamente
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
    if (!clientInfo || !tracking || !tracking2 || !productType || weight <= 0) {
      setError('Faltan datos requeridos (guía larga, guía corta, tipo de producto y peso)');
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
          secondary_tracking: tracking2.trim() || undefined,
          product_type: productType,
          weight_kg: weight,
          length_cm: dimensions.length || 30,
          width_cm: dimensions.width || 20,
          height_cm: dimensions.height || 15,
          description: productType === 'standard' ? 'General' : 'Específica'
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
    setTracking2('');
    setTrackingWarning(null);
    setTracking2Warning(null);
    setCheckingDuplicate(false);
    lastEvalTrackingRef.current = '';
    lastEvalTracking2Ref.current = '';
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

  // 🔐 Intentar cerrar - mostrar modal de confirmación con PIN
  const handleCloseAttempt = () => {
    // Si ya terminó exitosamente, cerrar sin PIN
    if (success) {
      handleClose();
      return;
    }
    // Si no ha ingresado nada aún (step 0 y sin cliente), permitir cerrar
    if (activeStep === 0 && !clientInfo && !tracking) {
      handleClose();
      return;
    }
    // Mostrar modal de confirmación con PIN
    setShowCloseConfirm(true);
    setClosePin('');
    setClosePinError('');
  };

  // 🔐 Validar PIN de supervisor para cerrar
  const handleValidateClosePin = async () => {
    if (!closePin.trim()) {
      setClosePinError('Ingresa el PIN de supervisor');
      return;
    }

    setValidatingClosePin(true);
    setClosePinError('');

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/api/warehouse/validate-supervisor`,
        { pin: closePin, action_type: 'dhl_wizard_cancel' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.valid) {
        console.log(`🔐 Wizard cancelado por supervisor: ${res.data.supervisor?.name}`);
        setShowCloseConfirm(false);
        handleClose();
      } else {
        setClosePinError('PIN de supervisor incorrecto');
      }
    } catch (err) {
      console.error('Error validando PIN:', err);
      setClosePinError('Error al validar PIN');
    } finally {
      setValidatingClosePin(false);
    }
  };

  const handleClose = () => {
    // Cerrar puerto serial
    if (serialPortRef.current) {
      serialPortRef.current.close();
      serialPortRef.current = null;
    }
    
    resetWizard();
    setShowCloseConfirm(false);
    setClosePin('');
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
              <ScanIcon sx={{ fontSize: 80, color: DHL_RED, mb: 2 }} />
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Escanea las Guías DHL
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                Escanea ambas etiquetas del paquete con la pistola escáner
              </Typography>

              {/* Campo 1: Guía LARGA (JJD) — requerida, única */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, textAlign: 'left', maxWidth: 420, mx: 'auto' }}>
                  1️⃣ Guía <strong>larga (JJD)</strong> — código de barras del paquete físico <span style={{ color: 'red' }}>*</span>
                </Typography>
                <TextField
                  inputRef={trackingInputRef}
                  value={tracking}
                  onChange={handleTrackingChange}
                  onKeyDown={handleTrackingKeyDown}
                  placeholder="Ej: JJD014600012610001490"
                  variant="outlined"
                  autoFocus
                  error={!!trackingWarning}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <ScanIcon color={trackingWarning ? 'error' : tracking && !trackingWarning ? 'success' : 'action'} />
                        </InputAdornment>
                      ),
                      endAdornment: checkingDuplicate ? (
                        <InputAdornment position="end">
                          <CircularProgress size={18} />
                        </InputAdornment>
                      ) : undefined,
                      sx: { fontSize: '1.2rem', fontFamily: 'monospace', '& input': { textAlign: 'center' } }
                    }
                  }}
                  sx={{
                    width: '100%',
                    maxWidth: 420,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      bgcolor: trackingWarning ? '#fff5f5' : tracking && !trackingWarning ? '#f0fdf4' : '#f5f5f5',
                    }
                  }}
                />
                {trackingWarning && (
                  <Alert severity="error" sx={{ mt: 1, maxWidth: 420, mx: 'auto', textAlign: 'left' }}>
                    {trackingWarning}
                  </Alert>
                )}
              </Box>

              {/* Campo 2: Guía CORTA (master) — requerida, puede repetir */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, textAlign: 'left', maxWidth: 420, mx: 'auto' }}>
                  2️⃣ Guía <strong>corta (master)</strong> — número corto del envío (Ej: 9650623485) <span style={{ color: 'red' }}>*</span>
                </Typography>
                <TextField
                  inputRef={tracking2InputRef}
                  value={tracking2}
                  onChange={handleTracking2Change}
                  onKeyDown={handleTracking2KeyDown}
                  placeholder="Ej: 9650623485"
                  variant="outlined"
                  error={!!tracking2Warning}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <ScanIcon color={tracking2Warning ? 'error' : tracking2 && !tracking2Warning ? 'success' : 'action'} />
                        </InputAdornment>
                      ),
                      sx: { fontSize: '1.2rem', fontFamily: 'monospace', '& input': { textAlign: 'center' } }
                    }
                  }}
                  sx={{
                    width: '100%',
                    maxWidth: 420,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      bgcolor: tracking2Warning ? '#fff5f5' : tracking2 && !tracking2Warning ? '#f0fdf4' : '#f5f5f5',
                    }
                  }}
                />
                {tracking2Warning && (
                  <Alert severity="warning" sx={{ mt: 1, maxWidth: 420, mx: 'auto', textAlign: 'left' }}>
                    {tracking2Warning}
                  </Alert>
                )}
              </Box>

              {/* Botón — ambas guías requeridas */}
              {tracking.length >= 5 && tracking2.length >= 4 && !trackingWarning && !tracking2Warning && !checkingDuplicate && (
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => setActiveStep(2)}
                  sx={{ bgcolor: DHL_RED, '&:hover': { bgcolor: '#a00410' } }}
                >
                  Continuar (2 guías)
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
              {/* Input oculto que captura el scan de la pistola */}
              <input
                ref={classifyScanRef}
                autoFocus
                onChange={handleClassifyScan}
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
                tabIndex={-1}
              />

              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Tipo de Producto
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 1 }}>
                Selecciona la categoría del contenido o escanea la etiqueta
              </Typography>

              {/* Botón imprimir etiquetas */}
              <Button
                startIcon={<PrintIcon />}
                size="small"
                variant="outlined"
                onClick={printClassifyLabels}
                sx={{ mb: 3, borderColor: DHL_RED, color: DHL_RED, '&:hover': { borderColor: '#a00410', bgcolor: '#fff5f5' } }}
              >
                Imprimir etiquetas de clasificación
              </Button>

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
                    '&:hover': { transform: 'scale(1.05)', boxShadow: 6 }
                  }}
                >
                  <ClothingIcon sx={{ fontSize: 80, color: DHL_RED, mb: 2 }} />
                  <Typography variant="h5" fontWeight="bold">General</Typography>
                  <Typography variant="body2" color="text.secondary">Carga General</Typography>
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
                    '&:hover': { transform: 'scale(1.05)', boxShadow: 6 }
                  }}
                >
                  <PartsIcon sx={{ fontSize: 80, color: '#ff9800', mb: 2 }} />
                  <Typography variant="h5" fontWeight="bold">Específica</Typography>
                  <Typography variant="body2" color="text.secondary">Carga Específica</Typography>
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
                  autoFocus
                  value={weight || ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setWeight(isNaN(v) || v < 0 ? 0 : v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && weight > 0) handleManualWeight();
                  }}
                  slotProps={{
                    input: { endAdornment: <InputAdornment position="end">kg</InputAdornment> },
                    htmlInput: { min: 0, step: 0.01 },
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
                {cameraActive
                  ? photoTaken ? 'Verifica o ajusta las medidas detectadas' : 'Centra la caja y toma la foto'
                  : 'Ingresa las medidas manualmente'}
              </Typography>

              {/* Área de cámara — solo visible si el usuario la activó */}
              {cameraActive && (
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 500,
                    mx: 'auto',
                    aspectRatio: '4/3',
                    bgcolor: '#000',
                    borderRadius: 3,
                    overflow: 'hidden',
                    mb: 2,
                  }}
                >
                  <video
                    ref={videoRef}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: photoTaken ? 'none' : 'block' }}
                    playsInline
                    muted
                  />
                  <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: photoTaken ? 'block' : 'none' }}
                  />
                  {!photoTaken && (
                    <Box sx={{
                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      width: '65%', height: '65%', border: '3px dashed #4caf50', borderRadius: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Typography sx={{ color: '#4caf50', bgcolor: 'rgba(0,0,0,0.55)', px: 1.5, py: 0.5, borderRadius: 2, fontSize: '0.85rem' }}>
                        📦 Centra la caja aquí
                      </Typography>
                    </Box>
                  )}
                  {processingAI && (
                    <Box sx={{
                      position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.7)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CircularProgress size={50} sx={{ color: '#4caf50', mb: 1.5 }} />
                      <Typography color="white" variant="body2">Calculando medidas con IA...</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* Botones de cámara */}
              {cameraActive && (
                <Box sx={{ mb: 2, display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                  {!photoTaken ? (
                    <Button variant="contained" startIcon={<CameraIcon />} onClick={capturePhoto}
                      disabled={processingAI}
                      sx={{ bgcolor: DHL_RED, '&:hover': { bgcolor: '#a00410' } }}>
                      Tomar Foto
                    </Button>
                  ) : (
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => setPhotoTaken(false)}>
                      Volver a Tomar
                    </Button>
                  )}
                  <Button variant="text" size="small" onClick={() => {
                    setCameraActive(false);
                    setPhotoTaken(false);
                    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
                  }} sx={{ color: 'text.secondary' }}>
                    Cancelar cámara
                  </Button>
                </Box>
              )}

              {/* Campos manuales de medidas */}
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mb: 2 }}>
                {(['length', 'width', 'height'] as const).map((field, i) => (
                  <TextField
                    key={field}
                    label={['Largo', 'Ancho', 'Alto'][i]}
                    type="number"
                    value={dimensions[field] || ''}
                    onChange={(e) => handleManualDimensions(field, parseFloat(e.target.value) || 0)}
                    slotProps={{
                      input: { endAdornment: <InputAdornment position="end">cm</InputAdornment> },
                      htmlInput: { min: 0, step: 1 },
                    }}
                    sx={{ width: 115 }}
                  />
                ))}
              </Box>

              {/* Botón opcional: cámara + IA */}
              {!cameraActive && (
                <Button
                  variant="outlined"
                  startIcon={<CameraIcon />}
                  onClick={initCamera}
                  sx={{ mb: 2, borderColor: DHL_RED, color: DHL_RED, '&:hover': { bgcolor: '#fff5f5', borderColor: '#a00410' } }}
                >
                  Tomar medidas con fotografía
                </Button>
              )}

              {/* Espaciado para que el botón de guardar no quede tapado */}
              <Box sx={{ height: 16 }} />
            </Box>
          </Fade>
        );

      default:
        return null;
    }
  };

  return (
    <>
    <Dialog
      open={open}
      onClose={(_, reason) => {
        // 🔐 No permitir cerrar por backdrop o ESC si hay progreso
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
          handleCloseAttempt();
          return;
        }
      }}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 4, overflow: 'hidden' }
      }}
    >
      {/* Header — DHL brand: fondo amarillo, detalles en rojo */}
      <Box
        sx={{
          bgcolor: DHL_YELLOW,
          color: DHL_RED,
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `3px solid ${DHL_RED}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ScanIcon sx={{ fontSize: 32, color: DHL_RED }} />
          <Box>
            <Typography variant="h5" fontWeight="bold" sx={{ color: DHL_RED, lineHeight: 1.1 }}>
              Recepción Rápida DHL
            </Typography>
            {supervisorName && (
              <Typography variant="caption" sx={{ color: DHL_RED, opacity: 0.75 }}>
                Supervisado por: <strong>{supervisorName}</strong>
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton onClick={handleCloseAttempt} sx={{ color: DHL_RED }}>
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

      <DialogContent sx={{ minHeight: 360, pb: 1 }}>
        {/* Success Message */}
        {success && (
          <Slide direction="up" in={success}>
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CheckIcon sx={{ fontSize: 100, color: '#4caf50', mb: 2 }} />
              <Typography variant="h4" fontWeight="bold" color="#4caf50">
                ¡Paquete Guardado!
              </Typography>
              <Typography color="text.secondary" fontFamily="monospace" sx={{ mt: 1 }}>
                {tracking}
              </Typography>
              {tracking2 && (
                <Typography color="text.secondary" fontFamily="monospace" variant="body2">
                  {tracking2}
                </Typography>
              )}
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
      </DialogContent>

      {/* Botón Guardar — fuera de DialogContent para que no se tape con la barra */}
      {activeStep === 4 && !success && (
        <Box sx={{ px: 3, py: 1.5, borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="contained"
            size="large"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
            onClick={handleSubmit}
            disabled={loading}
            sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' }, px: 6, py: 1.2 }}
          >
            {loading ? 'Guardando...' : 'Guardar Paquete'}
          </Button>
        </Box>
      )}

      {/* Resumen de progreso — barra fija al fondo del dialog (no fixed/viewport) */}
      {activeStep > 0 && !success && (
        <Box
          sx={{
            bgcolor: '#111',
            color: 'white',
            px: 2,
            py: 1.5,
            display: 'flex',
            gap: 2.5,
            alignItems: 'center',
            flexWrap: 'wrap',
            borderTop: `2px solid ${DHL_YELLOW}`,
          }}
        >
          {clientInfo && (
            <Box>
              <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', lineHeight: 1 }}>Cliente</Typography>
              <Typography fontWeight="bold" sx={{ fontSize: '0.85rem' }}>📦 {clientInfo.box_id}</Typography>
            </Box>
          )}
          {tracking && (
            <Box>
              <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', lineHeight: 1 }}>Guía 1</Typography>
              <Typography fontFamily="monospace" fontWeight="bold" sx={{ fontSize: '0.72rem' }}>{tracking}</Typography>
              {tracking2 && (
                <Typography fontFamily="monospace" sx={{ fontSize: '0.68rem', color: 'grey.400' }}>{tracking2}</Typography>
              )}
            </Box>
          )}
          {productType && (
            <Box>
              <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', lineHeight: 1 }}>Tipo</Typography>
              <Typography fontWeight="bold" sx={{ fontSize: '0.85rem' }}>
                {productType === 'standard' ? '👕 Standard' : '⚙️ Específica'}
              </Typography>
            </Box>
          )}
          {weight > 0 && (
            <Box>
              <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', lineHeight: 1 }}>Peso</Typography>
              <Typography fontWeight="bold" sx={{ fontSize: '0.85rem' }}>{weight} kg</Typography>
            </Box>
          )}
        </Box>
      )}
    </Dialog>

    {/* 🔐 MODAL DE CONFIRMACIÓN DE CIERRE CON PIN */}
    <Dialog
      open={showCloseConfirm}
      onClose={() => setShowCloseConfirm(false)}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        Cancelar Recepción
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2">
            Has iniciado una recepción DHL. Para cancelar necesitas autorización de un supervisor.
          </Typography>
        </Alert>
        
        {closePinError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {closePinError}
          </Alert>
        )}
        
        <TextField
          fullWidth
          label="PIN de Supervisor"
          type="password"
          value={closePin}
          onChange={(e) => { setClosePin(e.target.value); setClosePinError(''); }}
          onKeyPress={(e) => e.key === 'Enter' && handleValidateClosePin()}
          disabled={validatingClosePin}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LockIcon color="action" />
              </InputAdornment>
            )
          }}
          sx={{
            '& input': { '-webkit-text-security': 'disc' }
          }}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setShowCloseConfirm(false)}>
          Continuar Recepción
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleValidateClosePin}
          disabled={validatingClosePin || !closePin.trim()}
          startIcon={validatingClosePin ? <CircularProgress size={20} /> : <LockIcon />}
        >
          {validatingClosePin ? 'Validando...' : 'Cancelar con PIN'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
