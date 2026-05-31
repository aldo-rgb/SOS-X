// ════════════════════════════════════════════════════════════
// AdvisorQuotesScreen — Cotizaciones formales del asesor (mobile)
// 3 tabs: Pendientes (tickets), Generar (PDF), Mis Cotizaciones
// ════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, ScrollView, TextInput, Alert, Switch, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

const ORANGE = '#F05A28';
const ORANGE_LIGHT = '#FF9800';
const BLACK = '#111';
const BG = '#F4F4F6';
const CARD = '#FFFFFF';
const TEXT = '#111';
const SUB = '#666';

type ServicioKey = 'maritimo' | 'aereo' | 'pobox' | 'dhl';

interface Client {
  id: number;
  full_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  box_id?: string;
}

interface QuoteTicket {
  id: number;
  ticket_folio: string;
  subject: string;
  status: string;
  category: string;
  created_at: string;
  client_id?: number;
  user_id?: number;
  client_name?: string;
  client_box_id?: string;
}

interface FormalQuote {
  id: number;
  folio: string;
  client_name: string;
  servicio: string;
  total_mxn: number;
  valid_until: string;
  created_at: string;
  gex_enabled: boolean;
  pdf_url?: string;
  ticket_id?: number | null;
  ticket_folio?: string | null;
}

const SERVICIO_LABELS: Record<ServicioKey, string> = {
  maritimo: '🚢 Marítimo China',
  aereo: '✈️ Aéreo China',
  pobox: '📦 PO Box USA',
  dhl: '🚚 DHL Nacional',
};

const SUBSERVICIO_OPTIONS: Record<ServicioKey, { value: string; label: string }[]> = {
  maritimo: [
    { value: 'por_volumen', label: 'Marítimo por volumen (LCL)' },
    { value: 'fcl_40', label: 'FCL 40 pies' },
  ],
  aereo: [
    { value: '', label: 'Default' },
    { value: 'tdi_aereo', label: 'TDI Aéreo' },
    { value: 'tdi_express', label: 'Aéreo Express' },
  ],
  pobox: [{ value: '', label: 'Default' }],
  dhl: [{ value: '', label: 'Default' }],
};

const CATEGORIAS_MARITIMO = ['Generico', 'StartUp', 'Sensible', 'Logotipo', 'FCL40'];

