import React, { useEffect, useState, useCallback, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
  referencia_pago?: string;
  cf_rfc: string;
  cf_razon_social: string;
  op_monto: number;
  op_divisa_destino: string;
  estatus_global: string;
  estatus_factura: string;
  estatus_proveedor: string;
  factura_url?: string;
  comprobante_proveedor_url?: string;
  op_comprobante_cliente_url?: string | null;
  comprobante_subido_at?: string | null;
  payment_deadline_at?: string | null;
  instructions_snapshot?: any;
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
  const [claveHistory, setClaveHistory] = useState<Array<{ clave: string; descripcion?: string | null; uses_count: number }>>([]);
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
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  // Wizard ahora arranca en step 0 (selección de servicio: con/sin factura)
  // igual que la versión web. Antes el wizard empezaba en "Monto" y la
  // selección de factura quedaba escondida en step 3.
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  // lastRequestId quedó sin lectores tras quitar el botón "Subir
  // comprobante ahora" del modal de éxito; lo dejamos por si más
  // adelante volvemos a leer el id (ej. para deep-link a Últimos
  // envíos resaltando la fila recién creada).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lastRequestId, setLastRequestId] = useState<number | null>(null);
  const [lastReferencia, setLastReferencia] = useState<string | null>(null);
  const [lastEmpresas, setLastEmpresas] = useState<Array<{ clave_prodserv?: string; empresa?: string; monto?: number; divisa?: string; cuenta_bancaria?: any }>>([]);
  const [lastTransaccionId, setLastTransaccionId] = useState<string | null>(null);
  // Snapshot del form al crear la solicitud — necesario porque
  // después del submit limpiamos el form, y el PDF que se descarga
  // desde el modal de éxito (o desde Últimos envíos para esta misma
  // sesión) necesita todos los datos para llenar Detalle de la
  // operación + Beneficiario final + Total a pagar.
  type FormSnapshot = {
    requiereFactura: boolean;
    divisa: string;
    monto: number;
    razon: string;
    rfc: string;
    tcFinal: number;
    comision: number;
    total: number;
    benefName: string;
    benefNameZh: string;
    benefBankName: string;
    benefAccount: string;
    benefIban: string;
    benefSwift: string;
    benefAba: string;
  };
  const [lastFormSnapshot, setLastFormSnapshot] = useState<FormSnapshot | null>(null);

  // Comprobante v2: archivo elegido en wizard antes de submit
  const [comprobanteAsset, setComprobanteAsset] = useState<{ uri: string; name: string; mimeType: string } | null>(null);

  // Comprobante upload + live chronometer
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [uploadSuccessModal, setUploadSuccessModal] = useState<{ visible: boolean; referencia: string }>({ visible: false, referencia: '' });
  // Tick de 1s eliminado — sólo lo usaba formatElapsed para el
  // cronómetro verde "Procesando..." que ya quitamos.

  // Dashboard state
  const [viewMode, setViewMode] = useState<'dashboard' | 'wizard'>('dashboard');
  const [calcMonto, setCalcMonto] = useState('');
  const [calcDivisa, setCalcDivisa] = useState<'USD' | 'RMB'>('USD');
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

  const loadClaveHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/entangled/clave-sat-history`, { headers: authHeaders });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setClaveHistory(data);
    } catch {}
  }, [token]);

  const appendClaveFromHistory = (h: { clave: string; descripcion?: string | null }) => {
    const existing = conceptos.split(',').map(s => s.trim()).filter(Boolean);
    if (existing.includes(h.clave)) return;
    const next = existing.length ? `${conceptos}, ${h.clave}` : h.clave;
    setConceptos(next);
  };

  const removeClave = (clave: string) => {
    const list = conceptos.split(',').map(s => s.trim()).filter(Boolean);
    const next = list.filter(c => c.split('|')[0].trim() !== clave);
    setConceptos(next.join(', '));
  };

  const addClaveFromSearch = (opt: { clave_prodserv: string; descripcion: string }) => {
    const existing = conceptos.split(',').map(s => s.trim().split('|')[0].trim()).filter(Boolean);
    if (existing.includes(opt.clave_prodserv)) return;
    // Guardamos clave|descripcion para que el chip muestre la descripción
    // aunque aún no haya pasado por la validación de /asignacion.
    const piece = `${opt.clave_prodserv}|${opt.descripcion}`;
    setConceptos(existing.length ? `${conceptos}, ${piece}` : piece);
  };

  // Autocomplete del catálogo SAT (mismo flujo que web: input de
  // texto + dropdown debounced contra /api/entangled/conceptos/search).
  type ConceptoOption = { clave_prodserv: string; descripcion: string };
  const [conceptoSearchInput, setConceptoSearchInput] = useState('');
  const [conceptoOptions, setConceptoOptions] = useState<ConceptoOption[]>([]);
  const [conceptoSearching, setConceptoSearching] = useState(false);
  const [conceptoSearchError, setConceptoSearchError] = useState<string | null>(null);
  useEffect(() => {
    const q = conceptoSearchInput.trim();
    // Si está vacío o el usuario ya escribió un código numérico completo,
    // no buscamos en catálogo (probablemente lo va a pegar como texto).
    if (q.length < 2 || /^\d{6,10}$/.test(q)) {
      setConceptoOptions([]);
      setConceptoSearching(false);
      setConceptoSearchError(null);
      return;
    }
    setConceptoSearching(true);
    setConceptoSearchError(null);
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(
          `${API_URL}/api/entangled/conceptos/search?q=${encodeURIComponent(q)}&limit=10`,
          { headers: authHeaders }
        );
        const data = await r.json();
        const list: ConceptoOption[] = Array.isArray(data?.results)
          ? data.results.map((x: any) => ({
              clave_prodserv: String(x.clave_prodserv),
              descripcion: String(x.descripcion || ''),
            }))
          : [];
        setConceptoOptions(list);
      } catch (e: any) {
        setConceptoOptions([]);
        setConceptoSearchError('No se pudo buscar el concepto');
      } finally {
        setConceptoSearching(false);
      }
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptoSearchInput, token]);

  // Validación + ASIGNACIÓN de claves SAT contra ENTANGLED (debounced).
  //
  // ⚠️ ANTES llamábamos a /api/entangled/conceptos/search (catálogo SAT
  // genérico, NO retorna empresa asignada). Por eso siempre se veía
  // "Pendiente de asignación" en el cuadro de empresa.
  //
  // Web usa POST /api/entangled/asignacion (mismo flujo que la
  // pantalla EntangledPaymentRequest.tsx:641): le pasas servicio,
  // monto, tc, comisión, datos fiscales y la clave; el endpoint
  // responde con empresa.rfc/razon_social + cuenta_bancaria. Ese es
  // el dato fiscal real que se usa luego para crear la solicitud.
  type ClaveEmpresa = { id?: string; nombre?: string; rfc?: string };
  type ClaveCuentaBancaria = {
    banco?: string; titular?: string; cuenta?: string; clabe?: string;
    sucursal?: string; moneda?: string;
  };
  type ClaveValidation = {
    clave: string;
    ok: boolean;
    descripcion?: string;
    loading?: boolean;
    empresa?: ClaveEmpresa | null;
    cuentaBancaria?: ClaveCuentaBancaria | null;
    error?: string;
  };
  const [claveValidations, setClaveValidations] = useState<ClaveValidation[]>([]);
  const claveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El useEffect que dispara las llamadas a /asignacion vive más abajo,
  // después de que se define `quote` y `pricing` — referencia esos
  // valores en su closure y TS no permite el TDZ al revés.

  useEffect(() => {
    loadRequests();
    loadSuppliers();
    loadPricing();
    loadFiscalProfile();
    loadClaveHistory();
  }, [loadRequests, loadSuppliers, loadPricing, loadFiscalProfile, loadClaveHistory]);

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

  // useEffect que valida + asigna empresa por cada clave SAT capturada.
  // Vive aquí (post-quote) por TDZ: el closure referencia quote.tipo_cambio.
  useEffect(() => {
    if (claveDebounceRef.current) clearTimeout(claveDebounceRef.current);
    const claves = conceptos
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => /^\d{6,10}$/.test(s.split('|')[0].trim()));
    if (claves.length === 0) {
      setClaveValidations([]);
      return;
    }
    const tcFinal = quote?.tipo_cambio;
    const comisionPct = quote?.porcentaje_compra;
    const montoNum = parseFloat(monto) || 0;
    const fiscalCompleto = !requiereFactura || !!(rfc && razon && regimen && cp && uso && email);
    const puedeAsignar = montoNum > 0 && !!tcFinal && fiscalCompleto;

    if (!puedeAsignar) {
      setClaveValidations(claves.map(c => ({
        clave: c.split('|')[0].trim(),
        ok: false,
        loading: false,
        error: 'Captura monto y datos fiscales completos para asignar empresa.',
      })));
      return;
    }

    setClaveValidations(claves.map(c => ({ clave: c.split('|')[0].trim(), ok: false, loading: true })));
    claveDebounceRef.current = setTimeout(async () => {
      const out: ClaveValidation[] = [];
      for (const c of claves) {
        const clave = c.split('|')[0].trim();
        try {
          const body: any = {
            servicio: requiereFactura ? 'pago_con_factura' : 'pago_sin_factura',
            monto_destino: montoNum,
            divisa_destino: divisa,
            tc_cliente_final: tcFinal,
            comision_cliente_final_porcentaje: comisionPct,
            cliente_final: requiereFactura
              ? {
                  rfc: String(rfc).trim().toUpperCase(),
                  razon_social: String(razon).trim(),
                  regimen_fiscal: String(regimen).trim(),
                  cp: String(cp).trim(),
                  uso_cfdi: String(uso).trim(),
                  email: String(email).trim(),
                }
              : { razon_social: razon || benefName || 'Público en General' },
          };
          if (requiereFactura) body.concepto = clave;
          const r = await fetch(`${API_URL}/api/entangled/asignacion`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await r.json();
          if (r.ok && data?.empresa?.rfc) {
            out.push({
              clave,
              ok: true,
              descripcion: data?.descripcion || data?.concepto?.descripcion || '',
              empresa: {
                rfc: data.empresa.rfc,
                nombre: data.empresa.razon_social || data.empresa.nombre,
              },
              cuentaBancaria: data.cuenta_bancaria || null,
            });
          } else {
            out.push({ clave, ok: false, error: data?.error || 'No se pudo asignar empresa' });
          }
        } catch {
          out.push({ clave, ok: false, error: 'Error de red al consultar asignación' });
        }
      }
      setClaveValidations(out);
    }, 600);
    return () => { if (claveDebounceRef.current) clearTimeout(claveDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptos, token, quote?.tipo_cambio, monto, divisa, requiereFactura, rfc, razon, regimen, cp, uso, email, benefName]);

  const defaultProvider = providers.find(x => x.is_default) || providers[0] || null;

  const calcQuote = (() => {
    const m = parseFloat(calcMonto);
    if (!defaultProvider || !m || m <= 0) return null;
    const tc = calcDivisa === 'RMB'
      ? Number(defaultProvider.tipo_cambio_rmb)
      : Number(defaultProvider.tipo_cambio_usd);
    const pct = Number(defaultProvider.porcentaje_compra);
    const costoOpMxn = Number(defaultProvider.costo_operacion_usd || 0) * tc;
    const base = m * tc;
    const comision = base * (pct / 100);
    return { tc, total: base + comision + costoOpMxn, divisa: calcDivisa };
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

  const pickComprobanteForSubmit = async (): Promise<{ uri: string; name: string; mimeType: string } | null> => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (r.canceled || !r.assets?.length) return null;
      const a = r.assets[0];
      const asset = {
        uri: a.uri,
        name: a.name || `comprobante-${Date.now()}`,
        mimeType: a.mimeType || 'application/octet-stream',
      };
      setComprobanteAsset(asset);
      return asset;
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo abrir el selector de archivos');
      return null;
    }
  };

  const submit = async () => {
    if (!monto || parseFloat(monto) <= 0) { Alert.alert('Faltan datos', 'Captura el monto'); return; }
    if (requiereFactura && (!rfc || !razon || !cp || !email)) {
      Alert.alert('Faltan datos', 'Completa todos los datos fiscales para generar factura'); return;
    }
    if (!benefName || !benefAccount || !benefBankName) {
      Alert.alert('Faltan datos', 'Completa beneficiario, número de cuenta y banco del proveedor de envío'); return;
    }
    if (divisa === 'RMB' && !benefNameZh) {
      Alert.alert('Faltan datos', 'Para envíos en RMB se requiere el nombre del beneficiario en chino'); return;
    }

    // Nuevo flujo: la solicitud se crea SIN comprobante en estado pendiente.
    // El cliente sube su comprobante después desde "Últimos envíos" y ese
    // upload dispara el envío a ENTANGLED en el backend.

    setSubmitting(true);
    try {
      // Persistir el supplier por separado (igual que antes) para tu base local
      if (selectedSupplierId === 'new' && saveSupplier) {
        try {
          await fetch(`${API_URL}/api/entangled/suppliers`, {
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
        } catch {}
      }

      // Notas: incluimos los datos del beneficiario para que el operador los tenga
      const notas = [
        `Beneficiario: ${benefName}`,
        benefNameZh ? `Nombre chino: ${benefNameZh}` : null,
        benefAccount ? `Cuenta: ${benefAccount}` : null,
        benefIban ? `IBAN: ${benefIban}` : null,
        benefBankName ? `Banco: ${benefBankName}` : null,
        benefBankAddress ? `Dirección banco: ${benefBankAddress}` : null,
        benefSwift ? `SWIFT: ${benefSwift}` : null,
        benefAba ? `ABA: ${benefAba}` : null,
        benefAddress ? `Dirección beneficiario: ${benefAddress}` : null,
      ].filter(Boolean).join('\n');

      const servicio = requiereFactura ? 'pago_con_factura' : 'pago_sin_factura';

      const fd = new FormData();
      fd.append('servicio', servicio);
      fd.append('monto_usd', String(parseFloat(monto)));
      fd.append('divisa', divisa);
      // tc_cliente_final = tipo de cambio que XPAY cobra al cliente
      // final (cotización congelada). El backend ENTANGLED lo exige
      // para guardar la transacción — sin este campo regresa 400
      // "tc_cliente_final es requerido y debe ser > 0".
      if (quote?.tipo_cambio) {
        fd.append('tc_cliente_final', String(quote.tipo_cambio));
      }
      fd.append(
        'cliente_final',
        JSON.stringify(
          requiereFactura
            ? { rfc, razon_social: razon, regimen_fiscal: regimen, cp, uso_cfdi: uso, email }
            : { razon_social: razon || benefName }
        )
      );
      if (requiereFactura) {
        const conceptosArr = conceptos.split(',').map(s => s.trim()).filter(Boolean).map(c => {
          const m = c.match(/^(\S+)\s*[-:]?\s*(.*)$/);
          return { clave_prodserv: m?.[1] || c, descripcion: m?.[2] || undefined };
        });
        fd.append('conceptos', JSON.stringify(conceptosArr));
      }
      if (notas) fd.append('notas', notas);
      // NO se envía comprobante aquí: la solicitud queda en estado 'pendiente'
      // y el comprobante se sube después desde Últimos envíos.

      const res = await fetch(`${API_URL}/api/entangled/payment-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        const rid = data?.request?.id || data?.request_id || null;
        setLastRequestId(rid ? Number(rid) : null);
        setLastReferencia(data?.referencia_pago || (rid ? `XP${String(rid).padStart(6, '0')}` : null));
        setLastEmpresas(Array.isArray(data?.empresas_asignadas) ? data.empresas_asignadas : []);
        setLastTransaccionId(data?.entangled_transaccion_id || data?.request?.entangled_transaccion_id || null);
        // CAPTURAR snapshot del form ANTES de limpiarlo. Sin esto el
        // PDF que se descarga desde el modal de éxito muestra monto=0
        // y faltan tcFinal/comisión/beneficiario (porque mi código leía
        // del state actual que ya estaba reseteado).
        setLastFormSnapshot({
          requiereFactura,
          divisa,
          monto: parseFloat(monto) || 0,
          razon, rfc,
          tcFinal: quote?.tipo_cambio || 0,
          comision: quote?.monto_mxn_comision || 0,
          total: quote?.monto_mxn_total || 0,
          benefName, benefNameZh, benefBankName, benefAccount,
          benefIban, benefSwift, benefAba,
        });
        setSuccessModalVisible(true);
        setMonto(''); setConceptos('');
        setBenefName(''); setBenefNameZh(''); setBenefAddress('');
        setBenefAccount(''); setBenefIban(''); setBenefBankName('');
        setBenefBankAddress(''); setBenefSwift(''); setBenefAba(''); setBenefAlias('');
        setComprobanteAsset(null);
        setSelectedSupplierId('new');
        setEditingFiscalData(false); setEditingSupplierData(false); setWizardStep(0);
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

  const validateWizardStep = (step: 0 | 1 | 2 | 3 | 4): string | null => {
    if (step === 0) {
      // El step 0 solo confirma la selección de servicio (requiereFactura ya
      // se setea al tocar la card). No hay nada que validar.
      return null;
    }
    if (step === 1) {
      if (!selectedProviderId) return 'Selecciona un proveedor ENTANGLED';
      if (!monto || parseFloat(monto) <= 0) return 'Captura un monto válido';
      if (!quote) return 'No se pudo calcular la cotización';
      return null;
    }
    if (step === 2) {
      const needsBankAddress = !/alipay|wechat|paypal|wise/i.test(benefBankName);
      if (!benefName || !benefAccount || !benefBankName || (needsBankAddress && !benefBankAddress)) return 'Completa beneficiario, cuenta y banco';
      if (divisa === 'RMB' && !benefNameZh) return 'Para RMB se requiere nombre en chino';
      return null;
    }
    if (step === 3 && requiereFactura && (!rfc || !razon || !cp || !email)) {
      return 'Completa todos los datos fiscales para generar factura';
    }
    if (step === 3 && requiereFactura) {
      const claves = conceptos.split(',').map(s => s.trim().split('|')[0].trim()).filter(Boolean);
      if (claves.length === 0) return 'Captura al menos una clave SAT (clave_prodserv)';
      if (claveValidations.some(v => v.loading)) return 'Validando claves SAT, espera un momento...';
      const invalid = claveValidations.filter(v => !v.ok && !v.loading).map(v => v.clave);
      if (invalid.length > 0) return `Claves SAT no encontradas en catálogo: ${invalid.join(', ')}`;
      // Bloqueo de mezcla de empresas — igual que en web. Comparamos
      // por RFC (más confiable que el nombre, que puede variar en
      // mayúsculas / saltos de espacio).
      const rfcsDistintos = Array.from(new Set(
        claveValidations
          .map(v => v.empresa?.rfc)
          .filter((r): r is string => !!r)
      ));
      if (rfcsDistintos.length > 1) {
        const nombres = Array.from(new Set(
          claveValidations.map(v => v.empresa?.nombre).filter((n): n is string => !!n)
        ));
        return `No puedes mezclar claves SAT de empresas distintas (${nombres.join(' y ')}). Quita una y deja solo claves de la misma empresa.`;
      }
    }
    return null;
  };

  const goNextStep = () => {
    const err = validateWizardStep(wizardStep);
    if (err) { Alert.alert('Faltan datos', err); return; }
    // Si el cliente seleccionó "Pago sin factura" en step 0, brincamos
    // de Beneficiario directo a Resumen — no hay nada que capturar
    // en step 3 (Factura).
    if (wizardStep === 2 && !requiereFactura) {
      setWizardStep(4);
      return;
    }
    setWizardStep((s) => Math.min((s + 1) as 0 | 1 | 2 | 3 | 4, 4) as 0 | 1 | 2 | 3 | 4);
  };
  const goPrevStep = () => {
    // Inversa del salto en goNextStep: desde resumen, si era pago sin
    // factura, regresamos a beneficiario (no a un step 3 vacío).
    if (wizardStep === 4 && !requiereFactura) {
      setWizardStep(2);
      return;
    }
    setWizardStep((s) => Math.max((s - 1) as 0 | 1 | 2 | 3 | 4, 0) as 0 | 1 | 2 | 3 | 4);
  };

  // Genera un PDF con las instrucciones de pago. Por defecto usa la
  // solicitud recién creada (lastReferencia + lastEmpresas) pero se
  // puede pasar override para descargar el PDF de cualquier solicitud
  // existente — usado desde la lista "Últimos envíos".
  const downloadInstructionsPDF = async (override?: { referencia: string; empresas: Array<{ clave_prodserv?: string; empresa?: string; monto?: number; divisa?: string; cuenta_bancaria?: any }> }) => {
    try {
      const referencia = override?.referencia || lastReferencia;
      const empresas = override?.empresas || lastEmpresas;
      if (!referencia) return;

      const esc = (s: any) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const fmt = (n: number, d = 2) => Number(n || 0).toLocaleString('es-MX', {
        minimumFractionDigits: d, maximumFractionDigits: d,
      });

      // Usamos el snapshot guardado al momento de crear la solicitud.
      // Si no existe (PDF re-descargado desde Últimos envíos tras
      // recargar la app), salimos con datos mínimos.
      const snap = lastFormSnapshot;
      const opSnap = snap ? {
        requiereFactura: snap.requiereFactura,
        divisa: snap.divisa,
        monto: snap.monto,
        razon: snap.razon,
        rfc: snap.rfc,
        tcFinal: snap.tcFinal,
        comision: snap.comision,
        total: snap.total,
      } : null;
      const benefSnap = snap ? {
        nombre: snap.benefName,
        nombreChino: snap.benefNameZh,
        banco: snap.benefBankName,
        cuenta: snap.benefAccount,
        iban: snap.benefIban,
        swift: snap.benefSwift,
        aba: snap.benefAba,
      } : null;

      // URL absoluta del logo (Print necesita URLs externas o data:).
      // Servido desde entregax.app/public — los mismos PNG que usa el web admin.
      const baseUrl = 'https://entregax.app';
      const logoXpay = `${baseUrl}/logo-completo-xpay-t.png`;
      const logoSquare = `${baseUrl}/logo-xpay-square.png`;

      const detalleRows: string[] = [];
      if (opSnap) {
        detalleRows.push(`<tr><td class="lbl">Servicio</td><td>${opSnap.requiereFactura ? 'Pago con factura' : 'Pago sin factura'}</td></tr>`);
        detalleRows.push(`<tr><td class="lbl">Divisa destino</td><td>${esc(opSnap.divisa)}</td></tr>`);
        detalleRows.push(`<tr><td class="lbl">Monto al proveedor</td><td><b>$${fmt(opSnap.monto)} ${esc(opSnap.divisa)}</b></td></tr>`);
        if (opSnap.requiereFactura && opSnap.razon) {
          detalleRows.push(`<tr><td class="lbl">Razón social</td><td>${esc(opSnap.razon)}</td></tr>`);
        }
        if (opSnap.requiereFactura && opSnap.rfc) {
          detalleRows.push(`<tr><td class="lbl">RFC</td><td class="mono">${esc(opSnap.rfc)}</td></tr>`);
        }
        if (opSnap.tcFinal > 0) {
          detalleRows.push(`<tr><td class="lbl">Tipo de cambio</td><td>$${fmt(opSnap.tcFinal, 4)} MXN / ${esc(opSnap.divisa)}</td></tr>`);
        }
        if (opSnap.comision > 0) {
          detalleRows.push(`<tr><td class="lbl">Comisión</td><td>$${fmt(opSnap.comision)} MXN</td></tr>`);
        }
      }

      const totalBar = opSnap && opSnap.total > 0 ? `
        <div class="total-bar">
          <div class="total-bar-left">
            <div class="total-label">TOTAL A PAGAR</div>
            <div class="total-sub">Importe a transferir desde la cuenta del cliente.</div>
          </div>
          <div class="total-amount">$${fmt(opSnap.total)} MXN</div>
        </div>
      ` : '';

      const depositarRows = empresas.length > 0 ? empresas.map((emp) => {
        const cb: any = emp.cuenta_bancaria || {};
        const banco = cb.banco || cb.bank || '';
        const titular = cb.titular || cb.holder || emp.empresa || '';
        const cuenta = cb.cuenta || cb.account || cb.numero_cuenta || '';
        const clabe = cb.clabe || cb.CLABE || '';
        const sucursal = cb.sucursal || cb.branch || '';
        const moneda = cb.moneda || cb.currency || '';
        const rows: string[] = [];
        if (titular) rows.push(`<tr><td class="lbl">Empresa receptora</td><td><b>${esc(titular)}</b></td></tr>`);
        if (banco) rows.push(`<tr><td class="lbl">Banco</td><td>${esc(banco)}${moneda ? ` (${esc(moneda)})` : ''}</td></tr>`);
        if (clabe) rows.push(`<tr><td class="lbl">CLABE</td><td class="mono">${esc(clabe)}</td></tr>`);
        if (cuenta) rows.push(`<tr><td class="lbl">Cuenta</td><td class="mono">${esc(cuenta)}</td></tr>`);
        if (sucursal) rows.push(`<tr><td class="lbl">Sucursal</td><td>${esc(sucursal)}</td></tr>`);
        if (emp.clave_prodserv) rows.push(`<tr><td class="lbl">Clave(s) SAT</td><td class="mono">${esc(emp.clave_prodserv)}</td></tr>`);
        return rows.join('');
      }).join('<tr><td colspan="2" style="height:6px;border:0;"></td></tr>') : '';

      const benefRows: string[] = [];
      if (benefSnap?.nombre) {
        benefRows.push(`<tr><td class="lbl">Nombre</td><td><b>${esc(benefSnap.nombre)}</b></td></tr>`);
        if (benefSnap.nombreChino) benefRows.push(`<tr><td class="lbl">Nombre (chino)</td><td>${esc(benefSnap.nombreChino)}</td></tr>`);
        if (benefSnap.banco) benefRows.push(`<tr><td class="lbl">Banco</td><td>${esc(benefSnap.banco)}</td></tr>`);
        if (benefSnap.cuenta) benefRows.push(`<tr><td class="lbl">Cuenta</td><td class="mono">${esc(benefSnap.cuenta)}</td></tr>`);
        if (benefSnap.iban) benefRows.push(`<tr><td class="lbl">IBAN</td><td class="mono">${esc(benefSnap.iban)}</td></tr>`);
        if (benefSnap.swift) benefRows.push(`<tr><td class="lbl">SWIFT/BIC</td><td class="mono">${esc(benefSnap.swift)}</td></tr>`);
        if (benefSnap.aba) benefRows.push(`<tr><td class="lbl">ABA</td><td class="mono">${esc(benefSnap.aba)}</td></tr>`);
      }

      // Template HTML que replica el PDF corporativo del web
      // (EntangledPaymentRequest.tsx:1216 generateInstructionsPDF).
      const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" />
<style>
  @page { margin: 36px 32px; size: letter; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #111827; margin: 0; padding: 0; font-size: 11px;
    position: relative;
  }
  /* Watermark X-PAY rotado */
  .watermark {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 160px; font-weight: 900; color: rgba(10,10,10,0.04);
    letter-spacing: 8px; z-index: -1; pointer-events: none;
    white-space: nowrap;
  }
  /* HEADER negro con logo + trust seal */
  .header {
    background: #0a0a0a; color: #fff; padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 3px solid #F05A28;
  }
  .header .logo { display: flex; align-items: center; gap: 16px; }
  .header .logo img { height: 36px; }
  .header .logo .title-block { line-height: 1.3; }
  .header .logo .eyebrow { font-size: 7px; color: #b3b3b3; letter-spacing: 1.5px; font-weight: 600; }
  .header .logo .title { font-size: 10px; color: #fff; font-weight: 700; }
  .header .meta { text-align: right; }
  .trust-seal {
    display: inline-block; border: 1px solid #fff; color: #fff;
    padding: 3px 10px; border-radius: 12px; font-size: 6.5px;
    letter-spacing: 1.5px; font-weight: 700;
  }
  .header .meta .emitido { color: #aaa; font-size: 7px; margin-top: 5px; }
  .container { padding: 18px 24px; }

  /* REFERENCIA DE PAGO card */
  .ref {
    border: 1.5px solid #F05A28; border-left: 5px solid #F05A28;
    border-radius: 8px; padding: 14px 18px; background: #fff;
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
  }
  .ref .ref-info .ref-label {
    font-size: 8px; color: #6B7280; font-weight: 700; letter-spacing: 1.5px;
  }
  .ref .ref-info .ref-code {
    font-family: 'Courier New', Courier, monospace; font-weight: 900;
    font-size: 26px; color: #F05A28; margin-top: 4px; letter-spacing: 1px;
  }
  .ref .ref-info .ref-help {
    font-size: 8px; color: #6B7280; margin-top: 6px; line-height: 1.5;
  }
  .ref .ref-logo { display: flex; align-items: center; }
  .ref .ref-logo img { height: 56px; width: 56px; object-fit: contain; }

  /* Panel header (label naranja con barrita) */
  .panel-title {
    font-size: 8px; color: #F05A28; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1.5px;
    margin: 14px 0 0 0; padding-bottom: 3px;
    border-bottom: 1.2px solid #F05A28; display: inline-block;
  }
  .panel {
    border: 0.6px solid #E5E7EB; border-radius: 4px;
    padding: 8px 10px; margin-top: 6px; margin-bottom: 4px;
  }
  table.panel-table {
    width: 100%; border-collapse: collapse;
  }
  table.panel-table td {
    padding: 5px 0; vertical-align: top; font-size: 10px;
    border-bottom: 0.3px solid #E5E7EB;
  }
  table.panel-table tr:last-child td { border-bottom: 0; }
  table.panel-table td.lbl { color: #6B7280; width: 35%; font-size: 9.5px; }
  table.panel-table td.mono { font-family: 'Courier New', Courier, monospace; }

  /* TOTAL A PAGAR barra negra */
  .total-bar {
    background: #0a0a0a; color: #fff;
    border-left: 4px solid #F05A28;
    border-radius: 4px; padding: 10px 16px;
    display: flex; align-items: center; justify-content: space-between;
    margin: 12px 0;
  }
  .total-bar .total-label {
    font-size: 8px; color: #b3b3b3; letter-spacing: 1px; font-weight: 600;
  }
  .total-bar .total-sub {
    font-size: 7.5px; color: #8a8a8a; margin-top: 2px;
  }
  .total-bar .total-amount {
    font-size: 20px; font-weight: 900; color: #F05A28;
  }

  /* Aviso importante */
  .important {
    background: #FFFBEB; border: 1px solid #F59E0B; border-radius: 4px;
    padding: 10px 14px; margin-top: 14px;
  }
  .important .imp-title {
    font-size: 8.5px; font-weight: 700; color: #92400E; letter-spacing: 1px;
  }
  .important .imp-body {
    font-size: 9px; color: #78350F; line-height: 1.5; margin-top: 4px;
  }

  /* Footer fijo abajo */
  .footer {
    margin-top: 24px; padding-top: 10px; border-top: 0.4px solid #E5E7EB;
    display: flex; justify-content: space-between; align-items: flex-end;
    font-size: 7.5px; color: #6B7280;
  }
  .footer .left .brand { font-weight: 800; color: #0a0a0a; font-size: 8px; }
  .footer .left .sub { margin-top: 2px; }
</style></head>
<body>
  <div class="watermark">X-PAY</div>
  <div class="header">
    <div class="logo">
      <img src="${logoXpay}" alt="X-PAY" onerror="this.style.display='none'" />
      <div class="title-block">
        <div class="eyebrow">INSTRUCCIONES DE PAGO</div>
        <div class="title">Confirmación de solicitud de triangulación internacional</div>
      </div>
    </div>
    <div class="meta">
      <span class="trust-seal">SEGURO · CIFRADO · NIVEL BANCARIO</span>
      <div class="emitido">Emitido: ${esc(new Date().toLocaleString('es-MX'))}</div>
    </div>
  </div>

  <div class="container">
    <div class="ref">
      <div class="ref-info">
        <div class="ref-label">REFERENCIA DE PAGO</div>
        <div class="ref-code">${esc(referencia)}</div>
        <div class="ref-help">
          Incluye esta referencia en el concepto de tu<br />
          transferencia para conciliar tu pago automáticamente.
        </div>
      </div>
      <div class="ref-logo">
        <img src="${logoSquare}" alt="X-Pay" onerror="this.style.display='none'" />
      </div>
    </div>

    ${detalleRows.length > 0 ? `
      <div class="panel-title">Detalle de la operación</div>
      <div class="panel">
        <table class="panel-table">${detalleRows.join('')}</table>
      </div>
    ` : ''}

    ${totalBar}

    ${depositarRows ? `
      <div class="panel-title">Depositar / Transferir a</div>
      <div class="panel">
        <table class="panel-table">${depositarRows}</table>
      </div>
    ` : ''}

    ${benefRows.length > 0 ? `
      <div class="panel-title">Beneficiario final</div>
      <div class="panel">
        <table class="panel-table">${benefRows.join('')}</table>
      </div>
    ` : ''}

    <div class="important">
      <div class="imp-title">IMPORTANTE</div>
      <div class="imp-body">
        Incluye la referencia <b>${esc(referencia)}</b> en el concepto de tu transferencia.<br />
        Una vez realizado el depósito, sube tu comprobante desde "Últimos envíos" para procesar tu solicitud.
      </div>
    </div>

    <div class="footer">
      <div class="left">
        <div class="brand">X-PAY DIRECT</div>
        <div class="sub">Operación protegida por cifrado bancario AES-256</div>
      </div>
      <div class="right">EntregaX Paquetería · ${esc(new Date().toLocaleString('es-MX'))}</div>
    </div>
  </div>
</body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `XPay-${referencia}.pdf`, UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF generado', `Archivo guardado en: ${uri}`);
      }
    } catch (err: any) {
      Alert.alert('Error generando PDF', err?.message || 'No se pudo generar el archivo');
    }
  };

  const statusColor = (s: string) => {
    if (['completado', 'emitida', 'enviado', 'pagado'].includes(s)) return ORANGE;
    if (['en_proceso', 'pendiente', 'esperando_comprobante'].includes(s)) return '#f59e0b';
    if (['rechazado', 'error_envio', 'error'].includes(s)) return '#dc2626';
    if (['cancelado'].includes(s)) return '#6B7280';
    return '#64748b';
  };

  const uploadComprobante = async (requestId: number) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: false,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingId(requestId);
    try {
      const formData = new FormData();
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      formData.append('comprobante', { uri: asset.uri, name: `comprobante.${ext}`, type: asset.mimeType || `image/${ext}` } as any);
      const res = await fetch(`${API_URL}/api/entangled/payment-requests/${requestId}/upload-proof-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadSuccessModal({ visible: true, referencia: data.referencia_pago || '' });
        loadRequests();
      } else {
        Alert.alert('Error', data.error || 'No se pudo subir el comprobante');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error de red');
    }
    setUploadingId(null);
  };

  // formatElapsed eliminado — el cronómetro "Procesando: Xd Xh" se
  // movió al panel admin web (decisión de producto).

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
          source={require('../../assets/logo-completo-xpay-t.png')}
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

        <Text style={styles.label}>Monto a Enviar</Text>
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
          <View style={{ flexDirection: 'row', gap: 4, marginLeft: 6 }}>
            {(['USD', 'RMB'] as const).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.amountSuffixBadge, calcDivisa === d && { backgroundColor: ORANGE, borderColor: ORANGE }]}
                onPress={() => setCalcDivisa(d)}
              >
                <Text style={[styles.amountSuffixText, calcDivisa === d && { color: '#fff' }]}>{d}</Text>
              </TouchableOpacity>
            ))}
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
              setDivisa(calcDivisa);
              if (defaultProvider) setSelectedProviderId(defaultProvider.id);
              setSelectedSupplierId('new');
              setShowNewSupplierForm(false);
              // Empezamos en step 0 (Servicio) — el usuario debe elegir
              // con/sin factura antes de capturar el monto.
              setWizardStep(0);
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
          onPress={() => { setSelectedSupplierId('new'); setShowNewSupplierForm(false); setWizardStep(2); setViewMode('wizard'); }}
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
            const isActive = ['pendiente', 'en_proceso', 'error_envio', 'esperando_comprobante'].includes(String(r.estatus_global || '').toLowerCase());
            const sc = statusColor(r.estatus_global);
            return (
              <View key={r.id} style={[styles.requestItem, idx === requests.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: `${ORANGE}55`, backgroundColor: `${ORANGE}12` }}>
                    <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }}>
                      {r.referencia_pago || `XP${String(r.id).padStart(6, '0')}`}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${sc}18`, borderColor: `${sc}45` }]}>
                    <Text style={[styles.statusBadgeText, { color: sc }]}>
                      {(r.estatus_global || '-').toUpperCase().replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: ORANGE, fontWeight: '900', fontSize: 22, marginTop: 8, letterSpacing: 0.3 }}>
                  {Number(r.op_monto).toLocaleString()} {r.op_divisa_destino}
                </Text>

                {/* Deadline OR chronometer */}
                {isActive && !r.comprobante_subido_at && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="time-outline" size={11} color="#FBBF24" />
                    <Text style={{ color: '#FBBF24', fontSize: 10, fontWeight: '700' }}>
                      Vence: {formatDateTime(deadline)}
                    </Text>
                  </View>
                )}
                {/* Cliente pidió quitar el cronómetro verde "Procesando: Xd Xh"
                    de las cards mobile — los días transcurridos viven en el
                    panel admin web, no aquí. */}

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

                {/* Fila de acciones: "Subir comprobante" + "Descargar
                    instrucciones" — simétricos lado a lado, ambos flex:1. */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'stretch' }}>
                  {isActive && !r.op_comprobante_cliente_url ? (
                    <TouchableOpacity
                      style={[styles.uploadBtn, { flex: 1, marginTop: 0 }]}
                      onPress={() => uploadComprobante(r.id)}
                      disabled={uploadingId === r.id}
                    >
                      {uploadingId === r.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <><Ionicons name="cloud-upload-outline" size={14} color="#fff" /><Text style={styles.uploadBtnText}>Subir comprobante</Text></>
                      }
                    </TouchableOpacity>
                  ) : isActive && !!r.op_comprobante_cliente_url ? (
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.08)' }}
                      onPress={() => uploadComprobante(r.id)}
                    >
                      <Ionicons name="checkmark-circle" size={14} color="#4ade80" />
                      <Text style={{ color: '#4ade80', fontSize: 11, fontWeight: '700' }}>Reemplazar</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.linkBtn, { flex: 1, borderColor: ORANGE, justifyContent: 'center', paddingVertical: 10 }]}
                    onPress={() => downloadInstructionsPDF({
                      referencia: r.referencia_pago || `XP${String(r.id).padStart(6, '0')}`,
                      empresas: r.instructions_snapshot?.empresas || [],
                    })}
                  >
                    <Ionicons name="document-text-outline" size={13} color={ORANGE} />
                    <Text style={[styles.linkText, { color: ORANGE }]}>Descargar instrucciones</Text>
                  </TouchableOpacity>
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

        {/* Stepper — 5 pasos igual que la web (0-Servicio / 1-Monto /
            2-Beneficiario / 3-Factura / 4-Resumen). El step 3 se muestra
            con opacity reducida cuando el cliente eligió "Pago sin
            factura" porque será saltado. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, justifyContent: 'space-between' }}>
          {([
            { id: 0 as const, label: 'Servicio' },
            { id: 1 as const, label: 'Monto' },
            { id: 2 as const, label: 'Beneficiario' },
            { id: 3 as const, label: 'Factura' },
            { id: 4 as const, label: 'Resumen' },
          ] as const).map((s, idx) => {
            const isActive = wizardStep === s.id;
            const isDone = wizardStep > s.id;
            const isSkipped = s.id === 3 && !requiereFactura && wizardStep > 0;
            return (
              <React.Fragment key={s.id}>
                <TouchableOpacity
                  style={{ alignItems: 'center', gap: 5, opacity: isSkipped ? 0.35 : 1 }}
                  onPress={() => setWizardStep(s.id)}
                  disabled={isSkipped}
                >
                  <View style={[
                    styles.stepCircle,
                    isActive && styles.stepCircleActive,
                    isDone && styles.stepCircleDone,
                  ]}>
                    {isDone
                      ? <Ionicons name="checkmark" size={11} color={ORANGE} />
                      : <Text style={[styles.stepCircleText, isActive && { color: '#fff' }]}>{s.id}</Text>
                    }
                  </View>
                  <Text style={[styles.stepLabel, isActive && { color: ORANGE }, isDone && { color: ORANGE, opacity: 0.7 }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
                {idx < 4 && (
                  <View style={[styles.stepLine, (isDone || isActive) && { backgroundColor: ORANGE }]} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Step 0: Selección de servicio (con/sin factura SAT) */}
        {wizardStep === 0 && (
          <View>
            <Text style={[styles.sectionTitle, { fontSize: 14, marginBottom: 6 }]}>¿Qué tipo de envío necesitas?</Text>
            <Text style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 14 }}>
              Selecciona si requieres factura SAT para tu cliente final o si solo necesitas enviar el pago al proveedor.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { setRequiereFactura(true); setWizardStep(1); }}
              style={{
                borderWidth: 2,
                borderColor: requiereFactura ? ORANGE : BORDER,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
                backgroundColor: requiereFactura ? 'rgba(240,90,40,0.08)' : SURFACE_2,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Ionicons name="receipt-outline" size={22} color={ORANGE} />
                <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>Pago con factura SAT</Text>
              </View>
              <Text style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
                Emite factura SAT a tu cliente final. Requiere datos fiscales (RFC, régimen, uso CFDI) y conceptos.
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(240,90,40,0.18)' }}>
                  <Text style={{ color: ORANGE, fontSize: 10, fontWeight: '700' }}>CFDI 4.0</Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(240,90,40,0.18)' }}>
                  <Text style={{ color: ORANGE, fontSize: 10, fontWeight: '700' }}>Triangulación SAT</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { setRequiereFactura(false); setWizardStep(1); }}
              style={{
                borderWidth: 2,
                borderColor: !requiereFactura && wizardStep > 0 ? ORANGE : BORDER,
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
                backgroundColor: SURFACE_2,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Ionicons name="cash-outline" size={22} color={GREEN} />
                <Text style={{ color: TEXT, fontWeight: '700', fontSize: 15 }}>Pago sin factura</Text>
              </View>
              <Text style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
                Solo envía el pago al proveedor internacional. No se emite factura SAT.
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(74,222,128,0.18)' }}>
                  <Text style={{ color: GREEN, fontSize: 10, fontWeight: '700' }}>Sin RFC</Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(74,222,128,0.18)' }}>
                  <Text style={{ color: GREEN, fontSize: 10, fontWeight: '700' }}>Proceso ágil</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

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
            <Text style={[styles.sectionTitle, { fontSize: 13, marginTop: 16, marginBottom: 12 }]}>
              🏦 {t('xpay.supplierSection', 'Proveedor de envío')}
            </Text>

            {/* Chips de proveedores guardados + botón Nuevo */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.chip, styles.chipActive, { marginRight: 6 }]}
                onPress={() => {
                  handlePickSupplier('new');
                  setShowNewSupplierForm(true);
                  setEditingSupplierData(false);
                }}
              >
                <Text style={[styles.chipText, styles.chipTextActive]}>+ Nuevo</Text>
              </TouchableOpacity>
              {savedSuppliers.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, selectedSupplierId === s.id && !showNewSupplierForm && styles.chipActive]}
                  onPress={() => {
                    handlePickSupplier(s.id);
                    setShowNewSupplierForm(false);
                    setEditingSupplierData(false);
                  }}
                >
                  <Text style={[styles.chipText, selectedSupplierId === s.id && !showNewSupplierForm && styles.chipTextActive]}>
                    {s.is_favorite ? '★ ' : ''}{s.alias || s.nombre_beneficiario}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tarjeta del proveedor guardado seleccionado */}
            {!showNewSupplierForm && selectedSupplierId !== 'new' && savedSuppliers.find(s => s.id === selectedSupplierId) && !editingSupplierData && (
              <View style={styles.infoCardOrange}>
                <Text style={styles.infoCardTitleOrange}>✓ {t('xpay.supplierSelected', 'Proveedor seleccionado')}</Text>
                <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>Beneficiario:</Text> {savedSuppliers.find(s => s.id === selectedSupplierId)?.nombre_beneficiario}</Text>
                {savedSuppliers.find(s => s.id === selectedSupplierId)?.banco_nombre && (
                  <Text style={styles.infoCardLine}><Text style={styles.infoCardLineLabel}>Banco:</Text> {savedSuppliers.find(s => s.id === selectedSupplierId)?.banco_nombre}</Text>
                )}
                <TouchableOpacity onPress={() => setEditingSupplierData(true)} style={{ marginTop: 6 }}>
                  <Text style={styles.editLink}>✏️ {t('xpay.editData', 'Editar datos')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Formulario — solo visible al tocar "+ Nuevo" o editar */}
            {(showNewSupplierForm || editingSupplierData) && (
              <>
                <Text style={styles.label}>{t('xpay.beneficiaryName', 'Nombre del beneficiario')} *</Text>
                <TextInput style={styles.input} value={benefName} onChangeText={setBenefName} />

                {divisa === 'RMB' && (
                  <>
                    <Text style={styles.label}>{t('xpay.chineseName', 'Nombre en chino')}</Text>
                    <TextInput style={styles.input} value={benefNameZh} onChangeText={setBenefNameZh} />
                  </>
                )}

                <Text style={styles.label}>{t('xpay.accountNumber', 'Número de cuenta')} *</Text>
                <TextInput style={styles.input} value={benefAccount} onChangeText={setBenefAccount} />

                <Text style={styles.label}>{t('xpay.bankName', 'Banco')} *</Text>
                <TextInput style={styles.input} value={benefBankName} onChangeText={setBenefBankName} />

                {!/alipay|wechat|paypal|wise/i.test(benefBankName) && (
                  <>
                    <Text style={styles.label}>{t('xpay.bankAddress', 'Dirección del banco')} *</Text>
                    <TextInput style={styles.input} value={benefBankAddress} onChangeText={setBenefBankAddress} />
                  </>
                )}

                <Text style={styles.label}>{t('xpay.swift', 'SWIFT/BIC')}</Text>
                <TextInput style={styles.input} value={benefSwift} onChangeText={setBenefSwift} autoCapitalize="characters" />

                <Text style={styles.label}>{t('xpay.aba', 'ABA/Routing')}</Text>
                <TextInput style={styles.input} value={benefAba} onChangeText={setBenefAba} keyboardType="numeric" />

                <Text style={styles.label}>{t('xpay.aliasOptional', 'Alias (opcional)')}</Text>
                <TextInput style={styles.input} value={benefAlias} onChangeText={setBenefAlias} />

                {showNewSupplierForm && (
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
            {/* La decisión con/sin factura ya se tomó en el step 0 (Servicio).
                Aquí mostramos solo el contenido correspondiente al modo
                "pago_con_factura". Si el cliente eligió "sin factura",
                este step se salta automáticamente en goNextStep. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, padding: 10, borderRadius: 8, backgroundColor: 'rgba(240,90,40,0.08)', borderWidth: 1, borderColor: 'rgba(240,90,40,0.3)' }}>
              <Ionicons name="receipt-outline" size={18} color={ORANGE} />
              <Text style={{ color: TEXT, fontSize: 12, flex: 1 }}>
                Servicio seleccionado: <Text style={{ fontWeight: '700' }}>Pago con factura SAT</Text>.{' '}
                <Text style={{ color: ORANGE, fontWeight: '600' }} onPress={() => setWizardStep(0)}>Cambiar</Text>
              </Text>
            </View>

            {requiereFactura && (
              <>
                {rfc && razon && !editingFiscalData ? (
                  <View style={styles.infoCardSuccess}>
                    <Text style={styles.infoCardTitleSuccess}>✓ {t('xpay.fiscalLoaded', 'Datos fiscales cargados')}</Text>
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
                  </>
                )}

                {/* Claves SAT por operación (siempre visible cuando requiere factura) */}
                <View style={{ marginTop: 16, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FFD580', backgroundColor: '#FFF8E7' }}>
                  <Text style={[styles.sectionTitle, { fontSize: 13, marginBottom: 4 }]}>🧾 {t('xpay.claveSatPerOp', 'Claves SAT a facturar (por operación)')}</Text>
                  <Text style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8 }}>
                    {t('xpay.claveSatHint', 'Captura los códigos SAT de producto/servicio de esta operación específica.')}
                  </Text>
                  {claveHistory.length > 0 && (
                    <>
                      <Text style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>
                        ⭐ {t('xpay.claveSatRecent', 'Tus claves más usadas:')}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                        {claveHistory.slice(0, 10).map(h => (
                          <TouchableOpacity
                            key={h.clave}
                            style={[styles.chip, { borderColor: ORANGE }]}
                            onPress={() => appendClaveFromHistory(h)}
                          >
                            <Text style={[styles.chipText, { fontWeight: '600' }]}>{h.clave}</Text>
                            {!!h.descripcion && (
                              <Text style={[styles.chipText, { fontSize: 10 }]} numberOfLines={1}>
                                {String(h.descripcion).slice(0, 24)}
                              </Text>
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </>
                  )}
                  {/* Chips de claves seleccionadas (multi-producto) */}
                  {(() => {
                    const selected = conceptos
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .map(c => {
                        const clave = c.split('|')[0].trim();
                        const descFromPipe = c.split('|')[1]?.trim() || '';
                        const v = claveValidations.find(x => x.clave === clave);
                        return { clave, descripcion: v?.descripcion || descFromPipe };
                      });
                    if (selected.length === 0) return null;
                    return (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {selected.map(s => (
                          <View
                            key={s.clave}
                            style={{
                              flexDirection: 'row', alignItems: 'center',
                              backgroundColor: '#FFF', borderRadius: 16,
                              borderWidth: 1, borderColor: ORANGE,
                              paddingLeft: 10, paddingRight: 4, paddingVertical: 4,
                              gap: 6, maxWidth: '100%',
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#111', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                              {s.clave}
                            </Text>
                            {!!s.descripcion && (
                              <Text numberOfLines={1} style={{ fontSize: 11, color: TEXT_DIM, maxWidth: 140 }}>
                                · {s.descripcion}
                              </Text>
                            )}
                            <TouchableOpacity
                              onPress={() => removeClave(s.clave)}
                              hitSlop={{ top: 6, left: 6, right: 6, bottom: 6 }}
                              style={{
                                width: 20, height: 20, borderRadius: 10,
                                backgroundColor: '#FFE0D0',
                                alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              <Text style={{ fontSize: 13, color: ORANGE, fontWeight: '900', lineHeight: 16 }}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    );
                  })()}

                  {/* Buscador de productos SAT (autocomplete por nombre) */}
                  <Text style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 4 }}>
                    Buscar producto o ingresar clave SAT
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={conceptoSearchInput}
                    onChangeText={setConceptoSearchInput}
                    placeholder="Ej: focos, ropa, 25172203"
                    placeholderTextColor={TEXT_MUTED}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  {/* Dropdown de resultados */}
                  {conceptoSearchInput.trim().length >= 2 && !/^\d{6,10}$/.test(conceptoSearchInput.trim()) && (
                    <View style={{ marginTop: 6, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, backgroundColor: '#fff', maxHeight: 240 }}>
                      {conceptoSearching && (
                        <View style={{ padding: 10, flexDirection: 'row', alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={ORANGE} />
                          <Text style={{ marginLeft: 8, fontSize: 12, color: TEXT_DIM }}>Buscando en catálogo SAT…</Text>
                        </View>
                      )}
                      {!conceptoSearching && conceptoSearchError && (
                        <Text style={{ padding: 10, fontSize: 12, color: '#D32F2F' }}>⚠️ {conceptoSearchError}</Text>
                      )}
                      {!conceptoSearching && !conceptoSearchError && conceptoOptions.length === 0 && (
                        <Text style={{ padding: 10, fontSize: 12, color: TEXT_DIM }}>Sin resultados</Text>
                      )}
                      {!conceptoSearching && conceptoOptions.length > 0 && (
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}>
                          {conceptoOptions.map(opt => {
                            const ya = conceptos.split(',').map(s => s.trim().split('|')[0].trim()).includes(opt.clave_prodserv);
                            return (
                              <TouchableOpacity
                                key={opt.clave_prodserv}
                                disabled={ya}
                                onPress={() => {
                                  addClaveFromSearch(opt);
                                  setConceptoSearchInput('');
                                  setConceptoOptions([]);
                                }}
                                style={{
                                  paddingVertical: 10, paddingHorizontal: 12,
                                  borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
                                  opacity: ya ? 0.4 : 1,
                                  flexDirection: 'row', alignItems: 'center', gap: 8,
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '800', color: ORANGE, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', minWidth: 70 }}>
                                  {opt.clave_prodserv}
                                </Text>
                                <Text style={{ flex: 1, fontSize: 12, color: '#111' }} numberOfLines={2}>
                                  {opt.descripcion}
                                </Text>
                                {ya
                                  ? <Text style={{ fontSize: 10, color: TEXT_DIM }}>Agregada</Text>
                                  : <Text style={{ fontSize: 18, color: ORANGE, fontWeight: '700' }}>＋</Text>}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  )}

                  {/* Input legacy: aceptar clave numérica directa también
                      (para usuarios que copian/pegan una clave precisa) */}
                  {conceptoSearchInput.trim() !== '' && /^\d{6,10}$/.test(conceptoSearchInput.trim()) && (
                    <TouchableOpacity
                      onPress={() => {
                        addClaveFromSearch({ clave_prodserv: conceptoSearchInput.trim(), descripcion: '' });
                        setConceptoSearchInput('');
                      }}
                      style={{
                        marginTop: 6, padding: 10,
                        borderWidth: 1, borderColor: ORANGE, borderRadius: 8,
                        backgroundColor: '#FFF6F0',
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                      }}
                    >
                      <Text style={{ color: ORANGE, fontSize: 18, fontWeight: '700' }}>＋</Text>
                      <Text style={{ flex: 1, fontSize: 12, color: '#111' }}>
                        Agregar clave <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '800' }}>{conceptoSearchInput.trim()}</Text>
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Validación inline contra catálogo SAT ENTANGLED */}
                  {claveValidations.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      {claveValidations.map((v, i) => (
                        <View
                          key={`${v.clave}-${i}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            marginBottom: 4,
                            borderRadius: 6,
                            backgroundColor: v.loading ? '#FFF3CD' : v.ok ? '#D1FAE5' : '#FEE2E2',
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', marginRight: 8, color: v.loading ? '#92400E' : v.ok ? '#065F46' : '#991B1B' }}>
                            {v.loading ? '⏳' : v.ok ? '✓' : '✗'}
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#111', marginRight: 6 }}>{v.clave}</Text>
                          <Text style={{ fontSize: 11, color: '#374151', flex: 1 }} numberOfLines={2}>
                            {v.loading ? 'Validando...' : v.ok ? (v.descripcion || 'Disponible en catálogo') : 'No encontrada en catálogo SAT'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Empresa que emitirá la factura + cuenta bancaria —
                      datos vienen de POST /api/entangled/asignacion (web
                      hace lo mismo). Si las claves pertenecen a empresas
                      distintas (RFCs distintos), bloqueamos. */}
                  {claveValidations.length > 0 && (() => {
                    const validas = claveValidations.filter(v => v.ok && v.empresa?.rfc);
                    if (validas.length === 0) return null;
                    const rfcsUnicos = Array.from(new Set(
                      validas.map(v => v.empresa!.rfc).filter((r): r is string => !!r)
                    ));
                    const mezcla = rfcsUnicos.length > 1;
                    const empresa = validas[0].empresa!;
                    const cb = validas[0].cuentaBancaria || null;

                    if (mezcla) {
                      const nombres = Array.from(new Set(validas.map(v => v.empresa!.nombre).filter(Boolean)));
                      return (
                        <View
                          style={{
                            marginTop: 10,
                            padding: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#D32F2F',
                            backgroundColor: '#FEEBEE',
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#D32F2F', marginBottom: 4 }}>
                            ⚠️ Claves SAT de empresas distintas
                          </Text>
                          <Text style={{ fontSize: 12, color: '#B71C1C' }}>
                            No puedes mezclar claves que pertenecen a más de una empresa
                            en una sola operación. Empresas detectadas: {nombres.join(', ')}.
                            Quita una y deja solo claves de la misma empresa.
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View
                        style={{
                          marginTop: 10,
                          padding: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: ORANGE,
                          backgroundColor: '#FFF6F0',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: cb ? 6 : 0 }}>
                          <Ionicons name="business-outline" size={18} color={ORANGE} style={{ marginRight: 8 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: TEXT_DIM }}>
                              {t('xpay.providerAssigned', 'Empresa que emitirá la factura')}
                            </Text>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>
                              {empresa.nombre || '—'}
                            </Text>
                            {empresa.rfc && (
                              <Text style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                                RFC: {empresa.rfc}
                              </Text>
                            )}
                          </View>
                        </View>
                        {cb && (cb.cuenta || cb.clabe || cb.banco) && (
                          <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#FFD9C2' }}>
                            <Text style={{ fontSize: 10, color: ORANGE, fontWeight: '700', letterSpacing: 0.4 }}>
                              💳 CUENTA BANCARIA ASIGNADA
                            </Text>
                            {!!cb.banco && <Text style={{ fontSize: 12, color: '#111', marginTop: 2 }}>Banco: <Text style={{ fontWeight: '700' }}>{cb.banco}</Text></Text>}
                            {!!cb.titular && <Text style={{ fontSize: 12, color: '#111' }}>Titular: <Text style={{ fontWeight: '700' }}>{cb.titular}</Text></Text>}
                            {!!cb.cuenta && <Text style={{ fontSize: 12, color: '#111' }}>Cuenta: <Text style={{ fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{cb.cuenta}</Text></Text>}
                            {!!cb.clabe && <Text style={{ fontSize: 12, color: '#111' }}>CLABE: <Text style={{ fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{cb.clabe}</Text></Text>}
                          </View>
                        )}
                      </View>
                    );
                  })()}
                </View>
              </>
            )}
          </>
        )}

        {/* Step 4: Resumen */}
        {wizardStep === 4 && (
          <View style={styles.quoteBox}>
            <Text style={styles.quoteTitle}>✓ Resumen total</Text>
            <Text style={styles.quoteLine}>Divisa: <Text style={styles.quoteVal}>{divisa}</Text></Text>
            <Text style={styles.quoteLine}>Monto al proveedor: <Text style={styles.quoteVal}>${formatMoney(monto || 0, 2)} {divisa}</Text></Text>

            {/* Empresa que emitirá la factura + cuenta bancaria asignada
                (viene de /api/entangled/asignacion para la primera clave
                SAT capturada — todas comparten empresa porque ya
                bloqueamos la mezcla). */}
            {requiereFactura && (() => {
              const validas = claveValidations.filter(v => v.ok && v.empresa?.rfc);
              if (validas.length === 0) return null;
              const empresa = validas[0].empresa!;
              const cb = validas[0].cuentaBancaria || null;
              const claves = validas.map(v => v.clave).join(', ');
              return (
                <View style={{ marginTop: 8, padding: 10, backgroundColor: '#0a0a0a', borderRadius: 8, borderWidth: 1, borderColor: ORANGE }}>
                  <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 }}>
                    🏢 REFERENCIA
                  </Text>
                  <Text style={styles.quoteLine}>Razón social: <Text style={styles.quoteVal}>{empresa.nombre || '—'}</Text></Text>
                  {!!empresa.rfc && <Text style={styles.quoteLine}>RFC: <Text style={[styles.quoteVal, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{empresa.rfc}</Text></Text>}
                  <Text style={styles.quoteLine}>Claves SAT: <Text style={styles.quoteVal}>{claves}</Text></Text>
                  {cb && (cb.cuenta || cb.clabe || cb.banco) && (
                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#333', borderStyle: 'dashed' as any }}>
                      <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 4 }}>
                        💳 CUENTA BANCARIA ASIGNADA
                      </Text>
                      {!!cb.banco && <Text style={styles.quoteLine}>Banco: <Text style={styles.quoteVal}>{cb.banco}{cb.moneda ? ` (${cb.moneda})` : ''}</Text></Text>}
                      {!!cb.titular && <Text style={styles.quoteLine}>Titular: <Text style={styles.quoteVal}>{cb.titular}</Text></Text>}
                      {!!cb.cuenta && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.quoteLine}>Cuenta: <Text style={[styles.quoteVal, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{cb.cuenta}</Text></Text>
                          <TouchableOpacity onPress={async () => { await Clipboard.setStringAsync(String(cb.cuenta)); }}>
                            <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700' }}>Copiar</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {!!cb.clabe && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.quoteLine}>CLABE: <Text style={[styles.quoteVal, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{cb.clabe}</Text></Text>
                          <TouchableOpacity onPress={async () => { await Clipboard.setStringAsync(String(cb.clabe)); }}>
                            <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700' }}>Copiar</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {!!cb.sucursal && <Text style={styles.quoteLine}>Sucursal: <Text style={styles.quoteVal}>{cb.sucursal}</Text></Text>}
                    </View>
                  )}
                </View>
              );
            })()}

            <Text style={[styles.quoteLine, { marginTop: 8 }]}>Proveedor ENTANGLED: <Text style={styles.quoteVal}>{providers.find((x) => x.id === selectedProviderId)?.name || '-'}</Text></Text>
            {(() => {
              const prov = providers.find((x) => x.id === selectedProviderId);
              const all = Array.isArray(prov?.bank_accounts) ? prov!.bank_accounts! : [];
              if (all.length === 0) return null;
              const mxn = all.filter((a) => String(a.currency || '').toUpperCase() === 'MXN');
              const accounts = mxn.length > 0 ? mxn : all;
              return (
                <View style={{ marginTop: 8, padding: 10, backgroundColor: '#0a0a0a', borderRadius: 8, borderWidth: 1, borderColor: ORANGE }}>
                  <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 }}>💳 DEPOSITAR / TRANSFERIR A:</Text>
                  {accounts.map((acc, i) => (
                    <View key={i} style={{ marginBottom: i < accounts.length - 1 ? 8 : 0, paddingBottom: i < accounts.length - 1 ? 8 : 0, borderBottomWidth: i < accounts.length - 1 ? 1 : 0, borderColor: '#333', borderStyle: 'dashed' }}>
                      {!!acc.bank && <Text style={styles.quoteLine}>Banco: <Text style={styles.quoteVal}>{acc.bank}{acc.currency ? ` (${acc.currency})` : ''}</Text></Text>}
                      {!!acc.holder && <Text style={styles.quoteLine}>Titular: <Text style={styles.quoteVal}>{acc.holder}</Text></Text>}
                      {!!acc.account && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.quoteLine}>Cuenta: <Text style={[styles.quoteVal, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{acc.account}</Text></Text>
                          <TouchableOpacity onPress={async () => { await Clipboard.setStringAsync(String(acc.account)); }}>
                            <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700' }}>Copiar</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {!!acc.clabe && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.quoteLine}>CLABE: <Text style={[styles.quoteVal, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{acc.clabe}</Text></Text>
                          <TouchableOpacity onPress={async () => { await Clipboard.setStringAsync(String(acc.clabe)); }}>
                            <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700' }}>Copiar</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {!!acc.reference && <Text style={styles.quoteLine}>Referencia: <Text style={styles.quoteVal}>{acc.reference}</Text></Text>}
                    </View>
                  ))}
                </View>
              );
            })()}
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
          {wizardStep > 0 && (
            <TouchableOpacity
              style={[styles.navBtn, styles.navBtnGhost]}
              onPress={goPrevStep}
            >
              <Text style={styles.navBtnGhostText}>{t('common.back', 'Atrás')}</Text>
            </TouchableOpacity>
          )}
          {wizardStep === 0 ? (
            // Step 0: la navegación se hace tocando una de las dos cards
            // (cada card avanza a step 1 directo). Aquí no mostramos
            // botón "Siguiente" para forzar la selección.
            null
          ) : wizardStep < 4 ? (
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
            source={require('../../assets/logo-completo-xpay-t.png')}
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

      {/* Upload Comprobante Success Modal */}
      <Modal
        visible={uploadSuccessModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setUploadSuccessModal({ visible: false, referencia: '' })}
      >
        <View style={styles.successOverlay}>
          <View style={[styles.successCard, { borderColor: '#4ade8055', borderWidth: 1 }]}>
            {/* Icono circular verde */}
            <View style={[styles.successIconWrap, { backgroundColor: '#16a34a' }]}>
              <Ionicons name="cloud-done-outline" size={22} color="#fff" />
            </View>
            <Text style={[styles.successTitle, { marginTop: 14 }]}>Comprobante enviado</Text>
            <Text style={[styles.successMessage, { marginTop: 6 }]}>
              Tu comprobante fue recibido con éxito.{'\n'}Nuestro equipo procesará tu operación.
            </Text>

            {/* Referencia */}
            {!!uploadSuccessModal.referencia && (
              <View style={styles.successRefBlock}>
                <Text style={styles.successRefLabel}>REFERENCIA DE PAGO</Text>
                <Text style={styles.successRefCode}>{uploadSuccessModal.referencia}</Text>
              </View>
            )}

            {/* metro iniciado */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)' }}>
              <Ionicons name="stopwatch-outline" size={13} color="#4ade80" />
              <Text style={{ color: '#4ade80', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 }}>Operacion Exitosa</Text>
            </View>

            <TouchableOpacity
              style={[styles.successBtn, { backgroundColor: '#16a34a', marginTop: 20 }]}
              onPress={() => setUploadSuccessModal({ visible: false, referencia: '' })}
            >
              <Text style={styles.successBtnText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
            {!!lastReferencia && (
              <View style={styles.successRefBlock}>
                <Text style={styles.successRefLabel}>Número de referencia de pago</Text>
                <Text style={styles.successRefCode}>{lastReferencia}</Text>
              </View>
            )}
            {lastEmpresas.length > 0 && (
              <ScrollView style={{ maxHeight: 260, alignSelf: 'stretch', marginTop: 6, marginBottom: 6 }}>
                <View style={{ borderWidth: 1, borderColor: ORANGE, borderRadius: 10, padding: 10, backgroundColor: 'rgba(255,102,0,0.06)' }}>
                  <Text style={{ color: ORANGE, fontWeight: '900', fontSize: 12, letterSpacing: 1, marginBottom: 8 }}>
                    💳 DEPOSITAR / TRANSFERIR A
                  </Text>
                  {lastEmpresas.map((emp, i) => {
                    const cb: any = emp.cuenta_bancaria || {};
                    const banco = cb.banco || cb.bank || '';
                    const titular = cb.titular || cb.holder || emp.empresa || '';
                    const cuenta = cb.cuenta || cb.account || cb.numero_cuenta || '';
                    const clabe = cb.clabe || cb.CLABE || '';
                    const sucursal = cb.sucursal || cb.branch || '';
                    return (
                      <View key={i} style={{ marginBottom: i < lastEmpresas.length - 1 ? 8 : 0, paddingBottom: i < lastEmpresas.length - 1 ? 8 : 0, borderBottomWidth: i < lastEmpresas.length - 1 ? 1 : 0, borderBottomColor: '#333', borderStyle: 'dashed' as any }}>
                        {!!emp.clave_prodserv && (
                          <Text style={{ color: TEXT_MUTED, fontSize: 11, marginBottom: 2 }}>
                            SAT <Text style={{ color: TEXT, fontWeight: '700' }}>{emp.clave_prodserv}</Text>
                            {emp.monto != null ? <Text> · {Number(emp.monto).toLocaleString()} {emp.divisa || ''}</Text> : null}
                          </Text>
                        )}
                        {!!banco && <Text style={{ color: TEXT, fontSize: 12 }}>Banco: <Text style={{ fontWeight: '800' }}>{banco}</Text></Text>}
                        {!!titular && <Text style={{ color: TEXT, fontSize: 12 }}>Titular: <Text style={{ fontWeight: '800' }}>{titular}</Text></Text>}
                        {!!cuenta && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: TEXT, fontSize: 12 }}>Cuenta: <Text style={{ fontWeight: '800' }}>{cuenta}</Text></Text>
                            <TouchableOpacity onPress={() => { Clipboard.setStringAsync(String(cuenta)); }}>
                              <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700' }}>Copiar</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {!!clabe && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: TEXT, fontSize: 12 }}>CLABE: <Text style={{ fontWeight: '800' }}>{clabe}</Text></Text>
                            <TouchableOpacity onPress={() => { Clipboard.setStringAsync(String(clabe)); }}>
                              <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '700' }}>Copiar</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {!!sucursal && <Text style={{ color: TEXT, fontSize: 12 }}>Sucursal: <Text style={{ fontWeight: '800' }}>{sucursal}</Text></Text>}
                      </View>
                    );
                  })}
                  <View style={{ marginTop: 8, padding: 8, borderRadius: 6, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' }}>
                    <Text style={{ color: '#fcd34d', fontSize: 11, fontWeight: '600' }}>
                      ⚠ Incluye la referencia <Text style={{ fontWeight: '900' }}>{lastReferencia}</Text> en el concepto de tu transferencia.
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}
            {/* Botón "Subir comprobante ahora" removido — al cerrar el
                modal e invocar uploadComprobante el picker se quedaba
                colgado/cerraba la pantalla. El usuario sube su
                comprobante desde "Últimos envíos" (donde sí funciona)
                cuando cierra este modal. */}
            {lastReferencia && (
              <TouchableOpacity
                // El estilo base successBtn tiene fondo naranja; lo
                // forzamos a transparente para que el texto naranja se
                // vea (antes quedaba naranja sobre naranja = invisible)
                style={[styles.successBtn, { backgroundColor: 'transparent', borderColor: ORANGE, borderWidth: 1, marginBottom: 8 }]}
                onPress={() => downloadInstructionsPDF()}
              >
                <Text style={[styles.successBtnText, { color: ORANGE }]}>📄 Descargar PDF de instrucciones</Text>
              </TouchableOpacity>
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
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: ORANGE, borderColor: ORANGE,
    shadowColor: ORANGE, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  stepCircleDone: { backgroundColor: SURFACE_2, borderColor: ORANGE },
  stepCircleText: { color: TEXT_MUTED, fontSize: 11, fontWeight: '800' },
  stepLabel: { color: TEXT_MUTED, fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
  stepLine: { flex: 1, height: 1.5, backgroundColor: BORDER, marginBottom: 14 },
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
  uploadBtn: {
    marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: ORANGE,
  },
  uploadBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
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
  successRefBlock: {
    marginTop: 16, width: '100%',
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(240,90,40,0.35)',
    backgroundColor: 'rgba(240,90,40,0.08)',
    paddingVertical: 10, paddingHorizontal: 14,
    alignItems: 'center',
  },
  successRefLabel: { color: TEXT_MUTED, fontSize: 10, letterSpacing: 1.5, fontWeight: '600', marginBottom: 4 },
  successRefCode: { color: ORANGE, fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  successBtn: {
    marginTop: 16, minWidth: 140, borderRadius: 22,
    paddingVertical: 10, paddingHorizontal: 18,
    alignItems: 'center', backgroundColor: ORANGE,
  },
  successBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
