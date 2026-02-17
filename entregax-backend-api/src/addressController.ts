import { Request, Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';

// ============ OBTENER DIRECCIONES DEL CLIENTE ============
export const getAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;

        const result = await pool.query(
            `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
            [userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener direcciones:', error);
        res.status(500).json({ error: 'Error al obtener direcciones' });
    }
};

// ============ CREAR DIRECCIÓN ============
export const createAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const { 
            userId, alias, recipientName, street, exteriorNumber, interiorNumber,
            neighborhood, city, state, zipCode, phone, reference, isDefault 
        } = req.body;

        if (!userId || !street || !city || !state || !zipCode) {
            res.status(400).json({ error: 'Faltan campos requeridos: userId, street, city, state, zipCode' });
            return;
        }

        // Si es default, quitar el default a las demás
        if (isDefault) {
            await pool.query(
                'UPDATE addresses SET is_default = FALSE WHERE user_id = $1',
                [userId]
            );
        }

        const result = await pool.query(
            `INSERT INTO addresses 
             (user_id, alias, recipient_name, street, exterior_number, interior_number, 
              neighborhood, city, state, zip_code, phone, reference, is_default) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
             RETURNING *`,
            [userId, alias || 'Principal', recipientName, street, exteriorNumber, interiorNumber,
             neighborhood, city, state, zipCode, phone, reference, isDefault || false]
        );

        res.status(201).json({
            message: 'Dirección creada exitosamente',
            address: result.rows[0]
        });
    } catch (error) {
        console.error('Error al crear dirección:', error);
        res.status(500).json({ error: 'Error al crear dirección' });
    }
};

// ============ ACTUALIZAR DIRECCIÓN ============
export const updateAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { 
            alias, recipientName, street, exteriorNumber, interiorNumber,
            neighborhood, city, state, zipCode, phone, reference, isDefault 
        } = req.body;

        // Si es default, quitar el default a las demás
        if (isDefault) {
            const currentAddr = await pool.query('SELECT user_id FROM addresses WHERE id = $1', [id]);
            if (currentAddr.rows.length > 0) {
                await pool.query(
                    'UPDATE addresses SET is_default = FALSE WHERE user_id = $1',
                    [currentAddr.rows[0].user_id]
                );
            }
        }

        const result = await pool.query(
            `UPDATE addresses SET 
             alias = COALESCE($1, alias),
             recipient_name = COALESCE($2, recipient_name),
             street = COALESCE($3, street),
             exterior_number = COALESCE($4, exterior_number),
             interior_number = COALESCE($5, interior_number),
             neighborhood = COALESCE($6, neighborhood),
             city = COALESCE($7, city),
             state = COALESCE($8, state),
             zip_code = COALESCE($9, zip_code),
             phone = COALESCE($10, phone),
             reference = COALESCE($11, reference),
             is_default = COALESCE($12, is_default)
             WHERE id = $13 RETURNING *`,
            [alias, recipientName, street, exteriorNumber, interiorNumber,
             neighborhood, city, state, zipCode, phone, reference, isDefault, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Dirección no encontrada' });
            return;
        }

        res.json({
            message: 'Dirección actualizada',
            address: result.rows[0]
        });
    } catch (error) {
        console.error('Error al actualizar dirección:', error);
        res.status(500).json({ error: 'Error al actualizar dirección' });
    }
};

// ============ ELIMINAR DIRECCIÓN ============
export const deleteAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await pool.query('DELETE FROM addresses WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Dirección no encontrada' });
            return;
        }

        res.json({ message: 'Dirección eliminada' });
    } catch (error) {
        console.error('Error al eliminar dirección:', error);
        res.status(500).json({ error: 'Error al eliminar dirección' });
    }
};

// ============ ESTABLECER DIRECCIÓN POR DEFECTO ============
export const setDefaultAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, addressId } = req.body;

        // Quitar default a todas
        await pool.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [userId]);

        // Poner default a la seleccionada
        await pool.query('UPDATE addresses SET is_default = TRUE WHERE id = $1', [addressId]);

        res.json({ message: 'Dirección predeterminada actualizada' });
    } catch (error) {
        console.error('Error al establecer dirección por defecto:', error);
        res.status(500).json({ error: 'Error al establecer dirección por defecto' });
    }
};

// ============ GUARDAR PREFERENCIAS DE ENVÍO ============
export const savePreferences = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, transport, carrier } = req.body;

        await pool.query(
            `UPDATE users SET default_transport = $1, default_carrier = $2 WHERE id = $3`,
            [transport, carrier, userId]
        );

        res.json({ message: 'Preferencias guardadas exitosamente' });
    } catch (error) {
        console.error('Error al guardar preferencias:', error);
        res.status(500).json({ error: 'Error al guardar preferencias' });
    }
};

// ============ OBTENER PREFERENCIAS E INSTRUCCIONES DEL CLIENTE ============
export const getClientInstructions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { boxId } = req.params;
        const { serviceType } = req.query; // 'usa', 'air', 'maritime', etc.

        // Buscar usuario
        const userResult = await pool.query(`
            SELECT 
                u.id,
                u.full_name,
                u.email,
                u.box_id,
                u.default_transport,
                u.default_carrier
            FROM users u
            WHERE UPPER(u.box_id) = UPPER($1)
        `, [boxId]);

        if (userResult.rows.length === 0) {
            res.status(404).json({ 
                found: false,
                error: 'Cliente no encontrado con ese casillero' 
            });
            return;
        }

        const client = userResult.rows[0];

        // Buscar direcciones del cliente
        const addressResult = await pool.query(`
            SELECT id, alias, recipient_name, street, exterior_number, interior_number,
                   neighborhood, city, state, zip_code, phone, reference, is_default, 
                   default_for_service
            FROM addresses 
            WHERE user_id = $1 
            ORDER BY is_default DESC, id ASC
        `, [client.id]);

        const addresses = addressResult.rows;

        // Determinar la dirección a usar:
        // 1. Si hay serviceType, buscar dirección con ese servicio
        // 2. Si no, usar la dirección is_default = true
        let defaultAddress = null;
        
        if (serviceType) {
            // Buscar dirección predeterminada para el tipo de servicio
            const serviceTypeLower = serviceType.toString().toLowerCase();
            defaultAddress = addresses.find((addr: any) => {
                if (!addr.default_for_service) return false;
                const services = addr.default_for_service.split(',').map((s: string) => s.trim().toLowerCase());
                return services.includes(serviceTypeLower) || services.includes('all');
            });
        }
        
        // Si no encontró para el servicio, usar la default general
        if (!defaultAddress) {
            defaultAddress = addresses.find((addr: any) => addr.is_default);
        }

        const hasInstructions = !!(client.default_transport && defaultAddress);

        res.json({
            found: true,
            hasInstructions,
            client: {
                id: client.id,
                name: client.full_name,
                email: client.email,
                boxId: client.box_id
            },
            preferences: {
                transport: client.default_transport || null,
                carrier: client.default_carrier || null
            },
            addresses: addresses.map((a: any) => ({
                id: a.id,
                alias: a.alias,
                recipientName: a.recipient_name,
                city: a.city,
                isDefault: a.is_default,
                defaultForService: a.default_for_service
            })),
            defaultAddress: defaultAddress ? {
                id: defaultAddress.id,
                alias: defaultAddress.alias,
                recipientName: defaultAddress.recipient_name,
                street: defaultAddress.street,
                exteriorNumber: defaultAddress.exterior_number,
                interiorNumber: defaultAddress.interior_number,
                neighborhood: defaultAddress.neighborhood,
                city: defaultAddress.city,
                state: defaultAddress.state,
                zipCode: defaultAddress.zip_code,
                phone: defaultAddress.phone,
                reference: defaultAddress.reference,
                defaultForService: defaultAddress.default_for_service,
                formatted: `${defaultAddress.street} ${defaultAddress.exterior_number || ''}${defaultAddress.interior_number ? ' Int. ' + defaultAddress.interior_number : ''}, ${defaultAddress.neighborhood || ''}, ${defaultAddress.city}, ${defaultAddress.state} ${defaultAddress.zip_code}`
            } : null
        });
    } catch (error) {
        console.error('Error al obtener instrucciones del cliente:', error);
        res.status(500).json({ error: 'Error al obtener instrucciones del cliente' });
    }
};

// ============ OBTENER MIS DIRECCIONES (para app móvil con token) ============
export const getMyAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const result = await pool.query(
            `SELECT id, alias, recipient_name, street, exterior_number, interior_number,
                    neighborhood as colony, city, state, zip_code, phone, reference, is_default, 
                    default_for_service, created_at
             FROM addresses 
             WHERE user_id = $1 
             ORDER BY is_default DESC, created_at DESC`,
            [userId]
        );

        res.json({ addresses: result.rows });
    } catch (error) {
        console.error('Error al obtener mis direcciones:', error);
        res.status(500).json({ error: 'Error al obtener direcciones' });
    }
};

// ============ CREAR MI DIRECCIÓN (para app móvil con token) ============
export const createMyAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const {
            alias, contact_name, street, exterior_number, interior_number,
            colony, city, state, zip_code, country, phone, reference
        } = req.body;

        if (!contact_name || !street || !exterior_number || !colony || !city || !state || !zip_code) {
            res.status(400).json({ error: 'Campos requeridos incompletos' });
            return;
        }

        // Verificar si es la primera dirección
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM addresses WHERE user_id = $1',
            [userId]
        );
        const isFirst = parseInt(countResult.rows[0].count) === 0;

        const { default_for_service } = req.body;

        // Si asigna como default para un servicio, quitar ese default de otras direcciones
        if (default_for_service) {
            await pool.query(
                `UPDATE addresses SET default_for_service = NULL 
                 WHERE user_id = $1 AND default_for_service = $2`,
                [userId, default_for_service]
            );
        }

        const result = await pool.query(
            `INSERT INTO addresses 
             (user_id, alias, recipient_name, street, exterior_number, interior_number, 
              neighborhood, city, state, zip_code, phone, reference, is_default, default_for_service)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [userId, alias || 'Principal', contact_name, street, exterior_number, interior_number || null,
             colony, city, state, zip_code, phone || null, reference || null, isFirst, default_for_service || null]
        );

        await pool.query('UPDATE users SET has_address = TRUE WHERE id = $1', [userId]);

        res.status(201).json({ 
            message: 'Dirección creada',
            address: result.rows[0]
        });
    } catch (error) {
        console.error('Error al crear dirección:', error);
        res.status(500).json({ error: 'Error al crear dirección' });
    }
};

