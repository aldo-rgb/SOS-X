/**
 * ChinaSeaHubScreen - TDI Marítimo China
 * Hub con 3 módulos (filtrados por permisos):
 *   - Recibir Contenedor (LCL)
 *   - Actualizar Status Full Conteiner (FCL)
 *   - Inventario
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLUE = '#1976D2';
const BLACK = '#1A1A1A';

type ModuleKey = 'reception' | 'reception_fcl' | 'inventory';

interface ModuleDef {
  key: ModuleKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: string;
  params?: any;
  color: string;
}

const MODULES: ModuleDef[] = [
  {
    key: 'reception',
    title: 'Recibir Contenedor',
    subtitle: 'Recepción de carga consolidada (LCL). Escanea las órdenes por referencia (JSM26-XXXX), BL o número de contenedor',
    icon: 'qr-code-outline',
    screen: 'ChinaSeaReception',
    params: { mode: 'LCL' },
    color: ORANGE,
  },
  {
    key: 'reception_fcl',
    title: 'Actualizar Status Full Conteiner',
    subtitle: 'Actualiza el status de contenedores FCL (un solo cliente) y confirma la llegada a CEDIS',
    icon: 'qr-code-outline',
    screen: 'ChinaSeaReception',
    params: { mode: 'FCL' },
    color: ORANGE,
  },
  {
    key: 'inventory',
    title: 'Inventario',
    subtitle: 'Consulta las órdenes marítimas en bodega, su contenedor y estado',
    icon: 'archive-outline',
    screen: 'ChinaSeaInventory',
    color: BLUE,
  },
];

export default function ChinaSeaHubScreen({ route, navigation }: any) {
  const { user, token } = route.params;
  const [allowed, setAllowed] = useState<ModuleKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // super_admin ve todo
      if (user?.role === 'super_admin') {
        if (!cancelled) {
          setAllowed(MODULES.map((m) => m.key));
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/modules/ops_china_sea/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const keys: ModuleKey[] = (data.modules || [])
          .filter((m: any) => m.can_view)
          .map((m: any) => m.module_key as ModuleKey);
        if (!cancelled) setAllowed(keys);
      } catch (err) {
        // Fail-closed: si falla el endpoint, no exponer módulos
        console.warn('[ChinaSeaHub] no se pudieron cargar permisos', err);
        if (!cancelled) setAllowed([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, user?.role]);

  const visible = MODULES.filter((m) => allowed.includes(m.key));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Ionicons name="boat" size={24} color={ORANGE} style={{ marginHorizontal: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>TDI · ENTREGAX</Text>
          <Text style={styles.headerTitle}>Marítimo China</Text>
          <Text style={styles.headerSubtitle}>
            Recepción por contenedor / BL / referencia y control de inventario
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator color={ORANGE} />
            <Text style={{ marginTop: 12, color: '#666' }}>Cargando permisos…</Text>
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="lock-closed-outline" size={32} color="#B07A12" />
            <Text style={styles.emptyTitle}>Sin módulos asignados</Text>
            <Text style={styles.emptySubtitle}>
              Tu usuario no tiene módulos habilitados en Marítimo China. Solicita acceso a tu administrador.
            </Text>
          </View>
        ) : (
          visible.map((mod) => (
            <TouchableOpacity
              key={mod.key}
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
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: BLACK, paddingHorizontal: 16, paddingVertical: 18 },
  headerLabel: { fontSize: 10, color: ORANGE, fontWeight: '800', letterSpacing: 1.5 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginTop: 2 },
  headerSubtitle: { fontSize: 12, color: '#fff', opacity: 0.7, marginTop: 4 },
  body: { padding: 14, gap: 14 },
  card: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  cardTop: { height: 130, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  cardBody: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: BLACK },
  cardSubtitle: { fontSize: 12, color: '#666', marginTop: 4, lineHeight: 16 },
  emptyCard: { backgroundColor: '#FFF8E1', borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#F5C77E', borderStyle: 'dashed' },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '800', color: '#8B6914' },
  emptySubtitle: { marginTop: 6, fontSize: 13, color: '#8B6914', textAlign: 'center', lineHeight: 18 },
});
