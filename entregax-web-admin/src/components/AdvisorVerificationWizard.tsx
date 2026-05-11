// ============================================
// AdvisorVerificationWizard
// Wizard de verificación + términos para asesores desde la web.
// 6 pasos internos: INE Frente, INE Reverso, Selfie, Constancia Fiscal,
// Aviso de Privacidad/Contrato Asesor (con scroll-to-bottom), Firma Digital.
//
// Al finalizar dispara DOS llamadas:
//   POST /verify/documents               (INE+selfie+CSF+signature)
//   POST /api/hr/accept-advisor-privacy  (signature → privacy_signature_url)
// ============================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Badge as BadgeIcon,
  CameraAlt as CameraIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Description as DescriptionIcon,
  Draw as DrawIcon,
  Image as ImageIcon,
  Receipt as ReceiptIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
import api from '../services/api';

const ORANGE = '#F05A28';

type Slot = 'ineFront' | 'ineBack' | 'selfie';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

// Texto fallback del Contrato/Aviso (si no responde el endpoint de legal-documents).
const FALLBACK_TERMS = `AVISO DE PRIVACIDAD Y CONTRATO DE ASESOR COMERCIAL

LOGISTI-K SYSTEMS DEVELOPMENT S.A. DE C.V. (LSD) y EL ASESOR convienen en celebrar el presente contrato de prestación de servicios profesionales bajo los siguientes términos:

1. OBJETO. EL ASESOR se compromete a referir clientes a LSD para los servicios de logística y paquetería internacional, percibiendo una comisión sobre los servicios efectivamente facturados y cobrados a esos clientes.

2. PROTECCIÓN DE DATOS PERSONALES. EL ASESOR autoriza a LSD a tratar sus datos personales (incluyendo identificación oficial, RFC, firma autógrafa digitalizada y datos de contacto) con la finalidad de validar su identidad, dar de alta sus comisiones y cumplir obligaciones fiscales aplicables, en términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP). El ASESOR podrá ejercer sus derechos ARCO escribiendo a privacidad@entregax.com.

3. COMISIONES. Las comisiones se calcularán sobre los importes efectivamente cobrados por LSD y se pagarán mensualmente, siempre que EL ASESOR haya emitido el CFDI correspondiente con base en su Constancia de Situación Fiscal vigente.

4. CONFIDENCIALIDAD. EL ASESOR se obliga a mantener absoluta confidencialidad de la información comercial, cartera de clientes y tarifas a las que tenga acceso durante la vigencia de la relación y por 3 años posteriores a su terminación.

5. INDEPENDENCIA. No existe relación laboral entre EL ASESOR y LSD. EL ASESOR es responsable directo del entero de sus contribuciones fiscales.

6. FIRMA ELECTRÓNICA. Las Partes manifiestan su consentimiento para el uso de la firma electrónica que se incorpore al presente documento, otorgándole el mismo valor que a la firma autógrafa, en términos del artículo 89 del Código de Comercio.

7. JURISDICCIÓN. Para la interpretación y cumplimiento del presente Contrato las Partes se someten a la jurisdicción de los tribunales de Monterrey, Nuevo León, renunciando a cualquier otro fuero.`;

