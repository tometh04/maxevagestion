/**
 * @jest-environment node
 */

jest.mock("@/lib/permissions/request", () => ({ getRequestPermissions: jest.fn() }))
jest.mock("@/lib/permissions-api", () => ({ canPerformAction: jest.fn() }))
jest.mock("@/lib/addons/guard", () => ({ assertAddonEnabledApi: jest.fn() }))

import crypto from "crypto"
import { NextResponse } from "next/server"

import { GET } from "../route"
import { assertAddonEnabledApi } from "@/lib/addons/guard"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

const mockPerms = getRequestPermissions as jest.Mock
const mockCan = canPerformAction as jest.Mock
const mockAssertAddonEnabledApi = assertAddonEnabledApi as jest.Mock

const SECRET = "secreto-de-prueba"

const USER = {
  id: "user-1",
  org_id: "org-1",
  role: "ADMIN",
  name: "Ana Gómez",
  email: "mypupybox@gmail.com",
}

const ROSARIO = { id: "ag-rosario", name: "Rosario", agente_blanco_network: "lozadarosario" }
const MADERO = { id: "ag-madero", name: "Madero", agente_blanco_network: "lozadamadero" }

/**
 * Stub de Supabase por tabla: `organizations` resuelve con `maybeSingle`,
 * `agencies` con `order` al final de la cadena.
 */
function makeSupabase({
  org = { agente_blanco_org_slug: "lozada-viajes" } as any,
  agencies = [] as any[],
} = {}) {
  return {
    from: jest.fn((table: string) => {
      if (table === "organizations") {
        const b: any = {
          select: () => b,
          eq: () => b,
          maybeSingle: () => Promise.resolve({ data: org, error: null }),
        }
        return b
      }
      const b: any = {
        select: () => b,
        eq: () => b,
        in: () => b,
        not: () => b,
        order: () => Promise.resolve({ data: agencies, error: null }),
      }
      return b
    }),
  }
}

function session(overrides: Record<string, any> = {}) {
  mockPerms.mockResolvedValue({
    user: USER,
    supabase: makeSupabase(),
    agencyIds: [],
    matrix: null,
    ...overrides,
  })
}

function req(query = "") {
  return new Request(`http://localhost/api/agente-blanco/token${query}`)
}

function decodeHeader(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"))
}

function decode(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))
}

async function claimsFrom(query = "") {
  const res = await GET(req(query))
  const { token } = await res.json()
  return decode(token)
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENTE_BLANCO_SECRET = SECRET
  delete process.env.AGENTE_BLANCO_CLIENT_ID
  delete process.env.AGENTE_BLANCO_KEY_ID
  mockCan.mockReturnValue(true)
  // null = complemento habilitado (el guard devuelve la respuesta de corte o null).
  mockAssertAddonEnabledApi.mockResolvedValue(null)
  session()
})

