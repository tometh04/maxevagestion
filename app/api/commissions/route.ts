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
    const status = searchParams.get("status")
    const periodStart = searchParams.get("periodStart")
    const periodEnd = searchParams.get("periodEnd")

    // Determinar si puede ver todas las comisiones o solo las propias
    const canViewAll = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    // Query base - simplificada
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
