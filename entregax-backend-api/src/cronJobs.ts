import cron from 'node-cron';
import { pool } from './db';
import { syncOrdersFromChina, syncAllActiveTrackings, backfillPackingLists } from './maritimeApiController';
import { blockOverdueAccounts, runCreditCollectionEngine } from './financeController';
import { checkExpiringDocuments, checkUpcomingMaintenance } from './fleetController';
import { actualizarCarteraVencida, sincronizarCartera } from './customerServiceController';
import { syncActiveMJCustomerOrders } from './chinaController';
import { runFacturapiSyncAll } from './facturapiController';
import { runMJCustomerFclSync } from './mjcustomerFclSync';
import { runDatabaseBackup } from './dbBackupService';

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
      // Rellenar/actualizar PLs de órdenes VIEJAS (el chino puede subir o cambiar el
      // PL días después; la sync de 24h no las alcanza). Solo toca provider_packing_list_url.
      try {
        const pl = await backfillPackingLists(90);
        if (pl.updated > 0) console.log(`🧾 [CRON] Packing Lists actualizados: ${pl.updated} (de ${pl.scanned} con PL en el API)`);
      } catch (e) { console.error('❌ [CRON] Error en backfill de PLs:', e); }
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

      // 3. Notificar a administradores si hay alertas críticas — SOLO los LUNES
      //    (antes se enviaba a diario y saturaba la campana). La generación de
      //    alertas de arriba sí corre diario para mantener fleet_alerts al día.
      const isMonday = await pool.query(
        `SELECT EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'America/Mexico_City')) = 1 AS es_lunes`
      );
      if (isMonday.rows[0]?.es_lunes) {
        const dedupTitle = '🚨 Alertas de Flotilla Críticas';
        const notifyOnce = async (userId: number, message: string) => {
          const dup = await pool.query(
            `SELECT 1 FROM notifications
              WHERE user_id = $1 AND title = $2
                AND created_at::date = (NOW() AT TIME ZONE 'America/Mexico_City')::date
              LIMIT 1`,
            [userId, dedupTitle]
          );
          if (dup.rows.length > 0) return;
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, icon)
             VALUES ($1, $2, $3, 'error', 'local-shipping') ON CONFLICT DO NOTHING`,
            [userId, dedupTitle, message]
          );
        };

        // (a) Resumen GLOBAL solo para roles de oficina central (HQ).
        const globalCritical = await pool.query(`
          SELECT COUNT(*)::int as count FROM fleet_alerts
          WHERE alert_level = 'critical' AND is_resolved = FALSE
        `);
        if (globalCritical.rows[0].count > 0) {
          const hq = await pool.query(`
            SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'director', 'accountant', 'customer_service')
              AND COALESCE(is_active, true) = true
          `);
          for (const u of hq.rows) {
            await notifyOnce(u.id, `Hay ${globalCritical.rows[0].count} alertas críticas de flotilla que requieren atención inmediata.`);
          }
        }

        // (b) Por SUCURSAL: gerentes/operaciones solo reciben alertas de las
        //     UNIDADES ASIGNADAS a SU sucursal (no de toda la flotilla).
        const byBranch = await pool.query(`
          SELECT v.branch_id, COUNT(*)::int as count
            FROM fleet_alerts fa
            JOIN vehicles v ON v.id = fa.vehicle_id
           WHERE fa.alert_level = 'critical' AND fa.is_resolved = FALSE
             AND v.branch_id IS NOT NULL
           GROUP BY v.branch_id
        `);
        for (const row of byBranch.rows) {
          const branchUsers = await pool.query(`
            SELECT id FROM users
             WHERE branch_id = $1
               AND role IN ('branch_manager', 'operaciones', 'Operaciones')
               AND COALESCE(is_active, true) = true
          `, [row.branch_id]);
          for (const u of branchUsers.rows) {
            await notifyOnce(u.id, `Tu sucursal tiene ${row.count} alerta(s) crítica(s) de flotilla en tus unidades asignadas.`);
          }
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
 * CRON JOB: Bloqueo de Repartidores con Licencia Vencida
 * Se ejecuta cada lunes a las 06:00 hrs (semanal es suficiente para 10 choferes)
 */
export const startDriverLicenseCheckCron = () => {
  // Ejecutar cada lunes a las 06:00
  cron.schedule('0 6 * * 1', async () => {
    console.log('🪪 [CRON] Verificando licencias de conducir vencidas...');
    
    try {
      // Bloquear repartidores con licencia vencida
      const blockResult = await pool.query(`
        UPDATE users 
        SET 
          is_blocked = TRUE,
          block_reason = 'Licencia de conducir vencida',
          blocked_at = NOW()
        WHERE role = 'repartidor'
          AND driver_license_expiry IS NOT NULL
          AND driver_license_expiry < CURRENT_DATE
          AND (is_blocked = FALSE OR is_blocked IS NULL)
        RETURNING id, full_name, email, driver_license_expiry
      `);

      if (blockResult.rows.length > 0) {
        console.log(`🚫 [CRON] ${blockResult.rows.length} repartidores bloqueados por licencia vencida:`);
        
        for (const driver of blockResult.rows) {
          console.log(`   - ${driver.full_name} (venció: ${driver.driver_license_expiry})`);
          
          // Notificar al repartidor
          await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, icon, data)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            driver.id,
            '⚠️ Cuenta Bloqueada - Licencia Vencida',
            'Tu cuenta ha sido bloqueada porque tu licencia de conducir está vencida. Actualiza tu licencia para reactivar tu cuenta.',
            'error',
            'id-card',
            JSON.stringify({ action: 'license_renewal', type: 'license_expired' }),
          ]);
          
          // Notificar solo a admins de la misma sucursal del repartidor (+ super_admin global)
          const admins = await pool.query(`
            SELECT u.id FROM users u
            WHERE u.role IN ('super_admin', 'admin')
            UNION
            SELECT u.id FROM users u
            WHERE u.role IN ('branch_manager', 'operaciones', 'Operaciones')
              AND u.branch_id = (SELECT branch_id FROM users WHERE id = $1)
              AND u.branch_id IS NOT NULL
          `, [driver.id]);

          for (const admin of admins.rows) {
            await pool.query(`
              INSERT INTO notifications (user_id, title, message, type, icon, data)
              VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              admin.id,
              '🪪 Repartidor Bloqueado',
              `El repartidor ${driver.full_name} ha sido bloqueado por licencia de conducir vencida.`,
              'warning',
              'local-shipping',
              JSON.stringify({ driverId: driver.id, driverName: driver.full_name })
            ]);
          }
        }
      }

      // Alertar repartidores cuya licencia vencerá en 90 días (notificación semanal)
      const warningResult = await pool.query(`
        SELECT id, full_name, driver_license_expiry
        FROM users
        WHERE role = 'repartidor'
          AND driver_license_expiry IS NOT NULL
          AND driver_license_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
          AND (is_blocked = FALSE OR is_blocked IS NULL)
      `);

      if (warningResult.rows.length > 0) {
        console.log(`⚠️ [CRON] ${warningResult.rows.length} repartidores con licencia por vencer en 90 días`);

        for (const driver of warningResult.rows) {
          const daysLeft = Math.ceil((new Date(driver.driver_license_expiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

          await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, icon, data)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            driver.id,
            '⚠️ Licencia por Vencer',
            `Tu licencia de conducir vencerá en ${daysLeft} días. Actualízala ahora para evitar que tu cuenta sea bloqueada.`,
            'warning',
            'id-card',
            JSON.stringify({ action: 'license_renewal', type: 'license_expiring', daysLeft }),
          ]);
        }
      }

      console.log('✅ [CRON] Verificación de licencias completada');
      console.log(`   - Bloqueados: ${blockResult.rows.length}`);
      console.log(`   - Por vencer: ${warningResult.rows.length}`);

    } catch (error) {
      console.error('❌ [CRON] Error en verificación de licencias:', error);
    }
  });

  console.log('📅 [CRON] Job de verificación de licencias programado cada lunes a las 06:00 hrs');
};

/**
 * CRON JOB: Verificación de tipo de cambio
 * Se ejecuta cada hora para actualizar tipo de cambio y verificar alertas
 */
