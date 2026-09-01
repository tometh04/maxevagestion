import type { QuotationQuotaUsage } from "@/lib/quotation-quota/types"
import { QuotationQuotaExhaustedError } from "@/lib/quotation-quota/types"

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown
    error: { code?: string; message?: string; details?: string } | null
  }>
}

function normalizeUsage(value: unknown): QuotationQuotaUsage {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  return {
    configured: raw.configured === true,
    period_id: typeof raw.period_id === "string" ? raw.period_id : null,
    starts_at: typeof raw.starts_at === "string" ? raw.starts_at : null,
    ends_at: typeof raw.ends_at === "string" ? raw.ends_at : null,
    included: typeof raw.included === "number" ? raw.included : null,
    extra: Number(raw.extra) || 0,
    limit: typeof raw.limit === "number" ? raw.limit : null,
    used: Number(raw.used) || 0,
    remaining: typeof raw.remaining === "number" ? raw.remaining : null,
    at_limit: raw.at_limit === true,
    enforcement_enabled: raw.enforcement_enabled === true,
    agencies: Array.isArray(raw.agencies)
      ? raw.agencies.map((agency) => {
          const row = agency as Record<string, unknown>
          return {
            agency_id: String(row.agency_id || ""),
            agency_name: String(row.agency_name || "Sin nombre"),
            used: Number(row.used) || 0,
          }
        })
      : [],
  }
}

export async function getQuotationQuotaUsage(
  client: RpcClient,
  orgId: string,
  agencyIds?: string[]
): Promise<QuotationQuotaUsage> {
  const { data, error } = await client.rpc("get_quotation_quota_usage", {
    p_org_id: orgId,
    p_agency_ids: agencyIds && agencyIds.length > 0 ? agencyIds : null,
  })
  if (error) {
    throw new Error(error.message || "No se pudo consultar el cupo de cotizaciones")
  }
  return normalizeUsage(data)
}

export async function assertQuotationCreationAvailable(
  client: RpcClient,
  orgId: string,
  agencyIds?: string[]
): Promise<QuotationQuotaUsage> {
  const usage = await getQuotationQuotaUsage(client, orgId, agencyIds)
  if (usage.enforcement_enabled && usage.at_limit) {
    throw new QuotationQuotaExhaustedError(usage)
  }
  return usage
}
