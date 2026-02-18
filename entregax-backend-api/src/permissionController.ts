import { Request, Response } from 'express';
import { pool } from './db';

// ROLES CONFIGURABLES (Los que aparecerán en la matriz)
const CONFIGURABLE_ROLES = [
  'Super Admin',
  'Admin',
  'Director',
  'Gerente de Sucursal',
  'Servicio a Cliente',
  'Personal de Mostrador',
  'Operaciones de Bodega'
];

// ============================================
// 1. OBTENER LA MATRIZ COMPLETA DE PERMISOS
// ============================================
export const getPermissionMatrix = async (req: Request, res: Response): Promise<any> => {
  try {
    // Obtenemos todos los permisos ordenados por categoría
    const permsResult = await pool.query(`
      SELECT id, slug, name, category 
      FROM permissions 
      ORDER BY category, name
    `);

    // Obtenemos las asignaciones actuales
    const assignmentsResult = await pool.query('SELECT role, permission_id FROM role_permissions');

    // Formateamos para el frontend: un objeto { "Admin_1": true, "Director_5": true }
    const activeMap: Record<string, boolean> = {};
    assignmentsResult.rows.forEach((row: { role: string; permission_id: number }) => {
      activeMap[`${row.role}_${row.permission_id}`] = true;
    });

    res.json({
      permissions: permsResult.rows,
      activeMap,
      roles: CONFIGURABLE_ROLES
    });
  } catch (error) {
    console.error('Error al cargar matriz de permisos:', error);
    res.status(500).json({ error: 'Error al cargar matriz de permisos' });
  }
};

// ============================================
// 2. TOGGLE PERMISO (Prender / Apagar)
// ============================================
export const togglePermission = async (req: Request, res: Response): Promise<any> => {
  const { role, permissionId, assign } = req.body;

  if (!role || !permissionId) {
    return res.status(400).json({ error: 'Faltan role o permissionId' });
  }

  // Protección: No permitir desactivar permisos del Super Admin desde la UI
  // (Por seguridad, solo se puede hacer directo en DB)
  if (role === 'Super Admin') {
    return res.status(403).json({ error: 'No se pueden modificar permisos del Super Admin' });
  }

  try {
    if (assign) {
      // Otorgar permiso
      await pool.query(
        `INSERT INTO role_permissions (role, permission_id) 
         VALUES ($1, $2) 
         ON CONFLICT DO NOTHING`,
        [role, permissionId]
      );
    } else {
      // Quitar permiso
      await pool.query(
        `DELETE FROM role_permissions 
         WHERE role = $1 AND permission_id = $2`,
        [role, permissionId]
      );
    }

    res.json({ success: true, role, permissionId, assigned: assign });
  } catch (error) {
    console.error('Error al actualizar permiso:', error);
    res.status(500).json({ error: 'Error al actualizar permiso' });
  }
};

