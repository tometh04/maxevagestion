/**
 * Lectura de comisiones para el Reporte de Comisiones (VIB-65).
 *
 * `commission_records` no alcanza sola: no tiene moneda ni fecha de venta, así
 * que el join con `operations` es obligatorio y además es lo que define a qué mes
 * pertenece cada comisión (`operations.operation_date`, estable, en vez de
 * `date_calculated`, que se reescribe en cada recálculo masivo).
 *
 * El embed va con `!inner` para que el filtro de fechas se aplique a la
 * operación. Eso deja afuera las comisiones de operaciones canceladas: se
 * cuentan aparte y se informan, no desaparecen en silencio.
 */

import { fetchAllRows } from "@/lib/supabase/fetch-all"

export type CommissionStatus = "PENDING" | "PAID"

export interface CommissionRecordRow {
  id: string
  operation_id: string
  seller_id: string
  agency_id: string | null
  amount: number
  amount_paid: number | null
  percentage: number | null
  status: string
  date_calculated: string
  date_paid: string | null
  operations: {
    id: string
    file_code: string | null
    destination: string | null
    operation_date: string
    departure_date: string | null
    sale_amount_total: number | null
    /** Ganancia de la operación: es la base real de la comisión. */
    margin_amount: number | null
    sale_currency: string | null
    currency: string | null
    status: string | null
    seller_id: string | null
    seller_secondary_id: string | null
    commission_split: number | null
    agency_id: string | null
  } | null
}

/**
 * Comisión del socio que refirió al cliente. Vive en `referral_commissions`,
 * tabla aparte: el referidor es una entidad externa, no un vendedor, y su
 * comisión NO es plata del vendedor ni entra en los totales del reporte.
 */
export interface ReferralInfo {
  partnerId: string
  partnerName: string
  amount: number
  status: string
}

export interface FetchCommissionRecordsParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  /** Filtra por la oficina de la operación (no por la de la comisión). */
  agencyId?: string | null
  /** Agencias visibles del usuario. Vacío = sin restricción. */
  agencyIds?: string[]
  /** Si viene seteado, solo las comisiones de ese vendedor. */
  onlySellerId?: string | null
}

export interface FetchCommissionRecordsResult {
  records: CommissionRecordRow[]
  sellerNames: Map<string, string>
  agencyNames: Map<string, string>
  /** operationId → referido de esa operación (VIB-94). */
  referralPartners: Map<string, ReferralInfo>
  /** Comisiones del período cuya operación está cancelada (excluidas). */
  cancelledRecords: number
  /** Comisiones del período saldadas administrativamente (excluidas). */
  settledRecords: number
  truncated: boolean
}

/** Tamaño de lote del `.in()` de referidos: mantiene la URL de PostgREST corta. */
const IN_CHUNK = 200

const SELECT = `
  id, operation_id, seller_id, agency_id, amount, amount_paid, percentage,
  status, date_calculated, date_paid,
  operations!inner(
    id, file_code, destination, operation_date, departure_date,
    sale_amount_total, margin_amount, sale_currency, currency, status,
    seller_id, seller_secondary_id, commission_split, agency_id
  )
`

