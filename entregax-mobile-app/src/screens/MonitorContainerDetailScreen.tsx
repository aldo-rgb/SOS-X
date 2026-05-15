/**
 * MonitorContainerDetailScreen — Detalle de un contenedor para rol Monitoreo.
 * Muestra: datos del contenedor, cliente, ruta asignada, dirección de destino,
 * historial de status, y acciones rápidas (llamar, abrir en mapa).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
  Linking, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../services/api';

const STATUS_LABELS: Record<string, string> = {
  received_origin: '📦 Recibido en origen',
  consolidated: '🧺 Consolidado',
  in_transit: '🚢 En tránsito (zarpado)',
  arrived_port: '⚓ Llegó al puerto destino',
  customs_cleared: '✅ Liberado de aduana',
  in_transit_clientfinal: '🚛 En tránsito a destino',
  delivered: '🏁 Entregado',
};

export default function MonitorContainerDetailScreen({ navigation, route }: any) {
  const { token, containerId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<{ container: any; history: any[]; destinationAddress: any | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/monitoreo/containers/${containerId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setData(res.data);
    } catch (e: any) {
      console.error('Error cargando detalle:', e?.response?.data || e.message);
      Alert.alert('Error', 'No se pudo cargar el detalle.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [containerId, token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const call = (phone?: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'No se pudo abrir el marcador.'));
  };

  const openMap = (addr: any) => {
    if (!addr) return;
    const q = encodeURIComponent(
      [addr.street, addr.exterior_number, addr.colonia, addr.city, addr.state, addr.postal_code]
        .filter(Boolean).join(', ')
    );
    if (!q) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`)
      .catch(() => Alert.alert('Error', 'No se pudo abrir Google Maps.'));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color="#F05A28" /></View>
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text>No hay datos.</Text></View>
      </SafeAreaView>
    );
  }

  const c = data.container;
  const addr = data.destinationAddress;
  const hasRoute = !!(c.driver_name || c.driver_plates || c.driver_company);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {c.reference_code || c.container_number || `Contenedor #${c.id}`}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F05A28" />}
      >
        {/* Status actual */}
        <View style={[styles.statusBanner, { backgroundColor: '#F05A2815' }]}>
          <Text style={styles.statusBannerText}>{STATUS_LABELS[c.status] || c.status}</Text>
        </View>

        {/* Datos del contenedor (vista resumida para monitorista) */}
        <Section title="📦 Datos del contenedor">
          <Row label="Referencia" value={c.reference_code} />
          <Row label="Contenedor" value={c.container_number} />
          <Row label="Semana" value={c.week_number} />
        </Section>

        {/* Cliente */}
        <Section title="👤 Cliente">
          <Row label="Nombre" value={c.client_name} />
          <Row label="Casillero" value={c.client_box_id} />
          {c.client_phone ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => call(c.client_phone)}>
              <MaterialIcons name="phone" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Llamar {c.client_phone}</Text>
            </TouchableOpacity>
          ) : null}
        </Section>

        {/* Ruta asignada */}
        <Section title="🚛 Ruta asignada">
          {hasRoute ? (
            <>
              <Row label="Empresa" value={c.driver_company} />
              <Row label="Chofer" value={c.driver_name} />
              <Row label="Placas" value={c.driver_plates} />
              <Row label="Despachado" value={c.route_dispatched_at ? new Date(c.route_dispatched_at).toLocaleString() : null} />
              {c.driver_phone ? (
                <TouchableOpacity style={styles.actionBtn} onPress={() => call(c.driver_phone)}>
                  <MaterialIcons name="phone" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Llamar al chofer {c.driver_phone}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <Text style={styles.muted}>Aún no hay ruta asignada.</Text>
          )}
        </Section>

        {/* Dirección de destino */}
        <Section title="📍 Dirección de destino">
          {addr ? (
            <>
              <Row label="Alias" value={addr.alias || addr.label} />
              <Row label="Contacto" value={addr.recipient_name || addr.contact_name} />
              <Row label="Teléfono" value={addr.phone || addr.contact_phone} />
              <Row
                label="Dirección"
                value={[
                  addr.street,
                  addr.exterior_number,
                  addr.interior_number ? `Int. ${addr.interior_number}` : null,
                  addr.neighborhood || addr.colonia,
                  addr.city,
                  addr.state,
                  addr.zip_code || addr.postal_code,
                  addr.country,
                ].filter(Boolean).join(', ')}
              />
              <Row label="Referencias" value={addr.reference || addr.references_text} />
              {(addr.phone || addr.contact_phone) ? (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#2E7D32' }]}
                  onPress={() => call(addr.phone || addr.contact_phone)}
                >
                  <MaterialIcons name="phone" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Llamar {addr.phone || addr.contact_phone}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#1976D2' }]} onPress={() => openMap(addr)}>
                <MaterialIcons name="map" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Abrir en Google Maps</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.muted}>El cliente no tiene dirección registrada.</Text>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={styles.rowItem}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: '#111', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusBanner: { padding: 14, borderRadius: 12, marginBottom: 14, alignItems: 'center' },
  statusBannerText: { fontSize: 15, fontWeight: '700', color: '#F05A28' },
  section: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    shadowRadius: 3, elevation: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 10 },
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 8 },
  rowLabel: { fontSize: 13, color: '#888', flexShrink: 0 },
  rowValue: { fontSize: 13, color: '#222', fontWeight: '500', flex: 1, textAlign: 'right' },
  muted: { fontSize: 13, color: '#888', fontStyle: 'italic' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#4CAF50', paddingVertical: 10, borderRadius: 8, marginTop: 10,
  },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  historyItem: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  historyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F05A28', marginTop: 5 },
  historyStatus: { fontSize: 13, fontWeight: '600', color: '#222' },
  historyMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  historyNotes: { fontSize: 12, color: '#555', marginTop: 4, fontStyle: 'italic' },
});
