import cron from 'node-cron';
import { pool } from './db';
import { syncOrdersFromChina, syncAllActiveTrackings } from './maritimeApiController';
import { blockOverdueAccounts, runCreditCollectionEngine } from './financeController';
import { checkExpiringDocuments, checkUpcomingMaintenance } from './fleetController';

/**
 * CRON JOB: Detección automática de clientes en riesgo
 * Se ejecuta todos los días a las 00:00 hrs
 */
export const startRecoveryCronJob = () => {
  // Ejecutar a las 00:00 todos los días
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 [CRON] Iniciando detección de clientes en riesgo...');
    
    try {
      // 1. DETECTOR DE 90 DÍAS (Alerta Amarilla)
      // Busca clientes cuya última transacción fue hace exactamente 90 días
      const alertResult = await pool.query(`
        UPDATE users 
        SET 
          recovery_status = 'in_recovery',
          recovery_deadline = NOW() + INTERVAL '15 days'
        WHERE role = 'client'
          AND recovery_status = 'active'
          AND last_transaction_date IS NOT NULL
          AND last_transaction_date::date = (CURRENT_DATE - INTERVAL '90 days')::date
          AND (recovery_deadline IS NULL OR recovery_deadline < NOW())
        RETURNING id, full_name, email, referred_by_id
      `);

      if (alertResult.rows.length > 0) {
        console.log(`⚠️ [CRON] ${alertResult.rows.length} clientes entraron en zona de recuperación`);
        
        // Aquí podrías enviar notificaciones a los asesores
        for (const client of alertResult.rows) {
          if (client.referred_by_id) {
            // Crear notificación para el asesor
            await pool.query(`
              INSERT INTO notifications (user_id, title, message, type, icon, data)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              client.referred_by_id,
              '⚠️ Cliente en Recuperación',
              `Tu cliente ${client.full_name} entró en zona de recuperación. Tienes 15 días para contactarlo.`,
              'warning',
              'alert-triangle',
              JSON.stringify({ clientId: client.id, clientName: client.full_name })
            ]);
          }
        }
      }

      // 2. DETECTOR DE 105 DÍAS (Castigo)
      // Clientes en recuperación que pasaron los 15 días sin venta
      const punishResult = await pool.query(`
        UPDATE users 
        SET 
          recovery_status = 'churned',
          referred_by_id = NULL
        WHERE role = 'client'
          AND recovery_status = 'in_recovery'
          AND recovery_deadline < NOW()
        RETURNING id, full_name, email
      `);

      if (punishResult.rows.length > 0) {
        console.log(`🔴 [CRON] ${punishResult.rows.length} clientes pasaron a CHURNED (se quitó asesor)`);
        
        // Registrar en historial
        for (const client of punishResult.rows) {
          await pool.query(`
            INSERT INTO recovery_history (user_id, action, notes)
            VALUES ($1, $2, $3)
          `, [
            client.id,
            'auto_churned',
            'Cliente perdido automáticamente por sistema - 105 días sin actividad'
          ]);
        }
      }

      // 3. DETECTAR CLIENTES QUE SE RECUPERARON SOLOS
      // Si un cliente en recuperación hizo una venta, activarlo
      const recoveredResult = await pool.query(`
        UPDATE users u
        SET recovery_status = 'active', recovery_deadline = NULL
        WHERE u.role = 'client'
          AND u.recovery_status = 'in_recovery'
          AND EXISTS (
            SELECT 1 FROM packages p 
            WHERE p.user_id = u.id 
            AND p.created_at > u.recovery_deadline - INTERVAL '15 days'
          )
        RETURNING id, full_name
      `);

      if (recoveredResult.rows.length > 0) {
        console.log(`✅ [CRON] ${recoveredResult.rows.length} clientes se recuperaron automáticamente`);
      }

      console.log('✅ [CRON] Detección completada');
      console.log(`   - En recuperación: ${alertResult.rows.length}`);
      console.log(`   - Churned: ${punishResult.rows.length}`);
      console.log(`   - Recuperados: ${recoveredResult.rows.length}`);

    } catch (error) {
      console.error('❌ [CRON] Error en detección de clientes:', error);
    }
  });

  console.log('📅 [CRON] Job de recuperación programado para las 00:00 hrs diariamente');
};

/**
 * CRON JOB: Recordatorio de seguimiento de prospectos
 * Se ejecuta todos los días a las 08:00 hrs
 */
export const startProspectFollowUpCron = () => {
  // Ejecutar a las 08:00 todos los días
  cron.schedule('0 8 * * *', async () => {
    console.log('🔄 [CRON] Verificando seguimientos de prospectos...');
    
    try {
      // Buscar prospectos con seguimiento para hoy
      const result = await pool.query(`
        SELECT 
          p.id,
          p.full_name,
          p.assigned_advisor_id,
          advisor.full_name as advisor_name
        FROM prospects p
        JOIN users advisor ON p.assigned_advisor_id = advisor.id
        WHERE p.follow_up_date::date = CURRENT_DATE
          AND p.status NOT IN ('converted', 'lost')
      `);

      if (result.rows.length > 0) {
        console.log(`📅 [CRON] ${result.rows.length} prospectos requieren seguimiento hoy`);
        
        for (const prospect of result.rows) {
          // Crear notificación para el asesor
          await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, icon, data)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            prospect.assigned_advisor_id,
            '📅 Seguimiento Pendiente',
            `Tienes que contactar al prospecto ${prospect.full_name} hoy.`,
            'info',
            'phone',
            JSON.stringify({ prospectId: prospect.id, prospectName: prospect.full_name })
          ]);
        }
      }

      console.log('✅ [CRON] Verificación de seguimientos completada');

    } catch (error) {
      console.error('❌ [CRON] Error en verificación de seguimientos:', error);
    }
  });

  console.log('📅 [CRON] Job de seguimiento de prospectos programado para las 08:00 hrs diariamente');
};

// ============================================
// CRON JOB: Sincronización de Órdenes Marítimas
// Se ejecuta cada hora para obtener nuevas recepciones
// ============================================
export const startMaritimeOrderSyncCron = () => {
  // Ejecutar cada hora en el minuto 15 (evitar colisiones)
  cron.schedule('15 * * * *', async () => {
    console.log('🚢 [CRON] Iniciando sincronización de órdenes marítimas...');
    
    try {
      const result = await syncOrdersFromChina();
      
      if (result.success) {
        console.log(`✅ [CRON] Sincronización marítimo completada:`);
        console.log(`   - Procesadas: ${result.ordersProcessed}`);
        console.log(`   - Nuevas: ${result.ordersCreated}`);
        console.log(`   - Actualizadas: ${result.ordersUpdated}`);
      } else {
        console.log(`⚠️ [CRON] Sincronización marítimo con errores: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ [CRON] Error en sincronización marítimo:', error);
    }
  });

  console.log('📅 [CRON] Job de sincronización marítimo programado cada hora (:15)');
};

// ============================================
// CRON JOB: Actualización de Tracking Marítimo
// Se ejecuta cada 6 horas para actualizar estados
// ============================================
export const startMaritimeTrackingSyncCron = () => {
  // Ejecutar a las 00:30, 06:30, 12:30, 18:30
  cron.schedule('30 0,6,12,18 * * *', async () => {
    console.log('🔍 [CRON] Iniciando actualización de tracking marítimo...');
    
    try {
      const result = await syncAllActiveTrackings();
      
      if (result.success) {
        console.log(`✅ [CRON] Tracking marítimo actualizado:`);
        console.log(`   - Órdenes actualizadas: ${result.ordersUpdated}`);
        if (result.errors.length > 0) {
          console.log(`   - Errores: ${result.errors.length}`);
        }
      } else {
        console.log(`⚠️ [CRON] Actualización tracking con errores: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ [CRON] Error en actualización de tracking:', error);
    }
  });

  console.log('📅 [CRON] Job de tracking marítimo programado cada 6 horas (:30)');
};

/**
 * CRON JOB: Motor de Cobranza Automática
 * Se ejecuta todos los días a las 08:00 hrs
 * - Aviso preventivo 3 días antes
 * - Aviso día de vencimiento
 * - Bloqueo automático día después
 */
export const startCreditBlockingCron = () => {
  // Ejecutar a las 08:00 todos los días
  cron.schedule('0 8 * * *', async () => {
    console.log('💳 [CRON] Iniciando motor de cobranza automática...');
    
    try {
      await runCreditCollectionEngine();
    } catch (error) {
      console.error('❌ [CRON] Error en motor de cobranza:', error);
    }
  });

  // También ejecutar el bloqueo simple a las 06:00
  cron.schedule('0 6 * * *', async () => {
    console.log('🔒 [CRON] Revisando cuentas con facturas vencidas...');
    
    try {
      await blockOverdueAccounts();
    } catch (error) {
      console.error('❌ [CRON] Error bloqueando cuentas morosas:', error);
    }
  });

  console.log('📅 [CRON] Motor de cobranza programado a las 08:00 hrs');
  console.log('📅 [CRON] Bloqueo de cuentas morosas programado a las 06:00 hrs');
};

/**
 * CRON JOB: Alertas de Flotilla Vehicular
 * Se ejecuta todos los días a las 07:00 hrs
 * - Detecta documentos por vencer (15 días)
 * - Detecta vehículos próximos a servicio (1000km)
 * - Crea alertas automáticas en fleet_alerts
 */
export const startFleetAlertsCron = () => {
  // Ejecutar a las 07:00 todos los días
  cron.schedule('0 7 * * *', async () => {
    console.log('🚛 [CRON] Iniciando revisión de alertas de flotilla...');
    
    try {
      // 1. Verificar documentos por vencer
      const docAlerts = await checkExpiringDocuments();
      console.log(`   📄 Alertas de documentos: ${docAlerts.created} creadas`);
      
      // 2. Verificar mantenimiento próximo
      const maintAlerts = await checkUpcomingMaintenance();
      console.log(`   🔧 Alertas de mantenimiento: ${maintAlerts.created} creadas`);

      // 3. Notificar a administradores si hay alertas críticas
      const criticalAlerts = await pool.query(`
        SELECT COUNT(*) as count FROM fleet_alerts
        WHERE alert_level = 'critical' AND is_resolved = FALSE
      `);
      
      if (parseInt(criticalAlerts.rows[0].count) > 0) {
        // Obtener admins de operaciones
        const admins = await pool.query(`
          SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'branch_manager')
        `);
        
        for (const admin of admins.rows) {
          await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, icon)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
          `, [
            admin.id,
            '🚨 Alertas de Flotilla Críticas',
            `Hay ${criticalAlerts.rows[0].count} alertas críticas de flotilla que requieren atención inmediata.`,
            'error',
            'local-shipping'
          ]);
        }
      }

      console.log('✅ [CRON] Revisión de flotilla completada');

    } catch (error) {
      console.error('❌ [CRON] Error en revisión de flotilla:', error);
    }
  });

  console.log('📅 [CRON] Job de alertas de flotilla programado a las 07:00 hrs');
};

/**
 * Inicializar todos los CRON jobs
 */
export const initCronJobs = () => {
  startRecoveryCronJob();
  startProspectFollowUpCron();
  startMaritimeOrderSyncCron();
  startMaritimeTrackingSyncCron();
  startCreditBlockingCron();
  startFleetAlertsCron();
};

export default initCronJobs;
