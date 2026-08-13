/**
 * Pagos pendientes a operadores, para el Reporte de Caja (VIB-67).
 *
 * Pendiente = `amount − COALESCE(paid_amount, 0)`; `operator_payments` soporta
 * pagos parciales.
 *
 * Sobre el "vencido": se usa `hasPendingBalance()` de
 * `lib/accounting/operator-payment-settlement.ts` para decidir si el pago sigue
 * abierto (ahí está el fix del `status` que queda stale en la base), pero NO
 * `getEffectiveOperatorPaymentStatus()`: ese helper normaliza contra
 * `new Date()` en la zona horaria del servidor (UTC en Railway), que es
 * justamente el off-by-one que este reporte tiene que evitar. El vencimiento se
 * decide comparando strings YYYY-MM-DD contra el hoy argentino.
 */

import { hasPendingBalance } from "@/lib/accounting/operator-payment-settlement"
import { fetchAllRows } from "@/lib/supabase/fetch-all"

export interface PayableRow {
  id: string
  operationId: string | null
  fileCode: string
  operatorName: string
  amount: number
  paidAmount: number
  pending: number
  currency: string
  dueDate: string | null
}

export interface FetchPayablesParams {
  supabase: any
  orgId: string
  agencyId?: string | null
  agencyIds?: string[]
}

export interface FetchPayablesResult {
  payables: PayableRow[]
  truncated: boolean
}

export async function fetchPayables(
  params: FetchPayablesParams
): Promise<FetchPayablesResult> {
  const { supabase, orgId } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const agencyIds = params.agencyIds ?? []

  const { rows, truncated } = await fetchAllRows<any>((from, to) =>
    (supabase.from("operator_payments") as any)
      .select(
        `id, operation_id, amount, paid_amount, currency, due_date, status, file_code,
         operators:operator_id(name),
         operations:operation_id(id, file_code, agency_id)`
      )
      .eq("org_id", orgId)
      .neq("status", "PAID")
      .order("id", { ascending: true })
      .range(from, to)
  )

  const payables: PayableRow[] = []
  for (const row of rows) {
    // El saldo manda sobre el status: un pago marcado PENDING pero ya saldado
    // no es deuda, y uno marcado PAID con saldo abierto sí lo es.
    if (!hasPendingBalance({ amount: row.amount, paid_amount: row.paid_amount })) continue

    // Alcance por agencia: la de la operación asociada. Los pagos sin operación
    // (deuda suelta con el operador) no se pueden atribuir, así que solo se
    // excluyen cuando hay un filtro de agencia explícito.
    const opAgency = row.operations?.agency_id ?? null
    if (agencyId) {
      if (opAgency !== agencyId) continue
    } else if (agencyIds.length > 0 && opAgency && !agencyIds.includes(opAgency)) {
      continue
    }

    const amount = Number(row.amount) || 0
    const paidAmount = Number(row.paid_amount) || 0

    payables.push({
      id: row.id,
      operationId: row.operation_id ?? null,
      fileCode: row.file_code || row.operations?.file_code || "-",
      operatorName: row.operators?.name || "Sin operador",
      amount,
      paidAmount,
      pending: amount - paidAmount,
      currency: row.currency || "ARS",
      dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
    })
  }

  return { payables, truncated }
}
