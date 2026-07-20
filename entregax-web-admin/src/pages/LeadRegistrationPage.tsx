import { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
const getToken = () => localStorage.getItem('token') || '';

const CHANNELS = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'IG', label: 'Instagram' },
  { value: 'WA', label: 'WhatsApp' },
  { value: 'WEB', label: 'Web' },
  { value: 'REF', label: 'Referido' },
  { value: 'UPS', label: 'UPS' },
  { value: 'DHL', label: 'DHL' },
  { value: 'FEDEX', label: 'FedEx' },
  { value: 'OTHER', label: 'Otro' },
];

interface Advisor { id: number; full_name: string; }

/**
 * Módulo acotado "Registro de LEADS": SOLO permite alimentar la Central de Leads
 * con las 3 acciones — Nuevo Prospecto, Subir Excel y Descargar plantilla.
 * No muestra el listado ni el resto del CRM.
 */
export default function LeadRegistrationPage() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [uploading, setUploading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [form, setForm] = useState({
    full_name: '',
    whatsapp: '',
    email: '',
    acquisition_channel: '',
    assigned_advisor_id: '',
    notes: '',
    follow_up_date: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/admin/crm/advisors`, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (res.data?.advisors) setAdvisors(res.data.advisors);
      } catch { /* sin asesores */ }
    })();
  }, []);

  const resetForm = () => setForm({ full_name: '', whatsapp: '', email: '', acquisition_channel: '', assigned_advisor_id: '', notes: '', follow_up_date: '' });

  // Descargar la plantilla de Excel para carga masiva de prospectos.
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nombre completo', 'Telefono', 'Email', 'Canal'],
      ['Juan Pérez', '5512345678', 'juan@correo.com', 'Facebook'],
      ['María López', '5598765432', 'maria@correo.com', 'Web'],
      ['', '', '', ''],
    ]);
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 26 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prospectos');
    const help = XLSX.utils.aoa_to_sheet([
      ['CANALES VÁLIDOS (columna "Canal")'],
      ['Facebook'], ['Instagram'], ['WhatsApp'], ['Web'], ['Referido'], ['UPS'], ['DHL'], ['FedEx'], ['Otro'],
      [''],
      ['Notas:'],
      ['• Solo "Nombre completo" es obligatorio.'],
      ['• La fecha de seguimiento se pone automática (día de la carga).'],
      ['• Todos se cargan sin asesor y sin notas.'],
    ]);
    help['!cols'] = [{ wch: 50 }];
    XLSX.utils.book_append_sheet(wb, help, 'Instrucciones');
    XLSX.writeFile(wb, 'plantilla_prospectos.xlsx');
  };

  // Subir Excel y crear prospectos masivamente.
  const handleUploadExcel = async (file: File) => {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0] as string];
      if (!sheet) { setSnackbar({ open: true, message: 'El archivo no tiene hojas', severity: 'error' }); return; }
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: false });
      const norm = (s: any) => String(s || '').trim().toLowerCase();
      const rows = json.map((obj) => {
        const get = (...keys: string[]) => {
          for (const k of Object.keys(obj)) { if (keys.includes(norm(k))) return obj[k]; }
          return '';
        };
        return {
          full_name: String(get('nombre completo', 'nombre', 'nombre_completo', 'name')).trim(),
          whatsapp: String(get('telefono', 'teléfono', 'whatsapp', 'celular', 'phone', 'tel')).trim(),
          email: String(get('email', 'correo', 'e-mail', 'correo electronico', 'correo electrónico')).trim(),
          acquisition_channel: String(get('canal', 'canal de adquisicion', 'canal de adquisición', 'channel')).trim(),
        };
      }).filter((r) => r.full_name);

      if (rows.length === 0) {
        setSnackbar({ open: true, message: 'No se encontraron filas con "Nombre completo". Usa la plantilla.', severity: 'error' });
        return;
      }
      const res = await axios.post(`${API_URL}/admin/crm/prospects/bulk`, { rows }, { headers: { Authorization: `Bearer ${getToken()}` } });
      const { inserted = 0, skippedDuplicate = 0, skippedNoName = 0 } = res.data || {};
      const parts: string[] = [];
      if (skippedDuplicate) parts.push(`${skippedDuplicate} duplicados (tel/correo ya existe)`);
      if (skippedNoName) parts.push(`${skippedNoName} sin nombre`);
      const detail = parts.length ? ` · omitidos: ${parts.join(', ')}` : '';
      setSnackbar({ open: true, message: `✅ ${inserted} prospectos importados${detail}`, severity: inserted > 0 ? 'success' : 'error' });
    } catch (e: any) {
      setSnackbar({ open: true, message: e.response?.data?.error || 'Error al importar el Excel', severity: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setSnackbar({ open: true, message: 'El nombre es obligatorio', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_URL}/admin/crm/prospects`, {
        ...form,
        assigned_advisor_id: form.assigned_advisor_id || null,
        follow_up_date: form.follow_up_date || null,
        status: 'new',
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setSnackbar({ open: true, message: '✅ Prospecto creado', severity: 'success' });
      setFormOpen(false);
      resetForm();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Error al guardar', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 3, maxWidth: 720, mx: 'auto', textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>📝 Registro de LEADS</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Agrega prospectos a la Central de Leads. Puedes registrar uno a la vez o subir varios con un Excel.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, justifyContent: 'center' }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<PersonAddIcon />}
            onClick={() => { resetForm(); setFormOpen(true); }}
            sx={{ background: 'linear-gradient(135deg, #C1272D 0%, #F05A28 100%)' }}
          >
            Nuevo Prospecto
          </Button>

          <Button
            variant="outlined"
            size="large"
            startIcon={uploading ? <CircularProgress size={18} /> : <UploadFileIcon />}
            component="label"
            disabled={uploading}
          >
            {uploading ? 'Importando…' : 'Subir Excel'}
            <input
              type="file"
              hidden
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadExcel(f); (e.target as HTMLInputElement).value = ''; }}
            />
          </Button>

          <Button variant="outlined" size="large" startIcon={<FileDownloadIcon />} onClick={downloadTemplate}>
            Descargar plantilla
          </Button>
        </Box>
      </Paper>

      {/* Diálogo Nuevo Prospecto */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo Prospecto</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Nombre completo"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="WhatsApp"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                fullWidth
                placeholder="+52 123 456 7890"
              />
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                fullWidth
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Canal</InputLabel>
                <Select
                  value={form.acquisition_channel}
                  label="Canal"
                  onChange={(e) => setForm({ ...form, acquisition_channel: e.target.value })}
                >
                  {CHANNELS.map(c => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Asignar asesor</InputLabel>
                <Select
                  value={form.assigned_advisor_id}
                  label="Asignar asesor"
                  onChange={(e) => setForm({ ...form, assigned_advisor_id: e.target.value })}
                >
                  <MenuItem value="">Sin asignar</MenuItem>
                  {advisors.map(a => (
                    <MenuItem key={a.id} value={String(a.id)}>{a.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <TextField
              label="Fecha de seguimiento"
              type="date"
              value={form.follow_up_date}
              onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Notas"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              multiline
              rows={3}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