// ============ ACTUALIZAR MI DIRECCIÓN (para app móvil con token) ============
export const updateMyAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const addressId = req.params.id;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const {
            alias, contact_name, street, exterior_number, interior_number,
            colony, city, state, zip_code, phone, reference, default_for_service
        } = req.body;

        // Si asigna como default para un servicio, quitar ese default de otras direcciones
        if (default_for_service) {
            await pool.query(
                `UPDATE addresses SET default_for_service = NULL 
                 WHERE user_id = $1 AND default_for_service = $2 AND id != $3`,
                [userId, default_for_service, addressId]
            );
        }

        const result = await pool.query(
            `UPDATE addresses 
             SET alias = COALESCE($1, alias),
                 recipient_name = COALESCE($2, recipient_name),
                 street = COALESCE($3, street), 
                 exterior_number = COALESCE($4, exterior_number),
                 interior_number = COALESCE($5, interior_number),
                 neighborhood = COALESCE($6, neighborhood), 
                 city = COALESCE($7, city), 
                 state = COALESCE($8, state),
                 zip_code = COALESCE($9, zip_code), 
                 phone = COALESCE($10, phone), 
                 reference = COALESCE($11, reference),
                 default_for_service = $12
             WHERE id = $13 AND user_id = $14
             RETURNING *`,
            [alias, contact_name, street, exterior_number, interior_number, colony, city, state, zip_code, 
             phone, reference, default_for_service, addressId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Dirección no encontrada' });
            return;
        }

        res.json({ 
            message: 'Dirección actualizada',
            address: result.rows[0]
        });
    } catch (error) {
        console.error('Error al actualizar dirección:', error);
        res.status(500).json({ error: 'Error al actualizar dirección' });
    }
};

