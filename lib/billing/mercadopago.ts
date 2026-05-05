/**
 * SaaS Pilar 9 — Cliente Mercado Pago (Preapproval / suscripciones).
 *
 * Usa el endpoint REST directamente con fetch — no agregamos SDK de MP
 * para evitar deps. Las dos funciones que importan:
 *   - createPreapproval: crea la suscripción y devuelve init_point (URL
 *     a la que redirige al comprador).
 *   - verifyWebhookSignature: valida el header x-signature del webhook.
 *
 * Env vars requeridas (Railway / Vercel):
 *   MERCADOPAGO_ACCESS_TOKEN   — Access token de la cuenta MP (Bearer).
 *     Alias legacy soportado: MP_ACCESS_TOKEN.
 *   MERCADOPAGO_WEBHOOK_SECRET — Secret para verificar firma del webhook.
 *     Alias legacy soportado: MP_WEBHOOK_SECRET.
 *   NEXT_PUBLIC_APP_URL        — URL base de la app (ej: https://app.vibook.ai)
 *                                usada para back_url del preapproval.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import type { PlanId } from "./plans"
import { PLANS } from "./plans"

const MP_API = "https://api.mercadopago.com"

/**
 * Access token de MP. Railway lo tiene como MERCADOPAGO_ACCESS_TOKEN;
 * code antiguo lo referenciaba como MP_ACCESS_TOKEN. Aceptamos ambos
 * para no depender del nombre que use el host.
 */
function mpAccessToken(): string {
  const useSandbox = process.env.MP_USE_SANDBOX === "true"
  if (useSandbox) {
    const v = process.env.MERCADOPAGO_ACCESS_TOKEN_SANDBOX
    if (!v) throw new Error("MP_USE_SANDBOX=true pero MERCADOPAGO_ACCESS_TOKEN_SANDBOX no está seteado")
    return v
  }
  const v = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN
  if (!v) {
    throw new Error(
      "Env var MERCADOPAGO_ACCESS_TOKEN (o alias MP_ACCESS_TOKEN) requerida para MercadoPago"
    )
  }
  return v
}

/** Secret opcional del webhook MP. Undefined si no está seteado. */
function mpWebhookSecret(): string | undefined {
  return process.env.MERCADOPAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || undefined
}

/**
 * True si la integración MP está corriendo contra sandbox (test mode).
 * Útil para que la UI muestre un banner y no se confundan tokens reales con
 * tokens de prueba. La env `MP_USE_SANDBOX=true` activa el modo y exige
 * `MERCADOPAGO_ACCESS_TOKEN_SANDBOX` configurado.
 */
export function isMpSandbox(): boolean {
  return process.env.MP_USE_SANDBOX === "true"
}

export interface CreatePreapprovalParams {
  orgId: string
  plan: PlanId | "CUSTOM"
  payerEmail: string
  /** URL absoluta a la que redirigir después del pago. */
  backUrl: string
  /** Si true, incluye free_trial 7 días. Default true para flow estándar. */
  includeFreeTrial?: boolean
  /** Opcional: start_date ISO para reactivaciones. MP no cobra antes de esta fecha. */
  startDate?: string
  /** Requerido si plan === 'CUSTOM'. Monto en ARS. */
  customAmount?: number
  /** Requerido si plan === 'CUSTOM'. Aparece como "reason" en MP. */
  customReason?: string
}

export interface PreapprovalResult {
  id: string
  init_point: string
  status: string
}

