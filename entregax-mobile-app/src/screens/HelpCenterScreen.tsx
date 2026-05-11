/**
 * HelpCenterScreen.tsx
 * Centro de Ayuda con opciones de soporte
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Image,
} from 'react-native';
import {
  Text,
  Surface,
  Avatar,
  ActivityIndicator,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const BLUE = '#2196F3';
const GREEN = '#10B981';

type RootStackParamList = {
  HelpCenter: { user: any; token: string };
  Home: { user: any; token: string };
  SupportChat: { user: any; token: string; mode?: 'ai' | 'human' };
  RequestAdvisor: { user: any; token: string };
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'HelpCenter'>;
  route: RouteProp<RootStackParamList, 'HelpCenter'>;
};

export default function HelpCenterScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, token } = route.params;
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  // Privacy policy: lee del backend (legal_documents.privacy_policy) para
  // que el aviso siempre coincida con la versión que el admin haya
  // editado en /admin → Documentos Legales.
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyDoc, setPrivacyDoc] = useState<{ title: string; content: string; version?: number; updated_at?: string } | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const openPrivacyPolicy = async () => {
    setPrivacyModalOpen(true);
    if (privacyDoc) return; // ya cargado
    setPrivacyLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/legal-documents/privacy_policy`);
      if (!res.ok) throw new Error('not ok');
      const data = await res.json();
      if (data?.success && data.document) {
        setPrivacyDoc({
          title: data.document.title || 'Aviso de Privacidad',
          content: data.document.content || '',
          version: data.document.version,
          updated_at: data.document.updated_at,
        });
      }
    } catch {
      setPrivacyDoc({ title: 'Aviso de Privacidad', content: 'No se pudo cargar el aviso. Verifica tu conexión e intenta de nuevo.' });
    } finally {
      setPrivacyLoading(false);
    }
  };
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketCategory, setTicketCategory] = useState('');
  const [ticketTracking, setTicketTracking] = useState('');
  const [ticketImages, setTicketImages] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [trackingValidation, setTrackingValidation] = useState<{ status: 'idle' | 'validating' | 'valid' | 'invalid'; message: string }>({ status: 'idle', message: '' });
  const [loading, setLoading] = useState(false);
  
  // Info del asesor (cargar desde API)
  const [advisorInfo, setAdvisorInfo] = useState<{
    id: number;
    name: string;
    phone: string;
  } | null>(null);

  // Cargar info del asesor al montar
  useEffect(() => {
    loadAdvisorInfo();
  }, []);

  const loadAdvisorInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data?.advisor_id && data?.advisor_name) {
        setAdvisorInfo({
          id: data.advisor_id,
          name: data.advisor_name,
          phone: data.advisor_phone || '',
        });
      }
    } catch (error) {
      console.error('Error cargando asesor:', error);
    }
  };

  // Verificar si el usuario tiene asesor asignado
  const hasAdvisor = advisorInfo !== null;
  const advisorName = advisorInfo?.name || '';
  const advisorPhone = advisorInfo?.phone || '';

  // Categorías de ticket (valores en inglés para coincidir con web admin)
  const ticketCategories = [
    { value: 'tracking', label: t('helpCenter.categories.tracking') },
    { value: 'delay', label: t('helpCenter.categories.delay') },
    { value: 'missing', label: t('helpCenter.categories.missing') },
    { value: 'warranty', label: t('helpCenter.categories.warranty') },
    { value: 'compensation', label: t('helpCenter.categories.compensation') },
    { value: 'systemError', label: t('helpCenter.categories.systemError') },
    { value: 'other', label: t('helpCenter.categories.other') },
  ];

  // El número de guía es obligatorio excepto para "systemError"
  const isTrackingRequired = ticketCategory !== 'systemError' && ticketCategory !== '';

  // Opción 1: Hablar ahora (Asesor Virtual / AI)
  const handleTalkNow = () => {
    navigation.navigate('SupportChat', { user, token, mode: 'ai' });
  };

  // Opción 2: Solicitar Asesor - Navega a pantalla de vinculación
  const handleRequestAdvisor = () => {
    navigation.navigate('RequestAdvisor', { user, token });
  };

  // Contactar asesor por WhatsApp
  const handleContactAdvisor = () => {
    if (!advisorPhone) {
      Alert.alert(t('common.error'), t('helpCenter.noAdvisorPhone'));
      return;
    }
    // Limpiar el número de teléfono
    const cleanPhone = advisorPhone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hola ${advisorName}, soy ${user?.full_name || 'cliente'} de EntregaX (Suite ${user?.box_id || ''}).`)}`;
    Linking.openURL(whatsappUrl);
  };

  // Resetear formulario
  const resetTicketForm = () => {
    setTicketMessage('');
    setTicketCategory('');
    setTicketTracking('');
    setTicketImages([]);
    setTrackingValidation({ status: 'idle', message: '' });
  };

  // Validar guía contra el backend
  const validateTrackingNumber = async (tracking: string) => {
    const trimmed = tracking.trim();
    if (!trimmed) {
      setTrackingValidation({ status: 'idle', message: '' });
      return;
    }
    setTrackingValidation({ status: 'validating', message: 'Verificando guía...' });
    try {
      const res = await fetch(`${API_URL}/api/support/validate-tracking?tracking=${encodeURIComponent(trimmed)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.valid) {
        setTrackingValidation({ status: 'valid', message: `✅ Guía encontrada` });
      } else {
        setTrackingValidation({ status: 'invalid', message: data?.error || 'Guía no encontrada para tu número de cliente.' });
      }
    } catch (error) {
      setTrackingValidation({ status: 'invalid', message: 'Error al verificar la guía.' });
    }
  };

  // Seleccionar imagen de la galería
  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('helpCenter.galleryPermissionDenied'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
        selectionLimit: 5,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        }));
        setTicketImages((prev) => [...prev, ...newImages].slice(0, 5));
      }
    } catch (error) {
      console.error('Error picking image:', error);
    }
  };

  // Tomar foto con la cámara
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('helpCenter.cameraPermissionDenied'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setTicketImages((prev) => [
          ...prev,
          {
            uri: asset.uri,
            name: asset.fileName || `photo_${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          },
        ].slice(0, 5));
      }
    } catch (error) {
      console.error('Error taking photo:', error);
    }
  };

  // Eliminar imagen
  const handleRemoveImage = (index: number) => {
    setTicketImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Validar formulario
  const isFormValid = () => {
    if (!ticketCategory) return false;
    if (!ticketMessage.trim()) return false;
    if (isTrackingRequired && !ticketTracking.trim()) return false;
    // Si hay tracking, debe estar validado
    if (ticketTracking.trim() && trackingValidation.status !== 'valid') return false;
    return true;
  };

  // Opción 3: Crear ticket de servicio
  const handleCreateTicket = async () => {
    if (!ticketCategory) {
      Alert.alert(t('common.error'), t('helpCenter.selectCategory'));
      return;
    }
    if (isTrackingRequired && !ticketTracking.trim()) {
      Alert.alert(t('common.error'), t('helpCenter.enterTracking'));
      return;
    }
    if (ticketTracking.trim() && trackingValidation.status !== 'valid') {
      Alert.alert(t('common.error'), trackingValidation.message || 'Verifica el número de guía antes de continuar.');
      return;
    }
    if (!ticketMessage.trim()) {
      Alert.alert(t('common.error'), t('helpCenter.enterMessage'));
      return;
    }

    setLoading(true);
    try {
      // Construir mensaje con contexto
      const fullMessage = ticketTracking.trim() 
        ? `[Tracking: ${ticketTracking.trim()}]\n\n${ticketMessage.trim()}`
        : ticketMessage.trim();

      // Usar FormData para enviar imágenes
      const formData = new FormData();
      formData.append('message', fullMessage);
      formData.append('category', ticketCategory);
      if (ticketTracking.trim()) {
        formData.append('trackingNumber', ticketTracking.trim());
      }
      formData.append('escalateDirectly', 'true');
      
      // Agregar imágenes
      ticketImages.forEach((img, index) => {
        formData.append('images', {
          uri: img.uri,
          name: img.name || `support_image_${index}.jpg`,
          type: img.type || 'image/jpeg',
        } as any);
      });

      const res = await fetch(`${API_URL}/api/support/message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (res.ok && (data.status === 'escalated' || data.ticketFolio)) {
        setTicketModalOpen(false);
        resetTicketForm();
        Alert.alert(
          t('helpCenter.ticketCreated'),
          t('helpCenter.ticketCreatedMsg', { folio: data.ticketFolio || '' }),
          [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
        );
      } else if (!res.ok) {
        Alert.alert(t('common.error'), data.error || data.message || t('errors.serverError'));
      } else {
        Alert.alert(t('common.success'), data.message || t('helpCenter.ticketCreated'));
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert(t('common.error'), t('errors.serverError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('helpCenter.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Avatar.Icon
            size={80}
            icon="headset"
            style={styles.heroIcon}
            color="#FFF"
          />
          <Text style={styles.heroTitle}>{t('helpCenter.welcomeTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('helpCenter.welcomeSubtitle')}</Text>
        </View>

        {/* Opciones de Soporte */}
        <View style={styles.optionsContainer}>
          {/* Opción 1: Hablar Ahora (Asesor Virtual) */}
          <TouchableOpacity onPress={handleTalkNow}>
            <Surface style={styles.optionCard}>
              <View style={[styles.optionIcon, { backgroundColor: BLUE + '20' }]}>
                <Ionicons name="chatbubble-ellipses" size={32} color={BLUE} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{t('helpCenter.talkNow')}</Text>
                <Text style={styles.optionDescription}>{t('helpCenter.talkNowDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#999" />
            </Surface>
          </TouchableOpacity>

          {/* Opción 2: Solicitar Asesor o Mostrar Asesor Asignado */}
          {hasAdvisor ? (
            // Mostrar info del asesor asignado
            <Surface style={styles.optionCard}>
              <View style={[styles.optionIcon, { backgroundColor: GREEN + '20' }]}>
                <Ionicons name="person-circle" size={32} color={GREEN} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{t('helpCenter.yourAdvisor')}</Text>
                <Text style={[styles.optionDescription, { fontWeight: '600', color: BLACK }]}>{advisorName}</Text>
                {advisorPhone && (
                  <Text style={styles.optionDescription}>{advisorPhone}</Text>
                )}
              </View>
              <TouchableOpacity 
                onPress={handleContactAdvisor}
                style={styles.whatsappButton}
              >
                <Ionicons name="logo-whatsapp" size={28} color="#FFF" />
              </TouchableOpacity>
            </Surface>
          ) : (
            // Solicitar asesor
            <TouchableOpacity onPress={handleRequestAdvisor} disabled={loading}>
              <Surface style={styles.optionCard}>
                <View style={[styles.optionIcon, { backgroundColor: GREEN + '20' }]}>
                  <Ionicons name="person-circle" size={32} color={GREEN} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{t('helpCenter.requestAdvisor')}</Text>
                  <Text style={styles.optionDescription}>{t('helpCenter.requestAdvisorDesc')}</Text>
                </View>
                {loading ? (
                  <ActivityIndicator size="small" color={ORANGE} />
                ) : (
                  <Ionicons name="chevron-forward" size={24} color="#999" />
                )}
              </Surface>
            </TouchableOpacity>
          )}

          {/* Opción 3: Crear Ticket de Servicio */}
          <TouchableOpacity onPress={() => setTicketModalOpen(true)}>
            <Surface style={styles.optionCard}>
              <View style={[styles.optionIcon, { backgroundColor: ORANGE + '20' }]}>
                <Ionicons name="ticket" size={32} color={ORANGE} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{t('helpCenter.createTicket')}</Text>
                <Text style={styles.optionDescription}>{t('helpCenter.createTicketDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#999" />
            </Surface>
          </TouchableOpacity>

          {/* Opción 4: Aviso de Privacidad de la Empresa */}
          <TouchableOpacity onPress={openPrivacyPolicy}>
            <Surface style={styles.optionCard}>
              <View style={[styles.optionIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="shield-checkmark" size={32} color="#1976D2" />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Aviso de Privacidad</Text>
                <Text style={styles.optionDescription}>Consulta cómo tratamos tus datos personales</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#999" />
            </Surface>
          </TouchableOpacity>
        </View>

        {/* Info adicional */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#666" />
          <Text style={styles.infoText}>{t('helpCenter.infoText')}</Text>
        </View>
      </ScrollView>

      {/* Modal para crear ticket */}
      <Modal
        visible={ticketModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => { setTicketModalOpen(false); resetTicketForm(); }}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView style={styles.modalContainer} keyboardShouldPersistTaps="handled">
            {/* Header del modal */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <Ionicons name="ticket" size={24} color="#FFF" />
                <Text style={styles.modalTitle}>{t('helpCenter.createTicket')}</Text>
              </View>
              <TouchableOpacity onPress={() => { setTicketModalOpen(false); resetTicketForm(); }}>
                <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>

            {/* Contenido del modal */}
            <View style={styles.modalContent}>
              {/* Categoría */}
              <Text style={styles.modalLabel}>{t('helpCenter.categoryLabel')} *</Text>
              <View style={styles.categoryContainer}>
                {ticketCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryChip,
                      ticketCategory === cat.value && styles.categoryChipActive
                    ]}
                    onPress={() => setTicketCategory(cat.value)}
                  >
                    <Text style={[
                      styles.categoryChipText,
                      ticketCategory === cat.value && styles.categoryChipTextActive
                    ]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Número de guía */}
              <Text style={styles.modalLabel}>
                {t('helpCenter.trackingLabel')} {isTrackingRequired ? '*' : `(${t('common.optional')})`}
              </Text>
              <RNTextInput
                style={[
                  styles.textInput,
                  trackingValidation.status === 'invalid' && { borderColor: '#D32F2F', borderWidth: 1.5 },
                  trackingValidation.status === 'valid' && { borderColor: '#4CAF50', borderWidth: 1.5 },
                ]}
                placeholder={t('helpCenter.trackingPlaceholder')}
                placeholderTextColor="#999"
                value={ticketTracking}
                onChangeText={(text) => {
                  setTicketTracking(text);
                  if (trackingValidation.status !== 'idle') {
                    setTrackingValidation({ status: 'idle', message: '' });
                  }
                }}
                onBlur={() => {
                  if (ticketTracking.trim()) {
                    validateTrackingNumber(ticketTracking);
                  }
                }}
                autoCapitalize="characters"
              />
              {trackingValidation.status !== 'idle' && (
                <Text style={{
                  fontSize: 12,
                  marginTop: -4,
                  marginBottom: 8,
                  color: trackingValidation.status === 'valid' ? '#4CAF50' : 
                         trackingValidation.status === 'invalid' ? '#D32F2F' : '#666',
                  fontWeight: '600',
                }}>
                  {trackingValidation.status === 'validating' ? '⏳ Verificando guía...' : trackingValidation.message}
                </Text>
              )}

              {/* Descripción */}
              <Text style={styles.modalLabel}>{t('helpCenter.describeIssue')} *</Text>
              <RNTextInput
                style={styles.textArea}
                placeholder={t('helpCenter.ticketPlaceholder')}
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={ticketMessage}
                onChangeText={setTicketMessage}
              />

              {/* Sección de Fotografías */}
              <Text style={styles.modalLabel}>📷 {t('helpCenter.photosLabel')} ({t('common.optional')})</Text>
              <Text style={styles.photosHint}>{t('helpCenter.photosHint')}</Text>
              
              <View style={styles.photoButtonsRow}>
                <TouchableOpacity style={styles.photoButton} onPress={handlePickImage}>
                  <Ionicons name="images-outline" size={22} color={ORANGE} />
                  <Text style={styles.photoButtonText}>{t('helpCenter.gallery')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={22} color={ORANGE} />
                  <Text style={styles.photoButtonText}>{t('helpCenter.camera')}</Text>
                </TouchableOpacity>
              </View>

              {/* Preview de imágenes */}
              {ticketImages.length > 0 && (
                <View style={styles.imagesPreviewContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {ticketImages.map((img, index) => (
                      <View key={index} style={styles.imagePreviewWrapper}>
                        <Image source={{ uri: img.uri }} style={styles.imagePreview} />
                        <TouchableOpacity 
                          style={styles.removeImageButton}
                          onPress={() => handleRemoveImage(index)}
                        >
                          <Ionicons name="close-circle" size={24} color="#FF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                  <Text style={styles.imagesCount}>
                    ✓ {ticketImages.length} {ticketImages.length === 1 ? t('helpCenter.imageAttached') : t('helpCenter.imagesAttached')}
                  </Text>
                </View>
              )}

              <View style={styles.modalInfo}>
                <Ionicons name="shield-checkmark" size={18} color={GREEN} />
                <Text style={styles.modalInfoText}>{t('helpCenter.ticketInfoText')}</Text>
              </View>
            </View>

            {/* Botones del modal */}
            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => { setTicketModalOpen(false); resetTicketForm(); }}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.submitButton, !isFormValid() && styles.submitButtonDisabled]}
                onPress={handleCreateTicket}
                disabled={loading || !isFormValid()}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#FFF" />
                    <Text style={styles.submitButtonText}>{t('helpCenter.sendTicket')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Aviso de Privacidad de la Empresa */}
      <Modal
        visible={privacyModalOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPrivacyModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ paddingTop: 50, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: ORANGE, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => setPrivacyModalOpen(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Aviso de Privacidad</Text>
              {privacyDoc?.version != null ? (
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                  Versión {privacyDoc.version}
                  {privacyDoc.updated_at ? ` · ${new Date(privacyDoc.updated_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}
                </Text>
              ) : null}
            </View>
          </View>
          {privacyLoading && !privacyDoc ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="document-text" size={42} color="#ccc" />
              <Text style={{ color: '#888', marginTop: 8 }}>Cargando aviso...</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 12 }}>
                {privacyDoc?.title || 'Aviso de Privacidad'}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 22, color: '#333' }}>
                {privacyDoc?.content || ''}
              </Text>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
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
    justifyContent: 'space-between',
    backgroundColor: ORANGE,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  scrollContent: {
    padding: 16,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 20,
  },
  heroIcon: {
    backgroundColor: ORANGE,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BLACK,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    padding: 14,
    borderRadius: 10,
    marginTop: 24,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ORANGE,
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  modalContent: {
    padding: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 10,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
    backgroundColor: '#FAFAFA',
    color: BLACK,
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
    color: BLACK,
    marginBottom: 16,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  categoryChipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFF',
  },
  modalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  modalInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 10,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#CCC',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  whatsappButton: {
    backgroundColor: '#25D366',
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Estilos para fotos
  photosHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: ORANGE,
    borderRadius: 10,
    backgroundColor: '#FFF5F2',
  },
  photoButtonText: {
    fontSize: 14,
    color: ORANGE,
    fontWeight: '500',
  },
  imagesPreviewContainer: {
    marginBottom: 12,
  },
  imagePreviewWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  imagesCount: {
    fontSize: 12,
    color: GREEN,
    marginTop: 8,
    fontWeight: '500',
  },
});
