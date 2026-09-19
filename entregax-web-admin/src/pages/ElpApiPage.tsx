// ============================================
// PANEL API ELP — Proveedor externo de trámite/CBP (USA)
// Contenedores de rutas ELP + documentos + status
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Snackbar,
  Card,
  CardContent,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import EmailIcon from '@mui/icons-material/Email';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ElpDocuments {
  bl: string | null;
  telex_isf: string | null;
  isf_word: string | null;
  invoice: string | null;
  packing_list: string | null;
}

interface ElpContainer {
  id: number;
  container_number: string;
  bl_number: string | null;
  reference_code: string | null;
  route_code: string | null;
  status: string;
  status_label: string;
  week_number: string | null;
  eta: string | null;
  elp_notified_at: string | null;
  doc_count: number;
  documents: ElpDocuments;
  zip_url: string;
}

interface ElpStats {
  total: number;
  notificados: number;
  docs_received: number;
  procedure_requested: number;
  cbp_signature_received: number;
  arrived_port: number;
}

const STATUS_COLORS: Record<string, string> = {
  docs_received: '#1E88E5',
  procedure_requested: '#3949AB',
  cbp_signature_received: '#5E35B1',
  arrived_port: '#673AB7',
};

const DOC_LABELS: { key: keyof ElpDocuments; label: string }[] = [
  { key: 'bl', label: 'BL' },
  { key: 'telex_isf', label: 'Telex/ISF' },
  { key: 'isf_word', label: 'ISF Word' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'packing_list', label: 'Packing' },
];

