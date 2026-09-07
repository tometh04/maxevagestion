import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { CommissionsMonthlyRulesClient } from "@/components/commissions-monthly/rules-client"

export const dynamic = "force-dynamic"

/**
 * Admin: configuración de reglas de comisión mensual per vendedora.
 * Solo accesible para ADMIN o SUPER_ADMIN. El módulo viene con el plan base:
 * no se contrata aparte.
 */
export default async function CommissionsMonthlyRulesPage() {
  const { user } = await getCurrentUser()
  if (!user.org_id) notFound()
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") notFound()

  const supabase: any = await createServerClient()

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
      .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN", "POST_VENTA"])
      .order("name"),
  ])

  return (
    <CommissionsMonthlyRulesClient
      initialRules={(rules || []) as any[]}
      sellers={(sellers || []) as Array<{ id: string; name: string; email: string; role: string }>}
    />
  )
}
