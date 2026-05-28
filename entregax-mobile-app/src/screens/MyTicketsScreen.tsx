import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, ScrollView,
  TextInput, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { API_URL } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111111';

interface Ticket {
  id: number;
  ticket_folio: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: number;
  sender_type: string;
  message: string;
  attachment_url: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  open_ai:        { label: 'IA Atendiendo',     color: '#2196F3', icon: 'chatbubble-ellipses', bg: '#E3F2FD' },
  waiting_client: { label: 'Esperando respuesta', color: '#FF9800', icon: 'time',               bg: '#FFF3E0' },
  escalated_human:{ label: 'Con agente',          color: '#F44336', icon: 'alert-circle',        bg: '#FFEBEE' },
  resolved:       { label: 'Resuelto',             color: '#4CAF50', icon: 'checkmark-circle',   bg: '#E8F5E9' },
};

const CATEGORY_LABELS: Record<string, string> = {
  tracking:     'Rastreo',
  delay:        'Retraso',
  missing:      'Faltante',
  warranty:     'Garantía',
  compensation: 'Compensación',
  accounting:   'Contabilidad',
  systemError:  'Error del Sistema',
  other:        'Otro',
};

const timeAgo = (dateStr: string): string => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

const EMPLOYEE_CATEGORIES = [
  { key: 'systemError', label: 'Error del Sistema', icon: 'bug-outline', color: '#F44336' },
  { key: 'accounting',  label: 'Contabilidad',       icon: 'wallet-outline', color: '#2196F3' },
  { key: 'other',       label: 'Consulta General',   icon: 'help-circle-outline', color: '#9C27B0' },
];

