/**
 * biometricAuth — wrapper para Face ID / Touch ID / huella Android.
 *
 * Uso típico:
 *   const ok = await authenticateBiometric();
 *   if (ok) { ...auto-login... }
 *
 * Si el dispositivo no soporta biometría o el usuario no la ha habilitado,
 * las funciones regresan false sin lanzar excepción.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIOMETRIC_ENABLED_KEY = 'biometric_login_enabled';

export type BiometricSupport = {
  available: boolean;
  enrolled: boolean;
  faceId: boolean;
  touchId: boolean;
  iris: boolean;
};

export async function checkBiometricSupport(): Promise<BiometricSupport> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return {
      available: compatible,
      enrolled,
      faceId: types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION),
      touchId: types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT),
      iris: types.includes(LocalAuthentication.AuthenticationType.IRIS),
    };
  } catch {
    return { available: false, enrolled: false, faceId: false, touchId: false, iris: false };
  }
}

export async function authenticateBiometric(reason?: string): Promise<boolean> {
  try {
    const support = await checkBiometricSupport();
    if (!support.available || !support.enrolled) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason || 'Confirma tu identidad para entrar a EntregaX',
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar contraseña',
      disableDeviceFallback: false,
    });
    return result.success === true;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, '1');
    else await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {
    // ignore
  }
}
