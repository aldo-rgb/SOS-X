-- ============================================
-- Renombrar panel "Scanner Unificado" → "Escáner Multi-Sucursal"
-- para que coincida con el título real del UI (UnifiedWarehousePanel)
-- ============================================

UPDATE admin_panels
SET
    panel_name = 'Escáner Multi-Sucursal',
    description = 'Consulta de paquetes en todas las sucursales',
    icon = 'TravelExplore'
WHERE panel_key = 'ops_scanner';
