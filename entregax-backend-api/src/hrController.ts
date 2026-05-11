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
// Ahora se sirve desde legal_documents (tipo "privacy_notice") para
// que sea editable desde el panel de Documentos Legales sin redeploy.
// Si la fila no existe (entorno fresco) usamos el fallback hardcoded.
// ============================================
const formatSpanishDate = (d: Date): string => {
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
};

const PRIVACY_FALLBACK = {
  title: "AVISO DE PRIVACIDAD INTEGRAL DE ENTREGAX",
  company: "Logística System Development S.A. de C.V.",
  address: "Revolución Sur 3866 B8, Torremolinos, Monterrey, Nuevo León, C.P. 64860",
  lastUpdate: "16 de Febrero de 2026",
  sections: [
    { title: "1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE", content: 'Logística System Development S.A. de C.V. (en adelante "EntregaX"), con domicilio en Revolución Sur 3866 B8, Torremolinos, Monterrey, Nuevo León, C.P. 64860, es el responsable del uso y protección de sus datos personales.' },
    { title: "2. DATOS PERSONALES QUE RECABAMOS", content: "De nuestros Empleados y Operadores: Nombre completo, domicilio, teléfono, estado civil, nombre del cónyuge, número de hijos, contacto de emergencia, tallas de uniforme, fotografías de identificación oficial (INE) y geolocalización en tiempo real (GPS) durante su jornada laboral." },
    { title: "3. FINALIDADES DEL TRATAMIENTO", content: "Alta en nuestro sistema de Recursos Humanos, control de asistencias (checador virtual), rastreo de ruta para seguridad de la flotilla y la carga, y contacto en caso de emergencia médica o vial." },
    { title: "4. USO DE TECNOLOGÍAS DE RASTREO (GPS)", content: "En nuestra aplicación móvil para Operadores y Choferes utilizamos tecnologías de rastreo (GPS) para monitorear la ubicación en tiempo real. Esta herramienta es de uso obligatorio durante la jornada laboral por políticas de seguridad de la carga y control de asistencia." },
    { title: "5. DERECHOS ARCO", content: "Usted tiene derecho a Acceso, Rectificación, Cancelación y Oposición de sus datos personales. Para ejercer estos derechos, envíe un correo a aldocampos@entregax.com" },
  ],
  contactEmail: "aldocampos@entregax.com",
};

export const ADVISOR_FALLBACK = {
  title: "AVISO DE PRIVACIDAD Y TÉRMINOS DE COMISIONES PARA ASESORES COMERCIALES",
  company: "Logística System Development S.A. de C.V.",
  address: "Revolución Sur 3866 B8, Torremolinos, Monterrey, Nuevo León, C.P. 64860",
  lastUpdate: "25 de Marzo de 2026",
  sections: [
    { title: "1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE", content: 'Logística System Development S.A. de C.V. (en adelante "EntregaX"), con domicilio en Revolución Sur 3866 B8, Torremolinos, Monterrey, Nuevo León, C.P. 64860, es el responsable del uso y protección de sus datos personales.' },
    { title: "2. DATOS PERSONALES QUE RECABAMOS", content: "De nuestros Asesores Comerciales recabamos: Nombre completo, domicilio, teléfono, correo electrónico, datos bancarios para pago de comisiones, información fiscal (RFC y Constancia de Situación Fiscal) y fotografía de identificación oficial (INE)." },
    { title: "3. DERECHOS ARCO", content: "Usted tiene derecho a Acceso, Rectificación, Cancelación y Oposición de sus datos personales. Para ejercer estos derechos, envíe un correo a aldocampos@entregax.com" },
  ],
  contactEmail: "aldocampos@entregax.com",
};

