/**
 * El bug que cubre este test: las comisiones del trimestre se sumaban ARS + USD
 * en un solo número y se restaban únicamente del resultado en dólares, así que
 * las comisiones en pesos achicaban la provisión en USD y el resultado en ARS no
 * descontaba ninguna comisión. Ver `lib/accounting/ganancias-calc.ts`.
 */
import {
  computeGananciasResult,
  type GananciasCalcInput,
} from "@/lib/accounting/ganancias-calc"

const base: GananciasCalcInput = {
  margin: { ars: 0, usd: 0 },
  deductibleExpenses: { ars: 0, usd: 0 },
  totalExpenses: { ars: 0, usd: 0 },
  commissions: { ars: 0, usd: 0 },
  withholdings: { ars: 0, usd: 0 },
  ratePercent: 35,
}

describe("computeGananciasResult — cada moneda contra la suya", () => {
  it("las comisiones en pesos NO tocan el resultado en dólares", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 1_000_000, usd: 10_000 },
      commissions: { ars: 400_000, usd: 0 },
    })

    // El bug viejo dejaba usd = 10.000 − 400.000 = −390.000 y ars = 1.000.000.
    expect(r.taxableResult.usd).toBe(10_000)
    expect(r.taxableResult.ars).toBe(600_000)
  })

  it("las comisiones en dólares NO tocan el resultado en pesos", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 1_000_000, usd: 10_000 },
      commissions: { ars: 0, usd: 2_500 },
    })

    expect(r.taxableResult.usd).toBe(7_500)
    expect(r.taxableResult.ars).toBe(1_000_000)
  })

  it("el resultado impositivo descuenta solo los gastos deducibles", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 1_000_000, usd: 10_000 },
      deductibleExpenses: { ars: 200_000, usd: 1_000 },
      totalExpenses: { ars: 350_000, usd: 4_000 },
      commissions: { ars: 100_000, usd: 500 },
    })

    // Impositivo: margen − deducibles − comisiones.
    expect(r.taxableResult).toEqual({ ars: 700_000, usd: 8_500 })
    // Contable: margen − TODOS los gastos − comisiones.
    expect(r.profitBeforeTax).toEqual({ ars: 550_000, usd: 5_500 })
  })

  it("aplica la alícuota por separado en cada moneda", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 1_000_000, usd: 10_000 },
      commissions: { ars: 200_000, usd: 2_000 },
      ratePercent: 35,
    })

    expect(r.provision.ars).toBe(280_000) // 800.000 × 0,35
    expect(r.provision.usd).toBe(2_800) // 8.000 × 0,35
  })

  it("una retención en dólares no baja la provisión en pesos", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 1_000_000, usd: 10_000 },
      withholdings: { ars: 0, usd: 1_000 },
    })

    expect(r.provisionNet.ars).toBe(350_000) // intacta
    expect(r.provisionNet.usd).toBe(2_500) // 3.500 − 1.000
  })

  it("una base imponible negativa no genera provisión", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 100_000, usd: 0 },
      deductibleExpenses: { ars: 500_000, usd: 0 },
    })

    expect(r.taxableResult.ars).toBe(-400_000) // el quebranto se informa
    expect(r.provision.ars).toBe(0) // pero no genera impuesto
    expect(r.provisionNet.ars).toBe(0)
  })

  it("una retención mayor a la provisión no genera saldo a favor acá", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 100_000, usd: 0 },
      withholdings: { ars: 999_999, usd: 0 },
    })

    expect(r.provision.ars).toBe(35_000)
    expect(r.provisionNet.ars).toBe(0)
  })

  it("redondea a centavos", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 0, usd: 1_000.555 },
      ratePercent: 33.33,
    })

    expect(r.taxableResult.usd).toBe(1_000.56)
    expect(r.provision.usd).toBe(333.49)
  })

  it("con todo en cero devuelve cero, sin NaN", () => {
    const r = computeGananciasResult(base)
    expect(r).toEqual({
      taxableResult: { ars: 0, usd: 0 },
      profitBeforeTax: { ars: 0, usd: 0 },
      provision: { ars: 0, usd: 0 },
      provisionNet: { ars: 0, usd: 0 },
    })
  })

  it("tolera importes ausentes sin propagar NaN", () => {
    const r = computeGananciasResult({
      ...base,
      margin: { ars: 1_000 } as any,
      commissions: undefined as any,
    })
    expect(r.taxableResult).toEqual({ ars: 1_000, usd: 0 })
    expect(Number.isNaN(r.provision.usd)).toBe(false)
  })
})
