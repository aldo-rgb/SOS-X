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

  // Servicio
  const [servicio, setServicio] = useState<'maritimo' | 'aereo'>('maritimo');
  const [maritimoTipo, setMaritimoTipo] = useState<'lcl' | 'fcl'>('lcl');
  const [pesoKg, setPesoKg] = useState('');

  // Cajas / CBM
  const [cbmDirecto, setCbmDirecto] = useState('');
  const [showBlocks, setShowBlocks] = useState(false);
  const [blocks, setBlocks] = useState<BoxBlock[]>([emptyBlock()]);

  // Producto
  const [productDescription, setProductDescription] = useState('');
  const [hasBrand, setHasBrand] = useState(false);
  const [hasBrandLetter, setHasBrandLetter] = useState(false);

  // Proveedor
  const [originAddress, setOriginAddress] = useState('');
  const [conRecoleccion, setConRecoleccion] = useState(false);

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

  const blocksCBM = blocks.reduce((s, b) => s + cbmOf(b), 0);
  const totalCBM = showBlocks ? blocksCBM : (parseFloat(cbmDirecto) || 0);
  const totalPcs = showBlocks ? blocks.reduce((s, b) => s + (parseInt(b.cantidad) || 0), 0) : 0;

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
    const needsBoxes = servicio === 'maritimo' && maritimoTipo === 'lcl';
    const needsWeight = servicio === 'aereo';
    if (needsBoxes && totalCBM <= 0) { setError('Ingresa los metros cúbicos o agrega bloques de cajas'); return; }
    if (needsWeight && !pesoKg.trim()) { setError('Ingresa el peso en kg'); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('client_id', String(selectedClient.id));
      fd.append('servicio', servicio);
      fd.append('maritimo_tipo', servicio === 'maritimo' ? maritimoTipo : '');
      fd.append('destination_address', destination);
      fd.append('box_blocks', needsBoxes ? JSON.stringify(blocks) : '[]');
      fd.append('total_cbm', needsBoxes ? totalCBM.toFixed(4) : '0');
      fd.append('total_pieces', needsBoxes ? String(totalPcs) : '0');
      fd.append('peso_kg', needsWeight ? pesoKg : '');
      fd.append('product_description', productDescription);
      fd.append('has_brand', String(hasBrand));
      fd.append('has_brand_letter', hasBrand ? String(hasBrandLetter) : 'false');
      fd.append('origin_address', originAddress);
      fd.append('con_recoleccion', String(conRecoleccion));
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

  const handleDownloadPDF = () => {
    const destination = selectedAddressId
      ? addresses.find(a => a.id === selectedAddressId)?.full_address || customDestination
      : customDestination;
    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Solicitud de Cotización</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #222; max-width: 800px; margin: 0 auto; }
        h1 { color: #F05A28; font-size: 22px; border-bottom: 2px solid #F05A28; padding-bottom: 8px; }
        h2 { color: #F05A28; font-size: 15px; margin-top: 20px; margin-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
        td:first-child { color: #666; width: 180px; }
        td:last-child { font-weight: 600; }
        .block-row { background: #fff8f5; border: 1px solid #fdd; border-radius: 4px; padding: 6px 10px; margin: 4px 0; font-size: 13px; }
        .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
        @media print { body { padding: 16px; } }
      </style></head><body>
      <h1>📋 Solicitud de Cotización Especializada</h1>
      <p style="color:#666;font-size:13px">Fecha: ${new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}</p>

      <h2>Servicio</h2>
      <table><tr><td>Tipo</td><td>${servicio === 'maritimo' ? `Marítimo ${maritimoTipo.toUpperCase()}` : 'Aéreo'}</td></tr>
      ${servicio === 'aereo' && pesoKg ? `<tr><td>Peso</td><td>${pesoKg} kg</td></tr>` : ''}
      ${totalCBM > 0 ? `<tr><td>CBM Total</td><td>${totalCBM.toFixed(4)} m³${totalPcs > 0 ? ` · ${totalPcs} pzas` : ''}</td></tr>` : ''}
      </table>

      <h2>Cliente</h2>
      <table><tr><td>Nombre</td><td>${selectedClient?.fullName || '—'}</td></tr>
      <tr><td>Box ID</td><td>${selectedClient?.boxId || '—'}</td></tr>
      <tr><td>Email</td><td>${selectedClient?.email || '—'}</td></tr></table>

      ${showBlocks && blocks.some(b => b.largo) ? `<h2>Bloques de Cajas</h2>${blocks.map((b, i) => b.largo ? `<div class="block-row">Bloque ${i+1}: ${b.largo}×${b.ancho}×${b.alto} cm · ${b.cantidad} pza(s) · ${cbmOf(b).toFixed(4)} CBM</div>` : '').join('')}` : ''}

      <h2>Dirección Destino</h2>
      <table><tr><td>Destino</td><td>${destination || '—'}</td></tr></table>

      <h2>Producto</h2>
      <table>
        <tr><td>Descripción</td><td>${productDescription || '—'}</td></tr>
        <tr><td>Marca registrada</td><td>${hasBrand ? (hasBrandLetter ? 'Sí — con carta de uso de marca' : 'Sí — sin carta de uso') : 'No'}</td></tr>
      </table>

      <h2>Proveedor y Valor</h2>
      <table>
        <tr><td>Origen proveedor</td><td>${originAddress || '—'}</td></tr>
        <tr><td>Recolección en origen</td><td>${conRecoleccion ? '✅ Con recolección' : '❌ Sin recolección'}</td></tr>
        <tr><td>Valor mercancía</td><td>${merchandiseValue ? `$${parseFloat(merchandiseValue).toLocaleString('es-MX', { minimumFractionDigits: 2 })} USD` : '—'}</td></tr>
      </table>

      <h2>Archivos Adjuntos</h2>
      <table>
        <tr><td>Fotos</td><td>${images.length > 0 ? images.map(f => f.name).join(', ') : 'Ninguna'}</td></tr>
        <tr><td>Documentos</td><td>${docs.length > 0 ? docs.map(f => f.name).join(', ') : 'Ninguno'}</td></tr>
      </table>

      <div class="footer">Generado por EntregaX · ${new Date().toLocaleString('es-MX')}</div>
      </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  };

  const handleClose = () => {
    setError(''); setSelectedClient(null); setAddresses([]);
    setSelectedAddressId(null); setCustomDestination(''); setBlocks([emptyBlock()]);
    setServicio('maritimo'); setMaritimoTipo('lcl'); setPesoKg('');
    setCbmDirecto(''); setShowBlocks(false);
    setProductDescription(''); setHasBrand(false); setHasBrandLetter(false);
    setOriginAddress(''); setMerchandiseValue(''); setConRecoleccion(false); setImages([]); setDocs([]);
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

        {/* TIPO DE SERVICIO */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          1. Tipo de Servicio
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {([['maritimo', '🚢 Marítimo'], ['aereo', '✈️ Aéreo']] as const).map(([val, label]) => (
            <Box key={val} onClick={() => setServicio(val)}
              sx={{ flex: 1, border: 2, borderColor: servicio === val ? ORANGE : '#e0e0e0', borderRadius: 2,
                p: 2, cursor: 'pointer', bgcolor: servicio === val ? '#fff5f0' : 'white',
                textAlign: 'center', fontWeight: 700, fontSize: 15,
                color: servicio === val ? ORANGE : 'text.secondary', transition: 'all .15s' }}>
              {label}
            </Box>
          ))}
        </Box>
        {servicio === 'maritimo' && (
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            {([['lcl', '📦 LCL (carga consolidada)'], ['fcl', '🏗️ FCL (contenedor completo)']] as const).map(([val, label]) => (
              <Box key={val} onClick={() => setMaritimoTipo(val)}
                sx={{ flex: 1, border: 1.5, borderColor: maritimoTipo === val ? ORANGE : '#e0e0e0', borderRadius: 2,
                  p: 1.5, cursor: 'pointer', bgcolor: maritimoTipo === val ? '#fff5f0' : 'white',
                  textAlign: 'center', fontSize: 13, fontWeight: maritimoTipo === val ? 700 : 400,
                  color: maritimoTipo === val ? ORANGE : 'text.secondary' }}>
                {label}
              </Box>
            ))}
          </Box>
        )}
        <Divider sx={{ mb: 3 }} />

        {/* CLIENTE */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          2. Seleccionar Cliente
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

        {/* VOLUMEN — solo LCL marítimo o aéreo */}
        {(servicio === 'maritimo' && maritimoTipo === 'lcl') && (
        <><Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: ORANGE }}>3. Metros Cúbicos</Typography>
          {totalCBM > 0 && (
            <Chip icon={<CalculateIcon />} label={`${totalCBM.toFixed(4)} CBM${totalPcs > 0 ? ` · ${totalPcs} pzas` : ''}`}
              color="primary" size="small" sx={{ fontWeight: 700 }} />
          )}
        </Box>

        {/* Campo directo de CBM */}
        <TextField
          fullWidth size="small" label="Metros cúbicos (CBM)" type="number"
          value={cbmDirecto}
          onChange={e => { setCbmDirecto(e.target.value); if (e.target.value) setShowBlocks(false); }}
          placeholder="Ej: 2.5"
          sx={{ mb: 1.5 }}
          helperText="Si ya sabes el volumen total, escríbelo aquí."
          InputProps={{ endAdornment: <Typography sx={{ color: 'text.secondary', ml: 1, whiteSpace: 'nowrap' }}>m³</Typography> }}
        />

        {/* Toggle para calcular por bloques */}
        <Button size="small" variant="text"
          startIcon={showBlocks ? <DeleteIcon fontSize="small" /> : <CalculateIcon fontSize="small" />}
          onClick={() => { setShowBlocks(v => !v); if (!showBlocks) setCbmDirecto(''); }}
          sx={{ mb: 2, color: ORANGE, textTransform: 'none' }}>
          {showBlocks ? 'Ocultar bloques' : 'Calcular por bloques de cajas'}
        </Button>

        {showBlocks && (
          <>
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
            <Button size="small" startIcon={<AddIcon />} onClick={addBlock} sx={{ mb: 2, color: ORANGE }}>
              Agregar bloque
            </Button>
          </>
        )}
        <Divider sx={{ mb: 3 }} /></>
        )}

        {/* PESO + BLOQUES — solo Aéreo */}
        {servicio === 'aereo' && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: ORANGE }}>3. Peso y Volumen</Typography>
            {totalCBM > 0 && (
              <Chip icon={<CalculateIcon />} label={`${totalCBM.toFixed(4)} CBM${totalPcs > 0 ? ` · ${totalPcs} pzas` : ''}`}
                color="primary" size="small" sx={{ fontWeight: 700 }} />
            )}
          </Box>

          <TextField fullWidth size="small" label="Peso total (kg)" type="number"
            value={pesoKg} onChange={e => setPesoKg(e.target.value)}
            sx={{ mb: 1.5 }}
            InputProps={{ endAdornment: <Typography sx={{ color: 'text.secondary', ml: 1 }}>kg</Typography> }} />

          <TextField
            fullWidth size="small" label="Metros cúbicos (CBM) — opcional" type="number"
            value={cbmDirecto}
            onChange={e => { setCbmDirecto(e.target.value); if (e.target.value) setShowBlocks(false); }}
            placeholder="Ej: 2.5"
            sx={{ mb: 1.5 }}
            helperText="Si ya sabes el volumen, escríbelo aquí."
            InputProps={{ endAdornment: <Typography sx={{ color: 'text.secondary', ml: 1, whiteSpace: 'nowrap' }}>m³</Typography> }}
          />

          <Button size="small" variant="text"
            startIcon={showBlocks ? <DeleteIcon fontSize="small" /> : <CalculateIcon fontSize="small" />}
            onClick={() => { setShowBlocks(v => !v); if (!showBlocks) setCbmDirecto(''); }}
            sx={{ mb: 2, color: ORANGE, textTransform: 'none' }}>
            {showBlocks ? 'Ocultar bloques' : 'Calcular CBM por bloques de cajas'}
          </Button>

          {showBlocks && (
            <>
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
              <Button size="small" startIcon={<AddIcon />} onClick={addBlock} sx={{ mb: 2, color: ORANGE }}>
                Agregar bloque
              </Button>
            </>
          )}
          <Divider sx={{ mb: 3 }} />
        </>
        )}

        {/* DIRECCIÓN DESTINO */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          {servicio === 'maritimo' && maritimoTipo === 'lcl' ? '4.' : (servicio === 'aereo' ? '4.' : '3.')} Dirección Destino
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
          {servicio === 'maritimo' && maritimoTipo === 'lcl' ? '5.' : (servicio === 'aereo' ? '5.' : '4.')} Descripción del Producto
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
          {servicio === 'maritimo' && maritimoTipo === 'lcl' ? '6.' : (servicio === 'aereo' ? '6.' : '5.')} Proveedor y Valor
        </Typography>
        <Grid container spacing={2} sx={{ mb: 1.5 }}>
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
        <FormControlLabel
          control={<Switch checked={conRecoleccion} onChange={e => setConRecoleccion(e.target.checked)} />}
          label={
            <Box>
              <Typography variant="body2" fontWeight={600}>Con recolección en origen</Typography>
              <Typography variant="caption" color="text.secondary">
                {conRecoleccion ? 'El proveedor necesita que vayamos a recoger la mercancía.' : 'El proveedor lleva la mercancía al almacén/consolidado.'}
              </Typography>
            </Box>
          }
          sx={{ mb: 3, alignItems: 'flex-start', mt: 0.5 }}
        />

        <Divider sx={{ mb: 3 }} />

        {/* ARCHIVOS */}
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, color: ORANGE }}>
          {servicio === 'maritimo' && maritimoTipo === 'lcl' ? '7.' : (servicio === 'aereo' ? '7.' : '6.')} Archivos Adjuntos
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
            <strong>{selectedClient.fullName}</strong> · {servicio === 'maritimo' ? `Marítimo ${maritimoTipo.toUpperCase()}` : 'Aéreo'}
          {servicio === 'maritimo' && maritimoTipo === 'lcl' ? ` · ${totalPcs} pzas · ${totalCBM.toFixed(4)} CBM` : ''}
          {servicio === 'aereo' && pesoKg ? ` · ${pesoKg} kg` : ''}
            {merchandiseValue ? ` · $${parseFloat(merchandiseValue).toLocaleString('es-MX')} USD` : ''}
            {hasBrand ? ` · Marca registrada${hasBrandLetter ? ' + carta' : ' (sin carta)'}` : ''}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
        <Button variant="outlined" onClick={handleDownloadPDF} disabled={saving}
          sx={{ borderColor: ORANGE, color: ORANGE, minWidth: 160 }}>
          📄 Descargar PDF
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}
          sx={{ bgcolor: ORANGE, '&:hover': { bgcolor: '#d44d20' }, minWidth: 160 }}>
          {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : '📤 Enviar Solicitud'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
