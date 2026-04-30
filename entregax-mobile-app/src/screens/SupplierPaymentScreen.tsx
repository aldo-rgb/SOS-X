import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert,
  StyleSheet, ActivityIndicator, RefreshControl, Linking, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';

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
    bank_accounts: Array<{ currency: string; bank: string; holder: string; account: string; clabe: string; reference: string }>;
    is_default: boolean;
  };
  const [providers, setProviders] = useState<EntProviderPub[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const pricing = (() => {
    const p = providers.find(x => x.id === selectedProviderId);
    if (!p) return null;
    return {
      tipo_cambio_usd: Number(p.tipo_cambio_usd),
      tipo_cambio_rmb: Number(p.tipo_cambio_rmb),
      porcentaje_compra: Number(p.porcentaje_compra),
    };
  })();

  const authHeaders = { Authorization: `Bearer ${token}` };

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
    const total = base * (1 + pricing.porcentaje_compra / 100);
    return {
      tipo_cambio: tc,
      porcentaje_compra: pricing.porcentaje_compra,
      monto_mxn_base: base,
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
        Alert.alert('✓', t('entangled.messages.created'));
        // reset
        setMonto(''); setConceptos('');
        setBenefName(''); setBenefNameZh(''); setBenefAddress('');
        setBenefAccount(''); setBenefIban(''); setBenefBankName('');
        setBenefBankAddress(''); setBenefSwift(''); setBenefAba(''); setBenefAlias('');
        setSelectedSupplierId('new');
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

  const statusColor = (s: string) => {
    if (['completado', 'emitida', 'enviado', 'pagado'].includes(s)) return '#16a34a';
    if (['en_proceso', 'pendiente'].includes(s)) return '#f59e0b';
    if (['rechazado', 'error_envio', 'error'].includes(s)) return '#dc2626';
    return '#64748b';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRequests(); }} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.headerTitle}>💰 {t('entangled.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('entangled.subtitle')}</Text>
        </View>
      </View>

      {/* Form */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📄 {t('entangled.newRequest')}</Text>

        {/* ¿Requiere factura? */}
        <Text style={styles.label}>🧾 ¿Necesitas factura para este pago?</Text>
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <TouchableOpacity
            style={[styles.chip, !requiereFactura && styles.chipActive]}
            onPress={() => setRequiereFactura(false)}
          >
            <Text style={[styles.chipText, !requiereFactura && styles.chipTextActive]}>No, sin factura</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, requiereFactura && styles.chipActive]}
            onPress={() => setRequiereFactura(true)}
          >
            <Text style={[styles.chipText, requiereFactura && styles.chipTextActive]}>Sí, quiero factura (CFDI)</Text>
          </TouchableOpacity>
        </View>

        {/* Datos fiscales (solo si requiere factura) */}
        {requiereFactura && (
          <>
            <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 12 }]}>📋 Datos fiscales</Text>

            <Text style={styles.label}>{t('entangled.fields.rfc')}</Text>
            <TextInput style={styles.input} value={rfc} onChangeText={t => setRfc(t.toUpperCase())} autoCapitalize="characters" />

            <Text style={styles.label}>{t('entangled.fields.razonSocial')}</Text>
            <TextInput style={styles.input} value={razon} onChangeText={setRazon} />

            <Text style={styles.label}>{t('entangled.fields.regimenFiscal')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {REGIMENES.map(r => (
                <TouchableOpacity key={r.code} style={[styles.chip, regimen === r.code && styles.chipActive]} onPress={() => setRegimen(r.code)}>
                  <Text style={[styles.chipText, regimen === r.code && styles.chipTextActive]}>{r.code}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>{t('entangled.fields.cp')}</Text>
            <TextInput style={styles.input} value={cp} onChangeText={setCp} keyboardType="numeric" maxLength={5} />

            <Text style={styles.label}>{t('entangled.fields.usoCfdi')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {USOS_CFDI.map(u => (
                <TouchableOpacity key={u.code} style={[styles.chip, uso === u.code && styles.chipActive]} onPress={() => setUso(u.code)}>
                  <Text style={[styles.chipText, uso === u.code && styles.chipTextActive]}>{u.code}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>{t('entangled.fields.email')}</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

            <Text style={styles.label}>{t('entangled.fields.concepts')} (separados por coma, opcional)</Text>
            <TextInput style={styles.input} value={conceptos} onChangeText={setConceptos} placeholder="84111506, 90121800" />
          </>
        )}

        {/* Proveedor de envío (beneficiario) */}
        <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 16 }]}>🏦 Proveedor de envío (beneficiario)</Text>

        {savedSuppliers.length > 0 && (
          <>
            <Text style={styles.label}>Proveedor</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.chip, selectedSupplierId === 'new' && styles.chipActive]}
                onPress={() => handlePickSupplier('new')}
              >
                <Text style={[styles.chipText, selectedSupplierId === 'new' && styles.chipTextActive]}>+ Nuevo</Text>
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
          </>
        )}

        <Text style={styles.label}>Nombre del beneficiario *</Text>
        <TextInput style={styles.input} value={benefName} onChangeText={setBenefName} />

        {divisa === 'RMB' && (
          <>
            <Text style={styles.label}>Nombre en chino *</Text>
            <TextInput style={styles.input} value={benefNameZh} onChangeText={setBenefNameZh} />
          </>
        )}

        <Text style={styles.label}>Dirección del beneficiario</Text>
        <TextInput style={styles.input} value={benefAddress} onChangeText={setBenefAddress} />

        <Text style={styles.label}>Número de cuenta *</Text>
        <TextInput style={styles.input} value={benefAccount} onChangeText={setBenefAccount} />

        <Text style={styles.label}>Banco *</Text>
        <TextInput style={styles.input} value={benefBankName} onChangeText={setBenefBankName} />

        <Text style={styles.label}>Dirección del banco</Text>
        <TextInput style={styles.input} value={benefBankAddress} onChangeText={setBenefBankAddress} />

        <Text style={styles.label}>SWIFT / BIC</Text>
        <TextInput style={styles.input} value={benefSwift} onChangeText={setBenefSwift} autoCapitalize="characters" />

        <Text style={styles.label}>ABA / Routing (USD)</Text>
        <TextInput style={styles.input} value={benefAba} onChangeText={setBenefAba} keyboardType="numeric" />

        <Text style={styles.label}>Alias (opcional, para reutilizar)</Text>
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
            <Text style={{ marginLeft: 8, color: '#475569', fontSize: 13 }}>
              Guardar este proveedor para próximas solicitudes
            </Text>
          </TouchableOpacity>
        )}

        {/* Monto y divisa */}
        <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 16 }]}>💵 Monto a enviar</Text>

        <Text style={styles.label}>Proveedor ENTANGLED</Text>
        {providers.length === 0 ? (
          <Text style={{ color: '#b91c1c', fontSize: 12, marginBottom: 8 }}>
            No hay proveedores activos configurados.
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
        <TextInput style={styles.input} value={monto} onChangeText={setMonto} keyboardType="decimal-pad" placeholder="0.00" />

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
            <Text style={styles.quoteTitle}>Cotización</Text>
            <Text style={styles.quoteLine}>
              Monto a enviar: <Text style={styles.quoteVal}>{Number(monto).toLocaleString()} {divisa}</Text>
            </Text>
            <Text style={styles.quoteLine}>
              Tipo de cambio: <Text style={styles.quoteVal}>${quote.tipo_cambio.toFixed(4)} MXN/{divisa}</Text>
            </Text>
            <Text style={styles.quoteLine}>
              Subtotal MXN: <Text style={styles.quoteVal}>${quote.monto_mxn_base.toFixed(2)}</Text>
            </Text>
            <Text style={styles.quoteLine}>
              Comisión ({quote.porcentaje_compra}%): <Text style={styles.quoteVal}>
                ${(quote.monto_mxn_total - quote.monto_mxn_base).toFixed(2)}
              </Text>
            </Text>
            <View style={styles.quoteDivider} />
            <Text style={styles.quoteTotal}>
              Total a pagar: ${quote.monto_mxn_total.toFixed(2)} MXN
            </Text>
          </View>
        )}

        <View style={{ backgroundColor: '#eff6ff', padding: 10, borderRadius: 8, marginTop: 8 }}>
          <Text style={{ color: '#1e40af', fontSize: 12 }}>
            ℹ️ El comprobante de tu transferencia se sube después, una vez recibas las instrucciones de pago.
          </Text>
        </View>

        <TouchableOpacity style={[styles.submitBtn, (!quote || submitting) && { opacity: 0.5 }]} onPress={submit} disabled={submitting || !quote}>
          {submitting ? <ActivityIndicator color="white" /> : (
            <Text style={styles.submitText}>{t('entangled.actions.submit')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Requests List */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📋 {t('entangled.myRequests')}</Text>

        {loading ? (
          <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />
        ) : requests.length === 0 ? (
          <Text style={styles.empty}>{t('entangled.messages.empty')}</Text>
        ) : requests.map(r => (
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
            <View style={styles.statusRow}>
              <View style={[styles.statusPill, { borderColor: statusColor(r.estatus_factura) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(r.estatus_factura) }]}>
                  Factura: {r.estatus_factura || '-'}
                </Text>
              </View>
              <View style={[styles.statusPill, { borderColor: statusColor(r.estatus_proveedor) }]}>
                <Text style={[styles.statusPillText, { color: statusColor(r.estatus_proveedor) }]}>
                  Proveedor: {r.estatus_proveedor || '-'}
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
                  <Ionicons name="checkmark-done-outline" size={14} color="#16a34a" />
                  <Text style={[styles.linkText, { color: '#16a34a' }]}>{t('entangled.actions.viewProof')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: ORANGE, padding: 16, paddingTop: Platform.OS === 'ios' ? 50 : 24 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: 'white', fontSize: 12, opacity: 0.9 },
  card: { backgroundColor: 'white', margin: 12, padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#0f172a' },
  label: { fontSize: 12, color: '#64748b', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#f8fafc' },
  chip: { borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, marginRight: 6, backgroundColor: 'white' },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontSize: 12, color: '#475569' },
  chipTextActive: { color: 'white', fontWeight: 'bold' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: ORANGE, padding: 12, borderRadius: 8, marginTop: 12, gap: 6 },
  uploadText: { color: ORANGE, fontWeight: '600' },
  submitBtn: { backgroundColor: ORANGE, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  submitText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  quoteBox: { backgroundColor: '#FFF4ED', borderWidth: 1, borderColor: ORANGE, borderRadius: 8, padding: 12, marginTop: 12 },
  quoteTitle: { color: ORANGE, fontWeight: 'bold', fontSize: 13, marginBottom: 6 },
  quoteLine: { fontSize: 13, color: '#475569', marginBottom: 2 },
  quoteVal: { fontWeight: 'bold', color: '#0f172a' },
  quoteDivider: { height: 1, backgroundColor: '#fbd5b5', marginVertical: 6 },
  quoteTotal: { color: ORANGE, fontWeight: 'bold', fontSize: 15 },
  empty: { textAlign: 'center', color: '#94a3b8', padding: 16 },
  requestItem: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 12 },
  requestTitle: { fontWeight: 'bold', color: '#0f172a' },
  requestStatus: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
  requestSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  requestAmount: { fontSize: 16, fontWeight: 'bold', color: ORANGE, marginTop: 4 },
  statusRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  statusPill: { borderWidth: 1, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontWeight: '600' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#f1f5f9', borderRadius: 6 },
  linkText: { fontSize: 12, color: '#0369a1', fontWeight: '600' },
});