export const startExchangeRateCheckCron = () => {
  // Ejecutar 3 veces al día: 8:00, 14:00 y 20:00
  cron.schedule('0 8,14,20 * * *', async () => {
    console.log('💱 [CRON] Verificando estado de tipo de cambio...');
    
    try {
      const { fetchExchangeRateWithFallback } = await import('./exchangeRateController');
      
      // Intentar obtener tipo de cambio (esto actualiza el sistema automáticamente)
      const result = await fetchExchangeRateWithFallback();
      
      console.log(`💱 [CRON] TC obtenido: $${result.rate.toFixed(4)} (Fuente: ${result.source})`);
      
      // Si estamos usando fallback, verificar tiempo sin conexión
      if (result.source === 'fallback') {
        const statusResult = await pool.query(`
          SELECT 
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ultima_actualizacion_exitosa)) / 3600 as horas_sin_api,
            alerta_activa
          FROM exchange_rate_system_status 
          LIMIT 1
        `);

        if (statusResult.rows.length > 0) {
          const { horas_sin_api, alerta_activa } = statusResult.rows[0];
          const horas = parseFloat(horas_sin_api) || 0;
          
          if (horas >= 12 && !alerta_activa) {
            console.warn(`🚨 [CRON] ALERTA: ${horas.toFixed(1)} horas sin conexión a API de tipo de cambio`);
            
            // Crear alerta
            await pool.query(`
              INSERT INTO exchange_rate_alerts (tipo, mensaje, horas_desconectado)
              VALUES ('alerta_12h', $1, $2)
            `, [
              `APIs de tipo de cambio desconectadas por ${Math.floor(horas)} horas`,
              Math.floor(horas)
            ]);

            // Marcar alerta activa
            await pool.query('UPDATE exchange_rate_system_status SET alerta_activa = TRUE');

            // Notificar a administradores y directores
            const admins = await pool.query(`
              SELECT id FROM users 
              WHERE role IN ('super_admin', 'admin', 'director') 
              AND estado = TRUE
            `);

            for (const admin of admins.rows) {
              await pool.query(`
                INSERT INTO notifications (user_id, title, message, type, icon, action_url)
                VALUES ($1, $2, $3, 'warning', 'alert-circle', '/admin/exchange-rates')
              `, [
                admin.id,
                '🚨 Alerta de Tipo de Cambio',
                `El sistema lleva ${Math.floor(horas)} horas sin conexión a las APIs de tipo de cambio. Se está usando el último valor conocido ($${result.rate.toFixed(2)}).`
              ]);
            }

            console.log(`📧 [CRON] Notificaciones enviadas a ${admins.rows.length} administradores`);
          }
        }
      } else {
        // API conectada, actualizar todos los tipos de cambio
        const configs = await pool.query(
          'SELECT id, sobreprecio, sobreprecio_porcentaje FROM exchange_rate_config WHERE usar_api = TRUE'
        );

        for (const config of configs.rows) {
          let tcFinal = result.rate;
          if (config.sobreprecio) tcFinal += parseFloat(config.sobreprecio);
          if (config.sobreprecio_porcentaje) tcFinal += result.rate * (parseFloat(config.sobreprecio_porcentaje) / 100);

          await pool.query(`
            UPDATE exchange_rate_config
            SET tipo_cambio_final = $1,
                ultimo_tc_api = $2,
                ultima_conexion_api = CURRENT_TIMESTAMP,
                ultima_actualizacion = CURRENT_TIMESTAMP,
                api_activa = TRUE,
                horas_sin_api = 0
            WHERE id = $3
          `, [tcFinal, result.rate, config.id]);
        }

        console.log(`💱 [CRON] ${configs.rows.length} servicios actualizados con TC desde API`);
      }

    } catch (error) {
      console.error('❌ [CRON] Error en verificación de tipo de cambio:', error);
    }
  });

  console.log('📅 [CRON] Job de tipo de cambio programado 3x/día: 08:00, 14:00, 20:00');
};

/**
 * CRON JOB: Actualización de Cartera Vencida
 * Se ejecuta todos los días a las 02:00 hrs
 * - Sincroniza guías en CEDIS a tabla de cartera
 * - Actualiza días en almacén
 * - Procesa día 30, 60, 90 automáticamente
 */
export const startCarteraVencidaCron = () => {
  // Ejecutar a las 02:00 todos los días
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 [CRON] Procesando cartera vencida...');
    try {
      await sincronizarCartera();
      await actualizarCarteraVencida();
      console.log('✅ [CRON] Cartera vencida procesada exitosamente');
    } catch (error) {
      console.error('❌ [CRON] Error en cartera vencida:', error);
    }
  });

  console.log('📅 [CRON] Job de cartera vencida programado para las 02:00 hrs diariamente');
};

/**
 * CRON JOB: Sincronización con MJCustomer (China Aéreo)
 * Se ejecuta cada 6 horas
 * - Sincroniza órdenes activas de los últimos 30 días
 * - Actualiza tracking, ETA, ETD
 */
