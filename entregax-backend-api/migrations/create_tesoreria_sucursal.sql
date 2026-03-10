-- ============================================
-- MIGRACIÓN: SISTEMA DE TESORERÍA POR SUCURSAL
-- Caja chica, billeteras, categorías y cortes
-- ============================================

-- 1. TABLA DE BILLETERAS POR SUCURSAL
-- Cada sucursal puede tener múltiples "cuentas" (Efectivo, SPEI, PayPal, etc.)
CREATE TABLE IF NOT EXISTS billeteras_sucursal (
    id SERIAL PRIMARY KEY,
    sucursal_id INTEGER REFERENCES branches(id) NOT NULL,
    nombre VARCHAR(100) NOT NULL,  -- Ej: "Caja Registradora 1", "Cuenta BBVA SPEI", "PayPal Oficial"
    tipo VARCHAR(50) NOT NULL DEFAULT 'efectivo',  -- efectivo, spei, paypal, banco, tarjeta
    saldo_actual DECIMAL(12,2) DEFAULT 0.00,
    tipo_moneda VARCHAR(10) DEFAULT 'MXN',
    cuenta_referencia VARCHAR(50),  -- Número de cuenta o referencia
    icono VARCHAR(50) DEFAULT 'account_balance_wallet',
    color VARCHAR(20) DEFAULT '#4CAF50',
    is_default BOOLEAN DEFAULT false,  -- Billetera principal de la sucursal
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para billeteras
CREATE INDEX IF NOT EXISTS idx_billeteras_sucursal ON billeteras_sucursal(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_billeteras_tipo ON billeteras_sucursal(tipo);
CREATE INDEX IF NOT EXISTS idx_billeteras_active ON billeteras_sucursal(is_active);

-- 2. TABLA DE CATEGORÍAS FINANCIERAS
-- Para clasificar y agrupar movimientos (gráficas de pastel)
CREATE TABLE IF NOT EXISTS categorias_financieras (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL,  -- 'ingreso' o 'egreso'
    nombre VARCHAR(100) NOT NULL,  -- Ej: "Material de Empaque", "Servicios Básicos"
    descripcion TEXT,
    icono VARCHAR(50) DEFAULT 'category',
    color VARCHAR(20) DEFAULT '#9E9E9E',
    empresa_id INTEGER,  -- NULL = categoría global, sino específica de empresa
    is_system BOOLEAN DEFAULT false,  -- true = no se puede eliminar
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para categorías
CREATE INDEX IF NOT EXISTS idx_categorias_tipo ON categorias_financieras(tipo);
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias_financieras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_categorias_active ON categorias_financieras(is_active);

-- 3. TABLA DE MOVIMIENTOS FINANCIEROS (El Libro Mayor)
-- Registro de cada ingreso, egreso o transferencia
CREATE TABLE IF NOT EXISTS movimientos_financieros (
    id SERIAL PRIMARY KEY,
    sucursal_id INTEGER REFERENCES branches(id) NOT NULL,
    billetera_id INTEGER REFERENCES billeteras_sucursal(id) NOT NULL,
    categoria_id INTEGER REFERENCES categorias_financieras(id),
    
    tipo_movimiento VARCHAR(20) NOT NULL,  -- 'ingreso', 'egreso', 'transferencia_entrada', 'transferencia_salida'
    monto DECIMAL(12,2) NOT NULL,
    monto_antes DECIMAL(12,2),  -- Saldo antes del movimiento
    monto_despues DECIMAL(12,2),  -- Saldo después del movimiento
    
    nota_descriptiva TEXT,  -- Ej: "Compra de 5 rollos de cinta canela en Office Depot"
    referencia VARCHAR(100),  -- Referencia externa (factura, recibo, etc.)
    
    -- Evidencia (obligatoria para egresos)
    evidencia_url VARCHAR(500),
    evidencia_url_2 VARCHAR(500),  -- Segunda evidencia opcional
    evidencia_url_3 VARCHAR(500),  -- Tercera evidencia opcional
    
    -- Transferencia entre billeteras (si aplica)
    billetera_destino_id INTEGER REFERENCES billeteras_sucursal(id),
    movimiento_relacionado_id INTEGER REFERENCES movimientos_financieros(id),
    
    -- Datos de pago automático (integración con Openpay)
    pago_automatico BOOLEAN DEFAULT false,
    openpay_transaction_id VARCHAR(100),
    cliente_id INTEGER,  -- Si el movimiento está relacionado con un cliente
    
    -- Auditoría
    usuario_id INTEGER NOT NULL,
    usuario_nombre VARCHAR(200),
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Estado
    status VARCHAR(20) DEFAULT 'confirmado',  -- 'confirmado', 'pendiente', 'cancelado', 'ajuste'
    cancelado_por INTEGER,
    cancelado_at TIMESTAMP,
    cancelado_motivo TEXT,
    
    -- Corte de caja asociado
    corte_id INTEGER,  -- Se llena al cerrar el corte
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para movimientos
CREATE INDEX IF NOT EXISTS idx_movimientos_sucursal ON movimientos_financieros(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_billetera ON movimientos_financieros(billetera_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_categoria ON movimientos_financieros(categoria_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo ON movimientos_financieros(tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_financieros(created_at);
CREATE INDEX IF NOT EXISTS idx_movimientos_corte ON movimientos_financieros(corte_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_status ON movimientos_financieros(status);
CREATE INDEX IF NOT EXISTS idx_movimientos_usuario ON movimientos_financieros(usuario_id);

-- 4. TABLA DE CORTES DE CAJA (Cierre de Turno)
-- Control de cierre diario con sistema "ciego"
CREATE TABLE IF NOT EXISTS cortes_caja_sucursal (
    id SERIAL PRIMARY KEY,
    sucursal_id INTEGER REFERENCES branches(id) NOT NULL,
    billetera_id INTEGER REFERENCES billeteras_sucursal(id) NOT NULL,
    
    -- Usuario que realiza el corte
    usuario_id INTEGER NOT NULL,
    usuario_nombre VARCHAR(200),
    
    -- Período del corte
    fecha_apertura TIMESTAMP NOT NULL,
    fecha_cierre TIMESTAMP,
    
    -- Saldos calculados por el sistema
    saldo_inicial_calculado DECIMAL(12,2) NOT NULL,  -- Saldo al iniciar
    total_ingresos DECIMAL(12,2) DEFAULT 0.00,
    total_egresos DECIMAL(12,2) DEFAULT 0.00,
    saldo_final_esperado DECIMAL(12,2),  -- saldo_inicial + ingresos - egresos
    
    -- Lo que el cajero declara (conteo físico)
    saldo_final_declarado DECIMAL(12,2),  -- Lo que realmente contó
    diferencia DECIMAL(12,2),  -- declarado - esperado (+ sobrante, - faltante)
    
    -- Detalle del conteo físico
    conteo_billetes_1000 INTEGER DEFAULT 0,
    conteo_billetes_500 INTEGER DEFAULT 0,
    conteo_billetes_200 INTEGER DEFAULT 0,
    conteo_billetes_100 INTEGER DEFAULT 0,
    conteo_billetes_50 INTEGER DEFAULT 0,
    conteo_billetes_20 INTEGER DEFAULT 0,
    conteo_monedas_20 INTEGER DEFAULT 0,
    conteo_monedas_10 INTEGER DEFAULT 0,
    conteo_monedas_5 INTEGER DEFAULT 0,
    conteo_monedas_2 INTEGER DEFAULT 0,
    conteo_monedas_1 INTEGER DEFAULT 0,
    conteo_monedas_050 INTEGER DEFAULT 0,  -- 50 centavos
    
    -- Notas y observaciones
    notas_apertura TEXT,
    notas_cierre TEXT,
    
    -- Estado
    estatus VARCHAR(30) DEFAULT 'abierto',  -- 'abierto', 'cerrado', 'con_discrepancia', 'auditado', 'aprobado'
    
    -- Auditoría/Supervisión
    auditado_por INTEGER,
    auditado_nombre VARCHAR(200),
    auditado_at TIMESTAMP,
    auditado_notas TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para cortes
CREATE INDEX IF NOT EXISTS idx_cortes_sucursal ON cortes_caja_sucursal(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_cortes_billetera ON cortes_caja_sucursal(billetera_id);
CREATE INDEX IF NOT EXISTS idx_cortes_usuario ON cortes_caja_sucursal(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cortes_fecha ON cortes_caja_sucursal(fecha_apertura);
CREATE INDEX IF NOT EXISTS idx_cortes_estatus ON cortes_caja_sucursal(estatus);

-- 5. INSERTAR CATEGORÍAS PREDETERMINADAS DEL SISTEMA

-- Categorías de INGRESOS
INSERT INTO categorias_financieras (tipo, nombre, descripcion, icono, color, is_system) VALUES
('ingreso', 'Cobro de Guías', 'Pagos recibidos de clientes por envíos', 'local_shipping', '#4CAF50', true),
('ingreso', 'Venta de Productos', 'Venta de cajas, cinta, embalaje', 'shopping_cart', '#8BC34A', true),
('ingreso', 'Depósito Bancario', 'Transferencias SPEI recibidas', 'account_balance', '#2196F3', true),
('ingreso', 'PayPal/Tarjeta', 'Pagos con tarjeta o PayPal', 'credit_card', '#9C27B0', true),
('ingreso', 'Fondo de Caja', 'Inyección de fondo para apertura', 'savings', '#FF9800', true),
('ingreso', 'Reembolso Proveedor', 'Devolución de dinero por proveedores', 'undo', '#00BCD4', true),
('ingreso', 'Otro Ingreso', 'Ingresos varios no categorizados', 'attach_money', '#607D8B', true)
ON CONFLICT DO NOTHING;

-- Categorías de EGRESOS  
INSERT INTO categorias_financieras (tipo, nombre, descripcion, icono, color, is_system) VALUES
('egreso', 'Material de Empaque', 'Cajas, cinta, burbujas, relleno', 'inventory_2', '#F44336', true),
('egreso', 'Papelería', 'Hojas, etiquetas, tinta, folders', 'description', '#E91E63', true),
('egreso', 'Servicios Básicos', 'Luz, agua, internet, teléfono', 'power', '#FF5722', true),
('egreso', 'Renta', 'Pago de renta del local', 'home', '#795548', true),
('egreso', 'Combustible', 'Gasolina para entregas', 'local_gas_station', '#FF9800', true),
('egreso', 'Mantenimiento', 'Reparaciones, limpieza, pintura', 'build', '#9E9E9E', true),
('egreso', 'Viáticos', 'Comidas, transporte empleados', 'restaurant', '#FFC107', true),
('egreso', 'Retiro de Efectivo', 'Depósito bancario, retiro de caja', 'money_off', '#3F51B5', true),
('egreso', 'Pago a Proveedor', 'Pago a transportistas, fletera', 'local_shipping', '#673AB7', true),
('egreso', 'Comisiones', 'Pago de comisiones a asesores', 'people', '#00BCD4', true),
('egreso', 'Otro Gasto', 'Gastos varios no categorizados', 'receipt', '#607D8B', true)
ON CONFLICT DO NOTHING;

-- 6. TRIGGER PARA ACTUALIZAR SALDO DE BILLETERA
CREATE OR REPLACE FUNCTION actualizar_saldo_billetera()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'confirmado' THEN
        IF NEW.tipo_movimiento IN ('ingreso', 'transferencia_entrada') THEN
            UPDATE billeteras_sucursal 
            SET saldo_actual = saldo_actual + NEW.monto,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.billetera_id;
        ELSIF NEW.tipo_movimiento IN ('egreso', 'transferencia_salida') THEN
            UPDATE billeteras_sucursal 
            SET saldo_actual = saldo_actual - NEW.monto,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.billetera_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_actualizar_saldo ON movimientos_financieros;
CREATE TRIGGER trigger_actualizar_saldo
    AFTER INSERT ON movimientos_financieros
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_saldo_billetera();

-- 7. FUNCIÓN PARA REVERTIR SALDO SI SE CANCELA MOVIMIENTO
CREATE OR REPLACE FUNCTION revertir_saldo_cancelacion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'confirmado' AND NEW.status = 'cancelado' THEN
        IF OLD.tipo_movimiento IN ('ingreso', 'transferencia_entrada') THEN
            UPDATE billeteras_sucursal 
            SET saldo_actual = saldo_actual - OLD.monto,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = OLD.billetera_id;
        ELSIF OLD.tipo_movimiento IN ('egreso', 'transferencia_salida') THEN
            UPDATE billeteras_sucursal 
            SET saldo_actual = saldo_actual + OLD.monto,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = OLD.billetera_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_revertir_saldo ON movimientos_financieros;
CREATE TRIGGER trigger_revertir_saldo
    AFTER UPDATE ON movimientos_financieros
    FOR EACH ROW
    EXECUTE FUNCTION revertir_saldo_cancelacion();

-- 8. CREAR BILLETERA DE EFECTIVO POR DEFECTO PARA SUCURSALES EXISTENTES
INSERT INTO billeteras_sucursal (sucursal_id, nombre, tipo, is_default)
SELECT id, 'Caja Principal', 'efectivo', true
FROM branches
WHERE id NOT IN (SELECT sucursal_id FROM billeteras_sucursal WHERE is_default = true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE billeteras_sucursal IS 'Cuentas/billeteras de cada sucursal (efectivo, SPEI, PayPal, etc.)';
COMMENT ON TABLE categorias_financieras IS 'Categorías para clasificar movimientos financieros';
COMMENT ON TABLE movimientos_financieros IS 'Libro mayor de todos los movimientos financieros por sucursal';
COMMENT ON TABLE cortes_caja_sucursal IS 'Registro de cortes de caja con sistema de cierre ciego';
