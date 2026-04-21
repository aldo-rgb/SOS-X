# 🚀 Publicar EntregaX en App Store y Google Play

Proyecto Expo managed workflow → build en la nube con **EAS Build** y envío automático con **EAS Submit**. No necesitas Xcode abierto.

## 0. Prerrequisitos (una sola vez)

| Item | Dónde |
|------|-------|
| Cuenta Apple Developer ($99/año) | https://developer.apple.com/programs/ |
| Cuenta Google Play Developer ($25 único) | https://play.google.com/console |
| Cuenta Expo (gratis) | https://expo.dev/signup |
| Node 20+ y npm | `brew install node` |

Instalar EAS CLI global:

```bash
npm install -g eas-cli
eas login
```

## 1. Crear la App en App Store Connect

1. Entra a https://developer.apple.com/account/resources/identifiers/list → **+** → **App IDs → App** →
   - Description: `EntregaX`
   - Bundle ID (Explicit): `com.entregax.mobile`
   - Capabilities: deja por defecto
   - Continue → Register
2. Entra a https://appstoreconnect.apple.com → **Mis Apps → +** → **Nueva app iOS**:
   - Plataforma: **iOS**
   - Nombre: `EntregaX`
   - Idioma principal: Español (México)
   - Bundle ID: `com.entregax.mobile`
   - SKU: `entregax-ios-001`
   - Acceso: Full Access
