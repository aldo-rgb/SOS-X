// ============================================================================
// 🎁 CONTROL DE KIT DE BIENVENIDA
// ============================================================================
// Gestiona los kits de bienvenida: quién lo solicitó, a dónde enviarlo y el
// estado del envío. Los detalles del proceso (regalo in-app, guía simulada USA,
// envío real desde CEDIS MTY con Estafeta por cobrar) se irán completando.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, IconButton, Button, TextField, InputAdornment, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent,
  DialogActions, Snackbar, Alert, Tooltip, Grid, Tabs, Tab, Card, CardMedia,
  CardContent, Switch, FormControlLabel,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import VideocamIcon from '@mui/icons-material/Videocam';
import CloseIcon from '@mui/icons-material/Close';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';

interface KitRequest {
  id: number;
  user_id: number | null;
  lead_key: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  box_id: string | null;
  ship_name: string | null;
  ship_phone: string | null;
  ship_address: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zip: string | null;
  ship_references: string | null;
  status: string;
  usa_tracking: string | null;
  estafeta_tracking: string | null;
  notes: string | null;
  requested_at: string;
  updated_at: string;
}

interface KitStats {
  solicitado: number; instrucciones: number; por_enviar: number;
  enviado: number; entregado: number; cancelado: number; total: number;
}

const STATUSES: { value: string; label: string; color: 'default' | 'info' | 'warning' | 'primary' | 'success' | 'error' }[] = [
  { value: 'solicitado', label: 'Solicitado', color: 'info' },
  { value: 'instrucciones', label: 'Con instrucciones', color: 'warning' },
  { value: 'por_enviar', label: 'Por enviar', color: 'primary' },
  { value: 'enviado', label: 'Enviado', color: 'success' },
  { value: 'entregado', label: 'Entregado', color: 'success' },
  { value: 'cancelado', label: 'Cancelado', color: 'error' },
];
const statusInfo = (s: string) => STATUSES.find(x => x.value === s) || { value: s, label: s, color: 'default' as const };

const emptyForm: Partial<KitRequest> = {
  full_name: '', phone: '', email: '', box_id: '',
  ship_name: '', ship_phone: '', ship_address: '', ship_city: '', ship_state: '', ship_zip: '', ship_references: '',
  status: 'solicitado', usa_tracking: '', estafeta_tracking: '', notes: '',
};

interface KitPhoto { key: string; url: string | null }
interface KitProduct {
  id: number;
  name: string;
  description: string | null;
  video_url: string | null;
  stock: number;
  photos: KitPhoto[];
  is_active: boolean;
  sort_order: number;
}
const emptyProduct: Partial<KitProduct> = { name: '', description: '', video_url: '', stock: 0, photos: [], is_active: true, sort_order: 0 };

