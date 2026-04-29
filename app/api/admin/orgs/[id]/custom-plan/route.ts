import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { calculateEffectivePrice, type CustomPlanFeatures } from "@/lib/billing/custom-plans"
import { cancelPreapproval } from "@/lib/billing/mercadopago"
import { applyPriceChange } from "@/lib/billing/mp-update"
import { ensureMpPlan } from "@/lib/billing/mp-plans"

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
    const effective = calculateEffectivePrice(body.base_price_ars, discount)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
    try {
      // Custom plan template — reusable si el admin crea otro custom con
      // mismo slug+amount (ej re-trials). ensureMpPlan cachea en mp_plans.
      const mp = await ensureMpPlan(admin, {
        plan: "CUSTOM",
        reason: `Vibook ${body.display_name}`, // ASCII only
        amount: effective,
        backUrl: `${appUrl}/settings/subscription?custom=ok`,
        includeFreeTrial: false,
        orgSlug: org.slug,
      })
      // mp_preapproval_id se setea en el webhook cuando el user acepta.
      // Agregamos external_reference al init_point para tracking.
      const initPoint = new URL(mp.init_point)
      initPoint.searchParams.set("external_reference", orgId)
      checkoutUrl = initPoint.toString()
    } catch (err: any) {
      const { error: rbErr } = await admin.from("custom_plans").delete().eq("id", created.id)
      if (rbErr) console.error("POST rollback delete failed:", rbErr)
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

  // Calcular valores candidatos ANTES de tocar DB
  const candidate = {
    display_name: body.display_name ?? current.display_name,
    base_price_ars:
      body.base_price_ars !== undefined ? body.base_price_ars : Number(current.base_price_ars),
    discount_percent:
      body.discount_percent !== undefined ? body.discount_percent : current.discount_percent,
    discount_ends_at: current.discount_ends_at,
    features: body.features ?? current.features,
    limits: body.limits ?? current.limits,
    billing_method: body.billing_method ?? current.billing_method,
    notes: body.notes ?? current.notes,
  }

  // Validar PATCH body
  if (body.base_price_ars !== undefined && body.base_price_ars <= 0) {
    return NextResponse.json({ error: "base_price_ars debe ser > 0" }, { status: 400 })
  }
  if (body.discount_percent !== undefined && (body.discount_percent < 0 || body.discount_percent > 100)) {
    return NextResponse.json({ error: "discount_percent debe estar entre 0 y 100" }, { status: 400 })
  }

  // Recalcular discount_ends_at si cambió el descuento
  if (body.discount_percent !== undefined && body.discount_percent !== current.discount_percent) {
    if (body.discount_percent > 0 && body.discount_duration_months) {
      candidate.discount_ends_at = new Date(
        Date.now() + body.discount_duration_months * 30 * 24 * 60 * 60 * 1000
      ).toISOString()
    } else if (body.discount_percent === 0) {
      candidate.discount_ends_at = null
    }
  }

  const priceChanged =
    candidate.base_price_ars !== Number(current.base_price_ars) ||
    candidate.discount_percent !== current.discount_percent

  // Si cambió el precio Y método=MP Y hay preapproval → llamar MP PRIMERO
  //
  // TODO(launch-blockers P0-1): applyPriceChange opera sobre preapprovals
  // individuales. Con el nuevo flujo preapproval_plan (Task 4), el POST ya
  // no crea preapprovals individuales — los crea MP cuando el user acepta.
  // Este PATCH queda compatible hacia atrás con custom plans viejos que
  // SÍ tienen mp_preapproval_id seteado (creados antes de la migración).
  // Para custom plans nuevos (creados por el POST refactoreado), el
  // workflow será: cancelar suscripción del user + crear plan nuevo + el
  // user se re-suscribe. Refactor pendiente en sub-task futura.
  let mpAction: any = null
  let mpReauth: { preapprovalId: string; checkoutUrl: string } | null = null
  if (priceChanged && candidate.billing_method === "MP" && org.mp_preapproval_id) {
    const currentEffective = calculateEffectivePrice(
      Number(current.base_price_ars),
      current.discount_percent
    )
    const newEffective = calculateEffectivePrice(
      candidate.base_price_ars,
      candidate.discount_percent
    )
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"

    try {
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
          customReason: `Vibook — ${candidate.display_name}`,
          includeFreeTrial: false,
        },
      })
    } catch (err: any) {
      // MP falló — NO tocamos DB, devolvemos error. Estado DB/MP queda consistente.
      return NextResponse.json({ error: `MP error: ${err.message}` }, { status: 502 })
    }

    if (mpAction.action === "REAUTH_REQUIRED" && mpAction.newPreapprovalId) {
      mpReauth = {
        preapprovalId: mpAction.newPreapprovalId,
        checkoutUrl: mpAction.checkoutUrl ?? "",
      }
    }
  }

  // Ahora sí, persistir en DB
  const { data: updated, error: updateErr } = await admin
    .from("custom_plans")
    .update({
      display_name: candidate.display_name,
      base_price_ars: candidate.base_price_ars,
      discount_percent: candidate.discount_percent,
      discount_ends_at: candidate.discount_ends_at,
      features: candidate.features,
      limits: candidate.limits,
      billing_method: candidate.billing_method,
      notes: candidate.notes,
    })
    .eq("id", current.id)
    .select("*")
    .single()
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  if (mpReauth) {
    await admin
      .from("organizations")
      .update({
        mp_preapproval_id: mpReauth.preapprovalId,
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
      details: { checkoutUrl: mpReauth.checkoutUrl },
    })
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

  const { error: deleteErr } = await admin.from("custom_plans").delete().eq("id", cp.id)
  if (deleteErr) {
    return NextResponse.json({ error: `Delete custom_plan failed: ${deleteErr.message}` }, { status: 500 })
  }

  const { error: orgUpdateErr } = await admin
    .from("organizations")
    .update({ custom_plan_id: null, mp_preapproval_id: null })
    .eq("id", orgId)
  if (orgUpdateErr) {
    console.error("DELETE: org update failed after plan deletion", orgUpdateErr)
    logSecurityEvent({
      eventType: "CUSTOM_PLAN_DELETE_ORG_UPDATE_FAILED",
      severity: "WARN",
      actorUserId: user.id,
      actorAuthId: (user as any).auth_id,
      targetOrgId: orgId,
      targetEntity: "organizations",
      targetEntityId: orgId,
      details: { error: orgUpdateErr.message, stale_mp_preapproval_id: org.mp_preapproval_id },
    })
    // Seguimos — el custom_plans row ya se borró. Admin puede limpiar mp_preapproval_id manualmente.
  }

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
