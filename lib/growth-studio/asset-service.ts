import { loadImage } from "@napi-rs/canvas"
import { z } from "zod"
import type { Database, Json } from "@/lib/supabase/types"
import type { GrowthStudioApplicationContext } from "@/lib/growth-studio/application-context"
import { hasAgencyAccess } from "@/lib/growth-studio/application-context"
import { getBrandProfile } from "@/lib/growth-studio/brand-profile-service"
import {
  GROWTH_STUDIO_IMAGE_PROMPT_VERSION,
  GrowthStudioAiTimeoutError,
  type GrowthStudioAiProvider,
} from "@/lib/growth-studio/ai-provider"
import type { GrowthAssetGenerationInput } from "@/lib/growth-studio/asset-schema"
import {
  completeGrowthStudioGeneration,
  failGrowthStudioGeneration,
  GrowthStudioGenerationError,
  GrowthStudioGenerationInProgressError,
  reserveGrowthStudioGeneration,
} from "@/lib/growth-studio/generation-service"
import {
  GrowthStudioAssetNotFoundError,
  GrowthStudioAssetPersistenceError,
  GrowthStudioAssetValidationError,
} from "@/lib/growth-studio/asset-errors"

const ASSET_BUCKET = "growth-studio-assets"
const ASSET_COLUMNS =
  "id, org_id, agency_id, campaign_id, generation_request_id, source, storage_path, original_file_name, mime_type, width, height, metadata, created_by, created_at, updated_at, archived_at"

type AssetRow = Database["public"]["Tables"]["growth_assets"]["Row"]
type AssetSource = "upload" | "generated" | "composition" | "logo"

export interface GrowthAssetDto {
  id: string
  agencyId: string
  campaignId: string | null
  generationRequestId: string | null
  source: string
  url: string
  originalFileName: string | null
  mimeType: string
  width: number | null
  height: number | null
  metadata: Json
  createdAt: string
}

export interface GrowthAssetLibraryDto {
  assets: GrowthAssetDto[]
  logoUrl: string | null
}

function assertAgency(
  context: GrowthStudioApplicationContext,
  agencyId: string
): void {
  if (!hasAgencyAccess(context, agencyId)) {
    throw new GrowthStudioAssetNotFoundError()
  }
}

export {
  GrowthStudioAssetNotFoundError,
  GrowthStudioAssetPersistenceError,
  GrowthStudioAssetValidationError,
}

function extensionFor(mimeType: string): string {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }
  const extension = extensions[mimeType]
  if (!extension) {
    throw new GrowthStudioAssetValidationError(
      "Solo se permiten imágenes PNG, JPEG o WebP"
    )
  }
  return extension
}

function toDto(row: AssetRow, signedUrl: string): GrowthAssetDto {
  return {
    id: row.id,
    agencyId: row.agency_id,
    campaignId: row.campaign_id,
    generationRequestId: row.generation_request_id,
    source: row.source,
    url: signedUrl,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    metadata: row.metadata,
    createdAt: row.created_at,
  }
}

async function signAsset(
  context: GrowthStudioApplicationContext,
  row: AssetRow
): Promise<GrowthAssetDto> {
  const { data, error } = await context.supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(row.storage_path, 60 * 60)
  if (error || !data?.signedUrl) {
    throw new GrowthStudioAssetPersistenceError(
      "No se pudo abrir la imagen privada"
    )
  }
  return toDto(row, data.signedUrl)
}

async function inspectImage(bytes: Uint8Array): Promise<{
  width: number
  height: number
}> {
  try {
    const image = await loadImage(Buffer.from(bytes))
    if (image.width < 1 || image.height < 1) throw new Error("invalid_dimensions")
    if (image.width > 3840 || image.height > 3840) {
      throw new GrowthStudioAssetValidationError(
        "La imagen no puede superar 3840 px por lado"
      )
    }
    return { width: image.width, height: image.height }
  } catch (error) {
    if (error instanceof GrowthStudioAssetValidationError) throw error
    throw new GrowthStudioAssetValidationError("El archivo no es una imagen válida")
  }
}

