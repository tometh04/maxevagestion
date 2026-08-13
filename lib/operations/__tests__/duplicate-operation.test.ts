import { buildOperationDuplicateDraft } from "@/lib/operations/duplicate-operation"

const baseOperation = {
  id: "op-1",
  file_code: "OP-20260810-ABCD1234",
  lead_id: "lead-1",
  agency_id: "agency-1",
  seller_id: "seller-1",
  seller_secondary_id: "seller-2",
  commission_split: 40,
  type: "PACKAGE",
  origin: "Buenos Aires",
  destination: "Punta Cana",
  departure_date: "2026-12-01",
  return_date: "2026-12-10",
  adults: 2,
  children: 1,
  infants: 0,
  sale_amount_total: 3200,
  operator_cost: 2500,
  currency: "USD",
  sale_currency: "USD",
  operator_cost_currency: "USD",
  airline_name: "Copa",
  hotel_name: "Riu",
  reservation_code_air: "AIR-123",
  reservation_code_hotel: "HOT-456",
  itr_localizador: "ITR-789",
  passenger_notes: "Traslados incluidos",
  operation_operators: [
    {
      id: "oo-1",
      operator_id: "op-fta",
      cost: 1500,
      cost_currency: "USD",
      product_type: "HOTEL",
      passenger_detail: { hotel_name: "Riu", meal_plan: "All inclusive" },
      file_code: "FTA-0001",
      payment_due_date: "2026-10-01",
    },
    {
      id: "oo-2",
      operator_id: "op-euro",
      cost: 1000,
      cost_currency: "USD",
      product_type: "FLIGHT",
    },
  ],
}

describe("buildOperationDuplicateDraft (VIB-109)", () => {
  it("copia lo que se repite entre ventas del mismo grupo", () => {
    const { formValues } = buildOperationDuplicateDraft(baseOperation)

    expect(formValues).toMatchObject({
      agency_id: "agency-1",
      seller_id: "seller-1",
      seller_secondary_id: "seller-2",
      commission_split: 40,
      type: "PACKAGE",
      origin: "Buenos Aires",
      destination: "Punta Cana",
      adults: 2,
      children: 1,
      sale_amount_total: 3200,
      operator_cost: 2500,
      sale_currency: "USD",
      airline_name: "Copa",
      hotel_name: "Riu",
      passenger_notes: "Traslados incluidos",
    })
  })

  it("NO copia identificadores de la reserva original", () => {
    const { formValues, operatorRows } = buildOperationDuplicateDraft(baseOperation)

    // El file_code lo genera el POST con el id real de la operación nueva.
    expect(formValues).not.toHaveProperty("file_code")
    expect(formValues).not.toHaveProperty("lead_id")
    // Los códigos de reserva son de la reserva vieja.
    expect(formValues).not.toHaveProperty("reservation_code_air")
    expect(formValues).not.toHaveProperty("reservation_code_hotel")
    expect(formValues).not.toHaveProperty("itr_localizador")
    // Idem el file y el vencimiento de cada pata.
    expect(operatorRows[0]).not.toHaveProperty("file_code")
    expect(operatorRows[0]).not.toHaveProperty("payment_due_date")
  })

  it("NO copia pasajeros: es justo lo que cambia entre ventas del grupo", () => {
    const { formValues } = buildOperationDuplicateDraft(baseOperation)
    expect(formValues).not.toHaveProperty("customer_id")
  })

  it("copia las patas con costo, moneda, tipo y detalle del pasajero", () => {
    const { operatorRows, hasOperators } = buildOperationDuplicateDraft(baseOperation)

    expect(hasOperators).toBe(true)
    expect(operatorRows).toEqual([
      {
        operator_id: "op-fta",
        cost: 1500,
        cost_currency: "USD",
        product_type: "HOTEL",
        passenger_detail: { hotel_name: "Riu", meal_plan: "All inclusive" },
      },
      {
        operator_id: "op-euro",
        cost: 1000,
        cost_currency: "USD",
        product_type: "FLIGHT",
      },
    ])
  })

  it("VIB-112: copia el precio de venta por servicio (parte del paquete del grupo)", () => {
    const { operatorRows } = buildOperationDuplicateDraft({
      operation_operators: [
        { operator_id: "op-1", cost: 300, cost_currency: "USD", sale_amount: 500 },
        { operator_id: "op-2", cost: 100, cost_currency: "USD", sale_amount: 0 },
      ],
    })
    expect(operatorRows[0].sale_amount).toBe(500)
    // Los que están en 0 no arrastran el campo (queda vacío para recargar).
    expect(operatorRows[1]).not.toHaveProperty("sale_amount")
  })

  it("clona el detalle del pasajero en vez de compartir la referencia", () => {
    const { operatorRows } = buildOperationDuplicateDraft(baseOperation)
    operatorRows[0].passenger_detail!.hotel_name = "Otro"
    expect(baseOperation.operation_operators[0].passenger_detail?.hotel_name).toBe("Riu")
  })

  it("parsea las fechas DATE sin corrimiento de timezone", () => {
    const { formValues } = buildOperationDuplicateDraft(baseOperation)
    expect(formValues.departure_date?.getFullYear()).toBe(2026)
    expect(formValues.departure_date?.getMonth()).toBe(11) // diciembre
    expect(formValues.departure_date?.getDate()).toBe(1)
    expect(formValues.return_date?.getDate()).toBe(10)
  })

  it("tolera una operación sin patas ni fechas", () => {
    const { operatorRows, hasOperators, formValues } = buildOperationDuplicateDraft({
      destination: "Madrid",
    })
    expect(operatorRows).toEqual([])
    expect(hasOperators).toBe(false)
    expect(formValues.departure_date).toBeUndefined()
    expect(formValues.adults).toBe(1)
    expect(formValues.sale_currency).toBe("USD")
  })

  it("descarta patas sin operador", () => {
    const { operatorRows } = buildOperationDuplicateDraft({
      operation_operators: [{ operator_id: null, cost: 100 }, { operator_id: "op-1", cost: 50 }],
    })
    expect(operatorRows).toHaveLength(1)
    expect(operatorRows[0].operator_id).toBe("op-1")
  })

  it("sin vendedor secundario no arrastra el split", () => {
    const { formValues } = buildOperationDuplicateDraft({
      ...baseOperation,
      seller_secondary_id: null,
    })
    expect(formValues.seller_secondary_id).toBeNull()
    expect(formValues.commission_split).toBeNull()
  })
})
