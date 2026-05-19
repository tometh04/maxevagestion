import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds, applyOperationsFilters } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * GET /api/operations/export-csv
 *
 * Devuelve TODAS las operaciones del org del user en formato CSV (con todas
 * las columnas relevantes). Respeta los mismos filtros que la lista de
 * operations (search, status, agency_id, fechas, etc).
 *
 * Multi-tenant: defense-in-depth con .eq("org_id", user.org_id) explícito
 * (no confiar en RLS).
 *
 * Si el resultado es > LIMIT_HARD rows, corta y avisa en el filename para
 * evitar tirar abajo el server con queries gigantes.
 */
const LIMIT_HARD = 10_000

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!(user as any).org_id) {
      return NextResponse.json(
        { error: "Usuario sin organización asociada" },
        { status: 400 }
      )
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Filtros opcionales (espejo de /api/operations)
    const searchTerm = searchParams.get("search")?.trim() ?? ""
    const status = searchParams.get("status")
    const agencyIdParam = searchParams.get("agencyId")
    const sellerIdParam = searchParams.get("sellerId")
    const operatorIdParam = searchParams.get("operatorId")
    const typeParam = searchParams.get("type")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const dateType = (searchParams.get("dateType") ?? "OPERATION").toUpperCase()

    // Columnas reales según lib/supabase/types.ts.
    // 2026-05-19 fix: la versión inicial pedía exchange_rate / notes /
    // commission_percentage que NO existen → endpoint rompía con
    // "column operations.exchange_rate does not exist".
    let query: any = supabase
      .from("operations")
      .select(`
        id, file_code, type, status, product_type,
        created_at, updated_at, operation_date,
        destination, origin, departure_date, return_date,
        checkin_date, checkout_date,
        adults, children, infants,
        sale_amount_total, sale_currency, currency,
        operator_cost, operator_cost_currency,
        margin_amount, margin_percentage,
        billing_margin_amount, billing_margin_percentage,
        commission_split, commission_pct_primary, commission_pct_secondary,
        airline_name, hotel_name,
        reservation_code_air, reservation_code_hotel,
        sellers:seller_id(name, email),
        sellers_secondary:seller_secondary_id(name, email),
        operators:operator_id(name),
        agencies:agency_id(name, city),
        leads:lead_id(contact_name),
        operation_customers(
          role,
          customers:customer_id(first_name, last_name)
        )
      `)
      .eq("org_id", userOrgId)

    // Scope por role (SELLER ve solo las suyas, etc)
    query = applyOperationsFilters(query, user as any, agencyIds)

    if (status && status !== "ALL") query = query.eq("status", status)
    if (typeParam && typeParam !== "ALL") query = query.eq("type", typeParam)
    if (agencyIdParam && agencyIdParam !== "ALL") query = query.eq("agency_id", agencyIdParam)
    if (sellerIdParam && sellerIdParam !== "ALL") query = query.eq("seller_id", sellerIdParam)
    if (operatorIdParam && operatorIdParam !== "ALL") query = query.eq("operator_id", operatorIdParam)

    if (dateFrom || dateTo) {
      const column =
        dateType === "DEPARTURE" ? "departure_date" :
        dateType === "CREATED" ? "created_at" :
        "operation_date"
      if (dateFrom) query = query.gte(column, dateFrom)
      if (dateTo) query = query.lte(column, dateTo)
    }

    if (searchTerm) {
      const ilike = `%${searchTerm}%`
      query = query.or(
        [
          `file_code.ilike.${ilike}`,
          `destination.ilike.${ilike}`,
          `origin.ilike.${ilike}`,
        ].join(",")
      )
    }

    query = query.order("created_at", { ascending: false }).limit(LIMIT_HARD)

    const { data, error } = await query

    if (error) {
      console.error("[export-csv] query error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data ?? []) as any[]
    const truncated = rows.length === LIMIT_HARD

    // Construir CSV con TODAS las columnas relevantes de operations.
    // 2026-05-19 v2: alineado con columnas reales de la tabla (typed en
    // lib/supabase/types.ts). La v1 incluía columnas inexistentes
    // (exchange_rate, notes, commission_percentage) que rompían el SELECT.
    const headers = [
      "id",
      "file_code",
      "tipo",
      "product_type",
      "status",
      "creada",
      "actualizada",
      "fecha_operacion",
      "destino",
      "origen",
      "fecha_salida",
      "fecha_regreso",
      "fecha_checkin",
      "fecha_checkout",
      "adultos",
      "menores",
      "infantes",
      "monto_venta",
      "moneda_venta",
      "moneda_general",
      "costo_operador",
      "moneda_costo_operador",
      "margen_monto",
      "margen_pct",
      "billing_margen_monto",
      "billing_margen_pct",
      "comision_split_pct_primario",
      "comision_pct_primario",
      "comision_pct_secundario",
      "vendedor_primario",
      "vendedor_primario_email",
      "vendedor_secundario",
      "vendedor_secundario_email",
      "operador",
      "agencia",
      "agencia_ciudad",
      "cliente_principal",
      "todos_los_pasajeros",
      "lead_contact_name",
      "aerolinea",
      "hotel",
      "codigo_reserva_aereo",
      "codigo_reserva_hotel",
    ]

    const csvRows: string[] = [headers.join(",")]

    const csvEscape = (value: any): string => {
      if (value === null || value === undefined) return ""
      const str = String(value)
      // Si contiene coma, comillas, salto de línea → escapar con comillas dobles
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const customerName = (c: any): string => {
      if (!c) return ""
      return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
    }

    for (const op of rows) {
      const opCustomers = (op.operation_customers ?? []) as any[]
      const main = opCustomers.find((oc) => oc.role === "MAIN" || oc.role === "main")
      const passengers = opCustomers
        .map((oc) => customerName(oc.customers))
        .filter(Boolean)
        .join(" | ")

      const row = [
        op.id,
        op.file_code,
        op.type,
        op.product_type,
        op.status,
        op.created_at,
        op.updated_at,
        op.operation_date,
        op.destination,
        op.origin,
        op.departure_date,
        op.return_date,
        op.checkin_date,
        op.checkout_date,
        op.adults,
        op.children,
        op.infants,
        op.sale_amount_total,
        op.sale_currency,
        op.currency,
        op.operator_cost,
        op.operator_cost_currency,
        op.margin_amount,
        op.margin_percentage,
        op.billing_margin_amount,
        op.billing_margin_percentage,
        op.commission_split,
        op.commission_pct_primary,
        op.commission_pct_secondary,
        op.sellers?.name,
        op.sellers?.email,
        op.sellers_secondary?.name,
        op.sellers_secondary?.email,
        op.operators?.name,
        op.agencies?.name,
        op.agencies?.city,
        customerName(main?.customers),
        passengers,
        op.leads?.contact_name,
        op.airline_name,
        op.hotel_name,
        op.reservation_code_air,
        op.reservation_code_hotel,
      ].map(csvEscape)

      csvRows.push(row.join(","))
    }

    // BOM para que Excel detecte UTF-8 (sino se rompen los acentos)
    const BOM = "﻿"
    const csv = BOM + csvRows.join("\n")

    const today = new Date().toISOString().slice(0, 10)
    const filenameBase = truncated
      ? `operaciones-${today}-TRUNCADO-${LIMIT_HARD}.csv`
      : `operaciones-${today}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err: any) {
    console.error("[export-csv] error:", err)
    return NextResponse.json(
      { error: err?.message ?? "Error generando CSV" },
      { status: 500 }
    )
  }
}
