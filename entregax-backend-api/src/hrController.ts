import { Request, Response } from 'express';
import { pool } from './db';

// ============================================
// CONSTANTES DE GEOCERCA
// ============================================
const CEDIS_LOCATIONS = {
  monterrey: { lat: 25.6866, lng: -100.3161, radius: 150 }
};

// Función para calcular distancia entre dos puntos GPS (en metros)
function getDistanceInMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Radio de la tierra en metros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ============================================
// AVISO DE PRIVACIDAD
// ============================================
export const getPrivacyNotice = async (_req: Request, res: Response): Promise<void> => {
  const privacyNotice = {
    title: "AVISO DE PRIVACIDAD INTEGRAL DE ENTREGAX",
    company: "Logística System Development S.A. de C.V.",
    address: "Revolución Sur 3866 B8, Torremolinos, Monterrey, Nuevo León, C.P. 64860",
    lastUpdate: "16 de Febrero de 2026",
    sections: [
      {
        title: "1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE",
        content: "Logística System Development S.A. de C.V. (en adelante \"EntregaX\"), con domicilio en Revolución Sur 3866 B8, Torremolinos, Monterrey, Nuevo León, C.P. 64860, es el responsable del uso y protección de sus datos personales."
      },
      {
        title: "2. DATOS PERSONALES QUE RECABAMOS",
        content: "De nuestros Empleados y Operadores: Nombre completo, domicilio, teléfono, estado civil, nombre del cónyuge, número de hijos, contacto de emergencia, tallas de uniforme, fotografías de identificación oficial (INE) y geolocalización en tiempo real (GPS) durante su jornada laboral."
      },
      {
        title: "3. FINALIDADES DEL TRATAMIENTO",
        content: "Alta en nuestro sistema de Recursos Humanos, control de asistencias (checador virtual), rastreo de ruta para seguridad de la flotilla y la carga, y contacto en caso de emergencia médica o vial."
      },
      {
        title: "4. USO DE TECNOLOGÍAS DE RASTREO (GPS)",
        content: "En nuestra aplicación móvil para Operadores y Choferes utilizamos tecnologías de rastreo (GPS) para monitorear la ubicación en tiempo real. Esta herramienta es de uso obligatorio durante la jornada laboral por políticas de seguridad de la carga y control de asistencia."
      },
      {
        title: "5. DERECHOS ARCO",
        content: "Usted tiene derecho a Acceso, Rectificación, Cancelación y Oposición de sus datos personales. Para ejercer estos derechos, envíe un correo a privacidad@entregax.com"
      }
    ],
    contactEmail: "privacidad@entregax.com"
  };

  res.json(privacyNotice);
};

// ============================================
// ACEPTAR AVISO DE PRIVACIDAD (EMPLEADOS)
// ============================================
export const acceptPrivacyNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const clientIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    await pool.query(`
      UPDATE users 
      SET privacy_accepted_at = NOW(), 
          privacy_accepted_ip = $1
      WHERE id = $2
    `, [clientIP, user.userId]);

    res.json({ 
      success: true, 
      message: 'Aviso de privacidad aceptado correctamente',
      acceptedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al aceptar aviso de privacidad:', error);
    res.status(500).json({ error: 'Error al registrar aceptación' });
  }
};

// ============================================
// GUARDAR DATOS DE ONBOARDING (WIZARD)
// ============================================
export const saveEmployeeOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    console.log('📋 [HR] Onboarding recibido para usuario:', user.userId);
    console.log('📋 [HR] Campos recibidos:', Object.keys(req.body));
    
    const {
      address,
      phone,
      emergencyContact,
      pantsSize,
      shirtSize,
      shoeSize,
      maritalStatus,
      spouseName,
      childrenCount,
      ineFrontUrl,
      ineBackUrl,
      profilePhotoUrl,
      driverLicenseFrontUrl,
      driverLicenseBackUrl,
      driverLicenseExpiry
    } = req.body;

    await pool.query(`
      UPDATE users SET
        address = COALESCE($1, address),
        phone = COALESCE($2, phone),
        emergency_contact = $3,
        pants_size = $4,
        shirt_size = $5,
        shoe_size = $6,
        marital_status = $7,
        spouse_name = $8,
        children_count = $9,
        ine_front_url = COALESCE($10, ine_front_url),
        ine_back_url = COALESCE($11, ine_back_url),
        profile_photo_url = COALESCE($12, profile_photo_url),
        driver_license_front_url = COALESCE($13, driver_license_front_url),
        driver_license_back_url = COALESCE($14, driver_license_back_url),
        driver_license_expiry = COALESCE($15, driver_license_expiry),
        is_employee_onboarded = TRUE,
        hire_date = COALESCE(hire_date, CURRENT_DATE)
      WHERE id = $16
    `, [
      address, phone, emergencyContact, pantsSize, shirtSize, shoeSize,
      maritalStatus, spouseName, childrenCount || 0,
      ineFrontUrl, ineBackUrl, profilePhotoUrl,
      driverLicenseFrontUrl, driverLicenseBackUrl, driverLicenseExpiry,
      user.userId
    ]);

    res.json({ 
      success: true, 
      message: '¡Alta de empleado completada exitosamente!'
    });
  } catch (error: any) {
    console.error('❌ Error en onboarding de empleado:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({ error: 'Error al guardar datos del empleado', details: error.message });
  }
};

