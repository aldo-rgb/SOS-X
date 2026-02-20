import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DrawIcon from '@mui/icons-material/Draw';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api from '../services/api';

interface DocumentoAbandono {
  id: number;
  cliente_nombre: string;
  cliente_email: string;
  guias_incluidas: Array<{ tracking: string; servicio: string; saldo: number }>;
  monto_total_condonado: number;
  fecha_generacion: string;
  estatus: string;
}

export default function FirmaAbandonoPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [documento, setDocumento] = useState<DocumentoAbandono | null>(null);
  const [error, setError] = useState('');
  const [firmado, setFirmado] = useState(false);
  const [firmando, setFirmando] = useState(false);
  
  // Canvas de firma
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    loadDocumento();
  }, [token]);

  const loadDocumento = async () => {
    try {
      const response = await api.get(`/firma-abandono/${token}`);
      setDocumento(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Documento no encontrado o ya no es válido');
    }
    setLoading(false);
  };

  // Funciones del canvas de firma
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    setHasSignature(true);
    
    const rect = canvas.getBoundingClientRect();
    let x: number, y: number;
    
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    let x: number, y: number;
    
    if ('touches' in e) {
      e.preventDefault();
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleFirmar = async () => {
    if (!hasSignature || !canvasRef.current) return;
    
    setFirmando(true);
    try {
      const firmaBase64 = canvasRef.current.toDataURL('image/png');
      
      await api.post(`/firma-abandono/${token}`, {
        firma_base64: firmaBase64,
      });
      
      setFirmado(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al firmar el documento');
    }
    setFirmando(false);
  };

  // Loading
  if (loading) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: '#f5f5f5'
      }}>
        <CircularProgress />
      </Box>
    );
  }

  // Error
  if (error && !documento) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: '#f5f5f5',
        p: 2
      }}>
        <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
          <WarningAmberIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Documento no disponible
          </Typography>
          <Typography color="text.secondary">
            {error}
          </Typography>
        </Paper>
      </Box>
    );
  }

  // Firmado exitosamente
  if (firmado) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: '#f5f5f5',
        p: 2
      }}>
        <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            ¡Documento Firmado!
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Has firmado exitosamente el documento de abandono de mercancía.
            La deuda de ${documento?.monto_total_condonado?.toLocaleString()} MXN ha sido condonada.
          </Typography>
          <Alert severity="info">
            Recibirás un correo de confirmación con el documento firmado.
          </Alert>
        </Paper>
      </Box>
    );
  }

  // Documento para firmar
  return (
    <Box sx={{ 
      minHeight: '100vh', 
      bgcolor: '#f5f5f5',
      py: 4,
      px: 2
    }}>
      <Paper sx={{ maxWidth: 800, mx: 'auto', p: { xs: 2, md: 4 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <img 
            src="/logo.png" 
            alt="EntregaX" 
            style={{ height: 50, marginBottom: 16 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Carta de Abandono de Mercancía
          </Typography>
          <Typography color="text.secondary">
            Documento generado el {documento && new Date(documento.fecha_generacion).toLocaleDateString()}
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Info del cliente */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Datos del Cliente:
          </Typography>
          <Typography>Nombre: {documento?.cliente_nombre}</Typography>
          <Typography>Email: {documento?.cliente_email}</Typography>
        </Box>

        {/* Contenido legal */}
        <Paper variant="outlined" sx={{ p: 3, mb: 3, bgcolor: '#fafafa' }}>
          <Typography variant="body2" paragraph sx={{ textAlign: 'justify' }}>
            Por medio de la presente, <strong>{documento?.cliente_nombre}</strong> declara expresamente
            su voluntad de ABANDONAR la(s) mercancía(s) detallada(s) a continuación, renunciando a
            cualquier derecho de propiedad, posesión o reclamación sobre la(s) misma(s).
          </Typography>
          <Typography variant="body2" paragraph sx={{ textAlign: 'justify' }}>
            El firmante reconoce que la mercancía ha permanecido en las instalaciones de EntregaX
            por un período mayor a 60 días sin que se haya efectuado el pago correspondiente ni
            se haya solicitado su retiro.
          </Typography>
          <Typography variant="body2" paragraph sx={{ textAlign: 'justify' }}>
            Al firmar este documento, el cliente acepta la CONDONACIÓN TOTAL de la deuda
            pendiente por concepto de envío, almacenaje y cualquier cargo relacionado,
            entendiendo que la mercancía pasará a ser propiedad de EntregaX para su disposición
            final (donación, reciclaje o destrucción según corresponda).
          </Typography>
        </Paper>

        {/* Tabla de guías */}
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Guías Incluidas:
        </Typography>
        <Table size="small" sx={{ mb: 3 }}>
          <TableHead>
            <TableRow>
              <TableCell>Tracking</TableCell>
              <TableCell>Servicio</TableCell>
              <TableCell align="right">Saldo Condonado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {documento?.guias_incluidas.map((guia, idx) => (
              <TableRow key={idx}>
                <TableCell>{guia.tracking}</TableCell>
                <TableCell>{guia.servicio.toUpperCase()}</TableCell>
                <TableCell align="right">${Number(guia.saldo).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={2}>
                <Typography fontWeight={700}>TOTAL CONDONADO:</Typography>
              </TableCell>
              <TableCell align="right">
                <Typography fontWeight={700} color="success.main">
                  ${documento?.monto_total_condonado?.toLocaleString()} MXN
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Divider sx={{ my: 3 }} />

        {/* Área de firma */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            <DrawIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Firma Digital:
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Dibuja tu firma en el recuadro de abajo usando el mouse o tu dedo (en dispositivos táctiles)
          </Typography>
          
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 1, 
              bgcolor: 'white',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            <canvas
              ref={canvasRef}
              width={400}
              height={150}
              style={{
                border: '1px dashed #ccc',
                borderRadius: 4,
                touchAction: 'none',
                maxWidth: '100%',
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            <Button 
              size="small" 
              onClick={clearSignature}
              sx={{ mt: 1 }}
            >
              Limpiar firma
            </Button>
          </Paper>
        </Box>

        {/* Botón de firma */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={!hasSignature || firmando}
          onClick={handleFirmar}
          sx={{ py: 2 }}
        >
          {firmando ? <CircularProgress size={24} /> : 'Firmar y Aceptar Abandono'}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
          Al firmar este documento, aceptas los términos descritos anteriormente y
          confirmas que la información proporcionada es verídica.
        </Typography>
      </Paper>
    </Box>
  );
}
