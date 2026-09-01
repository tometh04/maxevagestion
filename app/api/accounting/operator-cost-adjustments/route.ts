/**
 * Listado y totales de los ajustes de liquidación (VIB-174).
 *
 * Es el "algún lugar donde queden todos estos ajustes" del pedido: filtrable
 * por mes, oficina, operador y vendedor, con los totales separados por moneda
 * para poder contabilizarlos al cierre.
 */

import { NextResponse } from "next/server"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"
import {
  buildOperatorAdjustmentsReport,
  toAdjustmentRow,
} from "@/lib/reports/operator-adjustments-report"

const PAGE = 1000

export async function GET(request: Request) {
  try {
    const { user, supabase, matrix } = await getRequestPermissions()
    const orgId = (user as any).org_id

    if (!orgId) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    if (!canPerformAction(user, "accounting", "read", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Un vendedor que solo ve lo suyo no tiene por qué ver los ajustes de la
    // agencia: el reporte muestra la pérdida de cada operación y de cada colega.
    if (isOwnDataOnlyResolved(user, "accounting", matrix ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const url = new URL(request.url)
    const from = url.searchParams.get("from")
    const to = url.searchParams.get("to")
    const agencyId = url.searchParams.get("agencyId")
    const operatorId = url.searchParams.get("operatorId")
    const includeReversed = url.searchParams.get("includeReversed") === "true"

    const rows: any[] = []

    for (let offset = 0; ; offset += PAGE) {
      let query = (supabase as any)
        .from("operator_cost_adjustments")
        .select(
          `id, accrual_date, created_at, operation_id, operator_id, agency_id, currency,
           estimated_amount, actual_amount, delta_amount, agency_share_amount,
           referrer_share_amount, seller_shares, reason, reversed_at, operator_name,
           operations:operation_id(file_code),
           operators:operator_id(name),
           agencies:agency_id(name)`,
        )
        .eq("org_id", orgId)
        .order("accrual_date", { ascending: false })
        .order("id")
        .range(offset, offset + PAGE - 1)

      if (from) query = query.gte("accrual_date", from)
      if (to) query = query.lte("accrual_date", to)
      if (agencyId) query = query.eq("agency_id", agencyId)
      if (operatorId) query = query.eq("operator_id", operatorId)
      if (!includeReversed) query = query.is("reversed_at", null)

      const { data, error } = await query

      if (error) {
        console.error("[VIB-174] Error leyendo los ajustes:", error)
        return NextResponse.json({ error: "Error al leer los ajustes" }, { status: 500 })
      }

      rows.push(...(data || []))
      if (!data || data.length < PAGE) break
    }

    // Los nombres de los vendedores no salen del join: viven dentro del JSONB.
    const sellerIds = Array.from(
      new Set(
        rows.flatMap((row: any) =>
          Array.isArray(row.seller_shares)
            ? row.seller_shares.map((s: any) => s.seller_id).filter(Boolean)
            : [],
        ),
      ),
    )

    const namesById = new Map<string, string>()
    if (sellerIds.length > 0) {
      const { data: sellers } = await (supabase.from("users") as any)
        .select("id, first_name, last_name")
        .eq("org_id", orgId)
        .in("id", sellerIds)

      for (const seller of sellers || []) {
        namesById.set(
          seller.id,
          `${seller.first_name ?? ""} ${seller.last_name ?? ""}`.trim() || "Vendedor",
        )
      }
    }

    const normalized = rows.map((raw: any) =>
      toAdjustmentRow({
        ...raw,
        seller_shares: Array.isArray(raw.seller_shares)
          ? raw.seller_shares.map((s: any) => ({
              ...s,
              seller_name: namesById.get(s.seller_id) ?? null,
            }))
          : [],
      }),
    )

    return NextResponse.json(buildOperatorAdjustmentsReport(normalized))
  } catch (error: any) {
    console.error("[VIB-174] Error en el reporte de ajustes:", error)
    return NextResponse.json(
      { error: error?.message || "Error al armar el reporte" },
      { status: 500 },
    )
  }
}
