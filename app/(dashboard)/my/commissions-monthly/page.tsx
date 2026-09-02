import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { assertAddonEnabledPage } from "@/lib/addons/guard"
import { notFound } from "next/navigation"
import { MyCommissionsMonthlyClient } from "@/components/commissions-monthly/my-commissions-client"

export const dynamic = "force-dynamic"

/**
 * Página para que la vendedora vea su simulación de comisión mensual en
 * tiempo real. Pedido por VICO TRAVEL GROUP (2026-05).
 *
 * Solo accesible si:
 *   - La agencia tiene contratado el complemento `monthly_commissions`
 *   - La vendedora tiene regla configurada (sino, mostramos mensaje)
 */
export default async function MyCommissionsMonthlyPage() {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    notFound()
  }

  const supabase: any = await createServerClient()
  await assertAddonEnabledPage(supabase, user.org_id, "monthly_commissions")

  // Confirmar que la vendedora tiene regla
  const { data: rule } = await supabase
    .from("monthly_commission_rules")
    .select("id, enabled")
    .eq("seller_id", user.id)
    .eq("org_id", user.org_id)
    .maybeSingle()

  const hasRule = !!rule && (rule as any).enabled

  return (
    <MyCommissionsMonthlyClient
      sellerId={user.id}
      sellerName={user.name}
      hasRule={hasRule}
    />
  )
}
