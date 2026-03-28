import { QuotationsDashboard } from "@/components/sales/quotations-dashboard"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export default async function QuotationsPage() {
  const { user } = await getCurrentUser()
  const supabase: any = await createServerClient()

  // Fetch sellers and agencies for filters
  const [sellersRes, agenciesRes] = await Promise.all([
    supabase.from("users").select("id, name").eq("role", "SELLER").order("name"),
    supabase.from("agencies").select("id, name").order("name"),
  ])

  return (
    <QuotationsDashboard
      sellers={sellersRes.data || []}
      agencies={agenciesRes.data || []}
      currentUserRole={user.role}
      currentUserId={user.id}
    />
  )
}
