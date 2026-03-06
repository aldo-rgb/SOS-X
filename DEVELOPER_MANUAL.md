# 📚 EntregaX - Manual del Programador

> **Última actualización:** 5 de marzo de 2026  
> **Versión:** 2.10.0

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
11. [Sistema de Permisos Granulares](#sistema-de-permisos-granulares)
12. [Sistema de Bodegas Multi-Ubicación](#sistema-de-bodegas-multi-ubicación)
13. [Motor de Precios](#motor-de-precios)
14. [Costeo PO Box USA](#costeo-po-box-usa)
15. [Garantía Extendida GEX](#garantía-extendida-gex) ⭐ NUEVO
16. [Sistema de Facturación Fiscal](#sistema-de-facturación-fiscal)
17. [Sistema de Verificación KYC](#sistema-de-verificación-kyc)
18. [Sistema de Pagos](#sistema-de-pagos)
19. [Sistema de Pagos a Proveedores](#sistema-de-pagos-a-proveedores)
20. [Openpay Multi-Empresa - Cobranza SPEI](#openpay-multi-empresa---cobranza-spei)
21. [Sistema de Direcciones](#sistema-de-direcciones)
22. [API MJCustomer - China TDI Aéreo](#api-mjcustomer---china-tdi-aéreo)
23. [Panel Marítimo China](#panel-marítimo-china)
24. [Integración con OpenAI](#integración-con-openai)
25. [DHL Monterrey - Costeo](#dhl-monterrey---costeo)
26. [Tradlinx Ocean Visibility](#tradlinx-ocean-visibility---tracking-de-contenedores)
27. [Módulos Implementados](#módulos-implementados)
28. [Guía de Desarrollo](#guía-de-desarrollo)
29. [Credenciales de Prueba](#credenciales-de-prueba)
30. [Changelog](#changelog)

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
│       ├── supplierPaymentController.ts # ⭐ Pagos a proveedores + FX
│       └── emailInboundController.ts # ⭐ Correos entrantes marítimos + OpenAI BL extraction
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
│           ├── VerificationsPage.tsx   # ⭐ Verificación de clientes
│           └── InboundEmailsPage.tsx   # ⭐ Correos entrantes marítimos + extracción IA
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

-- ENUM de roles (11 roles disponibles)
CREATE TYPE user_role AS ENUM (
    'super_admin',       -- Jefe máximo - acceso total (jerarquía: 100)
    'admin',             -- Administrador general (jerarquía: 95)
    'director',          -- Director de área (jerarquía: 90)
    'branch_manager',    -- Gerente de sucursal (jerarquía: 80)
    'customer_service',  -- Servicio a cliente (jerarquía: 70)
    'counter_staff',     -- Personal de mostrador (jerarquía: 60)
    'warehouse_ops',     -- Operaciones de bodega (jerarquía: 40)
    'repartidor',        -- Repartidor / Chofer (jerarquía: 35)
    'advisor',           -- Asesor comercial (CRM/Leads)
    'sub_advisor',       -- Sub-asesor (subordinado a asesor)
    'client'             -- Cliente final (jerarquía: 10)
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

// ⚠️ Actualizar con tu IP local (obtener con: ifconfig en0 | grep 'inet ')
const api = axios.create({
  baseURL: 'http://192.168.1.107:3001/api',  // Tu IP local + puerto 3001
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

export default api;
```

### Endpoints Mobile App (con prefijo /api)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login de usuario |
| GET | `/api/auth/profile` | Obtener perfil (incluye RFC) |
| POST | `/api/auth/change-password` | Cambiar contraseña |
| PUT | `/api/auth/update-profile` | Actualizar perfil (phone, RFC) |
| POST | `/api/auth/2fa/enable` | Habilitar 2FA |
| POST | `/api/auth/2fa/disable` | Deshabilitar 2FA |
| GET | `/api/legacy/verify/:boxId` | Verificar casillero existente |
| POST | `/api/legacy/verify-name` | Verificar nombre de cliente |
| POST | `/api/legacy/claim` | Reclamar cuenta (usa `newPassword`) |

### Terminología "Suite" (antes "Casillero")
La app utiliza "Suite" como término para el número de cliente:
- `es.json`: "Mi Suite", "Número de Suite"
- Header en HomeScreen: "🏠 Suite: S4001"
- MyProfileScreen: Muestra Suite con icono de casa

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

El sistema cuenta con **11 roles** organizados jerárquicamente (mayor número = más poder):

| Rol | Jerarquía | Descripción | Permisos Principales |
|-----|-----------|-------------|---------------------|
| `super_admin` | 100 | Jefe máximo | `*` (acceso total) |
| `admin` | 95 | Administrador general | `users:*`, `shipments:*`, `quotes:*`, `reports:*`, `settings:read` |
| `director` | 90 | Director de área | `users:read`, `shipments:*`, `quotes:*`, `reports:*` |
| `branch_manager` | 80 | Gerente de sucursal | `users:read/write`, `shipments:*`, `quotes:*`, `reports:read` |
| `customer_service` | 70 | Servicio a cliente | `clients:*`, `support:*`, `crm:*`, `quotes:read` |
| `counter_staff` | 60 | Personal de mostrador | `shipments:read/create`, `quotes:*`, `clients:read` |
| `warehouse_ops` | 40 | Operaciones de bodega | `shipments:read/update_status`, `inventory:*` |
| `repartidor` | 35 | Repartidor / Chofer | `deliveries:*`, `shipments:read/update_status` |
| `advisor` | - | Asesor comercial | CRM, leads, comisiones (rol legacy, mapea a `customer_service`) |
| `sub_advisor` | - | Sub-asesor | Igual que advisor pero subordinado |
| `client` | 10 | Cliente final | `profile:read/update`, `shipments:own`, `quotes:own` |

#### Roles Legacy (Aliases)
Algunos roles tienen nombres alternativos que el sistema normaliza automáticamente:

| Rol en BD | Se normaliza a |
|-----------|----------------|
| `advisor` | Servicio a Cliente |
| `sub_advisor` | Servicio a Cliente |
| `asesor` | Asesor (legacy) |
| `asesor_lider` | Líder de equipo de asesores |
| `cliente` | Cliente |
| `user` | Cliente |

#### Definición de Roles en Código

```typescript
// authController.ts - Roles oficiales del sistema
export const ROLES = {
    SUPER_ADMIN: 'super_admin',        // Jefe máximo - acceso total
    ADMIN: 'admin',                    // Administrador general
    DIRECTOR: 'director',              // Director de área
    BRANCH_MANAGER: 'branch_manager',  // Gerente de sucursal
    CUSTOMER_SERVICE: 'customer_service', // Servicio a cliente
    COUNTER_STAFF: 'counter_staff',    // Personal de mostrador
    WAREHOUSE_OPS: 'warehouse_ops',    // Operaciones de bodega
    REPARTIDOR: 'repartidor',          // Repartidor / Delivery driver
    CLIENT: 'client'                   // Cliente final
} as const;

// Roles válidos para actualización de usuarios
const validRoles = [
    'super_admin', 'admin', 'director', 'branch_manager', 
    'customer_service', 'counter_staff', 'warehouse_ops', 
    'advisor', 'sub_advisor', 'repartidor', 'client'
];
```

#### Categorización de Usuarios

```typescript
// Staff interno (pueden acceder al Web Admin)
const isAdmin = ['super_admin', 'admin', 'director'].includes(user.role);

// Personal operativo
const isStaff = ['advisor', 'sub_advisor', 'counter_staff', 
                 'warehouse_ops', 'customer_service', 'repartidor'].includes(user.role);

// Empleados para módulo de RRHH
const employeeRoles = ['warehouse_ops', 'counter_staff', 'repartidor', 
                       'customer_service', 'branch_manager'];
```

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

## 🔐 Sistema de Permisos Granulares

### Arquitectura de Permisos

EntregaX utiliza un sistema de permisos de 3 niveles:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Sistema de Permisos                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Nivel 1: ROLES (users.role)                                     │
│  ├── super_admin → Acceso total automático                       │
│  ├── admin → Requiere permisos explícitos                        │
│  ├── warehouse_ops → Requiere permisos explícitos                │
│  └── client → Solo sus propios datos                             │
│                                                                  │
│  Nivel 2: PANELES (user_panel_permissions)                       │
│  ├── admin_china_sea → Marítimo China                            │
│  ├── admin_china_air → Aéreo China                               │
│  ├── cs_leads → Central de Leads                                 │
│  ├── cs_clients → Control de Clientes                            │
│  └── ... (27 paneles disponibles)                                │
│                                                                  │
│  Nivel 3: MÓDULOS (user_module_permissions)                      │
│  ├── admin_china_sea.consolidations                              │
│  ├── admin_china_sea.inbound_emails                              │
│  ├── admin_china_sea.anticipos                                   │
│  └── ... (38 módulos disponibles)                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tablas de Base de Datos

```sql
-- Paneles Disponibles
CREATE TABLE admin_panels (
  id SERIAL PRIMARY KEY,
  panel_key VARCHAR(50) UNIQUE NOT NULL,
  panel_name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  category VARCHAR(50), -- 'admin', 'customer_service', 'operations'
  is_active BOOLEAN DEFAULT true
);

-- Módulos por Panel
CREATE TABLE admin_panel_modules (
  id SERIAL PRIMARY KEY,
  panel_key VARCHAR(50) REFERENCES admin_panels(panel_key),
  module_key VARCHAR(50) NOT NULL,
  module_name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(panel_key, module_key)
);

-- Permisos de Usuario por Panel
CREATE TABLE user_panel_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  panel_key VARCHAR(50) NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  granted_by INTEGER REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, panel_key)
);

-- Permisos de Usuario por Módulo
CREATE TABLE user_module_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  panel_key VARCHAR(50) NOT NULL,
  module_key VARCHAR(50) NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  granted_by INTEGER REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, panel_key, module_key)
);
```

### Paneles Disponibles

| Panel Key | Nombre | Categoría |
|-----------|--------|-----------|
| `admin_china_sea` | Marítimo China | admin |
| `admin_china_air` | China Aéreo | admin |
| `admin_usa_pobox` | PO Box USA | admin |
| `admin_mx_cedis` | CEDIS México | admin |
| `admin_mx_national` | Nacional México | admin |
| `admin_gex` | Garantía GEX | admin |
| `admin_verifications` | Verificaciones KYC | admin |
| `admin_supplier_payments` | Pago Proveedores | admin |
| `admin_permissions` | Matriz de Permisos | admin |
| `admin_financial` | Gestión Financiera | admin |
| `admin_hr` | Recursos Humanos | admin |
| `admin_fleet` | Gestión de Flotilla | admin |
| `cs_leads` | Central de Leads | customer_service |
| `cs_clients` | Control de Clientes | customer_service |
| `cs_support` | Centro de Soporte | customer_service |
| `ops_mx_cedis` | Bodega CEDIS | operations |
| `ops_usa_pobox` | Recepción PO Box | operations |
| `ops_china_air` | Recepción China Aéreo | operations |
| `ops_china_sea` | Recepción China Marítimo | operations |

### Módulos del Panel Marítimo (admin_china_sea)

| Module Key | Nombre | Descripción |
|------------|--------|-------------|
| `consolidations` | Consolidaciones | Gestión de contenedores |
| `inbound_emails` | Correos Entrantes | Recepción de documentos |
| `maritime_api` | API Marítima | Sincronización con China |
| `anticipos` | Anticipos | Control de pagos anticipados |
| `reports` | Reportes | Informes y estadísticas |
| `costing` | Costeo | Costos por contenedor |
| `inventory` | Inventario | Control de mercancía |
| `pricing` | Precios | Tarifas y cotizaciones |
| `invoicing` | Facturación | CFDI y facturación |
| `instructions` | Instrucciones | Guías de embarque |
| `routes` | Rutas | Gestión de rutas marítimas |

### Endpoints de Permisos

```typescript
// Obtener mis permisos de panel
GET /api/panels/me
→ { panels: [{ panel_key, panel_name, can_view, can_edit }, ...] }

// Obtener mis permisos de módulos de un panel
GET /api/modules/:panelKey/me
→ { modules: [{ module_key, module_name, can_view, can_edit }, ...] }

// Admin: Lista todos los paneles
GET /api/admin/panels
→ { panels: [...] }

// Admin: Permisos de un usuario específico
GET /api/admin/panels/user/:userId
→ { permissions: [...] }

// Admin: Actualizar permisos de panel
PUT /api/admin/panels/user/:userId
→ Body: { permissions: [{ panel_key, can_view, can_edit }] }

// Admin: Módulos de un panel
GET /api/admin/panels/:panelKey/modules
→ { modules: [...] }

// Admin: Actualizar permisos de módulos
PUT /api/admin/panels/:panelKey/user/:userId/modules
→ Body: { permissions: [{ module_key, can_view, can_edit }] }
```

### Uso en Frontend

```typescript
// CustomerServiceHubPage.tsx - Cargar permisos de panel
useEffect(() => {
  const loadPermissions = async () => {
    if (isSuperAdmin) return;
    const res = await fetch(`${API_URL}/api/panels/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const permsMap: Record<string, boolean> = {};
      data.panels?.forEach((p) => {
        permsMap[p.panel_key] = p.can_view === true;
      });
      setUserPermissions(permsMap);
    }
  };
  loadPermissions();
}, [token, isSuperAdmin]);

// AdminHubPage.tsx - Cargar permisos de módulos
useEffect(() => {
  const fetchModulePermissions = async () => {
    if (isSuperAdmin) return;
    const res = await fetch(`${API_URL}/api/modules/${panelKey}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const permsObj: Record<string, boolean> = {};
      data.modules?.forEach((m) => {
        permsObj[m.module_key] = m.can_view === true;
      });
      setModulePermissions(permsObj);
    }
  };
  fetchModulePermissions();
}, [panelKey, isSuperAdmin]);
```

### Script para Asignar Todos los Permisos

```javascript
// Asignar permisos completos a un usuario admin
const userId = 62; // Juan Segura

// 1. Asignar permisos de todos los paneles
const panels = await pool.query(
  `SELECT panel_key FROM admin_panels WHERE is_active = true`
);
for (const panel of panels.rows) {
  await pool.query(`
    INSERT INTO user_panel_permissions (user_id, panel_key, can_view, can_edit)
    VALUES ($1, $2, true, true)
    ON CONFLICT (user_id, panel_key) 
    DO UPDATE SET can_view = true, can_edit = true
  `, [userId, panel.panel_key]);
}

// 2. Asignar permisos de todos los módulos
const modules = await pool.query(
  `SELECT panel_key, module_key FROM admin_panel_modules WHERE is_active = true`
);
for (const mod of modules.rows) {
  await pool.query(`
    INSERT INTO user_module_permissions (user_id, panel_key, module_key, can_view, can_edit)
    VALUES ($1, $2, $3, true, true)
    ON CONFLICT (user_id, panel_key, module_key) 
    DO UPDATE SET can_view = true, can_edit = true
  `, [userId, mod.panel_key, mod.module_key]);
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

### Flujo PO Box USA - Entrada y Salida

El panel de **PO Box USA** (`usa_pobox`) tiene un flujo especial que diferencia entre **Entrada** (recepción de paquetes) y **Salida** (consolidaciones/despachos).

```
┌─────────────────────────────────────────────────────────────────┐
│                    Panel PO Box USA                              │
│                      usa_pobox                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Usuario selecciona "USA PO Box" en WarehouseHubPage           │
│                         │                                        │
│                         ▼                                        │
│   ┌─────────────────────────────────────────────────────┐       │
│   │           Modal: ¿Qué desea hacer?                  │       │
│   │                                                     │       │
│   │  ┌──────────────────┐   ┌──────────────────┐       │       │
│   │  │  📥 ENTRADA      │   │  📤 SALIDA       │       │       │
│   │  │  Recibir         │   │  Procesar        │       │       │
│   │  │  Paquetes        │   │  Despachos       │       │       │
│   │  └────────┬─────────┘   └────────┬─────────┘       │       │
│   │           │                      │                  │       │
│   └───────────│──────────────────────│──────────────────┘       │
│               ▼                      ▼                           │
│   ┌───────────────────┐   ┌───────────────────┐                 │
│   │  ShipmentsPage    │   │ ConsolidationsPage│                 │
│   │  (Wizard Recibir) │   │ (Control Salidas) │                 │
│   │  service_type:    │   │                   │                 │
│   │  POBOX_USA        │   │                   │                 │
│   └───────────────────┘   └───────────────────┘                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Componentes del Flujo

| Modo | Componente | Archivo | Descripción |
|------|------------|---------|-------------|
| **Entrada** | `ShipmentsPage` | `ShipmentsPage.tsx` | Wizard para recibir paquetes nuevos |
| **Salida** | `ConsolidationsPage` | `ConsolidationsPage.tsx` | Control de despachos y consolidaciones |

#### Lógica de Asignación de `service_type`

Cuando se crea un paquete desde el panel PO Box USA:

```typescript
// WarehouseHubPage.tsx - Pasa warehouseLocation al componente
<ShipmentsPage users={users} warehouseLocation={selectedPanel} />
// selectedPanel = 'usa_pobox'

// ShipmentsPage.tsx - Envía warehouseLocation en el payload
const payload = {
  boxId,
  description,
  boxes: [...],
  warehouseLocation: warehouseLocation || undefined, // 'usa_pobox'
};

// packageController.ts - Backend asigna service_type
const getServiceType = (location?: string): string => {
    const serviceMap: Record<string, string> = {
        'usa_pobox': 'POBOX_USA',    // ✅ PO Box USA
        'china_air': 'AIR_CHN_MX',
        'china_sea': 'SEA_CHN_MX',
        'mx_cedis': 'AA_DHL',
        'mx_national': 'NATIONAL',
    };
    return serviceMap[location || ''] || 'AIR_CHN_MX';
};
```

### Página de Consolidaciones (ConsolidationsPage)

La página de **Control de Salidas** maneja las solicitudes de despacho generadas por clientes desde la App móvil.

#### Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                   ConsolidationsPage.tsx                         │
│                 Control de Salidas (Consolidaciones)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Stats Cards                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │ │
│  │  │ Por      │ │ Proce-   │ │ En       │ │ Entre-   │      │ │
│  │  │ Procesar │ │ sando    │ │ Tránsito │ │ gados    │      │ │
│  │  │ 🟠       │ │ 🔵       │ │ 🔷       │ │ 🟢       │      │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Tabla de Órdenes                        │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │ ID │ Cliente │ Paquetes │ Peso │ Fecha │ Status │ 🔘 │ │ │
│  │  │ #1 │ Juan    │    3     │ 5kg  │ Feb26 │ ⏳     │ ✈️ │ │ │
│  │  │ #2 │ María   │    1     │ 2kg  │ Feb25 │ 🚛     │    │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Estados de Consolidación

| Status | Label ES | Label EN | Color | Descripción |
|--------|----------|----------|-------|-------------|
| `requested` | POR PROCESAR | PENDING | 🟠 warning | Solicitud recibida del cliente |
| `processing` | PROCESANDO | PROCESSING | 🔵 info | En proceso de preparación |
| `in_transit` | EN TRÁNSITO | IN TRANSIT | 🔷 primary | Despachado, en camino |
| `shipped` | ENTREGADO | DELIVERED | 🟢 success | Entregado al cliente final |

#### Endpoints de Consolidaciones

```http
# Listar consolidaciones
GET /api/admin/consolidations
Authorization: Bearer {token}

Response:
[
  {
    "id": 1,
    "status": "requested",
    "total_weight": "5.50",
    "created_at": "2026-02-26T10:30:00Z",
    "client_name": "Juan Pérez",
    "box_id": "ETX-5993",
    "package_count": "3"
  }
]

# Despachar consolidación
PUT /api/admin/consolidations/dispatch
Authorization: Bearer {token}
Content-Type: application/json

{
  "consolidationId": 1,
  "masterTracking": "AA1234"  // Opcional: vuelo o guía master
}

Response:
{
  "message": "Orden despachada exitosamente",
  "order": { ... }
}
```

#### Flujo de Despacho

```
┌─────────────────────────────────────────────────────────────────┐
│                    Proceso de Despacho                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Cliente solicita envío desde App móvil                      │
│                    │                                             │
│                    ▼                                             │
│  2. Se crea orden con status = 'requested'                      │
│                    │                                             │
│                    ▼                                             │
│  3. Operador ve orden en ConsolidationsPage                     │
│                    │                                             │
│                    ▼                                             │
│  4. Operador hace clic en "Procesar Salida"                     │
│                    │                                             │
│                    ▼                                             │
│  ┌─────────────────────────────────────────┐                    │
│  │     Modal de Confirmación de Despacho   │                    │
│  │                                         │                    │
│  │  • Muestra resumen del cliente          │                    │
│  │  • Campo opcional: Guía Master/Vuelo    │                    │
│  │  • Advertencia: notificará al cliente   │                    │
│  │                                         │                    │
│  │  [Cancelar]        [Confirmar Despacho] │                    │
│  └─────────────────────────────────────────┘                    │
│                    │                                             │
│                    ▼                                             │
│  5. Status cambia a 'in_transit'                                │
│                    │                                             │
│                    ▼                                             │
│  6. Cliente recibe notificación push/email                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Archivos Relacionados

| Archivo | Ubicación | Propósito |
|---------|-----------|-----------|
| `ConsolidationsPage.tsx` | `entregax-web-admin/src/pages/` | UI del panel de consolidaciones |
| `WarehouseHubPage.tsx` | `entregax-web-admin/src/pages/` | Hub que muestra modal entrada/salida |
| `packageController.ts` | `entregax-backend-api/src/` | Endpoints de consolidaciones |

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

## 📦 Costeo PO Box USA

### Fórmula de Costeo

El costeo de paquetes PO Box USA utiliza una fórmula basada en volumen dimensional:

```
┌─────────────────────────────────────────────────────────────────┐
│                  FÓRMULA DE COSTEO PO BOX USA                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PASO 1: Convertir dimensiones de cm a pulgadas                 │
│  ─────────────────────────────────────────────────              │
│  L (pulg) = L (cm) ÷ 2.54                                       │
│  A (pulg) = A (cm) ÷ 2.54                                       │
│  H (pulg) = H (cm) ÷ 2.54                                       │
│                                                                  │
│  PASO 2: Calcular volumen en pulgadas cúbicas                   │
│  ─────────────────────────────────────────────────              │
│  Volumen (pulg³) = L × A × H                                    │
│                                                                  │
│  PASO 3: Convertir a pies cúbicos                               │
│  ─────────────────────────────────────────────────              │
│  Pie³ = Volumen (pulg³) ÷ 10780                                 │
│                                                                  │
│  PASO 4: Calcular costo en USD                                  │
│  ─────────────────────────────────────────────────              │
│  Costo USD = Pie³ × $75.00                                      │
│                                                                  │
│  PASO 5: Convertir a MXN con TC de la API                       │
│  ─────────────────────────────────────────────────              │
│  Costo MXN = Costo USD × TC API                                 │
│                                                                  │
│  MÍNIMO: $50.00 MXN                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Parámetros de Configuración

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `dimensional_divisor` | 10780 | Divisor para convertir pulg³ a pie³ |
| `base_rate` | $75.00 USD | Tarifa por pie cúbico |
| `min_cost` | $50.00 MXN | Costo mínimo cobrable |

### Ejemplo de Cálculo

Para un paquete de **40 × 40 × 50 cm** con TC API de **$17.65**:

```
L = 40 ÷ 2.54 = 15.75 pulg
A = 40 ÷ 2.54 = 15.75 pulg
H = 50 ÷ 2.54 = 19.69 pulg

Volumen = 15.75 × 15.75 × 19.69 = 4,884.77 pulg³
Pie³ = 4,884.77 ÷ 10780 = 0.4531

Costo USD = 0.4531 × $75.00 = $33.98
Costo MXN = $33.98 × 17.65 = $599.75
```

### Campos Guardados en Base de Datos

Al registrar una guía PO Box USA, se guardan los siguientes campos:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `pobox_service_cost` | NUMERIC(10,2) | Costo del servicio en MXN |
| `pobox_cost_usd` | NUMERIC(10,2) | Costo del servicio en USD |
| `registered_exchange_rate` | NUMERIC(10,4) | TC usado al momento del registro |
| `assigned_cost_mxn` | NUMERIC(10,2) | Costo total asignado (PO Box + GEX) |

### Tabla: `pobox_costing_config`

```sql
CREATE TABLE pobox_costing_config (
    id SERIAL PRIMARY KEY,
    conversion_factor NUMERIC(10,4) DEFAULT 2.54,   -- cm a pulgadas
    dimensional_divisor NUMERIC(10,2) DEFAULT 10780,
    base_rate NUMERIC(10,2) DEFAULT 75,             -- USD por pie³
    min_cost NUMERIC(10,2) DEFAULT 50,              -- Mínimo MXN
    currency VARCHAR(10) DEFAULT 'MXN',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Endpoint de Costeo

```http
GET /api/pobox/costing/packages
Authorization: Bearer <token>

Response:
{
  "packages": [
    {
      "id": 123,
      "tracking": "US-47US7747",
      "pkg_length": 36.3,
      "pkg_width": 19.7,
      "pkg_height": 9.3,
      "pobox_service_cost": "50.00",
      "pobox_cost_usd": "2.83",
      "registered_exchange_rate": "17.6500",
      "costing_paid": false,
      "user_name": "ALDO JOSE CAMPOS LOMAS"
    }
  ]
}
```

### Panel de Administración

El panel de costeo PO Box (`POBoxCostingPage.tsx`) incluye:

1. **Calculadora**: Calcular costo manual ingresando dimensiones
2. **Paquetes**: Lista de guías pendientes/pagadas con filtros
3. **Historial**: Registro de pagos realizados
4. **Utilidades**: Análisis de márgenes (solo admin/super_admin)

### Flujo de Registro

```
┌─────────────────┐
│  ShipmentsPage  │  (Bodega USA)
│  Escanea guía   │
│  + dimensiones  │
└────────┬────────┘
         ▼
┌─────────────────┐
│ packageController│
│ calculatePOBoxCost()
│  1. Obtener TC API
│  2. Calcular Pie³
│  3. USD × TC = MXN
└────────┬────────┘
         ▼
┌─────────────────┐
│   Base de Datos │
│  packages:      │
│  - pobox_service_cost
│  - pobox_cost_usd
│  - registered_exchange_rate
└─────────────────┘
```

---

## 🛡️ Garantía Extendida GEX

### Descripción General

La Garantía Extendida GEX es un seguro opcional que los clientes pueden contratar para proteger sus envíos contra daños, pérdida o robo durante el tránsito.

### Fórmula de Cálculo GEX

```
┌─────────────────────────────────────────────────────────────────┐
│                   FÓRMULA DE CÁLCULO GEX                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ENTRADA: Valor declarado por el cliente (USD)                  │
│  ─────────────────────────────────────────────                  │
│                                                                  │
│  PASO 1: Convertir a MXN                                        │
│  ─────────────────────────────────────────────                  │
│  Valor Asegurado (MXN) = Valor USD × TC API                     │
│                                                                  │
│  PASO 2: Calcular prima variable (5%)                           │
│  ─────────────────────────────────────────────                  │
│  Prima = Valor Asegurado × 0.05                                 │
│                                                                  │
│  PASO 3: Sumar costo fijo de póliza                             │
│  ─────────────────────────────────────────────                  │
│  Costo Fijo = $625.00 MXN                                       │
│                                                                  │
│  PASO 4: Total GEX                                              │
│  ─────────────────────────────────────────────                  │
│  Total GEX = Prima + Costo Fijo                                 │
│                                                                  │
│  PASO 5: Nuevo Saldo Pendiente                                  │
│  ─────────────────────────────────────────────                  │
│  Saldo = Servicio PO Box + Total GEX                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Parámetros de Configuración GEX

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `variablePercent` | 5% (0.05) | Porcentaje sobre valor asegurado |
| `fixedFee` | $625.00 MXN | Costo fijo de la póliza |
| Tipo de cambio | API en tiempo real | Se obtiene de `exchange_rates` |

### Tabla: `warranties` (Pólizas GEX)

```sql
CREATE TABLE warranties (
    id SERIAL PRIMARY KEY,
    gex_folio VARCHAR(20) NOT NULL,       -- GEX-2026-00001
    user_id INTEGER REFERENCES users(id),
    advisor_id INTEGER REFERENCES users(id),
    box_count INTEGER,
    volume NUMERIC(10,2),                 -- Peso/volumen
    invoice_value_usd NUMERIC(10,2),      -- Valor declarado USD
    route VARCHAR(100),                   -- Ruta (USA→MX, China→MX)
    description TEXT,
    signed_contract_url TEXT,             -- Firma digital base64
    exchange_rate_used NUMERIC(10,4),     -- TC al momento
    insured_value_mxn NUMERIC(10,2),      -- Valor asegurado MXN
    variable_fee_mxn NUMERIC(10,2),       -- Prima 5%
    fixed_fee_mxn NUMERIC(10,2),          -- Costo fijo $625
    total_cost_mxn NUMERIC(10,2),         -- Total GEX
    advisor_commission NUMERIC(10,2),     -- Comisión asesor
    status VARCHAR(20) DEFAULT 'generated', -- generated, pending_payment, active, claimed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Secuencia para folios GEX
CREATE SEQUENCE gex_sequence START 1;
```

### Campos GEX en Tabla `packages`

Cuando se contrata GEX, estos campos se actualizan en `packages`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `has_gex` | BOOLEAN | Si tiene GEX contratado |
| `gex_folio` | VARCHAR | Folio de la póliza (GEX-2026-XXXXX) |
| `declared_value` | NUMERIC(10,2) | Valor declarado en USD |
| `gex_insurance_cost` | NUMERIC(10,2) | Prima del seguro (5%) en MXN |
| `gex_fixed_cost` | NUMERIC(10,2) | Costo fijo póliza ($625 MXN) |
| `gex_total_cost` | NUMERIC(10,2) | Total GEX en MXN |
| `saldo_pendiente` | NUMERIC(10,2) | Saldo total a cobrar (PO Box + GEX) |

### Endpoints GEX

```http
# Obtener cotización GEX
POST /api/gex/quote
Authorization: Bearer <token>
Content-Type: application/json

{
  "invoiceValueUsd": 500.00
}

Response:
{
  "invoiceValueUsd": 500.00,
  "exchangeRate": 18.20,
  "insuredValueMxn": 9100.00,
  "variableFeeMxn": 455.00,
  "fixedFeeMxn": 625.00,
  "totalCostMxn": 1080.00,
  "advisorCommission": 625.00
}
```

```http
# Contratar GEX (autoservicio cliente)
POST /api/gex/warranties/self
Authorization: Bearer <token>
Content-Type: application/json

{
  "packageId": 123,
  "serviceType": "POBOX_USA",
  "invoiceValueUSD": 500.00,
  "boxCount": 1,
  "route": "USA → México",
  "weight": 2.5,
  "description": "Electrónicos varios",
  "signature": "base64...",      // Firma digital del cliente
  "paymentOption": "withShipment" // now | withShipment
}

Response:
{
  "success": true,
  "message": "Garantía Extendida contratada exitosamente",
  "warranty": {
    "id": 456,
    "folio": "GEX-2026-00113",
    "invoiceValueUSD": 500.00,
    "insuredValueMXN": 9100.00,
    "totalCost": 1080.00,
    "status": "generated",
    "paymentOption": "withShipment"
  }
}
```

### Flujo de Contratación GEX (Mobile App)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO DE CONTRATACIÓN GEX                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PackageDetailScreen                                            │
│  └── Botón "Contratar GEX" (si has_gex = false)                │
│       │                                                          │
│       ▼                                                          │
│  GEXContractScreen (4 pasos)                                    │
│  │                                                               │
│  ├── Paso 1: FORMULARIO                                         │
│  │   - Valor de factura (USD)                                   │
│  │   - Descripción de mercancía                                 │
│  │   - Calculadora en tiempo real                               │
│  │                                                               │
│  ├── Paso 2: POLÍTICAS                                          │
│  │   - Términos y condiciones GEX                               │
│  │   - Scroll obligatorio + checkbox                            │
│  │                                                               │
│  ├── Paso 3: FIRMA DIGITAL                                      │
│  │   - Canvas para firma con el dedo                            │
│  │   - Se guarda como base64                                    │
│  │                                                               │
│  └── Paso 4: CONFIRMACIÓN                                       │
│      - Opción de pago: Ahora / Con embarque                     │
│      - Resumen final                                            │
│      │                                                           │
│      ▼                                                           │
│  POST /api/gex/warranties/self                                  │
│  │                                                               │
│  ▼                                                               │
│  warrantyController.ts                                          │
│  └── createWarrantyByUser()                                     │
│      1. Crear registro en `warranties`                          │
│      2. Actualizar `packages`:                                  │
│         - has_gex = true                                        │
│         - gex_folio, declared_value                             │
│         - gex_insurance_cost, gex_fixed_cost                    │
│         - gex_total_cost                                        │
│         - saldo_pendiente = assigned_cost + gex_total           │
│      │                                                           │
│      ▼                                                           │
│  PackageDetailScreen                                            │
│  └── Muestra badge "GEX Contratado" ✓                          │
│  └── SALDO PENDIENTE incluye GEX                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Ejemplo Completo de Cálculo

```javascript
// Datos de entrada
const invoiceValueUsd = 123.00;  // Valor declarado por cliente
const exchangeRate = 18.20;      // TC actual

// Cálculos
const insuredValueMxn = invoiceValueUsd * exchangeRate;  // 2238.60 MXN
const variableFee = insuredValueMxn * 0.05;              // 111.93 MXN (5%)
const fixedFee = 625.00;                                  // 625.00 MXN
const gexTotal = variableFee + fixedFee;                  // 736.93 MXN

// Saldo pendiente (si servicio PO Box = $2,116.53)
const poboxCost = 2116.53;
const saldoPendiente = poboxCost + gexTotal;              // 2853.46 MXN
```

### Archivos Relacionados

```
entregax-backend-api/
├── src/warrantyController.ts     # Lógica de contratación GEX
│   ├── getGexRates()             # Obtener tarifas de BD
│   ├── createWarrantyByUser()    # Endpoint autoservicio
│   └── createWarrantyByAdmin()   # Endpoint para admins

entregax-mobile-app/
├── src/screens/
│   ├── GEXContractScreen.tsx     # Wizard de contratación (4 pasos)
│   └── PackageDetailScreen.tsx   # Muestra info GEX + saldo
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

## 🏦 Openpay Multi-Empresa - Cobranza SPEI

### Descripción General

Sistema de **cobranza automatizada por SPEI** utilizando Openpay. Cada empresa emisora (RFC) puede tener su propia cuenta Openpay configurada, permitiendo que los clientes paguen mediante transferencia bancaria a una **CLABE virtual única** asignada por STP (Sistema de Transferencias y Pagos).

### Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OPENPAY MULTI-EMPRESA                            │
│                   Cobranza SPEI Automatizada                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  Empresa 1   │    │  Empresa 2   │    │  Empresa N   │          │
│  │  (RFC AAA)   │    │  (RFC BBB)   │    │  (RFC NNN)   │          │
│  │  Openpay #1  │    │  Openpay #2  │    │  Openpay #N  │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                    │
│         └───────────────────┼───────────────────┘                    │
│                             │                                        │
│                    ┌────────▼────────┐                              │
│                    │   Cliente con   │                              │
│                    │  CLABE Virtual  │                              │
│                    │  (STP Único)    │                              │
│                    └────────┬────────┘                              │
│                             │                                        │
│                    ┌────────▼────────┐                              │
│                    │   Transferencia │                              │
│                    │      SPEI       │                              │
│                    └────────┬────────┘                              │
│                             │                                        │
│                    ┌────────▼────────┐                              │
│                    │    Webhook      │                              │
│                    │  /webhooks/     │                              │
│                    │  openpay/:id    │                              │
│                    └────────┬────────┘                              │
│                             │                                        │
│                    ┌────────▼────────┐                              │
│                    │   Conciliación  │                              │
│                    │   Automática    │                              │
│                    │     (FIFO)      │                              │
│                    └─────────────────┘                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Flujo de Pago SPEI

```
1. Admin configura Openpay para empresa emisora
2. Sistema genera CLABE virtual única para cada cliente
3. Cliente realiza transferencia SPEI a su CLABE
4. Openpay notifica vía webhook
5. Motor FIFO aplica pago a guías pendientes
6. Se actualiza saldo del cliente automáticamente
```

### Base de Datos

#### Columnas en `fiscal_emitters`
```sql
-- Configuración Openpay por empresa
ALTER TABLE fiscal_emitters ADD COLUMN openpay_merchant_id VARCHAR(50);
ALTER TABLE fiscal_emitters ADD COLUMN openpay_private_key TEXT;
ALTER TABLE fiscal_emitters ADD COLUMN openpay_public_key TEXT;
ALTER TABLE fiscal_emitters ADD COLUMN openpay_production_mode BOOLEAN DEFAULT FALSE;
ALTER TABLE fiscal_emitters ADD COLUMN openpay_webhook_secret VARCHAR(100);
ALTER TABLE fiscal_emitters ADD COLUMN openpay_commission_fee DECIMAL(10,2) DEFAULT 10.00;
ALTER TABLE fiscal_emitters ADD COLUMN openpay_configured BOOLEAN DEFAULT FALSE;
```

#### Columnas en `users`
```sql
-- Relación CLABE-Usuario
ALTER TABLE users ADD COLUMN openpay_customer_id VARCHAR(50);
ALTER TABLE users ADD COLUMN virtual_clabe VARCHAR(18);
ALTER TABLE users ADD COLUMN openpay_empresa_id INTEGER REFERENCES fiscal_emitters(id);
ALTER TABLE users ADD COLUMN clabe_created_at TIMESTAMP;
```

#### Tabla `openpay_webhook_logs`
```sql
CREATE TABLE openpay_webhook_logs (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(100) NOT NULL,
    empresa_id INTEGER REFERENCES fiscal_emitters(id),
    user_id INTEGER REFERENCES users(id),
    clabe_virtual VARCHAR(18),
    monto_recibido DECIMAL(12,2) NOT NULL,
    monto_neto DECIMAL(12,2),
    concepto TEXT,
    fecha_pago TIMESTAMP NOT NULL,
    estatus_procesamiento VARCHAR(20) DEFAULT 'pendiente',
    error_message TEXT,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);
```

#### Tabla `openpay_payment_applications`
```sql
CREATE TABLE openpay_payment_applications (
    id SERIAL PRIMARY KEY,
    webhook_log_id INTEGER REFERENCES openpay_webhook_logs(id),
    user_id INTEGER REFERENCES users(id),
    package_id INTEGER REFERENCES packages(id),
    monto_aplicado DECIMAL(12,2) NOT NULL,
    saldo_anterior DECIMAL(12,2),
    saldo_nuevo DECIMAL(12,2),
    tipo_documento VARCHAR(20),
    documento_referencia VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Endpoints API

#### Configuración por Empresa

```http
# Listar empresas con estado Openpay
GET /api/admin/openpay/empresas
Authorization: Bearer {token}

Response:
[
  {
    "id": 1,
    "alias": "Empresa Principal",
    "rfc": "ABC123456XY9",
    "business_name": "Mi Empresa SA de CV",
    "openpay_configured": true,
    "openpay_production_mode": false,
    "openpay_merchant_id": "mxxxxxxxxx",
    "clientes_con_clabe": 45
  }
]

# Obtener configuración de una empresa
GET /api/admin/openpay/config/:empresa_id
Authorization: Bearer {token}

Response:
{
  "id": 1,
  "alias": "Empresa Principal",
  "rfc": "ABC123456XY9",
  "openpay_merchant_id": "mxxxxxxxxx",
  "openpay_public_key": "pk_xxxxx",
  "openpay_production_mode": false,
  "openpay_commission_fee": 10.00,
  "openpay_configured": true,
  "has_private_key": "********"
}

# Guardar configuración Openpay
POST /api/admin/openpay/config
Authorization: Bearer {token}
{
  "empresa_id": 1,
  "merchant_id": "mxxxxxxxxxxxxxxxxx",
  "private_key": "sk_xxxxxxxxxxxxxxxx",
  "public_key": "pk_xxxxxxxxxxxxxxxx",
  "production_mode": false,
  "webhook_secret": "opcional",
  "commission_fee": 10.00
}

Response:
{
  "success": true,
  "message": "Configuración Openpay guardada para Empresa Principal",
  "webhook_url": "https://api.entregax.com/webhooks/openpay/1"
}
```

#### Gestión de Clientes y CLABEs

```http
# Crear cliente Openpay y asignar CLABE
POST /api/admin/openpay/create-customer
Authorization: Bearer {token}
{
  "user_id": 123,
  "empresa_id": 1
}

Response:
{
  "success": true,
  "message": "Cliente creado y CLABE asignada",
  "customer_id": "a1b2c3d4e5f6",
  "clabe": "646180157000000001",
  "empresa": "Empresa Principal"
}

# Generar CLABEs en lote
POST /api/admin/openpay/generate-clabe-batch
Authorization: Bearer {token}
{
  "empresa_id": 1,
  "user_ids": [101, 102, 103, 104, 105]
}

Response:
{
  "success": true,
  "total_procesados": 5,
  "total_errores": 0,
  "results": [
    { "user_id": 101, "clabe": "646180157000000001", "status": "creada" },
    { "user_id": 102, "clabe": "646180157000000002", "status": "creada" }
  ],
  "errors": []
}

# Obtener CLABE de un usuario
GET /api/admin/openpay/user-clabe/:user_id
Authorization: Bearer {token}

Response:
{
  "user_id": 123,
  "nombre": "Juan Pérez",
  "clabe": "646180157000000001",
  "banco_destino": "STP (Sistema de Transferencias y Pagos)",
  "beneficiario": "Mi Empresa SA de CV",
  "instrucciones": "Realiza tu transferencia SPEI a esta CLABE. El pago se aplicará automáticamente."
}

# Cliente obtiene su propia CLABE
GET /api/my-clabe
Authorization: Bearer {token}
```

#### Webhook de Openpay

```http
# Webhook público (recibe notificaciones de Openpay)
POST /webhooks/openpay/:empresa_id

# Payload de ejemplo (spei.received):
{
  "type": "spei.received",
  "transaction": {
    "id": "trx_abc123",
    "amount": 1500.00,
    "clabe": "646180157000000001",
    "description": "Pago guía US-2026-0001",
    "operation_date": "2026-03-04T10:30:00Z"
  }
}

Response:
{
  "received": true,
  "processed": true,
  "cliente": "Juan Pérez",
  "monto_recibido": 1500.00,
  "monto_neto": 1490.00,
  "guias_actualizadas": 2,
  "saldo_favor": 0
}
```

#### Reportes y Dashboard

```http
# Historial de pagos SPEI
GET /api/admin/openpay/payments?empresa_id=1&date_from=2026-03-01&status=procesado
Authorization: Bearer {token}

Response:
[
  {
    "id": 1,
    "transaction_id": "trx_abc123",
    "monto_recibido": 1500.00,
    "monto_neto": 1490.00,
    "concepto": "Pago guía",
    "fecha_pago": "2026-03-04T10:30:00Z",
    "estatus_procesamiento": "procesado",
    "empresa_alias": "Empresa Principal",
    "cliente_nombre": "Juan Pérez",
    "guias_aplicadas": 2
  }
]

# Dashboard de cobranza
GET /api/admin/openpay/dashboard?empresa_id=1
Authorization: Bearer {token}

Response:
{
  "stats": {
    "total_transacciones": 150,
    "total_recibido": 125000.00,
    "total_neto": 123500.00,
    "procesados": 148,
    "errores": 2,
    "pendientes": 0
  },
  "ultimos_7_dias": [
    { "fecha": "2026-03-04", "transacciones": 12, "monto": 8500.00 },
    { "fecha": "2026-03-03", "transacciones": 18, "monto": 12300.00 }
  ],
  "clientes_con_clabe": 245
}

# Detalle de aplicaciones de un pago
GET /api/admin/openpay/applications/:log_id
Authorization: Bearer {token}

Response:
[
  {
    "id": 1,
    "monto_aplicado": 800.00,
    "saldo_anterior": 800.00,
    "saldo_nuevo": 0.00,
    "tipo_documento": "guia",
    "documento_referencia": "US-2026-0001",
    "tracking_internal": "US-2026-0001",
    "guia_status": "delivered"
  },
  {
    "id": 2,
    "monto_aplicado": 690.00,
    "saldo_anterior": 1200.00,
    "saldo_nuevo": 510.00,
    "tipo_documento": "guia",
    "documento_referencia": "US-2026-0002"
  }
]
```

### Motor de Conciliación FIFO

El sistema aplica los pagos recibidos automáticamente a las guías pendientes del cliente usando el método **FIFO** (First In, First Out):

```typescript
// Lógica de conciliación en openpayController.ts

// 1. Obtener guías pendientes (ordenadas por fecha, más antiguas primero)
const guiasPendientes = await pool.query(`
    SELECT id, tracking_internal, saldo_pendiente, created_at
    FROM packages 
    WHERE user_id = $1 
    AND (saldo_pendiente > 0 OR payment_status != 'paid')
    ORDER BY created_at ASC
`, [userId]);

// 2. Aplicar pago secuencialmente
for (const guia of guiasPendientes.rows) {
    if (saldoDisponible <= 0) break;
    
    const montoAplicar = Math.min(saldoDisponible, guia.saldo_pendiente);
    const nuevoSaldo = guia.saldo_pendiente - montoAplicar;
    const nuevoStatus = nuevoSaldo <= 0 ? 'paid' : 'partial';
    
    // Actualizar guía
    await pool.query(`
        UPDATE packages SET 
            saldo_pendiente = $1,
            monto_pagado = COALESCE(monto_pagado, 0) + $2,
            payment_status = $3
        WHERE id = $4
    `, [nuevoSaldo, montoAplicar, nuevoStatus, guia.id]);
    
    saldoDisponible -= montoAplicar;
}

// 3. Si queda saldo, se registra como crédito a favor
```

### Frontend - FiscalPage.tsx

La configuración de Openpay se integra en la página de **Facturación Fiscal** (`/empresas`):

```
FiscalPage.tsx
├── Tab "Mis Empresas"
│   └── Tabla de empresas emisoras
│       └── Columna "Openpay"
│           ├── Chip "Configurar" (si no configurado)
│           └── Chip "Prod" o "Sand" (si configurado)
│               └── Click → Modal de configuración
│
└── Modal Configuración Openpay
    ├── Merchant ID (requerido)
    ├── Private Key (requerido)
    ├── Public Key (opcional)
    ├── Comisión STP ($8-12 MXN)
    ├── Toggle Producción/Sandbox
    └── Botón "Guardar y Verificar"
```

### Migración

```bash
# Ejecutar migración de Openpay Multi-Empresa
cd entregax-backend-api
psql -d entregax -f migrations/add_openpay_multiempresa.sql
```

### Seguridad

1. **Claves privadas encriptadas** - Las private keys se almacenan en la BD
2. **Webhook por empresa** - Cada empresa tiene su propio endpoint de webhook
3. **Validación de duplicados** - Se verifica `transaction_id` antes de procesar
4. **Logs completos** - Toda transacción se registra con payload JSON
5. **Roles requeridos** - Solo DIRECTOR puede configurar Openpay

### Configuración Openpay

Para obtener las credenciales de Openpay:

1. Crear cuenta en [openpay.mx](https://www.openpay.mx)
2. Activar servicio SPEI (genera CLABEs virtuales)
3. Obtener Merchant ID, Private Key y Public Key
4. Configurar webhook apuntando a `/webhooks/openpay/{empresa_id}`
5. Probar en Sandbox antes de activar Producción

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

### 🔗 Asignación de Direcciones a Servicios

El sistema permite asignar direcciones específicas para cada tipo de servicio. Esto permite que el cliente tenga diferentes direcciones de entrega según el origen del envío.

#### Tabla `addresses` - Campo `default_for_service`

```sql
-- El campo default_for_service almacena los servicios asignados separados por coma
-- Valores posibles: 'usa', 'maritime', 'air', 'all'

ALTER TABLE addresses 
ADD COLUMN IF NOT EXISTS default_for_service VARCHAR(100);

-- Ejemplos:
-- 'usa'           → Solo para PO Box USA
-- 'maritime'      → Solo para envíos marítimos desde China
-- 'air'           → Solo para envíos aéreos desde China
-- 'usa,maritime'  → Para USA y Marítimo
-- 'all'           → Para todos los servicios
```

#### Flujo de Selección de Dirección

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE SELECCIÓN DE DIRECCIÓN                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Frontend solicita instrucciones del cliente                              │
│     GET /api/client/instructions/{boxId}?serviceType=usa                     │
│                                                                              │
│  2. Backend busca dirección para el servicio solicitado                      │
│     ┌────────────────────────────────────────────────────────────────────┐   │
│     │  SELECT * FROM addresses WHERE user_id = $1                        │   │
│     │  AND default_for_service ILIKE '%usa%'                             │   │
│     │  OR default_for_service ILIKE '%all%'                              │   │
│     └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  3. Resultado según servicio:                                                │
│     ┌──────────────┬────────────────────────────────────────────────────┐   │
│     │ Servicio     │ Comportamiento                                      │   │
│     ├──────────────┼────────────────────────────────────────────────────┤   │
│     │ USA (PO Box) │ SOLO usa direcciones con 'usa' o 'all' asignado.   │   │
│     │              │ NO hace fallback a is_default general.             │   │
│     ├──────────────┼────────────────────────────────────────────────────┤   │
│     │ Marítimo     │ Busca 'maritime' o 'all', si no encuentra          │   │
│     │              │ usa is_default = true como fallback.               │   │
│     ├──────────────┼────────────────────────────────────────────────────┤   │
│     │ Aéreo        │ Busca 'air' o 'all', si no encuentra               │   │
│     │              │ usa is_default = true como fallback.               │   │
│     └──────────────┴────────────────────────────────────────────────────┘   │
│                                                                              │
│  4. Respuesta incluye:                                                       │
│     - hasInstructions: true/false (si tiene dirección válida para servicio)  │
│     - defaultAddress: la dirección encontrada o null                         │
│     - usaAssignedAddressCount: cantidad de direcciones con 'usa' asignado    │
│     - totalAddressCount: total de direcciones del cliente                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Código Backend - addressController.ts

```typescript
// getClientInstructions - Lógica de selección de dirección por servicio

const serviceTypeLower = (serviceType?.toString().toLowerCase()) || '';
const isUSAService = serviceTypeLower === 'usa' || serviceTypeLower === 'pobox_usa';

// Filtrar direcciones que tienen el servicio USA asignado
const usaAssignedAddresses = addresses.filter((addr: any) => {
    if (!addr.default_for_service) return false;
    const services = addr.default_for_service.split(',').map((s: string) => s.trim().toLowerCase());
    return services.includes('usa') || services.includes('all');
});

// Buscar dirección predeterminada para el tipo de servicio
if (serviceType) {
    defaultAddress = addresses.find((addr: any) => {
        if (!addr.default_for_service) return false;
        const services = addr.default_for_service.split(',').map((s: string) => s.trim().toLowerCase());
        return services.includes(serviceTypeLower) || services.includes('all');
    });
}

// Para servicio USA, NO hacer fallback a la default general
// Para otros servicios, sí hacer fallback
if (!defaultAddress && !isUSAService) {
    defaultAddress = addresses.find((addr: any) => addr.is_default);
}

// hasInstructions = true solo si tiene dirección válida para el servicio
const hasInstructions = !!defaultAddress;
```

#### Endpoint de Instrucciones del Cliente

```http
# Obtener instrucciones del cliente con filtro por servicio
GET /api/client/instructions/{boxId}?serviceType={service}
Authorization: Bearer {token}

# Valores de serviceType:
# - usa / pobox_usa  → PO Box USA
# - maritime         → Marítimo China
# - air              → Aéreo China
# - national         → Envío Nacional

# Respuesta:
{
  "found": true,
  "hasInstructions": true,  // true si tiene dirección asignada al servicio
  "client": {
    "id": 123,
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "boxId": "S1"
  },
  "addresses": [
    {
      "id": 1,
      "alias": "Casa",
      "city": "Monterrey",
      "isDefault": true,
      "defaultForService": "maritime,air"  // Servicios asignados
    },
    {
      "id": 2,
      "alias": "Oficina",
      "city": "CDMX",
      "isDefault": false,
      "defaultForService": "usa"  // Solo para PO Box USA
    }
  ],
  "usaAssignedAddressCount": 1,   // Cantidad con 'usa' asignado
  "totalAddressCount": 2,          // Total de direcciones
  "defaultAddress": {              // Dirección para el servicio solicitado
    "id": 2,
    "alias": "Oficina",
    "recipientName": "Juan Pérez",
    "street": "Av. Insurgentes",
    ...
    "defaultForService": "usa"
  },
  "poboxRatesInfo": { ... }  // Solo cuando serviceType=usa
}
```

#### Opción "Dejar en Bodega" (leaveInWarehouse)

Para el servicio PO Box USA, cuando el cliente NO tiene dirección asignada al servicio, el sistema permite:

1. **Registrar el paquete sin dirección** → El paquete queda en bodega
2. **Cliente asigna dirección desde app móvil** → Selecciona dirección y servicio de paquetería

```typescript
// packageController.ts - Soporte para leaveInWarehouse

interface CreateShipmentBody {
    boxId: string;
    boxes: BoxItem[];
    carrier?: string;           // Opcional si leaveInWarehouse = true
    destination?: DestinationInfo; // Opcional si leaveInWarehouse = true
    leaveInWarehouse?: boolean; // Si true, se deja en bodega
    // ...
}

// Validaciones condicionales
if (!leaveInWarehouse) {
    if (!carrier) {
        return res.status(400).json({ error: 'Selecciona la paquetería de envío' });
    }
    if (!destination || !destination.country || !destination.city || !destination.address) {
        return res.status(400).json({ error: 'La dirección de destino es requerida' });
    }
}

// Valores seguros cuando se deja en bodega
const safeCarrier = leaveInWarehouse ? 'BODEGA' : (carrier || 'Sin asignar');
const safeDestination: DestinationInfo = leaveInWarehouse ? {
    country: 'México',
    city: 'En Bodega',
    address: 'Pendiente de asignar'
} : destination!;

// El paquete NO se auto-procesa, queda en estado 'received'
const shouldAutoProcess = !leaveInWarehouse && (isLastMileShipment || hasDefaultUsaAddress);
const initialStatus = shouldAutoProcess ? 'processing' : 'received';
```

#### App Móvil - Asignación de Servicios

```typescript
// Pantalla "Mis Direcciones" en app móvil

// Servicios disponibles para asignar
const AVAILABLE_SERVICES = [
  { key: 'maritime', label: 'Marítimo', icon: '🚢', description: 'Envíos por barco desde China' },
  { key: 'air', label: 'Aéreo', icon: '✈️', description: 'Envíos express por avión' },
  { key: 'usa', label: 'USA', icon: '🇺🇸', description: 'Consolidación paquetes USA' },
];

// Endpoint para actualizar servicios asignados
PUT /api/addresses/:id/services
{
  "services": ["usa", "maritime"]  // Array de servicios
}

// Backend guarda como string separado por coma
// default_for_service = "usa,maritime"
```

#### Reglas de Negocio por Servicio

| Servicio | Sin dirección asignada | Comportamiento |
|----------|------------------------|----------------|
| **PO Box USA** | ❌ No usa fallback | Muestra "Dejar en Bodega" como opción. Cliente debe asignar dirección desde app móvil. |
| **Marítimo** | ✅ Usa is_default | Si no hay 'maritime' asignado, usa la dirección is_default = true |
| **Aéreo** | ✅ Usa is_default | Si no hay 'air' asignado, usa la dirección is_default = true |
| **Nacional** | ✅ Usa is_default | Usa la dirección is_default = true |

#### Implementación para Nuevos Servicios

Para agregar soporte de direcciones a un nuevo servicio:

```typescript
// 1. Agregar el tipo de servicio a la función getServiceTypeFromCarrier
const getServiceTypeFromCarrier = (carrier: string): string => {
    const mapping: Record<string, string> = {
        'POBOX USA': 'usa',
        'Marítimo China': 'maritime',
        'Aéreo China': 'air',
        'Nuevo Servicio': 'nuevo_servicio',  // ← Agregar aquí
    };
    return mapping[carrier] || 'default';
};

// 2. En addressController.ts, decidir si el servicio usa fallback
const isStrictService = serviceTypeLower === 'usa' || 
                        serviceTypeLower === 'pobox_usa' ||
                        serviceTypeLower === 'nuevo_servicio';  // ← Si no debe usar fallback

// 3. En el frontend, agregar el servicio al selector de asignación
const AVAILABLE_SERVICES = [
    { key: 'usa', label: 'USA', ... },
    { key: 'maritime', label: 'Marítimo', ... },
    { key: 'air', label: 'Aéreo', ... },
    { key: 'nuevo_servicio', label: 'Nuevo Servicio', ... },  // ← Agregar aquí
];
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

## 🚢 Panel Marítimo China

### InboundEmailsPage - Recepción de Documentos

El panel de Correos Entrantes permite gestionar documentos marítimos recibidos por email.

### 🤖 Extracción de Datos con IA (OpenAI GPT-4o Vision)

El sistema utiliza **OpenAI GPT-4o Vision** para extraer datos automáticamente de los Bills of Lading (BL) en formato PDF.

#### Flujo de Extracción

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PDF del BL    │ ──► │  Puppeteer      │ ──► │  OpenAI GPT-4o  │
│  (data:base64)  │     │  (PDF → PNG)    │     │    Vision       │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                        ┌─────────────────────────────────────────┐
                        │  JSON Estructurado con datos del BL      │
                        │  (blNumber, shipper, consignee, etc.)    │
                        └─────────────────────────────────────────┘
```

#### Archivos Involucrados

| Archivo | Función |
|---------|---------|
| `emailInboundController.ts` | Controlador principal de extracción |
| `convertPdfToImage()` | Convierte PDF a PNG usando Puppeteer |
| `extractBlDataFromUrl()` | Envía imagen a OpenAI y parsea respuesta |
| `reExtractDraftData()` | Endpoint para re-extraer datos de un draft |

#### Función `convertPdfToImage()`

Convierte un PDF (data URL base64) a imagen PNG para enviar a GPT-4o Vision:

```typescript
const convertPdfToImage = async (pdfData: string | Buffer): Promise<string> => {
  // 1. Extraer buffer del data URL
  const pdfBuffer = Buffer.from(base64Data, 'base64');
  
  // 2. Guardar PDF temporalmente
  const tempPdfPath = path.join(os.tmpdir(), `bl_${Date.now()}.pdf`);
  fs.writeFileSync(tempPdfPath, pdfBuffer);
  
  // 3. Iniciar Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    // En producción usa Chromium bundled, en dev usa Chrome local
    executablePath: isProduction ? undefined : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // 4. Renderizar PDF y capturar screenshot
  const page = await browser.newPage();
  await page.setViewport({ width: 1700, height: 2200, deviceScaleFactor: 2 });
  await page.goto(`file://${tempPdfPath}`, { waitUntil: 'networkidle0' });
  
  // 5. Esperar renderizado y capturar
  await new Promise(r => setTimeout(r, 5000));
  const buffer = await page.screenshot({ type: 'png', fullPage: true });
  
  // 6. Retornar como data URL PNG
  return `data:image/png;base64,${buffer.toString('base64')}`;
};
```

#### Función `extractBlDataFromUrl()`

Envía la imagen a OpenAI GPT-4o Vision para extraer datos estructurados:

```typescript
const extractBlDataFromUrl = async (pdfUrl: string): Promise<any> => {
  // 1. Convertir PDF a imagen
  const imageUrl = await convertPdfToImage(pdfUrl);
  
  // 2. Prompt detallado para GPT-4o
  const prompt = `Eres un experto en Bills of Lading marítimos...
    EXTRAE Y DEVUELVE ESTE JSON:
    {
      "blNumber": "B/L No. exacto",
      "containerNumber": "Solo 11 caracteres",
      "shipper": "Datos del Shipper",
      "consignee": "Nombre + RFC del Consignee",
      "vesselName": "Nombre del buque",
      "voyageNumber": "Número de viaje",
      "portOfLoading": "Puerto de carga",
      "portOfDischarge": "Puerto de descarga",
      "packages": "número total de bultos",
      "weightKg": "peso bruto total en kg",
      "volumeCbm": "volumen total CBM",
      "carrier": "Línea naviera"
    }`;
  
  // 3. Llamar a OpenAI
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Experto en BLs marítimos. Responde solo JSON." },
      { role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
      ]}
    ],
    max_tokens: 4096,
    temperature: 0
  });
  
  // 4. Parsear y retornar JSON
  return JSON.parse(response.choices[0]?.message?.content || '{}');
};
```

#### Endpoint de Re-extracción

```
POST /api/admin/email/draft/:id/reextract
```

Re-extrae datos del BL y SUMMARY Excel para un draft existente:

```typescript
// Frontend (InboundEmailsPage.tsx)
const handleReExtract = async () => {
  const res = await fetch(`${API_URL}/api/admin/email/draft/${draftId}/reextract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  // data.draft.extracted_data contiene los nuevos datos
};
```

#### Datos Extraídos (extracted_data)

El JSON `extracted_data` guardado en `maritime_reception_drafts` contiene:

```typescript
interface ExtractedData {
  // Datos del BL (extraídos con IA)
  blNumber: string;           // "SGSIN23052790"
  containerNumber: string;    // "MSCU6238150"
  shipper: string;            // "TOP ASIA INT'L CO., LIMITED"
  consignee: string;          // "URBAN WOD CF, RFC: UWC220711HX0"
  vesselName: string;         // "SHUN FENG 31"
  voyageNumber: string;       // "260126000000"
  portOfLoading: string;      // "NANSHA NEW PORT, CHINA"
  portOfDischarge: string;    // "LAZARO CARDENAS, MEXICO"
  packages: number;           // 44
  weightKg: number;           // 19170
  volumeCbm: number;          // 44
  carrier: string;            // "WAN HAI"
  ladenOnBoard: string;       // "2026-01-15"
  
  // Datos del SUMMARY Excel (procesados)
  logs: LogEntry[];           // Array de LOGs del contenedor
  summary: {
    totalLogs: number;
    linkedToLegacy: number;   // Clientes vinculados
    pendingLink: number;      // Clientes por vincular
    byType: { generico: number; sensible: number; logotipo: number; }
  };
  
  // Metadatos
  route_code: string;         // "CHN-LZC-MXC"
  week_number: string;        // "Week 8-1"
  reference_code: string;     // "JSM26-0001"
}
```

#### Configuración de OpenAI

**Variable de entorno requerida:**
```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

**Inicialización lazy del cliente:**
```typescript
// emailInboundController.ts
let openaiInstance: OpenAI | null = null;
const getOpenAI = (): OpenAI => {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no configurada');
    }
    openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiInstance;
};
```

#### Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| Datos BL vacíos después de extraer | API Key inválida o con `=` al inicio | Verificar `OPENAI_API_KEY` en Railway |
| PDF no se convierte | Puppeteer no tiene Chromium | En producción usa bundled, verificar args |
| `OPENAI_API_KEY no configurada` | Variable no existe | Agregar en `.env` o Railway |
| Imagen muy pequeña | PDF no renderizó | Aumentar tiempo de espera (5s default) |
| OpenAI rechaza imagen | Contenido sensible detectado | Reintentar con `detail: "low"` |

#### Modales FCL y LCL

Dos tipos de carga con diferentes formatos de referencia:

| Tipo | Formato de Referencia | Ejemplo |
|------|----------------------|---------|
| **FCL** (Full Container Load) | `RUTA / AAA00-0000` | CHN-LZC-MXC / JSM25-0001 |
| **LCL** (Less than Container Load) | `RUTA / Week 0-0 / AAA00-0000` | CHN-LZC-MXC / Week 8-1 / JSM25-0001 |

### 🆕 Asignación Automática de Clientes FCL (v2.7.0)

Cuando se recibe un email FCL, el sistema extrae automáticamente el cliente del asunto del email.

#### Función `extractClientFromSubject()`

```typescript
// emailInboundController.ts
const extractClientFromSubject = async (subject: string): Promise<ClientInfo | null> => {
  // Patrones comunes: "FCL para S87", "FCL S87 - Cliente", "S87"
  const patterns = [
    /(?:FCL|contenedor)\s+(?:para\s+)?([A-Z]\d+)/i,  // FCL para S87
    /([A-Z]\d{2,5})\s*[-–]/i,                         // S87 -
    /\b([A-Z]\d{2,5})\b/i                             // Solo S87
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      const boxId = match[1].toUpperCase();
      
      // Buscar en legacy_clients
      const legacyResult = await pool.query(
        'SELECT id, box_id, full_name FROM legacy_clients WHERE UPPER(box_id) = $1',
        [boxId]
      );
      
      if (legacyResult.rows.length > 0) {
        const client = legacyResult.rows[0];
        return {
          clientCode: client.box_id,
          clientId: client.id,
          source: 'legacy_clients'
        };
      }
      
      // Buscar en users
      const userResult = await pool.query(
        'SELECT id, box_id, full_name FROM users WHERE UPPER(box_id) = $1',
        [boxId]
      );
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        return {
          clientCode: user.box_id,
          clientId: user.id,
          source: 'users'
        };
      }
    }
  }
  return null;
};
```

#### Flujo Automático

```
Email Entrante (Subject: "FCL S87 - Urban WOD")
         │
         ▼
extractClientFromSubject("FCL S87 - Urban WOD")
         │
         ▼
Busca "S87" en legacy_clients → { id: 123, box_id: "S87" }
         │
         ▼
INSERT INTO containers (... client_user_id, legacy_client_id ...)
         │
         ▼
Container creado con cliente asignado automáticamente
```

#### Columnas en `containers`
```sql
-- Cliente asignado al contenedor
client_user_id INTEGER REFERENCES users(id),
legacy_client_id INTEGER REFERENCES legacy_clients(id)
```

#### Campos de Modal FCL
```typescript
// Estado
const [fclRouteId, setFclRouteId] = useState<string>('');
const [fclSubject, setFclSubject] = useState<string>('');
const [fclFile, setFclFile] = useState<File | null>(null);

// Auto-generar referencia al seleccionar ruta
const handleFclRouteChange = (routeId: string) => {
  setFclRouteId(routeId);
  const selectedRoute = routes.find(r => r.id.toString() === routeId);
  if (selectedRoute) {
    setFclSubject(`${selectedRoute.code} / AAA00-0000`);
  }
};
```

#### Campos de Modal LCL
```typescript
// Estado
const [lclRouteId, setLclRouteId] = useState<string>('');
const [lclSubject, setLclSubject] = useState<string>('');
const [lclTelexFile, setLclTelexFile] = useState<File | null>(null);
const [lclDocumentFile, setLclDocumentFile] = useState<File | null>(null);

// Auto-generar referencia al seleccionar ruta
const handleLclRouteChange = (routeId: string) => {
  setLclRouteId(routeId);
  const selectedRoute = routes.find(r => r.id.toString() === routeId);
  if (selectedRoute) {
    setLclSubject(`${selectedRoute.code} / Week 0-0 / AAA00-0000`);
  }
};
```

#### Archivos del Modal LCL
| Campo | Label | Descripción |
|-------|-------|-------------|
| `lclTelexFile` | 📜 TELEX o ISF | Documento de liberación telex |
| `lclDocumentFile` | 📄 Documento | BL o documento adicional |

### Rutas Marítimas

Las rutas se cargan desde el endpoint `/api/admin/maritime/routes`:

```typescript
interface Route {
  id: number;
  code: string;        // Ej: "CHN-LZC-MXC"
  origin: string;      // Ej: "Shanghai"
  destination: string; // Ej: "Lázaro Cárdenas"
  is_active: boolean;
}

// Cargar rutas
useEffect(() => {
  fetch(`${API_URL}/api/admin/maritime/routes`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => setRoutes(data.routes || []));
}, []);
```

### Formato de Consolidación

| Componente | Formato | Ejemplo |
|------------|---------|---------|
| Ruta | 3 letras origen - 3 letras puerto - 3 letras destino | CHN-LZC-MXC |
| Week | Week Semana-Día | Week 8-1 |
| Referencia | 3 letras + 2 dígitos año - 4 dígitos secuencia | JSM25-0001 |

---

## 🛰️ Tradlinx Ocean Visibility - Tracking de Contenedores

### Descripción General

Sistema de tracking satelital de contenedores marítimos usando la API de **Tradlinx Ocean Visibility**. Reemplaza la integración anterior con Vizion API.

### Configuración

**Variables de entorno requeridas:**
```bash
# API Key de Tradlinx
TRADLINX_API_KEY=tu_api_key_de_tradlinx

# URL base de la API (opcional, default: https://api.tradlinx.com/v1)
TRADLINX_API_URL=https://api.tradlinx.com/v1

# Webhook URL donde Tradlinx enviará actualizaciones
TRADLINX_WEBHOOK_URL=https://tu-dominio.com/api/webhooks/tradlinx

# Client ID para identificar requests (opcional)
TRADLINX_CLIENT_ID=entregax

# Usar sandbox para pruebas (POC)
TRADLINX_USE_SANDBOX=true  # Para pruebas
TRADLINX_USE_SANDBOX=false # Para producción
```

### Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/webhooks/tradlinx` | Webhook para recibir actualizaciones de Tradlinx |
| POST | `/api/admin/tradlinx/subscribe` | Suscribir contenedor a tracking |
| POST | `/api/admin/vizion/subscribe` | Alias de compatibilidad |
| GET | `/api/admin/containers/:id/tracking` | Historial de tracking |
| POST | `/api/admin/containers/:id/tracking/manual` | Agregar evento manual |
| POST | `/api/admin/containers/:id/tracking/sync-carrier` | Sincronizar con naviera |

### Parámetros de Suscripción

Al crear un nuevo Folio de Operación, enviar a Tradlinx:

```typescript
// POST /api/admin/tradlinx/subscribe
{
  "containerId": 123,                    // ID interno del contenedor
  "containerNumber": "WHSU8015030",      // Número del contenedor
  "blNumber": "024F619991",              // Master BL Number
  "carrierCode": "WHLC"                  // Código SCAC de la naviera
}
```

### Códigos SCAC de Navieras

| Naviera | Código SCAC |
|---------|-------------|
| Wan Hai | WHLC |
| Maersk | MAEU |
| MSC | MSCU |
| COSCO | COSU |
| Evergreen | EGLV |
| CMA CGM | CMDU |
| Hapag-Lloyd | HLCU |
| ONE | ONEY |
| Yang Ming | YMLU |
| HMM | HDMU |
| ZIM | ZIMU |
| PIL | PCIU |

### Eventos de Tradlinx (Mapeo)

| Código | Evento | Estado Interno | Acción Automática |
|--------|--------|----------------|-------------------|
| `ETA_UPDATE` | ETA Predictiva | eta_updated | Actualiza campo eta |
| `LOADED` / `LF` | Cargado | loaded | - |
| `GATE_IN` / `GI` | Gate In | gate_in | - |
| `VESSEL_DEPARTURE` / `VD` | Zarpe | in_transit | - |
| `VESSEL_ARRIVAL` / `VA` | Arribo | arrived_port | - |
| `DISCHARGE` / `DS` | Descarga | discharged | - |
| `CUSTOMS_RELEASED` / `CR` | Liberado Aduana | customs_cleared | - |
| `GATE_OUT` / `GO` | **Gate Out** | gate_out | **Inicia Rastreo Foráneo** |
| `DELIVERED` / `DV` | Entregado | delivered | - |
| `EMPTY_RETURN` / `ER` | **Retorno Vacío** | empty_return | **Cierra Logística Inversa** |

### Acciones Automáticas

#### 🚛 Gate-Out → Inicia Rastreo Foráneo
Cuando el contenedor sale del puerto (Gate-Out), el sistema:
1. Marca `foreign_tracking_started = true`
2. Registra `foreign_tracking_start_date`
3. Cambia estado a `in_transit_foreign`
4. Crea registro en `foreign_tracking_logs`

#### ↩️ Empty Return → Cierra Logística Inversa
Cuando el contenedor vacío se devuelve a la naviera:
1. Marca `reverse_logistics_closed = true`
2. Registra `reverse_logistics_close_date`
3. Registra `empty_return_date`
4. Cambia estado a `completed`
5. Cierra el `maritime_shipment` asociado

### Webhook Handler

```typescript
// POST /api/webhooks/tradlinx
// Tradlinx envía actualizaciones automáticamente

// Payload de ejemplo:
{
  "container_number": "WHSU8015030",
  "master_bl_number": "024F619991",
  "event_type": "GATE_OUT",
  "event_timestamp": "2026-03-02T14:30:00Z",
  "location": "Lázaro Cárdenas, MX",
  "vessel_name": "SHUN FENG 31",
  "voyage_number": "260126000000",
  "predicted_eta": "2026-03-05T08:00:00Z",
  "carrier_code": "WHLC"
}
```

### Entorno Sandbox (POC)

Para pruebas, usar el entorno sandbox de Tradlinx:

```bash
TRADLINX_USE_SANDBOX=true
```

Esto enviará las peticiones a `https://sandbox.api.tradlinx.com/v1` en lugar de producción.

### Archivos Involucrados

| Archivo | Descripción |
|---------|-------------|
| `vizionController.ts` | Controlador principal (renombrado internamente a Tradlinx) |
| `CostingPanelMaritimo.tsx` | UI del tracking en panel de costeo |
| `container_tracking_logs` | Tabla de logs de tracking |
| `containers.tradlinx_reference_id` | Reference ID de la suscripción |

### 🆕 Panel de Costeo Marítimo - Mejoras UX (v2.7.0)

#### Autocomplete para Selección de Cliente

El selector de cliente en contenedores FCL ahora usa **Autocomplete** con búsqueda flexible:

```tsx
// CostingPanelMaritimo.tsx
<Autocomplete
  options={legacyClients}
  getOptionLabel={(option) => option.box_id || ''}
  isOptionEqualToValue={(opt, val) => opt.id === val?.id}
  filterOptions={(options, { inputValue }) => {
    const search = inputValue.toLowerCase();
    return options.filter(opt =>
      (opt.box_id || '').toLowerCase().includes(search) ||
      (opt.full_name || '').toLowerCase().includes(search)
    );
  }}
  renderInput={(params) => (
    <TextField {...params} label="Cliente" size="small" />
  )}
  onChange={(e, val) => handleClientChange(row.id, val?.id)}
/>
```

#### Características del Autocomplete:
- **Búsqueda por box_id**: Escribir "S87" encuentra al cliente
- **Búsqueda por nombre**: Escribir "Urban" encuentra "Urban WOD"
- **Visualización limpia**: Solo muestra el box_id (ej: "S87"), no el nombre completo
- **filterOptions personalizado**: Búsqueda en ambos campos simultáneamente

#### Corrección de Conteo de Paquetes

El panel ahora muestra `total_packages` en lugar de `shipment_count`:

```typescript
// fetchContainers response mapping
const containersWithPackageCount = containers.map(c => ({
  ...c,
  total_packages: c.total_packages || 0  // Antes usaba shipment_count
}));
```

#### fetchLegacyClients Corregido

```typescript
// CostingPanelMaritimo.tsx - fetchLegacyClients
const res = await api.get('/api/legacy/clients');
setLegacyClients(res.data.clients);  // ✅ Correcto: accede a .clients
// setLegacyClients(res.data);       // ❌ Incorrecto: causa "map is not a function"
```

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

### v2.10.0 (5 Mar 2026) - GEX AUTO-GUARDADO Y SALDO PENDIENTE ⭐

#### Garantía Extendida GEX - Guardado Automático de Costos
- ✅ **warrantyController.ts** - Al contratar GEX para paquetes PO Box USA, ahora se guardan automáticamente:
  - `declared_value` - Valor declarado en USD
  - `gex_insurance_cost` - Prima del seguro (5% del valor asegurado)
  - `gex_fixed_cost` - Costo fijo de póliza ($625 MXN)
  - `gex_total_cost` - Total del GEX (prima + fijo)
  - `saldo_pendiente` - Actualizado con: Servicio PO Box + GEX Total
- ✅ **Cálculo automático** - El nuevo saldo_pendiente se calcula al momento de contratar
- ✅ **Logs mejorados** - Console log detallado con costos y nuevo saldo

#### Mobile App - SALDO PENDIENTE Correcto
- ✅ **PackageDetailScreen.tsx** - SALDO PENDIENTE ahora usa `details.saldo_pendiente` directamente de BD
- ✅ **Eliminada recalculación** - Ya no se recalcula en frontend, se confía en el valor guardado
- ✅ **Fórmula correcta**: `SALDO = Servicio PO Box + Subtotal GEX`

#### Mobile App - Mejoras UI GEX
- ✅ **Título simplificado** - Removido "(Todos los paquetes)" del título "Garantía Extendida GEX"
- ✅ **REPACK** - Muestra "1 caja" en lugar del total de cajas originales
- ✅ **Consistencia** - Texto limpio sin redundancias

#### Flujo de Contratación GEX Corregido
```
┌─────────────────────┐
│  GEXContractScreen  │  Usuario ingresa valor declarado
│  + Firma digital    │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│  POST /api/gex/     │  
│  warranties/self    │  Backend procesa contratación
└──────────┬──────────┘
           ▼
┌─────────────────────────────────────────────────────────┐
│  warrantyController.ts - createWarrantyByUser()        │
│                                                         │
│  1. Validar datos de entrada                           │
│  2. Obtener TC actual y tarifas GEX                    │
│  3. Calcular:                                          │
│     - insuredValueMxn = invoiceValueUSD × TC           │
│     - variableFee = insuredValueMxn × 0.05 (5%)        │
│     - fixedFee = $625 MXN                              │
│     - totalCost = variableFee + fixedFee               │
│  4. Crear póliza en tabla `warranties`                 │
│  5. ⭐ NUEVO: Actualizar tabla `packages`:              │
│     - declared_value = invoiceValueUSD                 │
│     - gex_insurance_cost = variableFee                 │
│     - gex_fixed_cost = fixedFee                        │
│     - gex_total_cost = totalCost                       │
│     - saldo_pendiente = assigned_cost_mxn + totalCost  │
└─────────────────────────────────────────────────────────┘
           ▼
┌─────────────────────┐
│  PackageDetailScreen│  Muestra saldo_pendiente de BD
│  $X,XXX.XX MXN      │  (ya incluye PO Box + GEX)
└─────────────────────┘
```

#### Campos GEX en Tabla `packages`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `has_gex` | BOOLEAN | Si tiene GEX contratado |
| `gex_folio` | VARCHAR | Folio de la póliza (GEX-2026-XXXXX) |
| `declared_value` | NUMERIC(10,2) | Valor declarado en USD |
| `gex_insurance_cost` | NUMERIC(10,2) | Prima del seguro (5%) en MXN |
| `gex_fixed_cost` | NUMERIC(10,2) | Costo fijo póliza ($625 MXN) |
| `gex_total_cost` | NUMERIC(10,2) | Total GEX en MXN |
| `saldo_pendiente` | NUMERIC(10,2) | Saldo total a cobrar (PO Box + GEX) |

#### Ejemplo de Cálculo GEX
```
Valor declarado: $123.00 USD
TC: 18.20

Valor asegurado MXN = $123 × 18.20 = $2,238.60 MXN
Prima 5% = $2,238.60 × 0.05 = $111.93 MXN
Costo fijo = $625.00 MXN
Total GEX = $111.93 + $625.00 = $736.93 MXN

Servicio PO Box = $2,116.53 MXN
SALDO PENDIENTE = $2,116.53 + $736.93 = $2,853.46 MXN
```

#### Archivos Modificados
```
entregax-backend-api/
├── src/warrantyController.ts     # createWarrantyByUser() guarda costos GEX

entregax-mobile-app/
├── src/screens/PackageDetailScreen.tsx  # Usa saldo_pendiente de BD
│   - Eliminada recalculación de saldo
│   - Removido "(Todos los paquetes)" de título GEX
│   - REPACK muestra "1 caja"

DEVELOPER_MANUAL.md               # Esta actualización
```

---

### v2.9.0 (4 Mar 2026) - COSTEO PO BOX USA CON TC GUARDADO ⭐

#### Costeo PO Box USA - Precio Congelado al Registro
- ✅ **Fórmula de costeo** - Implementada correctamente:
  1. cm → pulgadas (÷ 2.54)
  2. Volumen (pulg³) = L × A × H
  3. Pie³ = Volumen ÷ 10780
  4. USD = Pie³ × $75.00
  5. MXN = USD × TC API
  6. Mínimo $50 MXN
- ✅ **TC guardado** - El tipo de cambio se congela al momento del registro
- ✅ **Nuevas columnas en `packages`**:
  - `registered_exchange_rate` NUMERIC(10,4) - TC usado al registro
  - `pobox_cost_usd` NUMERIC(10,2) - Costo en USD
- ✅ **packageController.ts** - `calculatePOBoxCost()` ahora retorna TC y costo USD
- ✅ **poboxRatesController.ts** - Endpoints actualizados para incluir TC guardado

#### Panel de Costeo PO Box
- ✅ **POBoxCostingPage.tsx** - Nueva columna "TC" en tabla de paquetes
- ✅ **Costo guardado** - Se muestra el costo calculado al momento del registro
- ✅ **Retrocompatibilidad** - Paquetes antiguos sin TC guardado usan TC actual

#### Validación de Paquetería en Wizard
- ✅ **ShipmentsPage.tsx** - Validación de paquetería obligatoria antes de avanzar
- ✅ **selectedRate** - Ahora se valida siempre, no solo en modo manual

#### Archivos Modificados
```
entregax-backend-api/
├── src/packageController.ts      # calculatePOBoxCost() con TC guardado
├── src/poboxRatesController.ts   # Endpoints con registered_exchange_rate
entregax-web-admin/
├── src/pages/POBoxCostingPage.tsx # Columna TC y costo guardado
├── src/pages/ShipmentsPage.tsx    # Validación de paquetería
DEVELOPER_MANUAL.md               # Sección Costeo PO Box USA
```

---

### v2.7.0 (3 Mar 2026) - MOBILE APP SUITE & FCL CONTAINER IMPROVEMENTS ⭐

#### Mobile App - Cambio de Terminología "Casillero" → "Suite"
- ✅ **Rebrand completo** - Toda la app ahora usa "Suite" en lugar de "Casillero"
- ✅ **es.json** - Actualizadas traducciones: "Mi Suite", "Número de Suite", etc.
- ✅ **LoginScreen.tsx** - Labels actualizados a Suite
- ✅ **HomeScreen.tsx** - Header muestra "🏠 Suite: {boxId}"
- ✅ **RegisterScreen.tsx** - Nuevo campo de Suite en registro
- ✅ **MyProfileScreen.tsx** - Perfil muestra Suite con icono 🏠

#### Mobile App - Conectividad API Corregida
- ✅ **api.ts** - IP actualizada de `192.168.1.114` a `192.168.1.107:3001`
- ✅ **ExistingClientScreen.tsx** - Prefijo `/api` agregado a todos los endpoints
  - `/api/legacy/verify/` - Verificar casillero existente
  - `/api/legacy/verify-name` - Verificar nombre
  - `/api/legacy/claim` - Reclamar cuenta (cambio `password` → `newPassword`)
- ✅ **MyProfileScreen.tsx** - Prefijo `/api` agregado:
  - `/api/auth/change-password`
  - `/api/auth/2fa/enable`
  - `/api/auth/2fa/disable`
  - `/api/auth/update-profile`

#### Mobile App - RFC Persistencia
- ✅ **authController.ts** - Login response ahora incluye `rfc: user.rfc || null`
- ✅ **getProfile query** - Ahora incluye `phone, rfc` en SELECT

#### FCL Container - Asignación Automática de Cliente
- ✅ **extractClientFromSubject()** - Nueva función que extrae cliente del asunto del email
- ✅ **Formato soportado** - Detecta patrones como "FCL para S87" o "FCL S87 - Cliente"
- ✅ **emailInboundController.ts** - FCL draft ahora incluye `clientInfo.clientCode` y `clientInfo.clientId`
- ✅ **INSERT containers** - Ahora incluye `client_user_id` y `legacy_client_id` automáticamente

#### FCL Container Panel - UX Improvements
- ✅ **CostingPanelMaritimo.tsx** - Autocomplete para selección de cliente (reemplaza Select)
- ✅ **filterOptions personalizado** - Búsqueda flexible que encuentra por S87, nombre o ambos
- ✅ **Visualización simplificada** - Solo muestra box_id (ej: "S87") sin nombre
- ✅ **Package count fix** - Ahora muestra `total_packages` en lugar de `shipment_count`
- ✅ **fetchLegacyClients** - Corregido para usar `res.data.clients` en lugar de `res.data`

#### Script de Corrección de Referencias
- ✅ **fix_reference.js** - Script para corregir referencias en containers y maritime_orders
- ✅ **Ejemplo** - Cambió "0013" → "JSM26-0013" en todas las tablas relacionadas

#### Archivos Modificados
```
entregax-mobile-app/
├── src/services/api.ts           # IP actualizada
├── src/i18n/locales/es.json      # Casillero → Suite
├── src/screens/
│   ├── LoginScreen.tsx           # Suite terminology
│   ├── HomeScreen.tsx            # Suite header
│   ├── RegisterScreen.tsx        # Suite fields
│   ├── ExistingClientScreen.tsx  # /api prefix + newPassword
│   ├── MyProfileScreen.tsx       # /api prefix + RFC + Suite
│   └── ChangePasswordScreen.tsx  # Suite terminology

entregax-backend-api/
├── src/authController.ts         # RFC in login + getProfile
├── src/emailInboundController.ts # extractClientFromSubject()
└── fix_reference.js              # Script de corrección

entregax-web-admin/
└── src/pages/CostingPanelMaritimo.tsx  # Autocomplete + package count
```

#### Configuración Local de Desarrollo
```bash
# IP del servidor backend local
API_URL=http://192.168.1.107:3001

# Para obtener tu IP local:
ifconfig en0 | grep 'inet ' | awk '{print $2}'
```

---

### v2.6.0 (2 Mar 2026) - TRADLINX OCEAN VISIBILITY ⭐

#### Reemplazo de Vizion API por Tradlinx
- ✅ **Tradlinx Integration** - Nueva API de tracking satelital de contenedores
- ✅ **subscribeToTradlinx()** - Función para suscribir contenedores al tracking
- ✅ **handleTradlinxWebhook()** - Handler para webhooks de Tradlinx
- ✅ **Sandbox Support** - Soporte para entorno de pruebas (POC)
- ✅ **Acciones Automáticas** - Gate-Out inicia rastreo foráneo, Empty Return cierra logística inversa

#### Variables de Entorno Nuevas
```bash
TRADLINX_API_KEY=tu_api_key
TRADLINX_API_URL=https://api.tradlinx.com/v1
TRADLINX_WEBHOOK_URL=https://tu-dominio.com/api/webhooks/tradlinx
TRADLINX_CLIENT_ID=entregax
TRADLINX_USE_SANDBOX=true|false
```

#### Endpoints Tradlinx
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/webhooks/tradlinx` | Webhook de actualizaciones |
| POST | `/api/admin/tradlinx/subscribe` | Suscribir contenedor |
| POST | `/api/admin/vizion/subscribe` | Alias compatibilidad |

#### Eventos con Acciones Automáticas
| Evento | Acción |
|--------|--------|
| `GATE_OUT` / `GO` | Inicia tracking foráneo (`foreign_tracking_started`) |
| `EMPTY_RETURN` / `ER` | Cierra logística inversa (`reverse_logistics_closed`) |

#### Archivos Modificados
- `vizionController.ts` - Reescrito para usar Tradlinx
- `index.ts` - Nuevas rutas `/api/webhooks/tradlinx` y `/api/admin/tradlinx/subscribe`
- `CostingPanelMaritimo.tsx` - UI actualizada con branding Tradlinx

---

### v2.5.0 (2 Mar 2026) - DHL COSTING & CHINA API SM2 ⭐

#### DHL Monterrey - Sistema de Costeo
- ✅ **dhl_cost_rates** - Nueva tabla para tarifas de costo interno (Standard/High Value)
- ✅ **DhlCostingPage.tsx** - Página de costeo con tabs: Tarifas de Costo + Lista de Cajas
- ✅ **getDhlCostRates** - Endpoint GET `/api/admin/dhl/cost-rates`
- ✅ **updateDhlCostRate** - Endpoint PUT `/api/admin/dhl/cost-rates/:id`
- ✅ **getDhlCosting** - Endpoint GET `/api/admin/dhl/costing` con filtros y estadísticas
- ✅ **assignDhlCost** - Endpoint POST `/api/admin/dhl/costing/assign` para asignar costos
- ✅ **autoAssignDhlCosts** - Endpoint POST `/api/admin/dhl/costing/auto-assign` auto-asignación
- ✅ **Módulo costing** - Agregado a mx_cedis en AdminHubPage

#### Endpoints DHL Costeo
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/dhl/cost-rates` | Obtener tarifas de costo |
| PUT | `/api/admin/dhl/cost-rates/:id` | Actualizar tarifa de costo |
| GET | `/api/admin/dhl/costing` | Lista de cajas con costeo |
| POST | `/api/admin/dhl/costing/assign` | Asignar costo a envíos |
| POST | `/api/admin/dhl/costing/auto-assign` | Auto-asignar costos |

#### Tabla dhl_cost_rates
```sql
CREATE TABLE dhl_cost_rates (
    id SERIAL PRIMARY KEY,
    rate_type VARCHAR(50) UNIQUE,   -- 'standard', 'high_value'
    rate_name VARCHAR(100),
    cost_usd DECIMAL(10,2),         -- Lo que nos cuesta
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP
);
```

#### Columnas en dhl_shipments
```sql
ALTER TABLE dhl_shipments ADD COLUMN assigned_cost_usd DECIMAL(10,2);
ALTER TABLE dhl_shipments ADD COLUMN cost_rate_type VARCHAR(50);
ALTER TABLE dhl_shipments ADD COLUMN cost_assigned_at TIMESTAMP;
ALTER TABLE dhl_shipments ADD COLUMN cost_assigned_by INTEGER REFERENCES users(id);
```

#### China API - SM2 Encryption
- ✅ **sm-crypto** - Biblioteca para encriptación SM2 (estándar chino)
- ✅ **loginWithH5Api()** - Login con credenciales h5api y encriptación SM2
- ✅ **loginWithOrderSystem()** - Fallback a sistema orderSystem
- ✅ **encryptWithSM2()** - Función de encriptación para API MJCustomer
- ✅ **text/plain middleware** - Soporte para callbacks con Content-Type text/plain
- ✅ **china_callback_logs** - Tabla de logging para callbacks recibidos

#### Credenciales MJCustomer API (h5api)
```typescript
const MJCUSTOMER_API = {
  BASE_URL: 'https://www.mjcustomer.com',
  ACCOUNT: 'h5api',
  PASSWORD: 'H_5@nLP.',
  SM2_PUBLIC_KEY: '046BB47A0777ADAD614BEF4F234BBE275C4FBB4BB45A9EDCAB5602EEE9588B52AEFB5CD7A29396DA46526E1C4F72650166F5FB41515B83C192AE37134470EB951D'
};
```

#### POBox USA - Tab por defecto
- ✅ **POBoxCostingPage.tsx** - Tab por defecto cambiado de "Calculadora" (0) a "Paquetes" (1)

---

### v2.4.0 (27 Feb 2026) - AWS S3 & PERMISOS MARÍTIMOS ⭐

#### AWS S3 - Almacenamiento de Archivos
- ✅ **s3Service.ts** - Servicio completo para upload/download de archivos a S3
- ✅ **uploadToS3()** - Sube archivos a S3 y retorna URL pública
- ✅ **isS3Configured()** - Verifica si las credenciales AWS están configuradas
- ✅ **Migración base64→S3** - Endpoint `/api/admin/migrate-base64-to-s3` migra archivos antiguos
- ✅ **Migración costos→S3** - Endpoint `/api/admin/migrate-costs-to-s3` migra PDFs de costos
- ✅ **S3 status** - Endpoint `/api/admin/s3-status` verifica configuración de S3

#### Variables de Entorno AWS (Railway)
```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=entregax-uploads
```

#### Endpoints de Upload con S3
| Endpoint | Descripción | Almacenamiento |
|----------|-------------|----------------|
| `/api/admin/maritime/upload-manual` | Upload FCL/LCL | S3 → `maritime/fcl/` o `maritime/lcl/` |
| `/api/maritime/containers/upload-cost-pdf` | PDFs de costos | S3 → `costs/` |
| `/api/anticipos/bolsas` | Comprobantes anticipos | S3 → `anticipos/` |

#### Jerarquía de Roles Actualizada
```typescript
const ROLE_HIERARCHY = {
    'super_admin': 100,    // Acceso total
    'admin': 95,           // Administrador general
    'director': 90,        // Director de área
    'branch_manager': 80,  // Gerente de sucursal
    'customer_service': 70,// Servicio a cliente
    'operaciones': 65,     // ⭐ NUEVO - Operaciones marítimas
    'counter_staff': 60,   // Personal de mostrador
    'warehouse_ops': 40,   // Operaciones de bodega
    'repartidor': 35,      // Repartidor
    'client': 10           // Cliente final
};
```

#### Permisos de Upload Marítimo
- ✅ **warehouse_ops (40)** - Puede subir documentos FCL/LCL
- ✅ **operaciones (65)** - Nuevo rol para operaciones marítimas
- ✅ **Endpoint permisivo** - `requireMinLevel(ROLES.WAREHOUSE_OPS)`

#### Indicador de Progreso de Upload
- ✅ **uploadProgress state** - Estado con step, totalSteps, currentFile, status, message
- ✅ **LinearProgress** - Barra de progreso visual en diálogos FCL/LCL
- ✅ **4 pasos** - BL → TELEX → Packing/Summary → Procesando IA
- ✅ **Estados visuales** - idle, uploading, processing, done, error

#### Limpieza de Base de Datos
- ✅ **cleanup-db-space** - POST `/api/admin/cleanup-db-space` limpia datos grandes
- ✅ **emergency-cleanup** - DELETE `/api/admin/emergency-cleanup` para DB llena
- ✅ **VACUUM automático** - Se ejecuta después de migraciones

### v2.3.2 (26 Feb 2026) - DOCUMENTACIÓN PO BOX USA ⭐

#### Flujo PO Box USA - Entrada/Salida
- ✅ **Documentación completa** - Flujo de entrada (ShipmentsPage) y salida (ConsolidationsPage)
- ✅ **Modal Entrada/Salida** - Diagrama del modal que diferencia recepción vs despacho
- ✅ **Asignación service_type** - Documentado cómo `usa_pobox` → `POBOX_USA`
- ✅ **Mapeo warehouseLocation** - Flujo completo desde frontend hasta base de datos

#### Página de Consolidaciones
- ✅ **ConsolidationsPage.tsx** - Control de Salidas documentado
- ✅ **Estados de consolidación** - `requested`, `processing`, `in_transit`, `shipped`
- ✅ **Endpoints API** - GET/PUT consolidaciones documentados
- ✅ **Flujo de despacho** - Proceso completo desde solicitud hasta notificación
- ✅ **Modal de confirmación** - Documentado con campo opcional de guía master

### v2.3.1 (26 Feb 2026) - EXTRACCIÓN IA BL MARÍTIMO ⭐

#### Extracción de Datos con OpenAI GPT-4o Vision
- ✅ **extractBlDataFromUrl()** - Extrae datos de BL usando GPT-4o Vision
- ✅ **convertPdfToImage()** - Convierte PDF a PNG con Puppeteer para análisis
- ✅ **Endpoint reextract** - POST `/api/admin/email/draft/:id/reextract`
- ✅ **Datos extraídos** - blNumber, containerNumber, shipper, consignee, packages, weight, volume
- ✅ **Soporte multi-detalle** - Intenta con `detail: "high"`, fallback a `"low"`
- ✅ **Lazy initialization** - Cliente OpenAI se inicializa solo cuando se necesita
- ✅ **Puppeteer producción** - Usa Chromium bundled en Railway, Chrome local en dev

#### Fixes
- ✅ **Fix OPENAI_API_KEY** - Documentado problema de `=` al inicio de la key
- ✅ **Fix preservación de logs** - Re-extracción BL preserva logs existentes del SUMMARY
- ✅ **Fix Frontend binding** - `initEditableData()` mapea correctamente extracted_data a editableBL

### v2.3.0 (26 Feb 2026) - PERMISOS GRANULARES & MARÍTIMO UI ⭐

#### Sistema de Permisos
- ✅ **Permisos de Panel** - Tabla `user_panel_permissions` para acceso a paneles
- ✅ **Permisos de Módulos** - Tabla `user_module_permissions` para módulos dentro de paneles
- ✅ **Endpoint `/api/panels/me`** - Obtener permisos de panel del usuario actual
- ✅ **Endpoint `/api/modules/:panelKey/me`** - Obtener permisos de módulos del usuario
- ✅ **Fix CustomerServiceHubPage** - Corregido endpoint de `/api/admin/panels/me` a `/api/panels/me`
- ✅ **Fix respuesta API** - Cambiado `data.permissions` a `data.panels` en frontend

#### Panel TDI Aéreo - Costeo
- ✅ **Fix masterCostController.ts** - Corregido error de columna `shipping_cost` → `assigned_cost_mxn`
- ✅ **getMasterAwbStats** - Query corregido para usar columna correcta
- ✅ **getProfitReport** - Query corregido para reportes de ganancia

#### Marítimo China - Modal FCL/LCL
- ✅ **TELEX o ISF Label** - Agregada etiqueta al campo de segundo archivo en LCL
- ✅ **Selector de Ruta LCL** - Auto-genera referencia al seleccionar ruta
- ✅ **Formato LCL** - `RUTA / Week 0-0 / AAA00-0000` (ej: CHN-LZC-MXC / Week 8-1 / JSM25-0001)
- ✅ **Selector de Ruta FCL** - Agregado igual que LCL para consistencia
- ✅ **Formato FCL** - `RUTA / AAA00-0000` (ej: CHN-LZC-MXC / JSM25-0001) - Sin Week
- ✅ **Estado fclRouteId** - Variable para manejar ruta seleccionada en FCL
- ✅ **Reset en cancel/success** - Limpia fclRouteId al cerrar modales

#### Base de Datos - Esquema de Permisos
```sql
-- Permisos de Panel
CREATE TABLE user_panel_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  panel_key VARCHAR(50) NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  granted_by INTEGER REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, panel_key)
);

-- Permisos de Módulos
CREATE TABLE user_module_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  panel_key VARCHAR(50) NOT NULL,
  module_key VARCHAR(50) NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  granted_by INTEGER REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, panel_key, module_key)
);

-- Paneles Disponibles
SELECT * FROM admin_panels WHERE is_active = true;
-- Incluye: admin_china_sea, admin_china_air, admin_usa_pobox, admin_mx_cedis,
--          admin_mx_national, cs_leads, cs_clients, cs_support, ops_*, etc.

-- Módulos por Panel (ejemplo admin_china_sea)
SELECT * FROM admin_panel_modules WHERE panel_key = 'admin_china_sea';
-- Incluye: consolidations, inbound_emails, maritime_api, anticipos, reports,
--          costing, inventory, pricing, invoicing, instructions, routes
```

#### Endpoints de Permisos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/panels/me` | Mis permisos de panel |
| GET | `/api/modules/:panelKey/me` | Mis permisos de módulos |
| GET | `/api/admin/panels` | Lista todos los paneles (super_admin) |
| GET | `/api/admin/panels/user/:userId` | Permisos de un usuario específico |
| PUT | `/api/admin/panels/user/:userId` | Actualizar permisos de panel |
| GET | `/api/admin/panels/:panelKey/modules` | Módulos de un panel |
| PUT | `/api/admin/panels/:panelKey/user/:userId/modules` | Actualizar permisos de módulos |

---

## 🤖 Integración con OpenAI

EntregaX utiliza **OpenAI GPT-4o** para múltiples funcionalidades de IA en el sistema.

### Configuración

**Variable de entorno requerida:**
```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

### Módulos que usan OpenAI

| Módulo | Archivo | Modelo | Propósito |
|--------|---------|--------|----------|
| **Verificación KYC** | `verificationController.ts` | GPT-4o Vision | Comparación facial selfie vs INE |
| **Extracción BL** | `emailInboundController.ts` | GPT-4o Vision | Extraer datos de Bills of Lading PDF |
| **Extracción LOG/BL** | `maritimeAiController.ts` | GPT-4o Vision | OCR de documentos marítimos (LCL/FCL) |
| **Soporte Chat** | `supportController.ts` | GPT-4o-mini | Agente de soporte automático |
| **Facebook Messenger** | `facebookController.ts` | GPT-4o | Bot de ventas para prospectos |
| **Consolidaciones** | `maritimeController.ts` | GPT-4o | Análisis de documentos |

### 1. Verificación KYC (verificationController.ts)

Compara la selfie del usuario con su identificación oficial para verificar identidad.

```typescript
// Comparación facial con GPT-4 Vision
async function compareFacesWithAI(selfieBase64: string, ineBase64: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Eres un experto en verificación de identidad.
          Tu trabajo es comparar dos imágenes:
          1. Una selfie de una persona
          2. Una foto de identificación oficial (INE)
          
          Responde SOLO con JSON:
          { "match": true/false, "confidence": "high/medium/low", "reason": "..." }`
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Compara estas dos imágenes..." },
          { type: "image_url", image_url: { url: selfieBase64, detail: "high" } },
          { type: "image_url", image_url: { url: ineBase64, detail: "high" } }
        ]
      }
    ],
    max_tokens: 300
  });
  
  return JSON.parse(response.choices[0]?.message?.content);
}
```

**Resultado:**
```json
{
  "match": true,
  "confidence": "high",
  "reason": "Los rasgos faciales coinciden. Misma estructura ósea, ojos y nariz."
}
```

### 2. Extracción de Documentos Marítimos (maritimeAiController.ts)

#### Extraer datos de LOG (LCL - Carga Suelta)
```typescript
export const extractLogDataLcl = async (req, res) => {
  const prompt = `Analiza este documento de recepción marítima (LOG de Sanky).
    Extrae en JSON: logNumber, boxCount, weightKg, volumeCbm, clientCodeRaw, brandType...`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Experto en logística marítima." },
      { role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: fileUrl } }
      ]}
    ],
    response_format: { type: "json_object" }
  });
};
```

#### Extraer datos de BL (FCL - Contenedor Completo)
```typescript
export const extractBlDataFcl = async (req, res) => {
  const prompt = `Analiza este Bill of Lading (BL).
    Extrae: blNumber, containerNumber, eta, pol, pod, weightKg, volumeCbm, consignee...`;
  // Similar al anterior con GPT-4o Vision
};
```

### 3. Soporte Chat con IA (supportController.ts)

Agente de soporte automático que responde como un humano experto en logística.

```typescript
const SYSTEM_PROMPT = `
ACTÚA COMO: Javier, un experto en logística Senior de EntregaX con 8 años de experiencia.

🔴 REGLAS DE ORO:
1. NUNCA digas que eres una IA o bot
2. Habla en primera persona ("Yo reviso", "Te ayudo")
3. Sé breve y casual, como WhatsApp
4. Si el cliente está muy enojado, incluye "[ESCALAR]" para transferir a humano

📦 CONOCIMIENTO:
- Aéreo China → México: 7-12 días hábiles
- Marítimo China → México: 35-45 días
- Aéreo USA → México: 5-8 días hábiles
`;

async function getAIResponse(userMessage: string, chatHistory: any[]) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // Más económico
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistory.slice(-6),
        { role: 'user', content: userMessage }
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });
  
  const aiText = data.choices[0]?.message?.content;
  const shouldEscalate = aiText.includes('[ESCALAR]');
  
  return { response: aiText, shouldEscalate };
}
```

### 4. Bot de Facebook Messenger (facebookController.ts)

Bot de ventas que responde automáticamente a prospectos que contactan por Messenger.

```typescript
const SALES_PROMPT = `
Eres un asesor comercial de EntregaX. Tu objetivo es:
1. Calificar al prospecto (¿qué importa? ¿volumen?)
2. Generar interés en nuestros servicios
3. Obtener datos de contacto (WhatsApp)
4. Agendar llamada/cita si hay interés

Si necesitas ayuda humana, incluye [HUMANO_REQUERIDO]
`;

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: SALES_PROMPT },
    ...conversationHistory
  ],
  max_tokens: 300,
  temperature: 0.7
});
```

### Inicialización Lazy del Cliente

Todos los controladores usan inicialización lazy para evitar errores si no hay API key:

```typescript
import OpenAI from 'openai';

let openaiInstance: OpenAI | null = null;

const getOpenAI = (): OpenAI => {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no configurada');
    }
    openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiInstance;
};

// Uso con Proxy para compatibilidad
const openai = new Proxy({} as OpenAI, {
  get(_, prop) {
    return getOpenAI()[prop as keyof OpenAI];
  }
});
```

### Modelos Utilizados

| Modelo | Costo | Uso en EntregaX |
|--------|-------|----------------|
| `gpt-4o` | Alto | Verificación KYC, extracción BL, bot Facebook |
| `gpt-4o-mini` | Bajo | Chat de soporte (alto volumen) |

### Endpoints que usan OpenAI

```http
# Verificación KYC
POST /api/verification/submit
→ Compara selfie vs INE con GPT-4o Vision

# Extracción LOG marítimo
POST /api/admin/maritime/ai/extract-log
→ OCR de documento LOG de Sanky

# Extracción BL marítimo  
POST /api/admin/maritime/ai/extract-bl
→ OCR de Bill of Lading

# Re-extraer datos de draft
POST /api/admin/email/draft/:id/reextract
→ Re-procesa PDF con GPT-4o Vision

# Chat de soporte
POST /api/support/message
→ Respuesta automática con GPT-4o-mini

# Webhook Facebook (interno)
POST /api/facebook/webhook
→ Bot de ventas con GPT-4o
```

### Troubleshooting OpenAI

| Error | Causa | Solución |
|-------|-------|----------|
| `OPENAI_API_KEY no configurada` | Variable faltante | Agregar en `.env` o Railway |
| `401 Unauthorized` | API Key inválida | Verificar key en OpenAI dashboard |
| `429 Too Many Requests` | Rate limit | Implementar retry con backoff |
| `400 Invalid image` | Imagen muy grande | Reducir tamaño o usar `detail: "low"` |
| `Timeout` | Imagen pesada o red lenta | Aumentar timeout, comprimir imagen |
| Respuesta no JSON | Modelo no siguió formato | Usar `response_format: { type: "json_object" }` |

### Costos Aproximados

| Operación | Tokens aprox. | Costo USD |
|-----------|---------------|----------|
| Verificación KYC (2 imágenes) | ~2000 | $0.02 |
| Extracción BL (1 página) | ~1500 | $0.015 |
| Chat soporte (mensaje) | ~300 | $0.0003 |
| Bot Facebook (mensaje) | ~500 | $0.005 |

---

## � DHL Monterrey - Costeo

### Descripción General

El módulo de costeo DHL permite gestionar:
1. **Tarifas de Costo** - Lo que EntregaX paga a DHL por tipo (Standard/High Value)
2. **Lista de Cajas** - Todos los paquetes AA_DHL con sus costos asignados
3. **Auto-asignación** - Asignar costos automáticamente basado en el tipo de producto

### Estructura de Base de Datos

#### Tabla: dhl_cost_rates
```sql
CREATE TABLE dhl_cost_rates (
    id SERIAL PRIMARY KEY,
    rate_type VARCHAR(50) NOT NULL UNIQUE,  -- 'standard', 'high_value'
    rate_name VARCHAR(100) NOT NULL,
    cost_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Datos iniciales
INSERT INTO dhl_cost_rates (rate_type, rate_name, cost_usd, description)
VALUES 
    ('standard', 'Standard', 0, 'Costo por envío DHL Standard'),
    ('high_value', 'High Value', 0, 'Costo por envío DHL High Value');
```

#### Columnas en dhl_shipments
```sql
ALTER TABLE dhl_shipments ADD COLUMN assigned_cost_usd DECIMAL(10,2);
ALTER TABLE dhl_shipments ADD COLUMN cost_rate_type VARCHAR(50);
ALTER TABLE dhl_shipments ADD COLUMN cost_assigned_at TIMESTAMP;
ALTER TABLE dhl_shipments ADD COLUMN cost_assigned_by INTEGER REFERENCES users(id);
```

### Endpoints API

| Método | Endpoint | Descripción | Rol Mínimo |
|--------|----------|-------------|------------|
| GET | `/api/admin/dhl/cost-rates` | Obtener tarifas de costo | ADMIN |
| PUT | `/api/admin/dhl/cost-rates/:id` | Actualizar tarifa de costo | DIRECTOR |
| GET | `/api/admin/dhl/costing` | Lista de cajas con costeo | ADMIN |
| POST | `/api/admin/dhl/costing/assign` | Asignar costo a envíos | ADMIN |
| POST | `/api/admin/dhl/costing/auto-assign` | Auto-asignar costos | ADMIN |

### Parámetros GET /api/admin/dhl/costing

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `search` | string | Buscar por tracking, cliente, box_id |
| `status` | string | Filtrar por estado del envío |
| `has_cost` | 'true'/'false' | Filtrar por si tiene costo asignado |
| `date_from` | date | Fecha inicial |
| `date_to` | date | Fecha final |
| `limit` | number | Límite de resultados (default: 50) |
| `offset` | number | Offset para paginación |

### Respuesta GET /api/admin/dhl/costing

```json
{
  "data": [
    {
      "id": 1,
      "inbound_tracking": "1234567890",
      "product_type": "standard",
      "weight_kg": 5.5,
      "status": "received_mty",
      "assigned_cost_usd": 145.00,
      "cost_rate_type": "standard",
      "client_name": "Juan Pérez",
      "client_box_id": "S1234"
    }
  ],
  "total": 150,
  "stats": {
    "total_shipments": 150,
    "with_cost": 120,
    "without_cost": 30,
    "total_cost_usd": 17400.00,
    "standard_count": 100,
    "high_value_count": 50
  }
}
```

### POST /api/admin/dhl/costing/assign

```json
// Request
{
  "shipment_ids": [1, 2, 3],
  "cost_rate_type": "standard",     // o "high_value"
  "custom_cost_usd": null           // si se quiere costo personalizado
}

// Response
{
  "success": true,
  "message": "Costo asignado a 3 envío(s)",
  "updated": [
    { "id": 1, "inbound_tracking": "123", "assigned_cost_usd": 145.00 }
  ]
}
```

### Componentes Frontend

#### DhlCostingPage.tsx
```
/entregax-web-admin/src/pages/DhlCostingPage.tsx

Tabs:
├── Tab 0: Tarifas de Costo
│   └── Tabla editable con Standard y High Value
│
└── Tab 1: Lista de Cajas
    ├── Filtros (búsqueda, estado de costo)
    ├── Selección múltiple
    ├── Botón Auto-Asignar
    ├── Botón Asignar Costo (seleccionados)
    └── Resumen estadístico
```

#### Acceso en AdminHubPage
```
Admin Hub → MX CEDIS → Costeo
```

### Migración

```bash
# Ejecutar migración
cd entregax-backend-api
node run_dhl_cost_migration.js
```

---

## �📝 Changelog

#### Asignación de Permisos (Script)
```javascript
// Asignar todos los permisos de panel a un usuario
const panels = await pool.query(`SELECT panel_key FROM admin_panels WHERE is_active = true`);
for (const panel of panels.rows) {
  await pool.query(`
    INSERT INTO user_panel_permissions (user_id, panel_key, can_view, can_edit)
    VALUES ($1, $2, true, true)
    ON CONFLICT (user_id, panel_key) DO UPDATE SET can_view = true, can_edit = true
  `, [userId, panel.panel_key]);
}

// Asignar todos los permisos de módulos a un usuario
const modules = await pool.query(`SELECT panel_key, module_key FROM admin_panel_modules WHERE is_active = true`);
for (const mod of modules.rows) {
  await pool.query(`
    INSERT INTO user_module_permissions (user_id, panel_key, module_key, can_view, can_edit)
    VALUES ($1, $2, $3, true, true)
    ON CONFLICT (user_id, panel_key, module_key) DO UPDATE SET can_view = true, can_edit = true
  `, [userId, mod.panel_key, mod.module_key]);
}
```

### v2.8.0 (4 Mar 2026) - OPENPAY MULTI-EMPRESA ⭐
- ✅ **Openpay Multi-Empresa** - Cada RFC tiene su propia cuenta Openpay
- ✅ **openpayController.ts** - Controlador completo (673 líneas)
- ✅ **CLABEs Virtuales STP** - Cada cliente recibe CLABE única
- ✅ **Webhook /webhooks/openpay/:empresa_id** - Recepción de pagos SPEI
- ✅ **Motor FIFO de Conciliación** - Aplica pagos automáticamente a guías pendientes
- ✅ **Tabla openpay_webhook_logs** - Registro de transacciones recibidas
- ✅ **Tabla openpay_payment_applications** - Historial de aplicación de pagos
- ✅ **Dashboard de Cobranza** - Estadísticas y reportes SPEI
- ✅ **Generación de CLABEs en lote** - Batch para múltiples clientes
- ✅ **Validación de credenciales** - Test de conexión al guardar
- ✅ **Modo Sandbox/Producción** - Toggle por empresa
- ✅ **Integración en FiscalPage** - Columna Openpay con modal de config
- ✅ **Migración add_openpay_multiempresa.sql** - Estructura de BD completa
- ✅ **Vista vw_openpay_payments** - Reporte consolidado de pagos

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
