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

import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

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
  icon: string;
  endpoint: string;
}

const SERVICES: ServiceMeta[] = [
  { key: 'pobox',     title: 'PO Box USA',          subtitle: 'Estados Unidos → Monterrey', icon: 'package-variant',  endpoint: '/api/quotes/pobox' },
  { key: 'air_china', title: 'TDI Aéreo China',     subtitle: 'Aéreo China → México',       icon: 'airplane',         endpoint: '/api/quotes/air-china' },
  { key: 'maritime',  title: 'Marítimo China',      subtitle: 'Contenedor LCL/FCL',         icon: 'ferry',            endpoint: '/api/maritime/calculate' },
  { key: 'dhl',       title: 'DHL Internacional',   subtitle: 'Express → Monterrey',        icon: 'truck-fast',       endpoint: '/api/quotes/calculate' },
];

// Tipos de mercancía aérea (china_air)
const AIR_TARIFF_TYPES: { code: string; label: string }[] = [
  { code: 'G', label: 'Genérico' },
  { code: 'L', label: 'Logo / Marca' },
  { code: 'S', label: 'Sensible' },
  { code: 'F', label: 'Flat / Liviano' },
];

// Categorías marítimas
const MARITIME_CATEGORIES = ['Generico', 'Sensible', 'Logotipo', 'StartUp'];

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
  const [quantity, setQuantity] = useState('1');

  // Específicos
  const [tariffType, setTariffType] = useState<string>('G');     // air_china
  const [maritimeCategory, setMaritimeCategory] = useState<string>('Generico');

  // GEX universal
  const [includeGex, setIncludeGex] = useState(false);
  const [declaredValueMxn, setDeclaredValueMxn] = useState('');

  const selectedService = useMemo(() => SERVICES.find(s => s.key === service) || null, [service]);

  const reset = () => {
    setStep(0);
    setService(null);
    setResult(null);
    setError(null);
    setWeightKg(''); setLengthCm(''); setWidthCm(''); setHeightCm('');
    setQuantity('1');
    setTariffType('G'); setMaritimeCategory('Generico');
    setIncludeGex(false); setDeclaredValueMxn('');
  };

  const handleQuote = async () => {
    if (!selectedService) return;
    setError(null);
    setLoading(true);

    const w = parseFloat(weightKg) || 0;
    const l = parseFloat(lengthCm) || 0;
    const wd = parseFloat(widthCm) || 0;
    const h = parseFloat(heightCm) || 0;
    const dv = parseFloat(declaredValueMxn) || 0;

    if (w <= 0) { setLoading(false); setError('Captura el peso (kg)'); return; }
    if (l <= 0 || wd <= 0 || h <= 0) { setLoading(false); setError('Captura las medidas (largo, ancho, alto)'); return; }
    if (includeGex && dv <= 0) { setLoading(false); setError('Captura el valor declarado para Garantía Extendida'); return; }

    let body: Record<string, any> = {
      weightKg: w, lengthCm: l, widthCm: wd, heightCm: h,
      declaredValueMxn: dv, includeGex,
    };
    if (selectedService.key === 'pobox') {
      body.quantity = Math.max(1, parseInt(quantity) || 1);
    } else if (selectedService.key === 'air_china') {
      body.tariffType = tariffType;
    } else if (selectedService.key === 'maritime') {
      body.userId = user?.id;
      body.category = maritimeCategory;
    } else if (selectedService.key === 'dhl') {
      // calculateQuoteEndpoint requiere serviceCode + userId.
      // El código DHL_MTY debe existir en logistics_services; si no,
      // el backend regresa 400 con mensaje claro y lo mostramos abajo.
      body.userId = user?.id;
      body.serviceCode = 'DHL_MTY';
      body.quantity = Math.max(1, parseInt(quantity) || 1);
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
      <Text style={styles.stepTitle}>¿Qué servicio quieres cotizar?</Text>
      <Text style={styles.stepHint}>Cada servicio tiene su propia fórmula de cálculo.</Text>

      {SERVICES.map(s => (
        <TouchableOpacity
          key={s.key}
          style={[styles.serviceCard, service === s.key && styles.serviceCardActive]}
          onPress={() => { setService(s.key); setStep(1); }}
        >
          <View style={styles.serviceIconWrap}>
            <MaterialCommunityIcons name={s.icon as any} size={28} color={ORANGE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.serviceTitle}>{s.title}</Text>
            <Text style={styles.serviceSubtitle}>{s.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#999" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderInputsCommon = () => (
    <>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Peso (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          value={weightKg}
          onChangeText={setWeightKg}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Medidas (cm)</Text>
        <View style={styles.dimensionsRow}>
          <TextInput style={[styles.input, styles.dimInput]} placeholder="Largo" value={lengthCm} onChangeText={setLengthCm} keyboardType="decimal-pad" />
          <Text style={styles.dimX}>×</Text>
          <TextInput style={[styles.input, styles.dimInput]} placeholder="Ancho" value={widthCm} onChangeText={setWidthCm} keyboardType="decimal-pad" />
          <Text style={styles.dimX}>×</Text>
          <TextInput style={[styles.input, styles.dimInput]} placeholder="Alto" value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
        </View>
      </View>
    </>
  );

  const renderInputsPerService = () => {
    if (!selectedService) return null;
    if (selectedService.key === 'pobox' || selectedService.key === 'dhl') {
      return (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Cantidad de cajas</Text>
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
    if (selectedService.key === 'air_china') {
      return (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Tipo de mercancía</Text>
          <View style={styles.chipRow}>
            {AIR_TARIFF_TYPES.map(t => (
              <TouchableOpacity
                key={t.code}
                style={[styles.chip, tariffType === t.code && styles.chipActive]}
                onPress={() => setTariffType(t.code)}
              >
                <Text style={[styles.chipText, tariffType === t.code && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }
    if (selectedService.key === 'maritime') {
      return (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Categoría</Text>
          <View style={styles.chipRow}>
            {MARITIME_CATEGORIES.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, maritimeCategory === c && styles.chipActive]}
                onPress={() => setMaritimeCategory(c)}
              >
                <Text style={[styles.chipText, maritimeCategory === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }
    return null;
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
          <Text style={styles.changeLink}>Cambiar</Text>
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
            <Text style={styles.gexTitle}>Garantía Extendida</Text>
            <Text style={styles.gexSub}>5% del valor declarado + $625 MXN fijos</Text>
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
            <Text style={styles.label}>Valor declarado (MXN)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={declaredValueMxn}
              onChangeText={setDeclaredValueMxn}
              keyboardType="decimal-pad"
            />
          </View>
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.primaryBtn, loading && { opacity: 0.6 }]}
        onPress={handleQuote}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <>
            <MaterialCommunityIcons name="calculator-variant" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Cotizar</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderStep2 = () => {
    if (!result || !selectedService) return null;

    // Lecturas tolerantes a la forma de cada endpoint:
    const r: any = result;
    const totalMxn = r.totalMxn ?? r.precioVentaMxn ?? r.salePriceMxn ?? r.finalPriceMxn ?? r.mxn ?? 0;
    const baseMxn = r.precioVentaMxn ?? r.salePriceMxn ?? r.finalPriceMxn ?? r.mxn ?? 0;
    const baseUsd = r.precioVentaUsd ?? r.salePriceUsd ?? r.finalPriceUsd ?? r.usd ?? null;
    const fx = r.tcFinal ?? r.fxRate ?? null;
    const gex = r.gex || {};

    return (
      <ScrollView contentContainerStyle={styles.stepBody}>
        <View style={styles.resultCard}>
          <Text style={styles.resultService}>{selectedService.title}</Text>
          <Text style={styles.resultTotal}>{formatMxn(totalMxn)}</Text>
          <Text style={styles.resultTotalLabel}>Total estimado</Text>

          <View style={styles.divider} />

          {/* Subtotal */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Servicio</Text>
            <Text style={styles.rowValue}>{formatMxn(baseMxn)}</Text>
          </View>
          {baseUsd != null && (
            <View style={styles.row}>
              <Text style={styles.rowSubLabel}>{formatUsd(baseUsd)} {fx ? `× TC ${Number(fx).toFixed(2)}` : ''}</Text>
            </View>
          )}

          {/* GEX desglose */}
          {gex?.gexTotalCost > 0 && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Garantía Extendida</Text>
                <Text style={styles.rowValue}>{formatMxn(gex.gexTotalCost)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowSubLabel}>
                  Seguro 5% ({formatMxn(gex.gexInsuranceCost)}) + cuota fija {formatMxn(gex.gexFixedCost)}
                </Text>
              </View>
            </>
          )}

          {/* Detalle por servicio */}
          {selectedService.key === 'air_china' && r.chargeableKg != null && (
            <View style={[styles.row, { marginTop: 6 }]}>
              <Text style={styles.rowSubLabel}>
                Peso cobrable: {r.chargeableKg} kg ({r.usedVolumetric ? 'volumétrico' : 'real'}) · Tarifa {r.tariffType}
                {r.isStartup ? ' · StartUp' : ''}
              </Text>
            </View>
          )}
          {selectedService.key === 'pobox' && r.cantidadCajas && (
            <View style={[styles.row, { marginTop: 6 }]}>
              <Text style={styles.rowSubLabel}>
                {r.cantidadCajas} caja(s) · CBM total {Number(r.cbm).toFixed(4)} · Nivel {r.nivelTarifa}
              </Text>
            </View>
          )}
          {selectedService.key === 'maritime' && r.chargeableCbm != null && (
            <View style={[styles.row, { marginTop: 6 }]}>
              <Text style={styles.rowSubLabel}>
                CBM cobrable: {Number(r.chargeableCbm).toFixed(3)} {r.isVipApplied ? '· VIP' : ''}
              </Text>
            </View>
          )}
          {selectedService.key === 'dhl' && r.chargeableUnits != null && (
            <View style={[styles.row, { marginTop: 6 }]}>
              <Text style={styles.rowSubLabel}>
                {r.breakdown || `${r.chargeableUnits} ${r.unitLabel || 'kg'}`}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.disclaimer}>
          * Esta cotización es informativa. El cobro final puede variar según
          revisiones aduanales, fluctuación del tipo de cambio y servicios adicionales.
        </Text>

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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step === 0 ? navigation.goBack() : setStep((step - 1) as 0 | 1))}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
          <Image
            source={require('../../assets/x-logo-entregax.png')}
            style={{ width: 18, height: 18, marginRight: 6 }}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>Cotizar Envío</Text>
        </View>
        <View style={{ width: 24 }} />
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
    </SafeAreaView>
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
});
