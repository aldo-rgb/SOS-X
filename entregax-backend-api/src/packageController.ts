import { Request, Response } from 'express';
import { pool } from './db';
import { PoolClient, Pool } from 'pg';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

// ============ TIPOS ============
type PackageStatus =
    | 'received'
    | 'received_mty'
    | 'in_transit'
    | 'customs'
    | 'ready_pickup'
    | 'out_for_delivery'
    | 'returned_to_warehouse'
    | 'delivered'
    | 'reempacado'
    | 'processing';

interface BoxItem {
    weight: number;
    length: number;
    width: number;
    height: number;
    trackingCourier?: string;  // Guía del proveedor para multi-guía
}

interface DestinationInfo {
    country: string;
    city: string;
    address: string;
    zip?: string;
    phone?: string;
    contact?: string;
}

interface CreateShipmentBody {
    boxId: string;
    description: string;
    boxes: BoxItem[];
    trackingProvider?: string;
    declaredValue?: number;
    carrier?: string;           // Paquetería de envío (FedEx, UPS, DHL, etc.) - opcional si leaveInWarehouse
    destination?: DestinationInfo; // Destino - opcional si leaveInWarehouse
    notes?: string;
    imageUrl?: string;         // Foto del paquete (base64 o URL)
    warehouseLocation?: string; // Ubicación de bodega (usa_pobox, china_air, etc.)
    leaveInWarehouse?: boolean; // Si true, se deja en bodega sin envío (cliente asignará desde app)
    gex?: {                    // Garantía Extendida GEX
        included: boolean;
        invoiceValueUsd: number;
        exchangeRate: number;
        insuredValueMxn: number;
        costMxn: number;
    };
    skydropxQuote?: {          // Cotización de envío nacional (Skydropx)
        shipmentId?: string;
        rateId?: string;
        provider: string;
        serviceName: string;
        totalPrice: number;
        currency: string;
        deliveryDays?: number;
    };
}

// Lista de paqueterías disponibles
const CARRIERS = ['FedEx', 'UPS', 'DHL', 'Estafeta', 'Redpack', 'Paquetexpress', 'JT Express', 'Otro'] as const;

// ============ GENERADOR DE TRACKING (Prefijo US) ============
const generateTracking = (): string => {
    // US- + 10 dígitos numéricos
    const digits = Date.now().toString().slice(-6) + String(Math.floor(1000 + Math.random() * 9000));
    return `US-${digits}`;
};

// ============ HELPERS ============
const getStatusLabel = (status: PackageStatus): string => {
    const labels: Record<PackageStatus, string> = {
        received: '📦 En Bodega',
        received_mty: '📦 Recibido en CEDIS MTY',
        in_transit: '🚚 En Tránsito',
        customs: '🛃 En Aduana',
        ready_pickup: '✅ Listo para Recoger',
        out_for_delivery: '🛣️ En Ruta',
        returned_to_warehouse: '↩️ Devuelto a Bodega',
        delivered: '🎉 Entregado',
        reempacado: '📦 Reempacado',
        processing: '📋 Procesando'
    };
    return labels[status] || status;
};

const formatDimensions = (length?: number, width?: number, height?: number): string | null => {
    if (length && width && height) {
        return `${length} × ${width} × ${height} cm`;
    }
    return null;
};

const calculateVolume = (length?: number, width?: number, height?: number): number | null => {
    if (length && width && height) {
        return Math.round((length * width * height) / 1000 * 100) / 100;
    }
    return null;
};

// ============ CALCULAR COSTO PO BOX USA ============
// COSTO INTERNO (lo que nos cuesta): Fórmula de pie³
// PRECIO VENTA (lo que cobra al cliente): Según tarifas pobox_tarifas_volumen
interface POBoxCostResult {
    totalMxn: number;              // Precio venta + GEX (lo que paga cliente)
    cbm: number;
    poboxServiceCost: number;      // COSTO INTERNO en MXN
    poboxCostUsd: number;          // COSTO INTERNO en USD
    registeredExchangeRate: number; // TC usado al momento del registro
    gexInsuranceCost: number;      // 5% valor asegurado
    gexFixedCost: number;          // Cargo fijo GEX
    gexTotalCost: number;          // Total GEX
    declaredValueMxn: number;      // Valor declarado en MXN
    precioVentaUsd?: number;       // PRECIO VENTA USD (según tarifa)
    precioVentaMxn?: number;       // PRECIO VENTA MXN (según tarifa)
    nivelTarifa?: number;          // Nivel de tarifa aplicado (1, 2, 3)
    cantidadCajas?: number;        // Número de cajas
    desglosePorCaja?: { cbm: number; costoUsd: number; nivel: number; costoInternoUsd: number; costoInternoMxn: number }[];  // Desglose por caja
    tcFinal?: number;              // TC usado (para hijas multi-pieza)
}

const calculatePOBoxCost = async (
    client: PoolClient | Pool, 
    boxes: BoxItem[], 
    gexData?: { included: boolean; costMxn?: number; insuranceCost?: number; fixedCost?: number; declaredValueMxn?: number }
): Promise<POBoxCostResult> => {
    try {
        // 1. Obtener configuración de costeo PO Box (COSTO INTERNO)
        const configResult = await client.query(
            'SELECT * FROM pobox_costing_config WHERE is_active = TRUE LIMIT 1'
        );
        const config = configResult.rows[0] || {
            dimensional_divisor: 10780,
            base_rate: 75,
            min_cost: 10
        };
        
        // 2. Obtener TC CON SOBREPRECIO (tipo_cambio_final = tc_api + sobreprecio)
        const tcResult = await client.query(
            "SELECT tipo_cambio_final, ultimo_tc_api, sobreprecio FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE LIMIT 1"
        );
        const tcFinal = parseFloat(tcResult.rows[0]?.tipo_cambio_final) || 17.65;

        // 3. Obtener tarifas de venta al cliente (pobox_tarifas_volumen)
        const tarifasResult = await client.query(
            'SELECT * FROM pobox_tarifas_volumen WHERE estado = TRUE ORDER BY nivel'
        );
        const tarifas = tarifasResult.rows;

        // 4. 🎯 CALCULAR PRECIO POR CAJA INDIVIDUAL (no CBM combinado)
        let totalCostUsd = 0;
        let totalCbm = 0;
        let totalVentaUsd = 0;
        let nivelPredominante = 1;
        const desglosePorCaja: { cbm: number; costoUsd: number; nivel: number; costoInternoUsd: number; costoInternoMxn: number }[] = [];
        const costosInternosUsdPorCaja: number[] = [];
        
        for (const box of boxes) {
            const length_cm = box.length || 0;
            const width_cm = box.width || 0;
            const height_cm = box.height || 0;
            
            // CBM de esta caja individual
            const boxCbm = (length_cm * width_cm * height_cm) / 1000000;
            totalCbm += boxCbm;
            
            // CBM mínimo cobrable por caja
            let cbmParaTarifa = boxCbm;
            if (cbmParaTarifa < 0.010) cbmParaTarifa = 0.010;
            
            // PRECIO DE VENTA para esta caja individual
            let boxVentaUsd = 0;
            let boxNivel = 1;
            
            for (const tarifa of tarifas) {
                const cbmMin = parseFloat(tarifa.cbm_min) || 0;
                const cbmMax = tarifa.cbm_max ? parseFloat(tarifa.cbm_max) : Infinity;
                
                if (cbmParaTarifa >= cbmMin && cbmParaTarifa <= cbmMax) {
                    boxNivel = tarifa.nivel;
                    if (tarifa.tipo_cobro === 'fijo') {
                        boxVentaUsd = parseFloat(tarifa.costo);
                    } else {
                        // Por unidad (m³)
                        boxVentaUsd = cbmParaTarifa * parseFloat(tarifa.costo);
                        // Protección: no cobrar menos que el nivel anterior
                        const nivelAnterior = tarifas.find((t: any) => t.nivel === tarifa.nivel - 1);
                        if (nivelAnterior && boxVentaUsd < parseFloat(nivelAnterior.costo)) {
                            boxVentaUsd = parseFloat(nivelAnterior.costo);
                        }
                    }
                    break;
                }
            }
            
            totalVentaUsd += boxVentaUsd;
            if (boxNivel > nivelPredominante) nivelPredominante = boxNivel;
            
            // COSTO INTERNO (para cálculo de margen) por caja
            const length_pulg = length_cm / 2.54;
            const width_pulg = width_cm / 2.54;
            const height_pulg = height_cm / 2.54;
            const volumePulg = length_pulg * width_pulg * height_pulg;
            const pie3 = volumePulg / parseFloat(config.dimensional_divisor);
            const boxCostUsd = pie3 * parseFloat(config.base_rate);
            totalCostUsd += boxCostUsd;
            costosInternosUsdPorCaja.push(boxCostUsd);
            
            desglosePorCaja.push({
                cbm: boxCbm,
                costoUsd: boxVentaUsd,
                nivel: boxNivel,
                costoInternoUsd: boxCostUsd,
                costoInternoMxn: 0 // se llena después con tcFinal
            });
        }

        // 5. COSTO INTERNO: Convertir a MXN
        let poboxServiceCost = totalCostUsd * tcFinal;
        const minCost = parseFloat(config.min_cost) || 10;
        if (poboxServiceCost < minCost) {
            poboxServiceCost = minCost;
            totalCostUsd = minCost / tcFinal;
        }
        // Llenar costo interno MXN por caja con el tcFinal
        desglosePorCaja.forEach((d) => { d.costoInternoMxn = d.costoInternoUsd * tcFinal; });

        // 6. Precio de venta total en MXN
        const precioVentaMxn = totalVentaUsd * tcFinal;
        
        // 7. Extraer desglose de GEX
        const gexInsuranceCost = gexData?.insuranceCost || 0;
        const gexFixedCost = gexData?.fixedCost || 0;
        const gexTotalCost = gexData?.costMxn || 0;
        const declaredValueMxn = gexData?.declaredValueMxn || 0;
        
        // 8. Total a cobrar al cliente = Precio Venta + GEX
        const totalMxn = precioVentaMxn + gexTotalCost;

        console.log(`💰 PO Box: ${boxes.length} cajas, CBM total=${totalCbm.toFixed(4)}`);
        if (boxes.length > 1) {
            console.log(`   📦 DESGLOSE POR CAJA:`);
            desglosePorCaja.forEach((d, i) => console.log(`      Caja ${i+1}: CBM=${d.cbm.toFixed(4)}, USD=$${d.costoUsd.toFixed(2)} (Nivel ${d.nivel})`));
        }
        console.log(`   COSTO interno: USD=$${totalCostUsd.toFixed(2)} × TC ${tcFinal} = $${poboxServiceCost.toFixed(2)} MXN`);
        console.log(`   VENTA cliente: USD=$${totalVentaUsd.toFixed(2)} × TC ${tcFinal} = $${precioVentaMxn.toFixed(2)} MXN`);
        console.log(`   GEX=$${gexTotalCost.toFixed(2)}, Total=$${totalMxn.toFixed(2)}`);

        return { 
            totalMxn,  // Precio de venta + GEX
            cbm: totalCbm,
            poboxServiceCost,  // Costo interno
            poboxCostUsd: totalCostUsd,  // Costo interno USD
            registeredExchangeRate: tcFinal,
            gexInsuranceCost,
            gexFixedCost,
            gexTotalCost,
            declaredValueMxn,
            // Campos para mostrar en app
            precioVentaUsd: totalVentaUsd,  // SUMA de todas las cajas
            precioVentaMxn,
            nivelTarifa: nivelPredominante,  // Nivel más alto aplicado
            // Nuevo: desglose para la app
            cantidadCajas: boxes.length,
            desglosePorCaja,
            tcFinal
        };
    } catch (error) {
        console.error('Error calculando costo PO Box:', error);
        return { totalMxn: 0, cbm: 0, poboxServiceCost: 0, poboxCostUsd: 0, registeredExchangeRate: 0, gexInsuranceCost: 0, gexFixedCost: 0, gexTotalCost: 0, declaredValueMxn: 0 };
    }
};

