import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { logSecurityEvent } from "@/lib/security/audit"
import { sendWelcomeEmail } from "@/lib/email/email-service"

const PLAN_LIMITS: Record<string, { max_users: number; max_agencies: number; max_operations_per_month: number }> = {
  STARTER: { max_users: 3, max_agencies: 1, max_operations_per_month: 50 },
  PRO: { max_users: 10, max_agencies: 3, max_operations_per_month: 500 },
  ENTERPRISE: { max_users: 999, max_agencies: 99, max_operations_per_month: 99999 },
}

const TRIAL_DAYS = 14

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
}

export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const body = await request.json().catch(() => ({}))

  const name: string | undefined = body.name?.trim()
  const billingEmail: string | undefined = body.billing_email?.trim()
  const plan: string = body.plan || "STARTER"
  const cuit: string | undefined = body.cuit?.trim()

  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 })
  if (!PLAN_LIMITS[plan]) return NextResponse.json({ error: "plan inválido" }, { status: 400 })

  // Si el user ya pertenece a una org, no permitir crear otra. Protegemos
  // contra user que completa onboarding dos veces por doble-click/etc.
  if ((user as any).org_id) {
    return NextResponse.json({ error: "Ya pertenecés a una organización" }, { status: 409 })
  }

  const admin = createAdminClient() as any
  const limits = PLAN_LIMITS[plan]

  // Slug único: base + suffix random si colisiona.
  const baseSlug = slugify(name) || "tenant"
  let slug = baseSlug
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle()
    if (!existing) break
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
  }

  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS)

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name,
      slug,
      owner_id: user.id,
      plan,
      subscription_status: "TRIAL",
      trial_ends_at: trialEndsAt.toISOString(),
      max_users: limits.max_users,
      max_agencies: limits.max_agencies,
      max_operations_per_month: limits.max_operations_per_month,
      billing_email: billingEmail ?? user.email,
      billing_name: name,
      cuit: cuit ?? null,
    })
    .select("id, slug")
    .single()

  if (orgErr || !org) {
    console.error("onboarding: insert org failed", orgErr)
    return NextResponse.json({ error: orgErr?.message || "Error creando org" }, { status: 500 })
  }

  // Link user → org (user es owner).
  const { error: userErr } = await admin
    .from("users")
    .update({ org_id: org.id, role: "ORG_OWNER" })
    .eq("id", user.id)
  if (userErr) {
    // Rollback: tratá de borrar la org para dejar el sistema consistente.
    await admin.from("organizations").delete().eq("id", org.id)
    return NextResponse.json({ error: userErr.message }, { status: 500 })
  }

  // organization_members entry (si existe la tabla — es del modelo multi-user).
  await admin
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: "ORG_OWNER",
      status: "ACTIVE",
    })
    .throwOnError?.()

  // Nota: NO seedeamos commission_rules default acá. Si lo hiciéramos,
  // cualquier tenant nuevo empezaría a generar comisiones automáticas
  // con un valor arbitrario (ej. 10%), lo que mezcla la contabilidad
  // para agencias que pagan otro porcentaje, que pagan montos fijos, o
  // que directamente no pagan comisión. La UI muestra un warning cuando
  // no hay reglas configuradas y el owner arma las suyas en Settings.

  logSecurityEvent({
    eventType: "TENANT_CREATED",
    severity: "INFO",
    actorUserId: user.id,
    actorAuthId: (user as any).auth_id,
    actorOrgId: org.id,
    targetOrgId: org.id,
    targetEntity: "organizations",
    targetEntityId: org.id,
    details: { plan, slug: org.slug },
  })

  // Welcome email — fire-and-forget. Si Resend está caído o falta la
  // API key, NO bloqueamos el onboarding: el tenant ya tiene su org
  // creada y puede entrar al dashboard. Loguear el resultado para
  // diagnóstico.
  sendWelcomeEmail(billingEmail || user.email, name, trialEndsAt)
    .then((res) => {
      if (!res.success) {
        console.warn("onboarding: welcome email no enviado", {
          orgId: org.id,
          email: billingEmail || user.email,
          error: res.error,
        })
      }
    })
    .catch((err) => {
      console.error("onboarding: welcome email crashed", err)
    })

  return NextResponse.json({ org_id: org.id, slug: org.slug })
}
