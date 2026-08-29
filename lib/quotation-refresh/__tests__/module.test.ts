import { createQuotationRefreshModule } from "@/lib/quotation-refresh/module"
import { buildQuotationPayload } from "@/lib/emilia/quotation-mapper"
import { canonicalOfferCards } from "@/lib/emilia/turn-result"
import { getQuotationItemEffectiveUnitCost } from "@/lib/quotations/totals"
import type { OfferRefreshPort } from "@/lib/quotation-refresh/offer-refresh-port"
import { readFileSync } from "node:fs"
import { join } from "node:path"

class Query {
  private filters: Array<(row: any) => boolean> = []
  private operation: "read" | "insert" | "update" = "read"
  private payload: any

  constructor(private db: FakeDb, private table: string) {}
  select() { return this }
  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this }
  in(column: string, values: unknown[]) { this.filters.push(row => values.includes(row[column])); return this }
  insert(payload: any) { this.operation = "insert"; this.payload = payload; return this }
  update(payload: any) { this.operation = "update"; this.payload = payload; return this }
  async maybeSingle() { return this.execute(false) }
  async single() { return this.execute(true) }
  then(resolve: (value: any) => void, reject: (reason: any) => void) {
    return this.execute(false).then(resolve, reject)
  }
  private async execute(requireOne: boolean) {
    const rows = this.db.tables[this.table] || []
    if (this.operation === "insert") {
      if (this.table === "quotation_price_refresh_runs" && this.db.runInsertRace) {
        rows.push(this.db.runInsertRace)
        this.db.tables[this.table] = rows
        this.db.runInsertRace = null
        return { data: null, error: { code: "23505", message: "duplicate key" } }
      }
      const row = { ...this.payload, created_at: this.db.tick(), updated_at: this.db.tick() }
      rows.push(row)
      this.db.tables[this.table] = rows
      return { data: row, error: null }
    }
    const matches = rows.filter(row => this.filters.every(filter => filter(row)))
    if (this.operation === "update") {
      for (const row of matches) Object.assign(row, this.payload, { updated_at: this.db.tick() })
      return { data: matches[0] || null, error: requireOne && !matches[0] ? { code: "P0002" } : null }
    }
    return { data: matches[0] || null, error: requireOne && !matches[0] ? { code: "P0002" } : null }
  }
}

class FakeDb {
  tables: Record<string, any[]>
  appliedArgs: any
  runInsertRace: any = null
  private sequence = 0

  constructor(quotation: any) {
    this.tables = { quotations: [quotation], quotation_price_refresh_runs: [] }
  }
  tick() { this.sequence += 1; return `2026-08-29T12:00:${String(this.sequence).padStart(2, "0")}.000Z` }
  from(table: string) { return new Query(this, table) }
  async rpc(name: string, args: any) {
    expect(name).toBe("apply_quotation_price_refresh")
    this.appliedArgs = args
    const run = this.tables.quotation_price_refresh_runs.find(row => row.id === args.p_run_id)
    Object.assign(run, {
      status: "APPLIED",
      applied_at: this.tick(),
      issued_document_id: "99999999-9999-4999-8999-999999999999",
      updated_at: this.tick(),
    })
    return { data: { run_id: run.id, already_applied: false }, error: null }
  }
}

function quotation(items: any[]) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    org_id: "22222222-2222-4222-8222-222222222222",
    agency_id: "33333333-3333-4333-8333-333333333333",
    seller_id: "44444444-4444-4444-8444-444444444444",
    updated_at: "2026-08-29T10:00:00.000Z",
    active_document_id: null,
    status: "SENT",
    currency: "USD",
    destination: "Madrid",
    departure_date: "2026-09-01",
    return_date: "2026-09-10",
    adults: 2,
    children: 0,
    infants: 0,
    quotation_options: [{
      id: "55555555-5555-4555-8555-555555555555",
      option_number: 1,
      title: "Opción 1",
      total_amount: 10_000,
      calculated_total_amount: 10_000,
      manual_total_amount: 10_000,
      is_selected: true,
    }],
    quotation_items: items,
  }
}

function item(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    quotation_id: "11111111-1111-4111-8111-111111111111",
    option_id: "55555555-5555-4555-8555-555555555555",
    org_id: "22222222-2222-4222-8222-222222222222",
    item_type: "FLIGHT",
    description: `Vuelo ${index}`,
    quantity: 1,
    unit_price: 200,
    sale_amount: 200,
    subtotal: 200,
    currency: "USD",
    cost_amount: 100,
    cost_currency: "USD",
    admin_fee_percentage: 0,
    commission_percentage: 0,
    cost_calculation_mode: "SIMPLE",
    gross_price: null,
    provider: "STARLING",
    airline: "AR",
    flight_route: "EZE - MAD",
    flight_date: "2026-09-01",
    flight_return_date: "2026-09-10",
    flight_stops: 0,
    flight_class: "ECONOMY",
    flight_details: {
      baggage: { checked: true, carry_on: false },
      refundable: true,
      legs: [{
        flight_type: "outbound",
        segments: [{
          marketing_airline: "AR",
          flight_number: "1132",
          departure: { airport_code: "EZE", date: "2026-09-01", time: "12:00" },
          arrival: { airport_code: "MAD", date: "2026-09-02", time: "05:00" },
        }],
      }],
    },
    cost_basis: "AGENCY_NET",
    operator_id: "99999999-9999-4999-8999-999999999998",
    offer_source: {
      artifact_id: "66666666-6666-4666-8666-666666666666",
      product: "flights",
      offer_id: `flight-${index}`,
    },
    offer_refresh_fallback: flightFallbackSnapshot(),
    ...overrides,
  }
}

function flightFallbackSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    product: "flights",
    query: {
      origin: "EZE",
      destination: "MAD",
      departure_date: "2026-09-01",
      return_date: "2026-09-10",
      adults: 2,
      children: 0,
      infants: 0,
      cabin: "Y",
    },
    identity: {
      kind: "flight",
      segments: [{
        marketing_airline: "AR",
        flight_number: "1132",
        origin: "EZE",
        destination: "MAD",
        departure_at: "2026-09-01T12:00",
      }],
      cabin: "Y",
      checked_baggage: true,
      carry_on: false,
      refundable: true,
    },
    ...overrides,
  }
}

function canonicalFlight(index: number, overrides: Record<string, unknown> = {}) {
  return item(index, {
    airline: "AR",
    flight_route: "EZE - MAD",
    flight_date: "2026-09-01",
    flight_return_date: "2026-09-10",
    flight_stops: 0,
    flight_class: "ECONOMY",
    flight_details: {
      baggage: { checked: true, carry_on: false },
      refundable: true,
      legs: [{
        flight_type: "outbound",
        segments: [{
          marketing_airline: "AR",
          flight_number: "1132",
          departure: { airport_code: "EZE", date: "2026-09-01", time: "12:00" },
          arrival: { airport_code: "MAD", date: "2026-09-02", time: "05:00" },
        }],
      }],
    },
    offer_refresh_fallback: flightFallbackSnapshot(),
    ...overrides,
  })
}

function rawAmount(line: any) {
  return line.cost_basis === "COMMISSIONABLE_GROSS" ? Number(line.gross_price) : Number(line.cost_amount)
}

function remoteItem(line: any, amount = rawAmount(line)) {
  const basis = line.cost_basis || "AGENCY_NET"
  const previousAmount = rawAmount(line)
  return {
    client_item_id: line.id,
    source: { type: "search_artifact" as const, ...line.offer_source },
    product: "flights" as const,
    provider: "STARLING",
    method: "exact_reprice" as const,
    outcome: amount === previousAmount ? "UNCHANGED" as const : "PRICE_CHANGED" as const,
    confidence: "exact" as const,
    previous: { price: { amount: previousAmount, currency: "USD", basis } },
    current: { price: { amount, currency: "USD", basis }, source: { type: "search_artifact" as const, ...line.offer_source } },
    candidates: [],
    differences: amount === previousAmount ? [] : [{ field: "price.amount", before: previousAmount, after: amount, material: true }],
    allowed_actions: amount === previousAmount ? ["KEEP_CURRENT" as const] : ["KEEP_CURRENT" as const, "APPLY_PRICE" as const],
    provider_checked_at: "2026-08-29T12:00:00.000Z",
    provider_expires_at: null,
    error: null,
  }
}

function moduleFor(db: FakeDb, port: OfferRefreshPort) {
  let runSequence = 0
  return createQuotationRefreshModule({
    db,
    offerRefresh: port,
    uuid: () => {
      runSequence += 1
      return `77777777-7777-4777-8777-${String(runSequence).padStart(12, "0")}`
    },
    resolveCredential: jest.fn(async () => ({
      id: "88888888-8888-4888-8888-888888888888",
      orgId: "22222222-2222-4222-8222-222222222222",
      agencyId: "33333333-3333-4333-8333-333333333333",
      apiKey: "agency-key",
      fingerprint: "a".repeat(64),
    })),
    prepareDocument: jest.fn(async () => ({
      revisionId: null,
      model: {},
      manifest: {},
      html: "<html>issued</html>",
      contentHash: "b".repeat(64),
      filename: "quote.pdf",
    })) as any,
    now: () => new Date("2026-08-29T12:05:00.000Z"),
  })
}

