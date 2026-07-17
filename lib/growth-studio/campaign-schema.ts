import { z } from "zod"

export const growthStudioChannelSchema = z.enum([
  "instagram_feed",
  "instagram_stories",
  "whatsapp",
  "email",
])

export const growthStudioContentTypeSchema = z.enum([
  "promotion",
  "inspiration",
  "destination",
  "occasion",
  "freeform",
])

export const storyConfigurationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("single"), screenCount: z.literal(1) }),
  z.object({
    mode: z.literal("sequence"),
    screenCount: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  }),
])

export const campaignSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual"), id: z.null().default(null) }),
  z.object({ type: z.literal("operation"), id: z.string().uuid() }),
  z.object({ type: z.literal("quotation"), id: z.string().uuid() }),
])

function uniqueTextList(maxItems: number, maxLength: number) {
  return z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .default([])
    .transform((items) => {
      const seen = new Set<string>()
      return items.filter((item) => {
        const key = item.toLocaleLowerCase("es")
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    })
}

const uniqueChannelsSchema = z
  .array(growthStudioChannelSchema)
  .min(1)
  .max(4)
  .transform((channels) => Array.from(new Set(channels)))

const optionalDate = z
  .union([z.string().date(), z.literal(""), z.null()])
  .transform((value) => (value ? value : null))
  .default(null)

export const campaignBriefSchema = z
  .object({
    agencyId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    objective: z.string().trim().min(5).max(600),
    contentType: growthStudioContentTypeSchema,
    source: campaignSourceSchema,
    channels: uniqueChannelsSchema,
    story: storyConfigurationSchema.default({ mode: "single", screenCount: 1 }),
    destinations: uniqueTextList(10, 120),
    travelStart: optionalDate,
    travelEnd: optionalDate,
    offerDetails: z.string().trim().max(1500).default(""),
    includePrice: z.boolean().default(false),
    freeformNotes: z.string().trim().max(2000).default(""),
  })
  .superRefine((brief, context) => {
    if (
      brief.travelStart &&
      brief.travelEnd &&
      brief.travelEnd < brief.travelStart
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["travelEnd"],
        message: "La fecha de regreso debe ser posterior a la salida",
      })
    }
  })

export const campaignConceptSchema = z.object({
  index: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string().trim().min(2).max(120),
  angle: z.string().trim().min(2).max(300),
  hook: z.string().trim().min(2).max(300),
  coreMessage: z.string().trim().min(2).max(800),
  visualDirection: z.string().trim().min(2).max(800),
  recommendedCta: z.string().trim().min(1).max(180),
})

export const campaignConceptsOutputSchema = z
  .object({ variants: z.array(campaignConceptSchema).length(3) })
  .superRefine((output, context) => {
    const indexes = output.variants.map((variant) => variant.index).sort()
    if (indexes.join(",") !== "1,2,3") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variants"],
        message: "Las variantes deben usar los índices 1, 2 y 3",
      })
    }
  })

const storyScreenSchema = z.object({
  screen: z.number().int().min(1).max(5),
  copy: z.string().trim().min(1).max(500),
  cta: z.string().trim().max(180),
  visualDirection: z.string().trim().min(1).max(800),
})

export const channelAdaptationsSchema = z.object({
  instagramFeed: z
    .object({
      caption: z.string().trim().min(1).max(2200),
      cta: z.string().trim().min(1).max(180),
      hashtags: z.array(z.string().trim().min(1).max(80)).max(30),
      visualDirection: z.string().trim().min(1).max(800),
    })
    .nullable(),
  instagramStories: z
    .object({ screens: z.array(storyScreenSchema).min(1).max(5) })
    .nullable(),
  whatsapp: z
    .object({ message: z.string().trim().min(1).max(4000) })
    .nullable(),
  email: z
    .object({
      subject: z.string().trim().min(1).max(180),
      preheader: z.string().trim().min(1).max(240),
      body: z.string().trim().min(1).max(8000),
      cta: z.string().trim().min(1).max(180),
    })
    .nullable(),
})

export interface AdaptationValidationResult {
  success: boolean
  issues: string[]
}

export function validateAdaptationsForBrief(
  brief: CampaignBrief,
  adaptations: ChannelAdaptations
): AdaptationValidationResult {
  const issues: string[] = []
  const selected = new Set(brief.channels)
  const mappings: Array<[
    GrowthStudioChannel,
    keyof ChannelAdaptations,
  ]> = [
    ["instagram_feed", "instagramFeed"],
    ["instagram_stories", "instagramStories"],
    ["whatsapp", "whatsapp"],
    ["email", "email"],
  ]

  for (const [channel, key] of mappings) {
    if (selected.has(channel) && adaptations[key] === null) {
      issues.push(`Falta la adaptación para ${channel}`)
    }
    if (!selected.has(channel) && adaptations[key] !== null) {
      issues.push(`Se recibió una adaptación no solicitada para ${channel}`)
    }
  }

  if (adaptations.instagramStories) {
    const expected = brief.story.screenCount
    if (adaptations.instagramStories.screens.length !== expected) {
      issues.push(`Stories debe contener ${expected} pantalla(s)`)
    }
    const numbering = adaptations.instagramStories.screens
      .map((screen) => screen.screen)
      .join(",")
    const expectedNumbering = Array.from(
      { length: expected },
      (_, index) => index + 1
    ).join(",")
    if (numbering !== expectedNumbering) {
      issues.push("Las pantallas de Stories deben estar ordenadas")
    }
  }

  return { success: issues.length === 0, issues }
}

export type GrowthStudioChannel = z.infer<typeof growthStudioChannelSchema>
export type CampaignBrief = z.infer<typeof campaignBriefSchema>
export type CampaignConcept = z.infer<typeof campaignConceptSchema>
export type CampaignConceptsOutput = z.infer<
  typeof campaignConceptsOutputSchema
>
export type ChannelAdaptations = z.infer<typeof channelAdaptationsSchema>

