import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Snackbar,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import FlightIcon from '@mui/icons-material/Flight';
import DirectionsBoatIcon from '@mui/icons-material/DirectionsBoat';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ORANGE = '#F05A28';
const BLACK = '#111';

interface LogisticsService {
  id: number;
  code: string;
  name: string;
  calculation_type: string;
  requires_dimensions: boolean;
  is_active: boolean;
  fiscal_emitter_id: number | null;
  fiscal_emitter_name: string | null;
  fiscal_business_name: string | null;
  fiscal_rfc: string | null;
  warehouse_address: string | null;
  warehouse_contact: string | null;
  warehouse_phone: string | null;
  warehouse_email: string | null;
  icon: string | null;
  created_at: string;
}

interface FiscalEmitter {
  id: number;
  alias: string;
  rfc: string;
  business_name: string;
  is_active: boolean;
}

const getServiceIcon = (code: string) => {
  if (code.includes('AIR') || code.includes('aereo')) return <FlightIcon sx={{ fontSize: 40 }} />;
  if (code.includes('SEA') || code.includes('maritimo')) return <DirectionsBoatIcon sx={{ fontSize: 40 }} />;
  if (code.includes('POBOX') || code.includes('USA')) return <InventoryIcon sx={{ fontSize: 40 }} />;
  return <LocalShippingIcon sx={{ fontSize: 40 }} />;
};

const getServiceColor = (code: string) => {
  if (code.includes('AIR')) return '#2196f3';
  if (code.includes('SEA')) return '#00bcd4';
  if (code.includes('POBOX') || code.includes('USA')) return ORANGE;
  if (code.includes('AA') || code.includes('DHL')) return '#9c27b0';
  return '#4caf50';
};

