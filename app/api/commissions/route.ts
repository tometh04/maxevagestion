import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = 'force-dynamic'

const COMMISSION_THRESHOLD_KEY = "commissions.payout_collection_threshold"

/**
 * Umbral de cobranza (config por org, key/value en organization_settings) a
 * partir del cual una comisión PENDING se considera "cobrable" (pagable al
 * vendedor). Se guarda como porcentaje 0-100. Default 95%.
 *
 * Permite que convivan dos formas de operar:
 *   - Agencias que NO pagan hasta cobrar → 95% o 100%.
 *   - Agencias que pagan al cierre de mes aunque la operación no esté cobrada
 *     (ej. Lozada) → 0%.
 * Devuelve una FRACCIÓN (0..1).
 */
async function getCommissionCollectionThreshold(supabase: any, orgId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from("organization_settings")
      .select("value")
      .eq("org_id", orgId)
      .eq("key", COMMISSION_THRESHOLD_KEY)
      .maybeSingle()
    const raw = (data as any)?.value
    if (raw != null && String(raw).trim() !== "") {
      const pct = Number(raw)
      if (Number.isFinite(pct)) return Math.min(1, Math.max(0, pct / 100))
    }
  } catch {
    // Sin config → default abajo.
  }
  return 0.95
}

// GET - Obtener comisiones
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const sellerId = searchParams.get("sellerId")
    const status = searchParams.get("status")
    const periodStart = searchParams.get("periodStart")
    const periodEnd = searchParams.get("periodEnd")
    const month = searchParams.get("month") // Para filtrar por mes (YYYY-MM)

    // Determinar si puede ver todas las comisiones o solo las propias
    const canViewAll = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    // Always use commission_records (legacy commissions table is deprecated)
    let query = (supabase.from("commission_records") as any)
      .select(`
        *,
        operations:operation_id(
          id,
          file_code,
          destination,
          departure_date,
          sale_amount_total,
          operator_cost,
          sale_currency,
          margin_amount
        )
      `)
      .eq("org_id", (user as any).org_id)
      .order("date_calculated", { ascending: false })

    // Filtrar por seller: admin puede ver todos o filtrar, seller solo ve los suyos
    if (!canViewAll) {
      // Seller: solo sus comisiones
      query = query.eq("seller_id", user.id)
    } else if (sellerId && sellerId !== "ALL") {
      // Admin filtrando por un seller específico
      query = query.eq("seller_id", sellerId)
    }
    // Si es admin y no hay sellerId o sellerId=ALL, no filtra → trae todos

    // Filtros
    if (status && status !== "ALL") {
      query = query.eq("status", status.toUpperCase())
    }

    // Filtro por mes (YYYY-MM)
    if (month) {
      const [year, monthNum] = month.split("-")
      const startDate = `${year}-${monthNum}-01`
      const endDate = new Date(parseInt(year), parseInt(monthNum), 0).toISOString().split("T")[0]
      query = query.gte("date_calculated", startDate).lte("date_calculated", endDate)
    }

    // Filtro por rango de fechas
    if (periodStart) {
      query = query.gte("date_calculated", periodStart)
    }
    if (periodEnd) {
      query = query.lte("date_calculated", periodEnd)
    }

    const { data: commissionRecords, error } = await query

    if (error) {
      console.error("Error fetching commission_records:", error)
      return NextResponse.json(
        { error: "Error al obtener comisiones" },
        { status: 500 }
      )
    }

    // Para comisiones PENDING: NO ocultamos las de operaciones aún no cobradas.
    // Antes se filtraban (drop) las que no estaban cobradas al ≥95%, lo que hacía
    // que el vendedor/admin no viera comisiones reales en "Por Pagar" hasta cobrar
    // casi todo. Ahora las MOSTRAMOS todas pero ANOTAMOS cada una con:
    //   - collected_pct: % cobrado de la operación (pagos INCOME PAID / sale_amount_total)
    //   - collectible: true si está cobrada al ≥95% (o sin monto de venta) → recién ahí
    //     es pagable al vendedor. El front muestra un badge "No cobrada aún" y bloquea
    //     el pago de las no cobrables.
    // Las comisiones PAID siempre son collectible (ya se pagaron).
    // El umbral es configurable por org (default 95%). 0% → siempre cobrable.
    const COLLECTIBLE_THRESHOLD = await getCommissionCollectionThreshold(supabase, (user as any).org_id)
    let filteredRecords = commissionRecords || []
    const collectedPctByOp: Record<string, number> = {}
    // Anotamos el % cobrado de las operaciones de los registros PENDING
    // (sin importar el filtro de status, así también aplica a la vista "Todos").
    {
      const opIds = Array.from(new Set(
        filteredRecords.filter((cr: any) => cr.status === "PENDING").map((cr: any) => cr.operation_id).filter(Boolean)
      )) as string[]
      if (opIds.length > 0) {
        const { data: incomePayments } = await (supabase
          .from("payments") as any)
          .select("operation_id, amount")
          .in("operation_id", opIds)
          .eq("direction", "INCOME")
          .eq("status", "PAID")
          .eq("org_id", (user as any).org_id)

        // Sumar pagos INCOME cobrados por operación
        const paidByOp: Record<string, number> = {}
        for (const p of incomePayments || []) {
          paidByOp[p.operation_id] = (paidByOp[p.operation_id] || 0) + parseFloat(p.amount || 0)
        }

        for (const cr of filteredRecords) {
          const saleTotal = parseFloat(cr.operations?.sale_amount_total || 0)
          if (saleTotal <= 0) {
            collectedPctByOp[cr.operation_id] = 100
            continue
          }
          const totalPaid = paidByOp[cr.operation_id] || 0
          collectedPctByOp[cr.operation_id] = Math.round((totalPaid / saleTotal) * 100)
        }
      }
    }

    // Helper: ¿la comisión es cobrable (pagable al vendedor) ahora?
    const isCollectible = (cr: any): boolean => {
      if (cr.status === "PAID") return true
      const saleTotal = parseFloat(cr.operations?.sale_amount_total || 0)
      if (saleTotal <= 0) return true
      return (collectedPctByOp[cr.operation_id] ?? 0) >= COLLECTIBLE_THRESHOLD * 100
    }

    // Fetch seller names from users table (scopeado por org)
    const sellerIds = Array.from(new Set(filteredRecords.map((cr: any) => cr.seller_id).filter(Boolean))) as string[]
    let sellersMap: Record<string, { name: string; email: string }> = {}
    if (sellerIds.length > 0) {
      const { data: sellers } = await (supabase.from("users") as any)
        .select("id, name, email")
        .in("id", sellerIds)
        .eq("org_id", (user as any).org_id)
      if (sellers) {
        sellersMap = Object.fromEntries(sellers.map((s: any) => [s.id, s]))
      }
    }

    // Transformar commission_records a formato Commission
    const commissions = filteredRecords.map((cr: any) => {
      const seller = sellersMap[cr.seller_id]
      return {
        id: cr.id,
        operation_id: cr.operation_id,
        seller_id: cr.seller_id,
        seller_name: seller?.name || "Sin vendedor",
        seller_email: seller?.email || "",
        sellers: seller ? { id: cr.seller_id, name: seller.name } : null,
        agency_id: cr.agency_id,
        amount: parseFloat(cr.amount || 0),
        percentage: cr.percentage ? parseFloat(cr.percentage) : null,
        status: cr.status as "PENDING" | "PAID",
        date_calculated: cr.date_calculated,
        date_paid: cr.date_paid,
        // % cobrado de la operación + si la comisión ya es pagable (≥95% cobrado).
        // collected_pct solo se calcula en la vista PENDING; para PAID es 100.
        collected_pct: cr.status === "PAID" ? 100 : (collectedPctByOp[cr.operation_id] ?? null),
        collectible: isCollectible(cr),
        operation: cr.operations ? {
          id: cr.operations.id,
          short_code: cr.operations.file_code || "",
          file_code: cr.operations.file_code || "",
          destination: cr.operations.destination || "",
          departure_date: cr.operations.departure_date || "",
          sale_amount_total: parseFloat(cr.operations.sale_amount_total || 0),
          operator_cost: parseFloat(cr.operations.operator_cost || 0),
          margin_amount: parseFloat(cr.operations.margin_amount || 0),
          currency: cr.operations.sale_currency || "USD",
        } : null,
      }
    })

    // Calcular resumen mensual
    const monthlySummary = new Map<string, { total: number; pending: number; paid: number; count: number }>()

    commissions.forEach((comm: any) => {
      const monthKey = comm.date_calculated ? comm.date_calculated.substring(0, 7) : "unknown"
      if (!monthlySummary.has(monthKey)) {
        monthlySummary.set(monthKey, { total: 0, pending: 0, paid: 0, count: 0 })
      }
      const summary = monthlySummary.get(monthKey)!
      summary.total += comm.amount
      summary.count += 1
      if (comm.status === "PENDING") {
        summary.pending += comm.amount
      } else if (comm.status === "PAID") {
        summary.paid += comm.amount
      }
    })

    const monthlySummaryArray = Array.from(monthlySummary.entries()).map(([month, data]) => ({
      month,
      ...data,
    }))

    // Calcular totales
    const totals = {
      pending: commissions.filter((c: any) => c.status === "PENDING").reduce((sum: number, c: any) => sum + c.amount, 0),
      paid: commissions.filter((c: any) => c.status === "PAID").reduce((sum: number, c: any) => sum + c.amount, 0),
      total: commissions.reduce((sum: number, c: any) => sum + c.amount, 0),
    }

    return NextResponse.json({
      commissions,
      totals,
      monthlySummary: monthlySummaryArray,
    })

  } catch (error: any) {
    // Don't catch Next.js redirect errors
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error("Error in GET /api/commissions:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener comisiones" },
      { status: 500 }
    )
  }
}