// ============ CREAR ENVÍO (MASTER + HIJAS) ============
export const createShipment = async (req: Request, res: Response): Promise<void> => {
    console.log('📦 [createShipment] Iniciando...');
    console.log('📦 [createShipment] Body:', JSON.stringify(req.body, null, 2).substring(0, 500));
    
    const client = await pool.connect();
    
    try {
        const { boxId, description, boxes, trackingProvider, declaredValue, carrier, destination, notes, imageUrl, warehouseLocation, leaveInWarehouse, gex, skydropxQuote }: CreateShipmentBody = req.body;

        // 🛡️ GEX - Determinar si incluye garantía
        const hasGex = gex?.included || false;
        
        // 🚚 Costo de envío nacional (se calcula con PQTX si auto-asignado)
        let nationalShippingCost = skydropxQuote?.totalPrice || 0;

        // Determinar service_type basado en warehouseLocation
        const getServiceType = (location?: string): string => {
            const serviceMap: Record<string, string> = {
                'usa_pobox': 'POBOX_USA',
                'china_air': 'AIR_CHN_MX',
                'china_sea': 'SEA_CHN_MX',
                'mx_cedis': 'AA_DHL',
                'mx_national': 'NATIONAL',
            };
            return serviceMap[location || ''] || 'AIR_CHN_MX';
        };
        const serviceType = getServiceType(warehouseLocation);
        const wLocation = warehouseLocation || 'china_air';

        // boxId ya no es obligatorio - se puede crear sin cliente
        // Descripción ya no es obligatoria
        if (!boxes || boxes.length === 0) {
            res.status(400).json({ error: 'Debe agregar al menos una caja' });
            return;
        }
        // Carrier y destination solo requeridos si NO se deja en bodega
        if (!leaveInWarehouse) {
            if (!carrier) {
                res.status(400).json({ error: 'Selecciona la paquetería de envío' });
                return;
            }
            if (!destination || !destination.country || !destination.city || !destination.address) {
                res.status(400).json({ error: 'La dirección de destino es requerida (país, ciudad, dirección)' });
                return;
            }
        }

        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i] as BoxItem;
            if (!box || !box.weight || box.weight <= 0) {
                res.status(400).json({ error: `Caja ${i + 1}: El peso es requerido` });
                return;
            }
            if (!box.length || !box.width || !box.height) {
                res.status(400).json({ error: `Caja ${i + 1}: Las dimensiones son requeridas` });
                return;
            }
        }

        // Buscar usuario solo si se proporciona boxId
        let user: { id: number | null; full_name: string; email: string; box_id: string; is_verified: boolean; verification_status: string } | null = null;
        
        if (boxId && boxId.trim()) {
            const userQuery = await client.query(
                'SELECT id, full_name, email, box_id, is_verified, verification_status FROM users WHERE UPPER(box_id) = $1',
                [(boxId as string).toUpperCase()]
            );

            if (userQuery.rows.length === 0) {
                // Fallback: buscar en legacy_clients
                const legacyQuery = await client.query(
                    'SELECT id, full_name, box_id FROM legacy_clients WHERE UPPER(box_id) = $1',
                    [(boxId as string).toUpperCase()]
                );

                if (legacyQuery.rows.length === 0) {
                    res.status(404).json({ 
                        error: 'Box ID no encontrado',
                        message: `No existe cliente con casillero ${boxId}.`
                    });
                    return;
                }

                // Cliente legacy encontrado — usar datos parciales (sin user.id real)
                const legacy = legacyQuery.rows[0];
                user = {
                    id: null,
                    full_name: legacy.full_name,
                    email: '',
                    box_id: legacy.box_id,
                    is_verified: false,
                    verification_status: 'legacy',
                };
                console.log(`📦 [createShipment] Cliente legacy encontrado: ${legacy.full_name} (${legacy.box_id})`);
            } else {
                user = userQuery.rows[0];
            }

            // ⚠️ NOTA: La verificación de cliente se aplicará más adelante en el flujo (al enviar/cobrar)
            // Por ahora permitimos recibir paquetes aunque el cliente no esté verificado
            // Solo logueamos el estado para tracking
            if (user && !user.is_verified) {
                console.log(`⚠️ Cliente ${user.box_id} no verificado (status: ${user.verification_status || 'not_started'}) - Permitiendo recepción de paquete`);
            }
        }
        const masterTracking = generateTracking();
        const totalBoxes = boxes.length;
        const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0);
        const totalVolume = boxes.reduce((sum, box) => sum + (calculateVolume(box.length, box.width, box.height) || 0), 0);

        // 📦 Valores seguros para cuando se deja en bodega (leaveInWarehouse)
        const safeCarrier = leaveInWarehouse ? 'BODEGA' : (carrier || 'Sin asignar');
        const safeDestination: DestinationInfo = leaveInWarehouse ? {
            country: 'México',
            city: 'En Bodega',
            address: 'Pendiente de asignar'
        } : destination!;

        // 🚚 Determinar si es envío con paquetería de última milla (auto-consolidar)
        const lastMileCarriers = ['FedEx', 'UPS', 'DHL', 'Estafeta', 'Redpack', 'Paquetexpress', 'JT Express', 'Otro'];
        const isLastMileShipment = !leaveInWarehouse && lastMileCarriers.includes(carrier || '');

        // 📦 Verificar si cliente tiene dirección asignada para USA (auto-procesar)
        let hasDefaultUsaAddress = false;
        let defaultAddressId: number | null = null;
        let autoAssignedCarrier: string | null = null;

        // 🚚 ¿El operador seleccionó explícitamente una tarifa en el wizard?
        // Si sí, RESPETAR su elección (carrier + costo nacional) y NO auto-cotizar con PQTX
        // aunque el cliente tenga paquete_express configurado en su dirección.
        const operatorSelectedRate = !!skydropxQuote && skydropxQuote.rateId != null;

        if (user && serviceType === 'POBOX_USA') {
            const addressCheck = await client.query(
                `SELECT id, carrier_config, zip_code FROM addresses 
                 WHERE user_id = $1 
                 AND default_for_service IS NOT NULL 
                 AND (default_for_service ILIKE '%po_box%' OR default_for_service ILIKE '%usa%' OR default_for_service ILIKE '%all%')
                 LIMIT 1`,
                [user.id]
            );
            if (addressCheck.rows.length > 0) {
                hasDefaultUsaAddress = true;
                defaultAddressId = addressCheck.rows[0].id;
                
                // 🚚 Extraer paquetería asignada de carrier_config
                // Solo usar como "auto-asignada" si el operador NO eligió explícitamente algo distinto
                const carrierConfig = addressCheck.rows[0].carrier_config;
                if (carrierConfig && !operatorSelectedRate) {
                    const CARRIER_NAMES: Record<string, string> = {
                        'entregax_local': 'EntregaX Local',
                        'paquete_express': 'Paquete Express',
                    };
                    const SERVICE_CONFIG_KEY: Record<string, string> = {
                        'POBOX_USA': 'usa', 'AIR': 'air', 'MARITIME': 'maritime', 'CHINA_AIR': 'air',
                    };
                    const configKey = SERVICE_CONFIG_KEY[serviceType] || 'usa';
                    const carrierId = carrierConfig[configKey];
                    if (carrierId) {
                        autoAssignedCarrier = CARRIER_NAMES[carrierId] || carrierId;
                    }
                }
                
                console.log(`📦 Cliente ${user.box_id} tiene dirección USA asignada (ID: ${defaultAddressId}, Carrier: ${autoAssignedCarrier}) - auto-asignando instrucciones`);
                
                // 🚚 AUTO-COTIZAR con Paquete Express si la paquetería asignada es paquete_express
                // PERO: si el operador ya seleccionó una tarifa en el wizard (skydropxQuote),
                // respetar su elección y NO sobrescribir el costo nacional.
                if (!operatorSelectedRate && carrierConfig && (carrierConfig['usa'] === 'paquete_express' || autoAssignedCarrier === 'Paquete Express')) {
                    const destZip = addressCheck.rows[0].zip_code;
                    if (destZip) {
                        try {
                            const PQTX_BASE_URL = process.env.PQTX_BASE_URL || 'https://qaglp.paquetexpress.com.mx';
                            const PQTX_QUOTE_USER = process.env.PQTX_QUOTE_USER || 'WSQURBANWOD';
                            const PQTX_QUOTE_PASSWORD = process.env.PQTX_QUOTE_PASSWORD || '1234';
                            const PQTX_QUOTE_TOKEN = process.env.PQTX_QUOTE_TOKEN || '4DB7391907B749C5E063350AA8C0215D';
                            const PQTX_ORIGIN_ZIP = process.env.PQTX_ORIGIN_ZIP || '64860';

                            // Construir paquetes para cotización
                            const shipments = boxes.map((box: BoxItem, idx: number) => ({
                                sequence: idx + 1,
                                quantity: 1,
                                shpCode: '2',
                                weight: box.weight || 1,
                                longShip: box.length || 30,
                                widthShip: box.width || 30,
                                highShip: box.height || 30,
                            }));

                            const quoteUrl = `${PQTX_BASE_URL}/WsQuotePaquetexpress/api/apiQuoter/v2/getQuotation`;
                            const quoteBody = {
                                header: {
                                    security: { user: PQTX_QUOTE_USER, password: PQTX_QUOTE_PASSWORD, type: 1, token: PQTX_QUOTE_TOKEN },
                                    device: { appName: 'EntregaX', type: 'Web', ip: '', idDevice: '' },
                                    target: { module: 'QUOTER', version: '1.0', service: 'quoter', uri: 'quotes', event: 'R' },
                                    output: 'JSON',
                                    language: null,
                                },
                                body: {
                                    request: {
                                        data: {
                                            clientAddrOrig: { zipCode: PQTX_ORIGIN_ZIP, colonyName: 'CENTRO' },
                                            clientAddrDest: { zipCode: destZip, colonyName: 'CENTRO' },
                                            services: { dlvyType: '1', ackType: 'N', totlDeclVlue: 1000, invType: 'A', radType: '1' },
                                            otherServices: { otherServices: [] },
                                            shipmentDetail: { shipments },
                                            quoteServices: ['ALL'],
                                        },
                                        objectDTO: null,
                                    },
                                    response: null,
                                },
                            };

                            console.log(`🚚 [PQTX-AUTO] Cotizando envío: origen=${PQTX_ORIGIN_ZIP}, destino=${destZip}, cajas=${boxes.length}`);
                            const pqtxResponse = await axios.post(quoteUrl, quoteBody, {
                                headers: { 'Content-Type': 'application/json' },
                                timeout: 20000,
                            });

                            const respBody = pqtxResponse.data?.body?.response;
                            const quotations = respBody?.data?.quotations;

                            if (respBody?.success && Array.isArray(quotations) && quotations.length > 0) {
                                // Tomar la cotización más económica
                                const cheapest = quotations.reduce((min: any, q: any) => {
                                    const qTotal = parseFloat(q.amount?.totalAmnt || q.totalAmnt || q.totalAmount || q.total || '0');
                                    const mTotal = parseFloat(min.amount?.totalAmnt || min.totalAmnt || min.totalAmount || min.total || '0');
                                    return qTotal < mTotal ? q : min;
                                }, quotations[0]);

                                const pqtxTotal = parseFloat(cheapest.amount?.totalAmnt || cheapest.totalAmnt || cheapest.totalAmount || cheapest.total || '0');
                                const packageCount = boxes.length;
                                const pqtxPerBox = packageCount > 1 ? pqtxTotal / packageCount : pqtxTotal;

                                // REGLA DE UTILIDAD:
                                // - Si cotización por caja < $300 → cobrar $400 por caja
                                // - Si cotización por caja >= $300 → agregar $100 por caja
                                let pricePerBox: number;
                                let rule: string;
                                if (pqtxPerBox < 300) {
                                    pricePerBox = 400;
                                    rule = 'min_400_per_box';
                                } else {
                                    pricePerBox = Math.round(pqtxPerBox + 100);
                                    rule = 'plus_100_per_box';
                                }

                                nationalShippingCost = pricePerBox * packageCount;
                                console.log(`🚚 [PQTX-AUTO] Cotización: PQTX=$${pqtxTotal}, perBox=$${pqtxPerBox}, clientPerBox=$${pricePerBox}, clientTotal=$${nationalShippingCost}, rule=${rule}`);
                            } else {
                                // Sin cotización disponible → fallback $400 por caja
                                nationalShippingCost = 400 * boxes.length;
                                console.log(`🚚 [PQTX-AUTO] Sin cotización PQTX, usando fallback: $${nationalShippingCost} ($400 x ${boxes.length} cajas)`);
                            }
                        } catch (pqtxError: any) {
                            // Error en API → fallback $400 por caja
                            nationalShippingCost = 400 * boxes.length;
                            console.error(`🚚 [PQTX-AUTO] Error cotización: ${pqtxError.message}, usando fallback: $${nationalShippingCost}`);
                        }
                    } else {
                        // Sin CP destino → fallback $400 por caja
                        nationalShippingCost = 400 * boxes.length;
                        console.log(`🚚 [PQTX-AUTO] Sin CP destino, usando fallback: $${nationalShippingCost}`);
                    }
                }
            }
        }

        // Si tiene carrier última milla O tiene dirección USA asignada, auto-procesar
        // Si leaveInWarehouse, NO auto-procesar (queda en received para que cliente asigne)
        // Si no hay usuario, queda en 'received' para asignar después
        //
        // ⚠️ IMPORTANTE: aunque el cliente tenga dirección e instrucciones por defecto
        // guardadas, el paquete debe permanecer en "Recibido en bodega" (received)
        // hasta que un operador imprima la guía / despache. Saltar a "processing"
        // automáticamente confunde al cliente porque muestra "Procesando - Guía impresa"
        // sin que se haya impreso nada todavía. Por eso hasDefaultUsaAddress YA NO
        // dispara el auto-procesado; solo lo hace isLastMileShipment (se eligió un
        // carrier de última milla explícito al registrar la recepción).
        const shouldAutoProcess = user && !leaveInWarehouse && isLastMileShipment;
        const initialStatus = shouldAutoProcess ? 'processing' : 'received';

        // 💰 Calcular costo para PO Box USA con desglose
        let costResult: POBoxCostResult = { 
            totalMxn: 0, cbm: 0, poboxServiceCost: 0, poboxCostUsd: 0, registeredExchangeRate: 0,
            gexInsuranceCost: 0, gexFixedCost: 0, gexTotalCost: 0, declaredValueMxn: 0 
        };
        
        if (serviceType === 'POBOX_USA') {
            // Calcular desglose de GEX: costMxn = 5% * insuredValueMxn + 625
            // Entonces: insuranceCost = costMxn - 625, fixedCost = 625
            const GEX_FIXED = 625;
            const gexTotalCost = gex?.included ? (gex.costMxn || 0) : 0;
            const gexInsuranceCost = gex?.included ? Math.max(0, gexTotalCost - GEX_FIXED) : 0;
            const gexFixedCost = gex?.included ? GEX_FIXED : 0;
            const declaredValueMxn = gex?.insuredValueMxn || 0;
            
            // Preparar datos de GEX con desglose
            const gexData = gex?.included ? {
                included: true,
                costMxn: gexTotalCost,
                insuranceCost: gexInsuranceCost,
                fixedCost: gexFixedCost,
                declaredValueMxn: declaredValueMxn
            } : undefined;
            
            costResult = await calculatePOBoxCost(client, boxes as BoxItem[], gexData);
        }

        await client.query('BEGIN');

        // � El consolidation_id se asigna SOLO cuando se crea la salida, no al recibir
        // Los paquetes en 'processing' están listos para salida pero sin consolidación aún
        let consolidationId: number | null = null;

        // 🚚 Carrier nacional efectivo: prioridad a la elección explícita del operador
        // (skydropxQuote.provider / carrier del wizard) sobre el auto-asignado de carrier_config.
        const operatorChosenCarrier = operatorSelectedRate
            ? (skydropxQuote?.provider || carrier || null)
            : null;
        const effectiveNationalCarrier = operatorChosenCarrier || autoAssignedCarrier;

        let masterPackage;
        const childPackages = [];
        const allLabels = [];

        if (totalBoxes === 1) {
            const box = boxes[0] as BoxItem;
            // Calcular totales incluyendo envío nacional
            const totalCostMxn = costResult.totalMxn + nationalShippingCost;
            const result = await client.query(
                `INSERT INTO packages 
                 (user_id, box_id, tracking_internal, tracking_provider, description, weight, 
                  pkg_length, pkg_width, pkg_height, declared_value, notes, status,
                  is_master, box_number, total_boxes, carrier,
                  destination_country, destination_city, destination_address, destination_zip, destination_phone, destination_contact, image_url,
                  service_type, warehouse_location, has_gex, consolidation_id,
                  assigned_cost_mxn, single_cbm, saldo_pendiente, long_cm, width_cm, height_cm,
                  pobox_service_cost, gex_insurance_cost, gex_fixed_cost, gex_total_cost, declared_value_mxn,
                  registered_exchange_rate, pobox_cost_usd, pobox_tarifa_nivel, pobox_venta_usd, national_shipping_cost,
                  assigned_address_id, needs_instructions, national_carrier)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, 1, 1, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
                         $25, $26, $25, $7, $8, $9, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
                         $37, $38, $39) 
                 RETURNING *`,
                [user?.id || null, user?.box_id || null, masterTracking, box.trackingCourier || trackingProvider || null, description, box.weight, 
                 box.length, box.width, box.height, declaredValue || null, notes || null, initialStatus,
                 safeCarrier, safeDestination.country, safeDestination.city, safeDestination.address, 
                 safeDestination.zip || null, safeDestination.phone || null, safeDestination.contact || null, imageUrl || null,
                 serviceType, wLocation, hasGex, consolidationId,
                 totalCostMxn, costResult.cbm,
                 costResult.poboxServiceCost, costResult.gexInsuranceCost, costResult.gexFixedCost, costResult.gexTotalCost, costResult.declaredValueMxn,
                 costResult.registeredExchangeRate, costResult.poboxCostUsd, costResult.nivelTarifa || null, costResult.precioVentaUsd || null, nationalShippingCost,
                 defaultAddressId, defaultAddressId ? false : true, effectiveNationalCarrier]
            );
            masterPackage = result.rows[0];
            
            allLabels.push({
                boxNumber: 1, totalBoxes: 1, tracking: masterTracking, labelCode: masterTracking,
                isMaster: false, weight: box.weight,
                dimensions: formatDimensions(box.length, box.width, box.height),
                clientName: user?.full_name || 'SIN CLIENTE', clientBoxId: user?.box_id || 'PENDIENTE', description,
                carrier: safeCarrier, destination: `${safeDestination.city}, ${safeDestination.country}`,
                destinationCity: safeDestination.city, destinationCountry: safeDestination.country,
                receivedAt: new Date().toISOString()
            });
        } else {
            // 🟦 MULTI-PIEZA: el master se guarda con costos en 0.
            // Cada caja hija lleva su propio costo individual (desglosePorCaja[i]).
            // Esto evita doble cobro y permite que el reporte de pagos a proveedor
            // sume correctamente caja por caja.
            const totalCostMxn = costResult.totalMxn + nationalShippingCost;
            const masterResult = await client.query(
                `INSERT INTO packages 
                 (user_id, box_id, tracking_internal, tracking_provider, description, weight, 
                  declared_value, notes, status, is_master, box_number, total_boxes, carrier,
                  destination_country, destination_city, destination_address, destination_zip, destination_phone, destination_contact, image_url,
                  service_type, warehouse_location, has_gex, consolidation_id,
                  assigned_cost_mxn, single_cbm, saldo_pendiente,
                  pobox_service_cost, gex_insurance_cost, gex_fixed_cost, gex_total_cost, declared_value_mxn,
                  registered_exchange_rate, pobox_cost_usd, pobox_tarifa_nivel, pobox_venta_usd, national_shipping_cost,
                  assigned_address_id, needs_instructions, national_carrier)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 0, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
                         $23, $24, $23, 0, $25, $26, $27, $28, $29, 0, NULL, 0, $30, $31, $32, $33)
                 RETURNING *`,
                [user?.id || null, user?.box_id || null, masterTracking, trackingProvider || null, description, totalWeight, 
                 declaredValue || null, notes || null, initialStatus, totalBoxes, safeCarrier,
                 safeDestination.country, safeDestination.city, safeDestination.address,
                 safeDestination.zip || null, safeDestination.phone || null, safeDestination.contact || null, imageUrl || null,
                 serviceType, wLocation, hasGex, consolidationId,
                 totalCostMxn, costResult.cbm,
                 costResult.gexInsuranceCost, costResult.gexFixedCost, costResult.gexTotalCost, costResult.declaredValueMxn,
                 costResult.registeredExchangeRate, nationalShippingCost,
                 defaultAddressId, defaultAddressId ? false : true, effectiveNationalCarrier]
            );
            masterPackage = masterResult.rows[0];

            allLabels.push({
                boxNumber: 0, totalBoxes, tracking: masterTracking, labelCode: masterTracking,
                isMaster: true, weight: totalWeight, volume: Math.round(totalVolume * 100) / 100,
                dimensions: `${totalBoxes} bultos`,
                clientName: user?.full_name || 'SIN CLIENTE', clientBoxId: user?.box_id || 'PENDIENTE', description,
                carrier: safeCarrier, destination: `${safeDestination.city}, ${safeDestination.country}`,
                destinationCity: safeDestination.city, destinationCountry: safeDestination.country,
                receivedAt: new Date().toISOString()
            });

            for (let i = 0; i < boxes.length; i++) {
                const box = boxes[i] as BoxItem;
                const boxNumber = i + 1;
                const childTracking = `${masterTracking}-${String(boxNumber).padStart(2, '0')}`;
                // 💰 Costo individual de esta caja (calculado en calculatePOBoxCost)
                const desglose = costResult.desglosePorCaja?.[i];
                const childPoboxCostUsd = desglose?.costoInternoUsd || 0;
                const childPoboxCostMxn = desglose?.costoInternoMxn || 0;
                const childPoboxVentaUsd = desglose?.costoUsd || 0;
                const childNivelTarifa = desglose?.nivel || null;
                const childTcFinal = costResult.tcFinal || costResult.registeredExchangeRate || 0;

                const childResult = await client.query(
                    `INSERT INTO packages 
                     (user_id, box_id, tracking_internal, tracking_provider, description, weight, 
                      pkg_length, pkg_width, pkg_height, status,
                      is_master, master_id, box_number, total_boxes, carrier,
                      destination_country, destination_city, destination_address,
                      service_type, warehouse_location, consolidation_id,
                      pobox_service_cost, pobox_cost_usd, pobox_tarifa_nivel, pobox_venta_usd, registered_exchange_rate)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                             $21, $22, $23, $24, $25) 
                     RETURNING *`,
                    [user?.id || null, user?.box_id || null, childTracking, box.trackingCourier || trackingProvider || null, description, box.weight, 
                     box.length, box.width, box.height, initialStatus, masterPackage.id, boxNumber, totalBoxes,
                     safeCarrier, safeDestination.country, safeDestination.city, safeDestination.address,
                     serviceType, wLocation, consolidationId,
                     childPoboxCostMxn, childPoboxCostUsd, childNivelTarifa, childPoboxVentaUsd, childTcFinal]
                );
                childPackages.push(childResult.rows[0]);

                allLabels.push({
                    boxNumber, totalBoxes, tracking: childTracking, labelCode: childTracking,
                    masterTracking, isMaster: false, weight: box.weight,
                    dimensions: formatDimensions(box.length, box.width, box.height),
                    volume: calculateVolume(box.length, box.width, box.height),
                    clientName: user?.full_name || 'SIN CLIENTE', clientBoxId: user?.box_id || 'PENDIENTE', description,
                    carrier: safeCarrier, destination: `${safeDestination.city}, ${safeDestination.country}`,
                    destinationCity: safeDestination.city, destinationCountry: safeDestination.country,
                    receivedAt: new Date().toISOString()
                });
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: shouldAutoProcess 
                ? `📦 Paquete registrado y procesando automáticamente`
                : (totalBoxes > 1 ? `📦 Envío con ${totalBoxes} bultos registrado` : '📦 Paquete registrado'),
            autoProcessed: shouldAutoProcess,
            shipment: {
                master: {
                    id: masterPackage.id, tracking: masterPackage.tracking_internal,
                    isMaster: totalBoxes > 1, totalBoxes,
                    totalWeight: Math.round(totalWeight * 100) / 100,
                    totalVolume: Math.round(totalVolume * 100) / 100,
                    trackingProvider: trackingProvider || null,
                    declaredValue: declaredValue || null,
                    carrier: safeCarrier,
                    destination: {
                        country: safeDestination.country,
                        city: safeDestination.city,
                        address: safeDestination.address,
                        zip: safeDestination.zip || null,
                        phone: safeDestination.phone || null,
                        contact: safeDestination.contact || null
                    },
                    status: initialStatus, statusLabel: getStatusLabel(initialStatus as 'received' | 'in_transit'),
                    consolidationId: consolidationId,
                    receivedAt: masterPackage.received_at
                },
                children: childPackages.map((child, idx) => ({
                    id: child.id, tracking: child.tracking_internal, boxNumber: idx + 1,
                    weight: parseFloat(child.weight),
                    dimensions: formatDimensions(parseFloat(child.pkg_length), parseFloat(child.pkg_width), parseFloat(child.pkg_height))
                })),
                labels: allLabels
            },
            client: user ? { id: user.id, name: user.full_name, email: user.email, boxId: user.box_id } : null
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear envío:', error);
        res.status(500).json({ error: 'Error al registrar el envío' });
    } finally {
        client.release();
    }
};

