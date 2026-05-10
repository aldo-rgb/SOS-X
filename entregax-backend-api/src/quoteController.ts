/**
 * Cotizador unificado para clientes (mobile app).
 *
 * Expone dos endpoints "faltantes":
 *   - POST /api/quotes/pobox       — PO Box USA → MTY
 *   - POST /api/quotes/air-china   — TDI Aéreo China → MX
 *
 * Garantía Extendida (GEX) se calcula en el cliente con la fórmula
 * canónica `valor_declarado_mxn × 0.05 + 625` (ver packageController.ts:576).
 * Estos endpoints aceptan los flags `includeGex` / `declaredValueMxn`
 * para devolver el desglose completo y evitar que el mobile reimplemente
 * la fórmula. El cargo fijo y la tasa quedan centralizados aquí.
 */

import { Request, Response } from 'express';
import { pool } from './db';
import { calculatePOBoxCost } from './packageController';

// ============================================
// CONSTANTES GEX (canónicas — viven aquí y en
// packageController.ts donde se cobra al consolidar).
// ============================================
export const GEX_INSURANCE_RATE = 0.05;   // 5% del valor asegurado
export const GEX_FIXED_MXN = 625;         // cuota fija por póliza

export const computeGex = (
    declaredValueMxn: number | undefined,
    includeGex: boolean | undefined
): { gexInsuranceCost: number; gexFixedCost: number; gexTotalCost: number; declaredValueMxn: number } => {
    const dv = Number(declaredValueMxn) || 0;
    if (!includeGex || dv <= 0) {
        return { gexInsuranceCost: 0, gexFixedCost: 0, gexTotalCost: 0, declaredValueMxn: dv };
    }
    const insurance = +(dv * GEX_INSURANCE_RATE).toFixed(2);
    const total = +(insurance + GEX_FIXED_MXN).toFixed(2);
    return {
        gexInsuranceCost: insurance,
        gexFixedCost: GEX_FIXED_MXN,
        gexTotalCost: total,
        declaredValueMxn: dv,
    };
};

// ============================================
// POST /api/quotes/pobox
// Body: { weightKg, lengthCm, widthCm, heightCm, quantity?, declaredValueMxn?, includeGex? }
// ============================================
export const quotePOBox = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            weightKg, lengthCm, widthCm, heightCm,
            quantity = 1, declaredValueMxn, includeGex = false,
        } = req.body || {};

        const w = Number(weightKg) || 0;
        const l = Number(lengthCm) || 0;
        const wd = Number(widthCm) || 0;
        const h = Number(heightCm) || 0;
        const qty = Math.max(1, parseInt(String(quantity)) || 1);

        if (l <= 0 || wd <= 0 || h <= 0) {
            return res.status(400).json({ error: 'Dimensiones (lengthCm, widthCm, heightCm) son requeridas y mayores a 0' });
        }

        // calculatePOBoxCost recibe N cajas individuales y suma precios por
        // caja (no CBM combinado), respetando los niveles de pobox_tarifas_volumen.
        const boxes = Array.from({ length: qty }, () => ({ weight: w, length: l, width: wd, height: h }));
        const result = await calculatePOBoxCost(pool, boxes);

        const gex = computeGex(declaredValueMxn, includeGex);
        const totalMxn = +(result.precioVentaMxn || 0) + gex.gexTotalCost;

        return res.json({
            service: 'pobox_usa',
            serviceName: 'PO Box USA',
            cbm: result.cbm,
            cantidadCajas: result.cantidadCajas || qty,
            tcFinal: result.tcFinal || result.registeredExchangeRate,
            precioVentaUsd: result.precioVentaUsd,
            precioVentaMxn: result.precioVentaMxn,
            nivelTarifa: result.nivelTarifa,
            desglosePorCaja: result.desglosePorCaja,
            gex,
            totalMxn,
        });
    } catch (error: any) {
        console.error('Error en quotePOBox:', error);
        return res.status(500).json({ error: error.message || 'Error al cotizar PO Box' });
    }
};

