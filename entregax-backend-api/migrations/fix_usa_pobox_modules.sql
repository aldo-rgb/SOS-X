-- ============================================
-- MIGRACIÓN: Corregir módulos de admin_usa_pobox
-- Alinear con los módulos reales del frontend
-- ============================================

-- Eliminar módulos incorrectos de admin_usa_pobox
DELETE FROM admin_panel_modules 
WHERE panel_key = 'admin_usa_pobox' 
AND module_key IN ('costing', 'inventory', 'verifications');

-- Actualizar módulo costing -> suppliers (Costeo Proveedores)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('admin_usa_pobox', 'suppliers', 'Costeo Proveedores', 'Gestión de costos con proveedores', 'Calculate', 1)
ON CONFLICT (panel_key, module_key) DO UPDATE SET
    module_name = EXCLUDED.module_name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

-- Actualizar orden de los demás módulos
UPDATE admin_panel_modules SET sort_order = 2 WHERE panel_key = 'admin_usa_pobox' AND module_key = 'pobox_rates';
UPDATE admin_panel_modules SET sort_order = 3 WHERE panel_key = 'admin_usa_pobox' AND module_key = 'invoicing';
UPDATE admin_panel_modules SET sort_order = 4 WHERE panel_key = 'admin_usa_pobox' AND module_key = 'instructions';
UPDATE admin_panel_modules SET sort_order = 5 WHERE panel_key = 'admin_usa_pobox' AND module_key = 'reports';

-- Verificar resultado
SELECT panel_key, module_key, module_name, sort_order 
FROM admin_panel_modules 
WHERE panel_key = 'admin_usa_pobox'
ORDER BY sort_order;
