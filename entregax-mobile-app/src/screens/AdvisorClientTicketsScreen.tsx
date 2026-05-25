import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

const ORANGE = '#F05A28';
const BLACK = '#111';

interface Ticket {
  id: number;
  ticket_folio: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  sentiment: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  client_id: number;
  client_name: string;
  client_email: string;
  client_box_id: string;
  message_count: number;
  last_message: string;
  last_sender: string;
}

interface TicketMessage {
  id: number;
  sender_type: string;
  message: string;
  attachment_url: string | null;
  created_at: string;
}

interface TicketStats {
  total: number;
  open_ai: number;
  escalated: number;
  waiting: number;
  resolved: number;
  last_7_days: number;
}

interface MyTicket {
  id: number;
  ticket_folio: string;
  category: string;
  subject: string;
  status: string;
  priority: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  open_ai: { label: 'IA Atendiendo', color: '#2196F3', icon: 'chatbubble-ellipses', bg: '#E3F2FD' },
  waiting_client: { label: 'Esperando Cliente', color: '#FF9800', icon: 'time', bg: '#FFF3E0' },
  escalated_human: { label: 'Escalado', color: '#F44336', icon: 'alert-circle', bg: '#FFEBEE' },
  resolved: { label: 'Resuelto', color: '#4CAF50', icon: 'checkmark-circle', bg: '#E8F5E9' },
};

const CATEGORY_LABELS: Record<string, string> = {
  tracking: 'Rastreo',
  billing: 'Facturación',
  quote: 'Cotización',
  missing: 'Paquete Perdido',
  damage: 'Daño',
  other: 'Otro',
  delivery: 'Entrega',
  warranty: 'Garantía',
  compensation: 'Compensación',
  accounting: 'Contabilidad',
  systemError: 'Error Sistema',
  container: 'Contenedor',
  clientIssue: 'Problema con Cliente',
};

