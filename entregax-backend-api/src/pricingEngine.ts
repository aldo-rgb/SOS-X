// ============================================
// MOTOR DE CÁLCULO DE PRECIOS (PRICING ENGINE)
// Soporta: Peso/Volumétrico, CBM, Por Unidad, Por Tarima
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// INTERFACES
// ============================================

interface QuoteRequest {
    serviceCode: string;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    quantity: number;
    userId: number;
    declaredValue?: number;
}

interface QuoteResult {
    service: string;
    serviceName: string;
    calculationType: string;
    usd: string;
    mxn: string;
    fxRate: number;
    chargeableUnits: number;
    unitLabel: string;
    breakdown: string;
    priceList: string;
}

// ============================================
// HELPERS DE CÁLCULO
// ============================================

// Peso Volumétrico (Estándar IATA: L*W*H / 5000)
const getVolumetricWeight = (l = 0, w = 0, h = 0): number => {
    return (l * w * h) / 5000;
};

// Metros Cúbicos (CBM)
const getCBM = (l = 0, w = 0, h = 0): number => {
    return (l * w * h) / 1000000;
};

// ============================================
// FUNCIÓN PRINCIPAL DE COTIZACIÓN
// ============================================

export const calculateQuote = async (req: QuoteRequest): Promise<QuoteResult> => {
    // 1. OBTENER TIPO DE CAMBIO ACTUAL
    const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
    const fxRate = parseFloat(fxRes.rows[0]?.rate || '20.00');

    // 2. OBTENER INFO DEL SERVICIO
    const serviceRes = await pool.query(
        'SELECT id, code, name, calculation_type FROM logistics_services WHERE code = $1 AND is_active = TRUE',
        [req.serviceCode]
    );
    
    if (serviceRes.rows.length === 0) {
        throw new Error(`Servicio "${req.serviceCode}" no encontrado o inactivo`);
    }
    
    const service = serviceRes.rows[0];

    // 3. IDENTIFICAR LISTA DE PRECIOS DEL CLIENTE
    const userRes = await pool.query(
        'SELECT assigned_price_list_id FROM users WHERE id = $1',
        [req.userId]
    );
    let priceListId = userRes.rows[0]?.assigned_price_list_id;

    // Si no tiene lista asignada, usar la default (pública)
    if (!priceListId) {
        const defaultList = await pool.query('SELECT id FROM price_lists WHERE is_default = TRUE LIMIT 1');
        priceListId = defaultList.rows[0]?.id || 1;
    }

    // Obtener nombre de la lista
    const listRes = await pool.query('SELECT name FROM price_lists WHERE id = $1', [priceListId]);
    const priceListName = listRes.rows[0]?.name || 'Tarifa Pública';

    // 4. CALCULAR SEGÚN TIPO DE SERVICIO
    let finalCostUSD = 0;
    let chargeableUnits = 0;
    let unitLabel = '';
    let breakdown = '';

    switch (service.calculation_type) {
        
        // --- AÉREO / NACIONAL: Peso vs Volumétrico ---
        case 'weight_vol': {
            const volWeight = getVolumetricWeight(req.lengthCm, req.widthCm, req.heightCm);
            const realWeight = req.weightKg || 0;
            chargeableUnits = Math.max(volWeight, realWeight);
            unitLabel = 'kg';

            // Multiplicar por cantidad si hay múltiples piezas
            chargeableUnits *= (req.quantity || 1);

            const rule = await pool.query(`
                SELECT unit_cost, fixed_fee FROM pricing_rules 
                WHERE price_list_id = $1 AND service_id = $2
                AND $3 >= min_unit AND $3 <= max_unit
                ORDER BY min_unit ASC LIMIT 1
            `, [priceListId, service.id, chargeableUnits]);

            if (rule.rows.length === 0) {
                throw new Error(`No hay tarifa configurada para ${chargeableUnits.toFixed(2)} kg`);
            }

            const { unit_cost, fixed_fee } = rule.rows[0];
            finalCostUSD = (chargeableUnits * parseFloat(unit_cost)) + parseFloat(fixed_fee);
            
            const usedVol = volWeight > realWeight;
            breakdown = `${usedVol ? 'Volumétrico' : 'Real'}: ${chargeableUnits.toFixed(2)} kg × $${unit_cost}/kg + $${fixed_fee} banderazo`;
            break;
        }

        // --- MARÍTIMO: Por CBM ---
        case 'cbm': {
            chargeableUnits = getCBM(req.lengthCm, req.widthCm, req.heightCm);
            chargeableUnits *= (req.quantity || 1);
            
            // Mínimo 1 CBM usualmente
            if (chargeableUnits < 1) chargeableUnits = 1;
            unitLabel = 'm³';

            const rule = await pool.query(`
                SELECT unit_cost, fixed_fee FROM pricing_rules 
                WHERE price_list_id = $1 AND service_id = $2
                AND $3 >= min_unit AND $3 <= max_unit
                ORDER BY min_unit ASC LIMIT 1
            `, [priceListId, service.id, chargeableUnits]);

            if (rule.rows.length === 0) {
                throw new Error(`No hay tarifa configurada para ${chargeableUnits.toFixed(2)} CBM`);
            }

            const { unit_cost, fixed_fee } = rule.rows[0];
            finalCostUSD = (chargeableUnits * parseFloat(unit_cost)) + parseFloat(fixed_fee);
            breakdown = `Volumen: ${chargeableUnits.toFixed(2)} m³ × $${unit_cost}/m³ + $${fixed_fee} manejo`;
            break;
        }

        // --- PO BOX / AA DHL: Por Unidad (Bulto/Caja) ---
        case 'per_unit': {
            chargeableUnits = req.quantity || 1;
            unitLabel = 'bultos';

            const rule = await pool.query(`
                SELECT unit_cost, fixed_fee FROM pricing_rules 
                WHERE price_list_id = $1 AND service_id = $2
                AND $3 >= min_unit AND $3 <= max_unit
                ORDER BY min_unit ASC LIMIT 1
            `, [priceListId, service.id, chargeableUnits]);

            if (rule.rows.length === 0) {
                throw new Error(`No hay tarifa configurada para ${chargeableUnits} bultos`);
            }

            const { unit_cost, fixed_fee } = rule.rows[0];
            finalCostUSD = (chargeableUnits * parseFloat(unit_cost)) + parseFloat(fixed_fee);
            breakdown = `${chargeableUnits} bultos × $${unit_cost} c/u`;
            break;
        }

        // --- Por Tarima ---
        case 'per_pallet': {
            chargeableUnits = req.quantity || 1;
            unitLabel = 'tarimas';

            const rule = await pool.query(`
                SELECT unit_cost, fixed_fee FROM pricing_rules 
                WHERE price_list_id = $1 AND service_id = $2
                AND item_type = 'pallet'
                ORDER BY min_unit ASC LIMIT 1
            `, [priceListId, service.id]);

            if (rule.rows.length === 0) {
                throw new Error('No hay tarifa configurada para tarimas');
            }

            const { unit_cost, fixed_fee } = rule.rows[0];
            finalCostUSD = (chargeableUnits * parseFloat(unit_cost)) + parseFloat(fixed_fee);
            breakdown = `${chargeableUnits} tarimas × $${unit_cost} c/u`;
            break;
        }

        default:
            throw new Error(`Tipo de cálculo "${service.calculation_type}" no soportado`);
    }

    // 5. CONVERTIR A MXN
    const finalCostMXN = finalCostUSD * fxRate;

    return {
        service: service.code,
        serviceName: service.name,
        calculationType: service.calculation_type,
        usd: finalCostUSD.toFixed(2),
        mxn: finalCostMXN.toFixed(2),
        fxRate,
        chargeableUnits: parseFloat(chargeableUnits.toFixed(2)),
        unitLabel,
        breakdown,
        priceList: priceListName
    };
};

