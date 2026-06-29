/**
 * CobranzaPaymentDetailScreen
 * Estado de cuenta del pago + comprobante (foto) + confirmar pago.
 *  - GET /api/admin/finance/payment-details/:referencia  (guías / estado de cuenta)
 *  - GET /api/admin/vouchers/order/:orderId              (comprobantes firmados)
 *  - POST /api/admin/finance/confirm-payment             (confirmar)
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar,
  Image, Alert, Linking, Dimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BG = '#F4F6F8';
const GREEN = '#2E7D32';
const { width } = Dimensions.get('window');

const money = (n: number) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Guia {
  id: number; tracking_interno: string; descripcion: string;
  costo: number; saldo_pendiente: number; monto_pagado: number; pagado: boolean; status: string;
}
interface Voucher {
  id: number; file_url: string; file_type: string;
  declared_amount: number | null; detected_amount: number | null; status: string;
}
interface BankEntry {
  id: number; fecha: string; concepto: string; referencia: string;
  abono: number | null; cargo: number | null; saldo: number | null;
  banco: string | null; empresa: string | null;
  match: boolean; match_cliente: boolean; match_monto: boolean;
}

export default function CobranzaPaymentDetailScreen({ navigation, route }: any) {
  const { token, referencia, orderId, payment } = route.params;
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [bankEntries, setBankEntries] = useState<BankEntry[]>([]);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dRes = await fetch(`${API_URL}/api/admin/finance/payment-details/${encodeURIComponent(referencia)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dData = await dRes.json();
      if (dData.success) { setDetail(dData); setGuias(dData.guias || []); }

      if (orderId) {
        const vRes = await fetch(`${API_URL}/api/admin/vouchers/order/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const vData = await vRes.json();
        setVouchers(vData.vouchers || []);
      }

      // Movimientos del estado de cuenta bancario cercanos a la fecha del pago.
      try {
        const bRes = await fetch(`${API_URL}/api/admin/finance/payment-bank-matches/${encodeURIComponent(referencia)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const bData = await bRes.json();
        if (bData.success) setBankEntries(bData.entries || []);
      } catch { /* el estado de cuenta es opcional */ }
    } catch (e) {
      console.error('Error detalle cobranza:', e);
    } finally {
      setLoading(false);
    }
  }, [token, referencia, orderId]);

  useEffect(() => { load(); }, [load]);

  const doConfirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/finance/confirm-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referencia,
          metodo_confirmacion: payment?.payment_method || 'efectivo',
          moneda_recibida: 'MXN',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert('✅ Pago confirmado', `${referencia} se marcó como pagado.`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', data.error || 'No se pudo confirmar el pago.');
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo confirmar el pago.');
    } finally {
      setConfirming(false);
    }
  };

  const confirmPrompt = () => {
    Alert.alert(
      'Confirmar pago',
      `¿Marcar ${referencia} (${money(payment?.monto || detail?.payment?.monto || 0)}) como pagado?`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', style: 'default', onPress: doConfirm }],
    );
  };

  const monto = payment?.monto ?? detail?.payment?.monto ?? 0;
  const cliente = detail?.cliente?.nombre || payment?.cliente || 'Cliente';
  const isPaid = detail?.payment?.status === 'paid' || detail?.payment?.status === 'completed';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Detalle de pago</Text>
        <View style={{ width: 34 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 120 }}>
          {/* Resumen */}
          <View style={styles.summaryCard}>
            <Text style={styles.ref}>{referencia}</Text>
            <Text style={styles.cliente}>{payment?.cliente_numero ? `${payment.cliente_numero} · ` : ''}{cliente}</Text>
            <Text style={styles.monto}>{money(monto)}</Text>
            {isPaid && (
              <View style={styles.paidBadge}><Ionicons name="checkmark-circle" size={14} color={GREEN} /><Text style={styles.paidTxt}>Pagado</Text></View>
            )}
          </View>

          {/* Comprobante(s) */}
          <Text style={styles.section}>Comprobante</Text>
          {vouchers.length === 0 ? (
            <View style={styles.noVoucher}>
              <Ionicons name="document-outline" size={22} color="#aaa" />
              <Text style={styles.noVoucherTxt}>Sin comprobante adjunto</Text>
            </View>
          ) : (
            vouchers.map(v => (
              <View key={v.id} style={styles.voucherCard}>
                {String(v.file_type).toLowerCase() === 'pdf' ? (
                  <TouchableOpacity style={styles.pdfBox} onPress={() => v.file_url && Linking.openURL(v.file_url)}>
                    <Ionicons name="document-text-outline" size={28} color={ORANGE} />
                    <Text style={styles.pdfTxt}>Abrir PDF del comprobante</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomUrl(v.file_url)}>
                    <Image source={{ uri: v.file_url }} style={styles.voucherImg} resizeMode="cover" />
                    <View style={styles.zoomHint}><Ionicons name="expand-outline" size={14} color="#fff" /></View>
                  </TouchableOpacity>
                )}
                <View style={styles.voucherMeta}>
                  <Text style={styles.voucherAmount}>{money(v.declared_amount ?? v.detected_amount ?? 0)}</Text>
                  <Text style={styles.voucherStatus}>{v.status}</Text>
                </View>
              </View>
            ))
          )}

          {/* Estado de cuenta (movimientos bancarios de la fecha del pago) */}
          <Text style={styles.section}>Estado de cuenta</Text>
          {bankEntries.length === 0 ? (
            <View style={styles.noVoucher}>
              <Ionicons name="card-outline" size={22} color="#aaa" />
              <Text style={styles.noVoucherTxt}>Sin movimientos en la fecha del pago</Text>
            </View>
          ) : (
            bankEntries.map(b => (
              <View key={b.id} style={[styles.bankRow, b.match && styles.bankRowMatch]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.bankTopRow}>
                    <Text style={styles.bankDate}>{b.fecha}</Text>
                    {b.match && (
                      <View style={styles.matchChip}>
                        <Ionicons name="checkmark-circle" size={11} color={GREEN} />
                        <Text style={styles.matchTxt}>
                          {b.match_cliente ? 'Cliente' : b.match_monto ? 'Monto' : 'Coincide'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.bankRef} numberOfLines={1}>{b.referencia || b.concepto}</Text>
                  {!!(b.banco || b.empresa) && (
                    <Text style={styles.bankBank} numberOfLines={1}>
                      {[b.empresa, b.banco].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
                <Text style={[styles.bankAbono, b.match && { color: GREEN }]}>{money(b.abono || 0)}</Text>
              </View>
            ))
          )}

          {/* Guías del pago */}
          {guias.length > 0 && (
            <>
              <Text style={styles.section}>Guías · {guias.length}</Text>
              {guias.map(g => (
                <View key={g.id} style={styles.guiaRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.guiaTrack} numberOfLines={1}>{g.tracking_interno}</Text>
                    <Text style={styles.guiaDesc} numberOfLines={1}>{g.descripcion}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.guiaCosto}>{money(g.costo)}</Text>
                    <Text style={[styles.guiaEstado, { color: g.pagado ? GREEN : '#B26A00' }]}>{g.pagado ? 'Pagada' : 'Pendiente'}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Botón confirmar */}
      {!loading && !isPaid && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.confirmBtn, confirming && { opacity: 0.6 }]} onPress={confirmPrompt} disabled={confirming}>
            {confirming ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.confirmTxt}>Confirmar pago · {money(monto)}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Zoom de comprobante */}
      <Modal visible={!!zoomUrl} transparent animationType="fade" onRequestClose={() => setZoomUrl(null)}>
        <TouchableOpacity style={styles.zoomOverlay} activeOpacity={1} onPress={() => setZoomUrl(null)}>
          {zoomUrl && <Image source={{ uri: zoomUrl }} style={styles.zoomImg} resizeMode="contain" />}
          <View style={styles.zoomClose}><Ionicons name="close" size={26} color="#fff" /></View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: ORANGE, paddingHorizontal: 8, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  back: { padding: 4 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 8 },
  ref: { fontSize: 15, fontWeight: '800', color: '#222', fontFamily: 'monospace' },
  cliente: { fontSize: 14, color: '#555', marginTop: 4 },
  monto: { fontSize: 30, fontWeight: '900', color: ORANGE, marginTop: 8 },
  paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  paidTxt: { color: GREEN, fontWeight: '700', fontSize: 12 },
  section: { fontSize: 12, fontWeight: '800', color: '#666', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 18, marginBottom: 8 },
  noVoucher: { backgroundColor: '#fff', borderRadius: 12, padding: 18, alignItems: 'center', gap: 6 },
  noVoucherTxt: { color: '#999', fontSize: 13 },
  voucherCard: { backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 10 },
  voucherImg: { width: '100%', height: width * 0.9, borderRadius: 8, backgroundColor: '#eee' },
  zoomHint: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, padding: 6 },
  pdfBox: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 28, backgroundColor: '#FFF7ED', borderRadius: 8 },
  pdfTxt: { color: ORANGE, fontWeight: '700' },
  voucherMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: 4 },
  voucherAmount: { fontSize: 15, fontWeight: '800', color: '#222' },
  voucherStatus: { fontSize: 12, color: '#888', fontWeight: '600', textTransform: 'capitalize' },
  bankRow: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'transparent' },
  bankRowMatch: { borderColor: GREEN, backgroundColor: '#F1F8F2' },
  bankTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bankDate: { fontSize: 12, fontWeight: '700', color: '#555' },
  matchChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#E8F5E9', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  matchTxt: { fontSize: 10, fontWeight: '800', color: GREEN },
  bankRef: { fontSize: 12, color: '#333', marginTop: 3, fontFamily: 'monospace' },
  bankBank: { fontSize: 11, color: '#999', marginTop: 2 },
  bankAbono: { fontSize: 14, fontWeight: '800', color: '#222' },
  guiaRow: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  guiaTrack: { fontSize: 13, fontWeight: '700', color: '#222', fontFamily: 'monospace' },
  guiaDesc: { fontSize: 12, color: '#777', marginTop: 2 },
  guiaCosto: { fontSize: 14, fontWeight: '800', color: '#222' },
  guiaEstado: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 24, backgroundColor: 'rgba(244,246,248,0.96)', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  confirmBtn: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  zoomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  zoomImg: { width: '100%', height: '80%' },
  zoomClose: { position: 'absolute', top: 50, right: 20 },
});
