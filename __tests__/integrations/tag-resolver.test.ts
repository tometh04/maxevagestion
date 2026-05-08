import {
  mapCampaignToOriginLabel,
  normalizeTagLabel,
} from "@/lib/integrations/tag-resolver"

describe("normalizeTagLabel", () => {
  it("uppercases and trims", () => {
    expect(normalizeTagLabel("  punta cana ")).toBe("PUNTA CANA")
  })
  it("removes diacritics", () => {
    expect(normalizeTagLabel("Cancún")).toBe("CANCUN")
  })
  it("collapses multiple spaces", () => {
    expect(normalizeTagLabel("playa  del   carmen")).toBe("PLAYA DEL CARMEN")
  })
  it("handles already-uppercase input", () => {
    expect(normalizeTagLabel("MUNDIAL")).toBe("MUNDIAL")
  })
  it("handles mixed-case with accents and extra spaces", () => {
    expect(normalizeTagLabel("  RÍo  De  Janeiro  ")).toBe("RIO DE JANEIRO")
  })
})

describe("mapCampaignToOriginLabel", () => {
  it("maps mundial to PUBLICIDAD", () => {
    expect(mapCampaignToOriginLabel("mundial")).toBe("PUBLICIDAD")
  })
  it("maps f1 to PUBLICIDAD", () => {
    expect(mapCampaignToOriginLabel("f1")).toBe("PUBLICIDAD")
  })
  it("maps formula 1 / formula1 variants to PUBLICIDAD", () => {
    expect(mapCampaignToOriginLabel("formula 1")).toBe("PUBLICIDAD")
    expect(mapCampaignToOriginLabel("formula1")).toBe("PUBLICIDAD")
  })
  it("maps generic publicidad/meta-ads sources to PUBLICIDAD", () => {
    expect(mapCampaignToOriginLabel("publicidad")).toBe("PUBLICIDAD")
    expect(mapCampaignToOriginLabel("meta-ads")).toBe("PUBLICIDAD")
    expect(mapCampaignToOriginLabel("meta_ads")).toBe("PUBLICIDAD")
  })
  it("maps referido / referral to REFERIDO", () => {
    expect(mapCampaignToOriginLabel("referido")).toBe("REFERIDO")
    expect(mapCampaignToOriginLabel("referral")).toBe("REFERIDO")
  })
  it("maps organico / web to DERIVACION DE TRAFICO", () => {
    expect(mapCampaignToOriginLabel("organico")).toBe("DERIVACION DE TRAFICO")
    expect(mapCampaignToOriginLabel("organic")).toBe("DERIVACION DE TRAFICO")
    expect(mapCampaignToOriginLabel("web")).toBe("DERIVACION DE TRAFICO")
  })
  it("maps operador to OPERADOR and canal/canales to CANALES", () => {
    expect(mapCampaignToOriginLabel("operador")).toBe("OPERADOR")
    expect(mapCampaignToOriginLabel("canal")).toBe("CANALES")
    expect(mapCampaignToOriginLabel("canales")).toBe("CANALES")
  })
  it("returns null for null/undefined/unknown", () => {
    expect(mapCampaignToOriginLabel(null)).toBeNull()
    expect(mapCampaignToOriginLabel(undefined)).toBeNull()
    expect(mapCampaignToOriginLabel("xxx")).toBeNull()
    expect(mapCampaignToOriginLabel("")).toBeNull()
  })
  it("trims and lowercases input before mapping", () => {
    expect(mapCampaignToOriginLabel("  PUBLICIDAD  ")).toBe("PUBLICIDAD")
    expect(mapCampaignToOriginLabel("Mundial")).toBe("PUBLICIDAD")
  })
})
