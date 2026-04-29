import { PaymentsPageClient } from "@/components/cash/payments-page-client"
import { CashFiltersState } from "@/components/cash/cash-filters"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

function getDefaultDateRange() {
  const today = new Date()
  const from = new Date()
  from.setDate(today.getDate() - 30)

  return {
    dateFrom: from.toISOString().split("T")[0],
    dateTo: today.toISOString().split("T")[0],
  }
}

export default async function CashPaymentsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)

  const dates = getDefaultDateRange()

  const defaultFilters: CashFiltersState = {
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    dateType: "CREACION",
    agencyId: "ALL",
    currency: "ARS",
  }

  return <PaymentsPageClient agencies={agencies} defaultFilters={defaultFilters} />
}
