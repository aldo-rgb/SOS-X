import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { Box, Paper, Typography, Stack, Button, Chip, CircularProgress } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';
import RefreshIcon from '@mui/icons-material/Refresh';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';

interface Staff { id: number; full_name: string; role: string }

/**
 * Tab "Simulador de bonos": embebe el simulador (propuesta del esquema para
 * personal operativo) y le inyecta el PERSONAL REAL por postMessage, igual que
 * hace el simulador de comisiones con los asesores.
 *
 * Es informativo y está aislado a propósito: no lee ni escribe metas, comisiones
 * ni pagos. Lo único que consulta es quién trabaja aquí y en qué puesto, porque
 * sin eso un bono por persona no dice nada — $1,200 son $1,200 o son $7,200
 * según si el puesto tiene una persona o seis.
 */
export default function SimuladorBonosPanel() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const dataRef = useRef<Staff[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const pushToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !dataRef.current) return;
    win.postMessage({ type: 'ENTREGAX_BONOS_STAFF', staff: dataRef.current }, '*');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/admin/bonos/staff`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const staff: Staff[] = res.data?.staff || [];
      dataRef.current = staff;
      setCount(staff.length);
      pushToIframe();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar el personal. El simulador queda vacío.');
    } finally {
      setLoading(false);
    }
  }, [pushToIframe]);

  useEffect(() => { load(); }, [load]);

  // El iframe avisa READY al terminar de cargar; ahí le inyectamos el personal.
  // Sin esto, si el fetch termina antes que el iframe, los datos se pierden.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if ((ev.data || {}).type === 'ENTREGAX_BONOS_READY') pushToIframe();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [pushToIframe]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ScienceIcon sx={{ color: '#F05A28' }} />
          <Box>
            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.2 }}>
              Simulador de bonos · personal operativo
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Propuesta. Nada de lo que muevas aquí toca metas, comisiones ni pagos reales.
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          {loading ? <CircularProgress size={18} />
            : <Chip size="small" variant="outlined" label={`${count} personas`} />}
          <Button size="small" startIcon={<RefreshIcon />} onClick={load}>Actualizar</Button>
        </Stack>
      </Stack>

      {error && (
        <Typography variant="caption" sx={{ color: '#B45309', display: 'block', mb: 1 }}>{error}</Typography>
      )}

      <Paper sx={{ borderRadius: 2, overflow: 'hidden', p: 0 }}>
        <iframe
          ref={iframeRef}
          title="Simulador de bonos"
          src="/simulador-bonos.html?v=20260905a"
          onLoad={pushToIframe}
          style={{ width: '100%', height: 'calc(100vh - 260px)', minHeight: 700, border: 'none', display: 'block' }}
        />
      </Paper>
    </Box>
  );
}
