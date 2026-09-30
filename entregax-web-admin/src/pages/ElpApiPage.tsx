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
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import PriceIcon from '@mui/icons-material/AttachMoney';
import MapIcon from '@mui/icons-material/Map';

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
  // De quién es el contenedor. En Costeo Marítimo esto vive en la columna
  // "WEEK", que enseña el casillero cuando el contenedor es de un solo cliente
  // y el número de week cuando va consolidado. Aquí se separan en dos columnas
  // para que se lean sin adivinar cuál de las dos está viendo uno.
  cliente_casillero: string | null;
  cliente_nombre: string | null;
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

const DOC_LABELS: { key: keyof ElpDocuments; label: string; sigla: string }[] = [
  { key: 'bl', label: 'BL', sigla: 'BL' },
  { key: 'telex_isf', label: 'Telex/ISF', sigla: 'ISF/TL' },
  { key: 'isf_word', label: 'ISF Word', sigla: 'ISFW' },
  { key: 'invoice', label: 'Invoice', sigla: 'INV' },
  { key: 'packing_list', label: 'Packing List', sigla: 'PL' },
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

  // Visor de fotos y documentos: se abre con una miniatura y se recorre la
  // serie completa del contenedor con las flechas.
  const [visor, setVisor] = useState<number | null>(null);

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

  // ── Precios del mes y tarifas nacionales (tarea 671) ──────────────────────
  const [preciosOpen, setPreciosOpen] = useState(false);
  const [precios, setPrecios] = useState<any | null>(null);
  const [precioForm, setPrecioForm] = useState<Record<number, { flete: string; liberacion: string }>>({});
  const [precioGuardando, setPrecioGuardando] = useState<number | null>(null);
  const [tarifasOpen, setTarifasOpen] = useState(false);
  const [tarifas, setTarifas] = useState<any[]>([]);
  const [tarifasResumen, setTarifasResumen] = useState<any | null>(null);
  const [tarifaGuardando, setTarifaGuardando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  /** Mes que se está capturando: siempre el SIGUIENTE, que es para el que se pide. */
  const mesSiguiente = (() => {
    const d = new Date();
    const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();

  const abrirPrecios = async () => {
    setPreciosOpen(true);
    try {
      const res = await fetch(`${API_URL}/api/elp/admin/precios`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) {
        setPrecios(data);
        // El formulario arranca con lo que ya está vigente, no en blanco: casi
        // siempre el flete se mueve poco y así se corrige en vez de teclear todo.
        const f: Record<number, { flete: string; liberacion: string }> = {};
        for (const r of data.rutas || []) {
          f[r.route_id] = {
            flete: r.vigente ? String(r.vigente.flete_usd) : '',
            liberacion: r.vigente ? String(r.vigente.liberacion_usd) : '',
          };
        }
        setPrecioForm(f);
      }
    } catch { setAviso({ tipo: 'error', texto: 'No se pudieron cargar los precios' }); }
  };

  const guardarPrecio = async (routeId: number) => {
    const f = precioForm[routeId];
    if (!f) return;
    setPrecioGuardando(routeId);
    try {
      const res = await fetch(`${API_URL}/api/elp/admin/precios`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_id: routeId, periodo: mesSiguiente,
          flete_usd: Number(f.flete), liberacion_usd: Number(f.liberacion),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');
      setAviso({ tipo: 'success', texto: `Precio de ${mesSiguiente} guardado: $${Number(data.precio.total_usd).toLocaleString('en-US')} USD` });
      await abrirPrecios();
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se pudo guardar el precio' });
    } finally { setPrecioGuardando(null); }
  };

  const abrirTarifas = async () => {
    setTarifasOpen(true);
    try {
      const res = await fetch(`${API_URL}/api/elp/admin/tarifas-nacionales`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) { setTarifas(data.tarifas || []); setTarifasResumen(data.resumen); }
    } catch { setAviso({ tipo: 'error', texto: 'No se pudieron cargar las tarifas' }); }
  };

  const guardarTarifa = async (t: any, cobertura: string, tarifaUsd: string) => {
    setTarifaGuardando(t.id);
    try {
      const res = await fetch(`${API_URL}/api/elp/admin/tarifas-nacionales/${t.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cobertura, tarifa_usd: Number(tarifaUsd) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');
      await abrirTarifas();
    } catch (e: any) {
      setAviso({ tipo: 'error', texto: e?.message || 'No se pudo guardar la tarifa' });
    } finally { setTarifaGuardando(null); }
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
        {/* Precio del contenedor dedicado y tarifas del tramo nacional
            (tarea 671). Viven aquí porque el precio es de las rutas ELP. */}
        <Button startIcon={<PriceIcon />} onClick={abrirPrecios} variant="outlined" sx={{ mr: 1 }}>
          Precios del mes
        </Button>
        <Button startIcon={<MapIcon />} onClick={abrirTarifas} variant="outlined" sx={{ mr: 1 }}>
          Tarifas nacional
        </Button>
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
                {['CONTENEDOR', 'BL', 'REFERENCIA', 'CLIENTE', 'RUTA', 'WEEK', 'ETA', 'ESTADO', 'DOCUMENTOS', 'ELP', 'ACCIONES'].map((h) => (
                  <TableCell key={h} sx={{ color: '#fff', fontWeight: 'bold' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
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
                    <TableCell>
                      {c.cliente_casillero ? (
                        <Tooltip title={c.cliente_nombre || ''}>
                          <Box>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.1 }}>{c.cliente_casillero}</Typography>
                            {c.cliente_nombre && (
                              <Typography sx={{ fontSize: 10.5, color: '#777', lineHeight: 1.1 }}>
                                {String(c.cliente_nombre).slice(0, 18)}
                              </Typography>
                            )}
                          </Box>
                        </Tooltip>
                      ) : <Typography sx={{ fontSize: 12, color: '#BDBDBD' }}>—</Typography>}
                    </TableCell>
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
                      <Box sx={{ display: 'flex', gap: 0.3, flexWrap: 'wrap', maxWidth: 120 }}>
                        {DOC_LABELS.map((d) => {
                          const url = c.documents?.[d.key];
                          return (
                            <Tooltip key={d.key} title={url ? `Abrir ${d.label}` : `Sin ${d.label}`}>
                              <Box
                                onClick={url ? () => window.open(url, '_blank') : undefined}
                                sx={{
                                  px: 0.6,
                                  height: 18,
                                  display: 'flex',
                                  alignItems: 'center',
                                  borderRadius: 0.75,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: 0.2,
                                  lineHeight: 1,
                                  cursor: url ? 'pointer' : 'default',
                                  bgcolor: url ? '#E8F5E9' : 'transparent',
                                  color: url ? '#2E7D32' : '#BDBDBD',
                                  border: '1px solid',
                                  borderColor: url ? '#A5D6A7' : '#E0E0E0',
                                  '&:hover': url ? { bgcolor: '#C8E6C9' } : undefined,
                                }}
                              >
                                {d.sigla}
                              </Box>
                            </Tooltip>
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
                    <TableCell colSpan={11} sx={{ pt: 0, pb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {(hitos[c.id]?.hitos_operacion || []).map((h: any, i: number, arr: any[]) => (
                          <Box key={h.etiqueta} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ textAlign: 'center', minWidth: 74 }}>
                              <Box sx={{ width: 16, height: 16, borderRadius: '50%', mx: 'auto', mb: 0.3,
                                bgcolor: h.fecha ? '#2E7D32' : '#D6D6D6', color: '#fff', fontSize: 10,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                {h.fecha ? '✓' : ''}
                              </Box>
                              <Typography sx={{ fontSize: 9.5, fontWeight: h.fecha ? 700 : 400, color: h.fecha ? '#2E7D32' : '#BDBDBD', lineHeight: 1.1 }}>
                                {h.fecha ? new Date(h.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) : '—'}
                              </Typography>
                              {/* La seña de que movimiento es: sin esto los puntos no dicen nada. */}
                              <Typography sx={{ fontSize: 8, color: h.fecha ? '#555' : '#C4C4C4', lineHeight: 1.15, mt: 0.1, textTransform: 'uppercase', letterSpacing: 0.1 }}>
                                {h.etiqueta}
                              </Typography>
                            </Box>
                            {i < arr.length - 1 && (
                              <Box sx={{ width: 16, height: 2, bgcolor: h.fecha ? '#2E7D32' : '#E0E0E0' }} />
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

      {/* ── Precio mensual del contenedor dedicado (tarea 671) ── */}
      <Dialog open={preciosOpen} onClose={() => setPreciosOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>💲 Precio del contenedor dedicado — {mesSiguiente}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            El precio se arma con el flete internacional del mes, el costo de liberación con entrega
            en CDMX y una utilidad fija de <strong>${Number(precios?.utilidad_fija_usd || 5000).toLocaleString('en-US')} USD</strong>.
            Cada ruta lleva el suyo: son puertos distintos.
          </Typography>

          {(precios?.rutas || []).map((r: any) => {
            const f = precioForm[r.route_id] || { flete: '', liberacion: '' };
            const total = (Number(f.flete) || 0) + (Number(f.liberacion) || 0) + Number(precios?.utilidad_fija_usd || 5000);
            const puedeGuardar = Number(f.flete) > 0 && Number(f.liberacion) > 0;
            return (
              <Box key={r.route_id} sx={{ mb: 2.5, p: 2, borderRadius: 2, border: '1px solid #E0E0E0' }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>{r.code}</Typography>
                {r.vigente ? (
                  <Typography variant="caption" sx={{ display: 'block', mb: 1.5,
                    color: r.vigente.es_del_mes_anterior ? '#C62828' : 'text.secondary' }}>
                    {r.vigente.es_del_mes_anterior ? '⚠️ ' : ''}
                    Vigente: ${Number(r.vigente.total_usd).toLocaleString('en-US')} USD (periodo {String(r.vigente.periodo).slice(0, 7)})
                    {r.vigente.es_del_mes_anterior && ' — se está sosteniendo el precio anterior'}
                  </Typography>
                ) : (
                  <Typography variant="caption" sx={{ display: 'block', mb: 1.5, color: '#C62828' }}>
                    ⚠️ Esta ruta no tiene ningún precio publicado: hoy no cotiza.
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <TextField label="Flete internacional (USD)" size="small" type="number"
                    value={f.flete}
                    onChange={(e) => setPrecioForm(p => ({ ...p, [r.route_id]: { ...f, flete: e.target.value } }))}
                    sx={{ width: 210 }} />
                  <TextField label="Liberación (USD)" size="small" type="number"
                    value={f.liberacion}
                    onChange={(e) => setPrecioForm(p => ({ ...p, [r.route_id]: { ...f, liberacion: e.target.value } }))}
                    sx={{ width: 190 }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 150 }}>
                    = ${total.toLocaleString('en-US')} USD
                  </Typography>
                  <Button variant="contained" size="small" disabled={!puedeGuardar || precioGuardando === r.route_id}
                    onClick={() => guardarPrecio(r.route_id)}>
                    {precioGuardando === r.route_id ? 'Guardando…' : 'Guardar'}
                  </Button>
                </Box>
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPreciosOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Tarifas del tramo nacional, por estado (tarea 671) ── */}
      <Dialog open={tarifasOpen} onClose={() => setTarifasOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>🗺️ Tarifas nacional</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Lo que se suma al precio del contenedor según el estado de entrega.
            Un estado <strong>sin cobertura</strong> no cotiza: al cliente se le pide que contacte a su asesor.
          </Typography>
          {tarifasResumen && (
            <Typography variant="caption" sx={{ display: 'block', mb: 2, color: 'text.secondary' }}>
              {tarifasResumen.incluidos} incluidos · {tarifasResumen.con_tarifa} con tarifa · {tarifasResumen.sin_cobertura} sin cobertura
            </Typography>
          )}
          <Table size="small">
            <TableBody>
              {tarifas.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell sx={{ fontWeight: 600, width: 190 }}>{t.estado}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      {(['incluido', 'con_tarifa', 'sin_cobertura'] as const).map(c => (
                        <Chip key={c} size="small" clickable
                          label={c === 'incluido' ? 'Incluido' : c === 'con_tarifa' ? 'Con tarifa' : 'Sin cobertura'}
                          color={t.cobertura === c ? (c === 'incluido' ? 'success' : c === 'con_tarifa' ? 'primary' : 'default') : 'default'}
                          variant={t.cobertura === c ? 'filled' : 'outlined'}
                          disabled={tarifaGuardando === t.id}
                          onClick={() => {
                            if (c === 'con_tarifa') {
                              const v = window.prompt(`Tarifa de ${t.estado} en USD (se suma al precio del contenedor):`,
                                t.tarifa_usd ? String(t.tarifa_usd) : '');
                              if (v === null) return;
                              guardarTarifa(t, c, v);
                            } else {
                              guardarTarifa(t, c, '0');
                            }
                          }} />
                      ))}
                      {t.cobertura === 'con_tarifa' && (
                        <Typography variant="body2" sx={{ fontWeight: 700, ml: 0.5 }}>
                          +${Number(t.tarifa_usd || 0).toLocaleString('en-US')} USD
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTarifasOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {aviso && (
        <Alert severity={aviso.tipo} onClose={() => setAviso(null)}
          sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1400, maxWidth: 420 }}>
          {aviso.texto}
        </Alert>
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
          {!movsCargando && movs && (() => {
            // Todas las fotos y documentos del contenedor, en el orden de los
            // pasos: es la serie que se recorre en el visor.
            const archivos = movs.pasos.flatMap((p: any) =>
              (p.fotos || []).map((fo: any) => ({ ...fo, paso: p.etiqueta })));
            return (
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
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
                        {p.fotos.map((fo: any) => {
                          const pos = archivos.findIndex((a: any) => a.url === fo.url);
                          const esPdf = /\.pdf(\?|$)/i.test(String(fo.url || ''));
                          return (
                            <Box key={fo.url} onClick={() => setVisor(pos)}
                              sx={{ width: 64, height: 64, borderRadius: 1, overflow: 'hidden', cursor: 'pointer',
                                border: '1px solid #ddd', bgcolor: '#FAFAFA', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                '&:hover': { borderColor: '#E65100' } }}>
                              {esPdf
                                ? <Typography sx={{ fontSize: 10, textAlign: 'center', px: 0.5 }}>📄 PDF</Typography>
                                : <Box component="img" src={fo.url} alt={fo.nombre || 'foto'}
                                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e: any) => { e.currentTarget.style.display = 'none'; }} />}
                            </Box>
                          );
                        })}
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
            );
          })()}
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

      {/* Visor de la serie de fotos y documentos, con flechas. */}
      {visor !== null && movs && (() => {
        const archivos = movs.pasos.flatMap((p: any) =>
          (p.fotos || []).map((fo: any) => ({ ...fo, paso: p.etiqueta })));
        const actual = archivos[visor];
        if (!actual) return null;
        const mover = (d: number) => setVisor((v) => {
          const n = (v ?? 0) + d;
          return n < 0 ? archivos.length - 1 : n >= archivos.length ? 0 : n;
        });
        const esPdf = /\.pdf(\?|$)/i.test(String(actual.url || ''));
        return (
          <Dialog open fullWidth maxWidth="md" onClose={() => setVisor(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') mover(1);
              if (e.key === 'ArrowLeft') mover(-1);
            }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.25 }}>
              <Box>
                <Typography fontWeight={700} fontSize={15}>{actual.paso}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {visor + 1} de {archivos.length}{actual.nombre ? ` · ${actual.nombre}` : ''}
                </Typography>
              </Box>
              <Button size="small" onClick={() => setVisor(null)}>Cerrar</Button>
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#111', minHeight: 360 }}>
              <IconButton onClick={() => mover(-1)} disabled={archivos.length < 2} sx={{ color: '#fff' }}>‹</IconButton>
              <Box sx={{ flex: 1, textAlign: 'center' }}>
                {esPdf ? (
                  <Box sx={{ color: '#fff', py: 6 }}>
                    <Typography sx={{ mb: 2 }}>📄 Este archivo es un PDF</Typography>
                    <Button variant="contained" onClick={() => window.open(actual.url, '_blank')}>Abrir el PDF</Button>
                  </Box>
                ) : (
                  <Box component="img" src={actual.url} alt={actual.nombre || 'archivo'}
                    sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
                )}
              </Box>
              <IconButton onClick={() => mover(1)} disabled={archivos.length < 2} sx={{ color: '#fff' }}>›</IconButton>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                Usa las flechas del teclado para moverte entre los archivos.
              </Typography>
              <Button onClick={() => window.open(actual.url, '_blank')}>Abrir en otra pestaña</Button>
            </DialogActions>
          </Dialog>
        );
      })()}
    </Box>
  );
}
