/**
 * SISTEMA DE PERMISOS GRANULAR
 * 
 * Define qué puede ver/hacer cada rol en cada módulo del sistema
 */

// SaaS Pilar 4: ORG_OWNER es el nombre canónico para owners de tenants en el
// modelo SaaS. SUPER_ADMIN queda como alias legacy con permisos idénticos
// — eso permite introducir ORG_OWNER sin refactorizar 94 comparaciones
// distribuidas por todo el código. Ambos resuelven a la misma RolePermissions.
export type UserRole = "SUPER_ADMIN" | "ORG_OWNER" | "ADMIN" | "CONTABLE" | "SELLER" | "VIEWER" | "POST_VENTA"

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
  | "eve"
  | "referrals"

export type Permission = "read" | "write" | "delete" | "export"

interface ModulePermissions {
  read: boolean
  write: boolean
  delete: boolean
  export: boolean
  // Si es true, solo ve sus propios datos
  ownDataOnly?: boolean
}

export type RolePermissions = Record<Module, ModulePermissions>

/**
 * Matriz de permisos por rol y módulo
 */
export const SUPER_ADMIN_PERMS: RolePermissions = {
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
  eve: { read: true, write: true, delete: true, export: false },
  referrals: { read: true, write: true, delete: true, export: true },
}

export const PERMISSIONS: Record<UserRole, RolePermissions> = {
  SUPER_ADMIN: SUPER_ADMIN_PERMS,
  ORG_OWNER: SUPER_ADMIN_PERMS, // alias — ver nota en UserRole
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
    eve: { read: true, write: true, delete: true, export: false },
    // VIB-86: los referidores los da de alta el administrador, y el porcentaje
    // que se lleva cada uno solo lo ve quien tiene este permiso.
    referrals: { read: true, write: true, delete: true, export: true },
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
    eve: { read: false, write: false, delete: false, export: false },
    // Liquida las comisiones al referidor, así que las ve; no da de alta
    // referidores. Antes no podía crearlos igual (customers.read = false), pero
    // sí veía la pantalla: con el permiso propio esa inconsistencia se resuelve.
    referrals: { read: true, write: false, delete: false, export: true },
  },
  SELLER: {
    dashboard: { read: true, write: false, delete: false, export: false, ownDataOnly: true }, // Solo sus datos
    leads: { read: true, write: true, delete: false, export: false, ownDataOnly: true }, // Solo sus leads asignados
    operations: { read: true, write: true, delete: false, export: false, ownDataOnly: true }, // Puede crear operaciones, solo ve las suyas
    customers: { read: true, write: true, delete: false, export: false, ownDataOnly: true }, // Puede crear clientes desde operaciones
    operators: { read: false, write: false, delete: false, export: false }, // No ve operadores
    cash: { read: false, write: false, delete: false, export: false }, // No ve caja
    accounting: { read: false, write: false, delete: false, export: false }, // No ve contabilidad
    alerts: { read: true, write: true, delete: false, export: false, ownDataOnly: true }, // Solo sus alertas
    reports: { read: true, write: false, delete: false, export: true, ownDataOnly: true }, // Solo reportes propios
    commissions: { read: true, write: false, delete: false, export: true, ownDataOnly: true }, // Solo sus comisiones
    settings: { read: false, write: false, delete: false, export: false }, // No ve settings
    documents: { read: true, write: true, delete: false, export: false, ownDataOnly: true }, // Solo documentos de sus operaciones
    tasks: { read: true, write: true, delete: false, export: false, ownDataOnly: true },
    eve: { read: false, write: false, delete: false, export: false },
    // VIB-86: el vendedor selecciona un referidor al cargar la venta, pero no
    // ve cuánto se lleva ni puede darlo de alta. La API le manda solo el nombre.
    referrals: { read: false, write: false, delete: false, export: false },
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
    eve: { read: false, write: false, delete: false, export: false },
    // Rol de solo lectura: ve lo mismo que en comisiones, sin poder editar.
    referrals: { read: true, write: false, delete: false, export: false },
  },
  // POST_VENTA: ve y gestiona el seguimiento post-cierre de operaciones.
  // Puede cargar vouchers enviados, check-in realizado, y consultar requisitos
  // de destino. Ve TODAS las operaciones (no solo las propias) para cubrir
  // el seguimiento de todos los vendedores.
  POST_VENTA: {
    dashboard:  { read: true,  write: false, delete: false, export: false },
    leads:      { read: false, write: false, delete: false, export: false },
    operations: { read: true,  write: true,  delete: false, export: false },
    customers:  { read: true,  write: false, delete: false, export: false },
    operators:  { read: false, write: false, delete: false, export: false },
    cash:       { read: false, write: false, delete: false, export: false },
    accounting: { read: false, write: false, delete: false, export: false },
    alerts:     { read: true,  write: true,  delete: false, export: false },
    reports:    { read: false, write: false, delete: false, export: false },
    commissions:{ read: false, write: false, delete: false, export: false },
    settings:   { read: true,  write: false, delete: false, export: false }, // Para requisitos de destino
    documents:  { read: true,  write: true,  delete: false, export: false }, // Cargar vouchers
    tasks:      { read: true,  write: true,  delete: false, export: false },
    eve:        { read: false, write: false, delete: false, export: false },
    // Post venta no toca plata (commissions ya está en false).
    referrals:  { read: false, write: false, delete: false, export: false },
  },
}

