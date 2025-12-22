import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { subMonths, format } from "date-fns"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const agencyId = searchParams.get("agencyId")
    const inactiveMonths = parseInt(searchParams.get("inactiveMonths") || "6")

    // Obtener agencias del usuario
    const { data: userAgencies } = await supabase
      .from("user_agencies")
      .select("agency_id")
      .eq("user_id", user.id)

    const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

    // Primero obtener operaciones filtradas por agencia (los clientes se relacionan con agencias a través de operaciones)
    let operationsQuery = supabase
      .from("operations")
      .select("id, agency_id")

    // Filtrar por agencia
    if (agencyId && agencyId !== "ALL") {
      operationsQuery = operationsQuery.eq("agency_id", agencyId)
    } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      operationsQuery = operationsQuery.in("agency_id", agencyIds)
    }

    const { data: operations, error: operationsError } = await operationsQuery

    if (operationsError) {
      console.error("Error fetching operations:", operationsError)
      return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 })
    }

    const operationIds = (operations || []).map((op: any) => op.id)

    // Obtener clientes a través de operation_customers
    let customers: any[] = []
    let operationsData: any[] = []
    
    if (operationIds.length > 0) {
      const { data: opCustomers, error: opCustomersError } = await (supabase.from("operation_customers") as any)
        .select(`
          customer_id,
          operations:operation_id (
            id,
            sale_amount_total,
            currency,
            departure_date,
            status,
            agency_id
          )
        `)
        .in("operation_id", operationIds)

      if (opCustomersError) {
        console.error("Error fetching operation_customers:", opCustomersError)
        return NextResponse.json({ error: "Error al obtener relación operaciones-clientes" }, { status: 500 })
      }

      operationsData = opCustomers || []
      
      // Obtener IDs únicos de clientes
      const customerIds = Array.from(new Set((opCustomers || []).map((oc: any) => oc.customer_id).filter(Boolean)))
      
      if (customerIds.length > 0) {
        const { data: customersData, error: customersError } = await (supabase.from("customers") as any)
          .select("id, first_name, last_name, email, phone, created_at")
          .in("id", customerIds)

        if (customersError) {
          console.error("Error fetching customers:", customersError)
          return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
        }

        customers = customersData || []
      }
    }

    // Procesar datos por cliente
    const customerStats: Record<string, {
      id: string
      name: string
      email: string | null
      phone: string | null
      totalOperations: number
      totalSpent: number
      avgTicket: number
      lastOperationDate: string | null
      isInactive: boolean
    }> = {}

    // Inicializar stats para todos los clientes
    for (const customer of customers || []) {
      customerStats[customer.id] = {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`,
        email: customer.email,
        phone: customer.phone,
        totalOperations: 0,
        totalSpent: 0,
        avgTicket: 0,
        lastOperationDate: null,
        isInactive: true,
      }
    }

    // Agregar datos de operaciones
    const inactiveThreshold = subMonths(new Date(), inactiveMonths)
    
    for (const oc of operationsData) {
      const op = oc.operations as any
      if (!op || !customerStats[oc.customer_id]) continue

      const stats = customerStats[oc.customer_id]
      
      if (["CONFIRMED", "TRAVELLED", "CLOSED"].includes(op.status)) {
        stats.totalOperations += 1
        stats.totalSpent += op.sale_amount_total || 0
        
        if (!stats.lastOperationDate || new Date(op.departure_date) > new Date(stats.lastOperationDate)) {
          stats.lastOperationDate = op.departure_date
        }
        
        if (new Date(op.departure_date) > inactiveThreshold) {
          stats.isInactive = false
        }
      }
    }

    // Calcular promedio de ticket
    const allCustomers = Object.values(customerStats).map(c => ({
      ...c,
      avgTicket: c.totalOperations > 0 ? c.totalSpent / c.totalOperations : 0,
    }))

    // Top clientes por gasto
    const topBySpending = [...allCustomers]
      .filter(c => c.totalSpent > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)

    // Top clientes frecuentes
    const topByFrequency = [...allCustomers]
      .filter(c => c.totalOperations > 0)
      .sort((a, b) => b.totalOperations - a.totalOperations)
      .slice(0, 10)

    // Clientes inactivos
    const inactiveCustomers = allCustomers
      .filter(c => c.isInactive && c.totalOperations > 0)
      .sort((a, b) => {
        if (!a.lastOperationDate) return 1
        if (!b.lastOperationDate) return -1
        return new Date(a.lastOperationDate).getTime() - new Date(b.lastOperationDate).getTime()
      })

    // Calcular métricas generales
    const activeCustomers = allCustomers.filter(c => !c.isInactive)
    const customersWithOperations = allCustomers.filter(c => c.totalOperations > 0)
    const totalRevenue = allCustomers.reduce((sum, c) => sum + c.totalSpent, 0)
    const avgLifetimeValue = customersWithOperations.length > 0 
      ? totalRevenue / customersWithOperations.length 
      : 0

    return NextResponse.json({
      success: true,
      summary: {
        totalCustomers: allCustomers.length,
        activeCustomers: activeCustomers.length,
        inactiveCustomers: inactiveCustomers.length,
        customersWithOperations: customersWithOperations.length,
        totalRevenue,
        avgLifetimeValue,
        avgTicket: customersWithOperations.length > 0
          ? allCustomers.reduce((sum, c) => sum + c.avgTicket, 0) / customersWithOperations.length
          : 0,
      },
      topBySpending,
      topByFrequency,
      inactiveCustomers: inactiveCustomers.slice(0, 20),
      inactiveMonthsThreshold: inactiveMonths,
    })
  } catch (error: any) {
    console.error("Error in customers analytics:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

