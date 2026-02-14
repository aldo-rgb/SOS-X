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
