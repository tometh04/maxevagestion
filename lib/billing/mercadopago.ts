/**
 * SaaS Pilar 9 — Cliente Mercado Pago (Preapproval / suscripciones).
 *
 * Usa el endpoint REST directamente con fetch — no agregamos SDK de MP
 * para evitar deps. Las dos funciones que importan:
 *   - createPreapproval: crea la suscripción y devuelve init_point (URL
 *     a la que redirige al comprador).
 *   - verifyWebhookSignature: valida el header x-signature del webhook.
 *
 * Env vars requeridas (tomi las setea en Vercel):
 *   MP_ACCESS_TOKEN       — Access token de la cuenta MP (Bearer).
 *   MP_WEBHOOK_SECRET     — Secret para verificar webhooks (desde panel MP).
 *   NEXT_PUBLIC_APP_URL   — URL base de la app (ej: https://app.vibook.ai)
 *                           usada para back_url del preapproval.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import type { PlanId } from "./plans"
import { PLANS } from "./plans"

const MP_API = "https://api.mercadopago.com"

function mustEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Env var ${key} requerida para MercadoPago`)
  return v
}

export interface CreatePreapprovalParams {
  orgId: string
  plan: PlanId
  payerEmail: string
  /** URL absoluta a la que redirigir después del pago. */
  backUrl: string
}

export interface PreapprovalResult {
  id: string
  init_point: string
  status: string
}

export async function createPreapproval(params: CreatePreapprovalParams): Promise<PreapprovalResult> {
  const plan = PLANS[params.plan]
  if (!plan) throw new Error(`Plan inválido: ${params.plan}`)

  const body = {
    reason: `MAXEVA — plan ${plan.name}`,
    external_reference: params.orgId,
    payer_email: params.payerEmail,
    back_url: params.backUrl,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: plan.priceArsMonthly,
      currency_id: "ARS",
    },
    status: "pending",
  }

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mustEnv("MP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP preapproval failed (${res.status}): ${text}`)
  }
  return (await res.json()) as PreapprovalResult
}

export async function fetchPreapproval(preapprovalId: string): Promise<any> {
  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${mustEnv("MP_ACCESS_TOKEN")}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MP fetch preapproval failed (${res.status}): ${text}`)
  }
  return await res.json()
}

export async function cancelPreapproval(preapprovalId: string): Promise<void> {
  const res = await fetch(`${MP_API}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${mustEnv("MP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "cancelled" }),
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`MP cancel preapproval failed (${res.status}): ${text}`)
  }
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
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    console.warn("MP_WEBHOOK_SECRET no configurado — aceptando webhook sin verificar")
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