// ============ LISTAR PAQUETES ============
export const getPackages = async (req: Request, res: Response): Promise<void> => {
    console.log('📦 getPackages llamado');
    try {
        const { status, boxId, limit = 50, sinCliente } = req.query;

        // Solo mostrar paquetes POBOX USA - usar LEFT JOIN para incluir paquetes sin cliente y legacy
        let query = `
            SELECT p.*, u.id as user_id, u.full_name, u.email, u.box_id as user_box_id,
                   lc.full_name as legacy_name, lc.box_id as legacy_box_id
            FROM packages p 
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN legacy_clients lc ON p.user_id IS NULL AND UPPER(p.box_id) = UPPER(lc.box_id)
            WHERE (p.is_master = true OR p.master_id IS NULL)
            AND (p.service_type = 'POBOX_USA' OR p.service_type = 'air' OR (p.service_type IS NULL AND p.tracking_internal LIKE 'US-%'))
        `;
        const params: (string | number)[] = [];

        if (status) {
            params.push(status as string);
            query += ` AND p.status = $${params.length}`;
        }
        if (boxId) {
            params.push((boxId as string).toUpperCase());
            query += ` AND u.box_id = $${params.length}`;
        }
        // Filtrar solo paquetes sin cliente
        if (sinCliente === 'true') {
            query += ` AND p.user_id IS NULL`;
        }

        params.push(Number(limit));
        query += ` ORDER BY p.created_at DESC LIMIT $${params.length}`;

        console.log('📦 Ejecutando query...');
        const result = await pool.query(query, params);
        console.log('📦 Query completada, filas:', result.rows.length);

        const packages = result.rows.map(pkg => ({
            id: pkg.id, tracking: pkg.tracking_internal, trackingProvider: pkg.tracking_provider,
            description: pkg.description,
            weight: pkg.weight ? parseFloat(pkg.weight) : null,
            dimensions: pkg.is_master ? null : {
                length: pkg.pkg_length ? parseFloat(pkg.pkg_length) : null,
                width: pkg.pkg_width ? parseFloat(pkg.pkg_width) : null,
                height: pkg.pkg_height ? parseFloat(pkg.pkg_height) : null,
                formatted: formatDimensions(parseFloat(pkg.pkg_length), parseFloat(pkg.pkg_width), parseFloat(pkg.pkg_height))
            },
            isMaster: pkg.is_master, totalBoxes: pkg.total_boxes || 1,
            declaredValue: pkg.declared_value ? parseFloat(pkg.declared_value) : null,
            status: pkg.status, statusLabel: getStatusLabel(pkg.status),
            receivedAt: pkg.received_at, deliveredAt: pkg.delivered_at,
            consolidationId: pkg.consolidation_id,
            supplierId: pkg.supplier_id,
            client: pkg.user_id 
                ? { id: pkg.user_id, name: pkg.full_name || 'Sin nombre', email: pkg.email || '', boxId: pkg.user_box_id || 'N/A' } 
                : pkg.legacy_name 
                    ? { id: 0, name: pkg.legacy_name, email: '', boxId: pkg.legacy_box_id || pkg.box_id || 'N/A', isLegacy: true }
                    : { id: 0, name: pkg.box_id ? `Casillero ${pkg.box_id}` : 'Sin Cliente', email: '', boxId: pkg.box_id || 'N/A' }
        }));

        res.json({ success: true, total: packages.length, packages });
    } catch (error: any) {
        console.error('❌ Error en getPackages:', error?.message || error);
        console.error('Stack:', error?.stack);
        res.status(500).json({ error: 'Error al consultar paquetes', details: error?.message });
    }
};

