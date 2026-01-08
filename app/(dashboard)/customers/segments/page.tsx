import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { CustomerSegmentsPageClient } from "@/components/customers/customer-segments-page-client"

export default async function CustomerSegmentsPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "customers")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Segmentos de Clientes</h1>
          <p className="text-muted-foreground">
            No tiene permiso para acceder a esta sección
          </p>
        </div>
      </div>
    )
  }

  return <CustomerSegmentsPageClient />
}
