-- Alinea los módulos de permisos del panel ops_china_air (Recepción China Aéreo)
-- con las operaciones REALES del hub aéreo (ChinaAirHubPage):
--   reception      → Recibir AWB
--   inventory      → Inventario Aéreo
--   tdx_inventory  → Inventario TDX
--   tdi_express    → Recibir TDI DHL Express
--   tdi_outbound   → Enviar TDI DHL Express
--   tdi_cedis_mty  → Recibir en CEDIS MTY
-- Antes el panel listaba: reception, processing, customs_release, distribution,
-- scanning, photos (no concordaban con las operaciones reales).

BEGIN;

-- 1) Renombrar 'reception' a "Recibir AWB"
UPDATE admin_panel_modules
   SET module_name = 'Recibir AWB',
       description = 'Escanea las guías que llegaron en una AWB y registra la recepción en MTY',
       icon = 'QrCodeScanner',
       sort_order = 1
 WHERE panel_key = 'ops_china_air' AND module_key = 'reception';

-- 2) Insertar / actualizar los nuevos módulos reales
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order) VALUES
 ('ops_china_air', 'inventory',     'Inventario Aéreo',        'Consulta los paquetes del servicio aéreo (AIR) en bodega y su estado',   'Inventory',       2),
 ('ops_china_air', 'tdx_inventory', 'Inventario TDX',          'Consulta los paquetes TDI Express (TDX) en bodega y su estado',          'Inventory',       3),
 ('ops_china_air', 'tdi_express',   'Recibir TDI DHL Express', 'Captura en serie de envíos de la ruta TDI Express China → Monterrey',    'LocalShipping',   4),
 ('ops_china_air', 'tdi_outbound',  'Enviar TDI DHL Express',  'Da salida a las cajas TDI Express listas para salir de China',           'FlightTakeoff',   5),
 ('ops_china_air', 'tdi_cedis_mty', 'Recibir en CEDIS MTY',    'Escanea guías TDX que llegaron a Monterrey para marcarlas como Recibido MTY', 'LocalShipping', 6)
ON CONFLICT (panel_key, module_key) DO UPDATE
   SET module_name = EXCLUDED.module_name,
       description = EXCLUDED.description,
       icon = EXCLUDED.icon,
       sort_order = EXCLUDED.sort_order,
       is_active = TRUE;

-- 3) Preservar el acceso de los usuarios que ya tenían permisos en este panel:
--    si tenían cualquier módulo viejo, se les concede los módulos nuevos con el
--    mismo nivel (ver/editar) que tenían en conjunto.
INSERT INTO user_module_permissions (user_id, panel_key, module_key, can_view, can_edit, granted_at)
SELECT agg.user_id, 'ops_china_air', nm.module_key, agg.can_view, agg.can_edit, NOW()
  FROM (
    SELECT user_id, bool_or(can_view) AS can_view, bool_or(can_edit) AS can_edit
      FROM user_module_permissions
     WHERE panel_key = 'ops_china_air'
     GROUP BY user_id
  ) agg
  CROSS JOIN (VALUES ('inventory'),('tdx_inventory'),('tdi_express'),('tdi_outbound'),('tdi_cedis_mty')) AS nm(module_key)
ON CONFLICT (user_id, panel_key, module_key) DO UPDATE
   SET can_view = EXCLUDED.can_view,
       can_edit = EXCLUDED.can_edit;

-- 4) Borrar módulos viejos que ya no aplican (y sus permisos huérfanos)
DELETE FROM user_module_permissions
 WHERE panel_key = 'ops_china_air'
   AND module_key IN ('processing','customs_release','distribution','scanning','photos');

DELETE FROM admin_panel_modules
 WHERE panel_key = 'ops_china_air'
   AND module_key IN ('processing','customs_release','distribution','scanning','photos');

COMMIT;
