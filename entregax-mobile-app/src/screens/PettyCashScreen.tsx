/**
 * PettyCashScreen - Caja Chica del Chofer
 *
 * Funciones:
 *  - Mostrar saldo disponible y "pendiente por comprobar".
 *  - Aceptar vales (anticipos) emitidos al chofer.
 *  - Registrar gastos (comprobación) con foto del ticket, categoría, monto, GPS y odómetro opcional.
 *  - Historial reciente de movimientos.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { API_URL, api } from '../services/api';

type Advance = {
  id: number;
  amount_mxn: string | number;
  concept: string | null;
  issued_at: string;
  status: string;
  issued_by_name?: string | null;
  branch_name?: string | null;
};

type Movement = {
  id: number;
  movement_type: string;
  category: string | null;
  amount_mxn: string | number;
  status: string;
  concept: string | null;
  created_at: string;
  evidence_url: string | null;
};

type Wallet = {
  id: number;
  balance_mxn: string | number;
  pending_to_verify_mxn: string | number;
  branch_name?: string | null;
};

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'caseta', label: 'Casetas', icon: '🛣️' },
  { key: 'combustible', label: 'Combustible', icon: '⛽' },
  { key: 'mecanica', label: 'Mecánica', icon: '🛠️' },
  { key: 'alimentos', label: 'Alimentos', icon: '🍔' },
  { key: 'hospedaje', label: 'Hospedaje', icon: '🏨' },
  { key: 'estacionamiento', label: 'Estacionamiento', icon: '🅿️' },
  { key: 'papeleria', label: 'Papelería', icon: '📎' },
  { key: 'mensajeria', label: 'Mensajería', icon: '📦' },
  { key: 'lavado', label: 'Lavado', icon: '🚿' },
  { key: 'refacciones', label: 'Refacciones', icon: '🔩' },
  { key: 'hidratacion', label: 'Hielo/Agua', icon: '💧' },
  { key: 'peaje_internacional', label: 'Peaje internacional', icon: '🛂' },
  { key: 'otros', label: 'Otros', icon: '📝' },
];

const fmtMoney = (n: any) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string) => {
  try {
    const d = new Date(s);
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return s;
  }
};

export default function PettyCashScreen({ navigation, route }: any) {
  const token = route?.params?.token;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  // Modal: Registrar gasto
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expCategory, setExpCategory] = useState<string>('combustible');
  const [expAmount, setExpAmount] = useState('');
  const [expConcept, setExpConcept] = useState('');
  const [expOdometer, setExpOdometer] = useState('');
  const [expPhoto, setExpPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [expSaving, setExpSaving] = useState(false);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const loadData = useCallback(async () => {
    try {
      const r = await api.get('/api/petty-cash/my-wallet', { headers: authHeaders });
      setWallet(r.data?.wallet || null);
      setAdvances(r.data?.pending_advances || []);
      setMovements(r.data?.movements || []);
    } catch (err: any) {
      console.error('PettyCash loadData error', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const acceptAdvance = async (adv: Advance) => {
    Alert.alert(
      'Aceptar vale',
      `¿Confirmas la recepción de ${fmtMoney(adv.amount_mxn)}? Al aceptar firmas digitalmente este anticipo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar',
          onPress: async () => {
            try {
              // GPS opcional
              let lat: number | null = null;
              let lng: number | null = null;
              try {
                const perm = await Location.requestForegroundPermissionsAsync();
                if (perm.status === 'granted') {
                  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  lat = pos.coords.latitude;
                  lng = pos.coords.longitude;
                }
              } catch {
                /* GPS no obligatorio */
              }
              await api.post(`/api/petty-cash/advances/${adv.id}/accept`, {
                lat,
                lng,
                device_info: `${Platform.OS} ${Platform.Version}`,
              }, { headers: authHeaders });
              Alert.alert('✅ Aceptado', 'El vale fue aceptado y firmado.');
              loadData();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || 'No se pudo aceptar el vale');
            }
          },
        },
      ]
    );
  };

  const pickPhoto = async (fromCamera: boolean) => {
    try {
      let perm;
      if (fromCamera) {
        perm = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso para capturar el ticket.');
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      setExpPhoto({
        uri: a.uri,
        name: a.fileName || `ticket-${Date.now()}.jpg`,
        type: a.mimeType || 'image/jpeg',
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudo obtener la foto');
    }
  };

  const openExpenseModal = () => {
    setExpCategory('combustible');
    setExpAmount('');
    setExpConcept('');
    setExpOdometer('');
    setExpPhoto(null);
    setExpenseOpen(true);
  };

  const submitExpense = async () => {
    const amount = Number(expAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Captura un monto mayor a $0');
      return;
    }
    if (!expPhoto) {
      Alert.alert('Foto requerida', 'Toma una foto del ticket o factura');
      return;
    }
    setExpSaving(true);
    try {
      // GPS opcional
      let lat: number | null = null;
      let lng: number | null = null;
      let acc: number | null = null;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          acc = pos.coords.accuracy ?? null;
        }
      } catch {
        /* GPS no obligatorio */
      }

      const form = new FormData();
      form.append('category', expCategory);
      form.append('amount_mxn', String(amount));
      if (expConcept) form.append('concept', expConcept);
      if (lat != null) form.append('gps_lat', String(lat));
      if (lng != null) form.append('gps_lng', String(lng));
      if (acc != null) form.append('gps_accuracy_m', String(acc));
      if (expOdometer) form.append('odometer_km', expOdometer);
      // @ts-ignore: RN FormData file
      form.append('evidence', {
        uri: expPhoto.uri,
        name: expPhoto.name,
        type: expPhoto.type,
      });

      const res = await fetch(`${API_URL}/api/petty-cash/expenses`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form as any,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo registrar el gasto');
      }
      Alert.alert('✅ Gasto registrado', 'Tu gasto quedó pendiente de aprobación.');
      setExpenseOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo registrar el gasto');
    } finally {
      setExpSaving(false);
    }
  };

  const statusChip = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      pending: { bg: '#FFF3CD', color: '#856404', label: 'Pendiente' },
      approved: { bg: '#D4EDDA', color: '#155724', label: 'Aprobado' },
      rejected: { bg: '#F8D7DA', color: '#721C24', label: 'Rechazado' },
    };
    const m = map[status] || { bg: '#eee', color: '#444', label: status };
    return (
      <View style={[styles.chip, { backgroundColor: m.bg }]}>
        <Text style={[styles.chipText, { color: m.color }]}>{m.label}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#F05A28" />
          <Text style={styles.loadingText}>Cargando caja chica...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const balance = Number(wallet?.balance_mxn || 0);
  const pendingVerify = Number(wallet?.pending_to_verify_mxn || 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Caja Chica</Text>
          {wallet?.branch_name ? (
            <Text style={styles.headerSubtitle}>{wallet.branch_name}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F05A28']} />}
      >
        {/* Saldo principal */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Saldo disponible</Text>
          <Text style={styles.balanceAmount}>{fmtMoney(balance)}</Text>
          <View style={styles.balanceFooter}>
            <MaterialIcons name="hourglass-empty" size={16} color="rgba(255,255,255,0.85)" />
            <Text style={styles.balanceFooterText}>
              Por comprobar: {fmtMoney(pendingVerify)}
            </Text>
          </View>
        </View>

        {/* Botón principal: Registrar gasto */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#F05A28' }]}
          onPress={openExpenseModal}
          activeOpacity={0.85}
        >
          <MaterialIcons name="receipt-long" size={22} color="#fff" />
          <Text style={styles.actionBtnText}>Registrar gasto / Comprobar</Text>
        </TouchableOpacity>

        {/* Vales pendientes de aceptar */}
        {advances.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📥 Vales por aceptar</Text>
            {advances.map((a) => (
              <View key={a.id} style={styles.advanceCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.advanceAmount}>{fmtMoney(a.amount_mxn)}</Text>
                  {a.concept ? <Text style={styles.advanceConcept}>{a.concept}</Text> : null}
                  <Text style={styles.advanceMeta}>
                    {a.issued_by_name ? `Emitido por ${a.issued_by_name}` : 'Anticipo'} · {fmtDate(a.issued_at)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptAdvance(a)}>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.acceptBtnText}>Aceptar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Historial */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🕒 Movimientos recientes</Text>
          {movements.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialIcons name="inbox" size={32} color="#bbb" />
              <Text style={styles.emptyText}>Sin movimientos aún</Text>
            </View>
          ) : (
            movements.map((m) => {
              const cat = CATEGORIES.find((c) => c.key === m.category);
              const isExpense = m.movement_type === 'expense';
              return (
                <View key={m.id} style={styles.movCard}>
                  <View style={styles.movIcon}>
                    <Text style={{ fontSize: 22 }}>
                      {isExpense ? cat?.icon || '🧾' : m.movement_type === 'fund' || m.movement_type === 'advance' ? '💵' : '🔁'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.movTitle} numberOfLines={1}>
                      {isExpense ? cat?.label || m.category || 'Gasto' : m.movement_type === 'advance' ? 'Anticipo recibido' : m.movement_type === 'fund' ? 'Fondeo' : 'Movimiento'}
                    </Text>
                    {m.concept ? (
                      <Text style={styles.movConcept} numberOfLines={1}>{m.concept}</Text>
                    ) : null}
                    <Text style={styles.movDate}>{fmtDate(m.created_at)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.movAmount, { color: isExpense ? '#E53935' : '#00B894' }]}>
                      {isExpense ? '-' : '+'}{fmtMoney(m.amount_mxn)}
                    </Text>
                    {statusChip(m.status)}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Modal: Registrar gasto */}
      <Modal visible={expenseOpen} animationType="slide" onRequestClose={() => setExpenseOpen(false)}>
        <SafeAreaView style={styles.container}>
          <View style={[styles.header, { paddingTop: insets.top > 0 ? insets.top : 12 }]}>
            <TouchableOpacity onPress={() => setExpenseOpen(false)} disabled={expSaving}>
              <MaterialIcons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { marginLeft: 12 }]}>Registrar gasto</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text style={styles.label}>Categoría</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.catChip, expCategory === c.key && styles.catChipActive]}
                  onPress={() => setExpCategory(c.key)}
                >
                  <Text style={{ fontSize: 18 }}>{c.icon}</Text>
                  <Text style={[styles.catChipText, expCategory === c.key && { color: '#fff' }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Monto (MXN)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={expAmount}
              onChangeText={setExpAmount}
            />

            <Text style={styles.label}>Concepto (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Comida en ruta a CDMX"
              value={expConcept}
              onChangeText={setExpConcept}
            />

            <Text style={styles.label}>Odómetro KM (opcional)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="123456"
              value={expOdometer}
              onChangeText={setExpOdometer}
            />

            <Text style={styles.label}>Foto del ticket *</Text>
            {expPhoto ? (
              <View style={styles.photoBox}>
                <Image source={{ uri: expPhoto.uri }} style={styles.photoPreview} />
                <TouchableOpacity style={styles.photoChange} onPress={() => setExpPhoto(null)}>
                  <MaterialIcons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(true)}>
                  <MaterialIcons name="photo-camera" size={22} color="#F05A28" />
                  <Text style={styles.photoBtnText}>Tomar foto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(false)}>
                  <MaterialIcons name="photo-library" size={22} color="#F05A28" />
                  <Text style={styles.photoBtnText}>Galería</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#00B894', marginTop: 22 }, expSaving && { opacity: 0.6 }]}
              onPress={submitExpense}
              disabled={expSaving}
            >
              {expSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="cloud-upload" size={22} color="#fff" />
                  <Text style={styles.actionBtnText}>Enviar gasto</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: '#666' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  headerSubtitle: { fontSize: 12, color: '#666' },

  balanceCard: {
    backgroundColor: '#00B894',
    borderRadius: 16,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginTop: 6 },
  balanceFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  balanceFooterText: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  section: { marginTop: 22 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 10 },

  advanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  advanceAmount: { fontSize: 20, fontWeight: 'bold', color: '#222' },
  advanceConcept: { fontSize: 13, color: '#444', marginTop: 2 },
  advanceMeta: { fontSize: 11, color: '#777', marginTop: 4 },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00B894',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  acceptBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  emptyBox: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderRadius: 12 },
  emptyText: { color: '#999', marginTop: 6 },

  movCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  movIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movTitle: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  movConcept: { fontSize: 12, color: '#666', marginTop: 2 },
  movDate: { fontSize: 11, color: '#999', marginTop: 4 },
  movAmount: { fontSize: 15, fontWeight: 'bold' },

  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  chipText: { fontSize: 10, fontWeight: 'bold' },

  // Modal form
  label: { fontSize: 13, fontWeight: 'bold', color: '#444', marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  catChipActive: { backgroundColor: '#F05A28', borderColor: '#F05A28' },
  catChipText: { fontSize: 12, color: '#444' },

  photoActions: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#F05A28',
    borderStyle: 'dashed',
  },
  photoBtnText: { color: '#F05A28', fontWeight: 'bold' },
  photoBox: { position: 'relative', alignItems: 'center' },
  photoPreview: { width: '100%', height: 220, borderRadius: 12, resizeMode: 'cover' },
  photoChange: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 6,
  },
});
