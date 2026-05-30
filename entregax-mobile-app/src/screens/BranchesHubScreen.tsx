/**
 * BranchesHubScreen
 * -----------------------------------------------------------
 * Hub del módulo "Sucursales". Agrupa accesos relacionados con
 * la consulta y el inventario de paquetería por sucursal:
 *   1. Escáner Multi-Sucursal  → consulta detallada de cualquier guía
 *   2. Inventario por Sucursal → control de paquetes en bodega /
 *                                 informe consolidado para directivos
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'BranchesHub'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';

const INFO_ONLY_ROLES = ['admin', 'super_admin', 'director'];

interface Option {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  badge?: string;
  route: keyof RootStackParamList;
}

export default function BranchesHubScreen({ navigation, route }: Props) {
  const { user, token } = route.params;

  const isDirective = INFO_ONLY_ROLES.includes(user?.role);

  const OPTIONS: Option[] = [
    {
      id: 'scanner',
      title: 'Escáner Multi-Sucursal',
      subtitle: 'Consulta detallada de cualquier guía',
      icon: 'barcode-outline',
      color: '#1976D2',
      route: 'WarehouseScanner',
    },
    {
      id: 'inventory',
      title: 'Inventario por Sucursal',
      subtitle: isDirective
        ? 'Informe consolidado de paquetes por sucursal'
        : 'Paquetes disponibles en bodega',
      icon: 'file-tray-stacked-outline',
      color: '#2E7D32',
      route: 'BranchInventoryReport',
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Sucursales</Text>
          <Text style={styles.headerSubtitle}>Escáner · Inventario por sucursal</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <View style={styles.intro}>
          <Ionicons name="information-circle-outline" size={18} color="#1565C0" />
          <Text style={styles.introTxt}>
            Selecciona una opción. El escáner es solo consulta; el inventario muestra los paquetes
            disponibles en la sucursal seleccionada.
          </Text>
        </View>

        {OPTIONS.map(o => (
          <TouchableOpacity
            key={o.id}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(o.route as any, { user, token })}
          >
            <View style={[styles.iconBox, { backgroundColor: o.color + '22' }]}>
              <Ionicons name={o.icon} size={28} color={o.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.cardTitle}>{o.title}</Text>
                {!!o.badge && (
                  <View style={styles.badge}><Text style={styles.badgeTxt}>{o.badge}</Text></View>
                )}
              </View>
              <Text style={styles.cardSubtitle}>{o.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#999" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  intro: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3F2FD', borderColor: '#BBDEFB', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 14 },
  introTxt: { flex: 1, color: '#1565C0', fontSize: 12 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  iconBox: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#222' },
  cardSubtitle: { fontSize: 12, color: '#666', marginTop: 4, lineHeight: 16 },
  badge: { backgroundColor: '#FFF4E0', borderColor: '#FFD699', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  badgeTxt: { color: '#B26A00', fontSize: 9, fontWeight: '700' },
});
