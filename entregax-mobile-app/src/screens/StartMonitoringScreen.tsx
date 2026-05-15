/**
 * StartMonitoringScreen — Inicio de monitoreo de un contenedor.
 * El monitorista debe subir 2 fotos (operador + unidad / unidad cargada).
 * Al confirmar, el contenedor pasa a "Cargado" en su tablero.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';

type SlotKey = 'photo1' | 'photo2';
const SLOTS: { key: SlotKey; label: string; hint: string }[] = [
  { key: 'photo1', label: 'Foto 1 — Operador / cabina', hint: 'Toma al chofer junto a la unidad o dentro de la cabina.' },
  { key: 'photo2', label: 'Foto 2 — Unidad / contenedor', hint: 'Toma la unidad completa con el contenedor enganchado.' },
];

export default function StartMonitoringScreen({ navigation, route }: any) {
  const { user, token, container } = route.params || {};
  const [photos, setPhotos] = useState<Record<SlotKey, string | null>>({ photo1: null, photo2: null });
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async (slot: SlotKey) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso requerido', 'Activa el acceso a la cámara para tomar la foto.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Configuración', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.65,
      });
      if (!r.canceled && r.assets?.[0]?.uri) {
        setPhotos((p) => ({ ...p, [slot]: r.assets[0].uri }));
      }
    } catch {
      // Fallback galería
      try {
        const g = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.65,
        });
        if (!g.canceled && g.assets?.[0]?.uri) {
          setPhotos((p) => ({ ...p, [slot]: g.assets[0].uri }));
        }
      } catch (e) {
        Alert.alert('Error', 'No se pudo abrir la cámara ni la galería.');
      }
    }
  };

  const submit = async () => {
    if (!photos.photo1 || !photos.photo2) {
      Alert.alert('Faltan fotos', 'Debes subir las 2 fotos para iniciar el monitoreo.');
      return;
    }
    if (!container?.id) {
      Alert.alert('Error', 'Contenedor inválido.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      const buildFile = (uri: string, name: string): any => {
        const ext = (uri.split('.').pop() || 'jpg').toLowerCase();
        const type = ext === 'png' ? 'image/png' : 'image/jpeg';
        return { uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri, name: `${name}.${ext}`, type };
      };
      fd.append('photo1', buildFile(photos.photo1!, 'photo1'));
      fd.append('photo2', buildFile(photos.photo2!, 'photo2'));

      const resp = await fetch(`${API_URL}/api/monitoreo/containers/${container.id}/start-monitoring`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          // No establecer Content-Type para que fetch agregue el boundary correcto.
        },
        body: fd as any,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      Alert.alert('✅ Monitoreo iniciado', 'El contenedor se marcó como cargado.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo iniciar el monitoreo.');
    } finally {
      setSubmitting(false);
    }
  };

  const ref = container?.reference_code || container?.container_number || `#${container?.id}`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Iniciar Monitoreo</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.containerCard}>
          <Text style={styles.containerLabel}>Contenedor</Text>
          <Text style={styles.containerRef}>{ref}</Text>
          {container?.client_name ? (
            <Text style={styles.clientText}>👤 {container.client_name}{container.client_box_id ? ` · ${container.client_box_id}` : ''}</Text>
          ) : null}
          {container?.driver_name ? (
            <Text style={styles.driverText}>🚛 {container.driver_name}{container.driver_plates ? ` · ${container.driver_plates}` : ''}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>📸 Sube las 2 fotos</Text>
        <Text style={styles.sectionHint}>
          Ambas fotos son obligatorias. Una vez enviadas, este contenedor se marcará como “Cargado”.
        </Text>

        {SLOTS.map((s) => {
          const uri = photos[s.key];
          return (
            <View key={s.key} style={styles.slotBox}>
              <Text style={styles.slotLabel}>{s.label}</Text>
              <Text style={styles.slotHint}>{s.hint}</Text>
              {uri ? (
                <View>
                  <Image source={{ uri }} style={styles.preview} />
                  <TouchableOpacity style={styles.retakeBtn} onPress={() => pickPhoto(s.key)}>
                    <MaterialIcons name="refresh" size={16} color="#fff" />
                    <Text style={styles.retakeText}>Volver a tomar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.cameraBtn} onPress={() => pickPhoto(s.key)}>
                  <MaterialIcons name="photo-camera" size={28} color={ORANGE} />
                  <Text style={styles.cameraText}>Tomar foto</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.submitBtn, (!photos.photo1 || !photos.photo2 || submitting) && { opacity: 0.5 }]}
          disabled={!photos.photo1 || !photos.photo2 || submitting}
          onPress={submit}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="check-circle" size={20} color="#fff" />
              <Text style={styles.submitText}>Confirmar e iniciar monitoreo</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  containerCard: {
    backgroundColor: '#FFF8E1', borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#FFE082',
  },
  containerLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  containerRef: { fontSize: 18, fontWeight: '800', color: '#111', marginTop: 2 },
  clientText: { fontSize: 13, color: '#333', marginTop: 6 },
  driverText: { fontSize: 13, color: '#333', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 4 },
  sectionHint: { fontSize: 12, color: '#666', marginTop: 4, marginBottom: 10 },
  slotBox: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#eee',
  },
  slotLabel: { fontSize: 14, fontWeight: '700', color: '#111' },
  slotHint: { fontSize: 12, color: '#666', marginTop: 2, marginBottom: 10 },
  cameraBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFF3E0', borderRadius: 8, paddingVertical: 22,
    borderWidth: 1, borderStyle: 'dashed', borderColor: ORANGE,
  },
  cameraText: { color: ORANGE, fontWeight: '700', fontSize: 14 },
  preview: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#000' },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 8, paddingVertical: 8, borderRadius: 6, backgroundColor: '#666',
  },
  retakeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, marginTop: 8,
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
