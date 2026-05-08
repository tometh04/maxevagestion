import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/audit-logs/reconciliation
 * Verificaciones de integridad contable del sistema.
 *
 * Cutoff per-tenant explícito vía organizations.legacy_import_until
 * (migration 20260505000001):
 *   - Si la columna está seteada (Lozada = 2026-02-19) → excluye movimientos
 *     anteriores de los chequeos.
 *   - Si null (tenants nuevos default) → fallback a org.created_at: cualquier
 *     pago/movimiento creado antes que la org existiera es ruido del seed
 *     y no rompe los checks de integridad real.
 */

export async function GET() {
  try {
    const { user } = await getCurrentUser()

    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role as string)) {
      return NextResponse.json({ error: "No tiene permisos" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Resolver cutoff per-tenant: legacy_import_until (si seteado) o
    // org.created_at (fallback). Por RLS, sólo devuelve la org del user.
    const { data: org } = await (supabase.from("organizations") as any)
      .select("id, created_at, legacy_import_until")
      .eq("id", user.org_id)
      .maybeSingle()

    const legacyUntil = org?.legacy_import_until as string | null | undefined
    const orgCreated = org?.created_at as string | undefined
    // Prioridad: 1) legacy_import_until explícito, 2) org.created_at, 3) epoch.
    const POST_IMPORT_DATE =
      legacyUntil || orgCreated || "1970-01-01T00:00:00Z"
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
    // CHECK 1: Pagos PAID sin asiento contable (post-importación)
    //
    // 2026-05-07: agregamos `.eq("is_legacy_import", false)` para excluir
    // los 125 pagos del bulk import del 29/04 (pipeline payments-suelto).
    // Esos pagos están en estado PAID por diseño pero sin ledger/cash —
    // el dinero ya entró al banco real antes del import. La columna
    // `is_legacy_import` se backfillea en la migración 20260507000003.
    // ============================================
    try {
      const { count: totalWithout } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PAID")
        .eq("is_legacy_import", false)
        .is("ledger_movement_id", null)

      const { count: recentWithout } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PAID")
        .eq("is_legacy_import", false)
        .is("ledger_movement_id", null)
        .gte("created_at", POST_IMPORT_DATE)

      const totalOrphan = totalWithout || 0
      const recentOrphan = recentWithout || 0
      const importedOrphan = totalOrphan - recentOrphan

      checks.push({
        id: "orphan-payments",
        name: "Pagos sin asiento contable",
        description: "Pagos PAID sin movimiento contable (excluyendo importación masiva)",
        status: recentOrphan === 0 ? "ok" : recentOrphan < 5 ? "warning" : "error",
        expected: "0 pagos sin asiento",
        actual: recentOrphan === 0
          ? "Todos los pagos post-importación tienen asiento"
          : `${recentOrphan} pagos sin asiento`,
        details: recentOrphan === 0
          ? `OK.${importedOrphan > 0 ? ` (${importedOrphan} pagos de la importación inicial sin asiento — esperado por diseño)` : ""}`
          : `${recentOrphan} pago(s) creados post-cutoff de importación sin movimiento contable.${importedOrphan > 0 ? ` (${importedOrphan} adicionales de la importación legacy, esperados)` : ""}`,
      })
    } catch (err) {
      checks.push({
        id: "orphan-payments",
        name: "Pagos sin asiento",
        description: "Verificación de integridad pagos-ledger",
        status: "error",
        details: `Error al verificar: ${err instanceof Error ? err.message : "desconocido"}`,
      })
    }

    // ============================================
    // CHECK 2: Movimientos de caja sin cuenta financiera (post-importación)
    // ============================================
    try {
      const { count: totalWithout } = await (supabase.from("cash_movements") as any)
        .select("id", { count: "exact", head: true })
        .is("financial_account_id", null)

      const { count: recentWithout } = await (supabase.from("cash_movements") as any)
        .select("id", { count: "exact", head: true })
        .is("financial_account_id", null)
        .gte("created_at", POST_IMPORT_DATE)

      const totalOrphan = totalWithout || 0
      const recentOrphan = recentWithout || 0
      const importedOrphan = totalOrphan - recentOrphan

      checks.push({
        id: "orphan-cash",
        name: "Movimientos de caja sin cuenta",
        description: "Movimientos de caja sin cuenta financiera (excluyendo importación masiva)",
        status: recentOrphan === 0 ? "ok" : recentOrphan < 10 ? "warning" : "error",
        expected: "0 movimientos sin cuenta",
        actual: recentOrphan === 0
          ? "Todos los movimientos post-importación tienen cuenta"
          : `${recentOrphan} movimientos sin cuenta`,
        details: recentOrphan === 0
          ? `OK.${importedOrphan > 0 ? ` (${importedOrphan} movimientos de la importación inicial sin cuenta — esperado por diseño)` : ""}`
          : `${recentOrphan} movimiento(s) recientes sin cuenta financiera.${importedOrphan > 0 ? ` (${importedOrphan} adicionales de la importación, esperados)` : ""}`,
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
    // CHECK 3: Operaciones con margen negativo
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
    // CHECK 4: Pagos trabados en PROCESSING
    // ============================================
    try {
      const { count: processingCount } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PROCESSING")

      const stuckCount = processingCount || 0

      checks.push({
        id: "stuck-processing",
        name: "Pagos trabados en PROCESSING",
        description: "Pagos en estado transitorio PROCESSING (posible error en mark-paid)",
        status: stuckCount === 0 ? "ok" : "error",
        expected: "0 pagos",
        actual: `${stuckCount} pagos en PROCESSING`,
        details: stuckCount === 0
          ? "No hay pagos trabados"
          : `Hay ${stuckCount} pago(s) en estado PROCESSING. Deben revertirse a PENDING manualmente.`,
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

    // ============================================
    // CHECK 5: Pagos PENDING vencidos hace más de 30 días
    // ============================================
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

      const { count: overdueIncome } = await (supabase.from("payments") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING")
        .eq("direction", "INCOME")
        .lt("date_due", thirtyDaysAgo)

      const { count: overdueExpense } = await (supabase.from("operator_payments") as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["PENDING", "OVERDUE"])
        .lt("due_date", thirtyDaysAgo)

      const totalOverdue = (overdueIncome || 0) + (overdueExpense || 0)

      checks.push({
        id: "overdue-30d",
        name: "Pagos vencidos +30 días",
        description: "Pagos pendientes con vencimiento hace más de 30 días",
        status: totalOverdue === 0 ? "ok" : totalOverdue <= 5 ? "warning" : "error",
        expected: "0 pagos vencidos",
        actual: `${totalOverdue} pagos vencidos`,
        details: totalOverdue === 0
          ? "No hay pagos vencidos hace más de 30 días"
          : `${overdueIncome || 0} cobranzas de clientes + ${overdueExpense || 0} pagos a operadores vencidos hace +30 días`,
      })
    } catch (err) {
      checks.push({
        id: "overdue-30d",
        name: "Pagos vencidos",
        description: "Verificación de vencimientos",
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
