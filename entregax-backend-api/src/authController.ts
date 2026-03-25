import { Request, Response, NextFunction } from 'express';
import { pool } from './db'; // Conexión real a PostgreSQL
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateReferralCode } from './commissionController';

// Función para generar un ID de Casillero único consecutivo (Ej. S4000, S4001, S4002...)
const generateBoxId = async (): Promise<string> => {
    try {
        // Buscar el máximo número de casillero S4XXX ordenando numéricamente
        const result = await pool.query(
            "SELECT MAX(CAST(SUBSTRING(box_id FROM 2) AS INTEGER)) as max_num FROM users WHERE box_id ~ '^S[0-9]+$'"
        );
        
        if (result.rows.length > 0 && result.rows[0].max_num !== null) {
            const nextNumber = result.rows[0].max_num + 1;
            return `S${nextNumber}`;
        }
        
        // Si no hay casilleros S4XXX, empezar en S4000
        return 'S4000';
    } catch (error) {
        console.error('Error generando box_id:', error);
        // Fallback: buscar de forma simple
        const fallback = await pool.query("SELECT COUNT(*) as total FROM users WHERE box_id LIKE 'S%'");
        return `S${4000 + parseInt(fallback.rows[0].total)}`;
    }
};

// Generar token JWT
const generateToken = (userId: number, email: string, role: string): string => {
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    return jwt.sign(
        { userId, email, role },
        secret,
        { expiresIn: '7d' }
    );
};

// Contraseña por defecto para nuevos clientes
const DEFAULT_PASSWORD = 'Entregax123';

