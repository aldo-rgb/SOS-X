// ============================================
// PO Box · Precios Preferenciales por Cliente
// Permite fijar el costo (precio de venta) de cada nivel para un
// cliente específico, sobrescribiendo la tarifa global.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, TextField, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, Snackbar, Chip, Select, MenuItem, FormControl, InputAdornment, CircularProgress,
  Divider, List, ListItemButton, ListItemText, Tooltip,
} from '@mui/material';
import {
  Star as StarIcon,
  PersonAdd as PersonAddIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Edit as EditIcon,
} from '@mui/icons-material';

const ORANGE = '#F05A28';

interface ClientRow {
  client_user_id: number;
  full_name: string;
  email: string | null;
  box_id: string | null;
  niveles_personalizados: number;
  updated_at: string;
  asignado_por: string | null;
  asignado_at: string | null;
  ultima_por: string | null;
  ultima_at: string | null;
  veces_modificado: number;
}
interface SearchClient {
  id: number; full_name: string; email: string | null; box_id: string | null; phone: string | null; tiene_tarifa: boolean;
}
interface NivelRow {
  nivel: number;
  cbm_min: number; cbm_max: number | null;
  costo_global: number; tipo_cobro_global: 'fijo' | 'por_unidad'; moneda: string;
  costo_cliente: number | null; tipo_cobro_cliente: 'fijo' | 'por_unidad' | null;
  personalizado: boolean;
}

