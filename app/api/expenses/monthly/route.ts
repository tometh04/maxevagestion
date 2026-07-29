import { NextResponse } from "next/server"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"
import { fetchExpenses, computeExpenseTotals } from "@/lib/expenses/fetch-expenses"
import { convertExpensesTo } from "@/lib/reports/expenses-report"
import { buildExchangeRateMap } from "@/lib/accounting/exchange-rates"

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

    // Se traen TODAS las monedas y se convierten a la pedida (ver más abajo).
    // Antes se filtraba en la base: elegías USD y los gastos en pesos
    // desaparecían de la pantalla, y al revés. El cliente lo reportó como
    // "los pagos de la tarjeta no impactaron en gastos".
    const requestedCurrency = (searchParams.get("currency") || "ARS").toUpperCase()

    const { expenses: rawExpenses } = await fetchExpenses({
      supabase,
      orgId: userOrgId,
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      currency: "ALL",
      type: searchParams.get("type"), // "recurring", "variable", or null for all
      categoryId: searchParams.get("categoryId"), // optional, applies only to variable expenses
      agencyId: searchParams.get("agencyId"), // optional, filtra por agencia
      // Criterio de atribución del filtro por agencia (toggle "Ver por"):
      //  - "office"  (default): la oficina a la que pertenece el gasto.
      //  - "account": la oficina de la cuenta desde la que salió la plata.
      agencyMode: searchParams.get("agencyMode") === "account" ? "account" : "office",
      ownDataOnlyUserId: isOwnDataOnlyResolved(user, "cash", matrix ?? undefined) ? user.id : null,
    })

    // Misma función que usa el reporte y el PDF: si la conversión se
    // implementara dos veces, la pantalla y el documento volverían a mostrar
    // números distintos.
    const necesitaConversion = rawExpenses.some((e) => e.currency !== requestedCurrency)
    const getRate = necesitaConversion
      ? await buildExchangeRateMap(
          supabase as any,
          rawExpenses.map((e) => e.movement_date)
        )
      : undefined

    const { converted, missingRate } = convertExpensesTo(
      rawExpenses,
      requestedCurrency,
      getRate
    )

    // La pantalla agrega del lado del cliente sobre `amount`/`currency`, así que
    // se devuelven ya convertidos, conservando el importe original para poder
    // rastrear el comprobante.
    const expenses = converted.map((e) => ({
      ...e,
      amount: e.convertedAmount,
      currency: requestedCurrency,
      original_amount: e.originalAmount,
      original_currency: e.originalCurrency,
      exchange_rate: e.exchangeRate,
    }))

    return NextResponse.json({
      expenses,
      totals: computeExpenseTotals(expenses as any),
      // Nunca esconder lo que quedó afuera: es el bug que se está arreglando.
      missingRate,
    })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/monthly:", error)
    return NextResponse.json({ error: "Error al obtener egresos" }, { status: 500 })
  }
}
