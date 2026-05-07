/**
 * PaymentSummaryScreen.tsx
 * 
 * Pantalla de resumen de pago para paquetes PO Box USA en status "Procesando"
 * Pasarela de pago general con múltiples opciones:
 * - Tarjeta de crédito/débito (OpenPay)
 * - PayPal
 * - Pago en efectivo en sucursal
 */
import { getPackageCostBreakdown } from '../utils/packageCosts';
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
  TextInput,
  FlatList,
  Switch,
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
  const { packages: rawPackages, user, token } = route.params;
  
  // 🔧 FIX: Filtrar paquetes que ya están pagados (saldo_pendiente <= 0)
  const packages = rawPackages.filter(p => {
    const saldo = parseFloat(String((p as any).saldo_pendiente || p.assigned_cost_mxn || 0));
    return saldo > 0;
  });
  
  const [loading, setLoading] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType>('card');
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showCashInstructions, setShowCashInstructions] = useState(false);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  
  // 🧾 Estados para facturación
  const [requireInvoice, setRequireInvoice] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [fiscalDataLoaded, setFiscalDataLoaded] = useState(false);
  const [hasSavedFiscalData, setHasSavedFiscalData] = useState(false);
  const [fiscalForm, setFiscalForm] = useState({
    razon_social: '',
    rfc: '',
    codigo_postal: '',
    regimen_fiscal: '',
    uso_cfdi: 'G03'
  });
  const [regimenesFiscales, setRegimenesFiscales] = useState<Array<{ clave: string; descripcion: string }>>([]);
  const [usosCFDI, setUsosCFDI] = useState<Array<{ clave: string; descripcion: string }>>([]);
  const [showRegimenPicker, setShowRegimenPicker] = useState(false);
  const [showUsoCFDIPicker, setShowUsoCFDIPicker] = useState(false);
  
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

  const totalMXN = packages.reduce((sum, p) => {
    const pp = p as any;
    const breakdown = getPackageCostBreakdown(pp);
    const saldo = breakdown.totalMxn > 0
      ? breakdown.pendingMxn
      : parseFloat(String(pp.saldo_pendiente || p.assigned_cost_mxn || 0));
    return sum + saldo;
  }, 0);
  const totalWeight = packages.reduce((sum, p) => sum + parseFloat(String(p.weight || 0)), 0);

  // 🚨 Si todos los paquetes ya están pagados, regresar a Home
  useEffect(() => {
    if (packages.length === 0) {
      Alert.alert(
        'Paquetes Pagados', 
        'Todos los paquetes seleccionados ya fueron pagados.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  }, [packages.length]);

  // 📦 Multi-paquete: forzar pago en sucursal (único método permitido)
  useEffect(() => {
    if (packages.length > 1) {
      setSelectedPaymentType('cash');
      setRequireInvoice(false);
    }
  }, [packages.length]);

  // 🧾 Cargar datos fiscales y catálogos al montar
  useEffect(() => {
    loadFiscalData();
    loadCatalogos();
  }, []);

  const loadFiscalData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/fiscal/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.hasCompleteData) {
          setFiscalForm(data.fiscal);
          setHasSavedFiscalData(true);
        }
        setFiscalDataLoaded(true);
      }
    } catch (error) {
      console.error('Error loading fiscal data:', error);
    }
  };

  const loadCatalogos = async () => {
    try {
      const [regimenesRes, usosRes] = await Promise.all([
        fetch(`${API_URL}/api/fiscal/catalogos/regimenes`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/api/fiscal/catalogos/usos-cfdi`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (regimenesRes.ok) {
        const data = await regimenesRes.json();
        setRegimenesFiscales(data.regimenes || []);
      }

      if (usosRes.ok) {
        const data = await usosRes.json();
        setUsosCFDI(data.usos || []);
      }
    } catch (error) {
      console.error('Error loading catalogos:', error);
    }
  };

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
          // 🧾 Datos de facturación
          requireInvoice: requireInvoice,
          fiscalData: requireInvoice ? fiscalForm : null,
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
          // 🧾 Datos de facturación
          requireInvoice: requireInvoice,
          fiscalData: requireInvoice ? fiscalForm : null,
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
        // Si el error es por paquetes duplicados, ofrecer ir a órdenes de pago
        if (data.error === 'Paquetes ya en orden de pago') {
          Alert.alert(
            '📦 Paquetes ya en Orden de Pago',
            data.message || 'Algunos paquetes ya están en una orden de pago pendiente.',
            [
              { text: 'OK', style: 'cancel' },
              { text: 'Ver Orden de Pago', onPress: () => navigation.navigate('MyPayments' as any, { user, token, initialTab: 'orders' }) }
            ]
          );
        } else {
          Alert.alert('Error', data.error || 'No se pudo generar la orden de pago');
        }
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
    // Validar que si requiere factura, tenga datos fiscales completos
    if (requireInvoice && selectedPaymentType !== 'cash') {
      if (!fiscalForm.razon_social || !fiscalForm.rfc || !fiscalForm.codigo_postal || !fiscalForm.regimen_fiscal) {
        Alert.alert(
          'Datos Fiscales Incompletos',
          'Para generar factura, debes completar todos tus datos fiscales.',
          [
            { text: 'Completar Datos', onPress: () => setShowInvoiceForm(true) },
            { text: 'Continuar sin Factura', onPress: () => setRequireInvoice(false) }
          ]
        );
        return;
      }
    }

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

  // Guardar datos fiscales
  const saveFiscalData = async () => {
    if (!fiscalForm.razon_social || !fiscalForm.rfc || !fiscalForm.codigo_postal || !fiscalForm.regimen_fiscal) {
      Alert.alert('Error', 'Todos los campos marcados son obligatorios');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/fiscal/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(fiscalForm)
      });

      if (res.ok) {
        setHasSavedFiscalData(true);
        setShowInvoiceForm(false);
        Alert.alert('✅', 'Datos fiscales guardados correctamente');
      } else {
        const error = await res.json();
        Alert.alert('Error', error.message || 'No se pudieron guardar los datos');
      }
    } catch (error) {
      console.error('Error saving fiscal data:', error);
      Alert.alert('Error', 'No se pudo conectar con el servidor');
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
              // Configuraciones importantes para evitar crashes en iOS
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scalesPageToFit={true}
              mixedContentMode="compatibility"
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              // Evitar problemas con teclado en iOS
              keyboardDisplayRequiresUserAction={false}
              automaticallyAdjustContentInsets={false}
              contentInsetAdjustmentBehavior="never"
              bounces={false}
              scrollEnabled={true}
              // Permitir input de usuario
              allowsBackForwardNavigationGestures={false}
              // Manejo de errores
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.warn('WebView error:', nativeEvent);
              }}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.warn('WebView HTTP error:', nativeEvent.statusCode);
              }}
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
                  <Text style={styles.instructionsTitle}>💵 Depósito en efectivo:</Text>
                  <View style={styles.bankInfo}>
                    <Text style={styles.bankInfoRow}>Banco: <Text style={styles.bankInfoValue}>{bankInfo?.banco || 'BBVA'}</Text></Text>
                    <Text style={styles.bankInfoRow}>Cuenta: <Text style={styles.bankInfoValue}>{bankInfo?.cuenta || '1234567890'}</Text></Text>
                    <Text style={styles.bankInfoRow}>Beneficiario: <Text style={styles.bankInfoValue}>{bankInfo?.beneficiario || 'EntregaX SA de CV'}</Text></Text>
                    <Text style={styles.bankInfoRow}>Referencia: <Text style={styles.bankInfoValue}>{paymentReference}</Text></Text>
                  </View>
                </View>

                <View style={styles.noticeCard}>
                  <Text style={styles.noticeIcon}>⚠️</Text>
                  <Text style={styles.noticeText}>
                    Favor de realizar depósitos de no más de $90,000 pesos por depósito.
                  </Text>
                </View>

                <View style={styles.noticeCard}>
                  <Text style={styles.noticeIcon}>⏰</Text>
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

      {/* 🧾 Modal de Datos Fiscales */}
      <Modal visible={showInvoiceForm} animationType="slide" transparent>
        <View style={styles.fiscalModalOverlay}>
          <View style={styles.fiscalModalContent}>
            <View style={styles.fiscalModalHeader}>
              <Text style={styles.fiscalModalTitle}>🧾 Datos Fiscales</Text>
              <IconButton 
                icon="close" 
                size={24} 
                onPress={() => setShowInvoiceForm(false)} 
              />
            </View>

            <ScrollView style={styles.fiscalModalBody}>
              <Text style={styles.fiscalFormNote}>
                Estos datos se usarán para generar tu factura CFDI 4.0
              </Text>

              {/* Razón Social */}
              <View style={styles.fiscalInputGroup}>
                <Text style={styles.fiscalInputLabel}>Razón Social *</Text>
                <TextInput
                  style={styles.fiscalInput}
                  value={fiscalForm.razon_social}
                  onChangeText={(text) => setFiscalForm({ ...fiscalForm, razon_social: text })}
                  placeholder="Nombre o Razón Social (sin SA de CV)"
                  autoCapitalize="characters"
                />
              </View>

              {/* RFC */}
              <View style={styles.fiscalInputGroup}>
                <Text style={styles.fiscalInputLabel}>RFC *</Text>
                <TextInput
                  style={styles.fiscalInput}
                  value={fiscalForm.rfc}
                  onChangeText={(text) => setFiscalForm({ ...fiscalForm, rfc: text.toUpperCase() })}
                  placeholder="RFC con homoclave"
                  autoCapitalize="characters"
                  maxLength={13}
                />
              </View>

              {/* Código Postal Fiscal */}
              <View style={styles.fiscalInputGroup}>
                <Text style={styles.fiscalInputLabel}>Código Postal Fiscal *</Text>
                <TextInput
                  style={styles.fiscalInput}
                  value={fiscalForm.codigo_postal}
                  onChangeText={(text) => setFiscalForm({ ...fiscalForm, codigo_postal: text })}
                  placeholder="5 dígitos"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>

              {/* Régimen Fiscal */}
              <View style={styles.fiscalInputGroup}>
                <Text style={styles.fiscalInputLabel}>Régimen Fiscal *</Text>
                <TouchableOpacity 
                  style={styles.fiscalPicker}
                  onPress={() => setShowRegimenPicker(true)}
                >
                  <Text style={fiscalForm.regimen_fiscal ? styles.fiscalPickerText : styles.fiscalPickerPlaceholder}>
                    {fiscalForm.regimen_fiscal 
                      ? regimenesFiscales.find(r => r.clave === fiscalForm.regimen_fiscal)?.descripcion || fiscalForm.regimen_fiscal
                      : 'Selecciona régimen fiscal'}
                  </Text>
                  <Text>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Uso CFDI */}
              <View style={styles.fiscalInputGroup}>
                <Text style={styles.fiscalInputLabel}>Uso CFDI</Text>
                <TouchableOpacity 
                  style={styles.fiscalPicker}
                  onPress={() => setShowUsoCFDIPicker(true)}
                >
                  <Text style={styles.fiscalPickerText}>
                    {usosCFDI.find(u => u.clave === fiscalForm.uso_cfdi)?.descripcion || 'G03 - Gastos en general'}
                  </Text>
                  <Text>▼</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.fiscalNotice}>
                <Text style={styles.fiscalNoticeText}>
                  ⚠️ Asegúrate de que tus datos coincidan exactamente con tu Constancia de Situación Fiscal del SAT.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.fiscalModalButtons}>
              <Button
                mode="outlined"
                onPress={() => setShowInvoiceForm(false)}
                style={styles.fiscalCancelButton}
              >
                Cancelar
              </Button>
              <Button
                mode="contained"
                onPress={saveFiscalData}
                style={styles.fiscalSaveButton}
                buttonColor={GREEN}
              >
                Guardar
              </Button>
            </View>

            {/* Modal Selector de Régimen Fiscal (anidado para mostrarse sobre iOS) */}
            <Modal visible={showRegimenPicker} animationType="slide" transparent presentationStyle="overFullScreen">
              <View style={styles.pickerModalOverlay}>
                <View style={styles.pickerModalContent}>
                  <View style={styles.pickerModalHeader}>
                    <Text style={styles.pickerModalTitle}>Selecciona Régimen Fiscal</Text>
                    <IconButton icon="close" size={24} onPress={() => setShowRegimenPicker(false)} />
                  </View>
                  <FlatList
                    data={regimenesFiscales}
                    keyExtractor={(item) => item.clave}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.pickerItem,
                          fiscalForm.regimen_fiscal === item.clave && styles.pickerItemSelected
                        ]}
                        onPress={() => {
                          setFiscalForm({ ...fiscalForm, regimen_fiscal: item.clave });
                          setShowRegimenPicker(false);
                        }}
                      >
                        <Text style={styles.pickerItemCode}>{item.clave}</Text>
                        <Text style={styles.pickerItemText}>{item.descripcion}</Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>
            </Modal>

            {/* Modal Selector de Uso CFDI (anidado para mostrarse sobre iOS) */}
            <Modal visible={showUsoCFDIPicker} animationType="slide" transparent presentationStyle="overFullScreen">
              <View style={styles.pickerModalOverlay}>
                <View style={styles.pickerModalContent}>
                  <View style={styles.pickerModalHeader}>
                    <Text style={styles.pickerModalTitle}>Selecciona Uso CFDI</Text>
                    <IconButton icon="close" size={24} onPress={() => setShowUsoCFDIPicker(false)} />
                  </View>
                  <FlatList
                    data={usosCFDI}
                    keyExtractor={(item) => item.clave}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.pickerItem,
                          fiscalForm.uso_cfdi === item.clave && styles.pickerItemSelected
                        ]}
                        onPress={() => {
                          setFiscalForm({ ...fiscalForm, uso_cfdi: item.clave });
                          setShowUsoCFDIPicker(false);
                        }}
                      >
                        <Text style={styles.pickerItemCode}>{item.clave}</Text>
                        <Text style={styles.pickerItemText}>{item.descripcion}</Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>
            </Modal>
          </View>
        </View>
      </Modal>

      {/* (Pickers movidos dentro del modal de Datos Fiscales para iOS) */}

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
                        ${(() => {
                          const pp = pkg as any;
                          const poboxUsd = parseFloat(pp.pobox_venta_usd) || 0;
                          const poboxServ = parseFloat(pp.pobox_service_cost) || 0;
                          const tc = parseFloat(pp.registered_exchange_rate) || 0;
                          const gex = parseFloat(pp.gex_total_cost) || 0;
                          const ship = parseFloat(pp.national_shipping_cost) || 0;
                          const pagado = parseFloat(pp.monto_pagado) || 0;
                          let poboxMxn = poboxServ > 0 ? poboxServ : (poboxUsd > 0 && tc > 0 ? poboxUsd * tc : 0);
                          if (pp.is_master && Array.isArray(pp.child_packages) && pp.child_packages.length > 0) {
                            const sumHijas = pp.child_packages.reduce((s: number, c: any) => {
                              const cServ = parseFloat(c.pobox_service_cost) || 0;
                              if (cServ > 0) return s + cServ;
                              const cUsd = parseFloat(c.pobox_venta_usd) || 0;
                              const cTc = parseFloat(c.registered_exchange_rate) || tc;
                              if (cUsd > 0 && cTc > 0) return s + cUsd * cTc;
                              return s + (parseFloat(c.assigned_cost_mxn) || 0);
                            }, 0);
                            if (sumHijas > 0) poboxMxn = sumHijas;
                          }
                          return poboxMxn > 0
                            ? Math.max(0, poboxMxn + gex + ship - pagado).toFixed(2)
                            : parseFloat(String(pp.saldo_pendiente || pkg.assigned_cost_mxn || 0)).toFixed(2);
                        })()}
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
              <Text style={styles.paymentTitle}>� Instrucciones de Pago</Text>
              <Divider style={styles.divider} />

              <RadioButton.Group
                onValueChange={(value) => setSelectedPaymentType(value as PaymentType)}
                value={selectedPaymentType}
              >
                {/* Tarjeta y PayPal solo disponibles para pago individual (1 guía) */}
                {packages.length <= 1 && (
                <>
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
                </>
                )}

                {/* Opción: Efectivo/Transferencia - Siempre disponible */}
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
                    <Text style={styles.paymentOptionSublabel}>Depósito en efectivo</Text>
                  </View>
                </TouchableOpacity>
              </RadioButton.Group>
            </Card.Content>
          </Card>

          {/* 🧾 OPCIÓN DE FACTURA (Solo para tarjeta y PayPal) */}
          {selectedPaymentType !== 'cash' && (
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.invoiceHeader}>
                  <View style={styles.invoiceTitleRow}>
                    <Text style={styles.invoiceIcon}>🧾</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.invoiceTitle}>¿Requiero Factura?</Text>
                      <Text style={styles.invoiceSubtitle}>
                        {requireInvoice 
                          ? 'Se generará CFDI 4.0 al confirmar el pago'
                          : 'No se podrá facturar después'}
                      </Text>
                    </View>
                    <Switch
                      value={requireInvoice}
                      onValueChange={(value) => {
                        setRequireInvoice(value);
                        if (value && !hasSavedFiscalData) {
                          setShowInvoiceForm(true);
                        }
                      }}
                      trackColor={{ false: '#ddd', true: GREEN + '80' }}
                      thumbColor={requireInvoice ? GREEN : '#f4f3f4'}
                    />
                  </View>
                </View>

                {requireInvoice && (
                  <>
                    <Divider style={styles.divider} />
                    
                    {/* Si tiene datos guardados, mostrarlos */}
                    {hasSavedFiscalData ? (
                      <View style={styles.savedFiscalData}>
                        <View style={styles.fiscalDataRow}>
                          <Text style={styles.fiscalDataLabel}>Razón Social:</Text>
                          <Text style={styles.fiscalDataValue}>{fiscalForm.razon_social}</Text>
                        </View>
                        <View style={styles.fiscalDataRow}>
                          <Text style={styles.fiscalDataLabel}>RFC:</Text>
                          <Text style={styles.fiscalDataValue}>{fiscalForm.rfc}</Text>
                        </View>
                        <View style={styles.fiscalDataRow}>
                          <Text style={styles.fiscalDataLabel}>C.P. Fiscal:</Text>
                          <Text style={styles.fiscalDataValue}>{fiscalForm.codigo_postal}</Text>
                        </View>
                        <TouchableOpacity 
                          onPress={() => setShowInvoiceForm(true)}
                          style={styles.editFiscalButton}
                        >
                          <Text style={styles.editFiscalText}>✏️ Editar datos fiscales</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity 
                        onPress={() => setShowInvoiceForm(true)}
                        style={styles.addFiscalButton}
                      >
                        <Text style={styles.addFiscalIcon}>➕</Text>
                        <Text style={styles.addFiscalText}>Agregar datos fiscales</Text>
                      </TouchableOpacity>
                    )}
                    
                    <View style={styles.invoiceNotice}>
                      <Text style={styles.invoiceNoticeText}>
                        ⚠️ Una vez realizado el pago, no podrás solicitar factura.
                      </Text>
                    </View>
                  </>
                )}
              </Card.Content>
            </Card>
          )}

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
  // ============ ESTILOS FACTURACIÓN ============
  invoiceHeader: {
    marginBottom: 8,
  },
  invoiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  invoiceIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
  },
  invoiceSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  savedFiscalData: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
  },
  fiscalDataRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  fiscalDataLabel: {
    fontSize: 13,
    color: '#666',
    width: 100,
  },
  fiscalDataValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    flex: 1,
  },
  editFiscalButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  editFiscalText: {
    fontSize: 14,
    color: ORANGE,
    fontWeight: '600',
  },
  addFiscalButton: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  addFiscalIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  addFiscalText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  invoiceNotice: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  invoiceNoticeText: {
    fontSize: 12,
    color: '#856404',
  },
  // Modal de datos fiscales
  fiscalModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  fiscalModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  fiscalModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  fiscalModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  fiscalModalBody: {
    padding: 16,
  },
  fiscalFormNote: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  fiscalInputGroup: {
    marginBottom: 16,
  },
  fiscalInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  fiscalInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  fiscalPicker: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fiscalPickerText: {
    fontSize: 14,
    color: '#111',
    flex: 1,
  },
  fiscalPickerPlaceholder: {
    fontSize: 14,
    color: '#999',
    flex: 1,
  },
  fiscalNotice: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  fiscalNoticeText: {
    fontSize: 12,
    color: '#1565C0',
  },
  fiscalModalButtons: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  fiscalCancelButton: {
    flex: 1,
    marginRight: 8,
    borderRadius: 8,
  },
  fiscalSaveButton: {
    flex: 1,
    marginLeft: 8,
    borderRadius: 8,
  },
  // Picker Modal
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
  },
  pickerItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerItemSelected: {
    backgroundColor: GREEN + '10',
  },
  pickerItemCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: ORANGE,
    width: 50,
    marginRight: 12,
  },
  pickerItemText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
});
