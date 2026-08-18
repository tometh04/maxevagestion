/**
 * Tests de la regla de comisión de un servicio.
 *
 * Son funciones puras a propósito: es la única parte de la comisión de servicios
 * que se puede fijar sin una base de datos, y es la que corre en dos rutas
 * distintas (alta y edición del servicio).
 */

import {
  serviceCommissionAmount,
  serviceCommissionBase,
  serviceGeneratesCommission,
} from "@/lib/commissions/service-commission"

describe("serviceGeneratesCommission", () => {
  it("comisionan los servicios con margen para la agencia", () => {
    for (const type of ["TRANSFER", "ASSISTANCE", "HOTEL", "FLIGHT", "EXCURSION"]) {
      expect(serviceGeneratesCommission(type)).toBe(true)
    }
  })

  it("no comisionan los cargos administrativos que se trasladan al pasajero", () => {
    for (const type of ["SEAT", "LUGGAGE", "VISA"]) {
      expect(serviceGeneratesCommission(type)).toBe(false)
    }
  })

  it("un tipo desconocido o vacío no comisiona", () => {
    expect(serviceGeneratesCommission(null)).toBe(false)
    expect(serviceGeneratesCommission(undefined)).toBe(false)
    expect(serviceGeneratesCommission("CUALQUIERA")).toBe(false)
  })
})

describe("serviceCommissionBase", () => {
  it("con la misma moneda, la base es el margen", () => {
    expect(
      serviceCommissionBase({
        saleAmount: 1000,
        costAmount: 600,
        saleCurrency: "USD",
        costCurrency: "USD",
      })
    ).toBe(400)
  })

  it("con monedas distintas comisiona sobre la venta, no sobre un margen inventado", () => {
    // Restar un costo en otra moneda daría un número sin sentido económico: acá
    // no hay tipo de cambio confiable.
    expect(
      serviceCommissionBase({
        saleAmount: 1000,
        costAmount: 600,
        saleCurrency: "USD",
        costCurrency: "ARS",
      })
    ).toBe(1000)
  })
})

describe("serviceCommissionAmount", () => {
  const base = {
    saleAmount: 1000,
    costAmount: 600,
    saleCurrency: "USD",
    costCurrency: "USD",
  }

  it("aplica el porcentaje del vendedor del servicio sobre el margen", () => {
    expect(serviceCommissionAmount({ ...base, sellerPercentage: 10 })).toBe(40)
  })

  it("redondea a centavos", () => {
    expect(
      serviceCommissionAmount({ ...base, saleAmount: 1000, costAmount: 667, sellerPercentage: 10.5 })
    ).toBe(34.97)
  })

  it("un servicio vendido a pérdida no genera comisión negativa", () => {
    // Descontarle plata al vendedor por una decisión comercial de la agencia
    // sería cobrarle a él un quebranto que no decidió.
    expect(serviceCommissionAmount({ ...base, saleAmount: 500, sellerPercentage: 10 })).toBe(0)
  })

  it("sin porcentaje configurado no hay comisión", () => {
    expect(serviceCommissionAmount({ ...base, sellerPercentage: 0 })).toBe(0)
  })
})
