import { Request, Response } from 'express';
import { pool } from './db';

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

// ============ CREAR ENVÍO (MASTER + HIJAS) ============
export const createShipment = async (req: Request, res: Response): Promise<void> => {
    const client = await pool.connect();
    
    try {
        const { boxId, description, boxes, trackingProvider, declaredValue, carrier, destination, notes, imageUrl, warehouseLocation }: CreateShipmentBody = req.body;

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
        if (!description) {
            res.status(400).json({ error: 'La descripción del paquete es requerida' });
            return;
        }
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

        await client.query('BEGIN');

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
                  service_type, warehouse_location)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'received', false, 1, 1, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) 
                 RETURNING *`,
                [user.id, masterTracking, trackingProvider || null, description, box.weight, 
                 box.length, box.width, box.height, declaredValue || null, notes || null,
                 carrier, destination.country, destination.city, destination.address, 
                 destination.zip || null, destination.phone || null, destination.contact || null, imageUrl || null,
                 serviceType, wLocation]
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
                  service_type, warehouse_location)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'received', true, 0, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
                 RETURNING *`,
                [user.id, masterTracking, trackingProvider || null, description, totalWeight, 
                 declaredValue || null, notes || null, totalBoxes, carrier,
                 destination.country, destination.city, destination.address,
                 destination.zip || null, destination.phone || null, destination.contact || null, imageUrl || null,
                 serviceType, wLocation]
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
                      service_type, warehouse_location)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'received', false, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
                     RETURNING *`,
                    [user.id, childTracking, trackingProvider || null, description, box.weight, 
                     box.length, box.width, box.height, masterPackage.id, boxNumber, totalBoxes,
                     carrier, destination.country, destination.city, destination.address,
                     serviceType, wLocation]
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
            message: totalBoxes > 1 ? `📦 Envío con ${totalBoxes} bultos registrado` : '📦 Paquete registrado',
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
                    status: 'received', statusLabel: getStatusLabel('received'),
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
                gex_folio: pkg.gex_folio || null
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

        // Combinar todos los tipos
        const allPackages = [...airPackages, ...maritimePackages, ...chinaAirPackages];
        
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

        // 2. Calcular peso total (Consultamos la BD para que no nos mientan desde la App)
        const packagesCheck = await pool.query(
            'SELECT SUM(weight) as total FROM packages WHERE id = ANY($1)',
            [packageIds]
        );
        const totalWeight = packagesCheck.rows[0].total || 0;

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
            [consolidationId, packageIds]
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

// Aliases
export const createPackage = createShipment;
export const getPackageByTracking = getShipmentByTracking;
export const updatePackageStatus = updateShipmentStatus;
export const getPackageLabels = getShipmentLabels;
