// Vocabulario de modulos del producto. Fuente de verdad UNICA, compartida por:
//
//   - la telemetria de lectura (`module_viewed` se resuelve desde el pathname)
//   - el mapa de calor del admin (columnas de la matriz)
//   - la union de escrituras en `_admin_usage_events` (los `write: true`)
//
// Si los tres tuvieran su propia lista, un modulo nuevo aparecería en lecturas y
// no en escrituras, o al reves, y el mapa mentiria sin que nadie lo note.

export type ModuleKey =
  // Modulos con escritura: el heatmap los deriva de tablas reales.
  | "crm"
  | "quotations"
  | "operations"
  | "customers"
  | "payments"
  | "cash"
  | "invoicing"
  | "accounting"
  | "operator_payments"
  | "commissions"
  | "referrals"
  | "tasks"
  | "growth_studio"
  | "library"
  | "settings"
  | "support"
  // Modulos de solo lectura: no dejan filas, solo existen en el event stream.
  | "dashboard"
  | "reports"
  | "alerts"
  | "calendar"
  | "messages"
  | "ai"

export type ModuleDef = {
  key: ModuleKey
  label: string
  /** Etiqueta corta para el header del heatmap. */
  short: string
  /** `true` si el modulo deja filas en alguna tabla (ver la migracion del heatmap). */
  write: boolean
}

/**
 * Orden de columnas: sigue el recorrido real del producto
 * (mirar -> captar -> cotizar -> vender -> cobrar -> contabilizar -> operar),
 * no el alfabetico. Asi un hueco en el medio de la fila se lee como "se traba en
 * tal paso".
 */
export const PRODUCT_MODULES: readonly ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", short: "Dash.", write: false },
  { key: "crm", label: "CRM / Leads", short: "CRM", write: true },
  { key: "quotations", label: "Cotizaciones", short: "Cotiz.", write: true },
  { key: "operations", label: "Operaciones", short: "Oper.", write: true },
  { key: "customers", label: "Clientes", short: "Client.", write: true },
  { key: "payments", label: "Pagos", short: "Pagos", write: true },
  { key: "cash", label: "Caja y egresos", short: "Caja", write: true },
  { key: "invoicing", label: "Facturacion AFIP", short: "Fact.", write: true },
  { key: "accounting", label: "Contabilidad", short: "Contab.", write: true },
  { key: "operator_payments", label: "Pagos a operadores", short: "Op. pag.", write: true },
  { key: "commissions", label: "Comisiones", short: "Comis.", write: true },
  { key: "referrals", label: "Referidos", short: "Refer.", write: true },
  { key: "reports", label: "Reportes", short: "Report.", write: false },
  { key: "alerts", label: "Alertas", short: "Alert.", write: false },
  { key: "calendar", label: "Calendario", short: "Calend.", write: false },
  { key: "tasks", label: "Tareas", short: "Tareas", write: true },
  { key: "messages", label: "Mensajeria", short: "Msgs", write: false },
  { key: "ai", label: "Cerebro / IA", short: "IA", write: false },
  { key: "growth_studio", label: "Growth Studio", short: "Growth", write: true },
  { key: "library", label: "Biblioteca", short: "Bibliot.", write: true },
  { key: "settings", label: "Configuracion", short: "Config.", write: true },
  { key: "support", label: "Soporte y ayuda", short: "Ayuda", write: true },
]

const MODULE_KEYS = new Set<string>(PRODUCT_MODULES.map((m) => m.key))

export function isModuleKey(value: string | null | undefined): value is ModuleKey {
  return !!value && MODULE_KEYS.has(value)
}

/**
 * Reglas de pathname -> modulo, evaluadas EN ORDEN: la primera que matchea gana.
 *
 * Por eso `/operations/billing` va antes que `/operations`: si no, facturar
 * contaria como uso del modulo de operaciones y `invoicing` quedaria vacio para
 * siempre.
 */
