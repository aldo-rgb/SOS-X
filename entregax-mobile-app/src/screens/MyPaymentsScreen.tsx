import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Clipboard,
  ActivityIndicator,
  Modal,
  Image,
  TextInput,
  Dimensions,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_URL } from '../services/api';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { 
  getPendingPaymentsApi, 
  getPaymentClabeApi,
  getPaymentOrdersApi,
  PaymentInvoice,
  PaymentOrder 
} from '../services/api';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import { generatePaymentPDF } from '../utils/generatePaymentPDF';

WebBrowser.maybeCompleteAuthSession();

// Types for navigation
type RootStackParamList = {
  MyPayments: { user: any; token: string; initialTab?: 'pending' | 'orders' | 'history' };
};

// Iconos por servicio
const SERVICE_ICONS: Record<string, string> = {
  aereo: 'airplane',
  maritimo: 'boat',
  terrestre_nacional: 'car',
  dhl_liberacion: 'cube',
  po_box: 'mail',
};

const SERVICE_COLORS: Record<string, string> = {
  aereo: '#3498DB',
  maritimo: '#1ABC9C',
  terrestre_nacional: '#E67E22',
  dhl_liberacion: '#F1C40F',
  po_box: '#9B59B6',
};

const SERVICE_NAMES: Record<string, string> = {
  aereo: '✈️ Aéreo (USA)',
  maritimo: '🚢 Marítimo (China)',
  terrestre_nacional: '🚛 Terrestre Nacional',
  dhl_liberacion: '📦 DHL Liberación',
  po_box: '📮 PO Box USA',
};

interface ClabeInfo {
  service: string;
  company: {
    name: string;
    legal_name: string;
    rfc: string;
  };
  payment: {
    clabe: string;
    reference: string;
    bank: string;
  };
}

interface GroupedInvoices {
  service: string;
  serviceName: string;
  color: string;
  invoices: PaymentInvoice[];
  subtotal: number;
}

const MyPaymentsScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'MyPayments'>>();
  const { t } = useTranslation();
  const { user, token, initialTab } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalPending, setTotalPending] = useState(0);
  const [groupedInvoices, setGroupedInvoices] = useState<GroupedInvoices[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<PaymentInvoice | null>(null);
  const [clabeInfo, setClabeInfo] = useState<ClabeInfo | null>(null);
  const [loadingClabe, setLoadingClabe] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>(() => initialTab === 'history' ? 'history' : 'pending');
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PaymentOrder | null>(null);
  const [showQR, setShowQR] = useState(false);

  // Voucher upload states
  const [voucherOrder, setVoucherOrder] = useState<PaymentOrder | null>(null);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [uploadingVoucher, setUploadingVoucher] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [editAmount, setEditAmount] = useState('');
  const [confirmingVoucher, setConfirmingVoucher] = useState(false);
  const [completingPayment, setCompletingPayment] = useState(false);

  // ============ ONLINE PAY DIALOG STATES (igual que web) ============
  const [onlinePayOrder, setOnlinePayOrder] = useState<PaymentOrder | null>(null);
  const [onlinePayLoading, setOnlinePayLoading] = useState<'card' | 'paypal' | 'wallet' | 'credit' | null>(null);
  const [onlinePayInvoice, setOnlinePayInvoice] = useState(false);
  const [walletStatus, setWalletStatus] = useState<{ wallet_balance?: number; is_credit_blocked?: boolean } | null>(null);
  const [serviceCredits, setServiceCredits] = useState<any[]>([]);
  const [fiscalData, setFiscalData] = useState<{
    fiscal_razon_social: string;
    fiscal_rfc: string;
    fiscal_codigo_postal: string;
    fiscal_regimen_fiscal: string;
    fiscal_uso_cfdi: string;
    hasCompleteData: boolean;
  } | null>(null);
  const [creditPartial, setCreditPartial] = useState<{ service: string; creditAmount: number; applied: boolean } | null>(null);
  const [walletPartial, setWalletPartial] = useState<{ walletAmount: number; applied: boolean } | null>(null);
  // Panels expandibles para usar saldo/crédito (no auto-pay)
  const [creditPanelOpen, setCreditPanelOpen] = useState(false);
  const [creditPanelAmount, setCreditPanelAmount] = useState('0.00');
  const [walletPanelOpen, setWalletPanelOpen] = useState(false);
  const [walletPanelAmount, setWalletPanelAmount] = useState('0.00');
  const [partialApplying, setPartialApplying] = useState<'wallet' | 'credit' | null>(null);

  const normalizeMoneyInput = (value: string): string => {
    const clean = value.replace(/[^\d.]/g, '');
    const parts = clean.split('.');
    const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : clean;
    return normalized;
  };

  const ensureMoneyInput = (value: string): string => {
    const num = parseFloat(value);
    if (!value || Number.isNaN(num) || num < 0) return '0';
    return String(num);
  };
  // Fiscal data modal
  const [fiscalModalOpen, setFiscalModalOpen] = useState(false);
  const [fiscalForm, setFiscalForm] = useState({ razon_social: '', rfc: '', codigo_postal: '', regimen_fiscal: '', uso_cfdi: 'G03' });
  const [savingFiscal, setSavingFiscal] = useState(false);
  // Success modal (custom design)
  const [successModal, setSuccessModal] = useState<{ visible: boolean; title: string; message: string; reference?: string; amount?: number; method?: string; invoiceRequested?: boolean } | null>(null);

  // Group invoices by service
  const groupInvoicesByService = (invoices: PaymentInvoice[]): GroupedInvoices[] => {
    const grouped: Record<string, GroupedInvoices> = {};
    
    invoices.forEach(invoice => {
      const service = invoice.service_type;
      if (!grouped[service]) {
        grouped[service] = {
          service,
          serviceName: SERVICE_NAMES[service] || service,
          color: SERVICE_COLORS[service] || '#666',
          invoices: [],
          subtotal: 0,
        };
      }
      grouped[service].invoices.push(invoice);
      grouped[service].subtotal += Number(invoice.amount) || 0;
    });
    
    return Object.values(grouped);
  };

  const fetchPayments = useCallback(async () => {
    try {
      const response = await getPendingPaymentsApi(token);
      if (response.success) {
        setTotalPending(response.totalPending || 0);
        const grouped = groupInvoicesByService(response.invoices || []);
        setGroupedInvoices(grouped);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
      Alert.alert('Error', 'No se pudieron cargar los pagos pendientes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const fetchPaymentOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const response = await getPaymentOrdersApi(token);
      if (response.success) {
        setPaymentOrders(response.payments || []);
      }
    } catch (error) {
      console.error('Error fetching payment orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPaymentOrders();
  }, [fetchPaymentOrders]);

  const paidStatuses = new Set(['paid', 'completed']);
  const pendingOrdersList = paymentOrders.filter((o: any) => !paidStatuses.has(String(o.status || '').toLowerCase()));
  const historyOrdersList = paymentOrders.filter((o: any) => paidStatuses.has(String(o.status || '').toLowerCase()));
  const visibleOrders = activeTab === 'history' ? historyOrdersList : pendingOrdersList;

  useEffect(() => {
    // Precargar recursos para pago en línea
    loadWalletStatus();
    loadServiceCredits();
    loadFiscalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayments();
    fetchPaymentOrders();
    loadWalletStatus();
    loadServiceCredits();
  };

  const handlePayInvoice = async (invoice: PaymentInvoice) => {
    console.log('handlePayInvoice called:', invoice.invoice_number, 'source:', invoice.source);
    setSelectedInvoice(invoice);
    
    // Si es un paquete (source === 'package'), mostrar modal simple con QR
    // No necesita llamar a la API de CLABE
    if (invoice.source === 'package') {
      console.log('Es paquete, mostrando modal QR');
      setLoadingClabe(false);
      setClabeInfo(null);
      return;
    }
    
    // Para facturas normales, intentar obtener CLABE de Openpay
    setLoadingClabe(true);
    try {
      const response = await getPaymentClabeApi(token, invoice.service_type, invoice.id);
      if (response.success) {
        setClabeInfo(response);
      }
    } catch (error) {
      console.error('Error getting CLABE:', error);
      Alert.alert('Error', 'No se pudo obtener la información de pago');
      setSelectedInvoice(null);
    } finally {
      setLoadingClabe(false);
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    Alert.alert('✅ Copiado', 'CLABE copiada al portapapeles');
  };

  const sharePaymentInfo = async () => {
    if (!clabeInfo || !selectedInvoice) return;
    
    try {
      await Share.share({
        message: `💳 Pago a ${clabeInfo.company.name}\n\n` +
          `Factura: ${selectedInvoice.invoice_number}\n` +
          `Concepto: ${selectedInvoice.concept}\n` +
          `Monto: $${Number(selectedInvoice.amount).toFixed(2)} MXN\n` +
          `CLABE: ${clabeInfo.payment.clabe}\n` +
          `Referencia: ${clabeInfo.payment.reference}\n` +
          `Banco: ${clabeInfo.payment.bank}\n\n` +
          `⚠️ Importante: Use exactamente esta CLABE para que su pago sea acreditado correctamente.`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Compartir info de pago para paquetes
  const sharePackagePaymentInfo = async () => {
    if (!selectedInvoice) return;
    
    try {
      await Share.share({
        message: `💳 Pago Pendiente EntregaX\n\n` +
          `📦 Paquete: ${selectedInvoice.invoice_number}\n` +
          `💰 Monto: ${formatCurrency(selectedInvoice.amount)} MXN\n` +
          `📝 Concepto: ${selectedInvoice.concept}\n\n` +
          `Referencia para pago: ${selectedInvoice.invoice_number}\n\n` +
          `Puede realizar su pago en cualquiera de nuestras sucursales o mediante transferencia SPEI.`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // Modal de pago para paquetes (con QR)
  const renderPackagePaymentModal = () => {
    if (!selectedInvoice || selectedInvoice.source !== 'package') return null;

    const qrData = JSON.stringify({
      type: 'payment',
      ref: selectedInvoice.invoice_number,
      amount: selectedInvoice.amount,
      packageId: selectedInvoice.reference_id
    });

    return (
      <Modal
        visible={true}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedInvoice(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setSelectedInvoice(null)}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.serviceBadge, { backgroundColor: SERVICE_COLORS[selectedInvoice.service_type] || '#9B59B6' }]}>
                <Ionicons 
                  name={SERVICE_ICONS[selectedInvoice.service_type] as any || 'mail'} 
                  size={24} 
                  color="#FFF" 
                />
                <Text style={styles.serviceBadgeText}>
                  {SERVICE_NAMES[selectedInvoice.service_type] || 'PO Box USA'}
                </Text>
              </View>

              <Text style={styles.modalTitle}>Detalles del Pago</Text>
              
              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>Monto a Pagar</Text>
                <Text style={styles.amountValue}>
                  {formatCurrency(selectedInvoice.amount)}
                </Text>
                <Text style={styles.amountCurrency}>MXN</Text>
              </View>

              {/* QR Code */}
              <View style={styles.qrContainer}>
                <Text style={styles.qrLabel}>Código QR para Pago en Sucursal</Text>
                <View style={styles.qrBox}>
                  <QRCode
                    value={qrData}
                    size={180}
                    color="#333"
                    backgroundColor="#FFF"
                  />
                </View>
                <Text style={styles.qrHint}>
                  Presente este código en cualquier sucursal para realizar su pago
                </Text>
              </View>

              {/* Referencia */}
              <View style={styles.clabeContainer}>
                <Text style={styles.clabeLabel}>Referencia de Pago</Text>
                <View style={styles.clabeRow}>
                  <Text style={styles.clabeValue}>{selectedInvoice.invoice_number}</Text>
                  <TouchableOpacity 
                    style={styles.copyButton}
                    onPress={() => copyToClipboard(selectedInvoice.invoice_number)}
                  >
                    <Ionicons name="copy" size={20} color="#FF6B00" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Concepto:</Text>
                <Text style={styles.infoValue}>{selectedInvoice.concept}</Text>
              </View>

              {selectedInvoice.due_date && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Fecha registro:</Text>
                  <Text style={styles.infoValue}>{formatDate(selectedInvoice.due_date)}</Text>
                </View>
              )}

              <View style={styles.instructionsBox}>
                <Ionicons name="information-circle" size={20} color="#3498DB" />
                <Text style={styles.instructionsText}>
                  Puede pagar en sucursal presentando el código QR, o mediante transferencia SPEI. 
                  Para pagos SPEI, contacte a su asesor para obtener los datos bancarios.
                </Text>
              </View>

              <TouchableOpacity style={styles.shareButton} onPress={sharePackagePaymentInfo}>
                <Ionicons name="share-outline" size={20} color="#FFF" />
                <Text style={styles.shareButtonText}>Compartir Información</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // Modal de pago para facturas con CLABE (Openpay)
  const renderPaymentModal = () => {
    if (!selectedInvoice || selectedInvoice.source === 'package') return null;

    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => {
              setSelectedInvoice(null);
              setClabeInfo(null);
            }}
          >
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>

          {loadingClabe ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FF6B00" />
              <Text style={styles.loadingText}>Obteniendo datos de pago...</Text>
            </View>
          ) : clabeInfo ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.serviceBadge, { backgroundColor: SERVICE_COLORS[selectedInvoice.service_type] || '#666' }]}>
                <Ionicons 
                  name={SERVICE_ICONS[selectedInvoice.service_type] as any || 'cash'} 
                  size={24} 
                  color="#FFF" 
                />
                <Text style={styles.serviceBadgeText}>{clabeInfo.company.name}</Text>
              </View>

              <Text style={styles.modalTitle}>Pago por Transferencia SPEI</Text>
              
              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>Monto a Pagar</Text>
                <Text style={styles.amountValue}>
                  {formatCurrency(selectedInvoice.amount)}
                </Text>
                <Text style={styles.amountCurrency}>MXN</Text>
              </View>

              <View style={styles.clabeContainer}>
                <Text style={styles.clabeLabel}>CLABE Interbancaria</Text>
                <View style={styles.clabeRow}>
                  <Text style={styles.clabeValue}>{clabeInfo.payment.clabe}</Text>
                  <TouchableOpacity 
                    style={styles.copyButton}
                    onPress={() => copyToClipboard(clabeInfo.payment.clabe)}
                  >
                    <Ionicons name="copy" size={20} color="#FF6B00" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.bankName}>Banco: {clabeInfo.payment.bank}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Referencia:</Text>
                <Text style={styles.infoValue}>{clabeInfo.payment.reference}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Beneficiario:</Text>
                <Text style={styles.infoValue}>{clabeInfo.company.legal_name}</Text>
              </View>

              {clabeInfo.company.rfc && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>RFC:</Text>
                  <Text style={styles.infoValue}>{clabeInfo.company.rfc}</Text>
                </View>
              )}

              <View style={styles.instructionsBox}>
                <Ionicons name="information-circle" size={20} color="#3498DB" />
                <Text style={styles.instructionsText}>
                  Realice su pago por SPEI a la CLABE indicada. Su pago será acreditado automáticamente en un lapso de 24-48 horas hábiles.
                </Text>
              </View>

              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Importante: Esta CLABE es exclusiva para pagos del servicio {SERVICE_NAMES[selectedInvoice.service_type]}. 
                  No use esta cuenta para pagar otros servicios.
                </Text>
              </View>

              <TouchableOpacity style={styles.shareButton} onPress={sharePaymentInfo}>
                <Ionicons name="share-outline" size={20} color="#FFF" />
                <Text style={styles.shareButtonText}>Compartir Datos de Pago</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </View>
      </View>
    );
  };

  // ====== ORDER ACTIONS ======
  const downloadOrderReceipt = async (order: PaymentOrder) => {
    try {
      await generatePaymentPDF({
        payment_reference: order.payment_reference,
        amount: order.amount,
        currency: order.currency || 'MXN',
        bank_info: (order as any).bank_info,
        packages: order.packages,
        userName: user?.name || user?.nombre || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || '-',
        userCasillero: user?.pobox_code || user?.casillero || '-',
      });
    } catch (e) {
      console.error('Error generando PDF:', e);
      Alert.alert('Error', 'No se pudo generar el comprobante');
    }
  };

  const handleDeleteOrder = (order: PaymentOrder) => {
    Alert.alert(
      'Eliminar Referencia de Pago',
      `¿Estás seguro de que deseas eliminar la referencia ${order.payment_reference}?\n\nLos paquetes asociados volverán a estar disponibles para pago.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/pobox/payment/order/${order.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              const data = await res.json();
              if (res.ok && data.success) {
                Alert.alert('🗑️', 'Orden eliminada correctamente');
                fetchPayments();
                fetchPaymentOrders();
              } else {
                Alert.alert('Error', data.error || data.message || 'No se pudo eliminar la orden');
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Error de conexión');
            }
          },
        },
      ],
    );
  };

  const handlePayOnline = async (order: PaymentOrder) => {
    if (!order) return;
    // Cargar wallet, créditos y datos fiscales en paralelo
    setOnlinePayOrder(order);
    setOnlinePayInvoice(false);
    // Si la orden ya tiene crédito o wallet aplicado, hidratar
    const preCredit = Number((order as any).credit_applied || 0);
    if (preCredit > 0 && (order as any).credit_service) {
      setCreditPartial({ service: (order as any).credit_service, creditAmount: preCredit, applied: true });
    } else {
      setCreditPartial(null);
    }
    const preWallet = Number((order as any).wallet_applied || 0);
    if (preWallet > 0) {
      setWalletPartial({ walletAmount: preWallet, applied: true });
    } else {
      setWalletPartial(null);
    }
    loadWalletStatus();
    loadServiceCredits();
    loadFiscalData();
  };

  // ============ ONLINE PAY HELPERS (igual que web) ============
  const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadWalletStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/wallet/status`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setWalletStatus(data || null);
      }
    } catch (e) { console.error('walletStatus error', e); }
  };

  const loadServiceCredits = async () => {
    try {
      const res = await fetch(`${API_URL}/api/my/service-credits`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        if (data?.success) setServiceCredits(data.credits || []);
      }
    } catch (e) { console.error('serviceCredits error', e); }
  };

  const loadFiscalData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/fiscal/data`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        const fiscal = data.fiscal || data;
        setFiscalData({
          fiscal_razon_social: fiscal.razon_social || fiscal.fiscal_razon_social || '',
          fiscal_rfc: fiscal.rfc || fiscal.fiscal_rfc || '',
          fiscal_codigo_postal: fiscal.codigo_postal || fiscal.fiscal_codigo_postal || '',
          fiscal_regimen_fiscal: fiscal.regimen_fiscal || fiscal.fiscal_regimen_fiscal || '',
          fiscal_uso_cfdi: fiscal.uso_cfdi || fiscal.fiscal_uso_cfdi || 'G03',
          hasCompleteData: !!data.hasCompleteData,
        });
      }
    } catch (e) { console.error('fiscalData error', e); }
  };

  const saveFiscalData = async () => {
    if (!fiscalForm.razon_social || !fiscalForm.rfc || !fiscalForm.codigo_postal || !fiscalForm.regimen_fiscal) {
      Alert.alert('⚠️', 'Completa todos los campos requeridos');
      return;
    }
    setSavingFiscal(true);
    try {
      const res = await fetch(`${API_URL}/api/fiscal/data`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          razon_social: fiscalForm.razon_social,
          rfc: fiscalForm.rfc.toUpperCase(),
          codigo_postal: fiscalForm.codigo_postal,
          regimen_fiscal: fiscalForm.regimen_fiscal,
          uso_cfdi: fiscalForm.uso_cfdi || 'G03',
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('✅', 'Datos fiscales guardados');
        setFiscalModalOpen(false);
        await loadFiscalData();
      } else {
        Alert.alert('Error', data.error || 'No se pudieron guardar');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingFiscal(false);
    }
  };

  const closeOnlinePay = () => {
    if (onlinePayLoading) return;
    setOnlinePayOrder(null);
    setOnlinePayInvoice(false);
    setCreditPartial(null);
    setWalletPartial(null);
    setCreditPanelOpen(false);
    setCreditPanelAmount('0.00');
    setWalletPanelOpen(false);
    setWalletPanelAmount('0.00');
    setPartialApplying(null);
  };

  const getOrderPackageIds = (order: any): number[] => {
    if (Array.isArray(order?.packages) && order.packages.length > 0) {
      return order.packages.map((p: any) => Number(p.id)).filter(Boolean);
    }
    if (Array.isArray(order?.package_ids)) {
      return order.package_ids.map((id: any) => Number(id)).filter(Boolean);
    }
    return [];
  };

  const buildOnlineInvoicePayload = (): { invoiceRequired: boolean; invoiceData: any } | null => {
    if (!onlinePayInvoice) return { invoiceRequired: false, invoiceData: null };
    if (!fiscalData || !fiscalData.hasCompleteData) {
      Alert.alert('⚠️', 'Completa tus datos fiscales antes de solicitar factura');
      setFiscalModalOpen(true);
      return null;
    }
    return {
      invoiceRequired: true,
      invoiceData: {
        razon_social: fiscalData.fiscal_razon_social,
        rfc: fiscalData.fiscal_rfc,
        codigo_postal: fiscalData.fiscal_codigo_postal,
        regimen_fiscal: fiscalData.fiscal_regimen_fiscal,
        uso_cfdi: fiscalData.fiscal_uso_cfdi,
      },
    };
  };

  const applyCreditFirst = async (): Promise<{ newAmount: number; completed: boolean } | null> => {
    if (!creditPartial || !onlinePayOrder) return { newAmount: Number(onlinePayOrder?.amount) || 0, completed: false };
    try {
      const res = await fetch(`${API_URL}/api/pobox/payment/order/${onlinePayOrder.id}/apply-credit`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ service: creditPartial.service, credit_amount: creditPartial.creditAmount }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || data?.message || 'Error al aplicar crédito');
      const newAmount = Number(data.new_amount) || 0;
      const completed = !!data.completed;
      if (completed) {
        Alert.alert('✅', data.message || 'Pago cubierto con crédito');
        closeOnlinePay();
        fetchPaymentOrders();
        fetchPayments();
        loadWalletStatus(); loadServiceCredits();
      } else {
        const applied = Number(data.credit_applied) || creditPartial.creditAmount;
        setOnlinePayOrder((prev) => prev ? { ...prev, amount: newAmount, credit_applied: applied as any, credit_service: creditPartial.service } as any : prev);
        setCreditPartial({ service: creditPartial.service, creditAmount: applied, applied: true });
        loadServiceCredits();
      }
      return { newAmount, completed };
    } catch (e: any) {
      Alert.alert('Error', e.message); return null;
    }
  };

  const applyWalletFirst = async (): Promise<{ newAmount: number; completed: boolean } | null> => {
    if (!walletPartial || !onlinePayOrder) return { newAmount: Number(onlinePayOrder?.amount) || 0, completed: false };
    try {
      const res = await fetch(`${API_URL}/api/pobox/payment/order/${onlinePayOrder.id}/apply-wallet`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ wallet_amount: walletPartial.walletAmount }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || data?.message || 'Error al aplicar saldo');
      const newAmount = Number(data.new_amount) || 0;
      const completed = !!data.completed;
      if (completed) {
        Alert.alert('✅', data.message || 'Pago cubierto con saldo a favor');
        closeOnlinePay();
        fetchPaymentOrders();
        fetchPayments();
        loadWalletStatus(); loadServiceCredits();
      } else {
        const applied = Number(data.wallet_applied) || walletPartial.walletAmount;
        setOnlinePayOrder((prev) => prev ? { ...prev, amount: newAmount, wallet_applied: applied as any } as any : prev);
        setWalletPartial({ walletAmount: applied, applied: true });
        loadWalletStatus();
      }
      return { newAmount, completed };
    } catch (e: any) {
      Alert.alert('Error', e.message); return null;
    }
  };

  const revertAppliedCredit = async (): Promise<boolean> => {
    if (!onlinePayOrder) return false;
    try {
      const res = await fetch(`${API_URL}/api/pobox/payment/order/${onlinePayOrder.id}/revert-credit`, { method: 'POST', headers: authHeaders });
      const data = await res.json();
      if (data?.success) {
        const restored = Number(data.new_amount) || (Number(onlinePayOrder.amount) + (creditPartial?.creditAmount || 0));
        setOnlinePayOrder((prev) => prev ? { ...prev, amount: restored, credit_applied: 0 as any, credit_service: null } as any : prev);
        setCreditPartial(null);
        loadWalletStatus(); loadServiceCredits(); fetchPaymentOrders();
        return true;
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    return false;
  };

  const revertAppliedWallet = async (): Promise<boolean> => {
    if (!onlinePayOrder) return false;
    try {
      const res = await fetch(`${API_URL}/api/pobox/payment/order/${onlinePayOrder.id}/revert-wallet`, { method: 'POST', headers: authHeaders });
      const data = await res.json();
      if (data?.success) {
        const restored = Number(data.new_amount) || (Number(onlinePayOrder.amount) + (walletPartial?.walletAmount || 0));
        setOnlinePayOrder((prev) => prev ? { ...prev, amount: restored, wallet_applied: 0 as any } as any : prev);
        setWalletPartial(null);
        loadWalletStatus(); fetchPaymentOrders();
        return true;
      }
    } catch (e: any) { Alert.alert('Error', e.message); }
    return false;
  };

  const openGatewayUrl = async (url: string, returnUrl: string) => {
    try {
      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET as any,
      });
      console.log('AuthSession result:', result);
    } catch (e) {
      console.error('WebBrowser error', e);
      // Fallback
      Linking.openURL(url);
    } finally {
      // Refrescar para detectar pago completado
      setTimeout(() => { fetchPaymentOrders(); fetchPayments(); }, 800);
      closeOnlinePay();
    }
  };

  const handlePayOnlineCard = async () => {
    const order = onlinePayOrder;
    if (!order) return;
    const packageIds = getOrderPackageIds(order);
    if (packageIds.length === 0) { Alert.alert('Error', 'La orden no tiene paquetes asociados'); return; }
    const invoice = buildOnlineInvoicePayload();
    if (invoice === null) return;
    setOnlinePayLoading('card');
    let creditAppliedNow = false, walletAppliedNow = false;
    try {
      let amount = Number(order.amount) || 0;
      if (walletPartial && !walletPartial.applied) {
        const rw = await applyWalletFirst();
        if (!rw) { setOnlinePayLoading(null); return; }
        if (rw.completed) { setOnlinePayLoading(null); return; }
        amount = rw.newAmount; walletAppliedNow = true;
      }
      if (creditPartial && !creditPartial.applied) {
        const rc = await applyCreditFirst();
        if (!rc) { setOnlinePayLoading(null); return; }
        if (rc.completed) { setOnlinePayLoading(null); return; }
        amount = rc.newAmount; creditAppliedNow = true;
      }
      const returnUrl = Linking.createURL('payment/success');
      const cancelUrl = Linking.createURL('payment/cancelled');
      const payload = {
        packageIds,
        paymentMethod: 'card',
        total: Math.round(amount * 100) / 100,
        currency: order.currency || 'MXN',
        ...invoice,
        paymentOrderId: order.id,
        paymentReference: order.payment_reference,
        returnUrl,
        cancelUrl,
      };
      const res = await fetch(`${API_URL}/api/payments/openpay/card`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data?.success) {
        if (data.requiresRedirection && data.paymentUrl) {
          await openGatewayUrl(data.paymentUrl, returnUrl);
        } else if (data.status === 'completed') {
          Alert.alert('✅', 'Pago procesado con tarjeta');
          closeOnlinePay(); fetchPaymentOrders(); fetchPayments();
        } else {
          Alert.alert('📋', data.message || 'Solicitud registrada');
          closeOnlinePay();
        }
      } else {
        throw new Error(data?.error || 'Error procesando pago');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      if (creditAppliedNow) { try { await revertAppliedCredit(); } catch {} }
      if (walletAppliedNow) { try { await revertAppliedWallet(); } catch {} }
    } finally {
      setOnlinePayLoading(null);
    }
  };

  const handlePayOnlinePaypal = async () => {
    const order = onlinePayOrder;
    if (!order) return;
    const packageIds = getOrderPackageIds(order);
    if (packageIds.length === 0) { Alert.alert('Error', 'La orden no tiene paquetes asociados'); return; }
    const invoice = buildOnlineInvoicePayload();
    if (invoice === null) return;
    setOnlinePayLoading('paypal');
    let creditAppliedNow = false, walletAppliedNow = false;
    try {
      let amount = Number(order.amount) || 0;
      if (walletPartial && !walletPartial.applied) {
        const rw = await applyWalletFirst();
        if (!rw) { setOnlinePayLoading(null); return; }
        if (rw.completed) { setOnlinePayLoading(null); return; }
        amount = rw.newAmount; walletAppliedNow = true;
      }
      if (creditPartial && !creditPartial.applied) {
        const rc = await applyCreditFirst();
        if (!rc) { setOnlinePayLoading(null); return; }
        if (rc.completed) { setOnlinePayLoading(null); return; }
        amount = rc.newAmount; creditAppliedNow = true;
      }
      const returnUrl = Linking.createURL('payment/success');
      const cancelUrl = Linking.createURL('payment/cancelled');
      const payload = {
        packageIds,
        paymentMethod: 'paypal',
        total: Math.round(amount * 100) / 100,
        currency: order.currency || 'MXN',
        ...invoice,
        paymentOrderId: order.id,
        paymentReference: order.payment_reference,
        returnUrl,
        cancelUrl,
      };
      const res = await fetch(`${API_URL}/api/payments/paypal/create`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data?.success) {
        if (data.approvalUrl) {
          await openGatewayUrl(data.approvalUrl, returnUrl);
        } else {
          Alert.alert('📋', data.message || 'Solicitud registrada');
          closeOnlinePay();
        }
      } else {
        throw new Error(data?.error || 'Error creando pago PayPal');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      if (creditAppliedNow) { try { await revertAppliedCredit(); } catch {} }
      if (walletAppliedNow) { try { await revertAppliedWallet(); } catch {} }
    } finally {
      setOnlinePayLoading(null);
    }
  };

  const handlePayInternal = async (method: 'wallet' | 'credit') => {
    const order = onlinePayOrder;
    if (!order) return;
    const amount = Number(order.amount) || 0;
    if (method === 'wallet') {
      const bal = Number(walletStatus?.wallet_balance || 0);
      const effective = creditPartial ? Math.max(0, amount - creditPartial.creditAmount) : amount;
      if (bal < effective) { Alert.alert('Error', `Saldo insuficiente. Disponible: ${formatCurrency(bal)}`); return; }
    } else {
      if (walletStatus?.is_credit_blocked) { Alert.alert('Error', 'Tu línea de crédito está bloqueada'); return; }
    }
    setOnlinePayLoading(method);
    try {
      if (method === 'wallet' && creditPartial && !creditPartial.applied) {
        const r = await applyCreditFirst();
        if (!r) { setOnlinePayLoading(null); return; }
        if (r.completed) { setOnlinePayLoading(null); return; }
      }
      const pkgs: any[] = Array.isArray((order as any)?.packages) ? (order as any).packages : [];
      const orderService = (pkgs[0]?.service_type || (order as any)?.service_type || 'po_box') as string;
      const res = await fetch(`${API_URL}/api/pobox/payment/order/${order.id}/pay-internal`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          method,
          // Factura sólo aplica para pagos con tarjeta/PayPal
          requiere_factura: false,
          service: method === 'credit' ? orderService : undefined,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        // Cerrar el modal de pago en línea y mostrar confirmación bonita
        const reference = order.payment_reference;
        const successAmount = amount;
        const successMethod = method === 'wallet' ? 'Saldo a favor' : 'Línea de crédito';
        closeOnlinePay();
        setSuccessModal({
          visible: true,
          title: '¡Pago confirmado!',
          message: method === 'wallet'
            ? 'Tu pago se realizó con tu saldo a favor.'
            : 'Tu pago se realizó con tu línea de crédito.',
          reference,
          amount: successAmount,
          method: successMethod,
          invoiceRequested: false,
        });
        // Refrescar datos en background
        fetchPaymentOrders(); fetchPayments(); loadWalletStatus(); loadServiceCredits();
      } else {
        throw new Error(data?.error || data?.message || 'Error al procesar pago');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setOnlinePayLoading(null);
    }
  };



  // ====== VOUCHER UPLOAD FUNCTIONS ======
  const openVoucherModal = async (order: PaymentOrder) => {
    setVoucherOrder(order);
    setVouchers([]);
    setOcrResult(null);
    setEditAmount('');
    await loadVouchers(order.id);
  };

  const loadVouchers = async (orderId: number) => {
    setLoadingVouchers(true);
    try {
      const res = await fetch(`${API_URL}/api/payment/voucher/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.vouchers) setVouchers(data.vouchers);
    } catch (e) {
      console.error('Error loading vouchers:', e);
    }
    setLoadingVouchers(false);
  };

  const pickAndUploadImage = async (source: 'camera' | 'gallery') => {
    if (!voucherOrder) return;
    let result;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Error', t('myPayments.cameraPermission')); return; }
      result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Error', t('myPayments.galleryPermission')); return; }
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    }
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingVoucher(true);
    setOcrResult(null);
    try {
      const formData = new FormData();
      formData.append('voucher', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || 'voucher.jpg',
      } as any);
      formData.append('payment_order_id', String(voucherOrder.id));
      formData.append('service_type', voucherOrder.packages?.[0]?.service_type || 'po_box');
      formData.append('payment_reference', voucherOrder.payment_reference);

      const res = await fetch(`${API_URL}/api/payment/voucher/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.voucher) {
        setOcrResult(data.voucher);
        setEditAmount(String(data.voucher.detected_amount || ''));
        await loadVouchers(voucherOrder.id);
      } else {
        Alert.alert('Error', data.error || 'Error al subir comprobante');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error de conexión');
    }
    setUploadingVoucher(false);
  };

  const confirmVoucherAmount = async () => {
    if (!ocrResult) return;
    setConfirmingVoucher(true);
    try {
      const res = await fetch(`${API_URL}/api/payment/voucher/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucher_id: ocrResult.id,
          declared_amount: parseFloat(editAmount) || 0,
        }),
      });
      const data = await res.json();
      if (data.voucher) {
        setOcrResult(null);
        setEditAmount('');
        if (voucherOrder) await loadVouchers(voucherOrder.id);
        Alert.alert('✅', t('myPayments.voucherConfirmed'));
      } else {
        Alert.alert('Error', data.error || 'Error');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setConfirmingVoucher(false);
  };

  const completePayment = async () => {
    if (!voucherOrder) return;
    setCompletingPayment(true);
    try {
      const res = await fetch(`${API_URL}/api/payment/voucher/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_order_id: voucherOrder.id }),
      });
      const data = await res.json();
      if (data.success) {
        const msg = data.surplus_amount > 0
          ? `${t('myPayments.paymentSent')}\n\n💰 ${t('myPayments.surplusCredit')}: $${Number(data.surplus_amount).toFixed(2)} MXN`
          : t('myPayments.paymentSent');
        Alert.alert('✅', msg);
        setVoucherOrder(null);
        // Refresh orders
        setLoadingOrders(true);
        try {
          const ordersRes = await getPaymentOrdersApi(token);
          if (ordersRes.orders) setPaymentOrders(ordersRes.orders);
        } catch (e) {}
        setLoadingOrders(false);
      } else {
        Alert.alert('Error', data.error || 'Error');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setCompletingPayment(false);
  };

  const getVoucherTotal = () => {
    return vouchers
      .filter((v: any) => v.status !== 'rejected')
      .reduce((sum: number, v: any) => sum + (Number(v.declared_amount) || Number(v.detected_amount) || 0), 0);
  };

  const canComplete = () => {
    const confirmed = vouchers.filter((v: any) => v.status === 'pending_review' || v.status === 'approved');
    return confirmed.length > 0 && getVoucherTotal() >= Number(voucherOrder?.amount || 0);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B00" />
          <Text style={styles.loadingText}>Cargando pagos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>💳 Mis Cuentas por Pagar</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#FF6B00" />
        </TouchableOpacity>
      </View>

      {/* Total Pendiente */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total Pendiente por Pagar</Text>
        <Text style={styles.totalAmount}>{formatCurrency(totalPending)}</Text>
        <Text style={styles.totalCurrency}>MXN</Text>
      </View>

      {/* Tabs: Pendientes / Historial */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Ionicons name="time-outline" size={16} color={activeTab === 'pending' ? '#FF6B00' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>Pendientes ({pendingOrdersList.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="checkmark-done-outline" size={16} color={activeTab === 'history' ? '#FF6B00' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>Historial ({historyOrdersList.length})</Text>
        </TouchableOpacity>
      </View>

      {/* Órdenes de Pago */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loadingOrders ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF6B00" />
            <Text style={styles.loadingText}>Cargando órdenes...</Text>
          </View>
        ) : visibleOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#CCC" />
            <Text style={styles.emptyTitle}>{activeTab === 'history' ? 'Sin historial de pagos' : 'Sin órdenes pendientes'}</Text>
            <Text style={styles.emptyText}>{activeTab === 'history' ? 'Aún no hay pagos completados' : 'No tienes órdenes pendientes por pagar'}</Text>
          </View>
        ) : (
          visibleOrders.map((order) => {
            const statusColors: Record<string, { bg: string; text: string; label: string }> = {
              pending_payment: { bg: '#FFF3E0', text: '#E65100', label: '⏳ Pendiente' },
              pending: { bg: '#FFF3E0', text: '#E65100', label: '⏳ Pendiente' },
              vouchers_submitted: { bg: '#E3F2FD', text: '#1565C0', label: '🔄 Procesando' },
              vouchers_partial: { bg: '#FFF8E1', text: '#F57C00', label: '🔄 Procesando' },
              completed: { bg: '#E8F5E9', text: '#2E7D32', label: '✅ Pagado' },
              paid: { bg: '#E8F5E9', text: '#2E7D32', label: '✅ Pagado' },
              failed: { bg: '#FFEBEE', text: '#C62828', label: '❌ Fallido' },
              expired: { bg: '#F5F5F5', text: '#757575', label: '⏰ Expirado' },
            };
            const st = statusColors[order.status] || statusColors.pending_payment;
            const methodLabels: Record<string, string> = {
              cash: '💵 Pago en Sucursal',
              paypal: '🅿️ PayPal',
              card: '💳 Tarjeta',
              spei: '🏦 SPEI',
            };

            return (
              <View key={order.id} style={styles.orderCard}>
                <TouchableOpacity 
                  style={styles.orderHeader}
                  onPress={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                >
                  <Text style={styles.orderRef}>{order.payment_reference}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.orderStatusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.orderStatusText, { color: st.text }]}>{st.label}</Text>
                    </View>
                    <Ionicons 
                      name={expandedOrderId === order.id ? 'chevron-up' : 'chevron-down'} 
                      size={18} color="#999" 
                    />
                  </View>
                </TouchableOpacity>
                <View style={styles.orderBody}>
                  <View style={styles.orderRow}>
                    <Text style={styles.orderLabel}>Método:</Text>
                    <Text style={styles.orderValue}>{methodLabels[order.payment_method] || order.payment_method}</Text>
                  </View>
                  <View style={styles.orderRow}>
                    <Text style={styles.orderLabel}>Monto:</Text>
                    <Text style={[styles.orderValue, { fontWeight: 'bold', color: '#FF6B00' }]}>
                      {formatCurrency(order.amount)} {order.currency}
                    </Text>
                  </View>
                  <View style={styles.orderRow}>
                    <Text style={styles.orderLabel}>Fecha:</Text>
                    <Text style={styles.orderValue}>{formatDate(order.created_at)}</Text>
                  </View>
                  {order.paid_at && (
                    <View style={styles.orderRow}>
                      <Text style={styles.orderLabel}>Pagado:</Text>
                      <Text style={[styles.orderValue, { color: '#2E7D32' }]}>{formatDate(order.paid_at)}</Text>
                    </View>
                  )}
                  <TouchableOpacity 
                    style={styles.orderRow}
                    onPress={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                  >
                    <Text style={styles.orderLabel}>📦 Paquetes:</Text>
                    <Text style={[styles.orderValue, { color: '#FF6B00' }]}>
                      {Array.isArray(order.packages) ? order.packages.length : 
                       Array.isArray(order.package_ids) ? order.package_ids.length : 0} paquete(s) ▾
                    </Text>
                  </TouchableOpacity>
                  {(order.status === 'pending_payment' || order.status === 'pending') && (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => setSelectedOrder(order)}
                        accessibilityLabel="Pagar"
                      >
                        <Ionicons name="cash-outline" size={22} color="#FF6B00" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => downloadOrderReceipt(order)}
                        accessibilityLabel="Descargar comprobante"
                      >
                        <Ionicons name="download-outline" size={22} color="#FF6B00" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => handleDeleteOrder(order)}
                        accessibilityLabel="Eliminar"
                      >
                        <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Detalle de paquetes expandible */}
                {expandedOrderId === order.id && Array.isArray(order.packages) && order.packages.length > 0 && (
                  <View style={styles.orderPackages}>
                    {order.packages.map((pkg: any) => (
                      <View key={pkg.id} style={styles.orderPkgRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.orderPkgTracking}>{pkg.tracking_internal}</Text>
                          <Text style={styles.orderPkgDetail}>
                            {pkg.descripcion ? `${pkg.descripcion} · ` : ''}{pkg.weight ? `${Number(pkg.weight).toFixed(1)} lb` : ''}
                            {pkg.national_carrier ? ` · 🚚 ${pkg.national_carrier}` : ''}
                          </Text>
                        </View>
                        <Text style={styles.orderPkgAmount}>
                          {formatCurrency(Number(pkg.saldo_pendiente || pkg.assigned_cost_mxn || 0))}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal de detalle de orden de pago */}
      {selectedOrder && !showQR && (
        <Modal visible={true} transparent animationType="slide" onRequestClose={() => setSelectedOrder(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { padding: 0, overflow: 'hidden' }]}>
              {/* Header negro */}
              <View style={{ backgroundColor: '#1A1A1A', paddingVertical: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="receipt-outline" size={20} color="#FF6B00" />
                  <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF' }}>{t('myPayments.paymentInstructions')}</Text>
                </View>
                <TouchableOpacity onPress={() => { setSelectedOrder(null); setShowQR(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                {/* Referencia - tarjeta blanca con borde naranja */}
                <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12, borderWidth: 2, borderColor: '#FF6B00' }}>
                  <Text style={{ color: '#1A1A1A', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('myPayments.paymentReference')}</Text>
                  <TouchableOpacity onPress={() => { Clipboard.setString(selectedOrder.payment_reference); Alert.alert('✅', t('myPayments.copied')); }}>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#FF6B00', letterSpacing: 1.5, textAlign: 'center' }}>{selectedOrder.payment_reference}</Text>
                    <Text style={{ color: '#1A1A1A', fontSize: 11, textAlign: 'center', marginTop: 4, opacity: 0.6 }}>📋 {t('myPayments.tapToCopy')}</Text>
                  </TouchableOpacity>
                </View>

                {/* Aviso rojo: referencia obligatoria */}
                <View style={{ backgroundColor: '#FFF', borderRadius: 8, padding: 10, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#FF3B30', borderWidth: 1, borderColor: '#FFE5E3' }}>
                  <Text style={{ fontSize: 12, color: '#FF3B30', fontWeight: '700', textAlign: 'center' }}>⚠️ Debe incluir el número de referencia para que su pago sea acreditado.</Text>
                </View>

                {/* Monto - hero negro con naranja */}
                <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '600' }}>{t('myPayments.amountToPay')}</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: '#FF6B00' }}>{formatCurrency(selectedOrder.amount)} {selectedOrder.currency || 'MXN'}</Text>
                </View>

                {/* Bank Info */}
                {(selectedOrder as any).bank_info && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontWeight: '800', fontSize: 13, color: '#1A1A1A', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>💵 {t('myPayments.cashDeposit')}</Text>
                    <View style={{ backgroundColor: '#FFF', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#1A1A1A' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: '#1A1A1A', opacity: 0.6 }}>{t('myPayments.bank')}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>{(selectedOrder as any).bank_info.banco}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: '#1A1A1A', opacity: 0.6 }}>{t('myPayments.account')}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>{(selectedOrder as any).bank_info.cuenta}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: '#1A1A1A', opacity: 0.6 }}>{t('myPayments.beneficiary')}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A', flex: 1, textAlign: 'right' }}>{(selectedOrder as any).bank_info.beneficiario}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
                        <Text style={{ fontSize: 13, color: '#1A1A1A', opacity: 0.6 }}>{t('myPayments.reference')}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#FF6B00' }}>{selectedOrder.payment_reference}</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Warnings naranjas */}
                <View style={{ backgroundColor: '#FFF4EC', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8, borderLeftWidth: 3, borderLeftColor: '#FF6B00' }}>
                  <Ionicons name="warning" size={16} color="#FF6B00" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#1A1A1A', fontWeight: '500' }}>{t('myPayments.depositWarning')}</Text>
                </View>
                <View style={{ backgroundColor: '#FFF4EC', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8, borderLeftWidth: 3, borderLeftColor: '#FF6B00' }}>
                  <Ionicons name="time" size={16} color="#FF6B00" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#1A1A1A', fontWeight: '500' }}>{t('myPayments.confirmationTime')}</Text>
                </View>

                {/* Botones simétricos: ambos naranja, mismo padding/borde */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 20 }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#FF6B00', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, minHeight: 50 }}
                    onPress={() => {
                      const orderToOpen = selectedOrder;
                      setSelectedOrder(null);
                      setShowQR(false);
                      if (orderToOpen) openVoucherModal(orderToOpen);
                    }}
                  >
                    <Ionicons name="cloud-upload-outline" size={18} color="#FF6B00" />
                    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#FF6B00', fontWeight: '800', fontSize: 13, flexShrink: 1 }}>Subir Comprobante</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#FF6B00', borderWidth: 2, borderColor: '#FF6B00', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, minHeight: 50 }}
                    onPress={() => {
                      const orderToOpen = selectedOrder;
                      setShowQR(false);
                      setSelectedOrder(null);
                      // Esperar a que se cierre el Modal nativo antes de abrir el siguiente (iOS)
                      setTimeout(() => { if (orderToOpen) handlePayOnline(orderToOpen); }, 350);
                    }}
                  >
                    <Ionicons name="card-outline" size={18} color="#FFF" />
                    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#FFF', fontWeight: '800', fontSize: 13, flexShrink: 1 }}>Pagar en Línea</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal QR */}
      {selectedOrder && showQR && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { alignItems: 'center' }]}>
              <TouchableOpacity style={{ alignSelf: 'flex-end' }} onPress={() => setShowQR(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
              <View style={[styles.serviceBadge, { backgroundColor: '#9B59B6' }]}>
                <Ionicons name="mail" size={24} color="#FFF" />
                <Text style={styles.serviceBadgeText}>PO Box USA</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12 }}>Detalles del Pago</Text>
              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>Monto a Pagar</Text>
                <Text style={styles.amountValue}>{formatCurrency(selectedOrder.amount)}</Text>
                <Text style={styles.amountCurrency}>{selectedOrder.currency || 'MXN'}</Text>
              </View>
              <View style={styles.qrContainer}>
                <Text style={styles.qrLabel}>Código QR para Pago en Sucursal</Text>
                <View style={styles.qrBox}>
                  <QRCode
                    value={JSON.stringify({ type: 'payment_order', ref: selectedOrder.payment_reference, amount: selectedOrder.amount })}
                    size={180}
                    color="#333"
                    backgroundColor="#FFF"
                  />
                </View>
                <Text style={styles.qrHint}>Presente este código en cualquier sucursal para realizar su pago</Text>
              </View>
              <View style={styles.clabeContainer}>
                <Text style={styles.clabeLabel}>Referencia de Pago</Text>
                <View style={styles.clabeRow}>
                  <Text style={styles.clabeValue}>{selectedOrder.payment_reference}</Text>
                  <TouchableOpacity style={styles.copyButton} onPress={() => { Clipboard.setString(selectedOrder.payment_reference); Alert.alert('✅', t('myPayments.copied')); }}>
                    <Ionicons name="copy" size={20} color="#FF6B00" />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: '#FF6B00', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40, marginTop: 12 }}
                onPress={() => setShowQR(false)}
              >
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal de pago para paquetes */}
      {renderPackagePaymentModal()}
      
      {/* Modal de pago para facturas con CLABE */}
      {selectedInvoice && renderPaymentModal()}

      {/* ====== MODAL SUBIR COMPROBANTE ====== */}
      {voucherOrder && (
        <Modal visible={true} transparent animationType="slide" onRequestClose={() => setVoucherOrder(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: Dimensions.get('window').height * 0.85 }]}>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#333' }}>📎 {t('myPayments.uploadReceipt')}</Text>
                <TouchableOpacity onPress={() => { setVoucherOrder(null); setOcrResult(null); }}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Order info */}
                <View style={{ backgroundColor: '#F5F5F5', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: '#666' }}>{t('myPayments.paymentReference')}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#E65100', marginTop: 2 }}>{voucherOrder.payment_reference}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                    <View>
                      <Text style={{ fontSize: 11, color: '#999' }}>{t('myPayments.amountToPay')}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>{formatCurrency(voucherOrder.amount)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, color: '#999' }}>{t('myPayments.accumulated')}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: getVoucherTotal() >= Number(voucherOrder.amount) ? '#4CAF50' : '#FF6B00' }}>
                        {formatCurrency(getVoucherTotal())}
                      </Text>
                    </View>
                  </View>
                  {/* Progress bar */}
                  <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginTop: 8 }}>
                    <View style={{ height: 6, backgroundColor: getVoucherTotal() >= Number(voucherOrder.amount) ? '#4CAF50' : '#FF6B00', borderRadius: 3, width: `${Math.min(100, (getVoucherTotal() / Number(voucherOrder.amount)) * 100)}%` }} />
                  </View>
                </View>

                {/* OCR Result - confirm amount */}
                {ocrResult && ocrResult.status === 'pending_confirm' && (
                  <View style={{ backgroundColor: '#E8F5E9', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#A5D6A7' }}>
                    <Text style={{ fontWeight: '700', color: '#2E7D32', marginBottom: 8 }}>🔍 {t('myPayments.amountDetected')}</Text>
                    {ocrResult.detected_amount > 0 ? (
                      <Text style={{ fontSize: 13, color: '#333', marginBottom: 8 }}>
                        {t('myPayments.weDetected')} <Text style={{ fontWeight: '700' }}>${Number(ocrResult.detected_amount).toFixed(2)}</Text>
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 13, color: '#E65100', marginBottom: 8 }}>{t('myPayments.couldNotDetect')}</Text>
                    )}
                    <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{t('myPayments.enterCorrectAmount')}:</Text>
                    <TextInput
                      style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CCC', borderRadius: 8, padding: 10, fontSize: 18, fontWeight: '700', textAlign: 'center' }}
                      value={editAmount}
                      onChangeText={setEditAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                    <TouchableOpacity
                      style={{ backgroundColor: '#4CAF50', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 10 }}
                      onPress={confirmVoucherAmount}
                      disabled={confirmingVoucher || !editAmount}
                    >
                      {confirmingVoucher ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>✅ {t('myPayments.confirmAmount')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* Uploaded vouchers list */}
                {loadingVouchers ? (
                  <ActivityIndicator color="#FF6B00" style={{ marginVertical: 16 }} />
                ) : vouchers.length > 0 ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontWeight: '700', color: '#333', marginBottom: 8 }}>{t('myPayments.uploadedVouchers')} ({vouchers.length})</Text>
                    {vouchers.map((v: any, idx: number) => (
                      <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9', borderRadius: 8, padding: 8, marginBottom: 6 }}>
                        {v.file_url && (
                          <Image source={{ uri: v.file_url }} style={{ width: 50, height: 50, borderRadius: 6, marginRight: 10 }} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#333' }}>
                            {t('myPayments.voucher')} #{idx + 1}
                          </Text>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#2E7D32' }}>
                            ${Number(v.declared_amount || v.detected_amount || 0).toFixed(2)}
                          </Text>
                          <Text style={{ fontSize: 11, color: v.status === 'approved' ? '#4CAF50' : v.status === 'rejected' ? '#F44336' : '#FF9800' }}>
                            {v.status === 'pending_confirm' ? '⏳ ' + t('myPayments.pendingConfirm') :
                             v.status === 'pending_review' ? '📋 ' + t('myPayments.pendingReview') :
                             v.status === 'approved' ? '✅ ' + t('myPayments.approved') :
                             '❌ ' + t('myPayments.rejected')}
                          </Text>
                        </View>
                        {(v.status === 'pending_confirm' || v.status === 'pending_review') && (
                          <TouchableOpacity onPress={async () => {
                            try {
                              await fetch(`${API_URL}/api/payment/voucher/${v.id}`, {
                                method: 'DELETE',
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              if (voucherOrder) await loadVouchers(voucherOrder.id);
                            } catch (e) {}
                          }}>
                            <Ionicons name="trash-outline" size={20} color="#F44336" />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <Ionicons name="cloud-upload-outline" size={48} color="#CCC" />
                    <Text style={{ color: '#999', marginTop: 8, fontSize: 13 }}>{t('myPayments.noVouchersYet')}</Text>
                  </View>
                )}

                {/* Upload buttons */}
                {!uploadingVoucher && !ocrResult && (
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#1976D2', borderRadius: 10, padding: 14, alignItems: 'center' }}
                      onPress={() => pickAndUploadImage('camera')}
                    >
                      <Ionicons name="camera" size={24} color="#FFF" />
                      <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12, marginTop: 4 }}>{t('myPayments.takePhoto')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#7B1FA2', borderRadius: 10, padding: 14, alignItems: 'center' }}
                      onPress={() => pickAndUploadImage('gallery')}
                    >
                      <Ionicons name="images" size={24} color="#FFF" />
                      <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12, marginTop: 4 }}>{t('myPayments.fromGallery')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {uploadingVoucher && (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <ActivityIndicator size="large" color="#FF6B00" />
                    <Text style={{ color: '#666', marginTop: 8, fontSize: 13 }}>{t('myPayments.analyzingReceipt')}</Text>
                  </View>
                )}

                {/* Complete payment button */}
                {canComplete() && (
                  <TouchableOpacity
                    style={{ backgroundColor: '#4CAF50', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4 }}
                    onPress={completePayment}
                    disabled={completingPayment}
                  >
                    {completingPayment ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>🚀 {t('myPayments.sendPayment')}</Text>
                    )}
                  </TouchableOpacity>
                )}

                {getVoucherTotal() > 0 && getVoucherTotal() < Number(voucherOrder.amount) && (
                  <Text style={{ textAlign: 'center', color: '#FF6B00', fontSize: 12, marginTop: 8 }}>
                    {t('myPayments.remaining')}: {formatCurrency(Number(voucherOrder.amount) - getVoucherTotal())}
                  </Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ============ Online Pay Modal ============ */}
      <Modal visible={!!onlinePayOrder} transparent animationType="slide" onRequestClose={closeOnlinePay}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '92%' }]}>
            {/* Header */}
            <View style={{ backgroundColor: '#FF6B00', paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="card" size={22} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 17, marginLeft: 8 }}>Pagar en Línea</Text>
              </View>
              <TouchableOpacity onPress={closeOnlinePay} disabled={!!onlinePayLoading}>
                <Ionicons name="close" size={26} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {onlinePayOrder && (() => {
                const order: any = onlinePayOrder;
                const amount = Number(order.amount) || 0;
                const creditApplied = Number(order.credit_applied || 0);
                const walletApplied = Number(order.wallet_applied || 0);
                const walletBal = Number(walletStatus?.wallet_balance || 0);
                const creditBlocked = !!walletStatus?.is_credit_blocked;
                // Match service credit por servicio de los paquetes
                const pkgs: any[] = Array.isArray(order.packages) ? order.packages : [];
                const orderService = pkgs[0]?.service_type || order.service_type || 'po_box';
                const matchingCredit = (serviceCredits || []).find((c: any) => String(c.service) === String(orderService));
                const availableCredit = Number(
                  matchingCredit?.available_credit ??
                  matchingCredit?.available ??
                  matchingCredit?.balance ??
                  matchingCredit?.amount ??
                  0
                );
                const creditLimit = Number(matchingCredit?.credit_limit || 0);
                const hasCreditAssigned = creditLimit > 0;
                const totalApplied = Math.max(0, creditApplied + walletApplied);
                const showWalletCard = walletBal > 0 || walletApplied > 0;
                const showCreditCard = hasCreditAssigned && (availableCredit > 0 || creditApplied > 0);

                const parsedCreditAmount = Math.max(0, Math.min(parseFloat(creditPanelAmount) || 0, availableCredit, amount));
                const parsedWalletAmount = Math.max(0, Math.min(parseFloat(walletPanelAmount) || 0, walletBal, amount));
                const creditCoversAll = parsedCreditAmount >= amount && amount > 0;
                const walletCoversAll = parsedWalletAmount >= amount && amount > 0;

                return (
                  <>
                    {/* Resumen — hero negro */}
                    <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                      <Text style={{ color: '#FFF', opacity: 0.6, fontSize: 12 }}>Referencia</Text>
                      <Text style={{ color: '#FFF', fontWeight: '700', marginBottom: 12 }}>{order.payment_reference}</Text>
                      <Text style={{ color: '#FFF', opacity: 0.6, fontSize: 12 }}>Total a pagar</Text>
                      <Text style={{ color: '#FF6B00', fontWeight: '900', fontSize: 28 }}>
                        {formatCurrency(amount)} {order.currency || 'MXN'}
                      </Text>
                      {totalApplied > 0 && (
                        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                          <Text style={{ color: '#FF6B00', fontSize: 12, fontWeight: '700' }}>✓ Total aplicado: -{formatCurrency(totalApplied)}</Text>
                        </View>
                      )}
                    </View>

                    {/* Factura Switch */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#FFF', borderRadius: 10, borderWidth: 2, borderColor: onlinePayInvoice ? '#FF6B00' : '#E0E0E0', marginBottom: 12 }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontWeight: '700', color: '#1A1A1A' }}>¿Requiero factura?</Text>
                        {onlinePayInvoice && !fiscalData?.hasCompleteData && (
                          <Text style={{ color: '#FF3B30', fontSize: 12, marginTop: 4, fontWeight: '600' }}>Completa tus datos fiscales</Text>
                        )}
                      </View>
                      <Switch value={onlinePayInvoice} onValueChange={setOnlinePayInvoice} trackColor={{ true: '#FF6B00', false: '#CCC' }} thumbColor="#FFF" />
                    </View>

                    {onlinePayInvoice && fiscalData?.hasCompleteData && (
                      <View style={{ backgroundColor: '#FFF4EC', borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#FF6B00', padding: 12, marginBottom: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="checkmark-circle" size={18} color="#FF6B00" />
                            <Text style={{ fontWeight: '800', color: '#1A1A1A', marginLeft: 6 }}>Datos fiscales</Text>
                          </View>
                          <TouchableOpacity onPress={() => { setFiscalForm({ razon_social: fiscalData?.fiscal_razon_social || '', rfc: fiscalData?.fiscal_rfc || '', codigo_postal: fiscalData?.fiscal_codigo_postal || '', regimen_fiscal: fiscalData?.fiscal_regimen_fiscal || '', uso_cfdi: fiscalData?.fiscal_uso_cfdi || 'G03' }); setFiscalModalOpen(true); }}>
                            <Text style={{ color: '#FF6B00', fontWeight: '800', fontSize: 12 }}>Editar</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={{ color: '#1A1A1A', fontSize: 13, fontWeight: '700' }}>{fiscalData.fiscal_razon_social}</Text>
                        <Text style={{ color: '#1A1A1A', fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>RFC: {fiscalData.fiscal_rfc}</Text>
                        <Text style={{ color: '#1A1A1A', opacity: 0.6, fontSize: 11, marginTop: 2 }}>CP {fiscalData.fiscal_codigo_postal} · Régimen {fiscalData.fiscal_regimen_fiscal} · CFDI {fiscalData.fiscal_uso_cfdi}</Text>
                      </View>
                    )}

                    {onlinePayInvoice && !fiscalData?.hasCompleteData && (
                      <TouchableOpacity onPress={() => { setFiscalForm({ razon_social: fiscalData?.fiscal_razon_social || '', rfc: fiscalData?.fiscal_rfc || '', codigo_postal: fiscalData?.fiscal_codigo_postal || '', regimen_fiscal: fiscalData?.fiscal_regimen_fiscal || '', uso_cfdi: fiscalData?.fiscal_uso_cfdi || 'G03' }); setFiscalModalOpen(true); }} style={{ backgroundColor: '#FF6B00', padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 14 }}>
                        <Text style={{ color: '#FFF', fontWeight: '700' }}>Completar datos fiscales</Text>
                      </TouchableOpacity>
                    )}

                    {/* Métodos */}
                    <Text style={{ fontWeight: '800', color: '#1A1A1A', marginBottom: 10, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>Método de pago</Text>

                    {/* Montos aplicados: editar / quitar */}
                    {(walletApplied > 0 || creditApplied > 0) && (
                      <View style={{ backgroundColor: '#FFF4EC', borderRadius: 10, borderWidth: 1, borderColor: '#FF6B00', padding: 10, marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 }}>Monto aplicado</Text>
                        {walletApplied > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={{ color: '#1A1A1A', fontSize: 12 }}>Saldo: <Text style={{ color: '#FF6B00', fontWeight: '800' }}>-{formatCurrency(walletApplied)}</Text></Text>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity
                                disabled={!!onlinePayLoading || partialApplying === 'wallet'}
                                onPress={async () => {
                                  setPartialApplying('wallet');
                                  const prevApplied = walletApplied;
                                  const ok = await revertAppliedWallet();
                                  if (ok) {
                                    setWalletPanelOpen(true);
                                    setWalletPanelAmount(String(prevApplied.toFixed(2)));
                                  }
                                  setPartialApplying(null);
                                }}
                                style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: '#1A1A1A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                              >
                                <Text style={{ color: '#1A1A1A', fontSize: 11, fontWeight: '700' }}>Editar</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                disabled={!!onlinePayLoading || partialApplying === 'wallet'}
                                onPress={async () => {
                                  setPartialApplying('wallet');
                                  await revertAppliedWallet();
                                  setPartialApplying(null);
                                }}
                                style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: '#FF3B30', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                              >
                                <Text style={{ color: '#FF3B30', fontSize: 11, fontWeight: '700' }}>Quitar</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                        {creditApplied > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ color: '#1A1A1A', fontSize: 12 }}>Crédito: <Text style={{ color: '#FF6B00', fontWeight: '800' }}>-{formatCurrency(creditApplied)}</Text></Text>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity
                                disabled={!!onlinePayLoading || partialApplying === 'credit'}
                                onPress={async () => {
                                  setPartialApplying('credit');
                                  const prevApplied = creditApplied;
                                  const ok = await revertAppliedCredit();
                                  if (ok) {
                                    setCreditPanelOpen(true);
                                    setCreditPanelAmount(String(prevApplied.toFixed(2)));
                                  }
                                  setPartialApplying(null);
                                }}
                                style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: '#1A1A1A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                              >
                                <Text style={{ color: '#1A1A1A', fontSize: 11, fontWeight: '700' }}>Editar</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                disabled={!!onlinePayLoading || partialApplying === 'credit'}
                                onPress={async () => {
                                  setPartialApplying('credit');
                                  await revertAppliedCredit();
                                  setPartialApplying(null);
                                }}
                                style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: '#FF3B30', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                              >
                                <Text style={{ color: '#FF3B30', fontSize: 11, fontWeight: '700' }}>Quitar</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Tarjeta */}
                    <TouchableOpacity disabled={!!onlinePayLoading || amount <= 0} onPress={handlePayOnlineCard} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#1A1A1A', marginBottom: 10, backgroundColor: '#FFF', opacity: onlinePayLoading ? 0.6 : 1 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#FFF4EC', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="card" size={22} color="#FF6B00" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontWeight: '800', color: '#1A1A1A' }}>Tarjeta de crédito/débito</Text>
                        <Text style={{ color: '#1A1A1A', opacity: 0.6, fontSize: 12 }}>Visa, Mastercard, Amex · OpenPay</Text>
                      </View>
                      {onlinePayLoading === 'card' ? <ActivityIndicator color="#FF6B00" /> : <Ionicons name="chevron-forward" size={20} color="#1A1A1A" />}
                    </TouchableOpacity>

                    {/* PayPal */}
                    <TouchableOpacity disabled={!!onlinePayLoading || amount <= 0} onPress={handlePayOnlinePaypal} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#1A1A1A', marginBottom: 10, backgroundColor: '#FFF', opacity: onlinePayLoading ? 0.6 : 1 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#FFF4EC', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="logo-paypal" size={22} color="#FF6B00" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontWeight: '800', color: '#1A1A1A' }}>PayPal</Text>
                        <Text style={{ color: '#1A1A1A', opacity: 0.6, fontSize: 12 }}>Paga con tu cuenta PayPal</Text>
                      </View>
                      {onlinePayLoading === 'paypal' ? <ActivityIndicator color="#FF6B00" /> : <Ionicons name="chevron-forward" size={20} color="#1A1A1A" />}
                    </TouchableOpacity>

                    {/* Saldo a favor */}
                    {showWalletCard && (() => {
                      const noBalance = walletBal <= 0;
                      return (
                        <View style={{ marginBottom: 10 }}>
                          <TouchableOpacity
                            disabled={!!onlinePayLoading || partialApplying === 'wallet' || (noBalance && walletApplied <= 0)}
                            onPress={() => {
                              if (walletPanelOpen) { setWalletPanelOpen(false); return; }
                              setWalletPanelOpen(true);
                              setWalletPanelAmount(String(Math.min(walletBal, amount).toFixed(2)));
                              setCreditPanelOpen(false);
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: walletPanelOpen ? '#FF6B00' : '#1A1A1A', backgroundColor: '#FFF', opacity: noBalance ? 0.5 : 1 }}
                          >
                            <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#FFF4EC', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="wallet" size={22} color="#FF6B00" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <Text style={{ fontWeight: '800', color: '#1A1A1A' }}>Saldo a favor</Text>
                              <Text style={{ color: '#1A1A1A', opacity: 0.6, fontSize: 12 }}>Disponible: {formatCurrency(walletBal)}</Text>
                              {noBalance && <Text style={{ color: '#FF3B30', fontSize: 11, fontWeight: '600' }}>Sin saldo a favor</Text>}
                            </View>
                            <Ionicons name={walletPanelOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#1A1A1A" />
                          </TouchableOpacity>

                          {walletPanelOpen && !noBalance && (
                            <View style={{ backgroundColor: '#FFF4EC', borderRadius: 12, borderWidth: 1, borderColor: '#FF6B00', padding: 14, marginTop: 6 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' }}>
                                <Text style={{ fontSize: 12, color: '#1A1A1A', opacity: 0.7 }}>Total del pago</Text>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>{formatCurrency(amount)}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                <Text style={{ fontSize: 12, color: '#1A1A1A', opacity: 0.7 }}>Saldo disponible</Text>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FF6B00' }}>{formatCurrency(walletBal)}</Text>
                              </View>
                              <Text style={{ fontSize: 12, color: '#1A1A1A', fontWeight: '700', marginBottom: 6 }}>Monto a usar de tu saldo</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#1A1A1A', paddingHorizontal: 12 }}>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FF6B00', marginRight: 6 }}>$</Text>
                                <TextInput value={walletPanelAmount} onChangeText={(v) => setWalletPanelAmount(normalizeMoneyInput(v))} onBlur={() => setWalletPanelAmount((v) => ensureMoneyInput(v))} keyboardType="decimal-pad" style={{ flex: 1, fontSize: 18, fontWeight: '800', color: '#1A1A1A', paddingVertical: 10 }} />
                                <TouchableOpacity onPress={() => setWalletPanelAmount(String(Math.min(walletBal, amount).toFixed(2)))}>
                                  <Text style={{ color: '#FF6B00', fontWeight: '800', fontSize: 12 }}>MAX</Text>
                                </TouchableOpacity>
                              </View>
                              <Text style={{ fontSize: 11, color: '#1A1A1A', opacity: 0.6, marginTop: 6 }}>Máximo: {formatCurrency(Math.min(walletBal, amount))}</Text>
                              {parsedWalletAmount > 0 && parsedWalletAmount < amount && (
                                <View style={{ backgroundColor: '#FFF', borderRadius: 8, padding: 10, marginTop: 10, borderLeftWidth: 3, borderLeftColor: '#FF6B00' }}>
                                  <Text style={{ fontSize: 12, color: '#1A1A1A', marginBottom: 4 }}><Text style={{ fontWeight: '800', color: '#FF6B00' }}>{formatCurrency(parsedWalletAmount)}</Text> con saldo</Text>
                                  <Text style={{ fontSize: 12, color: '#1A1A1A' }}><Text style={{ fontWeight: '800', color: '#1A1A1A' }}>{formatCurrency(amount - parsedWalletAmount)}</Text> con tarjeta o PayPal</Text>
                                </View>
                              )}
                              <View style={{ gap: 8, marginTop: 12 }}>
                                {walletCoversAll ? (
                                  <TouchableOpacity disabled={!!onlinePayLoading || parsedWalletAmount <= 0} onPress={() => handlePayInternal('wallet')} style={{ backgroundColor: '#FF6B00', borderRadius: 10, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                                    {onlinePayLoading === 'wallet' ? <ActivityIndicator color="#FFF" /> : <Ionicons name="checkmark-circle" size={18} color="#FFF" />}
                                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Pagar todo con saldo</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <TouchableOpacity
                                    disabled={!!onlinePayLoading || partialApplying === 'wallet' || parsedWalletAmount <= 0}
                                    onPress={async () => {
                                      if (partialApplying) return;
                                      setPartialApplying('wallet');
                                      if (walletApplied > 0) {
                                        const reverted = await revertAppliedWallet();
                                        if (!reverted) { setPartialApplying(null); return; }
                                      }
                                      setWalletPartial({ walletAmount: parsedWalletAmount, applied: false });
                                      const r = await applyWalletFirst();
                                      if (r) setWalletPanelOpen(false);
                                      setPartialApplying(null);
                                    }}
                                    style={{ backgroundColor: '#FF6B00', borderRadius: 10, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: parsedWalletAmount <= 0 ? 0.5 : 1 }}
                                  >
                                    {partialApplying === 'wallet' ? <ActivityIndicator color="#FFF" /> : <Ionicons name="add-circle" size={18} color="#FFF" />}
                                    <Text style={{ color: '#FFF', fontWeight: '800' }}>{walletApplied > 0 ? 'Actualizar saldo aplicado' : 'Aplicar saldo y elegir resto'}</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={() => setWalletPanelOpen(false)} style={{ paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1A1A1A', alignItems: 'center' }}>
                                  <Text style={{ color: '#1A1A1A', fontWeight: '700' }}>Cancelar</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })()}

                    {/* Crédito de servicio */}
                    {showCreditCard && (() => {
                      const noCredit = availableCredit <= 0 || creditBlocked;
                      return (
                        <View style={{ marginBottom: 10 }}>
                          <TouchableOpacity
                            disabled={!!onlinePayLoading || partialApplying === 'credit' || (noCredit && creditApplied <= 0)}
                            onPress={() => {
                              if (creditPanelOpen) { setCreditPanelOpen(false); return; }
                              setCreditPanelOpen(true);
                              setCreditPanelAmount(String(Math.min(availableCredit, amount).toFixed(2)));
                              setWalletPanelOpen(false);
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: creditPanelOpen ? '#FF6B00' : '#1A1A1A', backgroundColor: '#FFF', opacity: noCredit ? 0.5 : 1 }}
                          >
                            <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#FFF4EC', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="cash" size={22} color="#FF6B00" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <Text style={{ fontWeight: '800', color: '#1A1A1A' }}>Crédito de servicio</Text>
                              <Text style={{ color: '#1A1A1A', opacity: 0.6, fontSize: 12 }}>Disponible: {formatCurrency(availableCredit)} · {orderService}</Text>
                              {creditBlocked && <Text style={{ color: '#FF3B30', fontSize: 11, fontWeight: '600' }}>Crédito bloqueado</Text>}
                            </View>
                            <Ionicons name={creditPanelOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#1A1A1A" />
                          </TouchableOpacity>

                          {creditPanelOpen && !noCredit && (
                            <View style={{ backgroundColor: '#FFF4EC', borderRadius: 12, borderWidth: 1, borderColor: '#FF6B00', padding: 14, marginTop: 6 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' }}>
                                <Text style={{ fontSize: 12, color: '#1A1A1A', opacity: 0.7 }}>Total del pago</Text>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A1A1A' }}>{formatCurrency(amount)}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                <Text style={{ fontSize: 12, color: '#1A1A1A', opacity: 0.7 }}>Crédito disponible</Text>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FF6B00' }}>{formatCurrency(availableCredit)}</Text>
                              </View>
                              <Text style={{ fontSize: 12, color: '#1A1A1A', fontWeight: '700', marginBottom: 6 }}>Monto a usar de tu crédito</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#1A1A1A', paddingHorizontal: 12 }}>
                                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FF6B00', marginRight: 6 }}>$</Text>
                                <TextInput value={creditPanelAmount} onChangeText={(v) => setCreditPanelAmount(normalizeMoneyInput(v))} onBlur={() => setCreditPanelAmount((v) => ensureMoneyInput(v))} keyboardType="decimal-pad" style={{ flex: 1, fontSize: 18, fontWeight: '800', color: '#1A1A1A', paddingVertical: 10 }} />
                                <TouchableOpacity onPress={() => setCreditPanelAmount(String(Math.min(availableCredit, amount).toFixed(2)))}>
                                  <Text style={{ color: '#FF6B00', fontWeight: '800', fontSize: 12 }}>MAX</Text>
                                </TouchableOpacity>
                              </View>
                              <Text style={{ fontSize: 11, color: '#1A1A1A', opacity: 0.6, marginTop: 6 }}>Máximo: {formatCurrency(Math.min(availableCredit, amount))}</Text>
                              {parsedCreditAmount > 0 && parsedCreditAmount < amount && (
                                <View style={{ backgroundColor: '#FFF', borderRadius: 8, padding: 10, marginTop: 10, borderLeftWidth: 3, borderLeftColor: '#FF6B00' }}>
                                  <Text style={{ fontSize: 12, color: '#1A1A1A', marginBottom: 4 }}><Text style={{ fontWeight: '800', color: '#FF6B00' }}>{formatCurrency(parsedCreditAmount)}</Text> con crédito</Text>
                                  <Text style={{ fontSize: 12, color: '#1A1A1A' }}><Text style={{ fontWeight: '800', color: '#1A1A1A' }}>{formatCurrency(amount - parsedCreditAmount)}</Text> con tarjeta o PayPal</Text>
                                </View>
                              )}
                              <View style={{ gap: 8, marginTop: 12 }}>
                                {creditCoversAll ? (
                                  <TouchableOpacity disabled={!!onlinePayLoading} onPress={() => handlePayInternal('credit')} style={{ backgroundColor: '#FF6B00', borderRadius: 10, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                                    {onlinePayLoading === 'credit' ? <ActivityIndicator color="#FFF" /> : <Ionicons name="checkmark-circle" size={18} color="#FFF" />}
                                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Pagar todo con crédito</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <TouchableOpacity
                                    disabled={!!onlinePayLoading || partialApplying === 'credit' || parsedCreditAmount <= 0}
                                    onPress={async () => {
                                      if (partialApplying) return;
                                      setPartialApplying('credit');
                                      if (creditApplied > 0) {
                                        const reverted = await revertAppliedCredit();
                                        if (!reverted) { setPartialApplying(null); return; }
                                      }
                                      setCreditPartial({ service: orderService, creditAmount: parsedCreditAmount, applied: false });
                                      const r = await applyCreditFirst();
                                      if (r) setCreditPanelOpen(false);
                                      setPartialApplying(null);
                                    }}
                                    style={{ backgroundColor: '#FF6B00', borderRadius: 10, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: parsedCreditAmount <= 0 ? 0.5 : 1 }}
                                  >
                                    {partialApplying === 'credit' ? <ActivityIndicator color="#FFF" /> : <Ionicons name="add-circle" size={18} color="#FFF" />}
                                    <Text style={{ color: '#FFF', fontWeight: '800' }}>{creditApplied > 0 ? 'Actualizar crédito aplicado' : 'Aplicar crédito y elegir resto'}</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={() => setCreditPanelOpen(false)} style={{ paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1A1A1A', alignItems: 'center' }}>
                                  <Text style={{ color: '#1A1A1A', fontWeight: '700' }}>Cancelar</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })()}

                    <View style={{ backgroundColor: '#FFF', padding: 12, borderRadius: 10, marginTop: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0' }}>
                      <Ionicons name="shield-checkmark" size={18} color="#1A1A1A" />
                      <Text style={{ color: '#1A1A1A', opacity: 0.7, fontSize: 12, marginLeft: 8, flex: 1 }}>
                        Procesado de forma segura. Serás redirigido al portal del proveedor.
                      </Text>
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============ Success Modal (custom design) ============ */}
      <Modal visible={!!successModal?.visible} transparent animationType="fade" onRequestClose={() => setSuccessModal(null)}>
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden' }}>
            {/* Hero verde con check */}
            <View style={{ backgroundColor: '#2E7D32', paddingVertical: 28, alignItems: 'center' }}>
              <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Ionicons name="checkmark-circle" size={64} color="#FFF" />
              </View>
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 20 }}>{successModal?.title || '¡Pago confirmado!'}</Text>
            </View>
            {/* Contenido */}
            <View style={{ padding: 20 }}>
              <Text style={{ color: '#444', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
                {successModal?.message}
              </Text>
              {!!successModal?.amount && (
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: '#888', fontSize: 12 }}>Monto</Text>
                  <Text style={{ color: '#2E7D32', fontWeight: '800', fontSize: 28 }}>
                    {formatCurrency(successModal.amount)} MXN
                  </Text>
                </View>
              )}
              <View style={{ backgroundColor: '#F5F7FA', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                {!!successModal?.reference && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#666', fontSize: 12 }}>Referencia</Text>
                    <Text style={{ color: '#333', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' }}>{successModal.reference}</Text>
                  </View>
                )}
                {!!successModal?.method && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#666', fontSize: 12 }}>Método</Text>
                    <Text style={{ color: '#333', fontSize: 12, fontWeight: '700' }}>{successModal.method}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#666', fontSize: 12 }}>Estado</Text>
                  <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                    <Text style={{ color: '#2E7D32', fontSize: 11, fontWeight: '700' }}>✓ Pagado</Text>
                  </View>
                </View>
              </View>
              {successModal?.invoiceRequested && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', borderRadius: 10, borderWidth: 1, borderColor: '#FFE082', padding: 10, marginBottom: 12 }}>
                  <Ionicons name="document-text" size={18} color="#F57F17" />
                  <Text style={{ color: '#5D4037', fontSize: 12, marginLeft: 8, flex: 1 }}>
                    Tu factura se está generando y llegará a tu correo en unos minutos.
                  </Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => setSuccessModal(null)}
                style={{ backgroundColor: '#FF6B00', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============ Fiscal Data Modal ============ */}
      <Modal visible={fiscalModalOpen} transparent animationType="slide" onRequestClose={() => !savingFiscal && setFiscalModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={{ backgroundColor: '#FF6B00', paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Datos fiscales</Text>
              <TouchableOpacity onPress={() => !savingFiscal && setFiscalModalOpen(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={{ color: '#666', fontSize: 12, marginBottom: 10 }}>Completa tus datos para poder generar facturas CFDI.</Text>

              <Text style={{ fontWeight: '700', color: '#333', marginBottom: 4 }}>Razón Social *</Text>
              <TextInput value={fiscalForm.razon_social} onChangeText={(v) => setFiscalForm((p) => ({ ...p, razon_social: v }))} style={fiscalStyles.input} placeholder="Nombre o razón social" />

              <Text style={{ fontWeight: '700', color: '#333', marginBottom: 4, marginTop: 10 }}>RFC *</Text>
              <TextInput value={fiscalForm.rfc} onChangeText={(v) => setFiscalForm((p) => ({ ...p, rfc: v.toUpperCase() }))} autoCapitalize="characters" style={fiscalStyles.input} placeholder="XAXX010101000" maxLength={13} />

              <Text style={{ fontWeight: '700', color: '#333', marginBottom: 4, marginTop: 10 }}>Código Postal *</Text>
              <TextInput value={fiscalForm.codigo_postal} onChangeText={(v) => setFiscalForm((p) => ({ ...p, codigo_postal: v.replace(/\D/g, '').slice(0, 5) }))} keyboardType="number-pad" style={fiscalStyles.input} placeholder="00000" maxLength={5} />

              <Text style={{ fontWeight: '700', color: '#333', marginBottom: 4, marginTop: 10 }}>Régimen Fiscal *</Text>
              <TextInput value={fiscalForm.regimen_fiscal} onChangeText={(v) => setFiscalForm((p) => ({ ...p, regimen_fiscal: v.replace(/\D/g, '').slice(0, 3) }))} keyboardType="number-pad" style={fiscalStyles.input} placeholder="Ej. 612, 626, 601" maxLength={3} />

              <Text style={{ fontWeight: '700', color: '#333', marginBottom: 4, marginTop: 10 }}>Uso CFDI</Text>
              <TextInput value={fiscalForm.uso_cfdi} onChangeText={(v) => setFiscalForm((p) => ({ ...p, uso_cfdi: v.toUpperCase() }))} autoCapitalize="characters" style={fiscalStyles.input} placeholder="G03" maxLength={4} />

              <TouchableOpacity
                disabled={savingFiscal}
                onPress={saveFiscalData}
                style={{ backgroundColor: '#2E7D32', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 16, opacity: savingFiscal ? 0.6 : 1 }}
              >
                {savingFiscal ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const fiscalStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#FAFAFA',
    color: '#333',
  },
});

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFF',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#FF6B00',
    backgroundColor: '#FFF8F0',
  },
  tabText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#FF6B00',
    fontWeight: '700',
  },
  orderCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#FFF5EE',
    borderWidth: 1,
    borderColor: '#FFE0CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  orderRef: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  orderStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  orderStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderBody: {
    padding: 12,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  orderLabel: {
    fontSize: 13,
    color: '#888',
  },
  orderValue: {
    fontSize: 13,
    color: '#333',
  },
  orderPackages: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  orderPkgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  orderPkgTracking: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
  },
  orderPkgDetail: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  orderPkgAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF6B00',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalCard: {
    backgroundColor: '#FF6B00',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  totalAmount: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: 4,
  },
  totalCurrency: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptyText: {
    color: '#666',
    marginTop: 8,
  },
  serviceGroup: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  serviceTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  serviceSubtotal: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  invoiceCard: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  invoiceConcept: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  invoiceDue: {
    fontSize: 12,
    color: '#E74C3C',
    marginTop: 4,
  },
  invoiceRight: {
    alignItems: 'flex-end',
  },
  invoiceAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  payButton: {
    backgroundColor: '#FF6B00',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  payButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    flex: 1,
  },
  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 1,
  },
  serviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 16,
  },
  serviceBadgeText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  amountBox: {
    backgroundColor: '#F8F8F8',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
    color: '#666',
  },
  amountValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  amountCurrency: {
    fontSize: 14,
    color: '#666',
  },
  clabeContainer: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  clabeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  clabeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clabeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 1,
  },
  copyButton: {
    padding: 8,
  },
  bankName: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  instructionsBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  instructionsText: {
    flex: 1,
    fontSize: 13,
    color: '#1976D2',
    lineHeight: 18,
  },
  warningBox: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  warningText: {
    fontSize: 12,
    color: '#E65100',
    lineHeight: 18,
  },
  shareButton: {
    flexDirection: 'row',
    backgroundColor: '#FF6B00',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  shareButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Estilos para QR
  qrContainer: {
    alignItems: 'center',
    marginVertical: 16,
    paddingVertical: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
  },
  qrLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontWeight: '500',
  },
  qrBox: {
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  qrHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default MyPaymentsScreen;
