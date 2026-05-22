import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { notFound } from "next/navigation"
import { CommissionsMonthlySettlementsClient } from "@/components/commissions-monthly/settlements-client"

export const dynamic = "force-dynamic"

export default async function CommissionsMonthlySettlementsPage() {
  const { user } = await getCurrentUser()
  if (!user.org_id) notFound()
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") notFound()

  const supabase: any = await createServerClient()
  const enabled = await getOrgFeatureFlag(
    supabase,
    user.org_id,
    "features.monthly_commissions_module"
  )
  if (!enabled) notFound()

  // Default: mes actual. El client puede cambiar.
  const now = new Date()
  const defaultYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  return <CommissionsMonthlySettlementsClient defaultYearMonth={defaultYM} />
}
