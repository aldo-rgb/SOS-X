/**
 * ChinaSeaReceptionScreen - Wizard recepción de Contenedores (TDI Marítimo China)
 * Param `mode`: 'LCL' (default) | 'FCL'
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as Print from 'expo-print';
import { API_URL } from '../services/api';

const TEAL = '#0097A7';
const ORANGE = '#F05A28';
const BLACK = '#1A1A1A';
const RED = '#E53935';
const GREEN = '#2E7D32';

interface Container {
  id: number;
  container_number: string | null;
  bl_number: string | null;
  reference_code: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  eta: string | null;
  week_number: string | null;
  type: string | null;
  total_orders: number;
  received_orders: number;
  total_weight_kg: string | number | null;
  total_cbm: string | number | null;
}

interface Order {
  id: number;
  ordersn: string;
  shipping_mark: string | null;
  goods_name: string | null;
  goods_num: number | null;
  summary_boxes: number | null;
  weight: string | number | null;
  volume: string | number | null;
  status: string;
  missing_on_arrival: boolean;
  user_box_id: string | null;
  user_name: string | null;
  bl_client_code?: string | null;
  bl_client_name?: string | null;
}

const cleanRef = (raw: string): string => {
  let r = raw.trim().replace(/[\s'_]/g, '').toUpperCase();
  const m = r.match(/[A-Z]{2,}\d+[A-Z0-9-]*/);
  if (m) r = m[0];
  return r;
};

