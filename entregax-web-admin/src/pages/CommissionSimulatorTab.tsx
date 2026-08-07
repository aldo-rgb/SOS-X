import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { Box, Paper, Typography, Chip, CircularProgress, Button, Stack } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';
const ORANGE = '#F05A28';

interface SimAdvisor {
  id: number;
  name: string;
  override_actual: number;
  sub_count: number;
  servicios: Record<string, { ventas: number; comision: number; guias: number }>;
}

/**
 * Tab "Simulador": embebe el simulador de comisiones (propuesta del nuevo esquema)
 * y le inyecta datos VIVOS por servicio/asesor desde el backend. Es informativo:
 * sirve para explicar a los asesores cómo funcionará el esquema antes de que entre
 * en vigor, y va "sumando lo que sigue en ventas" cada vez que se refresca.
 */
export default function CommissionSimulatorTab() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string>('');
  const [count, setCount] = useState<number>(0);
  const dataRef = useRef<{ advisors: SimAdvisor[]; asOfLabel: string } | null>(null);

  const pushToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !dataRef.current) return;
    win.postMessage({ type: 'ENTREGAX_SIM_DATA', ...dataRef.current }, '*');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/admin/commissions/simulator-data`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const advisors: SimAdvisor[] = res.data?.advisors || [];
      const iso: string = res.data?.asOf || new Date().toISOString();
      const label = `Datos en vivo · al ${new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}`;
      setAsOf(new Date(iso).toLocaleString('es-MX'));
      setCount(advisors.length);
      dataRef.current = { advisors, asOfLabel: label };
      // Si el iframe ya está listo, empujar ahora; si no, el handler READY lo hará.
      pushToIframe();
    } catch (e: any) {
      console.error('Error cargando datos del simulador:', e);
      setError(e?.response?.data?.error || 'No se pudieron cargar los datos en vivo. El simulador muestra la foto de referencia.');
    } finally {
      setLoading(false);
    }
  }, [pushToIframe]);

  // El iframe avisa READY cuando terminó de cargar; ahí le inyectamos los datos.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev?.data?.type === 'ENTREGAX_SIM_READY') pushToIframe();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pushToIframe]);

  useEffect(() => { load(); }, [load]);

  return (
    <Box>
      {/* Encabezado explicativo */}
      <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2, borderLeft: `4px solid ${ORANGE}` }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <ScienceIcon sx={{ color: ORANGE, mt: 0.3 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              Simulador del nuevo esquema de comisiones
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Es una <strong>propuesta informativa</strong>, aún <strong>no está en vigor</strong>. Calcula, sobre las
              ventas reales de cada asesor, cuánto ganaría con el nuevo modelo: comisión base por servicio + acelerador,
              bonos de volumen/attach/combo y el <strong>gate de venta cruzada</strong>. Úsalo para explicar los procesos
              de comisión desde ahora; el esquema entra en vigor en unos meses para que nadie salga afectado en la
              primera etapa.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              {loading && <Chip size="small" icon={<CircularProgress size={12} sx={{ ml: 0.5 }} />} label="Cargando datos en vivo…" />}
              {!loading && !error && (
                <Chip size="small" color="success" variant="outlined"
                  label={`Datos en vivo · ${count} asesores · ${asOf}`} />
              )}
              {error && <Chip size="small" color="warning" variant="outlined" label={error} />}
              <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
                Actualizar ventas
              </Button>
              <Button size="small" startIcon={<OpenInNewIcon />}
                onClick={() => window.open('/simulador-comisiones.html?v=20260807b', '_blank')}>
                Abrir en pestaña
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      {/* El simulador embebido (self-contained, recibe datos vía postMessage) */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden', p: 0 }}>
        <iframe
          ref={iframeRef}
          title="Simulador de comisiones"
          src="/simulador-comisiones.html?v=20260807b"
          onLoad={pushToIframe}
          style={{ width: '100%', height: 'calc(100vh - 240px)', minHeight: 680, border: 'none', display: 'block' }}
        />
      </Paper>
    </Box>
  );
}
