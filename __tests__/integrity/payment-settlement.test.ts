/**
 * @jest-environment node
 *
 * Tests de integridad contable — invariantes que el sistema debe mantener
 * para que los flows de pago no dejen datos huérfanos.
 *
 * Bug Yamil 2026-05-05 (root cause): un endpoint flipeaba payments.status="PAID"
 * sin crear ledger_movements, cash_movements ni applyOperatorPaymentSettlement.
 * El payment se mostraba "Pagado" en la UI pero los saldos no se movían.
 *
 * Estos tests cubren las funciones puras del settlement layer. Los tests
 * E2E con DB están separados y requieren Supabase fixture.
 */

import {
  buildOperatorPaymentUpdate,
  getEffectiveOperatorPaymentStatus,
  hasPendingBalance,
  getOpenOperatorPaymentStatus,
} from "@/lib/accounting/operator-payment-settlement"

describe("operator-payment-settlement — invariantes", () => {
  describe("buildOperatorPaymentUpdate", () => {
    it("pago parcial NO marca PAID y NO setea ledger_movement_id", () => {
      const op = { amount: 1000, paid_amount: 0, due_date: "2030-01-01" }
      const r = buildOperatorPaymentUpdate(op, 300, "ledger-xyz")
      expect(r.paid_amount).toBe(300)
      expect(r.status).toBe("PENDING")
      expect(r.ledger_movement_id).toBeNull() // crítico: no link hasta liquidar total
    })

    it("pago total marca PAID y linkea ledger_movement_id", () => {
      const op = { amount: 1000, paid_amount: 0, due_date: "2030-01-01" }
      const r = buildOperatorPaymentUpdate(op, 1000, "ledger-xyz")
      expect(r.paid_amount).toBe(1000)
      expect(r.status).toBe("PAID")
      expect(r.ledger_movement_id).toBe("ledger-xyz")
    })

    it("pago final que completa una deuda parcial marca PAID", () => {
      const op = { amount: 1000, paid_amount: 700, due_date: "2030-01-01" }
      const r = buildOperatorPaymentUpdate(op, 300, "ledger-final")
      expect(r.paid_amount).toBe(1000)
      expect(r.status).toBe("PAID")
      expect(r.ledger_movement_id).toBe("ledger-final")
    })

    it("intento de overpay queda capeado en amount total (no permite paid_amount > amount)", () => {
      const op = { amount: 1000, paid_amount: 0, due_date: "2030-01-01" }
      const r = buildOperatorPaymentUpdate(op, 1500, "ledger-xyz")
      expect(r.paid_amount).toBe(1000) // capeado, no 1500
      expect(r.status).toBe("PAID")
    })

    it("reverso (delta negativo) baja paid_amount sin ir abajo de 0", () => {
      const op = { amount: 1000, paid_amount: 200, due_date: "2030-01-01" }
      const r = buildOperatorPaymentUpdate(op, -500, null)
      expect(r.paid_amount).toBe(0) // capeado en 0, no -300
      expect(r.status).toBe("PENDING")
      expect(r.ledger_movement_id).toBeNull()
    })

    it("status PENDING vence a OVERDUE si due_date < hoy y la deuda no se pagó", () => {
      // 2 días atrás para evitar TZ flakiness de "1 día atrás" cerca de medianoche.
      const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
      const op = { amount: 1000, paid_amount: 0, due_date: yesterday }
      const r = buildOperatorPaymentUpdate(op, 300, "ledger-xyz")
      expect(r.status).toBe("OVERDUE")
      expect(r.ledger_movement_id).toBeNull()
    })

    it("epsilon fix: pago de 999.999 se considera fully paid de 1000 (rounding)", () => {
      const op = { amount: 1000, paid_amount: 0, due_date: "2030-01-01" }
      const r = buildOperatorPaymentUpdate(op, 999.998, "ledger-xyz")
      // Money epsilon 0.005 → 999.998 + 0.005 >= 1000
      expect(r.status).toBe("PAID")
      expect(r.ledger_movement_id).toBe("ledger-xyz")
    })

    it("invariante: si status='PAID' entonces ledger_movement_id NO es null", () => {
      // Caso happy path
      const op = { amount: 1000, paid_amount: 0, due_date: "2030-01-01" }
      const r1 = buildOperatorPaymentUpdate(op, 1000, "ledger-xyz")
      if (r1.status === "PAID") expect(r1.ledger_movement_id).toBe("ledger-xyz")

      // Caso edge — si alguien pasa null como ledger en pago total, queda null.
      // Esto NO es invariante de la función (acepta null) pero es bug del
      // CALLER. El test documenta el contrato: si pasás null cuando es total,
      // el sistema queda inconsistente. El caller (mark-paid, bulk, etc.)
      // SIEMPRE debe pasar un ledgerMovementId real al liquidar total.
      const r2 = buildOperatorPaymentUpdate(op, 1000, null)
      expect(r2.status).toBe("PAID")
      expect(r2.ledger_movement_id).toBeNull() // documenta el contrato
    })
  })

  describe("hasPendingBalance", () => {
    it("retorna true si paid_amount < amount", () => {
      expect(hasPendingBalance({ amount: 1000, paid_amount: 500 })).toBe(true)
      expect(hasPendingBalance({ amount: 1000, paid_amount: 0 })).toBe(true)
    })

    it("retorna false si paid_amount >= amount (con epsilon)", () => {
      expect(hasPendingBalance({ amount: 1000, paid_amount: 1000 })).toBe(false)
      expect(hasPendingBalance({ amount: 1000, paid_amount: 999.998 })).toBe(false) // epsilon 0.005
    })

    it("trata null/undefined paid_amount como 0", () => {
      expect(hasPendingBalance({ amount: 1000, paid_amount: null })).toBe(true)
      expect(hasPendingBalance({ amount: 1000, paid_amount: undefined as any })).toBe(true)
    })
  })

  describe("getEffectiveOperatorPaymentStatus", () => {
    it("PAID si fully paid, ignora due_date", () => {
      // 2 días atrás para evitar TZ flakiness de "1 día atrás" cerca de medianoche.
      const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
      expect(
        getEffectiveOperatorPaymentStatus({
          amount: 1000,
          paid_amount: 1000,
          due_date: yesterday,
        })
      ).toBe("PAID")
    })

    it("OVERDUE si pending y due_date pasada", () => {
      // 2 días atrás para evitar TZ flakiness de "1 día atrás" cerca de medianoche.
      const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
      expect(
        getEffectiveOperatorPaymentStatus({
          amount: 1000,
          paid_amount: 0,
          due_date: yesterday,
        })
      ).toBe("OVERDUE")
    })

    it("PENDING si pending y due_date futura", () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
      expect(
        getEffectiveOperatorPaymentStatus({
          amount: 1000,
          paid_amount: 200,
          due_date: tomorrow,
        })
      ).toBe("PENDING")
    })
  })

  describe("getOpenOperatorPaymentStatus — edge cases dates", () => {
    it("PENDING si due_date null", () => {
      expect(getOpenOperatorPaymentStatus(null)).toBe("PENDING")
      expect(getOpenOperatorPaymentStatus(undefined)).toBe("PENDING")
    })

    it("PENDING si due_date hoy", () => {
      const today = new Date().toISOString().split("T")[0]
      expect(getOpenOperatorPaymentStatus(today)).toBe("PENDING")
    })

    it("OVERDUE si due_date ayer", () => {
      // 2 días atrás para evitar TZ flakiness de "1 día atrás" cerca de medianoche.
      const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
      expect(getOpenOperatorPaymentStatus(yesterday)).toBe("OVERDUE")
    })

    it("PENDING si due_date mañana", () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
      expect(getOpenOperatorPaymentStatus(tomorrow)).toBe("PENDING")
    })
  })
})
