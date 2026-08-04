import { redirect } from "next/navigation"
import { PartnerAccountsClient } from "@/components/accounting/partner-accounts-client"
import { canPerformAction, getScopedAgenciesForUser } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

export default async function PartnerAccountsPage() {
  // Gate por la matriz de permisos, no por user.role: el set hardcodeado
  // [SUPER_ADMIN, ADMIN, CONTABLE] mandaba al dashboard al ORG_OWNER (el dueño
  // del tenant) y a quien tuviera el rol contable como rol adicional.
  const { user, supabase, matrix } = await getRequestPermissions()

  if (!canPerformAction(user, "accounting", "read", matrix ?? undefined)) {
    redirect("/dashboard")
  }

  const agencies = await getScopedAgenciesForUser(supabase, user)

  return (
    <PartnerAccountsClient
      canWrite={canPerformAction(user, "accounting", "write", matrix ?? undefined)}
      canDelete={canPerformAction(user, "accounting", "delete", matrix ?? undefined)}
      agencies={agencies}
    />
  )
}
