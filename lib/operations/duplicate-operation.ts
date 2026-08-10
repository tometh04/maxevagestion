/**
 * Duplicar una operación (VIB-109).
 *
 * Las agencias venden lo mismo a varias personas del mismo grupo (en producción
 * hay 147 grupos de operaciones con mismo destino, fecha y vendedor; uno de
 * Lozada tiene 21). Duplicar evita recargar todo a mano.
 *
 * Decisión de diseño: duplicar **precarga el alta**, no clona en el servidor.
 * El `POST /api/operations` normal sigue siendo el único camino que crea una
 * operación, con sus side effects contables (ledger, IVA, deudas al operador,
 * comisiones, alertas). El antecedente de crear operaciones por afuera de ese
 * POST es el convert de cotización, que quedó incompleto (no genera IVA ni
 * ledger) — no se repite acá.
 *
 * Por eso este módulo es puro: arma el borrador del formulario y nada más.
 */

export interface DuplicableOperationOperator {
  operator_id?: string | null
  cost?: number | string | null
  cost_currency?: string | null
  product_type?: string | null
  notes?: string | null
  passenger_detail?: Record<string, string> | null
}

export interface DuplicableOperation {
  agency_id?: string | null
  seller_id?: string | null
  seller_secondary_id?: string | null
  commission_split?: number | null
  type?: string | null
  origin?: string | null
  destination?: string | null
  departure_date?: string | null
  return_date?: string | null
  adults?: number | null
  children?: number | null
  infants?: number | null
  sale_amount_total?: number | string | null
  operator_cost?: number | string | null
  currency?: string | null
  sale_currency?: string | null
  operator_cost_currency?: string | null
  airline_name?: string | null
  hotel_name?: string | null
  passenger_notes?: string | null
  operation_operators?: DuplicableOperator[] | null
}

type DuplicableOperator = DuplicableOperationOperator

export interface OperationDuplicateOperatorRow {
  operator_id: string
  cost: number
  cost_currency: "ARS" | "USD"
  product_type?: string
  notes?: string
  passenger_detail?: Record<string, string>
}

export interface OperationDuplicateDraft {
  /** Valores para `form.reset(...)` del diálogo de alta. */
  formValues: {
    agency_id: string
    seller_id: string
    seller_secondary_id: string | null
    commission_split: number | null
    type: string
    origin: string
    destination: string
    departure_date?: Date
    return_date?: Date
    adults: number
    children: number
    infants: number
    sale_amount_total: number
    operator_cost: number
    currency: "ARS" | "USD"
    sale_currency: "ARS" | "USD"
    operator_cost_currency: "ARS" | "USD"
    airline_name: string | null
    hotel_name: string | null
    passenger_notes: string | null
  }
  /** Filas para el estado `operatorList` (va aparte del form). */
  operatorRows: OperationDuplicateOperatorRow[]
  /** Cantidad de patas copiadas (para prender el modo multi-operador). */
  hasOperators: boolean
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toCurrency(value: unknown, fallback: "ARS" | "USD" = "USD"): "ARS" | "USD" {
  return value === "ARS" || value === "USD" ? value : fallback
}

/** Parsea una columna DATE ("YYYY-MM-DD") sin corrimiento de timezone. */
function toLocalDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/**
 * Arma el borrador para duplicar una operación.
 *
 * Se copia lo que se repite entre ventas del mismo grupo: destino, fechas,
 * montos, vendedores y las patas de operador con su costo y su detalle.
 *
 * NO se copia:
 * - los pasajeros — es justamente lo que cambia entre una venta y otra;
 * - el `file_code` — lo genera el POST con el id real de la nueva operación;
 * - los códigos de reserva (aéreo/hotel/ITR) y el `file_code` + vencimiento de
 *   cada pata — son de la reserva original, no de la nueva;
 * - nada transaccional (cobros, deudas, documentos, alertas, facturas,
 *   comisiones): eso lo genera el alta.
 */
export function buildOperationDuplicateDraft(
  operation: DuplicableOperation,
  overrides?: { status?: string }
): OperationDuplicateDraft {
  const saleCurrency = toCurrency(operation.sale_currency ?? operation.currency)
  const operators = (operation.operation_operators ?? []).filter((row) => row?.operator_id)

  const operatorRows: OperationDuplicateOperatorRow[] = operators.map((row) => ({
    operator_id: String(row.operator_id),
    cost: toNumber(row.cost),
    cost_currency: toCurrency(row.cost_currency, toCurrency(operation.operator_cost_currency)),
    ...(row.product_type ? { product_type: row.product_type } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.passenger_detail && typeof row.passenger_detail === "object"
      ? { passenger_detail: { ...row.passenger_detail } }
      : {}),
  }))

  return {
    formValues: {
      agency_id: operation.agency_id || "",
      seller_id: operation.seller_id || "",
      seller_secondary_id: operation.seller_secondary_id || null,
      commission_split: operation.seller_secondary_id ? operation.commission_split ?? 50 : null,
      type: operation.type || "PACKAGE",
      origin: operation.origin || "",
      destination: operation.destination || "",
      departure_date: toLocalDate(operation.departure_date),
      return_date: toLocalDate(operation.return_date),
      adults: Math.max(1, toNumber(operation.adults, 1)),
      children: toNumber(operation.children),
      infants: toNumber(operation.infants),
      sale_amount_total: toNumber(operation.sale_amount_total),
      operator_cost: toNumber(operation.operator_cost),
      currency: toCurrency(operation.currency, saleCurrency),
      sale_currency: saleCurrency,
      operator_cost_currency: toCurrency(operation.operator_cost_currency, saleCurrency),
      airline_name: operation.airline_name || null,
      hotel_name: operation.hotel_name || null,
      passenger_notes: operation.passenger_notes || null,
      ...(overrides?.status ? { status: overrides.status } : {}),
    } as OperationDuplicateDraft["formValues"],
    operatorRows,
    hasOperators: operatorRows.length > 0,
  }
}
