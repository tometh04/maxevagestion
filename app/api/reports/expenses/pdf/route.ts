import { NextResponse } from "next/server"
import {
  buildExpensesReportData,
  loadExpensesReportCompany,
} from "@/lib/reports/expenses-report-data"
import { resolveExpensesReportRequest } from "@/lib/reports/expenses-report-request"
import { generateExpensesReportPdf } from "@/lib/pdf/expenses-report-pdf"

/**
 * GET /api/reports/expenses/pdf
 *
 * Descarga el Reporte de Gastos como PDF listo para presentar. Usa exactamente
 * los mismos datos, filtros y guards que `/api/reports/expenses`; lo único que
 * agrega es el branding del tenant para el encabezado.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveExpensesReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const [payload, company] = await Promise.all([
      buildExpensesReportData({
        supabase: resolved.supabase,
        orgId: resolved.orgId,
        ...resolved.params,
      }),
      loadExpensesReportCompany({ supabase: resolved.supabase, orgId: resolved.orgId }),
    ])

    const pdf = generateExpensesReportPdf({
      report: payload.report,
      filters: payload.filters,
      company,
    })

    const filename = `reporte-gastos-${payload.filters.currency}-${payload.filters.dateFrom}_${payload.filters.dateTo}.pdf`

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/expenses/pdf:", error)
    return NextResponse.json({ error: "Error al generar el PDF del reporte" }, { status: 500 })
  }
}
