import { createServerClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

type User = Database["public"]["Tables"]["users"]["Row"]

/**
 * Obtiene ventas de esta semana
 */
export async function getSalesThisWeek(user: User, agencyId?: string): Promise<any> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const dayOfWeek = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)) // Lunes
  startOfWeek.setHours(0, 0, 0, 0)
  
  const from = startOfWeek.toISOString().split("T")[0]
  const to = today.toISOString().split("T")[0]

  let query = (supabase.from("operations") as any)
    .select("sale_amount_total, margin_amount, operator_cost, currency, created_at, seller_id")
    .gte("created_at", from)
    .lte("created_at", to)

  if (user.role === "SELLER") {
    query = query.eq("seller_id", user.id)
  }
  if (agencyId) {
    query = query.eq("agency_id", agencyId)
  }

  const { data: operations } = await query

  return {
    period: `${from} a ${to}`,
    totalSales: (operations || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0),
    totalMargin: (operations || []).reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0),
    operationsCount: (operations || []).length,
  }
}

/**
 * Obtiene los top vendedores de un período
 */
export async function getTopSellers(user: User, from?: string, to?: string, limit: number = 5): Promise<any[]> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  const defaultTo = today.toISOString().split("T")[0]

  let query = (supabase.from("operations") as any)
    .select(`
      sale_amount_total, 
      margin_amount, 
      seller_id,
      users:seller_id(id, name)
    `)
    .gte("created_at", from || defaultFrom)
    .lte("created_at", to || defaultTo)

  const { data: operations } = await query

  // Agrupar por vendedor
  const sellerStats: Record<string, any> = {}
  for (const op of (operations || [])) {
    const sellerId = op.seller_id
    const sellerName = op.users?.name || "Sin vendedor"
    
    if (!sellerStats[sellerId]) {
      sellerStats[sellerId] = {
        sellerId,
        sellerName,
        totalSales: 0,
        totalMargin: 0,
        operationsCount: 0,
      }
    }
    
    sellerStats[sellerId].totalSales += op.sale_amount_total || 0
    sellerStats[sellerId].totalMargin += op.margin_amount || 0
    sellerStats[sellerId].operationsCount += 1
  }

  return Object.values(sellerStats)
    .sort((a: any, b: any) => b.totalSales - a.totalSales)
    .slice(0, limit)
}

/**
 * Compara ventas del mes actual vs mes pasado
 */
export async function getMonthComparison(user: User, agencyId?: string): Promise<any> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthSameDay = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())

  // Ventas mes actual
  let currentQuery = (supabase.from("operations") as any)
    .select("sale_amount_total, margin_amount")
    .gte("created_at", currentMonthStart.toISOString())
    .lte("created_at", today.toISOString())

  if (user.role === "SELLER") currentQuery = currentQuery.eq("seller_id", user.id)
  if (agencyId) currentQuery = currentQuery.eq("agency_id", agencyId)

  const { data: currentOps } = await currentQuery

  // Ventas mes pasado (hasta el mismo día)
  let lastQuery = (supabase.from("operations") as any)
    .select("sale_amount_total, margin_amount")
    .gte("created_at", lastMonthStart.toISOString())
    .lte("created_at", lastMonthSameDay.toISOString())

  if (user.role === "SELLER") lastQuery = lastQuery.eq("seller_id", user.id)
  if (agencyId) lastQuery = lastQuery.eq("agency_id", agencyId)

  const { data: lastOps } = await lastQuery

  const currentSales = (currentOps || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0)
  const lastSales = (lastOps || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0)
  const difference = currentSales - lastSales
  const percentChange = lastSales > 0 ? ((difference / lastSales) * 100) : 0

  return {
    currentMonth: {
      sales: currentSales,
      operations: (currentOps || []).length,
      period: `${currentMonthStart.toISOString().split("T")[0]} a ${today.toISOString().split("T")[0]}`,
    },
    lastMonth: {
      sales: lastSales,
      operations: (lastOps || []).length,
      period: `${lastMonthStart.toISOString().split("T")[0]} a ${lastMonthSameDay.toISOString().split("T")[0]}`,
    },
    difference,
    percentChange,
    trend: percentChange > 0 ? "UP" : percentChange < 0 ? "DOWN" : "EQUAL",
  }
}