// ============ REGISTRO CON CONTRASEÑA ENCRIPTADA ============
export const registerUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { fullName, email, password, phone, isAdminCreated, referralCodeInput, existingBoxId } = req.body;

        // Si es creado por admin, usa contraseña por defecto y requiere cambio
        const useDefaultPassword = isAdminCreated === true;
        const actualPassword = useDefaultPassword ? DEFAULT_PASSWORD : password;
        const mustChangePassword = useDefaultPassword;

        // Validaciones básicas
        if (!fullName || !email) {
            res.status(400).json({ error: 'Nombre y email son requeridos' });
            return;
        }

        // Si no es creado por admin, requiere contraseña
        if (!useDefaultPassword && !password) {
            res.status(400).json({ error: 'La contraseña es requerida' });
            return;
        }

        // Teléfono obligatorio si es creado por admin
        if (useDefaultPassword && !phone) {
            res.status(400).json({ error: 'El número de WhatsApp es obligatorio' });
            return;
        }

        // 1. Verificar si el usuario ya existe en PostgreSQL
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (userCheck.rows.length > 0) {
            res.status(400).json({ error: 'El usuario ya existe' });
            return;
        }

        // 1.5 Si proporciona un box_id existente, verificar que esté en legacy_clients y no en users
        let claimedBoxId: string | null = null;
        if (existingBoxId) {
            const boxIdUpper = existingBoxId.toUpperCase().trim();
            
            // Verificar que no esté ya en uso por otro usuario
            const boxInUse = await pool.query(
                'SELECT id FROM users WHERE UPPER(box_id) = $1',
                [boxIdUpper]
            );
            
            if (boxInUse.rows.length > 0) {
                res.status(400).json({ error: 'Este número de cliente ya está registrado. Si es tuyo, contacta a soporte.' });
                return;
            }
            
            // Verificar que exista en legacy_clients (es un cliente conocido)
            const legacyCheck = await pool.query(
                'SELECT box_id, full_name FROM legacy_clients WHERE UPPER(box_id) = $1',
                [boxIdUpper]
            );
            
            if (legacyCheck.rows.length > 0) {
                claimedBoxId = legacyCheck.rows[0].box_id;
                console.log(`[REGISTRO] Cliente reclamando box_id existente: ${claimedBoxId}`);
            } else {
                // Si no existe en legacy_clients, ignorar y generar uno nuevo
                console.log(`[REGISTRO] Box_id ${boxIdUpper} no encontrado en legacy_clients, se generará nuevo`);
            }
        }

        // 2. Buscar código de referido y determinar si es asesor o amigo
        let advisorId: number | null = null;  // Para asesores comerciales
        let referidoPorId: number | null = null;  // Para amigos (sistema $500)
        let referrerInfo: { id: number; role: string; name: string } | null = null;
        
        if (referralCodeInput) {
            const referrerCheck = await pool.query(
                'SELECT id, role, full_name FROM users WHERE referral_code = $1',
                [referralCodeInput.toUpperCase()]
            );
            if (referrerCheck.rows.length > 0) {
                referrerInfo = {
                    id: referrerCheck.rows[0].id,
                    role: referrerCheck.rows[0].role,
                    name: referrerCheck.rows[0].full_name
                };
                
                // Si es asesor → asignar como advisor_id
                if (['advisor', 'sub_advisor'].includes(referrerInfo.role)) {
                    advisorId = referrerInfo.id;
                    console.log(`[REGISTRO] Cliente referido por ASESOR: ${referrerInfo.name} (ID: ${referrerInfo.id})`);
                } 
                // Si es cliente → activar sistema de referidos ($500)
                else if (referrerInfo.role === 'client') {
                    referidoPorId = referrerInfo.id;
                    console.log(`[REGISTRO] Cliente referido por AMIGO: ${referrerInfo.name} (ID: ${referrerInfo.id})`);
                }
            }
        }

        // 3. Encriptar contraseña
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(actualPassword, saltRounds);

        // 4. Usar box_id reclamado o generar uno nuevo
        const newBoxId = claimedBoxId || await generateBoxId();

        // 5. Generar código de referido propio para el nuevo usuario
        const myReferralCode = generateReferralCode(fullName);

        // 6. Insertar en la Base de Datos con asesor y/o referido
        const newUserQuery = await pool.query(
            `INSERT INTO users (full_name, email, password, box_id, must_change_password, phone, referral_code, referred_by_id, advisor_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [fullName, email, hashedPassword, newBoxId, mustChangePassword, phone || null, myReferralCode, referidoPorId, advisorId]
        );

        const savedUser = newUserQuery.rows[0];

        // 7. Si fue referido por un AMIGO, registrar en tabla referidos para sistema de $500
        if (referidoPorId) {
            try {
                await pool.query(`
                    INSERT INTO referidos (referidor_id, referido_id, status)
                    VALUES ($1, $2, 'pendiente')
                    ON CONFLICT (referidor_id, referido_id) DO NOTHING
                `, [referidoPorId, savedUser.id]);
                console.log(`[REFERIDOS] Registrado: ${referrerInfo?.name} refirió a ${fullName}`);
            } catch (refError) {
                console.error('[REFERIDOS] Error al registrar referido:', refError);
            }
        }

        // 7.5 Vincular órdenes y paquetes pendientes de TODOS los servicios
        try {
            // ===== MARÍTIMO (LOG) - por shipping_mark =====
            const linkedMaritime = await pool.query(`
                UPDATE maritime_orders 
                SET user_id = $1, updated_at = NOW()
                WHERE user_id IS NULL 
                AND UPPER(shipping_mark) LIKE '%' || $2 || '%'
                RETURNING ordersn
            `, [savedUser.id, newBoxId]);
            
            if (linkedMaritime.rowCount && linkedMaritime.rowCount > 0) {
                console.log(`[REGISTRO] ✅ Marítimo: ${linkedMaritime.rowCount} órdenes LOG vinculadas a ${newBoxId}`);
            }
            
            // ===== AÉREO CHINA (AIR) - china_receipts por shipping_mark =====
            const linkedReceipts = await pool.query(`
                UPDATE china_receipts 
                SET user_id = $1, updated_at = NOW()
                WHERE user_id IS NULL 
                AND UPPER(shipping_mark) = $2
                RETURNING id, fno
            `, [savedUser.id, newBoxId]);
            
            if (linkedReceipts.rowCount && linkedReceipts.rowCount > 0) {
                console.log(`[REGISTRO] ✅ Aéreo China: ${linkedReceipts.rowCount} receipts vinculados a ${newBoxId}`);
                
                // También vincular los paquetes relacionados a esos receipts
                const receiptIds = linkedReceipts.rows.map(r => r.id);
                const linkedAirPackages = await pool.query(`
                    UPDATE packages 
                    SET user_id = $1, updated_at = NOW()
                    WHERE user_id IS NULL 
                    AND china_receipt_id = ANY($2::int[])
                    RETURNING id
                `, [savedUser.id, receiptIds]);
                
                if (linkedAirPackages.rowCount && linkedAirPackages.rowCount > 0) {
                    console.log(`[REGISTRO]    → ${linkedAirPackages.rowCount} paquetes AIR vinculados`);
                }
            }
            
            // ===== TODOS LOS SERVICIOS - paquetes por box_id (PO Box, DHL, AIR, etc) =====
            const linkedPackages = await pool.query(`
                UPDATE packages 
                SET user_id = $1, updated_at = NOW()
                WHERE user_id IS NULL 
                AND UPPER(box_id) = $2
                RETURNING id, service_type
            `, [savedUser.id, newBoxId]);
            
            if (linkedPackages.rowCount && linkedPackages.rowCount > 0) {
                // Agrupar por servicio para logging
                const byService: { [key: string]: number } = {};
                linkedPackages.rows.forEach(p => {
                    const svc = p.service_type || 'unknown';
                    byService[svc] = (byService[svc] || 0) + 1;
                });
                console.log(`[REGISTRO] ✅ Paquetes vinculados a ${newBoxId}:`, byService);
            }
            
            // ===== Actualizar legacy_clients para marcar como reclamado =====
            await pool.query(`
                UPDATE legacy_clients 
                SET claimed_by_user_id = $1, claimed_at = NOW()
                WHERE UPPER(box_id) = $2 AND claimed_by_user_id IS NULL
            `, [savedUser.id, newBoxId]);
            
        } catch (linkError) {
            console.error('[REGISTRO] Error vinculando órdenes/paquetes:', linkError);
        }

        // 8. Generar token JWT
        const token = generateToken(savedUser.id, savedUser.email, savedUser.role);

        // 9. Responder al cliente (App/Web)
        res.status(201).json({
            message: '¡Usuario registrado exitosamente!',
            user: {
                id: savedUser.id,
                name: savedUser.full_name,
                email: savedUser.email,
                boxId: savedUser.box_id,
                role: savedUser.role,
                referralCode: savedUser.referral_code,
                referredBy: referidoPorId ? true : false,
                hasAdvisor: advisorId ? true : false
            },
            token // El usuario ya puede usar la app inmediatamente
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error al registrar en base de datos' });
    }
};

// ============ LOGIN ============
export const loginUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Validaciones básicas
        if (!email || !password) {
            res.status(400).json({ error: 'Email y contraseña son requeridos' });
            return;
        }

        // 1. Buscar usuario por email
        const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (userQuery.rows.length === 0) {
            res.status(401).json({ error: 'Credenciales inválidas' });
            return;
        }

        const user = userQuery.rows[0];

        // 2. Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            res.status(401).json({ error: 'Credenciales inválidas' });
            return;
        }

        // 3. Generar token JWT
        const token = generateToken(user.id, user.email, user.role);

        // 4. Determinar permisos y nivel de acceso
        const permissions = ROLE_PERMISSIONS[user.role] || [];
        const isAdmin = ['super_admin', 'admin', 'branch_manager', 'director'].includes(user.role);
        const isStaff = ['advisor', 'sub_advisor', 'counter_staff', 'warehouse_ops', 'customer_service', 'repartidor'].includes(user.role);

        // 5. Responder con datos del usuario, token y permisos
        res.json({
            message: getWelcomeMessage(user.role, user.full_name),
            user: {
                id: user.id,
                name: user.full_name,
                email: user.email,
                boxId: user.box_id,
                role: user.role,
                phone: user.phone,
                rfc: user.rfc || null,
                isVerified: user.is_verified || false,
                verificationStatus: user.verification_status || 'not_started',
                // 👷 Campo para onboarding de empleados
                isEmployeeOnboarded: user.is_employee_onboarded || false,
                // 📋 Aceptación de aviso de privacidad
                privacyAcceptedAt: user.privacy_accepted_at || null,
                // 📸 Foto de perfil del empleado (limitada para no sobrecargar localStorage)
                // Si es base64 muy grande, solo enviamos los primeros 1000 chars como indicador
                profilePhotoUrl: user.profile_photo_url && user.profile_photo_url.length > 10000 
                    ? null // No enviar fotos base64 muy grandes en login
                    : (user.profile_photo_url || null),
                // Campos financieros para mostrar en App
                walletBalance: parseFloat(user.wallet_balance) || 0,
                virtualClabe: user.virtual_clabe || null,
                hasCredit: user.has_credit || false,
                creditLimit: parseFloat(user.credit_limit) || 0,
                usedCredit: parseFloat(user.used_credit) || 0,
                isCreditBlocked: user.is_credit_blocked || false
            },
            access: {
                token,
                expiresIn: '7 días',
                permissions,
                isAdmin,
                isStaff,
                canAccessWebAdmin: isAdmin || isStaff,
                canAccessMobileApp: true, // Todos pueden usar la app
                mustChangePassword: user.must_change_password || false,
                canDocumentPackages: user.is_verified === true // Solo verificados pueden documentar
            }
        });

    } catch (error: any) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            error: 'Error al iniciar sesión',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined
        });
    }
};

// Mensaje de bienvenida personalizado según el rol
const getWelcomeMessage = (role: string, name: string): string => {
    const firstName = name.split(' ')[0];
    
    switch(role) {
        case 'super_admin':
            return `👑 ¡Bienvenido Jefe ${firstName}! Tienes control total del sistema.`;
        case 'branch_manager':
            return `🏢 ¡Hola ${firstName}! Panel de gerencia disponible.`;
        case 'counter_staff':
            return `💼 ¡Buen día ${firstName}! Listo para atender clientes.`;
        case 'warehouse_ops':
            return `📦 ¡Hola ${firstName}! Bodega lista para operar.`;
        default:
            return `¡Bienvenido a EntregaX, ${firstName}! Tu casillero está listo.`;
    }
};

// ============ MIDDLEWARE DE AUTENTICACIÓN ============
export interface AuthRequest extends Request {
    user?: {
        userId: number;
        email: string;
        role: string;
    };
}

// Definición de roles y sus permisos
export const ROLES = {
    SUPER_ADMIN: 'super_admin',        // Jefe máximo - acceso total
    ADMIN: 'admin',                    // Administrador general
    DIRECTOR: 'director',              // Director de área
    BRANCH_MANAGER: 'branch_manager',  // Gerente de sucursal
    CUSTOMER_SERVICE: 'customer_service', // Servicio a cliente
    OPERACIONES: 'operaciones',        // Operaciones marítimas
    COUNTER_STAFF: 'counter_staff',    // Personal de mostrador
    WAREHOUSE_OPS: 'warehouse_ops',    // Operaciones de bodega
    REPARTIDOR: 'repartidor',          // Repartidor / Delivery driver
    CLIENT: 'client'                   // Cliente final
} as const;

// Jerarquía de permisos (mayor número = más poder)
const ROLE_HIERARCHY: Record<string, number> = {
    [ROLES.SUPER_ADMIN]: 100,
    [ROLES.ADMIN]: 95,
    [ROLES.DIRECTOR]: 90,
    [ROLES.BRANCH_MANAGER]: 80,
    [ROLES.CUSTOMER_SERVICE]: 70,
    [ROLES.OPERACIONES]: 65,
    'advisor': 62,
    'sub_advisor': 61,
    [ROLES.COUNTER_STAFF]: 60,
    [ROLES.WAREHOUSE_OPS]: 40,
    [ROLES.REPARTIDOR]: 35,
    [ROLES.CLIENT]: 10,
    // Variantes con mayúsculas (para compatibilidad)
    'Operaciones': 65,
    'Super Admin': 100,
    'Admin': 95,
    'Director': 90,
    'Branch Manager': 80,
    'Customer Service': 70,
    'Counter Staff': 60,
    'Advisor': 62,
    'Sub Advisor': 61,
    'Warehouse Ops': 40,
    'Repartidor': 35,
    'Client': 10
};

// Función para normalizar roles (manejar inconsistencias)
function normalizeRoleForHierarchy(role: string): string {
    const roleMapping: Record<string, string> = {
        'Operaciones': ROLES.OPERACIONES,
        'operaciones': ROLES.OPERACIONES,
        'Super Admin': ROLES.SUPER_ADMIN,
        'super_admin': ROLES.SUPER_ADMIN,
        'Admin': ROLES.ADMIN,
        'admin': ROLES.ADMIN,
        'Director': ROLES.DIRECTOR,
        'director': ROLES.DIRECTOR,
        'Branch Manager': ROLES.BRANCH_MANAGER,
        'branch_manager': ROLES.BRANCH_MANAGER,
        'Customer Service': ROLES.CUSTOMER_SERVICE,
        'customer_service': ROLES.CUSTOMER_SERVICE,
        'Counter Staff': ROLES.COUNTER_STAFF,
        'counter_staff': ROLES.COUNTER_STAFF,
        'Warehouse Ops': ROLES.WAREHOUSE_OPS,
        'warehouse_ops': ROLES.WAREHOUSE_OPS,
        'Repartidor': ROLES.REPARTIDOR,
        'repartidor': ROLES.REPARTIDOR,
        'Client': ROLES.CLIENT,
        'client': ROLES.CLIENT
    };
    return roleMapping[role] || role;
}

// Permisos por rol
export const ROLE_PERMISSIONS: Record<string, string[]> = {
    [ROLES.SUPER_ADMIN]: ['*'], // Acceso total
    [ROLES.ADMIN]: ['users:*', 'shipments:*', 'quotes:*', 'reports:*', 'settings:read'], // Admin general
    [ROLES.DIRECTOR]: ['users:read', 'shipments:*', 'quotes:*', 'reports:*'], // Director de área
    [ROLES.BRANCH_MANAGER]: ['users:read', 'users:write', 'shipments:*', 'quotes:*', 'reports:read'],
    [ROLES.CUSTOMER_SERVICE]: ['clients:*', 'support:*', 'crm:*', 'quotes:read'], // Servicio a cliente
    [ROLES.OPERACIONES]: ['shipments:*', 'maritime:*', 'quotes:read', 'reports:read'], // Operaciones marítimas
    [ROLES.COUNTER_STAFF]: ['shipments:read', 'shipments:create', 'quotes:*', 'clients:read'],
    [ROLES.WAREHOUSE_OPS]: ['shipments:read', 'shipments:update_status', 'inventory:*'],
    [ROLES.REPARTIDOR]: ['deliveries:*', 'shipments:read', 'shipments:update_status'], // Entregas
    [ROLES.CLIENT]: ['profile:read', 'profile:update', 'shipments:own', 'quotes:own']
};

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    // Buscar token en header o en query string (para descargas de archivos)
    const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

    if (!token) {
        res.status(401).json({ error: 'Token de acceso requerido' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as {
            userId: number;
            email: string;
            role: string;
        };
        req.user = decoded;
        next();
    } catch (error) {
        res.status(403).json({ error: 'Token inválido o expirado' });
    }
};

// ============ MIDDLEWARE DE AUTORIZACIÓN POR ROL ============
// Verifica si el usuario tiene uno de los roles permitidos
export const requireRole = (...allowedRoles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        // Normalizar rol del usuario
        const userRole = normalizeRoleForHierarchy(req.user.role);

        // Super admin siempre tiene acceso
        if (userRole === ROLES.SUPER_ADMIN) {
            next();
            return;
        }

        // Verificar si el rol del usuario está en los permitidos
        if (allowedRoles.includes(userRole)) {
            next();
            return;
        }

        res.status(403).json({ 
            error: 'Acceso denegado',
            message: `Se requiere uno de estos roles: ${allowedRoles.join(', ')}`,
            tuRol: userRole
        });
    };
};

// Verifica si el usuario tiene un nivel de acceso mínimo
export const requireMinLevel = (minRole: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        // Normalizar rol del usuario para manejar inconsistencias de mayúsculas
        const normalizedUserRole = normalizeRoleForHierarchy(req.user.role);
        const userLevel = ROLE_HIERARCHY[normalizedUserRole] || ROLE_HIERARCHY[req.user.role] || 0;
        const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

        // DEBUG: Log para verificar niveles
        console.log(`[AUTH] User: ${req.user.email}, Role: ${req.user.role}, Normalized: ${normalizedUserRole}, UserLevel: ${userLevel}, Required: ${requiredLevel} (${minRole})`);

        if (userLevel >= requiredLevel) {
            next();
            return;
        }

        res.status(403).json({ 
            error: 'Nivel de acceso insuficiente',
            message: `Se requiere nivel ${minRole} o superior`
        });
    };
};

// ============ OBTENER PERFIL (RUTA PROTEGIDA) ============
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        
        const userQuery = await pool.query(
            `SELECT u.id, u.full_name, u.email, u.box_id, u.role, u.warehouse_location, u.created_at,
                    u.is_verified, u.verification_status, u.is_employee_onboarded, u.profile_photo_url,
                    u.phone, u.rfc, u.referred_by_id, u.privacy_accepted_at,
                    a.full_name as advisor_name,
                    a.phone as advisor_phone,
                    a.email as advisor_email
             FROM users u
             LEFT JOIN users a ON u.referred_by_id = a.id
             WHERE u.id = $1`,
            [userId]
        );

        if (userQuery.rows.length === 0) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }

        res.json(userQuery.rows[0]);
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
};

// Endpoint para ver todos los usuarios (solo para desarrollo)
export const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.full_name, u.email, u.box_id, u.role, u.created_at, u.advisor_id,
                   a.full_name as advisor_name
            FROM users u
            LEFT JOIN users a ON u.advisor_id = a.id
            ORDER BY u.created_at DESC
        `);
        
        res.json({
            total: result.rows.length,
            users: result.rows
        });
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ error: 'Error al consultar base de datos' });
    }
};

