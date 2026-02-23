# 📚 EntregaX - Manual del Programador

> **Última actualización:** 6 de febrero de 2026  
> **Versión:** 2.2.0

---

## 📋 Índice

1. [Arquitectura del Sistema](#arquitectura-del-sistema)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Estructura del Proyecto](#estructura-del-proyecto)
4. [Configuración del Entorno](#configuración-del-entorno)
5. [Base de Datos](#base-de-datos)
6. [Backend API](#backend-api)
7. [Frontend Web Admin](#frontend-web-admin)
8. [Mobile App](#mobile-app)
9. [Internacionalización (i18n)](#internacionalización-i18n)
10. [Autenticación y Autorización](#autenticación-y-autorización)
11. [Sistema de Bodegas Multi-Ubicación](#sistema-de-bodegas-multi-ubicación)
12. [Motor de Precios](#motor-de-precios)
13. [Sistema de Facturación Fiscal](#sistema-de-facturación-fiscal)
14. [Sistema de Verificación KYC](#sistema-de-verificación-kyc)
15. [Sistema de Pagos](#sistema-de-pagos)
16. [Sistema de Pagos a Proveedores](#sistema-de-pagos-a-proveedores)
17. [Sistema de Direcciones](#sistema-de-direcciones)
18. [API MJCustomer - China TDI Aéreo](#api-mjcustomer---china-tdi-aéreo) ⭐ NUEVO
19. [Módulos Implementados](#módulos-implementados)
20. [Guía de Desarrollo](#guía-de-desarrollo)
21. [Credenciales de Prueba](#credenciales-de-prueba)
22. [Changelog](#changelog)

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        EntregaX Ecosystem                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Web Admin     │  │   Mobile App    │  │   Backend API   │  │
│  │   (React+Vite)  │  │   (Expo+RN)     │  │  (Express+TS)   │  │
│  │   Port: 5174    │  │   Port: 8081    │  │   Port: 3001    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                │                                  │
│                    ┌───────────▼───────────┐                     │
│                    │     PostgreSQL DB     │                     │
│                    │     (entregax_db)     │                     │
│                    └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack Tecnológico

### Backend API
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Node.js | 18+ | Runtime |
| TypeScript | 5.x | Tipado estático |
| Express | 4.x | Framework HTTP |
| PostgreSQL | 15 | Base de datos |
| bcrypt | 5.x | Hash de contraseñas |
| jsonwebtoken | 9.x | Tokens JWT |
| pg | 8.x | Cliente PostgreSQL |
| cors | 2.x | CORS middleware |
| dotenv | 16.x | Variables de entorno |

### Frontend Web Admin
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| React | 19.x | UI Library |
| Vite | 7.x | Build tool |
| TypeScript | 5.x | Tipado estático |
| Material UI | 5.x | Componentes UI |
| Axios | 1.x | Cliente HTTP |
| i18next | 23.x | Internacionalización |
| react-i18next | 14.x | Bindings React |

### Mobile App
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Expo | SDK 54 | Framework |
| React Native | 0.81.5 | UI Framework |
| TypeScript | 5.x | Tipado estático |
| React Navigation | 7.x | Navegación |
| React Native Paper | 5.x | Componentes UI |
| Expo Vector Icons | 14.x | Iconos |

---

## 📁 Estructura del Proyecto

```
SOS-X/
├── DEVELOPER_MANUAL.md          # Este manual
├── entregax-backend-api/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                     # Variables de entorno
│   └── src/
│       ├── index.ts             # Entry point + rutas
│       ├── db.ts                # Conexión PostgreSQL
│       ├── types.ts             # Tipos TypeScript
│       ├── authController.ts    # Auth + Users + Dashboard
│       ├── packageController.ts # Paquetes + Consolidaciones
│       ├── warehouseController.ts   # ⭐ Paneles de bodega multi-ubicación
│       ├── pricingEngine.ts         # ⭐ Motor de cotización
│       ├── invoicingController.ts   # ⭐ Facturación fiscal (CFDI + Facturapi)
│       ├── commissionController.ts  # ⭐ Comisiones y referidos
│       ├── addressController.ts     # ⭐ Direcciones de envío del cliente
│       ├── verificationController.ts # ⭐ Verificación KYC con GPT-4 Vision
│       ├── paymentController.ts     # ⭐ Pagos con PayPal
│       └── supplierPaymentController.ts # ⭐ Pagos a proveedores + FX
│
├── entregax-web-admin/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx             # Entry point
│       ├── App.tsx              # Layout principal + rutas
│       ├── App.css              # Estilos globales
│       ├── i18n/
│       │   ├── index.ts         # Configuración i18n
│       │   └── locales/
│       │       ├── es.json      # Traducciones español
│       │       └── en.json      # Traducciones inglés
│       └── pages/
│           ├── LoginPage.tsx           # Página de login
│           ├── ClientsPage.tsx         # Gestión de clientes
│           ├── ShipmentsPage.tsx       # Recepción PO Box USA
│           ├── QuotesPage.tsx          # Cotizaciones
│           ├── ConsolidationsPage.tsx  # Control de salidas
│           ├── WarehouseHubPage.tsx    # ⭐ Hub de paneles de bodega
│           ├── WarehouseReceptionPage.tsx # ⭐ Panel individual por ubicación
│           ├── PricingPage.tsx         # ⭐ Gestión de listas de precios
│           ├── FiscalPage.tsx          # ⭐ Facturación fiscal
│           ├── CommissionsPage.tsx     # ⭐ Comisiones y referidos
│           ├── SupplierPaymentsPage.tsx # ⭐ Pagos a proveedores
│           ├── SettingsPage.tsx        # Configuración
│           └── VerificationsPage.tsx   # ⭐ Verificación de clientes
│
└── entregax-mobile-app/
    ├── package.json
    ├── app.json
    ├── App.tsx                  # Navegación principal
    ├── index.ts                 # Entry point Expo
    ├── assets/                  # Imágenes y recursos
    └── src/
        ├── services/
        │   └── api.ts           # Cliente API + tipos
        └── screens/
            ├── LoginScreen.tsx           # Login móvil
            ├── HomeScreen.tsx            # Lista de paquetes + selección
            └── ConsolidationSummary.tsx  # Confirmación de envío
```

---

## ⚙️ Configuración del Entorno

### Variables de Entorno (Backend)
```bash
# entregax-backend-api/.env
PORT=3001
DATABASE_URL=postgres://localhost:5432/entregax_db
JWT_SECRET=tu_clave_secreta_aqui
JWT_EXPIRES_IN=24h
```

### Iniciar Desarrollo
```bash
# Terminal 1 - Backend
cd entregax-backend-api
npx ts-node src/index.ts
# Corre en http://localhost:3001

# Terminal 2 - Frontend Web
cd entregax-web-admin
npm run dev
# Corre en http://localhost:5174

# Terminal 3 - Mobile App
cd entregax-mobile-app
npx expo start
# Escanear QR con Expo Go
# exp://192.168.1.126:8081 (tu IP local)
```

### Iniciar Backend en Background (macOS)
```bash
cd entregax-backend-api
nohup npx ts-node src/index.ts > /tmp/backend.log 2>&1 &
```

---

## 🗄️ Base de Datos

### Conexión PostgreSQL
- **Host:** localhost
- **Puerto:** 5432
- **Base de datos:** entregax_db
- **Path binarios:** `/opt/homebrew/opt/postgresql@15/bin/`

### Tabla: `users`
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    box_id VARCHAR(20) UNIQUE,          -- Casillero: ETX-XXXX
    role user_role DEFAULT 'client',     -- ENUM
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Campos para sistema de bodegas
    warehouse_location VARCHAR(50),  -- china_air, china_sea, usa_pobox, mx_cedis, mx_national
    
    -- Campos para referidos
    referral_code VARCHAR(20) UNIQUE,
    referred_by_id INTEGER REFERENCES users(id),
    
    -- Lista de precios asignada
    assigned_price_list_id INTEGER REFERENCES price_lists(id),
    
    -- Preferencias de envío
    default_transport VARCHAR(20),
    default_carrier VARCHAR(50)
);

-- ENUM de roles
CREATE TYPE user_role AS ENUM (
    'super_admin',      -- Acceso total
    'branch_manager',   -- Gerente de sucursal
    'counter_staff',    -- Personal de mostrador
    'warehouse_ops',    -- Operaciones de bodega
    'client'            -- Cliente final
);
```

### Tabla: `warehouse_receipts` ⭐ NUEVO
```sql
CREATE TABLE warehouse_receipts (
    id SERIAL PRIMARY KEY,
    tracking_number VARCHAR(100) UNIQUE NOT NULL,
    service_code VARCHAR(50) NOT NULL,
    user_id INTEGER REFERENCES users(id),           -- Cliente
    weight_kg DECIMAL(10, 2),
    length_cm DECIMAL(10, 2),
    width_cm DECIMAL(10, 2),
    height_cm DECIMAL(10, 2),
    quantity INTEGER DEFAULT 1,
    quoted_usd DECIMAL(10, 2),                      -- Cotización calculada
    quoted_mxn DECIMAL(10, 2),
    fx_rate DECIMAL(10, 4),
    status VARCHAR(50) DEFAULT 'received',          -- received, in_transit, delivered
    payment_status VARCHAR(50) DEFAULT 'pending',   -- pending, paid, credit
    received_by INTEGER REFERENCES users(id),       -- Staff que recibió
    warehouse_location VARCHAR(50) NOT NULL,        -- Ubicación de bodega
    notes TEXT,
    photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_warehouse_receipts_location ON warehouse_receipts(warehouse_location);
CREATE INDEX idx_warehouse_receipts_date ON warehouse_receipts(created_at);
```

### Tabla: `logistics_services` ⭐ NUEVO
```sql
CREATE TABLE logistics_services (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,   -- AIR_CHN_MX, SEA_CHN_MX, POBOX_USA, etc.
    name VARCHAR(100) NOT NULL,
    calculation_type VARCHAR(20),        -- per_kg, per_cbm, per_package
    requires_dimensions BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Servicios disponibles
INSERT INTO logistics_services (code, name, calculation_type, requires_dimensions) VALUES
('AIR_CHN_MX', 'Aéreo China → México', 'per_kg', true),
('SEA_CHN_MX', 'Marítimo China → México', 'per_cbm', true),
('POBOX_USA', 'PO Box USA → México', 'per_package', false),
('AA_DHL', 'Liberación AA DHL', 'per_package', false),
('NATIONAL', 'Nacional México', 'per_kg', true);
```

### Tabla: `price_lists` ⭐ NUEVO
```sql
CREATE TABLE price_lists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Listas de ejemplo
INSERT INTO price_lists (name, description, is_default) VALUES
('Tarifa Pública', 'Precios estándar para clientes nuevos', true),
('VIP', 'Descuentos para clientes frecuentes', false),
('Mayorista', 'Precios para revendedores', false);
```

### Tabla: `pricing_rules` ⭐ NUEVO
```sql
CREATE TABLE pricing_rules (
    id SERIAL PRIMARY KEY,
    price_list_id INTEGER REFERENCES price_lists(id),
    service_id INTEGER REFERENCES logistics_services(id),
    min_unit DECIMAL(10, 2) DEFAULT 0,      -- Rango desde
    max_unit DECIMAL(10, 2) DEFAULT 999999, -- Rango hasta
    unit_cost DECIMAL(10, 2) NOT NULL,      -- Costo por unidad
    fixed_fee DECIMAL(10, 2) DEFAULT 0,     -- Cargo fijo
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ejemplo: Aéreo China con bloques de peso
INSERT INTO pricing_rules (price_list_id, service_id, min_unit, max_unit, unit_cost, fixed_fee) VALUES
(1, 1, 0, 45, 12.00, 25.00),       -- 0-45kg: $12/kg + $25
(1, 1, 45.01, 100, 10.50, 25.00),  -- 45-100kg: $10.50/kg + $25
(1, 1, 100.01, 999999, 9.00, 25.00); -- 100+kg: $9/kg + $25
```

### Tabla: `packages`
```sql
CREATE TABLE packages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    tracking_internal VARCHAR(50) UNIQUE NOT NULL,  -- US-XXXX#### (Master)
    tracking_provider VARCHAR(100),                  -- Tracking del proveedor
    description VARCHAR(255),
    weight DECIMAL(10, 2),
    dimensions VARCHAR(50),                          -- "30x20x15"
    declared_value DECIMAL(10, 2),
    status package_status DEFAULT 'received',
    
    -- Campos de destino
    destination_country VARCHAR(100),
    destination_city VARCHAR(100),
    destination_address TEXT,
    destination_zip VARCHAR(20),
    destination_phone VARCHAR(30),
    destination_contact VARCHAR(150),
    carrier VARCHAR(50),                             -- FedEx, UPS, DHL, etc.
    
    -- Campos para sistema Master/Hijas
    is_master BOOLEAN DEFAULT false,
    master_id INTEGER REFERENCES packages(id),       -- NULL si es master
    box_number INTEGER,                              -- 1, 2, 3...
    total_boxes INTEGER,                             -- Total de cajas
    
    image_url TEXT,
    notes TEXT,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ENUM de estados
CREATE TYPE package_status AS ENUM (
    'received',      -- Recibido en bodega USA
    'in_transit',    -- En tránsito a México
    'customs',       -- En aduana
    'ready_pickup',  -- Listo para recoger
    'delivered'      -- Entregado
);
```

### Tabla: `consolidations`
```sql
CREATE TABLE consolidations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',    -- pending, processing, shipped, delivered
    total_weight DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relación con packages (columna agregada a packages)
ALTER TABLE packages ADD COLUMN consolidation_id INTEGER REFERENCES consolidations(id);
```

### Flujo de Consolidación
```
1. Cliente selecciona paquetes en Mobile App
2. Presiona FAB "Enviar (X) Paquetes"
3. Ve resumen en ConsolidationSummary
4. Confirma orden → POST /api/consolidations
5. Backend crea consolidation + actualiza packages
6. Admin ve en Web Admin → "Salidas" → Procesar
```

### Sistema de Tracking Master + Hijas
```
Formato de tracking:
- Master:  US-{timestamp}{random}      → US-17386542001234
- Hija 1:  US-{timestamp}{random}-01   → US-17386542001234-01
- Hija 2:  US-{timestamp}{random}-02   → US-17386542001234-02
```

---

## 🔌 Backend API

### Base URL
```
http://localhost:3001/api
```

### Endpoints Públicos

#### Health Check
```http
GET /health
Response: { "status": "OK", "timestamp": "..." }
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "contraseña"
}

Response:
{
  "access": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400
  },
  "user": {
    "id": 1,
    "fullName": "Nombre",
    "email": "email",
    "boxId": "ETX-1234",
    "role": "super_admin"
  }
}
```

#### Registro
```http
POST /api/auth/register
Content-Type: application/json

{
  "fullName": "Nombre Completo",
  "email": "nuevo@ejemplo.com",
  "password": "contraseña",
  "phone": "+52 55 1234 5678"  // opcional
}
```

### Endpoints Protegidos (requieren JWT)

#### Headers requeridos
```http
Authorization: Bearer {token}
```

#### Usuarios
```http
GET /api/users                    # Lista todos los usuarios
GET /api/users/:id               # Obtiene usuario por ID
PUT /api/users/:id               # Actualiza usuario
DELETE /api/users/:id            # Elimina usuario
```

#### Dashboard
```http
GET /api/dashboard/summary
Response:
{
  "users": { "total": 10, "newThisWeek": 2 },
  "packages": {
    "inTransit": 5,
    "pendingPickup": 3,
    "deliveredToday": 8
  },
  "monthlyIncome": 15000
}
```

#### Paquetes
```http
GET /api/packages                 # Lista paquetes (filtro: ?status=received)
POST /api/packages                # Crear paquete (con soporte multi-caja)
GET /api/packages/:id            # Obtener paquete
PATCH /api/packages/:id/status   # Cambiar estado
GET /api/packages/:id/labels     # Obtener etiquetas para imprimir
```

#### Crear Paquete Multi-Caja
```http
POST /api/packages
Content-Type: application/json

{
  "boxId": "ETX-1234",
  "trackingProvider": "1Z999AA10123456784",
  "declaredValue": 150.00,
  "description": "Electrónicos",
  "notes": "Frágil",
  "carrier": "FedEx",
  "destination": {
    "country": "México",
    "city": "Ciudad de México",
    "address": "Av. Reforma 123, Col. Centro",
    "zip": "06600",
    "phone": "+52 55 1234 5678",
    "contact": "Juan Pérez"
  },
  "boxes": [
    { "weight": 5.5, "length": 30, "width": 20, "height": 15 },
    { "weight": 3.2, "length": 25, "width": 18, "height": 12 }
  ]
}

Response:
{
  "message": "Envío registrado exitosamente",
  "shipment": {
    "masterId": 1,
    "masterTracking": "US-17386542001234",
    "totalBoxes": 2,
    "totalWeight": 8.7,
    "labels": [
      { "tracking": "US-17386542001234", "isMaster": true, ... },
      { "tracking": "US-17386542001234-01", "isMaster": false, "boxNumber": 1, ... },
      { "tracking": "US-17386542001234-02", "isMaster": false, "boxNumber": 2, ... }
    ]
  }
}
```

#### Consolidaciones (Salidas)
```http
# Crear consolidación desde Mobile App
POST /api/consolidations
Authorization: Bearer {token}
Content-Type: application/json

{
  "packageIds": [1, 2, 3],
  "totalWeight": 15.5
}

Response:
{
  "message": "Consolidación creada exitosamente",
  "consolidation": {
    "id": 1,
    "userId": 5,
    "status": "pending",
    "totalWeight": 15.5,
    "packageCount": 3
  }
}

# Listar consolidaciones (Admin)
GET /api/admin/consolidations
Authorization: Bearer {token}

Response:
[
  {
    "id": 1,
    "status": "pending",
    "total_weight": 15.5,
    "created_at": "2025-01-20T...",
    "user_name": "Aldo Hernández",
    "user_email": "aldo@entregax.com",
    "package_count": 3
  }
]
```

---

## 🌐 Frontend Web Admin

### Design System

#### Colores Principales
```typescript
const ORANGE = '#F05A28';  // Action Orange - Botones, acentos
const BLACK = '#111111';   // Deep Tech Black - Headers, textos
```

#### Gradientes
```css
/* Botón primario */
background: linear-gradient(135deg, #F05A28 0%, #ff7849 100%);

/* Header del drawer */
background: linear-gradient(135deg, #111111 0%, #2d2d2d 100%);
```

### Componentes Principales

#### App.tsx
- Layout principal con Drawer lateral
- Gestión de autenticación (JWT en localStorage)
- Selector de idioma (ES/EN)
- Routing interno por estado

**Menú de Navegación (13 items):**
| # | Item | Componente | Descripción |
|---|------|------------|-------------|
| 0 | Dashboard | DashboardContent | Resumen general |
| 1 | Clientes | ClientsPage | CRUD de usuarios |
| 2 | Envíos | WarehouseHubPage | Hub de bodegas (admin) / Panel directo (staff) |
| 3 | Cotizaciones | QuotesPage | Calculadora de precios |
| 4 | Salidas | ConsolidationsPage | Control de consolidaciones |
| 5 | Facturación | FiscalPage | CFDI y perfiles fiscales |
| 6 | Comisiones | CommissionsPage | Referidos y porcentajes |
| 7 | Listas de Precios | PricingPage | Tarifas y reglas |
| 8 | Pagos Proveedores | SupplierPaymentsPage | Control de egresos |
| 9 | Verificaciones | VerificationsPage | Validación de clientes |
| 10 | Configuración | SettingsPage | Preferencias del sistema |

#### LoginPage.tsx
- Formulario de login con validación
- Diseño con branding EntregaX
- Integración con API de autenticación

#### ClientsPage.tsx
- CRUD completo de clientes
- Filtros por rol y búsqueda
- Paginación
- Diálogos de edición/eliminación

#### ShipmentsPage.tsx
- Wizard de recepción de paquetes (5 pasos)
- Sistema Master + Hijas para multi-caja
- Cambio de estado de paquetes
- Impresión de etiquetas
- Filtros por estado

#### ConsolidationsPage.tsx ⭐
- Vista de "Salidas" para administradores
- Cards de estadísticas (Pendientes, Procesando, Enviados)
- Tabla con todas las consolidaciones
- Columnas: ID, Cliente, Email, Paquetes, Peso, Estado, Fecha
- Botón "Procesar" para cambiar estado
- Soporte i18n (ES/EN)

#### WarehouseHubPage.tsx ⭐ NUEVO
- Hub central para acceder a todos los paneles de bodega
- 5 cards con gradientes y banderas para cada ubicación:
  - 🇺🇸 **PO Box USA** - Recepción desde Estados Unidos
  - 🇨🇳 **Aéreo China** - Envíos aéreos desde China
  - 🇨🇳 **Marítimo China** - Consolidados marítimos
  - 🇲🇽 **CEDIS México** - Liberación AA DHL
  - 🇲🇽 **Nacional México** - Envíos nacionales
- Lógica de acceso basada en roles:
  - `super_admin` → Ve hub con todos los paneles
  - Usuario con `warehouse_location` → Va directo a su panel
- Breadcrumb "← Volver" para navegar entre paneles

#### WarehouseReceptionPage.tsx ⭐ NUEVO
- Panel individual de recepción por ubicación
- **Dashboard de estadísticas:**
  - Total hoy, Pendientes, En tránsito, Entregados
  - Pendiente de pago, Total USD del día
- **Formulario de registro rápido:**
  - Tracking (con escaneo)
  - Selector de servicio (filtrado por ubicación)
  - Búsqueda de cliente por Box ID
  - Peso, dimensiones, cantidad
  - Cálculo automático de cotización
- **Tabla de recepciones del día:**
  - Tracking, Cliente, Servicio, Peso, Cotización, Estado
  - Botón de edición inline
- Filtros por ubicación de bodega automáticos

#### QuotesPage.tsx ⭐
- Cotizador de envíos rápidos
- Integración con motor de precios

### Wizard de Recepción de Paquetes

```
Paso 0: Agregar Cajas
├── Peso (kg) con botón "Leer Báscula"
├── Dimensiones (Largo x Ancho x Alto cm)
└── Lista de cajas agregadas

Paso 1: Tracking & Valor
├── Tracking del Proveedor (escaneo)
└── Valor Declarado (USD)

Paso 2: Destino & Paquetería
├── Selector de Paquetería (FedEx, UPS, DHL, etc.)
├── País
├── Ciudad
├── Dirección Completa
├── Código Postal
├── Teléfono
└── Contacto

Paso 3: Cliente
├── Selector de Cliente (Box ID)
├── Descripción del Contenido
└── Notas Adicionales

Paso 4: Confirmación
├── Tracking Master generado
├── Lista de Guías Hijas (si aplica)
└── Botón Imprimir Etiquetas
```

---

## 🌍 Internacionalización (i18n)

### Configuración
```typescript
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import es from './locales/es.json';
import en from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { es: { translation: es }, en: { translation: en } },
    fallbackLng: 'es',
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage']
    }
  });
```

### Estructura de Traducciones
```json
{
  "common": { "save", "cancel", "delete", "edit", "close", ... },
  "auth": { "login", "logout", "email", "password", ... },
  "menu": { "dashboard", "clients", "shipments", ... },
  "dashboard": { "welcome", "totalUsers", "inTransit", ... },
  "clients": { "title", "newClient", "searchPlaceholder", ... },
  "shipments": { "title", "receivePackage", "trackingInternal", ... },
  "wizard": { "addBoxes", "trackingValue", "destinationCarrier", ... },
  "status": { "received", "inTransit", "customs", "readyPickup", "delivered" },
  "carriers": { "fedex", "ups", "dhl", ... },
  "countries": { "mexico", "usa", "canada", ... },
  "roles": { "super_admin", "branch_manager", ... },
  "errors": { "required", "networkError", "loadPackages", ... }
}
```

### Uso en Componentes
```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t, i18n } = useTranslation();
  
  return (
    <div>
      <h1>{t('clients.title')}</h1>
      <p>{t('common.loading')}</p>
      
      {/* Con interpolación */}
      <p>{t('shipments.multiBoxInfo', { count: 3 })}</p>
      
      {/* Cambiar idioma */}
      <button onClick={() => i18n.changeLanguage('en')}>English</button>
    </div>
  );
}
```

---

## � Mobile App (Expo + React Native)

### Estructura de Pantallas
```
src/
├── screens/
│   ├── LoginScreen.tsx      # Pantalla de login
│   ├── HomeScreen.tsx       # Lista de paquetes + selección
│   └── ConsolidationSummary.tsx  # Resumen antes de enviar
├── services/
│   └── api.ts               # Configuración Axios + baseURL
└── App.tsx                  # NavigationContainer
```

### LoginScreen.tsx
- Formulario de email/password
- Diseño con gradiente naranja
- Almacena token y user en estado global
- Navega a HomeScreen tras login exitoso

### HomeScreen.tsx ⭐ PRINCIPAL
```
Funcionalidades:
├── Carga paquetes del usuario (GET /api/my-packages)
├── Muestra Card por paquete con:
│   ├── Foto del paquete (image_url)
│   ├── Tracking interno
│   ├── Descripción
│   ├── Peso y fecha
│   └── Chip de estado con color
├── Multi-Selección:
│   ├── Tap largo activa modo selección
│   ├── Checkbox visible en cada card
│   ├── Contador de seleccionados
│   └── FAB cambia a "Enviar (X) Paquetes"
└── FAB flotante para pre-alertar/consolidar
```

### ConsolidationSummary.tsx
```
Flujo de Confirmación:
├── Muestra lista de paquetes seleccionados
├── Calcula peso total
├── Botón "Confirmar Envío"
├── POST /api/consolidations
└── Muestra mensaje de éxito + ID de orden
```

### Configuración de API
```typescript
// src/services/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://192.168.1.126:3001/api',  // Tu IP local
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

export default api;
```

### Navegación (React Navigation 7)
```typescript
// Stack Navigator
<NavigationContainer>
  <Stack.Navigator>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Home" component={HomeScreen} />
    <Stack.Screen name="ConsolidationSummary" component={ConsolidationSummary} />
  </Stack.Navigator>
</NavigationContainer>
```

### Estilos React Native Paper
```typescript
// Tema personalizado
const theme = {
  colors: {
    primary: '#F05A28',      // Action Orange
    background: '#FFFFFF',
    surface: '#FFFFFF',
    text: '#111111',         // Deep Tech Black
    error: '#d32f2f',
  }
};
```

---

## �🔐 Autenticación y Autorización

### Flujo de Autenticación
```
1. Usuario ingresa credenciales en LoginPage
2. POST /api/auth/login
3. Backend valida con bcrypt
4. Backend genera JWT con datos del usuario
5. Frontend almacena token en localStorage
6. Todas las peticiones incluyen: Authorization: Bearer {token}
7. Backend middleware verifica JWT en rutas protegidas
```

### Roles y Permisos
| Rol | Descripción | Acceso |
|-----|-------------|--------|
| `super_admin` | Administrador total | Todo el sistema |
| `branch_manager` | Gerente de sucursal | Su sucursal + reportes |
| `counter_staff` | Mostrador | Recepción + entregas |
| `warehouse_ops` | Bodega | Inventario + paquetes |
| `client` | Cliente final | Solo sus paquetes |

### Estructura del JWT
```json
{
  "userId": 1,
  "email": "usuario@entregax.com",
  "role": "super_admin",
  "boxId": "ETX-1234",
  "iat": 1738654200,
  "exp": 1738740600
}
```

---

## 🏭 Sistema de Bodegas Multi-Ubicación

### Arquitectura de Ubicaciones

```
┌─────────────────────────────────────────────────────────────────┐
│                     Hub de Bodegas (Admin)                      │
│                      WarehouseHubPage.tsx                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ 🇺🇸 USA      │  │ 🇨🇳 China    │  │ 🇨🇳 China    │             │
│  │ PO Box      │  │ Aéreo       │  │ Marítimo    │             │
│  │ usa_pobox   │  │ china_air   │  │ china_sea   │             │
│  │ POBOX_USA   │  │ AIR_CHN_MX  │  │ SEA_CHN_MX  │             │
│  │ NATIONAL    │  │             │  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │ 🇲🇽 México   │  │ 🇲🇽 México   │                               │
│  │ CEDIS       │  │ Nacional    │                               │
│  │ mx_cedis    │  │ mx_national │                               │
│  │ AA_DHL      │  │ NATIONAL    │                               │
│  └─────────────┘  └─────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Ubicaciones Disponibles

| Código | Nombre | País | Servicios Permitidos |
|--------|--------|------|---------------------|
| `usa_pobox` | PO Box USA | 🇺🇸 | POBOX_USA, NATIONAL |
| `china_air` | Aéreo China | 🇨🇳 | AIR_CHN_MX |
| `china_sea` | Marítimo China | 🇨🇳 | SEA_CHN_MX |
| `mx_cedis` | CEDIS México | 🇲🇽 | AA_DHL |
| `mx_national` | Nacional México | 🇲🇽 | NATIONAL |

### Servicios Logísticos

| Código | Nombre | Tipo Cálculo | Requiere Dimensiones |
|--------|--------|--------------|---------------------|
| `AIR_CHN_MX` | Aéreo China → México | per_kg | ✅ |
| `SEA_CHN_MX` | Marítimo China → México | per_cbm | ✅ |
| `POBOX_USA` | PO Box USA → México | per_package | ❌ |
| `AA_DHL` | Liberación AA DHL | per_package | ❌ |
| `NATIONAL` | Nacional México | per_kg | ✅ |

### Flujo de Acceso Basado en Roles

```
Usuario hace clic en "Envíos"
         │
         ▼
┌─────────────────────────┐
│ ¿Es super_admin?        │
│                         │
│  SÍ → Muestra Hub       │
│       con todos los     │
│       paneles           │
│                         │
│  NO → ¿Tiene            │
│       warehouse_location│
│       asignada?         │
│                         │
│       SÍ → Va directo   │
│            a su panel   │
│                         │
│       NO → Error 403    │
└─────────────────────────┘
```

### Endpoints de Bodega

#### Servicios disponibles
```http
GET /api/warehouse/services
Authorization: Bearer {token}

Response:
[
  { "id": 1, "code": "POBOX_USA", "name": "PO Box USA → México", ... },
  { "id": 5, "code": "NATIONAL", "name": "Nacional México", ... }
]
```

#### Listar recepciones
```http
GET /api/warehouse/receipts?status=received&limit=50
Authorization: Bearer {token}

Response:
[
  {
    "id": 1,
    "tracking_number": "1Z999AA10123456784",
    "service_code": "POBOX_USA",
    "client_name": "Juan Pérez",
    "box_id": "ETX-5993",
    "weight_kg": 5.5,
    "quoted_usd": 45.00,
    "status": "received",
    "created_at": "2026-02-06T10:30:00Z"
  }
]
```

#### Crear recepción
```http
POST /api/warehouse/receipts
Authorization: Bearer {token}
Content-Type: application/json

{
  "tracking_number": "1Z999AA10123456784",
  "service_code": "POBOX_USA",
  "box_id": "ETX-5993",
  "weight_kg": 5.5,
  "length_cm": 30,
  "width_cm": 20,
  "height_cm": 15,
  "quantity": 1,
  "notes": "Electrónicos - Frágil"
}

Response:
{
  "message": "Recepción registrada correctamente",
  "receipt": { ... },
  "quote": {
    "usd": 45.00,
    "mxn": 810.00,
    "fxRate": 18.0,
    "breakdown": { ... }
  }
}
```

#### Estadísticas de bodega
```http
GET /api/warehouse/stats
Authorization: Bearer {token}

Response:
{
  "stats": {
    "total_today": 15,
    "pending": 8,
    "in_transit": 5,
    "delivered": 2,
    "pending_payment": 10,
    "total_usd_today": 450.00
  },
  "recentActivity": [ ... ]
}
```

#### Buscar cliente por Box ID
```http
GET /api/warehouse/search-client/ETX-5993
Authorization: Bearer {token}

Response:
{
  "id": 5,
  "full_name": "Aldo Hernández",
  "email": "aldo@entregax.com",
  "box_id": "ETX-5993",
  "phone": "+52 55 1234 5678",
  "price_list": "Tarifa Pública"
}
```

#### Asignar ubicación a usuario (Admin)
```http
PUT /api/admin/users/:id/warehouse-location
Authorization: Bearer {token}
Content-Type: application/json

{
  "warehouse_location": "china_air"
}
```

### Configuración de Paneles (WarehouseHubPage)

```typescript
const WAREHOUSE_PANELS = {
    usa_pobox: {
        title: 'PO Box USA',
        subtitle: 'Recepción de paquetes desde Estados Unidos',
        icon: <TruckIcon />,
        color: '#2196F3',
        bgGradient: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
        flag: '🇺🇸',
        component: 'shipmentsPage',  // Usa ShipmentsPage existente
    },
    china_air: {
        title: 'Aéreo China',
        subtitle: 'Envíos aéreos desde China',
        icon: <FlightIcon />,
        color: '#FF5722',
        bgGradient: 'linear-gradient(135deg, #E64A19 0%, #FF7043 100%)',
        flag: '🇨🇳',
        component: 'warehouseReception',  // Usa WarehouseReceptionPage
    },
    // ... más ubicaciones
};
```

---

## 💰 Motor de Precios

### Arquitectura del Pricing Engine

```
┌─────────────────────────────────────────────────────────────────┐
│                         Pricing Engine                          │
│                       pricingEngine.ts                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ Entrada:        │                                            │
│  │ - serviceCode   │                                            │
│  │ - weightKg      │                                            │
│  │ - dimensions    │                                            │
│  │ - quantity      │                                            │
│  │ - userId        │──┐                                         │
│  └─────────────────┘  │                                         │
│                       ▼                                         │
│            ┌──────────────────┐                                 │
│            │ 1. Obtener lista │                                 │
│            │    de precios    │                                 │
│            │    del cliente   │                                 │
│            └────────┬─────────┘                                 │
│                     ▼                                           │
│            ┌──────────────────┐                                 │
│            │ 2. Buscar regla  │                                 │
│            │    para servicio │                                 │
│            │    + rango       │                                 │
│            └────────┬─────────┘                                 │
│                     ▼                                           │
│            ┌──────────────────┐                                 │
│            │ 3. Calcular:     │                                 │
│            │  per_kg → Peso   │                                 │
│            │  per_cbm → Vol.  │                                 │
│            │  per_package     │                                 │
│            └────────┬─────────┘                                 │
│                     ▼                                           │
│  ┌─────────────────────────────────┐                           │
│  │ Salida:                         │                           │
│  │ - usd: 45.00                    │                           │
│  │ - mxn: 810.00                   │                           │
│  │ - fxRate: 18.0                  │                           │
│  │ - breakdown: { base, fee, ... } │                           │
│  └─────────────────────────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tipos de Cálculo

| Tipo | Descripción | Fórmula |
|------|-------------|---------|
| `per_kg` | Por kilogramo | `(peso × costo_unitario) + cargo_fijo` |
| `per_cbm` | Por metro cúbico | `(L×A×H/1000000 × costo_unitario) + cargo_fijo` |
| `per_package` | Por paquete | `(cantidad × costo_unitario) + cargo_fijo` |

### Ejemplo de Reglas de Precio

```sql
-- Aéreo China: Descuento por volumen
price_list: "Tarifa Pública"
service: "AIR_CHN_MX"
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ min_unit    │ max_unit    │ unit_cost   │ fixed_fee   │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ 0           │ 45          │ $12.00/kg   │ $25.00      │
│ 45.01       │ 100         │ $10.50/kg   │ $25.00      │
│ 100.01      │ 999999      │ $9.00/kg    │ $25.00      │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### Endpoint de Cotización

```http
POST /api/pricing/quote
Content-Type: application/json

{
  "serviceCode": "AIR_CHN_MX",
  "weightKg": 50,
  "lengthCm": 60,
  "widthCm": 40,
  "heightCm": 30,
  "quantity": 1,
  "userId": 5
}

Response:
{
  "usd": 550.00,
  "mxn": 9900.00,
  "fxRate": 18.0,
  "breakdown": {
    "service": "Aéreo China → México",
    "priceList": "Tarifa Pública",
    "weight": 50,
    "unitCost": 10.50,
    "fixedFee": 25.00,
    "baseAmount": 525.00,
    "total": 550.00
  }
}
```

---

## 🧾 Sistema de Facturación Fiscal

### Tablas Relacionadas

```sql
-- Empresas emisoras (tus empresas)
CREATE TABLE fiscal_emitters (
    id SERIAL PRIMARY KEY,
    alias VARCHAR(50),
    rfc VARCHAR(13) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    fiscal_regime VARCHAR(10),
    zip_code VARCHAR(10),
    api_key TEXT,              -- API key del PAC
    is_active BOOLEAN DEFAULT TRUE
);

-- Perfiles fiscales del cliente (receptores)
CREATE TABLE fiscal_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    rfc VARCHAR(13) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    fiscal_regime VARCHAR(10),
    zip_code VARCHAR(10),
    tax_use VARCHAR(10) DEFAULT 'G03',  -- Uso CFDI
    email VARCHAR(255),
    is_default BOOLEAN DEFAULT FALSE
);

-- Facturas generadas
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    consolidation_id INTEGER REFERENCES consolidations(id),
    fiscal_emitter_id INTEGER REFERENCES fiscal_emitters(id),
    fiscal_profile_id INTEGER REFERENCES fiscal_profiles(id),
    uuid VARCHAR(50),           -- UUID del CFDI
    folio VARCHAR(20),
    status VARCHAR(20) DEFAULT 'generated',
    pdf_url TEXT,
    xml_url TEXT,
    amount DECIMAL(10, 2)
);
```

### Flujo de Facturación

```
1. Cliente solicita factura en Mobile App
2. Selecciona/crea perfil fiscal
3. Backend determina emisor según servicio
4. Genera CFDI vía PAC (Facturapi)
5. Almacena UUID, PDF, XML
6. Cliente descarga desde app
```

### Endpoints de Facturación

```http
# Emisores (Empresas)
GET /api/fiscal/emitters           # Listar empresas emisoras
POST /api/fiscal/emitters          # Crear emisor
PUT /api/fiscal/emitters/:id       # Actualizar emisor

# Perfiles Fiscales (Clientes)
GET /api/fiscal/profiles/:userId   # Perfiles del cliente
POST /api/fiscal/profiles          # Crear perfil fiscal
PUT /api/fiscal/profiles/:id       # Actualizar perfil

# Facturas
POST /api/fiscal/invoices          # Generar factura
GET /api/fiscal/invoices/:id       # Obtener factura
GET /api/fiscal/invoices/:id/pdf   # Descargar PDF
GET /api/fiscal/invoices/:id/xml   # Descargar XML
```

---

## 🔐 Sistema de Verificación KYC

### Verificación con GPT-4 Vision

El sistema usa **GPT-4o** para comparar la selfie del usuario con su identificación oficial.

```
┌─────────────────────────────────────────────────────────────────┐
│                   Flujo de Verificación KYC                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Cliente sube selfie        2. Cliente sube INE/Pasaporte   │
│     (cámara frontal)              (foto del documento)          │
│          │                               │                       │
│          └───────────┬───────────────────┘                       │
│                      ▼                                           │
│          ┌─────────────────────┐                                │
│          │   GPT-4 Vision      │                                │
│          │   Análisis facial   │                                │
│          └──────────┬──────────┘                                │
│                     ▼                                            │
│          ┌─────────────────────┐                                │
│          │ Resultado:          │                                │
│          │ - match: true/false │                                │
│          │ - confidence: %     │                                │
│          │ - reason: "..."     │                                │
│          └─────────────────────┘                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Estados de Verificación

| Estado | Descripción |
|--------|-------------|
| `pending` | En espera de documentos |
| `submitted` | Documentos enviados, pendiente revisión |
| `approved` | Verificación aprobada |
| `rejected` | Rechazado (fotos no coinciden) |
| `expired` | Documento vencido |

### Endpoints de Verificación

```http
# Iniciar verificación
POST /api/verification/start
Authorization: Bearer {token}
Content-Type: multipart/form-data

{
  "selfie": <archivo imagen>,
  "document": <archivo imagen>,
  "documentType": "ine" | "passport" | "driver_license"
}

# Estado de verificación
GET /api/verification/status
Authorization: Bearer {token}

# Admin: Lista de verificaciones pendientes
GET /api/admin/verifications?status=submitted
Authorization: Bearer {token}

# Admin: Aprobar/Rechazar
PUT /api/admin/verifications/:id
Authorization: Bearer {token}
{
  "status": "approved" | "rejected",
  "notes": "Motivo del rechazo..."
}
```

---

## 💳 Sistema de Pagos

### PayPal Integration

```typescript
// paymentController.ts
// Integración con PayPal API v2 (Sandbox/Production)

// Flujo de pago:
1. Cliente confirma consolidación
2. Backend crea orden en PayPal
3. Cliente es redirigido a PayPal
4. PayPal retorna a callback URL
5. Backend captura el pago
6. Actualiza estado de consolidación
```

### Endpoints de Pago

```http
# Crear orden de pago
POST /api/payments/create-order
Authorization: Bearer {token}
{
  "consolidationId": 123
}

Response:
{
  "orderId": "PAYPAL-ORDER-ID",
  "approvalUrl": "https://www.paypal.com/checkoutnow?token=...",
  "amount": 45.00
}

# Capturar pago (después de aprobación)
POST /api/payments/capture
{
  "orderId": "PAYPAL-ORDER-ID"
}

# Historial de pagos
GET /api/payments/history
Authorization: Bearer {token}
```

---

## 💵 Sistema de Pagos a Proveedores

### Motor de Cálculo Financiero

```
┌─────────────────────────────────────────────────────────────────┐
│              Motor de Pagos a Proveedores                       │
│                supplierPaymentController.ts                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Entrada:                                                        │
│  ├── consolidation_id                                           │
│  ├── proveedor (China, USA, etc.)                               │
│  └── monto en USD                                               │
│                                                                  │
│  Cálculo:                                                        │
│  ├── Monto base USD                                             │
│  ├── + Fee cliente (6% default)                                 │
│  ├── + Cargo fijo ($25 USD)                                     │
│  ├── × Tipo de cambio                                           │
│  └── = Total MXN a cobrar                                       │
│                                                                  │
│  Salida:                                                         │
│  ├── Pago al proveedor (USD)                                    │
│  ├── Cobro al cliente (MXN)                                     │
│  └── Margen de utilidad                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Gestión de Tipo de Cambio

```http
# Obtener tipo de cambio actual
GET /api/supplier/exchange-rate

Response:
{
  "rate": 18.50,
  "updatedAt": "2026-02-06T10:00:00Z",
  "isDefault": false
}

# Actualizar tipo de cambio (Admin)
PUT /api/supplier/exchange-rate
{
  "rate": 18.75
}
```

### Endpoints de Pagos a Proveedores

```http
# Calcular pago
POST /api/supplier/calculate
{
  "amountUsd": 1000.00,
  "supplierId": 1
}

Response:
{
  "baseUsd": 1000.00,
  "feePercent": 6.00,
  "feeUsd": 60.00,
  "fixedFee": 25.00,
  "totalUsd": 1085.00,
  "fxRate": 18.50,
  "totalMxn": 20072.50
}

# Registrar pago
POST /api/supplier/payments
{
  "consolidationId": 123,
  "supplierId": 1,
  "amountUsd": 1000.00
}

# Historial de pagos
GET /api/supplier/payments?from=2026-01-01&to=2026-02-06
```

---

## 📍 Sistema de Direcciones

### Gestión de Direcciones de Envío

```http
# Obtener direcciones del cliente
GET /api/addresses/:userId
Authorization: Bearer {token}

# Crear dirección
POST /api/addresses
{
  "userId": 5,
  "alias": "Casa",
  "recipientName": "Juan Pérez",
  "street": "Av. Reforma",
  "exteriorNumber": "123",
  "interiorNumber": "4B",
  "neighborhood": "Juárez",
  "city": "Ciudad de México",
  "state": "CDMX",
  "zipCode": "06600",
  "phone": "+52 55 1234 5678",
  "reference": "Edificio azul",
  "isDefault": true
}

# Actualizar dirección
PUT /api/addresses/:id

# Eliminar dirección
DELETE /api/addresses/:id

# Establecer como default
PUT /api/addresses/:id/default
```

---

## 🇨🇳 API MJCustomer - China TDI Aéreo

### Descripción General

La integración con **MJCustomer** (api.mjcustomer.com) permite la sincronización automática de envíos desde China. El sistema soporta:

- **Recepción de webhooks** desde MoJie con encriptación DES
- **Consulta de órdenes** por FNO o Shipping Mark
- **Tracking de paquetes** en tiempo real
- **Sincronización automática** cada 15 minutos (cron job)

### Arquitectura de la Integración

```
┌─────────────────────────────────────────────────────────────────┐
│                   MJCustomer API Integration                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐         ┌─────────────────┐                 │
│  │    MJCustomer   │ ──────> │   EntregaX      │                 │
│  │    (api.mj...)  │ Callback│   /api/china/   │                 │
│  └────────┬────────┘         └────────┬────────┘                 │
│           │                           │                          │
│           │ Pull/Track                │ Save to DB               │
│           ▼                           ▼                          │
│  ┌─────────────────┐         ┌─────────────────┐                 │
│  │   orderByList   │         │ china_receipts  │                 │
│  │   trajectory    │         │    packages     │                 │
│  └─────────────────┘         └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### Archivo Principal

| Archivo | Descripción |
|---------|-------------|
| `chinaController.ts` | Controlador principal con todas las funciones MJCustomer |

### Variables de Entorno Requeridas

```bash
# entregax-backend-api/.env
MJCUSTOMER_API_URL=http://api.mjcustomer.com
MJCUSTOMER_API_TOKEN=eyJhbGciOiJIUzI1NiIs...  # Token JWT (168h validez)
MJCUSTOMER_DES_KEY=ENTREGAX                    # Llave DES para callbacks
```

### Interfaces TypeScript

```typescript
// Payload principal de la API MJCustomer
interface ChinaApiPayload {
    fno: string;           // "AIR2609..." - Identificador único del envío
    shippingMark: string;  // "S3019" - Código del cliente (box_id)
    totalQty: number;      // Total de cajas
    totalWeight: number;   // Peso total en kg
    totalVolume: number;   // Volumen total
    totalCbm: number;      // CBM total
    file: string[];        // Array de URLs de fotos/evidencias
    data: ChinaPackageData[]; // Array de cajas individuales
}

// Datos de cada caja individual
interface ChinaPackageData {
    childNo: string;       // "AIR2609...-001" - ID único de la caja
    trajecotryName: string; // Nombre de la trayectoria (nota: typo en API original)
    weight: number;        // Peso en kg
    long: number;          // Largo en cm
    width: number;         // Ancho en cm
    height: number;        // Alto en cm
    proName: string;       // Descripción del producto
    customsBno: string;    // Código aduanal
    singleVolume: number;  // Volumen individual
    singleCbm: number;     // CBM individual
    billNo?: string;       // Guía aérea internacional
    etd?: string;          // Fecha estimada de salida
    eta?: string;          // Fecha estimada de llegada
}

// Respuesta de trayectoria
interface TrajectoryResponse {
    code: number;
    message: string;
    result: Array<{
        ch: string;      // Texto en chino
        en: string;      // Texto en español/inglés
        date: string;    // Fecha del evento
    }>;
}
```

### Endpoints Disponibles

#### 🔓 Webhooks (Sin Autenticación)

| Método | Endpoint | Función | Descripción |
|--------|----------|---------|-------------|
| POST | `/api/china/receive` | `receiveFromChina` | Webhook directo para recibir datos JSON |
| POST | `/api/china/callback` | `mojieCallbackEncrypted` | Webhook con datos encriptados DES |

#### 🔐 Endpoints Protegidos (Requieren JWT)

| Método | Endpoint | Función | Descripción |
|--------|----------|---------|-------------|
| GET | `/api/china/receipts` | `getChinaReceipts` | Listar todas las recepciones China |
| POST | `/api/china/receipts` | `createChinaReceipt` | Crear recepción manual |
| GET | `/api/china/receipts/:id` | `getChinaReceiptDetail` | Detalle de un recibo con sus paquetes |
| PUT | `/api/china/receipts/:id/status` | `updateChinaReceiptStatus` | Actualizar estado del recibo |
| POST | `/api/china/receipts/:id/assign` | `assignClientToReceipt` | Asignar cliente a recibo huérfano |
| GET | `/api/china/stats` | `getChinaStats` | Estadísticas del panel China |
| POST | `/api/china/mjcustomer/login` | `loginMJCustomerEndpoint` | Login manual en MJCustomer |
| GET | `/api/china/pull/:orderCode` | `pullFromMJCustomer` | Sincronizar orden desde MJCustomer |
| POST | `/api/china/pull-batch` | `pullBatchFromMJCustomer` | Sincronización masiva de órdenes |
| PUT | `/api/china/config/token` | `updateMJCustomerToken` | Actualizar token (rol: Director+) |
| GET | `/api/china/track/:fno` | `trackFNO` | Rastrear FNO sin guardar en BD |
| GET | `/api/china/trajectory/:childNo` | `getTrajectory` | Obtener trayectoria detallada |

### Ejemplos de Uso

#### 1. Login Manual en MJCustomer
```bash
curl -X POST "http://localhost:3001/api/china/mjcustomer/login" \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Login exitoso",
  "tokenPreview": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-02-12T10:30:00.000Z"
}
```

#### 2. Consultar Orden por Código (Pull)
```bash
curl -X GET "http://localhost:3001/api/china/pull/S3019" \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Datos sincronizados desde MJCustomer",
  "data": [{
    "fno": "AIR2609001234",
    "receiptId": 42,
    "userId": 156,
    "shippingMark": "S3019",
    "packagesCreated": 3,
    "packagesUpdated": 0
  }],
  "order": {
    "fno": "AIR2609001234",
    "shippingMark": "S3019",
    "totalQty": 3,
    "totalWeight": 15.5,
    "totalCbm": 0.08
  }
}
```

#### 3. Rastrear FNO (Sin Guardar)
```bash
curl -X GET "http://localhost:3001/api/china/track/AIR2609001234" \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "tracking": {
    "fno": "AIR2609001234",
    "shippingMark": "S3019",
    "totalQty": 3,
    "totalWeight": 15.5,
    "evidencias": ["https://mjcustomer.com/files/photo1.jpg"],
    "paquetes": [{
      "childNo": "AIR2609001234-001",
      "status": "En tránsito aéreo",
      "peso": 5.2,
      "dimensiones": "30x25x20 cm",
      "producto": "Electrónicos",
      "guiaInternacional": "172-12345678",
      "etd": "2026-02-08",
      "eta": "2026-02-15"
    }]
  }
}
```

#### 4. Obtener Trayectoria de Paquete
```bash
curl -X GET "http://localhost:3001/api/china/trajectory/AIR2609001234-001" \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "childNo": "AIR2609001234-001",
  "eventos": 5,
  "trayectoria": [
    { "fecha": "2026-02-05 10:30:00", "descripcion": "Recibido en almacén China" },
    { "fecha": "2026-02-06 14:20:00", "descripcion": "En proceso de despacho" },
    { "fecha": "2026-02-07 08:00:00", "descripcion": "Cargado en vuelo" },
    { "fecha": "2026-02-08 16:30:00", "descripcion": "En tránsito aéreo" }
  ]
}
```

#### 5. Listar Recepciones China
```bash
curl -X GET "http://localhost:3001/api/china/receipts?status=in_transit&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "receipts": [{
    "id": 42,
    "fno": "AIR2609001234",
    "shipping_mark": "S3019",
    "total_qty": 3,
    "total_weight": 15.5,
    "status": "in_transit",
    "client_name": "Juan Pérez",
    "client_box_id": "ETX-1234",
    "package_count": 3,
    "created_at": "2026-02-05T10:30:00Z"
  }],
  "total": 15
}
```

#### 6. Crear Recepción Manual
```bash
curl -X POST "http://localhost:3001/api/china/receipts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fno": "AIR2609MANUAL001",
    "shipping_mark": "S3019",
    "total_qty": 2,
    "total_weight": 8.5,
    "notes": "Captura manual - guía física"
  }'
```

#### 7. Actualizar Estado del Recibo
```bash
curl -X PUT "http://localhost:3001/api/china/receipts/42/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "arrived_mexico",
    "notes": "Llegó al aeropuerto AICM",
    "internationalTracking": "172-12345678"
  }'
```

**Estados Disponibles:**
| Estado | Descripción | Notificación al Cliente |
|--------|-------------|------------------------|
| `received_origin` | Recibido en almacén China | - |
| `in_transit` | En tránsito internacional | ✈️ En tránsito hacia México |
| `arrived_mexico` | Llegó a México | 🛬 Ha llegado a México |
| `in_customs` | En proceso aduanal | 🛃 En liberación aduanal |
| `at_cedis` | En CEDIS listo para despacho | 📦 Listo para despacho |
| `dispatched` | Despachado con guía nacional | 🚚 Despachado |
| `delivered` | Entregado al cliente | ✅ Entregado |

#### 8. Asignar Cliente a Recibo Huérfano
```bash
curl -X POST "http://localhost:3001/api/china/receipts/42/assign" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "userId": 156 }'
```

#### 9. Estadísticas del Panel China
```bash
curl -X GET "http://localhost:3001/api/china/stats" \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "byStatus": [
      { "status": "received_origin", "count": "12" },
      { "status": "in_transit", "count": "8" },
      { "status": "at_cedis", "count": "5" }
    ],
    "todayPackages": 15,
    "unassignedReceipts": 3,
    "pendingBillNo": 4
  }
}
```

#### 10. Sincronización Masiva (Pull Batch)
```bash
curl -X POST "http://localhost:3001/api/china/pull-batch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "orderCodes": ["S3019", "S3020", "S3021"] }'
```

### Webhook de MoJie (Callback Encriptado)

MoJie puede enviar datos encriptados con DES. El endpoint `/api/china/callback` los procesa automáticamente:

```bash
# Ejemplo de callback (datos encriptados en Base64)
curl -X POST "http://localhost:3001/api/china/callback" \
  -H "Content-Type: application/json" \
  -d '{ "data": "BASE64_ENCRYPTED_STRING" }'
```

El sistema:
1. Detecta si los datos vienen encriptados o en texto plano
2. Si están encriptados, usa la llave DES configurada (`MJCUSTOMER_DES_KEY`)
3. Procesa el JSON resultante y crea/actualiza el recibo

### Cron Job: Sincronización Automática

El sistema ejecuta cada 15 minutos la función `syncActiveMJCustomerOrders()`:

```typescript
// En cronJobs.ts
cron.schedule('*/15 * * * *', async () => {
    await syncActiveMJCustomerOrders();
});
```

**Comportamiento:**
- Consulta órdenes con status activo (no `delivered`/`cancelled`)
- Sincroniza cambios de ETA/ETD, tracking internacional
- Actualiza status basado en trajectory name
- Máximo 50 órdenes por ciclo
- Pausa de 500ms entre requests para no saturar el API

### Tabla de Base de Datos: china_receipts

```sql
CREATE TABLE china_receipts (
    id SERIAL PRIMARY KEY,
    fno VARCHAR(100) UNIQUE,          -- Número de orden MJCustomer
    user_id INTEGER REFERENCES users(id),
    shipping_mark VARCHAR(50),         -- Código del cliente
    total_qty INTEGER DEFAULT 1,
    total_weight DECIMAL(10,2) DEFAULT 0,
    total_volume DECIMAL(10,4) DEFAULT 0,
    total_cbm DECIMAL(10,4) DEFAULT 0,
    evidence_urls TEXT[],              -- Array de URLs de fotos
    international_tracking VARCHAR(100),
    status VARCHAR(50) DEFAULT 'received_origin',
    source VARCHAR(50) DEFAULT 'api',  -- 'api', 'manual', 'mojie_callback'
    notes TEXT,
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_china_receipts_user ON china_receipts(user_id);
CREATE INDEX idx_china_receipts_status ON china_receipts(status);
CREATE INDEX idx_china_receipts_shipping_mark ON china_receipts(shipping_mark);
```

### Campos en Tabla packages para China Air

```sql
-- Campos específicos de paquetes China Air
ALTER TABLE packages ADD COLUMN IF NOT EXISTS china_receipt_id INTEGER REFERENCES china_receipts(id);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS child_no VARCHAR(100) UNIQUE;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS pro_name VARCHAR(255);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS customs_bno VARCHAR(100);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS trajectory_name VARCHAR(255);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS single_volume DECIMAL(10,4);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS single_cbm DECIMAL(10,4);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS international_tracking VARCHAR(100);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS etd DATE;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS eta DATE;
```

### Gestión del Token JWT

El token de MJCustomer tiene validez de **168 horas (7 días)**. El sistema:

1. **Almacena en memoria** para uso inmediato
2. **Persiste en `system_config`** para sobrevivir reinicios
3. **Renueva a los 6 días** (1 día de margen)
4. **Permite actualización manual** vía endpoint (solo Director+)

```sql
-- Configuración del token en BD
INSERT INTO system_config (key, value) VALUES 
  ('mjcustomer_token', 'eyJhbGciOiJIUzI1NiIs...'),
  ('mjcustomer_token_expiry', '1738934400000');
```

### Autenticación con MJCustomer

El login usa credenciales pre-encriptadas SM2:

```typescript
const loginResponse = await fetch(
    'http://api.mjcustomer.com/api/sysAuth/login',
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json-patch+json',
            'request-from': 'swagger'
        },
        body: JSON.stringify({
            account: 'h5api',
            password: 'PASSWORD_SM2_ENCRYPTED',  // Pre-encriptado
            loginMode: 1
        })
    }
);
```

### Endpoints de API MJCustomer Consumidos

| Método | Endpoint MJCustomer | Uso |
|--------|---------------------|-----|
| POST | `/api/sysAuth/login` | Obtener token JWT |
| GET | `/api/otherSystem/orderByList/{code}` | Consultar orden por FNO o ShippingMark |
| POST | `/api/orderInfo/orderSystemByTrajectoryData/{childNo}` | Trayectoria detallada de paquete |

### Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| `401 Unauthorized` | Token expirado | Ejecutar login manual o esperar cron |
| `No token available` | Token no configurado | Configurar `MJCUSTOMER_API_TOKEN` en .env |
| `Error desencriptación DES` | Llave incorrecta | Verificar `MJCUSTOMER_DES_KEY` |
| `Usuario no encontrado` | Shipping Mark no coincide | Verificar `box_id` del usuario |

---

## 📦 Módulos Implementados

### ✅ Completados

| Módulo | Descripción | Archivos |
|--------|-------------|----------|
| **Autenticación** | Login/Registro con JWT | `authController.ts`, `LoginPage.tsx`, `LoginScreen.tsx` |
| **Usuarios/Clientes** | CRUD completo | `authController.ts`, `ClientsPage.tsx` |
| **Paquetes/Envíos** | Recepción con wizard | `packageController.ts`, `ShipmentsPage.tsx` |
| **Sistema Master+Hijas** | Multi-caja | `packageController.ts` |
| **Dashboard** | Resumen estadístico | `authController.ts`, `App.tsx` |
| **Internacionalización** | ES/EN | `i18n/`, todos los componentes |
| **Mobile App** | App para clientes | `LoginScreen.tsx`, `HomeScreen.tsx` |
| **Evidencia Visual** | Fotos en paquetes | `HomeScreen.tsx`, `packages.image_url` |
| **Multi-Selección** | Selección de paquetes | `HomeScreen.tsx` |
| **Consolidaciones** | Sistema de salidas | `ConsolidationSummary.tsx`, `ConsolidationsPage.tsx` |
| **Etiquetas con QR** | Impresión mejorada | `packageController.ts` |
| **Bodegas Multi-Ubicación** ⭐ | 5 paneles por ubicación | `warehouseController.ts`, `WarehouseHubPage.tsx`, `WarehouseReceptionPage.tsx` |
| **Motor de Precios** ⭐ | Cotización automática | `pricingEngine.ts`, `PricingPage.tsx`, `pricing_rules` |
| **Listas de Precios** ⭐ | Tarifas por cliente | `price_lists`, asignación a usuarios |
| **Facturación Fiscal** ⭐ | CFDI con Facturapi | `invoicingController.ts`, `FiscalPage.tsx` |
| **Comisiones** ⭐ | Referidos y comisiones | `commissionController.ts`, `CommissionsPage.tsx` |
| **Pagos a Proveedores** ⭐ | Control de egresos + FX | `supplierPaymentController.ts`, `SupplierPaymentsPage.tsx` |
| **Verificación KYC** ⭐ | GPT-4 Vision para rostros | `verificationController.ts`, `VerificationsPage.tsx` |
| **Pagos PayPal** ⭐ | Integración PayPal API v2 | `paymentController.ts` |
| **Direcciones** ⭐ | Gestión de direcciones | `addressController.ts` |
| **API MJCustomer** ⭐ | China TDI Aéreo (callback, pull, track, sync) | `chinaController.ts`, `china_receipts` |

### 🚧 Pendientes

| Módulo | Descripción | Prioridad |
|--------|-------------|-----------|
| Notificaciones Push | Firebase/Expo Push | Media |
| Tracking en tiempo real | Mapa con ubicación | Media |
| Reportes avanzados | Gráficas y exportación | Media |
| Sucursales | Gestión multi-sucursal | Baja |

---

## 👨‍💻 Guía de Desarrollo

### Agregar Nueva Traducción
```bash
# 1. Agregar al archivo es.json
{
  "miModulo": {
    "titulo": "Mi Título",
    "descripcion": "Mi descripción"
  }
}

# 2. Agregar al archivo en.json
{
  "miModulo": {
    "titulo": "My Title",
    "descripcion": "My description"
  }
}

# 3. Usar en componente
const { t } = useTranslation();
<h1>{t('miModulo.titulo')}</h1>
```

### Agregar Nuevo Endpoint
```typescript
// 1. En src/index.ts agregar ruta
app.get('/api/mi-endpoint', authenticateToken, async (req, res) => {
  // Lógica aquí
});

// 2. O crear nuevo controller
// src/miController.ts
export const miController = {
  async get(req: Request, res: Response) { ... }
};
```

### Agregar Nueva Página
```typescript
// 1. Crear archivo src/pages/MiPage.tsx
export default function MiPage() {
  const { t } = useTranslation();
  return <Box>...</Box>;
}

// 2. Importar en App.tsx
import MiPage from './pages/MiPage';

// 3. Agregar al menuItemsConfig
{ key: 'miPagina', icon: <MiIcon />, component: <MiPage />, roles: [...] }

// 4. Agregar traducciones en es.json y en.json
```

### Convenciones de Código

#### Nombres
- **Componentes:** PascalCase (`ClientsPage.tsx`)
- **Funciones:** camelCase (`fetchUsers`)
- **Constantes:** UPPER_SNAKE_CASE (`API_URL`)
- **Tipos/Interfaces:** PascalCase (`User`, `Package`)

#### Estructura de Componente
```tsx
// 1. Imports
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// 2. Constantes
const ORANGE = '#F05A28';

// 3. Tipos
interface Props { ... }

// 4. Componente
export default function MiComponente({ prop1 }: Props) {
  // 4.1 Hooks
  const { t } = useTranslation();
  const [state, setState] = useState();
  
  // 4.2 Funciones
  const handleClick = () => { ... };
  
  // 4.3 Render
  return ( ... );
}
```

---

## 🔑 Credenciales de Prueba

### Super Admin
```
Email: aldo@entregax.com
Password: Quantum123
Role: super_admin
Box ID: ETX-5993
```

### Staff de Bodega
```
Email: warehouse@entregax.com
Password: (configurar)
Role: warehouse_ops
Warehouse Location: usa_pobox
```

### Cliente
```
Email: usuario@entregax.com
Password: Test123
Role: client
Box ID: ETX-1234
```

### Verificar Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"aldo@entregax.com","password":"Quantum123"}' | jq .
```

### Probar Endpoints de Bodega
```bash
# Obtener token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"aldo@entregax.com","password":"Quantum123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Listar ubicaciones disponibles
curl -s "http://localhost:3001/api/admin/warehouse-locations" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Obtener servicios de la ubicación actual
curl -s "http://localhost:3001/api/warehouse/services" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Estadísticas de bodega
curl -s "http://localhost:3001/api/warehouse/stats" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 📝 Changelog

### v2.2.0 (6 Feb 2026) - API MJCUSTOMER CHINA TDI AÉREO ⭐
- ✅ **Integración MJCustomer API** - Conexión con api.mjcustomer.com
- ✅ **chinaController.ts** - Controlador completo (1609 líneas)
- ✅ **Webhook /api/china/receive** - Recepción directa de datos JSON
- ✅ **Webhook /api/china/callback** - Recepción con encriptación DES
- ✅ **Pull /api/china/pull/:code** - Sincronización bajo demanda
- ✅ **Track /api/china/track/:fno** - Rastreo de FNO sin guardar
- ✅ **Trajectory /api/china/trajectory/:childNo** - Trayectoria detallada
- ✅ **Pull Batch** - Sincronización masiva de múltiples órdenes
- ✅ **CRON Job** - Sincronización automática cada 15 minutos
- ✅ **Tabla china_receipts** - Almacenamiento de recepciones China
- ✅ **Campos packages** - child_no, pro_name, customs_bno, trajectory, etd, eta
- ✅ **Sistema de notificaciones** - Alertas por cambio de status
- ✅ **Login MJCustomer** - Autenticación con SM2 pre-encriptado
- ✅ **Gestión de token** - Persistencia en BD + renovación automática
- ✅ **Desencriptación DES** - Para callbacks encriptados de MoJie
- ✅ **Stats endpoint** - Estadísticas del panel China

### v2.1.0 (6 Feb 2026) - BODEGAS MULTI-UBICACIÓN & PRICING
- ✅ **Sistema de Bodegas Multi-Ubicación** - 5 paneles por ubicación geográfica
- ✅ **WarehouseHubPage** - Hub central para administradores con cards estilizadas
- ✅ **WarehouseReceptionPage** - Panel de recepción individual por bodega
- ✅ **warehouseController.ts** - Backend completo para recepciones de bodega
- ✅ **Tabla warehouse_receipts** - Almacenamiento de recepciones con cotización
- ✅ **Campo users.warehouse_location** - Asignación de ubicación a staff
- ✅ **Motor de Precios (pricingEngine.ts)** - Cotización automática por servicio
- ✅ **Listas de Precios (price_lists)** - Tarifas diferenciadas por cliente
- ✅ **Reglas de Precio (pricing_rules)** - Bloques de descuento por volumen
- ✅ **Servicios Logísticos (logistics_services)** - 5 servicios configurados
- ✅ **PricingPage.tsx** - Administración de tarifas desde web admin
- ✅ **Facturación Fiscal** - Estructura para CFDI (emisores, perfiles, facturas)
- ✅ **FiscalPage.tsx** - Panel de facturación en web admin
- ✅ **Comisiones y Referidos** - Sistema de códigos de referido y comisiones
- ✅ **CommissionsPage.tsx** - Configuración de comisiones por servicio
- ✅ **Pagos a Proveedores** - SupplierPaymentsPage.tsx para control de egresos
- ✅ **Acceso basado en roles** - Admin ve hub, staff va a su panel
- ✅ **Integración i18n** - Traducciones para warehouse hub

### v2.0.0 (20 Ene 2025) - MOBILE & CONSOLIDACIONES
- ✅ **Mobile App completa** con Expo SDK 54 + React Native 0.81.5
- ✅ **LoginScreen** - Autenticación desde la app móvil
- ✅ **HomeScreen** - Lista de paquetes del cliente con fotos
- ✅ **Evidencia Visual** - Fotos en las tarjetas de paquetes
- ✅ **Multi-Selección** - Tap largo para seleccionar paquetes
- ✅ **ConsolidationSummary** - Resumen de envío con confirmación
- ✅ **Sistema de Consolidaciones** - Tabla y endpoints completos
- ✅ **ConsolidationsPage (Web)** - Panel "Salidas" para admins
- ✅ **API /api/consolidations** - Crear órdenes de envío
- ✅ **API /api/admin/consolidations** - Listar consolidaciones
- ✅ **Etiquetas con QR** - Códigos QR en labels impresas
- ✅ **QuotesPage** - Estructura inicial de cotizaciones
- ✅ Actualización a React Navigation 7, React Native Paper 5

### v1.0.0 (5 Feb 2026)
- ✅ Setup inicial del ecosistema (Backend, Web, Mobile)
- ✅ Sistema de autenticación JWT
- ✅ Gestión de usuarios/clientes (CRUD)
- ✅ Sistema de roles (5 niveles)
- ✅ Módulo de paquetes con wizard de recepción
- ✅ Sistema Master + Hijas para multi-caja
- ✅ Tracking interno con prefijo US-
- ✅ Campos de destino y paquetería
- ✅ Internacionalización completa (ES/EN)
- ✅ Design System (Orange #F05A28, Black #111111)
- ✅ Agregado "CEDIS MTY" a lista de paqueterías

---

## 📞 Soporte

Para dudas técnicas sobre este proyecto, consultar este manual o revisar el código fuente comentado.

---

*Documento generado automáticamente. Mantener actualizado con cada cambio.*