export const startMJCustomerSyncCron = () => {
  // Ejecutar cada 6 horas (a las 0:00, 6:00, 12:00, 18:00)
  cron.schedule('0 */6 * * *', async () => {
    console.log('🇨🇳 [CRON] Sincronizando con MJCustomer...');
    try {
      const result = await syncActiveMJCustomerOrders();
      if (result.success) {
        console.log(`✅ [CRON] MJCustomer: ${result.ordersUpdated}/${result.ordersProcessed} órdenes actualizadas`);
      } else {
        console.log(`⚠️ [CRON] MJCustomer con errores: ${result.errors.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ [CRON] Error en sincronización MJCustomer:', error);
    }
  });

  console.log('📅 [CRON] Job de MJCustomer (China aéreo) programado cada 6 horas');
};

/**
 * CRON JOB: Sincronización FCL con MJCustomer (pageByClearance)
 * Se ejecuta una vez al día a las 06:00 hora MX.
 * Reemplaza al tracking de Vizion (cancelado).
 */
export const startMJCustomerFclSyncCron = () => {
  // 06:00 todos los días (zona horaria de Ciudad de México)
  cron.schedule('0 6 * * *', async () => {
    console.log('🚢 [CRON] Sincronización FCL MJCustomer iniciando...');
    try {
      const summary = await runMJCustomerFclSync('cron');
      if (summary.success) {
        console.log(
          `✅ [CRON] MJCustomer FCL: ${summary.itemsCreated} nuevos, ${summary.itemsUpdated} actualizados, ${summary.itemsConflict} conflictos (${summary.pagesFetched} páginas, ${summary.durationMs}ms)`
        );
      } else {
        console.error('❌ [CRON] MJCustomer FCL falló:', summary.error);
      }
    } catch (err) {
      console.error('❌ [CRON] Error inesperado en sync MJCustomer FCL:', err);
    }
  }, { timezone: 'America/Mexico_City' });
  console.log('📅 [CRON] Job MJCustomer FCL (clearance) programado diario 06:00');
};

/**
 * CRON JOB: Sincronización con Facturapi (Cuentas por Pagar / CFDIs recibidos)
 * Se ejecuta cada 6 horas. Para cada emisor con Facturapi habilitado, baja
 * las facturas recibidas de los últimos 30 días y las inserta si son nuevas.
 */
export const startFacturapiSyncCron = () => {
  cron.schedule('0 */6 * * *', async () => {
    console.log('🧾 [CRON] Sincronizando Facturapi (CFDIs recibidos)...');
    try {
      const results = await runFacturapiSyncAll({ days: 30, source: 'facturapi_cron' });
      const ok = results.filter(r => r.ok).length;
      const totalInserted = results.reduce((s, r) => s + (r.inserted || 0), 0);
      console.log(`✅ [CRON] Facturapi: ${ok}/${results.length} emisores sincronizados, ${totalInserted} facturas nuevas`);
      const failed = results.filter(r => !r.ok);
      if (failed.length) {
        for (const f of failed) console.warn(`   ⚠️  ${f.alias} (id=${f.emitter_id}): ${f.error}`);
      }
    } catch (error: any) {
      console.error('❌ [CRON] Error en sincronización Facturapi:', error.message);
    }
  });
  console.log('📅 [CRON] Job de Facturapi (CFDIs recibidos) programado cada 6 horas');
};

/**
 * CRON JOB: Auto-checkout de empleados que no marcaron salida.
 * Se ejecuta justo después de medianoche (00:01). Para cualquier
 * attendance_log de días anteriores con check_in_time pero sin
 * check_out_time, marcamos check_out a las 19:00 hrs (7 PM) de ese
 * mismo día. El check_out_address queda con un marcador "AUTO:" para
 * que en reportes se distinga del check-out manual del empleado.
 */
export const startAutoCheckoutCron = () => {
  cron.schedule('1 0 * * *', async () => {
    console.log('⏰ [CRON] Auto-checkout: cerrando jornadas sin salida registrada...');
    try {
      const result = await pool.query(`
        UPDATE attendance_logs
        SET
          check_out_time = (date::timestamp + INTERVAL '19 hours'),
          check_out_address = COALESCE(check_out_address, 'AUTO: Salida no registrada por el empleado')
        WHERE date < CURRENT_DATE
          AND check_in_time IS NOT NULL
          AND check_out_time IS NULL
        RETURNING id, user_id, date
      `);
      if (result.rowCount && result.rowCount > 0) {
        console.log(`✅ [CRON] Auto-checkout aplicado a ${result.rowCount} jornada(s) (7 PM por defecto)`);
      } else {
        console.log('✅ [CRON] Auto-checkout: nada que cerrar');
      }
    } catch (error: any) {
      console.error('❌ [CRON] Error en auto-checkout:', error.message);
    }
  });
  console.log('📅 [CRON] Job de auto-checkout programado: 00:01 diario (cierra jornadas sin salida a las 19:00)');
};

export const startEntangledSyncCron = () => {
  // Sincronizar proveedores Entangled cada hora: actualiza tipo_cambio_usd/rmb y updated_at
  cron.schedule('0 * * * *', async () => {
    console.log('🔄 [CRON] Sincronizando proveedores Entangled...');
    try {
      const { syncEntangledForCron } = await import('./entangledControllerV2');
      const result = await syncEntangledForCron();
      if (result.ok) {
        console.log(`✅ [CRON] Entangled sync: updated=${result.updated}, inserted=${result.inserted}`);
      } else {
        console.warn(`⚠️ [CRON] Entangled sync falló: ${result.error}`);
      }
    } catch (err: any) {
      console.error('❌ [CRON] Error en Entangled sync:', err.message);
    }
  });
};

/**
 * CRON JOB: Sincronizar STATUS de operaciones X-Pay con ENTANGLED cada 10 min.
 * Respaldo porque ENTANGLED no está llamando nuestros webhooks (factura.generada /
 * pago.proveedor): consulta el estado real de cada operación en proceso y
 * actualiza estatus_factura ('pendiente'→'emitida'), estatus_proveedor,
 * documentos y estatus_global. Así el status se confirma sin depender del webhook.
 */
export const startXpayStatusSyncCron = () => {
  cron.schedule('*/10 * * * *', async () => {
    try {
      const { syncPendingEntangledOperations } = await import('./entangledControllerV2');
      const r = await syncPendingEntangledOperations();
      if (r.updated > 0) console.log(`🔄 [CRON] X-Pay status sync: ${r.updated}/${r.checked} actualizadas`);
    } catch (err: any) {
      console.error('❌ [CRON] Error en X-Pay status sync:', err.message);
    }
  });
};

/**
 * CRON JOB: Auto-cancelación X-Pay por congelamiento vencido.
 * Cada 15 min cancela las órdenes que pasaron su payment_deadline_at SIN que el
 * cliente haya subido su comprobante (la ventana de TC de NUESTRO lado venció).
 * El congelamiento es sobre el PAGO del cliente: si ya subió comprobante
 * (comprobante_subido_at IS NOT NULL) significa que pagó dentro de la ventana,
 * así que NO se cancela aunque ENTANGLED todavía no procese — quedaría a la
 * espera. ENTANGLED cancela por su lado y, si llega, el webhook orden.cancelada
 * lo confirma.
 */
export const startXpayExpiryCron = () => {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const r = await pool.query(
        `UPDATE entangled_payment_requests
            SET estatus_global = 'cancelado',
                error_message = 'congelamiento_vencido',
                updated_at = NOW()
          WHERE estatus_global IN ('pendiente', 'esperando_comprobante')
            AND payment_deadline_at IS NOT NULL
            AND payment_deadline_at < NOW()
            AND comprobante_subido_at IS NULL
          RETURNING id`
      );
      if (r.rowCount && r.rowCount > 0) {
        console.log(`⏳ [CRON] X-Pay: ${r.rowCount} órdenes canceladas por congelamiento vencido`);
        // Fire-and-forget: avisar a ENTANGLED de cada una.
        try {
          const { notifyCancelledRequestIds } = await import('./entangledServiceV2');
          void notifyCancelledRequestIds(r.rows.map((row) => row.id), 'congelamiento_vencido');
        } catch (nErr) {
          console.warn('[CRON] X-Pay notifyCancelled fallback:', (nErr as Error).message);
        }
      }
    } catch (err: any) {
      console.error('❌ [CRON] X-Pay expiry:', err.message);
    }
  });
  console.log('📅 [CRON] X-Pay auto-cancelación por vencimiento: cada 15 min');
};

export const startDatabaseBackupCron = () => {
  // Todos los días a las 02:00 AM UTC
  cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Iniciando backup diario de base de datos...');
    try {
      await runDatabaseBackup();
    } catch (error: any) {
      console.error('[CRON] Error en backup de DB:', error.message);
    }
  });
  console.log('📅 [CRON] Backup diario de DB programado: 02:00 UTC');
};

/**
 * CRON JOB: Auto-sync diferido de Syncfy + Auto-extract+conciliación
 *
 * Flujo en 2 fases (corre cada 2 minutos):
 *   FASE 1 — Sync: cuando next_auto_sync_at <= NOW(), descarga movimientos
 *            del banco con syncEmitter(). Al terminar programa la fase 2
 *            seteando next_auto_extract_at = NOW() + 5min y limpia
 *            next_auto_sync_at. Esto soporta el flujo "reconectar banco
 *            con 2FA": al terminar el widget se programa el sync 10 min
 *            después (Syncfy necesita ese tiempo para correr el primer
 *            fetch_jobs antes de que haya movimientos disponibles).
 *
 *   FASE 2 — Extract: cuando next_auto_extract_at <= NOW(), corre
 *            autoAuthorizeAndNotifyAfterSync() que (a) auto-autoriza las
 *            órdenes matched, (b) notifica al cliente y a su asesor, y
 *            (c) envía notificación masiva "Estado de cuenta actualizado"
 *            a asesores, directores, admins y super_admin.
 */
export const startSyncfyAutoSyncCron = () => {
  cron.schedule('*/2 * * * *', async () => {
    // Asegurar columnas (idempotente). En primera ejecución crea
    // next_auto_extract_at si no existe.
    try {
      await pool.query(`ALTER TABLE syncfy_credentials ADD COLUMN IF NOT EXISTS next_auto_sync_at TIMESTAMP`);
      await pool.query(`ALTER TABLE syncfy_credentials ADD COLUMN IF NOT EXISTS next_auto_extract_at TIMESTAMP`);
      await pool.query(`ALTER TABLE syncfy_credentials ADD COLUMN IF NOT EXISTS last_sync_summary JSONB`);
    } catch { /* ignore */ }

    // ── FASE 1: SYNC ────────────────────────────────────────────────
    try {
      const due = await pool.query(`
        SELECT DISTINCT emitter_id
        FROM syncfy_credentials
        WHERE next_auto_sync_at IS NOT NULL
          AND next_auto_sync_at <= NOW()
          AND is_active = TRUE
      `);
      if (due.rows.length > 0) {
        console.log(`⏰ [Syncfy auto-sync FASE 1 SYNC] ${due.rows.length} emisor(es) listo(s)`);
        const { syncEmitter } = await import('./syncfyService');
        for (const row of due.rows) {
          const emitterId = row.emitter_id;
          let summary: any = null;
          try {
            summary = await syncEmitter(Number(emitterId), 30);
            console.log(`   ✅ sync emitter ${emitterId}: new=${summary.new_count} dup=${summary.duplicate_count} matched=${summary.matched_count}`);
          } catch (e: any) {
            console.warn(`   ⚠️ sync emitter ${emitterId}: ${e.message}`);
          } finally {
            // Limpiar sync flag y programar FASE 2 (extract) en +5 minutos.
            await pool.query(
              `UPDATE syncfy_credentials
                  SET next_auto_sync_at = NULL,
                      next_auto_extract_at = NOW() + INTERVAL '5 minutes',
                      last_sync_summary = $2::jsonb,
                      updated_at = NOW()
                WHERE emitter_id = $1 AND next_auto_sync_at IS NOT NULL`,
              [emitterId, summary ? JSON.stringify(summary) : null]
            );
            console.log(`   ⏳ FASE 2 EXTRACT programada en 5 min para emitter ${emitterId}`);
          }
        }
      }
    } catch (err: any) {
      console.error('[CRON] Syncfy FASE 1 SYNC error:', err.message);
    }

    // ── FASE 2: EXTRACT + AUTO-AUTORIZAR + NOTIFICAR ────────────────
    try {
      const dueExtract = await pool.query(`
        SELECT DISTINCT emitter_id, last_sync_summary
        FROM syncfy_credentials
        WHERE next_auto_extract_at IS NOT NULL
          AND next_auto_extract_at <= NOW()
          AND is_active = TRUE
      `);
      if (dueExtract.rows.length > 0) {
        console.log(`⏰ [Syncfy auto-sync FASE 2 EXTRACT] ${dueExtract.rows.length} emisor(es) listo(s)`);
        const { autoAuthorizeAndNotifyAfterSync } = await import('./bankAutoMatchService');
        for (const row of dueExtract.rows) {
          const emitterId = row.emitter_id;
          const summary = row.last_sync_summary || { new_count: 0, duplicate_count: 0, matched_count: 0 };
          try {
            const result = await autoAuthorizeAndNotifyAfterSync(Number(emitterId), summary);
            console.log(`   ✅ extract emitter ${emitterId}: authorized=${result.authorized} already_paid=${result.already_paid} errors=${result.errors}`);
          } catch (e: any) {
            console.warn(`   ⚠️ extract emitter ${emitterId}: ${e.message}`);
          } finally {
            await pool.query(
              `UPDATE syncfy_credentials
                  SET next_auto_extract_at = NULL,
                      updated_at = NOW()
                WHERE emitter_id = $1 AND next_auto_extract_at IS NOT NULL`,
              [emitterId]
            );
          }
        }
      }
    } catch (err: any) {
      console.error('[CRON] Syncfy FASE 2 EXTRACT error:', err.message);
    }
  });
  console.log('📅 [CRON] Syncfy auto-sync 2-fases (sync + extract) programado: cada 2 minutos');
};

/**
 * Inicializar todos los CRON jobs
 */
/**
 * CRON JOB: Promoción automática Chartback I → Chartback Público
 * Clientes que llevan más de 30 días en Chartback I sin recuperarse
 * pasan al pool público para que cualquier asesor pueda contactarlos.
 */
export const startChartbackIPromotionCron = () => {
  // Todos los días a las 07:00
  cron.schedule('0 7 * * *', async () => {
    try {
      const result = await pool.query(`
        UPDATE legacy_clients
        SET
            chartback_status = 'pending',
            recovery_advisor_id = NULL,
            chartback_i_since = NULL
        WHERE
            chartback = TRUE
            AND chartback_status = 'chartback_i'
            AND chartback_i_since IS NOT NULL
            AND chartback_i_since < NOW() - INTERVAL '30 days'
        RETURNING id, box_id
      `);
      if (result.rows.length > 0) {
        console.log(`📢 [CRON] ${result.rows.length} cliente(s) promovidos de Chartback I a Chartback Público`);
      }
    } catch (err) {
      console.error('[CRON] Error promoviendo Chartback I:', err);
    }
  });
};

/**
 * CRON JOB: Aviso semanal "Tarifa desactualizada" (TDI Aéreo / TDI Express)
 * Se ejecuta cada LUNES a las 08:00 (hora de México). Antes este aviso se
 * disparaba desde el frontend en CADA carga del dashboard de sucursal, por lo
 * que se acumulaban miles de notificaciones (y doble: una por cada servicio
 * desactualizado). Ahora corre una sola vez por semana y SOLO si la tarifa
 * sigue desactualizada (>24h sin actualizarse). Incluye dedup por día por si
 * el servidor reinicia el lunes.
 */
/**
 * CRON JOB: recordatorio de tareas paradas en "esperando confirmación"
 *
 * Cuando el responsable termina una tarea, esta NO se cierra: pasa a
 * 'awaiting_confirmation' y solo quien la asignó puede darla por buena. El
 * aviso in-app se manda una sola vez, en el momento; si esa persona no lo ve
 * (o lo marca como leído sin actuar), la tarea se queda parada sin que nada
 * vuelva a avisar. Medido sobre las urgentes: el trabajo se entrega en ~8 h,
 * pero la confirmación tarda ~2.6 días — el 76% del ciclo es esta espera.
 *
 * Corre L-V a las 10:30 y 16:00 (MX):
 *   · avisa a quien asignó la tarea si lleva más de 20 h esperando
 *   · máximo un recordatorio cada 24 h por tarea (no se vuelve spam)
 *   · a partir de 3 días también le copia al responsable, para que sepa que su
 *     entrega está atorada del otro lado
 */
export const startAwaitingConfirmationReminderCron = () => {
  const HORAS_MINIMAS = 20;      // no molestar antes de que pase una jornada
  const DIAS_PARA_COPIAR = 3;    // a partir de aquí también se entera el responsable

  const correr = async () => {
    console.log('👀 [CRON] Revisando tareas paradas en espera de confirmación...');
    try {
      await pool.query(
        `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confirmation_reminder_sent_at TIMESTAMPTZ`
      ).catch(() => {});

      const r = await pool.query(
        `SELECT t.id, t.title, t.created_by, t.assignee_id,
                au.full_name AS assignee_name,
                COALESCE(
                  (SELECT MAX(a.created_at) FROM task_activity a
                    WHERE a.task_id = t.id AND a.action = 'awaiting_confirmation'),
                  t.updated_at
                ) AS awaiting_since
           FROM tasks t
           LEFT JOIN users au ON au.id = t.assignee_id
          WHERE t.status = 'awaiting_confirmation'
            AND t.created_by IS NOT NULL
            AND COALESCE(t.assignee_id, 0) <> t.created_by
            AND (t.confirmation_reminder_sent_at IS NULL
                 OR t.confirmation_reminder_sent_at < NOW() - INTERVAL '24 hours')
          ORDER BY awaiting_since ASC
          LIMIT 200`
      );

      const { sendPushToUsers } = await import('./pushService');
      let avisados = 0;

      for (const t of r.rows) {
        const desde = t.awaiting_since ? new Date(t.awaiting_since) : null;
        if (!desde) continue;
        const horas = (Date.now() - desde.getTime()) / 3600000;
        if (horas < HORAS_MINIMAS) continue;

        const dias = Math.floor(horas / 24);
        const espera = dias >= 1 ? `${dias} día${dias === 1 ? '' : 's'}` : `${Math.round(horas)} horas`;
        const quien = t.assignee_name || 'El responsable';
        const titulo = '⏳ Tarea esperando tu confirmación';
        const msg = `${quien} terminó "${t.title}" hace ${espera} y sigue sin confirmarse. Ábrela para cerrarla o pedir cambios.`;
        const data = { task_id: t.id, awaiting_confirmation: true, reminder: true };

        // A quien asignó la tarea: le toca confirmar.
        const destinatarios: number[] = [Number(t.created_by)];
        // Ya lleva demasiado: el responsable también debe enterarse de que su
        // entrega está detenida esperando a alguien más.
        if (horas >= DIAS_PARA_COPIAR * 24 && t.assignee_id) destinatarios.push(Number(t.assignee_id));

        for (const uid of destinatarios) {
          const esResponsable = uid === Number(t.assignee_id);
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, icon, action_url, data)
             VALUES ($1, 'task', $2, $3, 'clock-outline', '/tareas', $4)`,
            [
              uid,
              esResponsable ? '⏳ Tu entrega sigue sin confirmarse' : titulo,
              esResponsable
                ? `"${t.title}" lleva ${espera} esperando confirmación de quien la asignó.`
                : msg,
              JSON.stringify(data),
            ]
          ).catch(() => {});
        }

        // Push sin tope de horario: el cron ya corre solo en horario laboral,
        // así que filtrar otra vez por hora solo lo silenciaría de más.
        await sendPushToUsers(destinatarios, {
          title: titulo,
          body: msg,
          data: { screen: 'MyTasks', task_id: String(t.id), awaiting_confirmation: 'true', reminder: 'true' },
          notificationType: 'task_completed',
        }).catch(() => {});

        await pool.query(
          `UPDATE tasks SET confirmation_reminder_sent_at = NOW() WHERE id = $1`, [t.id]
        ).catch(() => {});
        avisados++;
      }

      console.log(`✅ [CRON] Recordatorios de confirmación enviados: ${avisados} (de ${r.rows.length} candidatas)`);
    } catch (err: any) {
      console.error('❌ [CRON] Error en recordatorio de confirmación:', err.message);
    }
  };

  cron.schedule('30 10 * * 1-5', correr, { timezone: 'America/Mexico_City' });
  cron.schedule('0 16 * * 1-5', correr, { timezone: 'America/Mexico_City' });
  console.log('📅 [CRON] Recordatorio de tareas por confirmar: L-V 10:30 y 16:00 (MX)');
};

