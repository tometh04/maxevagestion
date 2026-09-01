import { NextResponse } from "next/server"
import { z } from "zod"
import { fetchPayment, verifyWebhookSignature } from "@/lib/billing/mercadopago"
import { createAdminClient } from "@/lib/supabase/server"

const orderIdSchema = z.string().uuid()

export async function POST(request: Request) {
  const url = new URL(request.url)
  const body = await request.json().catch(() => ({}))
  const type = String(url.searchParams.get("type") || body?.type || "")
  const dataId = String(url.searchParams.get("data.id") || body?.data?.id || "")
  if (type !== "payment" || !dataId) return NextResponse.json({ ok: true, ignored: true })

  if (!verifyWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
  })) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 })
  }

  const payment = await fetchPayment(dataId)
  const reference = String(payment?.external_reference || "")
  const prefix = "quotation-credit-order:"
  if (!reference.startsWith(prefix)) return NextResponse.json({ ok: true, ignored: true })
  const orderId = reference.slice(prefix.length)
  if (!orderIdSchema.safeParse(orderId).success) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const admin = createAdminClient() as any
  const { error } = await admin.rpc("apply_quotation_credit_payment", {
    p_order_id: orderId,
    p_payment_id: String(payment.id),
    p_payment_status: String(payment.status),
    p_amount_ars: Number(payment.transaction_amount),
    p_currency: String(payment.currency_id),
  })
  if (error) {
    console.error("[quotation-credits:webhook] apply failed", {
      orderId,
      paymentId: String(payment.id),
      code: error.code,
    })
    return NextResponse.json({ error: "payment could not be applied" }, { status: 422 })
  }
  return NextResponse.json({ ok: true })
}
