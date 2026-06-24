import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"
import { FinancesSettingsPageClient } from "@/components/finances/finances-settings-page-client"

export default async function FinancesSettingsPage() {
  const { user } = await getCurrentUser()

  // Permiso resuelto contra la matriz por org (agency_role_permissions): respeta
  // los overrides que cada org configura en Ajustes → Permisos. Sin override, cae
  // al default estático del rol (comportamiento previo intacto).
  const supabase = await createServerClient()
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
  const perms = await resolveUserPermissions(
    supabase,
    user.id,
    (user as any).org_id,
    (user as any).roles ?? user.role,
    agencyIds
  )

  if (!assertPermission(user.role, perms, "cash", "read")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configuración Financiera</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return <FinancesSettingsPageClient />
}

