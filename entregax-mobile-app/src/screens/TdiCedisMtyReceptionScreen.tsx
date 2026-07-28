/**
 * TdiCedisMtyReceptionScreen — Recibir TDX en CEDIS MTY
 * Escanea guías TDI Express (TDX) que llegaron a Monterrey y las marca
 * como Recibido MTY vía POST /api/tdi-express/receive-cedis-mty.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#2E7D32';
const BLACK = '#1A1A1A';

interface Received {
  tracking: string;
  client: string;
  box: string;
}

export default function TdiCedisMtyReceptionScreen({ route, navigation }: any) {
  const { token } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err' | 'warn'; msg: string } | null>(null);
  const [received, setReceived] = useState<Received[]>([]);
  const inputRef = useRef<TextInput>(null);

  const submit = useCallback(async (raw: string) => {
    const tracking = String(raw || '').trim();
    if (!tracking || loading) return;
    setLoading(true);
    Keyboard.dismiss();
    try {
      const res = await fetch(`${API_URL}/api/tdi-express/receive-cedis-mty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tracking }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Evitar duplicados en la lista de sesión
        if (!received.find((r) => r.tracking === data.tracking)) {
          setReceived((prev) => [
            { tracking: data.tracking, client: data.client_name || '—', box: data.client_box_id || '—' },
            ...prev,
          ]);
        }
        const extra = data.is_master && data.children_count > 0 ? ` (+${data.children_count} cajas)` : '';
        setFeedback({ type: 'ok', msg: `✅ ${data.tracking} — Recibido MTY${extra}` });
      } else {
        const warn = !!data.already_received;
        setFeedback({ type: warn ? 'warn' : 'err', msg: `${warn ? '⚠️' : '❌'} ${data.error || 'Error al recibir'}` });
      }
    } catch (e: any) {
      setFeedback({ type: 'err', msg: `❌ ${e?.message || 'Error de red'}` });
    } finally {
      setCode('');
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [token, loading, received]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.headerLabel}>TDI · ENTREGAX</Text>
          <Text style={styles.headerTitle}>Recibir en CEDIS MTY</Text>
          <Text style={styles.headerSubtitle}>Escanea guías TDX que llegaron a Monterrey</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.counterCard}>
          <Text style={styles.counterNum}>{received.length}</Text>
          <Text style={styles.counterLabel}>guías recibidas en esta sesión</Text>
        </View>

        <View style={styles.scanCard}>
          <Text style={styles.scanTitle}>Escanea o escribe la guía TDX</Text>
          <View style={styles.inputRow}>
            <Ionicons name="qr-code-outline" size={22} color={ORANGE} style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Ej: TDX-5894471122-001"
              placeholderTextColor="#999"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => submit(code)}
              editable={!loading}
            />
          </View>
          <TouchableOpacity
            style={[styles.btn, (loading || !code.trim()) && { opacity: 0.6 }]}
            onPress={() => submit(code)}
            disabled={loading || !code.trim()}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="download-outline" size={20} color="#fff" /><Text style={styles.btnText}>Recibir MTY</Text></>
            )}
          </TouchableOpacity>
        </View>

        {feedback && (
          <View style={[
            styles.feedback,
            feedback.type === 'ok' ? styles.fbOk : feedback.type === 'warn' ? styles.fbWarn : styles.fbErr,
          ]}>
            <Text style={[styles.fbText, { color: feedback.type === 'ok' ? GREEN : feedback.type === 'warn' ? '#B06B0C' : '#C0392B' }]}>
              {feedback.msg}
            </Text>
          </View>
        )}

        {received.map((r, i) => (
          <View key={`${r.tracking}-${i}`} style={styles.item}>
            <Ionicons name="checkmark-circle" size={20} color={GREEN} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTracking}>{r.tracking}</Text>
              <Text style={styles.itemClient}>{r.client} · {r.box}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: BLACK,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  headerLabel: { fontSize: 10, color: ORANGE, fontWeight: '800', letterSpacing: 1.5 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff', marginTop: 2 },
  headerSubtitle: { fontSize: 12, color: '#fff', opacity: 0.7, marginTop: 3 },
  body: { padding: 14, gap: 14, paddingBottom: 40 },
  counterCard: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  counterNum: { fontSize: 40, fontWeight: '900', color: GREEN },
  counterLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  scanCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  scanTitle: { fontSize: 14, fontWeight: '700', color: ORANGE, marginBottom: 10 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0',
    borderRadius: 10, paddingHorizontal: 12, height: 50, marginBottom: 12,
  },
  input: { flex: 1, fontSize: 16, color: BLACK },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: ORANGE, borderRadius: 10, height: 50,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  feedback: { borderRadius: 10, padding: 14, borderWidth: 1 },
  fbOk: { backgroundColor: '#E4F0E7', borderColor: '#A5D6A7' },
  fbWarn: { backgroundColor: '#F6EAD3', borderColor: '#FFD8A8' },
  fbErr: { backgroundColor: '#F7E3E0', borderColor: '#F5B7B1' },
  fbText: { fontSize: 14, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12 },
  itemTracking: { fontSize: 14, fontWeight: '700', color: BLACK, fontFamily: 'monospace' },
  itemClient: { fontSize: 12, color: '#666', marginTop: 2 },
});
