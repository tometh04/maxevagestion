import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import type { UserRole } from "@/lib/permissions"
import {
  buildExchangeRateMap,
  getLatestExchangeRate,
  DEFAULT_USD_ARS_FALLBACK_RATE,
} from "@/lib/accounting/exchange-rates"

/**
 * GET /api/reports/closing?months=6&agencyId=ALL
 *
 * Cierre de mes consolidado en USD. Devuelve una fila por mes con:
 *   - Total Ventas
 *   - Margen Ventas
 *   - Gastos Fijos     (cash_movements EXPENSE en categorías "fijas")
 *   - Gastos Variables (cash_movements EXPENSE en categorías "variables" / sin categoría)
 *   - Comisiones       (commission_records.date_paid en el mes)
 *   - Impuestos        (cash_movements EXPENSE en categoría "Impuestos")
 *   - Ganancia Real    = Margen − Fijos − Variables − Comisiones − Impuestos
 *
 * Decisiones:
 * - Todo se consolida a USD usando FX histórico por fecha del movimiento
 *   (mismo patrón que /api/reports/margins). El detalle ARS/USD por bucket
 *   no se muestra acá — para eso está la pestaña de Márgenes.
 * - Gastos Fijos vs Variables se separan por nombre de categoría:
 *     Fijos      = "Gastos oficina", "Sueldos", "Marketing y sistemas"
 *     Variables  = "Varios", "Otros", o NULL (sin categoría asignada)
 *   "Impuestos" se trata como bucket propio (no entra en Fijos/Variables).
 * - Comisiones usan commission_records (status PAID, date_paid en el mes)
 *   como fuente de verdad — evita doble-conteo si alguien también las cargó
 *   como cash_movement EXPENSE (caso edge poco frecuente).
 *
 * Multi-tenant: filtra por agency_id ∈ agencias visibles del user. RLS de
 * operations/commission_records protege org_id por separado.
 */
export const dynamic = "force-dynamic"

// Categorías que se consideran "fijas" (renta, sueldos, marketing & sistemas).
// Están hardcodeadas porque la migración 144 las consolidó como el set canónico
// del cliente. Si en el futuro un tenant quiere customizarlas, agregamos una
// columna `category_kind` en recurring_payment_categories.
const FIXED_CATEGORY_NAMES = ["Gastos oficina", "Sueldos", "Marketing y sistemas"]
const TAX_CATEGORY_NAME = "Impuestos"

type MonthBucket = {
  month: string // "2026-04"
  monthLabel: string // "Abril 2026"
  total_sales_usd: number
  total_margin_usd: number
  fixed_expenses_usd: number
  variable_expenses_usd: number
  commissions_usd: number
  taxes_usd: number
  real_profit_usd: number
  ops_count: number
}

