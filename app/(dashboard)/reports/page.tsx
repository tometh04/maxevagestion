import dynamic from "next/dynamic"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import type { UserRole } from "@/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"

const ReportsPageClient = dynamic(
  () =>
    import("@/components/reports/reports-page-client").then((m) => ({
      default: m.ReportsPageClient,
    })),
  {
    loading: () => (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    ),
  }
)

export default async function ReportsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Multi-tenant: RLS protege cross-tenant en `users`, pero un mismo tenant
  // puede tener múltiples agencias (ej: Lozada = Rosario + Madero). Para
  // SELLER/ADMIN limitamos los vendedores del filtro a las agencias del usuario
  // — un seller de Rosario NO debe ver vendedores de Madero como opción.
  // SUPER_ADMIN/ORG_OWNER/CONTABLE ven todas las agencias del tenant.
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as UserRole)

  // 🔴 CROSS-TENANT FIX (2026-05-21): filtro explícito por org_id —
  // ver CLAUDE.md regla de oro multi-tenant. El filtro por agencyIds más
  // abajo no es suficiente: si RLS leakea, los rawSellers pueden incluir
  // users de otros tenants antes del filter post-fetch.
  let sellersQuery = (supabase.from("users") as any)
    .select("id, name, user_agencies(agency_id)")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("org_id", (user as any).org_id)
    .order("name")

  const { data: rawSellers } = await sellersQuery

  // Filtrar a sellers cuya intersección con agencyIds del user no esté vacía.
  // Si el user es SUPER_ADMIN agencyIds incluye todas las del tenant — no
  // filtra. Si es SELLER y agencyIds=[Rosario], solo deja sellers asignados a
  // Rosario.
  const sellers = (rawSellers ?? []).filter((s: any) => {
    const sellerAgencies: string[] = (s.user_agencies ?? []).map(
      (ua: any) => ua.agency_id as string
    )
    if (sellerAgencies.length === 0) return true // sin agencia → sigue visible (SUPER_ADMIN sin user_agencies)
    if (agencyIds.length === 0) return true // user sin agencias asignadas (modo dev/SUPER_ADMIN sin restricción)
    return sellerAgencies.some((a) => agencyIds.includes(a))
  }).map((s: any) => ({ id: s.id, name: s.name }))

  // Agencias visibles: solo las que el user puede ver
  let agenciesQuery = (supabase.from("agencies") as any)
    .select("id, name")
    .order("name")
  if (agencyIds.length > 0) {
    agenciesQuery = agenciesQuery.in("id", agencyIds)
  }
  const { data: agencies } = await agenciesQuery

  return (
    <ReportsPageClient
      userRole={user.role}
      userId={user.id}
      sellers={sellers}
      agencies={agencies || []}
    />
  )
}
