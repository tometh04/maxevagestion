import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns"
import { es } from "date-fns/locale"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const agencyId = searchParams.get("agencyId")
    const months = parseInt(searchParams.get("months") || "12")

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Query de leads
    let leadsQuery = (supabase.from("leads") as any)
      .select(`
        id,
        status,
        source,
        region,
        destination,
        created_at,
        assigned_seller_id,
        has_deposit,
        deposit_amount,
        agency_id,
        users!leads_assigned_seller_id_fkey (
          id,
          first_name,
          last_name
        )
      `)

    // Filtrar por agencia
    if (agencyId && agencyId !== "ALL") {
      leadsQuery = leadsQuery.eq("agency_id", agencyId)
    } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      leadsQuery = leadsQuery.in("agency_id", agencyIds)
    }

    const { data: leads, error: leadsError } = await leadsQuery

    if (leadsError) {
      console.error("Error fetching leads:", leadsError)
      return NextResponse.json({ error: "Error al obtener leads" }, { status: 500 })
    }

    const now = new Date()

    // Pipeline de ventas (por estado)
    const pipeline: Record<string, { status: string, label: string, count: number, value: number }> = {
      NEW: { status: "NEW", label: "Nuevo", count: 0, value: 0 },
      IN_PROGRESS: { status: "IN_PROGRESS", label: "En Progreso", count: 0, value: 0 },
      QUOTED: { status: "QUOTED", label: "Cotizado", count: 0, value: 0 },
      WON: { status: "WON", label: "Ganado", count: 0, value: 0 },
      LOST: { status: "LOST", label: "Perdido", count: 0, value: 0 },
    }

    // Por origen (source)
    const bySource: Record<string, { source: string, count: number, won: number, conversionRate: number }> = {
      Instagram: { source: "Instagram", count: 0, won: 0, conversionRate: 0 },
      WhatsApp: { source: "WhatsApp", count: 0, won: 0, conversionRate: 0 },
      "Meta Ads": { source: "Meta Ads", count: 0, won: 0, conversionRate: 0 },
      Other: { source: "Otro", count: 0, won: 0, conversionRate: 0 },
    }

    // Por región
    const byRegion: Record<string, { region: string, count: number, won: number }> = {}

    // Por vendedor
    const bySeller: Record<string, { id: string, name: string, leads: number, won: number, conversionRate: number }> = {}

    // Por mes
    const monthlyStats: Record<string, {
      month: string
      monthName: string
      newLeads: number
      wonLeads: number
      lostLeads: number
    }> = {}

    // Inicializar meses
    for (let i = 0; i < months; i++) {
      const date = subMonths(now, months - 1 - i)
      const key = format(date, "yyyy-MM")
      monthlyStats[key] = {
        month: key,
        monthName: format(date, "MMM yy", { locale: es }),
        newLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
      }
    }

    // Procesar leads
    let totalLeads = 0
    let totalWon = 0
    let totalLost = 0
    let totalDeposits = 0

    for (const lead of leads || []) {
      totalLeads++

      // Pipeline
      if (pipeline[lead.status]) {
        pipeline[lead.status].count++
        if (lead.has_deposit && lead.deposit_amount) {
          pipeline[lead.status].value += parseFloat(lead.deposit_amount) || 0
          totalDeposits += parseFloat(lead.deposit_amount) || 0
        }
      }

      // Por estado
      if (lead.status === "WON") totalWon++
      if (lead.status === "LOST") totalLost++

      // Por origen
      const source = lead.source || "Other"
      if (bySource[source]) {
        bySource[source].count++
        if (lead.status === "WON") bySource[source].won++
      }

      // Por región
      const region = lead.region || "OTROS"
      if (!byRegion[region]) {
        byRegion[region] = { region, count: 0, won: 0 }
      }
      byRegion[region].count++
      if (lead.status === "WON") byRegion[region].won++

      // Por vendedor
      if (lead.assigned_seller_id) {
        const seller = lead.users as any
        if (!bySeller[lead.assigned_seller_id]) {
          bySeller[lead.assigned_seller_id] = {
            id: lead.assigned_seller_id,
            name: seller ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim() : 'Sin nombre',
            leads: 0,
            won: 0,
            conversionRate: 0,
          }
        }
        bySeller[lead.assigned_seller_id].leads++
        if (lead.status === "WON") bySeller[lead.assigned_seller_id].won++
      }

      // Por mes
      if (lead.created_at) {
        const monthKey = format(new Date(lead.created_at), "yyyy-MM")
        if (monthlyStats[monthKey]) {
          monthlyStats[monthKey].newLeads++
          if (lead.status === "WON") monthlyStats[monthKey].wonLeads++
          if (lead.status === "LOST") monthlyStats[monthKey].lostLeads++
        }
      }
    }

    // Calcular tasas de conversión
    Object.values(bySource).forEach(s => {
      s.conversionRate = s.count > 0 ? (s.won / s.count) * 100 : 0
    })

    Object.values(bySeller).forEach(s => {
      s.conversionRate = s.leads > 0 ? (s.won / s.leads) * 100 : 0
    })

    // Conversion rate general
    const overallConversionRate = totalLeads > 0 ? (totalWon / totalLeads) * 100 : 0

    // Top vendedores por conversión
    const topSellers = Object.values(bySeller)
      .filter(s => s.leads >= 5) // Mínimo 5 leads para ser considerado
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 5)

    // Top orígenes
    const topSources = Object.values(bySource)
      .filter(s => s.count > 0)
      .sort((a, b) => b.conversionRate - a.conversionRate)

    // Top regiones
    const topRegions = Object.values(byRegion)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    // Leads activos (no ganados ni perdidos)
    const activeLeads = totalLeads - totalWon - totalLost

    // Leads este mes
    const thisMonth = format(now, "yyyy-MM")
    const newThisMonth = monthlyStats[thisMonth]?.newLeads || 0

    return NextResponse.json({
      overview: {
        totalLeads,
        activeLeads,
        wonLeads: totalWon,
        lostLeads: totalLost,
        conversionRate: Math.round(overallConversionRate * 10) / 10,
        totalDeposits,
        newThisMonth,
      },
      pipeline: Object.values(pipeline),
      distributions: {
        bySource: topSources,
        byRegion: topRegions,
        bySeller: topSellers,
      },
      trends: {
        monthly: Object.values(monthlyStats),
      },
      rankings: {
        topSellers,
        topSources,
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/sales/statistics:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener estadísticas" },
      { status: 500 }
    )
  }
}
