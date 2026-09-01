/**
 * Embebido de Agente Blanco ("Conversaciones").
 *
 * Agente Blanco sirve la bandeja de Instagram/WhatsApp dentro de un iframe.
 * Vibook aporta tres cosas: el slug de la empresa, un endpoint que firma un
 * JWT corto, y la pantalla que monta el snippet.
 *
 * La decision de si alguien puede ver una bandeja se toma ENTERA de este lado:
 * Agente Blanco valida la firma y que la empresa este habilitada, pero no
 * vuelve a preguntar quien es la persona. Por eso el claim `org` sale siempre
 * de la sesion (organizations.agente_blanco_org_slug) y nunca del request.
 */

/**
 * Soft-launch: Conversaciones esta limitado a estos emails mientras se valida
 * en produccion. Mismo criterio que el gate de Eve en el sidebar, pero
 * resuelto server-side y aplicado en las TRES puertas (sidebar, pantalla y
 * endpoint del token): esconder el item sin cerrar la API dejaria el embebido
 * abierto para cualquier usuario de una org habilitada.
 *
 * Para liberar a todas las orgs con slug, borrar esta constante y sus usos en:
 *   app/(dashboard)/layout.tsx, app/(dashboard)/conversaciones/page.tsx y
 *   app/api/agente-blanco/token/route.ts.
 */
const SOFT_LAUNCH_EMAILS = new Set([
  "mypupybox@gmail.com",
  // Cuenta de platform admin: es quien carga el slug en /admin/orgs/<id> y
  // necesita poder verificar que la seccion aparece sin cambiar de sesion.
  "mateoadmin@gmail.com",
])

export function isAgenteBlancoSoftLaunchUser(email: string | null | undefined): boolean {
  if (!email) return false
  return SOFT_LAUNCH_EMAILS.has(email.trim().toLowerCase())
}

/** Formato del slug de empresa en Agente Blanco (ej. "lozada-viajes"). */
export const AGENTE_BLANCO_ORG_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/

export function isValidAgenteBlancoOrgSlug(value: unknown): value is string {
  return typeof value === "string" && AGENTE_BLANCO_ORG_SLUG_REGEX.test(value)
}

/**
 * Identificador de la red conectada (la "sucursal" de Agente Blanco): id de
 * la red, usuario de Instagram o numero de WhatsApp. Formato permisivo a
 * proposito — solo cortamos espacios y caracteres de control.
 *
 * Sin este claim la bandeja abre la primera red por orden alfabetico, que para
 * una empresa con dos redes es arbitrario y parece que faltan chats.
 */
export const AGENTE_BLANCO_NETWORK_REGEX = /^[A-Za-z0-9._+@-]{1,128}$/

export function isValidAgenteBlancoNetwork(value: unknown): value is string {
  return typeof value === "string" && AGENTE_BLANCO_NETWORK_REGEX.test(value)
}

/** `iss` del JWT: el clientId que nos asigna Agente Blanco. */
export function getAgenteBlancoClientId(): string {
  return process.env.AGENTE_BLANCO_CLIENT_ID?.trim() || "vibook"
}

/**
 * `kid` del secreto vigente, opcional. Va en el header del JWT y le sirve a
 * Agente Blanco para saber cual de sus claves firmo cuando algo falla —
 * durante la semana de gracia de una rotacion conviven dos.
 */
export function getAgenteBlancoKeyId(): string | null {
  const kid = process.env.AGENTE_BLANCO_KEY_ID?.trim()
  return kid ? kid : null
}

/**
 * Secreto compartido para firmar el JWT (HS256). Solo backend: si termina en un
 * bundle del cliente, cualquiera firma tokens para cualquier empresa habilitada.
 */
export function getAgenteBlancoSecret(): string | null {
  const secret = process.env.AGENTE_BLANCO_SECRET?.trim()
  return secret ? secret : null
}

/** URL del snippet. Configurable para apuntar a staging de Agente Blanco. */
export const AGENTE_BLANCO_EMBED_SRC =
  process.env.NEXT_PUBLIC_AGENTE_BLANCO_EMBED_SRC ||
  "https://agenteblanco.com.ar/v1/embed.js"

