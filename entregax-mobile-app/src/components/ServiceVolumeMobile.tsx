import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator,
  Dimensions, NativeSyntheticEvent, NativeScrollEvent, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';

const ORANGE = '#F05A28';

const SERVICES = [
  { key: 'tdi_aereo',   label: 'TDI Aéreo',      emoji: '✈️',  color: '#1565C0' },
  { key: 'tdi_express', label: 'TDI Express',    emoji: '🚀',  color: '#7B1FA2' },
  { key: 'maritimo',    label: 'Marítimo China', emoji: '🚢',  color: '#00695C' },
  { key: 'pobox_usa',   label: 'PO Box USA',     emoji: '🇺🇸', color: '#BF360C' },
  { key: 'dhl',         label: 'DHL Monterrey',  emoji: '📦',  color: '#F9A825' },
  { key: 'gex',         label: 'GEX',            emoji: '🛡️',  color: '#00838F' },
  { key: 'xpay',        label: 'X-Pay',          emoji: '💱',  color: '#5E35B1' },
];

const METRICS = [
  { key: 'money',  label: '💰 Dinero',  fmt: (v: number) => `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN` },
  { key: 'count',  label: '📄 Guías',   fmt: (v: number) => v.toLocaleString('es-MX') },
  { key: 'weight', label: '⚖️ Peso',    fmt: (v: number) => `${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })} kg` },
  { key: 'volume', label: '📐 Volumen', fmt: (v: number) => `${v.toLocaleString('es-MX', { maximumFractionDigits: 2 })} m³` },
] as const;
const MONEY_MET = METRICS[0];

const PERIODS = [
  { key: 'day',   label: 'Día' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year',  label: 'Año' },
];

type MetricKey = typeof METRICS[number]['key'];
interface Point { bucket: string; money: number; weight: number; volume: number; count: number; commission?: number }

const pad = (n: number) => String(n).padStart(2, '0');
const SW = Dimensions.get('window').width;

// Sparkline con react-native-svg (área + línea).
function Sparkline({ values, color, width, height }: { values: number[]; color: string; width: number; height: number }) {
  if (values.length < 2) return <View style={{ width, height, justifyContent: 'center' }}><Text style={{ color: '#bbb', fontSize: 11 }}>sin datos</Text></View>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`).join(' ');
  const areaPts = `0,${height} ${pts} ${width},${height}`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`sp-${color}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Polygon points={areaPts} fill={`url(#sp-${color})`} />
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2.2} />
    </Svg>
  );
}

// Parsea **negritas** dentro de una línea a segmentos <Text>.
function parseBold(s: string) {
  const parts = s.split(/\*\*(.+?)\*\*/g); // los índices impares son negrita
  return parts.map((p, i) => i % 2 === 1
    ? <Text key={i} style={{ fontWeight: '800' }}>{p}</Text>
    : <Text key={i}>{p}</Text>);
}

