-- Agregar módulo "Asignar Cliente" al panel ops_usa_pobox
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order)
VALUES ('ops_usa_pobox', 'assign_client', 'Asignar Cliente', 'Asignar cliente a paquetes pendientes', 'AssignmentInd', 9)
ON CONFLICT (panel_key, module_key) DO UPDATE SET
  module_name = EXCLUDED.module_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;
