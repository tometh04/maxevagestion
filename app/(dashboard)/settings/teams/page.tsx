import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

export default async function SettingsTeamsPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "settings")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Equipos de Ventas</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Equipos de Ventas</h1>
        <p className="text-muted-foreground">
          Gestión de equipos de ventas y asignaciones
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se podrá:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Crear y gestionar equipos</li>
          <li>Asignar vendedores a equipos</li>
          <li>Definir líderes de equipo</li>
          <li>Estadísticas por equipo</li>
          <li>Objetivos y métricas por equipo</li>
        </ul>
      </div>
    </div>
  )
}

