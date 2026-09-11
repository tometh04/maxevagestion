import { hasAdminRole, type Module, type Permission } from "@/lib/permissions"

/**
 * Catálogo de exportaciones de datos de la agencia (Cuenta → Exportar datos).
 *
 * Las exportaciones ya existían, pero repartidas: el CSV de clientes vivía en
 * el listado de clientes, el de caja en Caja y Bancos, el ZIP de facturas
 * adentro de un diálogo de Facturación y los libros en Contabilidad. Una
 * agencia que quiere bajarse SU información —para el contador, para migrar,
 * para un respaldo— tenía que saber de memoria en qué pantalla estaba cada
 * cosa.
 *
 * Este módulo es la única definición de qué se puede exportar. No agrega
 * endpoints ni amplía permisos: describe los que ya existen y arma su URL.
 * Sumar una exportación al centro es sumar una entrada acá.
 *
 * Invariante deliberado: `gate` declara el permiso que el ENDPOINT chequea de
 * verdad, no el que nos gustaría. Si acá dijera otra cosa, la pantalla
 * ofrecería descargas que terminan en 403, o escondería descargas que el
 * usuario sí puede hacer desde la pantalla original — las dos formas de mentir.
 */

export type ExportGroupId =
  | "clientes"
  | "finanzas"
  | "facturacion"
  | "contabilidad"
  | "agencia"

export interface ExportGroup {
  id: ExportGroupId
  label: string
}

export const EXPORT_GROUPS: readonly ExportGroup[] = [
  { id: "clientes", label: "Clientes, leads y operaciones" },
  { id: "finanzas", label: "Finanzas" },
  { id: "facturacion", label: "Facturación" },
  { id: "contabilidad", label: "Libros contables" },
  { id: "agencia", label: "Proveedores y equipo" },
] as const

/** Controles que necesita una exportación además de los compartidos. */
export type ExportControl = "period" | "agency" | "month"

export interface ExportFormatOption {
  /** Valor que viaja en la query string del endpoint. */
  id: string
  label: string
}

/**
 * Cómo autoriza el endpoint.
 *
 * `orgAdminOrAccountant` existe porque el Libro IVA no se gatea por la matriz
 * de módulos sino por rol: es un libro fiscal y su acceso no se delega a un
 * override por agencia.
 */
export type ExportGate =
  | {
      kind: "module"
      module: Module
      permission: Permission
      /**
       * La exportación baja TODO el módulo, sin recortarlo al usuario.
       *
       * Los endpoints viejos (clientes, operaciones) filtran por sí mismos
       * cuando el rol está limitado a sus propios datos, así que pueden
       * ofrecerse igual. Los datasets nuevos no lo hacen: no tiene sentido
       * bajar "la cartera de operadores de la agencia" recortada a un usuario,
       * y ofrecerla sin recortar sería ampliar el alcance. Con este flag, a
       * quien está limitado a lo suyo no se le ofrece.
       */
      requiresFullScope?: true
    }
  | { kind: "orgAdminOrAccountant" }

/** Estado de los filtros de la pantalla, del que sale cada URL. */
export interface ExportSelection {
  /** YYYY-MM-DD */
  dateFrom: string
  /** YYYY-MM-DD */
  dateTo: string
  /** "ALL" = todas las agencias del usuario. */
  agencyId: string
  year: number
  /** 1-12 */
  month: number
}

export interface ExportDefinition {
  id: string
  groupId: ExportGroupId
  label: string
  /** Qué trae el archivo, en términos del usuario. */
  description: string
  gate: ExportGate
  controls: readonly ExportControl[]
  formats: readonly ExportFormatOption[]
  /** Límite o criterio que el usuario necesita saber antes de descargar. */
  note?: string
  buildUrl: (formatId: string, selection: ExportSelection) => string
}

function qs(entries: Array<[string, string | number | undefined | null]>): string {
  const params = new URLSearchParams()
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  return params.toString()
}

/**
 * Todos los endpoints tratan el parámetro ausente y "ALL" como "todas las
 * agencias"; omitirlo es lo que funciona en los dos casos.
 */
function agencyParam(selection: ExportSelection): string | undefined {
  return selection.agencyId && selection.agencyId !== "ALL" ? selection.agencyId : undefined
}

/**
 * Los datos que no tenían endpoint propio se sirven todos desde
 * `/api/exports/[dataset]`, que resuelve el permiso con ESTE mismo catálogo: la
 * pantalla y la API leen una sola definición y no pueden discrepar.
 *
 * Los filtros se mandan solo cuando la exportación los declara; un maestro como
 * el plan de cuentas no se recorta por período.
 */
function datasetUrl(
  datasetId: string,
  selection: ExportSelection,
  options: { period?: boolean; agency?: boolean } = {}
): string {
  const query = qs([
    ["dateFrom", options.period ? selection.dateFrom : undefined],
    ["dateTo", options.period ? selection.dateTo : undefined],
    ["agencyId", options.agency ? agencyParam(selection) : undefined],
  ])
  return query ? `/api/exports/${datasetId}?${query}` : `/api/exports/${datasetId}`
}

