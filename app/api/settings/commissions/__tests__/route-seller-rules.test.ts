// app/api/settings/commissions/__tests__/route-seller-rules.test.ts
/**
 * @jest-environment node
 *
 * VIB-124 — "figuran las distintas comisiones pero sin el nombre del vendedor y
 * no tengo manera de identificar quién es para cambiarlo".
 *
 * `commission_rules.seller_id` existía en la base y lo usaba el motor de cálculo
 * (`lib/commissions/seller-commission-profile.ts`, donde una regla por vendedor
 * le gana al % cargado al dar de alta al usuario), pero la API lo ignoraba: el
 * GET no lo devolvía y el POST no lo aceptaba. Resultado: Lozada tenía 13 reglas
 * por vendedor —sembradas por una migración— que se veían todas iguales, y
 * ninguna agencia podía crear una desde la pantalla.
 *
 * Lo que fijan estos tests:
 *   1. El GET devuelve el nombre del vendedor y scopea por org_id.
 *   2. El POST no deja apuntar una regla a un usuario de otro tenant.
 *   3. Una regla de agencia nunca queda con seller_id (sería ambigua).
 *   4. El PATCH preserva seller_id cuando no viene en el body — la pantalla
 *      manda PATCH sin ese campo y hay 13 reglas en producción que no pueden
 *      perder su dueño al editarles el porcentaje.
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

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))

import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { GET, POST } from "../route"
import { PATCH } from "../[id]/route"

const ORG_ID = "org-1111"
const SELLER_ID = "seller-1111"
const FOREIGN_SELLER_ID = "seller-9999"
const RULE_ID = "rule-1111"

/** Lo que se le pidió a la base, para poder afirmar cosas sobre el scoping. */
interface Recorded {
  table: string
  filters: Array<{ column: string; value: unknown }>
  selected?: string
  inserted?: any
  updated?: any
}

let recorded: Recorded[] = []

/**
 * El GET solo lee `request.url`. Se pasa un objeto plano en vez de `new Request`
 * porque el global de fetch no esta disponible en este entorno de jest.
 */
function getRequest(url: string): any {
  return { url }
}


/**
 * Cliente Supabase mínimo pero fiel en lo que importa: registra los `.eq()` para
 * poder verificar el scoping por org, y devuelve el dataset que se le configure.
 */
function buildSupabaseMock(datasets: Record<string, any>) {
  return {
    from(table: string) {
      const entry: Recorded = { table, filters: [] }
      recorded.push(entry)

      const builder: any = {
        select(cols?: string) {
          entry.selected = cols
          return builder
        },
        insert(payload: any) {
          entry.inserted = payload
          return builder
        },
        update(payload: any) {
          entry.updated = payload
          return builder
        },
        delete: () => builder,
        eq(column: string, value: unknown) {
          entry.filters.push({ column, value })
          return builder
        },
        order: () => builder,
        maybeSingle: async () => ({ data: resolve(), error: null }),
        single: async () => ({ data: resolve(), error: null }),
        then: (onResolve: any) => onResolve({ data: resolve(), error: null }),
      }

      function resolve() {
        const value = datasets[table]
        return typeof value === "function" ? value(entry) : value
      }

      return builder
    },
  }
}

function asAdmin(orgId: string | null = ORG_ID, role = "ADMIN", roles?: string[]) {
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: { id: "user-1", org_id: orgId, role, roles: roles ?? [role] },
  })
}

function useSupabase(datasets: Record<string, any>) {
  ;(createServerClient as jest.Mock).mockResolvedValue(buildSupabaseMock(datasets))
}

function findCall(table: string) {
  return recorded.find((r) => r.table === table)
}

beforeEach(() => {
  jest.clearAllMocks()
  recorded = []
})

