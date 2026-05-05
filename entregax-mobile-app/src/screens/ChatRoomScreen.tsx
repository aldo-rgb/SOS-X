/**
 * ChatRoomScreen - Sala de conversación 1-1 o grupal.
 *
 * - FlatList invertida con paginación al hacer scroll arriba.
 * - Input con adjuntos (imagen, documento) usando expo-image-picker / expo-document-picker.
 * - Suscripción Socket.IO para mensajes en tiempo real y "typing".
 * - markRead al enfocar la pantalla y al recibir nuevos mensajes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  fetchMessages,
  sendMessage,
  markRead,
  connectChatSocket,
  onSocketEvent,
  emitTyping,
  ChatMessage,
} from '../services/chatService';

const ORANGE = '#F05A28';
const BLACK = '#111111';

export default function ChatRoomScreen({ route, navigation }: any) {
  const { user, token, conversationId, title, type, otherUser } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimers = useRef<Record<string, any>>({});
  const myId = user.id || user.userId;

  const load = useCallback(async () => {
    try {
      const list = await fetchMessages(token, conversationId);
      setMessages(list);
      setHasMore(list.length >= 50);
      // Marcar como leído el último
      if (list.length > 0) {
        markRead(token, conversationId, list[0].id).catch(() => {});
      } else {
        markRead(token, conversationId).catch(() => {});
      }
    } catch (e: any) {
      console.warn('[ChatRoom] load error', e?.message);
    } finally {
      setLoading(false);
    }
  }, [token, conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[messages.length - 1].id;
      const more = await fetchMessages(token, conversationId, oldest);
      if (more.length === 0) {
        setHasMore(false);
      } else {
        setMessages((prev) => [...prev, ...more]);
        setHasMore(more.length >= 50);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [token, conversationId, messages, loadingMore, hasMore]);

  // Socket subscription
  useEffect(() => {
    const socket = connectChatSocket(token);
    if (!socket) return;

    const offNew = onSocketEvent('message:new', (msg: ChatMessage) => {
      if (msg.conversation_id !== conversationId) return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
      // Auto marcar como leído si estamos en la sala
      markRead(token, conversationId, msg.id).catch(() => {});
    });

    const offTyping = onSocketEvent('typing', (data: any) => {
      if (data.conversation_id !== conversationId) return;
      if (data.user_id === myId) return;
      const name = data.user_name || 'Alguien';
      if (data.is_typing) {
        setTypingUsers((prev) => (prev.includes(name) ? prev : [...prev, name]));
        clearTimeout(typingTimers.current[name]);
        typingTimers.current[name] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((n) => n !== name));
        }, 3000);
      } else {
        setTypingUsers((prev) => prev.filter((n) => n !== name));
      }
    });

    return () => {
      offNew();
      offTyping();
      Object.values(typingTimers.current).forEach((t) => clearTimeout(t));
    };
  }, [token, conversationId, myId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const msg = await sendMessage(token, conversationId, { body });
      // El socket entregará el mensaje. Por si llega tarde, agregamos optimistamente:
      setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo enviar el mensaje');
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Concede acceso a la galería para enviar imágenes.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setSending(true);
    try {
      const msg = await sendMessage(token, conversationId, {
        files: [{
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        }],
      });
      setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo enviar la imagen');
    } finally {
      setSending(false);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    setSending(true);
    try {
      const msg = await sendMessage(token, conversationId, {
        files: [{ uri: a.uri, name: a.name, type: a.mimeType || 'application/octet-stream' }],
      });
      setMessages((prev) => (prev.find((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo enviar el archivo');
    } finally {
      setSending(false);
    }
  };

  // Typing emitter (debounced)
  const typingDebounce = useRef<any>(null);
  const onTextChange = (val: string) => {
    setText(val);
    emitTyping(conversationId, true);
    if (typingDebounce.current) clearTimeout(typingDebounce.current);
    typingDebounce.current = setTimeout(() => emitTyping(conversationId, false), 2000);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const mine = item.sender_id === myId;
    const ts = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isImage = item.attachments?.some((a) => (a.mime_type || '').startsWith('image/'));
    const isFile = item.attachments && item.attachments.length > 0 && !isImage;

    return (
      <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}>
        {!mine && type === 'group' && (
          <Text style={styles.senderName}>{item.sender_name || 'Usuario'}</Text>
        )}
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {item.attachments?.map((att) => {
            if ((att.mime_type || '').startsWith('image/')) {
              return (
                <Image
                  key={att.id}
                  source={{ uri: att.url }}
                  style={styles.imageAtt}
                  resizeMode="cover"
                />
              );
            }
            return (
              <View key={att.id} style={styles.fileRow}>
                <Ionicons name="document-attach" size={20} color={mine ? '#fff' : '#333'} />
                <Text style={[styles.fileName, { color: mine ? '#fff' : '#333' }]} numberOfLines={1}>
                  {att.file_name || 'Archivo'}
                </Text>
              </View>
            );
          })}
          {item.body ? (
            <Text style={[styles.bubbleText, { color: mine ? '#fff' : '#111' }]}>
              {item.body}
            </Text>
          ) : null}
          <Text style={[styles.bubbleTs, { color: mine ? 'rgba(255,255,255,0.7)' : '#999' }]}>{ts}</Text>
        </View>
      </View>
    );
  };

  const headerTitle = title || (otherUser?.full_name) || 'Chat';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction color="#fff" onPress={() => navigation.goBack()} />
        <Appbar.Content
          title={headerTitle}
          subtitle={typingUsers.length > 0 ? `${typingUsers.join(', ')} escribiendo…` : undefined}
          titleStyle={{ color: '#fff', fontWeight: '700', fontSize: 16 }}
          subtitleStyle={{ color: '#FFD7C7', fontSize: 11 }}
        />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={ORANGE} />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={{ padding: 12 }}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={ORANGE} style={{ margin: 8 }} /> : null}
          />
        )}

        <View style={styles.inputBar}>
          <TouchableOpacity onPress={pickImage} style={styles.iconBtn} disabled={sending}>
            <Ionicons name="image-outline" size={24} color={ORANGE} />
          </TouchableOpacity>
          <TouchableOpacity onPress={pickDocument} style={styles.iconBtn} disabled={sending}>
            <Ionicons name="attach" size={24} color={ORANGE} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Escribe un mensaje…"
            placeholderTextColor="#999"
            value={text}
            onChangeText={onTextChange}
            multiline
            maxLength={4000}
            editable={!sending}
          />
          <TouchableOpacity
            onPress={handleSend}
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            disabled={!text.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  appbar: { backgroundColor: BLACK },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  msgRow: { marginBottom: 8, maxWidth: '80%' },
  msgRowMine: { alignSelf: 'flex-end' },
  msgRowTheirs: { alignSelf: 'flex-start' },
  senderName: { fontSize: 11, color: '#666', marginLeft: 8, marginBottom: 2, fontWeight: '600' },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMine: { backgroundColor: ORANGE, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15 },
  bubbleTs: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  imageAtt: { width: 220, height: 220, borderRadius: 8, marginBottom: 4 },
  fileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  fileName: { fontSize: 13, marginLeft: 8, flex: 1, fontWeight: '500' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  iconBtn: { padding: 8 },
  input: {
    flex: 1,
    backgroundColor: '#F4F5F7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111',
    maxHeight: 120,
    minHeight: 40,
  },
  sendBtn: {
    backgroundColor: ORANGE,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: '#ccc' },
});
