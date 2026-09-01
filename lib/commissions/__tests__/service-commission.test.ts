/**
 * Tests de la regla de comisión de un servicio.
 *
 * Son funciones puras a propósito: es la única parte de la comisión de servicios
 * que se puede fijar sin una base de datos, y es la que corre en dos rutas
 * distintas (alta y edición del servicio).
 */
import {
  ALL_SERVICE_TYPES,
  DEFAULT_COMMISSION_SERVICE_TYPES,
  DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG,
  parseCommissionServiceTypes,
  serviceCommissionAmount,
  serviceCommissionBase,
  serviceProfit,
  serviceGeneratesCommission,
} from "@/lib/commissions/service-commission"

const DEFAULTS = DEFAULT_SERVICE_COMMISSION_TYPES_CONFIG

describe("serviceGeneratesCommission", () => {
  it("con la config por defecto, comisionan los servicios con margen para la agencia", () => {
    for (const type of ["TRANSFER", "ASSISTANCE", "HOTEL", "FLIGHT", "EXCURSION"]) {
      expect(serviceGeneratesCommission(type, DEFAULTS)).toBe(true)
    }
  })

  it("con la config por defecto no comisionan los cargos administrativos", () => {
    for (const type of ["SEAT", "LUGGAGE", "VISA"]) {
      expect(serviceGeneratesCommission(type, DEFAULTS)).toBe(false)
    }
  })

  it("un tipo desconocido o vacío no comisiona", () => {
    expect(serviceGeneratesCommission(null, DEFAULTS)).toBe(false)
    expect(serviceGeneratesCommission(undefined, DEFAULTS)).toBe(false)
    expect(serviceGeneratesCommission("CUALQUIERA", DEFAULTS)).toBe(false)
  })

  it("una oficina puede hacer comisionar el asiento", () => {
    const config = { types: new Set(["SEAT", "ASSISTANCE"]) }
    expect(serviceGeneratesCommission("SEAT", config)).toBe(true)
    expect(serviceGeneratesCommission("ASSISTANCE", config)).toBe(true)
    // Y deja de comisionar lo que sacó de su lista.
    expect(serviceGeneratesCommission("HOTEL", config)).toBe(false)
  })

  it("sin config cae al set histórico, nunca a 'no comisiona nada'", () => {
    // Es la diferencia que importa: un error de lectura no puede dejar de
    // pagarle a alguien en silencio.
    expect(serviceGeneratesCommission("HOTEL", null)).toBe(true)
    expect(serviceGeneratesCommission("HOTEL", undefined)).toBe(true)
    expect(serviceGeneratesCommission("SEAT", null)).toBe(false)
  })

  /**
   * Candado: recorre el catálogo entero y fija que el default reproduce
   * exactamente el comportamiento anterior a que esto fuera configurable.
   * Si alguien cambia `DEFAULT_COMMISSION_SERVICE_TYPES`, todas las agencias que
   * no configuraron nada cambian de conducta; que se entere acá.
   */
  it("el default reproduce el comportamiento histórico para los 8 tipos", () => {
    const historico: Record<string, boolean> = {
      SEAT: false,
      LUGGAGE: false,
      VISA: false,
      TRANSFER: true,
      ASSISTANCE: true,
      HOTEL: true,
      FLIGHT: true,
      EXCURSION: true,
    }
    expect(ALL_SERVICE_TYPES.length).toBe(Object.keys(historico).length)
    for (const type of ALL_SERVICE_TYPES) {
      expect(serviceGeneratesCommission(type, DEFAULTS)).toBe(historico[type])
    }
    expect(Array.from(DEFAULT_COMMISSION_SERVICE_TYPES).sort()).toEqual(
      ["ASSISTANCE", "EXCURSION", "FLIGHT", "HOTEL", "TRANSFER"]
    )
  })
})

describe("parseCommissionServiceTypes", () => {
  it("normaliza a mayúsculas y descarta lo que no es un tipo conocido", () => {
    const parsed = parseCommissionServiceTypes(["seat", "HOTEL", "INVENTADO", 7, null])
    expect(parsed).not.toBeNull()
    expect(Array.from(parsed!.types).sort()).toEqual(["HOTEL", "SEAT"])
  })

  it("devuelve null si no es un array, para que el caller caiga al default", () => {
    expect(parseCommissionServiceTypes(null)).toBeNull()
    expect(parseCommissionServiceTypes("HOTEL")).toBeNull()
    expect(parseCommissionServiceTypes({ types: ["HOTEL"] })).toBeNull()
  })

  it("un array vacío es una decisión válida: no comisiona ningún servicio", () => {
    const parsed = parseCommissionServiceTypes([])
    expect(parsed).not.toBeNull()
    expect(serviceGeneratesCommission("HOTEL", parsed)).toBe(false)
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

describe("ganancia bruta y neta del servicio (VIB-176)", () => {
  // Hasta acá la comisión del servicio salía de la ganancia BRUTA mientras la
  // del paquete salía de la NETA de IVA: dos criterios distintos conviviendo en
  // la misma operación. Lozada tiene la base neta al 10,5% desde junio.
  const netConfig = { enabled: true, rate: 0.105, from: null }

  const servicio = {
    saleAmount: 1000,
    costAmount: 0,
    saleCurrency: "USD",
    costCurrency: "USD",
    sellerPercentage: 10,
    operationDate: "2026-07-10",
  }

  it("con base neta prendida la comisión sale de la neta, igual que el paquete", () => {
    // Ganancia 1000 → neta 895 → 10% = 89,50 (antes daba 100).
    expect(serviceCommissionAmount({ ...servicio, baseConfig: netConfig })).toBe(89.5)
  })

  it("sin config sigue comisionando sobre la bruta", () => {
    expect(serviceCommissionAmount(servicio)).toBe(100)
  })

  it("respeta el corte por fecha: un servicio anterior va sobre bruta", () => {
    expect(
      serviceCommissionAmount({
        ...servicio,
        operationDate: "2026-01-15",
        baseConfig: { enabled: true, rate: 0.105, from: "2026-06-01" },
      })
    ).toBe(100)
  })

  it("sin fecha de operación NO baja la comisión", () => {
    // Mismo criterio que el paquete: preferimos no bajarle la comisión a
    // alguien por una fecha que no conocemos.
    expect(
      serviceCommissionAmount({
        ...servicio,
        operationDate: null,
        baseConfig: { enabled: true, rate: 0.105, from: "2026-06-01" },
      })
    ).toBe(100)
  })

  it("serviceProfit devuelve las dos ganancias y el IVA descontado", () => {
    expect(serviceProfit({ ...servicio, baseConfig: netConfig })).toEqual({
      bruta: 1000,
      neta: 895,
      iva: 105,
      aplicaIva: true,
    })
  })

  it("sin base neta, bruta y neta son el mismo número", () => {
    expect(serviceProfit(servicio)).toEqual({
      bruta: 1000,
      neta: 1000,
      iva: 0,
      aplicaIva: false,
    })
  })
})
