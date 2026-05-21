/**
 * Adapter del payload de Chatsell → shape interno de Vibook.
 *
 * Responsabilidades:
 * - Validar campos obligatorios
 * - Normalizar teléfono e instagram
 * - Inferir region desde el destino (usando el helper existente)
 * - Mapear `calidad` a status + tag interno
 *
 * NO toca BD. La inserción la maneja sync-handler.ts.
 */

import type { ChatsellWebhookBody, ChatsellQuality } from "./types"
import { getLeadRegionForDestination } from "@/lib/destinations"

export interface NormalizedChatsellLead {
  event_id: string
  contact_name: string
  contact_phone: string | null
  contact_email: string | null
  contact_instagram: string | null
  destination: string
  region: string
  origen: string | null
  fechas: string | null
  personas: number | null
  presupuesto: string | null
  notas: string | null
  conversation_url: string | null
  /** "🔥 Caliente" | "❄️ Frío" — tag display name */
  quality_tag: string
  /** Status inicial mapeado desde calidad */
  initial_status: "NEW" | "IN_PROGRESS"
  /** Quality raw para guardar referencia */
  quality_raw: ChatsellQuality
  /** Payload completo (para chatsell_full_data) */
  raw_payload: unknown
}

export class ChatsellValidationError extends Error {
  field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = "ChatsellValidationError"
    this.field = field
  }
}

/**
 * Valida y normaliza el body del webhook.
 * Lanza ChatsellValidationError con detail si falta campo obligatorio.
 */
export function adaptChatsellPayload(raw: unknown): NormalizedChatsellLead {
  if (!raw || typeof raw !== "object") {
    throw new ChatsellValidationError("Body must be a JSON object")
  }
  const body = raw as Partial<ChatsellWebhookBody>

  // Campos obligatorios
  const nombre = (body.nombre ?? "").toString().trim()
  if (!nombre) {
    throw new ChatsellValidationError("Missing required field: nombre", "nombre")
  }

  const telefonoRaw = (body.telefono ?? "").toString().trim()
  if (!telefonoRaw) {
    throw new ChatsellValidationError("Missing required field: telefono", "telefono")
  }

  const destino = (body.destino ?? "").toString().trim()
  if (!destino) {
    throw new ChatsellValidationError("Missing required field: destino", "destino")
  }

  const calidad = (body.calidad ?? "").toString().trim().toLowerCase() as ChatsellQuality
  if (calidad !== "caliente" && calidad !== "frio") {
    throw new ChatsellValidationError(
      `Invalid 'calidad': expected 'caliente' or 'frio', got '${body.calidad}'`,
      "calidad"
    )
  }

  // Normalizar teléfono — sacar caracteres no numéricos excepto el +
  const contact_phone = telefonoRaw.replace(/[^\d+]/g, "") || null

  // Normalizar instagram — sacar @ inicial y lowercase
  const instagramRaw = (body.instagram ?? "").toString().trim()
  const contact_instagram = instagramRaw
    ? instagramRaw.replace(/^@/, "").toLowerCase() || null
    : null

  const contact_email = (body.email ?? "").toString().trim() || null

  // Inferir región desde destino (helper existente, mismo que NewLeadDialog)
  // Si no matchea ningún destino conocido, fallback a "OTROS"
  const inferredRegion = getLeadRegionForDestination(destino)
  const region = inferredRegion || "OTROS"

  // Mapeo calidad → status + tag
  const initial_status = calidad === "caliente" ? "IN_PROGRESS" : "NEW"
  const quality_tag = calidad === "caliente" ? "🔥 Caliente" : "❄️ Frío"

  const personas =
    typeof body.personas === "number" && !isNaN(body.personas)
      ? body.personas
      : null

  // event_id: si no viene, autogeneramos uno determinístico-ish
  const event_id =
    (body.event_id ?? "").toString().trim() ||
    `chatsell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return {
    event_id,
    contact_name: nombre,
    contact_phone,
    contact_email,
    contact_instagram,
    destination: destino,
    region,
    origen: (body.origen ?? "").toString().trim() || null,
    fechas: (body.fechas ?? "").toString().trim() || null,
    personas,
    presupuesto: (body.presupuesto ?? "").toString().trim() || null,
    notas: (body.notas ?? "").toString().trim() || null,
    conversation_url: (body.conversation_url ?? "").toString().trim() || null,
    quality_tag,
    initial_status,
    quality_raw: calidad,
    raw_payload: body,
  }
}

/**
 * Construye el campo `notes` legible para el vendedor a partir de los datos
 * normalizados. Formato consistente con Manychat sync para que el UI no
 * tenga que diferenciar.
 */
export function buildLeadNotes(n: NormalizedChatsellLead): string {
  const lines: string[] = []
  lines.push(`🤖 Lead derivado por Chatsell (${n.quality_raw === "caliente" ? "🔥 caliente" : "❄️ frío"})`)
  if (n.origen) lines.push(`🛫 Origen: ${n.origen}`)
  if (n.fechas) lines.push(`📅 Fechas: ${n.fechas}`)
  if (n.personas) lines.push(`👥 Pasajeros: ${n.personas}`)
  if (n.presupuesto) lines.push(`💰 Presupuesto: ${n.presupuesto}`)
  if (n.notas) lines.push(`📝 ${n.notas}`)
  if (n.conversation_url) lines.push(`🔗 Conversación: ${n.conversation_url}`)
  return lines.join("\n")
}