// ============ ELIMINAR MI DIRECCIÓN (para app móvil con token) ============
export const deleteMyAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const addressId = req.params.id;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        await pool.query(
            'DELETE FROM addresses WHERE id = $1 AND user_id = $2',
            [addressId, userId]
        );

        // Verificar si aún tiene direcciones
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM addresses WHERE user_id = $1',
            [userId]
        );
        if (parseInt(countResult.rows[0].count) === 0) {
            await pool.query('UPDATE users SET has_address = FALSE WHERE id = $1', [userId]);
        }

        res.json({ message: 'Dirección eliminada' });
    } catch (error) {
        console.error('Error al eliminar dirección:', error);
        res.status(500).json({ error: 'Error al eliminar dirección' });
    }
};

// ============ ESTABLECER MI DIRECCIÓN PREDETERMINADA ============
export const setMyDefaultAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const addressId = req.params.id;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        await pool.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [userId]);
        await pool.query('UPDATE addresses SET is_default = TRUE WHERE id = $1 AND user_id = $2', [addressId, userId]);

        res.json({ message: 'Dirección predeterminada actualizada' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al actualizar' });
    }
};

// ============ ESTABLECER DIRECCIÓN PREDETERMINADA POR SERVICIO ============
export const setMyDefaultForService = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const addressId = req.params.id;
        const { services } = req.body; // Array: ['maritime', 'air', 'usa'] o null para quitar todos

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        // services puede ser un array de servicios o null/vacío para quitar todos
        const serviceList = Array.isArray(services) ? services : [];
        
        if (serviceList.length === 0) {
            // Quitar todos los servicios de esta dirección
            await pool.query(
                'UPDATE addresses SET default_for_service = NULL WHERE id = $1 AND user_id = $2',
                [addressId, userId]
            );
        } else {
            // Para cada servicio, quitarlo de otras direcciones del usuario
            for (const svc of serviceList) {
                // Obtener direcciones que tienen este servicio
                const addressesWithService = await pool.query(
                    `SELECT id, default_for_service FROM addresses 
                     WHERE user_id = $1 AND id != $2 
                     AND default_for_service IS NOT NULL`,
                    [userId, addressId]
                );
                
                for (const addr of addressesWithService.rows) {
                    if (addr.default_for_service) {
                        const currentServices = addr.default_for_service.split(',').filter((s: string) => s.trim());
                        const updatedServices = currentServices.filter((s: string) => s !== svc);
                        const newValue = updatedServices.length > 0 ? updatedServices.join(',') : null;
                        await pool.query(
                            'UPDATE addresses SET default_for_service = $1 WHERE id = $2',
                            [newValue, addr.id]
                        );
                    }
                }
            }
            
            // Guardar los servicios seleccionados en esta dirección (como string separado por comas)
            const serviceString = serviceList.join(',');
            await pool.query(
                'UPDATE addresses SET default_for_service = $1 WHERE id = $2 AND user_id = $3',
                [serviceString, addressId, userId]
            );
            
            // Si incluye 'all', también marcar como is_default
            if (serviceList.includes('all')) {
                await pool.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1', [userId]);
                await pool.query('UPDATE addresses SET is_default = TRUE WHERE id = $1', [addressId]);
            }
        }

        res.json({ message: 'Servicios predeterminados actualizados correctamente' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al actualizar' });
    }
};

