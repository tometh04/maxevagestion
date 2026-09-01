import { NextResponse } from "next/server"

import {
  getAgenteBlancoClientId,
  getAgenteBlancoKeyId,
  getAgenteBlancoSecret,
  isAgenteBlancoSoftLaunchUser,
} from "@/lib/agente-blanco/config"
import {
  getAgenteBlancoNetworks,
  getAgenteBlancoOrgSlug,
} from "@/lib/agente-blanco/org"
import { signAgenteBlancoToken } from "@/lib/agente-blanco/token"
import { canPerformAction } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

/**
 * GET /api/agente-blanco/token
 *
 * Handshake del embebido de Conversaciones. Devuelve un JWT HS256 de 2 minutos
 * y un solo uso que el snippet canjea por una sesion de la bandeja.
 *
 * Este endpoint ES la puerta: Agente Blanco confia en la firma y no vuelve a
 * preguntar quien es la persona. Por eso el claim `org` se resuelve del lado
 * del server a partir de la sesion y NUNCA de un parametro del request; si
 * firmaramos `org` con lo que mande el cliente, cualquier usuario logueado
 * abriria la bandeja de cualquier empresa habilitada.
 *
 * Permiso: `leads.read`. La bandeja son las conversaciones del CRM, asi que
 * quien no ve leads tampoco ve los chats — eso deja afuera al asesor
 * independiente (VIB-69), que tiene `leads` en false por techo.
 *
 * Acepta `?agencyId=` para elegir que red (sucursal) abrir. A diferencia de
 * `org`, este SI puede venir del request: se valida contra las agencias que
 * resolvio `getUserAgencyIds`, o sea que solo puede elegir entre las suyas.
 */
export const dynamic = "force-dynamic"

// El token sirve una sola vez: cachearlo (browser, CDN o Next) hace que el
// segundo consumidor reciba un jti ya quemado y se coma un INVALID_TOKEN.
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const

export async function GET(request: Request) {
  const { user, supabase, matrix, agencyIds } = await getRequestPermissions()

  if (!user.org_id) {
    return NextResponse.json(
      { error: "Usuario sin organizacion asociada" },
      { status: 400, headers: NO_STORE }
    )
  }

  if (!canPerformAction(user, "leads", "read", matrix ?? undefined)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE })
  }

  // Soft-launch. Va acá y no solo en el sidebar: esconder el ítem sin cerrar
  // este endpoint dejaría el embebido abierto para toda la org habilitada.
  if (!isAgenteBlancoSoftLaunchUser(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE })
  }

  const orgSlug = await getAgenteBlancoOrgSlug(supabase, user.org_id)
  if (!orgSlug) {
    // La org no tiene el embebido: para ella la seccion no existe.
    return NextResponse.json(
      { error: "La organizacion no tiene Conversaciones habilitado" },
      { status: 404, headers: NO_STORE }
    )
  }

  const secret = getAgenteBlancoSecret()
  if (!secret) {
    console.error("[agente-blanco] falta AGENTE_BLANCO_SECRET; no se puede firmar el token")
    return NextResponse.json(
      { error: "Integracion sin configurar" },
      { status: 503, headers: NO_STORE }
    )
  }

  // Que sucursal abrir. Con una sola red no hace falta elegir; con varias, la
  // pantalla manda el agencyId y sin el Agente Blanco abriria la primera por
  // orden alfabetico, que parece que faltan chats.
  const networks = await getAgenteBlancoNetworks(supabase, user.org_id, agencyIds)
  const requestedAgencyId = new URL(request.url).searchParams.get("agencyId")

  let network: string | null = null
  if (requestedAgencyId) {
    const match = networks.find((n) => n.agencyId === requestedAgencyId)
    if (!match) {
      return NextResponse.json(
        { error: "La agencia no existe o no tiene una red conectada" },
        { status: 403, headers: NO_STORE }
      )
    }
    network = match.network
  } else if (networks.length === 1) {
    network = networks[0].network
  }

  let token: string
  try {
    token = signAgenteBlancoToken(
      {
        clientId: getAgenteBlancoClientId(),
        // Id interno de Vibook: estable de por vida. Si cambiara, la persona
        // aparece como alguien nuevo en Agente Blanco y pierde sus chats.
        userId: user.id,
        orgSlug,
        network,
        // `name` es lo que se ve: firma cada mensaje y aparece en la
        // asignacion de chats. Si el usuario no tiene nombre cargado usamos
        // la parte local del mail antes de dejarlo sin firmar.
        name: user.name?.trim() || user.email?.split("@")[0],
        email: user.email,
        keyId: getAgenteBlancoKeyId(),
      },
      secret
    )
  } catch (err) {
    console.error("[agente-blanco] no se pudo firmar el token", {
      orgId: user.org_id,
      cause: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_STORE })
  }

  return NextResponse.json({ token }, { headers: NO_STORE })
}
