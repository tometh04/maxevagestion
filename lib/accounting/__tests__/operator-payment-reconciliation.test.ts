import {
  classifyReconciliation,
  type ReconcileInput,
  type ExistingOperatorPayment,
  type ReconcileAction,
} from "@/lib/accounting/operator-payment-reconciliation"

// ─── Builders ─────────────────────────────────────────────────────────────────

let seq = 0
function pay(p: Partial<ExistingOperatorPayment> & { operatorId: string }): ExistingOperatorPayment {
  seq += 1
  return {
    id: p.id ?? `pay-${seq}`,
    operatorId: p.operatorId,
    amount: p.amount ?? 0,
    paidAmount: p.paidAmount ?? 0,
    currency: p.currency ?? "USD",
    status: p.status ?? "PENDING",
    dueDate: p.dueDate ?? "2999-01-01", // futuro → PENDING
    ledgerMovementId: p.ledgerMovementId ?? null,
    createdAt: p.createdAt ?? `2026-01-0${(seq % 9) + 1}`,
  }
}

function input(over: Partial<ReconcileInput>): ReconcileInput {
  return {
    baseOperators: over.baseOperators ?? [],
    hasOperationOperators: over.hasOperationOperators ?? true,
    services: over.services ?? [],
    existingPayments: over.existingPayments ?? [],
    defaultDueDate: over.defaultDueDate ?? "2026-12-31",
  }
}

const kinds = (a: ReconcileAction[]) => a.map((x) => `${x.scope}:${x.kind}`).sort()

// ─── BASE ──────────────────────────────────────────────────────────────────────

describe("classifyReconciliation — BASE", () => {
  test("MISSING: operador sin operator_payment → crear", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "USD" }],
    }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ kind: "MISSING", scope: "BASE", operatorId: "op1", createCost: 100 })
  })

  test("OK: amount == cost → sin acciones", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "USD" }],
      existingPayments: [pay({ operatorId: "op1", amount: 100 })],
    }))
    expect(a).toHaveLength(0)
  })

  test("UNDER: cost > amount, abierto → subir amount", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "USD" }],
      existingPayments: [pay({ operatorId: "op1", amount: 80, paidAmount: 0 })],
    }))
    expect(a[0]).toMatchObject({ kind: "UNDER", newAmount: 100, newStatus: "PENDING", clearLedger: true })
  })

  test("REOPEN: PAID y el costo subió → reabrir por la diferencia", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 80, currency: "USD" }],
      existingPayments: [pay({ operatorId: "op1", amount: 60, paidAmount: 60, status: "PAID", ledgerMovementId: "L1" })],
    }))
    expect(a[0]).toMatchObject({ kind: "REOPEN", newAmount: 80, clearLedger: true })
  })

  test("PAID y el costo bajó → BLOCKED (conserva, drift histórico)", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 80, currency: "USD" }],
      existingPayments: [pay({ operatorId: "op1", amount: 100, paidAmount: 100, status: "PAID" })],
    }))
    expect(a[0]).toMatchObject({ kind: "BLOCKED" })
    expect(a[0].detail).toMatch(/no aumentó/)
  })

  test("OVER_SAFE: cost < amount y paid <= cost → bajar amount", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 80, currency: "USD" }],
      existingPayments: [pay({ operatorId: "op1", amount: 100, paidAmount: 0 })],
    }))
    expect(a[0]).toMatchObject({ kind: "OVER_SAFE", newAmount: 80 })
  })

  test("BLOCKED: cost < paid_amount (rompería balance)", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 80, currency: "USD" }],
      existingPayments: [pay({ operatorId: "op1", amount: 100, paidAmount: 90 })],
    }))
    expect(a[0]).toMatchObject({ kind: "BLOCKED" })
    expect(a[0].detail).toMatch(/paid_amount/)
  })

  test("GHOST: operador fuera de la liquidación, sin pagos → borrar", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "USD" }],
      existingPayments: [
        pay({ operatorId: "op1", amount: 100 }),
        pay({ id: "ghost", operatorId: "op2", amount: 50, paidAmount: 0 }),
      ],
    }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ kind: "GHOST", scope: "BASE", payId: "ghost" })
  })

  test("BLOCKED-ghost: operador fuera de la liquidación pero con pagos", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "USD" }],
      existingPayments: [
        pay({ operatorId: "op1", amount: 100 }),
        pay({ id: "g2", operatorId: "op2", amount: 50, paidAmount: 50, status: "PAID" }),
      ],
    }))
    const ghostAction = a.find((x) => x.payId === "g2")
    expect(ghostAction).toMatchObject({ kind: "BLOCKED" })
  })

  test("operador duplicado N>M: matchea por conteo, crea el faltante", () => {
    const a = classifyReconciliation(input({
      baseOperators: [
        { operatorId: "op1", cost: 100, currency: "USD" },
        { operatorId: "op1", cost: 200, currency: "USD" },
      ],
      existingPayments: [pay({ operatorId: "op1", amount: 100 })],
    }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ kind: "MISSING", createCost: 200 })
  })

  test("solo cambió la moneda → sincroniza currency", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "ARS" }],
      existingPayments: [pay({ operatorId: "op1", amount: 100, currency: "USD" })],
    }))
    expect(a[0]).toMatchObject({ kind: "OVER_SAFE", currency: "ARS" })
  })
})

// ─── SERVICE ─────────────────────────────────────────────────────────────────