export default function AdvisorClientTicketsScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<'clients' | 'mine'>('clients');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [myTickets, setMyTickets] = useState<MyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | MyTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      if (viewMode === 'mine') {
        const res = await api.get('/api/support/tickets', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMyTickets(Array.isArray(res.data) ? res.data : []);
      } else {
        const qs = filter !== 'all' ? `?status=${filter}` : '';
        const res = await api.get(`/api/advisor/client-tickets${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success) {
          setTickets(res.data.tickets);
          setStats(res.data.stats);
        }
      }
    } catch (error) {
      console.error('Error cargando tickets:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, filter, viewMode]);

  useEffect(() => {
    setLoading(true);
    loadTickets();
  }, [loadTickets]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTickets();
  };

  const openTicketDetail = async (ticket: Ticket | MyTicket) => {
    setSelectedTicket(ticket);
    setShowDetail(true);
    setDetailLoading(true);
    try {
      if (viewMode === 'mine') {
        const res = await api.get(`/api/support/ticket/${ticket.id}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTicketMessages(Array.isArray(res.data) ? res.data : []);
      } else {
        const res = await api.get(`/api/advisor/client-tickets/${ticket.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success) {
          setTicketMessages(res.data.messages);
        }
      }
    } catch (error) {
      console.error('Error cargando detalle:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const sendAdvisorReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setReplySending(true);
    try {
      const endpoint = viewMode === 'mine'
        ? `/api/support/ticket/${selectedTicket.id}/message`
        : `/api/admin/support/ticket/${selectedTicket.id}/reply`;
      await api.post(endpoint, { message: replyText.trim() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReplyText('');
      // Reload messages
      const res = viewMode === 'mine'
        ? await api.get(`/api/support/ticket/${selectedTicket.id}/messages`, { headers: { Authorization: `Bearer ${token}` } })
        : await api.get(`/api/advisor/client-tickets/${selectedTicket.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const msgs = viewMode === 'mine' ? (Array.isArray(res.data) ? res.data : []) : (res.data.success ? res.data.messages : []);
      setTicketMessages(msgs);
    } catch {
      Alert.alert('Error', 'No se pudo enviar el mensaje. Intenta de nuevo.');
    } finally {
      setReplySending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `hace ${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `hace ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `hace ${diffDays}d`;
    return formatDate(dateStr);
  };

  const getStatusInfo = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.open_ai;

  const renderMyTicketItem = ({ item }: { item: MyTicket }) => {
    const statusInfo = getStatusInfo(item.status);
    return (
      <TouchableOpacity style={styles.ticketCard} onPress={() => openTicketDetail(item)}>
        <View style={styles.ticketHeader}>
          <View style={styles.ticketFolioRow}>
            <Text style={styles.ticketFolio}>{item.ticket_folio || `#${item.id}`}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
              <Ionicons name={statusInfo.icon as any} size={12} color={statusInfo.color} />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
          </View>
          <Text style={styles.ticketTime}>{timeAgo(item.updated_at)}</Text>
        </View>
        <View style={styles.clientRow}>
          <View style={[styles.clientAvatar, { backgroundColor: '#2196F320' }]}>
            <Ionicons name="person" size={16} color="#2196F3" />
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.subject || 'Sin asunto'}</Text>
            <Text style={styles.clientBox}>{formatDate(item.created_at)}</Text>
          </View>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {CATEGORY_LABELS[item.category] || item.category}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filters = [
    { key: 'all', label: 'Todos', count: stats?.total },
    { key: 'escalated_human', label: 'Escalados', count: stats?.escalated },
    { key: 'open_ai', label: 'IA', count: stats?.open_ai },
    { key: 'waiting_client', label: 'Esperando', count: stats?.waiting },
    { key: 'resolved', label: 'Resueltos', count: stats?.resolved },
  ];

  const renderTicketItem = ({ item }: { item: Ticket }) => {
    const statusInfo = getStatusInfo(item.status);
    return (
      <TouchableOpacity style={styles.ticketCard} onPress={() => openTicketDetail(item)}>
        <View style={styles.ticketHeader}>
          <View style={styles.ticketFolioRow}>
            <Text style={styles.ticketFolio}>{item.ticket_folio || `#${item.id}`}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
              <Ionicons name={statusInfo.icon as any} size={12} color={statusInfo.color} />
              <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
          </View>
          <Text style={styles.ticketTime}>{timeAgo(item.updated_at)}</Text>
        </View>

        <View style={styles.clientRow}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>
              {(item.client_name || 'NN').substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.client_name}</Text>
            <Text style={styles.clientBox}>{item.client_box_id || item.client_email}</Text>
          </View>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {CATEGORY_LABELS[item.category] || item.category}
            </Text>
          </View>
        </View>

        {item.subject && (
          <Text style={styles.ticketSubject} numberOfLines={1}>{item.subject}</Text>
        )}

        {item.last_message && (
          <View style={styles.lastMessageRow}>
            <Ionicons 
              name={item.last_sender === 'user' ? 'person' : item.last_sender === 'ai' ? 'sparkles' : 'headset'} 
              size={14} 
              color="#999" 
            />
            <Text style={styles.lastMessage} numberOfLines={2}>{item.last_message}</Text>
          </View>
        )}

        <View style={styles.ticketFooter}>
          <View style={styles.messageCountBadge}>
            <Ionicons name="chatbubbles-outline" size={14} color="#666" />
            <Text style={styles.messageCount}>{item.message_count} msgs</Text>
          </View>
          {item.resolved_at && (
            <Text style={styles.resolvedDate}>
              Resuelto: {formatDate(item.resolved_at)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderMessageBubble = (msg: TicketMessage) => {
    const isUser = msg.sender_type === 'user';
    const isAI = msg.sender_type === 'ai';
    const isAgent = msg.sender_type === 'agent';

    return (
      <View 
        key={msg.id} 
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.systemBubble,
        ]}
      >
        <View style={styles.messageHeader}>
          <Ionicons 
            name={isUser ? 'person' : isAI ? 'sparkles' : 'headset'} 
            size={14} 
            color={isUser ? '#fff' : '#666'} 
          />
          <Text style={[styles.senderLabel, isUser && { color: '#fff' }]}>
            {isUser ? 'Cliente' : isAI ? 'Orlando (IA)' : 'Agente'}
          </Text>
          <Text style={[styles.messageTime, isUser && { color: 'rgba(255,255,255,0.7)' }]}>
            {formatTime(msg.created_at)}
          </Text>
        </View>
        <Text style={[styles.messageText, isUser && { color: '#fff' }]}>
          {msg.message}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tickets de Clientes</Text>
          <View style={{ width: 40 }} />
        </View>
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tickets de Clientes</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* View Mode Toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'clients' && styles.toggleBtnActive]}
          onPress={() => { setViewMode('clients'); setFilter('all'); }}
        >
          <Ionicons name="people" size={14} color={viewMode === 'clients' ? '#fff' : '#666'} />
          <Text style={[styles.toggleBtnText, viewMode === 'clients' && styles.toggleBtnTextActive]}>
            Tickets de Clientes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'mine' && styles.toggleBtnActive]}
          onPress={() => setViewMode('mine')}
        >
          <Ionicons name="person-circle" size={14} color={viewMode === 'mine' ? '#fff' : '#666'} />
          <Text style={[styles.toggleBtnText, viewMode === 'mine' && styles.toggleBtnTextActive]}>
            Mis Tickets
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats Cards */}
      {viewMode === 'clients' && stats && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: '#F44336' }]}>
            <Text style={styles.statNumber}>{parseInt(String(stats.escalated)) || 0}</Text>
            <Text style={styles.statLabel}>Escalados</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#2196F3' }]}>
            <Text style={styles.statNumber}>{parseInt(String(stats.open_ai)) || 0}</Text>
            <Text style={styles.statLabel}>Abiertos</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#FF9800' }]}>
            <Text style={styles.statNumber}>{parseInt(String(stats.waiting)) || 0}</Text>
            <Text style={styles.statLabel}>Esperando</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#4CAF50' }]}>
            <Text style={styles.statNumber}>{parseInt(String(stats.resolved)) || 0}</Text>
            <Text style={styles.statLabel}>Resueltos</Text>
          </View>
        </View>
      )}

      {/* Filter Chips — solo en modo clientes */}
      {viewMode === 'clients' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {filters.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label} {f.count != null ? `(${f.count})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Tickets List */}
      {viewMode === 'clients' ? (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTicketItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="ticket-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>Sin Tickets</Text>
              <Text style={styles.emptySubtitle}>
                {filter === 'all'
                  ? 'Tus clientes aún no han generado tickets de soporte'
                  : `No hay tickets con estado "${filters.find(f => f.key === filter)?.label}"`
                }
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={myTickets}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMyTicketItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="ticket-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>Sin Tickets</Text>
              <Text style={styles.emptySubtitle}>Aún no has levantado ningún ticket</Text>
            </View>
          }
        />
      )}

      {/* FAB — Levantar Ticket */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AdvisorSupportTicket', { user, token })}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Ticket Detail Modal */}
      <Modal visible={showDetail} animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetail(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={BLACK} />
            </TouchableOpacity>
            <View style={styles.modalTitleContainer}>
              <Text style={styles.modalTitle}>{selectedTicket?.ticket_folio || `#${selectedTicket?.id}`}</Text>
              {selectedTicket && (
                <View style={[styles.statusBadge, { backgroundColor: getStatusInfo(selectedTicket.status).bg }]}>
                  <Ionicons 
                    name={getStatusInfo(selectedTicket.status).icon as any} 
                    size={12} 
                    color={getStatusInfo(selectedTicket.status).color} 
                  />
                  <Text style={[styles.statusText, { color: getStatusInfo(selectedTicket.status).color }]}>
                    {getStatusInfo(selectedTicket.status).label}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ width: 24 }} />
          </View>

          {selectedTicket && (
            <ScrollView style={styles.modalBody}>
              {/* Client Info */}
              <View style={styles.detailClientCard}>
                <View style={[styles.detailClientAvatar, viewMode === 'mine' && { backgroundColor: '#2196F320' }]}>
                  {viewMode === 'mine' ? (
                    <Ionicons name="person" size={22} color="#2196F3" />
                  ) : (
                    <Text style={styles.detailClientAvatarText}>
                      {((selectedTicket as Ticket).client_name || 'NN').substring(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailClientName}>
                    {viewMode === 'mine' ? 'Mi Ticket' : (selectedTicket as Ticket).client_name}
                  </Text>
                  <Text style={styles.detailClientEmail}>
                    {viewMode === 'mine'
                      ? selectedTicket.ticket_folio
                      : ((selectedTicket as Ticket).client_box_id || (selectedTicket as Ticket).client_email)
                    }
                  </Text>
                </View>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>
                    {CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}
                  </Text>
                </View>
              </View>

              {/* Ticket Info */}
              <View style={styles.detailInfoRow}>
                <View style={styles.detailInfoItem}>
                  <Text style={styles.detailInfoLabel}>Creado</Text>
                  <Text style={styles.detailInfoValue}>{formatDate(selectedTicket.created_at)}</Text>
                </View>
                <View style={styles.detailInfoItem}>
                  <Text style={styles.detailInfoLabel}>Última Act.</Text>
                  <Text style={styles.detailInfoValue}>{timeAgo(selectedTicket.updated_at)}</Text>
                </View>
                {selectedTicket.resolved_at && (
                  <View style={styles.detailInfoItem}>
                    <Text style={styles.detailInfoLabel}>Resuelto</Text>
                    <Text style={[styles.detailInfoValue, { color: '#4CAF50' }]}>
                      {formatDate(selectedTicket.resolved_at)}
                    </Text>
                  </View>
                )}
              </View>

              {selectedTicket.subject && (
                <View style={styles.subjectBox}>
                  <Text style={styles.subjectLabel}>Asunto</Text>
                  <Text style={styles.subjectText}>{selectedTicket.subject}</Text>
                </View>
              )}

              {/* Messages */}
              <Text style={styles.messagesTitle}>
                💬 Conversación ({ticketMessages.length} mensajes)
              </Text>

              {detailLoading ? (
                <ActivityIndicator size="small" color={ORANGE} style={{ marginVertical: 20 }} />
              ) : (
                ticketMessages.map(msg => renderMessageBubble(msg))
              )}

              <View style={{ height: 80 }} />
            </ScrollView>
          )}

          {/* Reply bar */}
          {selectedTicket && (
            <View style={[styles.replyBar, { paddingBottom: insets.bottom + 8 }]}>
              <TextInput
                style={styles.replyInput}
                placeholder="Escribe una respuesta..."
                placeholderTextColor="#aaa"
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[styles.replySendBtn, (!replyText.trim() || replySending) && { opacity: 0.4 }]}
                onPress={sendAdvisorReply}
                disabled={!replyText.trim() || replySending}
              >
                {replySending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORANGE,
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  headerBack: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#E8E8E8',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: ORANGE,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  toggleBtnTextActive: {
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: BLACK,
  },
  statLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  filterScroll: {
    maxHeight: 50,
    marginTop: 12,
  },
  filterContainer: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  filterChipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
    paddingBottom: 100,
  },
  ticketCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ticketFolioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketFolio: {
    fontSize: 13,
    fontWeight: '700',
    color: ORANGE,
  },
  ticketTime: {
    fontSize: 11,
    color: '#999',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  clientAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ORANGE + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  clientAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: ORANGE,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  clientBox: {
    fontSize: 11,
    color: '#999',
  },
  categoryBadge: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  ticketSubject: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  lastMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  lastMessage: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  messageCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  messageCount: {
    fontSize: 11,
    color: '#666',
  },
  resolvedDate: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalClose: {
    padding: 4,
  },
  modalTitleContainer: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BLACK,
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  detailClientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  detailClientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ORANGE + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailClientAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: ORANGE,
  },
  detailClientName: {
    fontSize: 16,
    fontWeight: '700',
    color: BLACK,
  },
  detailClientEmail: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  detailInfoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  detailInfoItem: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  detailInfoLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
  detailInfoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: BLACK,
  },
  subjectBox: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  subjectLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  subjectText: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
  },
  messagesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BLACK,
    marginBottom: 12,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: '90%',
  },
  userBubble: {
    backgroundColor: ORANGE,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  systemBubble: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    flex: 1,
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
  },
  messageText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 20,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
    maxHeight: 100,
  },
  replySendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F05A28',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
