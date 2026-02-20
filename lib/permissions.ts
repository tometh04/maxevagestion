/**
 * SISTEMA DE PERMISOS GRANULAR
 * 
 * Define qué puede ver/hacer cada rol en cada módulo del sistema
 */

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "CONTABLE" | "SELLER" | "VIEWER"

export type Module =
  | "dashboard"
  | "leads"
  | "operations"
  | "customers"
  | "operators"
  | "cash"
  | "accounting"
  | "alerts"
  | "reports"
  | "commissions"
  | "settings"
  | "documents"
  | "tasks"

export type Permission = "read" | "write" | "delete" | "export"

interface ModulePermissions {
  read: boolean
  write: boolean
  delete: boolean
  export: boolean
  // Si es true, solo ve sus propios datos
  ownDataOnly?: boolean
}

type RolePermissions = Record<Module, ModulePermissions>

/**
 * Matriz de permisos por rol y módulo
 */
const PERMISSIONS: Record<UserRole, RolePermissions> = {
  SUPER_ADMIN: {
    dashboard: { read: true, write: true, delete: true, export: true },
    leads: { read: true, write: true, delete: true, export: true },
    operations: { read: true, write: true, delete: true, export: true },
    customers: { read: true, write: true, delete: true, export: true },
    operators: { read: true, write: true, delete: true, export: true },
    cash: { read: true, write: true, delete: true, export: true },
    accounting: { read: true, write: true, delete: true, export: true },
    alerts: { read: true, write: true, delete: true, export: true },
    reports: { read: true, write: true, delete: true, export: true },
    commissions: { read: true, write: true, delete: true, export: true },
    settings: { read: true, write: true, delete: true, export: true },
    documents: { read: true, write: true, delete: true, export: true },
    tasks: { read: true, write: true, delete: true, export: true },
  },
  ADMIN: {
    dashboard: { read: true, write: true, delete: false, export: true },
    leads: { read: true, write: true, delete: false, export: true },
    operations: { read: true, write: true, delete: false, export: true },
    customers: { read: true, write: true, delete: false, export: true },
    operators: { read: true, write: true, delete: false, export: true },
    cash: { read: true, write: true, delete: false, export: true },
    accounting: { read: true, write: true, delete: false, export: true },
    alerts: { read: true, write: true, delete: true, export: true },
    reports: { read: true, write: true, delete: false, export: true },
    commissions: { read: true, write: true, delete: false, export: true },
    settings: { read: true, write: false, delete: false, export: false }, // No puede modificar settings
    documents: { read: true, write: true, delete: false, export: true },
    tasks: { read: true, write: true, delete: false, export: false },
  },
  CONTABLE: {
    dashboard: { read: false, write: false, delete: false, export: false }, // No ve dashboard general
    leads: { read: false, write: false, delete: false, export: false }, // No ve leads
    operations: { read: true, write: false, delete: false, export: true }, // Solo lectura de operaciones
    customers: { read: false, write: false, delete: false, export: false }, // No ve clientes
    operators: { read: true, write: true, delete: false, export: true },
    cash: { read: true, write: true, delete: false, export: true },
    accounting: { read: true, write: true, delete: false, export: true },
    alerts: { read: true, write: true, delete: false, export: false }, // Solo alertas contables
    reports: { read: true, write: false, delete: false, export: true }, // Solo reportes financieros
    commissions: { read: true, write: false, delete: false, export: true }, // Solo lectura
    settings: { read: false, write: false, delete: false, export: false }, // No ve settings
    documents: { read: false, write: false, delete: false, export: false }, // No ve documentos
    tasks: { read: true, write: true, delete: false, export: false },
  },
  SELLER: {
    dashboard: { read: true, write: false, delete: false, export: false, ownDataOnly: true }, // Solo sus datos
    leads: { read: true, write: true, delete: false, export: false, ownDataOnly: true }, // Solo sus leads asignados
    operations: { read: true, write: false, delete: false, export: false, ownDataOnly: true }, // Solo sus operaciones
    customers: { read: true, write: false, delete: false, export: false, ownDataOnly: true }, // Solo clientes de sus operaciones
    operators: { read: false, write: false, delete: false, export: false }, // No ve operadores
    cash: { read: false, write: false, delete: false, export: false }, // No ve caja
    accounting: { read: false, write: false, delete: false, export: false }, // No ve contabilidad
    alerts: { read: true, write: true, delete: false, export: false, ownDataOnly: true }, // Solo sus alertas
    reports: { read: true, write: false, delete: false, export: true, ownDataOnly: true }, // Solo reportes propios
    commissions: { read: true, write: false, delete: false, export: true, ownDataOnly: true }, // Solo sus comisiones
    settings: { read: false, write: false, delete: false, export: false }, // No ve settings
    documents: { read: true, write: true, delete: false, export: false, ownDataOnly: true }, // Solo documentos de sus operaciones
    tasks: { read: true, write: true, delete: false, export: false, ownDataOnly: true },
  },
  VIEWER: {
    dashboard: { read: true, write: false, delete: false, export: false },
    leads: { read: true, write: false, delete: false, export: false },
    operations: { read: true, write: false, delete: false, export: false },
    customers: { read: true, write: false, delete: false, export: false },
    operators: { read: true, write: false, delete: false, export: false },
    cash: { read: true, write: false, delete: false, export: false },
    accounting: { read: true, write: false, delete: false, export: false },
    alerts: { read: true, write: false, delete: false, export: false },
    reports: { read: true, write: false, delete: false, export: true },
    commissions: { read: true, write: false, delete: false, export: false },
    settings: { read: false, write: false, delete: false, export: false },
    documents: { read: true, write: false, delete: false, export: false },
    tasks: { read: true, write: false, delete: false, export: false },
  },
}

