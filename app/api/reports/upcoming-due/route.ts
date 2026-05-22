import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/reports/upcoming-due
 *
 * Lista vencimientos en una ventana de fechas:
 *   - customer_payments: payments pending donde el cliente nos debe
 *   - operator_payments: pagos a operadores pending que tenemos que hacer
 *
 * Query params: ?days=7 (default 7), ?agencyId=xxx (opcional)
 *
 * Para SELLER: solo sus propias operaciones.
 */
export async function GET(request: Request) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const { searchParams } = new URL(request.url)

  // 🔴 Fix cross-tenant CRÍTICO (2026-05-18, Tomi reportó VICO viendo
  // vencimientos ajenos): este endpoint confiaba en RLS para scope por org,
  // pero RLS evidentemente no está funcionando (mismo síntoma que /api/payments).
  // Defense-in-depth: agregamos .eq("org_id", user.org_id) explícito a las
  // dos queries (payments + operator_payments).
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const daysParam = parseInt(searchParams.get("days") || "7", 10)
  const days = Math.max(1, Math.min(daysParam, 90))
  const agencyId = searchParams.get("agencyId")

  const today = new Date()
  const limit = new Date(today)
  limit.setDate(today.getDate() + days)
  const todayStr = today.toISOString().split("T")[0]
  const limitStr = limit.toISOString().split("T")[0]

  // 1. Pagos de clientes pending (lo que nos deben)
  // LIMIT 500: ORDER BY date_due ascending pone los más urgentes primero;
  // el corte cae en pagos lejanos. Combinado con idx_payments_pending_due
  // (mig 20260427000009) deja el query en O(log n).
  let customerQuery = supabase
    .from("payments")
    .select(
      `id, amount, currency, date_due, status, payer_type, direction,
       operation:operation_id (id, file_code, destination, agency_id, seller_id,
         operation_customers(customer:customer_id(first_name, last_name)))`,
    )
    .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
    .eq("payer_type", "CUSTOMER")
    .in("status", ["PENDING", "OVERDUE"])
    .lte("date_due", limitStr)
    .order("date_due", { ascending: true })
    .limit(500)

  // 2. Pagos a operadores pending (lo que tenemos que pagar)
  let operatorQuery = supabase
    .from("operator_payments")
    .select(
      `id, amount, currency, due_date, status,
       operator:operator_id (id, name),
       operation:operation_id (id, file_code, destination, agency_id, seller_id)`,
    )
    .eq("org_id", user.org_id) // 🔴 scope multi-tenant explícito
    .in("status", ["PENDING", "OVERDUE"])
    .lte("due_date", limitStr)
    .order("due_date", { ascending: true })
    .limit(500)

  const [customerRes, operatorRes] = await Promise.all([customerQuery, operatorQuery])

  if (customerRes.error) {
    console.error("[upcoming-due] customer payments error:", customerRes.error.message)
  }
  if (operatorRes.error) {
    console.error("[upcoming-due] operator payments error:", operatorRes.error.message)
  }

  let customerRows = (customerRes.data || []) as any[]
  let operatorRows = (operatorRes.data || []) as any[]

  // Filtros aplicables en memoria (joins)
  if (agencyId && agencyId !== "all") {
    customerRows = customerRows.filter((r) => r.operation?.agency_id === agencyId)
    operatorRows = operatorRows.filter((r) => r.operation?.agency_id === agencyId)
  }

  if (user.role === "SELLER") {
    customerRows = customerRows.filter((r) => r.operation?.seller_id === user.id)
    operatorRows = operatorRows.filter((r) => r.operation?.seller_id === user.id)
  }

  // Marcar overdue dinámicamente (status DB puede estar desactualizado)
  function flagOverdue<T extends { status: string }>(rows: T[], dueField: keyof T): T[] {
    return rows.map((r) => ({
      ...r,
      isOverdue: (r[dueField] as unknown as string) < todayStr && r.status !== "PAID",
    }))
  }

  return NextResponse.json({
    days,
    today: todayStr,
    limit: limitStr,
    customer_payments: flagOverdue(customerRows, "date_due"),
    operator_payments: flagOverdue(operatorRows, "due_date"),
  })
}
