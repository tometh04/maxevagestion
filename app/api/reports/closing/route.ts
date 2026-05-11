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
 *   - Gastos Fijos     (devengado: recurring_payments × meses activos)
 *   - Gastos Variables (efectivo: cash_movements EXPENSE no-turísticos)
 *   - Comisiones       (devengado: commission_records.date_calculated en el mes)
 *   - Impuestos        (devengado fijo + efectivo variable, categoría "Impuestos")
 *   - Ganancia Real    = Margen − Fijos − Variables − Comisiones − Impuestos
 *
 * Decisiones (feedback Yami 2026-05-07):
 *
 * 1. **Variables solo no-turísticos**: filtramos cash_movements con
 *    `is_touristic = false` — la deuda a operadores ya está descontada del
 *    margen, no debe aparecer acá. Mismo filtro que /api/expenses/variable.
 *
 * 2. **Fijos en devengado**: Yami quiere que cada mes muestre lo que
 *    "debería" gastar de fijos según los recurring_payments configurados,
 *    aunque algunos templates todavía no se hayan pagado ese mes (ej:
 *    alquiler de mayo todavía no ejecutado al día 7). Se calcula tomando
 *    cada recurring_payment activo en el mes y normalizándolo a equivalente
 *    mensual según su frequency (WEEKLY ≈ 4.35, MONTHLY=1, YEARLY=1/12,
 *    etc.).
 *
 * 3. **Comisiones devengadas**: la versión anterior filtraba por
 *    `status = PAID` y `date_paid`, lo que daba casi todo en cero porque
 *    la mayoría de las comisiones quedan en PENDING hasta liquidar. La
 *    "ganancia real" devenga la comisión cuando la operación cierra
 *    (`date_calculated`), no cuando se paga. Incluimos PENDING + PAID.
 *
 * 4. **Impuestos = recurrente + variable de la categoría "Impuestos"**:
 *    devengado para los recurring (IVA/IIBB mensual), efectivo para los
 *    one-off (cash_movements categoría Impuestos).
 *
 * Multi-tenant: filtra por agency_id ∈ agencias visibles del user.
 * Multi-moneda: todo se consolida a USD usando FX histórico por fecha.
 */
export const dynamic = "force-dynamic"

const TAX_CATEGORY_NAME = "Impuestos"

// Multiplicadores para normalizar recurring_payments a equivalente mensual.
// Yami quiere ver el "costo mensual" agnóstico de la frecuencia; un pago
// semanal de $1000 cuenta como ~$4348/mes en el cierre.
const FREQUENCY_TO_MONTHLY: Record<string, number> = {
  WEEKLY: 365.25 / 12 / 7,    // ≈ 4.3482
  BIWEEKLY: 365.25 / 12 / 14, // ≈ 2.1741
  MONTHLY: 1,
  QUARTERLY: 1 / 3,           // ≈ 0.3333
  YEARLY: 1 / 12,             // ≈ 0.0833
}

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
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
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

/**
 * monthKeyFromIso: TZ-safe — toma "2026-05-01" y devuelve "2026-05" sin
 * pasar por `new Date()`. Mismo bug que en seller-commissions-view.tsx
 * pero acá las fechas vienen de DB DATE columns (string YYYY-MM-DD).
 */
function monthKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const slice = iso.substring(0, 7)
  return /^\d{4}-\d{2}$/.test(slice) ? slice : null
}

/**
 * isRecurringActiveInMonth: chequea si un recurring_payment estaba activo
 * durante un mes dado. Activo = is_active=true AND start_date <= mes AND
 * (end_date IS NULL OR end_date >= mes).
 */
