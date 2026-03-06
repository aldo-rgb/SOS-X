// ============================================
// POBOX RATES CONTROLLER
// Controlador para tarifas PO Box USA y cotizador
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// COTIZADOR PO BOX USA
// ============================================

export const calcularCotizacionPOBox = async (req: Request, res: Response): Promise<void> => {
    try {
        const { largo, alto, ancho, requiereForaneo, requiereExpres } = req.body;

        // Validar medidas
        if (!largo || !alto || !ancho) {
            res.status(400).json({ error: 'Se requieren las medidas: largo, alto, ancho (en cm)' });
            return;
        }

        // 1. Calcular CBM
        let cbm = (parseFloat(largo) * parseFloat(alto) * parseFloat(ancho)) / 1000000;
        if (cbm < 0.010) cbm = 0.010; // Mínimo cobrable

        // 2. Obtener tarifas activas de la BD
        const tarifasResult = await pool.query(
            'SELECT * FROM pobox_tarifas_volumen WHERE estado = TRUE ORDER BY nivel ASC'
        );
        const tarifas = tarifasResult.rows;

        // 3. Obtener tipo de cambio para PO Box USA
        const tcResult = await pool.query(
            "SELECT tipo_cambio_final FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE"
        );
        const tipoCambio = tcResult.rows[0]?.tipo_cambio_final || 17.50; // Default si no existe

        // 4. Evaluar nivel y calcular costo
        let costo_volumen_usd = 0;
        let nivelAplicado = 0;
        let tipoCobroAplicado = 'fijo';

        for (const tarifa of tarifas) {
            const cbmMin = parseFloat(tarifa.cbm_min);
            const cbmMax = tarifa.cbm_max ? parseFloat(tarifa.cbm_max) : Infinity;

            if (cbm >= cbmMin && cbm <= cbmMax) {
                nivelAplicado = tarifa.nivel;
                tipoCobroAplicado = tarifa.tipo_cobro;

                if (tarifa.tipo_cobro === 'fijo') {
                    costo_volumen_usd = parseFloat(tarifa.costo);
                } else if (tarifa.tipo_cobro === 'por_unidad') {
                    costo_volumen_usd = cbm * parseFloat(tarifa.costo);
                    
                    // 🛡️ REGLA DE PROTECCIÓN DE PRECIO
                    // Obtener el costo máximo del nivel anterior
                    const nivelAnterior = tarifas.find((t: any) => t.nivel === tarifa.nivel - 1);
                    if (nivelAnterior) {
                        const costoMinimo = parseFloat(nivelAnterior.costo);
                        if (costo_volumen_usd < costoMinimo) {
                            costo_volumen_usd = costoMinimo;
                        }
                    }
                }
                break;
            }
        }

        // 5. Calcular servicios extra
        let costo_extras_mxn = 0;
        const extrasAplicados: string[] = [];

        if (requiereForaneo) {
            const foraneResult = await pool.query(
                "SELECT costo FROM pobox_tarifas_extras WHERE nombre_servicio = 'Envío Foráneo' AND estado = TRUE"
            );
            if (foraneResult.rows[0]) {
                costo_extras_mxn += parseFloat(foraneResult.rows[0].costo);
                extrasAplicados.push('Envío Foráneo');
            }
        }

        if (requiereExpres) {
            const expresResult = await pool.query(
                "SELECT costo FROM pobox_tarifas_extras WHERE nombre_servicio = 'Paquete Exprés' AND estado = TRUE"
            );
            if (expresResult.rows[0]) {
                costo_extras_mxn += parseFloat(expresResult.rows[0].costo);
                extrasAplicados.push('Paquete Exprés');
            }
        }

        // 6. Consolidar total
        const total_volumen_mxn = costo_volumen_usd * tipoCambio;
        const total_general_mxn = total_volumen_mxn + costo_extras_mxn;

        res.json({
            success: true,
            cotizacion: {
                medidas: {
                    largo: parseFloat(largo),
                    alto: parseFloat(alto),
                    ancho: parseFloat(ancho),
                    unidad: 'cm'
                },
                cbm: cbm.toFixed(4),
                nivel_aplicado: nivelAplicado,
                tipo_cobro: tipoCobroAplicado,
                costo_volumen_usd: costo_volumen_usd.toFixed(2),
                tipo_cambio: tipoCambio.toFixed(4),
                costo_volumen_mxn: total_volumen_mxn.toFixed(2),
                extras_mxn: costo_extras_mxn.toFixed(2),
                extras_aplicados: extrasAplicados,
                total_mxn: total_general_mxn.toFixed(2)
            }
        });

    } catch (error) {
        console.error('Error en cotización PO Box:', error);
        res.status(500).json({ error: 'Error al calcular cotización' });
    }
};

