import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#16a34a';
const DARK = '#111';

const CONV_KEY = 'cajito.conversationId';
const CAJITO_AVATAR = require('../../assets/cajito-asomando.png');

const TRACK_ONLY_ROLES = ['advisor', 'sub_advisor', 'customer_service'];

const fmtMoney = (v: any, cur = 'MXN') =>
  v == null || v === '' ? '—' : `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

const fmtDT = (d?: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return String(d); }
};

const resolveUrl = (url?: string | null): string | null => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const STATUS_ES: Record<string, string> = {
  pending: 'Pendiente', in_transit: 'En tránsito', received: 'Recibido MX', received_mty: 'Recibido MTY',
  received_cedis: 'Recibido CEDIS', shipped: 'Enviado a destino', delivered: 'Entregado',
  ready_pickup: 'Listo para recoger', customs: 'En aduana', received_china: 'Recibido China',
  consolidated: 'Consolidado', at_port: 'En puerto', returned_to_warehouse: 'Devuelto a almacén', lost: 'Perdido',
};
const statusLabel = (s?: string) => STATUS_ES[s || ''] || s || '—';
const statusColors = (s?: string): { bg: string; fg: string } => {
  const v = (s || '').toLowerCase();
  if (v === 'delivered') return { bg: '#dcfce7', fg: '#16a34a' };
  if (v === 'shipped' || v === 'ready_pickup') return { bg: '#dbeafe', fg: '#2563eb' };
  if (v === 'in_transit' || v.startsWith('received')) return { bg: '#e0f2fe', fg: '#0288d1' };
  if (v === 'customs' || v === 'at_port' || v === 'consolidated') return { bg: '#fef3c7', fg: '#b45309' };
  if (v === 'lost') return { bg: '#fee2e2', fg: '#dc2626' };
  return { bg: '#f3f4f6', fg: '#6b7280' };
};

const Chip = ({ label, bg = '#f3f4f6', fg = '#374151' }: { label: string; bg?: string; fg?: string }) => (
  <View style={[styles.chip, { backgroundColor: bg }]}><Text style={[styles.chipText, { color: fg }]}>{label}</Text></View>
);

interface ChatMsg { role: 'user' | 'cajito'; text: string; tools?: string[]; adjuntos?: { nombre: string; mime: string; uri?: string }[]; }
interface AdjuntoPorMandar { nombre: string; mime: string; uri: string; base64: string; }
const LIMITE_ADJUNTOS = 10;
// Entre todos. Van en base64 dentro del JSON y el servidor acepta hasta 50 MB.
const LIMITE_MB_TOTAL = 30;

interface Props {
  user: { role?: string; name?: string; full_name?: string };
  token: string;
}

export default function CajitoFab({ user, token }: Props) {
  const role = String(user?.role || '').toLowerCase();
  const isSuperAdmin = role === 'super_admin';
  // Reportar un error levanta una tarea y le suena el teléfono a quien la
  // atiende: no es algo que deba poder disparar cualquiera desde el chat.
  const puedeReportar = role === 'super_admin' || role === 'admin';
  const isTrackOnly = TRACK_ONLY_ROLES.includes(role);
  const canUse = isSuperAdmin || isTrackOnly;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'track'>(isSuperAdmin ? 'chat' : 'track');

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const convIdRef = useRef<number | null>(null);
  // El hilo se repinta UNA sola vez. El efecto depende del token —que puede
  // llegar después del primer render— y sin esta guarda se volvería a pintar
  // encima, duplicando las burbujas.
  const hiloCargadoRef = useRef(false);
  // Índice de la burbuja que se está reportando, y las ya reportadas (para no
  // mandar la misma dos veces y que se note que ya salió).
  const [reportando, setReportando] = useState<number | null>(null);
  const [reportadas, setReportadas] = useState<Record<number, string>>({});
  // Fotos y PDF por mandar (tarea 569).
  const [adjuntos, setAdjuntos] = useState<AdjuntoPorMandar[]>([]);
  const chatScrollRef = useRef<ScrollView>(null);

  // Tracking
  const [query, setQuery] = useState('');
  const [tracking, setTracking] = useState<any | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState('');

  // Avatar configurado (slot cajito_avatar) — se sirve en /api/system/payment-status
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // Al abrir la app se recupera el hilo guardado Y sus mensajes.
  //
  // Antes solo se recuperaba el id: el hilo seguía vivo del lado del servidor
  // —Cajito no perdía el contexto— pero la pantalla arrancaba en blanco con el
  // saludo, y parecía que la conversación se había borrado. Se pierde el hilo
  // de lo que uno venía platicando aunque él sí lo recuerde.
  //
  // Los mensajes de tipo 'tool' no se pintan como burbuja: son las herramientas
  // que usó, y ya se muestran como la etiqueta gris debajo de su respuesta.
  useEffect(() => {
    AsyncStorage.getItem(CONV_KEY).then(async (v) => {
      let id = Number(v) || null;
      if (id) convIdRef.current = id;
      if (!token || hiloCargadoRef.current) return;
      try {
        // El hilo sigue a la PERSONA, no al aparato. El id se guardaba solo en
        // este teléfono, así que quien venía platicando desde la web abría la
        // app y veía el saludo. Sin id guardado, se pide el hilo más reciente y
        // se sigue ahí: la conversación es una sola en los dos lados.
        if (!id) {
          const l = await fetch(`${API_URL}/api/cajito/conversations`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!l.ok) return;
          const ld = await l.json().catch(() => null);
          const reciente = (ld?.conversations || [])[0];
          if (!reciente?.id) return;
          id = Number(reciente.id);
          convIdRef.current = id;
          AsyncStorage.setItem(CONV_KEY, String(id)).catch(() => {});
        }
        const r = await fetch(`${API_URL}/api/cajito/conversations/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;                       // hilo borrado o de otro usuario: se empieza limpio
        const d = await r.json().catch(() => null);
        const filas: any[] = Array.isArray(d?.messages) ? d.messages : [];
        const previos: ChatMsg[] = [];
        let herramientas: string[] = [];
        for (const m of filas) {
          if (m.role === 'tool') { if (m.tool_name) herramientas.push(m.tool_name); continue; }
          const texto = String(m.content || '').trim();
          if (!texto) continue;
          if (m.role === 'user') { previos.push({ role: 'user', text: texto }); herramientas = []; }
          else { previos.push({ role: 'cajito', text: texto, tools: herramientas }); herramientas = []; }
        }
        // Solo las últimas: el hilo puede traer meses de conversación y no hay
        // por qué pintarlo entero en un panel de teléfono.
        hiloCargadoRef.current = true;
        if (previos.length > 0) setMessages(previos.slice(-40));
      } catch { /* sin red: se empieza limpio, el hilo sigue vivo en el servidor */ }
    }).catch(() => {});
    fetch(`${API_URL}/api/system/payment-status`)
      .then((r) => r.json())
      .then((d) => {
        const u = d?.cajito_avatar_url;
        if (typeof u === 'string' && u) {
          setAvatarUri(u.startsWith('http') ? u : `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`);
        }
      })
      .catch(() => {});
  }, [token]);

  const avatarSource = avatarUri ? { uri: avatarUri } : CAJITO_AVATAR;

  if (!canUse) return null;

  const roleLabel = isSuperAdmin ? 'Super Admin' : (role === 'customer_service' ? 'Servicio a cliente' : 'Mis clientes');

  const agregarAdjunto = (a: AdjuntoPorMandar) =>
    setAdjuntos((prev) => {
      const mb = [...prev, a].reduce((n, x) => n + (x.base64.length * 0.75) / 1048576, 0);
      if (prev.length >= LIMITE_ADJUNTOS || mb > LIMITE_MB_TOTAL) {
        Alert.alert('Adjuntos', `Hasta ${LIMITE_ADJUNTOS} archivos y ${LIMITE_MB_TOTAL} MB entre todos: "${a.nombre}" ya no cupo.`);
        return prev;
      }
      return [...prev, a];
    });

  const elegirFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) { Alert.alert('Permiso', 'Necesito acceso a tus fotos para adjuntarlas.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images', quality: 0.7, base64: true,
      allowsMultipleSelection: true, selectionLimit: Math.max(LIMITE_ADJUNTOS - adjuntos.length, 1),
    });
    if (r.canceled) return;
    for (const a of r.assets || []) {
      if (!a.base64) continue;
      agregarAdjunto({ nombre: a.fileName || `foto-${Date.now()}.jpg`, mime: a.mimeType || 'image/jpeg', uri: a.uri, base64: a.base64 });
    }
  };

  const elegirPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 10 * 1024 * 1024) { Alert.alert('Archivo muy grande', 'El PDF puede pesar hasta 10 MB.'); return; }
    const base64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
    agregarAdjunto({ nombre: a.name || 'documento.pdf', mime: 'application/pdf', uri: a.uri, base64 });
  };

  const adjuntar = () => {
    if (adjuntos.length >= LIMITE_ADJUNTOS) { Alert.alert('Adjuntos', `Puedes adjuntar hasta ${LIMITE_ADJUNTOS} archivos por mensaje.`); return; }
    Alert.alert('Adjuntar', '¿Qué le quieres mandar a Cajito?', [
      { text: 'Foto o captura', onPress: () => { elegirFoto().catch(() => Alert.alert('Error', 'No se pudieron abrir tus fotos.')); } },
      { text: 'PDF', onPress: () => { elegirPdf().catch(() => Alert.alert('Error', 'No se pudo leer el PDF.')); } },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const sendChat = async () => {
    const text = input.trim();
    if ((!text && adjuntos.length === 0) || sending) return;
    const enviados = adjuntos;
    setInput('');
    setAdjuntos([]);
    setMessages((m) => [...m, { role: 'user', text, adjuntos: enviados.map((a) => ({ nombre: a.nombre, mime: a.mime, uri: a.uri })) }]);
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/cajito/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: convIdRef.current,
          ...(enviados.length ? { adjuntos: enviados.map((a) => ({ nombre: a.nombre, dataUrl: `data:${a.mime};base64,${a.base64}` })) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.conversationId) {
          convIdRef.current = data.conversationId;
          AsyncStorage.setItem(CONV_KEY, String(data.conversationId)).catch(() => {});
        }
        const tools = Array.isArray(data.toolCalls) ? data.toolCalls.map((t: any) => t.name).filter(Boolean) : [];
        setMessages((m) => [...m, { role: 'cajito', text: data.reply || '…', tools }]);
      } else {
        setMessages((m) => [...m, { role: 'cajito', text: `⚠️ ${data.error || 'No pude responder ahora.'}` }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'cajito', text: '⚠️ Error de red. Intenta de nuevo.' }]);
    }
    setSending(false);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Manda a la tarea la pregunta y la respuesta tal cual las dio Cajito. No se
  // edita nada: lo valioso es justo el detalle con el que lo dedujo.
  const reportarError = async (i: number) => {
    if (reportando !== null || reportadas[i]) return;
    const respuesta = messages[i]?.text || '';
    const pregunta = [...messages.slice(0, i)].reverse().find((m) => m.role === 'user')?.text || '';
    if (!respuesta) return;
    setReportando(i);
    try {
      const r = await fetch(`${API_URL}/api/cajito/reportar-error`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convIdRef.current, pregunta, respuesta }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setReportadas((p) => ({ ...p, [i]: `Reportado · tarea ${d.task_id}` }));
      else setMessages((m) => [...m, { role: 'cajito', text: `⚠️ ${d.error || 'No se pudo reportar.'}` }]);
    } catch {
      setMessages((m) => [...m, { role: 'cajito', text: '⚠️ Error de red al reportar.' }]);
    }
    setReportando(null);
  };

  const doTrack = async () => {
    const q = query.trim();
    if (!q || trackLoading) return;
    setTrackLoading(true); setTrackError(''); setTracking(null);
    try {
      const res = await fetch(`${API_URL}/api/packages/track/${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      const m = data?.shipment?.master || data?.package || ((data && (data.tracking || data.tracking_internal)) ? data : null);
      if (!res.ok || !m) {
        setTrackError(data?.error || 'Guía no encontrada. Verifica el número e intenta de nuevo.');
        setTrackLoading(false);
        return;
      }
      const client = data?.shipment?.client || data?.client || null;
      const children = data?.shipment?.children || [];
      let movements: any[] = [];
      try {
        const mvRes = await fetch(`${API_URL}/api/packages/track/${encodeURIComponent(m.tracking || m.tracking_internal || q)}/movements`, { headers: { Authorization: `Bearer ${token}` } });
        const md = await mvRes.json().catch(() => ({}));
        const list = md?.movements || md?.events || md?.history || md?.timeline || [];
        movements = Array.isArray(list) ? list : [];
      } catch { /* sin movimientos */ }
      setTracking({ m, client, children, movements, searched: q });
    } catch {
      setTrackError('Error de red. Intenta de nuevo.');
    }
    setTrackLoading(false);
  };

  const renderTrack = () => {
    if (trackLoading) return <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 30 }} />;
    if (trackError) return (
      <View style={styles.trackEmpty}>
        <Ionicons name="alert-circle-outline" size={44} color="#9ca3af" />
        <Text style={styles.trackEmptyText}>{trackError}</Text>
      </View>
    );
    if (!tracking) return (
      <View style={styles.trackEmpty}>
        <Ionicons name="cube-outline" size={44} color="#d1d5db" />
        <Text style={styles.trackEmptyText}>Escribe una guía (US-…, TDX-…, AIR…, LOG…) para ver toda su información.</Text>
      </View>
    );
    const { m, client, children, movements } = tracking;
    const status = m.status ?? m.statusLabel ?? '';
    const sc = statusColors(status);
    const paid = (m.clientPaid ?? m.client_paid) || (m.paymentStatus ?? m.payment_status) === 'paid';
    const clientPaidAt = m.clientPaidAt ?? m.client_paid_at ?? m.paid_at ?? null;
    const dest = m.assignedAddress;
    const hasInstr = !!dest || m.needs_instructions === false;
    const carrier = String(m.nationalCarrier || '').toLowerCase();
    const isLocal = !carrier || ['local', 'entregax', 'pickup', 'bodega'].some((x) => carrier.includes(x));
    const hasLabel = isLocal ? !!m.nationalLabelUrl : !!(m.nationalLabelUrl || m.nationalTracking);
    const guiaOrigen = m.trackingCourier || m.trackingProvider;
    const lastMile = m.nationalLabelCost != null ? Number(m.nationalLabelCost) : null;
    const provMxn = isTrackOnly ? null : (m.poboxProviderCostMxn ?? m.poboxServiceCost ?? null);
    const provUsd = isTrackOnly ? null : (m.poboxProviderCostUsd ?? m.poboxCostUsd ?? null);
    // Venta al cliente en USD: PO Box usa poboxVentaUsd; Aéreo/TDI usa air_sale_price.
    const airSaleUsd = (m as any).airSalePriceUsd != null ? Number((m as any).airSalePriceUsd) : null;
    const ventaUsd = (m.poboxVentaUsd != null && Number(m.poboxVentaUsd) > 0)
      ? Number(m.poboxVentaUsd)
      : (airSaleUsd && airSaleUsd > 0 ? airSaleUsd : null);
    const totalCost = m.totalCost != null ? Number(m.totalCost) : null;
    const montoPagado = m.montoPagado ?? m.monto_pagado ?? null;
    const saldo = m.saldoPendiente ?? m.saldo_pendiente ?? null;
    // Aéreo/TDI: desglose CW × costo/kg (USD) × TC = total.
    const airCw = (m as any).airChargeableWeight != null ? Number((m as any).airChargeableWeight) : null;
    const airPerKgUsd = (m as any).airPricePerKgUsd != null ? Number((m as any).airPricePerKgUsd) : null;
    const airTc = (m as any).airExchangeRate != null ? Number((m as any).airExchangeRate) : null;
    const hasCosts = lastMile != null || provMxn != null || ventaUsd != null || totalCost != null;
    // 🩹 Si ya está pagada, no mostrar saldo pendiente fantasma (assigned_cost_mxn=0).
    const dispMontoPagado = paid && totalCost != null ? totalCost : (montoPagado != null ? Number(montoPagado) : null);
    const dispSaldo = paid ? 0 : (saldo != null ? Number(saldo) : null);
    const img = resolveUrl(m.imageUrl || m.image_url);
    const guia = m.airTracking || m.tracking || m.tracking_internal || tracking.searched;

    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {/* GUÍA */}
        <View style={[styles.box, { borderColor: '#FFB74D' }]}>
          <Text style={styles.boxLabel}>GUÍA</Text>
          <Text style={styles.guia}>{guia}</Text>
          {guiaOrigen && guiaOrigen !== m.tracking ? (
            <Text style={styles.sub}>📦 Guía origen: {m.originCarrier ? `${m.originCarrier} · ` : ''}{guiaOrigen}</Text>
          ) : null}
          <View style={styles.chipRow}>
            <Chip label={statusLabel(status)} bg={sc.bg} fg={sc.fg} />
            {m.paymentOrderRef ? <Chip label={`🧾 ${m.paymentOrderRef}`} bg="#e8f0fe" fg="#1a56db" /> : null}
            <Chip label={paid ? `✅ Pagado${clientPaidAt ? ` · ${fmtDT(clientPaidAt)}` : ''}` : '⏳ Pendiente'} bg={paid ? '#dcfce7' : '#fef3c7'} fg={paid ? '#16a34a' : '#b45309'} />
            <Chip label={hasLabel ? '🏷️ Etiquetado' : '📋 Sin etiqueta'} bg={hasLabel ? '#dcfce7' : '#f3f4f6'} fg={hasLabel ? '#16a34a' : '#6b7280'} />
            <Chip label={hasInstr ? '📍 Con instrucciones' : '⚠️ Sin instrucciones'} bg={hasInstr ? '#dcfce7' : '#fef3c7'} fg={hasInstr ? '#16a34a' : '#b45309'} />
            {Number(m.totalBoxes ?? m.total_boxes ?? 1) > 1 ? <Chip label={`${m.totalBoxes ?? m.total_boxes} cajas`} /> : null}
          </View>
        </View>

        {/* CLIENTE */}
        {client ? (
          <View style={styles.box}>
            <View style={styles.boxHeadRow}>
              <Text style={styles.boxLabel}>CLIENTE</Text>
              {client.id ? <Chip label={client.isVerified ? '✅ Verificado' : '⚠️ Sin verificar'} bg={client.isVerified ? '#dcfce7' : '#fef3c7'} fg={client.isVerified ? '#16a34a' : '#b45309'} /> : null}
            </View>
            <Text style={styles.strong}>{client.name || '—'}</Text>
            {client.boxId ? <Text style={styles.sub}>{client.boxId}</Text> : null}
            {client.email ? <Text style={styles.sub}>{client.email}</Text> : null}
            {client.advisor?.name ? <Text style={[styles.sub, { color: ORANGE, fontWeight: '600', marginTop: 3 }]}>👤 Asesor: {client.advisor.name}</Text> : null}
          </View>
        ) : null}

        {/* CONTENEDOR ASIGNADO (marítimo) */}
        {m.containerNumber ? (
          <View style={[styles.box, { borderColor: '#A5D6A7' }]}>
            <Text style={styles.boxLabel}>📦 CONTENEDOR ASIGNADO</Text>
            <Text style={[styles.strong, { color: '#2e7d32', fontSize: 18 }]}>{m.containerNumber}</Text>
            <View style={styles.chipRow}>
              {m.blNumber ? <Chip label={`BL ${m.blNumber}`} /> : null}
              {m.containerWeek ? <Chip label={`📅 ${m.containerWeek}`} bg="#e8f0fe" fg="#1a56db" /> : null}
              {m.eta ? <Chip label={`ETA ${fmtDT(m.eta)}`} bg="#e8f0fe" fg="#1a56db" /> : null}
            </View>
          </View>
        ) : null}

        {/* CONTENIDO / PESO / MEDIDAS */}
        {(m.description || m.weight || m.length || m.width || m.height) ? (
          <View style={styles.box}>
            <View style={styles.contentRow}>
              {m.description ? <View style={{ flex: 1, minWidth: 120 }}><Text style={styles.boxLabel}>CONTENIDO</Text><Text style={styles.val}>{m.description}</Text></View> : null}
              {m.weight ? <View><Text style={styles.boxLabel}>PESO</Text><Text style={styles.val}>{Number(m.weight).toFixed(2)} kg</Text></View> : null}
              {(m.length || m.width || m.height) ? <View><Text style={styles.boxLabel}>MEDIDAS</Text><Text style={styles.val}>{Number(m.length || 0).toFixed(0)}×{Number(m.width || 0).toFixed(0)}×{Number(m.height || 0).toFixed(0)} cm</Text></View> : null}
            </View>
          </View>
        ) : null}

        {/* FOTO DEL PRODUCTO */}
        {img ? (
          <View style={[styles.box, { borderColor: '#FFB74D' }]}>
            <Text style={styles.boxLabel}>FOTO DEL PRODUCTO</Text>
            <View style={styles.photoRow}>
              <Image source={{ uri: img }} style={styles.photo} resizeMode="cover" />
              <TouchableOpacity style={styles.photoBtn} onPress={() => Linking.openURL(img)}>
                <Text style={styles.photoBtnText}>📷 VER FOTO</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* DIRECCIÓN DE ENTREGA */}
        {dest ? (
          <View style={[styles.box, { borderColor: '#A5D6A7' }]}>
            <Text style={styles.boxLabel}>DIRECCIÓN DE ENTREGA</Text>
            <Text style={styles.strong}>{dest.recipientName || client?.name || '—'}</Text>
            <Text style={styles.sub}>{[dest.street, dest.exterior, dest.interior ? `Int. ${dest.interior}` : null].filter(Boolean).join(' ')}</Text>
            {dest.neighborhood ? <Text style={styles.sub}>Col. {dest.neighborhood}</Text> : null}
            <Text style={styles.sub}>{[dest.city, dest.state].filter(Boolean).join(', ')} C.P. {dest.zip || '—'}</Text>
            {dest.phone ? <Text style={styles.sub}>📞 {dest.phone}</Text> : null}
          </View>
        ) : null}

        {/* PAQUETERÍA NACIONAL */}
        {(m.nationalCarrier || m.nationalTracking) ? (
          <View style={styles.box}>
            <Text style={styles.boxLabel}>PAQUETERÍA NACIONAL</Text>
            {m.nationalCarrier ? <Text style={styles.strong}>{m.nationalCarrier}</Text> : null}
            {m.nationalTracking ? <Text style={[styles.sub, { color: ORANGE }]}>{m.nationalTracking}</Text> : null}
          </View>
        ) : null}

        {/* CAJAS (hijas) */}
        {children.length > 0 ? (
          <View style={styles.box}>
            <Text style={styles.boxLabel}>CAJAS ({children.length})</Text>
            {children.slice(0, 8).map((c: any, i: number) => (
              <View key={c.tracking || i} style={styles.childRow}>
                <Text style={styles.childTrk}>{c.tracking || c.trackingInternal || `Caja ${c.boxNumber || i + 1}`}</Text>
                <Chip label={statusLabel(c.status)} bg={statusColors(c.status).bg} fg={statusColors(c.status).fg} />
              </View>
            ))}
            {children.length > 8 ? <Text style={styles.sub}>+{children.length - 8} más</Text> : null}
          </View>
        ) : null}

        {/* COSTOS */}
        {hasCosts ? (
          <View style={[styles.box, { borderColor: '#FFE0B2' }]}>
            <Text style={styles.boxLabel}>COSTOS</Text>
            {lastMile != null ? <View style={styles.costRow}><Text style={styles.costLbl}>Paquetería (última milla)</Text><Text style={[styles.costVal, { color: '#dc2626' }]}>{fmtMoney(lastMile)}</Text></View> : null}
            {provMxn != null ? <View style={styles.costRow}><Text style={styles.costLbl}>Costo proveedor</Text><Text style={styles.costVal}>{fmtMoney(Number(provMxn))}{provUsd ? ` (${fmtMoney(Number(provUsd), 'USD')})` : ''}</Text></View> : null}
            {ventaUsd != null ? <View style={styles.costRow}><Text style={styles.costLbl}>Venta al cliente</Text><Text style={[styles.costVal, { color: '#16a34a' }]}>{fmtMoney(ventaUsd, 'USD')}</Text></View> : null}
            {airCw != null && airCw > 0 ? <View style={styles.costRow}><Text style={styles.costLbl}>CW (peso cobrable)</Text><Text style={styles.costVal}>{airCw.toFixed(2)} kg</Text></View> : null}
            {airPerKgUsd != null && airPerKgUsd > 0 ? <View style={styles.costRow}><Text style={styles.costLbl}>Costo por kg</Text><Text style={styles.costVal}>{fmtMoney(airPerKgUsd, 'USD')} /kg</Text></View> : null}
            {airTc != null && airTc > 0 ? <View style={styles.costRow}><Text style={styles.costLbl}>Tipo de cambio</Text><Text style={styles.costVal}>${airTc.toFixed(2)}</Text></View> : null}
            {totalCost != null ? <View style={[styles.costRow, styles.costTotal]}><Text style={[styles.costLbl, { fontWeight: '800', color: DARK }]}>Total a cobrar</Text><Text style={[styles.costVal, { color: '#b45309', fontWeight: '800' }]}>{fmtMoney(totalCost)}</Text></View> : null}
            {dispMontoPagado != null ? <View style={styles.costRow}><Text style={styles.costLbl}>Monto pagado{clientPaidAt ? ` · ${fmtDT(clientPaidAt)}` : ''}</Text><Text style={[styles.costVal, { color: '#16a34a' }]}>{fmtMoney(dispMontoPagado)}</Text></View> : null}
            {dispSaldo != null && dispSaldo > 0 ? <View style={styles.costRow}><Text style={styles.costLbl}>Saldo pendiente</Text><Text style={[styles.costVal, { color: '#dc2626' }]}>{fmtMoney(dispSaldo)}</Text></View> : null}
          </View>
        ) : null}

        {/* HISTORIAL */}
        <View style={styles.box}>
          <Text style={styles.boxLabel}>HISTORIAL</Text>
          {movements.length === 0 ? <Text style={[styles.sub, { fontStyle: 'italic' }]}>Sin movimientos registrados</Text> : movements.map((ev: any, i: number) => (
            <View key={ev.id ?? i} style={[styles.histRow, i < movements.length - 1 ? styles.histBorder : null]}>
              <Text style={styles.histDate}>{fmtDT(ev.createdAt || ev.created_at || ev.date)}</Text>
              <View style={{ flexDirection: 'row', marginTop: 2 }}>
                <Chip label={statusLabel(ev.statusLabel || ev.status_label || ev.status)} bg={statusColors(ev.status).bg} fg={statusColors(ev.status).fg} />
              </View>
              {(ev.branch || ev.branch_name || ev.location) ? <Text style={styles.histSub}>📍 {ev.branch || ev.branch_name || ev.location}</Text> : null}
              {(ev.description || ev.notes) ? <Text style={[styles.histSub, { fontStyle: 'italic' }]}>{ev.description || ev.notes}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderChat = () => (
    <View style={{ flex: 1 }}>
      <ScrollView ref={chatScrollRef} contentContainerStyle={{ padding: 12 }} onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}>
        <View style={styles.cajitoBubble}>
          <Text style={styles.cajitoText}>¡Hola! Soy Cajito. Tengo acceso de solo lectura al sistema: paquetes, clientes, rutas, choferes e inventarios. Pregúntame algo, p. ej. "¿dónde está TDX-…?" o "paquetes recibidos hoy".</Text>
        </View>
        {messages.map((m, i) => (
          <View key={i} style={[styles.msgWrap, m.role === 'user' ? styles.msgRight : styles.msgLeft]}>
            <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.cajitoBubble]}>
              {m.text ? <Text style={m.role === 'user' ? styles.userText : styles.cajitoText}>{m.text}</Text> : null}
              {m.adjuntos && m.adjuntos.length > 0 ? (
                <View style={styles.adjuntosFila}>
                  {m.adjuntos.map((a, j) => (a.mime.startsWith('image/') && a.uri
                    ? <Image key={j} source={{ uri: a.uri }} style={styles.adjuntoMini} />
                    : <Text key={j} style={m.role === 'user' ? styles.userText : styles.cajitoText}>📄 {a.nombre}</Text>))}
                </View>
              ) : null}
              {m.tools && m.tools.length > 0 ? <Text style={styles.toolNote}>🔧 {m.tools.join(', ')}</Text> : null}
              {m.role === 'cajito' && puedeReportar && !m.text.startsWith('⚠️') ? (
                reportadas[i] ? (
                  <Text style={styles.reportadoNota}>✅ {reportadas[i]}</Text>
                ) : (
                  <TouchableOpacity
                    onPress={() => reportarError(i)}
                    disabled={reportando !== null}
                    style={styles.reportarBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    {reportando === i
                      ? <ActivityIndicator size="small" color="#dc2626" />
                      : <Ionicons name="bug-outline" size={13} color="#dc2626" />}
                    <Text style={styles.reportarTxt}>
                      {reportando === i ? 'Reportando…' : 'Reportar un error'}
                    </Text>
                  </TouchableOpacity>
                )
              ) : null}
            </View>
          </View>
        ))}
        {sending ? <ActivityIndicator size="small" color={ORANGE} style={{ marginTop: 8 }} /> : null}
      </ScrollView>
      {adjuntos.length > 0 ? (
        <View style={styles.pendientesFila}>
          {adjuntos.map((a, j) => (
            <View key={j} style={styles.pendiente}>
              <Ionicons name={a.mime === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={14} color={DARK} />
              <Text style={styles.pendienteTxt} numberOfLines={1}>{a.nombre}</Text>
              <TouchableOpacity onPress={() => setAdjuntos((prev) => prev.filter((_, k) => k !== j))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.adjuntarBtn} onPress={adjuntar} disabled={sending} accessibilityLabel="Adjuntar archivo">
          <Ionicons name="attach" size={22} color={ORANGE} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Escribe a Cajito…"
          placeholderTextColor="#9ca3af"
          multiline
          onSubmitEditing={sendChat}
        />
        <TouchableOpacity style={[styles.sendBtn, ((!input.trim() && adjuntos.length === 0) || sending) && styles.disabled]} onPress={sendChat} disabled={(!input.trim() && adjuntos.length === 0) || sending}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <>
      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Image source={avatarSource} style={styles.fabImg} resizeMode="cover" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.header}>
              <Image source={avatarSource} style={styles.headerAvatar} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.headerTitle}>Cajito</Text>
                <Text style={styles.headerSub}>Asistente IA · Solo lectura · {roleLabel}</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              {isSuperAdmin && (
                <TouchableOpacity style={[styles.tab, tab === 'chat' && styles.tabActive]} onPress={() => setTab('chat')}>
                  <Ionicons name="sparkles-outline" size={16} color={tab === 'chat' ? ORANGE : '#6b7280'} />
                  <Text style={[styles.tabText, tab === 'chat' && styles.tabTextActive]}>Chat IA</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.tab, tab === 'track' && styles.tabActive]} onPress={() => setTab('track')}>
                <Ionicons name="search-outline" size={16} color={tab === 'track' ? ORANGE : '#6b7280'} />
                <Text style={[styles.tabText, tab === 'track' && styles.tabTextActive]}>Rastrear guía</Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={{ flex: 1 }}>
              {tab === 'chat' && isSuperAdmin ? renderChat() : (
                <View style={{ flex: 1, padding: 12 }}>
                  <View style={styles.searchBar}>
                    <TextInput
                      style={styles.searchInput}
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Guía / tracking…"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="characters"
                      onSubmitEditing={doTrack}
                      returnKeyType="search"
                    />
                    <TouchableOpacity style={styles.searchBtn} onPress={doTrack} disabled={trackLoading}>
                      <Ionicons name="search" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>{renderTrack()}</View>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 16, bottom: 24, width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: ORANGE, backgroundColor: '#fff', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  fabImg: { width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { height: '82%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: ORANGE, paddingHorizontal: 16, paddingVertical: 14 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#fff', fontSize: 11, opacity: 0.9, marginTop: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: ORANGE },
  tabText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  tabTextActive: { color: ORANGE, fontWeight: '700' },
  // chat
  msgWrap: { marginBottom: 8, maxWidth: '88%' },
  msgLeft: { alignSelf: 'flex-start' },
  msgRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  userBubble: { backgroundColor: ORANGE, borderTopRightRadius: 4 },
  cajitoBubble: { backgroundColor: '#FFF7F2', borderWidth: 1, borderColor: '#F5D9C8', borderTopLeftRadius: 4, marginBottom: 8 },
  userText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  cajitoText: { color: '#3a2a20', fontSize: 14, lineHeight: 20 },
  toolNote: { fontSize: 10, color: '#9ca3af', marginTop: 4 },
  reportarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 8, paddingVertical: 5, paddingHorizontal: 9,
    borderWidth: 1, borderColor: '#fecaca', borderRadius: 14, backgroundColor: '#fff5f5',
  },
  reportarTxt: { fontSize: 11, color: '#dc2626', fontWeight: '600' },
  reportadoNota: { fontSize: 11, color: '#16a34a', fontWeight: '600', marginTop: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  input: { flex: 1, maxHeight: 100, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: '#111' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  adjuntarBtn: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  pendientesFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  pendiente: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF3E0', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 200 },
  pendienteTxt: { fontSize: 12, color: DARK, flexShrink: 1 },
  adjuntosFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  adjuntoMini: { width: 120, height: 90, borderRadius: 8, backgroundColor: '#eee' },
  // track
  searchBar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111' },
  searchBtn: { width: 44, borderRadius: 10, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  trackEmpty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20, gap: 12 },
  trackEmptyText: { color: '#6b7280', textAlign: 'center', fontSize: 14 },
  // rich track cards
  box: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: '#fff' },
  boxLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.3 },
  boxHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  guia: { fontSize: 16, fontWeight: '800', color: DARK, marginTop: 2 },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  strong: { fontSize: 14, fontWeight: '700', color: DARK, marginTop: 2 },
  val: { fontSize: 13, color: '#374151', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  chipText: { fontSize: 11, fontWeight: '700' },
  contentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  photo: { width: 76, height: 76, borderRadius: 8, borderWidth: 1, borderColor: '#FFE0B2', backgroundColor: '#f3f4f6' },
  photoBtn: { flex: 1, borderWidth: 1, borderColor: ORANGE, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  photoBtnText: { color: ORANGE, fontWeight: '700', fontSize: 13 },
  childRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  childTrk: { fontSize: 13, fontWeight: '600', color: '#374151', flex: 1, marginRight: 8 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  costLbl: { fontSize: 12, color: '#6b7280', flex: 1, marginRight: 8 },
  costVal: { fontSize: 13, fontWeight: '600', color: DARK },
  costTotal: { borderTopWidth: 1, borderTopColor: '#FFE0B2', paddingTop: 6, marginTop: 6 },
  histRow: { paddingVertical: 8 },
  histBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  histDate: { fontSize: 11, color: '#9ca3af' },
  histSub: { fontSize: 11, color: '#6b7280', marginTop: 3 },
});
