import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Surface,
  HelperText,
  Divider,
  Chip,
  ActivityIndicator,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { api } from '../services/api';

// Colores de marca
const ORANGE = '#F05A28';
const BLACK = '#111111';
const GREEN = '#4CAF50';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ExistingClient: undefined;
  Verification: { user: any; token: string };
  Home: { user: any; token: string };
};

type ExistingClientScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ExistingClient'>;
  route: RouteProp<RootStackParamList, 'ExistingClient'>;
};

// Pasos del flujo
type Step = 'enterBoxId' | 'enterName' | 'confirmData' | 'setPassword';

interface ClientData {
  boxId: string;
  fullName: string;
  email: string;
  phone: string;
  advisorCode: string | null;
  registrationDate: string | null;
}

export default function ExistingClientScreen({ navigation }: ExistingClientScreenProps) {
  const [step, setStep] = useState<Step>('enterBoxId');
  const [loading, setLoading] = useState(false);
  
  // Paso 1: Número de cliente
  const [boxId, setBoxId] = useState('');
  
  // Paso 2: Nombre para verificar
  const [inputName, setInputName] = useState('');
  
  // Paso 3: Datos del cliente (vienen del servidor)
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  
  // Paso 4: Contraseña
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Verificar si existe el número de cliente
  const handleCheckBoxId = async () => {
    if (!boxId || boxId.length < 2) {
      Alert.alert('Error', 'Ingresa tu número de cliente');
      return;
    }

    setLoading(true);
    try {
      const response = await api.get(`/legacy/verify/${boxId.toUpperCase()}`);
      
      if (!response.data.exists) {
        Alert.alert(
          'No encontrado',
          'No encontramos ese número de cliente. Verifica que sea correcto o regístrate como nuevo cliente.',
          [
            { text: 'Reintentar', style: 'cancel' },
            { text: 'Nuevo registro', onPress: () => navigation.navigate('Register') }
          ]
        );
        return;
      }

      if (response.data.isClaimed) {
        Alert.alert(
          'Ya registrado',
          'Este número de cliente ya fue activado. Si eres el dueño legítimo, intenta iniciar sesión o contacta a soporte.',
          [
            { text: 'Iniciar sesión', onPress: () => navigation.navigate('Login') },
            { text: 'OK', style: 'cancel' }
          ]
        );
        return;
      }

      // Mostrar pista del nombre si existe
      if (response.data.nameHint) {
        Alert.alert(
          '✅ Cliente encontrado',
          `Encontramos tu cuenta. Nombre registrado: ${response.data.nameHint}\n\nPor seguridad, confirma tu nombre completo.`
        );
      }
      
      setStep('enterName');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Error al verificar');
    } finally {
      setLoading(false);
    }
  };

  // Verificar nombre y obtener datos
  const handleVerifyName = async () => {
    if (!inputName || inputName.length < 3) {
      Alert.alert('Error', 'Ingresa tu nombre completo');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/legacy/verify-name', {
        boxId: boxId.toUpperCase(),
        fullName: inputName.trim()
      });

      if (response.data.nameMatch && response.data.clientData) {
        setClientData(response.data.clientData);
        setEditedEmail(response.data.clientData.email || '');
        setEditedPhone(response.data.clientData.phone || '');
        setStep('confirmData');
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Error al verificar';
      
      if (error.response?.status === 403) {
        Alert.alert(
          'Nombre no coincide',
          'El nombre que ingresaste no coincide con nuestros registros. Verifica que sea el mismo nombre con el que te registraste.',
          [{ text: 'Reintentar', style: 'cancel' }]
        );
      } else {
        Alert.alert('Error', errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Confirmar datos y pasar a contraseña
  const handleConfirmData = () => {
    if (!editedEmail || !editedEmail.includes('@')) {
      Alert.alert('Error', 'Ingresa un correo electrónico válido');
      return;
    }
    if (!editedPhone || editedPhone.length < 10) {
      Alert.alert('Error', 'Ingresa un número de WhatsApp válido (10 dígitos)');
      return;
    }
    setStep('setPassword');
  };

  // Completar registro
  const handleCompleteRegistration = async () => {
    if (!password || password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/legacy/claim', {
        boxId: clientData?.boxId,
        fullName: clientData?.fullName,
        email: editedEmail.trim().toLowerCase(),
        phone: editedPhone.trim(),
        password
      });

      const userData = {
        id: response.data.user.id,
        name: response.data.user.full_name,
        email: response.data.user.email,
        boxId: response.data.user.box_id,
        role: response.data.user.role,
      };

      Alert.alert(
        '🎉 ¡Cuenta activada!',
        `Tu número de cliente ${userData.boxId} está listo.\n\nYa puedes usar EntregaX para gestionar tus paquetes.`,
        [
          {
            text: 'Continuar',
            onPress: () => {
              navigation.replace('Verification', {
                user: userData,
                token: response.data.token,
              });
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.error || 'No se pudo completar el registro'
      );
    } finally {
      setLoading(false);
    }
  };

  // Renderizar según el paso
  const renderStep = () => {
    switch (step) {
      case 'enterBoxId':
        return (
          <>
            <Text style={styles.welcomeText}>Cliente Existente</Text>
            <Text style={styles.instructionText}>
              Ingresa tu número de cliente para activar tu cuenta
            </Text>

            <TextInput
              label="Número de cliente (Ej: S123)"
              value={boxId}
              onChangeText={(text) => setBoxId(text.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              mode="outlined"
              left={<TextInput.Icon icon="card-account-details" />}
              style={styles.input}
              outlineColor="#ddd"
              activeOutlineColor={ORANGE}
              autoCapitalize="characters"
              placeholder="S123"
            />

            <Button
              mode="contained"
              onPress={handleCheckBoxId}
              loading={loading}
              disabled={loading || boxId.length < 2}
              style={styles.primaryButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {loading ? 'Verificando...' : 'Buscar mi cuenta'}
            </Button>
          </>
        );

      case 'enterName':
        return (
          <>
            <Text style={styles.welcomeText}>Verificar identidad</Text>
            <Text style={styles.instructionText}>
              Por seguridad, confirma tu nombre completo tal como lo registraste
            </Text>

            <Chip icon="check-circle" style={styles.successChip}>
              Cliente #{boxId} encontrado
            </Chip>

            <TextInput
              label="Tu nombre completo"
              value={inputName}
              onChangeText={setInputName}
              mode="outlined"
              left={<TextInput.Icon icon="account" />}
              style={styles.input}
              outlineColor="#ddd"
              activeOutlineColor={ORANGE}
              autoCapitalize="words"
            />

            <Button
              mode="contained"
              onPress={handleVerifyName}
              loading={loading}
              disabled={loading || inputName.length < 3}
              style={styles.primaryButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {loading ? 'Verificando...' : 'Confirmar nombre'}
            </Button>

            <Button
              mode="text"
              onPress={() => setStep('enterBoxId')}
              style={styles.backButton}
              labelStyle={{ color: '#666' }}
            >
              ← Volver
            </Button>
          </>
        );

      case 'confirmData':
        return (
          <>
            <Text style={styles.welcomeText}>Confirma tus datos</Text>
            <Text style={styles.instructionText}>
              Verifica y actualiza tu información si es necesario
            </Text>

            <Chip icon="account-check" style={styles.successChip}>
              ¡Hola, {clientData?.fullName?.split(' ')[0]}! 👋
            </Chip>

            <Surface style={styles.dataCard} elevation={1}>
              <Text style={styles.dataLabel}>Número de cliente</Text>
              <Text style={styles.dataValue}>{clientData?.boxId}</Text>
              
              {clientData?.advisorCode && (
                <>
                  <Divider style={{ marginVertical: 10 }} />
                  <Text style={styles.dataLabel}>Tu asesor</Text>
                  <Chip icon="account-tie" style={styles.advisorChip}>
                    Código: {clientData.advisorCode}
                  </Chip>
                </>
              )}
            </Surface>

            <TextInput
              label="Correo electrónico"
              value={editedEmail}
              onChangeText={setEditedEmail}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              left={<TextInput.Icon icon="email" />}
              style={styles.input}
              outlineColor="#ddd"
              activeOutlineColor={ORANGE}
            />
            {editedEmail && !editedEmail.includes('@') && (
              <HelperText type="error" visible>
                Ingresa un correo válido
              </HelperText>
            )}

            <TextInput
              label="WhatsApp (10 dígitos)"
              value={editedPhone}
              onChangeText={(text) => setEditedPhone(text.replace(/[^0-9]/g, ''))}
              mode="outlined"
              keyboardType="phone-pad"
              maxLength={10}
              left={<TextInput.Icon icon="whatsapp" />}
              style={styles.input}
              outlineColor="#ddd"
              activeOutlineColor={ORANGE}
            />
            {editedPhone && editedPhone.length < 10 && (
              <HelperText type="error" visible>
                El teléfono debe tener 10 dígitos
              </HelperText>
            )}

            <Button
              mode="contained"
              onPress={handleConfirmData}
              disabled={!editedEmail.includes('@') || editedPhone.length < 10}
              style={styles.primaryButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              Continuar
            </Button>

            <Button
              mode="text"
              onPress={() => setStep('enterName')}
              style={styles.backButton}
              labelStyle={{ color: '#666' }}
            >
              ← Volver
            </Button>
          </>
        );

      case 'setPassword':
        return (
          <>
            <Text style={styles.welcomeText}>Crea tu contraseña</Text>
            <Text style={styles.instructionText}>
              Esta será tu contraseña para acceder a EntregaX
            </Text>

            <TextInput
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry={!showPassword}
              left={<TextInput.Icon icon="lock" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              style={styles.input}
              outlineColor="#ddd"
              activeOutlineColor={ORANGE}
            />
            {password && password.length < 6 && (
              <HelperText type="error" visible>
                Mínimo 6 caracteres
              </HelperText>
            )}

            <TextInput
              label="Confirmar contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              mode="outlined"
              secureTextEntry={!showPassword}
              left={<TextInput.Icon icon="lock-check" />}
              style={styles.input}
              outlineColor="#ddd"
              activeOutlineColor={ORANGE}
            />
            {confirmPassword && password !== confirmPassword && (
              <HelperText type="error" visible>
                Las contraseñas no coinciden
              </HelperText>
            )}

            <Button
              mode="contained"
              onPress={handleCompleteRegistration}
              loading={loading}
              disabled={loading || password.length < 6 || password !== confirmPassword}
              style={styles.primaryButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
              {loading ? 'Activando cuenta...' : 'Activar mi cuenta'}
            </Button>

            <Button
              mode="text"
              onPress={() => setStep('confirmData')}
              style={styles.backButton}
              labelStyle={{ color: '#666' }}
            >
              ← Volver
            </Button>
          </>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>🔑</Text>
        <Text style={styles.logoText}>
          Entrega<Text style={styles.logoX}>X</Text>
        </Text>
        <Text style={styles.subtitle}>Activa tu cuenta existente</Text>
      </View>

      {/* Formulario */}
      <Surface style={styles.formContainer} elevation={4}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderStep()}

          {/* Link a nuevo registro */}
          <Divider style={styles.divider} />
          <View style={styles.registerLink}>
            <Text style={styles.registerLinkText}>¿No tienes número de cliente?</Text>
            <Button
              mode="text"
              compact
              onPress={() => navigation.navigate('Register')}
              labelStyle={{ color: ORANGE, fontWeight: 'bold' }}
            >
              Crear cuenta nueva
            </Button>
          </View>
        </ScrollView>
      </Surface>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BLACK,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 50,
    marginBottom: 5,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
  },
  logoX: {
    color: ORANGE,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 3,
  },
  formContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 25,
    paddingBottom: 20,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 3,
  },
  instructionText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 20,
  },
  input: {
    marginBottom: 12,
    backgroundColor: 'white',
  },
  primaryButton: {
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: ORANGE,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 10,
  },
  successChip: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    backgroundColor: '#E8F5E9',
  },
  dataCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
  },
  dataLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dataValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BLACK,
  },
  advisorChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#E3F2FD',
  },
  divider: {
    marginVertical: 20,
  },
  registerLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  registerLinkText: {
    color: '#666',
    fontSize: 13,
  },
});
