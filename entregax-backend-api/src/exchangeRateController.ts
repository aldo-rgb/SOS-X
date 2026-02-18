// ============================================
// EXCHANGE RATE CONTROLLER
// Controlador para configuración de tipo de cambio
// Con sistema de fallback y alertas de desconexión
// ============================================

import { Request, Response } from 'express';
import { pool } from './db';
import axios from 'axios';

// ============================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================

const BANXICO_TOKEN = process.env.BANXICO_TOKEN || '';
const DEFAULT_EXCHANGE_RATE = 17.50;
const HOURS_BEFORE_ALERT = 12;

// ============================================
// OBTENER TIPO DE CAMBIO DE API (con fallback)
// ============================================

interface ExchangeRateResult {
    rate: number;
    source: 'banxico' | 'exchangerate-api' | 'fallback' | 'manual';
    success: boolean;
    error?: string;
}

export const fetchExchangeRateFromAPI = async (): Promise<number | null> => {
    const result = await fetchExchangeRateWithFallback();
    return result.success ? result.rate : null;
};

export const fetchExchangeRateWithFallback = async (): Promise<ExchangeRateResult> => {
    // Intentar Banxico primero
    try {
        if (BANXICO_TOKEN) {
            const response = await axios.get(
                'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno',
                {
                    headers: { 'Bmx-Token': BANXICO_TOKEN },
                    timeout: 10000
                }
            );
            const dato = response.data?.bmx?.series?.[0]?.datos?.[0]?.dato;
            if (dato) {
                const rate = parseFloat(dato);
                await updateSystemStatus(rate, 'banxico', true);
                return { rate, source: 'banxico', success: true };
            }
        }
    } catch (error) {
        console.warn('⚠️ Banxico API no disponible, intentando fallback...');
    }

    // Fallback 1: ExchangeRate-API
    try {
        const fallbackResponse = await axios.get(
            'https://api.exchangerate-api.com/v4/latest/USD',
            { timeout: 10000 }
        );
        if (fallbackResponse.data?.rates?.MXN) {
            const rate = fallbackResponse.data.rates.MXN;
            await updateSystemStatus(rate, 'exchangerate-api', true);
            return { rate, source: 'exchangerate-api', success: true };
        }
    } catch (error) {
        console.warn('⚠️ ExchangeRate-API no disponible, usando fallback local...');
    }

    // Fallback 2: Último valor guardado en el sistema
    try {
        const lastRate = await getLastKnownExchangeRate();
        if (lastRate) {
            await updateSystemStatus(lastRate, 'fallback', false);
            return { rate: lastRate, source: 'fallback', success: true };
        }
    } catch (error) {
        console.error('Error obteniendo último tipo de cambio:', error);
    }

    // Fallback 3: Valor por defecto
    await updateSystemStatus(DEFAULT_EXCHANGE_RATE, 'fallback', false);
    return { 
        rate: DEFAULT_EXCHANGE_RATE, 
        source: 'fallback', 
        success: true,
        error: 'Usando valor por defecto - APIs no disponibles'
    };
};

// ============================================
// FUNCIONES DE SISTEMA DE FALLBACK
// ============================================

async function getLastKnownExchangeRate(): Promise<number | null> {
    try {
        const result = await pool.query(
            'SELECT ultimo_tc_global FROM exchange_rate_system_status ORDER BY id DESC LIMIT 1'
        );
        if (result.rows.length > 0 && result.rows[0].ultimo_tc_global) {
            return parseFloat(result.rows[0].ultimo_tc_global);
        }
        return null;
    } catch {
        return null;
    }
}

