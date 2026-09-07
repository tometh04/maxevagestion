import { NextResponse } from "next/server"
import { z } from "zod"

import { ADDONS, ADDON_KEYS, type AddonKey } from "@/lib/addons/catalog"
import { syncAddonsToMp } from "@/lib/addons/mp-sync"
import { computeSubscriptionTotalArs } from "@/lib/addons/pricing"
import { resolveOrgAddons } from "@/lib/addons/server"
import { isAddonsSoftLaunchUser } from "@/lib/addons/soft-launch"
import { getCurrentUser } from "@/lib/auth"
import { getPlanPricing } from "@/lib/billing/plan-pricing"
import { logSecurityEvent } from "@/lib/security/audit"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

/**
 * Complementos del propio tenant.
 *
 * - GET  → catálogo disponible + estado + los dos totales (hoy / próximo ciclo).
 * - POST → alta, solicitud, baja programada o deshacer la baja.
 *
 * El write usa service role porque `organization_addons` NO tiene policy de
 * INSERT/UPDATE a propósito: un complemento es plata, así que el tenant no
 * escribe la fila, le pide a este endpoint que la escriba. Todo write lleva
 * `.eq("org_id", user.org_id)` y el `org_id` sale de la sesión, nunca del body.
 *
 * Regla que no se negocia: un alta self-serve NUNCA dispara cancel+recreate en
 * Mercado Pago. Ver lib/addons/mp-sync.ts.
 */

const BODY = z.object({
  addon_key: z.enum(ADDON_KEYS as [AddonKey, ...AddonKey[]]),
  action: z.enum(["enable", "request", "schedule_cancel", "undo_cancel", "cancel_request"]),
})

/**
 * Estados que hacen visible un complemento aunque ya no esté publicado en el
 * catálogo: si la org lo tiene, lo está pagando o lo pidió, tiene que poder
 * verlo y administrarlo.
 */
const VISIBLE_STATES = new Set([
  "ACTIVE",
  "SCHEDULED_CANCEL",
  "INCLUDED",
  "REQUESTED",
  "PENDING_SETUP",
])

/** Quién puede tocar la facturación. Igual que /settings/subscription. */
function canManageBilling(user: any): boolean {
  const roles: string[] = user?.roles ?? [user?.role]
  return roles.some((r) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "ORG_OWNER")
}

