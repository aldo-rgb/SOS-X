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

// ============================================
// MOTOR DE TARIFAS MARÍTIMO CHINA-MÉXICO
// Sistema con categorías, rangos y precios VIP
// ============================================

/**
 * Calcula el costo de envío marítimo basado en las reglas de negocio:
 * 1. Compara CBM físico vs peso volumétrico (÷600) y toma el mayor
 * 2. Si es ≤0.75 CBM → Tarifa StartUp (precio fijo)
 * 3. Si es 0.76-0.99 CBM → Redondea a 1 CBM
 * 4. Aplica recargo de Logotipo si corresponde
 * 5. VIP obtiene tarifa más baja automáticamente
 */
export const calculateMaritimeShippingCost = async (
    userId: number,
    lengthCm: number,
    widthCm: number,
    heightCm: number,
    weightKg: number,
    categoryName: string = 'Generico'
): Promise<{
    physicalCbm: string;
    volumetricCbm: string;
    chargeableCbm: string;
    originalCategory: string;
    appliedCategory: string;
    appliedRate: string;
    surchargeApplied: number;
    isVipApplied: boolean;
    isFlatFee: boolean;
    finalPriceUsd: string;
    breakdown: string;
}> => {
    // 1. REGLA DE ORO: CÁLCULO DE CBM vs PESO VOLUMÉTRICO
    const physicalCbm = (lengthCm * widthCm * heightCm) / 1000000;
    const volumetricCbm = weightKg / 600; // Factor marítimo
    
    // Tomamos el MAYOR de los dos para proteger el margen
    let chargeableCbm = Math.max(physicalCbm, volumetricCbm);
    const originalCategory = categoryName;
    let appliedCategory = categoryName;

    // 2. REGLA START-UP (Ligeros) vs REDONDEO
    if (chargeableCbm <= 0.75) {
        // Entra a la tabla StartUp
        appliedCategory = 'StartUp';
    } else if (chargeableCbm >= 0.76 && chargeableCbm < 1) {
        // Se redondea a 1 CBM tarifa estándar
        chargeableCbm = 1;
    }

    // 3. CONSULTAR BASE DE DATOS PARA OBTENER CATEGORÍA
    // Para Logotipo usamos la tarifa base de Genérico + surcharge
    const baseCategoryForQuery = appliedCategory === 'Logotipo' ? 'Generico' : appliedCategory;
    
    const catRes = await pool.query(
        'SELECT id, surcharge_per_cbm FROM pricing_categories WHERE name = $1',
        [baseCategoryForQuery]
    );
    
    if (catRes.rows.length === 0) {
        throw new Error(`Categoría "${appliedCategory}" no encontrada`);
    }
    
    const categoryId = catRes.rows[0].id;
    
    // Surcharge de $100 por CBM para Logotipo
    const surcharge = originalCategory === 'Logotipo' ? 100 : 0;

    // 4. ¿ES CLIENTE VIP?
    const userRes = await pool.query('SELECT is_vip_pricing FROM users WHERE id = $1', [userId]);
    const isVip = userRes.rows[0]?.is_vip_pricing === true;

    let tierQuery: string;
    let queryParams: any[];

    if (isVip && appliedCategory !== 'StartUp') {
        // REGLA VIP: Obtener el precio más barato de esa categoría sin importar el volumen
        tierQuery = `
            SELECT * FROM pricing_tiers 
            WHERE category_id = $1 AND is_active = TRUE
            ORDER BY price ASC LIMIT 1
        `;
        queryParams = [categoryId];
    } else {
        // REGLA NORMAL: Buscar el rango en el que cae el CBM
        tierQuery = `
            SELECT * FROM pricing_tiers 
            WHERE category_id = $1 AND is_active = TRUE
            AND $2 >= min_cbm AND $2 <= max_cbm
        `;
        queryParams = [categoryId, chargeableCbm];
    }

    const tierRes = await pool.query(tierQuery, queryParams);
    
    if (tierRes.rows.length === 0) {
        throw new Error(`Volumen ${chargeableCbm.toFixed(2)} CBM fuera de rango o tabla de precios incompleta para ${appliedCategory}`);
    }

    const tier = tierRes.rows[0];

    // 5. CÁLCULO FINAL (Matemática pura)
    let finalPriceUsd = 0;
    let breakdown = '';

    if (tier.is_flat_fee) {
        // Si es Start Up, es un precio cerrado ($399, $549, etc.)
        finalPriceUsd = parseFloat(tier.price);
        breakdown = `Tarifa Plana StartUp: $${tier.price} USD`;
    } else {
        // Si es LCL estándar, multiplicamos el CBM cobrable por la tarifa + el recargo de Logo
        const ratePerCbm = parseFloat(tier.price) + surcharge;
        finalPriceUsd = chargeableCbm * ratePerCbm;
        
        if (surcharge > 0) {
            breakdown = `${chargeableCbm.toFixed(2)} m³ × ($${tier.price} + $${surcharge} logo) = $${finalPriceUsd.toFixed(2)} USD`;
        } else {
            breakdown = `${chargeableCbm.toFixed(2)} m³ × $${tier.price}/m³ = $${finalPriceUsd.toFixed(2)} USD`;
        }
        
        if (isVip) {
            breakdown += ' (Tarifa VIP aplicada)';
        }
    }

    return {
        physicalCbm: physicalCbm.toFixed(4),
        volumetricCbm: volumetricCbm.toFixed(4),
        chargeableCbm: chargeableCbm.toFixed(3),
        originalCategory,
        appliedCategory,
        appliedRate: tier.price,
        surchargeApplied: surcharge,
        isVipApplied: isVip,
        isFlatFee: tier.is_flat_fee,
        finalPriceUsd: finalPriceUsd.toFixed(2),
        breakdown
    };
};

