import {
  operationToCommercialSnapshot,
  quotationToCommercialSnapshot,
} from "@/lib/growth-studio/source-snapshot"

describe("Growth Studio commercial source snapshots", () => {
  it("allowlists operation fields and omits price by default", () => {
    const snapshot = operationToCommercialSnapshot(
      {
        id: "op-1",
        destination: "Madrid",
        origin: "Buenos Aires",
        departure_date: "2026-09-01",
        return_date: "2026-09-14",
        checkin_date: "2026-09-02",
        checkout_date: "2026-09-13",
        product_type: "Paquete",
        hotel_name: "Hotel Centro",
        airline_name: "Aerolínea",
        adults: 2,
        children: 1,
        infants: 0,
        sale_amount_total: 5400,
        sale_currency: "USD",
        currency: "USD",
        passengers: [{ name: "No debe salir", passport: "ABC123" }],
        file_code: "EXP-SECRET",
        reservation_code_air: "PNR123",
        seller_id: "user-secret",
        lead_id: "lead-secret",
      },
      false
    )

    expect(snapshot).toEqual({
      type: "operation",
      destination: "Madrid",
      origin: "Buenos Aires",
      departureDate: "2026-09-01",
      returnDate: "2026-09-14",
      checkinDate: "2026-09-02",
      checkoutDate: "2026-09-13",
      productType: "Paquete",
      hotelName: "Hotel Centro",
      airlineName: "Aerolínea",
      travelers: { adults: 2, children: 1, infants: 0 },
      price: null,
    })
    expect(JSON.stringify(snapshot)).not.toMatch(
      /passenger|passport|file_code|reservation|seller|lead|secret/i
    )
  })

  it("includes only public quotation commercial data and optional price", () => {
    const snapshot = quotationToCommercialSnapshot(
      {
        id: "quote-1",
        destination: "Bariloche",
        origin: "Córdoba",
        departure_date: "2026-08-01",
        return_date: "2026-08-08",
        region: "Patagonia",
        package_description: "Vuelo y hotel",
        adults: 2,
        children: 0,
        infants: 0,
        total_amount: 1800000,
        currency: "ARS",
        valid_until: "2026-07-31",
        customer_id: "customer-secret",
        lead_id: "lead-secret",
        internal_notes: "dato interno",
        notes: "teléfono 111",
        quotation_number: "COT-001",
      },
      true
    )

    expect(snapshot.price).toEqual({
      amount: 1800000,
      currency: "ARS",
      validUntil: "2026-07-31",
    })
    expect(JSON.stringify(snapshot)).not.toMatch(
      /customer|lead|internal|teléfono|quotation_number|secret/i
    )
  })
})