/**
 * CRON JOB: órdenes con pago PARCIAL sin completar
 *
 * Una orden a la que el cliente abonó de menos se queda en 'vouchers_partial'
 * en silencio: las guías no se liberan, pero nada le avisa a nadie. Solo se ve
 * si alguien entra al panel. Hoy hay 6 órdenes así por $162,781.50.
 *
 * Corre L-V a las 11:00 (MX):
 *   · avisa al ASESOR del cliente cuánto falta por cobrar
 *   · avisa al CLIENTE que su pago quedó incompleto
 *   · máximo un aviso cada 48 h por orden, para no volverse ruido
 */
export const startPagoParcialReminderCron = () => {
  cron.schedule('0 11 * * 1-5', async () => {
    console.log('💸 [CRON] Revisando órdenes con pago parcial...');
    try {
      await pool.query(
        `ALTER TABLE pobox_payments ADD COLUMN IF NOT EXISTS parcial_aviso_at TIMESTAMPTZ`
      ).catch(() => {});

      const r = await pool.query(`
        SELECT pp.id, pp.payment_reference, pp.amount::numeric AS total,
               GREATEST(0, pp.amount
                   - COALESCE(pp.voucher_total, 0)
                   - COALESCE(pp.wallet_applied, 0)
                   - COALESCE(pp.credit_applied, 0))::numeric AS falta,
               pp.user_id, u.full_name AS cliente, u.box_id,
               COALESCE(u.advisor_id, u.referred_by_id) AS asesor_id
          FROM pobox_payments pp
          JOIN users u ON u.id = pp.user_id
         WHERE pp.status = 'vouchers_partial'
           AND (pp.parcial_aviso_at IS NULL OR pp.parcial_aviso_at < NOW() - INTERVAL '48 hours')
         ORDER BY 3 DESC
         LIMIT 100
      `);

      let avisados = 0;
      for (const o of r.rows) {
        const falta = Number(o.falta);
        if (!(falta > 0)) continue;
        const montoTxt = `$${falta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Al asesor: es quien cobra.
        if (o.asesor_id) {
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, icon, action_url, data)
             VALUES ($1, 'payment', $2, $3, 'alert-circle', '/dashboard', $4)`,
            [
              o.asesor_id,
              '💸 Pago incompleto de tu cliente',
              `${o.box_id} ${o.cliente}: la orden ${o.payment_reference} sigue incompleta. Faltan ${montoTxt} y la mercancía no se libera hasta cubrirla.`,
              JSON.stringify({ payment_reference: o.payment_reference, remaining: falta }),
            ]
          ).catch(() => {});
        }

        // Al cliente: que sepa que no terminó.
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, icon, action_url, data)
           VALUES ($1, 'payment', $2, $3, 'alert-circle', '/dashboard', $4)`,
          [
            o.user_id,
            '⚠️ Tu pago quedó incompleto',
            `A la orden ${o.payment_reference} le faltan ${montoTxt}. Sube el comprobante del resto para que liberemos tu mercancía.`,
            JSON.stringify({ payment_reference: o.payment_reference, remaining: falta }),
          ]
        ).catch(() => {});

        await pool.query(
          `UPDATE pobox_payments SET parcial_aviso_at = NOW() WHERE id = $1`, [o.id]
        ).catch(() => {});
        avisados++;
      }

      console.log(`✅ [CRON] Avisos de pago parcial enviados: ${avisados} (de ${r.rows.length} órdenes)`);
    } catch (err: any) {
      console.error('❌ [CRON] Error en aviso de pago parcial:', err.message);
    }
  }, { timezone: 'America/Mexico_City' });
  console.log('📅 [CRON] Aviso de pagos parciales: L-V 11:00 (MX)');
};

/**
 * CRON JOB: recordatorio de eventos del calendario
 *
 * Los eventos solo avisaban AL CREARSE, y con una notificación in-app que ni
 * siquiera le llegaba al creador. Nada recordaba la junta el día que tocaba:
 * quien no entrara al sistema ese día dependía de acordarse.
 *
 * Corre cada 5 minutos y avisa 1 HORA antes de empezar.
 *
 * Ojo con la hora: calendar_events.start_at es TIMESTAMP sin zona y guarda
 * UTC (la junta de las 12:00 en México está grabada como 18:00). El servidor
 * corre en Etc/UTC, así que NOW()::timestamp ya está en el mismo marco y la
 * comparación es directa — convertir aquí desfasaría el aviso 6 horas.
 */
export const startCalendarReminderCron = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await pool.query(
        `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP`
      ).catch(() => {});

      // Dos reglas según el tipo de evento:
      //   · con hora  → 1 h antes. Ventana amplia (50–70 min) para que un cron
      //                 atrasado no se salte el evento.
      //   · todo el día → a las 9:00 AM hora de México del mismo día; "1 hora
      //                 antes" no significa nada cuando no hay hora de inicio.
      // reminder_sent_at garantiza que se avise una sola vez en ambos casos.
      const r = await pool.query(`
        SELECT e.id, e.title, e.location, COALESCE(e.all_day, FALSE) AS all_day, e.created_by,
               -- La hora se formatea AQUÍ, no en JS: el driver devuelve el
               -- timestamp naive como hora local de la máquina y toISOString()
               -- lo desfasaba 6 horas (la junta de las 12:00 salía como 18:00).
               to_char(e.start_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Monterrey',
                       'HH12:MI AM') AS hora_mx
          FROM calendar_events e
         WHERE e.reminder_sent_at IS NULL
           AND (
             (COALESCE(e.all_day, FALSE) = FALSE
              AND e.start_at BETWEEN (NOW()::timestamp + interval '50 minutes')
                                 AND (NOW()::timestamp + interval '70 minutes'))
             OR
             (COALESCE(e.all_day, FALSE) = TRUE
              -- Un evento de TODO EL DÍA es una fecha, no un instante: se
              -- compara tal cual está guardada. Convertirla por zona horaria la
              -- corre un día (00:00 UTC del 25 cae el 24 en México) y el aviso
              -- saldría la víspera.
              AND e.start_at::date = (NOW() AT TIME ZONE 'America/Monterrey')::date
              AND (NOW() AT TIME ZONE 'America/Monterrey')::time >= TIME '09:00'
              AND (NOW() AT TIME ZONE 'America/Monterrey')::time <  TIME '09:30')
           )
         ORDER BY e.start_at
         LIMIT 50
      `);
      if (r.rows.length === 0) return;

      const { sendPushToUsers } = await import('./pushService');
      const { createCustomNotification } = require('./notificationController');
      let avisados = 0;

      for (const ev of r.rows) {
        // Participantes + el creador: a él tampoco le avisaba nadie.
        const pr = await pool.query(
          `SELECT user_id FROM calendar_event_participants WHERE event_id = $1
           UNION
           SELECT created_by FROM calendar_events WHERE id = $1 AND created_by IS NOT NULL`,
          [ev.id]
        );
        const destinos = pr.rows.map((x: any) => Number(x.user_id)).filter(Boolean);
        if (destinos.length === 0) continue;

        const horaMx = String(ev.hora_mx || '').trim();
        const titulo = ev.all_day
          ? '📅 Tienes un evento hoy'
          : '⏰ Tu evento empieza en 1 hora';
        const cuerpo = ev.all_day
          ? `${ev.title}${ev.location ? ` · ${ev.location}` : ''}`
          : `${ev.title} · ${horaMx}${ev.location ? ` · ${ev.location}` : ''}`;

        for (const uid of destinos) {
          await createCustomNotification(uid, titulo, cuerpo, 'info', 'calendar',
            { event_id: ev.id }, '/calendario').catch(() => {});
        }
        await sendPushToUsers(destinos, {
          title: titulo,
          body: cuerpo,
          data: { screen: 'Calendar', event_id: String(ev.id) },
          notificationType: 'calendar_reminder',
        }).catch(() => {});

        await pool.query(
          `UPDATE calendar_events SET reminder_sent_at = NOW() WHERE id = $1`, [ev.id]
        ).catch(() => {});
        avisados++;
      }

      if (avisados) console.log(`⏰ [CRON] Recordatorio de calendario enviado para ${avisados} evento(s)`);
    } catch (err: any) {
      console.error('❌ [CRON] Error en recordatorio de calendario:', err.message);
    }
  }, { timezone: 'America/Mexico_City' });
  console.log('📅 [CRON] Recordatorio de calendario: cada 5 min · con hora → 1 h antes · todo el día → 9:00 AM MX');
};

export const startStaleRatesNotifyCron = () => {
  cron.schedule('0 8 * * 1', async () => {
    console.log('💲 [CRON] Revisando tarifas TDI desactualizadas (aviso semanal, lunes)...');
    try {
      const STALE_HOURS = 24;
      const [tdiRes, tdiExpressRes] = await Promise.all([
        pool.query(
          `SELECT r.updated_at,
                  EXTRACT(EPOCH FROM (NOW() - r.updated_at)) / 3600 AS hours_since
             FROM air_routes r
            WHERE r.is_active = true AND r.code <> 'TDI-EXPRES'
            ORDER BY r.id ASC LIMIT 1`
        ),
        pool.query(
          `SELECT r.updated_at,
                  EXTRACT(EPOCH FROM (NOW() - r.updated_at)) / 3600 AS hours_since
             FROM air_routes r
            WHERE r.is_active = true AND r.code = 'TDI-EXPRES'
            ORDER BY r.id ASC LIMIT 1`
        ),
      ]);

      const isStale = (row: any): boolean => {
        if (!row) return false; // sin ruta activa: no molestar
        if (row.updated_at === null) return true;
        const h = Number(row.hours_since);
        return isNaN(h) ? true : h > STALE_HOURS;
      };

      const staleServices: { key: string; label: string }[] = [];
      if (isStale(tdiRes.rows[0])) staleServices.push({ key: 'tdi_air', label: 'TDI Aéreo' });
      if (isStale(tdiExpressRes.rows[0])) staleServices.push({ key: 'tdi_express', label: 'TDI Express' });

      if (staleServices.length === 0) {
        console.log('✅ [CRON] Tarifas TDI al día. Sin avisos.');
        return;
      }

      const usersRes = await pool.query(
        `SELECT id FROM users WHERE role IN ('customer_service', 'soporte_tecnico') AND is_active = TRUE`
      );

      let sent = 0;
      for (const svc of staleServices) {
        const msg = `⚠️ El precio ${svc.label} necesita actualizarse. Accede al panel de tarifas para actualizar el costo por kg.`;
        for (const u of usersRes.rows) {
          // Dedup: no repetir el mismo aviso al mismo usuario el mismo día
          const dup = await pool.query(
            `SELECT 1 FROM notifications
              WHERE user_id = $1 AND type = 'system_alert'
                AND data->>'service' = $2
                AND created_at::date = CURRENT_DATE
              LIMIT 1`,
            [u.id, svc.key]
          );
          if (dup.rows.length > 0) continue;
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES ($1, 'system_alert', 'Tarifa desactualizada', $2, $3)`,
            [u.id, msg, JSON.stringify({ service: svc.key, action: 'update_rate' })]
          ).catch(() => {});
          sent++;
        }
      }
      console.log(`✅ [CRON] Avisos de tarifa desactualizada enviados: ${sent} (${staleServices.map(s => s.label).join(', ')})`);
    } catch (err: any) {
      console.error('❌ [CRON] Error en aviso de tarifas desactualizadas:', err.message);
    }
  }, { timezone: 'America/Mexico_City' });
  console.log('📅 [CRON] Aviso de tarifas TDI desactualizadas: lunes 08:00 (MX)');
};

