import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getMonthlyIVAToPay } from "@/lib/accounting/iva"
import { getAccountBalance } from "@/lib/accounting/ledger"
import { getOverdueOperatorPayments as getOverdueOperatorPaymentsService } from "@/lib/accounting/operator-payments"
import type { Database } from "@/lib/supabase/types"

type User = Database["public"]["Tables"]["users"]["Row"]

/**
 * Obtiene un resumen de ventas para un rango de fechas
 */
export async function getSalesSummary(
  user: User,
  from?: string,
  to?: string,
  agencyId?: string,
): Promise<any> {
  const supabase = await createServerClient()

  // Get user agencies
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)

  const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

  let query = supabase.from("operations").select("sale_amount_total, margin_amount, operator_cost, currency, created_at")

  // Apply role-based filtering
  if (user.role === "SELLER") {
    query = query.eq("seller_id", user.id)
  } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
    query = query.in("agency_id", agencyIds)
  }

  // Apply filters
  if (from) {
    query = query.gte("created_at", from)
  }

  if (to) {
    query = query.lte("created_at", to)
  }

  if (agencyId && agencyId !== "ALL") {
    query = query.eq("agency_id", agencyId)
  }

  const { data: operations, error: operationsError } = await query

  if (operationsError) {
    console.error("[getSalesSummary] Error fetching operations:", operationsError)
    return {
      totalSales: 0,
      totalMargin: 0,
      totalCost: 0,
      operationsCount: 0,
      avgMarginPercent: 0,
      error: operationsError.message,
    }
  }

  console.log(`[getSalesSummary] Encontradas ${(operations || []).length} operaciones para período ${from || "sin inicio"} - ${to || "sin fin"}`)

  const totalSales = (operations || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0)
  const totalMargin = (operations || []).reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0)
  const totalCost = (operations || []).reduce((sum: number, op: any) => sum + (op.operator_cost || 0), 0)
  const operationsCount = (operations || []).length

  console.log(`[getSalesSummary] Resumen: ${operationsCount} operaciones, $${totalSales} ventas, $${totalMargin} margen`)

  return {
    totalSales,
    totalMargin,
    totalCost,
    operationsCount,
    avgMarginPercent: totalSales > 0 ? (totalMargin / totalSales) * 100 : 0,
  }
}

/**
 * Obtiene pagos vencidos o próximos a vencer
 */
export async function getDuePayments(user: User, date?: string, type?: "CUSTOMER" | "OPERATOR"): Promise<any[]> {
  const supabase = await createServerClient()
  const targetDate = date || new Date().toISOString().split("T")[0]

  // Get user agencies
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)

  const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

  // First get operation IDs based on permissions
  let operationsQuery = supabase.from("operations").select("id")

  if (user.role === "SELLER") {
    operationsQuery = operationsQuery.eq("seller_id", user.id)
  } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
    operationsQuery = operationsQuery.in("agency_id", agencyIds)
  }

  const { data: allowedOperations } = await operationsQuery
  const allowedOperationIds = (allowedOperations || []).map((op: any) => op.id)

  if (allowedOperationIds.length === 0 && user.role !== "SUPER_ADMIN") {
    return []
  }

  let query = supabase
    .from("payments")
    .select(
      `
      *,
      operations:operation_id(
        id,
        destination,
        agencies:agency_id(name)
      )
    `,
    )
    .eq("status", "PENDING")
    .lte("date_due", targetDate)

  if (user.role !== "SUPER_ADMIN") {
    query = query.in("operation_id", allowedOperationIds)
  }

  if (type) {
    query = query.eq("payer_type", type)
  }

  const { data: payments } = await query

  return (payments || []).map((p: any) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    date_due: p.date_due,
    direction: p.direction,
    payer_type: p.payer_type,
    operation: p.operations?.destination || "Sin destino",
    agency: p.operations?.agencies?.name || "Sin agencia",
  }))
}

/**
 * Obtiene el performance de un vendedor
 */
export async function getSellerPerformance(
  user: User,
  sellerId: string,
  from?: string,
  to?: string,
): Promise<any> {
  const supabase = await createServerClient()

  // Check permissions
  if (user.role === "SELLER" && sellerId !== user.id) {
    throw new Error("No tienes permiso para ver datos de otros vendedores")
  }

  let query = supabase
    .from("operations")
    .select("sale_amount_total, margin_amount, operator_cost, currency, created_at")
    .eq("seller_id", sellerId)

  if (from) {
    query = query.gte("created_at", from)
  }

  if (to) {
    query = query.lte("created_at", to)
  }

  const { data: operations } = await query

  const totalSales = (operations || []).reduce((sum: number, op: any) => sum + (op.sale_amount_total || 0), 0)
  const totalMargin = (operations || []).reduce((sum: number, op: any) => sum + (op.margin_amount || 0), 0)
  const operationsCount = (operations || []).length

  return {
    sellerId,
    totalSales,
    totalMargin,
    operationsCount,
    avgMarginPercent: totalSales > 0 ? (totalMargin / totalSales) * 100 : 0,
  }
}

