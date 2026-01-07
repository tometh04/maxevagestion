import { getCurrentUser } from "@/lib/auth"

export default async function ToolsSettingsPage() {
  const { user } = await getCurrentUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración de Herramientas</h1>
        <p className="text-muted-foreground">
          Configuración de herramientas y funcionalidades avanzadas
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se podrá configurar:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Configuración de Emilia (AI Copilot)</li>
          <li>Preferencias de notificaciones</li>
          <li>Configuración de exportaciones</li>
          <li>Preferencias de interfaz</li>
        </ul>
      </div>
    </div>
  )
}