// ============================================
// CRUD TARIFAS DE VOLUMEN
// ============================================

export const getTarifasVolumen = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(
            'SELECT * FROM pobox_tarifas_volumen ORDER BY nivel ASC'
        );
        res.json({ tarifas: result.rows });
    } catch (error) {
        console.error('Error obteniendo tarifas:', error);
        res.status(500).json({ error: 'Error al obtener tarifas' });
    }
};

export const updateTarifaVolumen = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { cbm_min, cbm_max, costo, tipo_cobro, estado } = req.body;

        const result = await pool.query(
            `UPDATE pobox_tarifas_volumen 
             SET cbm_min = COALESCE($1, cbm_min),
                 cbm_max = $2,
                 costo = COALESCE($3, costo),
                 tipo_cobro = COALESCE($4, tipo_cobro),
                 estado = COALESCE($5, estado),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING *`,
            [cbm_min, cbm_max, costo, tipo_cobro, estado, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Tarifa no encontrada' });
            return;
        }

        res.json({ success: true, tarifa: result.rows[0] });
    } catch (error) {
        console.error('Error actualizando tarifa:', error);
        res.status(500).json({ error: 'Error al actualizar tarifa' });
    }
};

export const createTarifaVolumen = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nivel, cbm_min, cbm_max, costo, tipo_cobro, moneda } = req.body;

        const result = await pool.query(
            `INSERT INTO pobox_tarifas_volumen (nivel, cbm_min, cbm_max, costo, tipo_cobro, moneda)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [nivel, cbm_min, cbm_max, costo, tipo_cobro || 'fijo', moneda || 'USD']
        );

        res.json({ success: true, tarifa: result.rows[0] });
    } catch (error) {
        console.error('Error creando tarifa:', error);
        res.status(500).json({ error: 'Error al crear tarifa' });
    }
};

// ============================================
// CRUD SERVICIOS EXTRA
// ============================================

export const getServiciosExtra = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(
            'SELECT * FROM pobox_tarifas_extras ORDER BY nombre_servicio ASC'
        );
        res.json({ servicios: result.rows });
    } catch (error) {
        console.error('Error obteniendo servicios:', error);
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
};

export const updateServicioExtra = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { nombre_servicio, descripcion, costo, estado } = req.body;

        const result = await pool.query(
            `UPDATE pobox_tarifas_extras 
             SET nombre_servicio = COALESCE($1, nombre_servicio),
                 descripcion = COALESCE($2, descripcion),
                 costo = COALESCE($3, costo),
                 estado = COALESCE($4, estado),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [nombre_servicio, descripcion, costo, estado, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Servicio no encontrado' });
            return;
        }

        res.json({ success: true, servicio: result.rows[0] });
    } catch (error) {
        console.error('Error actualizando servicio:', error);
        res.status(500).json({ error: 'Error al actualizar servicio' });
    }
};

export const createServicioExtra = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nombre_servicio, descripcion, costo, moneda } = req.body;

        const result = await pool.query(
            `INSERT INTO pobox_tarifas_extras (nombre_servicio, descripcion, costo, moneda)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nombre_servicio, descripcion, costo, moneda || 'MXN']
        );

        res.json({ success: true, servicio: result.rows[0] });
    } catch (error) {
        console.error('Error creando servicio:', error);
        res.status(500).json({ error: 'Error al crear servicio' });
    }
};

// ============================================
// COSTING - PANEL DE COSTEO PO BOX
// Fórmula: Costo = (Volumen Ajustado / 10,780) × 75
// Volumen Ajustado = Largo × Alto × Ancho × 2.45
// ============================================

export const getCostingConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        // Buscar configuración activa
        const result = await pool.query(`
            SELECT * FROM pobox_costing_config 
            WHERE is_active = TRUE 
            ORDER BY updated_at DESC 
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            // Retornar configuración por defecto
            res.json({
                config: {
                    conversion_factor: 2.45,
                    dimensional_divisor: 10780,
                    base_rate: 75,
                    min_cost: 50,
                    currency: 'MXN',
                    is_active: true,
                }
            });
            return;
        }

        res.json({ config: result.rows[0] });
    } catch (error) {
        console.error('Error obteniendo configuración de costeo:', error);
        // Si la tabla no existe, retornar config por defecto
        res.json({
            config: {
                conversion_factor: 2.45,
                dimensional_divisor: 10780,
                base_rate: 75,
                min_cost: 50,
                currency: 'MXN',
                is_active: true,
            }
        });
    }
};

