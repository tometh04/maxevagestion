import { z } from "zod"

const normalizedPosition = z.number().min(0).max(1)
const overlaySizeSchema = z.enum(["small", "medium", "large"])
const alignmentSchema = z.enum(["left", "center", "right"])
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

const textOverlaySchema = z.object({
  text: z.string().trim().max(300),
  x: normalizedPosition,
  y: normalizedPosition,
  color: colorSchema,
  size: overlaySizeSchema,
  align: alignmentSchema,
  visible: z.boolean(),
})

export const compositionSchema = z.object({
  backgroundAssetId: z.string().uuid(),
  format: z.enum(["instagram_feed", "instagram_story"]),
  overlays: z.object({
    headline: textOverlaySchema.extend({
      text: z.string().trim().max(160),
    }),
    secondary: textOverlaySchema,
    cta: textOverlaySchema.extend({
      text: z.string().trim().max(120),
    }),
  }),
  logo: z.object({
    assetId: z.string().uuid().nullable(),
    x: normalizedPosition,
    y: normalizedPosition,
    size: overlaySizeSchema,
    visible: z.boolean(),
  }),
})

export type GrowthComposition = z.infer<typeof compositionSchema>