export default function WelcomeKitPage() {
  const [tab, setTab] = useState<'requests' | 'catalog'>('requests');
  const [rows, setRows] = useState<KitRequest[]>([]);
  const [stats, setStats] = useState<KitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<KitRequest> | null>(null);
  const [saving, setSaving] = useState(false);
  // Catálogo de regalos
  const [products, setProducts] = useState<KitProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [prodFormOpen, setProdFormOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Partial<KitProduct> | null>(null);
  const [savingProd, setSavingProd] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (search) params.append('search', search);
      const res = await axios.get(`${API_URL}/admin/welcome-kit?${params.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setRows(res.data.data || []);
      setStats(res.data.stats || null);
    } catch {
      setSnackbar({ open: true, message: 'Error al cargar los kits', severity: 'error' });
    } finally { setLoading(false); }
  }, [statusFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ===== Catálogo de regalos =====
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/welcome-kit/products`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setProducts(res.data.data || []);
    } catch {
      setSnackbar({ open: true, message: 'Error al cargar el catálogo', severity: 'error' });
    } finally { setProductsLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'catalog') fetchProducts(); }, [tab, fetchProducts]);

  const uploadProductPhoto = async (file: File) => {
    if (!editingProd) return;
    if ((editingProd.photos?.length || 0) >= 5) {
      setSnackbar({ open: true, message: 'Máximo 5 fotos por producto', severity: 'error' });
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setSnackbar({ open: true, message: 'La imagen debe ser JPG, PNG o WEBP', severity: 'error' });
      return;
    }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/admin/welcome-kit/products/upload-photo`, fd, {
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'multipart/form-data' },
      });
      setEditingProd(prev => prev ? { ...prev, photos: [...(prev.photos || []), { key: res.data.key, url: res.data.url }] } : prev);
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al subir la foto', severity: 'error' });
    } finally { setUploadingPhoto(false); }
  };

  const removeProductPhoto = (key: string) => {
    setEditingProd(prev => prev ? { ...prev, photos: (prev.photos || []).filter(p => p.key !== key) } : prev);
  };

  const saveProduct = async () => {
    if (!editingProd) return;
    if (!String(editingProd.name || '').trim()) {
      setSnackbar({ open: true, message: 'Falta el nombre del producto', severity: 'error' });
      return;
    }
    setSavingProd(true);
    try {
      const payload = {
        name: editingProd.name, description: editingProd.description, video_url: editingProd.video_url,
        stock: editingProd.stock, is_active: editingProd.is_active !== false, sort_order: editingProd.sort_order,
        photos: (editingProd.photos || []).map(p => p.key),
      };
      if (editingProd.id) await axios.put(`${API_URL}/admin/welcome-kit/products/${editingProd.id}`, payload, { headers: { Authorization: `Bearer ${getToken()}` } });
      else await axios.post(`${API_URL}/admin/welcome-kit/products`, payload, { headers: { Authorization: `Bearer ${getToken()}` } });
      setProdFormOpen(false); setEditingProd(null);
      fetchProducts();
      setSnackbar({ open: true, message: 'Producto guardado', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al guardar', severity: 'error' });
    } finally { setSavingProd(false); }
  };

  const removeProduct = async (id: number) => {
    if (!window.confirm('¿Eliminar este producto del catálogo?')) return;
    try {
      await axios.delete(`${API_URL}/admin/welcome-kit/products/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      fetchProducts();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al eliminar', severity: 'error' });
    }
  };

  const changeStatus = async (id: number, status: string) => {
    try {
      await axios.put(`${API_URL}/admin/welcome-kit/${id}`, { status }, { headers: { Authorization: `Bearer ${getToken()}` } });
      fetchData();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al actualizar', severity: 'error' });
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!String(editing.full_name || '').trim()) {
      setSnackbar({ open: true, message: 'Falta el nombre', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await axios.put(`${API_URL}/admin/welcome-kit/${editing.id}`, editing, { headers: { Authorization: `Bearer ${getToken()}` } });
      } else {
        await axios.post(`${API_URL}/admin/welcome-kit`, editing, { headers: { Authorization: `Bearer ${getToken()}` } });
      }
      setFormOpen(false); setEditing(null);
      fetchData();
      setSnackbar({ open: true, message: 'Guardado', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al guardar', severity: 'error' });
    } finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!window.confirm('¿Eliminar este registro de kit?')) return;
    try {
      await axios.delete(`${API_URL}/admin/welcome-kit/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      fetchData();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al eliminar', severity: 'error' });
    }
  };

  const shipSummary = (r: KitRequest) => {
    const parts = [r.ship_address, r.ship_city, r.ship_state, r.ship_zip].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  };

  const statCards: { key: keyof KitStats; label: string; color: string }[] = [
    { key: 'solicitado', label: 'Solicitados', color: '#0288d1' },
    { key: 'instrucciones', label: 'Con instrucciones', color: '#ed6c02' },
    { key: 'por_enviar', label: 'Por enviar', color: '#7b1fa2' },
    { key: 'enviado', label: 'Enviados', color: '#2e7d32' },
    { key: 'entregado', label: 'Entregados', color: '#1b5e20' },
    { key: 'cancelado', label: 'Cancelados', color: '#c62828' },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CardGiftcardIcon color="warning" /> Control de Kit de Bienvenida
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestiona quién solicitó su kit (báscula + PO Box) y a dónde enviarlo.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {tab === 'requests' ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing({ ...emptyForm }); setFormOpen(true); }} sx={{ background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)' }}>
              Nueva solicitud
            </Button>
          ) : (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditingProd({ ...emptyProduct }); setProdFormOpen(true); }} sx={{ background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)' }}>
              Nuevo producto
            </Button>
          )}
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => tab === 'requests' ? fetchData() : fetchProducts()}>Actualizar</Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} indicatorColor="primary" textColor="primary">
          <Tab value="requests" icon={<CardGiftcardIcon fontSize="small" />} iconPosition="start" label="Solicitudes" />
          <Tab value="catalog" icon={<Inventory2Icon fontSize="small" />} iconPosition="start" label="Catálogo de regalos" />
        </Tabs>
      </Paper>

      {/* ===== TAB SOLICITUDES ===== */}
      {tab === 'requests' && (<>
      {/* Stats */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {statCards.map(c => (
            <Grid size={{ xs: 6, sm: 4, md: 2 }} key={c.key}>
              <Paper sx={{ p: 2, textAlign: 'center', borderLeft: `4px solid ${c.color}` }}>
                <Typography variant="h5" fontWeight={700} sx={{ color: c.color }}>{stats[c.key]}</Typography>
                <Typography variant="caption" color="text.secondary">{c.label}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" placeholder="Buscar por nombre, teléfono, correo o Box ID" value={search} onChange={e => setSearch(e.target.value)} sx={{ minWidth: 320 }}
            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>) }} />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Estado</InputLabel>
            <Select value={statusFilter} label="Estado" onChange={e => setStatusFilter(e.target.value)}>
              <MenuItem value="all">Todos</MenuItem>
              {STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {/* Tabla */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.03)' }}>
                <TableCell><strong>Solicitante</strong></TableCell>
                <TableCell><strong>Contacto</strong></TableCell>
                <TableCell><strong>Dirección de envío</strong></TableCell>
                <TableCell><strong>Guías</strong></TableCell>
                <TableCell><strong>Estado</strong></TableCell>
                <TableCell align="center"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={40} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><Typography color="text.secondary">No hay solicitudes de kit todavía.</Typography></TableCell></TableRow>
              ) : rows.map(r => {
                const ship = shipSummary(r);
                return (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{r.full_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.box_id ? `${r.box_id} · ` : ''}{new Date(r.requested_at).toLocaleDateString('es-MX')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" display="block">{r.phone || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.email || ''}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      {ship ? (
                        <Box>
                          <Typography variant="caption" display="block">{r.ship_name || r.full_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{ship}</Typography>
                        </Box>
                      ) : (
                        <Chip size="small" label="Sin instrucciones" variant="outlined" color="warning" />
                      )}
                    </TableCell>
                    <TableCell>
                      {r.usa_tracking && <Typography variant="caption" display="block">🇺🇸 {r.usa_tracking}</Typography>}
                      {r.estafeta_tracking && <Typography variant="caption" display="block">📦 {r.estafeta_tracking}</Typography>}
                      {!r.usa_tracking && !r.estafeta_tracking && <Typography variant="caption" color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" variant="standard" sx={{ minWidth: 130 }}>
                        <Select
                          value={r.status}
                          onChange={e => changeStatus(r.id, e.target.value)}
                          renderValue={(v) => <Chip size="small" color={statusInfo(String(v)).color} label={statusInfo(String(v)).label} />}
                          disableUnderline
                        >
                          {STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Editar / instrucciones de envío">
                        <IconButton size="small" onClick={() => { setEditing({ ...r }); setFormOpen(true); }}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton size="small" color="error" onClick={() => remove(r.id)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Formulario */}
      <Dialog open={formOpen} onClose={() => !saving && setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing?.id ? 'Editar kit de bienvenida' : 'Nuevo kit de bienvenida'}</DialogTitle>
        <DialogContent dividers>
          {editing && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Typography variant="body2" fontWeight={700}>Solicitante</Typography>
              <TextField label="Nombre completo *" value={editing.full_name || ''} onChange={e => setEditing({ ...editing, full_name: e.target.value })} size="small" fullWidth />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Teléfono" value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} size="small" fullWidth />
                <TextField label="Email" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} size="small" fullWidth />
              </Box>
              <TextField label="Box ID" value={editing.box_id || ''} onChange={e => setEditing({ ...editing, box_id: e.target.value })} size="small" sx={{ maxWidth: 200 }} />

              <Typography variant="body2" fontWeight={700} sx={{ mt: 1 }}>Instrucciones de envío</Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Nombre de quien recibe" value={editing.ship_name || ''} onChange={e => setEditing({ ...editing, ship_name: e.target.value })} size="small" fullWidth />
                <TextField label="Teléfono de contacto" value={editing.ship_phone || ''} onChange={e => setEditing({ ...editing, ship_phone: e.target.value })} size="small" fullWidth />
              </Box>
              <TextField label="Dirección (calle y número)" value={editing.ship_address || ''} onChange={e => setEditing({ ...editing, ship_address: e.target.value })} size="small" fullWidth />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Ciudad" value={editing.ship_city || ''} onChange={e => setEditing({ ...editing, ship_city: e.target.value })} size="small" fullWidth />
                <TextField label="Estado" value={editing.ship_state || ''} onChange={e => setEditing({ ...editing, ship_state: e.target.value })} size="small" fullWidth />
                <TextField label="C.P." value={editing.ship_zip || ''} onChange={e => setEditing({ ...editing, ship_zip: e.target.value })} size="small" sx={{ maxWidth: 120 }} />
              </Box>
              <TextField label="Referencias" value={editing.ship_references || ''} onChange={e => setEditing({ ...editing, ship_references: e.target.value })} size="small" fullWidth multiline minRows={2} />

              <Typography variant="body2" fontWeight={700} sx={{ mt: 1 }}>Logística</Typography>
              <FormControl size="small" sx={{ maxWidth: 220 }}>
                <InputLabel>Estado</InputLabel>
                <Select value={editing.status || 'solicitado'} label="Estado" onChange={e => setEditing({ ...editing, status: e.target.value })}>
                  {STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                </Select>
              </FormControl>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Guía simulada USA" value={editing.usa_tracking || ''} onChange={e => setEditing({ ...editing, usa_tracking: e.target.value })} size="small" fullWidth />
                <TextField label="Guía Estafeta (real)" value={editing.estafeta_tracking || ''} onChange={e => setEditing({ ...editing, estafeta_tracking: e.target.value })} size="small" fullWidth />
              </Box>
              <TextField label="Notas" value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} size="small" fullWidth multiline minRows={2} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={save} disabled={saving || !String(editing?.full_name || '').trim()}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
