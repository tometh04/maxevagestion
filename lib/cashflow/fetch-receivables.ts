/**
 * Cobranzas pendientes de clientes, para el Reporte de Caja (VIB-67).
 *
 * El sistema NO materializa filas de `payments` por lo que el cliente debe:
 * solo registra los cobros reales (`status = PAID`). Un reporte que buscara
 * `payments.status = PENDING` saldría casi vacío. La deuda se deriva:
 *
 *   deuda = max(0, sale_amount_total + saleExtra
 *                  − Σ(pagos PAID del cliente; INCOME suma, EXPENSE resta))
 *
 * Es la misma fórmula de `app/api/accounting/debts-sales/route.ts`, incluido el
 * detalle que resolvió el bug de la "deuda fantasma": los pagos se suman EN LA
 * MONEDA DE LA VENTA y recién ahí se netean. Si esto se re-implementa distinto,
 * el reporte y la pantalla de Deudas muestran números que no coinciden y el
 * reporte deja de ser creíble.
 *
 * A diferencia de `debts-sales`, acá se arranca desde `operations` en vez de
 * desde `customers`, así que no hace falta deduplicar los paquetes compartidos:
 * cada operación aparece una sola vez por construcción. El titular (`MAIN`) se
 * usa solo para mostrar un nombre.
 */

import {
  DEFAULT_USD_ARS_FALLBACK_RATE,
  buildExchangeRateMap,
  getLatestExchangeRate,
} from "@/lib/accounting/exchange-rates"
import { getServiceExtrasByOperation } from "@/lib/accounting/operation-services-debt"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
import { fetchAllRows, fetchInChunks } from "@/lib/supabase/fetch-all"

/** Qué fecha se terminó usando como vencimiento de la cobranza. */
export type DueDateSource = "deadline" | "departure" | "missing"

export interface ReceivableRow {
  operationId: string
  fileCode: string
  destination: string
  customerName: string
  sellerName: string
  saleAmount: number
  paid: number
  debt: number
  currency: string
  dueDate: string | null
  dueDateSource: DueDateSource
}

export interface FetchReceivablesParams {
  supabase: any
  orgId: string
  agencyId?: string | null
  agencyIds?: string[]
  ownDataOnlyUserId?: string | null
}

export interface FetchReceivablesResult {
  receivables: ReceivableRow[]
  dueDateSource: { fromPaymentDeadline: number; fromDepartureDate: number; missing: number }
  truncated: boolean
}

const OPERATION_SELECT = `
  id, file_code, destination, sale_amount_total, sale_currency, currency,
  customer_payment_deadline, departure_date, operation_date, created_at,
  seller_id, agency_id
`