describe("GET /api/settings/commissions", () => {
  it("devuelve el nombre del vendedor de cada regla", async () => {
    asAdmin()
    useSupabase({
      commission_rules: [
        {
          id: RULE_ID,
          type: "SELLER",
          value: 35,
          seller_id: SELLER_ID,
          seller: { id: SELLER_ID, name: "Micaela Nader", email: "mica@test.com" },
        },
      ],
    })

    const response = await GET(getRequest("https://test.local/api/settings/commissions"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rules[0].seller_name).toBe("Micaela Nader")
    // El objeto crudo del join no debería viajar al browser.
    expect(body.rules[0].seller).toBeUndefined()
  })

  it("cae al email si el vendedor no tiene nombre cargado", async () => {
    asAdmin()
    useSupabase({
      commission_rules: [
        { id: RULE_ID, type: "SELLER", seller_id: SELLER_ID, seller: { name: null, email: "x@t.com" } },
      ],
    })

    const body = await (await GET(getRequest("https://test.local/x"))).json()

    expect(body.rules[0].seller_name).toBe("x@t.com")
  })

  it("deja seller_name en null para una regla generica", async () => {
    asAdmin()
    useSupabase({ commission_rules: [{ id: RULE_ID, type: "SELLER", seller_id: null, seller: null }] })

    const body = await (await GET(getRequest("https://test.local/x"))).json()

    expect(body.rules[0].seller_name).toBeNull()
  })

  it("scopea explicitamente por org_id, no solo por RLS", async () => {
    asAdmin()
    useSupabase({ commission_rules: [] })

    await GET(getRequest("https://test.local/x"))

    expect(findCall("commission_rules")?.filters).toContainEqual({
      column: "org_id",
      value: ORG_ID,
    })
  })

  it("no autoriza a un rol sin nivel de admin", async () => {
    asAdmin(ORG_ID, "SELLER")
    useSupabase({ commission_rules: [] })

    const response = await GET(getRequest("https://test.local/x"))

    expect(response.status).toBe(403)
  })

  it("autoriza a ORG_OWNER, que el chequeo por string literal dejaba afuera", async () => {
    asAdmin(ORG_ID, "ORG_OWNER")
    useSupabase({ commission_rules: [] })

    const response = await GET(getRequest("https://test.local/x"))

    expect(response.status).toBe(200)
  })

  it("autoriza si el nivel admin viene en additional_roles", async () => {
    asAdmin(ORG_ID, "SELLER", ["SELLER", "ADMIN"])
    useSupabase({ commission_rules: [] })

    const response = await GET(getRequest("https://test.local/x"))

    expect(response.status).toBe(200)
  })
})

describe("POST /api/settings/commissions", () => {
  function request(body: Record<string, unknown>) {
    return { json: async () => body } as any
  }

  const validRule = {
    type: "SELLER",
    basis: "FIXED_PERCENTAGE",
    value: 35,
    valid_from: "2026-08-01",
  }

  it("guarda el vendedor elegido y sella la org", async () => {
    asAdmin()
    useSupabase({
      users: { id: SELLER_ID },
      commission_rules: { id: RULE_ID },
    })

    const response = await POST(request({ ...validRule, seller_id: SELLER_ID }))

    expect(response.status).toBe(200)
    const inserted = findCall("commission_rules")?.inserted
    expect(inserted.seller_id).toBe(SELLER_ID)
    expect(inserted.org_id).toBe(ORG_ID)
  })

  it("rechaza un vendedor de otro tenant", async () => {
    asAdmin()
    // La búsqueda del vendedor filtra por org: para uno ajeno no hay fila.
    useSupabase({ users: null, commission_rules: { id: RULE_ID } })

    const response = await POST(request({ ...validRule, seller_id: FOREIGN_SELLER_ID }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/no pertenece a esta organización/i)
    expect(findCall("commission_rules")?.inserted).toBeUndefined()
  })

  it("busca al vendedor scopeando por org_id", async () => {
    asAdmin()
    useSupabase({ users: { id: SELLER_ID }, commission_rules: { id: RULE_ID } })

    await POST(request({ ...validRule, seller_id: SELLER_ID }))

    expect(findCall("users")?.filters).toContainEqual({ column: "org_id", value: ORG_ID })
  })

  it("una regla de agencia nunca queda con seller_id", async () => {
    asAdmin()
    useSupabase({ users: { id: SELLER_ID }, commission_rules: { id: RULE_ID } })

    await POST(request({ ...validRule, type: "AGENCY", seller_id: SELLER_ID }))

    expect(findCall("commission_rules")?.inserted.seller_id).toBeNull()
  })

  it("sigue permitiendo la regla generica, sin vendedor", async () => {
    asAdmin()
    useSupabase({ commission_rules: { id: RULE_ID } })

    const response = await POST(request(validRule))

    expect(response.status).toBe(200)
    expect(findCall("commission_rules")?.inserted.seller_id).toBeNull()
  })

  it("rechaza al usuario sin organizacion", async () => {
    asAdmin(null)
    useSupabase({ commission_rules: { id: RULE_ID } })

    const response = await POST(request(validRule))

    expect(response.status).toBe(400)
  })
})

describe("PATCH /api/settings/commissions/[id]", () => {
  const params = Promise.resolve({ id: RULE_ID })

  function request(body: Record<string, unknown>) {
    return { json: async () => body } as any
  }

  it("NO toca seller_id cuando el body no lo manda (las 13 reglas de produccion)", async () => {
    asAdmin()
    useSupabase({ commission_rules: { id: RULE_ID, seller_id: SELLER_ID } })

    // Exactamente lo que manda la pantalla al cambiar solo el porcentaje.
    const response = await PATCH(request({ value: 40 }), { params })

    expect(response.status).toBe(200)
    const updated = findCall("commission_rules")?.updated
    expect(updated.value).toBe(40)
    expect("seller_id" in updated).toBe(false)
  })

  it("scopea el update por org_id para que el id de la URL no alcance", async () => {
    asAdmin()
    useSupabase({ commission_rules: { id: RULE_ID } })

    await PATCH(request({ value: 40 }), { params })

    expect(findCall("commission_rules")?.filters).toContainEqual({
      column: "org_id",
      value: ORG_ID,
    })
  })

  it("devuelve 404 si la regla es de otro tenant", async () => {
    asAdmin()
    useSupabase({ commission_rules: null })

    const response = await PATCH(request({ value: 40 }), { params })

    expect(response.status).toBe(404)
  })

  it("limpia el seller_id si la regla pasa a ser de agencia", async () => {
    asAdmin()
    useSupabase({ commission_rules: { id: RULE_ID } })

    await PATCH(request({ type: "AGENCY" }), { params })

    expect(findCall("commission_rules")?.updated.seller_id).toBeNull()
  })

  it("rechaza reasignar la regla a un vendedor de otro tenant", async () => {
    asAdmin()
    useSupabase({ users: null, commission_rules: { id: RULE_ID } })

    const response = await PATCH(request({ seller_id: FOREIGN_SELLER_ID }), { params })

    expect(response.status).toBe(400)
    expect(findCall("commission_rules")?.updated).toBeUndefined()
  })
})
