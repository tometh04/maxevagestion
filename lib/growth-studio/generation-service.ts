import type { Json } from "@/lib/supabase/types"
import type { GrowthStudioApplicationContext } from "@/lib/growth-studio/application-context"
import { getBrandProfile } from "@/lib/growth-studio/brand-profile-service"
import {
  appendCampaignRevision,
  getCampaignDetails,
  getLatestCampaignRevision,
  type CampaignRevisionDto,
} from "@/lib/growth-studio/campaign-service"
import {
  campaignConceptsOutputSchema,
  channelAdaptationsSchema,
  validateAdaptationsForBrief,
  type CampaignConceptsOutput,
  type ChannelAdaptations,
} from "@/lib/growth-studio/campaign-schema"
import {
  findConcept,
  GROWTH_STUDIO_CHANNELS_PROMPT_VERSION,
  GROWTH_STUDIO_CONCEPTS_PROMPT_VERSION,
  type GrowthStudioAiProvider,
  GrowthStudioAiProviderError,
} from "@/lib/growth-studio/ai-provider"

export class GrowthStudioQuotaExceededError extends Error {
  constructor() {
    super("La agencia alcanzó el límite de generación de las últimas 24 horas")
    this.name = "GrowthStudioQuotaExceededError"
  }
}

export class GrowthStudioGenerationInProgressError extends Error {
  constructor() {
    super("Ya hay una generación en curso")
    this.name = "GrowthStudioGenerationInProgressError"
  }
}

export class GrowthStudioGenerationError extends Error {
  constructor(message = "No se pudo generar el contenido") {
    super(message)
    this.name = "GrowthStudioGenerationError"
  }
}

export interface GrowthStudioGenerationReservation {
  requestId: string
  remaining: number
  isExisting: boolean
}

export interface CampaignGenerationResult<T> {
  requestId: string
  remaining: number
  output: T
  revision: CampaignRevisionDto | null
}

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

function mapReservationError(message: string): Error {
  if (message.includes("growth_studio_quota_exceeded")) {
    return new GrowthStudioQuotaExceededError()
  }
  if (message.includes("growth_studio_image_in_progress")) {
    return new GrowthStudioGenerationInProgressError()
  }
  return new GrowthStudioGenerationError(
    "No se pudo reservar la generación"
  )
}

export async function reserveGrowthStudioGeneration(
  context: GrowthStudioApplicationContext,
  input: {
    agencyId: string
    campaignId: string | null
    kind: "concepts" | "channels" | "image"
    promptVersion: string
    model: string
    inputSnapshot: Json
    idempotencyKey: string
    quality?: "low" | "medium" | "high" | null
  }
): Promise<GrowthStudioGenerationReservation> {
  const { data, error } = await context.supabase.rpc(
    "reserve_growth_studio_generation",
    {
      p_org_id: context.orgId,
      p_agency_id: input.agencyId,
      // `supabase gen types` tipa los parámetros de las funciones como no
      // nullables: Postgres no declara la nullability de un argumento. La
      // función SÍ contempla NULL en los dos (ver
      // 20260716000003_growth_studio_campaigns_assets.sql: `IF p_campaign_id
      // IS NOT NULL` / `IF p_quality IS NOT NULL`), así que el cast solo
      // corrige la imprecisión del tipo generado.
      p_campaign_id: input.campaignId as string,
      p_kind: input.kind,
      p_prompt_version: input.promptVersion,
      p_model: input.model,
      p_quality: (input.quality ?? null) as string,
      p_input_snapshot: input.inputSnapshot,
      p_idempotency_key: input.idempotencyKey,
      p_created_by: context.userId,
    }
  )

  if (error || !data?.[0]) {
    throw mapReservationError(error?.message ?? "missing_reservation")
  }
  return {
    requestId: data[0].request_id,
    remaining: data[0].remaining,
    isExisting: data[0].is_existing,
  }
}

async function loadExistingOutput<T>(
  context: GrowthStudioApplicationContext,
  input: {
    agencyId: string
    requestId: string
    schema: { parse(value: unknown): T }
    campaignId: string
    revisionKind: "concepts" | "channels"
  }
): Promise<CampaignGenerationResult<T>> {
  const { data, error } = await context.supabase
    .from("growth_generation_requests")
    .select("id, status, output_snapshot")
    .eq("org_id", context.orgId)
    .eq("agency_id", input.agencyId)
    .eq("id", input.requestId)
    .maybeSingle()

  if (error || !data) throw new GrowthStudioGenerationError()
  if (data.status === "pending") {
    throw new GrowthStudioGenerationInProgressError()
  }
  if (data.status !== "completed" || !data.output_snapshot) {
    throw new GrowthStudioGenerationError(
      "La generación anterior falló; volvé a intentarlo"
    )
  }

  const revision = await getLatestCampaignRevision(
    context,
    input.agencyId,
    input.campaignId,
    input.revisionKind
  )
  return {
    requestId: data.id,
    remaining: 0,
    output: input.schema.parse(data.output_snapshot),
    revision,
  }
}

