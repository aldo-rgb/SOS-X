import { Request, Response } from 'express';
import { pool } from './db';
import { AuthRequest } from './authController';

// ============ OBTENER DIRECCIONES DEL USUARIO ============
export const getAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const result = await pool.query(
            `SELECT * FROM user_addresses 
             WHERE user_id = $1 
             ORDER BY is_default DESC, created_at DESC`,
            [userId]
        );

        res.json({ addresses: result.rows });
    } catch (error) {
        console.error('Error al obtener direcciones:', error);
        res.status(500).json({ error: 'Error al obtener direcciones' });
    }
};

// ============ CREAR DIRECCIÓN ============
export const createAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const {
            alias, street, exterior_number, interior_number,
            colony, city, state, zip_code, country, phone, reference
        } = req.body;

        // Validaciones
        if (!street || !exterior_number || !colony || !city || !state || !zip_code) {
            res.status(400).json({ error: 'Campos requeridos incompletos' });
            return;
        }

        // Verificar si es la primera dirección (será predeterminada)
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM user_addresses WHERE user_id = $1',
            [userId]
        );
        const isFirst = parseInt(countResult.rows[0].count) === 0;

        const result = await pool.query(
            `INSERT INTO user_addresses 
             (user_id, alias, street, exterior_number, interior_number, 
              colony, city, state, zip_code, country, phone, reference, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [userId, alias || null, street, exterior_number, interior_number || null,
             colony, city, state, zip_code, country || 'México', phone || null, 
             reference || null, isFirst]
        );

        // Actualizar flag has_address en users
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

// ============ ACTUALIZAR DIRECCIÓN ============
export const updateAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const addressId = req.params.id;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        const {
            alias, street, exterior_number, interior_number,
            colony, city, state, zip_code, country, phone, reference
        } = req.body;

        const result = await pool.query(
            `UPDATE user_addresses 
             SET alias = $1, street = $2, exterior_number = $3, interior_number = $4,
                 colony = $5, city = $6, state = $7, zip_code = $8, country = $9, 
                 phone = $10, reference = $11, updated_at = NOW()
             WHERE id = $12 AND user_id = $13
             RETURNING *`,
            [alias, street, exterior_number, interior_number,
             colony, city, state, zip_code, country, phone, reference,
             addressId, userId]
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
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const addressId = req.params.id;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        await pool.query(
            'DELETE FROM user_addresses WHERE id = $1 AND user_id = $2',
            [addressId, userId]
        );

        // Verificar si aún tiene direcciones
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM user_addresses WHERE user_id = $1',
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

// ============ ESTABLECER DIRECCIÓN PREDETERMINADA ============
export const setDefaultAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const addressId = req.params.id;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        // Quitar default de todas las direcciones del usuario
        await pool.query(
            'UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1',
            [userId]
        );

        // Establecer la nueva predeterminada
        await pool.query(
            'UPDATE user_addresses SET is_default = TRUE WHERE id = $1 AND user_id = $2',
            [addressId, userId]
        );

        res.json({ message: 'Dirección predeterminada actualizada' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al actualizar' });
    }
};

// ============ OBTENER MÉTODOS DE PAGO ============
export const getPaymentMethods = async (req: Request, res: Response): Promise<void> => {
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
             FROM user_payment_methods 
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
            'SELECT COUNT(*) FROM user_payment_methods WHERE user_id = $1',
            [userId]
        );
        const isFirst = parseInt(countResult.rows[0].count) === 0;

        const result = await pool.query(
            `INSERT INTO user_payment_methods 
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
            'DELETE FROM user_payment_methods WHERE id = $1 AND user_id = $2',
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

        // Quitar default de todos
        await pool.query(
            'UPDATE user_payment_methods SET is_default = FALSE WHERE user_id = $1',
            [userId]
        );

        // Establecer nuevo default
        await pool.query(
            'UPDATE user_payment_methods SET is_default = TRUE WHERE id = $1 AND user_id = $2',
            [pmId, userId]
        );

        res.json({ message: 'Método de pago predeterminado actualizado' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al actualizar' });
    }
};
