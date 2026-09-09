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

  // Un vendedor entra a vincular su teléfono y atender lo suyo; la API acota
  // qué ve (lib/wha-control/access.ts).
  const rolesDelUsuario: string[] = (user as any).roles ?? [user.role]
  const puedeEntrar = rolesDelUsuario.some((r) =>
    ["SUPER_ADMIN", "ORG_OWNER", "ADMIN", "SELLER", "POST_VENTA"].includes(r)
  )
  if (!puedeEntrar) {
    redirect("/dashboard")
  }
  const esAdminDeWha = rolesDelUsuario.some((r) =>
    ["SUPER_ADMIN", "ORG_OWNER", "ADMIN"].includes(r)
  )

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
        isWhaAdmin={esAdminDeWha}
      />
    </div>
  )
}