export default function AdvisorVerificationWizard({ open, onClose, onComplete }: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [step, setStep] = useState(0);
  const [images, setImages] = useState<{ [k in Slot]?: string }>({});
  const [csf, setCsf] = useState<{ name: string; data: string; mime: string } | null>(null);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [serviceContract, setServiceContract] = useState<string>(FALLBACK_TERMS);

  // Camera preview
  const [showCamera, setShowCamera] = useState(false);
  const [cameraSlot, setCameraSlot] = useState<Slot>('ineFront');
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  // ─── Cargar contrato desde backend (si existe) ───
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await api.get('/legal-documents/service_contract');
        const content = (res as { data?: { document?: { content?: string } } })?.data?.document?.content;
        if (content) setServiceContract(content);
      } catch {
        /* fallback */
      }
    })();
  }, [open]);

  // ─── Reset al abrir ───
  useEffect(() => {
    if (open) {
      setStep(0);
      setImages({});
      setCsf(null);
      setTermsScrolled(false);
      setTermsAccepted(false);
      setSignature(null);
      setHasDrawn(false);
      setErrorMsg(null);
    } else {
      // Detener cámara si quedó abierta
      if (videoStream) {
        videoStream.getTracks().forEach((t) => t.stop());
        setVideoStream(null);
      }
      setShowCamera(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Inicializar canvas de firma cuando entras al paso de firma ───
  const initSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  }, []);

  useEffect(() => {
    if (open && step === 5 && !signature) {
      const t = setTimeout(initSignatureCanvas, 100);
      return () => clearTimeout(t);
    }
  }, [open, step, signature, initSignatureCanvas]);

  const drawAt = (clientX: number, clientY: number, moveOnly = false) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (moveOnly) {
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasDrawn(true);
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const clearCanvas = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    setSignature(null);
  };

  const saveSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    setSignature(canvas.toDataURL('image/png'));
  };

  // ─── Cámara ───
  const openCamera = async (slot: Slot) => {
    setCameraSlot(slot);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: slot === 'selfie' ? 'user' : 'environment' },
      });
      setVideoStream(stream);
      setShowCamera(true);
    } catch {
      setErrorMsg('No se pudo acceder a la cámara. Puedes subir la imagen desde archivo.');
    }
  };

  const takePhoto = () => {
    const video = document.getElementById('advisor-cam-preview') as HTMLVideoElement | null;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setImages((p) => ({ ...p, [cameraSlot]: dataUrl }));
    if (videoStream) videoStream.getTracks().forEach((t) => t.stop());
    setVideoStream(null);
    setShowCamera(false);
  };

  const closeCamera = () => {
    if (videoStream) videoStream.getTracks().forEach((t) => t.stop());
    setVideoStream(null);
    setShowCamera(false);
  };

  const onImageFile = (slot: Slot, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImages((p) => ({ ...p, [slot]: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const onCsfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = (ev.target?.result as string) || '';
      setCsf({ name: file.name, data, mime: file.type || 'application/octet-stream' });
    };
    reader.readAsDataURL(file);
  };

  // ─── Validación por paso ───
  const stepReady = useMemo(() => {
    switch (step) {
      case 0:
        return !!images.ineFront;
      case 1:
        return !!images.ineBack;
      case 2:
        return !!images.selfie;
      case 3:
        return !!csf;
      case 4:
        return termsScrolled && termsAccepted;
      case 5:
        return !!signature;
      default:
        return false;
    }
  }, [step, images, csf, termsScrolled, termsAccepted, signature]);

  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) setTermsScrolled(true);
  };

  // ─── Submit final ───
  const handleSubmit = async () => {
    if (!signature || !images.ineFront || !images.ineBack || !images.selfie || !csf) {
      setErrorMsg('Faltan documentos por subir.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      // 1) Verificación de identidad + CSF
      await api.post('/verify/documents', {
        ineFrontBase64: images.ineFront,
        ineBackBase64: images.ineBack,
        selfieBase64: images.selfie,
        signatureBase64: signature,
        constanciaFiscalBase64: csf.data,
      });

      // 2) Aceptación de aviso de privacidad + contrato de asesor (con firma)
      await api.post('/hr/accept-advisor-privacy', { signature });

      onComplete();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      const msg = e?.response?.data?.error || e?.response?.data?.message || 'No se pudo completar la verificación. Intenta de nuevo.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const STEP_LABELS = ['INE Frente', 'INE Reverso', 'Selfie', 'Constancia', 'Términos', 'Firma'];

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={isMobile}
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
    >
      <DialogTitle sx={{ bgcolor: '#0A2540', color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
        <BadgeIcon />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          Verificación de Asesor
        </Typography>
        <Typography variant="caption">Paso {step + 1} de {STEP_LABELS.length}</Typography>
        {!submitting && (
          <IconButton size="small" onClick={onClose} sx={{ color: '#fff' }}>
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {/* Stepper */}
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Stepper activeStep={step} alternativeLabel sx={{ '& .MuiStepLabel-label': { fontSize: isMobile ? '0.65rem' : '0.75rem' } }}>
            {STEP_LABELS.map((label, idx) => (
              <Step key={label} completed={idx < step}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Cámara overlay */}
        {showCamera && videoStream && (
          <Box sx={{ p: 2, textAlign: 'center', bgcolor: '#000' }}>
            <video
              id="advisor-cam-preview"
              autoPlay
              playsInline
              muted
              ref={(v) => {
                if (v && videoStream) v.srcObject = videoStream;
              }}
              style={{
                width: '100%',
                maxHeight: 360,
                borderRadius: 12,
                objectFit: 'cover',
                transform: cameraSlot === 'selfie' ? 'scaleX(-1)' : 'none',
              }}
            />
            <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
              <Button variant="outlined" onClick={closeCamera} sx={{ color: '#fff', borderColor: '#fff' }}>
                Cancelar
              </Button>
              <Button variant="contained" startIcon={<CameraIcon />} onClick={takePhoto} sx={{ bgcolor: ORANGE }}>
                Tomar Foto
              </Button>
            </Stack>
          </Box>
        )}

        {!showCamera && (
          <Box sx={{ p: 3 }}>
            {/* Paso 0-2: Fotos */}
            {step <= 2 && (() => {
              const slotMap: Slot[] = ['ineFront', 'ineBack', 'selfie'];
              const slot = slotMap[step];
              const titleMap: Record<Slot, string> = { ineFront: 'ID Oficial (Frente)', ineBack: 'ID Oficial (Reverso)', selfie: 'Selfie' };
              const descMap: Record<Slot, string> = {
                ineFront: 'Toma una foto clara del frente de tu INE/pasaporte.',
                ineBack: 'Toma una foto clara del reverso de tu identificación oficial.',
                selfie: 'Toma una selfie mirando directamente a la cámara.',
              };
              const current = images[slot];
              return (
                <Box sx={{ textAlign: 'center' }}>
                  {slot === 'selfie' ? <CameraIcon sx={{ fontSize: 56, color: '#0A2540', mb: 1 }} /> : <BadgeIcon sx={{ fontSize: 56, color: '#0A2540', mb: 1 }} />}
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{titleMap[slot]}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{descMap[slot]}</Typography>
                  {current ? (
                    <Box>
                      <img src={current} alt={titleMap[slot]} style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} />
                      <Box sx={{ mt: 1 }}>
                        <Button size="small" onClick={() => setImages((p) => ({ ...p, [slot]: undefined }))}>Cambiar foto</Button>
                      </Box>
                    </Box>
                  ) : (
                    <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap">
                      <Button variant="contained" startIcon={<CameraIcon />} onClick={() => openCamera(slot)} sx={{ bgcolor: '#0A2540' }}>
                        Tomar Foto
                      </Button>
                      <Button variant="outlined" startIcon={<ImageIcon />} component="label">
                        Subir Archivo
                        <input type="file" accept="image/*" hidden onChange={(e) => onImageFile(slot, e)} />
                      </Button>
                    </Stack>
                  )}
                </Box>
              );
            })()}

            {/* Paso 3: Constancia Fiscal */}
            {step === 3 && (
              <Box sx={{ textAlign: 'center' }}>
                <ReceiptIcon sx={{ fontSize: 56, color: '#0A2540', mb: 1 }} />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Constancia de Situación Fiscal</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Sube tu Constancia de Situación Fiscal vigente (PDF o imagen). Es obligatoria para poder generar tus CFDI y cobrar comisiones.
                </Typography>
                <Box sx={{ bgcolor: '#fef3c7', borderLeft: '4px solid #f59e0b', p: 1.5, borderRadius: 1, mb: 2, textAlign: 'left' }}>
                  <Typography variant="caption" sx={{ color: '#92400e' }}>
                    Puedes descargarla desde el portal del SAT con tu RFC y contraseña/e.firma.
                  </Typography>
                </Box>
                {csf ? (
                  <Box sx={{ p: 2, border: '2px solid #16a34a', borderRadius: 2, bgcolor: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <DescriptionIcon sx={{ color: '#16a34a' }} />
                    <Box sx={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{csf.name}</Typography>
                      <Typography variant="caption" color="text.secondary">Listo para enviar</Typography>
                    </Box>
                    <Button size="small" color="error" onClick={() => setCsf(null)}>Quitar</Button>
                  </Box>
                ) : (
                  <Button variant="contained" startIcon={<UploadFileIcon />} component="label" sx={{ bgcolor: '#0A2540' }}>
                    Subir Constancia (PDF o imagen)
                    <input type="file" accept="application/pdf,image/*" hidden onChange={onCsfFile} />
                  </Button>
                )}
              </Box>
            )}

            {/* Paso 4: Términos */}
            {step === 4 && (
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, textAlign: 'center' }}>
                  Aviso de Privacidad y Contrato de Asesor
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                  Lee el documento completo. Llega al final para poder aceptar.
                </Typography>
                <Box
                  onScroll={handleTermsScroll}
                  sx={{
                    maxHeight: 280,
                    overflow: 'auto',
                    p: 2,
                    bgcolor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                    fontSize: '0.85rem',
                    lineHeight: 1.6,
                    mb: 2,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {serviceContract}
                </Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      disabled={!termsScrolled}
                      sx={{ color: ORANGE, '&.Mui-checked': { color: ORANGE } }}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ color: termsScrolled ? '#111' : '#999' }}>
                      He leído y acepto el Aviso de Privacidad y el Contrato de Asesor
                      {!termsScrolled && ' (desplázate hasta el final)'}
                    </Typography>
                  }
                />
              </Box>
            )}

            {/* Paso 5: Firma */}
            {step === 5 && (
              <Box sx={{ textAlign: 'center' }}>
                <DrawIcon sx={{ fontSize: 48, color: '#0A2540', mb: 1 }} />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Firma Digital</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Dibuja tu firma con el mouse o tu dedo. Esta firma se aplicará al contrato.
                </Typography>
                {signature ? (
                  <Box>
                    <Box sx={{ border: '2px solid #16a34a', borderRadius: 2, p: 1, bgcolor: '#f0fdf4', mb: 1 }}>
                      <img src={signature} alt="Firma" style={{ maxWidth: '100%', maxHeight: 140, display: 'block', margin: '0 auto' }} />
                    </Box>
                    <Button size="small" color="error" onClick={clearCanvas}>Borrar y firmar de nuevo</Button>
                  </Box>
                ) : (
                  <Box>
                    <Box
                      sx={{
                        border: '2px solid #0A2540',
                        borderRadius: 2,
                        overflow: 'hidden',
                        bgcolor: '#fff',
                        touchAction: 'none',
                        cursor: 'crosshair',
                        position: 'relative',
                        mb: 1,
                      }}
                    >
                      <canvas
                        ref={signatureCanvasRef}
                        style={{ width: '100%', height: 180, display: 'block', touchAction: 'none' }}
                        onMouseDown={(e) => { drawingRef.current = true; drawAt(e.clientX, e.clientY); }}
                        onMouseMove={(e) => { if (drawingRef.current) drawAt(e.clientX, e.clientY, true); }}
                        onMouseUp={() => { drawingRef.current = false; }}
                        onMouseLeave={() => { drawingRef.current = false; }}
                        onTouchStart={(e) => { e.preventDefault(); drawingRef.current = true; const t = e.touches[0]; drawAt(t.clientX, t.clientY); }}
                        onTouchMove={(e) => { e.preventDefault(); if (!drawingRef.current) return; const t = e.touches[0]; drawAt(t.clientX, t.clientY, true); }}
                        onTouchEnd={(e) => { e.preventDefault(); drawingRef.current = false; }}
                      />
                      {!hasDrawn && (
                        <Typography variant="body2" sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#bbb', pointerEvents: 'none' }}>
                          ✍️ Firma aquí
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ mb: 1 }}>
                      <Button size="small" variant="contained" disabled={!hasDrawn} onClick={saveSignature} sx={{ bgcolor: '#16a34a' }}>
                        Guardar Firma
                      </Button>
                      <Button size="small" variant="outlined" disabled={!hasDrawn} onClick={clearCanvas}>
                        Limpiar
                      </Button>
                    </Stack>
                  </Box>
                )}
              </Box>
            )}

            {errorMsg && (
              <Box sx={{ mt: 2, bgcolor: '#fee2e2', border: '1px solid #fecaca', p: 1.5, borderRadius: 1 }}>
                <Typography variant="body2" sx={{ color: '#991b1b' }}>{errorMsg}</Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ color: '#555' }}>Cancelar</Button>
        <Box sx={{ flex: 1 }} />
        {step > 0 && !showCamera && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={submitting} sx={{ color: '#0A2540' }}>
            Anterior
          </Button>
        )}
        {step < 5 ? (
          <Button
            variant="contained"
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepReady || showCamera}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d44a1f' } }}
          >
            Siguiente
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!stepReady || submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
            sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}
          >
            {submitting ? 'Enviando…' : 'Completar verificación'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
