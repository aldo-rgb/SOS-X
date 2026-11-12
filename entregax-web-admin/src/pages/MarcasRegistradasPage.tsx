// ============================================================================
// ™️ CATÁLOGO DE MARCAS REGISTRADAS
// ============================================================================
// Qué marcas sí podemos manejar y de quién son. Lo captura Servicio a Cliente
// cuando un asesor avisa que su cliente es dueño de una marca.
//
// Una marca solo queda "autorizada" cuando el registro está completo: nombre,
// cómo se pronuncia, logo con fondo blanco y de qué cliente es. Mientras le
// falte algo se queda en "pendiente" con lo que falta a la vista, para que
// quien la consulte sepa que todavía no puede apoyarse en ella.
//
// La carta del IMPI es opcional a propósito: casi nunca la traen el mismo día,
// y esperarla significaría no registrar nada.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, IconButton, Button, TextField, InputAdornment, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Tooltip,
  Grid, Avatar, Stack, Divider, Autocomplete, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedIcon from '@mui/icons-material/Verified';
import BlockIcon from '@mui/icons-material/Block';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';

interface Marca {
  id: number;
  marca: string;
  nombre_fonetico: string | null;
  logo_key: string | null;
  logo_url: string | null;
  logo_fondo_blanco: boolean | null;
  carta_impi_key: string | null;
  carta_impi_nombre: string | null;
  carta_impi_url: string | null;
  user_id: number | null;
  box_id: string | null;
  cliente_nombre: string | null;
  cliente_actual: string | null;
  box_actual: string | null;
  productos: string | null;
  estatus: 'pendiente' | 'autorizada' | 'rechazada';
  motivo: string | null;
  notas: string | null;
  ticket_folio: string | null;
  registrado_por_nombre: string | null;
  autorizado_por_nombre: string | null;
  autorizado_at: string | null;
  created_at: string;
  faltantes: string[];
}

interface ClienteOpt { id: number; full_name: string; box_id: string | null; }

const ESTATUS_UI: Record<string, { label: string; color: 'success' | 'warning' | 'default'; }> = {
  autorizada: { label: 'Autorizada', color: 'success' },
  pendiente: { label: 'Pendiente', color: 'warning' },
  rechazada: { label: 'No se maneja', color: 'default' },
};

const vacio = {
  id: 0, marca: '', nombre_fonetico: '', logo_key: '' as string | null, logo_url: '' as string | null,
  logo_fondo_blanco: null as boolean | null, carta_impi_key: '' as string | null,
  carta_impi_nombre: '' as string | null, carta_impi_url: '' as string | null,
  user_id: null as number | null, box_id: '', cliente_nombre: '', productos: '',
  notas: '', ticket_folio: '', motivo: '',
};

