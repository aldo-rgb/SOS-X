// ============================================
// COMMISSION SERVICE
// Genera comisiones automáticamente cuando
// una guía/embarque es pagada.
// ============================================

import { pool } from './db';

// ── Esquema: columnas para comisiones "en crédito" (retenidas hasta que el cliente cobre) ──
// awaiting_client_payment = TRUE  → la orden se pagó con crédito y el cliente aún no abona;
//   la comisión NO es pagable al asesor todavía.
// client_collected_amount = cuánto del costo de la guía ya cubrió el cliente vía abonos (FIFO).
let creditHoldSchemaReady: Promise<void> | null = null;
export function ensureCreditHoldSchema(): Promise<void> {
  if (!creditHoldSchemaReady) {
    creditHoldSchemaReady = pool.query(`
      ALTER TABLE advisor_commissions
        ADD COLUMN IF NOT EXISTS awaiting_client_payment BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS client_collected_amount NUMERIC(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS client_paid_at TIMESTAMP
    `).then(() => {}).catch((e) => {
      console.error('[CommissionService] No pude asegurar columnas de crédito:', e);
      creditHoldSchemaReady = null; // permitir reintento
    });
  }
  return creditHoldSchemaReady;
}

// Mapeo de service_type de packages → commission_rates
const SERVICE_TYPE_MAP: Record<string, string> = {
  'POBOX_USA': 'pobox_usa_mx',
  'usa': 'pobox_usa_mx',
  'pobox': 'pobox_usa_mx',
  'AIR_CHN_MX': 'aereo_china_mx',
  'air_china': 'aereo_china_mx',
  'SEA_CHN_MX': 'maritimo_china_mx',
  'sea_china': 'maritimo_china_mx',
  'AA_DHL': 'liberacion_aa_dhl',
  'dhl': 'liberacion_aa_dhl',
  'NACIONAL': 'nacional_mx',
  'nacional': 'nacional_mx',
  'gex_warranty': 'gex_warranty',
};

function mapServiceType(raw: string | null | undefined, shipmentType: string): string {
  if (raw && SERVICE_TYPE_MAP[raw]) return SERVICE_TYPE_MAP[raw];

  // Fallback por tipo de embarque
  switch (shipmentType) {
    case 'MAR': return 'maritimo_china_mx';
    case 'DHL': return 'liberacion_aa_dhl';
    case 'GEX': return 'gex_warranty';
    case 'PKG':
    default:
      return 'pobox_usa_mx'; // Default para paquetes sin service_type
  }
}

/**
 * Genera comisiones para una lista de paquetes que acaban de ser pagados.
 * Usa ON CONFLICT DO NOTHING para evitar duplicados.
 */
export async function generateCommissionsForPackages(
  packageIds: number[],
  opts?: { creditHold?: boolean }
): Promise<void> {
  if (!packageIds || packageIds.length === 0) return;

  try {
    for (const pkgId of packageIds) {
      await generateCommissionForShipment('PKG', pkgId, undefined, opts);
    }
  } catch (error) {
    console.error('[CommissionService] Error generating commissions for packages:', error);
  }
}

/**
 * Genera comisión para un embarque específico.
 * shipmentType: 'PKG' | 'MAR' | 'DHL' | 'GEX'
 */
