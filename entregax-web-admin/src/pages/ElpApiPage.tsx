// ============================================
// PANEL API ELP — Proveedor externo de trámite/CBP (USA)
// Contenedores de rutas ELP + documentos + status
// ============================================

import { useState, useEffect, useCallback } from 'react';
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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import EmailIcon from '@mui/icons-material/Email';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';

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
              {containers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No hay contenedores en rutas habilitadas para ELP. Activa el flag "Comunicar con API ELP"
                      en una ruta desde el módulo Rutas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                containers.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell><Typography fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{c.container_number}</Typography></TableCell>
                    <TableCell>{c.bl_number || '—'}</TableCell>
                    <TableCell>{c.reference_code || '—'}</TableCell>
                    <TableCell>{c.route_code || '—'}</TableCell>
                    <TableCell>{c.week_number || '—'}</TableCell>
                    <TableCell>{c.eta ? new Date(c.eta).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={c.status_label}
                        size="small"
                        sx={{ bgcolor: `${STATUS_COLORS[c.status] || '#607D8B'}22`, color: STATUS_COLORS[c.status] || '#607D8B', fontWeight: 700 }}
                      />
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
    </Box>
  );
}
