import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../services/api';

const ARCHIVED_KEY = 'advisor_archived_notif_ids';

const ORANGE = '#F05A28';
const BLACK = '#111';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  icon: string;
  is_read: boolean;
  source: string;
  action_url?: string;
  data?: any;
  created_at: string;
}

const SOURCE_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending_verification', label: '⚠️ Verificación' },
  { key: 'client_package', label: '📦 Paquetes' },
  { key: 'client_payment', label: '💰 Pagos' },
  { key: 'new_client', label: '🎉 Clientes' },
  { key: 'client_ticket', label: '🎫 Tickets' },
  { key: 'own', label: '🔔 Sistema' },
];

const STATUS_LABELS: Record<string, string> = {
  received_mty: 'Recibido MTY',
  received: 'Recibido en bodega',
  in_transit: 'En tránsito',
  processing: 'En proceso',
  delivered: 'Entregado',
  ready_pickup: 'Listo para recoger',
  customs: 'En aduana',
  out_for_delivery: 'En camino',
};

const humanizeMessage = (msg: string) =>
  msg.replace(/\(([a-z_]+)\)/g, (_, code) =>
    STATUS_LABELS[code] ? `(${STATUS_LABELS[code]})` : `(${code})`
  );

const TYPE_COLORS: Record<string, string> = {
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
  info: '#2196F3',
  promo: '#FF9800',
};

// Map Material Design icon names to Ionicons equivalents
const getIconName = (icon: string): string => {
  const map: Record<string, string> = {
    'package-variant': 'cube-outline',
    'truck-delivery': 'car-outline',
    'check-all': 'checkmark-done',
    'cash-check': 'cash-outline',
    'account-plus': 'person-add-outline',
    'alert-circle': 'alert-circle-outline',
    'headset': 'headset-outline',
    'check-circle': 'checkmark-circle',
    'bell': 'notifications-outline',
    'tag': 'pricetag-outline',
    'shield-check': 'shield-checkmark-outline',
    'account-tie': 'person-outline',
    'package-variant-closed': 'cube',
  };
  return map[icon] || 'notifications-outline';
};

