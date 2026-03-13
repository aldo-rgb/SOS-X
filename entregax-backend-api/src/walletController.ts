// ============================================
// CONTROLADOR DE BILLETERA Y REFERIDOS
// Endpoints para monedero digital y sistema de referidos
// ============================================

import { Request, Response } from 'express';
import * as walletService from './walletService';
import * as referralService from './referralService';

// ============================================
// INTERFACES
// ============================================

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    level: number;
  };
}

// ============================================
// ENDPOINTS DE BILLETERA
// ============================================

/**
 * GET /api/wallet/balance
 * Obtiene el saldo actual de la billetera del usuario
 */
export const getBalance = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const saldo = await walletService.getSaldo(userId);
    
    if (!saldo) {
      return res.status(404).json({ error: 'No se encontró la billetera' });
    }
    
    res.json({
      success: true,
      data: {
        saldo_disponible: saldo.disponible,
        saldo_pendiente: saldo.pendiente,
        saldo_total: saldo.total,
        moneda: saldo.moneda,
        formatted: {
          disponible: `$${saldo.disponible.toFixed(2)} ${saldo.moneda}`,
          pendiente: `$${saldo.pendiente.toFixed(2)} ${saldo.moneda}`,
          total: `$${saldo.total.toFixed(2)} ${saldo.moneda}`,
        },
      },
    });
  } catch (error) {
    console.error('Error en getBalance:', error);
    res.status(500).json({ error: 'Error al obtener saldo' });
  }
};

/**
 * GET /api/wallet/summary
 * Obtiene resumen completo de la billetera con historial reciente
 */
export const getSummary = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const resumen = await walletService.getResumenBilletera(userId);
    
    res.json({
      success: true,
      data: resumen,
    });
  } catch (error) {
    console.error('Error en getSummary:', error);
    res.status(500).json({ error: 'Error al obtener resumen de billetera' });
  }
};

/**
 * GET /api/wallet/transactions
 * Obtiene historial de transacciones paginado
 */
export const getTransactions = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const historial = await walletService.getHistorialTransacciones(userId, limit, offset);
    
    res.json({
      success: true,
      data: historial.transacciones,
      pagination: {
        total: historial.total,
        limit,
        offset,
        has_more: offset + limit < historial.total,
      },
    });
  } catch (error) {
    console.error('Error en getTransactions:', error);
    res.status(500).json({ error: 'Error al obtener transacciones' });
  }
};

/**
 * POST /api/wallet/apply
 * Aplica saldo de billetera a un pago
 */
export const applyToPayment = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    const { monto_total, orden_id, descripcion } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    if (!monto_total || monto_total <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    
    const resultado = await walletService.aplicarSaldoAPago(
      userId,
      monto_total,
      orden_id || 0,
      descripcion || `Orden #${orden_id}`
    );
    
    res.json({
      success: true,
      data: {
        saldo_aplicado: resultado.saldo_aplicado,
        restante_a_cobrar: resultado.restante_a_cobrar,
        transaccion_id: resultado.transaccion_id,
        formatted: {
          saldo_aplicado: `$${resultado.saldo_aplicado.toFixed(2)} MXN`,
          restante: `$${resultado.restante_a_cobrar.toFixed(2)} MXN`,
        },
      },
    });
  } catch (error) {
    console.error('Error en applyToPayment:', error);
    res.status(500).json({ error: 'Error al aplicar saldo' });
  }
};

// ============================================
// ENDPOINTS DE REFERIDOS
// ============================================

/**
 * GET /api/referral/code
 * Obtiene el código de referido del usuario
 */
export const getMyReferralCode = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    // Generar código si no tiene
    const codigo = await referralService.generateReferralCode(userId);
    
    // Obtener configuración de bonos
    const settings = await referralService.getReferralSettings();
    
    res.json({
      success: true,
      data: {
        codigo,
        share_link: `https://app.entregax.com/referido/${codigo}`,
        share_message: `¡Regístrate en EntregaX con mi código ${codigo} y recibe $${settings.referred_bonus} MXN de bono! 🎁`,
        bonos: {
          al_referir: settings.referrer_bonus,
          al_registrarse: settings.referred_bonus,
          moneda: settings.currency,
          condicion: `Al hacer su primer envío de más de $${settings.minimum_order_amount}`,
        },
      },
    });
  } catch (error) {
    console.error('Error en getMyReferralCode:', error);
    res.status(500).json({ error: 'Error al obtener código de referido' });
  }
};

/**
 * GET /api/referral/validate/:code
 * Valida si un código de referido es válido
 */
export const validateCode = async (req: Request, res: Response): Promise<any> => {
  try {
    const code = req.params.code as string;
    
    if (!code) {
      return res.status(400).json({ error: 'Código requerido' });
    }
    
    const validacion = await referralService.validateReferralCode(code);
    
    res.json({
      success: validacion.valid,
      data: validacion.valid ? {
        referidor: validacion.referidor_nombre,
        bono: validacion.bono_referido,
      } : null,
      error: validacion.error,
    });
  } catch (error) {
    console.error('Error en validateCode:', error);
    res.status(500).json({ error: 'Error al validar código' });
  }
};

/**
 * POST /api/referral/register
 * Registra un código de referido para un usuario (al crear cuenta)
 */
