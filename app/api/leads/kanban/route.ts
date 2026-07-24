import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, assertPermission } from "@/lib/permissions-agency"

/**
 * VIB-61 — CRM Ventas lazy por columna.
 *
 * Reemplaza el patrón viejo de "cargar TODO el pipeline al cliente y contar
 * client-side" (que no escalaba: ~9.600 leads activos en org grandes). Expone:
 *
 *  - GET ?mode=counts&agencyId=…            → { columns: [{ key, count }] }
 *      Conteo EXACTO por columna (headers). Sin ventana de recencia: son los
 *      totales reales por columna (respetan status/region/search).
 *  - GET ?mode=column&agencyId=…&key=…&page=&limit=&includeOld=1
 *      → { leads, hasMore }
 *      Leads de UNA columna, paginados (updated_at desc). Por defecto acota a los
 *      últimos `windowDays` días; con includeOld=1 trae también los viejos.
 *
 * Scope multi-tenant (regla de oro: no confiar solo en RLS): la org y las
 * agencias permitidas se resuelven en el server (getCurrentUser + getUserAgencyIds)
 * y se pasan explícitas a las RPCs. El agencyId del query se intersecta con las
 * agencias del user; nunca se confía tal cual.
 */

const DEFAULT_WINDOW_DAYS = 90
const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100

function nullIfAll(v: string | null): string | null {
  return v && v !== "ALL" ? v : null
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const orgId = (user as any).org_id as string

    const supabase = await createServerClient()
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Permiso de lectura de leads (mismo contrato que la página del CRM).
    const perms = await resolveUserPermissions(supabase as any, user.id, orgId, user.role, agencyIds)
    if (!assertPermission(user.role, perms, "leads", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver leads" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    // Scope de agencias efectivo. "ALL" → todas las del user; específica →
    // intersección con las del user (defense-in-depth).
    const agencyIdParam = nullIfAll(searchParams.get("agencyId"))
    let effectiveAgencyIds: string[]
    if (agencyIdParam) {
      effectiveAgencyIds = agencyIds.includes(agencyIdParam) ? [agencyIdParam] : []
    } else {
      effectiveAgencyIds = agencyIds
    }

    // Sin agencias en scope → nada (no leak).
    if (effectiveAgencyIds.length === 0) {
      const mode = searchParams.get("mode")
      return NextResponse.json(mode === "column" ? { leads: [], hasMore: false } : { columns: [] })
    }

    const status = nullIfAll(searchParams.get("status"))
    const region = nullIfAll(searchParams.get("region"))
    const searchRaw = (searchParams.get("search") || "").trim()
    const search = searchRaw.length > 0 ? searchRaw : null

    // Filtro EXPLÍCITO de fecha de creación (feature flag "created_at" de Lozada).
    const createdFromRaw = (searchParams.get("createdFrom") || "").trim()
    const createdToRaw = (searchParams.get("createdTo") || "").trim()
    const explicitCreatedFrom = createdFromRaw ? new Date(createdFromRaw).toISOString() : null
    const explicitCreatedTo = createdToRaw ? new Date(createdToRaw).toISOString() : null

    const includeOld = searchParams.get("includeOld") === "1"

    // Ventana de recencia COMPARTIDA entre counts y column: el conteo del header
    // tiene que reflejar exactamente lo que se puede cargar. Si el header
    // contara el total histórico pero las cards solo trajeran los últimos 90d,
    // "Cargar más" quedaría muerto para los leads viejos (VIB-61).
    //   - Filtro explícito de fecha → manda ese (afecta header y cards).
    //   - Si no, y sin includeOld → ventana de 90d por defecto.
    //   - includeOld=1 → sin cota (trae y cuenta todo el histórico).
    let createdFrom: string | null = explicitCreatedFrom
    if (!explicitCreatedFrom && !includeOld) {
      const windowDays = Math.max(1, parseInt(searchParams.get("windowDays") || String(DEFAULT_WINDOW_DAYS)))
      const d = new Date()
      d.setDate(d.getDate() - windowDays)
      createdFrom = d.toISOString()
    }
    const createdTo: string | null = explicitCreatedTo

    const mode = searchParams.get("mode") || "counts"

    if (mode === "counts") {
      const { data, error } = await (supabase as any).rpc("crm_kanban_column_counts", {
        p_org_id: orgId,
        p_agency_ids: effectiveAgencyIds,
        p_status: status,
        p_region: region,
        p_search: search,
        p_created_from: createdFrom,
        p_created_to: createdTo,
      })
      if (error) {
        console.error("Error crm_kanban_column_counts:", error)
        return NextResponse.json({ error: "Error al contar leads" }, { status: 500 })
      }
      const columns = ((data || []) as Array<{ column_key: string; cnt: number }>).map((r) => ({
        key: r.column_key,
        count: Number(r.cnt) || 0,
      }))
      return NextResponse.json({ columns })
    }

    // mode === "column"
    const key = searchParams.get("key")
    if (!key) {
      return NextResponse.json({ error: "Falta el parámetro key" }, { status: 400 })
    }
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE))), MAX_PAGE_SIZE)
    const offset = (page - 1) * limit

    // Pedimos limit+1 para saber si hay más sin un count extra.
    const { data, error } = await (supabase as any).rpc("crm_kanban_column_leads", {
      p_org_id: orgId,
      p_agency_ids: effectiveAgencyIds,
      p_column_key: key,
      p_limit: limit + 1,
      p_offset: offset,
      p_status: status,
      p_region: region,
      p_search: search,
      p_created_from: createdFrom,
      p_created_to: createdTo,
    })
    if (error) {
      console.error("Error crm_kanban_column_leads:", error)
      return NextResponse.json({ error: "Error al obtener leads" }, { status: 500 })
    }

    let rows = (data || []) as any[]
    const hasMore = rows.length > limit
    if (hasMore) rows = rows.slice(0, limit)

    // Enriquecer con nombres de vendedor y agencia (la RPC devuelve la fila cruda
    // de leads sin joins). Consultas chicas acotadas a la página, scopeadas por org.
    const sellerIds = Array.from(new Set(rows.map((r) => r.assigned_seller_id).filter(Boolean)))
    const agencyIdsInPage = Array.from(new Set(rows.map((r) => r.agency_id).filter(Boolean)))
    const [sellersRes, agenciesRes] = await Promise.all([
      sellerIds.length
        ? (supabase.from("users") as any).select("id, name, email").in("id", sellerIds).eq("org_id", orgId)
        : Promise.resolve({ data: [] }),
      agencyIdsInPage.length
        ? (supabase.from("agencies") as any).select("id, name").in("id", agencyIdsInPage).eq("org_id", orgId)
        : Promise.resolve({ data: [] }),
    ])
    const sellerById = new Map((sellersRes.data || []).map((u: any) => [u.id, u]))
    const agencyById = new Map((agenciesRes.data || []).map((a: any) => [a.id, a]))

    const leads = rows.map((r) => {
      const s = sellerById.get(r.assigned_seller_id) as any
      const a = agencyById.get(r.agency_id) as any
      // No mandar al browser los JSON gigantes (los diálogos no los usan para
      // renderizar). Reduce el payload aunque la RPC devuelva la fila completa.
      const { manychat_full_data, trello_full_data, ...lean } = r
      return {
        ...lean,
        users: s ? { name: s.name, email: s.email } : null,
        agencies: a ? { name: a.name } : null,
      }
    })

    return NextResponse.json({ leads, hasMore })
  } catch (error) {
    console.error("Error in GET /api/leads/kanban:", error)
    return NextResponse.json({ error: "Error al obtener leads" }, { status: 500 })
  }
}
