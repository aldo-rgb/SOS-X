import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Alert,
  CircularProgress, InputAdornment, Table, TableHead, TableBody,
  TableRow, TableCell, Chip, IconButton, Dialog, DialogContent, Tooltip,
} from '@mui/material';
import { Image as ImageIcon, Refresh as RefreshIcon, Close as CloseIcon } from '@mui/icons-material';
import axios from 'axios';

interface TaxExpense {
  id: number; guia: string; monto: number; currency: string; status: string;
  fecha: string; sucursal: string; registrado_por: string; evidence_url: string | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const token = () => localStorage.getItem('token') || '';

export default function DhlImportTaxPage() {
  const [value, setValue] = useState<string>('');
  const [original, setOriginal] = useState<number>(390);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Gastos de Impuestos DHL (notas de caja chica)
  const [expenses, setExpenses] = useState<TaxExpense[]>([]);
  const [expTotal, setExpTotal] = useState(0);
  const [loadingExp, setLoadingExp] = useState(true);
  const [search, setSearch] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const fmtMoney = (n: number) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  const loadExpenses = useCallback(async (q = '') => {
    setLoadingExp(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/dhl/import-tax/expenses`, {
        headers: { Authorization: `Bearer ${token()}` },
        params: q ? { search: q } : {},
      });
      setExpenses(r.data.expenses || []);
      setExpTotal(r.data.total || 0);
    } catch {
      setExpenses([]);
    } finally {
      setLoadingExp(false);
    }
  }, []);

  useEffect(() => {
    axios.get(`${API_URL}/api/admin/dhl/settings/import-tax`, {
      headers: { Authorization: `Bearer ${token()}` },
    }).then(r => {
      setOriginal(r.data.value);
      setValue(String(r.data.value));
    }).catch(() => {
      setValue('390');
    }).finally(() => setLoading(false));
    loadExpenses();
  }, [loadExpenses]);

  const statusChip = (s: string) => {
    const map: Record<string, { label: string; color: any }> = {
      approved: { label: 'Aprobado', color: 'success' },
      pending: { label: 'Pendiente', color: 'warning' },
      pending_acceptance: { label: 'Pendiente', color: 'warning' },
      rejected: { label: 'Rechazado', color: 'error' },
    };
    const c = map[s] || { label: s, color: 'default' };
    return <Chip label={c.label} color={c.color} size="small" />;
  };

  const save = async () => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) { setError('Ingresa un monto válido'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      await axios.put(`${API_URL}/api/admin/dhl/settings/import-tax`, { value: num }, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setOriginal(num);
      setSuccess(`Cargo de impuestos actualizado a $${num.toFixed(2)} MXN`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Box sx={{ maxWidth: 520 }}>
      <Typography variant="h6" fontWeight={700} mb={1}>
        Cargo de Impuestos DHL
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Este monto se carga automáticamente a cada paquete registrado en recepción DHL.
        Se muestra en el desglose de costos de la app y el panel web.
      </Typography>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="subtitle2" fontWeight={600} mb={2}>
          Monto actual: ${original.toFixed(2)} MXN por paquete
        </Typography>

        <TextField
          label="Cargo de impuestos"
          value={value}
          onChange={e => setValue(e.target.value)}
          type="number"
          fullWidth
          InputProps={{
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
            endAdornment: <InputAdornment position="end">MXN</InputAdornment>,
          }}
          inputProps={{ min: 0, step: 10 }}
          sx={{ mb: 2 }}
        />

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Button
          variant="contained"
          onClick={save}
          disabled={saving || value === String(original)}
          sx={{ backgroundColor: '#F05A28', '&:hover': { backgroundColor: '#d44e22' } }}
        >
          {saving ? <CircularProgress size={20} color="inherit" /> : 'Guardar'}
        </Button>
      </Paper>

      <Paper sx={{ p: 2, mt: 2, borderRadius: 3, backgroundColor: '#fff8f5', border: '1px solid #ffd0bc' }}>
        <Typography variant="caption" color="text.secondary">
          <strong>Nota:</strong> El cambio aplica solo a paquetes registrados a partir de este momento.
          Los paquetes existentes conservan el cargo con el que fueron registrados.
        </Typography>
      </Paper>
      </Box>

      {/* ===== Gastos de Impuestos DHL (notas de caja chica CEDIS MTY) ===== */}
      <Box sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Typography variant="h6" fontWeight={700}>Gastos de Impuestos DHL</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip label={`${expenses.length} notas`} size="small" color="primary" variant="outlined" />
            <Chip label={`Total: ${fmtMoney(expTotal)}`} size="small" color="error" variant="outlined" />
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Notas de impuestos que registra el operador de caja chica (CEDIS MTY) como <strong>Impuestos DHL</strong>.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small" placeholder="Buscar guía o sucursal..." value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') loadExpenses(search); }}
            sx={{ minWidth: 260 }}
          />
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => loadExpenses(search)}
            sx={{ borderColor: '#F05A28', color: '#F05A28' }}>
            Actualizar
          </Button>
        </Box>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#1a1a1a' }}>
              <TableRow>
                {['Foto', 'Guía', 'Fecha', 'Monto', 'Estado', 'Sucursal', 'Registró'].map(h => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 700 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingExp ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>
              ) : expenses.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>Sin gastos de impuestos registrados</TableCell></TableRow>
              ) : expenses.map(e => (
                <TableRow key={e.id} hover>
                  <TableCell>
                    {e.evidence_url ? (
                      <Tooltip title="Ver comprobante">
                        <IconButton size="small" onClick={() => setPhotoUrl(e.evidence_url)} sx={{ color: '#F05A28' }}>
                          <ImageIcon />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">Sin foto</Typography>
                    )}
                  </TableCell>
                  <TableCell><Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{e.guia || '—'}</Typography></TableCell>
                  <TableCell><Typography variant="caption">{fmtDate(e.fecha)}</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={700} color="error">{fmtMoney(e.monto)}</Typography></TableCell>
                  <TableCell>{statusChip(e.status)}</TableCell>
                  <TableCell><Typography variant="caption">{e.sucursal}</Typography></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{e.registrado_por}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>

      {/* Visor de comprobante */}
      <Dialog open={!!photoUrl} onClose={() => setPhotoUrl(null)} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 1, position: 'relative', bgcolor: '#000' }}>
          <IconButton onClick={() => setPhotoUrl(null)} sx={{ position: 'absolute', top: 8, right: 8, color: 'white', bgcolor: 'rgba(0,0,0,0.4)' }}>
            <CloseIcon />
          </IconButton>
          {photoUrl && (
            String(photoUrl).toLowerCase().includes('.pdf') ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Button variant="contained" href={photoUrl} target="_blank" sx={{ backgroundColor: '#F05A28' }}>Abrir PDF</Button>
              </Box>
            ) : (
              <Box component="img" src={photoUrl} alt="Comprobante" sx={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }} />
            )
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
