import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { PartnerAccountsClient } from "@/components/accounting/partner-accounts-client"
import { createServerClient } from "@/lib/supabase/server"

export default async function PartnerAccountsPage() {
  const { user } = await getCurrentUser()

  // Solo SUPER_ADMIN y CONTABLE pueden acceder
  if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()

  // Get user agencies
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)

  let agencies: Array<{ id: string; name: string }> = []

  if (user.role === "SUPER_ADMIN") {
    const { data } = await supabase.from("agencies").select("id, name").order("name")
    agencies = data || []
  } else if (userAgencies && userAgencies.length > 0) {
    const agencyIds = userAgencies.map((ua: any) => ua.agency_id)
    const { data } = await supabase.from("agencies").select("id, name").in("id", agencyIds)
    agencies = data || []
  }

  return <PartnerAccountsClient userRole={user.role} agencies={agencies} />
}

