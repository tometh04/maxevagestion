import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración Financiera</h1>
        <p className="text-muted-foreground">
          Configuración y preferencias del módulo financiero
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se podrá configurar:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Monedas y tipos de cambio</li>
          <li>Cuentas financieras</li>
          <li>Métodos de pago</li>
          <li>Reglas de comisiones</li>
          <li>Configuración contable</li>
        </ul>
      </div>
    </div>
  )
}

