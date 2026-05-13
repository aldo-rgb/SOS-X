# 🛡️ Plan de Hardening y Compliance Móvil — EntregaX

> **Objetivo:** dejar la app lista para someter a App Store + Google Play **sin observaciones de seguridad ni de políticas**, manteniendo la regla **Zero Breakage** (no romper navegación, push, ni flujos de pago/escaneo).
>
> **Stack:** Expo SDK 54 · RN 0.81 · New Architecture ON · `com.entregax.mobile`
>
> **Cómo usar:** marca cada `[ ]` conforme se complete. Cada fase es independiente — puedes hacer PRs separados. Ejecuta las **verificaciones** al final de cada fase antes de avanzar.

---

## Fase 0 — Preparación

- [ ] Crear rama `chore/mobile-hardening` desde `main`.
- [ ] Confirmar `eas whoami` y acceso al proyecto `b6043c48-2360-4a21-afa7-3ea091d6c74c`.
- [ ] Backup del build actual: `eas build:list --limit 5 > builds_pre_hardening.txt`.
- [ ] Subir `versionCode` y `buildNumber` solo al final (Fase 10).

---

## Fase 1 — Almacenamiento seguro (🔴 CRÍTICO)

Migrar JWT y datos sensibles de **AsyncStorage** → **`expo-secure-store`** (Keychain iOS / Keystore Android).

- [ ] Instalar dependencia:
  ```bash
  npx expo install expo-secure-store
  ```
- [ ] Crear `src/services/secureStorage.ts`:
  ```ts
  import * as SecureStore from 'expo-secure-store';
  import AsyncStorage from '@react-native-async-storage/async-storage';

  const SENSITIVE_KEYS = ['token', 'refresh_token', 'user'] as const;
  type SensitiveKey = typeof SENSITIVE_KEYS[number];

  const opts: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };

  export async function setSecure(key: SensitiveKey, value: string) {
    await SecureStore.setItemAsync(key, value, opts);
  }

  export async function getSecure(key: SensitiveKey): Promise<string | null> {
    // Shim de retro-compat: si aún vive en AsyncStorage, migrar y borrar.
    const v = await SecureStore.getItemAsync(key, opts);
    if (v) return v;
    const legacy = await AsyncStorage.getItem(key);
    if (legacy) {
      await SecureStore.setItemAsync(key, legacy, opts);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return null;
  }

  export async function removeSecure(key: SensitiveKey) {
    await SecureStore.deleteItemAsync(key, opts);
    await AsyncStorage.removeItem(key); // limpia residuos
  }
  ```
- [ ] Reemplazar `AsyncStorage.getItem('token')` → `getSecure('token')` en:
  - [ ] `src/screens/SaldoFavorScreen.tsx` (línea 73)
  - [ ] `src/screens/WalletScreen.tsx` (líneas 79, 147)
  - [ ] `src/screens/ReferidosScreen.tsx` (línea 69)
  - [ ] `src/screens/DhlReceptionWizardScreen.tsx` (líneas 328, 367, 489)
  - [ ] Cualquier `LoginScreen` / sitio donde se haga `AsyncStorage.setItem('token', ...)` → usar `setSecure('token', ...)`
- [ ] **NO migrar** las claves no sensibles (idioma `LANGUAGE_KEY`, `SCAN_MODE_KEY`, `SCAN_METHOD_PREFIX*`) — se quedan en AsyncStorage.
- [ ] Verificación:
  ```bash
  grep -rn "AsyncStorage.getItem('token')\|AsyncStorage.setItem('token'" src/
  # Resultado esperado: 0 matches
  ```

---

## Fase 2 — Ofuscación, Hermes y ProGuard/R8 (🔴 CRÍTICO Android)

- [ ] Instalar plugin de propiedades nativas:
  ```bash
  npx expo install expo-build-properties
  ```
- [ ] Editar `app.json` → `expo.plugins` (añadir entrada):
  ```json
  [
    "expo-build-properties",
    {
      "android": {
        "enableProguardInReleaseBuilds": true,
        "enableShrinkResourcesInReleaseBuilds": true,
        "extraProguardRules": "-keep class com.entregax.mobile.** { *; }\n-keep class com.facebook.hermes.** { *; }\n-keep class com.facebook.jni.** { *; }"
      },
      "ios": {
        "deploymentTarget": "15.1"
      }
    }
  ]
  ```
