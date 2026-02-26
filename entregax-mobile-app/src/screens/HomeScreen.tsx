import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  StatusBar,
  Pressable,
  Alert,
  Modal,
  TouchableOpacity,
  Image,
} from 'react-native';
import {
  Text,
  Card,
  Chip,
  FAB,
  Appbar,
  ActivityIndicator,
  Surface,
  Avatar,
  Icon,
  Divider,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { getMyPackagesApi, Package } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { changeLanguage, getCurrentLanguage } from '../i18n';
import OpportunityCarousel, { Opportunity } from '../components/OpportunityCarousel';

// Colores de marca
const ORANGE = '#F05A28';
const BLACK = '#111111';

// Colores de estado
const STATUS_COLORS: Record<string, string> = {
  // Aéreos (USA)
  received: '#2196F3',      // Azul - Recibido en casillero
  in_transit: '#F05A28',    // Naranja - En tránsito
  processing: '#9C27B0',    // Morado - Procesando envío
  shipped: '#00BCD4',       // Cyan - Vuelo confirmado
  delivered: '#4CAF50',     // Verde - Entregado
  pending: '#FFC107',       // Amarillo - Pendiente
  // Marítimos (China)
  received_china: '#1976D2', // Azul oscuro - Recibido en China
  at_port: '#0277BD',        // Azul puerto
  customs_mx: '#7B1FA2',     // Morado aduana
  in_transit_mx: '#E65100',  // Naranja ruta
  received_cedis: '#388E3C', // Verde CEDIS
  ready_pickup: '#00796B',   // Teal listo
  // ✈️🇨🇳 TDI Aéreo China
  received_origin: '#1976D2', // Azul oscuro - En Bodega China
  at_customs: '#7B1FA2',      // Morado aduana
};

// STATUS_LABELS se define dentro del componente usando t()

type RootStackParamList = {
  Login: undefined;
  Home: { user: any; token: string };
  ConsolidationSummary: { selectedIds: number[]; packages: Package[]; token: string; user: any };
  Payment: { consolidationId: number; weight: number; token: string; user: any };
  MyAddresses: { user: any; token: string };
  MyPaymentMethods: { user: any; token: string };
  MyProfile: { user: any; token: string };
  GEXContract: { package: Package; user: any; token: string };
  RequestAdvisor: { user: any; token: string };
  SupportChat: { user: any; token: string };
  Notifications: { user: any; token: string };
  DeliveryInstructions: { package: Package; packages?: Package[]; user: any; token: string };
  MaritimeDetail: { package: Package; user: any; token: string };
  EmployeeOnboarding: { user: any; token: string };
  // Pantallas del Repartidor
  DriverHome: { user: any; token: string };
  LoadingVan: { user: any; token: string };
  ReturnScan: { user: any; token: string };
  DeliveryConfirm: { user: any; token: string };
  VehicleInspection: { user: any; token: string };
};

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
  route: RouteProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation, route }: HomeScreenProps) {
  const { t } = useTranslation();
  const { user: initialUser, token } = route.params;
  const [user, setUser] = useState(initialUser); // Estado local para actualizar usuario
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]); // 🔥 IDs seleccionados
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // 📱 Menú de opciones
  const [showLanguageModal, setShowLanguageModal] = useState(false); // 🌐 Modal de idioma
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());
  const [serviceFilter, setServiceFilter] = useState<'air' | 'maritime' | 'dhl' | 'usa' | null>(null); // 🎯 Filtro de servicio (null = todos)

  // 🔐 Verificar si el usuario está verificado
  const isUserVerified = user.isVerified === true;
  const verificationStatus = user.verificationStatus || 'not_started';
  const isPendingReview = verificationStatus === 'pending_review';

  // 👷 Detectar si es empleado (no requiere verificación de cliente)
  const employeeRoles = ['repartidor', 'warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager', 'admin', 'super_admin'];
  const isEmployee = employeeRoles.includes(user.role);
  const isEmployeeOnboarded = user.isEmployeeOnboarded === true;
  
  // Los empleados no necesitan verificación de cliente, solo onboarding de empleado
  // Si ya completó el onboarding pero está en verificación pendiente, no mostrar banner de alta
  const needsEmployeeOnboarding = isEmployee && !isEmployeeOnboarded;
  const employeePendingVerification = isEmployee && isEmployeeOnboarded && verificationStatus === 'pending_review';
  const employeeVerified = isEmployee && isEmployeeOnboarded && (verificationStatus === 'verified' || isUserVerified);

  // 📦 Función para obtener el label de status traducido
  const getStatusLabel = (status: string, shipmentType?: string): string => {
    // Si es marítimo, usar labels específicos
    if (shipmentType === 'maritime') {
      const maritimeLabels: Record<string, string> = {
        received_china: '📦 Recibido en China',
        in_transit: '🚢 Ya Zarpó',
        at_port: '⚓ En Puerto',
        customs_mx: '🛃 Aduana México',
        in_transit_mx: '🚛 En Ruta a CEDIS',
        received_cedis: '✅ En CEDIS',
        ready_pickup: '📍 Listo para Recoger',
        delivered: '✅ Entregado',
      };
      return maritimeLabels[status] || status;
    }
    
    // ✈️🇨🇳 Labels para TDI Aéreo China
    if (shipmentType === 'china_air') {
      const chinaAirLabels: Record<string, string> = {
        received_origin: '📦 En Bodega China',
        in_transit: '✈️ En Tránsito',
        at_customs: '🛃 En Aduana',
        customs_mx: '🛃 Aduana México',
        in_transit_mx: '🚛 En Ruta a CEDIS',
        received_cedis: '✅ En CEDIS',
        ready_pickup: '📍 Listo para Recoger',
        delivered: '✅ Entregado',
      };
      return chinaAirLabels[status] || status;
    }
    
    // 🚚 Labels para DHL Express
    if (shipmentType === 'dhl') {
      const dhlLabels: Record<string, string> = {
        received_mty: '📦 Cedis MTY',
        in_transit: '🚚 En Tránsito',
        out_for_delivery: '🚛 En Reparto',
        delivered: '✅ Entregado',
      };
      return dhlLabels[status] || status;
    }
    
    // Labels para aéreo (USA)
    const statusLabels: Record<string, string> = {
      received: t('status.inWarehouse'),
      in_transit: t('status.inTransit'),
      processing: `📋 ${t('status.processing')}`,
      shipped: `✈️ ${t('status.shipped')}`,
      delivered: t('status.delivered'),
      pending: t('status.pending'),
    };
    return statusLabels[status] || status;
  };

  const fetchPackages = useCallback(async () => {
    try {
      const data = await getMyPackagesApi(user.id, token);
      setPackages(data);
    } catch (error) {
      console.error('Error fetching packages:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id, token]);

  // 🔄 Función para actualizar datos del usuario desde el servidor
  const refreshUserData = useCallback(async () => {
    try {
      const response = await fetch(`http://192.168.1.114:3001/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(prev => ({
          ...prev,
          isVerified: data.is_verified,
          verificationStatus: data.verification_status,
          isEmployeeOnboarded: data.is_employee_onboarded,
        }));
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // 🔄 Refrescar al volver a la pantalla (después de contratar GEX o completar onboarding)
  useFocusEffect(
    useCallback(() => {
      fetchPackages();
      refreshUserData(); // Actualizar datos del usuario
    }, [fetchPackages, refreshUserData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedIds([]); // Limpiar selección al refrescar
    fetchPackages();
  };

  const handleLogout = () => {
    navigation.replace('Login');
  };

  // 🌐 Cambiar idioma
  const handleChangeLanguage = async (lang: string) => {
    await changeLanguage(lang);
    setCurrentLang(lang);
    setShowLanguageModal(false);
  };

  // 🔥 Lógica de Selección (Toggle) - Solo si está verificado (o empleado onboarded)
  // No permite mezclar paquetes de diferentes tipos de envío
  const toggleSelection = (id: number, shipmentType: string | undefined) => {
    // Los empleados que completaron onboarding pueden operar sin verificación de cliente
    const canOperate = isEmployee ? isEmployeeOnboarded : isUserVerified;
    
    if (!canOperate) {
      if (needsEmployeeOnboarding) {
        Alert.alert(
          '👷 Alta de Empleado Requerida',
          'Necesitas completar tu alta como empleado para continuar.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { 
              text: 'Completar Alta', 
              onPress: () => navigation.navigate('EmployeeOnboarding', { user, token })
            }
          ]
        );
      } else {
        Alert.alert(
          isPendingReview ? `⏳ ${t('home.profileInReview')}` : `⚠️ ${t('home.verificationRequired')}`,
          isPendingReview 
            ? t('home.profileInReviewMsg')
            : t('home.verificationRequiredMsg'),
          [{ text: t('home.understood'), style: 'default' }]
        );
      }
      return;
    }
    
    // Si ya está seleccionado, deseleccionar
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(itemId => itemId !== id));
      return;
    }
    
    // Si ya hay paquetes seleccionados, verificar que sean del mismo tipo de envío
    if (selectedIds.length > 0) {
      const firstSelectedPkg = packages.find(p => selectedIds.includes(p.id));
      const firstShipmentType = (firstSelectedPkg as any)?.shipment_type || 'air';
      const currentShipmentType = shipmentType || 'air';
      
      // Agrupar tipos: USA (air, undefined) vs Maritime vs China Air vs DHL
      const getTypeGroup = (type: string | undefined) => {
        if (!type || type === 'air') return 'usa';
        return type; // 'maritime', 'china_air', 'dhl'
      };
      
      const firstGroup = getTypeGroup(firstShipmentType);
      const currentGroup = getTypeGroup(currentShipmentType);
      
      if (firstGroup !== currentGroup) {
        const typeNames: Record<string, string> = {
          'usa': 'USA',
          'maritime': 'Marítimos',
          'china_air': 'TDI Aéreo China',
          'dhl': 'DHL'
        };
        Alert.alert(
          '⚠️ No puedes mezclar envíos',
          `Ya tienes paquetes ${typeNames[firstGroup]} seleccionados. Deselecciónalos primero para seleccionar paquetes ${typeNames[currentGroup]}.`,
          [{ text: 'Entendido', style: 'default' }]
        );
        return;
      }
    }
    
    setSelectedIds([...selectedIds, id]);
  };

  // 🔥 Navegar a Consolidación - Solo si está verificado
  const handleConsolidate = () => {
    if (!isUserVerified) {
      Alert.alert(
        `🔒 ${t('home.actionNotAllowed')}`,
        t('home.actionNotAllowedMsg'),
        [{ text: t('home.understood'), style: 'default' }]
      );
      return;
    }
    
    const selectedPackages = packages.filter(p => selectedIds.includes(p.id));
    navigation.navigate('ConsolidationSummary', {
      selectedIds,
      packages: selectedPackages,
      token,
      user, // 🔥 Pasamos el usuario para crear la consolidación
    });
  };

  // 🚢 Navegar a Instrucciones Marítimas (múltiples paquetes)
  const handleMaritimeInstructions = () => {
    if (!isUserVerified) {
      Alert.alert(
        `🔒 ${t('home.actionNotAllowed')}`,
        t('home.actionNotAllowedMsg'),
        [{ text: t('home.understood'), style: 'default' }]
      );
      return;
    }
    
    const selectedPackages = packages.filter(p => selectedIds.includes(p.id));
    
    // Navegar directamente a la pantalla de instrucciones con todos los paquetes
    navigation.navigate('DeliveryInstructions', {
      package: selectedPackages[0],
      packages: selectedPackages,
      user,
      token,
    });
  };

  const renderPackageCard = ({ item }: { item: Package }) => {
    const statusColor = STATUS_COLORS[item.status] || '#999';
    // Usar statusLabel traducido - pasar shipment_type para diferenciar marítimo
    const statusLabel = getStatusLabel(item.status, item.shipment_type);
    
    // Es paquete marítimo?
    const isMaritime = item.shipment_type === 'maritime';
    
    // ✈️🇨🇳 Es paquete TDI Aéreo China?
    const isChinaAir = item.shipment_type === 'china_air';
    
    // 🚚 Es paquete DHL Express?
    const isDHL = item.shipment_type === 'dhl';
    
    // ¿Ya tiene instrucciones de entrega asignadas?
    const hasDeliveryInstructions = !!(item as any).delivery_address_id;
    
    // Solo permitimos seleccionar paquetes en bodega (USA) o recibidos en China (marítimo/china_air) o DHL en Cedis Y usuario verificado
    // Para marítimos/china_air/dhl: NO seleccionable si ya tiene instrucciones asignadas
    const isSelectable = isUserVerified && (
      (!isMaritime && !isChinaAir && !isDHL && item.status === 'received') || 
      (isMaritime && ['received_china', 'in_transit', 'at_port'].includes(item.status) && !hasDeliveryInstructions) ||
      (isChinaAir && ['received_origin', 'in_transit', 'at_customs'].includes(item.status) && !hasDeliveryInstructions) ||
      (isDHL && ['received_mty'].includes(item.status) && !hasDeliveryInstructions)
    );
    const isSelected = selectedIds.includes(item.id);
    
    // Paquete ya fue despachado (vuelo confirmado)
    const isShipped = item.status === 'shipped' || item.consolidation_status === 'shipped';
    
    // 🛡️ Mostrar botón GEX - siempre visible para paquetes elegibles
    // Si ya tiene GEX, mostrar botón verde
    // Marítimo: si está recibido en China (antes de zarpar) o si ya tiene GEX
    // Aéreo USA: si está en bodega o procesando
    // ✈️🇨🇳 China Air: si está en bodega China (received_origin)
    const canContractGEX = item.has_gex || (isMaritime 
      ? (item.status === 'received_china') // Marítimo: puede contratar antes de zarpar
      : isChinaAir
        ? (item.status === 'received_origin') // ✈️🇨🇳 China Air: puede contratar en bodega China
        : (['received', 'processing'].includes(item.status) && 
           item.consolidation_status !== 'in_transit' &&
           item.consolidation_status !== 'shipped'));

    const handlePress = () => {
      // Si es marítimo, china_air o DHL con instrucciones asignadas, navegar a detalle del embarque
      if ((isMaritime || isChinaAir || isDHL) && hasDeliveryInstructions) {
        navigation.navigate('MaritimeDetail', {
          package: item,
          user,
          token,
        });
        return;
      }
      if (isSelectable) {
        toggleSelection(item.id, item.shipment_type);
      }
    };
    
    // 🛡️ Navegar a contratar GEX
    const handleContractGEX = () => {
      navigation.navigate('GEXContract', {
        package: item,
        user,
        token,
      });
    };

    // 🚢✈️🚚 Navegar a instrucciones de entrega (marítimo, china_air y DHL)
    const handleDeliveryInstructions = () => {
      navigation.navigate('DeliveryInstructions', {
        package: item,
        user,
        token,
      });
    };

    // 🚢✈️🚚 Mostrar botón de instrucciones para paquetes marítimos, china_air y DHL (solo cuando está seleccionado)
    // Solo mostrar si NO ha asignado dirección todavía
    const canAssignDelivery = isSelected && (isMaritime || isChinaAir || isDHL) && 
      (isMaritime 
        ? ['received_china', 'in_transit', 'at_port'].includes(item.status)
        : isChinaAir 
          ? ['received_origin', 'in_transit', 'at_customs'].includes(item.status)
          : ['received_mty'].includes(item.status)) &&
      !(item as any).delivery_address_id;

    return (
      <Pressable 
        onPress={handlePress}
        style={({ pressed }) => [
          { opacity: pressed && isSelectable ? 0.7 : 1 }
        ]}
      >
        <Card 
          style={[
            styles.card, 
            isSelected && styles.cardSelected,
            isShipped && styles.cardShipped // Estilo especial para despachados
          ]} 
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.cardRow}>
              <View style={styles.cardMainContent}>
                {/* Header del paquete */}
                <View style={styles.cardHeader}>
                  <View style={styles.trackingContainer}>
                    <Text style={styles.description} numberOfLines={1}>
                      {item.description || t('home.package')}
                    </Text>
                    <Text style={styles.trackingNumber}>TRN: {item.tracking_internal}</Text>
                  </View>
                  
                  {/* 🔲 Checkbox para paquetes seleccionables (esquina superior derecha) */}
                  {isSelectable && (
                    <Pressable 
                      style={[
                        styles.packageCheckbox,
                        isSelected && styles.packageCheckboxSelected
                      ]}
                      onPress={() => toggleSelection(item.id, isMaritime)}
                    >
                      <Icon 
                        source={isSelected ? "checkbox-marked" : "checkbox-blank-outline"} 
                        size={24} 
                        color={isSelected ? ORANGE : '#999'} 
                      />
                    </Pressable>
                  )}
                </View>
                
                {/* Chip de Estado */}
                <View style={styles.statusRow}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                    <Icon 
                      source={
                        isMaritime ? (
                          item.status === 'in_transit' ? 'ferry' :
                          item.status === 'received_china' ? 'package-variant' :
                          item.status === 'at_port' ? 'anchor' :
                          item.status === 'delivered' ? 'check-circle' : 'ferry'
                        ) : isChinaAir ? (
                          // ✈️🇨🇳 Íconos para TDI Aéreo China
                          item.status === 'received_origin' ? 'package-variant' :
                          item.status === 'in_transit' ? 'airplane' :
                          item.status === 'at_customs' ? 'shield-lock' :
                          item.status === 'customs_mx' ? 'shield-lock' :
                          item.status === 'delivered' ? 'check-circle' : 'airplane'
                        ) : (
                          item.status === 'in_transit' ? 'airplane' : 
                          item.status === 'received' ? 'package-variant' :
                          item.status === 'shipped' ? 'airplane-takeoff' :
                          item.status === 'delivered' ? 'check-circle' :
                          item.status === 'processing' ? 'clipboard-text' : 'package-variant'
                        )
                      } 
                      size={12} 
                      color={statusColor} 
                    />
                    <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                  
                  {/* 🛡️ Badge de Garantía Extendida */}
                  {item.has_gex && (
                    <View style={styles.gexBadge}>
                      <Icon source="shield-check" size={12} color="#10B981" />
                      <Text style={styles.gexBadgeText}>{t('home.extendedWarranty')}</Text>
                    </View>
                  )}
                  
                  {/* ✅ Badge de Instrucciones Asignadas (Marítimo, China Air y DHL) */}
                  {(isMaritime || isChinaAir || isDHL) && hasDeliveryInstructions && (
                    <Pressable 
                      style={styles.deliveryAssignedBadge}
                      onPress={handleDeliveryInstructions}
                    >
                      <Icon source="check-circle" size={12} color="#10B981" />
                      <Text style={styles.deliveryAssignedText}>✓ Instrucciones</Text>
                      <Icon source="pencil" size={10} color="#10B981" />
                    </Pressable>
                  )}
                </View>

                {/* Información adicional - diseño simétrico */}
                <View style={styles.infoRow}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoIcon}>⚖️</Text>
                    <Text style={styles.infoText}>{item.weight ? `${item.weight} kg` : '--'}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoIcon}>{isMaritime || isChinaAir || isDHL ? '📦' : '📏'}</Text>
                    <Text style={styles.infoText}>
                      {isMaritime || isChinaAir || isDHL
                        ? ((item as any).volume ? `${(item as any).volume} m³` : (item.dimensions || '--'))
                        : (item.dimensions || '--')}
                    </Text>
                  </View>
                  {item.carrier && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoIcon}>{isMaritime ? '🚢' : isChinaAir ? '✈️' : isDHL ? '🚚' : '🚚'}</Text>
                      <Text style={styles.infoText}>{item.carrier}</Text>
                    </View>
                  )}
                </View>

                {/* 💳 Botón de Pago (solo si está despachado) */}
                {isShipped && item.consolidation_id && (
                  <View style={styles.payButtonContainer}>
                    <Pressable
                      style={styles.payButton}
                      onPress={() => navigation.navigate('Payment', {
                        consolidationId: item.consolidation_id!,
                        weight: item.weight || 0,
                        token,
                        user
                      })}
                    >
                      <Icon source="credit-card" size={18} color="#fff" />
                      <Text style={styles.payButtonText}>{t('home.payFreight')}</Text>
                    </Pressable>
                  </View>
                )}

                {/* 🛡️ Botón de Garantía Extendida (siempre visible para paquetes elegibles) */}
                {canContractGEX && (
                  <View style={styles.gexButtonContainer}>
                    <Pressable
                      style={item.has_gex ? styles.gexButton : styles.gexButtonUnprotected}
                      onPress={item.has_gex ? undefined : handleContractGEX}
                      disabled={item.has_gex}
                    >
                      <Icon source={item.has_gex ? "shield-check" : "shield-off"} size={16} color="#fff" />
                      <Text style={styles.gexButtonText}>
                        {item.has_gex ? t('home.withExtendedWarranty') : t('home.withoutExtendedWarranty')}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </Card.Content>
        </Card>
      </Pressable>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>📭</Text>
      <Text style={styles.emptyTitle}>{t('home.noPackages')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('home.noPackagesDesc')}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={styles.loadingText}>{t('home.loadingPackages')}</Text>
      </View>
    );
  }

  // Contar paquetes en bodega (seleccionables)
  const packagesInWarehouse = packages.filter(p => p.status === 'received').length;

  // Bandera del idioma actual
  const getLanguageFlag = (lang: string) => {
    switch (lang) {
      case 'es': return '🇲🇽';
      case 'en': return '🇺🇸';
      case 'zh': return '🇨🇳';
      default: return '🌐';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      
      {/* Appbar */}
      <Appbar.Header style={styles.appbar}>
        <View style={{ paddingLeft: 16, justifyContent: 'center' }}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={{ width: 120, height: 36, resizeMode: 'contain' }}
          />
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity 
          onPress={() => setShowLanguageModal(true)}
          style={styles.languageButton}
        >
          <Text style={styles.languageFlag}>{getLanguageFlag(currentLang)}</Text>
        </TouchableOpacity>
        <Appbar.Action 
          icon="bell-outline" 
          onPress={() => navigation.navigate('Notifications', { user, token })} 
          color="white" 
        />
        <Appbar.Action icon="menu" onPress={() => setShowMenu(true)} color="white" />
      </Appbar.Header>

      {/* 🌐 Modal de Idioma */}
      <Modal visible={showLanguageModal} animationType="fade" transparent>
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setShowLanguageModal(false)}
        >
          <View style={styles.languageModalContainer}>
            <Text style={styles.languageModalTitle}>{t('profile.selectLanguage')}</Text>
            <Divider style={{ marginVertical: 10 }} />
            
            <TouchableOpacity 
              style={[styles.languageOption, currentLang === 'es' && styles.languageOptionActive]}
              onPress={() => handleChangeLanguage('es')}
            >
              <Text style={styles.languageOptionFlag}>🇲🇽</Text>
              <Text style={[styles.languageOptionText, currentLang === 'es' && styles.languageOptionTextActive]}>
                Español
              </Text>
              {currentLang === 'es' && <Ionicons name="checkmark" size={20} color={ORANGE} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.languageOption, currentLang === 'en' && styles.languageOptionActive]}
              onPress={() => handleChangeLanguage('en')}
            >
              <Text style={styles.languageOptionFlag}>🇺🇸</Text>
              <Text style={[styles.languageOptionText, currentLang === 'en' && styles.languageOptionTextActive]}>
                English
              </Text>
              {currentLang === 'en' && <Ionicons name="checkmark" size={20} color={ORANGE} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.languageOption, currentLang === 'zh' && styles.languageOptionActive]}
              onPress={() => handleChangeLanguage('zh')}
            >
              <Text style={styles.languageOptionFlag}>🇨🇳</Text>
              <Text style={[styles.languageOptionText, currentLang === 'zh' && styles.languageOptionTextActive]}>
                中文
              </Text>
              {currentLang === 'zh' && <Ionicons name="checkmark" size={20} color={ORANGE} />}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 📱 Modal de Menú */}
      <Modal visible={showMenu} animationType="fade" transparent>
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Avatar.Text 
                size={40} 
                label={user.name?.charAt(0) || 'U'} 
                style={{ backgroundColor: ORANGE }}
              />
              <View style={styles.menuUserInfo}>
                <Text style={styles.menuUserName}>{user.name}</Text>
                <Text style={styles.menuUserEmail}>{user.email}</Text>
              </View>
            </View>
            <Divider />
            
            {/* Opciones solo para clientes */}
            {!isEmployee && (
            <>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyAddresses', { user, token });
              }}
            >
              <Ionicons name="location-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>{t('profile.myAddresses')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyPaymentMethods', { user, token });
              }}
            >
              <Ionicons name="wallet-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>{t('profile.myPaymentMethods')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyPayments' as any, { user, token });
              }}
            >
              <Ionicons name="receipt-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>Mis Cuentas por Pagar</Text>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
            </>
            )}

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyProfile', { user, token });
              }}
            >
              <Ionicons name="person-circle-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>{t('profile.title')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            {/* Opciones solo para clientes */}
            {!isEmployee && (
            <>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('RequestAdvisor', { user, token });
              }}
            >
              <Ionicons name="people-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>{t('profile.requestAdvisor')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('SupportChat', { user, token });
              }}
            >
              <Ionicons name="chatbubbles-outline" size={24} color="#2196F3" />
              <Text style={[styles.menuItemText, { color: '#2196F3' }]}>{t('profile.helpCenter')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
            </>
            )}

            <Divider style={{ marginVertical: 8 }} />

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                handleLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={24} color="#f44336" />
              <Text style={[styles.menuItemText, { color: '#f44336' }]}>{t('profile.logout')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header con información del usuario */}
      <Surface style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Avatar.Text 
            size={50} 
            label={user.name?.charAt(0) || 'U'} 
            style={{ backgroundColor: ORANGE }}
          />
          <View style={styles.userTextContainer}>
            <Text style={styles.greeting}>{t('home.greeting')}, {user.name?.split(' ')[0]}!</Text>
            <Text style={styles.boxId}>📦 {t('home.mailbox')}: {user.boxId}</Text>
          </View>
          {/* 🚀 Botón de Solicitar Envío */}
          <TouchableOpacity
            style={styles.requestShipmentButton}
            onPress={() => {
              if (selectedIds.length > 0) {
                handleConsolidate();
              } else {
                Alert.alert(
                  '📦 Solicitar Envío',
                  'Selecciona uno o más paquetes de tu bodega para solicitar su envío.',
                  [{ text: 'Entendido', style: 'default' }]
                );
              }
            }}
          >
            <Ionicons name="airplane" size={18} color="white" />
            <Text style={styles.requestShipmentText}>Enviar</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{packages.length}</Text>
            <Text style={styles.statLabel}>{t('home.packages')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{packagesInWarehouse}</Text>
            <Text style={styles.statLabel}>{t('home.inWarehouse')}</Text>
          </View>
        </View>
      </Surface>

      {/* 👷 Banner de onboarding de empleado pendiente */}
      {needsEmployeeOnboarding && (
        <TouchableOpacity 
          style={[styles.verificationBanner, styles.employeeBanner]}
          onPress={() => navigation.navigate('EmployeeOnboarding', { user, token })}
        >
          <Icon source="account-hard-hat" size={20} color="#1976D2" />
          <View style={styles.verificationBannerText}>
            <Text style={[styles.verificationTitle, { color: "#0D47A1" }]}>
              👷 Alta de Empleado Requerida
            </Text>
            <Text style={styles.verificationSubtitle}>
              Completa tu registro como empleado para comenzar a trabajar
            </Text>
          </View>
          <Icon source="chevron-right" size={24} color="#1976D2" />
        </TouchableOpacity>
      )}

      {/* ⏳ Banner de verificación pendiente para empleados */}
      {employeePendingVerification && (
        <View style={[styles.verificationBanner, styles.pendingBanner]}>
          <Icon source="clock-outline" size={20} color="#ff9800" />
          <View style={styles.verificationBannerText}>
            <Text style={[styles.verificationTitle, { color: "#e65100" }]}>
              ⏳ Verificación en Proceso
            </Text>
            <Text style={styles.verificationSubtitle}>
              Tu expediente está siendo revisado. Te notificaremos cuando sea aprobado.
            </Text>
          </View>
        </View>
      )}

      {/* � Banner de Módulo Repartidor - Solo para repartidores verificados */}
      {user.role === 'repartidor' && employeeVerified && (
        <TouchableOpacity 
          style={styles.driverModuleBanner}
          onPress={() => navigation.navigate('DriverHome', { user, token })}
        >
          <View style={styles.driverModuleIcon}>
            <Ionicons name="car" size={32} color="#fff" />
          </View>
          <View style={styles.driverModuleContent}>
            <Text style={styles.driverModuleTitle}>🚚 Módulo de Reparto</Text>
            <Text style={styles.driverModuleSubtitle}>
              Carga tu unidad, confirma entregas y gestiona tu ruta
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* �🔐 Banner de verificación pendiente (solo para clientes) */}
      {!isEmployee && !isUserVerified && (
        <View style={[styles.verificationBanner, isPendingReview ? styles.pendingBanner : styles.warningBanner]}>
          <Icon source={isPendingReview ? "clock-outline" : "alert-circle"} size={20} color={isPendingReview ? "#ff9800" : "#f44336"} />
          <View style={styles.verificationBannerText}>
            <Text style={[styles.verificationTitle, { color: isPendingReview ? "#e65100" : "#c62828" }]}>
              {isPendingReview ? `⏳ ${t('home.profileInReview')}` : `⚠️ ${t('home.verificationRequired')}`}
            </Text>
            <Text style={styles.verificationSubtitle}>
              {isPendingReview 
                ? t('home.profileInReviewMsg')
                : t('home.verificationRequiredMsg')}
            </Text>
          </View>
        </View>
      )}

      {/* 🚫 Banner de cuenta bloqueada por adeudo */}
      {user.isCreditBlocked && (
        <View style={styles.blockedBanner}>
          <Icon source="alert-octagon" size={24} color="#fff" />
          <View style={styles.blockedBannerText}>
            <Text style={styles.blockedTitle}>🚫 Cuenta Suspendida</Text>
            <Text style={styles.blockedSubtitle}>
              Tu cuenta está bloqueada por adeudo vencido de ${(user.usedCredit || 0).toLocaleString('es-MX')} MXN.
            </Text>
            <Text style={styles.blockedCta}>
              Deposita a tu CLABE: {user.virtualClabe || 'Solicita tu CLABE'}
            </Text>
          </View>
        </View>
      )}

      {/* Lista de paquetes con Carrusel y Filtros en el Header */}
      <FlatList
        data={packages.filter(pkg => {
          if (serviceFilter === null) return true;
          // Aéreo: TDI China Air
          if (serviceFilter === 'air') return pkg.shipment_type === 'china_air';
          if (serviceFilter === 'maritime') return pkg.shipment_type === 'maritime';
          // DHL: Solo paquetes DHL Monterrey
          if (serviceFilter === 'dhl') return pkg.shipment_type === 'dhl';
          // PO Box: Solo paquetes USA (sin shipment_type o 'air')
          if (serviceFilter === 'usa') return !pkg.shipment_type || pkg.shipment_type === 'air';
          return true;
        })}
        renderItem={renderPackageCard}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[ORANGE]}
            tintColor={ORANGE}
          />
        }
        ListHeaderComponent={
          <>
            {/* 🎯 OPPORTUNITY CAROUSEL - "El Punto Caliente" - Solo para clientes */}
            {!isEmployee && (
              <OpportunityCarousel 
                onOpportunityPress={(opportunity) => {
                  // Manejar navegación basada en ctaAction
                  const action = opportunity.ctaAction;
                  if (action.startsWith('navigate:')) {
                    const screenName = action.replace('navigate:', '');
                    if (screenName === 'GEXPromo') {
                      // Mostrar alerta informativa sobre GEX
                      Alert.alert(
                        '🛡️ Garantía Extendida GEX',
                        'Protege tu carga contra daños, pérdida o robo por solo el 5% del valor declarado.\n\n✅ Cobertura total\n✅ Proceso de reclamo en 24hrs\n✅ Sin deducibles',
                        [
                          { text: 'Ahora no', style: 'cancel' },
                          { 
                            text: 'Activar en mis paquetes', 
                            onPress: () => {
                              // Scroll a la lista de paquetes
                            }
                          }
                        ]
                      );
                    } else if (screenName === 'RequestAdvisor') {
                      navigation.navigate('RequestAdvisor', { user, token });
                    }
                  } else if (action.startsWith('modal:')) {
                    const modalType = action.replace('modal:', '');
                    if (modalType === 'referral') {
                      Alert.alert(
                        '🎁 Programa de Referidos',
                        `¡Comparte tu código y gana!\n\nTu código: ${user.boxId}\n\nPor cada amigo que haga su primer envío, ambos reciben $500 MXN de crédito.`,
                        [
                          { text: 'Cerrar', style: 'cancel' },
                          { text: 'Compartir Código', onPress: () => {} }
                        ]
                      );
                    }
                  }
                }}
              />
            )}

            {/* 🎯 Filtros de Servicio */}
            <View style={styles.serviceFilters}>
              <Pressable
                style={[styles.filterChip, serviceFilter === 'air' && styles.filterChipActive]}
                onPress={() => setServiceFilter(serviceFilter === 'air' ? null : 'air')}
              >
                <Text style={styles.filterIcon}>✈️</Text>
                <Text style={[styles.filterText, serviceFilter === 'air' && styles.filterTextActive]}>Aéreo</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, serviceFilter === 'maritime' && styles.filterChipActive]}
                onPress={() => setServiceFilter(serviceFilter === 'maritime' ? null : 'maritime')}
              >
                <Text style={styles.filterIcon}>🚢</Text>
                <Text style={[styles.filterText, serviceFilter === 'maritime' && styles.filterTextActive]}>Marítimo</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, serviceFilter === 'dhl' && styles.filterChipActive]}
                onPress={() => setServiceFilter(serviceFilter === 'dhl' ? null : 'dhl')}
              >
                <Text style={styles.filterIcon}>🚚</Text>
                <Text style={[styles.filterText, serviceFilter === 'dhl' && styles.filterTextActive]}>DHL</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, serviceFilter === 'usa' && styles.filterChipActive]}
                onPress={() => setServiceFilter(serviceFilter === 'usa' ? null : 'usa')}
              >
                <Text style={styles.filterIcon}>📦</Text>
                <Text style={[styles.filterText, serviceFilter === 'usa' && styles.filterTextActive]}>PO Box</Text>
              </Pressable>
            </View>

            {/* ✅ Botón Seleccionar Todas */}
            {packages.length > 0 && (
              <Pressable
                style={styles.selectAllButton}
                onPress={() => {
                  // Obtener los paquetes filtrados actualmente
                  const filteredPackages = packages.filter(pkg => {
                    if (serviceFilter === null) return true;
                    if (serviceFilter === 'air') return pkg.shipment_type === 'china_air';
                    if (serviceFilter === 'maritime') return pkg.shipment_type === 'maritime';
                    if (serviceFilter === 'dhl') return pkg.shipment_type === 'dhl';
                    if (serviceFilter === 'usa') return !pkg.shipment_type || pkg.shipment_type === 'air';
                    return true;
                  });
                  const filteredIds = filteredPackages.map(p => p.id);
                  const allSelected = filteredIds.every(id => selectedIds.includes(id));
                  
                  if (allSelected) {
                    // Deseleccionar todos los filtrados
                    setSelectedIds(selectedIds.filter(id => !filteredIds.includes(id)));
                  } else {
                    // Seleccionar todos los filtrados
                    setSelectedIds([...new Set([...selectedIds, ...filteredIds])]);
                  }
                }}
              >
                <Icon 
                  source={(() => {
                    const filteredPackages = packages.filter(pkg => {
                      if (serviceFilter === null) return true;
                      if (serviceFilter === 'air') return pkg.shipment_type === 'china_air';
                      if (serviceFilter === 'maritime') return pkg.shipment_type === 'maritime';
                      if (serviceFilter === 'dhl') return pkg.shipment_type === 'dhl';
                      if (serviceFilter === 'usa') return !pkg.shipment_type || pkg.shipment_type === 'air';
                      return true;
                    });
                    const filteredIds = filteredPackages.map(p => p.id);
                    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));
                    return allSelected ? "checkbox-marked" : "checkbox-blank-outline";
                  })()}
                  size={20}
                  color={ORANGE}
                />
                <Text style={styles.selectAllText}>
                  {(() => {
                    const filteredPackages = packages.filter(pkg => {
                      if (serviceFilter === null) return true;
                      if (serviceFilter === 'air') return pkg.shipment_type === 'china_air';
                      if (serviceFilter === 'maritime') return pkg.shipment_type === 'maritime';
                      if (serviceFilter === 'dhl') return pkg.shipment_type === 'dhl';
                      if (serviceFilter === 'usa') return !pkg.shipment_type || pkg.shipment_type === 'air';
                      return true;
                    });
                    const filteredIds = filteredPackages.map(p => p.id);
                    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));
                    return allSelected ? "Deseleccionar todas" : "Seleccionar todas";
                  })()}
                </Text>
              </Pressable>
            )}
          </>
        }
        ListEmptyComponent={renderEmptyList}
        showsVerticalScrollIndicator={false}
      />

      {/* 🔥 FAB para ENVIAR - Solo aparece si hay selección */}
      {selectedIds.length > 0 && (() => {
        const firstSelectedPkg = packages.find(p => selectedIds.includes(p.id));
        const shipmentType = (firstSelectedPkg as any)?.shipment_type;
        const isMaritimeSelection = shipmentType === 'maritime';
        const isChinaAirSelection = shipmentType === 'china_air';
        const isDHLSelection = shipmentType === 'dhl';
        const needsInstructions = isMaritimeSelection || isChinaAirSelection || isDHLSelection;
        return (
          <FAB
            icon={needsInstructions ? (isMaritimeSelection ? "ferry" : isChinaAirSelection ? "airplane" : "truck-delivery") : "airplane-takeoff"}
            label={needsInstructions 
              ? `Asignar Instrucciones (${selectedIds.length})`
              : `${t('home.requestConsolidation')} (${selectedIds.length})`}
            style={styles.fabSend}
            color="white"
            onPress={needsInstructions ? handleMaritimeInstructions : handleConsolidate}
          />
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  // 🎯 Filtros de Servicio
  serviceFilters: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#f5f5f5',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  filterIcon: {
    fontSize: 14,
  },
  filterText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  filterTextActive: {
    color: 'white',
  },
  // ✅ Botón Seleccionar Todas
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  selectAllText: {
    fontSize: 14,
    color: ORANGE,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 15,
    color: '#666',
    fontSize: 16,
  },
  appbar: {
    backgroundColor: BLACK,
    elevation: 0,
  },
  appbarTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 20,
  },
  userHeader: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  userTextContainer: {
    marginLeft: 15,
    flex: 1,
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BLACK,
  },
  boxId: {
    fontSize: 14,
    color: '#666',
    marginTop: 3,
  },
  requestShipmentButton: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  requestShipmentText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 15,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#ddd',
    marginHorizontal: 10,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: ORANGE,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  selectionHint: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  selectionHintText: {
    color: '#1976D2',
    fontSize: 12,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: 'white',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: ORANGE,
    borderWidth: 2,
  },
  cardShipped: {
    borderColor: '#00BCD4',
    borderWidth: 2,
    backgroundColor: '#E0F7FA',
  },
  cardImage: {
    height: 140,
  },
  noImageContainer: {
    height: 60,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  noImageText: {
    color: '#999',
    fontSize: 12,
  },
  cardContent: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardMainContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  trackingContainer: {
    flex: 1,
    marginRight: 10,
  },
  packageCheckbox: {
    padding: 4,
  },
  packageCheckboxSelected: {
    // Se puede agregar efecto visual adicional si se desea
  },
  description: {
    fontSize: 15,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 2,
  },
  trackingNumber: {
    fontSize: 12,
    color: '#666',
  },
  statusChip: {
    height: 28,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  // 🚀 Badge de Estado (mismo diseño que GEX)
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  // 🛡️ Badge GEX
  gexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  gexBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#10B981',
  },
  // ✅ Badge Instrucciones Asignadas
  deliveryAssignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  deliveryAssignedText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#10B981',
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoIcon: {
    fontSize: 13,
  },
  infoText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  payButtonContainer: {
    marginTop: 12,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003087', // Azul PayPal
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // 🛡️ Estilos para botón GEX
  gexButtonContainer: {
    marginTop: 8,
  },
  gexButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981', // Verde esmeralda - Protegido
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
    alignSelf: 'stretch',
  },
  gexButtonUnprotected: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444', // Rojo - Sin protección
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
    alignSelf: 'stretch',
  },
  gexButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // 🚢 Estilos para botón de Instrucciones de Entrega
  deliveryButtonContainer: {
    marginTop: 8,
  },
  deliveryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0097A7', // Cyan marítimo
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  deliveryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 30,
    backgroundColor: ORANGE,
  },
  fabSend: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 30,
    backgroundColor: ORANGE,
  },
  // 🔐 Estilos para banner de verificación
  verificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  pendingBanner: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  warningBanner: {
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  employeeBanner: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
  },
  // 🚚 Estilos para banner de módulo repartidor
  driverModuleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    gap: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  driverModuleIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverModuleContent: {
    flex: 1,
  },
  driverModuleTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  driverModuleSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  verificationBannerText: {
    flex: 1,
  },
  verificationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  verificationSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  // � Estilos para banner de cuenta bloqueada
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#c62828',
    gap: 12,
  },
  blockedBannerText: {
    flex: 1,
  },
  blockedTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  blockedSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  blockedCta: {
    fontSize: 11,
    color: '#ffcdd2',
    fontFamily: 'monospace',
  },
  // �📱 Estilos para el menú
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
  },
  menuContainer: {
    backgroundColor: 'white',
    marginTop: 60,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f8f8',
  },
  menuUserInfo: {
    marginLeft: 12,
    flex: 1,
  },
  menuUserName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  menuUserEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: BLACK,
  },
  // 🌐 Estilos para selector de idioma
  languageButton: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageFlag: {
    fontSize: 22,
  },
  languageModalContainer: {
    backgroundColor: 'white',
    marginTop: 100,
    marginHorizontal: 40,
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  languageModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
    textAlign: 'center',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginVertical: 4,
  },
  languageOptionActive: {
    backgroundColor: '#FFF3E0',
  },
  languageOptionFlag: {
    fontSize: 28,
    marginRight: 12,
  },
  languageOptionText: {
    flex: 1,
    fontSize: 16,
    color: BLACK,
  },
  languageOptionTextActive: {
    fontWeight: 'bold',
    color: ORANGE,
  },
});
