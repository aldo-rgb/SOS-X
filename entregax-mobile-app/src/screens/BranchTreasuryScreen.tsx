/**
 * BranchTreasuryScreen — Caja Sucursales (igual que Panel Web)
 * -----------------------------------------------------------
 *   Lista de wallets de sucursal (petty_cash_wallets) con los 4
 *   botones que tiene el Panel Web:
 *     • Anticipo        → vale digital a un chofer
 *     • Registrar Gasto → captura un egreso con evidencia (foto)
 *     • Movimientos     → estado de cuenta de la wallet
 *     • Fondear         → ingresa fondos a la wallet (con FX si la
 *                         wallet está en USD, ej. Mostrador Hidalgo TX)
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  StatusBar, RefreshControl, Modal, TextInput, Alert,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'BranchTreasury'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';
const GREEN = '#2E7D32';
const RED = '#C62828';
const BLUE = '#1976D2';

interface Wallet {
  id: number;
  owner_type: 'branch' | 'driver';
  owner_id: number;
  branch_id: number;
  branch_name: string;
  owner_name: string;
  balance_mxn: string | number;
  pending_to_verify_mxn: string | number;
  currency: string;
  status: string;
  ops_user_name?: string | null;
  pending_expenses_count: string | number;
  total_spent_mxn: string | number;
}
interface Driver { id: number; full_name: string; phone?: string; branch_id?: number | null; }
interface Category { key: string; label: string; icon: string; }
interface Movement {
  id: number;
  movement_type: string;
  amount_mxn: string | number;
  status: string;
  concept?: string | null;
  created_at: string;
  category?: string | null;
  created_by_name?: string | null;
  driver_name?: string | null;
  currency?: string | null;
  evidence_url?: string | null;
  signed_evidence_url?: string | null;
}

const fmt = (n: number | string, c = 'MXN') =>
  `$${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;

type ModalKind = null | 'fund' | 'advance' | 'expense' | 'movements';

export default function BranchTreasuryScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const auth = { Authorization: `Bearer ${token}` };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [modal, setModal] = useState<ModalKind>(null);
  const [active, setActive] = useState<Wallet | null>(null);

  // Fondear
  const [fAmount, setFAmount] = useState('');
  const [fConcept, setFConcept] = useState('');
  const [fFxRate, setFFxRate] = useState('');
  const [fSourceMxn, setFSourceMxn] = useState('');
  const [fFxProvider, setFFxProvider] = useState('');
  const [fOrigin, setFOrigin] = useState<'caja_cc' | 'otro' | ''>('');
  const [fOriginDetail, setFOriginDetail] = useState('');

  // Anticipo
  const [aDriverId, setADriverId] = useState<number | null>(null);
  const [aAmount, setAAmount] = useState('');
  const [aPurpose, setAPurpose] = useState('');

  // Gasto
  const [gCategory, setGCategory] = useState<string>('combustible');
  const [gAmount, setGAmount] = useState('');
  const [gConcept, setGConcept] = useState('');
  const [gPhoto, setGPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);

  // Movimientos
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movLoading, setMovLoading] = useState(false);

  const [busy, setBusy] = useState(false);

  // ---------- Loaders ----------
  const loadWallets = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/wallets?owner_type=branch`, { headers: auth });
      const d = await r.json();
      setWallets(d.wallets || []);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudieron cargar las cajas de sucursal');
    }
  }, [token]);

  const loadDrivers = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/drivers`, { headers: auth });
      const d = await r.json();
      setDrivers(d.drivers || []);
    } catch { /* noop */ }
  }, [token]);

  const loadCategories = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/categories`, { headers: auth });
      const d = await r.json();
      setCategories(d.categories || []);
    } catch { /* noop */ }
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadWallets(), loadDrivers(), loadCategories()]);
      setLoading(false);
    })();
  }, [loadWallets, loadDrivers, loadCategories]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWallets();
    setRefreshing(false);
  };

  // ---------- Openers ----------
  const openFund = (w: Wallet) => {
    setActive(w);
    setFAmount(''); setFConcept(''); setFFxRate(''); setFSourceMxn(''); setFFxProvider('');
    setFOrigin(''); setFOriginDetail('');
    setModal('fund');
  };
  const openAdvance = (w: Wallet) => {
    setActive(w);
    const branchDrivers = drivers.filter(d => !d.branch_id || d.branch_id === w.branch_id);
    setADriverId(branchDrivers[0]?.id || drivers[0]?.id || null);
    setAAmount(''); setAPurpose('');
    setModal('advance');
  };
  const openExpense = (w: Wallet) => {
    setActive(w);
    setGCategory('combustible');
    setGAmount(''); setGConcept(''); setGPhoto(null);
    setModal('expense');
  };
  const openMovements = async (w: Wallet) => {
    setActive(w);
    setModal('movements');
    setMovLoading(true);
    setMovements([]);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/wallets/${w.id}`, { headers: auth });
      const d = await r.json();
      setMovements(d.movements || []);
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los movimientos');
    } finally {
      setMovLoading(false);
    }
  };

  // ---------- Helpers UI ----------
  const isUSD = (w: Wallet | null) => (w?.currency || 'MXN').toUpperCase() !== 'MXN';

  // Auto-calcula source_amount_mxn = amount * fx_rate
  const recalcSource = (amt: string, rate: string) => {
    const a = Number(amt), r = Number(rate);
    if (Number.isFinite(a) && Number.isFinite(r) && a > 0 && r > 0) {
      setFSourceMxn((a * r).toFixed(2));
    }
  };

  // ---------- Submits ----------
  const submitFund = async () => {
    if (!active) return;
    const amount = Number(fAmount);
    if (!amount || amount <= 0) { Alert.alert('Falta', 'Monto inválido'); return; }
    if (!fOrigin) { Alert.alert('Falta', 'Selecciona el origen de los fondos'); return; }
    if (fOrigin === 'otro' && !fOriginDetail.trim()) {
      Alert.alert('Falta', '¿De dónde vienen los fondos?'); return;
    }
    const needsFx = isUSD(active);
    const body: any = {
      branch_id: active.branch_id,
      amount_mxn: amount,
      concept: fConcept || undefined,
      funds_origin: fOrigin,
      funds_origin_detail: fOrigin === 'otro' ? fOriginDetail.trim() : undefined,
    };
    if (needsFx) {
      const rate = Number(fFxRate), src = Number(fSourceMxn);
      if (!rate || rate <= 0) { Alert.alert('Falta', 'Tipo de cambio (MXN por 1 USD) requerido'); return; }
      if (!src || src <= 0) { Alert.alert('Falta', 'Monto MXN egresado requerido'); return; }
      body.fx_rate = rate;
      body.source_amount_mxn = src;
      body.fx_provider = fFxProvider || 'casa de bolsa';
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/fund-branch`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al fondear');
      Alert.alert('Listo', d.message || 'Sucursal fondeada');
      setModal(null);
      await loadWallets();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Error de red');
    } finally { setBusy(false); }
  };

  const submitAdvance = async () => {
    if (!active) return;
    if (!aDriverId) { Alert.alert('Falta', 'Selecciona un chofer'); return; }
    const amount = Number(aAmount);
    if (!amount || amount <= 0) { Alert.alert('Falta', 'Monto inválido'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/petty-cash/advance-driver`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_user_id: aDriverId,
          amount_mxn: amount,
          route_purpose: aPurpose || undefined,
          branch_id: active.branch_id,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      Alert.alert('Listo', d.message || 'Vale creado');
      setModal(null);
      await loadWallets();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Error de red');
    } finally { setBusy(false); }
  };

  const pickPhoto = async (source: 'camera' | 'gallery') => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permiso', 'Se requiere permiso para acceder a la cámara/galería'); return; }
      const res = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        const name = a.fileName || `evidence-${Date.now()}.jpg`;
        setGPhoto({ uri: a.uri, name, type: a.mimeType || 'image/jpeg' });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo abrir');
    }
  };

  const submitExpense = async () => {
    if (!active) return;
    const amount = Number(gAmount);
    if (!amount || amount <= 0) { Alert.alert('Falta', 'Monto inválido'); return; }
    if (!gPhoto) { Alert.alert('Falta', 'Foto del ticket requerida'); return; }
    if (gCategory === 'impuestos_dhl' && !gConcept.trim()) {
      Alert.alert('Falta', 'Guía DHL requerida en el concepto'); return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('category', gCategory);
      form.append('amount_mxn', String(amount));
      if (gConcept) form.append('concept', gConcept);
      // React Native FormData espera { uri, name, type }
      form.append('evidence', { uri: gPhoto.uri, name: gPhoto.name, type: gPhoto.type } as any);
      const r = await fetch(`${API_URL}/api/petty-cash/branch-expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo registrar el gasto');
      Alert.alert('Listo', 'Gasto registrado · pendiente de aprobación');
      setModal(null);
      await loadWallets();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Error de red');
    } finally { setBusy(false); }
  };

  // ---------- Render ----------
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header onBack={() => navigation.goBack()} title="Caja Sucursales" subtitle="Cargando…" />
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      </SafeAreaView>
    );
  }

  const totalMxn = wallets
    .filter(w => (w.currency || 'MXN').toUpperCase() === 'MXN')
    .reduce((acc, w) => acc + Number(w.balance_mxn || 0), 0);
  const totalUsd = wallets
    .filter(w => (w.currency || '').toUpperCase() === 'USD')
    .reduce((acc, w) => acc + Number(w.balance_mxn || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <Header onBack={() => navigation.goBack()} title="Caja Sucursales" subtitle={`${wallets.length} sucursal${wallets.length === 1 ? '' : 'es'}`} />

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
      >
        <View style={styles.totalsRow}>
          <View style={[styles.totalsBox, { borderLeftColor: GREEN }]}>
            <Text style={styles.totalsLbl}>Total MXN</Text>
            <Text style={styles.totalsVal}>{fmt(totalMxn, 'MXN')}</Text>
          </View>
          {totalUsd > 0 && (
            <View style={[styles.totalsBox, { borderLeftColor: BLUE }]}>
              <Text style={styles.totalsLbl}>Total USD</Text>
              <Text style={styles.totalsVal}>{fmt(totalUsd, 'USD')}</Text>
            </View>
          )}
        </View>

        {wallets.map(w => {
          const cur = (w.currency || 'MXN').toUpperCase();
          const usd = cur === 'USD';
          return (
            <View key={w.id} style={styles.wcard}>
              <View style={styles.wcardHead}>
                <View style={styles.wcardIcon}><Ionicons name="business-outline" size={20} color={ORANGE} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wcardName}>{w.owner_name}</Text>
                  <Text style={styles.wcardMeta}>
                    {w.ops_user_name ? `${w.ops_user_name} · ` : ''}{w.status === 'active' ? 'Activa' : w.status}
                  </Text>
                </View>
                <View style={[styles.curBadge, usd ? styles.curUsd : styles.curMxn]}>
                  <Text style={[styles.curBadgeTxt, { color: usd ? '#1565C0' : '#1B5E20' }]}>{cur}</Text>
                </View>
              </View>

              <Text style={styles.balLbl}>Saldo disponible</Text>
              <Text style={[styles.balVal, Number(w.balance_mxn) < 0 && { color: RED }]}>{fmt(w.balance_mxn, cur)}</Text>
              <Text style={styles.spentLbl}>
                Total gastado: <Text style={{ fontWeight: '700', color: '#222' }}>{fmt(w.total_spent_mxn, cur)}</Text>
                {Number(w.pending_expenses_count) > 0 ? ` · ${w.pending_expenses_count} pendiente(s)` : ''}
              </Text>

              <View style={styles.btnsRow}>
                <TouchableOpacity style={[styles.btn, { backgroundColor: '#D84315' }]} onPress={() => openAdvance(w)}>
                  <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                  <Text style={styles.btnTxt}>Anticipo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, { backgroundColor: ORANGE }]} onPress={() => openExpense(w)}>
                  <Ionicons name="receipt-outline" size={16} color="#fff" />
                  <Text style={styles.btnTxt}>Gasto</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.btnsRow}>
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => openMovements(w)}>
                  <Ionicons name="calendar-outline" size={16} color={BLUE} />
                  <Text style={[styles.btnTxt, { color: BLUE }]}>Movimientos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnOutlineO]} onPress={() => openFund(w)}>
                  <Ionicons name="cash-outline" size={16} color={ORANGE} />
                  <Text style={[styles.btnTxt, { color: ORANGE }]}>Fondear</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {wallets.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={42} color="#CBD5E1" />
            <Text style={styles.emptyTxt}>Sin cajas configuradas</Text>
          </View>
        )}

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color="#1565C0" />
          <Text style={styles.noteTxt}>Los gastos requieren foto del ticket. Para wallets en USD, capturar tipo de cambio al fondear.</Text>
        </View>
      </ScrollView>

      {/* === MODALES === */}
      <ModalShell open={modal === 'fund'} title={`Fondear · ${active?.owner_name || ''}`} onClose={() => setModal(null)}>
        <FieldLabel>Monto que llega a la sucursal ({(active?.currency || 'MXN').toUpperCase()})</FieldLabel>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={fAmount}
          onChangeText={(v) => { setFAmount(v); if (isUSD(active)) recalcSource(v, fFxRate); }}
          placeholderTextColor="#999"
        />
        <FieldLabel>Origen de los fondos</FieldLabel>
        <View style={styles.chipGrid}>
          {([
            { key: 'caja_cc', label: 'Caja CC' },
            { key: 'otro',    label: 'Otro' },
          ] as const).map(opt => {
            const selected = fOrigin === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, selected && styles.chipOn]}
                onPress={() => setFOrigin(opt.key)}
              >
                <Text style={[styles.chipTxt, selected && styles.chipTxtOn]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {fOrigin === 'otro' && (
          <>
            <FieldLabel>¿De dónde vienen los fondos?</FieldLabel>
            <TextInput
              style={styles.input}
              placeholder="Ej. Depósito del director, venta de activo…"
              value={fOriginDetail}
              onChangeText={setFOriginDetail}
              placeholderTextColor="#999"
            />
          </>
        )}
        {fOrigin && fOrigin !== 'caja_cc' && (
          <Text style={styles.helperTxt}>
            Se registrará automáticamente un ingreso (origen externo) y un egreso (fondeo) en Caja CC.
          </Text>
        )}
        {isUSD(active) && (
          <>
            <FieldLabel>Tipo de cambio (MXN por 1 USD)</FieldLabel>
            <TextInput
              style={styles.input}
              placeholder="17.50"
              keyboardType="decimal-pad"
              value={fFxRate}
              onChangeText={(v) => { setFFxRate(v); recalcSource(fAmount, v); }}
              placeholderTextColor="#999"
            />
            <FieldLabel>MXN egresado de Caja CC</FieldLabel>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={fSourceMxn}
              onChangeText={setFSourceMxn}
              placeholderTextColor="#999"
            />
            <FieldLabel>Casa de cambio / proveedor</FieldLabel>
            <TextInput
              style={styles.input}
              placeholder="casa de bolsa"
              value={fFxProvider}
              onChangeText={setFFxProvider}
              placeholderTextColor="#999"
            />
          </>
        )}
        <FieldLabel>Concepto (opcional)</FieldLabel>
        <TextInput style={styles.input} placeholder="Detalle del fondeo" value={fConcept} onChangeText={setFConcept} placeholderTextColor="#999" />
        <SubmitRow busy={busy} onCancel={() => setModal(null)} onSubmit={submitFund} label="Fondear" />
      </ModalShell>

      <ModalShell open={modal === 'advance'} title={`Anticipo · ${active?.owner_name || ''}`} onClose={() => setModal(null)}>
        <FieldLabel>Chofer</FieldLabel>
        <View style={styles.chipGrid}>
          {drivers
            .filter(d => !d.branch_id || d.branch_id === active?.branch_id)
            .map(d => (
              <TouchableOpacity key={d.id} onPress={() => setADriverId(d.id)} style={[styles.chip, aDriverId === d.id && styles.chipOn]}>
                <Text style={[styles.chipTxt, aDriverId === d.id && { color: '#fff' }]}>{d.full_name}</Text>
              </TouchableOpacity>
            ))}
          {drivers.length === 0 && <Text style={styles.muted}>Sin choferes registrados</Text>}
        </View>
        <FieldLabel>Monto (MXN)</FieldLabel>
        <TextInput style={styles.input} placeholder="0.00" keyboardType="decimal-pad" value={aAmount} onChangeText={setAAmount} placeholderTextColor="#999" />
        <FieldLabel>Propósito / ruta</FieldLabel>
        <TextInput style={styles.input} placeholder="Ej. Ruta MTY-CDMX 30/05" value={aPurpose} onChangeText={setAPurpose} placeholderTextColor="#999" />
        <SubmitRow busy={busy} onCancel={() => setModal(null)} onSubmit={submitAdvance} label="Crear vale" />
      </ModalShell>

      <ModalShell open={modal === 'expense'} title={`Registrar Gasto · ${active?.owner_name || ''}`} onClose={() => setModal(null)}>
        <FieldLabel>Categoría</FieldLabel>
        <View style={styles.chipGrid}>
          {categories.map(c => (
            <TouchableOpacity key={c.key} onPress={() => setGCategory(c.key)} style={[styles.chip, gCategory === c.key && styles.chipOn]}>
              <Text style={[styles.chipTxt, gCategory === c.key && { color: '#fff' }]}>{c.icon} {c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FieldLabel>Monto ({(active?.currency || 'MXN').toUpperCase()})</FieldLabel>
        <TextInput style={styles.input} placeholder="0.00" keyboardType="decimal-pad" value={gAmount} onChangeText={setGAmount} placeholderTextColor="#999" />
        <FieldLabel>{gCategory === 'impuestos_dhl' ? 'Guía DHL (obligatorio)' : 'Concepto (opcional)'}</FieldLabel>
        <TextInput style={styles.input} placeholder="" value={gConcept} onChangeText={setGConcept} placeholderTextColor="#999" />

        <FieldLabel>Foto del ticket *</FieldLabel>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => pickPhoto('camera')}>
            <Ionicons name="camera-outline" size={16} color={BLUE} />
            <Text style={[styles.btnTxt, { color: BLUE }]}>Cámara</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => pickPhoto('gallery')}>
            <Ionicons name="image-outline" size={16} color={BLUE} />
            <Text style={[styles.btnTxt, { color: BLUE }]}>Galería</Text>
          </TouchableOpacity>
        </View>
        {gPhoto && (
          <View style={{ marginTop: 8, alignItems: 'center' }}>
            <Image source={{ uri: gPhoto.uri }} style={{ width: 160, height: 160, borderRadius: 8 }} />
            <TouchableOpacity onPress={() => setGPhoto(null)} style={{ marginTop: 4 }}>
              <Text style={{ color: RED, fontSize: 12 }}>Quitar foto</Text>
            </TouchableOpacity>
          </View>
        )}

        <SubmitRow busy={busy} onCancel={() => setModal(null)} onSubmit={submitExpense} label="Registrar" />
      </ModalShell>

      <ModalShell open={modal === 'movements'} title={`Movimientos · ${active?.owner_name || ''}`} onClose={() => setModal(null)}>
        {movLoading ? (
          <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />
        ) : movements.length === 0 ? (
          <Text style={[styles.muted, { textAlign: 'center', padding: 20 }]}>Sin movimientos aún</Text>
        ) : (
          movements.slice(0, 80).map(m => {
            const isIn = m.movement_type === 'fund' || m.movement_type === 'refund';
            const color = isIn ? GREEN : (m.movement_type === 'expense' ? RED : '#666');
            const sign = isIn ? '+' : '-';
            const cur = (m.currency || active?.currency || 'MXN').toUpperCase();
            return (
              <View key={m.id} style={styles.movRow}>
                <View style={[styles.movDot, { backgroundColor: color }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.movTitle} numberOfLines={1}>
                    {labelMov(m.movement_type)}{m.category ? ` · ${m.category}` : ''}
                  </Text>
                  <Text style={styles.movMeta} numberOfLines={2}>
                    {m.concept || ''}{m.driver_name ? ` · ${m.driver_name}` : ''}
                  </Text>
                  <Text style={styles.movDate}>
                    {new Date(m.created_at).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{m.status}
                  </Text>
                </View>
                <Text style={[styles.movAmt, { color }]}>{sign}{fmt(m.amount_mxn, cur)}</Text>
              </View>
            );
          })
        )}
        <TouchableOpacity style={[styles.btn, styles.btnOutline, { marginTop: 12 }]} onPress={() => setModal(null)}>
          <Text style={[styles.btnTxt, { color: '#444' }]}>Cerrar</Text>
        </TouchableOpacity>
      </ModalShell>
    </SafeAreaView>
  );
}

const labelMov = (t: string) => ({
  fund: 'Fondeo',
  advance: 'Anticipo a chofer',
  expense: 'Gasto',
  refund: 'Reembolso',
  adjustment: 'Ajuste',
}[t] || t);

// ---------- Sub-componentes ----------
function Header({ onBack, title, subtitle }: { onBack: () => void; title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerBtn} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLbl}>{children}</Text>;
}

function ModalShell({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBack} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SubmitRow({ busy, onCancel, onSubmit, label }: { busy: boolean; onCancel: () => void; onSubmit: () => void; label: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
      <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={onCancel} disabled={busy}>
        <Text style={[styles.btnTxt, { color: '#444' }]}>Cancelar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: ORANGE }]} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>{label}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  muted: { color: '#888', fontSize: 12 },
  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  totalsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  totalsBox: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, borderLeftWidth: 3 },
  totalsLbl: { fontSize: 10, color: '#666', textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.4 },
  totalsVal: { fontSize: 15, color: '#222', fontWeight: '700', marginTop: 4 },

  wcard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EFEFEF' },
  wcardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  wcardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFE0D2', alignItems: 'center', justifyContent: 'center' },
  wcardName: { fontSize: 14, fontWeight: '700', color: '#222' },
  wcardMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  curBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  curMxn: { backgroundColor: '#C8E6C9' },
  curUsd: { backgroundColor: '#BBDEFB' },
  curBadgeTxt: { fontSize: 11, fontWeight: '700' },

  balLbl: { fontSize: 11, color: '#666', textTransform: 'uppercase', fontWeight: '600', letterSpacing: 0.4 },
  balVal: { fontSize: 24, fontWeight: '800', color: GREEN, marginTop: 2 },
  spentLbl: { fontSize: 12, color: '#666', marginTop: 4, marginBottom: 10 },

  btnsRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#BBDEFB' },
  btnOutlineO: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#FFCCBC' },

  empty: { alignItems: 'center', padding: 40 },
  emptyTxt: { color: '#94A3B8', marginTop: 8 },

  note: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#E3F2FD', borderRadius: 8, marginTop: 12 },
  noteTxt: { flex: 1, fontSize: 11, color: '#1565C0' },
  helperTxt: { fontSize: 11, color: '#666', marginTop: 6, marginBottom: 4, lineHeight: 15 },

  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#222', flex: 1, marginRight: 8 },

  fieldLbl: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#222', backgroundColor: '#fff' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F0F0F0' },
  chipOn: { backgroundColor: ORANGE },
  chipTxt: { fontSize: 12, color: '#444', fontWeight: '600' },

  movRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  movDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  movTitle: { fontSize: 13, fontWeight: '700', color: '#222' },
  movMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  movDate: { fontSize: 10, color: '#999', marginTop: 2 },
  movAmt: { fontSize: 13, fontWeight: '800', marginLeft: 6 },
});
