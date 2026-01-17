import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { DebtsSalesPageClient } from "@/components/accounting/debts-sales-page-client"

export default async function DebtsSalesPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "accounting")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Deudores por Ventas</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  return <DebtsSalesPageClient />
}
