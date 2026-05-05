/**
 * EmployeeHomeScreen - Hub Principal para Empleados
 * 
 * Muestra módulos de trabajo según el rol del empleado:
 * - Repartidor: Carga de unidad, entregas, retornos
 * - Bodega (warehouse_ops): Escaneo de paquetes
 * - Mostrador (counter_staff): Atención a clientes
 * - Servicio a Cliente (customer_service): CRM, soporte
 * - Gerente (branch_manager): Dashboard de sucursal
 * - Admin/Director: Acceso completo
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  Image,
  Share,
  Clipboard,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, Avatar, Divider, Icon, Chip, Surface } from 'react-native-paper';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api, API_URL } from '../services/api';
import { changeLanguage, getCurrentLanguage } from '../i18n';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const ORANGE = '#F05A28';
const BLACK = '#111111';

// Roles de asesor
const ADVISOR_ROLES = ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'];

// Interface para datos del asesor
interface AdvisorDashboardData {
  advisor: {
    id: number;
    fullName: string;
    email: string;
    referralCode: string;
    boxId: string;
    role: string;
    joinedAt: string;
  };
  clients: {
    total: number;
    new7d: number;
    new30d: number;
    verified: number;
    pendingVerification: number;
    active: number;
    dormant: number;
  };
  shipments: {
    inTransit: number;
    awaitingPayment: number;
    missingInstructions: number;
  };
  commissions: {
    monthVolumeMxn: number;
    monthPaidCount: number;
  };
  subAdvisors: number;
}

interface ModuleCard {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconFamily: 'ionicons' | 'material';
  color: string;
  screen: string;
  roles: string[];
  requiresOnboarding: boolean;
  badge?: number;
  moduleKey?: string; // Key para sub-módulos PO Box (receive, entry, exit, etc.)
  panelKey?: string;  // Key del panel de operaciones (ops_china_air, ops_mx_cedis, etc.)
  hideIfPOBox?: boolean; // Ocultar si tiene permisos PO Box
  comingSoon?: boolean; // Mostrar como "Próximamente" sin navegación
}

// Definición de módulos por rol
const EMPLOYEE_MODULES: ModuleCard[] = [
  // === REPARTIDOR ===
  {
    id: 'driver_home',
    title: 'Mi Ruta del Día',
    subtitle: 'Ver paquetes asignados y estadísticas',
    icon: 'map',
    iconFamily: 'ionicons',
    color: '#4CAF50',
    screen: 'DriverHome',
    roles: ['repartidor', 'monitoreo'],
    requiresOnboarding: true,
  },
  {
    id: 'vehicle_inspection',
    title: 'Inspección Vehicular',
    subtitle: 'Checklist diario de tu unidad',
    icon: 'car-outline',
    iconFamily: 'ionicons',
    color: '#FF9800',
    screen: 'VehicleInspection',
    roles: [],
    requiresOnboarding: true,
  },
  {
    id: 'loading_van',
    title: 'Cargar Unidad',
    subtitle: 'Escanear paquetes para cargar',
    icon: 'cube-outline',
    iconFamily: 'ionicons',
    color: '#2196F3',
    screen: 'LoadingVan',
    roles: [],
    requiresOnboarding: true,
  },
  {
    id: 'delivery_confirm',
    title: 'Confirmar Entrega',
    subtitle: 'Escanear, firma y foto',
    icon: 'checkmark-circle-outline',
    iconFamily: 'ionicons',
    color: '#4CAF50',
    screen: 'DeliveryConfirm',
    roles: [],
    requiresOnboarding: true,
  },
  {
    id: 'return_scan',
    title: 'Retorno a Bodega',
    subtitle: 'Devolver paquetes no entregados',
    icon: 'return-down-back-outline',
    iconFamily: 'ionicons',
    color: '#9C27B0',
    screen: 'ReturnScan',
    roles: [],
    requiresOnboarding: true,
  },
  
  // === BODEGA (warehouse_ops) - Legacy ===
  {
    id: 'warehouse_scanner',
    title: 'Escáner de Bodega',
    subtitle: 'Entrada y salida de paquetes',
    icon: 'barcode-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'WarehouseScanner',
    roles: ['warehouse_ops', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    hideIfPOBox: true, // Ocultar si tiene permisos PO Box (usa Entrada/Salida)
  },
  {
    id: 'warehouse_inventory',
    title: 'Inventario CEDIS',
    subtitle: 'Ver paquetes en bodega',
    icon: 'file-tray-stacked-outline',
    iconFamily: 'ionicons',
    color: '#607D8B',
    screen: 'WarehouseInventory',
    roles: ['warehouse_ops', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    hideIfPOBox: true, // Usar módulo 'inventory' de PO Box
  },
  
  // === MOSTRADOR (counter_staff) - Hub PO Box USA ===
  {
    id: 'panel_usa_pobox',
    title: 'PO Box USA',
    subtitle: 'Recibir, Entrada, Salida, Cotizar, Reempaque, Inventario',
    icon: 'mail-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'POBoxHub',
    roles: ['counter_staff', 'warehouse_ops', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    panelKey: 'ops_usa_pobox',
  },

  // === PANELES DE OPERACIONES (panelKey - permisos por panel) ===
  {
    id: 'panel_china_air',
    title: 'TDI Aéreo China',
    subtitle: 'Recepción de envíos aéreos desde China',
    icon: 'airplane-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'ChinaAirHub',
    roles: ['warehouse_ops', 'counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    panelKey: 'ops_china_air',
  },
  {
    id: 'panel_china_sea',
    title: 'Marítimo China',
    subtitle: 'Recepción de consolidados marítimos',
    icon: 'boat-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'ChinaSeaHub',
    roles: ['warehouse_ops', 'counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    panelKey: 'ops_china_sea',
  },
  {
    id: 'panel_mx_cedis',
    title: 'DHL Monterrey',
    subtitle: 'Liberación AA DHL',
    icon: 'business-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'DhlOperations',
    roles: ['warehouse_ops', 'counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    panelKey: 'ops_mx_cedis',
  },
  {
    id: 'panel_mx_national',
    title: 'Nacional México',
    subtitle: 'Envíos nacionales',
    icon: 'location-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'EmployeeHome',
    roles: ['warehouse_ops', 'counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    panelKey: 'ops_mx_national',
    comingSoon: true,
  },
  {
    id: 'panel_scanner',
    title: 'Escáner Multi-Sucursal',
    subtitle: 'Consulta detallada de cualquier guía',
    icon: 'barcode-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'WarehouseScanner',
    roles: ['warehouse_ops', 'counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    panelKey: 'ops_scanner',
  },
  {
    id: 'panel_inventory',
    title: 'Inventario por Sucursal',
    subtitle: 'Control de paquetes en bodega',
    icon: 'file-tray-stacked-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'WarehouseInventory',
    roles: ['warehouse_ops', 'counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    panelKey: 'ops_inventory',
  },
  {
    id: 'panel_relabeling',
    title: 'Módulo de etiquetado',
    subtitle: 'Reimprime etiquetas de cualquier servicio',
    icon: 'print-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'Relabeling',
    roles: ['warehouse_ops', 'counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    panelKey: 'ops_relabeling',
  },

  // Legacy counter modules (mantener compatibilidad)
  {
    id: 'counter_pickup',
    title: 'Entrega en Mostrador',
    subtitle: 'Entregar paquetes a clientes',
    icon: 'storefront-outline',
    iconFamily: 'ionicons',
    color: '#00BCD4',
    screen: 'CounterPickup',
    roles: ['branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    hideIfPOBox: true, // Ocultar si tiene permisos PO Box
  },
  {
    id: 'counter_reception',
    title: 'Recepción de Paquetes',
    subtitle: 'Recibir envíos de clientes',
    icon: 'download-outline',
    iconFamily: 'ionicons',
    color: '#8BC34A',
    screen: 'CounterReception',
    roles: ['branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
    hideIfPOBox: true, // Ocultar si tiene permisos PO Box
  },
  
  // === SERVICIO A CLIENTE ===
  {
    id: 'support_tickets',
    title: 'Tickets de Soporte',
    subtitle: 'Atender consultas de clientes',
    icon: 'chatbubbles-outline',
    iconFamily: 'ionicons',
    color: '#3F51B5',
    screen: 'SupportTickets',
    roles: ['customer_service', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: false,
  },
  {
    id: 'client_lookup',
    title: 'Buscar Cliente',
    subtitle: 'Consultar info y paquetes',
    icon: 'search-outline',
    iconFamily: 'ionicons',
    color: '#795548',
    screen: 'ClientLookup',
    roles: ['customer_service', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: false,
    hideIfPOBox: true, // El personal de mostrador usa los módulos PO Box
  },
  
  // === GERENTE DE SUCURSAL ===
  {
    id: 'branch_dashboard',
    title: 'Dashboard Sucursal',
    subtitle: 'Métricas y rendimiento',
    icon: 'analytics-outline',
    iconFamily: 'ionicons',
    color: '#E91E63',
    screen: 'BranchDashboard',
    roles: ['branch_manager', 'director', 'admin', 'super_admin'],
    requiresOnboarding: true,
  },
  {
    id: 'team_management',
    title: 'Mi Equipo',
    subtitle: 'Gestionar empleados',
    icon: 'people-outline',
    iconFamily: 'ionicons',
    color: '#673AB7',
    screen: 'TeamManagement',
    roles: ['branch_manager', 'director', 'admin', 'super_admin'],
    requiresOnboarding: true,
  },
  
  // === OPERACIONES ===
  {
    id: 'dispatch',
    title: 'Despacho de Rutas',
    subtitle: 'Asignar paquetes a repartidores',
    icon: 'git-branch-outline',
    iconFamily: 'ionicons',
    color: '#FF5722',
    screen: 'DispatchRoutes',
    roles: ['branch_manager', 'director', 'admin', 'super_admin'],
    requiresOnboarding: true,
  },
  
  // === ASESORES ===
  // Solo mostramos Panel de Asesor - las demás opciones están dentro del panel
  {
    id: 'advisor_dashboard',
    title: 'Panel de Asesor',
    subtitle: 'Clientes, comisiones y referidos',
    icon: 'analytics-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'AdvisorDashboard',
    roles: ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'],
    requiresOnboarding: false,
  },
];

// Mapeo de roles a labels legibles
const ROLE_LABELS: Record<string, string> = {
  repartidor: '🚚 Repartidor',
  warehouse_ops: '📦 Operaciones de Bodega',
  counter_staff: '🏪 Mostrador',
  advisor: '💼 Asesor',
  asesor: '💼 Asesor',
  asesor_lider: '👔 Asesor Líder',
  sub_advisor: '💼 Sub Asesor',
  customer_service: '💬 Servicio a Cliente',
  branch_manager: '👔 Operacion CEDIS',
  director: '📊 Director',
  admin: '⚙️ Administrador',
  super_admin: '👑 Super Administrador',
};

export default function EmployeeHomeScreen({ navigation, route }: any) {
  const { user: initialUser, token } = route.params;
  const { t } = useTranslation();
  const [user, setUser] = useState(initialUser);
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [poboxPermissions, setPOBoxPermissions] = useState<string[]>([]);
  const [panelPermissions, setPanelPermissions] = useState<string[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  
  // Estados para el panel del asesor
  const [advisorData, setAdvisorData] = useState<AdvisorDashboardData | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const isAdvisor = ADVISOR_ROLES.includes(user.role);

  // Estados para idioma y notificaciones
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Cargar datos del asesor
  const loadAdvisorData = useCallback(async () => {
    if (!isAdvisor) return;
    
    try {
      setAdvisorLoading(true);
      const response = await fetch(`${API_URL}/api/advisor/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const result = await response.json();
        setAdvisorData(result);
      }
    } catch (err) {
      console.error('Error loading advisor dashboard:', err);
    } finally {
      setAdvisorLoading(false);
    }
  }, [token, isAdvisor]);

  // 🔔 Obtener conteo de notificaciones no leídas
  const fetchUnreadNotifications = useCallback(async () => {
    try {
      const endpoint = isAdvisor 
        ? `${API_URL}/api/advisor/notifications/unread-count`
        : `${API_URL}/api/notifications/unread-count`;
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        let count = data.count || data.unreadCount || 0;
        // Si el asesor no está verificado, asegurar que al menos haya 1 notificación
        if (isAdvisor && !user.isVerified) {
          count = Math.max(count, 1);
        }
        setUnreadNotifications(count);
      } else if (isAdvisor && !user.isVerified) {
        // Incluso si falla el endpoint, mostrar badge si no está verificado
        setUnreadNotifications(1);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      if (isAdvisor && !user.isVerified) {
        setUnreadNotifications(1);
      }
    }
  }, [token, isAdvisor, user.isVerified]);

  // 🌐 Cambiar idioma
  const handleChangeLanguage = async (lang: string) => {
    await changeLanguage(lang);
    setCurrentLang(lang);
    setShowLanguageModal(false);
  };

  const getLanguageFlag = (lang: string) => {
    switch (lang) {
      case 'es': return '🇲🇽';
      case 'en': return '🇺🇸';
      case 'zh': return '🇨🇳';
      default: return '🌐';
    }
  };

  // Funciones del asesor
  const copyReferralCode = () => {
    if (advisorData?.advisor.referralCode) {
      Clipboard.setString(advisorData.advisor.referralCode);
      Alert.alert(`✅ ${t('advisorPanel.copied')}`, t('advisorPanel.codeCopied'));
    }
  };

  const shareReferralCode = async () => {
    if (advisorData?.advisor.referralCode) {
      try {
        await Share.share({
          message: `¡Únete a EntregaX con mi código ${advisorData.advisor.referralCode} y obtén beneficios exclusivos! 📦✈️ Descarga la app: https://entregax.com/app`,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    }
  };

  // Cargar permisos de módulos PO Box desde el API
  const loadModulePermissions = useCallback(async () => {
    try {
      // Si es super_admin, tiene acceso a todo
      if (user.role === 'super_admin') {
        setPOBoxPermissions(['receive', 'entry', 'exit', 'collect', 'quote', 'repack', 'inventory']);
        setPanelPermissions([
          'ops_usa_pobox', 'ops_china_air', 'ops_china_sea',
          'ops_mx_cedis', 'ops_mx_national', 'ops_scanner',
          'ops_inventory', 'ops_relabeling',
        ]);
        setPermissionsLoaded(true);
        return;
      }

      // 1) Cargar paneles (operaciones de alto nivel)
      try {
        const panelsRes = await fetch(`${API_URL}/api/panels/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (panelsRes.ok) {
          const data = await panelsRes.json();
          const allowedPanels = (data.panels || [])
            .filter((p: { can_view: boolean }) => p.can_view)
            .map((p: { panel_key: string }) => p.panel_key);
          console.log('🏭 Paneles permitidos:', allowedPanels);
          setPanelPermissions(allowedPanels);
        }
      } catch (e) {
        console.warn('No se pudieron cargar paneles:', e);
      }

      // 2) Cargar sub-módulos de PO Box USA
      const response = await fetch(`${API_URL}/api/modules/ops_usa_pobox/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const allowed = (data.modules || [])
          .filter((m: { can_view: boolean }) => m.can_view)
          .map((m: { module_key: string }) => m.module_key);
        
        console.log('📋 Permisos PO Box del usuario:', allowed);
        console.log('📍 Ubicaciones permitidas:', data.locations || []);
        setPOBoxPermissions(allowed);
      }
    } catch (error) {
      console.error('Error cargando permisos de módulos:', error);
      setPOBoxPermissions([]);
      setPanelPermissions([]);
    } finally {
      setPermissionsLoaded(true);
    }
  }, [token, user.role]);

  useEffect(() => {
    loadModulePermissions();
  }, [loadModulePermissions]);

  // Filtrar módulos según el rol del usuario Y permisos de PO Box / paneles
  const availableModules = EMPLOYEE_MODULES.filter(module => {
    // Primero verificar si el rol tiene acceso
    if (!module.roles.includes(user.role)) {
      return false;
    }

    // Si el módulo tiene panelKey, verificar permiso de panel
    if (module.panelKey) {
      return panelPermissions.includes(module.panelKey);
    }
    
    // Si el módulo tiene moduleKey (sub-módulo PO Box), verificar permiso específico
    if (module.moduleKey) {
      return poboxPermissions.includes(module.moduleKey);
    }
    
    // Si tiene hideIfPOBox y el usuario tiene permisos PO Box, ocultar
    if (module.hideIfPOBox && poboxPermissions.length > 0) {
      return false;
    }
    
    return true;
  });

  const isOnboarded = user.isEmployeeOnboarded === true;

  // Refrescar datos del usuario
  const refreshUserData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser((prev: any) => ({
          ...prev,
          isVerified: data.is_verified,
          verificationStatus: data.verification_status,
          isEmployeeOnboarded: data.is_employee_onboarded,
          profilePhotoUrl: data.profile_photo_url,
          privacyAcceptedAt: data.privacy_accepted_at,
        }));
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  }, [token]);

  // Cargar estadísticas según rol
  const loadStats = useCallback(async () => {
    try {
      if (user.role === 'repartidor' || user.role === 'monitoreo') {
        const res = await api.get('/api/driver/route-today');
        if (res.data.success) {
          setStats(res.data.route);
        }
      }
      // Agregar más stats para otros roles según se desarrollen
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, [user.role]);

  useFocusEffect(
    useCallback(() => {
      refreshUserData();
      if (isOnboarded) {
        loadStats();
      }
      // Cargar datos del asesor si es asesor
      if (isAdvisor) {
        loadAdvisorData();
      }
      fetchUnreadNotifications();
    }, [refreshUserData, loadStats, isOnboarded, isAdvisor, loadAdvisorData, fetchUnreadNotifications])
  );

  const onRefresh = () => {
    setRefreshing(true);
    refreshUserData();
    loadStats();
    fetchUnreadNotifications();
    if (isAdvisor) {
      loadAdvisorData();
    }
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleLogout = () => {
    navigation.replace('Login');
  };

  const handleModulePress = (module: ModuleCard) => {
    if (module.requiresOnboarding && !isOnboarded) {
      Alert.alert(
        '⚠️ Alta Requerida',
        'Debes completar tu alta como empleado antes de acceder a este módulo.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Completar Alta', onPress: () => navigation.navigate('EmployeeOnboarding', { user, token }) }
        ]
      );
      return;
    }
    
    // Módulos marcados como próximamente (panel sin pantalla móvil aún)
    if (module.comingSoon) {
      Alert.alert(
        `🚧 ${module.title}`,
        'Este panel estará disponible próximamente en la app móvil.\n\nPor el momento puedes acceder desde el Panel Web.',
        [{ text: 'Entendido', style: 'default' }]
      );
      return;
    }

    // Pantallas que aún no están implementadas
    const notImplementedScreens = ['CounterPickup', 'CounterReception', 'SupportTickets', 'ClientLookup', 'BranchDashboard', 'TeamManagement', 'Dispatch', 'ShiftReport', 'WarehouseInventory'];
    if (notImplementedScreens.includes(module.screen)) {
      Alert.alert(
        `📱 ${module.title}`,
        `Este módulo estará disponible próximamente.\n\nPuedes usar el Panel Web para acceder a esta función.`,
        [{ text: 'Entendido', style: 'default' }]
      );
      return;
    }
    
    // Navegar al módulo
    navigation.navigate(module.screen, { user, token });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('advisorPanel.goodMorning');
    if (hour < 18) return t('advisorPanel.goodAfternoon');
    return t('advisorPanel.goodEvening');
  };

  const renderModuleCard = (module: ModuleCard) => {
    const IconComponent = module.iconFamily === 'ionicons' ? Ionicons : MaterialIcons;
    const isDisabled = module.requiresOnboarding && !isOnboarded;
    
    return (
      <TouchableOpacity
        key={module.id}
        style={[styles.moduleCard, isDisabled && styles.moduleCardDisabled]}
        onPress={() => handleModulePress(module)}
        disabled={isDisabled}
      >
        <View style={[styles.moduleIcon, { backgroundColor: module.color }]}>
          <IconComponent name={module.icon as any} size={28} color="#fff" />
          {module.badge && module.badge > 0 && (
            <View style={styles.moduleBadge}>
              <Text style={styles.moduleBadgeText}>{module.badge}</Text>
            </View>
          )}
        </View>
        <View style={styles.moduleContent}>
          <Text style={[styles.moduleTitle, isDisabled && styles.moduleTextDisabled]}>
            {module.title}
          </Text>
          <Text style={[styles.moduleSubtitle, isDisabled && styles.moduleTextDisabled]}>
            {module.subtitle}
          </Text>
        </View>
        <Ionicons 
          name="chevron-forward" 
          size={20} 
          color={isDisabled ? '#ccc' : '#999'} 
        />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <Appbar.Header style={styles.appbar}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 12 }}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={{ width: 110, height: 30, resizeMode: 'contain' }}
          />
        </View>
        <TouchableOpacity 
          onPress={() => setShowLanguageModal(true)}
          style={styles.languageButton}
        >
          <Text style={styles.languageFlag}>{getLanguageFlag(currentLang)}</Text>
        </TouchableOpacity>
        {/* 🔔 Notificaciones */}
        <View style={{ position: 'relative' }}>
          <Appbar.Action 
            icon="bell-outline" 
            onPress={() => {
              if (isAdvisor) {
                navigation.navigate('AdvisorNotifications', { user, token });
              } else {
                navigation.navigate('Notifications', { user, token });
              }
            }} 
            color="white" 
          />
          {unreadNotifications > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadNotifications <= 9 ? unreadNotifications : '9+'}
              </Text>
            </View>
          )}
        </View>
        <Appbar.Action icon="menu" onPress={() => setShowMenu(true)} color="white" />
      </Appbar.Header>

      <ScrollView
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={[ORANGE]}
          />
        }
      >
        {/* Header de Usuario */}
        <View style={styles.userHeader}>
          <View style={styles.userRow}>
            {user.profilePhotoUrl ? (
              <Avatar.Image 
                size={48} 
                source={{ uri: user.profilePhotoUrl }}
              />
            ) : (
              <Avatar.Text 
                size={48} 
                label={user.name?.charAt(0) || 'E'} 
                style={{ backgroundColor: ORANGE }}
              />
            )}
            <View style={styles.userInfo}>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName}>{user.name}</Text>
              <View style={styles.roleChip}>
                <Text style={styles.roleText}>
                  {ROLE_LABELS[user.role] || user.role}
                </Text>
              </View>
            </View>
          </View>

          {/* Banner de Onboarding Pendiente - No aplica para asesores */}
          {!isOnboarded && !isAdvisor && (
            <TouchableOpacity 
              style={styles.onboardingBanner}
              onPress={() => navigation.navigate('EmployeeOnboarding', { user, token })}
            >
              <Ionicons name="warning" size={24} color="#fff" />
              <View style={styles.onboardingContent}>
                <Text style={styles.onboardingTitle}>⚠️ {t('advisorPanel.pendingOnboarding')}</Text>
                <Text style={styles.onboardingSubtitle}>
                  {t('advisorPanel.completeRegistration')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Banner de Verificación Pendiente: empleado ya completó alta pero
              admin/director aún no aprueba sus documentos. */}
          {isOnboarded && !isAdvisor && user.verificationStatus === 'pending_review' && (
            <View style={[styles.onboardingBanner, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="time" size={24} color="#fff" />
              <View style={styles.onboardingContent}>
                <Text style={styles.onboardingTitle}>⏳ Pendiente de verificación</Text>
                <Text style={styles.onboardingSubtitle}>
                  Tu alta está siendo revisada por un administrador. Recibirás una notificación cuando sea aprobada.
                </Text>
              </View>
            </View>
          )}

          {/* Banner si la verificación fue rechazada */}
          {isOnboarded && !isAdvisor && user.verificationStatus === 'rejected' && (
            <TouchableOpacity
              style={[styles.onboardingBanner, { backgroundColor: '#DC2626' }]}
              onPress={() => navigation.navigate('EmployeeOnboarding', { user, token })}
            >
              <Ionicons name="close-circle" size={24} color="#fff" />
              <View style={styles.onboardingContent}>
                <Text style={styles.onboardingTitle}>❌ Verificación rechazada</Text>
                <Text style={styles.onboardingSubtitle}>
                  Toca aquí para volver a subir tus documentos.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Banner de Aviso de Privacidad Pendiente para Asesores */}
          {isAdvisor && !user.privacyAcceptedAt && (
            <TouchableOpacity 
              style={[styles.onboardingBanner, { backgroundColor: '#F59E0B' }]}
              onPress={() => navigation.navigate('EmployeeOnboarding', { user, token })}
            >
              <Ionicons name="document-text" size={24} color="#fff" />
              <View style={styles.onboardingContent}>
                <Text style={styles.onboardingTitle}>📋 {t('advisorPanel.acceptTerms')}</Text>
                <Text style={styles.onboardingSubtitle}>
                  {t('advisorPanel.acceptPrivacyNotice')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Stats para Repartidor / Monitoreo */}
          {(user.role === 'repartidor' || user.role === 'monitoreo') && isOnboarded && stats && (
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{stats.totalAssigned || 0}</Text>
                <Text style={styles.statLabel}>{t('advisorPanel.assigned')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: '#2196F3' }]}>
                  {stats.loadedToday || 0}
                </Text>
                <Text style={styles.statLabel}>{t('advisorPanel.loaded')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: '#4CAF50' }]}>
                  {stats.deliveredToday || 0}
                </Text>
                <Text style={styles.statLabel}>{t('advisorPanel.delivered')}</Text>
              </View>
            </View>
          )}
        </View>

        {/* =============== CONTENIDO PARA ASESORES =============== */}
        {isAdvisor && advisorData ? (
          <View style={{ paddingHorizontal: 16 }}>
            {/* Código de Referido - solo visible después de aceptar términos Y verificación */}
            {user.privacyAcceptedAt && user.isVerified ? (
              <View style={advStyles.referralCard}>
                <View style={advStyles.referralHeader}>
                  <Ionicons name="gift-outline" size={24} color={ORANGE} />
                  <Text style={advStyles.referralLabel}>{t('advisorPanel.referralCode')}</Text>
                </View>
                <Text style={advStyles.referralCode}>{advisorData.advisor.referralCode || t('advisorPanel.noCode')}</Text>
                <View style={advStyles.referralActions}>
                  <TouchableOpacity style={advStyles.referralButton} onPress={copyReferralCode}>
                    <Ionicons name="copy-outline" size={20} color="#fff" />
                    <Text style={advStyles.referralButtonText}>{t('advisorPanel.copy')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[advStyles.referralButton, advStyles.shareButton]} onPress={shareReferralCode}>
                    <Ionicons name="share-social-outline" size={20} color={ORANGE} />
                    <Text style={[advStyles.referralButtonText, { color: ORANGE }]}>{t('advisorPanel.share')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity 
                style={[advStyles.referralCard, { alignItems: 'center', paddingVertical: 16 }]}
                onPress={() => {
                  if (!user.privacyAcceptedAt) {
                    navigation.navigate('EmployeeOnboarding', { user, token });
                  } else {
                    navigation.navigate('MyProfile', { user, token });
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="lock-closed" size={28} color="#999" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#666', marginTop: 6, textAlign: 'center' }}>
                  🔒 Código de Referido Bloqueado
                </Text>
                <Text style={{ fontSize: 12, color: '#999', marginTop: 3, textAlign: 'center', paddingHorizontal: 10 }}>
                  {!user.privacyAcceptedAt 
                    ? 'Acepta los Términos y Condiciones para continuar'
                    : 'Completa tu verificación de identidad para desbloquear tu código'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: !user.privacyAcceptedAt ? '#F59E0B' : ORANGE, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Ionicons name={!user.privacyAcceptedAt ? 'document-text' : 'shield-checkmark'} size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6, fontSize: 13 }}>
                    {!user.privacyAcceptedAt ? 'Aceptar Términos' : 'Iniciar Verificación'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Mis Clientes */}
            <Text style={styles.sectionTitle}>👥 {t('advisorPanel.myClients')}</Text>
            <View style={advStyles.statsGrid}>
              <TouchableOpacity style={advStyles.statCard} onPress={() => navigation.navigate('AdvisorClients', { user, token })}>
                <Ionicons name="people" size={24} color={ORANGE} />
                <Text style={advStyles.statValue}>{advisorData.clients.total}</Text>
                <Text style={advStyles.statLabel}>{t('advisorPanel.totalClients')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={advStyles.statCard} onPress={() => navigation.navigate('AdvisorClients', { user, token })}>
                <Ionicons name="person-add" size={24} color="#4CAF50" />
                <Text style={advStyles.statValue}>{advisorData.clients.new7d}</Text>
                <Text style={advStyles.statLabel}>{t('advisorPanel.new7d')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={advStyles.statCard} onPress={() => navigation.navigate('AdvisorClients', { user, token })}>
                <Ionicons name="checkmark-circle" size={24} color="#2196F3" />
                <Text style={advStyles.statValue}>{advisorData.clients.active}</Text>
                <Text style={advStyles.statLabel}>{t('advisorPanel.active')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={advStyles.statCard} onPress={() => navigation.navigate('AdvisorClients', { user, token })}>
                <Ionicons name="moon" size={24} color="#9E9E9E" />
                <Text style={advStyles.statValue}>{advisorData.clients.dormant}</Text>
                <Text style={advStyles.statLabel}>{t('advisorPanel.dormant')}</Text>
              </TouchableOpacity>
            </View>

            {/* Embarques de Clientes */}
            <Text style={styles.sectionTitle}>📦 {t('advisorPanel.clientShipments')}</Text>
            <View style={advStyles.shipmentStats}>
              <View style={advStyles.shipmentStatItem}>
                <View style={[advStyles.shipmentIcon, { backgroundColor: '#2196F320' }]}>
                  <Ionicons name="airplane" size={20} color="#2196F3" />
                </View>
                <Text style={advStyles.shipmentValue}>{advisorData.shipments.inTransit}</Text>
                <Text style={advStyles.shipmentLabel}>{t('advisorPanel.inTransit')}</Text>
              </View>
              <View style={advStyles.shipmentStatItem}>
                <View style={[advStyles.shipmentIcon, { backgroundColor: '#FF980020' }]}>
                  <Ionicons name="card" size={20} color="#FF9800" />
                </View>
                <Text style={advStyles.shipmentValue}>{advisorData.shipments.awaitingPayment}</Text>
                <Text style={advStyles.shipmentLabel}>{t('advisorPanel.awaitingPayment')}</Text>
              </View>
              <View style={advStyles.shipmentStatItem}>
                <View style={[advStyles.shipmentIcon, { backgroundColor: '#f4433620' }]}>
                  <Ionicons name="alert-circle" size={20} color="#f44336" />
                </View>
                <Text style={advStyles.shipmentValue}>{advisorData.shipments.missingInstructions}</Text>
                <Text style={advStyles.shipmentLabel}>{t('advisorPanel.noInstructions')}</Text>
              </View>
            </View>

            {/* Comisiones del Mes */}
            <Text style={styles.sectionTitle}>💰 {t('advisorPanel.monthCommissions')}</Text>
            <View style={advStyles.commissionsCard}>
              <View style={advStyles.commissionRow}>
                <View>
                  <Text style={advStyles.commissionLabel}>{t('advisorPanel.billedVolume')}</Text>
                  <Text style={advStyles.commissionValue}>
                    ${advisorData.commissions.monthVolumeMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </Text>
                </View>
                <Chip icon="receipt" mode="outlined" textStyle={{ color: ORANGE }}>
                  {advisorData.commissions.monthPaidCount} {t('advisorPanel.payments')}
                </Chip>
              </View>
              <TouchableOpacity 
                style={advStyles.viewCommissionsButton}
                onPress={() => navigation.navigate('AdvisorCommissions', { user, token })}
              >
                <Text style={advStyles.viewCommissionsText}>{t('advisorPanel.viewCommissionHistory')}</Text>
                <Ionicons name="chevron-forward" size={20} color={ORANGE} />
              </TouchableOpacity>
            </View>

            {/* Acciones Rápidas del Asesor */}
            <Text style={styles.sectionTitle}>⚡ {t('advisorPanel.quickActions')}</Text>
            <View style={advStyles.quickActions}>
              <TouchableOpacity 
                style={advStyles.quickAction}
                onPress={() => navigation.navigate('AdvisorClients', { user, token })}
              >
                <View style={[advStyles.quickActionIcon, { backgroundColor: ORANGE + '20' }]}>
                  <Ionicons name="people" size={24} color={ORANGE} />
                </View>
                <Text style={advStyles.quickActionText}>{t('advisorPanel.myClients')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={advStyles.quickAction}
                onPress={() => navigation.navigate('AdvisorCommissions', { user, token })}
              >
                <View style={[advStyles.quickActionIcon, { backgroundColor: '#4CAF50' + '20' }]}>
                  <Ionicons name="cash" size={24} color="#4CAF50" />
                </View>
                <Text style={advStyles.quickActionText}>{t('advisorPanel.commissions')}</Text>
              </TouchableOpacity>
              
              {advisorData.subAdvisors > 0 && (
                <TouchableOpacity 
                  style={advStyles.quickAction}
                  onPress={() => navigation.navigate('AdvisorTeam', { user, token })}
                >
                  <View style={[advStyles.quickActionIcon, { backgroundColor: '#9C27B0' + '20' }]}>
                    <Ionicons name="people-circle" size={24} color="#9C27B0" />
                  </View>
                  <Text style={advStyles.quickActionText}>{t('advisorPanel.myTeam')} ({advisorData.subAdvisors})</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={advStyles.quickAction}
                onPress={() => navigation.navigate('SupportTickets', { user, token })}
              >
                <View style={[advStyles.quickActionIcon, { backgroundColor: '#FF9800' + '20' }]}>
                  <Ionicons name="headset" size={24} color="#FF9800" />
                </View>
                <Text style={advStyles.quickActionText}>{t('advisorPanel.support')}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={advStyles.quickAction}
                onPress={() => navigation.navigate('MyProfile', { user, token })}
              >
                <View style={[advStyles.quickActionIcon, { backgroundColor: '#607D8B' + '20' }]}>
                  <Ionicons name="person" size={24} color="#607D8B" />
                </View>
                <Text style={advStyles.quickActionText}>{t('advisorPanel.myProfile')}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={advStyles.quickAction}
                onPress={() => navigation.navigate('AdvisorClientTickets', { user, token })}
              >
                <View style={[advStyles.quickActionIcon, { backgroundColor: '#E91E63' + '20' }]}>
                  <Ionicons name="document-text" size={24} color="#E91E63" />
                </View>
                <Text style={advStyles.quickActionText}>{t('advisorPanel.reports')}</Text>
              </TouchableOpacity>
            </View>

            {/* Alerta de Clientes Pendientes */}
            {advisorData.clients.pendingVerification > 0 && (
              <TouchableOpacity 
                style={advStyles.alertCard}
                onPress={() => navigation.navigate('AdvisorClients', { user, token, filter: 'pending' })}
              >
                <Ionicons name="alert-circle" size={24} color="#FF9800" />
                <View style={advStyles.alertContent}>
                  <Text style={advStyles.alertTitle}>{t('advisorPanel.pendingClients')}</Text>
                  <Text style={advStyles.alertText}>
                    {advisorData.clients.pendingVerification} {t('advisorPanel.clientsAwaitingVerification')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#666" />
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </View>
        ) : isAdvisor && advisorLoading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="sync-outline" size={48} color={ORANGE} />
            <Text style={{ marginTop: 12, color: '#666' }}>Cargando panel...</Text>
          </View>
        ) : (
          <>
            {/* =============== CONTENIDO PARA OTROS EMPLEADOS =============== */}
            {/* Módulos Disponibles */}
            <View style={styles.modulesSection}>
              <Text style={styles.sectionTitle}>📱 Mis Módulos</Text>
              {!permissionsLoaded ? (
                <View style={styles.noModules}>
                  <Ionicons name="sync-outline" size={48} color={ORANGE} />
                  <Text style={styles.noModulesText}>
                    Cargando módulos...
                  </Text>
                </View>
              ) : availableModules.length === 0 ? (
                <View style={styles.noModules}>
                  <Ionicons name="construct-outline" size={48} color="#ccc" />
                  <Text style={styles.noModulesText}>
                    No hay módulos disponibles para tu rol aún.
                  </Text>
                  <Text style={styles.noModulesSubtext}>
                    Contacta a tu supervisor.
                  </Text>
                </View>
              ) : (
                availableModules.map(renderModuleCard)
              )}
            </View>

            {/* Botón de Checar Entrada/Salida para roles operativos
                NOTA: 'monitoreo' queda excluido por solicitud (no checa asistencia desde la app) */}
            {['repartidor', 'warehouse_ops', 'counter_staff'].includes(user.role) && isOnboarded && (
              <View style={styles.attendanceSection}>
                <TouchableOpacity 
                  style={styles.attendanceButton}
                  onPress={() => navigation.navigate('AttendanceChecker', { user, token })}
                  activeOpacity={0.8}
                >
                  <View style={styles.attendanceIconCircle}>
                    <Ionicons name="time" size={40} color="#4CAF50" />
                  </View>
                  <Text style={styles.attendanceTitle}>Checar Asistencia</Text>
                  <Ionicons name="chevron-forward" size={28} color="#4CAF50" />
                </TouchableOpacity>
              </View>
            )}

            {/* Acciones Rápidas */}
            <View style={styles.quickActions}>
              <Text style={styles.sectionTitle}>⚡ {t('advisorPanel.quickActions')}</Text>
              <View style={styles.quickActionRow}>
                <TouchableOpacity 
                  style={styles.quickActionBtn}
                  onPress={() => navigation.navigate('SupportChat', { user, token })}
                >
                  <Ionicons name="chatbubble-outline" size={24} color={ORANGE} />
                  <Text style={styles.quickActionText}>{t('advisorPanel.support')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.quickActionBtn}
                  onPress={() => navigation.navigate('MyProfile', { user, token })}
                >
                  <Ionicons name="person-outline" size={24} color={ORANGE} />
                  <Text style={styles.quickActionText}>{t('advisorPanel.myProfile')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.quickActionBtn}
                  onPress={() => Alert.alert('📋', t('advisorPanel.reportsComingSoon'))
                }
                >
                  <Ionicons name="document-text-outline" size={24} color={ORANGE} />
                  <Text style={styles.quickActionText}>{t('advisorPanel.reports')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* 🌐 Modal de Idioma */}
      <Modal visible={showLanguageModal} animationType="fade" transparent>
        <TouchableOpacity 
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowLanguageModal(false)}
        >
          <View style={styles.languageModalContainer}>
            <Text style={styles.languageModalTitle}>{t('advisorPanel.selectLanguage')}</Text>
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

      {/* Menú Modal */}
      <Modal visible={showMenu} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Avatar.Text 
                size={40} 
                label={user.name?.charAt(0) || 'E'}
                style={{ backgroundColor: ORANGE }}
              />
              <View style={styles.menuUserInfo}>
                <Text style={styles.menuUserName}>{user.name}</Text>
                <Text style={styles.menuUserRole}>{ROLE_LABELS[user.role] || user.role}</Text>
              </View>
            </View>
            <Divider />
            
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('MyProfile', { user, token });
              }}
            >
              <Ionicons name="person-outline" size={24} color={BLACK} />
              <Text style={styles.menuItemText}>Mi Perfil</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            {!isOnboarded && !isAdvisor && (
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  navigation.navigate('EmployeeOnboarding', { user, token });
                }}
              >
                <Ionicons name="document-text-outline" size={24} color="#FF9800" />
                <Text style={[styles.menuItemText, { color: '#FF9800' }]}>Completar Alta</Text>
                <Ionicons name="chevron-forward" size={20} color="#FF9800" />
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('SupportChat', { user, token });
              }}
            >
              <Ionicons name="help-circle-outline" size={24} color="#2196F3" />
              <Text style={[styles.menuItemText, { color: '#2196F3' }]}>Ayuda</Text>
              <Ionicons name="chevron-forward" size={20} color="#2196F3" />
            </TouchableOpacity>

            <Divider style={{ marginVertical: 8 }} />

            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                handleLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={24} color="#f44336" />
              <Text style={[styles.menuItemText, { color: '#f44336' }]}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  appbar: {
    backgroundColor: BLACK,
    elevation: 0,
    height: 44,
  },
  appbarTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 20,
  },
  
  // User Header
  userHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 6,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userInfo: {
    marginLeft: 12,
    flex: 1,
  },
  greeting: {
    fontSize: 13,
    color: '#666',
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
    marginVertical: 1,
  },
  roleChip: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  
  // Onboarding Banner
  onboardingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
    gap: 10,
  },
  onboardingContent: {
    flex: 1,
  },
  onboardingTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  onboardingSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  
  // Stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 15,
    marginTop: 15,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#ddd',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: ORANGE,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  
  // Modules Section
  modulesSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 8,
  },
  moduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  moduleCardDisabled: {
    opacity: 0.5,
  },
  moduleIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  moduleBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#f44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moduleBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  moduleContent: {
    flex: 1,
    marginLeft: 15,
  },
  moduleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: BLACK,
  },
  moduleSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  moduleTextDisabled: {
    color: '#aaa',
  },
  noModules: {
    alignItems: 'center',
    padding: 40,
  },
  noModulesText: {
    fontSize: 14,
    color: '#666',
    marginTop: 15,
    textAlign: 'center',
  },
  noModulesSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  
  // Quick Actions
  quickActions: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 20,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionBtn: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  quickActionText: {
    fontSize: 12,
    color: BLACK,
    marginTop: 8,
    fontWeight: '500',
  },
  
  // Menu
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuContainer: {
    width: '80%',
    maxWidth: 320,
    backgroundColor: '#fff',
    marginTop: 60,
    marginRight: 10,
    borderRadius: 16,
    paddingVertical: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  menuUserInfo: {
    marginLeft: 12,
  },
  menuUserName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
  },
  menuUserRole: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingHorizontal: 20,
    gap: 15,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    color: BLACK,
  },
  
  // Attendance Section
  attendanceSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  attendanceButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#4CAF50',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  attendanceIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 16,
  },
  // 🌐 Language styles
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
  // 🔔 Notification badge
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
    borderColor: BLACK,
  },
  notificationBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

// ========== ESTILOS DEL PANEL DEL ASESOR ==========
const advStyles = StyleSheet.create({
  referralCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  referralLabel: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
  },
  referralCode: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 10,
  },
  referralActions: {
    flexDirection: 'row',
    gap: 10,
  },
  referralButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  shareButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: ORANGE,
  },
  referralButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: (width - 44) / 2,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  shipmentStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 1,
  },
  shipmentStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  shipmentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  shipmentValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  shipmentLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  commissionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 1,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  commissionLabel: {
    fontSize: 12,
    color: '#666',
  },
  commissionValue: {
    fontSize: 24,
    fontWeight: '800',
    color: ORANGE,
    marginTop: 4,
  },
  viewCommissionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  viewCommissionsText: {
    color: ORANGE,
    fontWeight: '600',
    fontSize: 14,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  quickAction: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: (width - 44) / 2,
    elevation: 1,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 1,
  },
  alertContent: {
    flex: 1,
    marginLeft: 12,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
  },
  alertText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
