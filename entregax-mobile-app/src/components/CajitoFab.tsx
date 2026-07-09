import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const GREEN = '#16a34a';
const DARK = '#111';

const CONV_KEY = 'cajito.conversationId';
const CAJITO_AVATAR = require('../../assets/cajito-asomando.png');

const TRACK_ONLY_ROLES = ['advisor', 'sub_advisor', 'customer_service'];

interface ChatMsg { role: 'user' | 'cajito'; text: string; tools?: string[]; }

interface Props {
  user: { role?: string; name?: string; full_name?: string };
  token: string;
}

export default function CajitoFab({ user, token }: Props) {
  const role = String(user?.role || '').toLowerCase();
  const isSuperAdmin = role === 'super_admin';
  const isTrackOnly = TRACK_ONLY_ROLES.includes(role);
  const canUse = isSuperAdmin || isTrackOnly;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'track'>(isSuperAdmin ? 'chat' : 'track');

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const convIdRef = useRef<number | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  // Tracking
  const [query, setQuery] = useState('');
  const [tracking, setTracking] = useState<any | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState('');

  // Avatar configurado (slot cajito_avatar) — se sirve en /api/system/payment-status
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CONV_KEY).then((v) => { if (v) convIdRef.current = Number(v) || null; }).catch(() => {});
    fetch(`${API_URL}/api/system/payment-status`)
      .then((r) => r.json())
      .then((d) => {
        const u = d?.cajito_avatar_url;
        if (typeof u === 'string' && u) {
          setAvatarUri(u.startsWith('http') ? u : `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`);
        }
      })
      .catch(() => {});
  }, []);

  const avatarSource = avatarUri ? { uri: avatarUri } : CAJITO_AVATAR;

  if (!canUse) return null;

  const roleLabel = isSuperAdmin ? 'Super Admin' : (role === 'customer_service' ? 'Servicio a cliente' : 'Mis clientes');

  const sendChat = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/cajito/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId: convIdRef.current }),
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

  const doTrack = async () => {
    const q = query.trim();
    if (!q || trackLoading) return;
    setTrackLoading(true); setTrackError(''); setTracking(null);
    try {
      const res = await fetch(`${API_URL}/api/public/track/${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.found !== false && data.tracking) setTracking(data);
      else setTrackError(data.error || 'Guía no encontrada. Verifica el número e intenta de nuevo.');
    } catch {
      setTrackError('Error de red. Intenta de nuevo.');
    }
    setTrackLoading(false);
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
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
        <Text style={styles.trackEmptyText}>Escribe una guía (US-…, TDX-…, AIR…, LOG…) para rastrear.</Text>
      </View>
    );
    const cur = Number(tracking.current_milestone ?? 0);
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={styles.trackGuia}>{tracking.tracking}</Text>
        {tracking.service?.es ? <Text style={styles.trackService}>{tracking.service.es}</Text> : null}

        {Array.isArray(tracking.milestones) && (
          <View style={styles.milestones}>
            {tracking.milestones.map((ms: any, idx: number) => {
              const done = idx <= cur;
              return (
                <View key={ms.key || idx} style={styles.msRow}>
                  <View style={[styles.msDot, { backgroundColor: done ? GREEN : '#e5e7eb' }]}>
                    <Ionicons name={done ? 'checkmark' : 'ellipse-outline'} size={12} color={done ? '#fff' : '#9ca3af'} />
                  </View>
                  <Text style={[styles.msLabel, done && { color: DARK, fontWeight: '700' }]}>{ms.label_es}</Text>
                </View>
              );
            })}
          </View>
        )}

        {tracking.is_master && Array.isArray(tracking.children) && tracking.children.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Master · {tracking.total_boxes || tracking.children.length} cajas</Text>
            {tracking.children.map((c: any, i: number) => (
              <View key={c.tracking || i} style={styles.childRow}>
                <Text style={styles.childTrk}>{c.tracking}</Text>
                <Text style={styles.childStatus}>{c.status_label?.es || ''}</Text>
              </View>
            ))}
          </View>
        )}

        {Array.isArray(tracking.movements) && tracking.movements.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Movimientos</Text>
            {tracking.movements.map((mv: any, i: number) => (
              <View key={i} style={styles.mvRow}>
                <View style={styles.mvDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mvDesc}>{mv.description_es || mv.location || ''}</Text>
                  <Text style={styles.mvDate}>{[mv.location, fmtDate(mv.date)].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderChat = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={chatScrollRef} contentContainerStyle={{ padding: 12 }} onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}>
        <View style={styles.cajitoBubble}>
          <Text style={styles.cajitoText}>¡Hola! Soy Cajito. Tengo acceso de solo lectura al sistema: paquetes, clientes, rutas, choferes e inventarios. Pregúntame algo, p. ej. "¿dónde está TDX-…?" o "paquetes recibidos hoy".</Text>
        </View>
        {messages.map((m, i) => (
          <View key={i} style={[styles.msgWrap, m.role === 'user' ? styles.msgRight : styles.msgLeft]}>
            <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.cajitoBubble]}>
              <Text style={m.role === 'user' ? styles.userText : styles.cajitoText}>{m.text}</Text>
              {m.tools && m.tools.length > 0 ? <Text style={styles.toolNote}>🔧 {m.tools.join(', ')}</Text> : null}
            </View>
          </View>
        ))}
        {sending ? <ActivityIndicator size="small" color={ORANGE} style={{ marginTop: 8 }} /> : null}
      </ScrollView>
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Escribe a Cajito…"
          placeholderTextColor="#9ca3af"
          multiline
          onSubmitEditing={sendChat}
        />
        <TouchableOpacity style={[styles.sendBtn, (!input.trim() || sending) && styles.disabled]} onPress={sendChat} disabled={!input.trim() || sending}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <>
      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Image source={avatarSource} style={styles.fabImg} resizeMode="cover" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
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
        </View>
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
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  input: { flex: 1, maxHeight: 100, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: '#111' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  // track
  searchBar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111' },
  searchBtn: { width: 44, borderRadius: 10, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  trackEmpty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20, gap: 12 },
  trackEmptyText: { color: '#6b7280', textAlign: 'center', fontSize: 14 },
  trackGuia: { fontSize: 18, fontWeight: '800', color: DARK },
  trackService: { fontSize: 13, color: ORANGE, fontWeight: '600', marginTop: 2, marginBottom: 8 },
  milestones: { marginTop: 6, marginBottom: 8 },
  msRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  msDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  msLabel: { fontSize: 14, color: '#9ca3af' },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 8 },
  childRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  childTrk: { fontSize: 13, fontWeight: '600', color: '#374151' },
  childStatus: { fontSize: 12, color: '#6b7280' },
  mvRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  mvDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ORANGE, marginTop: 5 },
  mvDesc: { fontSize: 13, color: '#374151' },
  mvDate: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
});
