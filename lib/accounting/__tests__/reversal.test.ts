import { oppositeMovementType, canReverse, buildReversalPayload } from "../reversal"

describe("oppositeMovementType", () => {
  it("INCOME → EXPENSE", () => {
    expect(oppositeMovementType("INCOME")).toBe("EXPENSE")
  })
  it("EXPENSE → INCOME", () => {
    expect(oppositeMovementType("EXPENSE")).toBe("INCOME")
  })
})

describe("canReverse", () => {
  it("ok=true quando no fue reversado y no es reversión", () => {
    expect(canReverse({ reversed_at: null, reverses_movement_id: null })).toEqual({ ok: true })
  })
  it("ok=false quando já foi reversado", () => {
    expect(canReverse({ reversed_at: "2026-04-27T10:00:00Z", reverses_movement_id: null }))
      .toEqual({ ok: false, error: "Este movimiento ya fue reversado" })
  })
  it("ok=false cuando es una reversión", () => {
    expect(canReverse({ reversed_at: null, reverses_movement_id: "abc-123" }))
      .toEqual({ ok: false, error: "No se puede reversar una reversión" })
  })
  it("ok=false cuando ambos: ya reversado tiene precedencia sobre is-reversal", () => {
    expect(canReverse({ reversed_at: "2026-04-27T10:00:00Z", reverses_movement_id: "abc" }))
      .toEqual({ ok: false, error: "Este movimiento ya fue reversado" })
  })
  it("trata undefined como null", () => {
    expect(canReverse({})).toEqual({ ok: true })
  })
})

describe("buildReversalPayload", () => {
  const baseOriginal = {
    type: "INCOME",
    amount: 1000,
    currency: "ARS",
    financial_account_id: "acc-1",
    agency_id: "ag-1",
    org_id: "org-1",
    operation_id: "op-1",
    user_id: "u-1",
  }

  it("flips type", () => {
    const payload = buildReversalPayload(baseOriginal, "test reason", "orig-id", "2026-04-27")
    expect(payload.type).toBe("EXPENSE")
  })

  it("preserves amount + currency + financial_account + agency + org + operation + user", () => {
    const p = buildReversalPayload(baseOriginal, "test", "orig-id", "2026-04-27")
    expect(p.amount).toBe(1000)
    expect(p.currency).toBe("ARS")
    expect(p.financial_account_id).toBe("acc-1")
    expect(p.agency_id).toBe("ag-1")
    expect(p.org_id).toBe("org-1")
    expect(p.operation_id).toBe("op-1")
    expect(p.user_id).toBe("u-1")
  })

  it("sets category, notes con reason + original id, movement_date, reverses_movement_id", () => {
    const p = buildReversalPayload(baseOriginal, "monto erróneo", "orig-id-xyz", "2026-04-27")
    expect(p.category).toBe("Contra-movimiento")
    expect(p.notes).toBe("Reversión de orig-id-xyz: monto erróneo")
    expect(p.movement_date).toBe("2026-04-27")
    expect(p.reverses_movement_id).toBe("orig-id-xyz")
  })

  it("EXPENSE original → INCOME reversal", () => {
    const p = buildReversalPayload({ ...baseOriginal, type: "EXPENSE" }, "x", "id", "d")
    expect(p.type).toBe("INCOME")
  })

  it("optional cols default to null when missing", () => {
    const minimal = { type: "INCOME", amount: 500, currency: "USD", financial_account_id: null }
    const p = buildReversalPayload(minimal, "x", "id", "d")
    expect(p.agency_id).toBeNull()
    expect(p.org_id).toBeNull()
    expect(p.operation_id).toBeNull()
    expect(p.user_id).toBeNull()
    expect(p.financial_account_id).toBeNull()
  })
})
