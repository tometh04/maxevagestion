import { NextResponse } from "next/server"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { PLANS } from "@/lib/billing/plans"
import { resolvePlanPrice } from "@/lib/billing/plan-pricing"
import { clearAgreedPriceUpdate } from "@/lib/billing/agreed-price"
import { applyPriceChange } from "@/lib/billing/mp-update"
import { calculateEffectivePrice } from "@/lib/billing/custom-plans"

/**
 * POST /api/admin/orgs/[id]/change-plan  — cambio de plan Enterprise ↔ PRO desde
 * platform-admin. Body: { plan: "PRO" | "ENTERPRISE" }.
 *
 * Qué hace (prolijo, sin romper lo existente):
 *  - Setea organizations.plan y SINCRONIZA los límites max_* (hoy están
 *    desacoplados: el plan no gatea límites, los gatea max_*; cambiar solo el
 *    plan dejaría límites viejos).
 *  - Limpia scheduled_plan / scheduled_plan_effective_at (evita que el cron de
 *    downgrade pise el cambio después).
 *  - → PRO: reprograma el cobro de MP al precio PRO vigente (tabla plan_prices)
 *    vía applyPriceChange si hay suscripción MP. Un aumento > 20% exige
 *    re-autorización del cliente (REAUTH_REQUIRED → devuelve checkout_url).
 *    Desasocia y borra el custom_plan (el precio custom Enterprise deja de aplicar).
 *  - → ENTERPRISE: NO reprograma MP (Enterprise no tiene precio estándar). El
 *    precio se fija per-cuenta con el precio custom (flujo custom-plan).
 *
 * MP se llama ANTES de tocar la DB: si MP falla, no se persiste nada.
 */

const BODY = z.object({ plan: z.enum(["PRO", "ENTERPRISE"]) })

async function requireAdmin() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const ok = await isPlatformAdmin(supabase, user.id)
  return { user, ok }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: orgId } = await params
  const parsed = BODY.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido. plan debe ser PRO o ENTERPRISE" }, { status: 400 })
  }
  const targetPlan = parsed.data.plan

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select(
      "id, slug, plan, subscription_status, mp_preapproval_id, custom_plan_id, current_period_ends_at, billing_email"
    )
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  // Límites según el plan destino (sincronizados con el plan, siempre).
  const orgUpdates: Record<string, any> = {
    plan: targetPlan,
    scheduled_plan: null,
    scheduled_plan_effective_at: null,
    // Cambiar de plan es una relación de precio nueva: el precio congelado del
    // plan anterior no aplica. El webhook lo re-escribe con el monto que MP
    // autorice para el plan destino.
    ...clearAgreedPriceUpdate(),
  }
  if (targetPlan === "PRO") {
    orgUpdates.max_users = PLANS.PRO.limits.maxUsers
    orgUpdates.max_agencies = PLANS.PRO.limits.maxAgencies
    orgUpdates.max_operations_per_month = PLANS.PRO.limits.maxOperationsPerMonth
  } else {
    // Enterprise ≈ ilimitado (columnas max_* son NOT NULL; usamos valores altos).
    orgUpdates.max_users = 999
    orgUpdates.max_agencies = 99
    orgUpdates.max_operations_per_month = 99999
  }

  let mpAction: any = null
  let reauthCheckoutUrl: string | null = null
  let note: string | null = null

  if (targetPlan === "PRO") {
    const newAmount = await resolvePlanPrice(admin, "PRO")
    if (newAmount === null || newAmount <= 0) {
      return NextResponse.json(
        { error: "PRO no tiene precio configurado (revisá Precios de planes)." },
        { status: 400 }
      )
    }

    // Precio actual conocido (para el umbral de re-auth): el del custom plan si
    // existía, sino el mismo PRO. applyPriceChange igual re-consulta MP como
    // fuente de verdad del monto vigente.
    let currentCustom: any = null
    if (org.custom_plan_id) {
      const { data } = await admin
        .from("custom_plans")
        .select("*")
        .eq("id", org.custom_plan_id)
        .maybeSingle()
      currentCustom = data
    }
    const currentAmount = currentCustom
      ? calculateEffectivePrice(Number(currentCustom.base_price_ars), currentCustom.discount_percent)
      : newAmount

    if (org.mp_preapproval_id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibook.ai"
      try {
        mpAction = await applyPriceChange({
          preapprovalId: org.mp_preapproval_id,
          currentAmount,
          newAmount,
          recreateParams: {
            orgId,
            plan: "CUSTOM", // preapproval individual al monto PRO vigente
            payerEmail: org.billing_email ?? "",
            backUrl: `${appUrl}/settings/subscription?plan=pro`,
            customAmount: newAmount,
            customReason: "Vibook - plan PRO",
            includeFreeTrial: false,
          },
        })
      } catch (err: any) {
        // MP falló → no tocamos DB. Estado DB/MP queda consistente.
        return NextResponse.json({ error: `MP error: ${err.message}` }, { status: 502 })
      }
      if (mpAction?.action === "REAUTH_REQUIRED" && mpAction.newPreapprovalId) {
        reauthCheckoutUrl = mpAction.checkoutUrl ?? ""
        orgUpdates.mp_preapproval_id = mpAction.newPreapprovalId
        orgUpdates.subscription_status = "PAST_DUE"
        note =
          "El aumento supera el 20%: MP requiere que el cliente re-autorice el nuevo monto. La cuenta quedó en PAST_DUE hasta que confirme."
      }
    } else {
      note = "La cuenta no tiene suscripción MP activa; el precio PRO se aplicará en el próximo checkout."
    }

    // Desasociar y borrar el custom plan: el precio custom Enterprise ya no aplica.
    // Borrarlo evita el choque con UNIQUE(org_id) si más adelante se crea otro.
    orgUpdates.custom_plan_id = null
    if (org.custom_plan_id) {
      const { error: delErr } = await admin.from("custom_plans").delete().eq("id", org.custom_plan_id)
      if (delErr) console.error("change-plan: no se pudo borrar custom_plan huérfano", delErr)
    }
  } else {
    // → ENTERPRISE. No reprograma MP (precio per-cuenta vía custom plan).
    note = org.mp_preapproval_id
      ? "Enterprise se cobra per-cuenta: fijá el precio custom para que MP cobre el monto acordado en el próximo vencimiento."
      : "Enterprise se cobra per-cuenta: creá el precio custom cuando definas el monto acordado."
  }

  const { error: updErr } = await admin.from("organizations").update(orgUpdates).eq("id", orgId)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: "PLAN_CHANGED",
    status: orgUpdates.subscription_status ?? org.subscription_status,
    payload: {
      source: "admin_change_plan",
      plan_before: org.plan,
      plan_after: targetPlan,
      mp_action: mpAction?.action ?? "NONE",
      reauth_required: mpAction?.action === "REAUTH_REQUIRED",
      had_custom_plan: !!org.custom_plan_id,
    },
  })

  logSecurityEvent({
    eventType: "PLAN_CHANGED_BY_ADMIN",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organizations",
    targetEntityId: orgId,
    details: {
      plan_before: org.plan,
      plan_after: targetPlan,
      mp_action: mpAction,
      had_custom_plan: !!org.custom_plan_id,
    },
  })

  revalidatePath(`/admin/orgs/${orgId}`)

  return NextResponse.json({
    ok: true,
    plan: targetPlan,
    mp_action: mpAction?.action ?? "NONE",
    reauth_checkout_url: reauthCheckoutUrl,
    note,
  })
}
