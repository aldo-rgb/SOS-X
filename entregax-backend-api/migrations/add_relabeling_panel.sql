-- Agregar panel ops_relabeling (Módulo de Reetiquetado)
-- Permite reimprimir etiquetas de cualquier paquete/servicio en el sistema

INSERT INTO admin_panels (panel_key, panel_name, category, description, icon, sort_order)
VALUES
  ('ops_relabeling', 'Módulo de etiquetado', 'operations', 'Reimpresión de etiquetas de cualquier servicio y embarque', 'Print', 8)
ON CONFLICT (panel_key) DO UPDATE SET
    panel_name = EXCLUDED.panel_name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;
