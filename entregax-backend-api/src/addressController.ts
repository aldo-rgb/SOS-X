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

        // Buscar usuario con su dirección por defecto
        const result = await pool.query(`
            SELECT 
                u.id,
                u.full_name,
                u.email,
                u.box_id,
                u.default_transport,
                u.default_carrier,
                a.id as address_id,
                a.alias as address_alias,
                a.recipient_name,
                a.street,
                a.exterior_number,
                a.interior_number,
                a.neighborhood,
                a.city,
                a.state,
                a.zip_code,
                a.phone as address_phone,
                a.reference
            FROM users u
            LEFT JOIN addresses a ON u.id = a.user_id AND a.is_default = TRUE
            WHERE UPPER(u.box_id) = UPPER($1)
        `, [boxId]);

        if (result.rows.length === 0) {
            res.status(404).json({ 
                found: false,
                error: 'Cliente no encontrado con ese casillero' 
            });
            return;
        }

        const client = result.rows[0];
        const hasInstructions = !!(client.default_transport && client.address_id);

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
            defaultAddress: client.address_id ? {
                id: client.address_id,
                alias: client.address_alias,
                recipientName: client.recipient_name,
                street: client.street,
                exteriorNumber: client.exterior_number,
                interiorNumber: client.interior_number,
                neighborhood: client.neighborhood,
                city: client.city,
                state: client.state,
                zipCode: client.zip_code,
                phone: client.address_phone,
                reference: client.reference,
                formatted: `${client.street} ${client.exterior_number || ''}${client.interior_number ? ' Int. ' + client.interior_number : ''}, ${client.neighborhood || ''}, ${client.city}, ${client.state} ${client.zip_code}`
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
                    neighborhood as colony, city, state, zip_code, phone, reference, is_default, created_at
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

        const result = await pool.query(
            `INSERT INTO addresses 
             (user_id, alias, recipient_name, street, exterior_number, interior_number, 
              neighborhood, city, state, zip_code, phone, reference, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [userId, alias || 'Principal', contact_name, street, exterior_number, interior_number || null,
             colony, city, state, zip_code, phone || null, reference || null, isFirst]
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
            colony, city, state, zip_code, phone, reference
        } = req.body;

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
                 reference = COALESCE($11, reference)
             WHERE id = $12 AND user_id = $13
             RETURNING *`,
            [alias, contact_name, street, exterior_number, interior_number, colony, city, state, zip_code, 
             phone, reference, addressId, userId]
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
