/**
 * Señales del entorno del dispositivo para validar la asistencia.
 *
 * - SSID del WiFi: respaldo de la geocerca cuando el GPS se degrada dentro de
 *   una bodega y deja al empleado "fuera" aunque esté parado en su sucursal.
 * - Ubicación simulada: expo-location marca `mocked` cuando las coordenadas
 *   vienen de una app de Fake GPS (solo Android; iOS no lo expone).
 */

/**
 * SSID de la red WiFi conectada, o null si no se puede saber.
 *
 * NetInfo es un módulo NATIVO y se carga con require dinámico a propósito: la
 * app se actualiza por OTA (expo-updates), así que un import estático tronaría
 * en los builds que todavía no lo traen compilado. Mientras no esté, esto
 * devuelve null y el respaldo por WiFi simplemente no aplica.
 *
 * Requiere `npx expo install @react-native-community/netinfo` + nuevo build.
 * En Android necesita ACCESS_FINE_LOCATION (ya declarado) y ACCESS_WIFI_STATE;
 * en iOS, el entitlement com.apple.developer.networking.wifi-info.
 */
export const getWifiSSID = async (): Promise<string | null> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-community/netinfo');
    const NetInfo = mod?.default ?? mod;
    if (!NetInfo?.fetch) return null;

    const state = await NetInfo.fetch();
    if (state?.type !== 'wifi') return null;

    const ssid = state?.details?.ssid;
    // Android devuelve "<unknown ssid>" cuando falta permiso de ubicación.
    if (typeof ssid !== 'string') return null;
    const clean = ssid.trim().replace(/^"|"$/g, '').trim();
    if (!clean || /^<unknown ssid>$/i.test(clean)) return null;
    return clean;
  } catch {
    return null;
  }
};