export default function PoboxClientRatesSection() {
  const token = localStorage.getItem('token');
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Buscador de clientes
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchClient[]>([]);

  // Editor de niveles para un cliente
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorClient, setEditorClient] = useState<{ id: number; name: string; box_id?: string | null } | null>(null);
  const [niveles, setNiveles] = useState<NivelRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { costo: string; tipo_cobro: 'fijo' | 'por_unidad' }>>({});
  const [savingLevels, setSavingLevels] = useState(false);

  const notify = (message: string, severity: 'success' | 'error' = 'success') => setSnackbar({ open: true, message, severity });

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/pobox/client-tarifas`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setClients(d.clients || []); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [API_URL, token]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const doSearch = async () => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/pobox/client-tarifas/search?q=${encodeURIComponent(query.trim())}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setResults(d.clients || []); }
    } catch (e) { console.error(e); }
    finally { setSearching(false); }
  };

  const openEditor = async (id: number, name: string, box_id?: string | null) => {
    setEditorClient({ id, name, box_id });
    setEditorOpen(true);
    setNiveles([]);
    setDrafts({});
    try {
      const res = await fetch(`${API_URL}/api/admin/pobox/client-tarifas/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        const nv: NivelRow[] = d.niveles || [];
        setNiveles(nv);
        const dr: Record<number, { costo: string; tipo_cobro: 'fijo' | 'por_unidad' }> = {};
        nv.forEach((n) => {
          dr[n.nivel] = {
            costo: n.costo_cliente != null ? String(n.costo_cliente) : '',
            tipo_cobro: (n.tipo_cobro_cliente || n.tipo_cobro_global) as 'fijo' | 'por_unidad',
          };
        });
        setDrafts(dr);
      }
    } catch (e) { console.error(e); notify('No se pudieron cargar los niveles', 'error'); }
  };

  const saveLevels = async () => {
    if (!editorClient) return;
    setSavingLevels(true);
    try {
      const payload = {
        niveles: niveles.map((n) => ({
          nivel: n.nivel,
          costo: drafts[n.nivel]?.costo ?? '',
          tipo_cobro: drafts[n.nivel]?.tipo_cobro ?? n.tipo_cobro_global,
        })),
      };
      const res = await fetch(`${API_URL}/api/admin/pobox/client-tarifas/${editorClient.id}`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify(payload),
      });
      if (res.ok) {
        notify('Precio preferencial guardado');
        setEditorOpen(false);
        loadClients();
      } else { notify('Error al guardar', 'error'); }
    } catch (e) { console.error(e); notify('Error al guardar', 'error'); }
    finally { setSavingLevels(false); }
  };

  const removeClient = async (id: number, name: string) => {
    if (!window.confirm(`¿Quitar el precio preferencial de "${name}"? Volverá a pagar la tarifa global.`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/pobox/client-tarifas/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { notify('Cliente revertido a tarifa global'); loadClients(); }
      else notify('Error al eliminar', 'error');
    } catch (e) { console.error(e); notify('Error al eliminar', 'error'); }
  };

  const fmtCbm = (n: NivelRow) => `${Number(n.cbm_min).toFixed(4)} – ${n.cbm_max != null ? Number(n.cbm_max).toFixed(4) : '∞'} m³`;
  const fmtFecha = (s: string | null) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Paper sx={{ p: 3, mb: 3, borderRadius: 2, borderLeft: `4px solid ${ORANGE}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
          <StarIcon sx={{ color: ORANGE }} /> Precios Preferenciales por Cliente
        </Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => { setSearchOpen(true); setQuery(''); setResults([]); }}
          sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64a1e' } }}>
          Asignar a cliente
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Fija el costo de cada nivel para un cliente específico. Cuando este cliente registre paquetes de PO Box,
        se usa su precio en lugar de la tarifa global. Los niveles sin precio propio siguen cobrando el global.
      </Typography>

      {loading ? (
        <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      ) : clients.length === 0 ? (
        <Alert severity="info" variant="outlined">
          Aún no hay clientes con precio preferencial. Usa <strong>“Asignar a cliente”</strong> para configurar uno.
        </Alert>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#faf6f1' }}>
                <TableCell><strong>Cliente</strong></TableCell>
                <TableCell><strong>Box ID</strong></TableCell>
                <TableCell align="center"><strong>Niveles personalizados</strong></TableCell>
                <TableCell><strong>Asignado por</strong></TableCell>
                <TableCell align="center"><strong>Modificaciones</strong></TableCell>
                <TableCell align="center"><strong>Acciones</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.client_user_id} hover>
                  <TableCell>
                    <strong>{c.full_name}</strong>
                    {c.email && <Typography variant="caption" display="block" color="text.secondary">{c.email}</Typography>}
                  </TableCell>
                  <TableCell>{c.box_id || '—'}</TableCell>
                  <TableCell align="center">
                    <Chip size="small" label={`${c.niveles_personalizados} nivel(es)`} sx={{ bgcolor: '#fbe9e0', color: '#a8431a', fontWeight: 600 }} />
                  </TableCell>
                  <TableCell>
                    {c.asignado_por ? (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.asignado_por}</Typography>
                        <Typography variant="caption" color="text.secondary">{fmtFecha(c.asignado_at)}</Typography>
                      </>
                    ) : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell align="center">
                    {c.veces_modificado > 0 ? (
                      <Tooltip title={c.ultima_por ? `Última: ${c.ultima_por} · ${fmtFecha(c.ultima_at)}` : ''}>
                        <Chip size="small" label={`${c.veces_modificado} vez(es)`} sx={{ bgcolor: '#eef2ff', color: '#3538cd', fontWeight: 600 }} />
                      </Tooltip>
                    ) : (
                      <Chip size="small" variant="outlined" label="Sin cambios" sx={{ color: '#9AA0A6' }} />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Editar precios">
                      <IconButton color="primary" onClick={() => openEditor(c.client_user_id, c.full_name, c.box_id)}><EditIcon /></IconButton>
                    </Tooltip>
                    <Tooltip title="Quitar (volver a global)">
                      <IconButton color="error" onClick={() => removeClient(c.client_user_id, c.full_name)}><DeleteIcon /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Buscador de clientes */}
      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SearchIcon /> Buscar cliente
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, mb: 2 }}>
            <TextField autoFocus fullWidth size="small" placeholder="Nombre, correo, Box ID o teléfono"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }} />
            <Button variant="contained" onClick={doSearch} disabled={searching || query.trim().length < 2}>
              {searching ? <CircularProgress size={20} color="inherit" /> : 'Buscar'}
            </Button>
          </Box>
          <Divider />
          <List dense>
            {results.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                Escribe al menos 2 caracteres y presiona Buscar.
              </Typography>
            ) : results.map((r) => (
              <ListItemButton key={r.id} onClick={() => { setSearchOpen(false); openEditor(r.id, r.full_name, r.box_id); }}>
                <ListItemText
                  primary={<span>{r.full_name} {r.tiene_tarifa && <Chip size="small" label="ya tiene precio" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: '#fbe9e0', color: '#a8431a' }} />}</span>}
                  secondary={[r.box_id, r.email, r.phone].filter(Boolean).join(' · ')}
                />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions><Button onClick={() => setSearchOpen(false)}>Cerrar</Button></DialogActions>
      </Dialog>

      {/* Editor de niveles por cliente */}
      <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StarIcon sx={{ color: ORANGE }} /> Precios de {editorClient?.name}
          {editorClient?.box_id && <Chip size="small" label={editorClient.box_id} sx={{ ml: 1 }} />}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
            Deja un nivel <strong>vacío</strong> para que ese nivel use la tarifa global. El precio se maneja en USD (igual que la tarifa global).
          </Typography>
          {niveles.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#faf6f1' }}>
                    <TableCell><strong>Nivel</strong></TableCell>
                    <TableCell><strong>Rango CBM</strong></TableCell>
                    <TableCell align="right"><strong>Costo global</strong></TableCell>
                    <TableCell><strong>Costo cliente (USD)</strong></TableCell>
                    <TableCell><strong>Tipo cobro</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {niveles.map((n) => {
                    const draft = drafts[n.nivel] || { costo: '', tipo_cobro: n.tipo_cobro_global };
                    const custom = draft.costo.trim() !== '';
                    return (
                      <TableRow key={n.nivel} sx={{ bgcolor: custom ? '#fff8f4' : undefined }}>
                        <TableCell>
                          <Chip size="small" label={`Nivel ${n.nivel}`} color={custom ? 'warning' : 'default'} variant={custom ? 'filled' : 'outlined'} />
                        </TableCell>
                        <TableCell><Typography variant="body2">{fmtCbm(n)}</Typography></TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">
                            ${Number(n.costo_global).toFixed(2)} <small>{n.tipo_cobro_global === 'por_unidad' ? '/m³' : 'fijo'}</small>
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ width: 180 }}>
                          <TextField
                            size="small" type="number" placeholder={`global $${Number(n.costo_global).toFixed(2)}`}
                            value={draft.costo}
                            onChange={(e) => setDrafts({ ...drafts, [n.nivel]: { ...draft, costo: e.target.value } })}
                            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                          />
                        </TableCell>
                        <TableCell sx={{ width: 150 }}>
                          <FormControl size="small" fullWidth disabled={!custom}>
                            <Select value={draft.tipo_cobro}
                              onChange={(e) => setDrafts({ ...drafts, [n.nivel]: { ...draft, tipo_cobro: e.target.value as 'fijo' | 'por_unidad' } })}>
                              <MenuItem value="fijo">Precio fijo</MenuItem>
                              <MenuItem value="por_unidad">Por m³</MenuItem>
                            </Select>
                          </FormControl>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditorOpen(false)}>Cancelar</Button>
          <Button variant="contained" startIcon={savingLevels ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={saveLevels} disabled={savingLevels || niveles.length === 0}
            sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d64a1e' } }}>
            Guardar precios
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>{snackbar.message}</Alert>
      </Snackbar>
    </Paper>
  );
}