export default function ServiceTypesPage() {
  const { i18n } = useTranslation();
  const [services, setServices] = useState<LogisticsService[]>([]);
  const [emitters, setEmitters] = useState<FiscalEmitter[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // Modal de edición
  const [openModal, setOpenModal] = useState(false);
  const [selectedService, setSelectedService] = useState<LogisticsService | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    fiscal_emitter_id: '' as string | number,
    warehouse_address: '',
    warehouse_contact: '',
    warehouse_phone: '',
    warehouse_email: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const getToken = () => localStorage.getItem('token');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [servicesRes, emittersRes] = await Promise.all([
        axios.get(`${API_URL}/admin/logistics-services`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        axios.get(`${API_URL}/admin/fiscal/emitters`, { headers: { Authorization: `Bearer ${getToken()}` } }).catch(() => ({ data: [] }))
      ]);
      setServices(servicesRes.data.services || []);
      setEmitters(emittersRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setSnackbar({ open: true, message: 'Error al cargar datos', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEdit = (service: LogisticsService) => {
    setSelectedService(service);
    setFormData({
      name: service.name || '',
      fiscal_emitter_id: service.fiscal_emitter_id || '',
      warehouse_address: service.warehouse_address || '',
      warehouse_contact: service.warehouse_contact || '',
      warehouse_phone: service.warehouse_phone || '',
      warehouse_email: service.warehouse_email || '',
      is_active: service.is_active,
    });
    setOpenModal(true);
  };

  const handleSave = async () => {
    if (!selectedService) return;
    setSaving(true);
    try {
      await axios.put(
        `${API_URL}/admin/logistics-services/${selectedService.id}`,
        {
          ...formData,
          fiscal_emitter_id: formData.fiscal_emitter_id || null,
        },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: 'Servicio actualizado correctamente', severity: 'success' });
      setOpenModal(false);
      loadData();
    } catch (error) {
      console.error('Error updating service:', error);
      setSnackbar({ open: true, message: 'Error al actualizar servicio', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress sx={{ color: ORANGE }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK }}>
            📦 {i18n.language === 'es' ? 'Tipos de Servicio' : 'Service Types'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es'
              ? 'Gestiona la información de bodegas y facturación por tipo de servicio'
              : 'Manage warehouse and billing info by service type'}
          </Typography>
        </Box>
        <Tooltip title={i18n.language === 'es' ? 'Actualizar datos' : 'Refresh data'}>
          <IconButton onClick={loadData} sx={{ bgcolor: 'grey.100' }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <Chip
          icon={<CheckCircleIcon />}
          label={`${services.filter(s => s.is_active).length} Activos`}
          color="success"
          variant="outlined"
        />
        <Chip
          icon={<CancelIcon />}
          label={`${services.filter(s => !s.is_active).length} Inactivos`}
          color="error"
          variant="outlined"
        />
        <Chip
          icon={<BusinessIcon />}
          label={`${services.filter(s => s.fiscal_emitter_id).length} con Facturador`}
          color="primary"
          variant="outlined"
        />
      </Box>

      {/* Service Cards Grid */}
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        gap: 3 
      }}>
        {services.map((service) => (
          <Box key={service.id}>
            <Card
              sx={{
                height: '100%',
                position: 'relative',
                border: service.is_active ? 'none' : '2px dashed #ccc',
                opacity: service.is_active ? 1 : 0.7,
                transition: 'all 0.3s',
                '&:hover': {
                  boxShadow: 6,
                  transform: 'translateY(-4px)',
                },
              }}
            >
              {/* Header con color */}
              <Box
                sx={{
                  background: `linear-gradient(135deg, ${getServiceColor(service.code)} 0%, ${getServiceColor(service.code)}99 100%)`,
                  color: 'white',
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  {getServiceIcon(service.code)}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight="bold">{service.name}</Typography>
                  <Chip
                    label={service.code}
                    size="small"
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', mt: 0.5 }}
                  />
                </Box>
                <IconButton
                  onClick={() => handleEdit(service)}
                  sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
                >
                  <EditIcon />
                </IconButton>
              </Box>

              <CardContent>
                {/* Razón Social */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight="bold">
                    🏢 RAZÓN SOCIAL
                  </Typography>
                  {service.fiscal_emitter_id ? (
                    <Box sx={{ mt: 0.5, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                      <Typography variant="body2" fontWeight="bold">{service.fiscal_emitter_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{service.fiscal_business_name}</Typography>
                      <br />
                      <Chip label={service.fiscal_rfc} size="small" sx={{ mt: 0.5 }} />
                    </Box>
                  ) : (
                    <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                      Sin asignar
                    </Alert>
                  )}
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Información de Bodega */}
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight="bold">
                    📍 INFORMACIÓN DE BODEGA
                  </Typography>
                  
                  {service.warehouse_address || service.warehouse_contact || service.warehouse_phone ? (
                    <Box sx={{ mt: 1 }}>
                      {service.warehouse_address && (
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                          <LocationOnIcon sx={{ fontSize: 18, color: 'text.secondary', mt: 0.3 }} />
                          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                            {service.warehouse_address}
                          </Typography>
                        </Box>
                      )}
                      {service.warehouse_contact && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <PersonIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          <Typography variant="body2">{service.warehouse_contact}</Typography>
                        </Box>
                      )}
                      {service.warehouse_phone && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <PhoneIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          <Typography variant="body2">{service.warehouse_phone}</Typography>
                        </Box>
                      )}
                      {service.warehouse_email && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <EmailIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          <Typography variant="body2">{service.warehouse_email}</Typography>
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <Alert severity="info" sx={{ mt: 1, py: 0 }}>
                      Sin configurar
                    </Alert>
                  )}
                </Box>

                {/* Status */}
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Chip
                    icon={service.is_active ? <CheckCircleIcon /> : <CancelIcon />}
                    label={service.is_active ? 'Activo' : 'Inactivo'}
                    color={service.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </Box>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      {/* Modal de Edición */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white' }}>
          ✏️ Editar Tipo de Servicio
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedService && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
              {/* Nombre del Servicio */}
              <TextField
                label="Nombre del Servicio"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                fullWidth
              />

              {/* Razón Social */}
              <FormControl fullWidth>
                <InputLabel>Razón Social</InputLabel>
                <Select
                  value={formData.fiscal_emitter_id}
                  label="Razón Social"
                  onChange={(e) => setFormData({ ...formData, fiscal_emitter_id: e.target.value })}
                >
                  <MenuItem value="">
                    <em>Sin asignar</em>
                  </MenuItem>
                  {emitters.filter(e => e.is_active).map((emitter) => (
                    <MenuItem key={emitter.id} value={emitter.id}>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">{emitter.alias}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {emitter.business_name} • {emitter.rfc}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Divider sx={{ my: 1 }}>
                <Chip label="Información de Bodega" size="small" />
              </Divider>

              {/* Dirección de Bodega */}
              <TextField
                label="Dirección de Bodega"
                value={formData.warehouse_address}
                onChange={(e) => setFormData({ ...formData, warehouse_address: e.target.value })}
                multiline
                rows={2}
                fullWidth
                placeholder="Ej: 123 Main St, Suite 100, Los Angeles, CA 90001"
              />

              {/* Contacto */}
              <TextField
                label="Nombre de Contacto"
                value={formData.warehouse_contact}
                onChange={(e) => setFormData({ ...formData, warehouse_contact: e.target.value })}
                fullWidth
                placeholder="Ej: Juan Pérez"
              />

              {/* Teléfono y Email */}
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Teléfono"
                  value={formData.warehouse_phone}
                  onChange={(e) => setFormData({ ...formData, warehouse_phone: e.target.value })}
                  fullWidth
                  placeholder="Ej: +1 (555) 123-4567"
                />
                <TextField
                  label="Email"
                  value={formData.warehouse_email}
                  onChange={(e) => setFormData({ ...formData, warehouse_email: e.target.value })}
                  fullWidth
                  placeholder="Ej: bodega@empresa.com"
                />
              </Box>

              {/* Estado */}
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    color="success"
                  />
                }
                label={formData.is_active ? 'Servicio Activo' : 'Servicio Inactivo'}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
          >
            {saving ? <CircularProgress size={24} color="inherit" /> : 'Guardar Cambios'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
