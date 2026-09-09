import {
  filterAccessibleChatIds,
  getAccessibleChat,
  scopeDevicesQuery,
  scopeFromAuth,
  type WhaScope,
} from "../access"

const ADMIN: WhaScope = { orgId: "org1", userId: "admin1", isWhaAdmin: true }
const VENDEDOR: WhaScope = { orgId: "org1", userId: "vendedor1", isWhaAdmin: false }

/** Builder mínimo que registra los filtros aplicados. */
function fakeQuery(resultado: any) {
  const filtros: Array<[string, string, any]> = []
  const q: any = {
    filtros,
    select() {
      return q
    },
    eq(k: string, v: any) {
      filtros.push(["eq", k, v])
      return q
    },
    in(k: string, v: any) {
      filtros.push(["in", k, v])
      return q
    },
    maybeSingle() {
      return Promise.resolve({ data: resultado })
    },
    then(res: any) {
      return Promise.resolve({ data: resultado }).then(res)
    },
  }
  return q
}

describe("scopeDevicesQuery", () => {
  it("el admin queda acotado solo por organización", () => {
    const q = scopeDevicesQuery(fakeQuery([]), ADMIN)
    expect(q.filtros).toEqual([["eq", "org_id", "org1"]])
  })

  it("el vendedor queda acotado además por dueño", () => {
    const q = scopeDevicesQuery(fakeQuery([]), VENDEDOR)
    expect(q.filtros).toEqual([
      ["eq", "org_id", "org1"],
      ["eq", "user_id", "vendedor1"],
    ])
  })
})

describe("getAccessibleChat", () => {
  const chat = { id: "chat1", device_id: "dev-ajeno", remote_jid: "x@s.whatsapp.net" }

  function supabaseCon({ chatRow, deviceRow }: { chatRow: any; deviceRow: any }) {
    return {
      from(tabla: string) {
        return fakeQuery(tabla === "wa_chats" ? chatRow : deviceRow)
      },
    }
  }

  it("el admin llega a cualquier chat de su organización", async () => {
    const supabase = supabaseCon({ chatRow: chat, deviceRow: null })
    await expect(getAccessibleChat(supabase, ADMIN, "chat1")).resolves.toEqual(chat)
  })

  it("el vendedor NO llega al chat de un teléfono ajeno", async () => {
    // El chat existe en la org, pero el device no es suyo: la búsqueda del
    // device viene acotada por user_id y no devuelve nada.
    const supabase = supabaseCon({ chatRow: chat, deviceRow: null })
    await expect(getAccessibleChat(supabase, VENDEDOR, "chat1")).resolves.toBeNull()
  })

  it("el vendedor sí llega al chat de su propio teléfono", async () => {
    const supabase = supabaseCon({ chatRow: chat, deviceRow: { id: "dev-propio" } })
    await expect(getAccessibleChat(supabase, VENDEDOR, "chat1")).resolves.toEqual(chat)
  })

  it("un chat de otra organización no existe para nadie", async () => {
    const supabase = supabaseCon({ chatRow: null, deviceRow: { id: "dev" } })
    await expect(getAccessibleChat(supabase, ADMIN, "chat1")).resolves.toBeNull()
  })
})

describe("filterAccessibleChatIds", () => {
  const chats = [
    { id: "mio", device_id: "dev-propio" },
    { id: "ajeno", device_id: "dev-ajeno" },
  ]

  function supabaseCon(devicesPropios: any[]) {
    return {
      from(tabla: string) {
        return fakeQuery(tabla === "wa_chats" ? chats : devicesPropios)
      },
    }
  }

  it("el admin conserva todos los chats de su organización", async () => {
    const ids = await filterAccessibleChatIds(supabaseCon([]), ADMIN, ["mio", "ajeno"])
    expect(ids.sort()).toEqual(["ajeno", "mio"])
  })

  it("el vendedor conserva solo los de su teléfono", async () => {
    const ids = await filterAccessibleChatIds(supabaseCon([{ id: "dev-propio" }]), VENDEDOR, [
      "mio",
      "ajeno",
    ])
    expect(ids).toEqual(["mio"])
  })

  it("sin teléfono propio no accede a ninguno", async () => {
    const ids = await filterAccessibleChatIds(supabaseCon([]), VENDEDOR, ["mio", "ajeno"])
    expect(ids).toEqual([])
  })

  it("lista vacía no consulta nada", async () => {
    const ids = await filterAccessibleChatIds(null, VENDEDOR, [])
    expect(ids).toEqual([])
  })
})

describe("scopeFromAuth", () => {
  it("toma el alcance de lo que devuelve el guard", () => {
    expect(
      scopeFromAuth({ orgId: "org1", user: { id: "u1" }, isWhaAdmin: true })
    ).toEqual({ orgId: "org1", userId: "u1", isWhaAdmin: true })
  })

  it("ante la duda, NO es admin", () => {
    expect(scopeFromAuth({ orgId: "org1", user: { id: "u1" } }).isWhaAdmin).toBe(false)
  })
})