// ============ OBTENER ENVÍO POR TRACKING ============
export const getShipmentByTracking = async (req: Request, res: Response): Promise<void> => {
    try {
        const tracking = req.params.tracking as string;
        if (!tracking) { res.status(400).json({ error: 'Tracking requerido' }); return; }

        const trackingUpper = tracking.toUpperCase().trim();
        const trackingCompact = trackingUpper.replace(/[^A-Z0-9]/g, '');

        const result = await pool.query(`
            SELECT p.*, u.full_name, u.email, u.box_id as user_box_id,
                   lc.full_name as legacy_name, lc.box_id as legacy_box_id,
                   a.alias as addr_alias, a.recipient_name as addr_recipient, a.street as addr_street,
                   a.exterior_number as addr_ext, a.interior_number as addr_int,
                   a.neighborhood as addr_neighborhood, a.city as addr_city,
                   a.state as addr_state, a.zip_code as addr_zip,
                   a.phone as addr_phone, a.reference as addr_reference,
                   a.carrier_config as addr_carrier_config
            FROM packages p 
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN legacy_clients lc ON p.user_id IS NULL AND UPPER(p.box_id) = UPPER(lc.box_id)
            LEFT JOIN addresses a ON p.assigned_address_id = a.id
            WHERE UPPER(COALESCE(p.tracking_internal, '')) = $1
               OR UPPER(COALESCE(p.tracking_provider, '')) = $1
               OR REGEXP_REPLACE(UPPER(COALESCE(p.tracking_internal, '')), '[^A-Z0-9]', '', 'g') = $2
               OR REGEXP_REPLACE(UPPER(COALESCE(p.tracking_provider, '')), '[^A-Z0-9]', '', 'g') = $2
        `, [trackingUpper, trackingCompact]);

        if (result.rows.length === 0) { res.status(404).json({ error: 'No encontrado' }); return; }

        const pkg = result.rows[0];
        let children: any[] = [];

        if (pkg.is_master) {
            const childResult = await pool.query('SELECT * FROM packages WHERE master_id = $1 ORDER BY box_number', [pkg.id]);
            children = childResult.rows;
        }

        const labels = [];
        const resolvedName = pkg.full_name || pkg.legacy_name || 'SIN CLIENTE';
        const resolvedBoxId = pkg.user_box_id || pkg.legacy_box_id || pkg.box_id || 'PENDIENTE';

        // Derivar código corto de ciudad destino (MTY/CDMX/GDL/...) desde la dirección asignada
        const cityCodeFor = (city?: string | null, state?: string | null): string | null => {
            const c = (city || '').toLowerCase();
            const s = (state || '').toLowerCase();
            if (!c && !s) return null;
            if (s.includes('nuevo le') || /monterrey|guadalupe|san pedro|san nicol|apodaca|santa catarina|garc[ií]a|escobedo|ju[aá]rez/.test(c)) return 'MTY';
            if (s.includes('ciudad de m') || s === 'cdmx' || /ciudad de m[eé]xico|cdmx|m[eé]xico d\.?f\.?/.test(c)) return 'CDMX';
            if (s.includes('jalisco') || /guadalajara|zapopan|tlaquepaque|tonal[aá]/.test(c)) return 'GDL';
            if (/quer[eé]taro/.test(c) || /quer[eé]taro/.test(s)) return 'QRO';
            if (/puebla/.test(c)) return 'PUE';
            if (/le[oó]n/.test(c)) return 'LEO';
            if (/tijuana/.test(c)) return 'TIJ';
            if (/canc[uú]n/.test(c)) return 'CUN';
            if (/m[eé]rida/.test(c)) return 'MID';
            // fallback: primeras 3 letras de la ciudad
            const clean = (city || state || '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').toUpperCase();
            return clean.slice(0, 3) || null;
        };

        const destinationCode = cityCodeFor(pkg.addr_city, pkg.addr_state);
        const destCityFull = pkg.addr_city || pkg.destination_city || null;
        const destCountry = pkg.destination_country || (pkg.addr_state ? 'México' : null);

        if (pkg.is_master) {
            labels.push({ boxNumber: 0, totalBoxes: pkg.total_boxes, tracking: pkg.tracking_internal, 
                labelCode: pkg.tracking_internal, isMaster: true, weight: parseFloat(pkg.weight),
                clientName: resolvedName, clientBoxId: resolvedBoxId, description: pkg.description,
                destinationCity: destCityFull, destinationCountry: destCountry, destinationCode,
                carrier: pkg.carrier, receivedAt: pkg.received_at });
            
            for (const child of children) {
                labels.push({ boxNumber: child.box_number, totalBoxes: child.total_boxes,
                    tracking: child.tracking_internal, labelCode: child.tracking_internal,
                    masterTracking: pkg.tracking_internal, isMaster: false,
                    weight: parseFloat(child.weight),
                    dimensions: formatDimensions(parseFloat(child.pkg_length), parseFloat(child.pkg_width), parseFloat(child.pkg_height)),
                    clientName: resolvedName, clientBoxId: resolvedBoxId, description: child.description,
                    destinationCity: destCityFull, destinationCountry: destCountry, destinationCode,
                    carrier: pkg.carrier, receivedAt: pkg.received_at });
            }
        } else {
            labels.push({ boxNumber: 1, totalBoxes: 1, tracking: pkg.tracking_internal,
                labelCode: pkg.tracking_internal, isMaster: false, weight: parseFloat(pkg.weight),
                dimensions: formatDimensions(parseFloat(pkg.pkg_length), parseFloat(pkg.pkg_width), parseFloat(pkg.pkg_height)),
                clientName: resolvedName, clientBoxId: resolvedBoxId, description: pkg.description,
                destinationCity: destCityFull, destinationCountry: destCountry, destinationCode,
                carrier: pkg.carrier, receivedAt: pkg.received_at });
        }

        res.json({
            success: true,
            shipment: {
                master: { id: pkg.id, tracking: pkg.tracking_internal, trackingProvider: pkg.tracking_provider,
                    trackingCourier: pkg.tracking_provider, // Para PO Box, tracking del courier está en tracking_provider
                    description: pkg.description, weight: pkg.weight ? parseFloat(pkg.weight) : null,
                    declaredValue: pkg.declared_value ? parseFloat(pkg.declared_value) : null,
                    isMaster: pkg.is_master, totalBoxes: pkg.total_boxes || 1,
                    status: pkg.status, statusLabel: getStatusLabel(pkg.status),
                    receivedAt: pkg.received_at, deliveredAt: pkg.delivered_at,
                    destinationCity: destCityFull, destinationCountry: destCountry, destinationCode,
                    nationalCarrier: pkg.national_carrier || null,
                    nationalTracking: pkg.national_tracking || null,
                    nationalLabelUrl: pkg.national_label_url || null,
                    paymentStatus: pkg.payment_status || null,
                    clientPaid: pkg.client_paid === true,
                    clientPaidAt: pkg.client_paid_at || null,
                    totalCost: pkg.gex_total_cost ? parseFloat(pkg.gex_total_cost) : null,
                    poboxCostUsd: pkg.pobox_cost_usd ? parseFloat(pkg.pobox_cost_usd) : null,
                    assignedAddress: pkg.assigned_address_id ? {
                        id: pkg.assigned_address_id,
                        alias: pkg.addr_alias,
                        recipientName: pkg.addr_recipient,
                        street: pkg.addr_street,
                        exterior: pkg.addr_ext,
                        interior: pkg.addr_int,
                        neighborhood: pkg.addr_neighborhood,
                        city: pkg.addr_city,
                        state: pkg.addr_state,
                        zip: pkg.addr_zip,
                        phone: pkg.addr_phone,
                        reference: pkg.addr_reference,
                        carrierConfig: pkg.addr_carrier_config,
                    } : null,
                },
                children: children.map(c => ({ id: c.id, tracking: c.tracking_internal, boxNumber: c.box_number,
                    trackingCourier: c.tracking_provider, // Tracking del courier (Amazon, USPS, etc)
                    weight: parseFloat(c.weight), dimensions: { length: parseFloat(c.pkg_length),
                        width: parseFloat(c.pkg_width), height: parseFloat(c.pkg_height),
                        formatted: formatDimensions(parseFloat(c.pkg_length), parseFloat(c.pkg_width), parseFloat(c.pkg_height)) },
                    status: c.status, imageUrl: c.image_url || null })),
                labels,
                client: pkg.user_id 
                    ? { id: pkg.user_id, name: pkg.full_name || 'Sin nombre', email: pkg.email || '', boxId: pkg.user_box_id || 'N/A' } 
                    : { id: 0, name: resolvedName, email: '', boxId: resolvedBoxId }
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al buscar' });
    }
};

// ============ ACTUALIZAR ESTADO ============
export const updateShipmentStatus = async (req: Request, res: Response): Promise<void> => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const validStatuses: PackageStatus[] = ['received', 'received_mty', 'in_transit', 'customs', 'ready_pickup', 'out_for_delivery', 'returned_to_warehouse', 'delivered', 'reempacado', 'processing'];
        
        if (!validStatuses.includes(status)) {
            res.status(400).json({ error: 'Estado inválido', validStatuses });
            return;
        }

        await client.query('BEGIN');

        const pkgResult = await client.query('SELECT * FROM packages WHERE id = $1', [id]);
        if (pkgResult.rows.length === 0) { res.status(404).json({ error: 'No encontrado' }); return; }

        const pkg = pkgResult.rows[0];

        let updateQuery = `UPDATE packages SET status = $1, updated_at = CURRENT_TIMESTAMP`;
        const updateParams: (string | number)[] = [status];
        
        if (status === 'delivered') updateQuery += `, delivered_at = CURRENT_TIMESTAMP`;
        if (notes) { updateParams.push(notes); updateQuery += `, notes = COALESCE(notes, '') || E'\\n' || $${updateParams.length}`; }
        
        updateParams.push(Number(id));
        updateQuery += ` WHERE id = $${updateParams.length}`;

        await client.query(updateQuery, updateParams);

        const changedBy = (req as any)?.user?.userId || null;
        const statusNote = notes
            ? `Cambio de estado manual a ${getStatusLabel(status)}. ${notes}`
            : `Cambio de estado manual a ${getStatusLabel(status)}`;

        try {
            await client.query(
                `INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [Number(id), status, statusNote, changedBy]
            );
        } catch (historyError) {
            console.warn('No se pudo registrar package_history en updateShipmentStatus:', historyError);
        }

        if (pkg.is_master) {
            await client.query(`UPDATE packages SET status = $1, updated_at = CURRENT_TIMESTAMP
                ${status === 'delivered' ? ', delivered_at = CURRENT_TIMESTAMP' : ''} WHERE master_id = $2`, [status, id]);

            try {
                await client.query(
                    `INSERT INTO package_history (package_id, status, notes, created_by, created_at)
                     SELECT p.id, $2, $3, $4, NOW()
                     FROM packages p
                     WHERE p.master_id = $1`,
                    [Number(id), status, `Cambio heredado desde guía master a ${getStatusLabel(status)}`, changedBy]
                );
            } catch (historyError) {
                console.warn('No se pudo registrar package_history para guías hijas en updateShipmentStatus:', historyError);
            }
        }

        await client.query('COMMIT');

        res.json({ success: true, message: `Estado: ${getStatusLabel(status)}`,
            package: { id: pkg.id, tracking: pkg.tracking_internal, status, statusLabel: getStatusLabel(status), isMaster: pkg.is_master }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al actualizar' });
    } finally {
        client.release();
    }
};

const formatStatusLabelForMovement = (status: string | null | undefined): string => {
    if (!status) return 'Sin estado';
    const labels: Record<string, string> = {
        received: 'Recibido',
        received_mty: 'Recibido en CEDIS MTY',
        in_transit: 'En tránsito',
        customs: 'En aduana',
        ready_pickup: 'Listo para recoger',
        out_for_delivery: 'En ruta',
        returned_to_warehouse: 'Devuelto a bodega',
        delivered: 'Entregado',
        reempacado: 'Reempacado',
        processing: 'Procesando'
    };
    return labels[status] || status;
};

const getPackageMovementsBaseByTracking = async (tracking: string) => {
    const result = await pool.query(
        `SELECT p.id, p.user_id, p.status, p.created_at, p.updated_at, p.tracking_internal, p.tracking_provider,
                p.is_master
         FROM packages p
         WHERE UPPER(p.tracking_internal) = UPPER($1)
            OR UPPER(COALESCE(p.tracking_provider, '')) = UPPER($1)
         LIMIT 1`,
        [tracking]
    );

    return result.rows[0] || null;
};

const getPackageMovementsBaseById = async (id: number) => {
    const result = await pool.query(
        `SELECT p.id, p.user_id, p.status, p.created_at, p.updated_at, p.tracking_internal, p.tracking_provider,
                p.is_master
         FROM packages p
         WHERE p.id = $1
         LIMIT 1`,
        [id]
    );

    return result.rows[0] || null;
};

const statusProgressOrder: Record<string, number> = {
    received: 1,
    in_transit: 2,
    received_mty: 3,
    ready_pickup: 4,
    out_for_delivery: 4,
    delivered: 5,
    returned_to_warehouse: 5,
};

const inferLegacyMilestones = (pkg: any, movementRows: any[]): any[] => {
    const currentRank = statusProgressOrder[String(pkg.status)] || 0;
    if (currentRank < 1) return [];

    const existingStatuses = new Set(
        movementRows
            .filter((m) => Number(m.package_id) === Number(pkg.id))
            .map((m) => String(m.status))
    );

    const baseDate = pkg.created_at ? new Date(pkg.created_at) : new Date();
    const d1 = new Date(baseDate.getTime());
    const d2 = new Date(baseDate.getTime() + 60 * 1000);
    const d3 = new Date(baseDate.getTime() + 2 * 60 * 1000);

    const inferred: any[] = [];

    if (currentRank >= 1 && !existingStatuses.has('received')) {
        inferred.push({
            id: -1001,
            package_id: pkg.id,
            tracking: pkg.tracking_internal || pkg.tracking_provider,
            status: 'received',
            notes: 'Recibido en sucursal Hidalgo TX',
            created_at: d1.toISOString(),
            created_by: null,
            created_by_name: null,
        });
    }

    if (currentRank >= 2 && !existingStatuses.has('in_transit')) {
        inferred.push({
            id: -1002,
            package_id: pkg.id,
            tracking: pkg.tracking_internal || pkg.tracking_provider,
            status: 'in_transit',
            notes: 'En ruta a Monterrey, N.L.',
            created_at: d2.toISOString(),
            created_by: null,
            created_by_name: null,
        });
    }

    if (currentRank >= 3 && !existingStatuses.has('received_mty')) {
        inferred.push({
            id: -1003,
            package_id: pkg.id,
            tracking: pkg.tracking_internal || pkg.tracking_provider,
            status: 'received_mty',
            notes: 'Recibido en CEDIS MTY',
            created_at: pkg.status === 'received_mty' && pkg.updated_at ? pkg.updated_at : d3.toISOString(),
            created_by: null,
            created_by_name: null,
        });
    }

    return inferred;
};

const dedupeMovements = (rows: any[]): any[] => {
    if (rows.length <= 1) return rows;

    const sorted = [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const deduped: any[] = [];

    for (const row of sorted) {
        const last = deduped[deduped.length - 1];
        if (!last) {
            deduped.push(row);
            continue;
        }

        const samePackage = Number(last.package_id) === Number(row.package_id);
        const sameStatus = String(last.status) === String(row.status);
        const diffMs = Math.abs(new Date(last.created_at).getTime() - new Date(row.created_at).getTime());
        const nearInTime = diffMs <= 5000;

        if (samePackage && sameStatus && nearInTime) {
            const preferCurrent = !!row.created_by || (!!row.notes && !String(row.notes).startsWith('Cambio automático de estado:'));
            if (preferCurrent) {
                deduped[deduped.length - 1] = row;
            }
            continue;
        }

        deduped.push(row);
    }

    return deduped;
};

const buildPackageMovementsResponse = async (pkg: any) => {
    const idRows = await pool.query(
        `SELECT id FROM packages WHERE id = $1
         UNION
         SELECT id FROM packages WHERE master_id = $1`,
        [pkg.id]
    );
    const packageIds = idRows.rows.map((r: any) => Number(r.id));

    let movementRows: any[] = [];
    try {
        const movementsRes = await pool.query(
            `SELECT ph.id,
                    ph.package_id,
                    COALESCE(p.tracking_internal, p.tracking_provider) AS tracking,
                    ph.status,
                    ph.notes,
                    ph.created_at,
                    ph.created_by,
                    u.full_name AS created_by_name
             FROM package_history ph
             JOIN packages p ON p.id = ph.package_id
             LEFT JOIN users u ON u.id = ph.created_by
             WHERE ph.package_id = ANY($1::int[])
             ORDER BY ph.created_at DESC, ph.id DESC`,
            [packageIds]
        );
        movementRows = movementsRes.rows;
    } catch (error) {
        movementRows = [];
    }

    const hasInitialRow = movementRows.some((m) => Number(m.package_id) === Number(pkg.id));
    if (!hasInitialRow && pkg.created_at) {
        movementRows.push({
            id: -1,
            package_id: pkg.id,
            tracking: pkg.tracking_internal || pkg.tracking_provider,
            status: pkg.status,
            notes: 'Guía registrada en sistema',
            created_at: pkg.created_at,
            created_by: null,
            created_by_name: null
        });
    }

    const inferredMilestones = inferLegacyMilestones(pkg, movementRows);
    if (inferredMilestones.length > 0) {
        movementRows.push(...inferredMilestones);
    }

    movementRows = dedupeMovements(movementRows);

    const movements = movementRows
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((row) => ({
            id: row.id,
            package_id: row.package_id,
            tracking: row.tracking,
            status: row.status,
            status_label: formatStatusLabelForMovement(row.status),
            notes: row.notes,
            created_at: row.created_at,
            created_by: row.created_by,
            created_by_name: row.created_by_name,
            source: row.created_by ? 'manual' : 'system'
        }));

    return {
        success: true,
        tracking: pkg.tracking_internal || pkg.tracking_provider,
        current: {
            status: pkg.status,
            status_label: formatStatusLabelForMovement(pkg.status),
            updated_at: pkg.updated_at
        },
        movements
    };
};

export const getPackageMovementsByTracking = async (req: Request, res: Response): Promise<any> => {
    try {
        const tracking = String(req.params.tracking || '').trim();
        if (!tracking) return res.status(400).json({ success: false, error: 'Tracking requerido' });

        const pkg = await getPackageMovementsBaseByTracking(tracking);
        if (!pkg) return res.status(404).json({ success: false, error: 'Paquete no encontrado' });

        const user = (req as any).user;
        const requesterId = Number(user?.userId || 0);
        const requesterRole = String(user?.role || '').toLowerCase();
        const isClientRole = ['client', 'customer', 'usuario', 'user'].includes(requesterRole);
        if (isClientRole && requesterId !== Number(pkg.user_id)) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para ver estos movimientos' });
        }

        const response = await buildPackageMovementsResponse(pkg);
        return res.json(response);
    } catch (error: any) {
        console.error('Error getPackageMovementsByTracking:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener movimientos' });
    }
};

export const getPackageMovementsById = async (req: Request, res: Response): Promise<any> => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });

        const pkg = await getPackageMovementsBaseById(id);
        if (!pkg) return res.status(404).json({ success: false, error: 'Paquete no encontrado' });

        const user = (req as any).user;
        const requesterId = Number(user?.userId || 0);
        const requesterRole = String(user?.role || '').toLowerCase();
        const isClientRole = ['client', 'customer', 'usuario', 'user'].includes(requesterRole);
        if (isClientRole && requesterId !== Number(pkg.user_id)) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para ver estos movimientos' });
        }

        const response = await buildPackageMovementsResponse(pkg);
        return res.json(response);
    } catch (error: any) {
        console.error('Error getPackageMovementsById:', error);
        return res.status(500).json({ success: false, error: 'Error al obtener movimientos' });
    }
};

// ============ PAQUETES POR CLIENTE ============
export const getPackagesByClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const boxId = req.params.boxId as string;
        const result = await pool.query(`
            SELECT p.*, u.full_name, u.email, u.box_id FROM packages p
            JOIN users u ON p.user_id = u.id
            WHERE u.box_id = $1 AND (p.is_master = true OR p.master_id IS NULL)
            ORDER BY p.created_at DESC
        `, [(boxId).toUpperCase()]);

        const packages = result.rows.map(pkg => ({
            id: pkg.id, tracking: pkg.tracking_internal, description: pkg.description,
            weight: pkg.weight ? parseFloat(pkg.weight) : null, isMaster: pkg.is_master,
            totalBoxes: pkg.total_boxes || 1, status: pkg.status, statusLabel: getStatusLabel(pkg.status),
            receivedAt: pkg.received_at, deliveredAt: pkg.delivered_at
        }));

        res.json({ success: true, boxId: boxId.toUpperCase(), total: packages.length, packages });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error' });
    }
};

// Helper para status label marítimo
const getMaritimeStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
        'received_china': '📦 Recibido CEDIS GZ CHINA',
        'in_transit': '🚢 En Tránsito Marítimo',
        'at_port': '⚓ En Puerto',
        'customs_mx': '🛃 Aduana México',
        'in_transit_mx': '🚛 En Ruta a CEDIS',
        'received_cedis': '✅ En CEDIS',
        'ready_pickup': '📍 Listo para Recoger',
        'delivered': '✅ Entregado'
    };
    return labels[status] || status;
};

// Helper para status label TDI Aéreo China
const getChinaAirStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
        'received_china': '📦 Recibido China',
        'received_origin': '📦 En Bodega China',
        'in_transit': '✈️ En Tránsito',
        'at_customs': '🛃 En Aduana',
        'customs': '📋 Procesando - Guía impresa',
        'processing': '📋 Procesando - Guía impresa',
        'customs_mx': '🛃 Aduana México',
        'in_transit_mx': '🚛 En Ruta Cedis México',
        'received_cedis': '✅ En CEDIS',
        'ready_pickup': '📍 Listo Recoger',
        'in_transit_mty': '🚚 EN TRÁNSITO A MTY, N.L.',
        'out_for_delivery': '🛣️ EN RUTA',
        'shipped': '📤 ENVIADO',
        'delivered': '✅ Entregado'
    };
    return labels[status] || status;
};

// ============ MIS PAQUETES (APP MÓVIL) ============
export const getMyPackages = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;
        
        // Obtener box_id del usuario para búsqueda extendida
        const userResult = await pool.query(`SELECT box_id FROM users WHERE id = $1`, [userId]);
        const userBoxId = userResult.rows[0]?.box_id || null;
        
        // 1. Paquetes AÉREOS (USA PO Box) - Buscar por user_id O por box_id (sin duplicados)
        const airResult = await pool.query(`
            SELECT * FROM (
                SELECT DISTINCT ON (p.id) p.*, 
                       COALESCE(u.full_name, '') as full_name, 
                       COALESCE(p.box_id, u.box_id, $2) as client_box_id,
                       c.status as consolidation_status,
                       c.id as consolidation_id
                FROM packages p
                LEFT JOIN users u ON p.user_id = u.id
                LEFT JOIN consolidations c ON p.consolidation_id = c.id
                WHERE (p.user_id = $1 OR ($2 IS NOT NULL AND p.box_id = $2))
                  AND (p.is_master = true OR p.master_id IS NULL)
                ORDER BY p.id
            ) sub
            ORDER BY created_at DESC
        `, [userId, userBoxId]);

        // Obtener órdenes de pago pendientes para los paquetes del usuario
        const pendingPaymentsResult = await pool.query(`
            SELECT pp.id, pp.package_ids, pp.payment_reference, pp.status, pp.amount, pp.expires_at
            FROM pobox_payments pp
            WHERE pp.user_id = $1 
              AND pp.status IN ('pending', 'pending_payment')
              AND pp.payment_method = 'cash'
              AND pp.expires_at > CURRENT_TIMESTAMP
        `, [userId]);

        // Crear mapa de paquetes con orden de pago
        const packagePaymentMap: Record<number, { reference: string; amount: number; expires_at: string }> = {};
        pendingPaymentsResult.rows.forEach(payment => {
            try {
                const pkgIds = typeof payment.package_ids === 'string' 
                    ? JSON.parse(payment.package_ids) 
                    : payment.package_ids;
                if (Array.isArray(pkgIds)) {
                    pkgIds.forEach((pkgId: number) => {
                        packagePaymentMap[pkgId] = {
                            reference: payment.payment_reference,
                            amount: parseFloat(payment.amount),
                            expires_at: payment.expires_at
                        };
                    });
                }
            } catch (e) {
                console.log('Error parsing package_ids:', e);
            }
        });

        // Cargar paquetes hijos para los masters
        const masterIds = airResult.rows
            .filter(p => p.is_master)
            .map(p => p.id);
        
        let childrenByMaster: Record<number, any[]> = {};
        if (masterIds.length > 0) {
            const childrenResult = await pool.query(`
                SELECT * FROM packages WHERE master_id = ANY($1) ORDER BY box_number
            `, [masterIds]);
            
            // Agrupar hijos por master_id
            childrenResult.rows.forEach(child => {
                const masterId = child.master_id;
                if (masterId) {
                    if (!childrenByMaster[masterId]) {
                        childrenByMaster[masterId] = [];
                    }
                    childrenByMaster[masterId].push({
                        id: child.id,
                        tracking_internal: child.tracking_internal,
                        tracking_courier: child.tracking_provider,
                        weight: child.weight ? parseFloat(child.weight) : null,
                        dimensions: child.pkg_length && child.pkg_width && child.pkg_height 
                            ? `${child.pkg_length}×${child.pkg_width}×${child.pkg_height} cm` 
                            : null,
                        box_number: child.box_number,
                        description: child.description,
                        imageUrl: child.image_url || null
                    });
                }
            });
        }

        const airPackages = airResult.rows.map(pkg => {
            // DEBUG: Log de costos
            console.log(`📦 [getMyPackages] Package ${pkg.id}: assigned_cost_mxn=${pkg.assigned_cost_mxn}, saldo_pendiente=${pkg.saldo_pendiente}`);
            
            // Determinar el estado visible para el cliente
            let displayStatus = pkg.status;
            let displayLabel = getStatusLabel(pkg.status);
            
            // Si tiene consolidación y está shipped, mostrar "Vuelo Confirmado"
            if (pkg.consolidation_status === 'shipped') {
                displayStatus = 'shipped';
                displayLabel = '✈️ Vuelo Confirmado';
            } else if (pkg.consolidation_status === 'requested') {
                displayStatus = 'processing';
                displayLabel = '📋 Procesando Envío';
            }
            
            // Usar child_no como tracking si está disponible y tiene formato AIR
            const displayTracking = (pkg.child_no && pkg.child_no.startsWith('AIR')) 
                ? pkg.child_no 
                : pkg.tracking_internal;
            
            return {
                id: pkg.id,
                tracking_internal: displayTracking,
                tracking_provider: pkg.tracking_provider,
                description: pkg.description || null,
                weight: pkg.weight ? parseFloat(pkg.weight) : null,
                dimensions: pkg.pkg_length && pkg.pkg_width && pkg.pkg_height 
                    ? `${pkg.pkg_length}×${pkg.pkg_width}×${pkg.pkg_height} cm` 
                    : null,
                declared_value: pkg.declared_value ? parseFloat(pkg.declared_value) : null,
                status: displayStatus,
                statusLabel: displayLabel,
                carrier: pkg.national_carrier || pkg.carrier,
                national_carrier: pkg.national_carrier || null,
                national_tracking: pkg.national_tracking || null,
                national_label_url: pkg.national_label_url || null,
                national_shipping_cost: pkg.national_shipping_cost ? parseFloat(pkg.national_shipping_cost) : 0,
                destination_city: pkg.destination_city,
                destination_country: pkg.destination_country,
                image_url: pkg.image_url,
                is_master: pkg.is_master,
                total_boxes: pkg.total_boxes || 1,
                received_at: pkg.received_at,
                delivered_at: pkg.delivered_at,
                created_at: pkg.created_at,
                consolidation_id: pkg.consolidation_id,
                consolidation_status: pkg.consolidation_status,
                warehouse_location: pkg.warehouse_location,
                service_type: pkg.service_type || 'air',
                shipment_type: 'air',
                // 🛡️ GEX - Garantía Extendida
                has_gex: pkg.has_gex || false,
                gex_folio: pkg.gex_folio || null,
                // 💰 Costos
                assigned_cost_mxn: pkg.assigned_cost_mxn ? parseFloat(pkg.assigned_cost_mxn) : 0,
                saldo_pendiente: pkg.saldo_pendiente ? parseFloat(pkg.saldo_pendiente) : 0,
                monto_pagado: pkg.monto_pagado ? parseFloat(pkg.monto_pagado) : 0,
                client_paid: pkg.client_paid || false,
                // 💳 Orden de pago pendiente
                pending_payment_reference: packagePaymentMap[pkg.id]?.reference || null,
                pending_payment_amount: packagePaymentMap[pkg.id]?.amount || null,
                pending_payment_expires: packagePaymentMap[pkg.id]?.expires_at || null,
                // 📦 Instrucciones de entrega
                assigned_address_id: pkg.assigned_address_id || null,
                needs_instructions: pkg.needs_instructions !== false, // default true si no está definido
                // 📝 Información de entrega
                received_by: pkg.received_by || null, // Nombre de quien recibió el paquete
                delivery_recipient_name: pkg.delivery_recipient_name || null, // Nombre registrado al confirmar entrega
                // 📦📦 Paquetes hijos (si es master)
                child_packages: pkg.is_master ? (childrenByMaster[pkg.id] || []) : []
            };
        });

        // 2. Paquetes MARÍTIMOS (China) - Buscar por user_id O por shipping_mark
        const maritimeResult = await pool.query(`
            SELECT DISTINCT ON (mo.id) mo.*, 
                   ct.container_number,
                   ct.bl_number as container_bl
            FROM maritime_orders mo
            LEFT JOIN containers ct ON mo.container_id = ct.id
            WHERE mo.user_id = $1 OR ($2::text IS NOT NULL AND mo.shipping_mark = $2::text)
            ORDER BY mo.id, mo.created_at DESC
        `, [userId, userBoxId]);

        const maritimePackages = maritimeResult.rows.map(pkg => ({
            id: pkg.id + 100000, // Offset para evitar colisión de IDs
            tracking_internal: pkg.ordersn,
            tracking_provider: pkg.ship_number || pkg.bl_number || null,
            description: pkg.goods_name || 'Envío Marítimo',
            weight: pkg.weight ? parseFloat(pkg.weight) : null,
            volume: pkg.volume ? parseFloat(pkg.volume) : null,
            dimensions: null, // Marítimo no usa dimensiones, usa volumen
            declared_value: null,
            status: pkg.status,
            statusLabel: getMaritimeStatusLabel(pkg.status),
            carrier: 'Marítimo China',
            destination_city: 'CEDIS MTY',
            destination_country: 'MX',
            image_url: null,
            is_master: false,
            total_boxes: pkg.goods_num || 1,
            received_at: pkg.status === 'received_china' ? pkg.created_at : null,
            delivered_at: pkg.status === 'delivered' ? pkg.updated_at : null,
            created_at: pkg.created_at,
            consolidation_id: pkg.consolidation_id,
            consolidation_status: null,
            warehouse_location: pkg.current_location || 'China',
            service_type: 'maritime',
            shipment_type: 'maritime',
            // Info específica marítimo
            container_number: pkg.container_number || pkg.container_id,
            bl_number: pkg.bl_number || pkg.container_bl,
            shipping_mark: pkg.shipping_mark,
            has_gex: pkg.has_gex || false,
            gex_folio: pkg.gex_folio || null,
            // Instrucciones de entrega
            delivery_address_id: pkg.delivery_address_id || null,
            delivery_instructions: pkg.delivery_instructions || null,
            instructions_assigned_at: pkg.instructions_assigned_at || null
        }));

        // 3. Paquetes TDI AÉREO China (china_receipts) - Buscar por user_id O por shipping_mark
        const chinaAirResult = await pool.query(`
            SELECT DISTINCT ON (cr.id) cr.*, u.full_name, COALESCE(u.box_id, cr.shipping_mark) as box_id
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            WHERE cr.user_id = $1 OR ($2::text IS NOT NULL AND cr.shipping_mark = $2::text)
            ORDER BY cr.id, cr.created_at DESC
        `, [userId, userBoxId]);

        const chinaAirPackages = chinaAirResult.rows.map(pkg => ({
            id: pkg.id + 200000, // Offset para evitar colisión de IDs
            tracking_internal: pkg.fno,
            tracking_provider: pkg.international_tracking || null,
            description: `Aéreo China - ${pkg.total_qty || 1} cajas`,
            weight: pkg.total_weight ? parseFloat(pkg.total_weight) : null,
            volume: pkg.total_cbm ? parseFloat(pkg.total_cbm) : null,
            dimensions: null,
            declared_value: null,
            status: pkg.status,
            statusLabel: getChinaAirStatusLabel(pkg.status),
            carrier: 'Aéreo China',
            destination_city: 'CEDIS MTY',
            destination_country: 'MX',
            image_url: pkg.evidence_urls && pkg.evidence_urls.length > 0 ? pkg.evidence_urls[0] : null,
            is_master: false,
            total_boxes: pkg.total_qty || 1,
            received_at: pkg.created_at,
            delivered_at: pkg.status === 'delivered' ? pkg.updated_at : null,
            created_at: pkg.created_at,
            consolidation_id: null,
            consolidation_status: null,
            warehouse_location: pkg.status === 'received_origin' ? 'China' : 'En Tránsito',
            service_type: 'china_air',
            shipment_type: 'china_air',
            shipping_mark: pkg.shipping_mark,
            // 🛡️ GEX - Garantía Extendida
            has_gex: pkg.has_gex || false,
            gex_folio: pkg.gex_folio || null
        }));

        // 4. Paquetes DHL (dhl_shipments)
        const dhlResult = await pool.query(`
            SELECT ds.*, u.full_name, u.box_id
            FROM dhl_shipments ds
            LEFT JOIN users u ON ds.user_id = u.id
            WHERE ds.user_id = $1
            ORDER BY ds.created_at DESC
        `, [userId]);

        const dhlPackages = dhlResult.rows.map(pkg => {
            // Mapear estado DHL a estado visual
            const getDhlStatusLabel = (status: string): string => {
                const labels: Record<string, string> = {
                    'pending_inspection': '🔍 Pendiente Inspección',
                    'received_mty': '📦 Recibido MTY',
                    'inspected': '✅ Inspeccionado',
                    'pending_payment': '💳 Pendiente de Pago',
                    'paid': '✅ Pagado',
                    'dispatched': '🚚 Enviado',
                    'delivered': '✅ Entregado'
                };
                return labels[status] || status;
            };

            return {
                id: pkg.id + 300000, // Offset para evitar colisión de IDs
                tracking_internal: pkg.inbound_tracking,
                tracking_provider: pkg.national_tracking || null,
                description: pkg.description || 'Paquete DHL',
                weight: pkg.weight_kg ? parseFloat(pkg.weight_kg) : null,
                dimensions: pkg.length_cm && pkg.width_cm && pkg.height_cm 
                    ? `${pkg.length_cm}×${pkg.width_cm}×${pkg.height_cm} cm` 
                    : null,
                declared_value: pkg.import_cost_usd ? parseFloat(pkg.import_cost_usd) : null,
                status: pkg.status,
                statusLabel: getDhlStatusLabel(pkg.status),
                carrier: pkg.national_carrier || 'DHL Express',
                destination_city: 'MTY',
                destination_country: 'MX',
                image_url: pkg.photos && pkg.photos.length > 0 ? pkg.photos[0] : null,
                is_master: false,
                total_boxes: 1,
                received_at: pkg.inspected_at || pkg.created_at,
                delivered_at: pkg.status === 'delivered' ? pkg.updated_at : null,
                created_at: pkg.created_at,
                consolidation_id: null,
                consolidation_status: null,
                warehouse_location: 'mx_cedis',
                service_type: 'AA_DHL',
                shipment_type: 'dhl',
                // Info específica DHL
                import_cost_mxn: pkg.import_cost_mxn ? parseFloat(pkg.import_cost_mxn) : null,
                national_cost_mxn: pkg.national_cost_mxn ? parseFloat(pkg.national_cost_mxn) : null,
                total_cost_mxn: pkg.total_cost_mxn ? parseFloat(pkg.total_cost_mxn) : null,
                paid_at: pkg.paid_at,
                // GEX
                has_gex: pkg.has_gex || false,
                gex_folio: pkg.gex_folio || null
            };
        });

        // 5. Contenedores FCL (containers) - Full Container Load
        const fclResult = await pool.query(`
            SELECT c.*, 
                   lc.box_id as legacy_box_id,
                   lc.full_name as client_name
            FROM containers c
            LEFT JOIN legacy_clients lc ON c.legacy_client_id = lc.id
            WHERE c.client_user_id = $1 OR c.legacy_client_id IN (
                SELECT lc2.id FROM legacy_clients lc2 
                JOIN users u ON UPPER(u.box_id) = UPPER(lc2.box_id)
                WHERE u.id = $1
            )
            ORDER BY c.created_at DESC
        `, [userId]);

        const fclPackages = fclResult.rows.map(container => {
            // Mapear estado del container a estado visual
            const getFclStatusLabel = (status: string): string => {
                const labels: Record<string, string> = {
                    'draft': '📝 Borrador',
                    'pending': '⏳ Pendiente',
                    'received_origin': '📦 Recibido Origen',
                    'in_transit': '🚢 En Tránsito',
                    'arrived_port': '⚓ Llegó a Puerto',
                    'customs': '🛃 En Aduana',
                    'released': '✅ Liberado',
                    'in_yard': '🏭 En Patio',
                    'delivered': '✅ Entregado',
                    'closed': '🔒 Cerrado'
                };
                return labels[status] || status;
            };

            return {
                id: container.id + 400000, // Offset para evitar colisión de IDs
                tracking_internal: container.reference_code,
                tracking_provider: container.bl_number || null,
                description: `FCL ${container.container_number || 'Sin Contenedor'}`,
                weight: container.total_weight_kg ? parseFloat(container.total_weight_kg) : null,
                volume: container.total_cbm ? parseFloat(container.total_cbm) : null,
                dimensions: null,
                declared_value: null,
                status: container.status,
                statusLabel: getFclStatusLabel(container.status),
                carrier: container.shipping_line || 'Marítimo FCL',
                destination_city: 'MTY',
                destination_country: 'MX',
                image_url: null,
                is_master: true,
                total_boxes: container.total_packages || 1,
                received_at: container.created_at,
                delivered_at: container.status === 'delivered' ? container.updated_at : null,
                created_at: container.created_at,
                consolidation_id: null,
                consolidation_status: null,
                warehouse_location: container.current_location || 'En Tránsito',
                service_type: 'fcl',
                shipment_type: 'fcl',
                // Info específica FCL
                container_number: container.container_number,
                bl_number: container.bl_number,
                vessel_name: container.vessel_name,
                voyage_number: container.voyage_number,
                port_of_loading: container.port_of_loading,
                port_of_discharge: container.port_of_discharge,
                eta: container.eta,
                has_gex: false,
                gex_folio: null
            };
        });

        // Combinar todos los tipos
        const allPackages = [...airPackages, ...maritimePackages, ...chinaAirPackages, ...dhlPackages, ...fclPackages];
        
        // Ordenar por fecha de creación
        allPackages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        res.json(allPackages);
    } catch (error) {
        console.error('Error al obtener mis paquetes:', error);
        res.status(500).json({ error: 'Error al obtener mis paquetes' });
    }
};

// ============ ESTADÍSTICAS ============
export const getPackageStats = async (_req: Request, res: Response): Promise<void> => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE is_master = true OR master_id IS NULL) as total_shipments,
                COUNT(*) as total_packages,
                COUNT(*) FILTER (WHERE status = 'received' AND (is_master = true OR master_id IS NULL)) as received,
                COUNT(*) FILTER (WHERE status = 'in_transit' AND (is_master = true OR master_id IS NULL)) as in_transit,
                COUNT(*) FILTER (WHERE status = 'customs' AND (is_master = true OR master_id IS NULL)) as customs,
                COUNT(*) FILTER (WHERE status = 'ready_pickup' AND (is_master = true OR master_id IS NULL)) as ready_pickup,
                COUNT(*) FILTER (WHERE status = 'delivered' AND (is_master = true OR master_id IS NULL)) as delivered,
                COUNT(*) FILTER (WHERE DATE(received_at) = CURRENT_DATE AND (is_master = true OR master_id IS NULL)) as received_today
            FROM packages
        `);
        const data = stats.rows[0];

        res.json({ success: true, stats: {
            totalShipments: parseInt(data.total_shipments), totalPackages: parseInt(data.total_packages),
            byStatus: { received: parseInt(data.received), inTransit: parseInt(data.in_transit),
                customs: parseInt(data.customs), readyPickup: parseInt(data.ready_pickup), delivered: parseInt(data.delivered) },
            today: { received: parseInt(data.received_today) }
        }});
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error' });
    }
};

// ============ ETIQUETAS ============
export const getShipmentLabels = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const result = await pool.query(`SELECT p.*, u.full_name, u.email, u.box_id AS user_box_id, u.phone
            FROM packages p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = $1`, [id]);

        if (result.rows.length === 0) { res.status(404).json({ error: 'No encontrado' }); return; }

        const pkg = result.rows[0];

        // Resolver nombre y casillero: user > legacy_client (por box_id) > sin cliente
        let clientName = pkg.full_name || null;
        let clientBoxId = pkg.user_box_id || pkg.box_id || null;
        if (!clientName && pkg.box_id) {
            try {
                const legacyResult = await pool.query('SELECT full_name, box_id FROM legacy_clients WHERE UPPER(box_id) = UPPER($1)', [pkg.box_id]);
                if (legacyResult.rows.length > 0) {
                    clientName = legacyResult.rows[0].full_name;
                    clientBoxId = legacyResult.rows[0].box_id;
                }
            } catch (e) { /* ignore */ }
        }
        clientName = clientName || 'SIN CLIENTE';
        clientBoxId = clientBoxId || 'PENDIENTE';

        const labels = [];

        if (pkg.is_master) {
            labels.push({ boxNumber: 0, totalBoxes: pkg.total_boxes, tracking: pkg.tracking_internal,
                labelCode: pkg.tracking_internal, barcode: pkg.tracking_internal.replace(/-/g, ''),
                isMaster: true, client: { name: clientName, boxId: clientBoxId },
                clientName, clientBoxId,
                package: { description: pkg.description, weight: parseFloat(pkg.weight), totalBoxes: pkg.total_boxes },
                description: pkg.description, weight: parseFloat(pkg.weight),
                destinationCity: pkg.destination_city, destinationCountry: pkg.destination_country,
                carrier: pkg.carrier, receivedAt: pkg.received_at,
                printedAt: new Date().toISOString() });

            const children = await pool.query('SELECT * FROM packages WHERE master_id = $1 ORDER BY box_number', [id]);
            for (const child of children.rows) {
                labels.push({ boxNumber: child.box_number, totalBoxes: child.total_boxes,
                    tracking: child.tracking_internal, labelCode: child.tracking_internal,
                    barcode: child.tracking_internal.replace(/-/g, ''), masterTracking: pkg.tracking_internal,
                    isMaster: false, client: { name: clientName, boxId: clientBoxId },
                    clientName, clientBoxId,
                    package: { description: child.description, weight: parseFloat(child.weight),
                        dimensions: formatDimensions(parseFloat(child.pkg_length), parseFloat(child.pkg_width), parseFloat(child.pkg_height)) },
                    description: child.description, weight: parseFloat(child.weight),
                    dimensions: formatDimensions(parseFloat(child.pkg_length), parseFloat(child.pkg_width), parseFloat(child.pkg_height)),
                    destinationCity: pkg.destination_city, destinationCountry: pkg.destination_country,
                    carrier: pkg.carrier, receivedAt: pkg.received_at,
                    printedAt: new Date().toISOString() });
            }
        } else {
            labels.push({ boxNumber: 1, totalBoxes: 1, tracking: pkg.tracking_internal,
                labelCode: pkg.tracking_internal, barcode: pkg.tracking_internal.replace(/-/g, ''),
                isMaster: false, client: { name: clientName, boxId: clientBoxId },
                clientName, clientBoxId,
                package: { description: pkg.description, weight: parseFloat(pkg.weight),
                    dimensions: formatDimensions(parseFloat(pkg.pkg_length), parseFloat(pkg.pkg_width), parseFloat(pkg.pkg_height)) },
                description: pkg.description, weight: parseFloat(pkg.weight),
                dimensions: formatDimensions(parseFloat(pkg.pkg_length), parseFloat(pkg.pkg_width), parseFloat(pkg.pkg_height)),
                destinationCity: pkg.destination_city, destinationCountry: pkg.destination_country,
                carrier: pkg.carrier, receivedAt: pkg.received_at,
                printedAt: new Date().toISOString() });
        }

        res.json({ success: true, packageId: pkg.id, tracking: pkg.tracking_internal,
            isMaster: pkg.is_master, totalLabels: labels.length, labels });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error' });
    }
};