export async function fetchReceivables(
  params: FetchReceivablesParams
): Promise<FetchReceivablesResult> {
  const { supabase, orgId, ownDataOnlyUserId } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const agencyIds = params.agencyIds ?? []

  // Todo lo no cancelado: una cobranza pendiente no tiene rango de fechas, se
  // debe hasta que se cobre.
  const { rows: operations, truncated } = await fetchAllRows<any>((from, to) => {
    let q = (supabase.from("operations") as any)
      .select(OPERATION_SELECT)
      .eq("org_id", orgId)
      .neq("status", "CANCELLED")

    if (agencyId) q = q.eq("agency_id", agencyId)
    else if (agencyIds.length > 0) q = q.in("agency_id", agencyIds)
    if (ownDataOnlyUserId) q = q.eq("seller_id", ownDataOnlyUserId)

    return q.order("id", { ascending: true }).range(from, to)
  })

  if (operations.length === 0) {
    return {
      receivables: [],
      dueDateSource: { fromPaymentDeadline: 0, fromDepartureDate: 0, missing: 0 },
      truncated,
    }
  }

  const operationIds = operations.map((op) => op.id)

  const includeServices = !!(await getOrgFeatureFlag(
    supabase,
    orgId,
    FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
  ))
  const serviceExtras: Record<string, { saleExtra: number; costExtra: number }> =
    includeServices
      ? await getServiceExtrasByOperation(
          supabase,
          operations.map((op) => ({
            id: op.id,
            sale_currency: op.sale_currency,
            currency: op.currency,
          })) as any,
          orgId
        )
      : {}

  // Pagos de cliente ya realizados. Se traen INCOME y EXPENSE: una devolución
  // (EXPENSE) vuelve a generar deuda, no la reduce.
  const payments = await fetchInChunks<any>(operationIds, (chunk) =>
    (supabase.from("payments") as any)
      .select("operation_id, amount, amount_usd, currency, exchange_rate, status, direction")
      .in("operation_id", chunk)
      .eq("org_id", orgId)
      .eq("payer_type", "CUSTOMER")
  )

  const paymentsByOperation = new Map<string, any[]>()
  for (const p of payments) {
    if (p.status !== "PAID") continue
    if (p.direction !== "INCOME" && p.direction !== "EXPENSE") continue
    const list = paymentsByOperation.get(p.operation_id) ?? []
    list.push({
      amount: Number(p.amount) || 0,
      currency: p.currency || "ARS",
      exchange_rate: p.exchange_rate != null ? Number(p.exchange_rate) : null,
      amount_usd: p.amount_usd != null ? Number(p.amount_usd) : null,
      sign: p.direction === "EXPENSE" ? -1 : 1,
    })
    paymentsByOperation.set(p.operation_id, list)
  }

  // Tipo de cambio solo para convertir pagos hechos en una moneda distinta a la
  // de la venta. La deuda queda SIEMPRE en la moneda de la venta.
  const opDates = operations.map((op) => op.departure_date || op.operation_date || op.created_at)
  const fxLookup = await buildExchangeRateMap(supabase, opDates)
  const latestRate =
    (await getLatestExchangeRate(supabase)) || DEFAULT_USD_ARS_FALLBACK_RATE

  // Titular del paquete, solo para mostrar el nombre.
  const customerNameByOperation = new Map<string, string>()
  const operationCustomers = await fetchInChunks<any>(operationIds, (chunk) =>
    (supabase.from("operation_customers") as any)
      .select("operation_id, role, customers:customer_id(first_name, last_name)")
      .in("operation_id", chunk)
  )
  for (const oc of operationCustomers) {
    const name = [oc.customers?.first_name, oc.customers?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim()
    if (!name) continue
    // El MAIN pisa cualquier otro; si no hay, queda el primero que aparezca.
    if (oc.role === "MAIN" || !customerNameByOperation.has(oc.operation_id)) {
      customerNameByOperation.set(oc.operation_id, name)
    }
  }

  const sellerIds = Array.from(new Set(operations.map((op) => op.seller_id).filter(Boolean)))
  const sellerNames = new Map<string, string>()
  if (sellerIds.length > 0) {
    const { data: sellers } = await (supabase.from("users") as any)
      .select("id, name")
      .in("id", sellerIds)
      .eq("org_id", orgId)
    for (const s of sellers || []) sellerNames.set(s.id, s.name || "Sin nombre")
  }

  const dueDateSource = { fromPaymentDeadline: 0, fromDepartureDate: 0, missing: 0 }
  const receivables: ReceivableRow[] = []

  for (const op of operations) {
    const saleCurrency = op.sale_currency || op.currency || "USD"
    const saleAmount =
      (Number(op.sale_amount_total) || 0) + (serviceExtras[op.id]?.saleExtra || 0)
    const opDate = op.departure_date || op.operation_date || op.created_at
    const rateForOp = fxLookup(opDate) || latestRate

    let paidInSaleCurrency = 0
    for (const p of paymentsByOperation.get(op.id) || []) {
      let converted: number
      if (p.currency === saleCurrency) {
        converted = p.amount
      } else if (saleCurrency === "ARS" && p.currency === "USD") {
        converted = p.amount * (p.exchange_rate || rateForOp)
      } else if (saleCurrency === "USD" && p.currency === "ARS") {
        converted =
          p.amount_usd != null ? p.amount_usd : p.amount / (p.exchange_rate || rateForOp)
      } else {
        converted = p.amount
      }
      paidInSaleCurrency += p.sign * converted
    }

    const debt = Math.max(0, saleAmount - paidInSaleCurrency)
    if (debt <= 0.01) continue

    // Vencimiento: el campo pensado para esto y, si está vacío, la salida del
    // viaje (criterio que ya usan el semáforo de pagos y el aging).
    let dueDate: string | null = null
    let source: DueDateSource = "missing"
    if (op.customer_payment_deadline) {
      dueDate = String(op.customer_payment_deadline).slice(0, 10)
      source = "deadline"
      dueDateSource.fromPaymentDeadline++
    } else if (op.departure_date) {
      dueDate = String(op.departure_date).slice(0, 10)
      source = "departure"
      dueDateSource.fromDepartureDate++
    } else {
      dueDateSource.missing++
    }

    receivables.push({
      operationId: op.id,
      fileCode: op.file_code || "-",
      destination: op.destination || "-",
      customerName: customerNameByOperation.get(op.id) || "Sin cliente",
      sellerName: sellerNames.get(op.seller_id || "") || "Sin vendedor",
      saleAmount,
      paid: paidInSaleCurrency,
      debt,
      currency: saleCurrency,
      dueDate,
      dueDateSource: source,
    })
  }

  return { receivables, dueDateSource, truncated }
}
