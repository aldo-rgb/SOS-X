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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { api, API_URL } from '../services/api';

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

  const TAB_KEYS = (hideGenerate ? ['pendientes', 'mias'] : ['pendientes', 'generar', 'especializada', 'mias']) as Array<'pendientes' | 'generar' | 'especializada' | 'mias'>;
  const [tab, setTab] = useState<'pendientes' | 'generar' | 'especializada' | 'mias'>(
    (initialTab === 'generar' || initialTab === 'mias' || initialTab === 'pendientes' || initialTab === 'especializada') ? initialTab : 'pendientes'
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

  // ─── Especializada (cotización solicitada al equipo interno) ───
  type BoxBlock = { largo: string; ancho: string; alto: string; cantidad: string };
  type PickedFile = { uri: string; name: string; mimeType: string };
  const emptyBlock = (): BoxBlock => ({ largo: '', ancho: '', alto: '', cantidad: '1' });
  const [espSubmitting, setEspSubmitting] = useState(false);
  const [espServicio, setEspServicio] = useState<'maritimo' | 'aereo'>('maritimo');
  const [espMaritimoTipo, setEspMaritimoTipo] = useState<'lcl' | 'fcl40hq'>('lcl');
  const [espClient, setEspClient] = useState<Client | null>(null);
  const [espClientPickerOpen, setEspClientPickerOpen] = useState(false);
  const [espCbmDirecto, setEspCbmDirecto] = useState('');
  const [espShowBlocks, setEspShowBlocks] = useState(false);
  const [espBlocks, setEspBlocks] = useState<BoxBlock[]>([emptyBlock()]);
  const [espPesoKg, setEspPesoKg] = useState('');
  const [espDestination, setEspDestination] = useState('');
  const [espProductDescription, setEspProductDescription] = useState('');
  const [espHasBrand, setEspHasBrand] = useState(false);
  const [espHasBrandLetter, setEspHasBrandLetter] = useState(false);
  const [espOriginAddress, setEspOriginAddress] = useState('');
  const [espConRecoleccion, setEspConRecoleccion] = useState(false);
  const [espDireccionRecoleccion, setEspDireccionRecoleccion] = useState('');
  const [espMerchandiseValue, setEspMerchandiseValue] = useState('');
  const [espImages, setEspImages] = useState<PickedFile[]>([]);
  const [espDocs, setEspDocs] = useState<PickedFile[]>([]);

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
    if (tab === 'generar' || tab === 'especializada') fetchClients();
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
    const largoN = Number(largo) || 0;
    const anchoN = Number(ancho) || 0;
    const altoN = Number(alto) || 0;
    const pesoN = Number(peso) || 0;
    const cbmN = Number(cbm) || 0;
    const cantidadN = Number(cantidad) || 1;

    if (servicio === 'maritimo') {
      if (subservicio === 'fcl_40') {
        if (cantidadN <= 0) {
          Alert.alert('Falta dato', 'Ingresa la cantidad de contenedores');
          return;
        }
      } else {
        const hasDims = largoN > 0 && anchoN > 0 && altoN > 0;
        const hasCbm = cbmN > 0;
        const hasPeso = pesoN > 0;
        if (!hasDims && !hasCbm && !hasPeso) {
          Alert.alert('Falta dato', 'Ingresa CBM, dimensiones o peso (kg) para cotizar marítimo');
          return;
        }
      }
    }

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
          cbm_cobrable: calcResult?.cbm_cobrable,
          cbm_por_peso: calcResult?.cbm_por_peso,
          peso_real_kg: calcResult?.peso_real_kg,
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

  // ─── Handlers Especializada ─────────────────────────────────────
  const espCbmOf = (b: BoxBlock) => {
    const l = parseFloat(b.largo) || 0;
    const a = parseFloat(b.ancho) || 0;
    const h = parseFloat(b.alto) || 0;
    const q = parseInt(b.cantidad) || 0;
    return (l * a * h) / 1_000_000 * q;
  };
  const espBlocksCBM = espBlocks.reduce((sum, b) => sum + espCbmOf(b), 0);
  const espTotalCBM = espShowBlocks ? espBlocksCBM : (parseFloat(espCbmDirecto) || 0);
  const espTotalPcs = espShowBlocks ? espBlocks.reduce((sum, b) => sum + (parseInt(b.cantidad) || 0), 0) : 0;

  const espPickImages = async () => {
    if (espImages.length >= 10) { Alert.alert('Límite', 'Máximo 10 fotos'); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 10 - espImages.length,
    });
    if (!result.canceled && result.assets?.length) {
      const picked: PickedFile[] = result.assets.map((a: any, i: number) => ({
        uri: a.uri,
        name: a.fileName || `foto_${Date.now()}_${i}.jpg`,
        mimeType: a.mimeType || 'image/jpeg',
      }));
      setEspImages(prev => [...prev, ...picked].slice(0, 10));
    }
  };

  const espPickDocs = async () => {
    if (espDocs.length >= 5) { Alert.alert('Límite', 'Máximo 5 documentos'); return; }
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/vnd.ms-excel',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (!result.canceled && result.assets?.length) {
      const picked: PickedFile[] = result.assets.map((a: any) => ({
        uri: a.uri,
        name: a.name || `doc_${Date.now()}`,
        mimeType: a.mimeType || 'application/octet-stream',
      }));
      setEspDocs(prev => [...prev, ...picked].slice(0, 5));
    }
  };

  const espResetForm = () => {
    setEspServicio('maritimo');
    setEspMaritimoTipo('lcl');
    setEspClient(null);
    setEspCbmDirecto('');
    setEspShowBlocks(false);
    setEspBlocks([emptyBlock()]);
    setEspPesoKg('');
    setEspDestination('');
    setEspProductDescription('');
    setEspHasBrand(false);
    setEspHasBrandLetter(false);
    setEspOriginAddress('');
    setEspConRecoleccion(false);
    setEspDireccionRecoleccion('');
    setEspMerchandiseValue('');
    setEspImages([]);
    setEspDocs([]);
  };

  const espSubmit = async () => {
    if (!espProductDescription.trim()) { Alert.alert('Falta dato', 'Describe el producto'); return; }
    if (!espDestination.trim()) { Alert.alert('Falta dato', 'Indica la dirección destino'); return; }
    const needsBoxes = espServicio === 'maritimo' && espMaritimoTipo === 'lcl';
    const needsWeight = espServicio === 'aereo';
    if (needsBoxes && espTotalCBM <= 0) { Alert.alert('Falta dato', 'Ingresa metros cúbicos o agrega bloques de cajas'); return; }
    if (needsWeight && !espPesoKg.trim()) { Alert.alert('Falta dato', 'Ingresa el peso en kg'); return; }

    setEspSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('client_id', espClient ? String(espClient.id) : '0');
      fd.append('servicio', espServicio);
      fd.append('maritimo_tipo', espServicio === 'maritimo' ? espMaritimoTipo : '');
      fd.append('destination_address', espDestination.trim());
      fd.append('box_blocks', needsBoxes ? JSON.stringify(espBlocks) : '[]');
      fd.append('total_cbm', needsBoxes ? espTotalCBM.toFixed(4) : '0');
      fd.append('total_pieces', needsBoxes ? String(espTotalPcs) : '0');
      fd.append('peso_kg', needsWeight ? espPesoKg : '');
      fd.append('product_description', espProductDescription.trim());
      fd.append('has_brand', String(espHasBrand));
      fd.append('has_brand_letter', espHasBrand ? String(espHasBrandLetter) : 'false');
      fd.append('origin_address', espOriginAddress.trim());
      fd.append('con_recoleccion', String(espConRecoleccion));
      fd.append('direccion_recoleccion', espConRecoleccion ? espDireccionRecoleccion.trim() : '');
      fd.append('merchandise_value_usd', espMerchandiseValue);
      espImages.forEach(img => {
        fd.append('photos', { uri: img.uri, name: img.name, type: img.mimeType } as any);
      });
      espDocs.forEach(doc => {
        fd.append('documents', { uri: doc.uri, name: doc.name, type: doc.mimeType } as any);
      });

      const resp = await fetch(`${API_URL}/api/advisor/quote-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json().catch(() => ({}));
      Alert.alert(
        '✅ Solicitud enviada',
        `Folio: ${data?.ticket_folio || '(pendiente)'}\n\nEl equipo interno la cotizará y aparecerá en "Pendientes".`
      );
      espResetForm();
      fetchPending();
      setTab('pendientes');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo enviar la solicitud');
    } finally {
      setEspSubmitting(false);
    }
  };

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
                : k === 'generar' ? 'Generar'
                : k === 'especializada' ? 'Especial'
                : 'Mías'}
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
            {servicio === 'maritimo' && subservicio !== 'fcl_40' && (
              <Text style={s.helperText}>
                Regla marítimo: 500 kg = 1 CBM. Se cobra el mayor entre CBM por volumen y CBM por peso.
              </Text>
            )}
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
                {calcResult.cbm_cobrable && (
                  <Text style={s.calcResultMeta}>CBM cobrable: {calcResult.cbm_cobrable}</Text>
                )}
                {calcResult.cbm_por_peso && (
                  <Text style={s.calcResultMeta}>CBM por peso (kg/500): {calcResult.cbm_por_peso}</Text>
                )}
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

      {/* ─── TAB: Especializada (Solicitud al equipo interno) ─── */}
      {tab === 'especializada' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={80}
        >
          <ScrollView
            contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.espBanner}>
              <View style={s.espBannerIcon}>
                <Ionicons name="briefcase" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.espBannerTitle}>Cotización Especializada</Text>
                <Text style={s.espBannerSub}>Para marca registrada, LCL/FCL, recolección o casos con detalles particulares.</Text>
              </View>
            </View>

            {/* 1. Tipo de Servicio */}
            <View style={s.espSection}>
              <View style={s.espSectionHeader}>
                <View style={s.espStepBadge}><Text style={s.espStepBadgeText}>1</Text></View>
                <Text style={s.espSectionTitle}>Tipo de Servicio</Text>
              </View>
              <View style={s.chipRow}>
                {([['maritimo', '🚢 Marítimo'], ['aereo', '✈️ Aéreo']] as const).map(([val, label]) => (
                  <TouchableOpacity
                    key={val}
                    style={[s.chipBtn, espServicio === val && s.chipBtnActive]}
                    onPress={() => setEspServicio(val)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipBtnText, espServicio === val && s.chipBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {espServicio === 'maritimo' && (
                <View style={[s.chipRow, { marginTop: 10 }]}>
                  {([
                    ['lcl', '📦 LCL (consolidada)'],
                    ['fcl40hq', "🏗️ FCL 40' HQ"],
                  ] as const).map(([val, label]) => (
                    <TouchableOpacity
                      key={val}
                      style={[s.chipBtnSm, espMaritimoTipo === val && s.chipBtnActive]}
                      onPress={() => setEspMaritimoTipo(val)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.chipBtnTextSm, espMaritimoTipo === val && s.chipBtnTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* 2. Cliente */}
            <View style={s.espSection}>
              <View style={s.espSectionHeader}>
                <View style={s.espStepBadge}><Text style={s.espStepBadgeText}>2</Text></View>
                <Text style={s.espSectionTitle}>Cliente</Text>
                <Text style={s.espOptional}>opcional</Text>
              </View>
              <TouchableOpacity style={s.pickerBtn} onPress={() => { setClientSearch(''); setEspClientPickerOpen(true); }} activeOpacity={0.7}>
                <Ionicons name="person-circle-outline" size={22} color={ORANGE} />
                <Text style={{ flex: 1, color: espClient ? TEXT : SUB, marginLeft: 10, fontWeight: espClient ? '600' : '400' }}>
                  {espClient ? `${espClient.full_name || espClient.name}${espClient.box_id ? ` · ${espClient.box_id}` : ''}` : 'Seleccionar cliente'}
                </Text>
                {espClient
                  ? <TouchableOpacity onPress={() => setEspClient(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={20} color={SUB} />
                    </TouchableOpacity>
                  : <Ionicons name="chevron-down" size={18} color={SUB} />}
              </TouchableOpacity>
            </View>

            {/* 3. Volumen / Peso */}
            {espServicio === 'maritimo' && espMaritimoTipo === 'lcl' && (
              <View style={s.espSection}>
                <View style={s.espSectionHeader}>
                  <View style={s.espStepBadge}><Text style={s.espStepBadgeText}>3</Text></View>
                  <Text style={s.espSectionTitle}>Metros Cúbicos</Text>
                  {espTotalCBM > 0 && (
                    <View style={s.espBadgeCbm}>
                      <Text style={s.espBadgeCbmText}>
                        {espTotalCBM.toFixed(4)} CBM{espTotalPcs > 0 ? ` · ${espTotalPcs} pzas` : ''}
                      </Text>
                    </View>
                  )}
                </View>
                <TextInput
                  style={s.input}
                  keyboardType="decimal-pad"
                  placeholder="Metros cúbicos (m³)"
                  placeholderTextColor="#999"
                  value={espCbmDirecto}
                  onChangeText={v => { setEspCbmDirecto(v); if (v) setEspShowBlocks(false); }}
                />
                <Text style={s.espHint}>Si ya sabes el volumen total, escríbelo aquí.</Text>
                <TouchableOpacity onPress={() => { setEspShowBlocks(v => !v); if (!espShowBlocks) setEspCbmDirecto(''); }} activeOpacity={0.7}>
                  <Text style={s.espLinkBtn}>
                    {espShowBlocks ? '↑ Ocultar bloques' : '🧮 Calcular por bloques de cajas'}
                  </Text>
                </TouchableOpacity>
                {espShowBlocks && (
                  <View style={{ marginTop: 6 }}>
                    {espBlocks.map((b, i) => (
                      <View key={i} style={s.blockCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ fontWeight: '700', color: SUB, fontSize: 12, flex: 1 }}>Bloque {i + 1}</Text>
                          <Text style={{ color: ORANGE, fontWeight: '700', fontSize: 12 }}>{espCbmOf(b).toFixed(4)} CBM</Text>
                          {espBlocks.length > 1 && (
                            <TouchableOpacity onPress={() => setEspBlocks(bs => bs.filter((_, j) => j !== i))} style={{ marginLeft: 10 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="trash-outline" size={16} color="#c62828" />
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Largo cm" placeholderTextColor="#999" keyboardType="decimal-pad" value={b.largo}
                            onChangeText={v => setEspBlocks(bs => bs.map((row, j) => j === i ? { ...row, largo: v } : row))} />
                          <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Ancho cm" placeholderTextColor="#999" keyboardType="decimal-pad" value={b.ancho}
                            onChangeText={v => setEspBlocks(bs => bs.map((row, j) => j === i ? { ...row, ancho: v } : row))} />
                          <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Alto cm" placeholderTextColor="#999" keyboardType="decimal-pad" value={b.alto}
                            onChangeText={v => setEspBlocks(bs => bs.map((row, j) => j === i ? { ...row, alto: v } : row))} />
                        </View>
                        <TextInput style={[s.input, { marginTop: 6, marginBottom: 0 }]} placeholder="Cantidad" placeholderTextColor="#999" keyboardType="number-pad" value={b.cantidad}
                          onChangeText={v => setEspBlocks(bs => bs.map((row, j) => j === i ? { ...row, cantidad: v } : row))} />
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => setEspBlocks(b => [...b, emptyBlock()])} style={{ paddingVertical: 10 }} activeOpacity={0.7}>
                      <Text style={{ color: ORANGE, fontWeight: '700', fontSize: 13 }}>＋ Agregar bloque</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {espServicio === 'aereo' && (
              <View style={s.espSection}>
                <View style={s.espSectionHeader}>
                  <View style={s.espStepBadge}><Text style={s.espStepBadgeText}>3</Text></View>
                  <Text style={s.espSectionTitle}>Peso y Volumen</Text>
                </View>
                <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Peso total (kg)" placeholderTextColor="#999"
                  value={espPesoKg} onChangeText={setEspPesoKg} />
                <TextInput style={s.input} keyboardType="decimal-pad" placeholder="CBM (opcional)" placeholderTextColor="#999"
                  value={espCbmDirecto} onChangeText={setEspCbmDirecto} />
              </View>
            )}

            {/* 4. Destino */}
            <View style={s.espSection}>
              <View style={s.espSectionHeader}>
                <View style={s.espStepBadge}><Text style={s.espStepBadgeText}>4</Text></View>
                <Text style={s.espSectionTitle}>Dirección Destino</Text>
              </View>
              <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top', marginBottom: 0 }]} multiline
                placeholder="Ciudad, Estado, País o dirección completa" placeholderTextColor="#999"
                value={espDestination} onChangeText={setEspDestination} />
            </View>

            {/* 5. Producto */}
            <View style={s.espSection}>
              <View style={s.espSectionHeader}>
                <View style={s.espStepBadge}><Text style={s.espStepBadgeText}>5</Text></View>
                <Text style={s.espSectionTitle}>Descripción del Producto</Text>
              </View>
              <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline
                placeholder="Describe el producto (material, uso, características, notas)" placeholderTextColor="#999"
                value={espProductDescription} onChangeText={setEspProductDescription} />
              <View style={s.switchRow}>
                <Switch
                  value={espHasBrand}
                  onValueChange={v => { setEspHasBrand(v); if (!v) setEspHasBrandLetter(false); }}
                  trackColor={{ true: ORANGE, false: '#ccc' }}
                  thumbColor="#fff"
                />
                <Text style={s.switchLabel}>¿Con marca registrada?</Text>
              </View>
              {espHasBrand && (
                <View style={s.switchRow}>
                  <Switch
                    value={espHasBrandLetter}
                    onValueChange={setEspHasBrandLetter}
                    trackColor={{ true: ORANGE, false: '#ccc' }}
                    thumbColor="#fff"
                  />
                  <Text style={s.switchLabel}>¿Tiene carta de uso de marca?</Text>
                </View>
              )}
            </View>

            {/* 6. Proveedor + Valor */}
            <View style={s.espSection}>
              <View style={s.espSectionHeader}>
                <View style={s.espStepBadge}><Text style={s.espStepBadgeText}>6</Text></View>
                <Text style={s.espSectionTitle}>Proveedor y Valor</Text>
              </View>
              <TextInput style={s.input} placeholder="Dirección del proveedor (origen)" placeholderTextColor="#999"
                value={espOriginAddress} onChangeText={setEspOriginAddress} />
              <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Valor total mercancía (USD)" placeholderTextColor="#999"
                value={espMerchandiseValue} onChangeText={setEspMerchandiseValue} />
              <View style={s.switchRow}>
                <Switch
                  value={espConRecoleccion}
                  onValueChange={setEspConRecoleccion}
                  trackColor={{ true: ORANGE, false: '#ccc' }}
                  thumbColor="#fff"
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={s.switchLabel}>Con recolección en origen</Text>
                  <Text style={s.espHint}>
                    {espConRecoleccion ? 'Iremos a recoger la mercancía.' : 'El proveedor la llevará al almacén.'}
                  </Text>
                </View>
              </View>
              {espConRecoleccion && (
                <TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top', marginTop: 8 }]} multiline
                  placeholder="Dirección de recolección" placeholderTextColor="#999"
                  value={espDireccionRecoleccion} onChangeText={setEspDireccionRecoleccion} />
              )}
            </View>

            {/* 7. Archivos */}
            <View style={s.espSection}>
              <View style={s.espSectionHeader}>
                <View style={s.espStepBadge}><Text style={s.espStepBadgeText}>7</Text></View>
                <Text style={s.espSectionTitle}>Archivos Adjuntos</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.attachBtn, { flex: 1 }]} onPress={espPickImages} disabled={espImages.length >= 10} activeOpacity={0.7}>
                  <Ionicons name="image-outline" size={18} color={ORANGE} />
                  <Text style={s.attachBtnText}>Fotos ({espImages.length}/10)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.attachBtn, { flex: 1 }]} onPress={espPickDocs} disabled={espDocs.length >= 5} activeOpacity={0.7}>
                  <Ionicons name="document-attach-outline" size={18} color={ORANGE} />
                  <Text style={s.attachBtnText}>Docs ({espDocs.length}/5)</Text>
                </TouchableOpacity>
              </View>
              {(espImages.length > 0 || espDocs.length > 0) && (
                <View style={s.fileList}>
                  {espImages.map((f, i) => (
                    <View key={`img-${i}`} style={s.fileChip}>
                      <Text style={s.fileChipText} numberOfLines={1}>🖼 {f.name}</Text>
                      <TouchableOpacity onPress={() => setEspImages(list => list.filter((_, j) => j !== i))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close-circle" size={16} color="#c62828" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {espDocs.map((f, i) => (
                    <View key={`doc-${i}`} style={s.fileChip}>
                      <Text style={s.fileChipText} numberOfLines={1}>📄 {f.name}</Text>
                      <TouchableOpacity onPress={() => setEspDocs(list => list.filter((_, j) => j !== i))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close-circle" size={16} color="#c62828" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[s.submitBtn, espSubmitting && { opacity: 0.6 }]}
              onPress={espSubmit}
              disabled={espSubmitting}
              activeOpacity={0.85}
            >
              {espSubmitting
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={s.submitBtnText}>Enviar Solicitud</Text>
                  </>
                )}
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: 12 }} onPress={espResetForm} disabled={espSubmitting} activeOpacity={0.7}>
              <Text style={{ color: SUB, fontWeight: '600' }}>Limpiar formulario</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Client picker modal — reutiliza filteredClients */}
          <Modal visible={espClientPickerOpen} animationType="slide" transparent onRequestClose={() => setEspClientPickerOpen(false)}>
            <View style={s.pickerOverlay}>
              <View style={s.pickerSheet}>
                <View style={s.pickerHeader}>
                  <Text style={s.pickerTitle}>Seleccionar cliente</Text>
                  <TouchableOpacity onPress={() => setEspClientPickerOpen(false)}>
                    <Ionicons name="close" size={22} color={TEXT} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[s.input, { marginTop: 0, marginBottom: 8 }]}
                  placeholder="Buscar por nombre, email o box"
                  value={clientSearch}
                  onChangeText={setClientSearch}
                />
                <FlatList
                  data={filteredClients}
                  keyExtractor={(i) => String(i.id)}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={<Text style={{ color: SUB, textAlign: 'center', padding: 20 }}>Sin clientes</Text>}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={s.clientRow}
                      onPress={() => { setEspClient(item); setEspClientPickerOpen(false); }}
                    >
                      <Ionicons name="person-circle-outline" size={22} color={ORANGE} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={{ fontWeight: '700', color: TEXT }}>{item.full_name || item.name}</Text>
                        <Text style={{ color: SUB, fontSize: 12 }}>{item.box_id || item.email}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </Modal>
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
  helperText: { color: SUB, fontSize: 12, marginBottom: 8, marginTop: -2 },
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
  // ── Especializada ────────────────────────────────
  espBanner: {
    backgroundColor: ORANGE, borderRadius: 14, padding: 14, marginBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: ORANGE, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  espBannerIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  espBannerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  espBannerSub: { color: '#FFE0CC', fontSize: 12, marginTop: 3, lineHeight: 16 },
  espSection: {
    backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  espSectionHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8,
  },
  espStepBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF5F0',
    borderWidth: 1.5, borderColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
  },
  espStepBadgeText: { color: ORANGE, fontWeight: '800', fontSize: 13 },
  espSectionTitle: { fontWeight: '700', color: TEXT, fontSize: 15, flex: 1 },
  espOptional: {
    fontSize: 10, color: SUB, fontWeight: '600',
    backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    overflow: 'hidden',
  },
  espBadgeCbm: {
    backgroundColor: '#FFF5F0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1, borderColor: ORANGE,
  },
  espBadgeCbmText: { color: ORANGE, fontWeight: '700', fontSize: 11 },
  espHint: { color: SUB, fontSize: 11, marginTop: 2, marginBottom: 4, lineHeight: 15 },
  espLinkBtn: {
    color: ORANGE, fontWeight: '700', fontSize: 13, marginTop: 8, marginBottom: 4, paddingVertical: 4,
  },
  chipBtn: {
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#e0e0e0', flex: 1, alignItems: 'center',
  },
  chipBtnSm: {
    paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e0e0e0', flex: 1, alignItems: 'center',
  },
  chipBtnActive: { backgroundColor: '#FFF5F0', borderColor: ORANGE },
  chipBtnText: { color: SUB, fontSize: 14, fontWeight: '600' },
  chipBtnTextSm: { color: SUB, fontSize: 12, fontWeight: '600' },
  chipBtnTextActive: { color: ORANGE, fontWeight: '800' },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 4,
  },
  switchLabel: { color: TEXT, fontSize: 14, fontWeight: '600', marginLeft: 6 },
  blockCard: {
    backgroundColor: BG, borderRadius: 10, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#e8e8e8',
  },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: ORANGE,
    backgroundColor: '#FFF3E0',
  },
  attachBtnText: { color: ORANGE, fontWeight: '700', fontSize: 13 },
  fileList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#e0e0e0', maxWidth: '100%',
  },
  fileChipText: { fontSize: 11, color: TEXT, maxWidth: 140 },
  submitBtn: {
    backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 15, marginTop: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: ORANGE, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: BG, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '80%', padding: 12,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: 4, marginBottom: 8,
  },
  pickerTitle: { fontWeight: '700', fontSize: 16, color: TEXT },
});
