import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Surface,
  useTheme,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { loginApi, api } from '../services/api';
import { EMPLOYEE_ROLES } from '../../App';

// Colores de marca
const ORANGE = '#F05A28';
const BLACK = '#111111';

type RootStackParamList = {
  Login: undefined;
  ChangePassword: { user: any; token: string; currentPassword: string };
  Verification: { user: any; token: string };
  Home: { user: any; token: string };
  EmployeeHome: { user: any; token: string };
};

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      
      // Verificar si debe cambiar contraseña
      if (response.access.mustChangePassword) {
        navigation.replace('ChangePassword', {
          user: userData,
          token,
          currentPassword: password,
        });
      } else {
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
            console.log('Error verificando estado:', verifyError);
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
        <Text style={styles.logoText}>
          Entrega<Text style={styles.logoX}>X</Text>
        </Text>
        <Text style={styles.subtitle}>Tu casillero inteligente</Text>
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
          onPress={() => Alert.alert('Próximamente', 'Esta función estará disponible pronto')}
          style={styles.forgotButton}
          labelStyle={{ color: ORANGE }}
        >
          ¿Olvidaste tu contraseña?
        </Button>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BLACK,
  },
  header: {
    flex: 0.35,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: 10,
    borderRadius: 16,
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
