import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase: any = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const sellerId = searchParams.get("sellerId")
    const agencyId = searchParams.get("agencyId")

    // ── Base query con filtros ──
    let query = supabase
      .from("quotations")
      .select(`
        id,
        status,
        total_amount,
        currency,
        destination,
        region,
        created_at,
        valid_until,
        seller_id,
        agency_id,
        lead_id,
        seller:seller_id(id, name),
        quotation_options(id, total_amount, is_selected)
      `)

    // Filtro de rol
    if (user.role === "SELLER") {
      query = query.eq("seller_id", user.id)
    } else if (sellerId && sellerId !== "ALL") {
      query = query.eq("seller_id", sellerId)
    }

    if (agencyId && agencyId !== "ALL") {
      query = query.eq("agency_id", agencyId)
    }

    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00`)
    }
    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59`)
    }

    const { data: quotations, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching quotation analytics:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── Calcular métricas ──
    const total = quotations.length
    const byStatus: Record<string, number> = {}
    const bySeller: Record<string, { name: string; total: number; sent: number; approved: number; converted: number }> = {}
    const byDestination: Record<string, number> = {}
    const byRegion: Record<string, number> = {}
    const byMonth: Record<string, { total: number; approved: number }> = {}
    let totalAmountUSD = 0
    let totalAmountARS = 0
    let approvedAmountUSD = 0
    let approvedAmountARS = 0
    let totalResponseTimeMs = 0
    let responseTimeCount = 0

    for (const q of quotations) {
      // Por status
      byStatus[q.status] = (byStatus[q.status] || 0) + 1

      // Por vendedor
      const sellerName = q.seller?.name || "Sin asignar"
      const sid = q.seller_id || "none"
      if (!bySeller[sid]) {
        bySeller[sid] = { name: sellerName, total: 0, sent: 0, approved: 0, converted: 0 }
      }
      bySeller[sid].total++
      if (q.status === "SENT") bySeller[sid].sent++
      if (q.status === "APPROVED") bySeller[sid].approved++
      if (q.status === "CONVERTED") {
        bySeller[sid].approved++
        bySeller[sid].converted++
      }

      // Por destino
      if (q.destination) {
        byDestination[q.destination] = (byDestination[q.destination] || 0) + 1
      }

      // Por region
      if (q.region) {
        byRegion[q.region] = (byRegion[q.region] || 0) + 1
      }

      // Por mes
      const month = q.created_at.substring(0, 7) // YYYY-MM
      if (!byMonth[month]) byMonth[month] = { total: 0, approved: 0 }
      byMonth[month].total++
      if (q.status === "APPROVED" || q.status === "CONVERTED") {
        byMonth[month].approved++
      }

      // Montos totales
      if (q.currency === "USD") {
        totalAmountUSD += Number(q.total_amount) || 0
        if (q.status === "APPROVED" || q.status === "CONVERTED") {
          approvedAmountUSD += Number(q.total_amount) || 0
        }
      } else {
        totalAmountARS += Number(q.total_amount) || 0
        if (q.status === "APPROVED" || q.status === "CONVERTED") {
          approvedAmountARS += Number(q.total_amount) || 0
        }
      }
    }

    // Tasa de conversión
    const sentOrMore = (byStatus["SENT"] || 0) + (byStatus["APPROVED"] || 0) + (byStatus["CONVERTED"] || 0) + (byStatus["REJECTED"] || 0) + (byStatus["EXPIRED"] || 0)
    const approvedOrConverted = (byStatus["APPROVED"] || 0) + (byStatus["CONVERTED"] || 0)
    const conversionRate = sentOrMore > 0 ? (approvedOrConverted / sentOrMore) * 100 : 0

    // Top destinos (top 10)
    const topDestinations = Object.entries(byDestination)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([destination, count]) => ({ destination, count }))

    // Sellers ranking
    const sellerStats = Object.values(bySeller)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    // Monthly trend (last 6 months)
    const monthlyTrend = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, data]) => ({
        month,
        total: data.total,
        approved: data.approved,
        rate: data.total > 0 ? Math.round((data.approved / data.total) * 100) : 0,
      }))

    // Regions
    const regionStats = Object.entries(byRegion)
      .sort((a, b) => b[1] - a[1])
      .map(([region, count]) => ({ region, count }))

    return NextResponse.json({
      data: {
        summary: {
          total,
          byStatus,
          conversionRate: Math.round(conversionRate * 10) / 10,
          totalAmountUSD,
          totalAmountARS,
          approvedAmountUSD,
          approvedAmountARS,
          drafts: byStatus["DRAFT"] || 0,
          sent: byStatus["SENT"] || 0,
          approved: approvedOrConverted,
          rejected: byStatus["REJECTED"] || 0,
          expired: byStatus["EXPIRED"] || 0,
        },
        topDestinations,
        sellerStats,
        monthlyTrend,
        regionStats,
      },
    })
  } catch (error: any) {
    if (error?.digest === "NEXT_REDIRECT") throw error
    console.error("Error in quotation analytics:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