// ============================================
// ENDPOINTS DEL CONTROLADOR
// ============================================

// GET /api/logistics/services - Lista de servicios
export const getLogisticsServices = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT 
                ls.*,
                fe.alias as fiscal_emitter_name,
                fe.business_name as fiscal_business_name,
                fe.rfc as fiscal_rfc
            FROM logistics_services ls
            LEFT JOIN fiscal_emitters fe ON ls.fiscal_emitter_id = fe.id
            ORDER BY ls.id ASC
        `);
        res.json({ success: true, services: result.rows });
    } catch (error) {
        console.error('Error getting logistics services:', error);
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
};

// PUT /api/admin/logistics-services/:id - Actualizar servicio
export const updateLogisticsService = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { 
            name, 
            fiscal_emitter_id, 
            warehouse_address, 
            warehouse_contact, 
            warehouse_phone,
            warehouse_email,
            icon,
            is_active
        } = req.body;
        
        const result = await pool.query(`
            UPDATE logistics_services SET
                name = COALESCE($1, name),
                fiscal_emitter_id = $2,
                warehouse_address = $3,
                warehouse_contact = $4,
                warehouse_phone = $5,
                warehouse_email = $6,
                icon = COALESCE($7, icon),
                is_active = COALESCE($8, is_active)
            WHERE id = $9
            RETURNING *
        `, [name, fiscal_emitter_id, warehouse_address, warehouse_contact, warehouse_phone, warehouse_email, icon, is_active, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }
        
        res.json({ success: true, service: result.rows[0], message: 'Servicio actualizado correctamente' });
    } catch (error) {
        console.error('Error updating logistics service:', error);
        res.status(500).json({ error: 'Error al actualizar servicio' });
    }
};

// POST /api/quotes/calculate - Calcular cotización
export const calculateQuoteEndpoint = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceCode, weightKg, lengthCm, widthCm, heightCm, quantity, userId } = req.body;

        if (!serviceCode || !userId) {
            return res.status(400).json({ error: 'serviceCode y userId son requeridos' });
        }

        const result = await calculateQuote({
            serviceCode,
            weightKg: parseFloat(weightKg) || 0,
            lengthCm: parseFloat(lengthCm) || 0,
            widthCm: parseFloat(widthCm) || 0,
            heightCm: parseFloat(heightCm) || 0,
            quantity: parseInt(quantity) || 1,
            userId: parseInt(userId)
        });

        res.json(result);
    } catch (error: any) {
        console.error('Error calculating quote:', error);
        res.status(400).json({ error: error.message || 'Error al calcular cotización' });
    }
};

// ============================================
// ADMIN: GESTIÓN DE LISTAS DE PRECIOS
// ============================================

// GET /api/admin/price-lists
export const getPriceLists = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT pl.*, 
                   (SELECT COUNT(*) FROM pricing_rules WHERE price_list_id = pl.id) as rules_count,
                   (SELECT COUNT(*) FROM users WHERE assigned_price_list_id = pl.id) as clients_count
            FROM price_lists pl 
            ORDER BY pl.is_default DESC, pl.name
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting price lists:', error);
        res.status(500).json({ error: 'Error al obtener listas de precios' });
    }
};

// POST /api/admin/price-lists
export const createPriceList = async (req: Request, res: Response): Promise<any> => {
    try {
        const { name, description, is_default } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nombre es requerido' });
        }

        // Si esta será default, quitar default de las demás
        if (is_default) {
            await pool.query('UPDATE price_lists SET is_default = FALSE');
        }

        const result = await pool.query(
            'INSERT INTO price_lists (name, description, is_default) VALUES ($1, $2, $3) RETURNING *',
            [name, description || '', is_default || false]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating price list:', error);
        res.status(500).json({ error: 'Error al crear lista de precios' });
    }
};

// DELETE /api/admin/price-lists/:id
export const deletePriceList = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;

        // Verificar que no sea la default
        const check = await pool.query('SELECT is_default FROM price_lists WHERE id = $1', [id]);
        if (check.rows[0]?.is_default) {
            return res.status(400).json({ error: 'No se puede eliminar la lista por defecto' });
        }

        // Quitar asignaciones de usuarios
        await pool.query('UPDATE users SET assigned_price_list_id = NULL WHERE assigned_price_list_id = $1', [id]);

        await pool.query('DELETE FROM price_lists WHERE id = $1', [id]);
        res.json({ message: 'Lista eliminada' });
    } catch (error) {
        console.error('Error deleting price list:', error);
        res.status(500).json({ error: 'Error al eliminar lista' });
    }
};

// ============================================
// ADMIN: GESTIÓN DE REGLAS DE PRECIO
// ============================================

// GET /api/admin/pricing-rules/:priceListId
export const getPricingRules = async (req: Request, res: Response): Promise<any> => {
    try {
        const { priceListId } = req.params;

        const result = await pool.query(`
            SELECT pr.*, ls.code as service_code, ls.name as service_name, ls.calculation_type
            FROM pricing_rules pr
            JOIN logistics_services ls ON pr.service_id = ls.id
            WHERE pr.price_list_id = $1
            ORDER BY ls.id, pr.min_unit
        `, [priceListId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error getting pricing rules:', error);
        res.status(500).json({ error: 'Error al obtener reglas' });
    }
};

// POST /api/admin/pricing-rules
export const createPricingRule = async (req: Request, res: Response): Promise<any> => {
    try {
        const { price_list_id, service_id, min_unit, max_unit, unit_cost, fixed_fee, item_type } = req.body;

        if (!price_list_id || !service_id || unit_cost === undefined) {
            return res.status(400).json({ error: 'price_list_id, service_id y unit_cost son requeridos' });
        }

        const result = await pool.query(`
            INSERT INTO pricing_rules (price_list_id, service_id, min_unit, max_unit, unit_cost, fixed_fee, item_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [
            price_list_id,
            service_id,
            min_unit || 0,
            max_unit || 999999,
            unit_cost,
            fixed_fee || 0,
            item_type || null
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        console.error('Error creating pricing rule:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ya existe una regla con ese rango para este servicio' });
        }
        res.status(500).json({ error: 'Error al crear regla' });
    }
};

