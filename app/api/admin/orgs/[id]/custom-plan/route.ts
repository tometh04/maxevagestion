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
  /** 2026-05-18 (Tomi): fecha exacta de fin del descuento. Si seteada,
   *  sobreescribe el cálculo "now() + discount_duration_months × 30d".
   *  Útil para clientes que ya pagaron offline el primer mes. ISO date. */
  discount_ends_at?: string | null
  /** 2026-05-18 (Tomi, caso VICO): días que MP debe esperar antes de cobrar
   *  el primer mes automático. Para clientes que pagaron offline el primer
   *  mes y queremos que MP empiece a cobrar a partir de la fecha de
   *  vencimiento del periodo ya pagado. Aplica solo si billing_method=MP. */
  free_trial_days?: number
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

  // 2026-05-18 (Tomi): si el admin manda `discount_ends_at` explícito, lo usamos.
  // Sino, calculamos desde hoy + duration meses (comportamiento legacy).
  // El override es útil para clientes que ya pagaron offline el primer mes
  // y la fecha de fin del descuento debe calcularse desde el vencimiento real,
  // no desde el día que el admin crea el custom_plan.
  let discountEndsAt: string | null = null
  if (discount > 0) {
    if (body.discount_ends_at) {
      // Validar formato ISO
      const parsed = new Date(body.discount_ends_at)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "discount_ends_at debe ser fecha ISO válida" }, { status: 400 })
      }
      discountEndsAt = parsed.toISOString()
    } else {
      discountEndsAt = new Date(Date.now() + duration * 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  }
  // freeTrialDays: si > 0, MP no cobra hasta que pasen esos días (caso VICO).
  const freeTrialDays =
    typeof body.free_trial_days === "number" && body.free_trial_days > 0
      ? Math.floor(body.free_trial_days)
      : undefined

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

  // 2026-05-19 (caso VICO): subir plan a ENTERPRISE + max_* a valores de
  // Enterprise (ver app/api/onboarding/route.ts:10). Custom plan implica
  // trato negociado tipo Enterprise por definición — si seguía con los
  // límites de STARTER (50 ops/mes) se rompía la creación de operaciones
  // al hit limit.
  //
  // Las columnas max_* son NOT NULL en la DB, por eso usamos 999/99/99999
  // (≈ ilimitado en la práctica) en lugar de NULL.
  updateOrgData.plan = "ENTERPRISE"
  updateOrgData.max_users = 999
  updateOrgData.max_agencies = 99
  updateOrgData.max_operations_per_month = 99999

  // 2026-05-18 (caso VICO): si hay free_trial_days, seteamos
  // current_period_ends_at para que la UI del cliente sepa "hasta cuándo está
  // cubierto el primer mes pagado offline" + cuándo es el primer cobro MP.
  if (freeTrialDays && freeTrialDays > 0) {
    const firstChargeDate = new Date(Date.now() + freeTrialDays * 24 * 60 * 60 * 1000)
    updateOrgData.current_period_ends_at = firstChargeDate.toISOString()
  }

  let checkoutUrl: string | null = null
  if (billingMethod === "MP") {
    const effective = calculateEffectivePrice(body.base_price_ars, discount)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
    const backUrl = `${appUrl}/onboarding/billing/return`
    try {
      // Custom plan template — reusable si el admin crea otro custom con
      // mismo slug+amount (ej re-trials). ensureMpPlan cachea en mp_plans.
      const mp = await ensureMpPlan(admin, {
        plan: "CUSTOM",
        reason: `Vibook ${body.display_name}`, // ASCII only
        amount: effective,
        backUrl,
        includeFreeTrial: false,
        freeTrialDays, // 2026-05-18: diferir primer cobro N días (caso VICO)
        orgSlug: org.slug,
      })
      // mp_preapproval_id se setea en el webhook cuando el user acepta.
      // Agregamos external_reference al init_point para tracking.
      const initPoint = new URL(mp.init_point)
      initPoint.searchParams.set("external_reference", orgId)
      checkoutUrl = initPoint.toString()

      // Persistimos CHECKOUT_INITIATED para que /api/billing/sync pueda
      // resolver preapproval_id cuando MP no devuelve referencias en el back_url.
      const { error: checkoutLogErr } = await admin.from("billing_events").insert({
        org_id: orgId,
        event_type: "CHECKOUT_INITIATED",
        external_id: null,
        amount_cents: Math.round(effective * 100),
        currency: "ARS",
        status: "pending",
        payload: {
          plan: "CUSTOM",
          plan_key: mp.plan_key,
          mp_preapproval_plan_id: mp.mp_preapproval_plan_id,
          init_point: mp.init_point,
          checkout_url: checkoutUrl,
          initiated_by_user_id: user.id,
          included_free_trial: false,
          is_custom_plan: true,
          custom_plan_id: created.id,
        },
      })
      if (checkoutLogErr) {
        console.error("custom-plan POST: billing_events CHECKOUT_INITIATED insert failed", checkoutLogErr)
      }
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

  // 2026-05-18 (Tomi): aceptar `discount_ends_at` directo en el body
  // (sobreescribe cualquier cálculo de duration). Útil para corregir fechas
  // sin pasar por re-cálculo automático que asume start = now().
  if (body.discount_ends_at !== undefined) {
    if (body.discount_ends_at === null) {
      candidate.discount_ends_at = null
    } else {
      const parsed = new Date(body.discount_ends_at)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "discount_ends_at debe ser fecha ISO válida o null" },
          { status: 400 }
        )
      }
      candidate.discount_ends_at = parsed.toISOString()
    }
  } else if (body.discount_percent !== undefined && body.discount_percent !== current.discount_percent) {
    // Recalcular discount_ends_at automáticamente si cambió el % y no se pasó fecha explícita
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
