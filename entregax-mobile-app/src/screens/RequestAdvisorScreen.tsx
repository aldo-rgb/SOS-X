import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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

  const handleSubmit = async () => {
    // Si el campo está vacío, llevar directo al Centro de Ayuda
    if (!advisorCode.trim()) {
      navigation.navigate('SupportChat', { user, token });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/advisor/request`, {
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
          // Vinculado exitosamente
          Alert.alert(
            t('advisor.connected'),
            data.message,
            [{ text: t('advisor.continue'), onPress: () => navigation.goBack() }]
          );
        } else if (data.type === 'PENDING') {
          // Ya tenía solicitud pendiente
          Alert.alert(
            t('advisor.requestInProgress'),
            data.message,
            [{ text: t('advisor.understood'), onPress: () => navigation.goBack() }]
          );
        } else {
          // REQUESTED - Nueva solicitud enviada
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
    paddingTop: 30,
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
});