export async function GET() {
  const { user } = await getCurrentUser()
  if (!user?.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }
  // Soft-launch: para el resto de las cuentas el endpoint no existe. Este es el
  // gate de verdad. El del sidebar y el de la página son UI, y acá se contrata.
  if (!isAddonsSoftLaunchUser((user as any).email)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  }
  if (!canManageBilling(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = await createServerClient()
  const [{ data: org }, entitlements] = await Promise.all([
    (supabase.from("organizations") as any)
      .select(
        "plan, subscription_status, custom_plan_id, manual_mrr_override_ars, " +
          "agreed_plan_price_ars, agreed_plan_id, current_period_ends_at, addons_mp_sync_state"
      )
      .eq("id", user.org_id)
      .maybeSingle(),
    resolveOrgAddons(supabase, user.org_id),
  ])
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 })

  // El precio y el catálogo se leen con el client del usuario: la policy de
  // SELECT de subscription_addons ya filtra por `active`.
  const admin = createAdminClient() as any
  const [planPrices, { data: customPlan }] = await Promise.all([
    getPlanPricing(admin),
    org.custom_plan_id
      ? (supabase.from("custom_plans") as any)
          .select("base_price_ars, discount_percent, discount_ends_at")
          .eq("id", org.custom_plan_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const shared = { org, customPlan, planPrices, entitlements }
  const now = computeSubscriptionTotalArs({ ...shared, horizon: "now" } as any)
  const next = computeSubscriptionTotalArs({ ...shared, horizon: "next_cycle" } as any)

  return NextResponse.json({
    // Se listan los del catálogo publicado MÁS los que esta org ya tiene o
    // pidió. Filtrar solo por `availableInCatalog` dejaba invisible (y por lo
    // tanto imposible de dar de baja) un complemento que la org tiene contratado
    // y que después se despublicó del catálogo.
    addons: ADDON_KEYS.filter(
      (k) => entitlements[k].availableInCatalog || VISIBLE_STATES.has(entitlements[k].state)
    ).map((key) => {
      const e = entitlements[key]
      return {
        key,
        name: ADDONS[key].name,
        description: ADDONS[key].description,
        highlights: ADDONS[key].highlights,
        category: ADDONS[key].category,
        selfServe: e.selfServe,
        setupNote: ADDONS[key].setupNote ?? null,
        state: e.state,
        includedInPlan: e.includedInPlan,
        includedUntil: e.includedUntil,
        priceArsMonthly: e.priceArsMonthly,
        listPriceArsMonthly: e.listPriceArsMonthly,
        cancelEffectiveAt: e.cancelEffectiveAt,
        // Ya no se ofrece: se muestra para poder administrarlo, no para vender.
        availableInCatalog: e.availableInCatalog,
      }
    }),
    totals: { nowArs: now.totalArs, nextCycleArs: next.totalArs },
    nextChargeAt: org.current_period_ends_at,
    mpSyncState: org.addons_mp_sync_state,
  })
}

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!user?.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }
  // Soft-launch: para el resto de las cuentas el endpoint no existe. Este es el
  // gate de verdad. El del sidebar y el de la página son UI, y acá se contrata.
  if (!isAddonsSoftLaunchUser((user as any).email)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  }
  if (!canManageBilling(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = BODY.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }
  const { addon_key: addonKey, action } = parsed.data
  const def = ADDONS[addonKey]
  const orgId = user.org_id as string

  const admin = createAdminClient() as any
  const { data: catalogRow } = await admin
    .from("subscription_addons")
    .select("price_ars_monthly, active")
    .eq("addon_key", addonKey)
    .maybeSingle()

  // No ofrecido = no se puede contratar. Las bajas y el retiro de una solicitud
  // siguen habilitados aunque el complemento se haya despublicado: si la org ya
  // lo tiene, sacarlo del catálogo no puede dejarla sin forma de darlo de baja.
  const esAlta = action === "enable" || action === "request"
  if (esAlta && !catalogRow?.active) {
    return NextResponse.json({ error: "Complemento no disponible" }, { status: 404 })
  }

  const { data: org } = await admin
    .from("organizations")
    .select("current_period_ends_at")
    .eq("id", orgId)
    .maybeSingle()

  const nowIso = new Date().toISOString()
  const effectiveAt = org?.current_period_ends_at ?? nowIso

  if (action === "enable" && !def.selfServe) {
    return NextResponse.json(
      {
        error: `${def.name} necesita que lo configuremos de nuestro lado.`,
        code: "ADDON_REQUIRES_SETUP",
      },
      { status: 400 }
    )
  }

  if (action === "enable" || action === "request") {
    // Los que requieren trabajo nuestro entran como REQUESTED: NO habilitan ni
    // cobran hasta que un platform admin los active.
    const status = def.selfServe && action === "enable" ? "ACTIVE" : "REQUESTED"
    const { error } = await admin.from("organization_addons").upsert(
      {
        org_id: orgId,
        addon_key: addonKey,
        status,
        price_ars_monthly_snapshot:
          catalogRow?.price_ars_monthly != null ? Number(catalogRow.price_ars_monthly) : null,
        price_source: "CATALOG",
        requested_at: nowIso,
        requested_by: user.id,
        activated_at: status === "ACTIVE" ? nowIso : null,
        // Sin prorrateo: entra en la factura del próximo ciclo.
        billable_from: status === "ACTIVE" ? effectiveAt : null,
        cancel_requested_at: null,
        cancel_effective_at: null,
        cancelled_at: null,
      },
      { onConflict: "org_id,addon_key" }
    )
    if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 })

    await insertEvent(admin, orgId, addonKey, status === "ACTIVE" ? "ADDON_ACTIVATED" : "ADDON_REQUESTED", nowIso, {
      source: "self_serve",
    })

    let syncOutcome: any = null
    if (status === "ACTIVE") {
      // allowReauth FALSE: si el aumento cruza el 20%, no se toca MP. Cortarle
      // el acceso a alguien por prender un complemento sería inaceptable.
      syncOutcome = await syncAddonsToMp(admin, orgId, {
        allowReauth: false,
        source: "self_serve",
        actorUserId: user.id,
      })
    }

    logSecurityEvent({
      eventType: "ORG_ADDON_SELF_SERVE",
      severity: "INFO",
      actorUserId: user.id,
      actorAuthId: (user as any).auth_id,
      targetOrgId: orgId,
      targetEntity: "organization_addons",
      targetEntityId: `${orgId}:${addonKey}`,
      requestPath: request.url,
      details: { action, status, syncOutcome },
    })

    return NextResponse.json({ ok: true, status, syncOutcome })
  }

  if (action === "schedule_cancel") {
    // No se apaga ahora: lo sigue usando hasta el fin del ciclo que ya pagó.
    const { error } = await admin
      .from("organization_addons")
      .update({
        status: "SCHEDULED_CANCEL",
        cancel_requested_at: nowIso,
        cancel_effective_at: effectiveAt,
      })
      .eq("org_id", orgId)
      .eq("addon_key", addonKey)
      .eq("status", "ACTIVE")
    if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 })
    await insertEvent(admin, orgId, addonKey, "ADDON_CANCEL_SCHEDULED", nowIso, {
      source: "self_serve",
      effective_at: effectiveAt,
    })
    return NextResponse.json({ ok: true, cancelEffectiveAt: effectiveAt })
  }

  if (action === "undo_cancel") {
    // El importe no cambió (seguía facturándose), así que no hay que tocar MP.
    const { error } = await admin
      .from("organization_addons")
      .update({ status: "ACTIVE", cancel_requested_at: null, cancel_effective_at: null })
      .eq("org_id", orgId)
      .eq("addon_key", addonKey)
      .eq("status", "SCHEDULED_CANCEL")
    if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // cancel_request: retirar una solicitud que todavía no se atendió.
  const { error } = await admin
    .from("organization_addons")
    .delete()
    .eq("org_id", orgId)
    .eq("addon_key", addonKey)
    .in("status", ["REQUESTED", "PENDING_SETUP"])
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function insertEvent(
  admin: any,
  orgId: string,
  addonKey: string,
  eventType: string,
  nowIso: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: eventType,
    external_id: `${orgId}:addon:${addonKey}:${eventType}:${nowIso}`,
    status: "processed",
    payload: { addon_key: addonKey, ...payload },
  })
  if (error) {
    console.error("[addons] no se pudo registrar el billing_event:", {
      orgId,
      addonKey,
      eventType,
      code: (error as any).code,
      message: error.message,
    })
  }
}
