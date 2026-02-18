// ============================================
// POBOX RATES CONTROLLER
// Controlador para tarifas PO Box USA y cotizador
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// COTIZADOR PO BOX USA
// ============================================

export const calcularCotizacionPOBox = async (req: Request, res: Response): Promise<void> => {
    try {
        const { largo, alto, ancho, requiereForaneo, requiereExpres } = req.body;

        // Validar medidas
        if (!largo || !alto || !ancho) {
            res.status(400).json({ error: 'Se requieren las medidas: largo, alto, ancho (en cm)' });
            return;
        }

        // 1. Calcular CBM
        let cbm = (parseFloat(largo) * parseFloat(alto) * parseFloat(ancho)) / 1000000;
        if (cbm < 0.010) cbm = 0.010; // Mínimo cobrable

        // 2. Obtener tarifas activas de la BD
        const tarifasResult = await pool.query(
            'SELECT * FROM pobox_tarifas_volumen WHERE estado = TRUE ORDER BY nivel ASC'
        );
        const tarifas = tarifasResult.rows;

        // 3. Obtener tipo de cambio para PO Box USA
        const tcResult = await pool.query(
            "SELECT tipo_cambio_final FROM exchange_rate_config WHERE servicio = 'pobox_usa' AND estado = TRUE"
        );
        const tipoCambio = tcResult.rows[0]?.tipo_cambio_final || 17.50; // Default si no existe

        // 4. Evaluar nivel y calcular costo
        let costo_volumen_usd = 0;
        let nivelAplicado = 0;
        let tipoCobroAplicado = 'fijo';

        for (const tarifa of tarifas) {
            const cbmMin = parseFloat(tarifa.cbm_min);
            const cbmMax = tarifa.cbm_max ? parseFloat(tarifa.cbm_max) : Infinity;

            if (cbm >= cbmMin && cbm <= cbmMax) {
                nivelAplicado = tarifa.nivel;
                tipoCobroAplicado = tarifa.tipo_cobro;

                if (tarifa.tipo_cobro === 'fijo') {
                    costo_volumen_usd = parseFloat(tarifa.costo);
                } else if (tarifa.tipo_cobro === 'por_unidad') {
                    costo_volumen_usd = cbm * parseFloat(tarifa.costo);
                    
                    // 🛡️ REGLA DE PROTECCIÓN DE PRECIO
                    // Obtener el costo máximo del nivel anterior
                    const nivelAnterior = tarifas.find((t: any) => t.nivel === tarifa.nivel - 1);
                    if (nivelAnterior) {
                        const costoMinimo = parseFloat(nivelAnterior.costo);
                        if (costo_volumen_usd < costoMinimo) {
                            costo_volumen_usd = costoMinimo;
                        }
                    }
                }
                break;
            }
        }

        // 5. Calcular servicios extra
        let costo_extras_mxn = 0;
        const extrasAplicados: string[] = [];

        if (requiereForaneo) {
            const foraneResult = await pool.query(
                "SELECT costo FROM pobox_tarifas_extras WHERE nombre_servicio = 'Envío Foráneo' AND estado = TRUE"
            );
            if (foraneResult.rows[0]) {
                costo_extras_mxn += parseFloat(foraneResult.rows[0].costo);
                extrasAplicados.push('Envío Foráneo');
            }
        }

        if (requiereExpres) {
            const expresResult = await pool.query(
                "SELECT costo FROM pobox_tarifas_extras WHERE nombre_servicio = 'Paquete Exprés' AND estado = TRUE"
            );
            if (expresResult.rows[0]) {
                costo_extras_mxn += parseFloat(expresResult.rows[0].costo);
                extrasAplicados.push('Paquete Exprés');
            }
        }

        // 6. Consolidar total
        const total_volumen_mxn = costo_volumen_usd * tipoCambio;
        const total_general_mxn = total_volumen_mxn + costo_extras_mxn;

        res.json({
            success: true,
            cotizacion: {
                medidas: {
                    largo: parseFloat(largo),
                    alto: parseFloat(alto),
                    ancho: parseFloat(ancho),
                    unidad: 'cm'
                },
                cbm: cbm.toFixed(4),
                nivel_aplicado: nivelAplicado,
                tipo_cobro: tipoCobroAplicado,
                costo_volumen_usd: costo_volumen_usd.toFixed(2),
                tipo_cambio: tipoCambio.toFixed(4),
                costo_volumen_mxn: total_volumen_mxn.toFixed(2),
                extras_mxn: costo_extras_mxn.toFixed(2),
                extras_aplicados: extrasAplicados,
                total_mxn: total_general_mxn.toFixed(2)
            }
        });

    } catch (error) {
        console.error('Error en cotización PO Box:', error);
        res.status(500).json({ error: 'Error al calcular cotización' });
    }
};

