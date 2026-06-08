// ============================================
// RASTREO PÚBLICO (GUEST MODE)
// Sin autenticación — 3 idiomas — Upsell
// ============================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Platform,
  StatusBar, Animated, Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';
const BG = '#F5F5F5';

// ── Textos i18n ──────────────────────────────────────────────────────────────

type Lang = 'es' | 'en' | 'zh';

const T = {
  es: {
    title: 'Rastrear paquete',
    subtitle: 'Sin cuenta. Solo tu número de guía.',
    placeholder: 'TDX-0001234, JJD001...',
    searchBtn: 'Rastrear',
    trackingLabel: 'Guía',
    serviceLabel: 'Servicio',
    statusTitle: 'Estado del envío',
    movementsTitle: 'Últimas actualizaciones',
    upsellTitle: '¡Importa como los expertos!',
    upsellBody: 'Cotiza en 10 segundos, cero costos ocultos, dirección en USA y China incluida.',
    upsellBtn: 'Abre tu cuenta gratis →',
    loginBtn: 'Iniciar sesión',
    registerBtn: 'Crear cuenta',
    error: 'Guía no encontrada. Verifica el número.',
    langLabel: 'Idioma',
    milestones: ['Ordenado', 'En tránsito', 'Aduana', 'En bodega', 'Listo', 'Entregado'],
    desde: 'Desde',
    aereoLabel: 'Aéreo China · Todo incluido',
    maritimoLabel: 'Marítimo China · Por m³',
    poboxLabel: 'Terrestre USA · Por caja',
  },
  en: {
    title: 'Track package',
    subtitle: 'No account needed. Just your tracking number.',
    placeholder: 'TDX-0001234, JJD001...',
    searchBtn: 'Track',
    trackingLabel: 'Tracking',
    serviceLabel: 'Service',
    statusTitle: 'Shipment status',
    movementsTitle: 'Latest updates',
    upsellTitle: 'Import like a pro!',
    upsellBody: 'Quote in 10 seconds, zero hidden fees, USA & China address included.',
    upsellBtn: 'Open your free account →',
    loginBtn: 'Sign in',
    registerBtn: 'Create account',
    error: 'Tracking not found. Please double-check.',
    langLabel: 'Language',
    milestones: ['Ordered', 'In transit', 'Customs', 'Warehouse', 'Ready', 'Delivered'],
    desde: 'From',
    aereoLabel: 'China Air · All inclusive',
    maritimoLabel: 'China Sea · Per m³',
    poboxLabel: 'USA Ground · Per box',
  },
  zh: {
    title: '包裹查询',
    subtitle: '无需账户，输入运单号即可查询。',
    placeholder: 'TDX-0001234, JJD001...',
    searchBtn: '查询',
    trackingLabel: '运单号',
    serviceLabel: '服务',
    statusTitle: '运输状态',
    movementsTitle: '最新动态',
    upsellTitle: '像专业人士一样进口！',
    upsellBody: '10秒报价，零隐藏费用，包含美国和中国地址。',
    upsellBtn: '免费开通账户 →',
    loginBtn: '登录',
    registerBtn: '注册账户',
    error: '未找到该运单号，请检查后重试。',
    langLabel: '语言',
    milestones: ['已下单', '运输中', '清关中', '仓库中', '待派送', '已签收'],
    desde: '起价',
    aereoLabel: '中国空运 · 全包价',
    maritimoLabel: '中国海运 · 每立方米',
    poboxLabel: '美国直邮 · 每箱',
  },
} as const;

const LANG_OPTIONS: { code: Lang; flag: string; label: string }[] = [
  { code: 'es', flag: '🇲🇽', label: 'Español' },
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
];

const MILESTONE_ICONS: any[] = [
  'checkbox-marked-circle-outline',
  'truck-delivery-outline',
  'shield-check-outline',
  'warehouse',
  'package-variant-closed',
  'check-all',
];

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Movement {
  date: string;
  location: string;
  description_es: string;
  description_en: string;
  description_zh: string;
}