// ============ DASHBOARD SUMMARY ============
export const getDashboardSummary = async (_req: Request, res: Response): Promise<void> => {
    try {
        // Conteo total de usuarios
        const usersResult = await pool.query('SELECT COUNT(*) as total FROM users');
        const totalUsers = parseInt(usersResult.rows[0].total);

        // Conteo por roles
        const rolesResult = await pool.query(`
            SELECT role, COUNT(*) as count 
            FROM users 
            GROUP BY role
        `);
        
        const usersByRole: Record<string, number> = {};
        rolesResult.rows.forEach(row => {
            usersByRole[row.role] = parseInt(row.count);
        });

        // ========== DATOS REALES DE PAQUETES ==========
        // Paquetes en tránsito
        const inTransitResult = await pool.query(
            "SELECT COUNT(*) as count FROM packages WHERE status = 'in_transit'"
        );
        const packagesInTransit = parseInt(inTransitResult.rows[0].count);

        // Entregados hoy
        const deliveredTodayResult = await pool.query(
            "SELECT COUNT(*) as count FROM packages WHERE status = 'delivered' AND DATE(delivered_at) = CURRENT_DATE"
        );
        const deliveredToday = parseInt(deliveredTodayResult.rows[0].count);

        // Listos para recoger
        const pendingPickupResult = await pool.query(
            "SELECT COUNT(*) as count FROM packages WHERE status = 'ready_pickup'"
        );
        const pendingPickup = parseInt(pendingPickupResult.rows[0].count);

        // Recibidos hoy
        const receivedTodayResult = await pool.query(
            "SELECT COUNT(*) as count FROM packages WHERE DATE(received_at) = CURRENT_DATE"
        );
        const receivedToday = parseInt(receivedTodayResult.rows[0].count);

        // Total de paquetes
        const totalPackagesResult = await pool.query('SELECT COUNT(*) as count FROM packages');
        const totalPackages = parseInt(totalPackagesResult.rows[0].count);
        
        // Ingresos del mes (placeholder hasta implementar transacciones)
        const monthlyRevenue = 24500;   // $24.5k placeholder

        // Usuarios nuevos esta semana
        const newUsersResult = await pool.query(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE created_at >= NOW() - INTERVAL '7 days'
        `);
        const newUsersThisWeek = parseInt(newUsersResult.rows[0].count);

        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    byRole: usersByRole,
                    newThisWeek: newUsersThisWeek,
                    clients: usersByRole['client'] || 0,
                    staff: totalUsers - (usersByRole['client'] || 0)
                },
                packages: {
                    total: totalPackages,
                    inTransit: packagesInTransit,
                    deliveredToday: deliveredToday,
                    pendingPickup: pendingPickup,
                    receivedToday: receivedToday
                },
                revenue: {
                    monthly: monthlyRevenue,
                    currency: 'USD'
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error al obtener resumen del dashboard:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
};

// ============ CAMBIAR CONTRASEÑA (Obligatorio en primer login) ============
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const { currentPassword, newPassword } = req.body;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        if (!currentPassword || !newPassword) {
            res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
            return;
        }

        // Validar que la nueva contraseña no sea la contraseña por defecto
        if (newPassword === DEFAULT_PASSWORD) {
            res.status(400).json({ error: 'No puedes usar la contraseña por defecto. Elige una contraseña diferente.' });
            return;
        }

        // Validar longitud mínima
        if (newPassword.length < 6) {
            res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
            return;
        }

        // Obtener usuario actual
        const userQuery = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (userQuery.rows.length === 0) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }

        const user = userQuery.rows[0];

        // Verificar contraseña actual
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        
        if (!validPassword) {
            res.status(401).json({ error: 'La contraseña actual es incorrecta' });
            return;
        }

        // Encriptar nueva contraseña
        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Actualizar contraseña y quitar flag de cambio obligatorio
        await pool.query(
            'UPDATE users SET password = $1, must_change_password = false WHERE id = $2',
            [hashedNewPassword, userId]
        );

        res.json({
            success: true,
            message: '✅ Contraseña actualizada correctamente'
        });

    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
};

// ============ OBTENER LISTA DE ASESORES ============
export const getAdvisors = async (req: Request, res: Response): Promise<void> => {
    try {
        // Obtener todos los asesores y sub-asesores activos
        const result = await pool.query(`
            SELECT 
                u.id, 
                u.full_name, 
                u.email, 
                u.referral_code,
                (SELECT COUNT(*) FROM users WHERE referred_by_id = u.id) as clients_count
            FROM users u
            WHERE u.role IN ('advisor', 'sub_advisor')
            ORDER BY u.full_name ASC
        `);

        res.json({ advisors: result.rows });
    } catch (error) {
        console.error('Error al obtener asesores:', error);
        res.status(500).json({ error: 'Error al obtener asesores' });
    }
};

// ============ OBTENER MI ASESOR ACTUAL ============
export const getMyAdvisor = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as any;
        const userId = authReq.user?.userId;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        // Obtener el asesor referido del usuario
        const result = await pool.query(`
            SELECT 
                a.id, 
                a.full_name, 
                a.email, 
                a.referral_code
            FROM users u
            JOIN users a ON u.referred_by_id = a.id
            WHERE u.id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            res.json({ advisor: null });
            return;
        }

        res.json({ advisor: result.rows[0] });
    } catch (error) {
        console.error('Error al obtener asesor:', error);
        res.status(500).json({ error: 'Error al obtener asesor' });
    }
};

