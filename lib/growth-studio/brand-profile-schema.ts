import { z } from "zod"

const shortText = (max: number) => z.string().trim().max(max)

function uniqueStringList(maxItems: number, maxLength: number) {
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

const nullableHexColor = z
  .union([z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/), z.null(), z.literal("")])
  .transform((value) => (value === "" ? null : value))
  .default(null)

export const brandProfileDataV1Schema = z.object({
  identity: z.object({
    tagline: shortText(160).default(""),
    valueProposition: shortText(1000).default(""),
    differentiators: uniqueStringList(10, 160),
  }),
  audience: z.object({
    summary: shortText(1000).default(""),
    segments: uniqueStringList(10, 120),
  }),
  voice: z.object({
    tone: shortText(500).default(""),
    personality: uniqueStringList(10, 80),
    wordsToUse: uniqueStringList(20, 80),
    forbiddenTerms: uniqueStringList(20, 80),
    writingRules: shortText(1500).default(""),
  }),
  offer: z.object({
    commercialFocus: uniqueStringList(15, 120),
    preferredDestinations: uniqueStringList(30, 120),
  }),
  visual: z.object({
    primaryColor: nullableHexColor,
    secondaryColor: nullableHexColor,
    styleNotes: shortText(1000).default(""),
  }),
  conversion: z.object({
    preferredCta: shortText(300).default(""),
  }),
  locale: z.object({
    language: z.string().trim().min(2).max(10).default("es"),
    country: z.string().trim().length(2).toUpperCase().default("AR"),
  }),
})

export const brandProfileInputSchema = z.object({
  agencyId: z.string().uuid(),
  brandName: z.string().trim().min(2).max(120),
  data: brandProfileDataV1Schema,
})

export const brandProfileQuerySchema = z.object({
  agencyId: z.string().uuid(),
})

export type BrandProfileDataV1 = z.infer<typeof brandProfileDataV1Schema>
export type BrandProfileInput = z.infer<typeof brandProfileInputSchema>

export function createEmptyBrandProfileData(): BrandProfileDataV1 {
  return brandProfileDataV1Schema.parse({
    identity: {},
    audience: {},
    voice: {},
    offer: {},
    visual: {},
    conversion: {},
    locale: {},
  })
}
