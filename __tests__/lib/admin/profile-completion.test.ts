import {
  computeProfileCompletion,
  profileBadgeLevel,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"

describe("computeProfileCompletion", () => {
  it("returns 0 when all fields are null/undefined", () => {
    expect(computeProfileCompletion({})).toBe(0)
  })

  it("returns 8 when all 8 fields are filled", () => {
    expect(
      computeProfileCompletion({
        company_name: "Maxeva Viajes",
        tax_id: "30123456789",
        legajo: "123",
        address: "Av. Pellegrini 1234, Rosario",
        phone: "+5493413001234",
        email: "info@maxeva.com",
        website: "https://maxeva.com",
        instagram: "@maxevaviajes",
      }),
    ).toBe(8)
  })

  it("treats empty string as not-filled", () => {
    expect(computeProfileCompletion({ company_name: "" })).toBe(0)
  })

  it("does NOT count fields outside TENANT_PROFILE_FIELDS", () => {
    expect(
      computeProfileCompletion({
        internal_notes: "secret note",
      } as any),
    ).toBe(0)
  })

  it("PROFILE_FIELD_COUNT is 8", () => {
    expect(PROFILE_FIELD_COUNT).toBe(8)
  })
})

describe("profileBadgeLevel", () => {
  // Semáforo actualizado 2026-05-16 (Tomi): el threshold viejo solo daba
  // verde a 8/8 — inútil para triage rápido en /admin/orgs.
  it("0-3 → empty (rojo)", () => {
    for (let i = 0; i <= 3; i++) expect(profileBadgeLevel(i)).toBe("empty")
  })
  it("4-5 → partial (amarillo)", () => {
    for (let i = 4; i <= 5; i++) expect(profileBadgeLevel(i)).toBe("partial")
  })
  it("6-8 → complete (verde)", () => {
    for (let i = 6; i <= 8; i++) expect(profileBadgeLevel(i)).toBe("complete")
  })
})
