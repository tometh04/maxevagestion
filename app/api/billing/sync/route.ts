import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { fetchPreapproval } from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPreapproval } from "@/lib/billing/state-machine"
import { PLANS, type PlanId } from "@/lib/billing/plans"

/**
 * POST /api/billing/sync
 * body: { preapproval_id: string }
 *
 * Sincroniza activamente una suscripción MP con la org del user autenticado.
 *
 * Motivación: cuando el user se suscribe vía un `preapproval_plan` (el flow
 * SaaS), el preapproval hijo que MP genera NO hereda `external_reference`, por
 * lo que el webhook no puede mapear el preapproval a una org. Este endpoint lo
 * hace desde el lado cliente: MP redirige al user al back_url con
 * ?preapproval_id=<id>, la return page lee el query, y llama acá para cerrar
 * el loop.
 *
 * Seguridad:
 *  - Si preapproval.external_reference está y no coincide con la org del user,
 *    rechazamos (intento de claim de preapproval ajeno).
 *  - Si external_reference está vacío, validamos que la org tiene un
 *    CHECKOUT_INITIATED pending reciente (<2h) para asegurar que el user
 *    efectivamente inició este checkout.
 *
 * Idempotencia: mp_last_synced_at vs preapproval.last_modified — si ya
 * sincronizamos, devolvemos el estado actual sin re-aplicar.
 */

const CHECKOUT_MAX_AGE_MS = 2 * 3600 * 1000 // 2 horas

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const orgId = (user as any)?.org_id as string | null
  if (!orgId) {
    return NextResponse.json({ error: "Usuario sin tenant" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const preapprovalId = (body?.preapproval_id as string | undefined)?.trim()
  if (!preapprovalId) {
    return NextResponse.json({ error: "preapproval_id requerido" }, { status: 400 })
  }

  const admin = createAdminClient() as any

  // 1. Fetch fresh desde MP
  let preapproval: MPPreapproval
  try {
    preapproval = (await fetchPreapproval(preapprovalId)) as MPPreapproval
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

  // 3. Fallback guard: si external_reference está vacío (caso preapproval_plan),
  // validamos que esta org inició un checkout reciente.
  let initiatedEventId: string | null = null
  let chosenPlan: PlanId | "CUSTOM" | null = null
  if (!preapproval.external_reference) {
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

    if (!initiated) {
      return NextResponse.json(
        { error: "No encontramos un checkout reciente para tu cuenta" },
        { status: 403 }
      )
    }
    initiatedEventId = initiated.id
    const payloadPlan = (initiated.payload as any)?.plan
    if (payloadPlan && (PLANS[payloadPlan as PlanId] || payloadPlan === "CUSTOM")) {
      chosenPlan = payloadPlan as PlanId | "CUSTOM"
    }
  }

  // 4. Fetch org actual para idempotency + preservación
  const { data: org } = await admin
    .from("organizations")
    .select("subscription_status, current_period_ends_at, mp_last_synced_at, plan, mp_preapproval_id")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 })
  }

  // 5. Idempotency: ya sincronizado
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
    })
  }

  // 6. Derivar plan: preferimos el CHECKOUT_INITIATED (el user lo eligió explícito);
  // caemos al match por monto si no tenemos payload (fallback extremo).
  const plan = chosenPlan ?? derivePlanFromAmount(preapproval.auto_recurring?.transaction_amount)

  // 7. State machine
  const transition = transitionFromMP(preapproval, undefined, {
    preserved_current_period_ends_at: org.current_period_ends_at,
  })

  const updates: Record<string, any> = {
    subscription_status: transition.subscription_status,
    mp_preapproval_id: preapproval.id,
    mp_last_synced_at: preapproval.last_modified ?? new Date().toISOString(),
  }
  if (transition.current_period_ends_at !== undefined) {
    updates.current_period_ends_at = transition.current_period_ends_at
  }
  // trial_ends_at: si está transicionando a TRIALING y tenemos next_payment_date, usarlo.
  if (transition.subscription_status === "TRIALING" && preapproval.next_payment_date) {
    updates.trial_ends_at = preapproval.next_payment_date
  }
  // plan: solo pisar si tenemos valor confiable y no está ya seteado al correcto.
  if (plan && plan !== "CUSTOM" && plan !== org.plan) {
    updates.plan = plan
  }

  await admin.from("organizations").update(updates).eq("id", orgId)

  // 8. Log billing_event + marcar CHECKOUT_INITIATED como consumido (si aplica)
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
        preapproval,
        resolved_via: preapproval.external_reference
          ? "external_reference"
          : "authenticated_user_fallback",
      },
    })
  }
  if (initiatedEventId) {
    await admin
      .from("billing_events")
      .update({ status: "consumed" })
      .eq("id", initiatedEventId)
  }

  return NextResponse.json({
    ok: true,
    subscription_status: transition.subscription_status,
    plan: updates.plan ?? org.plan,
    preapproval_id: preapproval.id,
  })
}

/**
 * Fallback: si el CHECKOUT_INITIATED no tiene plan en el payload, derivar del
 * transaction_amount. Solo matchea planes estándar.
 */
function derivePlanFromAmount(amount: number | undefined): PlanId | null {
  if (!amount) return null
  for (const planId of Object.keys(PLANS) as PlanId[]) {
    if (PLANS[planId].priceArsMonthly === amount) return planId
  }
  return null
}
