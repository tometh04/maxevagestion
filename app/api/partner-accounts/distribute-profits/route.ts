import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * POST /api/partner-accounts/distribute-profits
 * Distribuye ganancias del mes anterior entre los socios según sus porcentajes
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    
    const { year, month, profitAmount, exchangeRate, agencyId } = body

    if (!year || !month || profitAmount === undefined || !exchangeRate) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (profitAmount <= 0) {
      return NextResponse.json({ error: "El monto de ganancia debe ser mayor a 0" }, { status: 400 })
    }

    // Obtener todos los socios activos con sus porcentajes
    const { data: partners, error: partnersError } = await (supabase.from("partner_accounts") as any)
      .select("id, partner_name, profit_percentage")
      .eq("is_active", true)
      .order("partner_name", { ascending: true })

    if (partnersError) {
      console.error("Error fetching partners:", partnersError)
      return NextResponse.json({ error: "Error al obtener socios" }, { status: 500 })
    }

    if (!partners || partners.length === 0) {
      return NextResponse.json({ error: "No hay socios activos para distribuir ganancias" }, { status: 400 })
    }

    // Verificar que la suma de porcentajes sea 100
    const totalPercentage = partners.reduce((sum: number, p: any) => sum + Number(p.profit_percentage || 0), 0)
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return NextResponse.json({ 
        error: `La suma de porcentajes debe ser 100%. Actual: ${totalPercentage.toFixed(2)}%`,
        totalPercentage: totalPercentage
      }, { status: 400 })
    }

    // Verificar si ya se distribuyeron ganancias para este mes/año
    const { data: existingAllocations, error: checkError } = await (supabase.from("partner_profit_allocations") as any)
      .select("partner_id, year, month")
      .eq("year", year)
      .eq("month", month)
      .limit(1)

    if (checkError) {
      console.error("Error checking existing allocations:", checkError)
      return NextResponse.json({ error: "Error al verificar asignaciones existentes" }, { status: 500 })
    }

    if (existingAllocations && existingAllocations.length > 0) {
      return NextResponse.json({ 
        error: `Ya se distribuyeron ganancias para ${month}/${year}. Elimine las asignaciones existentes primero.`
      }, { status: 400 })
    }

    // Calcular asignaciones por socio
    const allocations: any[] = []
    const results: any[] = []

    for (const partner of partners) {
      const percentage = Number(partner.profit_percentage || 0)
      if (percentage <= 0) continue // Saltear socios sin porcentaje

      const allocatedAmount = (profitAmount * percentage) / 100
      
      // Crear asignación
      const allocation = {
        partner_id: partner.id,
        year,
        month,
        profit_amount: allocatedAmount,
        currency: "USD",
        exchange_rate: exchangeRate,
        status: "ALLOCATED",
        created_by: user.id,
      }

      allocations.push(allocation)
      results.push({
        partner_id: partner.id,
        partner_name: partner.partner_name,
        percentage: percentage,
        amount: allocatedAmount,
      })
    }

    // Insertar todas las asignaciones
    const { data: insertedAllocations, error: insertError } = await (supabase.from("partner_profit_allocations") as any)
      .insert(allocations)
      .select()

    if (insertError) {
      console.error("Error inserting allocations:", insertError)
      return NextResponse.json({ error: "Error al guardar asignaciones" }, { status: 500 })
    }

    console.log(`[DistributeProfits] Distribuidas ganancias de ${month}/${year}: ${profitAmount} USD entre ${allocations.length} socios`)

    return NextResponse.json({
      success: true,
      message: `Ganancias distribuidas exitosamente entre ${allocations.length} socios`,
      allocations: results,
      totalAmount: profitAmount,
      year,
      month,
    })
  } catch (error: any) {
    console.error("Error in POST /api/partner-accounts/distribute-profits:", error)
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 })
  }
}

/**
 * GET /api/partner-accounts/distribute-profits
 * Obtiene las asignaciones de ganancias para un período específico
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    
    if (!["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    let query = (supabase.from("partner_profit_allocations") as any)
      .select(`
        *,
        partner:partner_id(id, partner_name, profit_percentage)
      `)
      .order("created_at", { ascending: false })

    if (year) {
      query = query.eq("year", parseInt(year))
    }
    if (month) {
      query = query.eq("month", parseInt(month))
    }

    const { data: allocations, error } = await query

    if (error) {
      console.error("Error fetching allocations:", error)
      return NextResponse.json({ error: "Error al obtener asignaciones" }, { status: 500 })
    }

    return NextResponse.json({ allocations: allocations || [] })
  } catch (error: any) {
    console.error("Error in GET /api/partner-accounts/distribute-profits:", error)
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 })
  }
}