export const registerReferral = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    const { codigo } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    if (!codigo) {
      return res.status(400).json({ error: 'Código de referido requerido' });
    }
    
    // Obtener IP y user agent
    const ip = req.ip || req.headers['x-forwarded-for'] as string;
    const userAgent = req.headers['user-agent'];
    const deviceFingerprint = req.body.device_fingerprint;
    
    const resultado = await referralService.registrarReferido(
      userId,
      codigo,
      ip,
      userAgent,
      deviceFingerprint
    );
    
    if (!resultado.success) {
      return res.status(400).json({ 
        success: false, 
        error: resultado.error 
      });
    }
    
    res.json({
      success: true,
      message: '¡Código de referido registrado! Recibirás tu bono al completar tu primer envío.',
    });
  } catch (error) {
    console.error('Error en registerReferral:', error);
    res.status(500).json({ error: 'Error al registrar código' });
  }
};

/**
 * GET /api/referral/my-referrals
 * Obtiene lista de referidos del usuario
 */
export const getMyReferrals = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const data = await referralService.getMisReferidos(userId);
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error en getMyReferrals:', error);
    res.status(500).json({ error: 'Error al obtener referidos' });
  }
};

/**
 * GET /api/referral/my-referrer
 * Obtiene información del referidor del usuario
 */
export const getMyReferrer = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const data = await referralService.getMiReferidor(userId);
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error en getMyReferrer:', error);
    res.status(500).json({ error: 'Error al obtener referidor' });
  }
};

/**
 * GET /api/referral/settings
 * Obtiene configuración pública del programa de referidos
 */
export const getSettings = async (req: Request, res: Response): Promise<any> => {
  try {
    const settings = await referralService.getReferralSettings();
    
    res.json({
      success: true,
      data: {
        is_active: settings.is_active,
        bono_al_referir: settings.referrer_bonus,
        bono_al_registrarse: settings.referred_bonus,
        moneda: settings.currency,
        monto_minimo_primer_envio: settings.minimum_order_amount,
        expiracion_dias: settings.bonus_expiry_days,
      },
    });
  } catch (error) {
    console.error('Error en getSettings:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

// ============================================
// ENDPOINTS ADMIN
// ============================================

/**
 * POST /api/admin/wallet/deposit
 * Deposita saldo manualmente a un usuario (admin)
 */
export const adminDeposit = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = req.user?.id;
    const { usuario_id, monto, concepto } = req.body;
    
    if (!adminId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    // Verificar permisos de admin (level >= 80)
    if ((req.user?.level || 0) < 80) {
      return res.status(403).json({ error: 'Sin permisos de administrador' });
    }
    
    if (!usuario_id || !monto || monto <= 0) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    
    const resultado = await walletService.depositar(
      usuario_id,
      monto,
      concepto || 'Depósito manual por administrador',
      'admin',
      undefined,
      { admin_id: adminId },
      adminId
    );
    
    if (!resultado.success) {
      return res.status(400).json({ 
        success: false, 
        error: resultado.error 
      });
    }
    
    res.json({
      success: true,
      data: {
        transaccion_id: resultado.transaccion_id,
        nuevo_saldo: resultado.saldo_nuevo,
      },
    });
  } catch (error) {
    console.error('Error en adminDeposit:', error);
    res.status(500).json({ error: 'Error al hacer depósito' });
  }
};

/**
 * POST /api/admin/wallet/withdraw
 * Retira saldo manualmente de un usuario (admin)
 */
export const adminWithdraw = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = req.user?.id;
    const { usuario_id, monto, concepto } = req.body;
    
    if (!adminId) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    if ((req.user?.level || 0) < 80) {
      return res.status(403).json({ error: 'Sin permisos de administrador' });
    }
    
    if (!usuario_id || !monto || monto <= 0) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    
    const resultado = await walletService.retirar(
      usuario_id,
      monto,
      concepto || 'Retiro manual por administrador',
      'admin',
      undefined,
      { admin_id: adminId },
      adminId
    );
    
    if (!resultado.success) {
      return res.status(400).json({ 
        success: false, 
        error: resultado.error 
      });
    }
    
    res.json({
      success: true,
      data: {
        transaccion_id: resultado.transaccion_id,
        nuevo_saldo: resultado.saldo_nuevo,
      },
    });
  } catch (error) {
    console.error('Error en adminWithdraw:', error);
    res.status(500).json({ error: 'Error al hacer retiro' });
  }
};

/**
 * GET /api/admin/referrals/top
 * Obtiene top referidores (admin)
 */
export const getTopReferrers = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if ((req.user?.level || 0) < 50) {
      return res.status(403).json({ error: 'Sin permisos' });
    }
    
    const { pool } = require('./db');
    
    const result = await pool.query(`
      SELECT * FROM v_top_referidores LIMIT 50
    `);
    
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error en getTopReferrers:', error);
    res.status(500).json({ error: 'Error al obtener top referidores' });
  }
};

export default {
  // Wallet
  getBalance,
  getSummary,
  getTransactions,
  applyToPayment,
  // Referral
  getMyReferralCode,
  validateCode,
  registerReferral,
  getMyReferrals,
  getMyReferrer,
  getSettings,
  // Admin
  adminDeposit,
  adminWithdraw,
  getTopReferrers,
};
