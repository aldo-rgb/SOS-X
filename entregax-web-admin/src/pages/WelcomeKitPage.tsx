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
  selected_product_id: number | null;
  selected_product_name: string | null;
  selected_product_photo: string | null;
}

interface KitStats {
  solicitado: number; seleccionado: number; instrucciones: number; por_enviar: number;
  enviado: number; entregado: number; cancelado: number; total: number;
}

const STATUSES: { value: string; label: string; color: 'default' | 'info' | 'warning' | 'primary' | 'success' | 'error' | 'secondary' }[] = [
  { value: 'solicitado', label: 'Solicitado', color: 'info' },
  { value: 'seleccionado', label: 'Regalo seleccionado', color: 'secondary' },
  { value: 'instrucciones', label: 'Con instrucciones', color: 'warning' },
  { value: 'por_enviar', label: 'Por enviar', color: 'primary' },
  { value: 'enviado', label: 'Enviado', color: 'success' },
  { value: 'entregado', label: 'Entregado', color: 'success' },
  { value: 'cancelado', label: 'Cancelado', color: 'error' },
];
const statusInfo = (s: string) => STATUSES.find(x => x.value === s) || { value: s, label: s, color: 'default' as const };


interface KitPhoto { key: string; url: string | null }
interface KitProduct {
  id: number;
  name: string;
  description: string | null;
  video_url: string | null;
  video_key: string | null;
  stock: number;
  photos: KitPhoto[];
  is_active: boolean;
  sort_order: number;
}
const emptyProduct: Partial<KitProduct> = { name: '', description: '', video_url: '', video_key: null, stock: 0, photos: [], is_active: true, sort_order: 0 };

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
  const [uploadingVideo, setUploadingVideo] = useState(false);
  // Buscador de cliente para agregar a la lista
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<Array<{ id: number; full_name: string; box_id: string | null; phone: string | null; email: string | null }>>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [addingClientId, setAddingClientId] = useState<number | null>(null);

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

  // ===== Buscador de cliente =====
  useEffect(() => {
    if (!searchDialogOpen) return;
    if (clientQuery.trim().length < 2) { setClientResults([]); return; }
    const t = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const res = await axios.get(`${API_URL}/admin/welcome-kit/search-client?q=${encodeURIComponent(clientQuery.trim())}`, { headers: { Authorization: `Bearer ${getToken()}` } });
        setClientResults(res.data.data || []);
      } catch { setClientResults([]); } finally { setSearchingClients(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [clientQuery, searchDialogOpen]);

  const addClientToKit = async (c: { id: number; full_name: string; box_id: string | null; phone: string | null; email: string | null }) => {
    setAddingClientId(c.id);
    try {
      await axios.post(`${API_URL}/admin/welcome-kit`, { user_id: c.id, full_name: c.full_name, phone: c.phone, email: c.email, box_id: c.box_id }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setSnackbar({ open: true, message: `${c.full_name} agregado a la lista del kit`, severity: 'success' });
      setSearchDialogOpen(false); setClientQuery(''); setClientResults([]);
      fetchData();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al agregar', severity: 'error' });
    } finally { setAddingClientId(null); }
  };

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

  const uploadProductVideo = async (file: File) => {
    if (!editingProd) return;
    if (!file.type.startsWith('video/')) {
      setSnackbar({ open: true, message: 'El archivo debe ser un video', severity: 'error' });
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'El video no debe pesar más de 60 MB', severity: 'error' });
      return;
    }
    setUploadingVideo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_URL}/admin/welcome-kit/products/upload-video`, fd, {
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'multipart/form-data' },
      });
      // Al subir un video, se usa la key de S3 (se limpia la URL externa).
      setEditingProd(prev => prev ? { ...prev, video_key: res.data.key, video_url: res.data.url } : prev);
      setSnackbar({ open: true, message: 'Video subido', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al subir el video', severity: 'error' });
    } finally { setUploadingVideo(false); }
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
        name: editingProd.name, description: editingProd.description,
        video_url: editingProd.video_key ? null : editingProd.video_url, video_key: editingProd.video_key || null,
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
    { key: 'seleccionado', label: 'Seleccionaron', color: '#7b1fa2' },
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
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setClientQuery(''); setClientResults([]); setSearchDialogOpen(true); }} sx={{ background: 'linear-gradient(90deg, #C1272D 0%, #F05A28 100%)' }}>
              Agregar cliente
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
                <TableCell><strong>Regalo elegido</strong></TableCell>
                <TableCell><strong>Dirección de envío</strong></TableCell>
                <TableCell><strong>Guías</strong></TableCell>
                <TableCell><strong>Estado</strong></TableCell>
                <TableCell align="center"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={40} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><Typography color="text.secondary">No hay solicitudes de kit todavía.</Typography></TableCell></TableRow>
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
                    <TableCell>
                      {r.selected_product_name ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {r.selected_product_photo
                            ? <img src={r.selected_product_photo} alt={r.selected_product_name} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                            : <Box sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎁</Box>}
                          <Typography variant="caption" fontWeight={600}>{r.selected_product_name}</Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.secondary">Sin elegir</Typography>
                      )}
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
      </>)}

      {/* ===== TAB CATÁLOGO DE REGALOS ===== */}
      {tab === 'catalog' && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Estos son los regalos que el cliente podrá elegir. Sube hasta <strong>5 fotos</strong>, define el <strong>stock</strong> disponible, descripción y un <strong>video</strong> opcional.
          </Alert>
          {productsLoading ? (
            <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
          ) : products.length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
              <Inventory2Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">Aún no hay productos. Agrega el primer regalo con "Nuevo producto".</Typography>
            </Paper>
          ) : (
            <Grid container spacing={2}>
              {products.map(p => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={p.id}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', opacity: p.is_active ? 1 : 0.55 }}>
                    <Box sx={{ position: 'relative' }}>
                      <CardMedia component="img" height="160" image={p.photos?.[0]?.url || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22200%22><rect fill=%22%23eee%22 width=%22400%22 height=%22200%22/></svg>'} alt={p.name} sx={{ objectFit: 'cover', bgcolor: '#f5f5f5' }} />
                      <Chip size="small" label={`Stock: ${p.stock}`} color={p.stock > 0 ? 'success' : 'error'} sx={{ position: 'absolute', top: 8, left: 8, fontWeight: 700 }} />
                      {(p.photos?.length || 0) > 1 && <Chip size="small" icon={<PhotoCameraIcon />} label={p.photos.length} sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff' }} />}
                      {!p.is_active && <Chip size="small" label="Inactivo" sx={{ position: 'absolute', bottom: 8, left: 8, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff' }} />}
                    </Box>
                    <CardContent sx={{ flex: 1, pb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>{p.name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description || 'Sin descripción'}</Typography>
                      {p.video_url && <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, color: 'primary.main' }}><VideocamIcon fontSize="small" /> Video</Typography>}
                    </CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pb: 1 }}>
                      <IconButton size="small" onClick={() => { setEditingProd({ ...p, photos: [...(p.photos || [])] }); setProdFormOpen(true); }}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => removeProduct(p.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Buscador de cliente para agregar a la lista del kit */}
      <Dialog open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Agregar cliente al kit</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Escribe el <strong>nombre</strong> o el <strong>número de cliente (Box ID)</strong>. Si lo encontramos, agrégalo a la lista.
          </Typography>
          <TextField
            autoFocus fullWidth size="small"
            placeholder="Nombre, Box ID, teléfono o correo…"
            value={clientQuery}
            onChange={e => setClientQuery(e.target.value)}
            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>), endAdornment: searchingClients ? <CircularProgress size={18} /> : null }}
          />
          <Box sx={{ mt: 2 }}>
            {clientQuery.trim().length < 2 ? (
              <Typography variant="caption" color="text.secondary">Escribe al menos 2 caracteres.</Typography>
            ) : clientResults.length === 0 && !searchingClients ? (
              <Typography variant="caption" color="text.secondary">Sin resultados para "{clientQuery}".</Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 340 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Cliente</strong></TableCell>
                      <TableCell><strong>Box ID</strong></TableCell>
                      <TableCell><strong>Contacto</strong></TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {clientResults.map(c => (
                      <TableRow key={c.id} hover>
                        <TableCell>{c.full_name}</TableCell>
                        <TableCell>{c.box_id ? <Chip size="small" label={c.box_id} variant="outlined" color="primary" /> : '—'}</TableCell>
                        <TableCell>
                          <Typography variant="caption" display="block">{c.phone || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary">{c.email || ''}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="contained" startIcon={addingClientId === c.id ? <CircularProgress size={14} color="inherit" /> : <AddIcon />} disabled={addingClientId !== null} onClick={() => addClientToKit(c)}>Agregar</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchDialogOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Formulario de producto */}
      <Dialog open={prodFormOpen} onClose={() => !savingProd && setProdFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingProd?.id ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        <DialogContent dividers>
          {editingProd && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField label="Nombre del producto *" value={editingProd.name || ''} onChange={e => setEditingProd({ ...editingProd, name: e.target.value })} size="small" fullWidth />
              <TextField label="Descripción" value={editingProd.description || ''} onChange={e => setEditingProd({ ...editingProd, description: e.target.value })} size="small" fullWidth multiline minRows={3} />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Cantidad en stock" type="number" value={editingProd.stock ?? 0} onChange={e => setEditingProd({ ...editingProd, stock: Math.max(0, Number(e.target.value) || 0) })} size="small" sx={{ width: 160 }} />
                <FormControlLabel control={<Switch checked={editingProd.is_active !== false} onChange={e => setEditingProd({ ...editingProd, is_active: e.target.checked })} />} label="Activo (visible)" />
              </Box>
              {/* Video: subir directo o pegar URL externa */}
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}><VideocamIcon fontSize="small" /> Video del producto (opcional)</Typography>
                {editingProd.video_key ? (
                  <Box sx={{ mb: 1 }}>
                    <video src={editingProd.video_url || ''} controls style={{ width: '100%', maxHeight: 200, borderRadius: 8, background: '#000' }} />
                    <Button size="small" color="error" onClick={() => setEditingProd({ ...editingProd, video_key: null, video_url: '' })} disabled={savingProd || uploadingVideo} sx={{ mt: 0.5 }}>Quitar video</Button>
                  </Box>
                ) : (
                  <>
                    <Button component="label" size="small" variant="outlined" startIcon={<VideocamIcon />} disabled={uploadingVideo || savingProd} sx={{ mb: 1 }}>
                      {uploadingVideo ? 'Subiendo…' : 'Subir video (recomendado ≤15s)'}
                      <input type="file" hidden accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadProductVideo(f); (e.target as HTMLInputElement).value = ''; }} />
                    </Button>
                    <TextField label="…o pega una URL (YouTube, etc.)" value={editingProd.video_url || ''} onChange={e => setEditingProd({ ...editingProd, video_url: e.target.value })} size="small" fullWidth placeholder="https://youtube.com/..." />
                  </>
                )}
              </Box>

              <Box>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Fotos ({(editingProd.photos?.length || 0)}/5)</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {(editingProd.photos || []).map(ph => (
                    <Box key={ph.key} sx={{ position: 'relative', width: 88, height: 88, borderRadius: 1, overflow: 'hidden', border: '1px solid #ddd' }}>
                      <img src={ph.url || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <IconButton size="small" onClick={() => removeProductPhoto(ph.key)} sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', p: '2px', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
                    </Box>
                  ))}
                  {(editingProd.photos?.length || 0) < 5 && (
                    <Button component="label" variant="outlined" disabled={uploadingPhoto} sx={{ width: 88, height: 88, minWidth: 88, flexDirection: 'column', gap: 0.5 }}>
                      {uploadingPhoto ? <CircularProgress size={20} /> : <><PhotoCameraIcon /><Typography variant="caption">Subir</Typography></>}
                      <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) uploadProductPhoto(f); (e.target as HTMLInputElement).value = ''; }} />
                    </Button>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">JPG, PNG o WEBP. La primera foto es la portada.</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProdFormOpen(false)} disabled={savingProd}>Cancelar</Button>
          <Button variant="contained" onClick={saveProduct} disabled={savingProd || uploadingPhoto || uploadingVideo || !String(editingProd?.name || '').trim()}>{savingProd ? 'Guardando…' : 'Guardar'}</Button>
        </DialogActions>
      </Dialog>

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