/**
 * Obtiene los top destinos
 */
export async function getTopDestinations(
  user: User,
  from?: string,
  to?: string,
  limit: number = 5,
): Promise<any[]> {
  const supabase = await createServerClient()

  // Get user agencies
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)

  const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

  let query = supabase.from("operations").select("destination, sale_amount_total, margin_amount")

  // Apply role-based filtering
  if (user.role === "SELLER") {
    query = query.eq("seller_id", user.id)
  } else if (agencyIds.length > 0 && user.role !== "SUPER_ADMIN") {
    query = query.in("agency_id", agencyIds)
  }

  // Apply filters
  if (from) {
    query = query.gte("created_at", from)
  }

  if (to) {
    query = query.lte("created_at", to)
  }

  const { data: operations } = await query

  // Group by destination
  const destinationStats = (operations || []).reduce((acc: any, op: any) => {
    const destination = op.destination || "Sin destino"

    if (!acc[destination]) {
      acc[destination] = {
        destination,
        totalSales: 0,
        totalMargin: 0,
        operationsCount: 0,
      }
    }

    acc[destination].totalSales += op.sale_amount_total || 0
    acc[destination].totalMargin += op.margin_amount || 0
    acc[destination].operationsCount += 1

    return acc
  }, {})

  return Object.values(destinationStats)
    .map((dest: any) => ({
      ...dest,
      avgMarginPercent: dest.totalSales > 0 ? (dest.totalMargin / dest.totalSales) * 100 : 0,
    }))
    .sort((a: any, b: any) => b.totalSales - a.totalSales)
    .slice(0, limit)
}

/**
 * Obtiene balances de operadores
 */
export async function getOperatorBalances(user: User, onlyOverdue: boolean = false): Promise<any[]> {
  const supabase = await createServerClient()

  // Get all operators with their operations and payments
  const { data: operators } = await supabase
    .from("operators")
    .select(
      `
      *,
      operations:operations!operator_id (
        id,
        operator_cost,
        payments:payments!operation_id (
          id,
          amount,
          status,
          direction,
          date_due
        )
      )
    `,
    )
    .order("name")

  const operatorsWithBalances = (operators || []).map((op: any) => {
    const operations = (op.operations || []) as any[]
    const totalCost = operations.reduce((sum: number, o: any) => sum + (o.operator_cost || 0), 0)

    const paidAmount = operations.reduce((sum: number, o: any) => {
      const payments = (o.payments || []) as any[]
      const paidPayments = payments.filter((p: any) => p.direction === "EXPENSE" && p.status === "PAID")
      return sum + paidPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
    }, 0)

    const balance = totalCost - paidAmount

    // Get overdue payments
    const overduePayments = operations
      .flatMap((o: any) => (o.payments || []) as any[])
      .filter((p: any) => p.direction === "EXPENSE" && p.status === "PENDING" && new Date(p.date_due) < new Date())

    return {
      id: op.id,
      name: op.name,
      totalCost,
      paidAmount,
      balance,
      hasOverdue: overduePayments.length > 0,
      overdueAmount: overduePayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
    }
  })

  if (onlyOverdue) {
    return operatorsWithBalances.filter((op: any) => op.hasOverdue)
  }

  return operatorsWithBalances.filter((op: any) => op.balance > 0)
}

/**
 * Obtiene el estado de IVA para un período
 */
export async function getIVAStatus(
  user: User,
  year?: number,
  month?: number,
): Promise<any> {
  const supabase = await createServerClient()
  const now = new Date()
  const targetYear = year || now.getFullYear()
  const targetMonth = month || now.getMonth() + 1

  try {
    const ivaStatus = await getMonthlyIVAToPay(supabase, targetYear, targetMonth)

    return {
      year: targetYear,
      month: targetMonth,
      totalSalesIVA: ivaStatus.total_sales_iva,
      totalPurchasesIVA: ivaStatus.total_purchases_iva,
      ivaToPay: ivaStatus.iva_to_pay,
      status: ivaStatus.iva_to_pay > 0 ? "PENDING" : "PAID",
    }
  } catch (error) {
    console.error("Error getting IVA status:", error)
    return {
      year: targetYear,
      month: targetMonth,
      totalSalesIVA: 0,
      totalPurchasesIVA: 0,
      ivaToPay: 0,
      status: "UNKNOWN",
    }
  }
}

/**
 * Obtiene balances de cuentas financieras
 */
