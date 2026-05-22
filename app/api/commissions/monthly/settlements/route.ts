import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"

const FEATURE_FLAG = "features.monthly_commissions_module"

/**
 * GET /api/commissions/monthly/settlements?year_month=YYYY-MM&status=...
 * Lista settlements del org. Filtros opcionales por mes y status.
 * ADMIN/SUPER_ADMIN ven todos. SELLER ve solo los suyos.
 */
export async function GET(request: Request) {
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización" }, { status: 400 })
  }

  const supabase: any = await createServerClient()
  const enabled = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG)
  if (!enabled) {
    return NextResponse.json({ error: "Módulo no habilitado" }, { status: 404 })
  }

  const url = new URL(request.url)
  const yearMonth = url.searchParams.get("year_month")
  const status = url.searchParams.get("status")

  let q = supabase
    .from("monthly_commission_settlements")
    .select("*, users:seller_id(id, name, email), approved_by:approved_by_user_id(name)")
    .eq("org_id", user.org_id)
    .order("year_month", { ascending: false })
    .order("seller_id", { ascending: true })

  if (yearMonth) q = q.eq("year_month", yearMonth)
  if (status) q = q.eq("status", status)

  // SELLER scope a sus propios
  if (user.role === "SELLER") {
    q = q.eq("seller_id", user.id)
  }

  const { data, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ settlements: data || [] })
}
