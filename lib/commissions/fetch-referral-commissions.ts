/**
 * Comisiones de referidores del período.
 *
 * Existe aparte de `fetchCommissionRecords` a propósito: aquel deriva los
 * referidos de las operaciones que YA tienen `commission_record`, así que una
 * venta con referidor pero sin comisión de vendedor (vendedor al 0%, sin
 * vendedor asignado, o comisión saldada) pierde su referido. Para el reporte de
 * comisiones eso es una marca de fila que falta; para el societario sería plata
 * comprometida que no aparece en "comisiones a repartir".
 *
 * `referral_commissions` sí tiene `org_id` y `currency` propios. El join con
 * `operations` va `!inner` porque el período se imputa por la fecha de venta,
 * igual que las comisiones de vendedores.
 */

import { fetchAllRows } from "@/lib/supabase/fetch-all"

export interface ReferralCommissionRow {
  id: string
  operationId: string
  partnerId: string
  amount: number
  currency: string
  status: string
  /** Fecha de venta de la operación: define el período y el TC. */
  operationDate: string
  /**
   * Oficina de la OPERACIÓN, no la de la fila de comisión. Es la misma clave
   * con la que se agrupan las ventas, así que el ratio comisión/margen por
   * oficina reconcilia.
   */
  agencyId: string | null
}

export interface FetchReferralCommissionsParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  agencyId?: string | null
  /** Agencias visibles del usuario. Vacío = sin restricción. */
  agencyIds?: string[]
}

export interface FetchReferralCommissionsResult {
  rows: ReferralCommissionRow[]
  partnerNames: Map<string, string>
  truncated: boolean
}

const SELECT = `
  id, operation_id, referral_partner_id, amount, currency, status,
  operations!inner(id, operation_date, status, agency_id)
`

export async function fetchReferralCommissions(
  params: FetchReferralCommissionsParams
): Promise<FetchReferralCommissionsResult> {
  const { supabase, orgId, dateFrom, dateTo } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const agencyIds = params.agencyIds ?? []

  const { rows: raw, truncated } = await fetchAllRows<any>((from, to) => {
    let q = (supabase.from("referral_commissions") as any)
      .select(SELECT)
      .eq("org_id", orgId)
      .neq("operations.status", "CANCELLED")
      .gte("operations.operation_date", dateFrom)
      .lte("operations.operation_date", dateTo)

    if (agencyId) q = q.eq("operations.agency_id", agencyId)
    else if (agencyIds.length > 0) q = q.in("operations.agency_id", agencyIds)

    return q.order("id", { ascending: true }).range(from, to)
  })

  const rows: ReferralCommissionRow[] = []
  for (const r of raw) {
    // El embed to-one puede llegar como objeto o envuelto en array según la
    // versión de PostgREST.
    const op = Array.isArray(r.operations) ? r.operations[0] : r.operations
    if (!op) continue
    rows.push({
      id: r.id,
      operationId: r.operation_id,
      partnerId: r.referral_partner_id,
      amount: Number(r.amount) || 0,
      currency: String(r.currency || "USD").toUpperCase(),
      status: String(r.status || "PENDING"),
      operationDate: op.operation_date,
      agencyId: op.agency_id ?? null,
    })
  }

  // Nombres de los referidores. Es contexto de presentación: si falla, el
  // reporte igual sale con los montos correctos.
  const partnerIds = Array.from(new Set(rows.map((r) => r.partnerId).filter(Boolean)))
  const partnerNames = new Map<string, string>()
  if (partnerIds.length > 0) {
    try {
      const { data } = await (supabase.from("referral_partners") as any)
        .select("id, name")
        .eq("org_id", orgId)
        .in("id", partnerIds)
      for (const p of (data || []) as any[]) partnerNames.set(p.id, p.name || "Sin nombre")
    } catch (error) {
      console.warn("[societario] no se pudieron leer los referidores:", error)
    }
  }

  return { rows, partnerNames, truncated }
}
