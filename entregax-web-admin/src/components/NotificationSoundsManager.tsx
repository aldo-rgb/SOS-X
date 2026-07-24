import { useState, useEffect, useRef } from 'react';
import {
  Card, CardContent, Box, Typography, Chip, Alert, Stack, Switch,
  FormControl, Select, MenuItem, IconButton, Button, CircularProgress, Divider, Tooltip,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';

interface NotifType {
  key: string; label: string; description: string; group: string;
  soundKey: string; enabled: boolean; customSoundUrl: string | null; customSoundFilename: string | null;
}

export default function NotificationSoundsManager() {
  const [types, setTypes] = useState<NotifType[]>([]);
  const [bundled, setBundled] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // key en proceso
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/notification-sounds`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) { setTypes(data.types || []); setBundled(data.bundledSounds || []); }
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const patch = (key: string, fields: Partial<NotifType>) =>
    setTypes(prev => prev.map(t => t.key === key ? { ...t, ...fields } : t));

  const toggleEnabled = async (t: NotifType) => {
    const next = !t.enabled;
    patch(t.key, { enabled: next });
    try {
      await fetch(`${API_URL}/admin/notification-sounds/${t.key}/enabled`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ enabled: next }),
      });
    } catch { patch(t.key, { enabled: !next }); }
  };

  const changeSound = async (t: NotifType, soundKey: string) => {
    patch(t.key, { soundKey });
    try {
      await fetch(`${API_URL}/admin/notification-sounds/${t.key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ soundKey }),
      });
    } catch { /* ignore */ }
  };

  const uploadMp3 = async (t: NotifType, file: File) => {
    setBusy(t.key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_URL}/admin/notification-sounds/${t.key}/custom`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
      });
      const data = await res.json();
      if (data.success) patch(t.key, { customSoundUrl: data.customSoundUrl, customSoundFilename: data.customSoundFilename });
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  const removeMp3 = async (t: NotifType) => {
    setBusy(t.key);
    try {
      await fetch(`${API_URL}/admin/notification-sounds/${t.key}/custom`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      patch(t.key, { customSoundUrl: null, customSoundFilename: null });
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  const playPreview = (url: string | null) => {
    if (!url) return;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    audioRef.current.play().catch(() => {});
  };

  const groups = Array.from(new Set(types.map(t => t.group)));

  return (
    <Card elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <NotificationsActiveIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="h6" fontWeight={600}>Sonidos de Notificaciones</Typography>
          <Chip label="Super Admin" size="small" color="warning" sx={{ ml: 1 }} />
        </Box>
        <Alert severity="info" sx={{ mb: 2 }}>
          Para cada notificación push puedes <strong>prenderla/apagarla</strong>, elegir su <strong>tono</strong> y
          subir un <strong>MP3</strong>. El MP3 suena de inmediato con la <strong>app abierta / web</strong>; para el
          <strong> segundo plano</strong> (app cerrada) el sistema usa el tono empaquetado y los MP3 nuevos requieren un build de la app.
        </Alert>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <Stack spacing={0.5}>
            {groups.map(group => (
              <Box key={group}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1.5, fontWeight: 700 }}>{group}</Typography>
                {types.filter(t => t.group === group).map((t, idx) => (
                  <Box key={t.key}>
                    {idx > 0 && <Divider />}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, flexWrap: 'wrap', opacity: t.enabled ? 1 : 0.55 }}>
                      <Box sx={{ flex: 1, minWidth: 220 }}>
                        <Typography variant="body2" fontWeight={700}>{t.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{t.description}</Typography>
                      </Box>

                      {/* Tono empaquetado (segundo plano) */}
                      <FormControl size="small" sx={{ minWidth: 150 }} disabled={!t.enabled}>
                        <Select value={t.soundKey} onChange={(e) => changeSound(t, e.target.value)}>
                          {bundled.map(b => <MenuItem key={b.key} value={b.key}>{b.label}</MenuItem>)}
                        </Select>
                      </FormControl>

                      {/* MP3 custom (primer plano) */}
                      {t.customSoundUrl ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, maxWidth: 200 }}>
                          <Tooltip title="Reproducir">
                            <IconButton size="small" color="primary" onClick={() => playPreview(t.customSoundUrl)}><PlayArrowIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          <Typography variant="caption" noWrap sx={{ maxWidth: 110 }}>{t.customSoundFilename || 'audio.mp3'}</Typography>
                          <Tooltip title="Quitar MP3">
                            <IconButton size="small" color="error" disabled={busy === t.key} onClick={() => removeMp3(t)}><DeleteIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Button size="small" variant="outlined" startIcon={busy === t.key ? <CircularProgress size={14} /> : <UploadFileIcon />}
                          disabled={!t.enabled || busy === t.key}
                          onClick={() => fileInputs.current[t.key]?.click()}>
                          Subir MP3
                        </Button>
                      )}
                      <input ref={el => { fileInputs.current[t.key] = el; }} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,.mp3,.wav,.ogg"
                        style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMp3(t, f); e.currentTarget.value = ''; }} />

                      {/* On / Off */}
                      <Tooltip title={t.enabled ? 'Activada' : 'Apagada'}>
                        <Switch checked={t.enabled} onChange={() => toggleEnabled(t)} color="success" />
                      </Tooltip>
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