/**
 * Obtiene operaciones con margen negativo
 */
export async function getNegativeMarginOperations(user: User, agencyId?: string): Promise<any[]> {
  const supabase = await createServerClient()

  let query = (supabase.from("operations") as any)
    .select(`
      id, file_code, destination, sale_amount_total, margin_amount, margin_percentage, created_at,
      users:seller_id(name),
      agencies:agency_id(name)
    `)
    .lt("margin_amount", 0)
    .order("margin_amount", { ascending: true })
    .limit(20)

  if (user.role === "SELLER") query = query.eq("seller_id", user.id)
  if (agencyId) query = query.eq("agency_id", agencyId)

  const { data: operations } = await query

  return (operations || []).map((op: any) => ({
    id: op.id,
    fileCode: op.file_code,
    destination: op.destination,
    saleAmount: op.sale_amount_total,
    marginAmount: op.margin_amount,
    marginPercent: op.margin_percentage,
    seller: op.users?.name || "Sin vendedor",
    agency: op.agencies?.name || "Sin agencia",
    date: op.created_at,
  }))
}

/**
 * Obtiene ventas por canal/fuente (Instagram, WhatsApp, etc)
 */
export async function getSalesByChannel(user: User, from?: string, to?: string): Promise<any[]> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  const defaultTo = today.toISOString().split("T")[0]

  // Primero obtener leads con su fuente
  let leadsQuery = (supabase.from("leads") as any)
    .select("id, source")
    .in("status", ["WON"])

  const { data: wonLeads } = await leadsQuery

  // Obtener operaciones con leads asociados
  let opsQuery = (supabase.from("operations") as any)
    .select("sale_amount_total, margin_amount, lead_id")
    .gte("created_at", from || defaultFrom)
    .lte("created_at", to || defaultTo)

  if (user.role === "SELLER") opsQuery = opsQuery.eq("seller_id", user.id)

  const { data: operations } = await opsQuery

  // Agrupar por fuente
  const channelStats: Record<string, any> = {
    "Instagram": { channel: "Instagram", sales: 0, count: 0 },
    "WhatsApp": { channel: "WhatsApp", sales: 0, count: 0 },
    "Trello": { channel: "Trello", sales: 0, count: 0 },
    "Referido": { channel: "Referido", sales: 0, count: 0 },
    "Web": { channel: "Web", sales: 0, count: 0 },
    "Otro": { channel: "Otro", sales: 0, count: 0 },
  }

  for (const op of (operations || [])) {
    const lead = (wonLeads || []).find((l: any) => l.id === op.lead_id)
    const source = lead?.source || "Otro"
    const channel = source.includes("Instagram") ? "Instagram" 
      : source.includes("WhatsApp") ? "WhatsApp"
      : source.includes("Trello") ? "Trello"
      : source.includes("Referido") ? "Referido"
      : source.includes("Web") ? "Web"
      : "Otro"
    
    channelStats[channel].sales += op.sale_amount_total || 0
    channelStats[channel].count += 1
  }

  return Object.values(channelStats).filter((c: any) => c.count > 0)
}

/**
 * Obtiene tasa de conversión de lead a venta
 */
