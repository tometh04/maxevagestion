import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { subMonths, startOfMonth, endOfMonth, format, parseISO, differenceInDays, eachDayOfInterval, startOfDay, endOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const agencyId = searchParams.get("agencyId")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")

    // Si no hay fechas, usar últimos 30 días por defecto
    const now = new Date()
    const defaultFrom = startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
    const defaultTo = endOfDay(now)

    const filterFrom = dateFrom ? parseISO(dateFrom) : defaultFrom
    const filterTo = dateTo ? parseISO(dateTo) : defaultTo

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Query de leads (excluir archivados)
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
        archived_at
      `)
      .gte("created_at", filterFrom.toISOString())
      .lte("created_at", filterTo.toISOString())
      .is("archived_at", null)

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

    // Obtener IDs de leads que tienen operación asociada (= convertidos)
    const leadIds = (leads || []).map((l: any) => l.id)
    const convertedLeadIds = new Set<string>()

    if (leadIds.length > 0) {
      // Consultar operaciones que referencian estos leads
      // Hacer en batches de 500 para evitar límites de Supabase
      const batchSize = 500
      for (let i = 0; i < leadIds.length; i += batchSize) {
        const batch = leadIds.slice(i, i + batchSize)
        const { data: ops } = await supabase
          .from("operations")
          .select("lead_id")
          .in("lead_id", batch)
          .not("lead_id", "is", null)

        if (ops) {
          ops.forEach((op: any) => {
            if (op.lead_id) convertedLeadIds.add(op.lead_id)
          })
        }
      }
    }

    // Obtener vendedores
    const sellerIds = Array.from(new Set((leads || []).map((lead: any) => lead.assigned_seller_id).filter(Boolean)))
    let sellersMap: Record<string, string> = {}

    if (sellerIds.length > 0) {
      const { data: sellers } = await supabase
        .from("users")
        .select("id, name")
        .in("id", sellerIds)

      if (sellers) {
        sellers.forEach((s: any) => {
          sellersMap[s.id] = s.name || "Sin asignar"
        })
      }
    }

    // Pipeline de ventas (por estado)
    const pipeline: Record<string, { status: string, label: string, count: number, value: number }> = {
      NEW: { status: "NEW", label: "Nuevo", count: 0, value: 0 },
      IN_PROGRESS: { status: "IN_PROGRESS", label: "En Progreso", count: 0, value: 0 },
      QUOTED: { status: "QUOTED", label: "Cotizado", count: 0, value: 0 },
      WON: { status: "WON", label: "Ganado", count: 0, value: 0 },
      LOST: { status: "LOST", label: "Perdido", count: 0, value: 0 },
    }

    // Por origen (source)
    const bySource: Record<string, { source: string, count: number, converted: number, conversionRate: number }> = {
      Instagram: { source: "Instagram", count: 0, converted: 0, conversionRate: 0 },
      WhatsApp: { source: "WhatsApp", count: 0, converted: 0, conversionRate: 0 },
      "Meta Ads": { source: "Meta Ads", count: 0, converted: 0, conversionRate: 0 },
      Other: { source: "Otro", count: 0, converted: 0, conversionRate: 0 },
    }

    // Por región
    const byRegion: Record<string, { region: string, count: number, converted: number }> = {}

    // Por vendedor
    const bySeller: Record<string, { id: string, name: string, leads: number, converted: number, conversionRate: number }> = {}

    // Determinar si agrupar por días o meses (si el rango es <= 31 días, agrupar por días)
    const daysRange = differenceInDays(endOfDay(filterTo), startOfDay(filterFrom))
    const groupByDays = daysRange <= 31

    // Por período (día o mes)
    const monthlyStats: Record<string, {
      month: string
      monthName: string
      newLeads: number
      wonLeads: number
      lostLeads: number
    }> = {}

    if (groupByDays) {
      const days = eachDayOfInterval({ start: startOfDay(filterFrom), end: endOfDay(filterTo) })
      days.forEach(day => {
        const key = format(day, "yyyy-MM-dd")
        monthlyStats[key] = {
          month: key,
          monthName: format(day, "dd/MM", { locale: es }),
          newLeads: 0,
          wonLeads: 0,
          lostLeads: 0,
        }
      })
    } else {
      let currentDate = startOfMonth(filterFrom)
      while (currentDate <= filterTo) {
        const key = format(currentDate, "yyyy-MM")
        monthlyStats[key] = {
          month: key,
          monthName: format(currentDate, "MMM yy", { locale: es }),
          newLeads: 0,
          wonLeads: 0,
          lostLeads: 0,
        }
        currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1))
      }
    }

    // Obtener tasa de cambio más reciente para depósitos en ARS
    const latestExchangeRate = await getLatestExchangeRate(supabase) || 1000

    // Procesar leads
    let totalLeads = 0
    let totalConverted = 0
    let totalLost = 0
    let totalDepositsUsd = 0

    for (const lead of leads || []) {
      totalLeads++

      const isConverted = convertedLeadIds.has(lead.id)
      if (isConverted) totalConverted++

      // Pipeline
      if (pipeline[lead.status]) {
        pipeline[lead.status].count++
        if (lead.has_deposit && lead.deposit_amount) {
          const depositAmount = parseFloat(lead.deposit_amount) || 0
          totalDepositsUsd += depositAmount / latestExchangeRate
          pipeline[lead.status].value += depositAmount / latestExchangeRate
        }
      }

      // Por estado
      if (lead.status === "LOST") totalLost++

      // Por origen
      const source = lead.source || "Other"
      if (bySource[source]) {
        bySource[source].count++
        if (isConverted) bySource[source].converted++
      }

      // Por región
      const region = lead.region || lead.destination || "OTROS"
      if (!byRegion[region]) {
        byRegion[region] = { region, count: 0, converted: 0 }
      }
      byRegion[region].count++
      if (isConverted) byRegion[region].converted++

      // Por vendedor
      if (lead.assigned_seller_id) {
        if (!bySeller[lead.assigned_seller_id]) {
          bySeller[lead.assigned_seller_id] = {
            id: lead.assigned_seller_id,
            name: sellersMap[lead.assigned_seller_id] || 'Sin asignar',
            leads: 0,
            converted: 0,
            conversionRate: 0,
          }
        }
        bySeller[lead.assigned_seller_id].leads++
        if (isConverted) bySeller[lead.assigned_seller_id].converted++
      }

      // Por período (día o mes)
      if (lead.created_at) {
        const createdAt = new Date(lead.created_at)
        const monthKey = groupByDays
          ? format(createdAt, "yyyy-MM-dd")
          : format(createdAt, "yyyy-MM")
        if (monthlyStats[monthKey]) {
          monthlyStats[monthKey].newLeads++
          if (isConverted) monthlyStats[monthKey].wonLeads++
          if (lead.status === "LOST") monthlyStats[monthKey].lostLeads++
        }
      }
    }

    // Calcular tasas de conversión (basado en convertidos a operación)
    Object.values(bySource).forEach(s => {
      s.conversionRate = s.count > 0 ? (s.converted / s.count) * 100 : 0
    })

    Object.values(bySeller).forEach(s => {
      s.conversionRate = s.leads > 0 ? (s.converted / s.leads) * 100 : 0
    })

    // Conversion rate general (leads convertidos a operación / total)
    const overallConversionRate = totalLeads > 0 ? (totalConverted / totalLeads) * 100 : 0

    // Leads activos = no convertidos a operación (excluyendo perdidos)
    const activeLeads = totalLeads - totalConverted - totalLost

    // Top vendedores por conversión
    const topSellers = Object.values(bySeller)
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 10)

    // Top orígenes
    const topSources = Object.values(bySource)
      .filter(s => s.count > 0)
      .sort((a, b) => b.conversionRate - a.conversionRate)

    // Top regiones
    const topRegions = Object.values(byRegion)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    // Leads nuevos en el período actual
    const currentPeriodKey = groupByDays
      ? format(now, "yyyy-MM-dd")
      : format(now, "yyyy-MM")
    const newThisPeriod = monthlyStats[currentPeriodKey]?.newLeads || 0

    // Conversión de meses a array ordenado
    const monthlyTrend = Object.values(monthlyStats).sort((a, b) => a.month.localeCompare(b.month))

    return NextResponse.json({
      overview: {
        totalLeads,
        activeLeads,
        wonLeads: totalConverted,
        lostLeads: totalLost,
        conversionRate: Math.round(overallConversionRate * 10) / 10,
        totalDeposits: Math.round(totalDepositsUsd * 100) / 100,
        newThisMonth: newThisPeriod,
      },
      pipeline: Object.values(pipeline),
      distributions: {
        bySource: topSources,
        byRegion: topRegions,
        bySeller: topSellers,
      },
      trends: {
        monthly: monthlyTrend,
      },
      rankings: {
        topSellers,
        topSources,
      },
      filters: {
        dateFrom: format(filterFrom, "yyyy-MM-dd"),
        dateTo: format(filterTo, "yyyy-MM-dd"),
      }
    })
  } catch (error: any) {
    console.error("Error in GET /api/sales/statistics:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener estadísticas" },
      { status: 500 }
    )
  }
}
