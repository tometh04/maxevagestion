import { FinancialAccountsPageClient } from "@/components/accounting/financial-accounts-page-client"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

export default async function FinancialAccountsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)

  return <FinancialAccountsPageClient agencies={agencies} />
}

