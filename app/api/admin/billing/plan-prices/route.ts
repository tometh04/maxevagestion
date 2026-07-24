import { NextResponse } from "next/server"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { getPlanPricing } from "@/lib/billing/plan-pricing"

/**
 * Precios de planes estándar editables desde platform-admin (tabla plan_prices).
 *
 * - GET   → catálogo efectivo (overlay DB sobre constante PLANS).
 * - PATCH → setea el precio de UN plan. ENTERPRISE puede quedar null (precio
 *           per-cuenta vía custom_plans). PRO/STARTER requieren > 0.
 *
 * Editar acá NO re-cobra suscripciones existentes: aplica a nuevos checkouts y a
 * cambios de plan. El re-precio de una suscripción viva es explícito
 * (applyPriceChange en el flujo custom-plan / change-plan).
 */

const BODY = z.object({
  plan_id: z.enum(["STARTER", "PRO", "ENTERPRISE"]),
  // number > 0, o null (solo válido para ENTERPRISE — validado abajo).
  price_ars_monthly: z.number().positive().nullable(),
})

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
  const catalog = await getPlanPricing(admin)
  return NextResponse.json({ prices: catalog })
}

export async function PATCH(request: Request) {
  const { user, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = BODY.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { plan_id, price_ars_monthly } = parsed.data

  // Solo ENTERPRISE puede quedar sin precio (deal per-cuenta). PRO/STARTER cobran
  // por MP self-serve y necesitan un monto concreto.
  if (price_ars_monthly === null && plan_id !== "ENTERPRISE") {
    return NextResponse.json(
      { error: `El precio de ${plan_id} no puede ser null` },
      { status: 400 }
    )
  }

  const admin = createAdminClient() as any

  // Snapshot previo para auditoría.
  const { data: before } = await admin
    .from("plan_prices")
    .select("plan_id, price_ars_monthly")
    .eq("plan_id", plan_id)
    .maybeSingle()

  const { data: updated, error } = await admin
    .from("plan_prices")
    .upsert(
      {
        plan_id,
        price_ars_monthly,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "plan_id" }
    )
    .select("plan_id, price_ars_monthly")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logSecurityEvent({
    eventType: "PLAN_PRICE_UPDATED_BY_ADMIN",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    targetEntity: "plan_prices",
    targetEntityId: plan_id,
    details: {
      plan_id,
      before: before?.price_ars_monthly ?? null,
      after: price_ars_monthly,
    },
  })

  // La página de billing admin muestra el catálogo; refrescamos su RSC.
  revalidatePath("/admin/billing")

  return NextResponse.json({ ok: true, price: updated })
}
