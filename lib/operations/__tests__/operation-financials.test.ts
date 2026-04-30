import {
  calculateOperationBalances,
  sumOperationOperatorCosts,
} from "@/lib/operations/operation-financials"

describe("operation financial helpers", () => {
  it("sums operator detail rows as the source of truth for aggregate cost", () => {
    expect(sumOperationOperatorCosts([
      { cost: 2538 },
      { cost: "4806.26" },
      { cost: 200 },
    ])).toBe(7544.26)
  })

  it("calculates balances from totals minus paid amounts, ignoring stale pending schedules", () => {
    expect(calculateOperationBalances({
      saleAmount: 8400,
      operatorCost: 7544.26,
      customerPaid: 4850,
      operatorPaid: 2501.3,
    })).toEqual({
      customerPending: 3550,
      operatorPending: 5042.96,
    })
  })
})
