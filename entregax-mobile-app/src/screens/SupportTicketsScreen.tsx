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
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
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
  attachments?: string[] | string | null;
  is_internal?: boolean;
  created_at: string;
  sender_name?: string;
}

interface AttachedFile {
  uri: string;
  name: string;
  type: 'image' | 'pdf';
  mimeType: string; // MIME type real del archivo
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
  const [defaultCsDeptId, setDefaultCsDeptId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('open');

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
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
        const depts: Array<{ id: number; name: string; is_default_for_clients: boolean }> = Array.isArray(res.data) ? res.data : [];
        // Guardar dept de Atención a Cliente (is_default_for_clients = true) para transferencias
        const csDept = depts.find(d => d.is_default_for_clients === true);
        if (csDept) setDefaultCsDeptId(csDept.id);
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
    setAttachedFile(null);
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

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const name = asset.fileName || `foto_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      setAttachedFile({ uri: asset.uri, name, type: 'image', mimeType });
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachedFile({ uri: asset.uri, name: asset.name, type: 'pdf', mimeType: 'application/pdf' });
    }
  };

  const showAttachMenu = () => {
    Alert.alert('Adjuntar archivo', 'Selecciona el tipo de archivo', [
      { text: 'Foto de galería', onPress: pickImage },
      { text: 'Documento PDF', onPress: pickDocument },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const reloadMessages = async (ticketId: number) => {
    const res = await api.get(`/api/admin/support/ticket/${ticketId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msgs: TicketMessage[] = Array.isArray(res.data) ? res.data : (res.data.messages || []);
    setMessages(msgs);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  };

  const sendReply = async () => {
    if (!replyText.trim() && !attachedFile) return;
    if (!selectedTicket) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('message', replyText.trim() || '');
      if (attachedFile) {
        formData.append('images', {
          uri: attachedFile.uri,
          name: attachedFile.name,
          type: attachedFile.mimeType,
        } as any);
      }
      const resp = await fetch(`${API_URL}/api/admin/support/ticket/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        Alert.alert('Error', errData.error || `Error ${resp.status} al enviar la respuesta.`);
        return;
      }
      const result = await resp.json().catch(() => ({}));
      // Avisar si se adjuntó archivo pero no llegó al servidor
      if (attachedFile && (!result.attachments || result.attachments.length === 0)) {
        Alert.alert(
          'Aviso',
          'El mensaje fue enviado pero el archivo adjunto no se pudo subir. Intenta adjuntarlo de nuevo.',
          [{ text: 'OK' }]
        );
      }
      setReplyText('');
      setAttachedFile(null);
      await reloadMessages(selectedTicket.id);
    } catch (e) {
      Alert.alert('Error', 'No se pudo enviar el mensaje. Verifica tu conexión.');
    } finally {
      setSending(false);
    }
  };

  const transferToCS = async () => {
    if (!selectedTicket) return;
    Alert.alert(
      '¿Listo para Atención al Cliente?',
      'El ticket regresará a Atención al Cliente para que respondan al cliente. Se enviará una nota interna indicando que CEDIS ya revisó el caso.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              const resp = await fetch(`${API_URL}/api/admin/support/ticket/${selectedTicket.id}/transfer`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  department_id: defaultCsDeptId,
                  note: `${deptName} revisó el caso. Listo para responder al cliente.`,
                }),
              });
              if (!resp.ok) {
                Alert.alert('Error', 'No se pudo transferir el ticket.');
                return;
              }
              setShowDetail(false);
              loadTickets(false);
            } catch {
              Alert.alert('Error', 'No se pudo transferir el ticket.');
            }
          },
        },
      ]
    );
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
    const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'admin' || msg.sender_type === 'staff';
    const isInternal = !!msg.is_internal;
    // Parsear adjuntos
    let attachUrls: string[] = [];
    if (Array.isArray(msg.attachments)) attachUrls = msg.attachments as string[];
    else if (typeof msg.attachments === 'string') {
      try { const p = JSON.parse(msg.attachments); if (Array.isArray(p)) attachUrls = p; } catch {}
    }
    if (attachUrls.length === 0 && msg.attachment_url) attachUrls = [msg.attachment_url];

    const bubbleBg = isInternal ? '#FFF8E1' : isAgent ? BLUE : '#fff';
    const textColor = isInternal ? '#333' : isAgent ? '#fff' : '#111';
    const senderColor = isInternal ? '#F57F17' : isAgent ? '#ffffffcc' : '#00000099';

    return (
      <View key={msg.id} style={[styles.msgRow, isAgent ? styles.msgRowAdmin : styles.msgRowClient]}>
        <View style={[
          styles.msgBubble,
          { backgroundColor: bubbleBg },
          isInternal && styles.bubbleInternal,
        ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={[styles.msgSender, { color: senderColor }]}>
              {isAgent ? (msg.sender_name || 'Agente') : 'Cliente'}
            </Text>
            {isInternal && (
              <View style={styles.internalBadge}>
                <Text style={styles.internalBadgeText}>🔒 Interno</Text>
              </View>
            )}
          </View>
          <Text style={[styles.msgText, { color: textColor }]}>
            {msg.message?.replace(/\n*📷 Imágenes adjuntas:[\s\S]*$/, '').trim()}
          </Text>
          {attachUrls.map((url, i) => {
            const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('pdf');
            return isPdf ? (
              <TouchableOpacity key={i} style={styles.attachPdf} onPress={() => Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir el archivo'))}>
                <Ionicons name="document-outline" size={16} color="#E91E63" />
                <Text style={styles.attachPdfText}>Ver PDF</Text>
              </TouchableOpacity>
            ) : (
              <Image key={i} source={{ uri: url }} style={styles.attachImg} resizeMode="cover" />
            );
          })}
          <Text style={[styles.msgTime, { color: isInternal ? '#F57F1799' : isAgent ? '#ffffff88' : '#00000066' }]}>
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
                <TouchableOpacity onPress={transferToCS} style={styles.resolveBtn}>
                  <Ionicons name="arrow-redo" size={16} color="#fff" />
                  <Text style={styles.resolveBtnText}>Listo ✓</Text>
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

            {/* Internal chat banner */}
            <View style={styles.internalBanner}>
              <Ionicons name="lock-closed" size={13} color="#795548" />
              <Text style={styles.internalBannerText}>Chat Interno · Solo visible para el equipo de oficina</Text>
            </View>

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
              <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', paddingBottom: insets.bottom || 8 }}>
                {/* Attached file preview */}
                {attachedFile && (
                  <View style={styles.attachPreviewRow}>
                    {attachedFile.type === 'image' ? (
                      <Image source={{ uri: attachedFile.uri }} style={styles.attachPreviewImg} />
                    ) : (
                      <View style={styles.attachPreviewPdf}>
                        <Ionicons name="document-outline" size={18} color="#E91E63" />
                        <Text style={styles.attachPreviewPdfText} numberOfLines={1}>{attachedFile.name}</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => setAttachedFile(null)} style={styles.attachRemoveBtn}>
                      <Ionicons name="close-circle" size={20} color="#f44336" />
                    </TouchableOpacity>
                  </View>
                )}
                <View style={styles.replyBar}>
                  <TouchableOpacity style={styles.attachBtn} onPress={showAttachMenu}>
                    <Ionicons name="attach" size={22} color="#666" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.replyInput}
                    placeholder="Escribe una respuesta interna..."
                    placeholderTextColor="#aaa"
                    value={replyText}
                    onChangeText={setReplyText}
                    multiline
                    maxLength={2000}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, (!replyText.trim() && !attachedFile || sending) && { opacity: 0.4 }]}
                    onPress={sendReply}
                    disabled={(!replyText.trim() && !attachedFile) || sending}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="send" size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
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
  internalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF8E1', paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#FFE082',
  },
  internalBannerText: { fontSize: 12, color: '#795548', fontWeight: '600', flex: 1 },
  bubbleInternal: { borderWidth: 1, borderColor: '#FFE082', borderBottomRightRadius: 4 },
  internalBadge: {
    backgroundColor: '#FFF3E0', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6, borderWidth: 1, borderColor: '#FFE082',
  },
  internalBadgeText: { fontSize: 10, color: '#E65100', fontWeight: '700' },
  attachImg: { width: '100%', height: 160, borderRadius: 8, marginTop: 6 },
  attachPdf: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FCE4EC', padding: 8, borderRadius: 8, marginTop: 6,
  },
  attachPdfText: { fontSize: 13, color: '#C2185B', fontWeight: '600' },
  attachPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
  },
  attachPreviewImg: { width: 56, height: 56, borderRadius: 8 },
  attachPreviewPdf: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FCE4EC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, flex: 1,
  },
  attachPreviewPdfText: { fontSize: 12, color: '#C2185B', flex: 1 },
  attachRemoveBtn: { padding: 4 },
  attachBtn: { padding: 6 },
  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10,
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
