/**
 * "Última operación" de un cliente (VIB-153).
 *
 * Yamil pidió una lista de clientes por vendedor para recontacto. Un cliente
 * puede tener operaciones con varios vendedores, así que había que fijar un
 * criterio: **el vendedor de la última operación**, y no todos los que alguna
 * vez le vendieron.
 *
 * El motivo es operativo, no técnico: con "alguna vez", el mismo pasajero le
 * aparecería a dos vendedores y recibiría dos llamados de la misma agencia
 * ofreciéndole lo mismo. Con "el último", cada cliente tiene un dueño claro.
 *
 * Vive fuera de la ruta para poder testearlo y para que el listado y el export
 * no resuelvan la cartera de dos formas distintas — el problema que acabamos de
 * arreglar en VIB-152.
 */

export interface CustomerLastOperation {
  date: string | null
  destination: string | null
  seller_id: string | null
  seller_name: string | null
}

/** Fila embebida de `operation_customers` con su operación. */
export interface OperationCustomerRow {
  operations?: {
    operation_date?: string | null
    destination?: string | null
    seller_id?: string | null
    sellers?: { id?: string | null; name?: string | null } | null
  } | null
}

/**
 * Devuelve la operación más reciente del cliente, o `null` si no tiene ninguna
 * con fecha.
 *
 * Las fechas son columnas DATE ("YYYY-MM-DD"), así que se comparan como string:
 * ese formato ordena igual lexicográfica que cronológicamente, y evita el
 * corrimiento de timezone que trae parsearlas a Date (ver lib/utils/date-only).
 *
 * Una operación sin fecha se descarta en vez de tratarse como la más vieja: sin
 * fecha no se puede saber si es la última, y adivinar acá le cambiaría el dueño
 * a un cliente.
 */
export function resolveLastOperation(
  operationCustomers: OperationCustomerRow[] | null | undefined
): CustomerLastOperation | null {
  const operations = (operationCustomers || [])
    .map((oc) => oc?.operations)
    .filter((op): op is NonNullable<OperationCustomerRow["operations"]> =>
      Boolean(op && op.operation_date)
    )

  if (operations.length === 0) return null

  const latest = operations.reduce((best, current) =>
    String(current.operation_date) > String(best.operation_date) ? current : best
  )

  return {
    date: latest.operation_date ?? null,
    destination: latest.destination || null,
    seller_id: latest.seller_id || null,
    seller_name: latest.sellers?.name || null,
  }
}
