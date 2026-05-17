import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Image, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';

const CATEGORIES = [
  { key: 'systemError', label: 'Error del Sistema',    icon: 'bug',                 color: '#f44336' },
  { key: 'billing',     label: 'Comisiones / Pagos',   icon: 'cash',                color: '#4CAF50' },
  { key: 'tracking',    label: 'Rastreo de Paquete',   icon: 'search',              color: '#2196F3' },
  { key: 'accounting',  label: 'Problema con Cliente', icon: 'people',              color: '#FF9800' },
  { key: 'other',       label: 'Otro',                 icon: 'ellipsis-horizontal', color: '#9E9E9E' },
];

export default function AdvisorSupportTicketScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const insets = useSafeAreaInsets();

  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [folio, setFolio] = useState('');

  const now = new Date();
  const dateLabel = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const pickScreenshot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara o galería para adjuntar capturas.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled) setScreenshot(result.assets[0]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: 'images' });
    if (!result.canceled) setScreenshot(result.assets[0]);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setScreenshot(result.assets[0]);
  };

  const submit = async () => {
    if (!category) { Alert.alert('Categoría requerida', 'Selecciona una categoría.'); return; }
    if (!description.trim()) { Alert.alert('Descripción requerida', 'Describe el problema.'); return; }

    setLoading(true);
    try {
      const form = new FormData();
      form.append('message', `[${dateLabel} ${timeLabel}]\n\n${description.trim()}`);
      form.append('category', category);
      form.append('escalateDirectly', 'true');

      if (screenshot) {
        const uri = screenshot.uri;
        const ext = uri.split('.').pop() || 'jpg';
        form.append('images', { uri, name: `screenshot.${ext}`, type: `image/${ext}` } as any);
      }

      const res = await fetch(`${API_URL}/api/support/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar ticket');

      setFolio(data.ticketFolio || data.folio || data.ticket_folio || '');
      setSent(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo enviar el ticket.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ticket Enviado</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
          </View>
          <Text style={styles.successTitle}>¡Ticket creado!</Text>
          {folio ? <Text style={styles.successFolio}>{folio}</Text> : null}
          <Text style={styles.successText}>
            Nuestro equipo revisará tu reporte. Te responderemos a la brevedad.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>Listo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo Ticket de Soporte</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Fecha y hora automáticas */}
        <View style={styles.dateRow}>
          <Ionicons name="time-outline" size={16} color="#888" />
          <Text style={styles.dateText}>{dateLabel} · {timeLabel}</Text>
        </View>

        {/* Categoría */}
        <Text style={styles.label}>Categoría *</Text>
        <View style={styles.categories}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.key}
              style={[styles.catChip, category === c.key && { backgroundColor: c.color, borderColor: c.color }]}
              onPress={() => setCategory(c.key)}
            >
              <Ionicons name={c.icon as any} size={16} color={category === c.key ? '#fff' : c.color} />
              <Text style={[styles.catLabel, category === c.key && { color: '#fff' }]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Descripción */}
        <Text style={styles.label}>Descripción del problema *</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Describe detalladamente qué ocurrió, cuándo y qué estabas haciendo..."
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={5}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />

        {/* Screenshot */}
        <Text style={styles.label}>Captura de pantalla (opcional)</Text>
        {screenshot ? (
          <View style={styles.screenshotPreview}>
            <Image source={{ uri: screenshot.uri }} style={styles.screenshotImg} resizeMode="cover" />
            <TouchableOpacity style={styles.removeScreenshot} onPress={() => setScreenshot(null)}>
              <Ionicons name="close-circle" size={24} color="#f44336" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.screenshotBtns}>
            <TouchableOpacity style={styles.screenshotBtn} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={22} color={ORANGE} />
              <Text style={styles.screenshotBtnText}>Tomar foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.screenshotBtn} onPress={pickScreenshot}>
              <Ionicons name="image-outline" size={22} color={ORANGE} />
              <Text style={styles.screenshotBtnText}>Galería</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Enviar */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.7 }]}
          onPress={submit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.submitText}>Enviar Ticket</Text>
              </>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    paddingTop: 8,
  },
  headerTitle: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  body: { padding: 16 },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 10, padding: 10,
    marginBottom: 16,
  },
  dateText: { fontSize: 13, color: '#666' },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 4 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  catLabel: { fontSize: 13, fontWeight: '500', color: '#333' },
  textArea: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#111', minHeight: 120,
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 16,
  },
  screenshotBtns: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  screenshotBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14,
    borderWidth: 1.5, borderColor: ORANGE, borderStyle: 'dashed',
  },
  screenshotBtnText: { color: ORANGE, fontWeight: '600', fontSize: 14 },
  screenshotPreview: { position: 'relative', marginBottom: 24 },
  screenshotImg: { width: '100%', height: 200, borderRadius: 12 },
  removeScreenshot: { position: 'absolute', top: 8, right: 8 },
  submitBtn: {
    backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: { marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '800', color: BLACK, marginBottom: 8 },
  successFolio: { fontSize: 15, fontWeight: '700', color: ORANGE, marginBottom: 12 },
  successText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  doneBtn: { backgroundColor: ORANGE, borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
