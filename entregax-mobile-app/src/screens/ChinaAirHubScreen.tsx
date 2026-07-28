/**
 * ChinaAirHubScreen - TDI Aéreo China
 * Hub con 2 módulos: Recibir AWB · Inventario
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#1A1A1A';

interface Module {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: string;
  color: string;
  // Debe coincidir con el module_key de admin_panel_modules (panel ops_china_air).
  moduleKey: string;
  params?: Record<string, any>;
}

// Los moduleKey coinciden EXACTAMENTE con el catálogo del panel 'ops_china_air'
// (mismo que usa la web). Cada usuario ve SOLO los módulos que su permiso permite.
const MODULES: Module[] = [
  {
    id: 'reception',
    title: 'Recibir AWB',
    subtitle: 'Escanea las guías que llegaron en una AWB y registra la recepción en MTY',
    icon: 'qr-code-outline',
    screen: 'ChinaAirReception',
    color: ORANGE,
    moduleKey: 'reception',
  },
  {
    id: 'inventory',
    title: 'Inventario Aéreo',
    subtitle: 'Consulta los paquetes del servicio aéreo (AIR) en bodega y su estado',
    icon: 'archive-outline',
    screen: 'ChinaAirInventory',
    color: '#1976D2',
    moduleKey: 'inventory',
    params: { source: 'air' },
  },
  {
    id: 'tdi_cedis_mty',
    title: 'Recibir en CEDIS MTY',
    subtitle: 'Escanea guías TDX que llegaron a Monterrey para marcarlas como Recibido MTY',
    icon: 'download-outline',
    screen: 'TdiCedisMtyReception',
    color: '#2E7D32',
    moduleKey: 'tdi_cedis_mty',
  },
  {
    id: 'tdx_inventory',
    title: 'Inventario TDX',
    subtitle: 'Consulta los paquetes TDI Express (TDX) en bodega y su estado',
    icon: 'file-tray-stacked-outline',
    screen: 'ChinaAirInventory',
    color: '#6A1B9A',
    moduleKey: 'tdx_inventory',
    params: { source: 'tdi' },
  },
];

export default function ChinaAirHubScreen({ route, navigation }: any) {
  const { user, token } = route.params;
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPermissions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/modules/ops_china_air/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const allowed = (data.modules || [])
          .filter((m: any) => m.can_view)
          .map((m: any) => m.module_key);
        setPermissions(allowed);
      } else if (user?.role === 'super_admin' || user?.role === 'admin') {
        setPermissions(MODULES.map((m) => m.moduleKey));
      }
    } catch (err) {
      console.error('Error loading China Air permissions:', err);
      if (user?.role === 'super_admin' || user?.role === 'admin') {
        setPermissions(MODULES.map((m) => m.moduleKey));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user]);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

  const visibleModules = MODULES.filter((m) => permissions.includes(m.moduleKey));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Ionicons name="airplane" size={24} color={ORANGE} style={{ marginHorizontal: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>TDI · ENTREGAX</Text>
          <Text style={styles.headerTitle}>Aéreo China</Text>
          <Text style={styles.headerSubtitle}>
            Recepción y control de inventario del servicio aéreo China → México
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPermissions(); }} colors={[ORANGE]} />}
        >
          {visibleModules.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 50, paddingHorizontal: 24 }}>
              <Ionicons name="lock-closed-outline" size={44} color="#ccc" />
              <Text style={{ color: '#999', marginTop: 12, fontSize: 14, textAlign: 'center' }}>
                No tienes módulos de Aéreo China habilitados. Pídele a tu administrador que te asigne los permisos.
              </Text>
            </View>
          ) : visibleModules.map((mod) => (
            <TouchableOpacity
              key={mod.id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate(mod.screen, { user, token, ...(mod.params || {}) })}
            >
              <View style={[styles.cardTop, { backgroundColor: mod.color }]}>
                <Ionicons name={mod.icon} size={48} color="#fff" />
              </View>
              <View style={styles.cardBody}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{mod.title}</Text>
                  <Text style={styles.cardSubtitle}>{mod.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={ORANGE} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: BLACK,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  headerLabel: { fontSize: 10, color: ORANGE, fontWeight: '800', letterSpacing: 1.5 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginTop: 2 },
  headerSubtitle: { fontSize: 12, color: '#fff', opacity: 0.7, marginTop: 4 },
  body: { padding: 14, gap: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cardTop: { height: 130, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: BLACK },
  cardSubtitle: { fontSize: 12, color: '#666', marginTop: 4, lineHeight: 16 },
});
