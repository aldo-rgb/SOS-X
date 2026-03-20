// ============================================
// 🚀 PANTALLA DE GUÍA DE SERVICIOS - EXPERIENCIA PREMIUM
// Muestra los 4 tipos de envío con tutoriales y direcciones personalizadas
// Diseño de marketing subliminal para conversión
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  Alert,
  Share,
  Platform,
  Clipboard,
} from 'react-native';
import { Appbar, Surface, Chip, Button, Divider, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ORANGE = '#E65100';
const BLACK = '#1a1a1a';

// ============================================
// TIPOS LOCALES
// ============================================

interface User {
  id: number;
  name?: string;
  full_name?: string;
  email?: string;
  boxId?: string;
}

type RootStackParamList = {
  ServicesGuide: { user: User; token: string };
  RequestAdvisor: { user: User; token: string };
};

interface ServiceInfo {
  serviceType: string;
  instructions: {
    packaging_instructions: string;
    shipping_instructions: string;
    general_notes: string;
  } | null;
  addresses: WarehouseAddress[];
}

interface WarehouseAddress {
  alias: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  business_hours: string | null;
  special_instructions: string | null;
  is_primary: boolean;
}

interface ServiceCard {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  gradient: [string, string];
  tagline: string;
  benefits: string[];
  timeframe: string;
  idealFor: string;
  serviceType: string;
}

// ============================================
// DATOS DE LOS SERVICIOS
// ============================================

const SERVICES: ServiceCard[] = [
  {
    id: 'china_air',
    name: 'Todo Incluido Aéreo China',
    shortName: 'Aéreo',
    icon: 'airplane',
    color: '#2196F3',
    gradient: ['#1976D2', '#42A5F5'],
    tagline: '¡Velocidad sin límites desde China!',
    benefits: [
      '✈️ Llegada en 7-15 días',
      '📦 Ideal para muestras y urgentes',
      '🛡️ Seguimiento en tiempo real',
      '💰 Precio competitivo por kg',
    ],
    timeframe: '7-15 días',
    idealFor: 'Muestras, productos urgentes, electrónicos pequeños',
    serviceType: 'china_air',
  },
  {
    id: 'china_sea',
    name: 'Marítimo China LCL',
    shortName: 'Marítimo',
    icon: 'boat',
    color: '#00796B',
    gradient: ['#004D40', '#26A69A'],
    tagline: '¡El mejor precio para volumen!',
    benefits: [
      '🚢 Contenedor compartido (LCL)',
      '📦 Desde 1 caja',
      '💵 Costo por CBM ultra competitivo',
      '🔒 Consolidación segura',
    ],
    timeframe: '45-60 días',
    idealFor: 'Compras mayoristas, inventario, productos no urgentes',
    serviceType: 'china_sea',
  },
  {
    id: 'mx_cedis',
    name: 'Liberación Aduanal Monterrey',
    shortName: 'MTY',
    icon: 'shield-checkmark',
    color: '#FF9800',
    gradient: ['#E65100', '#FFB74D'],
    tagline: '¡Express nacional sin complicaciones!',
    benefits: [
      '✅ Liberación en 24-48 hrs',
      '📋 Sin trámites de importación complicados',
      '🏪 Recibe en nuestro CEDIS MTY',
      '💳 Pago contra entrega disponible',
    ],
    timeframe: '24-48 hrs',
    idealFor: 'Compras nacionales, reenvíos urgentes, sin aduana',
    serviceType: 'mx_cedis',
  },
  {
    id: 'usa_pobox',
    name: 'PO Box USA',
    shortName: 'PO Box',
    icon: 'mail',
    color: '#9C27B0',
    gradient: ['#6A1B9A', '#BA68C8'],
    tagline: '¡Tu dirección en Estados Unidos!',
    benefits: [
      '🇺🇸 Dirección física en Texas',
      '📦 Consolida múltiples paquetes',
      '💰 Ahorra en envíos combinados',
      '🛒 Compra en Amazon, eBay, etc.',
    ],
    timeframe: '5-7 días',
    idealFor: 'Compras online USA, consolidación de paquetes',
    serviceType: 'usa_pobox',
  },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

type Props = NativeStackScreenProps<RootStackParamList, 'ServicesGuide'>;

export default function ServicesGuideScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [serviceInfo, setServiceInfo] = useState<ServiceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  // Animaciones
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ============================================
  // CARGAR INFO DEL SERVICIO
  // ============================================

  const loadServiceInfo = async (serviceType: string) => {
    setLoading(true);
    try {
      const response = await api.get(`/api/services/${serviceType}/info`);
      setServiceInfo(response.data);
    } catch (error) {
      console.error('Error loading service info:', error);
      Alert.alert('Error', 'No se pudo cargar la información del servicio');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectService = (serviceId: string) => {
    if (selectedService === serviceId) {
      setSelectedService(null);
      setServiceInfo(null);
    } else {
      setSelectedService(serviceId);
      const service = SERVICES.find(s => s.id === serviceId);
      if (service) {
        loadServiceInfo(service.serviceType);
      }
    }
  };

  // ============================================
  // GENERAR DIRECCIÓN PERSONALIZADA
  // ============================================

  const generatePersonalizedAddress = (address: WarehouseAddress, service: ServiceCard): string => {
    const clientName = user.full_name || user.name || 'NOMBRE';
    const boxId = user.boxId || 'S-XXX';
    
    let formattedAddress = '';
    
    if (service.id === 'usa_pobox') {
      // PO Box USA - Formato especial con Suite
      formattedAddress = `${address.address_line1.replace('(S-Numero de Cliente)', boxId)}\n` +
        `ATTN: ${clientName}\n` +
        `${address.city}, ${address.state} ${address.zip_code}\n` +
        `📞 ${address.contact_phone || ''}`;
    } else if (service.id === 'china_air' || service.id === 'china_sea') {
      // China - Incluir shipping mark
      formattedAddress = `📍 ${address.address_line1}\n` +
        (address.address_line2 ? `${address.address_line2}\n` : '') +
        `📦 Shipping Mark / 唛头: ${boxId}\n` +
        `👤 Contacto: ${address.contact_name || ''}\n` +
        `📞 ${address.contact_phone || ''}`;
    } else {
      // DHL MTY
      formattedAddress = `📍 ${address.address_line1}\n` +
        `${address.city}, ${address.state} ${address.zip_code}\n` +
        `📦 A nombre de: ${clientName} (${boxId})\n` +
        `📞 ${address.contact_phone || ''}`;
    }
    
    return formattedAddress;
  };

  // ============================================
  // COPIAR AL PORTAPAPELES
  // ============================================

  const handleCopy = async (text: string, field: string) => {
    Clipboard.setString(text.replace(/📍|📦|👤|📞|🏪/g, '').trim());
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    
    // Vibración suave (si está disponible)
    // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ============================================
  // COMPARTIR DIRECCIÓN
  // ============================================

  const handleShare = async (address: WarehouseAddress, service: ServiceCard) => {
    const text = generatePersonalizedAddress(address, service);
    try {
      await Share.share({
        message: `🚚 Mi dirección de envío EntregaX - ${service.name}:\n\n${text}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // ============================================
  // RENDER: TARJETA DE SERVICIO
  // ============================================

  const renderServiceCard = (service: ServiceCard, index: number) => {
    const isSelected = selectedService === service.id;
    const animDelay = index * 100;

    return (
      <Animated.View
        key={service.id}
        style={[
          styles.serviceCardContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handleSelectService(service.id)}
        >
          <LinearGradient
            colors={isSelected ? service.gradient : ['#ffffff', '#f5f5f5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.serviceCard,
              isSelected && styles.serviceCardSelected,
            ]}
          >
            {/* Header con icono y nombre */}
            <View style={styles.serviceCardHeader}>
              <View style={[
                styles.serviceIconContainer,
                { backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : service.color + '20' }
              ]}>
                <Ionicons
                  name={service.icon as any}
                  size={28}
                  color={isSelected ? '#fff' : service.color}
                />
              </View>
              <View style={styles.serviceCardTitleContainer}>
                <Text style={[
                  styles.serviceCardTitle,
                  isSelected && styles.serviceCardTitleSelected
                ]}>
                  {service.name}
                </Text>
                <Text style={[
                  styles.serviceCardTagline,
                  isSelected && styles.serviceCardTaglineSelected
                ]}>
                  {service.tagline}
                </Text>
              </View>
              <View style={[
                styles.timeframeBadge,
                { backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : service.color + '15' }
              ]}>
                <Ionicons
                  name="time-outline"
                  size={12}
                  color={isSelected ? '#fff' : service.color}
                />
                <Text style={[
                  styles.timeframeText,
                  { color: isSelected ? '#fff' : service.color }
                ]}>
                  {service.timeframe}
                </Text>
              </View>
            </View>

            {/* Beneficios - Visible siempre pero más destacado cuando seleccionado */}
            <View style={styles.benefitsContainer}>
              {service.benefits.slice(0, isSelected ? 4 : 2).map((benefit, idx) => (
                <Text
                  key={idx}
                  style={[
                    styles.benefitText,
                    isSelected && styles.benefitTextSelected
                  ]}
                >
                  {benefit}
                </Text>
              ))}
            </View>

            {/* Ideal para */}
            <View style={styles.idealForContainer}>
              <Text style={[
                styles.idealForLabel,
                isSelected && styles.idealForLabelSelected
              ]}>
                Ideal para:
              </Text>
              <Text style={[
                styles.idealForText,
                isSelected && styles.idealForTextSelected
              ]}>
                {service.idealFor}
              </Text>
            </View>

            {/* Indicador de expansión */}
            <View style={styles.expandIndicator}>
              <Ionicons
                name={isSelected ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={isSelected ? '#fff' : '#999'}
              />
              <Text style={[
                styles.expandText,
                isSelected && styles.expandTextSelected
              ]}>
                {isSelected ? 'Ver menos' : 'Ver dirección de envío'}
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Panel expandido con dirección */}
        {isSelected && (
          <Animated.View style={styles.expandedPanel}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={service.color} />
                <Text style={styles.loadingText}>Cargando información...</Text>
              </View>
            ) : serviceInfo ? (
              <>
                {/* Dirección de envío */}
                {serviceInfo.addresses.map((addr, idx) => (
                  <Surface key={idx} style={styles.addressCard}>
                    <View style={styles.addressHeader}>
                      <Ionicons name="location" size={24} color={service.color} />
                      <View style={styles.addressHeaderText}>
                        <Text style={styles.addressTitle}>📍 Tu Dirección de Envío</Text>
                        <Text style={styles.addressSubtitle}>
                          Personalizada con tu número de cliente
                        </Text>
                      </View>
                    </View>

                    <View style={styles.addressContent}>
                      <Text style={styles.addressText}>
                        {generatePersonalizedAddress(addr, service)}
                      </Text>
                    </View>

                    {/* Botones de acción */}
                    <View style={styles.addressActions}>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: service.color }]}
                        onPress={() => handleCopy(generatePersonalizedAddress(addr, service), 'address')}
                      >
                        <Ionicons
                          name={copiedField === 'address' ? 'checkmark' : 'copy'}
                          size={18}
                          color="#fff"
                        />
                        <Text style={styles.actionButtonText}>
                          {copiedField === 'address' ? '¡Copiado!' : 'Copiar Dirección'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionButtonOutline, { borderColor: service.color }]}
                        onPress={() => handleShare(addr, service)}
                      >
                        <Ionicons name="share-social" size={18} color={service.color} />
                        <Text style={[styles.actionButtonOutlineText, { color: service.color }]}>
                          Compartir
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Horario de atención */}
                    {addr.business_hours && (
                      <View style={styles.businessHours}>
                        <Ionicons name="time" size={16} color="#666" />
                        <Text style={styles.businessHoursText}>{addr.business_hours}</Text>
                      </View>
                    )}
                  </Surface>
                ))}

                {/* Instrucciones de empaque */}
                {serviceInfo.instructions?.packaging_instructions && (
                  <Surface style={styles.instructionsCard}>
                    <View style={styles.instructionsHeader}>
                      <Ionicons name="cube" size={20} color={service.color} />
                      <Text style={styles.instructionsTitle}>📦 Instrucciones de Empaque</Text>
                    </View>
                    <Text style={styles.instructionsText}>
                      {serviceInfo.instructions.packaging_instructions}
                    </Text>
                  </Surface>
                )}

                {/* Instrucciones de envío */}
                {serviceInfo.instructions?.shipping_instructions && (
                  <Surface style={styles.instructionsCard}>
                    <View style={styles.instructionsHeader}>
                      <Ionicons name="send" size={20} color={service.color} />
                      <Text style={styles.instructionsTitle}>🚚 Instrucciones de Envío</Text>
                    </View>
                    <Text style={styles.instructionsText}>
                      {serviceInfo.instructions.shipping_instructions}
                    </Text>
                  </Surface>
                )}

                {/* Notas generales */}
                {serviceInfo.instructions?.general_notes && (
                  <Surface style={styles.instructionsCard}>
                    <View style={styles.instructionsHeader}>
                      <Ionicons name="information-circle" size={20} color="#ff9800" />
                      <Text style={styles.instructionsTitle}>⚠️ Notas Importantes</Text>
                    </View>
                    <Text style={styles.instructionsText}>
                      {serviceInfo.instructions.general_notes}
                    </Text>
                  </Surface>
                )}

                {/* Botón Continuar - cierra la sección y permite seguir leyendo */}
                <TouchableOpacity
                  style={[styles.ctaButton, { backgroundColor: service.color }]}
                  onPress={() => {
                    // Cerrar la dirección de envío (colapsar el servicio)
                    setSelectedService(null);
                    setServiceInfo(null);
                    // Scroll hacia arriba
                    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                  }}
                >
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  <Text style={styles.ctaButtonText}>
                    Continuar
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </Animated.View>
        )}
      </Animated.View>
    );
  };

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />

      {/* Header */}
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
        <Appbar.Content
          title="Nuestros Servicios"
          titleStyle={styles.headerTitle}
          subtitle="Elige cómo quieres importar"
          subtitleStyle={styles.headerSubtitle}
        />
      </Appbar.Header>

      {/* Contenido */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <LinearGradient
          colors={[ORANGE, '#FF8A50']}
          style={styles.heroSection}
        >
          <Ionicons name="globe" size={40} color="rgba(255,255,255,0.3)" style={styles.heroIcon} />
          <Text style={styles.heroTitle}>Envia desde China o USA a Mexico</Text>
          <Text style={styles.heroSubtitle}>
            Tu número de cliente: <Text style={styles.heroBoxId}>{user.boxId || 'S-XXX'}</Text>
          </Text>
          <Text style={styles.heroDescription}>
            Selecciona un servicio para ver tu dirección personalizada y las instrucciones de envío
          </Text>
        </LinearGradient>

        {/* Tarjetas de servicios */}
        <View style={styles.servicesContainer}>
          {SERVICES.map((service, index) => renderServiceCard(service, index))}
        </View>

        {/* Footer motivacional */}
        <View style={styles.footer}>
          <Text style={styles.footerTitle}>💡 ¿No sabes cuál elegir?</Text>
          <Text style={styles.footerText}>
            Contacta a tu asesor y te ayudamos a encontrar la mejor opción para tu negocio.
          </Text>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={() => navigation.navigate('RequestAdvisor', { user, token })}
          >
            <Ionicons name="headset" size={20} color={ORANGE} />
            <Text style={styles.footerButtonText}>Solicitar Asesoría</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================
// ESTILOS
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: BLACK,
    elevation: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },

  // Hero Section
  heroSection: {
    padding: 24,
    paddingTop: 30,
    paddingBottom: 30,
    position: 'relative',
    overflow: 'hidden',
  },
  heroIcon: {
    position: 'absolute',
    right: 20,
    top: 20,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
  },
  heroBoxId: {
    fontWeight: 'bold',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  heroDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
  },

  // Services Container
  servicesContainer: {
    padding: 16,
  },

  // Service Card
  serviceCardContainer: {
    marginBottom: 16,
  },
  serviceCard: {
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  serviceCardSelected: {
    elevation: 6,
  },
  serviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  serviceCardTitleContainer: {
    flex: 1,
  },
  serviceCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  serviceCardTitleSelected: {
    color: '#fff',
  },
  serviceCardTagline: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  serviceCardTaglineSelected: {
    color: 'rgba(255,255,255,0.9)',
  },
  timeframeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  timeframeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Benefits
  benefitsContainer: {
    marginBottom: 12,
  },
  benefitText: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4,
  },
  benefitTextSelected: {
    color: 'rgba(255,255,255,0.95)',
  },

  // Ideal For
  idealForContainer: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  idealForLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    marginBottom: 2,
  },
  idealForLabelSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  idealForText: {
    fontSize: 12,
    color: '#555',
  },
  idealForTextSelected: {
    color: '#fff',
  },

  // Expand Indicator
  expandIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    gap: 6,
  },
  expandText: {
    fontSize: 12,
    color: '#999',
  },
  expandTextSelected: {
    color: 'rgba(255,255,255,0.8)',
  },

  // Expanded Panel
  expandedPanel: {
    marginTop: 12,
    paddingHorizontal: 4,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },

  // Address Card
  addressCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  addressHeaderText: {
    flex: 1,
  },
  addressTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  addressSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  addressContent: {
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
  },
  addressText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  addressActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    gap: 8,
  },
  actionButtonOutlineText: {
    fontWeight: '600',
    fontSize: 14,
  },
  businessHours: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 6,
  },
  businessHoursText: {
    fontSize: 12,
    color: '#666',
  },

  // Instructions Card
  instructionsCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 1,
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  instructionsTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  instructionsText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },

  // CTA Button
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 10,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Footer
  footer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#fff',
    marginTop: 8,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: ORANGE,
  },
  footerButtonText: {
    color: ORANGE,
    fontWeight: '600',
  },
});