/**
 * Verifica si un rol tiene un permiso específico en un módulo
 */
export function hasPermission(
  role: UserRole,
  module: Module,
  permission: Permission
): boolean {
  const modulePerms = PERMISSIONS[role]?.[module]
  if (!modulePerms) return false

  return modulePerms[permission] === true
}

/**
 * Verifica si un rol puede acceder a un módulo (al menos lectura)
 */
export function canAccessModule(role: UserRole, module: Module): boolean {
  return hasPermission(role, module, "read")
}

/**
 * Verifica si un rol solo puede ver sus propios datos en un módulo
 */
export function isOwnDataOnly(role: UserRole, module: Module): boolean {
  const modulePerms = PERMISSIONS[role]?.[module]
  return modulePerms?.ownDataOnly === true
}

/**
 * Obtiene todos los módulos a los que un rol tiene acceso
 */
export function getAccessibleModules(role: UserRole): Module[] {
  const modules = Object.keys(PERMISSIONS[role] || {}) as Module[]
  return modules.filter((module) => canAccessModule(role, module))
}

/**
 * Verifica si un rol puede ver un módulo específico en el sidebar
 */
export function shouldShowInSidebar(role: UserRole, module: Module): boolean {
  // CONTABLE no ve dashboard, leads, customers
  if (role === "CONTABLE") {
    return ["operations", "operators", "cash", "accounting", "alerts", "reports", "commissions", "tasks"].includes(module)
  }

  // SELLER no ve operators, cash, accounting, settings
  if (role === "SELLER") {
    return ["dashboard", "leads", "operations", "customers", "alerts", "reports", "commissions", "documents", "tasks"].includes(module)
  }

  // VIEWER ve todo excepto settings
  if (role === "VIEWER") {
    return module !== "settings"
  }

  // SUPER_ADMIN y ADMIN ven todo
  return true
}

/**
 * Helper para verificar permisos en componentes
 */
export function usePermissions(role: UserRole) {
  return {
    canRead: (module: Module) => hasPermission(role, module, "read"),
    canWrite: (module: Module) => hasPermission(role, module, "write"),
    canDelete: (module: Module) => hasPermission(role, module, "delete"),
    canExport: (module: Module) => hasPermission(role, module, "export"),
    ownDataOnly: (module: Module) => isOwnDataOnly(role, module),
    canAccess: (module: Module) => canAccessModule(role, module),
  }
}