// Parser ligero: convierte el campo content (texto plano con secciones
// numeradas estilo "1. TÍTULO\n\ncuerpo...\n\n2. TÍTULO\n\ncuerpo...")
// en el array {title, content} que el frontend espera. Si no detecta
// secciones, devuelve un solo bloque con todo el texto.
function parseSectionsFromContent(text: string): Array<{ title: string; content: string }> {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  // Detecta líneas como "1. ALGO" o "PRIMERA PARTE: ALGO" como inicios de sección.
  const headerRegex = /^(?:\s*)(\d+\.\s+[^\n]+|[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ]{3,}:?\s*)$/gm;
  const indices: Array<{ idx: number; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(trimmed)) !== null) {
    indices.push({ idx: m.index, title: m[0]!.trim() });
  }
  if (indices.length < 2) {
    return [{ title: '', content: trimmed }];
  }
  const sections: Array<{ title: string; content: string }> = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i]!.idx + indices[i]!.title.length;
    const end = i + 1 < indices.length ? indices[i + 1]!.idx : trimmed.length;
    sections.push({ title: indices[i]!.title.replace(/:$/, ''), content: trimmed.slice(start, end).trim() });
  }
  return sections;
}

export async function getEditableLegalDoc(documentType: string, fallback: typeof PRIVACY_FALLBACK) {
  try {
    const r = await pool.query(
      `SELECT title, content, version, updated_at FROM legal_documents WHERE document_type = $1 AND is_active = TRUE LIMIT 1`,
      [documentType]
    );
    if (r.rows.length === 0) return fallback;
    const row = r.rows[0];
    const sections = parseSectionsFromContent(row.content);
    const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date();
    return {
      title: row.title || fallback.title,
      company: fallback.company,
      address: fallback.address,
      lastUpdate: formatSpanishDate(updatedAt),
      version: row.version,
      content: row.content, // bloque completo por si el cliente prefiere no usar sections
      sections,
      contactEmail: fallback.contactEmail,
    };
  } catch (e) {
    return fallback;
  }
}

export const getPrivacyNotice = async (_req: Request, res: Response): Promise<void> => {
  const data = await getEditableLegalDoc('privacy_notice', PRIVACY_FALLBACK);
  res.json(data);
};

// ============================================
// AVISO DE PRIVACIDAD PARA ASESORES
// (Sin requerimiento de ubicación/GPS)
// ============================================
export const getAdvisorPrivacyNotice = async (_req: Request, res: Response): Promise<void> => {
  const data = await getEditableLegalDoc('advisor_privacy_notice', ADVISOR_FALLBACK);
  res.json(data);
};

