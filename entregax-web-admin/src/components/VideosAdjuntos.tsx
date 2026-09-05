/**
 * Videos de un ticket o una tarea: subirlos y verlos.
 *
 * Dos cosas que se ven raras hasta que se sabe por qué:
 *
 * 1. El archivo NO pasa por la API. Se pide una URL firmada, el navegador lo
 *    sube directo a S3 y luego se avisa. Un video de celular pesa 60-90MB y
 *    mandarlo por la API lo cargaba entero en memoria del servidor.
 *
 * 2. Debajo de cada video hay una tira de cuadros. No es decoración: es lo que
 *    hace legible el video. Nadie —ni Cajito— puede ver un MP4, y a los 30
 *    días el video se borra y los cuadros se quedan. Esa tira es la evidencia
 *    que sobrevive.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, IconButton, LinearProgress,
  Tooltip, Typography, Dialog, DialogContent,
} from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import CloseIcon from '@mui/icons-material/Close';
import api from '../services/api';

const MAX_MB = 200;

type Cuadro = { segundo: number; url: string | null };
type Video = {
  id: number; key: string; file_name: string; url: string | null; purgado: boolean;
  size_bytes: number | null; duracion: number | null; cuadros: Cuadro[];
  frames_status: string; frames_error?: string | null;
  subio: string | null; created_at: string; dias_restantes: number;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const mb = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(1)} MB` : '');

export default function VideosAdjuntos({ scope, refId, puedeSubir = true }: {
  scope: 'ticket' | 'task'; refId: number; puedeSubir?: boolean;
}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [avance, setAvance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lupa, setLupa] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Mientras haya cuadros saliendo se vuelve a preguntar; en cuanto terminan
  // se deja de molestar al servidor.
  const reintento = useRef<any>(null);

  const cargar = useCallback(async () => {
    if (!refId) return;
    setCargando(true);
    try {
      const r = await api.get('/uploads/videos', { params: { scope, ref_id: refId } });
      const lista: Video[] = r.data?.videos || [];
      setVideos(lista);
      if (reintento.current) { clearTimeout(reintento.current); reintento.current = null; }
      if (lista.some(v => v.frames_status === 'pendiente')) {
        reintento.current = setTimeout(() => { cargar(); }, 6000);
      }
    } catch { /* si falla, la sección simplemente no muestra videos */ }
    finally { setCargando(false); }
  }, [scope, refId]);

  useEffect(() => { cargar(); return () => { if (reintento.current) clearTimeout(reintento.current); }; }, [cargar]);

  const subir = async (f: File | null | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`El video pesa ${(f.size / 1024 / 1024).toFixed(0)} MB y el máximo son ${MAX_MB} MB. Recórtalo y vuelve a subirlo.`);
      return;
    }
    setSubiendo(true); setAvance(0);
    try {
      const pre = await api.post('/uploads/video-url', {
        scope, ref_id: refId, file_name: f.name, mime: f.type || 'video/mp4', size: f.size,
      });
      const { uploadUrl, key, contentType } = pre.data || {};
      if (!uploadUrl) throw new Error('No se pudo preparar la subida');

      // PUT directo a S3, con barra de avance real. Sin el token de la API:
      // la URL firmada ya trae el permiso, y mandarlo sería filtrarlo a S3.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', contentType || f.type || 'video/mp4');
        xhr.upload.onprogress = e => { if (e.lengthComputable) setAvance(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 respondió ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Se cortó la subida'));
        xhr.send(f);
      });

      await api.post('/uploads/video-registrar', {
        scope, ref_id: refId, key, file_name: f.name, mime: f.type || 'video/mp4',
      });
      await cargar();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'No se pudo subir el video');
    } finally {
      setSubiendo(false); setAvance(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!puedeSubir && videos.length === 0 && !cargando) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <VideocamIcon sx={{ fontSize: 18, color: '#6D28D9' }} />
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#4C1D95' }}>
          Videos {videos.length > 0 && `(${videos.length})`}
        </Typography>
        {puedeSubir && (
          <>
            <input hidden ref={fileRef} type="file" accept="video/*"
                   onChange={e => subir(e.target.files?.[0])} />
            <Button size="small" disabled={subiendo}
                    onClick={() => fileRef.current?.click()}
                    sx={{ ml: 'auto', textTransform: 'none', color: '#6D28D9' }}>
              {subiendo ? `Subiendo ${avance}%` : 'Subir video'}
            </Button>
          </>
        )}
      </Box>

      {subiendo && <LinearProgress variant="determinate" value={avance} sx={{ mb: 1, borderRadius: 1 }} />}
      {error && (
        <Typography sx={{ fontSize: 12, color: '#B91C1C', mb: 1 }}>{error}</Typography>
      )}
      {videos.length === 0 && !cargando && puedeSubir && (
        <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
          Hasta {MAX_MB} MB. Se guardan 30 días; los cuadros que se le sacan se quedan para siempre.
        </Typography>
      )}

      {videos.map(v => (
        <Box key={v.id} sx={{ mb: 2, p: 1.5, border: '1px solid #E5E7EB', borderRadius: 2, bgcolor: '#FAFAFA' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{v.file_name}</Typography>
            {v.duracion != null && <Chip size="small" label={mmss(v.duracion)} sx={{ height: 20, fontSize: 11 }} />}
            {v.size_bytes != null && !v.purgado && (
              <Typography sx={{ fontSize: 11, color: '#6B7280' }}>{mb(v.size_bytes)}</Typography>
            )}
            {v.subio && <Typography sx={{ fontSize: 11, color: '#6B7280' }}>· subió {v.subio}</Typography>}
            <Box sx={{ ml: 'auto' }}>
              {v.purgado ? (
                <Chip size="small" label="Video depurado · quedan los cuadros"
                      sx={{ height: 20, fontSize: 10, bgcolor: '#F3F4F6', color: '#6B7280' }} />
              ) : (
                <Tooltip title="A los 30 días se borra el video para no pagar almacenamiento. Los cuadros se conservan.">
                  <Chip size="small" label={`Se borra en ${v.dias_restantes} d`}
                        sx={{ height: 20, fontSize: 10, bgcolor: '#FEF3C7', color: '#92400E' }} />
                </Tooltip>
              )}
            </Box>
          </Box>

          {v.url ? (
            <Box component="video" src={v.url} controls preload="metadata"
                 sx={{ width: '100%', maxHeight: 320, borderRadius: 1.5, bgcolor: '#000' }} />
          ) : (
            <Typography sx={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', py: 1 }}>
              El video ya se depuró. Abajo están los cuadros que se le sacaron.
            </Typography>
          )}

          {v.frames_status === 'pendiente' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <CircularProgress size={14} />
              <Typography sx={{ fontSize: 11, color: '#6B7280' }}>Sacando los cuadros…</Typography>
            </Box>
          )}
          {v.frames_status === 'fallo' && (
            <Typography sx={{ fontSize: 11, color: '#B45309', mt: 1 }}>
              No se le pudieron sacar cuadros{v.frames_error ? ` (${v.frames_error})` : ''}. El video se ve igual.
            </Typography>
          )}
          {v.cuadros.length > 0 && (
            <>
              <Typography sx={{ fontSize: 11, color: '#6B7280', mt: 1, mb: 0.5 }}>
                {v.cuadros.length} cuadros — esto es lo que puede leer Cajito, y lo que queda cuando el video se borra.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
                {v.cuadros.map((c, i) => c.url && (
                  <Box key={i} sx={{ flex: '0 0 auto', textAlign: 'center' }}>
                    <Box component="img" src={c.url} alt={`cuadro ${mmss(c.segundo)}`}
                         onClick={() => setLupa(c.url)}
                         sx={{ width: 110, height: 72, objectFit: 'cover', borderRadius: 1,
                               border: '1px solid #E5E7EB', cursor: 'zoom-in' }} />
                    <Typography sx={{ fontSize: 10, color: '#6B7280' }}>{mmss(c.segundo)}</Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>
      ))}

      <Dialog open={!!lupa} onClose={() => setLupa(null)} maxWidth="lg">
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <IconButton onClick={() => setLupa(null)}
                      sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,.5)', color: '#fff' }}>
            <CloseIcon />
          </IconButton>
          {lupa && <Box component="img" src={lupa} sx={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh' }} />}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
