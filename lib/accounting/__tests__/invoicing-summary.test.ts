/**
 * VIB-157 — el resumen de facturación se mide contra la VENTA TOTAL.
 *
 * Antes se medía contra el margen, así que facturar la seña de un paquete
 * consumía el margen entero y la operación quedaba "ya facturada completa"
 * aunque faltara la mayor parte del paquete.
 *
 * VIB-151 — tampoco puede mezclar monedas: la venta está en la moneda de la
 * operación y cada factura en la suya.
 */

import { calculateInvoicingSummary } from "@/lib/accounting/invoicing-summary"

const AUTHORIZED = "authorized"
const FACTURA_B = 6
const NC_B = 8

describe("calculateInvoicingSummary", () => {
  describe("base = venta total", () => {
    it("suma solo las autorizadas", () => {
      const summary = calculateInvoicingSummary(
        { sale_amount_total: 10000, customer_id: "c1" },
        [
          { imp_total: 4000, cbte_tipo: FACTURA_B, status: AUTHORIZED },
          { imp_total: 3000, cbte_tipo: FACTURA_B, status: "draft" },
          { imp_total: 2000, cbte_tipo: FACTURA_B, status: "pending" },
          { imp_total: 1000, cbte_tipo: FACTURA_B, status: "rejected" },
        ],
        true
      )

      expect(summary.already_invoiced).toBe(4000)
      expect(summary.remaining).toBe(6000)
      expect(summary.can_invoice).toBe(true)
    })

    it("la seña no bloquea el saldo: es el bug que reportó la agencia", () => {
      // Paquete de USD 5.000 con margen de USD 500. Facturan la seña de USD 1.000.
      const summary = calculateInvoicingSummary(
        { sale_amount_total: 5000, customer_id: "c1", sale_currency: "USD" },
        [{ imp_total: 1000, cbte_tipo: FACTURA_B, status: AUTHORIZED, moneda: "DOL" }],
        true
      )

      expect(summary.already_invoiced).toBe(1000)
      expect(summary.remaining).toBe(4000)
      expect(summary.invoiced_pct).toBe(20)
      expect(summary.remaining_pct).toBe(80)
      expect(summary.can_invoice).toBe(true)
      expect(summary.reason_disabled).toBeNull()
    })

    it("bloquea cuando ya se facturó toda la venta", () => {
      const summary = calculateInvoicingSummary(
        { sale_amount_total: 10000, customer_id: "c1" },
        [{ imp_total: 10000, cbte_tipo: FACTURA_B, status: AUTHORIZED }],
        true
      )

      expect(summary.remaining).toBe(0)
      expect(summary.invoiced_pct).toBe(100)
      expect(summary.remaining_pct).toBe(0)
      expect(summary.reason_disabled).toBe("already_fully_invoiced")
    })

    it("una operación sin margen (costo >= venta) sigue siendo facturable", () => {
      // El tope del servidor nunca miró el margen: solo la venta.
      const summary = calculateInvoicingSummary(
        { sale_amount_total: 8000, customer_id: "c1" },
        [],
        true
      )

      expect(summary.can_invoice).toBe(true)
      expect(summary.remaining).toBe(8000)
    })

    it("prioriza no_sale_amount, no_customer y no_afip en ese orden", () => {
      expect(
        calculateInvoicingSummary({ sale_amount_total: 0, customer_id: "c1" }, [], true)
          .reason_disabled
      ).toBe("no_sale_amount")
      expect(
        calculateInvoicingSummary({ sale_amount_total: 100, customer_id: null }, [], true)
          .reason_disabled
      ).toBe("no_customer")
      expect(
        calculateInvoicingSummary({ sale_amount_total: 100, customer_id: "c1" }, [], false)
          .reason_disabled
      ).toBe("no_afip")
    })

    it("netea las notas de crédito", () => {
      const summary = calculateInvoicingSummary(
        { sale_amount_total: 10000, customer_id: "c1" },
        [
          { imp_total: 6000, cbte_tipo: FACTURA_B, status: AUTHORIZED },
          { imp_total: 2000, cbte_tipo: NC_B, status: AUTHORIZED },
        ],
        true
      )

      expect(summary.already_invoiced).toBe(4000)
      expect(summary.remaining).toBe(6000)
      expect(summary.invoiced_pct).toBe(40)
    })

    it("una NC mayor que lo facturado no deja un facturado negativo", () => {
      const summary = calculateInvoicingSummary(
        { sale_amount_total: 10000, customer_id: "c1" },
        [
          { imp_total: 1000, cbte_tipo: FACTURA_B, status: AUTHORIZED },
          { imp_total: 3000, cbte_tipo: NC_B, status: AUTHORIZED },
        ],
        true
      )

      expect(summary.already_invoiced).toBe(0)
      expect(summary.remaining).toBe(10000)
      expect(summary.invoiced_pct).toBe(0)
    })

    it("no deja restos negativos por ruido de punto flotante", () => {
      const summary = calculateInvoicingSummary(
        { sale_amount_total: 20000, customer_id: "c1" },
        [{ imp_total: 19999.99, cbte_tipo: FACTURA_B, status: AUTHORIZED }],
        true
      )

      expect(summary.remaining).toBeCloseTo(0.01, 2)
      expect(summary.can_invoice).toBe(true)
    })
  })

  describe("venta en USD facturada en pesos", () => {
    const operation = { sale_amount_total: 2000, customer_id: "c1", sale_currency: "USD" }

    it("valúa la factura en pesos con el TC del día en vez de sumarla cruda", () => {
      const summary = calculateInvoicingSummary(
        operation,
        [
          {
            imp_total: 1_350_000, // ARS
            cbte_tipo: FACTURA_B,
            status: AUTHORIZED,
            moneda: "PES",
            cotizacion: 1, // MonCotiz de un comprobante en pesos
            fecha_emision: "2026-08-20",
          },
        ],
        true,
        { rateFor: () => 1350 }
      )

      // 1.350.000 / 1350 = USD 1000 sobre una venta de USD 2000
      expect(summary.already_invoiced).toBe(1000)
      expect(summary.remaining).toBe(1000)
      expect(summary.invoiced_pct).toBe(50)
      expect(summary.can_invoice).toBe(true)
    })

    it("sin TC la factura no se cuenta y queda avisada en unconverted_count", () => {
      const summary = calculateInvoicingSummary(
        operation,
        [
          {
            imp_total: 1_350_000,
            cbte_tipo: FACTURA_B,
            status: AUTHORIZED,
            moneda: "PES",
            cotizacion: 1,
          },
        ],
        true
        // sin rateFor: no hay con qué valuarla
      )

      expect(summary.already_invoiced).toBe(0)
      expect(summary.unconverted_count).toBe(1)
      expect(summary.can_invoice).toBe(true)
    })

    it("una factura en dólares sobre la misma venta no se toca", () => {
      const summary = calculateInvoicingSummary(
        operation,
        [
          {
            imp_total: 500,
            cbte_tipo: FACTURA_B,
            status: AUTHORIZED,
            moneda: "DOL",
            cotizacion: 1350,
          },
        ],
        true,
        { rateFor: () => 1350 }
      )

      expect(summary.already_invoiced).toBe(500)
      expect(summary.remaining).toBe(1500)
      expect(summary.invoiced_pct).toBe(25)
    })

    it("mezcla de parciales en las dos monedas", () => {
      const summary = calculateInvoicingSummary(
        operation,
        [
          {
            imp_total: 675_000,
            cbte_tipo: FACTURA_B,
            status: AUTHORIZED,
            moneda: "PES",
            cotizacion: 1,
          },
          {
            imp_total: 800,
            cbte_tipo: FACTURA_B,
            status: AUTHORIZED,
            moneda: "DOL",
            cotizacion: 1350,
          },
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
      const summary = calculateInvoicingSummary(
        { sale_amount_total: 1_000_000, customer_id: "c1", sale_currency: "ARS" },
        [
          {
            imp_total: 500,
            cbte_tipo: FACTURA_B,
            status: AUTHORIZED,
            moneda: "DOL",
            cotizacion: 1400,
          },
        ],
        true
      )

      expect(summary.already_invoiced).toBe(700_000)
      expect(summary.remaining).toBe(300_000)
      expect(summary.invoiced_pct).toBe(70)
    })
  })
})