// ============================================
// CHECK-IN (ENTRADA) CON GEOCERCA
// ============================================
export const checkIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { lat, lng, address } = req.body;
    const userRole = user.role;

    // Verificar geocerca para roles de bodega/mostrador
    if (['warehouse_ops', 'counter_staff'].includes(userRole)) {
      // Obtener ubicaciones de trabajo activas
      const locations = await pool.query('SELECT * FROM work_locations WHERE is_active = TRUE');
      
      let withinGeofence = false;
      for (const loc of locations.rows) {
        const distance = getDistanceInMeters(loc.lat, loc.lng, lat, lng);
        if (distance <= loc.radius_meters) {
          withinGeofence = true;
          break;
        }
      }

      if (!withinGeofence) {
        res.status(403).json({ 
          error: 'Ubicación no válida',
          message: 'Estás demasiado lejos del CEDIS para registrar tu entrada. Acércate a menos de 150 metros.'
        });
        return;
      }
    }

    // Verificar si ya tiene check-in hoy
    const existing = await pool.query(
      'SELECT id, check_in_time FROM attendance_logs WHERE user_id = $1 AND date = CURRENT_DATE',
      [user.userId]
    );

    if (existing.rows.length > 0 && existing.rows[0].check_in_time) {
      res.status(400).json({ 
        error: 'Ya registraste entrada',
        message: `Tu entrada fue registrada a las ${new Date(existing.rows[0].check_in_time).toLocaleTimeString('es-MX')}`
      });
      return;
    }

    // Determinar si llegó tarde (después de las 9:00 AM)
    const now = new Date();
    const hour = now.getHours();
    const status = hour >= 9 ? 'late' : 'present';

    // Registrar o actualizar asistencia
    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE attendance_logs SET
          check_in_time = NOW(),
          check_in_lat = $1,
          check_in_lng = $2,
          check_in_address = $3,
          status = $4
        WHERE id = $5
      `, [lat, lng, address, status, existing.rows[0].id]);
    } else {
      await pool.query(`
        INSERT INTO attendance_logs (user_id, check_in_time, check_in_lat, check_in_lng, check_in_address, status)
        VALUES ($1, NOW(), $2, $3, $4, $5)
      `, [user.userId, lat, lng, address, status]);
    }

    res.json({ 
      success: true, 
      message: status === 'late' ? '⚠️ Entrada registrada (con retardo)' : '✅ ¡Entrada registrada correctamente!',
      status,
      time: now.toLocaleTimeString('es-MX')
    });
  } catch (error) {
    console.error('Error en check-in:', error);
    res.status(500).json({ error: 'Error al registrar entrada' });
  }
};

// ============================================
// CHECK-OUT (SALIDA)
// ============================================
export const checkOut = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { lat, lng, address } = req.body;

    // Verificar que tenga check-in hoy
    const existing = await pool.query(
      'SELECT id, check_in_time, check_out_time FROM attendance_logs WHERE user_id = $1 AND date = CURRENT_DATE',
      [user.userId]
    );

    if (existing.rows.length === 0 || !existing.rows[0].check_in_time) {
      res.status(400).json({ 
        error: 'Sin entrada registrada',
        message: 'No puedes registrar salida sin haber marcado entrada primero.'
      });
      return;
    }

    if (existing.rows[0].check_out_time) {
      res.status(400).json({ 
        error: 'Ya registraste salida',
        message: `Tu salida fue registrada a las ${new Date(existing.rows[0].check_out_time).toLocaleTimeString('es-MX')}`
      });
      return;
    }

    await pool.query(`
      UPDATE attendance_logs SET
        check_out_time = NOW(),
        check_out_lat = $1,
        check_out_lng = $2,
        check_out_address = $3
      WHERE id = $4
    `, [lat, lng, address, existing.rows[0].id]);

    const now = new Date();
    res.json({ 
      success: true, 
      message: '✅ ¡Salida registrada! Buen trabajo hoy.',
      time: now.toLocaleTimeString('es-MX')
    });
  } catch (error) {
    console.error('Error en check-out:', error);
    res.status(500).json({ error: 'Error al registrar salida' });
  }
};

// ============================================
// OBTENER MI ASISTENCIA DE HOY
// ============================================
export const getMyAttendanceToday = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;

    const result = await pool.query(`
      SELECT * FROM attendance_logs 
      WHERE user_id = $1 AND date = CURRENT_DATE
    `, [user.userId]);

    res.json(result.rows[0] || { 
      checkedIn: false, 
      checkedOut: false,
      message: 'Aún no has registrado asistencia hoy'
    });
  } catch (error) {
    console.error('Error obteniendo asistencia:', error);
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
};

// ============================================
// REGISTRAR UBICACIÓN GPS (CHOFERES EN RUTA)
// ============================================
export const trackGPSLocation = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { lat, lng, speed, heading, batteryLevel } = req.body;

    await pool.query(`
      INSERT INTO gps_tracking (user_id, lat, lng, speed, heading, battery_level)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [user.userId, lat, lng, speed, heading, batteryLevel]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error registrando GPS:', error);
    res.status(500).json({ error: 'Error al registrar ubicación' });
  }
};

