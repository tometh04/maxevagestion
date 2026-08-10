/**
 * Reservas por cadena de hotel (pedido Lozada/Maxi).
 *
 * Cubre la lógica pura de getHotelBookings: unión operación + tramos, filtro de
 * rango sobre COALESCE(checkin, salida) con fallback, resumen sin doble conteo
 * de monto en multidestino, y scope por rol (SELLER solo ve lo suyo).
 */
import { getHotelBookings, type HotelBookingsUser } from "../hotel-bookings"

// FX determinista y sin React.cache (evita el problema de exchange-rates fuera
// del runtime de Next). USD no dispara conversión igual.
jest.mock("@/lib/accounting/exchange-rates", () => ({
  buildExchangeRateMap: jest.fn(async () => () => 1000),
  getLatestExchangeRate: jest.fn(async () => 1000),
  DEFAULT_USD_ARS_FALLBACK_RATE: 1000,
}))

type Call = [string, ...any[]]

/** Query builder chainable y thenable que resuelve a un resultado fijo. */
function makeBuilder(result: { data?: any[]; error?: any }) {
  const calls: Call[] = []
  const builder: any = {
    calls,
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (col: string, val: any) => {
      calls.push(["eq", col, val])
      return builder
    },
    in: (col: string, val: any) => {
      calls.push(["in", col, val])
      return builder
    },
    ilike: (col: string, val: any) => {
      calls.push(["ilike", col, val])
      return builder
    },
    not: (col: string, op: string, val: any) => {
      calls.push(["not", col, op, val])
      return builder
    },
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: result.data ?? [], error: result.error ?? null }).then(
        resolve,
        reject
      ),
  }
  return builder
}

/** supabase mock: builder por tabla, con acceso a los calls registrados. */
function makeSupabase(perTable: Record<string, { data?: any[]; error?: any }>) {
  const builders: Record<string, any> = {}
  const supabase: any = {
    from: (table: string) => {
      const b = makeBuilder(perTable[table] ?? { data: [] })
      builders[table] = b
      return b
    },
  }
  return { supabase, builders }
}

const opCustomers = (first: string, last: string) => [
  { role: "MAIN", customers: { first_name: first, last_name: last } },
]

const adminUser: HotelBookingsUser = { id: "admin-1", role: "ADMIN", org_id: "org-1" }
const AGENCIES = ["ag-1", "ag-2"]

