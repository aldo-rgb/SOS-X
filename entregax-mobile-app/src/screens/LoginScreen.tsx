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
import { Ionicons } from '@expo/vector-icons';

// Colores de marca
const ORANGE = '#F05A28';
const BLACK = '#111111';

type RootStackParamList = {
  Login: undefined;
  GuestTracking: { initialLang?: 'es' | 'en' | 'zh' };
  ChangePassword: { user: any; token: string; currentPassword: string };
  Verification: { user: any; token: string };
  Home: { user: any; token: string };
  EmployeeHome: { user: any; token: string };
  DriverHome: { user: any; token: string };
  AdvisorDashboard: { user: any; token: string };
};

type Lang = 'es' | 'en' | 'zh';
const LANG_OPTIONS: { code: Lang; flag: string }[] = [
  { code: 'es', flag: '🇲🇽' },
  { code: 'en', flag: '🇺🇸' },
  { code: 'zh', flag: '🇨🇳' },
];

const LOGIN_T = {
  es: {
    welcome: 'Bienvenido',
    subtitle: 'Tu suite inteligente',
    instruction: 'Ingresa con tu correo registrado',
    emailLabel: 'Correo electrónico',
    passwordLabel: 'Contraseña',
    loginBtn: 'Ingresar',
    loggingIn: 'Ingresando...',
    forgotPw: '¿Olvidaste tu contraseña?',
    continueWith: 'o continúa con',
    trackBtn: 'Rastrear un paquete',
    noAccount: '¿No tienes cuenta?',
    register: 'Regístrate',
    forgotTitle: '¿Olvidaste tu contraseña?',
    forgotDone: 'Revisa tu correo',
    forgotBody: 'Ingresa tu correo registrado y te mandaremos un enlace para restablecer tu contraseña.',
    forgotSentBody: 'Te enviamos un enlace a {email} para restablecer tu contraseña. Es válido por 1 hora. Revisa también tu carpeta de spam.',
    forgotEmailLabel: 'Tu correo registrado',
    forgotSubmit: 'Enviar enlace',
    forgotClose: 'Cerrar',
  },
  en: {
    welcome: 'Welcome',
    subtitle: 'Your smart suite',
    instruction: 'Sign in with your registered email',
    emailLabel: 'Email address',
    passwordLabel: 'Password',
    loginBtn: 'Sign In',
    loggingIn: 'Signing in...',
    forgotPw: 'Forgot your password?',
    continueWith: 'or continue with',
    trackBtn: 'Track a package',
    noAccount: 'No account?',
    register: 'Sign up',
    forgotTitle: 'Forgot your password?',
    forgotDone: 'Check your email',
    forgotBody: 'Enter your registered email and we\'ll send you a reset link.',
    forgotSentBody: 'We sent a link to {email} to reset your password. Valid for 1 hour. Check your spam folder too.',
    forgotEmailLabel: 'Your registered email',
    forgotSubmit: 'Send link',
    forgotClose: 'Close',
  },
  zh: {
    welcome: '欢迎',
    subtitle: '您的智能平台',
    instruction: '使用注册邮箱登录',
    emailLabel: '电子邮箱',
    passwordLabel: '密码',
    loginBtn: '登录',
    loggingIn: '登录中...',
    forgotPw: '忘记密码？',
    continueWith: '或通过以下方式登录',
    trackBtn: '查询包裹',
    noAccount: '没有账户？',
    register: '立即注册',
    forgotTitle: '忘记密码？',
    forgotDone: '请查收邮件',
    forgotBody: '输入您的注册邮箱，我们将发送重置链接。',
    forgotSentBody: '我们已向 {email} 发送了密码重置链接，有效期1小时，请也检查垃圾邮件文件夹。',
    forgotEmailLabel: '您的注册邮箱',
    forgotSubmit: '发送链接',
    forgotClose: '关闭',
  },
} as const;

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lang, setLang] = useState<Lang>('es');
  const [langOpen, setLangOpen] = useState(false);
  const t = LOGIN_T[lang];

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
        isEmployeeOnboarded: response.user.isEmployeeOnboarded === true || response.user.is_employee_onboarded === true,
        // 📋 Aceptación de aviso de privacidad. Sin esto, el panel de asesor
        // vuelve a pedir "Aceptar Términos" en cada inicio de sesión.
        privacyAcceptedAt:
          response.user.privacyAcceptedAt ||
          response.user.privacy_accepted_at ||
          null,
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
          navigation.replace('EmployeeHome', {
            user: userData,
            token,
          });
          return;
        }

        // Asesores van directo a su panel
        const ADVISOR_ROLES = ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'];
        if (ADVISOR_ROLES.includes(userData.role)) {
          navigation.replace('AdvisorDashboard', { user: userData, token });
          return;
        }

        // Verificar si es empleado - van al EmployeeHomeScreen
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
      isEmployeeOnboarded: user.isEmployeeOnboarded === true || user.is_employee_onboarded === true,
    };
    const token = access.token;
    try {
      await setSecure('token', token);
      await setSecure('user', JSON.stringify(userData));
    } catch { /* ignore */ }

    if (userData.role === 'repartidor' || userData.role === 'monitoreo') {
      navigation.replace('EmployeeHome', { user: userData, token });
      return;
    }
    const ADVISOR_ROLES_2 = ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'];
    if (ADVISOR_ROLES_2.includes(userData.role)) {
      navigation.replace('AdvisorDashboard', { user: userData, token });
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
        <Text style={styles.subtitle}>{t.subtitle}</Text>
      </View>

      {/* Cajito asomándose sobre la tarjeta */}
      <View style={styles.cajitoWrapper} pointerEvents="none">
        <Image
          source={require('../../assets/cajito-blanco.png')}
          style={styles.cajitoImg}
          resizeMode="contain"
        />
      </View>

      {/* Formulario */}
      <Surface style={styles.formContainer} elevation={4}>
        <Text style={styles.welcomeText}>{t.welcome}</Text>
        <Text style={styles.instructionText}>{t.instruction}</Text>

        <TextInput
          label={t.emailLabel}
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
          label={t.passwordLabel}
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
          {loading ? t.loggingIn : t.loginBtn}
        </Button>

        <Button
          mode="text"
          onPress={openForgot}
          style={styles.forgotButton}
          labelStyle={{ color: ORANGE }}
        >
          {t.forgotPw}
        </Button>

        {/* Sign in con Google / Apple */}
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

        {/* Botón de rastreo guest */}
        <TouchableOpacity
          style={styles.trackBtn}
          onPress={() => (navigation as any).navigate('GuestTracking', { initialLang: lang })}
        >
          <Ionicons name="search" size={16} color={ORANGE} />
          <Text style={styles.trackBtnText}>{t.trackBtn}</Text>
          <Ionicons name="chevron-forward" size={14} color={ORANGE} />
        </TouchableOpacity>

        {/* Selector de idioma */}
        <View style={styles.langRow}>
          {LANG_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.code}
              style={[styles.langPill, lang === opt.code && styles.langPillActive]}
              onPress={() => setLang(opt.code)}
            >
              <Text style={styles.langFlag}>{opt.flag}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Surface>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>{t.noAccount}</Text>
        <Button
          mode="text"
          compact
          onPress={() => navigation.navigate('Register' as never)}
          labelStyle={{ color: ORANGE, fontWeight: 'bold' }}
        >
          {t.register}
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
              {forgotSent ? t.forgotDone : t.forgotTitle}
            </Text>
            {forgotSent ? (
              <Text style={styles.modalBody}>
                {t.forgotSentBody.replace('{email}', forgotEmail)}
              </Text>
            ) : (
              <>
                <Text style={styles.modalBody}>{t.forgotBody}</Text>
                <TextInput
                  mode="outlined"
                  label={t.forgotEmailLabel}
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
                <Text style={styles.modalCancel}>{t.forgotClose}</Text>
              </TouchableOpacity>
              {!forgotSent && (
                <TouchableOpacity
                  style={[styles.modalSubmit, forgotSubmitting && { opacity: 0.6 }]}
                  onPress={handleForgotSubmit}
                  disabled={forgotSubmitting}
                >
                  {forgotSubmitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.modalSubmitText}>{t.forgotSubmit}</Text>}
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
    flex: 0.28,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FFF5EE',
    borderWidth: 1.5,
    borderColor: `${ORANGE}66`,
  },
  trackBtnText: {
    color: ORANGE,
    fontWeight: '700',
    fontSize: 14,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
    paddingBottom: 4,
  },
  langPill: {
    padding: 7,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
  },
  langPillActive: {
    backgroundColor: '#FFF0E8',
    borderWidth: 1.5,
    borderColor: ORANGE,
  },
  langFlag: { fontSize: 20 },
  logoImage: {
    width: 150,
    height: 150,
    marginBottom: 4,
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
    color: 'rgba(255,255,255,0.80)',
    marginTop: 5,
  },
  cajitoWrapper: {
    position: 'absolute',
    right: 24,
    bottom: '28%',
    zIndex: 10,
  },
  cajitoImg: {
    width: 88,
    height: 88,
    opacity: 0.92,
  },
  formContainer: {
    flex: 0.72,
    backgroundColor: 'white',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
    backgroundColor: 'white',
  },
  loginButton: {
    marginTop: 6,
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
    marginTop: 6,
    marginBottom: 4,
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
    paddingBottom: 16,
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
