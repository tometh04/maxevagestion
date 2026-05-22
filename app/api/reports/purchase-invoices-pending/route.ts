import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/reports/purchase-invoices-pending
 *
 * Lista purchase_invoices que NO están pagadas, ordenadas por antigüedad.
 * Útil para conciliación: ver qué facturas de operadores quedan abiertas.
 *
 * Query params: ?agencyId=xxx (opcional)
 */
export async function GET(request: Request) {
  const { user } = await getCurrentUser()

  // 🔴 Fix cross-tenant CRÍTICO (2026-05-18, sweep /reports/*): defense-in-depth
  // RLS no está protegiendo confiablemente; agregamos .eq("org_id", user.org_id)
  // explícito a la query de purchase_invoices.
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { searchParams } = new URL(request.url)
  const agencyId = searchParams.get("agencyId")

  // RLS + filtro explícito (defense-in-depth)
  let query = supabase
    .from("purchase_invoices")
    .select(
      `id, invoice_type, invoice_number, invoice_date, currency,
       net_amount, total_amount, total_ars_equivalent, status, notes, created_at,
       operator:operator_id (id, name, cuit),
       operation:operation_id (id, file_code, destination, agency_id, seller_id)`,
    )
    .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
    .neq("status", "PAID")
    .order("invoice_date", { ascending: true })
    .limit(500)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let rows = (data || []) as any[]

  if (agencyId && agencyId !== "all") {
    rows = rows.filter((r) => r.operation?.agency_id === agencyId)
  }
  if (user.role === "SELLER") {
    rows = rows.filter((r) => r.operation?.seller_id === user.id)
  }

  // Calcular días desde la fecha de la factura
  const today = new Date()
  const enriched = rows.map((r) => {
    const invDate = new Date(r.invoice_date)
    const days = Math.floor((today.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24))
    return { ...r, days_old: days }
  })

  // Totales por moneda
  const totals = enriched.reduce(
    (acc, r) => {
      const cur = (r.currency || "ARS") as "ARS" | "USD"
      acc[cur] = (acc[cur] || 0) + (Number(r.total_amount) || 0)
      acc.count++
      return acc
    },
    { ARS: 0, USD: 0, count: 0 } as Record<string, number>,
  )

  return NextResponse.json({ invoices: enriched, totals })
}
