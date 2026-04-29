import { headers } from "next/headers"
import { CustomersPageClient } from "@/components/customers/customers-page-client"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { makeTimer } from "@/lib/perf-log"

export default async function CustomersPage() {
  const __perfReqId = (await headers()).get("x-perf-req-id") || undefined
  const t = makeTimer("page(customers)", __perfReqId)

  const { user } = await getCurrentUser()
  t.mark("getCurrentUser")

  // Verificar permiso de acceso
  if (!canAccessModule(user.role as any, "customers")) {
    t.end("forbidden")
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a clientes</p>
        </div>
      </div>
    )
  }

  t.end()
  return <CustomersPageClient />
}
