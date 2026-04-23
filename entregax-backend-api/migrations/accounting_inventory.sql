-- =======================================================================
-- Portal Contable - Inventarios + Facturas Recibidas
-- Fase 1.5: catálogo de productos/servicios fiscal + CFDI de ingreso recibidos
-- =======================================================================

-- Categorías de productos por empresa
CREATE TABLE IF NOT EXISTS accounting_product_categories (
    id SERIAL PRIMARY KEY,
    fiscal_emitter_id INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    sat_clave_prod_serv VARCHAR(10),         -- clave default SAT (categoría)
    sat_clave_unidad VARCHAR(5) DEFAULT 'H87',-- unidad default (pieza)
    default_tax_rate NUMERIC(5,4) DEFAULT 0.16,
    color VARCHAR(9),
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fiscal_emitter_id, name)
);
CREATE INDEX IF NOT EXISTS idx_acc_cat_emitter ON accounting_product_categories(fiscal_emitter_id);

-- Catálogo de productos/servicios
CREATE TABLE IF NOT EXISTS accounting_products (
    id SERIAL PRIMARY KEY,
    fiscal_emitter_id INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES accounting_product_categories(id) ON DELETE SET NULL,
    sku VARCHAR(60),
    description VARCHAR(255) NOT NULL,
    sat_clave_prod_serv VARCHAR(10) NOT NULL, -- ClaveProdServ SAT
    sat_clave_unidad VARCHAR(5) NOT NULL DEFAULT 'H87', -- ClaveUnidad SAT
    unit_measure VARCHAR(40) DEFAULT 'Pieza',
    unit_price NUMERIC(14,4) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'MXN',
    tax_rate NUMERIC(5,4) DEFAULT 0.16,        -- 0.16=IVA16
    tax_included BOOLEAN DEFAULT FALSE,
    stock_qty NUMERIC(14,3) DEFAULT 0,
    min_stock NUMERIC(14,3) DEFAULT 0,
    barcode VARCHAR(60),
    is_service BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fiscal_emitter_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_acc_prod_emitter ON accounting_products(fiscal_emitter_id);
CREATE INDEX IF NOT EXISTS idx_acc_prod_cat ON accounting_products(category_id);
CREATE INDEX IF NOT EXISTS idx_acc_prod_sat ON accounting_products(sat_clave_prod_serv);

-- Movimientos de inventario (entradas / salidas / ajustes)
CREATE TABLE IF NOT EXISTS accounting_product_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES accounting_products(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL, -- 'in' | 'out' | 'adjust' | 'invoice_in'
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,4),
    reason TEXT,
    reference_type VARCHAR(40), -- 'received_invoice','manual','sale',...
    reference_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_acc_mov_prod ON accounting_product_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_acc_mov_type ON accounting_product_movements(movement_type);

-- Facturas Recibidas (CFDI proveedores)
CREATE TABLE IF NOT EXISTS accounting_received_invoices (
    id SERIAL PRIMARY KEY,
    fiscal_emitter_id INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
    uuid_sat VARCHAR(40),
    folio VARCHAR(40),
    serie VARCHAR(25),
    emisor_rfc VARCHAR(13),
    emisor_nombre VARCHAR(255),
    receptor_rfc VARCHAR(13),
    receptor_nombre VARCHAR(255),
    tipo_comprobante VARCHAR(3) DEFAULT 'I', -- I=Ingreso, E=Egreso, etc.
    uso_cfdi VARCHAR(5),
    metodo_pago VARCHAR(5),
    forma_pago VARCHAR(5),
    moneda VARCHAR(3) DEFAULT 'MXN',
    tipo_cambio NUMERIC(14,6) DEFAULT 1,
    subtotal NUMERIC(14,4) DEFAULT 0,
    descuento NUMERIC(14,4) DEFAULT 0,
    iva NUMERIC(14,4) DEFAULT 0,
    total NUMERIC(14,4) DEFAULT 0,
    fecha_emision TIMESTAMP,
    fecha_timbrado TIMESTAMP,
    xml_filename VARCHAR(255),
    xml_hash VARCHAR(64),
    xml_content TEXT,
    pdf_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'received', -- received|paid|canceled|matched
    inventory_imported BOOLEAN DEFAULT FALSE,
    inventory_imported_at TIMESTAMP,
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending|partial|paid
    notes TEXT,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fiscal_emitter_id, uuid_sat)
);
CREATE INDEX IF NOT EXISTS idx_acc_recinv_emitter ON accounting_received_invoices(fiscal_emitter_id);
CREATE INDEX IF NOT EXISTS idx_acc_recinv_uuid ON accounting_received_invoices(uuid_sat);
CREATE INDEX IF NOT EXISTS idx_acc_recinv_emisor ON accounting_received_invoices(emisor_rfc);

-- Conceptos (items) de facturas recibidas
CREATE TABLE IF NOT EXISTS accounting_received_invoice_items (
    id SERIAL PRIMARY KEY,
    received_invoice_id INTEGER NOT NULL REFERENCES accounting_received_invoices(id) ON DELETE CASCADE,
    sat_clave_prod_serv VARCHAR(10),
    sat_clave_unidad VARCHAR(5),
    no_identificacion VARCHAR(60),
    description VARCHAR(500),
    quantity NUMERIC(14,3) DEFAULT 1,
    unit_price NUMERIC(14,4) DEFAULT 0,
    amount NUMERIC(14,4) DEFAULT 0,
    discount NUMERIC(14,4) DEFAULT 0,
    tax_amount NUMERIC(14,4) DEFAULT 0,
    matched_product_id INTEGER REFERENCES accounting_products(id) ON DELETE SET NULL,
    imported_to_inventory BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_acc_recinv_items_inv ON accounting_received_invoice_items(received_invoice_id);
