/**
 * Búsqueda de leads para elegir el origen de una operación (VIB-191).
 *
 * Vive acá y no dentro de la ruta porque encierra dos reglas de dominio que no
 * son "filtrar una tabla": qué lead es *convertible* y cuál ya se convirtió.
 * El alta de operaciones necesita las dos para no ofrecer algo que el POST va a
 * rechazar con 409.
 */

/**
 * Estados desde los que el POST de operaciones acepta convertir. Tiene que
 * coincidir con el `.in("status", [...])` del lock CAS en
 * `app/api/operations/route.ts`: si acá se ofrece un lead que allá no entra al
 * lock, el usuario carga el formulario entero para comerse un 409.
 */
export const CONVERTIBLE_LEAD_STATUSES = ["NEW", "IN_PROGRESS", "QUOTED", "WON"] as const

/** Columnas que necesita el prefill del alta. Nada más: el combo no muestra el resto. */
export const LEAD_SELECTOR_COLUMNS = `
  id, contact_name, contact_phone, contact_email, destination, agency_id,
  assigned_seller_id, notes, quoted_price, estimated_departure_date, region,
  deposit_currency, status, created_at
`

export const LEAD_SELECTOR_LIMIT = 20

export interface LeadSelectorItem {
  id: string
  contact_name: string
  contact_phone: string | null
  contact_email: string | null
  destination: string | null
  agency_id: string | null
  assigned_seller_id: string | null
  notes: string | null
  quoted_price: number | null
  estimated_departure_date: string | null
  region: string | null
  deposit_currency: string | null
  status: string
  created_at: string | null
  /**
   * Ya tiene una operación cargada. Se devuelve marcado en vez de excluirlo: si
   * el lead desaparece del buscador, el usuario cree que se perdió y lo carga a
   * mano, que es justo lo que esta pantalla viene a evitar.
   */
  has_operation: boolean
  /** Operación existente, para poder linkearla desde el mensaje. */
  operation_id: string | null
}

/**
 * Neutraliza los caracteres con los que PostgREST arma el `or=(...)`.
 *
 * Sin esto, un lead buscado como "Perez, Juan (hijo)" corta el predicado por la
 * coma y el paréntesis: la query falla o —peor— cambia de significado. Los `%`
 * y `_` se escapan porque son comodines de `ilike`.
 */
export function sanitizeLeadSearch(raw: string): string {
  return raw
    .trim()
    .slice(0, 80)
    .replace(/[\\%_]/g, (char) => `\\${char}`)
    .replace(/[(),*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Campos sobre los que busca el combo. */
const SEARCHABLE_COLUMNS = ["contact_name", "contact_phone", "contact_email", "destination"]

export function buildLeadSearchFilter(sanitized: string): string {
  return SEARCHABLE_COLUMNS.map((column) => `${column}.ilike.%${sanitized}%`).join(",")
}

export function mapLeadSelectorRow(
  row: any,
  operationByLeadId: Map<string, string>
): LeadSelectorItem {
  const operationId = operationByLeadId.get(row.id) ?? null

  return {
    id: row.id,
    contact_name: row.contact_name,
    contact_phone: row.contact_phone ?? null,
    contact_email: row.contact_email ?? null,
    destination: row.destination ?? null,
    agency_id: row.agency_id ?? null,
    assigned_seller_id: row.assigned_seller_id ?? null,
    notes: row.notes ?? null,
    quoted_price:
      row.quoted_price === null || row.quoted_price === undefined
        ? null
        : Number(row.quoted_price),
    estimated_departure_date: row.estimated_departure_date ?? null,
    region: row.region ?? null,
    deposit_currency: row.deposit_currency ?? null,
    status: row.status,
    created_at: row.created_at ?? null,
    has_operation: operationId !== null,
    operation_id: operationId,
  }
}