// 🔄 Secuencias automáticas de WhatsApp: 12:06 PM de Lunes a Viernes (hora México).
// Envía todos los pasos con fecha vencida, SOLO en la hora/días hábiles
// configurados (editable desde el panel). Un paso que vence en día no-hábil
// espera a la siguiente corrida hábil — aplica también a los ya inscritos,
// porque el filtro es por next_send_at <= NOW() en cada corrida válida.
let seqDrainInProgress = false;
// Getter para el widget de estado de la cola: indica si hay un drenado
// corriendo en este proceso ahora mismo (in-memory; se reinicia con el deploy).
export const isSequenceDrainInProgress = (): boolean => seqDrainInProgress;
// Vacía la cola en tandas de SEQUENCE_BATCH_LIMIT (50): procesa un lote y, si
// quedó lleno (hay backlog), agenda el siguiente lote 20 min después. Repite
// hasta que un lote salga incompleto (cola vacía). Evita saturar WhatsApp con
// miles de envíos de golpe pero termina de mandarlos el mismo día.
export const drainSequenceBatches = async () => {
  if (seqDrainInProgress) return;
  seqDrainInProgress = true;
  try {
    const { processDueSequenceSteps, SEQUENCE_BATCH_LIMIT } = await import('./waSequenceController');
    const runBatch = async (round: number) => {
      try {
        const { processed } = await processDueSequenceSteps();
        // Lote lleno → todavía hay pendientes: siguiente tanda en 20 min.
        if (processed >= SEQUENCE_BATCH_LIMIT) {
          console.log(`[SEQ] Lote ${round} lleno (${processed}); siguiente tanda en 20 min`);
          setTimeout(() => { runBatch(round + 1).catch(() => {}); }, 20 * 60 * 1000);
        } else {
          seqDrainInProgress = false;
        }
      } catch (e) {
        seqDrainInProgress = false;
        console.error('[CRON] drainSequenceBatches lote:', (e as Error).message);
      }
    };
    await runBatch(1);
  } catch (e) {
    seqDrainInProgress = false;
    console.error('[CRON] drainSequenceBatches:', (e as Error).message);
  }
};

