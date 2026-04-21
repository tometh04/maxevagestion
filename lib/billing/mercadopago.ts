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

export interface CreatePreapprovalParams {
  orgId: string
  plan: PlanId
  payerEmail: string
  /** URL absoluta a la que redirigir después del pago. */
  backUrl: string
  /** Si true, incluye free_trial 7 días. Default true para flow estándar. */
  includeFreeTrial?: boolean
  /** Opcional: start_date ISO para reactivaciones. MP no cobra antes de esta fecha. */
  startDate?: string
}

export interface PreapprovalResult {
  id: string
  init_point: string
  status: string
}

export async function createPreapproval(params: CreatePreapprovalParams): Promise<PreapprovalResult> {
  const plan = PLANS[params.plan]
  if (!plan) throw new Error(`Plan inválido: ${params.plan}`)
  if (plan.priceArsMonthly === null || plan.contactSalesOnly) {
    throw new Error(`Plan ${params.plan} es contact-sales-only, no se puede crear preapproval`)
  }

  const includeFreeTrial = params.includeFreeTrial ?? true

  const autoRecurring: any = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: plan.priceArsMonthly,
    currency_id: "ARS",
  }
  if (includeFreeTrial) {
    autoRecurring.free_trial = { frequency: 7, frequency_type: "days" }
  }
  if (params.startDate) {
    autoRecurring.start_date = params.startDate
  }

  const body = {
    reason: `Vibook — plan ${plan.name}`,
    external_reference: params.orgId,
    payer_email: params.payerEmail,
    back_url: params.backUrl,
    auto_recurring: autoRecurring,
    status: "pending",
  }

  console.log("[mp] createPreapproval body:", JSON.stringify(body))

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error("[mp] createPreapproval FAILED", res.status, text, "body was:", JSON.stringify(body))
    throw new Error(`MP preapproval failed (${res.status}): ${text}`)
  }
  return (await res.json()) as PreapprovalResult
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
