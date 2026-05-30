import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Surface,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { changePasswordApi, api } from '../services/api';

// Colores de marca
const ORANGE = '#F05A28';
const BLACK = '#111111';

type RootStackParamList = {
  Login: undefined;
  ChangePassword: { user: any; token: string; currentPassword: string };
  Verification: { user: any; token: string };
  EmployeeOnboarding: { user: any; token: string };
  EmployeeHome: { user: any; token: string };
  DriverHome: { user: any; token: string };
  AdvisorDashboard: { user: any; token: string };
  Home: { user: any; token: string };
};

type ChangePasswordScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ChangePassword'>;
  route: RouteProp<RootStackParamList, 'ChangePassword'>;
};

export default function ChangePasswordScreen({ navigation, route }: ChangePasswordScreenProps) {
  const { user, token, currentPassword } = route.params;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChangePassword = async () => {
    // Validaciones
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (newPassword === 'Entregax123') {
      Alert.alert('Error', 'No puedes usar la contraseña por defecto. Elige una contraseña diferente.');
      return;
    }

    setLoading(true);
    try {
      await changePasswordApi(token, currentPassword, newPassword);

      // ─────────────────────────────────────────────────────────────
      // Routing post-cambio de contraseña.
      // Debe replicar la lógica del LoginScreen: el flujo depende del
      // rol del usuario. Sólo los clientes pasan por el flujo de
      // verificación de identidad (/api/verify/status). Si el usuario
      // ya está verificado, va directo a Home sin re-verificar.
      // ─────────────────────────────────────────────────────────────

      const role = user.role;

      // Repartidor / monitoreo → DriverHome
      if (role === 'repartidor' || role === 'monitoreo') {
        Alert.alert('✅ Contraseña Actualizada', 'Tu contraseña ha sido cambiada exitosamente.', [
          { text: 'Continuar', onPress: () => navigation.replace('DriverHome' as any, { user, token }) },
        ]);
        return;
      }

      // Asesores → AdvisorDashboard
      const ADVISOR_ROLES = ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'];
      if (ADVISOR_ROLES.includes(role)) {
        Alert.alert('✅ Contraseña Actualizada', 'Tu contraseña ha sido cambiada exitosamente.', [
          { text: 'Continuar', onPress: () => navigation.replace('AdvisorDashboard' as any, { user, token }) },
        ]);
        return;
      }

      // Empleados (incluye admin / super_admin / director y staff operativo)
      // Sólo roles que requieren onboarding (alta de RR. HH.) pasan por ese flujo.
      const ONBOARDING_ROLES = ['warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager'];
      const EMPLOYEE_ADMIN_ROLES = ['admin', 'super_admin', 'director'];

      if (ONBOARDING_ROLES.includes(role)) {
        try {
          const onboardingResponse = await api.get('/api/hr/onboarding-status', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!onboardingResponse.data.isOnboarded) {
            Alert.alert('✅ Contraseña Actualizada', 'Ahora necesitas completar tu alta como empleado.', [
              { text: 'Continuar', onPress: () => navigation.replace('EmployeeOnboarding' as any, { user, token }) },
            ]);
            return;
          }
        } catch {
          Alert.alert('✅ Contraseña Actualizada', 'Ahora necesitas completar tu alta como empleado.', [
            { text: 'Continuar', onPress: () => navigation.replace('EmployeeOnboarding' as any, { user, token }) },
          ]);
          return;
        }
        Alert.alert('✅ Contraseña Actualizada', 'Tu contraseña ha sido cambiada exitosamente.', [
          { text: 'Continuar', onPress: () => navigation.replace('EmployeeHome' as any, { user, token }) },
        ]);
        return;
      }

      if (EMPLOYEE_ADMIN_ROLES.includes(role)) {
        Alert.alert('✅ Contraseña Actualizada', 'Tu contraseña ha sido cambiada exitosamente.', [
          { text: 'Continuar', onPress: () => navigation.replace('EmployeeHome' as any, { user, token }) },
        ]);
        return;
      }

      // Sólo clientes: revisar verificación de identidad. Si ya está
      // verificado, NO pedimos repetir el proceso — sólo confirmamos
      // el cambio de contraseña y vamos a Home.
      let needsVerification = false;
      try {
        const statusResponse = await api.get('/api/verify/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        needsVerification = !statusResponse.data.isVerified;
      } catch {
        // Fallback al dato traído por login (evita falsos positivos al
        // re-verificar cuando el API está intermitente).
        needsVerification = user.isVerified !== true;
      }

      if (needsVerification) {
        Alert.alert('✅ Contraseña Actualizada', 'Ahora necesitas verificar tu identidad para continuar.', [
          { text: 'Continuar', onPress: () => navigation.replace('Verification', { user, token }) },
        ]);
        return;
      }

      Alert.alert('✅ Contraseña Actualizada', 'Tu contraseña ha sido cambiada exitosamente.', [
        { text: 'Continuar', onPress: () => navigation.replace('Home', { user, token }) },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo cambiar la contraseña');
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
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>
            Entrega<Text style={styles.logoX}>X</Text>
          </Text>
          <Text style={styles.subtitle}>Cambio de Contraseña</Text>
        </View>

        {/* Formulario */}
        <Surface style={styles.formContainer} elevation={4}>
          <Text style={styles.welcomeText}>¡Hola, {user.name?.split(' ')[0]}!</Text>
          <Text style={styles.instructionText}>
            Por seguridad, debes cambiar tu contraseña temporal antes de continuar.
          </Text>

          <View style={styles.alertBox}>
            <Text style={styles.alertIcon}>⚠️</Text>
            <Text style={styles.alertText}>
              No puedes usar "Entregax123" como nueva contraseña
            </Text>
          </View>

          <TextInput
            label="Nueva contraseña"
            value={newPassword}
            onChangeText={setNewPassword}
            mode="outlined"
            secureTextEntry={!showNewPassword}
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showNewPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowNewPassword(!showNewPassword)}
              />
            }
            style={styles.input}
            outlineColor="#ccc"
            activeOutlineColor={ORANGE}
          />

          <TextInput
            label="Confirmar nueva contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            mode="outlined"
            secureTextEntry={!showConfirmPassword}
            left={<TextInput.Icon icon="lock-check" />}
            right={
              <TextInput.Icon
                icon={showConfirmPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              />
            }
            style={styles.input}
            outlineColor="#ccc"
            activeOutlineColor={ORANGE}
          />

          <Text style={styles.helpText}>
            • Mínimo 6 caracteres{'\n'}
            • Diferente a "Entregax123"
          </Text>

          <Button
            mode="contained"
            onPress={handleChangePassword}
            loading={loading}
            disabled={loading}
            style={styles.button}
            labelStyle={styles.buttonLabel}
            buttonColor={ORANGE}
          >
            {loading ? 'Guardando...' : 'Cambiar Contraseña'}
          </Button>
        </Surface>

        {/* Info del casillero */}
        <View style={styles.boxInfo}>
          <Text style={styles.boxLabel}>Tu suite</Text>
          <Text style={styles.boxId}>{user.boxId}</Text>
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
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: 10,
    borderRadius: 16,
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
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 5,
  },
  formContainer: {
    borderRadius: 20,
    padding: 24,
    backgroundColor: 'white',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BLACK,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: ORANGE,
  },
  alertIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    fontWeight: '500',
  },
  input: {
    marginBottom: 16,
    backgroundColor: 'white',
  },
  helpText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 20,
    lineHeight: 18,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 6,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  boxInfo: {
    alignItems: 'center',
    marginTop: 24,
  },
  boxLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  boxId: {
    color: ORANGE,
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
});