export default function MyTicketsScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const insets = useSafeAreaInsets();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [reply, setReply] = useState('');
  const [replySending, setReplySending] = useState(false);

  // Nuevo ticket
  const [showNew, setShowNew] = useState(false);
  const [newCategory, setNewCategory] = useState('other');
  const [newMessage, setNewMessage] = useState('');
  const [newAttachments, setNewAttachments] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [creating, setCreating] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/support/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const openDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowDetail(true);
    setMsgLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/support/ticket/${ticket.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch { /* silent */ } finally {
      setMsgLoading(false);
    }
  };

  const createTicket = async () => {
    if (!newMessage.trim() && newAttachments.length === 0) return;
    setCreating(true);
    try {
      const form = new FormData();
      form.append('message', newMessage.trim());
      form.append('category', newCategory);
      form.append('escalateDirectly', 'true');
      newAttachments.forEach((f) => {
        form.append('images', { uri: f.uri, name: f.name, type: f.type } as any);
      });
      const res = await fetch(`${API_URL}/api/support/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form as any,
      });
      if (!res.ok) throw new Error();
      setShowNew(false);
      setNewMessage('');
      setNewCategory('other');
      setNewAttachments([]);
      await loadTickets();
      Alert.alert('✅ Ticket creado', 'Tu ticket fue enviado. Un agente te responderá pronto.');
    } catch {
      Alert.alert('Error', 'No se pudo crear el ticket. Intenta de nuevo.');
    } finally {
      setCreating(false);
    }
  };

  const pickImageFor = async (target: 'new' | 'reply') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: 'images', allowsMultipleSelection: true, selectionLimit: 10 });
    if (result.canceled || !result.assets?.length) return;
    const items = result.assets.map(a => {
      const ext = (a.uri.split('.').pop() || 'jpg').toLowerCase();
      return { uri: a.uri, name: a.fileName || `img.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
    });
    if (target === 'new') setNewAttachments(prev => [...prev, ...items]);
    else setReplyAttachments(prev => [...prev, ...items]);
  };

  const pickDocumentFor = async (target: 'new' | 'reply') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const items: { uri: string; name: string; type: string }[] = [];
      for (const a of result.assets) {
        if (a.size && a.size > 20 * 1024 * 1024) {
          Alert.alert('Archivo muy grande', `"${a.name}" supera 20MB y se omitió.`);
          continue;
        }
        items.push({ uri: a.uri, name: a.name || 'archivo.pdf', type: a.mimeType || 'application/pdf' });
      }
      if (!items.length) return;
      if (target === 'new') setNewAttachments(prev => [...prev, ...items]);
      else setReplyAttachments(prev => [...prev, ...items]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo seleccionar el archivo.');
    }
  };

  const sendReply = async () => {
    if (!selectedTicket) return;
    if (!reply.trim() && replyAttachments.length === 0) return;
    setReplySending(true);
    try {
      const form = new FormData();
      form.append('message', reply.trim());
      replyAttachments.forEach((f) => {
        form.append('images', { uri: f.uri, name: f.name, type: f.type } as any);
      });
      const res = await fetch(`${API_URL}/api/support/ticket/${selectedTicket.id}/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form as any,
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setReply('');
      setReplyAttachments([]);
      // Si se reabrió, actualizar estado local del ticket
      if (json.reopened) {
        setSelectedTicket(prev => prev ? { ...prev, status: 'escalated_human' } : prev);
        await loadTickets();
      }
      // Reload messages
      const res2 = await fetch(`${API_URL}/api/support/ticket/${selectedTicket.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res2.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Error', 'No se pudo enviar el mensaje');
    } finally {
      setReplySending(false);
    }
  };

  const getStatus = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.open_ai;

  const renderTicket = ({ item }: { item: Ticket }) => {
    const s = getStatus(item.status);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetail(item)}>
        <View style={styles.cardTop}>
          <Text style={styles.folio}>{item.ticket_folio || `#${item.id}`}</Text>
          <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
            <Ionicons name={s.icon as any} size={11} color={s.color} />
            <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
          </View>
          <Text style={styles.timeAgo}>{timeAgo(item.updated_at)}</Text>
        </View>
        <Text style={styles.subject} numberOfLines={1}>{item.subject || CATEGORY_LABELS[item.category] || item.category}</Text>
        <View style={styles.catRow}>
          <View style={styles.catBadge}>
            <Text style={styles.catText}>{CATEGORY_LABELS[item.category] || item.category}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Tickets</Text>
        <TouchableOpacity onPress={() => setShowNew(true)} style={styles.newBtn}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={t => String(t.id)}
          renderItem={renderTicket}
          contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTickets(); }} colors={[ORANGE]} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="ticket-outline" size={52} color="#ccc" />
              <Text style={styles.emptyText}>No tienes tickets aún</Text>
              <Text style={styles.emptySubtext}>Toca el botón + para crear tu primer ticket</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowNew(true)}>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Nuevo Ticket</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Modal: Nuevo Ticket */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNew(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.detailContainer}>
            <View style={[styles.detailHeader, { paddingTop: insets.top + 10 }]}>
              <Text style={[styles.detailFolio, { fontSize: 18 }]}>Nuevo Ticket</Text>
              <TouchableOpacity onPress={() => setShowNew(false)} style={[styles.closeBtn, { marginLeft: 'auto' }]}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 18 }}>
              {/* Categoría */}
              <Text style={styles.newLabel}>Categoría</Text>
              <View style={styles.catSelectRow}>
                {EMPLOYEE_CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.catOption, newCategory === c.key && { borderColor: c.color, backgroundColor: c.color + '15' }]}
                    onPress={() => setNewCategory(c.key)}
                  >
                    <Ionicons name={c.icon as any} size={20} color={newCategory === c.key ? c.color : '#888'} />
                    <Text style={[styles.catOptionText, newCategory === c.key && { color: c.color, fontWeight: '700' }]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Mensaje */}
              <Text style={styles.newLabel}>Describe tu situación</Text>
              <TextInput
                style={styles.newMsgInput}
                placeholder="Escribe los detalles del problema o consulta..."
                placeholderTextColor="#aaa"
                value={newMessage}
                onChangeText={setNewMessage}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              {/* Adjuntos */}
              <Text style={styles.newLabel}>Adjuntos (opcional)</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity style={styles.attachAddBtn} onPress={() => pickImageFor('new')}>
                  <Ionicons name="image-outline" size={20} color={ORANGE} />
                  <Text style={styles.attachAddText}>Fotos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.attachAddBtn} onPress={() => pickDocumentFor('new')}>
                  <Ionicons name="document-attach-outline" size={20} color={ORANGE} />
                  <Text style={styles.attachAddText}>PDF</Text>
                </TouchableOpacity>
              </View>
              {newAttachments.length > 0 && (
                <View style={{ marginBottom: 18, gap: 8 }}>
                  {newAttachments.map((f, i) => {
                    const isImg = f.type.startsWith('image/');
                    return (
                      <View key={i} style={styles.attachChip}>
                        {isImg ? (
                          <Image source={{ uri: f.uri }} style={{ width: 38, height: 38, borderRadius: 6 }} />
                        ) : (
                          <Ionicons name="document-text" size={26} color="#c62828" />
                        )}
                        <Text style={styles.attachChipName} numberOfLines={1}>{f.name}</Text>
                        <TouchableOpacity onPress={() => setNewAttachments(prev => prev.filter((_, j) => j !== i))}>
                          <Ionicons name="close-circle" size={20} color="#f44336" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, ((!newMessage.trim() && newAttachments.length === 0) || creating) && { opacity: 0.45 }]}
                onPress={createTicket}
                disabled={(!newMessage.trim() && newAttachments.length === 0) || creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="send" size={18} color="#fff" /><Text style={styles.submitBtnText}>Enviar Ticket</Text></>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal detalle de ticket */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDetail(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.detailContainer}>
            {/* Header modal */}
            <View style={[styles.detailHeader, { paddingTop: insets.top + 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailFolio}>{selectedTicket?.ticket_folio || `#${selectedTicket?.id}`}</Text>
                <Text style={styles.detailCategory} numberOfLines={1}>
                  {CATEGORY_LABELS[selectedTicket?.category || ''] || selectedTicket?.category}
                </Text>
              </View>
              {selectedTicket && (() => {
                const s = getStatus(selectedTicket.status);
                return (
                  <View style={[styles.statusBadge, { backgroundColor: s.bg, marginRight: 8 }]}>
                    <Ionicons name={s.icon as any} size={11} color={s.color} />
                    <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                  </View>
                );
              })()}
              <TouchableOpacity onPress={() => setShowDetail(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Messages */}
            {msgLoading ? (
              <View style={styles.center}><ActivityIndicator color={ORANGE} /></View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 8 }}>
                {messages.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>Sin mensajes aún</Text>
                ) : (
                  messages.map(msg => {
                    const isClient = msg.sender_type === 'client';
                    return (
                      <View key={msg.id} style={[styles.bubble, isClient ? styles.bubbleClient : styles.bubbleAgent]}>
                        <Text style={[styles.bubbleText, isClient ? styles.bubbleTextClient : styles.bubbleTextAgent]}>
                          {msg.message}
                        </Text>
                        <Text style={[styles.bubbleTime, { textAlign: isClient ? 'right' : 'left' }]}>
                          {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}
                          {new Date(msg.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                        </Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Reply box — always visible; sends reopen if resolved */}
            <View style={{ paddingBottom: insets.bottom + 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0' }}>
              {replyAttachments.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{ paddingHorizontal: 10, paddingTop: 8 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {replyAttachments.map((f, i) => {
                    const isImg = f.type.startsWith('image/');
                    return (
                      <View key={i} style={styles.attachChipSmall}>
                        {isImg ? (
                          <Image source={{ uri: f.uri }} style={{ width: 34, height: 34, borderRadius: 4 }} />
                        ) : (
                          <Ionicons name="document-text" size={22} color="#c62828" />
                        )}
                        <Text style={styles.attachChipNameSmall} numberOfLines={1}>{f.name}</Text>
                        <TouchableOpacity onPress={() => setReplyAttachments(prev => prev.filter((_, j) => j !== i))}>
                          <Ionicons name="close-circle" size={18} color="#f44336" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
              <View style={styles.replyBox}>
                <TouchableOpacity style={styles.replyIconBtn} onPress={() => pickImageFor('reply')}>
                  <Ionicons name="image-outline" size={22} color={ORANGE} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.replyIconBtn} onPress={() => pickDocumentFor('reply')}>
                  <Ionicons name="document-attach-outline" size={22} color={ORANGE} />
                </TouchableOpacity>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Escribe un mensaje..."
                  placeholderTextColor="#aaa"
                  value={reply}
                  onChangeText={setReply}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.sendBtn, ((!reply.trim() && replyAttachments.length === 0) || replySending) && { opacity: 0.4 }]}
                  onPress={sendReply}
                  disabled={(!reply.trim() && replyAttachments.length === 0) || replySending}
                >
                  {replySending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="send" size={18} color="#fff" />
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#555', fontSize: 16, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  emptySubtext: { color: '#999', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  folio: { fontSize: 13, fontWeight: '700', color: BLACK },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  timeAgo: { marginLeft: 'auto', fontSize: 11, color: '#999' },
  subject: { fontSize: 14, color: '#333', fontWeight: '500', marginBottom: 6 },
  catRow: { flexDirection: 'row' },
  catBadge: { backgroundColor: '#F3E5F5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { fontSize: 11, color: '#7B1FA2', fontWeight: '600' },

  detailContainer: { flex: 1, backgroundColor: '#F5F5F5' },
  detailHeader: {
    backgroundColor: BLACK,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  detailFolio: { color: '#fff', fontSize: 16, fontWeight: '700' },
  detailCategory: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  bubbleClient: { backgroundColor: ORANGE, alignSelf: 'flex-end' },
  bubbleAgent: { backgroundColor: '#fff', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#e0e0e0' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextClient: { color: '#fff' },
  bubbleTextAgent: { color: '#333' },
  bubbleTime: { fontSize: 10, marginTop: 4, color: 'rgba(0,0,0,0.4)' },
  replyBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 10,
    gap: 8,
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
    color: '#333',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: ORANGE,
    justifyContent: 'center', alignItems: 'center',
  },
  newBtn: { width: 40, alignItems: 'flex-end' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 18, backgroundColor: ORANGE,
    borderRadius: 22, paddingHorizontal: 20, paddingVertical: 10,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  newLabel: { fontSize: 13, fontWeight: '700', color: BLACK, marginBottom: 10, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  catSelectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  catOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: '#fff',
  },
  catOptionText: { fontSize: 13, color: '#555' },
  newMsgInput: {
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#333',
    minHeight: 120, backgroundColor: '#fff', marginBottom: 22,
  },
  submitBtn: {
    backgroundColor: ORANGE, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  replyIconBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#FFF3EE',
  },
  attachAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: ORANGE, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: '#FFF3EE',
  },
  attachAddText: { color: ORANGE, fontWeight: '700', fontSize: 13 },
  attachChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 10, padding: 8,
  },
  attachChipName: { flex: 1, fontSize: 13, color: '#333' },
  attachChipSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f5f5f5', borderRadius: 8, padding: 6,
    maxWidth: 180,
  },
  attachChipNameSmall: { flex: 1, fontSize: 11, color: '#333' },
});
