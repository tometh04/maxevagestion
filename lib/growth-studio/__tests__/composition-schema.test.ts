import { compositionSchema } from "@/lib/growth-studio/composition-schema"

describe("Growth Studio composition contract", () => {
  const backgroundAssetId = "11111111-1111-4111-8111-111111111111"

  it("accepts the intentionally small editor surface", () => {
    const composition = compositionSchema.parse({
      backgroundAssetId,
      format: "instagram_feed",
      overlays: {
        headline: {
          text: "Viví el Caribe",
          x: 0.08,
          y: 0.12,
          color: "#FFFFFF",
          size: "large",
          align: "left",
          visible: true,
        },
        secondary: {
          text: "Salidas en septiembre",
          x: 0.08,
          y: 0.28,
          color: "#FFFFFF",
          size: "medium",
          align: "left",
          visible: true,
        },
        cta: {
          text: "Consultanos",
          x: 0.08,
          y: 0.8,
          color: "#FFFFFF",
          size: "small",
          align: "left",
          visible: true,
        },
      },
      logo: {
        assetId: null,
        x: 0.76,
        y: 0.06,
        size: "medium",
        visible: true,
      },
    })

    expect(composition.format).toBe("instagram_feed")
    expect(composition.logo.size).toBe("medium")
  })

  it("rejects elements outside the normalized canvas", () => {
    const result = compositionSchema.safeParse({
      backgroundAssetId,
      format: "instagram_story",
      overlays: {
        headline: {
          text: "Fuera",
          x: 1.2,
          y: 0.1,
          color: "#FFFFFF",
          size: "large",
          align: "center",
          visible: true,
        },
        secondary: { text: "", x: 0, y: 0, color: "#FFFFFF", size: "small", align: "left", visible: false },
        cta: { text: "", x: 0, y: 0, color: "#FFFFFF", size: "small", align: "left", visible: false },
      },
      logo: { assetId: null, x: 0, y: 0, size: "small", visible: false },
    })

    expect(result.success).toBe(false)
  })
})
