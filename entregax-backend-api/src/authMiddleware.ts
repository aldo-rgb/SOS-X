import { Request, Response, NextFunction } from 'express';
import { pool } from './db';

// Caché en memoria para permisos (evitar consultas repetidas)
// Se limpia cada 5 minutos para reflejar cambios
let permissionCache: Record<string, Set<string>> = {};
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ============================================
// CARGAR/ACTUALIZAR CACHÉ DE PERMISOS
// ============================================
async function loadPermissionCache(): Promise<void> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL && Object.keys(permissionCache).length > 0) {
    return; // Caché aún válido
  }

  try {
    const result = await pool.query(`
      SELECT rp.role, p.slug 
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
    `);

    const newCache: Record<string, Set<string>> = {};
    result.rows.forEach((row: { role: string; slug: string }) => {
      if (!newCache[row.role]) {
        newCache[row.role] = new Set();
      }
      newCache[row.role]!.add(row.slug);
    });

    permissionCache = newCache;
    cacheTimestamp = now;
    console.log('🔄 Caché de permisos actualizado');
  } catch (error) {
    console.error('Error al cargar caché de permisos:', error);
  }
}

// Forzar recarga del caché (llamar cuando se modifiquen permisos)
export function invalidatePermissionCache(): void {
  permissionCache = {};
  cacheTimestamp = 0;
}

// ============================================
// MIDDLEWARE: VERIFICAR PERMISO ESPECÍFICO
// ============================================
export function requirePermission(slug: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ error: 'No autorizado - Token requerido' });
      return;
    }

    // Normalizar rol (mapear nombres legacy)
    const userRole = normalizeRole(user.role);

    // Super Admin siempre pasa
    if (userRole === 'Super Admin') {
      return next();
    }

    // Cargar/actualizar caché si es necesario
    await loadPermissionCache();

    // Verificar permiso en caché
    const rolePerms = permissionCache[userRole];
    if (rolePerms && rolePerms.has(slug)) {
      return next();
    }

    // Si no está en caché, verificar directo en DB (fallback)
    try {
      const check = await pool.query(`
        SELECT 1 FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role = $1 AND p.slug = $2
      `, [userRole, slug]);

      if (check.rows.length > 0) {
        // Agregar al caché para próximas verificaciones
        if (!permissionCache[userRole]) {
          permissionCache[userRole] = new Set();
        }
        permissionCache[userRole].add(slug);
        return next();
      }
    } catch (error) {
      console.error('Error verificando permiso:', error);
    }

    // Acceso denegado
    res.status(403).json({ 
      error: 'Acceso Denegado', 
      message: `Tu rol "${userRole}" no tiene el permiso "${slug}"` 
    });
  };
}

// ============================================
// MIDDLEWARE: VERIFICAR MÚLTIPLES PERMISOS (OR)
// Usuario necesita AL MENOS UNO de los permisos
// ============================================
export function requireAnyPermission(slugs: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ error: 'No autorizado - Token requerido' });
      return;
    }

    const userRole = normalizeRole(user.role);

    if (userRole === 'Super Admin') {
      return next();
    }

    await loadPermissionCache();

    const rolePerms = permissionCache[userRole];
    if (rolePerms) {
      for (const slug of slugs) {
        if (rolePerms.has(slug)) {
          return next();
        }
      }
    }

    res.status(403).json({ 
      error: 'Acceso Denegado', 
      message: `Se requiere alguno de estos permisos: ${slugs.join(', ')}` 
    });
  };
}

// ============================================
// MIDDLEWARE: VERIFICAR TODOS LOS PERMISOS (AND)
// Usuario necesita TODOS los permisos listados
// ============================================
export function requireAllPermissions(slugs: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ error: 'No autorizado - Token requerido' });
      return;
    }

    const userRole = normalizeRole(user.role);

    if (userRole === 'Super Admin') {
      return next();
    }

    await loadPermissionCache();

    const rolePerms = permissionCache[userRole];
    if (!rolePerms) {
      res.status(403).json({ error: 'Acceso Denegado', message: 'Tu rol no tiene permisos configurados' });
      return;
    }

    const missing = slugs.filter(slug => !rolePerms.has(slug));
    if (missing.length === 0) {
      return next();
    }

    res.status(403).json({ 
      error: 'Acceso Denegado', 
      message: `Faltan permisos: ${missing.join(', ')}` 
    });
  };
}

// ============================================
// HELPER: Normalizar nombre de rol
// Mapea roles legacy a los nuevos nombres
// ============================================
function normalizeRole(role: string): string {
  const roleMap: Record<string, string> = {
    'super_admin': 'Super Admin',
    'admin': 'Admin',
    'director': 'Director',
    'advisor': 'Servicio a Cliente', // O mapear a otro rol según tu lógica
    'sub_advisor': 'Servicio a Cliente',
    'client': 'client', // Los clientes no tienen permisos de admin
  };

  return roleMap[role] || role;
}

// ============================================
// HELPER: Obtener permisos de un usuario
// Útil para enviar al frontend qué puede hacer
// ============================================
export async function getUserPermissions(role: string): Promise<string[]> {
  const normalizedRole = normalizeRole(role);
  
  if (normalizedRole === 'Super Admin') {
    // Super Admin tiene todos
    const all = await pool.query('SELECT slug FROM permissions');
    return all.rows.map((r: { slug: string }) => r.slug);
  }

  await loadPermissionCache();
  const rolePerms = permissionCache[normalizedRole];
  return rolePerms ? Array.from(rolePerms) : [];
}

// ============================================
// MIDDLEWARE: Solo Super Admin
// ============================================
export function requireSuperAdmin() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const userRole = normalizeRole(user.role);
    
    if (userRole === 'Super Admin') {
      return next();
    }

    res.status(403).json({ error: 'Acceso Denegado - Solo Super Admin' });
  };
}
