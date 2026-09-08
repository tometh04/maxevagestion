import { NextResponse } from "next/server"
import { buildCommissionsReportData } from "@/lib/reports/commissions-report-data"
import { resolveCommissionsReportRequest } from "@/lib/reports/commissions-report-request"

/**
 * GET /api/reports/commissions
 *
 * Reporte de comisiones del período (VIB-65): totales por vendedor, evolución
 * mensual, matriz vendedor × mes, desglose por estado y agencia, y detalle
 * comisión por comisión (incluidas las operaciones compartidas entre dos
 * vendedores). Es la misma data que consume el PDF (`./pdf`).
 *
 * El mes de cada comisión lo define la fecha de venta de la operación, no la
 * fecha de cálculo: un recálculo masivo no debe reescribir la historia.
 *
 * Query: dateFrom, dateTo (YYYY-MM-DD), currency (ARS|USD|ALL), agencyId,
 *        sellerId. Con "ALL" vuelve un reporte por moneda en `reports`; las
 *        monedas nunca se suman entre sí.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveCommissionsReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const payload = await buildCommissionsReportData({
      supabase: resolved.supabase,
      orgId: resolved.orgId,
      agencyIds: resolved.agencyIds,
      ...resolved.params,
    })

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error("Error in GET /api/reports/commissions:", error)
    return NextResponse.json(
      { error: "Error al generar el reporte de comisiones" },
      { status: 500 }
    )
  }
}