function isRecurringActiveInMonth(
  recurring: { start_date: string; end_date: string | null; is_active: boolean },
  monthFirstDayIso: string, // "2026-05-01"
  monthLastDayIso: string  // "2026-05-31"
): boolean {
  if (!recurring.is_active) return false
  if (recurring.start_date > monthLastDayIso) return false
  if (recurring.end_date && recurring.end_date < monthFirstDayIso) return false
  return true
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
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
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
    // 1. Categorías (lookup id → name)
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
    // 3. Cash movements EXPENSE no-turísticos (Variables + Impuestos one-off)
    //
    // is_touristic = false excluye los pagos a operadores (que ya están
    // descontados del margen) y deja solo los gastos operativos de la
    // agencia (alquiler, sueldos pagados ad-hoc, marketing, etc).
    // ---------------------------------------------------------------------
    let cashQuery = (supabase.from("cash_movements") as any)
      .select("id, amount, currency, movement_date, agency_id, category, category_id, is_touristic")
      .eq("type", "EXPENSE")
      .eq("is_touristic", false)
      .gte("movement_date", fromIso)
      .lte("movement_date", toIso)
    if (agencyFilter) cashQuery = cashQuery.in("agency_id", agencyFilter)
    const { data: cashMovements, error: cmErr } = (await cashQuery) as { data: any[] | null; error: any }
    if (cmErr) {
      console.error("closing: cash_movements error", cmErr)
      return NextResponse.json({ error: cmErr.message }, { status: 500 })
    }

    // ---------------------------------------------------------------------
    // 4. Recurring payments (templates) — para Fijos devengados.
    //    Cargamos TODOS los activos y los matchamos contra cada mes según
    //    start_date/end_date.
    //
    //    Nota multi-tenant 2026-05-07: muchos recurring_payments están
    //    cargados a nivel ORGANIZACIÓN (agency_id NULL) — alquiler de oficina,
    //    sueldos, contador, marketing son gastos compartidos entre las
    //    agencias del tenant (Lozada Rosario + Lozada Madero comparten estos
    //    costos). Si filtrásemos solo por `.in("agency_id", agencyFilter)`,
    //    PostgREST excluiría esos rows por tratamiento estricto de NULL.
    //    Incluimos `agency_id IS NULL` con `.or()`.
    // ---------------------------------------------------------------------
    let recQuery = (supabase.from("recurring_payments") as any)
      .select("id, amount, currency, frequency, start_date, end_date, is_active, category_id, agency_id")
    if (agencyFilter) {
      recQuery = recQuery.or(
        `agency_id.is.null,agency_id.in.(${agencyFilter.join(",")})`
      )
    }
    const { data: recurringPayments, error: recErr } = (await recQuery) as { data: any[] | null; error: any }
    if (recErr) {
      console.error("closing: recurring_payments error", recErr)
      return NextResponse.json({ error: recErr.message }, { status: 500 })
    }

    // ---------------------------------------------------------------------
    // 5. Commission records — DEVENGADAS (date_calculated, no date_paid)
    //    Incluye PENDING + PAID. Excluye REVERTED si el status existe.
    // ---------------------------------------------------------------------
    let commQuery = (supabase.from("commission_records") as any)
      .select("id, amount, status, date_calculated, agency_id, operations!inner(currency, sale_currency, agency_id)")
      .gte("date_calculated", fromIso)
      .lte("date_calculated", toIso)
      .neq("status", "REVERTED")
    if (agencyFilter) commQuery = commQuery.in("agency_id", agencyFilter)
    const { data: commissions, error: commErr } = (await commQuery) as { data: any[] | null; error: any }
    if (commErr) {
      console.error("closing: commissions error", commErr)
      return NextResponse.json({ error: commErr.message }, { status: 500 })
    }

    // ---------------------------------------------------------------------
    // 6. FX map para todas las fechas de conversión
    // ---------------------------------------------------------------------
    const allDates: (string | null | undefined)[] = [
      ...(operations || []).map((o: any) => o.departure_date || o.operation_date),
      ...(cashMovements || []).map((c: any) => c.movement_date),
      ...(commissions || []).map((c: any) => c.date_calculated),
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
    // 7. Inicializar buckets por mes
    // ---------------------------------------------------------------------
    const buckets = new Map<string, MonthBucket>()
    const monthBoundaries = new Map<string, { first: string; last: string }>()

    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i, 1))
      const key = monthKey(d)
      const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
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
      monthBoundaries.set(key, {
        first: d.toISOString().split("T")[0],
        last: lastDay.toISOString().split("T")[0],
      })
    }

    const ensureBucket = (key: string | null): MonthBucket | null => {
      if (!key) return null
      return buckets.get(key) || null
    }

    // ---------------------------------------------------------------------
    // 8. Operations → ventas + margen
    // ---------------------------------------------------------------------
    for (const op of operations || []) {
      const d = op.operation_date || op.departure_date
      const b = ensureBucket(monthKeyFromIso(d))
      if (!b) continue
      const cur = op.sale_currency || op.currency || "USD"
      const fxDate = op.departure_date || op.operation_date
      b.total_sales_usd += toUsd(Number(op.sale_amount_total) || 0, cur, fxDate)
      b.total_margin_usd += toUsd(Number(op.margin_amount) || 0, cur, fxDate)
      b.ops_count++
    }

    // ---------------------------------------------------------------------
    // 9. Cash movements (no-turísticos) → Variables + Impuestos one-off
    //
    // Yami: "los gastos variables son SOLO lo que aparece en /expenses
    // Variables tab". El filtro is_touristic=false ya garantiza eso.
    // Dentro de ese set, apartamos la categoría Impuestos al bucket aparte.
    // ---------------------------------------------------------------------
    for (const cm of cashMovements || []) {
      const b = ensureBucket(monthKeyFromIso(cm.movement_date))
      if (!b) continue
      const amountUsd = toUsd(Number(cm.amount) || 0, cm.currency || "ARS", cm.movement_date)
      const catName = cm.category_id ? categoryNameById.get(cm.category_id) : null
      const effectiveName = catName || (cm.category || "")

      if (effectiveName === TAX_CATEGORY_NAME) {
        b.taxes_usd += amountUsd
      } else {
        // Todo lo demás (con o sin categoría) cae en Variables.
        b.variable_expenses_usd += amountUsd
      }
    }

    // ---------------------------------------------------------------------
    // 10. Recurring payments → Fijos devengados + Impuestos recurrentes
    //
    // Para cada mes del rango, recorremos los recurring_payments activos
    // y sumamos su equivalente mensual. Si la categoría es "Impuestos",
    // suma en taxes; si no, en fixed_expenses.
    //
    // FX: las fechas de los recurring son configuracionales (start/end) —
    // para convertir ARS→USD usamos la tasa del último día del mes en
    // cuestión, que es una aproximación razonable del "costo de mes".
    // ---------------------------------------------------------------------
    for (const [monthKey, boundaries] of Array.from(monthBoundaries.entries())) {
      const b = buckets.get(monthKey)
      if (!b) continue

      for (const rp of recurringPayments || []) {
        if (!isRecurringActiveInMonth(rp, boundaries.first, boundaries.last)) continue

        const monthlyMultiplier = FREQUENCY_TO_MONTHLY[rp.frequency] ?? 1
        const monthlyAmount = (Number(rp.amount) || 0) * monthlyMultiplier
        const amountUsd = toUsd(monthlyAmount, rp.currency || "ARS", boundaries.last)

        const catName = rp.category_id ? categoryNameById.get(rp.category_id) : null
        if (catName === TAX_CATEGORY_NAME) {
          b.taxes_usd += amountUsd
        } else {
          b.fixed_expenses_usd += amountUsd
        }
      }
    }

    // ---------------------------------------------------------------------
    // 11. Comisiones devengadas
    //
    // Filtramos por date_calculated en el mes, status != REVERTED.
    // Incluye PENDING (todavía no se pagaron pero ya se generaron) y PAID.
    // Esto refleja el "costo de comisiones" devengado en la operatoria
    // del mes, no cuando efectivamente se cobraron las comisiones.
    // ---------------------------------------------------------------------
    for (const c of commissions || []) {
      const b = ensureBucket(monthKeyFromIso(c.date_calculated))
      if (!b) continue
      const opData = c.operations as { currency?: string; sale_currency?: string } | null
      const cur = opData?.sale_currency || opData?.currency || "USD"
      b.commissions_usd += toUsd(Number(c.amount) || 0, cur, c.date_calculated)
    }

    // ---------------------------------------------------------------------
    // 12. Calcular Ganancia Real por mes
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
    rows.sort((a, b) => a.month.localeCompare(b.month))

    // ---------------------------------------------------------------------
    // 13. Totales del rango
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
        tax_category: TAX_CATEGORY_NAME,
        sources: {
          fixed: "recurring_payments (devengado, normalizado a equivalente mensual)",
          variable: "cash_movements EXPENSE no-turísticos (efectivo)",
          commissions: "commission_records.date_calculated (devengado, PENDING+PAID)",
          taxes: "categoría Impuestos en cash_movements + recurring_payments",
        },
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/closing:", error)
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 })
  }
}