// ============================================
// 3. AGREGAR NUEVO PERMISO AL CATÁLOGO
// ============================================
export const addPermission = async (req: Request, res: Response): Promise<any> => {
  const { slug, name, category } = req.body;

  if (!slug || !name) {
    return res.status(400).json({ error: 'Faltan slug o name' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO permissions (slug, name, category) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (slug) DO UPDATE SET name = $2, category = $3
       RETURNING *`,
      [slug, name, category || 'General']
    );

    // Automáticamente dárselo al Super Admin
    if (result.rows.length > 0) {
      await pool.query(
        `INSERT INTO role_permissions (role, permission_id) 
         VALUES ('Super Admin', $1) 
         ON CONFLICT DO NOTHING`,
        [result.rows[0].id]
      );
    }

    res.json({ success: true, permission: result.rows[0] });
  } catch (error) {
    console.error('Error al agregar permiso:', error);
    res.status(500).json({ error: 'Error al agregar permiso' });
  }
};

// ============================================
// 4. ELIMINAR PERMISO DEL CATÁLOGO
// ============================================
export const deletePermission = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;

  try {
    // El CASCADE en role_permissions eliminará automáticamente las asignaciones
    await pool.query('DELETE FROM permissions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar permiso:', error);
    res.status(500).json({ error: 'Error al eliminar permiso' });
  }
};

// ============================================
// 5. VERIFICAR SI UN USUARIO TIENE UN PERMISO (Útil para APIs)
// ============================================
export const checkUserPermission = async (req: Request, res: Response): Promise<any> => {
  const user = (req as any).user;
  const { slug } = req.params;

  if (!user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // Super Admin siempre tiene acceso
    if (user.role === 'Super Admin' || user.role === 'super_admin') {
      return res.json({ hasPermission: true, role: user.role });
    }

    const result = await pool.query(`
      SELECT 1 FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role = $1 AND p.slug = $2
    `, [user.role, slug]);

    res.json({ 
      hasPermission: result.rows.length > 0, 
      role: user.role,
      slug 
    });
  } catch (error) {
    console.error('Error al verificar permiso:', error);
    res.status(500).json({ error: 'Error al verificar permiso' });
  }
};

// ============================================
// 6. OBTENER PERMISOS DE UN ROL ESPECÍFICO
// ============================================
export const getRolePermissions = async (req: Request, res: Response): Promise<any> => {
  const { role } = req.params;

  try {
    const result = await pool.query(`
      SELECT p.* FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role = $1
      ORDER BY p.category, p.name
    `, [role]);

    res.json({ 
      role, 
      permissions: result.rows,
      slugs: result.rows.map((r: { slug: string }) => r.slug)
    });
  } catch (error) {
    console.error('Error al obtener permisos del rol:', error);
    res.status(500).json({ error: 'Error al obtener permisos del rol' });
  }
};

// ============================================
// 7. ASIGNAR MÚLTIPLES PERMISOS A UN ROL (Bulk)
// ============================================
export const bulkAssignPermissions = async (req: Request, res: Response): Promise<any> => {
  const { role, permissionIds, action } = req.body; // action: 'assign' | 'revoke'

  if (!role || !permissionIds || !Array.isArray(permissionIds)) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  if (role === 'Super Admin') {
    return res.status(403).json({ error: 'No se pueden modificar permisos del Super Admin' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const permId of permissionIds) {
      if (action === 'assign') {
        await client.query(
          `INSERT INTO role_permissions (role, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [role, permId]
        );
      } else {
        await client.query(
          `DELETE FROM role_permissions WHERE role = $1 AND permission_id = $2`,
          [role, permId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, role, count: permissionIds.length, action });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en bulk assign:', error);
    res.status(500).json({ error: 'Error al asignar permisos' });
  } finally {
    client.release();
  }
};

// ============================================
// 8. OBTENER TODOS LOS PANELES DISPONIBLES
// ============================================
export const getAllPanels = async (req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT * FROM admin_panels 
      WHERE is_active = true 
      ORDER BY category, sort_order
    `);
    res.json({ panels: result.rows });
  } catch (error) {
    console.error('Error al obtener paneles:', error);
    res.status(500).json({ error: 'Error al obtener paneles' });
  }
};

// ============================================
// 9. OBTENER PERMISOS DE PANELES DE UN USUARIO
// ============================================
export const getUserPanelPermissions = async (req: Request, res: Response): Promise<any> => {
  const { userId } = req.params;

  try {
    // Obtener info del usuario
    const userResult = await pool.query(
      'SELECT id, full_name, email, role FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];

    // Super admin tiene acceso a todo
    if (user.role === 'super_admin') {
      const allPanels = await pool.query('SELECT panel_key FROM admin_panels WHERE is_active = true');
      return res.json({
        user,
        permissions: allPanels.rows.map((p: { panel_key: string }) => ({
          panel_key: p.panel_key,
          can_view: true,
          can_edit: true
        })),
        isSuperAdmin: true
      });
    }

    // Obtener permisos específicos del usuario
    const permsResult = await pool.query(`
      SELECT upp.panel_key, upp.can_view, upp.can_edit, 
             ap.panel_name, ap.category, ap.description
      FROM user_panel_permissions upp
      JOIN admin_panels ap ON upp.panel_key = ap.panel_key
      WHERE upp.user_id = $1
    `, [userId]);

    res.json({
      user,
      permissions: permsResult.rows,
      isSuperAdmin: false
    });
  } catch (error) {
    console.error('Error al obtener permisos de paneles del usuario:', error);
    res.status(500).json({ error: 'Error al obtener permisos' });
  }
};

// ============================================
// 10. ACTUALIZAR PERMISOS DE PANELES DE UN USUARIO
// ============================================
export const updateUserPanelPermissions = async (req: Request, res: Response): Promise<any> => {
  const { userId } = req.params;
  const { permissions } = req.body; // Array de { panel_key, can_view, can_edit }
  const grantedBy = (req as any).user?.id;

  if (!permissions || !Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Permisos inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Eliminar permisos anteriores
    await client.query('DELETE FROM user_panel_permissions WHERE user_id = $1', [userId]);

    // Insertar nuevos permisos
    for (const perm of permissions) {
      if (perm.can_view) {
        await client.query(`
          INSERT INTO user_panel_permissions (user_id, panel_key, can_view, can_edit, granted_by)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, perm.panel_key, perm.can_view, perm.can_edit || false, grantedBy]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, userId, count: permissions.filter((p: any) => p.can_view).length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar permisos de paneles:', error);
    res.status(500).json({ error: 'Error al actualizar permisos' });
  } finally {
    client.release();
  }
};

