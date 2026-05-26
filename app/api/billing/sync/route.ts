import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import {
  fetchPreapproval,
  searchPreapprovalsByPlanId,
} from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPreapproval } from "@/lib/billing/state-machine"
import { PLANS, type PlanId } from "@/lib/billing/plans"

/**
 * POST /api/billing/sync
 * body (opcional): { preapproval_id?: string }
 *
 * Sincroniza activamente una suscripción MP con la org del user autenticado.
 *
 * Motivación: el flow SaaS usa `preapproval_plan` — el preapproval hijo que
 * MP genera al autorizar NO hereda `external_reference`, y MP tampoco pasa
 * `preapproval_id` en el back_url de forma confiable. Este endpoint cierra
 * el loop del lado cliente.
 *
 * Resolución del preapproval_id (en orden):
 *  1. body.preapproval_id si viene (caso ideal — MP lo pasó en el query).
 *  2. organizations.mp_preapproval_id si ya está seteado (re-sync /
 *     idempotencia).
 *  3. Último CHECKOUT_INITIATED pending (<2h) de la org → tomar
 *     mp_preapproval_plan_id del payload → MP search → más reciente
 *     authorized. Cubre el caso donde MP no pasa el id en la URL.
 *
 * Seguridad:
 *  - Si preapproval.external_reference está y no coincide con la org del user,
 *    rechazamos (intento de claim de preapproval ajeno).
 *  - Sin external_reference, exigimos CHECKOUT_INITIATED pending reciente.
 *
 * Idempotencia: mp_last_synced_at vs preapproval.last_modified.
 */

