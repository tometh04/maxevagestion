import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { buildDefaultRule } from "@/lib/commissions/monthly/calculator"

const FEATURE_FLAG = "features.monthly_commissions_module"

async function assertModuleEnabled(supabase: any, orgId: string) {
  const enabled = await getOrgFeatureFlag(supabase, orgId, FEATURE_FLAG)
  if (!enabled) {
    return NextResponse.json(
      { error: "Módulo de comisiones mensuales no habilitado para esta organización" },
      { status: 404 }
    )
  }
  return null
}

/**
 * GET /api/commissions/monthly/rules
 * Lista todas las reglas del org. ADMIN/SUPER_ADMIN solamente.
 */
export async function GET() {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización" }, { status: 400 })
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
  }

  const supabase: any = await createServerClient()
  const blocked = await assertModuleEnabled(supabase, user.org_id)
  if (blocked) return blocked

  const { data, error } = await supabase
    .from("monthly_commission_rules")
    .select("*, users:seller_id(id, name, email, role)")
    .eq("org_id", user.org_id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rules: data || [] })
}

/**
 * POST /api/commissions/monthly/rules
 * Crea una regla para una vendedora. Si ya existe, devuelve 409.
 * Body: { seller_id, ...optionalOverrides }
 *
 * Si solo se pasa seller_id (sin otros campos), se aplica el default VICO
 * vía buildDefaultRule(). El admin puede editar después.
 */
export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización" }, { status: 400 })
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
  }

  const supabase: any = await createServerClient()
  const blocked = await assertModuleEnabled(supabase, user.org_id)
  if (blocked) return blocked

  const body = await request.json()
  const { seller_id, ...overrides } = body

  if (!seller_id) {
    return NextResponse.json({ error: "seller_id es requerido" }, { status: 400 })
  }

  // Validar que el seller pertenece al org
  const { data: seller } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("id", seller_id)
    .eq("org_id", user.org_id)
    .maybeSingle()

  if (!seller) {
    return NextResponse.json({ error: "Vendedor inválido o no pertenece a tu organización" }, { status: 400 })
  }

  // Defaults + overrides
  const defaultRule = buildDefaultRule(user.org_id, seller_id)
  const insertData: any = {
    ...defaultRule,
    ...overrides,
    seller_id,
    org_id: user.org_id,
    created_by_user_id: user.id,
  }
  // Validar que pesos suman 100 si vienen overrideados
  const salesW = Number(insertData.factor_sales_weight_pct ?? 50)
  const mgmtW = Number(insertData.factor_mgmt_weight_pct ?? 50)
  if (Math.round(salesW + mgmtW) !== 100) {
    return NextResponse.json(
      { error: `Los pesos del factor deben sumar 100. Recibí ${salesW} + ${mgmtW}` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("monthly_commission_rules")
    .insert(insertData)
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ya existe una regla para esta vendedora" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rule: data }, { status: 201 })
}
