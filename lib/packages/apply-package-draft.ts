/**
 * Aplicar un paquete cerrado en el alta de una operación (VIB-183).
 *
 * Módulo PURO: no toca la base ni hace fetch. Recibe el paquete ya cargado y
 * devuelve un borrador de formulario, igual que `duplicate-operation.ts`.
 *
 * Esa decisión es deliberada y viene de ahí: elegir un paquete NO crea nada del
 * lado del servidor, solo precarga el formulario, y después el
 * `POST /api/operations` de siempre es el único camino que crea la operación con
 * todos sus efectos contables. El antecedente de crear operaciones por fuera de
 * ese POST (el convert de cotización) quedó incompleto —sin IVA ni ledger— y no
 * hay motivo para repetirlo.
 *
 * Diferencia clave con duplicar: duplicar REEMPLAZA la operación entera, así que
 * devuelve el formulario completo. Un paquete se aplica ENCIMA de lo que el
 * vendedor ya escribió, así que devuelve solo los campos que son del paquete.
 * Nunca toca agencia, vendedor, cliente, pasajeros ni comisiones: eso es de la
 * venta, no del producto.
 */

export type Currency = "ARS" | "USD"

export interface ApplicablePackageItem {
  id: string
  operator_id: string
  product_type: string | null
  cost: number
  cost_currency: string
  sale_amount: number
  notes: string | null
}

export interface ApplicablePackage {
  id: string
  name: string
  destination: string | null
  departure_date: string | null
  return_date: string | null
  sale_amount_total: number | null
  sale_currency: string
  items: ApplicablePackageItem[]
  availability: {
    total_quota: number
    consumed: number
    remaining: number
  }
}

/** Fila de operador del formulario, más la marca de qué pata la originó. */
export interface PackageOperatorRow {
  operator_id: string
  cost: number
  cost_currency: Currency
  product_type?: string
  notes?: string
  sale_amount?: number
  /** Presente ⇒ la fila vino de un paquete y se va cuando el paquete cambia. */
  source_package_item_id?: string
}

/** Campos que el paquete aporta al formulario. Todo lo demás es del vendedor. */
export interface PackageFormValues {
  destination?: string
  departure_date?: string
  return_date?: string
  sale_amount_total?: number
  sale_currency?: Currency
}

export interface PackageOperationDraft {
  formValues: PackageFormValues
  operatorRows: PackageOperatorRow[]
  hasOperators: boolean
}

function normalizeCurrency(value: string | null | undefined, fallback: Currency = "USD"): Currency {
  return value === "ARS" || value === "USD" ? value : fallback
}

export function buildPackageOperationDraft(pkg: ApplicablePackage): PackageOperationDraft {
  const saleCurrency = normalizeCurrency(pkg.sale_currency)

  const formValues: PackageFormValues = {}
  if (pkg.destination) formValues.destination = pkg.destination
  if (pkg.departure_date) formValues.departure_date = pkg.departure_date
  if (pkg.return_date) formValues.return_date = pkg.return_date
  if (pkg.sale_amount_total !== null && pkg.sale_amount_total !== undefined) {
    formValues.sale_amount_total = pkg.sale_amount_total
    formValues.sale_currency = saleCurrency
  }

  const operatorRows: PackageOperatorRow[] = pkg.items.map((item) => ({
    operator_id: item.operator_id,
    cost: item.cost,
    cost_currency: normalizeCurrency(item.cost_currency, saleCurrency),
    product_type: item.product_type || undefined,
    notes: item.notes || undefined,
    sale_amount: item.sale_amount || undefined,
    source_package_item_id: item.id,
    // NO se copian `file_code` ni `payment_due_date`: son de la reserva
    // concreta, no de la plantilla. Mismo criterio que al duplicar.
  }))

  return {
    formValues,
    operatorRows,
    hasOperators: operatorRows.length > 0,
  }
}

export interface MergeResult<T> {
  rows: Array<T | PackageOperatorRow>
  /** Filas del paquete anterior que se descartan. Sirve para pedir confirmación. */
  removedCount: number
}

/**
 * Reemplaza las patas del paquete anterior conservando los operadores extra que
 * el vendedor cargó a mano.
 *
 * Las del paquete van ADELANTE porque la primera pata define el operador
 * principal de la operación.
 *
 * `packageRows` vacío = "sin paquete": se quitan las del paquete y quedan solo
 * los extras.
 */
export function mergeOperatorRowsWithPackage<
  T extends { operator_id?: string; source_package_item_id?: string },
>(current: T[], packageRows: PackageOperatorRow[]): MergeResult<T> {
  const previas = (current || []).filter((row) => Boolean(row.source_package_item_id))
  const extras = (current || []).filter(
    // Se conservan los extras con operador elegido. Una ficha vacía no se
    // arrastra: el formulario repone una sola si la lista queda sin nada.
    (row) => !row.source_package_item_id && Boolean(row.operator_id)
  )

  return {
    rows: [...packageRows, ...extras],
    removedCount: previas.length,
  }
}

/** Plazas disponibles, sin mostrar negativos si el dato viniera raro. */
export function remainingSeats(pkg: ApplicablePackage): number {
  return Math.max(0, pkg.availability?.remaining ?? 0)
}