// ============================================
// ADMIN: OBTENER TODOS LOS EMPLEADOS CON ASISTENCIA
// ============================================
export const getEmployeesWithAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.query;
    const targetDate = date || 'CURRENT_DATE';

    const result = await pool.query(`
      SELECT 
        u.id, u.full_name, u.email, u.phone, u.role, u.box_id,
        u.is_employee_onboarded, u.pants_size, u.shirt_size, u.shoe_size,
        u.emergency_contact, u.marital_status, u.spouse_name, u.children_count,
        u.hire_date, u.employee_number,
        u.ine_front_url, u.ine_back_url, u.profile_photo_url,
        u.driver_license_front_url, u.driver_license_back_url, u.driver_license_expiry,
        u.privacy_accepted_at,
        a.check_in_time, a.check_out_time, a.status as attendance_status,
        a.check_in_address, a.check_out_address
      FROM users u
      LEFT JOIN attendance_logs a ON u.id = a.user_id AND a.date = ${date ? '$1' : 'CURRENT_DATE'}
      WHERE u.role IN ('warehouse_ops', 'counter_staff', 'repartidor', 'customer_service', 'branch_manager')
      ORDER BY u.role, u.full_name
    `, date ? [date] : []);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo empleados:', error);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
};

// ============================================
// ADMIN: OBTENER DETALLE DE UN EMPLEADO
// ============================================
export const getEmployeeDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const employee = await pool.query(`
      SELECT 
        u.*,
        (SELECT COUNT(*) FROM attendance_logs WHERE user_id = u.id AND status = 'present') as days_present,
        (SELECT COUNT(*) FROM attendance_logs WHERE user_id = u.id AND status = 'late') as days_late,
        (SELECT COUNT(*) FROM attendance_logs WHERE user_id = u.id AND status = 'absent') as days_absent
      FROM users u
      WHERE u.id = $1
    `, [id]);

    if (employee.rows.length === 0) {
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }

    // Obtener últimas 30 asistencias
    const attendance = await pool.query(`
      SELECT * FROM attendance_logs 
      WHERE user_id = $1 
      ORDER BY date DESC 
      LIMIT 30
    `, [id]);

    // Obtener última ubicación GPS (si es chofer)
    const lastGPS = await pool.query(`
      SELECT * FROM gps_tracking 
      WHERE user_id = $1 
      ORDER BY recorded_at DESC 
      LIMIT 1
    `, [id]);

    res.json({
      ...employee.rows[0],
      recentAttendance: attendance.rows,
      lastLocation: lastGPS.rows[0] || null
    });
  } catch (error) {
    console.error('Error obteniendo detalle de empleado:', error);
    res.status(500).json({ error: 'Error al obtener detalle' });
  }
};

