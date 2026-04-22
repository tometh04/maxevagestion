import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { calculateEffectivePrice, type CustomPlanFeatures } from "@/lib/billing/custom-plans"
import { createPreapproval, cancelPreapproval } from "@/lib/billing/mercadopago"
import { applyPriceChange } from "@/lib/billing/mp-update"

type CustomPlanBody = {
  display_name?: string
  base_price_ars?: number
  discount_percent?: number
  discount_duration_months?: number
  features?: CustomPlanFeatures
  limits?: Record<string, unknown>
  billing_method?: "MP" | "MANUAL"
  notes?: string
}

async function requireAdmin() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const ok = await isPlatformAdmin(supabase, user.id)
  return { user, supabase, ok }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: orgId } = await params
  const body = (await request.json().catch(() => ({}))) as CustomPlanBody

  if (!body.display_name || !body.base_price_ars || body.base_price_ars <= 0) {
    return NextResponse.json({ error: "display_name y base_price_ars (>0) requeridos" }, { status: 400 })
  }
  const discount = body.discount_percent ?? 0
  const duration = body.discount_duration_months ?? 0
  if (discount < 0 || discount > 100) {
    return NextResponse.json({ error: "discount_percent debe estar entre 0 y 100" }, { status: 400 })
  }
  if (discount > 0 && duration <= 0) {
    return NextResponse.json({ error: "discount_duration_months > 0 requerido cuando hay descuento" }, { status: 400 })
  }
  const billingMethod = body.billing_method ?? "MP"

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, billing_email, mp_preapproval_id, custom_plan_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })
  if (org.custom_plan_id) {
    return NextResponse.json(
      { error: "Org ya tiene custom plan. Usar PATCH para editar o DELETE para reemplazar." },
      { status: 409 }
    )
  }

  const discountEndsAt =
    discount > 0 ? new Date(Date.now() + duration * 30 * 24 * 60 * 60 * 1000).toISOString() : null

  const { data: created, error: insertErr } = await admin
    .from("custom_plans")
    .insert({
      org_id: orgId,
      display_name: body.display_name,
      base_price_ars: body.base_price_ars,
      discount_percent: discount,
      discount_ends_at: discountEndsAt,
      features: body.features ?? { extras: [] },
      limits: body.limits ?? {},
      billing_method: billingMethod,
      notes: body.notes ?? null,
      created_by: user.id,
    })
    .select("*")
    .single()
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const updateOrgData: Record<string, unknown> = { custom_plan_id: created.id }

  let checkoutUrl: string | null = null
  if (billingMethod === "MP") {
    if (!org.billing_email) {
      await admin.from("custom_plans").delete().eq("id", created.id)
      return NextResponse.json(
        { error: "Org sin billing_email — no se puede crear preapproval MP" },
        { status: 400 }
      )
    }
    const effective = calculateEffectivePrice(body.base_price_ars, discount)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
    try {
      const mp = await createPreapproval({
        orgId,
        plan: "CUSTOM",
        payerEmail: org.billing_email,
        backUrl: `${appUrl}/settings/subscription?custom=ok`,
        customAmount: effective,
        customReason: `Vibook — ${body.display_name}`,
        includeFreeTrial: false,
      })
      updateOrgData.mp_preapproval_id = mp.id
      checkoutUrl = mp.init_point
    } catch (err: any) {
      await admin.from("custom_plans").delete().eq("id", created.id)
      return NextResponse.json({ error: `MP error: ${err.message}` }, { status: 502 })
    }
  }

  await admin.from("organizations").update(updateOrgData).eq("id", orgId)

  logSecurityEvent({
    eventType: "CUSTOM_PLAN_CREATED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "custom_plans",
    targetEntityId: created.id,
    details: { plan: created, checkoutUrl },
  })

  return NextResponse.json({ ok: true, custom_plan: created, checkout_url: checkoutUrl })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: orgId } = await params
  const body = (await request.json().catch(() => ({}))) as CustomPlanBody

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, billing_email, mp_preapproval_id, custom_plan_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org || !org.custom_plan_id) {
    return NextResponse.json({ error: "Org no tiene custom plan" }, { status: 404 })
  }

  const { data: current } = await admin
    .from("custom_plans")
    .select("*")
    .eq("id", org.custom_plan_id)
    .single()

  const update: Record<string, unknown> = {}
  for (const k of ["display_name", "features", "limits", "notes", "billing_method"] as const) {
    if (body[k] !== undefined) update[k] = body[k]
  }
  let priceChanged = false
  if (body.base_price_ars !== undefined && body.base_price_ars !== Number(current.base_price_ars)) {
    update.base_price_ars = body.base_price_ars
    priceChanged = true
  }
  if (
    body.discount_percent !== undefined &&
    body.discount_percent !== current.discount_percent
  ) {
    update.discount_percent = body.discount_percent
    priceChanged = true
    if (body.discount_percent > 0 && body.discount_duration_months) {
      update.discount_ends_at = new Date(
        Date.now() + body.discount_duration_months * 30 * 24 * 60 * 60 * 1000
      ).toISOString()
    } else if (body.discount_percent === 0) {
      update.discount_ends_at = null
    }
  }

  const { data: updated } = await admin
    .from("custom_plans")
    .update(update)
    .eq("id", current.id)
    .select("*")
    .single()

  let mpAction: any = null
  if (priceChanged && updated.billing_method === "MP" && org.mp_preapproval_id) {
    const newEffective = calculateEffectivePrice(
      Number(updated.base_price_ars),
      updated.discount_percent
    )
    const currentEffective = calculateEffectivePrice(
      Number(current.base_price_ars),
      current.discount_percent
    )
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
    mpAction = await applyPriceChange({
      preapprovalId: org.mp_preapproval_id,
      currentAmount: currentEffective,
      newAmount: newEffective,
      recreateParams: {
        orgId,
        plan: "CUSTOM",
        payerEmail: org.billing_email!,
        backUrl: `${appUrl}/settings/subscription?custom=ok`,
        customAmount: newEffective,
        customReason: `Vibook — ${updated.display_name}`,
        includeFreeTrial: false,
      },
    })
    if (mpAction.action === "REAUTH_REQUIRED" && mpAction.newPreapprovalId) {
      await admin
        .from("organizations")
        .update({
          mp_preapproval_id: mpAction.newPreapprovalId,
          subscription_status: "PAST_DUE",
        })
        .eq("id", orgId)
      logSecurityEvent({
        eventType: "CUSTOM_PLAN_MP_REAUTH_REQUIRED",
        severity: "WARN",
        actorUserId: user.id,
        actorAuthId: (user as any).auth_id,
        targetOrgId: orgId,
        targetEntity: "custom_plans",
        targetEntityId: current.id,
        details: { currentEffective, newEffective, checkoutUrl: mpAction.checkoutUrl },
      })
    }
  }

  logSecurityEvent({
    eventType: "CUSTOM_PLAN_UPDATED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "custom_plans",
    targetEntityId: current.id,
    details: { before: current, after: updated, mpAction },
  })

  return NextResponse.json({ ok: true, custom_plan: updated, mp_action: mpAction })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: orgId } = await params
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, mp_preapproval_id, custom_plan_id")
    .eq("id", orgId)
    .maybeSingle()
  if (!org?.custom_plan_id) {
    return NextResponse.json({ error: "Org no tiene custom plan" }, { status: 404 })
  }

  const { data: cp } = await admin
    .from("custom_plans")
    .select("*")
    .eq("id", org.custom_plan_id)
    .single()

  if (org.mp_preapproval_id) {
    try {
      await cancelPreapproval(org.mp_preapproval_id)
    } catch (err) {
      console.warn("cancelPreapproval failed (continuando delete):", err)
    }
  }

  await admin.from("custom_plans").delete().eq("id", cp.id)
  await admin.from("organizations").update({ custom_plan_id: null, mp_preapproval_id: null }).eq("id", orgId)

  logSecurityEvent({
    eventType: "CUSTOM_PLAN_DELETED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "custom_plans",
    targetEntityId: cp.id,
    details: { deleted: cp },
  })

  return NextResponse.json({ ok: true })
}