// PUT /api/admin/pricing-rules/:id
export const updatePricingRule = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { min_unit, max_unit, unit_cost, fixed_fee } = req.body;

        const result = await pool.query(`
            UPDATE pricing_rules 
            SET min_unit = $1, max_unit = $2, unit_cost = $3, fixed_fee = $4
            WHERE id = $5 RETURNING *
        `, [min_unit, max_unit, unit_cost, fixed_fee || 0, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Regla no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating pricing rule:', error);
        res.status(500).json({ error: 'Error al actualizar regla' });
    }
};

// DELETE /api/admin/pricing-rules/:id
export const deletePricingRule = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM pricing_rules WHERE id = $1', [id]);
        res.json({ message: 'Regla eliminada' });
    } catch (error) {
        console.error('Error deleting pricing rule:', error);
        res.status(500).json({ error: 'Error al eliminar regla' });
    }
};

// ============================================
// ADMIN: GESTIÓN DE SERVICIOS LOGÍSTICOS
// ============================================

// POST /api/admin/logistics-services
export const createLogisticsService = async (req: Request, res: Response): Promise<any> => {
    try {
        const { code, name, calculation_type, requires_dimensions } = req.body;

        if (!code || !name || !calculation_type) {
            return res.status(400).json({ error: 'code, name y calculation_type son requeridos' });
        }

        const result = await pool.query(`
            INSERT INTO logistics_services (code, name, calculation_type, requires_dimensions)
            VALUES ($1, $2, $3, $4) RETURNING *
        `, [code.toUpperCase(), name, calculation_type, requires_dimensions !== false]);

        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        console.error('Error creating logistics service:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ya existe un servicio con ese código' });
        }
        res.status(500).json({ error: 'Error al crear servicio' });
    }
};

// ============================================
// ASIGNAR LISTA DE PRECIOS A CLIENTE
// ============================================

export const assignPriceListToUser = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId } = req.params;
        const { priceListId } = req.body;

        const result = await pool.query(
            'UPDATE users SET assigned_price_list_id = $1 WHERE id = $2 RETURNING id, full_name, assigned_price_list_id',
            [priceListId || null, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ message: 'Lista asignada', user: result.rows[0] });
    } catch (error) {
        console.error('Error assigning price list:', error);
        res.status(500).json({ error: 'Error al asignar lista' });
    }
};
