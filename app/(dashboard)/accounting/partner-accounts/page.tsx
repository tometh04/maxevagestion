import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { PartnerAccountsClient } from "@/components/accounting/partner-accounts-client"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

export default async function PartnerAccountsPage() {
  const { user } = await getCurrentUser()

  if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()
  const agencies = await getScopedAgenciesForUser(supabase, user)

  return <PartnerAccountsClient userRole={user.role} agencies={agencies} />
}

