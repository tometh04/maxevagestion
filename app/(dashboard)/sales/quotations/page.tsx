import { QuotationsDashboard } from "@/components/sales/quotations-dashboard"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

export default async function QuotationsPage() {
  const { user } = await getCurrentUser()
  const supabase: any = await createServerClient()

  // Sellers scoped a la org del user
  let sellersQuery = supabase.from("users").select("id, name").eq("role", "SELLER").order("name")
  if (user.org_id) sellersQuery = sellersQuery.eq("org_id", user.org_id)

  const [sellersRes, agencies] = await Promise.all([
    sellersQuery,
    getScopedAgenciesForUser(supabase, user),
  ])

  return (
    <QuotationsDashboard
      sellers={sellersRes.data || []}
      agencies={agencies}
      currentUserRole={user.role}
      currentUserId={user.id}
    />
  )
}
