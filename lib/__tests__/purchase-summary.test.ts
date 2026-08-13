import { buildOperationPurchaseSummary } from "@/lib/operations/purchase-summary"

describe("buildOperationPurchaseSummary", () => {
  it("arma lineas base desde operation_operators con reservas por tipo", () => {
    const summary = buildOperationPurchaseSummary({
      operation: {
        type: "PACKAGE",
        reservation_code_air: "AIR-123",
        reservation_code_hotel: "HOT-456",
        operation_operators: [
          {
            id: "base-flight",
            operator_id: "euro",
            cost: 1000,
            cost_currency: "USD",
            product_type: "FLIGHT",
            operators: { id: "euro", name: "Eurovips" },
          },
          {
            id: "base-hotel",
            operator_id: "loz",
            cost: 700,
            cost_currency: "USD",
            product_type: "HOTEL",
            notes: "Tarifa mayorista",
            operators: { id: "loz", name: "Lozada" },
          },
        ],
      },
      operationServices: [],
    })

    expect(summary.lines).toEqual([
      {
        id: "base-flight",
        source: "base",
        label: "Aereo",
        operatorName: "Eurovips",
        reservationCode: "AIR-123",
        amount: 1000,
        currency: "USD",
        secondaryText: null,
        detailText: null,
        fileCode: null,
        dueDate: null,
      },
      {
        id: "base-hotel",
        source: "base",
        label: "Hotel",
        operatorName: "Lozada",
        reservationCode: "HOT-456",
        amount: 700,
        currency: "USD",
        secondaryText: "Tarifa mayorista",
        detailText: null,
        fileCode: null,
        dueDate: null,
      },
    ])

    expect(summary.totals).toEqual([{ currency: "USD", amount: 1700 }])
  })

  it("usa fallback legacy cuando no existen operation_operators", () => {
    const summary = buildOperationPurchaseSummary({
      operation: {
        type: "FLIGHT",
        operator_id: "delf",
        operator_cost: 950,
        operator_cost_currency: "USD",
        reservation_code_air: "ABC123",
        operators: { id: "delf", name: "Delfos" },
      },
      operationServices: [],
    })

    expect(summary.lines).toEqual([
      {
        id: "base-delf",
        source: "base",
        label: "Aereo",
        operatorName: "Delfos",
        reservationCode: "ABC123",
        amount: 950,
        currency: "USD",
        secondaryText: null,
        detailText: null,
        fileCode: null,
        dueDate: null,
      },
    ])

    expect(summary.totals).toEqual([{ currency: "USD", amount: 950 }])
  })

  it("agrega servicios adicionales, deja reserva vacia y subtotaliza por moneda", () => {
    const summary = buildOperationPurchaseSummary({
      operation: {
        type: "PACKAGE",
        operator_id: "base-op",
        operator_cost: 1500,
        operator_cost_currency: "USD",
        operators: { id: "base-op", name: "Operador Base" },
      },
      operationServices: [
        {
          id: "svc-1",
          service_type: "ASSISTANCE",
          description: "Universal Assistance",
          operator_id: "assist-op",
          cost_amount: 55,
          cost_currency: "USD",
          operators: { id: "assist-op", name: "Universal" },
        },
        {
          id: "svc-2",
          service_type: "TRANSFER",
          description: "In/Out aeropuerto",
          cost_amount: 35000,
          cost_currency: "ARS",
          operators: null,
        },
      ],
    })

    expect(summary.lines).toEqual([
      {
        id: "base-base-op",
        source: "base",
        label: "Paquete",
        operatorName: "Operador Base",
        reservationCode: null,
        amount: 1500,
        currency: "USD",
        secondaryText: null,
        detailText: null,
        fileCode: null,
        dueDate: null,
      },
      {
        id: "svc-1",
        source: "service",
        label: "Asistencia",
        operatorName: "Universal",
        reservationCode: null,
        amount: 55,
        currency: "USD",
        secondaryText: "Universal Assistance",
        detailText: null,
        fileCode: null,
        dueDate: null,
      },
      {
        id: "svc-2",
        source: "service",
        label: "Transfer",
        operatorName: "Sin operador",
        reservationCode: null,
        amount: 35000,
        currency: "ARS",
        secondaryText: "In/Out aeropuerto",
        detailText: null,
        fileCode: null,
        dueDate: null,
      },
    ])

    expect(summary.totals).toEqual([
      { currency: "USD", amount: 1555 },
      { currency: "ARS", amount: 35000 },
    ])
  })

  it("expone el detalle cargado por servicio, el file y el vencimiento (VIB-111)", () => {
    const summary = buildOperationPurchaseSummary({
      operation: {
        type: "PACKAGE",
        operation_operators: [
          {
            id: "base-hotel",
            operator_id: "loz",
            cost: 700,
            cost_currency: "USD",
            product_type: "HOTEL",
            operators: { id: "loz", name: "Lozada" },
            passenger_detail: {
              hotel_name: "NH Collection",
              room_type: "Doble",
              meal_plan: "Desayuno",
              checkin: "2026-09-01",
              checkout: "2026-09-08",
            },
            file_code: "LZ-9911",
            payment_due_date: "2026-08-15",
          },
          {
            id: "base-paquete",
            operator_id: "fta",
            cost: 1200,
            cost_currency: "USD",
            product_type: "PAQUETE",
            operators: { id: "fta", name: "FTA" },
            // Tipo sin campos estructurados → texto libre en `detail`.
            passenger_detail: { detail: "Vuelo + hotel + traslados" },
          },
        ],
      },
      operationServices: [],
    })

    expect(summary.lines[0]).toMatchObject({
      label: "Hotel",
      detailText: "NH Collection · Doble · Desayuno · Del 01/09/2026 al 08/09/2026",
      fileCode: "LZ-9911",
      dueDate: "2026-08-15",
    })
    expect(summary.lines[1]).toMatchObject({
      label: "Paquete",
      detailText: "Vuelo + hotel + traslados",
      fileCode: null,
      dueDate: null,
    })
  })

  it("deja detailText en null cuando no se cargo detalle", () => {
    const summary = buildOperationPurchaseSummary({
      operation: {
        type: "PACKAGE",
        operation_operators: [
          {
            id: "base-1",
            operator_id: "op",
            cost: 100,
            cost_currency: "USD",
            product_type: "HOTEL",
            operators: { id: "op", name: "Op" },
            passenger_detail: null,
          },
        ],
      },
      operationServices: [],
    })

    expect(summary.lines[0].detailText).toBeNull()
  })

  it("usa un rotulo generico cuando no puede inferir el tipo base", () => {
    const summary = buildOperationPurchaseSummary({
      operation: {
        operator_cost: 200,
        operator_cost_currency: "USD",
      },
      operationServices: [],
    })

    expect(summary.lines).toEqual([
      {
        id: "base-legacy",
        source: "base",
        label: "Operacion base",
        operatorName: "Sin operador",
        reservationCode: null,
        amount: 200,
        currency: "USD",
        secondaryText: null,
        detailText: null,
        fileCode: null,
        dueDate: null,
      },
    ])
  })
})
