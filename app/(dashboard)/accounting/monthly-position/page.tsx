import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canAccessModule } from "@/lib/permissions"
import { MonthlyPositionPageClient } from "@/components/accounting/monthly-position-page-client"
import { redirect } from "next/navigation"

export default async function MonthlyPositionPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "accounting")) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()

  // Get user agencies
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id, agencies(id, name)")
    .eq("user_id", user.id)

  const agencies = (userAgencies || []).map((ua: any) => ({
    id: ua.agency_id,
    name: ua.agencies?.name || "Sin nombre",
  }))

  return <MonthlyPositionPageClient agencies={agencies} userRole={user.role} />
}

