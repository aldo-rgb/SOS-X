import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { useTranslation } from 'react-i18next';
import SocialAuthButtons from '../components/SocialAuthButtons';
import { setSecure } from '../services/secureStorage';

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
  const { i18n } = useTranslation();
  const rl = i18n.language;
  const RT = {
    title:        rl === 'zh' ? '创建免费账户'   : rl === 'en' ? 'Create your free suite' : 'Crea tu suite gratis',
    heading:      rl === 'zh' ? '注册'            : rl === 'en' ? 'Register'               : 'Registro',
    subheading:   rl === 'zh' ? '填写信息以获取您的地址' : rl === 'en' ? 'Complete your details to get your suite' : 'Completa tus datos para obtener tu suite',
    fullName:     rl === 'zh' ? '姓名'            : rl === 'en' ? 'Full name'              : 'Nombre completo',
    email:        rl === 'zh' ? '电子邮箱'        : rl === 'en' ? 'Email address'          : 'Correo electrónico',
    phone:        rl === 'zh' ? 'WhatsApp (10位)' : rl === 'en' ? 'WhatsApp (10 digits)'   : 'WhatsApp (10 dígitos)',
    password:     rl === 'zh' ? '密码'            : rl === 'en' ? 'Password'               : 'Contraseña',
    confirmPw:    rl === 'zh' ? '确认密码'        : rl === 'en' ? 'Confirm password'       : 'Confirmar contraseña',
    referralQ:    rl === 'zh' ? '有推荐码吗？'    : rl === 'en' ? 'Have a referral code?'  : '¿Tienes un código de referido?',
    referralSub:  rl === 'zh' ? '输入推荐您的朋友或顾问的代码' : rl === 'en' ? 'If a friend or advisor referred you, enter their code' : 'Si un amigo o asesor te recomendó, ingresa su código',
    referralLabel:rl === 'zh' ? '推荐码（选填）'  : rl === 'en' ? 'Referral Code (Optional)' : 'Código de Referido (Opcional)',
    advisor:      rl === 'zh' ? '顾问：'          : rl === 'en' ? 'Advisor:'               : 'Asesor:',
    createBtn:    rl === 'zh' ? '创建我的地址'    : rl === 'en' ? 'Create my Suite'        : 'Crear mi Suite',
    creating:     rl === 'zh' ? '创建中...'       : rl === 'en' ? 'Creating...'            : 'Creando cuenta...',
    hasAccount:   rl === 'zh' ? '已有账户？'      : rl === 'en' ? 'Already have an account?' : '¿Ya tienes cuenta?',
    signIn:       rl === 'zh' ? '登录'            : rl === 'en' ? 'Sign In'                : 'Ingresar',
    existingQ:    rl === 'zh' ? '📦 已有客户编号？' : rl === 'en' ? '📦 Already have a client number?' : '📦 ¿Ya tienes número de cliente?',
    existingSub:  rl === 'zh' ? '如果您是现有客户，请在此激活账户' : rl === 'en' ? 'If you\'re an existing EntregaX client, activate your account here' : 'Si ya eres cliente de EntregaX antes, activa tu cuenta aquí',
    activateBtn:  rl === 'zh' ? '激活现有账户'    : rl === 'en' ? 'Activate existing account' : 'Activar cuenta existente',
    errFill:      rl === 'zh' ? '请正确填写所有字段' : rl === 'en' ? 'Please fill all fields correctly' : 'Por favor completa todos los campos correctamente',
    errMinPw:     rl === 'zh' ? '最少6位字符'     : rl === 'en' ? 'Minimum 6 characters'   : 'Mínimo 6 caracteres',
    errPwMatch:   rl === 'zh' ? '密码不匹配'      : rl === 'en' ? 'Passwords do not match'  : 'Las contraseñas no coinciden',
    errEmail:     rl === 'zh' ? '请输入有效邮箱'  : rl === 'en' ? 'Enter a valid email'     : 'Ingresa un correo válido',
    errPhone:     rl === 'zh' ? '电话需10位数字'  : rl === 'en' ? 'Phone must be 10 digits'  : 'El teléfono debe tener 10 dígitos',
    errCodeNotFound: rl === 'zh' ? '未找到该代码' : rl === 'en' ? 'Code not found'          : 'Código no encontrado',
    welcomeTitle: rl === 'zh' ? '🎉 欢迎加入 EntregaX！' : rl === 'en' ? '🎉 Welcome to EntregaX!' : '🎉 ¡Bienvenido a EntregaX!',
    welcomeBody:  (suite: string) => rl === 'zh' ? `您的地址编号：${suite}\n\n请保存此号码，接收包裹时需要用到。` : rl === 'en' ? `Your suite is: ${suite}\n\nSave this number, you'll need it to receive packages.` : `Tu suite es: ${suite}\n\nGuarda este número, lo necesitarás para recibir tus paquetes.`,
    continue:     rl === 'zh' ? '继续'            : rl === 'en' ? 'Continue'               : 'Continuar',
  };
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+52');
  const [showPrefixPicker, setShowPrefixPicker] = useState(false);
  const LADA_OPTIONS = [
    { flag: '🇲🇽', code: '+52', label: 'México' },
    { flag: '🇺🇸', code: '+1',  label: 'USA' },
    { flag: '🇨🇳', code: '+86', label: '中国' },
  ];
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
      const response = await api.get(`/api/referral/validate/${code.toUpperCase()}`);
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
      Alert.alert('Error', RT.errFill);
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/auth/register', {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: `${phonePrefix}${phone.trim()}`,
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
        RT.welcomeTitle,
        RT.welcomeBody(userData.boxId),
        [
          {
            text: RT.continue,
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

  const handleSocialSuccess = async (user: any, access: any) => {
    const userData = {
      id: user.id,
      name: user.name || user.full_name,
      email: user.email,
      boxId: user.boxId || user.box_id,
      role: user.role,
      phone: user.phone,
      authProvider: user.authProvider || null,
      isVerified: user.isVerified,
      verificationStatus: user.verificationStatus,
    };
    const token = access.token;
    try {
      await setSecure('token', token);
      await setSecure('user', JSON.stringify(userData));
    } catch { /* ignore */ }
    navigation.replace('Home', { user: userData, token });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>{RT.title}</Text>
      </View>

      {/* Formulario */}
      <Surface style={styles.formContainer} elevation={4}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.welcomeText}>{RT.heading}</Text>
          <Text style={styles.instructionText}>{RT.subheading}</Text>

          {/* Nombre Completo */}
          <TextInput
            label={RT.fullName}
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
            label={RT.email}
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
              {RT.errEmail}
            </HelperText>
          )}

          {/* Teléfono con selector de lada */}
          <View style={[styles.phoneRow, phoneError ? { borderColor: 'red' } : {}]}>
            <TouchableOpacity
              style={styles.ladaBtn}
              onPress={() => setShowPrefixPicker(!showPrefixPicker)}
            >
              <Text style={styles.ladaFlag}>
                {LADA_OPTIONS.find(o => o.code === phonePrefix)?.flag || '🇲🇽'}
              </Text>
              <Text style={styles.ladaCode}>{phonePrefix}</Text>
              <Ionicons name="chevron-down" size={12} color="#666" />
            </TouchableOpacity>
            <TextInput
              label={rl === 'zh' ? '电话' : rl === 'en' ? 'Phone' : 'Teléfono'}
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
              mode="outlined"
              keyboardType="phone-pad"
              maxLength={12}
              left={<TextInput.Icon icon="phone" />}
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              outlineColor={phoneError ? 'red' : '#ddd'}
              activeOutlineColor={ORANGE}
            />
          </View>
          {showPrefixPicker && (
            <View style={styles.ladaPicker}>
              {LADA_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.code}
                  style={[styles.ladaOption, phonePrefix === opt.code && { backgroundColor: ORANGE + '18' }]}
                  onPress={() => { setPhonePrefix(opt.code); setShowPrefixPicker(false); }}
                >
                  <Text style={styles.ladaFlag}>{opt.flag}</Text>
                  <Text style={styles.ladaOptionLabel}>{opt.label}</Text>
                  <Text style={styles.ladaCode}>{opt.code}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {phoneError && (
            <HelperText type="error" visible>
              {RT.errPhone}
            </HelperText>
          )}

          {/* Contraseña */}
          <TextInput
            label={RT.password}
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
              {RT.errMinPw}
            </HelperText>
          )}

          {/* Confirmar Contraseña */}
          <TextInput
            label={RT.confirmPw}
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
              {RT.errPwMatch}
            </HelperText>
          )}

          {/* Divider */}
          <Divider style={styles.divider} />

          {/* Código de Referido (Opcional) */}
          <View style={styles.referralSection}>
            <Text style={styles.referralTitle}>{RT.referralQ}</Text>
            <Text style={styles.referralSubtitle}>{RT.referralSub}</Text>

            <TextInput
              label={RT.referralLabel}
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
              placeholder="Ej: JUAN458"
              left={<TextInput.Icon icon="account-group-outline" />}
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
                {RT.advisor} {codeValidation.advisorName}
              </Chip>
            )}

            {codeValidation && !codeValidation.valid && (
              <HelperText type="error" visible>
                {RT.errCodeNotFound}
              </HelperText>
            )}
          </View>

          {/* Registro con Google / Apple */}
          <SocialAuthButtons
            onSuccess={({ user, access }: { user: any; access: any }) => handleSocialSuccess(user, access)}
            onError={(msg: string) => Alert.alert('Error', msg)}
            onNotRegistered={undefined}
            disabled={loading}
          />

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
            {loading ? RT.creating : RT.createBtn}
          </Button>

          {/* Link a Login */}
          <View style={styles.loginLink}>
            <Text style={styles.loginLinkText}>{RT.hasAccount}</Text>
            <Button
              mode="text"
              compact
              onPress={() => navigation.navigate('Login')}
              labelStyle={{ color: ORANGE, fontWeight: 'bold' }}
            >
              {RT.signIn}
            </Button>
          </View>

          {/* Link para clientes existentes */}
          <Divider style={{ marginBottom: 15 }} />
          <Surface style={styles.existingClientCard} elevation={1}>
            <Text style={styles.existingClientTitle}>{RT.existingQ}</Text>
            <Text style={styles.existingClientSubtitle}>{RT.existingSub}</Text>
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('ExistingClient')}
              style={styles.existingClientButton}
              labelStyle={{ color: ORANGE }}
            >
              {RT.activateBtn}
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
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    top: 52,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  logoImage: {
    width: 200,
    height: 70,
    marginBottom: 6,
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
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    borderRadius: 4,
  },
  ladaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    backgroundColor: '#fafafa',
    height: 56,
  },
  ladaFlag: { fontSize: 20 },
  ladaCode: { fontSize: 13, fontWeight: '600', color: '#333' },
  ladaPicker: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
    overflow: 'hidden',
  },
  ladaOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ladaOptionLabel: { flex: 1, fontSize: 14, color: '#333' },
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
