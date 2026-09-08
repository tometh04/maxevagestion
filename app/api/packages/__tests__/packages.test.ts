/**
 * @jest-environment node
 *
 * API de paquetes cerrados (VIB-183).
 *
 * El cupo en sí lo defiende la base (lock + conteo derivado dentro de las RPC),
 * y eso está probado contra el esquema real. Lo que se fija acá es lo que la
 * ruta agrega encima:
 *
 *  - que un paquete de otra org no exista para este usuario;
 *  - que el `p_org_id` que llega a la RPC salga de la sesión y NUNCA del body;
 *  - que un vendedor pueda ver paquetes pero no armarlos;
 *  - que una lista de ítems vacía no borre las patas del paquete sin
 *    confirmación explícita (el "collection replace hazard" que ya se cobró los
 *    tramos de dos operaciones en 2026-07);
 *  - que el motivo del rechazo del cupo llegue al usuario en vez de volverse un
 *    500 genérico.
 */

import { GET as listar, POST as crear } from "@/app/api/packages/route"
import { PATCH as editar, DELETE as borrar } from "@/app/api/packages/[id]/route"
import { getRequestPermissions } from "@/lib/permissions/request"

jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))

const PKG = "3f1d9b5a-1c2e-4a7b-9d3f-8e5c6a7b1d2e"
const ORG = "11111111-1111-1111-1111-111111111111"
const ORG_AJENA = "99999999-9999-9999-9999-999999999999"
const OPERADOR = "22222222-2222-2222-2222-222222222222"

/** Llamadas a RPC de la corrida actual. */
let rpcCalls: { fn: string; args: any }[] = []

interface Config {
  role?: string
  /** Resultado por tabla; función para distinguir select/insert/update/delete. */
  tables?: Record<string, any>
  rpc?: Record<string, (args: any) => any>
}

function setup(config: Config = {}) {
  rpcCalls = []
  const { role = "ADMIN", tables = {}, rpc = {} } = config

  const supabase: any = {
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args })
      return rpc[fn] ? rpc[fn](args) : { data: [], error: null }
    },
    from: (table: string) => {
      const state: { op: string; values?: any } = { op: "select" }
      const resolve = () => {
        const entry = tables[table]
        const result = typeof entry === "function" ? entry(state.op, state.values) : entry
        return result ?? { data: null, error: null, count: 0 }
      }
      const q: any = {
        select: () => q,
        insert: (values: any) => {
          state.op = "insert"
          state.values = values
          return q
        },
        update: (values: any) => {
          state.op = "update"
          state.values = values
          return q
        },
        delete: () => {
          state.op = "delete"
          return q
        },
        eq: () => q,
        or: () => q,
        is: () => q,
        in: () => q,
        limit: () => q,
        order: () => q,
        maybeSingle: async () => resolve(),
        single: async () => resolve(),
        then: (onOk: any, onErr: any) => Promise.resolve(resolve()).then(onOk, onErr),
      }
      return q
    },
  }

  ;(getRequestPermissions as jest.Mock).mockResolvedValue({
    user: { id: "u-1", role, roles: [role], org_id: ORG },
    supabase,
    agencyIds: [],
    matrix: null,
  })
}

const req = (body: any) => ({ json: async () => body }) as any
const ctx = { params: Promise.resolve({ id: PKG }) }

/** Paquete existente, con 2 patas ya cargadas y 10 plazas. */
const paqueteExistente = (op: string) =>
  op === "select"
    ? { data: { id: PKG, total_quota: 10 }, error: null, count: 2 }
    : { data: null, error: null }

beforeEach(() => jest.clearAllMocks())

describe("permisos", () => {
  it("un vendedor puede ver los paquetes: sin eso, no puede elegir uno al vender", async () => {
    setup({ role: "SELLER", tables: { travel_packages: { data: [], error: null } } })
    const res: any = await listar(new Request("http://x/api/packages"))
    expect(res.status).toBe(200)
  })

  it("un vendedor no puede crear paquetes", async () => {
    setup({ role: "SELLER" })
    const res: any = await crear(req({ name: "Cancún", total_quota: 10 }))
    expect(res.status).toBe(403)
    expect(rpcCalls).toHaveLength(0)
  })

  it("un vendedor no puede editar paquetes", async () => {
    setup({ role: "SELLER" })
    const res: any = await editar(req({ total_quota: 5 }), ctx)
    expect(res.status).toBe(403)
    expect(rpcCalls).toHaveLength(0)
  })

  it("un ADMIN no puede borrar paquetes: el borrado es del dueño del tenant", async () => {
    setup({ role: "ADMIN", tables: { travel_packages: paqueteExistente } })
    const res: any = await borrar({} as any, ctx)
    expect(res.status).toBe(403)
  })
})

