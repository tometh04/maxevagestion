import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { createPaymentPreference } from "@/lib/billing/mercadopago"
import { hasAdminRole } from "@/lib/permissions"
import { getQuotationQuotaUsage } from "@/lib/quotation-quota/server"
import { createAdminClient } from "@/lib/supabase/server"

const BODY = z.object({ package_id: z.string().uuid() }).strict()

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!user.org_id || !hasAdminRole(user.roles)) {
    return NextResponse.json({ error: "No tiene permiso para comprar créditos" }, { status: 403 })
  }
  const parsed = BODY.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Paquete inválido" }, { status: 400 })
  }

  const admin = createAdminClient() as any
  const [{ data: org }, { data: pack }] = await Promise.all([
    admin.from("organizations").select("id, plan, billing_email").eq("id", user.org_id).single(),
    admin.from("quotation_credit_packages")
      .select("id, name, units, price_ars, target_plan, target_org_id, active")
      .eq("id", parsed.data.package_id)
      .maybeSingle(),
  ])
  if (!org || !pack || !pack.active) {
    return NextResponse.json({ error: "Paquete no disponible" }, { status: 404 })
  }
  const eligible = pack.target_org_id === user.org_id
    || (!pack.target_org_id && !pack.target_plan)
    || (!pack.target_org_id && pack.target_plan === org.plan)
  if (!eligible) {
    return NextResponse.json({ error: "Paquete no disponible para esta organización" }, { status: 404 })
  }

  const usage = await getQuotationQuotaUsage(admin, user.org_id)
  if (!usage.configured || !usage.period_id || !usage.ends_at) {
    return NextResponse.json(
      { error: "La organización no tiene un cupo de cotizaciones activo" },
      { status: 409 }
    )
  }

  const { data: order, error: orderError } = await admin
    .from("quotation_credit_orders")
    .insert({
      org_id: user.org_id,
      period_id: usage.period_id,
      package_id: pack.id,
      created_by: user.id,
      units_snapshot: pack.units,
      amount_ars_snapshot: pack.price_ars,
      expires_at: usage.ends_at,
    })
    .select("id")
    .single()
  if (orderError || !order) {
    return NextResponse.json({ error: "No se pudo iniciar la compra" }, { status: 500 })
  }

  const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai").trim()
  const appUrl = /^https?:\/\//i.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`
  try {
    const preference = await createPaymentPreference({
      orderId: order.id,
      title: pack.name,
      units: Number(pack.units),
      amountArs: Number(pack.price_ars),
      payerEmail: org.billing_email || user.email,
      backUrl: `${appUrl.replace(/\/+$/, "")}/settings/subscription`,
      expiresAt: usage.ends_at,
    })
    const checkoutUrl = process.env.MP_USE_SANDBOX === "true"
      ? preference.sandbox_init_point || preference.init_point
      : preference.init_point
    await admin.from("quotation_credit_orders").update({
      mp_preference_id: preference.id,
      checkout_url: checkoutUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", order.id)
    return NextResponse.json({ order_id: order.id, checkout_url: checkoutUrl })
  } catch (error) {
    await admin.from("quotation_credit_orders")
      .update({ status: "FAILED", updated_at: new Date().toISOString() })
      .eq("id", order.id)
    console.error("[quotation-credits] preference failed", error)
    return NextResponse.json({ error: "Mercado Pago no pudo iniciar el checkout" }, { status: 502 })
  }
}
