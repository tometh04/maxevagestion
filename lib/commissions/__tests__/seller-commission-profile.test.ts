/**
 * VIB-63 — Resolución del porcentaje y el modo de cada vendedor.
 *
 * Lo que se prueba acá no es la aritmética (eso vive en shared-split) sino las
 * dos cosas que pueden romperse sin que nadie se entere: que la regla genérica
 * no se filtre desde otro tenant, y que un despliegue anterior a la migración
 * degrade a 'HALF' en vez de dejar a todos sin porcentaje.
 */

import { resolveSellerCommissionProfiles } from "@/lib/commissions/seller-commission-profile"

interface Call {
  method: string
  args: any[]
}

interface Query {
  table: string
  calls: Call[]
}

/** Cliente Supabase falso: encadena cualquier método y resuelve con `respond`. */
function createClient(respond: (table: string, calls: Call[]) => { data: any; error: any }) {
  const queries: Query[] = []

  const from = (table: string) => {
    const calls: Call[] = []
    queries.push({ table, calls })
    const builder: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: any, reject: any) => {
              try {
                resolve(respond(table, calls))
              } catch (err) {
                reject(err)
              }
            }
          }
          return (...args: any[]) => {
            calls.push({ method: String(prop), args })
            return builder
          }
        },
      }
    )
    return builder
  }

  return { client: { from } as any, queries }
}

const arg = (calls: Call[], method: string, first: any) =>
  calls.find((c) => c.method === method && c.args[0] === first)?.args

/** ¿Es la consulta de la regla genérica (sin seller_id)? */
const isGenericRuleQuery = (calls: Call[]) =>
  calls.some((c) => c.method === "is" && c.args[0] === "seller_id")

