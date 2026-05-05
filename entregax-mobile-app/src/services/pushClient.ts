/**
 * pushClient.ts - Cliente de notificaciones push para la app móvil.
 *
 * Usa expo-notifications. Para FCM directo en Android, Expo entrega el token
 * nativo de FCM cuando la app está construida con EAS y `useFcmV1: true`.
 * En iOS, devuelve el APNs/Expo device token que firebase-admin acepta vía
 * APNs config. En desarrollo (Expo Go) sólo se obtiene el ExponentPushToken,
 * que NO es un token FCM válido para envío directo desde firebase-admin.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { registerPushToken } from './chatService';

// Configurar handler en foreground (mostrar banner)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let registeredToken: string | null = null;

/**
 * Solicita permisos y registra el token de push en el backend.
 * Devuelve el token nativo (FCM en Android EAS build, device token en iOS).
 */
export async function registerForPushNotifications(authToken: string): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log('[Push] Saltando: simulador detectado');
      return null;
    }
    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
    }
    if (!granted) {
      console.log('[Push] Permiso denegado');
      return null;
    }

    // Configurar canal en Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Mensajes',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F05A28',
        sound: 'default',
      });
    }

    // Intentar obtener token nativo (FCM en Android, APNs en iOS)
    let nativeToken: string | null = null;
    try {
      const tokenResp = await Notifications.getDevicePushTokenAsync();
      nativeToken = tokenResp.data;
    } catch (e) {
      console.warn('[Push] No se pudo obtener device token nativo:', e);
    }

    if (!nativeToken) return null;
    if (nativeToken === registeredToken) return nativeToken;

    await registerPushToken(authToken, {
      token: nativeToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device_name: Device.deviceName || undefined,
      app_version: '1.0.0',
    });

    registeredToken = nativeToken;
    console.log('[Push] Token registrado correctamente');
    return nativeToken;
  } catch (e: any) {
    console.warn('[Push] Error en registro:', e?.message || e);
    return null;
  }
}

/**
 * Suscribe a notificaciones recibidas en foreground o tocadas (deep-link).
 * Devuelve función para limpiar.
 */
export function subscribeNotificationListeners(opts: {
  onReceived?: (n: Notifications.Notification) => void;
  onTapped?: (response: Notifications.NotificationResponse) => void;
}) {
  const subRecv = Notifications.addNotificationReceivedListener((n) => opts.onReceived?.(n));
  const subResp = Notifications.addNotificationResponseReceivedListener((r) => opts.onTapped?.(r));
  return () => {
    subRecv.remove();
    subResp.remove();
  };
}
