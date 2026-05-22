import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Image, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';

const STATUS_LABELS: Record<string, string> = {
  in_transit: 'En tránsito',
  received_china: 'Recibido China',
  received: 'En bodega',
  received_mty: 'Recibido en MTY',
  customs: 'En aduana',
  ready_pickup: 'Listo para recoger',
  delivered: 'Entregado',
  pending: 'Pendiente',
  reempacado: 'Reempacado',
};

const STATUS_COLOR: Record<string, string> = {
  in_transit: '#2196F3',
  received: '#4CAF50',
  received_mty: '#4CAF50',
  received_china: '#FF9800',
  customs: '#F44336',
  ready_pickup: '#9C27B0',
  delivered: '#607D8B',
  pending: '#9E9E9E',
  reempacado: '#795548',
};

interface PackageDetail {
  id: number;
  tracking_internal: string;
  tracking_provider: string | null;
  origin_carrier: string | null;
  description: string | null;
  weight: number | null;
  dimensions: string | null;
  declared_value: number | null;
  status: string;
  carrier: string | null;
  image_url: string | null;
  assigned_cost_mxn: number;
  saldo_pendiente: number;
  monto_pagado: number;
  warehouse_location: string | null;
  service_type: string | null;
  is_master: boolean;
  total_boxes: number;
  created_at: string;
}

export default function AdvisorPackageDetailScreen({ navigation, route }: any) {
  const { packageId, token, clientName, clientBoxId } = route.params;
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState(false);

  useEffect(() => {
    fetchDetail();
  }, []);

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/packages/${packageId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setPkg(data);
    } catch (e: any) {
      setError(e.message || 'Error al cargar detalle');
    } finally {
      setLoading(false);
    }
  };

  const statusColor = pkg ? (STATUS_COLOR[pkg.status] || '#9E9E9E') : '#9E9E9E';
  const statusLabel = pkg ? (STATUS_LABELS[pkg.status] || pkg.status) : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {pkg?.tracking_internal || `Paquete #${packageId}`}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#F44336" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchDetail} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : pkg ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Status badge */}
          <View style={[styles.statusBanner, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {/* Foto de recepción */}
          <Section title="Foto de Recepción" icon="camera">
            {pkg.image_url ? (
              <TouchableOpacity onPress={() => setPhotoModal(true)} activeOpacity={0.85}>
                <Image
                  source={{ uri: pkg.image_url }}
                  style={styles.receptionPhoto}
                  resizeMode="cover"
                />
                <View style={styles.photoHint}>
                  <Ionicons name="expand-outline" size={14} color="#fff" />
                  <Text style={styles.photoHintText}>Toca para ampliar</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.noPhoto}>
                <Ionicons name="image-outline" size={36} color="#ccc" />
                <Text style={styles.noPhotoText}>Sin foto de recepción</Text>
              </View>
            )}
          </Section>

          {/* Guías */}
          <Section title="Guías" icon="barcode-outline">
            <InfoRow label="Guía Interna" value={pkg.tracking_internal} mono />
            <InfoRow label="Guía Proveedor / Origen" value={pkg.tracking_provider || '—'} mono />
            {pkg.origin_carrier && <InfoRow label="Transportista Origen" value={pkg.origin_carrier} />}
            {pkg.carrier && <InfoRow label="Carrier" value={pkg.carrier} />}
          </Section>

          {/* Cliente */}
          {(clientName || clientBoxId) && (
            <Section title="Cliente" icon="person-outline">
              {clientName && <InfoRow label="Nombre" value={clientName} />}
              {clientBoxId && <InfoRow label="Box ID" value={clientBoxId} mono />}
            </Section>
          )}

          {/* Detalles del paquete */}
          <Section title="Detalles del Paquete" icon="cube-outline">
            {pkg.description && <InfoRow label="Descripción" value={pkg.description} />}
            {pkg.service_type && <InfoRow label="Tipo de Servicio" value={pkg.service_type} />}
            {pkg.weight != null && <InfoRow label="Peso" value={`${pkg.weight.toFixed(2)} kg`} />}
            {pkg.dimensions && <InfoRow label="Dimensiones" value={pkg.dimensions} />}
            {pkg.warehouse_location && <InfoRow label="Ubicación en Bodega" value={pkg.warehouse_location} />}
            {pkg.is_master && <InfoRow label="Cajas Totales" value={`${pkg.total_boxes || '—'}`} />}
            <InfoRow label="Recibido" value={new Date(pkg.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} />
          </Section>

          {/* Costos */}
          {(pkg.assigned_cost_mxn > 0 || pkg.saldo_pendiente > 0 || pkg.monto_pagado > 0) && (
            <Section title="Costos" icon="cash-outline">
              {pkg.assigned_cost_mxn > 0 && <InfoRow label="Costo Total" value={`$${pkg.assigned_cost_mxn.toFixed(2)}`} highlight />}
              {pkg.monto_pagado > 0 && <InfoRow label="Pagado" value={`$${pkg.monto_pagado.toFixed(2)}`} />}
              {pkg.saldo_pendiente > 0 && <InfoRow label="Saldo Pendiente" value={`$${pkg.saldo_pendiente.toFixed(2)}`} highlight />}
            </Section>
          )}

        </ScrollView>
      ) : null}

      {/* Modal foto ampliada */}
      <Modal visible={photoModal} transparent animationType="fade" onRequestClose={() => setPhotoModal(false)}>
        <Pressable style={styles.modalBg} onPress={() => setPhotoModal(false)}>
          <Image
            source={{ uri: pkg?.image_url || '' }}
            style={styles.fullPhoto}
            resizeMode="contain"
          />
          <TouchableOpacity style={styles.closePhotoBtn} onPress={() => setPhotoModal(false)}>
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={ORANGE} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.monoValue, highlight && styles.highlightValue]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: BLACK,
    paddingHorizontal: 8, paddingVertical: 12, gap: 8,
  },
  headerTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#F44336', textAlign: 'center', marginTop: 12, fontSize: 15 },
  retryBtn: { marginTop: 16, backgroundColor: ORANGE, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  content: { padding: 16, gap: 12 },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1, padding: 12,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 15, fontWeight: '700' },
  section: {
    backgroundColor: '#fff', borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: BLACK, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { paddingHorizontal: 14, paddingVertical: 8 },
  receptionPhoto: { width: '100%', height: 220, borderRadius: 6, marginTop: 4 },
  photoHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  photoHintText: { color: '#fff', fontSize: 11 },
  noPhoto: {
    height: 120, justifyContent: 'center', alignItems: 'center', gap: 8,
    backgroundColor: '#F9F9F9', borderRadius: 8, marginVertical: 4,
  },
  noPhotoText: { color: '#bbb', fontSize: 13 },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  infoLabel: { fontSize: 13, color: '#888', flex: 1 },
  infoValue: { fontSize: 13, color: BLACK, fontWeight: '600', flex: 2, textAlign: 'right' },
  monoValue: { fontFamily: 'Courier', fontSize: 12 },
  highlightValue: { color: ORANGE },
  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center', alignItems: 'center',
  },
  fullPhoto: { width: '95%', height: '80%' },
  closePhotoBtn: { position: 'absolute', top: 50, right: 16 },
});
