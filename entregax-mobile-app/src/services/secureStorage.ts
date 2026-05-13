/**
 * Secure storage para datos sensibles (JWT, refresh tokens, etc.)
 *
 * - iOS: Keychain con `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (no se respalda a iCloud, no migrable).
 * - Android: EncryptedSharedPreferences vía Android Keystore.
 *
 * Nota: datos NO sensibles (idioma, preferencia de escáner, etc.) siguen en AsyncStorage.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SENSITIVE_KEYS = ['token', 'refresh_token', 'user'] as const;
export type SensitiveKey = (typeof SENSITIVE_KEYS)[number];

const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * Guarda un valor sensible en el almacenamiento seguro nativo (Keychain/Keystore).
 */
export async function setSecure(key: SensitiveKey, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, opts);
  } catch (e) {
    // No filtramos detalles ni el valor.
    if (__DEV__) console.warn('[secureStorage] setSecure error', key);
    throw e;
  }
}

/**
 * Obtiene un valor sensible. Incluye un shim de retro-compatibilidad: si el
 * valor todavía vive en AsyncStorage (instalaciones previas a esta versión),
 * lo migra a SecureStore y borra el residuo en AsyncStorage.
 */
export async function getSecure(key: SensitiveKey): Promise<string | null> {
  try {
    const current = await SecureStore.getItemAsync(key, opts);
    if (current) return current;

    // Migración one-shot desde AsyncStorage legacy.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy) {
      await SecureStore.setItemAsync(key, legacy, opts);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return null;
  } catch (e) {
    if (__DEV__) console.warn('[secureStorage] getSecure error', key);
    return null;
  }
}

/**
 * Borra un valor sensible tanto del almacenamiento seguro como de AsyncStorage
 * (defensa en profundidad por si quedaron residuos legacy).
 */
export async function removeSecure(key: SensitiveKey): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, opts);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Limpia todas las claves sensibles. Útil al cerrar sesión o eliminar cuenta.
 */
export async function clearAllSecure(): Promise<void> {
  await Promise.all(SENSITIVE_KEYS.map((k) => removeSecure(k)));
}