// ============================================
// ACEPTAR AVISO DE PRIVACIDAD (ASESORES)
// Acepta firma digital (data URI base64 PNG) en req.body.signature.
// La firma se guarda en signature_url para tener evidencia de la
// aceptación con biometría manuscrita ligera.
// ============================================
export const acceptAdvisorPrivacyNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const clientIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const { signature } = req.body || {};

    // Asegurar columna privacy_signature_url (idempotente, una sola vez)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_signature_url TEXT`).catch(() => {});

    if (signature) {
      await pool.query(`
        UPDATE users
        SET privacy_accepted_at = NOW(),
            privacy_accepted_ip = $1,
            privacy_signature_url = $2
        WHERE id = $3
      `, [clientIP, signature, user.userId]);
    } else {
      // Compat: si no llega firma (clientes viejos), dejamos que el
      // frontend nuevo siempre la mande. Por ahora aceptamos sin firma
      // pero registramos warning en logs.
      console.warn(`[ACCEPT-ADVISOR] usuario ${user.userId} aceptó SIN firma digital`);
      await pool.query(`
        UPDATE users
        SET privacy_accepted_at = NOW(),
            privacy_accepted_ip = $1
        WHERE id = $2
      `, [clientIP, user.userId]);
    }

    res.json({
      success: true,
      message: 'Aviso de privacidad y términos de comisiones aceptados correctamente',
      acceptedAt: new Date().toISOString(),
      hasSignature: !!signature,
    });
  } catch (error) {
    console.error('Error al aceptar aviso de privacidad (asesor):', error);
    res.status(500).json({ error: 'Error al registrar aceptación' });
  }
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

    // Normalizar fecha: aceptar DD/MM/YYYY, DD/MM/YY o YYYY-MM-DD
    let normalizedExpiry: string | null = null;
    if (driverLicenseExpiry && typeof driverLicenseExpiry === 'string') {
      const v = driverLicenseExpiry.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        normalizedExpiry = v;
      } else if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(v)) {
        const parts = v.split('/');
        const dd = parts[0] || '';
        const mm = parts[1] || '';
        const yy = parts[2] || '';
        const yyyy = yy.length === 2 ? `20${yy}` : yy;
        if (dd && mm && yyyy) {
          normalizedExpiry = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }
      }
    }

    // Actualizar datos del empleado y poner en estado PENDIENTE DE VERIFICACIÓN
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
        selfie_url = COALESCE($12, selfie_url),
        driver_license_front_url = COALESCE($13, driver_license_front_url),
        driver_license_back_url = COALESCE($14, driver_license_back_url),
        driver_license_expiry = COALESCE($15, driver_license_expiry),
        is_employee_onboarded = TRUE,
        hire_date = COALESCE(hire_date, CURRENT_DATE),
        verification_status = 'pending_review',
        verification_submitted_at = NOW()
      WHERE id = $16
    `, [
      address, phone, emergencyContact, pantsSize, shirtSize, shoeSize,
      maritalStatus, spouseName, childrenCount || 0,
      ineFrontUrl, ineBackUrl, profilePhotoUrl,
      driverLicenseFrontUrl, driverLicenseBackUrl, normalizedExpiry,
      user.userId
    ]);

    console.log('✅ [HR] Empleado registrado - Pendiente de verificación');

    // 📢 Notificar a Directores/Admins/Super Admins que hay un empleado pendiente de verificación
    try {
      const employeeInfo = await pool.query(
        'SELECT full_name, role, email FROM users WHERE id = $1',
        [user.userId]
      );
      const emp = employeeInfo.rows[0];
      const recipients = await pool.query(
        `SELECT id FROM users WHERE role IN ('director', 'admin', 'super_admin')`
      );
      const { createCustomNotification } = await import('./notificationController');
      for (const r of recipients.rows) {
        await createCustomNotification(
          r.id,
          '📝 Nuevo empleado pendiente de verificación',
          `${emp?.full_name || 'Empleado'} (${emp?.role || ''}) completó su alta y está esperando aprobación.`,
          'warning',
          'account-clock',
          { employeeId: user.userId, role: emp?.role, email: emp?.email },
          '/admin/verifications'
        );
      }
    } catch (notifyErr) {
      console.warn('No se pudo notificar a directores sobre verificación pendiente:', notifyErr);
    }

    res.json({ 
      success: true, 
      message: '¡Documentos enviados! Tu alta está pendiente de verificación por un administrador.',
      status: 'pending_review'
    });
  } catch (error: any) {
    console.error('❌ Error en onboarding de empleado:', error);
    console.error('❌ Stack:', error.stack);
    // Devolver 400 con detalle para que NO sea sanitizado por el middleware de producción
    res.status(400).json({ 
      error: 'No se pudieron guardar los datos',
      details: error.message,
      code: error.code,
      column: error.column,
      constraint: error.constraint,
      table: error.table
    });
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
    const { date, include_inactive } = req.query;
    const showInactive = String(include_inactive || '').toLowerCase() === 'true' || include_inactive === '1';

    // Asegurar columnas (idempotente)
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL
    `);

    // Consulta optimizada - solo datos básicos de usuarios primero
    // 🚀 Excluimos profile_photo_url (puede ser base64 enorme; ralentiza la lista).
    //     Si se necesita la foto, se carga vía /api/admin/hr/employees/:id (detalle).
    const result = await pool.query(`
      SELECT 
        u.id, u.full_name, u.email, u.phone, u.role, u.box_id,
        u.is_employee_onboarded, u.pants_size, u.shirt_size, u.shoe_size,
        u.emergency_contact, u.hire_date, u.employee_number,
        COALESCE(u.is_active, TRUE) AS is_active,
        COALESCE(u.is_blocked, FALSE) AS is_blocked,
        u.block_reason, u.blocked_at, u.deleted_at,
        CASE 
          WHEN u.profile_photo_url IS NOT NULL AND LENGTH(u.profile_photo_url) < 500 THEN u.profile_photo_url 
          ELSE NULL 
        END AS profile_photo_url,
        u.privacy_accepted_at,
        CASE WHEN u.privacy_signature_url IS NOT NULL THEN TRUE ELSE FALSE END AS has_privacy_signature
      FROM users u
      WHERE u.role IN ('warehouse_ops', 'counter_staff', 'repartidor', 'customer_service', 'branch_manager', 'monitoreo', 'accountant', 'contador', 'operaciones', 'director', 'advisor', 'asesor', 'asesor_lider', 'sub_advisor')
        ${showInactive ? '' : 'AND COALESCE(u.is_active, TRUE) = TRUE AND COALESCE(u.is_blocked, FALSE) = FALSE'}
      ORDER BY u.role, u.full_name
    `);

    // Si no hay empleados, retornar vacío rápido
    if (result.rows.length === 0) {
      res.json([]);
      return;
    }

    // Obtener asistencias solo si hay empleados (consulta separada más rápida)
    let attendanceMap: Record<number, any> = {};
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      const attendanceResult = await pool.query(`
        SELECT user_id, check_in_time, check_out_time, status as attendance_status,
               check_in_address, check_out_address
        FROM attendance_logs 
        WHERE date = $1
      `, [targetDate]);
      
      attendanceResult.rows.forEach((a: any) => {
        attendanceMap[a.user_id] = a;
      });
    } catch (e) {
      // Si falla la consulta de asistencias, continuar sin ellas
      console.log('Asistencias no disponibles');
    }

    // Combinar datos
    const employees = result.rows.map((u: any) => ({
      ...u,
      check_in_time: attendanceMap[u.id]?.check_in_time || null,
      check_out_time: attendanceMap[u.id]?.check_out_time || null,
      attendance_status: attendanceMap[u.id]?.attendance_status || null,
      check_in_address: attendanceMap[u.id]?.check_in_address || null,
      check_out_address: attendanceMap[u.id]?.check_out_address || null,
    }));

    // ============================================
    // Expediente: completo / incompleto
    // ============================================
    // Reglas:
    //  • Datos básicos llenos: phone, hire_date, employee_number, emergency_contact
    //  • Docs obligatorios SIEMPRE: ine_front, ine_back, contract, comprobante_domicilio
    //  • Si tiene IMSS (NSS o alta IMSS o status='activo'): + nss_constancia, aviso_alta_imss
    //  • NO obligatorios: rfc, curp
    const userIds = employees.map(e => e.id);
    let docsByUser: Record<number, Set<string>> = {};
    let payrollByUser: Record<number, any> = {};
    if (userIds.length > 0) {
      try {
        const dq = await pool.query(
          `SELECT user_id, doc_type FROM employee_documents WHERE user_id = ANY($1::int[])`,
          [userIds]
        );
        dq.rows.forEach((r: any) => {
          (docsByUser[r.user_id] = docsByUser[r.user_id] || new Set()).add(r.doc_type);
        });
      } catch { /* tabla quizá aún no creada */ }
      try {
        const pq = await pool.query(
          `SELECT user_id, nss, imss_status, imss_alta_date
             FROM employee_payroll_info WHERE user_id = ANY($1::int[])`,
          [userIds]
        );
        pq.rows.forEach((r: any) => { payrollByUser[r.user_id] = r; });
      } catch { /* tabla quizá aún no creada */ }
    }

    const isFilled = (v: any) => v !== null && v !== undefined && String(v).trim() !== '';
    const ADVISOR_ROLES = new Set(['advisor', 'asesor', 'asesor_lider', 'sub_advisor']);

    const employeesWithCompleteness = employees.map((e: any) => {
      const docs = docsByUser[e.id] || new Set<string>();
      const isAdvisor = ADVISOR_ROLES.has(String(e.role || '').toLowerCase());
      const missing: string[] = [];

      if (isAdvisor) {
        // ASESORES: reglas más cortas (sin IMSS, sin contacto emergencia)
        if (!isFilled(e.phone)) missing.push('Teléfono');
        if (!isFilled(e.full_name)) missing.push('Nombre completo');
        if (!docs.has('ine_front')) missing.push('INE Anverso');
        if (!docs.has('ine_back')) missing.push('INE Reverso');
        if (!docs.has('contract')) {
          // Si firmó privacy notice, el contrato se puede auto-generar
          missing.push(e.has_privacy_signature
            ? 'Contrato firmado (generar PDF)'
            : 'Contrato laboral (pendiente de firma)');
        }
        if (!docs.has('rfc')) missing.push('RFC / Constancia Fiscal');

        return {
          ...e,
          is_advisor: true,
          expediente_completo: missing.length === 0,
          expediente_faltantes: missing,
          expediente_imss_aplica: false,
        };
      }

      // EMPLEADOS INTERNOS
      const p = payrollByUser[e.id] || null;
      const hasImss = !!(p && (
        isFilled(p.nss) || isFilled(p.imss_alta_date) ||
        (p.imss_status && p.imss_status !== 'pendiente' && p.imss_status !== '')
      ));

      // Datos básicos
      if (!isFilled(e.phone)) missing.push('Teléfono');
      if (!isFilled(e.hire_date)) missing.push('Fecha de ingreso');
      if (!isFilled(e.employee_number)) missing.push('Número de empleado');
      if (!isFilled(e.emergency_contact)) missing.push('Contacto de emergencia');

      // Documentos siempre obligatorios
      if (!docs.has('ine_front')) missing.push('INE Anverso');
      if (!docs.has('ine_back')) missing.push('INE Reverso');
      if (!docs.has('contract')) missing.push('Contrato laboral');
      if (!docs.has('comprobante_domicilio')) missing.push('Comprobante de domicilio');

      // Si está dado de alta en IMSS: NSS + Aviso de alta
      if (hasImss) {
        if (!docs.has('nss_constancia')) missing.push('Constancia NSS');
        if (!docs.has('aviso_alta_imss')) missing.push('Aviso Alta IMSS');
      }

      return {
        ...e,
        is_advisor: false,
        expediente_completo: missing.length === 0,
        expediente_faltantes: missing,
        expediente_imss_aplica: hasImss,
      };
    });

    res.json(employeesWithCompleteness);
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

    // Consulta básica del empleado sin subconsultas a tablas que podrían no existir
    const employee = await pool.query(`
      SELECT u.*
      FROM users u
      WHERE u.id = $1
    `, [id]);

    if (employee.rows.length === 0) {
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }

    // Estadísticas de asistencia (con try/catch por si la tabla no existe)
    let days_present = 0, days_late = 0, days_absent = 0;
    try {
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'present') as days_present,
          COUNT(*) FILTER (WHERE status = 'late') as days_late,
          COUNT(*) FILTER (WHERE status = 'absent') as days_absent
        FROM attendance_logs WHERE user_id = $1
      `, [id]);
      if (statsResult.rows[0]) {
        days_present = parseInt(statsResult.rows[0].days_present) || 0;
        days_late = parseInt(statsResult.rows[0].days_late) || 0;
        days_absent = parseInt(statsResult.rows[0].days_absent) || 0;
      }
    } catch (e) {
      console.log('Estadísticas de asistencia no disponibles');
    }

    // Obtener últimas 30 asistencias
    let attendance = { rows: [] as any[] };
    try {
      attendance = await pool.query(`
        SELECT * FROM attendance_logs 
        WHERE user_id = $1 
        ORDER BY date DESC 
        LIMIT 30
      `, [id]);
    } catch (e) {
      console.log('Tabla attendance_logs no disponible');
    }

    // Obtener última ubicación GPS (si es chofer) - solo si la tabla existe
    let lastGPS = { rows: [] as any[] };
    try {
      lastGPS = await pool.query(`
        SELECT * FROM gps_tracking 
        WHERE user_id = $1 
        ORDER BY recorded_at DESC 
        LIMIT 1
      `, [id]);
    } catch (e) {
      console.log('Tabla gps_tracking no disponible');
    }

    res.json({
      ...employee.rows[0],
      days_present,
      days_late,
      days_absent,
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
    // Si la tabla gps_tracking no existe, retornar array vacío
    res.json([]);
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

    // Una sola consulta combinada para obtener todo
    const result = await pool.query(`
      WITH stats AS (
        SELECT 
          COUNT(DISTINCT user_id) as total_employees,
          COUNT(*) FILTER (WHERE status = 'present') as total_present,
          COUNT(*) FILTER (WHERE status = 'late') as total_late,
          COUNT(*) FILTER (WHERE status = 'absent') as total_absent,
          COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 3600)::numeric, 2), 0) as avg_hours_worked
        FROM attendance_logs
        WHERE EXTRACT(MONTH FROM date) = $1
          AND EXTRACT(YEAR FROM date) = $2
      ),
      by_role AS (
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
      )
      SELECT 
        (SELECT row_to_json(stats) FROM stats) as summary,
        COALESCE((SELECT json_agg(by_role) FROM by_role), '[]'::json) as by_role
    `, [targetMonth, targetYear]);

    const data = result.rows[0];
    res.json({
      summary: data.summary || { total_employees: 0, total_present: 0, total_late: 0, total_absent: 0, avg_hours_worked: 0 },
      byRole: data.by_role || [],
      period: { month: targetMonth, year: targetYear }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    // Retornar datos vacíos en caso de error (tabla no existe, etc)
    res.json({
      summary: { total_employees: 0, total_present: 0, total_late: 0, total_absent: 0, avg_hours_worked: 0 },
      byRole: [],
      period: { month: req.query.month || new Date().getMonth() + 1, year: req.query.year || new Date().getFullYear() }
    });
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
    const allowedRoles = ['repartidor', 'warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager', 'monitoreo', 'accountant', 'contador', 'abogado', 'operaciones', 'director'];
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
    const allowedRoles = ['repartidor', 'warehouse_ops', 'counter_staff', 'customer_service', 'branch_manager', 'monitoreo', 'accountant', 'contador', 'abogado', 'operaciones', 'director'];
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

    // Asegurar columnas de soft-delete (idempotente)
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL
    `);

    // Soft-delete: desactivar y marcar fecha de baja
    const result = await pool.query(`
      UPDATE users SET
        is_active = FALSE,
        is_blocked = TRUE,
        block_reason = COALESCE(block_reason, 'Baja administrativa'),
        blocked_at = COALESCE(blocked_at, NOW()),
        deleted_at = NOW()
      WHERE id = $1
        AND role IN (
          'repartidor', 'warehouse_ops', 'counter_staff', 'customer_service',
          'branch_manager', 'monitoreo', 'accountant', 'contador',
          'operaciones', 'operations', 'abogado', 'sales', 'manager',
          'driver', 'support', 'director'
        )
      RETURNING id, full_name
    `, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Empleado no encontrado o no se puede dar de baja desde este panel' });
      return;
    }

    res.json({
      success: true,
      message: `Empleado ${result.rows[0].full_name} dado de baja`
    });
  } catch (error: any) {
    console.error('Error eliminando empleado:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Error al eliminar empleado' });
  }
};