/**
 * VIB-69 — Asesor de viajes independiente (AVI).
 *
 * Un freelancer que vende para la agencia: carga sus ventas y ve solo lo suyo.
 * NO es un `UserRole` nuevo: en DB es un SELLER con `is_independent_advisor`.
 * La restricción "solo mis datos" ya está implementada y auditada para SELLER en
 * toda la app (filtros de operaciones, RPCs con `p_role = 'SELLER'`, selectores
 * de vendedor, reglas de comisión `type = 'SELLER'`); un string de rol nuevo
 * caería en la rama "else" de esos checks y vería TODA la agencia.
 *
 * Lo que agrega el flag es un TECHO: los permisos efectivos del asesor son la
 * intersección de lo que resuelva el sistema (defaults, overrides por agencia,
 * roles adicionales) con esta matriz. Nunca puede terminar con más de esto.
 *
 * Delta contra SELLER: no ve leads ni el CRM (trae su propia cartera). El resto
 * del endurecimiento es de comportamiento y vive en lib/permissions-api.ts:
 * sin selector global de clientes y sin los permisos especiales de agencia.
 */
export const INDEPENDENT_ADVISOR_PERMS: RolePermissions = {
  ...PERMISSIONS.SELLER,
  leads: { read: false, write: false, delete: false, export: false },
}

/**
 * Valor sintético que usa la UI para ofrecer "Asesor independiente" como una
 * opción más en el selector de rol. Nunca se persiste: el endpoint lo traduce a
 * `role = SELLER` + `is_independent_advisor = true`.
 */
export const INDEPENDENT_ADVISOR_ROLE_VALUE = "SELLER_INDEPENDENT"

export type MaybeIndependentAdvisor = {
  role?: string | null
  is_independent_advisor?: boolean | null
}

/**
 * ¿El usuario es un asesor de viajes independiente?
 *
 * Exige `role === "SELLER"` a propósito: si un admin le cambia el rol a otra
 * cosa sin bajar el flag, el helper queda inerte en vez de aplicar un techo de
 * vendedor sobre, por ejemplo, un contable.
 */
export function isIndependentAdvisor(user: MaybeIndependentAdvisor | null | undefined): boolean {
  return user?.is_independent_advisor === true && user?.role === "SELLER"
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

  // VIEWER ve todo excepto settings y eve (eve es solo ADMIN/SUPER_ADMIN)
  if (role === "VIEWER") {
    return module !== "settings" && module !== "eve"
  }

  // POST_VENTA ve operaciones, clientes, alertas, documentos, tareas y settings (requisitos de destino)
  if (role === "POST_VENTA") {
    return ["dashboard", "operations", "customers", "alerts", "documents", "tasks", "settings"].includes(module)
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

const ALL_MODULES_LIST: Module[] = [
  "dashboard", "leads", "operations", "customers", "operators",
  "cash", "accounting", "alerts", "reports", "commissions",
  "settings", "documents", "tasks", "eve",
]

/**
 * Combina los permisos de múltiples roles usando lógica OR:
 * - read/write/delete/export: true si CUALQUIER rol lo permite
 * - ownDataOnly: true solo si TODOS los roles lo restringen (AND)
 *
 * Ejemplo: SELLER+CONTABLE en `leads` → read=true, ownDataOnly=false
 * (CONTABLE no tiene ownDataOnly=true, por lo que el AND da false)
 */
export function mergeRolePermissions(roles: UserRole[]): RolePermissions {
  if (roles.length === 0) {
    return Object.fromEntries(
      ALL_MODULES_LIST.map((m) => [
        m,
        { read: false, write: false, delete: false, export: false, ownDataOnly: true },
      ])
    ) as RolePermissions
  }
  if (roles.length === 1) return PERMISSIONS[roles[0]]

  return Object.fromEntries(
    ALL_MODULES_LIST.map((m) => {
      const perms = roles.map((r) => PERMISSIONS[r]?.[m])
      return [
        m,
        {
          read:        perms.some((p) => p?.read === true),
          write:       perms.some((p) => p?.write === true),
          delete:      perms.some((p) => p?.delete === true),
          export:      perms.some((p) => p?.export === true),
          // AND: ownDataOnly=true solo si TODOS los roles lo restringen
          ownDataOnly: perms.every((p) => p?.ownDataOnly === true),
        },
      ]
    })
  ) as RolePermissions
}

/**
 * Dado un array de roles, devuelve el que otorga el mayor scope de agencias.
 * Se usa para llamar a getUserAgencyIds() con el rol más amplio del usuario.
 * Prioridad: SUPER_ADMIN > ORG_OWNER > CONTABLE > POST_VENTA > ADMIN > SELLER > VIEWER
 */
export function getEffectiveAgencyScopeRole(roles: UserRole[]): UserRole {
  const priority: UserRole[] = [
    "SUPER_ADMIN", "ORG_OWNER", "CONTABLE", "POST_VENTA", "ADMIN", "SELLER", "VIEWER",
  ]
  for (const r of priority) {
    if (roles.includes(r)) return r
  }
  return roles[0] ?? "VIEWER"
}

/**
 * Versión multi-rol de shouldShowInSidebar.
 * Devuelve true si CUALQUIER rol del usuario debe mostrar el módulo en el sidebar.
 */
export function shouldShowInSidebarMulti(roles: UserRole[], module: Module): boolean {
  return roles.some((r) => shouldShowInSidebar(r, module))
}

