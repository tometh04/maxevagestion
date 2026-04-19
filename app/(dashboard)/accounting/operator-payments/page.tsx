import { OperatorPaymentsPageClient } from "@/components/accounting/operator-payments-page-client"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

export default async function OperatorPaymentsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)

  // Get operators scoped to user's org
  let operatorsQuery = supabase.from("operators").select("id, name").order("name")
  if (user.org_id) operatorsQuery = operatorsQuery.eq("org_id", user.org_id)
  const { data: operators } = await operatorsQuery

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagos a Operadores</h1>
        <p className="text-muted-foreground">
          Gestión de cuentas a pagar a operadores
        </p>
      </div>

      <OperatorPaymentsPageClient 
        agencies={agencies}
        operators={(operators || []).map((o: any) => ({ id: o.id, name: o.name }))}
      />
    </div>
  )
}

