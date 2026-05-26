/**
 * Fetcher: arma los inputs del calculator desde BD.
 *
 * Aísla las queries a Supabase para que `calculator.ts` quede como una
 * función pura y testeable. Si cambia el schema, solo tocás acá.
 */

import type { CalculationInputs, MonthlyCommissionRule } from "./types"

/**
 * Convierte "YYYY-MM" en (fromISO, toISO) inclusivo del mes.
 * Ej: "2026-05" → from="2026-05-01", to="2026-05-31".
 */
export function monthRange(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split("-").map(Number)
  if (!y || !m) throw new Error(`Invalid year_month: ${yearMonth}`)
  const fromDate = new Date(y, m - 1, 1)
  // Último día del mes
  const toDate = new Date(y, m, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    from: `${fromDate.getFullYear()}-${pad(fromDate.getMonth() + 1)}-${pad(fromDate.getDate())}`,
    to: `${toDate.getFullYear()}-${pad(toDate.getMonth() + 1)}-${pad(toDate.getDate())}`,
  }
}

interface FetcherInput {
  admin: any  // Supabase admin client (bypass RLS para cálculo cross-vendedora)
  rule: MonthlyCommissionRule
  yearMonth: string
  manualIndicatorPct?: number | null
}

/**
 * Devuelve inputs ready para calculateMonthlyCommission().
 * Usa admin client porque el cron / admin path necesita leer ops/quotations/leads
 * cross-tenant (siempre acotado por org_id de la rule).
 */
export async function buildCalculationInputs(
  input: FetcherInput
): Promise<CalculationInputs> {
  const { admin, rule, yearMonth, manualIndicatorPct } = input
  const { from, to } = monthRange(yearMonth)
  const orgId = rule.org_id
  const sellerId = rule.seller_id

  // ─── 1. Operaciones del seller en el mes ────────────────────────────
  // El field de fecha se elige según rule.date_field_for_period.
  const dateField = rule.date_field_for_period
  let opsQuery = admin
    .from("operations")
    .select(
      "id, sale_amount_total, operator_cost, currency, status, operation_date, created_at, departure_date, seller_id, seller_secondary_id, commission_split"
    )
    .eq("org_id", orgId)
    .gte(dateField, from)
    .lte(dateField, to)
    .neq("status", "CANCELLED")

  const { data: rawOps } = await opsQuery
  const allOps: any[] = rawOps || []

  // Filtrar a las que tienen al seller como primary o secondary
  const sellerOps = allOps.filter(
    (op) => op.seller_id === sellerId || op.seller_secondary_id === sellerId
  )

  // ─── 2. FX rates (USD→ARS) por fecha de operation_date ──────────────
  const ratesByDate = new Map<string, number>()
  const datesNeeded = Array.from(
    new Set(
      sellerOps
        .filter((op) => op.currency === "ARS")
        .map((op) => (op.operation_date || op.created_at).slice(0, 10))
    )
  )
  if (datesNeeded.length > 0) {
    // Buscar la tasa exacta o la más cercana anterior por fecha
    const { data: ratesData } = await admin
      .from("exchange_rates")
      .select("rate_date, rate")
      .eq("from_currency", "USD")
      .eq("to_currency", "ARS")
      .lte("rate_date", to)
      .gte("rate_date", from.slice(0, 4) + "-01-01") // todo el año por las dudas
      .order("rate_date", { ascending: true })
    const ratesSorted = (ratesData || []) as Array<{ rate_date: string; rate: number }>

    for (const d of datesNeeded) {
      // Encontrar la tasa <= d más reciente
      let r = 0
      for (const row of ratesSorted) {
        if (row.rate_date <= d) r = Number(row.rate)
        else break
      }
      ratesByDate.set(d, r)
    }
  }

  // ─── 3. Construir array operations con split y FX ───────────────────
  const operations = sellerOps.map((op) => {
    const isPrimary = op.seller_id === sellerId
    const isSecondary = op.seller_secondary_id === sellerId
    const split = op.commission_split ?? 100
    let sellerSplitPct = 100
    if (isPrimary && op.seller_secondary_id) {
      sellerSplitPct = split  // primary lleva commission_split
    } else if (isSecondary) {
      sellerSplitPct = 100 - split  // secondary lleva el complemento
    }
    const opDateKey = (op.operation_date || op.created_at).slice(0, 10)
    const fxRate = op.currency === "USD" ? 0 : (ratesByDate.get(opDateKey) || 0)
    return {
      id: op.id,
      sale_amount_total: Number(op.sale_amount_total || 0),
      operator_cost: Number(op.operator_cost || 0),
      currency: op.currency as "USD" | "ARS",
      fx_rate_usd_to_ars: fxRate,
      seller_split_pct: sellerSplitPct,
      status: op.status,
    }
  })

  // ─── 4. Cotizaciones CREADAS por el seller en el mes ────────────────
  const { count: quotationsCount } = await admin
    .from("quotations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("seller_id", sellerId)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59.999`)

  // ─── 5. Leads asignados al seller en el mes ─────────────────────────
  // Decisión: contar leads cuya `assigned_seller_id` = sellerId y cuya
  // fecha de "asignación" cayó en el mes. No tenemos campo assigned_at,
  // así que usamos created_at del lead como proxy (asume que el lead se
  // asignó al momento de creación o cerca). Si VICO necesita más
  // precisión, se puede agregar trigger que registre el cambio.
  const { count: leadsCount } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("assigned_seller_id", sellerId)
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59.999`)

  // ─── 6. Ajustes retroactivos pendientes ─────────────────────────────
  const { data: pendingAdjustments } = await admin
    .from("monthly_commission_adjustments")
    .select("amount_usd")
    .eq("seller_id", sellerId)
    .eq("status", "PENDING")

  const pendingAdjustmentsUsd = ((pendingAdjustments || []) as any[]).reduce(
    (sum: number, adj: any) => sum + Number(adj.amount_usd || 0),
    0
  )

  return {
    rule,
    year_month: yearMonth,
    operations,
    quotations_sent_count: quotationsCount || 0,
    leads_received_count: leadsCount || 0,
    manual_indicator_pct: manualIndicatorPct ?? null,
    pending_adjustments_usd: pendingAdjustmentsUsd,
  }
}