// ¿Ya estamos en la ventana de envío del día? (día hábil configurado y la hora
// de pared Monterrey >= la hora programada). Es el mismo momento en el que el
// disparo diario habría arrancado el drenado.
const isWithinSequenceWindow = (sch: { hour: number; minute: number; days: number[] }): boolean => {
  const mty = new Date(Date.now() - 6 * 3600 * 1000); // Monterrey UTC-6 (sin DST)
  if (!sch.days.includes(mty.getUTCDay())) return false;
  const h = mty.getUTCHours(), m = mty.getUTCMinutes();
  return h > sch.hour || (h === sch.hour && m >= sch.minute);
};

export const startWaSequenceCron = () => {
  // (1) Disparo diario: arranca el drenado en el minuto exacto configurado.
  cron.schedule('* * * * *', async () => {
    try {
      const { getSequenceSchedule } = await import('./waSequenceController');
      const sch = await getSequenceSchedule();
      const mty = new Date(Date.now() - 6 * 3600 * 1000);
      if (mty.getUTCHours() === sch.hour && mty.getUTCMinutes() === sch.minute && sch.days.includes(mty.getUTCDay())) {
        drainSequenceBatches().catch(() => {});
      }
    } catch (e) {
      console.error('[CRON] startWaSequenceCron:', (e as Error).message);
    }
  });
  // (2) Auto-recuperación cada 10 min: si quedó backlog vencido y ya estamos en
  // ventana, reanuda el drenado. Cubre el caso de que un redeploy haya matado la
  // cadena en memoria (setTimeout) a media tanda. drainSequenceBatches es
  // idempotente (guard seqDrainInProgress), así que llamarlo de más es no-op.
  cron.schedule('*/10 * * * *', async () => {
    try {
      const { getSequenceSchedule, hasDueSequenceBacklog } = await import('./waSequenceController');
      const sch = await getSequenceSchedule();
      if (isWithinSequenceWindow(sch) && await hasDueSequenceBacklog()) {
        console.log('[SEQ] Auto-recuperación: backlog vencido detectado, reanudando drenado');
        drainSequenceBatches().catch(() => {});
      }
    } catch (e) {
      console.error('[CRON] auto-recuperación secuencia:', (e as Error).message);
    }
  });
  // (3) Reanudar de inmediato al arrancar (tras cada (re)deploy): si hay backlog
  // y estamos en ventana, no esperamos hasta el próximo tick de 10 min.
  (async () => {
    try {
      const { getSequenceSchedule, hasDueSequenceBacklog } = await import('./waSequenceController');
      const sch = await getSequenceSchedule();
      if (isWithinSequenceWindow(sch) && await hasDueSequenceBacklog()) {
        console.log('[SEQ] Arranque: backlog pendiente en ventana, reanudando drenado');
        drainSequenceBatches().catch(() => {});
      }
    } catch (e) {
      console.error('[CRON] reanudar drenado al arrancar:', (e as Error).message);
    }
  })();
  console.log('✅ Cron de secuencias WhatsApp activo (horario configurable + auto-recuperación tras redeploy)');
};

// 📩 Auto-inscripción de prospectos externos en la secuencia. Lun/Mar/Mié 8:00
// a.m. hora Monterrey. Solo corre si el toggle (Central de Leads) está activo.
// Inscribe hasta 500 prospectos "nuevos", no inscritos, con >2 días de antigüedad.
export const startAutoEnrollExternalProspectsCron = () => {
  cron.schedule('0 8 * * 1,2,3', async () => {
    try {
      const { runAutoEnrollExternalProspects } = await import('./waSequenceController');
      const { enrolled, eligible } = await runAutoEnrollExternalProspects();
      if (enrolled > 0) console.log(`✅ [CRON] Auto-inscripción prospectos externos: ${enrolled}/${eligible} inscritos`);
    } catch (e) {
      console.error('[CRON] startAutoEnrollExternalProspectsCron:', (e as Error).message);
    }
  }, { timezone: 'America/Mexico_City' });
  console.log('✅ Cron de auto-inscripción de prospectos externos activo (Lun/Mar/Mié 8am MTY, si el toggle está activo)');
};

// 📦 Enlaza envíos huérfanos a su cliente por box_id (DHL/aéreo/marítimo/packages)
// que hayan quedado con user_id NULL — p.ej. llegaron después de que el cliente
// ya se registró. Evita que aparezcan "Sin alta" y que el cliente no los vea.
export const startBoxLinkReconcileCron = () => {
  // 1 vez al día — 3:00 a.m. hora Monterrey (UTC-6 = 09:00 UTC).
  cron.schedule('0 9 * * *', async () => {
    try {
      const { reconcileOrphanShipments } = await import('./boxLinkReconcile');
      await reconcileOrphanShipments();
    } catch (e) {
      console.error('[CRON] startBoxLinkReconcileCron:', (e as Error).message);
    }
  });
  console.log('✅ Cron de enlace de envíos por box_id activo (1 vez al día, 3am MTY)');
};

// 💸 Referidos: activa el bono cuando el referido hace su PRIMER ENVÍO real
// (excluye guías USK- del Kit de Bienvenida). Cada 20 min.
export const startReferralFirstShipmentCron = () => {
  cron.schedule('*/20 * * * *', async () => {
    try {
      const { procesarReferidosPrimerEnvio } = await import('./referralService');
      await procesarReferidosPrimerEnvio();
    } catch (e) {
      console.error('[CRON] startReferralFirstShipmentCron:', (e as Error).message);
    }
  });
  console.log('✅ Cron de bonos de referido (primer envío) activo (cada 20 min)');
};

// Progresión simulada de las guías USK (Kit de Bienvenida):
//   - 12 h después de asignar instrucciones: Recibido CEDIS Hidalgo → En tránsito
//   - 24 h después de entrar en tránsito: En tránsito → Recibido en CEDIS MTY
// (En CEDIS MTY + pagada + con instrucciones ya puede aparecer en Asignados Hoy.)
export const startUskGuideProgressionCron = () => {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const toTransit = await pool.query(`
        UPDATE packages
           SET status = 'in_transit', dispatched_at = NOW(), updated_at = NOW()
         WHERE tracking_internal LIKE 'USK-%'
           AND service_type = 'POBOX_USA'
           AND status = 'received'
           AND needs_instructions = FALSE
           AND instructions_assigned_at IS NOT NULL
           AND instructions_assigned_at <= NOW() - INTERVAL '12 hours'
        RETURNING id`);
      // CEDIS MTY = branch 1 (los POBOX recibidos en MTY viven en current_branch_id=1).
      // Al llegar a MTY se asigna esa sucursal para que aparezca en Asignados Hoy
      // del repartidor local.
      const toMty = await pool.query(`
        UPDATE packages
           SET status = 'received_mty',
               current_branch_id = COALESCE(current_branch_id, 1),
               updated_at = NOW()
         WHERE tracking_internal LIKE 'USK-%'
           AND service_type = 'POBOX_USA'
           AND status = 'in_transit'
           AND dispatched_at IS NOT NULL
           AND dispatched_at <= NOW() - INTERVAL '24 hours'
        RETURNING id`);
      if ((toTransit.rowCount || 0) + (toMty.rowCount || 0) > 0) {
        console.log(`[CRON USK] a tránsito: ${toTransit.rowCount}, a CEDIS MTY: ${toMty.rowCount}`);
      }
    } catch (e) {
      console.error('[CRON] startUskGuideProgressionCron:', (e as Error).message);
    }
  });
  console.log('✅ Cron de progresión de guías USK activo (cada 30 min)');
};

/**
 * CRON: Recordatorio de cajas SIN INSTRUCCIONES a los 3 días de recibidas.
 * Envía al CLIENTE y a su ASESOR. Solo si aún no hay instrucciones y no se
 * mandó antes (dedup por instruction_reminder_sent_at). Una vez por guía
 * master o caja individual (no por cada hija). Toggle: notif_caja_recibida.
 */