export async function uploadGrowthAsset(
  context: GrowthStudioApplicationContext,
  input: {
    agencyId: string
    source: AssetSource
    bytes: Uint8Array
    mimeType: string
    originalFileName?: string | null
    campaignId?: string | null
    generationRequestId?: string | null
    metadata?: Json
    dimensions?: { width: number; height: number }
  }
): Promise<GrowthAssetDto> {
  assertAgency(context, input.agencyId)
  if (input.bytes.byteLength > 10 * 1024 * 1024) {
    throw new GrowthStudioAssetValidationError(
      "La imagen no puede superar 10 MB"
    )
  }
  const extension = extensionFor(input.mimeType)
  const dimensions = input.dimensions ?? (await inspectImage(input.bytes))
  const storagePath = `${context.orgId}/${input.agencyId}/${crypto.randomUUID()}.${extension}`

  const upload = await context.supabase.storage.from(ASSET_BUCKET).upload(
    storagePath,
    Buffer.from(input.bytes),
    {
      contentType: input.mimeType,
      cacheControl: "3600",
      upsert: false,
    }
  )
  if (upload.error) {
    console.error("[growth-studio] Error subiendo asset privado", {
      orgId: context.orgId,
      agencyId: input.agencyId,
      cause: upload.error.message,
    })
    throw new GrowthStudioAssetPersistenceError()
  }

  const { data, error } = await context.supabase
    .from("growth_assets")
    .insert({
      org_id: context.orgId,
      agency_id: input.agencyId,
      campaign_id: input.campaignId ?? null,
      generation_request_id: input.generationRequestId ?? null,
      source: input.source,
      storage_path: storagePath,
      original_file_name: input.originalFileName?.slice(0, 240) ?? null,
      mime_type: input.mimeType,
      width: dimensions.width,
      height: dimensions.height,
      metadata: input.metadata ?? {},
      created_by: context.userId,
    })
    .select(ASSET_COLUMNS)
    .single()

  if (error || !data) {
    await context.supabase.storage.from(ASSET_BUCKET).remove([storagePath])
    console.error("[growth-studio] Error registrando asset privado", {
      orgId: context.orgId,
      agencyId: input.agencyId,
      cause: error?.message ?? "missing_row",
    })
    throw new GrowthStudioAssetPersistenceError()
  }

  if (input.source === "logo") {
    const archivedAt = new Date().toISOString()
    const archiveResult = await context.supabase
      .from("growth_assets")
      .update({ archived_at: archivedAt })
      .eq("org_id", context.orgId)
      .eq("agency_id", input.agencyId)
      .eq("source", "logo")
      .neq("id", data.id)
      .is("archived_at", null)
    if (archiveResult.error) {
      console.warn("[growth-studio] No se archivó el logo anterior", {
        agencyId: input.agencyId,
        cause: archiveResult.error.message,
      })
    }
  }

  return signAsset(context, data)
}

export async function listGrowthAssets(
  context: GrowthStudioApplicationContext,
  agencyId: string
): Promise<GrowthAssetLibraryDto> {
  assertAgency(context, agencyId)
  const { data, error } = await context.supabase
    .from("growth_assets")
    .select(ASSET_COLUMNS)
    .eq("org_id", context.orgId)
    .eq("agency_id", agencyId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    throw new GrowthStudioAssetPersistenceError(
      "No se pudo cargar la biblioteca"
    )
  }
  const rows = data ?? []
  const paths = rows.map((row) => row.storage_path)
  let signedByPath = new Map<string, string>()
  if (paths.length > 0) {
    const signed = await context.supabase.storage
      .from(ASSET_BUCKET)
      .createSignedUrls(paths, 60 * 60)
    if (signed.error) {
      throw new GrowthStudioAssetPersistenceError(
        "No se pudo abrir la biblioteca privada"
      )
    }
    signedByPath = new Map(
      (signed.data ?? [])
        .filter(
          (item): item is typeof item & { path: string; signedUrl: string } =>
            Boolean(item.path && item.signedUrl)
        )
        .map((item) => [item.path, item.signedUrl])
    )
  }

  const assets = rows
    .map((row) => {
      const signedUrl = signedByPath.get(row.storage_path)
      return signedUrl ? toDto(row, signedUrl) : null
    })
    .filter((asset): asset is GrowthAssetDto => asset !== null)

  const agencyLogo = assets.find((asset) => asset.source === "logo")?.url ?? null
  if (agencyLogo) return { assets, logoUrl: agencyLogo }

  const { data: orgLogo, error: orgLogoError } = await context.supabase
    .from("organization_settings")
    .select("value")
    .eq("org_id", context.orgId)
    .eq("key", "brand_logo")
    .maybeSingle()
  if (orgLogoError) {
    console.warn("[growth-studio] No se pudo cargar el logo de fallback", {
      orgId: context.orgId,
      cause: orgLogoError.message,
    })
  }

  return {
    assets,
    logoUrl:
      typeof orgLogo?.value === "string" && orgLogo.value.trim()
        ? orgLogo.value
        : null,
  }
}

async function getGrowthAsset(
  context: GrowthStudioApplicationContext,
  agencyId: string,
  assetId: string
): Promise<GrowthAssetDto> {
  assertAgency(context, agencyId)
  const { data, error } = await context.supabase
    .from("growth_assets")
    .select(ASSET_COLUMNS)
    .eq("org_id", context.orgId)
    .eq("agency_id", agencyId)
    .eq("id", assetId)
    .is("archived_at", null)
    .maybeSingle()
  if (error) throw new GrowthStudioAssetPersistenceError()
  if (!data) throw new GrowthStudioAssetNotFoundError()
  return signAsset(context, data)
}

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

const generatedAssetOutputSchema = z.object({ assetId: z.string().uuid() })

