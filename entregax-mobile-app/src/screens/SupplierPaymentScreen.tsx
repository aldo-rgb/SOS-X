import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert,
  StyleSheet, ActivityIndicator, RefreshControl, Linking, Platform, Modal, Image, ImageBackground, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../services/api';

const { width: SCREEN_W } = Dimensions.get('window');
// Card has margin:12 on each side + padding:16 on each side = 56px total horizontal
const CHART_W = SCREEN_W - 56;
const CHART_H = 90;

const ORANGE = '#F05A28';
const RED = '#C1272D';
const DARK = '#0A0A0A';
const SURFACE = '#161616';
const SURFACE_2 = '#1F1F1F';
const BORDER = '#2A2A2A';
const TEXT = '#FFFFFF';
const TEXT_DIM = '#9CA3AF';
const TEXT_MUTED = '#6B7280';
const GREEN = '#4ADE80';

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

const formatMoney = (value: number | string, decimals = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return decimals > 0 ? `0.${'0'.repeat(decimals)}` : '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const parseApiDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const d = new Date(hasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDateTime = (d: Date | null) => {
  if (!d) return '—';
  return d.toLocaleString('es-MX', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const getPaymentDeadline = (createdAt?: string | null) => {
  const created = parseApiDate(createdAt);
  if (!created) return null;
  return new Date(created.getTime() + 24 * 60 * 60 * 1000);
};

// SVG chart helpers
function buildLinePath(values: number[], w: number, h: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.01;
  const PAD = 6;
  return values.map((v, i) => {
    const x = ((i / (values.length - 1)) * w).toFixed(1);
    const y = (h - PAD - ((v - min) / range) * (h - PAD * 2)).toFixed(1);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
}

function buildAreaPath(values: number[], w: number, h: number): string {
  const line = buildLinePath(values, w, h);
  if (!line) return '';
  return `${line} L${w.toFixed(1)},${h} L0,${h} Z`;
}

function seedRateHistory() {
  const now = Date.now();
  const DAY = 86_400_000;
  let usd = 17.85;
  let rmb = 2.53;
  const result: Array<{ t: number; usd: number; rmb: number }> = [];
  for (let i = 29; i >= 0; i--) {
    usd = Math.max(16.5, Math.min(19.5, usd + (Math.random() - 0.48) * 0.18));
    rmb = Math.max(2.2, Math.min(2.9, rmb + (Math.random() - 0.48) * 0.025));
    result.push({ t: now - i * DAY, usd, rmb });
  }
  return result;
}

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
  payment_deadline_at?: string | null;
  created_at: string;
}

export default function SupplierPaymentScreen({ route, navigation }: any) {
  const { token } = route.params || {};
  const { t } = useTranslation();

  // Existing state
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requiereFactura, setRequiereFactura] = useState(false);
  const [rfc, setRfc] = useState('');
  const [razon, setRazon] = useState('');
  const [regimen, setRegimen] = useState('612');
  const [cp, setCp] = useState('');
  const [uso, setUso] = useState('G03');
  const [email, setEmail] = useState('');
  const [conceptos, setConceptos] = useState('');
  const [monto, setMonto] = useState('');
  const [divisa, setDivisa] = useState<'USD' | 'RMB'>('USD');
  const [savedSuppliers, setSavedSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | 'new'>('new');
  const [saveSupplier, setSaveSupplier] = useState(true);
  const [benefName, setBenefName] = useState('');
  const [benefNameZh, setBenefNameZh] = useState('');
  const [benefAddress, setBenefAddress] = useState('');
  const [benefAccount, setBenefAccount] = useState('');
  const [benefIban, setBenefIban] = useState('');
  const [benefBankName, setBenefBankName] = useState('');
  const [benefBankAddress, setBenefBankAddress] = useState('');
  const [benefSwift, setBenefSwift] = useState('');
  const [benefAba, setBenefAba] = useState('');
  const [benefAlias, setBenefAlias] = useState('');

  type EntProviderPub = {
    id: number; name: string; code: string | null;
    tipo_cambio_usd: number | string; tipo_cambio_rmb: number | string;
    porcentaje_compra: number | string; costo_operacion_usd: number | string;
    bank_accounts: Array<{ currency: string; bank: string; holder: string; account: string; clabe: string; reference: string }>;
    is_default: boolean;
  };

  const [providers, setProviders] = useState<EntProviderPub[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const authHeaders = { Authorization: `Bearer ${token}` };
  const [editingFiscalData, setEditingFiscalData] = useState(false);
  const [editingSupplierData, setEditingSupplierData] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [lastRequestId, setLastRequestId] = useState<number | null>(null);

  // Dashboard state
  const [viewMode, setViewMode] = useState<'dashboard' | 'wizard'>('dashboard');
  const [calcMonto, setCalcMonto] = useState('');
  const [calcDestino, setCalcDestino] = useState<'CN' | 'US'>('CN');
  const [chartTab, setChartTab] = useState<'usd' | 'rmb'>('usd');
  const [rateHistory] = useState<Array<{ t: number; usd: number; rmb: number }>>(seedRateHistory);

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

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/entangled/suppliers`, { headers: authHeaders });
      const data = await res.json();
      setSavedSuppliers(Array.isArray(data) ? data : []);
    } catch {}
  }, [token]);

  const loadPricing = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/entangled/providers`, { headers: authHeaders });
      const data = await res.json();
      const list: EntProviderPub[] = Array.isArray(data) ? data : [];
      setProviders(list);
      const def = list.find(x => x.is_default) || list[0] || null;
      if (def && !selectedProviderId) setSelectedProviderId(def.id);
    } catch {}
  }, [token, selectedProviderId]);

  const loadFiscalProfile = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/entangled/fiscal-profile`, { headers: authHeaders });
      const p = await res.json();
      if (p && p.rfc) {
        setRfc(p.rfc || '');
        setRazon(p.razon_social || '');
        setRegimen(p.regimen_fiscal || '612');
        setCp(p.cp || '');
        setUso(p.uso_cfdi || 'G03');
        setEmail(p.email || '');
        setRequiereFactura(true);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    loadRequests();
    loadSuppliers();
    loadPricing();
    loadFiscalProfile();
  }, [loadRequests, loadSuppliers, loadPricing, loadFiscalProfile]);

  const handlePickSupplier = (id: number | 'new') => {
    setSelectedSupplierId(id);
    setEditingSupplierData(false);
    if (id === 'new') {
      setBenefName(''); setBenefNameZh(''); setBenefAddress('');
      setBenefAccount(''); setBenefIban(''); setBenefBankName('');
      setBenefBankAddress(''); setBenefSwift(''); setBenefAba(''); setBenefAlias('');
      setSaveSupplier(true);
    } else {
      const s = savedSuppliers.find(x => x.id === id);
      if (s) {
        setBenefName(s.nombre_beneficiario || '');
        setBenefNameZh(s.nombre_chino || '');
        setBenefAddress(s.direccion_beneficiario || '');
        setBenefAccount(s.numero_cuenta || '');
        setBenefIban(s.iban || '');
        setBenefBankName(s.banco_nombre || '');
        setBenefBankAddress(s.banco_direccion || '');
        setBenefSwift(s.swift_bic || '');
        setBenefAba(s.aba_routing || '');
        setBenefAlias(s.alias || '');
        if (s.divisa_default) setDivisa(s.divisa_default);
        setSaveSupplier(false);
      }
    }
  };

  const pricing = (() => {
    const p = providers.find(x => x.id === selectedProviderId);
    if (!p) return null;
    return {
      tipo_cambio_usd: Number(p.tipo_cambio_usd),
      tipo_cambio_rmb: Number(p.tipo_cambio_rmb),
      porcentaje_compra: Number(p.porcentaje_compra),
      costo_operacion_usd: Number(p.costo_operacion_usd || 0),
    };
  })();

  const quote = (() => {
    const m = parseFloat(monto);
    if (!pricing || !m || m <= 0) return null;
    const tc = divisa === 'RMB' ? pricing.tipo_cambio_rmb : pricing.tipo_cambio_usd;
    const base = m * tc;
    const comision = base * (pricing.porcentaje_compra / 100);
    const costoOpMxn = (pricing.costo_operacion_usd || 0) * tc;
    const total = base + comision + costoOpMxn;
    return {
      tipo_cambio: tc, porcentaje_compra: pricing.porcentaje_compra,
      costo_operacion_usd: pricing.costo_operacion_usd,
      monto_mxn_base: base, monto_mxn_comision: comision,
      monto_mxn_costo_op: costoOpMxn, monto_mxn_total: total,
    };
  })();

  const defaultProvider = providers.find(x => x.is_default) || providers[0] || null;

  const calcQuote = (() => {
    const m = parseFloat(calcMonto);
    if (!defaultProvider || !m || m <= 0) return null;
    const tc = calcDestino === 'CN'
      ? Number(defaultProvider.tipo_cambio_rmb)
      : Number(defaultProvider.tipo_cambio_usd);
    const pct = Number(defaultProvider.porcentaje_compra);
    const costoOpMxn = Number(defaultProvider.costo_operacion_usd || 0) * tc;
    const base = m * tc;
    const comision = base * (pct / 100);
    return { tc, total: base + comision + costoOpMxn, divisa: calcDestino === 'CN' ? 'RMB' : 'USD' };
  })();

  // Chart data
  const chartValues = chartTab === 'usd' ? rateHistory.map(r => r.usd) : rateHistory.map(r => r.rmb);
  const currentRate = defaultProvider
    ? (chartTab === 'usd' ? Number(defaultProvider.tipo_cambio_usd) : Number(defaultProvider.tipo_cambio_rmb))
    : chartValues[chartValues.length - 1] ?? 0;
  const seedPrevVal = chartValues[chartValues.length - 2] ?? currentRate;
  const rateDelta = currentRate - seedPrevVal;

  const lastCircleY = (() => {
    if (chartValues.length < 2) return CHART_H / 2;
    const min = Math.min(...chartValues);
    const max = Math.max(...chartValues);
    const range = max - min || 0.01;
    const PAD = 6;
    return CHART_H - PAD - ((chartValues[chartValues.length - 1] - min) / range) * (CHART_H - PAD * 2);
  })();

  const submit = async () => {
    if (!monto || parseFloat(monto) <= 0) { Alert.alert('Faltan datos', 'Captura el monto'); return; }
    if (requiereFactura && (!rfc || !razon || !cp || !email)) {
      Alert.alert('Faltan datos', 'Completa todos los datos fiscales para generar factura'); return;
    }
    if (!benefName || !benefAccount || !benefBankName) {
      Alert.alert('Faltan datos', 'Completa beneficiario, número de cuenta y banco del proveedor de envío'); return;
    }
    if (!selectedProviderId) { Alert.alert('Falta proveedor', 'Selecciona un proveedor ENTANGLED'); return; }
    if (divisa === 'RMB' && !benefNameZh) {
      Alert.alert('Faltan datos', 'Para envíos en RMB se requiere el nombre del beneficiario en chino'); return;
    }
    setSubmitting(true);
    try {
      let supplierId: number | undefined = selectedSupplierId !== 'new' ? Number(selectedSupplierId) : undefined;
      if (selectedSupplierId === 'new' && saveSupplier) {
        try {
          const r = await fetch(`${API_URL}/api/entangled/suppliers`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alias: benefAlias || benefName, nombre_beneficiario: benefName,
              nombre_chino: benefNameZh, direccion_beneficiario: benefAddress,
              numero_cuenta: benefAccount, iban: benefIban, banco_nombre: benefBankName,
              banco_direccion: benefBankAddress, swift_bic: benefSwift,
              aba_routing: benefAba, divisa_default: divisa,
            }),
          });
          const sd = await r.json();
          if (sd?.id) supplierId = sd.id;
        } catch {}
      }
      const payload: any = {
        requiere_factura: requiereFactura, provider_id: selectedProviderId,
        operacion: {
          montos: parseFloat(monto), divisa_destino: divisa,
          conceptos: requiereFactura ? conceptos.split(',').map(s => s.trim()).filter(Boolean) : [],
        },
        proveedor_envio: {
          supplier_id: supplierId || null, nombre_beneficiario: benefName,
          nombre_chino: benefNameZh, direccion_beneficiario: benefAddress,
          numero_cuenta: benefAccount, iban: benefIban, banco_nombre: benefBankName,
          banco_direccion: benefBankAddress, swift_bic: benefSwift, aba_routing: benefAba,
        },
      };
      if (requiereFactura) {
        payload.cliente_final = { rfc, razon_social: razon, regimen_fiscal: regimen, cp, uso_cfdi: uso, email };
      }
      const res = await fetch(`${API_URL}/api/entangled/payment-requests`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setLastRequestId(Number(data?.id || data?.data?.id || 0) || null);
        setSuccessModalVisible(true);
        setMonto(''); setConceptos('');
        setBenefName(''); setBenefNameZh(''); setBenefAddress('');
        setBenefAccount(''); setBenefIban(''); setBenefBankName('');
        setBenefBankAddress(''); setBenefSwift(''); setBenefAba(''); setBenefAlias('');
        setSelectedSupplierId('new');
        setEditingFiscalData(false); setEditingSupplierData(false); setWizardStep(1);
        loadRequests(); loadSuppliers();
        setViewMode('dashboard');
      } else {
        Alert.alert('Error', data?.error || 'No se pudo crear la solicitud');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error de red');
    }
    setSubmitting(false);
  };

  const validateWizardStep = (step: 1 | 2 | 3 | 4): string | null => {
    if (step === 1) {
      if (!selectedProviderId) return 'Selecciona un proveedor ENTANGLED';
      if (!monto || parseFloat(monto) <= 0) return 'Captura un monto válido';
      if (!quote) return 'No se pudo calcular la cotización';
      return null;
    }
    if (step === 2) {
      if (!benefName || !benefAccount || !benefBankName) return 'Completa beneficiario, número de cuenta y banco';
      if (divisa === 'RMB' && !benefNameZh) return 'Para RMB se requiere nombre en chino';
      return null;
    }
    if (step === 3 && requiereFactura && (!rfc || !razon || !cp || !email)) {
      return 'Completa todos los datos fiscales para generar factura';
    }
    return null;
  };

  const goNextStep = () => {
    const err = validateWizardStep(wizardStep);
    if (err) { Alert.alert('Faltan datos', err); return; }
    setWizardStep((s) => (s === 1 ? 2 : s === 2 ? 3 : s === 3 ? 4 : 4));
  };

  const statusColor = (s: string) => {
    if (['completado', 'emitida', 'enviado', 'pagado'].includes(s)) return ORANGE;
    if (['en_proceso', 'pendiente'].includes(s)) return '#f59e0b';
    if (['rechazado', 'error_envio', 'error'].includes(s)) return '#dc2626';
    if (['cancelado'].includes(s)) return '#6B7280';
    return '#64748b';
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <ScrollView
      style={{ flex: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadRequests(); loadPricing(); }}
          tintColor={ORANGE} colors={[ORANGE]} progressBackgroundColor={SURFACE}
        />
      }
    >
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <ImageBackground
        source={require('../../assets/mapamundi2.png')}
        style={styles.hero}
        imageStyle={{ opacity: 0.18, resizeMode: 'cover' }}
      >
        <LinearGradient
          colors={['rgba(19,19,26,0.55)', 'rgba(10,10,15,0.82)', 'rgba(16,8,8,0.92)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.hudCorner, { top: 12, left: 12, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: ORANGE }]} />
        <View style={[styles.hudCorner, { top: 12, right: 12, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: ORANGE }]} />
        <View style={[styles.hudCorner, { bottom: 12, left: 12, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderColor: RED }]} />
        <View style={[styles.hudCorner, { bottom: 12, right: 12, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: RED }]} />

        <Image
          source={require('../../assets/logo-completo-xpay.png')}
          style={{ width: 140, height: 48, resizeMode: 'contain', marginBottom: 14 }}
        />
        <Text style={styles.heroTagline}>ENVÍOS DE DINERO SEGUROS</Text>
        <Text style={[styles.heroTagline, { opacity: 0.7, marginTop: 2 }]}>A CHINA Y ESTADOS UNIDOS</Text>
        <View style={styles.heroAccent}>
          <View style={{ width: 32, height: 3, backgroundColor: ORANGE, borderRadius: 2 }} />
          <View style={{ width: 16, height: 3, backgroundColor: RED, borderRadius: 2 }} />
        </View>
      </ImageBackground>

      {/* ── Calculator ───────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.iconBadge}>
              <Ionicons name="calculator-outline" size={14} color={ORANGE} />
            </View>
            <Text style={styles.sectionTitle}>Calculadora</Text>
          </View>
          {defaultProvider ? (
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE · {defaultProvider.name}</Text>
            </View>
          ) : (
            <ActivityIndicator size="small" color={ORANGE} />
          )}
        </View>

        <Text style={styles.label}>País de Destino</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {[
            { code: 'CN', label: '🇨🇳 China' },
            { code: 'US', label: '🇺🇸 USA' },
          ].map(({ code, label }) => (
            <TouchableOpacity
              key={code}
              style={[styles.destChip, calcDestino === code && styles.destChipActive, { flex: 1 }]}
              onPress={() => setCalcDestino(code as 'CN' | 'US')}
            >
              <Text style={[styles.destChipText, calcDestino === code && styles.destChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Monto a Enviar (USD)</Text>
        <View style={styles.amountRow}>
          <Text style={styles.amountDollar}>$</Text>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={calcMonto}
            onChangeText={setCalcMonto}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={TEXT_MUTED}
          />
          <View style={styles.amountSuffixBadge}>
            <Text style={styles.amountSuffixText}>{calcDestino === 'CN' ? 'RMB' : 'USD'}</Text>
          </View>
        </View>

        <View style={[styles.totalBox, calcQuote && { borderColor: `${ORANGE}60` }]}>
          <Text style={styles.totalLabel}>Total estimado en MXN</Text>
          <Text style={[styles.totalValue, !calcQuote && { color: TEXT_MUTED }]}>
            {calcQuote ? `$${formatMoney(calcQuote.total, 2)}` : '—'}
          </Text>
          <Text style={styles.totalTc}>
            {calcQuote
              ? `TC: $${formatMoney(calcQuote.tc, 4)} MXN/${calcQuote.divisa}`
              : defaultProvider
                ? `TC USD: $${formatMoney(Number(defaultProvider.tipo_cambio_usd), 4)} · TC RMB: $${formatMoney(Number(defaultProvider.tipo_cambio_rmb), 4)}`
                : 'Cargando tasas...'}
          </Text>
        </View>

        {calcQuote && (
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => {
              setMonto(calcMonto);
              setDivisa(calcDestino === 'CN' ? 'RMB' : 'USD');
              if (defaultProvider) setSelectedProviderId(defaultProvider.id);
              setWizardStep(1);
              setViewMode('wizard');
            }}
          >
            <Ionicons name="paper-plane-outline" size={15} color="#fff" />
            <Text style={styles.ctaBtnText}>CREAR NUEVO ENVÍO</Text>
            <Ionicons name="arrow-forward" size={15} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.manageBtn}
          onPress={() => { setWizardStep(2); setViewMode('wizard'); }}
        >
          <Ionicons name="people-outline" size={13} color={TEXT_MUTED} />
          <Text style={styles.manageBtnText}>Gestionar proveedores guardados</Text>
          <Ionicons name="chevron-forward" size={13} color={TEXT_MUTED} />
        </TouchableOpacity>
      </View>

      {/* ── Rate Chart ───────────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.iconBadge}>
              <Ionicons name="trending-up-outline" size={14} color={ORANGE} />
            </View>
            <Text style={styles.sectionTitle}>Tipo de cambio</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['usd', 'rmb'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabBtn, chartTab === tab && styles.tabBtnActive]}
                onPress={() => setChartTab(tab)}
              >
                <Text style={[styles.tabBtnText, chartTab === tab && styles.tabBtnTextActive]}>
                  {tab.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
          <Text style={{ color: TEXT, fontSize: 26, fontWeight: '900', letterSpacing: 0.5 }}>
            ${currentRate.toFixed(4)}
          </Text>
          <Text style={{ color: TEXT_MUTED, fontSize: 12 }}>MXN/{chartTab.toUpperCase()}</Text>
          <View style={[styles.deltaBadge, {
            backgroundColor: rateDelta >= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.12)',
            borderColor: rateDelta >= 0 ? 'rgba(74,222,128,0.25)' : 'rgba(239,68,68,0.25)',
          }]}>
            <Text style={{ color: rateDelta >= 0 ? GREEN : '#EF4444', fontSize: 11, fontWeight: '700' }}>
              {rateDelta >= 0 ? '+' : ''}{rateDelta.toFixed(4)}
            </Text>
          </View>
        </View>

        <Svg width={CHART_W} height={CHART_H}>
          <Defs>
            <SvgGradient id="cg" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={ORANGE} stopOpacity="0.28" />
              <Stop offset="100%" stopColor={ORANGE} stopOpacity="0.01" />
            </SvgGradient>
          </Defs>
          <Path d={buildAreaPath(chartValues, CHART_W, CHART_H)} fill="url(#cg)" />
          <Path
            d={buildLinePath(chartValues, CHART_W, CHART_H)}
            stroke={ORANGE}
            strokeWidth={1.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={CHART_W} cy={lastCircleY} r={4} fill={ORANGE} />
        </Svg>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: TEXT_MUTED, fontSize: 10 }}>30 días atrás</Text>
          <Text style={{ color: TEXT_MUTED, fontSize: 10 }}>Hoy</Text>
        </View>
      </View>

      {/* ── Recent Requests ──────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <View style={styles.iconBadge}>
            <Ionicons name="time-outline" size={14} color={ORANGE} />
          </View>
          <Text style={styles.sectionTitle}>Últimos envíos</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={ORANGE} style={{ marginVertical: 24 }} />
        ) : requests.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name="paper-plane-outline" size={36} color={BORDER} />
            <Text style={{ color: TEXT_MUTED, fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 20 }}>
              No tienes solicitudes aún.{'\n'}Usa la calculadora para crear tu primer envío.
            </Text>
          </View>
        ) : (
          requests.map((r, idx) => {
            const deadline = parseApiDate(r.payment_deadline_at) || getPaymentDeadline(r.created_at);
            const isActive = ['pendiente', 'en_proceso', 'error_envio'].includes(String(r.estatus_global || '').toLowerCase());
            const sc = statusColor(r.estatus_global);
            return (
              <View key={r.id} style={[styles.requestItem, idx === requests.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ color: TEXT_MUTED, fontSize: 10, letterSpacing: 0.6, fontWeight: '600' }}>
                      #{r.id} · {r.cf_rfc}
                    </Text>
                    <Text style={{ color: TEXT, fontWeight: '700', fontSize: 14, marginTop: 3 }} numberOfLines={1}>
                      {r.cf_razon_social}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${sc}18`, borderColor: `${sc}45` }]}>
                    <Text style={[styles.statusBadgeText, { color: sc }]}>
                      {(r.estatus_global || '-').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: ORANGE, fontWeight: '900', fontSize: 22, marginTop: 8, letterSpacing: 0.3 }}>
                  {Number(r.op_monto).toLocaleString()} {r.op_divisa_destino}
                </Text>

                {isActive && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="time-outline" size={11} color="#FBBF24" />
                    <Text style={{ color: '#FBBF24', fontSize: 10, fontWeight: '700' }}>
                      Vence: {formatDateTime(deadline)}
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <View style={[styles.statusPill, { borderColor: `${statusColor(r.estatus_factura)}60` }]}>
                    <Text style={[styles.statusPillText, { color: statusColor(r.estatus_factura) }]}>
                      Factura: {r.estatus_factura || '-'}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { borderColor: `${statusColor(r.estatus_proveedor)}60` }]}>
                    <Text style={[styles.statusPillText, { color: statusColor(r.estatus_proveedor) }]}>
                      Proveedor: {r.estatus_proveedor || '-'}
                    </Text>
                  </View>
                </View>

                {(r.factura_url || r.comprobante_proveedor_url) && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {r.factura_url && (
                      <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(r.factura_url!)}>
                        <Ionicons name="receipt-outline" size={13} color="#60A5FA" />
                        <Text style={styles.linkText}>Factura</Text>
                      </TouchableOpacity>
                    )}
                    {r.comprobante_proveedor_url && (
                      <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(r.comprobante_proveedor_url!)}>
                        <Ionicons name="checkmark-done-outline" size={13} color={ORANGE} />
                        <Text style={[styles.linkText, { color: ORANGE }]}>Comprobante</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderWizard = () => (
    <ScrollView style={{ flex: 1 }}>
      <TouchableOpacity style={styles.backToDashBtn} onPress={() => setViewMode('dashboard')}>
        <Ionicons name="arrow-back" size={13} color={TEXT_MUTED} />
        <Text style={styles.backToDashText}>Volver al inicio</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.iconBadge}><Ionicons name="paper-plane" size={14} color={ORANGE} /></View>
          <Text style={styles.sectionTitle}>{t('xpay.newRequest', 'Nueva solicitud')}</Text>
        </View>

        <View style={styles.stepRow}>
          {([
            { id: 1 as const, label: '1. Monto' },
            { id: 2 as const, label: '2. Beneficiario' },
            { id: 3 as const, label: '3. Factura' },
            { id: 4 as const, label: '4. Resumen' },
          ] as const).map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.stepPill, wizardStep === s.id && styles.stepPillActive]}
              onPress={() => setWizardStep(s.id)}
            >
              <Text style={[styles.stepPillText, wizardStep === s.id && styles.stepPillTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Step 1: Monto */}
        {wizardStep === 1 && (
          <>
            <Text style={[styles.sectionTitle, { fontSize: 13, marginTop: 16, marginBottom: 10 }]}>
              💵 {t('xpay.amountSection', 'Monto a enviar')}
            </Text>


            <Text style={styles.label}>{t('entangled.fields.amount', 'Monto')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: ORANGE, marginRight: 4 }}>$</Text>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={monto}
                onChangeText={setMonto}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={TEXT_MUTED}
              />
            </View>

            <Text style={styles.label}>{t('entangled.fields.currency', 'Divisa')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              {DIVISAS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, divisa === d && styles.chipActive]}
                  onPress={() => setDivisa(d as 'USD' | 'RMB')}
                >
                  <Text style={[styles.chipText, divisa === d && styles.chipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {quote && (
              <View style={styles.quoteBox}>
                <Text style={styles.quoteTitle}>{t('xpay.quoteTitle', 'Cotización')}</Text>
                <Text style={styles.quoteLine}>
                  {t('xpay.quoteAmountToSend', 'Monto a enviar')}: <Text style={styles.quoteVal}>${formatMoney(monto, 0)} {divisa}</Text>
                </Text>
                <Text style={styles.quoteLine}>
                  {t('xpay.quoteFxRate', 'T/C')}: <Text style={styles.quoteVal}>${formatMoney(quote.tipo_cambio, 4)} MXN/{divisa}</Text>
                </Text>
                <Text style={styles.quoteLine}>
                  {t('xpay.quoteSubtotalMxn', 'Subtotal')}: <Text style={styles.quoteVal}>${formatMoney(quote.monto_mxn_base, 2)}</Text>
                </Text>
                <Text style={styles.quoteLine}>
                  {t('xpay.quoteCommission', 'Comisión')} ({quote.porcentaje_compra}%): <Text style={styles.quoteVal}>${formatMoney(quote.monto_mxn_comision, 2)}</Text>
                </Text>
                {quote.monto_mxn_costo_op > 0 && (
                  <Text style={styles.quoteLine}>
                    {t('xpay.quoteOpCost', 'Costo op.')} ({formatMoney(quote.costo_operacion_usd, 0)} USD): <Text style={styles.quoteVal}>${formatMoney(quote.monto_mxn_costo_op, 2)}</Text>
                  </Text>
                )}
                <View style={styles.quoteDivider} />
                <Text style={styles.quoteTotal}>
                  {t('xpay.quoteTotalToPay', 'Total a pagar')}: ${formatMoney(quote.monto_mxn_total, 2)} MXN
                </Text>
              </View>
            )}
          </>
        )}

        {/* Step 2: Beneficiario */}
        {wizardStep === 2 && (
          <>
            <Text style={[styles.sectionTitle, { fontSize: 13, marginTop: 16, marginBottom: 10 }]}>
              🏦 {t('xpay.supplierSection', 'Proveedor de envío')}
            </Text>

            {savedSuppliers.length > 0 && (
              <>
                <Text style={styles.label}>{t('xpay.supplierLabel', 'Proveedor guardado')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <TouchableOpacity
                    style={[styles.chip, selectedSupplierId === 'new' && styles.chipActive]}
                    onPress={() => handlePickSupplier('new')}
                  >
                    <Text style={[styles.chipText, selectedSupplierId === 'new' && styles.chipTextActive]}>
                      {t('xpay.newSupplier', '+ Nuevo')}
                    </Text>
                  </TouchableOpacity>
                  {savedSuppliers.map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.chip, selectedSupplierId === s.id && styles.chipActive]}
                      onPress={() => handlePickSupplier(s.id)}
                    >
                      <Text style={[styles.chipText, selectedSupplierId === s.id && styles.chipTextActive]}>
                        {s.is_favorite ? '★ ' : ''}{s.alias || s.nombre_beneficiario}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {selectedSupplierId !== 'new' && savedSuppliers.find(s => s.id === selectedSupplierId) && !editingSupplierData && (
                  <View style={styles.infoCardOrange}>
                    <Text style={styles.infoCardTitleOrange}>✅ {t('xpay.supplierSelected', 'Proveedor seleccionado')}</Text>
                    <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>{t('xpay.beneficiary', 'Beneficiario')}:</Text> {savedSuppliers.find(s => s.id === selectedSupplierId)?.nombre_beneficiario}</Text>
                    {savedSuppliers.find(s => s.id === selectedSupplierId)?.banco_nombre && (
                      <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>{t('xpay.bank', 'Banco')}:</Text> {savedSuppliers.find(s => s.id === selectedSupplierId)?.banco_nombre}</Text>
                    )}
                    <TouchableOpacity onPress={() => setEditingSupplierData(true)} style={{ marginTop: 6 }}>
                      <Text style={styles.editLink}>✏️ {t('xpay.editData', 'Editar')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {(selectedSupplierId === 'new' || editingSupplierData) && (
              <>
                <Text style={styles.label}>{t('xpay.beneficiaryName', 'Nombre del beneficiario')}</Text>
                <TextInput style={styles.input} value={benefName} onChangeText={setBenefName} />

                {divisa === 'RMB' && (
                  <>
                    <Text style={styles.label}>{t('xpay.chineseName', 'Nombre en chino')}</Text>
                    <TextInput style={styles.input} value={benefNameZh} onChangeText={setBenefNameZh} />
                  </>
                )}

                <Text style={styles.label}>{t('xpay.beneficiaryAddress', 'Dirección del beneficiario')}</Text>
                <TextInput style={styles.input} value={benefAddress} onChangeText={setBenefAddress} />

                <Text style={styles.label}>{t('xpay.accountNumber', 'Número de cuenta')}</Text>
                <TextInput style={styles.input} value={benefAccount} onChangeText={setBenefAccount} />

                <Text style={styles.label}>{t('xpay.bankName', 'Nombre del banco')}</Text>
                <TextInput style={styles.input} value={benefBankName} onChangeText={setBenefBankName} />

                <Text style={styles.label}>{t('xpay.bankAddress', 'Dirección del banco')}</Text>
                <TextInput style={styles.input} value={benefBankAddress} onChangeText={setBenefBankAddress} />

                <Text style={styles.label}>{t('xpay.swift', 'SWIFT/BIC')}</Text>
                <TextInput style={styles.input} value={benefSwift} onChangeText={setBenefSwift} autoCapitalize="characters" />

                <Text style={styles.label}>{t('xpay.aba', 'ABA/Routing')}</Text>
                <TextInput style={styles.input} value={benefAba} onChangeText={setBenefAba} keyboardType="numeric" />

                <Text style={styles.label}>{t('xpay.aliasOptional', 'Alias (opcional)')}</Text>
                <TextInput style={styles.input} value={benefAlias} onChangeText={setBenefAlias} />

                {selectedSupplierId === 'new' && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}
                    onPress={() => setSaveSupplier(s => !s)}
                  >
                    <Ionicons name={saveSupplier ? 'checkbox' : 'square-outline'} size={20} color={ORANGE} />
                    <Text style={{ marginLeft: 8, color: TEXT_DIM, fontSize: 13 }}>
                      {t('xpay.saveSupplierFuture', 'Guardar para futuros envíos')}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}

        {/* Step 3: Factura */}
        {wizardStep === 3 && (
          <>
            <Text style={styles.label}>🧾 {t('xpay.invoiceQuestion', '¿Requieres factura?')}</Text>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <TouchableOpacity style={[styles.chip, !requiereFactura && styles.chipActive]} onPress={() => setRequiereFactura(false)}>
                <Text style={[styles.chipText, !requiereFactura && styles.chipTextActive]}>{t('xpay.invoiceNo', 'No')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, requiereFactura && styles.chipActive]} onPress={() => setRequiereFactura(true)}>
                <Text style={[styles.chipText, requiereFactura && styles.chipTextActive]}>{t('xpay.invoiceYes', 'Sí')}</Text>
              </TouchableOpacity>
            </View>

            {requiereFactura && (
              <>
                {rfc && razon && !editingFiscalData ? (
                  <View style={styles.infoCardSuccess}>
                    <Text style={styles.infoCardTitleSuccess}>✅ {t('xpay.fiscalLoaded', 'Datos fiscales cargados')}</Text>
                    <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>Razón Social:</Text> {razon}</Text>
                    <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>RFC:</Text> {rfc}</Text>
                    <Text style={[styles.infoCardLine, { marginBottom: 8 }]}><Text style={styles.infoCardLineLabel}>CP:</Text> {cp}</Text>
                    <TouchableOpacity onPress={() => setEditingFiscalData(true)}>
                      <Text style={styles.editLink}>✏️ {t('xpay.editData', 'Editar')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.sectionTitle, { fontSize: 13, marginTop: 10, marginBottom: 10 }]}>📋 Datos Fiscales</Text>

                    <Text style={styles.label}>{t('entangled.fields.rfc', 'RFC')}</Text>
                    <TextInput style={styles.input} value={rfc} onChangeText={v => setRfc(v.toUpperCase())} autoCapitalize="characters" />

                    <Text style={styles.label}>{t('entangled.fields.razonSocial', 'Razón Social')}</Text>
                    <TextInput style={styles.input} value={razon} onChangeText={setRazon} />

                    <Text style={styles.label}>{t('entangled.fields.regimenFiscal', 'Régimen Fiscal')}</Text>
                    <View style={styles.chipScroll}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {REGIMENES.map(r => (
                          <TouchableOpacity key={r.code} style={[styles.chip, regimen === r.code && styles.chipActive]} onPress={() => setRegimen(r.code)}>
                            <View>
                              <Text style={[styles.chipText, regimen === r.code && styles.chipTextActive, { fontWeight: '600' }]}>{r.code}</Text>
                              <Text style={[styles.chipText, regimen === r.code && styles.chipTextActive, { fontSize: 10 }]}>{r.name.slice(0, 20)}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>

                    <Text style={styles.label}>{t('entangled.fields.cp', 'Código Postal')}</Text>
                    <TextInput style={styles.input} value={cp} onChangeText={setCp} keyboardType="numeric" maxLength={5} />

                    <Text style={styles.label}>{t('entangled.fields.usoCfdi', 'Uso CFDI')}</Text>
                    <View style={styles.chipScroll}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {USOS_CFDI.map(u => (
                          <TouchableOpacity key={u.code} style={[styles.chip, uso === u.code && styles.chipActive]} onPress={() => setUso(u.code)}>
                            <View>
                              <Text style={[styles.chipText, uso === u.code && styles.chipTextActive, { fontWeight: '600' }]}>{u.code}</Text>
                              <Text style={[styles.chipText, uso === u.code && styles.chipTextActive, { fontSize: 10 }]}>{u.name.slice(0, 20)}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>

                    <Text style={styles.label}>{t('entangled.fields.email', 'Email')}</Text>
                    <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

                    <Text style={styles.label}>{t('entangled.fields.concepts', 'Conceptos SAT')} {t('xpay.conceptsHelp', '(códigos separados por coma)')}</Text>
                    <TextInput style={styles.input} value={conceptos} onChangeText={setConceptos} placeholder="84111506, 90121800" placeholderTextColor={TEXT_MUTED} />
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Step 4: Resumen */}
        {wizardStep === 4 && (
          <View style={styles.quoteBox}>
            <Text style={styles.quoteTitle}>✅ Resumen total</Text>
            <Text style={styles.quoteLine}>Divisa: <Text style={styles.quoteVal}>{divisa}</Text></Text>
            <Text style={styles.quoteLine}>Monto al proveedor: <Text style={styles.quoteVal}>${formatMoney(monto || 0, 2)} {divisa}</Text></Text>
            <Text style={styles.quoteLine}>Proveedor ENTANGLED: <Text style={styles.quoteVal}>{providers.find((x) => x.id === selectedProviderId)?.name || '-'}</Text></Text>
            <Text style={styles.quoteLine}>Beneficiario: <Text style={styles.quoteVal}>{benefName || '-'}</Text></Text>
            <Text style={styles.quoteLine}>Factura: <Text style={styles.quoteVal}>{requiereFactura ? 'Sí' : 'No'}</Text></Text>
            {requiereFactura && (
              <Text style={styles.quoteLine}>RFC: <Text style={styles.quoteVal}>{rfc || '-'}</Text></Text>
            )}
            {quote && (
              <>
                <View style={styles.quoteDivider} />
                <Text style={styles.quoteLine}>Tipo de cambio: <Text style={styles.quoteVal}>${formatMoney(quote.tipo_cambio, 4)} MXN/{divisa}</Text></Text>
                <Text style={styles.quoteLine}>Comisión: <Text style={styles.quoteVal}>${formatMoney(quote.monto_mxn_comision, 2)} MXN</Text></Text>
                <Text style={styles.quoteTotal}>Total: ${formatMoney(quote.monto_mxn_total, 2)} MXN</Text>
              </>
            )}
          </View>
        )}

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={14} color="#93C5FD" style={{ marginRight: 6 }} />
          <Text style={[styles.infoBannerText, { flex: 1 }]}>{t('xpay.proofLater', 'El comprobante se sube después de recibir las instrucciones de pago.')}</Text>
        </View>

        <View style={styles.wizardActionsRow}>
          {wizardStep > 1 && (
            <TouchableOpacity
              style={[styles.navBtn, styles.navBtnGhost]}
              onPress={() => setWizardStep((s) => (s === 4 ? 3 : s === 3 ? 2 : s === 2 ? 1 : 1))}
            >
              <Text style={styles.navBtnGhostText}>{t('common.back', 'Atrás')}</Text>
            </TouchableOpacity>
          )}
          {wizardStep < 4 ? (
            <TouchableOpacity style={[styles.navBtn, styles.navBtnNext]} onPress={goNextStep}>
              <Text style={styles.navBtnNextText}>{t('common.next', 'Siguiente')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, (!quote || submitting) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={submitting || !quote}
            >
              {submitting
                ? <ActivityIndicator color="white" />
                : <Text style={styles.submitText}>{t('entangled.actions.submit', 'Enviar solicitud')}</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: DARK }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => viewMode === 'wizard' ? setViewMode('dashboard') : navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerEyebrow}>Portal Seguro</Text>
          <Image
            source={require('../../assets/logo-completo-xpay.png')}
            style={{ width: 80, height: 28, resizeMode: 'contain' }}
          />
          <View style={styles.headerDividerRow}>
            <View style={styles.headerDividerOrange} />
            <View style={styles.headerDividerRed} />
          </View>
        </View>
        <View style={styles.headerLockBadge}>
          <Ionicons name="lock-closed" size={12} color={ORANGE} />
        </View>
      </View>

      {viewMode === 'dashboard' ? renderDashboard() : renderWizard()}

      {/* Success Modal */}
      <Modal
        visible={successModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </View>
            <Text style={styles.successTitle}>{t('xpay.requestCreatedTitle', '¡Solicitud creada!')}</Text>
            <Text style={styles.successMessage}>{t('xpay.requestCreatedMessage', 'Tu solicitud fue registrada. Recibirás instrucciones de pago a la brevedad.')}</Text>
            {!!lastRequestId && (
              <View style={styles.successRefPill}>
                <Text style={styles.successRefText}>#{lastRequestId}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.successBtn} onPress={() => setSuccessModalVisible(false)}>
              <Text style={styles.successBtnText}>{t('common.ok', 'Aceptar')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#000',
    paddingHorizontal: 16, paddingBottom: 14,
    paddingTop: Platform.OS === 'ios' ? 50 : 24,
    borderBottomWidth: 2, borderBottomColor: ORANGE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0F0F0F',
  },
  headerEyebrow: { color: TEXT_MUTED, fontSize: 10, letterSpacing: 3, fontWeight: '600' },
  headerDividerRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  headerDividerOrange: { width: 24, height: 3, backgroundColor: ORANGE, borderRadius: 2 },
  headerDividerRed: { width: 12, height: 3, backgroundColor: RED, borderRadius: 2 },
  headerLockBadge: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderColor: ORANGE,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(240,90,40,0.1)',
  },
  // Hero
  hero: {
    margin: 12, borderRadius: 16,
    padding: 28, alignItems: 'center',
    borderWidth: 1, borderColor: '#222',
    overflow: 'hidden', position: 'relative',
  },
  hudCorner: {
    position: 'absolute', width: 18, height: 18,
    borderColor: ORANGE,
  },
  heroTagline: {
    color: 'rgba(255,255,255,0.7)', fontSize: 11,
    fontWeight: '700', letterSpacing: 2, textAlign: 'center',
  },
  heroAccent: { flexDirection: 'row', gap: 6, marginTop: 12 },
  heroBadge: {
    paddingVertical: 5, paddingHorizontal: 14,
    borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(240,90,40,0.4)',
    backgroundColor: 'rgba(240,90,40,0.1)',
  },
  heroBadgeText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  // Card
  card: {
    backgroundColor: SURFACE, margin: 12, marginTop: 0,
    padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: TEXT, letterSpacing: 0.3 },
  iconBadge: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: 'rgba(240,90,40,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Live chip
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: 999, backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)',
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: GREEN,
  },
  liveText: { color: GREEN, fontSize: 10, fontWeight: '700' },
  // Destination chips
  destChip: {
    alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE_2,
  },
  destChipActive: {
    borderColor: ORANGE, backgroundColor: 'rgba(240,90,40,0.16)',
  },
  destChipText: { color: TEXT_DIM, fontSize: 13, fontWeight: '700' },
  destChipTextActive: { color: TEXT },
  destChipSub: { color: TEXT_MUTED, fontSize: 10, marginTop: 2 },
  // Amount row
  amountRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, backgroundColor: SURFACE_2,
    paddingHorizontal: 12, marginBottom: 14, height: 48,
  },
  amountDollar: { color: ORANGE, fontSize: 18, fontWeight: '700', marginRight: 6 },
  amountSuffixBadge: {
    paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: 6, backgroundColor: 'rgba(240,90,40,0.12)',
    marginLeft: 6,
  },
  amountSuffixText: { color: ORANGE, fontSize: 11, fontWeight: '700' },
  // Total box
  totalBox: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    backgroundColor: '#0F0F14', padding: 14, marginBottom: 14,
  },
  totalLabel: { color: TEXT_MUTED, fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  totalValue: { color: TEXT, fontSize: 22, fontWeight: '900', letterSpacing: 0.3 },
  totalTc: { color: TEXT_MUTED, fontSize: 11, marginTop: 4 },
  // CTA button
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: ORANGE, borderRadius: 12,
    paddingVertical: 14, marginBottom: 12,
    shadowColor: ORANGE, shadowOpacity: 0.4,
    shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  ctaBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  // Manage button
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    backgroundColor: 'transparent',
  },
  manageBtnText: { color: TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  // Chart tabs
  tabBtn: {
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE_2,
  },
  tabBtnActive: { borderColor: ORANGE, backgroundColor: 'rgba(240,90,40,0.14)' },
  tabBtnText: { color: TEXT_MUTED, fontSize: 11, fontWeight: '700' },
  tabBtnTextActive: { color: ORANGE },
  // Delta badge
  deltaBadge: {
    paddingVertical: 2, paddingHorizontal: 7,
    borderRadius: 8, borderWidth: 1,
  },
  // Back to dashboard
  backToDashBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    margin: 12, marginBottom: 0,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE_2, alignSelf: 'flex-start',
  },
  backToDashText: { color: TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  // Status
  statusBadge: {
    paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: 8, borderWidth: 1,
  },
  statusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  // Wizard form
  label: { fontSize: 12, color: TEXT_DIM, marginBottom: 6, marginTop: 10, letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12,
    fontSize: 14, backgroundColor: SURFACE_2, color: TEXT, marginBottom: 0,
  },
  chip: {
    borderWidth: 1, borderColor: BORDER, paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 18, marginRight: 6, backgroundColor: SURFACE_2,
  },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontSize: 12, color: TEXT_DIM, fontWeight: '500' },
  chipTextActive: { color: '#FFF', fontWeight: '700' },
  chipScroll: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 8,
    marginBottom: 12, backgroundColor: SURFACE_2,
    paddingHorizontal: 4, paddingVertical: 4,
  },
  stepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  stepPill: {
    borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE_2,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
  },
  stepPillActive: { borderColor: ORANGE, backgroundColor: 'rgba(240,90,40,0.16)' },
  stepPillText: { color: TEXT_MUTED, fontSize: 11, fontWeight: '700' },
  stepPillTextActive: { color: ORANGE },
  quoteBox: {
    backgroundColor: 'rgba(240,90,40,0.07)',
    borderWidth: 1, borderColor: `${ORANGE}50`,
    borderRadius: 12, padding: 14, marginTop: 14,
  },
  quoteTitle: { color: ORANGE, fontWeight: '800', fontSize: 13, marginBottom: 8, letterSpacing: 0.5 },
  quoteLine: { fontSize: 13, color: TEXT_DIM, marginBottom: 4 },
  quoteVal: { fontWeight: '700', color: TEXT },
  quoteDivider: { height: 1, backgroundColor: `${ORANGE}40`, marginVertical: 8 },
  quoteTotal: { color: ORANGE, fontWeight: '800', fontSize: 15 },
  infoCardSuccess: {
    backgroundColor: 'rgba(240,90,40,0.08)',
    borderWidth: 1, borderColor: 'rgba(240,90,40,0.35)',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  infoCardTitleSuccess: { fontSize: 13, fontWeight: '700', color: ORANGE, marginBottom: 8 },
  infoCardOrange: {
    backgroundColor: 'rgba(240,90,40,0.08)',
    borderWidth: 1, borderColor: 'rgba(240,90,40,0.35)',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  infoCardTitleOrange: { fontSize: 13, fontWeight: '700', color: ORANGE, marginBottom: 8 },
  infoCardLine: { fontSize: 12, color: TEXT_DIM, marginBottom: 4 },
  infoCardLineLabel: { fontWeight: '700', color: TEXT },
  editLink: { fontSize: 13, color: ORANGE, fontWeight: '700' },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
    padding: 10, borderRadius: 10, marginTop: 14,
  },
  infoBannerText: { color: '#93C5FD', fontSize: 12, lineHeight: 18 },
  wizardActionsRow: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' },
  navBtn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  navBtnGhost: { borderWidth: 1, borderColor: '#4B5563', backgroundColor: 'transparent', minWidth: 100 },
  navBtnGhostText: { color: '#D1D5DB', fontWeight: '700' },
  navBtnNext: { backgroundColor: ORANGE, flex: 1 },
  navBtnNextText: { color: '#fff', fontWeight: '800' },
  submitBtn: {
    backgroundColor: ORANGE, padding: 15, borderRadius: 10,
    alignItems: 'center', flex: 1,
    shadowColor: ORANGE, shadowOpacity: 0.45, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  submitText: { color: '#FFF', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  // Request items
  requestItem: {
    borderBottomWidth: 1, borderBottomColor: BORDER,
    paddingVertical: 14,
  },
  statusPill: { borderWidth: 1, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '600' },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 10,
    backgroundColor: SURFACE_2, borderRadius: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  linkText: { fontSize: 12, color: '#60A5FA', fontWeight: '600' },
  // Success modal
  successOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22,
  },
  successCard: {
    width: '100%', backgroundColor: '#111',
    borderWidth: 1, borderColor: ORANGE, borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 22, alignItems: 'center',
    shadowColor: ORANGE, shadowOpacity: 0.35, shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  successIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ORANGE, marginBottom: 12,
  },
  successTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.4, textAlign: 'center' },
  successMessage: { color: TEXT_DIM, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  successRefPill: {
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(240,90,40,0.4)', backgroundColor: 'rgba(240,90,40,0.1)',
  },
  successRefText: { color: ORANGE, fontSize: 12, fontWeight: '700' },
  successBtn: {
    marginTop: 16, minWidth: 140, borderRadius: 22,
    paddingVertical: 10, paddingHorizontal: 18,
    alignItems: 'center', backgroundColor: ORANGE,
  },
  successBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
