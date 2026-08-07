/**
 * AdvisorGoalsScreen — "Mis Metas": plan gamificado del asesor. Muestra, con
 * barras de progreso y en claro, qué le falta este mes para cada acelerador,
 * bono de volumen y cuota de venta cruzada. Diseño motivante tipo juego.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#2E7D46';
const BG = '#F5F5F7';
const fmt0 = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-MX');
// Formato para volumen: kg → "12.5 kg"  ·  m³ → "0.85 m³"
const fmtVol = (v: number, unit: string) => {
  const n = Number(v) || 0;
  return `${n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
};

interface Accel {
  key: string; name: string; emoji: string;
  // Métrica $ (compat vieja)
  monthlyAvg: number; target: number; current: number; done: boolean; hasHist: boolean;
  // Métrica volumen (nueva — fuente de verdad para Aéreo/TDI en kg y Marítimo en m³)
  unit?: 'kg' | 'm³';
  currentVol?: number; avgVol?: number; targetVol?: number;
  doneVol?: boolean; hasHistVol?: boolean;
}
interface Vol { name: string; emoji: string; guias: number; bonusNow: number; nextGuias: number | null; nextBonus: number | null; faltan: number; done: boolean; }
interface Quota { key: string; name: string; emoji: string; current: number; target: number; done: boolean; }
interface Goals {
  advisor_name: string; month_label: string;
  accelerators: Accel[]; volume: Vol[]; quotas: Quota[];
  gate: { capPct: number; okXpay: boolean; okSeg: boolean };
  bonos: { combo: number; clean: number };
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.barBg}>
      <View style={[styles.barFill, { width: `${clampPct(pct)}%`, backgroundColor: color }]} />
    </View>
  );
}

function Card({ emoji, title, badge, badgeColor, children }: any) {
  return (
    <View style={[styles.card, { borderLeftColor: badgeColor }]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{emoji} {title}</Text>
        {!!badge && <View style={[styles.badge, { backgroundColor: badgeColor + '22' }]}><Text style={[styles.badgeTxt, { color: badgeColor }]}>{badge}</Text></View>}
      </View>
      {children}
    </View>
  );
}

export default function AdvisorGoalsScreen({ navigation, route }: any) {
  const { token } = route.params || {};
  const [goals, setGoals] = useState<Goals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/advisor/my-goals`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) setGoals(d);
    } catch { /* */ } finally { setLoading(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // Conteo de metas logradas (para el marcador tipo juego).
  const allGoals = goals ? [
    ...goals.accelerators.filter(a => a.hasHist).map(a => a.done),
    ...goals.volume.map(v => v.done),
    ...goals.quotas.map(q => q.done),
  ] : [];
  const totalG = allGoals.length;
  const doneG = allGoals.filter(Boolean).length;
  const pctG = totalG > 0 ? Math.round((doneG / totalG) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <Text style={styles.hTitle}>Mis Metas</Text>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} hitSlop={12}><Ionicons name="refresh" size={22} color="#fff" /></TouchableOpacity>
      </View>

      {/* Aviso: simulador / versión no oficial */}
      <View style={styles.betaBar}>
        <Ionicons name="flask" size={15} color="#8a5a00" />
        <Text style={styles.betaTxt}>Simulador · versión no oficial en proceso de autorización</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : !goals ? (
        <View style={styles.center}><Text style={{ color: '#888' }}>No se pudieron cargar tus metas.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ORANGE} />}>

          {/* Marcador tipo juego */}
          <View style={styles.hero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroSub}>{goals.month_label.charAt(0).toUpperCase() + goals.month_label.slice(1)}</Text>
              <Text style={styles.heroTitle}>🏆 {doneG} de {totalG} metas logradas</Text>
              <View style={{ marginTop: 8 }}><Bar pct={pctG} color="#fff" /></View>
              <Text style={styles.heroHint}>{pctG === 100 ? '¡Completaste todo este mes! 🎉' : `Vas al ${pctG}% — ¡tú puedes cerrar el mes con todo!`}</Text>
            </View>
          </View>

          {/* Aceleradores por servicio */}
          <Text style={styles.section}>🚀 Aceleradores 1.5× (por servicio)</Text>
          <Text style={styles.sectionHint}>Supera tu promedio mensual y tu comisión de ese servicio se multiplica por 1.5 en el excedente.</Text>
          {goals.accelerators.map(a => {
            if (!a.hasHist) return (
              <Card key={a.key} emoji={a.emoji} title={a.name} badge="sin historial" badgeColor="#9E9E9E">
                <Text style={styles.muted}>Aún no hay historial para fijar tu meta de {a.name}.</Text>
              </Card>
            );
            const pct = a.target > 0 ? (a.current / a.target) * 100 : 0;
            const falta = Math.max(0, a.target - a.current);
            return (
              <Card key={a.key} emoji={a.emoji} title={a.name} badge={a.done ? '✓ LOGRADO' : 'EN JUEGO'} badgeColor={a.done ? GREEN : ORANGE}>
                <Text style={styles.line}>Meta del mes: <Text style={styles.b}>{fmt0(a.target)}</Text>  ·  Promedio: {fmt0(a.monthlyAvg)}</Text>
                <Text style={styles.line}>Llevas <Text style={styles.b}>{fmt0(a.current)}</Text></Text>
                <View style={{ marginVertical: 6 }}><Bar pct={pct} color={a.done ? GREEN : ORANGE} /></View>
                <Text style={[styles.goalMsg, { color: a.done ? GREEN : ORANGE }]}>
                  {a.done ? '🎉 ¡Acelerador activado!' : `👉 Te faltan ${fmt0(falta)} para el 1.5×`}
                </Text>
              </Card>
            );
          })}

          {/* Bonos de volumen */}
          <Text style={styles.section}>📦 Bonos de volumen</Text>
          <Text style={styles.sectionHint}>PO Box y DHL cuentan por separado: cada uno te da su propio bono por número de guías.</Text>
          {goals.volume.map(v => {
            const pct = v.nextGuias ? (v.guias / v.nextGuias) * 100 : 100;
            return (
              <Card key={v.name} emoji={v.emoji} title={v.name} badge={v.done ? fmt0(v.bonusNow) : 'EN JUEGO'} badgeColor={v.done ? GREEN : ORANGE}>
                <Text style={styles.line}>Llevas <Text style={styles.b}>{v.guias} guías</Text>  ·  Bono actual: <Text style={styles.b}>{fmt0(v.bonusNow)}</Text></Text>
                <View style={{ marginVertical: 6 }}><Bar pct={pct} color={v.done ? GREEN : ORANGE} /></View>
                <Text style={[styles.goalMsg, { color: v.nextGuias ? ORANGE : GREEN }]}>
                  {v.nextGuias ? `👉 ${v.faltan} guías más para el bono de ${fmt0(v.nextBonus || 0)}` : '🏆 ¡Escalón máximo alcanzado!'}
                </Text>
              </Card>
            );
          })}

          {/* Venta cruzada (gate) */}
          <Text style={styles.section}>🔓 Venta cruzada (desbloquea el 100%)</Text>
          <Text style={styles.sectionHint}>Cumple las dos cuotas y cobras el 100% de tus comisiones y bonos. Hoy cobras el {goals.gate.capPct}%.</Text>
          {goals.quotas.map(q => {
            const pct = q.target > 0 ? (q.current / q.target) * 100 : 0;
            const falta = Math.max(0, q.target - q.current);
            return (
              <Card key={q.key} emoji={q.emoji} title={q.name} badge={q.done ? '✓ CUMPLIDA' : `${q.current}/${q.target}`} badgeColor={q.done ? GREEN : ORANGE}>
                <Text style={styles.line}>Llevas <Text style={styles.b}>{q.current}</Text> de <Text style={styles.b}>{q.target}</Text> este mes.</Text>
                <View style={{ marginVertical: 6 }}><Bar pct={pct} color={q.done ? GREEN : ORANGE} /></View>
                <Text style={[styles.goalMsg, { color: q.done ? GREEN : ORANGE }]}>
                  {q.done ? '✓ Cuota cumplida' : `👉 Te faltan ${falta} para cumplir la cuota`}
                </Text>
              </Card>
            );
          })}
          <View style={[styles.gateBox, { backgroundColor: goals.gate.capPct === 100 ? '#E8F5E9' : '#FFF3E0', borderColor: goals.gate.capPct === 100 ? GREEN : ORANGE }]}>
            <Text style={{ fontWeight: '800', color: goals.gate.capPct === 100 ? GREEN : ORANGE, fontSize: 14 }}>
              {goals.gate.capPct === 100 ? '✅ ¡Gate al 100%! No pierdes nada.' : `⚠️ Hoy cobras ${goals.gate.capPct}% — cumple X-Pay + Seguros para el 100%.`}
            </Text>
          </View>

          {/* Bonos extra */}
          <Text style={styles.section}>🎁 Bonos extra</Text>
          <Card emoji="🤝" title="Bono combo" badge={fmt0(goals.bonos.combo)} badgeColor={GREEN}>
            <Text style={styles.line}>{fmt0(goals.bonos.combo)} por cada cliente con <Text style={styles.b}>envío + seguro + X-Pay</Text>.</Text>
          </Card>
          <Card emoji="⭐" title="Venta limpia" badge={fmt0(goals.bonos.clean)} badgeColor={GREEN}>
            <Text style={styles.line}>{fmt0(goals.bonos.clean)} por cada cliente <Text style={styles.b}>sin tickets de soporte</Text> en el trimestre.</Text>
          </Card>

          <Text style={styles.footer}>Metas del mes en curso · las comisiones se calculan sobre tus ventas reales.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  header: { backgroundColor: ORANGE, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  betaBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF3CD', paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F0DCA0' },
  betaTxt: { color: '#8a5a00', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  hero: { backgroundColor: ORANGE, borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center' },
  heroSub: { color: '#ffe8dd', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  heroHint: { color: '#fff', fontSize: 12.5, marginTop: 6, opacity: 0.95 },
  section: { fontSize: 15, fontWeight: '900', color: '#2a2320', marginTop: 8, marginBottom: 2 },
  sectionHint: { fontSize: 12, color: '#8a8078', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#2a2320', flex: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  line: { fontSize: 13, color: '#5b5147', marginTop: 1 },
  b: { fontWeight: '800', color: '#2a2320' },
  goalMsg: { fontSize: 12.5, fontWeight: '700', marginTop: 2 },
  muted: { fontSize: 12.5, color: '#999', fontStyle: 'italic', marginTop: 2 },
  barBg: { height: 9, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.10)', overflow: 'hidden' },
  barFill: { height: 9, borderRadius: 5 },
  gateBox: { borderWidth: 1.5, borderRadius: 12, padding: 12, marginTop: 2, marginBottom: 6 },
  footer: { fontSize: 11, color: '#a99', textAlign: 'center', marginTop: 16 },
});
