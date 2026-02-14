/**
 * SupportChatScreen.tsx
 * Chat de Soporte tipo WhatsApp - Experiencia humana
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  Keyboard,
} from 'react-native';
import {
  Text,
  TextInput,
  IconButton,
  Avatar,
  Surface,
  Appbar,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';
import { getCurrentLanguage } from '../i18n';

// Colores de marca
const BRAND_ORANGE = '#F05A28';
const BRAND_DARK = '#111111';
const CHAT_BG = '#ECE5DD'; // Fondo tipo WhatsApp

// Avatar del agente (foto realista de stock)
const AGENT_AVATAR = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face';
const AGENT_NAME = 'Javier';

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
}

export default function SupportChatScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, token, ticketId: initialTicketId } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(initialTicketId || null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const currentLang = getCurrentLanguage();

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
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Mensaje inicial humano (corto y directo)
  useEffect(() => {
    if (!ticketId) {
      const now = new Date().toLocaleTimeString(currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'es-MX', { hour: '2-digit', minute: '2-digit' });
      const userName = user.full_name?.split(' ')[0] || user.name?.split(' ')[0] || '';
      setMessages([
        { id: 1, type: 'agent', text: t('support.greeting', { name: userName, agent: t('support.agentName') }), time: now },
        { id: 2, type: 'agent', text: t('support.howCanIHelp'), time: now },
      ]);

      // Crear lead automáticamente al entrar al chat de soporte
      createLeadOnEntry();
    } else {
      loadMessages();
    }
  }, [ticketId]);

  const loadMessages = async () => {
    if (!ticketId) return;
    try {
      const res = await fetch(`${API_URL}/support/ticket/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      // Convertir al nuevo formato
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

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userMessage = inputText.trim();
    const now = new Date().toLocaleTimeString(currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'es-MX', { hour: '2-digit', minute: '2-digit' });

    // 1. Agregar mensaje del usuario inmediatamente
    const userMsg: Message = { id: Date.now(), type: 'user', text: userMessage, time: now };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');

    // 2. Mostrar "Escribiendo..." con retraso realista
    setIsTyping(true);

    try {
      const res = await fetch(`${API_URL}/support/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          message: userMessage,
          ticketId: ticketId,
          category: 'other',
          language: currentLang, // 🌐 Enviar idioma al backend
        }),
      });

      const data = await res.json();

      if (data.ticketId) {
        setTicketId(data.ticketId);
      }

      // 3. Retraso artificial (1.5-2.5 seg) para parecer humano
      const delay = 1500 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));

      // 4. Agregar respuesta del "agente"
      if (data.response) {
        const agentMsg: Message = {
          id: Date.now() + 1,
          type: 'agent',
          text: data.response,
          time: new Date().toLocaleTimeString(currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'es-MX', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, agentMsg]);
      }

    } catch (error) {
      console.error('Error enviando mensaje:', error);
      const errorMsg: Message = {
        id: Date.now() + 1,
        type: 'agent',
        text: t('support.connectionError'),
        time: new Date().toLocaleTimeString(currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'es-MX', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  // Crear lead automáticamente al entrar al chat
  const createLeadOnEntry = async () => {
    try {
      await fetch(`${API_URL}/crm/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user?.id,
          source: 'support_chat',
          notes: 'Usuario entró al Centro de Ayuda desde la app',
        }),
      });
      console.log('Lead creado automáticamente');
    } catch (e) {
      console.log('Error creando lead al entrar:', e);
    }
  };

  // Auto-scroll al fondo
  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, isTyping]);

  const handleCall = async () => {
    try {
      // Crear lead en CRM
      await fetch(`${API_URL}/crm/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user?.id,
          source: 'support_chat',
          notes: 'Usuario solicitó contacto desde chat de soporte',
        }),
      });
    } catch (e) {
      console.log('Error creando lead:', e);
    }

    Alert.alert(
      'Solicitud Recibida',
      'Un asesor se pondrá en contacto contigo en las próximas 24 a 48 horas.',
      [{ text: 'Entendido', style: 'default' }]
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.type === 'user';

    return (
      <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
        {/* Avatar solo para el agente */}
        {!isUser && (
          <Avatar.Image 
            size={34} 
            source={{ uri: AGENT_AVATAR }} 
            style={styles.avatar}
          />
        )}

        <Surface style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAgent]} elevation={1}>
          <Text style={[styles.messageText, isUser && styles.messageTextUser]}>
            {item.text}
          </Text>
          <Text style={[styles.timeText, isUser && styles.timeTextUser]}>
            {item.time}
          </Text>
        </Surface>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header tipo WhatsApp Business */}
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="white" />
        <Avatar.Image size={40} source={{ uri: AGENT_AVATAR }} style={{ marginRight: 12 }} />
        <Appbar.Content
          title={`${t('support.agentName')} · ${t('support.title')}`}
          titleStyle={styles.headerTitle}
          subtitle={isTyping ? t('support.typing') : 'Online'}
          subtitleStyle={[styles.headerSubtitle, isTyping && styles.typingSubtitle]}
        />
        <Appbar.Action icon="phone" color="white" onPress={handleCall} />
      </Appbar.Header>

      {/* Chat Area */}
      <View style={styles.chatArea}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={[
            styles.messagesList,
            Platform.OS === 'android' && { paddingBottom: keyboardHeight > 0 ? 10 : 20 }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingContainer}>
                <Avatar.Image size={28} source={{ uri: AGENT_AVATAR }} style={{ marginRight: 8 }} />
                <Text style={styles.typingText}>{AGENT_NAME} está escribiendo...</Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* Input moderno - Con padding para Android */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[
          styles.inputContainer,
          Platform.OS === 'android' && keyboardHeight > 0 && { marginBottom: keyboardHeight }
        ]}>
          <TextInput
            mode="flat"
            placeholder="Escribe un mensaje..."
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
            disabled={!inputText.trim()}
            style={styles.sendButton}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    backgroundColor: BRAND_DARK,
    elevation: 0,
  },
  headerTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  typingSubtitle: {
    color: BRAND_ORANGE,
    fontWeight: 'bold',
  },
  chatArea: {
    flex: 1,
    backgroundColor: CHAT_BG,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  avatar: {
    marginRight: 8,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '75%',
  },
  bubbleAgent: {
    backgroundColor: 'white',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: BRAND_DARK,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#111',
  },
  messageTextUser: {
    color: 'white',
  },
  timeText: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    textAlign: 'right',
  },
  timeTextUser: {
    color: 'rgba(255,255,255,0.6)',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    marginTop: 8,
  },
  typingText: {
    color: '#666',
    fontStyle: 'italic',
    fontSize: 13,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'white',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 25,
    maxHeight: 100,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  sendButton: {
    marginLeft: 8,
  },
});
