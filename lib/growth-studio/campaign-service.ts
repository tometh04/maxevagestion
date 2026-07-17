import type { Database, Json } from "@/lib/supabase/types"
import type { GrowthStudioApplicationContext } from "@/lib/growth-studio/application-context"
import { hasAgencyAccess } from "@/lib/growth-studio/application-context"
import {
  campaignBriefSchema,
  campaignConceptsOutputSchema,
  type CampaignBrief,
} from "@/lib/growth-studio/campaign-schema"
import {
  resolveCommercialSourceSnapshot,
  GrowthStudioSourceNotFoundError,
  GrowthStudioSourcePersistenceError,
} from "@/lib/growth-studio/source-service"

type CampaignRow = Database["public"]["Tables"]["growth_campaigns"]["Row"]
type RevisionRow = Database["public"]["Tables"]["growth_campaign_revisions"]["Row"]

const CAMPAIGN_COLUMNS =
  "id, org_id, agency_id, name, status, brief_data, source_type, source_id, source_snapshot, selected_concept_index, created_by, created_at, updated_at"

const REVISION_COLUMNS =
  "id, org_id, agency_id, campaign_id, generation_request_id, kind, version, payload, created_by, created_at"

export interface CampaignDto {
  id: string
  agencyId: string
  name: string
  status: CampaignRow["status"]
  brief: CampaignBrief
  sourceType: CampaignRow["source_type"]
  sourceId: string | null
  sourceSnapshot: Json | null
  selectedConceptIndex: number | null
  createdAt: string
  updatedAt: string
}

export interface CampaignRevisionDto {
  id: string
  kind: string
  version: number
  payload: Json
  generationRequestId: string | null
  createdAt: string
}

export interface CampaignDetailsDto extends CampaignDto {
  revisions: CampaignRevisionDto[]
}

export class GrowthStudioCampaignNotFoundError extends Error {
  constructor() {
    super("Campaña no encontrada")
    this.name = "GrowthStudioCampaignNotFoundError"
  }
}

export class GrowthStudioCampaignPersistenceError extends Error {
  constructor(message = "No se pudo guardar la campaña") {
    super(message)
    this.name = "GrowthStudioCampaignPersistenceError"
  }
}

function assertAgency(
  context: GrowthStudioApplicationContext,
  agencyId: string
): void {
  if (!hasAgencyAccess(context, agencyId)) {
    throw new GrowthStudioCampaignNotFoundError()
  }
}

function toCampaignDto(row: CampaignRow): CampaignDto {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    status: row.status,
    brief: campaignBriefSchema.parse(row.brief_data),
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceSnapshot: row.source_snapshot,
    selectedConceptIndex: row.selected_concept_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRevisionDto(row: RevisionRow): CampaignRevisionDto {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    payload: row.payload,
    generationRequestId: row.generation_request_id,
    createdAt: row.created_at,
  }
}

export async function createCampaign(
  context: GrowthStudioApplicationContext,
  input: CampaignBrief
): Promise<CampaignDto> {
  const brief = campaignBriefSchema.parse(input)
  assertAgency(context, brief.agencyId)

  const sourceSnapshot = await resolveCommercialSourceSnapshot(context, brief)
  const { data, error } = await context.supabase
    .from("growth_campaigns")
    .insert({
      org_id: context.orgId,
      agency_id: brief.agencyId,
      name: brief.name,
      status: "DRAFT",
      brief_data: brief as unknown as Json,
      source_type: brief.source.type,
      source_id: brief.source.id,
      source_snapshot: sourceSnapshot as unknown as Json,
      created_by: context.userId,
    })
    .select(CAMPAIGN_COLUMNS)
    .single()

  if (error || !data) {
    console.error("[growth-studio] Error creando campaña", {
      orgId: context.orgId,
      agencyId: brief.agencyId,
      cause: error?.message ?? "missing_row",
    })
    throw new GrowthStudioCampaignPersistenceError()
  }

  return toCampaignDto(data)
}

export async function listCampaigns(
  context: GrowthStudioApplicationContext,
  agencyId: string
): Promise<CampaignDto[]> {
  assertAgency(context, agencyId)
  const { data, error } = await context.supabase
    .from("growth_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("org_id", context.orgId)
    .eq("agency_id", agencyId)
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("[growth-studio] Error listando campañas", {
      orgId: context.orgId,
      agencyId,
      cause: error.message,
    })
    throw new GrowthStudioCampaignPersistenceError(
      "No se pudieron cargar las campañas"
    )
  }

  return (data ?? []).map(toCampaignDto)
}

