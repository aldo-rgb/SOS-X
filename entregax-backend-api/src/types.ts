// Define los roles del sistema EntregaX
export type UserRole = 
    | 'super_admin'      // Jefe máximo - control total
    | 'admin'            // Administrador general
    | 'director'         // Director de área
    | 'branch_manager'   // Gerente de sucursal
    | 'customer_service' // Servicio a cliente
    | 'counter_staff'    // Personal de mostrador
    | 'warehouse_ops'    // Operaciones de bodega
    | 'client';          // Cliente final

// Define la estructura de un Usuario de EntregaX
export interface User {
    id: string;           // Identificador único interno
    fullName: string;     // Nombre completo (Ej. Victor Hugo Navarro)
    email: string;        // Correo (Login)
    password: string;     // Contraseña encriptada
    boxId: string;        // EL ORO: Su número de casillero (Ej. ETX-1228)
    role: UserRole;       // Quién es en el sistema
    createdAt: Date;
}

// Respuesta del Login
export interface LoginResponse {
    message: string;
    user: {
        id: number;
        name: string;
        email: string;
        boxId: string;
        role: UserRole;
    };
    access: {
        token: string;
        expiresIn: string;
        permissions: string[];
        isAdmin: boolean;
        isStaff: boolean;
        canAccessWebAdmin: boolean;
        canAccessMobileApp: boolean;
    };
}

// Payload del JWT
export interface JWTPayload {
    userId: number;
    email: string;
    role: UserRole;
    iat?: number;
    exp?: number;
}