// ============================================
// API ENDPOINTS PARA TARIFAS MARÍTIMAS
// ============================================

// GET /api/admin/pricing-categories - Obtener todas las categorías
export const getPricingCategories = async (_req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT pc.*, 
                   (SELECT COUNT(*) FROM pricing_tiers pt WHERE pt.category_id = pc.id) as tier_count
            FROM pricing_categories pc 
            ORDER BY pc.id
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching pricing categories:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
};

// GET /api/admin/pricing-tiers - Obtener todas las tarifas con categoría
export const getPricingTiers = async (_req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT pt.*, pc.name as category_name, pc.surcharge_per_cbm
            FROM pricing_tiers pt
            JOIN pricing_categories pc ON pt.category_id = pc.id
            ORDER BY pc.id, pt.min_cbm
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching pricing tiers:', error);
        res.status(500).json({ error: 'Error al obtener tarifas' });
    }
};

// PUT /api/admin/pricing-tiers - Actualizar múltiples tarifas
export const updatePricingTiers = async (req: Request, res: Response): Promise<any> => {
    try {
        const { tiers } = req.body;

        if (!Array.isArray(tiers)) {
            return res.status(400).json({ error: 'Se esperaba un array de tarifas' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const tier of tiers) {
                await client.query(`
                    UPDATE pricing_tiers 
                    SET price = $1, min_cbm = $2, max_cbm = $3, is_flat_fee = $4, 
                        notes = $5, is_active = $6, updated_at = NOW()
                    WHERE id = $7
                `, [tier.price, tier.min_cbm, tier.max_cbm, tier.is_flat_fee, tier.notes, tier.is_active !== false, tier.id]);
            }

            await client.query('COMMIT');
            res.json({ message: 'Tarifas actualizadas correctamente', count: tiers.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error updating pricing tiers:', error);
        res.status(500).json({ error: 'Error al actualizar tarifas' });
    }
};

// POST /api/admin/pricing-tiers - Crear nueva tarifa
export const createPricingTier = async (req: Request, res: Response): Promise<any> => {
    try {
        const { category_id, min_cbm, max_cbm, price, is_flat_fee, notes } = req.body;

        if (!category_id || min_cbm === undefined || max_cbm === undefined || !price) {
            return res.status(400).json({ error: 'category_id, min_cbm, max_cbm y price son requeridos' });
        }

        const result = await pool.query(`
            INSERT INTO pricing_tiers (category_id, min_cbm, max_cbm, price, is_flat_fee, notes)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [category_id, min_cbm, max_cbm, price, is_flat_fee || false, notes]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating pricing tier:', error);
        res.status(500).json({ error: 'Error al crear tarifa' });
    }
};

// DELETE /api/admin/pricing-tiers/:id - Eliminar tarifa
export const deletePricingTier = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM pricing_tiers WHERE id = $1', [id]);
        res.json({ message: 'Tarifa eliminada' });
    } catch (error) {
        console.error('Error deleting pricing tier:', error);
        res.status(500).json({ error: 'Error al eliminar tarifa' });
    }
};

// POST /api/admin/pricing-categories - Crear categoría
export const createPricingCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { name, surcharge_per_cbm, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'name es requerido' });
        }

        const result = await pool.query(`
            INSERT INTO pricing_categories (name, surcharge_per_cbm, description)
            VALUES ($1, $2, $3) RETURNING *
        `, [name, surcharge_per_cbm || 0, description]);

        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        console.error('Error creating pricing category:', error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
        }
        res.status(500).json({ error: 'Error al crear categoría' });
    }
};

// PUT /api/admin/pricing-categories/:id - Actualizar categoría
export const updatePricingCategory = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { name, surcharge_per_cbm, description, is_active } = req.body;

        const result = await pool.query(`
            UPDATE pricing_categories 
            SET name = COALESCE($1, name), 
                surcharge_per_cbm = COALESCE($2, surcharge_per_cbm),
                description = COALESCE($3, description),
                is_active = COALESCE($4, is_active)
            WHERE id = $5 RETURNING *
        `, [name, surcharge_per_cbm, description, is_active, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Categoría no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating pricing category:', error);
        res.status(500).json({ error: 'Error al actualizar categoría' });
    }
};

// POST /api/maritime/calculate - Calcular costo de envío marítimo
export const calculateMaritimeCost = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, lengthCm, widthCm, heightCm, weightKg, category } = req.body;

        if (!lengthCm || !widthCm || !heightCm || !weightKg) {
            return res.status(400).json({ error: 'Dimensiones y peso son requeridos' });
        }

        const result = await calculateMaritimeShippingCost(
            userId || 0,
            parseFloat(lengthCm),
            parseFloat(widthCm),
            parseFloat(heightCm),
            parseFloat(weightKg),
            category || 'Generico'
        );

        res.json(result);
    } catch (error: any) {
        console.error('Error calculating maritime cost:', error);
        res.status(500).json({ error: error.message || 'Error al calcular costo' });
    }
};

// PUT /api/admin/users/:id/vip - Toggle VIP pricing
export const toggleUserVipPricing = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { is_vip_pricing } = req.body;

        const result = await pool.query(`
            UPDATE users SET is_vip_pricing = $1 WHERE id = $2 
            RETURNING id, full_name, email, is_vip_pricing
        `, [is_vip_pricing === true, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ message: is_vip_pricing ? 'Precio VIP activado' : 'Precio VIP desactivado', user: result.rows[0] });
    } catch (error) {
        console.error('Error toggling VIP pricing:', error);
        res.status(500).json({ error: 'Error al actualizar estado VIP' });
    }
};
