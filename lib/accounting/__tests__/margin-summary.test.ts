/**
 * VIB-151 — el resumen de facturación no puede mezclar monedas.
 *
 * El margen está en la moneda de la venta y cada factura en la suya: una
 * operación en USD con una factura parcial en pesos daba "ya facturada completa"
 * y la UI bloqueaba la segunda factura.
 */

import { calculateMarginSummary } from "@/lib/accounting/margin-summary"

const AUTHORIZED = "authorized"

describe("calculateMarginSummary", () => {
  describe("comportamiento base (sin moneda de venta)", () => {
    it("suma solo las autorizadas", () => {
      const summary = calculateMarginSummary(
        { margin_amount: 10000, customer_id: "c1" },
        [
          { imp_total: 4000, status: AUTHORIZED },
          { imp_total: 3000, status: "draft" },
        ],
        true
      )

      expect(summary.already_invoiced).toBe(4000)
      expect(summary.remaining).toBe(6000)
      expect(summary.can_invoice).toBe(true)
    })

    it("bloquea cuando ya se facturó todo", () => {
      const summary = calculateMarginSummary(
        { margin_amount: 10000, customer_id: "c1" },
        [{ imp_total: 10000, status: AUTHORIZED }],
        true
      )

      expect(summary.remaining).toBe(0)
      expect(summary.reason_disabled).toBe("already_fully_invoiced")
    })

    it("prioriza no_margin, no_customer y no_afip en ese orden", () => {
      expect(
        calculateMarginSummary({ margin_amount: 0, customer_id: "c1" }, [], true).reason_disabled
      ).toBe("no_margin")
      expect(
        calculateMarginSummary({ margin_amount: 100, customer_id: null }, [], true).reason_disabled
      ).toBe("no_customer")
      expect(
        calculateMarginSummary({ margin_amount: 100, customer_id: "c1" }, [], false).reason_disabled
      ).toBe("no_afip")
    })
  })

  describe("venta en USD facturada en pesos", () => {
    const operation = { margin_amount: 2000, customer_id: "c1", sale_currency: "USD" }

    it("valúa la factura en pesos con el TC del día en vez de sumarla cruda", () => {
      const summary = calculateMarginSummary(
        operation,
        [
          {
            imp_total: 1_350_000, // ARS
            status: AUTHORIZED,
            moneda: "PES",
            cotizacion: 1, // MonCotiz de un comprobante en pesos
            fecha_emision: "2026-08-20",
          },
        ],
        true,
        { rateFor: () => 1350 }
      )

      // 1.350.000 / 1350 = USD 1000 sobre un margen de USD 2000
      expect(summary.already_invoiced).toBe(1000)
      expect(summary.remaining).toBe(1000)
      expect(summary.can_invoice).toBe(true)
    })

    it("sin la conversión el margen quedaba consumido (regresión del bug)", () => {
      const summary = calculateMarginSummary(
        operation,
        [{ imp_total: 1_350_000, status: AUTHORIZED, moneda: "PES", cotizacion: 1 }],
        true
        // sin rateFor: no hay TC, se suma crudo como la versión vieja
      )

      expect(summary.remaining).toBe(0)
      expect(summary.reason_disabled).toBe("already_fully_invoiced")
    })

    it("una factura en dólares sobre la misma venta no se toca", () => {
      const summary = calculateMarginSummary(
        operation,
        [{ imp_total: 500, status: AUTHORIZED, moneda: "DOL", cotizacion: 1350 }],
        true,
        { rateFor: () => 1350 }
      )

      expect(summary.already_invoiced).toBe(500)
      expect(summary.remaining).toBe(1500)
    })

    it("mezcla de parciales en las dos monedas", () => {
      const summary = calculateMarginSummary(
        operation,
        [
          { imp_total: 675_000, status: AUTHORIZED, moneda: "PES", cotizacion: 1 },
          { imp_total: 800, status: AUTHORIZED, moneda: "DOL", cotizacion: 1350 },
        ],
        true,
        { rateFor: () => 1350 }
      )

      // 675.000 / 1350 = USD 500, + USD 800
      expect(summary.already_invoiced).toBe(1300)
      expect(summary.remaining).toBe(700)
      expect(summary.can_invoice).toBe(true)
    })
  })

  describe("venta en ARS facturada en dólares", () => {
    it("usa la cotización del comprobante", () => {
      const summary = calculateMarginSummary(
        { margin_amount: 1_000_000, customer_id: "c1", sale_currency: "ARS" },
        [{ imp_total: 500, status: AUTHORIZED, moneda: "DOL", cotizacion: 1400 }],
        true
      )

      expect(summary.already_invoiced).toBe(700_000)
      expect(summary.remaining).toBe(300_000)
    })
  })
})
