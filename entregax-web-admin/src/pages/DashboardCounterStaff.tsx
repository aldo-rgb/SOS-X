// ============================================
// DASHBOARD - PERSONAL DE MOSTRADOR
// Panel principal para Counter Staff
// ============================================

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  CircularProgress,
  Avatar,
  Chip,
  TextField,
  InputAdornment,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  QrCodeScanner as ScannerIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  AccessTime as AccessTimeIcon,
  Print as PrintIcon,
  LocalAtm as CashIcon,
  AssignmentTurnedIn as DeliveryIcon,
  LocalShipping as ShippingIcon,
  ArrowBack as BackIcon,
  CreditCard as CardIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  DirectionsBoat as BoatIcon,
  Payments as PaymentsIcon,
} from '@mui/icons-material';
import useModulePermissions from '../hooks/useModulePermissions';
import api from '../services/api';

// Importar componentes necesarios
import OutboundControlPage from './OutboundControlPage';
import POBoxCajaPage from './POBoxCajaPage';
import ShipmentsPage from './ShipmentsPage';
import ReprintLabelsPage from './ReprintLabelsPage';
import POBoxHubPage from './POBoxHubPage';
import RelabelingModulePage from './RelabelingModulePage';
import UnifiedWarehousePanel from './UnifiedWarehousePanel';

interface CounterStats {
  entregas: {
    pendientes: number;
    realizadas_hoy: number;
    en_espera: number;
  };
  cobros: {
    pendientes: number;
    cobrados_hoy: number;
    monto_cobrado: number;
  };
  recepciones: {
    hoy: number;
    por_registrar: number;
  };
  tdi?: {
    listas_envio: number;
    pdte_tracking: number;
  };
  bodegaChina?: {
    log_pdte_packing: number;
    xpay_pdte_proveedor: number;
  };
}

interface PendingDelivery {
  id: number;
  tracking: string;
  cliente: string;
  box_id: string;
  monto: number;
  status: string;
  llegada: string;
}