// ============================================
// REACTIVAR EMPLEADO (revertir soft-delete)
// ============================================
export const reactivateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL
    `);
    const result = await pool.query(`
      UPDATE users SET
        is_active = TRUE,
        is_blocked = FALSE,
        block_reason = NULL,
        blocked_at = NULL,
        deleted_at = NULL
      WHERE id = $1
      RETURNING id, full_name
    `, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }
    res.json({ success: true, message: `Empleado ${result.rows[0].full_name} reactivado` });
  } catch (error: any) {
    console.error('Error reactivando empleado:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Error al reactivar empleado' });
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
    const employeeRoles = ['warehouse_ops', 'counter_staff', 'repartidor', 'monitoreo', 'customer_service', 'branch_manager'];
    const advisorRoles = ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'];
    const isEmployee = employeeRoles.includes(userData.role);
    const isAdvisor = advisorRoles.includes(userData.role);

    res.json({
      requiresOnboarding: isEmployee && !userData.is_employee_onboarded,
      requiresPrivacyAcceptance: (isEmployee || isAdvisor) && !userData.privacy_accepted_at,
      isEmployee,
      isAdvisor,
      role: userData.role
    });
  } catch (error) {
    console.error('Error verificando onboarding:', error);
    res.status(500).json({ error: 'Error al verificar estado' });
  }
};