export const startInstructionReminderCron = () => {
  // Lunes a viernes 12:00 MX (18:00 UTC). No se envía fines de semana.
  cron.schedule('0 18 * * 1-5', async () => {
    try {
      const { sendInstructionReminderClient, sendInstructionReminderAdvisor, isNotifEnabled } = await import('./whatsappService');
      // Controlado por el toggle "Notificación de caja recibida" (Ajustes del Sistema).
      if (!(await isNotifEnabled('notif_caja_recibida'))) return;
      await pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS instruction_reminder_sent_at TIMESTAMPTZ`).catch(() => {});
      // base_guia = GUÍA MASTER para agrupar. En China Aéreo (AIR_CHN_MX) el
      // tracking_internal es el corto "CN-xxxx-001" y la guía real es el child_no
      // "AIRxxxx-001"; el master es ese child_no SIN el sufijo -NNN → "AIRxxxx".
      // Así 1 envío = 1 recordatorio (no 1 por caja) y se muestra la guía AIR.
      // Para el resto de servicios (POBOX, etc.) NO se estruja el sufijo: se usa
      // el tracking_internal tal cual (US-2782469577 no debe volverse "US").
      const BASE_GUIA = `CASE WHEN p.service_type = 'AIR_CHN_MX'
              THEN REGEXP_REPLACE(COALESCE(NULLIF(p.child_no,''), p.tracking_internal), '-[0-9]+$', '')
              ELSE p.tracking_internal END`;
      const r = await pool.query(`
        WITH pend AS (
          SELECT p.id, p.user_id, p.received_at,
                 ${BASE_GUIA} AS base_guia,
                 u.full_name AS client_name, u.box_id AS client_box, u.phone AS client_phone,
                 u.notif_whatsapp, u.phone_verified, u.whatsapp_verified,
                 a.full_name AS advisor_name, a.phone AS advisor_phone
          FROM packages p
          JOIN users u ON u.id = p.user_id
          LEFT JOIN users a ON a.id = u.advisor_id
          WHERE p.received_at IS NOT NULL
            AND p.received_at <= NOW() - INTERVAL '3 days'
            AND p.received_at >= NOW() - INTERVAL '14 days'
            AND p.assigned_address_id IS NULL
            AND p.instructions_assigned_at IS NULL
            AND p.delivered_at IS NULL
            AND COALESCE(p.missing_on_arrival, FALSE) = FALSE
            AND p.lost_by_user_id IS NULL
            AND (p.is_master = TRUE OR p.master_id IS NULL)
            AND p.instruction_reminder_sent_at IS NULL
        )
        SELECT DISTINCT ON (user_id, base_guia)
               base_guia AS trn, user_id, client_name, client_box, client_phone,
               notif_whatsapp, phone_verified, whatsapp_verified, advisor_name, advisor_phone
        FROM pend
        ORDER BY user_id, base_guia, received_at ASC
        LIMIT 300
      `);
      let sent = 0;
      for (const row of r.rows) {
        const trn = row.trn || '';
        const wantWa = row.notif_whatsapp !== false && (row.phone_verified === true || row.whatsapp_verified === true);
        if (row.client_phone && wantWa) {
          await sendInstructionReminderClient(row.client_phone, row.client_name || 'Cliente', trn).catch(() => {});
        }
        // El asesor recibe el recordatorio de trabajo (si tiene teléfono), EXCEPTO
        // en Kits de Bienvenida (guías USK): un regalo no debe generar tarea al asesor.
        // Se le manda el CASILLERO del cliente (S1234), no el nombre.
        const isUsk = /^USK-/i.test(String(trn));
        if (row.advisor_phone && !isUsk) {
          await sendInstructionReminderAdvisor(row.advisor_phone, row.advisor_name || 'Asesor', row.client_box || row.client_name || 'tu cliente', trn).catch(() => {});
        }
        // Marcar TODAS las cajas de esa guía master (mismo cliente + misma base)
        // para no repetir el recordatorio en los siguientes días.
        await pool.query(
          `UPDATE packages SET instruction_reminder_sent_at = NOW()
            WHERE user_id = $1 AND instruction_reminder_sent_at IS NULL
              AND (CASE WHEN service_type = 'AIR_CHN_MX'
                     THEN REGEXP_REPLACE(COALESCE(NULLIF(child_no,''), tracking_internal), '-[0-9]+$', '')
                     ELSE tracking_internal END) = $2`,
          [row.user_id, trn]
        ).catch(() => {});
        sent++;
      }
      if (sent) console.log(`[CRON] Recordatorio instrucciones (3 días): ${sent} guías notificadas`);
    } catch (e) {
      console.error('[CRON] startInstructionReminderCron:', (e as Error).message);
    }
  });
  console.log('✅ Cron recordatorio de instrucciones (3 días) activo');
};

/**
 * CRON: Recordatorio de PAGO cuando la caja LLEGA a un CEDIS en México
 * (status received_mty / received_cdmx) y NO tiene pago registrado. Aplica a
 * TODOS los servicios (packages: aéreo/TDI/PO Box + maritime_orders). UNO por
 * guía master/caja individual, dedup por payment_reminder_sent_at.
 * Toggle: notif_recordatorio_pago (Ajustes del Sistema).
 */
export const startPaymentReminderCron = () => {
  // Cada 30 min: captura la caja mientras está "recibida en CEDIS".
  cron.schedule('*/30 * * * *', async () => {
    try {
      const { sendPaymentReminder, isNotifEnabled } = await import('./whatsappService');
      // Controlado por el toggle "Recordatorio de pago" (Ajustes del Sistema).
      if (!(await isNotifEnabled('notif_recordatorio_pago'))) return;
      await pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ`).catch(() => {});
      await pool.query(`ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ`).catch(() => {});
      let sent = 0;

      // 1) packages (aéreo China / TDI Express / PO Box / etc.)
      const rp = await pool.query(`
        SELECT p.id, p.tracking_internal AS trn,
               u.full_name AS client_name, u.phone AS client_phone,
               u.notif_whatsapp, u.phone_verified, u.whatsapp_verified
        FROM packages p
        JOIN users u ON u.id = p.user_id
        WHERE p.status::text IN ('received_mty', 'received_cdmx')
          AND p.client_paid IS NOT TRUE
          AND COALESCE(p.payment_status, '') NOT IN ('paid', 'pagado')
          AND p.delivered_at IS NULL
          AND (p.is_master = TRUE OR p.master_id IS NULL)
          AND p.payment_reminder_sent_at IS NULL
        ORDER BY p.received_at ASC NULLS LAST
        LIMIT 300
      `);
      for (const row of rp.rows) {
        const wantWa = row.notif_whatsapp !== false && (row.phone_verified === true || row.whatsapp_verified === true);
        if (row.client_phone && wantWa) {
          await sendPaymentReminder(row.client_phone, row.client_name || 'Cliente', row.trn || '').catch(() => {});
        }
        await pool.query(`UPDATE packages SET payment_reminder_sent_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});
        sent++;
      }

      // 2) maritime_orders (marítimo China)
      const rm = await pool.query(`
        SELECT m.id, m.ordersn AS trn,
               u.full_name AS client_name, u.phone AS client_phone,
               u.notif_whatsapp, u.phone_verified, u.whatsapp_verified
        FROM maritime_orders m
        JOIN users u ON u.id = m.user_id
        WHERE m.status IN ('received_mty', 'received_cdmx')
          AND COALESCE(m.payment_status, '') NOT IN ('paid', 'pagado')
          AND m.delivered_at IS NULL
          AND m.payment_reminder_sent_at IS NULL
        ORDER BY m.received_at ASC NULLS LAST
        LIMIT 300
      `);
      for (const row of rm.rows) {
        const wantWa = row.notif_whatsapp !== false && (row.phone_verified === true || row.whatsapp_verified === true);
        if (row.client_phone && wantWa) {
          await sendPaymentReminder(row.client_phone, row.client_name || 'Cliente', row.trn || '').catch(() => {});
        }
        await pool.query(`UPDATE maritime_orders SET payment_reminder_sent_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});
        sent++;
      }

      if (sent) console.log(`[CRON] Recordatorio de pago (CEDIS): ${sent} guías notificadas`);
    } catch (e) {
      console.error('[CRON] startPaymentReminderCron:', (e as Error).message);
    }
  });
  console.log('✅ Cron recordatorio de pago (al llegar a CEDIS) activo');
};

