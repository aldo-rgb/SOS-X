/**
 * ChatListScreen - Lista de conversaciones del chat interno.
 *
 * Muestra todas las conversaciones del usuario (1-1 y grupos),
 * con badge de no leídos, último mensaje, y botón "Nuevo chat".
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, FAB } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchConversations,
  ChatConversation,
  connectChatSocket,
  onSocketEvent,
} from '../services/chatService';

const ORANGE = '#F05A28';
const BLACK = '#111111';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  director: 'Director',
  branch_manager: 'Gerente',
  customer_service: 'Servicio Cliente',
  operaciones: 'Operaciones',
  counter_staff: 'Mostrador',
  warehouse_ops: 'Bodega',
  repartidor: 'Repartidor',
  monitoreo: 'Monitoreo',
  accountant: 'Contador',
  advisor: 'Asesor',
  asesor: 'Asesor',
  asesor_lider: 'Asesor Líder',
  sub_advisor: 'Sub Asesor',
};

export default function ChatListScreen({ route, navigation }: any) {
  const { user, token } = route.params;
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchConversations(token);
      setConversations(list);
    } catch (e: any) {
      console.warn('[ChatList] error', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Conectar socket y refrescar al recibir mensajes
  useEffect(() => {
    const socket = connectChatSocket(token);
    if (!socket) return;
    const off1 = onSocketEvent('message:new', () => load());
    const off2 = onSocketEvent('message:read', () => load());
    return () => {
      off1();
      off2();
    };
  }, [token, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const renderItem = ({ item }: { item: ChatConversation }) => {
    const isDirect = item.type === 'direct';
    const title = isDirect
      ? item.other_user?.full_name || 'Usuario'
      : item.title || 'Grupo';
    const subtitleRole = isDirect && item.other_user?.role
      ? ROLE_LABELS[item.other_user.role] || item.other_user.role
      : null;
    const photoUrl = isDirect ? item.other_user?.profile_photo_url : item.avatar_url;
    const initial = (title || '?').charAt(0).toUpperCase();
    const preview = item.last_message_preview || (isDirect ? 'Inicia conversación' : 'Grupo creado');
    const ts = item.last_message_at
      ? new Date(item.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          navigation.navigate('ChatRoom', {
            user,
            token,
            conversationId: item.id,
            title,
            type: item.type,
            otherUser: item.other_user,
          })
        }
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: isDirect ? ORANGE : '#0097A7' }]}>
            {isDirect ? (
              <Text style={styles.avatarText}>{initial}</Text>
            ) : (
              <Ionicons name="people" size={22} color="#fff" />
            )}
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {ts ? <Text style={styles.ts}>{ts}</Text> : null}
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.preview} numberOfLines={1}>
              {subtitleRole ? `${subtitleRole} · ` : ''}{preview}
            </Text>
            {item.unread_count > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content title="Mensajes" titleStyle={{ color: '#fff', fontWeight: '700' }} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ORANGE} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No tienes conversaciones</Text>
          <Text style={styles.emptySub}>
            Toca el botón naranja para iniciar un chat con un compañero.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ORANGE]} />}
        />
      )}

      <FAB
        icon="message-plus"
        style={styles.fab}
        color="#fff"
        onPress={() => navigation.navigate('NewChat', { user, token })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  appbar: { backgroundColor: BLACK },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', padding: 14, alignItems: 'center', backgroundColor: '#fff' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  body: { flex: 1, marginLeft: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '600', color: '#111', flex: 1, marginRight: 8 },
  ts: { fontSize: 11, color: '#999' },
  preview: { fontSize: 13, color: '#666', flex: 1, marginRight: 8, marginTop: 2 },
  badge: {
    backgroundColor: ORANGE,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 74 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: ORANGE },
});
