import {
  reconcileOperatorSaleBreakdown,
  distributeSaleByCost,
  defaultBreakdownTolerance,
} from "@/lib/operations/operator-sale-breakdown"

describe("reconcileOperatorSaleBreakdown (VIB-112)", () => {
  it("EMPTY cuando ninguna pata tiene precio", () => {
    const r = reconcileOperatorSaleBreakdown({
      legs: [{ sale_amount: 0 }, { sale_amount: null }],
      saleAmountTotal: 1000,
    })
    expect(r.status).toBe("EMPTY")
    expect(r.filledCount).toBe(0)
    expect(r.breakdownTotal).toBe(0)
  })

  it("BALANCED cuando la suma cuadra con el total", () => {
    const r = reconcileOperatorSaleBreakdown({
      legs: [{ sale_amount: 400 }, { sale_amount: 600 }],
      saleAmountTotal: 1000,
    })
    expect(r.status).toBe("BALANCED")
    expect(r.breakdownTotal).toBe(1000)
    expect(r.difference).toBe(0)
    expect(r.filledCount).toBe(2)
  })

  it("BALANCED dentro de la tolerancia (0,5% del total)", () => {
    // 1000 → tolerancia 5. 1004 cuadra, 1006 no.
    expect(
      reconcileOperatorSaleBreakdown({
        legs: [{ sale_amount: 1004 }],
        saleAmountTotal: 1000,
      }).status
    ).toBe("BALANCED")
    expect(
      reconcileOperatorSaleBreakdown({
        legs: [{ sale_amount: 1006 }],
        saleAmountTotal: 1000,
      }).status
    ).toBe("MISMATCH")
  })

  it("MISMATCH cuando cargaron de más y reporta la diferencia con signo", () => {
    const r = reconcileOperatorSaleBreakdown({
      legs: [{ sale_amount: 500 }, { sale_amount: 600 }],
      saleAmountTotal: 1000,
    })
    expect(r.status).toBe("MISMATCH")
    expect(r.difference).toBe(100)
  })

  it("MISMATCH parcial: unas patas con precio y otras en 0 que no cuadra", () => {
    const r = reconcileOperatorSaleBreakdown({
      legs: [{ sale_amount: 400 }, { sale_amount: 0 }],
      saleAmountTotal: 1000,
    })
    expect(r.status).toBe("MISMATCH")
    expect(r.filledCount).toBe(1)
    expect(r.difference).toBe(-600)
  })

  it("tolerancia: piso de un centavo para totales chicos", () => {
    expect(defaultBreakdownTolerance(0)).toBe(0.01)
    expect(defaultBreakdownTolerance(1000)).toBe(5)
  })
})

describe("distributeSaleByCost (VIB-112)", () => {
  it("reparte proporcional al costo", () => {
    const shares = distributeSaleByCost({
      legs: [
        { cost: 800, cost_currency: "USD" },
        { cost: 200, cost_currency: "USD" },
      ],
      saleAmountTotal: 1500,
      saleCurrency: "USD",
    })
    expect(shares).toEqual([1200, 300])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1500)
  })

  it("sin costos, reparto parejo", () => {
    const shares = distributeSaleByCost({
      legs: [{ cost: 0 }, { cost: 0 }, { cost: 0 }],
      saleAmountTotal: 900,
      saleCurrency: "USD",
    })
    expect(shares).toEqual([300, 300, 300])
  })

  it("el residuo de redondeo lo absorbe la pata de mayor peso", () => {
    // 1000 entre 3 costos iguales = 333,33 c/u → residuo 0,01 al de mayor peso
    // (con pesos iguales, el primero).
    const shares = distributeSaleByCost({
      legs: [
        { cost: 100, cost_currency: "USD" },
        { cost: 100, cost_currency: "USD" },
        { cost: 100, cost_currency: "USD" },
      ],
      saleAmountTotal: 1000,
      saleCurrency: "USD",
    })
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000)
    expect(shares).toEqual([333.34, 333.33, 333.33])
  })

  it("convierte el costo a la moneda de venta con el TC", () => {
    // Venta en USD; una pata cuesta 1000 USD, otra 300000 ARS con TC 1000 → 300 USD.
    // Total 1300 USD de costo, venta 2600 → 2000 y 600.
    const shares = distributeSaleByCost({
      legs: [
        { cost: 1000, cost_currency: "USD" },
        { cost: 300000, cost_currency: "ARS" },
      ],
      saleAmountTotal: 2600,
      saleCurrency: "USD",
      exchangeRate: 1000,
    })
    expect(shares).toEqual([2000, 600])
  })

  it("monedas mezcladas sin TC → reparto parejo (nunca suma ARS+USD crudo)", () => {
    const shares = distributeSaleByCost({
      legs: [
        { cost: 1000, cost_currency: "USD" },
        { cost: 300000, cost_currency: "ARS" },
      ],
      saleAmountTotal: 1000,
      saleCurrency: "USD",
      // sin exchangeRate → no se pueden comparar monedas distintas
    })
    expect(shares).toEqual([500, 500])
  })

  it("una sola pata se lleva todo el total", () => {
    const shares = distributeSaleByCost({
      legs: [{ cost: 500, cost_currency: "USD" }],
      saleAmountTotal: 1234.56,
      saleCurrency: "USD",
    })
    expect(shares).toEqual([1234.56])
  })

  it("lista vacía devuelve []", () => {
    expect(
      distributeSaleByCost({ legs: [], saleAmountTotal: 1000, saleCurrency: "USD" })
    ).toEqual([])
  })
})