// ============================================
// POST /api/quotes/air-china
// Body: { weightKg, lengthCm, widthCm, heightCm, tariffType?, declaredValueMxn?, includeGex? }
//   tariffType: 'L' (Logo) | 'G' (Generico) | 'S' (Sensible) | 'F' (Flat)
// Replica la lógica de chinaController.ts:170-241 (StartUp por tramos
// de peso ≤15kg → tarifa por kg desde air_client_tariffs o air_tariffs).
// ============================================
export const quoteAirChina = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            weightKg, lengthCm = 0, widthCm = 0, heightCm = 0,
            tariffType = 'G', declaredValueMxn, includeGex = false,
        } = req.body || {};

        const userId = (req as any).user?.id;
        const realKg = Number(weightKg) || 0;
        const l = Number(lengthCm) || 0;
        const wd = Number(widthCm) || 0;
        const h = Number(heightCm) || 0;

        if (realKg <= 0) {
            return res.status(400).json({ error: 'weightKg es requerido y mayor a 0' });
        }

        // Peso volumétrico IATA: (L*W*H)/5000. Si no dan dimensiones,
        // queda 0 y se usa peso real.
        const volKg = (l * wd * h) / 5000;
        const chargeableKg = Math.max(realKg, volKg);

        // 1. Ruta activa
        const routeRes = await pool.query(`SELECT id FROM air_routes WHERE is_active = true LIMIT 1`);
        const airRouteId = routeRes.rows.length > 0 ? routeRes.rows[0].id : null;
        if (!airRouteId) {
            return res.status(503).json({ error: 'No hay ruta aérea activa configurada' });
        }

        // 2. ¿Aplica StartUp? (precio plano por tramo de peso, ≤15kg)
        let pricePerKg = 0;
        let salePriceUsd = 0;
        let isStartup = false;
        let appliedTariffType = String(tariffType || 'G').toUpperCase();
        let isCustomTariff = false;

        if (realKg > 0 && realKg <= 15) {
            const startupRes = await pool.query(
                `SELECT price_usd FROM air_startup_tiers
                 WHERE route_id = $1 AND is_active = true AND $2 >= min_weight AND $2 <= max_weight
                 LIMIT 1`,
                [airRouteId, realKg]
            );
            if (startupRes.rows.length > 0) {
                salePriceUsd = parseFloat(startupRes.rows[0].price_usd);
                pricePerKg = realKg > 0 ? salePriceUsd / realKg : 0;
                isStartup = true;
                appliedTariffType = 'SU';
            }
        }

        // 3. Si no es StartUp, buscar tarifa por kg (custom del cliente → general)
        if (!isStartup) {
            if (userId) {
                const customRes = await pool.query(
                    `SELECT price_per_kg FROM air_client_tariffs
                     WHERE user_id = $1 AND route_id = $2 AND tariff_type = $3 AND is_active = true
                     LIMIT 1`,
                    [userId, airRouteId, appliedTariffType]
                );
                if (customRes.rows.length > 0) {
                    pricePerKg = parseFloat(customRes.rows[0].price_per_kg);
                    isCustomTariff = true;
                }
            }
            if (pricePerKg === 0) {
                const generalRes = await pool.query(
                    `SELECT price_per_kg FROM air_tariffs
                     WHERE route_id = $1 AND tariff_type = $2 AND is_active = true
                     LIMIT 1`,
                    [airRouteId, appliedTariffType]
                );
                if (generalRes.rows.length > 0) {
                    pricePerKg = parseFloat(generalRes.rows[0].price_per_kg);
                }
            }
            if (pricePerKg === 0) {
                return res.status(404).json({
                    error: `No hay tarifa configurada para tipo "${appliedTariffType}" en la ruta activa`,
                });
            }
            salePriceUsd = chargeableKg * pricePerKg;
        }

        // 4. TC final del servicio TDI (tipo_cambio_final = tc_api + sobreprecio)
        const tcRes = await pool.query(
            `SELECT tipo_cambio_final FROM exchange_rate_config
             WHERE servicio = 'tdi' AND estado = TRUE LIMIT 1`
        );
        const tcFinal = parseFloat(tcRes.rows[0]?.tipo_cambio_final) || 17.65;

        const salePriceMxn = +(salePriceUsd * tcFinal).toFixed(2);
        const gex = computeGex(declaredValueMxn, includeGex);
        const totalMxn = +(salePriceMxn + gex.gexTotalCost).toFixed(2);

        return res.json({
            service: 'china_air',
            serviceName: 'TDI Aéreo China',
            realKg,
            volKg: +volKg.toFixed(3),
            chargeableKg: +chargeableKg.toFixed(3),
            usedVolumetric: volKg > realKg,
            tariffType: appliedTariffType,
            isStartup,
            isCustomTariff,
            pricePerKgUsd: +pricePerKg.toFixed(4),
            salePriceUsd: +salePriceUsd.toFixed(2),
            tcFinal,
            salePriceMxn,
            gex,
            totalMxn,
        });
    } catch (error: any) {
        console.error('Error en quoteAirChina:', error);
        return res.status(500).json({ error: error.message || 'Error al cotizar Aéreo China' });
    }
};
