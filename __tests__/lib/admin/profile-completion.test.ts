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
  it("0 → empty", () => expect(profileBadgeLevel(0)).toBe("empty"))
  it("1-7 → partial", () => {
    for (let i = 1; i <= 7; i++) expect(profileBadgeLevel(i)).toBe("partial")
  })
  it("8 → complete", () => expect(profileBadgeLevel(8)).toBe("complete"))
})