// 📅 Envíos masivos de WhatsApp PROGRAMADOS. El estado vive en la BD
// (scheduled_bulk_sends), así que es a prueba de redeploys: cada minuto revisa
// los pendientes cuya hora ya llegó y los dispara con el mismo core del envío
// inmediato. Marca 'sending' de forma atómica (SKIP LOCKED) para no duplicar.
let bulkScheduledInProgress = false;
export const drainScheduledBulkSends = async () => {
  if (bulkScheduledInProgress) return;
  bulkScheduledInProgress = true;
  try {
    const { ensureScheduledBulkSchema, executeBulkSend } = await import('./crmController');
    await ensureScheduledBulkSchema();
    const due = await pool.query(
      `UPDATE scheduled_bulk_sends
          SET status='sending'
        WHERE id IN (
          SELECT id FROM scheduled_bulk_sends
           WHERE status='pending' AND scheduled_at <= NOW()
           ORDER BY scheduled_at ASC LIMIT 5
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, template_id, lead_keys, advisor_ids, var_values`
    );
    for (const job of due.rows) {
      try {
        const out = await executeBulkSend({
          templateId: job.template_id,
          leadKeys: job.lead_keys || undefined,
          advisorIds: job.advisor_ids || undefined,
          varValues: job.var_values || undefined,
        });
        // El status debe reflejar la REALIDAD del envío, no solo que el job terminó.
        //  - 'done'    → todos salieron (sent>0 y sin fallos)
        //  - 'partial' → unos sí y otros no
        //  - 'error'   → no salió ninguno (ej. plantilla rechazada por Meta → 0 enviados)
        const sent = Number(out.sent) || 0;
        const failed = Number(out.failed) || 0;
        const finalStatus = sent === 0 ? 'error' : (failed > 0 ? 'partial' : 'done');
        await pool.query(`UPDATE scheduled_bulk_sends SET status=$3, result=$2, sent_at=NOW() WHERE id=$1`, [job.id, JSON.stringify(out), finalStatus]);
        console.log(`[BULK-CRON] Programado #${job.id} (${finalStatus}): ${out.sent} enviados, ${out.failed} fallidos${out.firstError ? ' | 1er error: ' + out.firstError : ''}`);
      } catch (e) {
        await pool.query(`UPDATE scheduled_bulk_sends SET status='error', result=$2, sent_at=NOW() WHERE id=$1`, [job.id, JSON.stringify({ error: (e as Error).message })]).catch(() => {});
        console.error(`[BULK-CRON] Programado #${job.id} falló:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.error('[BULK-CRON] drainScheduledBulkSends:', (e as Error).message);
  } finally {
    bulkScheduledInProgress = false;
  }
};

export const startScheduledBulkCron = () => {
  cron.schedule('* * * * *', () => { drainScheduledBulkSends().catch(() => {}); });
  console.log('✅ Cron de envíos masivos programados activo (cada minuto)');
};

// 🔁 Configurar funnel — dispara reglas de campañas automáticas por segmento.
// Corre cada 30 min; cada regla se evalúa contra la hora MX y su frecuencia.
export const startFunnelRulesCron = () => {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const { drainFunnelRules } = await import('./crmController');
      await drainFunnelRules();
    } catch (e) {
      console.error('[CRON] startFunnelRulesCron:', (e as Error).message);
    }
  });
  console.log('✅ Cron de reglas de funnel activo (cada 30 min)');
};

// 🧾 Auto-facturación: timbra los pagos PO Box completados con factura pendiente
// (cualquier método: manual/transferencia/cash/credit/wallet), respetando el toggle.
export const startAutoInvoiceSweeperCron = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { sweepPendingAutoInvoices } = await import('./fiscalController');
      await sweepPendingAutoInvoices();
    } catch (e) {
      console.error('[CRON] startAutoInvoiceSweeperCron:', (e as Error).message);
    }
  });
  console.log('✅ Cron de auto-facturación (barredor) activo (cada 5 min)');
};

// 💳 Programación automática del toggle de facturación PayPal:
//   • Se APAGA 3 días antes del fin de mes (día = últimoDía − 3).
//   • Se ENCIENDE el día 1 del mes.
// Global (config_key = 'auto_invoice_paypal_enabled'). Corre a las 00:10 hora MX.
export const startPaypalAutoInvoiceScheduleCron = () => {
  const setPaypal = async (enabled: boolean, reason: string) => {
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('auto_invoice_paypal_enabled', $1::jsonb, 'Facturación automática exclusiva de PayPal', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify({ enabled })]
    );
    console.log(`💳 [CRON PayPal] Facturación PayPal ${enabled ? '✅ ENCENDIDA' : '🔴 APAGADA'} (${reason})`);
  };
  cron.schedule('10 0 * * *', async () => {
    try {
      // Fecha en hora de México (evita corrimiento de mes por UTC).
      const mx = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
      const day = mx.getDate();
      const lastDay = new Date(mx.getFullYear(), mx.getMonth() + 1, 0).getDate();
      const offDay = lastDay - 3; // "3 días antes del fin de mes"
      if (day === 1) {
        await setPaypal(true, 'día 1 del mes');
      } else if (day === offDay) {
        await setPaypal(false, `3 días antes del fin de mes (día ${day}/${lastDay})`);
      }
    } catch (e) {
      console.error('[CRON] startPaypalAutoInvoiceScheduleCron:', (e as Error).message);
    }
  }, { timezone: 'America/Mexico_City' });
  console.log('✅ Cron de programación de facturación PayPal activo (00:10 MX: off día -3, on día 1)');
};

// Recordatorios de tareas (in-app siempre + push; 11am ya es horario laboral):
//  · Lunes 11:00 AM (MX): cuántas tareas PENDIENTES tiene cada usuario.
//  · Diario 11:00 AM (MX): cuántas tareas URGENTES (importante y urgente = 'fuego').
/**
 * Vigilancia de tickets atrasados: resumen a dirección de los que llevan más de
 * 3 días hábiles, y escalamiento (aviso al equipo + tarea urgente con
 * administración dentro) de los que pasan de 4. Ver ticketAtrasos.ts.
 */
export const startTicketAtrasosCron = () => {
  const correr = async () => {
    try {
      const { revisarTicketsAtrasados } = await import('./ticketAtrasos');
      await revisarTicketsAtrasados();
    } catch (e) { console.error('[CRON] tickets atrasados:', e); }
  };
  cron.schedule('0 11 * * *', correr, { timezone: 'America/Mexico_City' });
  console.log('📅 [CRON] Tickets atrasados: diario 11:00 am (MX)');
};

export const startTaskRemindersCron = () => {
  const sendReminder = async (kind: 'weekly' | 'urgent') => {
    try {
      const urgentCond = kind === 'urgent' ? `AND t.eisenhower = 'fuego'` : '';
      const rows = (await pool.query(`
        SELECT x.uid, COUNT(DISTINCT x.task_id)::int AS n
          FROM (
            SELECT t.assignee_id AS uid, t.id AS task_id FROM tasks t
             WHERE t.status = 'open' AND t.assignee_id IS NOT NULL ${urgentCond}
            UNION
            SELECT tp.user_id AS uid, tp.task_id FROM task_participants tp
              JOIN tasks t ON t.id = tp.task_id
             WHERE t.status = 'open' ${urgentCond}
          ) x
         GROUP BY x.uid HAVING COUNT(DISTINCT x.task_id) > 0
      `)).rows;
      if (rows.length === 0) return;
      const { createCustomNotification } = await import('./notificationController');
      const { sendPushToUsers } = await import('./pushService');
      for (const r of rows) {
        const uid = Number(r.uid); const n = Number(r.n);
        if (!uid || n <= 0) continue;
        const title = kind === 'urgent' ? '🔥 Tareas urgentes' : '📋 Tus tareas pendientes';
        const body = kind === 'urgent'
          ? `Tienes ${n} tarea${n === 1 ? '' : 's'} urgente${n === 1 ? '' : 's'} (importante y urgente). Atiéndelas hoy.`
          : `Tienes ${n} tarea${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} esta semana. Ábrelas en Mis Tareas.`;
        try {
          await createCustomNotification(uid, title, body, 'task', 'checkbox', { screen: 'MyTasks' }, '/tareas');
          await sendPushToUsers([uid], { title, body, data: { screen: 'MyTasks' } });
        } catch (e) { console.error('[CRON] task reminder user', uid, e); }
      }
      console.log(`📋 [CRON] Recordatorio de tareas (${kind}) enviado a ${rows.length} usuarios`);
    } catch (e) { console.error(`[CRON] task reminders (${kind}):`, e); }
  };
  // Lunes 11:00 AM (MX) → pendientes generales.
  cron.schedule('0 11 * * 1', () => sendReminder('weekly'), { timezone: 'America/Mexico_City' });
  // Diario 11:00 AM (MX) → urgentes.
  cron.schedule('0 11 * * *', () => sendReminder('urgent'), { timezone: 'America/Mexico_City' });
  console.log('📅 [CRON] Recordatorios de tareas: lunes 11am (pendientes) + diario 11am (urgentes)');
};

export const initCronJobs = () => {
  startRecoveryCronJob();
  startTaskRemindersCron();
  startWaSequenceCron();
  startAutoEnrollExternalProspectsCron();
  startScheduledBulkCron();
  startFunnelRulesCron();
  startAutoInvoiceSweeperCron();
  startPaypalAutoInvoiceScheduleCron();
  startBoxLinkReconcileCron();
  // Reactivado: procesarPrimerPago ya no usa transacción anidada (no puede colgar el pool).
  startReferralFirstShipmentCron();
  startUskGuideProgressionCron();
  startProspectFollowUpCron();
  startMaritimeOrderSyncCron();
  startMaritimeTrackingSyncCron();
  startCreditBlockingCron();
  startFleetAlertsCron();
  startDriverLicenseCheckCron();
  startExchangeRateCheckCron();
  startCarteraVencidaCron();
  startMJCustomerSyncCron();
  startMJCustomerFclSyncCron();
  startFacturapiSyncCron();
  startAutoCheckoutCron();
  startDatabaseBackupCron();
  startEntangledSyncCron();
  startXpayStatusSyncCron();
  startXpayExpiryCron();
  startSyncfyAutoSyncCron();
  startChartbackIPromotionCron();
  startStaleRatesNotifyCron();
  startInstructionReminderCron();
  startPaymentReminderCron();
  startAwaitingConfirmationReminderCron();
  startPagoParcialReminderCron();
  startCalendarReminderCron();
  startTicketAtrasosCron();
};

export default initCronJobs;