// ============================================
// ADMIN: HISTORIAL DE ASISTENCIAS
// ============================================
export const getAttendanceHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, userId } = req.query;

    let query = `
      SELECT 
        a.*,
        u.full_name, u.role, u.email
      FROM attendance_logs a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      params.push(startDate);
      query += ` AND a.date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND a.date <= $${params.length}`;
    }
    if (userId) {
      params.push(userId);
      query += ` AND a.user_id = $${params.length}`;
    }

    query += ' ORDER BY a.date DESC, a.check_in_time DESC LIMIT 500';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

// ============================================
// ADMIN: UBICACIÓN EN TIEMPO REAL DE CHOFERES
// ============================================
export const getDriversLiveLocation = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (g.user_id)
        g.user_id, g.lat, g.lng, g.speed, g.heading, g.battery_level, g.recorded_at,
        u.full_name, u.phone
      FROM gps_tracking g
      JOIN users u ON g.user_id = u.id
      WHERE u.role = 'repartidor'
        AND g.recorded_at > NOW() - INTERVAL '15 minutes'
      ORDER BY g.user_id, g.recorded_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ubicación de choferes:', error);
    res.status(500).json({ error: 'Error al obtener ubicaciones' });
  }
};

// ============================================
// ADMIN: ESTADÍSTICAS DE ASISTENCIA
// ============================================
export const getAttendanceStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { month, year } = req.query;
    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) as total_employees,
        COUNT(*) FILTER (WHERE status = 'present') as total_present,
        COUNT(*) FILTER (WHERE status = 'late') as total_late,
        COUNT(*) FILTER (WHERE status = 'absent') as total_absent,
        ROUND(AVG(EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 3600)::numeric, 2) as avg_hours_worked
      FROM attendance_logs
      WHERE EXTRACT(MONTH FROM date) = $1
        AND EXTRACT(YEAR FROM date) = $2
    `, [targetMonth, targetYear]);

    // Por rol
    const byRole = await pool.query(`
      SELECT 
        u.role,
        COUNT(DISTINCT a.user_id) as employees,
        COUNT(*) FILTER (WHERE a.status = 'present') as present,
        COUNT(*) FILTER (WHERE a.status = 'late') as late
      FROM attendance_logs a
      JOIN users u ON a.user_id = u.id
      WHERE EXTRACT(MONTH FROM a.date) = $1
        AND EXTRACT(YEAR FROM a.date) = $2
      GROUP BY u.role
    `, [targetMonth, targetYear]);

    res.json({
      summary: stats.rows[0],
      byRole: byRole.rows,
      period: { month: targetMonth, year: targetYear }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// ============================================
// ADMIN: GESTIÓN DE UBICACIONES DE TRABAJO
// ============================================
export const getWorkLocations = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM work_locations ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ubicaciones:', error);
    res.status(500).json({ error: 'Error al obtener ubicaciones' });
  }
};

