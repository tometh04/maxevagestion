import {
  allocateCommissionPayment,
  sumLinesInCommissionCurrency,
  type PaymentLineInput,
} from "@/lib/commissions/payment-split"

const line = (partial: Partial<PaymentLineInput> & { amount: number }): PaymentLineInput => ({
  id: "l1",
  accountId: "acc-ars",
  accountCurrency: "ARS",
  exchangeRate: null,
  ...partial,
})

describe("allocateCommissionPayment", () => {
  it("no cambia el caso de siempre: una cuenta en la misma moneda", () => {
    const result = allocateCommissionPayment({
      commissions: [
        { id: "c1", amount: 300 },
        { id: "c2", amount: 200 },
      ],
      lines: [line({ id: "l1", accountId: "acc-usd", accountCurrency: "USD", amount: 500 })],
      commissionCurrency: "USD",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.allocations).toEqual([
      { commissionId: "c1", accountId: "acc-usd", amount: 300, exchangeRate: null, cashAmount: 300 },
      { commissionId: "c2", accountId: "acc-usd", amount: 200, exchangeRate: null, cashAmount: 200 },
    ])
  })

  it("paga una comisión en USD mitad en pesos y mitad en dólares", () => {
    const result = allocateCommissionPayment({
      commissions: [{ id: "c1", amount: 500 }],
      lines: [
        line({ id: "l1", accountId: "acc-ars", amount: 280_000, exchangeRate: 1400 }),
        line({ id: "l2", accountId: "acc-usd", accountCurrency: "USD", amount: 300 }),
      ],
      commissionCurrency: "USD",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.allocations).toEqual([
      {
        commissionId: "c1",
        accountId: "acc-ars",
        amount: 200,
        exchangeRate: 1400,
        cashAmount: 280_000,
      },
      { commissionId: "c1", accountId: "acc-usd", amount: 300, exchangeRate: null, cashAmount: 300 },
    ])
  })

  it("saca de cada cuenta exactamente el importe cargado aunque el cambio no sea redondo", () => {
    // 200.000 / 1.400 = 142,857… → la comisión se imputa redondeada, pero de la
    // cuenta tiene que salir el importe que se escribió, no el reconvertido.
    const result = allocateCommissionPayment({
      commissions: [{ id: "c1", amount: 500 }],
      lines: [
        line({ id: "l1", accountId: "acc-ars", amount: 200_000, exchangeRate: 1400 }),
        line({
          id: "l2",
          accountId: "acc-usd",
          accountCurrency: "USD",
          amount: 357.14,
        }),
      ],
      commissionCurrency: "USD",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.allocations.map((a) => a.cashAmount)).toEqual([200_000, 357.14])
    // La comisión queda cancelada al centavo: el residuo del redondeo se
    // absorbe en la última imputación.
    expect(result.allocations.reduce((s, a) => s + a.amount, 0)).toBe(500)
  })

  it("reparte una línea entre varias comisiones", () => {
    const result = allocateCommissionPayment({
      commissions: [
        { id: "c1", amount: 100 },
        { id: "c2", amount: 100 },
        { id: "c3", amount: 100 },
      ],
      lines: [
        line({ id: "l1", accountId: "acc-ars", amount: 210_000, exchangeRate: 1400 }),
        line({ id: "l2", accountId: "acc-usd", accountCurrency: "USD", amount: 150 }),
      ],
      commissionCurrency: "USD",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.allocations).toEqual([
      { commissionId: "c1", accountId: "acc-ars", amount: 100, exchangeRate: 1400, cashAmount: 140_000 },
      { commissionId: "c2", accountId: "acc-ars", amount: 50, exchangeRate: 1400, cashAmount: 70_000 },
      { commissionId: "c2", accountId: "acc-usd", amount: 50, exchangeRate: null, cashAmount: 50 },
      { commissionId: "c3", accountId: "acc-usd", amount: 100, exchangeRate: null, cashAmount: 100 },
    ])
    // Lo que sale de la cuenta en pesos es exactamente lo que se cargó.
    expect(
      result.allocations.filter((a) => a.accountId === "acc-ars").reduce((s, a) => s + a.cashAmount, 0)
    ).toBe(210_000)
  })

  it("paga una comisión en pesos desde una cuenta en dólares", () => {
    const result = allocateCommissionPayment({
      commissions: [{ id: "c1", amount: 1_400_000 }],
      lines: [
        line({ id: "l1", accountId: "acc-usd", accountCurrency: "USD", amount: 1000, exchangeRate: 1400 }),
      ],
      commissionCurrency: "ARS",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.allocations).toEqual([
      {
        commissionId: "c1",
        accountId: "acc-usd",
        amount: 1_400_000,
        exchangeRate: 1400,
        cashAmount: 1000,
      },
    ])
  })

  it("rechaza cuando las formas de pago no llegan al total", () => {
    const result = allocateCommissionPayment({
      commissions: [{ id: "c1", amount: 500 }],
      lines: [line({ id: "l1", accountId: "acc-usd", accountCurrency: "USD", amount: 400 })],
      commissionCurrency: "USD",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("Faltan 100.00 USD")
  })

  it("rechaza cuando las formas de pago se pasan del total", () => {
    const result = allocateCommissionPayment({
      commissions: [{ id: "c1", amount: 500 }],
      lines: [line({ id: "l1", accountId: "acc-usd", accountCurrency: "USD", amount: 600 })],
      commissionCurrency: "USD",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("de más")
  })

  it("exige tipo de cambio en la línea de otra moneda y señala cuál es", () => {
    const result = allocateCommissionPayment({
      commissions: [{ id: "c1", amount: 500 }],
      lines: [line({ id: "l2", accountId: "acc-ars", amount: 700_000, exchangeRate: null })],
      commissionCurrency: "USD",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.lineId).toBe("l2")
  })

  it("exige importe cargado en cada línea", () => {
    const result = allocateCommissionPayment({
      commissions: [{ id: "c1", amount: 500 }],
      lines: [
        line({ id: "l1", accountId: "acc-usd", accountCurrency: "USD", amount: 500 }),
        line({ id: "l2", accountId: "acc-ars", amount: 0, exchangeRate: 1400 }),
      ],
      commissionCurrency: "USD",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.lineId).toBe("l2")
  })
})

describe("sumLinesInCommissionCurrency", () => {
  it("convierte cada línea a la moneda de la comisión sin sumar peras con manzanas", () => {
    const total = sumLinesInCommissionCurrency(
      [
        line({ id: "l1", accountId: "acc-ars", amount: 140_000, exchangeRate: 1400 }),
        line({ id: "l2", accountId: "acc-usd", accountCurrency: "USD", amount: 250 }),
      ],
      "USD"
    )
    expect(total).toBe(350)
  })

  it("ignora la línea sin tipo de cambio en vez de inventar uno", () => {
    const total = sumLinesInCommissionCurrency(
      [line({ id: "l1", accountId: "acc-ars", amount: 140_000, exchangeRate: null })],
      "USD"
    )
    expect(total).toBe(0)
  })
})
