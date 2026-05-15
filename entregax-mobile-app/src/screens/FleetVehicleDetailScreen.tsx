/**
 * FleetVehicleDetailScreen — Detalle de una unidad.
 * Muestra: foto(s), datos, kilometraje, chofer asignado, documentos con
 * fechas de vencimiento, historial de mantenimientos y de inspecciones diarias.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';

const formatKm = (km: any): string => {
  const n = Number(km || 0);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('es-MX') + ' km';
};

const formatDate = (d: any): string => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(d); }
};

const daysUntil = (d: any): number | null => {
  if (!d) return null;
  try {
    const dt = new Date(d);
    return Math.ceil((dt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  } catch { return null; }
};

const getStatusMeta = (v: any) => {
  if (v.status === 'in_shop') return { label: 'En taller', color: '#F59E0B', icon: 'build' as const };
  if (v.status === 'inactive' || v.status === 'retired') return { label: 'Inactiva', color: '#9E9E9E', icon: 'block' as const };
  if (v.assigned_driver_id) return { label: 'En ruta', color: '#2E7D32', icon: 'local-shipping' as const };
  return { label: 'En resguardo', color: '#1976D2', icon: 'home-work' as const };
};

export default function FleetVehicleDetailScreen({ navigation, route }: any) {
  const { token, vehicleId } = route.params || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/admin/fleet/vehicles/${vehicleId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setData(res.data || null);
    } catch (e: any) {
      console.error('Error cargando unidad:', e?.response?.data || e.message);
      Alert.alert('Error', 'No se pudo cargar el detalle de la unidad.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vehicleId, token]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#795548" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) return null;
  const v = data.vehicle || {};
  const meta = getStatusMeta(v);
  const photos = [v.photo_url, v.photo_front_url, v.photo_back_url, v.photo_left_url, v.photo_right_url].filter(Boolean);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>{v.economic_number || `Unidad #${v.id}`}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#795548" />}
      >
        {/* Fotos */}
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
            {photos.map((p: string, idx: number) => (
              <TouchableOpacity key={idx} onPress={() => Linking.openURL(p).catch(() => {})}>
                <Image source={{ uri: p }} style={styles.photo} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.photoPlaceholder]}>
            <MaterialIcons name="directions-car" size={48} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 6 }}>Sin fotos de la unidad</Text>
          </View>
        )}

        {/* Estado + chofer */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadgeBig, { backgroundColor: meta.color + '20' }]}>
            <MaterialIcons name={meta.icon} size={16} color={meta.color} />
            <Text style={[styles.statusTextBig, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {meta.label === 'En ruta' && v.driver_name ? (
            <View style={styles.driverRow}>
              <MaterialIcons name="person" size={16} color="#2E7D32" />
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{v.driver_name}</Text>
                {v.driver_phone ? (
                  <Text style={styles.driverPhone}>{v.driver_phone}</Text>
                ) : null}
              </View>
              {v.driver_phone ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${v.driver_phone}`)}
                >
                  <MaterialIcons name="phone" size={16} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <Text style={styles.muted}>Sin chofer asignado actualmente.</Text>
          )}
        </View>

        {/* Datos principales */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Información</Text>
          <InfoRow label="Placas" value={v.license_plates || '—'} icon="badge" />
          <InfoRow label="Marca / Modelo" value={[v.brand, v.model].filter(Boolean).join(' ') || '—'} icon="local-shipping" />
          <InfoRow label="Año" value={v.year ? String(v.year) : '—'} icon="event" />
          <InfoRow label="Tipo" value={v.vehicle_type || '—'} icon="commute" />
          <InfoRow label="Combustible" value={v.fuel_type || '—'} icon="local-gas-station" />
          <InfoRow label="Kilometraje" value={formatKm(v.current_mileage)} icon="speed" />
          <InfoRow label="VIN" value={v.vin_number || '—'} icon="qr-code-2" />
        </View>

        {/* Documentos / próximos vencimientos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📑 Documentos y vencimientos</Text>
          {(data.documents || []).length === 0 ? (
            <Text style={styles.muted}>Sin documentos registrados.</Text>
          ) : (
            (data.documents || []).map((d: any) => {
              const dleft = daysUntil(d.expiration_date);
              const isExpired = dleft !== null && dleft < 0;
              const isSoon = dleft !== null && dleft >= 0 && dleft <= 30;
              const color = isExpired ? '#C62828' : isSoon ? '#F57F17' : '#2E7D32';
              const tag = isExpired
                ? `Vencido hace ${Math.abs(dleft as number)}d`
                : isSoon
                  ? `Vence en ${dleft}d`
                  : `Vigente`;
              return (
                <View key={d.id} style={styles.docRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docTitle}>{d.document_type}</Text>
                    <Text style={styles.docMeta}>
                      {d.document_number ? `# ${d.document_number}  ·  ` : ''}
                      Vence: {formatDate(d.expiration_date)}
                    </Text>
                  </View>
                  <View style={[styles.docTag, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.docTagText, { color }]}>{tag}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Alertas activas */}
        {(data.alerts || []).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚨 Alertas activas</Text>
            {(data.alerts || []).map((a: any) => (
              <View key={a.id} style={styles.alertRow}>
                <MaterialIcons name="warning" size={16} color="#C62828" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>{a.alert_type || a.title || 'Alerta'}</Text>
                  <Text style={styles.alertMeta}>
                    {a.message || a.description || ''}
                    {a.due_date ? `  ·  ${formatDate(a.due_date)}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Mantenimientos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Historial de mantenimiento</Text>
          {(data.maintenance || []).length === 0 ? (
            <Text style={styles.muted}>Sin servicios registrados.</Text>
          ) : (
            (data.maintenance || []).slice(0, 10).map((m: any) => (
              <View key={m.id} style={styles.maintRow}>
                <View style={styles.maintIcon}>
                  <MaterialIcons name="build" size={16} color="#795548" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.maintTitle}>{m.service_type || 'Servicio'}</Text>
                  <Text style={styles.maintMeta}>
                    {formatDate(m.service_date)}
                    {m.mileage ? ` · ${formatKm(m.mileage)}` : ''}
                    {m.cost ? ` · $${Number(m.cost).toLocaleString('es-MX')}` : ''}
                  </Text>
                  {m.description ? (
                    <Text style={styles.maintDesc} numberOfLines={2}>{m.description}</Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Inspecciones diarias */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📸 Inspecciones recientes</Text>
          {(data.inspections || []).length === 0 ? (
            <Text style={styles.muted}>Sin inspecciones recientes.</Text>
          ) : (
            (data.inspections || []).slice(0, 10).map((i: any) => (
              <View key={i.id} style={styles.inspRow}>
                <MaterialIcons name="fact-check" size={16} color="#1976D2" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.inspTitle}>
                    {formatDate(i.inspection_date)}
                    {i.driver_name ? `  ·  ${i.driver_name}` : ''}
                  </Text>
                  <Text style={styles.inspMeta}>
                    {i.mileage ? `${formatKm(i.mileage)}  ·  ` : ''}
                    {i.fuel_level ? `Combustible: ${i.fuel_level}  ·  ` : ''}
                    {i.has_issues ? '⚠️ Con observaciones' : '✓ Sin observaciones'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Asignaciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👥 Historial de asignaciones</Text>
          {(data.assignments || []).length === 0 ? (
            <Text style={styles.muted}>Sin asignaciones previas.</Text>
          ) : (
            (data.assignments || []).slice(0, 10).map((a: any) => (
              <View key={a.id} style={styles.assignRow}>
                <MaterialIcons name="person" size={16} color="#666" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignTitle}>{a.driver_name || `Chofer #${a.driver_id}`}</Text>
                  <Text style={styles.assignMeta}>
                    Desde: {formatDate(a.assigned_at)}
                    {a.released_at ? `  ·  Hasta: ${formatDate(a.released_at)}` : '  ·  Activa'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Gastos */}
        {data.expenses ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💰 Gastos acumulados</Text>
            <InfoRow label="Mantenimiento" value={`$${Number(data.expenses.maintenance || 0).toLocaleString('es-MX')}`} icon="build" />
            <InfoRow label="Documentos" value={`$${Number(data.expenses.documents || 0).toLocaleString('es-MX')}`} icon="description" />
            <InfoRow label="Servicios totales" value={String(data.expenses.services_count || 0)} icon="receipt" />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const InfoRow = ({ label, value, icon }: { label: string; value: string; icon: any }) => (
  <View style={styles.infoRow}>
    <MaterialIcons name={icon} size={16} color="#888" />
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  photosRow: { marginBottom: 12 },
  photo: { width: 240, height: 160, borderRadius: 10, backgroundColor: '#eee', marginRight: 8 },
  photoPlaceholder: {
    width: '100%', height: 140, borderRadius: 10, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 1, borderColor: '#eee', borderStyle: 'dashed',
  },
  statusCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#eee',
  },
  statusBadgeBig: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8,
  },
  statusTextBig: { fontSize: 13, fontWeight: '700' },
  driverRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E8F5E9', padding: 10, borderRadius: 8,
  },
  driverName: { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  driverPhone: { fontSize: 12, color: '#2E7D32', marginTop: 1 },
  callBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#2E7D32',
    alignItems: 'center', justifyContent: 'center',
  },
  muted: { fontSize: 12, color: '#888' },
  section: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#eee',
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  infoLabel: { fontSize: 12, color: '#666', minWidth: 110 },
  infoValue: { fontSize: 13, color: '#111', fontWeight: '600', flex: 1, textAlign: 'right' },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  docTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  docMeta: { fontSize: 11, color: '#666', marginTop: 1 },
  docTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  docTagText: { fontSize: 10, fontWeight: '700' },
  alertRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  alertTitle: { fontSize: 13, fontWeight: '700', color: '#C62828' },
  alertMeta: { fontSize: 11, color: '#666', marginTop: 1 },
  maintRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  maintIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFEBE9',
    alignItems: 'center', justifyContent: 'center',
  },
  maintTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  maintMeta: { fontSize: 11, color: '#666', marginTop: 1 },
  maintDesc: { fontSize: 11, color: '#444', marginTop: 2, fontStyle: 'italic' },
  inspRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  inspTitle: { fontSize: 12, fontWeight: '700', color: '#111' },
  inspMeta: { fontSize: 11, color: '#666', marginTop: 1 },
  assignRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  assignTitle: { fontSize: 12, fontWeight: '700', color: '#111' },
  assignMeta: { fontSize: 11, color: '#666', marginTop: 1 },
});
