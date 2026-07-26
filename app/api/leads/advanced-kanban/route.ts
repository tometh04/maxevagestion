import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * VIB-61 (audit) — CRM "advanced" (VICO) lazy por columna (funnel).
 *
 * Reemplaza el patrón de "traer .limit(500) y contar client-side": con 2.400+
 * leads en 7 funnels, el header y los badges por etapa mentían y los leads
 * fuera del top-500 desaparecían. Expone:
 *   - GET ?mode=counts   → { funnelCounts: {<funnelId>: n}, total }  (exactos)
 *   - GET ?mode=column&funnelId=…&page=&limit=  → { leads, hasMore }
 *
 * Scope (regla de oro, no confiar solo en RLS): org del server + RBAC de rol
 * (SELLER/POST_VENTA solo sus leads) + filtro opcional de vendedor (solo
 * ADMIN/SUPER_ADMIN) + filtro de tags (AND) resuelto server-side.
 */

const DEFAULT_PAGE_SIZE = 40
const MAX_PAGE_SIZE = 100
const UNASSIGNED = "__unassigned__"

const LEAD_SELECT = `id, contact_name, contact_phone, contact_email, contact_instagram,
  destination, region, status, source,
  trello_url, trello_list_id, trello_full_data,
  assigned_seller_id, agency_id,
  created_at, updated_at, notes,
  quoted_price, has_deposit, deposit_amount, deposit_currency,
  deposit_method, deposit_date,
  archived_at, funnel_id,
  agencies(name),
  users:assigned_seller_id(name, email),
  assigned_seller:assigned_seller_id(name),
  tag_assignments:lead_tag_assignments(tag:tag_id(id, label, category:category_id(name, color))),
  operations(id, file_code, destination, status, created_at, departure_date, sale_amount_total)`

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const orgId = (user as any).org_id
    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const role = (user as any).role as string | undefined
    const restrictToOwnLeads = (role === "SELLER" || role === "POST_VENTA") && !!user.id
    const canFilterBySeller = role === "ADMIN" || role === "SUPER_ADMIN"

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Filtro de vendedor (solo lo aplican los que pueden filtrar).
    const sellerParam = searchParams.get("sellerId")

    // Filtro de tags (AND): resolvemos los lead_id que tienen TODAS las tags
    // seleccionadas y después acotamos por esos ids. Filtrar el AND directo en
    // PostgREST no es viable, así que lo resolvemos acá.
    const tagsRaw = (searchParams.get("tags") || "").trim()
    const tagIds = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : []
    let tagLeadIds: string[] | null = null
    if (tagIds.length > 0) {
      const { data: rows } = await (supabase.from("lead_tag_assignments") as any)
        .select("lead_id, tag_id")
        .in("tag_id", tagIds)
      const byLead = new Map<string, Set<string>>()
      for (const r of (rows || []) as any[]) {
        if (!byLead.has(r.lead_id)) byLead.set(r.lead_id, new Set())
        byLead.get(r.lead_id)!.add(r.tag_id)
      }
      tagLeadIds = Array.from(byLead.entries())
        .filter(([, set]) => tagIds.every((t) => set.has(t)))
        .map(([leadId]) => leadId)
      // Ningún lead matchea todas las tags → resultado vacío.
      if (tagLeadIds.length === 0) {
        const mode = searchParams.get("mode")
        return NextResponse.json(mode === "column" ? { leads: [], hasMore: false } : { funnelCounts: {}, total: 0 })
      }
    }

    // Scope base compartido por counts y column.
    const applyScope = (q: any) => {
      let x = q
        .eq("org_id", orgId)
        .not("funnel_id", "is", null)
        .is("archived_at", null)
      if (restrictToOwnLeads) x = x.eq("assigned_seller_id", user.id)
      else if (canFilterBySeller && sellerParam && sellerParam !== "__all__") {
        if (sellerParam === UNASSIGNED) x = x.is("assigned_seller_id", null)
        else x = x.eq("assigned_seller_id", sellerParam)
      }
      if (tagLeadIds) x = x.in("id", tagLeadIds)
      return x
    }

    const mode = searchParams.get("mode") || "counts"

    if (mode === "counts") {
      // Traemos solo funnel_id (liviano) de todo el set filtrado y agregamos.
      const counts: Record<string, number> = {}
      let total = 0
      const PAGE = 1000
      for (let from = 0; from <= 200000; from += PAGE) {
        const { data, error } = await applyScope((supabase.from("leads") as any).select("funnel_id"))
          .range(from, from + PAGE - 1)
        if (error) {
          console.error("advanced-kanban counts:", error)
          return NextResponse.json({ error: "Error al contar leads" }, { status: 500 })
        }
        const rows = (data || []) as Array<{ funnel_id: string | null }>
        for (const r of rows) {
          if (!r.funnel_id) continue
          counts[r.funnel_id] = (counts[r.funnel_id] || 0) + 1
          total++
        }
        if (rows.length < PAGE) break
      }
      return NextResponse.json({ funnelCounts: counts, total })
    }

    // mode === "column"
    const funnelId = searchParams.get("funnelId")
    if (!funnelId) {
      return NextResponse.json({ error: "Falta el parámetro funnelId" }, { status: 400 })
    }
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE))), MAX_PAGE_SIZE)
    const offset = (page - 1) * limit

    const { data, error } = await applyScope((supabase.from("leads") as any).select(LEAD_SELECT))
      .eq("funnel_id", funnelId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit) // limit+1 para saber si hay más
    if (error) {
      console.error("advanced-kanban column:", error)
      return NextResponse.json({ error: "Error al obtener leads" }, { status: 500 })
    }
    let rows = (data || []) as any[]
    const hasMore = rows.length > limit
    if (hasMore) rows = rows.slice(0, limit)

    return NextResponse.json({ leads: rows, hasMore })
  } catch (error) {
    console.error("Error in GET /api/leads/advanced-kanban:", error)
    return NextResponse.json({ error: "Error al obtener leads" }, { status: 500 })
  }
}
