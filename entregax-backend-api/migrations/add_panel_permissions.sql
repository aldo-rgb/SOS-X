-- ============================================
-- MIGRACIÓN: Sistema de Permisos por Panel
-- Permite asignar permisos granulares a usuarios
-- ============================================

-- Tabla de paneles disponibles
CREATE TABLE IF NOT EXISTS admin_panels (
    id SERIAL PRIMARY KEY,
    panel_key VARCHAR(50) UNIQUE NOT NULL,
    panel_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'admin', 'operations', 'customer_service'
    description TEXT,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de permisos de usuario por panel
CREATE TABLE IF NOT EXISTS user_panel_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    panel_key VARCHAR(50) NOT NULL,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    granted_by INTEGER,
    granted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, panel_key)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_user_panel_permissions_user ON user_panel_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_panel_permissions_panel ON user_panel_permissions(panel_key);

-- ============================================
-- INSERTAR PANELES DE ADMINISTRACIÓN
-- ============================================
INSERT INTO admin_panels (panel_key, panel_name, category, description, icon, sort_order) VALUES
-- Paneles de Administración (AdminHubPage)
('admin_china_air', 'China Aéreo', 'admin', 'Gestión de servicio aéreo desde China - Costeos, Precios, API', 'Flight', 1),
('admin_china_sea', 'China Marítimo', 'admin', 'Gestión de servicio marítimo - Rutas, Consolidaciones, API', 'DirectionsBoat', 2),
('admin_usa_pobox', 'PO Box USA', 'admin', 'Gestión de casilleros en Miami - Tarifas, Inventario', 'LocalShipping', 3),
('admin_mx_cedis', 'CEDIS México', 'admin', 'Centro de distribución - DHL, Inventario', 'Warehouse', 4),
('admin_mx_national', 'Nacional México', 'admin', 'Flete nacional - Última milla, Tarifas', 'LocationOn', 5),
('admin_gex', 'Garantía GEX', 'admin', 'Gestión de garantías extendidas', 'Security', 10),
('admin_verifications', 'Verificaciones KYC', 'admin', 'Verificación de identidad de clientes', 'VerifiedUser', 11),
('admin_supplier_payments', 'Pago Proveedores', 'admin', 'Gestión de pagos a proveedores', 'Payments', 12),
('admin_permissions', 'Matriz de Permisos', 'admin', 'Configuración de permisos por rol', 'Security', 13),
('admin_legacy_clients', 'Clientes Legacy', 'admin', 'Importación de clientes del sistema anterior', 'Upload', 14),
('admin_financial', 'Gestión Financiera', 'admin', 'Reportes y análisis financiero', 'AccountBalance', 15),
('admin_payment_invoices', 'Facturas de Pago', 'admin', 'Gestión de facturas y pagos', 'Receipt', 16),
('admin_branches', 'Sucursales', 'admin', 'Gestión de sucursales y CEDIS', 'Business', 17),
('admin_hr', 'Recursos Humanos', 'admin', 'Gestión de personal y nómina', 'Badge', 18),
('admin_fleet', 'Gestión de Flotilla', 'admin', 'Control de vehículos y rutas', 'DirectionsCar', 19),
('admin_exchange_rates', 'Tipo de Cambio', 'admin', 'Configuración de tipos de cambio', 'CurrencyExchange', 20),
('admin_carousel', 'Carrusel App', 'admin', 'Gestión de slides del carrusel móvil', 'Smartphone', 21),

-- Paneles de Operaciones (WarehouseHubPage)
('ops_usa_pobox', 'Recepción PO Box', 'operations', 'Recepción de paquetes desde USA', 'LocalShipping', 1),
('ops_china_air', 'Recepción China Aéreo', 'operations', 'Recepción de carga aérea', 'Flight', 2),
('ops_china_sea', 'Recepción China Marítimo', 'operations', 'Recepción de carga marítima', 'DirectionsBoat', 3),
('ops_mx_cedis', 'Bodega CEDIS', 'operations', 'Operaciones de almacén CEDIS', 'Warehouse', 4),
('ops_mx_national', 'Cotizaciones Nacional', 'operations', 'Cotizaciones de flete nacional', 'LocationOn', 5),
('ops_scanner', 'Scanner Unificado', 'operations', 'Scanner universal de paquetes', 'QrCodeScanner', 6),
('ops_inventory', 'Inventario Sucursal', 'operations', 'Control de inventario por sucursal', 'Inventory', 7),

-- Paneles de Servicio a Cliente (CustomerServiceHubPage)
('cs_leads', 'Central de Leads', 'customer_service', 'Gestión de prospectos y seguimiento comercial', 'Whatshot', 1),
('cs_clients', 'Control de Clientes', 'customer_service', 'Análisis de clientes y recuperación', 'PersonSearch', 2),
('cs_support', 'Centro de Soporte', 'customer_service', 'Atención al cliente y tickets', 'HeadsetMic', 3)

ON CONFLICT (panel_key) DO UPDATE SET
    panel_name = EXCLUDED.panel_name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

-- Dar acceso completo a super_admin por defecto (se maneja en código)
-- Los demás usuarios necesitan permisos explícitos
