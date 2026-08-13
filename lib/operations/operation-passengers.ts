/**
 * Pasajeros de una operación (VIB-106).
 *
 * `operation_customers` guarda una fila por pasajero con rol `MAIN` (titular) o
 * `COMPANION` (acompañante). Hasta ahora el alta de operación solo insertaba el
 * titular y los acompañantes se cargaban de a uno desde la pestaña Clientes.
 *
 * Este módulo concentra las reglas de esa lista para que sean testeables sin
 * base: exactamente un titular, sin repetidos y con un tope de filas. La DB ya
 * garantiza lo mismo con dos índices únicos (migración `20260416000153`:
 * `(operation_id) WHERE role='MAIN'` y `(operation_id, customer_id)`); acá se
 * valida antes para poder devolver un 400 con un mensaje entendible en vez de
 * un error de constraint.
 */

export type OperationPassengerRole = "MAIN" | "COMPANION"

export interface OperationPassengerRow {
  customer_id: string
  role: OperationPassengerRole
}

export interface NormalizeOperationPassengersInput {
  /** Titular explícito (el campo `customer_id` del alta). Si viene, manda. */
  customerId?: string | null
  /** Lista cruda desde el body del request. */
  passengers?: unknown
  /** Tope de filas. El máximo real en producción es 16 pasajeros. */
  maxPassengers?: number
}

export interface NormalizeOperationPassengersResult {
  /** Filas listas para insertar. Vacío cuando hay `error`. */
  rows: OperationPassengerRow[]
  /** Mensaje para devolver al usuario, o `null` si la lista es válida. */
  error: string | null
}

const DEFAULT_MAX_PASSENGERS = 25

function readId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readRole(value: unknown): OperationPassengerRole | null {
  if (value === "MAIN" || value === "COMPANION") return value
  return null
}

/**
 * Normaliza la lista de pasajeros de un alta/agregado.
 *
 * Reglas:
 * - Dedupe por `customer_id`, gana la primera aparición (y su rol).
 * - Exactamente un `MAIN`: si viene `customerId` ese es el titular; si no, el
 *   primero marcado `MAIN`; si no hay ninguno, se promueve el primero de la
 *   lista. Dos `MAIN` distintos es un error del caller, no algo para adivinar.
 * - Lista vacía devuelve `[]` sin error: hay operaciones sin cliente cargado.
 */
export function normalizeOperationPassengers(
  input: NormalizeOperationPassengersInput
): NormalizeOperationPassengersResult {
  const { customerId, passengers, maxPassengers = DEFAULT_MAX_PASSENGERS } = input

  if (passengers != null && !Array.isArray(passengers)) {
    return { rows: [], error: "El campo pasajeros debe ser una lista" }
  }

  const raw: Array<{ id: string; role: OperationPassengerRole | null }> = []

  const mainId = readId(customerId)
  if (customerId != null && !mainId) {
    return { rows: [], error: "El pasajero principal es inválido" }
  }
  if (mainId) raw.push({ id: mainId, role: "MAIN" })

  for (const entry of (passengers as unknown[]) ?? []) {
    // Se acepta tanto el objeto {customer_id, role} como el id suelto.
    const id = typeof entry === "string" ? readId(entry) : readId((entry as any)?.customer_id)
    if (!id) return { rows: [], error: "Hay un pasajero sin cliente válido" }

    const role = typeof entry === "string" ? null : readRole((entry as any)?.role)
    raw.push({ id, role })
  }

  // Dedupe conservando el orden y el primer rol conocido.
  const byId = new Map<string, OperationPassengerRole | null>()
  for (const { id, role } of raw) {
    if (!byId.has(id)) byId.set(id, role)
    else if (byId.get(id) == null && role != null) byId.set(id, role)
  }

  const deduped = Array.from(byId.entries()).map(([id, role]) => ({ id, role }))
  if (deduped.length === 0) return { rows: [], error: null }

  if (deduped.length > maxPassengers) {
    return { rows: [], error: `No se pueden cargar más de ${maxPassengers} pasajeros por operación` }
  }

  const explicitMains = deduped.filter((p) => p.role === "MAIN")
  if (explicitMains.length > 1) {
    return { rows: [], error: "Solo puede haber un pasajero principal" }
  }

  const mainIndex = explicitMains.length === 1 ? deduped.indexOf(explicitMains[0]) : 0

  return {
    rows: deduped.map((p, index) => ({
      customer_id: p.id,
      role: index === mainIndex ? "MAIN" : "COMPANION",
    })),
    error: null,
  }
}

/**
 * Devuelve los `customer_id` que NO pertenecen a la org indicada.
 *
 * Hace falta explícitamente: la RLS no alcanza acá. El trigger de
 * `20260420000152_saas_universal_auto_org_id.sql` rellena
 * `operation_customers.org_id` con la org del usuario que inserta, así que una
 * fila que apunte a un cliente de OTRA org pasa el `WITH CHECK` igual y queda
 * el cliente ajeno linkeado a la operación (AGENTS.md, regla 2: RLS es defensa
 * en profundidad, no la única capa).
 */
export async function findCustomersOutsideOrg(
  supabase: any,
  customerIds: string[],
  orgId: string
): Promise<string[]> {
  const unique = Array.from(new Set(customerIds.filter(Boolean)))
  if (unique.length === 0) return []

  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .in("id", unique)
    .eq("org_id", orgId)

  // Ante un error de la query no se puede afirmar que los clientes sean válidos:
  // se rechazan todos y el caller devuelve 400 en vez de escribir a ciegas.
  if (error) return unique

  const found = new Set((data || []).map((row: any) => row.id))
  return unique.filter((id) => !found.has(id))
}
