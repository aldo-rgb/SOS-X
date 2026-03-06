import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { 
  Box, Typography, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, TextField, Button,
  Card, CardContent, Chip, Avatar, CircularProgress,
  Alert, Snackbar, Tooltip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel, Tabs, Tab,
  Divider, LinearProgress
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import BusinessIcon from '@mui/icons-material/Business';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaymentsIcon from '@mui/icons-material/Payments';
import SettingsIcon from '@mui/icons-material/Settings';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const ORANGE = '#F05A28';
const BLACK = '#111';

interface FiscalEmitter {
  id: number;
  alias: string;
  rfc: string;
  business_name: string;
  fiscal_regime: string;
  zip_code: string;
  is_active: boolean;
  created_at: string;
  openpay_configured?: boolean;
  openpay_production_mode?: boolean;
  openpay_merchant_id?: string;
  clientes_con_clabe?: number;
}

interface Invoice {
  id: number;
  consolidation_id: number;
  uuid: string;
  folio: string;
  status: string;
  pdf_url: string;
  xml_url: string;
  amount: string;
  emitter_alias: string;
  emitter_rfc: string;
  receiver_rfc: string;
  receiver_name: string;
  client_name: string;
  created_at: string;
}

const FISCAL_REGIMES = [
  { code: '601', label: 'General de Ley Personas Morales' },
  { code: '603', label: 'Personas Morales con Fines no Lucrativos' },
  { code: '605', label: 'Sueldos y Salarios' },
  { code: '606', label: 'Arrendamiento' },
  { code: '607', label: 'Régimen de Enajenación o Adquisición de Bienes' },
  { code: '608', label: 'Demás Ingresos' },
  { code: '610', label: 'Residentes en el Extranjero sin EP' },
  { code: '612', label: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '614', label: 'Ingresos por Intereses' },
  { code: '616', label: 'Sin Obligaciones Fiscales' },
  { code: '620', label: 'Sociedades Cooperativas de Producción' },
  { code: '621', label: 'Incorporación Fiscal' },
  { code: '622', label: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { code: '623', label: 'Opcional para Grupos de Sociedades' },
  { code: '624', label: 'Coordinados' },
  { code: '625', label: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
  { code: '626', label: 'Régimen Simplificado de Confianza' },
];

export default function FiscalPage() {
  const { i18n } = useTranslation();
  const [emitters, setEmitters] = useState<FiscalEmitter[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [tabValue, setTabValue] = useState(0);
  
  // Configuración de servicios por empresa
  const [serviceConfig, setServiceConfig] = useState<any[]>([]);
  const [savingService, setSavingService] = useState<number | null>(null);
  
  // Modal crear/editar emisor
  const [openModal, setOpenModal] = useState(false);
  const [editingEmitter, setEditingEmitter] = useState<FiscalEmitter | null>(null);
  const [emitterForm, setEmitterForm] = useState({
    alias: '', rfc: '', business_name: '', fiscal_regime: '', zip_code: '', api_key: '', is_active: true
  });
  const [saving, setSaving] = useState(false);

  // Modal Openpay
  const [openOpenpayModal, setOpenOpenpayModal] = useState(false);
  const [selectedEmpresaOpenpay, setSelectedEmpresaOpenpay] = useState<FiscalEmitter | null>(null);
  const [openpayForm, setOpenpayForm] = useState({
    merchant_id: '',
    private_key: '',
    public_key: '',
    production_mode: false,
    webhook_secret: '',
    commission_fee: '10.00'
  });
  const [savingOpenpay, setSavingOpenpay] = useState(false);

  const getToken = () => localStorage.getItem('token');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [emittersRes, invoicesRes, serviceConfigRes] = await Promise.all([
        axios.get(`${API_URL}/admin/openpay/empresas`, { headers: { Authorization: `Bearer ${getToken()}` } }).catch(() =>
          axios.get(`${API_URL}/admin/fiscal/emitters`, { headers: { Authorization: `Bearer ${getToken()}` } })
        ),
        axios.get(`${API_URL}/admin/invoices`, { headers: { Authorization: `Bearer ${getToken()}` } }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/admin/fiscal/service-config`, { headers: { Authorization: `Bearer ${getToken()}` } }).catch(() => ({ data: [] }))
      ]);
      setEmitters(emittersRes.data);
      setInvoices(invoicesRes.data);
      setServiceConfig(serviceConfigRes.data || []);
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

  // Guardar asignación de empresa a servicio
  const handleSaveServiceConfig = async (serviceId: number, emitterId: number | null) => {
    setSavingService(serviceId);
    try {
      await axios.put(`${API_URL}/admin/fiscal/service-config/${serviceId}`, 
        { emitter_id: emitterId },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setSnackbar({ open: true, message: '✅ Configuración guardada', severity: 'success' });
      loadData();
    } catch (error) {
      console.error('Error saving service config:', error);
      setSnackbar({ open: true, message: 'Error al guardar configuración', severity: 'error' });
    } finally {
      setSavingService(null);
    }
  };

  const handleOpenModal = (emitter?: FiscalEmitter) => {
    if (emitter) {
      setEditingEmitter(emitter);
      setEmitterForm({
        alias: emitter.alias || '',
        rfc: emitter.rfc,
        business_name: emitter.business_name,
        fiscal_regime: emitter.fiscal_regime || '',
        zip_code: emitter.zip_code || '',
        api_key: '',
        is_active: emitter.is_active
      });
    } else {
      setEditingEmitter(null);
      setEmitterForm({ alias: '', rfc: '', business_name: '', fiscal_regime: '', zip_code: '', api_key: '', is_active: true });
    }
    setOpenModal(true);
  };

  const handleSaveEmitter = async () => {
    if (!emitterForm.rfc || !emitterForm.business_name) {
      setSnackbar({ open: true, message: 'RFC y Razón Social son requeridos', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      if (editingEmitter) {
        await axios.put(`${API_URL}/admin/fiscal/emitters`, 
          { id: editingEmitter.id, ...emitterForm },
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        setSnackbar({ open: true, message: 'Empresa actualizada', severity: 'success' });
      } else {
        await axios.post(`${API_URL}/admin/fiscal/emitters`, emitterForm, { 
          headers: { Authorization: `Bearer ${getToken()}` } 
        });
        setSnackbar({ open: true, message: 'Empresa creada exitosamente', severity: 'success' });
      }
      setOpenModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving emitter:', error);
      setSnackbar({ open: true, message: 'Error al guardar empresa', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Funciones Openpay
  const handleOpenOpenpayModal = async (emitter: FiscalEmitter) => {
    setSelectedEmpresaOpenpay(emitter);
    // Cargar configuración existente
    try {
      const res = await axios.get(`${API_URL}/admin/openpay/config/${emitter.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.data) {
        setOpenpayForm({
          merchant_id: res.data.openpay_merchant_id || '',
          private_key: '',
          public_key: res.data.openpay_public_key || '',
          production_mode: res.data.openpay_production_mode || false,
          webhook_secret: '',
          commission_fee: res.data.openpay_commission_fee?.toString() || '10.00'
        });
      }
    } catch (e) {
      setOpenpayForm({
        merchant_id: '', private_key: '', public_key: '', production_mode: false, webhook_secret: '', commission_fee: '10.00'
      });
    }
    setOpenOpenpayModal(true);
  };

  const handleSaveOpenpay = async () => {
    if (!selectedEmpresaOpenpay) return;
    if (!openpayForm.merchant_id || !openpayForm.private_key) {
      setSnackbar({ open: true, message: 'Merchant ID y Private Key son requeridos', severity: 'error' });
      return;
    }
    setSavingOpenpay(true);
    try {
      const response = await axios.post(`${API_URL}/admin/openpay/config`, {
        empresa_id: selectedEmpresaOpenpay.id,
        merchant_id: openpayForm.merchant_id,
        private_key: openpayForm.private_key,
        public_key: openpayForm.public_key,
        production_mode: openpayForm.production_mode,
        webhook_secret: openpayForm.webhook_secret,
        commission_fee: parseFloat(openpayForm.commission_fee) || 10
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      
      setSnackbar({ 
        open: true, 
        message: `✅ Openpay configurado para ${selectedEmpresaOpenpay.alias}. Webhook: ${response.data.webhook_url}`, 
        severity: 'success' 
      });
      setOpenOpenpayModal(false);
      loadData();
    } catch (error: any) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error al configurar Openpay', 
        severity: 'error' 
      });
    } finally {
      setSavingOpenpay(false);
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ color: BLACK }}>
            🧾 {i18n.language === 'es' ? 'Facturación Fiscal' : 'Fiscal Invoicing'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.language === 'es' 
              ? 'Administra empresas emisoras y facturas CFDI' 
              : 'Manage issuing companies and CFDI invoices'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button 
            variant="contained" 
            startIcon={<AddBusinessIcon />}
            onClick={() => handleOpenModal()}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
          >
            {i18n.language === 'es' ? 'Nueva Empresa' : 'New Company'}
          </Button>
          <Tooltip title={i18n.language === 'es' ? 'Actualizar' : 'Refresh'}>
            <IconButton onClick={loadData} sx={{ bgcolor: 'grey.100' }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
        <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{emitters.filter(e => e.is_active).length}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Empresas Activas' : 'Active Companies'}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <BusinessIcon sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
          <Card sx={{ background: `linear-gradient(135deg, #4caf50 0%, #81c784 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{invoices.filter(i => i.status === 'generated').length}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Facturas Emitidas' : 'Invoices Issued'}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <ReceiptLongIcon sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
          <Card sx={{ background: `linear-gradient(135deg, #f44336 0%, #e57373 100%)`, color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h3" fontWeight="bold">{invoices.filter(i => i.status === 'cancelled').length}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {i18n.language === 'es' ? 'Canceladas' : 'Cancelled'}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
                  <CancelIcon sx={{ fontSize: 32 }} />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<BusinessIcon />} label={i18n.language === 'es' ? 'Mis Empresas' : 'My Companies'} />
          <Tab icon={<SettingsIcon />} label="Servicios" />
          <Tab icon={<ReceiptLongIcon />} label={i18n.language === 'es' ? 'Facturas' : 'Invoices'} />
        </Tabs>
      </Paper>

      {/* Tab Empresas */}
      {tabValue === 0 && (
        <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ bgcolor: BLACK, px: 3, py: 2 }}>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
              🏢 {i18n.language === 'es' ? 'Empresas Emisoras (RFCs)' : 'Issuing Companies (Tax IDs)'}
            </Typography>
          </Box>
          
          <Alert severity="info" sx={{ m: 2 }}>
            {i18n.language === 'es' 
              ? 'Registra aquí tus diferentes RFCs. Luego asígnalos a cada tipo de servicio en la sección de Comisiones.'
              : 'Register your different Tax IDs here. Then assign them to each service type in the Commissions section.'}
          </Alert>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Empresa' : 'Company'}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>RFC</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Régimen' : 'Regime'}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>C.P.</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Openpay</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Estado' : 'Status'}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Acciones' : 'Actions'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {emitters.length > 0 ? emitters.map((emitter) => (
                  <TableRow key={emitter.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: emitter.is_active ? ORANGE : 'grey.400' }}>
                          <BusinessIcon />
                        </Avatar>
                        <Box>
                          <Typography fontWeight="bold">{emitter.alias || 'Sin alias'}</Typography>
                          <Typography variant="caption" color="text.secondary">{emitter.business_name}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={emitter.rfc} size="small" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }} />
                    </TableCell>
                    <TableCell>
                      {FISCAL_REGIMES.find(r => r.code === emitter.fiscal_regime)?.code || emitter.fiscal_regime || '-'}
                    </TableCell>
                    <TableCell>{emitter.zip_code || '-'}</TableCell>
                    <TableCell align="center">
                      {emitter.openpay_configured ? (
                        <Tooltip title={`${emitter.clientes_con_clabe || 0} clientes con CLABE - ${emitter.openpay_production_mode ? 'Producción' : 'Sandbox'}`}>
                          <Chip 
                            icon={<AccountBalanceIcon />}
                            label={emitter.openpay_production_mode ? 'Prod' : 'Sand'}
                            color={emitter.openpay_production_mode ? 'success' : 'warning'}
                            size="small"
                            onClick={() => handleOpenOpenpayModal(emitter)}
                            sx={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Configurar Openpay para cobranza SPEI">
                          <Chip 
                            icon={<SettingsIcon />}
                            label="Configurar"
                            color="default"
                            size="small"
                            onClick={() => handleOpenOpenpayModal(emitter)}
                            sx={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={emitter.is_active ? (i18n.language === 'es' ? 'Activa' : 'Active') : (i18n.language === 'es' ? 'Inactiva' : 'Inactive')}
                        color={emitter.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton onClick={() => handleOpenModal(emitter)} size="small">
                        <EditIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <BusinessIcon sx={{ fontSize: 48, color: 'grey.300', mb: 1 }} />
                      <Typography color="text.secondary">
                        {i18n.language === 'es' ? 'No hay empresas registradas. Agrega tu primera empresa emisora.' : 'No companies registered. Add your first issuing company.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Tab Servicios - Configuración de empresa por servicio */}
      {tabValue === 1 && (
        <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ bgcolor: BLACK, px: 3, py: 2 }}>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
              ⚙️ Configuración de Servicios por Empresa
            </Typography>
          </Box>

          <Alert severity="info" sx={{ m: 2 }}>
            Asigna qué empresa (RFC) cobrará cada tipo de servicio. El sistema enviará las instrucciones de pago correspondientes según el servicio.
          </Alert>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>Servicio</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Código</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Empresa Asignada</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Estado</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {serviceConfig.map((service) => (
                  <TableRow key={service.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {service.service_type === 'POBOX_USA' && '📦'}
                        {service.service_type === 'AIR_CHN_MX' && '✈️'}
                        {service.service_type === 'SEA_CHN_MX' && '🚢'}
                        {service.service_type === 'AA_DHL' && '🚚'}
                        <Typography fontWeight="medium">{service.service_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={service.service_type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 250 }}>
                        <Select
                          value={service.emitter_id || ''}
                          onChange={(e) => handleSaveServiceConfig(service.id, e.target.value ? Number(e.target.value) : null)}
                          displayEmpty
                        >
                          <MenuItem value="">
                            <em>Sin asignar</em>
                          </MenuItem>
                          {emitters.filter(e => e.is_active).map((emitter) => (
                            <MenuItem key={emitter.id} value={emitter.id}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <BusinessIcon fontSize="small" />
                                {emitter.alias || emitter.business_name} ({emitter.rfc})
                              </Box>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell align="center">
                      {service.emitter_id ? (
                        <Chip 
                          icon={<CheckCircleIcon />} 
                          label="Configurado" 
                          color="success" 
                          size="small" 
                        />
                      ) : (
                        <Chip 
                          icon={<CancelIcon />} 
                          label="Sin Asignar" 
                          color="warning" 
                          size="small" 
                          variant="outlined"
                        />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {savingService === service.id ? (
                        <CircularProgress size={20} />
                      ) : (
                        service.emitter_alias && (
                          <Tooltip title={`Empresa: ${service.emitter_alias}`}>
                            <Chip 
                              label={service.emitter_rfc} 
                              size="small" 
                              color="primary" 
                              variant="outlined"
                            />
                          </Tooltip>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="caption" color="text.secondary">
              💡 Las instrucciones de pago (CLABE, transferencia, etc.) se enviarán según la empresa configurada para cada servicio.
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Tab Facturas */}
      {tabValue === 2 && (
        <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ bgcolor: BLACK, px: 3, py: 2 }}>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
              📄 {i18n.language === 'es' ? 'Historial de Facturas' : 'Invoice History'}
            </Typography>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>Folio</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Cliente' : 'Client'}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Receptor' : 'Receiver'}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Emisor' : 'Issuer'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Monto' : 'Amount'}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Estado' : 'Status'}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Fecha' : 'Date'}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>{i18n.language === 'es' ? 'Descargar' : 'Download'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.length > 0 ? invoices.map((invoice) => (
                  <TableRow key={invoice.id} hover>
                    <TableCell>
                      <Chip label={invoice.folio} size="small" color="primary" />
                    </TableCell>
                    <TableCell>{invoice.client_name}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{invoice.receiver_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{invoice.receiver_rfc}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{invoice.emitter_alias}</Typography>
                      <Typography variant="caption" color="text.secondary">{invoice.emitter_rfc}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight="bold">${parseFloat(invoice.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        icon={invoice.status === 'generated' ? <CheckCircleIcon /> : <CancelIcon />}
                        label={invoice.status === 'generated' ? 'Timbrada' : 'Cancelada'}
                        color={invoice.status === 'generated' ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption">
                        {new Date(invoice.created_at).toLocaleDateString('es-MX')}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <Tooltip title="PDF">
                          <IconButton size="small" sx={{ color: '#D32F2F' }} onClick={() => window.open(invoice.pdf_url, '_blank')}>
                            <DescriptionIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="XML">
                          <IconButton size="small" sx={{ color: '#1976D2' }} onClick={() => window.open(invoice.xml_url, '_blank')}>
                            <DescriptionIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <ReceiptLongIcon sx={{ fontSize: 48, color: 'grey.300', mb: 1 }} />
                      <Typography color="text.secondary">
                        {i18n.language === 'es' ? 'Aún no hay facturas generadas' : 'No invoices generated yet'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Modal Crear/Editar Empresa */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: ORANGE, color: 'white', fontWeight: 'bold' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BusinessIcon /> {editingEmitter 
              ? (i18n.language === 'es' ? 'Editar Empresa' : 'Edit Company')
              : (i18n.language === 'es' ? 'Nueva Empresa Emisora' : 'New Issuing Company')}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={i18n.language === 'es' ? 'Alias (Nombre corto)' : 'Alias (Short name)'}
              value={emitterForm.alias}
              onChange={(e) => setEmitterForm({ ...emitterForm, alias: e.target.value })}
              placeholder="Ej: Empresa Aérea"
              fullWidth
            />
            <TextField
              label="RFC"
              value={emitterForm.rfc}
              onChange={(e) => setEmitterForm({ ...emitterForm, rfc: e.target.value.toUpperCase() })}
              inputProps={{ maxLength: 13 }}
              fullWidth required
            />
            <TextField
              label={i18n.language === 'es' ? 'Razón Social' : 'Business Name'}
              value={emitterForm.business_name}
              onChange={(e) => setEmitterForm({ ...emitterForm, business_name: e.target.value })}
              fullWidth required
            />
            <FormControl fullWidth>
              <InputLabel>{i18n.language === 'es' ? 'Régimen Fiscal' : 'Fiscal Regime'}</InputLabel>
              <Select
                value={emitterForm.fiscal_regime}
                label={i18n.language === 'es' ? 'Régimen Fiscal' : 'Fiscal Regime'}
                onChange={(e) => setEmitterForm({ ...emitterForm, fiscal_regime: e.target.value })}
              >
                {FISCAL_REGIMES.map(regime => (
                  <MenuItem key={regime.code} value={regime.code}>{regime.code} - {regime.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={i18n.language === 'es' ? 'Código Postal' : 'Zip Code'}
              value={emitterForm.zip_code}
              onChange={(e) => setEmitterForm({ ...emitterForm, zip_code: e.target.value })}
              inputProps={{ maxLength: 5 }}
              fullWidth
            />
            <TextField
              label="API Key (PAC)"
              value={emitterForm.api_key}
              onChange={(e) => setEmitterForm({ ...emitterForm, api_key: e.target.value })}
              placeholder={editingEmitter ? '(Sin cambios si se deja vacío)' : ''}
              type="password"
              fullWidth
              helperText={i18n.language === 'es' ? 'Llave de tu proveedor de timbrado (Facturama, etc.)' : 'Your stamping provider API key'}
            />
            <FormControlLabel
              control={
                <Switch 
                  checked={emitterForm.is_active} 
                  onChange={(e) => setEmitterForm({ ...emitterForm, is_active: e.target.checked })}
                  color="success"
                />
              }
              label={i18n.language === 'es' ? 'Empresa Activa' : 'Active Company'}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenModal(false)} disabled={saving}>
            {i18n.language === 'es' ? 'Cancelar' : 'Cancel'}
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSaveEmitter}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            sx={{ background: `linear-gradient(135deg, ${ORANGE} 0%, #ff7849 100%)` }}
          >
            {i18n.language === 'es' ? 'Guardar' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Configuración Openpay */}
      <Dialog open={openOpenpayModal} onClose={() => setOpenOpenpayModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1a73e8', color: 'white', fontWeight: 'bold' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceIcon /> Configuración Openpay - {selectedEmpresaOpenpay?.alias}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              🏦 <strong>Cobranza SPEI Automática:</strong> Cada cliente recibe una CLABE virtual STP única.
              Cuando transfieren a esa CLABE, el pago se aplica automáticamente a sus guías pendientes.
            </Typography>
          </Alert>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Merchant ID"
              value={openpayForm.merchant_id}
              onChange={(e) => setOpenpayForm({ ...openpayForm, merchant_id: e.target.value })}
              placeholder="mxxxxxxxxxxxxxxxx"
              fullWidth
              required
              helperText="ID de tu comercio en Openpay"
            />
            <TextField
              label="Private Key (API Key)"
              value={openpayForm.private_key}
              onChange={(e) => setOpenpayForm({ ...openpayForm, private_key: e.target.value })}
              type="password"
              fullWidth
              required
              helperText="Llave privada de API (sk_...)"
            />
            <TextField
              label="Public Key (Opcional)"
              value={openpayForm.public_key}
              onChange={(e) => setOpenpayForm({ ...openpayForm, public_key: e.target.value })}
              fullWidth
              helperText="Llave pública para frontend (pk_...)"
            />
            <TextField
              label="Comisión STP por transacción (MXN)"
              value={openpayForm.commission_fee}
              onChange={(e) => setOpenpayForm({ ...openpayForm, commission_fee: e.target.value })}
              type="number"
              fullWidth
              helperText="Comisión que Openpay descuenta por cada transferencia (~$8-12)"
              InputProps={{ startAdornment: <Typography sx={{ mr: 1 }}>$</Typography> }}
            />
            
            <Divider sx={{ my: 1 }} />
            
            <FormControlLabel
              control={
                <Switch 
                  checked={openpayForm.production_mode} 
                  onChange={(e) => setOpenpayForm({ ...openpayForm, production_mode: e.target.checked })}
                  color="success"
                />
              }
              label={
                <Box>
                  <Typography fontWeight="bold">
                    {openpayForm.production_mode ? '🟢 Modo Producción' : '🟡 Modo Sandbox (Pruebas)'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {openpayForm.production_mode 
                      ? 'Transacciones reales con dinero real' 
                      : 'Ambiente de pruebas sin transacciones reales'}
                  </Typography>
                </Box>
              }
            />

            {selectedEmpresaOpenpay?.openpay_configured && (
              <Alert severity="success" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  ✅ Openpay ya está configurado para esta empresa.
                  {selectedEmpresaOpenpay.clientes_con_clabe ? ` ${selectedEmpresaOpenpay.clientes_con_clabe} clientes tienen CLABE asignada.` : ''}
                </Typography>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">
            Webhook: /webhooks/openpay/{selectedEmpresaOpenpay?.id}
          </Typography>
          <Box>
            <Button onClick={() => setOpenOpenpayModal(false)} disabled={savingOpenpay}>
              Cancelar
            </Button>
            <Button 
              variant="contained" 
              onClick={handleSaveOpenpay}
              disabled={savingOpenpay}
              startIcon={savingOpenpay ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              sx={{ ml: 1, bgcolor: '#1a73e8' }}
            >
              {savingOpenpay ? 'Verificando...' : 'Guardar y Verificar'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
