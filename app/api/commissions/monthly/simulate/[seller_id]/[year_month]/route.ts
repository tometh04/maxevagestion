import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { buildCalculationInputs } from "@/lib/commissions/monthly/fetcher"
import { calculateMonthlyCommission } from "@/lib/commissions/monthly/calculator"

const FEATURE_FLAG = "features.monthly_commissions_module"

/**
 * GET /api/commissions/monthly/simulate/[seller_id]/[year_month]
 *
 * Simulación en tiempo real. Calcula la comisión que la vendedora
 * llevaría cobrada al día de hoy, según sus números actuales del mes.
 *
 * Acceso:
 *   - El seller puede ver el suyo
 *   - ADMIN/SUPER_ADMIN puede ver cualquiera del org
 *
 * No escribe a BD — solo computa y devuelve.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ seller_id: string; year_month: string }> }
) {
  const { seller_id, year_month } = await params
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización" }, { status: 400 })
  }

  // Access check: o sos el seller, o admin del org
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN"
  if (!isAdmin && user.id !== seller_id) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
  }

  const supabase: any = await createServerClient()
  const enabled = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG)
  if (!enabled) {
    return NextResponse.json(
      { error: "Módulo de comisiones mensuales no habilitado" },
      { status: 404 }
    )
  }

  // Validar formato year_month
  if (!/^\d{4}-\d{2}$/.test(year_month)) {
    return NextResponse.json(
      { error: "year_month debe tener formato YYYY-MM" },
      { status: 400 }
    )
  }

  // Buscar la regla activa de este seller
  const { data: rule } = await supabase
    .from("monthly_commission_rules")
    .select("*")
    .eq("seller_id", seller_id)
    .eq("org_id", user.org_id)
    .eq("enabled", true)
    .maybeSingle()

  if (!rule) {
    return NextResponse.json(
      { error: "Esta vendedora no tiene regla de comisión mensual configurada" },
      { status: 404 }
    )
  }

  // Cálculo con admin client (necesita leer ops/quotations/leads cross-vendedora)
  const admin = createAdminClient()
  try {
    const inputs = await buildCalculationInputs({
      admin,
      rule: rule as any,
      yearMonth: year_month,
    })
    const result = calculateMonthlyCommission(inputs)

    // Adjuntar el seller info para que el UI pueda mostrar nombre sin re-fetch
    const { data: seller } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("id", seller_id)
      .eq("org_id", user.org_id)
      .single()

    return NextResponse.json({
      seller,
      year_month,
      rule,
      simulation: result,
    })
  } catch (err: any) {
    console.error("[commissions/monthly/simulate] error:", err)
    return NextResponse.json(
      { error: err?.message || "Error al calcular simulación" },
      { status: 500 }
    )
  }
}
