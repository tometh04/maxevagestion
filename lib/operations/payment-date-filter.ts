/**
 * Filtro de operaciones por fecha de cobro / pago / vencimiento (VIB-152).
 *
 * El listado de operaciones deja filtrar por estas fechas, pero el filtro no
 * vive en la tabla `operations` sino en `payments`, así que hay que resolver
 * primero qué operaciones cumplen y después acotar por id.
 *
 * `/api/operations` lo tenía resuelto inline y `/api/operations/export-csv` no
 * lo soportaba: por eso el CSV traía operaciones que no estaban en pantalla.
 */

export type PaymentDateType = "COBRO" | "PAGO" | "VENCIMIENTO"

const SUPPORTED: PaymentDateType[] = ["COBRO", "PAGO", "VENCIMIENTO"]

export interface PaymentDateFilter {
  paymentDateType?: string | null
  paymentDateFrom?: string | null
  paymentDateTo?: string | null
}

/**
 * Ids de operación cuyos pagos caen en el rango pedido.
 *
 * Devuelve:
 *  - `null` si no hay nada que filtrar (tipo no soportado o sin fechas). El
 *    caller no debe tocar la query.
 *  - `[]` si el filtro es válido pero no matchea ninguna operación. El caller
 *    debe devolver un resultado vacío, **no** ignorar el filtro.
 *  - la lista de ids en cualquier otro caso.
 *
 * NO se filtra por `org_id` a propósito, aunque la columna exista: hay 98
 * pagos en producción con `org_id` en NULL (medido 2026-08-25), y filtrarlos
 * haría desaparecer del export operaciones que sí están en pantalla — el mismo
 * patrón de VIB-139. No hay fuga entre tenants: la query de operaciones que
 * consume estos ids ya va scopeada por org. Cuando esos 98 se completen,
 * agregar el filtro acá es defensa en profundidad barata.
 */
export async function resolveOperationIdsByPaymentDate(
  supabase: any,
  /** Sin uso hoy — ver la nota de arriba sobre los pagos sin org_id. */
  _orgId: string | null | undefined,
  { paymentDateType, paymentDateFrom, paymentDateTo }: PaymentDateFilter
): Promise<string[] | null> {
  const type = (paymentDateType ?? "").toUpperCase() as PaymentDateType

  if (!SUPPORTED.includes(type)) return null
  if (!paymentDateFrom && !paymentDateTo) return null

  let query = supabase.from("payments").select("operation_id")

  // COBRO y PAGO miran cuándo se pagó de verdad; VENCIMIENTO, cuándo vencía.
  const column = type === "VENCIMIENTO" ? "date_due" : "date_paid"

  if (type === "COBRO") query = query.eq("direction", "INCOME")
  if (type === "PAGO") query = query.eq("direction", "EXPENSE")

  if (paymentDateFrom) query = query.gte(column, paymentDateFrom)
  if (paymentDateTo) query = query.lte(column, paymentDateTo)

  const { data, error } = await query

  if (error) {
    console.error("[operations][payment-date-filter] error:", error)
    // Ante un error se devuelve "sin filtro" en vez de vacío: es preferible un
    // export de más que uno que parece completo y no lo está.
    return null
  }

  // Dedup: una operación con varios pagos en el rango repetía el id y engordaba
  // la URL de PostgREST.
  return Array.from(
    new Set((data || []).map((p: any) => p.operation_id).filter(Boolean))
  ) as string[]
}
