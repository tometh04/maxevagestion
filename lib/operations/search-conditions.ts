/**
 * Condiciones de búsqueda de operaciones, compartidas por el listado y el export.
 *
 * VIB-152: Lozada reportó que al filtrar y exportar, el CSV bajaba "todo".
 * Parte del problema era de plomería en el front, pero el fondo era que
 * `/api/operations` y `/api/operations/export-csv` **buscaban cosas distintas**:
 *
 *   - el listado busca por `file_code`, `destination`, `airline_name`,
 *     `hotel_name` y además por **nombre de pasajero** (titular o acompañante);
 *   - el export solo miraba `file_code`, `destination` y `origin`.
 *
 * O sea que buscar "Pérez" en pantalla mostraba sus operaciones, pero el CSV no
 * traía ninguna: el export no sabía resolver pasajeros. Dos implementaciones de
 * la misma idea que divergieron. Vive acá para que no vuelva a pasar.
 */

import { buildPassengerSearchOrGroups, sanitizeSearchTerm } from "@/lib/operations/passenger-search"

/** Tope de clientes a resolver por búsqueda de pasajero. */
export const CUSTOMER_SEARCH_CAP = 500
/** Tope de operaciones derivadas de esos clientes. */
export const OPERATION_IDS_CAP = 500
/** Mínimo de caracteres para que la búsqueda filtre server-side. */
export const MIN_SEARCH_LENGTH = 2

export type OperationSearchConditions =
  /** Condiciones para pasarle a `.or(...)`. Nunca vacío. */
  | { kind: "match"; conditions: string[] }
  /** El término no puede matchear nada: el caller debe devolver vacío. */
  | { kind: "no-match" }
  /** No hay búsqueda que aplicar; el caller no toca la query. */
  | { kind: "skip" }

/**
 * Resuelve las condiciones de búsqueda de una query de operaciones.
 *
 * Hace hasta dos lecturas (customers y operation_customers) para traducir un
 * nombre de pasajero a ids de operación. Ambas van scopeadas por `orgId` como
 * defensa en profundidad además de la RLS.
 *
 * Devuelve `no-match` en vez de un array vacío cuando el término no puede
 * matchear nada: si el caller aplicara `.or("")` traería TODO, que es
 * exactamente el bug que se está arreglando.
 */
export async function buildOperationSearchConditions(
  supabase: any,
  search: string | null | undefined,
  orgId: string | null | undefined
): Promise<OperationSearchConditions> {
  const term = (search ?? "").trim()
  if (term.length < MIN_SEARCH_LENGTH) return { kind: "skip" }

  const operationIdsByCustomer = await resolveOperationIdsByPassenger(supabase, term, orgId)

  const conditions: string[] = []

  // El término va sanitizado: una coma o un paréntesis rompen la gramática de
  // `or=` de PostgREST y tiraban la query entera.
  const safeSearch = sanitizeSearchTerm(term)

  // Si al sanitizar queda vacío (ej. ",,,") no se agrega `ilike.%%`: matchearía
  // TODAS las operaciones en vez de ninguna.
  if (safeSearch.length >= MIN_SEARCH_LENGTH) {
    conditions.push(
      `file_code.ilike.%${safeSearch}%`,
      `destination.ilike.%${safeSearch}%`,
      `airline_name.ilike.%${safeSearch}%`,
      `hotel_name.ilike.%${safeSearch}%`
    )
  }

  if (operationIdsByCustomer.length > 0) {
    conditions.push(`id.in.(${operationIdsByCustomer.join(",")})`)
  }

  if (conditions.length === 0) return { kind: "no-match" }

  return { kind: "match", conditions }
}

/**
 * Traduce un término a los ids de operación cuyos pasajeros lo matchean.
 *
 * Cada palabra genera su propio `.or()` (PostgREST combina los `or=` repetidos
 * con AND), o sea que cada palabra tiene que matchear nombre o apellido del
 * MISMO cliente. Sin eso, "Maria Belen Olivera" matcheaba a cualquier "Maria"
 * y el limit del listado recortaba de forma arbitraria — el incidente VIB-102.
 *
 * Nunca lanza: una búsqueda que falla degrada a "sin resultados por pasajero",
 * no rompe el listado ni el export.
 */
async function resolveOperationIdsByPassenger(
  supabase: any,
  term: string,
  orgId: string | null | undefined
): Promise<string[]> {
  try {
    const orGroups = buildPassengerSearchOrGroups(term)
    if (orGroups.length === 0) return []

    let customersQuery = supabase.from("customers").select("id")
    if (orgId) customersQuery = customersQuery.eq("org_id", orgId)
    for (const group of orGroups) {
      customersQuery = customersQuery.or(group)
    }

    const { data: matchingCustomers } = await customersQuery.limit(CUSTOMER_SEARCH_CAP)
    if (!matchingCustomers || matchingCustomers.length === 0) return []

    if (matchingCustomers.length === CUSTOMER_SEARCH_CAP) {
      console.warn(
        `[operations][search] "${term}" alcanzó el tope de ${CUSTOMER_SEARCH_CAP} clientes; resultados posiblemente incompletos`
      )
    }

    const customerIds = matchingCustomers.map((c: any) => c.id)
    let opCustomersQuery = supabase
      .from("operation_customers")
      .select("operation_id")
      .in("customer_id", customerIds)
    if (orgId) opCustomersQuery = opCustomersQuery.eq("org_id", orgId)

    const { data: opCustomers } = await opCustomersQuery

    // Dedup: una operación con varios pasajeros que matchean repetía el mismo id
    // en `id.in.(...)` e inflaba la URL de PostgREST.
    let ids = Array.from(
      new Set((opCustomers || []).map((oc: any) => oc.operation_id).filter(Boolean))
    ) as string[]

    if (ids.length > OPERATION_IDS_CAP) {
      console.warn(
        `[operations][search] "${term}" resolvió ${ids.length} operaciones por pasajero; se recortan a ${OPERATION_IDS_CAP}`
      )
      ids = ids.slice(0, OPERATION_IDS_CAP)
    }

    return ids
  } catch (err) {
    console.error("Error searching customers for operations:", err)
    return []
  }
}
