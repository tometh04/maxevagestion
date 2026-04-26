import {
  computeProfileCompletion,
  profileBadgeLevel,
  PROFILE_FIELD_COUNT,
} from "@/lib/admin/profile-completion"

describe("computeProfileCompletion", () => {
  it("returns 0 when all fields are null/undefined", () => {
    expect(computeProfileCompletion({})).toBe(0)
  })

  it("returns 9 when all 9 fields are filled", () => {
    expect(
      computeProfileCompletion({
        contact_name: "Maxi",
        contact_phone: "+5491234",
        cuit: "30123456789",
        tax_category: "RESPONSABLE_INSCRIPTO",
        billing_email: "x@y.com",
        address_street: "Av. Pellegrini 1234",
        address_city: "Rosario",
        address_province: "Santa Fe",
        address_postal_code: "S2000",
      }),
    ).toBe(9)
  })

  it("treats empty string as not-filled", () => {
    expect(computeProfileCompletion({ contact_name: "" })).toBe(0)
  })

  it("does NOT count internal_notes or address_country", () => {
    expect(
      computeProfileCompletion({
        internal_notes: "secret note",
        address_country: "AR",
      } as any),
    ).toBe(0)
  })

  it("PROFILE_FIELD_COUNT is 9", () => {
    expect(PROFILE_FIELD_COUNT).toBe(9)
  })
})

describe("profileBadgeLevel", () => {
  it("0 → empty", () => expect(profileBadgeLevel(0)).toBe("empty"))
  it("1-8 → partial", () => {
    for (let i = 1; i <= 8; i++) expect(profileBadgeLevel(i)).toBe("partial")
  })
  it("9 → complete", () => expect(profileBadgeLevel(9)).toBe("complete"))
})
