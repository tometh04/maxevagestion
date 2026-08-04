/**
 * @jest-environment node
 *
 * Route test para GET /api/expenses/monthly.
 *
 * Foco: atribución por oficina de los gastos recurrentes. Un gasto de una
 * oficina (Madero) pagado desde una cuenta de otra (Rosario) debe contar en
 * SU oficina (Madero), no en la de la cuenta pagadora. Regresión del bug donde
 * los recurrentes se filtraban por la agencia de la cuenta financiera.
 */
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canPerformAction } from "@/lib/permissions-api"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
// La route resuelve permisos vía getRequestPermissions, que además de
// canPerformAction usa getUserAgencyIds + resolveUserPermissions.
jest.mock("@/lib/permissions-api", () => ({
  canPerformAction: jest.fn(),
  getUserAgencyIds: jest.fn(async () => []),
  isOwnDataOnlyResolved: jest.fn(() => false),
}))
jest.mock("@/lib/permissions-agency", () => ({
  resolveUserPermissions: jest.fn(async () => null),
}))
// El TC lo controla cada test: la valuación no debe depender de que haya
// cotizaciones cargadas en la base del entorno de test.
jest.mock("@/lib/accounting/exchange-rates", () => ({
  buildExchangeRateMap: jest.fn(async () => () => null),
}))
const { buildExchangeRateMap } = require("@/lib/accounting/exchange-rates")

/** Hace que la valuación use un TC fijo USD→ARS (o ninguno si es null). */
function withRate(rate: number | null) {
  ;(buildExchangeRateMap as jest.Mock).mockResolvedValue(() => rate)
}

// Query builder awaitable: cada método encadenable devuelve el mismo builder,
// y el builder es "thenable" resolviendo el dataset configurado por tabla.
function makeSupabaseMock(dataByTable: Record<string, { data: any; error: any }>) {
  return {
    from: jest.fn((table: string) => {
      const result = dataByTable[table] ?? { data: [], error: null }
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        neq: jest.fn(() => builder),
        not: jest.fn(() => builder),
        like: jest.fn(() => builder),
        gte: jest.fn(() => builder),
        lte: jest.fn(() => builder),
        in: jest.fn(() => builder),
        // `.is("reversed_at", null)`: la lectura de gastos excluye los
        // movimientos revertidos.
        is: jest.fn(() => builder),
        order: jest.fn(() => builder),
        single: jest.fn(() => Promise.resolve(result)),
        maybeSingle: jest.fn(() => Promise.resolve(result)),
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      }
      return builder
    }),
  }
}

function buildData() {
  return {
    financial_accounts: {
      data: [
        { id: "acc-rosario", agency_id: "ag-rosario" },
        { id: "acc-madero", agency_id: "ag-madero" },
      ],
      error: null,
    },
    recurring_payment_categories: { data: [], error: null },
    recurring_payments: {
      data: [
        { description: "Sueldo Melani", category_id: null, agency_id: "ag-madero" },
      ],
      error: null,
    },
    // Gasto de Madero PAGADO desde la caja de Rosario (account_id: acc-rosario)
    ledger_movements: {
      data: [
        {
          id: "lm-1",
          type: "EXPENSE",
          concept: "Gasto recurrente: Sueldo Melani",
          currency: "ARS",
          amount_original: 700000,
          category_id: null,
          movement_date: "2026-07-10T12:00:00Z",
          created_at: "2026-07-10T12:00:00Z",
          account_id: "acc-rosario",
          notes: null,
          receipt_number: null,
          financial_accounts: { id: "acc-rosario", name: "Caja Rosario", currency: "ARS" },
          users: { id: "u1", name: "Cliente" },
        },
      ],
      error: null,
    },
    cash_movements: { data: [], error: null },
  }
}

async function callGET(query: string) {
  const { GET } = require("../route")
  return GET(new Request(`http://localhost/api/expenses/monthly?${query}`))
}

describe("GET /api/expenses/monthly — atribución por oficina de recurrentes", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    const { TextDecoder, TextEncoder } = require("util")
    ;(global as any).TextDecoder = TextDecoder
    ;(global as any).TextEncoder = TextEncoder
    const { Request, Response, Headers } = require("undici")
    ;(global as any).Request = Request
    ;(global as any).Response = Response
    ;(global as any).Headers = Headers

    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: "user-1", role: "ADMIN", org_id: "org-1" },
    })
    ;(canPerformAction as jest.Mock).mockReturnValue(true)
    ;(createServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock(buildData()))
  })

  it("cuenta el gasto de Madero pagado desde Rosario bajo MADERO", async () => {
    const res = await callGET(
      "dateFrom=2026-07-01&dateTo=2026-07-31&currency=ARS&agencyId=ag-madero"
    )
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.expenses).toHaveLength(1)
    expect(body.expenses[0].description).toBe("Sueldo Melani")
    expect(body.totals.ars).toBe(700000)
    expect(body.totals.countRecurring).toBe(1)
  })

  it("NO lo cuenta bajo ROSARIO aunque se haya pagado desde una caja de Rosario", async () => {
    const res = await callGET(
      "dateFrom=2026-07-01&dateTo=2026-07-31&currency=ARS&agencyId=ag-rosario"
    )
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.expenses).toHaveLength(0)
    expect(body.totals.ars).toBe(0)
    expect(body.totals.countRecurring).toBe(0)
  })

  it("sin filtro de agencia (Todas) lo incluye una sola vez", async () => {
    const res = await callGET("dateFrom=2026-07-01&dateTo=2026-07-31&currency=ARS")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.expenses).toHaveLength(1)
    expect(body.totals.ars).toBe(700000)
  })

  // Modo "account": el toggle "Ver por: Cuenta pagadora" invierte el criterio,
  // el gasto se atribuye a la oficina de la cuenta desde la que salió la plata.
  it("modo account: el gasto pagado desde Rosario cuenta bajo ROSARIO", async () => {
    const res = await callGET(
      "dateFrom=2026-07-01&dateTo=2026-07-31&currency=ARS&agencyId=ag-rosario&agencyMode=account"
    )
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.expenses).toHaveLength(1)
    expect(body.totals.ars).toBe(700000)
  })

  it("modo account: NO cuenta bajo MADERO aunque el gasto sea de Madero", async () => {
    const res = await callGET(
      "dateFrom=2026-07-01&dateTo=2026-07-31&currency=ARS&agencyId=ag-madero&agencyMode=account"
    )
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.expenses).toHaveLength(0)
    expect(body.totals.ars).toBe(0)
  })
})

