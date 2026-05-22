import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import { SalesStatisticsPageClient } from "@/components/sales/sales-statistics-page-client"

export default async function SalesStatisticsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
  const perms = user.org_id
    ? await resolveUserPermissions(supabase as any, user.id, user.org_id, user.role, agencyIds)
    : null

  if (!assertPermission(user.role, perms, "leads", "read")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estadísticas de Ventas</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return <SalesStatisticsPageClient />
}

