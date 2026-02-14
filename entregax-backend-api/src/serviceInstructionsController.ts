// ============================================
// CONTROLADOR DE INSTRUCCIONES POR SERVICIO
// Gestión de instrucciones de empaque, envío y direcciones de bodega
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// INSTRUCCIONES DE SERVICIO
// ============================================

// Obtener instrucciones de un servicio
export const getServiceInstructions = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM service_instructions WHERE service_type = $1',
            [serviceType]
        );
        
        if (result.rows.length === 0) {
            // Crear registro vacío si no existe
            const newRecord = await pool.query(
                `INSERT INTO service_instructions (service_type, packaging_instructions, shipping_instructions, general_notes)
                 VALUES ($1, '', '', '') RETURNING *`,
                [serviceType]
            );
            return res.json(newRecord.rows[0]);
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error getting service instructions:', error);
        res.status(500).json({ error: 'Error al obtener instrucciones' });
    }
};

// Obtener instrucciones de todos los servicios
export const getAllServiceInstructions = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(
            'SELECT * FROM service_instructions ORDER BY service_type'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting all service instructions:', error);
        res.status(500).json({ error: 'Error al obtener instrucciones' });
    }
};

// Actualizar instrucciones de un servicio
export const updateServiceInstructions = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        const { packagingInstructions, shippingInstructions, generalNotes, isActive } = req.body;
        
        const result = await pool.query(
            `UPDATE service_instructions 
             SET packaging_instructions = COALESCE($1, packaging_instructions),
                 shipping_instructions = COALESCE($2, shipping_instructions),
                 general_notes = COALESCE($3, general_notes),
                 is_active = COALESCE($4, is_active),
                 updated_at = NOW()
             WHERE service_type = $5
             RETURNING *`,
            [packagingInstructions, shippingInstructions, generalNotes, isActive, serviceType]
        );
        
        if (result.rows.length === 0) {
            // Crear si no existe
            const newRecord = await pool.query(
                `INSERT INTO service_instructions (service_type, packaging_instructions, shipping_instructions, general_notes, is_active)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [serviceType, packagingInstructions || '', shippingInstructions || '', generalNotes || '', isActive ?? true]
            );
            return res.json({ message: 'Instrucciones creadas', instructions: newRecord.rows[0] });
        }
        
        res.json({ message: 'Instrucciones actualizadas', instructions: result.rows[0] });
    } catch (error) {
        console.error('Error updating service instructions:', error);
        res.status(500).json({ error: 'Error al actualizar instrucciones' });
    }
};

// ============================================
// DIRECCIONES DE BODEGA/CEDIS
// ============================================

// Obtener direcciones de un servicio
export const getServiceAddresses = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        
        const result = await pool.query(
            `SELECT * FROM service_warehouse_addresses 
             WHERE service_type = $1 
             ORDER BY is_primary DESC, sort_order ASC, alias ASC`,
            [serviceType]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting service addresses:', error);
        res.status(500).json({ error: 'Error al obtener direcciones' });
    }
};

// Obtener todas las direcciones (todos los servicios)
export const getAllServiceAddresses = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(
            `SELECT * FROM service_warehouse_addresses 
             ORDER BY service_type, is_primary DESC, sort_order ASC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error getting all service addresses:', error);
        res.status(500).json({ error: 'Error al obtener direcciones' });
    }
};

