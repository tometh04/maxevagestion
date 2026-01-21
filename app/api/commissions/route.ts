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

    // Si viene sellerId, usar commission_records (sistema automático por operación)
    if (sellerId) {
      // Verificar permisos: solo puede ver sus propias comisiones a menos que sea admin
      const targetSellerId = canViewAll ? (sellerId || user.id) : user.id
      
      let query = (supabase.from("commission_records") as any)
        .select(`
          *,
          operations:operation_id(
            id,
            file_code,
            destination,
            departure_date,
            sale_amount_total,
            sale_currency,
            margin_amount
          )
        `)
        .eq("seller_id", targetSellerId)
        .order("date_calculated", { ascending: false })

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

      const { data: commissionRecords, error } = await query

      if (error) {
        console.error("Error fetching commission_records:", error)
        return NextResponse.json(
          { error: "Error al obtener comisiones" },
          { status: 500 }
        )
      }

      // Transformar commission_records a formato Commission
      const commissions = (commissionRecords || []).map((cr: any) => ({
        id: cr.id,
        operation_id: cr.operation_id,
        seller_id: cr.seller_id,
        agency_id: cr.agency_id,
        amount: parseFloat(cr.amount || 0),
        percentage: cr.percentage ? parseFloat(cr.percentage) : null,
        status: cr.status as "PENDING" | "PAID",
        date_calculated: cr.date_calculated,
        date_paid: cr.date_paid,
        operations: cr.operations ? {
          id: cr.operations.id,
          destination: cr.operations.destination || "",
          departure_date: cr.operations.departure_date || "",
          sale_amount_total: parseFloat(cr.operations.sale_amount_total || 0),
          operator_cost: 0, // No viene en la query
          margin_amount: parseFloat(cr.operations.margin_amount || 0),
          currency: cr.operations.sale_currency || "USD",
        } : null,
      }))

      // Calcular resumen mensual
      const monthlySummary = new Map<string, { total: number; pending: number; paid: number; count: number }>()
      
      commissions.forEach((comm: any) => {
        const monthKey = comm.dateCalculated ? comm.dateCalculated.substring(0, 7) : "unknown"
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
    console.error("Error in GET /api/commissions:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener comisiones" },
      { status: 500 }
    )
  }
}
