import { applyPriceChange } from "./mp-update"

jest.mock("./mercadopago", () => ({
  fetchPreapproval: jest.fn(),
  updatePreapproval: jest.fn(),
  cancelPreapproval: jest.fn(),
  createPreapproval: jest.fn(),
}))

const mp = require("./mercadopago")

describe("applyPriceChange", () => {
  beforeEach(() => jest.clearAllMocks())

  it("sin preapproval → NO_PREAPPROVAL", async () => {
    const result = await applyPriceChange({
      preapprovalId: null,
      currentAmount: 0,
      newAmount: 100000,
      recreateParams: {} as any,
    })
    expect(result.action).toBe("NO_PREAPPROVAL")
    expect(mp.updatePreapproval).not.toHaveBeenCalled()
  })

  it("delta ≤ +20% → UPDATED_IN_PLACE", async () => {
    mp.fetchPreapproval.mockResolvedValue({
      auto_recurring: { transaction_amount: 100000 },
    })
    mp.updatePreapproval.mockResolvedValue({})
    const result = await applyPriceChange({
      preapprovalId: "pre_123",
      currentAmount: 100000,
      newAmount: 115000,
      recreateParams: {} as any,
    })
    expect(result.action).toBe("UPDATED_IN_PLACE")
    expect(mp.updatePreapproval).toHaveBeenCalledWith("pre_123", { transaction_amount: 115000 })
  })

  it("delta > +20% → REAUTH_REQUIRED (cancel + create nuevo)", async () => {
    mp.fetchPreapproval.mockResolvedValue({
      auto_recurring: { transaction_amount: 431400 },
    })
    mp.cancelPreapproval.mockResolvedValue({})
    mp.createPreapproval.mockResolvedValue({ id: "pre_new", init_point: "https://mp/x", status: "pending" })
    const result = await applyPriceChange({
      preapprovalId: "pre_old",
      currentAmount: 431400,
      newAmount: 719000,
      recreateParams: {
        orgId: "org_1",
        plan: "CUSTOM",
        customAmount: 719000,
        customReason: "Test",
        payerEmail: "a@b.com",
        backUrl: "https://app/settings/subscription",
        includeFreeTrial: false,
      },
    })
    expect(result.action).toBe("REAUTH_REQUIRED")
    expect(result.newPreapprovalId).toBe("pre_new")
    expect(result.checkoutUrl).toBe("https://mp/x")
    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre_old")
    expect(mp.createPreapproval).toHaveBeenCalled()
  })

  it("bajada (delta < 0) → UPDATED_IN_PLACE", async () => {
    mp.fetchPreapproval.mockResolvedValue({
      auto_recurring: { transaction_amount: 100000 },
    })
    mp.updatePreapproval.mockResolvedValue({})
    const result = await applyPriceChange({
      preapprovalId: "pre_x",
      currentAmount: 100000,
      newAmount: 50000,
      recreateParams: {} as any,
    })
    expect(result.action).toBe("UPDATED_IN_PLACE")
  })
})