export async function getConversionRate(user: User, from?: string, to?: string): Promise<any> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  const defaultTo = today.toISOString().split("T")[0]

  // Leads totales
  let totalQuery = (supabase.from("leads") as any)
    .select("id, status, assigned_seller_id")
    .gte("created_at", from || defaultFrom)
    .lte("created_at", to || defaultTo)

  if (user.role === "SELLER") totalQuery = totalQuery.eq("assigned_seller_id", user.id)

  const { data: allLeads } = await totalQuery

  const totalLeads = (allLeads || []).length
  const wonLeads = (allLeads || []).filter((l: any) => l.status === "WON").length
  const lostLeads = (allLeads || []).filter((l: any) => l.status === "LOST").length
  const inProgressLeads = (allLeads || []).filter((l: any) => ["NEW", "IN_PROGRESS", "QUOTED"].includes(l.status)).length

  return {
    totalLeads,
    wonLeads,
    lostLeads,
    inProgressLeads,
    conversionRate: totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0,
    lossRate: totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0,
  }
}

/**
 * Obtiene clientes con pagos vencidos HOY
 */
export async function getCustomerDuePaymentsToday(user: User): Promise<any[]> {
  const supabase = await createServerClient()
  const today = new Date().toISOString().split("T")[0]

  const { data: payments } = await (supabase.from("payments") as any)
    .select(`
      id, amount, currency, date_due,
      operations:operation_id(
        id, file_code, destination,
        customers:customer_id(name, phone, email)
      )
    `)
    .eq("status", "PENDING")
    .eq("direction", "INCOME")
    .eq("date_due", today)

  return (payments || []).map((p: any) => ({
    paymentId: p.id,
    amount: p.amount,
    currency: p.currency,
    dueDate: p.date_due,
    operation: p.operations?.file_code || p.operations?.destination,
    customerName: p.operations?.customers?.name || "Sin cliente",
    customerPhone: p.operations?.customers?.phone,
    customerEmail: p.operations?.customers?.email,
  }))
}

/**
 * Obtiene operaciones con pagos pendientes de clientes antes del viaje
 */
export async function getOperationsWithPendingPaymentBeforeTravel(user: User): Promise<any[]> {
  const supabase = await createServerClient()
  const today = new Date().toISOString().split("T")[0]

  const { data: operations } = await (supabase.from("operations") as any)
    .select(`
      id, file_code, destination, check_in_date, sale_amount_total,
      customers:customer_id(name, phone),
      payments:payments!operation_id(id, amount, status, direction, date_due)
    `)
    .gte("check_in_date", today)
    .order("check_in_date", { ascending: true })
    .limit(50)

  const opsWithPendingPayments = (operations || []).filter((op: any) => {
    const pendingCustomerPayments = (op.payments || []).filter(
      (p: any) => p.direction === "INCOME" && p.status === "PENDING"
    )
    return pendingCustomerPayments.length > 0
  })

  return opsWithPendingPayments.map((op: any) => {
    const pendingPayments = (op.payments || []).filter(
      (p: any) => p.direction === "INCOME" && p.status === "PENDING"
    )
    const totalPending = pendingPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

    return {
      operationId: op.id,
      fileCode: op.file_code,
      destination: op.destination,
      checkInDate: op.check_in_date,
      saleAmount: op.sale_amount_total,
      pendingAmount: totalPending,
      pendingPaymentsCount: pendingPayments.length,
      customerName: op.customers?.name || "Sin cliente",
      customerPhone: op.customers?.phone,
    }
  })
}

/**
 * Obtiene operaciones que viajan esta semana
 */
export async function getOperationsTravelingThisWeek(user: User): Promise<any[]> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()))

  const { data: operations } = await (supabase.from("operations") as any)
    .select(`
      id, file_code, destination, check_in_date, check_out_date, status, sale_amount_total,
      customers:customer_id(name, phone, email),
      users:seller_id(name)
    `)
    .gte("check_in_date", today.toISOString().split("T")[0])
    .lte("check_in_date", endOfWeek.toISOString().split("T")[0])
    .order("check_in_date", { ascending: true })

  return (operations || []).map((op: any) => ({
    id: op.id,
    fileCode: op.file_code,
    destination: op.destination,
    checkIn: op.check_in_date,
    checkOut: op.check_out_date,
    status: op.status,
    saleAmount: op.sale_amount_total,
    customer: op.customers?.name || "Sin cliente",
    customerPhone: op.customers?.phone,
    seller: op.users?.name || "Sin vendedor",
  }))
}

