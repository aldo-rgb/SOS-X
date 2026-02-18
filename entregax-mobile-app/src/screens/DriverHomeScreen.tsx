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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

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

export default function DriverHomeScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      // Cargar estadísticas de ruta
      const routeRes = await api.get('/api/driver/route-today');
      if (routeRes.data.success) {
        const route = routeRes.data.route;
        setStats({
          totalAssigned: route.totalAssigned,
          loadedToday: route.loadedToday,
          deliveredToday: route.deliveredToday,
          pendingToLoad: route.pendingToLoad,
          pendingDelivery: route.loadedPackages?.length || 0,
          returnedToday: 0, // TODO: Agregar al backend
        });
      }

      // Verificar inspección del día
      try {
        const inspRes = await api.get('/api/fleet/inspection/today');
        setInspectionDone(inspRes.data.already_inspected || false);
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
            onPress={() => navigation.navigate('Profile')}
          >
            <MaterialIcons name="account-circle" size={40} color="#F05A28" />
          </TouchableOpacity>
        </View>

        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: journeyStatus.color }]}>
          <MaterialIcons name={journeyStatus.icon as any} size={24} color="#fff" />
          <Text style={styles.statusText}>{journeyStatus.text}</Text>
        </View>

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
              onPress={() => action.enabled && navigation.navigate(action.screen)}
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
});
