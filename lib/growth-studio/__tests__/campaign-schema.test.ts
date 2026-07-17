import {
  campaignBriefSchema,
  campaignConceptsOutputSchema,
  channelAdaptationsSchema,
  validateAdaptationsForBrief,
} from "@/lib/growth-studio/campaign-schema"

const agencyId = "11111111-1111-4111-8111-111111111111"

describe("Growth Studio campaign contracts", () => {
  it("normalizes a manual brief and keeps unique channels", () => {
    const brief = campaignBriefSchema.parse({
      agencyId,
      name: "  Caribe en familia  ",
      objective: "Promocionar vacaciones familiares",
      contentType: "promotion",
      source: { type: "manual", id: null },
      channels: ["instagram_feed", "instagram_feed", "whatsapp"],
      story: { mode: "single", screenCount: 1 },
      destinations: [" Punta Cana ", "punta cana"],
    })

    expect(brief.name).toBe("Caribe en familia")
    expect(brief.channels).toEqual(["instagram_feed", "whatsapp"])
    expect(brief.destinations).toEqual(["Punta Cana"])
    expect(brief.includePrice).toBe(false)
  })

  it("requires an id for operation and quotation sources", () => {
    const result = campaignBriefSchema.safeParse({
      agencyId,
      name: "Campaña",
      objective: "Convertir una cotización en campaña",
      contentType: "promotion",
      source: { type: "quotation", id: null },
      channels: ["email"],
      story: { mode: "single", screenCount: 1 },
    })

    expect(result.success).toBe(false)
  })

  it("accepts stories with one screen or a sequence of three to five", () => {
    const base = {
      agencyId,
      name: "Stories",
      objective: "Inspirar una consulta",
      contentType: "inspiration" as const,
      source: { type: "manual" as const, id: null },
      channels: ["instagram_stories" as const],
    }

    expect(
      campaignBriefSchema.safeParse({
        ...base,
        story: { mode: "sequence", screenCount: 4 },
      }).success
    ).toBe(true)
    expect(
      campaignBriefSchema.safeParse({
        ...base,
        story: { mode: "sequence", screenCount: 2 },
      }).success
    ).toBe(false)
    expect(
      campaignBriefSchema.safeParse({
        ...base,
        story: { mode: "single", screenCount: 2 },
      }).success
    ).toBe(false)
  })

  it("requires exactly three distinct campaign concepts", () => {
    const valid = campaignConceptsOutputSchema.safeParse({
      variants: [1, 2, 3].map((index) => ({
        index,
        title: `Concepto ${index}`,
        angle: `Ángulo ${index}`,
        hook: `Gancho ${index}`,
        coreMessage: `Mensaje ${index}`,
        visualDirection: `Dirección ${index}`,
        recommendedCta: "Consultanos",
      })),
    })

    expect(valid.success).toBe(true)
    expect(
      campaignConceptsOutputSchema.safeParse({
        variants: [
          {
            index: 1,
            title: "Uno",
            angle: "Ángulo",
            hook: "Gancho",
            coreMessage: "Mensaje",
            visualDirection: "Visual",
            recommendedCta: "CTA",
          },
        ],
      }).success
    ).toBe(false)
  })

  it("validates that adaptations match the selected channels and story length", () => {
    const brief = campaignBriefSchema.parse({
      agencyId,
      name: "Multicanal",
      objective: "Conseguir consultas",
      contentType: "promotion",
      source: { type: "manual", id: null },
      channels: ["instagram_stories", "email"],
      story: { mode: "sequence", screenCount: 3 },
    })
    const output = channelAdaptationsSchema.parse({
      instagramFeed: null,
      instagramStories: {
        screens: [1, 2, 3].map((screen) => ({
          screen,
          copy: `Texto ${screen}`,
          cta: screen === 3 ? "Consultanos" : "",
          visualDirection: `Visual ${screen}`,
        })),
      },
      whatsapp: null,
      email: {
        subject: "Tu próximo viaje",
        preheader: "Una propuesta para vos",
        body: "Conocé esta oportunidad.",
        cta: "Consultanos",
      },
    })

    expect(validateAdaptationsForBrief(brief, output).success).toBe(true)
    expect(
      validateAdaptationsForBrief(brief, {
        ...output,
        instagramStories: {
          screens: output.instagramStories!.screens.slice(0, 2),
        },
      }).success
    ).toBe(false)
  })
})