// ============ ACTUALIZAR PERFIL (TELÉFONO Y REF) ============
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as any;
        const userId = authReq.user?.userId;
        const { phone, referralCode, password, twoFactorCode } = req.body;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        // Obtener usuario actual
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }

        const user = userResult.rows[0];

        // Si se actualiza el teléfono, requiere verificación de contraseña
        if (phone !== undefined) {
            if (!password) {
                res.status(400).json({ error: 'Contraseña requerida para actualizar teléfono' });
                return;
            }

            // Verificar contraseña
            const passwordValid = await bcrypt.compare(password, user.password);
            if (!passwordValid) {
                res.status(401).json({ error: 'Contraseña incorrecta' });
                return;
            }

            // Verificar 2FA si está habilitado
            if (user.two_factor_enabled) {
                if (!twoFactorCode) {
                    res.status(400).json({ error: 'Código 2FA requerido' });
                    return;
                }

                // Verificar código 2FA
                const codeResult = await pool.query(
                    'SELECT * FROM two_factor_codes WHERE user_id = $1 AND code = $2 AND expires_at > NOW() AND used = false',
                    [userId, twoFactorCode]
                );

                if (codeResult.rows.length === 0) {
                    res.status(401).json({ error: 'Código 2FA inválido o expirado' });
                    return;
                }

                // Marcar código como usado
                await pool.query(
                    'UPDATE two_factor_codes SET used = true WHERE id = $1',
                    [codeResult.rows[0].id]
                );
            }

            // Actualizar teléfono
            await pool.query(
                'UPDATE users SET phone = $1 WHERE id = $2',
                [phone, userId]
            );
        }

        // Actualizar código de referencia propio
        if (referralCode !== undefined) {
            // Verificar que el código no esté en uso
            const codeCheck = await pool.query(
                'SELECT id FROM users WHERE referral_code = $1 AND id != $2',
                [referralCode.toUpperCase(), userId]
            );

            if (codeCheck.rows.length > 0) {
                res.status(400).json({ error: 'Código de referencia ya en uso' });
                return;
            }

            await pool.query(
                'UPDATE users SET referral_code = $1 WHERE id = $2',
                [referralCode.toUpperCase(), userId]
            );
        }

        // Actualizar RFC
        const { rfc } = req.body;
        if (rfc !== undefined) {
            await pool.query(
                'UPDATE users SET rfc = $1 WHERE id = $2',
                [rfc.toUpperCase().trim(), userId]
            );
        }

        // Obtener usuario actualizado
        const updatedUser = await pool.query(
            'SELECT id, full_name, email, phone, referral_code, rfc FROM users WHERE id = $1',
            [userId]
        );

        res.json({ 
            success: true,
            message: 'Perfil actualizado correctamente',
            user: updatedUser.rows[0]
        });
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
};

