import { Request, Response } from 'express';
import { pool } from './db';

// ==================== VEHÍCULOS ====================

// Interface para el mapa de vehículos
interface VehicleRow {
  id: number;
  economic_number: string;
  vehicle_type: string;
  brand: string;
  model: string;
  year: number;
  vin_number: string;
  license_plates: string;
  color: string;
  fuel_type: string;
  current_mileage: number;
  status: string;
  assigned_driver_id: number | null;
  photo_url: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  expired_docs: number;
  expiring_soon_docs: number;
  next_service_km: number | null;
}

// Obtener todos los vehículos con su estado
export const getVehicles = async (req: Request, res: Response) => {
  try {
    const { status, type } = req.query;
    
    let query = `
      SELECT 
        v.*,
        u.full_name as driver_name,
        u.phone as driver_phone,
        (SELECT COUNT(*) FROM vehicle_documents vd WHERE vd.vehicle_id = v.id AND vd.expiration_date < CURRENT_DATE) as expired_docs,
        (SELECT COUNT(*) FROM vehicle_documents vd WHERE vd.vehicle_id = v.id AND vd.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_soon_docs,
        (SELECT vm.next_service_mileage FROM vehicle_maintenance vm WHERE vm.vehicle_id = v.id AND vm.next_service_mileage IS NOT NULL ORDER BY vm.service_date DESC LIMIT 1) as next_service_km
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_driver_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (status) {
      params.push(status);
      query += ` AND v.status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      query += ` AND v.vehicle_type = $${params.length}`;
    }
    
    query += ' ORDER BY v.economic_number ASC';
    
    const result = await pool.query(query, params);
    
    // Calcular estado de salud de cada vehículo
    const vehicles = result.rows.map((v: VehicleRow) => {
      let health_status = 'green';
      let health_issues: string[] = [];
      
      // Documentos vencidos = rojo
      if (v.expired_docs > 0) {
        health_status = 'red';
        health_issues.push(`${v.expired_docs} documento(s) vencido(s)`);
      }
      
      // En taller = amarillo
      if (v.status === 'in_shop') {
        health_status = health_status === 'red' ? 'red' : 'yellow';
        health_issues.push('En taller');
      }
      
      // Documentos por vencer = amarillo
      if (v.expiring_soon_docs > 0 && health_status !== 'red') {
        health_status = 'yellow';
        health_issues.push(`${v.expiring_soon_docs} documento(s) por vencer`);
      }
      
      // Servicio próximo
      if (v.next_service_km && v.current_mileage >= v.next_service_km - 1000) {
        health_status = health_status === 'red' ? 'red' : 'yellow';
        health_issues.push(`Servicio próximo (faltan ${v.next_service_km - v.current_mileage} km)`);
      }
      
      return {
        ...v,
        health_status,
        health_issues
      };
    });
    
    res.json(vehicles);
  } catch (error) {
    console.error('Error obteniendo vehículos:', error);
    res.status(500).json({ error: 'Error al obtener vehículos' });
  }
};

