/**
 * VIB-157 — el badge "Facturado / Parcial / No facturado" del listado y el % que
 * lo acompaña. Mismo criterio de corte que el resumen del detalle y que el tope
 * del servidor: contra la venta total, con 1 centavo de tolerancia.
 */

import {
  invoiceStatusFor,
  invoicedPctFor,
} from "@/lib/operations/invoiced-by-operation"

describe("invoiceStatusFor", () => {
  it("marca no facturado cuando no hay comprobantes", () => {
    expect(invoiceStatusFor(0, 10000)).toBe("NOT_INVOICED")
  })

  it("marca parcial con la seña facturada", () => {
    expect(invoiceStatusFor(2000, 10000)).toBe("PARTIAL")
  })

  it("marca facturado al cubrir la venta", () => {
    expect(invoiceStatusFor(10000, 10000)).toBe("INVOICED")
  })

  it("tolera 1 centavo para no dejar una op completa como parcial", () => {
    expect(invoiceStatusFor(9999.995, 10000)).toBe("INVOICED")
  })

  it("una NC que deja el neto en cero vuelve a no facturado", () => {
    expect(invoiceStatusFor(0, 10000)).toBe("NOT_INVOICED")
  })

  it("facturar de más sigue contando como facturado", () => {
    expect(invoiceStatusFor(12000, 10000)).toBe("INVOICED")
  })
})

describe("invoicedPctFor", () => {
  it("devuelve el porcentaje de la venta con un decimal", () => {
    expect(invoicedPctFor(2500, 10000)).toBe(25)
    expect(invoicedPctFor(3333, 10000)).toBe(33.3)
  })

  it("no pasa de 100 aunque se haya facturado de más", () => {
    expect(invoicedPctFor(12000, 10000)).toBe(100)
  })

  it("sin venta cargada no inventa un porcentaje", () => {
    expect(invoicedPctFor(5000, 0)).toBe(0)
  })

  it("un neto negativo por notas de crédito no da porcentaje negativo", () => {
    expect(invoicedPctFor(-500, 10000)).toBe(0)
  })
})
