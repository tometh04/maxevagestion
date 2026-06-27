/**
 * Cliente HTTP server-only hacia la admin API de Eve (agente conversacional Vibu).
 *
 * Requiere las variables de entorno:
 *   EVE_API_BASE_URL       — base URL de la API admin de Eve (ej. https://api.eve.vibu.ai)
 *   EVE_ADMIN_API_SECRET   — Bearer secret compartido con Eve
 *
 * Todas las funciones lanzan con mensaje útil si las vars faltan o si la API
 * devuelve un status no-2xx.
 */

function getBaseUrl(): string {
  const url = process.env.EVE_API_BASE_URL
  if (!url) throw new Error("[eve/client] EVE_API_BASE_URL no configurada")
  return url.replace(/\/$/, "")
}

function getSecret(): string {
  const s = process.env.EVE_ADMIN_API_SECRET
  if (!s) throw new Error("[eve/client] EVE_ADMIN_API_SECRET no configurada")
  return s
}

async function eveRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getSecret()}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`[eve/client] API error ${res.status} on ${method} ${path}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ─── Tipos de request/response ───────────────────────────────────────────────

export interface EveUpsertAgenciaInput {
  vibook_org_id: string
  nombre: string
  lead_webhook_url: string
  /** Secret en claro — Eve lo usará para firmar sus webhooks hacia maxeva */
  lead_webhook_secret: string
  plan?: string
  prompt_custom?: string
}

export interface EveUpsertAgenciaResult {
  agencia_id: string
  created: boolean
}

export interface EveUpsertCanalInput {
  agencia_id: string
  tipo: "whatsapp" | "instagram" | "messenger"
  external_id: string
  /** Token del canal (ej. WhatsApp Business API token). No se persiste en maxeva. */
  token?: string
  waba_id?: string
  config?: Record<string, unknown>
}

export interface EveUpsertCanalResult {
  canal_id: string
  waba_subscribed?: boolean
}

export interface EveAgencia {
  id: string
  nombre: string
  plan?: string
  activa: boolean
  prompt_custom?: string | null
}

export interface EveCanal {
  id: string
  tipo: string
  external_id: string
  activa: boolean
  config?: Record<string, unknown>
}

export interface EveGetAgenciaResult {
  agencia: EveAgencia | null
  canales: EveCanal[]
}

// ─── Funciones exportadas ─────────────────────────────────────────────────────

/**
 * Registra o actualiza una agencia en Eve.
 * Idempotente: si ya existe (por vibook_org_id), actualiza los datos.
 */
export async function eveUpsertAgencia(input: EveUpsertAgenciaInput): Promise<EveUpsertAgenciaResult> {
  return eveRequest<EveUpsertAgenciaResult>("POST", "/admin/agencia", input)
}

/**
 * Actualiza el prompt personalizado de una agencia en Eve.
 */
export async function eveSetPrompt(agencia_id: string, prompt_custom: string): Promise<{ ok: boolean }> {
  return eveRequest<{ ok: boolean }>("POST", "/admin/prompt", { agencia_id, prompt_custom })
}

/**
 * Registra o actualiza un canal de mensajería en Eve.
 * Los tokens Meta (WhatsApp Business, etc.) viajan a Eve y NO se persisten en maxeva.
 */
export async function eveUpsertCanal(input: EveUpsertCanalInput): Promise<EveUpsertCanalResult> {
  return eveRequest<EveUpsertCanalResult>("POST", "/admin/canal", input)
}

/**
 * Obtiene el estado completo de una agencia Eve y sus canales.
 * Usado para el GET de /api/eve/connection y /api/eve/channels.
 */
export async function eveGetAgencia(vibook_org_id: string): Promise<EveGetAgenciaResult> {
  return eveRequest<EveGetAgenciaResult>(
    "GET",
    `/admin/agencia?vibook_org_id=${encodeURIComponent(vibook_org_id)}`
  )
}