export const saveCostingConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversion_factor, dimensional_divisor, base_rate, min_cost, currency, is_active } = req.body;

        // Verificar si existe la tabla, si no, crearla
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pobox_costing_config (
                id SERIAL PRIMARY KEY,
                conversion_factor NUMERIC(8,4) NOT NULL DEFAULT 2.45,
                dimensional_divisor NUMERIC(12,2) NOT NULL DEFAULT 10780,
                base_rate NUMERIC(10,2) NOT NULL DEFAULT 75,
                min_cost NUMERIC(10,2) NOT NULL DEFAULT 50,
                currency VARCHAR(10) DEFAULT 'MXN',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Desactivar otras configuraciones
        await pool.query(`UPDATE pobox_costing_config SET is_active = FALSE`);

        // Insertar nueva configuración
        const result = await pool.query(`
            INSERT INTO pobox_costing_config (conversion_factor, dimensional_divisor, base_rate, min_cost, currency, is_active)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [conversion_factor, dimensional_divisor, base_rate, min_cost, currency || 'MXN', is_active !== false]);

        res.json({ success: true, config: result.rows[0] });
    } catch (error) {
        console.error('Error guardando configuración de costeo:', error);
        res.status(500).json({ error: 'Error al guardar configuración' });
    }
};

export const getCostingPackages = async (req: Request, res: Response): Promise<void> => {
    try {
        const { date_from, date_to, status, paid } = req.query;
        
        // Construir condiciones de filtro
        let dateFilter = '';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (date_from) {
            dateFilter += ` AND (p.received_at >= $${paramIndex} OR p.created_at >= $${paramIndex})`;
            params.push(date_from);
            paramIndex++;
        }
        if (date_to) {
            dateFilter += ` AND (p.received_at <= $${paramIndex} OR p.created_at <= $${paramIndex})`;
            params.push(date_to + ' 23:59:59');
            paramIndex++;
        }
        if (status) {
            dateFilter += ` AND p.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        if (paid === 'true') {
            dateFilter += ` AND p.costing_paid = TRUE`;
        } else if (paid === 'false') {
            dateFilter += ` AND (p.costing_paid IS NULL OR p.costing_paid = FALSE)`;
        }

        // Solo paquetes PO Box USA (service_type = 'POBOX_USA')
        // Nota: Las medidas de PO Box se guardan en pkg_length/pkg_width/pkg_height (no long_cm/width_cm/height_cm)
        const result = await pool.query(`
            SELECT 
                p.id,
                p.tracking_internal as tracking,
                p.tracking_provider as tracking_origin,
                COALESCE(p.pkg_length, 0) as pkg_length,
                COALESCE(p.pkg_width, 0) as pkg_width,
                COALESCE(p.pkg_height, 0) as pkg_height,
                COALESCE(p.weight, 0) as weight,
                p.status,
                p.warehouse_location,
                p.service_type,
                p.received_at,
                p.created_at,
                p.costing_paid,
                p.costing_paid_at,
                p.assigned_cost_mxn,
                COALESCE(p.pobox_service_cost, 0) as pobox_service_cost,
                COALESCE(p.pobox_cost_usd, 0) as pobox_cost_usd,
                COALESCE(p.registered_exchange_rate, 0) as registered_exchange_rate,
                u.full_name as user_name,
                u.box_id as client_box_id
            FROM packages p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.service_type = 'POBOX_USA'
            ${dateFilter}
            ORDER BY p.received_at DESC NULLS LAST, p.created_at DESC
            LIMIT 500
        `, params);

        console.log(`📦 PO Box USA Packages encontrados: ${result.rows.length}`);
        res.json({ packages: result.rows });
    } catch (error) {
        console.error('Error obteniendo paquetes para costeo:', error);
        res.status(500).json({ error: 'Error al obtener paquetes' });
    }
};

