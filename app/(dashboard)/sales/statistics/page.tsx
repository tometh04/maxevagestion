import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

export default async function SalesStatisticsPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "leads")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Estadísticas de Ventas</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Estadísticas de Ventas</h1>
        <p className="text-muted-foreground">
          Vista de estadísticas y métricas de ventas y leads
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se mostrarán:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Pipeline de ventas</li>
          <li>Tasa de conversión</li>
          <li>Leads por origen</li>
          <li>Performance por vendedor</li>
          <li>Estadísticas de Manychat</li>
        </ul>
      </div>
    </div>
  )
}

