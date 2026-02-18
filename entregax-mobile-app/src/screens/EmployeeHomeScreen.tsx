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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, Avatar, Divider, Icon } from 'react-native-paper';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';

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
    roles: ['repartidor'],
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
    roles: ['repartidor'],
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
    roles: ['repartidor'],
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
    roles: ['repartidor'],
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
    roles: ['repartidor'],
    requiresOnboarding: true,
  },
  
  // === BODEGA (warehouse_ops) ===
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
  },
  {
    id: 'inventory',
    title: 'Inventario CEDIS',
    subtitle: 'Ver paquetes en bodega',
    icon: 'file-tray-stacked-outline',
    iconFamily: 'ionicons',
    color: '#607D8B',
    screen: 'WarehouseInventory',
    roles: ['warehouse_ops', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
  },
  
  // === MOSTRADOR (counter_staff) ===
  {
    id: 'counter_pickup',
    title: 'Entrega en Mostrador',
    subtitle: 'Entregar paquetes a clientes',
    icon: 'storefront-outline',
    iconFamily: 'ionicons',
    color: '#00BCD4',
    screen: 'CounterPickup',
    roles: ['counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
  },
  {
    id: 'counter_reception',
    title: 'Recepción de Paquetes',
    subtitle: 'Recibir envíos de clientes',
    icon: 'download-outline',
    iconFamily: 'ionicons',
    color: '#8BC34A',
    screen: 'CounterReception',
    roles: ['counter_staff', 'branch_manager', 'admin', 'super_admin'],
    requiresOnboarding: true,
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
    roles: ['customer_service', 'branch_manager', 'admin', 'super_admin', 'advisor', 'asesor', 'asesor_lider', 'sub_advisor'],
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
    roles: ['customer_service', 'counter_staff', 'branch_manager', 'admin', 'super_admin', 'advisor', 'asesor', 'asesor_lider', 'sub_advisor'],
    requiresOnboarding: false,
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
  {
    id: 'advisor_clients',
    title: 'Mis Clientes',
    subtitle: 'Ver y gestionar mis clientes referidos',
    icon: 'people-outline',
    iconFamily: 'ionicons',
    color: '#F05A28',
    screen: 'AdvisorClients',
    roles: ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'],
    requiresOnboarding: false,
  },
  {
    id: 'advisor_commissions',
    title: 'Mis Comisiones',
    subtitle: 'Ver historial de comisiones',
    icon: 'cash-outline',
    iconFamily: 'ionicons',
    color: '#4CAF50',
    screen: 'AdvisorCommissions',
    roles: ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'],
    requiresOnboarding: false,
  },
  {
    id: 'advisor_referral',
    title: 'Referir Cliente',
    subtitle: 'Compartir mi código de referido',
    icon: 'share-social-outline',
    iconFamily: 'ionicons',
    color: '#2196F3',
    screen: 'AdvisorReferral',
    roles: ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'],
    requiresOnboarding: false,
  },
  {
    id: 'advisor_team',
    title: 'Mi Equipo',
    subtitle: 'Ver sub-asesores y su rendimiento',
    icon: 'people-circle-outline',
    iconFamily: 'ionicons',
    color: '#9C27B0',
    screen: 'AdvisorTeam',
    roles: ['asesor_lider'],
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
  const [user, setUser] = useState(initialUser);
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [stats, setStats] = useState<any>(null);

  // Filtrar módulos según el rol del usuario
  const availableModules = EMPLOYEE_MODULES.filter(module => 
    module.roles.includes(user.role)
  );

  const isOnboarded = user.isEmployeeOnboarded === true;

  // Refrescar datos del usuario
  const refreshUserData = useCallback(async () => {
    try {
      const response = await fetch(`http://192.168.1.114:3001/api/auth/profile`, {
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
        }));
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  }, [token]);

  // Cargar estadísticas según rol
  const loadStats = useCallback(async () => {
    try {
      if (user.role === 'repartidor') {
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
    }, [refreshUserData, loadStats, isOnboarded])
  );

  const onRefresh = () => {
    setRefreshing(true);
    refreshUserData();
    loadStats();
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
    
    // Navegar al módulo
    navigation.navigate(module.screen, { user, token });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '¡Buenos días!';
    if (hour < 18) return '¡Buenas tardes!';
    return '¡Buenas noches!';
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
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 16 }}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={{ width: 130, height: 40, resizeMode: 'contain' }}
          />
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
                size={60} 
                source={{ uri: user.profilePhotoUrl }}
              />
            ) : (
              <Avatar.Text 
                size={60} 
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

          {/* Banner de Onboarding Pendiente */}
          {!isOnboarded && (
            <TouchableOpacity 
              style={styles.onboardingBanner}
              onPress={() => navigation.navigate('EmployeeOnboarding', { user, token })}
            >
              <Ionicons name="warning" size={24} color="#fff" />
              <View style={styles.onboardingContent}>
                <Text style={styles.onboardingTitle}>⚠️ Alta de Empleado Pendiente</Text>
                <Text style={styles.onboardingSubtitle}>
                  Completa tu registro para acceder a tus módulos de trabajo
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Stats para Repartidor */}
          {user.role === 'repartidor' && isOnboarded && stats && (
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{stats.totalAssigned || 0}</Text>
                <Text style={styles.statLabel}>Asignados</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: '#2196F3' }]}>
                  {stats.loadedToday || 0}
                </Text>
                <Text style={styles.statLabel}>Cargados</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: '#4CAF50' }]}>
                  {stats.deliveredToday || 0}
                </Text>
                <Text style={styles.statLabel}>Entregados</Text>
              </View>
            </View>
          )}
        </View>

        {/* Módulos Disponibles */}
        <View style={styles.modulesSection}>
          <Text style={styles.sectionTitle}>📱 Mis Módulos</Text>
          {availableModules.length === 0 ? (
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

        {/* Botón de Checar Entrada/Salida para roles operativos */}
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
          <Text style={styles.sectionTitle}>⚡ Acciones Rápidas</Text>
          <View style={styles.quickActionRow}>
            <TouchableOpacity 
              style={styles.quickActionBtn}
              onPress={() => navigation.navigate('SupportChat', { user, token })}
            >
              <Ionicons name="chatbubble-outline" size={24} color={ORANGE} />
              <Text style={styles.quickActionText}>Soporte</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.quickActionBtn}
              onPress={() => navigation.navigate('MyProfile', { user, token })}
            >
              <Ionicons name="person-outline" size={24} color={ORANGE} />
              <Text style={styles.quickActionText}>Mi Perfil</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.quickActionBtn}
              onPress={() => Alert.alert('📋', 'Módulo de reportes próximamente')}
            >
              <Ionicons name="document-text-outline" size={24} color={ORANGE} />
              <Text style={styles.quickActionText}>Reportes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

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

            {!isOnboarded && (
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
  },
  appbarTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 20,
  },
  
  // User Header
  userHeader: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userInfo: {
    marginLeft: 15,
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: '#666',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BLACK,
    marginVertical: 4,
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
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
    gap: 12,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 12,
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
});
