// ⚠️ TODO al implementar Task 10/11: verificar contra https://dev.callbell.eu/
//   - Nombres exactos de endpoints (puede ser /v1/contacts vs /v1.1/contacts)
//   - Shape exacto de respuestas (paginación, wrapping)
//   - Auth header (Bearer vs Token vs custom)
// Cualquier discrepancia: actualizar este archivo y los types antes de seguir.

import type {
  CallbellContact,
  CallbellTag,
  CallbellFunnelStage,
} from "./types"

const BASE_URL =
  process.env.CALLBELL_API_BASE_URL || "https://api.callbell.eu/v1.1"

export class CallbellClient {
  constructor(private apiToken: string) {
    if (!apiToken) throw new Error("Callbell API token requerido")
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(
        `Callbell API ${res.status} ${path}: ${text.slice(0, 300)}`
      )
    }
    return (await res.json()) as T
  }

  /** Lista todas las tags del workspace. */
  async listTags(): Promise<CallbellTag[]> {
    const data = await this.request<{ tags: CallbellTag[] }>("/tags")
    return data.tags
  }

  /** Lista funnels (stages). */
  async listFunnels(): Promise<CallbellFunnelStage[]> {
    const data = await this.request<{ funnelStages: CallbellFunnelStage[] }>(
      "/funnel-stages"
    )
    return data.funnelStages
  }

  /** Trae contactos modificados desde un timestamp ISO. */
  async listContactsModifiedSince(
    sinceISO: string
  ): Promise<CallbellContact[]> {
    const url = `/contacts?modified_since=${encodeURIComponent(sinceISO)}`
    const data = await this.request<{ contacts: CallbellContact[] }>(url)
    return data.contacts
  }

  /** Trae un contacto por uuid. */
  async getContact(uuid: string): Promise<CallbellContact> {
    const data = await this.request<{ contact: CallbellContact }>(
      `/contacts/${uuid}`
    )
    return data.contact
  }
}
