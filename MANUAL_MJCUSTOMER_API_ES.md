# 📦 Manual de Integración MJCustomer API - EntregaX

**Fecha:** 19 de febrero de 2026  
**Versión:** 2.0  
**Idioma:** Español

---

## 📋 Resumen

Este manual describe cómo configurar la integración entre **EntregaX** y la API de **MJCustomer** (api.mjcustomer.com) para sincronizar datos de envíos desde el almacén en China.

### Modelo de Integración: PULL (Consulta)
En lugar de recibir webhooks, EntregaX consulta activamente la API de MJCustomer para obtener datos de órdenes.

---

## 🔐 1. Configuración de Credenciales

### Opción A: Variables de Entorno (.env)

Editar el archivo `.env` del backend:

```env
# ============================================
# MJCUSTOMER API - Integración China
# ============================================
MJCUSTOMER_API_URL=http://api.mjcustomer.com
MJCUSTOMER_USERNAME=tu_usuario_aqui
MJCUSTOMER_PASSWORD=tu_contraseña_aqui
```

**¿Dónde obtener las credenciales?**
- Contactar al proveedor MJCustomer/Mojie para solicitar acceso a la API
- Las credenciales son las mismas que usas para acceder a su sistema web

### Opción B: Login Manual via API

Si prefieres no guardar las credenciales en el archivo, puedes hacer login manualmente:

```bash
# Login manual enviando credenciales en el body
curl -X POST http://localhost:3001/api/china/mjcustomer/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_ENTREGAX" \
  -d '{
    "username": "tu_usuario_mjcustomer",
    "password": "tu_contraseña_mjcustomer"
  }'
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Login exitoso",
  "tokenPreview": "eyJhbGciOiJIUzI1N...",
  "expiresAt": "2026-02-20T21:16:51.055Z"
}
```

---

## 🔄 2. Endpoints Disponibles

### 2.1 Login a MJCustomer
```
POST /api/china/mjcustomer/login
```

**Headers:**
- `Authorization: Bearer {token_entregax}`
- `Content-Type: application/json`

**Body (opcional si ya están en .env):**
```json
{
  "username": "usuario",
  "password": "contraseña"
}
```

### 2.2 Consultar Orden Individual
```
GET /api/china/pull/{orderCode}
```

**Ejemplo:**
```bash
curl -X GET "http://localhost:3001/api/china/pull/SHIP2507438tkMW" \
  -H "Authorization: Bearer TU_TOKEN_ENTREGAX"
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Datos sincronizados desde MJCustomer",
  "data": [{
    "fno": "AIR2609602vQvox",
    "receiptId": 15,
    "userId": 42,
    "shippingMark": "S3019",
    "packagesCreated": 3,
    "packagesUpdated": 0
  }]
}
```

### 2.3 Sincronización Masiva
```
POST /api/china/pull-batch
```

**Body:**
```json
{
  "orderCodes": [
    "SHIP2507438tkMW",
    "SHIP2507439abCd",
    "AIR2609602vQvox"
  ]
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Procesados 3 exitosos, 0 errores",
  "results": [...],
  "errors": []
}
```

### 2.4 Actualizar Token Manualmente
```
PUT /api/china/config/token
```

**Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5..."
}
```

> ⚠️ Requiere rol Director o superior

---

## 📊 3. Formato de Datos (JSON)

### Estructura de Respuesta de MJCustomer API

```json
{
  "code": 200,
  "type": "success",
  "message": "操作成功",
  "result": {
    "fno": "AIR2609602vQvox",
    "shippingMark": "S3019",
    "totalQty": 1,
    "totalWeight": 23.7,
    "totalVolume": 22.44,
    "totalCbm": 0.135,
    "file": ["http://api.mojiegrupo.com/order/..."],
    "data": [
      {
        "childNo": "AIR2609602vQvox-001",
        "trajecotryName": "Guangzhou - CDMX",
        "weight": 23.7,
        "long": 72,
        "width": 34,
        "height": 55,
        "proName": "Accesorios de automóviles",
        "customsBno": "L I u7c7b",
        "singleVolume": 22.44,
        "singleCbm": 0.135,
        "billNo": null,
        "etd": null,
        "eta": null
      }
    ]
  },
  "extras": null,
  "time": "2026-02-19 10:30:45"
}
```

### Descripción de Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `fno` | string | Número de orden único (ej: AIR2609602vQvox) |
| `shippingMark` | string | Código del cliente / Box ID |
| `totalQty` | number | Cantidad total de cajas |
| `totalWeight` | number | Peso total en kg |
| `totalVolume` | number | Volumen total en cm³ |
| `totalCbm` | number | CBM total (metros cúbicos) |
| `file` | string[] | URLs de fotos/evidencias |
| `data` | array | Array de cajas individuales |

#### Campos de cada caja (data[]):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `childNo` | string | ID único de la caja (ej: ...-001) |
| `trajecotryName` | string | Nombre de la ruta |
| `weight` | number | Peso en kg |
| `long` | number | Largo en cm |
| `width` | number | Ancho en cm |
| `height` | number | Alto en cm |
| `proName` | string | Descripción del producto |
| `customsBno` | string | Código aduanal |
| `singleVolume` | number | Volumen unitario |
| `singleCbm` | number | CBM unitario |
| `billNo` | string | Guía aérea (puede ser null) |
| `etd` | string | Fecha estimada de salida |
| `eta` | string | Fecha estimada de llegada |

---

## 🔧 4. Flujo de Autenticación

```
┌─────────────────────┐
│   1. Login          │
│   POST /api/login   │
│   {user, password}  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   2. Obtener Token  │
│   JWT válido 24h    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   3. Consultar API  │
│   Authorization:    │
│   Bearer {token}    │
└─────────────────────┘
```

### Login Automático
El sistema hace login automático cuando:
- Se configura `MJCUSTOMER_USERNAME` y `MJCUSTOMER_PASSWORD` en `.env`
- El token expira o está vacío
- Se llama cualquier endpoint de sincronización

---

## 🚨 5. Errores Comunes

### Error 401: Token Expirado
```json
{
  "code": 401,
  "message": "登录已过期，请重新登录"
}
```
**Solución:** El sistema renovará el token automáticamente si las credenciales están configuradas.

### Error 400: Código de Orden No Encontrado
```json
{
  "code": 400,
  "message": "订单不存在"
}
```
**Solución:** Verificar que el código de orden sea correcto.

### Error de Conexión
```json
{
  "success": false,
  "error": "No se pudo obtener token de MJCustomer. Verifica credenciales."
}
```
**Solución:** 
1. Verificar credenciales en `.env`
2. Verificar que api.mjcustomer.com esté accesible
3. Probar login manual con `POST /api/china/mjcustomer/login`

---

## 📝 6. Checklist de Configuración

- [ ] Obtener credenciales de MJCustomer (usuario y contraseña)
- [ ] Agregar credenciales al archivo `.env`:
  ```
  MJCUSTOMER_USERNAME=mi_usuario
  MJCUSTOMER_PASSWORD=mi_contraseña
  ```
- [ ] Reiniciar el backend
- [ ] Probar login: `POST /api/china/mjcustomer/login`
- [ ] Probar sincronización: `GET /api/china/pull/{orderCode}`

---

## 📞 Soporte

- **EntregaX:** soporte@entregax.com
- **MJCustomer:** Contactar a proveedor Mojie

---

*Documento generado: 19 de febrero de 2026*
