import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { seedChartOfAccountsForOrg } from "@/lib/accounting/seed-chart-of-accounts"

/**
 * POST /api/admin/orgs/[id]/seed-chart-of-accounts
 *
 * Clona el plan de cuentas de una org template (default: lozada-viajes) a la
 * org indicada. Idempotente: si ya tiene cuentas, no hace nada.
 *
 * Solo platform_admin. Body opcional:
 *   { templateOrgId?: string, templateOrgSlug?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: orgId } = await params

  // Validar que la org exista
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, name")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: "Org no existe" }, { status: 404 })
  }

  // Body opcional con template override
  const body = await request.json().catch(() => ({}))
  const templateOrgId = typeof body.templateOrgId === "string" ? body.templateOrgId : undefined
  const templateOrgSlug = typeof body.templateOrgSlug === "string" ? body.templateOrgSlug : undefined

  try {
    const result = await seedChartOfAccountsForOrg(orgId, admin, {
      templateOrgId,
      templateOrgSlug,
    })

    logSecurityEvent({
      eventType: "ADMIN_SEED_CHART_OF_ACCOUNTS",
      severity: "INFO",
      actorUserId: user.id,
      targetOrgId: orgId,
      requestPath: "/api/admin/orgs/[id]/seed-chart-of-accounts",
      details: {
        templateOrgId: result.templateOrgId,
        created: result.created,
        skipped: result.skipped,
      },
    })

    return NextResponse.json({
      success: true,
      orgId,
      orgName: org.name,
      ...result,
    })
  } catch (error: any) {
    console.error("[seed-chart-of-accounts] Error:", error)
    return NextResponse.json(
      { error: error.message || "Error al seedear plan de cuentas" },
      { status: 500 }
    )
  }
}
