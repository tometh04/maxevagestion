import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = 'force-dynamic'

// GET - Obtener comisiones
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Parámetros de filtro
    const userId = searchParams.get("userId")
    const sellerId = searchParams.get("sellerId") // Para commission_records
    const status = searchParams.get("status")
    const periodStart = searchParams.get("periodStart")
    const periodEnd = searchParams.get("periodEnd")
    const month = searchParams.get("month") // Para filtrar por mes (YYYY-MM)

    // Determinar si puede ver todas las comisiones o solo las propias
    const canViewAll = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    // Usar commission_records si: viene sellerId, o viene status, o es admin/seller
    const useCommissionRecords = sellerId || status || canViewAll || user.role === "SELLER"

    if (useCommissionRecords) {
      let query = (supabase.from("commission_records") as any)
        .select(`
          *,
          operations:operation_id(
            id,
            file_code,
            destination,
            departure_date,
            sale_amount_total,
            operator_cost,
            sale_currency,
            margin_amount
          )
        `)
        .order("date_calculated", { ascending: false })

      // Filtrar por seller: admin puede ver todos o filtrar, seller solo ve los suyos
      if (!canViewAll) {
        // Seller: solo sus comisiones
        query = query.eq("seller_id", user.id)
      } else if (sellerId && sellerId !== "ALL") {
        // Admin filtrando por un seller específico
        query = query.eq("seller_id", sellerId)
      }
      // Si es admin y no hay sellerId o sellerId=ALL, no filtra → trae todos

      // Filtros
      if (status && status !== "ALL") {
        query = query.eq("status", status.toUpperCase())
      }

      // Filtro por mes (YYYY-MM)
      if (month) {
        const [year, monthNum] = month.split("-")
        const startDate = `${year}-${monthNum}-01`
        const endDate = new Date(parseInt(year), parseInt(monthNum), 0).toISOString().split("T")[0]
        query = query.gte("date_calculated", startDate).lte("date_calculated", endDate)
      }

      // Filtro por rango de fechas
      if (periodStart) {
        query = query.gte("date_calculated", periodStart)
      }
      if (periodEnd) {
        query = query.lte("date_calculated", periodEnd)
      }

      const { data: commissionRecords, error } = await query

      if (error) {
        console.error("Error fetching commission_records:", error)
        return NextResponse.json(
          { error: "Error al obtener comisiones" },
          { status: 500 }
        )
      }

      // Fetch seller names from users table
      const sellerIds = Array.from(new Set((commissionRecords || []).map((cr: any) => cr.seller_id).filter(Boolean))) as string[]
      let sellersMap: Record<string, { name: string; email: string }> = {}
      if (sellerIds.length > 0) {
        const { data: sellers } = await supabase
          .from("users")
          .select("id, name, email")
          .in("id", sellerIds)
        if (sellers) {
          sellersMap = Object.fromEntries(sellers.map((s: any) => [s.id, s]))
        }
      }

      // Transformar commission_records a formato Commission
      const commissions = (commissionRecords || []).map((cr: any) => {
        const seller = sellersMap[cr.seller_id]
        return {
        id: cr.id,
        operation_id: cr.operation_id,
        seller_id: cr.seller_id,
        seller_name: seller?.name || "Sin vendedor",
        seller_email: seller?.email || "",
        sellers: seller ? { id: cr.seller_id, name: seller.name } : null,
        agency_id: cr.agency_id,
        amount: parseFloat(cr.amount || 0),
        percentage: cr.percentage ? parseFloat(cr.percentage) : null,
        status: cr.status as "PENDING" | "PAID",
        date_calculated: cr.date_calculated,
        date_paid: cr.date_paid,
        operation: cr.operations ? {
          id: cr.operations.id,
          short_code: cr.operations.file_code || "",
          file_code: cr.operations.file_code || "",
          destination: cr.operations.destination || "",
          departure_date: cr.operations.departure_date || "",
          sale_amount_total: parseFloat(cr.operations.sale_amount_total || 0),
          operator_cost: parseFloat(cr.operations.operator_cost || 0),
          margin_amount: parseFloat(cr.operations.margin_amount || 0),
          currency: cr.operations.sale_currency || "USD",
        } : null,
      }})

      // Calcular resumen mensual
      const monthlySummary = new Map<string, { total: number; pending: number; paid: number; count: number }>()
      
      commissions.forEach((comm: any) => {
        const monthKey = comm.date_calculated ? comm.date_calculated.substring(0, 7) : "unknown"
        if (!monthlySummary.has(monthKey)) {
          monthlySummary.set(monthKey, { total: 0, pending: 0, paid: 0, count: 0 })
        }
        const summary = monthlySummary.get(monthKey)!
        summary.total += comm.amount
        summary.count += 1
        if (comm.status === "PENDING") {
          summary.pending += comm.amount
        } else if (comm.status === "PAID") {
          summary.paid += comm.amount
        }
      })

      const monthlySummaryArray = Array.from(monthlySummary.entries()).map(([month, data]) => ({
        month,
        ...data,
      }))

      // Calcular totales
      const totals = {
        pending: commissions.filter((c: any) => c.status === "PENDING").reduce((sum: number, c: any) => sum + c.amount, 0),
        paid: commissions.filter((c: any) => c.status === "PAID").reduce((sum: number, c: any) => sum + c.amount, 0),
        total: commissions.reduce((sum: number, c: any) => sum + c.amount, 0),
      }

      return NextResponse.json({ 
        commissions, 
        totals,
        monthlySummary: monthlySummaryArray,
      })
    }

    // Sistema anterior: commissions (por períodos/esquemas) - mantener compatibilidad
    let query = (supabase.from("commissions") as any)
      .select(`
        *,
        scheme:commission_schemes (id, name, commission_type)
      `)
      .in("agency_id", agencyIds)
      .order("period_start", { ascending: false })

    // Filtrar por usuario si no es admin
    if (!canViewAll) {
      query = query.eq("user_id", user.id)
    } else if (userId) {
      query = query.eq("user_id", userId)
    }

    // Filtros
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }
    if (periodStart) {
      query = query.gte("period_start", periodStart)
    }
    if (periodEnd) {
      query = query.lte("period_end", periodEnd)
    }

    const { data: commissions, error } = await query

    if (error) {
      console.error("Error fetching commissions:", error)
      return NextResponse.json(
        { error: "Error al obtener comisiones" },
        { status: 500 }
      )
    }

    // Calcular totales
    const totals = {
      pending: 0,
      approved: 0,
      paid: 0,
    }

    commissions.forEach((c: any) => {
      if (c.status === 'pending') totals.pending += c.total_amount
      else if (c.status === 'approved') totals.approved += c.total_amount
      else if (c.status === 'paid') totals.paid += c.total_amount
    })

    return NextResponse.json({ commissions, totals })
  } catch (error: any) {
    // Don't catch Next.js redirect errors
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("Error in GET /api/commissions:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener comisiones" },
      { status: 500 }
    )
  }
}
