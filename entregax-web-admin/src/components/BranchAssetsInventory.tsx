/**
 * BranchAssetsInventory.tsx
 *
 * Inventario Global de Activos por Sucursal — UI de admin.
 *
 * Permite gestionar el patrimonio de cada CEDIS / mostrador:
 *   - Lista filtrable por sucursal / categoría / estado / búsqueda
 *   - Botón "Agregar activo" abre dialog para alta/edición
 *   - Cada fila muestra miniatura, SKU, categoría, marca/modelo, S/N,
 *     status (chip color-coded), responsable, sucursal
 *   - Acción "Imprimir QR" genera etiqueta para pegar al equipo —
 *     el QR apunta a /asset/<id> donde se ve la ficha técnica
 *
 * Endpoints:
 *   GET /admin/branch-assets[?branch_id&category&status&q]
 *   POST /admin/branch-assets
 *   PUT /admin/branch-assets/:id
 *   DELETE /admin/branch-assets/:id
 *   POST /admin/branch-assets/upload    { dataUrl, kind }
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Box, Paper, Typography, Button, IconButton, TextField, MenuItem,
  Chip, Avatar, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Tooltip, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import PrintIcon from '@mui/icons-material/Print';
import QRCode from 'react-qr-code';
import api from '../services/api';

interface Branch { id: number; name: string; code: string; }
interface User { id: number; full_name: string; email: string; role: string; }

interface Asset {
  id: number;
  sku: string;
  category: string;
  branch_id: number | null;
  branch_name?: string;
  branch_code?: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
  assigned_to_user_id: number | null;
  assigned_to_name?: string | null;
  assigned_to_email?: string | null;
  acquisition_date: string | null;
  acquisition_cost: string | null;
  photo_url: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = [
  'Equipo de Cómputo',
  'Mobiliario',
  'Periféricos',
  'Telefonía',
  'Vehículos',
  'Otros',
];

const STATUSES: { value: string; label: string; color: 'success' | 'warning' | 'error' | 'default' | 'info' }[] = [
  { value: 'nuevo',         label: 'Nuevo',          color: 'success' },
  { value: 'excelente',     label: 'Excelente',      color: 'success' },
  { value: 'desgastado',    label: 'Desgastado',     color: 'warning' },
  { value: 'en_reparacion', label: 'En Reparación',  color: 'info' },
  { value: 'de_baja',       label: 'De Baja',        color: 'error' },
];

const statusMeta = (s: string) => STATUSES.find(x => x.value === s) || { label: s, color: 'default' as const };

interface Props {
  branches: Branch[];
  users: User[];
}

export default function BranchAssetsInventory({ branches, users }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filterBranch, setFilterBranch] = useState<number | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog crear/editar
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);

  // Dialog QR
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filterBranch !== 'all') params.branch_id = String(filterBranch);
      if (filterCategory !== 'all') params.category = filterCategory;
      if (filterStatus !== 'all') params.status = filterStatus;
      if (searchTerm.trim()) params.q = searchTerm.trim();
      const r = await api.get('/admin/branch-assets', { params });
      setAssets(Array.isArray(r.data) ? r.data : []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'No se pudo cargar el inventario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterBranch, filterCategory, filterStatus]);

  // Búsqueda con debounce
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(load, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    // eslint-disable-next-line
  }, [searchTerm]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (a: Asset) => {
    setEditing(a);
    setDialogOpen(true);
  };
  const handleDelete = async (a: Asset) => {
    if (!confirm(`¿Eliminar el activo ${a.sku}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/admin/branch-assets/${a.id}`);
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'No se pudo eliminar');
    }
  };

  const totalCost = useMemo(
    () => assets.reduce((s, a) => s + (parseFloat(a.acquisition_cost || '0') || 0), 0),
    [assets]
  );

  return (
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight="bold">📦 Inventario de Activos</Typography>
          <Typography variant="caption" color="text.secondary">
            {assets.length} activo{assets.length === 1 ? '' : 's'} · Valor total adquisición: ${totalCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refrescar">
            <IconButton onClick={load}><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d1f' } }}>
            Agregar activo
          </Button>
        </Box>
      </Box>

      {/* Filtros */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
        <TextField
          size="small" select fullWidth label="Sucursal"
          value={filterBranch}
          onChange={(e) => setFilterBranch(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <MenuItem value="all">Todas las sucursales</MenuItem>
          {branches.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
        </TextField>
        <TextField
          size="small" select fullWidth label="Categoría"
          value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
        >
          <MenuItem value="all">Todas</MenuItem>
          {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <TextField
          size="small" select fullWidth label="Estado"
          value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
        >
          <MenuItem value="all">Todos</MenuItem>
          {STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
        <TextField
          size="small" fullWidth placeholder="Buscar SKU, marca, modelo o S/N…"
          value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ color: '#999', mr: 1 }} /> }}
        />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell></TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Categoría</TableCell>
              <TableCell>Marca / Modelo</TableCell>
              <TableCell>S/N</TableCell>
              <TableCell>Sucursal</TableCell>
              <TableCell>Responsable</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="right">Costo</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} align="center" sx={{ py: 6 }}><CircularProgress /></TableCell></TableRow>
            ) : assets.length === 0 ? (
              <TableRow><TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                <Typography color="text.secondary">Sin activos registrados con esos filtros</Typography>
              </TableCell></TableRow>
            ) : assets.map(a => {
              const sm = statusMeta(a.status);
              return (
                <TableRow key={a.id} hover>
                  <TableCell>
                    <Avatar
                      src={a.photo_url || undefined}
                      variant="rounded"
                      sx={{ width: 40, height: 40, bgcolor: '#FFF3E0', color: '#F05A28', fontSize: 14 }}
                    >
                      {a.sku.slice(0, 2)}
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#F05A28' }}>
                      {a.sku}
                    </Typography>
                  </TableCell>
                  <TableCell>{a.category}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{a.brand || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">{a.model || ''}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{a.serial_number || '—'}</TableCell>
                  <TableCell>{a.branch_name || <span style={{ color: '#999' }}>—</span>}</TableCell>
                  <TableCell>
                    {a.assigned_to_name ? (
                      <>
                        <Typography variant="body2">{a.assigned_to_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{a.assigned_to_email}</Typography>
                      </>
                    ) : <span style={{ color: '#999' }}>—</span>}
                  </TableCell>
                  <TableCell><Chip size="small" label={sm.label} color={sm.color} /></TableCell>
                  <TableCell align="right">
                    {a.acquisition_cost
                      ? `$${Number(a.acquisition_cost).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                      : <span style={{ color: '#999' }}>—</span>}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="QR / Etiqueta">
                      <IconButton size="small" onClick={() => setQrAsset(a)}><QrCode2Icon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => openEdit(a)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" onClick={() => handleDelete(a)}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {dialogOpen && (
        <AssetDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={() => { setDialogOpen(false); load(); }}
          editing={editing}
          branches={branches}
          users={users}
        />
      )}

      {qrAsset && (
        <QrDialog asset={qrAsset} onClose={() => setQrAsset(null)} />
      )}
    </Paper>
  );
}

// ====================================================================
//  AssetDialog — crear / editar
// ====================================================================

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Asset | null;
  branches: Branch[];
  users: User[];
}

function AssetDialog({ open, onClose, onSaved, editing, branches, users }: DialogProps) {
  const [form, setForm] = useState({
    sku: editing?.sku || '',
    category: editing?.category || CATEGORIES[0],
    branch_id: editing?.branch_id || (branches[0]?.id ?? ''),
    brand: editing?.brand || '',
    model: editing?.model || '',
    serial_number: editing?.serial_number || '',
    status: editing?.status || 'nuevo',
    assigned_to_user_id: editing?.assigned_to_user_id || '',
    acquisition_date: editing?.acquisition_date?.slice(0, 10) || '',
    acquisition_cost: editing?.acquisition_cost || '',
    photo_url: editing?.photo_url || '',
    invoice_url: editing?.invoice_url || '',
    notes: editing?.notes || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<null | 'photo' | 'invoice'>(null);

  const set = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const uploadFile = async (kind: 'photo' | 'invoice', file: File) => {
    setUploadingKind(kind);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await api.post('/admin/branch-assets/upload', { dataUrl, kind });
      if (r.data?.url) {
        set(kind === 'photo' ? 'photo_url' : 'invoice_url', r.data.url);
      }
    } catch (e: any) {
      alert(e?.response?.data?.error || 'No se pudo subir el archivo');
    } finally {
      setUploadingKind(null);
    }
  };

  const submit = async () => {
    setErr(null);
    if (!form.sku.trim()) { setErr('SKU es requerido'); return; }
    if (!form.category) { setErr('Categoría es requerida'); return; }
    setSubmitting(true);
    try {
      const body = {
        sku: form.sku.trim().toUpperCase(),
        category: form.category,
        branch_id: form.branch_id || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serial_number: form.serial_number.trim() || null,
        status: form.status,
        assigned_to_user_id: form.assigned_to_user_id || null,
        acquisition_date: form.acquisition_date || null,
        acquisition_cost: form.acquisition_cost === '' ? null : Number(form.acquisition_cost),
        photo_url: form.photo_url || null,
        invoice_url: form.invoice_url || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await api.put(`/admin/branch-assets/${editing.id}`, body);
      } else {
        await api.post('/admin/branch-assets', body);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{editing ? 'Editar activo' : 'Nuevo activo'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
          <TextField
            label="SKU *" value={form.sku}
            onChange={(e) => set('sku', e.target.value.toUpperCase())}
            placeholder="MTY-SC-001" fullWidth
            helperText="Código interno único. Ej. MTY-SC-001"
          />
          <TextField
            label="Categoría *" select value={form.category}
            onChange={(e) => set('category', e.target.value)} fullWidth
          >
            {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField
            label="Sucursal" select value={form.branch_id || ''}
            onChange={(e) => set('branch_id', e.target.value ? Number(e.target.value) : '')} fullWidth
          >
            <MenuItem value="">— Sin sucursal —</MenuItem>
            {branches.map(b => <MenuItem key={b.id} value={b.id}>{b.name} ({b.code})</MenuItem>)}
          </TextField>
          <TextField
            label="Estado" select value={form.status}
            onChange={(e) => set('status', e.target.value)} fullWidth
          >
            {STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
          </TextField>
          <TextField label="Marca" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Dell, Zebra, Lenovo…" fullWidth />
          <TextField label="Modelo" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Latitude 5520" fullWidth />
          <TextField label="Número de Serie (S/N)" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} placeholder="Crucial para garantías" fullWidth />
          <TextField
            label="Responsable / Empleado asignado" select value={form.assigned_to_user_id || ''}
            onChange={(e) => set('assigned_to_user_id', e.target.value ? Number(e.target.value) : '')} fullWidth
          >
            <MenuItem value="">— Sin asignar —</MenuItem>
            {users.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name} ({u.role})</MenuItem>)}
          </TextField>
          <TextField
            label="Fecha de adquisición" type="date" InputLabelProps={{ shrink: true }}
            value={form.acquisition_date} onChange={(e) => set('acquisition_date', e.target.value)} fullWidth
          />
          <TextField
            label="Costo de adquisición (MXN)" type="number" inputProps={{ step: '0.01', min: '0' }}
            value={form.acquisition_cost} onChange={(e) => set('acquisition_cost', e.target.value)} fullWidth
          />

          <Box>
            <Typography variant="caption" color="text.secondary">Foto del equipo</Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              {form.photo_url && <Avatar src={form.photo_url} variant="rounded" sx={{ width: 56, height: 56 }} />}
              <Button component="label" variant="outlined" disabled={uploadingKind === 'photo'} size="small">
                {uploadingKind === 'photo' ? 'Subiendo…' : (form.photo_url ? 'Reemplazar foto' : 'Subir foto')}
                <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadFile('photo', e.target.files[0])} />
              </Button>
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Factura de compra (PDF)</Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              {form.invoice_url && (
                <Button size="small" component="a" href={form.invoice_url} target="_blank">Ver actual</Button>
              )}
              <Button component="label" variant="outlined" disabled={uploadingKind === 'invoice'} size="small">
                {uploadingKind === 'invoice' ? 'Subiendo…' : (form.invoice_url ? 'Reemplazar factura' : 'Subir PDF')}
                <input hidden type="file" accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && uploadFile('invoice', e.target.files[0])} />
              </Button>
            </Box>
          </Box>

          <TextField
            label="Notas" value={form.notes} onChange={(e) => set('notes', e.target.value)}
            multiline minRows={2} sx={{ gridColumn: { sm: '1 / span 2' } }}
            placeholder="Observaciones, accesorios incluidos, garantía, etc."
          />
        </Box>
        {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={submitting} sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d1f' } }}>
          {submitting ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Crear activo')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ====================================================================
//  QrDialog — vista para imprimir etiqueta con QR
// ====================================================================

function QrDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  // URL que abre la ficha pública al escanear
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/asset/${asset.id}`;

  const print = () => {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    // Generamos un HTML mínimo con el SVG del QR vía rerender — la
    // forma más robusta es serializar el SVG actual del DOM.
    const svg = document.getElementById(`qr-svg-${asset.id}`);
    const svgHtml = svg ? new XMLSerializer().serializeToString(svg) : '';
    w.document.write(`<!DOCTYPE html><html><head><title>Etiqueta ${asset.sku}</title>
      <style>
        @page { size: 80mm 100mm; margin: 4mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; text-align: center; margin: 0; padding: 8px; }
        .sku { font-family: monospace; font-weight: 900; font-size: 18px; color: #F05A28; margin: 6px 0 2px; letter-spacing: 1px; }
        .brand { font-size: 11px; color: #333; }
        .branch { font-size: 9px; color: #777; margin-top: 6px; letter-spacing: 1px; text-transform: uppercase; }
        .qr { margin: 8px auto; }
        .qr svg { width: 60mm; height: 60mm; }
      </style>
      </head><body>
        <div class="branch">EntregaX · ${asset.branch_code || ''} ${asset.branch_name || ''}</div>
        <div class="sku">${asset.sku}</div>
        <div class="brand">${[asset.brand, asset.model].filter(Boolean).join(' · ')}</div>
        <div class="qr">${svgHtml}</div>
        <div class="brand">Escanea para ver la ficha del equipo</div>
        <script>window.onload=()=>setTimeout(()=>{window.print();window.close();},300);</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, textAlign: 'center' }}>Etiqueta QR</DialogTitle>
      <DialogContent>
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1, fontWeight: 700 }}>
            {asset.branch_code || '—'} · {asset.branch_name || ''}
          </Typography>
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 22, color: '#F05A28', mt: 1 }}>
            {asset.sku}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: '#444' }}>
            {[asset.brand, asset.model].filter(Boolean).join(' · ') || '—'}
          </Typography>
          <Box sx={{ display: 'inline-block', mt: 2, p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #eee' }}>
            <QRCode id={`qr-svg-${asset.id}`} value={url} size={200} />
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#777', wordBreak: 'break-all' }}>
            {url}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={print} sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#d94d1f' } }}>
          Imprimir etiqueta
        </Button>
      </DialogActions>
    </Dialog>
  );
}