export default function DashboardCounterStaff() {
  const { t } = useTranslation();
  // Permisos por módulo para mostrar accesos directos según lo que el usuario puede ver.
  const { allowedModules: airModules } = useModulePermissions('ops_china_air', ['tdi_express', 'tdi_outbound']);
  const { allowedModules: seaAdminModules } = useModulePermissions('admin_china_sea', ['consolidations']);
  const canTdiExpress = airModules.includes('tdi_express') || airModules.includes('tdi_outbound');
  const canMaritimeConsolidations = seaAdminModules.includes('consolidations');
  // Sucursal del usuario: el botón "Pagos a Proveedor" es exclusivo de Bodega China (branch 8).
  const [branchId, setBranchId] = useState<number | null>(null);
  const isBodegaChina = branchId === 8;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CounterStats | null>(null);
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([]);
  const [dhlReadyBoxes, setDhlReadyBoxes] = useState<Array<{ id: number; tracking: string; box_id: string | null; client_name: string | null; weight: number }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [userName, setUserName] = useState('');
  
  // Estados para las acciones rápidas
  const [activeView, setActiveView] = useState<string | null>(null);
  const [receptionModalOpen, setReceptionModalOpen] = useState(false);
  const [entryWizardOpen, setEntryWizardOpen] = useState(false);
  const [bulkReceiveOpen, setBulkReceiveOpen] = useState(false);
  
  // Estados para el flujo de entrega Pick Up
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliveryStep, setDeliveryStep] = useState<'scan' | 'summary' | 'processing'>('scan');
  const [scanTrackingInput, setScanTrackingInput] = useState('');
  const [selectedPackages, setSelectedPackages] = useState<PendingDelivery[]>([]); // Múltiples paquetes
  const [prefilledTracking, setPrefilledTracking] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  
  // Estado para notificaciones
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, message: '', severity: 'info' });

  // Función para mostrar notificaciones
  const showNotification = (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification(prev => ({ ...prev, open: false }));
  };

  useEffect(() => {
    loadData();
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.name?.split(' ')[0] || 'Usuario');
      if (parsed.branch_id != null) setBranchId(Number(parsed.branch_id));
    }
    // Confirmar sucursal desde el perfil (por si no está en localStorage).
    api.get('/auth/profile')
      .then(r => {
        const bid = r.data?.user?.branch_id ?? r.data?.branch_id;
        if (bid != null) setBranchId(Number(bid));
      })
      .catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/dashboard/counter-staff');
      if (response.data) {
        setStats(response.data.stats);
        setPendingDeliveries(response.data.pendingDeliveries || []);
        setDhlReadyBoxes(response.data.dhlReadyBoxes || []);
      }
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      // Estado vacío: nunca mostrar clientes/box_ids ficticios.
      setStats(null);
      setPendingDeliveries([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'listo':
        return <Chip label="LISTO" color="success" size="small" />;
      case 'pendiente_pago':
        return <Chip label="PAGO PENDIENTE" color="warning" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  const quickActions = [
    { icon: <PrintIcon sx={{ fontSize: 48 }} />, title: t('counterDash.actions.labeling'), color: '#F05A28', action: 'relabeling' },
    // Escáner Multi-Sucursal: oculto para Bodega China (no aplica a su operación).
    ...(!isBodegaChina ? [{ icon: <ScannerIcon sx={{ fontSize: 48 }} />, title: t('counterDash.actions.multiScanner'), color: '#2196F3', action: 'scanner_multi' }] : []),
    // Accesos directos según permisos del usuario
    ...(canTdiExpress ? [{ icon: <ShippingIcon sx={{ fontSize: 48 }} />, title: t('counterDash.actions.dhlExpress'), color: '#FFCC00', iconColor: '#D40511', action: 'tdi_express' }] : []),
    ...(canMaritimeConsolidations ? [{ icon: <BoatIcon sx={{ fontSize: 48 }} />, title: t('counterDash.actions.maritime'), color: '#0277BD', action: 'maritime_consolidations' }] : []),
    // Exclusivo Bodega China: acceso a la plataforma de pagos a proveedor (tcmanual).
    ...(isBodegaChina ? [{ icon: <PaymentsIcon sx={{ fontSize: 48 }} />, title: t('counterDash.actions.supplierPay'), color: '#2E7D32', action: 'proveedor_tcmanual' }] : []),
  ];

  // Handler para acciones rápidas
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'relabeling':
        setActiveView('relabeling');
        break;
      case 'scanner_multi':
        setActiveView('scanner_multi');
        break;
      // Accesos directos a paneles (navegación a nivel App vía evento global)
      case 'tdi_express':
      case 'maritime_consolidations':
        window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', { detail: { action } }));
        break;
      case 'proveedor_tcmanual':
        window.open('https://wireusd.tcmanual.mx/loginchino', '_blank', 'noopener,noreferrer');
        break;
    }
  };

  // Handler para selección en modal de recepción
  const handleReceptionChoice = (choice: 'user' | 'package') => {
    setReceptionModalOpen(false);
    if (choice === 'package') {
      // Abrir modal de recepción paquetería (Recibir Paquetería en serie)
      setBulkReceiveOpen(true);
    } else {
      // Abrir wizard de Entrada (recibir envío de usuario)
      setEntryWizardOpen(true);
    }
  };

  // Continuar al pago
  const handleContinueToPayment = () => {
    if (selectedPackages.length === 0) {
      showNotification('Debes agregar al menos un paquete', 'warning');
      return;
    }
    if (!receiverName.trim()) {
      showNotification('Debes ingresar el nombre de quien recibe el paquete', 'warning');
      return;
    }
    
    // Ir al resumen de pago
    setDeliveryStep('summary');
  };

  // Buscar y agregar paquete por tracking
  const handleSearchAndAddPackage = () => {
    const tracking = scanTrackingInput.trim().toUpperCase();
    if (!tracking) return;
    
    // Verificar si ya está en la lista
    if (selectedPackages.some(p => p.tracking === tracking)) {
      showNotification('Esta guía ya está en la lista', 'warning');
      return;
    }
    
    // Buscar en pendingDeliveries
    const found = pendingDeliveries.find(p => p.tracking === tracking);
    if (found) {
      setSelectedPackages(prev => [...prev, found]);
      setScanTrackingInput('');
      showNotification(`Guía ${tracking} agregada`, 'success');
    } else {
      showNotification('Guía no encontrada en paquetes pendientes', 'warning');
    }
  };

  // Remover paquete de la lista
  const handleRemovePackage = (tracking: string) => {
    setSelectedPackages(prev => prev.filter(p => p.tracking !== tracking));
  };

  // Calcular total en USD
  const calculateTotalUSD = () => {
    return selectedPackages.reduce((sum, pkg) => sum + (pkg.monto || 3), 0);
  };

  // Confirmar pago (efectivo o tarjeta)
  const handleConfirmPayment = async (method: 'efectivo' | 'tarjeta') => {
    if (method === 'efectivo') {
      // Ir a Caja PO Box con las guías pre-cargadas
      setDeliveryModalOpen(false);
      // Por ahora solo pasamos la primera guía, pero se podrÃa modificar para múltiples
      setPrefilledTracking(selectedPackages.map(p => p.tracking).join(','));
      setActiveView('collect');
      resetDeliveryState();
    } else {
      // Tarjeta - Confirmar pago directamente para todas las guías
      setProcessingPayment(true);
      try {
        // Procesar cada paquete
        const trackings = selectedPackages.map(p => p.tracking);
        const response = await api.post('/admin/finance/confirm-payment-bulk', {
          referencias: trackings,
          metodo_confirmacion: 'tarjeta',
          notas: `Pago con tarjeta en mostrador - ${trackings.length} paquetes - Recibido por: ${receiverName}`,
          received_by: receiverName,
          monto_total_usd: calculateTotalUSD()
        });
        
        if (response.data.success) {
          setDeliveryModalOpen(false);
          showNotification(`✅ ${trackings.length} paquete(s) entregados y pagados con tarjeta`, 'success');
          loadData();
        }
      } catch (error) {
        console.error('Error confirmando pago:', error);
        const err = error as { response?: { data?: { error?: string } }; message?: string };
        showNotification('Error al confirmar pago: ' + (err.response?.data?.error || err.message), 'error');
      } finally {
        setProcessingPayment(false);
        resetDeliveryState();
      }
    }
  };

  // Reset estado de entrega
  const resetDeliveryState = () => {
    setDeliveryStep('scan');
    setSelectedPackages([]);
    setScanTrackingInput('');
    setReceiverName('');
  };

  // Cerrar modal de entrega
  const handleCloseDeliveryModal = () => {
    setDeliveryModalOpen(false);
    resetDeliveryState();
  };

  // Volver al dashboard
  const handleBackToDashboard = () => {
    setActiveView(null);
    setEntryWizardOpen(false);
    setBulkReceiveOpen(false);
    setPrefilledTracking(null);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // Si hay una vista activa, mostrarla con opción de volver
  if (activeView) {
    return (
      <Box sx={{ p: 3 }}>
        {/* Botón volver */}
        <Box sx={{ mb: 2 }}>
          <Chip
            icon={<BackIcon />}
            label={t('counterDash.backToDashboard')}
            onClick={handleBackToDashboard}
            sx={{ cursor: 'pointer' }}
            color="primary"
            variant="outlined"
          />
        </Box>

        {/* Renderizar vista correspondiente */}
        {activeView === 'exit' && <OutboundControlPage />}
        {activeView === 'collect' && (
          <POBoxCajaPage 
            initialSearchRef={prefilledTracking} 
            onPaymentConfirmed={() => {
              setActiveView(null);
              setPrefilledTracking(null);
              loadData();
            }}
          />
        )}
        {activeView === 'print' && <ReprintLabelsPage />}
        {activeView === 'relabeling' && <RelabelingModulePage onBack={handleBackToDashboard} />}
        {activeView === 'scanner_multi' && <UnifiedWarehousePanel />}
      </Box>
    );
  }

  // Si se abre el wizard de entrada (recibir envío de usuario)
  if (entryWizardOpen) {
    return (
      <Box sx={{ p: 3 }}>
        {/* Botón volver */}
        <Box sx={{ mb: 2 }}>
          <Chip
            icon={<BackIcon />}
            label={t('counterDash.backToDashboard')}
            onClick={handleBackToDashboard}
            sx={{ cursor: 'pointer' }}
            color="primary"
            variant="outlined"
          />
        </Box>

        {/* ShipmentsPage con wizard abierto - Entrada de usuario */}
        <ShipmentsPage users={[]} warehouseLocation="usa_pobox" openWizardOnMount={true} />
      </Box>
    );
  }

  // Si se abre recepción paquetería en serie (wizard de 2 pasos)
  if (bulkReceiveOpen) {
    return (
      <Box sx={{ p: 3 }}>
        {/* Botón volver */}
        <Box sx={{ mb: 2 }}>
          <Chip
            icon={<BackIcon />}
            label={t('counterDash.backToDashboard')}
            onClick={handleBackToDashboard}
            sx={{ cursor: 'pointer' }}
            color="primary"
            variant="outlined"
          />
        </Box>

        {/* POBoxHubPage con wizard de recepción abierto */}
        <POBoxHubPage openBulkReceiveOnMount={true} onBack={handleBackToDashboard} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Modal de selección: Usuario o Paquetería */}
      <Dialog 
        open={receptionModalOpen} 
        onClose={() => setReceptionModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
          <InventoryIcon sx={{ fontSize: 48, color: '#FF9800', mb: 1 }} />
          <Typography variant="h5" fontWeight="bold">
            ¿Qué tipo de recepción?
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
            Selecciona el tipo de recepción que deseas realizar
          </Typography>
          
          <Grid container spacing={2}>
            {/* Opción Usuario */}
            <Grid size={{ xs: 6 }}>
              <Card 
                sx={{ 
                  height: '100%',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': { 
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                    borderColor: '#2196F3',
                  },
                  border: '2px solid transparent',
                }}
                onClick={() => handleReceptionChoice('user')}
              >
                <CardActionArea sx={{ p: 3, textAlign: 'center' }}>
                  <Avatar 
                    sx={{ 
                      bgcolor: '#2196F3', 
                      width: 72, 
                      height: 72, 
                      mx: 'auto', 
                      mb: 2 
                    }}
                  >
                    <PersonIcon sx={{ fontSize: 40 }} />
                  </Avatar>
                  <Typography variant="h6" fontWeight="bold">Usuario</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recibir envío que trae un cliente
                  </Typography>
                </CardActionArea>
              </Card>
            </Grid>

            {/* Opción Paquetería */}
            <Grid size={{ xs: 6 }}>
              <Card 
                sx={{ 
                  height: '100%',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': { 
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                    borderColor: '#FF9800',
                  },
                  border: '2px solid transparent',
                }}
                onClick={() => handleReceptionChoice('package')}
              >
                <CardActionArea sx={{ p: 3, textAlign: 'center' }}>
                  <Avatar 
                    sx={{ 
                      bgcolor: '#FF9800', 
                      width: 72, 
                      height: 72, 
                      mx: 'auto', 
                      mb: 2 
                    }}
                  >
                    <ShippingIcon sx={{ fontSize: 40 }} />
                  </Avatar>
                  <Typography variant="h6" fontWeight="bold">Paquetería</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recepción en serie de courier
                  </Typography>
                </CardActionArea>
              </Card>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button onClick={() => setReceptionModalOpen(false)} color="inherit">
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Header con Buscador */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          {t('counterDash.greetingPre')}<span style={{ color: '#F05A28' }}>{userName}</span>{t('counterDash.greetingPost')} 🎯
        </Typography>

        {/* Buscador Principal */}
        <Paper sx={{ p: 2, mt: 2 }}>
          <TextField
            fullWidth
            placeholder={t('counterDash.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Button variant="contained" size="small" startIcon={<ScannerIcon />}>
                    {t('counterDash.scan')}
                  </Button>
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                bgcolor: 'grey.50',
              }
            }}
          />
        </Paper>
      </Box>

      {/* KPIs Principales — ocultos para rol mostrador (counter_staff) */}

      {/* Acciones Rápidas */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          ⚡ {t('counterDash.quickActions')}
        </Typography>
        <Grid container spacing={2}>
          {quickActions.map((action, index) => (
            <Grid size={{ xs: 6, sm: 3 }} key={index}>
              <Card 
                sx={{ 
                  height: '100%',
                  transition: 'all 0.2s',
                  '&:hover': { 
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  }
                }}
              >
                <CardActionArea 
                  sx={{ p: 3, textAlign: 'center' }}
                  onClick={() => handleQuickAction(action.action)}
                >
                  <Avatar
                    sx={{
                      bgcolor: action.color,
                      color: (action as any).iconColor || undefined,
                      width: 72,
                      height: 72,
                      mx: 'auto',
                      mb: 2,
                      boxShadow: 2,
                    }}
                  >
                    {action.icon}
                  </Avatar>
                  <Typography variant="subtitle1" fontWeight="bold">{action.title}</Typography>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Indicadores TDI Express (bodega China) */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: t('counterDash.widgets.readyDhl'), value: stats?.tdi?.listas_envio ?? 0, color: '#F9A825', action: 'tdi_outbound' },
          { label: t('counterDash.widgets.pendingDhlTracking'), value: stats?.tdi?.pdte_tracking ?? 0, color: '#C1272D', action: 'awb_update' },
          { label: t('counterDash.widgets.logPendingPacking'), value: stats?.bodegaChina?.log_pdte_packing ?? 0, color: '#B8860B', action: 'maritime_consolidations' as string | undefined, url: undefined as string | undefined },
          { label: t('counterDash.widgets.pendingSupplierPay'), value: stats?.bodegaChina?.xpay_pdte_proveedor ?? 0, color: '#1565C0', action: undefined as string | undefined, url: 'https://wireusd.tcmanual.mx/loginchino' as string | undefined },
        ].map((w) => (
          <Grid size={{ xs: 6, md: 3 }} key={w.label}>
            <Card
              sx={{ borderRadius: 2, border: '1px solid #ECECEC', overflow: 'hidden', cursor: (w.action || w.url) ? 'pointer' : 'default', transition: 'box-shadow .15s', ...((w.action || w.url) ? { '&:hover': { boxShadow: 3 } } : {}) }}
              onClick={
                w.url ? () => window.open(w.url, '_blank', 'noopener,noreferrer')
                : w.action ? () => window.dispatchEvent(new CustomEvent('branch-manager-quick-nav', { detail: { action: w.action } }))
                : undefined
              }
            >
              <Box sx={{ height: 4, bgcolor: w.color }} />
              <CardContent>
                <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>{w.label}</Typography>
                <Typography variant="h4" fontWeight="bold" sx={{ color: w.color }}>{w.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Bodega China: listado de guías listas para envío a México (DHL).
          Resto de mostradores: PickUp listos para entrega. */}
      {isBodegaChina ? (
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            📦 {t('counterDash.readyToMexicoTitle')}
          </Typography>
          <Chip label={t('counterDash.waiting', { n: dhlReadyBoxes.length })} color="primary" />
        </Box>

        <List>
          {dhlReadyBoxes.map((b, index) => (
            <Box key={b.id}>
              <ListItem sx={{ py: 1.5, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}
                secondaryAction={<Chip label={`${b.weight.toFixed(1)} kg`} size="small" color="info" />}>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: 'success.main' }}><InventoryIcon /></Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={<Typography variant="subtitle2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{b.tracking}</Typography>}
                  secondary={
                    <Typography variant="body2" component="span" color="text.secondary">
                      <PersonIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                      {(b.client_name || '—')}{b.box_id ? ` • ${b.box_id}` : ''}
                    </Typography>
                  }
                />
              </ListItem>
              {index < dhlReadyBoxes.length - 1 && <Divider variant="inset" component="li" />}
            </Box>
          ))}
        </List>

        {dhlReadyBoxes.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {t('counterDash.noReadyBoxes')}
            </Typography>
          </Box>
        )}
      </Paper>
      ) : (
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            📦 {t('counterDash.pickupTitle')}
          </Typography>
          <Chip label={t('counterDash.waiting', { n: pendingDeliveries.length })} color="primary" />
        </Box>

        <List>
          {pendingDeliveries.map((delivery, index) => (
            <Box key={delivery.id}>
              <ListItem
                sx={{
                  py: 2,
                  borderRadius: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip 
                      label={`$${delivery.monto} USD`} 
                      color="success"
                      size="small"
                      icon={<MoneyIcon />}
                    />
                  </Box>
                }
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: delivery.status === 'listo' ? 'success.main' : 'warning.main' }}>
                    <InventoryIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold">{delivery.tracking}</Typography>
                      {getStatusChip(delivery.status)}
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography variant="body2" component="span">
                        <PersonIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                        {delivery.cliente} • {delivery.box_id}
                      </Typography>
                      <br />
                      <Typography variant="caption" color="text.secondary">
                        <AccessTimeIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                        Llegó {delivery.llegada}
                      </Typography>
                    </>
                  }
                />
              </ListItem>
              {index < pendingDeliveries.length - 1 && <Divider variant="inset" component="li" />}
            </Box>
          ))}
        </List>

        {pendingDeliveries.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {t('counterDash.noPending')}
            </Typography>
          </Box>
        )}
      </Paper>
      )}

      {/* ============ MODAL DE ENTREGA PICK UP ============ */}
      <Dialog 
        open={deliveryModalOpen} 
        onClose={handleCloseDeliveryModal}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: '#4CAF50', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeliveryIcon />
          {deliveryStep === 'scan' ? 'Entregar Paquetes - Agregar Guías' : 'Resumen de Pago'}
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {deliveryStep === 'scan' && (
            <Box>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Agrega las guías de los paquetes a entregar:
              </Typography>
              
              {/* Lista de paquetes seleccionados */}
              {selectedPackages.length > 0 && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: '#e8f5e9' }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Paquetes a entregar ({selectedPackages.length}):
                  </Typography>
                  {selectedPackages.map((pkg, idx) => (
                    <Box key={pkg.tracking} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5, borderBottom: idx < selectedPackages.length - 1 ? '1px solid #c8e6c9' : 'none' }}>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">{pkg.tracking}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {pkg.cliente} • {pkg.box_id}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={`$${pkg.monto || 3} USD`} color="success" size="small" />
                        <Button 
                          size="small" 
                          color="error" 
                          onClick={() => handleRemovePackage(pkg.tracking)}
                          sx={{ minWidth: 'auto', p: 0.5 }}
                        >
                          <DeleteIcon fontSize="small" />
                        </Button>
                      </Box>
                    </Box>
                  ))}
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight="bold">Total:</Typography>
                    <Typography variant="h6" color="success.main" fontWeight="bold">
                      ${calculateTotalUSD()} USD
                    </Typography>
                  </Box>
                </Paper>
              )}
              
              {/* Campo para agregar guías */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth
                  label="Escanear guía"
                  value={scanTrackingInput}
                  onChange={(e) => setScanTrackingInput(e.target.value.toUpperCase())}
                  placeholder="Escanear o escribir número de guía..."
                  autoFocus
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <ScannerIcon />
                      </InputAdornment>
                    ),
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleSearchAndAddPackage();
                  }}
                />
                <Button 
                  variant="outlined" 
                  color="primary"
                  onClick={handleSearchAndAddPackage}
                  disabled={!scanTrackingInput.trim()}
                  startIcon={<AddIcon />}
                >
                  Agregar
                </Button>
              </Box>
              
              <TextField
                fullWidth
                label="Nombre de quien recibe *"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="Nombre completo de quien recoge el paquete"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
          )}
          
          {deliveryStep === 'summary' && (
            <Box>
              <Paper sx={{ p: 3, mb: 3, bgcolor: '#fff3e0', border: '2px solid #ff9800' }}>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon color="success" />
                  Resumen de Entrega
                </Typography>
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  📝 Recibe: <strong>{receiverName}</strong>
                </Typography>
                
                <Divider sx={{ my: 2 }} />
                
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Guías incluidas en este pago:</Typography>
                {selectedPackages.map((pkg) => (
                  <Box key={pkg.tracking} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #ffe0b2' }}>
                    <Box>
                      <Typography variant="body1" fontWeight="bold">{pkg.tracking}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {pkg.cliente} • Paquete recibido: Hidalgo TX
                      </Typography>
                    </Box>
                    <Typography variant="body1" fontWeight="bold" color="success.main">
                      ${pkg.monto || 3} USD
                    </Typography>
                  </Box>
                ))}
                
                <Divider sx={{ my: 2 }} />
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">MONTO TOTAL A COBRAR:</Typography>
                  <Typography variant="h4" color="error.main" fontWeight="bold">
                    ${calculateTotalUSD()} USD
                  </Typography>
                </Box>
              </Paper>
              
              <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
                ¿Cómo desea pagar el cliente?
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Card 
                    sx={{ 
                      cursor: processingPayment ? 'not-allowed' : 'pointer', 
                      transition: 'all 0.2s',
                      opacity: processingPayment ? 0.5 : 1,
                      '&:hover': { transform: processingPayment ? 'none' : 'scale(1.02)', boxShadow: 4 }
                    }}
                    onClick={() => !processingPayment && handleConfirmPayment('efectivo')}
                  >
                    <CardActionArea sx={{ p: 3, textAlign: 'center' }} disabled={processingPayment}>
                      <CashIcon sx={{ fontSize: 64, color: '#4CAF50', mb: 1 }} />
                      <Typography variant="h6">Efectivo</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Ir a Caja PO Box
                      </Typography>
                    </CardActionArea>
                  </Card>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Card 
                    sx={{ 
                      cursor: processingPayment ? 'not-allowed' : 'pointer', 
                      transition: 'all 0.2s',
                      opacity: processingPayment ? 0.5 : 1,
                      '&:hover': { transform: processingPayment ? 'none' : 'scale(1.02)', boxShadow: 4 }
                    }}
                    onClick={() => !processingPayment && handleConfirmPayment('tarjeta')}
                  >
                    <CardActionArea sx={{ p: 3, textAlign: 'center' }} disabled={processingPayment}>
                      <CardIcon sx={{ fontSize: 64, color: '#2196F3', mb: 1 }} />
                      <Typography variant="h6">Tarjeta</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Confirmar pago directo
                      </Typography>
                    </CardActionArea>
                  </Card>
                </Box>
              </Box>
              
              {processingPayment && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                  <CircularProgress size={24} sx={{ mr: 1 }} />
                  <Typography>Procesando pago...</Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeliveryModal} color="inherit" disabled={processingPayment}>
            Cancelar
          </Button>
          {deliveryStep === 'scan' && (
            <Button 
              variant="contained" 
              color="success"
              onClick={handleContinueToPayment}
              disabled={selectedPackages.length === 0 || !receiverName.trim()}
            >
              Continuar al Pago ({selectedPackages.length} paquete{selectedPackages.length > 1 ? 's' : ''})
            </Button>
          )}
          {deliveryStep === 'summary' && (
            <Button 
              variant="outlined" 
              onClick={() => setDeliveryStep('scan')}
              disabled={processingPayment}
            >
              Volver a Editar
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Notificaciones elegantes */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: { xs: 70, sm: 80 } }}
      >
        <Alert 
          onClose={handleCloseNotification} 
          severity={notification.severity}
          variant="filled"
          sx={{ 
            width: '100%',
            fontSize: '1rem',
            fontWeight: 500,
            boxShadow: 6,
            '& .MuiAlert-icon': { fontSize: '1.5rem' },
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
