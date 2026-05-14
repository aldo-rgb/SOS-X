/**
 * SocialAuthButtons (mobile) — Botones nativos de Sign in with Apple + Continue with Google.
 *
 * Apple: usa expo-apple-authentication (solo iOS 13+).
 * Google: usa expo-auth-session (Google ID Token) — funciona en iOS + Android.
 *
 * Feature flags vía app.json → extra.{googleWebClientId, googleIosClientId, googleAndroidClientId}.
 * Si la env del cliente no está, el botón no se muestra.
 *
 * Backend:
 *   POST /api/auth/google { idToken }
 *   POST /api/auth/apple  { idToken, fullName? }
 *
 * Si el usuario no está registrado, backend responde 404 con
 * errorCode=SOCIAL_USER_NOT_REGISTERED + prefill { email, fullName, provider }.
 * En ese caso llamamos onNotRegistered() para navegar a Register pre-llenado.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

WebBrowser.maybeCompleteAuthSession();

const extra = (Constants.expoConfig?.extra || {}) as {
  googleIosClientId?: string;
  googleAndroidClientId?: string;
  googleWebClientId?: string;
};

interface Props {
  onSuccess: (data: { user: any; access: any }) => void;
  onError: (msg: string) => void;
  /** Prefill al registrarse si la cuenta social aún no existe en la BD. */
  onNotRegistered?: (prefill: { email: string; fullName: string; provider: 'google' | 'apple' }) => void;
  disabled?: boolean;
}

const SocialAuthButtons: React.FC<Props> = ({ onSuccess, onError, onNotRegistered, disabled }) => {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // Apple Sign-In disponibilidad (solo iOS real, no funciona en Android ni en simulador < iOS 13)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const showGoogle = !!(extra.googleWebClientId || extra.googleIosClientId || extra.googleAndroidClientId);

  // Google Auth Session
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: extra.googleWebClientId,
    iosClientId: extra.googleIosClientId || extra.googleWebClientId,
    androidClientId: extra.googleAndroidClientId || extra.googleWebClientId,
  });

  // Manejar respuesta de Google
  useEffect(() => {
    if (response?.type === 'success' && response.params?.id_token) {
      handleGoogleToken(response.params.id_token);
    } else if (response?.type === 'error') {
      onError('No se pudo iniciar sesión con Google');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const handleGoogleToken = async (idToken: string) => {
    setGoogleLoading(true);
    try {
      const { data } = await api.post('/api/auth/google', { idToken });
      onSuccess({ user: data.user, access: data.access });
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errorCode === 'SOCIAL_USER_NOT_REGISTERED' && data?.prefill && onNotRegistered) {
        onNotRegistered({
          email: data.prefill.email || '',
          fullName: data.prefill.fullName || '',
          provider: 'google',
        });
        return;
      }
      onError(data?.error || 'No se pudo iniciar sesión con Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    if (!request) return;
    try {
      await promptAsync();
    } catch (err: any) {
      onError(err?.message || 'No se pudo iniciar Google Sign-In');
    }
  };

  const handleAppleClick = async () => {
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const idToken = credential.identityToken;
      if (!idToken) {
        onError('Apple no devolvió token');
        return;
      }
      const fullName = credential.fullName
        ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
        : undefined;
      const { data } = await api.post('/api/auth/apple', { idToken, fullName });
      onSuccess({ user: data.user, access: data.access });
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
        return; // usuario canceló
      }
      const data = err.response?.data;
      if (data?.errorCode === 'SOCIAL_USER_NOT_REGISTERED' && data?.prefill && onNotRegistered) {
        onNotRegistered({
          email: data.prefill.email || '',
          fullName: data.prefill.fullName || '',
          provider: 'apple',
        });
        return;
      }
      onError(data?.error || err?.message || 'No se pudo iniciar sesión con Apple');
    } finally {
      setAppleLoading(false);
    }
  };

  if (!showGoogle && !appleAvailable) return null;

  return (
    <View style={styles.container}>
      <View style={styles.dividerWrap}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>o continúa con</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.row}>
        {showGoogle && (
          <TouchableOpacity
            onPress={handleGoogleClick}
            disabled={disabled || googleLoading || !request}
            style={[styles.btn, styles.googleBtn, (disabled || googleLoading || !request) && styles.btnDisabled]}
            activeOpacity={0.7}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#3c4043" />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color="#DB4437" style={{ marginRight: 8 }} />
                <Text style={styles.googleText}>Google</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {appleAvailable && (
          <TouchableOpacity
            onPress={handleAppleClick}
            disabled={disabled || appleLoading}
            style={[styles.btn, styles.appleBtn, (disabled || appleLoading) && styles.btnDisabled]}
            activeOpacity={0.7}
          >
            {appleLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.appleText}>Apple</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DADCE0',
  },
  googleText: {
    color: '#3c4043',
    fontSize: 15,
    fontWeight: '600',
  },
  appleBtn: {
    backgroundColor: '#000000',
  },
  appleText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

export default SocialAuthButtons;
