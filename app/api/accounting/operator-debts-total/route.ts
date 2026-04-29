import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * GET /api/accounting/operator-debts-total
 *
 * Endpoint lightweight para el KPI "Deuda" (a operadores) del dashboard.
 * Retorna SOLO el total pendiente en USD via RPC SUM SQL.
 *
 * Para la vista detallada del módulo (lista de operator_payments con breakdown),
 * usar /accounting/operator-payments con su propio endpoint.
 *
 * Multi-tenant safe: la RPC tiene SECURITY INVOKER, respeta RLS, y filtra
 * explícitamente por org_id + role + agency.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId")

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    const t0 = Date.now()
    const { data, error } = await (supabase.rpc as any)(
      "accounting_operator_debts_total",
      {
        p_user_id: user.id,
        p_org_id: user.org_id || null,
        p_role: user.role,
        p_agency_ids: agencyIds,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_agency_id: agencyId && agencyId !== "ALL" ? agencyId : null,
      }
    )

    if (error) {
      console.error("[operator-debts-total] RPC error:", error.message)
      return NextResponse.json(
        { error: "RPC failed", details: error.message },
        { status: 500 }
      )
    }

    const totalUsd = Number(data) || 0
    console.log(
      `[operator-debts-total] RPC ok in ${Date.now() - t0}ms → ${totalUsd}`
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
    console.error("[operator-debts-total] Error:", error)
    return NextResponse.json(
      { error: error?.message || "Error al calcular total de deuda" },
      { status: 500 }
    )
  }
}
