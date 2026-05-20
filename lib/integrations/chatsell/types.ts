/**
 * Tipos del webhook de Chatsell (agente IA de ventas que deriva leads
 * pre-calificados a Vibook). Spec acordada con el equipo de Chatsell el
 * 2026-05-20. Single source of truth para validación de payload + adapter.
 */

export type ChatsellQuality = "caliente" | "frio"

export interface ChatsellWebhookBody {
  /** Identificador único del evento (idempotencia). Opcional pero recomendado. */
  event_id?: string

  /** Nombre del prospecto. OBLIGATORIO. */
  nombre: string

  /**
   * Teléfono del prospecto. OBLIGATORIO.
   * Puede venir con o sin código país, con o sin espacios/guiones.
   * Internamente normalizamos.
   */
  telefono: string

  /** Email. Opcional. */
  email?: string

  /** Instagram handle. Opcional. */
  instagram?: string

  /** Destino del viaje (ej. "Cancún", "París"). OBLIGATORIO. */
  destino: string

  /** Ciudad de origen del viaje. Opcional. */
  origen?: string

  /** Fechas tentativas (texto libre, ej. "Diciembre 2026"). Opcional. */
  fechas?: string

  /** Cantidad de pasajeros. Opcional. */
  personas?: number

  /** Presupuesto declarado (texto libre, ej. "USD 5000"). Opcional. */
  presupuesto?: string

  /**
   * Calidad del lead según Chatsell. OBLIGATORIO.
   * - "caliente": interés inmediato, urgencia, listo para comprar
   * - "frio": curiosidad inicial, sin urgencia
   *
   * Se mapea a:
   * - "caliente" → tag "🔥 Caliente" + status IN_PROGRESS
   * - "frio"     → tag "❄️ Frío" + status NEW
   */
  calidad: ChatsellQuality

  /** Notas adicionales del agente IA. Opcional. */
  notas?: string

  /** URL al chat completo en Chatsell. Opcional. */
  conversation_url?: string

  /** Metadata arbitraria (no se valida). Se guarda completa en lead.chatsell_full_data. */
  metadata?: Record<string, unknown>
}

/** Config almacenado en `org_integrations.config` para Chatsell. */
export interface ChatsellIntegrationConfig {
  /**
   * Agency_id donde se crean los leads. REQUERIDO en config porque
   * Chatsell no tiene contexto multi-agencia per-tenant.
   */
  agency_id: string

  /**
   * Si true, crea leads automáticamente al recibir webhook.
   * Default true para Chatsell (diferente de Callbell que es false).
   */
  auto_create_leads?: boolean
}
