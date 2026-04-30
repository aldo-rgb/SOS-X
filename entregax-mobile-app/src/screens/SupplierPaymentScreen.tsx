import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert,
  StyleSheet, ActivityIndicator, RefreshControl, Linking, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';

const REGIMENES = [
  { code: '601', name: 'General Personas Morales' },
  { code: '603', name: 'Personas Morales sin fines de lucro' },
  { code: '605', name: 'Sueldos y Salarios' },
  { code: '606', name: 'Arrendamiento' },
  { code: '612', name: 'Personas Físicas con Actividades Empresariales' },
  { code: '621', name: 'Incorporación Fiscal' },
  { code: '626', name: 'Régimen Simplificado de Confianza' },
];

const USOS_CFDI = [
  { code: 'G01', name: 'Adquisición de mercancías' },
  { code: 'G03', name: 'Gastos en general' },
  { code: 'I01', name: 'Construcciones' },
  { code: 'I04', name: 'Equipo de cómputo' },
  { code: 'P01', name: 'Por definir' },
];

const DIVISAS = ['USD', 'RMB'];

interface PaymentRequest {
  id: number;
  cf_rfc: string;
  cf_razon_social: string;
  op_monto: number;
  op_divisa_destino: string;
  estatus_global: string;
  estatus_factura: string;
  estatus_proveedor: string;
  factura_url?: string;
  comprobante_proveedor_url?: string;
  comprobante_cliente_url?: string;
  created_at: string;
}

