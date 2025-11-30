import { CustomersPageClient } from "@/components/customers/customers-page-client"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"

export default async function CustomersPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  if (!canAccessModule(user.role as any, "customers")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a clientes</p>
        </div>
      </div>
    )
  }

  return <CustomersPageClient />
}
