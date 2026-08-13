/**
 * Reportes de cuentas a pagar a operadores.
 *
 * Contexto: Lozada necesita ver lo que debe por tipo de producto (típicamente
 * aéreos) abierto por operador y por oficina, para ir marcando las deudas a
 * medida que las paga.
 *
 * Una deuda (`operator_payments`) no guarda ni el tipo de producto ni la
 * agencia, y puede nacer por tres caminos distintos:
 *
 *  1. Desde un servicio de la operación → `operation_services.service_type`
 *     (vinculado por `operation_services.operator_payment_id`).
 *  2. Desde el costo por operador al crear/editar la operación → el tipo lo
 *     eligió el usuario en `operation_operators.product_type`. Este es el caso
 *     más común: el formulario de operación pide "Tipo de Producto" por operador.
 *  3. Deuda manual sin operación → no hay tipo.
 *
 * Además `operations.product_type` (vocabulario español) sirve de última red
 * para datos viejos. La normalización a una clave canónica ya existe en
 * `lib/operations/product-types.ts` (VIB-66) y se reusa acá para no tener
 * "Vuelo" y "FLIGHT" como dos categorías distintas en el mismo reporte.
 */

import {
  STANDARD_PRODUCT_TYPES,
  UNSPECIFIED_BUCKET_KEY,
  normalizeProductType,
  productTypeLabel,
} from "@/lib/operations/product-types"
import {
  getOpenOperatorPaymentStatus,
  hasPendingBalance,
} from "./operator-payment-settlement"

/** Filtro sin restricción. */
export const DEBT_TYPE_FILTER_ALL = "ALL"
/** Deudas sin tipo resoluble (típicamente manuales). */
export const DEBT_TYPE_UNSPECIFIED = UNSPECIFIED_BUCKET_KEY

/**
 * Tipos que existen como servicio (`operation_service_type`) pero no en el
 * vocabulario de tipos de producto: se conservan con identidad propia en vez de
 * caer en "Sin clasificar".
 */
const SERVICE_ONLY_LABELS: Record<string, string> = {
  SEAT: "Asiento",
  LUGGAGE: "Equipaje",
  VISA: "Visa",
}

/** Opciones estándar del filtro, en orden de uso esperado. */
export const DEBT_TYPE_FILTER_OPTIONS: readonly string[] = [
  ...STANDARD_PRODUCT_TYPES,
  ...Object.keys(SERVICE_ONLY_LABELS),
]

/** Slugs sin acentos para el nombre del archivo exportado. */
const DEBT_TYPE_SLUGS: Record<string, string> = {
  FLIGHT: "aereos",
  HOTEL: "hoteles",
  PACKAGE: "paquetes",
  CRUISE: "cruceros",
  TRANSFER: "traslados",
  MIXED: "mixtos",
  ASSISTANCE: "asistencias",
  ACTIVITY: "actividades",
  CAR: "autos",
  SEAT: "asientos",
  LUGGAGE: "equipaje",
  VISA: "visas",
  [DEBT_TYPE_UNSPECIFIED]: "sin-clasificar",
}

export function debtTypeLabel(canonical: string | null | undefined): string {
  if (!canonical) return productTypeLabel(DEBT_TYPE_UNSPECIFIED)
  return SERVICE_ONLY_LABELS[canonical] ?? productTypeLabel(canonical)
}

/**
 * Sufijo para el nombre del export. Devuelve "" sin filtro, así el archivo
 * completo mantiene el nombre histórico.
 */
export function debtTypeFileSuffix(filter: string | null | undefined): string {
  if (!filter || filter === DEBT_TYPE_FILTER_ALL) return ""
  return `-${DEBT_TYPE_SLUGS[filter] ?? filter.toLowerCase()}`
}

export function matchesDebtTypeFilter(
  debtType: string | null | undefined,
  filter: string | null | undefined
): boolean {
  if (!filter || filter === DEBT_TYPE_FILTER_ALL) return true
  return (debtType || DEBT_TYPE_UNSPECIFIED) === filter
}

export interface DebtTypeSources {
  /** service_type de los `operation_services` vinculados a la deuda. */
  serviceTypes?: readonly string[] | null
  /** `operation_operators.product_type` del operador en esa operación. */
  operatorProductType?: string | null
  /** `operations.product_type` (vocabulario español), última red. */
  operationProductType?: string | null
}

