import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { OperationsSettingsPageClient } from "@/components/operations/operations-settings-page-client"

export default async function OperationsSettingsPage() {
  const { user } = await getCurrentUser()
  
  // Todos los roles del usuario (role + additional_roles), no solo el principal.
  const userRoles: string[] = (user as any).roles ?? [user.role]

  if (!userRoles.some((r) => canAccessModule(r as any, "operations"))) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configuración de Operaciones</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return <OperationsSettingsPageClient />
}
