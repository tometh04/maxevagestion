import { redirect } from "next/navigation"
import { FinancialAccountsPageClient } from "@/components/accounting/financial-accounts-page-client"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

export default async function FinancialAccountsPage() {
  const { user } = await getCurrentUser()

  // Esta página no validaba permiso de módulo. La API detrás sí lo hace, así
  // que no había fuga de datos, pero la pantalla se dibujaba para cualquiera
  // que supiera la URL —no está en el sidebar— y quedaba mostrando una tabla
  // vacía o un error, que es peor que decir que no corresponde.
  //
  // El módulo es `cash` y no `accounting` porque las cuentas financieras son
  // operativas: se usan para cobrar y pagar. Es el mismo criterio con el que
  // esta pantalla vive dentro de Caja y Bancos.
  if (!canAccessModule(user.role as any, "cash")) {
    redirect("/dashboard")
  }

  const supabase = await createServerClient()
  const agencies = await getScopedAgenciesForUser(supabase, user)

  return <FinancialAccountsPageClient agencies={agencies} />
}