const CHECKOUT_MAX_AGE_MS = 2 * 3600 * 1000 // 2 horas

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const orgId = (user as any)?.org_id as string | null
  if (!orgId) {
    return NextResponse.json({ error: "Usuario sin tenant" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const bodyPreapprovalId = (body?.preapproval_id as string | undefined)?.trim() || null

  // adminDb justificado (caso C billing): organizations + billing_events son
  // escritas por webhook MP. body.preapproval_id se valida contra
  // external_reference de MP para evitar claim de preapproval ajeno.
  const admin = createAdminClient() as any

  // Fetch org actual — sirve para idempotency, preservación y fallback.
  const { data: org } = await admin
    .from("organizations")
    .select("subscription_status, current_period_ends_at, mp_last_synced_at, plan, mp_preapproval_id, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 })
  }

  // Buscar el CHECKOUT_INITIATED pending reciente (lo necesitamos para el
  // fallback #3 Y para el guard de seguridad si external_reference es null).
  const cutoff = new Date(Date.now() - CHECKOUT_MAX_AGE_MS).toISOString()
  const { data: initiated } = await admin
    .from("billing_events")
    .select("id, payload, created_at")
    .eq("org_id", orgId)
    .eq("event_type", "CHECKOUT_INITIATED")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Resolver preapproval_id en cascada
  let preapprovalId: string | null = bodyPreapprovalId
  let resolvedVia: "body" | "org_existing" | "mp_search" | null = bodyPreapprovalId ? "body" : null

  if (!preapprovalId && org.mp_preapproval_id) {
    preapprovalId = org.mp_preapproval_id
    resolvedVia = "org_existing"
  }

  if (!preapprovalId) {
    // Fallback: buscar en MP por preapproval_plan_id del CHECKOUT_INITIATED
    if (!initiated) {
      return NextResponse.json(
        {
          error: "No encontramos un checkout reciente para tu cuenta. Iniciá el flow de nuevo.",
          code: "no_checkout_initiated",
        },
        { status: 404 }
      )
    }
    const planId = (initiated.payload as any)?.mp_preapproval_plan_id as string | undefined
    if (!planId) {
      console.error("billing/sync: CHECKOUT_INITIATED sin mp_preapproval_plan_id en payload", {
        initiatedEventId: initiated.id,
      })
      return NextResponse.json(
        { error: "Checkout mal formado. Contactá a soporte." },
        { status: 500 }
      )
    }
    let found: Awaited<ReturnType<typeof searchPreapprovalsByPlanId>>
    try {
      found = await searchPreapprovalsByPlanId(planId, { status: "authorized", limit: 1 })
    } catch (err: any) {
      console.error("billing/sync: searchPreapprovalsByPlanId failed", err?.message || err)
      return NextResponse.json(
        { error: "No pudimos consultar MercadoPago" },
        { status: 502 }
      )
    }
    if (!found.length) {
      return NextResponse.json(
        {
          error: "Todavía no recibimos la autorización. Esperá unos segundos y volvé a intentar.",
          code: "preapproval_not_authorized_yet",
        },
        { status: 202 }
      )
    }
    preapprovalId = found[0].id
    resolvedVia = "mp_search"
  }

  // 1. Fetch fresh desde MP
  let preapproval: MPPreapproval
  try {
    preapproval = (await fetchPreapproval(preapprovalId!)) as MPPreapproval
  } catch (err: any) {
    console.error("billing/sync: fetchPreapproval failed", err?.message || err)
    return NextResponse.json(
      { error: "No pudimos confirmar con MercadoPago. Reintentá en unos segundos." },
      { status: 502 }
    )
  }

  // 2. Security: si MP tiene external_reference, debe matchear esta org
  if (preapproval.external_reference && preapproval.external_reference !== orgId) {
    console.warn("billing/sync: external_reference mismatch", {
      preapprovalId,
      expected: orgId,
      got: preapproval.external_reference,
    })
    return NextResponse.json({ error: "preapproval no pertenece a esta cuenta" }, { status: 403 })
  }

  // 3. Guard adicional cuando external_reference es null: exigir CHECKOUT_INITIATED pending
  // (también valida el caso donde preapprovalId vino del body sin verificación previa).
  if (!preapproval.external_reference && resolvedVia !== "mp_search" && resolvedVia !== "org_existing") {
    if (!initiated) {
      return NextResponse.json(
        { error: "No encontramos un checkout reciente para tu cuenta" },
        { status: 403 }
      )
    }
  }

  // 4. Idempotency
  if (
    org.mp_last_synced_at &&
    preapproval.last_modified &&
    new Date(org.mp_last_synced_at).getTime() >= new Date(preapproval.last_modified).getTime() &&
    org.mp_preapproval_id === preapproval.id
  ) {
    return NextResponse.json({
      ok: true,
      already_synced: true,
      subscription_status: org.subscription_status,
      plan: org.plan,
      preapproval_id: preapproval.id,
      resolved_via: resolvedVia,
    })
  }

  // 5. Derivar plan: payload del CHECKOUT_INITIATED > match por monto
  const payloadPlan = (initiated?.payload as any)?.plan as PlanId | "CUSTOM" | undefined
  const chosenPlan =
    payloadPlan && (PLANS[payloadPlan as PlanId] || payloadPlan === "CUSTOM")
      ? payloadPlan
      : derivePlanFromAmount(preapproval.auto_recurring?.transaction_amount)

  // 6. State machine
  const transition = transitionFromMP(preapproval, undefined, {
    preserved_current_period_ends_at: org.current_period_ends_at,
    trial_ends_at: org.trial_ends_at,
  })

  const updates: Record<string, any> = {
    subscription_status: transition.subscription_status,
    mp_preapproval_id: preapproval.id,
    mp_last_synced_at: preapproval.last_modified ?? new Date().toISOString(),
  }
  if (transition.current_period_ends_at !== undefined) {
    updates.current_period_ends_at = transition.current_period_ends_at
  }
  if (transition.subscription_status === "TRIALING" && preapproval.next_payment_date) {
    updates.trial_ends_at = preapproval.next_payment_date
  }
  if (chosenPlan && chosenPlan !== "CUSTOM" && chosenPlan !== org.plan) {
    updates.plan = chosenPlan
  }

  await admin.from("organizations").update(updates).eq("id", orgId)

  // 7. Log evento procesado + marcar CHECKOUT_INITIATED como consumido
  if (transition.event_type) {
    await admin.from("billing_events").insert({
      org_id: orgId,
      event_type: transition.event_type,
      external_id: preapproval.id,
      amount_cents: preapproval.auto_recurring?.transaction_amount
        ? Math.round(preapproval.auto_recurring.transaction_amount * 100)
        : null,
      currency: preapproval.auto_recurring?.currency_id ?? null,
      status: preapproval.status,
      payload: {
        source: "billing_sync_endpoint",
        resolved_via: resolvedVia,
        preapproval,
      },
    })
  }
  if (initiated?.id) {
    await admin
      .from("billing_events")
      .update({ status: "consumed" })
      .eq("id", initiated.id)
  }

  return NextResponse.json({
    ok: true,
    subscription_status: transition.subscription_status,
    plan: updates.plan ?? org.plan,
    preapproval_id: preapproval.id,
    resolved_via: resolvedVia,
  })
}

function derivePlanFromAmount(amount: number | undefined): PlanId | null {
  if (!amount) return null
  for (const planId of Object.keys(PLANS) as PlanId[]) {
    if (PLANS[planId].priceArsMonthly === amount) return planId
  }
  return null
}
