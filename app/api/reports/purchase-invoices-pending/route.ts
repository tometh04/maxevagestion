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

  // VIB-61 (audit): antes esto traía `.limit(500)` y filtraba por agencia/seller
  // EN MEMORIA después del corte, y los totales (deuda a proveedores ARS/USD +
  // count) se sumaban sobre ese set truncado → la deuda subreportaba en orgs con
  // muchas facturas abiertas. Ahora:
  //  - El filtro de agencia/seller va en la query (inner join), no en memoria.
  //  - Traemos TODAS las facturas impagas (paginado) para que los totales sean
  //    el agregado real, no el de las 500 más antiguas.
  const filterAgency = !!(agencyId && agencyId !== "all")
  const filterSeller = user.role === "SELLER"
  const needInnerOp = filterAgency || filterSeller

  // El join a operation es !inner solo cuando filtramos por un campo suyo, para
  // que el filtro realmente acote (y preservar el comportamiento previo: al
  // filtrar por agencia/seller se excluían las facturas sin operación asociada).
  const opSelect = needInnerOp
    ? `operation:operation_id!inner (id, file_code, destination, agency_id, seller_id)`
    : `operation:operation_id (id, file_code, destination, agency_id, seller_id)`

  const buildQuery = () => {
    let q = (supabase.from("purchase_invoices") as any)
      .select(
        `id, invoice_type, invoice_number, invoice_date, currency,
         net_amount, total_amount, total_ars_equivalent, status, notes, created_at,
         operator:operator_id (id, name, cuit),
         ${opSelect}`,
      )
      .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
      .neq("status", "PAID")
    if (filterAgency) q = q.eq("operation.agency_id", agencyId)
    if (filterSeller) q = q.eq("operation.seller_id", user.id)
    return q.order("invoice_date", { ascending: true })
  }

  // Traer todas las filas paginando (evita el techo de max-rows de PostgREST).
  const PAGE = 1000
  const rows: any[] = []
  for (let from = 0; from <= 100000; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const batch = (data || []) as any[]
    rows.push(...batch)
    if (batch.length < PAGE) break
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
