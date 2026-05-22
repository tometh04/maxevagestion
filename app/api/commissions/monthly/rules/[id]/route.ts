import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"

const FEATURE_FLAG = "features.monthly_commissions_module"

async function gate(supabase: any, user: any) {
  if (!user.org_id) {
    return { error: NextResponse.json({ error: "Usuario sin organización" }, { status: 400 }), userOrgId: null }
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }), userOrgId: null }
  }
  const enabled = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG)
  if (!enabled) {
    return { error: NextResponse.json({ error: "Módulo no habilitado" }, { status: 404 }), userOrgId: null }
  }
  return { error: null, userOrgId: user.org_id as string }
}

/**
 * GET /api/commissions/monthly/rules/[id]
 * Detalle de una regla. ADMIN/SUPER_ADMIN del org.
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
    .from("monthly_commission_rules")
    .select("*, users:seller_id(id, name, email, role)")
    .eq("id", id)
    .eq("org_id", userOrgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 })
  }

  return NextResponse.json({ rule: data })
}

/**
 * PATCH /api/commissions/monthly/rules/[id]
 * Actualiza campos de la regla (cualquier campo configurable).
 * NO permite cambiar seller_id ni org_id desde el body.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase: any = await createServerClient()
  const { error: gateErr, userOrgId } = await gate(supabase, user)
  if (gateErr) return gateErr

  const body = await request.json()
  // Anti-forge
  delete body.id
  delete body.seller_id
  delete body.org_id
  delete body.created_at
  delete body.created_by_user_id

  // Validar pesos suman 100 si vienen
  if (
    typeof body.factor_sales_weight_pct === "number" ||
    typeof body.factor_mgmt_weight_pct === "number"
  ) {
    const { data: existing } = await supabase
      .from("monthly_commission_rules")
      .select("factor_sales_weight_pct, factor_mgmt_weight_pct")
      .eq("id", id)
      .eq("org_id", userOrgId)
      .single()
    if (!existing) {
      return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 })
    }
    const salesW = Number(body.factor_sales_weight_pct ?? existing.factor_sales_weight_pct)
    const mgmtW = Number(body.factor_mgmt_weight_pct ?? existing.factor_mgmt_weight_pct)
    if (Math.round(salesW + mgmtW) !== 100) {
      return NextResponse.json(
        { error: `Los pesos deben sumar 100 (recibí ${salesW} + ${mgmtW})` },
        { status: 400 }
      )
    }
  }

  const { data, error } = await supabase
    .from("monthly_commission_rules")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", userOrgId)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Regla no encontrada" }, { status: 404 })
  }

  return NextResponse.json({ rule: data })
}

/**
 * DELETE /api/commissions/monthly/rules/[id]
 * Borra una regla. Si la vendedora tiene settlements existentes,
 * NO se borran (queda historial; pero no se calculan más).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase: any = await createServerClient()
  const { error: gateErr, userOrgId } = await gate(supabase, user)
  if (gateErr) return gateErr

  const { error } = await supabase
    .from("monthly_commission_rules")
    .delete()
    .eq("id", id)
    .eq("org_id", userOrgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
