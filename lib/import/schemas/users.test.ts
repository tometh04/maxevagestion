import { usersSchema, usersNaturalKey } from "./users"

describe("usersSchema", () => {
  it("accepts valid", () => {
    expect(usersSchema.safeParse({
      email: "a@b.com", name: "A", role: "SELLER",
      commission_percentage: "5",
    }).success).toBe(true)
  })
  it("rejects bad email", () => {
    expect(usersSchema.safeParse({ email: "x", name: "A", role: "SELLER" }).success).toBe(false)
  })
  it("rejects SUPER_ADMIN role", () => {
    expect(usersSchema.safeParse({ email: "a@b.com", name: "A", role: "SUPER_ADMIN" }).success).toBe(false)
  })
  it("naturalKey = email", () => {
    expect(usersNaturalKey({ email: "x@y.com", name: "A", role: "SELLER" } as any)).toBe("x@y.com")
  })
})