export async function completeGrowthStudioGeneration(
  context: GrowthStudioApplicationContext,
  input: {
    agencyId: string
    requestId: string
    output: Json
    usage: Json | null
  }
): Promise<void> {
  const { error } = await context.supabase.rpc(
    "finish_growth_studio_generation",
    {
      p_org_id: context.orgId,
      p_agency_id: input.agencyId,
      p_request_id: input.requestId,
      p_status: "completed",
      p_output_snapshot: input.output,
      p_usage_data: input.usage,
      // Idem: el generado no expresa que el parámetro acepta NULL.
      p_error_code: null as unknown as string,
      p_created_by: context.userId,
    }
  )

  if (error) throw new GrowthStudioGenerationError()
}

export async function failGrowthStudioGeneration(
  context: GrowthStudioApplicationContext,
  agencyId: string,
  requestId: string,
  errorCode: string
): Promise<void> {
  const result = await context.supabase.rpc(
    "finish_growth_studio_generation",
    {
      p_org_id: context.orgId,
      p_agency_id: agencyId,
      p_request_id: requestId,
      p_status: "failed",
      p_output_snapshot: null,
      p_usage_data: null,
      p_error_code: errorCode,
      p_created_by: context.userId,
    }
  )

  if (result.error) {
    console.warn("[growth-studio] No se pudo cerrar la generación fallida", {
      requestId,
      cause: result.error.message,
    })
  }
}

async function updateCampaignStatus(
  context: GrowthStudioApplicationContext,
  agencyId: string,
  campaignId: string,
  status: "CONCEPTS_READY" | "CHANNELS_READY"
): Promise<void> {
  const changes =
    status === "CONCEPTS_READY"
      ? { status, selected_concept_index: null }
      : { status }
  const { error } = await context.supabase
    .from("growth_campaigns")
    .update(changes)
    .eq("org_id", context.orgId)
    .eq("agency_id", agencyId)
    .eq("id", campaignId)
  if (error) throw new GrowthStudioGenerationError()
}

async function recordGeneratedEvent(
  context: GrowthStudioApplicationContext,
  agencyId: string,
  campaignId: string,
  kind: "concepts" | "channels"
): Promise<void> {
  const result = await context.supabase.from("growth_studio_events").insert({
    org_id: context.orgId,
    agency_id: agencyId,
    campaign_id: campaignId,
    event_type: "generated",
    payload: { kind },
    created_by: context.userId,
  })
  if (result.error) {
    console.warn("[growth-studio] No se pudo registrar la métrica", {
      campaignId,
      kind,
      cause: result.error.message,
    })
  }
}

function buildBrandSnapshot(
  agencyName: string,
  profile: Awaited<ReturnType<typeof getBrandProfile>>
): Json {
  if (!profile) {
    return {
      brandName: agencyName,
      profileConfigured: false,
      locale: { language: "es", country: "AR" },
    }
  }
  return json({
    brandName: profile.brandName,
    profileConfigured: true,
    identity: profile.data.identity,
    audience: profile.data.audience,
    voice: profile.data.voice,
    offer: profile.data.offer,
    visual: {
      primaryColor: profile.data.visual.primaryColor,
      secondaryColor: profile.data.visual.secondaryColor,
      styleNotes: profile.data.visual.styleNotes,
    },
    conversion: profile.data.conversion,
    locale: profile.data.locale,
  })
}

export async function generateCampaignConcepts(
  context: GrowthStudioApplicationContext,
  input: {
    agencyId: string
    campaignId: string
    idempotencyKey: string
  },
  provider: GrowthStudioAiProvider
): Promise<CampaignGenerationResult<CampaignConceptsOutput>> {
  const campaign = await getCampaignDetails(
    context,
    input.agencyId,
    input.campaignId
  )
  const profile = await getBrandProfile(context, input.agencyId)
  const agencyName =
    context.access.agencies.find((agency) => agency.id === input.agencyId)?.name ??
    campaign.name
  const inputSnapshot = json({
    brand: buildBrandSnapshot(agencyName, profile),
    campaign: {
      brief: campaign.brief,
      commercialSource: campaign.sourceSnapshot,
    },
    requestedVariants: 3,
  })
  const reservation = await reserveGrowthStudioGeneration(context, {
    ...input,
    kind: "concepts",
    promptVersion: GROWTH_STUDIO_CONCEPTS_PROMPT_VERSION,
    model: provider.textModel,
    inputSnapshot,
  })

  if (reservation.isExisting) {
    const existing = await loadExistingOutput(context, {
      agencyId: input.agencyId,
      campaignId: input.campaignId,
      requestId: reservation.requestId,
      revisionKind: "concepts",
      schema: campaignConceptsOutputSchema,
    })
    await updateCampaignStatus(
      context,
      input.agencyId,
      input.campaignId,
      "CONCEPTS_READY"
    )
    return existing
  }

  try {
    const generated = await provider.generateConcepts(inputSnapshot)
    const output = campaignConceptsOutputSchema.parse(generated.output)
    const revision = await appendCampaignRevision(context, {
      agencyId: input.agencyId,
      campaignId: input.campaignId,
      generationRequestId: reservation.requestId,
      kind: "concepts",
      payload: json(output),
    })
    await completeGrowthStudioGeneration(context, {
      agencyId: input.agencyId,
      requestId: reservation.requestId,
      output: json(output),
      usage: generated.usage,
    })
    await updateCampaignStatus(
      context,
      input.agencyId,
      input.campaignId,
      "CONCEPTS_READY"
    )
    await recordGeneratedEvent(
      context,
      input.agencyId,
      input.campaignId,
      "concepts"
    )
    return {
      requestId: reservation.requestId,
      remaining: reservation.remaining,
      output,
      revision,
    }
  } catch (error) {
    await failGrowthStudioGeneration(
      context,
      input.agencyId,
      reservation.requestId,
      error instanceof GrowthStudioAiProviderError
        ? "provider_failed"
        : "generation_failed"
    )
    if (error instanceof GrowthStudioGenerationError) throw error
    if (error instanceof GrowthStudioAiProviderError) {
      throw new GrowthStudioGenerationError(error.message)
    }
    throw new GrowthStudioGenerationError()
  }
}

