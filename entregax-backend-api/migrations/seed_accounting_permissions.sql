-- ============================================================
-- Seed de permisos del Portal Contable
-- Agrega los slugs de permisos creados hoy (Fase 1 Accounting)
-- y los asigna por defecto a Super Admin y Contador.
-- ============================================================

-- 1) Permisos (slug único, idempotente)
INSERT INTO permissions (slug, name, category) VALUES
  ('accounting.view',              'Portal Contable: Ver Facturas Emitidas',  'Contable'),
  ('accounting.emit_invoice',      'Portal Contable: Timbrar Facturas',       'Contable'),
  ('accounting.cancel_invoice',    'Portal Contable: Cancelar Facturas',      'Contable'),
  ('accounting.inventory.view',    'Contable: Ver Inventarios',               'Contable'),
  ('accounting.inventory.manage',  'Contable: Gestionar Inventarios',         'Contable'),
  ('accounting.received_invoices.view',   'Contable: Ver Facturas Recibidas', 'Contable'),
  ('accounting.received_invoices.manage', 'Contable: Gestionar Facturas Recibidas', 'Contable'),
  ('accounting.bank_movements.view', 'Contable: Ver Movimientos Banco (Belvo)', 'Contable'),
  ('accounting.bank_movements.sync', 'Contable: Sincronizar Movimientos Banco', 'Contable'),
  ('accounting.emitters.manage',   'Contable: Gestionar Accesos por Emisor',  'Contable')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category;

-- 2) Asignar TODOS los permisos contables al rol "Super Admin"
INSERT INTO role_permissions (role, permission_id)
SELECT 'Super Admin', id FROM permissions
WHERE slug LIKE 'accounting.%'
ON CONFLICT DO NOTHING;

-- 3) Asignar permisos contables estándar al rol "Contador"
--    (puede ver todo y timbrar, pero cancelar / gestionar emisores queda
--     como extra para Super Admin o para otorgarlo manualmente)
INSERT INTO role_permissions (role, permission_id)
SELECT 'Contador', id FROM permissions
WHERE slug IN (
  'accounting.view',
  'accounting.emit_invoice',
  'accounting.inventory.view',
  'accounting.inventory.manage',
  'accounting.received_invoices.view',
  'accounting.received_invoices.manage',
  'accounting.bank_movements.view',
  'accounting.bank_movements.sync'
)
ON CONFLICT DO NOTHING;

-- 4) Admin y Director pueden al menos ver
INSERT INTO role_permissions (role, permission_id)
SELECT r.role, p.id
FROM (VALUES ('Admin'), ('Director')) AS r(role)
CROSS JOIN permissions p
WHERE p.slug IN (
  'accounting.view',
  'accounting.inventory.view',
  'accounting.received_invoices.view',
  'accounting.bank_movements.view'
)
ON CONFLICT DO NOTHING;