describe("getHotelBookings", () => {
  it("une reservas de operación y de tramos", async () => {
    const { supabase } = makeSupabase({
      operations: {
        data: [
          {
            id: "op-1",
            file_code: "F-1",
            status: "CONFIRMED",
            hotel_name: "Iberostar Cancún",
            reservation_code_hotel: "IB-001",
            checkin_date: "2026-09-10",
            checkout_date: "2026-09-15",
            departure_date: "2026-09-09",
            sale_amount_total: 1000,
            sale_currency: "USD",
            currency: "USD",
            sellers: { name: "Ana" },
            operation_customers: opCustomers("Juan", "Pérez"),
          },
        ],
      },
      operation_legs: {
        data: [
          {
            hotel_name: "Iberostar Bávaro",
            reservation_code_hotel: "IB-777",
            checkin_date: "2026-09-20",
            checkout_date: "2026-09-25",
            departure_date: "2026-09-19",
            operations: {
              id: "op-2",
              file_code: "F-2",
              status: "CONFIRMED",
              org_id: "org-1",
              seller_id: "s-9",
              agency_id: "ag-1",
              departure_date: "2026-09-19",
              sale_amount_total: 500,
              sale_currency: "USD",
              currency: "USD",
              sellers: { name: "Luis" },
              operation_customers: opCustomers("María", "Gómez"),
            },
          },
        ],
      },
    })

    const res = await getHotelBookings(supabase, adminUser, AGENCIES, { hotel: "Iberostar" })

    expect(res.rows).toHaveLength(2)
    const codes = res.rows.map((r) => r.reservationCode).sort()
    expect(codes).toEqual(["IB-001", "IB-777"])
    expect(res.rows.find((r) => r.reservationCode === "IB-777")?.source).toBe("leg")
    expect(res.rows.find((r) => r.reservationCode === "IB-001")?.customerName).toBe("Juan Pérez")
    expect(res.summary.map((s) => s.hotel).sort()).toEqual([
      "Iberostar Bávaro",
      "Iberostar Cancún",
    ])
  })

  it("aplica el ilike de cadena con comodines escapados", async () => {
    const { supabase, builders } = makeSupabase({ operations: { data: [] }, operation_legs: { data: [] } })
    await getHotelBookings(supabase, adminUser, AGENCIES, { hotel: "Ibero%star" })
    const opIlike = builders.operations.calls.find((c: Call) => c[0] === "ilike")
    expect(opIlike).toEqual(["ilike", "hotel_name", "%Ibero\\%star%"])
  })

  it("filtra por rango sobre check-in con fallback a la fecha de salida", async () => {
    const { supabase } = makeSupabase({
      operations: {
        data: [
          // Dentro del rango por check-in.
          {
            id: "op-in", file_code: "A", status: "OK",
            hotel_name: "Iberostar", reservation_code_hotel: "IN",
            checkin_date: "2026-09-10", checkout_date: null, departure_date: "2026-09-01",
            sale_amount_total: 100, sale_currency: "USD", currency: "USD",
            sellers: { name: "Ana" }, operation_customers: [],
          },
          // check-in NULL → cae a departure_date, que está dentro del rango.
          {
            id: "op-fallback", file_code: "B", status: "OK",
            hotel_name: "Iberostar", reservation_code_hotel: "FB",
            checkin_date: null, checkout_date: null, departure_date: "2026-09-12",
            sale_amount_total: 100, sale_currency: "USD", currency: "USD",
            sellers: { name: "Ana" }, operation_customers: [],
          },
          // Fuera del rango (check-in posterior).
          {
            id: "op-out", file_code: "C", status: "OK",
            hotel_name: "Iberostar", reservation_code_hotel: "OUT",
            checkin_date: "2026-12-01", checkout_date: null, departure_date: "2026-11-01",
            sale_amount_total: 100, sale_currency: "USD", currency: "USD",
            sellers: { name: "Ana" }, operation_customers: [],
          },
        ],
      },
      operation_legs: { data: [] },
    })

    const res = await getHotelBookings(supabase, adminUser, AGENCIES, {
      hotel: "Iberostar",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    })

    const codes = res.rows.map((r) => r.reservationCode).sort()
    expect(codes).toEqual(["FB", "IN"])
    expect(codes).not.toContain("OUT")
  })

  it("no doble-cuenta el monto en multidestino (suma solo la capa operación)", async () => {
    // Misma operación op-1 con hotel a nivel operación (Cancún) y un tramo
    // (Bávaro). Son 2 reservas distintas, pero el monto de la operación (1000)
    // debe contarse una sola vez.
    const { supabase } = makeSupabase({
      operations: {
        data: [
          {
            id: "op-1", file_code: "F-1", status: "OK",
            hotel_name: "Iberostar Cancún", reservation_code_hotel: "OP",
            checkin_date: "2026-09-10", checkout_date: null, departure_date: "2026-09-09",
            sale_amount_total: 1000, sale_currency: "USD", currency: "USD",
            sellers: { name: "Ana" }, operation_customers: [],
          },
        ],
      },
      operation_legs: {
        data: [
          {
            hotel_name: "Iberostar Bávaro", reservation_code_hotel: "LEG",
            checkin_date: "2026-09-12", checkout_date: null, departure_date: "2026-09-11",
            operations: {
              id: "op-1", file_code: "F-1", status: "OK", org_id: "org-1",
              seller_id: "s-1", agency_id: "ag-1", departure_date: "2026-09-11",
              sale_amount_total: 1000, sale_currency: "USD", currency: "USD",
              sellers: { name: "Ana" }, operation_customers: [],
            },
          },
        ],
      },
    })

    const res = await getHotelBookings(supabase, adminUser, AGENCIES, { hotel: "Iberostar" })

    expect(res.rows).toHaveLength(2)
    const totalMonto = res.summary.reduce((acc, s) => acc + s.montoUsd, 0)
    expect(totalMonto).toBe(1000) // no 2000
    expect(res.summary.find((s) => s.hotel === "Iberostar Bávaro")?.montoUsd).toBe(0)
    expect(res.summary.find((s) => s.hotel === "Iberostar Cancún")?.montoUsd).toBe(1000)
  })

  it("convierte ARS a USD con el TC (monto referencial)", async () => {
    const { supabase } = makeSupabase({
      operations: {
        data: [
          {
            id: "op-ars", file_code: "F", status: "OK",
            hotel_name: "Iberostar", reservation_code_hotel: "ARS",
            checkin_date: "2026-09-10", checkout_date: null, departure_date: "2026-09-09",
            sale_amount_total: 1_000_000, sale_currency: "ARS", currency: "ARS",
            sellers: { name: "Ana" }, operation_customers: [],
          },
        ],
      },
      operation_legs: { data: [] },
    })

    const res = await getHotelBookings(supabase, adminUser, AGENCIES, { hotel: "Iberostar" })
    // 1.000.000 ARS / 1000 = 1000 USD (mock de FX)
    expect(res.summary[0].montoUsd).toBe(1000)
  })

  it("scopea a SELLER a solo sus operaciones (operación y tramos)", async () => {
    const seller: HotelBookingsUser = { id: "seller-1", role: "SELLER", org_id: "org-1" }
    const { supabase, builders } = makeSupabase({
      operations: { data: [] },
      operation_legs: { data: [] },
    })

    await getHotelBookings(supabase, seller, AGENCIES, { hotel: "Iberostar" })

    // Operaciones: applyOperationsFilters → eq("seller_id", user.id)
    expect(builders.operations.calls).toContainEqual(["eq", "seller_id", "seller-1"])
    // Tramos: scope replicado sobre el embed → eq("operations.seller_id", user.id)
    expect(builders.operation_legs.calls).toContainEqual([
      "eq",
      "operations.seller_id",
      "seller-1",
    ])
  })

  it("propaga error de la query de operaciones", async () => {
    const { supabase } = makeSupabase({
      operations: { error: { message: "boom" } },
      operation_legs: { data: [] },
    })
    await expect(
      getHotelBookings(supabase, adminUser, AGENCIES, { hotel: "Iberostar" })
    ).rejects.toThrow("boom")
  })
})
