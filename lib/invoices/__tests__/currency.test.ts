/**
 * VIB-151 — el tope de facturación tiene que compararse en la moneda de la venta.
 *
 * Caso real de Lozada: venta de USD 8050, el cliente pide la factura en pesos y
 * el sistema respondía "el total vendido restante de la operación es $8050".
 */

import {
  afipMonCotiz,
  checkInvoiceCap,
  getInvoiceSaleCurrency,
  invoiceCurrencyToSupported,
  invoiceTotalInSaleCurrency,
  needsMarketRate,
  sumInvoicedInSaleCurrency,
  type InvoicedRow,
} from "@/lib/invoices/currency"

const FACTURA_B = 6
const NC_B = 8
const ND_B = 7

describe("invoiceCurrencyToSupported", () => {
  it("mapea los códigos AFIP", () => {
    expect(invoiceCurrencyToSupported("PES")).toBe("ARS")
    expect(invoiceCurrencyToSupported("DOL")).toBe("USD")
  })

  it("acepta también los códigos internos", () => {
    expect(invoiceCurrencyToSupported("ARS")).toBe("ARS")
    expect(invoiceCurrencyToSupported("usd")).toBe("USD")
  })

  it("default PES cuando no viene moneda", () => {
    expect(invoiceCurrencyToSupported(null)).toBe("ARS")
    expect(invoiceCurrencyToSupported(undefined)).toBe("ARS")
  })

  it("devuelve null para monedas que el sistema no sabe valuar", () => {
    expect(invoiceCurrencyToSupported("EUR")).toBeNull()
    expect(invoiceCurrencyToSupported("060")).toBeNull()
  })
})

describe("getInvoiceSaleCurrency", () => {
  it("usa sale_currency cuando está", () => {
    expect(getInvoiceSaleCurrency({ sale_currency: "USD" })).toBe("USD")
    expect(getInvoiceSaleCurrency({ sale_currency: "ARS" })).toBe("ARS")
  })

  it("cae a currency si sale_currency no está seteada", () => {
    expect(getInvoiceSaleCurrency({ sale_currency: null, currency: "USD" })).toBe("USD")
  })

  it("sin ninguna moneda declarada asume ARS, no USD", () => {
    // getOperationSaleCurrency devolvería USD acá. En el tope de facturación eso
    // convertiría una operación vieja en pesos y dejaría facturar de más.
    expect(getInvoiceSaleCurrency({})).toBe("ARS")
    expect(getInvoiceSaleCurrency({ sale_currency: null, currency: null })).toBe("ARS")
  })
})

describe("afipMonCotiz", () => {
  it("fuerza 1 en comprobantes en pesos, aunque el alta haya guardado el TC de la venta", () => {
    expect(afipMonCotiz("PES", 1367)).toBe(1)
  })

  it("respeta la cotización en comprobantes en dólares", () => {
    expect(afipMonCotiz("DOL", 1367)).toBe(1367)
  })

  it("cae a 1 si no hay cotización válida", () => {
    expect(afipMonCotiz("DOL", null)).toBe(1)
    expect(afipMonCotiz("DOL", 0)).toBe(1)
  })
})

describe("invoiceTotalInSaleCurrency", () => {
  it("no toca el importe cuando factura y venta comparten moneda", () => {
    expect(
      invoiceTotalInSaleCurrency({ impTotal: 1000, moneda: "PES", saleCurrency: "ARS" })
    ).toBe(1000)
  })

  it("pesos sobre una venta en dólares: divide por el TC", () => {
    expect(
      invoiceTotalInSaleCurrency({
        impTotal: 10_867_500,
        moneda: "PES",
        saleCurrency: "USD",
        exchangeRate: 1350,
      })
    ).toBe(8050)
  })

  it("dólares sobre una venta en pesos: multiplica por el TC", () => {
    expect(
      invoiceTotalInSaleCurrency({
        impTotal: 100,
        moneda: "DOL",
        saleCurrency: "ARS",
        exchangeRate: 1350,
      })
    ).toBe(135_000)
  })

  it("sin TC no inventa un número", () => {
    expect(
      invoiceTotalInSaleCurrency({ impTotal: 10_000, moneda: "PES", saleCurrency: "USD" })
    ).toBeNull()
  })

  it("moneda no soportada devuelve null", () => {
    expect(
      invoiceTotalInSaleCurrency({
        impTotal: 100,
        moneda: "EUR",
        saleCurrency: "ARS",
        exchangeRate: 1350,
      })
    ).toBeNull()
  })
})

describe("needsMarketRate", () => {
  it("una factura en pesos sobre una venta en dólares necesita el TC del día", () => {
    // MonCotiz de un comprobante en PES es 1, así que no sirve para valuar.
    expect(
      needsMarketRate({ imp_total: 1000, cbte_tipo: FACTURA_B, moneda: "PES", cotizacion: 1 }, "USD")
    ).toBe(true)
  })

  it("una factura en dólares se valúa con su propia cotización", () => {
    expect(
      needsMarketRate(
        { imp_total: 100, cbte_tipo: FACTURA_B, moneda: "DOL", cotizacion: 1350 },
        "ARS"
      )
    ).toBe(false)
  })

  it("misma moneda que la venta no necesita nada", () => {
    expect(
      needsMarketRate({ imp_total: 1000, cbte_tipo: FACTURA_B, moneda: "PES", cotizacion: 1 }, "ARS")
    ).toBe(false)
  })
})

