import { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Alert,
  CircularProgress, InputAdornment,
} from '@mui/material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const token = () => localStorage.getItem('token') || '';

export default function DhlImportTaxPage() {
  const [value, setValue] = useState<string>('');
  const [original, setOriginal] = useState<number>(390);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_URL}/api/admin/dhl/settings/import-tax`, {
      headers: { Authorization: `Bearer ${token()}` },
    }).then(r => {
      setOriginal(r.data.value);
      setValue(String(r.data.value));
    }).catch(() => {
      setValue('390');
    }).finally(() => setLoading(false));
  }, []);

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
    <Box sx={{ maxWidth: 500 }}>
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
  );
}
