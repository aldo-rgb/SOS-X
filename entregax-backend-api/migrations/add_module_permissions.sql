-- ============================================
-- MIGRACIÓN: Permisos a nivel de Módulos
-- Permite control granular de acceso a módulos dentro de cada panel
-- ============================================

-- 1. Tabla de definición de módulos por panel
CREATE TABLE IF NOT EXISTS admin_panel_modules (
    id SERIAL PRIMARY KEY,
    panel_key VARCHAR(50) NOT NULL REFERENCES admin_panels(panel_key) ON DELETE CASCADE,
    module_key VARCHAR(50) NOT NULL,
    module_name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(panel_key, module_key)
);

-- 2. Tabla de permisos de módulos por usuario
CREATE TABLE IF NOT EXISTS user_module_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    panel_key VARCHAR(50) NOT NULL,
    module_key VARCHAR(50) NOT NULL,
    can_view BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    granted_by INTEGER,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, panel_key, module_key)
);

-- 3. Insertar módulos para China Marítimo (admin_china_sea)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('admin_china_sea', 'costing', 'Costeo Internacional', 'Gestión de costos de contenedores', 'Calculate', 1),
('admin_china_sea', 'inventory', 'Inventario', 'Control de inventario marítimo', 'Inventory', 2),
('admin_china_sea', 'pricing', 'Tarifas', 'Configuración de tarifas y precios', 'Sell', 3),
('admin_china_sea', 'invoicing', 'Facturación', 'Generación de facturas', 'Receipt', 4),
('admin_china_sea', 'instructions', 'Direcciones', 'Gestión de direcciones de envío', 'Assignment', 5),
('admin_china_sea', 'routes', 'Rutas', 'Administración de rutas marítimas', 'Route', 6),
('admin_china_sea', 'consolidations', 'Consolidaciones', 'Gestión de consolidados', 'Inventory', 7),
('admin_china_sea', 'inbound_emails', 'Correos Marítimo', 'Procesamiento de correos entrantes', 'Email', 8),
('admin_china_sea', 'maritime_api', 'API China Marítimo', 'Configuración de API con proveedores', 'Api', 9),
('admin_china_sea', 'anticipos', 'Control de Anticipos', 'Gestión de anticipos y depósitos', 'Wallet', 10),
('admin_china_sea', 'reports', 'Reportes', 'Reportes y estadísticas', 'Assessment', 11)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 4. Insertar módulos para China Aéreo (admin_china_air)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('admin_china_air', 'costing', 'Costeo Internacional', 'Gestión de costos aéreos', 'Calculate', 1),
('admin_china_air', 'inventory', 'Inventario', 'Control de inventario aéreo', 'Inventory', 2),
('admin_china_air', 'pricing', 'Tarifas', 'Configuración de tarifas aéreas', 'Sell', 3),
('admin_china_air', 'invoicing', 'Facturación', 'Generación de facturas', 'Receipt', 4),
('admin_china_air', 'instructions', 'Direcciones', 'Gestión de direcciones', 'Assignment', 5),
('admin_china_air', 'air_api', 'API China Aéreo', 'Configuración de API MJCustomer', 'Api', 6),
('admin_china_air', 'reports', 'Reportes', 'Reportes y estadísticas', 'Assessment', 7)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 5. Insertar módulos para PO Box USA (admin_usa_pobox)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('admin_usa_pobox', 'costing', 'Costeo', 'Gestión de costos PO Box', 'Calculate', 1),
('admin_usa_pobox', 'inventory', 'Inventario', 'Control de inventario Miami', 'Inventory', 2),
('admin_usa_pobox', 'pobox_rates', 'Tarifas PO Box', 'Configuración de tarifas', 'Sell', 3),
('admin_usa_pobox', 'invoicing', 'Facturación', 'Generación de facturas', 'Receipt', 4),
('admin_usa_pobox', 'instructions', 'Direcciones', 'Gestión de direcciones', 'Assignment', 5),
('admin_usa_pobox', 'verifications', 'Verificaciones', 'KYC y verificaciones', 'VerifiedUser', 6),
('admin_usa_pobox', 'reports', 'Reportes', 'Reportes y estadísticas', 'Assessment', 7)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 6. Insertar módulos para CEDIS México (admin_mx_cedis)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('admin_mx_cedis', 'dhl_rates', 'Tarifas DHL', 'Configuración de tarifas DHL', 'Sell', 1),
('admin_mx_cedis', 'inventory', 'Inventario', 'Control de inventario CEDIS', 'Inventory', 2),
('admin_mx_cedis', 'invoicing', 'Facturación', 'Generación de facturas', 'Receipt', 3),
('admin_mx_cedis', 'instructions', 'Direcciones', 'Gestión de direcciones', 'Assignment', 4),
('admin_mx_cedis', 'customs', 'Aduanas', 'Gestión aduanal', 'Assignment', 5),
('admin_mx_cedis', 'reports', 'Reportes', 'Reportes y estadísticas', 'Assessment', 6)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 7. Insertar módulos para Nacional México (admin_mx_national)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('admin_mx_national', 'inventory', 'Inventario', 'Control de inventario', 'Inventory', 1),
('admin_mx_national', 'pricing', 'Tarifas', 'Configuración de tarifas', 'Sell', 2),
('admin_mx_national', 'last_mile', 'Última Milla', 'Gestión de entregas', 'LocalShipping', 3),
('admin_mx_national', 'invoicing', 'Facturación', 'Generación de facturas', 'Receipt', 4),
('admin_mx_national', 'instructions', 'Direcciones', 'Gestión de direcciones', 'Assignment', 5),
('admin_mx_national', 'coverage', 'Cobertura', 'Zonas de cobertura', 'Timeline', 6),
('admin_mx_national', 'reports', 'Reportes', 'Reportes y estadísticas', 'Assessment', 7)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 8. Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_module_perms_user ON user_module_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_module_perms_panel ON user_module_permissions(panel_key);
CREATE INDEX IF NOT EXISTS idx_panel_modules_panel ON admin_panel_modules(panel_key);

-- 9. Comentarios
COMMENT ON TABLE admin_panel_modules IS 'Define los módulos disponibles dentro de cada panel administrativo';
COMMENT ON TABLE user_module_permissions IS 'Permisos de usuario a nivel de módulo específico';