describe("sumInvoicedInSaleCurrency", () => {
  const rateFor = () => 1350

  it("suma facturas y resta notas de crédito", () => {
    const invoices: InvoicedRow[] = [
      { imp_total: 1000, cbte_tipo: FACTURA_B, moneda: "PES", cotizacion: 1 },
      { imp_total: 300, cbte_tipo: NC_B, moneda: "PES", cotizacion: 1 },
      { imp_total: 200, cbte_tipo: ND_B, moneda: "PES", cotizacion: 1 },
    ]
    expect(sumInvoicedInSaleCurrency({ invoices, saleCurrency: "ARS", rateFor }).total).toBe(900)
  })

  it("mezcla de monedas sobre una venta en USD: cada factura se valúa por separado", () => {
    const invoices: InvoicedRow[] = [
      // Parcial en pesos: se valúa con el TC del día de emisión.
      {
        imp_total: 1_350_000,
        cbte_tipo: FACTURA_B,
        moneda: "PES",
        cotizacion: 1,
        fecha_emision: "2026-08-20",
      },
      // Parcial en dólares: ya está en la moneda de la venta.
      { imp_total: 2000, cbte_tipo: FACTURA_B, moneda: "DOL", cotizacion: 1350 },
    ]

    const { total, unconverted } = sumInvoicedInSaleCurrency({
      invoices,
      saleCurrency: "USD",
      rateFor,
    })

    // 1.350.000 / 1350 = USD 1000, + USD 2000
    expect(total).toBe(3000)
    expect(unconverted).toHaveLength(0)
  })

  it("una factura en dólares sobre una venta en pesos usa su cotización guardada", () => {
    const invoices: InvoicedRow[] = [
      { imp_total: 100, cbte_tipo: FACTURA_B, moneda: "DOL", cotizacion: 1400 },
    ]
    // Usa 1400 (el TC del comprobante), no el 1350 de referencia.
    expect(sumInvoicedInSaleCurrency({ invoices, saleCurrency: "ARS", rateFor }).total).toBe(140_000)
  })

  it("marca las que no se pueden valuar en vez de sumarlas crudas", () => {
    const invoices: InvoicedRow[] = [
      { imp_total: 1_350_000, cbte_tipo: FACTURA_B, moneda: "PES", cotizacion: 1 },
    ]
    const { total, unconverted } = sumInvoicedInSaleCurrency({
      invoices,
      saleCurrency: "USD",
      rateFor: () => null,
    })

    expect(total).toBe(0)
    expect(unconverted).toHaveLength(1)
  })

  it("moneda desconocida se suma tal cual (filas legacy)", () => {
    const invoices: InvoicedRow[] = [{ imp_total: 500, cbte_tipo: FACTURA_B, moneda: "EUR" }]
    const { total, unconverted } = sumInvoicedInSaleCurrency({
      invoices,
      saleCurrency: "ARS",
      rateFor,
    })
    expect(total).toBe(500)
    expect(unconverted).toHaveLength(0)
  })
})

describe("checkInvoiceCap", () => {
  it("deja facturar en pesos una venta en USD (el bug de Yamil)", () => {
    const saleTotal = 8050 // USD
    const impTotal = 10_867_500 // ARS al TC 1350
    const newTotalInSaleCurrency = invoiceTotalInSaleCurrency({
      impTotal,
      moneda: "PES",
      saleCurrency: "USD",
      exchangeRate: 1350,
    })!

    const cap = checkInvoiceCap({ saleTotal, alreadyInvoiced: 0, newTotalInSaleCurrency })

    expect(cap.ok).toBe(true)
    expect(cap.remaining).toBe(8050)
    // La comparación cruda que hacía la ruta antes rechazaba esto.
    expect(impTotal > saleTotal).toBe(true)
  })

  it("sigue frenando cuando se pasa del total vendido", () => {
    const newTotalInSaleCurrency = invoiceTotalInSaleCurrency({
      impTotal: 13_500_000,
      moneda: "PES",
      saleCurrency: "USD",
      exchangeRate: 1350,
    })! // USD 10.000

    expect(
      checkInvoiceCap({ saleTotal: 8050, alreadyInvoiced: 0, newTotalInSaleCurrency }).ok
    ).toBe(false)
  })

  it("descuenta lo ya facturado", () => {
    const cap = checkInvoiceCap({
      saleTotal: 8050,
      alreadyInvoiced: 3000,
      newTotalInSaleCurrency: 5050,
    })
    expect(cap.ok).toBe(true)
    expect(cap.remaining).toBe(5050)
  })

  it("tolera 1 centavo de redondeo", () => {
    expect(
      checkInvoiceCap({ saleTotal: 1000, alreadyInvoiced: 0, newTotalInSaleCurrency: 1000.01 }).ok
    ).toBe(true)
    expect(
      checkInvoiceCap({ saleTotal: 1000, alreadyInvoiced: 0, newTotalInSaleCurrency: 1000.5 }).ok
    ).toBe(false)
  })
})
