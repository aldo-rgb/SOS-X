// ============================================
// CONTROLADOR DE TARIFAS DE FLETE NACIONAL
// Sistema de cotización terrestre Manzanillo -> México
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// GET /api/admin/national-freight-rates - Listar todas las tarifas
export const getAllNationalRates = async (req: Request, res: Response) => {
  try {
    console.log('[NATIONAL] Getting all rates...');
    const result = await pool.query(`
      SELECT id, origin, destination_city, destination_state, 
             km_distance, price_sencillo, price_full, 
             currency, is_active, notes, updated_at
      FROM national_freight_rates
      ORDER BY destination_city ASC
    `);
    console.log('[NATIONAL] Found', result.rows.length, 'rates');
    res.json(result.rows);
  } catch (error: any) {
    console.error('[NATIONAL] Error fetching national rates:', error.message, error.stack);
    res.status(500).json({ error: 'Error al obtener tarifas nacionales' });
  }
};

// PUT /api/admin/national-freight-rates/:id - Actualizar una tarifa
export const updateNationalRate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { price_sencillo, price_full, is_active, notes } = req.body;

    const result = await pool.query(`
      UPDATE national_freight_rates 
      SET price_sencillo = COALESCE($1, price_sencillo),
          price_full = COALESCE($2, price_full),
          is_active = COALESCE($3, is_active),
          notes = COALESCE($4, notes),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [price_sencillo, price_full, is_active, notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarifa no encontrada' });
    }

    res.json({ success: true, rate: result.rows[0] });
  } catch (error) {
    console.error('Error updating national rate:', error);
    res.status(500).json({ error: 'Error al actualizar tarifa' });
  }
};

// POST /api/admin/national-freight-rates - Crear nueva tarifa
export const createNationalRate = async (req: Request, res: Response) => {
  try {
    const { destination_city, destination_state, km_distance, price_sencillo, price_full, notes } = req.body;

    if (!destination_city || !price_sencillo || !price_full) {
      return res.status(400).json({ error: 'Destino y precios son requeridos' });
    }

    const result = await pool.query(`
      INSERT INTO national_freight_rates 
        (destination_city, destination_state, km_distance, price_sencillo, price_full, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [destination_city, destination_state, km_distance, price_sencillo, price_full, notes]);

    res.json({ success: true, rate: result.rows[0] });
  } catch (error) {
    console.error('Error creating national rate:', error);
    res.status(500).json({ error: 'Error al crear tarifa' });
  }
};

// DELETE /api/admin/national-freight-rates/:id - Eliminar una tarifa
export const deleteNationalRate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM national_freight_rates WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarifa no encontrada' });
    }

    res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Error deleting national rate:', error);
    res.status(500).json({ error: 'Error al eliminar tarifa' });
  }
};

// POST /api/national-freight/quote - Cotizar flete terrestre
export const quoteNationalFreight = async (req: Request, res: Response) => {
  try {
    const { destination_city, service_type = 'sencillo' } = req.body;

    if (!destination_city) {
      return res.status(400).json({ error: 'Ciudad destino es requerida' });
    }

    // Buscar tarifa por ciudad (búsqueda flexible)
    const result = await pool.query(`
      SELECT id, destination_city, km_distance, price_sencillo, price_full, currency
      FROM national_freight_rates
      WHERE LOWER(destination_city) LIKE LOWER($1) AND is_active = TRUE
      LIMIT 1
    `, [`%${destination_city}%`]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No hay tarifa configurada para este destino',
        suggestion: 'Contacta a un asesor para cotización personalizada'
      });
    }

    const rate = result.rows[0];
    const price = service_type === 'full' ? rate.price_full : rate.price_sencillo;

    res.json({
      success: true,
      quote: {
        origin: 'Manzanillo, Colima',
        destination: rate.destination_city,
        distance_km: rate.km_distance,
        service_type,
        price,
        currency: rate.currency,
        description: `Flete Terrestre ${service_type === 'full' ? 'Full (2 cajas)' : 'Sencillo (1 caja)'} - Manzanillo a ${rate.destination_city}`
      }
    });
  } catch (error) {
    console.error('Error quoting national freight:', error);
    res.status(500).json({ error: 'Error al cotizar flete' });
  }
};

// Función interna para calcular y generar factura de flete
export const calculateAndGenerateFreightInvoice = async (
  containerId: number,
  destinationCity: string,
  userId: number,
  serviceType: 'sencillo' | 'full' = 'sencillo'
): Promise<{ success: boolean; price: number; invoiceId?: number }> => {
  // 1. Buscar la tarifa
  const rateRes = await pool.query(`
    SELECT price_sencillo, price_full, currency, destination_city
    FROM national_freight_rates 
    WHERE LOWER(destination_city) LIKE LOWER($1) AND is_active = TRUE
    LIMIT 1
  `, [`%${destinationCity}%`]);

  if (rateRes.rows.length === 0) {
    throw new Error(`No hay tarifa terrestre configurada para ${destinationCity}`);
  }

  const rate = rateRes.rows[0];
  const price = serviceType === 'full' ? parseFloat(rate.price_full) : parseFloat(rate.price_sencillo);

  // 2. Generar la factura pendiente
  const invoiceRes = await pool.query(`
    INSERT INTO payment_invoices (user_id, service, amount, description, status, reference_id, reference_type)
    VALUES ($1, 'terrestre_nacional', $2, $3, 'pending', $4, 'container')
    RETURNING id
  `, [
    userId,
    price,
    `Flete Terrestre (Manzanillo - ${rate.destination_city}) ${serviceType === 'full' ? 'Full' : 'Sencillo'}`,
    containerId
  ]);

  return { 
    success: true, 
    price, 
    invoiceId: invoiceRes.rows[0]?.id 
  };
};
