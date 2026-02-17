import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Divider,
  Appbar,
  Checkbox,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { API_URL, Package } from '../services/api';

// 🎨 COLORES DE MARCA
const BRAND_ORANGE = '#F05A28';
const BRAND_DARK = '#111111';
const BRAND_GREEN = '#10B981';
const BACKGROUND = '#F4F6F8';

const { width } = Dimensions.get('window');

// Constantes de pricing
const EXCHANGE_RATE = 20.50;
const FIXED_FEE = 625;
const VARIABLE_RATE = 0.05; // 5%

type RootStackParamList = {
  Home: { user: any; token: string };
  GEXContract: { 
    package: Package; 
    user: any; 
    token: string;
  };
};

type GEXContractScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GEXContract'>;
  route: RouteProp<RootStackParamList, 'GEXContract'>;
};

type Step = 'form' | 'policies' | 'signature' | 'payment' | 'success';

export default function GEXContractScreen({ navigation, route }: GEXContractScreenProps) {
  const { package: pkg, user, token } = route.params;
  const signatureRef = useRef<SignatureViewRef>(null);
  
  // Determinar ruta basada en service_type o warehouse_location
  const getRoute = (): string => {
    if (pkg.service_type === 'POBOX_USA' || pkg.warehouse_location === 'usa_pobox') {
      return 'USA → México';
    }
    if (pkg.service_type === 'SEA_CHN_MX' || pkg.warehouse_location === 'china_sea') {
      return 'China → México (Marítimo)';
    }
    if (pkg.service_type === 'AIR_CHN_MX' || pkg.warehouse_location === 'china_air') {
      return 'China → México (Aéreo)';
    }
    if (pkg.service_type === 'NATIONAL' || pkg.warehouse_location === 'mx_national') {
      return 'Nacional México';
    }
    return 'China → México (Aéreo)';
  };

  // Estado del paso actual
  const [currentStep, setCurrentStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  
  // Datos del formulario (precargados)
  const [formData, setFormData] = useState({
    clientName: user.name || user.full_name || '',
    invoiceValue: pkg.declared_value ? String(pkg.declared_value) : '',
    boxCount: String(pkg.total_boxes || 1),
    route: getRoute(),
    weight: String(pkg.weight || 0),
    description: pkg.description || '',
  });
  
  // 💰 COTIZACIÓN EN TIEMPO REAL
  const estimatedCost = useMemo(() => {
    const valueUsd = parseFloat(formData.invoiceValue) || 0;
    const valueMxn = valueUsd * EXCHANGE_RATE;
    const variableFee = valueMxn * VARIABLE_RATE;
    const total = variableFee + FIXED_FEE;

    return {
      invoiceUSD: valueUsd,
      invoiceMXN: valueMxn,
      variable: variableFee,
      fixed: FIXED_FEE,
      total: total
    };
  }, [formData.invoiceValue]);
  
  // Políticas y firma
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  
  // Opción de pago
  const [paymentOption, setPaymentOption] = useState<'now' | 'withShipment'>('withShipment');
  
  // Detectar scroll al final de las políticas
  const handlePoliciesScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 50;
    if (isCloseToBottom && !hasScrolledToEnd) {
      setHasScrolledToEnd(true);
    }
  };
  
  // Validar formulario
  const isFormValid = useMemo(() => {
    return formData.invoiceValue && 
           parseFloat(formData.invoiceValue) > 0 && 
           formData.description.trim().length > 0;
  }, [formData.invoiceValue, formData.description]);
  
  // Avanzar al siguiente paso
  const nextStep = () => {
    if (currentStep === 'form') {
      if (!isFormValid) {
        Alert.alert('⚠️ Error', 'Completa el valor de factura y descripción');
        return;
      }
      setCurrentStep('policies');
    } else if (currentStep === 'policies') {
      if (!acceptedPolicies) {
        Alert.alert('⚠️ Error', 'Debes aceptar las políticas para continuar');
        return;
      }
      setCurrentStep('signature');
    } else if (currentStep === 'signature') {
      if (!signature) {
        Alert.alert('⚠️ Error', 'Debes firmar para continuar');
        return;
      }
      setCurrentStep('payment');
    }
  };
  
  // Retroceder
  const prevStep = () => {
    const steps: Step[] = ['form', 'policies', 'signature', 'payment'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    } else {
      navigation.goBack();
    }
  };
  
  // Manejar firma
  const handleSignature = (sig: string) => {
    setSignature(sig);
  };
  
  const handleClearSignature = () => {
    signatureRef.current?.clearSignature();
    setSignature(null);
  };
  
  // Enviar contratación
  const handleSubmit = async () => {
    setLoading(true);
    try {
      console.log('📤 Enviando solicitud de póliza GEX...');
      console.log('URL:', `${API_URL}/api/gex/warranties/self`);
      console.log('Datos:', {
        packageId: pkg.id,
        serviceType: pkg.service_type,
        invoiceValueUSD: estimatedCost.invoiceUSD,
        boxCount: parseInt(formData.boxCount),
        route: formData.route,
        weight: parseFloat(formData.weight),
        description: formData.description,
        signatureLength: signature?.length || 0,
        paymentOption: paymentOption,
      });

      const response = await fetch(`${API_URL}/api/gex/warranties/self`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageId: pkg.id,
          serviceType: pkg.service_type,
          invoiceValueUSD: estimatedCost.invoiceUSD,
          boxCount: parseInt(formData.boxCount),
          route: formData.route,
          weight: parseFloat(formData.weight),
          description: formData.description,
          signature: signature,
          paymentOption: paymentOption,
        }),
      });
      
      const responseData = await response.json();
      console.log('📥 Respuesta:', response.status, responseData);
      
      if (!response.ok) {
        throw new Error(responseData.details || responseData.error || 'Error al contratar GEX');
      }
      
      setCurrentStep('success');
    } catch (error: any) {
      console.error('❌ Error al crear póliza:', error);
      Alert.alert('❌ Error', error.message || 'Error desconocido al generar póliza');
    } finally {
      setLoading(false);
    }
  };
  
  // Progress indicator
  const getStepNumber = (): number => {
    const steps: Step[] = ['form', 'policies', 'signature', 'payment', 'success'];
    return steps.indexOf(currentStep) + 1;
  };

  // ========== RENDER PASO 1: FORMULARIO CON COTIZACIÓN ==========
  const renderFormStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      {/* TÍTULO DE SECCIÓN CON ICONO */}
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="shield-check" size={28} color={BRAND_ORANGE} />
        <Text style={styles.sectionTitle}>Datos del Seguro</Text>
      </View>
      <Text style={styles.sectionSubtitle}>
        Completa la información para proteger tu carga.
      </Text>

      {/* FORMULARIO EN TARJETA */}
      <Card style={styles.formCard} mode="elevated">
        <Card.Content style={styles.formContent}>
          
          {/* Nombre del cliente */}
          <TextInput
            label="Nombre del Cliente"
            value={formData.clientName}
            mode="outlined"
            style={styles.input}
            editable={false}
            activeOutlineColor={BRAND_ORANGE}
            outlineColor="#ddd"
            left={<TextInput.Icon icon="account" color="#888" />}
          />

          {/* 💰 VALOR DE FACTURA - EL MÁS IMPORTANTE */}
          <View style={styles.moneyInputContainer}>
            <TextInput
              label="Valor de Factura (USD)"
              value={formData.invoiceValue}
              onChangeText={(text) => setFormData({...formData, invoiceValue: text})}
              keyboardType="decimal-pad"
              mode="outlined"
              style={styles.input}
              activeOutlineColor={BRAND_ORANGE}
              outlineColor="#ddd"
              left={<TextInput.Icon icon="currency-usd" color={BRAND_ORANGE} />}
              right={<TextInput.Affix text="USD" textStyle={{fontWeight: 'bold', color: BRAND_ORANGE}}/>}
            />
            <View style={styles.invoiceWarning}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#F59E0B" />
              <Text style={styles.invoiceWarningText}>
                En caso de siniestro, se te solicitará la factura original del embarque para procesar tu reclamación.
              </Text>
            </View>
          </View>

          {/* Fila: Cajas + Peso */}
          <View style={styles.row}>
            <TextInput
              label="No. Cajas"
              value={formData.boxCount}
              onChangeText={(text) => setFormData({...formData, boxCount: text})}
              keyboardType="number-pad"
              mode="outlined"
              style={[styles.input, styles.halfInput]}
              activeOutlineColor={BRAND_ORANGE}
              outlineColor="#ddd"
              left={<TextInput.Icon icon="package-variant-closed" color="#888" />}
            />
            <TextInput
              label="Peso Total"
              value={formData.weight}
              onChangeText={(text) => setFormData({...formData, weight: text})}
              keyboardType="decimal-pad"
              mode="outlined"
              style={[styles.input, styles.halfInput]}
              activeOutlineColor={BRAND_ORANGE}
              outlineColor="#ddd"
              left={<TextInput.Icon icon="weight-kilogram" color="#888" />}
              right={<TextInput.Affix text="kg" />}
            />
          </View>

          {/* Ruta (solo lectura) */}
          <TextInput
            label="Ruta de Envío"
            value={formData.route}
            mode="outlined"
            style={styles.input}
            editable={false}
            activeOutlineColor={BRAND_ORANGE}
            outlineColor="#ddd"
            left={<TextInput.Icon icon="map-marker-path" color="#888" />}
            right={<TextInput.Icon icon="lock" color="#ccc" />}
          />

          {/* Descripción */}
          <TextInput
            label="Descripción de la Carga"
            value={formData.description}
            onChangeText={(text) => setFormData({...formData, description: text})}
            mode="outlined"
            multiline
            numberOfLines={2}
            style={[styles.input, { minHeight: 70 }]}
            activeOutlineColor={BRAND_ORANGE}
            outlineColor="#ddd"
            left={<TextInput.Icon icon="text-box-outline" color="#888" />}
          />
        </Card.Content>
      </Card>

      {/* 💎 TARJETA DE COTIZACIÓN EN VIVO */}
      <Card style={styles.quoteCard}>
        <Card.Content>
          <View style={styles.quoteHeader}>
            <MaterialCommunityIcons name="calculator" size={24} color="white" />
            <Text style={styles.quoteTitle}>Costo de tu Póliza GEX</Text>
          </View>
          
          <Divider style={styles.quoteDivider} />

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Valor Factura:</Text>
            <Text style={styles.quoteValue}>${estimatedCost.invoiceUSD.toFixed(2)} USD</Text>
          </View>
          
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Tipo de Cambio:</Text>
            <Text style={styles.quoteValue}>${EXCHANGE_RATE.toFixed(2)} MXN</Text>
          </View>
          
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Valor Asegurado:</Text>
            <Text style={styles.quoteValue}>${estimatedCost.invoiceMXN.toFixed(2)} MXN</Text>
          </View>

          <Divider style={styles.quoteDivider} />

          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>5% Valor Asegurado:</Text>
            <Text style={styles.quoteValue}>${estimatedCost.variable.toFixed(2)} MXN</Text>
          </View>
          
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Cargo Fijo GEX:</Text>
            <Text style={styles.quoteValue}>${estimatedCost.fixed.toFixed(2)} MXN</Text>
          </View>

          <Divider style={styles.quoteDivider} />

          <View style={styles.quoteTotalRow}>
            <Text style={styles.quoteTotalLabel}>TOTAL A PAGAR:</Text>
            <Text style={styles.quoteTotalValue}>${estimatedCost.total.toFixed(2)} MXN</Text>
          </View>

          <Text style={styles.quoteNote}>
            *Cálculo basado en el tipo de cambio del día.
          </Text>
        </Card.Content>
      </Card>

      {/* BOTÓN CONTINUAR */}
      <Button 
        mode="contained" 
        onPress={nextStep}
        style={styles.continueButton}
        contentStyle={{ height: 55 }}
        buttonColor={BRAND_DARK}
        icon="arrow-right"
        disabled={!isFormValid}
      >
        CONTINUAR
      </Button>

      <View style={{ height: 30 }} />
    </ScrollView>
  );

  // ========== RENDER PASO 2: POLÍTICAS ==========
  const renderPoliciesStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="file-document-outline" size={28} color={BRAND_ORANGE} />
        <Text style={styles.sectionTitle}>Políticas de Garantía</Text>
      </View>
      <Text style={styles.sectionSubtitle}>
        Lee y acepta las condiciones del servicio.
      </Text>

      <Card style={styles.formCard} mode="elevated">
        <Card.Content>
          <ScrollView 
            style={styles.policiesScroll} 
            nestedScrollEnabled
            onScroll={handlePoliciesScroll}
            scrollEventThrottle={16}
          >
            <Text style={styles.policyTitle}>POLÍTICA DE GARANTÍA DE TIEMPO DE ENTREGA DE MERCANCÍA EN 90 DÍAS NATURALES</Text>
            
            <Text style={styles.policyText}>
              En Logisti-k Systems Development S.A. de C.V. (en adelante "Grupo LSD") nos preocupamos por que nuestros clientes reciban sus cargas en tiempo, forma y en sus mejores condiciones, es por esto por lo que contamos una forma de garantizar el tiempo de entrega de 90 (noventa) días naturales en el traslado de las mercancías (en adelante la "Garantía"). Lo anterior, en el entendido que dicha garantía estará en todo momento sujeto a lo establecido en la presente política.
            </Text>

            <Text style={styles.policySection}>PRIMERA PARTE: DEFINICIONES</Text>
            <Text style={styles.policyText}>
              Para la interpretación de la presente política de garantía de traslado de mercancías, se deberá entender lo definido a continuación:{'\n\n'}
              <Text style={styles.policyBold}>• Accidente:</Text> acontecimiento fortuito, súbito e imprevisto.{'\n\n'}
              <Text style={styles.policyBold}>• Cliente:</Text> es la persona física y/o moral que ha solicitado a Grupo LSD llevar a cabo los servicios de traslado de mercancía(s) y ha optado voluntariamente contratar con la empresa Grupo LSD la garantía de tiempo de entrega de 90 (noventa) días naturales.{'\n\n'}
              <Text style={styles.policyBold}>• Deducible:</Text> es la cantidad o porcentaje que se establece en esta Política como participación del Cliente para que pueda ser sujeto de una Indemnización por parte de Grupo LSD.{'\n\n'}
              <Text style={styles.policyBold}>• Mercancía(s):</Text> se entiende como las mercancías y/o bienes contenidos en un solo vehículo o un mismo medio de transporte.{'\n\n'}
              <Text style={styles.policyBold}>• Evento:</Text> es la ocurrencia del riesgo protegido por la Garantía, durante el traslado de las mercancías. Se entenderá por un solo Evento, el hecho o serie de hechos ocurridos a consecuencia de retraso de más de 90 (noventa) días naturales.{'\n\n'}
              <Text style={styles.policyBold}>• Siniestro:</Text> retraso en el traslado de las mercancías por más de 90 (noventa) días naturales desde su envío siempre y cuando dicho retraso no se encuentre dentro de las excepciones de la Garantía.{'\n\n'}
              <Text style={styles.policyBold}>• Valor de la(s) Mercancía(s):</Text> es la cantidad máxima establecida en las facturas y/o cualquier otra documentación en poder del Cliente para acreditar su propiedad.
            </Text>

            <Text style={styles.policySection}>SEGUNDA PARTE: CONDICIONES APLICABLES</Text>
            <Text style={styles.policyText}>
              1.- Esta Garantía ampara, sin exceder del valor de la(s) mercancía(s), la entrega de las mercancías en un periodo no mayor a 90 (noventa) días naturales a consecuencia de los riesgos descritos en la presente política, siempre que éstos sean súbitos e imprevistos, que no se encuentren excluidos, que ocurran entre el origen y el destino especificado y durante el curso normal del traslado.{'\n\n'}
              Esta Política se ha creado con la finalidad de cubrir daños que ocurran y sean reclamados dentro del territorio nacional y conforme a los tribunales y la legislación de los Estados Unidos Mexicanos.{'\n\n'}
              <Text style={styles.policyBold}>COSTO:</Text> MXN $625.00 + el 5% del valor de la(s) mercancía(s) a garantizar.{'\n\n'}
              <Text style={styles.policyBold}>Ejemplo ilustrativo:</Text>{'\n'}
              Envío: 100kg / 1 CBM{'\n'}
              Valor: MXN $100,000 pesos{'\n'}
              Costo de garantía: MXN $5,625.00 pesos{'\n\n'}
              <Text style={styles.policyBold}>Requisitos para cotización:</Text>{'\n'}
              • Dimensiones - Alto x Ancho x Largo{'\n'}
              • Peso{'\n'}
              • Valor de la(s) Mercancía(s) Declaradas{'\n\n'}
              <Text style={styles.policyBold}>Nota:</Text> La mercancía se garantiza individualmente, puede garantizar solo la mercancía de alto riesgo.{'\n\n'}
              En caso de que sea procedente el Siniestro, el reembolso será por un total del valor de las mercancías, adicional a pagar un 5% extra de Deducible.{'\n\n'}
              2.- El único momento en el cual el Cliente podrá contratar la garantía es ANTES de realizar el tránsito y traslado de sus mercancías por Grupo LSD.{'\n\n'}
              3.- En caso de Evento amparado, el Cliente deberá enviar a Grupo LSD una relación detallada y exacta de las mercancías no entregadas en plazo y el importe de las mismas.{'\n\n'}
              El pago del Siniestro procedente se efectúa por transferencia o depósito a cuenta proporcionada por el Cliente en un lapso no mayor a 15 días hábiles después de tramitada la reclamación.
            </Text>

            <Text style={styles.policySection}>TERCERA PARTE: EXCLUSIONES</Text>
            <Text style={styles.policyText}>
              En ningún caso esta Póliza ampara las mercancías contra pérdidas, daños o gastos causados por:{'\n\n'}
              • Retrasos derivados de procedimientos administrativos en materia aduanera.{'\n\n'}
              • Violación por el Cliente a cualquier ley, disposición o reglamento expedidos por cualquier autoridad.{'\n\n'}
              • Apropiación en derecho de la mercancía por personas facultadas a tener su posesión.{'\n\n'}
              • Robo, fraude, dolo, mala fe, culpa grave, abuso de confianza cometido por el Cliente, sus funcionarios, empleados, socios o dependientes.{'\n\n'}
              • Naturaleza perecedera inherente a las mercancías, vicio propio, combustión espontánea, merma natural, evaporación, pérdida natural de peso o volumen.{'\n\n'}
              • Empleo de vehículos no aptos para el transporte o que resulten obsoletos, con fallas o defectos latentes.{'\n\n'}
              • Extravío, robo o faltantes detectados DESPUÉS de la entrega de la mercancía.{'\n\n'}
              • Faltantes descubiertos al efectuar inventarios.{'\n\n'}
              • Falta de identificación de la mercancía que impida su diferenciación y recuperación.{'\n\n'}
              • Falta de marcas o simbología internacional en el envase, empaque o embalaje.{'\n\n'}
              • Exceso de peso y/o dimensiones máximas de carga autorizadas.{'\n\n'}
              • Huelguistas, paros, disturbios de carácter obrero, motines o alborotos populares.{'\n\n'}
              • Vicios ocultos de la mercancía.{'\n\n'}
              • Expropiación, requisición, confiscación, incautación, nacionalización por acto de autoridad.{'\n\n'}
              • Hostilidades, actividades u operaciones bélicas, invasión, guerra civil, revolución, rebelión, motín, sedición, sabotaje, disturbios políticos.{'\n\n'}
              • Detonaciones con uso de dispositivos o armas de guerra que empleen fisión o fusión atómica, nuclear, radioactiva o armas biológicas.{'\n\n'}
              • Saqueos o robos durante o después de fenómenos meteorológicos, sísmicos o eventos catastróficos.{'\n\n'}
              • Dolo o mala fe del Cliente, sus beneficiarios o apoderados.
            </Text>

            <Text style={styles.policySection}>NOTA IMPORTANTE</Text>
            <Text style={styles.policyText}>
              En caso de siniestro a un porcentaje específico de la mercancía, se aplicará esta Política en proporción de lo siniestrado.{'\n\n'}
              La garantía NO aplica para faltantes de inventario y/o problemas consecuentes con el mal empaque de la misma.
            </Text>
          </ScrollView>

          {/* Indicador de scroll */}
          {!hasScrolledToEnd && (
            <View style={styles.scrollHint}>
              <MaterialCommunityIcons name="arrow-down-circle" size={20} color={BRAND_ORANGE} />
              <Text style={styles.scrollHintText}>Desplázate hacia abajo para leer todo el documento</Text>
            </View>
          )}

          {/* Checkbox de aceptación */}
          <TouchableOpacity 
            style={[styles.acceptRow, !hasScrolledToEnd && styles.acceptRowDisabled]}
            onPress={() => hasScrolledToEnd && setAcceptedPolicies(!acceptedPolicies)}
            activeOpacity={hasScrolledToEnd ? 0.7 : 1}
            disabled={!hasScrolledToEnd}
          >
            <Checkbox
              status={acceptedPolicies ? 'checked' : 'unchecked'}
              color={hasScrolledToEnd ? BRAND_GREEN : '#ccc'}
              disabled={!hasScrolledToEnd}
              onPress={() => hasScrolledToEnd && setAcceptedPolicies(!acceptedPolicies)}
            />
            <Text style={[styles.acceptText, !hasScrolledToEnd && styles.acceptTextDisabled]}>
              He leído y acepto los términos y condiciones de la Garantía Extendida de Tiempo de Entrega en 90 días naturales
            </Text>
          </TouchableOpacity>
        </Card.Content>
      </Card>

      {/* Resumen de costo */}
      <Card style={styles.miniQuoteCard}>
        <Card.Content style={styles.miniQuoteContent}>
          <Text style={styles.miniQuoteLabel}>Total GEX:</Text>
          <Text style={styles.miniQuoteValue}>${estimatedCost.total.toFixed(2)} MXN</Text>
        </Card.Content>
      </Card>

      <View style={styles.buttonRow}>
        <Button 
          mode="outlined" 
          onPress={prevStep}
          style={styles.backButton}
          textColor={BRAND_DARK}
        >
          ← ATRÁS
        </Button>
        <Button 
          mode="contained" 
          onPress={nextStep}
          style={styles.nextButtonHalf}
          buttonColor={BRAND_GREEN}
          disabled={!acceptedPolicies}
        >
          FIRMAR →
        </Button>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );

  // ========== RENDER PASO 3: FIRMA ==========
  const renderSignatureStep = () => (
    <View style={styles.scrollView}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="draw" size={28} color={BRAND_ORANGE} />
        <Text style={styles.sectionTitle}>Firma Digital</Text>
      </View>
      <Text style={styles.sectionSubtitle}>
        Firma para confirmar la contratación de tu póliza GEX.
      </Text>

      <Card style={styles.formCard} mode="elevated">
        <Card.Content>
          <View style={styles.signatureContainer}>
            <SignatureScreen
              ref={signatureRef}
              onOK={handleSignature}
              webStyle={`
                .m-signature-pad { box-shadow: none; border: 2px solid #ddd; border-radius: 8px; }
                .m-signature-pad--body { border: none; }
                .m-signature-pad--footer { display: none; }
              `}
              backgroundColor="#fff"
              penColor="#000"
            />
          </View>
          
          <View style={styles.signatureButtons}>
            <Button 
              mode="outlined" 
              onPress={handleClearSignature}
              style={styles.clearButton}
              textColor="#f44336"
              icon="eraser"
            >
              Limpiar
            </Button>
            <Button 
              mode="contained" 
              onPress={() => signatureRef.current?.readSignature()}
              style={styles.confirmSignButton}
              buttonColor={BRAND_GREEN}
              icon="check"
            >
              Confirmar
            </Button>
          </View>
          
          {signature && (
            <View style={styles.signatureConfirmed}>
              <MaterialCommunityIcons name="check-circle" size={20} color={BRAND_GREEN} />
              <Text style={styles.signatureConfirmedText}>Firma capturada correctamente</Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Resumen de costo */}
      <Card style={styles.miniQuoteCard}>
        <Card.Content style={styles.miniQuoteContent}>
          <Text style={styles.miniQuoteLabel}>Total GEX:</Text>
          <Text style={styles.miniQuoteValue}>${estimatedCost.total.toFixed(2)} MXN</Text>
        </Card.Content>
      </Card>

      <View style={styles.buttonRow}>
        <Button 
          mode="outlined" 
          onPress={prevStep}
          style={styles.backButton}
          textColor={BRAND_DARK}
        >
          ← ATRÁS
        </Button>
        <Button 
          mode="contained" 
          onPress={nextStep}
          style={styles.nextButtonHalf}
          buttonColor={BRAND_ORANGE}
          disabled={!signature}
        >
          PAGO →
        </Button>
      </View>
    </View>
  );

  // ========== RENDER PASO 4: PAGO ==========
  const renderPaymentStep = () => (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="credit-card-outline" size={28} color={BRAND_ORANGE} />
        <Text style={styles.sectionTitle}>Opciones de Pago</Text>
      </View>
      <Text style={styles.sectionSubtitle}>
        Elige cómo deseas pagar tu Garantía Extendida.
      </Text>

      {/* Total prominente */}
      <Card style={styles.quoteCard}>
        <Card.Content>
          <View style={styles.paymentTotalRow}>
            <Text style={styles.paymentTotalLabel}>Total a Pagar:</Text>
            <Text style={styles.paymentTotalValue}>${estimatedCost.total.toFixed(2)} MXN</Text>
          </View>
        </Card.Content>
      </Card>

      {/* Opciones de pago */}
      <TouchableOpacity 
        activeOpacity={0.7}
        onPress={() => setPaymentOption('withShipment')}
      >
        <Card style={[styles.paymentOption, paymentOption === 'withShipment' && styles.paymentOptionSelected]}>
          <Card.Content style={styles.paymentOptionContent}>
            <MaterialCommunityIcons 
              name={paymentOption === 'withShipment' ? 'radiobox-marked' : 'radiobox-blank'} 
              size={24} 
              color={paymentOption === 'withShipment' ? BRAND_ORANGE : '#888'} 
            />
            <View style={styles.paymentOptionText}>
              <Text style={styles.paymentOptionTitle}>📦 Pagar junto con el embarque</Text>
              <Text style={styles.paymentOptionDesc}>
                El costo de GEX se sumará a tu factura de flete cuando tu paquete esté listo.
              </Text>
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>

      <TouchableOpacity 
        activeOpacity={0.7}
        onPress={() => setPaymentOption('now')}
      >
        <Card style={[styles.paymentOption, paymentOption === 'now' && styles.paymentOptionSelected]}>
          <Card.Content style={styles.paymentOptionContent}>
            <MaterialCommunityIcons 
              name={paymentOption === 'now' ? 'radiobox-marked' : 'radiobox-blank'} 
              size={24} 
              color={paymentOption === 'now' ? BRAND_ORANGE : '#888'} 
            />
            <View style={styles.paymentOptionText}>
              <Text style={styles.paymentOptionTitle}>⚡ Pagar ahora</Text>
              <Text style={styles.paymentOptionDesc}>
                Paga inmediatamente con PayPal o tarjeta de crédito/débito.
              </Text>
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <Button 
          mode="outlined" 
          onPress={prevStep}
          style={styles.backButton}
          textColor={BRAND_DARK}
        >
          ← ATRÁS
        </Button>
        <Button 
          mode="contained" 
          onPress={handleSubmit}
          style={styles.nextButtonHalf}
          buttonColor={BRAND_GREEN}
          loading={loading}
          disabled={loading}
          icon="check-bold"
        >
          {paymentOption === 'now' ? 'PAGAR' : 'CONFIRMAR'}
        </Button>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );

  // ========== RENDER PASO 5: ÉXITO ==========
  const renderSuccessStep = () => (
    <View style={styles.successContainer}>
      <View style={styles.successContent}>
        <MaterialCommunityIcons name="shield-check" size={100} color={BRAND_GREEN} />
        <Text style={styles.successTitle}>¡GEX Contratado!</Text>
        <Text style={styles.successSubtitle}>
          Tu Garantía Extendida ha sido registrada exitosamente.
        </Text>
        
        <Card style={styles.successCard}>
          <Card.Content>
            <Text style={styles.successCardTitle}>📋 Resumen</Text>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Paquete:</Text>
              <Text style={styles.successValue}>{pkg.tracking_internal}</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Valor Asegurado:</Text>
              <Text style={styles.successValue}>${estimatedCost.invoiceMXN.toFixed(2)} MXN</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Costo GEX:</Text>
              <Text style={[styles.successValue, { color: BRAND_ORANGE }]}>${estimatedCost.total.toFixed(2)} MXN</Text>
            </View>
            <View style={styles.successRow}>
              <Text style={styles.successLabel}>Pago:</Text>
              <Text style={styles.successValue}>
                {paymentOption === 'now' ? '✅ Pagado' : '📦 Pendiente (con embarque)'}
              </Text>
            </View>
          </Card.Content>
        </Card>
        
        <Text style={styles.successNote}>
          📧 Recibirás un correo de confirmación con los detalles de tu póliza.
        </Text>
        
        <Button 
          mode="contained" 
          onPress={() => navigation.goBack()}
          style={styles.doneButton}
          contentStyle={{ height: 55 }}
          buttonColor={BRAND_DARK}
          icon="home"
        >
          VOLVER A MIS PAQUETES
        </Button>
      </View>
    </View>
  );

  // Renderizar el paso actual
  const renderStep = () => {
    switch (currentStep) {
      case 'form':
        return renderFormStep();
      case 'policies':
        return renderPoliciesStep();
      case 'signature':
        return renderSignatureStep();
      case 'payment':
        return renderPaymentStep();
      case 'success':
        return renderSuccessStep();
      default:
        return null;
    }
  };
  
  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={BRAND_DARK} />
      
      {/* HEADER PROFESIONAL OSCURO */}
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Appbar.Content 
          title="Contratar GEX" 
          titleStyle={styles.headerTitle}
          subtitle={currentStep !== 'success' ? `Paso ${getStepNumber()} de 4` : undefined}
          subtitleStyle={styles.headerSubtitle}
        />
      </Appbar.Header>
      
      {/* Progress bar */}
      {currentStep !== 'success' && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${(getStepNumber() / 4) * 100}%` }]} />
        </View>
      )}
      
      {renderStep()}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  header: {
    backgroundColor: BRAND_DARK,
    elevation: 0,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#e0e0e0',
  },
  progressBar: {
    height: '100%',
    backgroundColor: BRAND_ORANGE,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  
  // Sección header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BRAND_DARK,
    marginLeft: 10,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 14,
    marginBottom: 20,
    marginLeft: 38,
  },
  
  // Formulario
  formCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 20,
  },
  formContent: {
    paddingVertical: 10,
  },
  input: {
    marginBottom: 12,
    backgroundColor: 'white',
  },
  moneyInputContainer: {
    marginBottom: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    width: '48%',
  },
  
  // Tarjeta de cotización
  quoteCard: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 12,
    marginBottom: 20,
    elevation: 4,
  },
  quoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  quoteTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 10,
  },
  quoteDivider: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 10,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  quoteLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  quoteValue: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  quoteTotalRow: {
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 5,
  },
  quoteTotalLabel: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  quoteTotalValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 28,
  },
  quoteNote: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 10,
  },
  
  // Mini quote card
  miniQuoteCard: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 12,
    marginBottom: 20,
  },
  miniQuoteContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  miniQuoteLabel: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  miniQuoteValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 22,
  },
  
  // Aviso de factura
  invoiceWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    marginTop: -4,
    marginBottom: 12,
  },
  invoiceWarningText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    marginLeft: 8,
    lineHeight: 16,
  },
  
  // Botones de acción principales
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 12,
    minHeight: 90,
  },
  actionButtonPrimary: {
    backgroundColor: BRAND_ORANGE,
    elevation: 4,
  },
  actionButtonSecondary: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: BRAND_DARK,
  },
  actionButtonDisabled: {
    backgroundColor: '#e0e0e0',
    borderColor: '#ccc',
    elevation: 0,
  },
  actionButtonTextPrimary: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  actionButtonTextSecondary: {
    color: BRAND_DARK,
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  actionButtonTextDisabled: {
    color: '#aaa',
  },
  paymentHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  
  // Botones genéricos
  continueButton: {
    borderRadius: 8,
    elevation: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  backButton: {
    flex: 1,
    borderRadius: 8,
    borderColor: '#ddd',
  },
  nextButtonHalf: {
    flex: 1,
    borderRadius: 8,
  },
  
  // Políticas
  policiesScroll: {
    maxHeight: 380,
    marginBottom: 15,
  },
  policyTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: BRAND_DARK,
    lineHeight: 18,
  },
  policySection: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 6,
    color: BRAND_ORANGE,
    textTransform: 'uppercase',
  },
  policyText: {
    fontSize: 12,
    color: '#444',
    lineHeight: 19,
    textAlign: 'justify',
  },
  policyBold: {
    fontWeight: 'bold',
    color: BRAND_DARK,
  },
  scrollHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    marginBottom: 12,
  },
  scrollHintText: {
    fontSize: 12,
    color: BRAND_ORANGE,
    marginLeft: 8,
    fontWeight: '500',
  },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  acceptRowDisabled: {
    backgroundColor: '#f0f0f0',
  },
  acceptText: {
    flex: 1,
    fontSize: 13,
    color: BRAND_DARK,
    marginLeft: 8,
  },
  acceptTextDisabled: {
    color: '#999',
  },
  
  // Firma
  signatureContainer: {
    height: 200,
    marginBottom: 15,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  signatureButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  clearButton: {
    flex: 1,
    borderColor: '#f44336',
  },
  confirmSignButton: {
    flex: 1,
  },
  signatureConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  signatureConfirmedText: {
    color: BRAND_GREEN,
    fontWeight: '600',
    marginLeft: 8,
  },
  
  // Payment
  paymentTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentTotalLabel: {
    color: 'white',
    fontWeight: '600',
    fontSize: 18,
  },
  paymentTotalValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 28,
  },
  paymentOption: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  paymentOptionSelected: {
    borderColor: BRAND_ORANGE,
    backgroundColor: BRAND_ORANGE + '10',
  },
  paymentOptionContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  paymentOptionText: {
    flex: 1,
    marginLeft: 12,
  },
  paymentOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_DARK,
  },
  paymentOptionDesc: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  
  // Success
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: BACKGROUND,
  },
  successContent: {
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: BRAND_GREEN,
    marginTop: 15,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
  },
  successCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: width - 48,
    elevation: 2,
  },
  successCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    color: BRAND_DARK,
  },
  successRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  successLabel: {
    fontSize: 14,
    color: '#666',
  },
  successValue: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_DARK,
  },
  successNote: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 25,
    paddingHorizontal: 20,
  },
  doneButton: {
    width: width - 48,
    borderRadius: 8,
    elevation: 4,
  },
});
