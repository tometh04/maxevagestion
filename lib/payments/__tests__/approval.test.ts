import { requiresApproval, canApprove, convertToArs, type ApprovalRule } from "../approval"

describe("requiresApproval", () => {
  it("returns false when rules array is empty (backward compat)", () => {
    expect(requiresApproval(1000000, "SELLER", [])).toBe(false)
  })

  it("returns false when rule for role doesn't exist", () => {
    const rules: ApprovalRule[] = [{ role: "ADMIN", max_amount_ars: 500000 }]
    expect(requiresApproval(1000000, "SELLER", rules)).toBe(false)
  })

  it("returns false when role has unlimited (max=null)", () => {
    const rules: ApprovalRule[] = [{ role: "ADMIN", max_amount_ars: null }]
    expect(requiresApproval(99999999, "ADMIN", rules)).toBe(false)
  })

  it("returns true when amount exceeds role limit", () => {
    const rules: ApprovalRule[] = [{ role: "SELLER", max_amount_ars: 100000 }]
    expect(requiresApproval(150000, "SELLER", rules)).toBe(true)
  })

  it("returns false when amount is exactly at limit", () => {
    const rules: ApprovalRule[] = [{ role: "SELLER", max_amount_ars: 100000 }]
    expect(requiresApproval(100000, "SELLER", rules)).toBe(false)
  })

  it("returns true when SELLER limit is 0 and amount is any positive", () => {
    const rules: ApprovalRule[] = [{ role: "SELLER", max_amount_ars: 0 }]
    expect(requiresApproval(1, "SELLER", rules)).toBe(true)
  })
})

describe("canApprove", () => {
  it("returns true when rules array is empty (backward compat)", () => {
    expect(canApprove(1000000, "SELLER", [])).toBe(true)
  })

  it("returns true when role not listed (treated as unlimited)", () => {
    expect(canApprove(1000000, "GHOST_ROLE", [{ role: "SELLER", max_amount_ars: 0 }])).toBe(true)
  })

  it("returns true when role has max=null (explicit unlimited)", () => {
    expect(canApprove(99999999, "ADMIN", [{ role: "ADMIN", max_amount_ars: null }])).toBe(true)
  })

  it("returns true when amount is at limit", () => {
    expect(canApprove(500000, "ADMIN", [{ role: "ADMIN", max_amount_ars: 500000 }])).toBe(true)
  })

  it("returns false when amount exceeds limit", () => {
    expect(canApprove(500001, "ADMIN", [{ role: "ADMIN", max_amount_ars: 500000 }])).toBe(false)
  })
})

describe("convertToArs", () => {
  it("returns same amount for ARS", () => {
    expect(convertToArs(1000, "ARS", 1250)).toBe(1000)
  })

  it("multiplies USD by rate", () => {
    expect(convertToArs(100, "USD", 1250)).toBe(125000)
  })

  it("handles zero", () => {
    expect(convertToArs(0, "USD", 1250)).toBe(0)
    expect(convertToArs(0, "ARS", 1250)).toBe(0)
  })
})
