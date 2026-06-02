import { useState, useCallback, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Grid, IconButton,
  Divider, CircularProgress, Autocomplete, Chip,
  FormControlLabel, Switch, Alert, Select,
  MenuItem, FormControl, InputLabel, Paper
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import CalculateIcon from '@mui/icons-material/Calculate';
import api from '../services/api';

const ORANGE = '#F05A28';

interface BoxBlock {
  largo: string;
  ancho: string;
  alto: string;
  cantidad: string;
}

interface Client {
  id: number;
  fullName: string;
  email: string;
  boxId: string;
}

interface Address {
  id: number;
  full_address: string;
  alias?: string;
  is_default?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const emptyBlock = (): BoxBlock => ({ largo: '', ancho: '', alto: '', cantidad: '1' });

const cbmOf = (b: BoxBlock) => {
  const l = parseFloat(b.largo) || 0;
  const a = parseFloat(b.ancho) || 0;
  const h = parseFloat(b.alto) || 0;
  const q = parseInt(b.cantidad) || 0;
  return (l * a * h) / 1_000_000 * q;
};

export default function AdvisorQuoteRequestModal({ open, onClose, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Clientes
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Direcciones del cliente
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [customDestination, setCustomDestination] = useState('');

  // Cajas
  const [blocks, setBlocks] = useState<BoxBlock[]>([emptyBlock()]);

  // Producto
  const [productDescription, setProductDescription] = useState('');
  const [hasBrand, setHasBrand] = useState(false);
  const [hasBrandLetter, setHasBrandLetter] = useState(false);

  // Proveedor
  const [originAddress, setOriginAddress] = useState('');

  // Valor
  const [merchandiseValue, setMerchandiseValue] = useState('');

  // Archivos
  const [images, setImages] = useState<File[]>([]);
  const [docs, setDocs] = useState<File[]>([]);
  const imgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const res = await api.get('/advisor/clients');
      setClients(res.data?.clients || res.data || []);
    } catch { setClients([]); }
    finally { setClientsLoading(false); }
  }, []);

  const loadAddresses = useCallback(async (clientId: number) => {
    setAddressesLoading(true);
    try {
      const res = await api.get(`/advisor/clients/${clientId}/addresses`);
      setAddresses(res.data?.addresses || res.data || []);
    } catch { setAddresses([]); }
    finally { setAddressesLoading(false); }
  }, []);

  const handleClientChange = (c: Client | null) => {
    setSelectedClient(c);
    setSelectedAddressId(null);
    setAddresses([]);
    if (c) loadAddresses(c.id);
  };

  const totalCBM = blocks.reduce((s, b) => s + cbmOf(b), 0);
  const totalPcs = blocks.reduce((s, b) => s + (parseInt(b.cantidad) || 0), 0);

  const addBlock = () => setBlocks(b => [...b, emptyBlock()]);
  const removeBlock = (i: number) => setBlocks(b => b.filter((_, j) => j !== i));
  const updateBlock = (i: number, field: keyof BoxBlock, val: string) =>
    setBlocks(b => b.map((row, j) => j === i ? { ...row, [field]: val } : row));

  const handleImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImages(prev => [...prev, ...files].slice(0, 10));
    e.target.value = '';
  };

  const handleDocs = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setDocs(prev => [...prev, ...files].slice(0, 5));
    e.target.value = '';
  };

  const handleSubmit = async () => {
    setError('');
    if (!selectedClient) { setError('Selecciona un cliente'); return; }
    if (!productDescription.trim()) { setError('Describe el producto'); return; }
    const destination = selectedAddressId
      ? addresses.find(a => a.id === selectedAddressId)?.full_address || ''
      : customDestination.trim();
    if (!destination) { setError('Indica la dirección destino'); return; }
    if (totalCBM <= 0) { setError('Ingresa al menos un bloque de cajas con dimensiones'); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('client_id', String(selectedClient.id));
      fd.append('destination_address', destination);
      fd.append('box_blocks', JSON.stringify(blocks));
      fd.append('total_cbm', totalCBM.toFixed(4));
      fd.append('total_pieces', String(totalPcs));
      fd.append('product_description', productDescription);
      fd.append('has_brand', String(hasBrand));
      fd.append('has_brand_letter', hasBrand ? String(hasBrandLetter) : 'false');
      fd.append('origin_address', originAddress);
      fd.append('merchandise_value_usd', merchandiseValue);

      for (const img of images) fd.append('photos', img);
      for (const doc of docs) fd.append('documents', doc);

      await api.post('/advisor/quote-requests', fd);
      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar solicitud');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setError(''); setSelectedClient(null); setAddresses([]);
    setSelectedAddressId(null); setCustomDestination(''); setBlocks([emptyBlock()]);
    setProductDescription(''); setHasBrand(false); setHasBrandLetter(false);
    setOriginAddress(''); setMerchandiseValue(''); setImages([]); setDocs([]);
    onClose();
  };

  // Load clients when modal opens
  if (open && clients.length === 0 && !clientsLoading) loadClients();

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography fontWeight={700} fontSize={18}>📋 Solicitar Cotización Especializada</Typography>
        <IconButton onClick={handleClose} size="small" sx={{ color: 'white' }}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* CLIENTE */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          1. Seleccionar Cliente
        </Typography>
        <Autocomplete
          options={clients}
          loading={clientsLoading}
          getOptionLabel={c => `${c.fullName} — ${c.boxId || c.email}`}
          value={selectedClient}
          onChange={(_, v) => handleClientChange(v)}
          renderInput={params => (
            <TextField {...params} label="Cliente" size="small"
              InputProps={{ ...params.InputProps, endAdornment: <>{clientsLoading && <CircularProgress size={16} />}{params.InputProps.endAdornment}</> }} />
          )}
          sx={{ mb: 3 }}
        />

        <Divider sx={{ mb: 3 }} />

        {/* CAJAS */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: ORANGE }}>2. Bloques de Cajas</Typography>
          <Chip icon={<CalculateIcon />} label={`${totalCBM.toFixed(4)} CBM · ${totalPcs} pzas`}
            color="primary" size="small" sx={{ fontWeight: 700 }} />
        </Box>
        {blocks.map((b, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Bloque {i + 1}</Typography>
              {blocks.length > 1 && (
                <IconButton size="small" color="error" onClick={() => removeBlock(i)}><DeleteIcon fontSize="small" /></IconButton>
              )}
              <Typography variant="caption" sx={{ ml: 'auto', color: ORANGE, fontWeight: 700 }}>
                {cbmOf(b).toFixed(4)} CBM
              </Typography>
            </Box>
            <Grid container spacing={1.5}>
              {(['largo', 'ancho', 'alto'] as const).map(field => (
                <Grid size={{ xs: 6, sm: 3 }} key={field}>
                  <TextField label={`${field.charAt(0).toUpperCase() + field.slice(1)} (cm)`} size="small" fullWidth
                    type="number" value={b[field]} onChange={e => updateBlock(i, field, e.target.value)} />
                </Grid>
              ))}
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField label="Cantidad" size="small" fullWidth type="number"
                  value={b.cantidad} onChange={e => updateBlock(i, 'cantidad', e.target.value)} />
              </Grid>
            </Grid>
          </Paper>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={addBlock} sx={{ mb: 3, color: ORANGE }}>
          Agregar bloque
        </Button>

        <Divider sx={{ mb: 3 }} />

        {/* DIRECCIÓN DESTINO */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          3. Dirección Destino
        </Typography>
        {addresses.length > 0 ? (
          <Box sx={{ mb: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Dirección del cliente</InputLabel>
              <Select
                value={selectedAddressId || ''}
                label="Dirección del cliente"
                onChange={e => { setSelectedAddressId(Number(e.target.value)); setCustomDestination(''); }}
              >
                <MenuItem value=""><em>Escribir dirección nueva</em></MenuItem>
                {addresses.map(a => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.alias ? `${a.alias}: ` : ''}{a.full_address}
                    {a.is_default ? ' (Predeterminada)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        ) : selectedClient ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {addressesLoading ? 'Cargando direcciones...' : 'Sin direcciones guardadas — escribe la dirección:'}
          </Typography>
        ) : null}
        {(!selectedAddressId) && (
          <TextField fullWidth size="small" label="Dirección destino" multiline rows={2}
            value={customDestination} onChange={e => setCustomDestination(e.target.value)}
            placeholder="Ciudad, Estado, País o dirección completa" sx={{ mb: 3 }} />
        )}
        {selectedAddressId && <Box sx={{ mb: 3 }} />}

        <Divider sx={{ mb: 3 }} />

        {/* PRODUCTO */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          4. Descripción del Producto
        </Typography>
        <TextField fullWidth size="small" label="Descripción" multiline rows={3}
          value={productDescription} onChange={e => setProductDescription(e.target.value)}
          placeholder="Describe el producto con detalles (material, uso, características)" sx={{ mb: 2 }} />

        <Box sx={{ display: 'flex', gap: 3, mb: 1 }}>
          <FormControlLabel
            control={<Switch checked={hasBrand} onChange={e => { setHasBrand(e.target.checked); if (!e.target.checked) setHasBrandLetter(false); }} />}
            label="¿Con marca registrada?"
          />
          {hasBrand && (
            <FormControlLabel
              control={<Switch checked={hasBrandLetter} onChange={e => setHasBrandLetter(e.target.checked)} />}
              label="¿Tiene carta de uso de marca?"
            />
          )}
        </Box>
        <Box sx={{ mb: 3 }} />

        <Divider sx={{ mb: 3 }} />

        {/* PROVEEDOR + VALOR */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          5. Proveedor y Valor
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField fullWidth size="small" label="Dirección del proveedor (origen)"
              value={originAddress} onChange={e => setOriginAddress(e.target.value)}
              placeholder="Ciudad/provincia, China (o país de origen)" />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth size="small" label="Valor total mercancía (USD)"
              type="number" value={merchandiseValue} onChange={e => setMerchandiseValue(e.target.value)}
              InputProps={{ startAdornment: <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>$</Typography> }} />
          </Grid>
        </Grid>

        <Divider sx={{ mb: 3 }} />

        {/* ARCHIVOS */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          6. Archivos Adjuntos
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                <ImageIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                Fotos del producto ({images.length}/10)
              </Typography>
              <Button size="small" variant="outlined" startIcon={<AttachFileIcon />}
                onClick={() => imgRef.current?.click()} disabled={images.length >= 10}
                sx={{ mb: 1, borderColor: ORANGE, color: ORANGE }}>
                Agregar imagen
              </Button>
              <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={handleImages} />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {images.map((f, i) => (
                  <Chip key={i} label={f.name.length > 20 ? f.name.slice(0, 18) + '…' : f.name}
                    size="small" onDelete={() => setImages(imgs => imgs.filter((_, j) => j !== i))} />
                ))}
              </Box>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                <AttachFileIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                Documentos PDF/Excel ({docs.length}/5)
              </Typography>
              <Button size="small" variant="outlined" startIcon={<AttachFileIcon />}
                onClick={() => docRef.current?.click()} disabled={docs.length >= 5}
                sx={{ mb: 1, borderColor: ORANGE, color: ORANGE }}>
                Agregar archivo
              </Button>
              <input ref={docRef} type="file" accept=".pdf,.xlsx,.xls,.csv" multiple hidden onChange={handleDocs} />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {docs.map((f, i) => (
                  <Chip key={i} label={f.name.length > 20 ? f.name.slice(0, 18) + '…' : f.name}
                    size="small" onDelete={() => setDocs(d => d.filter((_, j) => j !== i))} />
                ))}
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* Resumen */}
        {selectedClient && totalCBM > 0 && (
          <Alert severity="info" sx={{ mt: 3 }}>
            <strong>{selectedClient.fullName}</strong> · {totalPcs} pzas · {totalCBM.toFixed(4)} CBM
            {merchandiseValue ? ` · $${parseFloat(merchandiseValue).toLocaleString('es-MX')} USD` : ''}
            {hasBrand ? ` · Marca registrada${hasBrandLetter ? ' + carta' : ' (sin carta)'}` : ''}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}
          sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d44d20' }, minWidth: 160 }}>
          {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : '📤 Enviar Solicitud'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