3. **Anota**:
   - Apple ID (tu email) → usarás en `eas.json` → `submit.production.ios.appleId`
   - App Store Connect App ID (número de 10 dígitos visible en la URL: `/app/XXXXXXXXXX`) → `ascAppId`
   - Apple Team ID (10 chars, visible en https://developer.apple.com/account#MembershipDetailsCard) → `appleTeamId`

## 2. Crear la App en Google Play

1. https://play.google.com/console → **Crear aplicación**
2. Nombre: `EntregaX` · Idioma: Español (México) · App gratuita
3. Ve a **Users and permissions → API access → Service accounts**:
   - Crea un service account con rol **Release Manager**
   - Descarga el JSON key → guárdalo como:
     ```
     entregax-mobile-app/secrets/play-store-service-account.json
     ```
   - La carpeta `secrets/` ya está en `.gitignore` (no se sube a git).

## 3. Vincular el proyecto con EAS

```bash
cd entregax-mobile-app
eas init
```

Esto crea el `projectId` en Expo y lo escribe en `app.json`.

Luego edita [eas.json](eas.json) y reemplaza:
- `REPLACE_WITH_YOUR_APPLE_ID_EMAIL` → tu Apple ID
- `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` → el ASC App ID
- `REPLACE_WITH_APPLE_TEAM_ID` → tu Apple Team ID

## 4. Verificar el icono

El icono [assets/icon.png](assets/icon.png) **debe**:
- Ser PNG de **1024×1024**
- Sin transparencia (fondo sólido)
- Sin esquinas redondeadas (iOS las aplica automáticamente)

Si no cumple, regenera con https://www.appicon.co/ o similar y reemplaza el archivo.

## 5. Build de producción en la nube

```bash
# iOS (genera .ipa en servidores de Expo, ~15 min)
npm run build:ios

# Android (genera .aab)
npm run build:android

# O ambos:
npm run build:all
```

La primera vez EAS te pedirá:
- **Apple ID + password + 2FA** → genera automáticamente:
  - Distribution certificate
  - Provisioning profile
  - Push key (si aplica)
- **Android**: genera keystore automático (guardado en EAS).

Cuando termine verás la URL del build con botón "Download".

## 6. Enviar a las tiendas

```bash
# App Store
npm run submit:ios

# Play Store (sube como borrador)
npm run submit:android
```

## 7. Completar ficha en App Store Connect

Antes de enviar a revisión, entra a https://appstoreconnect.apple.com → EntregaX → **iOS App 1.0**:

### Información obligatoria
- **Subtítulo** (30 chars): `Tu casillero en USA y China`
- **Descripción promocional** (170 chars): texto corto que pueden cambiar sin revisión.
- **Descripción** (4000 chars): ver plantilla abajo.
- **Palabras clave** (100 chars, coma separado): ver plantilla abajo.
- **URL de soporte**: `https://entregax.app/soporte`
- **URL de marketing**: `https://entregax.app`
- **URL política de privacidad** (OBLIGATORIO): `https://entregax.app/privacidad`
- **Categoría primaria**: Business · **Secundaria**: Utilities

### Screenshots obligatorios
Mínimo 3 imágenes por tamaño:
- iPhone 6.9" (iPhone 16 Pro Max): 1320×2868 px
- iPhone 6.5" (iPhone 11 Pro Max): 1242×2688 px
- iPad 13" (solo si activas `supportsTablet: true` — ya está): 2064×2752

Tip rápido: usa https://screenshots.pro o toma con un simulador de iOS (Xcode → Window → Devices → Simulator → ⌘S).

### App Privacy
Declara los datos que recolectas. Plantilla para EntregaX:

| Dato | Uso | Vinculado al usuario | Tracking |
|------|-----|----------------------|----------|
| Email | Autenticación | ✅ | ❌ |
| Nombre | Identificación | ✅ | ❌ |
| Teléfono | Notificaciones/soporte | ✅ | ❌ |
| Dirección | Envío de paquetes | ✅ | ❌ |
| Ubicación precisa | Sucursal cercana | ✅ | ❌ |
| Foto/cámara | Fotos de paquetes, QR | ✅ | ❌ |
| Identificadores de dispositivo | Push notifications | ✅ | ❌ |

### Export Compliance
- "¿Tu app usa encriptación?" → **Yes**
- "¿Califica para exención?" → **Yes** (solo HTTPS estándar).
- Ya incluido en [app.json](app.json) como `ITSAppUsesNonExemptEncryption: false`.

### Demo Account (OBLIGATORIO para revisores)
En **App Review Information → Sign-In required**:
- Username: `appreview@entregax.com`
- Password: (una que crees específica)
- Notes: "Cuenta de prueba con paquetes simulados."

### Age Rating
Cuestionario → típicamente **4+** (sin contenido adulto).

### Build
Una vez el submit termine, aparecerá el build ~10 min después. Selecciónalo.

## 8. Enviar a revisión

Click **Add for Review → Submit for Review**. Revisión de Apple: **24-72h**.

---

## 📝 Plantillas de texto

### Descripción (4000 chars)

```
EntregaX - Tu Casillero Internacional

EntregaX es la plataforma logística que conecta a México con Estados Unidos y China. Gestiona todos tus envíos desde una sola app: recibe compras internacionales, rastrea paquetes en tiempo real y paga con total transparencia.

FUNCIONES PRINCIPALES:

📦 Casillero USA y China
Te asignamos una dirección en Estados Unidos y China para que compres en cualquier tienda online. Tus paquetes llegan a nuestra bodega y los consolidamos para enviarlos a México.

✈️ Múltiples servicios de envío
- Carga aérea China-México
- Carga marítima FCL/LCL
- Servicio DHL Express
- Entregas nacionales

🔍 Rastreo en tiempo real
Sigue cada paquete desde que llega a bodega hasta que lo recibes. Notificaciones push en cada etapa.

💳 Pagos fáciles
Paga en pesos mexicanos vía transferencia, tarjeta o efectivo en sucursal. Consulta tus saldos y facturas.

📍 Red de sucursales
Encuentra la sucursal más cercana para recoger tus paquetes o solicita entrega a domicilio.

🛡️ Garantía GEX
Asegura el valor de tus envíos con nuestra garantía extendida opcional.

🏷️ Instrucciones por paquete
Indica qué hacer con cada paquete: consolidar, reempacar, reenviar o retener en bodega.

EntregaX es operado por Urban WOD CF SA DE CV y cumple con toda la regulación aduanera mexicana.

¿Necesitas ayuda? Escríbenos a soporte@entregax.app o visita https://entregax.app
```

### Keywords (100 chars)

```
casillero,envios,paqueteria,china,usa,rastreo,importacion,dhl,maritimo,aereo,logistica,paquetes
```

### Subtítulo (30 chars)

```
Tu casillero en USA y China
```

---

## 🔁 Flujo típico para nuevas versiones

```bash
# 1. Cambia la version en app.json ("version": "1.0.1")
# 2. Build + submit
npm run build:ios && npm run submit:ios

# Para Android igual
npm run build:android && npm run submit:android
```

El campo `buildNumber` / `versionCode` se auto-incrementa por `"autoIncrement": true` en [eas.json](eas.json).

## ⚠️ Problemas comunes

| Error | Solución |
|-------|----------|
| `Invalid icon` | Icon debe ser 1024×1024 PNG sin alpha |
| `Missing Privacy Policy URL` | Agrégala en App Store Connect |
| `ITSAppUsesNonExemptEncryption` warning | Ya configurado en app.json |
| Rechazo 4.0 Design | Asegura demo account con data real |
| Rechazo 5.1.1 Data | Justifica cada permiso en Info.plist (ya hecho) |
| Build falla en EAS | `eas build --clear-cache --platform ios` |

## 📞 Siguiente paso

Ejecuta:
```bash
cd entregax-mobile-app
eas login          # si no lo hiciste
eas init           # vincula projectId
npm run build:ios  # primer build de producción
```
