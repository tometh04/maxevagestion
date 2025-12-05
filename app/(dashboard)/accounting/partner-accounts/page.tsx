import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { PartnerAccountsClient } from "@/components/accounting/partner-accounts-client"

export default async function PartnerAccountsPage() {
  const { user } = await getCurrentUser()

  // Solo SUPER_ADMIN y CONTABLE pueden acceder
  if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
    redirect("/dashboard")
  }

  return <PartnerAccountsClient userRole={user.role} />
}