async function updateSystemStatus(rate: number, source: string, apiSuccess: boolean): Promise<void> {
    try {
        const now = new Date();
        
        // Actualizar estado del sistema
        await pool.query(`
            UPDATE exchange_rate_system_status 
            SET ultimo_tc_global = $1,
                ultima_fuente = $2,
                intentos_fallidos_consecutivos = CASE WHEN $3 THEN 0 ELSE intentos_fallidos_consecutivos + 1 END,
                api_banxico_activa = $3,
                ultima_actualizacion_exitosa = CASE WHEN $3 THEN $4 ELSE ultima_actualizacion_exitosa END,
                updated_at = $4
            WHERE id = (SELECT id FROM exchange_rate_system_status LIMIT 1)
        `, [rate, source, apiSuccess, now]);

        // Si API exitosa, actualizar todas las configuraciones con el nuevo TC
        if (apiSuccess) {
            await pool.query(`
                UPDATE exchange_rate_config 
                SET ultimo_tc_api = $1,
                    ultima_conexion_api = $2,
                    api_activa = TRUE,
                    horas_sin_api = 0
                WHERE usar_api = TRUE
            `, [rate, now]);

            // Marcar alertas como resueltas si las hay
            await pool.query(`
                UPDATE exchange_rate_alerts 
                SET resuelto = TRUE, resolved_at = $1 
                WHERE resuelto = FALSE AND tipo = 'api_desconectada'
            `, [now]);
        }

        // Verificar si necesitamos crear alerta por desconexión prolongada
        if (!apiSuccess) {
            await checkAndCreateDisconnectionAlert();
        }
    } catch (error) {
        console.error('Error actualizando estado del sistema:', error);
    }
}

async function checkAndCreateDisconnectionAlert(): Promise<void> {
    try {
        const result = await pool.query(`
            SELECT 
                ultima_actualizacion_exitosa,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ultima_actualizacion_exitosa)) / 3600 as horas_desconectado,
                alerta_activa
            FROM exchange_rate_system_status 
            LIMIT 1
        `);

        if (result.rows.length === 0) return;

        const { horas_desconectado, alerta_activa } = result.rows[0];

        // Si han pasado más de 12 horas y no hay alerta activa
        if (horas_desconectado >= HOURS_BEFORE_ALERT && !alerta_activa) {
            // Crear alerta
            await pool.query(`
                INSERT INTO exchange_rate_alerts (tipo, mensaje, horas_desconectado)
                VALUES ('alerta_12h', $1, $2)
            `, [
                `⚠️ ALERTA: La API de tipo de cambio lleva ${Math.floor(horas_desconectado)} horas sin conexión. El sistema está usando el último tipo de cambio conocido.`,
                Math.floor(horas_desconectado)
            ]);

            // Marcar alerta como activa en el sistema
            await pool.query(`
                UPDATE exchange_rate_system_status SET alerta_activa = TRUE
            `);

            // Crear notificaciones para Admin y Director
            await createAlertNotifications(Math.floor(horas_desconectado));

            console.warn(`🚨 ALERTA: APIs de tipo de cambio desconectadas por ${Math.floor(horas_desconectado)} horas`);
        }
    } catch (error) {
        console.error('Error verificando alertas de desconexión:', error);
    }
}

async function createAlertNotifications(horasDesconectado: number): Promise<void> {
    try {
        // Obtener administradores y directores
        const users = await pool.query(`
            SELECT id, full_name, role FROM users 
            WHERE role IN ('super_admin', 'admin', 'director') AND estado = TRUE
        `);

        const mensaje = `🚨 ALERTA CRÍTICA: El sistema de tipo de cambio lleva ${horasDesconectado} horas sin conexión a las APIs de Banxico y ExchangeRate. Se está utilizando el último tipo de cambio conocido. Por favor, verifique la conectividad y configure un tipo de cambio manual si es necesario.`;

        for (const user of users.rows) {
            await pool.query(`
                INSERT INTO notifications (user_id, title, message, type, icon, action_url)
                VALUES ($1, $2, $3, 'warning', 'alert-circle', '/admin/exchange-rates')
            `, [
                user.id,
                '⚠️ Alerta de Tipo de Cambio',
                mensaje
            ]);
        }

        console.log(`📧 Notificaciones enviadas a ${users.rows.length} administradores/directores`);
    } catch (error) {
        console.error('Error creando notificaciones de alerta:', error);
    }
}

// ============================================
// OBTENER CONFIGURACIÓN DE TIPO DE CAMBIO
// ============================================

export const getExchangeRateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(
            'SELECT * FROM exchange_rate_config ORDER BY nombre_display ASC'
        );

        // Obtener tipo de cambio actual (con fallback)
        const rateResult = await fetchExchangeRateWithFallback();

        // Obtener estado del sistema
        const systemStatus = await pool.query(
            'SELECT * FROM exchange_rate_system_status LIMIT 1'
        );

        // Obtener alertas activas
        const alertas = await pool.query(
            'SELECT * FROM exchange_rate_alerts WHERE resuelto = FALSE ORDER BY created_at DESC LIMIT 5'
        );

        res.json({
            configuraciones: result.rows,
            tipo_cambio_api: rateResult.rate,
            fuente_api: rateResult.source,
            api_conectada: rateResult.source === 'banxico' || rateResult.source === 'exchangerate-api',
            sistema: systemStatus.rows[0] || null,
            alertas_activas: alertas.rows
        });
    } catch (error) {
        console.error('Error obteniendo configuración:', error);
        res.status(500).json({ error: 'Error al obtener configuración de tipo de cambio' });
    }
};

