-- Agregar paneles faltantes de Servicio a Cliente
INSERT INTO admin_panels (panel_key, panel_name, category, description, icon, sort_order) VALUES
  ('cs_cartera', 'Ajustes y Abandonos', 'customer_service', 'Cargos, descuentos, cobranza y abandono de mercancía', 'AccountBalanceWallet', 4),
  ('cs_delayed', 'Guías con Retraso', 'customer_service', 'Paquetes cuya consolidación llegó a MTY sin ellos', 'LocalShipping', 5),
  ('cs_assign_client', 'Asignar Cliente', 'customer_service', 'Guías en bodega PO Box sin cliente asignado', 'AssignmentInd', 6)
ON CONFLICT (panel_key) DO UPDATE SET
  panel_name = EXCLUDED.panel_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;
