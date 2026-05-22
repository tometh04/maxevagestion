import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { notFound } from "next/navigation"
import { CommissionsMonthlyRulesClient } from "@/components/commissions-monthly/rules-client"

export const dynamic = "force-dynamic"

/**
 * Admin: configuración de reglas de comisión mensual per vendedora.
 * Solo accesible si:
 *   - Org tiene `features.monthly_commissions_module` ON
 *   - User es ADMIN o SUPER_ADMIN
 */
export default async function CommissionsMonthlyRulesPage() {
  const { user } = await getCurrentUser()
  if (!user.org_id) notFound()
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") notFound()

  const supabase: any = await createServerClient()
  const enabled = await getOrgFeatureFlag(
    supabase,
    user.org_id,
    "features.monthly_commissions_module"
  )
  if (!enabled) notFound()

  // 🔴 CROSS-TENANT FIX: scoping explícito por org_id (regla de oro).
  const [{ data: rules }, { data: sellers }] = await Promise.all([
    supabase
      .from("monthly_commission_rules")
      .select("*, users:seller_id(id, name, email, role)")
      .eq("org_id", user.org_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, name, email, role")
      .eq("org_id", user.org_id)
      .eq("is_active", true)
      .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
      .order("name"),
  ])

  return (
    <CommissionsMonthlyRulesClient
      initialRules={(rules || []) as any[]}
      sellers={(sellers || []) as Array<{ id: string; name: string; email: string; role: string }>}
    />
  )
}
