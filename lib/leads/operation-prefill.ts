import { formatDateOnlyLocal, parseDateOnlyLocal, todayInArgentina } from "@/lib/utils/date-only"

/**
 * Precarga del alta de operación a partir de un lead (VIB-191).
 *
 * Se saca del diálogo para poder testearla: hasta ahora la precarga vivía
 * dentro de un `form.reset({...})` de 30 campos, que es correcto cuando el
 * formulario se abre ya dedicado a ese lead (conversión desde el CRM) pero
 * destructivo cuando el usuario elige el lead con el formulario empezado.
 *
 * La regla es `selectUntouchedPrefill`: al elegir un lead a mitad de camino se
 * completan sólo los campos que el usuario todavía no tocó. Lo que ya escribió
 * gana siempre — el lead es una sugerencia, no la fuente de verdad.
 */

/** Palabras que delatan que `leads.destination` trae un estado del pipeline y no un destino. */
const LEAD_STATUS_KEYWORDS = [
  "presupuesto", "enviado", "nuevo", "contactado", "calificado",
  "negociacion", "negociación", "ganado", "perdido", "pendiente",
  "seguimiento", "cerrado", "cancelado", "won", "lost", "new",
  "contacted", "qualified", "negotiation", "closed",
]

/** Formas que no son un destino: handle de Instagram, email, username, números. */
const INVALID_DESTINATION_PATTERNS = [/^@/, /@.*\.com$/, /^[a-z0-9_]+$/, /^\d+$/]

/**
 * `leads.destination` es texto libre que muchas veces trae basura del CRM
 * (el nombre de la columna del kanban, un @usuario, un teléfono). Precargarla
 * tal cual ensucia la operación, así que ante la duda se devuelve vacío y que
 * el usuario lo escriba.
 */
export function cleanLeadDestination(destination: string | null | undefined): string {
  if (!destination) return ""

  const normalized = destination.toLowerCase().trim()

  for (const status of LEAD_STATUS_KEYWORDS) {
    if (normalized.includes(status)) return ""
  }

  for (const pattern of INVALID_DESTINATION_PATTERNS) {
    if (pattern.test(normalized)) return ""
  }

  if (destination.length < 3 || destination.length > 50) return ""

  // Un destino es letras y espacios. Cualquier dígito o símbolo delata que el
  // campo trae otra cosa (un teléfono, un código, "Cancún x2").
  if (/\d/.test(destination) || /[^a-záéíóúüñ\s]/i.test(destination)) return ""

  return destination
}

export interface LeadPrefillSource {
  agency_id?: string | null
  assigned_seller_id?: string | null
  destination?: string | null
  quoted_price?: number | string | null
  estimated_departure_date?: string | null
  deposit_currency?: string | null
  notes?: string | null
}

export interface LeadPrefillValues {
  agency_id?: string
  seller_id?: string
  destination: string
  departure_date: Date | undefined
  sale_amount_total: number
  currency: "ARS" | "USD"
  sale_currency: "ARS" | "USD"
  operator_cost_currency: "ARS" | "USD"
  passenger_notes: string
}

/**
 * Sólo se precarga la fecha estimada si existe y no es pasada: una fecha vieja
 * dispara el 400 de validación de fechas recién en el submit, después de que el
 * usuario cargó todo el formulario.
 */
function prefillDepartureDate(value: string | null | undefined): Date | undefined {
  const parsed = parseDateOnlyLocal(value)
  if (!parsed) return undefined
  const asString = formatDateOnlyLocal(parsed)
  return asString && asString >= todayInArgentina() ? parsed : undefined
}

export function buildLeadPrefill(lead: LeadPrefillSource): LeadPrefillValues {
  const amount = Number(lead.quoted_price)
  const currency: "ARS" | "USD" = lead.deposit_currency === "ARS" ? "ARS" : "USD"

  return {
    agency_id: lead.agency_id || undefined,
    seller_id: lead.assigned_seller_id || undefined,
    destination: cleanLeadDestination(lead.destination),
    departure_date: prefillDepartureDate(lead.estimated_departure_date),
    sale_amount_total: Number.isFinite(amount) && amount > 0 ? amount : 0,
    currency,
    sale_currency: currency,
    operator_cost_currency: currency,
    passenger_notes: lead.notes ?? "",
  }
}

/** Campos del prefill que no aportan nada si vienen vacíos. */
function isEmptyPrefillValue(value: unknown): boolean {
  return value === undefined || value === "" || value === null || value === 0
}

/**
 * Subconjunto del prefill que se puede aplicar sin pisar al usuario.
 *
 * `dirtyFields` viene de react-hook-form y marca lo que la persona tocó. Un
 * campo tocado no se pisa ni aunque el lead traiga algo mejor, y un valor vacío
 * del lead no borra lo que ya había.
 */
export function selectUntouchedPrefill(
  prefill: LeadPrefillValues,
  dirtyFields: Record<string, unknown>
): Partial<LeadPrefillValues> {
  const result: Record<string, unknown> = {}

  for (const [field, value] of Object.entries(prefill)) {
    if (dirtyFields[field]) continue
    if (isEmptyPrefillValue(value)) continue
    result[field] = value
  }

  return result as Partial<LeadPrefillValues>
}
