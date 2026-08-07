import { headers } from "next/headers"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { OperationsPageClient } from "@/components/operations/operations-page-client"
import { canAccessModule, isIndependentAdvisor } from "@/lib/permissions"
import {
  canAssignSecondarySeller,
  canCreateOperationsForOtherSellers,
  hasAgencyOperationsSupportView,
} from "@/lib/permissions-api"
import { makeTimer } from "@/lib/perf-log"
import {
  SELLER_OPTION_ROLES,
  SELLER_OPTION_SELECT,
  toSellerOptions,
  type SellerOption,
} from "@/lib/sellers/seller-option"

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
  // 🔴 CROSS-TENANT FIX (2026-05-21): filtro explícito por org_id en sellers
  // y operators — ver CLAUDE.md regla de oro multi-tenant.
  const [userAgenciesRes, sellersRes, operatorsRes] = await Promise.all([
    supabase
      .from("user_agencies")
      .select("agency_id, agencies(id, name)")
      .eq("user_id", user.id),
    supabase
      .from("users")
      .select(SELLER_OPTION_SELECT)
      .in("role", SELLER_OPTION_ROLES)
      .eq("is_active", true)
      .eq("org_id", (user as any).org_id),
    supabase
      .from("operators")
      .select("id, name")
      .eq("org_id", (user as any).org_id)
      .order("name"),
  ])
  t.mark("parallel queries (user_agencies + sellers + operators)")

  const userAgencies = userAgenciesRes.data
  const sellers = sellersRes.data
  const operators = operatorsRes.data

  const agencies = (userAgencies || []).map((ua: any) => ({
    id: ua.agency_id,
    name: ua.agencies?.name || "Sin nombre",
  }))
  const agencyIds = agencies.map((a) => a.id)

  // Un SELLER sólo puede cargar a nombre de otro vendedor si tiene el permiso
  // `can_create_operations_for_other_sellers`, y sólo hacia vendedores de sus
  // mismas agencias. El backend es la fuente de verdad (POST /api/operations);
  // acá acotamos la lista y el estado del selector por UX.
  const isSeller = user.role === "SELLER"
  const canPickOtherSeller = isSeller
    ? canCreateOperationsForOtherSellers(user as any)
    : true

  // `sellers` se mantiene completo: también alimenta el dropdown de filtros y la
  // tabla. `creatableSellers` es exclusivo del diálogo de alta y sí se acota.
  // El porcentaje viaja hasta el diálogo: sin él, el reparto de una venta
  // compartida se calculaba sobre 0 (VIB-63).
  //
  // VIB-69: al asesor independiente ni siquiera le mandamos la lista de
  // vendedores de la agencia — solo ve operaciones propias, así que el filtro no
  // le sirve para nada y los nombres del equipo no son información suya.
  const allSellerOptions: SellerOption[] = toSellerOptions(sellers)
  const sellerOptions: SellerOption[] = isIndependentAdvisor(user)
    ? allSellerOptions.filter((s) => s.id === user.id)
    : allSellerOptions
  //
  // VIB-105: el VENDEDOR SECUNDARIO no depende de ese permiso. Compartir una
  // venta con un compañero de la agencia es algo que hace cualquier vendedor:
  // la operación sigue siendo suya, sólo parte la comisión. Por eso la lista de
  // secundarios se acota por agencia pero NO por
  // `can_create_operations_for_other_sellers`.
  let creatableSellers = sellerOptions
  let secondarySellers = sellerOptions
  if (isSeller) {
    // Vendedores que comparten agencia con el usuario (más él mismo).
    let agencyScopedSellers = sellerOptions.filter((s) => s.id === user.id)
    if (agencyIds.length > 0) {
      const { data: agencyMembers } = await supabase
        .from("user_agencies")
        .select("user_id")
        .in("agency_id", agencyIds)
      const memberIds = new Set((agencyMembers || []).map((m: any) => m.user_id as string))
      agencyScopedSellers = sellerOptions.filter((s) => memberIds.has(s.id) || s.id === user.id)
    }
    // El asesor independiente ya llega con `sellerOptions` reducido a sí mismo,
    // así que no ve compañeros ni como principal ni como secundario.
    secondarySellers = agencyScopedSellers
    // Principal: sólo a sí mismo si no tiene el permiso especial.
    creatableSellers = canPickOtherSeller
      ? agencyScopedSellers
      : sellerOptions.filter((s) => s.id === user.id)
  }

  t.end(`agencies=${agencies.length} sellers=${sellerOptions.length} operators=${operators?.length ?? 0}`)

  return (
    <OperationsPageClient
      sellers={sellerOptions}
      creatableSellers={creatableSellers}
      secondarySellers={secondarySellers}
      canPickSecondarySeller={canAssignSecondarySeller(user as any)}
      agencies={agencies}
      operators={(operators || []).map((o: any) => ({ id: o.id, name: o.name }))}
      userRole={user.role}
      userId={user.id}
      canViewAgencyOperationsSupport={hasAgencyOperationsSupportView(user as any)}
      canPickOtherSeller={canPickOtherSeller}
      userAgencyIds={agencyIds}
      defaultAgencyId={agencies[0]?.id}
      defaultSellerId={
        // Preseleccionar (y bloquear) al propio vendedor cuando no puede elegir
        // otro, o cuando es un SELLER común sin vista de postventa.
        isSeller && (!canPickOtherSeller || !user.can_view_agency_operations_support)
          ? user.id
          : undefined
      }
    />
  )
}
