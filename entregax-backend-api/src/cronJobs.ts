import cron from 'node-cron';
import { pool } from './db';
import { syncOrdersFromChina, syncAllActiveTrackings } from './maritimeApiController';
import { blockOverdueAccounts, runCreditCollectionEngine } from './financeController';
import { checkExpiringDocuments, checkUpcomingMaintenance } from './fleetController';
import { actualizarCarteraVencida, sincronizarCartera } from './customerServiceController';
import { syncActiveMJCustomerOrders } from './chinaController';
import { runFacturapiSyncAll } from './facturapiController';

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
            INSERT INTO notifications (user_id, title, message, type, icon)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            driver.id,
            '⚠️ Cuenta Bloqueada - Licencia Vencida',
            'Tu cuenta ha sido bloqueada porque tu licencia de conducir está vencida. Por favor, renuévala y contacta a RH para actualizar tu expediente.',
            'error',
            'id-card'
          ]);
          
          // Notificar a admins
          const admins = await pool.query(`
            SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'branch_manager')
          `);
          
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

      // Alertar repartidores cuya licencia vencerá en 30 días
      const warningResult = await pool.query(`
        SELECT id, full_name, driver_license_expiry
        FROM users
        WHERE role = 'repartidor'
          AND driver_license_expiry IS NOT NULL
          AND driver_license_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
          AND (is_blocked = FALSE OR is_blocked IS NULL)
      `);

      if (warningResult.rows.length > 0) {
        console.log(`⚠️ [CRON] ${warningResult.rows.length} repartidores con licencia por vencer en 30 días`);
        
        for (const driver of warningResult.rows) {
          const daysLeft = Math.ceil((new Date(driver.driver_license_expiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          
          await pool.query(`
            INSERT INTO notifications (user_id, title, message, type, icon)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
          `, [
            driver.id,
            '⚠️ Licencia por Vencer',
            `Tu licencia de conducir vencerá en ${daysLeft} días. Por favor, renuévala para evitar que tu cuenta sea bloqueada.`,
            'warning',
            'id-card'
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
  // Ejecutar cada hora en el minuto 30
  cron.schedule('30 * * * *', async () => {
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

  console.log('📅 [CRON] Job de tipo de cambio programado cada hora (:30)');
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
  startDriverLicenseCheckCron();
  startExchangeRateCheckCron();
  startCarteraVencidaCron();
  startMJCustomerSyncCron();
  startFacturapiSyncCron();
  startAutoCheckoutCron();
};

export default initCronJobs;