// ============ CREAR CONSOLIDACIÓN (Solicitud de Envío desde App) ============
export const createConsolidation = async (req: Request, res: Response): Promise<any> => {
    try {
        const { userId, packageIds } = req.body;

        // 1. Validar que haya paquetes
        if (!packageIds || packageIds.length === 0) {
            return res.status(400).json({ error: 'No seleccionaste paquetes' });
        }

        // 2. Verificar que los paquetes no tengan ya consolidation_id (ya fueron procesados)
        const packagesCheck = await pool.query(
            'SELECT id, consolidation_id, status, tracking_internal FROM packages WHERE id = ANY($1)',
            [packageIds]
        );

        // Filtrar paquetes que ya tienen consolidación
        const alreadyConsolidated = packagesCheck.rows.filter(p => p.consolidation_id !== null);
        if (alreadyConsolidated.length > 0) {
            // Si TODOS ya tienen consolidación, retornar el ID de la consolidación existente
            if (alreadyConsolidated.length === packageIds.length) {
                const existingConsolidationId = alreadyConsolidated[0].consolidation_id;
                return res.status(200).json({
                    message: 'Tu envío ya está en proceso',
                    orderId: existingConsolidationId,
                    alreadyProcessed: true
                });
            }
        }

        // Calcular peso total solo de paquetes sin consolidar
        const validPackageIds = packagesCheck.rows
            .filter(p => p.consolidation_id === null)
            .map(p => p.id);
        
        if (validPackageIds.length === 0) {
            return res.status(400).json({ error: 'Todos los paquetes seleccionados ya están en proceso' });
        }

        const weightResult = await pool.query(
            'SELECT SUM(weight) as total FROM packages WHERE id = ANY($1)',
            [validPackageIds]
        );
        const totalWeight = weightResult.rows[0].total || 0;

        // 3. Crear la Consolidación (La "Carpeta" del pedido)
        const consolidationResult = await pool.query(
            'INSERT INTO consolidations (user_id, total_weight, status) VALUES ($1, $2, $3) RETURNING id',
            [userId, totalWeight, 'requested']
        );
        const consolidationId = consolidationResult.rows[0].id;

        // 4. Actualizar los paquetes: Los marcamos como "En Proceso" y los vinculamos a la orden
        await pool.query(
            `UPDATE packages 
             SET status = 'in_transit', consolidation_id = $1 
             WHERE id = ANY($2)`,
            [consolidationId, validPackageIds]
        );

        // 5. ¡Éxito!
        res.status(201).json({
            message: 'Orden creada exitosamente',
            orderId: consolidationId
        });

    } catch (error) {
        console.error('Error al crear consolidación:', error);
        res.status(500).json({ error: 'Error al consolidar' });
    }
};

