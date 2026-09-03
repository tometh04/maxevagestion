/**
 * VIB-63 — Resolución del porcentaje y el modo de cada vendedor.
 *
 * Lo que se prueba acá no es la aritmética (eso vive en shared-split) sino las
 * dos cosas que pueden romperse sin que nadie se entere: que la regla genérica
 * no se filtre desde otro tenant, y que un despliegue anterior a la migración
 * degrade a 'HALF' en vez de dejar a todos sin porcentaje.
 */

import {
  resolveSellerCommissionProfiles,
  resolveEffectivePercentage,
} from "@/lib/commissions/seller-commission-profile"

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
      advisorManagerId: null,
      advisorManagerPercentage: null,
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

    // Tres escalones: con administrador (VIB-102), con modo (VIB-63), y el
    // mínimo histórico. Los dos primeros piden `shared_sale_commission_mode`.
    expect(intentos).toBe(3)
    expect(profiles.get("santi")).toMatchObject({ percentage: 35, mode: "HALF" })
  })

  it("si falta solo la migración del administrador, conserva el modo de venta compartida", async () => {
    // El escalón intermedio importa: degradar hasta el mínimo perdería el
    // 'ABSORB' de Julieta y le pagaría de menos en cada venta compartida.
    const { client } = createClient((table, calls) => {
      if (table === "users") {
        const pideAdmin = calls.some((c) => String(c.args[0]).includes("advisor_manager_id"))
        if (pideAdmin) {
          return {
            data: null,
            error: { message: 'column users.advisor_manager_id does not exist' },
          }
        }
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

    expect(profiles.get("santi")).toMatchObject({
      percentage: 35,
      mode: "ABSORB",
      advisorManagerId: null,
    })
  })

  it("lee el administrador del vendedor y su porcentaje (VIB-102)", async () => {
    const { client } = createClient((table) => {
      if (table === "users") {
        return {
          data: [
            {
              id: "free",
              name: "Free",
              default_commission_percentage: 50,
              shared_sale_commission_mode: "HALF",
              advisor_manager_id: "mica",
              advisor_manager_percentage: 5,
            },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["free"])

    expect(profiles.get("free")).toMatchObject({
      percentage: 50,
      advisorManagerId: "mica",
      advisorManagerPercentage: 5,
    })
  })

  it("sin administrador asignado, el porcentaje suelto no se usa", async () => {
    // Un % que quedó cargado de una configuración anterior no puede pagarle a
    // nadie: sin `advisor_manager_id` no hay a quién.
    const { client } = createClient((table) => {
      if (table === "users") {
        return {
          data: [
            {
              id: "free",
              name: "Free",
              default_commission_percentage: 50,
              advisor_manager_id: null,
              advisor_manager_percentage: 5,
            },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    })

    const profiles = await resolveSellerCommissionProfiles(client, ORG, ["free"])

    expect(profiles.get("free")).toMatchObject({
      advisorManagerId: null,
      advisorManagerPercentage: null,
    })
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

/**
 * La precedencia sola. Importa que este sea el UNICO lugar donde vive: la
 * pantalla de Reglas de Comisiones muestra cuanto cobra hoy un vendedor sin
 * regla propia, y si repitiera la regla por su cuenta podria decir un numero y
 * el calculo pagar otro.
 */
describe("resolveEffectivePercentage", () => {
  it("la regla del vendedor le gana a todo", () => {
    expect(
      resolveEffectivePercentage({ sellerRule: 45, userDefault: 35, orgRule: 20 })
    ).toEqual({ percentage: 45, source: "SELLER_RULE" })
  })

  it("sin regla propia manda el default del usuario, no el de la org", () => {
    // El caso de los 6 vendedores de Madero: tienen 50% cargado al crearlos y
    // ninguna regla. Si cayera en la generica de Lozada cobrarian 20%.
    expect(
      resolveEffectivePercentage({ sellerRule: null, userDefault: 50, orgRule: 20 })
    ).toEqual({ percentage: 50, source: "USER_DEFAULT" })
  })

  it("la generica de la org es el ultimo recurso", () => {
    expect(
      resolveEffectivePercentage({ sellerRule: null, userDefault: null, orgRule: 20 })
    ).toEqual({ percentage: 20, source: "ORG_RULE" })
  })

  it("sin ninguna fuente devuelve null, no cero", () => {
    // 0% es una decision; null es que nadie la tomo. El motor de reparto los
    // trata distinto.
    expect(
      resolveEffectivePercentage({ sellerRule: null, userDefault: null, orgRule: null })
    ).toEqual({ percentage: null, source: "NONE" })
  })

  it("un 0 explicito gana sobre las fuentes de abajo", () => {
    // Alguien puso 0% a proposito: heredar el 20% de la org seria pagarle una
    // comision que se decidio no pagar.
    expect(
      resolveEffectivePercentage({ sellerRule: null, userDefault: 0, orgRule: 20 })
    ).toEqual({ percentage: 0, source: "USER_DEFAULT" })
    expect(
      resolveEffectivePercentage({ sellerRule: 0, userDefault: 50, orgRule: 20 })
    ).toEqual({ percentage: 0, source: "SELLER_RULE" })
  })

  it("la regla de la oficina le gana a la regla general del vendedor (VIB-175)", () => {
    // El caso de Lozada: Santi tiene 45% general y 25% en Madero.
    expect(
      resolveEffectivePercentage({
        sellerAgencyRule: 25,
        sellerRule: 45,
        userDefault: 35,
        orgRule: 20,
      })
    ).toEqual({ percentage: 25, source: "SELLER_AGENCY_RULE" })
  })

  it("sin regla de oficina se sigue usando la general", () => {
    expect(
      resolveEffectivePercentage({
        sellerAgencyRule: null,
        sellerRule: 45,
        userDefault: 35,
        orgRule: 20,
      })
    ).toEqual({ percentage: 45, source: "SELLER_RULE" })
  })

  it("un 0 en la oficina es una decisión y gana igual", () => {
    expect(
      resolveEffectivePercentage({
        sellerAgencyRule: 0,
        sellerRule: 45,
        userDefault: 35,
        orgRule: 20,
      })
    ).toEqual({ percentage: 0, source: "SELLER_AGENCY_RULE" })
  })
})

describe("porcentaje por oficina (VIB-175)", () => {
  /**
   * El caso que reportó Yamil: Santiago Nader y Ramiro Airaldi cobran 25% en
   * Madero y 45% en Rosario. Antes de esto, `agency_id` existía en la tabla
   * pero la resolución lo ignoraba, así que ganaba la regla más nueva para las
   * dos oficinas y nadie se enteraba.
   */
  const MADERO = "ag-madero"
  const ROSARIO = "ag-rosario"

  function clientConReglas(rules: Array<{ agency_id: string | null; value: number; valid_from: string }>) {
    return createClient((table, calls) => {
      if (table === "users") {
        return {
          data: [{ id: "santi", name: "Santiago", default_commission_percentage: 35 }],
          error: null,
        }
      }
      if (table === "commission_rules" && !isGenericRuleQuery(calls)) {
        return {
          data: rules.map((r) => ({ seller_id: "santi", ...r })),
          error: null,
        }
      }
      return { data: [], error: null }
    }).client
  }

  const dosReglas = [
    { agency_id: null, value: 45, valid_from: "2026-03-28" },
    { agency_id: MADERO, value: 25, valid_from: "2026-09-01" },
  ]

  it("en Madero cobra 25 aunque su regla general diga 45", async () => {
    const profiles = await resolveSellerCommissionProfiles(
      clientConReglas(dosReglas),
      ORG,
      ["santi"],
      MADERO
    )

    expect(profiles.get("santi")?.percentage).toBe(25)
    expect(profiles.get("santi")?.source).toBe("SELLER_AGENCY_RULE")
  })

  it("en Rosario sigue cobrando 45: la regla de Madero no se mira", async () => {
    const profiles = await resolveSellerCommissionProfiles(
      clientConReglas(dosReglas),
      ORG,
      ["santi"],
      ROSARIO
    )

    expect(profiles.get("santi")?.percentage).toBe(45)
    expect(profiles.get("santi")?.source).toBe("SELLER_RULE")
  })

  it("sin oficina en juego se usa la regla general, no una de oficina cualquiera", async () => {
    // Un caller que no sabe en qué sucursal está no puede elegir entre 25 y 45.
    const profiles = await resolveSellerCommissionProfiles(
      clientConReglas(dosReglas),
      ORG,
      ["santi"]
    )

    expect(profiles.get("santi")?.percentage).toBe(45)
    expect(profiles.get("santi")?.source).toBe("SELLER_RULE")
  })

  it("una regla SOLO de otra oficina no pisa el porcentaje del usuario", async () => {
    // Este era el bug: la regla de Rosario ganaba en Madero por ser la única.
    const profiles = await resolveSellerCommissionProfiles(
      clientConReglas([{ agency_id: ROSARIO, value: 45, valid_from: "2026-03-28" }]),
      ORG,
      ["santi"],
      MADERO
    )

    expect(profiles.get("santi")?.percentage).toBe(35)
    expect(profiles.get("santi")?.source).toBe("USER_DEFAULT")
  })

  it("una regla que ya venció se puede aplicar a su propio período (VIB-181)", async () => {
    /**
     * El caso de Yamil: Victoria pasó a 14% del 01/08 al 31/08. El 3 de
     * septiembre esa regla ya no rige, así que arrastrarla a las comisiones de
     * agosto las recalculaba con el 13% de su ficha y no cambiaba nada — y la
     * pantalla seguía ofreciendo recalcular las mismas 11, para siempre.
     *
     * El fake filtra por vigencia igual que PostgREST: `lte(valid_from, fecha)`
     * y `valid_to >= fecha`.
     */
    const client = createClient((table, calls) => {
      if (table === "users") {
        return {
          data: [{ id: "victoria", name: "Victoria", default_commission_percentage: 13 }],
          error: null,
        }
      }
      if (table === "commission_rules" && !isGenericRuleQuery(calls)) {
        const fecha = arg(calls, "lte", "valid_from")?.[1] as string
        const vigente = fecha >= "2026-08-01" && fecha <= "2026-08-31"
        return {
          data: vigente
            ? [{ seller_id: "victoria", value: 14, valid_from: "2026-08-01", agency_id: null }]
            : [],
          error: null,
        }
      }
      return { data: [], error: null }
    }).client

    // Sin fecha: hoy es septiembre, la regla venció y cae al 13 de la ficha.
    const hoy = await resolveSellerCommissionProfiles(client, ORG, ["victoria"], null, "2026-09-03")
    expect(hoy.get("victoria")?.percentage).toBe(13)
    expect(hoy.get("victoria")?.source).toBe("USER_DEFAULT")

    // Arrastrando la regla a su propio período, se ve el 14.
    const enAgosto = await resolveSellerCommissionProfiles(
      client, ORG, ["victoria"], null, "2026-08-01"
    )
    expect(enAgosto.get("victoria")?.percentage).toBe(14)
    expect(enAgosto.get("victoria")?.source).toBe("SELLER_RULE")
  })

  it("con dos reglas de la misma oficina gana la vigente más reciente", async () => {
    const profiles = await resolveSellerCommissionProfiles(
      clientConReglas([
        { agency_id: MADERO, value: 25, valid_from: "2026-09-01" },
        { agency_id: MADERO, value: 30, valid_from: "2026-01-01" },
      ]),
      ORG,
      ["santi"],
      MADERO
    )

    expect(profiles.get("santi")?.percentage).toBe(25)
  })
})