describe("aislamiento entre organizaciones", () => {
  it("un paquete de otra org devuelve 404, no 200 vacío", async () => {
    // fetchPackageById filtra por org_id, así que para este usuario no existe.
    setup({ role: "ORG_OWNER", tables: { travel_packages: { data: null, error: null } } })
    const res: any = await editar(req({ name: "Robado" }), ctx)
    expect(res.status).toBe(404)
  })

  it("el p_org_id de la RPC sale de la sesión, nunca del body", async () => {
    setup({
      role: "ORG_OWNER",
      tables: { travel_packages: paqueteExistente, travel_package_items: { count: 2, error: null } },
      rpc: { replace_travel_package_items: () => ({ data: 1, error: null }) },
    })

    await editar(
      req({
        // Un cliente hostil manda la org de otro tenant en el payload.
        org_id: ORG_AJENA,
        p_org_id: ORG_AJENA,
        items: [{ operator_id: OPERADOR, cost: 100 }],
        items_replace: true,
      }),
      ctx
    )

    const llamada = rpcCalls.find((c) => c.fn === "replace_travel_package_items")
    expect(llamada?.args.p_org_id).toBe(ORG)
    expect(llamada?.args.p_org_id).not.toBe(ORG_AJENA)
  })
})

describe("reemplazo de las patas del paquete", () => {
  const conItems = {
    travel_packages: paqueteExistente,
    travel_package_items: { count: 2, error: null },
  }

  it("una lista vacía SIN confirmación no borra nada y avisa", async () => {
    setup({ role: "ORG_OWNER", tables: conItems })

    const res: any = await editar(req({ items: [] }), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(rpcCalls.some((c) => c.fn === "replace_travel_package_items")).toBe(false)
    expect(body.warnings?.[0]).toMatch(/Se conservaron 2 ítem/)
  })

  it("una lista vacía CON items_replace sí reemplaza", async () => {
    setup({
      role: "ORG_OWNER",
      tables: conItems,
      rpc: { replace_travel_package_items: () => ({ data: 0, error: null }) },
    })

    const res: any = await editar(req({ items: [], items_replace: true }), ctx)

    expect(res.status).toBe(200)
    expect(rpcCalls.some((c) => c.fn === "replace_travel_package_items")).toBe(true)
  })

  it("un PATCH que no menciona items no toca las patas", async () => {
    setup({ role: "ORG_OWNER", tables: conItems })

    const res: any = await editar(req({ name: "Cancún alta temporada" }), ctx)

    expect(res.status).toBe(200)
    expect(rpcCalls.some((c) => c.fn === "replace_travel_package_items")).toBe(false)
  })
})

describe("cupo", () => {
  it("bajarlo por debajo de lo vendido devuelve 409 con el motivo, no un 500", async () => {
    setup({
      role: "ORG_OWNER",
      tables: { travel_packages: paqueteExistente },
      rpc: {
        set_travel_package_quota: () => ({
          data: null,
          error: {
            code: "P4302",
            message: "travel package quota below consumed",
            details: JSON.stringify({
              code: "TRAVEL_PACKAGE_QUOTA_BELOW_CONSUMED",
              total_quota: 2,
              consumed: 7,
            }),
          },
        }),
      },
    })

    const res: any = await editar(req({ total_quota: 2 }), ctx)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain("7")
    expect(body.detail?.consumed).toBe(7)
  })

  it("no llama a la RPC si el cupo no cambió", async () => {
    setup({ role: "ORG_OWNER", tables: { travel_packages: paqueteExistente } })

    await editar(req({ total_quota: 10 }), ctx)

    expect(rpcCalls.some((c) => c.fn === "set_travel_package_quota")).toBe(false)
  })

  it("el cupo nunca se escribe como una columna más", async () => {
    let updateValues: any = null
    setup({
      role: "ORG_OWNER",
      tables: {
        travel_packages: (op: string, values: any) => {
          if (op === "update") updateValues = values
          return paqueteExistente(op)
        },
      },
      rpc: { set_travel_package_quota: () => ({ data: {}, error: null }) },
    })

    await editar(req({ total_quota: 25, name: "Cancún" }), ctx)

    expect(rpcCalls.some((c) => c.fn === "set_travel_package_quota")).toBe(true)
    expect(updateValues).not.toBeNull()
    expect(updateValues.total_quota).toBeUndefined()
  })
})

describe("borrado", () => {
  it("un paquete con ventas no se borra: se cierra", async () => {
    setup({
      role: "ORG_OWNER",
      tables: {
        travel_packages: paqueteExistente,
        travel_package_bookings: { count: 3, error: null },
      },
    })

    const res: any = await borrar({} as any, ctx)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/3 venta/)
    expect(body.error).toMatch(/Cerralo/)
  })

  it("un paquete sin ventas se borra", async () => {
    setup({
      role: "ORG_OWNER",
      tables: {
        travel_packages: paqueteExistente,
        travel_package_bookings: { count: 0, error: null },
      },
    })

    const res: any = await borrar({} as any, ctx)

    expect(res.status).toBe(200)
  })
})

describe("validación", () => {
  it("rechaza un cupo negativo", async () => {
    setup({ role: "ORG_OWNER" })
    const res: any = await crear(req({ name: "Cancún", total_quota: -1 }))
    expect(res.status).toBe(400)
  })

  it("rechaza el regreso anterior a la salida", async () => {
    setup({ role: "ORG_OWNER" })
    const res: any = await crear(
      req({
        name: "Cancún",
        total_quota: 10,
        departure_date: "2026-10-10",
        return_date: "2026-10-01",
      })
    )
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/regreso/)
  })
})
