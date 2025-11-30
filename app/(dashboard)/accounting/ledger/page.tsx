import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { LedgerPageClient } from "@/components/accounting/ledger-page-client"

export default async function LedgerPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  const userRole = user.role as any
  if (!canAccessModule(userRole, "accounting")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Libro Mayor</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a contabilidad</p>
        </div>
      </div>
    )
  }

  return <LedgerPageClient />
}
