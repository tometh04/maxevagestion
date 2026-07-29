/**
 * @jest-environment node
 *
 * VIB-86 — Quién puede ver y administrar referidores.
 *
 * La prueba que importa no es mirar la pantalla sino pegarle a la API con un
 * usuario SELLER: si el porcentaje sale del servidor, esconderlo en la interfaz
 * no es un permiso. Por eso acá se deja correr el `canPerformAction` real
 * contra la matriz estática y solo se mockean auth y Supabase.
 */

import { GET, POST } from "@/app/api/referral-partners/route"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/permissions-agency", () => ({
  // null → canPerformAction cae a la matriz estática de lib/permissions.ts,
  // que es justamente la que queremos verificar.
  resolveUserPermissions: jest.fn(async () => null),
}))

const PARTNER = {
  id: "partner-1",
  name: "Agencia XYZ",
  default_commission_percentage: 35,
  active: true,
  org_id: "org-1",
}

/** Captura lo que la route le pide a PostgREST. */
function makeSupabase() {
  /** Proyecciones pedidas sobre referral_partners, en orden. */
  const selects: string[] = []

  const client = {
    from: jest.fn((table: string) => {
      let cols = "*"
      const builder: any = {
        select: jest.fn((c: string) => {
          cols = c
          if (table === "referral_partners") selects.push(c)
          return builder
        }),
        eq: jest.fn(() => builder),
        in: jest.fn(() => builder),
        order: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        insert: jest.fn(() => builder),
        single: jest.fn(async () => ({ data: PARTNER, error: null })),
        maybeSingle: jest.fn(async () => ({ data: PARTNER, error: null })),
        then: (resolve: any) => {
          if (table !== "referral_partners") {
            return Promise.resolve({ data: [], error: null }).then(resolve)
          }
          // La proyección es la que decide qué columnas existen: si el servidor
          // no las pide, no pueden llegar al navegador.
          const row: any =
            cols === "*"
              ? PARTNER
              : Object.fromEntries(
                  cols.split(",").map((c) => [c.trim(), (PARTNER as any)[c.trim()]])
                )
          return Promise.resolve({ data: [row], error: null }).then(resolve)
        },
      }
      return builder
    }),
  }
  return { client, selects }
}

function login(role: string) {
  const { client, selects } = makeSupabase()
  ;(getCurrentUser as jest.Mock).mockResolvedValue({
    user: { id: "u-1", role, org_id: "org-1", roles: [role] },
  })
  ;(createServerClient as jest.Mock).mockResolvedValue(client)
  return { selects }
}

const request = () => new Request("http://localhost/api/referral-partners")

beforeEach(() => {
  jest.clearAllMocks()
})

describe("GET /api/referral-partners", () => {
  it("a un vendedor no le manda el porcentaje del referidor", async () => {
    const { selects } = login("SELLER")

    const res = await GET(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    // El vendedor necesita el nombre para poder seleccionarlo...
    expect(body.partners[0].name).toBe("Agencia XYZ")
    // ...pero el porcentaje ni sale de la base.
    expect(body.partners[0].default_commission_percentage).toBeUndefined()
    expect(selects[0]).toBe("id, name")
    expect(body.canManage).toBe(false)
  })

  it("un administrador ve el porcentaje y puede administrar", async () => {
    const { selects } = login("ADMIN")

    const res = await GET(request())
    const body = await res.json()

    expect(selects[0]).toBe("*")
    expect(body.partners[0].default_commission_percentage).toBe(35)
    expect(body.canManage).toBe(true)
  })

  it("el contable ve las comisiones pero no puede administrar", async () => {
    // Liquida las comisiones al referidor, así que necesita los montos; dar de
    // alta referidores no es tarea suya.
    login("CONTABLE")

    const res = await GET(request())
    const body = await res.json()

    expect(body.partners[0].default_commission_percentage).toBe(35)
    expect(body.canManage).toBe(false)
  })

  it("post venta no tiene nada que hacer acá", async () => {
    login("POST_VENTA")

    const res = await GET(request())

    expect(res.status).toBe(403)
  })
})

describe("POST /api/referral-partners", () => {
  const postRequest = () =>
    new Request("http://localhost/api/referral-partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nueva Agencia", default_commission_percentage: 20 }),
    })

  it("un vendedor no puede crear referidores", async () => {
    // Antes se gateaba con customers.write, que el vendedor tiene: podía crear
    // referidores y ponerles el porcentaje que quisiera.
    login("SELLER")

    const res = await POST(postRequest())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toContain("permiso")
  })

  it("el contable tampoco", async () => {
    login("CONTABLE")

    const res = await POST(postRequest())

    expect(res.status).toBe(403)
  })

  it("un administrador sí", async () => {
    login("ADMIN")

    const res = await POST(postRequest())

    expect(res.status).toBe(200)
  })
})
