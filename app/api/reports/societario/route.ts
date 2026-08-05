import { NextResponse } from "next/server"
import { buildSocietarioReportData } from "@/lib/reports/societario-report-data"
import { resolveSocietarioReportRequest } from "@/lib/reports/societario-report-request"

/**
 * GET /api/reports/societario
 *
 * Reporte societario del período (VIB-101): ventas totales, gastos, comisiones
 * a repartir, ganancia bruta y neta, y el reparto entre socios.
 *
 * Restringido a dueños, admin y contable: expone el resultado del negocio y la
 * participación de cada socio. El gate real está acá, no en la pestaña.
 *
 * Query: dateFrom, dateTo (YYYY-MM-DD), currency (ARS|USD), agencyId,
 *        exchangeRate (TC único), ivaRatePct (alícuota sobre el margen).
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveSocietarioReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const payload = await buildSocietarioReportData({
      supabase: resolved.supabase,
      orgId: resolved.orgId,
      ...resolved.params,
    })

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error("Error in GET /api/reports/societario:", error)
    return NextResponse.json(
      { error: "Error al generar el reporte societario" },
      { status: 500 }
    )
  }
}
