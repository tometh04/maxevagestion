import { RecurringPaymentsPageClient } from "@/components/accounting/recurring-payments-page-client"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

export default async function RecurringPaymentsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagos Recurrentes</h1>
        <p className="text-muted-foreground">
          Gestión de pagos recurrentes a proveedores (mensuales, semanales, etc.)
        </p>
      </div>

      <RecurringPaymentsPageClient agencies={agencies} />
    </div>
  )
}

