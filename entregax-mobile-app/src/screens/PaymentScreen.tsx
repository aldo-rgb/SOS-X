import React, { useState, useEffect } from 'react';
import { 
  View, 
  Modal, 
  StyleSheet, 
  Alert, 
  SafeAreaView,
  StatusBar,
  Switch,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { 
  Text, 
  Button, 
  Card, 
  ActivityIndicator,
  IconButton,
  Surface
} from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { API_URL } from '../services/api';

// Colores de marca
const ORANGE = '#F05A28';
const PAYPAL_BLUE = '#003087';
const PAYPAL_LIGHT_BLUE = '#009CDE';

// Costo por kg (debe coincidir con el backend)
const COST_PER_KG = 15.00;

type RootStackParamList = {
  Home: { user: any; token: string };
  Payment: { 
    consolidationId: number; 
    weight: number; 
    token: string;
    user: any;
  };
};

type PaymentScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Payment'>;
  route: RouteProp<RootStackParamList, 'Payment'>;
};

interface GexQuote {
  invoiceValueUsd: number;
  exchangeRate: number;
  insuredValueMxn: number;
  variableFeeMxn: number;
  fixedFeeMxn: number;
  totalCostMxn: number;
  advisorCommission: number;
}

export default function PaymentScreen({ route, navigation }: PaymentScreenProps) {
  const { consolidationId, weight, token, user } = route.params;
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  
  // Estado para Garantía Extendida GEX
  const [includeWarranty, setIncludeWarranty] = useState(false);
  const [invoiceValue, setInvoiceValue] = useState<number>(0);
  const [gexQuote, setGexQuote] = useState<GexQuote | null>(null);
  const [loadingGex, setLoadingGex] = useState(false);

  // Calcular el monto total
  const baseAmount = weight * COST_PER_KG;
  const warrantyAmountUsd = gexQuote ? gexQuote.totalCostMxn / gexQuote.exchangeRate : 0;
  const totalAmount = includeWarranty && gexQuote 
    ? (baseAmount + warrantyAmountUsd).toFixed(2) 
    : baseAmount.toFixed(2);

  // Obtener cotización GEX cuando cambia el valor de factura
  useEffect(() => {
    if (invoiceValue > 0) {
      fetchGexQuote();
    } else {
      setGexQuote(null);
    }
  }, [invoiceValue]);

  const fetchGexQuote = async () => {
    setLoadingGex(true);
    try {
      const res = await fetch(`${API_URL}/api/gex/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ invoiceValueUsd: invoiceValue })
      });
      
      if (res.ok) {
        const data = await res.json();
        setGexQuote(data);
      }
    } catch (error) {
      console.error('Error fetching GEX quote:', error);
    } finally {
      setLoadingGex(false);
    }
  };

  // 1. Iniciar Pago: Pedir link al Backend
  const startPayment = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/payments/create`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ consolidationId })
      });

      const data = await res.json();

      if (data.success && data.approvalUrl) {
        setPaypalOrderId(data.orderId);
        setApprovalUrl(data.approvalUrl); // Esto abre el WebView
      } else {
        Alert.alert('Error', data.error || 'No se pudo iniciar el pago');
      }
    } catch (error) {
      console.error('Error starting payment:', error);
      Alert.alert('Error', 'No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  // 2. Detectar cuando PayPal termina (navega a success/cancel)
  const handleWebViewNavigation = (navState: any) => {
    const { url } = navState;
    
    // El usuario completó el pago en PayPal
    if (url.includes('entregax.com/payment/success') || url.includes('success')) {
      setApprovalUrl(null); // Cerrar WebView
      verifyPayment(); // Verificar en backend
    }
    
    // El usuario canceló
    if (url.includes('entregax.com/payment/cancel') || url.includes('cancel')) {
      setApprovalUrl(null);
      Alert.alert('Cancelado', 'El pago fue cancelado');
    }
  };

  // 3. Confirmar pago final en el backend
  const verifyPayment = async () => {
    setVerifying(true);
    try {
      const res = await fetch(`${API_URL}/payments/capture`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          paypalOrderId, 
          consolidationId 
        })
      });

      const data = await res.json();

      if (data.success) {
        Alert.alert(
          '¡Pago Exitoso! 🎉', 
          `Tu paquete será liberado.\n\nTransacción: ${data.transactionId || 'N/A'}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', data.error || 'Hubo un problema verificando el pago');
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      Alert.alert('Error', 'No se pudo verificar el pago');
    } finally {
      setVerifying(false);
    }
  };

  // Cerrar WebView
  const closeWebView = () => {
    setApprovalUrl(null);
    Alert.alert('Cancelado', 'Has cerrado la ventana de pago');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />
      
      {/* WebView Modal para PayPal */}
      {approvalUrl ? (
        <Modal visible={true} animationType="slide" onRequestClose={closeWebView}>
          <SafeAreaView style={styles.webViewContainer}>
            {/* Header del WebView */}
            <View style={styles.webViewHeader}>
              <IconButton 
                icon="close" 
                size={24} 
                onPress={closeWebView}
              />
              <Text style={styles.webViewTitle}>Pago Seguro</Text>
              <View style={{ width: 48 }} />
            </View>
            
            {/* WebView de PayPal */}
            <WebView
              source={{ uri: approvalUrl }}
              onNavigationStateChange={handleWebViewNavigation}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={PAYPAL_BLUE} />
                  <Text style={styles.loadingText}>Cargando PayPal...</Text>
                </View>
              )}
              style={styles.webView}
            />
          </SafeAreaView>
        </Modal>
      ) : (
        /* Pantalla de Resumen de Pago */
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <IconButton 
              icon="arrow-left" 
              size={24} 
              onPress={() => navigation.goBack()}
            />
            <Text style={styles.headerTitle}>Pago de Flete</Text>
            <View style={{ width: 48 }} />
          </View>

          {/* Card de Resumen */}
          <Card style={styles.card}>
            <Card.Content>
              {/* Icono y Título */}
              <View style={styles.cardHeader}>
                <Surface style={styles.iconContainer}>
                  <Text style={styles.planeIcon}>✈️</Text>
                </Surface>
                <Text style={styles.cardTitle}>Resumen de Pago</Text>
                <Text style={styles.cardSubtitle}>Orden #{consolidationId}</Text>
              </View>

              {/* Monto Total */}
              <View style={styles.amountContainer}>
                <Text style={styles.amountLabel}>Total a Pagar</Text>
                <Text style={styles.amountValue}>${totalAmount} USD</Text>
              </View>

              {/* Desglose */}
              <View style={styles.breakdownContainer}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Peso del envío</Text>
                  <Text style={styles.breakdownValue}>{weight} kg</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Tarifa por kg</Text>
                  <Text style={styles.breakdownValue}>${COST_PER_KG.toFixed(2)} USD</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Subtotal flete</Text>
                  <Text style={styles.breakdownValue}>${baseAmount.toFixed(2)} USD</Text>
                </View>
                
                {/* Garantía Extendida si está activa */}
                {includeWarranty && gexQuote && (
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: ORANGE }]}>🛡️ Garantía GEX</Text>
                    <Text style={[styles.breakdownValue, { color: ORANGE }]}>+${warrantyAmountUsd.toFixed(2)} USD</Text>
                  </View>
                )}
                
                <View style={styles.divider} />
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, styles.totalLabel]}>Total</Text>
                  <Text style={[styles.breakdownValue, styles.totalValue]}>${totalAmount} USD</Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* Card de Garantía Extendida GEX */}
          <Card style={[styles.card, styles.warrantyCard]}>
            <Card.Content>
              <View style={styles.warrantyHeader}>
                <View style={styles.warrantyTitleRow}>
                  <Text style={styles.warrantyIcon}>🛡️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.warrantyTitle}>Garantía Extendida GEX</Text>
                    <Text style={styles.warrantySubtitle}>Protege tu envío contra daños y pérdidas</Text>
                  </View>
                  <Switch
                    value={includeWarranty}
                    onValueChange={(value) => {
                      if (value && invoiceValue <= 0) {
                        Alert.alert(
                          'Valor de Factura Requerido',
                          'Para agregar la garantía, necesitamos el valor de tu factura comercial.',
                          [{ text: 'OK' }]
                        );
                      }
                      setIncludeWarranty(value);
                    }}
                    trackColor={{ false: '#ddd', true: ORANGE + '80' }}
                    thumbColor={includeWarranty ? ORANGE : '#f4f3f4'}
                  />
                </View>
              </View>

              {/* Input de valor de factura */}
              <View style={styles.invoiceInputContainer}>
                <Text style={styles.invoiceInputLabel}>Valor de tu factura comercial (USD)</Text>
                <View style={styles.invoiceInputWrapper}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <View style={styles.invoiceInput}>
                    <Text 
                      style={styles.invoiceInputText}
                      onPress={() => {
                        Alert.prompt(
                          'Valor de Factura',
                          'Ingresa el valor de tu factura comercial en USD',
                          [
                            { text: 'Cancelar', style: 'cancel' },
                            { 
                              text: 'OK', 
                              onPress: (value) => {
                                const numValue = parseFloat(value || '0');
                                if (numValue > 0) {
                                  setInvoiceValue(numValue);
                                }
                              }
                            }
                          ],
                          'plain-text',
                          invoiceValue > 0 ? invoiceValue.toString() : '',
                          'numeric'
                        );
                      }}
                    >
                      {invoiceValue > 0 ? invoiceValue.toFixed(2) : 'Toca para ingresar'}
                    </Text>
                  </View>
                  <Text style={styles.currencyLabel}>USD</Text>
                </View>
              </View>

              {/* Cotización GEX */}
              {loadingGex ? (
                <View style={styles.gexLoadingContainer}>
                  <ActivityIndicator size="small" color={ORANGE} />
                  <Text style={styles.gexLoadingText}>Calculando cotización...</Text>
                </View>
              ) : gexQuote && invoiceValue > 0 ? (
                <View style={styles.gexQuoteContainer}>
                  <View style={styles.gexQuoteRow}>
                    <Text style={styles.gexQuoteLabel}>Valor asegurado</Text>
                    <Text style={styles.gexQuoteValue}>${gexQuote.insuredValueMxn.toFixed(2)} MXN</Text>
                  </View>
                  <View style={styles.gexQuoteRow}>
                    <Text style={styles.gexQuoteLabel}>Prima (5%)</Text>
                    <Text style={styles.gexQuoteValue}>${gexQuote.variableFeeMxn.toFixed(2)} MXN</Text>
                  </View>
                  <View style={styles.gexQuoteRow}>
                    <Text style={styles.gexQuoteLabel}>Costo póliza</Text>
                    <Text style={styles.gexQuoteValue}>${gexQuote.fixedFeeMxn.toFixed(2)} MXN</Text>
                  </View>
                  <View style={[styles.gexQuoteRow, styles.gexQuoteTotalRow]}>
                    <Text style={styles.gexQuoteTotalLabel}>Total Garantía</Text>
                    <Text style={styles.gexQuoteTotalValue}>${gexQuote.totalCostMxn.toFixed(2)} MXN</Text>
                  </View>
                  <Text style={styles.gexQuoteUsd}>
                    ≈ ${warrantyAmountUsd.toFixed(2)} USD (TC: ${gexQuote.exchangeRate.toFixed(2)})
                  </Text>
                </View>
              ) : (
                <View style={styles.gexInfoContainer}>
                  <Text style={styles.gexInfoText}>
                    💡 Ingresa el valor de tu factura para ver la cotización de la garantía
                  </Text>
                </View>
              )}

              {/* Beneficios */}
              <View style={styles.benefitsContainer}>
                <Text style={styles.benefitsTitle}>✅ Beneficios incluidos:</Text>
                <Text style={styles.benefitItem}>• Cobertura contra daños en tránsito</Text>
                <Text style={styles.benefitItem}>• Protección contra pérdida total</Text>
                <Text style={styles.benefitItem}>• Reembolso del valor declarado</Text>
              </View>
            </Card.Content>
          </Card>

          {/* Botón de Pago */}
          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={startPayment}
              loading={loading || verifying}
              disabled={loading || verifying}
              icon="credit-card-outline"
              contentStyle={styles.payButtonContent}
              labelStyle={styles.payButtonLabel}
              style={styles.payButton}
            >
              {loading ? 'Conectando...' : verifying ? 'Verificando...' : 'Pagar con PayPal'}
            </Button>

            {/* Logo de seguridad */}
            <View style={styles.securityRow}>
              <Text style={styles.securityText}>🔒 Pago seguro con PayPal</Text>
            </View>
          </View>
          
          {/* Espaciado inferior */}
          <View style={{ height: 40 }} />
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
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  card: {
    borderRadius: 16,
    elevation: 4,
    backgroundColor: '#fff',
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${ORANGE}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 0,
  },
  planeIcon: {
    fontSize: 32,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  amountContainer: {
    backgroundColor: `${ORANGE}10`,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  amountLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '800',
    color: ORANGE,
  },
  breakdownContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#666',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 8,
  },
  totalLabel: {
    fontWeight: '700',
    color: '#111',
  },
  totalValue: {
    fontWeight: '700',
    color: ORANGE,
    fontSize: 16,
  },
  buttonContainer: {
    marginTop: 32,
  },
  payButton: {
    borderRadius: 12,
    backgroundColor: PAYPAL_BLUE,
  },
  payButtonContent: {
    height: 56,
  },
  payButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  securityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  securityText: {
    fontSize: 12,
    color: '#888',
  },
  // Warranty/GEX styles
  warrantyCard: {
    marginTop: 16,
    borderWidth: 2,
    borderColor: ORANGE + '30',
    backgroundColor: '#FFFAF5',
  },
  warrantyHeader: {
    marginBottom: 16,
  },
  warrantyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warrantyIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  warrantyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  warrantySubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  invoiceInputContainer: {
    marginBottom: 16,
  },
  invoiceInputLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  invoiceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    height: 48,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginRight: 4,
  },
  invoiceInput: {
    flex: 1,
  },
  invoiceInputText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  currencyLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  gexLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  gexLoadingText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  gexQuoteContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  gexQuoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  gexQuoteLabel: {
    fontSize: 13,
    color: '#666',
  },
  gexQuoteValue: {
    fontSize: 13,
    color: '#333',
  },
  gexQuoteTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 8,
    paddingTop: 8,
  },
  gexQuoteTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ORANGE,
  },
  gexQuoteTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: ORANGE,
  },
  gexQuoteUsd: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
  },
  gexInfoContainer: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  gexInfoText: {
    fontSize: 13,
    color: '#0066cc',
    textAlign: 'center',
  },
  benefitsContainer: {
    marginTop: 8,
  },
  benefitsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  benefitItem: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  // WebView styles
  webViewContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
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
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
});
