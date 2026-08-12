/**
 * Lectura de comisiones de referidor para el Reporte de Referidores (VIB-122).
 *
 * Gemelo de `lib/commissions/fetch-commission-records.ts`, pero sobre
 * `referral_commissions` (una fila por operación, `operation_id` UNIQUE) en vez
 * de `commission_records`. La comisión del referidor ya está calculada y
 * persistida por `lib/referrals/calculate.ts`; acá solo se lee para agregar.
 *
 * El join con `operations` va con `!inner` por dos razones: fija a qué mes
 * pertenece la comisión (`operations.operation_date`, estable, en vez de
 * `date_calculated` que se reescribe en cada recálculo) y permite filtrar por la
 * oficina y el estado de la operación. Eso deja afuera las comisiones de
 * operaciones canceladas: se cuentan aparte y se informan, no desaparecen en
 * silencio (mismo criterio que el reporte de comisiones del vendedor).
 */

import { fetchAllRows } from "@/lib/supabase/fetch-all"

export interface ReferralCommissionRecordRow {
  id: string
  operation_id: string
  referral_partner_id: string
  customer_id: string | null
  agency_id: string | null
  /** Moneda en la que está denominada la comisión (mirror de la operación). */
  currency: string
  amount: number
  amount_paid: number | null
  base_amount: number | null
  basis: string | null
  percentage: number | null
  status: string
  date_calculated: string
  date_paid: string | null
  settlement_id: string | null
  referral_partners: { name: string | null } | { name: string | null }[] | null
  customers:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null
  operations: {
    id: string
    file_code: string | null
    destination: string | null
    operation_date: string
    departure_date: string | null
    sale_amount_total: number | null
    margin_amount: number | null
    sale_currency: string | null
    currency: string | null
    status: string | null
    agency_id: string | null
  } | null
}

export interface FetchReferralCommissionRecordsParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  /** Filtra por la oficina de la operación (no por la de la comisión). */
  agencyId?: string | null
  /** Agencias visibles del usuario. Vacío = sin restricción. */
  agencyIds?: string[]
  /** Si viene seteado, solo las comisiones de ese referidor. */
  partnerId?: string | null
}

export interface FetchReferralCommissionRecordsResult {
  records: ReferralCommissionRecordRow[]
  partnerNames: Map<string, string>
  agencyNames: Map<string, string>
  /** Comisiones del período cuya operación está cancelada (excluidas). */
  cancelledRecords: number
  truncated: boolean
}

const SELECT = `
  id, operation_id, referral_partner_id, customer_id, agency_id, currency,
  amount, amount_paid, base_amount, basis, percentage, status,
  date_calculated, date_paid, settlement_id,
  referral_partners:referral_partner_id(name),
  customers:customer_id(first_name, last_name),
  operations!inner(
    id, file_code, destination, operation_date, departure_date,
    sale_amount_total, margin_amount, sale_currency, currency, status, agency_id
  )
`

export async function fetchReferralCommissionRecords(
  params: FetchReferralCommissionRecordsParams
): Promise<FetchReferralCommissionRecordsResult> {
  const { supabase, orgId, dateFrom, dateTo } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const partnerId = params.partnerId && params.partnerId !== "ALL" ? params.partnerId : null
  const agencyIds = params.agencyIds ?? []

  const applyFilters = (query: any) => {
    let q = query
      .eq("org_id", orgId)
      .gte("operations.operation_date", dateFrom)
      .lte("operations.operation_date", dateTo)
    if (agencyId) {
      q = q.eq("operations.agency_id", agencyId)
    } else if (agencyIds.length > 0) {
      // Un ADMIN de Rosario no debe ver los referidos de Madero.
      q = q.in("operations.agency_id", agencyIds)
    }
    if (partnerId) q = q.eq("referral_partner_id", partnerId)
    return q
  }

  // `order("id")` es lo que hace estable la paginación; el orden de presentación
  // lo resuelve después el agregador.
  const { rows: records, truncated } = await fetchAllRows<ReferralCommissionRecordRow>(
    (from, to) =>
      applyFilters((supabase.from("referral_commissions") as any).select(SELECT))
        .neq("operations.status", "CANCELLED")
        // Comisiones anuladas: no son deuda ni pago, no entran al reporte.
        .neq("status", "CANCELLED")
        .order("id", { ascending: true })
        .range(from, to)
  )

  // Comisiones descartadas por operación cancelada: se informan, no se ocultan.
  // Es contexto, no el reporte: si falla, el reporte igual sale.
  let cancelledCount = 0
  try {
    const { count } = await applyFilters(
      (supabase.from("referral_commissions") as any).select("id, operations!inner(id)", {
        count: "exact",
        head: true,
      })
    )
      .neq("status", "CANCELLED")
      .eq("operations.status", "CANCELLED")
    cancelledCount = count || 0
  } catch (error) {
    console.warn("[referrals-report] no se pudo contar comisiones canceladas:", error)
  }

  const partnerNames = new Map<string, string>()
  for (const r of records) {
    const partner = Array.isArray(r.referral_partners)
      ? r.referral_partners[0]
      : r.referral_partners
    const name = partner?.name
    if (r.referral_partner_id && name) partnerNames.set(r.referral_partner_id, name)
  }

  const agencyIdsInUse = Array.from(
    new Set(records.map((r) => r.operations?.agency_id).filter(Boolean))
  ) as string[]
  const agencyNames = new Map<string, string>()
  if (agencyIdsInUse.length > 0) {
    const { data: agencies } = await (supabase.from("agencies") as any)
      .select("id, name")
      .in("id", agencyIdsInUse)
      .eq("org_id", orgId)
    for (const a of agencies || []) agencyNames.set(a.id, a.name || "Sin nombre")
  }

  return {
    records,
    partnerNames,
    agencyNames,
    cancelledRecords: cancelledCount,
    truncated,
  }
}

/** Nombre visible del cliente de una fila, contemplando el embed to-one. */
export function customerNameOf(record: ReferralCommissionRecordRow): string | null {
  const c = Array.isArray(record.customers) ? record.customers[0] : record.customers
  if (!c) return null
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
  return name || null
}