export default function AdvisorNotificationsScreen({ navigation, route }: any) {
  const { user, token } = route.params;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [stats, setStats] = useState({ ownUnread: 0, clientActivity: 0 });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<number>>(new Set());

  // Load persisted archived IDs on mount
  useEffect(() => {
    AsyncStorage.getItem(ARCHIVED_KEY)
      .then(val => { if (val) setArchivedIds(new Set(JSON.parse(val) as number[])); })
      .catch(() => {});
  }, []);

  // Persist archived IDs whenever they change
  useEffect(() => {
    if (archivedIds.size === 0) return;
    AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify([...archivedIds])).catch(() => {});
  }, [archivedIds]);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/advisor/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setStats({
          ownUnread: data.ownUnread || 0,
          clientActivity: data.clientActivity || 0,
        });
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const archiveOne = async (id: number) => {
    setArchivedIds(prev => new Set([...prev, id]));
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    try {
      await fetch(`${API_URL}/api/notifications/${id}/archive`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  };

  const archiveSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setArchivedIds(prev => new Set([...prev, ...ids]));
    setSelectedIds(new Set());
    setSelectionMode(false);
    const ownIds = ids.filter(id => notifications.find(n => n.id === id)?.source === 'own');
    try {
      if (ownIds.length > 0) {
        await fetch(`${API_URL}/api/notifications/archive-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: ownIds }),
        });
      }
    } catch {}
  };

  const archiveAllOwn = () => {
    Alert.alert(
      '¿Archivar todas?',
      'Se ocultarán todas las notificaciones visibles.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Archivar',
          style: 'destructive',
          onPress: async () => {
            const allIds = filteredNotifications.map(n => n.id);
            setArchivedIds(prev => new Set([...prev, ...allIds]));
            setStats(prev => ({ ...prev, ownUnread: 0 }));
            setSelectedIds(new Set());
            setSelectionMode(false);
            try {
              await fetch(`${API_URL}/api/notifications/archive-all`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` },
              });
            } catch {}
          },
        },
      ]
    );
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleSelectAllOwn = () => {
    const visibleIds = filteredNotifications.map(n => n.id);
    if (selectedIds.size === visibleIds.length && visibleIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const formatTime = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  };

  const filteredNotifications = (() => {
    const base = activeTab === 'all'
      ? notifications
      : activeTab === 'pending_verification'
        ? notifications.filter(n => n.source === 'pending_verification' || n.source === 'own_verification')
        : notifications.filter(n => n.source === activeTab);
    return base.filter(n => !archivedIds.has(n.id));
  })();

  const handleNotificationPress = (notif: Notification) => {
    if (selectionMode) {
      toggleSelect(notif.id);
      return;
    }
    // Mark as read if it's an own notification
    if (notif.source === 'own' && !notif.is_read) {
      markAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id && n.source === 'own' ? { ...n, is_read: true } : n));
    }

    // Navigate based on source
    const data = typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data;
    if (notif.source === 'own_verification') {
      navigation.navigate('MyProfile', { user, token });
      return;
    } else if (notif.source === 'new_client' || notif.source === 'client_package' || notif.source === 'client_payment' || notif.source === 'pending_verification') {
      navigation.navigate('AdvisorClients', { user, token });
      return;
    } else if (notif.source === 'client_ticket') {
      navigation.navigate('AdvisorClientTickets', { user, token });
      return;
    }

    // Notificaciones propias (source === 'own'): usar action_url
    if (notif.action_url) {
      const m = notif.action_url.match(/\/(packages?|paquetes?)\/([\w-]+)/i);
      if (m) {
        navigation.navigate('PackageDetail', { user, token, packageId: m[2] });
        return;
      }
      if (/maritime|china-sea/i.test(notif.action_url)) {
        navigation.navigate('ChinaSeaHub', { user, token });
        return;
      }
      if (/china-air/i.test(notif.action_url)) {
        navigation.navigate('ChinaAirHub', { user, token });
        return;
      }
      if (/pobox/i.test(notif.action_url)) {
        navigation.navigate('POBoxHub', { user, token });
        return;
      }
    }
  };

  const handleLongPress = (notif: Notification) => {
    setSelectionMode(true);
    toggleSelect(notif.id);
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const color = TYPE_COLORS[item.type] || '#666';
    const isUnread = (!item.is_read && item.source === 'own') || item.source === 'pending_verification' || item.source === 'own_verification';
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.notifCard, isUnread && styles.notifCardUnread, isSelected && { borderWidth: 2, borderColor: ORANGE }]}
        onPress={() => handleNotificationPress(item)}
        onLongPress={() => handleLongPress(item)}
      >
        <View style={[styles.notifIcon, { backgroundColor: color + '15' }]}>
          <Ionicons name={getIconName(item.icon) as any} size={22} color={color} />
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifHeader}>
            <Text style={[styles.notifTitle, isUnread && styles.notifTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={styles.notifMessage} numberOfLines={2}>{humanizeMessage(item.message)}</Text>
          {item.source !== 'own' && (
            <View style={[styles.sourceBadge, { backgroundColor: color + '15' }]}>
              <Text style={[styles.sourceBadgeText, { color }]}>
                {item.source === 'client_package' ? 'Paquete' 
                  : item.source === 'client_payment' ? 'Pago'
                  : item.source === 'new_client' ? 'Nuevo Cliente'
                  : item.source === 'client_ticket' ? 'Ticket'
                  : item.source === 'pending_verification' ? 'Verificación Pendiente'
                  : item.source === 'own_verification' ? '🔴 Tu Verificación'
                  : 'Sistema'}
              </Text>
            </View>
          )}
        </View>
        {isUnread && !selectionMode && <View style={styles.unreadDot} />}
        {!selectionMode && (
          <TouchableOpacity
            onPress={() => archiveOne(item.id)}
            style={{ padding: 6, marginLeft: 4 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="archive-outline" size={20} color="#ccc" />
          </TouchableOpacity>
        )}
        {selectionMode && (
          <Ionicons
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={isSelected ? ORANGE : '#ccc'}
            style={{ marginLeft: 4 }}
          />
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Summary Bar */}
      {selectionMode ? (
        <View style={styles.summaryBar}>
          <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={[styles.summaryText, { fontSize: 14 }]}>{selectedIds.size} seleccionada(s)</Text>
          <TouchableOpacity onPress={toggleSelectAllOwn} style={{ marginLeft: 'auto', paddingHorizontal: 8 }}>
            <Ionicons name="checkmark-done" size={20} color={ORANGE} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={archiveSelected}
            disabled={selectedIds.size === 0}
            style={[styles.markAllButton, { backgroundColor: selectedIds.size > 0 ? ORANGE : '#ccc' }]}
          >
            <Text style={[styles.markAllText, { color: '#fff' }]}>Archivar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Ionicons name="notifications" size={18} color={ORANGE} />
            <Text style={styles.summaryText}>{stats.ownUnread} sin leer</Text>
          </View>
          <View style={styles.summaryItem}>
            <Ionicons name="pulse" size={18} color="#4CAF50" />
            <Text style={styles.summaryText}>{stats.clientActivity} movimientos</Text>
          </View>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 6 }}>
            {stats.ownUnread > 0 && (
              <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
                <Text style={styles.markAllText}>Leídas</Text>
              </TouchableOpacity>
            )}
            {notifications.length > 0 && (
              <TouchableOpacity onPress={archiveAllOwn} style={[styles.markAllButton, { backgroundColor: '#11111115' }]}>
                <Text style={[styles.markAllText, { color: '#333' }]}>Archivar todas</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {SOURCE_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Notifications List */}
      <FlatList
        style={styles.notifList}
        data={filteredNotifications}
        keyExtractor={(item, index) => `${item.source}-${item.id}-${index}`}
        renderItem={renderNotification}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Sin Notificaciones</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'all'
                ? 'No hay actividad reciente de tus clientes'
                : 'No hay movimientos en esta categoría'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    gap: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  markAllButton: {
    marginLeft: 'auto',
    backgroundColor: ORANGE + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  markAllText: {
    fontSize: 12,
    color: ORANGE,
    fontWeight: '700',
  },
  tabsContainer: {
    height: 52,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: ORANGE,
  },
  tabText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  notifList: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    paddingBottom: 40,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  notifCardUnread: {
    backgroundColor: '#FFF8F4',
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notifContent: {
    flex: 1,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  notifTitleUnread: {
    fontWeight: '800',
    color: BLACK,
  },
  notifTime: {
    fontSize: 11,
    color: '#999',
  },
  notifMessage: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 6,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ORANGE,
    marginLeft: 8,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
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
});