/**
 * Obtiene comisiones del vendedor actual
 */
export async function getMyCommissions(user: User, from?: string, to?: string): Promise<any> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  const defaultTo = today.toISOString().split("T")[0]

  // Obtener operaciones del vendedor
  const { data: operations } = await (supabase.from("operations") as any)
    .select("id, sale_amount_total, margin_amount, commission_amount, commission_paid")
    .eq("seller_id", user.id)
    .gte("created_at", from || defaultFrom)
    .lte("created_at", to || defaultTo)

  const totalCommission = (operations || []).reduce((sum: number, op: any) => sum + (op.commission_amount || 0), 0)
  const paidCommission = (operations || []).filter((op: any) => op.commission_paid).reduce((sum: number, op: any) => sum + (op.commission_amount || 0), 0)
  const pendingCommission = totalCommission - paidCommission

  return {
    period: `${from || defaultFrom} a ${to || defaultTo}`,
    totalCommission,
    paidCommission,
    pendingCommission,
    operationsCount: (operations || []).length,
  }
}

/**
 * Obtiene un resumen de salud financiera general
 */
export async function getFinancialHealth(user: User): Promise<any> {
  const supabase = await createServerClient()
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  // Ventas del mes
  const { data: salesData } = await (supabase.from("operations") as any)
    .select("sale_amount_total, margin_amount")
    .gte("created_at", monthStart.toISOString())

  const totalSales = (salesData || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0)
  const totalMargin = (salesData || []).reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0)

  // Cuentas financieras
  const { data: accounts } = await (supabase.from("financial_accounts") as any)
    .select("name, currency, initial_balance")

  // Pagos pendientes de clientes
  const { data: pendingIncome } = await (supabase.from("payments") as any)
    .select("amount")
    .eq("status", "PENDING")
    .eq("direction", "INCOME")

  const totalPendingIncome = (pendingIncome || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

  // Pagos pendientes a operadores
  const { data: pendingExpense } = await (supabase.from("payments") as any)
    .select("amount")
    .eq("status", "PENDING")
    .eq("direction", "EXPENSE")

  const totalPendingExpense = (pendingExpense || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

  // Pagos vencidos
  const { data: overduePayments } = await (supabase.from("payments") as any)
    .select("amount, direction")
    .eq("status", "PENDING")
    .lt("date_due", today.toISOString().split("T")[0])

  const overdueIncome = (overduePayments || []).filter((p: any) => p.direction === "INCOME").reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
  const overdueExpense = (overduePayments || []).filter((p: any) => p.direction === "EXPENSE").reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

  return {
    salesThisMonth: totalSales,
    marginThisMonth: totalMargin,
    operationsCount: (salesData || []).length,
    cashAccounts: (accounts || []).length,
    pendingFromCustomers: totalPendingIncome,
    pendingToOperators: totalPendingExpense,
    overdueFromCustomers: overdueIncome,
    overdueToOperators: overdueExpense,
    healthScore: calculateHealthScore(totalMargin, overdueIncome, overdueExpense),
    risks: identifyRisks(overdueIncome, overdueExpense, totalPendingExpense),
  }
}

function calculateHealthScore(margin: number, overdueIncome: number, overdueExpense: number): string {
  if (overdueIncome > margin * 0.5 || overdueExpense > margin * 0.5) return "⚠️ ATENCIÓN"
  if (overdueIncome > 0 || overdueExpense > 0) return "🟡 MODERADO"
  return "🟢 SALUDABLE"
}

function identifyRisks(overdueIncome: number, overdueExpense: number, pendingExpense: number): string[] {
  const risks: string[] = []
  if (overdueIncome > 0) risks.push(`Clientes con pagos vencidos: $${overdueIncome.toLocaleString('es-AR')}`)
  if (overdueExpense > 0) risks.push(`Pagos vencidos a operadores: $${overdueExpense.toLocaleString('es-AR')}`)
  if (pendingExpense > 100000) risks.push(`Alto monto pendiente a operadores: $${pendingExpense.toLocaleString('es-AR')}`)
  return risks
}

/**
 * Obtiene operaciones donde se compartió comisión
 */
export async function getSharedCommissions(user: User, from?: string, to?: string): Promise<any[]> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]

  // Buscar operaciones con múltiples comisiones (si existe la tabla de split)
  const { data: operations } = await (supabase.from("operations") as any)
    .select(`
      id, file_code, destination, sale_amount_total, commission_amount,
      users:seller_id(name)
    `)
    .gte("created_at", from || defaultFrom)
    .gt("commission_amount", 0)
    .order("created_at", { ascending: false })
    .limit(50)

  return (operations || []).map((op: any) => ({
    id: op.id,
    fileCode: op.file_code,
    destination: op.destination,
    saleAmount: op.sale_amount_total,
    commissionAmount: op.commission_amount,
    seller: op.users?.name || "Sin vendedor",
  }))
}