export const EXPORT_DEFINITIONS: readonly ExportDefinition[] = [
  {
    id: "customers",
    groupId: "clientes",
    label: "Clientes",
    description:
      "La cartera completa con datos de contacto, documento, nacionalidad y vendedor asignado.",
    gate: { kind: "module", module: "customers", permission: "read" },
    controls: [],
    note: "No se recorta por período. Máximo 5.000 clientes por descarga.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: () => "/api/customers/export-csv",
  },
  {
    id: "leads",
    groupId: "clientes",
    label: "Leads del CRM",
    description:
      "La gente que todavía no compró: contacto, destino, estado en el tablero, origen, vendedor, seña y notas.",
    gate: { kind: "module", module: "leads", permission: "read", requiresFullScope: true },
    controls: ["period", "agency"],
    note: "Se filtra por fecha de alta del lead. Incluye los archivados, marcados como tales.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) =>
      datasetUrl("leads", selection, { period: true, agency: true }),
  },
  {
    id: "quotations",
    groupId: "clientes",
    label: "Cotizaciones",
    description:
      "Los presupuestos armados con su desglose de precio, estado, validez y si terminaron en una operación.",
    gate: { kind: "module", module: "leads", permission: "read", requiresFullScope: true },
    controls: ["period", "agency"],
    note: "Se filtra por fecha de la cotización. El PDF de presentación de cada una no entra en este archivo.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) =>
      datasetUrl("quotations", selection, { period: true, agency: true }),
  },
  {
    id: "operations",
    groupId: "clientes",
    label: "Operaciones",
    description:
      "Un renglón por expediente: destino, fechas de viaje, vendedor, operadores, venta, costo, margen y estado de facturación.",
    gate: { kind: "module", module: "operations", permission: "read" },
    controls: ["period", "agency"],
    note: "Se filtra por fecha de operación. Máximo 10.000 operaciones por descarga.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) =>
      `/api/operations/export-csv?${qs([
        ["dateFrom", selection.dateFrom],
        ["dateTo", selection.dateTo],
        ["dateType", "OPERATION"],
        ["agencyId", agencyParam(selection)],
      ])}`,
  },
  {
    id: "payments",
    groupId: "finanzas",
    label: "Cobros y pagos",
    description:
      "Cada cobro al cliente y cada pago a operador con monto, moneda, método, estado y la operación a la que pertenece.",
    gate: { kind: "module", module: "reports", permission: "read" },
    controls: ["period", "agency"],
    note: "Se filtra por fecha de vencimiento. Máximo 10.000 registros por descarga.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) =>
      `/api/reports/export?${qs([
        ["type", "payments"],
        ["format", "csv"],
        ["dateFrom", selection.dateFrom],
        ["dateTo", selection.dateTo],
        ["agencyId", agencyParam(selection)],
      ])}`,
  },
  {
    id: "cash",
    groupId: "finanzas",
    label: "Movimientos de caja y bancos",
    description:
      "Ingresos y egresos de cada cuenta con su saldo acumulado, en el mismo orden en que se concilia contra el banco.",
    gate: { kind: "module", module: "cash", permission: "read" },
    controls: ["period", "agency"],
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) =>
      `/api/cash/export?${qs([
        ["dateFrom", selection.dateFrom],
        ["dateTo", selection.dateTo],
        ["dateType", "MOVIMIENTO"],
        ["agencyId", agencyParam(selection)],
      ])}`,
  },
  {
    id: "financial-accounts",
    groupId: "finanzas",
    label: "Cuentas financieras",
    description:
      "Cada caja, banco y tarjeta con su moneda, saldo inicial y saldo actual. Es contra qué se concilia el archivo de movimientos.",
    gate: { kind: "module", module: "cash", permission: "read", requiresFullScope: true },
    controls: [],
    note: "Por seguridad no incluye el número ni el código de las tarjetas.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) => datasetUrl("financial-accounts", selection),
  },
  {
    id: "operator-debt",
    groupId: "finanzas",
    label: "Deuda con operadores",
    description:
      "Cuánto se le debe a cada proveedor: importe, pagado, pendiente y vencimiento, con el expediente de cada deuda.",
    gate: { kind: "module", module: "accounting", permission: "read", requiresFullScope: true },
    controls: [],
    note: "Trae toda la deuda, también la ya pagada, para que quede el historial. No se recorta por período: una deuda vieja impaga es justamente la que no puede faltar.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) => datasetUrl("operator-debt", selection),
  },
  {
    id: "invoices-data",
    groupId: "facturacion",
    label: "Facturas emitidas (listado)",
    description:
      "Una fila por comprobante con CAE, receptor, neto, IVA, total y moneda. Es lo que se carga en otro sistema o se le pasa al contador.",
    gate: { kind: "module", module: "cash", permission: "read", requiresFullScope: true },
    controls: ["period", "agency"],
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) =>
      datasetUrl("invoices-data", selection, { period: true, agency: true }),
  },
  {
    id: "invoices",
    groupId: "facturacion",
    label: "Facturas emitidas (PDF)",
    description: "Un ZIP con el PDF de cada comprobante autorizado por AFIP en el período.",
    gate: { kind: "module", module: "cash", permission: "read" },
    controls: ["period"],
    note: "Solo comprobantes autorizados. Máximo 500 por descarga: si el período es largo, partilo.",
    formats: [{ id: "zip", label: "ZIP" }],
    buildUrl: (_formatId, selection) =>
      `/api/invoices/export?${qs([
        ["from", selection.dateFrom],
        ["to", selection.dateTo],
        ["status", "authorized"],
      ])}`,
  },
  {
    id: "chart-of-accounts",
    groupId: "contabilidad",
    label: "Plan de cuentas",
    description:
      "El árbol de cuentas con código, nombre, categoría y si es imputable. Sin esto, los códigos del Mayor y del Diario no significan nada del otro lado.",
    gate: { kind: "module", module: "accounting", permission: "read", requiresFullScope: true },
    controls: [],
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) => datasetUrl("chart-of-accounts", selection),
  },
  {
    id: "ledger",
    groupId: "contabilidad",
    label: "Libro Mayor",
    description:
      "Todos los movimientos del mayor con cuenta, moneda, cotización aplicada y equivalente en pesos.",
    gate: { kind: "module", module: "accounting", permission: "read" },
    controls: ["period", "agency"],
    note: "Máximo 10.000 movimientos por descarga: si el período es largo, partilo.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) =>
      `/api/accounting/ledger/export?${qs([
        ["dateFrom", selection.dateFrom],
        ["dateTo", selection.dateTo],
        ["dateType", "MOVIMIENTO"],
        ["agencyId", agencyParam(selection)],
      ])}`,
  },
  {
    id: "libro-diario",
    groupId: "contabilidad",
    label: "Libro Diario",
    description:
      "Los asientos del período con una fila por línea, para que del otro lado se pueda reconstruir la partida doble.",
    gate: { kind: "module", module: "accounting", permission: "read" },
    controls: ["period", "agency"],
    formats: [
      { id: "csv", label: "CSV" },
      { id: "pdf", label: "PDF" },
    ],
    buildUrl: (formatId, selection) =>
      `/api/accounting/libro-diario?${qs([
        ["desde", selection.dateFrom],
        ["hasta", selection.dateTo],
        ["agencyId", agencyParam(selection)],
        ["formato", formatId],
      ])}`,
  },
  {
    id: "libro-iva",
    groupId: "contabilidad",
    label: "Libro IVA",
    description:
      "IVA ventas y compras del mes con la posición del período. El ZIP es el formato RG 4597 que pide AFIP.",
    gate: { kind: "orgAdminOrAccountant" },
    controls: ["month"],
    note: "Es mensual: elegí el mes acá abajo, no arriba.",
    formats: [
      { id: "csv", label: "CSV" },
      { id: "rg4597", label: "ZIP RG 4597" },
    ],
    buildUrl: (formatId, selection) =>
      `/api/accounting/libro-iva?${qs([
        ["year", selection.year],
        ["month", selection.month],
        ["format", formatId],
      ])}`,
  },
  {
    id: "operators",
    groupId: "agencia",
    label: "Operadores y proveedores",
    description:
      "La red de proveedores cargada a mano: CUIT, contacto, comisión, fee administrativo y límite de crédito.",
    gate: { kind: "module", module: "operators", permission: "read", requiresFullScope: true },
    controls: [],
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) => datasetUrl("operators", selection),
  },
  {
    id: "team",
    groupId: "agencia",
    label: "Equipo",
    description:
      "Los usuarios de la agencia con su rol, si está activo y su comisión por defecto.",
    gate: { kind: "module", module: "settings", permission: "read", requiresFullScope: true },
    controls: [],
    note: "No incluye contraseñas ni datos de acceso.",
    formats: [{ id: "csv", label: "CSV" }],
    buildUrl: (_formatId, selection) => datasetUrl("team", selection),
  },
] as const

