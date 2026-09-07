import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ADDONS, ADDON_KEYS, type AddonKey } from "@/lib/addons/catalog"
import { getCurrentUser } from "@/lib/auth"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

/**
 * Catálogo global de complementos, editable desde platform-admin.
 *
 * - GET   → catálogo (metadata de código + precio/enforcement de DB) y cuántas
 *           orgs tiene activo cada uno.
 * - PATCH → edita un complemento del catálogo, o una inclusión por plan.
 *
 * Editar el PRECIO acá no re-cobra a nadie: las orgs que ya lo tienen conservan
 * su `price_ars_monthly_snapshot`. Aplica a las altas nuevas. Es la misma
 * semántica que `plan_prices` con las suscripciones vivas.
 *
 * Cambiar `enforcement` sí es inmediato y es lo que enciende el corte:
 * OFF (inerte) → SHADOW (deja pasar y loguea) → ON (gatea).
 */

const ADDON_KEY = z.enum(ADDON_KEYS as [AddonKey, ...AddonKey[]])

const CATALOG_BODY = z.object({
  kind: z.literal("addon"),
  addon_key: ADDON_KEY,
  price_ars_monthly: z.number().min(0).nullable().optional(),
  active: z.boolean().optional(),
  enforcement: z.enum(["OFF", "SHADOW", "ON"]).optional(),
  sort_order: z.number().int().min(0).optional(),
})

const INCLUSION_BODY = z.object({
  kind: z.literal("inclusion"),
  addon_key: ADDON_KEY,
  plan_id: z.enum(["STARTER", "PRO", "ENTERPRISE", "CUSTOM"]),
  included_until: z.string().datetime().nullable().optional(),
  remove: z.boolean().optional(),
})

const BODY = z.discriminatedUnion("kind", [CATALOG_BODY, INCLUSION_BODY])

async function requireAdmin() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const ok = await isPlatformAdmin(supabase, user.id)
  return { user, ok }
}

export async function GET() {
  const { ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const admin = createAdminClient() as any
  const [{ data: rows }, { data: inclusions }, { data: orgRows }, { data: orgs }] =
    await Promise.all([
      admin.from("subscription_addons").select("*"),
      admin.from("subscription_addon_plan_inclusions").select("*"),
      admin
        .from("organization_addons")
        .select(
          "org_id, addon_key, status, price_ars_monthly_snapshot, activated_at, " +
            "requested_at, cancel_effective_at"
        ),
      admin.from("organizations").select("id, name, plan, subscription_status"),
    ])

  const byKey = new Map<string, any>((rows ?? []).map((r: any) => [r.addon_key, r]))
  const orgById = new Map<string, any>((orgs ?? []).map((o: any) => [o.id, o]))
  const activeCount = new Map<string, number>()
  const pendingCount = new Map<string, number>()
  for (const r of orgRows ?? []) {
    const target =
      r.status === "ACTIVE" || r.status === "SCHEDULED_CANCEL"
        ? activeCount
        : r.status === "REQUESTED" || r.status === "PENDING_SETUP"
          ? pendingCount
          : null
    if (target) target.set(r.addon_key, (target.get(r.addon_key) ?? 0) + 1)
  }

  /**
   * Desglose por agencia. Se manda el detalle y no solo el contador porque el
   * control interno es "quién tiene qué", no "cuántos". Las bajas y las
   * solicitudes denegadas quedan afuera: la pregunta es quién lo tiene hoy o
   * está en camino de tenerlo.
   */
  const VIGENTES = new Set(["ACTIVE", "SCHEDULED_CANCEL", "REQUESTED", "PENDING_SETUP"])
  const orgsByAddon = new Map<string, any[]>()
  for (const r of orgRows ?? []) {
    if (!VIGENTES.has(r.status)) continue
    const org = orgById.get(r.org_id)
    const lista = orgsByAddon.get(r.addon_key) ?? []
    lista.push({
      orgId: r.org_id,
      // Una org borrada dejaría la fila huérfana: se muestra igual, con el id.
      name: org?.name ?? "(agencia no encontrada)",
      plan: org?.plan ?? null,
      subscriptionStatus: org?.subscription_status ?? null,
      status: r.status,
      priceArsMonthly:
        r.price_ars_monthly_snapshot != null ? Number(r.price_ars_monthly_snapshot) : null,
      since: r.activated_at ?? r.requested_at ?? null,
      cancelEffectiveAt: r.cancel_effective_at ?? null,
    })
    orgsByAddon.set(r.addon_key, lista)
  }
  orgsByAddon.forEach((lista) => {
    lista.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "es"))
  })

  const addons = ADDON_KEYS.map((key) => {
    const row = byKey.get(key)
    const def = ADDONS[key]
    return {
      key,
      name: def.name,
      description: def.description,
      category: def.category,
      selfServe: def.selfServe,
      requiresSetup: !def.selfServe,
      // null = todavía sin precio cargado. No es lo mismo que gratis.
      priceArsMonthly: row?.price_ars_monthly != null ? Number(row.price_ars_monthly) : null,
      active: row?.active === true,
      enforcement: (row?.enforcement as string) ?? "OFF",
      sortOrder: row?.sort_order ?? 0,
      orgsActive: activeCount.get(key) ?? 0,
      orgsPending: pendingCount.get(key) ?? 0,
      orgs: orgsByAddon.get(key) ?? [],
      inclusions: (inclusions ?? [])
        .filter((i: any) => i.addon_key === key)
        .map((i: any) => ({ planId: i.plan_id, includedUntil: i.included_until })),
    }
  })

  return NextResponse.json({ addons })
}