- [ ] Confirmar que Hermes sigue ON (default en SDK 54 — no requiere flag).
- [ ] Verificación local (después de prebuild):
  ```bash
  npx expo prebuild --clean
  grep "enableProguardInReleaseBuilds true" android/gradle.properties
  ```

---

## Fase 3 — Stripping de `console.*` en producción (🔴 CRÍTICO)

- [ ] Instalar plugin Babel:
  ```bash
  npm i -D babel-plugin-transform-remove-console
  ```
- [ ] Crear `babel.config.js` en la raíz (no existe hoy):
  ```js
  module.exports = function (api) {
    api.cache(true);
    return {
      presets: ['babel-preset-expo'],
      env: {
        production: {
          plugins: [
            ['transform-remove-console', { exclude: ['error', 'warn'] }],
          ],
        },
      },
    };
  };
  ```
- [ ] **Sanitizar logs que filtran token (no esperar al stripper, son evidencia visible en review):**
  - [ ] `src/screens/MyProfileScreen.tsx` línea 361 — eliminar `console.log('Token:', token?.substring(0, 20) + '...')`.
  - [ ] `src/screens/MyProfileScreen.tsx` líneas 359–391 — quitar logs de status/response.
  - [ ] `src/screens/ChangePasswordScreen.tsx` líneas 146, 150, 153 — sanitizar logs de verification.
- [ ] Verificación: hacer build preview y revisar bundle con
  ```bash
  eas build -p android --profile preview
  unzip -p $(ls -t *.apk | head -1) assets/index.android.bundle | grep -c "console.log" 
  # Esperado: 0
  ```

---

## Fase 4 — WebViews seguros (🔴 CRÍTICO)

Aplicar a `PaymentScreen` y `PaymentSummaryScreen`.

- [ ] Crear helper `src/utils/webviewSafety.ts`:
  ```ts
  const ALLOWED_HOSTS = [
    'paypal.com', 'www.paypal.com', 'www.sandbox.paypal.com',
    'sos-x-production.up.railway.app',
    'openpay.mx', 'sandbox-api.openpay.mx',
  ];

  export function isAllowedUrl(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      return ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
    } catch { return false; }
  }
  ```
- [ ] En `src/screens/PaymentScreen.tsx` (línea ~218), añadir props al `<WebView>`:
  ```tsx
  <WebView
    source={{ uri: approvalUrl }}
    originWhitelist={['https://*.paypal.com', 'https://paypal.com']}
    onShouldStartLoadWithRequest={(req) => isAllowedUrl(req.url)}
    javaScriptEnabled
    domStorageEnabled
    setSupportMultipleWindows={false}
    allowsLinkPreview={false}
    onNavigationStateChange={handleWebViewNavigation}
    // ...
  />
  ```
- [ ] Replicar en `src/screens/PaymentSummaryScreen.tsx`.
- [ ] Validar `Linking.openURL` externos:
  - [ ] `src/screens/MyPaymentsScreen.tsx` línea 840 → envolver con `if (url.startsWith('https://')) Linking.openURL(url)`.
  - [ ] `src/screens/AdvisorReferralScreen.tsx` línea 105 → idem para WhatsApp (`https://` o `whatsapp://`).

---

## Fase 5 — Auditoría y limpieza de permisos (🔴 CRÍTICO Play Store)

En `app.json` → `expo.android.permissions`:

- [ ] **Eliminar** los siguientes (no se usan en código):
  - [ ] `RECORD_AUDIO`
  - [ ] `READ_EXTERNAL_STORAGE`
  - [ ] `WRITE_EXTERNAL_STORAGE`
  - [ ] `BLUETOOTH` (legacy, reemplazado por `BLUETOOTH_CONNECT`)
  - [ ] `BLUETOOTH_ADMIN` (legacy, reemplazado por `BLUETOOTH_SCAN`)