export async function generateCommissionForShipment(
  shipmentType: 'PKG' | 'MAR' | 'DHL' | 'GEX',
  shipmentId: number,
  overridePaymentAmount?: number,
  opts?: { creditHold?: boolean }
): Promise<void> {
  try {
    await ensureCreditHoldSchema();
    // 1. Obtener datos del embarque según tipo
    let shipmentData: {
      userId: number;
      tracking: string;
      paymentAmount: number;
      serviceType: string | null;
    } | null = null;

    if (shipmentType === 'PKG') {
      // Base de comisión = costo POR GUÍA (igual que el ingreso del reporte).
      // NO usar monto_pagado: en órdenes consolidadas trae el total de la orden
      // (sobre-cuenta) y en otras viene en 0 (no generaría comisión).
      const res = await pool.query(`
        SELECT p.user_id, p.tracking_internal,
               COALESCE(NULLIF(p.assigned_cost_mxn, 0), p.pobox_service_cost, p.monto_pagado, 0) as payment_amount,
               p.service_type
        FROM packages p
        WHERE p.id = $1
          AND (COALESCE(p.saldo_pendiente, 0) <= 0.01 OR p.payment_status = 'paid' OR p.client_paid = true)
      `, [shipmentId]);

      if (res.rows.length > 0) {
        const r = res.rows[0];
        shipmentData = {
          userId: r.user_id,
          tracking: r.tracking_internal || '',
          paymentAmount: overridePaymentAmount || parseFloat(r.payment_amount) || 0,
          serviceType: r.service_type,
        };
      }
    } else if (shipmentType === 'MAR') {
      const res = await pool.query(`
        SELECT mo.user_id, COALESCE(mo.national_tracking, mo.container_number, '') as tracking_number,
               COALESCE(mo.monto_pagado, mo.assigned_cost_mxn, 0) as payment_amount
        FROM maritime_orders mo
        WHERE mo.id = $1
          AND (COALESCE(mo.saldo_pendiente, 0) <= 0.01 OR mo.payment_status = 'paid')
      `, [shipmentId]);

      if (res.rows.length > 0) {
        const r = res.rows[0];
        shipmentData = {
          userId: r.user_id,
          tracking: r.tracking_number || '',
          paymentAmount: overridePaymentAmount || parseFloat(r.payment_amount) || 0,
          serviceType: 'SEA_CHN_MX',
        };
      }
    } else if (shipmentType === 'DHL') {
      const res = await pool.query(`
        SELECT ds.user_id, ds.inbound_tracking as tracking_number,
               COALESCE(ds.monto_pagado, ds.total_cost_mxn, 0) as payment_amount
        FROM dhl_shipments ds
        WHERE ds.id = $1
          AND (COALESCE(ds.saldo_pendiente, 0) <= 0.01 AND COALESCE(ds.monto_pagado, 0) > 0)
      `, [shipmentId]);

      if (res.rows.length > 0) {
        const r = res.rows[0];
        shipmentData = {
          userId: r.user_id,
          tracking: r.tracking_number || '',
          paymentAmount: overridePaymentAmount || parseFloat(r.payment_amount) || 0,
          serviceType: 'AA_DHL',
        };
      }
    } else if (shipmentType === 'GEX') {
      const res = await pool.query(`
        SELECT w.user_id, COALESCE(w.gex_folio, '') as tracking_number,
               COALESCE(w.total_cost_mxn, 0) as payment_amount,
               w.advisor_id, w.advisor_commission
        FROM warranties w
        WHERE w.id = $1 AND w.status = 'active'
      `, [shipmentId]);

      if (res.rows.length > 0) {
        const r = res.rows[0];
        shipmentData = {
          userId: r.user_id,
          tracking: r.tracking_number || '',
          paymentAmount: overridePaymentAmount || parseFloat(r.payment_amount) || 0,
          serviceType: 'gex_warranty',
        };
      }
    }

    if (!shipmentData || shipmentData.paymentAmount <= 0) {
      return; // No hay datos o el monto es 0
    }

    // 2. Buscar el asesor del cliente: asignación moderna (advisor_id) o, si no,
    //    el asesor que lo refirió (referred_by_id).
    const userRes = await pool.query(`
      SELECT u.id, u.full_name, COALESCE(u.advisor_id, u.referred_by_id) AS advisor_id
      FROM users u WHERE u.id = $1
    `, [shipmentData.userId]);

    if (userRes.rows.length === 0 || !userRes.rows[0].advisor_id) {
      return; // Cliente sin asesor asignado
    }

    const clientId = userRes.rows[0].id;
    const clientName = userRes.rows[0].full_name || '';
    const advisorId = userRes.rows[0].advisor_id;

    // 3. Obtener datos del asesor y su líder
    const advisorRes = await pool.query(`
      SELECT u.id, u.full_name, u.referred_by_id,
             COALESCE(l.id, NULL) as leader_id,
             COALESCE(l.full_name, NULL) as leader_name
      FROM users u
      LEFT JOIN users l ON u.referred_by_id = l.id AND l.role IN ('advisor', 'asesor_lider')
      WHERE u.id = $1
    `, [advisorId]);

    if (advisorRes.rows.length === 0) return;

    const advisor = advisorRes.rows[0];
    const leaderId = advisor.leader_id || null;
    const leaderName = advisor.leader_name || null;

    // 4. Obtener tasa de comisión para este tipo de servicio
    const commissionServiceType = mapServiceType(shipmentData.serviceType, shipmentType);
    const rateRes = await pool.query(`
      SELECT percentage, leader_override, fixed_fee, is_gex
      FROM commission_rates 
      WHERE service_type = $1
    `, [commissionServiceType]);

    if (rateRes.rows.length === 0) {
      console.warn(`[CommissionService] No commission rate found for service_type: ${commissionServiceType}`);
      return;
    }

    const rate = rateRes.rows[0];
    const percentage = parseFloat(rate.percentage) || 0;
    const leaderOverridePct = parseFloat(rate.leader_override) || 0;
    const fixedFee = parseFloat(rate.fixed_fee) || 0;
    const isGex = rate.is_gex || false;

    // 5. Calcular comisiones
    let commissionAmount: number;
    let gexCommission = 0;
    let leaderOverrideAmount = 0;
    let appliedLeaderOverridePct = 0;

    if (isGex) {
      // GEX: fee fijo completo al subasesor, líder recibe $0
      commissionAmount = fixedFee;
      gexCommission = fixedFee;
    } else {
      // Split 50/50 entre subasesor y asesor líder
      const totalCommission = (shipmentData.paymentAmount * percentage) / 100;
      if (leaderId) {
        commissionAmount = totalCommission * 0.5;
        leaderOverrideAmount = totalCommission * 0.5;
        appliedLeaderOverridePct = 50;
      } else {
        commissionAmount = totalCommission;
      }
    }

    // 6. Insertar registro de comisión (ON CONFLICT DO NOTHING para evitar duplicados)
    const creditHold = !!opts?.creditHold;
    await pool.query(`
      INSERT INTO advisor_commissions (
        advisor_id, advisor_name, leader_id, leader_name,
        shipment_type, shipment_id, service_type, tracking,
        client_id, client_name,
        payment_amount_mxn, commission_rate_pct, commission_amount_mxn,
        leader_override_pct, leader_override_amount,
        gex_commission_mxn, status,
        awaiting_client_payment, client_collected_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending', $17, 0)
      ON CONFLICT (advisor_id, shipment_type, shipment_id) DO NOTHING
    `, [
      advisorId, advisor.full_name, leaderId, leaderName,
      shipmentType, shipmentId, commissionServiceType, shipmentData.tracking,
      clientId, clientName,
      shipmentData.paymentAmount, percentage, commissionAmount,
      appliedLeaderOverridePct, leaderOverrideAmount,
      gexCommission, creditHold
    ]);

    console.log(`[CommissionService] ✅ Comisión generada${creditHold ? ' (EN CRÉDITO, retenida)' : ''}: asesor=${advisor.full_name} | tipo=${commissionServiceType} | monto=${shipmentData.paymentAmount} | comisión=$${commissionAmount.toFixed(2)} | shipment=${shipmentType}-${shipmentId}`);

  } catch (error) {
    // No lanzar error para no afectar el flujo de pago
    console.error(`[CommissionService] Error generating commission for ${shipmentType}-${shipmentId}:`, error);
  }
}

