import { headers } from "next/headers"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { OperationsPageClient } from "@/components/operations/operations-page-client"
import { canAccessModule } from "@/lib/permissions"
import { makeTimer } from "@/lib/perf-log"

export default async function OperationsPage() {
  const __perfReqId = (await headers()).get("x-perf-req-id") || undefined
  const t = makeTimer("page(operations)", __perfReqId)

  const { user } = await getCurrentUser()
  t.mark("getCurrentUser")

  // Verificar permiso de acceso
  if (!canAccessModule(user.role as any, "operations")) {
    t.end("forbidden")
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operaciones</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a operaciones</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()
  t.mark("createServerClient")

  // PERF: las 3 queries son independientes (sellers y operators no dependen
  // de user_agencies). Paralelizamos con Promise.all para evitar waterfall.
  const [userAgenciesRes, sellersRes, operatorsRes] = await Promise.all([
    supabase
      .from("user_agencies")
      .select("agency_id, agencies(id, name)")
      .eq("user_id", user.id),
    supabase
      .from("users")
      .select("id, name")
      .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
      .eq("is_active", true),
    supabase.from("operators").select("id, name").order("name"),
  ])
  t.mark("parallel queries (user_agencies + sellers + operators)")

  const userAgencies = userAgenciesRes.data
  const sellers = sellersRes.data
  const operators = operatorsRes.data

  const agencies = (userAgencies || []).map((ua: any) => ({
    id: ua.agency_id,
    name: ua.agencies?.name || "Sin nombre",
  }))

  t.end(`agencies=${agencies.length} sellers=${sellers?.length ?? 0} operators=${operators?.length ?? 0}`)

  return (
    <OperationsPageClient
      sellers={(sellers || []).map((s: any) => ({ id: s.id, name: s.name }))}
      agencies={agencies}
      operators={(operators || []).map((o: any) => ({ id: o.id, name: o.name }))}
      userRole={user.role}
      userId={user.id}
      canViewAgencyOperationsSupport={Boolean(user.can_view_agency_operations_support)}
      userAgencyIds={agencies.map((a) => a.id)}
      defaultAgencyId={agencies[0]?.id}
      defaultSellerId={
        user.role === "SELLER" && !user.can_view_agency_operations_support
          ? user.id
          : undefined
      }
    />
  )
}