/**
 * Obtiene margen por tipo de producto (aéreos, hoteles, paquetes)
 */
export async function getMarginByProductType(user: User, from?: string, to?: string): Promise<any[]> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  const defaultTo = today.toISOString().split("T")[0]

  let query = (supabase.from("operations") as any)
    .select("product_type, sale_amount_total, margin_amount, margin_percentage")
    .gte("created_at", from || defaultFrom)
    .lte("created_at", to || defaultTo)

  if (user.role === "SELLER") query = query.eq("seller_id", user.id)

  const { data: operations } = await query

  // Agrupar por tipo de producto
  const productStats: Record<string, any> = {}
  for (const op of (operations || [])) {
    const type = op.product_type || "Sin clasificar"
    if (!productStats[type]) {
      productStats[type] = { productType: type, sales: 0, margin: 0, count: 0 }
    }
    productStats[type].sales += op.sale_amount_total || 0
    productStats[type].margin += op.margin_amount || 0
    productStats[type].count += 1
  }

  return Object.values(productStats)
    .map((p: any) => ({
      ...p,
      avgMarginPercent: p.sales > 0 ? (p.margin / p.sales) * 100 : 0,
    }))
    .sort((a: any, b: any) => b.avgMarginPercent - a.avgMarginPercent)
}

/**
 * Obtiene pagos de operadores vencidos esta semana
 */
export async function getOperatorPaymentsDueThisWeek(user: User): Promise<any[]> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + 7)

  const { data: payments } = await (supabase.from("payments") as any)
    .select(`
      id, amount, currency, date_due,
      operations:operation_id(
        id, file_code, destination,
        operators:operator_id(name)
      )
    `)
    .eq("status", "PENDING")
    .eq("direction", "EXPENSE")
    .gte("date_due", today.toISOString().split("T")[0])
    .lte("date_due", endOfWeek.toISOString().split("T")[0])
    .order("date_due", { ascending: true })

  return (payments || []).map((p: any) => ({
    paymentId: p.id,
    amount: p.amount,
    currency: p.currency,
    dueDate: p.date_due,
    operation: p.operations?.file_code || p.operations?.destination,
    operator: p.operations?.operators?.name || "Sin operador",
  }))
}

/**
 * Obtiene operaciones con check-in próximo y hotelería pendiente de pago
 */
