import { getCurrentUser } from "@/lib/auth"
import { ToolsSettingsPageClient } from "@/components/tools/tools-settings-page-client"

export default async function ToolsSettingsPage() {
  const { user } = await getCurrentUser()

  // Solo ADMIN y SUPER_ADMIN pueden ver configuración
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configuración de Herramientas</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return <ToolsSettingsPageClient />
}