// ============ ADMIN: Ver todas las consolidaciones (Órdenes de salida) ============
export const getAdminConsolidations = async (req: Request, res: Response): Promise<any> => {
    try {
        // JOIN para traer: Datos de consolidación + Box ID + Paquetes del usuario (solo US-)
        const query = `
            SELECT 
                c.id, 
                c.status, 
                c.total_weight, 
                c.created_at,
                u.box_id,
                (SELECT COUNT(*) FROM packages p WHERE p.user_id = c.user_id AND p.tracking_internal LIKE 'US-%' AND p.service_type = 'POBOX_USA') as package_count,
                (SELECT STRING_AGG(p.tracking_internal, ', ') FROM packages p WHERE p.user_id = c.user_id AND p.tracking_internal LIKE 'US-%' AND p.service_type = 'POBOX_USA') as trackings
            FROM consolidations c
            JOIN users u ON c.user_id = u.id
            ORDER BY c.created_at DESC
        `;
        
        const response = await pool.query(query);
        res.json(response.rows);
    } catch (error) {
        console.error('Error al obtener consolidaciones:', error);
        res.status(500).json({ error: 'Error al obtener consolidaciones' });
    }
};

// ============ ADMIN: Despachar consolidación (Confirmar salida) ============
export const dispatchConsolidation = async (req: Request, res: Response): Promise<any> => {
    try {
        const { consolidationId, masterTracking } = req.body;

        if (!consolidationId) {
            return res.status(400).json({ error: 'El ID de consolidación es requerido' });
        }

        // 1. Verificar que la consolidación existe y está en estado 'requested'
        const checkQuery = await pool.query(
            'SELECT id, status FROM consolidations WHERE id = $1',
            [consolidationId]
        );

        if (checkQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Consolidación no encontrada' });
        }

        if (checkQuery.rows[0].status === 'shipped') {
            return res.status(400).json({ error: 'Esta consolidación ya fue despachada' });
        }

        // 2. Actualizar estatus de la Consolidación a 'in_transit' y guardar fecha de despacho
        await pool.query(
            `UPDATE consolidations 
             SET status = 'in_transit', updated_at = NOW(), dispatched_at = NOW(), master_tracking = $2
             WHERE id = $1`,
            [consolidationId, masterTracking || null]
        );

        // 3. Actualizar los paquetes: cambiar estado y opcionalmente guardar guía master
        if (masterTracking) {
            await pool.query(
                `UPDATE packages 
                 SET status = 'in_transit', tracking_provider = $1, updated_at = NOW() 
                 WHERE consolidation_id = $2`,
                [masterTracking, consolidationId]
            );
        } else {
            await pool.query(
                `UPDATE packages 
                 SET status = 'in_transit', updated_at = NOW() 
                 WHERE consolidation_id = $1`,
                [consolidationId]
            );
        }

        res.json({ 
            message: 'Consolidación despachada exitosamente',
            consolidationId,
            masterTracking: masterTracking || null,
            dispatchedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error al despachar consolidación:', error);
        res.status(500).json({ error: 'Error al despachar consolidación' });
    }
};

// ============ ASIGNAR INSTRUCCIONES DE ENTREGA (GENÉRICO) ============
/**
 * Endpoint genérico para asignar dirección e instrucciones de entrega
 * Funciona para: packages (PO Box USA), maritime_orders, china_receipts
 */
export const assignDeliveryInstructions = async (req: Request, res: Response) => {
    try {
        const { packageId, packageType } = req.params; // packageType: 'usa' | 'maritime' | 'china_air' | 'dhl'
        const { deliveryAddressId, deliveryInstructions, carrier, carrierCost, carrierName } = req.body;
        const userId = (req as any).user.userId;
        const userRole = (req as any).user.role;

        console.log(`📦 [Instrucciones Entrega] Usuario ${userId} (${userRole}) actualizando ${packageType}/${packageId}`);
        console.log(`   Carrier: ${carrier}, Costo: ${carrierCost}, Nombre: ${carrierName}`);

        // Determinar si es Pick Up en sucursal
        const isPickup = carrier === 'pickup_hidalgo';

        // Verificar si es admin/operador para permitir actualizar paquetes de otros usuarios
        const isAdmin = ['admin', 'superadmin', 'ops_mx', 'ops_usa', 'ops_usa_pobox'].includes(userRole);

        // Verificar que la dirección existe y pertenece al usuario (solo si no es pickup y no es admin)
        if (deliveryAddressId && !isPickup && !isAdmin) {
            const addressCheck = await pool.query(`
                SELECT id FROM addresses 
                WHERE id = $1 AND user_id = $2
            `, [deliveryAddressId, userId]);

            if (addressCheck.rows.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Dirección no válida' 
                });
            }
        }

        let result;
        // Query para verificar dueño del paquete o permitir si es admin
        const ownerCondition = isAdmin ? '' : ` AND user_id = ${userId}`;

        // Según el tipo, actualizar la tabla correspondiente
        switch (packageType) {
            case 'usa':
            case 'pobox':
            case 'air':  // PO Box USA y REPACK envían shipment_type='air'
                // Obtener TC actual (necesario para pickup y para cambio desde pickup)
                const tcResult = await pool.query(
                    "SELECT tipo_cambio_final FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE LIMIT 1"
                );
                const tc = parseFloat(tcResult.rows[0]?.tipo_cambio_final) || 18.00;
                
                // Paquetes USA (tabla packages)
                if (isPickup) {
                    
                    // Obtener datos actuales del paquete para recalcular
                    const pkgData = await pool.query(`
                        SELECT total_boxes, pobox_venta_usd, gex_total_cost, national_shipping_cost
                        FROM packages WHERE id = $1
                    `, [packageId]);
                    
                    const pkg = pkgData.rows[0];
                    const totalBoxes = pkg?.total_boxes || 1;
                    
                    // Para Pick Up: SOLO cobrar $3 USD por caja (sin PO Box, sin GEX, sin envío nacional)
                    const pickupFeeUsd = 3 * totalBoxes;
                    const pickupFeeMxn = pickupFeeUsd * tc;
                    
                    // El costo total es SOLO el cargo de pickup
                    const newTotalMxn = pickupFeeMxn;
                    
                    console.log(`📦 [Pick Up] Recalculando costos para paquete ${packageId}:`);
                    console.log(`   Pick Up Fee: ${totalBoxes} cajas × $3 USD × TC $${tc} = $${pickupFeeMxn.toFixed(2)} MXN`);
                    console.log(`   TOTAL A COBRAR: $${newTotalMxn.toFixed(2)} MXN (solo pickup, sin PO Box)`);
                    
                    // Pick Up en sucursal - cambiar status, carrier, y recalcular costos
                    result = await pool.query(`
                        UPDATE packages 
                        SET status = 'ready_pickup',
                            carrier = 'Pick Up Hidalgo TX',
                            national_shipping_cost = $1,
                            assigned_cost_mxn = $2,
                            saldo_pendiente = $2,
                            notes = COALESCE($3, notes),
                            needs_instructions = false,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $4${ownerCondition}
                        RETURNING id, tracking_internal
                    `, [pickupFeeMxn, newTotalMxn, deliveryInstructions, packageId]);
                } else {
                    // Entrega a domicilio - verificar si viene de Pick Up para recalcular costos
                    const currentPkg = await pool.query(
                        'SELECT status, pobox_venta_usd, gex_total_cost FROM packages WHERE id = $1',
                        [packageId]
                    );
                    const wasPickup = currentPkg.rows[0]?.status === 'ready_pickup';
                    
                    if (wasPickup) {
                        // Viene de Pick Up, recalcular costos con PO Box + carrier
                        const poboxVentaUsd = parseFloat(currentPkg.rows[0]?.pobox_venta_usd) || 0;
                        const gexCost = parseFloat(currentPkg.rows[0]?.gex_total_cost) || 0;
                        const poboxMxn = poboxVentaUsd * tc;
                        const shippingCostMxn = parseFloat(carrierCost) || 0;
                        const newTotalMxn = poboxMxn + gexCost + shippingCostMxn;
                        
                        console.log(`📦 [Cambio de Pick Up] Recalculando costos para paquete ${packageId}:`);
                        console.log(`   PO Box: $${poboxVentaUsd} USD = $${poboxMxn.toFixed(2)} MXN`);
                        console.log(`   GEX: $${gexCost.toFixed(2)} MXN`);
                        console.log(`   Envío Nacional: $${shippingCostMxn.toFixed(2)} MXN`);
                        console.log(`   NUEVO TOTAL: $${newTotalMxn.toFixed(2)} MXN`);
                        
                        result = await pool.query(`
                            UPDATE packages 
                            SET assigned_address_id = $1, 
                                status = 'received',
                                carrier = $2,
                                national_shipping_cost = $3,
                                assigned_cost_mxn = $4,
                                saldo_pendiente = $4,
                                notes = COALESCE($5, notes),
                                needs_instructions = false,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $6${ownerCondition}
                            RETURNING id, tracking_internal
                        `, [deliveryAddressId, carrierName || carrier, shippingCostMxn, newTotalMxn, deliveryInstructions, packageId]);
                    } else {
                        // Asignación normal de dirección - guardar también carrier y costo de envío
                        const shippingCostMxn = parseFloat(carrierCost) || 0;
                        
                        // Recalcular total: PO Box + GEX + envío nacional
                        const currentPkgData = await pool.query(
                            'SELECT pobox_venta_usd, gex_total_cost, monto_pagado FROM packages WHERE id = $1',
                            [packageId]
                        );
                        const poboxVentaUsd = parseFloat(currentPkgData.rows[0]?.pobox_venta_usd) || 0;
                        const gexCost = parseFloat(currentPkgData.rows[0]?.gex_total_cost) || 0;
                        const montoPagado = parseFloat(currentPkgData.rows[0]?.monto_pagado) || 0;
                        const poboxMxn = poboxVentaUsd * tc;
                        const newTotalMxn = poboxMxn + gexCost + shippingCostMxn;
                        const nuevoSaldo = Math.max(0, newTotalMxn - montoPagado);
                        
                        console.log(`📦 [Asignación Normal] Paquete ${packageId}:`);
                        console.log(`   Carrier: ${carrierName || carrier}, Costo envío: $${shippingCostMxn.toFixed(2)} MXN`);
                        console.log(`   PO Box: $${poboxVentaUsd} USD × TC $${tc} = $${poboxMxn.toFixed(2)} MXN`);
                        console.log(`   GEX: $${gexCost.toFixed(2)}, Envío: $${shippingCostMxn.toFixed(2)}`);
                        console.log(`   TOTAL: $${newTotalMxn.toFixed(2)} MXN, Pagado: $${montoPagado.toFixed(2)}, Saldo: $${nuevoSaldo.toFixed(2)}`);
                        
                        result = await pool.query(`
                            UPDATE packages 
                            SET assigned_address_id = $1, 
                                notes = COALESCE($2, notes),
                                needs_instructions = false,
                                national_carrier = $4,
                                national_shipping_cost = $5,
                                assigned_cost_mxn = $6,
                                saldo_pendiente = $7,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $3${ownerCondition}
                            RETURNING id, tracking_internal
                        `, [deliveryAddressId, deliveryInstructions, packageId, carrierName || carrier || 'EntregaX Local', shippingCostMxn, newTotalMxn, nuevoSaldo]);
                    }
                }
                break;

            case 'maritime':
                // Órdenes marítimas
                result = await pool.query(`
                    UPDATE maritime_orders 
                    SET delivery_address_id = $1, 
                        delivery_instructions = $2,
                        national_carrier = $4,
                        national_shipping_cost = COALESCE($5, 0),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3${ownerCondition}
                    RETURNING id, ordersn as tracking_internal
                `, [deliveryAddressId, deliveryInstructions, packageId, carrierName || carrier || null, parseFloat(carrierCost) || 0]);
                break;

            case 'china_air':
            case 'dhl':
                // Paquetes de China (china_receipts) o DHL vienen de packages
                result = await pool.query(`
                    UPDATE packages 
                    SET assigned_address_id = $1, 
                        notes = COALESCE($2, notes),
                        needs_instructions = false,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3${ownerCondition}
                    RETURNING id, tracking_internal
                `, [deliveryAddressId, deliveryInstructions, packageId]);
                break;

            default:
                return res.status(400).json({ 
                    success: false, 
                    error: `Tipo de paquete no soportado: ${packageType}` 
                });
        }

        if (result.rowCount === 0) {
            // Verificar si el paquete existe para dar mejor mensaje de error
            let existsQuery;
            if (packageType === 'maritime') {
                existsQuery = await pool.query('SELECT id, user_id FROM maritime_orders WHERE id = $1', [packageId]);
            } else {
                existsQuery = await pool.query('SELECT id, user_id FROM packages WHERE id = $1', [packageId]);
            }
            
            if (existsQuery.rows.length === 0) {
                console.log(`❌ Paquete ${packageId} no existe en la base de datos`);
                return res.status(404).json({ 
                    success: false, 
                    error: `Paquete #${packageId} no encontrado` 
                });
            } else {
                console.log(`❌ Usuario ${userId} no tiene permiso para paquete ${packageId} (dueño: ${existsQuery.rows[0].user_id})`);
                return res.status(403).json({ 
                    success: false, 
                    error: 'No tienes permiso para modificar este paquete' 
                });
            }
        }

        // Si es pickup y es un paquete master (tiene hijos), actualizar también los child packages
        if (isPickup && (packageType === 'usa' || packageType === 'pobox' || packageType === 'air')) {
            await pool.query(`
                UPDATE packages 
                SET status = 'ready_pickup',
                    carrier = 'Pick Up Hidalgo TX',
                    needs_instructions = false,
                    updated_at = CURRENT_TIMESTAMP
                WHERE master_id = $1
            `, [packageId]);
            console.log(`✅ Child packages actualizados a "ready_pickup" con carrier "Pick Up Hidalgo TX"`);
        }
        
        // Si viene de pickup y se cambió a otro método, actualizar child packages también
        if (!isPickup && (packageType === 'usa' || packageType === 'pobox' || packageType === 'air')) {
            // Verificar si hay child packages que estaban en ready_pickup
            const childUpdate = await pool.query(`
                UPDATE packages 
                SET status = 'received',
                    carrier = NULL,
                    needs_instructions = false,
                    updated_at = CURRENT_TIMESTAMP
                WHERE master_id = $1 AND status = 'ready_pickup'
                RETURNING id
            `, [packageId]);
            if (childUpdate.rowCount && childUpdate.rowCount > 0) {
                console.log(`✅ ${childUpdate.rowCount} child packages cambiados de "ready_pickup" a "received"`);
            }
        }

        console.log(`✅ Instrucciones asignadas a ${result.rows[0].tracking_internal}`);

        res.json({ 
            success: true, 
            message: isPickup ? 'Paquete listo para recoger en sucursal' : 'Instrucciones de entrega guardadas',
            packageId: result.rows[0].id,
            tracking: result.rows[0].tracking_internal
        });

    } catch (error) {
        console.error('Error al asignar instrucciones:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al guardar instrucciones de entrega' 
        });
    }
};