export async function getOperationsWithPendingHotelPayment(user: User, days: number = 30): Promise<any[]> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const futureDate = new Date(today)
  futureDate.setDate(today.getDate() + days)

  const { data: operations } = await (supabase.from("operations") as any)
    .select(`
      id, file_code, destination, check_in_date, operator_cost,
      customers:customer_id(name),
      operators:operator_id(name),
      payments:payments!operation_id(id, amount, status, direction)
    `)
    .gte("check_in_date", today.toISOString().split("T")[0])
    .lte("check_in_date", futureDate.toISOString().split("T")[0])
    .order("check_in_date", { ascending: true })

  const opsWithPendingHotel = (operations || []).filter((op: any) => {
    const pendingToOperator = (op.payments || []).filter(
      (p: any) => p.direction === "EXPENSE" && p.status === "PENDING"
    )
    return pendingToOperator.length > 0
  })

  return opsWithPendingHotel.map((op: any) => {
    const pendingPayments = (op.payments || []).filter(
      (p: any) => p.direction === "EXPENSE" && p.status === "PENDING"
    )
    const totalPending = pendingPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

    return {
      operationId: op.id,
      fileCode: op.file_code,
      destination: op.destination,
      checkInDate: op.check_in_date,
      operatorCost: op.operator_cost,
      pendingAmount: totalPending,
      customer: op.customers?.name || "Sin cliente",
      operator: op.operators?.name || "Sin operador",
    }
  })
}

/**
 * Obtiene la rentabilidad promedio por vendedor
 */
export async function getSellerProfitability(user: User, from?: string, to?: string): Promise<any[]> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  const defaultTo = today.toISOString().split("T")[0]

  const { data: operations } = await (supabase.from("operations") as any)
    .select(`
      sale_amount_total, margin_amount, margin_percentage, seller_id,
      users:seller_id(id, name)
    `)
    .gte("created_at", from || defaultFrom)
    .lte("created_at", to || defaultTo)

  // Agrupar por vendedor
  const sellerStats: Record<string, any> = {}
  for (const op of (operations || [])) {
    const sellerId = op.seller_id
    const sellerName = op.users?.name || "Sin vendedor"
    
    if (!sellerStats[sellerId]) {
      sellerStats[sellerId] = {
        sellerId,
        sellerName,
        totalSales: 0,
        totalMargin: 0,
        operationsCount: 0,
      }
    }
    
    sellerStats[sellerId].totalSales += op.sale_amount_total || 0
    sellerStats[sellerId].totalMargin += op.margin_amount || 0
    sellerStats[sellerId].operationsCount += 1
  }

  return Object.values(sellerStats)
    .map((s: any) => ({
      ...s,
      avgMarginPerOperation: s.operationsCount > 0 ? s.totalMargin / s.operationsCount : 0,
      avgMarginPercent: s.totalSales > 0 ? (s.totalMargin / s.totalSales) * 100 : 0,
    }))
    .sort((a: any, b: any) => b.avgMarginPercent - a.avgMarginPercent)
}

/**
 * Obtiene el resumen de este mes vs mes pasado completo
 */
export async function getMonthSummary(user: User, agencyId?: string): Promise<any> {
  const supabase = await createServerClient()
  
  const today = new Date()
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const currentMonthEnd = today

  let query = (supabase.from("operations") as any)
    .select("sale_amount_total, margin_amount, created_at")
    .gte("created_at", currentMonthStart.toISOString())
    .lte("created_at", currentMonthEnd.toISOString())

  if (user.role === "SELLER") query = query.eq("seller_id", user.id)
  if (agencyId) query = query.eq("agency_id", agencyId)

  const { data: operations } = await query

  const totalSales = (operations || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0)
  const totalMargin = (operations || []).reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0)

  return {
    period: `${currentMonthStart.toISOString().split("T")[0]} a ${currentMonthEnd.toISOString().split("T")[0]}`,
    totalSales,
    totalMargin,
    operationsCount: (operations || []).length,
    avgMarginPercent: totalSales > 0 ? (totalMargin / totalSales) * 100 : 0,
  }
}

