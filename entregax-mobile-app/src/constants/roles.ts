// Roles de empleados que deben ir al EmployeeHomeScreen
export const EMPLOYEE_ROLES = [
  'repartidor',
  'warehouse_ops',
  'counter_staff',
  'customer_service',
  // Soporte Técnico atiende los mismos tickets que Servicio a Cliente y en el
  // panel de empleado ya tenía sus módulos asignados, pero no estaba en esta
  // lista: al abrir la app caía en el panel de CLIENTE y no podía llegar a
  // ellos.
  'soporte_tecnico',
  'branch_manager',
  // Contabilidad tambien tenia modulo propio en el panel de empleado (Control
  // de Gastos) sin poder llegar a el, y es de los que mas usan Mis Tareas.
  'accountant',
  'director',
  'admin',
  'super_admin',
  // Roles de asesores
  'advisor',
  'asesor',
  'asesor_lider',
  'sub_advisor'
];

// Roles de clientes
export const CLIENT_ROLES = ['client', 'user'];

// Roles que pueden acceder al escáner de bodega
export const SCANNER_ROLES = [
  'repartidor',
  'monitoreo',
  'warehouse_ops',
  'counter_staff',
  'branch_manager',
  'admin',
  'super_admin'
];