export async function fetchCommissionRecords(
  params: FetchCommissionRecordsParams
): Promise<FetchCommissionRecordsResult> {
  const { supabase, orgId, dateFrom, dateTo, onlySellerId } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const agencyIds = params.agencyIds ?? []

  const applyFilters = (query: any) => {
    let q = query
      .eq("org_id", orgId)
      .gte("operations.operation_date", dateFrom)
      .lte("operations.operation_date", dateTo)
    if (agencyId) {
      q = q.eq("operations.agency_id", agencyId)
    } else if (agencyIds.length > 0) {
      // Un ADMIN de Rosario no debe ver las comisiones de Madero.
      q = q.in("operations.agency_id", agencyIds)
    }
    if (onlySellerId) q = q.eq("seller_id", onlySellerId)
    return q
  }

  // `order("id")` es lo que hace estable la paginación; el orden de presentación
  // lo resuelve después el agregador.
  const { rows: records, truncated } = await fetchAllRows<CommissionRecordRow>((from, to) =>
    applyFilters((supabase.from("commission_records") as any).select(SELECT))
      .neq("operations.status", "CANCELLED")
      // Saldadas en un cierre administrativo: no son deuda ni pago (VIB-94).
      .is("settled_at", null)
      .order("id", { ascending: true })
      .range(from, to)
  )

  // Comisiones descartadas por operación cancelada: se informan, no se ocultan.
  // Es un dato de contexto, no el reporte: si falla, el reporte igual sale.
  let cancelledCount = 0
  try {
    const { count } = await applyFilters(
      (supabase.from("commission_records") as any).select("id, operations!inner(id)", {
        count: "exact",
        head: true,
      })
    ).eq("operations.status", "CANCELLED")
    cancelledCount = count || 0
  } catch (error) {
    console.warn("[commissions-report] no se pudo contar comisiones canceladas:", error)
  }

  // Ídem para las saldadas: el reporte dice cuántas quedaron fuera para que la
  // diferencia contra un reporte viejo del mismo período sea explicable.
  let settledCount = 0
  try {
    const { count } = await applyFilters(
      (supabase.from("commission_records") as any).select("id, operations!inner(id)", {
        count: "exact",
        head: true,
      })
    )
      .neq("operations.status", "CANCELLED")
      .not("settled_at", "is", null)
    settledCount = count || 0
  } catch (error) {
    console.warn("[commissions-report] no se pudo contar comisiones saldadas:", error)
  }

  // Se piden también los vendedores que figuran en la operación aunque no tengan
  // comisión en el recorte: con el reporte filtrado por un vendedor, el nombre
  // del socio de una venta compartida no llegaría de ninguna otra parte.
  const sellerIds = Array.from(
    new Set(
      records
        .flatMap((r) => [r.seller_id, r.operations?.seller_id, r.operations?.seller_secondary_id])
        .filter(Boolean) as string[]
    )
  )
  const sellerNames = new Map<string, string>()
  if (sellerIds.length > 0) {
    const { data: sellers } = await (supabase.from("users") as any)
      .select("id, name")
      .in("id", sellerIds)
      .eq("org_id", orgId)
    for (const s of sellers || []) sellerNames.set(s.id, s.name || "Sin nombre")
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

  // Operaciones que vinieron por un socio referidor. La comisión del referidor
  // vive en su propia tabla (`referral_commissions`, una fila por operación) y no
  // es plata del vendedor: acá solo se usa para poder marcar la fila del reporte.
  // Es contexto, igual que el conteo de canceladas: si falla, el reporte sale.
  const operationIds = Array.from(
    new Set(records.map((r) => r.operations?.id).filter(Boolean) as string[])
  )
  const referralPartners = new Map<string, ReferralInfo>()
  try {
    for (let i = 0; i < operationIds.length; i += IN_CHUNK) {
      const chunk = operationIds.slice(i, i + IN_CHUNK)
      const { data } = await (supabase.from("referral_commissions") as any)
        .select(
          "operation_id, referral_partner_id, amount, status, referral_partners:referral_partner_id(name)"
        )
        .eq("org_id", orgId)
        .in("operation_id", chunk)

      for (const row of (data || []) as any[]) {
        // El embed to-one llega como objeto, pero según la versión de PostgREST
        // puede venir envuelto en un array: se contemplan las dos formas.
        const partner = Array.isArray(row.referral_partners)
          ? row.referral_partners[0]
          : row.referral_partners
        const name = partner?.name
        if (!row.operation_id || !name) continue
        referralPartners.set(row.operation_id, {
          partnerId: row.referral_partner_id,
          partnerName: name,
          amount: Number(row.amount || 0),
          status: String(row.status || "PENDING"),
        })
      }
    }
  } catch (error) {
    console.warn("[commissions-report] no se pudieron leer los referidos:", error)
  }

  return {
    records,
    sellerNames,
    agencyNames,
    referralPartners,
    cancelledRecords: cancelledCount,
    settledRecords: settledCount,
    truncated,
  }
}
