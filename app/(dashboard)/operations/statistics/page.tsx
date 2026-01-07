import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

export default async function OperationsStatisticsPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "operations")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Estadísticas de Operaciones</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Estadísticas de Operaciones</h1>
        <p className="text-muted-foreground">
          Vista de estadísticas y métricas de operaciones
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se mostrarán:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Total de operaciones</li>
          <li>Operaciones por estado</li>
          <li>Ingresos por período</li>
          <li>Operaciones más rentables</li>
          <li>Estadísticas por destino</li>
        </ul>
      </div>
    </div>
  )
}

