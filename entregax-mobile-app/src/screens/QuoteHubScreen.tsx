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

type ServiceKey = 'pobox' | 'air_china' | 'maritime';

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
];

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
  const [cbmM3, setCbmM3] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Cliente solicitó cotizar siempre como Genérico — sin selector de
  // tipo de mercancía / categoría. Hardcodeo abajo en el body.

  // GEX universal
  const [includeGex, setIncludeGex] = useState(false);
  const [declaredValueMxn, setDeclaredValueMxn] = useState('');

  // Acordeón "¿Cómo se cotiza?" — colapsado por defecto.
  const [showPricingInfo, setShowPricingInfo] = useState(false);

  const selectedService = useMemo(() => SERVICES.find(s => s.key === service) || null, [service]);

  const reset = () => {
    setStep(0);
    setService(null);
    setResult(null);
    setError(null);
    setWeightKg(''); setLengthCm(''); setWidthCm(''); setHeightCm('');
    setQuantity('1');
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

    const cbm = parseFloat(cbmM3) || 0;
    if (w <= 0) { setLoading(false); setError('Captura el peso (kg)'); return; }
    // Marítimo se cotiza por CBM (m³) + peso, no por medidas.
    // TDI Aéreo se cotiza por peso (medidas opcionales).
    // PO Box sí cotiza por volumen y exige medidas.
    if (selectedService.key === 'maritime') {
      if (cbm <= 0) { setLoading(false); setError('Captura los metros cúbicos (CBM)'); return; }
    } else if (selectedService.key === 'pobox') {
      if (l <= 0 || wd <= 0 || h <= 0) {
        setLoading(false); setError('Captura las medidas (largo, ancho, alto)'); return;
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
      // Cotizador siempre asume Genérico — sin selector visible.
      body.tariffType = 'G';
    } else if (selectedService.key === 'maritime') {
      body.userId = user?.id;
      body.category = 'Generico';
      body.cbm = cbm; // marítimo cotiza por CBM directo
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
      {selectedService?.key === 'maritime' ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Metros cúbicos (CBM · m³)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.000"
            value={cbmM3}
            onChangeText={setCbmM3}
            keyboardType="decimal-pad"
          />
        </View>
      ) : (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            Medidas (cm){selectedService?.key === 'air_china' ? ' · opcional' : ''}
          </Text>
          <View style={styles.dimensionsRow}>
            <TextInput style={[styles.input, styles.dimInput]} placeholder="Largo" value={lengthCm} onChangeText={setLengthCm} keyboardType="decimal-pad" />
            <Text style={styles.dimX}>×</Text>
            <TextInput style={[styles.input, styles.dimInput]} placeholder="Ancho" value={widthCm} onChangeText={setWidthCm} keyboardType="decimal-pad" />
            <Text style={styles.dimX}>×</Text>
            <TextInput style={[styles.input, styles.dimInput]} placeholder="Alto" value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
          </View>
        </View>
      )}
    </>
  );

  const renderInputsPerService = () => {
    if (!selectedService) return null;
    if (selectedService.key === 'pobox') {
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
    // El cotizador siempre asume Genérico para TDI Aéreo y Marítimo
    // (cliente quitó la elección visual). Si en el futuro se quiere
    // exponer Logo/Sensible/StartUp habrá que reactivar los chips.
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
      body = (
        <>
          <Text style={styles.infoFormula}>CBM físico = (L × A × Alto) / 1,000,000</Text>
          <Text style={styles.infoFormula}>CBM volumétrico = peso (kg) / 600</Text>
          <Text style={styles.infoSub}>Se cobra el mayor entre CBM físico y volumétrico.</Text>

          <Text style={styles.infoBlockTitle}>Brackets por CBM</Text>
          <Text style={styles.infoBody}>
            La tarifa por m³ baja conforme aumenta el volumen (descuento por
            escala). Si el CBM cae entre 0.76 y 0.99 m³ se redondea a 1 m³.
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
          <Text style={styles.infoToggleText}>¿Cómo se cotiza este servicio?</Text>
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

      {/* Sección expandible con el detalle de cómo se cotiza */}
      {renderPricingInfo()}

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
});