export const createWorkLocation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, address, lat, lng, radiusMeters } = req.body;

    const result = await pool.query(`
      INSERT INTO work_locations (name, address, lat, lng, radius_meters)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, address, lat, lng, radiusMeters || 100]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creando ubicación:', error);
    res.status(500).json({ error: 'Error al crear ubicación' });
  }
};

// ============================================
// CREAR NUEVO EMPLEADO (ADMIN)
// ============================================
import bcrypt from 'bcrypt';

// Contraseña por defecto para nuevos empleados
const DEFAULT_PASSWORD = 'Entregax123';

// Generar número de empleado consecutivo
async function generateEmployeeNumber(): Promise<string> {
  const result = await pool.query(`
    SELECT MAX(CAST(SUBSTRING(employee_number FROM 4) AS INTEGER)) as max_num
    FROM users
    WHERE employee_number LIKE 'EMP%'
  `);
  const maxNum = result.rows[0].max_num || 0;
  return `EMP${String(maxNum + 1).padStart(4, '0')}`;
}

export const createEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      fullName, 
      email, 
      phone, 
      role, 
      emergencyContact,
      pantsSize,
      shirtSize
    } = req.body;

    // Validaciones
    if (!fullName || !email || !role) {
      res.status(400).json({ error: 'Nombre, email y rol son requeridos' });
      return;
    }

    // Validar rol permitido para empleados
    const allowedRoles = ['repartidor', 'warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager'];
    if (!allowedRoles.includes(role)) {
      res.status(400).json({ error: 'Rol no válido para empleado' });
      return;
    }

    // Verificar si el email ya existe
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      res.status(400).json({ error: 'Ya existe un usuario con este email' });
      return;
    }

    // Encriptar contraseña por defecto
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Generar número de empleado
    const employeeNumber = await generateEmployeeNumber();

    // Para empleados, usar el número de empleado como box_id
    const boxId = employeeNumber;

    // Crear el empleado
    const result = await pool.query(`
      INSERT INTO users (
        full_name, 
        email, 
        password, 
        phone, 
        role,
        box_id,
        employee_number,
        emergency_contact,
        pants_size,
        shirt_size,
        must_change_password,
        hire_date,
        is_employee_onboarded
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, CURRENT_DATE, FALSE)
      RETURNING id, full_name, email, phone, role, employee_number, hire_date
    `, [fullName, email, hashedPassword, phone, role, boxId, employeeNumber, emergencyContact, pantsSize, shirtSize]);

    const newEmployee = result.rows[0];

    res.status(201).json({
      success: true,
      message: `Empleado ${fullName} creado exitosamente`,
      employee: {
        id: newEmployee.id,
        fullName: newEmployee.full_name,
        email: newEmployee.email,
        phone: newEmployee.phone,
        role: newEmployee.role,
        employeeNumber: newEmployee.employee_number,
        hireDate: newEmployee.hire_date,
        tempPassword: 'Entregax123' // Se mostrará una sola vez
      }
    });
  } catch (error) {
    console.error('Error creando empleado:', error);
    res.status(500).json({ error: 'Error al crear empleado' });
  }
};

// ============================================
// ACTUALIZAR EMPLEADO (ADMIN)
// ============================================
export const updateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
      fullName, 
      phone, 
      role, 
      emergencyContact,
      pantsSize,
      shirtSize
    } = req.body;

    // Validar rol permitido
    const allowedRoles = ['repartidor', 'warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager'];
    if (role && !allowedRoles.includes(role)) {
      res.status(400).json({ error: 'Rol no válido para empleado' });
      return;
    }

    const result = await pool.query(`
      UPDATE users SET
        full_name = COALESCE($1, full_name),
        phone = COALESCE($2, phone),
        role = COALESCE($3, role),
        emergency_contact = COALESCE($4, emergency_contact),
        pants_size = COALESCE($5, pants_size),
        shirt_size = COALESCE($6, shirt_size)
      WHERE id = $7
      RETURNING id, full_name, email, phone, role, employee_number
    `, [fullName, phone, role, emergencyContact, pantsSize, shirtSize, id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }

    res.json({
      success: true,
      message: 'Empleado actualizado exitosamente',
      employee: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizando empleado:', error);
    res.status(500).json({ error: 'Error al actualizar empleado' });
  }
};

// ============================================
// ELIMINAR EMPLEADO (SOFT DELETE)
// ============================================
export const deleteEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // En lugar de borrar, desactivamos
    const result = await pool.query(`
      UPDATE users SET
        is_active = FALSE,
        deleted_at = NOW()
      WHERE id = $1 AND role IN ('repartidor', 'warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager')
      RETURNING id, full_name
    `, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Empleado no encontrado o no se puede eliminar' });
      return;
    }

    res.json({
      success: true,
      message: `Empleado ${result.rows[0].full_name} dado de baja`
    });
  } catch (error) {
    console.error('Error eliminando empleado:', error);
    res.status(500).json({ error: 'Error al eliminar empleado' });
  }
};

// ============================================
// VERIFICAR SI EMPLEADO REQUIERE ONBOARDING
// ============================================
export const checkOnboardingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;

    const result = await pool.query(`
      SELECT 
        is_employee_onboarded,
        privacy_accepted_at,
        role
      FROM users 
      WHERE id = $1
    `, [user.userId]);

    const userData = result.rows[0];
    
    // Solo roles de empleados requieren onboarding
    const employeeRoles = ['warehouse_ops', 'counter_staff', 'repartidor', 'customer_service', 'branch_manager'];
    const isEmployee = employeeRoles.includes(userData.role);

    res.json({
      requiresOnboarding: isEmployee && !userData.is_employee_onboarded,
      requiresPrivacyAcceptance: isEmployee && !userData.privacy_accepted_at,
      isEmployee,
      role: userData.role
    });
  } catch (error) {
    console.error('Error verificando onboarding:', error);
    res.status(500).json({ error: 'Error al verificar estado' });
  }
};
