/** @jest-environment node */

import {
  brandProfileInputSchema,
  createEmptyBrandProfileData,
} from "../brand-profile-schema"
import { calculateBrandProfileCompletion } from "../brand-profile"

describe("BrandProfile", () => {
  it("crea un documento vacío con defaults estables", () => {
    const data = createEmptyBrandProfileData()

    expect(data.locale).toEqual({ language: "es", country: "AR" })
    expect(data.identity.differentiators).toEqual([])
    expect(data.visual.primaryColor).toBeNull()
  })

  it("normaliza textos y elimina duplicados case-insensitive", () => {
    const parsed = brandProfileInputSchema.parse({
      agencyId: "7e152aef-a90e-4b87-ac5f-b262d0eea4a9",
      brandName: "  Viajes Centro  ",
      data: {
        ...createEmptyBrandProfileData(),
        identity: {
          tagline: "  Tu viaje empieza acá  ",
          valueProposition: "Atención personalizada",
          differentiators: ["Expertos", "expertos", "Financiación"],
        },
      },
    })

    expect(parsed.brandName).toBe("Viajes Centro")
    expect(parsed.data.identity.tagline).toBe("Tu viaje empieza acá")
    expect(parsed.data.identity.differentiators).toEqual([
      "Expertos",
      "Financiación",
    ])
  })

  it("rechaza colores y nombres inválidos", () => {
    const base = {
      agencyId: "7e152aef-a90e-4b87-ac5f-b262d0eea4a9",
      brandName: "V",
      data: {
        ...createEmptyBrandProfileData(),
        visual: {
          primaryColor: "violeta",
          secondaryColor: null,
          styleNotes: "",
        },
      },
    }

    expect(brandProfileInputSchema.safeParse(base).success).toBe(false)
  })

  it("calcula completitud y campos faltantes de forma determinista", () => {
    const completion = calculateBrandProfileCompletion({
      brandName: "Viajes Centro",
      data: createEmptyBrandProfileData(),
    })

    expect(completion.percentage).toBe(10)
    expect(completion.missing).toContain("voice.tone")
    expect(completion.missing).not.toContain("brandName")
  })
})
