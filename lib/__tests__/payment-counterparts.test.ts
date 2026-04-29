import {
  appendPaymentCounterpartMarker,
  buildPaymentCounterpartMarker,
  getPaymentCounterpartAccountCode,
  mapPaymentMethodToLedgerMethod,
  selectBestCounterpartMovement,
} from "../accounting/payment-counterparts"

describe("payment-counterparts helpers", () => {
  describe("mapPaymentMethodToLedgerMethod", () => {
    it("maps known payment methods to ledger methods", () => {
      expect(mapPaymentMethodToLedgerMethod("Efectivo")).toBe("CASH")
      expect(mapPaymentMethodToLedgerMethod("Transferencia")).toBe("BANK")
      expect(mapPaymentMethodToLedgerMethod("MercadoPago")).toBe("MP")
      expect(mapPaymentMethodToLedgerMethod("Mercado Pago")).toBe("MP")
    })

    it("falls back to OTHER for unknown methods", () => {
      expect(mapPaymentMethodToLedgerMethod("Cheque")).toBe("OTHER")
      expect(mapPaymentMethodToLedgerMethod(undefined)).toBe("OTHER")
    })
  })

  describe("getPaymentCounterpartAccountCode", () => {
    it("returns accounts receivable for customer income", () => {
      expect(getPaymentCounterpartAccountCode("INCOME", "CUSTOMER")).toBe("1.1.03")
    })

    it("returns accounts payable for operator payments", () => {
      expect(getPaymentCounterpartAccountCode("EXPENSE", "OPERATOR")).toBe("2.1.01")
    })

    it("returns null when no counterpart applies", () => {
      expect(getPaymentCounterpartAccountCode("EXPENSE", "CUSTOMER")).toBeNull()
    })
  })

  describe("marker helpers", () => {
    it("builds and appends a deterministic marker", () => {
      expect(buildPaymentCounterpartMarker("pay-123")).toBe("counterpart_payment_id=pay-123")
      expect(appendPaymentCounterpartMarker("Pago recibido", "pay-123")).toContain("counterpart_payment_id=pay-123")
    })

    it("keeps the base note when no payment id is provided", () => {
      expect(appendPaymentCounterpartMarker("Pago recibido")).toBe("Pago recibido")
    })
  })

  describe("selectBestCounterpartMovement", () => {
    it("prioritizes marker matches", () => {
      const selected = selectBestCounterpartMovement(
        [
          {
            id: "old",
            account_id: "acc-1",
            notes: "Pago recibido",
            created_at: "2026-04-07T10:00:00.000Z",
          },
          {
            id: "tagged",
            account_id: "acc-1",
            notes: "Pago recibido [counterpart_payment_id=pay-1]",
            created_at: "2026-04-07T09:00:00.000Z",
          },
        ],
        { paymentId: "pay-1", reference: null, datePaid: "2026-04-07" }
      )

      expect(selected?.id).toBe("tagged")
    })

    it("uses reference and movement date when there is no marker", () => {
      const selected = selectBestCounterpartMovement(
        [
          {
            id: "older",
            account_id: "acc-1",
            notes: "Pago recibido: referencia vieja",
            movement_date: "2026-04-06T12:00:00.000Z",
            created_at: "2026-04-06T12:00:00.000Z",
          },
          {
            id: "best",
            account_id: "acc-1",
            notes: "Pago recibido: comprobante 8899",
            movement_date: "2026-04-07T12:00:00.000Z",
            created_at: "2026-04-07T12:00:00.000Z",
          },
        ],
        { paymentId: null, reference: "8899", datePaid: "2026-04-07" }
      )

      expect(selected?.id).toBe("best")
    })

    it("falls back to the newest candidate when there are no hints", () => {
      const selected = selectBestCounterpartMovement(
        [
          {
            id: "older",
            account_id: "acc-1",
            created_at: "2026-04-05T12:00:00.000Z",
          },
          {
            id: "newer",
            account_id: "acc-1",
            created_at: "2026-04-07T12:00:00.000Z",
          },
        ],
        { paymentId: null, reference: null, datePaid: null }
      )

      expect(selected?.id).toBe("newer")
    })
  })
})
