// ============================================
// PÁGINA DE GESTIÓN DE PAQUETERÍAS POR SERVICIO 📦
// CRUD para opciones de paquetería que se muestran a clientes
// según el tipo de servicio de sus paquetes
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  CircularProgress,
  Chip,
  Switch,
  FormControlLabel,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  DragIndicator as DragIcon,
  LocalShipping as ShippingIcon,
  CloudUpload as UploadIcon,
  Inventory as CollectIcon,
} from '@mui/icons-material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface CarrierOption {
  id: number;
  carrier_key: string;
  name: string;
  description: string | null;
  price_label: string | null;
  subtext: string | null;
  icon: string;
  is_active: boolean;
  allows_collect: boolean;
  priority: number;
  service_types: string[];
  created_at: string;
  updated_at: string;
}

interface CarrierFormData {
  carrier_key: string;
  name: string;
  description: string;
  price_label: string;
  subtext: string;
  icon: string;
  priority: number;
  allows_collect: boolean;
  service_types: string[];
}

const SERVICE_TYPE_OPTIONS = [
  { value: 'china_air', label: 'China Aéreo', color: '#E53935' },
  { value: 'china_sea', label: 'China Marítimo', color: '#0288D1' },
  { value: 'usa_pobox', label: 'PO Box USA', color: '#5E35B1' },
  { value: 'dhl', label: 'DHL / CEDIS', color: '#43A047' },
];

const emptyForm: CarrierFormData = {
  carrier_key: '',
  name: '',
  description: '',
  price_label: '',
  subtext: '',
  icon: '🚛',
  priority: 0,
  allows_collect: false,
  service_types: [],
};

