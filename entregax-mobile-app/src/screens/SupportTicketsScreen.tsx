import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, API_URL } from '../services/api';

const BLUE = '#3F51B5';
const BLACK = '#111';

interface Ticket {
  id: number;
  ticket_folio: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  client_name: string;
  client_email: string;
  client_box_id: string;
  message_count: number;
  last_message: string;
  department_name: string;
}

interface TicketMessage {
  id: number;
  sender_type: string;
  message: string;
  attachment_url: string | null;
  created_at: string;
  sender_name?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  open_ai:         { label: 'IA Atendiendo',      color: '#2196F3', icon: 'chatbubble-ellipses', bg: '#E3F2FD' },
  waiting_client:  { label: 'Esperando Cliente',  color: '#FF9800', icon: 'time',                bg: '#FFF3E0' },
  escalated_human: { label: 'Escalado',            color: '#F44336', icon: 'alert-circle',        bg: '#FFEBEE' },
  needs_human:     { label: 'Requiere Humano',     color: '#E91E63', icon: 'person',              bg: '#FCE4EC' },
  resolved:        { label: 'Resuelto',            color: '#4CAF50', icon: 'checkmark-circle',    bg: '#E8F5E9' },
  closed:          { label: 'Cerrado',             color: '#9E9E9E', icon: 'close-circle',        bg: '#F5F5F5' },
};

const CATEGORY_LABELS: Record<string, string> = {
  tracking: 'Rastreo', billing: 'Facturación', quote: 'Cotización',
  missing: 'Paquete Perdido', damage: 'Daño', other: 'Otro',
  delivery: 'Entrega', warranty: 'Garantía', compensation: 'Compensación',
  accounting: 'Contabilidad', systemError: 'Error Sistema',
  container: 'Contenedor', clientIssue: 'Problema con Cliente',
};

