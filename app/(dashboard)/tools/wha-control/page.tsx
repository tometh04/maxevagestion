import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_WHA_QUOTE_FOLLOWUP } from "@/lib/feature-flags"
import { WhaControlPage } from "@/components/tools/wha-control/wha-control-page"

export default async function WhaControlPageRoute({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>
}) {
  const { user } = await getCurrentUser()
  const { phone } = await searchParams

  if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()
  const agencies = await getScopedAgenciesForUser(supabase, user)
  const quoteFollowupEnabled = await getOrgFeatureFlag(
    supabase,
    user.org_id,
    FEATURE_FLAG_WHA_QUOTE_FOLLOWUP
  )

  return (
    <div className="flex flex-1 flex-col">
      <WhaControlPage
        userId={user.id}
        userName={user.name}
        agencies={agencies}
        quoteFollowupEnabled={quoteFollowupEnabled}
        initialPhone={phone}
      />
    </div>
  )
}