// ============ OBTENER DIRECCIÓN PREDETERMINADA POR SERVICIO ============
export const getDefaultAddressForService = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const { service } = req.params; // 'maritime', 'air', 'usa'

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        // Buscar: primero específica del servicio, luego 'all', luego is_default
        let result = await pool.query(
            `SELECT * FROM addresses WHERE user_id = $1 AND default_for_service = $2 LIMIT 1`,
            [userId, service]
        );

        if (result.rows.length === 0) {
            result = await pool.query(
                `SELECT * FROM addresses WHERE user_id = $1 AND default_for_service = 'all' LIMIT 1`,
                [userId]
            );
        }

        if (result.rows.length === 0) {
            result = await pool.query(
                `SELECT * FROM addresses WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
                [userId]
            );
        }

        if (result.rows.length === 0) {
            res.json({ address: null });
            return;
        }

        res.json({ address: result.rows[0] });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al obtener dirección' });
    }
};

// ============ OBTENER MIS MÉTODOS DE PAGO ============
export const getMyPaymentMethods = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const result = await pool.query(
            `SELECT id, type, alias, last_four, card_brand, paypal_email, 
                    bank_name, clabe, is_default, created_at
             FROM payment_methods 
             WHERE user_id = $1 
             ORDER BY is_default DESC, created_at DESC`,
            [userId]
        );

        res.json({ paymentMethods: result.rows });
    } catch (error) {
        console.error('Error al obtener métodos de pago:', error);
        res.status(500).json({ error: 'Error al obtener métodos de pago' });
    }
};

// ============ CREAR MÉTODO DE PAGO ============
export const createPaymentMethod = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const { type, alias, last_four, card_brand, holder_name, paypal_email, bank_name, clabe, beneficiary } = req.body;

        if (!type) {
            res.status(400).json({ error: 'Tipo de método de pago requerido' });
            return;
        }

        // Verificar si es el primero
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM payment_methods WHERE user_id = $1',
            [userId]
        );
        const isFirst = parseInt(countResult.rows[0].count) === 0;

        const result = await pool.query(
            `INSERT INTO payment_methods 
             (user_id, type, alias, last_four, card_brand, holder_name, 
              paypal_email, bank_name, clabe, beneficiary, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id, type, alias, last_four, card_brand, paypal_email, bank_name, clabe, is_default`,
            [userId, type, alias, last_four || null, card_brand || null, holder_name || null,
             paypal_email || null, bank_name || null, clabe || null, beneficiary || null, isFirst]
        );

        res.status(201).json({ 
            message: 'Método de pago guardado',
            paymentMethod: result.rows[0]
        });
    } catch (error) {
        console.error('Error al crear método de pago:', error);
        res.status(500).json({ error: 'Error al guardar método de pago' });
    }
};

// ============ ELIMINAR MÉTODO DE PAGO ============
export const deletePaymentMethod = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const pmId = req.params.id;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        await pool.query(
            'DELETE FROM payment_methods WHERE id = $1 AND user_id = $2',
            [pmId, userId]
        );

        res.json({ message: 'Método de pago eliminado' });
    } catch (error) {
        console.error('Error al eliminar método de pago:', error);
        res.status(500).json({ error: 'Error al eliminar' });
    }
};

// ============ ESTABLECER MÉTODO DE PAGO PREDETERMINADO ============
export const setDefaultPaymentMethod = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const pmId = req.params.id;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        await pool.query('UPDATE payment_methods SET is_default = FALSE WHERE user_id = $1', [userId]);
        await pool.query('UPDATE payment_methods SET is_default = TRUE WHERE id = $1 AND user_id = $2', [pmId, userId]);

        res.json({ message: 'Método de pago predeterminado actualizado' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al actualizar' });
    }
};
