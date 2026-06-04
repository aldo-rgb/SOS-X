-- Agrega el valor 'shipped' al enum package_status
-- Necesario para permitir el cambio manual de estado a "Enviado (Shipped)"
-- desde Inventario PO Box (super_admin) sin error 22P02 (invalid enum value).
--
-- IMPORTANTE: ALTER TYPE ADD VALUE no puede ejecutarse dentro de un BEGIN/COMMIT
-- transaccional. Hay que correrlo en autocommit.

ALTER TYPE package_status ADD VALUE IF NOT EXISTS 'shipped';
