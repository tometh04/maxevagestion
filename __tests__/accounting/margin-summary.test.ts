/**
 * @jest-environment node
 */
import { calculateMarginSummary } from "@/lib/accounting/margin-summary"

describe("calculateMarginSummary", () => {
  const baseOp = { margin_amount: 20000, customer_id: "cus-1" }

  it("returns full margin as remaining when no invoices exist", () => {
    const r = calculateMarginSummary(baseOp, [], true)
    expect(r.margin_total).toBe(20000)
    expect(r.already_invoiced).toBe(0)
    expect(r.remaining).toBe(20000)
    expect(r.can_invoice).toBe(true)
    expect(r.reason_disabled).toBeNull()
  })

  it("subtracts authorized invoice totals from margin", () => {
    const r = calculateMarginSummary(
      baseOp,
      [
        { imp_total: 5000, status: "authorized" },
        { imp_total: 7000, status: "authorized" },
      ],
      true
    )
    expect(r.already_invoiced).toBe(12000)
    expect(r.remaining).toBe(8000)
    expect(r.can_invoice).toBe(true)
  })

  it("ignores non-authorized invoices (draft/pending/rejected)", () => {
    const r = calculateMarginSummary(
      baseOp,
      [
        { imp_total: 5000, status: "authorized" },
        { imp_total: 3000, status: "rejected" },
        { imp_total: 2000, status: "draft" },
        { imp_total: 1000, status: "pending" },
      ],
      true
    )
    expect(r.already_invoiced).toBe(5000)
    expect(r.remaining).toBe(15000)
  })

  it("flags already_fully_invoiced when remaining reaches 0", () => {
    const r = calculateMarginSummary(
      baseOp,
      [{ imp_total: 20000, status: "authorized" }],
      true
    )
    expect(r.remaining).toBe(0)
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("already_fully_invoiced")
  })

  it("flags no_margin when margin is 0", () => {
    const r = calculateMarginSummary(
      { margin_amount: 0, customer_id: "cus-1" },
      [],
      true
    )
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("no_margin")
  })

  it("flags no_margin for negative margin (loss) and clamps remaining to 0", () => {
    const r = calculateMarginSummary(
      { margin_amount: -5000, customer_id: "cus-1" },
      [],
      true
    )
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("no_margin")
    expect(r.remaining).toBe(0)
  })

  it("flags no_customer when operation has no customer assigned", () => {
    const r = calculateMarginSummary(
      { margin_amount: 20000, customer_id: null },
      [],
      true
    )
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("no_customer")
  })

  it("flags no_afip when hasAfipConfig is false", () => {
    const r = calculateMarginSummary(baseOp, [], false)
    expect(r.can_invoice).toBe(false)
    expect(r.reason_disabled).toBe("no_afip")
  })

  it("handles float precision: 20000 - 19999.99 = 0.01 (can_invoice still true)", () => {
    const r = calculateMarginSummary(
      baseOp,
      [{ imp_total: 19999.99, status: "authorized" }],
      true
    )
    expect(r.remaining).toBeCloseTo(0.01, 2)
    expect(r.can_invoice).toBe(true)
    expect(r.reason_disabled).toBeNull()
  })
})
