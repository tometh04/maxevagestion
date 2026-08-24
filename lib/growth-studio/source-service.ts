import "server-only"

import type { GrowthStudioApplicationContext } from "@/lib/growth-studio/application-context"
import { hasAgencyAccess } from "@/lib/growth-studio/application-context"
import { createAdminClient } from "@/lib/supabase/server"
import type { CampaignBrief } from "@/lib/growth-studio/campaign-schema"
import {
  operationToCommercialSnapshot,
  quotationToCommercialSnapshot,
  type GrowthCommercialSnapshot,
} from "@/lib/growth-studio/source-snapshot"
import {
  agencyPermissionMode,
  applyAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"

const OPERATION_SOURCE_COLUMNS =
  "id, destination, origin, departure_date, return_date, checkin_date, checkout_date, product_type, hotel_name, airline_name, adults, children, infants, sale_amount_total, sale_currency, currency" as const

const QUOTATION_SOURCE_COLUMNS =
  "id, destination, origin, departure_date, return_date, region, package_description, adults, children, infants, total_amount, currency, valid_until" as const

export class GrowthStudioSourceNotFoundError extends Error {
  constructor() {
    super("La operación o cotización ya no está disponible")
    this.name = "GrowthStudioSourceNotFoundError"
  }
}

export class GrowthStudioSourcePersistenceError extends Error {
  constructor() {
    super("No se pudo cargar la fuente comercial")
    this.name = "GrowthStudioSourcePersistenceError"
  }
}

export interface GrowthStudioSourceOption {
  id: string
  kind: "operation" | "quotation"
  reference: string
  destination: string
  departureDate: string
  returnDate: string | null
  status: string
}

export async function listCommercialSources(
  context: GrowthStudioApplicationContext,
  agencyId: string
): Promise<GrowthStudioSourceOption[]> {
  if (!hasAgencyAccess(context, agencyId)) {
    throw new GrowthStudioSourceNotFoundError()
  }
  const operationAllowed = Boolean(
    context.operationSourceScope
    && agencyPermissionMode(context.operationSourceScope, agencyId)
  )
  const quotationAllowed = Boolean(
    context.quotationSourceScope
    && agencyPermissionMode(context.quotationSourceScope, agencyId)
  )
  if (!operationAllowed && !quotationAllowed) throw new GrowthStudioSourceNotFoundError()

  const operationsPromise = operationAllowed
    ? applyAgencyPermissionScope(
        context.supabase
          .from("operations")
          .select("id, file_code, destination, departure_date, return_date, status")
          .eq("org_id", context.orgId)
          .eq("agency_id", agencyId)
          .neq("status", "CANCELLED")
          .order("updated_at", { ascending: false })
          .limit(100),
        context.operationSourceScope!
      )
    : Promise.resolve({ data: [], error: null })

  // quotations/options/items no tienen acceso directo para authenticated. El
  // entitlement y la agencia ya se validaron y el scope se repite en admin.
  const quotationsPromise = quotationAllowed
    ? applyAgencyPermissionScope(
        createAdminClient()
          .from("quotations")
          .select("id, quotation_number, destination, departure_date, return_date, status")
          .eq("org_id", context.orgId)
          .eq("agency_id", agencyId)
          .not("status", "in", "(REJECTED,EXPIRED)")
          .order("updated_at", { ascending: false })
          .limit(100),
        context.quotationSourceScope!
      )
    : Promise.resolve({ data: [], error: null })

  const [operationsResult, quotationsResult]: any[] = await Promise.all([
    operationsPromise,
    quotationsPromise,
  ])

  if (operationsResult.error || quotationsResult.error) {
    console.error("[growth-studio] Error listando fuentes comerciales", {
      orgId: context.orgId,
      agencyId,
      operationsCause: operationsResult.error?.message,
      quotationsCause: quotationsResult.error?.message,
    })
    throw new GrowthStudioSourcePersistenceError()
  }

  return [
    ...(operationsResult.data ?? []).map((row: any) => ({
      id: row.id,
      kind: "operation" as const,
      reference: row.file_code || "Operación",
      destination: row.destination,
      departureDate: row.departure_date,
      returnDate: row.return_date,
      status: row.status,
    })),
    ...(quotationsResult.data ?? []).map((row: any) => ({
      id: row.id,
      kind: "quotation" as const,
      reference: row.quotation_number,
      destination: row.destination,
      departureDate: row.departure_date,
      returnDate: row.return_date,
      status: row.status,
    })),
  ]
}

export async function resolveCommercialSourceSnapshot(
  context: GrowthStudioApplicationContext,
  brief: CampaignBrief
): Promise<GrowthCommercialSnapshot> {
  if (brief.source.type === "manual") return null
  if (!hasAgencyAccess(context, brief.agencyId)) {
    throw new GrowthStudioSourceNotFoundError()
  }

  if (brief.source.type === "operation") {
    if (
      !context.operationSourceScope
      || !agencyPermissionMode(context.operationSourceScope, brief.agencyId)
    ) {
      throw new GrowthStudioSourceNotFoundError()
    }
    let operationQuery = context.supabase
      .from("operations")
      .select(OPERATION_SOURCE_COLUMNS)
      .eq("org_id", context.orgId)
      .eq("agency_id", brief.agencyId)
      .eq("id", brief.source.id)
      .neq("status", "CANCELLED")
    operationQuery = applyAgencyPermissionScope(operationQuery, context.operationSourceScope)
    const { data, error } = await operationQuery.maybeSingle()

    if (error) {
      console.error("[growth-studio] Error leyendo operación comercial", {
        orgId: context.orgId,
        agencyId: brief.agencyId,
        sourceId: brief.source.id,
        cause: error.message,
      })
      throw new GrowthStudioSourcePersistenceError()
    }
    if (!data) throw new GrowthStudioSourceNotFoundError()
    return operationToCommercialSnapshot({ ...data }, brief.includePrice)
  }

  if (
    !context.quotationSourceScope
    || !agencyPermissionMode(context.quotationSourceScope, brief.agencyId)
  ) {
    throw new GrowthStudioSourceNotFoundError()
  }
  let quotationQuery = createAdminClient()
    .from("quotations")
    .select(QUOTATION_SOURCE_COLUMNS)
    .eq("org_id", context.orgId)
    .eq("agency_id", brief.agencyId)
    .eq("id", brief.source.id)
    .not("status", "in", "(REJECTED,EXPIRED)")
  quotationQuery = applyAgencyPermissionScope(quotationQuery, context.quotationSourceScope)
  const { data, error } = await quotationQuery.maybeSingle()

  if (error) {
    console.error("[growth-studio] Error leyendo cotización comercial", {
      orgId: context.orgId,
      agencyId: brief.agencyId,
      sourceId: brief.source.id,
      cause: error.message,
    })
    throw new GrowthStudioSourcePersistenceError()
  }
  if (!data) throw new GrowthStudioSourceNotFoundError()
  return quotationToCommercialSnapshot({ ...data }, brief.includePrice)
}