// ============================================
// OBTENER TIPO DE CAMBIO POR SERVICIO
// (Nunca retorna sin tipo de cambio)
// ============================================

export const getExchangeRateByService = async (req: Request, res: Response): Promise<void> => {
    try {
        const { servicio } = req.params;

        const result = await pool.query(
            'SELECT * FROM exchange_rate_config WHERE servicio = $1 AND estado = TRUE',
            [servicio]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Servicio no encontrado' });
            return;
        }

        const config = result.rows[0];
        let tipoCambioBase: number;
        let fuente: string;

        // Determinar tipo de cambio base (SIEMPRE tendrá un valor)
        if (config.usar_api) {
            const rateResult = await fetchExchangeRateWithFallback();
            tipoCambioBase = rateResult.rate;
            fuente = rateResult.source;
        } else {
            // Usar manual, o último conocido si no hay manual
            tipoCambioBase = config.tipo_cambio_manual || config.ultimo_tc_api || DEFAULT_EXCHANGE_RATE;
            fuente = 'manual';
        }

        // Calcular tipo de cambio final con sobreprecio
        let tipoCambioFinal = tipoCambioBase;
        
        if (config.sobreprecio && config.sobreprecio > 0) {
            tipoCambioFinal += parseFloat(config.sobreprecio);
        }
        
        if (config.sobreprecio_porcentaje && config.sobreprecio_porcentaje > 0) {
            tipoCambioFinal += tipoCambioBase * (parseFloat(config.sobreprecio_porcentaje) / 100);
        }

        res.json({
            servicio: config.servicio,
            nombre: config.nombre_display,
            tipo_cambio_base: tipoCambioBase.toFixed(4),
            sobreprecio: config.sobreprecio || 0,
            sobreprecio_porcentaje: config.sobreprecio_porcentaje || 0,
            tipo_cambio_final: tipoCambioFinal.toFixed(4),
            usa_api: config.usar_api,
            fuente: fuente,
            api_activa: config.api_activa,
            ultima_actualizacion: config.ultima_conexion_api
        });
    } catch (error) {
        console.error('Error obteniendo tipo de cambio:', error);
        res.status(500).json({ error: 'Error al obtener tipo de cambio' });
    }
};

// ============================================
// ACTUALIZAR CONFIGURACIÓN DE TIPO DE CAMBIO
// ============================================

