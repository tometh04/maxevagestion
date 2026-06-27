import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { DebtsSalesPageClient } from "@/components/accounting/debts-sales-page-client"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"

export default async function DebtsSalesPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "accounting")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deudores por Ventas</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a esta sección</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  // Get sellers for filters.
  // 🔴 CROSS-TENANT FIX (2026-05-21): filtro explícito por org_id —
  // mismo bug que crm-manychat/page.tsx, ver CLAUDE.md regla de oro.
  let sellersQuery = supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)
    .eq("org_id", (user as any).org_id)

  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }
  const { data: sellers } = await sellersQuery

  // Agencias scopeadas por org/rol para el filtro por oficina.
  const agencies = await getScopedAgenciesForUser(supabase, user)

  return (
    <DebtsSalesPageClient
      sellers={(sellers || []).map((s: any) => ({ id: s.id, name: s.name }))}
      agencies={agencies}
    />
  )
}