// Marcar paquetes como pagados
export const markPackagesAsPaid = async (req: Request, res: Response): Promise<void> => {
    try {
        const { package_ids, total_cost, payment_reference } = req.body;
        const user = (req as any).user;

        if (!package_ids || !Array.isArray(package_ids) || package_ids.length === 0) {
            res.status(400).json({ error: 'Se requiere un array de IDs de paquetes' });
            return;
        }

        // Actualizar paquetes como pagados
        const result = await pool.query(`
            UPDATE packages 
            SET costing_paid = TRUE,
                costing_paid_at = CURRENT_TIMESTAMP,
                costing_paid_by = $1,
                payment_reference = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ANY($3)
            RETURNING id, tracking_internal, assigned_cost_mxn
        `, [user.userId, payment_reference || null, package_ids]);

        // Registrar el pago en historial
        await pool.query(`
            INSERT INTO pobox_payment_history 
            (package_ids, total_cost, payment_reference, paid_by, paid_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        `, [JSON.stringify(package_ids), total_cost, payment_reference, user.userId]);

        console.log(`💰 ${result.rows.length} paquetes marcados como pagados`);
        res.json({ 
            success: true, 
            message: `${result.rows.length} paquetes marcados como pagados`,
            packages: result.rows,
            total_cost
        });
    } catch (error: any) {
        // Si la tabla de historial no existe, crearla
        if (error.code === '42P01') {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS pobox_payment_history (
                    id SERIAL PRIMARY KEY,
                    package_ids JSONB NOT NULL,
                    total_cost DECIMAL(12,2),
                    payment_reference VARCHAR(100),
                    paid_by INTEGER REFERENCES users(id),
                    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Reintentar
            return markPackagesAsPaid(req, res);
        }
        console.error('Error marcando paquetes como pagados:', error);
        res.status(500).json({ error: 'Error al marcar paquetes como pagados' });
    }
};

// Obtener historial de pagos
export const getPaymentHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { date_from, date_to } = req.query;
        
        let dateFilter = '';
        const params: any[] = [];
        
        if (date_from) {
            dateFilter += ' AND paid_at >= $1';
            params.push(date_from);
        }
        if (date_to) {
            dateFilter += ` AND paid_at <= $${params.length + 1}`;
            params.push(date_to + ' 23:59:59');
        }

        const result = await pool.query(`
            SELECT 
                ph.*,
                u.full_name as paid_by_name
            FROM pobox_payment_history ph
            LEFT JOIN users u ON ph.paid_by = u.id
            WHERE 1=1 ${dateFilter}
            ORDER BY ph.paid_at DESC
            LIMIT 100
        `, params);

        res.json({ history: result.rows });
    } catch (error) {
        console.error('Error obteniendo historial de pagos:', error);
        res.json({ history: [] });
    }
};

export const updatePackageCost = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { calculated_cost } = req.body;

        const result = await pool.query(`
            UPDATE packages 
            SET assigned_cost_mxn = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, assigned_cost_mxn
        `, [calculated_cost, id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Paquete no encontrado' });
            return;
        }

        res.json({ success: true, package: result.rows[0] });
    } catch (error) {
        console.error('Error actualizando costo del paquete:', error);
        res.status(500).json({ error: 'Error al actualizar costo' });
    }
};