// ============================================
// CRUD TARIFAS DE VOLUMEN
// ============================================

export const getTarifasVolumen = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(
            'SELECT * FROM pobox_tarifas_volumen ORDER BY nivel ASC'
        );
        res.json({ tarifas: result.rows });
    } catch (error) {
        console.error('Error obteniendo tarifas:', error);
        res.status(500).json({ error: 'Error al obtener tarifas' });
    }
};

export const updateTarifaVolumen = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { cbm_min, cbm_max, costo, tipo_cobro, estado } = req.body;

        const result = await pool.query(
            `UPDATE pobox_tarifas_volumen 
             SET cbm_min = COALESCE($1, cbm_min),
                 cbm_max = $2,
                 costo = COALESCE($3, costo),
                 tipo_cobro = COALESCE($4, tipo_cobro),
                 estado = COALESCE($5, estado),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING *`,
            [cbm_min, cbm_max, costo, tipo_cobro, estado, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Tarifa no encontrada' });
            return;
        }

        res.json({ success: true, tarifa: result.rows[0] });
    } catch (error) {
        console.error('Error actualizando tarifa:', error);
        res.status(500).json({ error: 'Error al actualizar tarifa' });
    }
};

export const createTarifaVolumen = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nivel, cbm_min, cbm_max, costo, tipo_cobro, moneda } = req.body;

        const result = await pool.query(
            `INSERT INTO pobox_tarifas_volumen (nivel, cbm_min, cbm_max, costo, tipo_cobro, moneda)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [nivel, cbm_min, cbm_max, costo, tipo_cobro || 'fijo', moneda || 'USD']
        );

        res.json({ success: true, tarifa: result.rows[0] });
    } catch (error) {
        console.error('Error creando tarifa:', error);
        res.status(500).json({ error: 'Error al crear tarifa' });
    }
};

// ============================================
// CRUD SERVICIOS EXTRA
// ============================================

export const getServiciosExtra = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(
            'SELECT * FROM pobox_tarifas_extras ORDER BY nombre_servicio ASC'
        );
        res.json({ servicios: result.rows });
    } catch (error) {
        console.error('Error obteniendo servicios:', error);
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
};

export const updateServicioExtra = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { nombre_servicio, descripcion, costo, estado } = req.body;

        const result = await pool.query(
            `UPDATE pobox_tarifas_extras 
             SET nombre_servicio = COALESCE($1, nombre_servicio),
                 descripcion = COALESCE($2, descripcion),
                 costo = COALESCE($3, costo),
                 estado = COALESCE($4, estado),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [nombre_servicio, descripcion, costo, estado, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Servicio no encontrado' });
            return;
        }

        res.json({ success: true, servicio: result.rows[0] });
    } catch (error) {
        console.error('Error actualizando servicio:', error);
        res.status(500).json({ error: 'Error al actualizar servicio' });
    }
};

export const createServicioExtra = async (req: Request, res: Response): Promise<void> => {
    try {
        const { nombre_servicio, descripcion, costo, moneda } = req.body;

        const result = await pool.query(
            `INSERT INTO pobox_tarifas_extras (nombre_servicio, descripcion, costo, moneda)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nombre_servicio, descripcion, costo, moneda || 'MXN']
        );

        res.json({ success: true, servicio: result.rows[0] });
    } catch (error) {
        console.error('Error creando servicio:', error);
        res.status(500).json({ error: 'Error al crear servicio' });
    }
};
