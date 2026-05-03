import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert,
  StyleSheet, ActivityIndicator, RefreshControl, Linking, Platform, Modal, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const RED = '#C1272D';
const DARK = '#0A0A0A';
const SURFACE = '#161616';
const SURFACE_2 = '#1F1F1F';
const BORDER = '#2A2A2A';
const TEXT = '#FFFFFF';
const TEXT_DIM = '#9CA3AF';
const TEXT_MUTED = '#6B7280';

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
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};

const getPaymentDeadline = (createdAt?: string | null) => {
  const created = parseApiDate(createdAt);
  if (!created) return null;
  return new Date(created.getTime() + 24 * 60 * 60 * 1000);
};

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

  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ¿Requiere factura?
  const [requiereFactura, setRequiereFactura] = useState(false);

  // Datos fiscales
  const [rfc, setRfc] = useState('');
  const [razon, setRazon] = useState('');
  const [regimen, setRegimen] = useState('612');
  const [cp, setCp] = useState('');
  const [uso, setUso] = useState('G03');
  const [email, setEmail] = useState('');
  const [conceptos, setConceptos] = useState('');

  // Operación
  const [monto, setMonto] = useState('');
  const [divisa, setDivisa] = useState<'USD' | 'RMB'>('USD');

  // Proveedor de envío (beneficiario)
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

  // Pricing / quote — ahora viene de proveedores ENTANGLED
  type EntProviderPub = {
    id: number;
    name: string;
    code: string | null;
    tipo_cambio_usd: number | string;
    tipo_cambio_rmb: number | string;
    porcentaje_compra: number | string;
    costo_operacion_usd: number | string;
    bank_accounts: Array<{ currency: string; bank: string; holder: string; account: string; clabe: string; reference: string }>;
    is_default: boolean;
  };
  const [providers, setProviders] = useState<EntProviderPub[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const pricing = (() => {
    const p = providers.find(x => x.id === selectedProviderId);
    if (!p) return null;
    const result = {
      tipo_cambio_usd: Number(p.tipo_cambio_usd),
      tipo_cambio_rmb: Number(p.tipo_cambio_rmb),
      porcentaje_compra: Number(p.porcentaje_compra),
      costo_operacion_usd: Number(p.costo_operacion_usd || 0),
    };
    console.log('[ENTANGLED MOBILE] Pricing object:', result, 'from provider:', p);
    return result;
  })();

  const authHeaders = { Authorization: `Bearer ${token}` };
  const [editingFiscalData, setEditingFiscalData] = useState(false);
  const [editingSupplierData, setEditingSupplierData] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [lastRequestId, setLastRequestId] = useState<number | null>(null);

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
      console.log('[ENTANGLED MOBILE] Providers loaded:', list);
      setProviders(list);
      const def = list.find(x => x.is_default) || list[0] || null;
      if (def && !selectedProviderId) {
        console.log('[ENTANGLED MOBILE] Default provider:', def, 'costo_operacion_usd:', def.costo_operacion_usd);
        setSelectedProviderId(def.id);
      }
    } catch (err) {
      console.error('[ENTANGLED MOBILE] loadPricing error:', err);
    }
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
        // Si el cliente ya tiene datos fiscales precargados, asumimos que quiere factura por defecto
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

  // Cotización derivada
  const quote = (() => {
    const m = parseFloat(monto);
    if (!pricing || !m || m <= 0) return null;
    const tc = divisa === 'RMB' ? pricing.tipo_cambio_rmb : pricing.tipo_cambio_usd;
    const base = m * tc;
    const comision = base * (pricing.porcentaje_compra / 100);
    const costoOpUsd = pricing.costo_operacion_usd || 0;
    const costoOpMxn = costoOpUsd * tc;
    const total = base + comision + costoOpMxn;
    console.log('[ENTANGLED MOBILE] Quote calculation:', { pricing, costoOpUsd, costoOpMxn, total });
    return {
      tipo_cambio: tc,
      porcentaje_compra: pricing.porcentaje_compra,
      costo_operacion_usd: costoOpUsd,
      monto_mxn_base: base,
      monto_mxn_comision: comision,
      monto_mxn_costo_op: costoOpMxn,
      monto_mxn_total: total,
    };
  })();

  const submit = async () => {
    if (!monto || parseFloat(monto) <= 0) {
      Alert.alert('Faltan datos', 'Captura el monto');
      return;
    }
    if (requiereFactura && (!rfc || !razon || !cp || !email)) {
      Alert.alert('Faltan datos', 'Completa todos los datos fiscales para generar factura');
      return;
    }
    if (!benefName || !benefAccount || !benefBankName) {
      Alert.alert('Faltan datos', 'Completa beneficiario, número de cuenta y banco del proveedor de envío');
      return;
    }
    if (!selectedProviderId) {
      Alert.alert('Falta proveedor', 'Selecciona un proveedor ENTANGLED');
      return;
    }
    if (divisa === 'RMB' && !benefNameZh) {
      Alert.alert('Faltan datos', 'Para envíos en RMB se requiere el nombre del beneficiario en chino');
      return;
    }

    setSubmitting(true);
    try {
      // Guardar proveedor si aplica
      let supplierId: number | undefined = selectedSupplierId !== 'new' ? Number(selectedSupplierId) : undefined;
      if (selectedSupplierId === 'new' && saveSupplier) {
        try {
          const r = await fetch(`${API_URL}/api/entangled/suppliers`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alias: benefAlias || benefName,
              nombre_beneficiario: benefName,
              nombre_chino: benefNameZh,
              direccion_beneficiario: benefAddress,
              numero_cuenta: benefAccount,
              iban: benefIban,
              banco_nombre: benefBankName,
              banco_direccion: benefBankAddress,
              swift_bic: benefSwift,
              aba_routing: benefAba,
              divisa_default: divisa,
            }),
          });
          const sd = await r.json();
          if (sd?.id) supplierId = sd.id;
        } catch {}
      }

      const payload: any = {
        requiere_factura: requiereFactura,
        provider_id: selectedProviderId,
        operacion: {
          montos: parseFloat(monto),
          divisa_destino: divisa,
          conceptos: requiereFactura
            ? conceptos.split(',').map(s => s.trim()).filter(Boolean)
            : [],
        },
        proveedor_envio: {
          supplier_id: supplierId || null,
          nombre_beneficiario: benefName,
          nombre_chino: benefNameZh,
          direccion_beneficiario: benefAddress,
          numero_cuenta: benefAccount,
          iban: benefIban,
          banco_nombre: benefBankName,
          banco_direccion: benefBankAddress,
          swift_bic: benefSwift,
          aba_routing: benefAba,
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
        const createdId = Number(data?.id || data?.data?.id || 0) || null;
        setLastRequestId(createdId);
        setSuccessModalVisible(true);
        // reset
        setMonto(''); setConceptos('');
        setBenefName(''); setBenefNameZh(''); setBenefAddress('');
        setBenefAccount(''); setBenefIban(''); setBenefBankName('');
        setBenefBankAddress(''); setBenefSwift(''); setBenefAba(''); setBenefAlias('');
        setSelectedSupplierId('new');
        setEditingFiscalData(false);
        setEditingSupplierData(false);
        setWizardStep(1);
        loadRequests();
        loadSuppliers();
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
      if (!benefName || !benefAccount || !benefBankName) {
        return 'Completa beneficiario, número de cuenta y banco';
      }
      if (divisa === 'RMB' && !benefNameZh) {
        return 'Para RMB se requiere nombre en chino';
      }
      return null;
    }
    if (step === 3 && requiereFactura && (!rfc || !razon || !cp || !email)) {
      return 'Completa todos los datos fiscales para generar factura';
    }
    return null;
  };

  const goNextStep = () => {
    const err = validateWizardStep(wizardStep);
    if (err) {
      Alert.alert('Faltan datos', err);
      return;
    }
    setWizardStep((s) => (s === 1 ? 2 : s === 2 ? 3 : s === 3 ? 4 : 4));
  };

  const statusColor = (s: string) => {
    if (['completado', 'emitida', 'enviado', 'pagado'].includes(s)) return ORANGE;
    if (['en_proceso', 'pendiente'].includes(s)) return '#f59e0b';
    if (['rechazado', 'error_envio', 'error'].includes(s)) return '#dc2626';
    return '#64748b';
  };

  return (
    <View style={{ flex: 1, backgroundColor: DARK }}>
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRequests(); }} tintColor={ORANGE} colors={[ORANGE]} progressBackgroundColor={SURFACE} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerEyebrow}>Portal Seguro</Text>
          <Image source={require('../../assets/logo-completo-xpay.png')} style={{ width: 80, height: 28, resizeMode: 'contain' }} />
          <View style={styles.headerDividerRow}>
            <View style={styles.headerDividerOrange} />
            <View style={styles.headerDividerRed} />
          </View>
        </View>
        <View style={styles.headerLockBadge}>
          <Ionicons name="lock-closed" size={12} color={ORANGE} />
        </View>
      </View>

      {/* Form */}
      <View style={styles.card}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="paper-plane" size={17} color={ORANGE} />
          <Text style={styles.sectionTitle}>{t('xpay.newRequest', t('entangled.newRequest') as string)}</Text>
        </View>

        <View style={styles.stepRow}>
          {[
            { id: 1 as const, label: '1. Monto' },
            { id: 2 as const, label: '2. Beneficiario' },
            { id: 3 as const, label: '3. Factura' },
            { id: 4 as const, label: '4. Resumen' },
          ].map((s) => (
            <TouchableOpacity key={s.id} style={[styles.stepPill, wizardStep === s.id && styles.stepPillActive]} onPress={() => setWizardStep(s.id)}>
              <Text style={[styles.stepPillText, wizardStep === s.id && styles.stepPillTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ¿Requiere factura? */}
        {wizardStep === 3 && (
        <>
        <Text style={styles.label}>🧾 {t('xpay.invoiceQuestion')}</Text>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <TouchableOpacity
            style={[styles.chip, !requiereFactura && styles.chipActive]}
            onPress={() => setRequiereFactura(false)}
          >
            <Text style={[styles.chipText, !requiereFactura && styles.chipTextActive]}>{t('xpay.invoiceNo')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, requiereFactura && styles.chipActive]}
            onPress={() => setRequiereFactura(true)}
          >
            <Text style={[styles.chipText, requiereFactura && styles.chipTextActive]}>{t('xpay.invoiceYes')}</Text>
          </TouchableOpacity>
        </View>
        </>
        )}

        {/* Datos fiscales (solo si requiere factura) */}
        {wizardStep === 3 && requiereFactura && (
          <>
            {/* Card de datos fiscales precargados */}
            {rfc && razon && !editingFiscalData && (
              <View style={styles.infoCardSuccess}>
                <Text style={styles.infoCardTitleSuccess}>✅ {t('xpay.fiscalLoaded')}</Text>
                <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>{t('xpay.razonSocialLabel')}:</Text> {razon}</Text>
                <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>{t('xpay.rfcLabel')}:</Text> {rfc}</Text>
                <Text style={[styles.infoCardLine, { marginBottom: 8 }]}><Text style={styles.infoCardLineLabel}>{t('xpay.cpLabel')}:</Text> {cp}</Text>
                <TouchableOpacity onPress={() => setEditingFiscalData(true)}>
                  <Text style={styles.editLink}>✏️ {t('xpay.editData')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {(!rfc || !razon || editingFiscalData) && (
              <>
                <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 12 }]}>📋 {t('xpay.fiscalDataSection')}</Text>

                <Text style={styles.label}>{t('entangled.fields.rfc')}</Text>
                <TextInput style={styles.input} value={rfc} onChangeText={t => setRfc(t.toUpperCase())} autoCapitalize="characters" />

                <Text style={styles.label}>{t('entangled.fields.razonSocial')}</Text>
                <TextInput style={styles.input} value={razon} onChangeText={setRazon} />

                <Text style={styles.label}>{t('entangled.fields.regimenFiscal')}</Text>
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

                <Text style={styles.label}>{t('entangled.fields.cp')}</Text>
                <TextInput style={styles.input} value={cp} onChangeText={setCp} keyboardType="numeric" maxLength={5} />

                <Text style={styles.label}>{t('entangled.fields.usoCfdi')}</Text>
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

                <Text style={styles.label}>{t('entangled.fields.email')}</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

                <Text style={styles.label}>{t('entangled.fields.concepts')} {t('xpay.conceptsHelp')}</Text>
                <TextInput style={styles.input} value={conceptos} onChangeText={setConceptos} placeholder="84111506, 90121800" />
              </>
            )}
          </>
        )}

        {/* Proveedor de envío (beneficiario) */}
        {wizardStep === 2 && (
        <>
        <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 16 }]}>🏦 {t('xpay.supplierSection')}</Text>

        {savedSuppliers.length > 0 && (
          <>
            <Text style={styles.label}>{t('xpay.supplierLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.chip, selectedSupplierId === 'new' && styles.chipActive]}
                onPress={() => handlePickSupplier('new')}
              >
                <Text style={[styles.chipText, selectedSupplierId === 'new' && styles.chipTextActive]}>{t('xpay.newSupplier')}</Text>
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

            {/* Card de proveedor seleccionado */}
            {selectedSupplierId !== 'new' && savedSuppliers.find(s => s.id === selectedSupplierId) && !editingSupplierData && (
              <View style={styles.infoCardOrange}>
                <Text style={styles.infoCardTitleOrange}>✅ {t('xpay.supplierSelected')}</Text>
                <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>{t('xpay.beneficiary')}:</Text> {savedSuppliers.find(s => s.id === selectedSupplierId)?.nombre_beneficiario}</Text>
                {savedSuppliers.find(s => s.id === selectedSupplierId)?.banco_nombre && (
                  <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>{t('xpay.bank')}:</Text> {savedSuppliers.find(s => s.id === selectedSupplierId)?.banco_nombre}</Text>
                )}
                {savedSuppliers.find(s => s.id === selectedSupplierId)?.numero_cuenta && (
                  <Text style={[styles.infoCardLine, { marginBottom: 8 }]}><Text style={styles.infoCardLineLabel}>{t('xpay.account')}:</Text> ...{savedSuppliers.find(s => s.id === selectedSupplierId)?.numero_cuenta.slice(-4)}</Text>
                )}
                <TouchableOpacity onPress={() => setEditingSupplierData(true)}>
                  <Text style={styles.editLink}>✏️ {t('xpay.editData')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {(selectedSupplierId === 'new' || editingSupplierData) && (
          <>
            <Text style={styles.label}>{t('xpay.beneficiaryName')}</Text>
            <TextInput style={styles.input} value={benefName} onChangeText={setBenefName} />

            {divisa === 'RMB' && (
              <>
                <Text style={styles.label}>{t('xpay.chineseName')}</Text>
                <TextInput style={styles.input} value={benefNameZh} onChangeText={setBenefNameZh} />
              </>
            )}

            <Text style={styles.label}>{t('xpay.beneficiaryAddress')}</Text>
            <TextInput style={styles.input} value={benefAddress} onChangeText={setBenefAddress} />

            <Text style={styles.label}>{t('xpay.accountNumber')}</Text>
            <TextInput style={styles.input} value={benefAccount} onChangeText={setBenefAccount} />

            <Text style={styles.label}>{t('xpay.bankName')}</Text>
            <TextInput style={styles.input} value={benefBankName} onChangeText={setBenefBankName} />

            <Text style={styles.label}>{t('xpay.bankAddress')}</Text>
            <TextInput style={styles.input} value={benefBankAddress} onChangeText={setBenefBankAddress} />

            <Text style={styles.label}>{t('xpay.swift')}</Text>
            <TextInput style={styles.input} value={benefSwift} onChangeText={setBenefSwift} autoCapitalize="characters" />

            <Text style={styles.label}>{t('xpay.aba')}</Text>
            <TextInput style={styles.input} value={benefAba} onChangeText={setBenefAba} keyboardType="numeric" />

            <Text style={styles.label}>{t('xpay.aliasOptional')}</Text>
            <TextInput style={styles.input} value={benefAlias} onChangeText={setBenefAlias} />

            {selectedSupplierId === 'new' && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}
                onPress={() => setSaveSupplier(s => !s)}
              >
                <Ionicons
                  name={saveSupplier ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={ORANGE}
                />
                <Text style={{ marginLeft: 8, color: TEXT_DIM, fontSize: 13 }}>
                  {t('xpay.saveSupplierFuture')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
        </>
        )}

        {/* Monto y divisa */}
        {wizardStep === 1 && (
        <>
        <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 16 }]}>💵 {t('xpay.amountSection')}</Text>

        <Text style={styles.label}>{t('xpay.entangledProvider')}</Text>
        {providers.length === 0 ? (
          <Text style={{ color: '#FCA5A5', fontSize: 12, marginBottom: 8 }}>
            {t('xpay.noProviders')}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {providers.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, selectedProviderId === p.id && styles.chipActive]}
                onPress={() => setSelectedProviderId(p.id)}
              >
                <Text style={[styles.chipText, selectedProviderId === p.id && styles.chipTextActive]}>
                  {p.name}{p.is_default ? ' ★' : ''} · {Number(p.porcentaje_compra).toFixed(2)}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>{t('entangled.fields.amount')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: ORANGE, marginRight: 4 }}>$</Text>
          <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={monto} onChangeText={setMonto} keyboardType="decimal-pad" placeholder="0.00" />
        </View>

        <Text style={styles.label}>{t('entangled.fields.currency')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {DIVISAS.map(d => (
            <TouchableOpacity key={d} style={[styles.chip, divisa === d && styles.chipActive]} onPress={() => setDivisa(d as 'USD' | 'RMB')}>
              <Text style={[styles.chipText, divisa === d && styles.chipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cotización */}
        {quote && (
          <View style={styles.quoteBox}>
            <Text style={styles.quoteTitle}>{t('xpay.quoteTitle')}</Text>
            <Text style={styles.quoteLine}>
              {t('xpay.quoteAmountToSend')}: <Text style={styles.quoteVal}>${formatMoney(monto, 0)} {divisa}</Text>
            </Text>
            <Text style={styles.quoteLine}>
              {t('xpay.quoteFxRate')}: <Text style={styles.quoteVal}>${formatMoney(quote.tipo_cambio, 4)} MXN/{divisa}</Text>
            </Text>
            <Text style={styles.quoteLine}>
              {t('xpay.quoteSubtotalMxn')}: <Text style={styles.quoteVal}>${formatMoney(quote.monto_mxn_base, 2)}</Text>
            </Text>
            <Text style={styles.quoteLine}>
              {t('xpay.quoteCommission')} ({quote.porcentaje_compra}%): <Text style={styles.quoteVal}>
                ${formatMoney(quote.monto_mxn_comision, 2)}
              </Text>
            </Text>
            {quote.monto_mxn_costo_op > 0 && (
              <Text style={styles.quoteLine}>
                {t('xpay.quoteOpCost')} ({formatMoney(quote.costo_operacion_usd, 0)} USD × {formatMoney(quote.tipo_cambio, 4)}): <Text style={styles.quoteVal}>
                  ${formatMoney(quote.monto_mxn_costo_op, 2)}
                </Text>
              </Text>
            )}
            <View style={styles.quoteDivider} />
            <Text style={styles.quoteTotal}>
              {t('xpay.quoteTotalToPay')}: ${formatMoney(quote.monto_mxn_total, 2)} MXN
            </Text>
          </View>
        )}

        </>
        )}

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
          <Text style={styles.infoBannerText}>
            {t('xpay.proofLater')}
          </Text>
        </View>

        <View style={styles.wizardActionsRow}>
          {wizardStep > 1 && (
            <TouchableOpacity style={[styles.navBtn, styles.navBtnGhost]} onPress={() => setWizardStep((s) => (s === 4 ? 3 : s === 3 ? 2 : s === 2 ? 1 : 1))}>
              <Text style={styles.navBtnGhostText}>{t('common.back')}</Text>
            </TouchableOpacity>
          )}
          {wizardStep < 4 ? (
            <TouchableOpacity style={[styles.navBtn, styles.navBtnNext]} onPress={goNextStep}>
              <Text style={styles.navBtnNextText}>{t('common.next')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.submitBtn, (!quote || submitting) && { opacity: 0.5 }]} onPress={submit} disabled={submitting || !quote}>
              {submitting ? <ActivityIndicator color="white" /> : (
                <Text style={styles.submitText}>{t('entangled.actions.submit')}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Requests List */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📋 {t('entangled.myRequests')}</Text>

        {loading ? (
          <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />
        ) : requests.length === 0 ? (
          <Text style={styles.empty}>{t('entangled.messages.empty')}</Text>
        ) : requests.map(r => {
          const deadline = parseApiDate(r.payment_deadline_at) || getPaymentDeadline(r.created_at);
          const isActiveForPayment = ['pendiente', 'en_proceso', 'error_envio'].includes(String(r.estatus_global || '').toLowerCase());
          return (
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
            {isActiveForPayment && (
              <View style={styles.cancelTimeRow}>
                <Ionicons name="time-outline" size={12} color="#FBBF24" />
                <Text style={styles.cancelTimeText}>Se cancela: {formatDateTime(deadline)}</Text>
              </View>
            )}
            <View style={styles.statusRow}>
              <View style={[styles.statusPill, { borderColor: statusColor(r.estatus_factura) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(r.estatus_factura) }]}>
                  {t('xpay.facturaLabel')}: {r.estatus_factura || '-'}
                </Text>
              </View>
              <View style={[styles.statusPill, { borderColor: statusColor(r.estatus_proveedor) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(r.estatus_proveedor) }]}>
                  {t('xpay.providerLabel')}: {r.estatus_proveedor || '-'}
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
                  <Ionicons name="checkmark-done-outline" size={14} color={ORANGE} />
                  <Text style={[styles.linkText, { color: ORANGE }]}>{t('entangled.actions.viewProof')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )})}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>

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

          <Text style={styles.successTitle}>{t('xpay.requestCreatedTitle')}</Text>
          <Text style={styles.successMessage}>
            {t('xpay.requestCreatedMessage')}
          </Text>

          {!!lastRequestId && (
            <View style={styles.successRefPill}>
              <Text style={styles.successRefText}>#{lastRequestId}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.successBtn}
            onPress={() => setSuccessModalVisible(false)}
          >
            <Text style={styles.successBtnText}>{t('common.ok')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: Platform.OS === 'ios' ? 50 : 24,
    borderBottomWidth: 2,
    borderBottomColor: ORANGE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0F0F0F',
  },
  headerEyebrow: {
    color: TEXT_MUTED, fontSize: 10, letterSpacing: 3, fontWeight: '600',
  },
  headerTitle: {
    color: TEXT, fontSize: 16, fontWeight: '900', letterSpacing: 1.5, marginTop: 1,
  },
  headerDividerRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  headerDividerOrange: { width: 24, height: 3, backgroundColor: ORANGE, borderRadius: 2 },
  headerDividerRed: { width: 12, height: 3, backgroundColor: RED, borderRadius: 2 },
  headerLockBadge: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderColor: ORANGE,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(240,90,40,0.1)',
  },
  card: {
    backgroundColor: SURFACE, margin: 12, padding: 16, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: TEXT, letterSpacing: 0.3 },
  stepRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  stepPill: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  stepPillActive: { borderColor: ORANGE, backgroundColor: 'rgba(240,90,40,0.16)' },
  stepPillText: { color: TEXT_MUTED, fontSize: 11, fontWeight: '700' },
  stepPillTextActive: { color: ORANGE },
  label: { fontSize: 12, color: TEXT_DIM, marginBottom: 6, marginTop: 10, letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12,
    fontSize: 14, backgroundColor: SURFACE_2, color: TEXT,
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
    marginBottom: 12, backgroundColor: SURFACE_2, paddingHorizontal: 4, paddingVertical: 4,
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: ORANGE,
    padding: 12, borderRadius: 10, marginTop: 12, gap: 6,
    backgroundColor: 'rgba(240,90,40,0.06)',
  },
  uploadText: { color: ORANGE, fontWeight: '600' },
  submitBtn: {
    backgroundColor: ORANGE, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 16,
    shadowColor: ORANGE, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    flex: 1,
  },
  submitText: { color: '#FFF', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  wizardActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' },
  navBtn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  navBtnGhost: { borderWidth: 1, borderColor: '#4B5563', backgroundColor: 'transparent', minWidth: 100 },
  navBtnGhostText: { color: '#D1D5DB', fontWeight: '700' },
  navBtnNext: { backgroundColor: ORANGE, minWidth: 120 },
  navBtnNextText: { color: '#fff', fontWeight: '800' },
  // Cotización (oscura con acento naranja)
  quoteBox: {
    backgroundColor: 'rgba(240,90,40,0.08)',
    borderWidth: 1, borderColor: ORANGE, borderRadius: 10, padding: 14, marginTop: 14,
  },
  quoteTitle: { color: ORANGE, fontWeight: '800', fontSize: 13, marginBottom: 8, letterSpacing: 1 },
  quoteLine: { fontSize: 13, color: TEXT_DIM, marginBottom: 4 },
  quoteVal: { fontWeight: '700', color: TEXT },
  quoteDivider: { height: 1, backgroundColor: 'rgba(240,90,40,0.4)', marginVertical: 8 },
  quoteTotal: { color: ORANGE, fontWeight: '800', fontSize: 15 },
  // Info cards
  infoCardSuccess: {
    backgroundColor: 'rgba(240,90,40,0.1)',
    borderWidth: 1, borderColor: 'rgba(240,90,40,0.4)',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  infoCardTitleSuccess: { fontSize: 14, fontWeight: '700', color: ORANGE, marginBottom: 8 },
  infoCardOrange: {
    backgroundColor: 'rgba(240,90,40,0.1)',
    borderWidth: 1, borderColor: 'rgba(240,90,40,0.4)',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  infoCardTitleOrange: { fontSize: 14, fontWeight: '700', color: ORANGE, marginBottom: 8 },
  infoCardLine: { fontSize: 12, color: TEXT_DIM, marginBottom: 4 },
  infoCardLineLabel: { fontWeight: '700', color: TEXT },
  editLink: { fontSize: 13, color: ORANGE, fontWeight: '700' },
  infoBanner: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    padding: 10, borderRadius: 8, marginTop: 10,
  },
  infoBannerText: { color: '#93C5FD', fontSize: 12 },
  // Listado de solicitudes
  empty: { textAlign: 'center', color: TEXT_MUTED, padding: 16 },
  requestItem: { borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 12 },
  requestTitle: { fontWeight: '700', color: TEXT },
  requestStatus: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  requestSub: { color: TEXT_DIM, fontSize: 12, marginTop: 2 },
  requestAmount: { fontSize: 16, fontWeight: '800', color: ORANGE, marginTop: 4 },
  cancelTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cancelTimeText: { color: '#FBBF24', fontSize: 11, fontWeight: '700' },
  statusRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  statusPill: { borderWidth: 1, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '600' },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 10,
    backgroundColor: SURFACE_2, borderRadius: 6,
    borderWidth: 1, borderColor: BORDER,
  },
  linkText: { fontSize: 12, color: '#60A5FA', fontWeight: '600' },

  // Notificación éxito X-Pay
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  successCard: {
    width: '100%',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: ORANGE,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: ORANGE,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  successIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    marginBottom: 10,
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  successMessage: {
    color: TEXT_DIM,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  successRefPill: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240,90,40,0.45)',
    backgroundColor: 'rgba(240,90,40,0.10)',
  },
  successRefText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '700',
  },
  successBtn: {
    marginTop: 14,
    minWidth: 140,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    backgroundColor: ORANGE,
  },
  successBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
