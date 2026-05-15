/**
 * MonitorIncidentsScreen — Levantar incidencias (tickets categoría "container")
 * para contenedores que están en monitoreo y aún no han sido entregados.
 *
 * Flujo:
 *  1. Lista contenedores con monitoring_started_at y sin delivery_confirmed_at.
 *  2. Al tocar uno se abre un modal con descripción + fotos opcionales.
 *  3. Envía POST a /api/support/message con category='container'.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Modal, TextInput, ScrollView, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import api, { API_URL } from '../services/api';

type ImageAsset = { uri: string; name: string; type: string };

export default function MonitorIncidentsScreen({ navigation, route }: any) {
  const { user, token } = route.params || {};
  const [containers, setContainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [selected, setSelected] = useState<any | null>(null);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/monitoreo/containers?status=in_transit_clientfinal', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const list = Array.isArray(res.data?.containers) ? res.data.containers : [];
      // Solo los que están en monitoreo activo y aún no entregados
      const active = list.filter((c: any) => c.monitoring_started_at && !c.delivery_confirmed_at);
      setContainers(active);
    } catch (e: any) {
      console.error('Error cargando contenedores:', e?.response?.data || e.message);
      Alert.alert('Error', 'No se pudieron cargar los contenedores.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const openIncident = (c: any) => {
    setSelected(c);
    setDescription('');
    setImages([]);
  };

  const closeIncident = () => {
    if (submitting) return;
    setSelected(null);
    setDescription('');
    setImages([]);
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Habilita el acceso a la galería para adjuntar fotos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
        selectionLimit: 5,
      });
      if (!result.canceled && result.assets) {
        const newImages: ImageAsset[] = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName || `incident_${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        }));
        setImages((prev) => [...prev, ...newImages].slice(0, 5));
      }
    } catch (e) {
      console.error('Error picking image:', e);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Habilita el acceso a la cámara para tomar fotos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setImages((prev) => [
          ...prev,
          {
            uri: asset.uri,
            name: asset.fileName || `incident_${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          },
        ].slice(0, 5));
      }
    } catch (e) {
      console.error('Error taking photo:', e);
    }
  };

  const handleRemoveImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!selected) return;
    if (!description.trim()) {
      Alert.alert('Descripción requerida', 'Describe brevemente la incidencia detectada.');
      return;
    }
    setSubmitting(true);
    try {
      const ref = selected.reference_code || selected.container_number || `#${selected.id}`;
      const driver = [selected.driver_company, selected.driver_name, selected.driver_plates]
        .filter(Boolean)
        .join(' · ');
      const contextLines = [
        `Contenedor: ${ref}`,
        selected.container_number ? `# Contenedor: ${selected.container_number}` : null,
        selected.bl_number ? `BL: ${selected.bl_number}` : null,
        selected.client_name ? `Cliente: ${selected.client_name}${selected.client_box_id ? ' · ' + selected.client_box_id : ''}` : null,
        driver ? `Transporte: ${driver}` : null,
      ].filter(Boolean).join('\n');

      const fullMessage = `[Incidencia · Contenedor ${ref}]\n${contextLines}\n\n${description.trim()}`;

      const formData = new FormData();
      formData.append('message', fullMessage);
      formData.append('category', 'container');
      formData.append('escalateDirectly', 'true');
      images.forEach((img, idx) => {
        formData.append('images', {
          uri: img.uri,
          name: img.name || `incident_${idx}.jpg`,
          type: img.type || 'image/jpeg',
        } as any);
      });

      const res = await fetch(`${API_URL}/api/support/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.status === 'escalated' || data.ticketFolio)) {
        Alert.alert(
          'Incidencia registrada',
          data.ticketFolio
            ? `Se generó el ticket ${data.ticketFolio}. Soporte la revisará a la brevedad.`
            : 'La incidencia fue registrada correctamente.',
          [{ text: 'OK', onPress: closeIncident }]
        );
      } else if (!res.ok) {
        Alert.alert('Error', data.error || data.message || 'No se pudo registrar la incidencia.');
      } else {
        Alert.alert('Listo', data.message || 'Incidencia registrada.', [{ text: 'OK', onPress: closeIncident }]);
      }
    } catch (e: any) {
      console.error('Error enviando incidencia:', e?.message || e);
      Alert.alert('Error', 'No se pudo enviar la incidencia. Verifica tu conexión.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const ref = item.reference_code || item.container_number || `#${item.id}`;
    const driver = [item.driver_company, item.driver_name, item.driver_plates].filter(Boolean).join(' · ');
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.reference}>{ref}</Text>
          <View style={styles.statusBadge}>
            <MaterialIcons name="local-shipping" size={14} color="#F05A28" />
            <Text style={styles.statusText}>En monitoreo</Text>
          </View>
        </View>
        <View style={styles.row}>
          <MaterialIcons name="person" size={14} color="#888" />
          <Text style={styles.rowText}>
            {item.client_name || 'Cliente sin nombre'}
            {item.client_box_id ? `  ·  ${item.client_box_id}` : ''}
          </Text>
        </View>
        {item.container_number ? (
          <View style={styles.row}>
            <MaterialIcons name="inventory-2" size={14} color="#888" />
            <Text style={styles.rowText}>Contenedor: {item.container_number}</Text>
          </View>
        ) : null}
        {driver ? (
          <View style={styles.row}>
            <MaterialIcons name="local-shipping" size={14} color="#888" />
            <Text style={styles.rowText}>{driver}</Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.cta} onPress={() => openIncident(item)} activeOpacity={0.85}>
          <MaterialIcons name="report-problem" size={18} color="#fff" />
          <Text style={styles.ctaText}>Levantar incidencia</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Incidencias</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.banner}>
        <MaterialIcons name="report-problem" size={20} color="#E53935" />
        <Text style={styles.bannerText}>
          Selecciona un contenedor en monitoreo para levantar un ticket de soporte (categoría Contenedor).
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F05A28" />
        </View>
      ) : (
        <FlatList
          data={containers}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F05A28" />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="inbox" size={48} color="#bbb" />
              <Text style={styles.emptyText}>No hay contenedores en monitoreo activo.</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={closeIncident}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nueva incidencia</Text>
              <TouchableOpacity onPress={closeIncident} disabled={submitting}>
                <MaterialIcons name="close" size={24} color={submitting ? '#bbb' : '#666'} />
              </TouchableOpacity>
            </View>
            {selected && (
              <Text style={styles.modalSubtitle}>
                {selected.reference_code || selected.container_number || `#${selected.id}`}
                {selected.client_name ? `  ·  ${selected.client_name}` : ''}
              </Text>
            )}

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Descripción de la incidencia *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={5}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe qué está ocurriendo con el contenedor..."
                placeholderTextColor="#999"
                editable={!submitting}
              />

              <Text style={styles.label}>Evidencia (opcional, hasta 5)</Text>
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.photoButton}
                  onPress={handleTakePhoto}
                  disabled={submitting || images.length >= 5}
                >
                  <MaterialIcons name="photo-camera" size={18} color="#fff" />
                  <Text style={styles.photoButtonText}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.photoButton, { backgroundColor: '#607D8B' }]}
                  onPress={handlePickImage}
                  disabled={submitting || images.length >= 5}
                >
                  <MaterialIcons name="photo-library" size={18} color="#fff" />
                  <Text style={styles.photoButtonText}>Galería</Text>
                </TouchableOpacity>
              </View>

              {images.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                  {images.map((img, idx) => (
                    <View key={idx} style={styles.thumbWrap}>
                      <Image source={{ uri: img.uri }} style={styles.thumb} />
                      <TouchableOpacity
                        style={styles.thumbRemove}
                        onPress={() => handleRemoveImage(idx)}
                        disabled={submitting}
                      >
                        <MaterialIcons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitBtn, (submitting || !description.trim()) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting || !description.trim()}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="send" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>Enviar incidencia</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
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
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFEBEE', padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#FFCDD2',
  },
  bannerText: { flex: 1, fontSize: 12, color: '#5D4037' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    shadowRadius: 3, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reference: { fontSize: 16, fontWeight: '700', color: '#111' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: '#F05A2820',
  },
  statusText: { fontSize: 11, fontWeight: '600', color: '#F05A28' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  rowText: { fontSize: 13, color: '#555', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { marginTop: 12, color: '#888', fontSize: 14, textAlign: 'center' },
  cta: {
    marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#E53935',
  },
  ctaText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  modalSubtitle: { fontSize: 13, color: '#666', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 6 },
  textArea: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10,
    minHeight: 100, textAlignVertical: 'top', color: '#111', backgroundColor: '#fafafa',
  },
  photoActions: { flexDirection: 'row', gap: 8 },
  photoButton: {
    flex: 1, backgroundColor: '#F05A28', borderRadius: 8, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  photoButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  thumbWrap: { marginRight: 8, position: 'relative' },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#eee' },
  thumbRemove: {
    position: 'absolute', top: -6, right: -6, backgroundColor: '#E53935',
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  submitBtn: {
    marginTop: 14, backgroundColor: '#E53935', borderRadius: 10, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnDisabled: { backgroundColor: '#ccc' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
