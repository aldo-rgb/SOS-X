import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Avatar,
  Surface,
  ActivityIndicator,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '../services/api';
import { useTranslation } from 'react-i18next';

const ORANGE = '#F05A28';
const BLACK = '#111111';
const GREEN = '#10B981';

type RootStackParamList = {
  RequestAdvisor: { user: any; token: string };
  Home: { user: any; token: string };
  SupportChat: { user: any; token: string };
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RequestAdvisor'>;
  route: RouteProp<RootStackParamList, 'RequestAdvisor'>;
};

export default function RequestAdvisorScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user, token } = route.params;
  const [advisorCode, setAdvisorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Paso 1: Validar código y mostrar términos
  const handleSubmit = () => {
    if (!advisorCode.trim()) {
      navigation.navigate('SupportChat', { user, token });
      return;
    }
    // Mostrar modal de términos antes de vincular
    setShowTerms(true);
  };

  // Paso 2: Confirmar términos y vincular
  const handleConfirmLink = async () => {
    setShowTerms(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/advisor/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          advisorCodeInput: advisorCode.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        if (data.type === 'LINKED') {
          Alert.alert(
            t('advisor.connected'),
            data.message,
            [{ text: t('advisor.continue'), onPress: () => navigation.goBack() }]
          );
        } else if (data.type === 'PENDING') {
          Alert.alert(
            t('advisor.requestInProgress'),
            data.message,
            [{ text: t('advisor.understood'), onPress: () => navigation.goBack() }]
          );
        } else {
          Alert.alert(
            t('advisor.requestSent'),
            data.message,
            [{ text: t('advisor.understood'), onPress: () => navigation.goBack() }]
          );
        }
      } else {
        Alert.alert(t('common.error'), data.error || t('errors.serverError'));
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert(t('common.error'), t('advisor.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Botón de retroceso */}
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Avatar.Icon
            size={80}
            icon="account-tie"
            style={styles.avatarIcon}
            color={ORANGE}
          />
          <Text style={styles.headerTitle}>{t('advisor.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {t('advisor.subtitle')}
          </Text>
        </View>

        {/* Card Principal */}
        <Card style={styles.card}>
          <Card.Content>
            {/* Tu Box ID (Automático) */}
            <Surface style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Ionicons name="cube-outline" size={24} color="#666" />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>{t('advisor.yourMailbox')}</Text>
                  <Text style={styles.infoValue}>{user.boxId}</Text>
                </View>
              </View>
            </Surface>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('advisor.enterAdvisorData')}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Input: Código/Casillero del Asesor */}
            <TextInput
              label={t('advisor.advisorId')}
              placeholder={t('advisor.advisorIdPlaceholder')}
              value={advisorCode}
              onChangeText={setAdvisorCode}
              mode="outlined"
              activeOutlineColor={ORANGE}
              outlineColor="#ddd"
              style={styles.input}
              autoCapitalize="characters"
              left={<TextInput.Icon icon="account-search" />}
            />

            <Text style={styles.helperText}>
              {t('advisor.helperText')}
            </Text>

            {/* Botón */}
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              buttonColor={advisorCode.trim() ? GREEN : ORANGE}
            >
              {loading
                ? t('advisor.processing')
                : advisorCode.trim()
                ? t('advisor.linkWithAdvisor')
                : t('advisor.needHelp')}
            </Button>
          </Card.Content>
        </Card>

        {/* Info adicional */}
        <View style={styles.benefitsContainer}>
          <Text style={styles.benefitsTitle}>{t('advisor.benefitsTitle')}</Text>
          <View style={styles.benefitItem}>
            <Ionicons name="pricetag-outline" size={20} color={ORANGE} />
            <Text style={styles.benefitText}>{t('advisor.benefit1')}</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="headset-outline" size={20} color={ORANGE} />
            <Text style={styles.benefitText}>{t('advisor.benefit2')}</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="flash-outline" size={20} color={ORANGE} />
            <Text style={styles.benefitText}>{t('advisor.benefit3')}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Modal de Términos de Vinculación */}
      <Modal
        visible={showTerms}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTerms(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.termsHeader}>
                <View style={styles.termsIconCircle}>
                  <Ionicons name="shield-checkmark" size={28} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.termsTitle}>Términos de Vinculación</Text>
                  <Text style={styles.termsSubtitle}>Lee cuidadosamente antes de continuar</Text>
                </View>
              </View>

              {/* TU ASESOR PODRÁ */}
              <Text style={styles.termsSectionLabel}>TU ASESOR PODRÁ</Text>

              <View style={styles.termsCard}>
                <View style={styles.termsCardRow}>
                  <View style={[styles.termsIconBadge, { backgroundColor: '#E8F5E9' }]}>  
                    <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
                  </View>
                  <Text style={styles.termsCardText}>
                    <Text style={{ fontWeight: 'bold' }}>Configurar direcciones de envío</Text>
                    {' '}en tu cuenta
                  </Text>
                </View>
              </View>

              <View style={styles.termsCard}>
                <View style={styles.termsCardRow}>
                  <View style={[styles.termsIconBadge, { backgroundColor: '#E8F5E9' }]}>  
                    <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
                  </View>
                  <Text style={styles.termsCardText}>
                    <Text style={{ fontWeight: 'bold' }}>Asignar instrucciones y paqueterías</Text>
                    {' '}a tus embarques
                  </Text>
                </View>
              </View>

              {/* TU ASESOR NO PUEDE */}
              <Text style={[styles.termsSectionLabel, { color: '#D32F2F', marginTop: 20 }]}>TU ASESOR NO PUEDE</Text>

              <View style={[styles.termsCard, { borderLeftColor: '#FFCDD2', borderLeftWidth: 3 }]}>
                <View style={styles.termsCardRow}>
                  <View style={[styles.termsIconBadge, { backgroundColor: '#FFEBEE' }]}>  
                    <Ionicons name="close-circle" size={22} color="#D32F2F" />
                  </View>
                  <Text style={styles.termsCardText}>
                    <Text style={{ fontWeight: 'bold' }}>Configurar métodos de pago</Text>
                    {' '}ni gestionar tus pagos
                  </Text>
                </View>
              </View>

              {/* AVISO DE SEGURIDAD */}
              <View style={styles.securityWarning}>
                <View style={styles.termsCardRow}>
                  <Ionicons name="warning" size={24} color={ORANGE} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.securityTitle}>AVISO DE SEGURIDAD</Text>
                    <Text style={styles.securityText}>
                      Por ningún motivo los asesores de EntregaX te solicitarán datos de tu tarjeta de crédito.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Botones */}
              <View style={styles.termsButtons}>
                <TouchableOpacity
                  style={styles.termsCancelBtn}
                  onPress={() => setShowTerms(false)}
                >
                  <Text style={styles.termsCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.termsAcceptBtn}
                  onPress={handleConfirmLink}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.termsAcceptText}>Acepto y Vincular</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BLACK,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 30,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  avatarIcon: {
    backgroundColor: 'white',
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 15,
    textAlign: 'center',
  },
  headerSubtitle: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#F4F6F8',
    elevation: 4,
  },
  infoBox: {
    backgroundColor: '#e8e8e8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
  },
  infoValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
    marginTop: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#999',
    fontSize: 12,
  },
  input: {
    backgroundColor: 'white',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 20,
    lineHeight: 18,
  },
  button: {
    borderRadius: 12,
  },
  buttonContent: {
    height: 54,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  benefitsContainer: {
    marginTop: 24,
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  benefitsTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  benefitText: {
    color: '#ccc',
    fontSize: 14,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal de Términos
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxHeight: '85%',
  },
  termsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLACK,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  termsIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  termsSubtitle: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  termsSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  termsCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  termsCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  termsIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  termsCardText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  securityWarning: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderLeftWidth: 3,
    borderLeftColor: ORANGE,
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: ORANGE,
    marginBottom: 4,
  },
  securityText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  termsButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  termsCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsCancelText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  termsAcceptBtn: {
    flex: 1.5,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsAcceptText: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: 'bold',
  },
});
