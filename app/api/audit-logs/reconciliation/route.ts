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
    // CHECK 1: CpC ARS — balance contable vs suma de pagos pendientes
    // ============================================
    try {
      const { data: cpcAccounts } = await (supabase.from("financial_accounts") as any)
        .select("id, name, currency, initial_balance")
        .ilike("name", "%Cuentas por Cobrar%")
        .eq("is_active", true)

      if (cpcAccounts && cpcAccounts.length > 0) {
        const accountIds = (cpcAccounts as any[]).map((a: any) => a.id)
        const balances = await getAccountBalancesBatch(accountIds, supabase)

        for (const acc of cpcAccounts as any[]) {
          const balance = balances[acc.id] || 0

          // Sumar pagos PENDING de clientes en esta moneda
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
            description: `Cuenta por Cobrar ${acc.currency}: balance contable vs pagos pendientes de clientes`,
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
    // CHECK 2: CpP — balance contable vs operator_payments pendientes
    // ============================================
    try {
      const { data: cppAccounts } = await (supabase.from("financial_accounts") as any)
        .select("id, name, currency, initial_balance")
        .ilike("name", "%Cuentas por Pagar%")
        .eq("is_active", true)

      if (cppAccounts && cppAccounts.length > 0) {
        const accountIds = (cppAccounts as any[]).map((a: any) => a.id)
        const balances = await getAccountBalancesBatch(accountIds, supabase)

        for (const acc of cppAccounts as any[]) {
          const balance = balances[acc.id] || 0

          // Sumar operator_payments pendientes
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
            description: `Cuenta por Pagar ${acc.currency}: balance contable vs deuda pendiente a operadores`,
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
    // CHECK 3: Partida doble — verificar que cada pago PAID tiene sus movimientos contables
    // ============================================
    try {
      const { data: paidWithoutLedger } = await (supabase.from("payments") as any)
        .select("id, amount, currency, direction")
        .eq("status", "PAID")
        .is("ledger_movement_id", null)

      const orphanCount = paidWithoutLedger?.length || 0

      checks.push({
        id: "orphan-payments",
        name: "Pagos sin asiento contable",
        description: "Pagos marcados como PAID que no tienen movimiento contable asociado",
        status: orphanCount === 0 ? "ok" : orphanCount < 5 ? "warning" : "error",
        expected: "0 pagos huérfanos",
        actual: `${orphanCount} pagos sin ledger_movement_id`,
        details: orphanCount === 0
          ? "Todos los pagos pagados tienen su asiento contable asociado"
          : `Hay ${orphanCount} pago(s) marcados como PAID sin movimiento contable. Esto puede causar descuadres en balances.`,
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
    // ============================================
    try {
      const { count: orphanCashMovements } = await (supabase.from("cash_movements") as any)
        .select("id", { count: "exact", head: true })
        .is("financial_account_id", null)

      const orphanCount = orphanCashMovements || 0

      checks.push({
        id: "orphan-cash",
        name: "Movimientos de caja sin cuenta",
        description: "Movimientos de caja que no están vinculados a ninguna cuenta financiera",
        status: orphanCount === 0 ? "ok" : orphanCount < 10 ? "warning" : "error",
        expected: "0 movimientos huérfanos",
        actual: `${orphanCount} movimientos sin cuenta financiera`,
        details: orphanCount === 0
          ? "Todos los movimientos de caja están vinculados a una cuenta financiera"
          : `Hay ${orphanCount} movimiento(s) sin cuenta. Estos no aparecen en los balances de cuentas.`,
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
