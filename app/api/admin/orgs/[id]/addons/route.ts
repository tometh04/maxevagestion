import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ADDONS, ADDON_KEYS, type AddonKey } from "@/lib/addons/catalog"
import { syncAddonsToMp } from "@/lib/addons/mp-sync"
import { computeSubscriptionTotalArs } from "@/lib/addons/pricing"
import { resolveOrgAddons } from "@/lib/addons/server"
import { getCurrentUser } from "@/lib/auth"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { getPlanPricing } from "@/lib/billing/plan-pricing"
import { logSecurityEvent } from "@/lib/security/audit"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

/**
 * Complementos de UNA organización, desde platform-admin.
 *
 * A diferencia del endpoint del tenant, acá el admin SÍ puede forzar el camino
 * de re-autorización de Mercado Pago: está mirando la pantalla y puede avisarle
 * al cliente. Aun así, nunca se escribe `subscription_status` — ver mp-sync.ts.
 */

const ADDON_KEY = z.enum(ADDON_KEYS as [AddonKey, ...AddonKey[]])

const BODY = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("activate"),
    addon_key: ADDON_KEY,
    price_ars_monthly: z.number().min(0).nullable().optional(),
    note: z.string().max(1000).optional(),
  }),
  z.object({ action: z.literal("deny"), addon_key: ADDON_KEY, note: z.string().max(1000) }),
  z.object({
    action: z.literal("set_price"),
    addon_key: ADDON_KEY,
    price_ars_monthly: z.number().min(0),
  }),
  z.object({ action: z.literal("cancel_scheduled"), addon_key: ADDON_KEY }),
  z.object({
    action: z.literal("cancel_now"),
    addon_key: ADDON_KEY,
    note: z.string().min(1).max(1000),
  }),
])