describe("QuotationRefresh module", () => {
  it("conserva el source exacto después del round-trip canónico a cotización", async () => {
    const cards = canonicalOfferCards({
      outcome: {
        results: {
          result_sets: [{
            artifact_id: "66666666-6666-4666-8666-666666666666",
            product: "flights",
            query: {
              origin: "EZE",
              destination: "MAD",
              departureDate: "2026-09-01",
              returnDate: "2026-09-10",
              adults: 2,
              children: 0,
              infants: 0,
              cabin: "Y",
            },
            data: [{
              id: "flight-canonical",
              provider: "STARLING",
              airline: { code: "AR", name: "Aerolíneas Argentinas" },
              price: { amount: 950, currency: "USD", basis: "COMMISSIONABLE_GROSS" },
              cabin: "Y",
              baggage: { checked: true, carry_on: false },
              refundable: true,
              legs: [{
                origin: "EZE",
                destination: "MAD",
                departure_at: "2026-09-01T12:00:00-03:00",
                arrival_at: "2026-09-02T05:00:00+02:00",
                segments: [{
                  marketing_airline: "AR",
                  flight_number: "1132",
                  departure: { airport_code: "EZE", date: "2026-09-01", time: "12:00" },
                  arrival: { airport_code: "MAD", date: "2026-09-02", time: "05:00" },
                }],
              }],
            }],
          }],
        },
      },
    })
    const payload = buildQuotationPayload({
      lead: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        contact_name: "Ada",
        destination: "Madrid",
        region: "EUROPA",
        agency_id: "33333333-3333-4333-8333-333333333333",
      },
      selectedFlight: cards.flights?.[0] ?? null,
      selectedHotels: [],
      generalData: {
        departureDate: "2026-09-01",
        returnDate: "2026-09-10",
        adults: 2,
        children: 0,
        infants: 0,
      },
    })
    const mapped = payload.options[0].items[0]
    const line = item(91, {
      ...mapped,
      operator_id: "99999999-9999-4999-8999-999999999998",
      commission_percentage: 0,
    })
    const source = quotation([line])
    const db = new FakeDb(source)
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: [remoteItem(line)],
    }))

    await moduleFor(db, { refresh } as OfferRefreshPort).start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "91919191-9191-4191-8191-919191919191",
    })

    expect(mapped.flight_details.legs[0].segments[0]).toMatchObject({
      marketing_airline: "AR",
      flight_number: "1132",
    })
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        source: expect.objectContaining({
          artifact_id: "66666666-6666-4666-8666-666666666666",
          offer_id: "flight-canonical",
        }),
      })],
    }))
  })

  it("recupera una corrida creada por una carrera de idempotencia", async () => {
    const source = quotation([item(1)])
    const db = new FakeDb(source)
    const racedRun = {
      id: "abababab-abab-4bab-8bab-abababababab",
      org_id: source.org_id,
      agency_id: source.agency_id,
      quotation_id: source.id,
      requested_by: source.seller_id,
      idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      remote_request_id: "req_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "RUNNING",
      source_quotation_updated_at: source.updated_at,
      source_snapshot: { quotation: source },
      proposal_snapshot: null,
      summary: null,
      created_at: new Date().toISOString(),
      updated_at: "2026-08-29T12:00:00.000Z",
      completed_at: null,
      applied_at: null,
    }
    db.runInsertRace = racedRun
    const refresh = jest.fn()
    const module = moduleFor(db, { refresh } as unknown as OfferRefreshPort)

    const run = await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: racedRun.idempotency_key,
    })

    expect(run.id).toBe(racedRun.id)
    expect(run.status).toBe("RUNNING")
    expect(refresh).not.toHaveBeenCalled()
  })

  it("cierra una corrida RUNNING vencida también durante polling", async () => {
    const source = quotation([item(1)])
    const db = new FakeDb(source)
    db.tables.quotation_price_refresh_runs.push({
      id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
      org_id: source.org_id,
      agency_id: source.agency_id,
      quotation_id: source.id,
      status: "RUNNING",
      source_quotation_updated_at: source.updated_at,
      created_at: "2026-08-29T11:49:00.000Z",
      updated_at: "2026-08-29T12:00:00.000Z",
      completed_at: null,
      applied_at: null,
      proposal_snapshot: null,
      summary: null,
    })
    const module = moduleFor(db, { refresh: jest.fn() } as unknown as OfferRefreshPort)

    const run = await module.read({
      quotationId: source.id,
      runId: db.tables.quotation_price_refresh_runs[0].id,
      orgId: source.org_id,
      agencyId: source.agency_id,
    })

    expect(run.status).toBe("FAILED")
    expect(run.error).toContain("tiempo permitido")
  })

  it("parte lotes remotos de hasta 50 y conserva todas las líneas", async () => {
    const lines = Array.from({ length: 51 }, (_, index) => item(index + 1))
    const db = new FakeDb(quotation(lines))
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: request.items.map((requestItem: any) => remoteItem(lines.find(line => line.id === requestItem.client_item_id))),
    }))
    const module = moduleFor(db, { refresh } as OfferRefreshPort)
    const run = await module.start({
      quotationId: db.tables.quotations[0].id,
      orgId: db.tables.quotations[0].org_id,
      agencyId: db.tables.quotations[0].agency_id,
      actorId: db.tables.quotations[0].seller_id,
      expectedUpdatedAt: db.tables.quotations[0].updated_at,
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })

    expect(refresh).toHaveBeenCalledTimes(2)
    expect(refresh.mock.calls.map(call => call[0].items.length)).toEqual([50, 1])
    expect(run.items).toHaveLength(51)
  })

  it("descarta el source exacto si la identidad o el contexto global cambiaron", async () => {
    const editedRoute = canonicalFlight(1, { flight_route: "EZE - BCN" })
    const changedPassengers = canonicalFlight(2)
    const source = quotation([editedRoute, changedPassengers])
    source.adults = 3
    const db = new FakeDb(source)
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: request.items.map((requestItem: any) => remoteItem(
        requestItem.client_item_id === editedRoute.id ? editedRoute : changedPassengers
      )),
    }))
    const module = moduleFor(db, { refresh } as OfferRefreshPort)

    await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "acacacac-acac-4cac-8cac-acacacacacac",
    })

    const requests = refresh.mock.calls[0][0].items
    const routeRequest = requests.find((entry: any) => entry.client_item_id === editedRoute.id)
    expect(routeRequest).toMatchObject({
      source: undefined,
      fallback: { query: { destination: "BCN", adults: 3 } },
    })
    expect(routeRequest.fallback.identity.segments[0]).toMatchObject({ origin: "EZE", destination: "BCN" })
    expect(requests.find((entry: any) => entry.client_item_id === changedPassengers.id)).toMatchObject({
      source: undefined,
      fallback: { query: { adults: 3 } },
    })
  })

  it("detecta drift de equipaje de mano y reembolsabilidad en la identidad pública", async () => {
    const changedConditions = canonicalFlight(1, {
      flight_details: {
        baggage: { checked: true, carry_on: true },
        refundable: false,
        legs: [{
          flight_type: "outbound",
          segments: [{
            marketing_airline: "AR",
            flight_number: "1132",
            departure: { airport_code: "EZE", date: "2026-09-01", time: "12:00" },
            arrival: { airport_code: "MAD", date: "2026-09-02", time: "05:00" },
          }],
        }],
      },
    })
    const source = quotation([changedConditions])
    const db = new FakeDb(source)
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: [remoteItem(changedConditions)],
    }))
    const module = moduleFor(db, { refresh } as OfferRefreshPort)

    await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "afafafaf-afaf-4faf-8faf-afafafafafaf",
    })

    expect(refresh.mock.calls[0][0].items[0]).toMatchObject({
      source: undefined,
      fallback: { identity: { carry_on: true, refundable: false } },
    })
  })

  it("conserva un source canónico de hotel cuando rooms viene como arreglo y no hubo edición", async () => {
    const hotel = item(1, {
      item_type: "HOTEL",
      provider: "EUROVIPS",
      hotel_name: "Hotel Central",
      destination_city: "Madrid",
      room_type: "Doble",
      meal_plan: "DESAYUNO",
      checkin_date: "2026-09-01",
      checkout_date: "2026-09-10",
      rooms: 1,
      offer_source: {
        artifact_id: "66666666-6666-4666-8666-666666666666",
        product: "hotels",
        offer_id: "hotel-1",
        selection_id: "room-1",
      },
      offer_refresh_fallback: {
        product: "hotels",
        query: {
          destination: "Madrid",
          checkinDate: "2026-09-01",
          checkoutDate: "2026-09-10",
          adults: 2,
          children: 0,
          rooms: [{ adults: 2, count: 1 }],
        },
        identity: {
          kind: "hotel_room",
          hotel_name: "Hotel Central",
          city: "Madrid",
          room_name: "Doble",
          board: "Breakfast",
          check_in: "2026-09-01",
          check_out: "2026-09-10",
        },
      },
    })
    const source = quotation([hotel])
    const db = new FakeDb(source)
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: [{
        ...remoteItem(hotel),
        source: { type: "search_artifact", ...hotel.offer_source },
        product: "hotels",
        provider: "EUROVIPS",
        current: { price: { amount: 100, currency: "USD", basis: "AGENCY_NET" }, source: { type: "search_artifact", ...hotel.offer_source } },
      }],
    }))
    const module = moduleFor(db, { refresh } as OfferRefreshPort)

    await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "adadadad-adad-4dad-8dad-adadadadadad",
    })

    expect(refresh.mock.calls[0][0].items[0].source).toMatchObject({ product: "hotels", offer_id: "hotel-1" })
  })

  it("compone fechas completas en fallback legacy y no investiga hoteles con menores sin edades", async () => {
    const legacyFlight = item(1, {
      offer_source: null,
      flight_date: "2026-09-01",
      flight_return_date: "2026-09-10",
      flight_class: "ECONOMY",
      flight_details: {
        baggage: { checked: false },
        legs: [{
          flight_type: "outbound",
          departure: { city_code: "EZE", time: "12:00" },
          arrival: { city_code: "MAD", time: "05:00" },
        }, {
          flight_type: "inbound",
          departure: { city_code: "MAD", time: "22:30" },
          arrival: { city_code: "EZE", time: "06:00" },
        }],
      },
    })
    const legacyHotel = item(2, {
      item_type: "HOTEL",
      offer_source: null,
      hotel_name: "Hotel sin ocupación canónica",
      destination_city: "Madrid",
      checkin_date: "2026-09-01",
      checkout_date: "2026-09-10",
      flight_details: null,
    })
    const unknownBasis = item(3, { cost_basis: null })
    const source = quotation([legacyFlight, legacyHotel, unknownBasis])
    source.children = 1
    const db = new FakeDb(source)
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: request.items.map((requestItem: any) => remoteItem(
        requestItem.client_item_id === legacyFlight.id ? legacyFlight : legacyHotel
      )),
    }))
    const module = moduleFor(db, { refresh } as OfferRefreshPort)

    const started = await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh.mock.calls[0][0].items).toHaveLength(1)
    expect(refresh.mock.calls[0][0].items[0].fallback).toMatchObject({
      product: "flights",
      identity: {
        checked_baggage: false,
        segments: [
          { origin: "EZE", destination: "MAD", departure_at: "2026-09-01T12:00" },
          { origin: "MAD", destination: "EZE", departure_at: "2026-09-10T22:30" },
        ],
      },
    })
    expect(started.items.find(view => view.line_id === legacyHotel.id)).toMatchObject({
      outcome: "NOT_REFRESHABLE",
      allowed_actions: ["KEEP_CURRENT"],
      requires_decision: true,
      error: { retryable: false },
    })
    expect(started.items.find(view => view.line_id === unknownBasis.id)).toMatchObject({
      outcome: "NOT_REFRESHABLE",
      requires_decision: true,
      current: { cost_basis: "UNKNOWN" },
      error: { code: "PRICE_BASIS_UNCONFIRMED" },
    })
  })

  it("aplica costos efectivos sin duplicar fee en SIMPLE ni comisión en COMMISSIONABLE", async () => {
    const simple = item(1, { admin_fee_percentage: 10, cost_amount: 100 })
    const commissionable = item(2, {
      cost_calculation_mode: "COMMISSIONABLE",
      cost_basis: "COMMISSIONABLE_GROSS",
      gross_price: 100,
      cost_amount: 0,
      commission_percentage: 20,
      admin_fee_percentage: 10,
    })
    const lines = [simple, commissionable]
    const db = new FakeDb(quotation(lines))
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1",
      request_id: request.requestId,
      status: "complete",
      checked_at: "2026-08-29T12:00:00.000Z",
      items: [remoteItem(simple, 110), remoteItem(commissionable, 110)],
    }))
    const module = moduleFor(db, {
      refresh,
    } as OfferRefreshPort)
    const started = await module.start({
      quotationId: db.tables.quotations[0].id,
      orgId: db.tables.quotations[0].org_id,
      agencyId: db.tables.quotations[0].agency_id,
      actorId: db.tables.quotations[0].seller_id,
      expectedUpdatedAt: db.tables.quotations[0].updated_at,
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    const applied = await module.apply({
      quotationId: db.tables.quotations[0].id,
      runId: started.id,
      orgId: db.tables.quotations[0].org_id,
      agencyId: db.tables.quotations[0].agency_id,
      actorId: db.tables.quotations[0].seller_id,
      expectedUpdatedAt: started.quotation_updated_at,
      expectedRunUpdatedAt: started.updated_at,
      decisions: lines.map(line => ({ line_id: line.id, action: "USE_REFRESHED" as const })),
      optionDecisions: [{
        option_id: db.tables.quotations[0].quotation_options[0].id,
        sale_total: 500,
        confirmed: true,
      }],
    })

    expect(applied.status).toBe("APPLIED")
    expect(refresh.mock.calls[0][0].items.map((requestItem: any) => requestItem.current)).toEqual([
      { amount: 100, currency: "USD", basis: "AGENCY_NET" },
      { amount: 100, currency: "USD", basis: "COMMISSIONABLE_GROSS" },
    ])
    const written = db.appliedArgs.p_items
    expect(db.appliedArgs.p_options[0].is_selected).toBe(true)
    const simpleWritten = written.find((row: any) => row.description === "Vuelo 1")
    const commissionWritten = written.find((row: any) => row.description === "Vuelo 2")
    expect(simpleWritten.cost_amount).toBe(110)
    expect(getQuotationItemEffectiveUnitCost(simpleWritten)).toBe(121)
    expect(commissionWritten.gross_price).toBe(110)
    expect(getQuotationItemEffectiveUnitCost(commissionWritten)).toBe(99)
  })

  it("no ofrece aplicar un precio que no fue repriced exactamente por el mismo proveedor", async () => {
    const original = canonicalFlight(1)
    const db = new FakeDb(quotation([original]))
    const module = moduleFor(db, {
      refresh: jest.fn(async (request: any) => ({
        schema_version: "offer-refresh.v1",
        request_id: request.requestId,
        status: "complete",
        checked_at: "2026-08-29T12:00:00.000Z",
        items: [{ ...remoteItem(original, 120), provider: "EUROVIPS" }],
      })),
    } as OfferRefreshPort)

    const started = await module.start({
      quotationId: db.tables.quotations[0].id,
      orgId: db.tables.quotations[0].org_id,
      agencyId: db.tables.quotations[0].agency_id,
      actorId: db.tables.quotations[0].seller_id,
      expectedUpdatedAt: db.tables.quotations[0].updated_at,
      idempotencyKey: "aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae",
    })

    expect(started.items[0]).toMatchObject({
      allowed_actions: ["KEEP_CURRENT"],
      error: { code: "PROVIDER_MISMATCH" },
    })
  })

  it("no presenta como validado un UNCHANGED exacto atribuido a otro proveedor", async () => {
    const original = canonicalFlight(1)
    const db = new FakeDb(quotation([original]))
    const module = moduleFor(db, {
      refresh: jest.fn(async (request: any) => ({
        schema_version: "offer-refresh.v1",
        request_id: request.requestId,
        status: "complete",
        checked_at: "2026-08-29T12:00:00.000Z",
        items: [{ ...remoteItem(original), provider: "EUROVIPS" }],
      })),
    } as OfferRefreshPort)

    const started = await module.start({
      quotationId: db.tables.quotations[0].id,
      orgId: db.tables.quotations[0].org_id,
      agencyId: db.tables.quotations[0].agency_id,
      actorId: db.tables.quotations[0].seller_id,
      expectedUpdatedAt: db.tables.quotations[0].updated_at,
      idempotencyKey: "bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc",
    })

    expect(started.items[0]).toMatchObject({
      outcome: "NOT_REFRESHABLE",
      allowed_actions: ["KEEP_CURRENT"],
      requires_decision: true,
      error: { code: "PROVIDER_MISMATCH" },
    })
    expect(started.summary).toMatchObject({ unchanged_count: 0, not_refreshable_count: 1 })
  })

  it("falla con mensaje accionable antes de emitir si algún servicio no tiene operador", async () => {
    const original = canonicalFlight(1)
    const source = quotation([original])
    const db = new FakeDb(source)
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: [remoteItem(original, 120)],
    }))
    const module = moduleFor(db, {
      refresh,
    } as OfferRefreshPort)

    ;(original as any).operator_id = null
    await expect(module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "bebebebe-bebe-4ebe-8ebe-bebebebebebe",
    })).rejects.toMatchObject({
      code: "MISSING_OPERATOR",
      message: expect.stringContaining("Asigná un operador"),
    })
    expect(refresh).not.toHaveBeenCalled()

    ;(original as any).operator_id = "99999999-9999-4999-8999-999999999998"
    const started = await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "bfbfbfbf-bfbf-4fbf-8fbf-bfbfbfbfbfbf",
    })
    ;(original as any).operator_id = null

    await expect(module.apply({
      quotationId: source.id,
      runId: started.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: started.quotation_updated_at,
      expectedRunUpdatedAt: started.updated_at,
      decisions: [{ line_id: original.id, action: "USE_REFRESHED" }],
      optionDecisions: [{
        option_id: source.quotation_options[0].id,
        sale_total: 500,
        confirmed: true,
      }],
    })).rejects.toMatchObject({
      code: "MISSING_OPERATOR",
      message: expect.stringContaining("Asigná un operador"),
    })
    expect(db.appliedArgs).toBeUndefined()
  })

  it("reemplaza una oferta por identidad canónica con fechas completas y limpia el source anterior", async () => {
    const original = item(1, { notes: "Notas del vuelo anterior" })
    const db = new FakeDb(quotation([original]))
    const identity = {
      airline: { code: "IB", name: "Iberia" },
      cabin: "Y",
      checked_baggage: false,
      carry_on: true,
      refundable: false,
      legs: [{
        departure_at: "2026-09-01T12:00:00-03:00",
        arrival_at: "2026-09-02T05:00:00+02:00",
        segments: [{
          marketingAirline: "IB",
          flightNumber: "6844",
          departure: { airportCode: "EZE", city: "Buenos Aires", date: "2026-09-01", time: "12:00" },
          arrival: { airportCode: "MAD", city: "Madrid", date: "2026-09-02", time: "05:00" },
        }],
      }],
    }
    const module = moduleFor(db, {
      refresh: jest.fn(async (request: any) => ({
        schema_version: "offer-refresh.v1",
        request_id: request.requestId,
        status: "complete",
        checked_at: "2026-08-29T12:00:00.000Z",
        items: [{
          ...remoteItem(original),
          method: "fresh_research",
          outcome: "REPLACEMENT_FOUND",
          confidence: "alternative",
          current: null,
          candidates: [{
            provider: "STARLING",
            price: { amount: 130, currency: "USD", basis: "AGENCY_NET" },
            identity,
            confidence: "alternative",
            differences: [{ field: "identity", before: "old", after: "new", material: true }],
          }],
          differences: [{ field: "identity", before: "old", after: "new", material: true }],
          allowed_actions: ["REVIEW", "SELECT_REPLACEMENT"],
        }],
      })),
    } as OfferRefreshPort)
    const started = await module.start({
      quotationId: db.tables.quotations[0].id,
      orgId: db.tables.quotations[0].org_id,
      agencyId: db.tables.quotations[0].agency_id,
      actorId: db.tables.quotations[0].seller_id,
      expectedUpdatedAt: db.tables.quotations[0].updated_at,
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })
    expect(started.items[0].candidates?.[0].label).toContain("Iberia · EZE → MAD")
    expect(started.items[0].candidates?.[0].label).toContain("sin equipaje despachado · equipaje de mano · no reembolsable")
    expect(started.items[0].allowed_actions).toContain("KEEP_CURRENT")
    await module.apply({
      quotationId: db.tables.quotations[0].id,
      runId: started.id,
      orgId: db.tables.quotations[0].org_id,
      agencyId: db.tables.quotations[0].agency_id,
      actorId: db.tables.quotations[0].seller_id,
      expectedUpdatedAt: started.quotation_updated_at,
      expectedRunUpdatedAt: started.updated_at,
      decisions: [{
        line_id: original.id,
        action: "USE_REPLACEMENT",
        candidate_id: `${original.id}:candidate:0`,
      }],
      optionDecisions: [{
        option_id: db.tables.quotations[0].quotation_options[0].id,
        sale_total: 500,
        confirmed: true,
      }],
    })

    const written = db.appliedArgs.p_items[0]
    expect(written).toMatchObject({
      flight_route: "EZE - MAD",
      flight_date: "2026-09-01",
      airline: "Iberia",
      notes: null,
      offer_source: null,
      offer_refresh_fallback: {
        product: "flights",
        identity: {
          kind: "flight",
          cabin: "Y",
          checked_baggage: false,
          carry_on: true,
          refundable: false,
          segments: [{
            marketing_airline: "IB",
            flight_number: "6844",
            origin: "EZE",
            destination: "MAD",
            departure_at: "2026-09-01T12:00:00-03:00",
          }],
        },
      },
      flight_details: {
        baggage: { checked: false, carry_on: true },
        refundable: false,
        legs: [{
          departure_at: "2026-09-01T12:00:00-03:00",
          arrival_at: "2026-09-02T05:00:00+02:00",
          departure: { time: "12:00" },
        }],
      },
    })
  })

  it("preserva occupancies con edades para refrescar nuevamente un hotel reemplazado", async () => {
    const original = item(1, {
      item_type: "HOTEL",
      description: "Hotel Central · Doble",
      provider: "EUROVIPS",
      hotel_name: "Hotel Central",
      destination_city: "Madrid",
      room_type: "Doble",
      meal_plan: "DESAYUNO",
      checkin_date: "2026-09-01",
      checkout_date: "2026-09-10",
      rooms: 1,
      offer_source: {
        artifact_id: "66666666-6666-4666-8666-666666666666",
        product: "hotels",
        offer_id: "hotel-old",
        selection_id: "room-old",
      },
      offer_refresh_fallback: {
        product: "hotels",
        query: {
          destination: "Madrid",
          check_in: "2026-09-01",
          check_out: "2026-09-10",
          occupancies: [{ adults: 2, children: 1, child_ages: [7] }],
          rooms: [{ count: 1 }],
        },
        identity: {
          kind: "hotel_room",
          hotel_name: "Hotel Central",
          city: "Madrid",
          room_name: "Doble",
          board: "Breakfast",
          check_in: "2026-09-01",
          check_out: "2026-09-10",
        },
      },
    })
    const source = quotation([original])
    source.children = 1
    const firstDb = new FakeDb(source)
    const candidateIdentity = {
      hotel: {
        name: "Hotel Plaza",
        city: "Madrid",
        check_in: "2026-09-01",
        check_out: "2026-09-10",
      },
      room: { name: "Suite familiar", board: "Breakfast" },
    }
    const firstModule = moduleFor(firstDb, {
      refresh: jest.fn(async (request: any) => ({
        schema_version: "offer-refresh.v1",
        request_id: request.requestId,
        status: "complete",
        checked_at: "2026-08-29T12:00:00.000Z",
        items: [{
          ...remoteItem(original),
          source: { type: "search_artifact", ...original.offer_source },
          product: "hotels",
          provider: "EUROVIPS",
          method: "fresh_research",
          outcome: "REPLACEMENT_FOUND",
          confidence: "alternative",
          current: null,
          candidates: [{
            provider: "EUROVIPS",
            price: { amount: 130, currency: "USD", basis: "AGENCY_NET" },
            identity: candidateIdentity,
            confidence: "alternative",
            differences: [],
          }],
          allowed_actions: ["KEEP_CURRENT", "SELECT_REPLACEMENT"],
        }],
      })),
    } as OfferRefreshPort)
    const started = await firstModule.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
    })
    await firstModule.apply({
      quotationId: source.id,
      runId: started.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: started.quotation_updated_at,
      expectedRunUpdatedAt: started.updated_at,
      decisions: [{
        line_id: original.id,
        action: "USE_REPLACEMENT",
        candidate_id: `${original.id}:candidate:0`,
      }],
      optionDecisions: [{ option_id: source.quotation_options[0].id, sale_total: 500, confirmed: true }],
    })

    const replaced = firstDb.appliedArgs.p_items[0]
    expect(replaced.offer_refresh_fallback).toMatchObject({
      query: { occupancies: [{ child_ages: [7] }] },
      identity: {
        kind: "hotel_room",
        hotel_name: "Hotel Plaza",
        room_name: "Suite familiar",
        board: "Breakfast",
      },
    })

    const secondLine = item(2, {
      ...replaced,
      id: "00000000-0000-4000-8000-000000000002",
      quotation_id: source.id,
      option_id: source.quotation_options[0].id,
      org_id: source.org_id,
    })
    const secondSource = quotation([secondLine])
    secondSource.children = 1
    const secondDb = new FakeDb(secondSource)
    const secondRefresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: request.items.map((entry: any) => ({
        client_item_id: entry.client_item_id,
        product: "hotels" as const,
        provider: "EUROVIPS",
        method: "fresh_research" as const,
        outcome: "NOT_REFRESHABLE" as const,
        confidence: "none" as const,
        previous: { price: entry.current },
        current: null,
        candidates: [],
        differences: [],
        allowed_actions: ["KEEP_CURRENT" as const],
        provider_checked_at: "2026-08-29T12:00:00.000Z",
        provider_expires_at: null,
        error: { code: "NO_MATCH", message: "Sin coincidencia", retryable: false },
      })),
    }))
    const secondModule = moduleFor(secondDb, { refresh: secondRefresh } as OfferRefreshPort)
    await secondModule.start({
      quotationId: secondSource.id,
      orgId: secondSource.org_id,
      agencyId: secondSource.agency_id,
      actorId: secondSource.seller_id,
      expectedUpdatedAt: secondSource.updated_at,
      idempotencyKey: "dededede-dede-4ede-8ede-dededededede",
    })

    expect(secondRefresh).toHaveBeenCalledTimes(1)
    expect(secondRefresh.mock.calls[0][0].items[0]).toMatchObject({
      source: undefined,
      fallback: {
        query: { occupancies: [{ child_ages: [7] }] },
        identity: { kind: "hotel_room", hotel_name: "Hotel Plaza", room_name: "Suite familiar" },
      },
    })
  })

  it("no reutiliza source exacto cuando el fallback hotelero contiene edades de menores", async () => {
    const hotel = item(1, {
      item_type: "HOTEL",
      provider: "EUROVIPS",
      hotel_name: "Hotel Central",
      destination_city: "Madrid",
      room_type: "Doble",
      meal_plan: "DESAYUNO",
      checkin_date: "2026-09-01",
      checkout_date: "2026-09-10",
      rooms: 1,
      offer_source: {
        artifact_id: "77777777-7777-4777-8777-777777777777",
        product: "hotels",
        offer_id: "hotel-old",
        selection_id: "room-old",
      },
      offer_refresh_fallback: {
        product: "hotels",
        query: {
          destination: "Madrid",
          check_in: "2026-09-01",
          check_out: "2026-09-10",
          occupancies: [{ adults: 2, children: 1, childrenAges: [12] }],
          rooms: 1,
        },
        identity: {
          kind: "hotel_room",
          hotel_name: "Hotel Central",
          city: "Madrid",
          room_name: "Doble",
          board: "Breakfast",
          check_in: "2026-09-01",
          check_out: "2026-09-10",
        },
      },
    })
    const source = quotation([hotel])
    source.children = 1
    const db = new FakeDb(source)
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: request.items.map((entry: any) => ({
        client_item_id: entry.client_item_id,
        product: "hotels" as const,
        provider: "EUROVIPS",
        method: "fresh_research" as const,
        outcome: "NOT_REFRESHABLE" as const,
        confidence: "none" as const,
        previous: { price: entry.current },
        current: null,
        candidates: [],
        differences: [],
        allowed_actions: ["KEEP_CURRENT" as const],
        provider_checked_at: "2026-08-29T12:00:00.000Z",
        provider_expires_at: null,
        error: { code: "NO_MATCH", message: "Sin coincidencia", retryable: false },
      })),
    }))
    const module = moduleFor(db, { refresh } as OfferRefreshPort)

    await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "efefefef-efef-4fef-8fef-efefefefefef",
    })

    expect(refresh.mock.calls[0][0].items[0]).toMatchObject({
      source: undefined,
      fallback: {
        query: { occupancies: [{ childrenAges: [12] }] },
      },
    })
  })

  it("reutiliza un review vigente y reemplaza uno vencido al iniciar con otra clave", async () => {
    const original = canonicalFlight(1)
    const source = quotation([original])
    const db = new FakeDb(source)
    const refresh = jest.fn(async (request: any) => ({
      schema_version: "offer-refresh.v1" as const,
      request_id: request.requestId,
      status: "complete" as const,
      checked_at: "2026-08-29T12:00:00.000Z",
      items: [remoteItem(original)],
    }))
    const module = moduleFor(db, { refresh } as OfferRefreshPort)
    const base = {
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
    }

    const first = await module.start({ ...base, idempotencyKey: "babbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })
    const reused = await module.start({ ...base, idempotencyKey: "cacccccc-cccc-4ccc-8ccc-cccccccccccc" })
    expect(reused.id).toBe(first.id)
    expect(refresh).toHaveBeenCalledTimes(1)

    const firstRow = db.tables.quotation_price_refresh_runs.find(row => row.id === first.id)
    firstRow.valid_until = "2026-08-29T12:04:00.000Z"
    const replacement = await module.start({ ...base, idempotencyKey: "dadddddd-dddd-4ddd-8ddd-dddddddddddd" })
    expect(replacement.status).toBe("REVIEW_REQUIRED")
    expect(replacement.id).not.toBe(first.id)
    expect(firstRow.status).toBe("STALE")
    expect(firstRow.error_code).toBe("REVIEW_EXPIRED")
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it("expira el review durante polling y nunca permite aplicarlo vencido", async () => {
    const original = canonicalFlight(1)
    const source = quotation([original])
    const db = new FakeDb(source)
    const module = moduleFor(db, {
      refresh: jest.fn(async (request: any) => ({
        schema_version: "offer-refresh.v1",
        request_id: request.requestId,
        status: "complete",
        checked_at: "2026-08-29T12:00:00.000Z",
        items: [remoteItem(original, 120)],
      })),
    } as OfferRefreshPort)
    const started = await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "eaffffff-ffff-4fff-8fff-ffffffffffff",
    })
    const row = db.tables.quotation_price_refresh_runs.find(entry => entry.id === started.id)
    row.valid_until = "2026-08-29T12:04:00.000Z"

    await expect(module.apply({
      quotationId: source.id,
      runId: started.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      expectedRunUpdatedAt: started.updated_at,
      decisions: [],
      optionDecisions: [],
    })).rejects.toMatchObject({ code: "INVALID_STATE" })
    expect(db.appliedArgs).toBeUndefined()
    const polled = await module.read({
      quotationId: source.id,
      runId: started.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
    })
    expect(polled).toMatchObject({ status: "STALE", error: expect.stringContaining("venció") })
  })

  it("descarta un review con scope y CAS antes de volver a consultar", async () => {
    const original = canonicalFlight(1)
    const source = quotation([original])
    const db = new FakeDb(source)
    const module = moduleFor(db, {
      refresh: jest.fn(async (request: any) => ({
        schema_version: "offer-refresh.v1",
        request_id: request.requestId,
        status: "complete",
        checked_at: "2026-08-29T12:00:00.000Z",
        items: [remoteItem(original)],
      })),
    } as OfferRefreshPort)
    const started = await module.start({
      quotationId: source.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      actorId: source.seller_id,
      expectedUpdatedAt: source.updated_at,
      idempotencyKey: "faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })

    await expect(module.discard({
      quotationId: source.id,
      runId: started.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      expectedRunUpdatedAt: "2026-08-29T00:00:00.000Z",
    })).rejects.toMatchObject({ code: "RUN_CHANGED" })
    await expect(module.discard({
      quotationId: source.id,
      runId: started.id,
      orgId: source.org_id,
      agencyId: "00000000-0000-4000-8000-000000000001",
      expectedRunUpdatedAt: started.updated_at,
    })).rejects.toMatchObject({ code: "NOT_FOUND" })

    const discarded = await module.discard({
      quotationId: source.id,
      runId: started.id,
      orgId: source.org_id,
      agencyId: source.agency_id,
      expectedRunUpdatedAt: started.updated_at,
    })
    expect(discarded).toMatchObject({ status: "STALE", error: expect.stringContaining("descartada") })
  })

  it("revalida valid_until dentro del RPC antes de reemplazar la estructura", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260829000004_quotation_price_refresh.sql"),
      "utf8"
    )
    const expiryGuard = sql.indexOf("v_run.valid_until IS NULL OR v_run.valid_until <= clock_timestamp()")
    const destructiveSwap = sql.indexOf("DELETE FROM public.quotation_items")
    expect(expiryGuard).toBeGreaterThan(-1)
    expect(destructiveSwap).toBeGreaterThan(expiryGuard)
  })
})
