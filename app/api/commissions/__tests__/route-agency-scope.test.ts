// app/api/commissions/__tests__/route-agency-scope.test.ts
/**
 * @jest-environment node
 *
 * Comisiones por oficina en la pantalla de pago.
 *
 * Pedido de Yamil (Lozada, dos oficinas): "necesitamos que se dividan las
 * comisiones que se generan por cada agencia, así vemos cuando estamos pagando
 * si se paga algo de Rosario o de Buenos Aires".
 *
 * Este endpoint no tenía ninguna noción de agencia: devolvía todas las
 * comisiones de la org. El Reporte de Comisiones sí filtraba, así que las dos
 * pantallas podían mostrar totales distintos para el mismo período.
 *
 * Lo que fijan estos tests:
 *   1. La agencia sale de `operations.agency_id`, no de `commission_records`
 *      (esa columna es nullable y nunca se backfilleó) ni del vendedor (en
 *      Lozada casi todos pertenecen a las dos oficinas).
 *   2. Sin filtro explícito se scopea a las oficinas que el usuario ve.
 *   3. Pedir una oficina fuera de su alcance da 403, no datos de otra agencia.
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      return {
        status: init?.status ?? 200,
        json: async () => JSON.parse(body),
      }
    },
  },
}))

jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))
jest.mock("@/lib/permissions-api", () => ({
  canPerformAction: jest.fn(() => true),
  isOwnDataOnlyResolved: jest.fn(() => false),
  getScopedAgenciesForUser: jest.fn(async () => [
    { id: "agency-rosario", name: "Rosario" },
    { id: "agency-madero", name: "Madero" },
  ]),
}))

import { getRequestPermissions } from "@/lib/permissions/request"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { GET } from "../route"

const ORG_ID = "org-lozada"
const ROSARIO = "agency-rosario"
const MADERO = "agency-madero"
const AJENA = "agency-de-otra-org"

interface Filter {
  kind: "eq" | "in"
  column: string
  value: unknown
}

let filters: Filter[] = []

const RECORD = {
  id: "comm-1",
  operation_id: "op-1",
  seller_id: "seller-1",
  agency_id: ROSARIO,
  amount: 100,
  amount_paid: 0,
  percentage: 20,
  status: "PENDING",
  date_calculated: "2026-08-01",
  date_paid: null,
  operations: {
    id: "op-1",
    agency_id: ROSARIO,
    file_code: "OP-001",
    destination: "Cancún",
    operation_date: "2026-08-01",
    departure_date: "2026-12-01",
    sale_amount_total: 1000,
    operator_cost: 500,
    sale_currency: "USD",
    margin_amount: 500,
  },
}

/**
 * Cliente mínimo: registra los filtros de la query de comisiones y devuelve un
 * dataset fijo por tabla. Lo único que se afirma es CÓMO se consultó.
 */
function buildSupabaseMock(datasets: Record<string, any>) {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        order: () => builder,
        is: () => builder,
        gte: () => builder,
        lte: () => builder,
        eq(column: string, value: unknown) {
          if (table === "commission_records") filters.push({ kind: "eq", column, value })
          return builder
        },
        in(column: string, value: unknown) {
          if (table === "commission_records") filters.push({ kind: "in", column, value })
          return builder
        },
        maybeSingle: async () => ({ data: datasets[table] ?? null, error: null }),
        single: async () => ({ data: datasets[table] ?? null, error: null }),
        then: (onResolve: any) => onResolve({ data: datasets[table] ?? [], error: null }),
      }
      return builder
    },
  }
}

function useRequest(datasets: Record<string, any> = {}) {
  ;(getRequestPermissions as jest.Mock).mockResolvedValue({
    user: { id: "user-yamil", org_id: ORG_ID, role: "ADMIN", roles: ["ADMIN"] },
    supabase: buildSupabaseMock({ commission_records: [RECORD], users: [], ...datasets }),
    matrix: null,
  })
}

const req = (url: string) => ({ url }) as any
const agencyFilter = () => filters.find((f) => f.column === "operations.agency_id")

beforeEach(() => {
  jest.clearAllMocks()
  filters = []
  ;(getScopedAgenciesForUser as jest.Mock).mockResolvedValue([
    { id: ROSARIO, name: "Rosario" },
    { id: MADERO, name: "Madero" },
  ])
})

describe("GET /api/commissions — oficina", () => {
  it("filtra por la agencia de la OPERACIÓN cuando se pide una", async () => {
    useRequest()

    const response = await GET(req(`https://t.local/api/commissions?agencyId=${ROSARIO}`))

    expect(response.status).toBe(200)
    // Sobre `operations.agency_id`, no sobre `commission_records.agency_id`:
    // esa columna es nullable y sin backfill, sirve de salida y no de filtro.
    expect(agencyFilter()).toEqual({ kind: "eq", column: "operations.agency_id", value: ROSARIO })
  })

  it("sin filtro explícito, se scopea a las oficinas que el usuario ve", async () => {
    useRequest()

    await GET(req("https://t.local/api/commissions"))

    expect(agencyFilter()).toEqual({
      kind: "in",
      column: "operations.agency_id",
      value: [ROSARIO, MADERO],
    })
  })

  it("agencyId=ALL es lo mismo que no filtrar", async () => {
    useRequest()

    await GET(req("https://t.local/api/commissions?agencyId=ALL"))

    expect(agencyFilter()?.kind).toBe("in")
  })

  it("pedir una oficina fuera de su alcance da 403, no datos de otra agencia", async () => {
    useRequest()

    const response = await GET(req(`https://t.local/api/commissions?agencyId=${AJENA}`))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toContain("No tiene acceso a esa agencia")
  })

  it("un usuario sin agencias asignadas no arrastra un filtro vacío", async () => {
    // `.in("agency_id", [])` no devolvería nada; el comportamiento correcto es
    // no filtrar por agencia y dejar que el scope por org haga su trabajo.
    ;(getScopedAgenciesForUser as jest.Mock).mockResolvedValue([])
    useRequest()

    await GET(req("https://t.local/api/commissions"))

    expect(agencyFilter()).toBeUndefined()
  })

  it("cada comisión dice de qué oficina viene", async () => {
    useRequest()

    const response = await GET(req("https://t.local/api/commissions"))
    const body = await response.json()

    expect(body.commissions[0].agency_id).toBe(ROSARIO)
    expect(body.commissions[0].agency_name).toBe("Rosario")
  })

  it("una fila vieja sin agency_id en la operación cae a la de la comisión", async () => {
    useRequest({
      commission_records: [
        { ...RECORD, operations: { ...RECORD.operations, agency_id: null } },
      ],
    })

    const response = await GET(req("https://t.local/api/commissions"))
    const body = await response.json()

    expect(body.commissions[0].agency_id).toBe(ROSARIO)
  })
})