export async function createPreapproval(params: CreatePreapprovalParams): Promise<PreapprovalResult> {
  let amount: number
  let reason: string

  if (params.plan === "CUSTOM") {
    if (!Number.isFinite(params.customAmount) || (params.customAmount as number) <= 0) {
      throw new Error("customAmount requerido y > 0 para plan CUSTOM")
    }
    if (!params.customReason?.trim()) {
      throw new Error("customReason requerido para plan CUSTOM")
    }
    amount = params.customAmount as number
    reason = params.customReason
  } else {
    const plan = PLANS[params.plan]
    if (!plan) throw new Error(`Plan inválido: ${params.plan}`)
    if (plan.priceArsMonthly === null || plan.contactSalesOnly) {
      throw new Error(`Plan ${params.plan} es contact-sales-only, no se puede crear preapproval`)
    }
    amount = plan.priceArsMonthly
    // ASCII-only: em-dash (—) a veces rompe la API de MP con 500 genérico.
    reason = `Vibook - plan ${plan.name}`
  }

  const includeFreeTrial = params.includeFreeTrial ?? true

  const autoRecurring: any = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: amount,
    currency_id: "ARS",
  }
  if (includeFreeTrial) {
    autoRecurring.free_trial = { frequency: 7, frequency_type: "days" }
  }
  if (params.startDate) {
    autoRecurring.start_date = params.startDate
  }

  const body = {
    reason,
    external_reference: params.orgId,
    payer_email: params.payerEmail,
    back_url: params.backUrl,
    auto_recurring: autoRecurring,
    status: "pending",
  }

  // Logging verbose temporal para debug del 500 intermitente (quitar post-fix).
  const tokenPresent = !!(process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN)
  const tokenLen = (process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || "").length
  console.log("[mp.createPreapproval] POST body:", JSON.stringify(body))
  console.log("[mp.createPreapproval] token present:", tokenPresent, "len:", tokenLen)

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const rawText = await res.text()
  console.log(
    "[mp.createPreapproval] response status:",
    res.status,
    "x-request-id:",
    res.headers.get("x-request-id"),
    "body:",
    rawText.slice(0, 2000)
  )

  if (!res.ok) {
    throw new Error(`MP preapproval failed (${res.status}): ${rawText}`)
  }
  return JSON.parse(rawText) as PreapprovalResult
}

export async function fetchPreapproval(preapprovalId: string): Promise<any> {
  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${mpAccessToken()}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP fetch preapproval failed (${res.status}): ${text}`)
  }
  return await res.json()
}

export async function cancelPreapproval(preapprovalId: string): Promise<any> {
  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "cancelled" }),
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`MP cancel preapproval failed (${res.status}): ${text}`)
  }
  if (res.status === 404) return null
  return await res.json()
}

/**
 * Verificación de firma del webhook MP.
 *
 * MP envía el header `x-signature` con el formato:
 *   ts=<timestamp>,v1=<hmac-sha256 hex>
 * La firma es HMAC-SHA256(MP_WEBHOOK_SECRET, `id:<dataId>;request-id:<requestId>;ts:<ts>;`).
 * Spec: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
}): boolean {
  const secret = mpWebhookSecret()
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "MP webhook rejected: MERCADOPAGO_WEBHOOK_SECRET no configurado en producción"
      )
      return false
    }
    console.warn(
      "MERCADOPAGO_WEBHOOK_SECRET (o alias MP_WEBHOOK_SECRET) no configurado — dev mode, aceptando sin verificar"
    )
    return true
  }
  if (!params.xSignature || !params.dataId) return false

  const parts = Object.fromEntries(
    params.xSignature.split(",").map((p) => {
      const [k, v] = p.split("=")
      return [k?.trim(), v?.trim()]
    })
  )
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const manifest = `id:${params.dataId};request-id:${params.xRequestId ?? ""};ts:${ts};`
  const hmac = createHmac("sha256", secret).update(manifest).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(v1))
  } catch {
    return false
  }
}

/**
 * Actualiza transaction_amount de un preapproval existente.
 * MP permite cambios in-place hasta cierto margen; si el delta supera
 * el threshold, MP puede pedir re-autorización del usuario. Ver
 * shouldRequireMpReauth() en custom-plans.ts — la lógica de decisión
 * queda fuera de este módulo (este solo ejecuta el PUT).
 */
export async function updatePreapproval(
  preapprovalId: string,
  patch: { transaction_amount?: number; status?: string; start_date?: string }
): Promise<any> {
  const body: any = {}
  if (patch.transaction_amount !== undefined) {
    body.auto_recurring = { transaction_amount: patch.transaction_amount }
  }
  if (patch.status !== undefined) body.status = patch.status
  if (patch.start_date !== undefined) {
    body.auto_recurring = { ...(body.auto_recurring ?? {}), start_date: patch.start_date }
  }

  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP update preapproval failed (${res.status}): ${text}`)
  }
  return await res.json()
}

