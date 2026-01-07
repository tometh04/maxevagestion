import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

export default async function OperationsSettingsPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "operations")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configuración de Operaciones</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración de Operaciones</h1>
        <p className="text-muted-foreground">
          Configuración y preferencias del módulo de operaciones
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se podrá configurar:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Estados personalizados</li>
          <li>Flujos de trabajo</li>
          <li>Alertas automáticas</li>
          <li>Plantillas de documentos</li>
        </ul>
      </div>
    </div>
  )
}

