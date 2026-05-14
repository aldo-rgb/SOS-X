# Social Auth (Google + Apple) — Variables de entorno

## Backend (`entregax-backend-api/.env` o Railway Variables)

```bash
# === GOOGLE SIGN-IN ===
# CSV con los Client IDs autorizados a llamar nuestro endpoint.
# Para Paso 1 (sólo web) basta con el Web Client ID.
# Para Paso 2 añade iOS y Android Client IDs separados por coma.
GOOGLE_OAUTH_CLIENT_IDS=123456-web.apps.googleusercontent.com,123456-ios.apps.googleusercontent.com,123456-android.apps.googleusercontent.com

# === SIGN IN WITH APPLE ===
# CSV de "audiences" permitidos.
# Web → el Services ID que creaste en Apple Developer (ej. com.entregax.web)
# iOS → el Bundle ID de la app (com.entregax.mobile)
APPLE_AUDIENCES=com.entregax.web,com.entregax.mobile
```

Si las variables faltan, los endpoints responden **503** y el frontend simplemente no muestra los botones (feature-flag implícito).

Diagnóstico: `GET /api/auth/social/status` → `{ google: { enabled, audiencesCount }, apple: { enabled, audiencesCount } }`

## Frontend Web (`entregax-web-admin/.env.production` y `.env.local`)

```bash
# Mismo Web Client ID que pusiste en GOOGLE_OAUTH_CLIENT_IDS del backend
VITE_GOOGLE_CLIENT_ID=123456-web.apps.googleusercontent.com

# Services ID creado en Apple Developer Portal
VITE_APPLE_SERVICES_ID=com.entregax.web

# URL completa registrada como "Return URL" en Apple
VITE_APPLE_REDIRECT_URI=https://www.entregax.app/login
```

Si alguna no se define en build time, el botón correspondiente no se renderiza.

---

## Pasos en consolas externas (lo único que NO puedo hacer yo)

### Google Cloud Console
1. https://console.cloud.google.com → APIs & Services → Credentials
2. **Create Credentials → OAuth Client ID**
   - **Web application**:
     - Authorized JavaScript origins: `https://www.entregax.app`, `https://entregax.app`, `http://localhost:5173`
     - Authorized redirect URIs: (no se requieren con `@react-oauth/google`)
   - **iOS** (Paso 2): bundle id `com.entregax.mobile`
   - **Android** (Paso 2): package `com.entregax.mobile` + SHA-1 (obtener con `eas credentials`)
3. Copia los 3 Client IDs y pégalos en backend (`GOOGLE_OAUTH_CLIENT_IDS`) y web (`VITE_GOOGLE_CLIENT_ID` = el Web).

### Apple Developer Portal
1. **Identifiers → +** → App IDs → asegúrate que `com.entregax.mobile` tiene **Sign In with Apple** habilitado.
2. **Identifiers → +** → **Services IDs** → crea `com.entregax.web` y configura "Sign In with Apple":
   - Primary App ID: `com.entregax.mobile`
   - Domains: `www.entregax.app`, `entregax.app`
   - Return URLs: `https://www.entregax.app/login`
3. **Keys → +** → Sign in with Apple → descarga el `.p8` (sólo se necesita si vamos a hacer flujo server-to-server; para id_token verification que ya implementamos no es obligatorio).

---

## Migración DB

No requiere ejecución manual. Las columnas `users.google_sub`, `users.apple_sub`, `users.auth_provider` se crean automáticamente la primera vez que entra una request a `/api/auth/google` o `/api/auth/apple` (función `ensureSocialColumns` con `ADD COLUMN IF NOT EXISTS`).

## Endpoints expuestos

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/api/auth/google` | `{ idToken }` | `{ message, user, access }` (igual que login normal) |
| POST | `/api/auth/apple`  | `{ idToken, fullName? }` | idem |
| GET  | `/api/auth/social/status` | — | `{ google: {...}, apple: {...} }` |
