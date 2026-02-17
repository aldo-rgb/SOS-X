import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Share,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { 
  getPendingPaymentsApi, 
  getPaymentClabeApi,
  PaymentInvoice 
} from '../services/api';
import { useTranslation } from 'react-i18next';

// Types for navigation
type RootStackParamList = {
  MyPayments: { user: any; token: string };
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
  const { user, token } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalPending, setTotalPending] = useState(0);
  const [groupedInvoices, setGroupedInvoices] = useState<GroupedInvoices[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<PaymentInvoice | null>(null);
  const [clabeInfo, setClabeInfo] = useState<ClabeInfo | null>(null);
  const [loadingClabe, setLoadingClabe] = useState(false);

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

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayments();
  };

  const handlePayInvoice = async (invoice: PaymentInvoice) => {
    setSelectedInvoice(invoice);
    setLoadingClabe(true);
    
    try {
      const response = await getPaymentClabeApi(token, invoice.service_type, invoice.id);
      if (response.success) {
        setClabeInfo(response);
      }
    } catch (error) {
      console.error('Error getting CLABE:', error);
      Alert.alert('Error', 'No se pudo obtener la información de pago');
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

  // Modal de pago
  const renderPaymentModal = () => {
    if (!selectedInvoice) return null;

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

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {groupedInvoices.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={64} color="#2ECC71" />
            <Text style={styles.emptyTitle}>¡Todo al día!</Text>
            <Text style={styles.emptyText}>No tienes pagos pendientes</Text>
          </View>
        ) : (
          groupedInvoices.map((group, index) => (
            <View key={index} style={styles.serviceGroup}>
              {/* Header del servicio */}
              <View style={[styles.serviceHeader, { backgroundColor: group.color }]}>
                <Ionicons 
                  name={SERVICE_ICONS[group.service] as any || 'cash'} 
                  size={24} 
                  color="#FFF" 
                />
                <Text style={styles.serviceTitle}>{group.serviceName}</Text>
                <Text style={styles.serviceSubtotal}>{formatCurrency(group.subtotal)}</Text>
              </View>

              {/* Facturas */}
              {group.invoices.map((invoice) => (
                <View key={invoice.id} style={styles.invoiceCard}>
                  <View style={styles.invoiceInfo}>
                    <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
                    <Text style={styles.invoiceConcept} numberOfLines={2}>
                      {invoice.concept}
                    </Text>
                    {invoice.due_date && (
                      <Text style={styles.invoiceDue}>
                        Vence: {formatDate(invoice.due_date)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.invoiceRight}>
                    <Text style={styles.invoiceAmount}>{formatCurrency(invoice.amount)}</Text>
                    <TouchableOpacity 
                      style={styles.payButton}
                      onPress={() => handlePayInvoice(invoice)}
                    >
                      <Text style={styles.payButtonText}>VER CLABE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}

        <View style={styles.footerInfo}>
          <Ionicons name="shield-checkmark" size={20} color="#666" />
          <Text style={styles.footerText}>
            Cada servicio tiene su propia cuenta bancaria (CLABE). 
            Sus pagos son procesados de forma segura a través de SPEI.
          </Text>
        </View>
      </ScrollView>

      {/* Modal de pago */}
      {selectedInvoice && renderPaymentModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
});

export default MyPaymentsScreen;
