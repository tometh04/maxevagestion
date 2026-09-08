import { persistEmiliaTurnResult } from "../turn-result"
import { applyEmiliaTurnUpdate } from "../progressive-turn"

function createSupabaseMock() {
  const inserts: Array<{ table: string; row: any }> = []
  const updateChain: any = {
    eq: jest.fn(() => updateChain),
    then: (resolve: (value: unknown) => void) => resolve({ error: null }),
  }

  return {
    inserts,
    client: {
      from: jest.fn((table: string) => ({
        insert: jest.fn(async (row: any) => {
          inserts.push({ table, row })
          return { error: null }
        }),
        update: jest.fn(() => updateChain),
      })),
    },
  }
}

function canonicalSearchTurn() {
  return {
    schema_version: "emilia.turn.v1",
    success: true,
    request_id: "req_aruba_001",
    metadata: {
      turn_relation: "new_search",
    },
    assistant_message: {
      id: "assistant-1",
      role: "assistant",
      content: { text: "Encontré un vuelo y un hotel para esta búsqueda." },
    },
    outcome: {
      type: "search_results",
      results: {
        status: "complete",
        result_sets: [
          {
            product: "flights",
            status: "available",
            count: 1,
            query: {
              origin: "EZE",
              destination: "AUA",
              departureDate: "2026-12-05",
              returnDate: "2026-12-20",
              adults: 2,
              children: 0,
              infants: 0,
            },
            data: [
              {
                schema_version: "emilia.flight-offer.v1",
                id: "flight-1",
                provider: "STARLING",
                airline: { code: "AR", name: "Aerolíneas Argentinas" },
                price: { amount: 1800, currency: "USD" },
                cabin: "ECONOMY",
                refundable: false,
                baggage: { carry_on: true, checked: true },
                legs: [
                  {
                    origin: "EZE",
                    destination: "AUA",
                    departure_at: "2026-12-05T10:00:00",
                    arrival_at: "2026-12-05T18:00:00",
                    duration_minutes: 480,
                    stops: 0,
                    segments: [
                      {
                        marketing_airline: "AR",
                        operating_airline: "AR",
                        flight_number: "1370",
                        departure: { airport_code: "EZE", city: "Buenos Aires", date: "2026-12-05", time: "10:00" },
                        arrival: { airport_code: "AUA", city: "Aruba", date: "2026-12-05", time: "18:00" },
                        duration_minutes: 480,
                        cabin: "ECONOMY",
                      },
                    ],
                  },
                  {
                    origin: "AUA",
                    destination: "EZE",
                    departure_at: "2026-12-20T12:00:00",
                    arrival_at: "2026-12-20T20:00:00",
                    duration_minutes: 480,
                    stops: 0,
                    segments: [],
                  },
                ],
              },
            ],
          },
          {
            product: "hotels",
            status: "available",
            count: 1,
            query: {
              city: "Aruba",
              checkinDate: "2026-12-05",
              checkoutDate: "2026-12-20",
              adults: 2,
              children: 0,
              infants: 0,
            },
            data: [
              {
                schema_version: "emilia.hotel-offer.v1",
                id: "hotel-1",
                provider: "DELFOS",
                name: "Aruba Beach Resort",
                stars: 4,
                location: { city: "Aruba", address: "Palm Beach 1", latitude: 12.5, longitude: -70.0 },
                stay: { check_in: "2026-12-05", check_out: "2026-12-20", nights: 15 },
                minimum_price: { amount: 2100, currency: "USD" },
                amenities: ["Piscina"],
                accessibility: [],
                rooms: [
                  {
                    id: "room-1",
                    name: "Habitación doble",
                    board: "Desayuno",
                    price: { amount: 2100, currency: "USD" },
                    refundable: true,
                    free_cancellation: true,
                    payment_at_property: false,
                    cancellation_policy: "Cancelación gratuita",
                  },
                ],
              },
            ],
          },
        ],
        provenance: {},
        assumptions: [],
        applied_constraints: [],
        ignored_constraints: [],
        warnings: [],
        compatible_combinations: [],
        references: [],
        available_actions: [],
        metadata: {},
      },
    },
  }
}

