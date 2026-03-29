import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalancesBatch } from "@/lib/accounting/ledger"

/**
 * GET /api/audit-logs/reconciliation
 * Ejecuta verificaciones de integridad contable del sistema
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()

    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role as string)) {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const checks: Array<{
      id: string
      name: string
      description: string
      status: "ok" | "warning" | "error"
      expected?: string
      actual?: string
      difference?: string
      details?: string
    }> = []

    // ============================================
    // CHECK 1: CpC — balance contable vs suma de pagos pendientes (por moneda)
    // Busca cuentas financieras vinculadas al código 1.1.03 del plan de cuentas
    // ============================================
    try {
      // Obtener el chart_account_id para CpC (código 1.1.03)
      const { data: cpcChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "1.1.03")
        .maybeSingle()

      if (cpcChart) {
        const { data: cpcAccounts } = await (supabase.from("financial_accounts") as any)
          .select("id, name, currency, initial_balance")
          .eq("chart_account_id", cpcChart.id)
          .eq("is_active", true)

        if (cpcAccounts && cpcAccounts.length > 0) {
          const accountIds = (cpcAccounts as any[]).map((a: any) => a.id)
          const balances = await getAccountBalancesBatch(accountIds, supabase)

          for (const acc of cpcAccounts as any[]) {
            const balance = balances[acc.id] || 0

            // Sumar pagos PENDING de clientes en la MISMA moneda de esta cuenta
            const { data: pendingPayments } = await (supabase.from("payments") as any)
              .select("amount")
              .eq("direction", "INCOME")
              .eq("status", "PENDING")
              .eq("currency", acc.currency)

            const pendingTotal = pendingPayments
              ? (pendingPayments as any[]).reduce((sum: number, p: any) => sum + Number(p.amount), 0)
              : 0

            const diff = Math.abs(balance - pendingTotal)
            const threshold = acc.currency === "USD" ? 100 : 50000

            checks.push({
              id: `cpc-${acc.currency}`,
              name: `CpC ${acc.currency}`,
              description: `Cuenta por Cobrar ${acc.currency}: balance contable vs pagos pendientes de clientes en ${acc.currency}`,
              status: diff < threshold ? "ok" : diff < threshold * 5 ? "warning" : "error",
              expected: `${acc.currency} ${pendingTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
              actual: `${acc.currency} ${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
              difference: `${acc.currency} ${diff.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
              details: diff < threshold
                ? "Los valores coinciden dentro del margen aceptable"
                : "Hay una diferencia significativa. Puede deberse a pagos parciales, ajustes manuales o movimientos contables sin pago asociado.",
            })
          }
        }
      } else {
        checks.push({
          id: "cpc-check",
          name: "CpC",
          description: "Verificación de Cuentas por Cobrar",
          status: "warning",
          details: "No se encontró el código 1.1.03 en el plan de cuentas",
        })
      }
    } catch (err) {
      checks.push({
        id: "cpc-check",
        name: "CpC",
        description: "Verificación de Cuentas por Cobrar",
        status: "error",
        details: `Error al verificar: ${err instanceof Error ? err.message : "desconocido"}`,
      })
    }

    // ============================================
    // CHECK 2: CpP — balance contable vs operator_payments pendientes (por moneda)
    // Busca cuentas financieras vinculadas al código 2.1.01 del plan de cuentas
    // ============================================
    try {
      // Obtener el chart_account_id para CpP (código 2.1.01)
      const { data: cppChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "2.1.01")
        .maybeSingle()

      if (cppChart) {
        const { data: cppAccounts } = await (supabase.from("financial_accounts") as any)
          .select("id, name, currency, initial_balance")
          .eq("chart_account_id", cppChart.id)
          .eq("is_active", true)

        if (cppAccounts && cppAccounts.length > 0) {
          const accountIds = (cppAccounts as any[]).map((a: any) => a.id)
          const balances = await getAccountBalancesBatch(accountIds, supabase)

          for (const acc of cppAccounts as any[]) {
            const balance = balances[acc.id] || 0

            // Sumar operator_payments pendientes en la MISMA moneda
            const { data: pendingOpPayments } = await (supabase.from("operator_payments") as any)
              .select("amount, paid_amount")
              .in("status", ["PENDING", "OVERDUE"])
              .eq("currency", acc.currency)

            const pendingTotal = pendingOpPayments
              ? (pendingOpPayments as any[]).reduce(
                  (sum: number, p: any) => sum + (Number(p.amount) - Number(p.paid_amount || 0)),
                  0
                )
              : 0

            const diff = Math.abs(balance - pendingTotal)
            const threshold = acc.currency === "USD" ? 100 : 50000

            checks.push({
              id: `cpp-${acc.currency}`,
              name: `CpP ${acc.currency}`,
              description: `Cuenta por Pagar ${acc.currency}: balance contable vs deuda pendiente a operadores en ${acc.currency}`,
              status: diff < threshold ? "ok" : diff < threshold * 5 ? "warning" : "error",
              expected: `${acc.currency} ${pendingTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
              actual: `${acc.currency} ${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
              difference: `${acc.currency} ${diff.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
              details: diff < threshold
                ? "Los valores coinciden dentro del margen aceptable"
                : "Hay diferencia. Puede deberse a pagos parciales de operadores o ajustes contables.",
            })
          }
        }
      } else {
        checks.push({
          id: "cpp-check",
          name: "CpP",
          description: "Verificación de Cuentas por Pagar",
          status: "warning",
          details: "No se encontró el código 2.1.01 en el plan de cuentas",
        })
      }
    } catch (err) {
      checks.push({
        id: "cpp-check",
        name: "CpP",
        description: "Verificación de Cuentas por Pagar",
        status: "error",
        details: `Error al verificar: ${err instanceof Error ? err.message : "desconocido"}`,
      })
    }

    // ============================================
    // CHECK 3: Partida doble — pagos PAID sin asiento contable
    // Excluye pagos importados (sin ledger por diseño de la importación inicial)
    // ============================================
    try {
      // Contar pagos PAID sin ledger_movement_id creados DESPUÉS de la importación inicial
      // Los pagos importados no tienen ledger por diseño — solo alertamos los nuevos
      const { count: totalWithout } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PAID")
        .is("ledger_movement_id", null)

      const { count: recentWithout } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PAID")
        .is("ledger_movement_id", null)
        .gte("created_at", "2025-06-01T00:00:00Z") // Después de la importación

      const totalOrphan = totalWithout || 0
      const recentOrphan = recentWithout || 0
      const importedOrphan = totalOrphan - recentOrphan

      checks.push({
        id: "orphan-payments",
        name: "Pagos sin asiento contable",
        description: "Pagos marcados como PAID que no tienen movimiento contable asociado",
        status: recentOrphan === 0 ? "ok" : recentOrphan < 5 ? "warning" : "error",
        expected: "0 pagos sin asiento (post-importación)",
        actual: recentOrphan > 0
          ? `${recentOrphan} pagos recientes sin asiento`
          : "Todos los pagos recientes tienen asiento",
        details: recentOrphan === 0
          ? `Todos los pagos recientes tienen su asiento contable.${importedOrphan > 0 ? ` (${importedOrphan} pagos de la importación inicial sin asiento — esto es esperado)` : ""}`
          : `${recentOrphan} pago(s) recientes sin movimiento contable.${importedOrphan > 0 ? ` Además, ${importedOrphan} pagos de la importación inicial sin asiento (esperado).` : ""}`,
      })
    } catch (err) {
      checks.push({
        id: "orphan-payments",
        name: "Pagos huérfanos",
        description: "Verificación de integridad pagos-ledger",
        status: "error",
        details: `Error al verificar: ${err instanceof Error ? err.message : "desconocido"}`,
      })
    }

    // ============================================
    // CHECK 4: Movimientos de caja sin cuenta financiera
    // Los movimientos de la importación inicial no tenían cuenta asignada por diseño
    // ============================================
    try {
      const { count: totalWithout } = await (supabase.from("cash_movements") as any)
        .select("id", { count: "exact", head: true })
        .is("financial_account_id", null)

      const { count: recentWithout } = await (supabase.from("cash_movements") as any)
        .select("id", { count: "exact", head: true })
        .is("financial_account_id", null)
        .gte("created_at", "2025-06-01T00:00:00Z") // Después de la importación

      const totalOrphan = totalWithout || 0
      const recentOrphan = recentWithout || 0
      const importedOrphan = totalOrphan - recentOrphan

      checks.push({
        id: "orphan-cash",
        name: "Movimientos de caja sin cuenta",
        description: "Movimientos de caja que no están vinculados a ninguna cuenta financiera",
        status: recentOrphan === 0 ? "ok" : recentOrphan < 10 ? "warning" : "error",
        expected: "0 movimientos sin cuenta (post-importación)",
        actual: recentOrphan > 0
          ? `${recentOrphan} movimientos recientes sin cuenta`
          : "Todos los movimientos recientes tienen cuenta",
        details: recentOrphan === 0
          ? `Todos los movimientos recientes están vinculados a una cuenta.${importedOrphan > 0 ? ` (${importedOrphan} movimientos de la importación inicial sin cuenta — esto es esperado)` : ""}`
          : `${recentOrphan} movimiento(s) recientes sin cuenta financiera.${importedOrphan > 0 ? ` Además, ${importedOrphan} de la importación inicial (esperado).` : ""}`,
      })
    } catch (err) {
      checks.push({
        id: "orphan-cash",
        name: "Movimientos huérfanos",
        description: "Verificación de movimientos de caja",
        status: "error",
        details: `Error al verificar: ${err instanceof Error ? err.message : "desconocido"}`,
      })
    }

    // ============================================
    // CHECK 5: Operaciones con margen negativo
    // ============================================
    try {
      const { data: negativeMargin, count } = await (supabase.from("operations") as any)
        .select("id, destination, margin_amount, sale_amount_total, operator_cost", { count: "exact" })
        .lt("margin_amount", 0)
        .not("status", "eq", "CANCELLED")
        .limit(5)

      const negCount = count || 0

      checks.push({
        id: "negative-margin",
        name: "Operaciones con margen negativo",
        description: "Operaciones activas donde el costo supera al precio de venta",
        status: negCount === 0 ? "ok" : "warning",
        expected: "0 operaciones",
        actual: `${negCount} operaciones con margen negativo`,
        details: negCount === 0
          ? "Todas las operaciones activas tienen margen positivo o cero"
          : `Hay ${negCount} operación(es) donde se vende por debajo del costo. Revisar: ${
              negativeMargin ? (negativeMargin as any[]).map((o: any) => o.destination).join(", ") : ""
            }`,
      })
    } catch (err) {
      checks.push({
        id: "negative-margin",
        name: "Márgenes negativos",
        description: "Verificación de márgenes",
        status: "error",
        details: `Error: ${err instanceof Error ? err.message : "desconocido"}`,
      })
    }

    // ============================================
    // CHECK 6: Pagos PROCESSING (stuck)
    // ============================================
    try {
      const { count: processingCount } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PROCESSING")

      const stuckCount = processingCount || 0

      checks.push({
        id: "stuck-processing",
        name: "Pagos trabados en PROCESSING",
        description: "Pagos que quedaron en estado transitorio PROCESSING (posible error en mark-paid)",
        status: stuckCount === 0 ? "ok" : "error",
        expected: "0 pagos",
        actual: `${stuckCount} pagos en PROCESSING`,
        details: stuckCount === 0
          ? "No hay pagos trabados"
          : `Hay ${stuckCount} pago(s) en estado PROCESSING. Esto indica que el proceso de pago falló a mitad de camino. Deben revertirse a PENDING manualmente.`,
      })
    } catch (err) {
      checks.push({
        id: "stuck-processing",
        name: "Pagos PROCESSING",
        description: "Verificación de estados transitorios",
        status: "error",
        details: `Error: ${err instanceof Error ? err.message : "desconocido"}`,
      })
    }

    // Resumen
    const summary = {
      total: checks.length,
      ok: checks.filter((c) => c.status === "ok").length,
      warnings: checks.filter((c) => c.status === "warning").length,
      errors: checks.filter((c) => c.status === "error").length,
      checkedAt: new Date().toISOString(),
    }

    return NextResponse.json({ checks, summary })
  } catch (error: any) {
    console.error("Error in reconciliation:", error)
    return NextResponse.json({ error: error.message || "Error" }, { status: 500 })
  }
}