// Render simple de markdown (títulos #, viñetas -, negritas **).
function RichText({ text }: { text: string }) {
  const lines = String(text || '').split('\n');
  return (
    <View>
      {lines.map((raw, i) => {
        const line = raw.trim();
        if (!line) return <View key={i} style={{ height: 6 }} />;
        const h = line.match(/^#{1,6}\s+(.*)$/);
        if (h) return <Text key={i} style={styles.aHeading}>{parseBold(h[1].replace(/\*\*/g, ''))}</Text>;
        const b = line.match(/^[-*•]\s+(.*)$/);
        if (b) return <Text key={i} style={styles.aBullet}>{'•  '}{parseBold(b[1])}</Text>;
        return <Text key={i} style={styles.aLine}>{parseBold(line)}</Text>;
      })}
    </View>
  );
}

export default function ServiceVolumeMobile({ apiUrl, token }: { apiUrl: string; token: string | null }) {
  const [metric, setMetric] = useState<MetricKey>('money');
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState<Record<string, Point[]>>({});
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailIdx, setDetailIdx] = useState(0);
  const [hidden, setHidden] = useState(true);   // bloqueado por default (cifra oculta)
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinError, setPinError] = useState('');
  const pinIntent = useRef<{ kind: 'reveal' } | { kind: 'detail'; idx: number }>({ kind: 'reveal' });
  const [analysis, setAnalysis] = useState<Record<string, { loading: boolean; text: string }>>({});

  const askPin = (intent: { kind: 'reveal' } | { kind: 'detail'; idx: number }) => {
    pinIntent.current = intent; setPinInput(''); setPinError(''); setPinModalOpen(true);
  };
  // Ojito: para MOSTRAR pide PIN; para ocultar no.
  const onEye = () => { if (hidden) askPin({ kind: 'reveal' }); else setHidden(true); };
  // Entrar al detalle: si está bloqueado, pide PIN primero.
  const requestDetail = (i: number) => { if (hidden) askPin({ kind: 'detail', idx: i }); else openDetail(i); };
  const verifyPin = async () => {
    if (pinInput.length !== 6) return;
    setPinVerifying(true); setPinError('');
    try {
      const r = await fetch(`${apiUrl}/api/warehouse/verify-admin-pin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const d = await r.json();
      if (r.ok && d.valid) {
        setHidden(false); setPinModalOpen(false); setPinInput('');
        if (pinIntent.current.kind === 'detail') openDetail(pinIntent.current.idx);
      } else setPinError('PIN incorrecto');
    } catch { setPinError('Error al verificar'); }
    finally { setPinVerifying(false); }
  };
  const scrollRef = useRef<ScrollView>(null);

  const runAnalysis = useCallback(async (serviceKey: string) => {
    const ss = data[serviceKey] || [];
    if (ss.length === 0) return;
    setAnalysis(a => ({ ...a, [serviceKey]: { loading: true, text: '' } }));
    try {
      const r = await fetch(`${apiUrl}/api/packages/service-analysis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceKey, group_by: period, series: ss }),
      });
      const d = await r.json();
      setAnalysis(a => ({ ...a, [serviceKey]: { loading: false, text: r.ok ? (d.analysis || '') : (d.error || 'No se pudo generar el análisis') } }));
    } catch {
      setAnalysis(a => ({ ...a, [serviceKey]: { loading: false, text: 'Error de conexión al generar el análisis.' } }));
    }
  }, [apiUrl, token, period, data]);

  const dateFrom = useCallback(() => {
    const d = new Date();
    if (period === 'month') d.setMonth(d.getMonth() - 12);
    else if (period === 'week') d.setDate(d.getDate() - 84);
    else d.setDate(d.getDate() - 21);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = dateFrom();
      const results = await Promise.all(SERVICES.map(s =>
        fetch(`${apiUrl}/api/packages/service-history-stats?service=${s.key}&group_by=${period}&date_from=${from}`,
          { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : { series: [] })
          .then(d => [s.key, d.series || []] as [string, Point[]])
          .catch(() => [s.key, [] as Point[]] as [string, Point[]])
      ));
      setData(Object.fromEntries(results));
    } catch { setData({}); }
    finally { setLoading(false); }
  }, [apiUrl, token, period, dateFrom]);

  useEffect(() => { load(); }, [load]);

  const currentStart = useMemo(() => {
    const x = new Date();
    if (period === 'year') { x.setMonth(0); x.setDate(1); }
    else if (period === 'month') x.setDate(1);
    else if (period === 'week') { const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); }
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }, [period]);

  const met = METRICS.find(m => m.key === metric)!;
  const valOf = (series: Point[], m: MetricKey = metric) => {
    const complete = series.length && series[series.length - 1].bucket === currentStart ? series.slice(0, -1) : series;
    return complete.length ? (complete[complete.length - 1][m] as number) : 0;
  };

  const openDetail = (i: number) => { setDetailIdx(i); setDetailOpen(true); setTimeout(() => scrollRef.current?.scrollTo({ x: i * SW, animated: false }), 30); };
  const onDetailScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SW);
    if (i !== detailIdx) setDetailIdx(i);
  };

  // Serie GENERAL de la empresa: suma de todos los servicios por bucket.
  const combined = useMemo(() => {
    const map = new Map<string, Point>();
    SERVICES.forEach(s => (data[s.key] || []).forEach(p => {
      const cur = map.get(p.bucket) || { bucket: p.bucket, money: 0, weight: 0, volume: 0, count: 0, commission: 0 };
      cur.money += p.money; cur.weight += p.weight; cur.volume += p.volume; cur.count += p.count;
      map.set(p.bucket, cur);
    }));
    return Array.from(map.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
  }, [data]);
  // La tarjeta compacta del home SIEMPRE muestra dinero (volumen de la operación).
  const spark = combined.map(p => p.money);

  return (
    <View style={styles.wrap}>
      {/* Solo periodo en el home (sin dinero/guías/peso/volumen) */}
      <View style={styles.togglesRow}>
        <View style={styles.chipGroup}>
          {PERIODS.map(p => (
            <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)} style={[styles.chip, period === p.key && styles.chipOn]}>
              <Text style={[styles.chipTxt, period === p.key && styles.chipTxtOn]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tarjeta compacta: VOLUMEN de toda la operación (dinero, todos los servicios) */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => requestDetail(0)} style={styles.bigCard}>
        {loading ? (
          <View style={{ height: 150, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={ORANGE} /></View>
        ) : (
          <>
            <View style={styles.bigHead}>
              <Text style={styles.bigTitle}>🏢 Volumen bruto</Text>
              <TouchableOpacity onPress={onEye} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color="#8A8A8A" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.bigValue, { color: ORANGE }]} numberOfLines={1} adjustsFontSizeToFit>
              {hidden ? '$ • • • • • •' : MONEY_MET.fmt(valOf(combined, 'money'))}
            </Text>
            <View style={{ marginTop: 6 }}>
              <Sparkline values={spark} color={ORANGE} width={SW - 64} height={70} />
            </View>
            <View style={styles.bigFoot}>
              <Text style={styles.bigFootTxt}>último {PERIODS.find(p => p.key === period)?.label.toLowerCase()} · todos los servicios (MXN)</Text>
              <View style={styles.detailBtn}><Ionicons name="expand" size={13} color={ORANGE} /><Text style={styles.detailBtnTxt}>Ver por servicio</Text></View>
            </View>
          </>
        )}
      </TouchableOpacity>

      {/* Detalle a pantalla completa, deslizable por servicio */}
      <Modal visible={detailOpen} animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <View style={styles.detailWrap}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailHeaderTitle}>Volúmenes por Servicio</Text>
            <TouchableOpacity onPress={() => setDetailOpen(false)} hitSlop={10}><Ionicons name="close" size={26} color="#111" /></TouchableOpacity>
          </View>
          {/* Toggles en el detalle */}
          <View style={{ paddingHorizontal: 12 }}>
            <View style={styles.chipGroup}>
              {METRICS.map(m => (
                <TouchableOpacity key={m.key} onPress={() => setMetric(m.key)} style={[styles.chip, metric === m.key && styles.chipOn]}>
                  <Text style={[styles.chipTxt, metric === m.key && styles.chipTxtOn]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.chipGroup, { marginTop: 6 }]}>
              {PERIODS.map(p => (
                <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)} style={[styles.chip, period === p.key && styles.chipOn]}>
                  <Text style={[styles.chipTxt, period === p.key && styles.chipTxtOn]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <ScrollView
            ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onDetailScroll} style={{ flex: 1 }}
          >
            {SERVICES.map((s) => {
              const ss = data[s.key] || [];
              const vals = ss.map(p => p[metric] as number);
              const mx = Math.max(...vals, 1);
              const total = vals.reduce((a, b) => a + b, 0);
              return (
                <ScrollView key={s.key} style={{ width: SW }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
                  <Text style={styles.pageTitle}>{s.emoji} {s.label}</Text>
                  <Text style={[styles.pageValue, { color: s.color }]}>{met.fmt(valOf(ss))}</Text>
                  <Text style={styles.pageSub}>último {PERIODS.find(p => p.key === period)?.label.toLowerCase()} · total periodo {met.fmt(total)}</Text>
                  {s.key === 'xpay' && metric === 'money' && (
                    <View style={styles.commissionPill}>
                      <Ionicons name="cash-outline" size={14} color="#1B5E20" />
                      <Text style={styles.commissionTxt}>Comisión EntregaX: {MONEY_MET.fmt(ss.reduce((a, p) => a + (p.commission || 0), 0))}</Text>
                    </View>
                  )}
                  {ss.length === 0 ? (
                    <Text style={{ color: '#999', textAlign: 'center', marginTop: 40 }}>Sin datos en el periodo.</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 210 }}>
                        {ss.map((p, i) => {
                          const v = p[metric] as number;
                          const h = Math.max(3, (v / mx) * 160);
                          const d = new Date(String(p.bucket) + 'T00:00:00');
                          const lbl = period === 'year' ? String(d.getFullYear()) : period === 'month' ? d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }) : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
                          return (
                            <View key={i} style={{ alignItems: 'center', width: 48 }}>
                              <Text style={styles.barVal} numberOfLines={1}>{v > 0 ? (metric === 'money' ? `$${Math.round(v / 1000)}k` : met.fmt(v)) : ''}</Text>
                              <View style={{ width: 26, height: h, backgroundColor: s.color, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
                              <Text style={styles.barLbl} numberOfLines={1}>{lbl}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}

                  {/* Análisis con IA por servicio */}
                  <TouchableOpacity
                    style={[styles.analysisBtn, analysis[s.key]?.loading && { opacity: 0.7 }]}
                    onPress={() => runAnalysis(s.key)}
                    disabled={analysis[s.key]?.loading || ss.length === 0}
                  >
                    {analysis[s.key]?.loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <><Ionicons name="sparkles" size={16} color="#fff" /><Text style={styles.analysisBtnTxt}>Generar análisis</Text></>
                    )}
                  </TouchableOpacity>
                  {!!analysis[s.key]?.text && (
                    <View style={styles.analysisBox}>
                      <RichText text={analysis[s.key].text} />
                    </View>
                  )}
                </ScrollView>
              );
            })}
          </ScrollView>

          {/* Dots del detalle */}
          <View style={styles.detailDots}>
            {SERVICES.map((_, i) => <View key={i} style={[styles.dot, i === detailIdx && { backgroundColor: ORANGE, width: 16 }]} />)}
          </View>
        </View>
      </Modal>

      {/* Modal PIN de administrador para desbloquear */}
      <Modal visible={pinModalOpen} transparent animationType="fade" onRequestClose={() => setPinModalOpen(false)}>
        <View style={styles.pinBackdrop}>
          <View style={styles.pinCard}>
            <Ionicons name="lock-closed" size={28} color={ORANGE} style={{ alignSelf: 'center' }} />
            <Text style={styles.pinTitle}>PIN de administrador</Text>
            <Text style={styles.pinSub}>Ingresa tu PIN de 6 dígitos para ver el volumen bruto.</Text>
            <TextInput
              style={styles.pinInput}
              value={pinInput}
              onChangeText={t => { setPinInput(t.replace(/\D/g, '').slice(0, 6)); setPinError(''); }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor="#bbb"
              secureTextEntry
              autoFocus
            />
            {!!pinError && <Text style={styles.pinErr}>{pinError}</Text>}
            <View style={styles.pinBtns}>
              <TouchableOpacity style={styles.pinCancel} onPress={() => setPinModalOpen(false)}>
                <Text style={styles.pinCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pinOk, (pinInput.length !== 6 || pinVerifying) && { opacity: 0.5 }]}
                onPress={verifyPin} disabled={pinInput.length !== 6 || pinVerifying}
              >
                {pinVerifying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.pinOkTxt}>Desbloquear</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginBottom: 6 },
  togglesRow: { marginBottom: 6 },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: '#F1F1F3', borderWidth: 1, borderColor: '#EAEAEE' },
  chipOn: { backgroundColor: '#FFF3EC', borderColor: ORANGE },
  chipTxt: { fontSize: 11.5, color: '#555', fontWeight: '700' },
  chipTxtOn: { color: ORANGE },
  bigCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#EFEFF2', borderTopWidth: 3, borderTopColor: ORANGE, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, marginTop: 2 },
  bigHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bigTitle: { fontSize: 14, fontWeight: '800', color: '#333' },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D8D8DD' },
  bigValue: { fontSize: 30, fontWeight: '800', marginTop: 8 },
  bigFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  bigFootTxt: { fontSize: 11, color: '#9A9A9A' },
  detailBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailBtnTxt: { fontSize: 12, color: ORANGE, fontWeight: '800' },
  detailWrap: { flex: 1, backgroundColor: '#F5F5F7' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  detailHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  pageTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  pageValue: { fontSize: 34, fontWeight: '800', marginTop: 6 },
  pageSub: { fontSize: 12, color: '#8A8A8A', marginTop: 2 },
  barVal: { fontSize: 10, color: '#555', marginBottom: 4, height: 14 },
  barLbl: { fontSize: 10, color: '#888', marginTop: 6 },
  detailDots: { flexDirection: 'row', gap: 5, justifyContent: 'center', alignItems: 'center', paddingVertical: 14, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  analysisBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 13, marginTop: 22 },
  analysisBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  analysisBox: { marginTop: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#EEE', padding: 14 },
  analysisTxt: { fontSize: 14, color: '#333', lineHeight: 21 },
  aHeading: { fontSize: 15, fontWeight: '800', color: '#111', marginTop: 8, marginBottom: 4 },
  aBullet: { fontSize: 14, color: '#333', lineHeight: 21, marginBottom: 3 },
  aLine: { fontSize: 14, color: '#333', lineHeight: 21, marginBottom: 3 },
  commissionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#E8F5E9', borderColor: '#A5D6A7', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  commissionTxt: { color: '#1B5E20', fontSize: 13, fontWeight: '800' },
  pinBackdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', paddingHorizontal: 32 },
  pinCard: { backgroundColor: '#fff', borderRadius: 18, padding: 22 },
  pinTitle: { fontSize: 18, fontWeight: '800', color: '#111', textAlign: 'center', marginTop: 8 },
  pinSub: { fontSize: 13, color: '#777', textAlign: 'center', marginTop: 4, marginBottom: 14 },
  pinInput: { borderWidth: 1.5, borderColor: '#E3E3E6', borderRadius: 12, textAlign: 'center', fontSize: 28, letterSpacing: 10, fontWeight: '800', color: '#111', paddingVertical: 12 },
  pinErr: { color: '#C62828', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  pinBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  pinCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E3E3E6', alignItems: 'center' },
  pinCancelTxt: { color: '#666', fontWeight: '800', fontSize: 15 },
  pinOk: { flex: 1.4, paddingVertical: 12, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center' },
  pinOkTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
