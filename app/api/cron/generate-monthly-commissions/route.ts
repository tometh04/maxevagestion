import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { buildCalculationInputs } from "@/lib/commissions/monthly/fetcher"
import { calculateMonthlyCommission } from "@/lib/commissions/monthly/calculator"

/**
 * POST /api/cron/generate-monthly-commissions
 *
 * Corre el 1ro de cada mes vía Railway Cron Service. Genera los drafts
 * de comisiones del mes ANTERIOR para todos los orgs que tienen el feature
 * flag `features.monthly_commissions_module` activo.
 *
 * Auth: Bearer CRON_SECRET (mismo patrón que el resto de /api/cron/*).
 *
 * Idempotente: si los settlements ya existen como DRAFT/PENDING_APPROVAL,
 * los recalcula. Los APPROVED/PAID quedan intactos.
 */
export async function POST(request: Request) {
  // Auth con Bearer secret
  const authHeader = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient() as any

  // ─── 1. Calcular year_month del mes ANTERIOR ────────────────────────
  const now = new Date()
  // Primero del mes actual; restar 1 día = último día del mes anterior
  const lastOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const year = lastOfPrevMonth.getFullYear()
  const month = lastOfPrevMonth.getMonth() + 1
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`

  // ─── 2. Encontrar orgs con el feature flag activo ───────────────────
  const { data: orgsWithFlag } = await admin
    .from("organization_settings")
    .select("org_id")
    .eq("key", "features.monthly_commissions_module")
    .in("value", ["true", "1", "yes"])

  const orgIds = ((orgsWithFlag || []) as any[]).map((r) => r.org_id)
  if (orgIds.length === 0) {
    return NextResponse.json({ year_month: yearMonth, orgs_processed: 0, message: "No hay orgs con el módulo activo" })
  }

  // ─── 3. Obtener todas las reglas activas de esos orgs ───────────────
  const { data: allRules } = await admin
    .from("monthly_commission_rules")
    .select("*")
    .in("org_id", orgIds)
    .eq("enabled", true)

  const rules = (allRules || []) as any[]

  // ─── 4. Procesar cada regla ─────────────────────────────────────────
  let created = 0
  let updated = 0
  let locked = 0
  let errors = 0
  const errorDetail: Array<{ seller_id: string; error: string }> = []

  for (const rule of rules) {
    try {
      const { data: existing } = await admin
        .from("monthly_commission_settlements")
        .select("id, status, mgmt_manual_indicator_pct")
        .eq("seller_id", rule.seller_id)
        .eq("year_month", yearMonth)
        .maybeSingle()

      if (existing && (existing.status === "APPROVED" || existing.status === "PAID")) {
        locked++
        continue
      }

      const inputs = await buildCalculationInputs({
        admin,
        rule,
        yearMonth,
        manualIndicatorPct: existing?.mgmt_manual_indicator_pct ?? null,
      })
      const calc = calculateMonthlyCommission(inputs)

      const row: any = {
        seller_id: rule.seller_id,
        org_id: rule.org_id,
        year_month: yearMonth,
        total_margin_usd: calc.total_margin_usd,
        non_commissionable_amount_usd: calc.non_commissionable_amount_usd,
        excess_usd: calc.excess_usd,
        bracket_applied_pct: calc.bracket_applied_pct,
        base_commission_usd: calc.base_commission_usd,
        sales_component_pct: calc.sales_component_pct,
        mgmt_quotations_indicator_pct: calc.mgmt_quotations_indicator_pct,
        mgmt_leads_indicator_pct: calc.mgmt_leads_indicator_pct,
        mgmt_manual_indicator_pct: calc.mgmt_manual_indicator_pct,
        mgmt_component_pct: calc.mgmt_component_pct,
        performance_factor_pct: calc.performance_factor_pct,
        retroactive_adjustment_usd: calc.retroactive_adjustment_usd,
        final_commission_usd: calc.final_commission_usd,
        rule_snapshot: rule,
        quotations_sent_count: calc.quotations_sent_count,
        leads_received_count: calc.leads_received_count,
        sales_closed_count: calc.sales_closed_count,
        operations_included: calc.operations_included,
        status: existing?.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "DRAFT",
        updated_at: new Date().toISOString(),
      }

      if (existing) {
        await admin.from("monthly_commission_settlements").update(row).eq("id", existing.id)
        updated++
      } else {
        const { data: ins } = await admin
          .from("monthly_commission_settlements")
          .insert(row)
          .select("id")
          .single()
        created++
        // Marcar adjustments aplicados
        if (calc.retroactive_adjustment_usd !== 0 && ins) {
          await admin
            .from("monthly_commission_adjustments")
            .update({
              status: "APPLIED",
              applied_in_settlement_id: ins.id,
              updated_at: new Date().toISOString(),
            })
            .eq("seller_id", rule.seller_id)
            .eq("status", "PENDING")
        }
      }
    } catch (err: any) {
      console.error(`[cron generate-monthly-commissions] err seller ${rule.seller_id}:`, err)
      errors++
      errorDetail.push({ seller_id: rule.seller_id, error: err?.message || "unknown" })
    }
  }

  return NextResponse.json({
    year_month: yearMonth,
    orgs_processed: orgIds.length,
    rules_total: rules.length,
    created,
    updated,
    locked,
    errors,
    errorDetail: errors > 0 ? errorDetail.slice(0, 10) : undefined,
  })
}
