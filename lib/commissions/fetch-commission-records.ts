/**
 * Lectura de comisiones para el Reporte de Comisiones (VIB-65).
 *
 * `commission_records` no alcanza sola: no tiene moneda, así que el join con
 * `operations` sigue siendo obligatorio.
 *
 * El mes de cada comisión sale de `accrual_date`, una fecha propia de la fila.
 * Antes se derivaba de `operations.operation_date` a través del join, lo que
 * metía toda comisión en el mes de la venta original — correcto para la venta
 * base, pero no para un servicio vendido meses después, que se cobra en el mes
 * en que se vendió. `date_calculated` no sirve para esto: se reescribe con now()
 * en cada recálculo masivo. Para las filas de venta `accrual_date` vale
 * `operation_date`, así que los períodos ya cerrados siguen dando idéntico.
 *
 * El embed va con `!inner` para poder filtrar por el estado de la operación. Eso
 * deja afuera las comisiones de operaciones canceladas: se cuentan aparte y se
 * informan, no desaparecen en silencio.
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
  /** 'ADVISOR_MANAGER' = comisión por administrar al vendedor (VIB-102). */
  kind?: string | null
  /** Solo en ADVISOR_MANAGER: el vendedor administrado que la generó. */
  source_seller_id?: string | null
  /** Solo en SERVICE: el servicio que originó la comisión. */
  operation_service_id?: string | null
  date_calculated: string
  date_paid: string | null
  /**
   * Mes al que se imputa la comisión. Para la venta base es
   * `operations.operation_date`; para un servicio, la fecha en que se vendió.
   * Opcional en el tipo para no obligar a las fixtures de tests a declararlo:
   * quien lo consume cae a `operations.operation_date`.
   */
  accrual_date?: string | null
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
  /** operationId → pasajero principal, para identificar la fila en pantalla. */
  mainPassengers: Map<string, string>
  /** Comisiones del período cuya operación está cancelada (excluidas). */
  cancelledRecords: number
  /** Comisiones del período saldadas administrativamente (excluidas). */
  settledRecords: number
  truncated: boolean
}

/** Tamaño de lote del `.in()` de referidos: mantiene la URL de PostgREST corta. */
const IN_CHUNK = 200

const SELECT = `
  id, operation_id, operation_service_id, seller_id, agency_id, amount, amount_paid, percentage,
  status, kind, source_seller_id, date_calculated, date_paid, accrual_date,
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
      .gte("accrual_date", dateFrom)
      .lte("accrual_date", dateTo)
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
  // `source_seller_id` entra acá porque la comisión de un administrador se
  // explica nombrando al vendedor administrado, y ese vendedor puede no tener
  // ninguna fila propia en el recorte (comisión saldada, 0%, o el reporte
  // filtrado por el administrador).
  const sellerIds = Array.from(
    new Set(
      records
        .flatMap((r) => [
          r.seller_id,
          r.source_seller_id,
          r.operations?.seller_id,
          r.operations?.seller_secondary_id,
        ])
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

  // Pasajero principal de cada operación: es cómo el vendedor reconoce su
  // comisión (pedido de Lozada). Contexto de presentación: si falla, el reporte
  // sale igual y la fila cae al código de operación.
  const mainPassengers = new Map<string, string>()
  try {
    for (let i = 0; i < operationIds.length; i += IN_CHUNK) {
      const chunk = operationIds.slice(i, i + IN_CHUNK)
      const { data } = await (supabase.from("operation_customers") as any)
        .select("operation_id, customers:customer_id(first_name, last_name)")
        .eq("org_id", orgId)
        .eq("role", "MAIN")
        .in("operation_id", chunk)

      for (const row of (data || []) as any[]) {
        // El embed to-one puede llegar como objeto o envuelto en array según la
        // versión de PostgREST, igual que en los referidos.
        const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
        if (!row.operation_id || !customer || mainPassengers.has(row.operation_id)) continue
        const name = `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
        if (name) mainPassengers.set(row.operation_id, name)
      }
    }
  } catch (error) {
    console.warn("[commissions-report] no se pudo leer el pasajero principal:", error)
  }

  return {
    records,
    sellerNames,
    agencyNames,
    referralPartners,
    mainPassengers,
    cancelledRecords: cancelledCount,
    settledRecords: settledCount,
    truncated,
  }
}
