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
  TextInput,
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
import { getMyPackagesApi, Package, getCarouselSlidesApi, API_URL } from '../services/api';
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
  received: '#2196F3',      // Azul - Recibido en suite
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
  SupportChat: { user: any; token: string; mode?: 'ai' | 'human' };
  HelpCenter: { user: any; token: string };
  Notifications: { user: any; token: string };
  DeliveryInstructions: { package: Package; packages?: Package[]; user: any; token: string };
  MaritimeDetail: { package: Package; user: any; token: string };
  PackageDetail: { package: Package; user: any; token: string };
  EmployeeOnboarding: { user: any; token: string };
  ServicesGuide: { user: any; token: string };
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
  const [expandedBadgeId, setExpandedBadgeId] = useState<number | null>(null); // 🏷️ ID del paquete con badges expandidos
  
  // 🔍 Filtro simple: null = todos, true = con instrucciones, false = sin instrucciones
  const [instructionFilter, setInstructionFilter] = useState<boolean | null>(null);

  // 🎠 Estado para slides del carrusel desde el backend
  const [carouselSlides, setCarouselSlides] = useState<Opportunity[]>([]);

  // 📜 Estado para modal de historial
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyPackages, setHistoryPackages] = useState<Package[]>([]);

  // � Estado para modal de rastreo
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingSearch, setTrackingSearch] = useState('');
  const [trackedPackage, setTrackedPackage] = useState<Package | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');

  // 🔔 Estado para contador de notificaciones no leídas
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // �🔐 Verificar si el usuario está verificado
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
  const getStatusLabel = (status: string, shipmentType?: string, receivedBy?: string | null): string => {
    // Si está entregado y tiene nombre de quien recibió, mostrarlo
    if (status === 'delivered' && receivedBy) {
      return `✅ Entregado: ${receivedBy}`;
    }
    
    // Si es marítimo (maritime o fcl), usar labels específicos
    if (shipmentType === 'maritime' || shipmentType === 'fcl') {
      const maritimeLabels: Record<string, string> = {
        received_china: '📦 Recibido CEDIS GZ CHINA',
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
    
    // Labels para PO Box USA (terrestre)
    const statusLabels: Record<string, string> = {
      received: t('status.inWarehouse'),
      in_transit: `🚚 ${t('status.inTransit')} a MTY`,
      processing: `📋 ${t('status.processing')}`,
      shipped: `🚚 ${t('status.shipped')}`,
      ready_pickup: '📍 Pick Up',
      delivered: t('status.delivered'),
      pending: t('status.pending'),
    };
    return statusLabels[status] || status;
  };

  // 🔍 Función para obtener paquetes filtrados por servicio e instrucciones
  const getFilteredPackages = useCallback(() => {
    return packages.filter(pkg => {
      // 1. Filtro por tipo de servicio
      if (serviceFilter !== null) {
        if (serviceFilter === 'air' && pkg.shipment_type !== 'china_air') return false;
        if (serviceFilter === 'maritime' && pkg.shipment_type !== 'maritime' && pkg.shipment_type !== 'fcl') return false;
        if (serviceFilter === 'dhl' && pkg.shipment_type !== 'dhl') return false;
        if (serviceFilter === 'usa' && pkg.service_type !== 'POBOX_USA') return false;
      }
      
      // 2. Filtro por instrucciones (el más importante)
      if (instructionFilter !== null) {
        const hasInstructions = !!(pkg as any).delivery_address_id || !!(pkg as any).assigned_address_id;
        if (instructionFilter !== hasInstructions) return false;
      }
      
      return true;
    });
  }, [packages, serviceFilter, instructionFilter]);

  // 📊 Función para contar paquetes por tipo de instrucciones
  const getInstructionCounts = useCallback(() => {
    const filtered = packages.filter(pkg => {
      if (serviceFilter !== null) {
        if (serviceFilter === 'air' && pkg.shipment_type !== 'china_air') return false;
        if (serviceFilter === 'maritime' && pkg.shipment_type !== 'maritime' && pkg.shipment_type !== 'fcl') return false;
        if (serviceFilter === 'dhl' && pkg.shipment_type !== 'dhl') return false;
        if (serviceFilter === 'usa' && pkg.service_type !== 'POBOX_USA') return false;
      }
      return true;
    });
    
    const withInstructions = filtered.filter(pkg => 
      !!(pkg as any).delivery_address_id || !!(pkg as any).assigned_address_id
    ).length;
    const withoutInstructions = filtered.length - withInstructions;
    
    return { withInstructions, withoutInstructions, total: filtered.length };
  }, [packages, serviceFilter]);

  // 🔄 Handler para seleccionar todas
  const handleSelectAll = useCallback(() => {
    const counts = getInstructionCounts();
    const filteredPackages = getFilteredPackages();
    
    // Si ya hay un filtro de instrucciones aplicado, seleccionar/deseleccionar ese grupo
    if (instructionFilter !== null) {
      const filteredIds = filteredPackages.map(p => p.id);
      const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));
      
      if (allSelected) {
        setSelectedIds(selectedIds.filter(id => !filteredIds.includes(id)));
      } else {
        setSelectedIds([...new Set([...selectedIds, ...filteredIds])]);
      }
      return;
    }
    
    // Si no hay filtro, preguntar cuál grupo quiere seleccionar
    if (counts.withInstructions > 0 && counts.withoutInstructions > 0) {
      Alert.alert(
        'Seleccionar paquetes',
        'No puedes mezclar paquetes con dirección y sin dirección. ¿Cuáles deseas seleccionar?',
        [
          {
            text: `📍 Con Dirección (${counts.withInstructions})`,
            onPress: () => {
              setInstructionFilter(true);
              // Seleccionar paquetes con instrucciones Y NO pagados
              const withInstr = packages.filter(pkg => {
                if (serviceFilter !== null) {
                  if (serviceFilter === 'air' && pkg.shipment_type !== 'china_air') return false;
                  if (serviceFilter === 'maritime' && pkg.shipment_type !== 'maritime' && pkg.shipment_type !== 'fcl') return false;
                  if (serviceFilter === 'dhl' && pkg.shipment_type !== 'dhl') return false;
                  if (serviceFilter === 'usa' && pkg.service_type !== 'POBOX_USA') return false;
                }
                const hasInstructions = !!(pkg as any).delivery_address_id || !!(pkg as any).assigned_address_id;
                const isPaid = (pkg as any).client_paid === true;
                return hasInstructions && !isPaid;
              });
              setSelectedIds([...new Set([...selectedIds, ...withInstr.map(p => p.id)])]);
            }
          },
          {
            text: `❌ Sin Dirección (${counts.withoutInstructions})`,
            onPress: () => {
              setInstructionFilter(false);
              // Seleccionar paquetes sin instrucciones
              const withoutInstr = packages.filter(pkg => {
                if (serviceFilter !== null) {
                  if (serviceFilter === 'air' && pkg.shipment_type !== 'china_air') return false;
                  if (serviceFilter === 'maritime' && pkg.shipment_type !== 'maritime' && pkg.shipment_type !== 'fcl') return false;
                  if (serviceFilter === 'dhl' && pkg.shipment_type !== 'dhl') return false;
                  if (serviceFilter === 'usa' && pkg.service_type !== 'POBOX_USA') return false;
                }
                return !((pkg as any).delivery_address_id || (pkg as any).assigned_address_id);
              });
              setSelectedIds([...new Set([...selectedIds, ...withoutInstr.map(p => p.id)])]);
            }
          },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
    } else if (counts.withInstructions > 0) {
      // Solo hay paquetes con instrucciones — filtrar por NO pagados
      setInstructionFilter(true);
      const ids = filteredPackages
        .filter(p => (p as any).client_paid !== true)
        .map(p => p.id);
      setSelectedIds([...new Set([...selectedIds, ...ids])]);
    } else if (counts.withoutInstructions > 0) {
      // Solo hay paquetes sin instrucciones
      setInstructionFilter(false);
      const ids = filteredPackages.map(p => p.id);
      setSelectedIds([...new Set([...selectedIds, ...ids])]);
    }
  }, [packages, serviceFilter, instructionFilter, selectedIds, getInstructionCounts, getFilteredPackages]);

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

  // 🎠 Cargar slides del carrusel desde el backend
  const fetchCarouselSlides = useCallback(async () => {
    try {
      const response = await getCarouselSlidesApi();
      if (response.success && response.slides) {
        // Mapear los slides del backend al formato de Opportunity
        const mappedSlides: Opportunity[] = response.slides.map((slide) => ({
          id: slide.id || slide.slide_key,
          type: slide.type || slide.slide_type || 'internal',
          title: slide.title,
          subtitle: slide.subtitle,
          ctaText: slide.ctaText || slide.cta_text,
          ctaAction: slide.ctaAction || slide.cta_action,
          badge: slide.badge,
          badgeColor: slide.badgeColor || slide.badge_color,
          imageType: slide.imageType || slide.image_type,
          imageUrl: slide.imageUrl || slide.image_url,
          iconName: slide.iconName || slide.icon_name,
          gradientColors: slide.gradientColors || slide.gradient_colors,
          iconBgColor: slide.iconBgColor || slide.icon_bg_color,
          priority: slide.priority,
          isActive: slide.isActive !== undefined ? slide.isActive : slide.is_active,
        }));
        setCarouselSlides(mappedSlides);
      }
    } catch (error) {
      console.error('Error fetching carousel slides:', error);
    }
  }, []);

  // � Función para cargar historial de paquetes (entregados y pagados)
  const loadHistoryPackages = useCallback(() => {
    const delivered = packages.filter(pkg => {
      // Solo paquetes entregados
      if (pkg.status !== 'delivered') return false;
      // Solo paquetes pagados (saldo_pendiente = 0 o client_paid = true)
      const isPaid = (pkg as any).client_paid === true || 
                     ((pkg as any).saldo_pendiente !== undefined && (pkg as any).saldo_pendiente <= 0) ||
                     ((pkg as any).assigned_cost_mxn === 0);
      return isPaid;
    });
    setHistoryPackages(delivered);
    setShowHistoryModal(true);
  }, [packages]);

  // 🔔 Función para obtener conteo de notificaciones no leídas
  const fetchUnreadNotifications = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUnreadNotifications(data.count || 0);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [token]);

  // 🔄 Función para actualizar datos del usuario desde el servidor
  const refreshUserData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/profile`, {
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
    fetchCarouselSlides(); // Cargar slides del carrusel
    fetchUnreadNotifications(); // 🔔 Cargar notificaciones no leídas
  }, [fetchPackages, fetchCarouselSlides, fetchUnreadNotifications]);

  // 🔄 Refrescar al volver a la pantalla (después de contratar GEX o completar onboarding)
  useFocusEffect(
    useCallback(() => {
      fetchPackages();
      refreshUserData(); // Actualizar datos del usuario
      fetchUnreadNotifications(); // 🔔 Actualizar notificaciones
    }, [fetchPackages, refreshUserData, fetchUnreadNotifications])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedIds([]); // Limpiar selección al refrescar
    fetchPackages();
    fetchUnreadNotifications(); // 🔔 Refrescar notificaciones
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
    
    // Obtener el paquete actual
    const currentPkg = packages.find(p => p.id === id);
    
    // 🔍 Verificar si el paquete actual tiene instrucciones
    const currentHasInstructions = !!((currentPkg as any)?.delivery_address_id || (currentPkg as any)?.assigned_address_id);
    
    // Si ya hay paquetes seleccionados, verificar que sean del mismo tipo de envío
    if (selectedIds.length > 0) {
      const firstSelectedPkg = packages.find(p => selectedIds.includes(p.id));
      const firstShipmentType = (firstSelectedPkg as any)?.shipment_type || 'air';
      const currentShipmentType = shipmentType || 'air';
      
      // 🔍 Verificar si los paquetes seleccionados tienen instrucciones
      const firstHasInstructions = !!((firstSelectedPkg as any)?.delivery_address_id || (firstSelectedPkg as any)?.assigned_address_id);
      
      // ❌ No permitir mezclar paquetes con y sin instrucciones
      if (firstHasInstructions !== currentHasInstructions) {
        Alert.alert(
          '⚠️ No puedes mezclar',
          firstHasInstructions 
            ? 'Ya tienes paquetes CON dirección seleccionados. No puedes agregar paquetes SIN dirección.'
            : 'Ya tienes paquetes SIN dirección seleccionados. No puedes agregar paquetes CON dirección.',
          [{ text: 'Entendido', style: 'default' }]
        );
        return;
      }
      
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
          'dhl': 'MTY'
        };
        Alert.alert(
          '⚠️ No puedes mezclar envíos',
          `Ya tienes paquetes ${typeNames[firstGroup]} seleccionados. Deselecciónalos primero para seleccionar paquetes ${typeNames[currentGroup]}.`,
          [{ text: 'Entendido', style: 'default' }]
        );
        return;
      }
      
      // 📦 Para PO Box USA: No mezclar paquetes en bodega con procesando, ni con Pick Up
      if (firstGroup === 'usa') {
        const firstIsInWarehouse = firstSelectedPkg?.status === 'received' && (firstSelectedPkg?.carrier === 'BODEGA' || !firstSelectedPkg?.carrier);
        const currentIsInWarehouse = currentPkg?.status === 'received' && (currentPkg?.carrier === 'BODEGA' || !currentPkg?.carrier);
        const firstIsProcessing = firstSelectedPkg?.status === 'processing';
        const currentIsProcessing = currentPkg?.status === 'processing';
        const firstIsPickup = firstSelectedPkg?.status === 'ready_pickup';
        const currentIsPickup = currentPkg?.status === 'ready_pickup';
        
        // No mezclar Pick Up con otros estados
        if ((firstIsPickup && !currentIsPickup) || (!firstIsPickup && currentIsPickup)) {
          Alert.alert(
            '⚠️ No puedes mezclar estados',
            firstIsPickup 
              ? 'Ya tienes paquetes en PICK UP seleccionados. Solo puedes agregar otros paquetes en Pick Up.'
              : 'Ya tienes paquetes de BODEGA seleccionados. No puedes mezclar con paquetes en Pick Up.',
            [{ text: 'Entendido', style: 'default' }]
          );
          return;
        }
        
        if ((firstIsInWarehouse && currentIsProcessing) || (firstIsProcessing && currentIsInWarehouse)) {
          Alert.alert(
            '⚠️ No puedes mezclar estados',
            firstIsInWarehouse 
              ? 'Ya tienes paquetes EN BODEGA seleccionados. No puedes mezclar con paquetes PROCESANDO.'
              : 'Ya tienes paquetes PROCESANDO seleccionados. No puedes mezclar con paquetes EN BODEGA.',
            [{ text: 'Entendido', style: 'default' }]
          );
          return;
        }
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

  // 🚚 Función para obtener el nombre amigable del carrier
  const getCarrierName = (carrierID: string): string => {
    const carrierMap: Record<string, string> = {
      'paquete_express': 'Paquete Express',
      'entregax_local': 'Entregax Local',
      'entregax_local_cdmx': 'Entregax Local CDMX',
      'fedex': 'FedEx',
      'estafeta': 'Estafeta',
      'dhl': 'DHL',
      'ups': 'UPS',
      'pickup_hidalgo': 'Recoger en Sucursal',
    };
    return carrierMap[carrierID] || carrierID;
  };

  const getAssignedCarrierName = (pkg: Package): string | null => {
    const rawCarrier = String(pkg.national_carrier || '').trim();
    if (!rawCarrier) return null;

    return getCarrierName(rawCarrier);
  };

  const renderPackageCard = ({ item }: { item: Package }) => {
    const statusColor = STATUS_COLORS[item.status] || '#999';
    // Usar statusLabel traducido - pasar shipment_type para diferenciar marítimo y received_by para entregado
    const statusLabel = getStatusLabel(item.status, item.shipment_type, (item as any).received_by);
    
    // Es paquete marítimo?
    const isMaritime = item.shipment_type === 'maritime';
    
    // ✈️🇨🇳 Es paquete TDI Aéreo China?
    const isChinaAir = item.shipment_type === 'china_air';
    
    // 🚚 Es paquete DHL Express?
    const isDHL = item.shipment_type === 'dhl';
    
    // ¿Ya tiene instrucciones de entrega asignadas?
    // Prioridad 1: Campo calculado del backend
    // Prioridad 2: Para marítimo/china_air/dhl usa delivery_address_id, para PO Box USA usa assigned_address_id  
    // Prioridad 3: Verificar campos destination_* directamente
    const hasDeliveryInstructions = !!(item as any).has_delivery_instructions || 
      !!(item as any).delivery_address_id || 
      !!(item as any).assigned_address_id ||
      !!((item as any).destination_address && 
         (item as any).destination_address !== 'Pendiente de asignar' && 
         (item as any).destination_contact);
    
    // 💰 ¿El paquete está pagado?
    const isPaid = (item as any).client_paid === true || parseFloat((item as any).saldo_pendiente || '0') === 0;
    
    // 💳 ¿Tiene orden de pago pendiente generada?
    const hasPendingPaymentOrder = !!(item as any).pending_payment_reference;
    const assignedCarrierName = getAssignedCarrierName(item);
    
    // Solo permitimos seleccionar paquetes en bodega (USA) o recibidos en China (marítimo/china_air) o DHL en Cedis Y usuario verificado
    // Para marítimos/china_air/dhl: NO seleccionable si ya tiene instrucciones asignadas
    // 📦 PO Box USA: seleccionable si está en bodega (received) O procesando (processing)
    // ❌ Paquetes ya pagados NO son seleccionables
    const isPOBoxUSA = !isMaritime && !isChinaAir && !isDHL;
    // 📍 Paquetes en Pick Up pueden ser seleccionados para cambiar método de envío
    const isPickupPackage = isPOBoxUSA && item.status === 'ready_pickup';
    const isSelectable = isUserVerified && !isPaid && (
      (isPOBoxUSA && ['received', 'in_transit', 'received_mty', 'processing', 'ready_pickup'].includes(item.status)) || 
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
      // Para paquetes PO Box USA, navegar al detalle
      if (!isMaritime && !isChinaAir && !isDHL) {
        navigation.navigate('PackageDetail', {
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
                    {/* Solo mostrar descripción si existe */}
                    {item.description ? (
                      <Text style={styles.description} numberOfLines={1}>
                        {(() => {
                          // Remapeo de descripciones MTY/DHL legacy → nuevos nombres
                          if (isDHL) {
                            const pt = (item as any).product_type;
                            if (pt === 'standard') return 'General';
                            if (pt === 'high_value') return 'Específico';
                            const legacy: Record<string, string> = {
                              'Accesorios/Mixto': 'General',
                              'Accesorios / Mixto': 'General',
                              'Sensible': 'Específico',
                              'Específica': 'Específico',
                              'Low': 'General',
                              'High': 'Específico',
                            };
                            return legacy[item.description] || item.description;
                          }
                          return item.description;
                        })()}
                      </Text>
                    ) : null}
                    <View style={styles.trackingRow}>
                      <Text style={styles.trackingNumber}>TRN: {item.tracking_internal}</Text>
                      {/* 📦 Indicador de Multi-Guía */}
                      {item.is_master && (item.total_boxes || 1) > 1 && (
                        <View style={styles.multiPackageBadge}>
                          <Ionicons name="layers" size={12} color="#fff" />
                          <Text style={styles.multiPackageText}>{item.total_boxes}</Text>
                        </View>
                      )}
                    </View>
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
                          item.status === 'in_transit' ? 'truck-fast' : 
                          item.status === 'received' ? 'package-variant' :
                          item.status === 'shipped' ? 'truck-delivery' :
                          item.status === 'delivered' ? 'check-circle' :
                          item.status === 'processing' ? 'clipboard-text' : 'package-variant'
                        )
                      } 
                      size={12} 
                      color={statusColor} 
                    />
                    <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                  
                  {/* 🏷️ Badges compactos (solo íconos) con opción de expandir */}
                  <View style={styles.compactBadgesContainer}>
                    {/* Íconos compactos */}
                    {item.has_gex && (
                      <View style={styles.iconOnlyBadge}>
                        <Icon source="shield-check" size={14} color="#10B981" />
                      </View>
                    )}
                    {hasDeliveryInstructions && (
                      <View style={styles.iconOnlyBadge}>
                        <Icon source="clipboard-check" size={14} color="#8B5CF6" />
                      </View>
                    )}
                    {/* 💳 Orden de pago pendiente */}
                    {hasPendingPaymentOrder && !isPaid && (
                      <View style={styles.iconOnlyBadge}>
                        <Icon source="cash" size={14} color="#F59E0B" />
                      </View>
                    )}
                    <View style={styles.iconOnlyBadge}>
                      <Icon source={isPaid ? "check-circle" : "credit-card"} size={14} color={isPaid ? "#10B981" : "#EF4444"} />
                    </View>
                    
                    {/* Botón expandir/colapsar */}
                    <Pressable 
                      style={styles.expandBadgesButton}
                      onPress={() => setExpandedBadgeId(expandedBadgeId === item.id ? null : item.id)}
                    >
                      <Icon 
                        source={expandedBadgeId === item.id ? "chevron-up" : "chevron-down"} 
                        size={16} 
                        color="#666" 
                      />
                    </Pressable>
                  </View>
                  
                  {/* 🏷️ Badges expandidos (con texto) */}
                  {expandedBadgeId === item.id && (
                    <View style={styles.expandedBadgesContainer}>
                      {item.has_gex && (
                        <View style={styles.gexBadge}>
                          <Icon source="shield-check" size={12} color="#10B981" />
                          <Text style={styles.gexBadgeText}>{t('home.extendedWarranty')}</Text>
                        </View>
                      )}
                      {hasDeliveryInstructions && (
                        <View style={styles.deliveryAssignedBadge}>
                          <Icon source="clipboard-check" size={12} color="#8B5CF6" />
                          <Text style={styles.deliveryAssignedText}>Instrucciones</Text>
                        </View>
                      )}
                      {/* 💳 Orden de pago pendiente expandido */}
                      {hasPendingPaymentOrder && !isPaid && (
                        <View style={styles.pendingPaymentBadge}>
                          <Icon source="cash" size={12} color="#F59E0B" />
                          <Text style={styles.pendingPaymentBadgeText}>Orden de Pago</Text>
                        </View>
                      )}
                      <View style={isPaid ? styles.paidBadge : styles.unpaidBadge}>
                        <Icon source={isPaid ? "check-circle" : "credit-card"} size={12} color={isPaid ? "#10B981" : "#EF4444"} />
                        <Text style={isPaid ? styles.paidBadgeText : styles.unpaidBadgeText}>
                          {isPaid ? 'Pagado' : 'Pagar'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {assignedCarrierName && (
                  <View style={styles.assignedCarrierBadge}>
                    <Icon source="truck-fast" size={12} color={ORANGE} />
                    <Text style={styles.assignedCarrierText}>{assignedCarrierName}</Text>
                  </View>
                )}

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
                      <Text style={styles.infoText}>{getCarrierName(item.carrier)}</Text>
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

  // 📜 Filtrar paquetes activos (excluir entregados Y pagados - esos van a Historial)
  const activePackages = packages.filter(pkg => {
    const isDelivered = pkg.status === 'delivered';
    const isPaid = (pkg as any).client_paid === true || 
                   ((pkg as any).saldo_pendiente !== undefined && (pkg as any).saldo_pendiente <= 0) ||
                   ((pkg as any).assigned_cost_mxn === 0);
    return !(isDelivered && isPaid);
  });

  // Contar paquetes en bodega (seleccionables)
  const packagesInWarehouse = activePackages.filter(p => p.status === 'received').length;

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
        {/* 🔔 Ícono de notificaciones con badge rojo */}
        <View style={{ position: 'relative' }}>
          <Appbar.Action 
            icon="bell-outline" 
            onPress={() => navigation.navigate('Notifications', { user, token })} 
            color="white" 
          />
          {unreadNotifications > 0 && (
            <View style={styles.notificationBadge}>
              {unreadNotifications <= 9 ? (
                <Text style={styles.notificationBadgeText}>{unreadNotifications}</Text>
              ) : (
                <Text style={styles.notificationBadgeText}>9+</Text>
              )}
            </View>
          )}
        </View>
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

      {/* �📱 Modal de Menú */}
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

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('SaldoFavor' as any, { user, token });
              }}
            >
              <Ionicons name="gift-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>Saldo a Favor</Text>
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
                navigation.navigate('HelpCenter', { user, token });
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

      {/* 📜 Modal de Historial */}
      <Modal visible={showHistoryModal} animationType="slide" transparent>
        <View style={styles.historyModalOverlay}>
          <View style={styles.historyModalContainer}>
            <View style={styles.historyModalHeader}>
              <Text style={styles.historyModalTitle}>📜 Historial de Envíos</Text>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                <Ionicons name="close-circle" size={28} color="#666" />
              </TouchableOpacity>
            </View>
            
            {historyPackages.length === 0 ? (
              <View style={styles.historyEmptyContainer}>
                <Ionicons name="time-outline" size={60} color="#ccc" />
                <Text style={styles.historyEmptyText}>No hay envíos completados</Text>
                <Text style={styles.historyEmptySubtext}>
                  Aquí aparecerán tus paquetes entregados y pagados
                </Text>
              </View>
            ) : (
              <FlatList
                data={historyPackages}
                keyExtractor={(item) => item.id.toString()}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => (
                  <View style={styles.historyCard}>
                    <View style={styles.historyCardHeader}>
                      <View style={styles.historyTrackingBadge}>
                        <Text style={styles.historyTrackingText}>
                          {item.tracking_internal || item.tracking_provider || 'Sin tracking'}
                        </Text>
                      </View>
                      <View style={styles.historyDeliveredBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        <Text style={styles.historyDeliveredText}>Entregado</Text>
                      </View>
                    </View>
                    
                    <Text style={styles.historyDescription} numberOfLines={1}>
                      {item.description || 'Sin descripción'}
                    </Text>
                    
                    <View style={styles.historyDetailsRow}>
                      {item.delivered_at && (
                        <View style={styles.historyDetailItem}>
                          <Ionicons name="calendar-outline" size={14} color="#666" />
                          <Text style={styles.historyDetailText}>
                            {new Date(item.delivered_at).toLocaleDateString('es-MX', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </Text>
                        </View>
                      )}
                      {item.weight && (
                        <View style={styles.historyDetailItem}>
                          <Ionicons name="scale-outline" size={14} color="#666" />
                          <Text style={styles.historyDetailText}>{item.weight} lbs</Text>
                        </View>
                      )}
                    </View>
                    
                    {(item as any).received_by && (
                      <View style={styles.historyReceivedBy}>
                        <Ionicons name="person-outline" size={12} color="#888" />
                        <Text style={styles.historyReceivedByText}>
                          Recibió: {(item as any).received_by}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* 🔍 Modal de Rastreo */}
      <Modal visible={showTrackingModal} animationType="slide" transparent>
        <View style={styles.trackingModalOverlay}>
          <View style={styles.trackingModalContainer}>
            <View style={styles.trackingModalHeader}>
              <Text style={styles.trackingModalTitle}>🔍 Rastrear Paquete</Text>
              <TouchableOpacity onPress={() => setShowTrackingModal(false)}>
                <Ionicons name="close-circle" size={28} color="#666" />
              </TouchableOpacity>
            </View>
            
            {/* Input de búsqueda */}
            <View style={styles.trackingSearchContainer}>
              <View style={styles.trackingInputWrapper}>
                <Ionicons name="barcode-outline" size={20} color="#666" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.trackingInput}
                  placeholder="Número de guía o tracking"
                  value={trackingSearch}
                  onChangeText={setTrackingSearch}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {trackingSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setTrackingSearch('')}>
                    <Ionicons name="close-circle" size={20} color="#ccc" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[
                  styles.trackingSearchButton,
                  trackingSearch.length < 3 && styles.trackingSearchButtonDisabled
                ]}
                disabled={trackingSearch.length < 3 || trackingLoading}
                onPress={async () => {
                  setTrackingLoading(true);
                  setTrackingError('');
                  setTrackedPackage(null);
                  
                  try {
                    // Buscar en paquetes locales primero
                    const searchTerm = trackingSearch.trim().toUpperCase();
                    const found = packages.find(pkg => 
                      (pkg.tracking_internal?.toUpperCase() === searchTerm) ||
                      (pkg.tracking_provider?.toUpperCase() === searchTerm) ||
                      ((pkg as any).tracking_courier?.toUpperCase() === searchTerm)
                    );
                    
                    if (found) {
                      setTrackedPackage(found);
                    } else {
                      // Buscar en API (historial)
                      const response = await fetch(
                        `${API_URL}/api/packages/track/${searchTerm}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                      );
                      
                      if (response.ok) {
                        const data = await response.json();
                        setTrackedPackage(data);
                      } else {
                        setTrackingError('No se encontró ningún paquete con ese número de guía');
                      }
                    }
                  } catch (error) {
                    setTrackingError('Error al buscar. Intenta de nuevo.');
                  } finally {
                    setTrackingLoading(false);
                  }
                }}
              >
                {trackingLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="search" size={20} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>

            {/* Error */}
            {trackingError ? (
              <View style={styles.trackingErrorContainer}>
                <Ionicons name="alert-circle" size={40} color="#EF4444" />
                <Text style={styles.trackingErrorText}>{trackingError}</Text>
              </View>
            ) : null}

            {/* Resultado del rastreo */}
            {trackedPackage && (
              <View style={styles.trackedPackageCard}>
                <View style={styles.trackedPackageHeader}>
                  <View>
                    <Text style={styles.trackedPackageTracking}>
                      {trackedPackage.tracking_internal || trackedPackage.tracking_provider}
                    </Text>
                    <Text style={styles.trackedPackageDescription} numberOfLines={1}>
                      {trackedPackage.description || 'Sin descripción'}
                    </Text>
                  </View>
                  <View style={[
                    styles.trackedStatusBadge,
                    trackedPackage.status === 'delivered' && styles.trackedStatusDelivered,
                    trackedPackage.status === 'in_transit' && styles.trackedStatusTransit,
                    (trackedPackage.status === 'received' || trackedPackage.status === 'received_origin') && styles.trackedStatusWarehouse,
                  ]}>
                    <Text style={styles.trackedStatusText}>
                      {getStatusLabel(trackedPackage.status, trackedPackage.shipment_type)}
                    </Text>
                  </View>
                </View>

                <View style={styles.trackedPackageDivider} />

                {/* Timeline de eventos */}
                <View style={styles.trackedTimeline}>
                  {trackedPackage.status === 'delivered' && (
                    <View style={styles.timelineItem}>
                      <View style={[styles.timelineDot, styles.timelineDotGreen]} />
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineTitle}>✅ Entregado</Text>
                        {trackedPackage.delivered_at && (
                          <Text style={styles.timelineDate}>
                            {new Date(trackedPackage.delivered_at).toLocaleDateString('es-MX', {
                              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </Text>
                        )}
                        {(trackedPackage as any).received_by && (
                          <Text style={styles.timelineSubtext}>Recibió: {(trackedPackage as any).received_by}</Text>
                        )}
                      </View>
                    </View>
                  )}

                  {(trackedPackage.status === 'in_transit' || trackedPackage.status === 'delivered') && (
                    <View style={styles.timelineItem}>
                      <View style={[styles.timelineDot, trackedPackage.status === 'in_transit' ? styles.timelineDotBlue : styles.timelineDotGray]} />
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineTitle}>🚚 En tránsito</Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineDot, 
                      (trackedPackage.status === 'received' || trackedPackage.status === 'received_origin') 
                        ? styles.timelineDotOrange 
                        : styles.timelineDotGray
                    ]} />
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineTitle}>📦 Recibido en bodega</Text>
                      {trackedPackage.received_at && (
                        <Text style={styles.timelineDate}>
                          {new Date(trackedPackage.received_at).toLocaleDateString('es-MX', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* Detalles adicionales */}
                <View style={styles.trackedDetailsGrid}>
                  {trackedPackage.weight && (
                    <View style={styles.trackedDetailItem}>
                      <Ionicons name="scale-outline" size={16} color="#666" />
                      <Text style={styles.trackedDetailText}>{trackedPackage.weight} lbs</Text>
                    </View>
                  )}
                  {trackedPackage.dimensions && (
                    <View style={styles.trackedDetailItem}>
                      <Ionicons name="cube-outline" size={16} color="#666" />
                      <Text style={styles.trackedDetailText}>{trackedPackage.dimensions}</Text>
                    </View>
                  )}
                  {trackedPackage.carrier && (
                    <View style={styles.trackedDetailItem}>
                      <Ionicons name="airplane-outline" size={16} color="#666" />
                      <Text style={styles.trackedDetailText}>{trackedPackage.carrier}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Estado inicial */}
            {!trackedPackage && !trackingError && !trackingLoading && (
              <View style={styles.trackingEmptyState}>
                <Ionicons name="qr-code-outline" size={60} color="#ddd" />
                <Text style={styles.trackingEmptyText}>Ingresa el número de guía</Text>
                <Text style={styles.trackingEmptySubtext}>
                  Puedes buscar por tracking interno o de paquetería
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Header con información del usuario */}
      <Surface style={styles.userHeader}>
        <View style={styles.userInfo}>
          <View style={styles.userTextContainer}>
            <Text style={styles.greeting}>{t('home.greeting')}, {user.name?.split(' ')[0]}!</Text>
            <Text style={styles.boxId}>🏠 {t('home.mailbox')}: {user.boxId}</Text>
          </View>
          <View style={styles.headerButtonsRow}>
            {/* 💰 Botón Pago a Proveedor */}
            <TouchableOpacity
              style={styles.supplierPaymentButton}
              onPress={() => {
                navigation.navigate('SupplierPayment' as any, { user, token });
              }}
            >
              <Ionicons name="cash-outline" size={16} color="white" />
              <Text style={styles.supplierPaymentText}>Pago a Proveedor</Text>
            </TouchableOpacity>
            {/* 🚀 Botón ¿Cómo enviar? o Cambiar Método */}
            <TouchableOpacity
              style={[
                styles.requestShipmentButton,
                selectedIds.length > 0 && packages.some(p => selectedIds.includes(p.id) && p.status === 'ready_pickup') && { backgroundColor: '#00796B' }
              ]}
              onPress={() => {
                // Si hay paquetes en "ready_pickup" seleccionados → cambiar método de envío
                if (selectedIds.length > 0) {
                  const selectedPkgs = packages.filter(p => selectedIds.includes(p.id));
                  const hasPickupPackages = selectedPkgs.some(p => p.status === 'ready_pickup');
                  if (hasPickupPackages) {
                    navigation.navigate('DeliveryInstructions', {
                      package: selectedPkgs[0],
                      packages: selectedPkgs,
                      user,
                      token,
                      isChangingFromPickup: true,
                    });
                    return;
                  }
                }
                // Caso por defecto: guía de servicios con tutoriales y direcciones personalizadas
                navigation.navigate('ServicesGuide', { user, token });
              }}
            >
              <Ionicons 
                name={selectedIds.length > 0 && packages.some(p => selectedIds.includes(p.id) && p.status === 'ready_pickup') ? "swap-horizontal" : "arrow-forward"} 
                size={16} 
                color="white" 
              />
              <Text style={styles.requestShipmentText}>
                {selectedIds.length > 0 && packages.some(p => selectedIds.includes(p.id) && p.status === 'ready_pickup') 
                  ? 'Cambiar' 
                  : '¿Cómo enviar?'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* 🔍 Botones de Acción - Rastreo, Instrucciones, Historial */}
        <View style={styles.headerActionButtons}>
          {/* 🔍 Rastreo */}
          <Pressable
            style={styles.headerActionButton}
            onPress={() => {
              setTrackingSearch('');
              setTrackedPackage(null);
              setTrackingError('');
              setShowTrackingModal(true);
            }}
          >
            <View style={styles.headerActionIcon}>
              <Ionicons name="search" size={20} color="#374151" />
            </View>
            <Text style={styles.headerActionLabel}>Rastreo</Text>
          </Pressable>

          {/* ❌ Sin Instrucciones */}
          <Pressable
            style={styles.headerActionButton}
            onPress={() => {
              if (instructionFilter === false) {
                setInstructionFilter(null);
                setSelectedIds([]);
              } else {
                if (serviceFilter === null) {
                  Alert.alert(
                    '📦 Selecciona un servicio',
                    'Primero selecciona un tipo de servicio para filtrar.',
                    [{ text: 'OK' }]
                  );
                  return;
                }
                setInstructionFilter(false);
                const withoutInstr = packages.filter(pkg => {
                  if (serviceFilter === 'air' && pkg.shipment_type !== 'china_air') return false;
                  if (serviceFilter === 'maritime' && pkg.shipment_type !== 'maritime' && pkg.shipment_type !== 'fcl') return false;
                  if (serviceFilter === 'dhl' && pkg.shipment_type !== 'dhl') return false;
                  if (serviceFilter === 'usa' && pkg.service_type !== 'POBOX_USA') return false;
                  return !((pkg as any).delivery_address_id || (pkg as any).assigned_address_id);
                });
                setSelectedIds(withoutInstr.map(p => p.id));
              }
            }}
          >
            <View style={[
              styles.headerActionIcon,
              instructionFilter === false && styles.headerActionIconActive
            ]}>
              <Ionicons name="close" size={20} color={instructionFilter === false ? '#FFF' : '#374151'} />
            </View>
            <Text style={[styles.headerActionLabel, instructionFilter === false && styles.headerActionLabelActive]}>
              Sin Instrucciones
            </Text>
          </Pressable>

          {/* ✅ Con Instrucciones */}
          <Pressable
            style={styles.headerActionButton}
            onPress={() => {
              if (instructionFilter === true) {
                setInstructionFilter(null);
                setSelectedIds([]);
              } else {
                if (serviceFilter === null) {
                  Alert.alert(
                    '📦 Selecciona un servicio',
                    'Primero selecciona un tipo de servicio para filtrar.',
                    [{ text: 'OK' }]
                  );
                  return;
                }
                setInstructionFilter(true);
                const withInstr = packages.filter(pkg => {
                  if (serviceFilter === 'air' && pkg.shipment_type !== 'china_air') return false;
                  if (serviceFilter === 'maritime' && pkg.shipment_type !== 'maritime' && pkg.shipment_type !== 'fcl') return false;
                  if (serviceFilter === 'dhl' && pkg.shipment_type !== 'dhl') return false;
                  if (serviceFilter === 'usa' && pkg.service_type !== 'POBOX_USA') return false;
                  // Solo paquetes con instrucciones Y NO pagados
                  const hasInstructions = !!((pkg as any).delivery_address_id || (pkg as any).assigned_address_id);
                  const isPaid = (pkg as any).client_paid === true;
                  return hasInstructions && !isPaid;
                });
                setSelectedIds(withInstr.map(p => p.id));
              }
            }}
          >
            <View style={[
              styles.headerActionIcon,
              instructionFilter === true && styles.headerActionIconActive
            ]}>
              <Ionicons name="checkmark" size={20} color={instructionFilter === true ? '#FFF' : '#374151'} />
            </View>
            <Text style={[styles.headerActionLabel, instructionFilter === true && styles.headerActionLabelActive]}>
              Con Instrucciones
            </Text>
          </Pressable>

          {/* 📜 Historial */}
          <Pressable
            style={styles.headerActionButton}
            onPress={loadHistoryPackages}
          >
            <View style={styles.headerActionIcon}>
              <Ionicons name="time" size={20} color="#374151" />
            </View>
            <Text style={styles.headerActionLabel}>Historial</Text>
          </Pressable>
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
              {user.virtualClabe
                ? `Deposita a tu CLABE: ${user.virtualClabe}`
                : 'Contacta a soporte para regularizar tu adeudo.'}
            </Text>
          </View>
        </View>
      )}

      {/* Lista de paquetes con Carrusel y Filtros en el Header */}
      <FlatList
        data={packages.filter(pkg => {
          // 📜 Excluir paquetes entregados Y pagados (esos van solo en Historial)
          const isDelivered = pkg.status === 'delivered';
          const isPaid = (pkg as any).client_paid === true || 
                         ((pkg as any).saldo_pendiente !== undefined && (pkg as any).saldo_pendiente <= 0) ||
                         ((pkg as any).assigned_cost_mxn === 0);
          if (isDelivered && isPaid) return false;
          
          // Filtro por tipo de servicio
          if (serviceFilter === null) return true;
          // Aéreo: TDI China Air
          if (serviceFilter === 'air') return pkg.shipment_type === 'china_air';
          // Marítimo: LCL (maritime) + FCL (fcl)
          if (serviceFilter === 'maritime') return pkg.shipment_type === 'maritime' || pkg.shipment_type === 'fcl';
          // DHL: Solo paquetes DHL Monterrey
          if (serviceFilter === 'dhl') return pkg.shipment_type === 'dhl';
          // PO Box USA: service_type POBOX_USA
          if (serviceFilter === 'usa') return pkg.service_type === 'POBOX_USA';
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
                customOpportunities={carouselSlides.length > 0 ? carouselSlides : undefined}
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
                        `¡Comparte tu código y gana!\n\nTu código: ${user.boxId}\n\nPor cada amigo que haga su primer envío, tú ganas $500 MXN de crédito.`,
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
                onPress={() => {
                  setSelectedIds([]);
                  setServiceFilter(serviceFilter === 'air' ? null : 'air');
                }}
              >
                <Text style={styles.filterIcon}>✈️</Text>
                <Text style={[styles.filterText, serviceFilter === 'air' && styles.filterTextActive]}>Aéreo</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, serviceFilter === 'maritime' && styles.filterChipActive]}
                onPress={() => {
                  setSelectedIds([]);
                  setServiceFilter(serviceFilter === 'maritime' ? null : 'maritime');
                }}
              >
                <Text style={styles.filterIcon}>🚢</Text>
                <Text style={[styles.filterText, serviceFilter === 'maritime' && styles.filterTextActive]}>Marítimo</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, serviceFilter === 'dhl' && styles.filterChipActive]}
                onPress={() => {
                  setSelectedIds([]);
                  setServiceFilter(serviceFilter === 'dhl' ? null : 'dhl');
                }}
              >
                <Text style={styles.filterIcon}>🚚</Text>
                <Text style={[styles.filterText, serviceFilter === 'dhl' && styles.filterTextActive]}>MTY</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, serviceFilter === 'usa' && styles.filterChipActive]}
                onPress={() => {
                  setSelectedIds([]);
                  setServiceFilter(serviceFilter === 'usa' ? null : 'usa');
                }}
              >
                <Text style={styles.filterIcon}>📦</Text>
                <Text style={[styles.filterText, serviceFilter === 'usa' && styles.filterTextActive]}>PO Box</Text>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={renderEmptyList}
        showsVerticalScrollIndicator={false}
      />

      {/* 🔥 FAB para ENVIAR/PAGAR - Solo aparece si hay selección */}
      {selectedIds.length > 0 && (() => {
        const firstSelectedPkg = packages.find(p => selectedIds.includes(p.id));
        const shipmentType = (firstSelectedPkg as any)?.shipment_type;
        const isMaritimeSelection = shipmentType === 'maritime';
        const isChinaAirSelection = shipmentType === 'china_air';
        const isDHLSelection = shipmentType === 'dhl';
        
        // 📦 PO Box USA: Detectar si son paquetes en bodega o procesando
        const isPOBoxUSA = !shipmentType || shipmentType === 'air';
        const isProcessingSelection = isPOBoxUSA && firstSelectedPkg?.status === 'processing';
        const isWarehouseSelection = isPOBoxUSA && firstSelectedPkg?.status === 'received';
        
        // 🔍 Verificar si TODOS los paquetes seleccionados ya tienen instrucciones
        const allSelectedHaveInstructions = packages
          .filter(p => selectedIds.includes(p.id))
          .every(p => (p as any).delivery_address_id || (p as any).assigned_address_id);
        
        // 🎯 Paquetes en bodega necesitan instrucciones (dirección de envío) - SOLO si NO tienen instrucciones
        const needsInstructions = (isMaritimeSelection || isChinaAirSelection || isDHLSelection || isWarehouseSelection) && !allSelectedHaveInstructions;
        
        // Calcular total a pagar para paquetes procesando
        // 🔧 FIX: Solo filtrar paquetes del mismo tipo de servicio seleccionado Y que no estén pagados
        const selectedPackages = packages.filter(p => {
          if (!selectedIds.includes(p.id)) return false;
          // 🔧 FIX: Excluir paquetes ya pagados (saldo_pendiente <= 0)
          const saldo = parseFloat(String((p as any).saldo_pendiente || p.assigned_cost_mxn || 0));
          if (saldo <= 0) return false;
          // Si es PO Box USA, solo incluir paquetes POBOX_USA
          if (isPOBoxUSA) return p.service_type === 'POBOX_USA';
          // Si es marítimo, solo incluir marítimos
          if (isMaritimeSelection) return p.shipment_type === 'maritime' || p.shipment_type === 'fcl';
          // Si es China Air, solo incluir china_air
          if (isChinaAirSelection) return p.shipment_type === 'china_air';
          // Si es DHL, solo incluir DHL
          if (isDHLSelection) return p.shipment_type === 'dhl';
          return true;
        });
        // 🔧 FIX: Usar saldo_pendiente en lugar de assigned_cost_mxn para el total
        const totalToPay = selectedPackages.reduce((sum, p) => {
          const saldo = parseFloat(String((p as any).saldo_pendiente || p.assigned_cost_mxn || 0));
          return sum + saldo;
        }, 0);
        
        // 💰 Paquetes en bodega con instrucciones pueden pagar
        const canPayFromWarehouse = isWarehouseSelection && allSelectedHaveInstructions;

        // 🚫 "Solicitar Envío" está desactivado: solo se muestra el FAB cuando hay
        // una acción real (asignar instrucciones o pagar). En cualquier otro caso, ocultamos el botón.
        const showFab = needsInstructions || isProcessingSelection || canPayFromWarehouse;
        if (!showFab) return null;

        return (
          <FAB
            icon={needsInstructions 
              ? (isMaritimeSelection ? "ferry" : isChinaAirSelection ? "airplane" : isDHLSelection ? "truck-delivery" : "package-variant") 
              : "credit-card"}
            label={needsInstructions 
              ? `📋 Asignar Instrucciones (${selectedIds.length})`
              : `💳 Pagar $${totalToPay.toFixed(2)} (${selectedIds.length})`}
            style={[styles.fabSend, (isProcessingSelection || canPayFromWarehouse) && { backgroundColor: '#4CAF50' }]}
            color="white"
            onPress={() => {
              if (needsInstructions) {
                handleMaritimeInstructions();
              } else {
                // Pagar (procesando o bodega con instrucciones)
                navigation.navigate('PaymentSummary', {
                  packages: selectedPackages,
                  user,
                  token,
                });
              }
            }}
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
  // 🔔 Badge de notificaciones no leídas
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: ORANGE,
  },
  notificationBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
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
  // 🔍 Botones de Acción - Diseño Circular (Blanco/Negro/Naranja)
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 4,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonActive: {
    // Se aplica al icono, no al contenedor
  },
  actionButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    position: 'relative',
  },
  actionButtonIconActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  actionButtonLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  actionButtonLabelActive: {
    color: ORANGE,
    fontWeight: '700',
  },
  actionButtonBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: ORANGE,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  actionButtonBadgeActive: {
    backgroundColor: '#FFF',
    borderColor: ORANGE,
  },
  actionButtonBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFF',
  },
  actionButtonBadgeTextActive: {
    color: ORANGE,
  },
  // 📜 Estilos legacy para filtros (mantener por compatibilidad)
  instructionFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  instructionFilterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  instructionFilterChipActiveRed: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
    shadowOpacity: 0.15,
  },
  instructionFilterChipActiveGreen: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
    shadowOpacity: 0.15,
  },
  instructionFilterText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  instructionFilterTextActive: {
    color: '#FFF',
  },
  instructionFilterCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
    marginLeft: 4,
  },
  // 📜 Estilos para botón de Historial
  historyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  historyChipText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '600',
  },
  // 📜 Estilos para Modal de Historial
  historyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  historyModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  historyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  historyEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  historyEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  historyEmptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  historyCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyTrackingBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  historyTrackingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  historyDeliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  historyDeliveredText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  historyDescription: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
  historyDetailsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  historyDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyDetailText: {
    fontSize: 12,
    color: '#666',
  },
  historyReceivedBy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  historyReceivedByText: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  // 🔍 Estilos para botón de Rastreo
  trackingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#7DD3FC',
  },
  trackingChipText: {
    fontSize: 13,
    color: '#0EA5E9',
    fontWeight: '600',
  },
  // 🔍 Estilos para Modal de Rastreo
  trackingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  trackingModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  trackingModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  trackingModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  trackingSearchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  trackingInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  trackingInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
    color: '#333',
  },
  trackingSearchButton: {
    backgroundColor: '#0EA5E9',
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackingSearchButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  trackingErrorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  trackingErrorText: {
    fontSize: 14,
    color: '#EF4444',
    marginTop: 12,
    textAlign: 'center',
  },
  trackingEmptyState: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  trackingEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  trackingEmptySubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 6,
    textAlign: 'center',
  },
  trackedPackageCard: {
    marginHorizontal: 16,
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  trackedPackageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  trackedPackageTracking: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  trackedPackageDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    maxWidth: 180,
  },
  trackedStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  trackedStatusDelivered: {
    backgroundColor: '#D1FAE5',
  },
  trackedStatusTransit: {
    backgroundColor: '#DBEAFE',
  },
  trackedStatusWarehouse: {
    backgroundColor: '#FEF3C7',
  },
  trackedStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
  trackedPackageDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  trackedTimeline: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    marginTop: 4,
  },
  timelineDotGreen: {
    backgroundColor: '#10B981',
  },
  timelineDotBlue: {
    backgroundColor: '#3B82F6',
  },
  timelineDotOrange: {
    backgroundColor: ORANGE,
  },
  timelineDotGray: {
    backgroundColor: '#D1D5DB',
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  timelineDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  timelineSubtext: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 2,
  },
  trackedDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  trackedDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackedDetailText: {
    fontSize: 13,
    color: '#666',
  },
  // Estilos legacy (mantener por compatibilidad)
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
    marginBottom: 10,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterOptionActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  filterOptionText: {
    fontSize: 13,
    color: '#333',
  },
  filterOptionTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  filterActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  clearAllFiltersButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  clearAllFiltersText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  applyFiltersButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ORANGE,
    alignItems: 'center',
  },
  applyFiltersText: {
    fontSize: 14,
    color: 'white',
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
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 15,
  },
  userTextContainer: {
    alignItems: 'center',
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BLACK,
    textAlign: 'center',
  },
  boxId: {
    fontSize: 14,
    color: '#666',
    marginTop: 3,
    textAlign: 'center',
  },
  headerButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  supplierPaymentButton: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 25,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  supplierPaymentText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  requestShipmentButton: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 25,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  requestShipmentText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  // 🎯 Estilos para filtros en el header
  headerServiceFilters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  headerFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  headerFilterChipActive: {
    backgroundColor: '#FFF3E0',
    borderColor: ORANGE,
  },
  headerFilterText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  headerFilterTextActive: {
    color: ORANGE,
    fontWeight: '600',
  },
  // 🔍 Estilos para botones de acción en el header
  headerActionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  headerActionButton: {
    alignItems: 'center',
    flex: 1,
  },
  headerActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionIconActive: {
    backgroundColor: ORANGE,
  },
  headerActionLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  headerActionLabelActive: {
    color: ORANGE,
    fontWeight: '600',
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
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  multiPackageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9C27B0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  multiPackageText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
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
  // 🏷️ Badges compactos (solo íconos)
  compactBadgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  iconOnlyBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandBadgesButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  expandedBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
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
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  deliveryAssignedText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8B5CF6',
  },
  assignedCarrierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
    marginTop: 6,
    marginBottom: 2,
  },
  assignedCarrierText: {
    fontSize: 11,
    fontWeight: '700',
    color: ORANGE,
  },
  // � Badge Orden de Pago Pendiente
  pendingPaymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  pendingPaymentBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#F59E0B',
  },
  // �💰 Badge Pagado
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  paidBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#10B981',
  },
  // 💰 Badge No Pagado
  unpaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF444420',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  unpaidBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#EF4444',
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
    backgroundColor: '#F05A28', // Naranja EntregaX - Protegido
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
    backgroundColor: '#C1272D', // Rojo EntregaX - Sin protección
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
