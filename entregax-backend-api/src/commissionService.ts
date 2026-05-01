// ============================================
// COMMISSION SERVICE
// Genera comisiones automáticamente cuando
// una guía/embarque es pagada.
// ============================================

import { pool } from './db';

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
export async function generateCommissionsForPackages(packageIds: number[]): Promise<void> {
  if (!packageIds || packageIds.length === 0) return;

  try {
    for (const pkgId of packageIds) {
      await generateCommissionForShipment('PKG', pkgId);
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
  overridePaymentAmount?: number
): Promise<void> {
  try {
    // 1. Obtener datos del embarque según tipo
    let shipmentData: {
      userId: number;
      tracking: string;
      paymentAmount: number;
      serviceType: string | null;
    } | null = null;

    if (shipmentType === 'PKG') {
      const res = await pool.query(`
        SELECT p.user_id, p.tracking_internal, 
               COALESCE(p.monto_pagado, p.assigned_cost_mxn, 0) as payment_amount,
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

    // 2. Buscar el asesor que refirió al cliente
    const userRes = await pool.query(`
      SELECT u.id, u.full_name, u.referred_by_id 
      FROM users u WHERE u.id = $1
    `, [shipmentData.userId]);

    if (userRes.rows.length === 0 || !userRes.rows[0].referred_by_id) {
      return; // Cliente no tiene asesor referidor
    }

    const clientId = userRes.rows[0].id;
    const clientName = userRes.rows[0].full_name || '';
    const advisorId = userRes.rows[0].referred_by_id;

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
    await pool.query(`
      INSERT INTO advisor_commissions (
        advisor_id, advisor_name, leader_id, leader_name,
        shipment_type, shipment_id, service_type, tracking,
        client_id, client_name,
        payment_amount_mxn, commission_rate_pct, commission_amount_mxn,
        leader_override_pct, leader_override_amount,
        gex_commission_mxn, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending')
      ON CONFLICT (advisor_id, shipment_type, shipment_id) DO NOTHING
    `, [
      advisorId, advisor.full_name, leaderId, leaderName,
      shipmentType, shipmentId, commissionServiceType, shipmentData.tracking,
      clientId, clientName,
      shipmentData.paymentAmount, percentage, commissionAmount,
      appliedLeaderOverridePct, leaderOverrideAmount,
      gexCommission
    ]);

    console.log(`[CommissionService] ✅ Comisión generada: asesor=${advisor.full_name} | tipo=${commissionServiceType} | monto=${shipmentData.paymentAmount} | comisión=$${commissionAmount.toFixed(2)} | shipment=${shipmentType}-${shipmentId}`);

  } catch (error) {
    // No lanzar error para no afectar el flujo de pago
    console.error(`[CommissionService] Error generating commission for ${shipmentType}-${shipmentId}:`, error);
  }
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
      WHERE u.referred_by_id IS NOT NULL
        AND u.role = 'client'
        AND (COALESCE(p.saldo_pendiente, 0) <= 0.01 OR p.payment_status = 'paid' OR p.client_paid = true)
        AND COALESCE(p.monto_pagado, p.assigned_cost_mxn, 0) > 0
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
      WHERE u.referred_by_id IS NOT NULL
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
      WHERE u.referred_by_id IS NOT NULL
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
