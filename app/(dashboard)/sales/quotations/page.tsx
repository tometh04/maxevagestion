import { QuotationsDashboard } from "@/components/sales/quotations-dashboard"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { redirect } from "next/navigation"

export default async function QuotationsPage() {
  const { user } = await getCurrentUser()
  if (!user.org_id) redirect("/dashboard")
  const supabase: any = await createServerClient()
  const scope = await resolveAgencyPermissionScope(supabase, user, "leads", "read")
  if (scope.agencyIds.length === 0) redirect("/dashboard")

  const noMatchId = "00000000-0000-0000-0000-000000000000"
  const orgWideRole = ["SUPER_ADMIN", "ORG_OWNER", "CONTABLE", "POST_VENTA"].includes(user.role)

  // El selector no debe revelar vendedores de agencias fuera del alcance del
  // usuario. Los roles org-wide ya reciben todas las agencias de su tenant.
  let allowedSellerIds: string[] | null = null
  const hasUnrestrictedOrgScope = orgWideRole
    && scope.ownAgencyIds.length === 0
    && scope.fullAgencyIds.length === scope.memberAgencyIds.length
  if (!hasUnrestrictedOrgScope) {
    const { data: memberships } = await supabase
      .from("user_agencies")
      .select("user_id")
      .in("agency_id", scope.fullAgencyIds.length > 0 ? scope.fullAgencyIds : [noMatchId])
    allowedSellerIds = Array.from(new Set([
      ...(memberships ?? []).map((row: any) => row.user_id),
      ...(scope.ownAgencyIds.length > 0 ? [user.id] : []),
    ]))
  }

  let sellersQuery = supabase
    .from("users")
    .select("id, name")
    .eq("org_id", user.org_id)
    .eq("role", "SELLER")
    .order("name")
  if (allowedSellerIds) {
    sellersQuery = sellersQuery.in("id", allowedSellerIds.length > 0 ? allowedSellerIds : [noMatchId])
  }

  const agenciesQuery = supabase
    .from("agencies")
    .select("id, name")
    .eq("org_id", user.org_id)
    .in("id", scope.agencyIds.length > 0 ? scope.agencyIds : [noMatchId])
    .order("name")

  const [sellersRes, agenciesRes] = await Promise.all([sellersQuery, agenciesQuery])

  return (
    <QuotationsDashboard
      sellers={sellersRes.data || []}
      agencies={agenciesRes.data || []}
      currentUserRole={user.role}
      currentUserId={user.id}
    />
  )
}
