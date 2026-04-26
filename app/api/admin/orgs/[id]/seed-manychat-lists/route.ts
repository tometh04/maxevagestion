import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"
import { seedManychatListsForAgency } from "@/lib/manychat/seed-lists"

/**
 * POST /api/admin/orgs/[id]/seed-manychat-lists
 *
 * Crea las listas Manychat default (Argentina/Caribe/Brasil/etc.) para todas las
 * agencias de la org. Idempotente: si una agency ya tiene listas, la skipea.
 *
 * Solo platform_admin. Body opcional: { agencyId?: string } para seedear solo 1.
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

  const admin = createAdminClient() as any

  // Validar que la org exista
  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle()

  if (!org) {
    return NextResponse.json({ error: "Org no existe" }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const onlyAgencyId = typeof body.agencyId === "string" ? body.agencyId : undefined

  // Resolver agencias a seedear
  let agenciesQuery = admin
    .from("agencies")
    .select("id, name")
    .eq("org_id", orgId)

  if (onlyAgencyId) {
    agenciesQuery = agenciesQuery.eq("id", onlyAgencyId)
  }

  const { data: agencies, error: agenciesError } = await agenciesQuery

  if (agenciesError || !agencies || agencies.length === 0) {
    return NextResponse.json(
      { error: "Org sin agencias o error al leerlas" },
      { status: 400 }
    )
  }

  const results: Array<{ agencyId: string; agencyName: string; created: number; skipped: number; error?: string }> = []

  for (const ag of agencies as any[]) {
    try {
      const r = await seedManychatListsForAgency(ag.id, orgId, admin)
      results.push({
        agencyId: ag.id,
        agencyName: ag.name,
        created: r.created,
        skipped: r.skipped,
      })
    } catch (e: any) {
      results.push({
        agencyId: ag.id,
        agencyName: ag.name,
        created: 0,
        skipped: 0,
        error: e.message || String(e),
      })
    }
  }

  logSecurityEvent({
    eventType: "ADMIN_SEED_MANYCHAT_LISTS",
    severity: "INFO",
    actorUserId: user.id,
    targetOrgId: orgId,
    requestPath: "/api/admin/orgs/[id]/seed-manychat-lists",
    details: { results },
  })

  const totalCreated = results.reduce((acc, r) => acc + r.created, 0)
  const totalSkipped = results.reduce((acc, r) => acc + r.skipped, 0)

  return NextResponse.json({
    success: true,
    orgId,
    orgName: org.name,
    totalCreated,
    totalSkipped,
    results,
  })
}
