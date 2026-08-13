import { NextResponse } from "next/server"
import { buildSalesBreakdownReportData } from "@/lib/reports/sales-breakdown-report-data"
import { resolveSalesBreakdownReportRequest } from "@/lib/reports/sales-breakdown-report-request"

/**
 * GET /api/reports/sales-breakdown
 *
 * Reporte de ventas por tipo de producto (VIB-66): paquete, vuelo, hotel,
 * asistencia y los tipos propios de cada organización, segmentado además por
 * vendedor, agencia y mes, con el detalle operación por operación.
 *
 * La venta se registra a nivel operación y el producto a nivel ítem, así que se
 * reparte la venta entre los ítems (ver `lib/reports/sales-breakdown-report.ts`).
 * El payload expone en `summary.attribution` con qué criterio se repartió cada
 * operación; la suma de los productos siempre da el total exacto.
 *
 * Nota: `/api/reports/sales` sigue existiendo y sirve a la tab "Ventas" clásica.
 *
 * Query: dateFrom, dateTo (YYYY-MM-DD), currency (ARS|USD), agencyId, sellerId.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveSalesBreakdownReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const payload = await buildSalesBreakdownReportData({
      supabase: resolved.supabase,
      orgId: resolved.orgId,
      agencyIds: resolved.agencyIds,
      ...resolved.params,
    })

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error("Error in GET /api/reports/sales-breakdown:", error)
    return NextResponse.json(
      { error: "Error al generar el reporte de ventas" },
      { status: 500 }
    )
  }
}