// ============================================
// 11. OBTENER MIS PERMISOS DE PANELES (Usuario actual)
// ============================================
export const getMyPanelPermissions = async (req: Request, res: Response): Promise<any> => {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    // Super admin tiene acceso a todo
    if (user.role === 'super_admin') {
      const allPanels = await pool.query('SELECT panel_key, panel_name, category FROM admin_panels WHERE is_active = true ORDER BY category, sort_order');
      return res.json({
        panels: allPanels.rows.map((p: any) => ({
          ...p,
          can_view: true,
          can_edit: true
        })),
        isSuperAdmin: true
      });
    }

    // Obtener permisos específicos del usuario
    const permsResult = await pool.query(`
      SELECT ap.panel_key, ap.panel_name, ap.category, ap.icon,
             COALESCE(upp.can_view, false) as can_view,
             COALESCE(upp.can_edit, false) as can_edit
      FROM admin_panels ap
      LEFT JOIN user_panel_permissions upp ON ap.panel_key = upp.panel_key AND upp.user_id = $1
      WHERE ap.is_active = true
      ORDER BY ap.category, ap.sort_order
    `, [user.id]);

    res.json({
      panels: permsResult.rows,
      isSuperAdmin: false
    });
  } catch (error) {
    console.error('Error al obtener mis permisos de paneles:', error);
    res.status(500).json({ error: 'Error al obtener permisos' });
  }
};

// ============================================
// 12. LISTAR USUARIOS CON SUS PERMISOS DE PANELES
// ============================================
export const listUsersWithPanelPermissions = async (req: Request, res: Response): Promise<any> => {
  const { search, role } = req.query;

  try {
    // Roles que pueden tener permisos de paneles (staff + admin)
    const staffRoles = [
      'admin', 'director', 'advisor', 'sub_advisor', 'branch_manager', 
      'counter_staff', 'customer_service', 'warehouse_ops', 'repartidor'
    ];

    let query = `
      SELECT u.id, u.full_name, u.email, u.role, u.box_id,
             COALESCE(COUNT(DISTINCT upp.panel_key), 0) as panel_count
      FROM users u
      LEFT JOIN user_panel_permissions upp ON u.id = upp.user_id
      WHERE u.role = ANY($1)
    `;
    const params: any[] = [staffRoles];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    if (role && role !== 'all') {
      params.push(role);
      query += ` AND u.role = $${params.length}`;
    }

    query += ' GROUP BY u.id, u.full_name, u.email, u.role, u.box_id ORDER BY u.full_name';

    const result = await pool.query(query, params);
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error al listar usuarios con permisos:', error);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
};