export default function ElpApiPage({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState<ElpContainer[]>([]);
  const [stats, setStats] = useState<ElpStats | null>(null);
  const [configured, setConfigured] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  // Buscador por contenedor, BL o referencia. Con 180 contenedores, encontrar
  // uno a ojo no era viable.
  const [buscar, setBuscar] = useState('');
  const visibles = (() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter((c) =>
      [c.container_number, (c as any).bl_number, (c as any).reference_code]
        .some((v) => String(v || '').toLowerCase().includes(q)));
  })();

  // Los 6 hitos de cada contenedor, para pintar su linea debajo del renglon.
  // Se piden en lote: uno por uno serian 180 llamadas.
  const [hitos, setHitos] = useState<Record<number, any>>({});
  useEffect(() => {
    if (!containers.length) return;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const r = await fetch(`${API_URL}/api/containers/linea-tiempo/hitos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: containers.map((c) => c.id) }),
        });
        if (r.ok) { const d = await r.json(); setHitos(d.contenedores || {}); }
      } catch { /* la tabla funciona igual sin la linea */ }
    })();
  }, [containers]);

  // Movimientos del contenedor: se abre al dar clic en su estado.
  const [movsDe, setMovsDe] = useState<any | null>(null);
  const [movs, setMovs] = useState<any | null>(null);
  const [movsCargando, setMovsCargando] = useState(false);
  const abrirMovimientos = async (c: any) => {
    setMovsDe(c); setMovs(null); setMovsCargando(true);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API_URL}/api/containers/${c.id}/linea-tiempo`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setMovs(await r.json());
    } catch { /* se muestra el aviso de vacío */ }
    finally { setMovsCargando(false); }
  };

  // Editor de destinatarios del correo de aviso
  const [emailsOpen, setEmailsOpen] = useState(false);
  const [emailsValue, setEmailsValue] = useState('');
  const [emailsSaving, setEmailsSaving] = useState(false);

  const token = localStorage.getItem('token');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [cRes, sRes] = await Promise.all([
        fetch(`${API_URL}/api/elp/admin/containers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/elp/admin/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cData = await cRes.json();
      const sData = await sRes.json();
      if (cData.ok) setContainers(cData.containers || []);
      if (sData.ok) {
        setStats(sData.stats);
        setConfigured(sData.configured !== false);
      }
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Error cargando datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleResend = async (c: ElpContainer) => {
    try {
      const res = await fetch(`${API_URL}/api/elp/admin/containers/${c.id}/notify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setSnackbar({ open: true, message: `Notificación reenviada para ${c.container_number}`, severity: 'success' });
        load();
      } else {
        throw new Error(data.error || 'Error');
      }
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message, severity: 'error' });
    }
  };

  const openEmailsEditor = async () => {
    try {
      const res = await fetch(`${API_URL}/api/elp/admin/settings`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) setEmailsValue((data.notify_emails || []).join(', '));
    } catch { /* usa valor vacío */ }
    setEmailsOpen(true);
  };

  const saveEmails = async () => {
    try {
      setEmailsSaving(true);
      const res = await fetch(`${API_URL}/api/elp/admin/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify_emails: emailsValue }),
      });
      const data = await res.json();
      if (data.ok) {
        setSnackbar({ open: true, message: `Destinatarios guardados: ${(data.notify_emails || []).join(', ')}`, severity: 'success' });
        setEmailsOpen(false);
      } else {
        throw new Error(data.error || 'Error');
      }
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message, severity: 'error' });
    } finally {
      setEmailsSaving(false);
    }
  };

  const statCard = (label: string, value: number, color: string) => (
    <Card sx={{ flex: 1, minWidth: 140, bgcolor: `${color}14` }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h5" fontWeight="bold" sx={{ color }}>{value}</Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight="bold">🌉 API ELP</Typography>
          <Typography variant="body2" color="text.secondary">
            Contenedores de rutas habilitadas para el proveedor ELP (trámite / CBP)
          </Typography>
        </Box>
        <Button startIcon={<EditIcon />} onClick={openEmailsEditor} variant="outlined" sx={{ mr: 1 }}>
          Destinatarios del correo
        </Button>
        <Button startIcon={<RefreshIcon />} onClick={load} variant="outlined">Actualizar</Button>
      </Box>

      {!configured && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Falta configurar <code>ELP_API_KEY</code> en el servidor. El proveedor no podrá autenticarse
          hasta que se defina esa variable de entorno en Railway.
        </Alert>
      )}

      {/* Stats */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          {statCard('Total', stats.total, '#5E35B1')}
          {statCard('Notificados', stats.notificados, '#00897B')}
          {statCard('Documentos Recibidos', stats.docs_received, STATUS_COLORS.docs_received)}
          {statCard('Trámite Solicitado', stats.procedure_requested, STATUS_COLORS.procedure_requested)}
          {statCard('Firma CBP', stats.cbp_signature_received, STATUS_COLORS.cbp_signature_received)}
          {statCard('Arribo a Puerto', stats.arrived_port, STATUS_COLORS.arrived_port)}
        </Box>
      )}

      <TextField
        size="small" fullWidth sx={{ mb: 2 }}
        placeholder="Buscar por contenedor, BL o referencia…"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#111' }}>
              <TableRow>
                {['CONTENEDOR', 'BL', 'REFERENCIA', 'RUTA', 'WEEK', 'ETA', 'ESTADO', 'DOCUMENTOS', 'ELP', 'ACCIONES'].map((h) => (
                  <TableCell key={h} sx={{ color: '#fff', fontWeight: 'bold' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      {buscar.trim()
                        ? `Ningún contenedor coincide con "${buscar.trim()}".`
                        : 'No hay contenedores en rutas habilitadas para ELP. Activa el flag "Comunicar con API ELP" en una ruta desde el módulo Rutas.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                visibles.map((c) => (
                  <React.Fragment key={c.id}>
                  <TableRow hover sx={{ '& td': { borderBottom: 'none' } }}>
                    <TableCell><Typography fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{c.container_number}</Typography></TableCell>
                    <TableCell>{c.bl_number || '—'}</TableCell>
                    <TableCell>{c.reference_code || '—'}</TableCell>
                    <TableCell>{c.route_code || '—'}</TableCell>
                    <TableCell>{c.week_number || '—'}</TableCell>
                    <TableCell>{c.eta ? new Date(c.eta).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      {/* El estado abre los movimientos del contenedor (tarea 478). */}
                      <Tooltip title="Ver los movimientos de este contenedor">
                        <Chip
                          label={c.status_label}
                          size="small"
                          onClick={() => abrirMovimientos(c)}
                          sx={{ bgcolor: `${STATUS_COLORS[c.status] || '#607D8B'}22`, color: STATUS_COLORS[c.status] || '#607D8B', fontWeight: 700, cursor: 'pointer', '&:hover': { filter: 'brightness(0.92)' } }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {DOC_LABELS.map((d) => {
                          const url = c.documents?.[d.key];
                          return url ? (
                            <Tooltip key={d.key} title={`Abrir ${d.label}`}>
                              <Chip
                                icon={<DescriptionIcon />}
                                label={d.label}
                                size="small"
                                clickable
                                onClick={() => window.open(url, '_blank')}
                                sx={{ fontSize: 10 }}
                              />
                            </Tooltip>
                          ) : (
                            <Chip key={d.key} label={d.label} size="small" variant="outlined" sx={{ fontSize: 10, opacity: 0.4 }} />
                          );
                        })}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {c.elp_notified_at ? (
                        <Tooltip title={`Notificado ${new Date(c.elp_notified_at).toLocaleString()}`}>
                          <Chip label="✅ Notificado" size="small" sx={{ bgcolor: '#E0F2F1', color: '#00695C', fontSize: 10 }} />
                        </Tooltip>
                      ) : (
                        <Chip label="Pendiente" size="small" sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontSize: 10 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Descargar todos los documentos (ZIP)">
                        <span>
                          <IconButton
                            size="small"
                            color="secondary"
                            disabled={c.doc_count === 0}
                            onClick={() => window.open(c.zip_url, '_blank')}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Reenviar correo al proveedor ELP">
                        <IconButton size="small" color="primary" onClick={() => handleResend(c)}>
                          <EmailIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  {/* Los 6 hitos del contenedor: la misma linea que ve el cliente. */}
                  <TableRow>
                    <TableCell colSpan={10} sx={{ pt: 0, pb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {(hitos[c.id]?.hitos || []).map((h: any, i: number, arr: any[]) => (
                          <Box key={h.hito} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ textAlign: 'center', minWidth: 92 }}>
                              <Box sx={{ width: 16, height: 16, borderRadius: '50%', mx: 'auto', mb: 0.3,
                                bgcolor: h.fecha ? '#2E7D32' : '#D6D6D6', color: '#fff', fontSize: 10,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                {h.fecha ? '✓' : ''}
                              </Box>
                              <Typography sx={{ fontSize: 10.5, fontWeight: h.fecha ? 700 : 400, color: h.fecha ? '#2E7D32' : '#999', lineHeight: 1.2 }}>
                                {h.hito}
                              </Typography>
                              <Typography sx={{ fontSize: 9.5, color: '#999' }}>
                                {h.fecha ? new Date(h.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) : '—'}
                              </Typography>
                            </Box>
                            {i < arr.length - 1 && (
                              <Box sx={{ width: 22, height: 2, bgcolor: h.fecha ? '#2E7D32' : '#E0E0E0' }} />
                            )}
                          </Box>
                        ))}
                        {hitos[c.id] && (
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#E65100', ml: 1 }}>
                            {hitos[c.id].dias_desde_alta} días desde el alta
                            <Typography component="span" sx={{ fontSize: 10.5, color: '#999', fontWeight: 400, ml: 0.5 }}>
                              {' · '}{hitos[c.id].pasos_registrados}/{hitos[c.id].pasos_totales} pasos
                            </Typography>
                          </Typography>
                        )}
                        {/* Mismo modal que el clic en el estado, pero visible:
                            nadie adivina que el chip se puede apretar. */}
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => abrirMovimientos(c)}
                          sx={{ ml: 'auto', textTransform: 'none', fontSize: 11, py: 0.2,
                            borderColor: '#E65100', color: '#E65100', '&:hover': { borderColor: '#BF360C', bgcolor: '#FFF3E0' } }}
                        >
                          Ver detalles
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Editor de destinatarios del correo de aviso */}
      <Dialog open={emailsOpen} onClose={() => setEmailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>📧 Destinatarios del correo de aviso ELP</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Correos a los que se avisa cuando se registra un contenedor de ruta ELP.
            Separa varios con coma. Si lo dejas vacío, se usa el destinatario por defecto del sistema.
          </Typography>
          <TextField
            label="Correos (separados por coma)"
            value={emailsValue}
            onChange={(e) => setEmailsValue(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            placeholder="aldocampos@entregax.com, proveedor@elp.com"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEmailsOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveEmails} disabled={emailsSaving}>
            {emailsSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

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

      {/* Movimientos del contenedor — los 12 pasos con sus días (tarea 478). */}
      <Dialog open={!!movsDe} onClose={() => { setMovsDe(null); setMovs(null); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Movimientos de {movsDe?.container_number}
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}>
            {movsDe?.bl_number ? `BL ${movsDe.bl_number}` : ''}
            {movsDe?.reference_code ? ` · Ref ${movsDe.reference_code}` : ''}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {movsCargando && <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>}
          {!movsCargando && movs && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Un paso sin fecha no se registró; no quiere decir que no haya ocurrido.
              </Typography>
              {movs.pasos.map((p: any) => (
                <Box key={p.paso} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 0.9,
                  borderBottom: '1px dashed #eee', opacity: p.ocurrio_at ? 1 : 0.5 }}>
                  <Box sx={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, mt: 0.2,
                    bgcolor: p.ocurrio_at ? '#2E7D32' : '#E0E0E0', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {p.ocurrio_at ? '✓' : p.paso}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontSize={13.5} fontWeight={p.ocurrio_at ? 600 : 400}>{p.etiqueta}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.ocurrio_at ? new Date(p.ocurrio_at).toLocaleString('es-MX') : `Pendiente · ${p.fuente}`}
                      {p.origen && ` · ${p.origen}`}
                      {p.dias_desde_anterior != null && p.dias_desde_anterior > 0 && ` · +${p.dias_desde_anterior} día(s)`}
                      {p.dias_esperando != null && ` · lleva ${p.dias_esperando} día(s) esperando`}
                    </Typography>
                    {p.fotos?.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        {p.fotos.map((fo: any, i: number) => (
                          <Box key={i} component="a" href={fo.url} target="_blank" rel="noopener noreferrer"
                            sx={{ fontSize: 12, color: '#1565C0' }}>📷 Foto {i + 1}</Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Box>
              ))}
              {movs.dias_totales != null && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.5, fontWeight: 700 }}>
                  {movs.dias_totales} día(s) entre el primer y el último movimiento registrado.
                </Typography>
              )}
            </>
          )}
          {!movsCargando && !movs && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No se pudieron cargar los movimientos.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setMovsDe(null); setMovs(null); }}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
