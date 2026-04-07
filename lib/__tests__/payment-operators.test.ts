import { buildOperationPaymentOperators } from "@/lib/operations/payment-operators"

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