// ============ ACTUALIZAR FOTO DE PERFIL ============
export const updateProfilePhoto = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as any;
        const userId = authReq.user?.userId;
        const { photo } = req.body; // base64 string or null

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        // Validar tamaño si es base64 (máx ~2MB)
        if (photo && photo.length > 3 * 1024 * 1024) {
            res.status(400).json({ error: 'La imagen es demasiado grande (máx 2MB)' });
            return;
        }

        await pool.query(
            'UPDATE users SET profile_photo_url = $1 WHERE id = $2',
            [photo || null, userId]
        );

        res.json({ success: true, message: 'Foto de perfil actualizada' });
    } catch (error) {
        console.error('Error al actualizar foto de perfil:', error);
        res.status(500).json({ error: 'Error al actualizar foto de perfil' });
    }
};

// ============ ASIGNAR ASESOR ============
export const assignAdvisor = async (req: Request, res: Response): Promise<void> => {
    try {
        const authReq = req as any;
        const userId = authReq.user?.userId;
        const { advisorId } = req.body;

        if (!userId) {
            res.status(401).json({ error: 'No autenticado' });
            return;
        }

        if (!advisorId) {
            res.status(400).json({ error: 'ID de asesor requerido' });
            return;
        }

        // Verificar que el asesor existe y es válido
        const advisorCheck = await pool.query(
            "SELECT id, full_name, role FROM users WHERE id = $1 AND role IN ('advisor', 'sub_advisor')",
            [advisorId]
        );

        if (advisorCheck.rows.length === 0) {
            res.status(404).json({ error: 'Asesor no encontrado' });
            return;
        }

        // Actualizar el asesor del usuario
        await pool.query(
            'UPDATE users SET referred_by_id = $1 WHERE id = $2',
            [advisorId, userId]
        );

        res.json({ 
            success: true,
            message: `${advisorCheck.rows[0].full_name} ahora es tu asesor`,
            advisor: advisorCheck.rows[0]
        });
    } catch (error) {
        console.error('Error al asignar asesor:', error);
        res.status(500).json({ error: 'Error al asignar asesor' });
    }
};

