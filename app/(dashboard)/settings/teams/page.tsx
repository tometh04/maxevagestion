import { getCurrentUser } from "@/lib/auth"
import { TeamsPageClient } from "@/components/teams/teams-page-client"

export default async function SettingsTeamsPage() {
  const { user } = await getCurrentUser()
  
  // Solo admins pueden gestionar equipos
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Equipos de Ventas</h1>
          <p className="text-muted-foreground">
            No tiene permiso para acceder a esta sección
          </p>
        </div>
      </div>
    )
  }

  return <TeamsPageClient />
}
