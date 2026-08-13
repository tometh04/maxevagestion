/**
 * Tests de la moneda de las comisiones.
 *
 * Regresión concreta: la tarjeta "Mis Comisiones" del dashboard del vendedor y
 * el resumen mensual de la pantalla de Comisiones sumaban `amount` de todas las
 * comisiones sin mirar la moneda, y mostraban el resultado con "$". Un vendedor
 * con comisiones en pesos y en dólares veía las dos sumadas como si fueran
 * pesos.
 */

import {
  getCommissionCurrency,
  isEmptyBucket,
  sumByCurrency,
  totalsByCurrency,
} from "@/lib/commissions/currency"

function commission(
  amount: number,
  currency: string | null,
  status: "PENDING" | "PAID" = "PENDING"
) {
  return {
    amount,
    status,
    operation: currency ? { currency, sale_currency: currency } : null,
  }
}

describe("getCommissionCurrency", () => {
  it("toma la moneda de la operación", () => {
    expect(getCommissionCurrency(commission(100, "ARS"))).toBe("ARS")
    expect(getCommissionCurrency(commission(100, "USD"))).toBe("USD")
  })

  it("cae a USD cuando la operación no dice nada", () => {
    expect(getCommissionCurrency(commission(100, null))).toBe("USD")
    expect(getCommissionCurrency({ amount: 1 })).toBe("USD")
  })

  it("usa sale_currency si currency no está", () => {
    expect(
      getCommissionCurrency({ amount: 1, operation: { currency: null, sale_currency: "ARS" } })
    ).toBe("ARS")
  })

  it("cualquier cosa que no sea ARS se trata como USD", () => {
    expect(getCommissionCurrency(commission(100, "EUR"))).toBe("USD")
  })
})

describe("sumByCurrency", () => {
  it("no suma pesos con dólares", () => {
    const totals = sumByCurrency([
      commission(1000, "ARS"),
      commission(500, "ARS"),
      commission(80, "USD"),
    ])

    expect(totals).toEqual({ ARS: 1500, USD: 80 })
    // El bug original daba 1580 en un solo número.
    expect(totals.ARS + totals.USD).not.toBe(1500)
  })

  it("devuelve ceros sin comisiones", () => {
    expect(sumByCurrency([])).toEqual({ ARS: 0, USD: 0 })
  })
})

describe("totalsByCurrency", () => {
  it("separa pendiente y pagado dentro de cada moneda", () => {
    const totals = totalsByCurrency([
      commission(1000, "ARS", "PENDING"),
      commission(300, "ARS", "PAID"),
      commission(80, "USD", "PAID"),
      commission(20, "USD", "PENDING"),
    ])

    expect(totals.ARS).toEqual({ pending: 1000, paid: 300, total: 1300, count: 2 })
    expect(totals.USD).toEqual({ pending: 20, paid: 80, total: 100, count: 2 })
  })

  it("dentro de cada moneda, pendiente + pagado da el total", () => {
    const totals = totalsByCurrency([
      commission(700, "ARS", "PENDING"),
      commission(300, "ARS", "PAID"),
    ])
    expect(totals.ARS.pending + totals.ARS.paid).toBe(totals.ARS.total)
  })

  it("cualquier estado que no sea PAID cuenta como pendiente", () => {
    const totals = totalsByCurrency([
      { amount: 50, status: "OVERDUE", operation: { currency: "ARS" } } as any,
    ])
    expect(totals.ARS.pending).toBe(50)
    expect(totals.ARS.paid).toBe(0)
  })

  it("marca como vacía la moneda sin comisiones, para no mostrarla", () => {
    const totals = totalsByCurrency([commission(100, "ARS")])
    expect(isEmptyBucket(totals.USD)).toBe(true)
    expect(isEmptyBucket(totals.ARS)).toBe(false)
  })
})