export default function ChinaSeaReceptionScreen({ route, navigation }: any) {
  const { token, mode = 'LCL' } = route.params;
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const isFCL = mode === 'FCL';
  const accent = isFCL ? ORANGE : TEAL;

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [containers, setContainers] = useState<Container[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Container | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const lockRef = useRef(false);

  // Tracking de cajas escaneadas por orden (orderId -> Set de números '0001')
  const [scannedBoxesByOrder, setScannedBoxesByOrder] = useState<Record<number, Set<string>>>({});

  const [cameraOpen, setCameraOpen] = useState(false);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [result, setResult] = useState<{ received: number; missing: number; total: number } | null>(null);

  // === Impresión de etiquetas + recepción parcial ===
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [receivedByOrder, setReceivedByOrder] = useState<Record<number, number>>({});
  const [reportingPartial, setReportingPartial] = useState(false);
  const [printing, setPrinting] = useState(false);

  const totalBoxesInContainer = orders.reduce(
    (acc, o) => acc + (Number(o.summary_boxes) || Number(o.goods_num) || 0),
    0,
  );
  const selectedBoxesCount = orders
    .filter((o) => selectedOrderIds.has(o.id))
    .reduce((acc, o) => {
      const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
      const received = receivedByOrder[o.id];
      return acc + (received !== undefined ? Math.min(received, expected) : expected);
    }, 0);
  const partialMissingCount = orders
    .filter((o) => selectedOrderIds.has(o.id))
    .reduce((acc, o) => {
      const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
      const received = receivedByOrder[o.id];
      if (received === undefined) return acc;
      return acc + Math.max(0, expected - Math.min(received, expected));
    }, 0);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/in-transit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      const all: Container[] = data.containers || [];
      // Filtro web: LCL = tiene week_number "Week X"; FCL = no tiene
      const filtered = all.filter((c) => {
        const w = (c.week_number || '').toString().trim();
        const has = /week/i.test(w);
        return isFCL ? !has : has;
      });
      setContainers(filtered);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally { setLoading(false); }
  }, [token, isFCL]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (step === 1) {
      setTimeout(() => inputRef.current?.focus(), 350);
      setTimeout(() => inputRef.current?.focus(), 700);
    }
  }, [step]);

  const open = async (c: Container) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${c.id}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setOrders(data.orders || []);
      setSelected(c);
      setStep(1);
    } catch (e: any) { setError(e.message || 'Error'); } finally { setLoading(false); }
  };

  const refresh = async () => {
    if (!selected) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${selected.id}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {}
  };

  const handleScan = async (raw: string) => {
    if (!selected) return;
    const reference = cleanRef(raw);
    if (!reference) return;

    // Detectar patrón LOG...-NNNN (caja individual con guión)
    const dashMatch = reference.match(/^(.+?)-(\d{1,4})$/);
    let parentRef = dashMatch ? dashMatch[1] : reference;
    let boxNumber: string | null = dashMatch ? dashMatch[2].padStart(4, '0') : null;

    // Si NO trae guión pero parece un LOG, intentar detectar el sufijo de caja compacto
    // probando recortar 1-4 dígitos finales y ver si el prefijo coincide con algún ordersn local.
    if (!dashMatch && /^LOG/i.test(reference)) {
      for (const len of [4, 3, 2, 1]) {
        if (reference.length <= len + 6) continue;
        const candidateMaster = reference.slice(0, -len);
        const candidateBox = reference.slice(-len);
        const found = orders.find(
          (o) => (o.ordersn || '').toUpperCase() === candidateMaster.toUpperCase()
        );
        if (found) {
          parentRef = candidateMaster;
          boxNumber = candidateBox.padStart(4, '0');
          break;
        }
      }
    }

    const matchedOrder = orders.find(
      (o) => (o.ordersn || '').toUpperCase() === parentRef.toUpperCase()
    );

    // 🔒 Si el escaneo trae número de caja, FORZAR tracking por caja.
    if (boxNumber) {
      if (!matchedOrder) {
        Vibration.vibrate([0, 80, 50, 80]);
        setFeedback({ type: 'error', msg: `❌ Log ${parentRef} no pertenece a este contenedor` });
        setScanInput('');
        return;
      }
      const expected = Number(matchedOrder.summary_boxes) || Number(matchedOrder.goods_num) || 0;
      const boxNum = parseInt(boxNumber, 10);
      if (expected > 0 && boxNum > expected) {
        Vibration.vibrate([0, 80, 50, 80]);
        setFeedback({ type: 'error', msg: `⚠️ Caja ${boxNum} fuera de rango (${matchedOrder.ordersn} solo tiene ${expected} caja(s))` });
        setScanInput('');
        return;
      }
      const prevSet = scannedBoxesByOrder[matchedOrder.id] || new Set<string>();
      if (prevSet.has(boxNumber)) {
        setFeedback({ type: 'info', msg: `ℹ️ Caja ${boxNum} de ${matchedOrder.ordersn} ya escaneada` });
        setScanInput('');
        return;
      }
      const nextSet = new Set(prevSet);
      nextSet.add(boxNumber);
      setScannedBoxesByOrder((prev) => ({ ...prev, [matchedOrder.id]: nextSet }));

      const remaining = expected - nextSet.size;
      if (expected > 0 && remaining === 0) {
        // Todas las cajas escaneadas → marcar como recibido en backend
        try {
          const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${selected.id}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ reference: matchedOrder.ordersn }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error');
          Vibration.vibrate([0, 60, 40, 60, 40, 60]);
          setFeedback({ type: 'success', msg: `✅ ${matchedOrder.ordersn} completo (${nextSet.size}/${expected})` });
          await refresh();
        } catch (e: any) {
          Vibration.vibrate([0, 80, 50, 80]);
          setFeedback({ type: 'error', msg: e.message || 'Error al marcar como recibido' });
        }
      } else {
        Vibration.vibrate(50);
        setFeedback({ type: 'success', msg: `✓ Caja ${boxNum} de ${matchedOrder.ordersn} · ${nextSet.size}/${expected} (faltan ${remaining})` });
      }
      setScanInput('');
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    // Sin número de caja: si la orden tiene > 1 caja (o cantidad no definida), forzar escaneo por caja.
    if (matchedOrder) {
      const expected = Number(matchedOrder.summary_boxes) || Number(matchedOrder.goods_num) || 0;
      if (expected !== 1) {
        Vibration.vibrate([0, 80, 50, 80]);
        const expectedLabel = expected > 1 ? `${expected} cajas` : 'múltiples cajas';
        setFeedback({
          type: 'error',
          msg: `⚠️ ${matchedOrder.ordersn} tiene ${expectedLabel}. Escanea cada caja individualmente (${matchedOrder.ordersn}-0001 ... )`,
        });
        setScanInput('');
        return;
      }
    }

    // Log de 1 sola caja o no encontrado localmente → flujo legado contra backend
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${selected.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reference: parentRef }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      if (data.already_received) {
        setFeedback({ type: 'info', msg: `Ya escaneado: ${data.order?.ordersn || reference}` });
      } else {
        // Si existe localmente y tiene 1 caja, sembrar el set
        if (matchedOrder) {
          setScannedBoxesByOrder((prev) => ({ ...prev, [matchedOrder.id]: new Set(['0001']) }));
        }
        Vibration.vibrate(50);
        setFeedback({ type: 'success', msg: `✓ ${data.order?.ordersn || reference}` });
      }
      await refresh();
    } catch (e: any) {
      Vibration.vibrate([0, 80, 50, 80]);
      setFeedback({ type: 'error', msg: e.message || 'Error' });
    }
    setScanInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const onCameraScan = (r: BarcodeScanningResult) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setCameraOpen(false);
    setTimeout(() => { lockRef.current = false; }, 1200);
    handleScan(r.data);
  };

  const finalize = async (forcePartial = false) => {
    if (!selected) return;
    const missing = orders.filter((o) => o.status !== 'received_mty').length;
    if (missing > 0 && !forcePartial) { setConfirmPartial(true); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/china-sea/containers/${selected.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ allow_partial: forcePartial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setResult({ received: data.received, missing: data.missing, total: data.total });
      setConfirmPartial(false);
      setStep(2);
    } catch (e: any) { setError(e.message || 'Error'); setConfirmPartial(false); } finally { setLoading(false); }
  };

  const reset = () => {
    setStep(0); setSelected(null); setOrders([]); setScanInput(''); setScannedBoxesByOrder({});
    setFeedback(null); setResult(null);
    load();
  };

  // === Impresión de etiquetas (1 por caja) ===
  const openLabelsModal = () => {
    setSelectedOrderIds(new Set(orders.map((o) => o.id)));
    setReceivedByOrder({});
    setLabelsOpen(true);
  };
  const toggleOrderForLabel = (id: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllOrdersForLabel = () => {
    if (selectedOrderIds.size === orders.length) setSelectedOrderIds(new Set());
    else setSelectedOrderIds(new Set(orders.map((o) => o.id)));
  };
  const setReceivedForOrder = (orderId: number, value: number, expected: number) => {
    const safe = Math.max(0, Math.min(Math.floor(Number(value) || 0), expected));
    setReceivedByOrder((prev) => ({ ...prev, [orderId]: safe }));
  };

  const printContainerLabels = async () => {
    if (!selected) return;
    const ordersToPrint = orders.filter((o) => selectedOrderIds.has(o.id));
    if (ordersToPrint.length === 0) {
      setFeedback({ type: 'error', msg: 'Selecciona al menos una orden' });
      return;
    }
    type Label = {
      tracking: string; ordersn: string; boxNumber: number; totalBoxes: number;
      shippingMark: string; weight: string; volume: string;
    };
    const labels: Label[] = [];
    ordersToPrint.forEach((o) => {
      const expected = Number(o.summary_boxes) || Number(o.goods_num) || 1;
      const override = receivedByOrder[o.id];
      const boxes = override !== undefined ? Math.min(override, expected) : expected;
      for (let i = 1; i <= boxes; i++) {
        labels.push({
          tracking: `${o.ordersn}-${String(i).padStart(4, '0')}`,
          ordersn: o.ordersn,
          boxNumber: i,
          totalBoxes: expected,
          shippingMark: o.shipping_mark || o.bl_client_code || o.user_box_id || '—',
          weight: o.weight ? `${Number(o.weight).toFixed(2)} kg` : '',
          volume: o.volume ? `${Number(o.volume).toFixed(3)} CBM` : '',
        });
      }
    });
    if (labels.length === 0) {
      setFeedback({ type: 'error', msg: 'No hay cajas para imprimir' });
      return;
    }

    const renderHalf = (label: Label, idx: number, position: 'top' | 'bottom') => {
      const safeText = label.tracking.replace(/[^A-Z0-9-]/gi, '');
      const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(safeText)}&scale=3&height=15&includetext=N&backgroundcolor=FFFFFF`;
      return `
      <div class="half ${position}">
        <div class="header">
          <div class="service">MARÍTIMO</div>
          <div class="date-badge">${label.boxNumber}/${label.totalBoxes}</div>
        </div>
        <div class="tracking-code">${label.tracking}</div>
        <div class="barcode-section"><img class="barcode-img" src="${barcodeUrl}" alt="${safeText}" /></div>
        <div class="client-mark">${label.shippingMark}</div>
        <div class="details">
          ${label.volume ? `<span class="detail-item">${label.volume}</span>` : ''}
        </div>
      </div>`;
    };

    const pages: string[] = [];
    for (let i = 0; i < labels.length; i += 2) {
      const top = labels[i];
      const bottom = labels[i + 1];
      const isLast = i + 2 >= labels.length;
      pages.push(`
        <div class="page" style="page-break-after: ${isLast ? 'auto' : 'always'};">
          ${renderHalf(top, i, 'top')}
          ${bottom ? renderHalf(bottom, i + 1, 'bottom') : '<div class="half bottom empty"></div>'}
        </div>`);
    }

    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8" />
      <title>Etiquetas Marítimo · ${selected.reference_code || selected.container_number || ''}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; }
        .page { width: 4in; height: 6in; margin: 0 auto; position: relative; overflow: hidden; }
        .half { position: absolute; left: 0; right: 0; padding: 0.18in 0.18in 0.14in 0.18in;
          display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
        .half.top { top: 0; height: calc(3in + 1cm); }
        .half.bottom { bottom: 0; height: calc(3in - 1cm); padding-top: 0.45in; }
        .half.empty { background: transparent; }
        .header { display: flex; justify-content: space-between; align-items: center; }
        .service { color: #000; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
        .date-badge { color: #000; font-size: 22px; font-weight: 900; }
        .tracking-code { text-align: center; font-size: 18px; font-weight: bold;
          letter-spacing: 1px; font-family: 'Courier New', monospace; margin: 2px 0; }
        .barcode-section { text-align: center; }
        .barcode-img { width: 92%; height: 50px; object-fit: fill; }
        .client-mark { text-align: center; font-size: 38px; color: #FF6B35; font-weight: 900;
          letter-spacing: 2px; line-height: 1; margin: 2px 0; }
        .details { text-align: center; font-size: 12px; font-weight: 600;
          display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
        .detail-item { background: #f5f5f5; padding: 2px 8px; border-radius: 4px; }
        @page { size: 4in 6in; margin: 0; }
      </style>
    </head><body>${pages.join('')}
    </body></html>`;

    try {
      setPrinting(true);
      await Print.printAsync({ html });
      setLabelsOpen(false);
      setFeedback({ type: 'success', msg: `${labels.length} etiqueta(s) enviadas a impresión` });
    } catch (err) {
      console.error('Error imprimiendo:', err);
      setFeedback({ type: 'error', msg: 'Error al generar PDF de etiquetas' });
    } finally {
      setPrinting(false);
    }
  };

  // === Reportar cajas faltantes (parciales) ===
  const reportPartialBoxes = async () => {
    if (!selected) return;
    const payload = orders
      .filter((o) => selectedOrderIds.has(o.id))
      .filter((o) => receivedByOrder[o.id] !== undefined)
      .map((o) => {
        const expected = Number(o.summary_boxes) || Number(o.goods_num) || 0;
        return { order_id: o.id, received_boxes: Math.min(receivedByOrder[o.id], expected) };
      });
    if (payload.length === 0) {
      setFeedback({ type: 'info', msg: 'No hay órdenes con cajas faltantes para reportar' });
      return;
    }
    try {
      setReportingPartial(true);
      const res = await fetch(
        `${API_URL}/api/admin/china-sea/containers/${selected.id}/report-partial-boxes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orders: payload }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      const partialCount = data.partial_orders_count || 0;
      const missingBoxes = data.total_missing_boxes || 0;
      if (partialCount > 0) {
        setFeedback({
          type: 'success',
          msg: `${partialCount} orden(es) con ${missingBoxes} caja(s) faltante(s) reportadas`,
        });
        await refresh();
      } else {
        setFeedback({ type: 'info', msg: 'Sin cambios — todas completas' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', msg: e.message || 'Error al reportar' });
    } finally {
      setReportingPartial(false);
    }
  };

  const receivedCount = orders.filter((o) => o.status === 'received_mty').length;
  const missingCount = orders.length - receivedCount;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Ionicons name="boat" size={20} color={accent} style={{ marginHorizontal: 8 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isFCL ? 'Actualizar Status Full Conteiner' : 'Recibir Contenedor'}</Text>
          <Text style={styles.headerSubtitle}>TDI Marítimo China · {mode}</Text>
        </View>
        {step === 0 && (
          <TouchableOpacity onPress={load}>
            <Ionicons name="refresh" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.stepper}>
        {['Seleccionar', 'Escanear', 'Confirmar'].map((label, i) => (
          <View key={i} style={styles.stepItem}>
            <View style={[styles.stepDot, step >= i && { backgroundColor: accent }]}>
              <Text style={[styles.stepNum, step >= i && { color: '#fff' }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, step === i && styles.stepLabelActive]} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}><Ionicons name="close" size={18} color={RED} /></TouchableOpacity>
        </View>
      )}

      {step === 0 && (
        <ScrollView contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator size="large" color={accent} style={{ marginTop: 40 }} />
          ) : containers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="boat-outline" size={48} color="#999" />
              <Text style={styles.emptyText}>No hay contenedores {mode} pendientes</Text>
            </View>
          ) : (() => {
            const q = searchQuery.trim().toLowerCase();
            const filtered = q
              ? containers.filter((c) =>
                  (c.reference_code || '').toLowerCase().includes(q) ||
                  (c.week_number || '').toLowerCase().includes(q) ||
                  (c.container_number || '').toLowerCase().includes(q) ||
                  (c.bl_number || '').toLowerCase().includes(q) ||
                  (c.voyage_number || '').toLowerCase().includes(q)
                )
              : containers;
            return (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={18} color={accent} style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar referencia, week, contenedor…"
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                      <Ionicons name="close-circle" size={18} color="#999" />
                    </TouchableOpacity>
                  )}
                </View>
                {filtered.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={36} color="#999" />
                    <Text style={styles.emptyText}>Sin resultados para "{searchQuery}"</Text>
                  </View>
                ) : (
                  filtered.map((c) => {
                    const eta = c.eta;
                    const days = eta ? Math.floor((new Date(eta).getTime() - Date.now()) / 86400000) : null;
                    const arrived = days !== null && days <= 0;
                    const isPartial = Number(c.received_orders) > 0 && Number(c.received_orders) < Number(c.total_orders);
                    const cFCL = (c.type || '').toUpperCase() === 'FCL';
                    const count = cFCL ? 1 : Number(c.total_orders || 0);
                    const lbl = cFCL ? 'CONTENEDOR' : count === 1 ? 'LOG' : 'LOGS';
                    return (
                      <TouchableOpacity key={c.id} style={[styles.containerCard, { borderLeftColor: accent }]} onPress={() => open(c)} activeOpacity={0.85}>
                        <View style={[styles.refBadge, { backgroundColor: accent }]}>
                          <Text style={styles.refBadgeNum}>{count}</Text>
                          <Text style={styles.refBadgeLbl}>{lbl}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.refCode, { color: accent }]}>
                            {c.reference_code || c.container_number || c.bl_number || '—'}
                          </Text>
                          {!!c.week_number && (
                            <View style={[styles.weekChip, { borderColor: accent }]}>
                              <Ionicons name="calendar-outline" size={11} color={accent} />
                              <Text style={[styles.weekChipText, { color: accent }]}>{c.week_number}</Text>
                            </View>
                          )}
                          {c.received_orders > 0 && (
                            <View style={[styles.miniChip, { backgroundColor: '#E8F5E9' }]}>
                              <Ionicons name="checkmark-circle" size={12} color={GREEN} />
                              <Text style={[styles.miniChipText, { color: GREEN }]}>
                                {c.received_orders}/{c.total_orders} recibidas
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <View style={[styles.statusChip, { backgroundColor: isPartial ? ORANGE : arrived ? GREEN : BLACK }]}>
                            <Text style={styles.statusChipText}>
                              {isPartial ? 'PARCIAL' : arrived ? 'EN PUERTO' : 'EN TRÁNSITO'}
                            </Text>
                          </View>
                          {days !== null && (
                            <Text style={styles.dayText}>
                              {days > 0 ? `En ${days}d` : days === 0 ? 'ETA hoy' : `Hace ${Math.abs(days)}d`}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            );
          })()}
        </ScrollView>
      )}

      {step === 1 && selected && (
        <View style={{ flex: 1 }}>
          <View style={[styles.banner, { borderColor: accent, backgroundColor: accent + '15' }]}>
            <Text style={styles.bannerLbl}>
              {selected.reference_code || '—'} · Cont. {selected.container_number || '—'}
              {selected.bl_number ? ` · BL ${selected.bl_number}` : ''}
            </Text>
            <Text style={styles.bannerTitle}>
              {selected.vessel_name || 'Buque sin asignar'}
              {selected.voyage_number ? ` · V${selected.voyage_number}` : ''}
            </Text>
            <View style={styles.bannerChips}>
              <View style={[styles.miniChip, { backgroundColor: BLACK }]}>
                <Text style={[styles.miniChipText, { color: '#fff' }]}>Total: {orders.length}</Text>
              </View>
              <View style={[styles.miniChip, { backgroundColor: '#E8F5E9' }]}>
                <Text style={[styles.miniChipText, { color: GREEN }]}>OK: {receivedCount}</Text>
              </View>
              <View style={[styles.miniChip, { backgroundColor: missingCount === 0 ? '#EEE' : RED }]}>
                <Text style={[styles.miniChipText, { color: missingCount === 0 ? '#666' : '#fff' }]}>
                  Faltan: {missingCount}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.printBannerBtn, { backgroundColor: ORANGE, opacity: orders.length === 0 ? 0.5 : 1 }]}
              onPress={openLabelsModal}
              disabled={orders.length === 0}
              activeOpacity={0.85}
            >
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={styles.printBannerBtnText}>
                Imprimir Etiquetas ({totalBoxesInContainer} cajas)
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.scanRow}>
            <TextInput
              ref={inputRef}
              style={styles.scanInput}
              placeholder="Escanear referencia (LOG..., shipping mark)..."
              placeholderTextColor="#999"
              value={scanInput}
              onChangeText={setScanInput}
              onSubmitEditing={() => handleScan(scanInput)}
              autoCapitalize="characters"
              autoFocus
              blurOnSubmit={false}
              returnKeyType="done"
            />
            <TouchableOpacity style={[styles.scanIconBtn, { backgroundColor: accent }]} onPress={async () => {
              if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) return; }
              setCameraOpen(true);
            }}>
              <Ionicons name="barcode-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.scanIconBtn, { backgroundColor: accent }]} onPress={() => handleScan(scanInput)}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {feedback && (
            <View style={[styles.feedback, {
              backgroundColor: feedback.type === 'success' ? '#E8F5E9' : feedback.type === 'error' ? '#FFEBEE' : '#E3F2FD'
            }]}>
              <Text style={{ color: feedback.type === 'success' ? GREEN : feedback.type === 'error' ? RED : '#1976D2', fontWeight: '600' }}>
                {feedback.msg}
              </Text>
              <TouchableOpacity onPress={() => setFeedback(null)}>
                <Ionicons name="close" size={16} color="#666" />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }}>
            {orders.map((o) => {
              const ok = o.status === 'received_mty';
              const wasMissing = o.missing_on_arrival === true;
              const expectedBoxes = Number(o.summary_boxes) || Number(o.goods_num) || 0;
              const scannedSet = scannedBoxesByOrder[o.id];
              const scannedCount = scannedSet ? scannedSet.size : 0;
              const isPartial = scannedCount > 0 && scannedCount < expectedBoxes;
              const isComplete = ok || (scannedCount >= expectedBoxes && expectedBoxes > 0);
              const remaining = Math.max(0, expectedBoxes - scannedCount);
              const bg = wasMissing
                ? '#FFF4E5'
                : isComplete
                ? '#E8F5E9'
                : isPartial
                ? '#FFF3E0'
                : '#fff';
              return (
                <View key={o.id} style={[styles.row, { backgroundColor: bg }]}>
                  <Ionicons
                    name={isComplete ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isComplete ? GREEN : wasMissing ? '#F9A825' : isPartial ? '#FF9800' : '#BBB'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tracking}>
                      {o.ordersn}
                      {expectedBoxes > 0 ? (
                        <Text style={{ fontWeight: '700', color: isComplete ? GREEN : isPartial ? '#FF9800' : '#666' }}>
                          {`  ${scannedCount}/${expectedBoxes} cajas`}
                          {isPartial ? `  · faltan ${remaining}` : ''}
                        </Text>
                      ) : null}
                    </Text>
                    <Text style={styles.subRow}>
                      {o.user_box_id ? `${o.user_box_id} · ` : ''}{o.user_name || 'Sin cliente'}
                    </Text>
                    <Text style={styles.subMini}>
                      {o.goods_name || '—'} · {Number(o.weight || 0).toFixed(2)} kg · {Number(o.volume || 0).toFixed(3)} m³
                    </Text>
                    {o.shipping_mark ? <Text style={styles.subMini}>Mark: {o.shipping_mark}</Text> : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(0)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: missingCount === 0 ? GREEN : ORANGE, opacity: receivedCount === 0 ? 0.5 : 1 }]}
              onPress={() => finalize(false)}
              disabled={loading || receivedCount === 0}
            >
              <Text style={styles.btnPrimaryText}>
                {missingCount === 0 ? 'Finalizar completa' : `Finalizar (${missingCount} faltantes)`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 2 && result && (
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={80} color={result.missing === 0 ? GREEN : ORANGE} />
          <Text style={styles.resultTitle}>
            {result.missing === 0 ? 'Recepción completa' : 'Recepción parcial registrada'}
          </Text>
          <Text style={styles.resultSub}>
            {selected?.reference_code} · {selected?.container_number}
          </Text>
          <View style={styles.resultRow}>
            <View style={styles.resultCell}>
              <Text style={[styles.resultNum, { color: GREEN }]}>{result.received}</Text>
              <Text style={styles.resultLbl}>Recibidos</Text>
            </View>
            <View style={styles.resultCell}>
              <Text style={[styles.resultNum, { color: result.missing === 0 ? '#999' : RED }]}>{result.missing}</Text>
              <Text style={styles.resultLbl}>Faltantes</Text>
            </View>
            <View style={styles.resultCell}>
              <Text style={[styles.resultNum, { color: BLACK }]}>{result.total}</Text>
              <Text style={styles.resultLbl}>Total</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.btnPrimary, { marginTop: 24, paddingHorizontal: 30, backgroundColor: accent }]} onPress={reset}>
            <Text style={styles.btnPrimaryText}>Recibir otro</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} onPress={() => navigation.goBack()}>
            <Text style={styles.btnSecondaryText}>Volver al menú</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={cameraOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCameraOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {permission?.granted && (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'pdf417'] }}
              onBarcodeScanned={onCameraScan}
            />
          )}
          <TouchableOpacity style={[styles.cameraClose, { top: insets.top + 10 }]} onPress={() => setCameraOpen(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={confirmPartial} transparent animationType="fade" onRequestClose={() => setConfirmPartial(false)}>
        <View style={styles.dialogBg}>
          <View style={styles.dialog}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="warning" size={22} color={ORANGE} />
              <Text style={styles.dialogTitle}>Confirmar recepción parcial</Text>
            </View>
            <Text style={styles.dialogText}>
              Faltan <Text style={{ fontWeight: '800' }}>{missingCount}</Text> de {orders.length} órdenes por escanear.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setConfirmPartial(false)}>
                <Text style={styles.btnSecondaryText}>Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => finalize(true)} disabled={loading}>
                <Text style={styles.btnPrimaryText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Imprimir Etiquetas + Recepción Parcial */}
      <Modal visible={labelsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLabelsOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.labelsHeader}>
            <Ionicons name="print" size={20} color="#fff" />
            <Text style={styles.labelsHeaderTitle} numberOfLines={1}>
              Imprimir · {selected?.reference_code || selected?.container_number || ''}
            </Text>
            <TouchableOpacity onPress={() => setLabelsOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.labelsBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.labelsBannerText}>
                <Text style={{ fontWeight: '800' }}>{selectedOrderIds.size}</Text> de {orders.length} órden(es) ·{' '}
                <Text style={{ fontWeight: '800' }}>{selectedBoxesCount}</Text> etiqueta(s)
              </Text>
              {partialMissingCount > 0 && (
                <Text style={[styles.labelsBannerText, { color: RED, marginTop: 2 }]}>
                  ⚠ {partialMissingCount} caja(s) faltante(s)
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={toggleAllOrdersForLabel} style={styles.toggleAllBtn}>
              <Text style={styles.toggleAllText}>
                {selectedOrderIds.size === orders.length ? 'Quitar todo' : 'Todo'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.labelsHint}>
            💡 Si un log llegó incompleto ajusta las cajas recibidas. Al "Reportar faltantes" se notifica a CEDIS y Administradores.
          </Text>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, paddingBottom: 16 }}>
            {orders.map((o) => {
              const checked = selectedOrderIds.has(o.id);
              const expected = Number(o.summary_boxes) || Number(o.goods_num) || 1;
              const receivedVal = receivedByOrder[o.id] !== undefined ? receivedByOrder[o.id] : expected;
              const isPartial = receivedVal < expected;
              return (
                <View
                  key={o.id}
                  style={[
                    styles.labelRow,
                    {
                      backgroundColor: isPartial
                        ? '#FFEBEE'
                        : checked
                        ? '#E8F5E9'
                        : '#FAFAFA',
                      borderColor: isPartial ? RED : checked ? GREEN : '#DDD',
                    },
                  ]}
                >
                  <TouchableOpacity onPress={() => toggleOrderForLabel(o.id)} style={{ marginRight: 8 }}>
                    <Ionicons
                      name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={26}
                      color={checked ? GREEN : '#999'}
                    />
                  </TouchableOpacity>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.labelOrderSn} numberOfLines={1}>{o.ordersn}</Text>
                    {!!o.shipping_mark && (
                      <Text style={styles.labelMark} numberOfLines={1}>Mark: {o.shipping_mark}</Text>
                    )}
                    <Text style={styles.labelMeta} numberOfLines={1}>
                      {isPartial
                        ? `${receivedVal}/${expected} cajas (faltan ${expected - receivedVal})`
                        : `${expected} caja(s)`}
                      {o.weight ? ` · ${Number(o.weight).toFixed(2)} kg` : ''}
                    </Text>
                  </View>

                  <View style={styles.qtyBox}>
                    <TouchableOpacity
                      onPress={() => setReceivedForOrder(o.id, receivedVal - 1, expected)}
                      disabled={receivedVal <= 0}
                      style={styles.qtyBtn}
                    >
                      <Text style={[styles.qtyBtnText, receivedVal <= 0 && { color: '#CCC' }]}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.qtyInput}
                      value={String(receivedVal)}
                      onChangeText={(t) => setReceivedForOrder(o.id, Number(t), expected)}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.qtyTotal}>/{expected}</Text>
                    <TouchableOpacity
                      onPress={() => setReceivedForOrder(o.id, receivedVal + 1, expected)}
                      disabled={receivedVal >= expected}
                      style={styles.qtyBtn}
                    >
                      <Text style={[styles.qtyBtnText, receivedVal >= expected && { color: '#CCC' }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.labelsFooter}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setLabelsOpen(false)}>
              <Text style={styles.btnSecondaryText}>Cerrar</Text>
            </TouchableOpacity>
            {partialMissingCount > 0 && (
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: RED }]}
                onPress={reportPartialBoxes}
                disabled={reportingPartial}
              >
                {reportingPartial ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText} numberOfLines={1}>
                    ⚠ Reportar {partialMissingCount}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.btnPrimary,
                { backgroundColor: ORANGE, opacity: selectedBoxesCount === 0 ? 0.5 : 1 },
              ]}
              onPress={printContainerLabels}
              disabled={selectedOrderIds.size === 0 || selectedBoxesCount === 0 || printing}
            >
              {printing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText} numberOfLines={1}>
                  🖨 Imprimir {selectedBoxesCount}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: BLACK, paddingHorizontal: 14, paddingVertical: 14 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: '#fff', opacity: 0.7 },
  stepper: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#EEE' },
  stepItem: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#DDD', alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontWeight: '800', color: '#666' },
  stepLabel: { fontSize: 11, color: '#999', flexShrink: 1 },
  stepLabelActive: { color: BLACK, fontWeight: '700' },
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 10, marginHorizontal: 12, marginTop: 10, borderRadius: 8 },
  errorText: { color: RED, flex: 1, fontWeight: '600' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#999', marginTop: 10 },
  containerCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, alignItems: 'center', gap: 12, borderLeftWidth: 4 },
  refBadge: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', minWidth: 70 },
  refBadgeNum: { fontSize: 24, fontWeight: '900', color: '#fff', lineHeight: 28 },
  refBadgeLbl: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  refCode: { fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },
  subText: { fontSize: 11, color: '#666', marginTop: 2 },
  miniChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start' },
  miniChipText: { fontSize: 10, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, color: BLACK, paddingVertical: 4 },
  weekChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start', borderWidth: 1, backgroundColor: '#FFF' },
  weekChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusChipText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  dayText: { fontSize: 11, color: '#666', fontWeight: '600' },
  banner: { borderWidth: 2, padding: 12, margin: 10, borderRadius: 10 },
  bannerLbl: { fontSize: 11, color: '#666' },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: BLACK, marginTop: 2 },
  bannerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  scanInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: '#DDD', color: BLACK },
  scanIconBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  feedback: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, marginBottom: 6 },
  tracking: { fontFamily: 'monospace', fontWeight: '700', fontSize: 13, color: BLACK },
  subRow: { fontSize: 11, color: '#444', marginTop: 2 },
  subMini: { fontSize: 10, color: '#888' },
  footer: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#EEE' },
  btnPrimary: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: ORANGE },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },
  btnSecondaryText: { color: BLACK, fontWeight: '700', fontSize: 14 },
  resultTitle: { fontSize: 22, fontWeight: '800', color: BLACK, marginTop: 14, textAlign: 'center' },
  resultSub: { color: '#666', marginTop: 4, textAlign: 'center' },
  resultRow: { flexDirection: 'row', gap: 30, marginTop: 24 },
  resultCell: { alignItems: 'center' },
  resultNum: { fontSize: 32, fontWeight: '900' },
  resultLbl: { fontSize: 11, color: '#666', marginTop: 2 },
  cameraClose: { position: 'absolute', right: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dialogBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 400 },
  dialogTitle: { fontSize: 16, fontWeight: '800', color: BLACK },
  dialogText: { fontSize: 13, color: '#333' },

  // Banner: bot\u00f3n imprimir etiquetas
  printBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  printBannerBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, marginLeft: 6 },

  // Modal de etiquetas
  labelsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ORANGE,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  labelsHeaderTitle: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 16 },
  labelsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF8E1',
    borderBottomWidth: 1,
    borderColor: '#FFE082',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  labelsBannerText: { fontSize: 12, color: '#333' },
  toggleAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BLACK,
  },
  toggleAllText: { color: BLACK, fontWeight: '700', fontSize: 12 },
  labelsHint: {
    fontSize: 11,
    color: '#666',
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  labelOrderSn: { fontFamily: 'monospace', fontWeight: '800', fontSize: 14, color: BLACK },
  labelMark: { fontSize: 11, color: '#555', marginTop: 2 },
  labelMeta: { fontSize: 11, color: '#777', marginTop: 2 },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  qtyBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  qtyBtnText: { fontSize: 18, fontWeight: '900', color: BLACK },
  qtyInput: {
    width: 36,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 14,
    color: BLACK,
    paddingVertical: 2,
  },
  qtyTotal: { fontSize: 11, color: '#888', marginRight: 4 },
  labelsFooter: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#EEE',
  },
});