export default function CarrierServiceOptionsPage() {
  const { t } = useTranslation();
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CarrierFormData>(emptyForm);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState(0); // 0 = Paquetería (standard), 1 = Por Cobrar (collect)

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const carrierType = activeTab === 0 ? 'standard' : 'collect';

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append('icon', file);
      const res = await fetch(`${API_URL}/api/admin/carrier-options/upload-icon`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.iconUrl) {
        setForm(prev => ({ ...prev, icon: data.iconUrl }));
        setSnackbar({ open: true, message: 'Imagen subida correctamente', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: data.error || 'Error al subir imagen', severity: 'error' });
      }
    } catch (err) {
      console.error('Error uploading icon:', err);
      setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
    } finally {
      setUploadingIcon(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fetchCarriers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/carrier-options?carrier_type=${carrierType}`, { headers });
      const data = await res.json();
      if (data.success) {
        setCarriers(data.data);
      }
    } catch (err) {
      console.error('Error fetching carriers:', err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrierType]);

  useEffect(() => {
    fetchCarriers();
  }, [fetchCarriers]);

  const handleOpenCreate = () => {
    setEditingId(null);
    if (carrierType === 'collect') {
      setForm({ ...emptyForm, price_label: 'Por cobrar', allows_collect: true });
    } else {
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleOpenEdit = (carrier: CarrierOption) => {
    setEditingId(carrier.id);
    setForm({
      carrier_key: carrier.carrier_key,
      name: carrier.name,
      description: carrier.description || '',
      price_label: carrier.price_label || '',
      subtext: carrier.subtext || '',
      icon: carrier.icon || '🚛',
      priority: carrier.priority,
      allows_collect: carrier.allows_collect || false,
      service_types: carrier.service_types || [],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const url = editingId 
        ? `${API_URL}/api/admin/carrier-options/${editingId}`
        : `${API_URL}/api/admin/carrier-options`;
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, carrier_type: carrierType }),
      });
      const data = await res.json();
      
      if (data.success) {
        setSnackbar({ open: true, message: editingId ? t('carrierOptions.updated') : t('carrierOptions.created'), severity: 'success' });
        setDialogOpen(false);
        fetchCarriers();
      } else {
        setSnackbar({ open: true, message: data.error || 'Error', severity: 'error' });
      }
    } catch (err) {
      console.error('Error saving carrier:', err);
      setSnackbar({ open: true, message: 'Error de conexión', severity: 'error' });
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/carrier-options/${id}/toggle`, {
        method: 'PATCH',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setCarriers(prev => prev.map(c => c.id === id ? { ...c, is_active: data.data.is_active } : c));
        setSnackbar({ open: true, message: t('carrierOptions.toggled'), severity: 'success' });
      }
    } catch (err) {
      console.error('Error toggling carrier:', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/carrier-options/${id}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setSnackbar({ open: true, message: t('carrierOptions.deleted'), severity: 'success' });
        setDeleteConfirm(null);
        fetchCarriers();
      }
    } catch (err) {
      console.error('Error deleting carrier:', err);
    }
  };

  const handleServiceToggle = (svc: string) => {
    setForm(prev => ({
      ...prev,
      service_types: prev.service_types.includes(svc)
        ? prev.service_types.filter(s => s !== svc)
        : [...prev.service_types, svc]
    }));
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight="bold">
            📦 {t('carrierOptions.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('carrierOptions.subtitle')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('carrierOptions.refresh')}>
            <IconButton onClick={fetchCarriers} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D14A1E' } }}
          >
            {t('carrierOptions.addNew')}
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            '& .MuiTab-root': { fontWeight: 'bold', textTransform: 'none', fontSize: '0.95rem' },
            '& .Mui-selected': { color: '#F05A28' },
            '& .MuiTabs-indicator': { backgroundColor: '#F05A28' },
          }}
        >
          <Tab icon={<ShippingIcon />} iconPosition="start" label="Paquetería" />
          <Tab icon={<CollectIcon />} iconPosition="start" label="Por Cobrar" />
        </Tabs>
      </Paper>

      {/* Info */}
      <Alert severity="info" sx={{ mb: 3 }}>
        {activeTab === 0
          ? t('carrierOptions.info')
          : 'Paqueterías de tipo "Por Cobrar". Estas opciones siempre se cotizan a $0 ya que el costo lo cubre el destinatario. El cliente las usa para asignar instrucciones de envío.'}
      </Alert>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell width={40}><DragIcon fontSize="small" color="disabled" /></TableCell>
                <TableCell width={50}>{t('carrierOptions.icon')}</TableCell>
                <TableCell><strong>{t('carrierOptions.carrierName')}</strong></TableCell>
                <TableCell>{t('carrierOptions.key')}</TableCell>
                <TableCell>{t('carrierOptions.description')}</TableCell>
                <TableCell>{t('carrierOptions.priceLabel')}</TableCell>
                <TableCell>{t('carrierOptions.services')}</TableCell>
                <TableCell align="center">{t('carrierOptions.allowsCollect')}</TableCell>
                <TableCell align="center">{t('carrierOptions.active')}</TableCell>
                <TableCell align="center">{t('carrierOptions.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {carriers.map((carrier) => (
                <TableRow 
                  key={carrier.id}
                  sx={{ 
                    opacity: carrier.is_active ? 1 : 0.5,
                    '&:hover': { bgcolor: '#fafafa' }
                  }}
                >
                  <TableCell>
                    <Typography color="text.secondary" fontSize={14}>{carrier.priority}</Typography>
                  </TableCell>
                  <TableCell>
                    {carrier.icon && (carrier.icon.startsWith('http') || carrier.icon.startsWith('/')) ? (
                      <img src={carrier.icon} alt={carrier.name} style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4 }} />
                    ) : (
                      <Typography fontSize={24}>{carrier.icon}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight="bold">{carrier.name}</Typography>
                    {carrier.subtext && (
                      <Typography variant="caption" color="text.secondary">{carrier.subtext}</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={carrier.carrier_key} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{carrier.description || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={carrier.price_label || '—'} 
                      size="small" 
                      color={carrier.price_label === 'GRATIS' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {(carrier.service_types || []).map(svc => {
                        const opt = SERVICE_TYPE_OPTIONS.find(o => o.value === svc);
                        return (
                          <Chip 
                            key={svc}
                            label={opt?.label || svc}
                            size="small"
                            sx={{ 
                              bgcolor: opt?.color + '20',
                              color: opt?.color,
                              fontWeight: 'bold',
                              fontSize: '0.65rem',
                              height: 22,
                            }}
                          />
                        );
                      })}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={carrier.allows_collect ? t('carrierOptions.yes') : t('carrierOptions.no')}
                      size="small"
                      color={carrier.allows_collect ? 'success' : 'default'}
                      variant={carrier.allows_collect ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={carrier.is_active}
                      onChange={() => handleToggle(carrier.id)}
                      color="success"
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <Tooltip title={t('carrierOptions.edit')}>
                        <IconButton size="small" onClick={() => handleOpenEdit(carrier)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('carrierOptions.delete')}>
                        <IconButton size="small" color="error" onClick={() => setDeleteConfirm(carrier.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {carriers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <ShippingIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography color="text.secondary">{t('carrierOptions.empty')}</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Leyenda de servicios */}
      <Paper sx={{ mt: 3, p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
          {t('carrierOptions.serviceTypesLegend')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {SERVICE_TYPE_OPTIONS.map(opt => (
            <Box key={opt.value} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: opt.color }} />
              <Typography variant="body2">{opt.label} <code>({opt.value})</code></Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId ? t('carrierOptions.editTitle') : t('carrierOptions.createTitle')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('carrierOptions.key')}
                value={form.carrier_key}
                onChange={e => setForm(prev => ({ ...prev, carrier_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                disabled={!!editingId}
                size="small"
                fullWidth
                placeholder="ej: local, express"
                helperText={t('carrierOptions.keyHelp')}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">Icono</Typography>
                {form.icon && (form.icon.startsWith('http') || form.icon.startsWith('/')) ? (
                  <img src={form.icon} alt="icon" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 4, border: '1px solid #e0e0e0' }} />
                ) : (
                  <Box sx={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e0e0e0', borderRadius: 1, fontSize: 24 }}>
                    {form.icon || '🚛'}
                  </Box>
                )}
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UploadIcon />}
                  component="label"
                  sx={{ textTransform: 'none' }}
                >
                  Subir
                  <input type="file" hidden accept="image/*" ref={fileInputRef} onChange={handleIconUpload} />
                </Button>
                {uploadingIcon && <CircularProgress size={20} />}
              </Box>
            </Box>
            <TextField
              label={t('carrierOptions.carrierName')}
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              size="small"
              fullWidth
              required
              placeholder="ej: EntregaX Local"
            />
            <TextField
              label={t('carrierOptions.description')}
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              size="small"
              fullWidth
              placeholder="ej: 1-2 días hábiles"
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('carrierOptions.priceLabel')}
                value={carrierType === 'collect' ? 'Por cobrar' : form.price_label}
                onChange={e => setForm(prev => ({ ...prev, price_label: e.target.value }))}
                size="small"
                fullWidth
                disabled={carrierType === 'collect'}
                placeholder="ej: GRATIS, $350 MXN"
                helperText={carrierType === 'collect' ? 'Siempre "Por cobrar" en esta sección' : undefined}
              />
              <TextField
                label={t('carrierOptions.priorityLabel')}
                type="number"
                value={form.priority}
                onChange={e => setForm(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                size="small"
                sx={{ width: 100 }}
              />
            </Box>
            <TextField
              label={t('carrierOptions.subtextLabel')}
              value={form.subtext}
              onChange={e => setForm(prev => ({ ...prev, subtext: e.target.value }))}
              size="small"
              fullWidth
              placeholder="ej: $350 x 1 caja"
            />

            {/* Permite por cobrar */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.allows_collect}
                  onChange={e => setForm(prev => ({ ...prev, allows_collect: e.target.checked }))}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight="bold">
                    {t('carrierOptions.allowsCollect')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('carrierOptions.allowsCollectHelp')}
                  </Typography>
                </Box>
              }
            />

            {/* Tipos de servicio */}
            <Box>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                {t('carrierOptions.availableFor')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {SERVICE_TYPE_OPTIONS.map(opt => (
                  <FormControlLabel
                    key={opt.value}
                    control={
                      <Checkbox
                        checked={form.service_types.includes(opt.value)}
                        onChange={() => handleServiceToggle(opt.value)}
                        sx={{ color: opt.color, '&.Mui-checked': { color: opt.color } }}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" fontWeight="bold" sx={{ color: opt.color }}>
                        {opt.label}
                      </Typography>
                    }
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('carrierOptions.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.carrier_key || !form.name || form.service_types.length === 0}
            sx={{ bgcolor: '#F05A28', '&:hover': { bgcolor: '#D14A1E' } }}
          >
            {editingId ? t('carrierOptions.save') : t('carrierOptions.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog confirmar eliminación */}
      <Dialog open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>{t('carrierOptions.confirmDelete')}</DialogTitle>
        <DialogContent>
          <Typography>{t('carrierOptions.confirmDeleteText')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>{t('carrierOptions.cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
          >
            {t('carrierOptions.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
