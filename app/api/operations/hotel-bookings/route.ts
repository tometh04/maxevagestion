import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds, canPerformAction } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import {
  getHotelBookings,
  HOTEL_BOOKINGS_LIMIT,
  type HotelBookingRow,
  type HotelSummaryRow,
} from "@/lib/operations/hotel-bookings"

export const dynamic = "force-dynamic"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/operations/hotel-bookings
 *
 * Devuelve las reservas de hotel que matchean una cadena (?hotel=Iberostar)
 * dentro de un rango de fechas (?dateFrom&dateTo, sobre check-in con fallback a
 * salida), junto con un resumen por hotel. Con ?format=csv devuelve un CSV
 * Excel-ES en vez de JSON.
 *
 * Multi-tenant + scope por rol: la lógica vive en lib/operations/hotel-bookings
 * (org_id explícito + applyOperationsFilters / scope de tramos).
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!(user as any).org_id) {
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const hotel = searchParams.get("hotel")?.trim() ?? ""
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const dateField = searchParams.get("dateField") === "created" ? "created" : "departure"
    const agencyId = searchParams.get("agencyId")
    const sellerId = searchParams.get("sellerId")
    const format = (searchParams.get("format") ?? "json").toLowerCase()

    if (dateFrom && !DATE_RE.test(dateFrom)) {
      return NextResponse.json({ error: "Formato de fecha inválido (dateFrom)" }, { status: 400 })
    }
    if (dateTo && !DATE_RE.test(dateTo)) {
      return NextResponse.json({ error: "Formato de fecha inválido (dateTo)" }, { status: 400 })
    }

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Permiso: mismo módulo que Operaciones. La matrix por agencia respeta
    // overrides dinámicos; sin org_id no llegamos acá.
    const perms = await resolveUserPermissions(
      supabase as any,
      user.id,
      (user as any).org_id,
      (user as any).roles ?? [user.role],
      agencyIds
    )
    if (!canPerformAction(user as any, "operations", "read", perms)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { rows, summary, truncated } = await getHotelBookings(
      supabase,
      user as any,
      agencyIds,
      { hotel, dateFrom, dateTo, dateField, agencyId, sellerId }
    )

    if (format === "csv") {
      return csvResponse(rows, truncated)
    }

    return NextResponse.json(
      { rows, summary, truncated, count: rows.length },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" } }
    )
  } catch (err: any) {
    console.error("[operations/hotel-bookings] error:", err)
    return NextResponse.json(
      { error: err?.message ?? "Error obteniendo reservas por hotel" },
      { status: 500 }
    )
  }
}

/**
 * CSV Excel-ES: separador ";", decimal con coma, BOM UTF-8, directiva `sep=;`,
 * CRLF. Mismo formato que app/api/operations/export-csv/route.ts (Excel en
 * español/Argentina rompe con ",").
 */
function csvResponse(rows: HotelBookingRow[], truncated: boolean): NextResponse {
  const DELIM = ";"

  const csvEscape = (value: any): string => {
    if (value === null || value === undefined) return ""
    const str = String(value)
    if (/[";\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
    return str
  }
  const numEs = (value: any): string => {
    if (value === null || value === undefined || value === "") return ""
    const n = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(n)) return String(value)
    return String(Math.round(n * 100) / 100).replace(".", ",")
  }

  const headers = [
    "hotel",
    "codigo_reserva",
    "cliente",
    "file_code",
    "checkin",
    "checkout",
    "fecha_salida",
    "fecha_regreso",
    "fecha_carga",
    "vendedor",
    "estado",
    "monto_venta",
    "moneda",
    "monto_venta_usd",
    "origen",
  ]

  const csvRows: string[] = [headers.join(DELIM)]
  for (const r of rows) {
    const row = [
      r.hotelName,
      r.reservationCode,
      r.customerName,
      r.fileCode,
      r.checkinDate,
      r.checkoutDate,
      r.departureDate,
      r.returnDate,
      r.createdAt ? String(r.createdAt).slice(0, 10) : "",
      r.sellerName,
      r.status,
      numEs(r.saleAmount),
      r.saleCurrency,
      numEs(r.saleAmountUsd),
      r.source === "leg" ? "tramo" : "operación",
    ].map(csvEscape)
    csvRows.push(row.join(DELIM))
  }

  const BOM = "﻿"
  const csv = BOM + "sep=;\r\n" + csvRows.join("\r\n")

  const today = new Date().toISOString().slice(0, 10)
  const filename = truncated
    ? `reservas-hotel-${today}-TRUNCADO-${HOTEL_BOOKINGS_LIMIT}.csv`
    : `reservas-hotel-${today}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
