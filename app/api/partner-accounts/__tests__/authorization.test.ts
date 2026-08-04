/**
 * @jest-environment node
 *
 * Quién puede registrar movimientos de socios, y de qué organización.
 *
 * Reportado por Lozada: al registrar un aporte, la API devolvía
 * "No autorizado para registrar movimientos de socios". El gate exigía
 * `user.role ∈ [SUPER_ADMIN, CONTABLE]`, así que dejaba afuera al ORG_OWNER
 * (el dueño del tenant) y al ADMIN que administra la caja.
 *
 * Se deja correr el `canPerformAction` real contra la matriz estática
 * (resolveUserPermissions mockeado a null) y solo se mockean auth y Supabase:
 * lo que se quiere verificar es la decisión de permisos, no el mock.
 */

import { GET, POST } from "@/app/api/partner-accounts/withdrawals/route"
import { DELETE } from "@/app/api/partner-accounts/withdrawals/[id]/route"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
  createAdminClient: jest.fn(),
}))
jest.mock("@/lib/permissions-agency", () => ({
  // null → canPerformAction cae a la matriz estática de lib/permissions.ts,
  // que es justamente la que queremos verificar.
  resolveUserPermissions: jest.fn(async () => null),
}))

const ORG = "org-1"
const OTHER_ORG = "org-2"

const PARTNERS = [
  { id: "partner-1", partner_name: "Maxi", org_id: ORG },
  { id: "partner-ajeno", partner_name: "Socio de otro tenant", org_id: OTHER_ORG },
]

const WITHDRAWALS = [
  { id: "w-1", partner_id: "partner-1", amount: 100, currency: "USD" },
  { id: "w-ajeno", partner_id: "partner-ajeno", amount: 999, currency: "USD" },
]

/**
 * Mock que respeta los filtros `.eq()` / `.in()`, que es donde vive el
 * aislamiento por tenant: si la route no filtra por org_id, el mock devuelve
 * también las filas del otro tenant y el test lo detecta.
 */
function makeSupabase() {
  const client = {
    from: jest.fn((table: string) => {
      const filters: Record<string, any> = {}
      let inFilter: { column: string; values: any[] } | null = null

      const rowsFor = (t: string): any[] => {
        if (t === "partner_accounts") return PARTNERS
        if (t === "partner_withdrawals") {
          return WITHDRAWALS.map((w) => ({
            ...w,
            partner: {
              partner_name: PARTNERS.find((p) => p.id === w.partner_id)?.partner_name,
              org_id: PARTNERS.find((p) => p.id === w.partner_id)?.org_id,
            },
          }))
        }
        return []
      }

      const applyFilters = (rows: any[]) =>
        rows
          .filter((row) =>
            Object.entries(filters).every(([col, val]) => row[col] === val)
          )
          .filter((row) =>
            inFilter ? inFilter.values.includes(row[inFilter.column]) : true
          )

      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn((col: string, val: any) => {
          filters[col] = val
          return builder
        }),
        in: jest.fn((col: string, values: any[]) => {
          inFilter = { column: col, values }
          return builder
        }),
        order: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        insert: jest.fn(() => builder),
        delete: jest.fn(() => builder),
        single: jest.fn(async () => {
          const [row] = applyFilters(rowsFor(table))
          return row
            ? { data: row, error: null }
            : { data: null, error: { message: "not found" } }
        }),
        maybeSingle: jest.fn(async () => {
          const [row] = applyFilters(rowsFor(table))
          return { data: row ?? null, error: null }
        }),
        then: (resolve: any) =>
          Promise.resolve({ data: applyFilters(rowsFor(table)), error: null }).then(resolve),
      }
      return builder
    }),
  }
  return client
}

function login(role: string, orgId: string = ORG) {
  const client = makeSupabase()
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: { id: "user-1", role, roles: [role], org_id: orgId },
  })
  ;(createServerClient as jest.Mock).mockResolvedValue(client)
  return client
}

function postBody(body: Record<string, any>) {
  return new Request("http://localhost/api/partner-accounts/withdrawals", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("POST /api/partner-accounts/withdrawals — quién puede registrar", () => {
  // Body vacío: si el gate deja pasar, la route corta en la validación de
  // campos (400). Lo que importa es que no sea 403.
  const ROLES_CON_ACCESO = ["ORG_OWNER", "SUPER_ADMIN", "ADMIN", "CONTABLE"]
  const ROLES_SIN_ACCESO = ["SELLER", "VIEWER", "POST_VENTA"]

  it.each(ROLES_CON_ACCESO)("%s puede registrar movimientos", async (role) => {
    login(role)
    const res = await POST(postBody({}))
    expect(res.status).not.toBe(403)
    expect(res.status).toBe(400)
  })

  it.each(ROLES_SIN_ACCESO)("%s no puede registrar movimientos", async (role) => {
    login(role)
    const res = await POST(postBody({ partner_id: "partner-1", amount: 100 }))
    expect(res.status).toBe(403)
  })

  it("un usuario sin organización no puede registrar", async () => {
    login("ORG_OWNER", null as any)
    const res = await POST(postBody({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/organización/i)
  })

  it("no acepta un socio de otra organización", async () => {
    login("CONTABLE")
    const res = await POST(
      postBody({
        partner_id: "partner-ajeno",
        amount: 100,
        currency: "USD",
        withdrawal_date: "2026-08-04",
        account_id: "acc-1",
      })
    )
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/Socio no encontrado/i)
  })
})

describe("GET /api/partner-accounts/withdrawals — aislamiento por tenant", () => {
  it("solo devuelve movimientos de socios de la organización del usuario", async () => {
    login("CONTABLE")
    const res = await GET(new Request("http://localhost/api/partner-accounts/withdrawals"))
    expect(res.status).toBe(200)

    const ids = (await res.json()).withdrawals.map((w: any) => w.id)
    expect(ids).toContain("w-1")
    expect(ids).not.toContain("w-ajeno")
  })

  it("pedir explícitamente un socio de otro tenant no devuelve nada", async () => {
    login("CONTABLE")
    const res = await GET(
      new Request("http://localhost/api/partner-accounts/withdrawals?partnerId=partner-ajeno")
    )
    expect(res.status).toBe(200)
    expect((await res.json()).withdrawals).toEqual([])
  })

  it("un SELLER no puede listar movimientos de socios", async () => {
    login("SELLER")
    const res = await GET(new Request("http://localhost/api/partner-accounts/withdrawals"))
    expect(res.status).toBe(403)
  })
})

describe("DELETE /api/partner-accounts/withdrawals/[id]", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) })

  it("ORG_OWNER puede borrar", async () => {
    login("ORG_OWNER")
    const res = await DELETE(new Request("http://localhost"), params("w-1"))
    expect(res.status).toBe(200)
  })

  it("ADMIN no puede borrar (accounting.delete = false)", async () => {
    login("ADMIN")
    const res = await DELETE(new Request("http://localhost"), params("w-1"))
    expect(res.status).toBe(403)
  })

  it("no puede borrar un movimiento de otra organización", async () => {
    login("ORG_OWNER")
    const res = await DELETE(new Request("http://localhost"), params("w-ajeno"))
    expect(res.status).toBe(404)
  })
})
