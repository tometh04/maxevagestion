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
jest.mock("@/lib/permissions-api", () => ({ canPerformAction: jest.fn() }))

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
