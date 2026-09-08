import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { seedChartOfAccountsForOrg } from "@/lib/accounting/seed-chart-of-accounts"

/**
 * POST /api/admin/orgs/[id]/seed-chart-of-accounts
 *
 * Siembra el plan de cuentas default (plantilla generica, ver
 * `lib/accounting/default-chart-of-accounts.ts`) en la org indicada.
 * Idempotente: si ya tiene cuentas, no hace nada.
 *
 * Solo platform_admin. Sin body: ya no se puede elegir "de que agencia copiar",
 * el plan sale siempre de la plantilla del codigo.
 */
export async function POST(
  _request: Request,
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

  try {
    const result = await seedChartOfAccountsForOrg(orgId, admin)

    logSecurityEvent({
      eventType: "ADMIN_SEED_CHART_OF_ACCOUNTS",
      severity: "INFO",
      actorUserId: user.id,
      targetOrgId: orgId,
      requestPath: "/api/admin/orgs/[id]/seed-chart-of-accounts",
      details: {
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
