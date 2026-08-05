import { NextResponse } from "next/server"
import {
  buildSocietarioReportData,
  loadSocietarioReportCompany,
} from "@/lib/reports/societario-report-data"
import { resolveSocietarioReportRequest } from "@/lib/reports/societario-report-request"
import { generateSocietarioReportPdf } from "@/lib/pdf/societario-report-pdf"

/**
 * GET /api/reports/societario/pdf
 *
 * Descarga el Reporte Societario como PDF listo para presentar. Usa exactamente
 * los mismos datos, filtros y guards que `/api/reports/societario`: el PDF no
 * puede ser una segunda puerta más débil que la pantalla.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveSocietarioReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const [payload, company] = await Promise.all([
      buildSocietarioReportData({
        supabase: resolved.supabase,
        orgId: resolved.orgId,
        ...resolved.params,
      }),
      loadSocietarioReportCompany({ supabase: resolved.supabase, orgId: resolved.orgId }),
    ])

    const pdf = generateSocietarioReportPdf({
      report: payload.report,
      filters: payload.filters,
      company,
    })

    const filename = `reporte-societario-${payload.filters.currency}-${payload.filters.dateFrom}_${payload.filters.dateTo}.pdf`

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/societario/pdf:", error)
    return NextResponse.json(
      { error: "Error al generar el PDF del reporte societario" },
      { status: 500 }
    )
  }
}