// Obtener detalle de un vehículo
export const getVehicleDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Datos del vehículo
    const vehicleResult = await pool.query(`
      SELECT v.*, u.full_name as driver_name, u.phone as driver_phone, u.email as driver_email
      FROM vehicles v
      LEFT JOIN users u ON v.assigned_driver_id = u.id
      WHERE v.id = $1
    `, [id]);
    
    if (vehicleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    
    // Documentos
    const docsResult = await pool.query(`
      SELECT * FROM vehicle_documents WHERE vehicle_id = $1 ORDER BY expiration_date ASC
    `, [id]);
    
    // Historial de mantenimiento
    const maintenanceResult = await pool.query(`
      SELECT vm.*, u.full_name as created_by_name
      FROM vehicle_maintenance vm
      LEFT JOIN users u ON vm.created_by = u.id
      WHERE vm.vehicle_id = $1
      ORDER BY vm.service_date DESC
      LIMIT 20
    `, [id]);
    
    // Últimas inspecciones
    const inspectionsResult = await pool.query(`
      SELECT dvi.*, u.full_name as driver_name
      FROM daily_vehicle_inspections dvi
      LEFT JOIN users u ON dvi.driver_id = u.id
      WHERE dvi.vehicle_id = $1
      ORDER BY dvi.inspection_date DESC
      LIMIT 10
    `, [id]);
    
    // Historial de asignaciones
    const assignmentsResult = await pool.query(`
      SELECT va.*, u.full_name as driver_name
      FROM vehicle_assignments va
      LEFT JOIN users u ON va.driver_id = u.id
      WHERE va.vehicle_id = $1
      ORDER BY va.assigned_at DESC
      LIMIT 10
    `, [id]);
    
    // Alertas activas
    const alertsResult = await pool.query(`
      SELECT * FROM fleet_alerts WHERE vehicle_id = $1 AND is_resolved = FALSE ORDER BY due_date ASC
    `, [id]);
    
    // Calcular gastos totales
    const expensesResult = await pool.query(`
      SELECT 
        COALESCE(SUM(cost), 0) as total_maintenance,
        COUNT(*) as total_services
      FROM vehicle_maintenance WHERE vehicle_id = $1
    `, [id]);
    
    const docsExpensesResult = await pool.query(`
      SELECT COALESCE(SUM(cost), 0) as total_docs FROM vehicle_documents WHERE vehicle_id = $1
    `, [id]);
    
    res.json({
      vehicle: vehicleResult.rows[0],
      documents: docsResult.rows,
      maintenance: maintenanceResult.rows,
      inspections: inspectionsResult.rows,
      assignments: assignmentsResult.rows,
      alerts: alertsResult.rows,
      expenses: {
        maintenance: parseFloat(expensesResult.rows[0].total_maintenance) || 0,
        documents: parseFloat(docsExpensesResult.rows[0].total_docs) || 0,
        services_count: parseInt(expensesResult.rows[0].total_services) || 0
      }
    });
  } catch (error) {
    console.error('Error obteniendo detalle de vehículo:', error);
    res.status(500).json({ error: 'Error al obtener detalle' });
  }
};

