import { NextResponse } from "next/server"
import { buildCashflowProjectionReportData } from "@/lib/reports/cashflow-projection-report-data"
import { resolveCashflowProjectionReportRequest } from "@/lib/reports/cashflow-projection-report-request"

/**
 * GET /api/reports/cashflow-projection
 *
 * Reporte de caja y flujo proyectado (VIB-67): saldo actual de las cuentas,
 * cobranzas vencidas, y cobranzas y pagos a operadores por tramos de días
 * configurables (default 7/15/30), más la proyección de saldo tramo a tramo.
 *
 * Pesos y dólares corren en paralelo y nunca se suman.
 *
 * Query: agencyId, tramos (ej. "7,15,30").
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveCashflowProjectionReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const payload = await buildCashflowProjectionReportData({
      supabase: resolved.supabase,
      orgId: resolved.orgId,
      agencyIds: resolved.agencyIds,
      ...resolved.params,
    })

    return NextResponse.json(payload, {
      // El reporte es caro (cobranzas + pagos + saldos). Un caché corto y
      // privado evita recalcularlo en cada cambio de tramo.
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/cashflow-projection:", error)
    return NextResponse.json({ error: "Error al generar el reporte de caja" }, { status: 500 })
  }
}