describe("persistEmiliaTurnResult emilia.turn.v1", () => {
  it.each(["flights", "hotels"])("muestra y guarda %s disponibles junto al mensaje de recuperación", async (available) => {
    const supabase = createSupabaseMock()
    const data = canonicalSearchTurn()
    const failed = available === "flights" ? "hotels" : "flights"
    const text = "Pude completar una parte del pedido. Conservé los resultados disponibles. ¿Querés que reintente?"
    data.assistant_message.content.text = text
    data.outcome.type = "recovery"
    data.outcome.results.status = "partial"
    const failedSet = data.outcome.results.result_sets.find(set => set.product === failed)!
    failedSet.status = "failed"
    failedSet.count = 0
    failedSet.data = []

    const result = await persistEmiliaTurnResult({
      supabase: supabase.client, conversation: { title: "Viaje" },
      conversationId: "conversation-1", orgId: "org-1", userId: "user-1",
      requestId: "recovery-1", jobId: "job-1", data,
    })
    expect(result.results[available].items).toHaveLength(1)
    expect(result.results[failed].items).toHaveLength(0)
    const saved = supabase.inserts[0].row.content
    expect(saved.text).toBe(text)
    expect(saved.cards[available].items).toHaveLength(1)
    expect(saved.metadata.emilia_meta.productStates).toEqual({ [available]: "available", [failed]: "failed" })
    const messages = applyEmiliaTurnUpdate([], "job-1", result)
    expect(messages[0].text).toBe(text)
    expect(messages[0].cards?.[available as "flights" | "hotels"]?.items).toHaveLength(1)
  })

  it("convierte result_sets canónicos en cards cotizables de vuelos y hoteles", async () => {
    const supabase = createSupabaseMock()

    const result = await persistEmiliaTurnResult({
      supabase: supabase.client,
      conversation: { title: "Chat Aruba" },
      conversationId: "22222222-2222-4222-8222-222222222222",
      orgId: "org-1",
      userId: "user-1",
      requestId: "req_aruba_001",
      data: canonicalSearchTurn(),
      jobId: "11111111-1111-4111-8111-111111111111",
    })

    expect(result.status).toBe("completed")
    expect(result.requestType).toBe("combined")
    expect(result.results.flights).toMatchObject({ count: 1 })
    expect(result.results.flights.items[0]).toMatchObject({
      id: "flight-1",
      provider: "STARLING",
      adults: 2,
      departure_date: "2026-12-05",
      return_date: "2026-12-20",
      price: { amount: 1800, currency: "USD", basis: "GROUP_TOTAL" },
      legs: [
        {
          flight_type: "outbound",
          departure: { city_code: "EZE", city_name: "Buenos Aires", time: "10:00" },
          arrival: { city_code: "AUA", city_name: "Aruba", time: "18:00" },
        },
        { flight_type: "inbound" },
      ],
    })
    expect(result.results.hotels).toMatchObject({ count: 1 })
    expect(result.results.hotels.items[0]).toMatchObject({
      id: "hotel-1",
      provider: "DELFOS",
      name: "Aruba Beach Resort",
      category: "4 estrellas",
      city: "Aruba",
      check_in: "2026-12-05",
      check_out: "2026-12-20",
      nights: 15,
      rooms: [
        {
          occupancy_id: "room-1",
          total_price: 2100,
          price_per_night: 140,
          currency: "USD",
        },
      ],
    })

    const assistant = supabase.inserts.find((entry) => entry.table === "messages")?.row
    expect(assistant.content.cards.flights.items).toHaveLength(1)
    expect(assistant.content.cards.hotels.items).toHaveLength(1)
    expect(assistant.content.metadata.results_count).toBe(2)
    expect(assistant.content.metadata.emilia_meta).toMatchObject({
      messageType: "search_results",
      originalRequest: {
        requestType: "combined",
        flights: { departureDate: "2026-12-05", adults: 2 },
        hotels: { checkinDate: "2026-12-05", adults: 2 },
      },
      turnSemantics: { relation: "new_search" },
    })
  })

  it("convierte needs_input canónico en el estado incomplete de Maxeva", async () => {
    const supabase = createSupabaseMock()

    const result = await persistEmiliaTurnResult({
      supabase: supabase.client,
      conversation: { title: "Chat Aruba" },
      conversationId: "22222222-2222-4222-8222-222222222222",
      orgId: "org-1",
      userId: "user-1",
      requestId: "req_aruba_002",
      data: {
        schema_version: "emilia.turn.v1",
        success: true,
        outcome: {
          type: "needs_input",
          question: "¿Qué día de diciembre querés salir?",
          missing_fields: ["flights.departureDate"],
          pending_action: { type: "collect_missing" },
        },
        assistant_message: null,
      },
      jobId: "33333333-3333-4333-8333-333333333333",
    })

    expect(result).toMatchObject({
      status: "incomplete",
      message: "¿Qué día de diciembre querés salir?",
      missing_fields: ["flights.departureDate"],
    })
    expect(supabase.inserts[0].row.content).toMatchObject({
      text: "¿Qué día de diciembre querés salir?",
      metadata: {
        request_type: "missing_info_request",
        missing_fields: ["flights.departureDate"],
      },
    })
  })

  it("preserva no_results canónico como búsqueda vacía y con contexto", async () => {
    const supabase = createSupabaseMock()

    const result = await persistEmiliaTurnResult({
      supabase: supabase.client,
      conversation: { title: "Chat Aruba" },
      conversationId: "22222222-2222-4222-8222-222222222222",
      orgId: "org-1",
      userId: "user-1",
      requestId: "req_aruba_003",
      data: {
        schema_version: "emilia.turn.v1",
        success: true,
        request_id: "req_aruba_003",
        assistant_message: {
          id: "assistant-3",
          role: "assistant",
          content: "No encontré vuelos para esas fechas.",
        },
        outcome: {
          type: "no_results",
          suggestions: ["change_dates"],
          results: {
            status: "complete",
            result_sets: [{
              product: "flights",
              status: "empty",
              count: 0,
              query: { origin: "EZE", destination: "AUA", departureDate: "2026-12-05", adults: 2 },
              data: [],
            }],
            warnings: [],
            available_actions: [],
            references: [],
          },
        },
      },
      jobId: "44444444-4444-4444-8444-444444444444",
    })

    expect(result).toMatchObject({
      status: "completed",
      requestType: "flights",
      results: { flights: { count: 0, items: [] } },
      assistant_message: {
        content: { text: "No encontré vuelos para esas fechas." },
        meta: {
          messageType: "no_results",
          originalRequest: { flights: { destination: "AUA" } },
        },
      },
    })
    expect(supabase.inserts[0].row.content.cards.flights.items).toEqual([])
  })

  it("normaliza outcomes message y error sin inventar cards", async () => {
    const messageSupabase = createSupabaseMock()
    const messageResult = await persistEmiliaTurnResult({
      supabase: messageSupabase.client,
      conversation: { title: "Chat Aruba" },
      conversationId: "22222222-2222-4222-8222-222222222222",
      orgId: "org-1",
      userId: "user-1",
      requestId: "req_aruba_004",
      data: {
        schema_version: "emilia.turn.v1",
        success: true,
        assistant_message: { id: "assistant-4", role: "assistant", content: "¿En qué más te ayudo?" },
        outcome: { type: "message", message_type: "non_search" },
      },
    })

    expect(messageResult).toMatchObject({
      status: "completed",
      assistant_message: { content: { text: "¿En qué más te ayudo?" } },
    })
    expect(messageResult.results).toBeUndefined()

    const errorSupabase = createSupabaseMock()
    const errorResult = await persistEmiliaTurnResult({
      supabase: errorSupabase.client,
      conversation: { title: "Chat Aruba" },
      conversationId: "22222222-2222-4222-8222-222222222222",
      orgId: "org-1",
      userId: "user-1",
      requestId: "req_aruba_005",
      data: {
        schema_version: "emilia.turn.v1",
        success: false,
        outcome: {
          type: "error",
          error: { code: "PROVIDER_UNAVAILABLE", message: "Proveedor no disponible", status: 503 },
        },
      },
    })

    expect(errorResult).toMatchObject({
      status: "error",
      assistant_message: { content: { text: "Proveedor no disponible" } },
    })
    expect(errorResult.results).toBeUndefined()
  })
})