// Crear nueva dirección de bodega
export const createServiceAddress = async (req: Request, res: Response): Promise<any> => {
    try {
        const {
            serviceType,
            alias,
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
            country,
            contactName,
            contactPhone,
            contactEmail,
            contactWhatsapp,
            businessHours,
            specialInstructions,
            isPrimary,
            sortOrder
        } = req.body;
        
        if (!serviceType || !alias || !addressLine1) {
            return res.status(400).json({ error: 'Servicio, alias y dirección son requeridos' });
        }
        
        // Si es primary, quitar primary de las demás del mismo servicio
        if (isPrimary) {
            await pool.query(
                'UPDATE service_warehouse_addresses SET is_primary = FALSE WHERE service_type = $1',
                [serviceType]
            );
        }
        
        const result = await pool.query(
            `INSERT INTO service_warehouse_addresses 
             (service_type, alias, address_line1, address_line2, city, state, zip_code, country,
              contact_name, contact_phone, contact_email, contact_whatsapp, business_hours,
              special_instructions, is_primary, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [serviceType, alias, addressLine1, addressLine2 || null, city || null, state || null,
             zipCode || null, country || 'México', contactName || null, contactPhone || null,
             contactEmail || null, contactWhatsapp || null, businessHours || null,
             specialInstructions || null, isPrimary || false, sortOrder || 0]
        );
        
        res.status(201).json({ message: 'Dirección creada', address: result.rows[0] });
    } catch (error) {
        console.error('Error creating service address:', error);
        res.status(500).json({ error: 'Error al crear dirección' });
    }
};

// Actualizar dirección de bodega
export const updateServiceAddress = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        const {
            alias,
            addressLine1,
            addressLine2,
            city,
            state,
            zipCode,
            country,
            contactName,
            contactPhone,
            contactEmail,
            contactWhatsapp,
            businessHours,
            specialInstructions,
            isPrimary,
            isActive,
            sortOrder
        } = req.body;
        
        // Si es primary, quitar primary de las demás del mismo servicio
        if (isPrimary) {
            const current = await pool.query('SELECT service_type FROM service_warehouse_addresses WHERE id = $1', [id]);
            if (current.rows.length > 0) {
                await pool.query(
                    'UPDATE service_warehouse_addresses SET is_primary = FALSE WHERE service_type = $1',
                    [current.rows[0].service_type]
                );
            }
        }
        
        const result = await pool.query(
            `UPDATE service_warehouse_addresses SET
                alias = COALESCE($1, alias),
                address_line1 = COALESCE($2, address_line1),
                address_line2 = $3,
                city = $4,
                state = $5,
                zip_code = $6,
                country = COALESCE($7, country),
                contact_name = $8,
                contact_phone = $9,
                contact_email = $10,
                contact_whatsapp = $11,
                business_hours = $12,
                special_instructions = $13,
                is_primary = COALESCE($14, is_primary),
                is_active = COALESCE($15, is_active),
                sort_order = COALESCE($16, sort_order),
                updated_at = NOW()
             WHERE id = $17
             RETURNING *`,
            [alias, addressLine1, addressLine2, city, state, zipCode, country,
             contactName, contactPhone, contactEmail, contactWhatsapp, businessHours,
             specialInstructions, isPrimary, isActive, sortOrder, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Dirección no encontrada' });
        }
        
        res.json({ message: 'Dirección actualizada', address: result.rows[0] });
    } catch (error) {
        console.error('Error updating service address:', error);
        res.status(500).json({ error: 'Error al actualizar dirección' });
    }
};

// Eliminar dirección de bodega
export const deleteServiceAddress = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM service_warehouse_addresses WHERE id = $1 RETURNING id',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Dirección no encontrada' });
        }
        
        res.json({ message: 'Dirección eliminada' });
    } catch (error) {
        console.error('Error deleting service address:', error);
        res.status(500).json({ error: 'Error al eliminar dirección' });
    }
};

// Establecer dirección como primaria
export const setPrimaryAddress = async (req: Request, res: Response): Promise<any> => {
    try {
        const { id } = req.params;
        
        // Obtener servicio de esta dirección
        const current = await pool.query('SELECT service_type FROM service_warehouse_addresses WHERE id = $1', [id]);
        if (current.rows.length === 0) {
            return res.status(404).json({ error: 'Dirección no encontrada' });
        }
        
        const serviceType = current.rows[0].service_type;
        
        // Quitar primary de todas las del mismo servicio
        await pool.query(
            'UPDATE service_warehouse_addresses SET is_primary = FALSE WHERE service_type = $1',
            [serviceType]
        );
        
        // Establecer esta como primary
        await pool.query(
            'UPDATE service_warehouse_addresses SET is_primary = TRUE, updated_at = NOW() WHERE id = $1',
            [id]
        );
        
        res.json({ message: 'Dirección establecida como principal' });
    } catch (error) {
        console.error('Error setting primary address:', error);
        res.status(500).json({ error: 'Error al establecer dirección principal' });
    }
};

// ============================================
// ENDPOINT PÚBLICO PARA USUARIOS
// Obtener instrucciones y direcciones de un servicio (sin autenticación)
// ============================================

export const getPublicServiceInfo = async (req: Request, res: Response): Promise<any> => {
    try {
        const { serviceType } = req.params;
        
        // Obtener instrucciones
        const instructions = await pool.query(
            'SELECT packaging_instructions, shipping_instructions, general_notes FROM service_instructions WHERE service_type = $1 AND is_active = TRUE',
            [serviceType]
        );
        
        // Obtener direcciones activas
        const addresses = await pool.query(
            `SELECT alias, address_line1, address_line2, city, state, zip_code, country,
                    contact_name, contact_phone, contact_email, contact_whatsapp, business_hours,
                    special_instructions, is_primary
             FROM service_warehouse_addresses 
             WHERE service_type = $1 AND is_active = TRUE
             ORDER BY is_primary DESC, sort_order ASC`,
            [serviceType]
        );
        
        res.json({
            serviceType,
            instructions: instructions.rows[0] || null,
            addresses: addresses.rows
        });
    } catch (error) {
        console.error('Error getting public service info:', error);
        res.status(500).json({ error: 'Error al obtener información del servicio' });
    }
};
