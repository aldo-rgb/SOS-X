/**
 * QuoteHubScreen — Cotizador unificado para los 4 servicios de EntregaX:
 *   1. PO Box USA → MTY              (POST /api/quotes/pobox)
 *   2. TDI Aéreo China → MX          (POST /api/quotes/air-china)
 *   3. Marítimo China → MX           (POST /api/maritime/calculate)
 *   4. DHL Internacional → MTY       (POST /api/quotes/calculate)
 *
 * Wizard de 3 pasos:
 *   Paso 0: Selección del servicio
 *   Paso 1: Inputs específicos del servicio + toggle Garantía Extendida
 *   Paso 2: Desglose con USD / MXN / GEX / total
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';

const ORANGE = '#F05A28';
const RED = '#C1272D';
const BLACK = '#111';
const LIGHT_GRAY = '#F3F4F6';

type ServiceKey = 'pobox' | 'air_china' | 'maritime' | 'dhl';

interface Props {
  navigation: any;
  route: { params: { user: any; token: string } };
}

interface ServiceMeta {
  key: ServiceKey;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  emoji?: string;
  endpoint: string;
  eta: string;
}

const SERVICES: ServiceMeta[] = [
  { key: 'pobox',     title: 'Terrestre USA a México',          subtitle: 'USA → México',            description: 'Traslado de Estados Unidos desde 1 caja de zapatos hasta 1 contenedor completo', icon: 'package-variant', emoji: '🇺🇸', endpoint: '/api/quotes/pobox',       eta: '5-10 días'  },
  { key: 'air_china', title: 'Aéreo China',                    subtitle: 'Aéreo China → México',    description: 'Envío aéreo costo por kilo',                                                     icon: 'airplane',        emoji: '🇨🇳', endpoint: '/api/quotes/air-china',   eta: '10-15 días' },
  { key: 'maritime',  title: 'Marítimo China',                 subtitle: 'Marítimo China → México', description: 'Envía desde 1 caja hasta 1 contenedor completo',                                 icon: 'ferry',           emoji: '🇨🇳', endpoint: '/api/maritime/calculate', eta: '45-60 días' },
  { key: 'dhl',       title: 'Trámite Aduanal Monterrey',     subtitle: 'Despacho Aduanal',        description: 'Envía desde cualquier parte del mundo.',                                          icon: 'truck-fast',      emoji: '🌍', endpoint: '/api/public/quote',       eta: '1-3 días'   },
];

interface RatesService {
  id: string;
  nombre: string;
  tiempo_estimado: string;
  unidad: string;
  precio_base_usd: number;
  precio_base_mxn: number;
  tipo_cambio: number;
  icono?: string;
  precio_actualizado?: string | null;
}

interface MaritimeTier {
  category: string;
  min_cbm: string | number;
  max_cbm: string | number | null;
  price: string | number;
  is_flat_fee: boolean;
  notes?: string | null;
}

const formatMxn = (n: number | string | undefined | null): string => {
  const v = Number(n) || 0;
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
};
const formatUsd = (n: number | string | undefined | null): string => {
  const v = Number(n) || 0;
  return `$${v.toFixed(2)} USD`;
};

export default function QuoteHubScreen({ navigation, route }: Props) {
  const { user, token } = route.params;
  const { t, i18n } = useTranslation();
  const uiLang = i18n.language as 'es' | 'en' | 'zh';
  const L = (es: string, en: string, zh: string) => uiLang === 'zh' ? zh : uiLang === 'en' ? en : es;
  const qt = (k: string) => (t as any)(`quoteHub.${k}`, { defaultValue: k });

  const SERVICES_I18N: ServiceMeta[] = [
    { key: 'pobox'     as ServiceKey, title: qt('services.pobox.title'),     subtitle: qt('services.pobox.subtitle'),     description: qt('services.pobox.desc'),     icon: 'package-variant', emoji: '🇺🇸', endpoint: '/api/quotes/pobox',       eta: '5-10 días'  },
    { key: 'air_china' as ServiceKey, title: qt('services.air_china.title'), subtitle: qt('services.air_china.subtitle'), description: qt('services.air_china.desc'), icon: 'airplane',        emoji: '🇨🇳', endpoint: '/api/quotes/air-china',   eta: '10-15 días' },
    { key: 'maritime'  as ServiceKey, title: qt('services.maritime.title'),  subtitle: qt('services.maritime.subtitle'),  description: qt('services.maritime.desc'),  icon: 'ferry',           emoji: '🇨🇳', endpoint: '/api/maritime/calculate', eta: '45-60 días' },
    { key: 'dhl'       as ServiceKey, title: qt('services.dhl.title'),       subtitle: qt('services.dhl.subtitle'),       description: qt('services.dhl.desc'),       icon: 'truck-fast',      emoji: '🌍', endpoint: '/api/public/quote',       eta: '1-3 días'   },
  ];
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [service, setService] = useState<ServiceKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  // Inputs comunes
  const [weightKg, setWeightKg] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [cbmM3, setCbmM3] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Inputs específicos Marítimo (paridad con web)
  const [maritimeMode, setMaritimeMode] = useState<'volumen' | 'fcl_40'>('volumen');
  // Sub-tipo Aéreo China (paridad con web)
  const [airSubservice, setAirSubservice] = useState<'tdi_aereo' | 'tdi_express'>('tdi_aereo');
  const [estimatedValueUsd, setEstimatedValueUsd] = useState('');

  // Tarifas dinámicas del backend (mismo origen que web)
  const [rates, setRates] = useState<RatesService[]>([]);
  const [maritimeTiers, setMaritimeTiers] = useState<MaritimeTier[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [globalFxRate, setGlobalFxRate] = useState<number | null>(null);

  // Calcula días desde la última actualización de precios (más reciente entre servicios)
  const ratesAgeDays = useMemo(() => {
    const dates = rates
      .map(r => r.precio_actualizado ? new Date(r.precio_actualizado).getTime() : null)
      .filter((t): t is number => !!t);
    if (dates.length === 0) return null;
    const mostRecent = Math.max(...dates);
    return Math.floor((Date.now() - mostRecent) / (1000 * 60 * 60 * 24));
  }, [rates]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setRatesLoading(true);
        const [rRates, rTiers] = await Promise.all([
          fetch(`${API_URL}/api/public/rates`).then(r => r.json()).catch(() => null),
          fetch(`${API_URL}/api/public/maritime-tiers`).then(r => r.json()).catch(() => null),
        ]);
        if (cancelled) return;
        if (rRates?.servicios) setRates(rRates.servicios as RatesService[]);
        if (rRates?.tipo_cambio) setGlobalFxRate(Number(rRates.tipo_cambio));
        if (rTiers?.tiers) setMaritimeTiers(rTiers.tiers as MaritimeTier[]);
      } catch {
        /* ignorar — se mostrarán los textos hardcoded como fallback */
      } finally {
        if (!cancelled) setRatesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cliente solicitó cotizar siempre como Genérico — sin selector de
  // tipo de mercancía / categoría. Hardcodeo abajo en el body.

  // GEX universal
  const [includeGex, setIncludeGex] = useState(true);
  const [declaredValueMxn, setDeclaredValueMxn] = useState('');
  const [declaredCurrency, setDeclaredCurrency] = useState<'MXN' | 'USD'>('MXN');

  // Acordeón "¿Cómo se cotiza?" — colapsado por defecto.
  const [showPricingInfo, setShowPricingInfo] = useState(false);
  // Solicitud de cotización formal
  const [formalOpen, setFormalOpen] = useState(false);
  const [formalPhotos, setFormalPhotos] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [formalPacking, setFormalPacking] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [formalDesc, setFormalDesc] = useState('');
  const [formalNotes, setFormalNotes] = useState('');
  const [formalSubmitting, setFormalSubmitting] = useState(false);
  const selectedService = useMemo(() => SERVICES.find(s => s.key === service) || null, [service]);

  const goToSendForSelectedService = () => {
    if (!selectedService) return;
    const serviceMap: Record<ServiceKey, 'usa_pobox' | 'china_air' | 'china_sea' | 'mx_cedis'> = {
      pobox: 'usa_pobox',
      air_china: 'china_air',
      maritime: 'china_sea',
      dhl: 'mx_cedis',
    };

    navigation.navigate('ServicesGuide', {
      user,
      token,
      preselectedServiceType: serviceMap[selectedService.key],
    });
  };

  // ───────── Solicitud de cotización formal ─────────
  const pickFormalPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para adjuntar fotos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (res.canceled || !res.assets?.length) return;
    const items = res.assets.map(a => {
      const ext = (a.uri.split('.').pop() || 'jpg').toLowerCase();
      return { uri: a.uri, name: a.fileName || `foto.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
    });
    setFormalPhotos(prev => [...prev, ...items].slice(0, 10));
  };

  const pickFormalPacking = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (a.size && a.size > 20 * 1024 * 1024) {
        Alert.alert('Archivo muy grande', 'El packing list supera 20MB.');
        return;
      }
      setFormalPacking({
        uri: a.uri,
        name: a.name || 'packing-list',
        type: a.mimeType || 'application/pdf',
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo seleccionar el archivo.');
    }
  };

  const submitFormalQuote = async () => {
    if (formalPhotos.length === 0) {
      Alert.alert('Faltan fotos', 'Adjunta al menos una foto del producto.');
      return;
    }
    if (!formalPacking) {
      Alert.alert('Falta packing list', 'Adjunta el packing list (PDF o Excel).');
      return;
    }
    if (!selectedService) return;
    try {
      setFormalSubmitting(true);
      const fd = new FormData();
      // Mapear el servicio del mobile al backend
      const servicioMap: Record<ServiceKey, string> = {
        pobox: 'pobox',
        air_china: 'aereo',
        maritime: 'maritimo',
        dhl: 'dhl',
      };
      fd.append('servicio', servicioMap[selectedService.key]);
      if (lengthCm) fd.append('largo', lengthCm);
      if (widthCm) fd.append('ancho', widthCm);
      if (heightCm) fd.append('alto', heightCm);
      if (weightKg) fd.append('peso', weightKg);
      if (cbmM3) fd.append('cbm', cbmM3);
      if (quantity) fd.append('cantidad', quantity);
      const r: any = result || {};
      const precioUsd = r.precioVentaUsd ?? r.salePriceUsd ?? r.finalPriceUsd ?? r.usd;
      const precioMxn = r.totalMxn ?? r.precioVentaMxn ?? r.salePriceMxn ?? r.finalPriceMxn ?? r.mxn;
      const tc = r.tcFinal ?? r.fxRate;
      const pesoCobrable = r.pesoCobrable ?? r.chargeableWeight ?? r.peso_cobrable;
      const precioPorKg = r.precioPorKg ?? r.pricePerKg ?? r.precio_por_kg;
      const tiempoEstimado = r.tiempoEstimado ?? r.estimatedTime ?? r.tiempo_estimado ?? selectedService.eta;
      const categoria = r.categoria ?? r.category;
      const subservicio = r.subservicio ?? r.subservice;
      if (precioUsd != null) fd.append('precio_usd', String(precioUsd));
      if (precioMxn != null) fd.append('precio_mxn', String(precioMxn));
      if (tc != null) fd.append('tipo_cambio', String(tc));
      if (pesoCobrable != null) fd.append('peso_cobrable', String(pesoCobrable));
      if (precioPorKg != null) fd.append('precio_por_kg', String(precioPorKg));
      if (tiempoEstimado) fd.append('tiempo_estimado', String(tiempoEstimado));
      if (categoria) fd.append('categoria', String(categoria));
      if (subservicio) fd.append('subservicio', String(subservicio));
      if (formalDesc) fd.append('descripcion_producto', formalDesc);
      if (formalNotes) fd.append('observaciones', formalNotes);
      formalPhotos.forEach(f => {
        fd.append('photos', { uri: f.uri, name: f.name, type: f.type } as any);
      });
      fd.append('packing_list', { uri: formalPacking.uri, name: formalPacking.name, type: formalPacking.type } as any);

      const resp = await fetch(`${API_URL}/api/support/quote-formal-request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd as any,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || 'Error enviando solicitud');
      }
      Alert.alert(
        '✅ Solicitud enviada',
        json?.message || `Folio: ${json?.ticketFolio || ''}`,
        [{ text: 'OK', onPress: () => {
          setFormalOpen(false);
          setFormalPhotos([]);
          setFormalPacking(null);
          setFormalDesc('');
          setFormalNotes('');
        }}]
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo enviar la solicitud');
    } finally {
      setFormalSubmitting(false);
    }
  };

  const reset = () => {
    setStep(0);
    setService(null);
    setResult(null);
    setError(null);
    setWeightKg(''); setLengthCm(''); setWidthCm(''); setHeightCm('');
    setCbmM3(''); setQuantity('1');
    setMaritimeMode('volumen'); setEstimatedValueUsd('');
    setIncludeGex(true); setDeclaredValueMxn(''); setDeclaredCurrency('MXN');
  };

  const handleQuote = async () => {
    if (!selectedService) return;
    setError(null);
    setLoading(true);

    const w = parseFloat(weightKg) || 0;
    const l = parseFloat(lengthCm) || 0;
    const wd = parseFloat(widthCm) || 0;
    const h = parseFloat(heightCm) || 0;
    const rawDv = parseFloat(declaredValueMxn) || 0;
    const dv = declaredCurrency === 'USD' && globalFxRate ? rawDv * globalFxRate : rawDv;

    const cbm = parseFloat(cbmM3) || 0;
    const isMaritimeFCL = selectedService.key === 'maritime' && maritimeMode === 'fcl_40';

    if (selectedService.key === 'dhl') {
      // DHL Nacional: requiere peso y medidas (igual que web)
      if (w <= 0) { setLoading(false); setError('Captura el peso (kg)'); return; }
      if (l <= 0 || wd <= 0 || h <= 0) {
        setLoading(false); setError('Captura las medidas (largo, ancho, alto)'); return;
      }
    } else if (isMaritimeFCL) {
      // FCL 40: no requiere peso/CBM, solo cantidad de contenedores
    } else if (selectedService.key === 'maritime') {
      // Marítimo por volumen: basta con CBM (peso es opcional).
      if (cbm <= 0) { setLoading(false); setError('Captura los metros cúbicos (CBM)'); return; }
    } else {
      if (w <= 0) { setLoading(false); setError('Captura el peso (kg)'); return; }
      // TDI Aéreo se cotiza por peso (medidas opcionales).
      // PO Box sí cotiza por volumen y exige medidas.
      if (selectedService.key === 'pobox') {
        if (l <= 0 || wd <= 0 || h <= 0) {
          setLoading(false); setError('Captura las medidas (largo, ancho, alto)'); return;
        }
      }
    }
    if (includeGex && dv <= 0) { setLoading(false); setError('Captura el valor declarado para Garantía Extendida'); return; }

    let body: Record<string, any> = {
      weightKg: w, lengthCm: l, widthCm: wd, heightCm: h,
      declaredValueMxn: dv, includeGex,
    };
    if (selectedService.key === 'pobox') {
      body.quantity = Math.max(1, parseInt(quantity) || 1);
    } else if (selectedService.key === 'air_china') {
      body.tariffType = 'G';
      body.subservicio = airSubservice;
    } else if (selectedService.key === 'maritime') {
      body.userId = user?.id;
      body.category = 'Generico';
      body.cbm = cbm;
      if (isMaritimeFCL) body.subservicio = 'fcl_40';
    } else if (selectedService.key === 'dhl') {
      // DHL usa el endpoint público universal (mismo que web)
      body = {
        servicio: 'dhl',
        largo: l, ancho: wd, alto: h,
        peso: w,
        cantidad: Math.max(1, parseInt(quantity) || 1),
        categoria: 'STANDARD',
      };
    }

    try {
      const resp = await fetch(`${API_URL}${selectedService.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data?.error || `Error ${resp.status}`);
        setLoading(false);
        return;
      }
      setResult(data);
      setStep(2);
    } catch (e: any) {
      setError(e?.message || 'Error de red');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  //  Render
  // ============================================================

  const renderStep0 = () => (
    <ScrollView contentContainerStyle={styles.stepBody} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>{qt('selectService')}</Text>
      <Text style={styles.stepHint}>{qt('selectServiceHint')}</Text>

      {SERVICES_I18N.map((s, idx) => (
        <View key={s.key}>
          <TouchableOpacity
            style={[styles.serviceCard, service === s.key && styles.serviceCardActive]}
            onPress={() => { setService(s.key); setStep(1); }}
          >
            <View style={styles.serviceIconWrap}>
              {s.emoji
                ? <Text style={{ fontSize: 30 }}>{s.emoji}</Text>
                : <MaterialCommunityIcons name={s.icon as any} size={28} color={ORANGE} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceTitle}>{s.title}</Text>
              <Text style={styles.serviceSubtitle}>{s.subtitle}</Text>
              <Text style={[styles.serviceEta, { color: '#666', fontSize: 11, marginTop: 2 }]}>{s.description}</Text>
              <Text style={[styles.serviceEta, { marginTop: 4 }]}>⏱️ {s.eta}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#999" />
          </TouchableOpacity>

          {/* Botón "¿Cómo enviar?" entre Aéreo China (idx=1) y Marítimo China (idx=2) */}
          {idx === 1 && (
            <TouchableOpacity
              onPress={() => navigation.navigate('ServicesGuide', { user, token })}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#FFF5EE', borderRadius: 12, borderWidth: 1.5,
                borderColor: '#FF6B35', paddingVertical: 10, paddingHorizontal: 18,
                marginBottom: 10, gap: 6,
              }}
            >
              <MaterialCommunityIcons name="help-circle-outline" size={20} color="#FF6B35" />
              <Text style={{ color: '#FF6B35', fontWeight: '700', fontSize: 14 }}>{qt('howToSend')}</Text>
              <Image
                source={require('../../assets/logo-negro.png')}
                style={{ height: 25, width: 123, resizeMode: 'contain' }}
              />
              <Text style={{ color: '#FF6B35', fontWeight: '700', fontSize: 14 }}>?</Text>
              <Ionicons name="chevron-forward" size={16} color="#FF6B35" />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Tabla de Tarifas de Referencia (paridad con web) */}
      {(rates.length > 0 || ratesLoading) && (
        <View style={[styles.refTableWrap, { marginTop: 18 }]}>
          <View style={styles.refTableHeaderBar}>
            <MaterialCommunityIcons name="tag-multiple-outline" size={18} color="#fff" />
            <Text style={styles.refTableHeaderTitle}>{qt('refRates')}</Text>
            {ratesAgeDays !== null && ratesAgeDays > 10 && (
              <View style={styles.staleChip}>
                <MaterialCommunityIcons name="alert-outline" size={11} color="#7a4f00" />
                <Text style={styles.staleChipTxt}>{ratesAgeDays} días sin cambios</Text>
              </View>
            )}
            {ratesAgeDays !== null && ratesAgeDays <= 10 && (
              <View style={styles.freshChip}>
                <MaterialCommunityIcons name="check-circle" size={11} color="#1b5e20" />
                <Text style={styles.freshChipTxt}>{qt('updated')}</Text>
              </View>
            )}
          </View>
          {ratesLoading && rates.length === 0 ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ActivityIndicator color={ORANGE} />
            </View>
          ) : (
            <>
              <View style={[styles.tierRow, styles.tierHeader]}>
                <Text style={[styles.tierCell, styles.tierCellHead, { flex: 2 }]}>Servicio</Text>
                <Text style={[styles.tierCell, styles.tierCellHead, { flex: 1.2 }]}>Tiempo</Text>
                <Text style={[styles.tierCell, styles.tierCellHead, { flex: 1.5, textAlign: 'right' }]}>Precio</Text>
              </View>
              {rates.filter(s => !/dhl\s*nacional/i.test(s.nombre) && !/dhl\s*mty/i.test(s.nombre) && s.id !== 'dhl_monterrey').map((s) => {
                const nombre = s.nombre
                  .replace(/TDI\s*Express/gi, 'Aéreo Express')
                  .replace(/TDI\s*Aéreo/gi, 'Aéreo China')
                  .replace(/TDI\s*Aereo/gi, 'Aéreo China')
                  .replace(/PO\s*Box\s*USA/gi, 'Terrestre USA 🇺🇸')
                  .replace(/\(.*?\)/g, '').trim();
                return (
                <View key={s.id} style={styles.tierRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.tierCell, { fontWeight: '700' }]}>{s.icono || ''} {nombre}</Text>
                  </View>
                  <Text style={[styles.tierCell, { flex: 1.2, color: '#666' }]}>{s.tiempo_estimado}</Text>
                  <Text style={[styles.tierCell, { flex: 1.5, textAlign: 'right', color: ORANGE, fontWeight: '700' }]}>
                    ${Number(s.precio_base_usd).toFixed(2)} USD/{s.unidad === 'CBM' ? 'm³' : s.unidad}
                  </Text>
                </View>
              );
              })}
              {/* Footer con tipo de cambio actual */}
              {globalFxRate && (
                <View style={styles.fxFooter}>
                  <Text style={styles.fxFooterTxt}>
                    * Precios de referencia. Tipo de cambio actual:{' '}
                    <Text style={{ fontWeight: '700', color: BLACK }}>
                      ${globalFxRate.toFixed(4)} MXN/USD
                    </Text>
                    . Consulta cotización exacta.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );

  const renderInputsCommon = () => (
    <>
      {/* Selector tipo Marítimo (paridad con web): Por volumen vs FCL 40 pies */}
      {selectedService?.key === 'maritime' && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{L('Tipo de servicio marítimo','Maritime Service Type','海运服务类型')}</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, maritimeMode === 'volumen' && styles.chipActive]}
              onPress={() => setMaritimeMode('volumen')}
            >
              <Text style={[styles.chipText, maritimeMode === 'volumen' && styles.chipTextActive]}>📦 {L('Por volumen (m³)','By Volume (m³)','按体积(m³)')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, maritimeMode === 'fcl_40' && styles.chipActive]}
              onPress={() => setMaritimeMode('fcl_40')}
            >
              <Text style={[styles.chipText, maritimeMode === 'fcl_40' && styles.chipTextActive]}>🚢 {L('FCL 40 pies','FCL 40 ft','40尺整箱')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helpText}>
            {maritimeMode === 'volumen'
              ? L('Cotiza por metros cúbicos. Ideal para volúmenes mixtos.','Quote by cubic meters. Ideal for mixed volumes.','按立方米报价，适合混合货物。')
              : L('Contenedor completo de 40 pies (~66 m³). Cotiza por contenedor.','Full 40-ft container (~66 m³). Quote per container.','40尺整箱(约66m³)，按集装箱报价。')}
          </Text>
        </View>
      )}

      {/* Selector Aéreo / Express (solo para air_china) */}
      {selectedService?.key === 'air_china' && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{L('Tipo de servicio aéreo','Air Service Type','空运服务类型')}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([
              { key: 'tdi_aereo' as const, label: `✈️ ${L('Aéreo','Air','空运')}`, eta: '10-15 días' },
              { key: 'tdi_express' as const, label: `🚀 Express`, eta: '7-10 días' },
            ]).map(opt => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setAirSubservice(opt.key)}
                style={{
                  flex: 1, padding: 12, borderRadius: 10, borderWidth: 2,
                  borderColor: airSubservice === opt.key ? ORANGE : '#E0E0E0',
                  backgroundColor: airSubservice === opt.key ? '#FFF5F0' : '#FAFAFA',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: '700', color: airSubservice === opt.key ? ORANGE : '#333', fontSize: 15 }}>{opt.label}</Text>
                <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{opt.eta}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Peso (kg) — oculto para FCL 40 */}
      {!(selectedService?.key === 'maritime' && maritimeMode === 'fcl_40') && (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{L('Peso (kg)','Weight (kg)','重量(kg)')}{selectedService?.key === 'maritime' ? ` · ${L('opcional','optional','可选')}` : ''}</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            value={weightKg}
            onChangeText={setWeightKg}
            keyboardType="decimal-pad"
          />
        </View>
      )}

      {selectedService?.key === 'maritime' && maritimeMode === 'volumen' ? (
        <>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{L('Metros cúbicos (CBM · m³)','Cubic Meters (CBM · m³)','立方米(CBM · m³)')}</Text>
            <TextInput
              style={styles.input}
              placeholder="0.000"
              value={cbmM3}
              onChangeText={setCbmM3}
              keyboardType="decimal-pad"
            />
            <Text style={styles.helpText}>{L('Si lo conoces, omite las dimensiones.','If known, skip the dimensions.','如果已知，可省略尺寸。')}</Text>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{L('Dimensiones (cm) · opcional','Dimensions (cm) · optional','尺寸(cm) · 可选')}</Text>
            <View style={styles.dimensionsRow}>
              <TextInput style={[styles.input, styles.dimInput]} placeholder={L('Largo','Length','长')} value={lengthCm} onChangeText={setLengthCm} keyboardType="decimal-pad" />
              <Text style={styles.dimX}>×</Text>
              <TextInput style={[styles.input, styles.dimInput]} placeholder={L('Ancho','Width','宽')} value={widthCm} onChangeText={setWidthCm} keyboardType="decimal-pad" />
              <Text style={styles.dimX}>×</Text>
              <TextInput style={[styles.input, styles.dimInput]} placeholder={L('Alto','Height','高')} value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
            </View>
          </View>
        </>
      ) : selectedService?.key === 'maritime' && maritimeMode === 'fcl_40' ? null : (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            {L('Medidas (cm)','Dimensions (cm)','尺寸(cm)')}{selectedService?.key === 'air_china' ? ` · ${L('opcional','optional','可选')}` : ''}
          </Text>
          <View style={styles.dimensionsRow}>
            <TextInput style={[styles.input, styles.dimInput]} placeholder={L('Largo','Length','长')} value={lengthCm} onChangeText={setLengthCm} keyboardType="decimal-pad" />
            <Text style={styles.dimX}>×</Text>
            <TextInput style={[styles.input, styles.dimInput]} placeholder={L('Ancho','Width','宽')} value={widthCm} onChangeText={setWidthCm} keyboardType="decimal-pad" />
            <Text style={styles.dimX}>×</Text>
            <TextInput style={[styles.input, styles.dimInput]} placeholder={L('Alto','Height','高')} value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
          </View>
          {selectedService?.key === 'air_china' && parseFloat(weightKg) > 0 && (parseFloat(lengthCm) <= 0 || parseFloat(widthCm) <= 0 || parseFloat(heightCm) <= 0) && (
            <View style={[styles.disclaimerBox, { marginTop: 8, marginBottom: 0 }]}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#b26a00" />
              <Text style={styles.disclaimerText}>
                ℹ️ Cotizando sólo por peso real. El precio final puede variar si el peso volumétrico (dimensiones) resulta mayor. Te recomendamos capturar las medidas.
              </Text>
            </View>
          )}
        </View>
      )}
    </>
  );

  const renderInputsPerService = () => {
    if (!selectedService) return null;
    if (selectedService.key === 'pobox') {
      return (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{L('Cantidad de cajas','Number of Boxes','箱数')}</Text>
          <TextInput
            style={styles.input}
            placeholder="1"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />
        </View>
      );
    }
    if (selectedService.key === 'dhl') {
      return (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{L('Cantidad de paquetes','Number of Packages','包裹数量')}</Text>
          <TextInput
            style={styles.input}
            placeholder="1"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />
        </View>
      );
    }
    if (selectedService.key === 'maritime') {
      return (
        <>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {maritimeMode === 'fcl_40' ? L('Cantidad de contenedores','Number of Containers','集装箱数量') : L('Cantidad de paquetes','Number of Packages','包裹数量')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
            />
          </View>
        </>
      );
    }
    // El cotizador siempre asume Genérico para TDI Aéreo — sin selector visible.
    return null;
  };

  // ============================================================
  //  Detalle de cómo se cotiza cada servicio (transparencia al cliente)
  //  Los rangos / precios son los vigentes en producción (PO Box,
  //  TDI, Marítimo, DHL). Si admin cambia tarifas habrá que mover
  //  estos números a un endpoint de tarifas vigentes.
  // ============================================================
  const renderPricingInfo = () => {
    if (!selectedService) return null;

    let body: React.ReactNode = null;

    if (selectedService.key === 'pobox') {
      body = (
        <>
          <Text style={styles.infoFormula}>CBM = (Largo × Ancho × Alto) / 1,000,000</Text>
          <Text style={styles.infoSub}>Mínimo cobrable por caja: 0.010 m³</Text>

          <View style={styles.tierTable}>
            <View style={[styles.tierRow, styles.tierHeader]}>
              <Text style={[styles.tierCell, styles.tierCellHead, { flex: 1 }]}>Nivel</Text>
              <Text style={[styles.tierCell, styles.tierCellHead, { flex: 2 }]}>Rango CBM</Text>
              <Text style={[styles.tierCell, styles.tierCellHead, { flex: 1.6, textAlign: 'right' }]}>Costo</Text>
              <Text style={[styles.tierCell, styles.tierCellHead, { flex: 1.4, textAlign: 'right' }]}>Tipo</Text>
            </View>
            <View style={styles.tierRow}>
              <Text style={[styles.tierCell, { flex: 1, color: '#10B981', fontWeight: '700' }]}>1</Text>
              <Text style={[styles.tierCell, { flex: 2 }]}>0.0100 – 0.0500</Text>
              <Text style={[styles.tierCell, { flex: 1.6, textAlign: 'right' }]}>$39 USD</Text>
              <Text style={[styles.tierCell, { flex: 1.4, textAlign: 'right', color: '#666' }]}>Fijo</Text>
            </View>
            <View style={styles.tierRow}>
              <Text style={[styles.tierCell, { flex: 1, color: ORANGE, fontWeight: '700' }]}>2</Text>
              <Text style={[styles.tierCell, { flex: 2 }]}>0.0510 – 0.0990</Text>
              <Text style={[styles.tierCell, { flex: 1.6, textAlign: 'right' }]}>$79 USD</Text>
              <Text style={[styles.tierCell, { flex: 1.4, textAlign: 'right', color: '#666' }]}>Fijo</Text>
            </View>
            <View style={styles.tierRow}>
              <Text style={[styles.tierCell, { flex: 1, color: RED, fontWeight: '700' }]}>3</Text>
              <Text style={[styles.tierCell, { flex: 2 }]}>0.1000 +</Text>
              <Text style={[styles.tierCell, { flex: 1.6, textAlign: 'right' }]}>$750 / m³</Text>
              <Text style={[styles.tierCell, { flex: 1.4, textAlign: 'right', color: '#666' }]}>Por m³</Text>
            </View>
          </View>

          <Text style={styles.infoBlockTitle}>¿Cómo funciona el Nivel 3?</Text>
          <Text style={styles.infoBody}>
            A partir de 0.10 m³ el costo por caja se calcula como{' '}
            <Text style={styles.infoBold}>CBM × $750 USD</Text>. Hay una protección
            de mínimo: si el resultado queda por debajo del precio fijo del Nivel 2
            ($79 USD) se cobra el Nivel 2.
          </Text>
          <View style={styles.exampleBox}>
            <Text style={styles.exampleLine}>Ej. caja de 0.10 m³ → 0.10 × $750 = $75 → se cobra <Text style={styles.infoBold}>$79 USD</Text> (mínimo Nivel 2)</Text>
            <Text style={styles.exampleLine}>Ej. caja de 0.20 m³ → 0.20 × $750 = <Text style={styles.infoBold}>$150 USD</Text></Text>
            <Text style={styles.exampleLine}>Ej. caja de 0.50 m³ → 0.50 × $750 = <Text style={styles.infoBold}>$375 USD</Text></Text>
          </View>

          <Text style={styles.infoBlockTitle}>Conversión a MXN</Text>
          <Text style={styles.infoBody}>
            Total USD × Tipo de cambio del día (servicio PO Box). El TC se
            congela al momento de la cotización para que no cambie cuando la
            guía se procese después.
          </Text>

          <Text style={styles.infoBlockTitle}>Multi-caja</Text>
          <Text style={styles.infoBody}>
            Cada caja se cobra individualmente con su propio CBM. <Text style={styles.infoBold}>No</Text> se
            suman los volúmenes — 2 cajas de 0.04 m³ cobran $39 + $39 = $78,
            no $79 (que sería el Nivel 2 con CBM combinado de 0.08).
          </Text>
        </>
      );
    } else if (selectedService.key === 'air_china') {
      body = (
        <>
          <Text style={styles.infoFormula}>Peso volumétrico = (L × A × Alto) / 5,000</Text>
          <Text style={styles.infoSub}>Estándar IATA. Se cobra el mayor entre peso real y volumétrico.</Text>

          <Text style={styles.infoBlockTitle}>Tarifa por kg</Text>
          <Text style={styles.infoBody}>
            Costo USD = peso cobrable × tarifa por kg. Tu tarifa puede ser
            personalizada si tienes contrato; si no, usamos la tarifa pública.
          </Text>

          <Text style={styles.infoBlockTitle}>Tarifa StartUp</Text>
          <Text style={styles.infoBody}>
            Para envíos pequeños (peso real ≤ 15 kg) se aplica un precio
            plano por tramos en lugar de cobrar por kg. Aplica automáticamente
            si tu peso califica.
          </Text>

          <Text style={styles.infoBlockTitle}>Conversión a MXN</Text>
          <Text style={styles.infoBody}>
            Total USD × Tipo de cambio del servicio TDI Aéreo. El TC se
            congela al cotizar.
          </Text>
        </>
      );
    } else if (selectedService.key === 'maritime') {
      // Filtra tiers "Generico" (paridad con tabla web). Si no hay datos remotos
      // muestra la explicación textual de respaldo.
      const generico = (maritimeTiers || []).filter(t => /generico/i.test(t.category));
      body = (
        <>
          <Text style={styles.infoFormula}>CBM físico = (L × A × Alto) / 1,000,000</Text>
          <Text style={styles.infoFormula}>CBM volumétrico = peso (kg) / 600</Text>
          <Text style={styles.infoSub}>Se cobra el mayor entre CBM físico y volumétrico.</Text>

          {generico.length > 0 && (
            <>
              <Text style={styles.infoBlockTitle}>🚲 Tabla de Precios Marítimo China · Genérico (por CBM)</Text>
              <View style={styles.tierTable}>
                <View style={[styles.tierRow, styles.tierHeader]}>
                  <Text style={[styles.tierCell, styles.tierCellHead, { flex: 2 }]}>Rango CBM</Text>
                  <Text style={[styles.tierCell, styles.tierCellHead, { flex: 1.5, textAlign: 'right' }]}>Precio USD/CBM</Text>
                </View>
                {generico.map((t, idx) => {
                  const min = Number(t.min_cbm || 0).toFixed(2);
                  const maxNum = t.max_cbm == null ? null : Number(t.max_cbm);
                  const max = (maxNum == null || maxNum >= 9999) ? '∞' : maxNum.toFixed(2);
                  const label = t.is_flat_fee ? `Tarifa plana (≤ ${max} m³)` : `${min} – ${max} m³`;
                  return (
                    <View key={idx} style={styles.tierRow}>
                      <Text style={[styles.tierCell, { flex: 2 }]}>{label}</Text>
                      <Text style={[styles.tierCell, { flex: 1.5, textAlign: 'right', color: ORANGE, fontWeight: '700' }]}>
                        ${Number(t.price).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <Text style={styles.infoBlockTitle}>Brackets por CBM</Text>
          <Text style={styles.infoBody}>
            La tarifa por m³ baja conforme aumenta el volumen (descuento por
            escala). Si el CBM cae entre 0.76 y 0.99 m³ se redondea a 1 m³.
          </Text>
        </>
      );
    } else if (selectedService.key === 'dhl') {
      body = (
        <>
          <Text style={styles.infoFormula}>Tarifa fija por liberación + entrega local en Monterrey</Text>
          <Text style={styles.infoSub}>Aplica tarifa STANDARD o HIGH VALUE según el contenido declarado.</Text>

          <Text style={styles.infoBlockTitle}>Tarifas</Text>
          <Text style={styles.infoBody}>
            • <Text style={styles.infoBold}>STANDARD</Text>: tarifa base por liberación + entrega.
            {'\n'}• <Text style={styles.infoBold}>HIGH VALUE</Text>: paquetes con valor declarado alto.
          </Text>

          <Text style={styles.infoBlockTitle}>Conversión a MXN</Text>
          <Text style={styles.infoBody}>
            Total USD × Tipo de cambio del servicio DHL Monterrey. El TC se
            congela al cotizar.
          </Text>
        </>
      );
    }

    return (
      <View style={styles.infoCard}>
        <TouchableOpacity
          style={styles.infoToggle}
          onPress={() => setShowPricingInfo(v => !v)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="information-outline" size={18} color={BLACK} />
          <Text style={styles.infoToggleText}>{L('¿Cómo se cotiza este servicio?','How is this service quoted?','如何计算此服务报价？')}</Text>
          <Ionicons
            name={showPricingInfo ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#666"
          />
        </TouchableOpacity>
        {showPricingInfo && (
          <View style={styles.infoContent}>
            {body}
            <View style={styles.divider} />
            <Text style={styles.infoBlockTitle}>Garantía Extendida (opcional)</Text>
            <Text style={styles.infoBody}>
              Si activas la garantía: se suma{' '}
              <Text style={styles.infoBold}>(valor declarado × 5%) + $625 MXN</Text>{' '}
              al total. Cubre el tiempo de entrega de hasta 90 días naturales
              en caso de retraso.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderStep1 = () => (
    <ScrollView contentContainerStyle={styles.stepBody} keyboardShouldPersistTaps="handled">
      <View style={styles.serviceHeader}>
        <MaterialCommunityIcons name={(selectedService?.icon as any) || 'package-variant'} size={26} color={ORANGE} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={styles.serviceTitle}>{selectedService?.title}</Text>
          <Text style={styles.serviceSubtitle}>{selectedService?.subtitle}</Text>
        </View>
        <TouchableOpacity onPress={() => setStep(0)}>
          <Text style={styles.changeLink}>{L('Cambiar','Change','更换')}</Text>
        </TouchableOpacity>
      </View>

      {renderInputsCommon()}
      {renderInputsPerService()}

      {/* Garantía Extendida — universal */}
      <View style={styles.gexBox}>
        <View style={styles.gexHeader}>
          <View style={styles.gexShieldWrap}>
            <MaterialCommunityIcons name="shield" size={20} color={BLACK} />
            <View style={styles.gexCheckOverlay}>
              <MaterialCommunityIcons name="check-bold" size={11} color={ORANGE} />
            </View>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.gexTitle}>{L('Garantía Extendida','Extended Warranty','延保服务')}</Text>
            <Text style={styles.gexSub}>{L('5% del valor declarado + $625 MXN fijos','5% of declared value + $625 MXN fixed','申报价值的5% + 625比索固定费')}</Text>
          </View>
          <Switch
            value={includeGex}
            onValueChange={setIncludeGex}
            trackColor={{ false: '#ccc', true: ORANGE }}
            thumbColor="#fff"
          />
        </View>
        {includeGex && (
          <View style={[styles.fieldGroup, { marginTop: 8 }]}>
            <Text style={styles.label}>{L(`Valor declarado (${declaredCurrency})`,`Declared Value (${declaredCurrency})`,`申报价值(${declaredCurrency})`)}</Text>
            {/* Toggle MXN/USD */}
            <View style={{ flexDirection: 'row', marginBottom: 6, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', overflow: 'hidden', alignSelf: 'flex-start' }}>
              {(['MXN', 'USD'] as const).map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setDeclaredCurrency(c)}
                  style={{ paddingVertical: 6, paddingHorizontal: 16, backgroundColor: declaredCurrency === c ? '#F05A28' : '#FFF' }}
                >
                  <Text style={{ color: declaredCurrency === c ? '#FFF' : '#666', fontWeight: '700', fontSize: 12 }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={declaredValueMxn}
              onChangeText={setDeclaredValueMxn}
              keyboardType="decimal-pad"
            />
            {(() => {
              const raw = parseFloat(declaredValueMxn) || 0;
              const tc = globalFxRate || 0;
              if (raw <= 0 || tc <= 0) return null;
              const txt = declaredCurrency === 'USD'
                ? `≈ $${(raw * tc).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN (TC ${tc.toFixed(2)})`
                : `≈ USD $${(raw / tc).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (TC ${tc.toFixed(2)})`;
              return <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>{txt}</Text>;
            })()}
          </View>
        )}
      </View>

      {/* Sección expandible con el detalle de cómo se cotiza */}
      {renderPricingInfo()}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.disclaimerBox}>
        <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#b26a00" />
        <Text style={styles.disclaimerText}>
          {L('⚠️ Los precios mostrados son referenciales y pueden variar según el tipo de mercancía (genérico, artículos médicos, sensibles, etc.). El precio final se confirma al evaluar tu envío.','⚠️ Displayed prices are estimates and may vary by cargo type (generic, medical, sensitive, etc.). Final price is confirmed upon shipment review.','⚠️ 显示的价格仅供参考，可能因货物类型（普通、医疗、敏感等）而有所不同。最终价格在评估您的货物后确认。')}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
        onPress={handleQuote}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <>
            <MaterialCommunityIcons name="calculator-variant" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>{L('Cotizar','Get Quote','报价')}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderStep2 = () => {
    if (!result || !selectedService) return null;

    // Lecturas tolerantes a la forma de cada endpoint:
    const r: any = result;
    const totalMxn = r.totalMxn ?? r.precioVentaMxn ?? r.salePriceMxn ?? r.finalPriceMxn ?? r.finalPriceMXN ?? r.mxn ?? r.precio_mxn ?? 0;
    const baseMxn = r.precioVentaMxn ?? r.salePriceMxn ?? r.finalPriceMxn ?? r.finalPriceMXN ?? r.mxn ?? r.precio_mxn ?? 0;
    const baseUsd = r.precioVentaUsd ?? r.salePriceUsd ?? r.finalPriceUsd ?? r.usd ?? r.precio_usd ?? null;
    const fx = r.tcFinal ?? r.fxRate ?? r.tipo_cambio ?? null;
    const gex = r.gex || {};
    const tiempo = r.tiempoEstimado ?? r.estimatedTime ?? r.tiempo_estimado ?? selectedService.eta;
    const categoria = r.categoria ?? r.category ?? null;
    const cbmCobrable = r.chargeableCbm ?? r.cbm_cobrable ?? r.cbm ?? null;
    const pesoCobrable = r.chargeableKg ?? r.pesoCobrable ?? r.peso_cobrable ?? null;
    const cantidad = r.cantidad ?? r.cantidadCajas ?? null;

    // Card estilo web: USD grande → ≈ MXN → grid de detalles
    return (
      <ScrollView contentContainerStyle={styles.stepBody}>
        {/* Header naranja con chip de tiempo (paridad con web) */}
        <View style={styles.estCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
            <Text style={styles.estCardHeaderTxt}>Cotización Estimada</Text>
          </View>
          <View style={styles.etaChip}>
            <Text style={styles.etaChipTxt}>{tiempo}</Text>
          </View>
        </View>

        <View style={styles.estCardBody}>
          <Text style={styles.estCostLabel}>COSTO ESTIMADO</Text>
          {selectedService.key === 'maritime' ? (
            <>
              <Text style={styles.estCostUsd}>
                {formatMxn(totalMxn)}
                <Text style={styles.estCostMxnInline}> MXN</Text>
              </Text>
              {baseUsd != null && Number(baseUsd) > 0 && (
                <Text style={styles.estCostMxn}>
                  {L('Equivalente:', 'Equivalent:', '折合:')} {formatUsd(baseUsd)}
                </Text>
              )}
            </>
          ) : baseUsd != null && Number(baseUsd) > 0 ? (
            <>
              <Text style={styles.estCostUsd}>
                ${Number(baseUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <Text style={styles.estCostUsdSuffix}> USD</Text>
              </Text>
              <Text style={styles.estCostMxn}>≈ {formatMxn(totalMxn)}</Text>
            </>
          ) : (
            <Text style={styles.estCostUsd}>{formatMxn(totalMxn)}</Text>
          )}

          <View style={styles.dottedDivider} />

          {/* Grid 2x2 de detalles (paridad con web) */}
          <View style={styles.estGrid}>
            {cbmCobrable != null && (
              <View style={styles.estGridCell}>
                <Text style={styles.estGridLabel}>Volumen (CBM)</Text>
                <Text style={styles.estGridValue}>{Number(cbmCobrable).toFixed(4)} m³</Text>
              </View>
            )}
            {pesoCobrable != null && (
              <View style={styles.estGridCell}>
                <Text style={styles.estGridLabel}>Peso cobrable</Text>
                <Text style={styles.estGridValue}>{pesoCobrable} kg</Text>
              </View>
            )}
            {categoria && (
              <View style={styles.estGridCell}>
                <Text style={styles.estGridLabel}>Categoría</Text>
                <Text style={styles.estGridValue}>{categoria}</Text>
              </View>
            )}
            {cantidad && (
              <View style={styles.estGridCell}>
                <Text style={styles.estGridLabel}>Cantidad</Text>
                <Text style={styles.estGridValue}>{cantidad}</Text>
              </View>
            )}
            {fx && (
              <View style={styles.estGridCell}>
                <Text style={styles.estGridLabel}>Tipo de cambio</Text>
                <Text style={styles.estGridValue}>${Number(fx).toFixed(2)} MXN/USD</Text>
              </View>
            )}
            {r.isStartup && (
              <View style={styles.estGridCell}>
                <Text style={styles.estGridLabel}>Tarifa</Text>
                <Text style={styles.estGridValue}>StartUp 🚀</Text>
              </View>
            )}
          </View>

          {/* GEX desglose si aplica */}
          {gex?.gexTotalCost > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Garantía Extendida</Text>
                <Text style={[styles.rowValue, { color: ORANGE }]}>+ {formatMxn(gex.gexTotalCost)}</Text>
              </View>
              <Text style={styles.rowSubLabel}>
                Seguro 5% ({formatMxn(gex.gexInsuranceCost)}) + cuota fija {formatMxn(gex.gexFixedCost)}
              </Text>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontWeight: '800' }]}>TOTAL</Text>
                <Text style={[styles.rowValue, { fontSize: 16 }]}>{formatMxn(totalMxn)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Tabla de tarifas Marítimo China (paridad con web) */}
        {selectedService.key === 'maritime' && maritimeMode === 'volumen' && maritimeTiers.length > 0 && (() => {
          const generico = maritimeTiers.filter(t => /generico/i.test(t.category));
          if (generico.length === 0) return null;
          return (
            <View style={[styles.refTableWrap, { marginBottom: 12 }]}>
              <View style={styles.refTableHeaderBar}>
                <MaterialCommunityIcons name="ferry" size={18} color="#fff" />
                <Text style={styles.refTableHeaderTitle}>Tabla de Precios Marítimo China · Genérico</Text>
              </View>
              <View style={[styles.tierRow, styles.tierHeader]}>
                <Text style={[styles.tierCell, styles.tierCellHead, { flex: 1.5 }]}>Rango CBM</Text>
                <Text style={[styles.tierCell, styles.tierCellHead, { flex: 1, textAlign: 'right' }]}>USD/CBM</Text>
              </View>
              {generico.map((t, i) => {
                const minN = Number(t.min_cbm || 0);
                const maxN = t.max_cbm == null ? null : Number(t.max_cbm);
                const isActive = cbmCobrable != null &&
                  Number(cbmCobrable) >= minN &&
                  (maxN == null || Number(cbmCobrable) <= maxN);
                return (
                  <View key={i} style={[styles.tierRow, isActive && { backgroundColor: '#FFF4E5' }]}>
                    <Text style={[styles.tierCell, { flex: 1.5, fontWeight: isActive ? '700' : '400' }]}>
                      {minN.toFixed(2)} – {maxN == null ? '∞' : `${maxN.toFixed(2)} m³`}
                    </Text>
                    <Text style={[styles.tierCell, { flex: 1, textAlign: 'right', color: ORANGE, fontWeight: '700' }]}>
                      ${Number(t.price).toFixed(2)}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })()}

        <Text style={styles.disclaimer}>
          * Esta cotización es informativa. El cobro final puede variar según
          revisiones aduanales, fluctuación del tipo de cambio y servicios adicionales.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: ORANGE }]}
          onPress={goToSendForSelectedService}
        >
          <MaterialCommunityIcons name="send" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>{L('Enviar con este servicio','Send with this service','使用此服务发货')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: '#2e7d32' }]}
          onPress={() => setFormalOpen(true)}
        >
          <MaterialCommunityIcons name="file-document-edit" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>Solicitar Cotización Formal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryBtn} onPress={reset}>
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>Nueva cotización</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>Volver al inicio</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <View style={styles.safe}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => (step === 0 ? navigation.goBack() : setStep((step - 1) as 0 | 1))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ padding: 4 }}
        >
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
          <Image
            source={require('../../assets/x-logo-entregax.png')}
            style={{ width: 18, height: 18, marginRight: 6 }}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>{qt('title')}</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      {/* Indicador de pasos */}
      <View style={styles.stepIndicator}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[styles.stepDot, step >= i && styles.stepDotActive]} />
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
      </KeyboardAvoidingView>

      {/* Modal: Solicitar Cotización Formal */}
      <Modal
        visible={formalOpen}
        animationType="slide"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => !formalSubmitting && setFormalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              onPress={() => !formalSubmitting && setFormalOpen(false)}
              disabled={formalSubmitting}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ padding: 4 }}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center' }]}>Cotización Formal</Text>
            <View style={{ width: 34 }} />
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={styles.disclaimerBox}>
                <MaterialCommunityIcons name="information-outline" size={18} color="#b26a00" />
                <Text style={styles.disclaimerText}>
                  Adjunta fotos del producto y el packing list. Tu solicitud se enviará directo a tu asesor si tienes uno asignado, o a Servicio a Cliente para que un asesor responda.
                </Text>
              </View>

              <Text style={styles.label}>📷 Fotos del producto (1-10)</Text>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={pickFormalPhotos}
                disabled={formalSubmitting}
              >
                <MaterialCommunityIcons name="image-plus" size={20} color={ORANGE} />
                <Text style={styles.attachBtnText}>Seleccionar fotos</Text>
              </TouchableOpacity>
              {formalPhotos.length > 0 && (
                <View style={styles.fileChipsWrap}>
                  {formalPhotos.map((f, idx) => (
                    <View key={idx} style={styles.fileChip}>
                      <Text style={styles.fileChipText} numberOfLines={1}>{f.name}</Text>
                      <TouchableOpacity
                        onPress={() => setFormalPhotos(prev => prev.filter((_, i) => i !== idx))}
                        disabled={formalSubmitting}
                      >
                        <Ionicons name="close-circle" size={18} color="#999" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[styles.label, { marginTop: 16 }]}>📄 Packing List (PDF o Excel)</Text>
              <Text style={styles.helpText}>
                Documento con la lista detallada de la mercancía: número de cajas/bultos, dimensiones, peso, descripción y valor declarado de cada uno.
              </Text>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={pickFormalPacking}
                disabled={formalSubmitting}
              >
                <MaterialCommunityIcons name="file-document-outline" size={20} color={ORANGE} />
                <Text style={styles.attachBtnText}>
                  {formalPacking ? `✅ ${formalPacking.name}` : 'Seleccionar packing list'}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.label, { marginTop: 16 }]}>Descripción del producto</Text>
              <TextInput
                style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                value={formalDesc}
                onChangeText={setFormalDesc}
                placeholder="Ej. 50 cajas de calzado deportivo"
                multiline
                editable={!formalSubmitting}
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Observaciones (opcional)</Text>
              <TextInput
                style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                value={formalNotes}
                onChangeText={setFormalNotes}
                placeholder="Notas adicionales para tu asesor"
                multiline
                editable={!formalSubmitting}
              />

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: '#2e7d32', marginTop: 24 },
                  (formalSubmitting || formalPhotos.length === 0 || !formalPacking) && { opacity: 0.6 },
                ]}
                onPress={submitFormalQuote}
                disabled={formalSubmitting || formalPhotos.length === 0 || !formalPacking}
              >
                {formalSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={20} color="#fff" />
                    <Text style={styles.primaryBtnText}>Enviar solicitud</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  stepDot: { width: 28, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB' },
  stepDotActive: { backgroundColor: ORANGE },

  stepBody: { padding: 16, paddingBottom: 40 },
  stepTitle: { fontSize: 20, fontWeight: '800', color: BLACK, marginBottom: 4 },
  stepHint: { fontSize: 13, color: '#666', marginBottom: 18 },

  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  serviceCardActive: { borderColor: BLACK, borderWidth: 2 },
  serviceIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#FFF3E0',
    alignItems: 'center', justifyContent: 'center',
  },
  serviceTitle: { fontSize: 15, fontWeight: '700', color: BLACK },
  serviceSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },

  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT_GRAY,
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  changeLink: { color: ORANGE, fontSize: 13, fontWeight: '700' },

  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: BLACK, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: BLACK,
    backgroundColor: '#fff',
  },
  dimensionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dimInput: { flex: 1 },
  dimX: { fontSize: 18, color: '#999', fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: LIGHT_GRAY, borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: BLACK, borderColor: BLACK },
  chipText: { color: BLACK, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  gexBox: {
    backgroundColor: LIGHT_GRAY,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    marginBottom: 18,
  },
  gexHeader: { flexDirection: 'row', alignItems: 'center' },
  gexShieldWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  gexCheckOverlay: { position: 'absolute', top: 5, left: 5 },
  gexTitle: { fontSize: 14, fontWeight: '700', color: BLACK },
  gexSub: { fontSize: 11, color: '#666', marginTop: 2 },

  errorText: { color: RED, fontSize: 13, marginBottom: 8, fontWeight: '600' },
  disclaimerBox: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#ffe082', borderRadius: 8, marginBottom: 12, alignItems: 'flex-start' },
  helpText: { fontSize: 11, color: '#666', marginBottom: 6 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: ORANGE, borderRadius: 8, borderStyle: 'dashed', backgroundColor: '#fff' },
  attachBtnText: { color: ORANGE, fontSize: 14, fontWeight: '600', flex: 1 },
  fileChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: LIGHT_GRAY, maxWidth: '100%' },
  fileChipText: { fontSize: 12, color: BLACK, maxWidth: 160 },
  disclaimerText: { flex: 1, color: '#7a4f00', fontSize: 12, lineHeight: 16 },

  primaryBtn: {
    backgroundColor: BLACK,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 10, gap: 8,
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  secondaryBtnText: { color: '#666', fontWeight: '600', fontSize: 14 },

  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    borderWidth: 2,
    borderColor: BLACK,
    marginBottom: 12,
  },
  resultService: { fontSize: 13, color: '#666', fontWeight: '600' },
  resultTotal: { fontSize: 32, fontWeight: '800', color: BLACK, marginTop: 4 },
  resultTotalLabel: { fontSize: 12, color: '#666' },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 14 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 3 },
  rowLabel: { fontSize: 14, color: BLACK, fontWeight: '600' },
  rowValue: { fontSize: 14, color: BLACK, fontWeight: '700' },
  rowSubLabel: { fontSize: 11, color: '#666' },

  disclaimer: { fontSize: 11, color: '#888', marginVertical: 12, textAlign: 'center' },

  // Sección "¿Cómo se cotiza?" — acordeón con el detalle de
  // fórmulas, niveles y ejemplos por servicio.
  infoCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 14,
    overflow: 'hidden',
  },
  infoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  infoToggleText: { flex: 1, fontSize: 13, fontWeight: '700', color: BLACK },
  infoContent: { paddingHorizontal: 14, paddingBottom: 14 },
  infoFormula: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 13,
    fontWeight: '700',
    color: BLACK,
    backgroundColor: '#FFF8F3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
    marginBottom: 6,
  },
  infoSub: { fontSize: 11, color: '#666', marginBottom: 12 },
  infoBlockTitle: { fontSize: 13, fontWeight: '700', color: BLACK, marginTop: 12, marginBottom: 4 },
  infoBody: { fontSize: 12, color: '#444', lineHeight: 18 },
  infoBold: { fontWeight: '700', color: BLACK },
  bulletList: { marginVertical: 6, gap: 3 },
  bullet: { fontSize: 12, color: '#444', lineHeight: 18 },
  exampleBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    gap: 4,
  },
  exampleLine: { fontSize: 11, color: '#444', lineHeight: 16 },
  tierTable: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tierHeader: { backgroundColor: BLACK, borderBottomColor: BLACK },
  tierCell: { fontSize: 11, color: '#222' },
  tierCellHead: { color: '#fff', fontWeight: '700', fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' },

  // ETA chip en el service card del selector
  serviceEta: { fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600' },

  // Tabla de Tarifas de Referencia (step 0)
  refTableWrap: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  refTableHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: BLACK,
  },
  refTableHeaderTitle: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },

  // Chips de actualización de precios (paridad con web)
  staleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fff8e1',
    borderWidth: 1,
    borderColor: '#ffe082',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  staleChipTxt: { fontSize: 10, color: '#7a4f00', fontWeight: '700' },
  freshChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#a5d6a7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  freshChipTxt: { fontSize: 10, color: '#1b5e20', fontWeight: '700' },
  fxFooter: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  fxFooterTxt: { fontSize: 11, color: '#666', lineHeight: 16 },

  // Card "Cotización Estimada" estilo web (step 2)
  estCardHeader: {
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    gap: 8,
  },
  estCardHeaderTxt: { color: '#fff', fontSize: 15, fontWeight: '800', marginLeft: 8 },
  etaChip: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  etaChipTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  estCardBody: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#E5E7EB',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  estCostLabel: {
    fontSize: 10,
    color: '#888',
    letterSpacing: 1.5,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  estCostUsd: {
    fontSize: 38,
    fontWeight: '900',
    color: BLACK,
    textAlign: 'center',
    lineHeight: 44,
  },
  estCostUsdSuffix: { fontSize: 16, color: ORANGE, fontWeight: '700' },
  estCostMxnInline: { fontSize: 22, color: BLACK, fontWeight: '800' },
  estCostMxn: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '600',
  },
  dottedDivider: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    marginVertical: 16,
  },
  estGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  estGridCell: {
    width: '50%',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  estGridLabel: { fontSize: 10, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  estGridValue: { fontSize: 14, color: BLACK, fontWeight: '700', marginTop: 2 },
});
