import { hasRole } from "../auth"

describe("Auth - hasRole", () => {
  describe("role hierarchy checks", () => {
    it("should return true when user role equals required role", () => {
      expect(hasRole("VIEWER", "VIEWER")).toBe(true)
      expect(hasRole("SELLER", "SELLER")).toBe(true)
      expect(hasRole("ADMIN", "ADMIN")).toBe(true)
      expect(hasRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true)
    })

    it("should return true when user role is higher than required role", () => {
      expect(hasRole("SUPER_ADMIN", "VIEWER")).toBe(true)
      expect(hasRole("SUPER_ADMIN", "SELLER")).toBe(true)
      expect(hasRole("SUPER_ADMIN", "ADMIN")).toBe(true)
      expect(hasRole("ADMIN", "VIEWER")).toBe(true)
      expect(hasRole("ADMIN", "SELLER")).toBe(true)
      expect(hasRole("SELLER", "VIEWER")).toBe(true)
    })

    it("should return false when user role is lower than required role", () => {
      expect(hasRole("VIEWER", "SELLER")).toBe(false)
      expect(hasRole("VIEWER", "ADMIN")).toBe(false)
      expect(hasRole("VIEWER", "SUPER_ADMIN")).toBe(false)
      expect(hasRole("SELLER", "ADMIN")).toBe(false)
      expect(hasRole("SELLER", "SUPER_ADMIN")).toBe(false)
      expect(hasRole("ADMIN", "SUPER_ADMIN")).toBe(false)
    })
  })

  describe("unknown roles", () => {
    it("should return false for unknown user role with valid required role", () => {
      expect(hasRole("UNKNOWN_ROLE", "VIEWER")).toBe(false)
    })

    it("should return true for any role when required role is unknown (0 >= 0)", () => {
      // Unknown required role gets 0, and unknown user role also gets 0, so 0 >= 0 is true
      expect(hasRole("UNKNOWN", "ALSO_UNKNOWN")).toBe(true)
    })

    it("should return true for valid role when required role is unknown", () => {
      // Valid role (e.g. VIEWER = 1) >= unknown (0) = true
      expect(hasRole("VIEWER", "NONEXISTENT")).toBe(true)
    })
  })

  describe("hierarchy ordering", () => {
    it("should have VIEWER as the lowest role", () => {
      expect(hasRole("VIEWER", "SELLER")).toBe(false)
    })

    it("should have SUPER_ADMIN as the highest role", () => {
      expect(hasRole("SUPER_ADMIN", "VIEWER")).toBe(true)
      expect(hasRole("SUPER_ADMIN", "SELLER")).toBe(true)
      expect(hasRole("SUPER_ADMIN", "ADMIN")).toBe(true)
    })

    it("should place SELLER between VIEWER and ADMIN", () => {
      expect(hasRole("SELLER", "VIEWER")).toBe(true)
      expect(hasRole("SELLER", "ADMIN")).toBe(false)
    })
  })
})