async function requireAdmin() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const ok = await isPlatformAdmin(supabase, user.id)
  return { user, ok }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const { ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const admin = createAdminClient() as any
  const [{ data: org }, planPrices, entitlements, { data: catalog }] = await Promise.all([
    admin
      .from("organizations")
      .select(
        "plan, subscription_status, custom_plan_id, manual_mrr_override_ars, " +
          "agreed_plan_price_ars, agreed_plan_id, mp_preapproval_id, " +
          "addons_mp_sync_state, current_period_ends_at, agente_blanco_org_slug"
      )
      .eq("id", orgId)
      .maybeSingle(),
    getPlanPricing(admin),
    resolveOrgAddons(admin, orgId),
    admin.from("subscription_addons").select("addon_key, price_ars_monthly, active"),
  ])
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 })

  const { data: customPlan } = org.custom_plan_id
    ? await admin
        .from("custom_plans")
        .select("base_price_ars, discount_percent, discount_ends_at")
        .eq("id", org.custom_plan_id)
        .maybeSingle()
    : { data: null }

  const shared = { org, customPlan, planPrices, entitlements }
  const now = computeSubscriptionTotalArs({ ...shared, horizon: "now" } as any)
  const next = computeSubscriptionTotalArs({ ...shared, horizon: "next_cycle" } as any)

  return NextResponse.json({
    addons: ADDON_KEYS.map((key) => {
      // `definition` no viaja: es metadata de código que el cliente ya tiene.
      const { definition, ...entitlement } = entitlements[key]
      return {
        ...entitlement,
        name: ADDONS[key].name,
        requiresOrgSlug: ADDONS[key].requiresOrgSlug === true,
      }
    }),
    catalog: catalog ?? [],
    totals: { now, next },
    mpSyncState: org.addons_mp_sync_state,
    // Sin preapproval el cambio de importe no se cobra solo: lo factura un humano.
    billsManually: !org.mp_preapproval_id,
    hasAgenteBlancoSlug: Boolean(org.agente_blanco_org_slug),
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = BODY.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const body = parsed.data
  const admin = createAdminClient() as any

  const { data: org } = await admin
    .from("organizations")
    .select("id, current_period_ends_at, agente_blanco_org_slug")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 })

  const nowIso = new Date().toISOString()
  const def = ADDONS[body.addon_key]
  let syncOutcome: unknown = null

  if (body.action === "activate") {
    // Cobrar por una bandeja que el proveedor todavía no habilitó es un ticket
    // feo garantizado. Sin slug no se activa.
    if (def.requiresOrgSlug && !org.agente_blanco_org_slug) {
      return NextResponse.json(
        {
          error: `${def.name} necesita el identificador de la empresa cargado antes de activarse.`,
          code: "missing_org_slug",
        },
        { status: 409 }
      )
    }

    const { data: catalogRow } = await admin
      .from("subscription_addons")
      .select("price_ars_monthly")
      .eq("addon_key", body.addon_key)
      .maybeSingle()

    const snapshot =
      body.price_ars_monthly !== undefined && body.price_ars_monthly !== null
        ? body.price_ars_monthly
        : catalogRow?.price_ars_monthly != null
          ? Number(catalogRow.price_ars_monthly)
          : null

    const { error } = await admin.from("organization_addons").upsert(
      {
        org_id: orgId,
        addon_key: body.addon_key,
        status: "ACTIVE",
        price_ars_monthly_snapshot: snapshot,
        price_source: body.price_ars_monthly !== undefined ? "ADMIN_OVERRIDE" : "CATALOG",
        activated_at: nowIso,
        activated_by: user.id,
        // Sin prorrateo: entra en la factura del próximo ciclo.
        billable_from: org.current_period_ends_at ?? nowIso,
        cancel_requested_at: null,
        cancel_effective_at: null,
        cancelled_at: null,
        notes: body.note ?? null,
      },
      { onConflict: "org_id,addon_key" }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAddonEvent(admin, orgId, body.addon_key, "ADDON_ACTIVATED", nowIso, {
      source: "admin",
      price_ars_monthly: snapshot,
    })
    syncOutcome = await syncAddonsToMp(admin, orgId, {
      allowReauth: true,
      source: "admin",
      actorUserId: user.id,
    })
  } else if (body.action === "deny") {
    const { error } = await admin
      .from("organization_addons")
      .update({ status: "DENIED", notes: body.note })
      .eq("org_id", orgId)
      .eq("addon_key", body.addon_key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body.action === "set_price") {
    const { error } = await admin
      .from("organization_addons")
      .update({
        price_ars_monthly_snapshot: body.price_ars_monthly,
        price_source: "ADMIN_OVERRIDE",
      })
      .eq("org_id", orgId)
      .eq("addon_key", body.addon_key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    syncOutcome = await syncAddonsToMp(admin, orgId, {
      allowReauth: true,
      source: "admin",
      actorUserId: user.id,
    })
  } else if (body.action === "cancel_scheduled") {
    // Lo sigue usando hasta el fin del ciclo que ya pagó. El cron lo apaga.
    const { error } = await admin
      .from("organization_addons")
      .update({
        status: "SCHEDULED_CANCEL",
        cancel_requested_at: nowIso,
        cancel_effective_at: org.current_period_ends_at ?? nowIso,
      })
      .eq("org_id", orgId)
      .eq("addon_key", body.addon_key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAddonEvent(admin, orgId, body.addon_key, "ADDON_CANCEL_SCHEDULED", nowIso, {
      source: "admin",
      effective_at: org.current_period_ends_at,
    })
  } else {
    // cancel_now: baja inmediata (soporte / fraude). NO borra datos del módulo.
    const { error } = await admin
      .from("organization_addons")
      .update({ status: "CANCELLED", cancelled_at: nowIso, notes: body.note })
      .eq("org_id", orgId)
      .eq("addon_key", body.addon_key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAddonEvent(admin, orgId, body.addon_key, "ADDON_CANCELLED", nowIso, {
      source: "admin",
      immediate: true,
    })
    syncOutcome = await syncAddonsToMp(admin, orgId, {
      allowReauth: true,
      source: "admin",
      actorUserId: user.id,
    })
  }

  logSecurityEvent({
    eventType: "ORG_ADDON_UPDATED",
    // Cambia lo que se le cobra a un tenant.
    severity: body.action === "activate" || body.action === "cancel_now" ? "WARN" : "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetOrgId: orgId,
    targetEntity: "organization_addons",
    targetEntityId: `${orgId}:${body.addon_key}`,
    requestPath: request.url,
    details: { action: body.action, addon_key: body.addon_key, syncOutcome },
  })

  revalidatePath(`/admin/orgs/${orgId}`)
  return NextResponse.json({ ok: true, syncOutcome })
}

async function logAddonEvent(
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
  // El audit no debe romper la operación, pero sí dejar rastro si se pierde:
  // billing_events tiene un CHECK cerrado y un valor faltante da 23514.
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
