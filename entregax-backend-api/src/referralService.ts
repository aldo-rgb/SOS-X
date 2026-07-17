// ============================================
// SERVICIO DE REFERIDOS
// Motor de referidos con validación anti-fraude
// ============================================

import { pool } from './db';
import * as walletService from './walletService';
import { addUserToKit } from './welcomeKitController';
import crypto from 'crypto';

// ============================================
// INTERFACES
// ============================================

export interface ReferralSettings {
  referrer_bonus: number;
  referred_bonus: number;
  currency: string;
  minimum_order_amount: number;
  is_active: boolean;
  require_first_payment: boolean;
  max_referrals_per_user: number;
  bonus_expiry_days: number;
  // Tipo de premio para cada lado: 'money' = saldo a favor; 'kit' = Kit de Bienvenida.
  referrer_reward_type?: 'money' | 'kit';
  referred_reward_type?: 'money' | 'kit';
}

export interface AntifraudSettings {
  check_duplicate_card: boolean;
  check_duplicate_rfc: boolean;
  check_duplicate_email_domain: boolean;
  check_duplicate_device: boolean;
  min_days_between_referrals: number;
  max_referrals_same_ip: number;
}

export interface Referido {
  id: number;
  referidor_id: number;
  referido_id: number;
  codigo_usado: string;
  estado: 'registrado' | 'primer_pago' | 'validado' | 'rechazado' | 'expirado';
  fecha_registro: Date;
  fecha_primer_pago?: Date;
  fecha_validacion?: Date;
  monto_primer_pago?: number;
  bono_referidor: number;
  bono_referido: number;
  bonos_pagados: boolean;
}

export interface AntifraudCheck {
  passed: boolean;
  check_type: string;
  details: Record<string, any>;
  risk_score: number;
}

// ============================================
// OBTENER CONFIGURACIÓN
// ============================================

export const getReferralSettings = async (): Promise<ReferralSettings> => {
  try {
    const result = await pool.query(
      "SELECT config_value FROM system_configurations WHERE config_key = 'referral_settings' AND is_active = TRUE"
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].config_value as ReferralSettings;
    }
    
    // Valores por defecto
    return {
      referrer_bonus: 500,
      referred_bonus: 500,
      currency: 'MXN',
      minimum_order_amount: 1000,
      is_active: true,
      require_first_payment: true,
      max_referrals_per_user: 100,
      bonus_expiry_days: 365,
      referrer_reward_type: 'money',
      referred_reward_type: 'money',
    };
  } catch (error) {
    console.error('Error obteniendo configuración de referidos:', error);
    throw error;
  }
};

export const getAntifraudSettings = async (): Promise<AntifraudSettings> => {
  try {
    const result = await pool.query(
      "SELECT config_value FROM system_configurations WHERE config_key = 'antifraud_settings' AND is_active = TRUE"
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].config_value as AntifraudSettings;
    }
    
    return {
      check_duplicate_card: true,
      check_duplicate_rfc: true,
      check_duplicate_email_domain: false,
      check_duplicate_device: true,
      min_days_between_referrals: 1,
      max_referrals_same_ip: 5,
    };
  } catch (error) {
    console.error('Error obteniendo configuración anti-fraude:', error);
    throw error;
  }
};

// ============================================
// GENERAR CÓDIGO DE REFERIDO
// ============================================

export const generateReferralCode = async (
  usuarioId: number,
  nombreUsuario?: string
): Promise<string> => {
  try {
    // Verificar si ya tiene código
    const existing = await pool.query(
      "SELECT codigo FROM codigos_referido WHERE usuario_id = $1 AND tipo = 'personal'",
      [usuarioId]
    );
    
    if (existing.rows.length > 0) {
      return existing.rows[0].codigo;
    }
    
    // Generar usando la función de BD
    const result = await pool.query(
      'SELECT generate_referral_code($1, $2) as codigo',
      [usuarioId, nombreUsuario]
    );
    
    const codigo = result.rows[0].codigo;
    
    // Insertar en tabla de códigos
    await pool.query(
      `INSERT INTO codigos_referido (usuario_id, codigo, tipo)
       VALUES ($1, $2, 'personal')
       ON CONFLICT (codigo) DO NOTHING`,
      [usuarioId, codigo]
    );
    
    // Actualizar usuario
    await pool.query(
      'UPDATE users SET referral_code = $1 WHERE id = $2 AND (referral_code IS NULL OR referral_code = \'\')',
      [codigo, usuarioId]
    );
    
    return codigo;
  } catch (error) {
    console.error('Error generando código de referido:', error);
    throw error;
  }
};

