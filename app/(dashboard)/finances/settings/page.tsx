import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { FinancesSettingsPageClient } from "@/components/finances/finances-settings-page-client"

export default async function FinancesSettingsPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "cash")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configuración Financiera</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return <FinancesSettingsPageClient />
}