/**
 * Genera la comisión GEX de una garantía (usa warranties.advisor_id + advisor_commission,
 * consistente con el Reporte de Ventas). Idempotente.
 */
export async function generateGexCommissionFromWarranty(warrantyId: number): Promise<void> {
  try {
    await ensureCreditHoldSchema();
    const r = await pool.query(`
      INSERT INTO advisor_commissions
        (advisor_id, advisor_name, leader_id, leader_name, shipment_type, shipment_id, service_type, tracking,
         client_id, client_name, payment_amount_mxn, commission_rate_pct, commission_amount_mxn,
         leader_override_pct, leader_override_amount, gex_commission_mxn, status)
      SELECT w.advisor_id, a.full_name, NULL, NULL, 'GEX', w.id, 'gex_warranty', w.gex_folio,
             w.user_id, c.full_name, COALESCE(w.total_cost_mxn,0), 0, COALESCE(w.advisor_commission,0),
             0, 0, COALESCE(w.advisor_commission,0), 'pending'
      FROM warranties w
      JOIN users a ON a.id = w.advisor_id
      LEFT JOIN users c ON c.id = w.user_id
      WHERE w.id = $1 AND w.advisor_id IS NOT NULL AND COALESCE(w.advisor_commission,0) > 0
        AND COALESCE(w.status,'') <> 'rejected'
      ON CONFLICT (advisor_id, shipment_type, shipment_id) DO NOTHING
    `, [warrantyId]);
    if (r.rowCount) console.log(`[CommissionService] ✅ Comisión GEX generada: warranty=${warrantyId}`);
  } catch (e) {
    console.error(`[CommissionService] Error generando comisión GEX warranty=${warrantyId}:`, e);
  }
}

/**
 * Genera la comisión XPAY de una operación Entangled (fórmula del asesor del Reporte:
 * base = monto × TC; asesor% = cliente% − entangled% − entregax%). Idempotente.
 */
