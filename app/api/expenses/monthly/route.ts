import { NextResponse } from "next/server"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"
import { fetchExpenses } from "@/lib/expenses/fetch-expenses"

/**
 * GET /api/expenses/monthly
 * Shows PAID expenses in the selected date range:
 * 1. Recurring expenses: from ledger_movements type=EXPENSE with concept "Gasto recurrente:"
 *    (only appear when actually paid via the "Pagar" button)
 * 2. Variable expenses: from cash_movements type=EXPENSE filtered by date
 *    (appear immediately when created, since they're paid on creation)
 * Excludes OPERATOR_PAYMENT concepts.
 *
 * La lectura vive en `lib/expenses/fetch-expenses.ts`, compartida con el
 * Reporte de Gastos para que ambas superficies muestren los mismos números.
 */
export async function GET(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()

    if (!canPerformAction(user, "accounting", "read", matrix ?? undefined) && !canPerformAction(user, "cash", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "No tiene permiso para ver egresos" }, { status: 403 })
    }

    // Cross-tenant fix: filtro explícito por org_id, no confiar en RLS.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const { searchParams } = new URL(request.url)

    const { expenses, totals } = await fetchExpenses({
      supabase,
      orgId: userOrgId,
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      currency: searchParams.get("currency"),
      type: searchParams.get("type"), // "recurring", "variable", or null for all
      categoryId: searchParams.get("categoryId"), // optional, applies only to variable expenses
      agencyId: searchParams.get("agencyId"), // optional, filtra por agencia
      // Criterio de atribución del filtro por agencia (toggle "Ver por"):
      //  - "office"  (default): la oficina a la que pertenece el gasto.
      //  - "account": la oficina de la cuenta desde la que salió la plata.
      agencyMode: searchParams.get("agencyMode") === "account" ? "account" : "office",
      ownDataOnlyUserId: isOwnDataOnlyResolved(user, "cash", matrix ?? undefined) ? user.id : null,
    })

    return NextResponse.json({ expenses, totals })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/monthly:", error)
    return NextResponse.json({ error: "Error al obtener egresos" }, { status: 500 })
  }
}
