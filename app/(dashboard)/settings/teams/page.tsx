import { getCurrentUser } from "@/lib/auth"
import { TeamsPageClient } from "@/components/teams/teams-page-client"

export default async function SettingsTeamsPage() {
  const { user } = await getCurrentUser()
  
  // Solo admins pueden gestionar equipos
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipos de Ventas</h1>
          <p className="text-sm text-muted-foreground">
            No tiene permiso para acceder a esta sección
          </p>
        </div>
      </div>
    )
  }

  return <TeamsPageClient />
}