- [ ] **Mantener** (verificadas en uso):
  - [x] `CAMERA` — escáneres y captura de evidencia
  - [x] `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` — solo en uso, NO background
  - [x] `BLUETOOTH_CONNECT` / `BLUETOOTH_SCAN` — `react-native-ble-plx`
  - [x] `INTERNET` (implícito), `VIBRATE` (notifs)
- [ ] iOS — añadir clave faltante en `app.json` → `expo.ios.infoPlist`:
  ```json
  "NSLocationAlwaysAndWhenInUseUsageDescription": "EntregaX no usa tu ubicación en segundo plano."
  ```
  *(Aunque no se usa background, el plugin lo declara y App Store muestra warning; este texto evita observación).*
- [ ] Verificación:
  ```bash
  grep -E "RECORD_AUDIO|WRITE_EXTERNAL_STORAGE|^  *\"BLUETOOTH\"" app.json
  # Esperado: 0 matches
  ```

---

## Fase 6 — Prominent Disclosure (ℹ️ NO APLICA actualmente)

> **Hallazgo del audit:** la app **NO usa** background location (no hay `TaskManager.defineTask` ni `Location.startLocationUpdatesAsync`). Por tanto **NO se requiere** Prominent Disclosure ni `ACCESS_BACKGROUND_LOCATION`.

- [x] Confirmado: sin tracking en segundo plano → ✅ no se requiere pantalla pre-permiso.
- [ ] **Si en el futuro** se agrega background GPS para drivers:
  1. Declarar `ACCESS_BACKGROUND_LOCATION` en `app.json`.
  2. Crear `PromienentDisclosureScreen` antes de `Location.requestBackgroundPermissionsAsync()` con texto:
     > "EntregaX recopila datos de ubicación para habilitar el seguimiento de rutas de entrega **incluso cuando la app está cerrada o no está en uso**. Esto permite [feature concreto]. Sin este permiso no podrás [consecuencia]."
     - Botones: **"Aceptar"** (dispara prompt OS) / **"No ahora"** (continúa sin background).
  3. Documentar la pantalla con screenshots para Google Play Console (sección Sensitive Permissions).

---

## Fase 7 — Eliminación de Cuenta (🔴 CRÍTICO ambas tiendas)

Requisito obligatorio desde 2024 (Google Play Account Deletion + Apple Guideline 5.1.1(v)).

### Backend (`entregax-backend-api`)
- [ ] Endpoint `DELETE /api/auth/account` (autenticado):
  - [ ] Marca soft-delete: `users.deleted_at = NOW()`, `email` → `deleted_<id>@entregax.com`, `phone` → `null`.
  - [ ] Revoca tokens activos (invalidación JWT por `iat`/blacklist).
  - [ ] Cancela órdenes recurrentes (anticipos, suscripciones).
  - [ ] Encola job que purga PII a los **30 días** (retención legal mínima).
  - [ ] Envía email de confirmación con ventana de 7 días para revertir.
- [ ] Endpoint público `GET /eliminar-cuenta` (web admin o landing) — formulario para iniciar el flujo **desde fuera de la app** (requisito Google).

### Mobile
- [ ] Nueva pantalla `src/screens/DeleteAccountScreen.tsx`:
  - [ ] Entrada en `MyProfileScreen` → "Eliminar mi cuenta" (texto en rojo, ícono ⚠️).
  - [ ] Reautenticación obligatoria (pedir password).
  - [ ] Confirmación doble + listado de datos a eliminar.
  - [ ] Llama `DELETE /api/auth/account` y luego `removeSecure('token')` + logout.
- [ ] Registrar la pantalla en `App.tsx` (Stack.Screen).

### Tiendas
- [ ] Google Play Console → **Data Safety → Account deletion**:
  - URL externa: `https://entregax.com/eliminar-cuenta`
  - Ubicación in-app: `Perfil → Eliminar mi cuenta`
- [ ] App Store Connect → **App Privacy → Account deletion**: mismo URL + descripción.

---

## Fase 8 — Data Safety form (Google Play) / App Privacy (Apple)

Mapeo de datos recolectados — completar en consolas:

