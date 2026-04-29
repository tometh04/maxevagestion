import {
  calculateEffectivePrice,
  shouldRequireMpReauth,
  mergeFeatures,
  MP_REAUTH_THRESHOLD_PCT,
} from "./custom-plans"

describe("calculateEffectivePrice", () => {
  it("retorna base cuando discount=0", () => {
    expect(calculateEffectivePrice(719000, 0)).toBe(719000)
  })
  it("aplica 40% off", () => {
    expect(calculateEffectivePrice(719000, 40)).toBe(431400)
  })
  it("aplica 100% off (gratis)", () => {
    expect(calculateEffectivePrice(119000, 100)).toBe(0)
  })
  it("redondea a 2 decimales", () => {
    expect(calculateEffectivePrice(100, 33)).toBe(67)
  })
  it("tira si discount fuera de rango", () => {
    expect(() => calculateEffectivePrice(100, 150)).toThrow()
    expect(() => calculateEffectivePrice(100, -5)).toThrow()
  })
})

describe("shouldRequireMpReauth", () => {
  it("delta 0% → no re-auth", () => {
    expect(shouldRequireMpReauth(100000, 100000)).toBe(false)
  })
  it("delta -40% (bajada) → no re-auth", () => {
    expect(shouldRequireMpReauth(100000, 60000)).toBe(false)
  })
  it(`delta exacto +${MP_REAUTH_THRESHOLD_PCT}% → no re-auth`, () => {
    expect(shouldRequireMpReauth(100000, 100000 * (1 + MP_REAUTH_THRESHOLD_PCT / 100))).toBe(false)
  })
  it(`delta +${MP_REAUTH_THRESHOLD_PCT + 1}% → re-auth`, () => {
    expect(shouldRequireMpReauth(100000, 100000 * (1 + (MP_REAUTH_THRESHOLD_PCT + 1) / 100))).toBe(true)
  })
  it("delta +66% (caso real discount expira) → re-auth", () => {
    expect(shouldRequireMpReauth(431400, 719000)).toBe(true)
  })
})

describe("mergeFeatures", () => {
  const enterpriseBase = ["F1", "F2", "F3"]
  it("extras vacíos → solo base", () => {
    expect(mergeFeatures(enterpriseBase, { extras: [] })).toEqual({
      base: enterpriseBase,
      extras: [],
    })
  })
  it("extras habilitados se retornan", () => {
    expect(
      mergeFeatures(enterpriseBase, {
        extras: [
          { key: "callbell_bridge", label: "Bridge", enabled: true },
          { key: "misc_sla", label: "SLA 4h", enabled: true },
        ],
      })
    ).toEqual({
      base: enterpriseBase,
      extras: [
        { key: "callbell_bridge", label: "Bridge", enabled: true },
        { key: "misc_sla", label: "SLA 4h", enabled: true },
      ],
    })
  })
  it("extras con enabled:false se excluyen", () => {
    const result = mergeFeatures(enterpriseBase, {
      extras: [
        { key: "a", label: "A", enabled: true },
        { key: "b", label: "B", enabled: false },
      ],
    })
    expect(result.extras).toHaveLength(1)
    expect(result.extras[0].key).toBe("a")
  })
})
