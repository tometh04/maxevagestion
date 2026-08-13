/**
 * Tests de la liquidación al referidor (VIB-86).
 *
 * Invariantes que se protegen acá:
 *   - una liquidación es de UN referidor y UNA moneda (no se suman ARS + USD);
 *   - sólo entran comisiones elegibles, y nunca una ya incluida en otra
 *     liquidación (evita pagar dos veces la misma comisión);
 *   - cross-moneda exige tipo de cambio explícito, y lo que sale de la cuenta
 *     se expresa SIEMPRE en la moneda de la cuenta.
 */

import {
  buildSettlementConcept,
  isCommissionSettleable,
  resolveSettlementCash,
  validateSettlementSelection,
  type SettlementCommission,
} from "../settlement"

const PARTNER = "partner-1"

function comision(over: Partial<SettlementCommission> = {}): SettlementCommission {
  return {
    id: "c1",
    referral_partner_id: PARTNER,
    currency: "USD",
    amount: 100,
    status: "PENDING",
    settlement_id: null,
    date_calculated: "2026-08-04T12:00:00.000Z",
    ...over,
  }
}

describe("isCommissionSettleable", () => {
  it("acepta una comisión pendiente sin liquidación", () => {
    expect(isCommissionSettleable({ status: "PENDING", settlement_id: null })).toBe(true)
  })

  it("rechaza una comisión ya incluida en otra liquidación", () => {
    expect(isCommissionSettleable({ status: "PENDING", settlement_id: "s1" })).toBe(false)
  })

  it("rechaza una comisión anulada", () => {
    expect(isCommissionSettleable({ status: "CANCELLED", settlement_id: null })).toBe(false)
  })

  it("rechaza una PAID en el flujo normal pero la acepta al regularizar", () => {
    const row = { status: "PAID", settlement_id: null }
    expect(isCommissionSettleable(row)).toBe(false)
    expect(isCommissionSettleable(row, { regularize: true })).toBe(true)
  })

  it("no deja regularizar una PAID que ya tiene liquidación", () => {
    expect(
      isCommissionSettleable({ status: "PAID", settlement_id: "s1" }, { regularize: true }),
    ).toBe(false)
  })
})

describe("validateSettlementSelection", () => {
  it("suma el total y deriva el período de las comisiones", () => {
    const r = validateSettlementSelection([
      comision({ id: "a", amount: 224.11, date_calculated: "2026-08-04T00:00:00.000Z" }),
      comision({ id: "b", amount: 75.9, date_calculated: "2026-08-06T00:00:00.000Z" }),
      comision({ id: "c", amount: 106.51, date_calculated: "2026-08-07T00:00:00.000Z" }),
    ])

    expect(r.ok).toBe(true)
    expect(r.amount).toBe(406.52)
    expect(r.currency).toBe("USD")
    expect(r.partnerId).toBe(PARTNER)
    expect(r.periodFrom).toBe("2026-08-04")
    expect(r.periodTo).toBe("2026-08-07")
  })

  it("rechaza una selección vacía", () => {
    const r = validateSettlementSelection([])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/al menos una comisión/i)
  })

  it("rechaza comisiones de referidores distintos", () => {
    const r = validateSettlementSelection([
      comision({ id: "a" }),
      comision({ id: "b", referral_partner_id: "partner-2" }),
    ])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/un solo referidor/i)
  })

  it("rechaza mezclar monedas", () => {
    const r = validateSettlementSelection([
      comision({ id: "a", currency: "USD" }),
      comision({ id: "b", currency: "ARS" }),
    ])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/distintas monedas/i)
  })

  it("rechaza una comisión ya liquidada", () => {
    const r = validateSettlementSelection([comision({ settlement_id: "s1" })])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/otra liquidación/i)
  })

  it("rechaza un total en cero", () => {
    const r = validateSettlementSelection([comision({ amount: 0 })])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/mayor a cero/i)
  })

  it("acepta montos como string (vienen así de Postgres numeric)", () => {
    const r = validateSettlementSelection([
      comision({ id: "a", amount: "68.59" }),
      comision({ id: "b", amount: "28.28" }),
    ])
    expect(r.ok).toBe(true)
    expect(r.amount).toBe(96.87)
  })
})

describe("resolveSettlementCash", () => {
  it("ARS desde cuenta ARS: sale el mismo monto y no necesita TC", () => {
    const r = resolveSettlementCash({
      commissionCurrency: "ARS",
      accountCurrency: "ARS",
      amount: 150000,
    })
    expect(r).toMatchObject({ ok: true, cashAmount: 150000, amountARS: 150000, exchangeRate: null })
  })

  it("USD desde cuenta USD: sale el monto en USD y el ledger guarda el equivalente ARS", () => {
    const r = resolveSettlementCash({
      commissionCurrency: "USD",
      accountCurrency: "USD",
      amount: 222.17,
      exchangeRate: 1300,
    })
    expect(r.ok).toBe(true)
    expect(r.cashAmount).toBe(222.17)
    expect(r.amountARS).toBe(288821)
  })

  it("USD desde cuenta ARS: convierte a pesos lo que sale de la cuenta", () => {
    const r = resolveSettlementCash({
      commissionCurrency: "USD",
      accountCurrency: "ARS",
      amount: 100,
      exchangeRate: 1250,
    })
    expect(r.ok).toBe(true)
    expect(r.cashAmount).toBe(125000)
    expect(r.amountARS).toBe(125000)
  })

  it("ARS desde cuenta USD: descuenta dólares y el ledger conserva los pesos", () => {
    const r = resolveSettlementCash({
      commissionCurrency: "ARS",
      accountCurrency: "USD",
      amount: 125000,
      exchangeRate: 1250,
    })
    expect(r.ok).toBe(true)
    expect(r.cashAmount).toBe(100)
    expect(r.amountARS).toBe(125000)
  })

  it("exige tipo de cambio cuando las monedas difieren", () => {
    const r = resolveSettlementCash({
      commissionCurrency: "USD",
      accountCurrency: "ARS",
      amount: 100,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/tipo de cambio/i)
  })

  it("exige tipo de cambio para el equivalente ARS de una liquidación USD", () => {
    const r = resolveSettlementCash({
      commissionCurrency: "USD",
      accountCurrency: "USD",
      amount: 100,
      exchangeRate: 0,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/tipo de cambio/i)
  })

  it("rechaza montos no positivos", () => {
    expect(
      resolveSettlementCash({ commissionCurrency: "ARS", accountCurrency: "ARS", amount: 0 }).ok,
    ).toBe(false)
  })
})

describe("buildSettlementConcept", () => {
  it("describe referidor, cantidad de ventas y período", () => {
    expect(
      buildSettlementConcept({
        partnerName: "Nico Trip",
        commissionsCount: 4,
        periodFrom: "2026-08-04",
        periodTo: "2026-08-10",
      }),
    ).toBe("Pago comisión referidor Nico Trip — 4 ventas (2026-08-04 a 2026-08-10)")
  })

  it("usa singular con una sola venta y no repite la fecha", () => {
    expect(
      buildSettlementConcept({
        partnerName: "Agencia XYZ",
        commissionsCount: 1,
        periodFrom: "2026-08-04",
        periodTo: "2026-08-04",
      }),
    ).toBe("Pago comisión referidor Agencia XYZ — 1 venta (2026-08-04)")
  })
})
