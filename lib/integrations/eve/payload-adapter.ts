/**
 * Adapter del payload de Eve → shape interno de Vibook.
 *
 * Responsabilidades:
 * - Validar campos obligatorios (event_id, session_id, estado)
 * - Normalizar tipos (defaults de contacto/vuelo a {})
 * - Preservar raw_payload para eve_full_data
 *
 * NO toca BD. La inserción la maneja sync-handler.ts.
 */

import type { EveWebhookBody, EveEstado, EveContacto, EveVuelo } from "./types"

export interface NormalizedEveLead {
  event_id: string
  session_id: string
  estado: EveEstado
  canal_tipo: string
  contacto_externo: string
  contacto: EveContacto
  vuelo: EveVuelo
  notas: string | null
  /** Payload completo (para eve_full_data) */
  raw_payload: unknown
}

export class EveValidationError extends Error {
  field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = "EveValidationError"
    this.field = field
  }
}

const VALID_ESTADOS: EveEstado[] = ["incompleto", "listo_para_cotizar"]

/**
 * Valida y normaliza el body del webhook de Eve.
 * Lanza EveValidationError con `.field` si falta campo obligatorio o
 * si `estado` tiene un valor fuera del enum.
 */
export function adaptEvePayload(raw: unknown): NormalizedEveLead {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new EveValidationError("Body must be a JSON object")
  }
  const body = raw as Partial<EveWebhookBody>

  // event_id — obligatorio
  const event_id = (body.event_id ?? "").toString().trim()
  if (!event_id) {
    throw new EveValidationError("Missing required field: event_id", "event_id")
  }

  // session_id — obligatorio (clave de upsert)
  const session_id = (body.session_id ?? "").toString().trim()
  if (!session_id) {
    throw new EveValidationError("Missing required field: session_id", "session_id")
  }

  // estado — obligatorio + enum
  const estadoRaw = (body.estado ?? "").toString().trim() as EveEstado
  if (!VALID_ESTADOS.includes(estadoRaw)) {
    throw new EveValidationError(
      `Invalid 'estado': expected one of ${VALID_ESTADOS.join(", ")}, got '${body.estado}'`,
      "estado"
    )
  }

  // Campos opcionales con defaults seguros
  const contacto: EveContacto =
    body.contacto && typeof body.contacto === "object" && !Array.isArray(body.contacto)
      ? (body.contacto as EveContacto)
      : {}

  const vuelo: EveVuelo =
    body.vuelo && typeof body.vuelo === "object" && !Array.isArray(body.vuelo)
      ? (body.vuelo as EveVuelo)
      : {}

  return {
    event_id,
    session_id,
    estado: estadoRaw,
    canal_tipo: (body.canal_tipo ?? "").toString().trim(),
    contacto_externo: (body.contacto_externo ?? "").toString().trim(),
    contacto,
    vuelo,
    notas: (body.notas ?? "").toString().trim() || null,
    raw_payload: raw,
  }
}
