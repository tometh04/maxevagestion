import crypto from "crypto"

import {
  describeAgenteBlancoError,
  isAgenteBlancoSoftLaunchUser,
  isSilentAgenteBlancoError,
  isValidAgenteBlancoNetwork,
  isValidAgenteBlancoOrgSlug,
} from "@/lib/agente-blanco/config"
import {
  buildAgenteBlancoClaims,
  signAgenteBlancoToken,
  signHs256Jwt,
} from "@/lib/agente-blanco/token"

const SECRET = "un-secreto-compartido-de-prueba"

function decode(part: string): any {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"))
}

function verify(token: string, secret: string): boolean {
  const [header, payload, signature] = token.split(".")
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url")
  return signature === expected
}

const BASE = {
  clientId: "vibook",
  userId: "8f5ace24-607f-4ccd-b883-eb04b2ab36e3",
  orgSlug: "lozada-viajes",
  name: "Ana Gómez",
  email: "ana@lozada.com",
  nowSeconds: 1_800_000_000,
}

describe("signAgenteBlancoToken", () => {
  it("firma un JWT HS256 verificable con el secreto compartido", () => {
    const token = signAgenteBlancoToken(BASE, SECRET)
    const [header, payload] = token.split(".")

    expect(token.split(".")).toHaveLength(3)
    expect(decode(header)).toEqual({ alg: "HS256", typ: "JWT" })
    expect(verify(token, SECRET)).toBe(true)
    expect(verify(token, "otro-secreto")).toBe(false)
    expect(decode(payload).org).toBe("lozada-viajes")
  })

  it("usa base64url sin padding (el JWT no puede llevar '=' ni '+')", () => {
    const token = signAgenteBlancoToken(BASE, SECRET)
    expect(token).not.toMatch(/[=+/]/)
  })

  it("no firma sin secreto", () => {
    expect(() => signHs256Jwt({ a: 1 }, "")).toThrow(/secreto/i)
  })
})

describe("buildAgenteBlancoClaims", () => {
  it("vence a los 2 minutos", () => {
    const claims = buildAgenteBlancoClaims(BASE)
    expect(claims.iat).toBe(1_800_000_000)
    expect(claims.exp).toBe(1_800_000_000 + 120)
  })

  it("emite un jti distinto por llamada (el token sirve una sola vez)", () => {
    const a = buildAgenteBlancoClaims(BASE)
    const b = buildAgenteBlancoClaims(BASE)
    expect(a.jti).not.toBe(b.jti)
  })

  it("manda el id interno de Vibook como sub, estable entre llamadas", () => {
    const a = buildAgenteBlancoClaims(BASE)
    const b = buildAgenteBlancoClaims(BASE)
    expect(a.sub).toBe(BASE.userId)
    expect(b.sub).toBe(BASE.userId)
  })

  it("rechaza un slug de empresa que no respeta el formato", () => {
    // Si esto pasara, firmaríamos un claim `org` con basura — o peor, con algo
    // que del otro lado resuelve a otra bandeja.
    for (const orgSlug of ["Lozada Viajes", "lozada_viajes", "-lozada", "lozada-", "", "../otra"]) {
      expect(() => buildAgenteBlancoClaims({ ...BASE, orgSlug })).toThrow(/slug/i)
    }
  })

  it("omite name/email vacíos en vez de mandarlos en blanco", () => {
    const claims = buildAgenteBlancoClaims({ ...BASE, name: "   ", email: null })
    expect(claims).not.toHaveProperty("name")
    expect(claims).not.toHaveProperty("email")
  })

  it("exige clientId y userId", () => {
    expect(() => buildAgenteBlancoClaims({ ...BASE, clientId: "" })).toThrow(/clientId/)
    expect(() => buildAgenteBlancoClaims({ ...BASE, userId: "" })).toThrow(/userId/)
  })
})

describe("isValidAgenteBlancoOrgSlug", () => {
  it("acepta los slugs que emite Agente Blanco", () => {
    expect(isValidAgenteBlancoOrgSlug("lozada-viajes")).toBe(true)
    expect(isValidAgenteBlancoOrgSlug("kyo")).toBe(true)
    expect(isValidAgenteBlancoOrgSlug("agencia123")).toBe(true)
  })

  it("rechaza mayúsculas, espacios y no-strings", () => {
    expect(isValidAgenteBlancoOrgSlug("Lozada")).toBe(false)
    expect(isValidAgenteBlancoOrgSlug("lozada viajes")).toBe(false)
    expect(isValidAgenteBlancoOrgSlug(null)).toBe(false)
    expect(isValidAgenteBlancoOrgSlug(123)).toBe(false)
  })
})