export const updateExchangeRateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { 
            tipo_cambio_manual, 
            sobreprecio, 
            sobreprecio_porcentaje, 
            usar_api,
            estado 
        } = req.body;

        // Obtener tipo de cambio base
        let tipoCambioBase: number;
        if (usar_api) {
            const tcAPI = await fetchExchangeRateFromAPI();
            tipoCambioBase = tcAPI || tipo_cambio_manual || 17.50;
        } else {
            tipoCambioBase = tipo_cambio_manual || 17.50;
        }

        // Calcular tipo de cambio final
        let tipoCambioFinal = tipoCambioBase;
        if (sobreprecio) {
            tipoCambioFinal += parseFloat(sobreprecio);
        }
        if (sobreprecio_porcentaje) {
            tipoCambioFinal += tipoCambioBase * (parseFloat(sobreprecio_porcentaje) / 100);
        }

        const result = await pool.query(
            `UPDATE exchange_rate_config 
             SET tipo_cambio_manual = $1,
                 sobreprecio = COALESCE($2, sobreprecio),
                 sobreprecio_porcentaje = COALESCE($3, sobreprecio_porcentaje),
                 usar_api = COALESCE($4, usar_api),
                 tipo_cambio_final = $5,
                 ultima_actualizacion = CURRENT_TIMESTAMP,
                 estado = COALESCE($6, estado),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING *`,
            [tipo_cambio_manual, sobreprecio, sobreprecio_porcentaje, usar_api, tipoCambioFinal, estado, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Configuración no encontrada' });
            return;
        }

        // Guardar en historial
        const config = result.rows[0];
        await pool.query(
            `INSERT INTO exchange_rate_history 
             (servicio, tipo_cambio_api, tipo_cambio_manual, sobreprecio, tipo_cambio_final, fuente)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                config.servicio,
                usar_api ? tipoCambioBase : null,
                tipo_cambio_manual,
                sobreprecio || config.sobreprecio,
                tipoCambioFinal,
                usar_api ? 'api' : 'manual'
            ]
        );

        res.json({ 
            success: true, 
            configuracion: config,
            tipo_cambio_calculado: tipoCambioFinal.toFixed(4)
        });
    } catch (error) {
        console.error('Error actualizando configuración:', error);
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
};

// ============================================
// ACTUALIZAR TODOS LOS TIPOS DE CAMBIO (desde API con fallback)
// ============================================

export const refreshAllExchangeRates = async (req: Request, res: Response): Promise<void> => {
    try {
        // Obtener tipo de cambio (siempre retorna un valor gracias al fallback)
        const rateResult = await fetchExchangeRateWithFallback();
        const tcBase = rateResult.rate;

        // Actualizar todos los servicios que usan API
        const configs = await pool.query(
            'SELECT * FROM exchange_rate_config WHERE usar_api = TRUE'
        );

        const actualizados: any[] = [];

        for (const config of configs.rows) {
            let tipoCambioFinal = tcBase;
            
            if (config.sobreprecio && config.sobreprecio > 0) {
                tipoCambioFinal += parseFloat(config.sobreprecio);
            }
            if (config.sobreprecio_porcentaje && config.sobreprecio_porcentaje > 0) {
                tipoCambioFinal += tcBase * (parseFloat(config.sobreprecio_porcentaje) / 100);
            }

            await pool.query(
                `UPDATE exchange_rate_config 
                 SET tipo_cambio_final = $1,
                     ultimo_tc_api = $2,
                     ultima_conexion_api = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE ultima_conexion_api END,
                     api_activa = $3,
                     ultima_actualizacion = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4`,
                [tipoCambioFinal, tcBase, rateResult.source !== 'fallback', config.id]
            );

            // Guardar en historial
            await pool.query(
                `INSERT INTO exchange_rate_history 
                 (servicio, tipo_cambio_api, sobreprecio, tipo_cambio_final, fuente)
                 VALUES ($1, $2, $3, $4, $5)`,
                [config.servicio, tcBase, config.sobreprecio || 0, tipoCambioFinal, rateResult.source]
            );

            actualizados.push({
                servicio: config.servicio,
                nombre: config.nombre_display,
                tipo_cambio_final: tipoCambioFinal.toFixed(4)
            });
        }

        res.json({
            success: true,
            tipo_cambio_base: tcBase.toFixed(4),
            fuente: rateResult.source,
            api_conectada: rateResult.source === 'banxico' || rateResult.source === 'exchangerate-api',
            mensaje: rateResult.source === 'fallback' 
                ? '⚠️ Usando tipo de cambio de respaldo (APIs no disponibles)'
                : '✅ Tipo de cambio actualizado desde API',
            servicios_actualizados: actualizados.length,
            detalles: actualizados
        });
    } catch (error) {
        console.error('Error actualizando tipos de cambio:', error);
        res.status(500).json({ error: 'Error al actualizar tipos de cambio' });
    }
};

// ============================================
// OBTENER HISTORIAL DE TIPO DE CAMBIO
// ============================================

export const getExchangeRateHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { servicio } = req.query;
        const limit = parseInt(req.query.limit as string) || 30;

        let query = 'SELECT * FROM exchange_rate_history';
        let params: any[] = [];

        if (servicio) {
            query += ' WHERE servicio = $1';
            params.push(servicio);
        }

        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
        params.push(limit);

        const result = await pool.query(query, params);

        res.json({ historial: result.rows });
    } catch (error) {
        console.error('Error obteniendo historial:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
};

// ============================================
// CREAR NUEVA CONFIGURACIÓN DE SERVICIO
// ============================================

export const createExchangeRateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const { servicio, nombre_display, tipo_cambio_manual, sobreprecio, sobreprecio_porcentaje, usar_api } = req.body;

        // Calcular tipo de cambio inicial
        let tipoCambioBase: number;
        if (usar_api) {
            const tcAPI = await fetchExchangeRateFromAPI();
            tipoCambioBase = tcAPI || tipo_cambio_manual || 17.50;
        } else {
            tipoCambioBase = tipo_cambio_manual || 17.50;
        }

        let tipoCambioFinal = tipoCambioBase;
        if (sobreprecio) tipoCambioFinal += parseFloat(sobreprecio);
        if (sobreprecio_porcentaje) tipoCambioFinal += tipoCambioBase * (parseFloat(sobreprecio_porcentaje) / 100);

        const result = await pool.query(
            `INSERT INTO exchange_rate_config 
             (servicio, nombre_display, tipo_cambio_manual, sobreprecio, sobreprecio_porcentaje, usar_api, tipo_cambio_final)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [servicio, nombre_display, tipo_cambio_manual, sobreprecio || 0, sobreprecio_porcentaje || 0, usar_api !== false, tipoCambioFinal]
        );

        res.json({ success: true, configuracion: result.rows[0] });
    } catch (error) {
        console.error('Error creando configuración:', error);
        res.status(500).json({ error: 'Error al crear configuración' });
    }
};
// ============================================
// OBTENER ESTADO DEL SISTEMA DE TIPO DE CAMBIO
// ============================================

