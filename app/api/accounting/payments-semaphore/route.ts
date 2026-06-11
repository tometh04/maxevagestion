import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = "force-dynamic"

/**
 * GET /api/accounting/payments-semaphore
 *
 * Devuelve conteos y montos de cobros pendientes a clientes y pagos
 * pendientes a operadores, agrupados por urgencia:
 *   - overdue: vencidos (date_due/due_date < hoy)
 *   - near:    próximos a vencer (hoy <= date <= hoy+30 días)
 *   - ok:      sin urgencia (date > hoy+30 o sin fecha)
 *
 * Usado por el widget semáforo del dashboard (VIB-37).
 * Nota: es una vista gerencial — muestra el total del org/agencia,
 * no filtra por vendedor individual.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const agencyIdFilter = searchParams.get("agencyId")

    const supabase = await createServerClient()
    const orgId = (user as any).org_id as string

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split("T")[0]

    const nearDeadline = new Date(today)
    nearDeadline.setDate(nearDeadline.getDate() + 30)
    const nearDeadlineStr = nearDeadline.toISOString().split("T")[0]

    // Agencias del user para scoping
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Si el usuario no tiene agencias asignadas y no filtra explícitamente,
    // devolver vacío — no exponer datos de todo el org a un user sin scope.
    if (!agencyIdFilter && agencyIds.length === 0) {
      return NextResponse.json(
        {
          customerPayments: { overdue: { count: 0, totalUsd: 0 }, near: { count: 0, totalUsd: 0 }, ok: { count: 0, totalUsd: 0 } },
          operatorPayments: { overdue: { count: 0, totalUsd: 0 }, near: { count: 0, totalUsd: 0 }, ok: { count: 0, totalUsd: 0 } },
        },
        { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } }
      )
    }

    // ── Cobros pendientes a clientes (payments) ──────────────────────────────
    let customerQuery = (supabase.from("payments") as any)
      .select("id, amount, currency, amount_usd, date_due, agency_id")
      .eq("org_id", orgId)
      .eq("direction", "INCOME")
      .eq("payer_type", "CUSTOMER")
      .eq("status", "PENDING")

    if (agencyIdFilter && agencyIdFilter !== "ALL") {
      customerQuery = customerQuery.eq("agency_id", agencyIdFilter)
    } else {
      customerQuery = customerQuery.in("agency_id", agencyIds)
    }

    const { data: customerPayments } = await customerQuery

    // ── Pagos pendientes a operadores (operator_payments) ───────────────────
    let operatorQuery = (supabase.from("operator_payments") as any)
      .select("id, amount, paid_amount, currency, due_date, status, agency_id")
      .eq("org_id", orgId)
      .in("status", ["PENDING", "OVERDUE"])

    if (agencyIdFilter && agencyIdFilter !== "ALL") {
      operatorQuery = operatorQuery.eq("agency_id", agencyIdFilter)
    } else {
      operatorQuery = operatorQuery.in("agency_id", agencyIds)
    }

    const { data: operatorPayments } = await operatorQuery

    // ── Clasificación por urgencia ───────────────────────────────────────────
    type Bucket = { count: number; totalUsd: number }
    const empty = (): { overdue: Bucket; near: Bucket; ok: Bucket } => ({
      overdue: { count: 0, totalUsd: 0 },
      near: { count: 0, totalUsd: 0 },
      ok: { count: 0, totalUsd: 0 },
    })

    const customerResult = empty()
    for (const p of customerPayments || []) {
      const amtUsd = p.amount_usd != null
        ? Number(p.amount_usd)
        : p.currency === "USD"
          ? Number(p.amount || 0)
          : 0
      const dueDate = p.date_due as string | null
      let bucket: "overdue" | "near" | "ok" = "ok"
      if (dueDate) {
        if (dueDate < todayStr) bucket = "overdue"
        else if (dueDate <= nearDeadlineStr) bucket = "near"
      }
      customerResult[bucket].count++
      customerResult[bucket].totalUsd += amtUsd
    }

    const operatorResult = empty()
    for (const p of operatorPayments || []) {
      const pending = Math.max(0, Number(p.amount || 0) - Number(p.paid_amount || 0))
      if (pending < 0.01) continue // ignorar deudas ya cubiertas
      const amtUsd = p.currency === "USD" ? pending : 0
      const dueDate = p.due_date as string | null
      let bucket: "overdue" | "near" | "ok" = "ok"
      // status=OVERDUE siempre es rojo independientemente de due_date
      if (p.status === "OVERDUE" || (dueDate && dueDate < todayStr)) {
        bucket = "overdue"
      } else if (dueDate && dueDate <= nearDeadlineStr) {
        bucket = "near"
      }
      operatorResult[bucket].count++
      operatorResult[bucket].totalUsd += amtUsd
    }

    return NextResponse.json(
      { customerPayments: customerResult, operatorPayments: operatorResult },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      }
    )
  } catch (error: any) {
    console.error("[payments-semaphore] Error:", error)
    return NextResponse.json({ error: error?.message || "Error al cargar semáforo" }, { status: 500 })
  }
}
