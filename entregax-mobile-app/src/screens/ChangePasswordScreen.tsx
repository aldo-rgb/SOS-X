import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Alert,
  ScrollView,
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
      
      // Roles de empleados que necesitan onboarding (INE, fotos, tallas, etc.)
      const employeeRoles = ['repartidor', 'warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager'];
      const isEmployee = employeeRoles.includes(user.role);
      
      // Si es empleado, verificar si ya completó el onboarding
      if (isEmployee) {
        try {
          // Verificar si ya completó el onboarding
          const onboardingResponse = await api.get('/api/hr/onboarding-status', {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (!onboardingResponse.data.isOnboarded) {
            // Ir al wizard de onboarding de empleados
            Alert.alert(
              '✅ Contraseña Actualizada',
              'Ahora necesitas completar tu alta como empleado.',
              [
                {
                  text: 'Continuar',
                  onPress: () => {
                    navigation.replace('EmployeeOnboarding', { user, token });
                  },
                },
              ]
            );
            return;
          }
        } catch (onboardError) {
          // Si falla, asumir que necesita onboarding
          Alert.alert(
            '✅ Contraseña Actualizada',
            'Ahora necesitas completar tu alta como empleado.',
            [
              {
                text: 'Continuar',
                onPress: () => {
                  navigation.replace('EmployeeOnboarding', { user, token });
                },
              },
            ]
          );
          return;
        }
        
        // Si ya completó onboarding, ir a Home
        Alert.alert(
          '✅ Contraseña Actualizada',
          'Tu contraseña ha sido cambiada exitosamente.',
          [
            {
              text: 'Continuar',
              onPress: () => {
                navigation.replace('Home', { user, token });
              },
            },
          ]
        );
        return;
      }
      
      // Solo para clientes: Verificar si necesita verificación de identidad
      try {
        const statusResponse = await api.get('/api/verify/status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!statusResponse.data.isVerified) {
          Alert.alert(
            '✅ Contraseña Actualizada',
            'Ahora necesitas verificar tu identidad para continuar.',
            [
              {
                text: 'Continuar',
                onPress: () => {
                  navigation.replace('Verification', { user, token });
                },
              },
            ]
          );
          return;
        }
      } catch (verifyError) {
        // Si falla la verificación para un cliente, redirigir a Verification
        Alert.alert(
          '✅ Contraseña Actualizada',
          'Ahora necesitas verificar tu identidad.',
          [
            {
              text: 'Continuar',
              onPress: () => {
                navigation.replace('Verification', { user, token });
              },
            },
          ]
        );
        return;
      }
      
      // Si ya está verificado, ir directo a Home
      Alert.alert(
        '✅ Contraseña Actualizada',
        'Tu contraseña ha sido cambiada exitosamente.',
        [
          {
            text: 'Continuar',
            onPress: () => {
              navigation.replace('Home', { user, token });
            },
          },
        ]
      );
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
          <Text style={styles.emoji}>🔐</Text>
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
          <Text style={styles.boxLabel}>Tu casillero</Text>
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
  emoji: {
    fontSize: 60,
    marginBottom: 10,
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
