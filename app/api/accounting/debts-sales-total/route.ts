import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * GET /api/accounting/debts-sales-total
 *
 * Endpoint lightweight para el KPI "Deudores" del dashboard.
 * Retorna SOLO el total de deuda en USD, calculado via RPC SUM SQL.
 *
 * Para la vista detallada (lista de deudores con operations breakdown),
 * usar /api/accounting/debts-sales (el original, intacto).
 *
 * Multi-tenant safe: la RPC tiene SECURITY INVOKER, respeta RLS, y filtra
 * explícitamente por org_id + role + agency.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const sellerIdFilter = searchParams.get("sellerId")
    const dateFromFilter = searchParams.get("dateFrom")
    const dateToFilter = searchParams.get("dateTo")
    const dateType = (searchParams.get("dateType") || "SALIDA").toUpperCase()

    if (!canAccessModule(user.role as any, "accounting")) {
      return NextResponse.json(
        { error: "No tiene permiso para ver esta sección" },
        { status: 403 }
      )
    }

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    const t0 = Date.now()
    const { data, error } = await (supabase.rpc as any)(
      "accounting_debts_sales_total",
      {
        p_user_id: user.id,
        p_org_id: user.org_id || null,
        p_role: user.role,
        p_agency_ids: agencyIds,
        p_date_from: dateFromFilter || null,
        p_date_to: dateToFilter || null,
        p_seller_id:
          sellerIdFilter && sellerIdFilter !== "ALL" ? sellerIdFilter : null,
        p_date_type: dateType === "CREACION" ? "CREACION" : "SALIDA",
      }
    )

    if (error) {
      console.error(
        "[debts-sales-total] RPC error:",
        error.message
      )
      return NextResponse.json(
        { error: "RPC failed", details: error.message },
        { status: 500 }
      )
    }

    const totalUsd = Number(data) || 0
    console.log(
      `[debts-sales-total] RPC ok in ${Date.now() - t0}ms → ${totalUsd}`
    )

    return NextResponse.json(
      { totalUsd },
      {
        headers: {
          "Cache-Control":
            "private, max-age=30, stale-while-revalidate=60",
        },
      }
    )
  } catch (error: any) {
    console.error("[debts-sales-total] Error:", error)
    return NextResponse.json(
      { error: error?.message || "Error al calcular total de deudores" },
      { status: 500 }
    )
  }
}
