import type { SupabaseClient } from "@supabase/supabase-js"
import type { Json, Database } from "@/lib/supabase/types"
import type { GrowthStudioAccessResult } from "@/lib/growth-studio/access"
import { canAccessGrowthStudioAgency } from "@/lib/growth-studio/access-rules"
import {
  brandProfileDataV1Schema,
  type BrandProfileInput,
} from "@/lib/growth-studio/brand-profile-schema"
import { calculateBrandProfileCompletion } from "@/lib/growth-studio/brand-profile"

type BrandProfileRow = Database["public"]["Tables"]["growth_brand_profiles"]["Row"]

export interface BrandProfileServiceContext {
  supabase: SupabaseClient<Database>
  userId: string
  orgId: string
  access: Extract<GrowthStudioAccessResult, { allowed: true }>
}

export interface BrandProfileDto {
  id: string
  agencyId: string
  brandName: string
  data: ReturnType<typeof brandProfileDataV1Schema.parse>
  schemaVersion: number
  completion: ReturnType<typeof calculateBrandProfileCompletion>
  createdAt: string
  updatedAt: string
}

export class GrowthStudioAgencyNotFoundError extends Error {
  constructor() {
    super("Agencia no encontrada")
    this.name = "GrowthStudioAgencyNotFoundError"
  }
}

export class GrowthStudioPersistenceError extends Error {
  constructor(message = "No se pudo guardar el perfil de marca") {
    super(message)
    this.name = "GrowthStudioPersistenceError"
  }
}

function assertAgencyAccess(
  context: BrandProfileServiceContext,
  agencyId: string
): void {
  if (
    context.access.organization.id !== context.orgId ||
    !canAccessGrowthStudioAgency(context.access, agencyId)
  ) {
    throw new GrowthStudioAgencyNotFoundError()
  }
}

function toDto(row: BrandProfileRow): BrandProfileDto {
  const data = brandProfileDataV1Schema.parse(row.profile_data)
  return {
    id: row.id,
    agencyId: row.agency_id,
    brandName: row.brand_name,
    data,
    schemaVersion: row.schema_version,
    completion: calculateBrandProfileCompletion({
      brandName: row.brand_name,
      data,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const PROFILE_COLUMNS =
  "id, org_id, agency_id, brand_name, profile_data, schema_version, created_by, updated_by, created_at, updated_at"

export async function getBrandProfile(
  context: BrandProfileServiceContext,
  agencyId: string
): Promise<BrandProfileDto | null> {
  assertAgencyAccess(context, agencyId)

  const { data, error } = await context.supabase
    .from("growth_brand_profiles")
    .select(PROFILE_COLUMNS)
    .eq("org_id", context.orgId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (error) {
    console.error("[growth-studio] Error leyendo el perfil", {
      orgId: context.orgId,
      agencyId,
      cause: error.message,
    })
    throw new GrowthStudioPersistenceError("No se pudo cargar el perfil de marca")
  }

  return data ? toDto(data) : null
}

export async function saveBrandProfile(
  context: BrandProfileServiceContext,
  input: BrandProfileInput
): Promise<BrandProfileDto> {
  assertAgencyAccess(context, input.agencyId)

  const { data, error } = await context.supabase
    .from("growth_brand_profiles")
    .upsert(
      {
        org_id: context.orgId,
        agency_id: input.agencyId,
        brand_name: input.brandName,
        profile_data: input.data as unknown as Json,
        schema_version: 1,
        created_by: context.userId,
        updated_by: context.userId,
      },
      { onConflict: "org_id,agency_id" }
    )
    .select(PROFILE_COLUMNS)
    .single()

  if (error || !data) {
    console.error("[growth-studio] Error guardando el perfil", {
      orgId: context.orgId,
      agencyId: input.agencyId,
      cause: error?.message ?? "missing_row",
    })
    throw new GrowthStudioPersistenceError()
  }

  return toDto(data)
}
