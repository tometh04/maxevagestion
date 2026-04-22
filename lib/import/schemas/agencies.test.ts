import { agenciesSchema, agenciesNaturalKey, agenciesCsvHeaders } from "./agencies"

describe("agenciesSchema", () => {
  it("accepts valid row", () => {
    const r = agenciesSchema.safeParse({
      name: "Rosario",
      city: "Rosario",
      timezone: "America/Argentina/Buenos_Aires",
    })
    expect(r.success).toBe(true)
  })
  it("rejects empty name", () => {
    expect(agenciesSchema.safeParse({ name: "", city: "X", timezone: "UTC" }).success).toBe(false)
  })
  it("defaults timezone", () => {
    const r = agenciesSchema.parse({ name: "A", city: "C" })
    expect(r.timezone).toBe("America/Argentina/Buenos_Aires")
  })
  it("naturalKey = name", () => {
    expect(agenciesNaturalKey({ name: "Foo", city: "X", timezone: "Y" })).toBe("Foo")
  })
  it("headers constant", () => {
    expect(agenciesCsvHeaders).toEqual(["name", "city", "timezone"])
  })
})
