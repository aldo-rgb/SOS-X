/**
 * POBoxHubScreen - Hub de módulos PO Box USA
 *
 * Agrupa todos los sub-módulos PO Box (Recibir, Entrada, Salida, Cotizar,
 * Reempaque, Cobrar, Inventario) en una sola pantalla, filtrados por los
 * permisos del usuario en `/api/modules/ops_usa_pobox/me`.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';

interface POBoxModule {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  screen: string;
  moduleKey: string;
}

// Módulos ocultos en móvil (sólo se gestionan desde web): receive, entry, quote

const POBOX_MODULES: POBoxModule[] = [
  {
    id: 'exit',
    title: 'Salida',
    subtitle: 'Procesar consolidaciones y despachos',
    icon: 'exit-outline',
    color: '#FF9800',
    screen: 'POBoxExit',
    moduleKey: 'exit',
  },
  {
    id: 'collect',
    title: 'Cobrar',
    subtitle: 'Gestionar cobros y pagos pendientes',
    icon: 'cash-outline',
    color: '#9C27B0',
    screen: 'POBoxCollect',
    moduleKey: 'collect',
  },
  {
    id: 'repack',
    title: 'Reempaque',
    subtitle: 'Consolidar múltiples paquetes en una caja',
    icon: 'albums-outline',
    color: '#E91E63',
    screen: 'POBoxRepack',
    moduleKey: 'repack',
  },
  {
    id: 'inventory',
    title: 'Inventario',
    subtitle: 'Ver paquetes en bodega',
    icon: 'file-tray-stacked-outline',
    color: '#607D8B',
    screen: 'POBoxInventory',
    moduleKey: 'inventory',
  },
];

const NOT_IMPLEMENTED: string[] = [];

export default function POBoxHubScreen({ route, navigation }: any) {
  const { user, token } = route.params;
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/modules/ops_usa_pobox/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const allowed = (data.modules || [])
          .filter((m: any) => m.can_view)
          .map((m: any) => m.module_key);
        setPermissions(allowed);
      } else if (user?.role === 'super_admin' || user?.role === 'admin') {
        setPermissions(POBOX_MODULES.map((m) => m.moduleKey));
      }
    } catch (err) {
      console.error('Error loading PO Box permissions:', err);
      if (user?.role === 'super_admin' || user?.role === 'admin') {
        setPermissions(POBOX_MODULES.map((m) => m.moduleKey));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPermissions();
  };

  const handlePress = (module: POBoxModule) => {
    if (NOT_IMPLEMENTED.includes(module.screen)) {
      Alert.alert(
        `📱 ${module.title}`,
        'Este módulo estará disponible próximamente.\n\nPuedes usar el Panel Web para acceder a esta función.',
        [{ text: 'Entendido' }]
      );
      return;
    }
    navigation.navigate(module.screen, { user, token });
  };

  const visibleModules = POBOX_MODULES.filter((m) =>
    permissions.includes(m.moduleKey)
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content
          title="PO Box USA"
          subtitle="Módulos de operación"
          color="#fff"
          titleStyle={{ fontSize: 18, fontWeight: '700' }}
          subtitleStyle={{ fontSize: 12, color: '#fff', opacity: 0.85 }}
        />
      </Appbar.Header>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />
        }
      >
        {/* Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Ionicons name="mail-outline" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>PO Box USA</Text>
            <Text style={styles.bannerSubtitle}>
              Recepción, despacho y consolidación de paquetería desde EE.UU.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>📦 Mis Módulos</Text>

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Cargando módulos...</Text>
          </View>
        ) : visibleModules.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="lock-closed-outline" size={48} color="#999" />
            <Text style={styles.emptyText}>
              No tienes permisos asignados para ningún módulo PO Box.
            </Text>
            <Text style={styles.emptyHint}>
              Contacta al administrador para solicitar acceso.
            </Text>
          </View>
        ) : (
          visibleModules.map((module) => (
            <TouchableOpacity
              key={module.id}
              style={styles.moduleCard}
              onPress={() => handlePress(module)}
              activeOpacity={0.7}
            >
              <View style={[styles.moduleIcon, { backgroundColor: module.color }]}>
                <Ionicons name={module.icon as any} size={28} color="#fff" />
              </View>
              <View style={styles.moduleContent}>
                <Text style={styles.moduleTitle}>{module.title}</Text>
                <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  appbar: { backgroundColor: '#111', elevation: 0 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORANGE,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    gap: 14,
  },
  bannerIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  bannerSubtitle: { fontSize: 12, color: '#fff', opacity: 0.9, marginTop: 2 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    marginLeft: 4,
  },
  moduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  moduleIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  moduleContent: { flex: 1 },
  moduleTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  moduleSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyHint: { fontSize: 12, color: '#999', marginTop: 6, textAlign: 'center' },
});
