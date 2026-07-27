/**
 * Lectura paginada para reportes.
 *
 * PostgREST corta las respuestas en 1000 filas por default. Un reporte que suma
 * sobre esas 1000 filas y las presenta como el total del período miente sin
 * avisar: exactamente lo que arregló la auditoría VIB-61. Este helper pagina con
 * `.range()` hasta agotar el dataset y, si llega al tope duro, lo devuelve
 * marcado para que el reporte pueda decirlo en pantalla y en el PDF.
 *
 * Uso:
 *
 *   const { rows, truncated } = await fetchAllRows<OperationRow>((from, to) =>
 *     supabase.from("operations").select("...").eq("org_id", orgId).range(from, to)
 *   )
 *
 * La query debe traer un `order` estable; si no, la paginación puede repetir o
 * saltear filas.
 */

export interface FetchAllRowsOptions {
  /** Filas por página. PostgREST no devuelve más de 1000 por request. */
  pageSize?: number
  /** Tope duro para no volar la memoria de un tenant enorme. */
  maxRows?: number
}

export interface FetchAllRowsResult<T> {
  rows: T[]
  /** true si se alcanzó `maxRows` y quedaron filas sin leer. */
  truncated: boolean
}

const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_MAX_ROWS = 50_000

export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  options: FetchAllRowsOptions = {}
): Promise<FetchAllRowsResult<T>> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE))
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS

  const rows: T[] = []
  let from = 0

  for (;;) {
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw error

    const page = data ?? []
    rows.push(...page)

    // Página incompleta = no hay más filas.
    if (page.length < pageSize) return { rows, truncated: false }

    if (rows.length >= maxRows) {
      return { rows: rows.slice(0, maxRows), truncated: true }
    }
    from += pageSize
  }
}

/**
 * Corre una query por lotes de ids (evita URLs gigantes en `.in()`) y concatena
 * los resultados. Se usa para traer los pagos de N operaciones sin pedirlos de a
 * uno ni mandar miles de uuids en una sola query.
 */
export async function fetchInChunks<T>(
  ids: string[],
  makeQuery: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
  chunkSize = 200
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await makeQuery(ids.slice(i, i + chunkSize))
    if (error) throw error
    out.push(...(data ?? []))
  }
  return out
}
