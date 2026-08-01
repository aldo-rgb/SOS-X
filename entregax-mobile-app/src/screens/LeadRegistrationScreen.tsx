import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

const ORANGE = '#F05A28';

const CHANNELS = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'IG', label: 'Instagram' },
  { value: 'WA', label: 'WhatsApp' },
  { value: 'WEB', label: 'Web' },
  { value: 'REF', label: 'Referido' },
  { value: 'UPS', label: 'UPS' },
  { value: 'DHL', label: 'DHL' },
  { value: 'FEDEX', label: 'FedEx' },
  { value: 'OTHER', label: 'Otro' },
];

interface Advisor { id: number; full_name: string; }

export default function LeadRegistrationScreen({ navigation, route }: any) {
  const { token } = route.params;
  const insets = useSafeAreaInsets();
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState('');
  const [advisorId, setAdvisorId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/admin/crm/advisors', auth);
        if (res.data?.advisors) setAdvisors(res.data.advisors);
      } catch { /* sin asesores */ }
    })();
  }, []);

  const reset = () => {
    setFullName(''); setWhatsapp(''); setEmail(''); setChannel(''); setAdvisorId(null); setNotes('');
  };

  const save = useCallback(async () => {
    if (!fullName.trim()) { Alert.alert('Falta el nombre', 'El nombre completo es obligatorio.'); return; }
    setSaving(true);
    try {
      await api.post('/api/admin/crm/prospects', {
        full_name: fullName.trim(),
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        acquisition_channel: channel || null,
        assigned_advisor_id: advisorId || null,
        notes: notes.trim() || null,
        follow_up_date: null,
        status: 'new',
      }, auth);
      reset();
      Alert.alert('Prospecto creado', '✅ El lead se registró en la Central de Leads.');
    } catch (err: any) {
      Alert.alert('No se pudo guardar', err?.response?.data?.error || 'Error al guardar el prospecto.');
    } finally {
      setSaving(false);
    }
  }, [fullName, whatsapp, email, channel, advisorId, notes]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, { paddingTop: insets.top ? 8 : 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Registro de Leads</Text>
          <Text style={styles.headerSub}>Alimenta la Central de Leads</Text>
        </View>
        <Ionicons name="person-add-outline" size={22} color="#fff" />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.lbl}>Nombre completo *</Text>
          <TextInput style={styles.input} placeholder="Ej. Juan Pérez" value={fullName} onChangeText={setFullName} placeholderTextColor="#999" />

          <Text style={styles.lbl}>WhatsApp / Teléfono</Text>
          <TextInput style={styles.input} placeholder="5512345678" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholderTextColor="#999" />

          <Text style={styles.lbl}>Email</Text>
          <TextInput style={styles.input} placeholder="correo@ejemplo.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#999" />

          <Text style={styles.lbl}>Canal de adquisición</Text>
          <View style={styles.chipRow}>
            {CHANNELS.map(c => {
              const on = channel === c.value;
              return (
                <TouchableOpacity key={c.value} onPress={() => setChannel(on ? '' : c.value)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && { color: '#fff' }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {advisors.length > 0 && (
            <>
              <Text style={styles.lbl}>Asignar a asesor (opcional)</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity onPress={() => setAdvisorId(null)} style={[styles.chip, !advisorId && styles.chipOn]}>
                  <Text style={[styles.chipTxt, !advisorId && { color: '#fff' }]}>Sin asignar</Text>
                </TouchableOpacity>
                {advisors.map(a => {
                  const on = advisorId === a.id;
                  return (
                    <TouchableOpacity key={a.id} onPress={() => setAdvisorId(a.id)} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipTxt, on && { color: '#fff' }]}>{a.full_name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <Text style={styles.lbl}>Notas</Text>
          <TextInput style={[styles.input, styles.inputMulti]} placeholder="Detalles del lead (opcional)…" value={notes} onChangeText={setNotes} multiline placeholderTextColor="#999" />

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Registrar lead</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ORANGE, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#ffe', fontSize: 12, opacity: 0.9 },
  lbl: { fontSize: 13, fontWeight: '700', color: '#333', marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e3e3e6' },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e3e6' },
  chipOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipTxt: { fontSize: 13, color: '#444', fontWeight: '600' },
  saveBtn: { marginTop: 28, backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