export async function generateCampaignChannels(
  context: GrowthStudioApplicationContext,
  input: {
    agencyId: string
    campaignId: string
    idempotencyKey: string
  },
  provider: GrowthStudioAiProvider
): Promise<CampaignGenerationResult<ChannelAdaptations>> {
  const campaign = await getCampaignDetails(
    context,
    input.agencyId,
    input.campaignId
  )
  if (!campaign.selectedConceptIndex) {
    throw new GrowthStudioGenerationError("Elegí un concepto antes de continuar")
  }
  const conceptsRevision = [...campaign.revisions]
    .filter((revision) => revision.kind === "concepts")
    .sort((a, b) => b.version - a.version)[0]
  if (!conceptsRevision) {
    throw new GrowthStudioGenerationError("Generá los conceptos antes de continuar")
  }
  const concepts = campaignConceptsOutputSchema.parse(conceptsRevision.payload)
  const concept = findConcept(concepts, campaign.selectedConceptIndex)
  if (!concept) throw new GrowthStudioGenerationError()

  const profile = await getBrandProfile(context, input.agencyId)
  const agencyName =
    context.access.agencies.find((agency) => agency.id === input.agencyId)?.name ??
    campaign.name
  const inputSnapshot = json({
    brand: buildBrandSnapshot(agencyName, profile),
    campaign: {
      brief: campaign.brief,
      commercialSource: campaign.sourceSnapshot,
    },
    selectedConcept: concept,
    requestedChannels: campaign.brief.channels,
    storyConfiguration: campaign.brief.story,
  })
  const reservation = await reserveGrowthStudioGeneration(context, {
    ...input,
    kind: "channels",
    promptVersion: GROWTH_STUDIO_CHANNELS_PROMPT_VERSION,
    model: provider.textModel,
    inputSnapshot,
  })

  if (reservation.isExisting) {
    const existing = await loadExistingOutput(context, {
      agencyId: input.agencyId,
      campaignId: input.campaignId,
      requestId: reservation.requestId,
      revisionKind: "channels",
      schema: channelAdaptationsSchema,
    })
    await updateCampaignStatus(
      context,
      input.agencyId,
      input.campaignId,
      "CHANNELS_READY"
    )
    return existing
  }

  try {
    const generated = await provider.generateChannels(inputSnapshot)
    const output = channelAdaptationsSchema.parse(generated.output)
    const validation = validateAdaptationsForBrief(campaign.brief, output)
    if (!validation.success) {
      throw new GrowthStudioGenerationError(
        "La adaptación generada no respetó los canales solicitados"
      )
    }
    const revision = await appendCampaignRevision(context, {
      agencyId: input.agencyId,
      campaignId: input.campaignId,
      generationRequestId: reservation.requestId,
      kind: "channels",
      payload: json(output),
    })
    await completeGrowthStudioGeneration(context, {
      agencyId: input.agencyId,
      requestId: reservation.requestId,
      output: json(output),
      usage: generated.usage,
    })
    await updateCampaignStatus(
      context,
      input.agencyId,
      input.campaignId,
      "CHANNELS_READY"
    )
    await recordGeneratedEvent(
      context,
      input.agencyId,
      input.campaignId,
      "channels"
    )
    return {
      requestId: reservation.requestId,
      remaining: reservation.remaining,
      output,
      revision,
    }
  } catch (error) {
    await failGrowthStudioGeneration(
      context,
      input.agencyId,
      reservation.requestId,
      error instanceof GrowthStudioAiProviderError
        ? "provider_failed"
        : "generation_failed"
    )
    if (error instanceof GrowthStudioGenerationError) throw error
    if (error instanceof GrowthStudioAiProviderError) {
      throw new GrowthStudioGenerationError(error.message)
    }
    throw new GrowthStudioGenerationError()
  }
}