// ============================================
// VALIDAR CÓDIGO DE REFERIDO
// ============================================

export const validateReferralCode = async (
  codigo: string
): Promise<{
  valid: boolean;
  referidor_id?: number;
  referidor_nombre?: string;
  bono_referido?: number;
  error?: string;
}> => {
  try {
    const settings = await getReferralSettings();
    
    if (!settings.is_active) {
      return { valid: false, error: 'El programa de referidos no está activo' };
    }
    
    const result = await pool.query(
      `SELECT cr.*, u.id as user_id, u.full_name 
       FROM codigos_referido cr
       JOIN users u ON cr.usuario_id = u.id
       WHERE cr.codigo = $1 AND cr.is_active = TRUE
         AND (cr.fecha_expiracion IS NULL OR cr.fecha_expiracion >= CURRENT_DATE)
         AND (cr.limite_usos IS NULL OR cr.usos_totales < cr.limite_usos)`,
      [codigo.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      return { valid: false, error: 'Código de referido inválido o expirado' };
    }
    
    const codigoInfo = result.rows[0];
    
    return {
      valid: true,
      referidor_id: codigoInfo.user_id,
      referidor_nombre: codigoInfo.full_name,
      bono_referido: codigoInfo.bono_especial_referido || settings.referred_bonus,
    };
  } catch (error) {
    console.error('Error validando código de referido:', error);
    return { valid: false, error: 'Error validando código' };
  }
};

// ============================================
// REGISTRAR REFERIDO (AL CREAR CUENTA)
// ============================================

export const registrarReferido = async (
  referidoId: number,
  codigoUsado: string,
  ipRegistro?: string,
  userAgent?: string,
  deviceFingerprint?: string
): Promise<{
  success: boolean;
  referido_id?: number | undefined;
  error?: string | undefined;
}> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Validar código
    const validacion = await validateReferralCode(codigoUsado);
    
    if (!validacion.valid || !validacion.referidor_id) {
      return { success: false, error: validacion.error };
    }
    
    // Verificar que el usuario no se auto-refiera
    if (validacion.referidor_id === referidoId) {
      return { success: false, error: 'No puedes usar tu propio código de referido' };
    }
    
    // Verificar si ya existe registro de referido
    const existingRef = await client.query(
      'SELECT id FROM referidos WHERE referido_id = $1',
      [referidoId]
    );
    
    if (existingRef.rows.length > 0) {
      return { success: false, error: 'Este usuario ya tiene un referidor asignado' };
    }
    
    // Obtener configuración de bonos
    const settings = await getReferralSettings();
    
    // Obtener bonos especiales si existen
    const codigoInfo = await client.query(
      'SELECT bono_especial_referidor, bono_especial_referido FROM codigos_referido WHERE codigo = $1',
      [codigoUsado.toUpperCase()]
    );
    
    const bonoReferidor = codigoInfo.rows[0]?.bono_especial_referidor || settings.referrer_bonus;
    const bonoReferido = codigoInfo.rows[0]?.bono_especial_referido || settings.referred_bonus;
    
    // Crear registro de referido
    const result = await client.query(
      `INSERT INTO referidos 
       (referidor_id, referido_id, codigo_usado, estado, bono_referidor, bono_referido, ip_registro, user_agent, device_fingerprint)
       VALUES ($1, $2, $3, 'registrado', $4, $5, $6, $7, $8)
       RETURNING id`,
      [validacion.referidor_id, referidoId, codigoUsado.toUpperCase(), bonoReferidor, bonoReferido, ipRegistro, userAgent, deviceFingerprint]
    );
    
    // Actualizar usuario referido
    await client.query(
      'UPDATE users SET referred_by_id = $1 WHERE id = $2',
      [validacion.referidor_id, referidoId]
    );
    
    // Incrementar contador de usos del código
    await client.query(
      'UPDATE codigos_referido SET usos_totales = usos_totales + 1 WHERE codigo = $1',
      [codigoUsado.toUpperCase()]
    );
    
    await client.query('COMMIT');
    
    return {
      success: true,
      referido_id: result.rows[0].id,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error registrando referido:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
};

// ============================================
// VERIFICACIONES ANTI-FRAUDE
// ============================================

const hashCardInfo = (bin: string, last4: string): string => {
  return crypto.createHash('sha256').update(`${bin}:${last4}`).digest('hex');
};

export const runAntifraudChecks = async (
  referidoId: number,
  usuarioReferidoId: number,
  usuarioReferidorId: number,
  cardBin?: string,
  cardLast4?: string
): Promise<{
  passed: boolean;
  checks: AntifraudCheck[];
  total_risk_score: number;
}> => {
  const settings = await getAntifraudSettings();
  const checks: AntifraudCheck[] = [];
  let totalRiskScore = 0;
  
  try {
    // 1. Verificar tarjeta duplicada
    if (settings.check_duplicate_card && cardBin && cardLast4) {
      const cardHash = hashCardInfo(cardBin, cardLast4);
      
      // Verificar si el referidor tiene la misma tarjeta
      const referidorCards = await pool.query(
        'SELECT card_hashes FROM users WHERE id = $1',
        [usuarioReferidorId]
      );
      
      const referidorHashes = referidorCards.rows[0]?.card_hashes || [];
      const isDuplicateCard = referidorHashes.includes(cardHash);
      
      const check: AntifraudCheck = {
        passed: !isDuplicateCard,
        check_type: 'card_duplicate',
        details: { is_duplicate: isDuplicateCard },
        risk_score: isDuplicateCard ? 50 : 0,
      };
      checks.push(check);
      totalRiskScore += check.risk_score;
      
      // Guardar hash de tarjeta del referido
      await pool.query(
        'UPDATE users SET card_hashes = array_append(COALESCE(card_hashes, ARRAY[]::TEXT[]), $1) WHERE id = $2 AND NOT ($1 = ANY(COALESCE(card_hashes, ARRAY[]::TEXT[])))',
        [cardHash, usuarioReferidoId]
      );
      
      // Guardar hash en referido
      await pool.query(
        'UPDATE referidos SET tarjeta_hash = $1 WHERE id = $2',
        [cardHash, referidoId]
      );
    }
    
    // 2. Verificar RFC duplicado
    if (settings.check_duplicate_rfc) {
      const rfcCheck = await pool.query(
        `SELECT 
           (SELECT rfc FROM users WHERE id = $1) as rfc_referido,
           (SELECT rfc FROM users WHERE id = $2) as rfc_referidor`,
        [usuarioReferidoId, usuarioReferidorId]
      );
      
      const { rfc_referido, rfc_referidor } = rfcCheck.rows[0];
      const isDuplicateRfc = rfc_referido && rfc_referidor && rfc_referido === rfc_referidor;
      
      const check: AntifraudCheck = {
        passed: !isDuplicateRfc,
        check_type: 'rfc_duplicate',
        details: { is_duplicate: isDuplicateRfc },
        risk_score: isDuplicateRfc ? 60 : 0,
      };
      checks.push(check);
      totalRiskScore += check.risk_score;
    }
    
    // 3. Verificar device fingerprint duplicado
    if (settings.check_duplicate_device) {
      const deviceCheck = await pool.query(
        `SELECT 
           r.device_fingerprint as referido_device,
           u.device_fingerprint as referidor_device
         FROM referidos r
         JOIN users u ON r.referidor_id = u.id
         WHERE r.id = $1`,
        [referidoId]
      );
      
      if (deviceCheck.rows.length > 0) {
        const { referido_device, referidor_device } = deviceCheck.rows[0];
        const isDuplicateDevice = referido_device && referidor_device && referido_device === referidor_device;
        
        const check: AntifraudCheck = {
          passed: !isDuplicateDevice,
          check_type: 'device_duplicate',
          details: { is_duplicate: isDuplicateDevice },
          risk_score: isDuplicateDevice ? 40 : 0,
        };
        checks.push(check);
        totalRiskScore += check.risk_score;
      }
    }
    
    // 4. Verificar abuso de IP
    const referidoInfo = await pool.query(
      'SELECT ip_registro FROM referidos WHERE id = $1',
      [referidoId]
    );
    
    if (referidoInfo.rows[0]?.ip_registro) {
      const ipAbuse = await pool.query(
        `SELECT COUNT(*) FROM referidos 
         WHERE ip_registro = $1 
         AND created_at > NOW() - INTERVAL '7 days'`,
        [referidoInfo.rows[0].ip_registro]
      );
      
      const ipCount = parseInt(ipAbuse.rows[0].count);
      const isIpAbuse = ipCount > settings.max_referrals_same_ip;
      
      const check: AntifraudCheck = {
        passed: !isIpAbuse,
        check_type: 'ip_abuse',
        details: { registrations_from_ip: ipCount, max_allowed: settings.max_referrals_same_ip },
        risk_score: isIpAbuse ? 30 : 0,
      };
      checks.push(check);
      totalRiskScore += check.risk_score;
    }
    
    // Registrar todos los checks (best-effort: no debe tumbar el resultado del anti-fraude).
    try {
      for (const check of checks) {
        await pool.query(
          `INSERT INTO antifraud_checks (referido_id, usuario_id, check_type, check_result, check_details, risk_score)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [referidoId, usuarioReferidoId, check.check_type, check.passed, JSON.stringify(check.details), check.risk_score]
        );
      }
    } catch (logErr) {
      console.warn('[ANTIFRAUD] no se pudo registrar checks (se continúa):', (logErr as Error).message);
    }
    
    // Determinar si pasó todos los checks críticos
    const passed = totalRiskScore < 50; // Umbral de riesgo
    
    return {
      passed,
      checks,
      total_risk_score: totalRiskScore,
    };
  } catch (error) {
    console.error('Error en verificaciones anti-fraude:', error);
    return {
      passed: false,
      checks: [],
      total_risk_score: 100,
    };
  }
};

// ============================================
// PROCESAR PRIMER PAGO (TRIGGER DE BONOS)
// ============================================

export const procesarPrimerPago = async (
  usuarioId: number,
  montoPago: number,
  ordenId: number,
  cardBin?: string,
  cardLast4?: string
): Promise<{
  bonos_activados: boolean;
  bono_referidor?: number;
  bono_referido?: number;
  razon_rechazo?: string;
}> => {
  // IMPORTANTE: NO se usa una transacción propia que envuelva a walletService.depositar
  // ni al anti-fraude (ambos usan el pool en otras conexiones). Mantener una fila de
  // users/referidos bloqueada mientras se llama a esas funciones causaba un DEADLOCK que
  // colgaba el pool. Aquí cada paso corre con su propia conexión (auto-commit) y la
  // idempotencia se logra con un "claim" atómico del estado.
  try {
    // 1) Claim atómico: solo un proceso puede pasar registrado -> primer_pago.
    const claim = await pool.query(
      `UPDATE referidos
          SET estado = 'primer_pago', fecha_primer_pago = NOW(),
              monto_primer_pago = $2, orden_id = $3, updated_at = NOW()
        WHERE referido_id = $1 AND estado = 'registrado'
      RETURNING id, referidor_id, referido_id, bono_referidor, bono_referido`,
      [usuarioId, montoPago, ordenId]
    );
    if (claim.rows.length === 0) {
      return { bonos_activados: false, razon_rechazo: 'Usuario no es referido registrado (o ya se procesó)' };
    }
    const referido = claim.rows[0];
    const settings = await getReferralSettings();

    // 2) Monto mínimo del primer envío.
    if (montoPago < settings.minimum_order_amount) {
      await pool.query(
        `UPDATE referidos SET estado='rechazado', razon_rechazo=$2, updated_at=NOW() WHERE id=$1`,
        [referido.id, `Monto de primer envío ($${montoPago}) menor al mínimo ($${settings.minimum_order_amount})`]
      );
      return { bonos_activados: false, razon_rechazo: `El primer envío debe ser mayor a $${settings.minimum_order_amount} MXN` };
    }

    // 3) Anti-fraude.
    const antifraud = await runAntifraudChecks(referido.id, usuarioId, referido.referidor_id, cardBin, cardLast4);
    if (!antifraud.passed) {
      await pool.query(
        `UPDATE referidos SET estado='rechazado', razon_rechazo=$2, metadata=$3::jsonb, updated_at=NOW() WHERE id=$1`,
        [referido.id, 'No pasó las verificaciones de seguridad',
         JSON.stringify({ antifraud_checks: antifraud.checks, risk_score: antifraud.total_risk_score })]
      );
      return { bonos_activados: false, razon_rechazo: 'Verificación de seguridad fallida' };
    }

    // 4) Entregar premios (dinero o Kit) según la configuración, por lado.
    const nombreRef = (await pool.query('SELECT full_name FROM users WHERE id = $1', [usuarioId])).rows[0]?.full_name || 'Usuario';
    const referrerType = settings.referrer_reward_type || 'money';
    const referredType = settings.referred_reward_type || 'money';

    // Referidor
    if (referrerType === 'kit') {
      await addUserToKit(referido.referidor_id);
    } else {
      await walletService.depositar(
        referido.referidor_id, Number(referido.bono_referidor),
        `Recompensa por referido: ${nombreRef}`, 'referido', referido.id,
        { tipo: 'bono_referidor', referido_id: usuarioId }
      );
    }
    // Referido
    if (referredType === 'kit') {
      await addUserToKit(usuarioId);
    } else {
      await walletService.depositar(
        usuarioId, Number(referido.bono_referido),
        'Bono de bienvenida por referido', 'referido', referido.id,
        { tipo: 'bono_referido', referidor_id: referido.referidor_id }
      );
    }

    // 5) Marcar validado + primer pago + contadores del referidor.
    await pool.query(
      `UPDATE referidos SET estado='validado', fecha_validacion=NOW(), bonos_pagados=TRUE, updated_at=NOW() WHERE id=$1`,
      [referido.id]
    );
    await pool.query(
      'UPDATE users SET first_payment_date = NOW(), first_payment_amount = $1 WHERE id = $2',
      [montoPago, usuarioId]
    );
    await pool.query(
      `UPDATE users SET referrals_count = COALESCE(referrals_count,0) + 1,
                        referrals_earnings = COALESCE(referrals_earnings,0) + $1
        WHERE id = $2`,
      [referrerType === 'money' ? Number(referido.bono_referidor) : 0, referido.referidor_id]
    );

    return {
      bonos_activados: true,
      bono_referidor: Number(referido.bono_referidor),
      bono_referido: Number(referido.bono_referido),
    };
  } catch (error: any) {
    console.error('Error procesando primer pago:', error);
    return { bonos_activados: false, razon_rechazo: error.message };
  }
};

// ============================================================================
// CRON: procesa el PRIMER ENVÍO real de los referidos y activa los bonos.
// Regla: el Kit de Bienvenida NO cuenta (guías 'USK-%' excluidas). Solo cuenta
// un envío PAGADO (payment_status='paid'), master (no cajas hijas), con costo.
// procesarPrimerPago aplica el mínimo, anti-fraude e idempotencia.
// ============================================================================
export const procesarReferidosPrimerEnvio = async (): Promise<{ procesados: number; activados: number }> => {
  let procesados = 0, activados = 0;
  try {
    // Primer envío PAGADO real, en cualquier fuente de pago:
    //  - pobox_payments (POBOX/US, donde vive el monto real), excluyendo guías 'USK-%'.
    //  - packages con costo propio (AIR/otros), excluyendo 'USK-%'.
    const cand = await pool.query(
      `SELECT r.referido_id, cand.monto, cand.orden_id
         FROM referidos r
         JOIN users u ON u.id = r.referido_id
         JOIN LATERAL (
           SELECT s.amount AS monto, s.orden_id, s.ts FROM (
             SELECT pp.amount::numeric AS amount, pp.id AS orden_id, pp.paid_at AS ts
               FROM pobox_payments pp
              WHERE pp.user_id = r.referido_id AND pp.status = 'paid' AND pp.amount::numeric > 0
                AND NOT EXISTS (
                  SELECT 1 FROM packages pk
                   WHERE pk.tracking_internal LIKE 'USK-%'
                     AND pk.id IN (SELECT (jsonb_array_elements_text(pp.package_ids))::int)
                )
             UNION ALL
             SELECT pk.assigned_cost_mxn::numeric, pk.id, pk.created_at
               FROM packages pk
              WHERE pk.user_id = r.referido_id AND pk.payment_status = 'paid'
                AND COALESCE(pk.is_master, true) = true
                AND pk.tracking_internal NOT LIKE 'USK-%'
                AND COALESCE(pk.assigned_cost_mxn, 0) > 0
           ) s
           ORDER BY s.ts ASC NULLS LAST
           LIMIT 1
         ) cand ON true
        WHERE r.estado = 'registrado' AND u.first_payment_date IS NULL
        LIMIT 200`
    );
    for (const row of cand.rows) {
      procesados++;
      try {
        const res = await procesarPrimerPago(Number(row.referido_id), Number(row.monto), Number(row.orden_id) || 0);
        if (res.bonos_activados) activados++;
      } catch (e) { console.warn('[REFERIDOS] primer envío:', (e as Error).message); }
    }
    if (procesados) console.log(`[REFERIDOS] Cron primer envío: ${procesados} procesados, ${activados} bonos activados`);
  } catch (e) { console.warn('[REFERIDOS] procesarReferidosPrimerEnvio:', (e as Error).message); }
  return { procesados, activados };
};

// ============================================
// OBTENER MIS REFERIDOS
// ============================================

export const getMisReferidos = async (
  usuarioId: number
): Promise<{
  codigo: string;
  estadisticas: {
    total_referidos: number;
    validados: number;
    pendientes: number;
    rechazados: number;
    total_ganado: number;
  };
  referidos: Array<{
    id: number;
    nombre: string;
    estado: string;
    fecha_registro: Date;
    bono_ganado: number;
  }>;
}> => {
  try {
    // Obtener código del usuario
    const codigoRes = await pool.query(
      "SELECT codigo FROM codigos_referido WHERE usuario_id = $1 AND tipo = 'personal'",
      [usuarioId]
    );
    
    const codigo = codigoRes.rows[0]?.codigo || '';
    
    // Obtener estadísticas
    const statsRes = await pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN estado = 'validado' THEN 1 ELSE 0 END) as validados,
         SUM(CASE WHEN estado = 'registrado' OR estado = 'primer_pago' THEN 1 ELSE 0 END) as pendientes,
         SUM(CASE WHEN estado = 'rechazado' THEN 1 ELSE 0 END) as rechazados,
         COALESCE(SUM(CASE WHEN estado = 'validado' THEN bono_referidor ELSE 0 END), 0) as total_ganado
       FROM referidos
       WHERE referidor_id = $1`,
      [usuarioId]
    );
    
    const stats = statsRes.rows[0];
    
    // Obtener lista de referidos
    const referidosRes = await pool.query(
      `SELECT 
         r.id,
         u.full_name as nombre,
         r.estado,
         r.fecha_registro,
         CASE WHEN r.estado = 'validado' THEN r.bono_referidor ELSE 0 END as bono_ganado
       FROM referidos r
       JOIN users u ON r.referido_id = u.id
       WHERE r.referidor_id = $1
       ORDER BY r.fecha_registro DESC
       LIMIT 50`,
      [usuarioId]
    );
    
    return {
      codigo,
      estadisticas: {
        total_referidos: parseInt(stats.total) || 0,
        validados: parseInt(stats.validados) || 0,
        pendientes: parseInt(stats.pendientes) || 0,
        rechazados: parseInt(stats.rechazados) || 0,
        total_ganado: parseFloat(stats.total_ganado) || 0,
      },
      referidos: referidosRes.rows.map(r => ({
        ...r,
        bono_ganado: parseFloat(r.bono_ganado) || 0,
      })),
    };
  } catch (error) {
    console.error('Error obteniendo referidos:', error);
    return {
      codigo: '',
      estadisticas: {
        total_referidos: 0,
        validados: 0,
        pendientes: 0,
        rechazados: 0,
        total_ganado: 0,
      },
      referidos: [],
    };
  }
};

// ============================================
// OBTENER MI REFERIDOR
// ============================================

export const getMiReferidor = async (
  usuarioId: number
): Promise<{
  tiene_referidor: boolean;
  referidor_nombre?: string;
  estado?: string;
  bono_recibido?: number;
} | null> => {
  try {
    const result = await pool.query(
      `SELECT 
         r.*,
         u.full_name as referidor_nombre
       FROM referidos r
       JOIN users u ON r.referidor_id = u.id
       WHERE r.referido_id = $1`,
      [usuarioId]
    );
    
    if (result.rows.length === 0) {
      return { tiene_referidor: false };
    }
    
    const ref = result.rows[0];
    
    return {
      tiene_referidor: true,
      referidor_nombre: ref.referidor_nombre,
      estado: ref.estado,
      bono_recibido: ref.estado === 'validado' ? parseFloat(ref.bono_referido) : 0,
    };
  } catch (error) {
    console.error('Error obteniendo referidor:', error);
    return null;
  }
};

export default {
  getReferralSettings,
  getAntifraudSettings,
  generateReferralCode,
  validateReferralCode,
  registrarReferido,
  runAntifraudChecks,
  procesarPrimerPago,
  getMisReferidos,
  getMiReferidor,
};
