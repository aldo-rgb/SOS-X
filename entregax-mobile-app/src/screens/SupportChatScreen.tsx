/**
 * SupportChatScreen.tsx
 * Chat de Soporte con Cajito, el asistente de EntregaX.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  Image,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  TextInput,
  IconButton,
  Avatar,
  Appbar,
} from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';
import { getCurrentLanguage } from '../i18n';

// Colores de marca
const BRAND_ORANGE = '#F05A28';
const BRAND_DARK = '#111111';
const CAJITO_RING = '#FF6F00';
const CHAT_BG = '#ECE5DD';

// Avatar de Cajito (fallback local; el configurado se sirve en /api/system/payment-status)
const CAJITO_AVATAR = require('../../assets/cajito-asomando.png');

type RootStackParamList = {
  SupportChat: { user: any; token: string; ticketId?: number };
  Home: { user: any; token: string };
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SupportChat'>;
  route: RouteProp<RootStackParamList, 'SupportChat'>;
};

interface Message {
  id: number | string;
  type: 'user' | 'agent';
  text: string;
  time: string;
  image?: string;
}

// Sugerencias iniciales por idioma
const QUICK_REPLIES: Record<string, string[]> = {
  es: ['¿Dónde está mi paquete?', 'Cotizar un envío', 'Necesito factura', 'Reportar un problema'],
  en: ['Where is my package?', 'Get a quote', 'I need an invoice', 'Report a problem'],
  zh: ['我的包裹在哪里？', '获取报价', '我需要发票', '报告问题'],
};

export default function SupportChatScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, token, ticketId: initialTicketId } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(initialTicketId || null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const currentLang = getCurrentLanguage();

  const avatarSource = avatarUri ? { uri: avatarUri } : CAJITO_AVATAR;
  const agentName = t('support.agentName');

  const nowStr = () =>
    new Date().toLocaleTimeString(currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'es-MX', { hour: '2-digit', minute: '2-digit' });

  // Avatar configurado de Cajito
  useEffect(() => {
    fetch(`${API_URL}/api/system/payment-status`)
      .then(r => r.json())
      .then(d => {
        const u = d?.cajito_avatar_url;
        if (typeof u === 'string' && u) {
          setAvatarUri(u.startsWith('http') ? u : `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`);
        }
      })
      .catch(() => {});
  }, []);

  // Manejar teclado en Android
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Mensaje inicial — SOLO al montar. Si el chat se abre desde un ticket
  // existente, carga su historial; si es nuevo, muestra el saludo. No depende de
  // `ticketId` para evitar recargar (y duplicar la respuesta) cuando sendMessage
  // crea el ticket a mitad de la conversación.
  useEffect(() => {
    if (initialTicketId) {
      loadMessages();
    } else {
      const now = nowStr();
      const userName = user.full_name?.split(' ')[0] || user.name?.split(' ')[0] || '';
      setMessages([
        { id: 1, type: 'agent', text: t('support.greeting', { name: userName, agent: agentName }), time: now },
        { id: 2, type: 'agent', text: t('support.howCanIHelp'), time: now },
      ]);
      createLeadOnEntry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMessages = async () => {
    if (!ticketId) return;
    try {
      const res = await fetch(`${API_URL}/api/support/ticket/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const formatted = data.map((m: any) => ({
        id: m.id,
        type: m.sender_type === 'client' ? 'user' : 'agent',
        text: m.message,
        time: new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      }));
      setMessages(formatted);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    }
  };

  // Enviar mensaje (texto y/o imagen)
  const sendMessage = async (text: string, imageUri?: string) => {
    const userMessage = text.trim();
    if (!userMessage && !imageUri) return;
    if (sending) return;
    setSending(true);

    const now = nowStr();
    const userMsg: Message = { id: Date.now(), type: 'user', text: userMessage, time: now, image: imageUri };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      let res: Response;
      if (imageUri) {
        const form = new FormData();
        form.append('userId', String(user.id));
        form.append('message', userMessage || '📷');
        if (ticketId) form.append('ticketId', String(ticketId));
        form.append('category', 'other');
        form.append('language', currentLang);
        const name = imageUri.split('/').pop() || `foto-${Date.now()}.jpg`;
        const ext = (name.split('.').pop() || 'jpg').toLowerCase();
        form.append('images', { uri: imageUri, name, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` } as any);
        res = await fetch(`${API_URL}/api/support/message`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      } else {
        res = await fetch(`${API_URL}/api/support/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userId: user.id, message: userMessage, ticketId, category: 'other', language: currentLang }),
        });
      }

      const data = await res.json();
      if (data.ticketId) setTicketId(data.ticketId);

      const delay = 1200 + Math.random() * 900;
      await new Promise(resolve => setTimeout(resolve, delay));

      if (data.response) {
        setMessages(prev => [...prev, { id: Date.now() + 1, type: 'agent', text: data.response, time: nowStr() }]);
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      setMessages(prev => [...prev, { id: Date.now() + 1, type: 'agent', text: t('support.connectionError'), time: nowStr() }]);
    } finally {
      setIsTyping(false);
      setSending(false);
    }
  };

  const handleSend = () => sendMessage(inputText);

  const handleAttachPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos para adjuntar una imagen.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        sendMessage(inputText, result.assets[0].uri);
      }
    } catch (e) {
      console.log('Error adjuntando foto:', e);
    }
  };

  // Crear lead al entrar
  const createLeadOnEntry = async () => {
    try {
      await fetch(`${API_URL}/api/crm/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: user?.id, source: 'support_chat', notes: 'Usuario entró al Centro de Ayuda desde la app' }),
      });
    } catch (e) { /* silencioso */ }
  };

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, isTyping]);

  const handleCall = async () => {
    try {
      await fetch(`${API_URL}/api/crm/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: user?.id, source: 'support_chat', notes: 'Usuario solicitó contacto desde chat de soporte' }),
      });
    } catch (e) { /* silencioso */ }
    Alert.alert('Solicitud Recibida', 'Un asesor se pondrá en contacto contigo en las próximas 24 a 48 horas.', [{ text: 'Entendido', style: 'default' }]);
  };

  // Mostrar sugerencias solo mientras el cliente no haya escrito nada
  const showQuickReplies = !messages.some(m => m.type === 'user') && !isTyping;
  const quickReplies = QUICK_REPLIES[currentLang] || QUICK_REPLIES.es;

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.type === 'user';
    return (
      <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
        {!isUser && (
          <Avatar.Image size={34} source={avatarSource} style={styles.avatar} />
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAgent]}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.msgImage} resizeMode="cover" />
          ) : null}
          {!!item.text && (
            <Text style={[styles.messageText, isUser && styles.messageTextUser]}>{item.text}</Text>
          )}
          <Text style={[styles.timeText, isUser && styles.timeTextUser]}>{item.time}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header con Cajito */}
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <View style={styles.headerAvatarRing}>
          <Avatar.Image size={38} source={avatarSource} />
        </View>
        <Appbar.Content
          title={`${agentName} · EntregaX`}
          titleStyle={styles.headerTitle}
          subtitle={isTyping ? t('support.typing') : 'En línea'}
          subtitleStyle={[styles.headerSubtitle, isTyping && styles.typingSubtitle]}
        />
        <Appbar.Action icon="phone" color="white" onPress={handleCall} />
      </Appbar.Header>

      {/* Chat */}
      <View style={styles.chatArea}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={[
            styles.messagesList,
            Platform.OS === 'android' && { paddingBottom: keyboardHeight > 0 ? 10 : 20 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingContainer}>
                <Avatar.Image size={28} source={avatarSource} style={{ marginRight: 8 }} />
                <Text style={styles.typingText}>{agentName} {t('support.typing')}</Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* Quick replies */}
      {showQuickReplies && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRow}
          contentContainerStyle={styles.quickRowContent}
          keyboardShouldPersistTaps="handled"
        >
          {quickReplies.map((q, i) => (
            <TouchableOpacity key={i} style={styles.quickChip} onPress={() => sendMessage(q)}>
              <Text style={styles.quickChipText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <View style={[
          styles.inputContainer,
          Platform.OS === 'android' && keyboardHeight > 0 && { marginBottom: keyboardHeight },
        ]}>
          <IconButton
            icon="image-outline"
            iconColor={BRAND_ORANGE}
            size={24}
            onPress={handleAttachPhoto}
            disabled={sending}
            style={styles.attachButton}
          />
          <TextInput
            mode="flat"
            placeholder={t('support.typeMessage')}
            value={inputText}
            onChangeText={setInputText}
            style={styles.textInput}
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            selectionColor={BRAND_ORANGE}
            multiline
            maxLength={500}
          />
          <IconButton
            icon="send"
            mode="contained"
            containerColor={BRAND_ORANGE}
            iconColor="white"
            size={22}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            style={styles.sendButton}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { backgroundColor: BRAND_DARK, elevation: 0 },
  headerAvatarRing: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: CAJITO_RING,
    alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden',
  },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  headerSubtitle: { color: '#4ADE80', fontSize: 12 },
  typingSubtitle: { color: BRAND_ORANGE, fontWeight: 'bold' },
  chatArea: { flex: 1, backgroundColor: CHAT_BG },
  messagesList: { padding: 16, paddingBottom: 20 },
  row: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: { marginRight: 8 },
  bubble: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, maxWidth: '75%',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 1.5, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  bubbleAgent: { backgroundColor: 'white', borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: BRAND_ORANGE, borderBottomRightRadius: 4 },
  msgImage: { width: 180, height: 180, borderRadius: 12, marginBottom: 6 },
  messageText: { fontSize: 15, lineHeight: 22, color: '#111' },
  messageTextUser: { color: 'white' },
  timeText: { fontSize: 10, color: '#999', marginTop: 4, textAlign: 'right' },
  timeTextUser: { color: 'rgba(255,255,255,0.75)' },
  typingContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginTop: 8 },
  typingText: { color: '#666', fontStyle: 'italic', fontSize: 13 },
  quickRow: { maxHeight: 52, backgroundColor: 'white' },
  quickRowContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  quickChip: {
    backgroundColor: '#FFF3EC', borderWidth: 1, borderColor: BRAND_ORANGE, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  quickChipText: { color: BRAND_ORANGE, fontSize: 13, fontWeight: '600' },
  inputContainer: {
    flexDirection: 'row', padding: 8, backgroundColor: 'white', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  attachButton: { margin: 0 },
  textInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 25, maxHeight: 100, paddingHorizontal: 16, fontSize: 15 },
  sendButton: { marginLeft: 4 },
});