| Categoría | Tipo | Recolectado | Compartido con terceros | Encriptado en tránsito | Usuario puede borrar |
|---|---|---|---|---|---|
| Info personal | Nombre, email, teléfono | Sí | No | Sí (TLS) | Sí (Fase 7) |
| Ubicación | Aprox + precisa | Sí (solo en uso) | No | Sí | Sí |
| Fotos/Videos | Captura cámara + galería | Sí | AWS S3 (proveedor) | Sí | Sí |
| Identificadores | Push token (Expo), Device ID | Sí | Expo Push, Sentry | Sí | Sí |
| Financieros | Refs de pago | Sí | PayPal, OpenPay | Sí | Soft-delete |
| Mensajes | Chat soporte | Sí | No | Sí | Sí |

- [ ] Declarar **"Datos encriptados en tránsito" = Sí** (TLS por Railway/Cloudflare).
- [ ] Declarar **"Procedimiento para solicitar eliminación de datos" = Sí** (apuntar a Fase 7).
- [ ] Marcar terceros: Sentry (crash), Expo Push (notifs), PayPal/OpenPay (pagos), AWS S3 (almacenamiento).

---

## Fase 9 — Deep Links

- [ ] Decidir: **¿se usarán?** El `scheme: "entregax"` está declarado pero no hay handler en `App.tsx`.
  - [ ] **Opción A (recomendada hoy):** dejar declarado pero sin rutas activas. Sin riesgo.
  - [ ] **Opción B:** implementar `linking` config con allowlist explícita:
    ```ts
    const linking = {
      prefixes: ['entregax://', 'https://app.entregax.com'],
      config: {
        screens: {
          PackageDetail: 'package/:id',
          Payment: 'pay/:orderId',
        },
      },
    };
    <NavigationContainer linking={linking}>
    ```
    + validar `:id` numérico antes de navegar (defensa contra path traversal).

---

## Fase 10 — Pre-flight de Submission

- [ ] Subir `app.json`:
  - [ ] `ios.buildNumber` → `4`
  - [ ] `android.versionCode` → `4`
- [ ] Builds de release:
  ```bash
  eas build --platform all --profile production
  ```
- [ ] **Pruebas manuales en build de producción:**
  - [ ] Login → verifica que el JWT vive en Keychain/Keystore (no en AsyncStorage).
  - [ ] Logout → confirma `removeSecure('token')` limpia.
  - [ ] Pago PayPal completo (no debe permitir navegación fuera de `paypal.com`).
  - [ ] Push notifications recibidas.
  - [ ] Escáner DHL / China Air / PO Box operativos.
  - [ ] Eliminar mi cuenta → flujo completo end-to-end.
  - [ ] Cambio de idioma persistente (AsyncStorage no migrado).
- [ ] Submission:
  ```bash
  eas submit --platform ios --latest
  eas submit --platform android --latest
  ```
- [ ] Capturas requeridas para Play Console:
  - [ ] Pantalla de login y permisos solicitados.
  - [ ] Pantalla de "Eliminar mi cuenta".
- [ ] App Privacy URL pública: `https://entregax.com/privacidad` (debe mencionar retención 30 días + eliminación).

---

## ✅ Checklist final de no-regresión

- [ ] Navegación entre stacks intacta.
- [ ] Push notifications llegan en iOS + Android release.
- [ ] AsyncStorage solo retiene: `language`, `SCAN_MODE_KEY`, `SCAN_METHOD_PREFIX*`.
- [ ] `grep -rn "console.log" dist/` en bundle release = 0 (excepto `console.error/warn`).
- [ ] `eas build --profile production` exitoso en ambas plataformas.
- [ ] Sentry sigue capturando errores reales (no se rompió por el strip).

---

## 📎 Referencias
- [Google Play — Account deletion requirement](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Apple — Account deletion (Guideline 5.1.1(v))](https://developer.apple.com/app-store/review/guidelines/#5.1.1)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo Build Properties (ProGuard)](https://docs.expo.dev/versions/latest/sdk/build-properties/)
- [Prominent disclosure for location](https://support.google.com/googleplay/android-developer/answer/9799150)
