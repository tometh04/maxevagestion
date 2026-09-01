// app/api/settings/users/[id]/agencies/__tests__/route.test.ts
/**
 * @jest-environment node
 *
 * "Necesito que en el menú de usuarios se pueda editar a qué agencia pertenecen
 * (o a las dos) dentro de una misma organización".
 *
 * La membresía (`user_agencies`) sólo se podía definir al invitar, y es
 * justamente lo que `getUserAgencyIds()` usa para acotar a ADMIN, SELLER y
 * VIEWER: editarla mueve permisos, no es una preferencia cosmética.
 *
 * Lo que fijan estos tests:
 *   1. Sólo roles administradores — incluido ORG_OWNER, que se pierde en las
 *      rutas que comparan `user.role` contra strings (VIB-127).
 *   2. No se puede asignar una agencia de otro tenant, ni editar un usuario de
 *      otro tenant.
 *   3. El usuario no puede quedar sin ninguna agencia.
 *   4. Se escribe el DIFF (alta/baja de las que cambiaron), no un
 *      delete-all + insert del array que manda el cliente: ese patrón es el que
 *      borra colecciones en silencio cuando el form no cargó lo existente.
 *   5. Una membresía hacia una agencia de otra org no se toca.
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
import { PUT } from "../route"

const ORG_ID = "org-1111"
const OTHER_ORG_ID = "org-9999"
const TARGET_USER_ID = "user-1111"
const AGENCY_A = "agency-aaaa"
const AGENCY_B = "agency-bbbb"
const FOREIGN_AGENCY = "agency-zzzz"

interface Recorded {
  table: string
  op: "select" | "insert" | "delete"
  filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }>
  payload?: any
}

let recorded: Recorded[] = []

/**
 * Cliente Supabase mínimo pero fiel en lo que importa: registra qué se filtró y
 * qué se escribió, para poder afirmar cosas sobre el scoping y sobre el diff.
 */
function buildSupabaseMock(datasets: Record<string, any[]>) {
  return {
    from(table: string) {
      const entry: Recorded = { table, op: "select", filters: [] }
      recorded.push(entry)

      const result = () => ({ data: datasets[table] ?? [], error: null })

      const builder: any = {
        select() {
          return builder
        },
        insert(payload: any) {
          entry.op = "insert"
          entry.payload = payload
          return Promise.resolve({ data: null, error: null })
        },
        delete() {
          entry.op = "delete"
          return builder
        },
        eq(column: string, value: unknown) {
          entry.filters.push({ kind: "eq", column, value })
          return builder
        },
        in(column: string, value: unknown) {
          entry.filters.push({ kind: "in", column, value })
          return builder
        },
        maybeSingle() {
          const rows = datasets[table] ?? []
          return Promise.resolve({ data: rows[0] ?? null, error: null })
        },
        then(resolve: any, reject: any) {
          const value = entry.op === "delete" ? { data: null, error: null } : result()
          return Promise.resolve(value).then(resolve, reject)
        },
      }

      return builder
    },
  }
}

function putRequest(body: unknown): any {
  return { json: async () => body }
}

const routeParams = { params: Promise.resolve({ id: TARGET_USER_ID }) }

/** Estado típico: el usuario destino está sólo en la agencia A. */
function defaultDatasets(overrides: Record<string, any[]> = {}) {
  return {
    users: [{ id: TARGET_USER_ID, role: "SELLER", org_id: ORG_ID }],
    agencies: [{ id: AGENCY_A }, { id: AGENCY_B }],
    user_agencies: [{ agency_id: AGENCY_A }],
    audit_logs: [],
    ...overrides,
  }
}

function setup(
  currentUser: Record<string, any>,
  datasets: Record<string, any[]> = defaultDatasets()
) {
  recorded = []
  ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: currentUser })
  ;(createServerClient as jest.Mock).mockResolvedValue(buildSupabaseMock(datasets))
}

const admin = { id: "admin-1", role: "ADMIN", roles: ["ADMIN"], org_id: ORG_ID }

function writesTo(table: string, op: Recorded["op"]) {
  return recorded.filter((r) => r.table === table && r.op === op)
}