export interface CreatePreapprovalPlanParams {
  /** Nombre humano del plan (ej "Vibook PRO"). ASCII-only para evitar 500 raros de MP. */
  reason: string
  /** Monto ARS por mes. */
  amount: number
  /** URL absoluta de retorno post-pago. */
  backUrl: string
  /** Si true incluye free_trial 7 días. */
  includeFreeTrial: boolean
}

export interface PreapprovalPlanResult {
  id: string
  init_point: string
  status: string
}

/**
 * Crea un preapproval_plan (template de suscripción) — versión SaaS del
 * preapproval. Devuelve un init_point genérico al que cualquier user puede
 * entrar con cualquier cuenta MP. No requiere payer_email al crear.
 *
 * Cuando un user se suscribe vía el init_point, MP crea automáticamente
 * un preapproval asociado y dispara webhook subscription_preapproval.created
 * con el preapproval_id + payer info.
 */
export async function createPreapprovalPlan(
  params: CreatePreapprovalPlanParams
): Promise<PreapprovalPlanResult> {
  const autoRecurring: any = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: params.amount,
    currency_id: "ARS",
  }
  if (params.includeFreeTrial) {
    autoRecurring.free_trial = { frequency: 7, frequency_type: "days" }
  }

  const body = {
    reason: params.reason,
    auto_recurring: autoRecurring,
    back_url: params.backUrl,
    // Nota: NO payer_email. Cualquier user puede usar el plan.
  }

  console.log("[mp.createPreapprovalPlan] POST body:", JSON.stringify(body))

  const res = await fetch(`${MP_API}/preapproval_plan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const rawText = await res.text()
  console.log(
    "[mp.createPreapprovalPlan] response status:",
    res.status,
    "x-request-id:",
    res.headers.get("x-request-id"),
    "body:",
    rawText.slice(0, 2000)
  )

  if (!res.ok) {
    throw new Error(`MP preapproval_plan failed (${res.status}): ${rawText}`)
  }
  return JSON.parse(rawText) as PreapprovalPlanResult
}

/** Fetch /v1/payments/{id} — usado por el webhook al procesar type=payment. */
export async function fetchPayment(paymentId: string): Promise<any> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpAccessToken()}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP fetch payment failed (${res.status}): ${text}`)
  }
  return await res.json()
}

/**
 * Busca preapprovals asociados a un payer_email. Los preapprovals hijos
 * creados vía preapproval_plan NO traen external_reference, así que el
 * matching se hace por payer_email cuando llega un webhook tipo "payment".
 */
export async function searchPreapprovalsByPayerEmail(
  payerEmail: string,
  limit = 10
): Promise<Array<{ id: string; status: string; last_modified?: string; [k: string]: any }>> {
  const url = new URL(`${MP_API}/preapproval/search`)
  url.searchParams.set("payer_email", payerEmail)
  url.searchParams.set("limit", String(limit))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${mpAccessToken()}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP search preapproval failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return (data?.results as any[]) ?? []
}

/**
 * Busca preapprovals autorizados que pertenecen a un preapproval_plan
 * específico. Usado por /api/billing/sync cuando MP no pasa preapproval_id
 * en el back_url — caemos al más reciente authorized del plan cacheado en
 * mp_plans + CHECKOUT_INITIATED.
 */
export async function searchPreapprovalsByPlanId(
  preapprovalPlanId: string,
  opts: { status?: string; limit?: number } = {}
): Promise<Array<{ id: string; status: string; date_created?: string; last_modified?: string; [k: string]: any }>> {
  const url = new URL(`${MP_API}/preapproval/search`)
  url.searchParams.set("preapproval_plan_id", preapprovalPlanId)
  if (opts.status) url.searchParams.set("status", opts.status)
  url.searchParams.set("sort", "date_created:desc")
  url.searchParams.set("limit", String(opts.limit ?? 10))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${mpAccessToken()}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP search preapproval (by plan) failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return (data?.results as any[]) ?? []
}

/** Fetch preapproval_plan existente (GET). Útil para cache/reuso. */
export async function fetchPreapprovalPlan(planId: string): Promise<any> {
  const res = await fetch(`${MP_API}/preapproval_plan/${planId}`, {
    headers: { Authorization: `Bearer ${mpAccessToken()}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP fetch preapproval_plan failed (${res.status}): ${text}`)
  }
  return await res.json()
}
