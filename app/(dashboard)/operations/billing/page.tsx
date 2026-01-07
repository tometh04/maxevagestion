import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

export default async function OperationsBillingPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "operations")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Facturación de Operaciones</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Facturación de Operaciones</h1>
        <p className="text-muted-foreground">
          Gestión de facturación y documentos fiscales de operaciones
        </p>
      </div>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          Esta funcionalidad está en desarrollo. Próximamente se podrá:
        </p>
        <ul className="mt-4 list-disc list-inside space-y-2 text-sm text-muted-foreground">
          <li>Emitir facturas desde operaciones</li>
          <li>Gestionar notas de crédito</li>
          <li>Integración con AFIP</li>
          <li>Historial de facturación</li>
        </ul>
      </div>
    </div>
  )
}

