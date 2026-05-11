import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

/**
 * GET /api/search?q=<term>
 *
 * Búsqueda global del ⌘K. Multi-tenant safe (respeta org_id + role +
 * agency_ids del user).
 *
 * 2026-05-06: refactor para usar RPC `search_global_unaccent` con extension
 * `unaccent` (migration 20260506000002). Bug previo: ILIKE directo no
 * normalizaba acentos, "cancun" no encontraba "Cancún". El usuario tipea
 * sin tildes el 99% del tiempo. La RPC normaliza ambos lados (column +
 * query) con `lower(unaccent(...))` antes del LIKE.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ results: [] })
    }

    const agencyIds = await getUserAgencyIds(
      supabase,
      user.id,
      user.role as any
    )

    const { data, error } = await (supabase.rpc as any)(
      "search_global_unaccent",
      {
        p_query: query.trim(),
        p_user_id: user.id,
        p_org_id: user.org_id || null,
        p_role: user.role,
        p_agency_ids: agencyIds,
      }
    )

    if (error) {
      console.error("[Search API] RPC error:", error.message)
      return NextResponse.json({ results: [] })
    }

    const rows = (data || []) as Array<{
      id: string
      result_type: "customer" | "operation" | "operator" | "lead"
      title: string
      subtitle: string
      file_code: string | null
      destination: string | null
      status: string | null
      email: string | null
      phone: string | null
      reservation_code_air: string | null
      reservation_code_hotel: string | null
      passenger_name: string | null
    }>

    const queryLower = query.toLowerCase()
    const statusOpLabels: Record<string, string> = {
      RESERVED: "Reservado",
      CONFIRMED: "Confirmado",
      CANCELLED: "Cancelado",
      TRAVELLING: "En viaje",
      TRAVELLED: "Viajado",
    }
    const statusLeadLabels: Record<string, string> = {
      NEW: "Nuevo",
      IN_PROGRESS: "En Progreso",
      QUOTED: "Cotizado",
      WON: "Ganado",
      LOST: "Perdido",
    }

    const seen = new Set<string>()
    const results: Array<{
      id: string
      type: string
      title: string
      subtitle?: string
    }> = []

    for (const r of rows) {
      // Dedup por (id, type) — passenger_results y operation_results
      // pueden devolver la misma operation. Preferimos passenger_name
      // como title si llegó primero.
      const key = `${r.result_type}:${r.id}`
      if (seen.has(key)) continue
      seen.add(key)

      if (r.result_type === "operation") {
        let title = r.title
        // Si el query matchea un código de reserva, mostrarlo en el título
        if (
          r.reservation_code_air &&
          r.reservation_code_air.toLowerCase().includes(queryLower)
        ) {
          title = `Cod. Aéreo: ${r.reservation_code_air}`
        } else if (
          r.reservation_code_hotel &&
          r.reservation_code_hotel.toLowerCase().includes(queryLower)
        ) {
          title = `Cod. Hotel: ${r.reservation_code_hotel}`
        } else if (r.passenger_name) {
          title = `${r.passenger_name} - ${r.file_code || "Sin código"}`
        }

        const subtitleParts: string[] = []
        if (r.destination) subtitleParts.push(r.destination)
        if (r.reservation_code_air)
          subtitleParts.push(`Rva Aéreo: ${r.reservation_code_air}`)
        if (r.reservation_code_hotel)
          subtitleParts.push(`Rva Hotel: ${r.reservation_code_hotel}`)
        if (r.status) subtitleParts.push(statusOpLabels[r.status] || r.status)

        results.push({
          id: r.id,
          type: "operation",
          title,
          subtitle: subtitleParts.join(" - "),
        })
      } else if (r.result_type === "customer") {
        results.push({
          id: r.id,
          type: "customer",
          title: r.title.trim() || "Sin nombre",
          subtitle: r.subtitle,
        })
      } else if (r.result_type === "operator") {
        results.push({
          id: r.id,
          type: "operator",
          title: r.title,
          subtitle: r.subtitle,
        })
      } else if (r.result_type === "lead") {
        results.push({
          id: r.id,
          type: "lead",
          title: r.title,
          subtitle: `${r.destination || "Sin destino"} - ${
            statusLeadLabels[r.status || ""] || r.status || ""
          }`,
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error: any) {
    console.error("[Search API] Error:", error)
    return NextResponse.json({ results: [] })
  }
}
