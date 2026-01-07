import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

export default async function SettingsIntegrationsPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "settings")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Integraciones</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integraciones</h1>
        <p className="text-muted-foreground">
          Configuración de integraciones con servicios externos
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Integraciones disponibles:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Trello - Sincronización de leads</li>
          <li>Manychat - CRM y automatización</li>
          <li>WhatsApp - Mensajería</li>
          <li>AFIP - Facturación (próximamente)</li>
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Para configurar integraciones, visita la sección de Configuración principal.
        </p>
      </div>
    </div>
  )
}

