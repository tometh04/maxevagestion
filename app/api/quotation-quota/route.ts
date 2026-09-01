import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { hasAdminRole } from "@/lib/permissions"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { getQuotationQuotaUsage } from "@/lib/quotation-quota/server"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización" }, { status: 403 })
  }

  const supabase = await createServerClient()
  const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "read")
  if (scope.agencyIds.length === 0) {
    return NextResponse.json({ error: "Sin agencias habilitadas" }, { status: 403 })
  }

  const admin = createAdminClient() as any
  const usage = await getQuotationQuotaUsage(admin, user.org_id, scope.agencyIds)
  const { data: org } = await admin
    .from("organizations")
    .select("plan")
    .eq("id", user.org_id)
    .single()

  const { data: packageRows } = await admin
    .from("quotation_credit_packages")
    .select("id, name, units, price_ars, target_plan, target_org_id, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("units", { ascending: true })

  const packages = (packageRows ?? []).filter((row: any) =>
    row.target_org_id === user.org_id
    || (!row.target_org_id && !row.target_plan)
    || (!row.target_org_id && row.target_plan === org?.plan)
  )

  const { data: emissionRows } = await admin
    .from("issued_quotation_documents")
    .select("id, quotation_id, sequence, created_at, agency_id, generated_by")
    .eq("org_id", user.org_id)
    .eq("status", "READY")
    .in("agency_id", scope.agencyIds)
    .gte("created_at", usage.starts_at ?? "1970-01-01T00:00:00.000Z")
    .lt("created_at", usage.ends_at ?? "9999-12-31T23:59:59.999Z")
    .order("created_at", { ascending: false })
    .limit(20)

  const quotationIds = Array.from(new Set((emissionRows ?? []).map((row: any) => row.quotation_id)))
  const issuerIds = Array.from(new Set((emissionRows ?? []).map((row: any) => row.generated_by).filter(Boolean)))
  const [{ data: quotations }, { data: issuers }] = await Promise.all([
    quotationIds.length > 0
      ? admin.from("quotations").select("id, quotation_number").eq("org_id", user.org_id).in("id", quotationIds)
      : Promise.resolve({ data: [] }),
    issuerIds.length > 0
      ? admin.from("users").select("id, name").eq("org_id", user.org_id).in("id", issuerIds)
      : Promise.resolve({ data: [] }),
  ])
  const quotationNumbers = new Map((quotations ?? []).map((row: any) => [row.id, row.quotation_number]))
  const issuerNames = new Map((issuers ?? []).map((row: any) => [row.id, row.name]))
  const agencyNames = new Map(usage.agencies.map((row) => [row.agency_id, row.agency_name]))

  const canManageBilling = hasAdminRole(user.roles)
  return NextResponse.json({
    usage,
    packages,
    can_manage_billing: canManageBilling,
    emissions: (emissionRows ?? []).map((row: any) => ({
      ...row,
      quotation_number: quotationNumbers.get(row.quotation_id) ?? "—",
      agency_name: agencyNames.get(row.agency_id) ?? "—",
      generated_by_name: issuerNames.get(row.generated_by) ?? "—",
    })),
  }, { headers: { "Cache-Control": "no-store" } })
}
