import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

const planSchema = z.object({
  kind: z.literal("plan"),
  plan_id: z.enum(["STARTER", "PRO", "ENTERPRISE"]),
  included_documents: z.number().int().min(0).max(1_000_000),
  enforcement_enabled: z.boolean(),
}).strict()

const packageUpdateSchema = z.object({
  kind: z.literal("package"),
  id: z.string().uuid(),
  active: z.boolean(),
}).strict()

const packageCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  units: z.number().int().positive().max(1_000_000),
  price_ars: z.number().positive().max(100_000_000),
  target_plan: z.enum(["STARTER", "PRO", "ENTERPRISE"]).nullable().optional(),
  target_org_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(-10_000).max(10_000).default(0),
}).strict().refine((value) => !(value.target_plan && value.target_org_id), {
  message: "Elegí plan u organización, no ambos",
})

async function requirePlatformAdmin() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  return { user, ok: await isPlatformAdmin(supabase, user.id) }
}

export async function GET() {
  const { ok } = await requirePlatformAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const admin = createAdminClient() as any
  const [{ data: plans }, { data: packages }, { data: organizations }] = await Promise.all([
    admin.from("quotation_quota_plan_configs").select("*").order("plan_id"),
    admin.from("quotation_credit_packages").select("*").order("sort_order").order("units"),
    admin.from("organizations").select("id, name, plan").order("name"),
  ])
  return NextResponse.json({ plans: plans ?? [], packages: packages ?? [], organizations: organizations ?? [] })
}

export async function PATCH(request: Request) {
  const { user, ok } = await requirePlatformAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const raw = await request.json().catch(() => null)
  const parsed = z.union([planSchema, packageUpdateSchema]).safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
  }
  const admin = createAdminClient() as any

  if (parsed.data.kind === "plan") {
    const { data: previous } = await admin
      .from("quotation_quota_plan_configs")
      .select("enforcement_enabled, enforce_from")
      .eq("plan_id", parsed.data.plan_id)
      .maybeSingle()
    const enforceFrom = parsed.data.enforcement_enabled
      ? previous?.enforcement_enabled && previous?.enforce_from
        ? previous.enforce_from
        : new Date().toISOString()
      : null
    const { error } = await admin.from("quotation_quota_plan_configs").upsert({
      plan_id: parsed.data.plan_id,
      included_documents: parsed.data.included_documents,
      enforcement_enabled: parsed.data.enforcement_enabled,
      enforce_from: enforceFrom,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "plan_id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    logSecurityEvent({
      eventType: "QUOTATION_QUOTA_PLAN_UPDATED",
      severity: "INFO",
      actorUserId: user.id,
      actorAuthId: user.auth_id,
      targetEntity: "quotation_quota_plan_configs",
      targetEntityId: parsed.data.plan_id,
      details: parsed.data,
    })
  } else {
    const { error } = await admin.from("quotation_credit_packages").update({
      active: parsed.data.active,
      updated_at: new Date().toISOString(),
    }).eq("id", parsed.data.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    logSecurityEvent({
      eventType: "QUOTATION_CREDIT_PACKAGE_STATUS_UPDATED",
      severity: "INFO",
      actorUserId: user.id,
      actorAuthId: user.auth_id,
      targetEntity: "quotation_credit_packages",
      targetEntityId: parsed.data.id,
      details: { active: parsed.data.active },
    })
  }
  revalidatePath("/admin/billing")
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const { user, ok } = await requirePlatformAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = packageCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 })
  }
  const admin = createAdminClient() as any
  const { data, error } = await admin.from("quotation_credit_packages").insert({
    ...parsed.data,
    target_plan: parsed.data.target_plan ?? null,
    target_org_id: parsed.data.target_org_id ?? null,
    created_by: user.id,
  }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  logSecurityEvent({
    eventType: "QUOTATION_CREDIT_PACKAGE_CREATED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: user.auth_id,
    targetEntity: "quotation_credit_packages",
    targetEntityId: data.id,
    details: { units: data.units, price_ars: data.price_ars },
  })
  revalidatePath("/admin/billing")
  return NextResponse.json({ ok: true, package: data }, { status: 201 })
}
