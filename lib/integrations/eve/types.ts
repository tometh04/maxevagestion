/**
 * Tipos del webhook de Eve (agente conversacional de Vibu).
 * Spec acordada con el equipo de Eve. Single source of truth para
 * validación de payload + adapter.
 */

export type EveEstado = "incompleto" | "listo_para_cotizar"

export interface EvePasajeros {
  adultos: number
  ninos: number
  infantes: number
  edades_menores: number[]
}

export interface EveVuelo {
  origen?: string
  destino?: string
  region?: string
  fecha_ida?: string
  fecha_vuelta?: string
  fechas_flexibles?: boolean
  pasajeros?: EvePasajeros
  clase?: string
  vuelo_directo?: boolean
  equipaje?: boolean
  presupuesto?: string
  motivo?: string
}

export interface EveContacto {
  nombre?: string
  telefono?: string
  email?: string
}

export interface EveWebhookBody {
  /** Identificador único del evento (idempotencia). OBLIGATORIO. */
  event_id: string

  /**
   * Identificador único de la conversación Eve. OBLIGATORIO.
   * Se usa como clave de upsert en leads (UNIQUE org_id, eve_session_id).
   */
  session_id: string

  /** Estado de la calificación del lead. OBLIGATORIO. */
  estado: EveEstado

  /** Canal de origen (ej. "whatsapp", "instagram", "messenger"). */
  canal_tipo?: string

  /**
   * Identificador externo del contacto en el canal
   * (teléfono para WhatsApp, handle para Instagram).
   */
  contacto_externo?: string

  /** Datos de contacto del prospecto. */
  contacto?: EveContacto

  /** Datos del vuelo/viaje que el prospecto consultó. */
  vuelo?: EveVuelo

  /** Notas adicionales del agente Eve. */
  notas?: string
}

/** Config almacenado en `org_integrations.config` para la integración Eve. */
export interface EveIntegrationConfig {
  /**
   * Agency_id donde se crean los leads.
   * Igual que Chatsell: requerido porque Eve no tiene contexto multi-agencia.
   */
  default_agency_id?: string

  /**
   * ID de agencia en la DB interna de Eve (UUID del sistema Eve, DISTINTO de default_agency_id).
   * Se usa para llamadas a la admin API de Eve (eveSetPrompt, eveUpsertCanal, eveGetAgencia).
   * NO es válido como FK hacia la tabla `agencies` de maxeva.
   */
  eve_agencia_id?: string

  /**
   * Prompt personalizado que Eve usa para esta agencia.
   * Guardado acá para referencia; no lo usa el webhook.
   */
  prompt_custom?: string
}
