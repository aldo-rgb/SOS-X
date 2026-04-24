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
  Divider
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
import SettingsIcon from '@mui/icons-material/Settings';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteIcon from '@mui/icons-material/Delete';

const API_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3001/api';
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

// Bancos mexicanos comunes
const BANCOS_MEXICO = [
  'BBVA México', 'Banorte', 'Santander', 'HSBC', 'Scotiabank', 'Citibanamex',
  'Banco Azteca', 'BanCoppel', 'Inbursa', 'Banregio', 'Bajío', 'Afirme', 'STP'
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

  // Modal Cuenta Bancaria
  const [openBankModal, setOpenBankModal] = useState(false);
  const [selectedEmpresaBank, setSelectedEmpresaBank] = useState<any>(null);
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    bank_clabe: '',
    bank_account: ''
  });
  const [savingBank, setSavingBank] = useState(false);

  // Modal PayPal
  const [openPaypalModal, setOpenPaypalModal] = useState(false);
  const [selectedEmpresaPaypal, setSelectedEmpresaPaypal] = useState<any>(null);
  const [paypalForm, setPaypalForm] = useState({
    paypal_client_id: '',
    paypal_secret: '',
    paypal_sandbox: true
  });
  const [savingPaypal, setSavingPaypal] = useState(false);

  // Modal Belvo
  const [openBelvoModal, setOpenBelvoModal] = useState(false);
  const [selectedEmpresaBelvo, setSelectedEmpresaBelvo] = useState<any>(null);
  const [belvoLinks, setBelvoLinks] = useState<any[]>([]);
  const [belvoLoading, setBelvoLoading] = useState(false);
  const [belvoStats, setBelvoStats] = useState<any>(null);
  const [syncingBelvo, setSyncingBelvo] = useState<number | null>(null);

  // Modal Facturama (recepción CFDI)
  const [openFacturamaModal, setOpenFacturamaModal] = useState(false);
  const [selectedEmpresaFacturama, setSelectedEmpresaFacturama] = useState<any>(null);
  const [facturamaForm, setFacturamaForm] = useState({
    facturama_username: '',
    facturama_password: '',
    facturama_environment: 'sandbox',
    facturama_reception_enabled: true,
    facturama_webhook_secret: ''
  });
  const [facturamaConfig, setFacturamaConfig] = useState<any>(null);
  const [savingFacturama, setSavingFacturama] = useState(false);
  const [syncingFacturama, setSyncingFacturama] = useState(false);

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

  // ========== FUNCIONES DE BANCO ==========
  const handleOpenBankModal = async (emitter: any) => {
    setSelectedEmpresaBank(emitter);
    try {
      const res = await axios.get(`${API_URL}/admin/empresa/bank/${emitter.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.data) {
        setBankForm({
          bank_name: res.data.bank_name || '',
          bank_clabe: res.data.bank_clabe || '',
          bank_account: res.data.bank_account || ''
        });
      }
    } catch (e) {
      setBankForm({ bank_name: '', bank_clabe: '', bank_account: '' });
    }
    setOpenBankModal(true);
  };

  const handleSaveBank = async () => {
    if (!selectedEmpresaBank) return;
    if (!bankForm.bank_name || !bankForm.bank_clabe) {
      setSnackbar({ open: true, message: 'Banco y CLABE son requeridos', severity: 'error' });
      return;
    }
    if (!/^\d{18}$/.test(bankForm.bank_clabe)) {
      setSnackbar({ open: true, message: 'La CLABE debe tener 18 dígitos', severity: 'error' });
      return;
    }
    setSavingBank(true);
    try {
      await axios.post(`${API_URL}/admin/empresa/bank`, {
        empresa_id: selectedEmpresaBank.id,
        bank_name: bankForm.bank_name,
        bank_clabe: bankForm.bank_clabe,
        bank_account: bankForm.bank_account || bankForm.bank_clabe.slice(-10)
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      
      setSnackbar({ open: true, message: `✅ Cuenta bancaria configurada para ${selectedEmpresaBank.alias}`, severity: 'success' });
      setOpenBankModal(false);
      loadData();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error al guardar cuenta bancaria', severity: 'error' });
    } finally {
      setSavingBank(false);
    }
  };

  // ========== FUNCIONES DE PAYPAL ==========
  const handleOpenPaypalModal = async (emitter: any) => {
    setSelectedEmpresaPaypal(emitter);
    try {
      const res = await axios.get(`${API_URL}/admin/empresa/paypal/${emitter.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.data) {
        setPaypalForm({
          paypal_client_id: res.data.paypal_client_id || '',
          paypal_secret: '',
          paypal_sandbox: res.data.paypal_sandbox !== false
        });
      }
    } catch (e) {
      setPaypalForm({ paypal_client_id: '', paypal_secret: '', paypal_sandbox: true });
    }
    setOpenPaypalModal(true);
  };

  const handleSavePaypal = async () => {
    if (!selectedEmpresaPaypal) return;
    if (!paypalForm.paypal_client_id || !paypalForm.paypal_secret) {
      setSnackbar({ open: true, message: 'Client ID y Secret son requeridos', severity: 'error' });
      return;
    }
    setSavingPaypal(true);
    try {
      await axios.post(`${API_URL}/admin/empresa/paypal`, {
        empresa_id: selectedEmpresaPaypal.id,
        paypal_client_id: paypalForm.paypal_client_id,
        paypal_secret: paypalForm.paypal_secret,
        paypal_sandbox: paypalForm.paypal_sandbox
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      
      setSnackbar({ open: true, message: `✅ PayPal configurado para ${selectedEmpresaPaypal.alias}`, severity: 'success' });
      setOpenPaypalModal(false);
      loadData();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error al configurar PayPal', severity: 'error' });
    } finally {
      setSavingPaypal(false);
    }
  };

  // ========== FUNCIONES DE BELVO ==========
  const handleOpenBelvoModal = async (emitter: any) => {
    setSelectedEmpresaBelvo(emitter);
    setBelvoLoading(true);
    setOpenBelvoModal(true);
    try {
      const [linksRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/admin/belvo/links?emitter_id=${emitter.id}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        }).catch(() => ({ data: { links: [] } })),
        axios.get(`${API_URL}/admin/belvo/stats?emitter_id=${emitter.id}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        }).catch(() => ({ data: {} })),
      ]);
      setBelvoLinks(linksRes.data.links || []);
      setBelvoStats(statsRes.data || null);
    } catch (e) {
      setBelvoLinks([]);
      setBelvoStats(null);
    } finally {
      setBelvoLoading(false);
    }
  };

  const handleConnectBelvo = async () => {
    if (!selectedEmpresaBelvo) return;
    try {
      const tokenRes = await axios.post(`${API_URL}/admin/belvo/widget-token`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const { access } = tokenRes.data;

      // Load Belvo widget script
      const script = document.createElement('script');
      // Ensure belvo container div exists
      if (!document.getElementById('belvo')) {
        const belvoDiv = document.createElement('div');
        belvoDiv.id = 'belvo';
        document.body.appendChild(belvoDiv);
      }

      script.src = 'https://cdn.belvo.io/belvo-widget-1-stable.js';
      script.onload = () => {
        const belvoWidget = (window as any).belvoSDK.createWidget(access, {
          company_name: 'EntregaX',
          company_benefit_header: 'Conecta tu cuenta bancaria',
          company_benefit_content: 'Para extraer automáticamente los movimientos y conciliar pagos.',
          locale: 'es',
          country_codes: ['MX'],
          institution_types: ['business', 'retail'],
          callback: async (link: string, institution: string) => {
            // Link created successfully
            try {
              await axios.post(`${API_URL}/admin/belvo/links`, {
                emitter_id: selectedEmpresaBelvo.id,
                link_id: link,
                institution: institution,
                institution_name: institution,
                access_mode: 'recurrent'
              }, { headers: { Authorization: `Bearer ${getToken()}` } });

              setSnackbar({ open: true, message: `✅ Banco conectado vía Belvo para ${selectedEmpresaBelvo.alias}`, severity: 'success' });
              handleOpenBelvoModal(selectedEmpresaBelvo); // Refresh
              loadData();
            } catch (err: any) {
              setSnackbar({ open: true, message: err.response?.data?.error || 'Error registrando link', severity: 'error' });
            }
          },
          onExit: () => {
            // Clean up belvo div on exit
            const belvoDiv = document.getElementById('belvo');
            if (belvoDiv) belvoDiv.innerHTML = '';
          },
          onEvent: (event: any) => {
            console.log('Belvo widget event:', event);
          }
        });
        belvoWidget.build();
      };
      document.body.appendChild(script);
    } catch (error: any) {
      setSnackbar({ 
        open: true, 
        message: error.response?.data?.error || 'Error iniciando widget de Belvo. Verifica que BELVO_SECRET_ID y BELVO_SECRET_PASSWORD estén configurados.', 
        severity: 'error' 
      });
    }
  };

  const handleSyncBelvoLink = async (linkId: number) => {
    setSyncingBelvo(linkId);
    try {
      const res = await axios.post(`${API_URL}/admin/belvo/sync`, {
        link_id: linkId,
        days_back: 7
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setSnackbar({ 
        open: true, 
        message: `✅ Sincronizado: ${res.data.new_count || 0} nuevas transacciones, ${res.data.matched_count || 0} conciliadas`, 
        severity: 'success' 
      });
      if (selectedEmpresaBelvo) handleOpenBelvoModal(selectedEmpresaBelvo);
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error sincronizando', severity: 'error' });
    } finally {
      setSyncingBelvo(null);
    }
  };

  const handleDeleteBelvoLink = async (linkId: number) => {
    if (!confirm('¿Estás seguro de desconectar este banco? Se eliminarán las transacciones descargadas.')) return;
    try {
      await axios.delete(`${API_URL}/admin/belvo/links/${linkId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSnackbar({ open: true, message: '✅ Banco desconectado', severity: 'success' });
      if (selectedEmpresaBelvo) handleOpenBelvoModal(selectedEmpresaBelvo);
      loadData();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error desconectando', severity: 'error' });
    }
  };

  // ========== FUNCIONES DE FACTURAMA ==========
  const handleOpenFacturamaModal = async (emitter: any) => {
    setSelectedEmpresaFacturama(emitter);
    setFacturamaConfig(null);
    setFacturamaForm({
      facturama_username: '',
      facturama_password: '',
      facturama_environment: emitter.facturama_environment || 'sandbox',
      facturama_reception_enabled: emitter.facturama_reception_enabled ?? true,
      facturama_webhook_secret: ''
    });
    setOpenFacturamaModal(true);
    try {
      const r = await axios.get(`${API_URL}/admin/facturama/config/${emitter.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setFacturamaConfig(r.data);
      setFacturamaForm(f => ({
        ...f,
        facturama_username: r.data.facturama_username || '',
        facturama_environment: r.data.facturama_environment || 'sandbox',
        facturama_reception_enabled: r.data.facturama_reception_enabled ?? true
      }));
    } catch { /* sin config previa */ }
  };

  const handleSaveFacturamaConfig = async () => {
    if (!selectedEmpresaFacturama) return;
    if (!facturamaForm.facturama_username || !facturamaForm.facturama_password) {
      setSnackbar({ open: true, message: 'Usuario y contraseña son requeridos', severity: 'error' });
      return;
    }
    setSavingFacturama(true);
    try {
      const r = await axios.post(`${API_URL}/admin/facturama/config`, {
        emitter_id: selectedEmpresaFacturama.id,
        ...facturamaForm
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      const okText = r.data.connection_ok ? '✅ Conexión validada' : '⚠️ Guardado, pero conexión no validada';
      setSnackbar({
        open: true,
        message: `${okText}. Webhook URL: ${r.data.webhook_url}`,
        severity: r.data.connection_ok ? 'success' : 'warning'
      });
      setOpenFacturamaModal(false);
      loadData();
    } catch (error: any) {
      setSnackbar({ open: true, message: error.response?.data?.error || 'Error guardando Facturama', severity: 'error' });
    } finally {
      setSavingFacturama(false);
    }
  };

  const handleSyncFacturama = async () => {
    if (!selectedEmpresaFacturama) return;
    setSyncingFacturama(true);
    try {
      const today = new Date();
      const monthAgo = new Date(today);
      monthAgo.setDate(today.getDate() - 30);
      const r = await axios.post(`${API_URL}/admin/facturama/sync/${selectedEmpresaFacturama.id}`, {
        from: monthAgo.toISOString().slice(0, 10),
        to: today.toISOString().slice(0, 10)
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setSnackbar({
        open: true,
        message: `✅ Sincronización: ${r.data.inserted} nuevas, ${r.data.skipped} omitidas (de ${r.data.total_found})`,
        severity: 'success'
      });
      loadData();
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: error.response?.data?.detail || error.response?.data?.error || 'Error sincronizando',
        severity: 'error'
      });
    } finally {
      setSyncingFacturama(false);
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
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Banco</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>PayPal</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Belvo</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>Facturama</TableCell>
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
                    {/* Banco */}
                    <TableCell align="center">
                      {(emitter as any).bank_clabe ? (
                        <Tooltip title={`${(emitter as any).bank_name}: ${(emitter as any).bank_clabe}`}>
                          <Chip 
                            icon={<AccountBalanceIcon />}
                            label={(emitter as any).bank_name?.slice(0, 8) || 'CLABE'}
                            color="success"
                            size="small"
                            onClick={() => handleOpenBankModal(emitter)}
                            sx={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Configurar cuenta bancaria para pagos efectivo/SPEI">
                          <Chip 
                            icon={<AccountBalanceIcon />}
                            label="Configurar"
                            color="default"
                            size="small"
                            onClick={() => handleOpenBankModal(emitter)}
                            sx={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    {/* PayPal */}
                    <TableCell align="center">
                      {(emitter as any).paypal_configured ? (
                        <Tooltip title={`PayPal configurado (${(emitter as any).paypal_sandbox ? 'Sandbox' : 'Producción'})`}>
                          <Chip 
                            label={(emitter as any).paypal_sandbox ? 'Sand' : 'Prod'}
                            color={(emitter as any).paypal_sandbox ? 'warning' : 'success'}
                            size="small"
                            onClick={() => handleOpenPaypalModal(emitter)}
                            sx={{ cursor: 'pointer', bgcolor: '#003087', color: 'white' }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Configurar PayPal para pagos">
                          <Chip 
                            label="Configurar"
                            color="default"
                            size="small"
                            onClick={() => handleOpenPaypalModal(emitter)}
                            sx={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    {/* Belvo */}
                    <TableCell align="center">
                      {(emitter as any).belvo_connected ? (
                        <Tooltip title={`Belvo conectado: ${(emitter as any).belvo_institution || 'Banco'}`}>
                          <Chip 
                            icon={<LinkIcon />}
                            label={(emitter as any).belvo_institution?.slice(0, 8) || 'Conectado'}
                            color="success"
                            size="small"
                            onClick={() => handleOpenBelvoModal(emitter)}
                            sx={{ cursor: 'pointer', bgcolor: '#00695c', color: 'white' }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Conectar banco vía Belvo para extracción automática">
                          <Chip 
                            icon={<LinkOffIcon />}
                            label="Conectar"
                            color="default"
                            size="small"
                            onClick={() => handleOpenBelvoModal(emitter)}
                            sx={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    {/* Facturama */}
                    <TableCell align="center">
                      {(emitter as any).facturama_configured ? (
                        <Tooltip title={`Facturama (${(emitter as any).facturama_environment || 'sandbox'}) - Recepción ${(emitter as any).facturama_reception_enabled ? 'ON' : 'OFF'}`}>
                          <Chip
                            icon={<ReceiptLongIcon />}
                            label={(emitter as any).facturama_environment === 'production' ? 'Prod' : 'Sand'}
                            color={(emitter as any).facturama_environment === 'production' ? 'success' : 'warning'}
                            size="small"
                            onClick={() => handleOpenFacturamaModal(emitter)}
                            sx={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Configurar Facturama para recepción automática de CFDI (Cuentas por Pagar)">
                          <Chip
                            icon={<SettingsIcon />}
                            label="Configurar"
                            color="default"
                            size="small"
                            onClick={() => handleOpenFacturamaModal(emitter)}
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
                    <TableCell colSpan={11} align="center" sx={{ py: 4 }}>
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

      {/* ========== Modal Configuración Cuenta Bancaria ========== */}
      <Dialog open={openBankModal} onClose={() => setOpenBankModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#2e7d32', color: 'white', fontWeight: 'bold' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceIcon /> Cuenta Bancaria - {selectedEmpresaBank?.alias}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              🏦 <strong>Cuenta para pagos en efectivo/SPEI:</strong> Esta cuenta se mostrará al cliente cuando seleccione "Pago en Sucursal" o "Transferencia SPEI".
            </Typography>
          </Alert>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Banco</InputLabel>
              <Select
                value={bankForm.bank_name}
                label="Banco"
                onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
              >
                {BANCOS_MEXICO.map(banco => (
                  <MenuItem key={banco} value={banco}>{banco}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="CLABE Interbancaria"
              value={bankForm.bank_clabe}
              onChange={(e) => setBankForm({ ...bankForm, bank_clabe: e.target.value.replace(/\D/g, '').slice(0, 18) })}
              inputProps={{ maxLength: 18 }}
              fullWidth
              required
              helperText={`${bankForm.bank_clabe.length}/18 dígitos`}
              error={bankForm.bank_clabe.length > 0 && bankForm.bank_clabe.length !== 18}
            />
            <TextField
              label="Número de Cuenta (opcional)"
              value={bankForm.bank_account}
              onChange={(e) => setBankForm({ ...bankForm, bank_account: e.target.value.replace(/\D/g, '') })}
              fullWidth
              helperText="Se extraerá automáticamente de la CLABE si no se proporciona"
            />

            {selectedEmpresaBank?.bank_clabe && (
              <Alert severity="success" sx={{ mt: 1 }}>
                <Typography variant="body2">
                  ✅ Cuenta bancaria configurada: {selectedEmpresaBank.bank_name} - {selectedEmpresaBank.bank_clabe}
                </Typography>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenBankModal(false)} disabled={savingBank}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveBank}
            disabled={savingBank}
            startIcon={savingBank ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            sx={{ bgcolor: '#2e7d32' }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== Modal Configuración PayPal ========== */}
      <Dialog open={openPaypalModal} onClose={() => setOpenPaypalModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#003087', color: 'white', fontWeight: 'bold' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            💳 PayPal - {selectedEmpresaPaypal?.alias}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              💳 <strong>Pagos con PayPal:</strong> Configura las credenciales de PayPal para aceptar pagos con tarjeta y saldo PayPal desde la app móvil.
            </Typography>
          </Alert>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="PayPal Client ID"
              value={paypalForm.paypal_client_id}
              onChange={(e) => setPaypalForm({ ...paypalForm, paypal_client_id: e.target.value })}
              placeholder="AYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              fullWidth
              required
              helperText="Se obtiene desde PayPal Developer Dashboard"
            />
            <TextField
              label="PayPal Secret"
              value={paypalForm.paypal_secret}
              onChange={(e) => setPaypalForm({ ...paypalForm, paypal_secret: e.target.value })}
              type="password"
              fullWidth
              required
              helperText="Clave secreta de la aplicación PayPal"
            />
            
            <Divider sx={{ my: 1 }} />
            
            <FormControlLabel
              control={
                <Switch 
                  checked={paypalForm.paypal_sandbox} 
                  onChange={(e) => setPaypalForm({ ...paypalForm, paypal_sandbox: e.target.checked })}
                  color="warning"
                />
              }
              label={
                <Box>
                  <Typography fontWeight="bold">
                    {paypalForm.paypal_sandbox ? '🟡 Modo Sandbox (Pruebas)' : '🟢 Modo Producción'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {paypalForm.paypal_sandbox 
                      ? 'Ambiente de pruebas sin transacciones reales' 
                      : 'Transacciones reales con dinero real'}
                  </Typography>
                </Box>
              }
            />

            {selectedEmpresaPaypal?.paypal_configured && (
              <Alert severity="success" sx={{ mt: 1 }}>
                <Typography variant="body2">
                  ✅ PayPal ya está configurado ({selectedEmpresaPaypal.paypal_sandbox ? 'Sandbox' : 'Producción'})
                </Typography>
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenPaypalModal(false)} disabled={savingPaypal}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSavePaypal}
            disabled={savingPaypal}
            startIcon={savingPaypal ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            sx={{ bgcolor: '#003087' }}
          >
            {savingPaypal ? 'Verificando...' : 'Guardar y Verificar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== Modal Belvo - Conexión Bancaria Automática ========== */}
      <Dialog open={openBelvoModal} onClose={() => setOpenBelvoModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#00695c', color: 'white', fontWeight: 'bold' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LinkIcon /> Belvo - Extracción Automática - {selectedEmpresaBelvo?.alias}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              🏦 <strong>Conexión bancaria automática:</strong> Conecta tu cuenta bancaria para que los movimientos se descarguen automáticamente.
              El sistema conciliará los depósitos con las órdenes de pago pendientes.
            </Typography>
          </Alert>

          {belvoLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: '#00695c' }} />
            </Box>
          ) : (
            <>
              {/* Stats */}
              {belvoStats && (
                <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                  <Chip label={`${belvoStats.active_links || 0} conexiones`} color="primary" size="small" />
                  <Chip label={`${belvoStats.total_inflows || 0} depósitos`} color="success" size="small" />
                  <Chip label={`${belvoStats.matched_count || 0} conciliados`} color="info" size="small" />
                  <Chip label={`${belvoStats.pending_count || 0} por revisar`} color="warning" size="small" />
                </Box>
              )}

              {/* Active Links */}
              {belvoLinks.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>Bancos Conectados</Typography>
                  {belvoLinks.map((link: any) => (
                    <Box key={link.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, mb: 1, bgcolor: 'grey.50', borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <AccountBalanceIcon color="success" />
                        <Box>
                          <Typography fontWeight="bold" variant="body2">{link.institution_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Estado: {link.status === 'valid' ? '🟢 Activo' : '🔴 ' + link.status}
                            {link.last_accessed_at && ` • Último sync: ${new Date(link.last_accessed_at).toLocaleDateString('es-MX')}`}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Sincronizar transacciones">
                          <IconButton 
                            size="small" 
                            onClick={() => handleSyncBelvoLink(link.id)}
                            disabled={syncingBelvo === link.id}
                            sx={{ color: '#00695c' }}
                          >
                            {syncingBelvo === link.id ? <CircularProgress size={18} /> : <SyncIcon />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Desconectar banco">
                          <IconButton size="small" color="error" onClick={() => handleDeleteBelvoLink(link.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Connect Button */}
              <Button
                variant="contained"
                startIcon={<LinkIcon />}
                onClick={handleConnectBelvo}
                fullWidth
                sx={{ bgcolor: '#00695c', '&:hover': { bgcolor: '#004d40' }, py: 1.5 }}
              >
                {belvoLinks.length > 0 ? 'Conectar Otro Banco' : 'Conectar Banco'}
              </Button>

              {belvoLinks.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                  Se abrirá una ventana segura de Belvo para iniciar sesión en tu banca en línea.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenBelvoModal(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* ========== MODAL FACTURAMA — Recepción CFDI ========== */}
      <Dialog open={openFacturamaModal} onClose={() => setOpenFacturamaModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#0a3d62', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptLongIcon /> Facturama — Recepción Automática de CFDI
        </DialogTitle>
        <DialogContent sx={{ pt: 3, mt: 1 }}>
          {selectedEmpresaFacturama && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Configurando para: <strong>{selectedEmpresaFacturama.alias}</strong> ({selectedEmpresaFacturama.rfc}).
                Las facturas recibidas entrarán automáticamente a Cuentas por Pagar como <strong>Pendientes de Aprobación</strong>.
              </Alert>

              {facturamaConfig?.facturama_configured && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Ya configurado · ambiente: <strong>{facturamaConfig.facturama_environment}</strong>
                  {facturamaConfig.facturama_last_sync && (
                    <> · última sync: {new Date(facturamaConfig.facturama_last_sync).toLocaleString()}
                       ({facturamaConfig.facturama_last_sync_count || 0} facturas)</>
                  )}
                </Alert>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Ambiente</InputLabel>
                  <Select
                    label="Ambiente"
                    value={facturamaForm.facturama_environment}
                    onChange={(e) => setFacturamaForm(f => ({ ...f, facturama_environment: e.target.value as string }))}
                  >
                    <MenuItem value="sandbox">Sandbox (pruebas)</MenuItem>
                    <MenuItem value="production">Producción</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Usuario Facturama"
                  fullWidth
                  size="small"
                  value={facturamaForm.facturama_username}
                  onChange={(e) => setFacturamaForm(f => ({ ...f, facturama_username: e.target.value }))}
                  helperText="Usuario o email de la cuenta Facturama (multi-emisor)"
                />

                <TextField
                  label="Contraseña Facturama"
                  type="password"
                  fullWidth
                  size="small"
                  value={facturamaForm.facturama_password}
                  onChange={(e) => setFacturamaForm(f => ({ ...f, facturama_password: e.target.value }))}
                  helperText={facturamaConfig?.has_password ? 'Dejar vacío para conservar la actual' : 'Contraseña de la cuenta'}
                />

                <TextField
                  label="Webhook Secret (HMAC SHA256)"
                  fullWidth
                  size="small"
                  value={facturamaForm.facturama_webhook_secret}
                  onChange={(e) => setFacturamaForm(f => ({ ...f, facturama_webhook_secret: e.target.value }))}
                  helperText="Opcional. Se usa para validar la firma del webhook entrante."
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={facturamaForm.facturama_reception_enabled}
                      onChange={(e) => setFacturamaForm(f => ({ ...f, facturama_reception_enabled: e.target.checked }))}
                    />
                  }
                  label="Activar recepción automática de CFDI"
                />

                <Alert severity="warning" sx={{ fontSize: 12 }}>
                  📡 <strong>Webhook URL</strong> (configurar en Facturama tras guardar):<br/>
                  <code style={{ fontSize: 11 }}>
                    {`${API_URL.replace('/api','')}/api/webhooks/facturama/${selectedEmpresaFacturama.id}`}
                  </code>
                </Alert>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {facturamaConfig?.facturama_configured && (
            <Button
              onClick={handleSyncFacturama}
              disabled={syncingFacturama}
              startIcon={syncingFacturama ? <CircularProgress size={16} /> : <SyncIcon />}
            >
              Sincronizar últimos 30 días
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setOpenFacturamaModal(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSaveFacturamaConfig}
            disabled={savingFacturama}
            startIcon={savingFacturama ? <CircularProgress size={16} /> : <SaveIcon />}
            sx={{ bgcolor: '#0a3d62', '&:hover': { bgcolor: '#082c47' } }}
          >
            Guardar
          </Button>
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
