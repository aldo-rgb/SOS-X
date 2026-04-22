-- Agregar módulo "Recibir Consolidación" al panel ops_usa_pobox
INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order)
VALUES ('ops_usa_pobox', 'receive_consolidation', 'Recibir Consolidación', 'Recepción y validación de consolidaciones llegando a MTY', 'AllInbox', 8)
ON CONFLICT (panel_key, module_key) DO NOTHING;
