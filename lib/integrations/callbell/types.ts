/**
 * Types del payload de Callbell.
 *
 * ⚠️ TODO al implementar Task 10/11: verificar contra https://dev.callbell.eu/
 *   - Nombres exactos de endpoints
 *   - Shape exacto de respuestas (paginación, wrapping)
 *   - Auth header (Bearer vs Token vs custom)
 *   - Header y algoritmo de firma para webhooks salientes
 */

export type CallbellContact = {
  uuid: string
  name: string
  phoneNumber: string
  email?: string | null
  channel: "whatsapp" | "instagram" | "facebook" | string
  tags: CallbellTag[]
  funnelStage?: CallbellFunnelStage | null
  assignedAgent?: CallbellAgent | null
  createdAt: string
  updatedAt: string
}

export type CallbellTag = {
  uuid: string
  name: string
  color?: string
}

export type CallbellFunnelStage = {
  uuid: string
  name: string
  order?: number
}

export type CallbellAgent = {
  uuid: string
  name: string
  email: string
}

export type CallbellWebhookEvent = {
  type:
    | "message_created"
    | "contact_created"
    | "tag_added"
    | "tag_removed"
    | "funnel_changed"
    | "agent_assigned"
    | string
  uuid: string
  timestamp: string
  data: {
    contact?: CallbellContact
    tag?: CallbellTag
    funnelStage?: CallbellFunnelStage
    agent?: CallbellAgent
    [k: string]: unknown
  }
}
