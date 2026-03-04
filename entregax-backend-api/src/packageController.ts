import { Request, Response } from 'express';
import { pool } from './db';
import { PoolClient } from 'pg';

// ============ TIPOS ============
type PackageStatus = 'received' | 'in_transit' | 'customs' | 'ready_pickup' | 'delivered';

interface BoxItem {
    weight: number;
    length: number;
    width: number;
    height: number;
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
    carrier: string;           // Paquetería de envío (FedEx, UPS, DHL, etc.)
    destination: DestinationInfo;
    notes?: string;
    imageUrl?: string;         // Foto del paquete (base64 o URL)
    warehouseLocation?: string; // Ubicación de bodega (usa_pobox, china_air, etc.)
    gex?: {                    // Garantía Extendida GEX
        included: boolean;
        invoiceValueUsd: number;
        exchangeRate: number;
        insuredValueMxn: number;
        costMxn: number;
    };
}

// Lista de paqueterías disponibles
const CARRIERS = ['FedEx', 'UPS', 'DHL', 'Estafeta', 'Redpack', 'Paquetexpress', 'JT Express', 'Otro'] as const;

// ============ GENERADOR DE TRACKING (Prefijo US) ============
const generateTracking = (): string => {
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `US-${timestamp}${random}`;
};

// ============ HELPERS ============
const getStatusLabel = (status: PackageStatus): string => {
    const labels: Record<PackageStatus, string> = {
        received: '📦 En Bodega',
        in_transit: '🚚 En Tránsito',
        customs: '🛃 En Aduana',
        ready_pickup: '✅ Listo para Recoger',
        delivered: '🎉 Entregado'
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
interface POBoxCostResult {
    totalMxn: number;
    cbm: number;
    poboxServiceCost: number;     // Costo servicio PO Box
    gexInsuranceCost: number;     // 5% valor asegurado
    gexFixedCost: number;         // Cargo fijo GEX
    gexTotalCost: number;         // Total GEX
    declaredValueMxn: number;     // Valor declarado en MXN
}

const calculatePOBoxCost = async (
    client: PoolClient, 
    boxes: BoxItem[], 
    gexData?: { included: boolean; costMxn?: number; insuranceCost?: number; fixedCost?: number; declaredValueMxn?: number }
): Promise<POBoxCostResult> => {
    try {
        // 1. Calcular CBM total de todas las cajas
        let totalCbm = 0;
        for (const box of boxes) {
            let boxCbm = (box.length * box.width * box.height) / 1000000; // cm³ a m³
            if (boxCbm < 0.010) boxCbm = 0.010; // Mínimo cobrable por caja
            totalCbm += boxCbm;
        }

        // 2. Obtener tarifas activas
        const tarifasResult = await client.query(
            'SELECT * FROM pobox_tarifas_volumen WHERE estado = TRUE ORDER BY nivel ASC'
        );
        const tarifas = tarifasResult.rows;

        // 3. Obtener tipo de cambio para PO Box USA
        const tcResult = await client.query(
            "SELECT tipo_cambio_final FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE"
        );
        const tipoCambio = tcResult.rows[0]?.tipo_cambio_final || 17.50;

        // 4. Evaluar nivel y calcular costo
        let costoVolumenUsd = 0;

        for (const tarifa of tarifas) {
            const cbmMin = parseFloat(tarifa.cbm_min);
            const cbmMax = tarifa.cbm_max ? parseFloat(tarifa.cbm_max) : Infinity;

            if (totalCbm >= cbmMin && totalCbm <= cbmMax) {
                if (tarifa.tipo_cobro === 'fijo') {
                    costoVolumenUsd = parseFloat(tarifa.costo);
                } else if (tarifa.tipo_cobro === 'por_unidad') {
                    costoVolumenUsd = totalCbm * parseFloat(tarifa.costo);
                    
                    // Protección de precio: no cobrar menos que el nivel anterior
                    const nivelAnterior = tarifas.find((t: any) => t.nivel === tarifa.nivel - 1);
                    if (nivelAnterior) {
                        const costoMinimo = parseFloat(nivelAnterior.costo);
                        if (costoVolumenUsd < costoMinimo) {
                            costoVolumenUsd = costoMinimo;
                        }
                    }
                }
                break;
            }
        }

        // 5. Convertir a MXN - Este es el costo del servicio PO Box
        const poboxServiceCost = costoVolumenUsd * tipoCambio;
        
        // 6. Extraer desglose de GEX
        const gexInsuranceCost = gexData?.insuranceCost || 0;
        const gexFixedCost = gexData?.fixedCost || 0;
        const gexTotalCost = gexData?.costMxn || 0;
        const declaredValueMxn = gexData?.declaredValueMxn || 0;
        
        // 7. Total = PO Box + GEX
        const totalMxn = poboxServiceCost + gexTotalCost;

        console.log(`💰 Costo PO Box calculado: CBM=${totalCbm.toFixed(4)}, Servicio=$${poboxServiceCost.toFixed(2)}, GEX=$${gexTotalCost.toFixed(2)} (Seguro:$${gexInsuranceCost.toFixed(2)} + Fijo:$${gexFixedCost.toFixed(2)}), Total=$${totalMxn.toFixed(2)}`);

        return { 
            totalMxn, 
            cbm: totalCbm,
            poboxServiceCost,
            gexInsuranceCost,
            gexFixedCost,
            gexTotalCost,
            declaredValueMxn
        };
    } catch (error) {
        console.error('Error calculando costo PO Box:', error);
        return { totalMxn: 0, cbm: 0, poboxServiceCost: 0, gexInsuranceCost: 0, gexFixedCost: 0, gexTotalCost: 0, declaredValueMxn: 0 };
    }
};

// ============ CREAR ENVÍO (MASTER + HIJAS) ============
export const createShipment = async (req: Request, res: Response): Promise<void> => {
    const client = await pool.connect();
    
    try {
        const { boxId, description, boxes, trackingProvider, declaredValue, carrier, destination, notes, imageUrl, warehouseLocation, gex }: CreateShipmentBody = req.body;

        // 🛡️ GEX - Determinar si incluye garantía
        const hasGex = gex?.included || false;

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

        if (!boxId) {
            res.status(400).json({ error: 'El Box ID del cliente es requerido' });
            return;
        }
        // Descripción ya no es obligatoria
        if (!boxes || boxes.length === 0) {
            res.status(400).json({ error: 'Debe agregar al menos una caja' });
            return;
        }
        if (!carrier) {
            res.status(400).json({ error: 'Selecciona la paquetería de envío' });
            return;
        }
        if (!destination || !destination.country || !destination.city || !destination.address) {
            res.status(400).json({ error: 'La dirección de destino es requerida (país, ciudad, dirección)' });
            return;
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

        const userQuery = await client.query(
            'SELECT id, full_name, email, box_id, is_verified, verification_status FROM users WHERE box_id = $1',
            [(boxId as string).toUpperCase()]
        );

        if (userQuery.rows.length === 0) {
            res.status(404).json({ 
                error: 'Box ID no encontrado',
                message: `No existe cliente con casillero ${boxId}.`
            });
            return;
        }

        const user = userQuery.rows[0];

        // Validar que el usuario esté verificado para poder documentar paquetes
        if (!user.is_verified) {
            const statusMessage = user.verification_status === 'pending_review' 
                ? 'El perfil del cliente está en revisión. No puede recibir paquetes hasta que sea aprobado.'
                : user.verification_status === 'rejected'
                    ? 'El perfil del cliente fue rechazado. Debe completar la verificación nuevamente.'
                    : 'El cliente no ha completado su verificación de identidad.';
            
            res.status(403).json({ 
                error: 'Cliente no verificado',
                message: statusMessage,
                verificationStatus: user.verification_status || 'not_started',
                requiresVerification: true
            });
            return;
        }
        const masterTracking = generateTracking();
        const totalBoxes = boxes.length;
        const totalWeight = boxes.reduce((sum, box) => sum + box.weight, 0);
        const totalVolume = boxes.reduce((sum, box) => sum + (calculateVolume(box.length, box.width, box.height) || 0), 0);

        // 🚚 Determinar si es envío con paquetería de última milla (auto-consolidar)
        const lastMileCarriers = ['FedEx', 'UPS', 'DHL', 'Estafeta', 'Redpack', 'Paquetexpress', 'JT Express', 'Otro'];
        const isLastMileShipment = lastMileCarriers.includes(carrier);

        // 📦 Verificar si cliente tiene dirección asignada para USA (auto-procesar)
        let hasDefaultUsaAddress = false;
        if (serviceType === 'POBOX_USA') {
            const addressCheck = await client.query(
                `SELECT id FROM addresses 
                 WHERE user_id = $1 
                 AND default_for_service IS NOT NULL 
                 AND (default_for_service ILIKE '%usa%' OR default_for_service ILIKE '%all%')
                 LIMIT 1`,
                [user.id]
            );
            hasDefaultUsaAddress = addressCheck.rows.length > 0;
            if (hasDefaultUsaAddress) {
                console.log(`📦 Cliente ${user.box_id} tiene dirección USA asignada - auto-procesando`);
            }
        }

        // Si tiene carrier última milla O tiene dirección USA asignada, auto-procesar
        const shouldAutoProcess = isLastMileShipment || hasDefaultUsaAddress;
        const initialStatus = shouldAutoProcess ? 'processing' : 'received';

        // 💰 Calcular costo para PO Box USA con desglose
        let costResult: POBoxCostResult = { 
            totalMxn: 0, cbm: 0, poboxServiceCost: 0, 
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

        // 🚚 Si debe auto-procesar, crear consolidación automática
        let consolidationId: number | null = null;
        if (shouldAutoProcess) {
            const consolidationResult = await client.query(
                `INSERT INTO consolidations (user_id, total_weight, status, created_at) 
                 VALUES ($1, $2, 'processing', NOW()) RETURNING id`,
                [user.id, totalWeight]
            );
            consolidationId = consolidationResult.rows[0].id;
            console.log(`📦 Auto-consolidación #${consolidationId} creada para envío ${carrier}`);
        }

        let masterPackage;
        const childPackages = [];
        const allLabels = [];

        if (totalBoxes === 1) {
            const box = boxes[0] as BoxItem;
            const result = await client.query(
                `INSERT INTO packages 
                 (user_id, tracking_internal, tracking_provider, description, weight, 
                  pkg_length, pkg_width, pkg_height, declared_value, notes, status,
                  is_master, box_number, total_boxes, carrier,
                  destination_country, destination_city, destination_address, destination_zip, destination_phone, destination_contact, image_url,
                  service_type, warehouse_location, has_gex, consolidation_id,
                  assigned_cost_mxn, single_cbm, saldo_pendiente, long_cm, width_cm, height_cm,
                  pobox_service_cost, gex_insurance_cost, gex_fixed_cost, gex_total_cost, declared_value_mxn)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, 1, 1, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                         $24, $25, $24, $6, $7, $8, $26, $27, $28, $29, $30) 
                 RETURNING *`,
                [user.id, masterTracking, trackingProvider || null, description, box.weight, 
                 box.length, box.width, box.height, declaredValue || null, notes || null, initialStatus,
                 carrier, destination.country, destination.city, destination.address, 
                 destination.zip || null, destination.phone || null, destination.contact || null, imageUrl || null,
                 serviceType, wLocation, hasGex, consolidationId,
                 costResult.totalMxn, costResult.cbm,
                 costResult.poboxServiceCost, costResult.gexInsuranceCost, costResult.gexFixedCost, costResult.gexTotalCost, costResult.declaredValueMxn]
            );
            masterPackage = result.rows[0];
            
            allLabels.push({
                boxNumber: 1, totalBoxes: 1, tracking: masterTracking, labelCode: masterTracking,
                isMaster: false, weight: box.weight,
                dimensions: formatDimensions(box.length, box.width, box.height),
                clientName: user.full_name, clientBoxId: user.box_id, description,
                carrier, destination: `${destination.city}, ${destination.country}`,
                destinationCity: destination.city, destinationCountry: destination.country,
                receivedAt: new Date().toISOString()
            });
        } else {
            const masterResult = await client.query(
                `INSERT INTO packages 
                 (user_id, tracking_internal, tracking_provider, description, weight, 
                  declared_value, notes, status, is_master, box_number, total_boxes, carrier,
                  destination_country, destination_city, destination_address, destination_zip, destination_phone, destination_contact, image_url,
                  service_type, warehouse_location, has_gex, consolidation_id,
                  assigned_cost_mxn, single_cbm, saldo_pendiente,
                  pobox_service_cost, gex_insurance_cost, gex_fixed_cost, gex_total_cost, declared_value_mxn)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 0, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                         $22, $23, $22, $24, $25, $26, $27, $28) 
                 RETURNING *`,
                [user.id, masterTracking, trackingProvider || null, description, totalWeight, 
                 declaredValue || null, notes || null, initialStatus, totalBoxes, carrier,
                 destination.country, destination.city, destination.address,
                 destination.zip || null, destination.phone || null, destination.contact || null, imageUrl || null,
                 serviceType, wLocation, hasGex, consolidationId,
                 costResult.totalMxn, costResult.cbm,
                 costResult.poboxServiceCost, costResult.gexInsuranceCost, costResult.gexFixedCost, costResult.gexTotalCost, costResult.declaredValueMxn]
            );
            masterPackage = masterResult.rows[0];

            allLabels.push({
                boxNumber: 0, totalBoxes, tracking: masterTracking, labelCode: masterTracking,
                isMaster: true, weight: totalWeight, volume: Math.round(totalVolume * 100) / 100,
                dimensions: `${totalBoxes} bultos`,
                clientName: user.full_name, clientBoxId: user.box_id, description,
                carrier, destination: `${destination.city}, ${destination.country}`,
                destinationCity: destination.city, destinationCountry: destination.country,
                receivedAt: new Date().toISOString()
            });

            for (let i = 0; i < boxes.length; i++) {
                const box = boxes[i] as BoxItem;
                const boxNumber = i + 1;
                const childTracking = `${masterTracking}-${String(boxNumber).padStart(2, '0')}`;

                const childResult = await client.query(
                    `INSERT INTO packages 
                     (user_id, tracking_internal, tracking_provider, description, weight, 
                      pkg_length, pkg_width, pkg_height, status,
                      is_master, master_id, box_number, total_boxes, carrier,
                      destination_country, destination_city, destination_address,
                      service_type, warehouse_location, consolidation_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) 
                     RETURNING *`,
                    [user.id, childTracking, trackingProvider || null, description, box.weight, 
                     box.length, box.width, box.height, initialStatus, masterPackage.id, boxNumber, totalBoxes,
                     carrier, destination.country, destination.city, destination.address,
                     serviceType, wLocation, consolidationId]
                );
                childPackages.push(childResult.rows[0]);

                allLabels.push({
                    boxNumber, totalBoxes, tracking: childTracking, labelCode: childTracking,
                    masterTracking, isMaster: false, weight: box.weight,
                    dimensions: formatDimensions(box.length, box.width, box.height),
                    volume: calculateVolume(box.length, box.width, box.height),
                    clientName: user.full_name, clientBoxId: user.box_id, description,
                    carrier, destination: `${destination.city}, ${destination.country}`,
                    destinationCity: destination.city, destinationCountry: destination.country,
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
                    carrier,
                    destination: {
                        country: destination.country,
                        city: destination.city,
                        address: destination.address,
                        zip: destination.zip || null,
                        phone: destination.phone || null,
                        contact: destination.contact || null
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
            client: { id: user.id, name: user.full_name, email: user.email, boxId: user.box_id }
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
    try {
        const { status, boxId, limit = 50 } = req.query;

        let query = `
            SELECT p.*, u.id as user_id, u.full_name, u.email, u.box_id
            FROM packages p JOIN users u ON p.user_id = u.id
            WHERE (p.is_master = true OR p.master_id IS NULL)
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

        params.push(Number(limit));
        query += ` ORDER BY p.created_at DESC LIMIT $${params.length}`;

        const result = await pool.query(query, params);

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
            client: { id: pkg.user_id, name: pkg.full_name, email: pkg.email, boxId: pkg.box_id }
        }));

        res.json({ success: true, total: packages.length, packages });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al consultar paquetes' });
    }
};

// ============ OBTENER ENVÍO POR TRACKING ============
export const getShipmentByTracking = async (req: Request, res: Response): Promise<void> => {
    try {
        const tracking = req.params.tracking as string;
        if (!tracking) { res.status(400).json({ error: 'Tracking requerido' }); return; }

        const result = await pool.query(`
            SELECT p.*, u.full_name, u.email, u.box_id
            FROM packages p JOIN users u ON p.user_id = u.id
            WHERE p.tracking_internal = $1 OR p.tracking_provider = $1
        `, [tracking.toUpperCase()]);

        if (result.rows.length === 0) { res.status(404).json({ error: 'No encontrado' }); return; }

        const pkg = result.rows[0];
        let children: any[] = [];

        if (pkg.is_master) {
            const childResult = await pool.query('SELECT * FROM packages WHERE master_id = $1 ORDER BY box_number', [pkg.id]);
            children = childResult.rows;
        }

        const labels = [];
        if (pkg.is_master) {
            labels.push({ boxNumber: 0, totalBoxes: pkg.total_boxes, tracking: pkg.tracking_internal, 
                labelCode: pkg.tracking_internal, isMaster: true, weight: parseFloat(pkg.weight),
                clientName: pkg.full_name, clientBoxId: pkg.box_id, description: pkg.description,
                destinationCity: pkg.destination_city, destinationCountry: pkg.destination_country,
                carrier: pkg.carrier, receivedAt: pkg.received_at });
            
            for (const child of children) {
                labels.push({ boxNumber: child.box_number, totalBoxes: child.total_boxes,
                    tracking: child.tracking_internal, labelCode: child.tracking_internal,
                    masterTracking: pkg.tracking_internal, isMaster: false,
                    weight: parseFloat(child.weight),
                    dimensions: formatDimensions(parseFloat(child.pkg_length), parseFloat(child.pkg_width), parseFloat(child.pkg_height)),
                    clientName: pkg.full_name, clientBoxId: pkg.box_id, description: child.description,
                    destinationCity: pkg.destination_city, destinationCountry: pkg.destination_country,
                    carrier: pkg.carrier, receivedAt: pkg.received_at });
            }
        } else {
            labels.push({ boxNumber: 1, totalBoxes: 1, tracking: pkg.tracking_internal,
                labelCode: pkg.tracking_internal, isMaster: false, weight: parseFloat(pkg.weight),
                dimensions: formatDimensions(parseFloat(pkg.pkg_length), parseFloat(pkg.pkg_width), parseFloat(pkg.pkg_height)),
                clientName: pkg.full_name, clientBoxId: pkg.box_id, description: pkg.description,
                destinationCity: pkg.destination_city, destinationCountry: pkg.destination_country,
                carrier: pkg.carrier, receivedAt: pkg.received_at });
        }

        res.json({
            success: true,
            shipment: {
                master: { id: pkg.id, tracking: pkg.tracking_internal, trackingProvider: pkg.tracking_provider,
                    description: pkg.description, weight: pkg.weight ? parseFloat(pkg.weight) : null,
                    declaredValue: pkg.declared_value ? parseFloat(pkg.declared_value) : null,
                    isMaster: pkg.is_master, totalBoxes: pkg.total_boxes || 1,
                    status: pkg.status, statusLabel: getStatusLabel(pkg.status),
                    receivedAt: pkg.received_at, deliveredAt: pkg.delivered_at },
                children: children.map(c => ({ id: c.id, tracking: c.tracking_internal, boxNumber: c.box_number,
                    weight: parseFloat(c.weight), dimensions: { length: parseFloat(c.pkg_length),
                        width: parseFloat(c.pkg_width), height: parseFloat(c.pkg_height),
                        formatted: formatDimensions(parseFloat(c.pkg_length), parseFloat(c.pkg_width), parseFloat(c.pkg_height)) },
                    status: c.status })),
                labels,
                client: { id: pkg.user_id, name: pkg.full_name, email: pkg.email, boxId: pkg.box_id }
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
        const validStatuses: PackageStatus[] = ['received', 'in_transit', 'customs', 'ready_pickup', 'delivered'];
        
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

        if (pkg.is_master) {
            await client.query(`UPDATE packages SET status = $1, updated_at = CURRENT_TIMESTAMP
                ${status === 'delivered' ? ', delivered_at = CURRENT_TIMESTAMP' : ''} WHERE master_id = $2`, [status, id]);
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
        'received_china': '📦 Recibido en China',
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
        'received_origin': '📦 En Bodega China',
        'in_transit': '✈️ En Tránsito',
        'at_customs': '🛃 En Aduana',
        'customs_mx': '🛃 Aduana México',
        'in_transit_mx': '🚛 En Ruta a CEDIS',
        'received_cedis': '✅ En CEDIS',
        'ready_pickup': '📍 Listo para Recoger',
        'delivered': '✅ Entregado'
    };
    return labels[status] || status;
};

// ============ MIS PAQUETES (APP MÓVIL) ============
export const getMyPackages = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;
        
        // 1. Paquetes AÉREOS (USA PO Box)
        const airResult = await pool.query(`
            SELECT p.*, u.full_name, u.box_id,
                   c.status as consolidation_status,
                   c.id as consolidation_id
            FROM packages p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN consolidations c ON p.consolidation_id = c.id
            WHERE p.user_id = $1 AND (p.is_master = true OR p.master_id IS NULL)
            ORDER BY p.created_at DESC
        `, [userId]);

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
            
            return {
                id: pkg.id,
                tracking_internal: pkg.tracking_internal,
                tracking_provider: pkg.tracking_provider,
                description: pkg.description || 'Sin descripción',
                weight: pkg.weight ? parseFloat(pkg.weight) : null,
                dimensions: pkg.pkg_length && pkg.pkg_width && pkg.pkg_height 
                    ? `${pkg.pkg_length}×${pkg.pkg_width}×${pkg.pkg_height} cm` 
                    : null,
                declared_value: pkg.declared_value ? parseFloat(pkg.declared_value) : null,
                status: displayStatus,
                statusLabel: displayLabel,
                carrier: pkg.carrier,
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
                monto_pagado: pkg.monto_pagado ? parseFloat(pkg.monto_pagado) : 0
            };
        });

        // 2. Paquetes MARÍTIMOS (China)
        const maritimeResult = await pool.query(`
            SELECT mo.*, 
                   ct.container_number,
                   ct.bl_number as container_bl
            FROM maritime_orders mo
            LEFT JOIN containers ct ON mo.container_id = ct.id
            WHERE mo.user_id = $1
            ORDER BY mo.created_at DESC
        `, [userId]);

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

        // 3. Paquetes TDI AÉREO China (china_receipts)
        const chinaAirResult = await pool.query(`
            SELECT cr.*, u.full_name, u.box_id
            FROM china_receipts cr
            LEFT JOIN users u ON cr.user_id = u.id
            WHERE cr.user_id = $1
            ORDER BY cr.created_at DESC
        `, [userId]);

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
        const result = await pool.query(`SELECT p.*, u.full_name, u.email, u.box_id, u.phone
            FROM packages p JOIN users u ON p.user_id = u.id WHERE p.id = $1`, [id]);

        if (result.rows.length === 0) { res.status(404).json({ error: 'No encontrado' }); return; }

        const pkg = result.rows[0];
        const labels = [];

        if (pkg.is_master) {
            labels.push({ boxNumber: 0, totalBoxes: pkg.total_boxes, tracking: pkg.tracking_internal,
                labelCode: pkg.tracking_internal, barcode: pkg.tracking_internal.replace(/-/g, ''),
                isMaster: true, client: { name: pkg.full_name, boxId: pkg.box_id },
                clientName: pkg.full_name, clientBoxId: pkg.box_id,
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
                    isMaster: false, client: { name: pkg.full_name, boxId: pkg.box_id },
                    clientName: pkg.full_name, clientBoxId: pkg.box_id,
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
                isMaster: false, client: { name: pkg.full_name, boxId: pkg.box_id },
                clientName: pkg.full_name, clientBoxId: pkg.box_id,
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
        // JOIN para traer: Datos de consolidación + Nombre del Cliente + Cantidad de Paquetes
        const query = `
            SELECT 
                c.id, 
                c.status, 
                c.total_weight, 
                c.created_at,
                u.full_name as client_name,
                u.box_id,
                COUNT(p.id) as package_count
            FROM consolidations c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN packages p ON p.consolidation_id = c.id
            GROUP BY c.id, u.full_name, u.box_id
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
        const { deliveryAddressId, deliveryInstructions } = req.body;
        const userId = (req as any).user.userId;

        console.log(`📦 [Instrucciones Entrega] Usuario ${userId} actualizando ${packageType}/${packageId}`);

        // Verificar que la dirección existe y pertenece al usuario
        if (deliveryAddressId) {
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

        // Según el tipo, actualizar la tabla correspondiente
        switch (packageType) {
            case 'usa':
            case 'pobox':
                // Paquetes USA (tabla packages)
                result = await pool.query(`
                    UPDATE packages 
                    SET assigned_address_id = $1, 
                        notes = COALESCE($2, notes),
                        needs_instructions = false,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3 AND user_id = $4
                    RETURNING id, tracking_internal
                `, [deliveryAddressId, deliveryInstructions, packageId, userId]);
                break;

            case 'maritime':
                // Órdenes marítimas
                result = await pool.query(`
                    UPDATE maritime_orders 
                    SET delivery_address_id = $1, 
                        delivery_instructions = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3 AND user_id = $4
                    RETURNING id, ordersn as tracking_internal
                `, [deliveryAddressId, deliveryInstructions, packageId, userId]);
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
                    WHERE id = $3 AND user_id = $4
                    RETURNING id, tracking_internal
                `, [deliveryAddressId, deliveryInstructions, packageId, userId]);
                break;

            default:
                return res.status(400).json({ 
                    success: false, 
                    error: `Tipo de paquete no soportado: ${packageType}` 
                });
        }

        if (result.rowCount === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Paquete no encontrado o no tienes permiso para modificarlo' 
            });
        }

        console.log(`✅ Instrucciones asignadas a ${result.rows[0].tracking_internal}`);

        res.json({ 
            success: true, 
            message: 'Instrucciones de entrega guardadas',
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
            warehouse_location: pkg.warehouse_location,
            service_type: pkg.service_type,
            created_at: pkg.created_at,
            updated_at: pkg.updated_at,
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