export interface ExportAccessContext {
  /** `user.roles` (role + additional_roles), no solo `user.role`. */
  roles: string[]
  /** Normalmente `canPerformAction` ya atado al usuario y su matriz resuelta. */
  can: (module: Module, permission: Permission) => boolean
  /** Normalmente `isOwnDataOnlyResolved` ya atado al usuario y su matriz. */
  ownDataOnly?: (module: Module) => boolean
}

export function canRunExport(
  definition: ExportDefinition,
  context: ExportAccessContext
): boolean {
  if (definition.gate.kind === "module") {
    if (!context.can(definition.gate.module, definition.gate.permission)) return false
    if (definition.gate.requiresFullScope && context.ownDataOnly?.(definition.gate.module)) {
      return false
    }
    return true
  }
  return hasAdminRole(context.roles) || context.roles.includes("CONTABLE")
}

/** Los ids que este usuario puede descargar, para mandarlos al cliente. */
export function availableExportIds(context: ExportAccessContext): string[] {
  return EXPORT_DEFINITIONS.filter((definition) => canRunExport(definition, context)).map(
    (definition) => definition.id
  )
}

export function getExportDefinition(id: string): ExportDefinition | undefined {
  return EXPORT_DEFINITIONS.find((definition) => definition.id === id)
}
