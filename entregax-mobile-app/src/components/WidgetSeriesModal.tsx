import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type SeriesConfig = {
  metric: 'altas' | 'awb' | 'kg' | 'fcl' | 'lcl' | 'interested' | 'xpay_ops' | 'xpay_usd';
  granularity: 'day' | 'week' | 'month';
  periods: number;
  title: string;
  color: string;
  unit?: string;
  decimals?: number;
};

type Point = { bucket: string; value: number };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtLabel(bucket: string, gran: string): string {
  const parts = String(bucket).split('T')[0].split('-').map(Number);
  const [, m, d] = parts;
  if (gran === 'month') return MESES[((m || 1) - 1) % 12];
  return `${d}/${m}`;
}

export default function WidgetSeriesModal({
  config, onClose, apiUrl, token,
}: {
  config: SeriesConfig | null;
  onClose: () => void;
  apiUrl: string;
  token: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState<Point[]>([]);

  useEffect(() => {
    if (!config) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      setSeries([]);
      try {
        const res = await fetch(
          `${apiUrl}/api/admin/crm/widget-series?metric=${config.metric}&granularity=${config.granularity}&periods=${config.periods}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = res.ok ? await res.json() : {};
        if (!cancel && d?.success) setSeries(Array.isArray(d.series) ? d.series : []);
      } catch { /* ignore */ }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [config, apiUrl, token]);

  const visible = !!config;
  const values = series.map((s) => s.value);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);
  const decimals = config?.decimals ?? 0;
  const fmt = (n: number) => Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: decimals });
  const granLabel = config?.granularity === 'month'
    ? 'Últimos 12 meses'
    : config?.granularity === 'week'
      ? 'Últimas semanas (~2 meses)'
      : 'Últimos 7 días';
  const color = config?.color || '#E65100';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.overlay}>
        <View style={st.sheet}>
          <View style={[st.header, { backgroundColor: color }]}>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>{config?.title}</Text>
              <Text style={st.sub}>{granLabel}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ padding: 48, alignItems: 'center' }}>
              <ActivityIndicator color={color} size="large" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
              <View style={st.kpiRow}>
                <View style={st.kpi}>
                  <Text style={[st.kpiNum, { color }]}>{fmt(total)}{config?.unit ? ` ${config.unit}` : ''}</Text>
                  <Text style={st.kpiLbl}>Total del periodo</Text>
                </View>
                <View style={st.kpi}>
                  <Text style={[st.kpiNum, { color }]}>{fmt(values[values.length - 1] || 0)}</Text>
                  <Text style={st.kpiLbl}>{config?.granularity === 'day' ? 'Hoy' : config?.granularity === 'week' ? 'Esta semana' : 'Este mes'}</Text>
                </View>
              </View>

              {series.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#999', paddingVertical: 30 }}>Sin datos en el periodo.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 200 }}>
                    {series.map((s, i) => {
                      const h = Math.max(3, (s.value / max) * 150);
                      return (
                        <View key={i} style={{ alignItems: 'center', width: 42 }}>
                          <Text style={st.barVal} numberOfLines={1}>{s.value > 0 ? fmt(s.value) : ''}</Text>
                          <View style={{ width: 24, height: h, backgroundColor: color, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
                          <Text style={st.barLbl} numberOfLines={1}>{fmtLabel(s.bucket, config?.granularity || 'day')}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '82%', overflow: 'hidden' },
  header: { padding: 16, flexDirection: 'row', alignItems: 'flex-start' },
  title: { color: '#FFF', fontWeight: '800', fontSize: 17 },
  sub: { color: '#FFF', opacity: 0.9, fontSize: 12, marginTop: 2 },
  kpiRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  kpi: { alignItems: 'center', flex: 1 },
  kpiNum: { fontSize: 26, fontWeight: '800' },
  kpiLbl: { fontSize: 12, color: '#777', marginTop: 2 },
  barVal: { fontSize: 10, color: '#555', marginBottom: 4, height: 14 },
  barLbl: { fontSize: 10, color: '#888', marginTop: 6 },
});