export async function generateXpayCommission(eprId: number): Promise<void> {
  try {
    await ensureCreditHoldSchema();
    const r = await pool.query(`
      WITH x AS (
        SELECT epr.id, epr.advisor_id, epr.user_id, epr.referencia_pago,
          (COALESCE(epr.op_monto,0) * COALESCE(epr.tc_cliente_final, epr.tc_aplicado_usd, 0)) AS base_c,
          COALESCE(epr.comision_cliente_final_porcentaje,0) AS ccf,
          COALESCE(epr.comision_cobrada_porcentaje,0) AS cco,
          LEAST(
            COALESCE(NULLIF(epr.comision_entregax,0),
                     (SELECT COALESCE(override_porcentaje_compra,0) FROM entangled_providers WHERE is_active=true AND is_default=true ORDER BY id ASC LIMIT 1), 0),
            GREATEST(0, COALESCE(epr.comision_cliente_final_porcentaje,0) - COALESCE(epr.comision_cobrada_porcentaje,0))
          ) AS pct_egx
        FROM entangled_payment_requests epr
        WHERE epr.id = $1 AND epr.advisor_id IS NOT NULL
          AND epr.estatus_global NOT IN ('cancelado','error_envio','rechazado')
      )
      INSERT INTO advisor_commissions
        (advisor_id, advisor_name, shipment_type, shipment_id, service_type, tracking,
         client_id, client_name, payment_amount_mxn, commission_rate_pct, commission_amount_mxn, status)
      SELECT x.advisor_id, a.full_name, 'XPAY', x.id, 'xpay', x.referencia_pago,
             x.user_id, c.full_name, ROUND(x.base_c,2),
             GREATEST(0, x.ccf - x.cco - x.pct_egx),
             ROUND(x.base_c * GREATEST(0, x.ccf - x.cco - x.pct_egx)/100, 2), 'pending'
      FROM x
      JOIN users a ON a.id = x.advisor_id
      LEFT JOIN users c ON c.id = x.user_id
      WHERE x.base_c * GREATEST(0, x.ccf - x.cco - x.pct_egx)/100 > 0.01
      ON CONFLICT (advisor_id, shipment_type, shipment_id) DO NOTHING
    `, [eprId]);
    if (r.rowCount) console.log(`[CommissionService] ✅ Comisión XPAY generada: epr=${eprId}`);
  } catch (e) {
    console.error(`[CommissionService] Error generando comisión XPAY epr=${eprId}:`, e);
  }
}

/**
 * Libera comisiones "en crédito" de un cliente conforme abona su línea de crédito.
 *
 * Regla (acordada con el usuario): liberación POR ORDEN COMPLETA, FIFO.
 * El abono se aplica a las guías en crédito de la más antigua a la más nueva;
 * la comisión de una guía se libera SOLO cuando esa guía queda totalmente cobrada
 * (client_collected_amount >= payment_amount_mxn). Abonos parciales se acumulan
 * sin liberar hasta cubrir la guía. Pagó más → libera más guías; pagó menos → menos.
 *
 * `db` puede ser el pool o un cliente de transacción (para correr dentro del abono).
 * Devuelve el total de comisión liberada (MXN) y cuántas guías se liberaron.
 */
export async function releaseCreditHeldCommissions(
  db: { query: (text: string, params?: any[]) => Promise<any> },
  userId: number,
  amount: number
): Promise<{ releasedAmount: number; releasedCount: number }> {
  await ensureCreditHoldSchema();
  let releasedAmount = 0;
  let releasedCount = 0;
  if (!userId || !amount || amount <= 0) return { releasedAmount, releasedCount };

  try {
    const rows = await db.query(`
      SELECT id, payment_amount_mxn, client_collected_amount, commission_amount_mxn
      FROM advisor_commissions
      WHERE client_id = $1 AND awaiting_client_payment = TRUE
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `, [userId]);

    let remaining = amount;
    for (const r of rows.rows) {
      if (remaining <= 0.01) break;
      const base = parseFloat(r.payment_amount_mxn) || 0;
      const collected = parseFloat(r.client_collected_amount) || 0;
      const pending = Math.max(0, base - collected);

      // Guía ya cubierta pero aún marcada como retenida → liberar sin consumir abono.
      if (pending <= 0.01) {
        await db.query(
          `UPDATE advisor_commissions
             SET awaiting_client_payment = FALSE, client_paid_at = NOW()
           WHERE id = $1`, [r.id]
        );
        releasedAmount += parseFloat(r.commission_amount_mxn) || 0;
        releasedCount++;
        continue;
      }

      const toApply = Math.min(remaining, pending);
      const newCollected = collected + toApply;

      if (newCollected >= base - 0.01) {
        // Guía totalmente cobrada → liberar comisión.
        await db.query(
          `UPDATE advisor_commissions
             SET client_collected_amount = $2,
                 awaiting_client_payment = FALSE,
                 client_paid_at = NOW()
           WHERE id = $1`, [r.id, base]
        );
        releasedAmount += parseFloat(r.commission_amount_mxn) || 0;
        releasedCount++;
      } else {
        // Cobro parcial: acumular, sin liberar todavía (regla por orden completa).
        await db.query(
          `UPDATE advisor_commissions SET client_collected_amount = $2 WHERE id = $1`,
          [r.id, newCollected]
        );
      }
      remaining -= toApply;
    }

    if (releasedCount > 0) {
      console.log(`[CommissionService] 💧 Liberadas ${releasedCount} comisión(es) en crédito del cliente ${userId} por abono de $${amount.toFixed(2)} → $${releasedAmount.toFixed(2)} ahora pagables.`);
    }
  } catch (error) {
    console.error(`[CommissionService] Error liberando comisiones en crédito (cliente ${userId}):`, error);
  }

  return { releasedAmount, releasedCount };
}