export async function getCampaignDetails(
  context: GrowthStudioApplicationContext,
  agencyId: string,
  campaignId: string
): Promise<CampaignDetailsDto> {
  assertAgency(context, agencyId)
  const [campaignResult, revisionsResult] = await Promise.all([
    context.supabase
      .from("growth_campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("org_id", context.orgId)
      .eq("agency_id", agencyId)
      .eq("id", campaignId)
      .maybeSingle(),
    context.supabase
      .from("growth_campaign_revisions")
      .select(REVISION_COLUMNS)
      .eq("org_id", context.orgId)
      .eq("agency_id", agencyId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true }),
  ])

  if (campaignResult.error || revisionsResult.error) {
    console.error("[growth-studio] Error cargando campaña", {
      orgId: context.orgId,
      agencyId,
      campaignId,
      campaignCause: campaignResult.error?.message,
      revisionsCause: revisionsResult.error?.message,
    })
    throw new GrowthStudioCampaignPersistenceError(
      "No se pudo cargar la campaña"
    )
  }
  if (!campaignResult.data) throw new GrowthStudioCampaignNotFoundError()

  return {
    ...toCampaignDto(campaignResult.data),
    revisions: (revisionsResult.data ?? []).map(toRevisionDto),
  }
}

export async function getLatestCampaignRevision(
  context: GrowthStudioApplicationContext,
  agencyId: string,
  campaignId: string,
  kind: "concepts" | "channels" | "composition"
): Promise<CampaignRevisionDto | null> {
  assertAgency(context, agencyId)
  const { data, error } = await context.supabase
    .from("growth_campaign_revisions")
    .select(REVISION_COLUMNS)
    .eq("org_id", context.orgId)
    .eq("agency_id", agencyId)
    .eq("campaign_id", campaignId)
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new GrowthStudioCampaignPersistenceError(
      "No se pudo cargar el historial de la campaña"
    )
  }
  return data ? toRevisionDto(data) : null
}

export async function appendCampaignRevision(
  context: GrowthStudioApplicationContext,
  input: {
    agencyId: string
    campaignId: string
    generationRequestId?: string | null
    kind: "concepts" | "channels" | "composition"
    payload: Json
  }
): Promise<CampaignRevisionDto> {
  assertAgency(context, input.agencyId)
  const { data, error } = await context.supabase
    .from("growth_campaign_revisions")
    .insert({
      org_id: context.orgId,
      agency_id: input.agencyId,
      campaign_id: input.campaignId,
      generation_request_id: input.generationRequestId ?? null,
      kind: input.kind,
      version: 1,
      payload: input.payload,
      created_by: context.userId,
    })
    .select(REVISION_COLUMNS)
    .single()

  if (error || !data) {
    throw new GrowthStudioCampaignPersistenceError(
      "No se pudo guardar la nueva versión"
    )
  }
  return toRevisionDto(data)
}

export async function selectCampaignConcept(
  context: GrowthStudioApplicationContext,
  input: { agencyId: string; campaignId: string; conceptIndex: number }
): Promise<CampaignDto> {
  assertAgency(context, input.agencyId)
  const latest = await getLatestCampaignRevision(
    context,
    input.agencyId,
    input.campaignId,
    "concepts"
  )
  if (!latest) throw new GrowthStudioCampaignNotFoundError()

  const concepts = campaignConceptsOutputSchema.parse(latest.payload)
  if (!concepts.variants.some((variant) => variant.index === input.conceptIndex)) {
    throw new GrowthStudioCampaignNotFoundError()
  }

  const { data, error } = await context.supabase
    .from("growth_campaigns")
    .update({
      selected_concept_index: input.conceptIndex,
      status: "CONCEPT_SELECTED",
    })
    .eq("org_id", context.orgId)
    .eq("agency_id", input.agencyId)
    .eq("id", input.campaignId)
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle()

  if (error) {
    throw new GrowthStudioCampaignPersistenceError(
      "No se pudo seleccionar el concepto"
    )
  }
  if (!data) throw new GrowthStudioCampaignNotFoundError()

  const eventResult = await context.supabase.from("growth_studio_events").insert({
    org_id: context.orgId,
    agency_id: input.agencyId,
    campaign_id: input.campaignId,
    event_type: "selected",
    payload: { conceptIndex: input.conceptIndex },
    created_by: context.userId,
  })
  if (eventResult.error) {
    console.warn("[growth-studio] No se pudo registrar selección", {
      campaignId: input.campaignId,
      cause: eventResult.error.message,
    })
  }

  return toCampaignDto(data)
}

export {
  GrowthStudioSourceNotFoundError,
  GrowthStudioSourcePersistenceError,
}

