import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { buildCalculationInputs } from "@/lib/commissions/monthly/fetcher"
import { calculateMonthlyCommission } from "@/lib/commissions/monthly/calculator"

const FEATURE_FLAG = "features.monthly_commissions_module"

/**
 * POST /api/commissions/monthly/settlements/generate/[year_month]
 *
 * Genera/regenera drafts de todas las vendedoras con regla activa del org
 * para el mes indicado. Si ya existe un settlement en status DRAFT o
 * PENDING_APPROVAL, lo sobreescribe. Si está APPROVED/PAID, lo respeta
 * (no se re-calcula sobre algo ya aprobado).
 *
 * ADMIN/SUPER_ADMIN solamente.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ year_month: string }> }
) {
  const { year_month } = await params
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización" }, { status: 400 })
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
  }

  const supabase: any = await createServerClient()
  const enabled = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG)
  if (!enabled) {
    return NextResponse.json({ error: "Módulo no habilitado" }, { status: 404 })
  }

  if (!/^\d{4}-\d{2}$/.test(year_month)) {
    return NextResponse.json({ error: "year_month inválido (YYYY-MM)" }, { status: 400 })
  }

  // Todas las reglas activas del org
  const { data: rules, error: rulesErr } = await supabase
    .from("monthly_commission_rules")
    .select("*")
    .eq("org_id", user.org_id)
    .eq("enabled", true)

  if (rulesErr) {
    return NextResponse.json({ error: rulesErr.message }, { status: 500 })
  }
  if (!rules || rules.length === 0) {
    return NextResponse.json(
      { error: "No hay reglas activas en este org. Crear reglas primero." },
      { status: 400 }
    )
  }

  const admin = createAdminClient() as any
  const results: Array<{
    seller_id: string
    settlement_id?: string
    status: "created" | "updated" | "locked" | "error"
    error?: string
  }> = []

  for (const rule of rules as any[]) {
    try {
      // Settlement existente?
      const { data: existing } = await admin
        .from("monthly_commission_settlements")
        .select("id, status, mgmt_manual_indicator_pct")
        .eq("seller_id", rule.seller_id)
        .eq("year_month", year_month)
        .maybeSingle()

      if (existing && (existing.status === "APPROVED" || existing.status === "PAID")) {
        results.push({ seller_id: rule.seller_id, settlement_id: existing.id, status: "locked" })
        continue
      }

      const inputs = await buildCalculationInputs({
        admin,
        rule,
        yearMonth: year_month,
        manualIndicatorPct: existing?.mgmt_manual_indicator_pct ?? null,
      })
      const calc = calculateMonthlyCommission(inputs)

      const settlementRow: any = {
        seller_id: rule.seller_id,
        org_id: rule.org_id,
        year_month,
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
        const { error: updErr } = await admin
          .from("monthly_commission_settlements")
          .update(settlementRow)
          .eq("id", existing.id)
        if (updErr) throw updErr
        results.push({ seller_id: rule.seller_id, settlement_id: existing.id, status: "updated" })
      } else {
        const { data: inserted, error: insErr } = await admin
          .from("monthly_commission_settlements")
          .insert(settlementRow)
          .select("id")
          .single()
        if (insErr) throw insErr
        results.push({ seller_id: rule.seller_id, settlement_id: inserted.id, status: "created" })
      }

      // Marcar adjustments aplicados (si los hubo)
      if (calc.retroactive_adjustment_usd !== 0) {
        await admin
          .from("monthly_commission_adjustments")
          .update({
            status: "APPLIED",
            applied_in_settlement_id: results[results.length - 1].settlement_id,
            updated_at: new Date().toISOString(),
          })
          .eq("seller_id", rule.seller_id)
          .eq("status", "PENDING")
      }
    } catch (err: any) {
      console.error(`[generate-settlements] error seller ${rule.seller_id}:`, err)
      results.push({
        seller_id: rule.seller_id,
        status: "error",
        error: err?.message || "unknown",
      })
    }
  }

  const summary = {
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated").length,
    locked: results.filter((r) => r.status === "locked").length,
    errors: results.filter((r) => r.status === "error").length,
  }

  return NextResponse.json({ year_month, results, summary })
}
