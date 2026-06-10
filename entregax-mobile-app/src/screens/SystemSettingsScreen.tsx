/**
 * SystemSettingsScreen
 * -----------------------------------------------------------
 * Panel de toggles del sistema — solo Super Admin.
 * Refleja los mismos interruptores que la página Ajustes del
 * Panel Web (Pagos, Operaciones de Despacho, Asistente IA,
 * Modo Mantenimiento, etc.). NO incluye configuraciones
 * adicionales (CRUD, tarifas, etc.) — solo on/off.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  StatusBar,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { API_URL } from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'SystemSettings'>;

const ORANGE = '#F05A28';
const BG = '#F4F6F8';

interface SettingsState {
  xpay_enabled: boolean;
  entregax_payments_enabled: boolean;
  entregax_payments_by_service: { pobox: boolean; maritimo: boolean; aereo: boolean; dhl: boolean };
  gex_enabled: boolean;
  advisor_instructions_enabled: boolean;
  require_payment_to_load: boolean;
  require_label_to_load: boolean;
  require_instructions_to_load_pobox: boolean;
  external_sync_enabled: boolean;
  cajito_enabled: boolean;
  maintenance_mode: boolean;
}

const ENDPOINTS: Record<string, string> = {
  xpay:            '/api/admin/system/xpay-toggle',
  entregax:        '/api/admin/system/entregax-payments-toggle',
  gex:             '/api/admin/system/gex-toggle',
  advisorInstr:    '/api/admin/system/advisor-instructions-toggle',
  reqPayment:      '/api/admin/system/require-payment-to-load-toggle',
  reqLabel:        '/api/admin/system/require-label-to-load-toggle',
  reqInstrPobox:   '/api/admin/system/require-instructions-to-load-pobox-toggle',
  externalSync:    '/api/admin/system/external-sync-toggle',
  cajito:          '/api/admin/system/cajito-toggle',
  maintenance:     '/api/admin/system/maintenance-toggle',
};

export default function SystemSettingsScreen({ navigation, route }: Props) {
  const { token } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [state, setState] = useState<SettingsState | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/system/payment-status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      const bs = data.entregax_payments_by_service || {};
      setState({
        xpay_enabled: data.xpay_enabled !== false,
        entregax_payments_enabled: data.entregax_payments_enabled !== false,
        entregax_payments_by_service: {
          pobox: bs.pobox !== false,
          maritimo: bs.maritimo !== false,
          aereo: bs.aereo !== false,
          dhl: bs.dhl !== false,
        },
        gex_enabled: data.gex_enabled !== false,
        advisor_instructions_enabled: data.advisor_instructions_enabled !== false,
        require_payment_to_load: data.require_payment_to_load !== false,
        require_label_to_load: data.require_label_to_load !== false,
        require_instructions_to_load_pobox: data.require_instructions_to_load_pobox === true,
        external_sync_enabled: data.external_sync_enabled !== false,
        cajito_enabled: data.cajito_enabled === true,
        maintenance_mode: data.maintenance_mode === true,
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los ajustes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const post = async (key: string, endpoint: string, body: any) => {
    setSaving(key);
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar');
      await load();
    } finally {
      setSaving(null);
    }
  };

  const update = (patch: Partial<SettingsState>) =>
    setState(prev => (prev ? { ...prev, ...patch } : prev));

  const onMaintenance = (v: boolean) => {
    if (v) {
      Alert.alert(
        '⚠️ Modo Mantenimiento',
        'Esto bloqueará todas las peticiones de clientes y usuarios no admin. ¿Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Activar', style: 'destructive', onPress: async () => {
            update({ maintenance_mode: true });
            await post('maintenance', ENDPOINTS.maintenance, { enabled: true });
          }},
        ]
      );
    } else {
      update({ maintenance_mode: false });
      post('maintenance', ENDPOINTS.maintenance, { enabled: false });
    }
  };

  if (loading || !state) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
        <Header onBack={() => navigation.goBack()} onRefresh={() => {}} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      </SafeAreaView>
    );
  }

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={ORANGE} />
      <Header onBack={() => navigation.goBack()} onRefresh={onRefresh} />

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
      >
        <Warning text="Estos interruptores afectan producción de inmediato. Cambia con criterio." />

        <Section icon="card-outline" title="Sistema de Pagos">
          <ToggleRow
            label="X-Pay (pasarela externa)"
            hint="Si está apagado, el botón X-Pay no carga en el dashboard del cliente."
            value={state.xpay_enabled}
            busy={saving === 'xpay'}
            onChange={(v) => { update({ xpay_enabled: v }); post('xpay', ENDPOINTS.xpay, { enabled: v }); }}
          />
          <ToggleRow
            label="Pagos EntregaX (sucursal / SPEI)"
            hint="Flujo nativo. Si se apaga, el botón Pagar queda deshabilitado."
            value={state.entregax_payments_enabled}
            busy={saving === 'entregax'}
            onChange={(v) => { update({ entregax_payments_enabled: v }); post('entregax', ENDPOINTS.entregax, { enabled: v }); }}
          />
          {state.entregax_payments_enabled && (
            <View style={styles.subBlock}>
              <Text style={styles.subTitle}>Habilitar por tipo de servicio:</Text>
              {(['pobox', 'maritimo', 'aereo', 'dhl'] as const).map(k => (
                <ToggleRow
                  key={k}
                  compact
                  label={SERVICE_LABELS[k]}
                  value={state.entregax_payments_by_service[k]}
                  busy={saving === `svc_${k}`}
                  onChange={(v) => {
                    update({ entregax_payments_by_service: { ...state.entregax_payments_by_service, [k]: v } });
                    post(`svc_${k}`, ENDPOINTS.entregax, { by_service: { [k]: v } });
                  }}
                />
              ))}
            </View>
          )}
        </Section>

        <Section icon="shield-checkmark-outline" title="Garantías y Asesores">
          <ToggleRow
            label="Garantía Extendida (GEX)"
            hint="Permite a clientes contratar GEX 90 días."
            value={state.gex_enabled}
            busy={saving === 'gex'}
            onChange={(v) => { update({ gex_enabled: v }); post('gex', ENDPOINTS.gex, { enabled: v }); }}
          />
          <ToggleRow
            label="Instrucciones y Direcciones (Asesor)"
            hint="Si se apaga, los asesores no pueden asignar instrucciones ni editar direcciones."
            value={state.advisor_instructions_enabled}
            busy={saving === 'advisorInstr'}
            onChange={(v) => { update({ advisor_instructions_enabled: v }); post('advisorInstr', ENDPOINTS.advisorInstr, { enabled: v }); }}
          />
        </Section>

        <Section icon="bus-outline" title="Operaciones de Despacho">
          <ToggleRow
            label="Requerir Pago para Cargar"
            hint="Si está activo, el chofer solo carga guías ya pagadas."
            value={state.require_payment_to_load}
            busy={saving === 'reqPayment'}
            onChange={(v) => { update({ require_payment_to_load: v }); post('reqPayment', ENDPOINTS.reqPayment, { enabled: v }); }}
          />
          <ToggleRow
            label="Requerir Etiqueta Impresa para Cargar"
            hint="Si está activo, el chofer solo carga guías ya etiquetadas."
            value={state.require_label_to_load}
            busy={saving === 'reqLabel'}
            onChange={(v) => { update({ require_label_to_load: v }); post('reqLabel', ENDPOINTS.reqLabel, { enabled: v }); }}
          />
          <ToggleRow
            label="Requerir Instrucciones (solo PO Box)"
            hint="Las guías US- no aparecen en Control de Salidas hasta que el cliente asigne dirección."
            value={state.require_instructions_to_load_pobox}
            busy={saving === 'reqInstrPobox'}
            onChange={(v) => { update({ require_instructions_to_load_pobox: v }); post('reqInstrPobox', ENDPOINTS.reqInstrPobox, { enabled: v }); }}
          />
        </Section>

        <Section icon="sync-outline" title="Integraciones">
          <ToggleRow
            label="Sincronización Externa (Sistema EX)"
            hint="Habilita/Deshabilita el endpoint de sincronización de clientes."
            value={state.external_sync_enabled}
            busy={saving === 'externalSync'}
            onChange={(v) => { update({ external_sync_enabled: v }); post('externalSync', ENDPOINTS.externalSync, { enabled: v }); }}
          />
        </Section>

        <Section icon="hardware-chip-outline" title="Asistente IA Cajito">
          <ToggleRow
            label="Habilitar Cajito (interruptor general)"
            hint="Si se apaga, ningún usuario podrá invocar a Cajito aunque tenga permisos."
            value={state.cajito_enabled}
            busy={saving === 'cajito'}
            onChange={(v) => { update({ cajito_enabled: v }); post('cajito', ENDPOINTS.cajito, { enabled: v }); }}
          />
        </Section>

        <Section icon="construct-outline" title="Mantenimiento" danger>
          <ToggleRow
            label="Modo Mantenimiento"
            hint="Bloquea todas las peticiones de clientes y usuarios no admin."
            value={state.maintenance_mode}
            busy={saving === 'maintenance'}
            onChange={onMaintenance}
            danger
          />
        </Section>

        <Text style={styles.footer}>Cambios efectivos de inmediato en web y app móvil.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const SERVICE_LABELS: Record<'pobox' | 'maritimo' | 'aereo' | 'dhl', string> = {
  pobox: '📦  PO Box USA',
  maritimo: '🚢  Marítimo China',
  aereo: '✈️  Aéreo China',
  dhl: '🚚  DHL Nacional',
};

function Header({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerBtn} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>Ajustes del Sistema</Text>
        <Text style={styles.headerSubtitle}>Solo interruptores · Super Admin</Text>
      </View>
      <TouchableOpacity onPress={onRefresh} style={styles.headerBtn} hitSlop={10}>
        <Ionicons name="refresh" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <View style={styles.warning}>
      <Ionicons name="warning-outline" size={18} color="#B26A00" />
      <Text style={styles.warningTxt}>{text}</Text>
    </View>
  );
}

function Section({ icon, title, children, danger }: { icon: any; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <View style={[styles.section, danger && { borderColor: '#F4CCCC' }]}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={18} color={danger ? '#C62828' : ORANGE} />
        <Text style={[styles.sectionTitle, danger && { color: '#C62828' }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ToggleRow({ label, hint, value, busy, onChange, compact, danger }: {
  label: string;
  hint?: string;
  value: boolean;
  busy?: boolean;
  onChange: (v: boolean) => void;
  compact?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={[styles.row, compact && { paddingVertical: 8 }]}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={[styles.rowLabel, compact && { fontSize: 13 }]}>{label}</Text>
        {!!hint && !compact && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={ORANGE} />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#CCC', true: danger ? '#EF9A9A' : '#FFCBB3' }}
          thumbColor={value ? (danger ? '#C62828' : ORANGE) : '#F1F1F1'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: ORANGE, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: '#FFE0D2', fontSize: 12, marginTop: 2 },

  warning: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF4E0', borderColor: '#FFD699', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 14 },
  warningTxt: { flex: 1, color: '#7A4A00', fontSize: 12 },

  section: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#EEE' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#222' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#EEE' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: '#222' },
  rowHint: { fontSize: 11, color: '#777', marginTop: 2, lineHeight: 14 },

  subBlock: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, marginTop: 4 },
  subTitle: { fontSize: 11, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },

  footer: { textAlign: 'center', color: '#999', fontSize: 11, marginTop: 12 },
});
