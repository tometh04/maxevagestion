import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { OperationsStatisticsPageClient } from "@/components/operations/operations-statistics-page-client"

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

  return <OperationsStatisticsPageClient />
}

