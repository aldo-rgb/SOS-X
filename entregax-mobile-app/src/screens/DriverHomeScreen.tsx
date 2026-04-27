/**
 * DriverHomeScreen - Hub Principal del Repartidor
 * 
 * Pantalla central que muestra:
 * - Resumen del día (paquetes asignados, cargados, entregados)
 * - Acceso a: Cargar Unidad, Ruta/Mapa, Retorno a Bodega
 * - Estado actual de la jornada
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const SCAN_METHOD_PREFIX = 'scanMethod:';

interface DayStats {
  totalAssigned: number;
  loadedToday: number;
  deliveredToday: number;
  pendingToLoad: number;
  pendingDelivery: number;
  returnedToday: number;
}

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  screen: string;
  badge?: number;
  enabled: boolean;
  condition?: string;
}

interface LoadedPackage {
  id: number;
  tracking_number: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_zip?: string;
  recipient_name?: string;
  national_tracking?: string;
  national_carrier?: string;
}

export default function DriverHomeScreen({ navigation, route }: any) {
  const token = route?.params?.token;
  const user = route?.params?.user;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedPackages, setLoadedPackages] = useState<LoadedPackage[]>([]);
  const [stats, setStats] = useState<DayStats>({
    totalAssigned: 0,
    loadedToday: 0,
    deliveredToday: 0,
    pendingToLoad: 0,
    pendingDelivery: 0,
    returnedToday: 0,
  });
  const [inspectionDone, setInspectionDone] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scanModal, setScanModal] = useState<{ visible: boolean; action: QuickAction | null }>({ visible: false, action: null });
  const [rememberChoice, setRememberChoice] = useState(false);

  // Actualizar hora cada minuto
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Recargar datos cada vez que la pantalla recibe foco
  useFocusEffect(
    useCallback(() => {
      loadDayData();
    }, [])
  );

  const loadDayData = async () => {
    try {
      // Cargar estadísticas de ruta (resistente a cambios de forma del payload)
      try {
        const routeRes = await api.get('/api/driver/route-today', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const route = routeRes.data?.route || routeRes.data?.data?.route || routeRes.data?.data || {};
        const pendingPackages = Array.isArray(route.pendingPackages) ? route.pendingPackages : [];
        const loadedPackages = Array.isArray(route.loadedPackages) ? route.loadedPackages : [];

        const deliveredToday = Number(route.deliveredToday) || 0;
        const totalAssignedFromApi = Number(route.totalAssigned) || 0;
        const totalAssignedComputed = pendingPackages.length + loadedPackages.length + deliveredToday;

        setLoadedPackages(loadedPackages);
        setStats({
          totalAssigned: totalAssignedFromApi > 0 ? totalAssignedFromApi : totalAssignedComputed,
          loadedToday: Number(route.loadedToday) || 0,
          deliveredToday,
          pendingToLoad: Number(route.pendingToLoad) || pendingPackages.length,
          pendingDelivery: loadedPackages.length,
          returnedToday: 0, // TODO: Agregar al backend
        });
      } catch (routeError) {
        console.error('Error cargando ruta del repartidor:', routeError);
      }

      // Verificar inspección del día
      try {
        const inspRes = await api.get('/api/fleet/inspection/today', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        setInspectionDone(inspRes.data?.has_inspection || inspRes.data?.already_inspected || false);
      } catch {
        setInspectionDone(false);
      }

    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDayData();
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return '¡Buenos días!';
    if (hour < 18) return '¡Buenas tardes!';
    return '¡Buenas noches!';
  };

  const getJourneyStatus = () => {
    if (!inspectionDone) {
      return { text: 'Pendiente inspección', color: '#FF9800', icon: 'warning' };
    }
    if (stats.pendingToLoad > 0) {
      return { text: 'Carga pendiente', color: '#2196F3', icon: 'local-shipping' };
    }
    if (stats.pendingDelivery > 0) {
      return { text: 'En ruta', color: '#4CAF50', icon: 'directions-car' };
    }
    if (stats.deliveredToday > 0) {
      return { text: 'Jornada completa', color: '#9C27B0', icon: 'check-circle' };
    }
    return { text: 'Sin asignaciones', color: '#666', icon: 'schedule' };
  };

  const journeyStatus = getJourneyStatus();

  const handleBackToEmployeeHome = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('EmployeeHome', {
      user: route?.params?.user,
      token: route?.params?.token,
    });
  };

  // Carriers conocidos → dirección para abrir en Maps
  const CARRIER_ADDRESSES: Record<string, string> = {
    'paquete express': 'Paquete Express Monterrey Nuevo León México',
    'dhl': 'DHL Express Monterrey Nuevo León México',
    'fedex': 'FedEx Monterrey Nuevo León México',
    'estafeta': 'Estafeta Monterrey Nuevo León México',
    'redpack': 'Redpack Monterrey Nuevo León México',
    'ups': 'UPS Monterrey Nuevo León México',
  };

  const handleViewRoute = () => {
    if (loadedPackages.length === 0) {
      Alert.alert('Sin paquetes', 'No hay paquetes cargados en tu ruta.');
      return;
    }

    // Construir lista de destinos
    const destinations: string[] = [];
    const externalCarriers = new Set<string>();

    for (const pkg of loadedPackages) {
      if (pkg.national_carrier) {
        // Paquetería externa → ir a la sucursal del carrier
        const key = pkg.national_carrier.toLowerCase();
        const carrierAddr = CARRIER_ADDRESSES[key] || `${pkg.national_carrier} Monterrey Nuevo León México`;
        externalCarriers.add(pkg.national_carrier);
        if (!destinations.includes(carrierAddr)) {
          destinations.push(carrierAddr);
        }
      } else if (pkg.delivery_address) {
        const full = [pkg.delivery_address, pkg.delivery_city, pkg.delivery_zip].filter(Boolean).join(', ');
        if (!destinations.includes(full)) {
          destinations.push(full);
        }
      }
    }

    if (destinations.length === 0) {
      Alert.alert('Sin direcciones', 'Los paquetes cargados no tienen dirección de entrega registrada.');
      return;
    }

    // Google Maps multi-stop URL
    const destination = encodeURIComponent(destinations[destinations.length - 1]);
    const waypoints = destinations.slice(0, -1).map(d => encodeURIComponent(d)).join('|');
    const mapsUrl = waypoints.length > 0
      ? `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

    Linking.openURL(mapsUrl).catch(() => {
      Alert.alert('Error', 'No se pudo abrir Google Maps.');
    });
  };

  // Acciones rápidas dinámicas basadas en el estado
  const quickActions: QuickAction[] = [
    {
      id: 'inspection',
      title: 'Inspección Diaria',
      subtitle: inspectionDone ? 'Completada ✓' : 'Requerida antes de salir',
      icon: 'assignment',
      color: inspectionDone ? '#4CAF50' : '#FF9800',
      screen: 'VehicleInspection',
      enabled: !inspectionDone,
    },
    {
      id: 'load',
      title: 'Cargar Unidad',
      subtitle: `${stats.pendingToLoad} paquetes pendientes`,
      icon: 'add-box',
      color: '#2196F3',
      screen: 'LoadingVan',
      badge: stats.pendingToLoad,
      enabled: inspectionDone && stats.pendingToLoad > 0,
    },
    {
      id: 'delivery',
      title: 'Confirmar Entrega',
      subtitle: `${stats.pendingDelivery} por entregar`,
      icon: 'local-shipping',
      color: '#4CAF50',
      screen: 'DeliveryConfirm',
      badge: stats.pendingDelivery,
      enabled: stats.pendingDelivery > 0,
    },
    {
      id: 'return',
      title: 'Retorno a Bodega',
      subtitle: 'Devolver paquetes no entregados',
      icon: 'assignment-return',
      color: '#9C27B0',
      screen: 'ReturnScan',
      enabled: stats.pendingDelivery > 0 || stats.loadedToday > stats.deliveredToday,
    },
  ];

  const handleQuickActionPress = async (action: QuickAction) => {
    if (!action.enabled) return;

    if (action.id === 'load' || action.id === 'delivery' || action.id === 'return') {
      // Si ya guardó preferencia, ir directo
      const saved = await AsyncStorage.getItem(`${SCAN_METHOD_PREFIX}${action.id}`);
      if (saved === 'scanner' || saved === 'camera') {
        navigation.navigate(action.screen, { user, token, scanMode: saved });
        return;
      }
      // Mostrar modal personalizado
      setScanModal({ visible: true, action });
      setRememberChoice(false);
      return;
    }

    navigation.navigate(action.screen, { user, token });
  };

  const handleScanModalChoice = async (mode: 'scanner' | 'camera') => {
    if (!scanModal.action) return;
    const action = scanModal.action;
    if (rememberChoice) {
      await AsyncStorage.setItem(`${SCAN_METHOD_PREFIX}${action.id}`, mode);
    }
    setScanModal({ visible: false, action: null });
    navigation.navigate(action.screen, { user, token, scanMode: mode });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F05A28" />
          <Text style={styles.loadingText}>Cargando tu jornada...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F05A28']} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButtonHeader} onPress={handleBackToEmployeeHome}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <View>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <Text style={styles.dateText}>
              {currentTime.toLocaleDateString('es-MX', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long' 
              })}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.profileButton}
            onPress={() => navigation.navigate('MyProfile', { user, token })}
          >
            <Image
              source={require('../../assets/x-logo-entregax.png')}
              style={styles.profileLogo}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        {/* Status Badge / Ver Ruta */}
        {stats.pendingDelivery > 0 ? (
          <TouchableOpacity
            style={[styles.statusBadge, { backgroundColor: '#4CAF50' }]}
            onPress={handleViewRoute}
          >
            <MaterialIcons name="directions-car" size={24} color="#fff" />
            <Text style={styles.statusText}>Ver Ruta</Text>
            <MaterialIcons name="open-in-new" size={18} color="rgba(255,255,255,0.8)" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.statusBadge, { backgroundColor: journeyStatus.color }]}>
            <MaterialIcons name={journeyStatus.icon as any} size={24} color="#fff" />
            <Text style={styles.statusText}>{journeyStatus.text}</Text>
          </View>
        )}

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, styles.statCardPrimary]}>
              <MaterialIcons name="inventory-2" size={32} color="#fff" />
              <Text style={styles.statNumber}>{stats.totalAssigned}</Text>
              <Text style={styles.statLabel}>Asignados Hoy</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="local-shipping" size={28} color="#2196F3" />
              <Text style={[styles.statNumber, { color: '#2196F3' }]}>{stats.loadedToday}</Text>
              <Text style={styles.statLabel}>Cargados</Text>
            </View>
          </View>
          
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <MaterialIcons name="check-circle" size={28} color="#4CAF50" />
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{stats.deliveredToday}</Text>
              <Text style={styles.statLabel}>Entregados</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialIcons name="pending" size={28} color="#FF9800" />
              <Text style={[styles.statNumber, { color: '#FF9800' }]}>{stats.pendingDelivery}</Text>
              <Text style={styles.statLabel}>Pendientes</Text>
            </View>
          </View>
        </View>

        {/* Progress Ring */}
        <View style={styles.progressSection}>
          <View style={styles.progressRing}>
            <View style={[
              styles.progressFill,
              { 
                width: stats.totalAssigned > 0 
                  ? `${(stats.deliveredToday / stats.totalAssigned) * 100}%` 
                  : '0%' 
              }
            ]} />
            <View style={styles.progressContent}>
              <Text style={styles.progressPercent}>
                {stats.totalAssigned > 0 
                  ? Math.round((stats.deliveredToday / stats.totalAssigned) * 100)
                  : 0}%
              </Text>
              <Text style={styles.progressLabel}>Completado</Text>
            </View>
          </View>
        </View>

        {/* Botón de asistencia */}
        <TouchableOpacity
          style={styles.attendanceCard}
          onPress={() => navigation.navigate('AttendanceChecker', { user, token })}
        >
          <View style={styles.attendanceLeft}>
            <View style={styles.attendanceIconBox}>
              <MaterialIcons name="schedule" size={28} color="#4CAF50" />
            </View>
            <Text style={styles.attendanceText}>Checar Asistencia</Text>
          </View>
          <MaterialIcons name="chevron-right" size={30} color="#4CAF50" />
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
        
        <View style={styles.actionsGrid}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[
                styles.actionCard,
                !action.enabled && styles.actionCardDisabled
              ]}
              onPress={() => handleQuickActionPress(action)}
              disabled={!action.enabled}
            >
              <View style={[styles.actionIconBox, { backgroundColor: action.color }]}>
                <MaterialIcons name={action.icon as any} size={28} color="#fff" />
                {action.badge && action.badge > 0 && (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{action.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tip del día */}
        <View style={styles.tipBox}>
          <MaterialIcons name="lightbulb" size={24} color="#FFC107" />
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Tip del día</Text>
            <Text style={styles.tipText}>
              Recuerda verificar la dirección antes de marcar como entregado. 
              Una foto clara de evidencia evita reclamos.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modal de selección método de captura */}
      <Modal
        visible={scanModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setScanModal({ visible: false, action: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Selecciona método de captura</Text>
            <Text style={styles.modalSubtitle}>
              ¿Deseas usar escáner o cámara?
            </Text>

            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberChoice(!rememberChoice)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, rememberChoice && styles.checkboxChecked]}>
                {rememberChoice && <MaterialIcons name="check" size={16} color="#FFF" />}
              </View>
              <Text style={styles.rememberText}>No volver a preguntar</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnGhost}
                onPress={() => setScanModal({ visible: false, action: null })}
              >
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => handleScanModalChoice('camera')}
              >
                <MaterialIcons name="photo-camera" size={18} color="#1A1A1A" />
                <Text style={styles.modalBtnSecondaryText}>Cámara</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={() => handleScanModalChoice('scanner')}
              >
                <MaterialIcons name="qr-code-scanner" size={18} color="#FFF" />
                <Text style={styles.modalBtnPrimaryText}>Escáner</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  backButtonHeader: {
    marginRight: 10,
    padding: 4,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  dateText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  profileButton: {
    padding: 5,
  },
  profileLogo: {
    width: 40,
    height: 40,
  },
  
  // Status Badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 15,
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Stats
  statsContainer: {
    padding: 15,
    gap: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statCardPrimary: {
    backgroundColor: '#F05A28',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  
  // Progress
  progressSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  progressRing: {
    width: 180,
    height: 50,
    backgroundColor: '#e0e0e0',
    borderRadius: 25,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#4CAF50',
    borderRadius: 25,
  },
  progressContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  progressPercent: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  progressLabel: {
    fontSize: 14,
    color: '#666',
  },

  // Attendance
  attendanceCard: {
    marginHorizontal: 15,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attendanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendanceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  attendanceText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2E2E2E',
  },
  
  // Section Title
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 15,
  },
  
  // Actions
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    gap: 10,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionCardDisabled: {
    opacity: 0.5,
  },
  actionIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  actionBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  actionSubtitle: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  
  // Tip
  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF8E1',
    margin: 15,
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  tipContent: {
    flex: 1,
    marginLeft: 12,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  tipText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  // Modal scan method
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#C0C0C0',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#F05A28',
    borderColor: '#F05A28',
  },
  rememberText: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalBtnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalBtnGhostText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 14,
  },
  modalBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#ECECEC',
    gap: 6,
  },
  modalBtnSecondaryText: {
    color: '#1A1A1A',
    fontWeight: '600',
    fontSize: 14,
  },
  modalBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F05A28',
    gap: 6,
  },
  modalBtnPrimaryText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