const MONTH_LABELS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-")
  return `${MONTH_LABELS_ES[parseInt(m, 10) - 1]} ${y}`
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const monthsParam = parseInt(searchParams.get("months") || "6", 10)
    const months = Math.min(Math.max(monthsParam, 1), 24) // clamp 1-24
    const agencyIdParam = searchParams.get("agencyId")

    // Rango de fechas: primer día del mes (now − months + 1) hasta hoy
    const now = new Date()
    const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)) // último día del mes actual
    const fromIso = firstMonth.toISOString().split("T")[0]
    const toIso = lastMonth.toISOString().split("T")[0]

    // Multi-tenant: agencias visibles
    const visibleAgencyIds = await getUserAgencyIds(
      supabase as any,
      user.id,
      user.role as UserRole
    )

    // Filtro de agencia explícito (si pasaron uno) — debe estar dentro de las visibles
    let agencyFilter: string[] | null = null
    if (agencyIdParam && agencyIdParam !== "ALL" && agencyIdParam !== "") {
      if (!visibleAgencyIds.includes(agencyIdParam)) {
        return NextResponse.json({ error: "Agencia fuera de scope" }, { status: 403 })
      }
      agencyFilter = [agencyIdParam]
    } else if (visibleAgencyIds.length > 0) {
      agencyFilter = visibleAgencyIds
    }

    // ---------------------------------------------------------------------
    // 1. Cargar categoría "Impuestos" + categorías "fijas" (lookup por nombre)
    // ---------------------------------------------------------------------
    const { data: categories } = await (supabase
      .from("recurring_payment_categories") as any)
      .select("id, name")

    const categoryNameById = new Map<string, string>()
    for (const cat of (categories || []) as Array<{ id: string; name: string }>) {
      categoryNameById.set(cat.id, cat.name)
    }

    // ---------------------------------------------------------------------
    // 2. Operations: ventas + margen, agrupado por mes (operation_date)
    // ---------------------------------------------------------------------
    let opsQuery = (supabase.from("operations") as any)
      .select("id, operation_date, departure_date, sale_amount_total, sale_currency, currency, margin_amount, agency_id")
      .gte("operation_date", fromIso)
      .lte("operation_date", toIso)
      .not("status", "eq", "CANCELLED")
    if (agencyFilter) opsQuery = opsQuery.in("agency_id", agencyFilter)
    const { data: operations, error: opsErr } = (await opsQuery) as { data: any[] | null; error: any }
    if (opsErr) {
      console.error("closing: operations error", opsErr)
      return NextResponse.json({ error: opsErr.message }, { status: 500 })
    }

    // ---------------------------------------------------------------------
    // 3. Cash movements EXPENSE: para Fijos / Variables / Impuestos
    // ---------------------------------------------------------------------
    let cashQuery = (supabase.from("cash_movements") as any)
      .select("id, type, category, category_id, amount, currency, movement_date, agency_id, operation_id")
      .eq("type", "EXPENSE")
      .gte("movement_date", fromIso)
      .lte("movement_date", toIso)
    if (agencyFilter) cashQuery = cashQuery.in("agency_id", agencyFilter)
    const { data: cashMovements, error: cmErr } = (await cashQuery) as { data: any[] | null; error: any }
    if (cmErr) {
      console.error("closing: cash_movements error", cmErr)
      return NextResponse.json({ error: cmErr.message }, { status: 500 })
    }

    // ---------------------------------------------------------------------
    // 4. Commission records pagadas en el rango (date_paid)
    //    Se joinea con operations para heredar moneda + agencia.
    // ---------------------------------------------------------------------
    let commQuery = (supabase.from("commission_records") as any)
      .select("id, amount, status, date_paid, agency_id, operations!inner(currency, sale_currency, agency_id)")
      .eq("status", "PAID")
      .gte("date_paid", fromIso)
      .lte("date_paid", toIso)
    if (agencyFilter) commQuery = commQuery.in("agency_id", agencyFilter)
    const { data: commissions, error: commErr } = (await commQuery) as { data: any[] | null; error: any }
    if (commErr) {
      console.error("closing: commissions error", commErr)
      return NextResponse.json({ error: commErr.message }, { status: 500 })
    }

    // ---------------------------------------------------------------------
    // 5. FX map para todas las fechas que vamos a convertir
    // ---------------------------------------------------------------------
    const allDates = [
      ...(operations || []).map((o: any) => o.departure_date || o.operation_date),
      ...(cashMovements || []).map((c: any) => c.movement_date),
      ...(commissions || []).map((c: any) => c.date_paid),
    ].filter(Boolean)
    const fxLookup = await buildExchangeRateMap(supabase as any, allDates)
    const latestRate =
      (await getLatestExchangeRate(supabase as any)) || DEFAULT_USD_ARS_FALLBACK_RATE

    const toUsd = (amount: number, currency: string | null, date: string | null): number => {
      const cur = (currency || "USD").toUpperCase()
      if (cur !== "ARS") return amount
      const rate = fxLookup(date) || latestRate
      return rate > 0 ? amount / rate : 0
    }

    // ---------------------------------------------------------------------
    // 6. Inicializar buckets por mes (todos los meses del rango, aunque vacíos)
    // ---------------------------------------------------------------------
    const buckets = new Map<string, MonthBucket>()
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i, 1))
      const key = monthKey(d)
      buckets.set(key, {
        month: key,
        monthLabel: monthLabel(key),
        total_sales_usd: 0,
        total_margin_usd: 0,
        fixed_expenses_usd: 0,
        variable_expenses_usd: 0,
        commissions_usd: 0,
        taxes_usd: 0,
        real_profit_usd: 0,
        ops_count: 0,
      })
    }

    const ensureBucket = (key: string): MonthBucket | null => {
      // Si una row cae fuera del rango (no debería por el filtro de fechas
      // pero por las dudas), la ignoramos en vez de crear bucket espontáneo.
      return buckets.get(key) || null
    }

    // ---------------------------------------------------------------------
    // 7. Acumular operations
    // ---------------------------------------------------------------------
    for (const op of operations || []) {
      const d = op.operation_date || op.departure_date
      if (!d) continue
      const b = ensureBucket(monthKey(d))
      if (!b) continue
      const cur = op.sale_currency || op.currency || "USD"
      const fxDate = op.departure_date || op.operation_date
      b.total_sales_usd += toUsd(Number(op.sale_amount_total) || 0, cur, fxDate)
      b.total_margin_usd += toUsd(Number(op.margin_amount) || 0, cur, fxDate)
      b.ops_count++
    }

    // ---------------------------------------------------------------------
    // 8. Acumular cash_movements en Fijos / Variables / Impuestos
    // ---------------------------------------------------------------------
    for (const cm of cashMovements || []) {
      const d = cm.movement_date
      if (!d) continue
      const b = ensureBucket(monthKey(d))
      if (!b) continue
      const amountUsd = toUsd(Number(cm.amount) || 0, cm.currency || "ARS", d)

      const catName = cm.category_id
        ? categoryNameById.get(cm.category_id)
        : null
      // Fallback: el campo legacy "category" (text) si no hay category_id mapeado
      const effectiveName = catName || (cm.category || "")

      if (effectiveName === TAX_CATEGORY_NAME) {
        b.taxes_usd += amountUsd
      } else if (FIXED_CATEGORY_NAMES.includes(effectiveName)) {
        b.fixed_expenses_usd += amountUsd
      } else {
        // "Varios", "Otros", null o cualquier categoría no clasificada → Variables
        b.variable_expenses_usd += amountUsd
      }
    }

    // ---------------------------------------------------------------------
    // 9. Acumular comisiones (date_paid)
    // ---------------------------------------------------------------------
    for (const c of commissions || []) {
      const d = c.date_paid
      if (!d) continue
      const b = ensureBucket(monthKey(d))
      if (!b) continue
      // Currency desde la operation joineada
      const opData = c.operations as { currency?: string; sale_currency?: string } | null
      const cur = opData?.sale_currency || opData?.currency || "USD"
      b.commissions_usd += toUsd(Number(c.amount) || 0, cur, d)
    }

    // ---------------------------------------------------------------------
    // 10. Calcular Ganancia Real por mes
    // ---------------------------------------------------------------------
    const rows: MonthBucket[] = Array.from(buckets.values()).map((b) => {
      b.real_profit_usd =
        b.total_margin_usd -
        b.fixed_expenses_usd -
        b.variable_expenses_usd -
        b.commissions_usd -
        b.taxes_usd
      return b
    })
    // Orden cronológico ascendente (mes más viejo arriba), igual que un cash flow.
    rows.sort((a, b) => a.month.localeCompare(b.month))

    // ---------------------------------------------------------------------
    // 11. Totales del rango
    // ---------------------------------------------------------------------
    const totals = rows.reduce(
      (acc, r) => ({
        total_sales_usd: acc.total_sales_usd + r.total_sales_usd,
        total_margin_usd: acc.total_margin_usd + r.total_margin_usd,
        fixed_expenses_usd: acc.fixed_expenses_usd + r.fixed_expenses_usd,
        variable_expenses_usd: acc.variable_expenses_usd + r.variable_expenses_usd,
        commissions_usd: acc.commissions_usd + r.commissions_usd,
        taxes_usd: acc.taxes_usd + r.taxes_usd,
        real_profit_usd: acc.real_profit_usd + r.real_profit_usd,
        ops_count: acc.ops_count + r.ops_count,
      }),
      {
        total_sales_usd: 0,
        total_margin_usd: 0,
        fixed_expenses_usd: 0,
        variable_expenses_usd: 0,
        commissions_usd: 0,
        taxes_usd: 0,
        real_profit_usd: 0,
        ops_count: 0,
      }
    )

    return NextResponse.json({
      months: rows,
      totals,
      meta: {
        from: fromIso,
        to: toIso,
        months_count: months,
        fixed_categories: FIXED_CATEGORY_NAMES,
        tax_category: TAX_CATEGORY_NAME,
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/closing:", error)
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 })
  }
}