/**
 * VIB-99: el cliente veía la lista entera en pesos y "Total Egresos USD 0"
 * teniendo gastos en dólares. La causa era el default: sin parámetro `currency`
 * el endpoint valuaba TODO a ARS, y la opción "Todas" del front no mandaba
 * parámetro. Ahora el default es la moneda original y valuar es explícito.
 */
describe("GET /api/expenses/monthly — moneda original vs valuada", () => {
  function buildMixedCurrencyData() {
    return {
      financial_accounts: { data: [], error: null },
      recurring_payment_categories: { data: [], error: null },
      recurring_payments: { data: [], error: null },
      ledger_movements: { data: [], error: null },
      cash_movements: {
        data: [
          {
            id: "cm-ars",
            type: "EXPENSE",
            category: "Gastos Variables",
            amount: 100000,
            currency: "ARS",
            movement_date: "2026-07-10T12:00:00Z",
            created_at: "2026-07-10T12:00:00Z",
            notes: "Expensas",
            financial_account_id: "acc-ars",
            category_id: null,
            financial_accounts: { id: "acc-ars", name: "Caja ARS", currency: "ARS" },
            users: { id: "u1", name: "Enzo" },
          },
          {
            id: "cm-usd",
            type: "EXPENSE",
            category: "Gastos Variables",
            amount: 500,
            currency: "USD",
            movement_date: "2026-07-12T12:00:00Z",
            created_at: "2026-07-12T12:00:00Z",
            notes: "Publicidad",
            financial_account_id: "acc-usd",
            category_id: null,
            financial_accounts: { id: "acc-usd", name: "Caja USD", currency: "USD" },
            users: { id: "u1", name: "Enzo" },
          },
        ],
        error: null,
      },
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()

    const { TextDecoder, TextEncoder } = require("util")
    ;(global as any).TextDecoder = TextDecoder
    ;(global as any).TextEncoder = TextEncoder
    const { Request, Response, Headers } = require("undici")
    ;(global as any).Request = Request
    ;(global as any).Response = Response
    ;(global as any).Headers = Headers

    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: "user-1", role: "ADMIN", org_id: "org-1" },
    })
    ;(canPerformAction as jest.Mock).mockReturnValue(true)
    ;(createServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock(buildMixedCurrencyData()))
    withRate(null)
  })

  it("sin parámetro currency devuelve cada gasto en SU moneda", async () => {
    const res = await callGET("dateFrom=2026-07-01&dateTo=2026-07-31")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.expenses).toHaveLength(2)
    const porMoneda = Object.fromEntries(
      body.expenses.map((e: any) => [e.currency, e.amount])
    )
    expect(porMoneda).toEqual({ ARS: 100000, USD: 500 })
    expect(body.totals.ars).toBe(100000)
    expect(body.totals.usd).toBe(500)
    expect(body.missingRate).toEqual([])
    // Sin valuación no se pide ninguna cotización.
    expect(buildExchangeRateMap).not.toHaveBeenCalled()
  })

  it("currency=ORIGINAL no valúa nada", async () => {
    const res = await callGET("dateFrom=2026-07-01&dateTo=2026-07-31&currency=ORIGINAL")
    const body = await res.json()

    expect(body.totals.ars).toBe(100000)
    expect(body.totals.usd).toBe(500)
    expect(buildExchangeRateMap).not.toHaveBeenCalled()
  })

  it("currency=ARS valúa el gasto en USD y conserva el importe original", async () => {
    withRate(1000)
    const res = await callGET("dateFrom=2026-07-01&dateTo=2026-07-31&currency=ARS")
    const body = await res.json()

    expect(body.expenses).toHaveLength(2)
    expect(body.totals.ars).toBe(600000)
    expect(body.totals.usd).toBe(0)

    const valuado = body.expenses.find((e: any) => e.id === "cm-usd")
    expect(valuado.amount).toBe(500000)
    expect(valuado.currency).toBe("ARS")
    expect(valuado.original_amount).toBe(500)
    expect(valuado.original_currency).toBe("USD")
    expect(valuado.exchange_rate).toBe(1000)
  })

  it("valuando sin cotización, el gasto no se esconde: sale en missingRate", async () => {
    withRate(null)
    const res = await callGET("dateFrom=2026-07-01&dateTo=2026-07-31&currency=ARS")
    const body = await res.json()

    expect(body.expenses).toHaveLength(1)
    expect(body.expenses[0].id).toBe("cm-ars")
    expect(body.missingRate).toEqual([{ currency: "USD", count: 1, total: 500 }])
  })

  it("currency=ALL (valor viejo del select) se comporta como moneda original", async () => {
    const res = await callGET("dateFrom=2026-07-01&dateTo=2026-07-31&currency=ALL")
    const body = await res.json()

    expect(body.expenses).toHaveLength(2)
    expect(body.totals.ars).toBe(100000)
    expect(body.totals.usd).toBe(500)
  })
})
