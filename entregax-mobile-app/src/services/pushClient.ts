/**
 * pushClient.ts - Cliente de notificaciones push para la app móvil.
 *
 * Usa Expo Push Service (ExponentPushToken). El backend envía vía
 * https://exp.host/--/api/v2/push/send, lo que evita configurar
 * firebase-admin/APNs por nuestra cuenta (Expo administra credenciales).
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { registerPushToken } from './chatService';

// Configurar handler en foreground (mostrar banner). Si la notificación trae un
// MP3 custom (_customSoundUrl), NO dejamos que el SO reproduzca el tono del canal
// (shouldPlaySound: false) porque nosotros reproducimos el MP3 desde la URL abajo.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const hasCustom = !!(notification?.request?.content?.data as any)?._customSoundUrl;
    return {
      shouldShowAlert: true,
      shouldPlaySound: !hasCustom,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// Reproduce el MP3 custom de una notificación en primer plano (si viene).
export function playCustomNotificationSound(url: string) {
  try {
    const player = createAudioPlayer({ uri: url });
    player.play();
    // Liberar el player al terminar (~8s de gracia).
    setTimeout(() => { try { player.remove(); } catch { /* noop */ } }, 8000);
  } catch { /* noop */ }
}

// Listener global: al recibir una push en primer plano con MP3 custom, lo suena.
try {
  Notifications.addNotificationReceivedListener((notification) => {
    const url = (notification?.request?.content?.data as any)?._customSoundUrl;
    if (url && typeof url === 'string') playCustomNotificationSound(url);
  });
} catch { /* noop */ }

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
      // Canal 'altas' con sonido Gong para las notificaciones de nuevo cliente.
      // El sonido se empaqueta vía el plugin expo-notifications (app.json → sounds)
      // y se referencia por su nombre de archivo. IMPORTANTE: los canales de Android
      // son inmutables tras crearse; si se cambia el gong, usar un id nuevo (altas_v2).
      await Notifications.setNotificationChannelAsync('altas', {
        name: 'Nuevas altas',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 200, 300],
        lightColor: '#F05A28',
        sound: 'gong.wav',
      });
      // Canal 'default': tono del sistema (para notificaciones sin tono custom).
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notificaciones',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F05A28',
        sound: 'default',
      });
    }

    // Obtener Expo push token (ExponentPushToken[...])
    const projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;
    let expoToken: string | null = null;
    try {
      const tokenResp = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined as any
      );
      expoToken = tokenResp.data;
    } catch (e) {
      console.warn('[Push] No se pudo obtener Expo push token:', e);
    }

    if (!expoToken) return null;
    if (expoToken === registeredToken) return expoToken;

    await registerPushToken(authToken, {
      token: expoToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device_name: Device.deviceName || undefined,
      app_version: '1.0.0',
    });

    registeredToken = expoToken;
    console.log('[Push] Expo token registrado:', expoToken.slice(0, 30) + '...');
    return expoToken;
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
