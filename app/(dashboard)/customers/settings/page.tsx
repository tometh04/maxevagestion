import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

export default async function CustomersSettingsPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "customers")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configuración de Clientes</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración de Clientes</h1>
        <p className="text-muted-foreground">
          Configuración y preferencias del módulo de clientes
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se podrá configurar:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Campos personalizados</li>
          <li>Validaciones de datos</li>
          <li>Notificaciones automáticas</li>
          <li>Integraciones con otros módulos</li>
        </ul>
      </div>
    </div>
  )
}