describe("PUT /api/settings/users/[id]/agencies", () => {
  it("rechaza a quien no administra la organización", async () => {
    setup({ id: "u-2", role: "VIEWER", roles: ["VIEWER"], org_id: ORG_ID })

    const res = await PUT(putRequest({ agencies: [AGENCY_A] }), routeParams)

    expect(res.status).toBe(403)
    expect(recorded).toHaveLength(0)
  })

  it("deja editar al dueño de la organización (ORG_OWNER) y a quien tiene ADMIN como rol adicional", async () => {
    for (const roles of [["ORG_OWNER"], ["SELLER", "ADMIN"]]) {
      setup({ id: "u-3", role: roles[0], roles, org_id: ORG_ID })

      const res = await PUT(putRequest({ agencies: [AGENCY_A, AGENCY_B] }), routeParams)

      expect(res.status).toBe(200)
    }
  })

  it("no deja al usuario sin ninguna agencia", async () => {
    setup(admin)

    const res = await PUT(putRequest({ agencies: [] }), routeParams)

    expect(res.status).toBe(400)
    expect(writesTo("user_agencies", "delete")).toHaveLength(0)
  })

  it("rechaza un body sin la lista de agencias", async () => {
    setup(admin)

    const res = await PUT(putRequest({}), routeParams)

    expect(res.status).toBe(400)
    expect(recorded).toHaveLength(0)
  })

  it("no deja asignar una agencia de otra organización", async () => {
    setup(admin)

    const res = await PUT(putRequest({ agencies: [AGENCY_A, FOREIGN_AGENCY] }), routeParams)

    expect(res.status).toBe(400)
    expect(writesTo("user_agencies", "insert")).toHaveLength(0)
    expect(writesTo("user_agencies", "delete")).toHaveLength(0)
  })

  it("no deja editar un usuario de otra organización", async () => {
    setup(
      admin,
      defaultDatasets({
        users: [{ id: TARGET_USER_ID, role: "SELLER", org_id: OTHER_ORG_ID }],
      })
    )

    const res = await PUT(putRequest({ agencies: [AGENCY_A] }), routeParams)

    expect(res.status).toBe(404)
    expect(writesTo("user_agencies", "insert")).toHaveLength(0)
    expect(writesTo("user_agencies", "delete")).toHaveLength(0)
  })

  it("agrega la segunda agencia sin tocar la que ya tenía", async () => {
    setup(admin)

    const res = await PUT(putRequest({ agencies: [AGENCY_A, AGENCY_B] }), routeParams)

    expect(res.status).toBe(200)

    const inserts = writesTo("user_agencies", "insert")
    expect(inserts).toHaveLength(1)
    expect(inserts[0].payload).toEqual([{ user_id: TARGET_USER_ID, agency_id: AGENCY_B }])

    // El delete-all + insert es justamente lo que no debe pasar: la fila de la
    // agencia A tiene que sobrevivir sin ser borrada y recreada.
    expect(writesTo("user_agencies", "delete")).toHaveLength(0)
  })

  it("mueve al usuario de una agencia a la otra dando de baja sólo la que salió", async () => {
    setup(admin)

    const res = await PUT(putRequest({ agencies: [AGENCY_B] }), routeParams)

    expect(res.status).toBe(200)

    const deletes = writesTo("user_agencies", "delete")
    expect(deletes).toHaveLength(1)
    expect(deletes[0].filters).toEqual([
      { kind: "eq", column: "user_id", value: TARGET_USER_ID },
      { kind: "in", column: "agency_id", value: [AGENCY_A] },
    ])

    const inserts = writesTo("user_agencies", "insert")
    expect(inserts[0].payload).toEqual([{ user_id: TARGET_USER_ID, agency_id: AGENCY_B }])
  })

  it("no escribe nada si la selección es la que ya tenía", async () => {
    setup(admin)

    const res = await PUT(putRequest({ agencies: [AGENCY_A, AGENCY_A] }), routeParams)

    expect(res.status).toBe(200)
    expect(writesTo("user_agencies", "insert")).toHaveLength(0)
    expect(writesTo("user_agencies", "delete")).toHaveLength(0)
  })

  it("no da de baja una membresía hacia una agencia de otra organización", async () => {
    setup(
      admin,
      defaultDatasets({
        user_agencies: [{ agency_id: AGENCY_A }, { agency_id: FOREIGN_AGENCY }],
      })
    )

    const res = await PUT(putRequest({ agencies: [AGENCY_B] }), routeParams)

    expect(res.status).toBe(200)

    const deletes = writesTo("user_agencies", "delete")
    expect(deletes).toHaveLength(1)
    expect(deletes[0].filters).toContainEqual({
      kind: "in",
      column: "agency_id",
      value: [AGENCY_A],
    })
  })

  it("un ADMIN no puede tocar las agencias de un SUPER_ADMIN", async () => {
    setup(
      admin,
      defaultDatasets({
        users: [{ id: TARGET_USER_ID, role: "SUPER_ADMIN", org_id: ORG_ID }],
      })
    )

    const res = await PUT(putRequest({ agencies: [AGENCY_B] }), routeParams)

    expect(res.status).toBe(403)
    expect(writesTo("user_agencies", "delete")).toHaveLength(0)
  })

  it("scopea la lista de agencias válidas por la org del que edita", async () => {
    setup(admin)

    await PUT(putRequest({ agencies: [AGENCY_B] }), routeParams)

    const agenciesRead = recorded.find((r) => r.table === "agencies")
    expect(agenciesRead?.filters).toContainEqual({
      kind: "eq",
      column: "org_id",
      value: ORG_ID,
    })
  })
})
