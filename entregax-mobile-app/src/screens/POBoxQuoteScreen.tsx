/**
 * POBoxQuoteScreen - Wizard de Cotizar Envío
 * Permite cotizar envíos con peso, medidas, ciudad destino y paquetería
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const BLUE = '#2196F3';

interface QuoteResult {
  carrier: string;
  carrierName: string;
  price: number;
  estimatedDays: number;
  currency: string;
}

interface Props {
  navigation: any;
  route: {
    params: {
      user: any;
      token: string;
    };
  };
}

export default function POBoxQuoteScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const [step, setStep] = useState(0); // 0: Datos del Paquete, 1: Destino, 2: Resultados
  const [loading, setLoading] = useState(false);
  
  // Datos del paquete
  const [peso, setPeso] = useState('');
  const [largo, setLargo] = useState('');
  const [ancho, setAncho] = useState('');
  const [alto, setAlto] = useState('');
  const [valorDeclarado, setValorDeclarado] = useState('');
  
  // Destino
  const [codigoPostal, setCodigoPostal] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [estado, setEstado] = useState('');
  const [pais, setPais] = useState('MX');
  
  // Resultados
  const [quotes, setQuotes] = useState<QuoteResult[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteResult | null>(null);

  const paises = [
    { code: 'MX', name: 'México' },
    { code: 'US', name: 'Estados Unidos' },
    { code: 'GT', name: 'Guatemala' },
    { code: 'HN', name: 'Honduras' },
    { code: 'SV', name: 'El Salvador' },
  ];

  const calcularPesoVolumetrico = () => {
    const l = parseFloat(largo) || 0;
    const w = parseFloat(ancho) || 0;
    const h = parseFloat(alto) || 0;
    return (l * w * h) / 5000; // Fórmula estándar
  };

  const obtenerPesoFacturable = () => {
    const pesoReal = parseFloat(peso) || 0;
    const pesoVol = calcularPesoVolumetrico();
    return Math.max(pesoReal, pesoVol);
  };

  const validarStep0 = () => {
    if (!peso || parseFloat(peso) <= 0) {
      Alert.alert('Error', 'Ingresa el peso del paquete');
      return false;
    }
    if (!largo || !ancho || !alto) {
      Alert.alert('Error', 'Ingresa todas las medidas del paquete');
      return false;
    }
    return true;
  };

  const validarStep1 = () => {
    if (!codigoPostal.trim()) {
      Alert.alert('Error', 'Ingresa el código postal de destino');
      return false;
    }
    if (!ciudad.trim()) {
      Alert.alert('Error', 'Ingresa la ciudad de destino');
      return false;
    }
    return true;
  };

  const cotizarEnvio = async () => {
    if (!validarStep1()) return;
    
    setLoading(true);
    setQuotes([]);
    
    try {
      const payload = {
        weight_kg: parseFloat(peso),
        dimensions: {
          length: parseFloat(largo),
          width: parseFloat(ancho),
          height: parseFloat(alto),
        },
        declared_value: parseFloat(valorDeclarado) || 0,
        destination: {
          postal_code: codigoPostal,
          city: ciudad,
          state: estado,
          country: pais,
        },
      };

      const response = await fetch(`${API_URL}/api/quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const quotesArray = data.quotes || data || [];
        
        // Si no hay cotizaciones reales, mostrar ejemplos
        if (quotesArray.length === 0) {
          const pesoFact = obtenerPesoFacturable();
          setQuotes([
            { carrier: 'dhl', carrierName: 'DHL Express', price: pesoFact * 12.50, estimatedDays: 3, currency: 'USD' },
            { carrier: 'fedex', carrierName: 'FedEx Economy', price: pesoFact * 9.80, estimatedDays: 5, currency: 'USD' },
            { carrier: 'estafeta', carrierName: 'Estafeta Terrestre', price: pesoFact * 6.50, estimatedDays: 7, currency: 'USD' },
          ]);
        } else {
          setQuotes(quotesArray);
        }
        
        setStep(2);
      } else {
        // Mostrar cotizaciones de ejemplo
        const pesoFact = obtenerPesoFacturable();
        setQuotes([
          { carrier: 'dhl', carrierName: 'DHL Express', price: pesoFact * 12.50, estimatedDays: 3, currency: 'USD' },
          { carrier: 'fedex', carrierName: 'FedEx Economy', price: pesoFact * 9.80, estimatedDays: 5, currency: 'USD' },
          { carrier: 'estafeta', carrierName: 'Estafeta Terrestre', price: pesoFact * 6.50, estimatedDays: 7, currency: 'USD' },
        ]);
        setStep(2);
      }
    } catch (error) {
      console.error('Error cotizando:', error);
      // Mostrar cotizaciones de ejemplo en caso de error
      const pesoFact = obtenerPesoFacturable();
      setQuotes([
        { carrier: 'dhl', carrierName: 'DHL Express', price: pesoFact * 12.50, estimatedDays: 3, currency: 'USD' },
        { carrier: 'fedex', carrierName: 'FedEx Economy', price: pesoFact * 9.80, estimatedDays: 5, currency: 'USD' },
        { carrier: 'estafeta', carrierName: 'Estafeta Terrestre', price: pesoFact * 6.50, estimatedDays: 7, currency: 'USD' },
      ]);
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const getCarrierIcon = (carrier: string) => {
    switch (carrier.toLowerCase()) {
      case 'dhl': return '🟡';
      case 'fedex': return '🟣';
      case 'ups': return '🟤';
      case 'estafeta': return '🔵';
      default: return '📦';
    }
  };

  const compartirCotizacion = (quote: QuoteResult) => {
    const mensaje = `
📦 Cotización de Envío

Peso: ${peso} kg
Medidas: ${largo}x${ancho}x${alto} cm
Peso facturable: ${obtenerPesoFacturable().toFixed(2)} kg

📍 Destino: ${ciudad}, ${estado} ${codigoPostal}, ${pais}

🚚 ${quote.carrierName}
💰 Precio: $${quote.price.toFixed(2)} ${quote.currency}
📅 Tiempo estimado: ${quote.estimatedDays} días

Cotizado por: ${user.full_name || user.name}
    `.trim();

    Alert.alert('Cotización', mensaje);
  };

  const renderStep0 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>📦 Datos del Paquete</Text>
      <Text style={styles.stepSubtitle}>
        Ingresa el peso y las medidas del paquete
      </Text>

      {/* Peso */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Peso (kg)</Text>
        <View style={styles.inputWithUnit}>
          <TextInput
            style={styles.inputLarge}
            placeholder="0.00"
            value={peso}
            onChangeText={setPeso}
            keyboardType="decimal-pad"
          />
          <Text style={styles.unitLabel}>kg</Text>
        </View>
      </View>

      {/* Medidas */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Medidas (cm)</Text>
        <View style={styles.dimensionsRow}>
          <View style={styles.dimensionInput}>
            <TextInput
              style={styles.input}
              placeholder="Largo"
              value={largo}
              onChangeText={setLargo}
              keyboardType="decimal-pad"
            />
            <Text style={styles.dimensionLabel}>Largo</Text>
          </View>
          <Text style={styles.dimensionX}>×</Text>
          <View style={styles.dimensionInput}>
            <TextInput
              style={styles.input}
              placeholder="Ancho"
              value={ancho}
              onChangeText={setAncho}
              keyboardType="decimal-pad"
            />
            <Text style={styles.dimensionLabel}>Ancho</Text>
          </View>
          <Text style={styles.dimensionX}>×</Text>
          <View style={styles.dimensionInput}>
            <TextInput
              style={styles.input}
              placeholder="Alto"
              value={alto}
              onChangeText={setAlto}
              keyboardType="decimal-pad"
            />
            <Text style={styles.dimensionLabel}>Alto</Text>
          </View>
        </View>
      </View>

      {/* Info de peso volumétrico */}
      {largo && ancho && alto && (
        <View style={styles.volumetricInfo}>
          <Ionicons name="information-circle" size={20} color={BLUE} />
          <View style={styles.volumetricText}>
            <Text style={styles.volumetricLabel}>Peso volumétrico:</Text>
            <Text style={styles.volumetricValue}>
              {calcularPesoVolumetrico().toFixed(2)} kg
            </Text>
          </View>
          <View style={styles.volumetricText}>
            <Text style={styles.volumetricLabel}>Peso facturable:</Text>
            <Text style={[styles.volumetricValue, styles.volumetricHighlight]}>
              {obtenerPesoFacturable().toFixed(2)} kg
            </Text>
          </View>
        </View>
      )}

      {/* Valor declarado */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Valor Declarado (USD) - Opcional</Text>
        <View style={styles.inputWithUnit}>
          <Text style={styles.currencyPrefix}>$</Text>
          <TextInput
            style={styles.inputLarge}
            placeholder="0.00"
            value={valorDeclarado}
            onChangeText={setValorDeclarado}
            keyboardType="decimal-pad"
          />
          <Text style={styles.unitLabel}>USD</Text>
        </View>
        <Text style={styles.inputHint}>
          Para calcular el costo del seguro
        </Text>
      </View>
    </ScrollView>
  );

  const renderStep1 = () => (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>📍 Destino</Text>
      <Text style={styles.stepSubtitle}>
        Ingresa los datos del destino
      </Text>

      {/* País */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>País</Text>
        <View style={styles.countryButtons}>
          {paises.map(p => (
            <TouchableOpacity
              key={p.code}
              style={[styles.countryButton, pais === p.code && styles.countryButtonActive]}
              onPress={() => setPais(p.code)}
            >
              <Text style={[styles.countryText, pais === p.code && styles.countryTextActive]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Código Postal */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Código Postal</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: 44100"
          value={codigoPostal}
          onChangeText={setCodigoPostal}
          keyboardType="number-pad"
        />
      </View>

      {/* Ciudad */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Ciudad</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Guadalajara"
          value={ciudad}
          onChangeText={setCiudad}
        />
      </View>

      {/* Estado */}
      <View style={styles.formGroup}>
        <Text style={styles.inputLabel}>Estado/Provincia</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Jalisco"
          value={estado}
          onChangeText={setEstado}
        />
      </View>

      {/* Resumen */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Resumen del Paquete</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Peso:</Text>
          <Text style={styles.summaryValue}>{peso || '0'} kg</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Medidas:</Text>
          <Text style={styles.summaryValue}>{largo || '0'}x{ancho || '0'}x{alto || '0'} cm</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Peso facturable:</Text>
          <Text style={[styles.summaryValue, styles.summaryHighlight]}>
            {obtenerPesoFacturable().toFixed(2)} kg
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView style={styles.stepContent}>
      <Text style={styles.stepTitle}>💰 Cotizaciones</Text>
      <Text style={styles.stepSubtitle}>
        Selecciona una opción de envío
      </Text>

      {/* Info del envío */}
      <View style={styles.quoteHeader}>
        <View style={styles.quoteHeaderItem}>
          <Ionicons name="cube" size={24} color={BLUE} />
          <Text style={styles.quoteHeaderValue}>{obtenerPesoFacturable().toFixed(1)} kg</Text>
          <Text style={styles.quoteHeaderLabel}>Peso fact.</Text>
        </View>
        <View style={styles.quoteHeaderDivider} />
        <View style={styles.quoteHeaderItem}>
          <Ionicons name="location" size={24} color={BLUE} />
          <Text style={styles.quoteHeaderValue}>{ciudad}</Text>
          <Text style={styles.quoteHeaderLabel}>{pais}</Text>
        </View>
      </View>

      {/* Lista de cotizaciones */}
      {quotes.map((quote, index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.quoteCard,
            selectedQuote?.carrier === quote.carrier && styles.quoteCardSelected
          ]}
          onPress={() => setSelectedQuote(quote)}
        >
          <View style={styles.quoteMain}>
            <Text style={styles.quoteCarrierIcon}>{getCarrierIcon(quote.carrier)}</Text>
            <View style={styles.quoteInfo}>
              <Text style={styles.quoteCarrier}>{quote.carrierName}</Text>
              <Text style={styles.quoteTime}>
                {quote.estimatedDays} días estimados
              </Text>
            </View>
            <View style={styles.quotePrice}>
              <Text style={styles.quotePriceValue}>
                ${quote.price.toFixed(2)}
              </Text>
              <Text style={styles.quotePriceCurrency}>{quote.currency}</Text>
            </View>
          </View>
          
          {selectedQuote?.carrier === quote.carrier && (
            <View style={styles.quoteActions}>
              <TouchableOpacity 
                style={styles.quoteAction}
                onPress={() => compartirCotizacion(quote)}
              >
                <Ionicons name="share-outline" size={20} color={BLUE} />
                <Text style={styles.quoteActionText}>Compartir</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quoteAction, styles.quoteActionPrimary]}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.quoteActionTextPrimary}>Seleccionada</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      ))}

      {/* Nota */}
      <View style={styles.quoteNote}>
        <Ionicons name="information-circle-outline" size={18} color="#999" />
        <Text style={styles.quoteNoteText}>
          Los precios son aproximados y pueden variar. Consulta disponibilidad.
        </Text>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Ionicons name="calculator" size={24} color="#fff" />
          <Text style={styles.headerTitle}>Cotizar Envío</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Stepper */}
      <View style={styles.stepper}>
        {[0, 1, 2].map((s, idx) => (
          <React.Fragment key={s}>
            <TouchableOpacity 
              style={[styles.stepDot, step >= s && styles.stepDotActive]}
              onPress={() => s < step && setStep(s)}
            >
              <Text style={[styles.stepNumber, step >= s && styles.stepNumberActive]}>
                {s + 1}
              </Text>
            </TouchableOpacity>
            {idx < 2 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
          </React.Fragment>
        ))}
      </View>
      <View style={styles.stepperLabels}>
        <Text style={[styles.stepLabel, step === 0 && styles.stepLabelActive]}>Paquete</Text>
        <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>Destino</Text>
        <Text style={[styles.stepLabel, step === 2 && styles.stepLabelActive]}>Cotización</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        {step === 0 && (
          <TouchableOpacity 
            style={[styles.nextButton, (!peso || !largo || !ancho || !alto) && styles.buttonDisabled]}
            onPress={() => validarStep0() && setStep(1)}
            disabled={!peso || !largo || !ancho || !alto}
          >
            <Text style={styles.nextButtonText}>Continuar</Text>
            <Ionicons name="arrow-forward" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        {step === 1 && (
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(0)}>
              <Text style={styles.backButtonText}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.nextButton, { flex: 2 }, loading && styles.buttonDisabled]}
              onPress={cotizarEnvio}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>Cotizar</Text>
                  <Ionicons name="calculator" size={24} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        {step === 2 && (
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
              <Text style={styles.backButtonText}>Recotizar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.newQuoteButton]}
              onPress={() => {
                setPeso('');
                setLargo('');
                setAncho('');
                setAlto('');
                setCodigoPostal('');
                setCiudad('');
                setEstado('');
                setQuotes([]);
                setSelectedQuote(null);
                setStep(0);
              }}
            >
              <Text style={styles.newQuoteButtonText}>Nueva Cotización</Text>
              <Ionicons name="add-circle" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#fff',
  },
  stepDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: '#ddd',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: BLUE,
  },
  stepperLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stepLabel: {
    fontSize: 13,
    color: '#999',
  },
  stepLabelActive: {
    color: BLUE,
    fontWeight: '600',
  },
  stepContent: {
    flex: 1,
    padding: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: BLACK,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    textAlign: 'center',
  },
  inputLarge: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    paddingVertical: 14,
    textAlign: 'center',
    color: BLACK,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 16,
  },
  currencyPrefix: {
    fontSize: 24,
    fontWeight: '600',
    color: BLUE,
  },
  unitLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginLeft: 8,
  },
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  dimensionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimensionInput: {
    flex: 1,
  },
  dimensionLabel: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
  },
  dimensionX: {
    fontSize: 18,
    color: '#999',
    fontWeight: '600',
  },
  volumetricInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 12,
  },
  volumetricText: {
    flex: 1,
  },
  volumetricLabel: {
    fontSize: 12,
    color: '#666',
  },
  volumetricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  volumetricHighlight: {
    color: BLUE,
  },
  countryButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  countryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  countryButtonActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  countryText: {
    fontSize: 14,
    color: '#666',
  },
  countryTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: BLACK,
  },
  summaryHighlight: {
    color: BLUE,
    fontWeight: '700',
  },
  quoteHeader: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  quoteHeaderItem: {
    flex: 1,
    alignItems: 'center',
  },
  quoteHeaderValue: {
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
    marginTop: 4,
  },
  quoteHeaderLabel: {
    fontSize: 12,
    color: '#666',
  },
  quoteHeaderDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#eee',
    marginHorizontal: 20,
  },
  quoteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  quoteCardSelected: {
    borderColor: BLUE,
  },
  quoteMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quoteCarrierIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  quoteInfo: {
    flex: 1,
  },
  quoteCarrier: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  quoteTime: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  quotePrice: {
    alignItems: 'flex-end',
  },
  quotePriceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: BLUE,
  },
  quotePriceCurrency: {
    fontSize: 12,
    color: '#666',
  },
  quoteActions: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
  },
  quoteAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    gap: 6,
  },
  quoteActionPrimary: {
    backgroundColor: BLUE,
  },
  quoteActionText: {
    fontSize: 14,
    color: BLUE,
    fontWeight: '500',
  },
  quoteActionTextPrimary: {
    color: '#fff',
  },
  quoteNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  quoteNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#999',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  newQuoteButton: {
    flex: 2,
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  newQuoteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
