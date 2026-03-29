import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

/**
 * GET /api/audit-logs/health
 * Dashboard de salud financiera del sistema
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()

    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role as string)) {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const indicators: Array<{
      id: string
      name: string
      value: string
      status: "green" | "yellow" | "red"
      description: string
    }> = []

    // ============================================
    // 1. Tipo de cambio actualizado
    // ============================================
    try {
      const { data: latestRate } = await (supabase.from("exchange_rates") as any)
        .select("rate, rate_date, source")
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestRate) {
        const rateDate = new Date(latestRate.rate_date)
        const today = new Date()
        const diffDays = Math.floor((today.getTime() - rateDate.getTime()) / (1000 * 60 * 60 * 24))

        indicators.push({
          id: "exchange-rate",
          name: "Tipo de cambio",
          value: `$${Number(latestRate.rate).toLocaleString("es-AR")} (${latestRate.rate_date})`,
          status: diffDays <= 1 ? "green" : diffDays <= 3 ? "yellow" : "red",
          description: diffDays === 0
            ? "Actualizado hoy"
            : diffDays === 1
            ? "Actualizado ayer"
            : `Última actualización hace ${diffDays} días`,
        })
      } else {
        indicators.push({
          id: "exchange-rate",
          name: "Tipo de cambio",
          value: "Sin datos",
          status: "red",
          description: "No hay tasas de cambio cargadas en el sistema",
        })
      }
    } catch {
      indicators.push({
        id: "exchange-rate",
        name: "Tipo de cambio",
        value: "Error",
        status: "red",
        description: "No se pudo verificar",
      })
    }

    // ============================================
    // 2. Pagos vencidos
    // ============================================
    try {
      const today = new Date().toISOString().split("T")[0]

      // Pagos de clientes vencidos
      const { count: overdueIncome } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING")
        .eq("direction", "INCOME")
        .lt("date_due", today)

      // Pagos a operadores vencidos
      const { count: overdueExpense } = await (supabase.from("operator_payments") as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["PENDING", "OVERDUE"])
        .lt("due_date", today)

      const totalOverdue = (overdueIncome || 0) + (overdueExpense || 0)

      indicators.push({
        id: "overdue-payments",
        name: "Pagos vencidos",
        value: `${totalOverdue} pagos`,
        status: totalOverdue === 0 ? "green" : totalOverdue <= 5 ? "yellow" : "red",
        description: totalOverdue === 0
          ? "No hay pagos vencidos"
          : `${overdueIncome || 0} cobranzas de clientes + ${overdueExpense || 0} pagos a operadores vencidos`,
      })
    } catch {
      indicators.push({
        id: "overdue-payments",
        name: "Pagos vencidos",
        value: "Error",
        status: "red",
        description: "No se pudo verificar",
      })
    }

    // ============================================
    // 3. Operaciones sin pagos registrados
    // ============================================
    try {
      // Operaciones CONFIRMED sin ningún pago creado
      const { data: opsWithoutPayments } = await (supabase.from("operations") as any)
        .select("id")
        .in("status", ["CONFIRMED", "IN_PROGRESS"])
        .gt("sale_amount_total", 0)

      let opsWithoutPaymentCount = 0
      if (opsWithoutPayments) {
        for (const op of opsWithoutPayments as any[]) {
          const { count } = await (supabase.from("payments") as any)
            .select("id", { count: "exact", head: true })
            .eq("operation_id", op.id)
            .eq("direction", "INCOME")

          if (!count || count === 0) opsWithoutPaymentCount++
        }
      }

      indicators.push({
        id: "ops-no-payments",
        name: "Operaciones sin pagos",
        value: `${opsWithoutPaymentCount} operaciones`,
        status: opsWithoutPaymentCount === 0 ? "green" : opsWithoutPaymentCount <= 3 ? "yellow" : "red",
        description: opsWithoutPaymentCount === 0
          ? "Todas las operaciones activas tienen pagos registrados"
          : `${opsWithoutPaymentCount} operación(es) confirmadas sin ningún pago de cliente registrado`,
      })
    } catch {
      indicators.push({
        id: "ops-no-payments",
        name: "Operaciones sin pagos",
        value: "Error",
        status: "red",
        description: "No se pudo verificar",
      })
    }

    // ============================================
    // 4. Comisiones pendientes de pago
    // ============================================
    try {
      const { data: pendingCommissions, count: pendingCount } = await (supabase.from("commission_records") as any)
        .select("amount, currency", { count: "exact" })
        .eq("status", "PENDING")

      const totalPending = pendingCommissions
        ? (pendingCommissions as any[]).reduce((sum: number, c: any) => sum + Number(c.amount), 0)
        : 0

      indicators.push({
        id: "pending-commissions",
        name: "Comisiones pendientes",
        value: `${pendingCount || 0} comisiones`,
        status: (pendingCount || 0) === 0 ? "green" : (pendingCount || 0) <= 10 ? "yellow" : "red",
        description: (pendingCount || 0) === 0
          ? "No hay comisiones pendientes de pago"
          : `${pendingCount} comisión(es) pendiente(s) de pago a vendedores`,
      })
    } catch {
      indicators.push({
        id: "pending-commissions",
        name: "Comisiones pendientes",
        value: "Error",
        status: "red",
        description: "No se pudo verificar",
      })
    }

    // ============================================
    // 5. Actividad reciente del sistema
    // ============================================
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { count: recentOps } = await (supabase.from("operations") as any)
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneDayAgo)

      const { count: recentPayments } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneDayAgo)

      indicators.push({
        id: "recent-activity",
        name: "Actividad últimas 24hs",
        value: `${recentOps || 0} ops, ${recentPayments || 0} pagos`,
        status: "green",
        description: `${recentOps || 0} operaciones y ${recentPayments || 0} pagos creados en las últimas 24 horas`,
      })
    } catch {
      indicators.push({
        id: "recent-activity",
        name: "Actividad reciente",
        value: "Error",
        status: "red",
        description: "No se pudo verificar",
      })
    }

    // ============================================
    // 6. Alertas activas
    // ============================================
    try {
      const { count: activeAlerts } = await (supabase.from("alerts") as any)
        .select("id", { count: "exact", head: true })
        .eq("is_resolved", false)

      indicators.push({
        id: "active-alerts",
        name: "Alertas activas",
        value: `${activeAlerts || 0} alertas`,
        status: (activeAlerts || 0) === 0 ? "green" : (activeAlerts || 0) <= 5 ? "yellow" : "red",
        description: (activeAlerts || 0) === 0
          ? "No hay alertas pendientes"
          : `${activeAlerts} alerta(s) sin resolver en el sistema`,
      })
    } catch {
      indicators.push({
        id: "active-alerts",
        name: "Alertas activas",
        value: "Error",
        status: "red",
        description: "No se pudo verificar",
      })
    }

    // Resumen global
    const overallStatus =
      indicators.some((i) => i.status === "red")
        ? "red"
        : indicators.some((i) => i.status === "yellow")
        ? "yellow"
        : "green"

    return NextResponse.json({
      indicators,
      overallStatus,
      checkedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in health check:", error)
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 })
  }
}