function getCedisDeptName(branchCode: string, branchName: string): string {
  const code = (branchCode || '').toUpperCase();
  const name = (branchName || '').toUpperCase();
  if (code === 'MTY' || name.includes('MTY') || name.includes('MONTERREY')) return 'CEDIS MTY';
  if (code === 'CDMX' || name.includes('CDMX') || name.includes('CIUDAD DE MEXICO') || name.includes('CIUDAD DE MÉXICO')) return 'CEDIS CDMX';
  if (code === 'TX' || code === 'USA' || name.includes('HIDALGO') || name.includes('TEXAS') || name.includes('USA')) return 'CEDIS USA';
  return '';
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMins < 60) return `hace ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  return `hace ${Math.floor(diffHours / 24)}d`;
}

export default function SupportTicketsScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const insets = useSafeAreaInsets();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptId, setDeptId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('open');

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Determinar el dpto CEDIS del usuario (con fallback al perfil si no hay branch en el objeto)
  useEffect(() => {
    const detect = async () => {
      let code = String(user.branch_code || user.branchCode || '');
      let name = String(user.branch_name || user.branchName || '');

      // Si no hay branch info en el user, pedirla al perfil
      if (!code && !name) {
        try {
          const res = await api.get('/api/auth/profile', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const profile = res.data?.user || res.data || {};
          code = String(profile.branch_code || '');
          name = String(profile.branch_name || '');
        } catch {}
      }

      const cedis = getCedisDeptName(code, name);
      setDeptName(cedis);
      if (!cedis) setLoading(false); // sin CEDIS → salir del spinner
    };
    detect();
  }, [user, token]);

  // Cargar el ID del departamento una vez que tenemos el nombre
  useEffect(() => {
    if (!deptName) return;
    (async () => {
      try {
        const res = await api.get('/api/support/departments', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const depts: Array<{ id: number; name: string }> = Array.isArray(res.data) ? res.data : [];
        const found = depts.find(d => d.name === deptName);
        if (found) {
          setDeptId(found.id);
        } else {
          setLoading(false); // departamento no encontrado → salir del spinner
        }
      } catch {
        setLoading(false);
      }
    })();
  }, [deptName, token]);

  const loadTickets = useCallback(async (showLoader = false) => {
    if (!deptId) return;
    if (showLoader) setLoading(true);
    try {
      let url = `/api/admin/support/tickets?department_id=${deptId}&limit=100`;
      if (filter !== 'open') url += `&status=${filter}`;
      const res = await api.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const all: Ticket[] = Array.isArray(res.data) ? res.data : (res.data.tickets || []);
      const filtered = filter === 'open'
        ? all.filter(t => !['resolved', 'closed'].includes(t.status))
        : all;
      setTickets(filtered);
    } catch (e) {
      console.error('Error cargando tickets CEDIS:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deptId, token, filter]);

  useEffect(() => {
    if (deptId) loadTickets(true);
  }, [deptId, filter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTickets(false);
  }, [loadTickets]);

  const openDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setMessages([]);
    setReplyText('');
    setShowDetail(true);
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/admin/support/ticket/${ticket.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const msgs: TicketMessage[] = Array.isArray(res.data) ? res.data : (res.data.messages || []);
      setMessages(msgs);
    } catch (e) {
      console.error('Error cargando mensajes:', e);
    } finally {
      setDetailLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSending(true);
    try {
      await api.post(`/api/admin/support/ticket/${selectedTicket.id}/reply`, {
        message: replyText.trim(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReplyText('');
      // Recargar mensajes
      const res = await api.get(`/api/admin/support/ticket/${selectedTicket.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const msgs: TicketMessage[] = Array.isArray(res.data) ? res.data : (res.data.messages || []);
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e) {
      Alert.alert('Error', 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  };

  const resolveTicket = async () => {
    if (!selectedTicket) return;
    Alert.alert('Resolver Ticket', '¿Marcar este ticket como resuelto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Resolver',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/api/admin/support/ticket/${selectedTicket.id}/resolve`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            setShowDetail(false);
            loadTickets(false);
          } catch {
            Alert.alert('Error', 'No se pudo resolver el ticket.');
          }
        },
      },
    ]);
  };

  const getStatusInfo = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.open_ai;

  const FILTERS = [
    { key: 'open', label: 'Abiertos' },
    { key: 'escalated_human', label: 'Escalados' },
    { key: 'waiting_client', label: 'En Espera' },
    { key: 'resolved', label: 'Resueltos' },
  ];

  const renderTicket = ({ item }: { item: Ticket }) => {
    const statusInfo = getStatusInfo(item.status);
    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.75}>
        <View style={styles.cardHeader}>
          <View style={styles.folioRow}>
            <Text style={styles.folio}>{item.ticket_folio || `#${item.id}`}</Text>
            <View style={[styles.badge, { backgroundColor: statusInfo.bg }]}>
              <Ionicons name={statusInfo.icon as any} size={11} color={statusInfo.color} />
              <Text style={[styles.badgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
          </View>
          <Text style={styles.timeAgo}>{timeAgo(item.updated_at)}</Text>
        </View>
        <Text style={styles.subject} numberOfLines={1}>{item.subject}</Text>
        <Text style={styles.clientName} numberOfLines={1}>
          {item.client_name || 'Cliente'} · {CATEGORY_LABELS[item.category] || item.category}
        </Text>
        {item.last_message ? (
          <Text style={styles.preview} numberOfLines={1}>"{item.last_message}"</Text>
        ) : null}
        {item.message_count > 0 && (
          <Text style={styles.msgCount}>{item.message_count} mensaje{item.message_count !== 1 ? 's' : ''}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderMessage = (msg: TicketMessage) => {
    const isAdmin = msg.sender_type === 'admin' || msg.sender_type === 'staff';
    return (
      <View key={msg.id} style={[styles.msgRow, isAdmin ? styles.msgRowAdmin : styles.msgRowClient]}>
        <View style={[styles.msgBubble, isAdmin ? styles.bubbleAdmin : styles.bubbleClient]}>
          <Text style={[styles.msgSender, { color: isAdmin ? '#fff9' : '#0009' }]}>
            {isAdmin ? (msg.sender_name || 'Soporte') : (msg.sender_name || 'Cliente')}
          </Text>
          <Text style={[styles.msgText, { color: isAdmin ? '#fff' : '#111' }]}>{msg.message}</Text>
          <Text style={[styles.msgTime, { color: isAdmin ? '#fff8' : '#0006' }]}>
            {new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tickets de Soporte</Text>
          <Text style={styles.headerSub}>{deptName || 'CEDIS'} · {tickets.length} tickets</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.backBtn}>
          <Ionicons name="refresh" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Sin departamento detectado */}
      {!deptName && !loading && (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>Sin CEDIS asignado</Text>
          <Text style={styles.emptySubtitle}>Tu cuenta no tiene una sucursal CEDIS detectada. Contacta a tu administrador.</Text>
        </View>
      )}

      {/* Filtros */}
      {!!deptName && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Lista */}
      {loading ? (
        <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={item => String(item.id)}
          renderItem={renderTicket}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BLUE]} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="ticket-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>Sin Tickets</Text>
              <Text style={styles.emptySubtitle}>No hay tickets {FILTERS.find(f => f.key === filter)?.label.toLowerCase()} en {deptName}</Text>
            </View>
          }
        />
      )}

      {/* Ticket Detail Modal */}
      <Modal visible={showDetail} animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDetail(false)} style={styles.backBtn}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>{selectedTicket?.ticket_folio || `#${selectedTicket?.id}`}</Text>
                <Text style={styles.headerSub}>{selectedTicket?.client_name || 'Cliente'} · {CATEGORY_LABELS[selectedTicket?.category || ''] || selectedTicket?.category}</Text>
              </View>
              {selectedTicket && !['resolved', 'closed'].includes(selectedTicket.status) && (
                <TouchableOpacity onPress={resolveTicket} style={styles.resolveBtn}>
                  <Ionicons name="checkmark-done" size={16} color="#fff" />
                  <Text style={styles.resolveBtnText}>Resolver</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Status badge */}
            {selectedTicket && (
              <View style={[styles.detailStatus, { backgroundColor: getStatusInfo(selectedTicket.status).bg }]}>
                <Ionicons name={getStatusInfo(selectedTicket.status).icon as any} size={14} color={getStatusInfo(selectedTicket.status).color} />
                <Text style={[styles.detailStatusText, { color: getStatusInfo(selectedTicket.status).color }]}>
                  {getStatusInfo(selectedTicket.status).label} · {selectedTicket.subject}
                </Text>
              </View>
            )}

            {/* Messages */}
            {detailLoading ? (
              <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 48 }} />
            ) : (
              <ScrollView ref={scrollRef} style={styles.messagesContainer} contentContainerStyle={{ paddingBottom: 16 }}>
                {messages.length === 0 ? (
                  <Text style={styles.noMessages}>Sin mensajes aún</Text>
                ) : (
                  messages.map(renderMessage)
                )}
              </ScrollView>
            )}

            {/* Reply box */}
            {selectedTicket && !['resolved', 'closed'].includes(selectedTicket.status) && (
              <View style={[styles.replyBar, { paddingBottom: insets.bottom || 8 }]}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Escribe una respuesta..."
                  placeholderTextColor="#aaa"
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                  maxLength={2000}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!replyText.trim() || sending) && { opacity: 0.4 }]}
                  onPress={sendReply}
                  disabled={!replyText.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: '#3F51B5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#fff9', fontSize: 12 },
  filterBar: { maxHeight: 48, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F0F0F0', marginVertical: 8,
  },
  filterChipActive: { backgroundColor: '#3F51B5' },
  filterChipText: { fontSize: 13, color: '#555', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  listContent: { padding: 12, gap: 10 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  folioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  folio: { fontSize: 13, fontWeight: '700', color: BLACK },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  timeAgo: { fontSize: 11, color: '#999' },
  subject: { fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 2 },
  clientName: { fontSize: 12, color: '#777', marginBottom: 4 },
  preview: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  msgCount: { fontSize: 11, color: '#3F51B5', marginTop: 4, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#555', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#999', textAlign: 'center', marginTop: 8 },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F5F5F5' },
  modalHeader: {
    backgroundColor: '#3F51B5', flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, gap: 8,
  },
  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4CAF50', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  resolveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  detailStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    margin: 12, padding: 10, borderRadius: 8,
  },
  detailStatusText: { fontSize: 13, fontWeight: '600', flex: 1 },
  messagesContainer: { flex: 1, paddingHorizontal: 12 },
  noMessages: { textAlign: 'center', color: '#aaa', marginTop: 48, fontSize: 14 },
  msgRow: { marginVertical: 4 },
  msgRowAdmin: { alignItems: 'flex-end' },
  msgRowClient: { alignItems: 'flex-start' },
  msgBubble: { maxWidth: '80%', borderRadius: 14, padding: 10 },
  bubbleAdmin: { backgroundColor: '#3F51B5', borderBottomRightRadius: 4 },
  bubbleClient: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  msgSender: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', padding: 10,
  },
  replyInput: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, maxHeight: 100,
    fontSize: 14, color: '#111',
  },
  sendBtn: {
    backgroundColor: '#3F51B5', borderRadius: 20,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },
});
