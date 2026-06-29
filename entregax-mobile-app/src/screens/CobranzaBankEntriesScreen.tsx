/**
 * CobranzaBankEntriesScreen
 * Movimientos del estado de cuenta de una empresa (solo lectura).
 * GET /api/admin/finance/bank-entries?empresa_id=...
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BG = '#F4F6F8';
const GREEN = '#2E7D32';
const RED = '#C62828';

const money = (n: number) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface BankEntry {
  id: number; fecha: string; concepto: string; referencia: string;
  cargo: number | null; abono: number | null; saldo: number | null;
  banco: string | null; seq?: number;
}

// Las fechas vienen como ISO ('2026-06-26T06:00:00.000Z') o ya como 'dd-mm-yyyy'.
const fmtDate = (v: string) => {
  if (!v) return '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) return v;
  const iso = v.substring(0, 10);
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}-${m}-${y}` : v;
};

export default function CobranzaBankEntriesScreen({ navigation, route }: any) {
  const { token, empresaId, empresaAlias, banco } = route.params;
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/finance/bank-entries?empresa_id=${empresaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (e) {
      console.error('Error movimientos banco:', e);
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, empresaId]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const totalAbonos = entries.reduce((s, e) => s + (Number(e.abono) || 0), 0);
  const totalCargos = entries.reduce((s, e) => s + (Number(e.cargo) || 0), 0);
  // El saldo final es el del movimiento más reciente (las entradas vienen ordenadas DESC).
  const saldoFinal = entries.length > 0 ? (Number(entries[0].saldo) || 0) : 0;
  const nAbonos = entries.filter(e => Number(e.abono) > 0).length;
  const nCargos = entries.filter(e => Number(e.cargo) > 0).length;

  const renderItem = ({ item }: { item: BankEntry }) => {
    const esAbono = Number(item.abono) > 0;
    return (
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.concepto} numberOfLines={2}>{item.concepto || item.referencia}</Text>
          <Text style={styles.fecha}>{fmtDate(item.fecha)}{item.banco ? ` · ${item.banco}` : ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.monto, { color: esAbono ? GREEN : RED }]}>
            {esAbono ? `+${money(item.abono || 0)}` : `-${money(item.cargo || 0)}`}
          </Text>
          {item.saldo != null && <Text style={styles.saldo}>{money(item.saldo)}</Text>}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{empresaAlias || 'Estado de cuenta'}</Text>
          <Text style={styles.headerSub}>Movimientos{banco ? ` · ${banco}` : ''}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
          ListHeaderComponent={(
            <View style={styles.totalsRow}>
              <View style={[styles.totalCard, { backgroundColor: '#E8F5E9' }]}>
                <Text style={styles.totalLbl}>Abonos</Text>
                <Text style={[styles.totalVal, { color: GREEN }]}>{money(totalAbonos)}</Text>
                <Text style={styles.totalSub}>{nAbonos} mov.</Text>
              </View>
              <View style={[styles.totalCard, { backgroundColor: '#FDECEA' }]}>
                <Text style={styles.totalLbl}>Cargos</Text>
                <Text style={[styles.totalVal, { color: RED }]}>{money(totalCargos)}</Text>
                <Text style={styles.totalSub}>{nCargos} mov.</Text>
              </View>
              <View style={[styles.totalCard, { backgroundColor: '#E8EEFB' }]}>
                <Text style={styles.totalLbl}>Saldo final</Text>
                <Text style={[styles.totalVal, { color: ORANGE }]}>{money(saldoFinal)}</Text>
                <Text style={styles.totalSub}>{entries.length} totales</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="card-outline" size={48} color="#bbb" />
              <Text style={styles.emptyTxt}>Sin movimientos guardados para esta empresa</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: ORANGE, paddingHorizontal: 8, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  totalsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  totalCard: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center' },
  totalLbl: { fontSize: 11, color: '#666', fontWeight: '600' },
  totalVal: { fontSize: 14, fontWeight: '900', marginTop: 3 },
  totalSub: { fontSize: 10, color: '#999', marginTop: 2 },
  row: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  concepto: { fontSize: 12, color: '#333', fontWeight: '600' },
  fecha: { fontSize: 11, color: '#999', marginTop: 3 },
  monto: { fontSize: 14, fontWeight: '800' },
  saldo: { fontSize: 11, color: '#888', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { color: '#888', fontSize: 14, textAlign: 'center', paddingHorizontal: 30 },
});
