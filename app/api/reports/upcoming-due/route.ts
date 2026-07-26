import { NextResponse } from "next/server"
import { getRequestPermissions } from "@/lib/permissions/request"
import { isOwnDataOnlyResolved } from "@/lib/permissions-api"

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
  const { user, supabase, matrix } = await getRequestPermissions()
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

  // VIB-61 (audit): antes cada lista traía .limit(500) con las deudas SIN fecha
  // (date_due IS NULL) ordenadas al final → si había >500 vencimientos, las
  // deudas sin fecha (deuda real) quedaban cortadas. Y los filtros de agencia/
  // seller corrían en memoria sobre ese set truncado. Ahora:
  //  - Los filtros de agencia/seller van en la query (inner join en operation).
  //  - Traemos por separado las deudas CON fecha (en la ventana) y las SIN fecha,
  //    cada una con su tope, así las sin fecha nunca se pierden por las con fecha.
  //  - `truncated` avisa si algún bucket llegó al tope.
  const CAP = 1000
  const ownDataOnly = isOwnDataOnlyResolved(user, "reports", matrix ?? undefined)
  const filterAgency = !!(agencyId && agencyId !== "all")
  const needInner = filterAgency || ownDataOnly
  const opEmbed = needInner ? "operation:operation_id!inner" : "operation:operation_id"

  const applyOpFilters = (q: any) => {
    if (filterAgency) q = q.eq("operation.agency_id", agencyId)
    if (ownDataOnly) q = q.eq("operation.seller_id", user.id)
    return q
  }

  const custSelect = `id, amount, currency, date_due, status, payer_type, direction,
    ${opEmbed} (id, file_code, destination, agency_id, seller_id,
      operation_customers(customer:customer_id(first_name, last_name)))`
  const custBase = () =>
    applyOpFilters(
      (supabase.from("payments") as any)
        .select(custSelect)
        .eq("org_id", user.org_id)
        .eq("payer_type", "CUSTOMER")
        .in("status", ["PENDING", "OVERDUE"]),
    )

  const opSelect = `id, amount, currency, due_date, status,
    operator:operator_id (id, name),
    ${opEmbed} (id, file_code, destination, agency_id, seller_id)`
  const opBase = () =>
    applyOpFilters(
      (supabase.from("operator_payments") as any)
        .select(opSelect)
        .eq("org_id", user.org_id)
        .in("status", ["PENDING", "OVERDUE"]),
    )

  const [custDated, custUndated, opDated, opUndated] = await Promise.all([
    custBase().not("date_due", "is", null).lte("date_due", limitStr).order("date_due", { ascending: true }).limit(CAP),
    custBase().is("date_due", null).limit(CAP),
    opBase().not("due_date", "is", null).lte("due_date", limitStr).order("due_date", { ascending: true }).limit(CAP),
    opBase().is("due_date", null).limit(CAP),
  ])

  for (const r of [custDated, custUndated, opDated, opUndated]) {
    if (r.error) console.error("[upcoming-due] error:", r.error.message)
  }

  const customerRows = [...(custDated.data || []), ...(custUndated.data || [])] as any[]
  const operatorRows = [...(opDated.data || []), ...(opUndated.data || [])] as any[]
  const truncated =
    (custDated.data?.length ?? 0) >= CAP ||
    (custUndated.data?.length ?? 0) >= CAP ||
    (opDated.data?.length ?? 0) >= CAP ||
    (opUndated.data?.length ?? 0) >= CAP

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
    truncated,
    customer_payments: flagOverdue(customerRows, "date_due"),
    operator_payments: flagOverdue(operatorRows, "due_date"),
  })
}