/**
 * Tipo canónico de una deuda. Precedencia: servicio vinculado → tipo elegido
 * para ese operador en la operación → tipo de la operación.
 *
 * Si la deuda cubre servicios de distinto tipo se devuelve MIXED: filtrar esa
 * deuda como "Aéreo" sobrestimaría la deuda aérea, porque incluye otra cosa.
 */
export function resolveDebtType(sources: DebtTypeSources): string {
  const serviceTypes = Array.from(
    new Set((sources.serviceTypes ?? []).map((t) => normalizeProductType(t)))
  )
  if (serviceTypes.length === 1) return serviceTypes[0]
  if (serviceTypes.length > 1) return "MIXED"

  const operatorType = normalizeProductType(sources.operatorProductType)
  if (operatorType !== DEBT_TYPE_UNSPECIFIED) return operatorType

  return normalizeProductType(sources.operationProductType)
}

export interface SummarizableOperatorPayment {
  amount: number | string
  paid_amount?: number | string | null
  currency?: string | null
  due_date?: string | null
  operators?: { name?: string | null } | null
  operations?: { agency_id?: string | null } | null
}

export interface OperatorAgencySummaryRow {
  operator: string
  agency: string
  currency: string
  totalAmount: number
  totalPaid: number
  totalPending: number
  count: number
  overdueCount: number
}

function toMoney(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Agrupa las deudas por operador × oficina × moneda.
 *
 * La moneda entra en la clave a propósito: sumar ARS y USD en un mismo total
 * daría un número sin significado contable (y es lo que hacía el Excel anterior,
 * que tomaba la moneda del primer pago del operador y sumaba todo ahí).
 */
export function buildOperatorAgencySummary(
  payments: readonly SummarizableOperatorPayment[],
  options: {
    /** agency_id → nombre de oficina. */
    agencyNames?: Record<string, string>
    /** Etiqueta para deudas sin operación/oficina (ej: deudas manuales). */
    unassignedAgencyLabel?: string
    /** Inyectable para tests. */
    now?: Date
  } = {}
): OperatorAgencySummaryRow[] {
  const {
    agencyNames = {},
    unassignedAgencyLabel = "Sin oficina",
    now,
  } = options

  const rows = new Map<string, OperatorAgencySummaryRow>()

  for (const payment of payments) {
    const operator = payment.operators?.name || "Sin operador"
    const agencyId = payment.operations?.agency_id || null
    const agency = agencyId
      ? agencyNames[agencyId] || unassignedAgencyLabel
      : unassignedAgencyLabel
    const currency = payment.currency === "USD" ? "USD" : "ARS"

    const key = `${operator}||${agency}||${currency}`
    let row = rows.get(key)
    if (!row) {
      row = {
        operator,
        agency,
        currency,
        totalAmount: 0,
        totalPaid: 0,
        totalPending: 0,
        count: 0,
        overdueCount: 0,
      }
      rows.set(key, row)
    }

    const amount = toMoney(payment.amount)
    const paid = toMoney(payment.paid_amount)

    row.totalAmount += amount
    row.totalPaid += paid
    // Sin negativos: un sobrepago no debe descontar deuda de otra fila.
    row.totalPending += Math.max(0, amount - paid)
    row.count += 1

    // Vencido = tiene saldo pendiente Y la fecha de vencimiento ya pasó. Misma
    // semántica que el listado (getEffectiveOperatorPaymentStatus), pero con
    // `now` inyectable para poder testearlo.
    const isOverdue =
      hasPendingBalance({ amount, paid_amount: paid }) &&
      getOpenOperatorPaymentStatus(payment.due_date ?? null, now) === "OVERDUE"
    if (isOverdue) row.overdueCount += 1
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      totalAmount: round2(row.totalAmount),
      totalPaid: round2(row.totalPaid),
      totalPending: round2(row.totalPending),
    }))
    .sort(
      (a, b) =>
        a.operator.localeCompare(b.operator, "es") ||
        a.agency.localeCompare(b.agency, "es") ||
        a.currency.localeCompare(b.currency)
    )
}