export default function MarcasRegistradasPage() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [stats, setStats] = useState<{ autorizadas: number; pendientes: number; rechazadas: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' }>({ open: false, message: '', severity: 'success' });

  const [form, setForm] = useState({ ...vacio });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [subiendoCarta, setSubiendoCarta] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const cartaInput = useRef<HTMLInputElement>(null);

  const [clienteQuery, setClienteQuery] = useState('');
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [verLogo, setVerLogo] = useState<Marca | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (busqueda.trim()) params.set('q', busqueda.trim());
      if (filtro) params.set('estatus', filtro);
      const res = await axios.get(`${API_URL}/admin/marcas-registradas?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setMarcas(res.data.data || []);
      setStats(res.data.stats || null);
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'No se pudo cargar el catálogo', severity: 'error' });
    } finally { setLoading(false); }
  }, [busqueda, filtro]);

  useEffect(() => { const t = setTimeout(cargar, 300); return () => clearTimeout(t); }, [cargar]);

  // Buscador de clientes del formulario
  useEffect(() => {
    if (clienteQuery.trim().length < 2) { setClientes([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/marcas-registradas/buscar-cliente?q=${encodeURIComponent(clienteQuery.trim())}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        setClientes(res.data.data || []);
      } catch { setClientes([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [clienteQuery]);

  const abrirNueva = () => { setForm({ ...vacio }); setClienteQuery(''); setDialogOpen(true); };
  const abrirEdicion = (m: Marca) => {
    setForm({
      id: m.id, marca: m.marca, nombre_fonetico: m.nombre_fonetico || '',
      logo_key: m.logo_key, logo_url: m.logo_url, logo_fondo_blanco: m.logo_fondo_blanco,
      carta_impi_key: m.carta_impi_key, carta_impi_nombre: m.carta_impi_nombre, carta_impi_url: m.carta_impi_url,
      user_id: m.user_id, box_id: m.box_id || '', cliente_nombre: m.cliente_nombre || '',
      productos: m.productos || '', notas: m.notas || '', ticket_folio: m.ticket_folio || '',
      motivo: m.motivo || '',
    });
    setClienteQuery('');
    setDialogOpen(true);
  };

  const subirLogo = async (file: File) => {
    setSubiendoLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/admin/marcas-registradas/upload-logo`, fd, {
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'multipart/form-data' },
      });
      setForm(prev => ({ ...prev, logo_key: res.data.key, logo_url: res.data.url, logo_fondo_blanco: res.data.fondo_blanco }));
      if (res.data.fondo_blanco === false) {
        setSnackbar({ open: true, message: 'El logo se subió, pero el fondo no se ve blanco. Si es una foto del producto, consíguela recortada sobre fondo blanco.', severity: 'warning' });
      }
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'No se pudo subir el logo', severity: 'error' });
    } finally { setSubiendoLogo(false); }
  };

  const subirCarta = async (file: File) => {
    setSubiendoCarta(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/admin/marcas-registradas/upload-carta`, fd, {
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'multipart/form-data' },
      });
      setForm(prev => ({ ...prev, carta_impi_key: res.data.key, carta_impi_url: res.data.url, carta_impi_nombre: res.data.nombre }));
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'No se pudo subir la carta', severity: 'error' });
    } finally { setSubiendoCarta(false); }
  };

  const guardar = async () => {
    if (!form.marca.trim()) { setSnackbar({ open: true, message: 'Falta el nombre de la marca', severity: 'error' }); return; }
    setGuardando(true);
    try {
      const payload = {
        marca: form.marca.trim(),
        nombre_fonetico: form.nombre_fonetico,
        logo_key: form.logo_key, logo_fondo_blanco: form.logo_fondo_blanco,
        carta_impi_key: form.carta_impi_key, carta_impi_nombre: form.carta_impi_nombre,
        user_id: form.user_id, box_id: form.box_id, cliente_nombre: form.cliente_nombre,
        productos: form.productos, notas: form.notas, ticket_folio: form.ticket_folio,
      };
      if (form.id) {
        await axios.put(`${API_URL}/admin/marcas-registradas/${form.id}`, payload, { headers: { Authorization: `Bearer ${getToken()}` } });
      } else {
        await axios.post(`${API_URL}/admin/marcas-registradas`, payload, { headers: { Authorization: `Bearer ${getToken()}` } });
      }
      setSnackbar({ open: true, message: form.id ? 'Marca actualizada' : 'Marca registrada', severity: 'success' });
      setDialogOpen(false);
      cargar();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'No se pudo guardar', severity: 'error' });
    } finally { setGuardando(false); }
  };

  const cambiarEstatus = async (m: Marca, estatus: string) => {
    try {
      const body: any = { estatus };
      if (estatus === 'rechazada') {
        const motivo = window.prompt('¿Por qué no se maneja esta marca?', m.motivo || '');
        if (motivo === null) return;
        body.motivo = motivo;
      }
      await axios.put(`${API_URL}/admin/marcas-registradas/${m.id}`, body, { headers: { Authorization: `Bearer ${getToken()}` } });
      cargar();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'No se pudo cambiar el estatus', severity: 'error' });
    }
  };

  const borrar = async (m: Marca) => {
    if (!window.confirm(`¿Borrar "${m.marca}" del catálogo?`)) return;
    try {
      await axios.delete(`${API_URL}/admin/marcas-registradas/${m.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      cargar();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'No se pudo borrar', severity: 'error' });
    }
  };

  return (
    <Box>
      {/* Resumen */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[
          { label: 'Marcas que sí manejamos', valor: stats?.autorizadas ?? 0, color: '#10B981' },
          { label: 'Pendientes por completar', valor: stats?.pendientes ?? 0, color: '#F59E0B' },
          { label: 'Revisadas y no se manejan', valor: stats?.rechazadas ?? 0, color: '#9E9E9E' },
        ].map(s => (
          <Grid size={{ xs: 12, sm: 4 }} key={s.label}>
            <Paper sx={{ p: 2, borderLeft: `4px solid ${s.color}` }}>
              <Typography variant="h4" fontWeight={700} sx={{ color: s.color }}>{s.valor}</Typography>
              <Typography variant="caption" color="text.secondary">{s.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Barra */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Marca, cómo se pronuncia, cliente o casillero…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          sx={{ flex: '1 1 320px' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Estatus</InputLabel>
          <Select label="Estatus" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="autorizada">Sí las manejamos</MenuItem>
            <MenuItem value="pendiente">Pendientes</MenuItem>
            <MenuItem value="rechazada">No se manejan</MenuItem>
          </Select>
        </FormControl>
        <Tooltip title="Actualizar"><IconButton onClick={cargar}><RefreshIcon /></IconButton></Tooltip>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirNueva}>Registrar marca</Button>
      </Paper>

      {/* Catálogo */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Logo</TableCell>
              <TableCell>Marca</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>Ampara</TableCell>
              <TableCell>IMPI</TableCell>
              <TableCell>Estatus</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            )}
            {!loading && marcas.length === 0 && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                <Typography color="text.secondary">
                  Todavía no hay marcas en el catálogo. La primera se registra con “Registrar marca”.
                </Typography>
              </TableCell></TableRow>
            )}
            {!loading && marcas.map(m => (
              <TableRow key={m.id} hover>
                <TableCell>
                  {m.logo_url ? (
                    <Avatar
                      variant="rounded" src={m.logo_url} alt={m.marca}
                      sx={{ width: 52, height: 52, bgcolor: '#fff', border: '1px solid #E0E0E0', cursor: 'zoom-in' }}
                      onClick={() => setVerLogo(m)}
                    />
                  ) : (
                    <Avatar variant="rounded" sx={{ width: 52, height: 52, bgcolor: '#F5F5F5', color: '#BDBDBD' }}>
                      <PhotoCameraIcon fontSize="small" />
                    </Avatar>
                  )}
                </TableCell>
                <TableCell>
                  <Typography fontWeight={600}>{m.marca}</Typography>
                  {m.nombre_fonetico && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <RecordVoiceOverIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography variant="caption" color="text.secondary">se dice “{m.nombre_fonetico}”</Typography>
                    </Stack>
                  )}
                  {m.logo_fondo_blanco === false && (
                    <Tooltip title="El fondo del logo no se ve blanco">
                      <WarningAmberIcon sx={{ fontSize: 15, color: '#F59E0B', ml: 0.5, verticalAlign: 'middle' }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{m.cliente_actual || m.cliente_nombre || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">{m.box_actual || m.box_id || 'sin casillero'}</Typography>
                </TableCell>
                <TableCell><Typography variant="body2">{m.productos || '—'}</Typography></TableCell>
                <TableCell>
                  {m.carta_impi_url ? (
                    <Button size="small" startIcon={<PictureAsPdfIcon />} endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                      href={m.carta_impi_url} target="_blank" rel="noopener">Carta</Button>
                  ) : <Typography variant="caption" color="text.secondary">sin carta</Typography>}
                </TableCell>
                <TableCell>
                  <Chip size="small" label={ESTATUS_UI[m.estatus]?.label || m.estatus} color={ESTATUS_UI[m.estatus]?.color || 'default'} />
                  {m.estatus === 'pendiente' && m.faltantes?.length > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', color: '#B45309' }}>
                      falta {m.faltantes.join(', ')}
                    </Typography>
                  )}
                  {m.estatus === 'rechazada' && m.motivo && (
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{m.motivo}</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {m.estatus !== 'autorizada' && (
                      <Tooltip title={m.faltantes?.length ? `Falta ${m.faltantes.join(', ')}` : 'Marcar como marca que sí manejamos'}>
                        <span>
                          <IconButton size="small" color="success" disabled={m.faltantes?.length > 0}
                            onClick={() => cambiarEstatus(m, 'autorizada')}><VerifiedIcon fontSize="small" /></IconButton>
                        </span>
                      </Tooltip>
                    )}
                    {m.estatus !== 'rechazada' && (
                      <Tooltip title="No manejamos esta marca">
                        <IconButton size="small" onClick={() => cambiarEstatus(m, 'rechazada')}><BlockIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Editar"><IconButton size="small" onClick={() => abrirEdicion(m)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Borrar"><IconButton size="small" color="error" onClick={() => borrar(m)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Alta / edición */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? 'Editar marca' : 'Registrar marca'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Marca (como se escribe)" value={form.marca}
                onChange={e => setForm({ ...form, marca: e.target.value })} autoFocus />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Nombre fonético (cómo se pronuncia)"
                placeholder="blu-go" value={form.nombre_fonetico}
                onChange={e => setForm({ ...form, nombre_fonetico: e.target.value })}
                helperText="Así la encuentra quien solo la oyó" />
            </Grid>

            <Grid size={12}>
              <Autocomplete
                size="small" options={clientes}
                getOptionLabel={(o: ClienteOpt) => `${o.box_id || 's/casillero'} — ${o.full_name}`}
                onInputChange={(_, v) => setClienteQuery(v)}
                onChange={(_, v) => setForm({ ...form, user_id: v?.id ?? null, box_id: v?.box_id || '', cliente_nombre: v?.full_name || '' })}
                renderInput={(params) => (
                  <TextField {...params} label="Cliente dueño de la marca"
                    helperText={form.cliente_nombre ? `${form.cliente_nombre} · ${form.box_id || 'sin casillero'}` : 'Busca por nombre o número de casillero'} />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Número de cliente (casillero)" value={form.box_id}
                onChange={e => setForm({ ...form, box_id: e.target.value.toUpperCase() })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Qué productos ampara" placeholder="Lentes"
                value={form.productos} onChange={e => setForm({ ...form, productos: e.target.value })} />
            </Grid>

            <Grid size={12}><Divider /></Grid>

            {/* Logo */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar variant="rounded" src={form.logo_url || undefined}
                  sx={{ width: 72, height: 72, bgcolor: '#fff', border: '1px solid #E0E0E0', color: '#BDBDBD' }}>
                  <PhotoCameraIcon />
                </Avatar>
                <Box>
                  <Button size="small" variant="outlined" disabled={subiendoLogo}
                    startIcon={subiendoLogo ? <CircularProgress size={14} /> : <PhotoCameraIcon />}
                    onClick={() => logoInput.current?.click()}>
                    {form.logo_key ? 'Cambiar logo' : 'Subir logo'}
                  </Button>
                  <Typography variant="caption" sx={{ display: 'block', color: form.logo_fondo_blanco === false ? '#B45309' : 'text.secondary' }}>
                    {form.logo_fondo_blanco === false ? 'El fondo no se ve blanco' : 'Foto del logo con fondo blanco'}
                  </Typography>
                </Box>
              </Stack>
              <input ref={logoInput} type="file" accept="image/*" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f); e.target.value = ''; }} />
            </Grid>

            {/* Carta IMPI */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Button size="small" variant="outlined" disabled={subiendoCarta}
                startIcon={subiendoCarta ? <CircularProgress size={14} /> : <PictureAsPdfIcon />}
                onClick={() => cartaInput.current?.click()}>
                {form.carta_impi_key ? 'Cambiar carta IMPI' : 'Adjuntar carta IMPI (PDF)'}
              </Button>
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                {form.carta_impi_key ? (form.carta_impi_nombre || 'carta adjunta') : 'Opcional: si todavía no la tienen, se registra sin ella'}
              </Typography>
              <input ref={cartaInput} type="file" accept="application/pdf" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) subirCarta(f); e.target.value = ''; }} />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label="Ticket de donde salió" placeholder="TKT-2026-0000"
                value={form.ticket_folio} onChange={e => setForm({ ...form, ticket_folio: e.target.value })} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth size="small" multiline minRows={2} label="Notas" value={form.notas}
                onChange={e => setForm({ ...form, notas: e.target.value })} />
            </Grid>
          </Grid>
          <Alert severity="info" sx={{ mt: 2 }}>
            Queda autorizada cuando tenga nombre, cómo se pronuncia, logo y cliente. Si falta algo se guarda
            igual, como pendiente, y en la lista se ve qué le falta.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Logo en grande */}
      <Dialog open={!!verLogo} onClose={() => setVerLogo(null)} maxWidth="sm">
        <DialogTitle>{verLogo?.marca}</DialogTitle>
        <DialogContent sx={{ bgcolor: '#fff', textAlign: 'center' }}>
          {verLogo?.logo_url && <img src={verLogo.logo_url} alt={verLogo.marca} style={{ maxWidth: '100%', maxHeight: '60vh' }} />}
        </DialogContent>
        <DialogActions><Button onClick={() => setVerLogo(null)}>Cerrar</Button></DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
