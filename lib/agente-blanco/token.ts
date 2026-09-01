import crypto from "crypto"

import {
  AGENTE_BLANCO_TOKEN_TTL_SECONDS,
  isValidAgenteBlancoNetwork,
  isValidAgenteBlancoOrgSlug,
} from "@/lib/agente-blanco/config"

/**
 * Firma del JWT de handshake con Agente Blanco.
 *
 * HS256 a mano con `node:crypto` en vez de sumar `jsonwebtoken`: son 15 lineas,
 * el repo ya firma/verifica HMAC asi (lib/integrations/hmac.ts) y evita meter
 * una dependencia mas en el bundle server.
 */

export interface AgenteBlancoTokenClaims {
  /** clientId que nos dio Agente Blanco. */
  iss: string
  /** Id interno del usuario en Vibook. Tiene que ser ESTABLE. */
  sub: string
  /** Slug de la empresa en Agente Blanco. Sale de la sesion, nunca del request. */
  org: string
  /**
   * Que red (sucursal) abrir. Opcional: sin esto Agente Blanco muestra la
   * primera por orden alfabetico, que en una empresa con dos redes es
   * arbitrario. Si mandamos una que no es de la empresa, responden NO_NETWORK.
   */
  network?: string
  /** Nombre con el que se firman los mensajes que mande. */
  name?: string
  email?: string
  /** Un solo uso: el segundo intento con el mismo jti se rechaza. */
  jti: string
  iat: number
  exp: number
}

export interface BuildTokenInput {
  clientId: string
  userId: string
  orgSlug: string
  name?: string | null
  email?: string | null
  /** Red de la agencia elegida. Se omite si la empresa tiene una sola. */
  network?: string | null
  /** `kid` del secreto vigente. Se omite si no nos dieron uno. */
  keyId?: string | null
  /** Segundos desde epoch. Inyectable para tests. */
  nowSeconds?: number
  ttlSeconds?: number
  jti?: string
}

export function buildAgenteBlancoClaims({
  clientId,
  userId,
  orgSlug,
  name,
  email,
  network,
  nowSeconds,
  ttlSeconds = AGENTE_BLANCO_TOKEN_TTL_SECONDS,
  jti,
}: BuildTokenInput): AgenteBlancoTokenClaims {
  if (!clientId) throw new Error("agente-blanco: falta clientId")
  if (!userId) throw new Error("agente-blanco: falta userId")
  if (!isValidAgenteBlancoOrgSlug(orgSlug)) {
    throw new Error("agente-blanco: slug de empresa invalido")
  }

  const iat = Math.floor(nowSeconds ?? Date.now() / 1000)

  const claims: AgenteBlancoTokenClaims = {
    iss: clientId,
    sub: userId,
    org: orgSlug,
    jti: jti ?? crypto.randomUUID(),
    iat,
    exp: iat + ttlSeconds,
  }

  // Claims opcionales: se omiten si vienen vacios en vez de mandar "" o null.
  // `name` es el que se ve: firma cada mensaje que manda la persona y aparece
  // en la asignacion de chats, asi que el caller deberia mandar siempre algo.
  const trimmedName = name?.trim()
  if (trimmedName) claims.name = trimmedName
  const trimmedEmail = email?.trim()
  if (trimmedEmail) claims.email = trimmedEmail

  const trimmedNetwork = network?.trim()
  if (trimmedNetwork) {
    if (!isValidAgenteBlancoNetwork(trimmedNetwork)) {
      throw new Error("agente-blanco: identificador de red invalido")
    }
    claims.network = trimmedNetwork
  }

  return claims
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url")
}

/** JWT compacto HS256. `keyId` agrega el `kid` al header si lo tenemos. */
export function signHs256Jwt(claims: object, secret: string, keyId?: string | null): string {
  if (!secret) throw new Error("agente-blanco: falta el secreto de firma")
  const trimmedKeyId = keyId?.trim()
  const header = base64url(
    JSON.stringify(
      trimmedKeyId
        ? { alg: "HS256", typ: "JWT", kid: trimmedKeyId }
        : { alg: "HS256", typ: "JWT" }
    )
  )
  const payload = base64url(JSON.stringify(claims))
  const signingInput = `${header}.${payload}`
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url")
  return `${signingInput}.${signature}`
}

export function signAgenteBlancoToken(input: BuildTokenInput, secret: string): string {
  return signHs256Jwt(buildAgenteBlancoClaims(input), secret, input.keyId)
}
