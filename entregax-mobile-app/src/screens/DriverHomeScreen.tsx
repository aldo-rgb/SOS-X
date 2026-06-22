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
import { setStringAsync as copyToClipboard } from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBrandAsset } from '../hooks/useBrandAssets';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useDeliverySync } from '../hooks/useDeliverySync';

const SCAN_METHOD_PREFIX = 'scanMethod:';

interface DayStats {
  totalAssigned: number;
  loadedToday: number;
  deliveredToday: number;
  paqueteriaCount: number;
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
  params?: Record<string, any>;
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
  client_number?: string;
}

export default function DriverHomeScreen({ navigation, route }: any) {
  const token = route?.params?.token;
  const user = route?.params?.user;
  const directTo: string | undefined = route?.params?.directTo;
  const preloadedRoute = route?.params?.preloadedRoute;
  const logoUrl = useBrandAsset('entregax_full_black');
  // 👁️ Rol Monitoreo: NO conduce vehiculo, NO checa asistencia desde el dashboard.
  const isMonitoreo = String(user?.role || '').toLowerCase() === 'monitoreo';
  // Sync automático de entregas guardadas offline
  useDeliverySync(token);

  // Navegación directa desde HomeScreen (accesos rápidos)
  useEffect(() => {
    if (directTo) {
      const timer = setTimeout(() => navigation.navigate(directTo, { user, token }), 100);
      return () => clearTimeout(timer);
    }
  }, [directTo]);
  // Si venimos desde EmployeeHome con datos ya cargados, arrancamos sin spinner
  const [loading, setLoading] = useState(!preloadedRoute);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedPackages, setLoadedPackages] = useState<LoadedPackage[]>([]);
  const [deliveredPackages, setDeliveredPackages] = useState<any[]>([]);
  const [pendingPackagesList, setPendingPackagesList] = useState<any[]>([]);
  const [requireLabelToLoad, setRequireLabelToLoad] = useState(true);
  const [showLoadedModal, setShowLoadedModal] = useState(false);
  const [showAssignedModal, setShowAssignedModal] = useState(false);
  const [copiedTrackingId, setCopiedTrackingId] = useState<number | null>(null);
  const [showPaqueteriaModal, setShowPaqueteriaModal] = useState(false);
  const [paqueteriaGroups, setPaqueteriaGroups] = useState<{ carrier: string; count: number; packages: any[] }[]>([]);
  const [selectedCarrierGroup, setSelectedCarrierGroup] = useState<{ carrier: string; packages: any[] } | null>(null);
  // null = carrier list, 'mode_select' = choosing mode, 'package_list' = showing packages
  const [paqueteriaView, setPaqueteriaView] = useState<'carrier_list' | 'mode_select' | 'package_list'>('carrier_list');
  const [pendingCarrier, setPendingCarrier] = useState<{ carrier: string; packages: any[] } | null>(null);
  const [stats, setStats] = useState<DayStats>({
    totalAssigned: 0,
    loadedToday: 0,
    deliveredToday: 0,
    paqueteriaCount: 0,
    pendingToLoad: 0,
    pendingDelivery: 0,
    returnedToday: 0,
  });
  const [inspectionDone, setInspectionDone] = useState(false);
  const [monitorAssignment, setMonitorAssignment] = useState<any | null>(null);
  const [attendance, setAttendance] = useState<{ check_in_time: string | null; check_out_time: string | null } | null>(null);
  const [walletInfo, setWalletInfo] = useState<{ balance: number; pending_advances: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scanModal, setScanModal] = useState<{ visible: boolean; action: QuickAction | null }>({ visible: false, action: null });
  const [rememberChoice, setRememberChoice] = useState(false);
  const [assignedStatusFilter, setAssignedStatusFilter] = useState<'all' | 'delivered' | 'loaded' | 'pending'>('all');
  const [assignedCarrierFilter, setAssignedCarrierFilter] = useState<'all' | 'po_box' | 'tdi' | 'dhl'>('all');

  // Actualizar hora cada minuto
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Si llegamos con datos precargados desde EmployeeHome, aplicarlos de inmediato
  useEffect(() => {
    if (preloadedRoute) {
      applyRouteData(preloadedRoute);
    }
  }, []);

  // Recargar datos cada vez que la pantalla recibe foco
  useFocusEffect(
    useCallback(() => {
      loadDayData();
    }, [])
  );

  const applyRouteData = (route: any) => {
    const pendingPackages = Array.isArray(route.pendingPackages) ? route.pendingPackages : [];
    const loaded = Array.isArray(route.loadedPackages) ? route.loadedPackages : [];
    const delivered = Array.isArray(route.deliveredPackages) ? route.deliveredPackages : [];
    const deliveredToday = delivered.length || Number(route.deliveredToday) || 0;
    const totalAssignedFromApi = Number(route.totalAssigned) || 0;
    const totalAssignedComputed = pendingPackages.length + loaded.length + deliveredToday;
    setLoadedPackages(loaded);
    setDeliveredPackages(delivered);
    setPendingPackagesList(pendingPackages);
    const requireLabel = route.requireLabelToLoad ?? true;
    setRequireLabelToLoad(requireLabel);
    const isLocalCarrier = (c: string) => {
      const s = String(c || '').toLowerCase();
      return !s || s.includes('local') || s.includes('entregax') || s.includes('pickup') || s.includes('pick up') || s.includes('bodega');
    };
    // Canonicaliza nombre de carrier para evitar grupos duplicados por variantes de casing
    const canonicalCarrier = (raw: string): string => {
      // Normalizar: quitar espacios y guiones bajos para comparación
      const s = raw.trim().replace(/[\s_]+/g, '').toLowerCase();
      if (s.includes('paqueteexpress') || s.includes('paquetexpress') || s === 'pqtx') return 'Paquete Express';
      if (s === 'dhl') return 'DHL';
      if (s.includes('fedex') || s.startsWith('fdx')) return 'FedEx';
      if (s === 'ups') return 'UPS';
      // fallback: title case (underscores → spaces)
      return raw.trim().replace(/[\s_]+/g, ' ').split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };
    const carrierMap: Record<string, any[]> = {};
    [...pendingPackages, ...loaded].forEach((p: any) => {
      // dhl_shipments son entregas locales, no paqueterías externas
      if (p.is_dhl_shipment) return;
      const rawCarrier = p.national_carrier || '';
      if (!rawCarrier || isLocalCarrier(rawCarrier)) return;
      const isLoaded = String(p.delivery_status || '').includes('out_for_delivery') || String(p.delivery_status || '').includes('in_transit');
      if (!isLoaded && requireLabel && !p.has_label) return;
      const c = canonicalCarrier(rawCarrier);
      if (!carrierMap[c]) carrierMap[c] = [];
      carrierMap[c].push(p);
    });
    setPaqueteriaGroups(
      Object.entries(carrierMap)
        .map(([carrier, pkgs]) => ({ carrier, count: pkgs.length, packages: pkgs }))
        .sort((a, b) => b.count - a.count)
    );
    setStats({
      totalAssigned: totalAssignedFromApi > 0 ? totalAssignedFromApi : totalAssignedComputed,
      loadedToday: Number(route.loadedToday) || 0,
      deliveredToday,
      paqueteriaCount: Number(route.paqueteriaCount) || 0,
      pendingToLoad: Number(route.pendingToLoad) ?? 0,
      pendingDelivery: loaded.filter((p: any) => isLocalCarrier(String(p.national_carrier || ''))).length,
      returnedToday: 0,
    });
  };

  const loadDayData = async () => {
    try {
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

      // 👁️ Monitoreo: solo necesita /api/monitoreo/stats.
      if (isMonitoreo) {
        try {
          const [walletSettled, statsSettled] = await Promise.allSettled([
            api.get('/api/petty-cash/my-wallet', { headers: authHeaders }),
            api.get('/api/monitoreo/stats', { headers: authHeaders }),
          ]);
          if (walletSettled.status === 'fulfilled') {
            const wData = walletSettled.value.data;
            const balance = Number(wData?.wallet?.balance_mxn) || 0;
            const pendingAdv = Array.isArray(wData?.pending_advances) ? wData.pending_advances.length : 0;
            setWalletInfo({ balance, pending_advances: pendingAdv });
          } else {
            setWalletInfo({ balance: 0, pending_advances: 0 });
          }
          if (statsSettled.status === 'fulfilled') {
            const data = statsSettled.value.data;
            const liberados = Number(data?.liberados) || 0;
            const cargados = Number(data?.cargados) || 0;
            const entregados = Number(data?.entregados) || 0;
            const totalRoute = Number(data?.in_transit_clientfinal) || 0;
            const assignment = data?.currentAssignment || null;
            setStats({
              totalAssigned: totalRoute > 0 ? totalRoute : liberados,
              loadedToday: cargados,
              deliveredToday: entregados,
              paqueteriaCount: 0,
              pendingToLoad: liberados,
              pendingDelivery: cargados,
              returnedToday: 0,
            });
            setLoadedPackages([]);
            setInspectionDone(true);
            setMonitorAssignment(assignment);
          } else {
            console.error('Error cargando stats monitoreo:', statsSettled.reason);
          }
        } catch (e) {
          console.error('Error monitoreo init:', e);
        }
        return;
      }

      // 🚚 Repartidor: route-today primero → mostrar UI inmediatamente.
      // Inspección corre en background (no bloquea el render).
      api.get('/api/fleet/inspection/today', { headers: authHeaders })
        .then(r => setInspectionDone(r.data?.has_inspection || r.data?.already_inspected || false))
        .catch(() => setInspectionDone(false));

      const routeSettled = await api.get('/api/driver/route-today', { headers: authHeaders })
        .then(v => ({ status: 'fulfilled' as const, value: v }))
        .catch(e => ({ status: 'rejected' as const, reason: e }));

      // Ruta (stats + listas)
      if (routeSettled.status === 'fulfilled') {
        const routeData = routeSettled.value.data;
        const routeObj = routeData?.route || routeData?.data?.route || routeData?.data || {};
        applyRouteData(routeObj);
      } else {
        console.error('Error cargando ruta del repartidor:', routeSettled.reason);
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
    // Monitoreo no requiere inspección vehicular
    if (!inspectionDone && !isMonitoreo) {
      return { text: 'Pendiente inspección', color: '#FF9800', icon: 'warning' };
    }
    if (stats.pendingToLoad > 0) {
      return { text: 'Entrega Local pendiente', color: '#2196F3', icon: 'local-shipping' };
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
      // 🔧 Para rol Monitoreo el flujo NO es inspección diaria del propio
      // vehículo, sino la asignación/recepción de un vehículo a su cargo.
      // Si ya recibió una unidad, el botón cambia a "Devolver Unidad".
      title: isMonitoreo
        ? (monitorAssignment ? 'Devolver Unidad' : 'Recibir Unidad')
        : 'Inspección Diaria',
      subtitle: isMonitoreo
        ? (monitorAssignment
            ? `Unidad: ${monitorAssignment.economic_number || ''}${monitorAssignment.license_plates ? ' · ' + monitorAssignment.license_plates : ''}`
            : 'Asignación de vehículo')
        : (inspectionDone ? 'Completada ✓' : 'Requerida requerida cada día'),
      icon: 'assignment',
      color: isMonitoreo
        ? (monitorAssignment ? '#9C27B0' : '#FF9800')
        : (inspectionDone ? '#4CAF50' : '#FF9800'),
      screen: 'VehicleInspection',
      // Monitoreo: siempre habilitado (puede recibir varias veces).
      // Repartidor: solo si aún no hizo la inspección del periodo.
      enabled: isMonitoreo ? true : !inspectionDone,
      params: isMonitoreo
        ? (monitorAssignment
            ? { mode: 'check_out', vehicle: monitorAssignment }
            : { mode: 'check_in' })
        : undefined,
    },
    {
      id: 'load',
      title: isMonitoreo ? 'Iniciar Monitoreo' : 'Salidas Locales',
      subtitle: isMonitoreo
        ? `${stats.pendingToLoad} contenedores en ruta`
        : `${stats.pendingToLoad} paquetes pendientes`,
      icon: isMonitoreo ? 'photo-camera' : 'add-box',
      color: '#2196F3',
      screen: isMonitoreo ? 'MonitorContainers' : 'LoadingVan',
      badge: stats.pendingToLoad,
      enabled: isMonitoreo ? stats.pendingToLoad > 0 : (inspectionDone && stats.pendingToLoad > 0),
    },
    {
      id: 'delivery',
      title: 'Confirmar Entrega',
      subtitle: isMonitoreo
        ? `${stats.pendingDelivery} en monitoreo`
        : `${stats.pendingDelivery} por entregar`,
      icon: 'local-shipping',
      color: '#4CAF50',
      screen: isMonitoreo ? 'MonitorContainers' : 'DeliveryConfirm',
      badge: stats.pendingDelivery,
      enabled: stats.pendingDelivery > 0,
    },
    {
      id: 'return',
      title: isMonitoreo ? 'Incidencias' : 'Retorno a Bodega',
      subtitle: isMonitoreo
        ? 'Reportar problema con un contenedor'
        : 'Devolver paquetes no entregados',
      icon: isMonitoreo ? 'report-problem' : 'assignment-return',
      color: isMonitoreo ? '#E53935' : '#9C27B0',
      screen: isMonitoreo ? 'MonitorIncidents' : 'ReturnScan',
      enabled: isMonitoreo
        ? stats.pendingDelivery > 0 // tiene al menos 1 contenedor en monitoreo
        : (stats.pendingDelivery > 0 || stats.loadedToday > stats.deliveredToday),
    },
  ];

  const handleQuickActionPress = async (action: QuickAction) => {
    if (!action.enabled) return;

    // Monitoreo: el botón "Iniciar Monitoreo" abre directo la lista de contenedores.
    if (isMonitoreo && action.id === 'load') {
      navigation.navigate(action.screen, { user, token, mode: 'start-monitoring' });
      return;
    }

    // Monitoreo: "Confirmar Entrega" abre la lista de contenedores en monitoreo para subir 3 fotos.
    if (isMonitoreo && action.id === 'delivery') {
      navigation.navigate(action.screen, { user, token, mode: 'confirm-delivery' });
      return;
    }

    // Monitoreo: "Incidencias" abre la lista de contenedores activos para reportar problema.
    if (isMonitoreo && action.id === 'return') {
      navigation.navigate('MonitorIncidents', { user, token });
      return;
    }

    if (action.id === 'load' || action.id === 'delivery' || action.id === 'return') {
      // Si ya guardó preferencia, ir directo
      const saved = await AsyncStorage.getItem(`${SCAN_METHOD_PREFIX}${action.id}`);
      if (saved === 'scanner' || saved === 'camera') {
        const extraParams = action.id === 'delivery' ? { loadedPackages } : {};
        navigation.navigate(action.screen, { user, token, scanMode: saved, ...extraParams });
        return;
      }
      // Mostrar modal personalizado
      setScanModal({ visible: true, action });
      setRememberChoice(false);
      return;
    }

    const extraParams = action.id === 'delivery' ? { loadedPackages } : {};
    navigation.navigate(action.screen, { user, token, ...extraParams, ...(action.params || {}) });
  };

  const handleAssignedTodayPress = () => {
    // 👁️ Rol Monitoreo: abrir lista navegable de contenedores en ruta
    if (isMonitoreo) {
      navigation.navigate('MonitorContainers', { user, token });
      return;
    }
    // Siempre abrir el modal de resumen de hoy (incluso si hay 0 pendientes)
    setAssignedStatusFilter('all');
    setAssignedCarrierFilter('all');
    setShowAssignedModal(true);
  };


  const handleScanModalChoice = async (mode: 'scanner' | 'camera') => {
    if (!scanModal.action) return;
    const action = scanModal.action;
    if (rememberChoice) {
      await AsyncStorage.setItem(`${SCAN_METHOD_PREFIX}${action.id}`, mode);
    }
    setScanModal({ visible: false, action: null });
    const extraParams = action.id === 'delivery' ? { loadedPackages } : {};
    navigation.navigate(action.screen, { user, token, scanMode: mode, ...extraParams });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }]}>
        <View style={{ alignItems: 'center', gap: 24 }}>
          <Image
            source={logoUrl ? { uri: logoUrl } : require('../../assets/logo-negro.png')}
            style={{ width: 180, height: 60, resizeMode: 'contain' }}
          />
          <View style={{ alignItems: 'center', gap: 10 }}>
            <ActivityIndicator size="large" color="#F05A28" />
            <Text style={{ color: '#888', fontSize: 14 }}>Cargando tu jornada...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isLocalCarrierModal = (c?: string) => {
    const s = String(c || '').toLowerCase();
    return !s || s.includes('local') || s.includes('entregax') || s.includes('pickup') || s.includes('pick up') || s.includes('bodega');
  };

  // Lista de pendientes para el modal "Asignados Hoy": mostramos TODOS los
  // paquetes que el backend regresó como pendientes (PO Box, DHL/AA_DHL,
  // paquetería externa, etc.). El modal es solo VISUALIZACIÓN del inventario
  // asignado hoy, así que no aplicamos el toggle de etiqueta — ese toggle
  // solo limita qué se puede cargar desde el botón "Entrega Local".
  // Así el badge del modal (totalAssigned) coincide con la suma real
  // de los renglones mostrados (entregados + en camioneta + pendientes).
  const filteredPendingForModal = pendingPackagesList;

  const matchesCarrierFilter = (pkg: any) => {
    if (assignedCarrierFilter === 'all') return true;
    const carrier = String(pkg.national_carrier || '').toLowerCase();
    const tracking = String(pkg.tracking_number || '');
    if (assignedCarrierFilter === 'po_box') return /^US-/i.test(tracking);
    if (assignedCarrierFilter === 'tdi') return carrier.includes('tdi') || /^TDX-/i.test(tracking);
    if (assignedCarrierFilter === 'dhl') return carrier.includes('dhl') || !!pkg.is_dhl_shipment;
    return true;
  };
  const modalDelivered = deliveredPackages.filter(matchesCarrierFilter);
  const modalLoaded = loadedPackages.filter(matchesCarrierFilter);
  const modalPending = filteredPendingForModal.filter(matchesCarrierFilter);
  const showModalDelivered = (assignedStatusFilter === 'all' || assignedStatusFilter === 'delivered') && modalDelivered.length > 0;
  const showModalLoaded = (assignedStatusFilter === 'all' || assignedStatusFilter === 'loaded') && modalLoaded.length > 0;
  const showModalPending = (assignedStatusFilter === 'all' || assignedStatusFilter === 'pending') && modalPending.length > 0;
  const modalFilteredTotal =
    (showModalDelivered ? modalDelivered.length : 0) +
    (showModalLoaded ? modalLoaded.length : 0) +
    (showModalPending ? modalPending.length : 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F05A28']} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          {/* Izquierda: back */}
          <TouchableOpacity style={styles.backButtonHeader} onPress={handleBackToEmployeeHome}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>

          {/* Centro: logo */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Image
              source={logoUrl ? { uri: logoUrl } : require('../../assets/logo-negro.png')}
              style={{ width: 130, height: 34, resizeMode: 'contain' }}
            />
          </View>

          {/* Derecha: fecha + chat */}
          <View style={{ alignItems: 'flex-end', justifyContent: 'center', marginRight: 4 }}>
            <Text style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>
              {currentTime.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('ChatList', { user, token })}>
              <MaterialIcons name="chat" size={24} color="#F05A28" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Badge / Ver Ruta — Ver Ruta solo aplica para repartidores, no para monitoreo */}
        {!isMonitoreo && stats.pendingDelivery > 0 ? (
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
            <TouchableOpacity
              style={[styles.statCard, styles.statCardPrimary]}
              activeOpacity={0.85}
              onPress={handleAssignedTodayPress}
            >
              <MaterialIcons name={isMonitoreo ? 'directions-boat' : 'inventory-2'} size={32} color="#fff" />
              <Text style={styles.statNumber}>{stats.totalAssigned}</Text>
              <Text style={styles.statLabel}>{isMonitoreo ? 'Contenedores en Ruta' : 'Asignados Hoy'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.85}
              onPress={() => !isMonitoreo && loadedPackages.length > 0 && setShowLoadedModal(true)}
            >
              <MaterialIcons name={isMonitoreo ? 'visibility' : 'local-shipping'} size={28} color="#2196F3" />
              <Text style={[styles.statNumber, { color: '#2196F3' }]}>{stats.loadedToday}</Text>
              <Text style={styles.statLabel}>{isMonitoreo ? 'Monitoreando' : 'Cargados'}</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.85}
              onPress={() => setShowPaqueteriaModal(true)}
            >
              <MaterialIcons name="local-post-office" size={28} color="#F05A28" />
              <Text style={[styles.statNumber, { color: '#F05A28' }]}>{stats.paqueteriaCount}</Text>
              <Text style={styles.statLabel}>Salidas Paqueterías</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PettyCash', { user, token })}
            >
              <MaterialIcons name="account-balance-wallet" size={28} color="#00B894" />
              <Text style={[styles.statNumber, { color: '#00B894', fontSize: 15 }]}>Fondo Caja</Text>
              <Text style={styles.statLabel}>Ver saldo →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress Ring (oculto para monitoreo) / Botón X-SOS para monitoreo */}
        {isMonitoreo ? (
          <TouchableOpacity
            style={styles.xsosButton}
            onPress={() => navigation.navigate('ChatList', { user, token })}
            activeOpacity={0.85}
          >
            <MaterialIcons name="chat" size={26} color="#fff" />
            <Text style={styles.xsosText}>X-SOS</Text>
            <MaterialIcons name="arrow-forward" size={22} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        ) : (
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
        )}

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
                {!!action.badge && action.badge > 0 && (
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

      {/* ── MODAL PAQUETES CARGADOS ── */}
      <Modal visible={showLoadedModal} animationType="slide" transparent onRequestClose={() => setShowLoadedModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons name="local-shipping" size={24} color="#2196F3" />
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#111' }}>Paquetes Cargados</Text>
                <View style={{ backgroundColor: '#2196F3', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{loadedPackages.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowLoadedModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Lista */}
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
              {loadedPackages.map((pkg, i) => (
                <View key={pkg.id} style={{
                  backgroundColor: '#F8F9FA', borderRadius: 12, padding: 14,
                  marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#2196F3',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#2196F3', flexShrink: 1 }}>{pkg.tracking_number}</Text>
                      <TouchableOpacity
                        onPress={async () => {
                          await copyToClipboard(pkg.tracking_number);
                          setCopiedTrackingId(pkg.id);
                          setTimeout(() => setCopiedTrackingId(null), 1500);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialIcons
                          name={copiedTrackingId === pkg.id ? 'check' : 'content-copy'}
                          size={15}
                          color={copiedTrackingId === pkg.id ? '#4CAF50' : '#90CAF9'}
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {pkg.client_number ? (
                        <View style={{ backgroundColor: '#E3F2FD', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#1976d2' }}>{pkg.client_number}</Text>
                        </View>
                      ) : null}
                      <Text style={{ fontSize: 11, color: '#999' }}>#{i + 1}</Text>
                    </View>
                  </View>
                  {pkg.recipient_name ? (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 4 }}>{pkg.recipient_name}</Text>
                  ) : null}
                  {(() => {
                    const PLACEHOLDERS = ['pendiente de asignar', 'en bodega', 'sin dirección', 'sin direccion'];
                    const addr = [pkg.delivery_address, pkg.delivery_city, pkg.delivery_zip].filter(v => {
                      if (!v) return false;
                      const low = String(v).toLowerCase().trim();
                      return !PLACEHOLDERS.some(p => low.includes(p));
                    }).join(', ');
                    if (!addr) return null;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialIcons name="location-on" size={14} color="#888" />
                        <Text style={{ fontSize: 12, color: '#666', flex: 1 }} numberOfLines={2}>{addr}</Text>
                      </View>
                    );
                  })()}
                  {pkg.national_carrier ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <MaterialIcons name="local-post-office" size={14} color="#888" />
                      <Text style={{ fontSize: 12, color: '#888' }}>{pkg.national_carrier}: {pkg.national_tracking || '—'}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Modal: Asignados Hoy - historial completo */}
      <Modal visible={showAssignedModal} animationType="slide" transparent onRequestClose={() => setShowAssignedModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons name="inventory-2" size={24} color="#F05A28" />
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#111' }}>Asignados Hoy</Text>
                <View style={{ backgroundColor: '#F05A28', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                    {assignedStatusFilter === 'all' && assignedCarrierFilter === 'all' ? stats.totalAssigned : modalFilteredTotal}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAssignedModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Filter Row 1: Status */}
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {([
                  { key: 'all' as const, label: 'Todos' },
                  { key: 'delivered' as const, label: 'Entregados' },
                  { key: 'loaded' as const, label: 'Cargados' },
                  { key: 'pending' as const, label: 'Pendientes de Cargar' },
                ]).map(f => (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setAssignedStatusFilter(f.key)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: assignedStatusFilter === f.key ? '#F05A28' : '#F5F5F5',
                      borderWidth: 1,
                      borderColor: assignedStatusFilter === f.key ? '#F05A28' : '#E0E0E0',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: assignedStatusFilter === f.key ? '#fff' : '#555' }}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Filter Row 2: Carrier */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {([
                  { key: 'all' as const, label: 'Todos' },
                  { key: 'po_box' as const, label: 'PO BOX' },
                  { key: 'tdi' as const, label: 'TDI EXPRESS' },
                  { key: 'dhl' as const, label: 'DHL MTY' },
                ]).map(f => (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setAssignedCarrierFilter(f.key)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: assignedCarrierFilter === f.key ? '#1565C0' : '#F5F5F5',
                      borderWidth: 1,
                      borderColor: assignedCarrierFilter === f.key ? '#1565C0' : '#E0E0E0',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: assignedCarrierFilter === f.key ? '#fff' : '#555' }}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
              {/* ENTREGADOS */}
              {showModalDelivered && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <MaterialIcons name="check-circle" size={18} color="#4CAF50" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#4CAF50' }}>Entregados hoy ({modalDelivered.length})</Text>
                  </View>
                  {modalDelivered.map((pkg: any, i: number) => (
                    <View key={`delivered-${pkg.id}-${i}`} style={{ backgroundColor: '#F1F8E9', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#4CAF50' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#2E7D32', flexShrink: 1 }}>{pkg.tracking_number}</Text>
                        {pkg.client_number ? <View style={{ backgroundColor: '#C8E6C9', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#1B5E20' }}>{pkg.client_number}</Text></View> : null}
                      </View>
                      {pkg.recipient_name ? <Text style={{ fontSize: 12, color: '#388E3C' }}>{pkg.recipient_name}</Text> : null}
                      {pkg.delivery_address ? <Text style={{ fontSize: 11, color: '#666' }} numberOfLines={1}>{pkg.delivery_address}{pkg.delivery_city ? `, ${pkg.delivery_city}` : ''}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
              {/* CARGADOS EN CAMIONETA */}
              {showModalLoaded && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <MaterialIcons name="local-shipping" size={18} color="#2196F3" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#2196F3' }}>En camioneta ({modalLoaded.length})</Text>
                  </View>
                  {modalLoaded.map((pkg: any, i: number) => (
                    <View key={`loaded-${pkg.id}-${i}`} style={{ backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#2196F3' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#1565C0', flexShrink: 1 }}>{pkg.tracking_number}</Text>
                        {pkg.client_number ? <View style={{ backgroundColor: '#BBDEFB', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#0D47A1' }}>{pkg.client_number}</Text></View> : null}
                      </View>
                      {pkg.recipient_name ? <Text style={{ fontSize: 12, color: '#1976D2' }}>{pkg.recipient_name}</Text> : null}
                      {pkg.delivery_address ? <Text style={{ fontSize: 11, color: '#666' }} numberOfLines={1}>{pkg.delivery_address}{pkg.delivery_city ? `, ${pkg.delivery_city}` : ''}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
              {/* PENDIENTES POR CARGAR */}
              {showModalPending && (
                <View style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <MaterialIcons name="pending" size={18} color="#FF9800" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FF9800' }}>Pendientes por cargar ({modalPending.length})</Text>
                  </View>
                  {modalPending.map((pkg: any, i: number) => {
                    const carrierRaw = String(pkg.national_carrier || '').trim();
                    const isLocal = isLocalCarrierModal(carrierRaw);
                    const carrierLabel = isLocal ? 'LOCAL' : (carrierRaw.toUpperCase() || 'PAQUETERIA');
                    return (
                      <View key={`pending-${pkg.id}-${i}`} style={{ backgroundColor: '#FFF8E1', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#FF9800' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#E65100', flexShrink: 1 }}>{pkg.tracking_number}</Text>
                          <View style={{ backgroundColor: isLocal ? '#FFE0B2' : '#FFCDD2', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isLocal ? '#BF360C' : '#B71C1C' }}>{carrierLabel}</Text>
                          </View>
                          {pkg.client_number ? <View style={{ backgroundColor: '#FFE0B2', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ fontSize: 11, fontWeight: '700', color: '#BF360C' }}>{pkg.client_number}</Text></View> : null}
                        </View>
                        {pkg.recipient_name ? <Text style={{ fontSize: 12, color: '#E65100' }}>{pkg.recipient_name}</Text> : null}
                        {pkg.delivery_address ? <Text style={{ fontSize: 11, color: '#666' }} numberOfLines={1}>{pkg.delivery_address}{pkg.delivery_city ? `, ${pkg.delivery_city}` : ''}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              )}
              {!showModalDelivered && !showModalLoaded && !showModalPending && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <MaterialIcons name="inbox" size={48} color="#ccc" />
                  <Text style={{ color: '#999', marginTop: 8 }}>
                    {assignedStatusFilter === 'all' && assignedCarrierFilter === 'all'
                      ? 'Sin paquetes asignados hoy'
                      : 'Sin paquetes con estos filtros'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Modal: Paqueterías con envíos pendientes */}
      <Modal visible={showPaqueteriaModal} animationType="slide" transparent onRequestClose={() => { setShowPaqueteriaModal(false); setSelectedCarrierGroup(null); setPaqueteriaView('carrier_list'); setPendingCarrier(null); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {paqueteriaView !== 'carrier_list' && (
                  <TouchableOpacity onPress={() => { setPaqueteriaView('carrier_list'); setPendingCarrier(null); setSelectedCarrierGroup(null); }} style={{ marginRight: 4 }}>
                    <MaterialIcons name="arrow-back" size={22} color="#F05A28" />
                  </TouchableOpacity>
                )}
                <MaterialIcons name="local-post-office" size={24} color="#F05A28" />
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#111' }}>
                  {paqueteriaView === 'mode_select' && pendingCarrier
                    ? pendingCarrier.carrier.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                    : paqueteriaView === 'package_list' && selectedCarrierGroup
                      ? selectedCarrierGroup.carrier.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                      : 'Salidas Paqueterías'}
                </Text>
                <View style={{ backgroundColor: '#F05A28', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                    {paqueteriaView === 'package_list' && selectedCarrierGroup
                      ? selectedCarrierGroup.packages.length
                      : paqueteriaView === 'mode_select' && pendingCarrier
                        ? pendingCarrier.packages.length
                        : stats.paqueteriaCount}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => { setShowPaqueteriaModal(false); setSelectedCarrierGroup(null); setPaqueteriaView('carrier_list'); setPendingCarrier(null); }}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Vista: lista de carriers */}
            {paqueteriaView === 'carrier_list' && (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
                {paqueteriaGroups.map((g) => (
                  <TouchableOpacity
                    key={g.carrier}
                    activeOpacity={0.7}
                    onPress={() => { setPendingCarrier({ carrier: g.carrier, packages: g.packages }); setPaqueteriaView('mode_select'); }}
                    style={{ backgroundColor: '#FFF5F2', borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#F05A28', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <MaterialIcons name="local-post-office" size={22} color="#F05A28" />
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>
                        {g.carrier.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ backgroundColor: '#F05A28', borderRadius: 20, minWidth: 36, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{g.count}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color="#F05A28" />
                    </View>
                  </TouchableOpacity>
                ))}
                {paqueteriaGroups.length === 0 && (
                  <Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>Sin paquetes de paquetería pendientes</Text>
                )}
              </ScrollView>
            )}

            {/* Vista: selección de modo */}
            {paqueteriaView === 'mode_select' && pendingCarrier && (
              <View style={{ padding: 20, paddingBottom: 32 }}>
                <Text style={{ fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' }}>
                  ¿Cómo vas a entregar las {pendingCarrier.packages.length} guías de{' '}
                  <Text style={{ fontWeight: '800', color: '#F05A28' }}>
                    {pendingCarrier.carrier.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </Text>
                  ?
                </Text>
                {/* Mostrador */}
                <TouchableOpacity
                  style={{ backgroundColor: '#FFF5F2', borderRadius: 14, padding: 18, marginBottom: 12, borderWidth: 2, borderColor: '#F05A28', flexDirection: 'row', alignItems: 'center', gap: 14 }}
                  onPress={() => {
                    setShowPaqueteriaModal(false);
                    setPaqueteriaView('carrier_list');
                    navigation.navigate('PaqueteriaHandoff', { carrier: pendingCarrier.carrier, mode: 'mostrador', packages: pendingCarrier.packages, token });
                  }}
                >
                  <MaterialIcons name="storefront" size={28} color="#F05A28" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#F05A28' }}>Mostrador</Text>
                    <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Estas en la sucursal de la paquetería entregando en ventanilla</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#F05A28" />
                </TouchableOpacity>
                {/* Recolección */}
                <TouchableOpacity
                  style={{ backgroundColor: '#F3F8FF', borderRadius: 14, padding: 18, marginBottom: 12, borderWidth: 2, borderColor: '#1976d2', flexDirection: 'row', alignItems: 'center', gap: 14 }}
                  onPress={() => {
                    setShowPaqueteriaModal(false);
                    setPaqueteriaView('carrier_list');
                    navigation.navigate('PaqueteriaHandoff', { carrier: pendingCarrier.carrier, mode: 'recoleccion', packages: pendingCarrier.packages, token });
                  }}
                >
                  <MaterialIcons name="local-shipping" size={28} color="#1976d2" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#1976d2' }}>Recolección</Text>
                    <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>La paquetería pasa a recoger los paquetes a CEDIS</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#1976d2" />
                </TouchableOpacity>
                {/* Cargar Unidad */}
                <TouchableOpacity
                  style={{ backgroundColor: '#F3FFF4', borderRadius: 14, padding: 18, borderWidth: 2, borderColor: '#2E7D32', flexDirection: 'row', alignItems: 'center', gap: 14 }}
                  onPress={() => {
                    setShowPaqueteriaModal(false);
                    setPaqueteriaView('carrier_list');
                    navigation.navigate('PaqueteriaHandoff', { carrier: pendingCarrier.carrier, mode: 'cargar_unidad', packages: pendingCarrier.packages, token });
                  }}
                >
                  <MaterialIcons name="add-box" size={28} color="#2E7D32" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#2E7D32' }}>Cargar Unidad</Text>
                    <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Carga los paquetes a tu camioneta para llevarlos a la paqueterías</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#2E7D32" />
                </TouchableOpacity>
              </View>
            )}
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
    width: 68,
    height: 28,
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
  statBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#E53935',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  statBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
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
  // Botón X-SOS (acceso directo al chat para monitoreo)
  xsosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F05A28',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowColor: '#F05A28',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  xsosText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    marginHorizontal: 12,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
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
