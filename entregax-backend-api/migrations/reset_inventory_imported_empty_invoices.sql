-- =============================================================================
-- reset_inventory_imported_empty_invoices.sql
-- -----------------------------------------------------------------------------
-- Repara facturas recibidas (CFDI tipo Ingreso) que quedaron marcadas como
-- inventory_imported = TRUE pero en realidad NO generaron productos ni
-- movimientos en accounting_products, porque el parser viejo de regex no
-- extrajo los <cfdi:Concepto>.
--
-- Estrategia:
--   1) Detectar facturas tipo 'I' marcadas como importadas pero que:
--        - no tienen renglones en accounting_received_invoice_items, O
--        - ningún renglón tiene imported_to_inventory = TRUE, O
--        - no existe ningún movement con reference_type='received_invoice'
--   2) Resetear su flag inventory_imported para que el botón
--      "Importar a inventario" vuelva a aparecer en el panel.
--   3) Mostrar el listado afectado para auditoría.
--
-- Es idempotente: correrlo varias veces no causa daño.
-- =============================================================================

BEGIN;

-- 1) Vista previa (auditoría) de las facturas a resetear
WITH afectadas AS (
    SELECT ri.id,
           ri.fiscal_emitter_id,
           ri.uuid_sat,
           ri.serie,
           ri.folio,
           ri.emisor_nombre,
           ri.total,
           ri.inventory_imported,
           ri.inventory_imported_at,
           (SELECT COUNT(*) FROM accounting_received_invoice_items i
              WHERE i.received_invoice_id = ri.id)                         AS items_count,
           (SELECT COUNT(*) FROM accounting_received_invoice_items i
              WHERE i.received_invoice_id = ri.id
                AND i.imported_to_inventory = TRUE)                        AS items_importados,
           (SELECT COUNT(*) FROM accounting_product_movements m
              WHERE m.reference_type = 'received_invoice'
                AND m.reference_id   = ri.id)                              AS movimientos
      FROM accounting_received_invoices ri
     WHERE ri.tipo_comprobante = 'I'
       AND ri.inventory_imported = TRUE
)
SELECT *
  FROM afectadas
 WHERE items_count = 0
    OR items_importados = 0
    OR movimientos = 0
 ORDER BY fiscal_emitter_id, id;

-- 2) Reset del flag y la fecha para que vuelvan a ser importables
UPDATE accounting_received_invoices ri
   SET inventory_imported    = FALSE,
       inventory_imported_at = NULL
 WHERE ri.tipo_comprobante = 'I'
   AND ri.inventory_imported = TRUE
   AND (
        -- a) sin renglones de items
        NOT EXISTS (
            SELECT 1 FROM accounting_received_invoice_items i
             WHERE i.received_invoice_id = ri.id
        )
        -- b) ningún renglón marcado como importado
        OR NOT EXISTS (
            SELECT 1 FROM accounting_received_invoice_items i
             WHERE i.received_invoice_id = ri.id
               AND i.imported_to_inventory = TRUE
        )
        -- c) sin movimientos de inventario asociados
        OR NOT EXISTS (
            SELECT 1 FROM accounting_product_movements m
             WHERE m.reference_type = 'received_invoice'
               AND m.reference_id   = ri.id
        )
   );

-- 3) Reporte final: cuántas quedaron pendientes de importar tras el reset
SELECT fiscal_emitter_id,
       COUNT(*) FILTER (WHERE inventory_imported = FALSE) AS pendientes_de_importar,
       COUNT(*) FILTER (WHERE inventory_imported = TRUE ) AS ya_importadas
  FROM accounting_received_invoices
 WHERE tipo_comprobante = 'I'
 GROUP BY fiscal_emitter_id
 ORDER BY fiscal_emitter_id;

COMMIT;
