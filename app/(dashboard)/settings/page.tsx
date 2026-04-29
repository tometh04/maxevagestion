import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { SettingsPageClient } from "@/components/settings/settings-page-client"

interface SettingsPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams
  const defaultTab = params.tab || "users"
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)
  
  const firstAgencyId = agencies[0]?.id || null

  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuenta</h1>
          <p className="text-sm text-muted-foreground">No tienes permisos para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cuenta</h1>
        <p className="text-sm text-muted-foreground">Gestiona tu cuenta, usuarios y operadores</p>
      </div>

      <SettingsPageClient defaultTab={defaultTab} agencies={agencies} firstAgencyId={firstAgencyId} userRole={user.role} />
    </div>
  )
}

