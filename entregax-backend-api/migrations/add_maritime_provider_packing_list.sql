-- Packing list que ahora envía el proveedor chino (getOrderListApi.packing_list_path).
-- Se guarda aparte de packing_list_url (ese es el packing list manual del cliente/staff).
ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS provider_packing_list_url TEXT;
