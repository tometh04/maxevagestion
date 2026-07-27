import { NextResponse } from "next/server"
import { buildExpensesReportData } from "@/lib/reports/expenses-report-data"
import { resolveExpensesReportRequest } from "@/lib/reports/expenses-report-request"

/**
 * GET /api/reports/expenses
 *
 * Reporte de gastos del período (VIB-64): KPIs, distribución por categoría,
 * evolución temporal, desglose por tipo/cuenta y detalle gasto por gasto.
 * Es la misma data que consume el PDF (`./pdf`), para que lo descargado sea
 * exactamente lo que se ve en pantalla.
 *
 * Query: dateFrom, dateTo (YYYY-MM-DD), currency (ARS|USD), agencyId,
 *        agencyMode (office|account), type (recurring|variable).
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveExpensesReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const payload = await buildExpensesReportData({
      supabase: resolved.supabase,
      orgId: resolved.orgId,
      ...resolved.params,
    })

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error("Error in GET /api/reports/expenses:", error)
    return NextResponse.json({ error: "Error al generar el reporte de gastos" }, { status: 500 })
  }
}
