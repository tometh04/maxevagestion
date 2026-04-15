import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

// Subcategorías de cuentas contables consideradas como gastos deducibles
const SUBCATEGORIAS_DEDUCIBLES = [
  "GASTOS",
  "GASTOS_OPERATIVOS",
  "GASTOS_ADMINISTRATIVOS",
  "GASTOS_COMERCIALES",
  "GASTOS_FINANCIEROS",
  "SUELDOS",
  "ALQUILERES",
  "SERVICIOS",
  "IMPUESTOS",
  "AMORTIZACIONES",
]

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Use admin client to bypass RLS on ledger_movements
    const { createAdminClient } = await import("@/lib/supabase/server")
    let supabase: any
    try {
      supabase = await createAdminClient()
    } catch {
      supabase = await createServerClient()
    }
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString())
    const quarter = parseInt(searchParams.get("quarter") || String(Math.ceil((new Date().getMonth() + 1) / 3)))

    // Calculate quarter date range
    const quarterStartMonth = (quarter - 1) * 3 + 1
    const quarterEndMonth = quarter * 3
    const startDate = `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`
    const lastDay = new Date(year, quarterEndMonth, 0).getDate()
    const endDate = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    // Read ganancias_rate from financial_settings (default 35 if not set)
    const { data: settings } = await (supabase.from("financial_settings") as any)
      .select("ganancias_rate, tax_regime")
      .limit(1)
      .maybeSingle()

    const gananciasRatePercent = settings?.ganancias_rate ?? 35
    const gananciasRate = gananciasRatePercent / 100
    const taxRegime = settings?.tax_regime || "RESPONSABLE_INSCRIPTO"

    // Get all operations in the quarter with their margins
    const { data: operations } = await (supabase.from("operations") as any)
      .select("id, file_code, destination, sale_amount_total, operator_cost, margin_amount, sale_currency, status, created_at")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .in("status", ["CONFIRMED", "CLOSED"])

    // Get expenses (gastos) in the quarter
    const { data: expenses, error: expensesError } = await (supabase.from("ledger_movements") as any)
      .select("id, amount_original, currency, type, concept, movement_date")
      .eq("type", "EXPENSE")
      .gte("movement_date", `${startDate}T00:00:00`)
      .lte("movement_date", `${endDate}T23:59:59`)

    if (expensesError) {
      console.error("Error querying expenses for ganancias:", expensesError)
    }

    // TODO: Implement deducibility categorization via chart_of_accounts join
    // For now, all expenses are treated as deducible (conservative approach)
    let chartAccountsMap: Record<string, any> = {}

    // Get commissions paid in the quarter
    const { data: commissions } = await (supabase.from("commission_records") as any)
      .select("id, amount, percentage, status, date_calculated")
      .gte("date_calculated", `${startDate}T00:00:00`)
      .lte("date_calculated", `${endDate}T23:59:59`)

    // Calculate income (margins from operations)
    let totalMarginUSD = 0
    let totalMarginARS = 0
    for (const op of (operations || [])) {
      const margin = Number(op.margin_amount) || 0
      if (op.sale_currency === "USD") totalMarginUSD += margin
      else totalMarginARS += margin
    }

    // Categorize expenses as deducibles vs no deducibles
    let gastosDeduciblesARS = 0
    let gastosDeduciblesUSD = 0
    let gastosNoDeduciblesARS = 0
    let gastosNoDeduciblesUSD = 0

    for (const exp of (expenses || [])) {
      const amount = Number(exp.amount_original) || 0
      const isUSD = exp.currency === "USD"

      // Determine deducibility:
      // TODO: When chart_of_accounts categorization is implemented,
      // check subcategory to determine deducibility. For now, all expenses are deducible.
      const isDeducible = true

      if (isDeducible) {
        if (isUSD) gastosDeduciblesUSD += amount
        else gastosDeduciblesARS += amount
      } else {
        if (isUSD) gastosNoDeduciblesUSD += amount
        else gastosNoDeduciblesARS += amount
      }
    }

    const totalExpensesARS = gastosDeduciblesARS + gastosNoDeduciblesARS
    const totalExpensesUSD = gastosDeduciblesUSD + gastosNoDeduciblesUSD

    // Calculate commissions
    const totalCommissions = (commissions || []).reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0)

    // Resultado impositivo: ingresos - gastos deducibles (NOT all gastos)
    const resultadoImpositivoARS = totalMarginARS - gastosDeduciblesARS
    const resultadoImpositivoUSD = totalMarginUSD - gastosDeduciblesUSD - totalCommissions

    // Profit before tax (contable, includes all expenses)
    const profitBeforeTaxARS = totalMarginARS - totalExpensesARS
    const profitBeforeTaxUSD = totalMarginUSD - totalExpensesUSD - totalCommissions

    // Quarterly provision based on resultado impositivo (estimated)
    const provisionARS = Math.max(0, Math.round(resultadoImpositivoARS * gananciasRate * 100) / 100)
    const provisionUSD = Math.max(0, Math.round(resultadoImpositivoUSD * gananciasRate * 100) / 100)

    // Get retenciones de ganancias sufridas in the quarter
    const quarterMonths = Array.from({ length: 3 }, (_, i) =>
      `${year}-${String(quarterStartMonth + i).padStart(2, "0")}`
    )
    const { data: retencionesGanancias } = await (supabase.from("tax_withholdings") as any)
      .select("id, amount, currency")
      .eq("type", "RETENCION_GANANCIAS")
      .eq("direction", "SUFFERED")
      .in("tax_period", quarterMonths)

    const totalRetencionesGanancias = (retencionesGanancias || []).reduce((s: number, r: any) => s + Number(r.amount), 0)

    return NextResponse.json({
      periodo: { year, quarter, startDate, endDate },
      configuracion: {
        ganancias_rate: gananciasRatePercent,
        tax_regime: taxRegime,
      },
      ingresos: {
        margin_usd: Math.round(totalMarginUSD * 100) / 100,
        margin_ars: Math.round(totalMarginARS * 100) / 100,
        operations_count: (operations || []).length,
      },
      gastos: {
        total_ars: Math.round(totalExpensesARS * 100) / 100,
        total_usd: Math.round(totalExpensesUSD * 100) / 100,
        comisiones: Math.round(totalCommissions * 100) / 100,
        gastos_deducibles: {
          ars: Math.round(gastosDeduciblesARS * 100) / 100,
          usd: Math.round(gastosDeduciblesUSD * 100) / 100,
        },
        gastos_no_deducibles: {
          ars: Math.round(gastosNoDeduciblesARS * 100) / 100,
          usd: Math.round(gastosNoDeduciblesUSD * 100) / 100,
        },
      },
      resultado_impositivo: {
        ars: Math.round(resultadoImpositivoARS * 100) / 100,
        usd: Math.round(resultadoImpositivoUSD * 100) / 100,
      },
      resultado: {
        profit_before_tax_ars: Math.round(profitBeforeTaxARS * 100) / 100,
        profit_before_tax_usd: Math.round(profitBeforeTaxUSD * 100) / 100,
      },
      provision: {
        rate: gananciasRatePercent,
        estimated_ars: provisionARS,
        estimated_usd: provisionUSD,
        retenciones_sufridas: Math.round(totalRetencionesGanancias * 100) / 100,
        neto_ars: Math.max(0, provisionARS - totalRetencionesGanancias),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