describe("isAgenteBlancoSoftLaunchUser", () => {
  it("habilita solo al usuario del soft-launch", () => {
    expect(isAgenteBlancoSoftLaunchUser("mypupybox@gmail.com")).toBe(true)
    expect(isAgenteBlancoSoftLaunchUser("otro@lozada.com")).toBe(false)
  })

  it("normaliza mayúsculas y espacios", () => {
    expect(isAgenteBlancoSoftLaunchUser("  MyPupyBox@Gmail.com ")).toBe(true)
  })

  it("rechaza email vacío o ausente", () => {
    expect(isAgenteBlancoSoftLaunchUser(null)).toBe(false)
    expect(isAgenteBlancoSoftLaunchUser(undefined)).toBe(false)
    expect(isAgenteBlancoSoftLaunchUser("")).toBe(false)
  })
})

describe("errores del embebido", () => {
  it("trata la config pendiente como estado y no como falla", () => {
    expect(describeAgenteBlancoError("ADDON_DISABLED").tone).toBe("info")
    expect(describeAgenteBlancoError("NO_NETWORK").tone).toBe("info")
    expect(describeAgenteBlancoError("INVALID_TOKEN").tone).toBe("error")
  })

  it("no muestra nada cuando vence la sesión de 12 h (el snippet se recupera solo)", () => {
    expect(isSilentAgenteBlancoError("EMBED_SESSION_EXPIRED")).toBe(true)
    expect(isSilentAgenteBlancoError("INVALID_TOKEN")).toBe(false)
  })

  it("distingue el fallo de NUESTRO endpoint del token", () => {
    // TOKEN_PROVIDER_FAILED lo emite el snippet cuando el resolver tira: es el
    // sintoma de que /api/agente-blanco/token respondio mal, no de una firma
    // rechazada por Agente Blanco.
    const copy = describeAgenteBlancoError("TOKEN_PROVIDER_FAILED")
    expect(copy.tone).toBe("error")
    expect(copy.description).toMatch(/acceso/i)
    expect(describeAgenteBlancoError("NO_TOKEN_PROVIDER").tone).toBe("error")
  })

  it("cae en un mensaje genérico ante un código desconocido", () => {
    expect(describeAgenteBlancoError("ALGO_NUEVO").tone).toBe("error")
    expect(describeAgenteBlancoError(undefined).title).toBeTruthy()
  })
})

describe("claim network", () => {
  it("lo incluye cuando se elige una sucursal", () => {
    const claims = buildAgenteBlancoClaims({ ...BASE, network: "lozadaviajesrosario" })
    expect(claims.network).toBe("lozadaviajesrosario")
  })

  it("lo omite cuando la empresa tiene una sola red", () => {
    expect(buildAgenteBlancoClaims(BASE)).not.toHaveProperty("network")
    expect(buildAgenteBlancoClaims({ ...BASE, network: "  " })).not.toHaveProperty("network")
  })

  it("rechaza un identificador de red con espacios o basura", () => {
    for (const network of ["lozada rosario", "red/otra", "a".repeat(129)]) {
      expect(() => buildAgenteBlancoClaims({ ...BASE, network })).toThrow(/red/i)
    }
  })
})

describe("isValidAgenteBlancoNetwork", () => {
  it("acepta id, usuario de Instagram y teléfono", () => {
    expect(isValidAgenteBlancoNetwork("lozadaviajesrosario")).toBe(true)
    // Los usuarios de Instagram llevan punto y guion bajo.
    expect(isValidAgenteBlancoNetwork("lozada.viajes_ok")).toBe(true)
    expect(isValidAgenteBlancoNetwork("+5493411234567")).toBe(true)
    expect(isValidAgenteBlancoNetwork("net-1234")).toBe(true)
  })

  it("rechaza espacios y no-strings", () => {
    expect(isValidAgenteBlancoNetwork("con espacio")).toBe(false)
    expect(isValidAgenteBlancoNetwork(null)).toBe(false)
  })
})

describe("kid en el header", () => {
  it("lo agrega solo cuando hay uno", () => {
    const header = (token: string) =>
      JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"))

    expect(header(signHs256Jwt({ a: 1 }, SECRET))).toEqual({ alg: "HS256", typ: "JWT" })
    expect(header(signHs256Jwt({ a: 1 }, SECRET, "k-2026-08"))).toEqual({
      alg: "HS256",
      typ: "JWT",
      kid: "k-2026-08",
    })
    expect(header(signHs256Jwt({ a: 1 }, SECRET, "   "))).toEqual({ alg: "HS256", typ: "JWT" })
  })

  it("cambia la firma, porque el header entra en el signing input", () => {
    const a = signHs256Jwt({ a: 1 }, SECRET)
    const b = signHs256Jwt({ a: 1 }, SECRET, "k-2026-08")
    expect(a).not.toBe(b)
  })
})
