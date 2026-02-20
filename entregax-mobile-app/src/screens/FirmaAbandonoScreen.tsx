/**
 * FirmaAbandonoScreen.tsx
 * Pantalla para firmar documento de abandono de mercancía
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Appbar,
  Surface,
  Button,
  ActivityIndicator,
  Divider,
  Checkbox,
  List,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { API_URL } from '../services/api';
import Svg, { Path } from 'react-native-svg';
import { PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { captureRef } from 'react-native-view-shot';

// Colores de marca
const BRAND_ORANGE = '#F05A28';
const BRAND_DARK = '#111111';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_WIDTH = SCREEN_WIDTH - 48;
const CANVAS_HEIGHT = 200;

type RootStackParamList = {
  FirmaAbandono: { user: any; token: string; abandonoToken: string };
  Home: { user: any; token: string };
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'FirmaAbandono'>;
  route: RouteProp<RootStackParamList, 'FirmaAbandono'>;
};

interface Guia {
  tracking: string;
  servicio: string;
  saldo: number;
}

interface DocumentoAbandono {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  cliente_email: string;
  guias_incluidas: Guia[];
  monto_total_condonado: number;
  estatus: string;
  created_at: string;
}

const FirmaAbandonoScreen: React.FC<Props> = ({ navigation, route }) => {
  const { user, token, abandonoToken } = route.params;
  const [documento, setDocumento] = useState<DocumentoAbandono | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  
  // Canvas de firma
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const svgRef = useRef<View>(null);

  useEffect(() => {
    fetchDocumento();
  }, [abandonoToken]);

  const fetchDocumento = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/firma-abandono/${abandonoToken}`);
      const data = await response.json();
      
      if (response.ok) {
        // Parsear guias si viene como string
        const guias = typeof data.guias_incluidas === 'string' 
          ? JSON.parse(data.guias_incluidas) 
          : data.guias_incluidas;
        setDocumento({ ...data, guias_incluidas: guias });
      } else {
        setError(data.error || 'Documento no encontrado');
      }
    } catch (err) {
      console.error('Error fetching documento:', err);
      setError('Error al cargar el documento');
    } finally {
      setLoading(false);
    }
  };

  const onGestureEvent = (event: any) => {
    const { x, y } = event.nativeEvent;
    if (currentPath === '') {
      setCurrentPath(`M${x},${y}`);
    } else {
      setCurrentPath(prev => `${prev} L${x},${y}`);
    }
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END && currentPath) {
      setPaths(prev => [...prev, currentPath]);
      setCurrentPath('');
    }
  };

  const clearSignature = () => {
    setPaths([]);
    setCurrentPath('');
  };

  const hasSignature = paths.length > 0 || currentPath !== '';

  const handleSubmit = async () => {
    if (!hasSignature) {
      Alert.alert('Error', 'Por favor dibuja tu firma');
      return;
    }
    if (!aceptaTerminos) {
      Alert.alert('Error', 'Debes aceptar los términos para continuar');
      return;
    }

    try {
      setSending(true);

      // Capturar SVG como imagen base64
      let firmaBase64 = '';
      if (svgRef.current) {
        const uri = await captureRef(svgRef, {
          format: 'png',
          quality: 0.8,
        });
        // Convertir a base64
        const response = await fetch(uri);
        const blob = await response.blob();
        firmaBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }

      // Enviar firma al servidor
      const submitResponse = await fetch(`${API_URL}/api/firma-abandono/${abandonoToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ firma_base64: firmaBase64 }),
      });

      const result = await submitResponse.json();

      if (result.success) {
        Alert.alert(
          '✅ Documento Firmado',
          'El documento de abandono ha sido firmado exitosamente. Tu deuda ha sido condonada.',
          [
            {
              text: 'Aceptar',
              onPress: () => navigation.navigate('Home', { user, token }),
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Error al firmar el documento');
      }
    } catch (err) {
      console.error('Error submitting firma:', err);
      Alert.alert('Error', 'Error al enviar la firma');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={styles.header}>
          <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
          <Appbar.Content title="Documento de Abandono" titleStyle={styles.headerTitle} />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND_ORANGE} />
          <Text style={styles.loadingText}>Cargando documento...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={styles.header}>
          <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
          <Appbar.Content title="Documento de Abandono" titleStyle={styles.headerTitle} />
        </Appbar.Header>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={() => navigation.goBack()} style={styles.backButton}>
            Volver
          </Button>
        </View>
      </View>
    );
  }

  if (!documento) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <Appbar.Header style={styles.header}>
          <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
          <Appbar.Content title="Firma de Abandono" titleStyle={styles.headerTitle} />
        </Appbar.Header>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Aviso Legal */}
          <Surface style={styles.warningCard}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningTitle}>DOCUMENTO LEGAL</Text>
            <Text style={styles.warningText}>
              Este documento tiene validez legal. Al firmarlo, aceptas el abandono de la 
              mercancía y la condonación de la deuda asociada.
            </Text>
          </Surface>

          {/* Información del Cliente */}
          <Surface style={styles.card}>
            <Text style={styles.sectionTitle}>Datos del Cliente</Text>
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.label}>Nombre:</Text>
              <Text style={styles.value}>{documento.cliente_nombre}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>{documento.cliente_email}</Text>
            </View>
          </Surface>

          {/* Lista de Guías */}
          <Surface style={styles.card}>
            <Text style={styles.sectionTitle}>Guías Incluidas ({documento.guias_incluidas.length})</Text>
            <Divider style={styles.divider} />
            {documento.guias_incluidas.map((guia, index) => (
              <View key={index} style={styles.guiaRow}>
                <View style={styles.guiaInfo}>
                  <Text style={styles.guiaTracking}>{guia.tracking}</Text>
                  <Text style={styles.guiaServicio}>{guia.servicio}</Text>
                </View>
                <Text style={styles.guiaSaldo}>${parseFloat(String(guia.saldo)).toFixed(2)}</Text>
              </View>
            ))}
            <Divider style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL A CONDONAR:</Text>
              <Text style={styles.totalValue}>
                ${parseFloat(String(documento.monto_total_condonado)).toFixed(2)} MXN
              </Text>
            </View>
          </Surface>

          {/* Términos */}
          <Surface style={styles.card}>
            <Text style={styles.sectionTitle}>Términos y Condiciones</Text>
            <Divider style={styles.divider} />
            <Text style={styles.termsText}>
              Al firmar este documento, declaro bajo protesta de decir verdad que:{'\n\n'}
              1. Renuncio a cualquier derecho sobre la mercancía listada.{'\n\n'}
              2. Autorizo a EntregaX a disponer de la mercancía como mejor convenga.{'\n\n'}
              3. Acepto la condonación de la deuda y libero a EntregaX de cualquier 
              responsabilidad futura relacionada con estos paquetes.{'\n\n'}
              4. Este documento tiene validez legal y es vinculante.
            </Text>
            <TouchableOpacity 
              style={styles.checkboxRow}
              onPress={() => setAceptaTerminos(!aceptaTerminos)}
            >
              <Checkbox
                status={aceptaTerminos ? 'checked' : 'unchecked'}
                color={BRAND_ORANGE}
              />
              <Text style={styles.checkboxLabel}>
                He leído y acepto los términos y condiciones
              </Text>
            </TouchableOpacity>
          </Surface>

          {/* Canvas de Firma */}
          <Surface style={styles.card}>
            <Text style={styles.sectionTitle}>Tu Firma</Text>
            <Divider style={styles.divider} />
            <Text style={styles.signatureInstructions}>
              Dibuja tu firma en el recuadro:
            </Text>
            
            <View ref={svgRef} collapsable={false}>
              <PanGestureHandler
                onGestureEvent={onGestureEvent}
                onHandlerStateChange={onHandlerStateChange}
              >
                <View style={styles.signatureCanvas}>
                  <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
                    {paths.map((path, index) => (
                      <Path
                        key={index}
                        d={path}
                        stroke={BRAND_DARK}
                        strokeWidth={2}
                        fill="none"
                      />
                    ))}
                    {currentPath && (
                      <Path
                        d={currentPath}
                        stroke={BRAND_DARK}
                        strokeWidth={2}
                        fill="none"
                      />
                    )}
                  </Svg>
                </View>
              </PanGestureHandler>
            </View>

            <Button 
              mode="text" 
              onPress={clearSignature}
              style={styles.clearButton}
              labelStyle={styles.clearButtonLabel}
            >
              🗑️ Borrar Firma
            </Button>
          </Surface>

          {/* Botón de Enviar */}
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={!hasSignature || !aceptaTerminos || sending}
            loading={sending}
            style={[
              styles.submitButton,
              (!hasSignature || !aceptaTerminos) && styles.submitButtonDisabled
            ]}
            labelStyle={styles.submitButtonLabel}
          >
            {sending ? 'Enviando...' : '✍️ Firmar Documento'}
          </Button>

          <Text style={styles.disclaimer}>
            Tu firma será registrada junto con la fecha, hora e información del dispositivo.
          </Text>
        </ScrollView>
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: BRAND_DARK,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: BRAND_ORANGE,
  },
  warningCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: BRAND_ORANGE,
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BRAND_DARK,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BRAND_DARK,
    marginBottom: 8,
  },
  divider: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
    width: 70,
  },
  value: {
    fontSize: 14,
    color: BRAND_DARK,
    flex: 1,
    fontWeight: '500',
  },
  guiaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  guiaInfo: {
    flex: 1,
  },
  guiaTracking: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_DARK,
  },
  guiaServicio: {
    fontSize: 12,
    color: '#666',
  },
  guiaSaldo: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#d32f2f',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BRAND_DARK,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BRAND_ORANGE,
  },
  termsText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 14,
    color: BRAND_DARK,
    flex: 1,
  },
  signatureInstructions: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  signatureCanvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#fafafa',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    borderStyle: 'dashed',
    alignSelf: 'center',
  },
  clearButton: {
    marginTop: 8,
  },
  clearButtonLabel: {
    color: '#666',
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: BRAND_ORANGE,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  disclaimer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
});

export default FirmaAbandonoScreen;
