import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { buildCalculationInputs } from "@/lib/commissions/monthly/fetcher"
import { calculateMonthlyCommission } from "@/lib/commissions/monthly/calculator"

const FEATURE_FLAG = "features.monthly_commissions_module"

async function gate(supabase: any, user: any) {
  if (!user.org_id) {
    return { error: NextResponse.json({ error: "Usuario sin organización" }, { status: 400 }), userOrgId: "" }
  }
  const enabled = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG)
  if (!enabled) {
    return { error: NextResponse.json({ error: "Módulo no habilitado" }, { status: 404 }), userOrgId: "" }
  }
  return { error: null, userOrgId: user.org_id as string }
}

/**
 * GET /api/commissions/monthly/settlements/[id]
 * Detalle del settlement. SELLER ve el suyo, admins ven todos del org.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase: any = await createServerClient()
  const { error: gateErr, userOrgId } = await gate(supabase, user)
  if (gateErr) return gateErr

  const { data, error } = await supabase
    .from("monthly_commission_settlements")
    .select("*, users:seller_id(id, name, email), approved_by:approved_by_user_id(name)")
    .eq("id", id)
    .eq("org_id", userOrgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Settlement no encontrado" }, { status: 404 })
  }

  // SELLER no-admin solo el suyo
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN"
  if (!isAdmin && (data as any).seller_id !== user.id) {
    return NextResponse.json({ error: "Settlement no encontrado" }, { status: 404 })
  }

  return NextResponse.json({ settlement: data })
}

/**
 * PATCH /api/commissions/monthly/settlements/[id]
 *
 * Acciones soportadas (admin-only):
 *  - action="submit_for_approval"          : DRAFT → PENDING_APPROVAL
 *  - action="approve"                       : PENDING_APPROVAL/DRAFT → APPROVED
 *  - action="mark_paid"                     : APPROVED → PAID (paid_at = now)
 *  - action="cancel"                        : cualquiera → CANCELLED
 *  - action="set_manual_indicator"          : carga mgmt_manual_indicator_pct y RE-CALCULA
 *  - action="recalculate"                   : re-corre el cálculo (solo si NO APPROVED/PAID)
 *
 * Body: { action, value?, notes? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
  }
  const supabase: any = await createServerClient()
  const { error: gateErr, userOrgId } = await gate(supabase, user)
  if (gateErr) return gateErr

  const body = await request.json()
  const { action, value, notes } = body

  const { data: current } = await supabase
    .from("monthly_commission_settlements")
    .select("*")
    .eq("id", id)
    .eq("org_id", userOrgId)
    .single()

  if (!current) {
    return NextResponse.json({ error: "Settlement no encontrado" }, { status: 404 })
  }
  const settlement = current as any
  const admin = createAdminClient() as any

  const nowIso = new Date().toISOString()

  switch (action) {
    case "submit_for_approval": {
      if (settlement.status !== "DRAFT") {
        return NextResponse.json(
          { error: `No se puede enviar a aprobación desde estado ${settlement.status}` },
          { status: 400 }
        )
      }
      const { data, error } = await supabase
        .from("monthly_commission_settlements")
        .update({ status: "PENDING_APPROVAL", notes, updated_at: nowIso })
        .eq("id", id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ settlement: data })
    }

    case "approve": {
      if (settlement.status === "APPROVED" || settlement.status === "PAID" || settlement.status === "CANCELLED") {
        return NextResponse.json(
          { error: `No se puede aprobar desde estado ${settlement.status}` },
          { status: 400 }
        )
      }
      const { data, error } = await supabase
        .from("monthly_commission_settlements")
        .update({
          status: "APPROVED",
          approved_by_user_id: user.id,
          approved_at: nowIso,
          notes,
          updated_at: nowIso,
        })
        .eq("id", id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ settlement: data })
    }

    case "mark_paid": {
      if (settlement.status !== "APPROVED") {
        return NextResponse.json(
          { error: `Solo se puede marcar como PAID desde APPROVED (actual: ${settlement.status})` },
          { status: 400 }
        )
      }
      const { data, error } = await supabase
        .from("monthly_commission_settlements")
        .update({ status: "PAID", paid_at: nowIso, notes, updated_at: nowIso })
        .eq("id", id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ settlement: data })
    }

    case "cancel": {
      const { data, error } = await supabase
        .from("monthly_commission_settlements")
        .update({ status: "CANCELLED", notes, updated_at: nowIso })
        .eq("id", id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ settlement: data })
    }

    case "set_manual_indicator": {
      if (settlement.status === "APPROVED" || settlement.status === "PAID") {
        return NextResponse.json(
          { error: "No se puede modificar indicador manual en settlement ya aprobado/pagado" },
          { status: 400 }
        )
      }
      const pct = typeof value === "number" ? value : null
      if (pct !== null && (pct < 0 || pct > 100)) {
        return NextResponse.json({ error: "value debe estar entre 0 y 100" }, { status: 400 })
      }
      // Re-calcular con el nuevo manual indicator
      const { data: rule } = await supabase
        .from("monthly_commission_rules")
        .select("*")
        .eq("seller_id", settlement.seller_id)
        .eq("org_id", userOrgId)
        .single()
      if (!rule) {
        return NextResponse.json({ error: "Regla no encontrada para recalcular" }, { status: 404 })
      }
      const inputs = await buildCalculationInputs({
        admin,
        rule: rule as any,
        yearMonth: settlement.year_month,
        manualIndicatorPct: pct,
      })
      const calc = calculateMonthlyCommission(inputs)
      const { data, error } = await supabase
        .from("monthly_commission_settlements")
        .update({
          mgmt_manual_indicator_pct: pct,
          mgmt_quotations_indicator_pct: calc.mgmt_quotations_indicator_pct,
          mgmt_leads_indicator_pct: calc.mgmt_leads_indicator_pct,
          mgmt_component_pct: calc.mgmt_component_pct,
          performance_factor_pct: calc.performance_factor_pct,
          final_commission_usd: calc.final_commission_usd,
          notes,
          updated_at: nowIso,
        })
        .eq("id", id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ settlement: data, recalculated: calc })
    }

    case "recalculate": {
      if (settlement.status === "APPROVED" || settlement.status === "PAID") {
        return NextResponse.json(
          { error: "No se puede recalcular un settlement aprobado/pagado" },
          { status: 400 }
        )
      }
      const { data: rule } = await supabase
        .from("monthly_commission_rules")
        .select("*")
        .eq("seller_id", settlement.seller_id)
        .eq("org_id", userOrgId)
        .single()
      if (!rule) {
        return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 })
      }
      const inputs = await buildCalculationInputs({
        admin,
        rule: rule as any,
        yearMonth: settlement.year_month,
        manualIndicatorPct: settlement.mgmt_manual_indicator_pct ?? null,
      })
      const calc = calculateMonthlyCommission(inputs)
      const { data, error } = await supabase
        .from("monthly_commission_settlements")
        .update({
          total_margin_usd: calc.total_margin_usd,
          non_commissionable_amount_usd: calc.non_commissionable_amount_usd,
          excess_usd: calc.excess_usd,
          bracket_applied_pct: calc.bracket_applied_pct,
          base_commission_usd: calc.base_commission_usd,
          sales_component_pct: calc.sales_component_pct,
          mgmt_quotations_indicator_pct: calc.mgmt_quotations_indicator_pct,
          mgmt_leads_indicator_pct: calc.mgmt_leads_indicator_pct,
          mgmt_component_pct: calc.mgmt_component_pct,
          performance_factor_pct: calc.performance_factor_pct,
          retroactive_adjustment_usd: calc.retroactive_adjustment_usd,
          final_commission_usd: calc.final_commission_usd,
          quotations_sent_count: calc.quotations_sent_count,
          leads_received_count: calc.leads_received_count,
          sales_closed_count: calc.sales_closed_count,
          operations_included: calc.operations_included,
          rule_snapshot: rule,
          notes,
          updated_at: nowIso,
        })
        .eq("id", id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ settlement: data })
    }

    default:
      return NextResponse.json(
        {
          error:
            "Action inválida. Use: submit_for_approval, approve, mark_paid, cancel, set_manual_indicator, recalculate",
        },
        { status: 400 }
      )
  }
}