interface TrackResult {
  tracking: string;
  service: { es: string; en: string; zh: string };
  current_milestone: number;
  milestones: { label_es: string; label_en: string; label_zh: string }[];
  movements: Movement[];
}

interface Props {
  navigation: any;
  route?: { params?: { initialLang?: Lang; initialTracking?: string } };
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function GuestTrackingScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useState<Lang>(route?.params?.initialLang || 'es');
  const [langOpen, setLangOpen] = useState(false);
  const [input, setInput] = useState(route?.params?.initialTracking || '');
  const [rates, setRates] = useState({ aereo: 19.30, maritimo: 39, pobox: 39 });

  useEffect(() => {
    fetch(`${API_URL}/api/public/rates`)
      .then(r => r.json())
      .then(data => {
        const m: Record<string, any> = {};
        for (const s of (data.servicios || [])) m[s.id] = s;
        setRates({
          aereo: m.aereo?.precio_base_usd ?? 19.30,
          maritimo: m.maritimo?.precio_base_usd ?? 39,
          pobox: 39,
        });
      })
      .catch(() => {});
  }, []);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const t = T[lang];

  const handleSearch = async (overrideTracking?: string) => {
    const tracking = (overrideTracking ?? input).trim().toUpperCase();
    if (!tracking) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/public/track/${encodeURIComponent(tracking)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.error);
      setResult(data);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (err: any) {
      setError(err.message || t.error);
    } finally {
      setLoading(false);
    }
  };