// ============ OBTENER DETALLE DE PAQUETE POR ID ============
export const getPackageById = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const user = (req as any).user;

        // Consulta del paquete con todos los detalles
        const result = await pool.query(`
            SELECT 
                p.id,
                p.tracking_internal,
                p.tracking_provider,
                p.description,
                p.weight,
                p.dimensions,
                p.long_cm,
                p.width_cm,
                p.height_cm,
                p.pkg_length,
                p.pkg_width,
                p.pkg_height,
                p.single_cbm,
                p.declared_value,
                p.status,
                p.carrier,
                p.image_url,
                p.has_gex,
                p.gex_folio,
                p.assigned_cost_mxn,
                p.saldo_pendiente,
                p.monto_pagado,
                p.warehouse_location,
                p.service_type,
                p.created_at,
                p.updated_at,
                p.user_id,
                p.registered_exchange_rate,
                p.pobox_tarifa_nivel,
                p.pobox_venta_usd,
                p.pobox_service_cost,
                p.national_shipping_cost,
                p.is_master,
                p.total_boxes,
                u.box_id,
                u.full_name as client_name
            FROM packages p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paquete no encontrado' 
            });
        }

        const pkg = result.rows[0];

        // Verificar que el usuario puede ver este paquete
        // (es el dueño o es empleado con nivel suficiente)
        if (user.role_level < 50 && pkg.user_id !== user.id) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tienes permiso para ver este paquete' 
            });
        }

        // Construir dimensiones desde columnas individuales si no hay JSON
        // Prioridad: pkg_length/pkg_width/pkg_height (PO Box) > long_cm/width_cm/height_cm > dimensions JSON
        let dimensions = pkg.dimensions;
        if (!dimensions) {
            // Primero intentar con pkg_length (usado en PO Box)
            if (pkg.pkg_length && pkg.pkg_width && pkg.pkg_height) {
                dimensions = {
                    length: parseFloat(pkg.pkg_length),
                    width: parseFloat(pkg.pkg_width),
                    height: parseFloat(pkg.pkg_height)
                };
            } 
            // Luego intentar con long_cm (usado en otros servicios)
            else if (pkg.long_cm && pkg.width_cm && pkg.height_cm) {
                dimensions = {
                    length: parseFloat(pkg.long_cm),
                    width: parseFloat(pkg.width_cm),
                    height: parseFloat(pkg.height_cm)
                };
            }
        }

        // Calcular CBM si hay dimensiones
        let cbm = pkg.single_cbm ? parseFloat(pkg.single_cbm) : 0;
        if (!cbm && dimensions) {
            const l = dimensions.length || 0;
            const w = dimensions.width || 0;
            const h = dimensions.height || 0;
            cbm = (l * w * h) / 1000000; // cm³ a m³
        }

        // 🔍 DEBUG: Log para verificar datos
        console.log(`📦 getPackageById #${pkg.id}: pkg_length=${pkg.pkg_length}, pkg_width=${pkg.pkg_width}, pkg_height=${pkg.pkg_height}`);
        console.log(`   dimensions=${JSON.stringify(dimensions)}, cbm=${cbm}, cost=${pkg.assigned_cost_mxn}`);

        // Formatear respuesta
        const packageDetail = {
            id: pkg.id,
            tracking_internal: pkg.tracking_internal,
            tracking_provider: pkg.tracking_provider,
            description: pkg.description,
            weight: pkg.weight ? parseFloat(pkg.weight) : null,
            dimensions: dimensions,
            cbm: cbm,
            declared_value: pkg.declared_value ? parseFloat(pkg.declared_value) : null,
            status: pkg.status,
            carrier: pkg.carrier,
            image_url: pkg.image_url,
            has_gex: pkg.has_gex || false,
            gex_folio: pkg.gex_folio,
            assigned_cost_mxn: pkg.assigned_cost_mxn ? parseFloat(pkg.assigned_cost_mxn) : 0,
            saldo_pendiente: pkg.saldo_pendiente ? parseFloat(pkg.saldo_pendiente) : 0,
            monto_pagado: pkg.monto_pagado ? parseFloat(pkg.monto_pagado) : 0,
                client_paid: pkg.client_paid || false,
            warehouse_location: pkg.warehouse_location,
            service_type: pkg.service_type,
            created_at: pkg.created_at,
            updated_at: pkg.updated_at,
            // Multi-guía
            is_master: pkg.is_master || false,
            total_boxes: pkg.total_boxes || 1,
            // Nuevos campos PO Box
            registered_exchange_rate: pkg.registered_exchange_rate ? parseFloat(pkg.registered_exchange_rate) : null,
            pobox_tarifa_nivel: pkg.pobox_tarifa_nivel || null,
            pobox_venta_usd: pkg.pobox_venta_usd ? parseFloat(pkg.pobox_venta_usd) : null,
            pobox_service_cost: pkg.pobox_service_cost ? parseFloat(pkg.pobox_service_cost) : null,
            national_shipping_cost: pkg.national_shipping_cost ? parseFloat(pkg.national_shipping_cost) : null,
            client: {
                id: pkg.user_id,
                box_id: pkg.box_id,
                name: pkg.client_name
            }
        };

        res.json({
            success: true,
            package: packageDetail
        });

    } catch (error: any) {
        console.error('❌ Error al obtener detalle del paquete:', error);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener detalle del paquete',
            details: error.message 
        });
    }
};

// Aliases
export const createPackage = createShipment;
export const getPackageByTracking = getShipmentByTracking;
export const updatePackageStatus = updateShipmentStatus;
export const getPackageLabels = getShipmentLabels;

// ============================================
// ENDPOINT: ACTUALIZAR CLIENTE DE UN PAQUETE
// ============================================
export const updatePackageClient = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const { boxId } = req.body;

        if (!boxId || !boxId.trim()) {
            // Desasignar cliente
            await pool.query(
                `UPDATE packages SET user_id = NULL, box_id = NULL, updated_at = NOW() WHERE id = $1`,
                [id]
            );
            return res.json({ success: true, client: null, message: 'Cliente desasignado' });
        }

        const upperBoxId = boxId.trim().toUpperCase();

        // Buscar en users
        const userResult = await pool.query(
            `SELECT id, full_name, email, box_id FROM users WHERE UPPER(box_id) = $1`,
            [upperBoxId]
        );

        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            await pool.query(
                `UPDATE packages SET user_id = $1, box_id = $2, updated_at = NOW() WHERE id = $3`,
                [user.id, user.box_id, id]
            );
            return res.json({
                success: true,
                client: { id: user.id, name: user.full_name, email: user.email, boxId: user.box_id },
                message: `Cliente asignado: ${user.full_name} (${user.box_id})`
            });
        }

        // Buscar en legacy_clients
        const legacyResult = await pool.query(
            `SELECT id, full_name, box_id FROM legacy_clients WHERE UPPER(box_id) = $1`,
            [upperBoxId]
        );

        if (legacyResult.rows.length > 0) {
            const legacy = legacyResult.rows[0];
            await pool.query(
                `UPDATE packages SET user_id = NULL, box_id = $1, updated_at = NOW() WHERE id = $2`,
                [legacy.box_id, id]
            );
            return res.json({
                success: true,
                client: { id: null, name: legacy.full_name, email: '', boxId: legacy.box_id },
                message: `Cliente legacy asignado: ${legacy.full_name} (${legacy.box_id})`
            });
        }

        return res.status(404).json({ error: `No existe cliente con casillero ${boxId}` });
    } catch (error: any) {
        console.error('Error actualizando cliente del paquete:', error);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
};

// ============================================
// ENDPOINT: SOLICITAR REEMPAQUE
// ============================================
interface RepackRequest {
    packageIds: number[];
    repackBox: {
        length: number;
        width: number;
        height: number;
        volume: number;
        maxWeight: number;
        serviceCostUSD: number;
    };
    totalWeight: number;
    totalVolume: number;
}

export const requestRepack = async (req: Request, res: Response): Promise<void> => {
    // NOTA: Usar pool directamente en lugar de transacciones que no persisten
    try {
        const { packageIds, repackBox, totalWeight, totalVolume } = req.body as RepackRequest;
        const userId = (req as any).user?.userId || (req as any).userId;
        
        console.log(`📦 [REPACK] Solicitud recibida - userId: ${userId}, paquetes: ${packageIds?.join(', ')}`);
        console.log(`📦 [REPACK] Pool stats: total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`);
        
        // Test de conexión
        const testConn = await pool.query('SELECT 1 as test');
        console.log(`📦 [REPACK] Test conexión OK: ${testConn.rows[0]?.test}`);
        
        if (!packageIds || packageIds.length < 2) {
            res.status(400).json({ error: 'Se requieren al menos 2 paquetes para reempacar' });
            return;
        }
        
        // Validar peso total
        if (totalWeight > repackBox.maxWeight) {
            res.status(400).json({ error: `El peso total (${totalWeight.toFixed(1)} kg) excede el límite de ${repackBox.maxWeight} kg` });
            return;
        }
        
        // Validar volumen total (80% eficiencia)
        const maxUsableVolume = repackBox.volume * 0.80;
        if (totalVolume > maxUsableVolume) {
            res.status(400).json({ error: `El volumen total excede la capacidad útil de la caja de reempaque` });
            return;
        }
        
        // SIN BEGIN - usar auto-commit
        
        // Obtener información de los paquetes a reempacar
        const packagesResult = await pool.query(`
            SELECT p.*, u.box_id, u.full_name
            FROM packages p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ANY($1)
        `, [packageIds]);
        
        if (packagesResult.rows.length !== packageIds.length) {
            res.status(400).json({ error: 'Uno o más paquetes no existen' });
            return;
        }
        
        // Verificar que todos los paquetes pertenezcan al mismo usuario
        const uniqueUsers = new Set(packagesResult.rows.map(p => p.user_id));
        if (uniqueUsers.size > 1) {
            res.status(400).json({ error: 'Todos los paquetes deben pertenecer al mismo cliente' });
            return;
        }
        
        const packages = packagesResult.rows;
        const firstPkg = packages[0];
        
        // Generar tracking para el paquete consolidado
        const consolidatedTracking = `US-REPACK-${Date.now().toString(36).toUpperCase().slice(-4)}`;
        
        // Calcular peso volumétrico de la caja de reempaque
        const volumetricWeight = repackBox.volume / 5000; // 16 kg para 40x40x50
        const billedWeight = Math.max(totalWeight, volumetricWeight);
        
        // =====================================================
        // CALCULAR COSTO: Tarifa PO Box (40x40x50) + $10 USD consolidación
        // =====================================================
        
        // 1. Calcular costo del servicio PO Box para la caja de reempaque
        const repackBoxItem = [{
            length: repackBox.length,
            width: repackBox.width,
            height: repackBox.height,
            weight: billedWeight
        }];
        
        let poboxCost;
        try {
            poboxCost = await calculatePOBoxCost(pool, repackBoxItem as BoxItem[]);
        } catch (calcError) {
            console.error('Error calculando costo PO Box:', calcError);
            poboxCost = { totalMxn: 0, cbm: 0, poboxServiceCost: 0, registeredExchangeRate: 0 };
        }
        
        // 2. Cargo de consolidación ($10 USD)
        const consolidationCostUsd = repackBox.serviceCostUSD || 10.00;
        
        // 3. Obtener tipo de cambio para consolidación
        let exchangeRate = poboxCost.registeredExchangeRate || 17.50;
        if (!exchangeRate || exchangeRate === 0) {
            try {
                const tcResult = await pool.query(
                    "SELECT tipo_cambio_final FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE LIMIT 1"
                );
                exchangeRate = parseFloat(tcResult.rows[0]?.tipo_cambio_final) || 17.50;
            } catch (e) {
                console.log('Usando TC default para reempaque');
            }
        }
        
        const consolidationCostMxn = consolidationCostUsd * exchangeRate;
        
        // 4. TOTAL = Precio venta PO Box + Consolidación
        const precioVentaUsd = (poboxCost as any).precioVentaUsd || 0;
        const precioVentaMxn = (poboxCost as any).precioVentaMxn || (precioVentaUsd * exchangeRate);
        const totalUsd = precioVentaUsd + consolidationCostUsd;
        const totalMxn = precioVentaMxn + consolidationCostMxn;
        
        console.log(`📦 REEMPAQUE - Cálculo de costos:`);
        console.log(`   Caja: ${repackBox.length}x${repackBox.width}x${repackBox.height} cm`);
        console.log(`   Tarifa PO Box: $${precioVentaUsd.toFixed(2)} USD = $${precioVentaMxn.toFixed(2)} MXN`);
        console.log(`   Consolidación: $${consolidationCostUsd.toFixed(2)} USD = $${consolidationCostMxn.toFixed(2)} MXN`);
        console.log(`   TOTAL: $${totalUsd.toFixed(2)} USD = $${totalMxn.toFixed(2)} MXN (TC: ${exchangeRate})`);
        
        // Crear el paquete padre (caja consolidada) con el costo total
        console.log('📝 Preparando INSERT para paquete padre...');
        console.log('   Parámetros:', {
            tracking: consolidatedTracking,
            user_id: firstPkg.user_id,
            weight: billedWeight,
            dimensions: `${repackBox.length}x${repackBox.width}x${repackBox.height}`,
            totalMxn: totalMxn.toFixed(2),
            totalUsd: totalUsd.toFixed(2),
            exchangeRate: exchangeRate.toFixed(4)
        });
        
        let parentResult;
        try {
            // Obtener nivel de tarifa del cálculo de costo PO Box
            const nivelTarifa = (poboxCost as any).nivelTarifa || 1;
            
            parentResult = await pool.query(`
                INSERT INTO packages (
                    tracking_internal, tracking_provider, user_id,
                    description, status, weight, pkg_length, pkg_width, pkg_height,
                    is_master, total_boxes, service_type, warehouse_location,
                    assigned_cost_mxn, saldo_pendiente, pobox_venta_usd, pobox_service_cost,
                    registered_exchange_rate, pobox_tarifa_nivel, notes, created_at
                ) VALUES (
                    $1, $2, $3,
                    $4, 'received', $5, $6, $7, $8,
                    TRUE, $9, $10, $11,
                    $12, $12, $13, $14,
                    $15, $16, $17, CURRENT_TIMESTAMP
                ) RETURNING id
            `, [
                consolidatedTracking,
                `REPACK-${packages.map(p => p.tracking_internal).join('+')}`,
                firstPkg.user_id,
                `Consolidación de ${packages.length} paquetes`,
                billedWeight,
                repackBox.length,
                repackBox.width,
                repackBox.height,
                packages.length,
                'POBOX_USA',
                'usa_pobox',
                totalMxn.toFixed(2),  // assigned_cost_mxn = TOTAL
                totalUsd.toFixed(2),  // pobox_venta_usd
                (poboxCost.poboxServiceCost || 0).toFixed(2),  // costo interno
                exchangeRate.toFixed(4),
                nivelTarifa,  // nivel de tarifa calculado
                `Consolidación: ${packages.map(p => p.tracking_internal).join(', ')}\nTarifa caja: $${precioVentaUsd.toFixed(2)} USD (Nivel ${nivelTarifa}) + Consolidación: $${consolidationCostUsd.toFixed(2)} USD = $${totalUsd.toFixed(2)} USD`
            ]);
            console.log('✅ INSERT ejecutado, resultado:', parentResult.rows);
        } catch (insertError: any) {
            console.error('❌ ERROR EN INSERT:', insertError.message);
            console.error('   Detalle completo:', insertError);
            throw insertError;
        }
        
        if (!parentResult.rows || parentResult.rows.length === 0) {
            throw new Error('INSERT no retornó ID del paquete padre');
        }
        
        const parentId = parentResult.rows[0].id;
        console.log('📦 Paquete padre creado con ID:', parentId);
        
        // VERIFICACIÓN INMEDIATA del INSERT
        const insertCheck = await pool.query('SELECT id, tracking_internal FROM packages WHERE id = $1', [parentId]);
        console.log('🔍 Verificación INSERT inmediata:', insertCheck.rows);
        if (insertCheck.rows.length === 0) {
            console.error('❌❌❌ CRÍTICO: INSERT retornó ID pero el registro NO existe en la DB!');
        }
        
        // Actualizar los paquetes originales: vincular al padre y poner costo en 0
        console.log('🔄 Actualizando paquetes hijos...');
        for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i];
            
            try {
                const updateResult = await pool.query(`
                    UPDATE packages 
                    SET 
                        master_id = $1,
                        box_number = $2,
                        assigned_cost_mxn = 0,
                        saldo_pendiente = 0,
                        notes = COALESCE(notes, '') || E'\\n' || '📦 Consolidado en ' || $3 || ' (costo transferido al master)'
                    WHERE id = $4
                    RETURNING id, master_id, assigned_cost_mxn
                `, [parentId, i + 1, consolidatedTracking, pkg.id]);
                console.log(`   ✅ UPDATE paquete ${pkg.id} (${pkg.tracking_internal}):`, updateResult.rows[0]);
                
                // Verificación inmediata del UPDATE
                const updateCheck = await pool.query('SELECT id, master_id FROM packages WHERE id = $1', [pkg.id]);
                console.log(`   🔍 Verificación UPDATE: master_id=${updateCheck.rows[0]?.master_id}`);
            } catch (updateError: any) {
                console.error(`   ❌ ERROR UPDATE paquete ${pkg.id}:`, updateError.message);
                throw updateError;
            }
        }
        
        // Registrar en historial de cargos (si existe la tabla)
        try {
            await pool.query(`
                INSERT INTO package_charges (
                    package_id, user_id, charge_type, description,
                    amount_usd, exchange_rate, amount_mxn, created_at
                ) VALUES (
                    $1, $2, 'consolidation', 'Servicio de Consolidación/Reempaque + Tarifa caja 40x40x50',
                    $3, $4, $5, CURRENT_TIMESTAMP
                )
            `, [parentId, firstPkg.user_id, totalUsd, exchangeRate, totalMxn]);
        } catch (e) {
            // Tabla puede no existir, continuar
            console.log('Tabla package_charges no existe, omitiendo registro');
        }
        
        // SIN COMMIT - auto-commit ya hizo el trabajo
        console.log(`✅ Operaciones completadas (auto-commit)`);
        
        // Verificar que se guardaron los datos
        const verification = await pool.query('SELECT id, tracking_internal, master_id FROM packages WHERE id = $1 OR master_id = $1', [parentId]);
        console.log(`📋 Verificación post-operación:`, verification.rows);
        
        if (verification.rows.length === 0) {
            console.error('❌ CRITICAL: Los datos NO se guardaron después del COMMIT!');
        }
        
        console.log(`✅ Reempaque completado: ${consolidatedTracking} - ${packages.length} paquetes -> Cliente: ${firstPkg.box_id}`);
        console.log(`   Total a pagar: $${totalMxn.toFixed(2)} MXN ($${totalUsd.toFixed(2)} USD)`);
        
        res.json({
            success: true,
            message: 'Reempaque solicitado exitosamente',
            repack: {
                consolidatedTracking,
                parentId,
                originalPackages: packages.map(p => p.tracking_internal),
                totalWeight: billedWeight,
                dimensions: `${repackBox.length}x${repackBox.width}x${repackBox.height} cm`,
                costs: {
                    poboxTarifaUsd: precioVentaUsd,
                    poboxTarifaMxn: precioVentaMxn,
                    consolidationUsd: consolidationCostUsd,
                    consolidationMxn: consolidationCostMxn,
                    totalUsd,
                    totalMxn,
                    exchangeRate
                }
            }
        });
        
        // Sin cliente que liberar en auto-commit
        return;
        
    } catch (error: any) {
        // Sin ROLLBACK necesario en auto-commit
        console.error('❌ Error en reempaque:', error);
        res.status(500).json({ 
            error: 'Error al procesar el reempaque',
            details: error.message 
        });
    }
};