const PATH_RULES: readonly { prefix: string; module: ModuleKey }[] = [
  { prefix: "/operations/billing", module: "invoicing" },
  { prefix: "/operations", module: "operations" },
  { prefix: "/sales/quotations", module: "quotations" },
  { prefix: "/sales", module: "crm" },
  { prefix: "/customers", module: "customers" },
  { prefix: "/payments", module: "payments" },
  { prefix: "/cash", module: "cash" },
  { prefix: "/expenses", module: "cash" },
  { prefix: "/accounting", module: "accounting" },
  { prefix: "/finances", module: "accounting" },
  { prefix: "/settings/commissions-monthly", module: "commissions" },
  // `/commissions-monthly` y `/my/commissions-monthly` son pantallas propias, no
  // subrutas de `/commissions`: el match es por limite de segmento, asi que sin
  // estas dos reglas caian en `null` y no emitian nada.
  { prefix: "/commissions-monthly", module: "commissions" },
  { prefix: "/my/commissions-monthly", module: "commissions" },
  { prefix: "/my/commissions", module: "commissions" },
  { prefix: "/my/balance", module: "commissions" },
  { prefix: "/commissions", module: "commissions" },
  { prefix: "/referrals", module: "referrals" },
  { prefix: "/reports", module: "reports" },
  { prefix: "/alerts", module: "alerts" },
  // Las notificaciones son el mismo trabajo que las alertas desde el punto de
  // vista del usuario: revisar lo que el sistema le marco.
  { prefix: "/notifications", module: "alerts" },
  { prefix: "/calendar", module: "calendar" },
  { prefix: "/tools/tasks", module: "tasks" },
  { prefix: "/tools/cerebro", module: "ai" },
  { prefix: "/tools/wha-control", module: "messages" },
  // Va DESPUES de las tres rutas especificas de `/tools/*`, y antes que nada
  // mas: `/tools/settings` es configuracion de herramientas.
  { prefix: "/tools/settings", module: "settings" },
  { prefix: "/messages", module: "messages" },
  { prefix: "/eve", module: "messages" },
  { prefix: "/emilia", module: "messages" },
  { prefix: "/growth-studio", module: "growth_studio" },
  { prefix: "/library", module: "library" },
  { prefix: "/resources", module: "library" },
  { prefix: "/ayuda", module: "support" },
  // Los operadores son catalogo, igual que la tabla `operators` en la union de
  // escrituras: mismo modulo en las dos señales o el mapa se contradice.
  { prefix: "/operators", module: "settings" },
  { prefix: "/settings", module: "settings" },
  { prefix: "/dashboard", module: "dashboard" },
]

/**
 * Rutas que NO son uso del producto por parte de un tenant.
 *
 * `/admin` es la clave y es facil de pasar por alto: los platform admins tienen
 * `org_id` de una agencia real (admin@vibook.ai pertenece a Lozada), asi que sin
 * esta exclusion cada rato que pasas en la consola de plataforma se contabiliza
 * como si esa agencia estuviera trabajando.
 */
const NON_TENANT_PREFIXES: readonly string[] = [
  "/admin",
  "/onboarding",
  "/paywall",
  "/login",
  "/register",
  "/logout",
  "/post-login",
  "/auth",
  "/cotizacion",
]

/** `true` si en `pathname` se puede emitir telemetria de uso de tenant. */
export function isTenantUsagePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return !NON_TENANT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Modulo al que pertenece un pathname, o `null` si no mapea a ninguno.
 *
 * Recibe el pathname crudo: hace su propio match por limite de segmento, asi
 * que no depende de que ya haya pasado por `normalizePath()`.
 */
export function moduleFromPath(pathname: string | null | undefined): ModuleKey | null {
  if (!isTenantUsagePath(pathname)) return null
  const path = (pathname ?? "").replace(/\/+$/, "") || "/"

  for (const rule of PATH_RULES) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule.module
    }
  }

  // La home del dashboard puede venir como "/" segun el route group.
  if (path === "/") return "dashboard"
  return null
}
