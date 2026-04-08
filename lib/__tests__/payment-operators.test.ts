import {
  buildOpenOperationBasePayableOperators,
  buildOperationPaymentOperators,
} from "@/lib/operations/payment-operators"

describe("buildOperationPaymentOperators", () => {
  it("deduplica operadores tomados de multiples fuentes", () => {
    const operators = buildOperationPaymentOperators({
      primaryOperator: { id: "euro", name: "Eurovips" },
      operationOperators: [
        { operator_id: "euro", operators: { id: "euro", name: "Eurovips" } },
        { operator_id: "loz", operators: { id: "loz", name: "Lozada" } },
      ],
      serviceOperators: [
        { operator_id: "loz", operators: { id: "loz", name: "Lozada" } },
      ],
      operatorPayments: [
        { operator_id: "euro", operators: { id: "euro", name: "Eurovips" } },
      ],
      purchaseIvaOperators: [
        { operator_id: "loz", operators: { id: "loz", name: "Lozada" } },
      ],
    })

    expect(operators).toEqual([
      { id: "euro", name: "Eurovips" },
      { id: "loz", name: "Lozada" },
    ])
  })

  it("usa fallbackNamesById cuando una fuente no trae nombre", () => {
    const operators = buildOperationPaymentOperators({
      serviceOperators: [{ operator_id: "loz" }],
      operatorPayments: [{ operator_id: "euro" }],
      fallbackNamesById: new Map([
        ["loz", "Lozada"],
        ["euro", "Eurovips"],
      ]),
    })

    expect(operators).toEqual([
      { id: "loz", name: "Lozada" },
      { id: "euro", name: "Eurovips" },
    ])
  })
})

describe("buildOpenOperationBasePayableOperators", () => {
  it("incluye solo deudas abiertas de la operacion base", () => {
    const operators = buildOpenOperationBasePayableOperators({
      operatorPayments: [
        {
          id: "debt-base-euro",
          operator_id: "euro",
          amount: 1000,
          paid_amount: 250,
          status: "PENDING",
          operators: { id: "euro", name: "Eurovips" },
        },
        {
          id: "debt-service-loz",
          operator_id: "loz",
          amount: 500,
          paid_amount: 0,
          status: "OVERDUE",
          operators: { id: "loz", name: "Lozada" },
        },
      ],
      operationServices: [
        { operator_payment_id: "debt-service-loz", operator_id: "loz" },
      ],
    })

    expect(operators).toEqual([
      { id: "euro", name: "Eurovips" },
    ])
  })

  it("excluye deudas saldadas o cerradas aunque sigan relacionadas", () => {
    const operators = buildOpenOperationBasePayableOperators({
      operatorPayments: [
        {
          id: "debt-paid-status",
          operator_id: "euro",
          amount: 900,
          paid_amount: 200,
          status: "PAID",
          operators: { id: "euro", name: "Eurovips" },
        },
        {
          id: "debt-settled-balance",
          operator_id: "loz",
          amount: 500,
          paid_amount: 500,
          status: "PENDING",
          operators: { id: "loz", name: "Lozada" },
        },
      ],
    })

    expect(operators).toEqual([])
  })

  it("deduplica multiples deudas abiertas del mismo operador y usa fallback de nombre", () => {
    const operators = buildOpenOperationBasePayableOperators({
      operatorPayments: [
        {
          id: "debt-1",
          operator_id: "euro",
          amount: 600,
          paid_amount: 0,
          status: "PENDING",
        },
        {
          id: "debt-2",
          operator_id: "euro",
          amount: 400,
          paid_amount: 100,
          status: "OVERDUE",
        },
      ],
      fallbackNamesById: new Map([
        ["euro", "Eurovips"],
      ]),
    })

    expect(operators).toEqual([
      { id: "euro", name: "Eurovips" },
    ])
  })
})
