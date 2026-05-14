import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Surface,
  useTheme,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { loginApi, api, API_URL } from '../services/api';
import { EMPLOYEE_ROLES } from '../constants/roles';
import { setSecure } from '../services/secureStorage';
import {
  checkBiometricSupport,
  isBiometricEnabled,
  setBiometricEnabled,
} from '../services/biometricAuth';
import SocialAuthButtons from '../components/SocialAuthButtons';

// Colores de marca
const ORANGE = '#F05A28';
const BLACK = '#111111';

type RootStackParamList = {
  Login: undefined;
  ChangePassword: { user: any; token: string; currentPassword: string };
  Verification: { user: any; token: string };
  Home: { user: any; token: string };
  EmployeeHome: { user: any; token: string };
  DriverHome: { user: any; token: string };
  AdvisorDashboard: { user: any; token: string };
};

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password modal
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const openForgot = () => {
    setForgotEmail(email.trim());
    setForgotSent(false);
    setForgotError('');
    setForgotOpen(true);
  };
  const closeForgot = () => {
    if (forgotSubmitting) return;
    setForgotOpen(false);
  };
  const handleForgotSubmit = async () => {
    setForgotError('');
    const e = forgotEmail.trim().toLowerCase();
    if (!e || !e.includes('@')) { setForgotError('Ingresa un email válido'); return; }
    setForgotSubmitting(true);
    try {
      // El backend siempre responde 200 (no filtrar enumeración).
      // Mostramos el mismo mensaje "revisa tu correo" pase lo que pase.
      const resp = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setForgotError(data?.error || 'No se pudo enviar el correo. Intenta de nuevo.');
        return;
      }
      setForgotSent(true);
    } catch (err: any) {
      setForgotError(err?.message || 'Error de red');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Por favor ingresa tu correo y contraseña');
      return;
    }

    setLoading(true);
    try {
      const response = await loginApi(email.trim().toLowerCase(), password);
      
      const userData = {
        id: response.user.id,
        name: response.user.name || response.user.full_name,
        email: response.user.email,
        boxId: response.user.boxId || response.user.box_id,
        role: response.user.role,
        phone: response.user.phone,
        isVerified: response.user.isVerified,
        verificationStatus: response.user.verificationStatus,
      };
      
      const token = response.access.token;

      // Persistir el JWT en almacenamiento seguro nativo (Keychain/Keystore).
      // Esto permite que pantallas como Wallet/Saldo a Favor/Referidos lo lean
      // sin necesidad de pasarlo por route.params en cada navegación.
      try {
        await setSecure('token', token);
        await setSecure('user', JSON.stringify(userData));
      } catch (e) {
        // No bloqueamos el login si SecureStore falla; el token sigue en memoria.
        if (__DEV__) console.warn('[Login] No se pudo persistir el token en SecureStore');
      }

      // Si el dispositivo tiene Face ID / Touch ID disponible y el usuario no
      // lo ha habilitado todavía, ofrecemos activarlo una sola vez.
      try {
        const already = await isBiometricEnabled();
        if (!already) {
          const support = await checkBiometricSupport();
          if (support.available && support.enrolled) {
            const labelMap = support.faceId
              ? 'Face ID'
              : support.touchId
              ? Platform.OS === 'ios' ? 'Touch ID' : 'huella'
              : 'biometría';
            Alert.alert(
              `Activar ${labelMap}`,
              `¿Quieres usar ${labelMap} para entrar más rápido la próxima vez?`,
              [
                { text: 'Ahora no', style: 'cancel', onPress: () => setBiometricEnabled(false) },
                { text: 'Activar', onPress: () => setBiometricEnabled(true) },
              ],
              { cancelable: false }
            );
          }
        }
      } catch {
        // ignore — no bloqueamos el flujo de login por esto
      }

      // Verificar si debe cambiar contraseña
      if (response.access.mustChangePassword) {
        navigation.replace('ChangePassword', {
          user: userData,
          token,
          currentPassword: password,
        });
      } else {
        if (userData.role === 'repartidor' || userData.role === 'monitoreo') {
          navigation.replace('DriverHome', {
            user: userData,
            token,
          });
          return;
        }

        // Verificar si es empleado (incluyendo asesores) - van al EmployeeHomeScreen
        if (EMPLOYEE_ROLES.includes(userData.role)) {
          navigation.replace('EmployeeHome', {
            user: userData,
            token,
          });
          return;
        }

        // Verificar si necesita verificación de identidad (solo para clientes)
        if (userData.role === 'client') {
          try {
            const verifyResponse = await api.get('/api/verify/status', {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!verifyResponse.data.isVerified) {
              navigation.replace('Verification', { user: userData, token });
              return;
            }
          } catch (verifyError) {
            // Si falla, continuar al Home
            if (__DEV__) console.warn('Error verificando estado de cuenta');
          }
        }
        
        // Navegar al Home (para clientes)
        navigation.replace('Home', {
          user: userData,
          token,
        });
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Maneja el éxito de Google / Apple Sign-In.
   * Replica la lógica post-login de handleLogin sin tocar password.
   */
  const handleSocialLoginSuccess = async (user: any, access: any) => {
    const userData = {
      id: user.id,
      name: user.name || user.full_name,
      email: user.email,
      boxId: user.boxId || user.box_id,
      role: user.role,
      phone: user.phone,
      isVerified: user.isVerified,
      verificationStatus: user.verificationStatus,
    };
    const token = access.token;
    try {
      await setSecure('token', token);
      await setSecure('user', JSON.stringify(userData));
    } catch { /* ignore */ }

    if (userData.role === 'repartidor' || userData.role === 'monitoreo') {
      navigation.replace('DriverHome', { user: userData, token });
      return;
    }
    if (EMPLOYEE_ROLES.includes(userData.role)) {
      navigation.replace('EmployeeHome', { user: userData, token });
      return;
    }
    if (userData.role === 'client') {
      try {
        const verifyResponse = await api.get('/api/verify/status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!verifyResponse.data.isVerified) {
          navigation.replace('Verification', { user: userData, token });
          return;
        }
      } catch { /* fall through to Home */ }
    }
    navigation.replace('Home', { user: userData, token });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      
      {/* Header con logo */}
      <View style={styles.header}>
        <Image 
          source={require('../../assets/logo.png')} 
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>Tu suite inteligente</Text>
      </View>

      {/* Formulario */}
      <Surface style={styles.formContainer} elevation={4}>
        <Text style={styles.welcomeText}>Bienvenido</Text>
        <Text style={styles.instructionText}>
          Ingresa con tu correo registrado
        </Text>

        <TextInput
          label="Correo electrónico"
          value={email}
          onChangeText={setEmail}
          mode="outlined"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          left={<TextInput.Icon icon="email" />}
          style={styles.input}
          outlineColor="#ddd"
          activeOutlineColor={ORANGE}
        />

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

        <Button
          mode="contained"
          onPress={handleLogin}
          loading={loading}
          disabled={loading}
          style={styles.loginButton}
          contentStyle={styles.loginButtonContent}
          labelStyle={styles.loginButtonLabel}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </Button>

        <Button
          mode="text"
          onPress={openForgot}
          style={styles.forgotButton}
          labelStyle={{ color: ORANGE }}
        >
          ¿Olvidaste tu contraseña?
        </Button>

        {/* Sign in con Google / Apple (feature-flagged) */}
        <SocialAuthButtons
          onSuccess={({ user, access }: { user: any; access: any }) => {
            handleSocialLoginSuccess(user, access);
          }}
          onError={(msg: string) => Alert.alert('Error', msg)}
          onNotRegistered={(prefill: { email: string; fullName: string; provider: 'google' | 'apple' }) => {
            (navigation as any).navigate('Register', {
              prefillEmail: prefill.email,
              prefillName: prefill.fullName,
              prefillProvider: prefill.provider,
            });
          }}
          disabled={loading}
        />
      </Surface>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>¿No tienes cuenta?</Text>
        <Button
          mode="text"
          compact
          onPress={() => navigation.navigate('Register' as never)}
          labelStyle={{ color: ORANGE, fontWeight: 'bold' }}
        >
          Regístrate
        </Button>
      </View>

      {/* Modal: ¿Olvidaste tu contraseña? */}
      <Modal
        visible={forgotOpen}
        transparent
        animationType="fade"
        onRequestClose={closeForgot}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {forgotSent ? 'Revisa tu correo' : '¿Olvidaste tu contraseña?'}
            </Text>
            {forgotSent ? (
              <Text style={styles.modalBody}>
                Te enviamos un enlace a {forgotEmail} para restablecer
                tu contraseña. Es válido por 1 hora. Revisa también
                tu carpeta de spam.
              </Text>
            ) : (
              <>
                <Text style={styles.modalBody}>
                  Ingresa tu correo registrado y te mandaremos un link
                  para restablecer tu contraseña.
                </Text>
                <TextInput
                  mode="outlined"
                  label="Correo electrónico"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  disabled={forgotSubmitting}
                  style={{ marginTop: 12 }}
                  outlineColor="#ccc"
                  activeOutlineColor={ORANGE}
                />
                {!!forgotError && (
                  <Text style={styles.modalError}>{forgotError}</Text>
                )}
              </>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={closeForgot} disabled={forgotSubmitting}>
                <Text style={styles.modalCancel}>{forgotSent ? 'Cerrar' : 'Cancelar'}</Text>
              </TouchableOpacity>
              {!forgotSent && (
                <TouchableOpacity
                  style={[styles.modalSubmit, forgotSubmitting && { opacity: 0.6 }]}
                  onPress={handleForgotSubmit}
                  disabled={forgotSubmitting}
                >
                  {forgotSubmitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.modalSubmitText}>Enviar link</Text>}
                </TouchableOpacity>
              )}
            </View>
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
  header: {
    flex: 0.45,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 15,
  },
  logoImage: {
    width: 207,
    height: 207,
    marginBottom: 8,
  },
  logoText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: 'white',
  },
  logoX: {
    color: ORANGE,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginTop: 5,
  },
  formContainer: {
    flex: 0.55,
    backgroundColor: 'white',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 5,
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 25,
  },
  input: {
    marginBottom: 16,
    backgroundColor: 'white',
  },
  loginButton: {
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: ORANGE,
  },
  loginButtonContent: {
    paddingVertical: 8,
  },
  loginButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  forgotButton: {
    marginTop: 15,
  },
  // ─── Modal "¿Olvidaste tu contraseña?" ─────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  modalError: {
    color: '#D32F2F',
    fontSize: 13,
    marginTop: 8,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
  },
  modalCancel: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalSubmit: {
    backgroundColor: ORANGE,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 110,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  footer: {
    flex: 0.1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  footerText: {
    color: '#666',
  },
});