/**
 * Función de backfill: Busca paquetes pagados que aún no tienen comisión generada
 * y genera las comisiones faltantes. Útil para migración inicial.
 */
export async function backfillCommissions(limitRows = 500): Promise<{ generated: number; skipped: number }> {
  let generated = 0;
  let skipped = 0;

  try {
    // Paquetes pagados de clientes con asesor, sin comisión existente
    const paidPackages = await pool.query(`
      SELECT p.id
      FROM packages p
      JOIN users u ON p.user_id = u.id
      WHERE COALESCE(u.advisor_id, u.referred_by_id) IS NOT NULL
        AND u.role = 'client'
        AND (COALESCE(p.saldo_pendiente, 0) <= 0.01 OR p.payment_status = 'paid' OR p.client_paid = true)
        AND COALESCE(NULLIF(p.assigned_cost_mxn, 0), p.pobox_service_cost, p.monto_pagado, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM advisor_commissions ac 
          WHERE ac.shipment_type = 'PKG' AND ac.shipment_id = p.id
        )
      ORDER BY p.id DESC
      LIMIT $1
    `, [limitRows]);

    console.log(`[CommissionService] Backfill: ${paidPackages.rows.length} paquetes pagados sin comisión`);

    for (const row of paidPackages.rows) {
      await generateCommissionForShipment('PKG', row.id);
      generated++;
    }

    // Maritime orders pagadas
    const paidMaritime = await pool.query(`
      SELECT mo.id
      FROM maritime_orders mo
      JOIN users u ON mo.user_id = u.id
      WHERE COALESCE(u.advisor_id, u.referred_by_id) IS NOT NULL
        AND u.role = 'client'
        AND (COALESCE(mo.saldo_pendiente, 0) <= 0.01 OR mo.payment_status = 'paid')
        AND COALESCE(mo.monto_pagado, mo.assigned_cost_mxn, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM advisor_commissions ac 
          WHERE ac.shipment_type = 'MAR' AND ac.shipment_id = mo.id
        )
      ORDER BY mo.id DESC
      LIMIT $1
    `, [limitRows]);

    console.log(`[CommissionService] Backfill: ${paidMaritime.rows.length} órdenes marítimas sin comisión`);

    for (const row of paidMaritime.rows) {
      await generateCommissionForShipment('MAR', row.id);
      generated++;
    }

    // DHL shipments pagados
    const paidDHL = await pool.query(`
      SELECT ds.id
      FROM dhl_shipments ds
      JOIN users u ON ds.user_id = u.id
      WHERE COALESCE(u.advisor_id, u.referred_by_id) IS NOT NULL
        AND u.role = 'client'
        AND COALESCE(ds.saldo_pendiente, 0) <= 0.01
        AND COALESCE(ds.monto_pagado, ds.total_cost_mxn, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM advisor_commissions ac 
          WHERE ac.shipment_type = 'DHL' AND ac.shipment_id = ds.id
        )
      ORDER BY ds.id DESC
      LIMIT $1
    `, [limitRows]);

    console.log(`[CommissionService] Backfill: ${paidDHL.rows.length} envíos DHL sin comisión`);

    for (const row of paidDHL.rows) {
      await generateCommissionForShipment('DHL', row.id);
      generated++;
    }

    console.log(`[CommissionService] Backfill completado: ${generated} generadas, ${skipped} omitidas`);
  } catch (error) {
    console.error('[CommissionService] Error in backfill:', error);
  }

  return { generated, skipped };
}
