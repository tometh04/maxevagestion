import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { AdvancedKanbanClient } from "./advanced-kanban-client"

interface AdvancedCRMKanbanProps {
  orgId: string
}

export async function AdvancedCRMKanban({ orgId }: AdvancedCRMKanbanProps) {
  const supabase = await createServerClient()
  const { user } = await getCurrentUser()

  // Solo ADMIN/SUPER_ADMIN ven el filtro de vendedor (CONTABLE/VIEWER no
  // necesitan filtrar por seller; ya ven todo en read-only). El RBAC de "SELLER
  // solo ve los suyos" ahora vive en el endpoint /api/leads/advanced-kanban.
  const role = (user as { role?: string } | null)?.role
  const canFilterBySeller = role === "ADMIN" || role === "SUPER_ADMIN"

  // VIB-61 (audit): los LEADS ya NO se cargan acá. Antes se traían con
  // .limit(500) y el client contaba sobre eso → con 2.400+ leads en 7 funnels el
  // header/badges mentían y los leads viejos desaparecían. Ahora el client los
  // pide lazy por columna (funnel) con conteos exactos vía /api/leads/advanced-kanban.
  // Acá solo cargamos la config del tablero (funnels, tags, agencias, etc.).
  const [
    funnelsResult,
    categoriesResult,
    agenciesResult,
    sellersResult,
    operatorsResult,
  ] = await Promise.all([
    supabase
      .from("lead_funnels")
      .select("id, name, color, display_order")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true }),

    supabase
      .from("lead_tag_categories")
      .select("id, name, color, lead_tags(id, label)")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true }),

    supabase.from("agencies").select("id, name").eq("org_id", orgId),

    // Sellers de la org (todos los users con rol vendedor/admin)
    supabase
      .from("users")
      .select("id, name")
      .eq("org_id", orgId)
      .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN", "POST_VENTA"])
      .eq("is_active", true),

    // Operators (catálogo de la org para conversión a operación)
    (supabase.from("operators") as any)
      .select("id, name, admin_fee_percentage")
      .eq("org_id", orgId)
      .order("name"),
  ])

  const allFunnels = funnelsResult.data ?? []
  const rawCategories = categoriesResult.data ?? []
  const agencies = agenciesResult.data ?? []
  const sellers = sellersResult.data ?? []
  const operators = operatorsResult.data ?? []

  const categories = rawCategories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    tags: (c.lead_tags as Array<{ id: string; label: string }> | null) ?? [],
  }))

  return (
    <AdvancedKanbanClient
      categories={categories}
      funnels={allFunnels}
      orgId={orgId}
      agencies={agencies as Array<{ id: string; name: string }>}
      sellers={sellers as Array<{ id: string; name: string }>}
      operators={
        operators as Array<{
          id: string
          name: string
          admin_fee_percentage?: number | null
        }>
      }
      canFilterBySeller={canFilterBySeller}
    />
  )
}
