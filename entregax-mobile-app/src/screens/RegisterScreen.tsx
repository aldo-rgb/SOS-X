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
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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

type RegisterScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Estado de validación del código de referido
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeValidation, setCodeValidation] = useState<{
    valid: boolean;
    advisorName?: string;
  } | null>(null);

  // Validar código de referido
  const validateReferralCode = async (code: string) => {
    if (!code || code.length < 6) {
      setCodeValidation(null);
      return;
    }

    setValidatingCode(true);
    try {
      const response = await api.get(`/referral/validate/${code.toUpperCase()}`);
      setCodeValidation({
        valid: response.data.valid,
        advisorName: response.data.advisor?.name,
      });
    } catch (error) {
      setCodeValidation({ valid: false });
    } finally {
      setValidatingCode(false);
    }
  };

  // Validaciones de formulario
  const emailError = email && !email.includes('@');
  const passwordError = password && password.length < 6;
  const confirmError = confirmPassword && password !== confirmPassword;
  const phoneError = phone && phone.length < 10;

  const isFormValid = 
    fullName.length >= 3 &&
    email.includes('@') &&
    phone.length >= 10 &&
    password.length >= 6 &&
    password === confirmPassword;

  const handleRegister = async () => {
    if (!isFormValid) {
      Alert.alert('Error', 'Por favor completa todos los campos correctamente');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/register', {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        referralCodeInput: referralCode.trim().toUpperCase() || undefined,
      });

      const userData = {
        id: response.data.user.id,
        name: response.data.user.name,
        email: response.data.user.email,
        boxId: response.data.user.boxId,
        role: response.data.user.role,
      };

      Alert.alert(
        '🎉 ¡Bienvenido a EntregaX!',
        `Tu casillero es: ${userData.boxId}\n\nGuarda este número, lo necesitarás para recibir tus paquetes.`,
        [
          {
            text: 'Continuar',
            onPress: () => {
              // Navegar a verificación
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
        error.response?.data?.error || error.message || 'No se pudo completar el registro'
      );
    } finally {
      setLoading(false);
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
        <Text style={styles.emoji}>🚚</Text>
        <Text style={styles.logoText}>
          Entrega<Text style={styles.logoX}>X</Text>
        </Text>
        <Text style={styles.subtitle}>Crea tu casillero gratis</Text>
      </View>

      {/* Formulario */}
      <Surface style={styles.formContainer} elevation={4}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.welcomeText}>Registro</Text>
          <Text style={styles.instructionText}>
            Completa tus datos para obtener tu casillero
          </Text>

          {/* Nombre Completo */}
          <TextInput
            label="Nombre completo"
            value={fullName}
            onChangeText={setFullName}
            mode="outlined"
            left={<TextInput.Icon icon="account" />}
            style={styles.input}
            outlineColor="#ddd"
            activeOutlineColor={ORANGE}
          />

          {/* Email */}
          <TextInput
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            left={<TextInput.Icon icon="email" />}
            style={styles.input}
            outlineColor="#ddd"
            activeOutlineColor={ORANGE}
            error={!!emailError}
          />
          {emailError && (
            <HelperText type="error" visible>
              Ingresa un correo válido
            </HelperText>
          )}

          {/* Teléfono */}
          <TextInput
            label="WhatsApp (10 dígitos)"
            value={phone}
            onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
            mode="outlined"
            keyboardType="phone-pad"
            maxLength={10}
            left={<TextInput.Icon icon="whatsapp" />}
            style={styles.input}
            outlineColor="#ddd"
            activeOutlineColor={ORANGE}
            error={!!phoneError}
          />
          {phoneError && (
            <HelperText type="error" visible>
              El teléfono debe tener 10 dígitos
            </HelperText>
          )}

          {/* Contraseña */}
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
            error={!!passwordError}
          />
          {passwordError && (
            <HelperText type="error" visible>
              Mínimo 6 caracteres
            </HelperText>
          )}

          {/* Confirmar Contraseña */}
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
            error={!!confirmError}
          />
          {confirmError && (
            <HelperText type="error" visible>
              Las contraseñas no coinciden
            </HelperText>
          )}

          {/* Divider */}
          <Divider style={styles.divider} />

          {/* Código de Referido (Opcional) */}
          <View style={styles.referralSection}>
            <Text style={styles.referralTitle}>
              💼 ¿Tienes un Asesor?
            </Text>
            <Text style={styles.referralSubtitle}>
              Si alguien te recomendó EntregaX, ingresa su código
            </Text>

            <TextInput
              label="Código de Asesor (Opcional)"
              value={referralCode}
              onChangeText={(text) => {
                setReferralCode(text.toUpperCase());
                if (text.length >= 6) {
                  validateReferralCode(text);
                } else {
                  setCodeValidation(null);
                }
              }}
              mode="outlined"
              placeholder="Ej: ALDO-4921"
              left={<TextInput.Icon icon="ticket-percent" />}
              right={
                validatingCode ? (
                  <TextInput.Icon icon="loading" />
                ) : codeValidation?.valid ? (
                  <TextInput.Icon icon="check-circle" color={GREEN} />
                ) : codeValidation === null ? null : (
                  <TextInput.Icon icon="close-circle" color="red" />
                )
              }
              style={styles.input}
              outlineColor="#ddd"
              activeOutlineColor={ORANGE}
              autoCapitalize="characters"
            />

            {codeValidation?.valid && codeValidation.advisorName && (
              <Chip
                icon="account-check"
                style={styles.advisorChip}
                textStyle={{ color: GREEN }}
              >
                Asesor: {codeValidation.advisorName}
              </Chip>
            )}

            {codeValidation && !codeValidation.valid && (
              <HelperText type="error" visible>
                Código no encontrado
              </HelperText>
            )}
          </View>

          {/* Botón de Registro */}
          <Button
            mode="contained"
            onPress={handleRegister}
            loading={loading}
            disabled={loading || !isFormValid}
            style={[
              styles.registerButton,
              !isFormValid && styles.registerButtonDisabled,
            ]}
            contentStyle={styles.registerButtonContent}
            labelStyle={styles.registerButtonLabel}
          >
            {loading ? 'Creando cuenta...' : 'Crear mi Casillero'}
          </Button>

          {/* Link a Login */}
          <View style={styles.loginLink}>
            <Text style={styles.loginLinkText}>¿Ya tienes cuenta?</Text>
            <Button
              mode="text"
              compact
              onPress={() => navigation.navigate('Login')}
              labelStyle={{ color: ORANGE, fontWeight: 'bold' }}
            >
              Ingresar
            </Button>
          </View>

          {/* Link para clientes existentes */}
          <Divider style={{ marginBottom: 15 }} />
          <Surface style={styles.existingClientCard} elevation={1}>
            <Text style={styles.existingClientTitle}>
              📦 ¿Ya tienes número de cliente?
            </Text>
            <Text style={styles.existingClientSubtitle}>
              Si ya eras cliente de EntregaX antes, activa tu cuenta aquí
            </Text>
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('ExistingClient')}
              style={styles.existingClientButton}
              labelStyle={{ color: ORANGE }}
            >
              Activar cuenta existente
            </Button>
          </Surface>
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
    marginBottom: 8,
    backgroundColor: 'white',
  },
  divider: {
    marginVertical: 15,
  },
  referralSection: {
    marginBottom: 15,
  },
  referralTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 4,
  },
  referralSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  advisorChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#E8F5E9',
  },
  registerButton: {
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: ORANGE,
  },
  registerButtonDisabled: {
    backgroundColor: '#ccc',
  },
  registerButtonContent: {
    paddingVertical: 8,
  },
  registerButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  loginLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 30,
  },
  loginLinkText: {
    color: '#666',
  },
  existingClientCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 30,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  existingClientTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 4,
  },
  existingClientSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  existingClientButton: {
    borderColor: ORANGE,
  },
});