const ORG = "org-lozada"

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {})
  jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("resolveSellerCommissionProfiles", () => {
  it("toma el porcentaje del usuario cuando no hay regla específica", async () => {
    const { client } = createClient((table) => {
      if (table === "users") {
        return {
          data: [
            {
              id: "santi",
              name: "Santiago",
              default_commission_percentage: 35,
              shared_sale_commission_mode: "ABSORB",
            },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["santi"])

    expect(profiles.get("santi")).toEqual({
      sellerId: "santi",
      name: "Santiago",
      percentage: 35,
      mode: "ABSORB",
      source: "USER_DEFAULT",
    })
  })

  it("una regla por vendedor tapa el porcentaje del usuario, y queda registrado en source", async () => {
    // Es el caso real de Lozada: la migración 116 sembró reglas por vendedor, y
    // por eso editar el porcentaje en Configuración → Usuarios puede no hacer
    // nada. El resolver mantiene esa precedencia, pero la hace visible.
    const { client } = createClient((table, calls) => {
      if (table === "users") {
        return {
          data: [{ id: "julieta", name: "Julieta", default_commission_percentage: 60 }],
          error: null,
        }
      }
      if (table === "commission_rules" && !isGenericRuleQuery(calls)) {
        return { data: [{ seller_id: "julieta", value: 50, valid_from: "2026-01-01" }], error: null }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["julieta"])

    expect(profiles.get("julieta")?.percentage).toBe(50)
    expect(profiles.get("julieta")?.source).toBe("SELLER_RULE")
  })

  it("entre varias reglas vigentes se queda con la más reciente", async () => {
    const { client } = createClient((table, calls) => {
      if (table === "users") {
        return { data: [{ id: "a", name: "A", default_commission_percentage: 10 }], error: null }
      }
      if (table === "commission_rules" && !isGenericRuleQuery(calls)) {
        return {
          data: [
            { seller_id: "a", value: 25, valid_from: "2026-06-01" },
            { seller_id: "a", value: 15, valid_from: "2026-01-01" },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["a"])
    expect(profiles.get("a")?.percentage).toBe(25)
  })

  it("la regla genérica se busca scopeada por org (no hereda el default de otro tenant)", async () => {
    const { client, queries } = createClient((table, calls) => {
      if (table === "users") {
        return {
          data: [{ id: "nuevo", name: "Nuevo", default_commission_percentage: null }],
          error: null,
        }
      }
      if (table === "commission_rules" && isGenericRuleQuery(calls)) {
        return { data: [{ value: 20 }], error: null }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["nuevo"])

    expect(profiles.get("nuevo")).toMatchObject({ percentage: 20, source: "ORG_RULE" })

    const generic = queries.find(
      (q) => q.table === "commission_rules" && isGenericRuleQuery(q.calls)
    )
    // Este era el agujero: sin este filtro, un vendedor sin porcentaje heredaba
    // la regla genérica de cualquier organización.
    expect(arg(generic!.calls, "eq", "org_id")).toEqual(["org_id", ORG])
  })

  it("no consulta la regla genérica si todos los vendedores ya tienen porcentaje", async () => {
    const { client, queries } = createClient((table) => {
      if (table === "users") {
        return { data: [{ id: "a", name: "A", default_commission_percentage: 20 }], error: null }
      }
      return { data: [], error: null }
    })

    await resolveSellerCommissionProfiles(client, ORG, ["a"])

    expect(queries.filter((q) => isGenericRuleQuery(q.calls))).toHaveLength(0)
  })

  it("resuelve varios vendedores con una sola consulta a users", async () => {
    const { client, queries } = createClient((table) => {
      if (table === "users") {
        return {
          data: [
            { id: "a", name: "A", default_commission_percentage: 20 },
            { id: "b", name: "B", default_commission_percentage: 13 },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["a", "b", "a", null])

    expect(profiles.size).toBe(2)
    expect(queries.filter((q) => q.table === "users")).toHaveLength(1)
    expect(arg(queries[0].calls, "in", "id")).toEqual(["id", ["a", "b"]])
    expect(arg(queries[0].calls, "eq", "org_id")).toEqual(["org_id", ORG])
  })

  it("un vendedor sin porcentaje en ninguna fuente queda en null, no en 0", async () => {
    // La diferencia importa: 0 es "cobra cero" y null es "falta configurarlo".
    // El motor de reparto emite un warning solo con el segundo.
    const { client } = createClient((table) => {
      if (table === "users") {
        return {
          data: [{ id: "nuevo", name: "Nuevo", default_commission_percentage: null }],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["nuevo"])
    expect(profiles.get("nuevo")?.percentage).toBeNull()
    expect(profiles.get("nuevo")?.source).toBe("NONE")
  })

  it("si todavía no corrió la migración, degrada a HALF en vez de perder los porcentajes", async () => {
    let intentos = 0
    const { client } = createClient((table, calls) => {
      if (table === "users") {
        intentos++
        const pideModo = calls.some((c) =>
          String(c.args[0]).includes("shared_sale_commission_mode")
        )
        if (pideModo) {
          return {
            data: null,
            error: { message: 'column users.shared_sale_commission_mode does not exist' },
          }
        }
        return {
          data: [{ id: "santi", name: "Santiago", default_commission_percentage: 35 }],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["santi"])

    expect(intentos).toBe(2)
    expect(profiles.get("santi")).toMatchObject({ percentage: 35, mode: "HALF" })
  })

  it("un modo desconocido en la base se trata como HALF", async () => {
    const { client } = createClient((table) => {
      if (table === "users") {
        return {
          data: [
            {
              id: "a",
              name: "A",
              default_commission_percentage: 20,
              shared_sale_commission_mode: "CUALQUIER_COSA",
            },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["a"])
    expect(profiles.get("a")?.mode).toBe("HALF")
  })

  it("sin orgId no consulta nada y devuelve perfiles vacíos", async () => {
    const { client, queries } = createClient(() => ({ data: [], error: null }))

    const profiles = await resolveSellerCommissionProfiles(client, "", ["a"])

    expect(queries).toHaveLength(0)
    expect(profiles.get("a")).toMatchObject({ percentage: null, mode: "HALF" })
  })

  it("sin vendedores no consulta nada", async () => {
    const { client, queries } = createClient(() => ({ data: [], error: null }))

    const profiles = await resolveSellerCommissionProfiles(client, ORG, [null, undefined])

    expect(queries).toHaveLength(0)
    expect(profiles.size).toBe(0)
  })
})
