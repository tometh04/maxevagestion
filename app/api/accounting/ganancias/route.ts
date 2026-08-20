import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
import { getServiceExtrasByOperation } from "@/lib/accounting/operation-services-debt"
import { isFinancialCostConcept } from "@/lib/accounting/financial-result"
import { computeGananciasResult } from "@/lib/accounting/ganancias-calc"

/** Chunk del `.in()` de operation_id: mantiene corta la URL de PostgREST. */
const COMMISSION_IDS_CHUNK_SIZE = 200

type Currency = "ARS" | "USD"

/**
 * Moneda de una operación para este reporte.
 *
 * Vive acá y no en `lib/commissions/currency.ts` a propósito: aquel helper
 * prioriza `operation.currency` sobre `sale_currency`, y este cálculo agrupa el
 * margen por `sale_currency`. Si la comisión usara un criterio y el margen otro,
 * una operación con las dos columnas distintas mandaría su ingreso a un balde y
 * su costo al otro — exactamente el problema que este arreglo viene a sacar. El
 * ingreso y su comisión tienen que salir del MISMO predicado.
 */
function operationCurrency(op: { sale_currency?: string | null }): Currency {
  return op?.sale_currency === "USD" ? "USD" : "ARS"
}

/** Moneda de un movimiento suelto (gasto, retención). Default ARS. */
function rowCurrency(row: { currency?: string | null }): Currency {
  return row?.currency === "USD" ? "USD" : "ARS"
}

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

    // SaaS Pilar 2: RLS en ledger_movements/operations/commission_records/tax_withholdings
    // acota por org_id del JWT. Ya no usamos admin client.
    const supabase = await createServerClient()
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
    const taxRegime = settings?.tax_regime || "RESPONSABLE_INSCRIPTO"

    // Get all operations in the quarter with their margins
    const { data: operations } = await (supabase.from("operations") as any)
      .select("id, file_code, destination, sale_amount_total, operator_cost, operator_cost_currency, margin_amount, sale_currency, currency, status, created_at")
      .gte("created_at", startOfDayAR(startDate))
      .lte("created_at", endOfDayAR(endDate))
      .in("status", ["CONFIRMED", "CLOSED"])

    // Servicios adicionales (operation_services): si la flag está ON, el margen
    // del cuarto incluye el neto (saleExtra − costExtra) de los servicios. Es un
    // reporte de resultado: sumar solo el neto para NO inflar el margen.
    const includeServices = (user as any).org_id
      ? await getOrgFeatureFlag(supabase, (user as any).org_id, FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL)
      : false
    const serviceExtras = includeServices && (operations || []).length > 0
      ? await getServiceExtrasByOperation(supabase, (operations || []) as any[], (user as any).org_id)
      : {}

    // Get expenses (gastos) in the quarter
    const { data: expenses, error: expensesError } = await (supabase.from("ledger_movements") as any)
      .select("id, amount_original, currency, type, concept, movement_date")
      .eq("type", "EXPENSE")
      // VIB-134/B0: excluir las líneas de asiento contable, que no son egresos
      // de dinero. Los asientos de costo también son type=EXPENSE, así que sin
      // este filtro el costo del operador se contaría dos veces: una por el
      // pago real y otra por su asiento.
      //
      // El discriminador es la ausencia de cuenta financiera: un movimiento de
      // plata siempre tiene una; una línea de asiento, nunca. Verificado contra
      // la base al 2026-08-20: los 14.284 movimientos existentes tienen cuenta,
      // así que este filtro NO cambia ningún número actual del reporte.
      .not("account_id", "is", null)
      .gte("movement_date", startOfDayAR(startDate))
      .lte("movement_date", endOfDayAR(endDate))

    if (expensesError) {
      console.error("Error querying expenses for ganancias:", expensesError)
    }

    // TODO: Implement deducibility categorization via chart_of_accounts join
    // For now, all expenses are treated as deducible (conservative approach)
    let chartAccountsMap: Record<string, any> = {}

    // Comisiones del trimestre.
    //
    // Se toman las comisiones DE LAS OPERACIONES que arriba entraron como
    // ingreso, no las que caen en una ventana de fechas propia. Antes filtraba
    // por `date_calculated`, una columna que `applyCommissionPlan()` reescribe
    // con la fecha de hoy en cada recálculo (recalcular comisiones, editar la
    // operación, un script de corrección masiva): un recálculo amontonaba en el
    // trimestre en curso comisiones de operaciones de trimestres cerrados, que
    // se restaban de un margen que no estaba en este cálculo. Al ir por
    // `operation_id` el gasto y el ingreso salen del mismo conjunto, sin
    // depender de ninguna fecha proxy.
    const quarterOperationIds = (operations || [])
      .map((op: any) => op.id)
      .filter(Boolean) as string[]

    const commissions: any[] = []
    for (let i = 0; i < quarterOperationIds.length; i += COMMISSION_IDS_CHUNK_SIZE) {
      const chunk = quarterOperationIds.slice(i, i + COMMISSION_IDS_CHUNK_SIZE)
      const { data, error: commErr } = await (supabase.from("commission_records") as any)
        .select("id, operation_id, amount, percentage, status")
        .in("operation_id", chunk)
      if (commErr) {
        // Es un componente del resultado impositivo: si no se puede leer, el
        // número saldría bajo en silencio. Mejor fallar que informar de menos.
        console.error("Error querying commissions for ganancias:", commErr)
        return NextResponse.json(
          { error: "No se pudieron leer las comisiones del trimestre" },
          { status: 500 }
        )
      }
      commissions.push(...(data || []))
    }

    // Calculate income (margins from operations)
    let totalMarginUSD = 0
    let totalMarginARS = 0
    const currencyByOperation = new Map<string, Currency>()
    for (const op of (operations || [])) {
      const extra = (serviceExtras as any)[op.id]
      const netServiceMargin = extra ? (extra.saleExtra - extra.costExtra) : 0
      const margin = (Number(op.margin_amount) || 0) + netServiceMargin
      const cur = operationCurrency(op)
      currencyByOperation.set(op.id, cur)
      if (cur === "USD") totalMarginUSD += margin
      else totalMarginARS += margin
    }

    // Categorize expenses as deducibles vs no deducibles
    let gastosDeduciblesARS = 0
    let gastosDeduciblesUSD = 0
    let gastosNoDeduciblesARS = 0
    let gastosNoDeduciblesUSD = 0

    for (const exp of (expenses || [])) {
      // El costo financiero (comisión de la financiera al pagar a un operador)
      // no es un gasto de la agencia: es un resultado financiero que se netea
      // contra la ganancia por depósito en el reporte societario. Su
      // contrapartida de ingreso nunca entró a este cálculo —esta ruta sólo
      // lee EXPENSE—, así que sumarlo como deducible bajaría el resultado
      // impositivo sin la mitad que lo compensa.
      if (isFinancialCostConcept(exp.concept)) continue

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

    // Comisiones, separadas por moneda.
    //
    // `commission_records` no tiene columna de moneda: el `amount` está en la
    // moneda de venta de su operación. Antes se sumaban todas en un solo número
    // y ese número se restaba únicamente del resultado en USD: las comisiones en
    // pesos se descontaban de los dólares (achicando la provisión en USD por
    // algo que no eran dólares) y el resultado impositivo en ARS no descontaba
    // ninguna comisión. Los dos lados quedaban mal, y el desglose de pantalla
    // además mostraba el total mezclado con el símbolo "US$".
    let totalCommissionsARS = 0
    let totalCommissionsUSD = 0
    for (const c of commissions) {
      const amount = Number(c.amount) || 0
      // La operación siempre está: las comisiones se leyeron por `operation_id`
      // dentro de este mismo conjunto. El default ARS es defensivo.
      if (currencyByOperation.get(c.operation_id) === "USD") totalCommissionsUSD += amount
      else totalCommissionsARS += amount
    }

    // Get retenciones de ganancias sufridas in the quarter
    const quarterMonths = Array.from({ length: 3 }, (_, i) =>
      `${year}-${String(quarterStartMonth + i).padStart(2, "0")}`
    )
    const { data: retencionesGanancias } = await (supabase.from("tax_withholdings") as any)
      .select("id, amount, currency")
      .eq("type", "RETENCION_GANANCIAS")
      .eq("direction", "SUFFERED")
      .in("tax_period", quarterMonths)

    // Retenciones sufridas, también separadas por moneda: se restan de la
    // provisión de su propia moneda. La query ya traía `currency` y no se usaba,
    // así que una retención en dólares bajaba la provisión en pesos peso a peso.
    let retencionesARS = 0
    let retencionesUSD = 0
    for (const r of retencionesGanancias || []) {
      const amount = Number(r.amount) || 0
      if (rowCurrency(r) === "USD") retencionesUSD += amount
      else retencionesARS += amount
    }

    // Resultado impositivo, resultado contable y provisión: cada moneda contra
    // la suya. La aritmética vive en `lib/accounting/ganancias-calc.ts`, que es
    // donde está testeado el invariante.
    const calc = computeGananciasResult({
      margin: { ars: totalMarginARS, usd: totalMarginUSD },
      deductibleExpenses: { ars: gastosDeduciblesARS, usd: gastosDeduciblesUSD },
      totalExpenses: { ars: totalExpensesARS, usd: totalExpensesUSD },
      commissions: { ars: totalCommissionsARS, usd: totalCommissionsUSD },
      withholdings: { ars: retencionesARS, usd: retencionesUSD },
      ratePercent: gananciasRatePercent,
    })

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
        // Objeto y no un escalar a propósito: el escalar anterior era ARS+USD
        // sumados y la pantalla lo dibujaba con "US$". No hay un solo número
        // honesto para esto.
        comisiones: {
          ars: Math.round(totalCommissionsARS * 100) / 100,
          usd: Math.round(totalCommissionsUSD * 100) / 100,
        },
        gastos_deducibles: {
          ars: Math.round(gastosDeduciblesARS * 100) / 100,
          usd: Math.round(gastosDeduciblesUSD * 100) / 100,
        },
        gastos_no_deducibles: {
          ars: Math.round(gastosNoDeduciblesARS * 100) / 100,
          usd: Math.round(gastosNoDeduciblesUSD * 100) / 100,
        },
      },
      resultado_impositivo: calc.taxableResult,
      resultado: {
        profit_before_tax_ars: calc.profitBeforeTax.ars,
        profit_before_tax_usd: calc.profitBeforeTax.usd,
      },
      provision: {
        rate: gananciasRatePercent,
        estimated_ars: calc.provision.ars,
        estimated_usd: calc.provision.usd,
        retenciones_sufridas: {
          ars: Math.round(retencionesARS * 100) / 100,
          usd: Math.round(retencionesUSD * 100) / 100,
        },
        neto_ars: calc.provisionNet.ars,
        neto_usd: calc.provisionNet.usd,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
