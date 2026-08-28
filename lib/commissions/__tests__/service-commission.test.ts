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

// ==================================================================
// La comisión se expresa en la moneda de la OPERACIÓN.
//
// `commission_records` no tiene columna de moneda: el importe se lee asumiendo
// la de la operación, en unos treinta lugares. Un servicio cargado en otra
// moneda producía un importe en pesos que después se leía como dólares.
//
// Caso real (Lozada, OP-20260810-9A7235EE): operación en USD, transfer en
// pesos con $159.000 de margen, vendedora al 13%. Se guardaba 20.670 y el
// sistema mostraba que le debían USD 20.670.
// ==================================================================
describe("serviceCommissionAmount — moneda de la operación", () => {
  const transferEnPesos = {
    saleAmount: 300000,
    costAmount: 141000,
    saleCurrency: "ARS",
    costCurrency: "ARS",
    sellerPercentage: 13,
  }

  it("convierte la comisión de un servicio en pesos sobre una operación en USD", () => {
    // Margen $159.000 × 13% = $20.670 → a USD 1510 = 13,69.
    const amount = serviceCommissionAmount({
      ...transferEnPesos,
      operationCurrency: "USD",
      exchangeRate: 1510,
    })
    expect(amount).toBeCloseTo(13.69, 2)
  })

  it("el caso de Lozada deja de valer 20.670 dólares", () => {
    // La regresión concreta: sin convertir daba 20.670, que leído como USD es
    // más de 300 veces el margen de toda la operación.
    const amount = serviceCommissionAmount({
      ...transferEnPesos,
      operationCurrency: "USD",
      exchangeRate: 1510,
    })
    expect(amount!).toBeLessThan(100)
  })

  it("convierte al revés: servicio en USD sobre operación en pesos", () => {
    const amount = serviceCommissionAmount({
      saleAmount: 1000,
      costAmount: 800,
      saleCurrency: "USD",
      costCurrency: "USD",
      sellerPercentage: 10,
      operationCurrency: "ARS",
      exchangeRate: 1500,
    })
    // Margen USD 200 × 10% = USD 20 → $30.000.
    expect(amount).toBe(30000)
  })

  it("no convierte nada si el servicio ya está en la moneda de la operación", () => {
    const amount = serviceCommissionAmount({
      ...transferEnPesos,
      operationCurrency: "ARS",
      // El TC no debería usarse; si se usara, el número cambiaría.
      exchangeRate: 1510,
    })
    expect(amount).toBe(20670)
  })

  it("devuelve null —no 0— si hace falta convertir y no hay tipo de cambio", () => {
    // 0 significaría "no corresponde comisión" y la fila se borraría. null
    // significa "no se pudo calcular", que es otra cosa y el caller la maneja.
    expect(
      serviceCommissionAmount({ ...transferEnPesos, operationCurrency: "USD", exchangeRate: null })
    ).toBeNull()
    expect(
      serviceCommissionAmount({ ...transferEnPesos, operationCurrency: "USD", exchangeRate: 0 })
    ).toBeNull()
  })

  it("sin moneda de operación mantiene el comportamiento viejo", () => {
    // Compatibilidad: los callers que todavía no la pasan siguen igual.
    expect(serviceCommissionAmount(transferEnPesos)).toBe(20670)
  })

  it("un servicio a pérdida sigue dando 0 aunque haya que convertir", () => {
    // El corte por margen negativo va antes que la conversión: no tiene sentido
    // pedir tipo de cambio para algo que no comisiona.
    expect(
      serviceCommissionAmount({
        ...transferEnPesos,
        saleAmount: 100000,
        costAmount: 141000,
        operationCurrency: "USD",
        exchangeRate: null,
      })
    ).toBe(0)
  })
})