/** Vida del token de handshake. El doc pide 2 minutos y un solo uso. */
export const AGENTE_BLANCO_TOKEN_TTL_SECONDS = 120

/**
 * Errores que emite el snippet via `AgenteBlanco.on('error', ...)`.
 *
 * Los tres primeros son configuracion, no falla: se muestran como estado, no
 * como error rojo. `EMBED_SESSION_EXPIRED` no se muestra — el snippet ya pidio
 * un token nuevo por su cuenta.
 */
export type AgenteBlancoErrorCode =
  | "ADDON_DISABLED"
  // Los dos siguientes los emite el snippet del lado del cliente y no estaban
  // en la tabla del doc; salen de leer embed.js. `TOKEN_PROVIDER_FAILED` es el
  // que vamos a ver si NUESTRO endpoint del token falla, asi que conviene que
  // no se confunda con una firma rechazada.
  | "NO_TOKEN_PROVIDER"
  | "TOKEN_PROVIDER_FAILED"
  | "ORG_NOT_ALLOWED"
  | "NO_NETWORK"
  | "INVALID_TOKEN"
  | "PARTNER_INACTIVE"
  | "EMBED_SESSION_EXPIRED"

export interface AgenteBlancoErrorCopy {
  title: string
  description: string
  /** `info` = configuracion pendiente; `error` = algo se rompio. */
  tone: "info" | "error"
}

const ERROR_COPY: Record<AgenteBlancoErrorCode, AgenteBlancoErrorCopy> = {
  ADDON_DISABLED: {
    title: "Esta empresa no tiene el chat contratado",
    description:
      "Las conversaciones de Instagram y WhatsApp son un adicional de Agente Blanco. Escribinos si querés activarlo.",
    tone: "info",
  },
  ORG_NOT_ALLOWED: {
    title: "La empresa todavía no está habilitada",
    description:
      "Falta un paso de nuestro lado. Avisale al equipo de Vibook y lo destrabamos.",
    tone: "info",
  },
  NO_NETWORK: {
    title: "Todavía no hay una cuenta conectada",
    description:
      "Conectá una cuenta de Instagram o WhatsApp en Agente Blanco y las conversaciones aparecen acá.",
    tone: "info",
  },
  INVALID_TOKEN: {
    title: "No pudimos abrir la bandeja",
    description: "Actualizá la página. Si sigue igual, avisale al equipo de Vibook.",
    tone: "error",
  },
  NO_TOKEN_PROVIDER: {
    title: "No pudimos abrir la bandeja",
    description: "Actualizá la página. Si sigue igual, avisale al equipo de Vibook.",
    tone: "error",
  },
  TOKEN_PROVIDER_FAILED: {
    title: "No pudimos abrir la bandeja",
    description:
      "No pudimos validar tu acceso al chat. Actualizá la página; si sigue igual, avisale al equipo de Vibook.",
    tone: "error",
  },
  PARTNER_INACTIVE: {
    title: "La integración está pausada",
    description: "Avisale al equipo de Vibook para reactivarla.",
    tone: "error",
  },
  EMBED_SESSION_EXPIRED: {
    title: "La sesión venció",
    description: "Estamos reconectando.",
    tone: "info",
  },
}

const UNKNOWN_ERROR_COPY: AgenteBlancoErrorCopy = {
  title: "No pudimos abrir la bandeja",
  description: "Actualizá la página. Si sigue igual, avisale al equipo de Vibook.",
  tone: "error",
}

export function describeAgenteBlancoError(code: string | undefined | null): AgenteBlancoErrorCopy {
  if (!code) return UNKNOWN_ERROR_COPY
  return ERROR_COPY[code as AgenteBlancoErrorCode] ?? UNKNOWN_ERROR_COPY
}

/**
 * `EMBED_SESSION_EXPIRED` llega cada 12 horas y el snippet se recupera solo
 * pidiendo otro token: no hay que pintar nada.
 */
export function isSilentAgenteBlancoError(code: string | undefined | null): boolean {
  return code === "EMBED_SESSION_EXPIRED"
}
