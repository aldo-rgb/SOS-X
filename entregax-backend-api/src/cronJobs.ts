import cron from 'node-cron';
import { pool } from './db';
import { syncOrdersFromChina, syncAllActiveTrackings } from './maritimeApiController';
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
// Envía todos los pasos con fecha vencida. Si un lead se inscribe después de las
// 12:06 (o en fin de semana), su Día 1 sale en la siguiente corrida hábil.
export const startWaSequenceCron = () => {
  cron.schedule('6 12 * * 1-5', async () => {
    try {
      const { processDueSequenceSteps } = await import('./waSequenceController');
      await processDueSequenceSteps();
    } catch (e) {
      console.error('[CRON] startWaSequenceCron:', (e as Error).message);
    }
  }, { timezone: 'America/Monterrey' });
  console.log('✅ Cron de secuencias WhatsApp activo (12:06 PM, Lun-Vie, hora México)');
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
  // Lunes a viernes 10:00 MX (16:00 UTC). No se envía fines de semana.
  cron.schedule('0 16 * * 1-5', async () => {
    try {
      const { sendInstructionReminderClient, sendInstructionReminderAdvisor, isNotifEnabled } = await import('./whatsappService');
      // Controlado por el toggle "Notificación de caja recibida" (Ajustes del Sistema).
      if (!(await isNotifEnabled('notif_caja_recibida'))) return;
      await pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS instruction_reminder_sent_at TIMESTAMPTZ`).catch(() => {});
      const r = await pool.query(`
        SELECT p.id, p.tracking_internal AS trn,
               u.full_name AS client_name, u.phone AS client_phone,
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
        ORDER BY p.received_at ASC
        LIMIT 300
      `);
      let sent = 0;
      for (const row of r.rows) {
        const trn = row.trn || '';
        const wantWa = row.notif_whatsapp !== false && (row.phone_verified === true || row.whatsapp_verified === true);
        if (row.client_phone && wantWa) {
          await sendInstructionReminderClient(row.client_phone, row.client_name || 'Cliente', trn).catch(() => {});
        }
        // El asesor siempre recibe el recordatorio de trabajo (si tiene teléfono).
        if (row.advisor_phone) {
          await sendInstructionReminderAdvisor(row.advisor_phone, row.advisor_name || 'Asesor', row.client_name || 'tu cliente', trn).catch(() => {});
        }
        await pool.query(`UPDATE packages SET instruction_reminder_sent_at = NOW() WHERE id = $1`, [row.id]).catch(() => {});
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

export const initCronJobs = () => {
  startRecoveryCronJob();
  startWaSequenceCron();
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
};

export default initCronJobs;