// ============================================
// ENDPOINT: OBTENER PAQUETES LISTOS PARA SALIDA (PO BOX USA)
// ============================================
export const getOutboundReadyPackages = async (_req: Request, res: Response): Promise<void> => {
    try {
        // Paquetes US en bodega listos para salir:
        // LÓGICA:
        // 1. REPACK (tracking contiene 'REPACK'): Mostrar la master (es un contenedor de cajas)
        // 2. Hijas de REPACK: NO mostrar (ya están dentro del contenedor)
        // 3. Guías master normales con hijas: NO mostrar (mostrar sus hijas en su lugar)
        // 4. Guías hijas de master normal (-01, -02, etc): Mostrar (son las que se escanean)
        // 5. Guías individuales sin hijas: Mostrar como están
        const result = await pool.query(`
            SELECT 
                p.id,
                p.tracking_internal,
                p.tracking_provider,
                p.description,
                p.weight,
                p.status,
                p.total_boxes,
                p.is_master,
                p.master_id,
                p.pkg_length,
                p.pkg_width,
                p.pkg_height,
                u.box_id,
                u.full_name as client_name
            FROM packages p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN packages master ON p.master_id = master.id
            WHERE p.tracking_internal LIKE 'US-%'
              AND p.status IN ('received', 'reempacado')
              AND (
                -- REPACK: siempre mostrar (son contenedores)
                p.tracking_internal LIKE 'US-REPACK-%'
                OR
                -- Paquetes hijos de master normal (NO REPACK): mostrar
                (p.master_id IS NOT NULL AND master.tracking_internal NOT LIKE 'US-REPACK-%')
                OR
                -- Paquetes individuales sin hijas: mostrar
                (p.is_master = FALSE AND p.master_id IS NULL)
                OR
                -- Masters sin hijas (total_boxes = 1 o NULL): mostrar
                (p.is_master = TRUE AND COALESCE(p.total_boxes, 1) <= 1 AND p.tracking_internal NOT LIKE 'US-REPACK-%')
              )
            ORDER BY p.created_at DESC
        `);
        
        res.json({ packages: result.rows });
    } catch (error: any) {
        console.error('❌ Error obteniendo paquetes para salida:', error);
        res.status(500).json({ error: 'Error al obtener paquetes', details: error.message });
    }
};

// ============================================
// ENDPOINT: CREAR SALIDA (CONSOLIDACIÓN DE PAQUETES US)
// ============================================
export const createOutboundConsolidation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { packageIds, totalWeight, supplierId } = req.body;
        const operatorId = (req as any).user?.userId || (req as any).userId;
        
        if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
            res.status(400).json({ error: 'Se requiere al menos un paquete' });
            return;
        }
        
        if (!supplierId) {
            res.status(400).json({ error: 'Se requiere seleccionar un proveedor de salida' });
            return;
        }
        
        console.log(`📦 [OUTBOUND] Creando salida con ${packageIds.length} paquetes - Proveedor: ${supplierId} - Operador: ${operatorId}`);
        
        // Generar número de consolidación
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const consolidationNumber = `OUT-${timestamp}-${random}`;
        
        // Crear la consolidación con referencia al proveedor
        const consolidationResult = await pool.query(`
            INSERT INTO consolidations (
                status,
                total_weight,
                created_at,
                updated_at
            ) VALUES (
                'in_transit',
                $1,
                NOW(),
                NOW()
            )
            RETURNING id
        `, [totalWeight || 0]);
        
        const consolidationId = consolidationResult.rows[0].id;
        
        // Actualizar paquetes con el consolidation_id, supplier_id y estado in_transit
        await pool.query(`
            UPDATE packages 
            SET 
                consolidation_id = $1,
                supplier_id = $2,
                status = 'in_transit',
                dispatched_at = NOW(),
                updated_at = NOW()
            WHERE id = ANY($3)
        `, [consolidationId, supplierId, packageIds]);
        
        // Obtener los trackings actualizados
        const packagesResult = await pool.query(`
            SELECT tracking_internal, weight, description
            FROM packages
            WHERE id = ANY($1)
        `, [packageIds]);
        
        // Obtener nombre del proveedor
        const supplierResult = await pool.query('SELECT name FROM suppliers WHERE id = $1', [supplierId]);
        const supplierName = supplierResult.rows[0]?.name || 'Proveedor';
        
        console.log(`✅ [OUTBOUND] Consolidación #${consolidationId} creada - ${packageIds.length} paquetes asignados a ${supplierName} (en_transito)`);
        
        res.json({
            success: true,
            consolidationId,
            consolidationNumber,
            supplierId,
            supplierName,
            packageCount: packageIds.length,
            totalWeight,
            packages: packagesResult.rows
        });
        
    } catch (error: any) {
        console.error('❌ Error creando salida:', error);
        res.status(500).json({ 
            error: 'Error al crear la consolidación',
            details: error.message
        });
    }
};

// ============================================
// ENDPOINT: OBTENER INSTRUCCIONES DE REEMPAQUE PENDIENTES
// ============================================
export const getRepackInstructions = async (_req: Request, res: Response): Promise<void> => {
    try {
        // Obtener paquetes master de reempaque pendientes (solo received, no received_china)
        const result = await pool.query(`
            SELECT 
                p.id,
                p.tracking_internal,
                p.tracking_provider,
                p.description,
                p.weight,
                p.status,
                p.pkg_length,
                p.pkg_width,
                p.pkg_height,
                p.created_at,
                p.is_master,
                u.box_id,
                u.full_name as client_name
            FROM packages p
            JOIN users u ON p.user_id = u.id
            WHERE p.tracking_internal LIKE 'US-REPACK-%'
              AND p.status = 'received'
            ORDER BY p.created_at DESC
        `);
        
        // Para cada paquete master, obtener los paquetes hijos
        const instructionsWithChildren = await Promise.all(result.rows.map(async (row) => {
            // Buscar paquetes hijos vinculados a este master
            const childrenResult = await pool.query(`
                SELECT id, tracking_internal, weight, description, status
                FROM packages
                WHERE master_id = $1
                ORDER BY tracking_internal
            `, [row.id]);
            
            return {
                ...row,
                repack_tracking: row.tracking_internal,
                child_packages: childrenResult.rows,
                child_trackings: childrenResult.rows.map((c: { tracking_internal: string }) => c.tracking_internal).join(', ')
            };
        }));
        
        res.json({ instructions: instructionsWithChildren });
    } catch (error: any) {
        console.error('❌ Error obteniendo instrucciones de reempaque:', error);
        res.status(500).json({ error: 'Error al obtener instrucciones', details: error.message });
    }
};

// ============================================================
// BULK ASSIGN DELIVERY WITH DOCUMENT UPLOADS
// ============================================================

const deliveryUploadsDir = path.join(__dirname, '..', 'uploads', 'delivery');
try {
  if (!fs.existsSync(deliveryUploadsDir)) {
    fs.mkdirSync(deliveryUploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('⚠️ No se pudo crear directorio de uploads delivery:', e);
}

const deliveryStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, deliveryUploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `delivery-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const deliveryUpload = multer({
  storage: deliveryStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
    const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = /image\/|application\/pdf/.test(file.mimetype);
    cb(null, extOk || mimeOk);
  }
}).fields([
  { name: 'factura', maxCount: 1 },
  { name: 'constancia', maxCount: 1 },
  { name: 'guiaExterna', maxCount: 1 },
]);

export const uploadDeliveryDocs = (req: Request, res: Response, next: Function) => {
  deliveryUpload(req, res, (err: any) => {
    if (err) {
      console.warn('⚠️ Error multer delivery (continuando sin archivos):', err.message || err);
    }
    next();
  });
};

export const bulkAssignDelivery = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user.userId;
    const {
      packageIds,
      addressId,
      carrierService,
      notes,
      applyToFullShipment,
      totalBoxes,
      isCollect,
      wantsFacturaPaqueteria,
      saveConstancia: saveConstanciaFlag,
    } = req.body;

    // Parse packageIds (might be string from FormData)
    const pkgIds: number[] = typeof packageIds === 'string' ? JSON.parse(packageIds) : packageIds;
    const addrId = parseInt(addressId, 10);
    const isCollectBool = isCollect === 'true' || isCollect === true;
    const wantsFacturaBool = wantsFacturaPaqueteria === 'true' || wantsFacturaPaqueteria === true;
    const saveConstanciaBool = saveConstanciaFlag === 'true' || saveConstanciaFlag === true;
    const carrierCostMxn = parseFloat(req.body.carrierCost) || 0;

    console.log(`📦 [Bulk Assign Delivery] User ${userId}: ${pkgIds.length} packages, carrier=${carrierService}, isCollect=${isCollectBool}`);

    // Get uploaded files
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // Build document URLs
    const facturaUrl = files?.factura?.[0] ? `${baseUrl}/uploads/delivery/${files.factura[0].filename}` : null;
    const constanciaUrl = files?.constancia?.[0] ? `${baseUrl}/uploads/delivery/${files.constancia[0].filename}` : null;
    const guiaExternaUrl = files?.guiaExterna?.[0] ? `${baseUrl}/uploads/delivery/${files.guiaExterna[0].filename}` : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify address belongs to user
      if (addrId) {
        const addrCheck = await client.query('SELECT id FROM addresses WHERE id = $1 AND user_id = $2', [addrId, userId]);
        if (addrCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: 'Dirección no válida' });
        }
      }

      // Update all selected packages
      let updatedCount = 0;
      for (const pkgId of pkgIds) {
        const result = await client.query(`
          UPDATE packages 
          SET assigned_address_id = $1,
              carrier = $2,
              notes = COALESCE($3, notes),
              needs_instructions = false,
              is_collect = $4,
              collect_carrier = $5,
              wants_factura_paqueteria = $6,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $7 AND user_id = $8
          RETURNING id
        `, [addrId, carrierService, notes || null, isCollectBool, isCollectBool ? carrierService : null, wantsFacturaBool, pkgId, userId]);
        
        // If not found in packages, try maritime_orders
        if (!result.rowCount || result.rowCount === 0) {
          const maritimeResult = await client.query(`
            UPDATE maritime_orders 
            SET delivery_address_id = $1,
                national_carrier = $2,
                delivery_instructions = $3,
                national_shipping_cost = $6,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 AND user_id = $5
            RETURNING id
          `, [addrId, carrierService, notes || null, pkgId, userId, carrierCostMxn]);
          
          if (maritimeResult.rowCount && maritimeResult.rowCount > 0) {
            updatedCount++;
            console.log(`🚢 Maritime order ${pkgId} updated with carrier=${carrierService}`);
          } else {
            // Try dhl_shipments
            const dhlResult = await client.query(`
              UPDATE dhl_shipments 
              SET delivery_address_id = $1,
                  national_carrier = $2,
                  national_cost_mxn = $3,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $4 AND user_id = $5
              RETURNING id
            `, [addrId, carrierService, carrierCostMxn, pkgId, userId]);
            if (dhlResult.rowCount && dhlResult.rowCount > 0) {
              updatedCount++;
              console.log(`📦 DHL shipment ${pkgId} updated with carrier=${carrierService}`);
            }
          }
        } else {
          updatedCount++;
        }

        if ((result.rowCount && result.rowCount > 0)) {
          if (facturaUrl) {
            await client.query(`
              INSERT INTO delivery_documents (package_id, user_id, document_type, file_url, original_filename)
              VALUES ($1, $2, 'factura_embarque', $3, $4)
            `, [pkgId, userId, facturaUrl, files?.factura?.[0]?.originalname || 'factura']);
          }
          if (constanciaUrl) {
            await client.query(`
              INSERT INTO delivery_documents (package_id, user_id, document_type, file_url, original_filename)
              VALUES ($1, $2, 'constancia_fiscal', $3, $4)
            `, [pkgId, userId, constanciaUrl, files?.constancia?.[0]?.originalname || 'constancia']);
          }
          if (guiaExternaUrl) {
            await client.query(`
              INSERT INTO delivery_documents (package_id, user_id, document_type, file_url, original_filename)
              VALUES ($1, $2, 'guia_externa', $3, $4)
            `, [pkgId, userId, guiaExternaUrl, files?.guiaExterna?.[0]?.originalname || 'guia']);
          }
        }
      }

      // If user wants to save constancia for future use
      if (saveConstanciaBool && constanciaUrl) {
        await client.query(`
          INSERT INTO user_saved_documents (user_id, document_type, file_url, original_filename)
          VALUES ($1, 'constancia_fiscal', $2, $3)
          ON CONFLICT (user_id, document_type) DO UPDATE SET
            file_url = EXCLUDED.file_url,
            original_filename = EXCLUDED.original_filename,
            updated_at = CURRENT_TIMESTAMP
        `, [userId, constanciaUrl, files?.constancia?.[0]?.originalname || 'constancia']);
        console.log(`💾 Constancia guardada para usuario ${userId}`);
      }

      await client.query('COMMIT');

      console.log(`✅ [Bulk Assign] Updated ${updatedCount}/${pkgIds.length} packages`);
      if (facturaUrl) console.log(`  📄 Factura: ${facturaUrl}`);
      if (constanciaUrl) console.log(`  📄 Constancia: ${constanciaUrl}`);
      if (guiaExternaUrl) console.log(`  📄 Guía externa: ${guiaExternaUrl}`);

      return res.json({
        success: true,
        message: `Instrucciones asignadas a ${updatedCount} paquete(s)`,
        updatedCount,
        documents: {
          factura: facturaUrl,
          constancia: constanciaUrl,
          guiaExterna: guiaExternaUrl,
          constanciaSaved: saveConstanciaBool && !!constanciaUrl,
        }
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error('❌ Error bulk assign delivery:', error);
    return res.status(500).json({ success: false, error: 'Error al asignar instrucciones', details: error.message });
  }
};

// Get user's saved constancia
export const getSavedConstancia = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user.userId;
    const result = await pool.query(
      `SELECT file_url, original_filename, updated_at FROM user_saved_documents WHERE user_id = $1 AND document_type = 'constancia_fiscal'`,
      [userId]
    );
    if (result.rows.length > 0) {
      return res.json({ success: true, saved: true, ...result.rows[0] });
    }
    return res.json({ success: true, saved: false });
  } catch (error: any) {
    console.error('❌ Error getting saved constancia:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