// Obtener datos de utilidades (Guía, Cliente, Costo, Costo de Venta, Utilidad)
export const getUtilidadesData = async (req: Request, res: Response): Promise<void> => {
    try {
        const { date_from, date_to, payment_status } = req.query;
        
        // Construir condiciones de filtro
        let dateFilter = '';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (date_from) {
            dateFilter += ` AND (p.received_at >= $${paramIndex} OR p.created_at >= $${paramIndex})`;
            params.push(date_from);
            paramIndex++;
        }
        if (date_to) {
            dateFilter += ` AND (p.received_at <= $${paramIndex} OR p.created_at <= $${paramIndex})`;
            params.push(date_to + ' 23:59:59');
            paramIndex++;
        }
        if (payment_status === 'paid') {
            dateFilter += ` AND p.costing_paid = TRUE`;
        } else if (payment_status === 'unpaid') {
            dateFilter += ` AND (p.costing_paid IS NULL OR p.costing_paid = FALSE)`;
        }

        // Obtener paquetes con desglose de costos guardado
        const result = await pool.query(`
            SELECT 
                p.id,
                p.tracking_internal as tracking,
                p.tracking_provider as tracking_origin,
                COALESCE(p.assigned_cost_mxn, 0) as assigned_cost,
                COALESCE(p.pobox_service_cost, 0) as pobox_cost_saved,
                COALESCE(p.pobox_cost_usd, 0) as pobox_cost_usd,
                COALESCE(p.registered_exchange_rate, 0) as registered_exchange_rate,
                COALESCE(p.gex_insurance_cost, 0) as gex_insurance,
                COALESCE(p.gex_fixed_cost, 0) as gex_fixed,
                COALESCE(p.gex_total_cost, 0) as gex_total,
                COALESCE(p.national_shipping_cost, 0) as national_shipping,
                COALESCE(p.declared_value_mxn, 0) as declared_value_mxn,
                COALESCE(p.declared_value, 0) as declared_value,
                COALESCE(p.pkg_length, 0) as pkg_length,
                COALESCE(p.pkg_width, 0) as pkg_width,
                COALESCE(p.pkg_height, 0) as pkg_height,
                p.has_gex,
                p.costing_paid,
                p.client_paid,
                p.received_at,
                p.created_at,
                u.full_name as user_name,
                u.box_id as client_box_id,
                COALESCE(u.full_name, 'Sin asignar') as client_name
            FROM packages p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.service_type = 'POBOX_USA'
            ${dateFilter}
            ORDER BY p.received_at DESC NULLS LAST, p.created_at DESC
            LIMIT 1000
        `, params);

        // Obtener configuración de costeo para calcular el costo de paquetes antiguos (sin TC guardado)
        const configResult = await pool.query(`
            SELECT * FROM pobox_costing_config WHERE is_active = TRUE LIMIT 1
        `);
        
        // Obtener TC actual de la API (para paquetes sin TC guardado)
        const tcResult = await pool.query(`
            SELECT ultimo_tc_api FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE LIMIT 1
        `);
        const tcApiActual = parseFloat(tcResult.rows[0]?.ultimo_tc_api) || 17.65;
        
        const config = configResult.rows[0] || {
            conversion_factor: 2.54,
            dimensional_divisor: 10780,
            base_rate: 75,
            min_cost: 50
        };

        // Mapear resultados - usar costo guardado si existe, sino calcular
        const packagesWithPrices = result.rows.map((pkg: any) => {
            const length_cm = parseFloat(pkg.pkg_length) || 0;
            const width_cm = parseFloat(pkg.pkg_width) || 0;
            const height_cm = parseFloat(pkg.pkg_height) || 0;
            
            // TC guardado o actual
            const tcUsado = parseFloat(pkg.registered_exchange_rate) || tcApiActual;
            const poboxCostUsd = parseFloat(pkg.pobox_cost_usd) || 0;
            let poboxCostMxn = parseFloat(pkg.pobox_cost_saved) || 0;
            
            // Si no tiene costo guardado, calcularlo (paquetes antiguos)
            if (poboxCostMxn === 0 && length_cm > 0 && width_cm > 0 && height_cm > 0) {
                // Convertir cm a pulgadas (÷ 2.54)
                const length_pulg = length_cm / 2.54;
                const width_pulg = width_cm / 2.54;
                const height_pulg = height_cm / 2.54;
                
                // Volumen en pulgadas³
                const volumeAdjusted = length_pulg * width_pulg * height_pulg;
                
                // Pie³ = Volumen pulgadas / Divisor
                const pie3 = volumeAdjusted / parseFloat(config.dimensional_divisor);
                
                // Costo USD = Pie³ × Tarifa Base
                const costUSD = pie3 * parseFloat(config.base_rate);
                
                // Costo MXN = USD × TC actual
                poboxCostMxn = Math.max(costUSD * tcApiActual, parseFloat(config.min_cost));
            }
            
            // Valores guardados
            const gexTotal = parseFloat(pkg.gex_total) || 0;
            const assignedCost = parseFloat(pkg.assigned_cost) || 0;
            
            return {
                ...pkg,
                // Costo guardado o calculado
                calculated_cost: poboxCostMxn.toFixed(2),
                pobox_cost_usd: poboxCostUsd.toFixed(2),
                tc_registro: tcUsado.toFixed(4),
                // Desglose guardado
                pobox_cost: poboxCostMxn.toFixed(2),
                gex_insurance: parseFloat(pkg.gex_insurance || 0).toFixed(2),
                gex_fixed: parseFloat(pkg.gex_fixed || 0).toFixed(2),
                gex_total: gexTotal.toFixed(2),
                // Envío nacional (paquetería)
                national_shipping: parseFloat(pkg.national_shipping || 0).toFixed(2),
                // Costo de venta (assigned_cost_mxn)
                sale_price: assignedCost.toFixed(2)
            };
        });

        console.log(`💵 Utilidades: ${packagesWithPrices.length} paquetes encontrados`);
        res.json({ packages: packagesWithPrices, tcActual: tcApiActual });
    } catch (error) {
        console.error('Error obteniendo datos de utilidades:', error);
        res.status(500).json({ error: 'Error al obtener datos de utilidades' });
    }
};