describe("classifyReconciliation — SERVICE", () => {
  test("MISSING: servicio sin operator_payment → crear y linkear", () => {
    const a = classifyReconciliation(input({
      services: [{ serviceId: "s1", operatorId: "op1", cost: 60, currency: "USD", operatorPaymentId: null }],
    }))
    expect(a[0]).toMatchObject({ kind: "MISSING", scope: "SERVICE", serviceId: "s1", createCost: 60 })
  })

  test("sync sube: deuda de servicio quedó corta", () => {
    const a = classifyReconciliation(input({
      services: [{ serviceId: "s1", operatorId: "op1", cost: 60, currency: "USD", operatorPaymentId: "p1" }],
      existingPayments: [pay({ id: "p1", operatorId: "op1", amount: 50, paidAmount: 0 })],
    }))
    expect(a[0]).toMatchObject({ kind: "UNDER", scope: "SERVICE", newAmount: 60 })
  })

  test("PAID-reopen: costo del servicio subió tras pago completo", () => {
    const a = classifyReconciliation(input({
      services: [{ serviceId: "s1", operatorId: "op1", cost: 80, currency: "USD", operatorPaymentId: "p1" }],
      existingPayments: [pay({ id: "p1", operatorId: "op1", amount: 60, paidAmount: 60, status: "PAID" })],
    }))
    expect(a[0]).toMatchObject({ kind: "REOPEN", scope: "SERVICE", newAmount: 80 })
  })

  test("cost→0 con deuda sin pagos → GHOST + desvincular", () => {
    const a = classifyReconciliation(input({
      services: [{ serviceId: "s1", operatorId: "op1", cost: 0, currency: "USD", operatorPaymentId: "p1" }],
      existingPayments: [pay({ id: "p1", operatorId: "op1", amount: 60, paidAmount: 0 })],
    }))
    expect(a[0]).toMatchObject({ kind: "GHOST", scope: "SERVICE", payId: "p1", serviceId: "s1" })
  })

  test("cost→0 con pagos → BLOCKED", () => {
    const a = classifyReconciliation(input({
      services: [{ serviceId: "s1", operatorId: "op1", cost: 0, currency: "USD", operatorPaymentId: "p1" }],
      existingPayments: [pay({ id: "p1", operatorId: "op1", amount: 60, paidAmount: 30, status: "PAID" })],
    }))
    expect(a[0]).toMatchObject({ kind: "BLOCKED", scope: "SERVICE" })
  })

  test("operador del servicio cambió → REASSIGN", () => {
    const a = classifyReconciliation(input({
      services: [{ serviceId: "s1", operatorId: "op2", cost: 60, currency: "USD", operatorPaymentId: "p1" }],
      existingPayments: [pay({ id: "p1", operatorId: "op1", amount: 60, paidAmount: 0 })],
    }))
    expect(a.find((x) => x.kind === "REASSIGN")).toMatchObject({ scope: "SERVICE", newOperatorId: "op2" })
  })
})

// ─── Mixto + invariantes ──────────────────────────────────────────────────────

describe("classifyReconciliation — mixto e invariantes", () => {
  test("REGRESIÓN: el pago de servicio NO se fantasmea como base", () => {
    // baseOperators solo tiene op1; el pago de servicio es de op2 y está linkeado.
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "USD" }],
      services: [{ serviceId: "s1", operatorId: "op2", cost: 60, currency: "USD", operatorPaymentId: "psvc" }],
      existingPayments: [
        pay({ id: "pbase", operatorId: "op1", amount: 100 }),
        pay({ id: "psvc", operatorId: "op2", amount: 60 }),
      ],
    }))
    expect(a.find((x) => x.payId === "psvc" && x.kind === "GHOST")).toBeUndefined()
    expect(kinds(a)).toEqual([]) // todo consistente
  })

  test("idempotencia: estado ya consistente → 0 acciones", () => {
    const a = classifyReconciliation(input({
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "USD" }],
      services: [{ serviceId: "s1", operatorId: "op2", cost: 60, currency: "USD", operatorPaymentId: "psvc" }],
      existingPayments: [
        pay({ id: "pbase", operatorId: "op1", amount: 100 }),
        pay({ id: "psvc", operatorId: "op2", amount: 60 }),
      ],
    }))
    expect(a).toHaveLength(0)
  })
})

// ─── Legacy single-op (sin operation_operators) ────────────────────────────────

describe("classifyReconciliation — legacy single-op", () => {
  test("NO borra fantasmas base cuando no hay operation_operators", () => {
    const a = classifyReconciliation(input({
      hasOperationOperators: false,
      baseOperators: [{ operatorId: "op1", cost: 100, currency: "USD" }],
      existingPayments: [
        pay({ operatorId: "op1", amount: 100 }),
        pay({ id: "x", operatorId: "op2", amount: 50, paidAmount: 0 }),
      ],
    }))
    // op2 NO se fantasmea en modo legacy
    expect(a.find((x) => x.kind === "GHOST")).toBeUndefined()
  })

  test("reasigna la deuda base cuando cambió el operador (1 operador, 1 deuda)", () => {
    const a = classifyReconciliation(input({
      hasOperationOperators: false,
      baseOperators: [{ operatorId: "op2", cost: 100, currency: "USD" }],
      existingPayments: [pay({ id: "p1", operatorId: "op1", amount: 100, paidAmount: 0 })],
    }))
    expect(a.find((x) => x.kind === "REASSIGN")).toMatchObject({ scope: "BASE", newOperatorId: "op2" })
  })
})