describe("GET /api/agente-blanco/token", () => {
  it("firma el token con el slug de la org de la sesión", async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)

    const { token } = await res.json()
    const claims = decode(token)

    expect(claims.org).toBe("lozada-viajes")
    expect(claims.sub).toBe("user-1")
    expect(claims.iss).toBe("vibook")
    expect(claims.exp - claims.iat).toBe(120)
    expect(claims.jti).toBeTruthy()

    const [h, p, sig] = token.split(".")
    expect(
      crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")
    ).toBe(sig)
  })

  it("nunca cachea la respuesta: el token sirve una sola vez", async () => {
    const res = await GET(req())
    expect(res.headers.get("cache-control")).toContain("no-store")
  })

  it("emite un jti distinto en cada llamada", async () => {
    const a = await claimsFrom()
    const b = await claimsFrom()
    expect(a.jti).not.toBe(b.jti)
  })

  it("403 si el usuario no puede ver leads (incluye al asesor independiente)", async () => {
    mockCan.mockReturnValue(false)
    const res = await GET(req())
    expect(res.status).toBe(403)
  })

  it("404 si la org no tiene el complemento contratado", async () => {
    // Reemplaza al viejo gate por email (soft-launch). Es la puerta real: acá se
    // firma el JWT que abre la bandeja, así que cerrar solo el sidebar dejaría
    // el embebido accesible.
    mockAssertAddonEnabledApi.mockResolvedValueOnce(
      NextResponse.json({ error: "no contratado", code: "addon_required" }, { status: 404 })
    )
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it("el email del usuario ya no decide el acceso", async () => {
    session({ user: { ...USER, email: "otro@lozada.com" } })
    const res = await GET(req())
    expect(res.status).toBe(200)
  })

  it("400 si el usuario no tiene org", async () => {
    session({ user: { ...USER, org_id: null } })
    const res = await GET(req())
    expect(res.status).toBe(400)
  })

  it("404 si la org no tiene el embebido habilitado", async () => {
    session({ supabase: makeSupabase({ org: { agente_blanco_org_slug: null } }) })
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it("404 (y no firma) si el slug guardado tiene formato inválido", async () => {
    session({ supabase: makeSupabase({ org: { agente_blanco_org_slug: "Otra Empresa" } }) })
    const res = await GET(req())
    expect(res.status).toBe(404)
  })

  it("503 si falta el secreto compartido", async () => {
    delete process.env.AGENTE_BLANCO_SECRET
    const res = await GET(req())
    expect(res.status).toBe(503)
  })

  it("lee el slug filtrando por la org de la sesión", async () => {
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn(() =>
        Promise.resolve({ data: { agente_blanco_org_slug: "lozada-viajes" }, error: null })
      ),
    }
    session({ supabase: { from: jest.fn(() => builder) } })

    await GET(req())
    expect(builder.eq).toHaveBeenCalledWith("id", "org-1")
  })
})

describe("claim network (la sucursal)", () => {
  it("con una sola red la manda sin que haya que elegir", async () => {
    session({
      agencyIds: [ROSARIO.id],
      supabase: makeSupabase({ agencies: [ROSARIO] }),
    })
    expect((await claimsFrom()).network).toBe("lozadarosario")
  })

  it("con varias redes usa la agencia pedida", async () => {
    session({
      agencyIds: [ROSARIO.id, MADERO.id],
      supabase: makeSupabase({ agencies: [MADERO, ROSARIO] }),
    })
    expect((await claimsFrom("?agencyId=ag-rosario")).network).toBe("lozadarosario")
    expect((await claimsFrom("?agencyId=ag-madero")).network).toBe("lozadamadero")
  })

  it("con varias redes y sin elegir no manda el claim", async () => {
    // Preferimos que Agente Blanco aplique su default antes que elegir nosotros
    // una sucursal arbitraria.
    session({
      agencyIds: [ROSARIO.id, MADERO.id],
      supabase: makeSupabase({ agencies: [MADERO, ROSARIO] }),
    })
    expect((await claimsFrom()).network).toBeUndefined()
  })

  it("403 si pide una agencia que no es suya", async () => {
    session({
      agencyIds: [ROSARIO.id],
      supabase: makeSupabase({ agencies: [ROSARIO] }),
    })
    const res = await GET(req("?agencyId=ag-de-otro-tenant"))
    expect(res.status).toBe(403)
  })

  it("sin agencias no manda el claim", async () => {
    expect((await claimsFrom()).network).toBeUndefined()
  })
})

describe("name y kid", () => {
  it("manda name, que es lo que se ve en cada mensaje", async () => {
    expect((await claimsFrom()).name).toBe("Ana Gómez")
  })

  it("cae a la parte local del mail si el usuario no tiene nombre cargado", async () => {
    session({ user: { ...USER, name: "   " } })
    expect((await claimsFrom()).name).toBe("mypupybox")
  })

  it("agrega kid al header solo si nos dieron uno", async () => {
    const res = await GET(req())
    const { token } = await res.json()
    expect(decodeHeader(token)).toEqual({ alg: "HS256", typ: "JWT" })

    process.env.AGENTE_BLANCO_KEY_ID = "k-2026-08"
    const res2 = await GET(req())
    const { token: token2 } = await res2.json()
    expect(decodeHeader(token2)).toEqual({ alg: "HS256", typ: "JWT", kid: "k-2026-08" })
  })
})