  // Si llegamos con un tracking pre-cargado, disparar búsqueda automática
  useEffect(() => {
    const initial = route?.params?.initialTracking;
    if (initial && initial.trim()) {
      handleSearch(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveDesc = (m: Movement) =>
    lang === 'en' ? m.description_en : lang === 'zh' ? m.description_zh : m.description_es;

  const svcLabel = (s: TrackResult['service']) =>
    lang === 'en' ? s.en : lang === 'zh' ? s.zh : s.es;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t.title}</Text>
          <Text style={styles.headerSub}>{t.subtitle}</Text>
        </View>

        {/* Selector de idioma */}
        <TouchableOpacity onPress={() => setLangOpen(v => !v)} style={styles.langBtn}>
          <Text style={styles.langFlag}>{LANG_OPTIONS.find(l => l.code === lang)?.flag}</Text>
          <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      {/* Dropdown de idioma */}
      {langOpen && (
        <View style={styles.langDropdown}>
          {LANG_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.code}
              style={[styles.langOption, lang === opt.code && styles.langOptionActive]}
              onPress={() => { setLang(opt.code); setLangOpen(false); }}
            >
              <Text style={styles.langOptionFlag}>{opt.flag}</Text>
              <Text style={[styles.langOptionLabel, lang === opt.code && { color: ORANGE, fontWeight: '700' }]}>
                {opt.label}
              </Text>
              {lang === opt.code && <Ionicons name="checkmark" size={14} color={ORANGE} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Search bar ─────────────────────────────────────────────────── */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#AAA" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => handleSearch()}
              placeholder={t.placeholder}
              placeholderTextColor="#BBB"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
            />
            {input.length > 0 && (
              <TouchableOpacity onPress={() => setInput('')}>
                <Ionicons name="close-circle" size={18} color="#CCC" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.searchBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
            onPress={() => handleSearch()}
            disabled={!input.trim() || loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.searchBtnText}>{t.searchBtn}</Text>}
          </TouchableOpacity>
        </View>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#C62828" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Resultado ──────────────────────────────────────────────────── */}
        {result && (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Encabezado del paquete */}
            <View style={styles.card}>
              <Text style={styles.cardOverline}>{t.statusTitle}</Text>
              <Text style={styles.trackingNumber}>{result.tracking}</Text>
              <View style={styles.serviceBadge}>
                <Text style={styles.serviceBadgeText}>{svcLabel(result.service)}</Text>
              </View>

              {/* Stepper de 6 hitos */}
              <View style={styles.stepper}>
                {result.milestones.map((m, idx) => {
                  const done = idx <= result.current_milestone;
                  const active = idx === result.current_milestone;
                  const mLabel = lang === 'en' ? m.label_en : lang === 'zh' ? m.label_zh : m.label_es;
                  return (
                    <View key={idx} style={styles.stepItem}>
                      {/* Línea izquierda */}
                      {idx > 0 && (
                        <View style={[styles.stepLine, styles.stepLineLeft, done && styles.stepLineDone]} />
                      )}
                      {/* Círculo */}
                      <View style={[styles.stepCircle, done && styles.stepCircleDone, active && styles.stepCircleActive]}>
                        <MaterialCommunityIcons
                          name={MILESTONE_ICONS[idx]}
                          size={13}
                          color={done ? '#fff' : '#CCC'}
                        />
                      </View>
                      {/* Línea derecha */}
                      {idx < result.milestones.length - 1 && (
                        <View style={[styles.stepLine, styles.stepLineRight, idx < result.current_milestone && styles.stepLineDone]} />
                      )}
                      <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={2}>
                        {mLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Últimos movimientos */}
            {result.movements.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardOverline}>{t.movementsTitle}</Text>
                {result.movements.map((mv, idx) => (
                  <View key={idx} style={[styles.mvRow, idx < result.movements.length - 1 && styles.mvRowBorder]}>
                    <View style={[styles.mvDot, idx === 0 && styles.mvDotActive]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mvDesc}>{moveDesc(mv)}</Text>
                      <Text style={styles.mvMeta}>
                        {mv.location} · {new Date(mv.date).toLocaleString(
                          lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'es-MX',
                          { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
                        )}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!result && !error && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyText}>
              {lang === 'en' ? 'Enter your tracking number above' : lang === 'zh' ? '在上方输入运单号' : 'Ingresa tu número de guía arriba'}
            </Text>
          </View>
        )}

        {/* ── Pricing cards ───────────────────────────────────────────────── */}
        <View style={styles.pricingRow}>
          <View style={[styles.priceCard, { backgroundColor: ORANGE }]}>
            <Text style={styles.priceFrom}>{t.desde}</Text>
            <Text style={styles.priceValue}>${rates.aereo.toFixed(2)}</Text>
            <Text style={styles.priceUnit}>USD/kg</Text>
            <Text style={styles.priceLabel}>{t.aereoLabel}</Text>
          </View>
          <View style={styles.priceCard}>
            <Text style={[styles.priceFrom, { color: ORANGE }]}>{t.desde}</Text>
            <Text style={[styles.priceValue, { color: '#111' }]}>${rates.maritimo.toFixed(0)}</Text>
            <Text style={[styles.priceUnit, { color: '#555' }]}>USD/m³</Text>
            <Text style={[styles.priceLabel, { color: '#777' }]}>{t.maritimoLabel}</Text>
          </View>
          <View style={styles.priceCard}>
            <Text style={[styles.priceFrom, { color: ORANGE }]}>{t.desde}</Text>
            <Text style={[styles.priceValue, { color: '#111' }]}>${rates.pobox}</Text>
            <Text style={[styles.priceUnit, { color: '#555' }]}>USD/{lang === 'en' ? 'box' : lang === 'zh' ? '箱' : 'caja'}</Text>
            <Text style={[styles.priceLabel, { color: '#777' }]}>{t.poboxLabel}</Text>
          </View>
        </View>

        {/* ── Upsell card ─────────────────────────────────────────────────── */}
        <View style={styles.upsellCard}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.upsellLogo}
            resizeMode="contain"
          />
          <Text style={styles.upsellTitle}>{t.upsellTitle}</Text>
          <Text style={styles.upsellBody}>{t.upsellBody}</Text>
          <TouchableOpacity
            style={styles.upsellBtn}
            onPress={() => (navigation as any).navigate('Register', { source: 'public_tracker' })}
          >
            <Text style={styles.upsellBtnText}>{t.upsellBtn}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Auth buttons ────────────────────────────────────────────────── */}
        <View style={styles.authRow}>
          <TouchableOpacity
            style={styles.authBtnOutline}
            onPress={() => navigation.navigate('Login')}
          >
            <Ionicons name="log-in-outline" size={18} color={ORANGE} />
            <Text style={styles.authBtnOutlineText}>{t.loginBtn}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.authBtnFill}
            onPress={() => (navigation as any).navigate('Register', { source: 'public_tracker' })}
          >
            <Ionicons name="person-add-outline" size={18} color="#fff" />
            <Text style={styles.authBtnFillText}>{t.registerBtn}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  langBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 },
  langFlag: { fontSize: 18 },

  // Dropdown idioma
  langDropdown: {
    position: 'absolute',
    right: 12,
    top: 70,
    backgroundColor: '#fff',
    borderRadius: 12,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    minWidth: 150,
    overflow: 'hidden',
  },
  langOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  langOptionActive: { backgroundColor: '#FFF5EE' },
  langOptionFlag: { fontSize: 20 },
  langOptionLabel: { fontSize: 14, color: '#333', flex: 1 },

  // Body
  body: { padding: 16, gap: 12 },

  // Search
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111', fontWeight: '500', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  searchBtn: {
    backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  searchBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Error
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFEBEE', padding: 12, borderRadius: 10 },
  errorText: { fontSize: 13, color: '#C62828', flex: 1 },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  cardOverline: { fontSize: 10, fontWeight: '700', color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  trackingNumber: { fontSize: 18, fontWeight: '800', color: BLACK, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 8 },
  serviceBadge: { alignSelf: 'flex-start', backgroundColor: '#FFF5EE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: `${ORANGE}33`, marginBottom: 16 },
  serviceBadgeText: { fontSize: 12, color: ORANGE, fontWeight: '700' },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stepItem: { flex: 1, alignItems: 'center', position: 'relative' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  stepCircleDone: { backgroundColor: ORANGE },
  stepCircleActive: { backgroundColor: ORANGE, shadowColor: ORANGE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 4 },
  stepLine: { position: 'absolute', top: 14, height: 2, width: '50%', backgroundColor: '#E0E0E0' },
  stepLineLeft: { left: 0 },
  stepLineRight: { right: 0 },
  stepLineDone: { backgroundColor: ORANGE },
  stepLabel: { fontSize: 9, color: '#AAA', textAlign: 'center', marginTop: 6, lineHeight: 12 },
  stepLabelActive: { color: ORANGE, fontWeight: '700' },

  // Movements
  mvRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  mvRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  mvDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DDD', marginTop: 4, flexShrink: 0 },
  mvDotActive: { backgroundColor: ORANGE },
  mvDesc: { fontSize: 13, fontWeight: '600', color: BLACK },
  mvMeta: { fontSize: 11, color: '#888', marginTop: 2 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 13, color: '#BBB' },

  // Upsell
  pricingRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
  },
  priceCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#F0F0F0', alignItems: 'center',
  },
  priceFrom: { fontSize: 9, fontWeight: '700', color: '#fff', opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5 },
  priceValue: { fontSize: 20, fontWeight: '900', color: '#fff', lineHeight: 24, marginTop: 2 },
  priceUnit: { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  priceLabel: { fontSize: 9, color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: 4, lineHeight: 12 },

  upsellCard: {
    backgroundColor: BLACK, borderRadius: 16, padding: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  upsellLogo: { width: 280, height: 81, alignSelf: 'center', marginBottom: 14 },
  upsellTitle: { fontSize: 17, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 6 },
  upsellBody: { fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 18, marginBottom: 14 },
  upsellBtn: {
    backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  upsellBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Auth buttons
  authRow: { flexDirection: 'row', gap: 10 },
  authBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: ORANGE, borderRadius: 12, paddingVertical: 13 },
  authBtnOutlineText: { color: ORANGE, fontWeight: '700', fontSize: 14 },
  authBtnFill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 13 },
  authBtnFillText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