// ============ ACTUALIZAR USUARIO (Admin) ============
export const updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { full_name, email, role, box_id, phone, advisor_id } = req.body;

        if (!id) {
            res.status(400).json({ error: 'ID de usuario requerido' });
            return;
        }

        // Verificar que el usuario existe
        const userCheck = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }

        // Construir query dinámicamente según campos proporcionados
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (full_name !== undefined) {
            updates.push(`full_name = $${paramCount++}`);
            values.push(full_name);
        }
        if (email !== undefined) {
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        if (role !== undefined) {
            // Validar que sea un rol válido
            const validRoles = ['super_admin', 'admin', 'director', 'branch_manager', 'customer_service', 
                               'counter_staff', 'warehouse_ops', 'advisor', 'sub_advisor', 'repartidor', 'client'];
            if (!validRoles.includes(role)) {
                res.status(400).json({ error: 'Rol no válido' });
                return;
            }
            updates.push(`role = $${paramCount++}`);
            values.push(role);
        }
        if (box_id !== undefined) {
            updates.push(`box_id = $${paramCount++}`);
            values.push(box_id);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${paramCount++}`);
            values.push(phone);
        }
        // Actualizar advisor_id (puede ser null para quitar el asesor)
        if (advisor_id !== undefined) {
            updates.push(`advisor_id = $${paramCount++}`);
            values.push(advisor_id || null);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
            return;
        }

        // Agregar ID al final de los valores
        values.push(id);

        const query = `
            UPDATE users 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, full_name, email, role, box_id, phone, created_at
        `;

        const result = await pool.query(query, values);

        res.json({ 
            success: true,
            message: 'Usuario actualizado correctamente',
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
};

// ============ DASHBOARD COUNTER STAFF (Mostrador) ============
export const getCounterStaffDashboard = async (_req: Request, res: Response): Promise<void> => {
    try {
        // Stats de entregas
        const deliveryStatsResult = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'ready_pickup') as pendientes,
                COUNT(*) FILTER (WHERE status = 'delivered' AND DATE(delivered_at) = CURRENT_DATE) as realizadas_hoy,
                COUNT(*) FILTER (WHERE status = 'ready_pickup' AND received_at < NOW() - INTERVAL '4 hours') as en_espera
            FROM packages
            WHERE (is_master = true OR master_id IS NULL)
        `);
        const deliveryStats = deliveryStatsResult.rows[0];

        // Stats de cobros
        const cobrosStatsResult = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE saldo_pendiente > 0 AND status NOT IN ('delivered')) as pendientes,
                COUNT(*) FILTER (WHERE DATE(updated_at) = CURRENT_DATE AND saldo_pendiente = 0) as cobrados_hoy,
                COALESCE(SUM(assigned_cost_mxn) FILTER (WHERE DATE(updated_at) = CURRENT_DATE AND saldo_pendiente = 0), 0) as monto_cobrado
            FROM packages
            WHERE (is_master = true OR master_id IS NULL)
        `);
        const cobrosStats = cobrosStatsResult.rows[0];

        // Stats de recepciones
        const recepcionStatsResult = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE DATE(received_at) = CURRENT_DATE) as hoy,
                COUNT(*) FILTER (WHERE status = 'received' AND needs_instructions = true) as por_registrar
            FROM packages
            WHERE (is_master = true OR master_id IS NULL)
        `);
        const recepcionStats = recepcionStatsResult.rows[0];

        // Paquetes listos para entrega (ready_pickup)
        const pendingDeliveriesResult = await pool.query(`
            SELECT 
                p.id,
                p.tracking_internal as tracking,
                u.full_name as cliente,
                u.box_id,
                COALESCE(p.saldo_pendiente, 0) as monto,
                p.carrier,
                p.total_boxes,
                CASE 
                    WHEN p.saldo_pendiente > 0 THEN 'pendiente_pago'
                    ELSE 'listo'
                END as status,
                CASE 
                    WHEN p.received_at > NOW() - INTERVAL '1 hour' THEN 'hace ' || EXTRACT(MINUTES FROM (NOW() - p.received_at))::int || 'min'
                    WHEN p.received_at > NOW() - INTERVAL '24 hours' THEN 'hace ' || EXTRACT(HOURS FROM (NOW() - p.received_at))::int || 'h'
                    ELSE 'ayer'
                END as llegada
            FROM packages p
            JOIN users u ON p.user_id = u.id
            WHERE p.status = 'ready_pickup'
            AND (p.is_master = true OR p.master_id IS NULL)
            ORDER BY p.received_at DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            stats: {
                entregas: {
                    pendientes: parseInt(deliveryStats.pendientes) || 0,
                    realizadas_hoy: parseInt(deliveryStats.realizadas_hoy) || 0,
                    en_espera: parseInt(deliveryStats.en_espera) || 0,
                },
                cobros: {
                    pendientes: parseInt(cobrosStats.pendientes) || 0,
                    cobrados_hoy: parseInt(cobrosStats.cobrados_hoy) || 0,
                    monto_cobrado: parseFloat(cobrosStats.monto_cobrado) || 0,
                },
                recepciones: {
                    hoy: parseInt(recepcionStats.hoy) || 0,
                    por_registrar: parseInt(recepcionStats.por_registrar) || 0,
                },
            },
            pendingDeliveries: pendingDeliveriesResult.rows.map(row => {
                // Determinar si es Pick Up basado en el carrier
                const isPickup = row.carrier === 'Pick Up Hidalgo TX';
                const totalBoxes = parseInt(row.total_boxes) || 1;
                
                return {
                    id: row.id,
                    tracking: row.tracking,
                    cliente: row.cliente,
                    box_id: row.box_id,
                    // Para Pick Up mostrar en USD ($3 por caja), para otros en MXN
                    monto: isPickup ? (3 * totalBoxes) : (parseFloat(row.monto) || 0),
                    moneda: isPickup ? 'USD' : 'MXN',
                    isPickup: isPickup,
                    status: row.status,
                    llegada: row.llegada,
                };
            }),
        });
    } catch (error) {
        console.error('Error al obtener dashboard counter staff:', error);
        res.status(500).json({ error: 'Error al obtener dashboard' });
    }
};