// Crear vehículo
export const createVehicle = async (req: Request, res: Response) => {
  try {
    const {
      economic_number, vehicle_type, brand, model, year, vin_number,
      license_plates, color, fuel_type, tank_capacity, current_mileage,
      purchase_date, purchase_price, notes, photo_url
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO vehicles (
        economic_number, vehicle_type, brand, model, year, vin_number,
        license_plates, color, fuel_type, tank_capacity, current_mileage,
        purchase_date, purchase_price, notes, photo_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      economic_number, vehicle_type, brand, model, year, vin_number,
      license_plates, color, fuel_type, tank_capacity, current_mileage || 0,
      purchase_date, purchase_price, notes, photo_url
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creando vehículo:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El número económico o VIN ya existe' });
    }
    res.status(500).json({ error: 'Error al crear vehículo' });
  }
};

// Actualizar vehículo
export const updateVehicle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'economic_number', 'vehicle_type', 'brand', 'model', 'year', 'vin_number',
      'license_plates', 'color', 'fuel_type', 'tank_capacity', 'current_mileage',
      'status', 'assigned_driver_id', 'purchase_date', 'purchase_price', 'notes', 'photo_url'
    ];
    
    const setClause: string[] = [];
    const values: any[] = [];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        values.push(updates[field]);
        setClause.push(`${field} = $${values.length}`);
      }
    });
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    
    values.push(new Date());
    setClause.push(`updated_at = $${values.length}`);
    
    values.push(id);
    const result = await pool.query(
      `UPDATE vehicles SET ${setClause.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando vehículo:', error);
    res.status(500).json({ error: 'Error al actualizar vehículo' });
  }
};

// Asignar conductor a vehículo
export const assignDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { driver_id, notes } = req.body;
    
    // Verificar vehículo
    const vehicle = await pool.query('SELECT * FROM vehicles WHERE id = $1', [id]);
    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    
    // Cerrar asignación anterior si existe
    if (vehicle.rows[0].assigned_driver_id) {
      await pool.query(`
        UPDATE vehicle_assignments 
        SET released_at = NOW(), mileage_at_release = $1
        WHERE vehicle_id = $2 AND released_at IS NULL
      `, [vehicle.rows[0].current_mileage, id]);
    }
    
    // Crear nueva asignación
    if (driver_id) {
      await pool.query(`
        INSERT INTO vehicle_assignments (vehicle_id, driver_id, mileage_at_assignment, notes)
        VALUES ($1, $2, $3, $4)
      `, [id, driver_id, vehicle.rows[0].current_mileage, notes]);
    }
    
    // Actualizar vehículo
    await pool.query('UPDATE vehicles SET assigned_driver_id = $1, updated_at = NOW() WHERE id = $2', [driver_id || null, id]);
    
    res.json({ message: driver_id ? 'Conductor asignado' : 'Conductor desasignado' });
  } catch (error) {
    console.error('Error asignando conductor:', error);
    res.status(500).json({ error: 'Error al asignar conductor' });
  }
};

// ==================== DOCUMENTOS ====================

// Obtener documentos de un vehículo
export const getVehicleDocuments = async (req: Request, res: Response) => {
  try {
    const { vehicleId } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM vehicle_documents WHERE vehicle_id = $1 ORDER BY expiration_date ASC
    `, [vehicleId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
};

// Crear documento
export const createDocument = async (req: Request, res: Response) => {
  try {
    const { vehicleId } = req.params;
    const { document_type, provider_name, policy_number, issue_date, expiration_date, cost, file_url, notes } = req.body;
    
    const result = await pool.query(`
      INSERT INTO vehicle_documents (vehicle_id, document_type, provider_name, policy_number, issue_date, expiration_date, cost, file_url, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [vehicleId, document_type, provider_name, policy_number, issue_date, expiration_date, cost, file_url, notes]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creando documento:', error);
    res.status(500).json({ error: 'Error al crear documento' });
  }
};

// Actualizar documento
export const updateDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { document_type, provider_name, policy_number, issue_date, expiration_date, cost, file_url, notes } = req.body;
    
    const result = await pool.query(`
      UPDATE vehicle_documents 
      SET document_type = $1, provider_name = $2, policy_number = $3, issue_date = $4, 
          expiration_date = $5, cost = $6, file_url = $7, notes = $8, updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [document_type, provider_name, policy_number, issue_date, expiration_date, cost, file_url, notes, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error actualizando documento:', error);
    res.status(500).json({ error: 'Error al actualizar documento' });
  }
};

// Eliminar documento
export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM vehicle_documents WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    res.json({ message: 'Documento eliminado' });
  } catch (error) {
    console.error('Error eliminando documento:', error);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
};

// ==================== MANTENIMIENTO ====================

// Obtener historial de mantenimiento
export const getMaintenanceHistory = async (req: Request, res: Response) => {
  try {
    const { vehicleId } = req.params;
    
    const result = await pool.query(`
      SELECT vm.*, u.full_name as created_by_name
      FROM vehicle_maintenance vm
      LEFT JOIN users u ON vm.created_by = u.id
      WHERE vm.vehicle_id = $1
      ORDER BY vm.service_date DESC
    `, [vehicleId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo mantenimiento:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

// Registrar mantenimiento
export const createMaintenance = async (req: Request, res: Response) => {
  try {
    const { vehicleId } = req.params;
    const userId = (req as any).user?.userId;
    const {
      service_type, description, service_date, mileage_at_service, cost,
      workshop_name, mechanic_name, invoice_number, invoice_url,
      next_service_mileage, next_service_date, parts_replaced, warranty_until
    } = req.body;
    
    // Registrar mantenimiento
    const result = await pool.query(`
      INSERT INTO vehicle_maintenance (
        vehicle_id, service_type, description, service_date, mileage_at_service, cost,
        workshop_name, mechanic_name, invoice_number, invoice_url,
        next_service_mileage, next_service_date, parts_replaced, warranty_until, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      vehicleId, service_type, description, service_date, mileage_at_service, cost,
      workshop_name, mechanic_name, invoice_number, invoice_url,
      next_service_mileage, next_service_date, parts_replaced, warranty_until, userId
    ]);
    
    // Actualizar kilometraje del vehículo si es mayor
    if (mileage_at_service) {
      await pool.query(`
        UPDATE vehicles SET current_mileage = GREATEST(current_mileage, $1), updated_at = NOW()
        WHERE id = $2
      `, [mileage_at_service, vehicleId]);
    }
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error registrando mantenimiento:', error);
    res.status(500).json({ error: 'Error al registrar mantenimiento' });
  }
};

// ==================== INSPECCIONES DIARIAS ====================

// Obtener inspecciones (para admin)
export const getInspections = async (req: Request, res: Response) => {
  try {
    const { date, status, vehicle_id, flagged_only } = req.query;
    
    let query = `
      SELECT 
        dvi.*,
        v.economic_number,
        v.brand,
        v.model,
        u.full_name as driver_name
      FROM daily_vehicle_inspections dvi
      JOIN vehicles v ON dvi.vehicle_id = v.id
      JOIN users u ON dvi.driver_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (date) {
      params.push(date);
      query += ` AND DATE(dvi.inspection_date) = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND dvi.manager_review_status = $${params.length}`;
    }
    
    if (vehicle_id) {
      params.push(vehicle_id);
      query += ` AND dvi.vehicle_id = $${params.length}`;
    }
    
    if (flagged_only === 'true') {
      query += ` AND (dvi.has_new_damage = TRUE OR dvi.is_cabin_clean = FALSE)`;
    }
    
    query += ' ORDER BY dvi.inspection_date DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo inspecciones:', error);
    res.status(500).json({ error: 'Error al obtener inspecciones' });
  }
};

// Revisar inspección (gerente)
export const reviewInspection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const { status, notes } = req.body;
    
    const result = await pool.query(`
      UPDATE daily_vehicle_inspections 
      SET manager_review_status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [status, notes, userId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inspección no encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error revisando inspección:', error);
    res.status(500).json({ error: 'Error al revisar inspección' });
  }
};

// ==================== ENDPOINTS PARA CHOFER (MOBILE APP) ====================

// Obtener vehículos disponibles para el chofer
export const getAvailableVehicles = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
    // Vehículos activos asignados al chofer o sin asignar
    const result = await pool.query(`
      SELECT id, economic_number, vehicle_type, brand, model, year, license_plates, current_mileage
      FROM vehicles
      WHERE status = 'active' AND (assigned_driver_id = $1 OR assigned_driver_id IS NULL)
      ORDER BY economic_number
    `, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo vehículos disponibles:', error);
    res.status(500).json({ error: 'Error al obtener vehículos' });
  }
};

// Registrar inspección diaria (desde la app del chofer)
export const submitDailyInspection = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const {
      vehicle_id, inspection_type, reported_mileage, odometer_photo_url,
      front_photo_url, back_photo_url, left_side_photo_url, right_side_photo_url,
      cabin_photo_url, is_cabin_clean, has_new_damage, damage_notes, damage_photo_url,
      fuel_level, tire_condition, lights_working, brakes_working
    } = req.body;
    
    if (!vehicle_id || !reported_mileage) {
      return res.status(400).json({ error: 'Vehículo y kilometraje son requeridos' });
    }
    
    // Verificar si ya existe inspección hoy para este vehículo y tipo
    const existing = await pool.query(`
      SELECT id FROM daily_vehicle_inspections 
      WHERE vehicle_id = $1 AND driver_id = $2 AND inspection_type = $3 AND DATE(inspection_date) = CURRENT_DATE
    `, [vehicle_id, userId, inspection_type || 'check_in']);
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ya registraste una inspección de este tipo hoy' });
    }
    
    // Validar kilometraje (no puede ser menor al actual)
    const vehicle = await pool.query('SELECT current_mileage FROM vehicles WHERE id = $1', [vehicle_id]);
    if (vehicle.rows.length === 0) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }
    
    if (reported_mileage < vehicle.rows[0].current_mileage) {
      return res.status(400).json({ 
        error: `El kilometraje no puede ser menor al actual (${vehicle.rows[0].current_mileage} km)` 
      });
    }
    
    // Detectar discrepancia grande (más de 500km en un día = alerta)
    const kmDiff = reported_mileage - vehicle.rows[0].current_mileage;
    const flagged = kmDiff > 500 || has_new_damage || !is_cabin_clean;
    
    // Registrar inspección
    const result = await pool.query(`
      INSERT INTO daily_vehicle_inspections (
        vehicle_id, driver_id, inspection_type, reported_mileage, odometer_photo_url,
        front_photo_url, back_photo_url, left_side_photo_url, right_side_photo_url,
        cabin_photo_url, is_cabin_clean, has_new_damage, damage_notes, damage_photo_url,
        fuel_level, tire_condition, lights_working, brakes_working,
        manager_review_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      vehicle_id, userId, inspection_type || 'check_in', reported_mileage, odometer_photo_url,
      front_photo_url, back_photo_url, left_side_photo_url, right_side_photo_url,
      cabin_photo_url, is_cabin_clean !== false, has_new_damage || false, damage_notes, damage_photo_url,
      fuel_level, tire_condition || 'good', lights_working !== false, brakes_working !== false,
      flagged ? 'flagged' : 'pending'
    ]);
    
    // Actualizar kilometraje del vehículo
    await pool.query(`
      UPDATE vehicles SET current_mileage = $1, updated_at = NOW() WHERE id = $2
    `, [reported_mileage, vehicle_id]);
    
    // Si es check_in, asignar chofer al vehículo
    if (inspection_type === 'check_in' || !inspection_type) {
      await pool.query(`
        UPDATE vehicles SET assigned_driver_id = $1, updated_at = NOW() WHERE id = $2
      `, [userId, vehicle_id]);
      
      // Registrar asignación
      await pool.query(`
        INSERT INTO vehicle_assignments (vehicle_id, driver_id, mileage_at_assignment)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [vehicle_id, userId, reported_mileage]);
    }
    
    // Crear alerta si hay daño nuevo
    if (has_new_damage) {
      await pool.query(`
        INSERT INTO fleet_alerts (vehicle_id, alert_type, alert_level, title, description)
        VALUES ($1, 'damage_reported', 'critical', $2, $3)
      `, [vehicle_id, 'Daño reportado en inspección', damage_notes || 'El chofer reportó un daño nuevo']);
    }
    
    res.status(201).json({
      message: 'Inspección registrada correctamente',
      inspection: result.rows[0],
      flagged
    });
  } catch (error) {
    console.error('Error registrando inspección:', error);
    res.status(500).json({ error: 'Error al registrar inspección' });
  }
};

// Verificar si el chofer ya hizo inspección hoy
export const checkTodayInspection = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { type } = req.query; // 'check_in' o 'check_out'
    
    const result = await pool.query(`
      SELECT dvi.*, v.economic_number, v.brand, v.model
      FROM daily_vehicle_inspections dvi
      JOIN vehicles v ON dvi.vehicle_id = v.id
      WHERE dvi.driver_id = $1 AND DATE(dvi.inspection_date) = CURRENT_DATE
      ${type ? 'AND dvi.inspection_type = $2' : ''}
      ORDER BY dvi.inspection_date DESC
    `, type ? [userId, type] : [userId]);
    
    res.json({
      has_inspection: result.rows.length > 0,
      inspections: result.rows
    });
  } catch (error) {
    console.error('Error verificando inspección:', error);
    res.status(500).json({ error: 'Error al verificar inspección' });
  }
};

// ==================== ALERTAS Y REPORTES ====================

// Obtener todas las alertas activas
export const getFleetAlerts = async (req: Request, res: Response) => {
  try {
    const { resolved } = req.query;
    
    const result = await pool.query(`
      SELECT fa.*, v.economic_number, v.brand, v.model
      FROM fleet_alerts fa
      JOIN vehicles v ON fa.vehicle_id = v.id
      WHERE fa.is_resolved = $1
      ORDER BY 
        CASE fa.alert_level WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        fa.due_date ASC NULLS LAST
    `, [resolved === 'true']);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo alertas:', error);
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
};

// Resolver alerta
export const resolveAlert = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    
    const result = await pool.query(`
      UPDATE fleet_alerts SET is_resolved = TRUE, resolved_by = $1, resolved_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [userId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error resolviendo alerta:', error);
    res.status(500).json({ error: 'Error al resolver alerta' });
  }
};

// Dashboard de flotilla
export const getFleetDashboard = async (req: Request, res: Response) => {
  try {
    // Resumen de vehículos
    const vehiclesCount = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'in_shop') as in_shop,
        COUNT(*) FILTER (WHERE status = 'out_of_service') as out_of_service,
        COUNT(*) as total
      FROM vehicles
    `);
    
    // Documentos por vencer (próximos 30 días)
    const expiringDocs = await pool.query(`
      SELECT vd.*, v.economic_number
      FROM vehicle_documents vd
      JOIN vehicles v ON vd.vehicle_id = v.id
      WHERE vd.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY vd.expiration_date ASC
    `);
    
    // Documentos vencidos
    const expiredDocs = await pool.query(`
      SELECT vd.*, v.economic_number
      FROM vehicle_documents vd
      JOIN vehicles v ON vd.vehicle_id = v.id
      WHERE vd.expiration_date < CURRENT_DATE
      ORDER BY vd.expiration_date ASC
    `);
    
    // Vehículos que necesitan servicio
    const needService = await pool.query(`
      SELECT v.*, 
        (SELECT vm.next_service_mileage FROM vehicle_maintenance vm WHERE vm.vehicle_id = v.id AND vm.next_service_mileage IS NOT NULL ORDER BY vm.service_date DESC LIMIT 1) as next_service_km
      FROM vehicles v
      WHERE v.status = 'active'
      AND EXISTS (
        SELECT 1 FROM vehicle_maintenance vm 
        WHERE vm.vehicle_id = v.id 
        AND vm.next_service_mileage IS NOT NULL 
        AND v.current_mileage >= vm.next_service_mileage - 1000
      )
    `);
    
    // Alertas activas
    const alerts = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE alert_level = 'critical') as critical,
             COUNT(*) FILTER (WHERE alert_level = 'warning') as warning,
             COUNT(*) as total
      FROM fleet_alerts WHERE is_resolved = FALSE
    `);
    
    // Inspecciones de hoy
    const todayInspections = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE has_new_damage = TRUE) as with_damage,
        COUNT(*) FILTER (WHERE is_cabin_clean = FALSE) as dirty_cabin,
        COUNT(*) FILTER (WHERE manager_review_status = 'pending') as pending_review
      FROM daily_vehicle_inspections
      WHERE DATE(inspection_date) = CURRENT_DATE
    `);
    
    // Gastos del mes
    const monthlyExpenses = await pool.query(`
      SELECT COALESCE(SUM(cost), 0) as maintenance_cost
      FROM vehicle_maintenance
      WHERE DATE_TRUNC('month', service_date) = DATE_TRUNC('month', CURRENT_DATE)
    `);
    
    res.json({
      vehicles: vehiclesCount.rows[0],
      expiring_documents: expiringDocs.rows,
      expired_documents: expiredDocs.rows,
      need_service: needService.rows,
      alerts: alerts.rows[0],
      today_inspections: todayInspections.rows[0],
      monthly_expenses: {
        maintenance: parseFloat(monthlyExpenses.rows[0].maintenance_cost) || 0
      }
    });
  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
};

// Obtener conductores disponibles (para asignación)
export const getAvailableDrivers = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, full_name, email, phone, role
      FROM users
      WHERE role IN ('repartidor', 'warehouse_ops', 'branch_manager')
      AND is_active = TRUE
      ORDER BY full_name
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo conductores:', error);
    res.status(500).json({ error: 'Error al obtener conductores' });
  }
};

// Cron: Verificar documentos por vencer y crear alertas
export const checkExpiringDocuments = async (): Promise<{ created: number }> => {
  let created = 0;
  try {
    console.log('🔍 Verificando documentos por vencer...');
    
    // Documentos que vencen en 15 días y no tienen alerta enviada
    const expiring = await pool.query(`
      SELECT vd.*, v.economic_number
      FROM vehicle_documents vd
      JOIN vehicles v ON vd.vehicle_id = v.id
      WHERE vd.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '15 days'
      AND vd.alert_sent = FALSE
    `);
    
    for (const doc of expiring.rows) {
      // Crear alerta
      await pool.query(`
        INSERT INTO fleet_alerts (vehicle_id, alert_type, alert_level, title, description, due_date)
        VALUES ($1, 'document_expiring', 'warning', $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [
        doc.vehicle_id,
        `${doc.document_type} por vencer - ${doc.economic_number}`,
        `El ${doc.document_type} de ${doc.economic_number} (${doc.provider_name || 'N/A'}) vence el ${doc.expiration_date}`,
        doc.expiration_date
      ]);
      
      // Marcar como enviada
      await pool.query('UPDATE vehicle_documents SET alert_sent = TRUE WHERE id = $1', [doc.id]);
      created++;
    }
    
    // Documentos vencidos
    const expired = await pool.query(`
      SELECT vd.*, v.economic_number
      FROM vehicle_documents vd
      JOIN vehicles v ON vd.vehicle_id = v.id
      WHERE vd.expiration_date < CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM fleet_alerts fa 
        WHERE fa.vehicle_id = vd.vehicle_id 
        AND fa.alert_type = 'document_expired'
        AND fa.title LIKE '%' || vd.document_type || '%'
        AND fa.is_resolved = FALSE
      )
    `);
    
    for (const doc of expired.rows) {
      await pool.query(`
        INSERT INTO fleet_alerts (vehicle_id, alert_type, alert_level, title, description, due_date)
        VALUES ($1, 'document_expired', 'critical', $2, $3, $4)
      `, [
        doc.vehicle_id,
        `⚠️ ${doc.document_type} VENCIDO - ${doc.economic_number}`,
        `El ${doc.document_type} de ${doc.economic_number} venció el ${doc.expiration_date}. ¡Renueva urgente!`,
        doc.expiration_date
      ]);
      created++;
    }
    
    console.log(`✅ Verificación completada: ${expiring.rows.length} por vencer, ${expired.rows.length} vencidos`);
  } catch (error) {
    console.error('Error en verificación de documentos:', error);
  }
  return { created };
};

// Cron: Verificar servicios de mantenimiento próximos
export const checkUpcomingMaintenance = async (): Promise<{ created: number }> => {
  let created = 0;
  try {
    console.log('🔧 Verificando mantenimientos próximos...');
    
    // Vehículos que están a menos de 1000km de su próximo servicio
    const needService = await pool.query(`
      SELECT v.*, vm.next_service_mileage, vm.service_type
      FROM vehicles v
      JOIN LATERAL (
        SELECT next_service_mileage, service_type
        FROM vehicle_maintenance 
        WHERE vehicle_id = v.id AND next_service_mileage IS NOT NULL
        ORDER BY service_date DESC LIMIT 1
      ) vm ON true
      WHERE v.current_mileage >= vm.next_service_mileage - 1000
      AND v.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM fleet_alerts fa 
        WHERE fa.vehicle_id = v.id 
        AND fa.alert_type = 'maintenance_due'
        AND fa.is_resolved = FALSE
      )
    `);
    
    for (const vehicle of needService.rows) {
      const kmLeft = vehicle.next_service_mileage - vehicle.current_mileage;
      await pool.query(`
        INSERT INTO fleet_alerts (vehicle_id, alert_type, alert_level, title, description)
        VALUES ($1, 'maintenance_due', 'warning', $2, $3)
      `, [
        vehicle.id,
        `🔧 Servicio próximo - ${vehicle.economic_number}`,
        `La ${vehicle.economic_number} está a ${kmLeft} km de requerir servicio ${vehicle.service_type}. Kilometraje actual: ${vehicle.current_mileage} km`
      ]);
      created++;
    }
    
    console.log(`✅ Verificación completada: ${needService.rows.length} vehículos necesitan servicio`);
  } catch (error) {
    console.error('Error en verificación de mantenimiento:', error);
  }
  return { created };
};
