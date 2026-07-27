/**
 * Lectura de ventas para el Reporte de Ventas por producto (VIB-66).
 *
 * Trae las operaciones del período junto con sus ítems (`operation_operators`),
 * que son los que dicen QUÉ se vendió: vuelo, hotel, paquete, asistencia, o un
 * tipo propio de la organización.
 *
 * Ojo con `operation_operators.sale_amount`: existe en la base y la usa el PDF
 * de liquidación, pero NO está en `lib/supabase/types.ts` (se agregó fuera de
 * las migraciones versionadas). Por eso el select va casteado. Si algún día
 * desaparece, el prorrateo lo detecta y cae al costo como peso, además de
 * loguear un warning desde el agregador.
 */

import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL } from "@/lib/feature-flags"
import { getServiceExtrasByOperation } from "@/lib/accounting/operation-services-debt"
import { fetchAllRows, fetchInChunks } from "@/lib/supabase/fetch-all"

export interface SalesOperationRow {
  id: string
  file_code: string | null
  destination: string | null
  operation_date: string
  departure_date: string | null
  sale_amount_total: number | null
  operator_cost: number | null
  margin_amount: number | null
  sale_currency: string | null
  currency: string | null
  status: string | null
  type: string | null
  product_type: string | null
  seller_id: string | null
  seller_secondary_id: string | null
  agency_id: string | null
}

export interface SalesOperationItemRow {
  id: string
  operation_id: string
  product_type: string | null
  cost: number | null
  cost_currency: string | null
  /** Puede venir undefined si la columna no está disponible. */
  sale_amount?: number | null
}

export interface FetchSalesOperationsParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  agencyId?: string | null
  agencyIds?: string[]
  /** Restringe a las operaciones de ese vendedor (`reports.ownDataOnly`). */
  ownDataOnlyUserId?: string | null
}

export interface FetchSalesOperationsResult {
  operations: SalesOperationRow[]
  itemsByOperation: Map<string, SalesOperationItemRow[]>
  serviceExtras: Record<string, { saleExtra: number; costExtra: number }>
  includeServices: boolean
  sellerNames: Map<string, string>
  agencyNames: Map<string, string>
  truncated: boolean
}

const OPERATION_SELECT = `
  id, file_code, destination, operation_date, departure_date,
  sale_amount_total, operator_cost, margin_amount,
  sale_currency, currency, status, type, product_type,
  seller_id, seller_secondary_id, agency_id
`

export async function fetchSalesOperations(
  params: FetchSalesOperationsParams
): Promise<FetchSalesOperationsResult> {
  const { supabase, orgId, dateFrom, dateTo, ownDataOnlyUserId } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const agencyIds = params.agencyIds ?? []

  // Criterio de "venta válida", igual que /api/reports/sales y margins:
  // todo lo que no esté cancelado, imputado por fecha de venta.
  const { rows: operations, truncated } = await fetchAllRows<SalesOperationRow>((from, to) => {
    let q = (supabase.from("operations") as any)
      .select(OPERATION_SELECT)
      .eq("org_id", orgId)
      .neq("status", "CANCELLED")
      .gte("operation_date", dateFrom)
      .lte("operation_date", dateTo)

    if (agencyId) q = q.eq("agency_id", agencyId)
    else if (agencyIds.length > 0) q = q.in("agency_id", agencyIds)
    if (ownDataOnlyUserId) q = q.eq("seller_id", ownDataOnlyUserId)

    return q.order("id", { ascending: true }).range(from, to)
  })

  const operationIds = operations.map((op) => op.id)

  // Ítems de la operación: `sale_amount` no está tipada, de ahí el cast.
  const items =
    operationIds.length > 0
      ? await fetchInChunks<SalesOperationItemRow>(operationIds, (chunk) =>
          (supabase.from("operation_operators") as any)
            .select("id, operation_id, product_type, cost, cost_currency, sale_amount")
            .in("operation_id", chunk)
        )
      : []

  const itemsByOperation = new Map<string, SalesOperationItemRow[]>()
  for (const item of items) {
    const list = itemsByOperation.get(item.operation_id) ?? []
    list.push(item)
    itemsByOperation.set(item.operation_id, list)
  }

  // Servicios adicionales: solo si la org tiene la flag prendida, igual que
  // /api/reports/margins. Si no, no existen para este reporte.
  const includeServices = !!(await getOrgFeatureFlag(
    supabase,
    orgId,
    FEATURE_FLAG_INCLUDE_SERVICES_IN_SALE_TOTAL
  ))
  const serviceExtras =
    includeServices && operations.length > 0
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

  const sellerIds = Array.from(
    new Set(
      operations
        .flatMap((op) => [op.seller_id, op.seller_secondary_id])
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
    new Set(operations.map((op) => op.agency_id).filter(Boolean))
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
    operations,
    itemsByOperation,
    serviceExtras,
    includeServices,
    sellerNames,
    agencyNames,
    truncated,
  }
}