export async function generateGrowthAsset(
  context: GrowthStudioApplicationContext,
  input: GrowthAssetGenerationInput,
  provider: GrowthStudioAiProvider
): Promise<{ asset: GrowthAssetDto; remaining: number }> {
  assertAgency(context, input.agencyId)
  const profile = await getBrandProfile(context, input.agencyId)
  const brandVisualContext = json({
    brandName:
      profile?.brandName ??
      context.access.agencies.find((agency) => agency.id === input.agencyId)?.name ??
      "Agencia de viajes",
    primaryColor: profile?.data.visual.primaryColor ?? null,
    secondaryColor: profile?.data.visual.secondaryColor ?? null,
    styleNotes: profile?.data.visual.styleNotes ?? "",
  })
  const inputSnapshot = json({
    visualDirection: input.visualDirection,
    format: input.format,
    quality: input.quality,
    brandVisualContext,
    constraints: {
      noText: true,
      noLogos: true,
      noWatermarks: true,
      leaveNegativeSpace: true,
    },
  })
  const reservation = await reserveGrowthStudioGeneration(context, {
    agencyId: input.agencyId,
    campaignId: input.campaignId,
    kind: "image",
    promptVersion: GROWTH_STUDIO_IMAGE_PROMPT_VERSION,
    model: provider.imageModel,
    quality: input.quality,
    inputSnapshot,
    idempotencyKey: input.idempotencyKey,
  })

  if (reservation.isExisting) {
    const { data, error } = await context.supabase
      .from("growth_generation_requests")
      .select("status, output_snapshot")
      .eq("org_id", context.orgId)
      .eq("agency_id", input.agencyId)
      .eq("id", reservation.requestId)
      .maybeSingle()
    if (error || !data) throw new GrowthStudioGenerationError()
    if (data.status === "pending") {
      throw new GrowthStudioGenerationInProgressError()
    }
    const parsed = generatedAssetOutputSchema.safeParse(data.output_snapshot)
    if (data.status !== "completed" || !parsed.success) {
      throw new GrowthStudioGenerationError(
        "La generación anterior falló; volvé a intentarlo"
      )
    }
    return {
      asset: await getGrowthAsset(context, input.agencyId, parsed.data.assetId),
      remaining: 0,
    }
  }

  try {
    const generated = await provider.generateImage({
      visualDirection: input.visualDirection,
      format: input.format,
      quality: input.quality,
      brandVisualContext,
    })
    const asset = await uploadGrowthAsset(context, {
      agencyId: input.agencyId,
      campaignId: input.campaignId,
      generationRequestId: reservation.requestId,
      source: "generated",
      bytes: generated.bytes,
      mimeType: generated.mimeType,
      originalFileName: `imagen-${input.format}.png`,
      dimensions: { width: generated.width, height: generated.height },
      metadata: json({
        format: input.format,
        quality: input.quality,
        visualDirection: input.visualDirection,
      }),
    })
    await completeGrowthStudioGeneration(context, {
      agencyId: input.agencyId,
      requestId: reservation.requestId,
      output: { assetId: asset.id },
      usage: generated.usage,
    })
    const eventResult = await context.supabase.from("growth_studio_events").insert({
      org_id: context.orgId,
      agency_id: input.agencyId,
      campaign_id: input.campaignId,
      asset_id: asset.id,
      event_type: "generated",
      payload: { kind: "image", quality: input.quality, format: input.format },
      created_by: context.userId,
    })
    if (eventResult.error) {
      console.warn("[growth-studio] No se pudo registrar imagen generada", {
        assetId: asset.id,
        cause: eventResult.error.message,
      })
    }
    return { asset, remaining: reservation.remaining }
  } catch (error) {
    await failGrowthStudioGeneration(
      context,
      input.agencyId,
      reservation.requestId,
      error instanceof GrowthStudioAiTimeoutError
        ? "provider_timeout"
        : "image_generation_failed"
    )
    if (
      error instanceof GrowthStudioAiTimeoutError ||
      error instanceof GrowthStudioAssetValidationError ||
      error instanceof GrowthStudioAssetPersistenceError ||
      error instanceof GrowthStudioGenerationError
    ) {
      throw error
    }
    throw new GrowthStudioGenerationError("No se pudo generar la imagen")
  }
}

export async function recordGrowthStudioEvent(
  context: GrowthStudioApplicationContext,
  input: {
    agencyId: string
    campaignId: string | null
    assetId: string | null
    eventType: "edited" | "copied" | "exported" | "rated"
    payload: Record<string, unknown>
  }
): Promise<void> {
  assertAgency(context, input.agencyId)
  const { error } = await context.supabase.from("growth_studio_events").insert({
    org_id: context.orgId,
    agency_id: input.agencyId,
    campaign_id: input.campaignId,
    asset_id: input.assetId,
    event_type: input.eventType,
    payload: json(input.payload),
    created_by: context.userId,
  })
  if (error) throw new GrowthStudioAssetPersistenceError("No se pudo registrar la acción")
}
