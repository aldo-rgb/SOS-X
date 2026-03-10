/**
 * PaymentSummaryScreen.tsx
 * 
 * Pantalla de resumen de pago para paquetes PO Box USA en status "Procesando"
 * Pasarela de pago general con múltiples opciones:
 * - Tarjeta de crédito/débito (OpenPay)
 * - PayPal
 * - Pago en efectivo en sucursal
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Modal,
  TouchableOpacity,
  Clipboard,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  ActivityIndicator,
  IconButton,
  Divider,
  Chip,
  Surface,
  RadioButton,
} from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { API_URL, Package } from '../services/api';

// Colores de marca
const ORANGE = '#F05A28';
const GREEN = '#4CAF50';
const PAYPAL_BLUE = '#003087';
const OPENPAY_RED = '#E11B1B';
const CASH_YELLOW = '#F59E0B';

// Tipos de método de pago
type PaymentType = 'card' | 'paypal' | 'cash';

type RootStackParamList = {
  Home: { user: any; token: string };
  PaymentSummary: {
    packages: Package[];
    user: any;
    token: string;
  };
};

type PaymentSummaryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PaymentSummary'>;
  route: RouteProp<RootStackParamList, 'PaymentSummary'>;
};

export default function PaymentSummaryScreen({ route, navigation }: PaymentSummaryScreenProps) {
  const { packages, user, token } = route.params;
  
  const [loading, setLoading] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType>('card');
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showCashInstructions, setShowCashInstructions] = useState(false);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  
  // Info bancaria y de sucursal del backend
  const [bankInfo, setBankInfo] = useState<{
    banco: string;
    clabe: string;
    cuenta: string;
    beneficiario: string;
  } | null>(null);
  const [branchInfo, setBranchInfo] = useState<{
    nombre: string;
    direccion: string;
    telefono: string;
    horario: string;
  } | null>(null);

  // Calcular totales
  const totalMXN = packages.reduce((sum, p) => sum + parseFloat(String(p.assigned_cost_mxn || 0)), 0);
  const totalWeight = packages.reduce((sum, p) => sum + parseFloat(String(p.weight || 0)), 0);

  // Generar referencia de pago
  const generatePaymentReference = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const userId = user.id.toString().padStart(4, '0');
    return `PB-${userId}-${timestamp}`;
  };

  // ============ PAGO CON TARJETA (OpenPay) ============
  const startCardPayment = async () => {
    setLoading(true);
    try {
      const packageIds = packages.map(p => p.id);
      
      const res = await fetch(`${API_URL}/api/pobox/payment/openpay/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageIds,
          userId: user.id,
          totalAmount: totalMXN,
          customerEmail: user.email,
          customerName: user.full_name,
        }),
      });

      const data = await res.json();

      if (data.success && data.approvalUrl) {
        setApprovalUrl(data.approvalUrl);
      } else {
        Alert.alert('Error', data.error || 'No se pudo iniciar el pago con tarjeta');
      }
    } catch (error) {
      console.error('Error starting card payment:', error);
      Alert.alert('Error', 'No se pudo conectar con el servidor de pagos');
    } finally {
      setLoading(false);
    }
  };

  // ============ PAGO CON PAYPAL ============
  const startPayPalPayment = async () => {
    setLoading(true);
    try {
      const packageIds = packages.map(p => p.id);
      
      const res = await fetch(`${API_URL}/api/pobox/payment/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageIds,
          userId: user.id,
          totalAmount: totalMXN,
        }),
      });

      const data = await res.json();

      if (data.success && data.approvalUrl) {
        setPaypalOrderId(data.orderId);
        setApprovalUrl(data.approvalUrl);
      } else {
        Alert.alert('Error', data.error || 'No se pudo iniciar el pago');
      }
    } catch (error) {
      console.error('Error starting PayPal payment:', error);
      Alert.alert('Error', 'No se pudo conectar con el servidor de pagos');
    } finally {
      setLoading(false);
    }
  };

  // ============ PAGO EN EFECTIVO ============
  const startCashPayment = async () => {
    setLoading(true);
    try {
      const packageIds = packages.map(p => p.id);
      const reference = generatePaymentReference();
      
      // Obtener el branch_id del primer paquete si existe
      const firstPackage = packages[0] as any;
      const branchId = firstPackage?.destination_branch_id || firstPackage?.branch_id || null;
      
      const res = await fetch(`${API_URL}/api/pobox/payment/cash/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageIds,
          userId: user.id,
          totalAmount: totalMXN,
          reference,
          branchId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPaymentReference(data.reference || reference);
        // Guardar info bancaria y de sucursal del backend
        if (data.bankInfo) {
          setBankInfo(data.bankInfo);
        }
        if (data.branchInfo) {
          setBranchInfo(data.branchInfo);
        }
        setShowCashInstructions(true);
      } else {
        Alert.alert('Error', data.error || 'No se pudo generar la orden de pago');
      }
    } catch (error) {
      console.error('Error creating cash payment:', error);
      // Aún así mostrar las instrucciones con referencia generada localmente
      const reference = generatePaymentReference();
      setPaymentReference(reference);
      // Usar valores por defecto
      setBankInfo({
        banco: 'BBVA México',
        clabe: '012580001234567890',
        cuenta: '1234567890',
        beneficiario: 'EntregaX SA de CV'
      });
      setBranchInfo({
        nombre: 'CEDIS Monterrey',
        direccion: 'Av. Industrial #123, Monterrey, NL',
        telefono: '81 1234 5678',
        horario: 'Lunes a Viernes: 9:00 - 18:00, Sábados: 9:00 - 14:00'
      });
      setShowCashInstructions(true);
    } finally {
      setLoading(false);
    }
  };

  // Manejar navegación del WebView
  const handleWebViewNavigation = (navState: any) => {
    const { url } = navState;

    if (url.includes('success') || url.includes('payment/success') || url.includes('completed')) {
      setApprovalUrl(null);
      if (selectedPaymentType === 'paypal') {
        capturePayPalPayment();
      } else {
        // Para OpenPay, el pago se procesa automáticamente
        handlePaymentSuccess();
      }
    }

    if (url.includes('cancel') || url.includes('payment/cancel') || url.includes('failed')) {
      setApprovalUrl(null);
      Alert.alert('Cancelado', 'El pago fue cancelado');
    }
  };

  // Capturar pago PayPal
  const capturePayPalPayment = async () => {
    setVerifying(true);
    try {
      const packageIds = packages.map(p => p.id);

      const res = await fetch(`${API_URL}/api/pobox/payment/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paypalOrderId,
          packageIds,
          userId: user.id,
        }),
      });

      const data = await res.json();

      if (data.success) {
        handlePaymentSuccess(data.transactionId);
      } else {
        Alert.alert('Error', data.error || 'No se pudo verificar el pago');
      }
    } catch (error) {
      console.error('Error capturing payment:', error);
      Alert.alert('Error', 'No se pudo verificar el pago');
    } finally {
      setVerifying(false);
    }
  };

  // Manejar pago exitoso
  const handlePaymentSuccess = (transactionId?: string) => {
    Alert.alert(
      '¡Pago Exitoso! 🎉',
      `Tus ${packages.length} paquete(s) han sido pagados.\n\n${transactionId ? `Transacción: ${transactionId}` : ''}`,
      [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Home', { user, token }),
        },
      ]
    );
  };

  // Cerrar WebView
  const closeWebView = () => {
    setApprovalUrl(null);
    Alert.alert('Cancelado', 'Has cerrado la ventana de pago');
  };

  // Copiar referencia al portapapeles
  const copyReference = () => {
    if (paymentReference) {
      Clipboard.setString(paymentReference);
      Alert.alert('✅ Copiado', 'Referencia copiada al portapapeles');
    }
  };

  // Iniciar pago según el tipo seleccionado
  const handlePayment = () => {
    switch (selectedPaymentType) {
      case 'card':
        startCardPayment();
        break;
      case 'paypal':
        startPayPalPayment();
        break;
      case 'cash':
        startCashPayment();
        break;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />

      {/* WebView Modal para Pagos Online */}
      {approvalUrl && (
        <Modal visible={true} animationType="slide" onRequestClose={closeWebView}>
          <SafeAreaView style={styles.webViewContainer}>
            <View style={styles.webViewHeader}>
              <IconButton icon="close" size={24} onPress={closeWebView} />
              <Text style={styles.webViewTitle}>Pago Seguro</Text>
              <View style={{ width: 48 }} />
            </View>
            <WebView
              source={{ uri: approvalUrl }}
              onNavigationStateChange={handleWebViewNavigation}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={selectedPaymentType === 'paypal' ? PAYPAL_BLUE : OPENPAY_RED} />
                  <Text style={styles.loadingText}>Procesando pago...</Text>
                </View>
              )}
              style={styles.webView}
            />
          </SafeAreaView>
        </Modal>
      )}

      {/* Modal de Instrucciones de Pago en Efectivo */}
      {showCashInstructions && (
        <Modal visible={true} animationType="slide" transparent>
          <View style={styles.cashModalOverlay}>
            <View style={styles.cashModalContent}>
              <View style={styles.cashModalHeader}>
                <Text style={styles.cashModalTitle}>📋 Instrucciones de Pago</Text>
                <IconButton icon="close" size={24} onPress={() => {
                  setShowCashInstructions(false);
                  navigation.navigate('Home', { user, token });
                }} />
              </View>

              <ScrollView style={styles.cashModalBody}>
                <View style={styles.referenceCard}>
                  <Text style={styles.referenceLabel}>Tu referencia de pago:</Text>
                  <TouchableOpacity onPress={copyReference} style={styles.referenceBox}>
                    <Text style={styles.referenceNumber}>{paymentReference}</Text>
                    <Text style={styles.copyHint}>📋 Toca para copiar</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.amountCard}>
                  <Text style={styles.amountLabel}>Monto a pagar:</Text>
                  <Text style={styles.amountValue}>${totalMXN.toFixed(2)} MXN</Text>
                </View>

                <View style={styles.instructionsSection}>
                  <Text style={styles.instructionsTitle}>💳 Pago por Transferencia/SPEI:</Text>
                  <View style={styles.bankInfo}>
                    <Text style={styles.bankInfoRow}>Banco: <Text style={styles.bankInfoValue}>{bankInfo?.banco || 'BBVA'}</Text></Text>
                    <Text style={styles.bankInfoRow}>CLABE: <Text style={styles.bankInfoValue}>{bankInfo?.clabe || '012580001234567890'}</Text></Text>
                    <Text style={styles.bankInfoRow}>Beneficiario: <Text style={styles.bankInfoValue}>{bankInfo?.beneficiario || 'EntregaX SA de CV'}</Text></Text>
                    <Text style={styles.bankInfoRow}>Referencia: <Text style={styles.bankInfoValue}>{paymentReference}</Text></Text>
                  </View>
                </View>

                <View style={styles.instructionsSection}>
                  <Text style={styles.instructionsTitle}>🏪 Pago en Sucursal:</Text>
                  <Text style={styles.instructionsText}>
                    Visita nuestra sucursal en {branchInfo?.nombre || 'CEDIS Monterrey'} y menciona tu referencia de pago.
                  </Text>
                  <Text style={styles.addressText}>
                    📍 {branchInfo?.direccion || 'Av. Industrial #123, Monterrey, NL'}{'\n'}
                    📞 {branchInfo?.telefono || '81 1234 5678'}{'\n'}
                    🕐 {branchInfo?.horario || 'Lunes a Viernes: 9:00 - 18:00, Sábados: 9:00 - 14:00'}
                  </Text>
                </View>

                <View style={styles.noticeCard}>
                  <Text style={styles.noticeIcon}>⚠️</Text>
                  <Text style={styles.noticeText}>
                    Tu pedido se procesará una vez confirmado el pago. Tiempo de confirmación: 1-24 hrs.
                  </Text>
                </View>
              </ScrollView>

              <Button
                mode="contained"
                onPress={() => {
                  setShowCashInstructions(false);
                  navigation.navigate('Home', { user, token });
                }}
                style={styles.cashDoneButton}
                buttonColor={GREEN}
              >
                Entendido
              </Button>
            </View>
          </View>
        </Modal>
      )}

      {/* Contenido Principal */}
      {!approvalUrl && !showCashInstructions && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <IconButton
              icon="arrow-left"
              size={24}
              onPress={() => navigation.goBack()}
            />
            <Text style={styles.headerTitle}>Pagar Paquetes</Text>
            <View style={{ width: 48 }} />
          </View>

          {/* Card de Resumen de Paquetes */}
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>📦 Paquetes a Pagar</Text>
                <Chip mode="flat" style={styles.countChip}>
                  {packages.length} paquete(s)
                </Chip>
              </View>

              <Divider style={styles.divider} />

              {/* Lista de paquetes */}
              {packages.map((pkg) => (
                <Surface key={pkg.id} style={styles.packageItem}>
                  <View style={styles.packageRow}>
                    <View style={styles.packageInfo}>
                      <Text style={styles.trackingNumber}>{pkg.tracking_internal || pkg.tracking_provider}</Text>
                      <Text style={styles.packageDesc}>
                        {pkg.description || 'Sin descripción'} • {pkg.weight || 0} lb
                      </Text>
                    </View>
                    <View style={styles.packageCost}>
                      <Text style={styles.costValue}>
                        ${parseFloat(String(pkg.assigned_cost_mxn || 0)).toFixed(2)}
                      </Text>
                      <Text style={styles.costLabel}>MXN</Text>
                    </View>
                  </View>
                </Surface>
              ))}

              <Divider style={styles.divider} />

              {/* Total */}
              <View style={styles.totalRow}>
                <Text style={styles.grandTotalLabel}>TOTAL:</Text>
                <Text style={styles.grandTotalValue}>${totalMXN.toFixed(2)} MXN</Text>
              </View>
            </Card.Content>
          </Card>

          {/* Destino */}
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>📍 Información de Envío</Text>
              <Divider style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Próximo Destino:</Text>
                <Text style={styles.infoValue}>CEDIS Monterrey</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>País:</Text>
                <Text style={styles.infoValue}>México</Text>
              </View>
            </Card.Content>
          </Card>

          {/* ============ PASARELA DE PAGO ============ */}
          <Card style={styles.paymentCard}>
            <Card.Content>
              <Text style={styles.paymentTitle}>💳 Selecciona tu método de pago</Text>
              <Divider style={styles.divider} />

              <RadioButton.Group
                onValueChange={(value) => setSelectedPaymentType(value as PaymentType)}
                value={selectedPaymentType}
              >
                {/* Opción: Tarjeta */}
                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    selectedPaymentType === 'card' && styles.paymentOptionSelected,
                  ]}
                  onPress={() => setSelectedPaymentType('card')}
                >
                  <View style={styles.paymentOptionRadio}>
                    <RadioButton value="card" color={OPENPAY_RED} />
                  </View>
                  <View style={[styles.paymentOptionIcon, { backgroundColor: OPENPAY_RED + '20' }]}>
                    <Text style={styles.paymentEmoji}>💳</Text>
                  </View>
                  <View style={styles.paymentOptionInfo}>
                    <Text style={styles.paymentOptionLabel}>Tarjeta de Crédito/Débito</Text>
                    <Text style={styles.paymentOptionSublabel}>Visa, Mastercard, AMEX</Text>
                  </View>
                </TouchableOpacity>

                {/* Opción: PayPal */}
                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    selectedPaymentType === 'paypal' && styles.paymentOptionSelected,
                  ]}
                  onPress={() => setSelectedPaymentType('paypal')}
                >
                  <View style={styles.paymentOptionRadio}>
                    <RadioButton value="paypal" color={PAYPAL_BLUE} />
                  </View>
                  <View style={[styles.paymentOptionIcon, { backgroundColor: PAYPAL_BLUE + '20' }]}>
                    <Text style={styles.paymentEmoji}>🅿️</Text>
                  </View>
                  <View style={styles.paymentOptionInfo}>
                    <Text style={styles.paymentOptionLabel}>PayPal</Text>
                    <Text style={styles.paymentOptionSublabel}>Pago rápido y seguro</Text>
                  </View>
                </TouchableOpacity>

                {/* Opción: Efectivo/Transferencia */}
                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    selectedPaymentType === 'cash' && styles.paymentOptionSelected,
                  ]}
                  onPress={() => setSelectedPaymentType('cash')}
                >
                  <View style={styles.paymentOptionRadio}>
                    <RadioButton value="cash" color={CASH_YELLOW} />
                  </View>
                  <View style={[styles.paymentOptionIcon, { backgroundColor: CASH_YELLOW + '20' }]}>
                    <Text style={styles.paymentEmoji}>💵</Text>
                  </View>
                  <View style={styles.paymentOptionInfo}>
                    <Text style={styles.paymentOptionLabel}>Pago en Sucursal</Text>
                    <Text style={styles.paymentOptionSublabel}>Efectivo o transferencia SPEI</Text>
                  </View>
                </TouchableOpacity>
              </RadioButton.Group>
            </Card.Content>
          </Card>

          {/* Botón de Pago */}
          <View style={styles.paymentSection}>
            {verifying ? (
              <View style={styles.verifyingContainer}>
                <ActivityIndicator size="large" color={GREEN} />
                <Text style={styles.verifyingText}>Verificando pago...</Text>
              </View>
            ) : (
              <Button
                mode="contained"
                onPress={handlePayment}
                loading={loading}
                disabled={loading}
                style={[
                  styles.payButton,
                  selectedPaymentType === 'card' && { backgroundColor: OPENPAY_RED },
                  selectedPaymentType === 'paypal' && { backgroundColor: PAYPAL_BLUE },
                  selectedPaymentType === 'cash' && { backgroundColor: CASH_YELLOW },
                ]}
                labelStyle={styles.payButtonLabel}
                icon={selectedPaymentType === 'cash' ? 'file-document' : 'credit-card'}
              >
                {loading 
                  ? 'Procesando...' 
                  : selectedPaymentType === 'cash'
                    ? 'Generar Orden de Pago'
                    : `Pagar $${totalMXN.toFixed(2)} MXN`
                }
              </Button>
            )}

            <Text style={styles.securityNote}>
              🔒 Todos los pagos son procesados de forma segura
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: 'white',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  countChip: {
    backgroundColor: ORANGE + '20',
  },
  divider: {
    marginVertical: 12,
  },
  packageItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
  },
  packageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  packageInfo: {
    flex: 1,
  },
  trackingNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111',
    fontFamily: 'monospace',
  },
  packageDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  packageCost: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  costValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: GREEN,
  },
  costLabel: {
    fontSize: 10,
    color: '#999',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: ORANGE,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
    width: 110,
  },
  infoValue: {
    fontSize: 13,
    color: '#111',
    flex: 1,
    fontWeight: '500',
  },
  // ============ PASARELA DE PAGO ============
  paymentCard: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 3,
    backgroundColor: 'white',
  },
  paymentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  paymentOptionSelected: {
    borderColor: ORANGE,
    backgroundColor: ORANGE + '08',
  },
  paymentOptionRadio: {
    marginRight: 4,
  },
  paymentOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  paymentEmoji: {
    fontSize: 24,
  },
  paymentOptionInfo: {
    flex: 1,
  },
  paymentOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  paymentOptionSublabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  paymentSection: {
    marginTop: 8,
    marginBottom: 32,
  },
  payButton: {
    paddingVertical: 8,
    borderRadius: 12,
  },
  payButtonLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  securityNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 12,
  },
  verifyingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  verifyingText: {
    fontSize: 16,
    color: GREEN,
    marginTop: 12,
  },
  // ============ WEBVIEW ============
  webViewContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  webViewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#333',
  },
  // ============ MODAL EFECTIVO ============
  cashModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  cashModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  cashModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  cashModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  cashModalBody: {
    padding: 20,
  },
  referenceCard: {
    backgroundColor: ORANGE + '15',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  referenceLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  referenceBox: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    width: '100%',
  },
  referenceNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: ORANGE,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  copyHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  amountCard: {
    backgroundColor: GREEN + '15',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 14,
    color: '#666',
  },
  amountValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: GREEN,
  },
  instructionsSection: {
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  bankInfo: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  bankInfoRow: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  bankInfoValue: {
    fontWeight: '600',
    color: '#111',
  },
  addressText: {
    fontSize: 13,
    color: '#555',
    marginTop: 8,
    lineHeight: 20,
  },
  noticeCard: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  noticeIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
  },
  cashDoneButton: {
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
  },
});
