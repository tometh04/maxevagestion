import { z } from "zod"

export const growthAssetUploadSourceSchema = z.enum([
  "upload",
  "composition",
  "logo",
])

export const growthAssetGenerationSchema = z.object({
  agencyId: z.string().uuid(),
  campaignId: z.string().uuid().nullable().default(null),
  visualDirection: z.string().trim().min(5).max(1200),
  format: z.enum(["instagram_feed", "instagram_story"]),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const growthAssetQuerySchema = z.object({
  agencyId: z.string().uuid(),
})

export const growthStudioEventSchema = z.object({
  agencyId: z.string().uuid(),
  campaignId: z.string().uuid().nullable().default(null),
  assetId: z.string().uuid().nullable().default(null),
  eventType: z.enum(["edited", "copied", "exported", "rated"]),
  payload: z.record(z.unknown()).default({}),
})

export type GrowthAssetGenerationInput = z.infer<
  typeof growthAssetGenerationSchema
>

