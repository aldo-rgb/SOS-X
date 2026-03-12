-- ============================================
-- MIGRACIÓN: Módulos para Paneles de Operaciones
-- Añade control granular de módulos para ops_*
-- ============================================

-- 1. Módulos para Recepción PO Box (ops_usa_pobox)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('ops_usa_pobox', 'reception', 'Recepción', 'Recepción de paquetes entrantes', 'MoveToInbox', 1),
('ops_usa_pobox', 'repack', 'Reempaque', 'Consolidación y reempaque de paquetes', 'Inventory', 2),
('ops_usa_pobox', 'outbound', 'Salida', 'Control de salida y despachos', 'Outbox', 3),
('ops_usa_pobox', 'photos', 'Fotografías', 'Captura de evidencia fotográfica', 'PhotoCamera', 4),
('ops_usa_pobox', 'scanning', 'Escaneo', 'Escaneo de paquetes y etiquetas', 'QrCodeScanner', 5),
('ops_usa_pobox', 'labels', 'Etiquetas', 'Impresión de etiquetas', 'Print', 6),
('ops_usa_pobox', 'weight', 'Pesaje', 'Registro de peso y dimensiones', 'Scale', 7)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 2. Módulos para Recepción China Aéreo (ops_china_air)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('ops_china_air', 'reception', 'Recepción', 'Recepción de carga aérea', 'MoveToInbox', 1),
('ops_china_air', 'processing', 'Procesamiento', 'Clasificación y procesamiento', 'Assignment', 2),
('ops_china_air', 'customs_release', 'Liberación Aduanal', 'Control de liberación de aduana', 'VerifiedUser', 3),
('ops_china_air', 'distribution', 'Distribución', 'Asignación a sucursales', 'Route', 4),
('ops_china_air', 'scanning', 'Escaneo', 'Escaneo de paquetes', 'QrCodeScanner', 5),
('ops_china_air', 'photos', 'Fotografías', 'Evidencia fotográfica', 'PhotoCamera', 6)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 3. Módulos para Recepción China Marítimo (ops_china_sea)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('ops_china_sea', 'reception', 'Recepción', 'Recepción de contenedores', 'MoveToInbox', 1),
('ops_china_sea', 'container_unload', 'Descarga', 'Descarga de contenedor', 'Unarchive', 2),
('ops_china_sea', 'processing', 'Procesamiento', 'Clasificación de paquetes', 'Assignment', 3),
('ops_china_sea', 'customs_release', 'Liberación Aduanal', 'Control de liberación', 'VerifiedUser', 4),
('ops_china_sea', 'distribution', 'Distribución', 'Asignación a sucursales', 'Route', 5),
('ops_china_sea', 'scanning', 'Escaneo', 'Escaneo de paquetes', 'QrCodeScanner', 6),
('ops_china_sea', 'photos', 'Fotografías', 'Evidencia fotográfica', 'PhotoCamera', 7),
('ops_china_sea', 'damage_report', 'Daños', 'Reporte de daños', 'ReportProblem', 8)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 4. Módulos para Bodega CEDIS (ops_mx_cedis)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('ops_mx_cedis', 'reception', 'Recepción', 'Recepción en CEDIS', 'MoveToInbox', 1),
('ops_mx_cedis', 'storage', 'Almacenamiento', 'Control de ubicaciones', 'Warehouse', 2),
('ops_mx_cedis', 'picking', 'Picking', 'Preparación de pedidos', 'Assignment', 3),
('ops_mx_cedis', 'packing', 'Empaque', 'Empaque para envío', 'Inventory', 4),
('ops_mx_cedis', 'dispatch', 'Despacho', 'Control de salidas', 'Outbox', 5),
('ops_mx_cedis', 'transfers', 'Transferencias', 'Movimientos entre bodegas', 'SwapHoriz', 6),
('ops_mx_cedis', 'scanning', 'Escaneo', 'Escaneo de paquetes', 'QrCodeScanner', 7),
('ops_mx_cedis', 'inventory_count', 'Conteo', 'Conteo de inventario', 'Calculate', 8)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 5. Módulos para Cotizaciones Nacional (ops_mx_national)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('ops_mx_national', 'quotes', 'Cotizaciones', 'Generación de cotizaciones', 'Calculate', 1),
('ops_mx_national', 'rates', 'Tarifas', 'Consulta de tarifas', 'Sell', 2),
('ops_mx_national', 'coverage', 'Cobertura', 'Verificación de cobertura', 'Map', 3),
('ops_mx_national', 'tracking', 'Rastreo', 'Seguimiento de envíos', 'Timeline', 4)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 6. Módulos para Scanner Unificado (ops_scanner)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('ops_scanner', 'scan_receive', 'Escanear Recepción', 'Escaneo para recepción', 'MoveToInbox', 1),
('ops_scanner', 'scan_deliver', 'Escanear Entrega', 'Escaneo para entrega', 'CheckCircle', 2),
('ops_scanner', 'scan_transfer', 'Escanear Transferencia', 'Escaneo para transferencias', 'SwapHoriz', 3),
('ops_scanner', 'scan_return', 'Escanear Devolución', 'Escaneo para devoluciones', 'Undo', 4),
('ops_scanner', 'batch_scan', 'Escaneo Masivo', 'Escaneo de múltiples paquetes', 'ViewList', 5)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 7. Módulos para Inventario Sucursal (ops_inventory)
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
('ops_inventory', 'stock_view', 'Ver Stock', 'Consulta de existencias', 'Inventory', 1),
('ops_inventory', 'stock_adjust', 'Ajustar Stock', 'Ajustes de inventario', 'Edit', 2),
('ops_inventory', 'stock_count', 'Conteo', 'Conteo físico', 'Calculate', 3),
('ops_inventory', 'transfers', 'Transferencias', 'Transferencias de inventario', 'SwapHoriz', 4),
('ops_inventory', 'reports', 'Reportes', 'Reportes de inventario', 'Assessment', 5)
ON CONFLICT (panel_key, module_key) DO NOTHING;

-- 8. Índice adicional para nuevos módulos
CREATE INDEX IF NOT EXISTS idx_panel_modules_ops ON admin_panel_modules(panel_key) WHERE panel_key LIKE 'ops_%';

-- 9. Comentario
COMMENT ON TABLE admin_panel_modules IS 'Define los módulos disponibles dentro de cada panel (admin y operaciones)';