export async function getCashBalances(user: User): Promise<any[]> {
  const supabase = await createServerClient()

  try {
    const { data: accounts } = await (supabase.from("financial_accounts") as any)
      .select("*")
      .order("type", { ascending: true })
      .order("currency", { ascending: true })

    const accountsWithBalance = await Promise.all(
      (accounts || []).map(async (account: any) => {
        try {
          const balance = await getAccountBalance(account.id, supabase)
          return {
            id: account.id,
            name: account.name,
            type: account.type,
            currency: account.currency,
            initialBalance: account.initial_balance || 0,
            currentBalance: balance,
          }
        } catch (error) {
          console.error(`Error calculating balance for account ${account.id}:`, error)
          return {
            id: account.id,
            name: account.name,
            type: account.type,
            currency: account.currency,
            initialBalance: account.initial_balance || 0,
            currentBalance: account.initial_balance || 0,
          }
        }
      })
    )

    return accountsWithBalance
  } catch (error) {
    console.error("Error getting cash balances:", error)
    return []
  }
}

/**
 * Obtiene el estado de FX (ganancias y pérdidas cambiarias)
 */
export async function getFXStatus(
  user: User,
  days: number = 30,
): Promise<any> {
  const supabase = await createServerClient()

  try {
    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - days)

    // Obtener movimientos FX del período
    const { data: fxMovements } = await (supabase.from("ledger_movements") as any)
      .select("type, amount_ars_equivalent")
      .in("type", ["FX_GAIN", "FX_LOSS"])
      .gte("created_at", dateFrom.toISOString())

    const totalGains = (fxMovements || [])
      .filter((m: any) => m.type === "FX_GAIN")
      .reduce((sum: number, m: any) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

    const totalLosses = (fxMovements || [])
      .filter((m: any) => m.type === "FX_LOSS")
      .reduce((sum: number, m: any) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

    const netFX = totalGains - totalLosses

    return {
      period: `Últimos ${days} días`,
      totalGains,
      totalLosses,
      netFX,
      status: netFX >= 0 ? "POSITIVE" : "NEGATIVE",
    }
  } catch (error) {
    console.error("Error getting FX status:", error)
    return {
      period: `Últimos ${days} días`,
      totalGains: 0,
      totalLosses: 0,
      netFX: 0,
      status: "UNKNOWN",
    }
  }
}

/**
 * Obtiene pagos a operadores vencidos
 */
export async function getOverdueOperatorPayments(user: User): Promise<any[]> {
  const supabase = await createServerClient()

  try {
    const overduePayments = await getOverdueOperatorPaymentsService(supabase, undefined)

    return overduePayments.map((payment: any) => ({
      id: payment.id,
      operation: payment.operations?.file_code || payment.operations?.destination || "Sin operación",
      operator: payment.operators?.name || "Sin operador",
      amount: payment.amount,
      currency: payment.currency,
      dueDate: payment.due_date,
      daysOverdue: Math.floor(
        (new Date().getTime() - new Date(payment.due_date).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }))
  } catch (error) {
    console.error("Error getting overdue operator payments:", error)
    return []
  }
}

/**
 * Obtiene el margen de una operación específica
 */
export async function getOperationMargin(
  user: User,
  operationId: string,
): Promise<any> {
  const supabase = await createServerClient()

  try {
    const { data: operation } = await (supabase.from("operations") as any)
      .select(
        `
        *,
        sellers:seller_id(id, name),
        operators:operator_id(id, name)
      `
      )
      .eq("id", operationId)
      .single()

    if (!operation) {
      throw new Error("Operación no encontrada")
    }

    // Obtener movimientos del ledger para esta operación
    const { data: movements } = await (supabase.from("ledger_movements") as any)
      .select("type, amount_ars_equivalent")
      .eq("operation_id", operationId)

    const totalIncome = (movements || [])
      .filter((m: any) => m.type === "INCOME")
      .reduce((sum: number, m: any) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

    const totalExpenses = (movements || [])
      .filter((m: any) => m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT")
      .reduce((sum: number, m: any) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

    const fxGains = (movements || [])
      .filter((m: any) => m.type === "FX_GAIN")
      .reduce((sum: number, m: any) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

    const fxLosses = (movements || [])
      .filter((m: any) => m.type === "FX_LOSS")
      .reduce((sum: number, m: any) => sum + parseFloat(m.amount_ars_equivalent || "0"), 0)

    const netMargin = totalIncome - totalExpenses + fxGains - fxLosses

    return {
      operationId,
      fileCode: operation.file_code,
      destination: operation.destination,
      saleAmount: operation.sale_amount_total,
      operatorCost: operation.operator_cost,
      marginAmount: operation.margin_amount,
      marginPercentage: operation.margin_percentage,
      totalIncome,
      totalExpenses,
      fxGains,
      fxLosses,
      netMargin,
      seller: operation.sellers?.name || "Sin vendedor",
      operator: operation.operators?.name || "Sin operador",
    }
  } catch (error) {
    console.error("Error getting operation margin:", error)
    throw error
  }
}

