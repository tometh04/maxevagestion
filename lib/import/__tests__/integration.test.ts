// Mock React's `cache` (used by lib/accounting/exchange-rates.ts) as identity
// so importing the full pipeline graph works in jest's test env.
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}))

import { PIPELINES } from "../index"

describe("PIPELINES registry", () => {
  it("expone los 5 pipelines", () => {
    expect(Object.keys(PIPELINES).sort()).toEqual([
      "cash-movements",
      "customers",
      "operations-master",
      "operators",
      "payments-suelto",
    ])
  })

  it("cada pipeline es una función async", () => {
    Object.values(PIPELINES).forEach(pipeline => {
      expect(typeof pipeline).toBe("function")
    })
  })
})