export default function AdvisorQuotesScreen({ navigation, route }: any) {
  const { user, token, initialTab, hideGenerate } = route.params;
  const insets = useSafeAreaInsets();

  const TAB_KEYS = (hideGenerate ? ['pendientes', 'mias'] : ['pendientes', 'generar', 'mias']) as Array<'pendientes' | 'generar' | 'mias'>;
  const [tab, setTab] = useState<'pendientes' | 'generar' | 'mias'>(
    (initialTab === 'generar' || initialTab === 'mias' || initialTab === 'pendientes') ? initialTab : 'pendientes'
  );
  const [refreshing, setRefreshing] = useState(false);

  // Pendientes
  const [pendingTickets, setPendingTickets] = useState<QuoteTicket[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);

  // Cotizaciones generadas
  const [myQuotes, setMyQuotes] = useState<FormalQuote[]>([]);
  const [loadingMyQuotes, setLoadingMyQuotes] = useState(false);

  // Generador
  const [clients, setClients] = useState<Client[]>([]);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [servicio, setServicio] = useState<ServicioKey>('maritimo');
  const [subservicio, setSubservicio] = useState('por_volumen');
  const [categoria, setCategoria] = useState('Generico');
  const [largo, setLargo] = useState('');
  const [ancho, setAncho] = useState('');
  const [alto, setAlto] = useState('');
  const [peso, setPeso] = useState('');
  const [cbm, setCbm] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [descripcion, setDescripcion] = useState('');
  const [calcResult, setCalcResult] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [gexEnabled, setGexEnabled] = useState(true);
  const [gexValor, setGexValor] = useState('');
  const [gexCurrency, setGexCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [gexFallbackTc, setGexFallbackTc] = useState<number>(0);
  const [ticketId, setTicketId] = useState<number | null>(null);

  // Modal "Ver ticket" — detalle inline (subject + cuerpo + metadata)
  const [ticketDetailOpen, setTicketDetailOpen] = useState(false);
  const [ticketDetailLoading, setTicketDetailLoading] = useState(false);
  const [ticketDetail, setTicketDetail] = useState<QuoteTicket | null>(null);
  const [ticketDetailBody, setTicketDetailBody] = useState<string>('');

  const openTicketDetail = useCallback(async (t: QuoteTicket) => {
    setTicketDetail(t);
    setTicketDetailBody('');
    setTicketDetailOpen(true);
    setTicketDetailLoading(true);
    try {
      const r = await api.get(`/api/support/ticket/${t.id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      const msgs: any[] = Array.isArray(r.data) ? r.data : (r.data?.messages || []);
      // Tomar el primer mensaje del cliente (el cuerpo de la solicitud)
      const first = msgs.find(m => m.sender_type === 'user' || m.sender_type === 'client') || msgs[0];
      setTicketDetailBody(first?.message || '');
    } catch (err: any) {
      setTicketDetailBody('No se pudo cargar el detalle del ticket.');
    } finally {
      setTicketDetailLoading(false);
    }
  }, [token]);
  const [generating, setGenerating] = useState(false);

  const archiveTicket = useCallback((t: QuoteTicket) => {
    Alert.alert(
      'Archivar ticket',
      `¿Archivar ${t.ticket_folio}? Se marcará como resuelto y desaparecerá de Pendientes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Archivar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.put(`/api/admin/support/ticket/${t.id}/resolve`, {}, { headers: { Authorization: `Bearer ${token}` } });
              setPendingTickets(prev => prev.filter(p => p.id !== t.id));
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || 'No se pudo archivar');
            }
          },
        },
      ]
    );
  }, [token]);

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const r = await api.get('/api/support/tickets', { headers: { Authorization: `Bearer ${token}` } });
      const all: QuoteTicket[] = r.data?.tickets || r.data || [];
      // Solo tickets de cotización que sigan pendientes (ocultar 'resolved' = ya cotizada y 'closed')
      setPendingTickets(
        all.filter(t =>
          (t.category === 'quote' || t.category === 'quote_request') &&
          t.status !== 'resolved' && t.status !== 'closed'
        )
      );
    } catch (e) { /* noop */ }
    finally { setLoadingPending(false); }
  }, [token]);

  const fetchMyQuotes = useCallback(async () => {
    setLoadingMyQuotes(true);
    try {
      const r = await api.get('/api/advisor/formal-quotes', { headers: { Authorization: `Bearer ${token}` } });
      setMyQuotes(r.data || []);
    } catch (e) { /* noop */ }
    finally { setLoadingMyQuotes(false); }
  }, [token]);

  const fetchClients = useCallback(async () => {
    if (clients.length > 0) return;
    try {
      const r = await api.get('/api/advisor/clients?limit=500', { headers: { Authorization: `Bearer ${token}` } });
      const raw = r.data?.clients || r.data || [];
      // Backend devuelve camelCase (fullName, boxId) — normalizamos a snake_case que usa la UI
      const data = (Array.isArray(raw) ? raw : []).map((c: any) => ({
        id: c.id,
        full_name: c.fullName || c.full_name || c.name || '',
        name: c.fullName || c.full_name || c.name || '',
        email: c.email || '',
        phone: c.phone || '',
        box_id: c.boxId || c.box_id || '',
      }));
      setClients(data);
    } catch (e) { /* noop */ }
  }, [token, clients.length]);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useEffect(() => {
    if (tab === 'mias') fetchMyQuotes();
    if (tab === 'generar') fetchClients();
  }, [tab, fetchMyQuotes, fetchClients]);

  // TC GEX como fallback para conversión USD→MXN antes de calcular
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/api/gex/exchange-rate', { headers: { Authorization: `Bearer ${token}` } });
        const rate = Number(r.data?.rate) || 0;
        if (rate > 0) setGexFallbackTc(rate);
      } catch { /* noop */ }
    })();
  }, [token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === 'pendientes') await fetchPending();
    if (tab === 'mias') await fetchMyQuotes();
    setRefreshing(false);
  }, [tab, fetchPending, fetchMyQuotes]);

  // Abre el PDF pidiendo siempre una URL fresca al backend (re-firma o sirve copia local)
  const openQuotePdf = useCallback(async (quoteId: number, fallbackUrl?: string) => {
    try {
      const r = await api.get(`/api/advisor/formal-quotes/${quoteId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      const url = r.data?.pdfUrl;
      if (url) { Linking.openURL(url); return; }
      throw new Error('Sin URL');
    } catch (err: any) {
      if (fallbackUrl) { Linking.openURL(fallbackUrl); return; }
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo abrir el PDF');
    }
  }, [token]);

  const startQuoteFromTicket = (ticket: any) => {
    setSelectedClient({
      id: (ticket.user_id || ticket.client_id) as number,
      full_name: ticket.client_name,
      box_id: ticket.client_box_id,
      email: ticket.client_email,
      phone: ticket.client_phone,
    });
    setTicketId(ticket.id);

    // Prefill desde metadata estructurada del ticket
    let meta: any = ticket.metadata;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
    if (meta && typeof meta === 'object') {
      const svc = String(meta.servicio || '').toLowerCase();
      if (['maritimo', 'aereo', 'pobox', 'dhl'].includes(svc)) {
        setServicio(svc as ServicioKey);
      }
      let sub = meta.subservicio || '';
      if (!sub && svc === 'maritimo' && (meta.cbm || meta.CBM)) sub = 'por_volumen';
      setSubservicio(sub || '');
      if (meta.categoria) setCategoria(String(meta.categoria));
      setLargo(meta.largo ? String(meta.largo) : '');
      setAncho(meta.ancho ? String(meta.ancho) : '');
      setAlto(meta.alto ? String(meta.alto) : '');
      setPeso(meta.peso ? String(meta.peso) : '');
      setCbm(meta.cbm ? String(meta.cbm) : '');
      setCantidad(meta.cantidad ? String(meta.cantidad) : '1');
      setDescripcion(meta.descripcion_producto || '');
      // Prefill GEX: valor declarado del ticket (USD → MXN con TC del ticket)
      const valUsd = Number(meta.valor_declarado_usd || 0);
      const tc = Number(meta.tipo_cambio || 0);
      if (valUsd > 0 && tc > 0) {
        setGexEnabled(true);
        setGexCurrency('MXN');
        setGexValor((valUsd * tc).toFixed(2));
      } else {
        setGexEnabled(false);
        setGexValor('');
      }
    }

    setTab('generar');
    fetchClients();
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setCalcResult(null);
    try {
      const body: any = {
        servicio,
        cantidad: Number(cantidad) || 1,
        categoria,
      };
      if (subservicio) body.subservicio = subservicio;
      if (largo) body.largo = Number(largo);
      if (ancho) body.ancho = Number(ancho);
      if (alto) body.alto = Number(alto);
      if (peso) body.peso = Number(peso);
      if (cbm) body.cbm = Number(cbm);
      const r = await api.post('/api/public/quote', body);
      setCalcResult(r.data);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo calcular');
    } finally { setCalculating(false); }
  };

  const handleGeneratePdf = async () => {
    if (!selectedClient) { Alert.alert('Falta cliente', 'Selecciona un cliente'); return; }
    if (!calcResult) { Alert.alert('Falta cálculo', 'Calcula el precio primero'); return; }
    setGenerating(true);
    try {
      const tcForGex = Number(calcResult?.tipo_cambio) || gexFallbackTc || 0;
      const gexValorRaw = gexEnabled ? Number(gexValor) || 0 : 0;
      const gexValorN = gexCurrency === 'USD' ? gexValorRaw * tcForGex : gexValorRaw;
      const gexInsurance = gexValorN > 0 ? Math.round(gexValorN * 0.05 * 100) / 100 : 0;
      const gexFixed = gexValorN > 0 ? 625 : 0;
      const gexPrima = gexInsurance + gexFixed;
      const body: any = {
        clientId: selectedClient.id,
        clientName: selectedClient.full_name || selectedClient.name,
        clientBoxId: selectedClient.box_id,
        clientEmail: selectedClient.email,
        clientPhone: selectedClient.phone,
        servicio,
        subservicio: subservicio || undefined,
        categoria,
        details: {
          largo, ancho, alto, peso, cbm, cantidad,
          peso_cobrable: calcResult?.peso_cobrable,
          tiempo_estimado: calcResult?.tiempo_estimado,
          descripcion,
        },
        precio_usd: calcResult?.precio_usd,
        precio_mxn: calcResult?.precio_mxn,
        tipo_cambio: calcResult?.tipo_cambio,
        gex_enabled: gexEnabled,
        gex_valor_declarado_mxn: gexValorN || undefined,
        gex_prima_mxn: gexPrima || undefined,
        validityDays: 7,
        ticketId: ticketId || undefined,
      };
      const r = await api.post('/api/advisor/formal-quotes', body, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert(
        '✅ Cotización generada',
        `Folio: ${r.data?.folio}\n\n¿Abrir el PDF ahora?`,
        [
          { text: 'Más tarde', style: 'cancel' },
          { text: 'Abrir PDF', onPress: () => r.data?.quoteId && openQuotePdf(r.data.quoteId, r.data?.pdfUrl) },
        ]
      );
      // Reset
      setSelectedClient(null); setServicio('maritimo'); setSubservicio('por_volumen');
      setCategoria('Generico');
      setLargo(''); setAncho(''); setAlto(''); setPeso(''); setCbm(''); setCantidad('1');
      setDescripcion(''); setCalcResult(null);
      setGexEnabled(true); setGexValor(''); setGexCurrency('MXN');
      setTicketId(null);
      fetchMyQuotes();
      setTab('mias');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'No se pudo generar el PDF');
    } finally { setGenerating(false); }
  };

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 80);
    return clients.filter(c =>
      (c.full_name || c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.box_id || '').toLowerCase().includes(q)
    ).slice(0, 80);
  }, [clients, clientSearch]);

  const totalConGex = useMemo(() => {
    if (!calcResult) return 0;
    const base = Number(calcResult.precio_mxn) || 0;
    const tc = Number(calcResult?.tipo_cambio) || gexFallbackTc || 0;
    const raw = Number(gexValor) || 0;
    const dv = gexCurrency === 'USD' ? raw * tc : raw;
    const gex = gexEnabled && dv > 0 ? (dv * 0.05) + 625 : 0;
    return base + gex;
  }, [calcResult, gexEnabled, gexValor, gexCurrency, gexFallbackTc]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top > 0 ? 4 : 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Cotizaciones</Text>
          <Text style={s.headerSub}>Genera PDFs formales con vigencia 7 días</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {TAB_KEYS.map(k => (
          <TouchableOpacity
            key={k}
            style={[s.tabBtn, tab === k && s.tabBtnActive]}
            onPress={() => setTab(k)}
          >
            <Text style={[s.tabLabel, tab === k && s.tabLabelActive]}>
              {k === 'pendientes' ? `Pendientes${pendingTickets.length ? ` (${pendingTickets.length})` : ''}`
                : k === 'generar' ? 'Generar' : 'Mías'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ─── TAB: Pendientes ─── */}
      {tab === 'pendientes' && (
        loadingPending ? (
          <View style={s.center}><ActivityIndicator size="large" color={ORANGE} /></View>
        ) : (
          <FlatList
            data={pendingTickets}
            keyExtractor={(i) => String(i.id)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
            contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="calculator-outline" size={56} color="#ddd" />
                <Text style={s.emptyText}>Sin cotizaciones pendientes</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.ticketCard}>
                <View style={{ flex: 1 }}>
                  <View style={s.row}>
                    <Ionicons name="calculator" size={18} color={ORANGE_LIGHT} />
                    <Text style={s.ticketSubject} numberOfLines={1}>{item.subject || 'Cotización formal'}</Text>
                  </View>
                  <Text style={s.ticketClient}>
                    {item.client_name || 'Cliente'}{item.client_box_id ? ` · Box ${item.client_box_id}` : ''}
                  </Text>
                  <Text style={s.ticketFolio}>
                    {item.ticket_folio} · {new Date(item.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.verBtn}
                  onPress={() => openTicketDetail(item)}
                >
                  <Ionicons name="eye-outline" size={16} color={ORANGE} />
                  <Text style={s.verBtnText}>Ver</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cotizarBtn} onPress={() => startQuoteFromTicket(item)}>
                  <Text style={s.cotizarBtnText}>Cotizar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.archivarBtn} onPress={() => archiveTicket(item)}>
                  <Ionicons name="archive-outline" size={16} color="#616161" />
                </TouchableOpacity>
              </View>
            )}
          />
        )
      )}

      {/* ─── TAB: Generar ─── */}
      {tab === 'generar' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
            {/* Cliente */}
            <Text style={s.sectionTitle}>1. Cliente</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => { fetchClients(); setClientPickerOpen(true); }}>
              <Ionicons name="person" size={18} color={ORANGE} />
              <Text style={[s.pickerBtnText, !selectedClient && { color: SUB }]} numberOfLines={1}>
                {selectedClient ? `${selectedClient.full_name || selectedClient.name}${selectedClient.box_id ? ` · Box ${selectedClient.box_id}` : ''}` : 'Seleccionar cliente'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={SUB} />
            </TouchableOpacity>

            {/* Servicio */}
            <Text style={s.sectionTitle}>2. Servicio</Text>
            <View style={s.chipRow}>
              {(Object.keys(SERVICIO_LABELS) as ServicioKey[]).map(key => (
                <TouchableOpacity
                  key={key}
                  style={[s.chip, servicio === key && s.chipActive]}
                  onPress={() => {
                    setServicio(key);
                    // Default subservicio: primer valor del array (marítimo arranca en 'por_volumen')
                    setSubservicio(SUBSERVICIO_OPTIONS[key][0]?.value || '');
                    setCalcResult(null);
                  }}
                >
                  <Text style={[s.chipText, servicio === key && s.chipTextActive]}>{SERVICIO_LABELS[key]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Subservicio */}
            {SUBSERVICIO_OPTIONS[servicio].length > 1 && (
              <View style={s.chipRow}>
                {SUBSERVICIO_OPTIONS[servicio].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.chipSmall, subservicio === opt.value && s.chipSmallActive]}
                    onPress={() => setSubservicio(opt.value)}
                  >
                    <Text style={[s.chipSmallText, subservicio === opt.value && s.chipSmallTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Categoría marítimo (oculto - siempre Genérico por defecto) */}
            {false && servicio === 'maritimo' && (
              <View style={s.chipRow}>
                {CATEGORIAS_MARITIMO.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[s.chipSmall, categoria === c && s.chipSmallActive]}
                    onPress={() => setCategoria(c)}
                  >
                    <Text style={[s.chipSmallText, categoria === c && s.chipSmallTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Dimensiones */}
            <Text style={s.sectionTitle}>3. Dimensiones y peso</Text>
            <View style={s.dimRow}>
              <TextInput style={s.dimInput} placeholder="Largo cm" keyboardType="numeric" value={largo} onChangeText={setLargo} />
              <TextInput style={s.dimInput} placeholder="Ancho cm" keyboardType="numeric" value={ancho} onChangeText={setAncho} />
              <TextInput style={s.dimInput} placeholder="Alto cm" keyboardType="numeric" value={alto} onChangeText={setAlto} />
            </View>
            <View style={s.dimRow}>
              <TextInput style={s.dimInput} placeholder="Peso kg" keyboardType="numeric" value={peso} onChangeText={setPeso} />
              <TextInput style={s.dimInput} placeholder="CBM" keyboardType="numeric" value={cbm} onChangeText={setCbm} />
              <TextInput style={s.dimInput} placeholder="Cantidad" keyboardType="numeric" value={cantidad} onChangeText={setCantidad} />
            </View>
            <TextInput
              style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]}
              placeholder="Descripción de mercancía (opcional)"
              multiline
              value={descripcion}
              onChangeText={setDescripcion}
            />

            <TouchableOpacity style={s.calcBtn} onPress={handleCalculate} disabled={calculating}>
              {calculating ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="calculator" size={18} color="#fff" />
                  <Text style={s.calcBtnText}>Calcular precio</Text>
                </>
              )}
            </TouchableOpacity>

            {calcResult && (
              <View style={s.calcResult}>
                <Text style={s.calcResultLabel}>Precio servicio</Text>
                <Text style={s.calcResultValue}>
                  ${Number(calcResult.precio_mxn).toLocaleString('es-MX')} MXN
                </Text>
                <Text style={s.calcResultMeta}>
                  USD ${Number(calcResult.precio_usd).toFixed(2)} · TC ${Number(calcResult.tipo_cambio).toFixed(2)}
                </Text>
                {calcResult.peso_cobrable && (
                  <Text style={s.calcResultMeta}>Peso cobrable: {calcResult.peso_cobrable} kg</Text>
                )}
                {calcResult.tiempo_estimado && (
                  <Text style={s.calcResultMeta}>Tiempo estimado: {calcResult.tiempo_estimado}</Text>
                )}
              </View>
            )}

            {/* GEX */}
            <Text style={s.sectionTitle}>4. Garantía Extendida (GEX)</Text>
            <View style={s.gexRow}>
              <Text style={{ flex: 1, color: TEXT, fontWeight: '600' }}>🛡️ Agregar GEX (5% + $625 MXN)</Text>
              <Switch value={gexEnabled} onValueChange={setGexEnabled} trackColor={{ true: ORANGE }} />
            </View>
            {gexEnabled && (() => {
              const gexTc = Number(calcResult?.tipo_cambio) || gexFallbackTc || 0;
              const raw = Number(gexValor) || 0;
              const valMxn = gexCurrency === 'USD' ? raw * gexTc : raw;
              const valUsd = gexCurrency === 'MXN' && gexTc > 0 ? raw / gexTc : (gexCurrency === 'USD' ? raw : 0);
              const prima = valMxn > 0 ? (valMxn * 0.05) + 625 : 0;
              return (
                <View>
                  {/* Toggle MXN/USD */}
                  <View style={{ flexDirection: 'row', marginTop: 8, marginBottom: 6, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', overflow: 'hidden', alignSelf: 'flex-start' }}>
                    {(['MXN', 'USD'] as const).map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setGexCurrency(c)}
                        style={{ paddingVertical: 6, paddingHorizontal: 16, backgroundColor: gexCurrency === c ? ORANGE : '#FFF' }}
                      >
                        <Text style={{ color: gexCurrency === c ? '#FFF' : '#666', fontWeight: '700', fontSize: 12 }}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={s.dimRow}>
                    <TextInput
                      style={[s.dimInput, { flex: 2 }]}
                      placeholder={`Valor declarado ${gexCurrency}`}
                      keyboardType="numeric"
                      value={gexValor}
                      onChangeText={setGexValor}
                    />
                    <View style={[s.dimInput, { flex: 1, justifyContent: 'center' }]}>
                      <Text style={{ color: ORANGE, fontWeight: '700' }}>
                        Prima: ${prima.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  {raw > 0 && gexTc > 0 && (
                    <Text style={{ color: SUB, fontSize: 11, marginLeft: 4, marginTop: 2 }}>
                      {gexCurrency === 'USD'
                        ? `≈ $${valMxn.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN (TC ${gexTc.toFixed(2)})`
                        : `≈ USD $${valUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (TC ${gexTc.toFixed(2)})`}
                    </Text>
                  )}
                  {raw > 0 && gexTc === 0 && (
                    <Text style={{ color: SUB, fontSize: 11, marginLeft: 4, marginTop: 2 }}>
                      Calcula el precio para obtener TC de conversión
                    </Text>
                  )}
                </View>
              );
            })()}

            {/* Resumen */}
            {calcResult && (
              <View style={s.totalCard}>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Servicio</Text>
                  <Text style={s.totalValue}>${Number(calcResult.precio_mxn).toLocaleString('es-MX')}</Text>
                </View>
                {gexEnabled && Number(gexValor) > 0 && (() => {
                  const tc = Number(calcResult?.tipo_cambio) || gexFallbackTc || 0;
                  const raw = Number(gexValor) || 0;
                  const valMxn = gexCurrency === 'USD' ? raw * tc : raw;
                  const prima = valMxn > 0 ? (valMxn * 0.05) + 625 : 0;
                  return (
                    <View style={s.totalRow}>
                      <Text style={s.totalLabel}>GEX (5% + $625)</Text>
                      <Text style={s.totalValue}>${prima.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                    </View>
                  );
                })()}
                <View style={[s.totalRow, { borderTopWidth: 1, borderTopColor: '#FFB74D', paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[s.totalLabel, { fontWeight: '700', fontSize: 16 }]}>TOTAL</Text>
                  <Text style={[s.totalValue, { color: ORANGE, fontWeight: '700', fontSize: 18 }]}>
                    ${totalConGex.toLocaleString('es-MX')} MXN
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: SUB, marginTop: 6, textAlign: 'right' }}>Vigencia: 7 días</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.generateBtn, (!calcResult || !selectedClient || generating) && { opacity: 0.5 }]}
              onPress={handleGeneratePdf}
              disabled={!calcResult || !selectedClient || generating}
            >
              {generating ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="document-text" size={20} color="#fff" />
                  <Text style={s.generateBtnText}>Generar PDF de Cotización</Text>
                </>
              )}
            </TouchableOpacity>
            {ticketId && (
              <Text style={{ textAlign: 'center', color: SUB, fontSize: 12, marginTop: 6 }}>
                📎 Se adjuntará al ticket #{ticketId}
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ─── TAB: Mías ─── */}
      {tab === 'mias' && (
        loadingMyQuotes ? (
          <View style={s.center}><ActivityIndicator size="large" color={ORANGE} /></View>
        ) : (
          <FlatList
            data={myQuotes}
            keyExtractor={(i) => String(i.id)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
            contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="document-text-outline" size={56} color="#ddd" />
                <Text style={s.emptyText}>Aún no has generado cotizaciones</Text>
              </View>
            }
            renderItem={({ item }) => {
              const expired = item.valid_until && new Date(item.valid_until) < new Date();
              return (
                <TouchableOpacity
                  style={s.quoteCard}
                  onPress={() => openQuotePdf(item.id, item.pdf_url)}
                >
                  <View style={s.quoteIcon}>
                    <Ionicons name="document-text" size={26} color={ORANGE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.row}>
                      <Text style={s.quoteFolio}>{item.folio}</Text>
                      <View style={[s.statusChip, { backgroundColor: expired ? '#FFEBEE' : '#E8F5E9' }]}>
                        <Text style={[s.statusChipText, { color: expired ? '#C62828' : '#2E7D32' }]}>
                          {expired ? 'Vencida' : 'Vigente'}
                        </Text>
                      </View>
                      {item.gex_enabled && (
                        <View style={[s.statusChip, { backgroundColor: '#F3E5F5' }]}>
                          <Text style={[s.statusChipText, { color: '#7B1FA2' }]}>GEX</Text>
                        </View>
                      )}
                      {item.ticket_folio && (
                        <View style={[s.statusChip, { backgroundColor: '#FFF3E0' }]}>
                          <Text style={[s.statusChipText, { color: '#E65100' }]}>{item.ticket_folio}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.quoteClient}>{item.client_name || '—'}</Text>
                    <Text style={s.quoteMeta}>
                      ${Number(item.total_mxn || 0).toLocaleString('es-MX')} MXN · {new Date(item.created_at).toLocaleDateString('es-MX')}
                    </Text>
                  </View>
                  {item.pdf_url && <Ionicons name="download-outline" size={22} color={ORANGE} />}
                </TouchableOpacity>
              );
            }}
          />
        )
      )}

      {/* Modal cliente */}
      <Modal visible={clientPickerOpen} animationType="slide" statusBarTranslucent onRequestClose={() => setClientPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[s.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              onPress={() => setClientPickerOpen(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ padding: 4 }}
            >
              <Ionicons name="close" size={26} color={BLACK} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>Seleccionar cliente</Text>
            <View style={{ width: 34 }} />
          </View>
          <View style={{ padding: 12 }}>
            <TextInput
              style={s.searchInput}
              placeholder="Buscar por nombre, email o box…"
              value={clientSearch}
              onChangeText={setClientSearch}
            />
          </View>
          <FlatList
            data={filteredClients}
            keyExtractor={(c) => String(c.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.clientRow}
                onPress={() => { setSelectedClient(item); setClientPickerOpen(false); setClientSearch(''); }}
              >
                <View style={s.clientAvatar}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {(item.full_name || item.name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.clientName}>{item.full_name || item.name}</Text>
                  <Text style={s.clientMeta}>
                    {item.box_id ? `Box ${item.box_id} · ` : ''}{item.email || item.phone || ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: SUB, padding: 20 }}>Sin resultados</Text>}
          />
        </View>
      </Modal>

      {/* ─── Modal: Detalle del ticket (solicitud de cotización) ─── */}
      <Modal visible={ticketDetailOpen} animationType="slide" transparent onRequestClose={() => setTicketDetailOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '85%', paddingTop: 6 }}>
            <View style={{ backgroundColor: ORANGE, padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>{ticketDetail?.subject || 'Cotización formal'}</Text>
                <Text style={{ color: '#FFF', opacity: 0.9, fontSize: 12, marginTop: 2 }}>
                  {ticketDetail?.ticket_folio} · {ticketDetail?.client_name || ''}{ticketDetail?.client_box_id ? ` · Box ${ticketDetail?.client_box_id}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTicketDetailOpen(false)}>
                <Ionicons name="close" size={26} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
              {ticketDetailLoading ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator color={ORANGE} />
                </View>
              ) : (
                <Text style={{ color: TEXT, fontSize: 14, lineHeight: 22 }}>{ticketDetailBody || 'Sin detalle disponible.'}</Text>
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 14 + insets.bottom, borderTopWidth: 1, borderTopColor: '#EEE' }}>
              <TouchableOpacity
                style={[s.verBtn, { flex: 1, justifyContent: 'center' }]}
                onPress={() => setTicketDetailOpen(false)}
              >
                <Text style={s.verBtnText}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.cotizarBtn, { flex: 1, alignItems: 'center' }]}
                onPress={() => { if (ticketDetail) { setTicketDetailOpen(false); startQuoteFromTicket(ticketDetail); } }}
              >
                <Text style={s.cotizarBtnText}>Cotizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: ORANGE, paddingHorizontal: 14, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#FFE0CC', fontSize: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: ORANGE },
  tabLabel: { color: SUB, fontWeight: '600', fontSize: 13 },
  tabLabelActive: { color: ORANGE },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: SUB, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ticketCard: {
    backgroundColor: '#FFF8E1', borderColor: '#FFE0B2', borderWidth: 1, borderRadius: 12,
    padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  ticketSubject: { fontWeight: '700', color: TEXT, flex: 1 },
  ticketClient: { color: '#5D4037', fontWeight: '600', fontSize: 13, marginTop: 2 },
  ticketFolio: { color: SUB, fontSize: 11, marginTop: 2 },
  cotizarBtn: { backgroundColor: ORANGE_LIGHT, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  cotizarBtnText: { color: '#fff', fontWeight: '700' },
  verBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: ORANGE, backgroundColor: '#FFF3E0',
  },
  verBtnText: { color: ORANGE, fontWeight: '700', fontSize: 13 },
  archivarBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#9E9E9E', backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontWeight: '700', color: ORANGE, marginTop: 16, marginBottom: 8, fontSize: 14 },
  pickerBtn: {
    backgroundColor: CARD, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pickerBtnText: { flex: 1, color: TEXT, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { color: TEXT, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  chipSmallActive: { backgroundColor: ORANGE_LIGHT, borderColor: ORANGE_LIGHT },
  chipSmallText: { color: TEXT, fontSize: 12 },
  chipSmallTextActive: { color: '#fff', fontWeight: '700' },
  dimRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dimInput: {
    flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14,
  },
  input: {
    backgroundColor: CARD, borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, marginBottom: 8,
  },
  calcBtn: {
    backgroundColor: BLACK, borderRadius: 10, paddingVertical: 12, marginTop: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  calcBtnText: { color: '#fff', fontWeight: '700' },
  calcResult: {
    backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: '#A5D6A7',
  },
  calcResultLabel: { color: SUB, fontSize: 12 },
  calcResultValue: { color: '#2E7D32', fontWeight: '700', fontSize: 22, marginTop: 2 },
  calcResultMeta: { color: SUB, fontSize: 12, marginTop: 2 },
  gexRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CARD,
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 8,
  },
  totalCard: {
    backgroundColor: '#FFF8E1', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#FFE0B2',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  totalLabel: { color: TEXT, fontWeight: '600' },
  totalValue: { color: TEXT, fontWeight: '600' },
  generateBtn: {
    backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 14, marginTop: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  quoteCard: {
    backgroundColor: CARD, borderRadius: 12, padding: 12, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  quoteIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF3E0',
    justifyContent: 'center', alignItems: 'center',
  },
  quoteFolio: { fontWeight: '700', color: TEXT, fontSize: 14 },
  quoteClient: { color: '#5D4037', fontSize: 13, marginTop: 2, fontWeight: '600' },
  quoteMeta: { color: SUB, fontSize: 11, marginTop: 2 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusChipText: { fontSize: 10, fontWeight: '700' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  modalTitle: { fontWeight: '700', fontSize: 16, color: TEXT },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#e0e0e0', fontSize: 14,
  },
  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6, borderRadius: 10,
  },
  clientAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
  },
  clientName: { fontWeight: '700', color: TEXT },
  clientMeta: { color: SUB, fontSize: 12, marginTop: 2 },
});
