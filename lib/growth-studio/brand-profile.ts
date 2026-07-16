import type { BrandProfileDataV1 } from "@/lib/growth-studio/brand-profile-schema"

export interface BrandProfileCompletion {
  percentage: number
  missing: string[]
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

function hasItems(value: string[]): boolean {
  return value.length > 0
}

export function calculateBrandProfileCompletion(input: {
  brandName: string
  data: BrandProfileDataV1
}): BrandProfileCompletion {
  const checks = [
    ["brandName", hasText(input.brandName)],
    ["identity.valueProposition", hasText(input.data.identity.valueProposition)],
    ["identity.differentiators", hasItems(input.data.identity.differentiators)],
    ["audience.summary", hasText(input.data.audience.summary)],
    ["voice.tone", hasText(input.data.voice.tone)],
    ["voice.personality", hasItems(input.data.voice.personality)],
    ["offer.commercialFocus", hasItems(input.data.offer.commercialFocus)],
    ["offer.preferredDestinations", hasItems(input.data.offer.preferredDestinations)],
    ["visual.styleNotes", hasText(input.data.visual.styleNotes)],
    ["conversion.preferredCta", hasText(input.data.conversion.preferredCta)],
  ] as const

  const completed = checks.filter(([, present]) => present).length
  return {
    percentage: Math.round((completed / checks.length) * 100),
    missing: checks.filter(([, present]) => !present).map(([field]) => field),
  }
}
