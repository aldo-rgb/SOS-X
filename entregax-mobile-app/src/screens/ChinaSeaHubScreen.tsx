/**
 * ChinaSeaHubScreen - TDI Marítimo China
 * Hub con 2 módulos: Recibir Contenedor (LCL) · Inventario
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const ORANGE = '#F05A28';
const BLUE = '#1976D2';
const BLACK = '#1A1A1A';

interface Module {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: string;
  params?: any;
  color: string;
}

const MODULES: Module[] = [
  {
    id: 'lcl',
    title: 'Recibir Contenedor',
    subtitle: 'Recepción de carga consolidada (LCL). Escanea las órdenes por referencia (JSM26-XXXX), BL o número de contenedor',
    icon: 'qr-code-outline',
    screen: 'ChinaSeaReception',
    params: { mode: 'LCL' },
    color: ORANGE,
  },
  {
    id: 'inv',
    title: 'Inventario',
    subtitle: 'Consulta las órdenes marítimas en bodega, su contenedor y estado',
    icon: 'archive-outline',
    screen: 'ChinaSeaInventory',
    color: BLUE,
  },
];

export default function ChinaSeaHubScreen({ route, navigation }: any) {
  const { user, token } = route.params;
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
        {MODULES.map((mod) => (
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
});