export default function SupplierPaymentScreen({ route, navigation }: any) {
  const { token } = route.params || {};
  const { t } = useTranslation();

  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [rfc, setRfc] = useState('');
  const [razon, setRazon] = useState('');
  const [regimen, setRegimen] = useState('612');
  const [cp, setCp] = useState('');
  const [uso, setUso] = useState('G03');
  const [email, setEmail] = useState('');
  const [monto, setMonto] = useState('');
  const [divisa, setDivisa] = useState('USD');
  const [conceptos, setConceptos] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/entangled/payment-requests/me`, { headers: authHeaders });
      const data = await res.json();
      setRequests(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const pickProof = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Habilita el acceso a la galería');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || 'comprobante.jpg',
      } as any);
      const res = await fetch(`${API_URL}/api/uploads/evidence`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (data?.url) {
        setProofUrl(data.url);
        Alert.alert('✓', 'Comprobante subido');
      } else {
        Alert.alert('Error', data?.error || 'No se pudo subir');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error de red');
    }
    setUploading(false);
  };

  const submit = async () => {
    if (!monto) {
      Alert.alert('Faltan datos', 'Captura el monto');
      return;
    }
    const requiereFactura = !!(rfc || razon);
    if (requiereFactura && (!rfc || !razon || !cp || !email)) {
      Alert.alert('Faltan datos', 'Si quieres factura completa todos los datos fiscales');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        requiere_factura: requiereFactura,
        operacion: {
          montos: parseFloat(monto),
          divisa_destino: divisa,
          conceptos: requiereFactura
            ? conceptos.split(',').map(s => s.trim()).filter(Boolean)
            : [],
        },
      };
      if (requiereFactura) {
        payload.cliente_final = {
          rfc, razon_social: razon, regimen_fiscal: regimen,
          cp, uso_cfdi: uso, email,
        };
      }
      const res = await fetch(`${API_URL}/api/entangled/payment-requests`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('✓', t('entangled.messages.created'));
        setRfc(''); setRazon(''); setCp(''); setEmail('');
        setMonto(''); setConceptos(''); setProofUrl('');
        loadRequests();
      } else {
        Alert.alert('Error', data?.error || 'No se pudo crear la solicitud');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error de red');
    }
    setSubmitting(false);
  };

  const statusColor = (s: string) => {
    if (['completado', 'emitida', 'enviado', 'pagado'].includes(s)) return '#16a34a';
    if (['en_proceso', 'pendiente'].includes(s)) return '#f59e0b';
    if (['rechazado', 'error_envio', 'error'].includes(s)) return '#dc2626';
    return '#64748b';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRequests(); }} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.headerTitle}>💰 {t('entangled.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('entangled.subtitle')}</Text>
        </View>
      </View>

      {/* Form */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📄 {t('entangled.newRequest')}</Text>

        <Text style={styles.label}>{t('entangled.fields.rfc')}</Text>
        <TextInput style={styles.input} value={rfc} onChangeText={t => setRfc(t.toUpperCase())} autoCapitalize="characters" />

        <Text style={styles.label}>{t('entangled.fields.razonSocial')}</Text>
        <TextInput style={styles.input} value={razon} onChangeText={setRazon} />

        <Text style={styles.label}>{t('entangled.fields.regimenFiscal')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {REGIMENES.map(r => (
            <TouchableOpacity key={r.code} style={[styles.chip, regimen === r.code && styles.chipActive]} onPress={() => setRegimen(r.code)}>
              <Text style={[styles.chipText, regimen === r.code && styles.chipTextActive]}>{r.code}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>{t('entangled.fields.cp')}</Text>
        <TextInput style={styles.input} value={cp} onChangeText={setCp} keyboardType="numeric" maxLength={5} />

        <Text style={styles.label}>{t('entangled.fields.usoCfdi')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {USOS_CFDI.map(u => (
            <TouchableOpacity key={u.code} style={[styles.chip, uso === u.code && styles.chipActive]} onPress={() => setUso(u.code)}>
              <Text style={[styles.chipText, uso === u.code && styles.chipTextActive]}>{u.code}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>{t('entangled.fields.email')}</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>{t('entangled.fields.amount')}</Text>
        <TextInput style={styles.input} value={monto} onChangeText={setMonto} keyboardType="decimal-pad" />

        <Text style={styles.label}>{t('entangled.fields.currency')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {DIVISAS.map(d => (
            <TouchableOpacity key={d} style={[styles.chip, divisa === d && styles.chipActive]} onPress={() => setDivisa(d)}>
              <Text style={[styles.chipText, divisa === d && styles.chipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{t('entangled.fields.concepts')} (separados por coma)</Text>
        <TextInput style={styles.input} value={conceptos} onChangeText={setConceptos} />

        <TouchableOpacity style={styles.uploadBtn} onPress={pickProof} disabled={uploading}>
          {uploading ? <ActivityIndicator color={ORANGE} /> : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={ORANGE} />
              <Text style={styles.uploadText}>
                {proofUrl ? '✓ Comprobante adjunto' : t('entangled.fields.uploadProof')}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="white" /> : (
            <Text style={styles.submitText}>{t('entangled.actions.submit')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Requests List */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📋 {t('entangled.myRequests')}</Text>

        {loading ? (
          <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />
        ) : requests.length === 0 ? (
          <Text style={styles.empty}>{t('entangled.messages.empty')}</Text>
        ) : requests.map(r => (
          <View key={r.id} style={styles.requestItem}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.requestTitle}>#{r.id} · {r.cf_rfc}</Text>
              <Text style={[styles.requestStatus, { color: statusColor(r.estatus_global) }]}>
                {r.estatus_global || '-'}
              </Text>
            </View>
            <Text style={styles.requestSub}>{r.cf_razon_social}</Text>
            <Text style={styles.requestAmount}>
              {Number(r.op_monto).toLocaleString()} {r.op_divisa_destino}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusPill, { borderColor: statusColor(r.estatus_factura) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(r.estatus_factura) }]}>
                  Factura: {r.estatus_factura || '-'}
                </Text>
              </View>
              <View style={[styles.statusPill, { borderColor: statusColor(r.estatus_proveedor) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(r.estatus_proveedor) }]}>
                  Proveedor: {r.estatus_proveedor || '-'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {r.factura_url && (
                <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(r.factura_url!)}>
                  <Ionicons name="receipt-outline" size={14} color="#0369a1" />
                  <Text style={styles.linkText}>{t('entangled.actions.viewInvoice')}</Text>
                </TouchableOpacity>
              )}
              {r.comprobante_proveedor_url && (
                <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(r.comprobante_proveedor_url!)}>
                  <Ionicons name="checkmark-done-outline" size={14} color="#16a34a" />
                  <Text style={[styles.linkText, { color: '#16a34a' }]}>{t('entangled.actions.viewProof')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: ORANGE, padding: 16, paddingTop: Platform.OS === 'ios' ? 50 : 24 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: 'white', fontSize: 12, opacity: 0.9 },
  card: { backgroundColor: 'white', margin: 12, padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#0f172a' },
  label: { fontSize: 12, color: '#64748b', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#f8fafc' },
  chip: { borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, marginRight: 6, backgroundColor: 'white' },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontSize: 12, color: '#475569' },
  chipTextActive: { color: 'white', fontWeight: 'bold' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: ORANGE, padding: 12, borderRadius: 8, marginTop: 12, gap: 6 },
  uploadText: { color: ORANGE, fontWeight: '600' },
  submitBtn: { backgroundColor: ORANGE, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  submitText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  empty: { textAlign: 'center', color: '#94a3b8', padding: 16 },
  requestItem: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 12 },
  requestTitle: { fontWeight: 'bold', color: '#0f172a' },
  requestStatus: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
  requestSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  requestAmount: { fontSize: 16, fontWeight: 'bold', color: ORANGE, marginTop: 4 },
  statusRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  statusPill: { borderWidth: 1, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '600' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#f1f5f9', borderRadius: 6 },
  linkText: { fontSize: 12, color: '#0369a1', fontWeight: '600' },
});
