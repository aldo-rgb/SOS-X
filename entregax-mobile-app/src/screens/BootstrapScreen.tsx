/**
 * BootstrapScreen — pantalla inicial que decide a dónde mandar al usuario:
 *  1. Lee token + user de SecureStore.
 *  2. Si no hay token → Login.
 *  3. Si hay token y el usuario habilitó Face ID → pide biometría.
 *     - Si la biometría falla o cancela → Login (sin borrar token, el user puede
 *       reintentar reabriendo la app).
 *  4. Valida el token contra /api/auth/profile.
 *     - Si 401/403 → borra storage y manda a Login.
 *     - Si OK → navega al Home apropiado según el rol.
 *
 * Mientras decide, muestra el logo + spinner (estilo splash).
 */
import React, { useEffect, useRef } from 'react';
import { View, Image, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { Text } from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import { getSecure, clearAllSecure } from '../services/secureStorage';
import { api } from '../services/api';
import { authenticateBiometric, isBiometricEnabled } from '../services/biometricAuth';
import { EMPLOYEE_ROLES } from '../constants/roles';

const ORANGE = '#F05A28';
const BLACK = '#111111';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Bootstrap'>;
};

export default function BootstrapScreen({ navigation }: Props) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    decideRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToLogin = () => {
    navigation.replace('Login');
  };

  const decideRoute = async () => {
    try {
      const token = await getSecure('token');
      const userStr = await getSecure('user');
      if (!token || !userStr) {
        goToLogin();
        return;
      }
      let userData: any = null;
      try {
        userData = JSON.parse(userStr);
      } catch {
        await clearAllSecure();
        goToLogin();
        return;
      }

      // Face ID / Touch ID si el usuario lo habilitó.
      const bioOn = await isBiometricEnabled();
      if (bioOn) {
        const ok = await authenticateBiometric('Confirma tu identidad para abrir EntregaX');
        if (!ok) {
          // El usuario canceló o falló — lo dejamos en Login pero conservamos
          // el token para que pueda reintentar al reabrir la app.
          goToLogin();
          return;
        }
      }

      // Validar token contra el backend.
      try {
        const resp = await api.get('/api/auth/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const fresh = resp.data?.user || resp.data || userData;
        // Refrescar user con datos actuales (rol pudo cambiar).
        const merged = {
          id: fresh.id ?? userData.id,
          name: fresh.name || fresh.full_name || userData.name,
          email: fresh.email || userData.email,
          boxId: fresh.boxId || fresh.box_id || userData.boxId,
          role: fresh.role || userData.role,
          phone: fresh.phone || userData.phone,
          isVerified: fresh.isVerified ?? userData.isVerified,
          verificationStatus: fresh.verificationStatus || userData.verificationStatus,
        };
        routeByRole(merged, token);
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          // Token genuinamente inválido o expirado — limpiar y a Login.
          await clearAllSecure();
          goToLogin();
        } else {
          // Falla transitoria (red lenta al abrir, cold start del servidor,
          // 5xx): NO mandar al usuario a Login tras un Face ID exitoso.
          // Entramos con los datos guardados; la pantalla destino revalida.
          routeByRole(userData, token);
        }
      }
    } catch {
      goToLogin();
    }
  };

  const routeByRole = (user: any, token: string) => {
    if (user.role === 'repartidor' || user.role === 'monitoreo') {
      navigation.replace('DriverHome', { user, token });
      return;
    }
    if (EMPLOYEE_ROLES.includes(user.role)) {
      navigation.replace('EmployeeHome', { user, token });
      return;
    }
    if (user.role === 'client' && user.isVerified === false) {
      navigation.replace('Verification', { user, token });
      return;
    }
    navigation.replace('Home', { user, token });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BLACK} />
      <Image
        source={require('../../assets/x-logo-entregax.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color={ORANGE} style={{ marginTop: 24 }} />
      <Text style={styles.hint}>Cargando…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BLACK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: { width: 160, height: 160 },
  hint: { color: '#bbb', marginTop: 12, fontSize: 13 },
});