export const getExchangeRateSystemStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const systemStatus = await pool.query(`
            SELECT 
                *,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ultima_actualizacion_exitosa)) / 3600 as horas_desde_ultima_conexion
            FROM exchange_rate_system_status 
            LIMIT 1
        `);

        const alertasActivas = await pool.query(`
            SELECT * FROM exchange_rate_alerts 
            WHERE resuelto = FALSE 
            ORDER BY created_at DESC
        `);

        if (systemStatus.rows.length === 0) {
            res.json({
                status: 'no_inicializado',
                mensaje: 'El sistema de tipo de cambio no ha sido inicializado'
            });
            return;
        }

        const status = systemStatus.rows[0];
        const horasDesde = parseFloat(status.horas_desde_ultima_conexion) || 0;

        res.json({
            status: horasDesde > HOURS_BEFORE_ALERT ? 'alerta' : (status.api_banxico_activa ? 'ok' : 'fallback'),
            ultimo_tc_global: status.ultimo_tc_global,
            ultima_fuente: status.ultima_fuente,
            ultima_actualizacion_exitosa: status.ultima_actualizacion_exitosa,
            horas_desde_ultima_conexion: horasDesde.toFixed(1),
            api_banxico_activa: status.api_banxico_activa,
            api_fallback_activa: status.api_fallback_activa,
            intentos_fallidos_consecutivos: status.intentos_fallidos_consecutivos,
            alerta_activa: status.alerta_activa,
            alertas: alertasActivas.rows
        });
    } catch (error) {
        console.error('Error obteniendo estado del sistema:', error);
        res.status(500).json({ error: 'Error al obtener estado del sistema' });
    }
};

// ============================================
// OBTENER ALERTAS DE TIPO DE CAMBIO
// ============================================

export const getExchangeRateAlerts = async (req: Request, res: Response): Promise<void> => {
    try {
        const { resuelto } = req.query;

        let query = 'SELECT * FROM exchange_rate_alerts';
        const params: any[] = [];

        if (resuelto !== undefined) {
            query += ' WHERE resuelto = $1';
            params.push(resuelto === 'true');
        }

        query += ' ORDER BY created_at DESC LIMIT 50';

        const result = await pool.query(query, params);

        res.json({ alertas: result.rows });
    } catch (error) {
        console.error('Error obteniendo alertas:', error);
        res.status(500).json({ error: 'Error al obtener alertas' });
    }
};

// ============================================
// RESOLVER ALERTA MANUALMENTE
// ============================================

export const resolveExchangeRateAlert = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        await pool.query(`
            UPDATE exchange_rate_alerts 
            SET resuelto = TRUE, resolved_at = CURRENT_TIMESTAMP 
            WHERE id = $1
        `, [id]);

        // Verificar si hay más alertas sin resolver
        const pendientes = await pool.query(
            'SELECT COUNT(*) FROM exchange_rate_alerts WHERE resuelto = FALSE'
        );

        if (parseInt(pendientes.rows[0].count) === 0) {
            await pool.query('UPDATE exchange_rate_system_status SET alerta_activa = FALSE');
        }

        res.json({ success: true, mensaje: 'Alerta resuelta' });
    } catch (error) {
        console.error('Error resolviendo alerta:', error);
        res.status(500).json({ error: 'Error al resolver alerta' });
    }
};