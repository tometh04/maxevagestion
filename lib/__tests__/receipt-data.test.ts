import {
  buildReceiptPaymentSummary,
  filterReceiptPaymentsByScope,
  getReceiptPaymentAmountInCurrency,
  getReceiptScope,
} from "@/lib/receipts/receipt-data"

describe("receipt-data helpers", () => {
  describe("getReceiptScope", () => {
    it("uses OPERATION for base payments", () => {
      expect(getReceiptScope(null)).toBe("OPERATION")
    })

    it("uses SERVICE for service payments", () => {
      expect(getReceiptScope("svc-1")).toBe("SERVICE")
    })
  })

  describe("filterReceiptPaymentsByScope", () => {
    const payments = [
      { id: "base-1", operation_service_id: null },
      { id: "svc-1-a", operation_service_id: "svc-1" },
      { id: "svc-1-b", operation_service_id: "svc-1" },
      { id: "svc-2-a", operation_service_id: "svc-2" },
    ]

    it("keeps only base payments for operation receipts", () => {
      expect(filterReceiptPaymentsByScope(payments, null)).toEqual([
        { id: "base-1", operation_service_id: null },
      ])
    })

    it("keeps only payments for the selected service", () => {
      expect(filterReceiptPaymentsByScope(payments, "svc-1")).toEqual([
        { id: "svc-1-a", operation_service_id: "svc-1" },
        { id: "svc-1-b", operation_service_id: "svc-1" },
      ])
    })
  })

  describe("getReceiptPaymentAmountInCurrency", () => {
    it("uses amount_usd for USD receipts when available", () => {
      expect(
        getReceiptPaymentAmountInCurrency(
          {
            id: "p-1",
            amount: 130000,
            currency: "ARS",
            amount_usd: 100,
            exchange_rate: 1300,
          },
          "USD"
        )
      ).toBe(100)
    })

    it("converts USD payments into ARS receipt currency", () => {
      expect(
        getReceiptPaymentAmountInCurrency(
          {
            id: "p-2",
            amount: 100,
            currency: "USD",
            exchange_rate: 1300,
          },
          "ARS"
        )
      ).toBe(130000)
    })
  })

  describe("buildReceiptPaymentSummary", () => {
    it("calculates service totals in the service sale currency", () => {
      const summary = buildReceiptPaymentSummary({
        totalAmount: 150,
        receiptCurrency: "USD",
        payments: [
          {
            id: "p-1",
            amount: 130000,
            currency: "ARS",
            amount_usd: 100,
            exchange_rate: 1300,
            date_paid: "2026-04-08",
            reference: "Transferencia",
            operation_service_id: "svc-1",
          },
          {
            id: "p-2",
            amount: 50,
            currency: "USD",
            amount_usd: 50,
            date_paid: "2026-04-08",
            reference: "Efectivo",
            operation_service_id: "svc-1",
          },
        ],
      })

      expect(summary.totalOperacion).toBe(150)
      expect(summary.totalPagado).toBe(150)
      expect(summary.saldoRestante).toBe(0)
      expect(summary.paymentHistory).toEqual([
        expect.objectContaining({ id: "p-1", amountInReceiptCurrency: 100 }),
        expect.objectContaining({ id: "p-2", amountInReceiptCurrency: 50 }),
      ])
    })
  })
})