export async function PATCH(request: Request) {
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

  if (body.kind === "addon") {
    const { data: before } = await admin
      .from("subscription_addons")
      .select("*")
      .eq("addon_key", body.addon_key)
      .maybeSingle()

    const patch: Record<string, unknown> = { addon_key: body.addon_key, updated_by: user.id }
    if ("price_ars_monthly" in body) patch.price_ars_monthly = body.price_ars_monthly
    if (body.active !== undefined) patch.active = body.active
    if (body.enforcement !== undefined) patch.enforcement = body.enforcement
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order

    const { error } = await admin
      .from("subscription_addons")
      .upsert(patch, { onConflict: "addon_key" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    logSecurityEvent({
      eventType: "ADDON_CATALOG_UPDATED",
      // Cambiar el enforcement corta o habilita una sección para TODOS los
      // tenants a la vez: no es un INFO más.
      severity: body.enforcement && body.enforcement !== before?.enforcement ? "WARN" : "INFO",
      actorUserId: user.id,
      actorAuthId: (user as any).auth_id,
      targetEntity: "subscription_addons",
      targetEntityId: body.addon_key,
      requestPath: request.url,
      details: { before, after: patch },
    })
  } else {
    if (body.remove) {
      const { error } = await admin
        .from("subscription_addon_plan_inclusions")
        .delete()
        .eq("addon_key", body.addon_key)
        .eq("plan_id", body.plan_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // La fila del catálogo tiene que existir: la inclusión la referencia.
      const { error: seedErr } = await admin
        .from("subscription_addons")
        .upsert({ addon_key: body.addon_key }, { onConflict: "addon_key", ignoreDuplicates: true })
      if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })

      const { error } = await admin.from("subscription_addon_plan_inclusions").upsert(
        {
          addon_key: body.addon_key,
          plan_id: body.plan_id,
          included_until: body.included_until ?? null,
          updated_by: user.id,
        },
        { onConflict: "addon_key,plan_id" }
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logSecurityEvent({
      eventType: "ADDON_INCLUSION_UPDATED",
      // Quitar una inclusión le apaga el complemento a todo un plan de golpe.
      severity: "WARN",
      actorUserId: user.id,
      actorAuthId: (user as any).auth_id,
      targetEntity: "subscription_addon_plan_inclusions",
      targetEntityId: `${body.addon_key}:${body.plan_id}`,
      requestPath: request.url,
      details: {
        addon_key: body.addon_key,
        plan_id: body.plan_id,
        included_until: body.included_until ?? null,
        removed: body.remove === true,
      },
    })
  }

  revalidatePath("/admin/billing")
  return NextResponse.json({ ok: true })
}
